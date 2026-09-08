import * as THREE from 'three';

export type NightLightKind = 'headlight' | 'building' | 'shtora' | 'marker';
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
  readonly position: THREE.Vector3;
  readonly direction: THREE.Vector3;
  active: boolean;
  distanceSquared: number;
}

interface LightSlot<T extends THREE.SpotLight | THREE.PointLight> {
  readonly light: T;
  source: EmitterState | null;
}

const REGISTRATIONS = new WeakMap<THREE.Object3D, readonly NightLightEmitter[]>();
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
  requireBounded(emitter.intensity ?? 80, 300, 'intensity');
  requireBounded(emitter.range ?? 42, 100, 'range');
  requireBounded(emitter.color ?? 0xffe2ad, 0xffffff, 'color');
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

function updateEmitter(
  state: EmitterState, scene: THREE.Scene, reference: THREE.Vector3Like,
  seen: Map<THREE.Object3D, number>, frame: number,
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
  const x = state.position.x - reference.x, y = state.position.y - reference.y, z = state.position.z - reference.z;
  state.distanceSquared = x * x + y * y + z * z;
  if (state.emission) state.emission.active = true;
  if (state.emitter.kind === 'headlight') {
    if (state.emitter.direction) state.direction.fromArray(state.emitter.direction);
    else state.direction.set(0, -.08, 1);
    state.direction.transformDirection(state.anchor.matrixWorld);
  }
}

function assignedEarlier<T extends THREE.SpotLight | THREE.PointLight>(slots: LightSlot<T>[], index: number, source: EmitterState): boolean {
  for (let earlier = 0; earlier < index; earlier++) if (slots[earlier].source === source) return true;
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
    const score = candidate.distanceSquared * retained - (candidate.source.priority ?? 0) * 1e8;
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
  for (let index = 0; index < slots.length; index++) {
    const source = chooseEmitter(emitters, slots, index, 'headlight');
    const slot = slots[index];
    applyLight(slot, source);
    if (!source) continue;
    slot.light.target.position.copy(source.position).add(source.direction);
    slot.light.target.updateMatrixWorld();
  }
}

function createSpots(group: THREE.Group, count: number): LightSlot<THREE.SpotLight>[] {
  return Array.from({ length: count }, (_, index) => {
    const light = new THREE.SpotLight(0xffe2ad, 0, 42, .43, .7, 2);
    light.name = `night-headlight-${index}`; light.castShadow = false;
    group.add(light, light.target);
    return { light, source: null };
  });
}

function createPoints(group: THREE.Group, count: number): LightSlot<THREE.PointLight>[] {
  return Array.from({ length: count }, (_, index) => {
    const light = new THREE.PointLight(0xffd79e, 0, 18, 2);
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
  prepare(roots: readonly NightLightingRoot[], night: boolean): void;
  /** Explicit visual-construction event only, never call from the frame loop. */
  appendRoot(source: NightLightingRoot): void;
  update(reference: THREE.Vector3Like, active?: boolean): void;
  reset(): void;
  dispose(): void;
}

/** Covered activation owns a constant three-light maximum: no shadow maps,
 * light-count changes, scene additions, allocations or shader invalidation in
 * update. All lamps may glow; only local authored sources get pooled lighting.
 * Day/Garage detach is a COVERED transition and must precede forward warm-up.
 * This bounded implementation still requires native cost/visual acceptance.
 */
export function createNightLightingRuntime(scene: THREE.Scene, budget: NightLightingBudget = DEFAULT_BUDGET): NightLightingRuntime {
  if (!Number.isInteger(budget.spotLights) || !Number.isInteger(budget.pointLights)) {
    throw new RangeError('Night light budgets must be integers');
  }
  requireBounded(budget.spotLights, 2, 'spot budget'); requireBounded(budget.pointLights, 1, 'point budget');
  const group = new THREE.Group(); group.name = 'night-light-pool';
  const spots = createSpots(group, budget.spotLights), points = createPoints(group, budget.pointLights);
  const lights = Object.freeze([...spots.map(slot => slot.light), ...points.map(slot => slot.light)]);
  const emitters: EmitterState[] = [], emissions = new Map<THREE.MeshStandardMaterial, EmissionState>();
  const emissionList: EmissionState[] = [];
  const seen = new Map<THREE.Object3D, number>();
  let enabled = false, disposed = false, frame = 0;

  function darken(): void {
    for (const slot of spots) applyLight(slot, null);
    for (const slot of points) applyLight(slot, null);
    for (const emission of emissionList) setEmission(emission, false);
  }
  function reset(): void {
    enabled = false; darken(); group.removeFromParent();
    emitters.length = 0; emissions.clear(); emissionList.length = 0; seen.clear();
  }
  function prepare(roots: readonly NightLightingRoot[], night: boolean): void {
    if (disposed) throw new Error('Night lighting is disposed');
    reset();
    if (!night) return;
    try {
      for (const source of roots) collectRoot(source, seen, emitters, emissions, emissionList);
      enabled = true; scene.add(group);
    } catch (error) { reset(); throw error; }
  }
  function appendRoot(source: NightLightingRoot): void {
    if (disposed) throw new Error('Night lighting is disposed');
    if (enabled) collectRoot(source, seen, emitters, emissions, emissionList);
  }
  function update(reference: THREE.Vector3Like, active = true): void {
    if (!enabled || disposed) return;
    if (!active) { darken(); return; }
    frame++;
    for (const emission of emissionList) emission.active = false;
    for (const emitter of emitters) updateEmitter(emitter, scene, reference, seen, frame);
    for (const emission of emissionList) setEmission(emission, emission.active);
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
