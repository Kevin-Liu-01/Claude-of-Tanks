import { buildObject148Prototype } from './profiles/object148Prototype.ts';
// src/vehicles/modern2.ts — HD procedural builders + specs for the modern
// roster expansion, wave 2 (docs/history/research/modern-roster.md):
//   leo2a4  Leopard 2A4        (§9,  priority 3)
//   t80u    T-80U              (§15, priority 3)
//   leclerc Leclerc S2         (§20, priority 3)
//   type99a Type 99A / ZTZ-99A (§22, priority 3)
//   leo1a5  Leopard 1A5        (§10, priority 4)
//   t14     T-14 Armata        (§16, priority 4)
//
// Registration pattern (established by modern1.ts): tankFactory.ts passes
// MODERN2_BUILDERS through the checked factory-configuration gate; builders
// draw on tankFactoryCore's exported geometry KIT. MODERN2_SPECS below is the
// source tools/gen-legacy-fleet-specs.mjs serializes; the registry holds the
// generated metadata (modern2Specs.generated.ts, imported below), never these
// live rows, on every path. Armor values are open-source RHAe estimates per
// the roster doc (game-design baselines).

import * as THREE from 'three';
import { KIT, type TankBuilderPort } from './tankFactoryCore.ts';
// §I fittings census: the FITTINGS import is the spelling that survives
// synchronous top-level createTank rigs.
import { FITTINGS, muzzleBore } from './profiles/kit.ts';
import { buildM1A1BareHull } from './profiles/abrams.ts';
import { foldedShoulderReturn } from './profiles/foldedShoulderReturn.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import {
  plate as par,
  frontPlate as fr,
  rearPlate as rr,
  rightSidePlate as sR,
  leftSidePlate as sL,
  roofPlate as rf,
  rightCheekPlate as chR,
  leftCheekPlate as chL,
  moduleBox as mbox,
  crewBox as cbox,
  shell,
  apfsdsPenetration as apfsdsPens,
} from './specHelpers.ts';
// Spec rows register from their generated metadata, whichever facade
// evaluates this file: the live rows below share plate vertex arrays, and
// registering them let in-place armor fitting move a shared vertex of a
// derived clone twice (fleetRegistration.ts).
import './modern2Specs.generated.ts';
import type {
  ArmorEnvelope,
  ArmorPlate,
  MutableVec3Tuple,
  ShellSpec,
  Vec3Tuple,
} from './specHelpers.ts';
import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

type VehicleAssemblyOwner = 'hull' | 'turret';
type GeometryScale = number | readonly [number, number, number];
type EraPlacement = (...transform: number[]) => void;

export interface Modern2BuilderPort {
  destructibleCluster: TankBuilderPort['destructibleCluster'];
  addExternalArmor: TankBuilderPort['addExternalArmor'];
  forEachBucketPart(slots:string|string[],visit:(geometry:THREE.BufferGeometry,bounds:THREE.Box3|null,bucket:string)=>void):void;
  readonly q?: boolean;
  readonly rng: () => number;
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & { readonly dark: THREE.Material };
  readonly spec: FleetTankSpec;
  __type99HullOnly?: boolean;
  postAssemble: (() => void) | null;
  muzzleZ: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(
    bucket: string,
    geometry: THREE.BufferGeometry,
    ...transform: number[]
  ): void;
  addEquipment(
    bucket: string,
    geometry: THREE.BufferGeometry,
    ...transform: number[]
  ): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(
    id: string,
    slot: string,
    geometry: THREE.BufferGeometry,
    ...transform: number[]
  ): void;
  clear(...slots: string[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string | null,
    scale: number,
    position: MutableVec3Tuple,
    ...orientation: number[]
  ): void;
  eraCluster(
    key: string,
    build: (put: EraPlacement) => void,
    turretLocal?: boolean,
  ): void;
}

interface ArmorResistance {
  ke: number;
  ce: number;
  phys?: number;
}

interface MbtArmorOptions {
  hl: number;
  hw: number;
  roofY: number;
  trkTop?: number;
  floor?: number;
  turretPivot: MutableVec3Tuple;
  gunPivot: MutableVec3Tuple;
  barrelLenM: number;
  barrelRadM: number;
  glacis: ArmorResistance;
  lower: ArmorResistance;
  side: ArmorResistance;
  skirtMm?: number;
  rear: number;
  roof: number;
  cheek: ArmorResistance;
  tSide: ArmorResistance;
  tRear: number;
  tRoof: number;
  mantlet: ArmorResistance;
  tHalfW: number;
  tFrontZ: number;
  tRearZ: number;
  tH: number;
  glacisNoseZ: number;
  glacisTopZ: number;
  hullEra?: ArmorPlate[];
  turretEra?: ArmorPlate[];
  crew4?: boolean;
  bustleAmmo?: boolean;
  capsule?: boolean;
}

const scaledGeometryTransform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x?: number,
  y?: number,
  z?: number,
  rotationX?: number,
  rotationY?: number,
  rotationZ?: number,
  scale?: GeometryScale,
) => THREE.BufferGeometry;

const apfsds = (
  name: string,
  cal: number,
  quoted2km: number,
  dmg: number,
  vel: number,
): ShellSpec => {
  const p = apfsdsPens(quoted2km);
  return shell(name, 'APFSDS', cal, p[0], p[1], dmg, vel, { pen2000Mm: p[2] });
};
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };
const MODERN_TR = { hard: 0.7, medium: 0.8, soft: 1.5 };

// ---------------------------------------------------------------------------
// Parametric modern-MBT armor layout (t90m template, tunable per vehicle).
// Geometry follows the visual builders below; values are roster RHAe.
// ---------------------------------------------------------------------------
function mbtArmor(o: MbtArmorOptions): ArmorEnvelope {
  const {
    hl, hw, roofY, trkTop = 1.0, floor = 0.43,
    turretPivot, gunPivot, barrelLenM, barrelRadM,
    glacis, lower, side, skirtMm = 8, rear, roof,
    cheek, tSide, tRear, tRoof, mantlet,
    tHalfW, tFrontZ, tRearZ, tH,
    glacisNoseZ, glacisTopZ,
    hullEra = [], turretEra = [],
    crew4 = false, bustleAmmo = false, capsule = false,
  } = o;
  const inW = hw * 0.64;
  const tp = turretPivot;
  const hullPlates = [
    ...hullEra,
    fr('upper_glacis', glacis.phys ?? 500, hw * 0.92, 0.85, glacisNoseZ, roofY, glacisTopZ,
      { keMm: glacis.ke, ceMm: glacis.ce }),
    fr('lower_front', 100, hw * 0.92, floor, glacisNoseZ - 0.3, 0.85, glacisNoseZ,
      { keMm: lower.ke, ceMm: lower.ce }),
    sR('hull_side_upper_R', side.ke, hw - 0.01, trkTop, hw - 0.01, roofY, -hl + 0.05, hl * 0.55, { ceMm: side.ce }),
    sL('hull_side_upper_L', side.ke, hw - 0.01, trkTop, hw - 0.01, roofY, -hl + 0.05, hl * 0.55, { ceMm: side.ce }),
    sR('hull_side_lower_R', side.ke, inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, { ceMm: side.ce }),
    sL('hull_side_lower_L', side.ke, inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, { ceMm: side.ce }),
    sR('skirt_R', skirtMm, hw + 0.02, 0.55, hw + 0.02, trkTop + 0.15, -hl, hl * 0.95, { kind: 'spaced' }),
    sL('skirt_L', skirtMm, hw + 0.02, 0.55, hw + 0.02, trkTop + 0.15, -hl, hl * 0.95, { kind: 'spaced' }),
    sR('track_R', 20, hw - 0.15, 0.12, hw - 0.15, trkTop, -hl - 0.1, hl + 0.1, { kind: 'external', moduleLink: 'trackR' }),
    sL('track_L', 20, hw - 0.15, 0.12, hw - 0.15, trkTop, -hl - 0.1, hl + 0.1, { kind: 'external', moduleLink: 'trackL' }),
    rr('hull_rear', rear, hw * 0.9, floor, -hl + 0.05, roofY, -hl),
    rf('hull_roof', roof, hw * 0.9, roofY, -hl, glacisTopZ),
  ];
  const turretPlates = [
    ...turretEra,
    chR('turret_cheek_R', cheek.phys ?? 650, 0.24, tFrontZ, tHalfW, tFrontZ - 0.85, 0.02, tH, 0.10, 0,
      { keMm: cheek.ke, ceMm: cheek.ce }),
    chL('turret_cheek_L', cheek.phys ?? 650, 0.24, tFrontZ, tHalfW, tFrontZ - 0.85, 0.02, tH, 0.10, 0,
      { keMm: cheek.ke, ceMm: cheek.ce }),
    par('mantlet', mantlet.ke, [-0.26, gunPivot[1] - 0.24, tFrontZ + 0.02],
      [0.26, gunPivot[1] - 0.24, tFrontZ + 0.02], [-0.26, gunPivot[1] + 0.24, tFrontZ - 0.02],
      { keMm: mantlet.ke, ceMm: mantlet.ce, gunFollow: true }),
    sR('turret_side_R', tSide.ke, tHalfW, 0.0, tHalfW * 0.94, tH, tRearZ, tFrontZ - 0.8, { ceMm: tSide.ce }),
    sL('turret_side_L', tSide.ke, tHalfW, 0.0, tHalfW * 0.94, tH, tRearZ, tFrontZ - 0.8, { ceMm: tSide.ce }),
    rr('turret_rear', tRear, tHalfW * 0.9, 0.0, tRearZ, tH, tRearZ - 0.05),
    rf('turret_roof', tRoof, tHalfW * 0.95, tH + 0.02, tRearZ, tFrontZ - 0.55),
  ];
  const modules = [
    mbox('engine', [-inW, floor, -hl + 0.05], [inW, roofY - 0.05, -hl * 0.5]),
    mbox('fuelTank', [inW * 0.4, floor, -hl * 0.48], [inW, roofY * 0.7, -hl * 0.15]),
    bustleAmmo
      ? mbox('ammoRack', [-tHalfW * 0.8, 0.05, tRearZ + 0.05], [tHalfW * 0.8, tH * 0.8, tRearZ + 0.9], true)
      : mbox('ammoRack', [-inW * 0.85, floor, -0.6], [inW * 0.85, floor + 0.55, 0.7]),
    mbox('turretRing', [-tHalfW * 0.8, roofY - 0.15, tp[2] - 1.0], [tHalfW * 0.8, roofY + 0.05, tp[2] + 1.0]),
    mbox('radio', [-inW * 0.8, roofY * 0.5, -hl * 0.4], [-inW * 0.25, roofY * 0.85, -hl * 0.1]),
    mbox('optics', [0.15, tH * 0.55, tFrontZ - 0.75], [tHalfW * 0.6, tH + 0.15, tFrontZ - 0.15], true),
    mbox('gun', [-0.2, gunPivot[1] - 0.22, tRearZ * 0.4], [0.2, gunPivot[1] + 0.26, tFrontZ], true),
    mbox('trackL', [-hw, 0.0, -hl], [-inW, trkTop, hl]),
    mbox('trackR', [inW, 0.0, -hl], [hw, trkTop, hl]),
  ];
  const crew = capsule
    ? [ // T-14 crew capsule: everyone in the hull bow, nobody in the turret
      cbox('driver', [-0.95, 0.55, hl * 0.55], [-0.25, 1.25, hl * 0.88]),
      cbox('gunner', [-0.35, 0.55, hl * 0.55], [0.3, 1.25, hl * 0.88]),
      cbox('commander', [0.35, 0.55, hl * 0.55], [1.0, 1.25, hl * 0.88]),
    ]
    : [
      cbox('driver', [-0.4, 0.55, hl * 0.5], [0.35, 1.2, hl * 0.85]),
      cbox('gunner', [0.15, 0.05, tFrontZ - 1.2], [tHalfW * 0.7, tH * 0.85, tFrontZ - 0.4], true),
      cbox('commander', [0.15, 0.05, tRearZ * 0.55], [tHalfW * 0.75, tH * 0.9, tRearZ * 0.15], true),
      ...(crew4 ? [cbox('loader', [-tHalfW * 0.7, 0.05, tRearZ * 0.5], [-0.15, tH * 0.85, tFrontZ - 0.9], true)] : []),
    ];
  return {
    boundingRadiusM: hl + barrelLenM * 0.55 + 0.4,
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [gunPivot[0], gunPivot[1], gunPivot[2]],
    gunBarrel: { lengthM: barrelLenM, radiusM: barrelRadM },
    hullPlates, turretPlates, modules, crew,
  };
}

// Raise a complete armored hull package without disturbing its independently
// authored track volumes.  T-80U's procedural running gear is already seated
// correctly on the ground; the owner-requested stance correction applies to
// the hull shell, hull-local systems/crew and rotating package only.
function liftHullAssemblyAboveTracks(armor: ArmorEnvelope, liftM: number): ArmorEnvelope {
  const fixedTrackModules = new Set(['trackL', 'trackR']);
  for (const plate of armor.hullPlates) {
    if ((plate.moduleLink !== null && fixedTrackModules.has(plate.moduleLink)) || /^track_[LR]$/.test(plate.name)) continue;
    const [v0, v1, v2, v3] = plate.verts;
    plate.verts = [
      [v0[0], v0[1] + liftM, v0[2]],
      [v1[0], v1[1] + liftM, v1[2]],
      [v2[0], v2[1] + liftM, v2[2]],
      [v3[0], v3[1] + liftM, v3[2]],
    ];
  }
  for (const module of armor.modules) {
    if (module.turretLocal || fixedTrackModules.has(module.module)) continue;
    (module.min as MutableVec3Tuple)[1] += liftM;
    (module.max as MutableVec3Tuple)[1] += liftM;
  }
  for (const crew of armor.crew) {
    if (crew.turretLocal) continue;
    (crew.min as MutableVec3Tuple)[1] += liftM;
    (crew.max as MutableVec3Tuple)[1] += liftM;
  }
  armor.turretPivot[1] += liftM;
  return armor;
}

const T80U_HULL_LIFT_M = 0.18;

// ERA behavior packs (t90m precedent: keReduction fraction + flat CE add).
const KONTAKT5 = { keReduction: 0.20, ceFlatMm: 400 };
const MALACHIT = { keReduction: 0.25, ceFlatMm: 450 };

// MBT-70: all three crewmen rode in the turret and the 152 mm launcher fed
// from the rear turret magazine.  Start with the shared MBT plate topology,
// then replace the conventional hull-driver arrangement with that defining
// internal layout.  The comparison GLB is an authoring oracle only; these
// volumes are authored against the procedural geometry below.
function mbt70Armor() {
  const armor = mbtArmor({
    hl: 3.70, hw: 1.74, roofY: 1.57, trkTop: 1.11, floor: 0.42,
    // The longer Abrams-like bustle is balanced by moving the complete
    // turret rig forward; the gun and every fitting inherit the same pivot
    // so articulation remains coherent.
    turretPivot: [0, 1.49, 0.57], gunPivot: [0, 0.37, 1.08],
    barrelLenM: 3.88, barrelRadM: 0.098,
    glacis: { ke: 260, ce: 330, phys: 190 }, lower: { ke: 120, ce: 145 },
    side: { ke: 80, ce: 95 }, skirtMm: 18, rear: 45, roof: 38,
    cheek: { ke: 330, ce: 420, phys: 300 }, tSide: { ke: 150, ce: 190 },
    tRear: 55, tRoof: 42, mantlet: { ke: 245, ce: 310 },
    // The cast shell now spans essentially the complete 3.51 m hull width.
    // Keep the simulation cheek volume aligned with that widened visual
    // envelope instead of preserving the former narrow 2.84 m turret.
    tHalfW: 1.72, tFrontZ: 1.50, tRearZ: -2.92, tH: 0.84,
    glacisNoseZ: 3.65, glacisTopZ: 2.21, bustleAmmo: true,
  });
  armor.modules = armor.modules.filter((m) => m.module !== 'ammoRack');
  armor.modules.push(
    mbox('ammoRack', [-1.04, 0.10, -2.84], [1.04, 0.72, -1.62], true),
    mbox('missileRack', [-0.92, 0.16, -2.78], [0.92, 0.68, -1.68], true),
  );
  armor.crew = [
    cbox('driver', [-0.94, 0.12, -0.88], [-0.24, 0.76, -0.08], true),
    cbox('gunner', [0.18, 0.10, 0.05], [0.91, 0.76, 0.82], true),
    cbox('commander', [0.22, 0.12, -1.08], [1.02, 0.80, -0.28], true),
  ];
  return armor;
}

// ---------------------------------------------------------------------------
// Specs (the generator's source; the registry holds modern2Specs.generated.ts)
// ---------------------------------------------------------------------------
// type99a RE-LISTED 2026-08-08 (§5.38 owner priority wave: "fully model a
// custom type99a based on this model" — the Type 99A2 print drop VOIDS the
// 2026-08-06 "no GLB" delist reason). The print is a LOCAL-ONLY measurement
// oracle (community-candidates quarantine, registered in the three harness
// maps + vertex REG); the playable stays procedural (buildType99A below).
export const MODERN2_SPECS: TankSpecRegistry = {
  leo2a4: {
    id: 'leo2a4', name: 'Leopard 2A2', nation: 'Germany', era: 'modern', role: 'mbt',
    hp: 2200,
    enginePowerHp: 1500, weightTons: 55.15, topSpeedKmh: 70, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 5.8, baseAccuracy: 0.30, aimTimeS: 1.7,
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('DM33 APFSDS', 120, 480, 500, 1650),
        shell('DM12 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1140),
        shell('DM12 HE proxy', 'HE', 120, 40, 40, 560, 1000),
      ],
    },
    // The owner-authoritative OTCo source supersedes the former oversized
    // procedural FLW envelope. Its actual 12%-filtered body course is 2.76 m;
    // the taller antenna/MG lines remain legal spikes rather than a false
    // broad 3.03 m body datum (§5.73-1 P95-envelope law).
    dims: { hullLengthM: 7.72, overallLengthM: 10.12, widthM: 3.70, heightM: 2.76 },
    armor: mbtArmor({
      hl: 3.86, hw: 1.85, roofY: 1.72, trkTop: 1.0, floor: 0.5,
      turretPivot: [0, 1.72, 0.30], gunPivot: [0, 0.42, 0.55],
      barrelLenM: 5.36, barrelRadM: 0.079,
      glacis: { ke: 400, ce: 600, phys: 450 }, lower: { ke: 250, ce: 300 },
      side: { ke: 80, ce: 80 }, rear: 45, roof: 40,
      cheek: { ke: 420, ce: 700, phys: 600 }, tSide: { ke: 300, ce: 420 },
      tRear: 60, tRoof: 40, mantlet: { ke: 350, ce: 420 },
      tHalfW: 1.24, tFrontZ: 1.20, tRearZ: -2.30, tH: 0.76,
      glacisNoseZ: 3.83, glacisTopZ: 1.0, crew4: true,
    }),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '414', trackWidthM: 0.635, camoScale: 0.5,
    },
  },

  t80u: {
    id: 't80u', name: 'T-80UK', nation: 'USSR/Russia', era: 'modern', role: 'mbt',
    hp: 1900,
    enginePowerHp: 1250, weightTons: 46, topSpeedKmh: 70, reverseSpeedKmh: 11,
    hullTraverseDegS: 43,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 14, gunDepressionDeg: 5,
    gun: {
      caliberMm: 125, reloadS: 7.2, baseAccuracy: 0.36, aimTimeS: 2.2,
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('3BM46 Svinets', 125, 550, 510, 1700),
        shell('3BK29M HEAT', 'HEAT', 125, 630, 630, 470, 905),
        shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 570, 850),
      ],
    },
    dims: { hullLengthM: 7.01, overallLengthM: 9.65, widthM: 3.60, heightM: 2.38 },
    armor: liftHullAssemblyAboveTracks(mbtArmor({
      hl: 3.5, hw: 1.8, roofY: 1.38, trkTop: 1.0, floor: 0.43,
      turretPivot: [0, 1.38, 0.15], gunPivot: [0, 0.32, 0.55],
      barrelLenM: 6.0, barrelRadM: 0.068,
      glacis: { ke: 480, ce: 550, phys: 500 }, lower: { ke: 120, ce: 120 },
      side: { ke: 80, ce: 80 }, rear: 45, roof: 40,
      cheek: { ke: 550, ce: 600, phys: 650 }, tSide: { ke: 300, ce: 350 },
      tRear: 50, tRoof: 45, mantlet: { ke: 350, ce: 400 },
      tHalfW: 1.15, tFrontZ: 0.95, tRearZ: -1.15, tH: 0.74,
      glacisNoseZ: 3.40, glacisTopZ: 1.92,
      hullEra: [
        fr('glacis_era_L', 15, 0.76, 0.92, 3.44, 1.40, 2.0, { kind: 'era', era: KONTAKT5 }),
        fr('glacis_era_R', 15, 0.76, 0.92, 3.44, 1.40, 2.0, { kind: 'era', era: KONTAKT5 }),
      ],
      turretEra: [
        chR('turret_era_R', 15, 0.26, 1.0, 1.08, 0.30, 0.05, 0.66, 0.08, 0, { kind: 'era', era: KONTAKT5 }),
        chL('turret_era_L', 15, 0.26, 1.0, 1.08, 0.30, 0.05, 0.66, 0.08, 0, { kind: 'era', era: KONTAKT5 }),
      ],
    }), T80U_HULL_LIFT_M),
    visual: {
      // r5 ("entire vehicle is one uniform pale pea-green ... factory scheme
      // applies no camo pattern"): base pulled ANOTHER step toward wartime
      // 4BO and the factory coat becomes the Soviet 3-tone — black-green +
      // sand angular fields over the dark green (nato painter morphology,
      // russian palette). The stripped-shell repaint samples this canvas.
      scheme: 'nato', base: '#3a4832', weather: '#44523c',
      patches: ['#272d22', '#71684a'],
      marking: 'number', number: '518', trackWidthM: 0.60, camoScale: 0.5,
    },
  },

  leclerc: {
    id: 'leclerc', name: 'Leclerc S2', nation: 'France', era: 'modern', role: 'mbt',
    hp: 2350,
    enginePowerHp: 1500, weightTons: 54.5, topSpeedKmh: 71, reverseSpeedKmh: 25,
    hullTraverseDegS: 46,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 15, gunDepressionDeg: 8,
    gun: {
      caliberMm: 120, reloadS: 16.5, baseAccuracy: 0.29, aimTimeS: 1.8,
      // Three-round ready rack: rapid presentation from the Leclerc bustle
      // conveyor, followed by an all-or-nothing magazine replenishment.
      autoloader: { magazineSize: 3, intraClipS: 2.4, fullReloadS: 16.5 },
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('OFL 120 F2 APFSDS', 120, 660, 530, 1790),
        shell('OECC 120 F1 HEAT', 'HEAT', 120, 620, 620, 480, 1100),
        shell('OE 120 F1 HE', 'HE', 120, 45, 45, 580, 950),
      ],
    },
    dims: { hullLengthM: 6.88, overallLengthM: 9.87, widthM: 3.60, heightM: 2.53 },
    armor: mbtArmor({
      hl: 3.44, hw: 1.8, roofY: 1.60, trkTop: 1.0, floor: 0.48,
      turretPivot: [0, 1.60, -0.1], gunPivot: [0, 0.40, 0.6],
      barrelLenM: 6.2, barrelRadM: 0.075,
      glacis: { ke: 550, ce: 700, phys: 550 }, lower: { ke: 300, ce: 350 },
      side: { ke: 80, ce: 100 }, skirtMm: 60, rear: 50, roof: 40,
      cheek: { ke: 620, ce: 900, phys: 700 }, tSide: { ke: 320, ce: 450 },
      tRear: 60, tRoof: 45, mantlet: { ke: 400, ce: 500 },
      tHalfW: 1.18, tFrontZ: 1.05, tRearZ: -1.95, tH: 0.85,
      glacisNoseZ: 3.40, glacisTopZ: 1.55, bustleAmmo: true,
    }),
    visual: {
      // French 3-tone Centre-Europe: hard-edged vert armée / brun terre / noir
      scheme: 'nato', base: '#3e4d3a', weather: '#48573f',
      patches: ['#5b4a38', '#1d1f1c'],
      marking: 'number', number: '33', trackWidthM: 0.635, camoScale: 0.45,
    },
  },

  mbt70: {
    id: 'mbt70', name: 'MBT-70', nation: 'Germany', era: 'cold-war', role: 'mbt',
    hp: 2450,
    enginePowerHp: 1475, weightTons: 50.4, topSpeedKmh: 69, reverseSpeedKmh: 32,
    hullTraverseDegS: 42,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    // The MBT-70's adjustable hydropneumatic gear is a real long-travel rig,
    // not merely a flag that tilts the hull. The explicit envelope lets all
    // seven road-wheel stations and the loaded track run follow that attitude
    // instead of saturating at the fleet's shallow conventional defaults.
    hydropneumaticAim: {
      noseDownDeg: 10, noseUpDeg: 10, rateDegS: 8,
      compressionM: 0.65, droopM: 0.65,
    },
    turretTraverseDegS: 40, gunPitchDegS: 28, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 152, reloadS: 9.8, baseAccuracy: 0.30, aimTimeS: 1.9,
      bloom: { move: 0.07, hullRot: 0.08, turret: 0.06, afterShot: 2.0 },
      // The XM150 is one physical gun/launcher. Slot 1 keeps the Shillelagh
      // as the default, while 2/3 expose the real conventional cartridge
      // paths; only the round carrying `guided: true` gets missile flight.
      primaryGuided: true,
      shells: [
        shell('XMGM-51C Shillelagh ATGM', 'HEAT', 152, 800, 800, 750, 208, {
          guided: true, guidanceTurnRateRadS: 0.72, reloadS: 9.8, launcherTubes: 0,
          count: 13,
          soundProfile: 'shillelagh-launch',
        }),
        shell('XM578 APFSDS-T', 'APFSDS', 152, 690, 630, 640, 1478, {
          pen2000Mm: 570, reloadS: 9.8, count: 20,
        }),
        shell('M409A1 HEAT-MP', 'HEAT', 152, 680, 680, 680, 689, {
          reloadS: 9.8, count: 15,
        }),
      ],
    },
    dims: {
      hullLengthM: 7.42, overallLengthM: 9.37, widthM: 3.51, heightM: 2.59,
      // Published height is the turret roof.  The fidelity envelope includes
      // the commanded .50-cal station and its attached sighting furniture.
      silhouetteHeightM: 3.28,
    },
    armor: mbt70Armor(),
    visual: {
      // Modernized Bundeswehr flecktarn: desaturated field-gray anchors the
      // hull while tight charcoal, pine and oxide flecks break up the new ERA
      // and stowage without turning the vehicle into bright prototype green.
      // The smaller repeat keeps the large MBT-70 slabs visually detailed at
      // gallery distance and makes the factory finish feel deliberately
      // authored rather than like a generic three-color fallback.
      scheme: 'fleck', base: '#4b5142', weather: '#5b604f',
      patches: ['#2c332a', '#6a5640', '#1d211f'],
      marking: 'cross', number: '70', trackWidthM: 0.58, camoScale: 0.42,
    },
  },

  type99a: {
    id: 'type99a', name: 'ZTZ-99 Longwei', nation: 'China', era: 'modern', role: 'mbt',
    description: 'Original Chinese game concept: the retained ZTZ-99A-derived Longwei design.',
    hp: 2400,
    enginePowerHp: 1500, weightTons: 55, topSpeedKmh: 70, reverseSpeedKmh: 12,
    hullTraverseDegS: 42,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 14, gunDepressionDeg: 7,
    gun: {
      caliberMm: 125, reloadS: 7.0, baseAccuracy: 0.33, aimTimeS: 2.1,
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('DTC10-125 APFSDS', 125, 660, 520, 1740),
        shell('DTP-125 HEAT', 'HEAT', 125, 650, 650, 470, 950),
        shell('DTB-125 HE', 'HE', 125, 50, 50, 580, 900),
      ],
    },
    // 2026-08-12 oracle re-measurement. The user-supplied Type 99A2 GLB is
    // reference-only, but its physical envelope is the requested datum for
    // this redesign: hull 7.76 m, muzzle-to-stern 11.66 m, width 3.70 m and
    // 3.14 m to the broad panoramic/combat-station envelope (thin antenna
    // whips are excluded). The prior 7.35/10.70/2.50 values described a
    // different brochure datum and made an accurately measured build fail
    // the dimensional gate for being accurate to the supplied model.
    dims: {
      hullLengthM: 7.76, overallLengthM: 11.66, widthM: 3.7, heightM: 3.16,
      // The fused source's 12%-thickness side-body trace is 7.079 m; its
      // published/full 7.76 m hull envelope includes thin guards and the
      // rear U-cable.  Keep gameplay on the full physical envelope while
      // letting the silhouette gate compare like with like.
      silhouetteHullLengthM: 7.08,
      // P95 normalization only: the finished VT-derived turret and the fused
      // oracle both reach about 3.60 m through their connected stabilized
      // command station. Thin whip tips remain excluded from this datum.
      silhouetteHeightM: 3.60,
    },
    // Type 99-specific segmented combat envelope. The rendered vehicle is a
    // measured multi-course hull/welded-arrow turret; the old generic MBT
    // slabs were visibly shallow and no longer followed this build.
    armor: createType99Armor('type99a'),
    visual: {
      // PLA woodland digital splinter (tight micro-square scale)
      scheme: 'digital', base: '#4d573f', weather: '#57614a',
      patches: ['#6f684c', '#39412f', '#23261e'],
      marking: 'number', number: '215', trackWidthM: 0.60, camoScale: 0.42,
    },
  },

  leo1a5: {
    id: 'leo1a5', name: 'Leopard 1A5', nation: 'Germany', era: 'modern', role: 'mbt',
    hp: 1550,
    enginePowerHp: 830, weightTons: 42.2, topSpeedKmh: 65, reverseSpeedKmh: 25,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 }, pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 105, reloadS: 5.5, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('DM63 (105) APFSDS', 105, 390, 390, 1455),
        shell('DM512 HEAT', 'HEAT', 105, 400, 400, 400, 1173),
        shell('DM21 HE', 'HE', 105, 45, 45, 470, 730),
      ],
    },
    dims: { hullLengthM: 7.09, overallLengthM: 9.54, widthM: 3.37, heightM: 2.62 },
    armor: mbtArmor({
      hl: 3.54, hw: 1.68, roofY: 1.30, trkTop: 0.92, floor: 0.42,
      turretPivot: [0, 1.30, -0.05], gunPivot: [0, 0.38, 0.5],
      barrelLenM: 5.2, barrelRadM: 0.064,
      glacis: { ke: 70, ce: 70, phys: 70 }, lower: { ke: 70, ce: 70 },
      side: { ke: 35, ce: 35 }, rear: 25, roof: 20,
      cheek: { ke: 120, ce: 120, phys: 120 }, tSide: { ke: 45, ce: 45 },
      tRear: 35, tRoof: 20, mantlet: { ke: 120, ce: 120 },
      tHalfW: 1.05, tFrontZ: 0.75, tRearZ: -1.15, tH: 0.72,
      // The procedural exterior breaks at z=2.674 to hold the Leopard 1's
      // 60-degree-from-vertical upper glacis. Keep the combat surface on the
      // same station so visual and hit geometry agree.
      glacisNoseZ: 3.54, glacisTopZ: 2.674, crew4: true,
    }),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '123', trackWidthM: 0.55, camoScale: 0.5,
    },
  },

  t14: {
    id: 't14', name: 'Object 148 Proto', nation: 'Russia', era: 'modern', role: 'mbt',
    hp: 2700,
    enginePowerHp: 1500, weightTons: 55, topSpeedKmh: 75, reverseSpeedKmh: 25,
    hullTraverseDegS: 46,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 8,
    gun: {
      caliberMm: 125, reloadS: 6.5, baseAccuracy: 0.32, aimTimeS: 2.0,
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('Vacuum-1 APFSDS', 125, 800, 550, 1800),
        shell('3VBK27 HEAT', 'HEAT', 125, 700, 700, 480, 960),
        shell('Telnik HE-Frag', 'HE', 125, 55, 55, 600, 850),
      ],
    },
    // heightM is the mast-inclusive datum (packet-filed 2.7 -> 3.16, the
    // oracle extract's measured bodyHeightM: real T-14 masts carry the p95;
    // 2.7 is the unmanned-turret roof).
    // Runtime/render datum. The private comparison print and the authored
    // current vehicle both terminate at 9.97-9.98 m; 10.8 m is the published
    // real-vehicle gun-forward figure and no longer describes this playable.
    dims: { hullLengthM: 8.7, overallLengthM: 9.98, widthM: 3.9, heightM: 3.16 },
    armor: mbtArmor({
      // MEASURED-LADDER r1 (oracle 3DYAROSLAV2 print, §B8 proportion truth):
      // deck raised to the print's 1.685 line (the r7 eyeball cut 1.62->1.50
      // predates the oracle; the print + the published 2.7 roof both want
      // the higher deck), gun bore-line 2.03 (print tube axis, level).
      hl: 4.35, hw: 1.95, roofY: 1.685, trkTop: 1.05, floor: 0.43,
      // PROPORTION ROUND r2 (owner 2026-08-17): the ring STAYS at -0.60.
      // A -0.68 aft re-seat was tried and measured 73.5 -> 21.9 (reverted):
      // tmp-moderns-worldtrace's camera-frame z is NOT build-world z, and
      // its apparent -0.70 offset was a frame artefact. The trustworthy
      // frame is the raw GLB through the extract's own axisMap
      // (gate_z = -2.057775*glb_z + 0.6785, corroborated by gunBox hi
      // 5.643 == our 5.64 muzzle): ref turret nodes 8/9/10/11/15 span
      // world z -2.861..+1.358, ours -2.855..+1.62 — the REAR already
      // registers; only the FRONT runs 0.26 long.
      turretPivot: [0, 1.685, -0.60], gunPivot: [0, 0.345, 0.6],
      // Keep the gameplay/shadow proxy on the authored 2A82 tube below.
      // The former 6.45 m value belonged to the retired 10.8 m datum and
      // extended collision/armor truth beyond the visible 5.64 m barrel.
      barrelLenM: 5.64, barrelRadM: 0.07,
      glacis: { ke: 900, ce: 1200, phys: 900 }, lower: { ke: 300, ce: 350 },
      side: { ke: 200, ce: 200 }, rear: 60, roof: 50,
      // UNMANNED turret shell — thin cladding; hits eat optics/gun, not crew
      cheek: { ke: 300, ce: 300, phys: 300 }, tSide: { ke: 300, ce: 300 },
      tRear: 60, tRoof: 50, mantlet: { ke: 300, ce: 300 },
      tHalfW: 1.44, tFrontZ: 2.22, tRearZ: -2.28, tH: 0.87,
      glacisNoseZ: 4.30, glacisTopZ: 2.15, capsule: true,
      hullEra: [
        // ERA-DEF/GEOMETRY COUPLING: re-anchored to the ladder-r1 shallow
        // glacis plane (1.385@3.95 -> 1.665@2.15) + the 0.80..1.70 skirt
        // panel band in the SAME edit as the visual movers below.
        fr('glacis_era_L', 15, 0.9, 1.36, 4.02, 1.64, 2.25, { kind: 'era', era: MALACHIT }),
        fr('glacis_era_R', 15, 0.9, 1.36, 4.02, 1.64, 2.25, { kind: 'era', era: MALACHIT }),
        sR('skirt_era_R', 15, 1.90, 0.80, 1.90, 1.70, 0.8, 4.0, { kind: 'era', era: MALACHIT }),
        sL('skirt_era_L', 15, 1.90, 0.80, 1.90, 1.70, 0.8, 4.0, { kind: 'era', era: MALACHIT }),
      ],
    }),
    visual: {
      // factory dark green, parade-clean (near-black panel shading via dark buckets)
      scheme: 'solid', base: '#39442e', weather: '#42503a', patches: [],
      marking: 'number', number: '512', trackWidthM: 0.60,
    },
  },
};

// France-family expansion (2026-08-15).  Both playables are first-party
// procedural derivatives of the accepted Leclerc construction.  The owner
// GLBs are measurement/visual oracles only and are never registered here as
// runtime sources.  XLR carries the SCORPION-era passive protection package;
// AMX 56 is the heavier ERA/gun-plant branch requested from the second
// Leclerc oracle.
{
  const base = MODERN2_SPECS.leclerc;
  const cloneVec3 = (point: Vec3Tuple): MutableVec3Tuple => [point[0], point[1], point[2]];
  const cloneArmor = (armor: ArmorEnvelope): ArmorEnvelope => ({
    ...armor,
    turretPivot: cloneVec3(armor.turretPivot),
    gunPivot: cloneVec3(armor.gunPivot),
    gunBarrel: { ...armor.gunBarrel },
    hullPlates: armor.hullPlates.map((plate) => ({
      ...plate,
      verts: plate.verts.map(cloneVec3) as [MutableVec3Tuple, MutableVec3Tuple, MutableVec3Tuple, MutableVec3Tuple],
    })),
    turretPlates: armor.turretPlates.map((plate) => ({
      ...plate,
      verts: plate.verts.map(cloneVec3) as [MutableVec3Tuple, MutableVec3Tuple, MutableVec3Tuple, MutableVec3Tuple],
    })),
    modules: armor.modules.map((box) => ({
      ...box, min: cloneVec3(box.min), max: cloneVec3(box.max),
    })),
    crew: armor.crew.map((box) => ({
      ...box, min: cloneVec3(box.min), max: cloneVec3(box.max),
    })),
  });
  const passive = { keReduction: 0.08, ceFlatMm: 180 };
  const galixEra = { keReduction: 0.18, ceFlatMm: 330 };
  const xlrArmor = cloneArmor(base.armor);
  MODERN2_SPECS.leclerc_xlr = {
    ...base,
    id: 'leclerc_xlr', name: 'Leclerc SXXI', hp: 2650, // owner 2026-09-16: swapped with the leclerc_x study
    weightTons: 57.4, topSpeedKmh: 70,
    gun: {
      ...base.gun,
      reloadS: 15.5,
      autoloader: { magazineSize: 3, intraClipS: 2.2, fullReloadS: 15.5 },
      shells: base.gun.shells.map((round, index) => ({
        ...round,
        ...(index === 0 ? {
          name: 'OFL 120 F2-B APFSDS', pen100Mm: 891, pen1000Mm: 830,
          pen2000Mm: 730, dmg: 540,
        } : index === 1 ? { pen100Mm: 680, pen1000Mm: 680, dmg: 500 }
          : { dmg: 600 }),
      })),
    },
    dims: { ...base.dims, widthM: 3.64, heightM: 2.78 },
    armor: {
      ...xlrArmor,
      hullPlates: [
        ...xlrArmor.hullPlates,
        fr('xlr_glacis_package', 90, 1.48, 1.30, 3.36, 1.54, 1.70,
          { kind: 'spaced', era: passive, keMm: 700, ceMm: 950 }),
        sR('xlr_skirt_package_R', 70, 1.82, 0.78, 1.82, 1.38, -2.95, 2.30,
          { kind: 'spaced', ceMm: 330 }),
        sL('xlr_skirt_package_L', 70, 1.82, 0.78, 1.82, 1.38, -2.95, 2.30,
          { kind: 'spaced', ceMm: 330 }),
      ],
      turretPlates: [
        ...xlrArmor.turretPlates,
        chR('xlr_cheek_package_R', 120, 0.34, 1.34, 1.46, 0.56, 0.12, 0.66, 0.10, 0,
          { kind: 'spaced', era: passive, keMm: 760, ceMm: 1050 }),
        chL('xlr_cheek_package_L', 120, 0.34, 1.34, 1.46, 0.56, 0.12, 0.66, 0.10, 0,
          { kind: 'spaced', era: passive, keMm: 760, ceMm: 1050 }),
      ],
    },
    visual: { ...base.visual, number: '104' },
  };
  const amx56Armor = cloneArmor(base.armor);
  MODERN2_SPECS.amx56 = {
    ...base,
    id: 'amx56', name: 'Leclerc S1', hp: 2750, // owner 2026-09-16: swapped with the leclerc_classic_x study
    enginePowerHp: 1550, weightTons: 58.8, topSpeedKmh: 68,
    gun: {
      ...base.gun,
      reloadS: 14.5, aimTimeS: 1.6,
      autoloader: { magazineSize: 3, intraClipS: 2.0, fullReloadS: 14.5 },
      shells: base.gun.shells.map((round, index) => ({
        ...round,
        ...(index === 0 ? {
          name: 'OFL 120 F3 APFSDS', pen100Mm: 916, pen1000Mm: 850,
          pen2000Mm: 750, dmg: 550,
        } : index === 1 ? { pen100Mm: 700, pen1000Mm: 700, dmg: 510 }
          : { dmg: 610 }),
      })),
    },
    dims: { ...base.dims, widthM: 3.72, heightM: 2.88 },
    armor: {
      ...amx56Armor,
      hullPlates: [
        ...amx56Armor.hullPlates,
        fr('amx56_glacis_era', 18, 1.52, 1.28, 3.38, 1.54, 1.70,
          { kind: 'era', era: galixEra, keMm: 720, ceMm: 1100 }),
        sR('amx56_skirt_era_R', 18, 1.83, 0.80, 1.83, 1.35, -2.72, 2.15,
          { kind: 'era', era: galixEra, keMm: 250, ceMm: 520 }),
        sL('amx56_skirt_era_L', 18, 1.83, 0.80, 1.83, 1.35, -2.72, 2.15,
          { kind: 'era', era: galixEra, keMm: 250, ceMm: 520 }),
      ],
      turretPlates: [
        ...amx56Armor.turretPlates,
        chR('amx56_cheek_era_R', 18, 0.30, 1.42, 1.49, 0.56, 0.12, 0.66, 0.10, 0,
          { kind: 'era', era: galixEra, keMm: 780, ceMm: 1180 }),
        chL('amx56_cheek_era_L', 18, 0.30, 1.42, 1.49, 0.56, 0.12, 0.66, 0.10, 0,
          { kind: 'era', era: galixEra, keMm: 780, ceMm: 1180 }),
      ],
    },
    visual: {
      ...base.visual,
      base: '#35483a', weather: '#405544', patches: ['#1e2521', '#5f4b37'],
      number: '056',
    },
  };
}

// ===========================================================================
// Builders
// ===========================================================================


// ---------------------------------------------------------------------------
// §C missing-side winding guard (BUILD-STANDARD: every profile that mirrors
// slabs binds through one) — face-outwardness census, re-orders reversed
// rings. Same device as modern3.ts/misc.ts. KIT deref at call time only.
// ---------------------------------------------------------------------------
function orientedSlab99(
  b0: MutableVec3Tuple,
  b1: MutableVec3Tuple,
  b2: MutableVec3Tuple,
  b3: MutableVec3Tuple,
  t0: MutableVec3Tuple,
  t1: MutableVec3Tuple,
  t2: MutableVec3Tuple,
  t3: MutableVec3Tuple,
): THREE.BufferGeometry {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen: MutableVec3Tuple = [0, 1, 2].map(
    (k) => c8.reduce((sum, point) => sum + point[k], 0) / 8,
  ) as MutableVec3Tuple;
  const sub = (a: Vec3Tuple, b: Vec3Tuple): MutableVec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3Tuple, b: Vec3Tuple): MutableVec3Tuple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map(
      (k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4,
    ) as MutableVec3Tuple;
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// §B3.1 MUZZLE BORE (owner directive 2026-08-06) — same device as
// modern3.ts muzzleBore: the open outer wall carries the tube to the face
// and one flat dark cap closes it; the factory's fallback assembly is the
// visible dark mouth. Owner 2026-09-22: "the point of adding holes instead
// of carving them into the barrel is that we save on triangles" — the former
// inward funnel + finish torus + recessed disc (24·seg) is gone; 3·seg now.
// Mask-neutral, no see-through. Caller ends its capped tube ~4.2cm short of
// faceZ; boreR documents the true caliber at the call site.
function muzzleBore99(
  P: Modern2BuilderPort,
  faceZ: number,
  R: number,
  _boreR: number,
  seg = 14,
  rearR?: number,
) {
  const { cylY, xform } = KIT;
  P.add('gun', xform(cylY(R, rearR ?? R, 0.042, seg, true), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, faceZ - 0.021);
  P.add('gunDark', new THREE.CircleGeometry(R - 0.001, seg), 0, 0, faceZ - 0.002);
}

// ---------------------------------------------------------------------------
// Type 99A / ZTZ-99A — §5.38 PRINT-LOFT REBUILD (owner priority wave
// 2026-08-08: "fully model a custom type99a based on this model"). The
// Type 99A2 print (community-candidates, LOCAL-ONLY measurement/render
// oracle) supplies dimensions and silhouettes only. Every playable triangle
// below is repository-authored from KIT primitives/lofts; no print vertex,
// mesh, texture, conversion, or baked payload is present at runtime.
// Stations are reconstructed from measured envelopes and image evidence.
// §D frame: width anchor ±1.85 EXACT; authored thick hull body follows the
// oracle's -3.592..+3.52 m islands, with only a fully supported recovery loop
// reaching -4.242 m.  The final muzzle reaches +7.414 m, yielding the measured
// 11.66 m overall envelope. Deck 1.50 front / 1.78 powerpack deck rear
// (print ramp z -1.02..-1.42); glacis = TWO REAL PLANES (16.3-deg upper +
// 62-deg nose, print break at z 3.02/y 1.215 — real course lines, §B1);
// turret = one authored variable-height clipped-arrow loft at ±1.30, with
// swept cheeks, a stepped crown, supported equipment to ±1.75, and a backed
// bustle/basket to -2.42w; trunnion y 1.94.
// 2026-08-12 remeasurement pins the authored frame to the requested model:
// 3.70 m width, 7.76 m hull, 11.66 m overall and 3.16 m to the broad combat
// station (thin whips excluded). P95 comparison uses the connected 3.49 m
// stabilized-sensor station while ignoring only the much thinner whip tips.
// Identity (owner brief): arrow/chevron appliqué glacis, full skirts,
// welded arrow-front turret, tall gunner sight box right-of-center,
// commander pano, JD-3 dazzler, 125 with thermal sleeve, bustle basket,
// QJC-88 12.7 at the commander station FORWARD. Print carries SIX wheel
// stations (pitch 0.90, r 0.40) — the real ZTZ-99A count.
// ---------------------------------------------------------------------------
function buildType99ABaseHull(P: Modern2BuilderPort) {
  const { box, frustum, cylY, buildRunningGear, fenders, periscope } = KIT;
  const slab = orientedSlab99;                                                  // §C missing-side law
  const D2R = Math.PI / 180;
  // ---- GEAR (§B6 trapezoid, print-measured): SIX wheel stations pitch
  // 0.90 (print arm pivots 2.65..-2.05, rim dips at 2.35..-2.15), r 0.40,
  // centers y 0.50; track band x 1.16..1.76 (print 1.15..1.80, outer held
  // 0.03 clear of the 1.79 skirt inner plane); idler far +3.405 / sprocket
  // far -3.445 (print +3.40/-3.45); top run to ~1.27 (print 1.27) --------
  buildRunningGear(P, {
    // Fresh loose-part measurements from the isolated reference running gear
    // give r=0.405 m and a 0.901 m primary pitch. Keep those measurements as
    // datums only; the wheels and linked course remain our native system.
    style: 'rubber', wheelR: 0.405, wheelW: 0.24, wheelY: 0.4905, xc: 1.473,
    dishR: 0.80,
    // Fresh component census of the read-only oracle, copied as station
    // measurements only (never as vertices): six 0.405 m wheel discs on an
    // exact 0.901 m cadence, with the whole row offset 14 mm forward.
    wheelZs: [2.266, 1.365, 0.464, -0.436, -1.337, -2.238],
    // end wheels raised (curve-probe r3: the print's wrap arcs climb
    // earlier/higher at both ends — ramps per §B6)
    // Tighter raised terminal wheels keep the same measured outer span while
    // producing the source's steep end transitions instead of a pair of
    // oversized semicircular bows.
    // Visible end-wheel radii remain source-exact, while the native linked
    // course uses the oracle's lower pitch radii.  Decoupling the two keeps
    // the shoes under the measured y=1.276 course ceiling instead of wrapping
    // over the rear deck and terminal guards.
    sprocket: { z: -3.066, y: 0.903, r: 0.385, trackR: 0.20 },
    idler: { z: 3.069, y: 0.919, r: 0.255, trackR: 0.18 },
    rollers: [1.60, 0.15, -1.30].map((z) => ({ z, y: 1.14, r: 0.08 })),
    // The isolated reference course is 0.629 m wide and its return run sits
    // at y=1.276 m. The earlier authored 1.14 m return made the terminal
    // ramps too shallow even though the wheel count was correct.
    trackW: 0.629, topY: 1.276, botY: 0.025, arms: true, paintedEnds: true, coveredTop: 1.0,
    contactZR: -2.35,
  });
  // ---- hull core: belly between the tracks + full-width sponson decks
  // (print: belly floor 0.385, front deck plane 1.50 to z -1.02, powerpack
  // ramp -1.02..-1.42, raised rear deck 1.78 to the stern plate -3.66) ----
  // Raised central tub: the reference exposes real suspension negative space
  // between the six wheels.  The former floor-to-sponson box filled every
  // gap and made the track course read as one solid capsule in pure side.
  P.add('hull', box(2.20, 0.625, 6.82), 0, 0.9925, -0.182);                    // belly ±1.10, y 0.68..1.305,
                                                                               //   z -3.592..3.228, matching the
                                                                               //   oracle's principal hull island
                                                                               //   62-deg nose plate; 0.06 inboard
                                                                               //   of the 1.16 band face — §B2
                                                                               //   channels stay open)
  P.add('hull', box(3.40, 0.16, 3.06), 0, 1.42, 0.50);                         // front sponson band ±1.70,
                                                                               //   y 1.34..1.50 (clear of the 1.276
                                                                               //   track top), z -1.03..2.03
  P.add('hull', frustum(1.70, -1.02, -1.06, 1.70, -1.28, -1.42, 1.50, 1.78));  // powerpack ramp (one raked course)
  P.add('hull', box(3.40, 0.44, 2.26), 0, 1.56, -2.53);                        // raised rear deck band ±1.70,
                                                                               //   y 1.34..1.78, z -3.66..-1.40
  P.add('hull', cylY(0.86, 0.86, 0.07, P.q ? 28 : 18), 0, 1.475, 0.28);        // turret ring seat (base 1.44 sits
                                                                               //   in the 1.50 deck recess)
  // Oracle main-fender islands terminate at z=-3.59/+3.46.  Preserve that
  // thick-body span; only the supported recovery cable is allowed to reach
  // the published full 7.76 m hull envelope.
  fenders(P, 1.12, 1.83, 1.47, -3.59, 3.46, 0.03);
  // ---- GLACIS — TWO REAL PLANES (§B1 course lines, print-measured):
  // upper 16.3 deg y(z) = 1.50 - 0.284(z - 2.02) from the deck edge to the
  // nose break (3.02, 1.215); then the 62-deg nose plate to the toe
  // (3.30, 0.70); lower bow drops to the belly. Full-width underside at
  // the idler crest (z 3.0): 1.175 over the 0.965+0.085 wrap = 0.12 clear.
  P.add('hull', slab(                                                          // upper glacis center lane
    [-1.08, 1.215, 3.02], [1.08, 1.215, 3.02], [1.08, 1.165, 2.90], [-1.08, 1.165, 2.90],
    [-1.08, 1.50, 2.02], [1.08, 1.50, 2.02], [1.08, 1.50, 1.84], [-1.08, 1.50, 1.84]));
  // Raised outer shoulder skins continue the same glacis visually while
  // leaving the terminal track lanes physically open underneath.
  // 2026-10-07 (tank-accessories round 3): the skins' rear faces rose at 49 deg
  // straight at the turret, so from behind they caught the sun only at grazing
  // and read as "a black void" under the chevron wings. The rear top corner moves
  // from (2.02, 1.68) to (2.20, 1.658) on the unchanged top line, turning the
  // face into a 28 deg ramp that takes the sky; it stays 6.5 cm or more under
  // the turret's side-belt and bustle sweeps (1.565 m at r 1.60-1.65 and 2.10).
  P.add('hull', slab(
    [1.08, 1.50, 2.90], [1.70, 1.50, 2.90], [1.70, 1.47, 1.84], [1.08, 1.47, 1.84],
    [1.08, 1.56, 3.02], [1.70, 1.56, 3.02], [1.70, 1.658, 2.20], [1.08, 1.658, 2.20]));
  P.add('hull', slab(
    [-1.70, 1.50, 2.90], [-1.08, 1.50, 2.90], [-1.08, 1.47, 1.84], [-1.70, 1.47, 1.84],
    [-1.70, 1.56, 3.02], [-1.08, 1.56, 3.02], [-1.08, 1.658, 2.20], [-1.70, 1.658, 2.20]));
  // Inner cheeks of the raised shoulders: from the centre lane's sloping top
  // up into the skin and the bow wedge, so the stepped glacis no longer shows
  // the track lane's void (and the interior fill above the shoes) under the
  // skins' inner edges (the critics' "loose grey interior parts").
  for (const s of [-1, 1]) {
    const xi = s * 1.052, xo = s * 1.100;                                     // straddles the skin's 1.08 inner edge
    P.add('hull', slab(
      [xi, 1.48, 2.00], [xo, 1.48, 2.00], [xo, 1.206, 2.98], [xi, 1.206, 2.98],
      [xi, 1.495, 2.00], [xo, 1.495, 2.00], [xo, 1.50, 2.98], [xi, 1.50, 2.98]));
  }
  P.add('hull', slab(                                                          // 62-deg nose plate inside the
    [-1.08, 0.70, 3.30], [1.08, 0.70, 3.30], [1.08, 0.70, 3.18], [-1.08, 0.70, 3.18], // terminal shoe lanes
    [-1.08, 1.215, 3.02], [1.08, 1.215, 3.02], [1.08, 1.215, 2.86], [-1.08, 1.215, 2.86]));
                                                                               //   outranks print (0.03 lane off
                                                                               //   the 1.16 track inner face)
  P.add('hull', slab(                                                          // lower bow lane to the belly
    [-1.08, 0.385, 3.34], [1.08, 0.385, 3.34], [1.08, 0.385, 3.20], [-1.08, 0.385, 3.20],
    [-1.08, 0.70, 3.30], [1.08, 0.70, 3.30], [1.08, 0.70, 3.16], [-1.08, 0.70, 3.16]));
  // glacis-to-sponson shoulder wedges close the ±1.22..±1.70 gap over the
  // nose plate (§B1 slope-motivates-the-mass: the flank continues the rake)
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // thin supported bridge above the
      [s * 1.08, 1.50, 3.10], [s * 1.70, 1.50, 2.96], [s * 1.70, 1.48, 2.86], [s * 1.08, 1.48, 3.00], // terminal shoe crest
      [s * 1.08, 1.57, 3.02], [s * 1.70, 1.57, 2.90], [s * 1.70, 1.52, 2.82], [s * 1.08, 1.52, 2.94]));
  }
  // ---- DOZER BLADE under the bow (print y 0.39..0.53, z 2.5..3.0 center) -
  P.add('hull', box(2.10, 0.15, 0.50), 0, 0.465, 2.74);
  P.add('hullDark', box(2.06, 0.05, 0.06), 0, 0.42, 2.99);                     // blade lip
  for (const s of [-1, 1]) P.add('hullDetail', box(0.10, 0.10, 0.55), s * 0.72, 0.44, 2.42); // ram arms
  // front mudguards + flaps: the source's thick fender/flap body ends near
  // z=+3.52; thin brackets remain supported inside that measured envelope.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.68, 0.035, 0.30), s * 1.47, 1.455, 3.40);              // fender noses END ~3.55 (probe
                                                                               //   r3: the print bow line drops to
                                                                               //   ~1.1 by z 3.5 — no tall noses)
    P.add('hullRubber', box(0.60, 0.34, 0.028), s * 1.46, 0.91, 3.50);         // compact flap terminates at the
                                                                               //   oracle's +3.52 m thick-body line
    P.add('hullDetail', box(0.12, 0.09, 0.20), s * 1.78, 1.35, 3.43);          // hanger bracket spanning the
  }                                                                            //   skirt nose -> flap edge
  // ---- stern: compact split transom, backed grilles and raised flaps.  A
  // supported thin recovery loop supplies the oracle's -4.242 m extremum. --
  // Split transom: the low service face stays between the inner track lanes,
  // while shallow outboard shoulders bridge above the terminal shoes.  The
  // former full-width low wall physically crossed both rear wraps.
  P.add('hull', box(2.16, 0.86, 0.10), 0, 1.34, -3.47);                        // inboard structural transom
  for (const s of [-1, 1])
    P.add('hull', box(0.52, 0.30, 0.10), s * 1.42, 1.62, -3.47);               // raised outboard shoulders
  P.add('hull', box(2.06, 0.55, 0.09), 0, 0.68, -3.48);                        // lower center lane
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.58, 0.26, 0.05), s * 0.86, 1.58, -3.535);          // exhaust grilles
    for (const k of KIT.grilleIndices(P.q, 4, 2)) {
      P.add('hullDetail', box(0.54, 0.03, 0.05), s * 0.86, 1.49 + k * 0.06, -3.55);
    }
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.50, 1.66, -3.54);           // taillights
    P.add('hullRubber', box(0.60, 0.24, 0.028), s * 1.46, 1.62, -3.50);        // compact rear flaps above the wrap
    P.add('hullDetail', box(0.07, 0.10, 0.09), s * 1.62, 1.54, -3.515);        // flap hinge straps bridging the
    P.add('hullDetail', box(0.07, 0.10, 0.09), s * 1.30, 1.54, -3.515);        //   plate face (§5.27 mechanism)
    P.add('hullDetail', box(0.10, 0.16, 0.12), s * 0.65, 1.10, -3.54);         // tow hooks
  }
  P.add('hullDetail', box(0.30, 0.18, 0.04), 0, 1.55, -3.54);                  // convoy light plate
  P.add('hullDark', box(0.05, 0.30, 0.48), -1.840, 1.32, -2.10);               // LEFT hull exhaust port (t72
                                                                               //   lineage read) — outward plate
                                                                               //   outside the live left shoe lane
  P.decal('hull', 'soot', null, 0.8, [-1.862, 1.30, -2.45], -Math.PI / 2);
  // The supplied Type 99A oracle does not carry the conspicuous exposed
  // orange unditching log inherited from the older generic T-72 rear kit.
  // Leave this as backed service structure; the recovery loop below supplies
  // the thin -4.242 m source extremum without inventing a thick body anchor.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.05, 0.05, 0.18), s * 0.80, 1.55, -3.53);         // compact rack side rails
    P.add('hullDetail', box(0.05, 0.28, 0.05), s * 0.80, 1.42, -3.48);         // rack legs on the plate
  }
  P.add('hullDetail', box(1.64, 0.05, 0.05), 0, 1.53, -3.60);                  // rack rear rail (thin hardware)
  // The source's 7.76 m hull envelope is completed by a broad recovery loop
  // behind the structural -3.47 m transom.  Give that loop a shallow backed
  // tray and explicit end anchors: the thin cable may establish the measured
  // -4.242 m extremum, but it cannot be a free silhouette whisker.
  P.add('hull', box(1.76, 0.040, 0.68), 0, 1.45, -3.91);                       // backs the complete cable trough to z -4.25
  {
    // Round 3 (2026-10-07, critics: "a stiff bent tube hanging across the stowage with neither end secured"): the
    // loop lies flat in its tray (top 1.47) instead of arching 14 cm over it. The -4.24 m rear extremum is unchanged.
    // Round 4 (2026-10-07, wave 215: "the tow cable passes through a strap band on the stowage drum"): the type99a's
    // rear fuel drums (china.ts addRearFuelDrums: axis y 1.56, z -3.68, r 0.25) fill the tray's forward half, so the
    // loop runs in the strip behind them, its ends turned outboard along the tray's rear lip so each eye lies on the
    // tray (x <= 0.86) 5 cm clear of the drum skins; the eyes and the run are clipped down.
    const rearCable = FITTINGS.towCable({ mats: P.mats, r: 0.024, seed: 12,
      pts: [
        [-0.70, 1.494, -4.10], [-0.55, 1.494, -4.135], [-0.30, 1.494, -4.205],
        [0, 1.494, -4.24], [0.30, 1.494, -4.205], [0.55, 1.494, -4.135],
        [0.70, 1.494, -4.10],
      ] });
    P.hullG.add(rearCable);
    for (const x of [-0.78, 0.78]) P.add('hullDetail', box(0.06, 0.03, 0.06), x, 1.484, -4.085); // eye clips
    for (const x of [-0.42, 0.42]) P.add('hullDetail', box(0.05, 0.03, 0.05), x, 1.484, -4.18);  // run clips
  }
  // ---- glacis furniture ON the 16.3-deg plane: center driver hatch +
  // periscopes, splash V, mirror stalks, lights, tow cable -----------------
  P.add('hull', box(0.50, 0.05, 0.42), 0, 1.44, 2.22, -16.3 * D2R, 0, 0);      // driver CENTER hatch (99A tell)
  P.add('hullDark', box(0.44, 0.02, 0.36), 0, 1.468, 2.21, -16.3 * D2R, 0, 0);
  periscope(P, 'hullDetail', -0.14, 1.505, 1.94);
  periscope(P, 'hullDetail', 0.14, 1.505, 1.94);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.80, 0.045, 0.07), s * 0.40, 1.335, 2.62, -16.3 * D2R, s * 0.42, 0); // splash V
    // Compact driving mirrors: retain the characteristic rearward rake but
    // plant the heads close to the glacis shoulder.  The former 1.16 m rods
    // rose almost a metre above their fender feet and read as antennae.
    P.add('hullDetail', cylY(0.016, 0.016, 0.56, 8), s * 1.26, 1.68, 1.76, -0.76, 0, 0);
    P.add('hullDark', box(0.16, 0.18, 0.03), s * 1.26, 1.93, 1.53, -0.20, 0, 0);
    P.add('hullDetail', box(0.05, 0.05, 0.05), s * 1.26, 1.47, 1.96);          // stalk foot on the fender
    const lc = FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.14, r: 0.045, rake: -0.28, seed: 5 + s });
    lc.position.set(s * 0.88, 1.33, 2.78);
    P.hullG.add(lc);
    P.add('hullDetail', box(0.26, 0.03, 0.03), s * 0.88, 1.39, 2.72, -16.3 * D2R, 0, 0); // guard bar hugging the pods
    // 2026-10-07 (round 3): the guard's sheet web under the bar, from the glacis
    // to the bar and back over the pods' rear halves. The open pocket behind
    // the pods held interior-fill boxes that showed from above as loose grey parts.
    P.add('hullDetail', box(0.27, 0.075, 0.10), s * 0.88, 1.343, 2.715, -16.3 * D2R, 0, 0);
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.020, seed: 11,
      pts: [[1.30, 1.52, 2.95], [0.55, 1.58, 2.28], [-0.45, 1.56, 2.55]] });   // draped above the terminal course
    P.hullG.add(tc);
  }
}

function buildType99AHullDeckAndArmor(P: Modern2BuilderPort) {
  const { box, liftEye } = KIT;
  const D2R = Math.PI / 180;
  const num = P.spec.visual.number || '';
  // ---- decks: seams, engine grille field on the raised deck, intake,
  // fender bins, shadow strips ---------------------------------------------
  P.add('hullDark', box(1.55, 0.02, 1.30), 0, 1.785, -2.35);                   // engine grille inset (deck 1.78)
  for (const k of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDetail', box(1.45, 0.02, 0.055), 0, 1.792, -1.90 - k * 0.16);
  }
  P.add('hullDark', box(0.72, 0.02, 0.52), -0.52, 1.79, -1.62);                // left intake mesh
  P.add('hull', box(0.92, 0.05, 0.72), 0.48, 1.795, -1.72);                    // filter hump (LOW profile)
  P.add('hullDark', box(0.80, 0.02, 0.60), 0.48, 1.825, -1.72);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.12, 1.05), s * 1.62, 1.53, 1.05);                // fender stowage bins (front deck)
    P.add('hullDark', box(0.31, 0.014, 1.07), s * 1.62, 1.595, 1.05);          // lid seams
    P.add('hull', box(0.30, 0.08, 0.95), s * 1.62, 1.80, -2.55);               // rear deck bins (LOW — the print
                                                                               //   deck line reads clean 1.72-1.82)
    P.add('hullDark', box(0.31, 0.014, 0.97), s * 1.62, 1.845, -2.55);
  }
  liftEye(P, 'hullDetail', -1.30, 1.52, 1.70);
  liftEye(P, 'hullDetail', 1.30, 1.52, 1.70);
  liftEye(P, 'hullDetail', -1.30, 1.80, -3.05);
  liftEye(P, 'hullDetail', 1.30, 1.80, -3.05);
  // ---- SKIRTS at the ±1.85 anchor (§D guard, print faces ±1.85): deep
  // panel run (print skirt band y 0.39..1.47), FULL-DEPTH FY-4 TILE WALL
  // over the front two-thirds (print tile band y 0.47..1.34 z -2.06..2.70,
  // armor-linked bricks — faces ±1.85 EXACT), rubber rear, bow panels ------
  // Fleet lane 2026-10-08 (wave 269 chase frames: "the thin rear-corner plates splay outward from the hull"): the rear
  // skirt run and its fringe went on to z -3.55 and -3.62, past the track's rear wrap (-3.48) and 40 cm past the top
  // band (-3.15), so from behind their last stretch stood as bare 1 cm fins at the corners. The run, its fringe and
  // the band now end together at the track's rear (z -3.45).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.02, 0.24, 6.70), s * 1.845, 1.345, -0.10);             // skirt top band at the oracle's
                                                                               //   ±1.855 face; inner face 1.835
                                                                               //   clears the native shoe envelope
    P.add('hull', box(0.01, 1.04, 0.56), s * 1.855, 0.94, 3.00);               // deep bow panel (thin outer sheet;
    P.add('hull', box(0.01, 0.35, 0.26), s * 1.855, 1.075, 3.34);              //   inner face clears terminal shoes)
                                                                               //   (drops to the print tip line)
    P.add('hullDark', box(0.01, 0.90, 0.024), s * 1.855, 0.92, 2.73);          // bow panel seam
    P.add('hull', box(0.01, 0.66, 1.39), s * 1.855, 0.84, -2.755);             // source-painted rear skirt run;
                                                                               // only its flexible lower fringe is
                                                                               // dark rubber, not the whole panel
    for (let k = 0; k < 3; k++) P.add('hullDark', box(0.01, 0.56, 0.02), s * 1.855, 0.82, -2.32 - k * 0.52);
    P.add('hullRubber', box(0.01, 0.12, 1.39), s * 1.855, 0.50, -2.755);       // lower fringe
  }
  // Eight full-height FY-4 side cassettes per side.  The previous 3×11 field
  // rendered as a solid Minecraft wall and hid the characteristic six-wheel
  // cadence.  These remain real destructible ERA instances, but the larger
  // unequal panels open the lower wheel arcs and match the reference's broad
  // cassette rhythm.
  const skirtPanels = [
    [2.42, 0.62, 0.60], [1.80, 0.60, 0.58], [1.18, 0.61, 0.61],
    [0.55, 0.62, 0.59], [-0.08, 0.61, 0.62], [-0.71, 0.60, 0.57],
    [-1.33, 0.59, 0.60], [-1.94, 0.56, 0.55],
  ];
  P.eraCluster('skirt_era_R', (put: EraPlacement) => {
    for (const [z, depth, height] of skirtPanels)
      put(1.835, 0.91, z, 0, Math.PI / 2, 0, depth / 0.28, height / 0.13, 0.35);
  });
  P.eraCluster('skirt_era_L', (put: EraPlacement) => {
    for (const [z, depth, height] of skirtPanels)
      put(-1.835, 0.91, z, 0, -Math.PI / 2, 0, depth / 0.28, height / 0.13, 0.35);
  });
  // ---- GLACIS ERA — the DISTINCTIVE ARROW/CHEVRON FIELD on the 16.3-deg
  // plane (owner identity headline; §5.29 chevron-tip kinship: the two
  // half-fields angle toward a forward center tip). Dark mounting bed
  // first (t14 r5 lesson — tile gaps read as recessed seams). -------------
  const zOf = (y: number) => 2.02 + (1.50 - y) / 0.284 + 0.045;                // plane + 4.5 cm proud
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.42, 0.64, 0.02), s * 0.76, 1.33, zOf(1.33) - 0.035, -73.7 * D2R, 0, 0);
  }
  const chevron = (put: EraPlacement, s: number) => {
    // 4 rows x 4 cols per half-field; each column steps FORWARD toward the
    // center line (arrow point) and every tile carries the ±12-deg plan
    // skew — two panels meeting at a tip, not a flat course (§5.29 law)
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const y = 1.57 - r * 0.062;
      const zRow = zOf(y) - 0.012 * c;                                         // chevron sweep toward center
      put(s * (0.22 + c * 0.315), y, zRow + (3 - c) * 0.052, -73.7 * D2R, s * 12 * D2R, 0);
    }
  };
  P.eraCluster('glacis_era_R', (put: EraPlacement) => chevron(put, 1));
  P.eraCluster('glacis_era_L', (put: EraPlacement) => chevron(put, -1));
  // number plates on the skirt TOP BAND (face 1.84 + 5 mm = 1.845, INSIDE
  // the ±1.85 tile anchor — §D decal-float law: the tile faces own the
  // width; a proud decal would set the harness scale factor)
  P.decal('hull', 'number', num, 0.22, [1.845, 1.345, 1.60], Math.PI / 2);
  P.decal('hull', 'number', num, 0.22, [-1.845, 1.345, 1.60], -Math.PI / 2);
  P.topY = 1.40;
}

function buildType99ATurretArmorAndStowage(P: Modern2BuilderPort) {
  const { box, polyMultiLoft, smokeCluster, stowage, tarpRoll, ammoCan } = KIT;
  const slab = orientedSlab99;
  const { rng } = P;
  const D2R = Math.PI / 180;
  // ================= WELDED ANGULAR TURRET, PRINT-LOFTED (never the
  // russia dome): UNDERCUT single loft — narrow base ring (print ±1.17-1.2)
  // flaring to ±1.66 walls, roof plateau local 0.98 = world 2.40 (§B7 cap
  // vs the print's 2.48-2.56 band; dims p95 budget). Plan follows the
  // print wall outline: walls z_w +0.35..-1.28, wedge cheek line ±1.74 @
  // z_w 0.38 converging to the arrow nose. Coordinates TURRET-LOCAL
  // (pivot y 1.42 z 0.10). ================================================
  // Rebuilt from the oracle's component/station census rather than its mesh:
  // Object_31's connected armor body spans x +/-1.30, world y 1.44..2.55
  // and z -1.976..1.750.  The bypassed build had inflated that body to
  // +/-1.66 and shortened it fore/aft, producing the owner's broad square
  // turret complaint.  One authored variable-height loft now owns the exact
  // primary envelope; external smoke banks and bins may still reach the
  // wider +/-1.75 equipment envelope on their visible brackets.  Three
  // connected rings are essential here: a full-width load-bearing shoulder
  // turns through a real armor break into the smaller roof, so the measured
  // 1.11 m total station height does not become a 1.11 m vertical cabinet.
  const type99ShellPlan = [
    // The 99A2-family arrow is defined by long diagonal cheek chords, not a
    // broad rounded fan.  Pull the first shoulder inward, lengthen the nose
    // and move the outboard break aft so the front resolves as two decisive
    // armor planes while the gun channel stays open on the centreline.
    [0.00, 1.86], [0.34, 1.78], [0.78, 1.43], [1.14, 0.92],
    [1.30, 0.38], [1.30, -1.18], [1.12, -1.96],
    [-1.12, -1.96], [-1.30, -1.18], [-1.30, 0.38],
    [-1.14, 0.92], [-0.78, 1.43], [-0.34, 1.78],
  ];
  P.add('turret', polyMultiLoft(type99ShellPlan, [
    {
      height: [0.04, 0.04, 0.04, 0.05, 0.08, 0.16, 0.28, 0.28, 0.16, 0.08, 0.05, 0.04, 0.04],
      inset: 1,
    },
    {
      height: [0.58, 0.61, 0.67, 0.73, 0.78, 0.83, 0.87, 0.87, 0.83, 0.78, 0.73, 0.67, 0.61],
      inset: [0.98, 0.98, 0.985, 0.99, 0.995, 1.00, 1.00, 1.00, 1.00, 0.995, 0.99, 0.985, 0.98],
    },
    {
      height: [0.84, 0.86, 0.91, 0.97, 1.02, 1.05, 1.05, 1.05, 1.05, 1.02, 0.97, 0.91, 0.86],
      inset: [0.78, 0.79, 0.82, 0.85, 0.88, 0.90, 0.91, 0.91, 0.90, 0.88, 0.85, 0.82, 0.79],
    },
  ]));
  // TWO-COURSE WEDGE APPLIQUÉ, following the later 99A2 grammar.  The inner
  // course makes the sharp mantlet-adjacent arrow; the outer course carries
  // that rake continuously into the side belt.  Their lower noses project
  // well ahead of their roof edges, giving the complete front a real
  // rearward elevation slope instead of a vertical forward wall.  Both
  // overlap the welded shell so there is no daylight seam under the armor.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.30, 0.05, 1.70], [s * 0.86, 0.05, 1.16], [s * 0.78, 0.05, 0.70], [s * 0.28, 0.05, 1.16],
      [s * 0.28, 0.84, 1.42], [s * 0.72, 0.82, 0.98], [s * 0.66, 0.78, 0.52], [s * 0.26, 0.80, 0.90]));
    P.add('turret', slab(
      [s * 0.86, 0.05, 1.16], [s * 1.42, 0.06, 0.42], [s * 1.36, 0.05, -0.18], [s * 0.78, 0.05, 0.70],
      [s * 0.72, 0.82, 0.98], [s * 1.34, 0.78, 0.20], [s * 1.34, 0.74, -0.26], [s * 0.66, 0.78, 0.52]));
    P.add('turretDark', box(0.035, 0.56, 0.035), s * 0.79, 0.46, 1.13,
      -0.30, s * 0.70, 0);                                                     // course seam batten
    P.add('turretDetail', box(1.05, 0.024, 0.038), s * 0.82, 0.815, 0.64,
      0, s * 0.66, 0);                                                         // seated upper edge rail
  }
  P.add('turret', slab(                                                        // ARROW SEAM prism, R half —
    [0, 0.38, 1.70], [0.42, 0.38, 1.56], [0.42, 0.38, 0.82], [0, 0.38, 0.98],  // the two planes meet at the tip
    [0, 0.84, 1.42], [0.42, 0.84, 1.32], [0.42, 0.80, 0.58], [0, 0.80, 0.78]));
  P.add('turret', slab(                                                        // ARROW SEAM prism, L half
    [-0.42, 0.38, 1.56], [0, 0.38, 1.70], [0, 0.38, 0.98], [-0.42, 0.38, 0.82],
    [-0.42, 0.84, 1.32], [0, 0.84, 1.42], [0, 0.80, 0.78], [-0.42, 0.80, 0.58]));
  P.add('turretDark', box(0.05, 0.54, 0.05), 0, 0.61, 1.56, -31 * D2R, 0, 0); // ridge seam follows the raked arrow
  for (const s of [-1, 1]) {                                                   // wedge top-edge catch-light strips
    P.add('turretDetail', box(0.96, 0.022, 0.035), s * 0.88, 0.805, 0.70, 0, s * 47 * D2R, 0);
  }
  P.add('turretDark', box(0.50, 0.34, 0.06), 0, 0.20, 0.70);                   // gun-slot dark recess wall under
                                                                               //   the boot (print slot z_w ~0.8)
  P.add('turret', slab(                                                        // sagging canvas boot SKIRT — the
    [-0.25, 0.10, 0.78], [0.25, 0.10, 0.78], [0.25, 0.16, 1.42], [-0.25, 0.16, 1.42], // print mantlet drops to
    [-0.27, 0.40, 0.78], [0.27, 0.40, 0.78], [0.27, 0.32, 1.42], [-0.27, 0.32, 1.42])); // y 1.49 (Object_7 floor)
  for (const s of [-1, 1]) {                                                   // long wiper arms over the
    P.add('turretDetail', box(0.03, 0.035, 0.85), s * 0.60, 0.62, 1.18, -0.06, s * 0.05, 0); // mantlet flanks (ref plan
    P.add('turretDetail', box(0.028, 0.032, 0.70), s * 0.88, 0.58, 0.90, -0.06, s * 0.08, 0); // front ~z 2.0 @ x .5-1.1)
  }
  for (const s of [-1, 1]) {                                                   // cheek-face sight-wiper rails
    P.add('turretDetail', box(0.035, 0.05, 0.42), s * 1.12, 0.72, 0.52, -0.10, s * 0.44, 0); // (print Object_10/23:
    P.add('turretDetail', box(0.03, 0.04, 0.30), s * 1.28, 0.60, 0.36, -0.10, s * 0.44, 0);  // rails to z_w 1.25 at
  }                                                                            //   x 1.0..1.4 on the wedges)
  // CHEEK ERA arrays ON the new deeply swept face planes.  Roots stay
  // buried in the authored cheek; only the replaceable bricks stand proud.
  // turretLocal put() coords are WORLD rest-pose (t90Cheek convention —
  // seatEraBricks subtracts the pivot itself; the r1/candidate-r1 bricks
  // passed turret-local and hung 1.42 BELOW the cheeks, gate-measured).
  const cheekEra = (put: EraPlacement, s: number) => {
    for (const v of [0.30, 0.68]) for (let c = 0; c < 4; c++) {
      const u = 0.10 + c * 0.185;
      put(s * (0.42 + 0.94 * u + 0.72 * 0.04), 1.47 + 0.87 * v + 0.10 * 0.04,
        1.66 - 1.01 * u - 0.26 * v + 0.69 * 0.04, -0.10, s * 0.78, 0);
    }
  };
  P.eraCluster('turret_era_R', (put: EraPlacement) => cheekEra(put, 1), true);
  P.eraCluster('turret_era_L', (put: EraPlacement) => cheekEra(put, -1), true);
  // SMOKE BANKS on the cheek outer thirds (print Object_4: the full-width
  // band at z_w 0.33..0.48, y 1.81..2.28 — two 5-tube rows per side)
  for (const s of [-1, 1]) {
    smokeCluster(P, s * 1.34, 0.62, 0.42, 5, s * 0.46, 0.55);
    smokeCluster(P, s * 1.29, 0.42, 0.47, 5, s * 0.46, 0.55);
  }
  // ANGLED SIDE SERVICE MODULES + CAGE.  The old cuboids were thin vertical
  // slabs parked at x=±1.68 beside the swept wall.  These panniers begin
  // inside the welded side belt, flare to the service envelope and carry
  // explicit cross-brackets; the cage rails therefore have a visible load
  // path into the turret and remain convincing at non-zero yaw.
  for (const s of [-1, 1]) {
    P.addEquipment('turret', slab(
      [s * 1.24, 0.24, -0.52], [s * 1.30, 0.24, -1.38], [s * 1.30, 0.62, -1.38], [s * 1.24, 0.62, -0.52],
      [s * 1.64, 0.25, -0.58], [s * 1.67, 0.25, -1.34], [s * 1.67, 0.58, -1.34], [s * 1.64, 0.64, -0.58]));
    P.addEquipment('turret', slab(
      [s * 1.26, 0.24, -1.42], [s * 1.18, 0.27, -2.12], [s * 1.18, 0.57, -2.12], [s * 1.26, 0.60, -1.42],
      [s * 1.67, 0.25, -1.46], [s * 1.63, 0.28, -2.08], [s * 1.63, 0.55, -2.08], [s * 1.67, 0.58, -1.46]));
    for (const z of [-0.66, -1.30, -1.52, -2.02]) {
      P.add('turretDetail', box(0.42, 0.065, 0.065), s * 1.47, 0.31, z,
        0, s * 0.04, 0);                                                       // pannier-to-wall bracket
    }
    P.add('turretDark', box(0.075, 0.026, 0.72), s * 1.675, 0.64, -0.96, 0, s * 0.04, 0);
    P.add('turretDark', box(0.075, 0.026, 0.58), s * 1.655, 0.59, -1.78, 0, s * 0.04, 0);
    for (const y of [0.72, 0.82]) {
      P.add('turretDetail', box(0.035, 0.035, 1.52), s * 1.70, y, -1.19, 0, s * 0.035, 0);
    }
    for (const z of [-0.52, -1.18, -1.90]) {
      P.add('turretDetail', box(0.34, 0.035, 0.035), s * 1.53, 0.77, z,
        0, s * 0.035, 0);                                                      // cage standoff into shell
    }
  }
  // ---- BUSTLE + BASKET (print: turret bottom rises aft of z_w -1.1; the
  // bustle band y_w 2.0..2.5 runs to -2.1, basket frame to -2.42) ----------
  P.add('turret', box(3.16, 0.38, 0.82), 0, 0.72, -1.81);                      // shallow autoloader body ±1.58;
                                                                               // the source rear course falls
                                                                               // below the fighting-compartment
                                                                               // roof instead of continuing it
                                                                               //   bustle band runs near-full
                                                                               //   width), y_l 0.54..1.05,
                                                                               //   z -1.40..-2.22 (rear extended:
                                                                               //   st02 top read the thin rails)
  P.add('turretDark', box(3.06, 0.02, 0.74), 0, 0.925, -1.81);                 // bustle lid seam
  // basket: rails + posts + mesh floor line wrapping the rear (real open
  // structure — §B2 authored-open class)
  P.add('turretDetail', box(3.00, 0.045, 0.045), 0, 1.05, -2.31);              // high open top rail over the
                                                                               // deliberately lower solid body
  P.add('turretDetail', box(3.00, 0.045, 0.045), 0, 0.56, -2.31);              // floor rail
  for (let k = 0; k < 11; k++) P.add('turretDetail', box(0.028, 0.39, 0.028), -1.40 + k * 0.28, 0.755, -2.31);
  // Recess the bustle face behind an actual service grille.  A camouflage-
  // coloured fill here used to read as one blank rear wall even though the
  // outer basket was supported; the dark inset and crossed slats preserve a
  // backed load path while exposing the Type 99's full-width mechanical
  // cadence.
  P.add('turretDark', box(2.88, 0.34, 0.030), 0, 0.73, -2.325);
  for (let k = 0; k < 7; k++) {
    P.add('turretDetail', box(2.92, 0.026, 0.028), 0, 0.56 + k * 0.060, -2.345);
  }
  for (let k = 0; k < 11; k++) {
    P.add('turretDetail', box(0.026, 0.34, 0.028), -1.40 + k * 0.28, 0.73, -2.345);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.045, 0.045, 0.30), s * 1.49, 1.05, -2.18);     // side rail returns
    P.add('turretDetail', box(0.045, 0.045, 0.30), s * 1.49, 0.56, -2.18);
  }
  P.add('turretCloth', box(2.60, 0.25, 0.26), 0, 0.73, -2.22);                 // stowage row filling the basket
                                                                               //   (top 2.39 w — carries the st02
                                                                               //   station top vs the print's
                                                                               //   2.55 rear wall)
  stowage(P, 'turretCloth', rng, [[-0.85, 0.93, -1.72, 0.55, 0.16, 0.55], [0.55, 0.93, -1.78, 0.60, 0.15, 0.50]]);
  tarpRoll(P, 'turretCloth', -0.30, 0.93, -1.45, 1.30, 0.085, true);
  ammoCan(P, 'turretDark', 1.15, 0.92, -1.55, -0.15);
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.50, seed: 13 });
    links.position.set(-1.05, 0.92, -1.60);                                    // bustle lid left
    P.turretG.add(links);
  }
}

function buildType99ATurretRoofAndGun(P: Modern2BuilderPort) {
  const { box, frustum, cylY, cylZ, torus, buildGun } = KIT;
  const num = P.spec.visual.number || '';
  // ---- ROOF CLUSTER (print positions; §B7 height caps — the <5%-of-body-
  // columns p95 budget lives in the tower's 0.36 m z-band):
  // TALL GUNNER SIGHT TOWER right-of-center-rear (print Object_30 x
  // 0.71..1.20, z_w -0.51..-1.02, top 3.14 -> proc 2.78 cap) ---------------
  // The broad combat station, rather than the thin whip antennas, defines the
  // measured 3.16 m height datum. Keep its depth and visible roof load path.
  // Reference station footprint: x .706..1.205 and z -.514..-1.016 in the
  // authored frame. The previous narrow -.92-centred stack sat 18 cm too
  // far aft and read like an unrelated mast in side view.
  P.add('turret', box(0.48, 0.20, 0.50), 0.955, 1.14, -0.765);                 // tower base plinth
                                                                               //   -0.56: the ref tower's station
                                                                               //   fraction — st06 alignment)
  P.add('turret', box(0.44, 0.26, 0.46), 0.955, 1.35, -0.765);                 // tower body (top local 1.40)
  P.add('turretDark', box(0.34, 0.10, 0.045), 0.955, 1.38, -0.515);            // aperture hood
  P.add('turretGlass', box(0.26, 0.06, 0.014), 0.955, 1.375, -0.49);           // glass slit
  P.add('turretDetail', box(0.48, 0.035, 0.50), 0.955, 1.495, -0.765);         // cap plate (top 2.855 w — §B7
                                                                               //   vs the print tower 3.14)
  P.add('turretDark', box(0.02, 0.24, 0.46), 0.955, 1.35, -0.765);             // door split seam
  // The reference carries a narrow stabilized sensor above the broad sight
  // body.  Earlier revisions stopped at the cabinet lid and lost this
  // decisive side/top cadence; keep the load path broad below, then taper to
  // the slim head rather than turning the whole station into a tall box.
  // Isolated reference bounds place this stabilized head at world
  // y=2.475..3.140.  The former authored mast reached about 3.70 m and
  // turned the sensor into a second antenna-sized tower.  Retain the broad
  // body below, but cap the actual optical head at the measured height.
  P.add('turretDetail', frustum(0.10, -0.54, -1.00, 0.075, -0.56, -0.98, 1.51, 1.74), 0.955, 0, 0);
  P.add('turretDark', box(0.15, 0.12, 0.026), 0.955, 1.63, -0.525);
  P.add('turretGlass', box(0.105, 0.08, 0.014), 0.955, 1.63, -0.510);
  P.add('turretDetail', box(0.22, 0.030, 0.50), 0.955, 1.755, -0.765);
  // Secondary stabilized panoramic course.  The oracle's connected roof
  // inventory carries this station at x≈-0.72/z≈-1.18 to world y=3.49.
  // Build it as a broad seated lower drum, a slim telescoping neck, and a
  // compact head; the old short generic puck lost a defining front/roof
  // cadence even though it was technically attached.
  P.add('turretDetail', cylY(0.075, 0.09, 0.18, 12), -0.72, 1.14, -1.18);      // pedestal
  P.add('turretDark', cylY(0.13, 0.13, 0.20, 12), -0.72, 1.32, -1.18);         // lower head drum
  P.add('turretGlass', box(0.13, 0.075, 0.02), -0.72, 1.34, -1.055);           // forward window
  P.add('turretDetail', cylY(0.018, 0.022, 0.52, 10), -0.72, 1.70, -1.18);     // stabilized neck
  P.add('turretDark', box(0.06, 0.12, 0.08), -0.72, 2.00, -1.18);             // compact sensor head
  P.add('turretDetail', box(0.040, 0.020, 0.010), -0.72, 2.00, -1.137);        // subdued aperture slit
  // JD-3 LASER DAZZLER pod on the LEFT CHEEK SHOULDER (2.30 plane — keeps
  // its drum under the 2.46 p95 line; window fires forward over the wedge)
  P.add('turretDetail', cylY(0.10, 0.11, 0.11, 12), -1.05, 0.945, 0.30);       // drum (top 2.42 w)
  P.add('turretDark', box(0.14, 0.09, 0.04), -1.05, 0.965, 0.395);             // emitter window (+z facing)
  P.add('turretGlass', box(0.10, 0.055, 0.014), -1.05, 0.965, 0.418);
  // gunner PRIMARY SIGHT housing over the mantlet (print Object_13: center
  // head to 2.51 -> proc 2.46 cap; §B2: housing bridges roof -> overhang)
  P.add('turret', box(0.30, 0.24, 0.85), 0, 0.955, 1.06);                      // armored conduit off the roof edge
  P.addEquipment('turret', box(0.28, 0.17, 0.32), 0, 0.995, 1.42);                       // sight head (top 2.425 w — the
                                                                               //   p95 furniture ceiling)
  P.add('turretDark', box(0.22, 0.09, 0.03), 0, 1.005, 1.585);                  // aperture
  P.add('turretGlass', box(0.16, 0.055, 0.014), 0, 1.0, 1.605);              // glass
  P.add('turretDark', box(0.30, 0.02, 0.87), 0, 1.085, 1.06);                    // hood seam (2.42 w)
  // hatches: commander RIGHT (forward of the tower), gunner LEFT — rims
  // held at the 2.425 p95 furniture ceiling
  P.add('turret', cylY(0.24, 0.24, 0.045, 16), 0.52, 1.068, -0.44);
  P.add('turretDark', torus(0.24, 0.012, 16), 0.52, 1.085, -0.44);
  P.add('turret', cylY(0.21, 0.21, 0.04, 14), -0.50, 1.065, -0.50);
  P.add('turretDark', torus(0.21, 0.012, 14), -0.50, 1.082, -0.50);
  // Wind sensor + whip antennas. The connected secondary station is carried
  // to the oracle's 3.49 m P95 envelope; its very thin probe/whips may extend
  // above that without turning those line features into the height anchor.
  P.add('turretDetail', box(0.14, 0.12, 0.18), 0.66, 1.11, -0.99);             // broad sensor base
  P.add('turretDetail', cylY(0.014, 0.018, 0.78, 8), 0.66, 1.56, -0.99);       // measured telescoping mast
  P.add('turretDark', box(0.065, 0.12, 0.10), 0.66, 2.02, -0.99);              // sensor head
  P.add('turretDetail', box(0.045, 0.020, 0.010), 0.66, 2.02, -0.937);         // subdued aperture slit
  P.add('turretDetail', cylY(0.012, 0.014, 0.22, 8), 0.66, 2.22, -0.99);       // top probe to world 3.73
  {
    const awR = FITTINGS.antennaWhip({ mats: P.mats, h: 1.74, rake: 0.025, seed: 6 });
    // Browser-space remeasurement after the reference root is scaled to the
    // authored 3.70 m width puts both whip collars near z=-0.70, not -1.10.
    // Keeping them at the latter station made the tall source/procedural
    // columns trade places in pure side view even though the roof plan was
    // otherwise correct.
    awR.position.set(1.10, 1.07, -0.70);
    P.turretG.add(awR);                                                        //   tower band; tops ~2.9 w
    const awL = FITTINGS.antennaWhip({ mats: P.mats, h: 1.24, rake: -0.025, seed: 7 });
    awL.position.set(-1.06, 1.07, -0.72);
    P.turretG.add(awL);
    // QJC-88 12.7 at the COMMANDER station, FORWARD (owner MG law §5.38;
    // NSVT-class silhouette — §H.4 national grammar).  Its enlarged foot is
    // carried just ahead of the hatch while the aft spade grips overlap the
    // cupola rim, so a standing commander can actually reach the weapon.
    P.add('turretDetail', box(0.20, 0.035, 0.22), 0.52, 1.097, -0.22);
    // 2026-10-08 (round 5; wave 255: "a long barrel on a plain block receiver with no ammunition box, belt or feed";
    // the coordinator: the right gun per nation): the QJC-88's own construction at true scale, its 50-round box and
    // belt on the left.
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'qjc88', tone: 'dark', scale: 1.0, ammo: true,
      elev: 0.02, rotation: [0, 0, 0], seed: 18,
    });
    mg.position.set(0.52, 1.11, -0.17);
    P.turretG.add(mg);
  }
  // rear roof rail rack between the masts (print band capped to the roof
  // furniture line — §B7); rails SEATED on the plateau (floater law)
  P.add('turretDetail', box(2.10, 0.045, 0.045), 0, 1.082, -1.50);
  P.add('turretDetail', box(2.10, 0.045, 0.045), 0, 1.082, -1.30);
  P.decal('turret', 'number', num, 0.30, [1.675, 0.42, -0.55], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', num, 0.30, [-1.675, 0.42, -0.55], -Math.PI / 2, 0, -0.05);
  // ---- 125 mm ZPT-98 (§B3.1 round carriers only): tall RUSSIAN-STYLE
  // BOOT at the measured trunnion (y 1.94 — print gun axis y 1.78..2.09),
  // sleeve + mid-tube evacuator + top cable conduit via buildGun; print
  // mantlet shroud z_w 1.05..1.85 x ±0.28. The final authored bore face is
  // z=7.414 in world space. Gun-local z starts at pivot w(0,1.94,0.68).
  P.addGunExtra(box(0.64, 0.54, 0.42), 0, 0, 0.54);
  P.addGunExtra(cylZ(0.24, 0.30, P.q ? 20 : 14, 0.21), 0, 0, 0.86);
  P.addGunExtraDark(torus(0.215, 0.028, P.q ? 20 : 14), 0, 0, 1.02);
  buildGun(P, { len: 6.69, r: 0.108, sleeve: true, evac: 0.53, baseR: 0.18, evacR: 1.22 });
  // §B3.1 MUZZLE BORE: world face = turret pivot -.02 + gun pivot .70 +
  // local 6.734 = 7.414 m, paired with the supported -4.242 m rear loop.
  muzzleBore99(P, 6.734, 0.108, 0.060, 14);
  P.muzzleZ = 6.734;
}

function buildType99A(P: Modern2BuilderPort) {
  buildType99ABaseHull(P);
  buildType99AHullDeckAndArmor(P);

  // The VT-family Type 99A replacement deliberately reuses this complete,
  // certified hull, running gear and FY-4 field while supplying an entirely
  // new rotating assembly. Stop at the ring only after all hull-owned ERA,
  // decals and fittings have been authored so no old cheek, roof fitting,
  // direct-group weapon or turret-local ERA can survive under the replacement.
  if (P.__type99HullOnly) return;

  buildType99ATurretArmorAndStowage(P);
  buildType99ATurretRoofAndGun(P);
}

// Profile-facing hull-only route for the VT-derived Type 99A turret: the
// active profile retains this exact hull without inheriting its old rotating
// assembly.
export function buildType99AHullOnly(P: Modern2BuilderPort): void {
  P.__type99HullOnly = true;
  try {
    buildType99A(P);
  } finally {
    P.__type99HullOnly = false;
  }
}


// ---------------------------------------------------------------------------
// MBT-70 — owner-directed M1A1-chassis composition. The certified M1A1 hull
// loft and seven-wheel running gear form the base, without its side skirts;
// the source print supplies the low rounded turret-front language, 152 mm
// launcher, bustle and raised commander station. No source vertices or
// materials enter runtime.
// ---------------------------------------------------------------------------
function addMBT70UpperFenderReturns(P: Modern2BuilderPort): void {
  // Shallow fixed metal aprons, not the donor's full-depth side skirts.
  // The complete fold begins outboard of the native band (|x| <= 1.715),
  // including its roof lip. The lip laps the existing 1.725 m deck edge;
  // both ends enter the existing fenders, ahead of the stern drive stock.
  // These hull-local stations follow the retained deck, before its .94 Z
  // scale and -.14 m seat. No running-gear or suspension datum changes.
  const rows: readonly (readonly [number, number, number])[] = [
    [-2.62, 1.719, 1.716799], [-2.25, 1.719, 1.716],
    [-1.73, 1.719, 1.666], [-0.95, 1.719, 1.486],
    [1.30, 1.719, 1.486], [1.88, 1.719, 1.461],
    [1.95, 1.719, 1.516], [2.13, 1.719, 1.516],
    [2.27, 1.719, 1.406], [2.32, 1.719, 1.458],
    [2.46, 1.719, 1.454], [2.48, 1.719, 1.361],
    [2.60, 1.719, 1.360294],
  ];
  for (const side of [-1, 1]) {
    const geometry = foldedShoulderReturn({
      // Stand the exposed web 2 mm outside the old fender caps: the finite
      // end lap remains, without two visible faces on the same plane.
      outerX: 1.752, skirtTop: 1.137, offsetZ: 0, offsetY: 0, rows,
    }, side);
    geometry.userData.mbt70UpperFenderReturn = true;
    P.addMudguard(`mbt70_upper_fender_return_${side}`,
      side < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', geometry);
    // The donor's stern lane carve ends its wide deck at z=-2.50. A finite
    // inner riser supports the 120 mm roof tip on the existing rear fender,
    // rather than pretending that the narrow stern wedge reaches this lip.
    const mount = KIT.box(0.012, 0.071, 0.116);
    mount.userData.mbt70UpperFenderReturn = true;
    mount.userData.mbt70UpperFenderMount = true;
    P.addMudguard(`mbt70_upper_fender_mount_${side}`,
      side < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', mount,
      side * 1.726, 1.6705, -2.56);
  }
}

function buildMBT70BareHull(P: Modern2BuilderPort): void {
  const { box } = KIT;
  buildM1A1BareHull(P, {
    returnRollerZs: [1.46, 0, -1.46],
    returnTrackTopY: 1.06,
    returnRollerR: 0.11,
  });
  for (const side of [-1, 1]) {
    P.addMudguard(`mbt70_m1_front_fender_${side}`, 'hull',
      box(0.42, 0.09, 1.18), side * 1.54, 1.37, 3.10, -0.055, 0, 0);
    P.addMudguard(`mbt70_m1_rear_fender_${side}`, 'hull',
      box(0.42, 0.09, 1.32), side * 1.54, 1.64, -3.16, 0.035, 0, 0);
    P.add('hull', box(0.12, 0.48, 1.38), side * 0.96, 1.41, -3.05, 0.025 * side, 0, 0);
    P.add('hull', box(0.48, 0.10, 1.34), side * 1.31, 1.69, -3.05, 0.025 * side, 0, 0);
    P.add('hullDetail', box(0.035, 0.34, 1.18), side * 1.00, 1.43, -3.05,
      0.025 * side, 0, 0);
    for (const z of [-3.48, -3.05, -2.62]) {
      P.add('hullDetail', box(0.11, 0.035, 0.035), side * 1.20, 1.66, z);
    }
  }
  addMBT70UpperFenderReturns(P);
}

function buildMBT70(P: Modern2BuilderPort) {
  const {
    box, polyMultiLoft, cylY, cylZ, sph, torus,
    buildGun, liftEye, periscope,
    smokeCluster,
  } = KIT;
  const seg = P.q ? 24 : 14;

  // ---- certified M1A1 hull, intentionally without side skirts ------------
  buildMBT70BareHull(P);

  // ---- low cast turret with the source model's rounded front -------------
  const TH = 0.80;
  const TURRET_SEAT_Y_M = 1.49;
  const BUSTLE_FLOOR_RISE_M = 0.23;
  // Preserve the original sight crown while extending the housing downward
  // to the roof, so attachment does not reduce the certified height datum.
  const GUNNER_SIGHT_HEIGHT_M = 0.435;
  const GUNNER_SIGHT_BASE_Y_M = TH;
  const INSIGNIA_REAR_LOCAL_Z_M = -1.72;
  // The fitting's raised center rib shifts its rotated radial envelope by
  // 50 mm.  Seat the inner face at x=+/-1.60 m (the aft bustle cheek) rather
  // than placing the fitting origin on that face and burying the links inside
  // the turret shell.
  const SPARE_TRACK_MOUNT_X_M = 1.641;
  const SPARE_TRACK_MOUNT_Z_M = -2.44;
  const TURRET_HALF_WIDTH_M = 1.74;
  const TURRET_WIDTH_SCALE = TURRET_HALF_WIDTH_M / 1.45;
  const turretPlan = [
    [-1.34, -2.92], [-1.45, -1.48], [-1.45, -0.62], [-1.42, -0.20],
    // Dense near-circular bow stations replace the former long elliptical
    // convergence.  The wider central arc removes the pointed/oval read while
    // retaining a continuous cast front around the 152 mm launcher.
    [-1.42, 0.19], [-1.37, 0.56], [-1.24, 0.88], [-1.03, 1.20],
    [-0.75, 1.40], [-0.44, 1.54], [-0.15, 1.60], [0, 1.61],
    [0.15, 1.60], [0.44, 1.54], [0.75, 1.40], [1.03, 1.20],
    [1.24, 0.88], [1.37, 0.56], [1.42, 0.19], [1.42, -0.20],
    [1.45, -0.62], [1.45, -1.48], [1.34, -2.92],
  ].map(([x, z]) => [x * TURRET_WIDTH_SCALE, z]);
  const rearBiasedInset = (front: number, shoulder: number, rear: number) => (
    _point: readonly [number, number],
    i: number,
  ) => {
    const z = turretPlan[i][1];
    if (z < -1.30) return rear;
    if (z < -0.25) return shoulder;
    return front;
  };
  // The donor hull deck rises by roughly 0.22 m under the aft half of this
  // long bustle.  Keep the nose floor at the turret ring, then rake the
  // underside upward from the shoulder to the basket so it clears that deck
  // after the whole turret is lowered onto its real front seat.
  const turretFloorHeight = ([, z]: readonly [number, number]) => {
    if (z >= -0.55) return 0;
    const t = Math.min(1, (-z - 0.55) / (2.92 - 0.55));
    return BUSTLE_FLOOR_RISE_M * t;
  };
  P.add('turret', polyMultiLoft(turretPlan, [
    { height: turretFloorHeight, inset: 1.00 },
    // The raked aft floor reaches .23 m: carry the lower belt above it
    // instead of letting a constant .22 m ring cross through that floor.
    { height: (point: readonly [number, number]) => Math.max(0.22, turretFloorHeight(point) + 0.025),
      inset: rearBiasedInset(0.88, 0.96, 0.99) },
    { height: 0.52, inset: rearBiasedInset(0.70, 0.89, 0.95) },
    { height: TH, inset: rearBiasedInset(0.52, 0.84, 0.91) },
  ]));
  // The whole primary shell is one continuous loft. Closely spaced nose
  // stations retain the reference model's rounded plan, while contraction
  // from the very first station gives it a roughly 45-degree continuous
  // lower-edge-to-roof rake with no upright ring. Behind the shoulder, the shell stays broad,
  // long and flat-backed like the M1A1 turret instead of meeting a second
  // overlapping frustum. Rear-biased upper insets keep that bustle angular
  // and spacious while the front remains low and sleek.
  P.add('turretDark', box(3.06, 0.025, 1.88), 0, 0.69, -1.75);                  // bustle roof seam
  const autoloaderFloorY = turretFloorHeight([0, -2.64]);
  P.add('turret', box(3.20, 0.48, 0.72), 0, autoloaderFloorY + 0.24, -2.64);   // autoloader bustle, seated on raked floor
  P.add('turretDark', box(3.00, 0.025, 0.62), 0, autoloaderFloorY + 0.50, -2.64); // bustle lid seam
  // The owner's rear-quarter reference shows the MBT-70's characteristic
  // stepped bustle-roof cassette: three proud rectangular doors run aft
  // into the basket instead of leaving the Abrams-like rear roof bare.
  // They remain turret-owned, overlap the broad shell beneath, and step
  // down onto the lower autoloader bustle so no panel floats at full yaw.
  for (const [z, y, h] of [
    [-1.34, TH + 0.075, 0.15],
    [-1.82, TH + 0.055, 0.13],
    [-2.30, 0.66, 0.12],
  ]) {
    P.addEquipment('turret', box(0.78, h, 0.34), 0.42, y, z, -0.035, 0, 0);
    P.add('turretDark', box(0.68, 0.018, 0.025), 0.42, y + h * 0.52, z + 0.13, -0.035, 0, 0);
    for (const s of [-1, 1]) {
      P.add('turretDetail', box(0.035, 0.025, 0.11), 0.42 + s * 0.31, y + h * 0.52, z - 0.11, -0.035, 0, 0);
    }
  }
  // A low bustle grab rail frames the cassette without occupying the open
  // basket or colliding with the commander's station.
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.22, 0.035), 0.42 + s * 0.43, 0.79, -2.66);
  }
  P.add('turretDetail', box(0.90, 0.035, 0.035), 0.42, 0.90, -2.66);
  // Facet seams and lifting eyes make the broad armor read as assembled plate.
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.018, 0.50, 1.36), s * 1.39, 0.40, -0.62, 0, s * 0.08, 0);
    P.add('turretDetail', box(0.05, 0.05, 1.30), s * 1.72, 0.54, -1.10);
    liftEye(P, 'turretDetail', s * 1.12, TH + 0.02, -1.28);
  }
  // Roof hatches: structural cupolas are explicitly separated from fittings.
  P.addCupola('turret', cylY(0.32, 0.34, 0.12, seg), 0.62, TH + 0.06, -0.72);
  P.addCupola('turret', cylY(0.29, 0.31, 0.10, seg), -0.58, TH + 0.05, -0.60);
  P.addCupola('turret', torus(0.33, 0.025, seg), 0.62, TH + 0.13, -0.72);
  P.addCupola('turret', torus(0.30, 0.022, seg), -0.58, TH + 0.11, -0.60);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    P.addEquipment('turret', box(0.10, 0.08, 0.08),
      0.62 + Math.sin(a) * 0.30, TH + 0.17, -0.72 + Math.cos(a) * 0.30, 0, a, 0);
  }
  // Tall commander's station and source-shaped optical housings.
  P.addEquipment('turret', cylY(0.24, 0.27, 0.18, seg), 0.62, TH + 0.25, -0.72);
  P.addEquipment('turret', box(0.42, 0.28, 0.42), 0.62, TH + 0.46, -0.66);
  P.add('turretGlass', box(0.24, 0.13, 0.025), 0.62, TH + 0.48, -0.43);
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'm2', tone: 'dark', scale: 0.82, ammo: true,
      elev: 0.02, rotation: [0, 0, 0], seed: 70,
    });
    mg.position.set(0.62, TH + 0.61, -0.66);
    P.turretG.add(mg);
  }
  // Seat the gunner sight through a thin gasket directly on the roof.  Its
  // previous center left a visible 65 mm air gap beneath the marked housing.
  P.addEquipment('turretDark', box(0.30, 0.025, 0.30), -0.64,
    GUNNER_SIGHT_BASE_Y_M + 0.0125, 0.02);
  P.addEquipment('turret', box(0.34, GUNNER_SIGHT_HEIGHT_M, 0.34), -0.64,
    GUNNER_SIGHT_BASE_Y_M + GUNNER_SIGHT_HEIGHT_M * 0.5, 0.02);                // gunner sight
  P.add('turretGlass', box(0.22, 0.17, 0.025), -0.64,
    GUNNER_SIGHT_BASE_Y_M + GUNNER_SIGHT_HEIGHT_M * 0.54, 0.20);
  periscope(P, 'turretDetail', -0.58, TH + 0.16, -0.30);
  // Rear basket, smoke launchers, antennae and securely seated stowage.
  P.add('turretDetail', box(3.20, 0.05, 0.05), 0, 0.70, -3.06);
  P.add('turretDetail', box(3.20, 0.05, 0.05), 0, 0.19, -3.06);
  for (let k = 0; k < 13; k++) P.add('turretDetail', box(0.035, 0.50, 0.035), -1.50 + k * 0.25, 0.45, -3.06);
  for (const [side, seed] of [[-1, 73], [1, 74]]) {
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 1.26, d: 0.38, h: 0.28, rails: 3, fill: 0.95,
      seed, rotation: [0, Math.PI, 0],
    });
    rack.name = `mbt70_bustle_stowage_rack_${side < 0 ? 'left' : 'right'}`;
    rack.position.set(side * 0.68, 0.205, -2.84);
    P.turretG.add(rack);
  }
  const bustleCans = FITTINGS.jerryCans({
    mats: P.mats, count: 2, gap: 0.04, seed: 75,
  });
  bustleCans.name = 'mbt70_bustle_jerry_cans';
  bustleCans.position.set(-0.92, 0.215, -2.78);
  P.turretG.add(bustleCans);
  const bustleCable = FITTINGS.towCable({
    mats: P.mats, r: 0.018, eyes: false, seed: 76,
    pts: [[-1.18, 0.73, -2.40], [0, 0.77, -2.58], [1.18, 0.73, -2.40]],
  });
  bustleCable.name = 'mbt70_bustle_tow_cable';
  P.turretG.add(bustleCable);
  // Low service cases and positive latches occupy the previously bare left
  // bustle roof without competing with the commander's station.
  P.addEquipment('turret', box(0.48, 0.11, 0.34), -0.82, TH + 0.055, -1.72, -0.035, 0, 0);
  P.addEquipment('turret', box(0.38, 0.10, 0.30), -0.94, 0.70, -2.18, -0.035, 0, 0);
  for (const x of [-1.00, -0.66]) {
    P.addEquipment('turretDark', box(0.055, 0.035, 0.11), x, TH + 0.1225, -1.72);
  }
  P.addEquipment('turretDark', box(0.055, 0.035, 0.11), -0.94, 0.7675, -2.18);
  smokeCluster(P, 1.26, 0.55, -0.62, 4, 1.18, 0.70);
  smokeCluster(P, -1.26, 0.55, -0.62, 4, -1.18, 0.70);
  // The MBT-70's signature paired smoke canisters sit proud of the turret
  // flanks.  Give each its own seated cradle and large capped cylinder so the
  // pair remains legible instead of disappearing into the smaller tube banks.
  for (const side of [-1, 1]) {
    const yaw = side * 0.58;
    P.addEquipment('turretDetail', box(0.20, 0.15, 0.30), side * 1.31, 0.34, 0.05, 0, yaw, 0);
    P.addEquipment('turretDetail', cylZ(0.105, 0.42, 12), side * 1.36, 0.51, 0.10, -0.48, yaw, 0);
    P.add('turretDark', torus(0.106, 0.018, 12), side * 1.36, 0.51, 0.10, -0.48, yaw, 0);
  }

  // Modernized applique: compact structural ERA cassettes follow the cast
  // cheeks, while the donor glacis receives a shallow two-row array.  Their
  // centers stay inside the certified 3.51 m width envelope and remain real
  // armor rather than decoration-only hitbox inflation.
  const turretEraStations = [
    { x: 1.42, y: 0.34, z: -0.08, yaw: 0.08 },
    { x: 1.37, y: 0.34, z: 0.34, yaw: 0.18 },
    { x: 1.22, y: 0.34, z: 0.76, yaw: 0.34 },
  ];
  for (const side of [-1, 1]) {
    for (const station of turretEraStations) {
      P.add('turret', box(0.20, 0.24, 0.34), side * station.x, station.y, station.z,
        -0.10, side * station.yaw, side * 0.08);
      P.add('turretDetail', box(0.15, 0.025, 0.26), side * (station.x + 0.035),
        station.y + 0.02, station.z, -0.10, side * station.yaw, side * 0.08);
    }
  }
  const hullEraStations = [
    [-0.82, 1.405, 2.86], [-0.29, 1.405, 2.86], [0.29, 1.405, 2.86], [0.82, 1.405, 2.86],
    [-0.78, 1.505, 2.38], [-0.26, 1.505, 2.38], [0.26, 1.505, 2.38], [0.78, 1.505, 2.38],
  ];
  for (const [x, y, z] of hullEraStations) {
    P.add('hull', box(0.44, 0.09, 0.34), x, y, z, -0.035, 0, 0);
    P.add('hullDetail', box(0.34, 0.018, 0.025), x, y + 0.052, z + 0.12, -0.035, 0, 0);
  }

  // Additional service kit is turret-owned but non-structural: paired side
  // lockers, roof electronics, cable raceways and spare-link carriers add the
  // requested worked-up vehicle detail without expanding armor volumes.
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.24, 0.18, 0.38), side * 1.47, 0.49, -1.25, 0, side * 0.05, 0);
    P.addEquipment('turret', box(0.22, 0.16, 0.34), side * 1.44, 0.52, -1.72, 0, side * 0.04, 0);
    P.addEquipment('turretDetail', box(0.055, 0.055, 0.64), side * 1.18, TH + 0.04, -1.52);
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 4, width: 0.46, pitch: 0.165, seed: 77 + side,
      rotation: [0, 0, -side * Math.PI / 2],
    });
    links.name = `mbt70_bustle_spare_links_${side < 0 ? 'left' : 'right'}`;
    links.position.set(side * SPARE_TRACK_MOUNT_X_M, 0.47, SPARE_TRACK_MOUNT_Z_M);
    P.turretG.add(links);
  }
  P.addEquipment('turret', box(0.28, 0.20, 0.32), -1.02, TH + 0.12, -0.88);
  P.add('turretGlass', box(0.17, 0.10, 0.02), -1.02, TH + 0.15, -0.705);
  P.addEquipment('turretDetail', box(0.74, 0.035, 0.06), 0, TH + 0.04, -1.24);
  {
    const leftWhip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.78, rake: -0.04, seed: 71 });
    leftWhip.position.set(-0.94, 0.70, -1.34);
    P.turretG.add(leftWhip);
    const rightWhip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.92, rake: 0.04, seed: 72 });
    rightWhip.position.set(0.94, 0.70, -1.34);
    P.turretG.add(rightWhip);
  }

  // ---- 152 mm XM150 gun/launcher ------------------------------------------
  // Signature cast gun shield. This is deliberately NOT a circular disc:
  // thirteen plan stations make a rounded arrow/parabola that is broad at
  // the turret face and advances progressively toward the launcher axis.
  // Five vertical rings swell through the middle, then contract into the
  // crown/chin, producing the MBT-70's bulbous semi-cylindrical contour.
  // Its rear course reaches behind the shell nose, so pitch reveals a real
  // trunnion intersection rather than a plate floating ahead of the cheeks.
  const MANTLET_FORE_AFT_SCALE = 0.84;
  const mantletPlan = [
    [-0.72, -0.30], [-0.70, 0.05], [-0.63, 0.36], [-0.50, 0.64],
    [-0.32, 0.86], [-0.12, 1.00], [0, 1.04], [0.12, 1.00],
    [0.32, 0.86], [0.50, 0.64], [0.63, 0.36], [0.70, 0.05],
    [0.72, -0.30],
  ].map(([x, z]) => [x, -0.30 + (z + 0.30) * MANTLET_FORE_AFT_SCALE]);
  const MANTLET_NATIVE_HEIGHT_M = 1.44;
  const MANTLET_HEIGHT_M = TH;
  const MANTLET_VERTICAL_SCALE = MANTLET_HEIGHT_M / MANTLET_NATIVE_HEIGHT_M;
  // The launcher axis sits 3 cm below the middle of the 0.80 m turret shell.
  // Re-centre the cast shield on that shell so its chin begins at the turret
  // base and its crown terminates at the roof instead of rising above it.
  const MANTLET_VERTICAL_OFFSET_M = TH * 0.5 - P.spec.armor.gunPivot[1];
  // The compound shield was previously authored in its native horizontal
  // frame: 1.44 m wide but only .66 m tall. Rotate that exact curved mass
  // around the launcher axis so the rounded arrow stands vertically, as on
  // the MBT-70, then clamp its vertical extent to the turret shell without
  // changing its fore-aft trunnion penetration or compact launcher width.
  P.addGunExtra(scaledGeometryTransform(polyMultiLoft(mantletPlan, [
    { height: -0.33, inset: 0.70 },
    { height: -0.19, inset: 0.90 },
    { height: 0.00, inset: 1.00 },
    { height: 0.19, inset: 0.91 },
    { height: 0.33, inset: 0.70 },
  ]), 0, 0, 0, 0, 0, Math.PI / 2, [MANTLET_VERTICAL_SCALE, 1, 1]),
  0, MANTLET_VERTICAL_OFFSET_M, 0.08);
  // A shallow cast brow melts the shield into the turret roof. The oval
  // recess follows the parabolic shield, while the only truly circular part
  // is the compact 152 mm launcher throat itself.
  P.addGunExtra(scaledGeometryTransform(sph(0.28, seg, Math.PI * 0.62), 0, 0, 0, 0, 0, 0,
    [0.68, 1.10, 1.10]), 0, 0.11, 0.43);
  const GUN_ROOT_RECESS_RADIUS_M = 0.19;
  const GUN_ROOT_RECESS_SCALE: GeometryScale = [0.82, 1.14, 1];
  P.addGunExtraDark(scaledGeometryTransform(cylZ(GUN_ROOT_RECESS_RADIUS_M, 0.045, seg), 0, 0, 0, 0, 0, 0,
    GUN_ROOT_RECESS_SCALE), 0, 0, 0.94);
  // The wide rear end seats against the throat ring; taper toward the muzzle.
  P.addGunExtra(cylZ(0.17, 0.25, seg, 0.22), 0, 0, 1.19);
  P.addGunExtraDark(cylZ(0.225, 0.035, seg), 0, 0, 1.085);
  buildGun(P, {
    len: 3.88, r: 0.098, sleeve: true, evac: 0.50,
    baseR: 0.19, evacR: 1.24, collar: true,
  });
  // Near-muzzle reference/sensor assembly: a clamp ring supports the small
  // housing instead of leaving another box suspended above the tube.
  const muzzleReferenceSupportRadiusM = 0.128;
  const muzzleReferenceEmbedM = 0.010;
  const muzzleReferenceHeightM = 0.14;
  const muzzleReferenceCenterY = muzzleReferenceSupportRadiusM
    + muzzleReferenceHeightM / 2 - muzzleReferenceEmbedM;
  P.addGunExtraDark(cylZ(muzzleReferenceSupportRadiusM, 0.075, seg), 0, 0, 3.38);
  P.addGunExtra(box(0.18, muzzleReferenceHeightM, 0.28), 0, muzzleReferenceCenterY, 3.38);
  P.addGunExtraDark(box(0.10, 0.065, 0.025), 0, muzzleReferenceCenterY, 3.525);
  muzzleBore(P, { len: 3.88, r: 0.098 });

  P.gunG.userData.muzzleReferenceSeatReceipt = Object.freeze({
    designFamily: 'cot-top-mounted-gun-fixture-v1',
    owner: 'rig_gun',
    alignment: 'barrel-top-centerline',
    bodyBucket: 'gunMount',
    faceBucket: 'gunMountDark',
    centerX: 0,
    centerY: muzzleReferenceCenterY,
    stationZ: 3.38,
    supportRadiusM: muzzleReferenceSupportRadiusM,
    undersideY: muzzleReferenceCenterY - muzzleReferenceHeightM / 2,
    supportEmbedM: muzzleReferenceEmbedM,
  });

  P.gunG.userData.mbt70MantletReceipt = {
    profile: 'parabolic-arrow',
    circularMainShield: false,
    orientation: 'vertical',
    widthM: 0.66,
    heightM: MANTLET_HEIGHT_M,
    turretHeightM: TH,
    verticalCenterOffsetM: MANTLET_VERTICAL_OFFSET_M,
    depthM: 1.34 * MANTLET_FORE_AFT_SCALE,
    rearOverlapM: 0.30,
    foreAftScale: MANTLET_FORE_AFT_SCALE,
    rootRecessWidthM: GUN_ROOT_RECESS_RADIUS_M * GUN_ROOT_RECESS_SCALE[0] * 2,
    rootRecessHeightM: GUN_ROOT_RECESS_RADIUS_M * GUN_ROOT_RECESS_SCALE[1] * 2,
    ringCount: 5,
    planStations: mantletPlan.length,
    xm150Sleeve: true,
    nearMuzzleSensor: true,
  };
  P.turretG.userData.mbt70TurretReceipt = {
    forwardOffsetM: P.spec.armor.turretPivot[2],
    structuralWidthM: TURRET_HALF_WIDTH_M * 2,
    hullWidthM: P.spec.dims.widthM,
    seatYM: TURRET_SEAT_Y_M,
    bustleFloorRiseM: BUSTLE_FLOOR_RISE_M,
    bustleFloorFrontM: turretFloorHeight([0, 0.20]),
    bustleFloorRearM: turretFloorHeight([0, -2.92]),
    abramsLikeBustle: true,
    rearQuarterArmorRetained: true,
    rearQuarterClosurePanels: 4,
    turretEraPanels: turretEraStations.length * 2,
    hullEraPanels: hullEraStations.length,
    roofSightBaseYM: GUNNER_SIGHT_BASE_Y_M,
    roofSightGapM: 0,
    spareTrackLinkRacks: 2,
    spareTrackLinksPerRack: 4,
    spareTrackMountXM: SPARE_TRACK_MOUNT_X_M,
    spareTrackMountZM: SPARE_TRACK_MOUNT_Z_M,
    bustleStowageRacks: 2,
    bustleJerryCanCount: 2,
    bustleTowCable: true,
    insigniaRearLocalZM: INSIGNIA_REAR_LOCAL_Z_M,
    addedEquipmentPieces: 24,
  };

  // The running gear above is the exact M1A1 seven-wheel assembly supplied
  // by buildM1A1BareHull; do not layer a second MBT-70 track loop over it.
  P.decal('turret', 'crossgrey', null, 0.31, [1.59, 0.44, INSIGNIA_REAR_LOCAL_Z_M], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.31, [-1.59, 0.44, INSIGNIA_REAR_LOCAL_Z_M], -Math.PI / 2);
  P.decal('hull', 'number', '70', 0.28, [1.70, 1.20, 1.82], Math.PI / 2);
  // Preserve the certified Abrams hull construction while shortening its
  // longitudinal stations to the MBT-70 wheelbase.  Re-seat that shortened
  // donor 14 cm aft beneath the already-forward turret; the anatomy receipt
  // records this hull-local offset so the simulation volumes follow it.
  P.hullG.scale.z = 0.94;
  P.hullG.position.z = -0.14;
  P.topY = TH + 0.84;
}

/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const MODERN2_BUILDERS = {
  mbt70: buildMBT70,
  t14: buildObject148Prototype,
};
