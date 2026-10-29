// Type 99 family armor envelopes. These are combat surfaces, not render-only
// diagram art: sim/armor.ts traces shells against these exact quads.
//
// The original Type 99 rows inherited mbtArmor's generic two-box side view.
// Both playable vehicles were later rebuilt around measured, multi-course
// hulls and welded arrow turrets, leaving the combat envelope visibly shallow
// and offset. Keep this pure-data module shared by the two distinct builders
// so their collision geometry can follow each authored silhouette without
// importing either render-heavy profile.

import type {
  ArmorEnvelope,
  ArmorPlate,
  CrewBox,
  ModuleBox,
  PlateOptions,
  Vec3Tuple,
} from '../specHelpers.ts';
import type { ModuleId } from '../../sim/moduleCatalog.ts';

type MutableVec3 = [number, number, number];
type Quad = [MutableVec3, MutableVec3, MutableVec3, MutableVec3];
type YZPoint = readonly [number, number];
type SideStation = readonly [number, number, number, number];
type DeckStation = readonly [number, number, number];

interface EraReduction {
  readonly keReduction: number;
  readonly ceFlatMm: number;
}

const FY4: EraReduction = Object.freeze({ keReduction: 0.22, ceFlatMm: 380 });

function armorPlate(
  name: string,
  physicalMm: number,
  verts: Quad,
  options: PlateOptions = {},
): ArmorPlate {
  return {
    name,
    verts,
    physicalMm,
    keMm: options.keMm ?? physicalMm,
    ceMm: options.ceMm ?? options.keMm ?? physicalMm,
    kind: options.kind || 'main',
    era: options.era || null,
    moduleLink: options.moduleLink || null,
    gunFollow: !!options.gunFollow,
  };
}

// +Z-facing planar quad. `bottom`/`top` are [y,z] profile points.
function frontPlate(
  name: string,
  physicalMm: number,
  x0: number,
  x1: number,
  bottom: YZPoint,
  top: YZPoint,
  options: PlateOptions = {},
): ArmorPlate {
  return armorPlate(name, physicalMm, [
    [x0, bottom[0], bottom[1]], [x1, bottom[0], bottom[1]],
    [x1, top[0], top[1]], [x0, top[0], top[1]],
  ], options);
}

// Mirrored side plates from two profile stations [z, bottomY, topY, x].
// The winding faces away from the hull on each side.
function sidePlatePair(
  name: string,
  physicalMm: number,
  front: SideStation,
  rear: SideStation,
  options: PlateOptions = {},
): [ArmorPlate, ArmorPlate] {
  const xf = front[3], xr = rear[3];
  return [
    armorPlate(`${name}_R`, physicalMm, [
      [xf, front[1], front[0]], [xr, rear[1], rear[0]],
      [xr, rear[2], rear[0]], [xf, front[2], front[0]],
    ], options),
    armorPlate(`${name}_L`, physicalMm, [
      [-xr, rear[1], rear[0]], [-xf, front[1], front[0]],
      [-xf, front[2], front[0]], [-xr, rear[2], rear[0]],
    ], options),
  ];
}

// Upward-facing deck quad between [z, y, halfWidth] stations.
function deckPlate(
  name: string,
  physicalMm: number,
  front: DeckStation,
  rear: DeckStation,
  options: PlateOptions = {},
): ArmorPlate {
  return armorPlate(name, physicalMm, [
    [-front[2], front[1], front[0]], [front[2], front[1], front[0]],
    [rear[2], rear[1], rear[0]], [-rear[2], rear[1], rear[0]],
  ], options);
}

function rearPlate(
  name: string,
  physicalMm: number,
  halfWidth: number,
  z: number,
  bottomY: number,
  topY: number,
  options: PlateOptions = {},
): ArmorPlate {
  return armorPlate(name, physicalMm, [
    [halfWidth, bottomY, z], [-halfWidth, bottomY, z],
    [-halfWidth, topY, z], [halfWidth, topY, z],
  ], options);
}

// A welded cheek is commonly a deliberately twisted four-corner surface.
// Combat quads must remain planar, so represent it as the same two triangles
// the rendered slab uses. Repeating the final vertex keeps the existing
// convex-quad trace contract while preserving the exact triangular face.
function splitFace(
  name: string,
  physicalMm: number,
  [a, b, c, d]: Quad,
  options: PlateOptions = {},
  sharedName = true,
): ArmorPlate[] {
  return [
    armorPlate(sharedName ? name : `${name}_A`, physicalMm, [a, b, c, c], options),
    armorPlate(sharedName ? name : `${name}_B`, physicalMm, [a, c, d, d], options),
  ];
}

interface VtFamilyArmorConfig {
  readonly heightScale: number;
  readonly widthScale: number;
  readonly depthScale: number;
  readonly chevronDepthScale: number;
  readonly frontShellLengthScale: number;
  readonly chevronInnerAdvanceM: number;
  readonly chevronOuterAdvanceM: number;
  readonly chevronLiftM: number;
  readonly rearExtensionM: number;
  readonly rearUndersideLiftM: number;
  readonly rearCrownLiftM: number;
}

// Combat counterpart to the VT-family visual turret. Both variants share
// the same welded chevron load path, while their station scales remain
// independent so a Type 99A hit shell never silently aliases VT-4A1 geometry.
function vtFamilyTurretPlates(config: VtFamilyArmorConfig): ArmorPlate[] {
  const h = config.heightScale / 0.75;
  const x = (value: number): number => value * config.widthScale;
  const y = (value: number): number => value * h;
  const z = (value: number): number => value * config.depthScale;
  const cz = (value: number): number => value * config.chevronDepthScale;
  const shellZ = (value: number): number => z(value >= -0.58
    ? -0.58 + (value + 0.58) * config.frontShellLengthScale
    : value);
  const rearProgress = (value: number): number => Math.max(0, Math.min(1,
    (-value - 1.58) / (2.68 - 1.58),
  ));
  const rearZ = (value: number): number => (
    shellZ(value) - config.rearExtensionM * rearProgress(value)
  );
  const rearBottomY = (value: number, zStation: number): number => (
    y(value) + config.rearUndersideLiftM * rearProgress(zStation)
  );
  const rearTopY = (value: number, zStation: number): number => (
    y(value) + config.rearCrownLiftM * rearProgress(zStation)
  );
  const chevronAdvance = (xStation: number): number => {
    const progress = Math.max(0, Math.min(1, (xStation - 0.22) / (1.68 - 0.22)));
    return config.chevronInnerAdvanceM
      + (config.chevronOuterAdvanceM - config.chevronInnerAdvanceM) * progress;
  };
  const chevronZ = (value: number, xStation: number): number => (
    cz(value) + chevronAdvance(xStation)
  );
  const chevronY = (value: number): number => y(value) + config.chevronLiftM;
  return [
    ...splitFace('turret_era_R', 15, [
      [x(0.22), chevronY(0.03), chevronZ(0.80, 0.22)],
      [x(1.60), chevronY(0.075), chevronZ(-0.12, 1.68)],
      [x(1.48), chevronY(0.56), chevronZ(-0.54, 1.68)],
      [x(0.22), chevronY(0.63), chevronZ(0.48, 0.22)],
    ], { kind: 'era', era: FY4 }),
    ...splitFace('turret_era_L', 15, [
      [x(-1.60), chevronY(0.075), chevronZ(-0.12, 1.68)],
      [x(-0.22), chevronY(0.03), chevronZ(0.80, 0.22)],
      [x(-0.22), chevronY(0.63), chevronZ(0.48, 0.22)],
      [x(-1.48), chevronY(0.56), chevronZ(-0.54, 1.68)],
    ], { kind: 'era', era: FY4 }),
    ...splitFace('turret_cheek_R', 700, [
      [x(0.20), chevronY(0.03), chevronZ(0.78, 0.22)],
      [x(1.60), chevronY(0.075), chevronZ(-0.12, 1.68)],
      [x(1.48), chevronY(0.56), chevronZ(-0.54, 1.68)],
      [x(0.20), chevronY(0.615), chevronZ(0.46, 0.22)],
    ], { keMm: 600, ceMm: 850 }),
    ...splitFace('turret_cheek_L', 700, [
      [x(-1.60), chevronY(0.075), chevronZ(-0.12, 1.68)],
      [x(-0.20), chevronY(0.03), chevronZ(0.78, 0.22)],
      [x(-0.20), chevronY(0.615), chevronZ(0.46, 0.22)],
      [x(-1.48), chevronY(0.56), chevronZ(-0.54, 1.68)],
    ], { keMm: 600, ceMm: 850 }),
    frontPlate('mantlet', 380, x(-0.25), x(0.25),
      [y(0.10), z(0.82)], [y(0.50), z(0.62)],
      { keMm: 380, ceMm: 450, gunFollow: true }),
    ...sidePlatePair('turret_side_forward', 300,
      [shellZ(0.18), y(0.04), y(0.62), x(1.52)],
      [z(-1.52), y(0.08), y(0.66), x(1.54)],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_side_rear', 300,
      [z(-1.52), y(0.08), y(0.66), x(1.54)],
      [rearZ(-2.48), rearBottomY(0.12, -2.48), rearTopY(0.64, -2.48), x(0.82)],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_bustle_side', 55,
      [rearZ(-1.68), rearBottomY(0.10, -1.68), rearTopY(0.60, -1.68), x(1.38)],
      [rearZ(-2.68), rearBottomY(0.10, -2.68), rearTopY(0.57, -2.68), x(1.24)],
      { keMm: 55, ceMm: 55 }),
    ...sidePlatePair('turret_stowage_screen', 10,
      [z(-0.35), y(0.22), y(0.62), x(1.68)],
      [rearZ(-2.72), rearBottomY(0.18, -2.72), rearTopY(0.58, -2.72), x(1.42)],
      { kind: 'spaced' }),
    rearPlate('turret_rear', 55, x(1.24), rearZ(-2.68),
      rearBottomY(0.10, -2.68), rearTopY(0.57, -2.68)),
    deckPlate('turret_roof_forward', 45,
      [z(0.42), y(0.69), x(0.68)],
      [rearZ(-1.76), rearTopY(0.70, -1.76), x(1.03)]),
    deckPlate('turret_roof_bustle', 45,
      [rearZ(-1.76), rearTopY(0.70, -1.76), x(1.03)],
      [rearZ(-2.66), rearTopY(0.57, -2.66), x(0.46)]),
  ];
}

function moduleBox(
  module: ModuleId,
  min: Vec3Tuple,
  max: Vec3Tuple,
  turretLocal = false,
): ModuleBox {
  return { module, min, max, turretLocal };
}

function crewBox(
  crew: string,
  min: Vec3Tuple,
  max: Vec3Tuple,
  turretLocal = false,
): CrewBox {
  return { crew, min, max, turretLocal };
}

// The retired Longwei VT-derivative envelope (through release 232). The Type 96B X takes its donor frame from this
// record (suppliedSourceFleetSpecs.ts), so it stays byte-for-byte what that frame was when the Longwei was rebuilt.
function type96BFrameArmor(): ArmorEnvelope {
  const hullPlates: ArmorPlate[] = [
    // FY-4 is split at the centerline so one impact cannot spend both halves.
    frontPlate('glacis_era_L', 15, -1.34, 0, [1.215, 3.02], [1.50, 2.02],
      { kind: 'era', era: FY4 }),
    frontPlate('glacis_era_R', 15, 0, 1.34, [1.215, 3.02], [1.50, 2.02],
      { kind: 'era', era: FY4 }),
    ...sidePlatePair('skirt_era', 15,
      [2.72, 0.61, 1.35, 1.865], [-2.10, 0.61, 1.35, 1.865],
      { kind: 'era', era: FY4 }),

    frontPlate('upper_glacis', 550, -1.70, 1.70, [0.70, 3.30], [1.50, 2.02],
      { keMm: 500, ceMm: 700 }),
    frontPlate('lower_front', 100, -1.08, 1.08, [0.385, 3.34], [0.70, 3.30],
      { keMm: 130, ceMm: 130 }),

    // The central pan is correctly deep between the tracks; the upper
    // sponson then steps outward to the visible 1.70 m shoulder.
    ...sidePlatePair('hull_side_lower_bow', 100,
      [3.30, 0.385, 0.70, 1.08], [1.84, 0.385, 1.30, 1.10],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_center', 100,
      [1.84, 0.385, 1.30, 1.10], [-1.21, 0.385, 1.30, 1.10],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_engine', 100,
      [-1.21, 0.385, 1.30, 1.10], [-3.52, 0.385, 1.30, 1.08],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_bow', 100,
      [3.02, 1.30, 1.57, 1.70], [1.84, 1.30, 1.50, 1.70],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_center', 100,
      [1.84, 1.30, 1.50, 1.70], [-1.21, 1.30, 1.50, 1.70],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_ramp', 100,
      [-1.21, 1.30, 1.50, 1.70], [-1.48, 1.30, 1.78, 1.70],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_engine', 100,
      [-1.48, 1.30, 1.78, 1.70], [-3.52, 1.30, 1.78, 1.62],
      { keMm: 100, ceMm: 100 }),

    ...sidePlatePair('skirt_front', 8,
      [3.34, 0.47, 1.47, 1.855], [-2.10, 0.47, 1.47, 1.855],
      { kind: 'spaced' }),
    ...sidePlatePair('skirt_rear', 8,
      [-2.10, 0.44, 1.47, 1.855], [-3.58, 0.44, 1.47, 1.855],
      { kind: 'spaced' }),
    // Legacy fallback only. createTank replaces these with prisms derived
    // from the six-wheel running gear before live shell tracing.
    ...sidePlatePair('track', 20,
      [3.45, 0.03, 1.28, 1.77], [-3.47, 0.03, 1.28, 1.77],
      { kind: 'external', moduleLink: 'trackR' }).map((plate, index): ArmorPlate => ({
        ...plate,
        name: index ? 'track_L' : 'track_R',
        moduleLink: index ? 'trackL' : 'trackR',
      })),
    rearPlate('hull_rear', 45, 1.62, -3.52, 0.385, 1.78),
    deckPlate('hull_roof_fighting', 45, [2.02, 1.50, 1.67], [-1.21, 1.50, 1.67]),
    deckPlate('hull_roof_powerpack_ramp', 45, [-1.21, 1.50, 1.67], [-1.48, 1.78, 1.67]),
    deckPlate('hull_roof_engine', 45, [-1.48, 1.78, 1.60], [-3.52, 1.78, 1.58]),
  ];

  const turretPlates = vtFamilyTurretPlates({
    heightScale: 0.82, widthScale: 0.96, depthScale: 0.94, chevronDepthScale: 0.94,
    frontShellLengthScale: 0.90,
    chevronInnerAdvanceM: 0.18, chevronOuterAdvanceM: 0.04, chevronLiftM: 0,
    rearExtensionM: 0.50, rearUndersideLiftM: 0.42, rearCrownLiftM: 0.10,
  });

  return {
    boundingRadiusM: 7.7,
    turretPivot: [0, 1.57, 0.64],
    gunPivot: [0, 0.3198, 0.74],
    gunBarrel: { lengthM: 6.454, radiusM: 0.071 },
    hullPlates,
    turretPlates,
    modules: [
      moduleBox('engine', [-1.10, 0.45, -3.42], [1.10, 1.74, -1.60]),
      moduleBox('fuelTank', [0.48, 0.48, -1.58], [1.08, 1.24, -0.62]),
      moduleBox('ammoRack', [-0.95, 0.46, -0.62], [0.95, 1.15, 0.70]),
      moduleBox('turretRing', [-1.05, 1.52, -0.36], [1.05, 1.66, 1.64]),
      moduleBox('radio', [-0.90, 0.46, -2.88], [-0.28, 0.88, -1.34], true),
      moduleBox('optics', [-0.82, 0.92, -1.30], [1.02, 2.24, 0.62], true),
      // Internal breech only. The external barrel is traced separately from
      // gunBarrel and must not make the damage volume protrude through the
      // newly integrated chevron nose.
      moduleBox('gun', [-0.24, 0.12, -0.58], [0.24, 0.72, 0.70], true),
      moduleBox('trackL', [-1.78, 0.0, -3.47], [-1.10, 1.28, 3.45]),
      moduleBox('trackR', [1.10, 0.0, -3.47], [1.78, 1.28, 3.45]),
    ],
    crew: [
      crewBox('driver', [-0.42, 0.62, 1.20], [0.42, 1.42, 2.34]),
      crewBox('gunner', [0.10, 0.10, 0.02], [0.86, 0.82, 0.70], true),
      crewBox('commander', [0.12, 0.12, -1.36], [0.94, 0.88, -0.34], true),
    ],
  };
}

// ZTZ-99 Longwei, release 262 (profiles/longwei.ts): the arrowhead cheeks, slab side modules, bins and bustle of the
// 99A-proportioned turret. Plate strengths carry release 233's values (cheek 700 / KE 600 / CE 850 behind FY-4, sides
// 300, bustle 55, roof 45, mantlet 380); every quad is the drawn surface. The cheek geometry (longwei.ts): the front line
// runs from (|x| 0.30, z 1.55) to (1.42, 0.72), the face from y 0.02 up to 0.44 leaning back 0.08 m, the top rising to
// the roof line (0.76) 0.40 m behind the front edge.
const LONGWEI_THROAT_X = 0.30, LONGWEI_CHEEK_OUTER_X = 1.57;
const LONGWEI_CHEEK_SWEEP = (1.55 - 0.72) / (1.42 - 0.30);
const LONGWEI_CHEEK_LOW_Y = 0.045, LONGWEI_CHEEK_THROAT_TOP_Y = 0.28, LONGWEI_CHEEK_OUTER_TOP_Y = 0.62;
const LONGWEI_CHEEK_TOP_RUN_PER_RISE = 1.4;
const longweiCheekZ = (ax: number): number => 1.55 - (ax - LONGWEI_THROAT_X) * LONGWEI_CHEEK_SWEEP;
/** The cheek face's front-top edge height at |x| ax (it falls toward the gun throat). */
const longweiCheekTopY = (ax: number): number => LONGWEI_CHEEK_THROAT_TOP_Y
  + (LONGWEI_CHEEK_OUTER_TOP_Y - LONGWEI_CHEEK_THROAT_TOP_Y) * (ax - LONGWEI_THROAT_X) / (LONGWEI_CHEEK_OUTER_X - LONGWEI_THROAT_X);
/** A point on the (vertical) cheek face at |x| ax, height y. */
const longweiCheekFace = (side: number, ax: number, y: number): MutableVec3 => [side * ax, y, longweiCheekZ(ax)];

function longweiTurretPlates(): ArmorPlate[] {
  // the cassette field's outer face: the cheek face moved out 59 mm along its normal
  const faceNormal = (side: number): MutableVec3 => {
    const a = longweiCheekFace(side, LONGWEI_THROAT_X, LONGWEI_CHEEK_LOW_Y);
    const b = longweiCheekFace(side, LONGWEI_CHEEK_OUTER_X, LONGWEI_CHEEK_LOW_Y);
    const c = longweiCheekFace(side, LONGWEI_THROAT_X, LONGWEI_CHEEK_THROAT_TOP_Y);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[2] < 0) n = n.map((k) => -k);
    const len = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / len, n[1] / len, n[2] / len];
  };
  const out = (side: number, p: MutableVec3, d: number): MutableVec3 => {
    const n = faceNormal(side);
    return [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
  };
  const top = (side: number, ax: number, rear: boolean): MutableVec3 => (rear
    ? [side * ax, 0.76, longweiCheekZ(ax) - LONGWEI_CHEEK_TOP_RUN_PER_RISE * (0.76 - longweiCheekTopY(ax))]
    : [side * ax, longweiCheekTopY(ax), longweiCheekZ(ax)]);
  const plates: ArmorPlate[] = [];
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'R' : 'L';
    const quad = (a: MutableVec3, b: MutableVec3, c: MutableVec3, d: MutableVec3): Quad => (
      side > 0 ? [a, b, c, d] : [b, a, d, c]);
    plates.push(
      armorPlate(`turret_era_${tag}`, 15, quad(
        out(side, longweiCheekFace(side, 0.37, 0.08), 0.059), out(side, longweiCheekFace(side, 1.51, 0.08), 0.059),
        out(side, longweiCheekFace(side, 1.51, longweiCheekTopY(1.51) - 0.06), 0.059),
        out(side, longweiCheekFace(side, 0.37, longweiCheekTopY(0.37) - 0.06), 0.059)),
      { kind: 'era', era: FY4 }),
      armorPlate(`turret_cheek_${tag}`, 700, quad(
        longweiCheekFace(side, LONGWEI_THROAT_X, LONGWEI_CHEEK_LOW_Y), longweiCheekFace(side, LONGWEI_CHEEK_OUTER_X, LONGWEI_CHEEK_LOW_Y),
        longweiCheekFace(side, LONGWEI_CHEEK_OUTER_X, LONGWEI_CHEEK_OUTER_TOP_Y),
        longweiCheekFace(side, LONGWEI_THROAT_X, LONGWEI_CHEEK_THROAT_TOP_Y)),
      { keMm: 600, ceMm: 850 }),
      // the wedge's top plane, which takes most frontal hits at the balance range (its rake toward the throat): a little
      // lighter than the face. 262 fairness sweep at tier VI: the face's 700 mm swept the tier (0.80, 3/15 pairs fair),
      // 400 mm or less lost it (0.35, 3/15); 560 mm gives 0.56 with 8/15 (before the redesign 0.68, 8/15)
      armorPlate(`turret_cheek_upper_${tag}`, 560, quad(
        top(side, LONGWEI_THROAT_X, false), top(side, LONGWEI_CHEEK_OUTER_X, false),
        top(side, LONGWEI_CHEEK_OUTER_X, true), top(side, LONGWEI_THROAT_X, true)),
      { keMm: 490, ceMm: 690 }),
    );
  }
  return [
    ...plates,
    // the mantlet's face (gun frame 0.32..0.40 at the trunnion's z 0.74) and the throat brow over it
    frontPlate('mantlet', 380, -0.25, 0.25, [0.09, 1.10], [0.54, 1.10],
      { keMm: 380, ceMm: 450, gunFollow: true }),
    frontPlate('turret_brow', 300, -0.32, 0.32, [0.54, 1.11], [0.78, 1.11], { keMm: 300, ceMm: 420 }),
    // the side modules: the forward zone over the crew, the middle zone over the ring's rear quarter
    // the forward zone from the cheek wedge's outer corner (its face continues the module's) back over the crew
    ...sidePlatePair('turret_side_forward', 300,
      [0.60, 0.04, 0.74, 1.57], [-0.30, 0.04, 0.71, 1.57], { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_side_middle', 300,
      [-0.30, 0.04, 0.71, 1.57], [-1.05, 0.04, 0.71, 1.57], { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_side_rear', 300,
      [-1.05, 0.04, 0.70, 1.30], [-1.75, 0.36, 0.70, 1.24], { keMm: 300, ceMm: 420 }),
    // the bustle runs to the rear wall at -2.60 (262 critic round: the basket now reaches toward the stern)
    ...sidePlatePair('turret_bustle_side', 55,
      [-1.75, 0.36, 0.70, 1.24], [-2.60, 0.38, 0.70, 1.10], { keMm: 55, ceMm: 55 }),
    ...sidePlatePair('turret_stowage_screen', 10,
      [-1.07, 0.36, 0.73, 1.54], [-2.52, 0.36, 0.73, 1.54], { kind: 'spaced' }),
    rearPlate('turret_rear', 55, 1.06, -2.60, 0.38, 0.75),
    deckPlate('turret_roof_forward', 45, [0.66, 0.78, 1.12], [-1.75, 0.78, 1.08]),
    deckPlate('turret_roof_bustle', 45, [-1.75, 0.78, 1.08], [-2.60, 0.75, 0.96]),
  ];
}

/** The Longwei's hull (release 262, profiles/longwei.ts): the nose at (z 3.62, y 0.92) between a 22-degree upper and a
 * 52-degree lower glacis, the 2.20 m tub over a 0.47 m belly, sponsons to ±1.70 m over a 1.30 m floor, the 1.50 m roof,
 * the ramp to the 1.78 m powerpack deck, the inclined rear plate; the segmented skirts with one FY-5 course. Strengths
 * carry the frame's (glacis 550/KE 500/CE 700 behind FY-4, sides 100, roofs and rear 45). */
function longweiHullPlates(): ArmorPlate[] {
  const glacisY = (z: number): number => 1.50 - (z - 2.18) * ((1.50 - 0.92) / (3.62 - 2.18));
  return [
    frontPlate('glacis_era_L', 15, -1.10, 0, [glacisY(3.24) + 0.06, 3.24], [glacisY(2.30) + 0.06, 2.30],
      { kind: 'era', era: FY4 }),
    frontPlate('glacis_era_R', 15, 0, 1.10, [glacisY(3.24) + 0.06, 3.24], [glacisY(2.30) + 0.06, 2.30],
      { kind: 'era', era: FY4 }),
    frontPlate('upper_glacis', 550, -1.10, 1.10, [0.92, 3.62], [1.50, 2.18], { keMm: 500, ceMm: 700 }),
    frontPlate('sponson_front_L', 100, -1.70, -1.10, [1.30, 3.00], [1.50, 2.18], { keMm: 100, ceMm: 100 }),
    frontPlate('sponson_front_R', 100, 1.10, 1.70, [1.30, 3.00], [1.50, 2.18], { keMm: 100, ceMm: 100 }),
    frontPlate('lower_front', 100, -1.10, 1.10, [0.47, 3.27], [0.92, 3.62], { keMm: 130, ceMm: 130 }),
    ...sidePlatePair('hull_side_lower_bow', 100, [3.27, 0.47, 1.30, 1.10], [1.84, 0.47, 1.30, 1.10], { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_center', 100, [1.84, 0.47, 1.30, 1.10], [-1.21, 0.47, 1.30, 1.10], { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_engine', 100, [-1.21, 0.47, 1.30, 1.10], [-3.18, 0.47, 1.30, 1.10], { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_bow', 100, [2.98, 1.30, 1.33, 1.70], [1.84, 1.30, 1.50, 1.70], { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_center', 100, [1.84, 1.30, 1.50, 1.70], [-1.02, 1.30, 1.50, 1.70], { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_ramp', 100, [-1.02, 1.30, 1.50, 1.70], [-1.42, 1.30, 1.78, 1.70], { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_engine', 100, [-1.42, 1.30, 1.78, 1.70], [-3.48, 1.30, 1.78, 1.70], { keMm: 100, ceMm: 100 }),
    // one FY-5 course on the front three skirt panels, the segmented skirt the full length
    ...sidePlatePair('skirt_era', 15, [2.80, 0.86, 1.17, 1.858], [-0.16, 0.86, 1.17, 1.858], { kind: 'era', era: FY4 }),
    ...sidePlatePair('skirt_front', 8, [3.30, 0.50, 1.47, 1.836], [-0.16, 0.50, 1.47, 1.836], { kind: 'spaced' }),
    ...sidePlatePair('skirt_rear', 8, [-0.16, 0.50, 1.47, 1.836], [-3.42, 0.50, 1.47, 1.836], { kind: 'spaced' }),
    // Legacy fallback only. createTank replaces these with prisms derived from the six-wheel running gear.
    ...sidePlatePair('track', 20, [3.45, 0.03, 1.28, 1.77], [-3.47, 0.03, 1.28, 1.77],
      { kind: 'external', moduleLink: 'trackR' }).map((plate, index): ArmorPlate => ({
      ...plate, name: index ? 'track_L' : 'track_R', moduleLink: index ? 'trackL' : 'trackR',
    })),
    rearPlate('hull_rear', 45, 1.62, -3.46, 0.64, 1.78),
    deckPlate('hull_roof_fighting', 45, [2.18, 1.50, 1.67], [-1.02, 1.50, 1.67]),
    deckPlate('hull_roof_powerpack_ramp', 45, [-1.02, 1.50, 1.67], [-1.42, 1.78, 1.67]),
    deckPlate('hull_roof_engine', 45, [-1.42, 1.78, 1.68], [-3.48, 1.78, 1.68]),
  ];
}

function longweiArmor(): ArmorEnvelope {
  const frame = type96BFrameArmor();
  return {
    ...frame,
    hullPlates: longweiHullPlates(),
    turretPlates: longweiTurretPlates(),
    modules: [
      ...frame.modules.filter((box) => box.module !== 'optics' && box.module !== 'radio'),
      moduleBox('radio', [-0.90, 0.40, -2.25], [-0.28, 0.72, -1.80], true),
      moduleBox('optics', [-1.00, 0.76, -0.15], [0.92, 1.40, 0.48], true),
    ],
    // the 99A's crew layout: the gunner on the vehicle's left (+X), the commander on its right
    crew: [
      ...frame.crew.filter((box) => !box.turretLocal),
      crewBox('gunner', [0.14, 0.10, -0.95], [0.88, 0.82, 0.30], true),
      crewBox('commander', [-0.92, 0.12, -1.05], [-0.14, 0.88, 0.15], true),
    ],
  };
}

function ztz99A2PrototypeArmor(): ArmorEnvelope {
  const hullPlates: ArmorPlate[] = [
    frontPlate('glacis_era_L', 15, -1.22, 0, [1.02, 3.42], [1.64, 1.35],
      { kind: 'era', era: FY4 }),
    frontPlate('glacis_era_R', 15, 0, 1.22, [1.02, 3.42], [1.64, 1.35],
      { kind: 'era', era: FY4 }),
    ...sidePlatePair('skirt_era', 15,
      [3.18, 0.62, 1.48, 1.887], [-0.62, 0.62, 1.48, 1.887],
      { kind: 'era', era: FY4 }),
    frontPlate('upper_glacis', 550, -1.62, 1.62, [1.02, 3.55], [1.64, 1.35],
      { keMm: 500, ceMm: 700 }),
    frontPlate('lower_front', 100, -1.06, 1.06, [0.46, 3.55], [1.02, 3.55],
      { keMm: 130, ceMm: 130 }),

    ...sidePlatePair('hull_side_lower_bow', 100,
      [3.55, 0.46, 1.02, 1.06], [1.90, 0.46, 1.36, 1.06],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_center', 100,
      [1.90, 0.46, 1.36, 1.06], [-2.05, 0.46, 1.36, 1.06],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_lower_rear', 100,
      [-2.05, 0.46, 1.36, 1.06], [-4.05, 0.70, 1.36, 1.06],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_bow', 100,
      [3.55, 1.02, 1.10, 1.26], [1.90, 1.36, 1.64, 1.66],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_forward', 100,
      [1.90, 1.36, 1.64, 1.66], [-0.30, 1.36, 1.68, 1.66],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_engine', 100,
      [-0.30, 1.36, 1.68, 1.66], [-2.05, 1.36, 1.72, 1.66],
      { keMm: 100, ceMm: 100 }),
    ...sidePlatePair('hull_side_upper_rear', 100,
      [-2.05, 1.36, 1.72, 1.66], [-4.05, 1.36, 1.60, 1.66],
      { keMm: 100, ceMm: 100 }),

    ...sidePlatePair('skirt_front', 8,
      [3.48, 0.62, 1.56, 1.85], [-0.62, 0.62, 1.56, 1.85],
      { kind: 'spaced' }),
    ...sidePlatePair('skirt_rear', 8,
      [-0.62, 0.62, 1.56, 1.85], [-4.02, 0.62, 1.56, 1.85],
      { kind: 'spaced' }),
    ...sidePlatePair('track', 20,
      [3.40, 0.03, 1.24, 1.78], [-3.48, 0.03, 1.24, 1.78],
      { kind: 'external', moduleLink: 'trackR' }).map((plate, index): ArmorPlate => ({
        ...plate,
        name: index ? 'track_L' : 'track_R',
        moduleLink: index ? 'trackL' : 'trackR',
      })),
    rearPlate('hull_rear', 45, 1.66, -4.05, 0.70, 1.60),
    deckPlate('hull_roof_forward', 45, [1.90, 1.64, 1.62], [-0.30, 1.68, 1.66]),
    deckPlate('hull_roof_engine', 45, [-0.30, 1.68, 1.66], [-2.05, 1.72, 1.66]),
    deckPlate('hull_roof_rear', 45, [-2.05, 1.72, 1.66], [-4.05, 1.60, 1.62]),
  ];

  const turretPlates: ArmorPlate[] = [
    ...splitFace('turret_era_R', 15, [
      [0.20, 0.30, 1.60], [1.55, 0.08, 0.16],
      [1.14, 0.62, 0.10], [0.20, 0.82, 0.92],
    ], { kind: 'era', era: FY4 }, true),
    ...splitFace('turret_era_L', 15, [
      [-1.55, 0.08, 0.16], [-0.20, 0.30, 1.60],
      [-0.20, 0.82, 0.92], [-1.14, 0.62, 0.10],
    ], { kind: 'era', era: FY4 }, true),
    ...splitFace('turret_cheek_R', 700, [
      [0.18, 0.30, 1.68], [1.55, 0.08, 0.16],
      [1.14, 0.62, 0.10], [0.16, 0.82, 0.92],
    ], { keMm: 600, ceMm: 850 }),
    ...splitFace('turret_cheek_L', 700, [
      [-1.55, 0.08, 0.16], [-0.18, 0.30, 1.68],
      [-0.16, 0.82, 0.92], [-1.14, 0.62, 0.10],
    ], { keMm: 600, ceMm: 850 }),
    frontPlate('mantlet', 380, -0.25, 0.25, [0.18, 1.68], [0.62, 1.54],
      { keMm: 380, ceMm: 450, gunFollow: true }),
    ...sidePlatePair('turret_side_forward', 300,
      [0.16, 0.08, 0.89, 1.55], [-0.60, 0.08, 0.89, 1.62],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_side_center', 300,
      [-0.60, 0.08, 0.89, 1.62], [-1.55, 0.16, 0.89, 1.38],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_bustle_side', 55,
      [-1.55, 0.16, 0.89, 1.38], [-2.46, 0.22, 0.82, 1.30],
      { keMm: 55, ceMm: 55 }),
    ...sidePlatePair('turret_stowage_screen', 10,
      [0.46, 0.10, 0.56, 1.72], [-2.42, 0.10, 0.56, 1.72],
      { kind: 'spaced' }),
    rearPlate('turret_rear', 55, 1.30, -2.46, 0.22, 0.82),
    deckPlate('turret_roof_forward', 45, [1.42, 0.89, 0.48], [-1.55, 0.89, 1.35]),
    deckPlate('turret_roof_bustle', 45, [-1.55, 0.89, 1.35], [-2.46, 0.82, 1.30]),
  ];

  return {
    boundingRadiusM: 7.4,
    turretPivot: [0, 1.56, -0.15],
    gunPivot: [0, 0.39, 0.75],
    gunBarrel: { lengthM: 6.42, radiusM: 0.088 },
    hullPlates,
    turretPlates,
    modules: [
      moduleBox('engine', [-1.28, 0.50, -3.76], [1.28, 1.67, -1.72]),
      moduleBox('fuelTank', [0.52, 0.52, -1.70], [1.30, 1.30, -0.70]),
      moduleBox('ammoRack', [-1.00, 0.52, -0.72], [1.00, 1.24, 0.72]),
      moduleBox('turretRing', [-1.08, 1.39, -1.05], [1.08, 1.61, 0.92]),
      moduleBox('radio', [-0.96, 0.30, -1.62], [-0.26, 0.76, -0.82], true),
      moduleBox('optics', [0.12, 0.62, 0.16], [1.02, 1.34, 1.44], true),
      moduleBox('gun', [-0.24, 0.14, -0.58], [0.24, 0.72, 1.56], true),
      moduleBox('trackL', [-1.79, 0.0, -3.48], [-1.06, 1.24, 3.40]),
      moduleBox('trackR', [1.06, 0.0, -3.48], [1.79, 1.24, 3.40]),
    ],
    crew: [
      crewBox('driver', [-0.42, 0.62, 1.05], [0.42, 1.50, 2.40]),
      crewBox('gunner', [0.10, 0.12, 0.08], [0.86, 0.82, 1.02], true),
      crewBox('commander', [0.14, 0.12, -1.22], [0.92, 0.86, -0.24], true),
    ],
  };
}

function ztz99A2Armor(): ArmorEnvelope {
  const prototype = ztz99A2PrototypeArmor();
  const turretPlates: ArmorPlate[] = [
    ...splitFace('turret_chevron_inner_R', 700, [
      [0.20, 0.02, 1.54], [0.84, 0.02, 1.08],
      [0.62, 0.68, 0.72], [0.18, 0.66, 1.05],
    ], { keMm: 620, ceMm: 870 }),
    ...splitFace('turret_chevron_inner_L', 700, [
      [-0.84, 0.02, 1.08], [-0.20, 0.02, 1.54],
      [-0.18, 0.66, 1.05], [-0.62, 0.68, 0.72],
    ], { keMm: 620, ceMm: 870 }),
    ...splitFace('turret_chevron_outer_R', 700, [
      [0.84, 0.02, 1.08], [1.58, 0.05, 0.18],
      [1.30, 0.64, 0.13], [0.62, 0.68, 0.72],
    ], { keMm: 620, ceMm: 870 }),
    ...splitFace('turret_chevron_outer_L', 700, [
      [-1.58, 0.05, 0.18], [-0.84, 0.02, 1.08],
      [-0.62, 0.68, 0.72], [-1.30, 0.64, 0.13],
    ], { keMm: 620, ceMm: 870 }),
    frontPlate('mantlet', 390, -0.24, 0.24, [0.16, 1.50], [0.62, 1.30],
      { keMm: 390, ceMm: 470, gunFollow: true }),
    ...sidePlatePair('turret_side_front', 320,
      [0.18, 0.05, 0.79, 1.58], [-0.30, 0.05, 0.82, 1.56],
      { keMm: 320, ceMm: 440 }),
    ...sidePlatePair('turret_side_center', 300,
      [-0.30, 0.05, 0.82, 1.56], [-1.50, 0.18, 0.82, 1.50],
      { keMm: 300, ceMm: 420 }),
    ...sidePlatePair('turret_bustle_rise', 65,
      [-1.50, 0.18, 0.82, 1.50], [-2.22, 0.44, 0.80, 1.18],
      { keMm: 65, ceMm: 65 }),
    ...sidePlatePair('turret_chevron_era', 15,
      [1.10, 0.02, 0.66, 0.84], [0.16, 0.05, 0.64, 1.58],
      { kind: 'era', era: FY4 }),
    ...sidePlatePair('turret_stowage_screen', 10,
      [-0.30, 0.12, 0.72, 1.64], [-2.30, 0.46, 0.78, 1.32],
      { kind: 'spaced' }),
    rearPlate('turret_rear', 55, 1.18, -2.22, 0.44, 0.80),
    deckPlate('turret_roof_front', 45, [1.12, 0.76, 0.52], [0.18, 0.79, 1.12]),
    deckPlate('turret_roof_center', 45, [0.18, 0.79, 1.12], [-1.50, 0.82, 1.35]),
    deckPlate('turret_roof_bustle', 45, [-1.50, 0.82, 1.35], [-2.22, 0.80, 0.92]),
  ];
  const modules = prototype.modules.map((box): ModuleBox => {
    if (box.module === 'turretRing') {
      return moduleBox('turretRing', [-1.08, 1.39, -0.88], [1.08, 1.61, 1.12]);
    }
    if (box.module === 'radio') {
      return moduleBox('radio', [-0.96, 0.46, -2.10], [-0.26, 0.92, -1.34], true);
    }
    if (box.module === 'optics') {
      return moduleBox('optics', [-0.82, 0.62, -1.02], [1.02, 1.28, 1.34], true);
    }
    if (box.module === 'gun') {
      return moduleBox('gun', [-0.24, 0.12, -0.56], [0.24, 0.70, 1.44], true);
    }
    return box;
  });
  return {
    ...prototype,
    boundingRadiusM: 7.5,
    turretPivot: [0, 1.56, 0.12],
    gunPivot: [0, 0.38, 0.78],
    turretPlates,
    modules,
  };
}

function vt4A1Armor(): ArmorEnvelope {
  const chassis = ztz99A2Armor();
  const modules = chassis.modules.map((box): ModuleBox => {
    if (box.module === 'turretRing') {
      return moduleBox('turretRing', [-1.08, 1.51, -0.60], [1.08, 1.65, 1.40]);
    }
    if (box.module === 'radio') {
      return moduleBox('radio', [-0.94, 0.32, -2.54], [-0.26, 0.78, -1.44], true);
    }
    if (box.module === 'optics') {
      return moduleBox('optics', [-0.78, 0.66, -1.68], [1.10, 1.40, 0.64], true);
    }
    if (box.module === 'gun') {
      return moduleBox('gun', [-0.24, 0.12, -0.58], [0.24, 0.72, 0.74], true);
    }
    return box;
  });
  const crew = chassis.crew.map((box): CrewBox => {
    if (box.crew === 'gunner') {
      return crewBox('gunner', [0.10, 0.10, 0.02], [0.86, 0.82, 0.74], true);
    }
    if (box.crew === 'commander') {
      return crewBox('commander', [0.12, 0.12, -1.42], [0.94, 0.88, -0.34], true);
    }
    return box;
  });
  return {
    ...chassis,
    boundingRadiusM: 7.5,
    turretPivot: [0, 1.56, 0.40],
    gunPivot: [0, 0.3198, 0.75],
    gunBarrel: { lengthM: 5.95, radiusM: 0.071 },
    turretPlates: vtFamilyTurretPlates({
      heightScale: 0.82, widthScale: 1, depthScale: 1, chevronDepthScale: 1,
      frontShellLengthScale: 1,
      chevronInnerAdvanceM: 0, chevronOuterAdvanceM: 0, chevronLiftM: 0.07,
      rearExtensionM: 0, rearUndersideLiftM: 0, rearCrownLiftM: 0,
    }),
    modules,
    crew,
  };
}

export function createType99Armor(
  variant: 'ztz99_longwei' | 'ztz99a' | 'ztz99a2' | 'vt4a1' | 'type96b_frame',
): ArmorEnvelope {
  if (variant === 'ztz99_longwei') return longweiArmor();
  if (variant === 'type96b_frame') return type96BFrameArmor();
  if (variant === 'ztz99a') return ztz99A2PrototypeArmor();
  if (variant === 'ztz99a2') return ztz99A2Armor();
  if (variant === 'vt4a1') return vt4A1Armor();
  throw new Error(`Unknown Type 99 armor variant: ${variant}`);
}
