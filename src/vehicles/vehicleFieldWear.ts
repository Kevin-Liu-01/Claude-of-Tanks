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
//   materials.ts setCamoBiome): dark wet earth on the farmland, darker oily grime low with only a faint dust tint
//   above in the deserts, packed snow and slush in winter; the Garage shows a light neutral film;
// - the coat is a broad gradient up from the ground contact (never a stencilled band): heavy on the tracks, wheels and
//   lower skirts, thinning to nothing by about 1.3 m, its top line wandering with a low noise octave and hanging in soft
//   vertical runs up close, a smooth packed coat whose breakup is soft-edged and low-contrast (never a patch mask), and
//   its plain average where the fine octaves do not resolve (range: large-scale value first, no sparkle);
// - gravity-aware: faces turned down toward the tracks catch the most splash, vertical faces shed it, and the dry film
//   settles only on faces that look up (decks, fenders, roofs), thinner up the turret;
// - wear where use puts it (installVehicleFieldWear): exhaust and muzzle soot, track iron and bare steel worn smooth,
//   chips along the plates' relief, rubbed walkways, thin grime and rust runs (the fine marks only up close);
// - it darkens freely but never lightens a surface by more than about a third: the running gear stays darker than the
//   paint under every soil and in shade (the readability floor scales a shaded texel's light by its albedo);
// - priced for the 14 v 14 frame: no texture, sampler, define or program key; seven vec4 and a vec3 uniform (the soil per
//   battle, the role, hull frame and soot source per draw), two vec4 and a vec3 varying, one 2D value-noise octave
//   where the coat, film or soot can show, a second and the runs' 3D octave only up close (never on the running gear),
//   and branches that skip the pixels no wear reaches.
// The per-material role (how much coat, film, use-wear and soot a surface takes) rides the per-draw ground reference
// (tankFactoryCore.ts installVehicleGroundReference → materials.ts setVehicleGroundFromRoot), so every vehicle
// material — profile clones and decor included — reads it without a variant of its own.

import * as THREE from 'three';

/** Field-wear strength on the Garage showroom build (a light neutral film); battle builds wear 1. */
export const VEHICLE_FIELD_WEAR_GARAGE = 0.42;

type Rgb = readonly [number, number, number];

/** One battlefield's soil on the vehicle, in linear RGB. */
interface VehicleFieldSoil {
  /** The packed coat on the running gear and the lowest plates (wet earth, oily dust grime, packed snow). */
  readonly deep: Rgb;
  /** How wet (glossy) the deep coat is, 0..1. */
  readonly wet: number;
  /** The coat higher up, thinning with height (drying mud, dust, slush). */
  readonly splash: Rgb;
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
 * Arid (wave 265: "tan-on-tan erases the form ... dust there needs VALUE contrast"): the contrast is a darker oily grime
 * packed on the running gear and the lowest plates (two fifths of the sand's value), a greyed dust a shade under the
 * paint above it and a faint film on the decks (the round 5 GPU frames: a pale film washed the tan hull near white).
 * Snow: packed snow and dirt in the running gear, dark slush thrown up the hull, fresh snow on the decks. The shader
 * caps how far any of it lightens a surface (FIELD_WEAR_CORE_GLSL), so dark gear stays dark whatever the soil.
 */
function deriveVehicleFieldSoil({ dirt, ground: base, climate, wet }: FieldGround): VehicleFieldSoil {
  if (climate === 'arid') {
    // round 5 GPU review (2026-10-08, the first frames of the M60A1 on Sirocco: the pale film "turns the tan paint near
    // white over the decks, turret and gun"): the desert's value contrast comes from darker oily grime low on the hull
    // and the running gear, a greyed dust a shade under the paint above it, and at most a faint tint on the decks
    return Object.freeze({
      deep: desat(scale(dirt, 0.4), 0.35), wet: Math.min(wet, 0.2),
      splash: desat(scale(base, 0.7), 0.4),
      settle: desat(scale(base, 0.88), 0.45), settleAmount: 0.35,
    });
  }
  if (climate === 'snow') {
    return Object.freeze({
      deep: mixRgb(base, dirt, 0.65), wet,
      splash: scale(desat(dirt, 0.45), 1.1),
      settle: scale(base, 0.96), settleAmount: 0.75,
    });
  }
  const dust = desat(scale(dirt, 2.6), 0.3);
  return Object.freeze({
    deep: desat(scale(toLuma(dirt, 0.06, 0.14), 0.9), 0.25), wet,
    splash: desat(toLuma(scale(dirt, 2.2), 0.1, 0.3), 0.3),
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

/**
 * The Garage's light neutral film (no battlefield yet: the showroom shows the vehicle, not a map). Its packed coat is a
 * dark dry grime, a little above the tyre rubber's value: the tracks and tyres (which wear the deep coat all round) stay
 * dark under the showroom lights, the fleet lane's running-gear target (wave 269: tyres that lifted to light grey read
 * as "flat tan wheel dishes"), while a light dust rises up the lower hull and settles on the decks.
 */
const GARAGE_SOIL: VehicleFieldSoil = Object.freeze({
  deep: [0.042, 0.039, 0.035] as Rgb, wet: 0, splash: [0.2, 0.185, 0.16] as Rgb,
  settle: [0.25, 0.23, 0.2] as Rgb, settleAmount: 0.6,
});

const BATTLE = { deep: new THREE.Vector4(), splash: new THREE.Vector4(), settle: new THREE.Vector4() };
const GARAGE = { deep: new THREE.Vector4(), splash: new THREE.Vector4(), settle: new THREE.Vector4() };
function packSoil(out: typeof BATTLE, s: VehicleFieldSoil): void {
  out.deep.set(s.deep[0], s.deep[1], s.deep[2], s.wet);
  out.splash.set(s.splash[0], s.splash[1], s.splash[2], 0);
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
  // per battle (Garage: the neutral film): deep coat (rgb, wetness), thrown coat (rgb, unused), film (rgb, amount)
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
// metal (chips along its plate seams, bolts and rings, boots' rubbing on the walkways, grime and rust runs), 2 track
// iron (worn smooth where the wheels run and the ground grinds), 3 bare steel (worn smooth where hands and tools rub),
// 4 tyre rubber and the track band (none), 5 wheel paint (none); 2, 4 and 5 wear the deep coat at every height. Rubber,
// tracks and wheels take the coat in full; cloth and wood keep a little less of the thrown coat and all of the film;
// glass sheds most; the wheel bays' near-black recess panels, the wreck's char and every alpha-cut card (nets, leaves,
// garnish, wire grids) take none (an alpha-cut cord near the ground lit almost white under round 4's coat: "the hem
// read as white lace").
const ROLE_PAINT = Object.freeze(new THREE.Vector4(1, 1, 1, 1));
/** The gun's paint: the coat and the film, and the muzzle's carbon instead of the exhaust's (no plate streaks along a tube). */
const ROLE_BARREL = Object.freeze(new THREE.Vector4(1, 1, 0, 1));
// The running gear (classes 2, 4 and 5) wears the packed deep coat all round and none of the settled film: round 5's
// first GPU frames found the film on the track's up-facing faces and a pale coat on the wheels' upper arcs drawing
// "the cream outline round the tracks" again (wave 264's exact complaint). Class 5, the wheel paint: no plate use-wear
// (a streak or chip in a wheel's own frame would turn with it like a painted stripe).
const ROLE_WHEEL = Object.freeze(new THREE.Vector4(0.75, 0, 5, 0.6));
// (class 4: no use-wear, but like the track iron it wears the packed deep coat all the way up, not the drier, paler
// splash: a pale top run read as "a bright white outline traces both track runs" on wave 264's M60A1)
const ROLE_RUBBER = Object.freeze(new THREE.Vector4(0.9, 0, 4, 0.6));
const ROLE_IRON = Object.freeze(new THREE.Vector4(0.9, 0, 2, 0.6));
// The scrolling track band: the iron's deep coat all round but no polish. Its texture runs while its mesh stands still,
// so a polish pattern laid in the mesh's frame would stand still on a moving track (its own painted worn crests carry
// the wear); the shoes and links, which ride with their instances, take the iron's polish.
const ROLE_BAND = Object.freeze(new THREE.Vector4(0.9, 0, 4, 0.6));
const ROLE_STEEL = Object.freeze(new THREE.Vector4(0.9, 0.8, 3, 1));
const ROLE_SOFT = Object.freeze(new THREE.Vector4(0.85, 1, 0, 0.8));
const ROLE_GLASS = Object.freeze(new THREE.Vector4(0.25, 0.35, 0, 0.5));
const ROLE_NONE = Object.freeze(new THREE.Vector4(0, 0, 0, 0));
const ROLES_BY_APPEARANCE: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  armorPaint: ROLE_PAINT, fittingPaint: ROLE_PAINT,
  wheelPaint: ROLE_WHEEL, tireRubber: ROLE_RUBBER, trackSteel: ROLE_IRON, trackPad: ROLE_IRON, trackBand: ROLE_BAND,
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
interface VehicleWearFrame {
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
  /** The render frame the root's own frame below was placed for (NaN: never; -1 calls place every time). */
  frame: number;
  /** Placed once per frame: the ground contact (w the field-wear strength), the hull's up and forward axes. */
  ground: THREE.Vector4;
  up: THREE.Vector3;
  fwd: THREE.Vector3;
  garage: boolean;
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
 * up-facing plate with the most area in the rear half of the hull's middle. About 24,000 sampled triangles in all (a mesh
 * at most 4,000, never under 48), so a build pays a few milliseconds. Null when the hull has no such plates.
 */
function measureVehicleWearFrame(root: THREE.Object3D): VehicleWearFrame | null {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const turret = root.getObjectByName('rig_turret');
  const local = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const rear: number[] = []; // [z, area] pairs of rear-facing plates
  const up: number[] = []; // [y, z, |x|, area] of up-facing plates
  let minZ = Infinity, maxZ = -Infinity, maxX = 0;
  // the hull's camouflaged plates outside the turret, visible, on each LOD's finest level (the coarse levels repeat the
  // same plates)
  const plates: Array<{ mesh: THREE.Mesh; count: number }> = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as { isBatchedMesh?: boolean }).isBatchedMesh || !mesh.geometry || mesh.visible === false) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => material?.name === 'cot:armor-paint')) return;
    for (let child: THREE.Object3D = mesh, parent = mesh.parent; parent; child = parent, parent = parent.parent) {
      if (parent === turret || parent.visible === false) return;
      const lod = parent as THREE.LOD;
      if (lod.isLOD && lod.levels.findIndex((level) => level.object === child) > 0) return;
    }
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const count = mesh.geometry.index ? mesh.geometry.index.count : position.count;
    plates.push({ mesh, count });
  });
  // One budget for the whole hull: about 24,000 sampled triangles in all, a mesh never under 48 (a 12-triangle plate box
  // stays whole), so a hull of many painted meshes costs what a hull of five does (the fleet's are five to nine: 0.3-1 ms)
  const perMesh = Math.min(4000, Math.max(48, 24000 / Math.max(1, plates.length)));
  for (const { mesh, count } of plates) {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const stride = Math.max(1, Math.ceil(count / 3 / perMesh)) * 3;
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
  }
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
  VEHICLE_WEAR.set(root, newWearState(hull, exhaust, muzzle));
}

function newWearState(hull: THREE.Vector4, exhaust: SootSource | null, muzzle: SootSource | null): VehicleWearState {
  return { hull, exhaust, muzzle, frame: NaN, ground: new THREE.Vector4(), up: new THREE.Vector3(0, 1, 0),
    fwd: new THREE.Vector3(0, 0, 1), garage: false };
}

const sootMouth = new THREE.Vector3();
const sootAxis = new THREE.Vector3();
function placeSoot(source: SootSource): void {
  sootMouth.copy(source.mouth).applyMatrix4(source.owner.matrixWorld);
  sootAxis.copy(source.axis).transformDirection(source.owner.matrixWorld);
  source.world.set(sootMouth.x, sootMouth.y, sootMouth.z, source.reach);
  source.worldAxis.set(sootAxis.x, sootAxis.y, sootAxis.z, source.length);
}

/** Whether a drawn object belongs to the gun (under `rig_gun`: the tube, the brake, the mantlet): the per-draw hook asks
 * once per object when it is installed (tankFactoryCore.ts installVehicleGroundReference). */
export function isVehicleGunPart(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.name === 'rig_gun') return true;
  return false;
}

/**
 * A vehicle root's frame for the current render frame (materials.ts setVehicleGroundFromRoot): its ground contact with
 * the field-wear strength in w (`root.userData.fieldWear`: 1 in battle, VEHICLE_FIELD_WEAR_GARAGE on the Garage build,
 * a root without it wears 1), its up and forward axes, its soot sources, all placed once per rendered frame (`frame` < 0:
 * every call). A root built without use-wear (tooling) gets a frame of its own on first use.
 */
let lastRoot: THREE.Object3D | null = null;
let lastRootState: VehicleWearState | null = null;
export function vehicleWearFrameOf(root: THREE.Object3D, frame: number): VehicleWearState {
  // the opaque list runs material by material, so a vehicle's draws arrive together: the last root answers most calls
  if (root === lastRoot && lastRootState && frame >= 0 && lastRootState.frame === frame) return lastRootState;
  let state = VEHICLE_WEAR.get(root);
  if (!state) {
    state = newWearState(NO_HULL, null, null);
    VEHICLE_WEAR.set(root, state);
  }
  if (frame < 0 || state.frame !== frame) {
    const e = root.matrixWorld.elements;
    const wear = root.userData.fieldWear;
    const strength = typeof wear === 'number' ? wear : 1;
    state.ground.set(e[12], e[13], e[14], strength);
    const n = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]) || 1;
    state.up.set(e[4] / n, e[5] / n, e[6] / n);
    const f = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]) || 1;
    state.fwd.set(e[8] / f, e[9] / f, e[10] / f);
    state.garage = strength < 1;
    if (state.exhaust) placeSoot(state.exhaust);
    if (state.muzzle) placeSoot(state.muzzle);
    state.frame = frame;
    if (state === lastState) lastState = null; // its vectors moved: rewrite
  }
  lastRoot = root;
  lastRootState = state;
  return state;
}

let lastState: VehicleWearState | null = null;
let lastRole: THREE.Vector4 | null = null;
let lastMaterial: THREE.Material | null = null;
let lastSoot: SootSource | null | undefined;
/**
 * Per draw (materials.ts setVehicleGroundFromRoot, after vehicleWearFrameOf): the drawn material's role, the root's hull
 * frame and forward axis, its soot source (the muzzle for the gun's own parts, the exhaust for everything else: the
 * engine grilles' bare steel included) and, for a Garage build, the neutral film. Reference compares, and a copy only
 * when something changed since the last draw: no allocation, no matrix work.
 */
export function bindVehicleFieldWear(
  state: VehicleWearState,
  material: THREE.Material | null | undefined,
  gun = false,
): void {
  const U = VEHICLE_FIELD_WEAR_UNIFORMS;
  if (state !== lastState) {
    U.uVehWearFwd.value.copy(state.fwd);
    U.uVehWearHull.value.copy(state.hull);
    const source = state.garage ? GARAGE : BATTLE;
    if (source !== soilSource) {
      U.uVehWearDeep.value.copy(source.deep);
      U.uVehWearSplash.value.copy(source.splash);
      U.uVehWearSettle.value.copy(source.settle);
      soilSource = source;
    }
    lastState = state;
    lastSoot = undefined;
  } else if (soilSource === null) {
    // the battle soil was repointed (setVehicleFieldSoil) between two draws of one root
    const source = state.garage ? GARAGE : BATTLE;
    U.uVehWearDeep.value.copy(source.deep);
    U.uVehWearSplash.value.copy(source.splash);
    U.uVehWearSettle.value.copy(source.settle);
    soilSource = source;
  }
  if (material !== lastMaterial) {
    const role = material ? vehicleFieldWearRole(material) : ROLE_PAINT;
    if (role !== lastRole) {
      U.uVehWearRole.value.copy(role);
      lastRole = role;
    }
    lastMaterial = material ?? null;
  }
  const soot = gun ? state.muzzle : state.exhaust;
  if (soot !== lastSoot) {
    if (soot) {
      U.uVehWearSoot.value.copy(soot.world);
      U.uVehWearSootAxis.value.copy(soot.worldAxis);
    } else U.uVehWearSoot.value.copy(NO_SOOT);
    lastSoot = soot;
  }
}

// ---------------------------------------------------------------------------------------------------------- GLSL
/** Vertex: the wear pattern's frame, each mesh's own (it rides a turning turret, a spinning wheel or a running shoe), in
 * metres whatever the mesh's scale; every instance of an instanced or batched part takes its own offset, so identical
 * skirt panels or wheels never repeat one pattern (round 4's "identical sawtooth" along the skirts). */
export const FIELD_WEAR_VERTEX_PARS = /* glsl */ `
uniform vec4 uVehGround;
uniform vec3 uVehUp;
uniform vec3 uVehWearFwd;
uniform vec4 uVehWearSoot;
uniform vec4 uVehWearSootAxis;
varying vec4 vCotWearPos;
varying vec4 vCotWearFrame;
varying vec3 vCotWearSide;
vec3 cotWearSeed( const in float id ) {
	return fract( vec3( id * 0.6180339, id * 0.4142136, id * 0.7320508 ) + 0.37 ) * 7.0;
}
`;
/** ...and, per vertex: the vehicle frame (height above the ground contact, the normal along the vehicle's up and forward,
 * the station along the hull), the bound soot source's (along its axis, off it), and the runs' frame: the position on a
 * level plane, in the mesh's own metres, on a horizontal basis built from the vehicle's up in the mesh's frame (round 5's
 * GPU frames: streak columns laid along a mesh's own axis drew "a repeated diagonal bar pattern" on the M60A1 wherever a
 * part was turned). The runs are a 3D noise over that plane and the height, stretched up, so they hang straight down
 * every face, flat or round, with no projection seam. All are linear across a plate. */
export const FIELD_WEAR_VERTEX = /* glsl */ `
	float cotWearScale = length( modelMatrix[ 0 ].xyz );
	vec3 cotWearUp = ( vec4( uVehUp, 0.0 ) * modelMatrix ).xyz;
	vec3 cotWearPos = transformed;
	vec4 cotWearWorld = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		cotWearScale *= length( batchingMatrix[ 0 ].xyz );
		cotWearUp = ( vec4( cotWearUp, 0.0 ) * batchingMatrix ).xyz;
		cotWearWorld = batchingMatrix * cotWearWorld;
	#endif
	#ifdef USE_INSTANCING
		cotWearScale *= length( instanceMatrix[ 0 ].xyz );
		cotWearUp = ( vec4( cotWearUp, 0.0 ) * instanceMatrix ).xyz;
		cotWearWorld = instanceMatrix * cotWearWorld;
	#endif
	cotWearPos *= cotWearScale;
	#ifdef USE_BATCHING
		cotWearPos += cotWearSeed( getIndirectIndex( gl_DrawID ) );
	#endif
	#ifdef USE_INSTANCING
		cotWearPos += cotWearSeed( float( gl_InstanceID ) );
	#endif
	vec3 cotWearV = normalize( cotWearUp );
	vec3 cotWearE1 = normalize( cross( cotWearV, abs( cotWearV.x ) < 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ) ) );
	vec2 cotWearLevel = vec2( dot( cotWearPos, cotWearE1 ), dot( cotWearPos, cross( cotWearV, cotWearE1 ) ) );
	cotWearWorld = modelMatrix * cotWearWorld;
	vec3 cotWearN = inverseTransformDirection( transformedNormal, viewMatrix );
	vec3 cotWearRel = cotWearWorld.xyz - uVehGround.xyz;
	vCotWearPos = vec4( cotWearPos, dot( cotWearRel, uVehUp ) );
	vec3 cotSootRel = cotWearWorld.xyz - uVehWearSoot.xyz;
	float cotSootAlong = dot( cotSootRel, uVehWearSootAxis.xyz );
	vCotWearFrame = vec4( dot( cotWearN, uVehUp ), dot( cotWearN, uVehWearFwd ), dot( cotWearRel, uVehWearFwd ), cotSootAlong );
	vCotWearSide = vec3( length( cotSootRel - uVehWearSootAxis.xyz * cotSootAlong ), cotWearLevel );
`;

/** The value noise (inside the receipts' GLSL subset: vehicleFieldWear.selftest.mjs runs these bodies). */
export const FIELD_WEAR_NOISE_GLSL = /* glsl */ `
float cotWearHash( vec2 p ) {
	// small coefficients: on the wrapped lattice the sine's argument stays under about 110 rad, where every GPU's sine
	// keeps its precision (past 10^4 rad some lose it and the hash turns into stripes)
	return fract( sin( dot( p, vec2( 0.1271, 0.3117 ) ) ) * 43758.5453 );
}
float cotWearNoise( vec2 x ) {
	// the lattice wraps every 256 cells, keeping the hash's argument small; the 128-cell shift puts the wrap's seam half a
	// period from the mesh origin (49 m out for the low octave, 10 m for the fine one), never down a hull's centreline
	vec2 i = floor( x + 128.0 );
	i -= floor( i * 0.00390625 ) * 256.0;
	vec2 f = fract( x );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( cotWearHash( i ), cotWearHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( cotWearHash( i + vec2( 0.0, 1.0 ) ), cotWearHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float cotWearHash3( vec3 p ) {
	return fract( sin( dot( p, vec3( 0.1271, 0.3117, 0.0919 ) ) ) * 43758.5453 );
}
float cotWearNoise3( vec3 x ) {
	// the runs: the same lattice in 3D (wrapped every 256 cells, its argument under about 140 rad; the seam 9 m out)
	vec3 i = floor( x + 128.0 );
	i -= floor( i * 0.00390625 ) * 256.0;
	vec3 f = fract( x );
	vec3 u = f * f * ( 3.0 - 2.0 * f );
	float lo = mix( mix( cotWearHash3( i ), cotWearHash3( i + vec3( 1.0, 0.0, 0.0 ) ), u.x ),
		mix( cotWearHash3( i + vec3( 0.0, 1.0, 0.0 ) ), cotWearHash3( i + vec3( 1.0, 1.0, 0.0 ) ), u.x ), u.y );
	float hi = mix( mix( cotWearHash3( i + vec3( 0.0, 0.0, 1.0 ) ), cotWearHash3( i + vec3( 1.0, 0.0, 1.0 ) ), u.x ),
		mix( cotWearHash3( i + vec3( 0.0, 1.0, 1.0 ) ), cotWearHash3( i + vec3( 1.0, 1.0, 1.0 ) ), u.x ), u.y );
	return mix( lo, hi, u.z );
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
varying vec3 vCotWearSide;
${FIELD_WEAR_NOISE_GLSL}`;

/**
 * The field wear (inside the receipts' GLSL subset). Inputs: wearH (metres above the ground contact along the vehicle's
 * up), wearUp (the face's world normal along that up), wearBack (how squarely it faces the stern: the tracks throw their
 * rooster tail up the rear plate), wearAlong (the station along the hull, the vehicle's own metres), wearSootAlong /
 * wearSootOff (along and off the bound soot source's axis), wearRelief (the plate's normal-map relief: seams, welds,
 * bolts, rings), wearFoot (metres one pixel spans), wearNear (1 where the fine octave resolves, fading to 0 by 2.2 cm a
 * pixel), wearSootIn (the pixel lies inside the bound soot source's reach), wearN1 / wearN2 (the low and fine noise
 * octaves, 0..1), wearRuns (soft vertical runs up close, 0.5 at range), wearStrength, wearRole, wearHull, wearSoot,
 * wearSootAxis, soilDeep, soilSplash, soilSettle. In and out: wearAlbedo (linear), wearRough, wearMetal.
 * Order: the thrown coat and the settled film; up close, track iron and bare steel worn smooth, chips along the plate's
 * relief, boots' rubbing on the walkways, grime and rust runs; then a cap on how far all of it may lighten the surface,
 * and last the soot of the exhaust or the muzzle. Round 5's GPU review (2026-10-08): every breakup is soft-edged and
 * low-contrast (a thresholded fine octave drew "digital camo" blotches on the M60A1's mud flaps), the spatter dots are
 * gone ("ink-blot specks"), and nothing may lighten a surface by more than about a third: the vehicle readability floor
 * scales a shaded texel's light by its albedo over its paint's mean, so a coat that lit the dark track band drew "the
 * cream outline round the tracks" in shade.
 */
export const FIELD_WEAR_CORE_GLSL = /* glsl */ `
	float wearL0 = dot( wearAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
	float wearFar = smoothstep( 0.06, 0.12, wearFoot );
	float n1 = mix( wearN1, 0.5, wearFar );
	float n2 = mix( 0.5, wearN2, wearNear );
	float runs = mix( 0.5, wearRuns, wearNear );
	// the coat's top line wanders with the low octave and hangs in soft runs up close
	float lineH = wearH - wearBack * 0.35 + ( n1 - 0.5 ) * 0.6 + ( runs - 0.5 ) * 0.24 + ( n2 - 0.5 ) * 0.05;
	float gearCoat = step( 1.5, wearRole.z ) * ( 1.0 - step( 2.5, wearRole.z ) * step( wearRole.z, 3.5 ) );
	if ( lineH < 1.45 ) {
		// thrown up off the tracks; the running gear (classes 2, 4 and 5) keeps its packed deep colour all round
		float coat = 1.0 - smoothstep( 0.2, 1.45, lineH );
		float deep = max( clamp( 1.0 - smoothstep( 0.05, 0.75, lineH ) + ( n1 - 0.5 ) * 0.5, 0.0, 1.0 ), gearCoat );
		vec3 coatCol = mix( soilSplash.rgb, soilDeep.rgb, deep ) * ( 0.9 + 0.2 * n1 );
		// soft, low-contrast breakup: the fine octave and the runs nudge the cover where it is partial, never threshold it
		float cover = clamp( coat + ( ( n2 - 0.5 ) * 0.3 + ( runs - 0.5 ) * 0.3 ) * coat * ( 1.0 - coat ) * 4.0, 0.0, 1.0 );
		cover *= 0.85 + 0.3 * clamp( - wearUp, 0.0, 1.0 ) + 0.15 * clamp( wearUp, 0.0, 1.0 ) + 0.2 * wearBack;
		float coatAmt = clamp( cover * wearStrength * wearRole.x, 0.0, 1.0 );
		wearAlbedo = mix( wearAlbedo, coatCol, coatAmt * 0.85 );
		wearRough = mix( wearRough, mix( 1.0, 0.35, soilDeep.a * deep ), coatAmt );
		wearMetal = mix( wearMetal, 0.0, coatAmt );
	}
	if ( wearUp > 0.3 && wearRole.y > 0.0 ) {
		// the dry film settles on faces that look up, thinner up the turret
		float settle = smoothstep( 0.3, 0.85, wearUp ) * soilSettle.a * wearRole.y * ( 0.45 + 0.55 * n1 )
			* ( 1.0 - 0.5 * smoothstep( 1.2, 2.8, wearH ) ) * ( 0.9 + 0.2 * n2 );
		float settleAmt = clamp( settle * wearStrength, 0.0, 1.0 ) * 0.55;
		wearAlbedo = mix( wearAlbedo, soilSettle.rgb, settleAmt );
		wearRough = mix( wearRough, 1.0, settleAmt );
	}
	if ( wearNear > 0.0 ) {
		float isPaint = step( 0.5, wearRole.z ) * step( wearRole.z, 1.5 );
		float isIron = step( 1.5, wearRole.z ) * step( wearRole.z, 2.5 );
		float isSteel = step( 2.5, wearRole.z ) * step( wearRole.z, 3.5 );
		// worn smooth where wheels, ground, hands and tools rub: a dull dark sheen, never a bright edge
		float polish = isIron * smoothstep( 0.45, 0.85, wearUp ) * ( 1.0 - smoothstep( 1.15, 1.4, wearH ) ) * smoothstep( 0.4, 0.7, n2 );
		polish = max( polish, isSteel * smoothstep( 0.55, 0.75, n2 * 0.6 + n1 * 0.4 ) ) * wearStrength * wearNear;
		wearAlbedo = mix( wearAlbedo, vec3( 0.075, 0.073, 0.07 ), polish * 0.5 );
		wearRough = mix( wearRough, 0.6, polish * 0.6 );
		wearMetal = mix( wearMetal, 0.3, polish * 0.5 );
		// chips along the plate's own relief (seams, welds, bolts, rings), sparse and soft-edged
		float chip = isPaint * smoothstep( 0.4, 0.8, wearRelief ) * smoothstep( 0.6, 0.76, n2 + ( n1 - 0.5 ) * 0.2 ) * wearNear * wearStrength;
		// where crews climb and walk: the front fenders and the glacis top, and the rear deck's edge
		float walkway = step( 0.05, wearHull.z ) * isPaint * smoothstep( 0.8, 0.95, wearUp ) * smoothstep( 0.7, 0.9, wearH )
			* ( 1.0 - smoothstep( wearHull.z + 0.05, wearHull.z + 0.3, wearH ) )
			* max( smoothstep( wearHull.y - 1.7, wearHull.y - 0.8, wearAlong ), 1.0 - smoothstep( wearHull.x + 0.5, wearHull.x + 1.0, wearAlong ) );
		walkway *= smoothstep( 0.42, 0.6, n1 ) * wearStrength * wearNear;
		float rubLuma = dot( wearAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
		wearAlbedo = mix( wearAlbedo, mix( wearAlbedo, vec3( rubLuma ), 0.25 ) * 1.08, walkway * 0.7 );
		wearRough = mix( wearRough, 0.55, walkway * 0.7 );
		chip = max( chip, walkway * smoothstep( 0.64, 0.78, wearN2 ) );
		wearAlbedo = mix( wearAlbedo, vec3( 0.05, 0.048, 0.044 ), chip * 0.65 );
		wearRough = mix( wearRough, 0.55, chip * 0.8 );
		wearMetal = mix( wearMetal, 0.3, chip * 0.8 );
		// grime and rust runs hanging down the vertical painted plates: the runs' crests where the low octave allows, thin,
		// soft and sparse, a multiply
		float streakZone = isPaint * ( 1.0 - smoothstep( 0.2, 0.45, abs( wearUp ) ) ) * smoothstep( 0.45, 0.8, wearH )
			* ( 1.0 - smoothstep( 2.6, 3.0, wearH ) );
		float streak = smoothstep( 0.66, 0.86, runs ) * smoothstep( 0.52, 0.72, n1 ) * streakZone * wearNear * wearStrength;
		vec3 streakTint = mix( vec3( 0.74, 0.72, 0.69 ), vec3( 0.8, 0.67, 0.55 ), smoothstep( 0.6, 0.8, n1 ) );
		wearAlbedo *= mix( vec3( 1.0 ), streakTint, streak * 0.45 );
	}
	// the wear darkens freely but lightens a surface by at most about a third: dark gear stays dark (under every soil and
	// in shade, where the readability floor scales a texel's light by its albedo over its paint's mean), and a pale soil
	// tints a deck rather than washing it white
	float wearL = dot( wearAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
	wearAlbedo *= min( 1.0, ( wearL0 * 1.35 + 0.01 ) / max( wearL, 0.0001 ) );
	if ( wearSootIn ) {
		// the bound source's soot: the exhaust's fan or the muzzle's carbon (the glue tests its reach)
		float sootLen = max( wearSootAxis.w, 0.05 );
		float sootD = length( vec2( wearSootAlong / sootLen, wearSootOff / wearSoot.w ) );
		float soot = ( 1.0 - smoothstep( 0.12, 1.0, sootD ) ) * smoothstep( - 0.35, 0.0, wearSootAlong / sootLen ) * wearRole.w;
		soot = clamp( soot * 1.3 * ( 0.62 + 0.38 * n1 + ( n2 - 0.5 ) * 0.16 ), 0.0, 1.0 ) * wearStrength;
		wearAlbedo = mix( wearAlbedo, vec3( 0.016, 0.015, 0.014 ), soot * 0.8 );
		wearRough = mix( wearRough, 0.95, soot );
		wearMetal = mix( wearMetal, 0.0, soot );
	}
`;

/**
 * Fragment glue (after the normal maps, before any light reads the surface): the vehicle and soot frames from the vertex
 * stage (the back face of a double-sided card turns them over, as three's own normal does; a back-side material's normal
 * is already flipped in the vertex stage), the footprint and the projection plane in uniform control flow, the noise
 * (the low octave on a turned lattice, so its cells never line up with a plate's edges; the fine octave and the runs only
 * up close), then the core.
 */
export const FIELD_WEAR_FRAGMENT = /* glsl */ `
	if ( uVehGround.w > 0.0 && uVehWearRole.x + uVehWearRole.y + uVehWearRole.w > 0.0 ) {
		float wearSide = 1.0;
		#ifdef DOUBLE_SIDED
			wearSide = faceDirection;
		#endif
		float wearH = vCotWearPos.w;
		float wearUp = vCotWearFrame.x * wearSide;
		float wearBack = clamp( - vCotWearFrame.y * wearSide, 0.0, 1.0 );
		float wearAlong = vCotWearFrame.z;
		float wearSootAlong = vCotWearFrame.w;
		float wearSootOff = vCotWearSide.x;
		// the pattern's frame and footprint from the screen derivatives: the face's own plane in the mesh frame picks the
		// projection (a side plate's z and y, a deck's x and z), so the noise keeps its shape on every plate
		vec3 wearDx = dFdx( vCotWearPos.xyz );
		vec3 wearDy = dFdy( vCotWearPos.xyz );
		float wearFoot = length( abs( wearDx ) + abs( wearDy ) );
		vec3 wearFace = abs( cross( wearDx, wearDy ) );
		float wearRelief = 0.0;
		#ifdef USE_NORMALMAP_TANGENTSPACE
			wearRelief = length( mapN.xy );
		#endif
		// the fine marks resolve only up close; past that, a pixel the coat, the film and the soot cannot reach (a turret's
		// sides, most of a barrel) skips the noise and the core
		float wearNear = 1.0 - smoothstep( 0.008, 0.022, wearFoot );
		vec4 wearSoot = uVehWearSoot;
		vec4 wearSootAxis = uVehWearSootAxis;
		bool wearSootIn = wearSoot.w > 0.0 && wearSootOff < wearSoot.w && wearSootAlong > - 0.35 * wearSootAxis.w
			&& wearSootAlong < wearSootAxis.w;
		if ( wearH < 1.75 || wearUp > 0.3 || wearNear > 0.0 || wearSootIn ) {
			vec3 wearP = vCotWearPos.xyz;
			vec2 wearQ = wearFace.x > max( wearFace.y, wearFace.z ) ? wearP.zy : ( wearFace.y > wearFace.z ? wearP.xz : wearP.xy );
			wearQ = vec2( wearQ.x * 0.8 - wearQ.y * 0.6, wearQ.x * 0.6 + wearQ.y * 0.8 );
			float wearN1 = cotWearNoise( wearQ * 2.6 );
			float wearN2 = 0.5;
			float wearRuns = 0.5;
			if ( wearNear > 0.0 ) {
				wearN2 = cotWearNoise( wearQ * 12.0 + vec2( 7.3, 2.9 ) );
				// the runs hang down the faces that stand up, and never on the running gear (classes 2, 4 and 5: it turns
				// under a pattern laid level with the ground)
				float wearRunsW = ( 1.0 - smoothstep( 0.7, 0.95, abs( wearUp ) ) ) * ( 1.0 - step( 1.5, uVehWearRole.z )
					* ( 1.0 - step( 2.5, uVehWearRole.z ) * step( uVehWearRole.z, 3.5 ) ) );
				if ( wearRunsW > 0.0 ) {
					wearRuns = mix( 0.5, cotWearNoise3( vec3( vCotWearSide.yz * 14.0, wearH * 1.3 ) + vec3( 3.1, 5.7, 0.6 ) ), wearRunsW );
				}
			}
			float wearStrength = uVehGround.w;
			vec4 wearRole = uVehWearRole;
			vec4 wearHull = uVehWearHull;
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
	}
`;
