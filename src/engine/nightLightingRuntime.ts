import * as THREE from 'three';
import { LAMP_LIGHT_DECAY } from './lampLightShape.ts';

type NightLightKind = 'headlight' | 'building' | 'shtora' | 'marker';
type LocalPoint = readonly [number, number, number];

/** Only dedicated lamp materials or a proven semantic lamp-mask shader belong
 * here, never unmasked shared glass/armor. Registration does not clone,
 * construct or own the authored material.
 */
export interface NightLightEmitter {
  readonly kind: NightLightKind;
  readonly position: LocalPoint;
  readonly direction?: LocalPoint;
  readonly color?: number;
  readonly intensity?: number;
  readonly range?: number;
  /**
   * Release 227 (round 4; the critic on the Zubr II's station illuminator: "the warm ground pool has the same position
   * and shape in all five station states"): a weapon searchlight, boresighted with the station that carries it. It
   * keeps its authored aim (no low-beam drop), lights its own narrow cone (`coneRad`, the spot's half-angle), and on a
   * pool wider than one vehicle's two sides (desktop's four spots) it ranks half a priority step ahead of its vehicle's
   * driving lamps, so it holds a beam while their two sides keep theirs; on a two-spot pool (mobile) it ranks half a
   * step behind them, which keep both spots.
   */
  readonly searchlight?: boolean;
  readonly coneRad?: number;
  /** Construction-time callback for a destructible lamp or emissive fitting. */
  readonly isActive?: () => boolean;
  readonly emission?: {
    readonly material: THREE.MeshStandardMaterial;
    readonly color: number;
    readonly intensity: number;
  };
}

export interface NightLightingRoot {
  readonly root: THREE.Object3D;
  /** In addition to actual scene visibility, admit only alive/spotted actors. */
  readonly isActive?: () => boolean;
  /** Player = 1, ordinary actors/buildings = 0. Higher priority wins locally. */
  readonly priority?: number;
}

export interface NightLightingBudget {
  readonly spotLights: number;
  readonly pointLights: number;
}

interface EmissionState {
  readonly material: THREE.MeshStandardMaterial;
  readonly originalColor: THREE.Color;
  readonly originalIntensity: number;
  readonly nightColor: THREE.Color;
  readonly nightIntensity: number;
  active: boolean;
  applied: boolean;
}

interface EmitterState {
  readonly anchor: THREE.Object3D;
  readonly source: NightLightingRoot;
  readonly emitter: NightLightEmitter;
  readonly emission: EmissionState | null;
  /** A headlight's own vehicle's gun (registerNightBeamClearance), which its beam must not light. */
  readonly clearance: ClearanceState | null;
  readonly position: THREE.Vector3;
  readonly direction: THREE.Vector3;
  active: boolean;
  distanceSquared: number;
}

interface ClearanceState {
  readonly gun: THREE.Object3D;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly radius: number;
}

interface LightSlot<T extends THREE.SpotLight | THREE.PointLight> {
  readonly light: T;
  source: EmitterState | null;
}

const REGISTRATIONS = new WeakMap<THREE.Object3D, readonly NightLightEmitter[]>();
const CLEARANCES = new WeakMap<THREE.Object3D, ClearanceState>();
const MAX_EMITTERS = 1024;
const DEFAULT_BUDGET = Object.freeze({ spotLights: 2, pointLights: 1 });

function requirePoint(value: LocalPoint | undefined, label: string): void {
  if (!value || value.length !== 3 || value.some(n => !Number.isFinite(n))) {
    throw new RangeError(`Night light ${label} must contain three finite coordinates`);
  }
}

function requireBounded(value: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`Night light ${label} is outside 0..${maximum}`);
  }
}

function validateEmitter(emitter: NightLightEmitter): void {
  if (!['headlight', 'building', 'shtora', 'marker'].includes(emitter.kind)) {
    throw new TypeError('Unknown night light kind');
  }
  requirePoint(emitter.position, 'position');
  if (emitter.direction) {
    requirePoint(emitter.direction, 'direction');
    if (Math.hypot(...emitter.direction) < 1e-6) throw new RangeError('Night light direction must be nonzero');
  }
  // (release 227, round 7: a weapon searchlight's narrow beam throws up to 6,000 cd to 150 m; a driving lamp's stays
  // within 2,000 cd and 100 m)
  requireBounded(emitter.intensity ?? 80, emitter.kind === 'headlight' ? emitter.searchlight ? 6000 : 2000 : 300, 'intensity');
  requireBounded(emitter.range ?? 42, emitter.searchlight ? 150 : 100, 'range');
  requireBounded(emitter.color ?? 0xffe2ad, 0xffffff, 'color');
  if (emitter.coneRad !== undefined && !(emitter.coneRad > 0 && emitter.coneRad <= HEADLIGHT_CONE_RAD)) {
    throw new RangeError('Night light cone must be a positive half-angle no wider than a driving lamp\'s');
  }
  if (emitter.searchlight && emitter.kind !== 'headlight') throw new TypeError('Only a lamp casting a beam can be a searchlight');
  if (emitter.emission) {
    if (!emitter.emission.material?.isMeshStandardMaterial) throw new TypeError('Night light requires a dedicated emissive material');
    requireBounded(emitter.emission.intensity, 8, 'emission intensity');
    requireBounded(emitter.emission.color, 0xffffff, 'emission color');
  }
}

/** Construction-time semantic registration. Weak ownership does not retain a
 * released tank/map and functions are not put into serializable userData.
 * Replacing registrations affects the next covered prepare, not a live frame.
 */
export function registerNightLightEmitters(anchor: THREE.Object3D, emitters: readonly NightLightEmitter[]): void {
  if (!anchor?.isObject3D) throw new TypeError('Night lights require an Object3D anchor');
  if (emitters.length > MAX_EMITTERS) throw new RangeError('Night light registration exceeds bounded capacity');
  for (const emitter of emitters) validateEmitter(emitter);
  REGISTRATIONS.set(anchor, emitters.map(emitter => Object.freeze({
    ...emitter,
    position: Object.freeze([...emitter.position]) as LocalPoint,
    direction: emitter.direction ? Object.freeze([...emitter.direction]) as LocalPoint : undefined,
    emission: emitter.emission ? Object.freeze({ ...emitter.emission }) : undefined,
  })));
}

/**
 * (CN-7, 2026-10-20: "the main-gun barrel seen from the front shows as a bright white glowing tube") A vehicle's own
 * gun, which the beams of the headlights under `owner` (its root) must not light: lamps beside the gun (turret lamps
 * flanking the mantlet) put the tube 2-5 m into their cone, where a 1200 cd beam outshines everything else in the frame.
 * The capsule (`start`/`end` on the bore axis and `radius`, in `gun`'s frame: the recoiling rig, so it follows
 * traverse, elevation and recoil) bounds the gun's surface. The beams keep their aim, cone, intensity and reach: the
 * vehicle shader (NIGHT_OWN_GUN_GLSL) drops a lamp's light only on its own gun. Construction-time, like
 * registerNightLightEmitters.
 */
export function registerNightBeamClearance(owner: THREE.Object3D, gun: THREE.Object3D,
  capsule: { readonly start: LocalPoint; readonly end: LocalPoint; readonly radius: number }): void {
  if (!owner?.isObject3D || !gun?.isObject3D) throw new TypeError('Night beam clearance requires Object3D owners');
  requirePoint(capsule.start, 'clearance start'); requirePoint(capsule.end, 'clearance end');
  requireBounded(capsule.radius, 2, 'clearance radius');
  CLEARANCES.set(owner, Object.freeze({ gun, start: new THREE.Vector3(...capsule.start), end: new THREE.Vector3(...capsule.end),
    radius: capsule.radius }));
}

/** The clearance registered on `owner` itself, for a copy of its vehicle to register its own (copyVehicleNightLighting). */
export function nightBeamClearanceOf(owner: THREE.Object3D): Readonly<ClearanceState> | null {
  return CLEARANCES.get(owner) ?? null;
}

/** The clearance of the nearest owner above `anchor` (its own vehicle), shared by every lamp of that vehicle. */
function clearanceFor(anchor: THREE.Object3D): ClearanceState | null {
  for (let owner: THREE.Object3D | null = anchor; owner; owner = owner.parent) {
    const clearance = CLEARANCES.get(owner);
    if (clearance) return clearance;
  }
  return null;
}

function collectEmission(emitter: NightLightEmitter, states: Map<THREE.MeshStandardMaterial, EmissionState>): EmissionState | null {
  const definition = emitter.emission;
  if (!definition) return null;
  const previous = states.get(definition.material);
  if (previous) {
    if (previous.nightColor.getHex() !== definition.color || previous.nightIntensity !== definition.intensity) {
      throw new Error('Shared lamp material has conflicting night emission');
    }
    return previous;
  }
  const state: EmissionState = {
    material: definition.material,
    originalColor: definition.material.emissive.clone(),
    originalIntensity: definition.material.emissiveIntensity,
    nightColor: new THREE.Color(definition.color), nightIntensity: definition.intensity,
    active: false, applied: false,
  };
  states.set(state.material, state);
  return state;
}

function setEmission(state: EmissionState, enabled: boolean): void {
  if (state.applied === enabled) return;
  state.material.emissive.copy(enabled ? state.nightColor : state.originalColor);
  state.material.emissiveIntensity = enabled ? state.nightIntensity : state.originalIntensity;
  state.applied = enabled;
}

function belongsToVisibleScene(anchor: THREE.Object3D, scene: THREE.Scene, source: THREE.Object3D): boolean {
  let containsSource = false;
  for (let current: THREE.Object3D | null = anchor; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === source) containsSource = true;
    if (current === scene) return containsSource;
  }
  return false;
}

/**
 * (the looks lane, 228: Steinburg's lamps lit no ground) a town's lamps — the building emitters, pooled into a point
 * light or two — are chosen round a point this far ahead of the camera along its view, on its own level: the lamps in
 * front of it light the street it looks down, not the one behind or beside it. Headlights keep the camera's distance.
 */
export const BUILDING_FOCUS_AHEAD_M = 14;
const _focus = new THREE.Vector3();

function updateEmitter(
  state: EmitterState, scene: THREE.Scene, reference: THREE.Vector3Like,
  seen: Map<THREE.Object3D, number>, frame: number, focus: THREE.Vector3Like = reference,
): void {
  state.active = (state.source.isActive?.() ?? true)
    && (state.emitter.isActive?.() ?? true)
    && belongsToVisibleScene(state.anchor, scene, state.source.root);
  if (!state.active) return;
  if (seen.get(state.anchor) !== frame) {
    state.anchor.updateWorldMatrix(true, false);
    seen.set(state.anchor, frame);
  }
  state.position.fromArray(state.emitter.position).applyMatrix4(state.anchor.matrixWorld);
  const from = state.emitter.kind === 'building' ? focus : reference;
  const x = state.position.x - from.x, y = state.position.y - from.y, z = state.position.z - from.z;
  state.distanceSquared = x * x + y * y + z * z;
  if (state.emission) state.emission.active = true;
  if (state.emitter.kind === 'headlight') {
    if (state.emitter.direction) state.direction.fromArray(state.emitter.direction);
    else state.direction.set(0, -.08, 1);
    // (EF.11, DO-FX-08: "barrels glowing gold at night") a driving lamp is a low beam: dropped in its own vehicle's
    // frame, so the cone's upper edge passes under the gun barrel above the lamps instead of flooding it gold; a weapon
    // searchlight looks where its station aims
    if (!state.emitter.searchlight) state.direction.y -= HEADLIGHT_LOW_BEAM_DROP * Math.hypot(state.direction.x, state.direction.z);
    state.direction.normalize().transformDirection(state.anchor.matrixWorld);
  }
}

/** (EF.11) the low beam: the lamp's aim dropped by this slope (in its vehicle's frame; the authored -0.08 becomes -0.13,
 *  the centre ray meeting the road ~9 m ahead of a 1.1 m lamp instead of 14 m) under a 19-degree cone (was 24.6), whose
 *  upper edge (+11.5 degrees) leaves the gun barrel over the lamps dark; the road ahead keeps the beam. */
export const HEADLIGHT_LOW_BEAM_DROP = .05, HEADLIGHT_CONE_RAD = .33;

/** Which side of its vehicle a lamp sits on (authored anchor-local x): −1 left, +1 right, 0 centreline. */
function lampSide(source: EmitterState): number {
  const x = source.emitter.position[0];
  return x > 0.12 ? 1 : x < -0.12 ? -1 : 0;
}

function assignedEarlier<T extends THREE.SpotLight | THREE.PointLight>(slots: LightSlot<T>[], index: number, source: EmitterState): boolean {
  for (let earlier = 0; earlier < index; earlier++) {
    const taken = slots[earlier].source;
    if (!taken) continue;
    if (taken === source) return true;
    // owner 2026-09-18 ("lights seem to only come from one headlight"): with two scene spot lights and a chase
    // camera offset to one flank, the two nearest lamps were both pods of the SAME headlight cluster. One lamp per
    // side of a vehicle: the next slot goes to the vehicle's other headlight before a farther vehicle's lamp.
    // (the looks lane, 228: Steinburg's streets dark at night) a vehicle's lamps only: a town's street lamps share one
    // instanced anchor with world positions, and read as one vehicle's left side they gave a whole town one lit lamp
    if (taken.emitter.kind === 'headlight' && taken.anchor === source.anchor && taken.emitter.kind === source.emitter.kind
      && lampSide(taken) === lampSide(source)) return true;
    // two lamps standing in one place (a square's lamp and the street's at its node) light it once
    if (taken.emitter.kind === 'building' && source.emitter.kind === 'building' && taken.position.distanceToSquared(source.position) < 4) return true;
  }
  return false;
}

function chooseEmitter<T extends THREE.SpotLight | THREE.PointLight>(
  emitters: EmitterState[], slots: LightSlot<T>[], index: number, kind: NightLightKind,
): EmitterState | null {
  let best: EmitterState | null = null, bestScore = Infinity;
  for (const candidate of emitters) {
    if (!candidate.active || candidate.emitter.kind !== kind || assignedEarlier(slots, index, candidate)) continue;
    const reach = (candidate.emitter.range ?? 42) + (kind === 'headlight' ? 80 : 25);
    if (candidate.distanceSquared > reach * reach) continue;
    // Mild retention prevents nearly equidistant lamps swapping every frame.
    const retained = slots[index].source === candidate ? .85 : 1;
    // (release 227) a searchlight ranks half a priority step ahead of its own vehicle's lamps on a pool with room for
    // more than one vehicle's two sides, and half a step behind them on a smaller one (they keep both of its spots).
    // Round 6 (the critic's UAPL-R5C-10: the lift applied whoever carried the searchlight, so another vehicle's beam up
    // to 180 m off outranked every nearer vehicle's lamps): only a prioritised (the player's) vehicle's searchlight is
    // lifted; anyone else's competes by distance like any lamp.
    const lift = candidate.emitter.searchlight && (candidate.source.priority ?? 0) > 0 ? slots.length > 2 ? .5 : -.5 : 0;
    const score = candidate.distanceSquared * retained - ((candidate.source.priority ?? 0) + lift) * 1e8;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function applyLight<T extends THREE.SpotLight | THREE.PointLight>(slot: LightSlot<T>, source: EmitterState | null): void {
  slot.source = source;
  if (!source) { slot.light.intensity = 0; return; }
  slot.light.position.copy(source.position);
  slot.light.color.setHex(source.emitter.color ?? 0xffe2ad);
  slot.light.distance = source.emitter.range ?? 42;
  slot.light.intensity = source.emitter.intensity ?? 80;
}

function updateSpots(slots: LightSlot<THREE.SpotLight>[], emitters: EmitterState[]): void {
  let ownGuns = 0;
  for (let index = 0; index < slots.length; index++) {
    const source = chooseEmitter(emitters, slots, index, 'headlight');
    const slot = slots[index];
    applyLight(slot, source);
    if (!source) continue;
    // a uniform, never a shader define: the cone changes with the lamp the slot holds
    slot.light.angle = source.emitter.coneRad ?? HEADLIGHT_CONE_RAD;
    slot.light.target.position.copy(source.position).add(source.direction);
    slot.light.target.updateMatrixWorld();
    if (source.clearance) publishOwnGun(ownGuns++, source, source.clearance);
  }
  OWN_GUN_UNIFORMS.uCotOwnGunCount.value = ownGuns;
}

/** (CN-7) A spot pool lights at most 8 headlights (the budget's bound), so at most 8 own-gun records. */
const OWN_GUN_RECORDS = 8;
/** (CN-7) This frame's lit headlights that carry their vehicle's gun: the lamp's seat (the spot's world position) and
 *  the gun's world capsule (A.xyz to B, radius A.w). Shared by reference with every vehicle program. */
const OWN_GUN_UNIFORMS = {
  uCotOwnGunCount: { value: 0 },
  uCotOwnGunSeat: { value: Array.from({ length: OWN_GUN_RECORDS }, () => new THREE.Vector3()) },
  uCotOwnGunA: { value: Array.from({ length: OWN_GUN_RECORDS }, () => new THREE.Vector4()) },
  uCotOwnGunB: { value: Array.from({ length: OWN_GUN_RECORDS }, () => new THREE.Vector3()) },
};

function publishOwnGun(record: number, source: EmitterState, clearance: ClearanceState): void {
  clearance.gun.updateWorldMatrix(true, false);
  const world = clearance.gun.matrixWorld;
  OWN_GUN_UNIFORMS.uCotOwnGunSeat.value[record].copy(source.position);
  const a = OWN_GUN_UNIFORMS.uCotOwnGunA.value[record];
  a.set(clearance.start.x, clearance.start.y, clearance.start.z, 1).applyMatrix4(world);
  a.w = clearance.radius * world.getMaxScaleOnAxis();
  OWN_GUN_UNIFORMS.uCotOwnGunB.value[record].copy(clearance.end).applyMatrix4(world);
}

/** (CN-7) The vehicle shader's own-gun uniforms (materials.ts vehicleAmbientFloorHook binds them with NIGHT_OWN_GUN_GLSL). */
export function bindNightOwnGunUniforms(uniforms: Record<string, unknown>): void {
  Object.assign(uniforms, OWN_GUN_UNIFORMS);
}

/**
 * (CN-7) Placed after `#include <lights_pars_begin>` in a vehicle program: every spot light's incident light, then none
 * of it on a fragment inside the gun capsule of the vehicle whose lit lamp that spot is (its seat within 1 cm). The
 * beam itself is untouched: the road, the trees and every other vehicle keep it, and other vehicles' lamps still light
 * this gun. World positions come back from the view-space light and fragment through the view matrix's rotation.
 */
export const NIGHT_OWN_GUN_GLSL = `#if NUM_SPOT_LIGHTS > 0
uniform int uCotOwnGunCount;
uniform vec3 uCotOwnGunSeat[ ${OWN_GUN_RECORDS} ];
uniform vec4 uCotOwnGunA[ ${OWN_GUN_RECORDS} ];
uniform vec3 uCotOwnGunB[ ${OWN_GUN_RECORDS} ];
void cotOwnGunSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
	getSpotLightInfo( spotLight, geometryPosition, light );
	if ( uCotOwnGunCount == 0 || ! light.visible ) return;
	vec3 cotLamp = cameraPosition + ( vec4( spotLight.position, 0.0 ) * viewMatrix ).xyz;
	for ( int k = 0; k < ${OWN_GUN_RECORDS}; k ++ ) {
		if ( k >= uCotOwnGunCount ) break;
		vec3 cotSeat = cotLamp - uCotOwnGunSeat[ k ];
		if ( dot( cotSeat, cotSeat ) > 1e-4 ) continue;
		vec3 cotFrag = cameraPosition + ( vec4( geometryPosition, 0.0 ) * viewMatrix ).xyz - uCotOwnGunA[ k ].xyz;
		vec3 cotBore = uCotOwnGunB[ k ] - uCotOwnGunA[ k ].xyz;
		vec3 cotOff = cotFrag - cotBore * clamp( dot( cotFrag, cotBore ) / max( dot( cotBore, cotBore ), 1e-6 ), 0.0, 1.0 );
		if ( dot( cotOff, cotOff ) <= uCotOwnGunA[ k ].w * uCotOwnGunA[ k ].w ) {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
		return;
	}
}
#define getSpotLightInfo cotOwnGunSpotLightInfo
#endif
`;

function createSpots(group: THREE.Group, count: number): LightSlot<THREE.SpotLight>[] {
  return Array.from({ length: count }, (_, index) => {
    const light = new THREE.SpotLight(0xffe2ad, 0, 42, HEADLIGHT_CONE_RAD, .7, 2);
    light.name = `night-headlight-${index}`; light.castShadow = false;
    group.add(light, light.target);
    return { light, source: null };
  });
}

function createPoints(group: THREE.Group, count: number): LightSlot<THREE.PointLight>[] {
  return Array.from({ length: count }, (_, index) => {
    // (240) the lamp's decay marks it a lantern for the lit programs (lampLightShape.ts): dark up the wall over its glass
    const light = new THREE.PointLight(0xffd79e, 0, 18, LAMP_LIGHT_DECAY);
    light.name = `night-building-light-${index}`; light.castShadow = false;
    group.add(light);
    return { light, source: null };
  });
}

function collectRoot(
  source: NightLightingRoot, seen: Map<THREE.Object3D, number>,
  existing: EmitterState[], emissions: Map<THREE.MeshStandardMaterial, EmissionState>,
  emissionList: EmissionState[],
): void {
  requireBounded(source.priority ?? 0, 10, 'source priority');
  const additions: EmitterState[] = [], anchors: THREE.Object3D[] = [];
  const nextEmissions = new Map(emissions);
  source.root.traverse(anchor => {
    const definitions = REGISTRATIONS.get(anchor);
    if (seen.has(anchor) || !definitions?.length) return;
    anchors.push(anchor);
    for (const emitter of definitions) {
      if (existing.length + additions.length >= MAX_EMITTERS) throw new RangeError('Night light scene exceeds bounded capacity');
      additions.push({ anchor, source, emitter, emission: collectEmission(emitter, nextEmissions),
        clearance: emitter.kind === 'headlight' ? clearanceFor(anchor) : null,
        position: new THREE.Vector3(), direction: new THREE.Vector3(), active: false, distanceSquared: Infinity });
    }
  });
  for (const addition of additions) existing.push(addition);
  for (const anchor of anchors) seen.set(anchor, 0);
  for (const [material, emission] of nextEmissions) {
    if (!emissions.has(material)) emissionList.push(emission);
    emissions.set(material, emission);
  }
}

export interface NightLightingRuntime {
  readonly group: THREE.Group;
  readonly lights: readonly (THREE.SpotLight | THREE.PointLight)[];
  readonly emitterCount: number;
  /**
   * `lightPool` (default on): the pool's lights join the scene. Off, the emitters and their lenses run as at night and no
   * light joins: a day battle's lit set without the pool (local-fps-266; Main: a daylight headlight lights its lenses).
   */
  prepare(roots: readonly NightLightingRoot[], night: boolean, options?: { readonly lightPool?: boolean }): void;
  /** Explicit visual-construction event only, never call from the frame loop. */
  appendRoot(source: NightLightingRoot): void;
  /** `forward`: the camera's view direction; a town's lamps are chosen round a point BUILDING_FOCUS_AHEAD_M ahead of it. */
  update(reference: THREE.Vector3Like, active?: boolean, forward?: THREE.Vector3Like): void;
  reset(): void;
  dispose(): void;
}

/** Covered activation owns a constant tier-specific light budget: no shadow maps,
 * light-count changes, scene additions, allocations or shader invalidation in
 * update. All lamps may glow; only local authored sources get pooled lighting.
 * Garage detach is covered. Battle keeps the pool prepared for manual toggles.
 * This bounded implementation still requires native cost/visual acceptance.
 */
export function createNightLightingRuntime(scene: THREE.Scene, budget: NightLightingBudget = DEFAULT_BUDGET): NightLightingRuntime {
  if (!Number.isInteger(budget.spotLights) || !Number.isInteger(budget.pointLights)) {
    throw new RangeError('Night light budgets must be integers');
  }
  // desktop lights both headlights of the player and of the nearest other vehicle (2026-09-18); mobile keeps 2 + 1
  requireBounded(budget.spotLights, 8, 'spot budget'); requireBounded(budget.pointLights, 4, 'point budget');
  const group = new THREE.Group(); group.name = 'night-light-pool';
  const spots = createSpots(group, budget.spotLights), points = createPoints(group, budget.pointLights);
  const lights = Object.freeze([...spots.map(slot => slot.light), ...points.map(slot => slot.light)]);
  const emitters: EmitterState[] = [], emissions = new Map<THREE.MeshStandardMaterial, EmissionState>();
  const emissionList: EmissionState[] = [];
  const seen = new Map<THREE.Object3D, number>();
  let enabled = false, pooled = false, disposed = false, frame = 0;

  function darken(): void {
    for (const slot of spots) applyLight(slot, null);
    for (const slot of points) applyLight(slot, null);
    for (const emission of emissionList) setEmission(emission, false);
  }
  function reset(): void {
    enabled = false; pooled = false; darken(); group.removeFromParent();
    emitters.length = 0; emissions.clear(); emissionList.length = 0; seen.clear();
  }
  function prepare(roots: readonly NightLightingRoot[], night: boolean, options?: { readonly lightPool?: boolean }): void {
    if (disposed) throw new Error('Night lighting is disposed');
    reset();
    if (!night) return;
    try {
      for (const source of roots) collectRoot(source, seen, emitters, emissions, emissionList);
      enabled = true; pooled = options?.lightPool ?? true;
      if (pooled) scene.add(group);
    } catch (error) { reset(); throw error; }
  }
  function appendRoot(source: NightLightingRoot): void {
    if (disposed) throw new Error('Night lighting is disposed');
    if (enabled) collectRoot(source, seen, emitters, emissions, emissionList);
  }
  function update(reference: THREE.Vector3Like, active = true, forward?: THREE.Vector3Like): void {
    if (!enabled || disposed) return;
    if (!active) { darken(); return; }
    frame++;
    _focus.set(reference.x, reference.y, reference.z);
    const level = forward ? Math.hypot(forward.x, forward.z) : 0;
    if (forward && level > 1e-6) _focus.x += forward.x / level * BUILDING_FOCUS_AHEAD_M, _focus.z += forward.z / level * BUILDING_FOCUS_AHEAD_M;
    for (const emission of emissionList) emission.active = false;
    for (const emitter of emitters) updateEmitter(emitter, scene, reference, seen, frame, _focus);
    for (const emission of emissionList) setEmission(emission, emission.active);
    if (!pooled) return;
    updateSpots(spots, emitters);
    for (let index = 0; index < points.length; index++) {
      applyLight(points[index], chooseEmitter(emitters, points, index, 'building'));
    }
  }
  function dispose(): void {
    if (disposed) return;
    reset(); disposed = true;
    for (const light of lights) light.dispose();
    group.clear();
  }
  return { group, lights, get emitterCount() { return emitters.length; }, prepare, appendRoot, update, reset, dispose };
}
