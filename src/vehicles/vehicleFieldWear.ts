// src/vehicles/vehicleFieldWear.ts — the vehicle field wear: dust and wet earth thrown up off the running gear in the
// battlefield's own soil, graded by height, gathering on the decks and ledges and broken by noise.
//
// Round 5 redesign (2026-10-08, tank-accessories lane). Rounds 2-4's field wear scored flat in two blind close-up
// waves (240 and 264; materials.ts history at 95afc36d6): "a gravity-blind overlay (cream sawtooth dust stencilled
// along the skirts ..., ink-blot or pepper specks on the M60, flat tan tints, airbrushed smudges)", "pale cream is the
// wrong tone on green farmland (there: darker, wetter earth with splash patterns)", "tan-on-tan erases the form in the
// desert", while at battle distance (wave 265) its dirt concentrated low on the running gear helped. This layer keeps
// that read and rebuilds the look:
// - the coat's colours come from the battlefield (VEHICLE_FIELD_GROUNDS, set with the map's AUTO camouflage in
//   materials.ts setCamoBiome): dark wet earth on the farmland, pale dust with value contrast in the deserts, packed
//   snow and slush in winter; the Garage shows a light neutral film;
// - the coat is a broad gradient up from the ground contact (never a stencilled band): heavy on the tracks, wheels and
//   lower skirts, thinning to nothing by about 1.3 m, its top line wandering with a low noise octave, turning into
//   clumps and spatter where the fine octave resolves (close-ups) and into its plain average where it does not (range:
//   large-scale value first, no sparkle);
// - gravity-aware: faces turned down toward the tracks catch the most splash, vertical faces shed it, and the dry film
//   settles only on faces that look up (decks, fenders, roofs), thinner up the turret;
// - priced for the 14 v 14 frame: no texture, sampler, define or program key; four vec4 uniforms (three per battle, one
//   per draw), a vec3 varying, one 2D value-noise octave everywhere the coat or film can show and a second only up
//   close, and a branch that skips the high vertical faces where neither reaches.
// The per-material role (how much coat and film a surface takes) rides the per-draw ground reference
// (tankFactoryCore.ts installVehicleGroundReference → materials.ts setVehicleGroundFromRoot), so every vehicle
// material — profile clones and decor included — reads it without a variant of its own.

import * as THREE from 'three';

/** Field-wear strength on the Garage showroom build (a light neutral film); battle builds wear 1. */
export const VEHICLE_FIELD_WEAR_GARAGE = 0.42;

type Rgb = readonly [number, number, number];

/** One battlefield's soil on the vehicle, in linear RGB. */
export interface VehicleFieldSoil {
  /** The packed coat on the running gear and the lowest plates (wet earth, oily dust grime, packed snow). */
  readonly deep: Rgb;
  /** How wet (glossy) the deep coat is, 0..1. */
  readonly wet: number;
  /** The coat higher up, thinning with height (drying mud, dust, slush). */
  readonly splash: Rgb;
  /** How much spatter flies above the coat line, 0..1. */
  readonly spatter: number;
  /** The dry film that settles on faces looking up. */
  readonly settle: Rgb;
  /** How much of it settles, 0..1. */
  readonly settleAmount: number;
}

type FieldClimate = 'vegetated' | 'arid' | 'snow';
/** A battlefield's ground as its terrain renders it (linear): the dirt layer drawn as soil and the ground cover. */
interface FieldGround {
  /** The terrain's dirt layer as soil: its measured linear mean times the map's soil tint (terrain.ts uMeanD x uSoilTint). */
  readonly dirt: Rgb;
  /** The terrain's base layer: grass, sand or snow (terrain.ts uMeanG). */
  readonly ground: Rgb;
  readonly climate: FieldClimate;
  /** How wet the ground runs, 0..1 (coasts, deltas and still water wettest; arid 0). */
  readonly wet: number;
}

const ground = (dirt: Rgb, base: Rgb, climate: FieldClimate, wet: number): FieldGround =>
  Object.freeze({ dirt, ground: base, climate, wet });

/**
 * Every battlefield's ground (the AUTO camouflage's map ids, materials.ts setCamoBiome; an unknown id reads as Verdant).
 * The colours are the terrain's own: each map's sourced palette composed as sourcedTextures.ts composes it (photo x AO x
 * the plan's tint and the map's sourcedTint, desaturated and lifted) and measured as terrain.ts measures its layer means
 * (the linear mean per channel), the dirt under the map's splat.soilTint; the climate is the map's groundRedux.ts class.
 * vehicleFieldWear.selftest.mjs recomputes them from the photos and the plan and holds this table to them, so a ground
 * retint fails there until the vehicles follow it.
 */
export const VEHICLE_FIELD_GROUNDS: Readonly<Record<string, FieldGround>> = Object.freeze({
  verdant: ground([0.027, 0.019, 0.013], [0.061, 0.086, 0.016], 'vegetated', 0.75),
  desert: ground([0.355, 0.244, 0.117], [0.439, 0.321, 0.167], 'arid', 0),
  winter: ground([0.087, 0.053, 0.028], [0.676, 0.789, 0.892], 'snow', 0.45),
  urban: ground([0.097, 0.059, 0.03], [0.07, 0.088, 0.019], 'vegetated', 0.4),
  coastal: ground([0.484, 0.343, 0.158], [0.067, 0.088, 0.014], 'vegetated', 0.8),
  autumn: ground([0.113, 0.061, 0.026], [0.126, 0.114, 0.012], 'vegetated', 0.8),
  steppe: ground([0.113, 0.061, 0.021], [0.163, 0.124, 0.042], 'vegetated', 0.25),
  railyard: ground([0.05, 0.039, 0.029], [0.053, 0.063, 0.011], 'vegetated', 0.35),
  frontier: ground([0.075, 0.046, 0.025], [0.076, 0.092, 0.014], 'vegetated', 0.4),
  fjord: ground([0.073, 0.049, 0.025], [0.048, 0.077, 0.016], 'vegetated', 0.8),
  delta: ground([0.071, 0.035, 0.011], [0.038, 0.092, 0.01], 'vegetated', 0.9),
  badlands: ground([0.265, 0.088, 0.035], [0.461, 0.2, 0.072], 'arid', 0),
  monsoon: ground([0.055, 0.031, 0.012], [0.028, 0.07, 0.009], 'vegetated', 0.9),
  alpine: ground([0.078, 0.049, 0.027], [0.676, 0.789, 0.892], 'snow', 0.45),
  caldera: ground([0.025, 0.018, 0.013], [0.061, 0.081, 0.011], 'vegetated', 0.55),
  foundry: ground([0.043, 0.027, 0.014], [0.036, 0.044, 0.009], 'vegetated', 0.35),
  ruinspires: ground([0.104, 0.084, 0.065], [0.091, 0.099, 0.049], 'vegetated', 0.3),
  blackglass: ground([0.069, 0.059, 0.05], [0.053, 0.066, 0.039], 'vegetated', 0.5),
  titan_gorge: ground([0.336, 0.153, 0.056], [0.509, 0.285, 0.117], 'arid', 0),
  skybridge: ground([0.233, 0.096, 0.037], [0.417, 0.188, 0.066], 'arid', 0),
  polders: ground([0.026, 0.019, 0.015], [0.061, 0.086, 0.016], 'vegetated', 0.85),
  copper_mesa: ground([0.224, 0.175, 0.154], [0.302, 0.24, 0.208], 'arid', 0),
  airfield: ground([0.05, 0.039, 0.029], [0.053, 0.063, 0.011], 'vegetated', 0.4),
  oasis: ground([0.355, 0.244, 0.117], [0.439, 0.321, 0.167], 'arid', 0.1),
  whiteout: ground([0.087, 0.053, 0.028], [0.507, 0.6, 0.694], 'snow', 0.35),
  orchard: ground([0.026, 0.019, 0.015], [0.061, 0.086, 0.016], 'vegetated', 0.6),
  longleaf: ground([0.026, 0.019, 0.015], [0.061, 0.086, 0.016], 'vegetated', 0.45),
  mangrove: ground([0.055, 0.031, 0.012], [0.028, 0.07, 0.009], 'vegetated', 0.95),
  saltwind: ground([0.179, 0.072, 0.035], [0.089, 0.079, 0.024], 'vegetated', 0.75),
  reservoir: ground([0.075, 0.046, 0.025], [0.076, 0.092, 0.014], 'vegetated', 0.75),
  mars: ground([0.265, 0.088, 0.035], [0.461, 0.2, 0.072], 'arid', 0),
  moon: ground([0.055, 0.055, 0.055], [0.078, 0.078, 0.078], 'arid', 0),
  cliffbridge: ground([0.127, 0.11, 0.087], [0.115, 0.088, 0.027], 'vegetated', 0.3),
});

const lum = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const lift = (c: Rgb, k: number): Rgb => [c[0] + k, c[1] + k, c[2] + k];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const desat = (c: Rgb, k: number): Rgb => mixRgb(c, [lum(c), lum(c), lum(c)], k);
/** The colour with its luminance held inside [lo, hi] (hue and saturation kept). */
const toLuma = (c: Rgb, lo: number, hi: number): Rgb => {
  const l = lum(c);
  return scale(c, Math.min(hi, Math.max(lo, l)) / Math.max(l, 1e-4));
};

/**
 * The vehicle's soil from its battlefield's ground. Farmland and meadow: the soil itself, darkened wet low on the
 * running gear (held to a readable 0.06-0.14 luminance and greyed: wave 265 wants "darker, wetter earth", not a black
 * void; on the dark tyres and track it reads lighter than the rubber), drying to a mid grey-brown up the hull (0.1 and
 * up, still far darker than round 4's cream), and its fine dust (a grey-brown two to three times the soil's value) on
 * the decks.
 * Arid: the dust is the ground's own sand ground finer, so paler and greyer than both the sand and a tan paint (wave
 * 265: "tan-on-tan erases the form ... dust there needs VALUE contrast"), over an oily grime packed on the running gear
 * at about half the sand's value, so the tracks and wheels stay the darkest band under the pale hull. Snow: packed snow
 * and dirt in the running gear, dark slush thrown up the hull, fresh snow on the decks.
 */
export function deriveVehicleFieldSoil({ dirt, ground: base, climate, wet }: FieldGround): VehicleFieldSoil {
  if (climate === 'arid') {
    const settle = desat(lift(scale(base, 1.15), 0.08), 0.4);
    return Object.freeze({
      deep: desat(scale(dirt, 0.55), 0.3), wet: Math.min(wet, 0.2),
      splash: scale(settle, 0.93), spatter: 0.35,
      settle, settleAmount: 0.9,
    });
  }
  if (climate === 'snow') {
    return Object.freeze({
      deep: mixRgb(base, dirt, 0.45), wet,
      splash: scale(desat(dirt, 0.45), 1.1), spatter: 0.8,
      settle: scale(base, 0.96), settleAmount: 0.75,
    });
  }
  const dust = desat(scale(dirt, 2.6), 0.3);
  return Object.freeze({
    deep: desat(scale(toLuma(dirt, 0.06, 0.14), 0.9), 0.25), wet,
    splash: desat(toLuma(scale(dirt, 2.2), 0.1, 0.3), 0.3), spatter: 0.55 + 0.35 * wet,
    settle: toLuma(dust, 0.12, 0.4), settleAmount: 0.8 - 0.25 * wet,
  });
}

const SOILS = new Map<string, VehicleFieldSoil>();
/** The vehicle soil a battlefield id resolves to (an unknown id reads as Verdant). */
export function vehicleFieldSoil(mapId: string | null | undefined): VehicleFieldSoil {
  const id = mapId && Object.prototype.hasOwnProperty.call(VEHICLE_FIELD_GROUNDS, mapId) ? mapId : 'verdant';
  let soil = SOILS.get(id);
  if (!soil) {
    soil = deriveVehicleFieldSoil(VEHICLE_FIELD_GROUNDS[id]);
    SOILS.set(id, soil);
  }
  return soil;
}

/** The Garage's light neutral film (no battlefield yet: the showroom shows the vehicle, not a map). */
const GARAGE_SOIL: VehicleFieldSoil = Object.freeze({
  deep: [0.15, 0.135, 0.115] as Rgb, wet: 0, splash: [0.22, 0.2, 0.17] as Rgb, spatter: 0.25,
  settle: [0.25, 0.23, 0.2] as Rgb, settleAmount: 0.6,
});

const BATTLE = { deep: new THREE.Vector4(), splash: new THREE.Vector4(), settle: new THREE.Vector4() };
const GARAGE = { deep: new THREE.Vector4(), splash: new THREE.Vector4(), settle: new THREE.Vector4() };
function packSoil(out: typeof BATTLE, s: VehicleFieldSoil): void {
  out.deep.set(s.deep[0], s.deep[1], s.deep[2], s.wet);
  out.splash.set(s.splash[0], s.splash[1], s.splash[2], s.spatter);
  out.settle.set(s.settle[0], s.settle[1], s.settle[2], s.settleAmount);
}
packSoil(BATTLE, vehicleFieldSoil('verdant'));
packSoil(GARAGE, GARAGE_SOIL);

/** The wear uniforms every vehicle material reads (materials.ts vehicleAmbientFloorHook binds them). */
export const VEHICLE_FIELD_WEAR_UNIFORMS = Object.freeze({
  // per draw: (coat, settled film, use-wear class, soot) the drawn material takes
  uVehWearRole: { value: new THREE.Vector4(0, 0, 0, 0) },
  // per draw: the vehicle's forward axis in the world (materials.ts setVehicleGroundFromRoot): the rooster tail, the hull
  // stations of the exhaust and the walkways
  uVehWearFwd: { value: new THREE.Vector3(0, 0, 1) },
  // per draw: the vehicle's hull frame in its own metres (stern station, bow station, deck height, half width; a deck
  // height of 0 = no frame), measured at build end (measureVehicleWearFrame)
  uVehWearHull: { value: new THREE.Vector4(0, 0, 0, 0) },
  // per draw: the soot source the drawn material reads, in the world: the muzzle for the gun's paint and bare steel,
  // the exhaust for the rest; (mouth, reach across the axis) and (axis the soot runs along, its length); reach 0 = none
  uVehWearSoot: { value: new THREE.Vector4(0, 0, 0, 0) },
  uVehWearSootAxis: { value: new THREE.Vector4(0, 0, 1, 1) },
  // per battle (Garage: the neutral film): deep coat (rgb, wetness), thrown coat (rgb, spatter), film (rgb, amount)
  uVehWearDeep: { value: new THREE.Vector4().copy(BATTLE.deep) },
  uVehWearSplash: { value: new THREE.Vector4().copy(BATTLE.splash) },
  uVehWearSettle: { value: new THREE.Vector4().copy(BATTLE.settle) },
});

let soilSource: typeof BATTLE | null = BATTLE;
/** Point battle builds at a battlefield's soil (materials.ts setCamoBiome: battle start, the map picker, the Studio). */
export function setVehicleFieldSoil(mapId: string | null | undefined): void {
  packSoil(BATTLE, vehicleFieldSoil(mapId));
  if (soilSource === BATTLE) soilSource = null; // rewrite on the next battle draw
}

// ---------------------------------------------------------------------------------------------------------- roles
// (x coat, y settled film, z use-wear class, w soot): how much of each a material takes. Use-wear classes: 1 painted
// metal (chips along its plate seams, bolts and rings, boots' rubbing on the walkways, grime and rust streaks), 2 track
// iron (polished where the wheels run and the ground grinds), 3 bare steel (polished where hands and tools rub), 4 tyre
// rubber (none); 2 and 4 wear the deep coat at every height. Rubber,
// tracks and wheels take the coat in full; cloth and wood keep a little less of the thrown coat and all of the film;
// glass sheds most; the wheel bays' near-black recess panels, the wreck's char and every alpha-cut card (nets, leaves,
// garnish, wire grids) take none (an alpha-cut cord near the ground lit almost white under round 4's coat: "the hem
// read as white lace").
const ROLE_PAINT = Object.freeze(new THREE.Vector4(1, 1, 1, 1));
/** The gun's paint: the coat and the film, and the muzzle's carbon instead of the exhaust's (no plate streaks along a tube). */
const ROLE_BARREL = Object.freeze(new THREE.Vector4(1, 1, 0, 1));
// (no plate use-wear on the wheels: a streak or chip in a wheel's own frame would turn with it like a painted stripe)
const ROLE_WHEEL = Object.freeze(new THREE.Vector4(0.9, 0.6, 0, 0.6));
// (class 4: no use-wear, but like the track iron it wears the packed deep coat all the way up, not the drier, paler
// splash: a pale top run read as "a bright white outline traces both track runs" on wave 264's M60A1)
const ROLE_RUBBER = Object.freeze(new THREE.Vector4(0.9, 0.5, 4, 0.6));
const ROLE_IRON = Object.freeze(new THREE.Vector4(0.9, 0.6, 2, 0.6));
const ROLE_STEEL = Object.freeze(new THREE.Vector4(0.9, 0.8, 3, 1));
const ROLE_SOFT = Object.freeze(new THREE.Vector4(0.85, 1, 0, 0.8));
const ROLE_GLASS = Object.freeze(new THREE.Vector4(0.25, 0.35, 0, 0.5));
const ROLE_NONE = Object.freeze(new THREE.Vector4(0, 0, 0, 0));
const ROLES_BY_APPEARANCE: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  armorPaint: ROLE_PAINT, fittingPaint: ROLE_PAINT,
  wheelPaint: ROLE_WHEEL, tireRubber: ROLE_RUBBER, trackSteel: ROLE_IRON, trackPad: ROLE_IRON, trackBand: ROLE_IRON,
  gunmetal: ROLE_STEEL,
  canvas: ROLE_SOFT, canvasPale: ROLE_SOFT, wood: ROLE_SOFT,
  opticGlass: ROLE_GLASS,
  gearShadow: ROLE_NONE, burnt: ROLE_NONE,
});
const ROLES_BY_DECOR: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  Decor_kit: ROLE_PAINT, Decor_cans: ROLE_PAINT, Decor_steel: ROLE_STEEL, Decor_rubber: ROLE_RUBBER,
  Decor_canvas: ROLE_SOFT, Decor_burlap: ROLE_SOFT, Decor_wood: ROLE_SOFT, Decor_lens: ROLE_GLASS,
});
/** Explicit roles a builder may set (`material.userData.cotWearRole`); anything else reads its appearance role. */
const ROLES_BY_NAME: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  paint: ROLE_PAINT, gear: ROLE_IRON, rubber: ROLE_RUBBER, steel: ROLE_STEEL, soft: ROLE_SOFT, glass: ROLE_GLASS,
  none: ROLE_NONE,
});
const ROLE_OF = new WeakMap<THREE.Material, THREE.Vector4>();
function resolveRole(material: THREE.Material): THREE.Vector4 {
  const data = material.userData || {};
  const explicit = typeof data.cotWearRole === 'string' ? ROLES_BY_NAME[data.cotWearRole] : undefined;
  if (explicit) return explicit;
  if ((material as THREE.MeshStandardMaterial).alphaTest > 0) return ROLE_NONE;
  if (material.name === 'cot:barrel-paint') return ROLE_BARREL;
  const byDecor = ROLES_BY_DECOR[material.name];
  if (byDecor) return byDecor;
  const appearance = typeof data.appearanceRole === 'string' ? ROLES_BY_APPEARANCE[data.appearanceRole] : undefined;
  return appearance ?? ROLE_PAINT;
}
/** The wear role a material draws with (cached per material). */
export function vehicleFieldWearRole(material: THREE.Material): THREE.Vector4 {
  let role = ROLE_OF.get(material);
  if (!role) {
    role = resolveRole(material);
    ROLE_OF.set(material, role);
  }
  return role;
}

// ---------------------------------------------------------------------------------------------------------- the vehicle
/**
 * A vehicle's hull frame in its root's own metres (origin at the ground contact, +Y up, +Z forward, +X its left): the
 * rear plate's and the bow's stations along +Z, the engine deck's height and the hull's half width.
 */
export interface VehicleWearFrame {
  sternZ: number;
  bowZ: number;
  deckY: number;
  halfWidth: number;
}
/** Where a vehicle's engine breathes: out over its rear deck and plate, or out of its left flank (the T-72 lineage). */
type ExhaustLayout = 'rear' | 'left';
interface SootSource {
  /** Mouth and axis in the owner's frame; the soot runs `length` along the axis and `reach` across it. */
  mouth: THREE.Vector3;
  axis: THREE.Vector3;
  reach: number;
  length: number;
  owner: THREE.Object3D;
  /** The placed source (world), refreshed once per rendered frame. */
  world: THREE.Vector4;
  worldAxis: THREE.Vector4;
}
interface VehicleWearState {
  hull: THREE.Vector4;
  exhaust: SootSource | null;
  muzzle: SootSource | null;
  frame: number;
}
// Held beside the root, never in its userData: three's Object3D.copy deep-copies userData through JSON (tank thumbnail
// masks clone the root), and a soot source's owner is a live Object3D.
const VEHICLE_WEAR = new WeakMap<THREE.Object3D, VehicleWearState>();
const NO_HULL = Object.freeze(new THREE.Vector4(0, 0, 0, 0));
const NO_SOOT = Object.freeze(new THREE.Vector4(0, 0, 0, 0)); // (a Vector4's w defaults to 1: a live reach)

/** The vehicle families whose exhaust leaves through the left flank above the track (T-54/55/62, T-64/72/90, PT-91, M-84, BMPT). */
const LEFT_EXHAUST = /^(t54|t55|t62|t64|t72|t90|pt91|m84|bmpt)/;

/**
 * Measure a vehicle's hull frame from its own camouflaged plates outside the turret (round 4's measurement, kept with
 * the redesign): the rear plate is the rearmost rear-facing plate in the hull's last third with at least two fifths of
 * the largest one's area (a rack's bars behind it are smaller, a step ahead of it does not win), the engine deck the
 * up-facing plate with the most area in the rear half of the hull's middle. Each mesh contributes at most about 4,000
 * sampled triangles. Null when the hull has no such plates.
 */
export function measureVehicleWearFrame(root: THREE.Object3D): VehicleWearFrame | null {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const turret = root.getObjectByName('rig_turret');
  const local = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const rear: number[] = []; // [z, area] pairs of rear-facing plates
  const up: number[] = []; // [y, z, |x|, area] of up-facing plates
  let minZ = Infinity, maxZ = -Infinity, maxX = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as { isBatchedMesh?: boolean }).isBatchedMesh || !mesh.geometry || mesh.visible === false) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => material?.name === 'cot:armor-paint')) return;
    // outside the turret, visible, and on each LOD's finest level (the coarse levels repeat the same plates)
    for (let child: THREE.Object3D = mesh, parent = mesh.parent; parent; child = parent, parent = parent.parent) {
      if (parent === turret || parent.visible === false) return;
      const lod = parent as THREE.LOD;
      if (lod.isLOD && lod.levels.findIndex((level) => level.object === child) > 0) return;
    }
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    const stride = Math.max(1, Math.ceil(count / 3 / 4000)) * 3;
    local.multiplyMatrices(toRoot, mesh.matrixWorld);
    const vertex = (out: THREE.Vector3, at: number): THREE.Vector3 =>
      out.fromBufferAttribute(position, index ? index.getX(at) : at).applyMatrix4(local);
    for (let at = 0; at + 2 < count; at += stride) {
      vertex(a, at); vertex(b, at + 1); vertex(c, at + 2);
      ab.subVectors(b, a); ac.subVectors(c, a);
      const normal = ab.cross(ac);
      const twice = normal.length();
      if (!(twice > 1e-9)) continue;
      normal.divideScalar(twice);
      const area = twice / 2 * (stride / 3);
      const z = (a.z + b.z + c.z) / 3;
      minZ = Math.min(minZ, a.z, b.z, c.z);
      maxZ = Math.max(maxZ, a.z, b.z, c.z);
      maxX = Math.max(maxX, Math.abs(a.x), Math.abs(b.x), Math.abs(c.x));
      if (normal.z < -0.75) rear.push(z, area);
      else if (normal.y > 0.85) up.push((a.y + b.y + c.y) / 3, z, Math.abs(a.x + b.x + c.x) / 3, area);
    }
  });
  const length = maxZ - minZ;
  if (!(length > 1)) return null;
  const rearBins = new Map<number, number>();
  for (let at = 0; at < rear.length; at += 2) {
    if (rear[at] > minZ + length / 3) continue;
    const bin = Math.floor(rear[at] / 0.05);
    rearBins.set(bin, (rearBins.get(bin) ?? 0) + rear[at + 1]);
  }
  let sternBin: number | null = null;
  const sternArea = Math.max(0, ...rearBins.values());
  for (const [bin, area] of rearBins) if (area >= sternArea * 0.4 && (sternBin === null || bin < sternBin)) sternBin = bin;
  const sternZ = sternBin === null ? minZ : (sternBin + 0.5) * 0.05;
  const deckBins = new Map<number, number>();
  for (let at = 0; at < up.length; at += 4) {
    if (up[at + 1] > sternZ + (maxZ - sternZ) * 0.5 || up[at + 2] > maxX * 0.55) continue;
    const bin = Math.floor(up[at] / 0.05);
    deckBins.set(bin, (deckBins.get(bin) ?? 0) + up[at + 3]);
  }
  let deckBin: number | null = null, deckArea = 0;
  for (const [bin, area] of deckBins) if (area > deckArea) { deckBin = bin; deckArea = area; }
  const deckY = deckBin === null ? null : (deckBin + 0.5) * 0.05;
  if (deckY === null || !(deckY > 0.3)) return null;
  return { sternZ, bowZ: maxZ, deckY, halfWidth: maxX };
}

/**
 * Give a built vehicle its use-wear (tankFactoryCore.ts at build end, before static batching): its hull frame, its
 * exhaust (from the frame and its family's layout) and its muzzle (`rig_muzzle`, which rides the gun's elevation and
 * recoil). Exhaust soot: a fan over the engine deck's last stretch and the rear plate's upper band, or for the T-72
 * lineage over the left flank behind its outlet; muzzle carbon on the last 0.8 m of the tube and the brake.
 */
export function installVehicleFieldWear(root: THREE.Object3D, specId: string): void {
  // cosmetics never take down a build: a vehicle whose plates the measurement cannot read wears the coat without use-wear
  let frame: VehicleWearFrame | null = null;
  try { frame = measureVehicleWearFrame(root); } catch { frame = null; }
  const hull = frame ? new THREE.Vector4(frame.sternZ, frame.bowZ, frame.deckY, frame.halfWidth) : NO_HULL;
  const layout: ExhaustLayout = LEFT_EXHAUST.test(specId) ? 'left' : 'rear';
  const source = (owner: THREE.Object3D, mouth: THREE.Vector3, axis: THREE.Vector3, reach: number, length: number): SootSource => ({
    owner, mouth, axis: axis.normalize(), reach, length, world: new THREE.Vector4(), worldAxis: new THREE.Vector4(),
  });
  const exhaust = !frame ? null : layout === 'left'
    ? source(root, new THREE.Vector3(frame.halfWidth - 0.25, Math.max(0.85, frame.deckY - 0.45), frame.sternZ + 1.6),
      new THREE.Vector3(0.55, -0.15, -0.8), 0.55, 1.6)
    : source(root, new THREE.Vector3(0, frame.deckY - 0.08, frame.sternZ + 0.2),
      new THREE.Vector3(0, -0.25, -1), Math.min(1.1, frame.halfWidth * 0.6), 0.9);
  const muzzleRig = root.getObjectByName('rig_muzzle');
  // the soot runs back along the tube from a hand-span ahead of the muzzle plane (a brake past it is sooted to its tip)
  const muzzle = muzzleRig ? source(muzzleRig, new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0, 0, -1), 0.22, 0.8) : null;
  VEHICLE_WEAR.set(root, { hull, exhaust, muzzle, frame: NaN });
}

const sootMouth = new THREE.Vector3();
const sootAxis = new THREE.Vector3();
function placeSoot(source: SootSource): void {
  sootMouth.copy(source.mouth).applyMatrix4(source.owner.matrixWorld);
  sootAxis.copy(source.axis).transformDirection(source.owner.matrixWorld);
  source.world.set(sootMouth.x, sootMouth.y, sootMouth.z, source.reach);
  source.worldAxis.set(sootAxis.x, sootAxis.y, sootAxis.z, source.length);
}

let lastRole: THREE.Vector4 | null = null;
let lastHull: THREE.Vector4 | null = null;
let lastSoot: THREE.Vector4 | null = null;
/**
 * Per draw (materials.ts setVehicleGroundFromRoot): the drawn material's role, the root's hull frame and soot source
 * and, for a Garage build, the neutral film. The sources are placed once per rendered frame (`frame` < 0: every time);
 * a draw writes only what changed since the last one: no allocation, reference compares.
 */
export function bindVehicleFieldWear(
  garage: boolean,
  material: THREE.Material | null | undefined,
  root: THREE.Object3D | null = null,
  frame = -1,
): void {
  const U = VEHICLE_FIELD_WEAR_UNIFORMS;
  const source = garage ? GARAGE : BATTLE;
  if (source !== soilSource) {
    U.uVehWearDeep.value.copy(source.deep);
    U.uVehWearSplash.value.copy(source.splash);
    U.uVehWearSettle.value.copy(source.settle);
    soilSource = source;
  }
  const role = material ? vehicleFieldWearRole(material) : ROLE_PAINT;
  if (role !== lastRole) {
    U.uVehWearRole.value.copy(role);
    lastRole = role;
  }
  const state = root ? VEHICLE_WEAR.get(root) : undefined;
  const hull = state?.hull ?? NO_HULL;
  if (hull !== lastHull) {
    U.uVehWearHull.value.copy(hull);
    lastHull = hull;
  }
  const soot = role === ROLE_BARREL || role === ROLE_STEEL ? state?.muzzle : state?.exhaust;
  if (soot && (frame < 0 || state!.frame !== frame)) {
    if (state!.exhaust) placeSoot(state!.exhaust);
    if (state!.muzzle) placeSoot(state!.muzzle);
    state!.frame = frame;
    lastSoot = null; // the placed vectors moved: rewrite
  }
  const sootWorld = soot ? soot.world : NO_SOOT;
  if (sootWorld !== lastSoot) {
    U.uVehWearSoot.value.copy(sootWorld);
    if (soot) U.uVehWearSootAxis.value.copy(soot.worldAxis);
    lastSoot = sootWorld;
  }
}

// ---------------------------------------------------------------------------------------------------------- GLSL
/** Vertex: the wear pattern's frame, each mesh's own (it rides a turning turret, a spinning wheel or a running shoe);
 * every instance of an instanced or batched part takes its own offset, so identical skirt panels or wheels never
 * repeat one pattern (round 4's "identical sawtooth" along the skirts). */
export const FIELD_WEAR_VERTEX_PARS = /* glsl */ `
uniform vec4 uVehGround;
uniform vec3 uVehUp;
uniform vec3 uVehWearFwd;
uniform vec4 uVehWearSoot;
uniform vec4 uVehWearSootAxis;
varying vec4 vCotWearPos;
varying vec4 vCotWearFrame;
varying float vCotWearSootOff;
vec3 cotWearSeed( const in float id ) {
	return fract( vec3( id * 0.6180339, id * 0.4142136, id * 0.7320508 ) + 0.37 ) * 7.0;
}
`;
/** ...and, per vertex, the vehicle frame (height above the ground contact, the normal along the vehicle's up and
 * forward, the station along the hull) and the bound soot source's (along its axis, off it), so the fragment does no
 * matrix work: all are linear across a plate, and a smooth part interpolates its normals. Packed into two vec4 and a
 * float (the pattern position carries the height in its w): two and a quarter varying slots beside three's own. */
export const FIELD_WEAR_VERTEX = /* glsl */ `
	vec3 cotWearPos = transformed;
	vec4 cotWearWorld = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		cotWearPos += cotWearSeed( getIndirectIndex( gl_DrawID ) );
		cotWearWorld = batchingMatrix * cotWearWorld;
	#endif
	#ifdef USE_INSTANCING
		cotWearPos += cotWearSeed( float( gl_InstanceID ) );
		cotWearWorld = instanceMatrix * cotWearWorld;
	#endif
	cotWearWorld = modelMatrix * cotWearWorld;
	vec3 cotWearN = inverseTransformDirection( transformedNormal, viewMatrix );
	vec3 cotWearRel = cotWearWorld.xyz - uVehGround.xyz;
	vCotWearPos = vec4( cotWearPos, dot( cotWearRel, uVehUp ) );
	vec3 cotSootRel = cotWearWorld.xyz - uVehWearSoot.xyz;
	float cotSootAlong = dot( cotSootRel, uVehWearSootAxis.xyz );
	vCotWearFrame = vec4( dot( cotWearN, uVehUp ), dot( cotWearN, uVehWearFwd ), dot( cotWearRel, uVehWearFwd ), cotSootAlong );
	vCotWearSootOff = length( cotSootRel - uVehWearSootAxis.xyz * cotSootAlong );
`;

/** The value noise (inside the receipts' GLSL subset: vehicleFieldWear.selftest.mjs runs these bodies). */
export const FIELD_WEAR_NOISE_GLSL = /* glsl */ `
float cotWearHash( vec2 p ) {
	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}
float cotWearNoise( vec2 x ) {
	// the lattice wraps every 256 cells, keeping the hash's argument small; the 128-cell shift puts the wrap's seam half a
	// period from the mesh origin (43 m out for the low octave, 8 m for the fine one), never down a hull's centreline
	vec2 i = floor( x + 128.0 );
	i -= floor( i * 0.00390625 ) * 256.0;
	vec2 f = fract( x );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( cotWearHash( i ), cotWearHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( cotWearHash( i + vec2( 0.0, 1.0 ) ), cotWearHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

export const FIELD_WEAR_FRAGMENT_PARS = /* glsl */ `
uniform vec4 uVehWearRole;
uniform vec4 uVehWearHull;
uniform vec4 uVehWearSoot;
uniform vec4 uVehWearSootAxis;
uniform vec4 uVehWearDeep;
uniform vec4 uVehWearSplash;
uniform vec4 uVehWearSettle;
varying vec4 vCotWearPos;
varying vec4 vCotWearFrame;
varying float vCotWearSootOff;
${FIELD_WEAR_NOISE_GLSL}`;

/**
 * The field wear (inside the receipts' GLSL subset). Inputs: wearH (metres above the ground contact along the vehicle's
 * up), wearUp (the face's world normal along that up), wearBack (how squarely it faces the stern: the tracks throw their
 * rooster tail up the rear plate), wearAlong (the station along the hull, the vehicle's own metres), wearSootAlong / wearSootOff (along and off the bound soot source's axis), wearRelief (the
 * plate's normal-map relief: seams, welds, bolts, rings), wearQ (the pattern's 2D frame on the face's own plane: across,
 * then down a vertical plate), wearFoot (metres one pixel spans), wearN1 / wearN2 (the low and fine noise octaves,
 * 0..1), wearStrength, wearRole, wearHull, wearSoot, wearSootAxis, soilDeep, soilSplash,
 * soilSettle. In and out: wearAlbedo (linear), wearRough, wearMetal.
 * Order: the thrown coat, the settled film and the spatter; then use: track iron and bare steel polished where wheels,
 * ground, hands and tools rub (through the coat), chips along the plate's relief, boots' rubbing on the walkways, grime
 * and rust streaks down the vertical plates, and last the soot of the exhaust or the muzzle over all of it. Every mark
 * darkens or multiplies (the plate painter's law), never a bright stroke; the fine marks resolve only up close.
 */
export const FIELD_WEAR_CORE_GLSL = /* glsl */ `
	float wearFar = smoothstep( 0.06, 0.12, wearFoot );
	float wearNear = 1.0 - smoothstep( 0.008, 0.022, wearFoot );
	float n1 = mix( wearN1, 0.5, wearFar );
	float n2 = mix( 0.5, wearN2, wearNear );
	float lineH = wearH - wearBack * 0.35 + ( n1 - 0.5 ) * 0.6 + ( n2 - 0.5 ) * 0.14;
	float coat = 1.0 - smoothstep( 0.2, 1.45, lineH );
	// track iron and rubber (classes 2 and 4) keep the packed deep coat at every height
	float gearCoat = step( 1.5, wearRole.z ) * ( 1.0 - step( 2.5, wearRole.z ) * step( wearRole.z, 3.5 ) );
	float deep = max( clamp( 1.0 - smoothstep( 0.05, 0.75, lineH ) + ( n1 - 0.5 ) * 0.5, 0.0, 1.0 ), gearCoat );
	vec3 coatCol = mix( soilSplash.rgb, soilDeep.rgb, deep ) * ( 0.75 + 0.5 * n2 );
	// a coat far paler than the surface under it (desert dust on black rubber) lies as a film, not in patches: broken up
	// as hard as a dark coat, it reads as holes
	float cover = coat;
	if ( wearNear > 0.0 ) {
		float coatOver = clamp( ( dot( coatCol - wearAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) ) - 0.08 ) * 4.0, 0.0, 1.0 );
		float patchy = min( smoothstep( 0.25, 0.75, coat * 0.85 + ( n2 - 0.5 ) * 0.8 + ( n1 - 0.5 ) * 0.35 ), coat * 2.5 );
		cover = mix( coat, patchy, wearNear * mix( 0.85, 0.3, coatOver ) );
	}
	cover *= 0.85 + 0.3 * clamp( - wearUp, 0.0, 1.0 ) + 0.15 * clamp( wearUp, 0.0, 1.0 ) + 0.2 * wearBack;
	float coatAmt = clamp( cover * wearStrength * wearRole.x, 0.0, 1.0 );
	wearAlbedo = mix( wearAlbedo, coatCol, coatAmt * 0.85 );
	wearRough = mix( wearRough, mix( 1.0, 0.35, soilDeep.a * deep ), coatAmt );
	wearMetal = mix( wearMetal, 0.0, coatAmt );
	float settle = smoothstep( 0.3, 0.85, wearUp ) * soilSettle.a * wearRole.y * ( 0.35 + 0.65 * n1 )
		* ( 1.0 - 0.5 * smoothstep( 1.2, 2.8, wearH ) );
	// (a film, not specks: a fine speckle on dark ledges read as snow in wave 264, "pale specks over the turret")
	settle *= 0.85 + 0.3 * n2;
	float settleAmt = clamp( settle * wearStrength, 0.0, 1.0 ) * 0.55;
	wearAlbedo = mix( wearAlbedo, soilSettle.rgb * ( 0.92 + 0.16 * n1 ), settleAmt );
	wearRough = mix( wearRough, 1.0, settleAmt );
	float useW = wearStrength; // (the Garage's light film keeps its use-wear as light)
	if ( wearNear > 0.0 ) {
		// up close only (the fine octave resolves): spatter, polish, chips, rubbed walkways, streaks
		float spatZone = smoothstep( 0.25, 0.6, wearH ) * ( 1.0 - smoothstep( 0.6, 1.4, lineH - 0.3 ) ) * soilSplash.a;
		float spatCut = mix( 0.6, 0.86, smoothstep( 0.35, 1.45, wearH ) ) - ( n1 - 0.5 ) * 0.45;
		float spat = smoothstep( spatCut, spatCut + 0.05, wearN2 ) * spatZone * wearNear;
		float spatAmt = clamp( spat * wearStrength * wearRole.x, 0.0, 1.0 );
		wearAlbedo = mix( wearAlbedo, mix( soilSplash.rgb, soilDeep.rgb, 0.5 ), spatAmt * 0.85 );
		wearRough = mix( wearRough, mix( 1.0, 0.5, soilDeep.a ), spatAmt );
		float isPaint = step( 0.5, wearRole.z ) * step( wearRole.z, 1.5 );
		float isIron = step( 1.5, wearRole.z ) * step( wearRole.z, 2.5 );
		float isSteel = step( 2.5, wearRole.z ) * step( wearRole.z, 3.5 );
		float polish = isIron * smoothstep( 0.45, 0.85, wearUp ) * ( 1.0 - smoothstep( 1.15, 1.4, wearH ) )
			* ( 0.4 + 0.6 * smoothstep( 0.35, 0.65, n2 ) );
		polish = max( polish, isSteel * smoothstep( 0.58, 0.72, n2 * 0.6 + n1 * 0.4 ) * 0.8 ) * useW * wearNear;
		// dark bare steel (a fifth reflectance): a gleam where the light rakes it, never the pale planks of wave 269
		wearAlbedo = mix( wearAlbedo, vec3( 0.22, 0.215, 0.205 ), polish * 0.6 );
		wearRough = mix( wearRough, 0.42, polish * 0.8 );
		wearMetal = mix( wearMetal, 0.7, polish * 0.8 );
		float chip = isPaint * smoothstep( 0.35, 0.75, wearRelief ) * smoothstep( 0.6, 0.67, n2 + ( n1 - 0.5 ) * 0.25 ) * wearNear * useW;
		float framed = step( 0.05, wearHull.z );
		// where crews climb and walk: the front fenders and the glacis top, and the rear deck's edge
		float walkway = framed * isPaint * smoothstep( 0.8, 0.95, wearUp ) * smoothstep( 0.7, 0.9, wearH )
			* ( 1.0 - smoothstep( wearHull.z + 0.05, wearHull.z + 0.3, wearH ) )
			* max( smoothstep( wearHull.y - 1.7, wearHull.y - 0.8, wearAlong ), 1.0 - smoothstep( wearHull.x + 0.5, wearHull.x + 1.0, wearAlong ) );
		walkway *= smoothstep( 0.42, 0.6, n1 ) * useW * wearNear;
		float rubLuma = dot( wearAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
		wearAlbedo = mix( wearAlbedo, mix( wearAlbedo, vec3( rubLuma ), 0.25 ) * 1.08, walkway * 0.7 );
		wearRough = mix( wearRough, 0.55, walkway * 0.7 );
		chip = max( chip, walkway * smoothstep( 0.68, 0.74, wearN2 ) );
		wearAlbedo = mix( wearAlbedo, vec3( 0.045, 0.043, 0.04 ), chip * 0.9 );
		wearRough = mix( wearRough, 0.5, chip );
		wearMetal = mix( wearMetal, 0.45, chip );
		float streakZone = isPaint * ( 1.0 - smoothstep( 0.2, 0.45, abs( wearUp ) ) ) * smoothstep( 0.4, 0.75, wearH )
			* ( 1.0 - smoothstep( 2.6, 3.0, wearH ) );
		// thin runs hanging down a plate: a 4.5 cm column streaks when its hash says so, soft-edged across, its runs as long
		// as the low octave's cells
		float streakCol = wearQ.x * 22.0;
		float streak = step( 0.86, cotWearHash( vec2( floor( streakCol ), 17.0 ) ) ) * ( 1.0 - abs( fract( streakCol ) * 2.0 - 1.0 ) )
			* smoothstep( 0.45, 0.65, n1 ) * streakZone * wearNear * useW;
		vec3 streakTint = mix( vec3( 0.66, 0.64, 0.61 ), vec3( 0.78, 0.6, 0.46 ), smoothstep( 0.55, 0.75, n1 ) );
		wearAlbedo *= mix( vec3( 1.0 ), streakTint, streak * 0.6 );
	}
	float sootLen = max( wearSootAxis.w, 0.05 );
	if ( wearSoot.w > 0.0 && wearSootOff < wearSoot.w && wearSootAlong > - 0.35 * sootLen && wearSootAlong < sootLen ) {
		float sootD = length( vec2( wearSootAlong / sootLen, wearSootOff / wearSoot.w ) );
		float soot = ( 1.0 - smoothstep( 0.12, 1.0, sootD ) ) * smoothstep( - 0.35, 0.0, wearSootAlong / sootLen ) * wearRole.w;
		soot = clamp( soot * 1.3 * ( 0.62 + 0.38 * n1 + ( n2 - 0.5 ) * 0.16 ), 0.0, 1.0 ) * useW;
		wearAlbedo = mix( wearAlbedo, vec3( 0.016, 0.015, 0.014 ), soot * 0.8 );
		wearRough = mix( wearRough, 0.95, soot );
		wearMetal = mix( wearMetal, 0.0, soot );
	}
`;

/**
 * Fragment glue (after the normal maps, before any light reads the surface): the vehicle and soot frames from the vertex
 * stage (a back face of double-sided cloth turns them over), the footprint and the projection plane in uniform control
 * flow, the two noise octaves (the fine one only up close, stretched down the plate so spatter runs and streaks hang),
 * then the core.
 */
export const FIELD_WEAR_FRAGMENT = /* glsl */ `
	if ( uVehGround.w > 0.0 && uVehWearRole.x + uVehWearRole.y + uVehWearRole.w > 0.0 ) {
		float wearH = vCotWearPos.w;
		float wearUp = vCotWearFrame.x * faceDirection;
		float wearBack = clamp( - vCotWearFrame.y * faceDirection, 0.0, 1.0 );
		float wearAlong = vCotWearFrame.z;
		float wearSootAlong = vCotWearFrame.w;
		float wearSootOff = vCotWearSootOff;
		// the pattern's frame and footprint from the screen derivatives: the face's own plane in the mesh frame picks the
		// projection (a side plate's z and y, a deck's x and z), so the noise keeps its shape on every plate
		vec3 wearDx = dFdx( vCotWearPos.xyz );
		vec3 wearDy = dFdy( vCotWearPos.xyz );
		float wearFoot = length( abs( wearDx ) + abs( wearDy ) );
		vec3 wearFace = abs( cross( wearDx, wearDy ) );
		vec3 wearP = vCotWearPos.xyz;
		vec2 wearQ = wearFace.x > max( wearFace.y, wearFace.z ) ? wearP.zy : ( wearFace.y > wearFace.z ? wearP.xz : wearP.xy );
		float wearN1 = cotWearNoise( wearQ * vec2( 3.0, 2.0 ) );
		float wearN2 = 0.5;
		if ( wearFoot < 0.022 ) wearN2 = cotWearNoise( wearQ * 16.0 + vec2( 7.3, 2.9 ) );
		float wearRelief = 0.0;
		#ifdef USE_NORMALMAP_TANGENTSPACE
			wearRelief = length( mapN.xy );
		#endif
		float wearStrength = uVehGround.w;
		vec4 wearRole = uVehWearRole;
		vec4 wearHull = uVehWearHull;
		vec4 wearSoot = uVehWearSoot;
		vec4 wearSootAxis = uVehWearSootAxis;
		vec4 soilDeep = uVehWearDeep;
		vec4 soilSplash = uVehWearSplash;
		vec4 soilSettle = uVehWearSettle;
		vec3 wearAlbedo = diffuseColor.rgb;
		float wearRough = roughnessFactor;
		float wearMetal = metalnessFactor;
		${FIELD_WEAR_CORE_GLSL}
		diffuseColor.rgb = wearAlbedo;
		roughnessFactor = wearRough;
		metalnessFactor = wearMetal;
	}
`;
