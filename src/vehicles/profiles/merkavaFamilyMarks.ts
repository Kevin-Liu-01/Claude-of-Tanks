// Merkava family marks (release 262): the measured record of each of the six marks the family builder draws. Sources
// per mark in docs/references/tanks/<id>.md: the published dimensions (hull length, width without skirts, height,
// length gun forward), the Wikimedia Commons 3-view drawings of the Mk I, Mk II, Mk III and Mk IV (CC BY-SA 4.0), the
// Yad La-Shiryon (Latrun), Lešany, Saumur and IDF photographs, and for the Mk 3 and Mk 4 hull lines and wheel stations
// the measured Merkava 3D X and Mk 4 X source studies (docs/references/tanks/merkava3d_x.source-measurements.json,
// merkava4_x.source-measurements.json). Every mark: six 790 mm road wheels a side, five return rollers behind the
// skirts, the drive sprocket at the front. Hull frame: ground y = 0, hull centre z = 0, +Z the nose, +X the vehicle's
// left (the commander and the exhaust are on the right, -X). Turret frame: the ring centre at deck height.
import type { MerkavaGearSpec, MerkavaHullSpec, MerkavaSkirtSpec } from './merkavaFamilyHull.ts';
import type { MerkavaTurretSpec, TurretModule, TurretStation } from './merkavaFamilyTurret.ts';
import { merkavaBarrelProfile, type MerkavaGunSpec } from './merkavaFamilyGun.ts';

export type MerkavaMarkId = 'merkava1b' | 'merkava2b' | 'merkava2d' | 'merkava3c' | 'merkava3_baz' | 'merkava4b';

export interface MerkavaMark {
  readonly id: MerkavaMarkId;
  readonly hull: MerkavaHullSpec;
  readonly gear: MerkavaGearSpec;
  readonly skirt: MerkavaSkirtSpec;
  /** The turret ring centre in the hull frame: deck height and z. */
  readonly pivot: readonly [y: number, z: number];
  readonly turret: MerkavaTurretSpec;
  readonly gun: MerkavaGunSpec;
}

const WHEEL_R = 0.395;

// ---------------------------------------------------------------------------------------------------- Mk 1 / Mk 2
// Hull 7.45 m, width without skirts 3.70 m (published): the tracks' outer faces at +-1.85 m, 640 mm track. Deck 1.66 m
// (Mk I / Mk II drawings 1.60-1.67), the long engine deck falling from z 0.95 to the nose plate, belly 0.50 m (ground
// clearance 0.47-0.53), the front sprocket 0.5 m behind the nose, the spoked idler 0.6 m inside the stern; wheels on
// alternating arms so they read as three pairs.
const MK12_HULL: MerkavaHullSpec = {
  top: [[-3.725, 1.30], [-3.66, 1.58], [-3.50, 1.65], [0.95, 1.66], [3.35, 1.36], [3.725, 1.24]],
  bottom: [[-3.725, 0.93], [-3.30, 0.50], [2.95, 0.50], [3.725, 1.06]],
  lowerHalfWidth: 1.13, upperHalfWidth: 1.85, sponsonClearance: 0.04,
  // the two-leaf clamshell door, 600 mm wide
  rearDoor: [1.12, 0.60, 0.88],
  driverHatch: [0.60, 1.90],
  engineGrille: [-0.70, 1.20, 2.60, 0.42],
  exhaust: [0.35, 1.35],
  rearBaskets: null, rearFuelTanks: 0, sponsonAppliqué: null,
};

const MK12_GEAR: MerkavaGearSpec = {
  wheelR: WHEEL_R, wheelW: 0.24, axleY: 0.475,
  wheelZs: [-2.30, -1.42, -0.46, 0.46, 1.42, 2.30],
  sprocket: { z: 3.20, y: 0.86, r: 0.31 }, idler: { z: -3.12, y: 0.80, r: 0.30 },
  returnRollers: [-1.88, -0.94, 0.0, 0.94, 1.88], returnRollerY: 0.99,
  trackW: 0.64, trackTh: 0.08, trackX: 1.53, trackTopY: 1.155,
};

// Mk 1B: the refit's skirts, six panels to about hub height (Lešany and Saumur photos); Mk 2: about ten bolted panels
// hung 50 mm further out (FACTS: WP-RU).
const MK1_SKIRT: MerkavaSkirtSpec = {
  stations: [[-3.42, 0.58, 1.60], [2.62, 0.56, 1.60], [3.24, 0.92, 1.40]],
  inner: 1.86, outer: 1.91, joints: [-2.40, -1.38, -0.36, 0.66, 1.68], flapDepth: 0, boltRows: 0,
};
const MK2_SKIRT: MerkavaSkirtSpec = {
  stations: [[-3.42, 0.58, 1.60], [2.62, 0.56, 1.60], [3.24, 0.92, 1.40]],
  inner: 1.91, outer: 1.96, joints: [-2.82, -2.22, -1.62, -1.02, -0.42, 0.18, 0.78, 1.38, 1.98], flapDepth: 0,
  boltRows: 3,
};

// The Mk 1 / Mk 2 cast-and-welded turret: a narrow arrowhead in plan with the gun at its tip (the Mk I and Mk II
// drawings' plan views), low at the nose and rising aft, its sides sloped steeply in over the rounded "ears" at the
// base (FACTS: WP-HE-3, the Lešany and Saumur photos). Ring centre 1.25 m aft of the hull centre: the nose 2.5 m
// behind the hull's nose (Mk II drawing), the basket ending over the stern.
const MK12_SHELL: readonly TurretStation[] = [
  { z: -1.42, base: [1.04, 0.12], ear: [1.10, 0.22], shoulder: [1.08, 0.40], roof: [0.90, 0.74], crown: 0.78 },
  { z: -0.50, base: [1.20, 0.04], ear: [1.32, 0.17], shoulder: [1.24, 0.38], roof: [0.94, 0.80], crown: 0.84 },
  { z: 0.55, base: [1.18, 0.04], ear: [1.30, 0.16], shoulder: [1.20, 0.36], roof: [0.86, 0.78], crown: 0.82 },
  { z: 1.45, base: [0.80, 0.05], ear: [0.86, 0.15], shoulder: [0.78, 0.32], roof: [0.52, 0.66], crown: 0.69 },
  { z: 2.10, base: [0.52, 0.07], ear: [0.55, 0.15], shoulder: [0.50, 0.30], roof: [0.33, 0.56], crown: 0.58 },
  { z: 2.50, base: [0.36, 0.09], ear: [0.37, 0.16], shoulder: [0.35, 0.29], roof: [0.24, 0.50], crown: 0.51 },
];

/** A plate standing off the turret's side along its shoulder line (an add-on screen or a bolted module): the +X side,
 *  `off` out from the shell, `thick` deep, from z0 to z1 between heights y0 and y1, its bolts in `rows`. */
function sidePlate(shell: readonly TurretStation[], z0: number, z1: number, y0: number, y1: number, off: number,
  thick: number, rows = 2, cols = 3): TurretModule {
  const at = (z: number, y: number): number => {
    let k = 0;
    while (k + 2 < shell.length && shell[k + 1]!.z < z) k++;
    const a = shell[k]!, b = shell[k + 1]!;
    const t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
    const side = (s: TurretStation): number => {
      const pts = [s.base, s.ear ?? s.base, s.shoulder, s.roof];
      let best = pts[0]![0];
      for (let i = 1; i < pts.length; i++) {
        const [x0, ya] = pts[i - 1]!, [x1, yb] = pts[i]!;
        if (y >= ya && y <= yb) best = x0 + (x1 - x0) * ((y - ya) / Math.max(1e-6, yb - ya));
      }
      return best;
    };
    return side(a) + (side(b) - side(a)) * t;
  };
  const st = (z: number) => ({
    z, inner: [at(z, y0) - 0.04, y0] as const, outerLow: [at(z, y0) + off + thick, y0] as const,
    outerHigh: [at(z, y1) + off + thick, y1] as const, innerHigh: [at(z, y1) - 0.04, y1] as const,
  });
  const bolts: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bolts.push([z0 + (z1 - z0) * ((c + 0.5) / cols), y0 + (y1 - y0) * ((r + 0.5) / rows)]);
    }
  }
  return { stations: [st(z0), st((z0 + z1) / 2), st(z1)], bolts };
}

function mk12Turret(overrides: Partial<MerkavaTurretSpec>): MerkavaTurretSpec {
  return {
    shell: MK12_SHELL, ring: [1.08, 0.10], modules: [],
    cupola: [-0.56, -0.62, 0.36, 0.20], loaderHatch: [0.56, -0.40, 0.30],
    // the internal 60 mm mortar's tube at the left front of the roof, ahead of the loader's hatch (Mk 2 on)
    mortar: ['internal', 0.56, 0.20],
    sights: [
      { x: -0.40, z: 0.85, w: 0.30, h: 0.22, d: 0.34, hood: true },
      { x: -0.22, z: -0.15, w: 0.18, h: 0.18, d: 0.20, hood: false },
    ],
    // a six-tube CL-3030 cluster on each cheek (Saumur photo; 12 total)
    smoke: { x: 0.80, y: 0.42, z: 1.20, yaw: 0.55, tubes: 3, rows: 2 },
    basket: { z0: -1.42, z1: -2.25, halfWidth: 1.06, floor: 0.14, rail: 0.66, sideZ0: -0.95 },
    chains: { z: -2.27, halfWidth: 1.02, y: 0.14, drop: 0.42 },
    roofGuns: [[-0.56, -0.25, 0], [0.56, -0.05, 0]],
    antennas: [[-0.80, -1.30, 2.2], [0.80, -1.30, 2.2]],
    bins: [],
    ...overrides,
  };
}

// M64 (licensed M68) 105 mm on the Mk 1 and Mk 2 (FACTS: 5.347 m tube, 5.55 m overall, three-section thermal sleeve,
// no separate mantlet): the trunnion 2.10 m ahead of the ring at gun height 2.02 m, the muzzle at the published length
// gun forward (8.63 m: z 4.905); the evacuator about 0.55 m long centred 0.65 m ahead of the turret's nose.
function m64Gun(muzzleWorldZ: number, pivotZ: number): MerkavaGunSpec {
  const trunnion: [number, number, number] = [0, 0.36, 2.10];
  const muzzleZ = muzzleWorldZ - (pivotZ + trunnion[2]);
  const face = 0.40, collar = 0.10;
  const evacCentre = face + collar + 0.65;
  const sleeveEnd = muzzleZ - 0.45;
  const sectionLen = (sleeveEnd - (evacCentre + 0.275)) / 2;
  return {
    model: 'M64', caliberMm: 105, trunnion, muzzleZ,
    barrel: merkavaBarrelProfile({
      rootZ: 0.15, rootR: 0.105, sleeve: [face + 0.04, sleeveEnd], sleeveR: 0.088,
      clamps: [face + 0.30, evacCentre + 0.275 + sectionLen, sleeveEnd - 0.03],
      clampR: 0.097, clampW: 0.04,
      evacuator: [evacCentre - 0.275, evacCentre + 0.275], evacuatorR: 0.128, evacuatorShoulder: 0.07,
      tubeR: 0.069, muzzleZ, muzzleLip: [0.06, 0.075],
    }),
    mantlet: { frontZ: face, depth: 0.50, halfWidth: 0.17, halfHeight: 0.14, rearGrowth: 0.04, collarR: 0.122,
      collarLen: collar, bootR: 0 },
    muzzleReferenceSensor: false, overGunMachineGun: true, coaxX: 0.18,
  };
}

// ---------------------------------------------------------------------------------------------------------- Mk 3
// Hull 7.60 m, width without skirts 3.72 m (published): the tracks' outer faces at +-1.86 m, 660 mm track. Hull lines
// and wheel stations from the Merkava 3D X study, re-centred on the 7.60 m hull: the deck at 1.69-1.72 m, the engine
// deck falling to 1.42 m at z 3.4 and the nose plate to 1.10 m; belly 0.48 m; the armoured rear fuel tanks in the
// stern plate with baskets either side of the door (FACTS: GS-3, WP-RU).
const MK3_HULL: MerkavaHullSpec = {
  top: [[-3.80, 1.30], [-3.70, 1.62], [-2.73, 1.72], [-1.98, 1.69], [0.81, 1.69], [2.41, 1.49], [2.92, 1.44],
    [3.41, 1.42], [3.80, 1.10]],
  bottom: [[-3.80, 0.95], [-3.30, 0.48], [2.41, 0.48], [2.92, 0.52], [3.41, 0.73], [3.80, 0.96]],
  lowerHalfWidth: 1.14, upperHalfWidth: 1.86, sponsonClearance: 0.04,
  rearDoor: [1.12, 0.60, 0.88],
  driverHatch: [0.62, 2.05],
  engineGrille: [-0.70, 1.20, 2.70, 0.44],
  exhaust: [0.45, 1.55],
  rearBaskets: [1.40, 0.42, 1.62], rearFuelTanks: 0.12, sponsonAppliqué: null,
};

const MK3_GEAR: MerkavaGearSpec = {
  wheelR: WHEEL_R, wheelW: 0.24, axleY: 0.475,
  wheelZs: [-2.3237, -1.4407, -0.3107, 0.5473, 1.4058, 2.2588],
  sprocket: { z: 3.266, y: 0.90, r: 0.33 }, idler: { z: -3.139, y: 0.86, r: 0.32 },
  returnRollers: [-1.882, -0.876, 0.118, 0.977, 1.832], returnRollerY: 1.02,
  trackW: 0.66, trackTh: 0.08, trackX: 1.53, trackTopY: 1.185,
};

// Mk 3: deep removable armour modules on a 25 mm inner plate (FACTS: GS-3), bolted, the front two heavier.
const MK3_SKIRT: MerkavaSkirtSpec = {
  stations: [[-3.45, 0.58, 1.64], [2.55, 0.56, 1.64], [3.28, 0.94, 1.44]],
  inner: 1.87, outer: 1.97, joints: [-2.35, -1.25, -0.15, 0.95, 2.05], flapDepth: 0, boltRows: 3,
};

// The Mk 3 turret (Mk III drawing; the Latrun photos): 230 mm longer than the Mk 2's (FACTS: GS-3), flat near-vertical
// sides of bolted box modules, no ears, a flat roof and a V nose round the gun.
const MK3_SHELL: readonly TurretStation[] = [
  { z: -1.98, base: [0.98, 0.16], shoulder: [1.02, 0.50], roof: [0.92, 0.82], crown: 0.84 },
  { z: -1.20, base: [1.42, 0.10], shoulder: [1.44, 0.50], roof: [1.30, 0.86], crown: 0.88 },
  { z: -0.10, base: [1.44, 0.08], shoulder: [1.45, 0.48], roof: [1.30, 0.86], crown: 0.88 },
  { z: 0.85, base: [1.30, 0.09], shoulder: [1.30, 0.46], roof: [1.14, 0.84], crown: 0.86 },
  { z: 1.65, base: [0.66, 0.12], shoulder: [0.64, 0.44], roof: [0.50, 0.76], crown: 0.77 },
  { z: 2.32, base: [0.34, 0.18], shoulder: [0.33, 0.42], roof: [0.27, 0.66], crown: 0.67 },
];

/** The Mk 3B's front cheek modules: wedges from the side modules' front to the nose, either side of the gun. */
function mk3CheekModule(outer: number): TurretModule {
  return {
    stations: [
      { z: 0.70, inner: [1.26, 0.10], outerLow: [outer, 0.10], outerHigh: [outer - 0.04, 0.84], innerHigh: [1.08, 0.86] },
      { z: 1.65, inner: [0.62, 0.13], outerLow: [0.88, 0.13], outerHigh: [0.84, 0.78], innerHigh: [0.48, 0.78] },
      { z: 2.30, inner: [0.32, 0.18], outerLow: [0.46, 0.18], outerHigh: [0.44, 0.68], innerHigh: [0.26, 0.68] },
    ],
    bolts: [[0.95, 0.30], [0.95, 0.62], [1.40, 0.30], [1.40, 0.60], [1.85, 0.34], [1.85, 0.58]],
  };
}

// MG251 120 mm L/44 (FACTS: 5.30 m barrel, IMI): the sleeve in clamped sections, the evacuator drum about 0.6 m long
// centred 0.95 m ahead of the turret's nose (photo measurement, the Mk III drawing), no muzzle reference sensor.
function mg251Gun(muzzleWorldZ: number, pivotZ: number): MerkavaGunSpec {
  const trunnion: [number, number, number] = [0, 0.40, 1.92];
  const muzzleZ = muzzleWorldZ - (pivotZ + trunnion[2]);
  const face = 0.42, collar = 0.12;
  const evacCentre = face + collar + 0.95;
  const sleeveEnd = muzzleZ - 0.28;
  const front = evacCentre + 0.30, step = (sleeveEnd - front) / 3;
  return {
    model: 'MG251', caliberMm: 120, trunnion, muzzleZ,
    barrel: merkavaBarrelProfile({
      rootZ: 0.15, rootR: 0.13, sleeve: [face + 0.06, sleeveEnd], sleeveR: 0.102,
      clamps: [face + 0.40, front + step, front + 2 * step, sleeveEnd - 0.03],
      clampR: 0.112, clampW: 0.045,
      evacuator: [evacCentre - 0.30, evacCentre + 0.30], evacuatorR: 0.178, evacuatorShoulder: 0.07,
      tubeR: 0.082, muzzleZ, muzzleLip: [0.05, 0.089],
    }),
    mantlet: { frontZ: face, depth: 0.60, halfWidth: 0.24, halfHeight: 0.21, rearGrowth: 0.05, collarR: 0.16,
      collarLen: collar, bootR: 0.17 },
    muzzleReferenceSensor: false, overGunMachineGun: true, coaxX: 0.24,
  };
}

// ---------------------------------------------------------------------------------------------------------- Mk 4
// Hull 7.60 m, width without skirts 3.72 m (published); hull lines from the Mk 4 X study: the deck at 1.60 m to z 1.96,
// the nose falling to 1.03 m, the belly 0.45 m. Wheel stations re-spaced for the 790 mm wheels (the study's 0.69 m
// wheels sat 0.795 m apart).
const MK4_HULL: MerkavaHullSpec = {
  top: [[-3.80, 1.00], [-3.70, 1.22], [-3.60, 1.53], [-3.36, 1.556], [-2.70, 1.61], [1.96, 1.604], [2.80, 1.347],
    [3.31, 1.255], [3.80, 1.034]],
  bottom: [[-3.80, 0.73], [-3.36, 0.45], [2.00, 0.45], [2.80, 0.50], [3.15, 0.59], [3.31, 0.64], [3.80, 0.96]],
  lowerHalfWidth: 1.14, upperHalfWidth: 1.86, sponsonClearance: 0.04,
  rearDoor: [1.04, 0.60, 0.82],
  driverHatch: [0.62, 2.15],
  engineGrille: [-0.70, 1.30, 2.70, 0.44],
  exhaust: [0.45, 1.55],
  rearBaskets: [1.42, 0.40, 1.50], rearFuelTanks: 0.10, sponsonAppliqué: null,
};

const MK4_GEAR: MerkavaGearSpec = {
  wheelR: WHEEL_R, wheelW: 0.24, axleY: 0.475,
  wheelZs: [-2.24, -1.40, -0.30, 0.62, 1.48, 2.36],
  sprocket: { z: 3.30, y: 0.86, r: 0.32 }, idler: { z: -3.04, y: 0.82, r: 0.31 },
  returnRollers: [-1.84, -0.86, 0.16, 1.06, 1.94], returnRollerY: 1.01,
  trackW: 0.66, trackTh: 0.08, trackX: 1.53, trackTopY: 1.175,
};

// Mk 4: deep modular skirts with a rubber strip under the bolted armour (Mk IV drawing).
const MK4_SKIRT: MerkavaSkirtSpec = {
  stations: [[-3.40, 0.62, 1.56], [2.60, 0.60, 1.56], [3.30, 0.92, 1.34]],
  inner: 1.87, outer: 1.96, joints: [-2.30, -1.20, -0.10, 1.00, 2.10], flapDepth: 0.10, boltRows: 3,
};

// The Mk 4 turret (Mk IV drawing; Latrun photos): a broad flat core, its roof armoured all over in steps, under a long
// sharp nose reaching over the gun; flat stepped side modules.
const MK4_SHELL: readonly TurretStation[] = [
  { z: -2.60, base: [1.10, 0.18], shoulder: [1.14, 0.46], roof: [1.00, 0.80], crown: 0.83 },
  { z: -1.80, base: [1.56, 0.12], shoulder: [1.60, 0.44], roof: [1.30, 0.88], crown: 0.94 },
  { z: -0.40, base: [1.62, 0.10], shoulder: [1.64, 0.42], roof: [1.30, 0.88], crown: 0.94 },
  { z: 0.60, base: [1.56, 0.10], shoulder: [1.54, 0.42], roof: [1.14, 0.84], crown: 0.90 },
  { z: 1.40, base: [1.10, 0.12], shoulder: [1.04, 0.42], roof: [0.74, 0.70], crown: 0.74 },
  { z: 2.10, base: [0.62, 0.16], shoulder: [0.56, 0.42], roof: [0.38, 0.56], crown: 0.58 },
  { z: 2.50, base: [0.30, 0.22], shoulder: [0.28, 0.40], roof: [0.18, 0.48], crown: 0.49 },
];

// MG253 120 mm L/44 (FACTS: 5.30 m; the VIDCO sleeve in five segments; a large pointed mantlet): the evacuator about
// 0.8 m ahead of the mantlet.
function mg253Gun(muzzleWorldZ: number, pivotZ: number): MerkavaGunSpec {
  const trunnion: [number, number, number] = [0, 0.39, 2.20];
  const muzzleZ = muzzleWorldZ - (pivotZ + trunnion[2]);
  const face = 0.36, collar = 0.10;
  const evacCentre = face + collar + 0.80;
  const sleeveEnd = muzzleZ - 0.25;
  const front = evacCentre + 0.30, step = (sleeveEnd - front) / 4;
  return {
    model: 'MG253', caliberMm: 120, trunnion, muzzleZ,
    barrel: merkavaBarrelProfile({
      rootZ: 0.12, rootR: 0.13, sleeve: [face + 0.04, sleeveEnd], sleeveR: 0.104,
      clamps: [face + 0.36, front + step, front + 2 * step, front + 3 * step, sleeveEnd - 0.03],
      clampR: 0.116, clampW: 0.042,
      evacuator: [evacCentre - 0.30, evacCentre + 0.30], evacuatorR: 0.160, evacuatorShoulder: 0.07,
      tubeR: 0.0811, muzzleZ, muzzleLip: [0.05, 0.088],
    }),
    mantlet: { frontZ: face, depth: 0.62, halfWidth: 0.25, halfHeight: 0.21, rearGrowth: 0.05, collarR: 0.15,
      collarLen: collar, bootR: 0.16 },
    muzzleReferenceSensor: false, overGunMachineGun: true, coaxX: 0.22,
  };
}

// ------------------------------------------------------------------------------------------------------- the marks
const MK12_PIVOT: readonly [number, number] = [1.66, -1.25];
const MK3_PIVOT: readonly [number, number] = [1.69, -0.90];
const MK4_PIVOT: readonly [number, number] = [1.604, -0.45];

function mk3Turret(overrides: Partial<MerkavaTurretSpec>): MerkavaTurretSpec {
  return {
    shell: MK3_SHELL, ring: [1.10, 0.14], modules: [],
    cupola: [-0.66, -0.80, 0.38, 0.22], loaderHatch: [0.64, -0.55, 0.32], mortar: ['internal', 0.66, 0.15],
    sights: [], smoke: { x: 1.30, y: 0.52, z: 0.60, yaw: 0.45, tubes: 3, rows: 2 },
    basket: { z0: -1.98, z1: -2.82, halfWidth: 1.12, floor: 0.20, rail: 0.76, sideZ0: -1.35 },
    chains: { z: -2.84, halfWidth: 1.08, y: 0.20, drop: 0.45 },
    roofGuns: [[-0.66, -0.45, 0], [0.64, -0.20, 0]], antennas: [[-0.95, -1.80, 2.3], [0.95, -1.80, 2.3]],
    bins: [], ...overrides,
  };
}

export const MERKAVA_MARKS: Readonly<Record<MerkavaMarkId, MerkavaMark>> = Object.freeze({
  // Mk 1B: the 1982-on refit of the Mk 1 (FACTS: KM, BTVT, WP-RU): ball-and-chain on a small basket, the 60 mm mortar
  // still external by the commander's hatch on the right, smoke clusters, no added turret armour, no hull baskets.
  merkava1b: {
    id: 'merkava1b', hull: MK12_HULL, gear: MK12_GEAR, skirt: MK1_SKIRT, pivot: MK12_PIVOT,
    turret: mk12Turret({
      mortar: ['external', -0.30, -0.20],
      basket: { z0: -1.42, z1: -1.98, halfWidth: 0.98, floor: 0.16, rail: 0.58, sideZ0: -1.20 },
      chains: { z: -2.00, halfWidth: 0.94, y: 0.16, drop: 0.40 },
    }),
    gun: m64Gun(-3.725 + 8.63, MK12_PIVOT[1]),
  },
  // Mk 2B: composite add-on screens bolted on the turret's sides and front, the mortar inside, a large basket and the
  // hull's rear baskets (FACTS: WP-RU, HOW, KM).
  merkava2b: {
    id: 'merkava2b', hull: { ...MK12_HULL, rearBaskets: [1.36, 0.38, 1.58] }, gear: MK12_GEAR, skirt: MK2_SKIRT,
    pivot: MK12_PIVOT,
    turret: mk12Turret({
      modules: [sidePlate(MK12_SHELL, -0.45, 1.30, 0.20, 0.62, 0.05, 0.05, 2, 4),
        sidePlate(MK12_SHELL, 1.32, 2.30, 0.18, 0.52, 0.04, 0.05, 2, 2)],
    }),
    gun: m64Gun(-3.725 + 8.63, MK12_PIVOT[1]),
  },
  // Mk 2D: Dor Dalet bolt-on boxes on the turret's sides and front, appliqué on the sponsons above the skirts (FACTS:
  // BTVT, WP-HE-2).
  merkava2d: {
    id: 'merkava2d', hull: { ...MK12_HULL, rearBaskets: [1.36, 0.38, 1.58], sponsonAppliqué: [-1.6, 2.2, 0.05] },
    gear: MK12_GEAR, skirt: MK2_SKIRT, pivot: MK12_PIVOT,
    turret: mk12Turret({
      modules: [sidePlate(MK12_SHELL, -0.60, 1.20, 0.10, 0.70, 0.08, 0.16, 2, 3),
        sidePlate(MK12_SHELL, 1.22, 2.40, 0.10, 0.60, 0.06, 0.18, 2, 2)],
    }),
    gun: m64Gun(-3.725 + 8.63, MK12_PIVOT[1]),
  },
  // Mk 3C: the Mk 3B Baz (War Thunder's "Mk.3C"; FACTS): flat bolted turret modules, the Baz fire control's fez-shaped
  // commander's sight and taller gunner's sight, the round loader's hatch.
  merkava3c: {
    id: 'merkava3c', hull: MK3_HULL, gear: MK3_GEAR, skirt: MK3_SKIRT, pivot: MK3_PIVOT,
    turret: mk3Turret({
      modules: [sidePlate(MK3_SHELL, -1.40, 0.70, 0.10, 0.84, 0.0, 0.10, 2, 4), mk3CheekModule(1.44)],
      sights: [
        { x: -0.60, z: 1.00, w: 0.36, h: 0.34, d: 0.42, hood: true },
        { x: -0.30, z: -0.10, w: 0.30, h: 0.30, d: 0.30, hood: false },
      ],
    }),
    gun: mg251Gun(-3.80 + 9.04, MK3_PIVOT[1]),
  },
  // Mk 3 Baz: the Mk 3D Baz (Bet Baz Dor Dalet, FACTS: BTVT, KM): the fourth-generation side modules protruding
  // sideways in a stepped wedge, the Baz sights.
  merkava3_baz: {
    id: 'merkava3_baz', hull: MK3_HULL, gear: MK3_GEAR, skirt: MK3_SKIRT, pivot: MK3_PIVOT,
    turret: mk3Turret({
      modules: [sidePlate(MK3_SHELL, -1.40, 0.70, 0.10, 0.84, 0.06, 0.20, 2, 4), mk3CheekModule(1.62)],
      sights: [
        { x: -0.60, z: 1.00, w: 0.36, h: 0.34, d: 0.42, hood: true },
        { x: -0.30, z: -0.10, w: 0.30, h: 0.30, d: 0.30, hood: false },
      ],
    }),
    gun: mg251Gun(-3.80 + 9.04, MK3_PIVOT[1]),
  },
  // Mk 4B: the early Mk 4 without Trophy (FACTS: GS-4, WP-RU): the stepped turret with its armoured roof, no loader's
  // hatch, the commander's cupola on the right with its MAG, one smoke launcher at each front corner.
  merkava4b: {
    id: 'merkava4b', hull: MK4_HULL, gear: MK4_GEAR, skirt: MK4_SKIRT, pivot: MK4_PIVOT,
    turret: {
      shell: MK4_SHELL, ring: [1.12, 0.14],
      modules: [sidePlate(MK4_SHELL, -1.90, 0.50, 0.10, 0.86, 0.0, 0.12, 2, 4),
        sidePlate(MK4_SHELL, 0.62, 2.10, 0.12, 0.70, 0.0, 0.10, 2, 2)],
      cupola: [-0.62, -0.90, 0.40, 0.24], loaderHatch: null, mortar: ['internal', 0.70, -0.30],
      sights: [
        { x: -0.62, z: 0.55, w: 0.42, h: 0.30, d: 0.46, hood: true },
        { x: 0.40, z: -0.40, w: 0.30, h: 0.40, d: 0.30, hood: true },
      ],
      smoke: { x: 1.30, y: 0.60, z: 1.05, yaw: 0.40, tubes: 2, rows: 2 },
      basket: { z0: -2.60, z1: -3.30, halfWidth: 1.12, floor: 0.22, rail: 0.80, sideZ0: -1.95 },
      chains: { z: -3.32, halfWidth: 1.08, y: 0.22, drop: 0.45 },
      roofGuns: [[-0.62, -0.55, 0]], antennas: [[-1.00, -2.30, 2.3], [1.00, -2.30, 2.3]],
      bins: [],
    },
    gun: mg253Gun(-3.80 + 9.04, MK4_PIVOT[1]),
  },
});
