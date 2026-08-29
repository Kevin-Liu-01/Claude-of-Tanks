// src/vehicles/modern2.js — HD procedural builders + specs for the modern
// roster expansion, wave 2 (docs/research/modern-roster.md):
//   leo2a4  Leopard 2A4        (§9,  priority 3)
//   t80u    T-80U              (§15, priority 3)
//   leclerc Leclerc S2         (§20, priority 3)
//   type99a Type 99A / ZTZ-99A (§22, priority 3)
//   leo1a5  Leopard 1A5        (§10, priority 4)
//   t14     T-14 Armata        (§16, priority 4)
//
// Registration pattern (established by modern1.ts): tankFactory.ts passes
// MODERN2_BUILDERS through the checked factory-configuration gate; builders
// draw on tankFactoryCore's exported geometry KIT. Specs/model-source rows
// register here by mutating the exported specs.ts tables (specs.ts itself is
// a contested file, left untouched). Armor values are open-source RHAe
// estimates per the roster doc (game-design baselines).

import * as THREE from 'three';
import { KIT } from './tankFactoryCore.js';
// §I fittings census: the FITTINGS import is the spelling that survives
// synchronous top-level createTank rigs.
import { FITTINGS, muzzleBore } from './profiles/kit.js';
import { buildM1A1BareHull } from './profiles/abrams.js';
import { createType99Armor } from './profiles/type99Armor.ts';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
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

// type99a RE-LISTED 2026-08-08 (§5.38 owner priority wave: "fully model a
// custom type99a based on this model" — the Type 99A2 print drop VOIDS the
// 2026-08-06 "no GLB" delist reason). The print is a LOCAL-ONLY measurement
// oracle (community-candidates quarantine, registered in the three harness
// maps + vertex REG); the playable stays procedural (buildType99A below).
const MODERN2_IDS = [
  'leo2a4', 't80u', 'leclerc', 'leclerc_xlr', 'amx56',
  'type99a', 'leo1a5', 'mbt70', 't14',
];

const apfsds = (name, cal, quoted2km, dmg, vel) => {
  const p = apfsdsPens(quoted2km);
  return shell(name, 'APFSDS', cal, p[0], p[1], dmg, vel, { pen2000Mm: p[2] });
};
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };
const MODERN_TR = { hard: 0.7, medium: 0.8, soft: 1.5 };
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Parametric modern-MBT armor layout (t90m template, tunable per vehicle).
// Geometry follows the visual builders below; values are roster RHAe.
// ---------------------------------------------------------------------------
function mbtArmor(o) {
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
function liftHullAssemblyAboveTracks(armor, liftM) {
  const fixedTrackModules = new Set(['trackL', 'trackR']);
  for (const plate of armor.hullPlates) {
    if (fixedTrackModules.has(plate.moduleLink) || /^track_[LR]$/.test(plate.name)) continue;
    plate.verts = plate.verts.map(([x, y, z]) => [x, y + liftM, z]);
  }
  for (const module of armor.modules) {
    if (module.turretLocal || fixedTrackModules.has(module.module)) continue;
    module.min[1] += liftM;
    module.max[1] += liftM;
  }
  for (const crew of armor.crew) {
    if (crew.turretLocal) continue;
    crew.min[1] += liftM;
    crew.max[1] += liftM;
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
// Specs
// ---------------------------------------------------------------------------
const MODERN2_SPECS = {
  leo2a4: {
    id: 'leo2a4', name: 'Leopard 2A4', nation: 'Germany', era: 'modern', role: 'mbt',
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
    id: 't80u', name: 'T-80U', nation: 'USSR/Russia', era: 'modern', role: 'mbt',
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
      caliberMm: 120, reloadS: 18.5, baseAccuracy: 0.30, aimTimeS: 1.9,
      // Three-round ready rack: rapid presentation from the Leclerc bustle
      // conveyor, followed by an all-or-nothing magazine replenishment.
      autoloader: { magazineSize: 3, intraClipS: 2.5, fullReloadS: 18.5 },
      bloom: BLOOM_MODERN,
      shells: [
        apfsds('OFL 120 F2 APFSDS', 120, 640, 520, 1790),
        shell('OECC 120 F1 HEAT', 'HEAT', 120, 600, 600, 470, 1100),
        shell('OE 120 F1 HE', 'HE', 120, 45, 45, 570, 950),
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
      // Owner directive: missiles are the normal primary weapon, not a
      // special-action ammunition swap.  Keeping exactly one shell also
      // prevents the selector from surfacing a fictional conventional round.
      primaryGuided: true,
      shells: [
        shell('XMGM-51C Shillelagh ATGM', 'HEAT', 152, 800, 800, 750, 208, {
          guided: true, guidanceTurnRateRadS: 0.72, reloadS: 9.8,
          soundProfile: 'shillelagh-launch',
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
    id: 'type99a', name: 'Type 99A (ZTZ-99A)', nation: 'China', era: 'modern', role: 'mbt',
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
      // P95 normalization only: the oracle's connected secondary stabilized
      // station reaches 3.49 m while the broad primary sight cabinet ends at
      // 3.14 m. Keep the published combat-station height for gameplay/UI,
      // but compare the authored and oracle silhouettes on the same P95
      // connected-station envelope; thin whip tips remain excluded.
      silhouetteHeightM: 3.49,
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
    id: 't14', name: 'T-14 Armata', nation: 'Russia', era: 'modern', role: 'mbt',
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
  const cloneArmor = (armor) => ({
    ...armor,
    turretPivot: armor.turretPivot.slice(),
    gunPivot: armor.gunPivot.slice(),
    gunBarrel: { ...armor.gunBarrel },
    hullPlates: armor.hullPlates.map((plate) => ({
      ...plate, verts: plate.verts.map((point) => point.slice()),
    })),
    turretPlates: armor.turretPlates.map((plate) => ({
      ...plate, verts: plate.verts.map((point) => point.slice()),
    })),
    modules: armor.modules.map((box) => ({
      ...box, min: box.min.slice(), max: box.max.slice(),
    })),
    crew: armor.crew.map((box) => ({
      ...box, min: box.min.slice(), max: box.max.slice(),
    })),
  });
  const passive = { keReduction: 0.08, ceFlatMm: 180 };
  const galixEra = { keReduction: 0.18, ceFlatMm: 330 };
  const xlrArmor = cloneArmor(base.armor);
  MODERN2_SPECS.leclerc_xlr = {
    ...base,
    id: 'leclerc_xlr', name: 'Leclerc XLR', hp: 2550,
    weightTons: 57.4, topSpeedKmh: 70,
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
    id: 'amx56', name: 'AMX 56', hp: 2650,
    enginePowerHp: 1550, weightTons: 58.8, topSpeedKmh: 68,
    gun: { ...base.gun, reloadS: 4.8, aimTimeS: 1.7 },
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

// Register specs + model-source rows + garage roster ids (idempotent —
// vite HMR can re-evaluate this module).
for (const id of MODERN2_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || MODERN2_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// ===========================================================================
// Builders
// ===========================================================================

// ---------------------------------------------------------------------------
// Leopard 2A4 — 2A7 family hull, pre-wedge turret: two flat VERTICAL cheek
// plates meeting the mantlet slot, EMES-15 cutout in the right cheek top,
// flat roof, round hatches, baskets across the whole turret rear, L/44.
// ---------------------------------------------------------------------------
function buildLeo2A4(P) {
  const { box, frustum, cylY, cylX, cylZ, torus, slab,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope,
    towCable, smokeCluster, stowage, jerryCan, tarpRoll, ammoCan,
    spareTrackStrip } = KIT;
  const { rng } = P;
  // ---- hull (Leo 2 family: shallow band over tracks, sharp one-piece glacis)
  P.add('hull', box(2.48, 0.58, 7.5), 0, 0.79, 0);                              // lower hull
  P.add('hull', box(3.40, 0.42, 4.66), 0, 1.51, -1.38);                         // upper hull band
  fenders(P, 1.25, 1.85, 1.29, -3.72, 3.6, 0.035);
  P.add('hull', frustum(1.70, 3.83, 1.0, 1.70, 1.00, 1.0, 1.0, 1.72));          // sharp glacis
  P.add('hull', frustum(1.70, 3.45, 3.55, 1.70, 3.83, 3.55, 0.5, 1.0));         // lower front
  P.add('hull', box(3.1, 0.52, 0.12), 0, 1.46, -3.70);                          // rear plate
  // rear deck: twin cooling fans + transverse radiator louver (family read)
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.40, 0.40, 0.025, P.q ? 28 : 14), s * 0.80, 1.725, -2.55);
    P.add('hullDetail', torus(0.40, 0.025, P.q ? 26 : 14), s * 0.80, 1.73, -2.55);
    P.add('hullDetail', box(0.76, 0.02, 0.05), s * 0.80, 1.74, -2.55);
    P.add('hullDetail', box(0.05, 0.02, 0.76), s * 0.80, 1.74, -2.55);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(0.66 - Math.abs(k - 2) * 0.14, 0.018, 0.05),
        s * 0.80, 1.737, -2.75 + k * 0.10);
    }
    P.add('hullDark', box(0.7, 0.4, 0.04), s * 0.95, 1.15, -3.78);              // exhaust grille
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(0.7, 0.05, 0.05), s * 0.95, 1.0 + k * 0.11, -3.795);
    }
    for (const zc of [-2.0, -1.15, -0.35]) {                                    // access caps
      P.add('hullDetail', cylY(0.10, 0.10, 0.028, 12), s * 1.44, 1.728, zc);
      P.add('hullDark', torus(0.10, 0.012, 12), s * 1.44, 1.733, zc);
    }
    P.add('hullDark', box(0.16, 0.09, 0.05), s * 1.38, 1.32, -3.775);           // taillights
    P.add('hullRubber', box(0.56, 0.34, 0.03), s * 1.5, 0.52, -3.86, 0.12, 0, 0);
  }
  P.add('hullDark', box(2.9, 0.022, 0.56), 0, 1.717, -3.32);                    // radiator inset
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.74, 0.032, 0.07), 0, 1.732, -3.52 + k * 0.10);
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 7.0), s * 1.5, 1.27, 0);
  }
  // skirts (§9.5): PLAIN rubber wavy-bottom panels the full hull length —
  // no 2A7 heavy armor modules. Panel seams + alternating scallop lip.
  // r5 ("leo2a4 is missing its side skirts entirely, exposing a floating
  // cleated return-run band over plain disc wheels"): the old 0.50 m panel
  // hung at 0.73-1.23 with the 1.87 m-wide track flush against its 1.86 m
  // plane — the run rendered THROUGH it. Panels now hang fender line to
  // upper-wheel (0.60-1.29) at 1.90 m, outboard of the track, like the
  // always-fitted rubber skirts every service 2A4 carries.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.045, 0.69, 6.9), s * 1.90, 0.945, -0.05);
    P.add('hullRubber', box(0.032, 0.14, 6.85), s * 1.90, 0.55, -0.05);
    for (let k = 0; k < 8; k++) {
      P.add('hullDark', box(0.05, 0.62, 0.018), s * 1.90, 0.945, 3.15 - k * 0.92);
      // wavy lower edge: alternating rubber scallop tabs
      P.add('hullRubber', box(0.034, 0.08, 0.5), s * 1.90, 0.47 + (k % 2) * 0.045, 2.85 - k * 0.86);
    }
  }
  towCable(P, [[-1.3, 1.6, -3.4], [0, 1.7, -3.7], [1.3, 1.6, -3.4]]);
  headlight(P, -1.3, 0.92, 3.68, -0.35);
  headlight(P, 1.3, 0.92, 3.68, -0.35);
  liftEye(P, 'hullDetail', -1.4, 1.75, -0.5);
  liftEye(P, 'hullDetail', 1.4, 1.75, -0.5);
  // glacis furniture
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(1.05, 0.045, 0.07), s * 0.47, 1.46, 2.15, -0.25, s * 0.42, 0);
  }
  P.add('hullDark', box(0.02, 0.012, 2.7), -1.68, 1.53, 2.35, -0.25, 0, 0);
  P.add('hullDark', box(0.02, 0.012, 2.7), 1.68, 1.53, 2.35, -0.25, 0, 0);
  P.add('hull', cylY(0.30, 0.30, 0.035, P.q ? 22 : 12), 0.62, 1.74, 0.72);      // driver hatch
  P.add('hullDark', torus(0.30, 0.015, P.q ? 22 : 12), 0.62, 1.745, 0.72);
  periscope(P, 'hullDetail', 0.40, 1.76, 1.05);
  periscope(P, 'hullDetail', 0.62, 1.76, 1.08);
  periscope(P, 'hullDetail', 0.84, 1.76, 1.05, 0.3);
  towCable(P, [[-1.15, 1.42, 2.5], [0, 1.56, 1.7], [1.15, 1.42, 2.5]]);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.03, 12), s * 1.28, 1.735, 0.2);
  spareTrackStrip(P, 'hull', -1.3, 1.18, 2.42, 2, -1.15, 0);

  // ---- turret (§9.5): slab box, VERTICAL front cheek plates, EMES cutout ----
  const TW = 1.20, TH = 0.76;
  P.add('turret', frustum(TW, 0.80, -1.90, TW * 0.96, 0.76, -1.87, 0.0, TH));   // main box
  // front face: two flat vertical cheek plates flanking a central mantlet slot
  for (const s of [-1, 1]) {
    P.add('turret', box(0.84, TH, 0.20), s * (0.42 + 0.36), TH / 2, 0.86);
  }
  P.add('turretDark', box(0.56, 0.38, 0.06), 0, 0.40, 0.875);                   // mantlet slot recess
  P.add('turret', box(0.76, 0.15, 0.18), 0, 0.075, 0.86);                       // chin plate
  P.add('turret', box(0.76, 0.10, 0.18), 0, TH - 0.05, 0.86);                   // brow plate over slot
  // EMES-15 gunner sight aperture cut into the RIGHT cheek top (key A4 ID)
  P.add('turretDark', box(0.36, 0.24, 0.16), 0.60, TH - 0.14, 0.92);            // dark recess
  P.add('turret', box(0.42, 0.06, 0.26), 0.60, TH + 0.01, 0.88);                // lid
  P.add('turretGlass', box(0.26, 0.11, 0.02), 0.60, TH - 0.13, 1.005);          // lens
  // cheek plate seams + lifting lugs
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.016, TH * 0.9, 0.21), s * 0.40, TH / 2, 0.865);   // slot edge seam
    P.add('turret', box(0.09, 0.05, 0.12), s * 0.9, TH - 0.1, 0.90);
  }
  // flat roof furniture: hatch rings, PERI R17 (commander, right), periscopes
  P.add('turret', cylY(0.24, 0.24, 0.045, 14), 0.60, TH + 0.02, -0.70);         // cdr hatch
  P.add('turret', cylY(0.22, 0.22, 0.045, 14), -0.66, TH + 0.02, -0.55);        // loader hatch
  periscope(P, 'turretDetail', 0.60, TH + 0.06, -0.36);
  P.add('turretDetail', cylY(0.055, 0.065, 0.26, 12), 0.36, TH + 0.13, -1.05);  // PERI stalk
  P.add('turretDark', box(0.17, 0.19, 0.19), 0.36, TH + 0.38, -1.05);           // PERI head
  P.add('turretGlass', box(0.11, 0.10, 0.02), 0.36, TH + 0.40, -0.955);
  pintle(P, KIT, -0.66, TH + 0.04, -0.42);                                        // loader MG3
  P.add('turretDetail', box(0.03, 0.45, 0.03), -1.0, TH + 0.28, -1.65);         // crosswind mast
  P.add('turretDetail', box(0.03, 0.55, 0.03), 1.0, TH + 0.30, -1.7, 0, 0, 0.1); // whip antenna
  liftEye(P, 'turretDetail', -1.02, TH + 0.03, 0.1);
  liftEye(P, 'turretDetail', 1.02, TH + 0.03, -0.5);
  // stowage baskets across the WHOLE turret rear + sides (§9.5)
  const rkT = 0.66, rkB = 0.12, rkZ = -2.42;
  P.add('turretDetail', box(2 * TW + 0.3, 0.05, 0.05), 0, rkT, rkZ);
  P.add('turretDetail', box(2 * TW + 0.3, 0.05, 0.05), 0, rkB, rkZ);
  for (let k = 0; k < 13; k++) {
    P.add('turretDetail', box(0.035, rkT - rkB, 0.035), -TW - 0.05 + k * 0.21, (rkT + rkB) / 2, rkZ);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 0.5), s * (TW + 0.1), rkT, -2.15);
    P.add('turretDetail', box(0.05, 0.05, 0.5), s * (TW + 0.1), rkB, -2.15);
  }
  P.add('turretDark', box(2 * TW + 0.16, 0.02, 0.45), 0, rkB + 0.03, -2.18);
  stowage(P, 'turretCloth', rng, [
    [-0.85, 0.36, -2.18, 0.7, 0.4, 0.38], [0.1, 0.34, -2.2, 0.6, 0.36, 0.36],
    [0.9, 0.34, -2.18, 0.5, 0.38, 0.34],
  ]);
  jerryCan(P, 'turretCloth', -1.25, 0.34, -2.2, 0.15);
  tarpRoll(P, 'turretCloth', 0.55, 0.55, -2.16, 1.1, 0.09, true);
  ammoCan(P, 'turretDark', 1.2, 0.3, -2.2, 0.2);
  // side baskets
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 1.2), s * (TW + 0.1), 0.55, -1.15);
    P.add('turretDetail', box(0.05, 0.05, 1.2), s * (TW + 0.1), 0.16, -1.15);
    for (let k = 0; k < 5; k++) {
      P.add('turretDetail', box(0.03, 0.38, 0.03), s * (TW + 0.1), 0.355, -0.65 - k * 0.25);
    }
    stowage(P, 'turretCloth', rng, [[s * (TW + 0.03), 0.36, -1.12, 0.15, 0.28, 0.95]]);
  }
  // 2x8 smoke dischargers on the rear side walls
  smokeCluster(P, 1.10, 0.48, -1.35, 4, 1.1, 0.8);
  smokeCluster(P, 1.14, 0.34, -1.52, 4, 1.25, 0.8);
  smokeCluster(P, -1.10, 0.48, -1.35, 4, -1.1, 0.8);
  smokeCluster(P, -1.14, 0.34, -1.52, 4, -1.25, 0.8);
  // mantlet: flat plate + yoke in the slot (pre-wedge face)
  P.addGunExtra(box(0.56, 0.46, 0.30), 0, 0.02, 0.48);
  P.addGunExtra(box(0.84, 0.34, 0.16), 0, 0, 0.30);
  P.addGunExtra(cylZ(0.13, 0.3, 12, 0.155), 0, 0, 0.68);
  buildGun(P, { len: 5.28, r: 0.079, sleeve: true, evac: 0.52, baseR: 0.16 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.22, xc: 1.55, dishR: 0.80,
    wheelZs: [2.95, 2.0, 1.25, 0.28, -0.69, -1.66, -2.63],
    sprocket: { z: -3.5, y: 0.50, r: 0.36 }, idler: { z: 3.45, y: 0.47, r: 0.33 },
    rollers: [2.1, 0.6, -0.9, -2.4].map((z) => ({ z, y: 0.93, r: 0.08 })),
    trackW: 0.635, topY: 0.92, paintedEnds: true, coveredTop: true,
  });
  P.decal('turret', 'crossgrey', null, 0.36, [1.21, 0.40, -0.6], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.36, [-1.21, 0.40, -0.6], -Math.PI / 2);
  P.decal('hull', 'number', '414', 0.34, [1.87, 0.98, 2.6], Math.PI / 2);
  P.decal('hull', 'number', '414', 0.34, [-1.87, 0.98, 2.6], -Math.PI / 2);
  P.topY = TH + 0.2;
}

// small helper: loader-hatch pintle MG (thin, unboxed)
function pintle(P, kit, x, y, z) {
  const { cylY, box, cylZ } = kit;
  P.add('turretDark', cylY(0.018, 0.018, 0.18), x, y + 0.09, z);
  P.add('turretDark', box(0.07, 0.07, 0.38), x, y + 0.22, z + 0.05);
  P.add('turretDark', cylZ(0.018, 0.5, 8), x, y + 0.23, z + 0.5, -0.06, 0, 0);
}

// ---------------------------------------------------------------------------
// T-80U — low turbine hot-rod: blunter nose with 3 fat K-5 glacis wedges,
// rounded cast dome turret in a Kontakt-5 clamshell V, turbine exhaust box
// centered on the rear plate, 6 smaller wheels + 5 return rollers.
// ---------------------------------------------------------------------------
function buildT80U(P) {
  const { box, frustum, cylY, cylX, cylZ, torus, lathe,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope,
    towCable, smokeCluster, cupola, spareTrackStrip, stowage } = KIT;
  const { rng } = P;
  // ---- hull (T-72/80 pancake: tracks + skirts, shallow deck band) ----------
  P.add('hull', box(2.4, 0.55, 6.55), 0, 0.70, -0.08);                          // lower hull
  P.add('hull', frustum(1.70, 2.98, -3.32, 1.46, 2.92, -3.28, 1.08, 1.38));     // tapered deck band
  fenders(P, 1.30, 1.88, 1.065, -3.36, 3.2, 0.035);
  P.add('hull', frustum(1.62, 3.40, 1.92, 1.68, 1.86, 1.92, 0.82, 1.38));       // 68 deg glacis
  P.add('hull', frustum(1.62, 3.06, 3.12, 1.62, 3.40, 3.12, 0.42, 0.82));       // blunter lower nose
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.55, 0.026, 6.2), s * 1.55, 1.055, -0.1);
  }
  // 3 fat K-5 glacis wedge courses (§15.5 — full-width array in 3 wedges)
  for (const xw of [-1.0, 0, 1.0]) {
    for (const s of [-1, 1]) {
      P.add('hull', box(0.52, 0.34, 0.16), xw + s * 0.24, 1.02, 2.62 - Math.abs(xw) * 0.02,
        -68 * D2R, s * 0.35, 0);
    }
  }
  // driver hatch strip + V splash board
  P.add('hull', box(0.5, 0.05, 0.42), 0, 1.28, 2.14, -1.19, 0, 0);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.78, 0.05, 0.08), s * 0.36, 1.10, 2.56, -1.19, s * 0.5, 0);
  // skirts: rubber panels with angular fabric seams, wheels visible below
  for (const s of [-1, 1]) {
    P.add('hull', box(0.04, 0.40, 6.3), s * 1.86, 0.86, -0.12);
    P.add('hullRubber', box(0.03, 0.10, 6.25), s * 1.86, 0.60, -0.12);
    for (let k = 0; k < 6; k++) {
      P.add('hullDark', box(0.048, 0.34, 0.02), s * 1.86, 0.84, 2.6 - k * 1.05);
    }
  }
  // TURBINE EXHAUST BOX: wide flat rectangular port centered on the rear
  // plate — the T-80's #1 rear ID vs T-72/T-90 side exhaust.
  P.add('hull', box(1.9, 0.55, 0.16), 0, 0.88, -3.42);
  P.add('hullDark', box(1.55, 0.34, 0.05), 0, 0.88, -3.52);                     // dark port
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.5, 0.045, 0.05), 0, 0.74 + k * 0.10, -3.535);
  P.add('hullDetail', box(1.7, 0.05, 0.10), 0, 1.18, -3.47);                    // port hood lip
  // rear fuel drums + unditching log (Soviet lineage props)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.14, 0.14, 1.0, 12), s * 1.05, 1.0, -3.3, 0, 0, s * 0.10);
    P.add('hullDark', box(0.05, 0.38, 0.03), s * 1.05, 1.0, -3.42);
  }
  P.add('hullWood', cylX(0.11, 2.1, 12), 0, 1.22, -3.1);
  // engine deck: turbine intake grilles (big, flat) + louvres
  P.add('hullDark', box(1.7, 0.02, 1.1), 0, 1.385, -2.0);
  for (const k of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDetail', box(1.6, 0.02, 0.05), 0, 1.39, -1.6 - k * 0.16);
  }
  P.add('hull', box(1.0, 0.07, 0.62), 0.45, 1.42, -1.2);                        // intake hump
  headlight(P, -1.45, 1.12, 3.05, -0.2, 0.05);
  liftEye(P, 'hullDetail', -1.15, 1.40, 1.5);
  liftEye(P, 'hullDetail', 1.15, 1.40, 1.5);
  towCable(P, [[-1.25, 1.02, 2.9], [-0.35, 0.96, 3.08], [0.5, 1.0, 2.98]]);
  spareTrackStrip(P, 'hull', 1.28, 1.16, 2.36, 2, -1.15, 0);

  // ---- turret: rounded cast dome (egg in plan) in a K-5 clamshell V --------
  P.add('turret', lathe([
    [0.30, 0.0], [1.10, 0.02], [1.16, 0.14], [1.12, 0.34], [0.98, 0.52],
    [0.72, 0.64], [0.40, 0.71], [0.04, 0.74],
  ], P.q ? 30 : 16, 1.22), 0, 0, 0.02);
  // K-5 clamshell wedges around the frontal arc (§15.5 "distinct clamshell V")
  for (const s of [-1, 1]) {
    P.add('turret', box(0.70, 0.36, 0.22), s * 0.46, 0.26, 0.82, -0.22, s * 0.48, 0); // lower clam
    P.add('turret', box(0.58, 0.26, 0.20), s * 0.40, 0.55, 0.70, -0.52, s * 0.48, 0); // upper clam
    P.add('turret', box(0.46, 0.34, 0.20), s * 0.92, 0.24, 0.28, -0.12, s * 1.0, 0);  // side shoulder
  }
  // commander's cupola RIGHT with Utyos 12.7 on its AA rail; gunner hatch left
  cupola(P, 'turret', 0.52, 0.62, -0.35, 0.22, 0.13, 5);
  P.add('turretDetail', torus(0.30, 0.02, 14), 0.52, 0.86, -0.35);              // curved AA rail
  utyos(P, KIT, 0.62, 0.86, -0.22);
  P.add('turret', cylY(0.21, 0.21, 0.04, 14), -0.48, 0.70, -0.30);              // gunner hatch
  // gunner sight + IR box left of gun (1G46 doghouse)
  P.add('turret', box(0.34, 0.22, 0.34), -0.38, 0.74, 0.22);
  P.add('turretDark', box(0.26, 0.13, 0.04), -0.38, 0.74, 0.41);
  P.add('turretGlass', box(0.2, 0.09, 0.02), -0.38, 0.74, 0.435);
  // 902 smoke tubes clustered LEFT SIDE ONLY (§15.5 key detail)
  smokeCluster(P, -0.98, 0.34, 0.42, 5, -0.85, 0.6);
  smokeCluster(P, -1.06, 0.22, 0.18, 4, -1.05, 0.55);
  // bustle: snorkel + small rack + grab rails
  P.add('turretDetail', cylX(0.07, 1.5, 10), 0, 0.50, -1.05);                   // snorkel
  P.add('turretDetail', box(0.05, 0.05, 0.7), 0.75, 0.42, -0.95, 0, 0.5, 0);
  P.add('turretDetail', box(0.05, 0.05, 0.7), -0.75, 0.42, -0.95, 0, -0.5, 0);
  stowage(P, 'turretCloth', rng, [[0, 0.36, -1.2, 0.85, 0.3, 0.4]]);
  P.add('turretDetail', box(0.025, 0.45, 0.025), -0.55, 0.55, -0.85, 0, 0, 0.1); // antenna
  P.addGunExtra(box(0.42, 0.42, 0.30), 0, 0.02, 0.62);                          // embrasure block
  P.addGunExtra(cylZ(0.13, 0.32, 12, 0.16), 0, 0, 0.86);                        // mantlet collar
  buildGun(P, { len: 6.0, r: 0.068, sleeve: true, evac: 0.42, baseR: 0.15 });
  // 6 smaller wheels with round lightening holes + 5 return rollers (§15.5)
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.335, wheelW: 0.21, xc: 1.58,
    wheelZs: [2.45, 1.47, 0.49, -0.49, -1.47, -2.45],
    sprocket: { z: -3.0, y: 0.52, r: 0.27 }, idler: { z: 2.95, y: 0.50, r: 0.25 },
    rollers: [1.85, 0.95, 0, -0.95, -1.85].map((z) => ({ z, y: 0.92, r: 0.08 })),
    // r3: §15.5 rubber skirts cover the return run — no horn comb.
    trackW: 0.60, topY: 0.86, arms: true, paintedEnds: true, coveredTop: true,
  });
  // ---- Kontakt-5 brick clusters (strippable) --------------------------------
  const t80GlacisZ = (y) => 1.86 + (1.38 - y) * 2.75 + 0.05;
  P.eraCluster('glacis_era_R', (put) => {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 5; c++) {
      const y = 0.94 + row * 0.13;
      put(0.16 + c * 0.30, y, t80GlacisZ(y), -68 * D2R, 0, 0);
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 5; c++) {
      const y = 0.94 + row * 0.13;
      put(-0.16 - c * 0.30, y, t80GlacisZ(y), -68 * D2R, 0, 0);
    }
  });
  const t80Cheek = (put, s) => {
    const dx = Math.cos(0.48), dz = -Math.sin(0.48);
    const nx = Math.sin(0.48), nz = Math.cos(0.48);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      const t = -0.28 + c * 0.19;
      put(s * (0.46 + dx * t + nx * 0.13), 1.60 + row * 0.17,
        0.82 + dz * t + nz * 0.13, -0.22, s * 0.48, 0);
    }
  };
  P.eraCluster('turret_era_R', (put) => t80Cheek(put, 1), true);
  P.eraCluster('turret_era_L', (put) => t80Cheek(put, -1), true);
  P.decal('turret', 'number', '518', 0.28, [1.02, 0.30, -0.15], Math.PI / 2, 0, 0.1);
  P.decal('turret', 'number', '518', 0.28, [-1.02, 0.30, -0.15], -Math.PI / 2, 0, -0.1);
  P.decal('hull', 'soot', null, 1.0, [0.0, 0.9, -3.56], Math.PI);               // turbine heat stain
  P.topY = 0.95;
}

// NSVT "Utyos" 12.7 AA gun on the T-80U cupola rail
function utyos(P, kit, x, y, z) {
  const { box, cylZ } = kit;
  P.add('turretDark', box(0.09, 0.11, 0.46), x, y + 0.06, z);
  P.add('turretDark', cylZ(0.024, 0.62, 8), x, y + 0.07, z + 0.5, -0.05, 0, 0);
  P.add('turretDark', cylZ(0.036, 0.12, 8), x, y + 0.07, z + 0.78, -0.05, 0, 0); // muzzle booster
  P.add('turretDetail', box(0.10, 0.14, 0.18), x - 0.11, y + 0.03, z - 0.05);    // ammo box
}

// ---------------------------------------------------------------------------
// Leclerc S2 — compact dense hull (shortest modern MBT), narrow-front turret
// with angled plan cheeks, tall HL-70 pano sight, GALIX tubes, autoloader
// bustle, front-third armored skirt blocks. Fastest 120 reload in game.
// ---------------------------------------------------------------------------
function buildLeclerc(P) {
  const { box, frustum, slab, cylY, cylZ, torus,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope,
    towCable, stowage, jerryCan, ammoCan, spareTrackStrip } = KIT;
  const { rng } = P;
  // ---- hull ------------------------------------------------------------------
  P.add('hull', box(2.4, 0.58, 6.55), 0, 0.79, 0);                              // lower hull
  P.add('hull', box(3.28, 0.44, 4.2), 0, 1.38, -1.15);                          // upper band
  fenders(P, 1.22, 1.84, 1.17, -3.4, 3.3, 0.035);
  // clean single-plane glacis with full-width splash ridge (§20.5)
  P.add('hull', frustum(1.66, 3.42, 1.6, 1.66, 1.55, 1.6, 0.9, 1.60));
  P.add('hull', frustum(1.66, 3.1, 3.2, 1.66, 3.42, 3.2, 0.48, 0.9));           // lower nose
  P.add('hullDetail', box(2.9, 0.05, 0.08), 0, 1.32, 2.30, -0.32, 0, 0);        // splash ridge
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 6.4), s * 1.48, 1.15, 0);
  }
  // driver station LEFT glacis: hatch + 3 episcopes
  P.add('hull', cylY(0.28, 0.28, 0.035, P.q ? 20 : 12), -0.60, 1.62, 0.85);
  P.add('hullDark', torus(0.28, 0.015, P.q ? 20 : 12), -0.60, 1.625, 0.85);
  periscope(P, 'hullDetail', -0.82, 1.64, 1.12, -0.3);
  periscope(P, 'hullDetail', -0.60, 1.64, 1.16);
  periscope(P, 'hullDetail', -0.38, 1.64, 1.12, 0.3);
  // skirts: front third THICK armored blocks, rear two-thirds rubber sheet
  for (const s of [-1, 1]) {
    P.add('hull', box(0.10, 0.55, 2.2), s * 1.83, 0.92, 2.15);                  // armored blocks
    for (let k = 0; k < 3; k++) {
      P.add('hullDark', box(0.104, 0.5, 0.016), s * 1.83, 0.92, 2.85 - k * 0.72);
    }
    P.add('hull', box(0.035, 0.5, 4.15), s * 1.845, 0.90, -1.05);               // rubber sheet
    P.add('hullRubber', box(0.028, 0.12, 4.1), s * 1.845, 0.61, -1.05);
    for (let k = 0; k < 5; k++) {
      P.add('hullDark', box(0.04, 0.44, 0.018), s * 1.845, 0.90, 0.7 - k * 0.85);
    }
  }
  // rear: grilles + jack + shackles
  P.add('hull', box(3.0, 0.5, 0.12), 0, 1.32, -3.38);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.66, 0.36, 0.04), s * 0.85, 1.10, -3.45);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.64, 0.045, 0.05), s * 0.85, 0.96 + k * 0.10, -3.46);
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.3, 1.3, -3.44);              // taillights
    P.add('hullRubber', box(0.52, 0.32, 0.03), s * 1.42, 0.5, -3.5, 0.12, 0, 0);
  }
  // engine deck fans + caps
  P.add('hullDark', box(1.9, 0.02, 1.35), 0, 1.605, -2.2);
  for (const k of KIT.grilleIndices(P.q, 7, 3)) {
    P.add('hullDetail', box(1.8, 0.025, 0.06), 0, 1.615, -1.68 - k * 0.17);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.09, 0.09, 0.028, 12), s * 1.35, 1.61, -0.6);
  }
  headlight(P, -1.28, 0.95, 3.32, -0.3);
  headlight(P, 1.28, 0.95, 3.32, -0.3);
  towCable(P, [[-1.1, 1.3, 2.4], [0, 1.44, 1.9], [1.1, 1.3, 2.4]]);
  spareTrackStrip(P, 'hull', 1.25, 1.06, 2.3, 2, -1.1, 0);
  liftEye(P, 'hullDetail', -1.3, 1.63, -0.2);
  liftEye(P, 'hullDetail', 1.3, 1.63, -0.2);

  // ---- turret: home-plate pentagon plan — narrow front, angled cheeks,
  // slab sides running straight back (§20.5)
  // tank_models r1 (critic: "Leclerc — whose real identity is the SHORTEST
  // hull with a proportionally big turret — reads as a huge hull with a
  // pillbox"): plan-form audit vs §20.5 — home-plate pentagon widened to
  // 2.64 m, stretched to the full bustle-autoloader length, walls raised.
  const LH = 0.92;
  P.add('turret', frustum(1.32, -0.15, -2.15, 1.22, -0.18, -2.10, 0.0, LH));    // rear box
  P.add('turret', slab(                                                          // right angled cheek
    [0.34, 0, 1.14], [1.32, 0, -0.13], [1.32, 0, -0.5], [0.34, 0, 0.70],
    [0.31, LH, 1.03], [1.22, LH, -0.20], [1.22, LH, -0.5], [0.31, LH, 0.60]));
  P.add('turret', slab(                                                          // left angled cheek
    [-1.32, 0, -0.13], [-0.34, 0, 1.14], [-0.34, 0, 0.70], [-1.32, 0, -0.5],
    [-1.22, LH, -0.20], [-0.31, LH, 1.03], [-0.31, LH, 0.60], [-1.22, LH, -0.5]));
  P.add('turret', box(0.64, LH, 0.55), 0, LH / 2, 0.82);                        // narrow front face
  // SAVAN gunner sight boxed into the right cheek top
  P.add('turretDark', box(0.4, 0.2, 0.34), 0.55, LH - 0.12, 0.42);
  P.add('turret', box(0.46, 0.06, 0.4), 0.55, LH + 0.01, 0.40);
  P.add('turretGlass', box(0.3, 0.1, 0.02), 0.55, LH - 0.11, 0.60);
  // HL-70 panoramic sight: TALL periscope tower roof left-rear (§20.5 ID)
  P.add('turretDetail', cylY(0.09, 0.10, 0.42, 12), -0.55, LH + 0.21, -1.05);
  P.add('turretDetail', cylY(0.12, 0.12, 0.09, 12), -0.55, LH + 0.46, -1.05);
  P.add('turretDark', box(0.22, 0.26, 0.24), -0.55, LH + 0.63, -1.05);
  P.add('turretGlass', box(0.14, 0.13, 0.02), -0.55, LH + 0.65, -0.92);
  // commander + gunner hatches, periscope ring
  P.add('turret', cylY(0.23, 0.23, 0.045, 14), 0.60, LH + 0.02, -0.95);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.56, LH + 0.02, -0.40);
  periscope(P, 'turretDetail', 0.52, LH + 0.06, -0.52);
  periscope(P, 'turretDetail', 0.30, LH + 0.06, -0.85, 0.6);
  // bustle autoloader: flat roof aft with ammo hatch PANEL LINES
  P.add('turretDark', box(0.9, 0.014, 1.2), 0, LH + 0.006, -1.5);
  for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.85, 0.02, 0.02), 0, LH + 0.012, -1.1 - k * 0.3);
  // GALIX dischargers: 9 short tubes splayed along each rear corner (5+4 rows)
  galix(P, KIT, 1.20, 0.58, -1.65, 1);
  galix(P, KIT, -1.20, 0.58, -1.65, -1);
  // stowage baskets both sides + rear rack
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 1.25), s * 1.38, 0.55, -1.1);
    P.add('turretDetail', box(0.05, 0.05, 1.25), s * 1.38, 0.15, -1.1);
    for (let k = 0; k < 5; k++) {
      P.add('turretDetail', box(0.03, 0.4, 0.03), s * 1.38, 0.35, -0.6 - k * 0.25);
    }
    stowage(P, 'turretCloth', rng, [[s * 1.31, 0.36, -1.1, 0.16, 0.3, 1.0]]);
  }
  const bkT = 0.62, bkB = 0.12;
  P.add('turretDetail', box(2.5, 0.05, 0.05), 0, bkT, -2.62);
  P.add('turretDetail', box(2.5, 0.05, 0.05), 0, bkB, -2.62);
  for (let k = 0; k < 11; k++) P.add('turretDetail', box(0.035, bkT - bkB, 0.035), -1.15 + k * 0.23, (bkT + bkB) / 2, -2.62);
  stowage(P, 'turretCloth', rng, [
    [-0.6, 0.32, -2.2, 0.6, 0.36, 0.35], [0.35, 0.3, -2.22, 0.55, 0.32, 0.33],
  ]);
  jerryCan(P, 'turretCloth', 1.0, 0.3, -2.2, -0.2);
  ammoCan(P, 'turretDark', -1.05, 0.28, -2.2, 0.25);
  // whip antennas rear corners + crosswind mast
  P.add('turretDetail', box(0.025, 0.6, 0.025), 0.95, LH + 0.3, -1.85, 0, 0, 0.12);
  P.add('turretDetail', box(0.025, 0.6, 0.025), -0.95, LH + 0.3, -1.85, 0, 0, -0.12);
  P.add('turretDetail', box(0.03, 0.4, 0.03), 0.2, LH + 0.24, -1.9);
  // mantlet: narrow V-notch plate
  P.addGunExtra(box(0.5, 0.5, 0.3), 0, 0.02, 0.85);
  P.addGunExtra(cylZ(0.13, 0.3, 12, 0.16), 0, 0, 1.06);
  buildGun(P, { len: 6.2, r: 0.075, sleeve: true, evac: 0.5, collar: true, baseR: 0.155 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.22, xc: 1.5,
    wheelZs: [2.35, 1.41, 0.47, -0.47, -1.41, -2.35],
    sprocket: { z: -2.95, y: 0.50, r: 0.30 }, idler: { z: 2.9, y: 0.48, r: 0.28 },
    rollers: [1.9, 0.95, 0, -0.95, -1.9].map((z) => ({ z, y: 0.87, r: 0.08 })),
    trackW: 0.635, topY: 0.9, paintedEnds: true, coveredTop: 0.99,
  });
  for (const s of [-1, 1]) {                                                    // sponson gap covers (r1 zipper)
    P.add('hullShadow', new THREE.BoxGeometry(0.34, 0.03, 6.4), s * 1.66, 1.09, -0.05);
  }
  P.decal('turret', 'number', '33', 0.3, [1.19, 0.35, -1.0], Math.PI / 2);
  P.decal('turret', 'number', '33', 0.3, [-1.19, 0.35, -1.0], -Math.PI / 2);
  P.decal('hull', 'number', '6-33', 0.28, [1.84, 0.95, 2.5], Math.PI / 2);
  P.decal('hull', 'number', '6-33', 0.28, [-1.84, 0.95, 2.5], -Math.PI / 2);
  P.topY = LH + 0.55;
}

// GALIX bank: 9 stubby tubes splayed in two rows on a rear turret corner
function galix(P, kit, x, y, z, s) {
  const { cylZ, box } = kit;
  // r1: tubes enlarged + darkened on a visible mount wedge — the old
  // scheme-painted stubs vanished into the wall ("GALIX splays missing").
  P.add('turret', box(0.10, 0.34, 0.72), x - s * 0.02, y - 0.06, z + 0.05, 0, s * 0.5, 0);
  for (let k = 0; k < 5; k++) {
    P.add('turretDark', cylZ(0.052, 0.26, 8), x + s * k * 0.02, y, z + 0.3 - k * 0.14,
      -0.45, s * (0.9 + k * 0.16), 0);
  }
  for (let k = 0; k < 4; k++) {
    P.add('turretDark', cylZ(0.052, 0.26, 8), x - s * 0.06, y - 0.17, z + 0.24 - k * 0.14,
      -0.35, s * (1.0 + k * 0.16), 0);
  }
}


// ---------------------------------------------------------------------------
// §C missing-side winding guard (BUILD-STANDARD: every profile that mirrors
// slabs binds through one) — face-outwardness census, re-orders reversed
// rings. Same device as modern3.js/misc.js. KIT deref at call time only.
// ---------------------------------------------------------------------------
function orientedSlab99(b0, b1, b2, b3, t0, t1, t2, t3) {
  const c8 = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c8.reduce((s, p) => s + p[k], 0) / 8);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2],
    [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4);
    if (dot(n, sub(fc, cen)) > 0) outward++;
  }
  return outward >= 3
    ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

// §B3.1 MUZZLE BORE (owner directive 2026-08-06) — same device as
// modern3.js muzzleBore: open outer wall to the face + inward-facing
// recess funnel + near-black bore disc ~3cm inside; mask-neutral, no
// see-through. Caller ends its capped tube ~4.2cm short of faceZ.
function muzzleBore99(P, faceZ, R, boreR, seg = 14, rearR) {
  const { cylY, cylZ, torus, xform } = KIT;
  P.add('gun', xform(cylY(R, rearR ?? R, 0.042, seg, true), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, faceZ - 0.021);
  P.add('gunDark', xform(cylY(R - 0.003, boreR, 0.040, seg, true), 0, 0, 0, Math.PI / 2, 0, 0, [-1, 1, 1]), 0, 0, faceZ - 0.0215);
  P.add('gun', torus(R - 0.002, 0.0045, seg), 0, 0, faceZ - 0.001, -Math.PI / 2, 0, 0);
  P.add('gunDark', cylZ(boreR, 0.008, seg), 0, 0, faceZ - 0.034);
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
function buildType99A(P) {
  const { box, frustum, polyMultiLoft, cylY, cylX, cylZ, torus,
    buildGun, buildRunningGear, fenders, liftEye, periscope,
    smokeCluster, stowage, tarpRoll, ammoCan } = KIT;
  const slab = orientedSlab99;                                                  // §C missing-side law
  const { rng } = P;
  const D2R = Math.PI / 180;
  const num = P.spec.visual.number || '';
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
  P.add('hull', slab(
    [1.08, 1.50, 2.90], [1.70, 1.50, 2.90], [1.70, 1.47, 1.84], [1.08, 1.47, 1.84],
    [1.08, 1.56, 3.02], [1.70, 1.56, 3.02], [1.70, 1.68, 2.02], [1.08, 1.68, 2.02]));
  P.add('hull', slab(
    [-1.70, 1.50, 2.90], [-1.08, 1.50, 2.90], [-1.08, 1.47, 1.84], [-1.70, 1.47, 1.84],
    [-1.70, 1.56, 3.02], [-1.08, 1.56, 3.02], [-1.08, 1.68, 2.02], [-1.70, 1.68, 2.02]));
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
    const rearCable = FITTINGS.towCable({ mats: P.mats, r: 0.024, seed: 12,
      pts: [
        [-0.84, 1.55, -3.52], [-0.67, 1.61, -3.82], [-0.34, 1.58, -4.10],
        [0, 1.48, -4.24], [0.34, 1.58, -4.10], [0.67, 1.61, -3.82],
        [0.84, 1.55, -3.52],
      ] });
    P.hullG.add(rearCable);
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
    const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, r: 0.045, rake: -0.28, seed: 5 + s });
    lc.position.set(s * 0.88, 1.33, 2.78);
    P.hullG.add(lc);
    P.add('hullDetail', box(0.26, 0.03, 0.03), s * 0.88, 1.39, 2.72, -16.3 * D2R, 0, 0); // guard bar hugging the pods
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.020, seed: 11,
      pts: [[1.30, 1.52, 2.95], [0.55, 1.58, 2.28], [-0.45, 1.56, 2.55]] });   // draped above the terminal course
    P.hullG.add(tc);
  }
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
    P.add('hullShadow', box(0.50, 0.026, 6.9), s * 1.44, 1.325, -0.08);        // shadow receiver remains above the native return run
  }
  liftEye(P, 'hullDetail', -1.30, 1.52, 1.70);
  liftEye(P, 'hullDetail', 1.30, 1.52, 1.70);
  liftEye(P, 'hullDetail', -1.30, 1.80, -3.05);
  liftEye(P, 'hullDetail', 1.30, 1.80, -3.05);
  // ---- SKIRTS at the ±1.85 anchor (§D guard, print faces ±1.85): deep
  // panel run (print skirt band y 0.39..1.47), FULL-DEPTH FY-4 TILE WALL
  // over the front two-thirds (print tile band y 0.47..1.34 z -2.06..2.70,
  // armor-linked bricks — faces ±1.85 EXACT), rubber rear, bow panels ------
  for (const s of [-1, 1]) {
    P.add('hull', box(0.02, 0.24, 6.40), s * 1.845, 1.345, 0.05);              // skirt top band at the oracle's
                                                                               //   ±1.855 face; inner face 1.835
                                                                               //   clears the native shoe envelope
    P.add('hull', box(0.01, 1.04, 0.56), s * 1.855, 0.94, 3.00);               // deep bow panel (thin outer sheet;
    P.add('hull', box(0.01, 0.35, 0.26), s * 1.855, 1.075, 3.34);              //   inner face clears terminal shoes)
                                                                               //   (drops to the print tip line)
    P.add('hullDark', box(0.01, 0.90, 0.024), s * 1.855, 0.92, 2.73);          // bow panel seam
    P.add('hull', box(0.01, 0.66, 1.49), s * 1.855, 0.84, -2.805);             // source-painted rear skirt run;
                                                                               // only its flexible lower fringe is
                                                                               // dark rubber, not the whole panel
    for (let k = 0; k < 3; k++) P.add('hullDark', box(0.01, 0.56, 0.02), s * 1.855, 0.82, -2.32 - k * 0.52);
    P.add('hullRubber', box(0.01, 0.12, 1.54), s * 1.855, 0.50, -2.85);        // lower fringe
  }
  // Eight full-height FY-4 side cassettes per side.  The previous 3×11 field
  // rendered as a solid Minecraft wall and hid the characteristic six-wheel
  // cadence.  These remain real destructible ERA instances, but the larger
  // unequal panels open the lower wheel arcs and match the reference's broad
  // The full-native 2026 rebuild deliberately reuses this authored hull and
  // track datum, but supplies its own complete turret.  Stop here so no
  // legacy cheek ERA, roof fitting, decal, or direct-group weapon can survive
  // invisibly under (or become fused to) the replacement fighting compartment.
  if (P.__type99HullOnly) return;

  // cassette rhythm.
  const skirtPanels = [
    [2.42, 0.62, 0.60], [1.80, 0.60, 0.58], [1.18, 0.61, 0.61],
    [0.55, 0.62, 0.59], [-0.08, 0.61, 0.62], [-0.71, 0.60, 0.57],
    [-1.33, 0.59, 0.60], [-1.94, 0.56, 0.55],
  ];
  P.eraCluster('skirt_era_R', (put) => {
    for (const [z, depth, height] of skirtPanels)
      put(1.835, 0.91, z, 0, Math.PI / 2, 0, depth / 0.28, height / 0.13, 0.35);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (const [z, depth, height] of skirtPanels)
      put(-1.835, 0.91, z, 0, -Math.PI / 2, 0, depth / 0.28, height / 0.13, 0.35);
  });
  // ---- GLACIS ERA — the DISTINCTIVE ARROW/CHEVRON FIELD on the 16.3-deg
  // plane (owner identity headline; §5.29 chevron-tip kinship: the two
  // half-fields angle toward a forward center tip). Dark mounting bed
  // first (t14 r5 lesson — tile gaps read as recessed seams). -------------
  const zOf = (y) => 2.02 + (1.50 - y) / 0.284 + 0.045;                        // plane + 4.5 cm proud
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.42, 0.64, 0.02), s * 0.76, 1.33, zOf(1.33) - 0.035, -73.7 * D2R, 0, 0);
  }
  const chevron = (put, s) => {
    // 4 rows x 4 cols per half-field; each column steps FORWARD toward the
    // center line (arrow point) and every tile carries the ±12-deg plan
    // skew — two panels meeting at a tip, not a flat course (§5.29 law)
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const y = 1.41 - r * 0.062;
      const zRow = zOf(y) - 0.012 * c;                                         // chevron sweep toward center
      put(s * (0.22 + c * 0.315), y, zRow + (3 - c) * 0.052, -73.7 * D2R, s * 12 * D2R, 0);
    }
  };
  P.eraCluster('glacis_era_R', (put) => chevron(put, 1));
  P.eraCluster('glacis_era_L', (put) => chevron(put, -1));
  // number plates on the skirt TOP BAND (face 1.84 + 5 mm = 1.845, INSIDE
  // the ±1.85 tile anchor — §D decal-float law: the tile faces own the
  // width; a proud decal would set the harness scale factor)
  P.decal('hull', 'number', num, 0.22, [1.845, 1.345, 1.60], Math.PI / 2);
  P.decal('hull', 'number', num, 0.22, [-1.845, 1.345, 1.60], -Math.PI / 2);
  P.topY = 1.40;

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
  const cheekEra = (put, s) => {
    for (const v of [0.30, 0.68]) for (let c = 0; c < 4; c++) {
      const u = 0.10 + c * 0.185;
      put(s * (0.42 + 0.94 * u + 0.72 * 0.04), 1.47 + 0.87 * v + 0.10 * 0.04,
        1.66 - 1.01 * u - 0.26 * v + 0.69 * 0.04, -0.10, s * 0.78, 0);
    }
  };
  P.eraCluster('turret_era_R', (put) => cheekEra(put, 1), true);
  P.eraCluster('turret_era_L', (put) => cheekEra(put, -1), true);
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
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'dark', scale: 1.08, ammo: true,
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

// Type 99A2 native reference-guided rebuild (2026-08-11). The supplied
// Armored Warfare GLB is a local measurement/visual oracle only: no reference
// mesh, texture, animation, or payload ships. This connected procedural
// assembly replaces the old tall print-block stack with the source's low
// arrowhead turret, broad segmented skirts and supported open bustle while
// retaining the fleet-native six-wheel linked-track system.
function buildType99AOwnerRedesign2026(P) {
  const {
    box, slab, polyLoft, cylY, cylZ, torus, buildGun, buildRunningGear,
    fenders, headlight, periscope, smokeCluster, liftEye,
  } = KIT;
  const seg = P.q ? 20 : 14;
  const outward = (geometry) => {
    // KIT.slab is non-indexed. Swap each triangle's second/third vertices
    // (and matching UVs) when a measured ring was authored in reverse plan
    // order; geometry stays byte-for-position identical while FrontSide
    // rendering and signed volume become outward-facing.
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (name === 'normal') continue;
      const a = attribute.array;
      const n = attribute.itemSize;
      for (let i = 0; i < attribute.count; i += 3) {
        for (let k = 0; k < n; k++) {
          const t = a[(i + 1) * n + k];
          a[(i + 1) * n + k] = a[(i + 2) * n + k];
          a[(i + 2) * n + k] = t;
        }
      }
      attribute.needsUpdate = true;
    }
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    return geometry;
  };

  // Native Type-99A six-station running gear. Donor wheels/tracks are never
  // imported; the single course stays exposed beneath the shallow skirts.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.48, wheelW: 0.25, wheelY: 0.55, xc: 1.46,
    dishR: 0.76, wheelHex: '#4b523c',
    wheelZs: [2.16, 1.33, 0.50, -0.33, -1.16, -1.99],
    sprocket: { z: -2.94, y: 0.69, r: 0.40 },
    idler: { z: 2.94, y: 0.65, r: 0.37 },
    rollers: [1.58, 0.16, -1.27].map((z) => ({ z, y: 1.16, r: 0.08 })),
    trackW: 0.63, topY: 1.27, arms: true, paintedEnds: true,
    coveredTop: 0.86, contactZR: -2.34,
  });

  // Low hull pan and a long, shallow upper body. The center spine stays
  // inboard of the track lanes; slim sponsons bridge to the skirt rails.
  P.add('hull', box(2.18, 0.72, 6.86), 0, 0.76, -0.18);
  P.add('hull', box(3.34, 0.28, 4.02), 0, 1.30, -0.62);
  P.add('hull', box(3.34, 0.34, 2.18), 0, 1.33, -2.56);
  P.add('hull', cylY(0.91, 0.91, 0.065, seg), 0, 1.405, 0.18);
  fenders(P, 1.67, 1.84, 1.42, -3.57, 3.46, 0.03);

  // Single long glacis course and compact lower nose. The old tile blanket
  // is deliberately gone: the source reads as broad arrow planes, not a
  // 3x11 wall of small reactive bricks.
  P.add('hull', outward(slab(
    [-1.67, 1.42, 1.38], [1.67, 1.42, 1.38], [1.67, 1.35, 1.18], [-1.67, 1.35, 1.18],
    [-1.06, 1.02, 3.42], [1.06, 1.02, 3.42], [1.06, 0.92, 3.25], [-1.06, 0.92, 3.25])));
  P.add('hull', slab(
    [-1.06, 0.52, 3.53], [1.06, 0.52, 3.53], [1.06, 0.48, 3.34], [-1.06, 0.48, 3.34],
    [-1.06, 1.02, 3.42], [1.06, 1.02, 3.42], [1.06, 0.92, 3.25], [-1.06, 0.92, 3.25]));
  for (const side of [-1, 1]) {
    const shoulder = slab(
      [side * 1.06, 1.20, 3.25], [side * 1.68, 1.20, 3.16],
      [side * 1.68, 1.20, 2.85], [side * 1.06, 1.20, 3.06],
      [side * 1.06, 1.29, 3.42], [side * 1.68, 1.34, 3.20],
      [side * 1.68, 1.30, 2.82], [side * 1.06, 1.29, 3.18]);
    P.add('hull', side < 0 ? outward(shoulder) : shoulder);
    P.add('hullRubber', box(0.54, 0.46, 0.035), side * 1.46, 0.89, 3.62);
    P.add('hullDetail', box(0.07, 0.12, 0.28), side * 1.48, 1.16, 3.49);
    // The guard bridge closes the tiny top-down pocket between the raised
    // shoulder and mud flap while staying above the idler/shoe envelope.
    P.add('hullDetail', box(0.18, 0.035, 0.34), side * 1.39, 1.215, 3.49);
  }

  // Broad six-bay side modules reproduce the source's shallow plate cadence
  // while leaving the lower wheel arcs readable. Every plate meets the
  // continuous upper rail; rear bays transition to flexible rubber.
  const skirtZ = [2.58, 1.64, 0.70, -0.24, -1.18, -2.12];
  for (const side of [-1, 1]) {
  // Raised fixed engine-deck cassette beneath the turret's aft undercut.
  // The source carries a real hull-owned volume here; keeping it separate
  // preserves a clean yaw reveal instead of fusing the bustle to the hull.
  P.add('hull', box(3.20, 0.34, 3.12), 0, 1.65, -2.00);
  P.add('hullDark', box(2.94, 0.020, 2.86), 0, 1.83, -2.00);
    P.add('hull', box(0.07, 0.18, 6.72), side * 1.80, 1.35, -0.10);
    skirtZ.forEach((z, i) => {
      const material = i < 4 ? 'hull' : 'hullRubber';
      const zf = z + 0.43, zr = z - 0.43;
      const inner = side * 1.78, outer = side * 1.84;
      const panel = slab(
        [inner, 1.37, zf], [inner, 1.37, zr], [inner, 0.81 + (i % 2) * 0.04, zr], [inner, 0.72, z],
        [outer, 1.37, zf], [outer, 1.37, zr], [outer, 0.81 + (i % 2) * 0.04, zr], [outer, 0.72, z]);
  P.add('hullDetail', box(3.02, 0.045, 0.045), 0, 1.70, -3.98);
      P.add(material, side < 0 ? outward(panel) : panel);
    P.add('hullDetail', box(0.045, 0.045, 0.42), side * 1.49, 1.70, -3.78);
      P.add('hullDark', box(0.068, 0.025, 0.78), side * 1.845, 1.31, z);
      for (const dz of [-0.28, 0, 0.28]) {
        P.add('hullDetail', cylZ(0.022, 0.014, 8), side * 1.878, 1.24, z + dz,
          0, side * Math.PI / 2, 0);
      }
    });
    P.add('hullShadow', box(0.42, 0.026, 6.58), side * 1.45, 1.25, -0.10);
  }

  // Glacis arrow seams, driver station, lights and physically routed cable.
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(1.13, 0.045, 0.065), side * 0.56, 1.28, 2.22,
      -0.18, side * 0.30, 0);
    const light = FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.045, rake: -0.22, seed: 10 + side,
    });
    light.position.set(side * 0.92, 1.15, 3.00);
    P.hullG.add(light);
    headlight(P, side * 1.03, 1.12, 3.08, -0.24, 0.045);
  }
  P.add('hull', box(0.52, 0.055, 0.44), 0, 1.405, 1.72, -0.18, 0, 0);
  for (const x of [-0.16, 0.16]) periscope(P, 'hullDetail', x, 1.45, 1.52);
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, r: 0.021, seed: 31,
      pts: [[-1.22, 1.10, 3.10], [-0.45, 1.31, 2.20], [0.52, 1.29, 2.16], [1.22, 1.10, 3.10]],
    });
    P.hullG.add(cable);
  }

  // Low engine deck and source-like full-width service transom.
  P.add('hullDark', box(2.72, 0.025, 1.48), 0, 1.515, -2.38);
  for (let i = 0; i < 8; i++) {
    P.add('hullDetail', box(2.58, 0.026, 0.052), 0, 1.845, -1.82 - i * 0.17);
  }
  P.add('hull', box(3.30, 1.00, 0.12), 0, 1.28, -3.59);
  P.add('hullDark', box(2.34, 0.55, 0.035), 0, 1.42, -3.66);
  for (let i = 0; i < 9; i++) {
    P.add('hullDetail', box(0.035, 0.48, 0.04), -1.08 + i * 0.27, 1.42, -3.685);
  }
  for (const side of [-1, 1]) {
    P.add('hullRubber', box(0.54, 0.48, 0.03), side * 1.47, 0.82, -3.72);
    P.add('hullDetail', torus(0.105, 0.022, 12), side * 0.72, 0.88, -3.69,
      Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', side * 1.25, 1.48, -3.26);
  }

  // One connected low welded shell. Long swept cheeks and clipped aft
  // shoulders establish the source's arrowhead plan without stacked tiers.
  const plan = [
    [0.00, 1.14], [0.38, 1.08], [1.05, 0.60], [1.52, 0.18],
    [1.64, -0.20], [1.62, -0.82], [1.58, -1.34], [1.42, -1.66],
    [1.05, -1.80], [-1.05, -1.80], [-1.42, -1.66], [-1.58, -1.34],
    [-1.62, -0.82], [-1.64, -0.20],
    [-1.52, 0.18], [-1.05, 0.60], [-0.38, 1.08],
  ];
  const crown = [0.58, 0.62, 0.66, 0.69, 0.70, 0.69, 0.66, 0.62, 0.58,
    0.58, 0.62, 0.66, 0.69, 0.70, 0.69, 0.66, 0.62];
  const inset = [0.76, 0.79, 0.84, 0.89, 0.91, 0.92, 0.92, 0.90, 0.88,
    0.88, 0.90, 0.92, 0.92, 0.91, 0.89, 0.84, 0.79];
  P.add('turret', polyLoft(plan, 0.035, crown, inset));

  // Broad cheek armor is integral to the primary mass, not a floating ERA
  // curtain. Upper lips land back into the crown and frame a compact gun well.
  for (const side of [-1, 1]) {
    const cheek = slab(
      [side * 0.20, 0.11, 1.12], [side * 1.58, 0.11, 0.18],
      [side * 1.58, 0.11, -0.16], [side * 0.20, 0.11, 0.52],
      [side * 0.20, 0.58, 0.96], [side * 1.47, 0.64, 0.10],
      [side * 1.47, 0.55, -0.20], [side * 0.20, 0.50, 0.44]);
    P.add('turret', side < 0 ? outward(cheek) : cheek);
    P.add('turretDetail', box(1.22, 0.026, 0.04), side * 0.92, 0.64, 0.42,
      0, side * 0.42, 0);
    smokeCluster(P, side * 1.43, 0.42, 0.06, 6, side * 0.44, 0.45);
    P.add('turret', box(0.16, 0.28, 0.66), side * 1.55, 0.38, -0.76);
    P.add('turretDark', box(0.17, 0.02, 0.60), side * 1.55, 0.53, -0.76);
  }
  P.add('turretDark', box(0.44, 0.30, 0.07), 0, 0.28, 0.91);

  // Dense, low roof plan: unequal hatch wells, periscope cadence, compact
  // gunner sight and panoramic commander station, all on explicit seats.
  P.add('turret', cylY(0.31, 0.31, 0.055, seg), 0.48, 0.715, -0.40);
  P.add('turretDark', torus(0.31, 0.014, seg), 0.48, 0.74, -0.40);
  P.add('turret', cylY(0.27, 0.27, 0.050, seg), -0.48, 0.705, -0.46);
  P.add('turretDark', torus(0.27, 0.014, seg), -0.48, 0.73, -0.46);
  for (const [x, z, r] of [
    [0.78, -0.18, 0.12], [0.63, 0.02, 0.28], [0.35, 0.09, 0.46],
    [-0.76, -0.19, -0.15], [-0.62, 0.01, -0.28], [-0.34, 0.10, -0.45],
  ]) periscope(P, 'turretDetail', x, 0.735, z, r);
  P.add('turret', box(0.40, 0.18, 0.32), 0.82, 0.76, -0.02);
  P.add('turretDark', box(0.30, 0.10, 0.035), 0.82, 0.78, 0.15);
  P.add('turretGlass', box(0.24, 0.065, 0.018), 0.82, 0.78, 0.17);
  P.add('turretDetail', cylY(0.085, 0.10, 0.15, 12), -0.34, 0.78, -0.79);
  P.add('turretDark', cylY(0.15, 0.15, 0.18, 12), -0.34, 0.94, -0.79);
  P.add('turretGlass', box(0.15, 0.075, 0.02), -0.34, 0.96, -0.64);
  // Raised gunner's day/thermal station and the source's clustered roof
  // cadence. The tower is compact in plan and grows from a broad buried
  // seat; the small housings break up the former empty crown without
  // becoming another dominant cabinet.
  P.add('turret', box(0.34, 0.12, 0.34), 0.72, 0.74, -0.66);
  P.add('turret', box(0.29, 0.30, 0.28), 0.72, 0.95, -0.66);
  P.add('turretDark', box(0.22, 0.12, 0.035), 0.72, 0.98, -0.50);
  P.add('turretGlass', box(0.16, 0.075, 0.018), 0.72, 0.98, -0.48);
  P.add('turretDetail', box(0.36, 0.035, 0.31), 0.72, 1.12, -0.66);
  for (const [x, z, w, d] of [
    [-0.92, -0.16, 0.24, 0.18], [-0.80, -0.58, 0.22, 0.20],
    [0.10, -0.83, 0.20, 0.18], [0.98, -0.95, 0.22, 0.19],
  ]) {
    P.add('turret', box(w, 0.065, d), x, 0.735, z);
    P.add('turretDark', box(w * 0.72, 0.025, d * 0.72), x, 0.775, z);
  }
  P.add('turretDetail', cylY(0.030, 0.040, 0.28, 10), 0.26, 0.88, -0.96);
  P.add('turretDark', box(0.15, 0.030, 0.030), 0.26, 1.03, -0.96);

  // Supported open bustle: backing closes false sky-through while the
  // stepped rails and returns preserve the source's full-width slat read.
  P.add('turretDark', box(3.02, 0.52, 0.040), 0, 0.48, -2.08);
  for (const y of [0.25, 0.39, 0.53, 0.67, 0.79]) {
    P.add('turretDetail', box(3.16, 0.035, 0.045), 0, y, -2.12);
  }
  for (let i = 0; i < 10; i++) {
    P.add('turretDetail', box(0.030, 0.58, 0.045), -1.42 + i * 0.315, 0.51, -2.12);
  }
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.045, 0.045, 0.62), side * 1.58, 0.79, -1.81);
    P.add('turretDetail', box(0.045, 0.045, 0.62), side * 1.58, 0.25, -1.81);
    P.add('turretDetail', box(0.045, 0.56, 0.045), side * 1.58, 0.51, -1.51);
  }

  // Source roof weapon and mast cadence. Each fitting starts on a physical
  // cupola/plinth; antennas end in visible collars and stay turret-owned.
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'dark', scale: 0.78, ammo: true,
      elev: 0, rotation: [0, 0, 0], seed: 38,
    });
    mg.position.set(0.48, 0.75, -0.42);
    P.turretG.add(mg);
    for (const [x, z, h, seed] of [
      [-1.14, -1.27, 0.92, 41], [0.98, -1.30, 0.72, 42], [0.18, -1.05, 0.52, 43],
    ]) {
      P.add('turretDetail', cylY(0.035, 0.045, 0.055, 10), x, 0.72, z);
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed });
      whip.position.set(x, 0.75, z);
      P.turretG.add(whip);
    }
  }
  P.decal('turret', 'number', P.spec.visual.number || '211', 0.28,
    [1.625, 0.36, -0.60], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '211', 0.28,
    [-1.625, 0.36, -0.60], -Math.PI / 2);

  // Compact annular gun tunnel blended into the arrow cheeks, followed by
  // the ZPT-98 tube. All carriers are round; firing and muzzle anchors stay
  // on the authored bore axis.
  P.addGunExtra(cylZ(0.25, 0.18, seg), 0, 0, 0.26);
  P.addGunExtra(cylZ(0.205, 0.30, seg, 0.25), 0, 0, 0.50);
  P.addGunExtraDark(torus(0.19, 0.025, seg), 0, 0, 0.66);
  buildGun(P, { len: 6.30, r: 0.082, sleeve: true, evac: 0.53, baseR: 0.17, evacR: 1.30 });
  muzzleBore99(P, 6.34, 0.082, 0.047, 14);
  P.muzzleZ = 6.34;
  P.topY = 0.80;
}

// First-party Type 99A hull/running-gear datum used by the complete rebuild.
// The comparison GLB supplies measurements only.  This is a new connected
// construction: one tapered lower pan between the native tracks, shallow
// sponsons over six large wheels, a two-plane prow and a stepped powerpack
// deck.  It deliberately does not reuse either legacy Type 99 hull.
function buildType99AHullNative2026(P) {
  const {
    box, polyLoft, buildRunningGear, fenders, cylY, torus,
    periscope, liftEye,
  } = KIT;
  const slab = orientedSlab99;
  const seg = P.q ? 20 : 14;

  // One fleet-native linked course around the Type 99's six close road-wheel
  // stations.  The larger dished faces fill the course, while the raised end
  // wheels produce the characteristic short, steep terminal climbs.
  // The isolated reference course measures six primary centers on a
  // 0.901 m cadence and reaches much farther into both terminal wraps than
  // the first native pass.  Keep one authored linked course, but use that
  // measured mechanical datum instead of the former short T-72-like span.
  const wheelZs = [2.238, 1.337, 0.436, -0.464, -1.365, -2.266];
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.405, wheelW: 0.24, wheelY: 0.4905, xc: 1.46,
    dishR: 0.76, wheelHex: '#394234', wheelZs,
    // The source track envelope ends at +3.402 / -3.441 m.  The native
    // loop adds its own 45 mm radial band clearance, so these are pitch
    // centres, not the visible end coordinates.  The former ±3.4 centres
    // made both terminal wraps roughly 30 cm too long.
    sprocket: { z: -3.126, y: 0.80, r: 0.27 },
    idler: { z: 3.107, y: 0.82, r: 0.25 },
    rollers: [1.60, 0.15, -1.30].map((z) => ({ z, y: 1.14, r: 0.08 })),
    trackW: 0.63, topY: 1.27, botY: 0.04, arms: true,
    paintedEnds: true, coveredTop: true, contactZR: -2.40,
  });

  // Recessed suspension wall.  It sits inboard of the wheel backs with a
  // real 10 mm clearance and joins the central pan above/below, so the six
  // wheels remain independent assemblies instead of reading as discs hung
  // over open sky.  The dark finish keeps the wheel/tire silhouettes clear.
  for (const side of [-1, 1]) {
    P.add('hullShadow', box(0.080, 1.00, 5.42), side * 1.275, 0.55, 0.02);
    P.add('hullDark', box(0.035, 0.12, 5.52), side * 1.318, 1.00, 0.02);
  }

  // Tapered pan: narrow at both terminal wraps, full only through the wheel
  // span.  Its floor and shoulders stay inside the shoe corridors.
  P.add('hull', polyLoft([
    [-1.03, 3.52], [1.03, 3.52], [1.15, 2.34], [1.10, -3.10],
    [0.94, -3.52], [-0.94, -3.52], [-1.10, -3.10], [-1.15, 2.34],
  ], 0.30, 1.13, 0.985));

  // Low forward sponson and raised powerpack are separate hull courses, not
  // an IFV-like full-height box.  The ramp makes the rear height change read
  // as engine architecture rather than a second hull stacked on the first.
  P.add('hull', box(3.18, 0.15, 3.18), 0, 1.355, 0.40);
  P.add('hull', slab(
    [-1.67, 1.30, -1.21], [1.67, 1.30, -1.21], [1.67, 1.30, -1.48], [-1.67, 1.30, -1.48],
    [-1.67, 1.47, -1.21], [1.67, 1.47, -1.21], [1.67, 1.70, -1.48], [-1.67, 1.70, -1.48]));
  P.add('hull', box(3.18, 0.22, 2.60), 0, 1.52, -2.21);
  P.add('hull', cylY(0.86, 0.86, 0.060, seg), 0, 1.40, 0.18);
  fenders(P, 1.60, 1.77, 1.40, -3.54, 3.56, 0.028);

  // Broad upper glacis and a narrower folded lower prow.  Thin shoulder
  // bridges continue the plane over the idler upruns while leaving the live
  // terminal shoe lanes open underneath.
  P.add('hull', slab(
    [-1.04, 1.18, 3.08], [1.04, 1.18, 3.08], [1.04, 1.13, 2.90], [-1.04, 1.13, 2.90],
    [-1.08, 1.47, 1.96], [1.08, 1.47, 1.96], [1.08, 1.43, 1.78], [-1.08, 1.43, 1.78]));
  P.add('hull', slab(
    [-0.86, 0.52, 3.48], [0.86, 0.52, 3.48], [0.90, 0.48, 3.31], [-0.90, 0.48, 3.31],
    [-1.04, 1.18, 3.08], [1.04, 1.18, 3.08], [1.04, 1.11, 2.94], [-1.04, 1.11, 2.94]));
  for (const side of [-1, 1]) {
    const i = side * 1.08, o = side * 1.60;
    P.add('hull', slab(
      [i, 1.44, 3.17], [o, 1.44, 3.05], [o, 1.44, 1.86], [i, 1.44, 1.82],
      [i, 1.50, 3.09], [o, 1.50, 2.98], [o, 1.50, 1.80], [i, 1.50, 1.76]));
    // Compact flexible guards leave the terminal link face and round end
    // wheel readable in the cardinal views.  The earlier broad rectangles
    // looked like solid armor plates pasted across the track course.
    P.add('hullRubber', box(0.28, 0.22, 0.028), side * 1.46, 0.84, 3.55);
    P.add('hullDetail', box(0.08, 0.10, 0.26), side * 1.43, 1.25, 3.43);
  }

  // Six shallow side modules: their upper rails hide the return run, but the
  // lower hem stops above each wheel center so all six tire/dish assemblies
  // remain individually readable.  Rear modules soften into rubber.
  const skirtZs = [2.42, 1.48, 0.54, -0.40, -1.34, -2.28];
  for (const side of [-1, 1]) {
    // The real vehicle's upper side is a canted shoulder with a shallow
    // segmented apron below it, not a vertical cabinet.  This buried rail
    // carries every panel while the lower hem exposes only the lower wheel
    // arcs and the dark linked course.
    P.add('hull', slab(
      [side * 1.54, 1.34, 3.05], [side * 1.78, 1.26, 3.05],
      [side * 1.78, 1.26, -3.12], [side * 1.54, 1.34, -3.12],
      [side * 1.54, 1.43, 3.05], [side * 1.78, 1.35, 3.05],
      [side * 1.78, 1.35, -3.12], [side * 1.54, 1.43, -3.12]));
    skirtZs.forEach((z, index) => {
      const h = index < 4 ? 0.65 : 0.60;
      const y = index < 4 ? 0.995 : 0.98;
      P.add(index < 4 ? 'hull' : 'hullRubber', box(0.048, h, 0.86),
        side * 1.825, y, z);
      P.add('hullDark', box(0.052, 0.026, 0.78), side * 1.854, y + h * 0.46, z);
      P.add('hullDetail', box(0.054, 0.020, 0.050), side * 1.858, y + 0.10, z - 0.28);
      P.add('hullDetail', box(0.054, 0.020, 0.050), side * 1.858, y + 0.10, z + 0.28);
    });
    P.add('hullShadow', box(0.34, 0.022, 6.30), side * 1.44, 1.24, -0.02);
    // Flexible aft return between the sixth primary bay and the now-correct
    // rear terminal.  It is carried by the same canted rail and leaves the
    // sprocket/shoe transition visible below.
    P.add('hullRubber', box(0.048, 0.52, 0.92), side * 1.825, 0.94, -3.20);
    P.add('hullDark', box(0.052, 0.026, 0.82), side * 1.854, 1.18, -3.20);
  }

  // Coarse armor groups retain gameplay coupling without recreating the old
  // 3x11 decorative tile wall.  Each logical ERA cell coincides with one of
  // the authored broad side or glacis panels.
  P.eraCluster('skirt_era_R', (put) => {
    for (const z of skirtZs.slice(0, 4)) put(1.825, 1.10, z, 0, Math.PI / 2, 0, 3.0, 3.7, 1);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (const z of skirtZs.slice(0, 4)) put(-1.825, 1.10, z, 0, -Math.PI / 2, 0, 3.0, 3.7, 1);
  });
  const glacisCells = (put, side) => {
    for (let c = 0; c < 4; c++) {
      put(side * (0.23 + c * 0.34), 1.30 - c * 0.018, 2.49 + (3 - c) * 0.055,
        -0.28, side * 0.20, 0, 1.15, 1.4, 1);
    }
  };
  P.eraCluster('glacis_era_R', (put) => glacisCells(put, 1));
  P.eraCluster('glacis_era_L', (put) => glacisCells(put, -1));

  // Driver and bow service cadence, all seated directly on the upper plane.
  P.add('hull', box(0.50, 0.055, 0.42), 0, 1.44, 1.73, -0.20, 0, 0);
  for (const x of [-0.16, 0.16]) periscope(P, 'hullDetail', x, 1.48, 1.53);
  for (const side of [-1, 1]) {
    const lights = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.13, r: 0.046, rake: -0.22, seed: 51 + side });
    lights.position.set(side * 0.93, 1.20, 2.98);
    P.hullG.add(lights);
    P.add('hullDetail', box(0.30, 0.035, 0.035), side * 0.93, 1.28, 2.93, -0.20, 0, 0);
  }
  {
    const cable = FITTINGS.towCable({ mats: P.mats, r: 0.020, seed: 53,
      pts: [[-1.12, 1.46, 2.92], [-0.45, 1.49, 2.18], [0.48, 1.47, 2.20], [1.12, 1.46, 2.92]] });
    P.hullG.add(cable);
  }

  // Raised engine deck and dense backed transom.  Unequal louvre banks,
  // recovery points, lamps and the strapped log replace the old blank slab.
  P.add('hullDark', box(2.76, 0.025, 1.92), 0, 1.715, -2.55);
  for (let i = 0; i < 10; i++) P.add('hullDetail', box(2.58, 0.025, 0.052), 0, 1.73, -1.78 - i * 0.17);
  // Split transom: the structural center remains between the tracks; its
  // outboard service shoulders begin above the rear shoe crest.  A single
  // full-width slab here intersected twelve real shoes even though the
  // smooth-band proxy missed the contact.
  P.add('hull', box(2.22, 0.82, 0.12), 0, 1.25, -3.52);
  for (const side of [-1, 1]) {
    P.add('hull', box(0.50, 0.50, 0.12), side * 1.39, 1.41, -3.52);
    P.add('hullDetail', box(0.10, 0.12, 0.18), side * 1.12, 1.20, -3.47);
  }
  for (const [x, w, rows] of [[-0.82, 1.12, 5], [0.62, 1.44, 6]]) {
    P.add('hullDark', box(w, 0.46, 0.035), x, 1.34, -3.59);
    for (let i = 0; i < rows; i++) P.add('hullDetail', box(w * 0.92, 0.030, 0.040), x, 1.17 + i * (0.34 / (rows - 1)), -3.615);
  }
  for (const side of [-1, 1]) {
    P.add('hullRubber', box(0.30, 0.28, 0.030), side * 1.47, 0.84, -3.65);
    P.add('hullDetail', torus(0.105, 0.022, 12), side * 0.70, 0.90, -3.62, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.13, 0.075, 0.045), side * 1.43, 1.52, -3.61);
    liftEye(P, 'hullDetail', side * 1.23, 1.51, -3.25);
  }
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 1.88, r: 0.105, straps: 3, seed: 55 });
    log.position.set(0, 1.67, -3.71);
    P.hullG.add(log);
  }
  // The source's published hull datum includes the broad U-shaped rear tow
  // cable, not an artificially long transom.  Endpoints are carried by the
  // rear service plate; the loop itself supplies the measured -4.24 m aft
  // extremum while leaving the track wrap compact and mechanically honest.
  {
    // Shallow recovery tray under the U-cable.  The source carries this loop
    // against backed rear-deck structure; leaving background beneath it made
    // a five-cell plan-view sky pocket even though both cable ends were
    // attached.  The tray overlaps the transom, stays above the shoe crest
    // and gives the cable a continuous service load path.
    P.add('hull', box(1.72, 0.040, 0.36), 0, 1.46, -3.70);
    const rearCable = FITTINGS.towCable({ mats: P.mats, r: 0.024, seed: 56,
      pts: [
        [-0.84, 1.58, -3.52], [-0.62, 1.64, -3.70], [-0.30, 1.62, -3.88],
        [0, 1.50, -3.94], [0.30, 1.62, -3.88], [0.62, 1.64, -3.70],
        [0.84, 1.58, -3.52],
      ] });
    P.hullG.add(rearCable);
  }
  P.topY = 1.45;
}

// Complete native upper-assembly replacement. The earlier arrowhead pass
// established the correct hull datum but flattened the Type 99's distinctive
// tall welded rear body. This builder deliberately keeps only that authored
// hull/running gear, clears every old turret/gun bucket and rebuilds the
// fighting compartment from measured section envelopes using our primitives.
function buildType99AFullNativeRebuild2026(P) {
  // Preserve the earlier authored two-plane hull and measured six-wheel
  // course.  The later OwnerRedesign hull enlarged the wheels and stacked a
  // tall engine cassette/side wall, which produced an IFV-like stance even
  // though its aggregate silhouette score was high.
  buildType99AHullNative2026(P);
  const {
    box, slab, polyLoft, frustum, cylY, cylZ, torus, buildGun,
    periscope, smokeCluster,
  } = KIT;
  const seg = P.q ? 20 : 14;

  P.postAssemble = null;
  P.clear(
    'turret', 'turretDetail', 'turretDark', 'turretGlass', 'turretCloth', 'turretTrack',
    'gun', 'gunDark', 'gunMount', 'gunMountDark',
  );
  for (const child of [...P.turretG.children]) {
    if (child === P.gunG) continue;
    P.turretG.remove(child);
    child.traverse((object) => object.geometry?.dispose?.());
  }

  // One broad, low welded body.  The reference measurements put the main
  // roof near world y=2.5 and its side floor around y=1.9--2.0: the visual
  // identity comes from plan width and cheek undercut, not from a tall box.
  // The connected loft below is authored topology; the comparison GLB is
  // never imported or converted into runtime geometry.
  const shellPlan = [
    [0.00, 1.54], [0.42, 1.44], [1.02, 1.12], [1.58, 0.42],
    [1.46, -1.22], [1.25, -2.06], [-1.25, -2.06],
    [-1.46, -1.22], [-1.58, 0.42], [-1.02, 1.12], [-0.42, 1.44],
  ];
  const shellBottom = [0.00, 0.00, 0.00, 0.08, 0.20, 0.32, 0.32, 0.20, 0.08, 0.00, 0.00];
  const shellTop = [1.02, 1.05, 1.08, 1.12, 1.11, 1.10, 1.10, 1.11, 1.12, 1.08, 1.05];
  const shellInset = [0.80, 0.80, 0.81, 0.83, 0.86, 0.87, 0.87, 0.86, 0.83, 0.81, 0.80];
  P.add('turret', polyLoft(shellPlan, shellBottom, shellTop, shellInset));

  // Buried cheek laminates strengthen the mantlet transition without
  // becoming a second disconnected shell.  The tips thin and sweep aft into
  // the measured outer shoulder rather than presenting flat square wings.
  P.add('turret', slab(
    [0.16, 0.08, 1.38], [1.72, 0.08, 0.48], [1.72, 0.08, 0.02], [0.16, 0.08, 0.70],
    [0.16, 0.88, 1.28], [1.67, 1.02, 0.42], [1.67, 0.86, -0.02], [0.16, 0.76, 0.64]));
  P.add('turret', slab(
    [-1.72, 0.08, 0.48], [-0.16, 0.08, 1.38], [-0.16, 0.08, 0.70], [-1.72, 0.08, 0.02],
    [-1.67, 1.02, 0.42], [-0.16, 0.88, 1.28], [-0.16, 0.76, 0.64], [-1.67, 0.86, -0.02]));
  P.add('turretDark', box(0.46, 0.24, 0.055), 0, 0.39, 1.28);

  // Shallow, canted protection courses are buried into the continuous side
  // plane.  They articulate the welded armor but stop well short of forming
  // the old full-height cabinet wall.
  for (const side of [-1, 1]) {
    for (const [z, d, y, h, yaw] of [
      [0.18, 0.58, 0.70, 0.38, 0.12], [-0.48, 0.64, 0.73, 0.40, 0.06],
      [-1.20, 0.66, 0.76, 0.38, -0.04], [-1.86, 0.56, 0.80, 0.32, -0.10],
    ]) {
      P.add('turret', box(0.105, h, d), side * 1.56, y, z, 0, side * yaw, side * -0.08);
      P.add('turretDark', box(0.014, h * 0.66, d * 0.84), side * 1.620, y, z,
        0, side * yaw, side * -0.08);
      for (const dz of [-d * 0.32, d * 0.32]) {
        P.add('turretDetail', cylZ(0.017, 0.012, 8), side * 1.632, y + h * 0.25, z + dz,
          0, side * Math.PI / 2, 0);
      }
    }
    P.add('turretDetail', box(1.20, 0.032, 0.044), side * 0.92, 0.76, 0.56,
      0, side * 0.43, 0);
    smokeCluster(P, side * 1.43, 0.48, 0.14, 6, side * 0.50, 0.48);
  }

  // Full-width open bustle grille with deep side returns.  The reference is
  // genuinely open here: transverse ties, corner uprights and the direct
  // shell return carry the rack, so negative space is intentional rather
  // than a missing backing wall.
  for (let i = 0; i < 5; i++) {
    const y = 0.55 + i * 0.105;
    const w = 3.34 - i * 0.035;
    P.add('turretDetail', box(w, 0.030, 0.040), 0, y, -2.10);
  }
  for (let i = 0; i < 9; i++) {
    P.add('turretDetail', box(0.026, 0.44, 0.040), -1.59 + i * (3.18 / 8), 0.76, -2.10);
  }
  for (const side of [-1, 1]) {
    for (const y of [0.56, 0.97]) {
      P.add('turretDetail', box(0.040, 0.040, 0.48), side * 1.68, y, -1.86);
    }
    P.add('turretDetail', box(0.040, 0.43, 0.040), side * 1.68, 0.765, -1.62);
    P.add('turretDetail', box(0.46, 0.036, 0.038), side * 1.45, 0.75, -2.01,
      0, side * -0.36, 0);
  }

  // Source-station roof cadence: two unequal hatch wells, the tall right
  // panoramic housing at its measured footprint, compact periscopes and a
  // cupola-carried QJC-88. Everything begins on a broad armor seat.
  P.add('turret', cylY(0.31, 0.31, 0.060, seg), -0.47, 1.145, -0.42);
  P.add('turretDark', torus(0.31, 0.015, seg), -0.47, 1.175, -0.42);
  P.add('turret', cylY(0.27, 0.27, 0.055, seg), 0.45, 1.145, -0.37);
  P.add('turretDark', torus(0.27, 0.015, seg), 0.45, 1.175, -0.37);
  for (const [x, z, yaw] of [
    [-0.82, -0.16, -0.25], [-0.62, 0.03, -0.38], [-0.31, 0.10, -0.45],
    [0.30, 0.10, 0.45], [0.62, 0.02, 0.36], [0.82, -0.17, 0.22],
  ]) periscope(P, 'turretDetail', x, 1.19, z, yaw);

  // Measured right-offset panoramic station (source x .71..1.20, local
  // y 1.075..1.74, z -.51..-1.02).  A tapered buried plinth replaces the
  // previous 1.3 m cabinet and makes the optical load path explicit.
  P.add('turret', frustum(0.28, -0.61, -1.17, 0.23, -0.66, -1.14, 1.00, 1.18), 0.92, 0, 0);
  // Broad stabilized sight body below a genuinely narrow upper sensor mast.
  // Extending the full 0.52 m housing to 3.69 m made a solid tower in direct
  // rear; the reference reaches that height only through its slim upper head.
  P.add('turret', frustum(0.21, -0.67, -1.13, 0.17, -0.70, -1.10, 1.05, 1.54), 0.92, 0, 0);
  P.add('turretDark', box(0.29, 0.20, 0.028), 0.92, 1.34, -0.695);
  P.add('turretGlass', box(0.20, 0.13, 0.014), 0.92, 1.34, -0.678);
  P.add('turretDetail', box(0.38, 0.032, 0.34), 0.92, 1.57, -0.91);
  P.add('turretDetail', frustum(0.072, -0.82, -1.00, 0.052, -0.84, -0.98, 1.52, 1.82), 0.92, 0, 0);
  P.add('turretDark', box(0.11, 0.13, 0.022), 0.92, 1.69, -0.815);
  P.add('turretGlass', box(0.074, 0.085, 0.012), 0.92, 1.69, -0.802);
  P.add('turretDetail', box(0.16, 0.026, 0.17), 0.92, 1.84, -0.91);

  // Secondary sight and compact roof boxes reproduce the asymmetric station
  // cadence without exceeding the measured panoramic silhouette.
  P.add('turret', frustum(0.20, 0.16, -0.18, 0.16, 0.13, -0.15, 1.02, 1.32), -0.84, 0, 0);
  P.add('turretDark', box(0.27, 0.12, 0.028), -0.84, 1.18, 0.17);
  P.add('turretGlass', box(0.19, 0.075, 0.014), -0.84, 1.18, 0.185);
  for (const [x, z, w, d] of [
    [-0.88, -0.84, 0.28, 0.22], [-0.16, -0.88, 0.24, 0.20],
    [0.40, -0.96, 0.23, 0.18], [1.17, -1.12, 0.22, 0.20],
  ]) {
    P.add('turret', box(w, 0.075, d), x, 1.15, z);
    P.add('turretDark', box(w * 0.72, 0.024, d * 0.68), x, 1.195, z);
  }

  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'dark', scale: 0.82, ammo: true,
      elev: 0.04, rotation: [0, 0, 0], seed: 38,
    });
    mg.position.set(-0.47, 1.19, -0.42);
    P.turretG.add(mg);
  }

  // Measured asymmetric antenna courses: the starboard whip reaches 4.38 m
  // overall and the port whip 3.88 m, both through visible collars.
  for (const [x, z, h, seed] of [
    [1.105, -0.83, 1.42, 41], [-1.08, -1.28, 1.06, 42],
  ]) {
    // The whip assembly already contains its own two-stage base pot.  This
    // buried tapered mast carries that pot from the local roof instead of
    // leaving the complete antenna on a visually disconnected high collar.
    P.add('turretDetail', cylY(0.055, 0.040, 0.36, 10), x, 1.30, z);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed });
    whip.position.set(x, 1.43, z);
    P.turretG.add(whip);
  }
  P.add('turretDetail', cylY(0.030, 0.040, 0.30, 10), -0.06, 1.24, -1.05);
  P.add('turretDark', box(0.18, 0.035, 0.035), -0.06, 1.40, -1.05);

  // Integrated mantlet and source-length ZPT-98, retained on the independent
  // gun rig after the previous upper assembly has been removed.
  P.addGunExtra(box(0.64, 0.54, 0.42), 0, 0, 0.54);
  P.addGunExtra(cylZ(0.24, 0.30, seg, 0.21), 0, 0, 0.86);
  P.addGunExtraDark(torus(0.215, 0.028, seg), 0, 0, 1.02);
  // The source overall is split asymmetrically: a 4.24 m rear hull and a
  // 7.41 m muzzle.  The first native pass accidentally achieved the same
  // total with a short rear hull and overlong tube.  The corrected rear body
  // above permits the true shorter gun run while preserving 11.66 m overall.
  buildGun(P, { len: 7.17, r: 0.108, sleeve: true, evac: 0.53, baseR: 0.18, evacR: 1.22 });
  muzzleBore99(P, 7.21, 0.108, 0.060, 14);
  P.muzzleZ = 7.21;
  P.topY = 1.54;
}

// ---------------------------------------------------------------------------
// Leopard 1A5 — the anti-Tiger: low elegant wedge hull with a long 60 deg
// glacis, welded angular A5 turret with the boxy EMES-18 on the right roof
// and a big rear bin; 7 dished wheels, sprocket rear. Speed IS the armor.
// ---------------------------------------------------------------------------
function buildLeo1A5(P) {
  const { box, frustum, slab, cylY, cylX, cylZ, torus,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope,
    towCable, smokeCluster, stowage, jerryCan, tarpRoll, shovelTool } = KIT;
  const { rng } = P;
  // ---- hull: shallow wedge, long flowing glacis ------------------------------
  P.add('hull', box(2.26, 0.5, 6.7), 0, 0.66, -0.05);                           // lower hull
  P.add('hull', frustum(1.55, 1.55, -3.52, 1.42, 1.5, -3.48, 0.90, 1.30));      // flat deck band
  fenders(P, 1.15, 1.70, 0.885, -3.55, 3.45, 0.03);
  // long 60-deg glacis: one plane from nose lip to deck front
  P.add('hull', frustum(1.55, 3.50, 1.55, 1.58, 1.50, 1.55, 0.68, 1.30));
  P.add('hull', frustum(1.50, 3.22, 3.42, 1.55, 3.50, 3.42, 0.40, 0.68));       // rounded nose lower
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 6.4), s * 1.4, 0.87, -0.05);
  }
  // slight rubber skirt apron with vertical cut lines — wheels stay exposed
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.03, 0.22, 6.3), s * 1.72, 0.80, -0.05);
    for (let k = 0; k < 9; k++) {
      P.add('hullDark', box(0.036, 0.2, 0.014), s * 1.72, 0.80, 2.75 - k * 0.7);
    }
  }
  // engine deck + two-tone exhaust louvres on the rear corners (§10.5)
  P.add('hullDark', box(1.9, 0.02, 1.2), 0, 1.305, -2.4);
  for (const k of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDetail', box(1.8, 0.02, 0.055), 0, 1.31, -1.95 - k * 0.16);
  }
  P.add('hull', box(2.9, 0.42, 0.12), 0, 1.02, -3.52);                          // rear plate
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.62, 0.30, 0.06), s * 0.95, 1.16, -3.5, -0.5, 0, 0); // louvre banks
    for (let k = 0; k < 3; k++) {
      P.add('hullDetail', box(0.58, 0.045, 0.05), s * 0.95, 1.08 + k * 0.085, -3.53, -0.5, 0, 0);
    }
    P.add('hullRubber', box(0.5, 0.3, 0.028), s * 1.35, 0.42, -3.6, 0.1, 0, 0); // mud flaps
    P.add('hullDetail', box(0.14, 0.14, 0.1), s * 1.5, 1.2, -3.42);             // cable reels
  }
  // glacis furniture: splash board, driver hatch right, periscopes, tools
  P.add('hullDetail', box(2.2, 0.045, 0.07), 0, 1.06, 2.3, -0.52, 0, 0);        // splash board
  P.add('hull', cylY(0.27, 0.27, 0.03, P.q ? 20 : 12), 0.55, 1.32, 0.95);       // driver hatch
  P.add('hullDark', torus(0.27, 0.014, P.q ? 20 : 12), 0.55, 1.325, 0.95);
  periscope(P, 'hullDetail', 0.35, 1.34, 1.2);
  periscope(P, 'hullDetail', 0.57, 1.34, 1.24);
  periscope(P, 'hullDetail', 0.79, 1.34, 1.2, 0.3);
  headlight(P, -1.25, 0.82, 3.36, -0.4);
  headlight(P, 1.25, 0.82, 3.36, -0.4);
  towCable(P, [[-1.05, 1.05, 2.6], [0, 1.2, 1.8], [1.05, 1.05, 2.6]]);
  shovelTool(P, -1.35, 0.92, 1.4);
  liftEye(P, 'hullDetail', -1.25, 1.33, -0.7);
  liftEye(P, 'hullDetail', 1.25, 1.33, -0.7);

  // ---- turret: A5 welded wedge with long flat cheeks + EMES-18 box ----------
  const LH1 = 0.72;
  // wedge-profiled welded shell: cheeks converge to the mantlet slot
  P.add('turret', frustum(1.02, -0.1, -1.15, 0.92, -0.15, -1.1, 0.0, LH1));     // rear body
  P.add('turret', slab(                                                          // right cheek
    [0.22, 0, 0.78], [1.02, 0, -0.15], [1.02, 0, -0.6], [0.22, 0, 0.45],
    [0.20, LH1, 0.55], [0.92, LH1, -0.2], [0.92, LH1, -0.6], [0.20, LH1, 0.28]));
  P.add('turret', slab(                                                          // left cheek
    [-1.02, 0, -0.15], [-0.22, 0, 0.78], [-0.22, 0, 0.45], [-1.02, 0, -0.6],
    [-0.92, LH1, -0.2], [-0.20, LH1, 0.55], [-0.20, LH1, 0.28], [-0.92, LH1, -0.6]));
  P.add('turret', box(0.46, LH1 * 0.86, 0.35), 0, LH1 * 0.43, 0.52);            // front nose block
  // EMES-18 boxy sight housing, right roof FRONT, double square aperture (§10.5)
  P.add('turret', box(0.46, 0.30, 0.44), 0.52, LH1 + 0.13, 0.12);
  P.add('turretDark', box(0.16, 0.16, 0.04), 0.42, LH1 + 0.14, 0.35);
  P.add('turretDark', box(0.16, 0.16, 0.04), 0.63, LH1 + 0.14, 0.35);
  P.add('turretGlass', box(0.12, 0.11, 0.02), 0.42, LH1 + 0.14, 0.375);
  P.add('turretGlass', box(0.12, 0.11, 0.02), 0.63, LH1 + 0.14, 0.375);
  P.add('turret', box(0.5, 0.05, 0.5), 0.52, LH1 + 0.30, 0.09);                 // housing lid
  // hatches + periscopes + MG
  P.add('turret', cylY(0.22, 0.22, 0.04, 14), 0.5, LH1 + 0.015, -0.55);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.5, LH1 + 0.015, -0.45);
  periscope(P, 'turretDetail', 0.5, LH1 + 0.05, -0.25);
  pintle(P, KIT, -0.5, LH1 + 0.04, -0.3);
  // big rear stowage bin extending the silhouette backward (§10.5 key read)
  P.add('turret', box(1.7, 0.44, 0.75), 0, 0.28, -1.55);
  P.add('turretDark', box(1.6, 0.02, 0.65), 0, 0.52, -1.55);                    // lid seam
  for (const s of [-1, 1]) P.add('turretDetail', box(0.06, 0.3, 0.04), s * 0.6, 0.26, -1.94);
  stowage(P, 'turretCloth', rng, [[0, 0.62, -1.5, 1.1, 0.24, 0.5]]);
  tarpRoll(P, 'turretCloth', -0.75, 0.42, -1.1, 0.8, 0.09, false, 8);
  jerryCan(P, 'turretCloth', 0.85, 0.35, -1.15, 0.2);
  smokeCluster(P, 0.85, 0.36, 0.1, 4, 0.9, 0.55);
  smokeCluster(P, -0.85, 0.36, 0.1, 4, -0.9, 0.55);
  P.add('turretDetail', box(0.025, 0.5, 0.025), -0.85, LH1 + 0.22, -0.95, 0, 0, -0.1); // antenna
  // mantlet: rounded wedge block around the gun root
  P.addGunExtra(box(0.52, 0.44, 0.3), 0, 0.02, 0.55);
  P.addGunExtra(cylZ(0.12, 0.3, 12, 0.15), 0, 0, 0.76);
  buildGun(P, { len: 5.2, r: 0.062, sleeve: true, evac: 0.58, baseR: 0.13 });
  // 7 dished wheels with heavy rubber, torsion sag, sprocket REAR, 4 rollers
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.315, wheelW: 0.21, xc: 1.42,
    wheelZs: [2.5, 1.68, 0.86, 0.04, -0.78, -1.6, -2.42],
    sprocket: { z: -3.05, y: 0.44, r: 0.28 }, idler: { z: 3.0, y: 0.42, r: 0.26 },
    rollers: [1.9, 0.6, -0.7, -2.0].map((z) => ({ z, y: 0.80, r: 0.075 })),
    trackW: 0.55, topY: 0.78, arms: true, paintedEnds: true,
  });
  P.decal('turret', 'number', '123', 0.3, [0.98, 0.3, -0.5], Math.PI / 2, 0, 0.1);
  P.decal('turret', 'number', '123', 0.3, [-0.98, 0.3, -0.5], -Math.PI / 2, 0, -0.1);
  P.decal('hull', 'crossgrey', null, 0.3, [1.73, 0.85, 1.3], Math.PI / 2);
  P.decal('hull', 'crossgrey', null, 0.3, [-1.73, 0.85, 1.3], -Math.PI / 2);
  P.topY = LH1 + 0.4;
}

// ---------------------------------------------------------------------------
// MBT-70 — owner-directed M1A1-chassis composition. The certified M1A1 hull
// loft and seven-wheel running gear form the base, without its side skirts;
// the source print supplies the low rounded turret-front language, 152 mm
// launcher, bustle and raised commander station. No source vertices or
// materials enter runtime.
// ---------------------------------------------------------------------------
function buildMBT70(P) {
  const {
    xform, box, polyMultiLoft, cylY, cylZ, sph, torus,
    buildGun, liftEye, periscope,
    smokeCluster,
  } = KIT;
  const seg = P.q ? 24 : 14;

  // ---- certified M1A1 hull, intentionally without side skirts ------------
  buildM1A1BareHull(P, {
    returnRollerZs: [1.46, 0, -1.46],
    returnTrackTopY: 1.06,
    returnRollerR: 0.11,
  });
  for (const s of [-1, 1]) {
    P.addMudguard(`mbt70_m1_front_fender_${s}`, 'hull',
      box(0.42, 0.09, 1.18), s * 1.54, 1.37, 3.10, -0.055, 0, 0);
    P.addMudguard(`mbt70_m1_rear_fender_${s}`, 'hull',
      box(0.42, 0.09, 1.32), s * 1.54, 1.64, -3.16, 0.035, 0, 0);
    // A short attached rub rail terminates clear of both end-wheel sweeps.
    P.add('hullDetail', box(0.06, 0.08, 5.46), s * 1.69, 1.39, 0.10);

    // Close the open stern shoulder behind the final drive without turning
    // the skirtless MBT-70 back into a full-skirt Abrams. Seat the wall
    // inboard and keep the shelf above the complete sprocket/shoe sweep.
    P.add('hull', box(0.12, 0.48, 1.38), s * 0.96, 1.41, -3.05, 0.025 * s, 0, 0);
    P.add('hull', box(0.48, 0.10, 1.34), s * 1.31, 1.69, -3.05, 0.025 * s, 0, 0);
    P.add('hullDetail', box(0.035, 0.34, 1.18), s * 1.00, 1.43, -3.05, 0.025 * s, 0, 0);
    for (const z of [-3.48, -3.05, -2.62]) {
      P.add('hullDetail', box(0.11, 0.035, 0.035), s * 1.20, 1.66, z);
    }
  }

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
  const SPARE_TRACK_MOUNT_X_M = 1.65;
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
  const rearBiasedInset = (front, shoulder, rear) => (_point, i) => {
    const z = turretPlan[i][1];
    if (z < -1.30) return rear;
    if (z < -0.25) return shoulder;
    return front;
  };
  // The donor hull deck rises by roughly 0.22 m under the aft half of this
  // long bustle.  Keep the nose floor at the turret ring, then rake the
  // underside upward from the shoulder to the basket so it clears that deck
  // after the whole turret is lowered onto its real front seat.
  const turretFloorHeight = ([, z]) => {
    if (z >= -0.55) return 0;
    const t = Math.min(1, (-z - 0.55) / (2.92 - 0.55));
    return BUSTLE_FLOOR_RISE_M * t;
  };
  P.add('turret', polyMultiLoft(turretPlan, [
    { height: turretFloorHeight, inset: 1.00 },
    { height: 0.22, inset: rearBiasedInset(0.88, 0.96, 0.99) },
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
      rotation: [0, 0, side * Math.PI / 2],
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
  P.addGunExtra(xform(polyMultiLoft(mantletPlan, [
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
  P.addGunExtra(xform(sph(0.28, seg, Math.PI * 0.62), 0, 0, 0, 0, 0, 0,
    [0.68, 1.10, 1.10]), 0, 0.11, 0.43);
  const GUN_ROOT_RECESS_RADIUS_M = 0.19;
  const GUN_ROOT_RECESS_SCALE = [0.82, 1.14, 1];
  P.addGunExtraDark(xform(cylZ(GUN_ROOT_RECESS_RADIUS_M, 0.045, seg), 0, 0, 0, 0, 0, 0,
    GUN_ROOT_RECESS_SCALE), 0, 0, 0.94);
  P.addGunExtra(cylZ(0.22, 0.25, seg, 0.17), 0, 0, 1.19);
  P.addGunExtraDark(cylZ(0.225, 0.035, seg), 0, 0, 1.085);
  buildGun(P, {
    len: 3.88, r: 0.098, sleeve: true, evac: 0.50,
    baseR: 0.19, evacR: 1.24, collar: true,
  });
  // Near-muzzle reference/sensor assembly: a clamp ring supports the small
  // housing instead of leaving another box suspended above the tube.
  P.addGunExtraDark(cylZ(0.128, 0.075, seg), 0, 0, 3.38);
  P.addGunExtra(box(0.18, 0.14, 0.28), 0.14, 0.14, 3.38);
  P.addGunExtraDark(box(0.10, 0.065, 0.025), 0.14, 0.16, 3.525);
  muzzleBore(P, { len: 3.88, r: 0.098 });

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

// ---------------------------------------------------------------------------
// T-14 Armata — NOT a pancake: long tall hull, 7 wheels behind full-length
// sawtooth skirts, crew-capsule bow, and the sci-fi faceted unmanned turret
// shroud with sensor mast, AESA corner panels, APS tubes and a clean gun.
// ---------------------------------------------------------------------------
function buildT14(P) {
  const { box, frustum, slab, polyMultiLoft, cylY, cylX, cylZ, torus,
    xform, mergeAll,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope,
    towCable, stowage } = KIT;
  const { rng } = P;
  // Fully first-party runtime geometry. The local CC-BY comparison GLB is
  // used only by QA pages for measurements and visual pairs; no source
  // vertices, indices, materials, textures, rig or animation enter here.
  // ---- hull -----------------------------------------------------------------
  // MEASURED LADDER r1 (2026-08-06, oracle "T-14 Armara Uralvagon Factory"
  // registered + load-proven; §B8: the oracle is the proportion truth).
  // Authored against tools/tmp-moderns-worldtrace ABSOLUTE world columns
  // (t14-trace-r0): deck raised to the print's 1.685 line (supersedes the
  // pre-oracle r7 eyeball cut — the 2.7 published roof agrees), intake hump
  // 1.83 (z -1.25..-2.42), rear deck 1.745, shallow 8.8-deg upper glacis
  // (1.665@2.15 -> 1.385@3.95) + steep nose wedge to the 1.10@4.33 prow
  // point, belly ±1.06 at 0.43 (ref 0.43/0.34 front rows), boat-tail
  // underside 0.74 (z -3.55..-4.03) + raked lower rear plate, gear pulled
  // inboard to the ref's ground span x 1.09..1.63 with high-tucked end
  // wheels (§B6 trapezoid holds). Dims sovereign: hull side body -4.32..
  // +4.33, width anchor = rear screen faces ±1.945, muzzle +6.45 = 10.8.
  // Packet: docs/references/tanks/t14.md (ladder section).
  P.add('hull', box(2.12, 0.62, 7.1), 0, 0.74, 0.05);                           // belly ±1.06 y 0.43..1.05 (track inner 1.09 − 0.03 lane law)
  for (const s of [-1, 1]) {                                                    // sponson under-strip (ref front row 0.34 @ x 0.9-1.05)
    P.add('hull', box(0.20, 0.71, 6.9), s * 0.96, 0.695, 0.05);
  }
  // deck band as a WRAP-SAFE 3-piece assembly (the r2 sprocket/idler tuck
  // raised the orbit tops to 1.455/1.315 — a full-width band solid would
  // eat the wraps): center spine between the tracks, sponson floors 0.03+
  // over the orbit crests, near-vertical outer walls (the r4 lean kept).
  P.add('hull', box(2.12, 0.635, 6.46), 0, 1.3675, -1.05);                      // spine ±1.06, y 1.05..1.685
  for (const s of [-1, 1]) {
    P.add('hull', box(0.80, 0.12, 6.46), s * 1.46, 1.625, -1.05);               // sponson floor 1.565..1.685
  }
  P.add('hull', orientedSlab99(                                                  // right band wall (leans 1.86 -> 1.82)
    [1.82, 1.05, 2.18], [1.86, 1.05, 2.18], [1.86, 1.05, -4.28], [1.82, 1.05, -4.28],
    [1.78, 1.685, 2.15], [1.82, 1.685, 2.15], [1.82, 1.685, -4.24], [1.78, 1.685, -4.24]));
  P.add('hull', orientedSlab99(                                                  // left band wall
    [-1.86, 1.05, 2.18], [-1.82, 1.05, 2.18], [-1.82, 1.05, -4.28], [-1.86, 1.05, -4.28],
    [-1.82, 1.685, 2.15], [-1.78, 1.685, 2.15], [-1.78, 1.685, -4.24], [-1.82, 1.685, -4.24]));
  fenders(P, 1.78, 1.86, 1.665, -3.75, 2.10, 0.03);                             // fender lip stops at the glacis knee; rear end at the print's -3.77
  for (const s of [-1, 1]) {                                                    // narrow fender tail over the sprocket wrap (inside the ±1.74 plan cols)
    P.add('hull', box(0.12, 0.03, 0.48), s * 1.68, 1.68, -3.99);
  }
  // deck plates at the PRINT's roofline: main 1.685, intake hump 1.83
  // (z -1.25..-2.42 — the ref side 1.82 / front 1.84 plateau), rear 1.745
  P.add('hull', box(3.44, 0.045, 3.40), 0, 1.6625, 0.45);                       // main deck 1.685, z -1.25..2.15
  P.add('hull', box(2.00, 0.145, 1.17), 0, 1.7575, -1.835);                     // intake hump top 1.83
  P.add('hullDark', box(0.02, 0.02, 1.15), -0.99, 1.825, -1.835);               // hump edge seams
  P.add('hullDark', box(0.02, 0.02, 1.15), 0.99, 1.825, -1.835);
  P.add('hull', box(3.44, 0.06, 1.63), 0, 1.715, -3.235);                       // rear deck 1.745, z -2.42..-4.05
  // capsule hatch hood on the crest (ref 1.76 top, z 1.45..1.81) + 3 crew
  // hatches in a row (T-14 capsule bow) + periscopes
  P.add('hull', box(2.00, 0.075, 0.36), 0, 1.7225, 1.63);
  for (const x of [-0.62, 0, 0.62]) {
    P.add('hull', cylY(0.21, 0.21, 0.035, P.q ? 16 : 10), x, 1.775, 1.62);
    P.add('hullDark', torus(0.21, 0.012, P.q ? 16 : 10), x, 1.782, 1.62);
  }
  periscope(P, 'hullDetail', -0.62, 1.80, 1.86, -0.05);
  periscope(P, 'hullDetail', 0.0, 1.80, 1.88);
  periscope(P, 'hullDetail', 0.62, 1.80, 1.86, 0.05);
  // §B1 shallow UPPER GLACIS — ONE 8.8-deg plane in CO-PLANAR pieces
  // (t14 FRUSTUM-UNDERSIDE law): the CENTER LANE (±1.06) carries the deep
  // underside; thin outer WINGS (5 cm, co-planar top) ride 0.08+ above the
  // 1.315 idler-orbit crest AND carry the §B8 ARROW: their front edges
  // taper (1.80, 2.90) -> (1.06, 3.95) so the plan reads the T-14's
  // 1.5 m bow taper instead of a rectangle.
  P.add('hull', slab(
    [-1.06, 1.325, 3.96], [1.06, 1.325, 3.96], [1.06, 1.05, 3.90], [-1.06, 1.05, 3.90],
    [-1.06, 1.665, 2.15], [1.06, 1.665, 2.15], [1.06, 1.605, 2.02], [-1.06, 1.605, 2.02]));
  P.add('hull', slab(                                                            // right wing (tapered)
    [1.06, 1.325, 3.95], [1.06, 1.275, 3.94], [1.80, 1.435, 2.86], [1.80, 1.489, 2.90],
    [1.06, 1.665, 2.15], [1.06, 1.615, 2.13], [1.80, 1.615, 2.13], [1.80, 1.665, 2.15]));
  P.add('hull', slab(                                                            // left wing (corner-swapped mirror)
    [-1.06, 1.275, 3.94], [-1.06, 1.325, 3.95], [-1.80, 1.489, 2.90], [-1.80, 1.435, 2.86],
    [-1.06, 1.615, 2.13], [-1.06, 1.665, 2.15], [-1.80, 1.665, 2.15], [-1.80, 1.615, 2.13]));
  // NOSE WEDGE to the BLUNT ARROW TIP (±0.62 at 4.29 — §B8 order 3) with
  // the 0.82 underside line (ref bow rows 0.79..0.85); center lane only
  // below the toe (§B4 idler lane), raked lower bow back to the belly.
  P.add('hull', slab(
    [-1.06, 0.82, 3.92], [1.06, 0.82, 3.92], [1.06, 1.385, 3.95], [-1.06, 1.385, 3.95],
    [-0.62, 0.82, 4.28], [0.62, 0.82, 4.28], [0.62, 1.095, 4.29], [-0.62, 1.095, 4.29]));  // prow tip 4.29 (PROPORTION ROUND: the post-trim grid re-phase put the
  // old 4.335 tip 2 mm past the 4.313 window edge — a whole ONLY-PROC err-9
  // bow column on both side rows; the ref's own mask ends 4.318. Front body
  // col is now 4.252-centered, hullLengthM ~8.62 = -0.9% inside grace.)
  P.add('hull', frustum(1.06, 3.58, 3.62, 1.06, 3.92, 4.24, 0.43, 0.82));       // raked lower bow, center lane
  for (const s of [-1, 1]) P.add('hullDetail', box(1.0, 0.05, 0.085), s * 0.52, 1.545, 2.52, -0.154, s * 0.45, 0); // splash V on the plane
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.50, 0.026, 7.6), s * 1.58, 1.655, -0.35);
  }
  // ---- skirts (print profile): front half = 3 thick armor panels with the
  // Malachit tile field, faces ±1.86 (the print's front-half width — the
  // ±1.945 anchor lives on the REAR screen, ref plan x ±1.99 rear-only);
  // rear half = open bar-armor screen z -1.30..-4.25, slats 0.85..1.50 on
  // hanger-strut bays; inner plane 1.66 with the rubber fringe to 0.50
  // (ref front rows: bot 0.49..0.54 at x 1.65-1.70, 0.80 at the panels).
  for (const s of [-1, 1]) {
    // FRONT-HALF inner plane + fringe ONLY (§B8 order 2: the print's rear
    // half is an OPEN bar screen with AIR under the band — 7 wheels read):
    // main piece to the knee, low front piece under the falling glacis line
    P.add('hull', box(0.05, 0.87, 2.30), s * 1.71, 1.235, 1.40);                // inner plane z 0.25..2.55 (shoe reach 1.655 + 0.03 lane law)
    P.add('hull', box(0.05, 0.665, 1.25), s * 1.71, 1.1275, 3.175);             // low front piece z 2.55..3.80, top 1.46
    // PROPORTION ROUND: the ref's hem band spans x 1.60..1.70 down to 0.53
    // (front rows: the ±1.64 cols read ref 1.689..0.526 vs the old 2 cm
    // fringe's air below 0.856 — err 0.18 x2). Fringe widened INBOARD to
    // 1.63..1.70 (band outer 1.59 + 0.04; still out of the ±1.73 window).
    P.add('hullRubber', box(0.07, 0.30, 3.30), s * 1.665, 0.65, 2.10);          // rubber fringe 0.50..0.80, x 1.63..1.70
    for (let k = 0; k < 4; k++) {                                               // front armor panels — faces ±1.86, tops FOLLOW the glacis line
      const z = 3.45 - k * 1.06;                                                // (§B8). FINISH r2: 4th panel closes the bare band gap to the
      const top = [1.44, 1.60, 1.66, 1.66][k];                                  // screen (owner: skirts run the FULL hull length)
      P.add('hull', box(0.10, top - 0.80, 1.00), s * 1.81, (top + 0.80) / 2, z);
      P.add('hull', box(0.08, 0.12, 1.00), s * 1.79, 0.77, z, 0, 0, -s * 0.35); // chamfered lip
      P.add('hullDark', box(0.105, top - 0.86, 0.03), s * 1.8075, (top + 0.80) / 2, z - 0.52); // panel seam
    }
    // rear bar-armor screen z -1.30..-4.25 (the ±1.945 width anchor).
    // FINISH r2 (owner punch list 3: "tall boxy side skirts running the
    // FULL hull length" — the 4-slat open screen read skeletal vs the
    // print's dense wall): 7 tight slats + a top closure strip form a
    // 0.86..1.665 band meeting the fender line; wheels (tops 0.80) still
    // read fully below with the air gap — §B8.1 seven countable.
    for (let r = 0; r < 7; r++) {
      P.add('hullDark', box(0.045, 0.085, 2.95), s * 1.9225, 0.90 + r * 0.115, -2.775);
    }
    P.add('hull', box(0.045, 0.075, 2.95), s * 1.9225, 1.6275, -2.775);         // top closure strip to the fender line
    for (const zb of [-1.45, -2.55, -3.45, -4.10]) {
      P.add('hull', box(0.05, 0.86, 0.05), s * 1.92, 1.23, zb);
    }
    // §D station ribs: band-face attachment rails covering the mid slices
    // (the print reads ±1.84-1.86 there — st3's slab sits in a screen bay
    // gap on the print, so that slice gets a RIB not a bay plate)
    for (const zr of [-2.16, -1.05, -0.42, 0.21, 0.84]) {
      P.add('hullDetail', box(0.012, 0.56, 0.05), s * 1.866, 1.38, zr);
    }
    // rear-view camera pods (tucked under the glacis line / rear plate top)
    P.add('hullDetail', cylZ(0.05, 0.16, 10), s * 1.72, 1.30, 3.55);
    P.add('hullDetail', cylZ(0.05, 0.16, 10), s * 1.60, 1.55, -4.24);
    P.add('hullDark', box(0.06, 0.06, 0.02), s * 1.60, 1.55, -4.325);
  }
  // ---- stern: boat-tail underside 0.74 (z -3.55..-4.03), raked lower rear
  // plate, then the RAKED UPPER RAMP (owner punch-list 3 hull order + the
  // print's read: plan center-rear ends -3.99 while the side -4.32 content
  // is OUTER corner posts + flaps — the T-14 rear plate leans forward).
  // REGISTRATION-ANCHOR: the corner posts keep a >=0.41-band BODY column
  // at the -4.38 window so hullLengthM/dAlong hold (measured law).
  P.add('hull', frustum(1.06, -3.42, -3.44, 1.06, -3.46, -4.02, 0.43, 0.74));   // raked tail underside
  P.add('hull', box(2.12, 0.31, 0.60), 0, 0.895, -3.72);                        // tail block 0.74..1.05
  P.add('hull', frustum(1.06, -3.98, -4.02, 1.06, -4.01, -4.05, 0.74, 1.26));   // raked lower rear plate (center lane)
  // PROPORTION ROUND (owner 2026-08-07 "really long"): the print's plan
  // center-rear ends -3.99..-4.05 while the old ramp bottom sat -4.13 —
  // plan_hull center cols read err 0.15-0.20 rearward. Ramp bottom pulled
  // to -4.05 (steeper lean, rx -0.266 for the face furniture below).
  P.add('hull', orientedSlab99(                                                 // raked upper RAMP: bottom (1.26,-4.05) -> top (1.70,-3.93)
    [-1.60, 1.26, -3.93], [1.60, 1.26, -3.93], [1.60, 1.26, -4.05], [-1.60, 1.26, -4.05],
    [-1.60, 1.70, -3.81], [1.60, 1.70, -3.81], [1.60, 1.70, -3.93], [-1.60, 1.70, -3.93]));
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.60, 0.20), s * 1.35, 1.40, -4.235);               // corner posts x 1.10..1.60, z -4.335..-4.135 (BODY anchor col)
    P.add('hullDark', box(0.48, 0.03, 0.16), s * 1.35, 1.715, -4.235);          // post cap seams (clear of the -4.32 col boundary)
    P.add('hullDark', box(1.15, 0.02, 1.5), s * 0.82, 1.75, -3.25);             // rear-deck grille fields
    for (const k of KIT.grilleIndices(P.q, 6, 3)) {
      P.add('hullDetail', box(1.05, 0.025, 0.06), s * 0.82, 1.757, -2.70 - k * 0.2);
    }
    P.add('hullDark', box(0.55, 0.24, 0.05), s * 0.90, 1.46, -4.02, -0.266, 0, 0); // exhaust grilles ON the ramp
    // PROPORTION ROUND: flaps/hangers pulled out of the -4.402 gate window
    // (was a whole ONLY-PROC err-9 body column on BOTH side rows — the ref's
    // own tail ends -4.327). Rear body extreme is now the posts at -4.335.
    P.add('hullRubber', box(0.42, 0.21, 0.026), s * 1.51, 1.505, -4.30);        // rear flaps x 1.30..1.72, y 1.40..1.61 (print -4.28 col band)
    P.add('hullDetail', box(0.07, 0.05, 0.10), s * 1.45, 1.63, -4.25);          // flap hangers off the posts
  }
  // rear-ramp kit: unditching log (§I census) LYING ON the raked ramp,
  // stowage bins on the posts, louvres on the ramp face, tow lugs low
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.3, r: 0.095, straps: 2, seed: 14 });
    log.position.set(0, 1.60, -3.955);                                          // lashed at the ramp crest (plan rear stays in the ref's -4.05 col)
    log.rotation.x = -0.266;
    P.hullG.add(log);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.44, 0.22, 0.10), s * 1.35, 1.42, -4.10);          // stowage bins against the posts
    P.add('hullDark', box(0.46, 0.02, 0.11), s * 1.35, 1.54, -4.10);            // bin lids
    for (let k = 0; k < 3; k++) {                                               // heat-shield louvres on the ramp
      P.add('hullDetail', box(0.50, 0.04, 0.024), s * 0.60, 1.32 + k * 0.10, -4.048 + k * 0.027, -0.266, 0, 0);
    }
    P.add('hullDetail', box(0.13, 0.11, 0.10), s * 0.9, 1.28, -3.99);           // tow lugs at the ramp foot
  }
  P.add('hullDark', box(0.16, 0.08, 0.03), 0, 1.66, -3.925, -0.266, 0, 0);      // convoy light on the ramp crest
  headlight(P, -1.72, 1.18, 4.05, -0.20, 0.05);                                 // off the mudguard corners — the wrap lane (x 1.09..1.66) stays open
  headlight(P, 1.72, 1.18, 4.05, -0.20, 0.05);
  // bow tow hooks under the nose + front mudflaps x 1.30..1.72 (face 4.31,
  // 0.86..1.12 — the ref bow bottom line; orbit far edge 3.995 clears)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.14, 0.12, 0.18), s * 0.72, 0.62, 3.78);
    // A high outer rail and vertical hanger carry each terminal flap back to
    // the side-skirt shoulder. The load path stays above and outboard of the
    // idler sweep; the old 7 cm hanger simply ended in open air.
    P.add('hull', box(0.08, 0.08, 0.58), s * 1.75, 1.50, 4.02);                // high rail into the skirt shoulder
    P.add('hullDetail', box(0.08, 0.38, 0.12), s * 1.71, 1.31, 4.22);          // rail-to-flap hanger
    P.addMudguard(`t14_front_mudguard_${s < 0 ? 'left' : 'right'}`,
      'hullRubber', box(0.42, 0.26, 0.026), s * 1.51, 0.99, 4.275);             // faces 4.288 — clear of the idler wrap
    P.add('hullRubber', box(0.16, 0.28, 0.026), s * 1.81, 1.00, 4.25);          // LOW corner flaps to x 1.89 (ref bow corners sit under the 1.24 nose line)
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.020, seed: 11,
      pts: [[-1.2, 1.50, 2.6], [-0.4, 1.45, 3.1], [0.5, 1.47, 2.85]] });
    P.hullG.add(tc);
  }
  liftEye(P, 'hullDetail', -1.5, 1.66, 0.5);                                    // eyes at the deck line (their 1.79 tops owned 6 front cols vs ref 1.711)
  liftEye(P, 'hullDetail', 1.5, 1.66, 0.5);

  // ---- turret: faceted stealth shroud (§16.5) -------------------------------
  // LADDER r1 RE-PROPORTION (§B8: the oracle is the proportion truth; all
  // stations from tmp-moderns-worldtrace t14-trace-r0, world -> local via
  // pivot [0,1.685,-0.60]): the print's shroud is LONGER and REAR-SET —
  // plan arrow apex +1.62w, max width ±1.44 (z +0.44..-0.74w), rear-corner
  // chamfers into a 2.04-wide BUSTLE running to the -2.87w tail (underside
  // floating at 1.97w over the rear deck — real on the print), a RAISED
  // REAR ROOF crown at 2.72w over the 2.53w front crown, and the sensor
  // suite re-seated where the print carries it: pano tower rear-RIGHT
  // (x +0.82, z -2.31w, head 3.76), meteo mast front-LEFT (x -0.70,
  // z +0.11w, tip 3.40), RWS + EO stack on the bustle front (tops
  // 3.03-3.15w). The knuckle-facet architecture (r7 lineage) stays.
  const AH = 0.845;                                  // front roof crown (2.53 world)
  // Keep the broad belt's deck contact and plan footprint, but lower its
  // knuckle 6 cm so the unmanned shell no longer reads as a tall crewed
  // turret. The upper facets still terminate at the certified crown.
  const BK = 0.34;                                   // knuckle line height (2.025 world)
  // lower belt: leans OUT (base narrower than knuckle) — R / L / front pair / rear
  // LOWER BELT (leans OUT, deck -> knuckle). Knuckle ring (print plan):
  // apex (0.06,2.22) arrow (0.80,1.77) shoulder (1.44,1.04) side rear
  // (1.44,-0.14) corner (1.17,-0.35) bustle join (1.02,-0.55).
  // PROPORTION ROUND shoulder trim: the ref's wide-shoulder band (|x|>=1.36)
  // spans local z 0.11..1.00 — the old ring ran the 1.44 line to z -0.14 and
  // read 0.25 too long at the ±1.42 plan cols. Side-rear ring points pulled
  // to z +0.03/+0.02; corner + bustle-join points hold (the knuckle look).
  P.add('turret', slab(                                                          // right lower belt (shoulder..corner)
    [1.36, 0, 1.00], [1.36, 0, 0.02], [1.11, 0, -0.32], [0.97, 0, -0.52],
    [1.44, BK, 1.04], [1.44, BK, 0.03], [1.17, BK, -0.35], [1.02, BK, -0.55]));
  P.add('turret', slab(                                                          // left lower belt
    [-1.36, 0, 0.02], [-1.36, 0, 1.00], [-0.97, 0, -0.52], [-1.11, 0, -0.32],
    [-1.44, BK, 0.03], [-1.44, BK, 1.04], [-1.02, BK, -0.55], [-1.17, BK, -0.35]));
  // PROPORTION ROUND r2 FRONT TRIM (owner 2026-08-17): the print's shroud
  // is SHORTER than the r1 arrow. Measured off the extract's own
  // turretZProfile (gate frame, same axisMap that puts the ref muzzle at
  // 5.643 == our 5.64): ref turret group spans world z -2.861..+1.358,
  // ours -2.855..+1.62 — the REAR registers exactly, the FRONT runs 0.26
  // long. Every arrow/chin station forward of the shoulder line (local
  // 1.04) is pulled back by k = 0.778 about that line, so the apex lands
  // local 1.958 = world 1.358 EXACTLY on the print. Shoulder and rear
  // stations are untouched, so the turret CENTER (ref -0.627 vs ours
  // -0.6175) and the gun/muzzle datum both hold.
  P.add('turret', slab(                                                          // front-right lower arrow
    [0.06, 0, 1.896], [0.75, 0, 1.553], [1.36, 0, 1.00], [0.06, 0, 1.437],
    [0.06, BK, 1.958], [0.80, BK, 1.608], [1.44, BK, 1.04], [0.06, BK, 1.476]));
  P.add('turret', slab(                                                          // front-left lower arrow
    [-0.75, 0, 1.553], [-0.06, 0, 1.896], [-0.06, 0, 1.437], [-1.36, 0, 1.00],
    [-0.80, BK, 1.608], [-0.06, BK, 1.958], [-0.06, BK, 1.476], [-1.44, BK, 1.04]));
  P.add('turret', box(1.94, BK + 0.02, 0.26), 0, (BK + 0.02) / 2, -0.60);       // lower rear wall under the bustle front
  // UPPER BELT (leans IN to the roof): roof ring apex (0.05,1.52) front
  // (0.66,1.30) shoulder (0.95,0.86) rear (0.90,-0.42).
  P.add('turret', slab(                                                          // right upper facet
    [1.44, BK, 1.04], [1.44, BK, 0.03], [1.17, BK, -0.35], [1.02, BK, -0.55],
    [0.95, AH, 0.86], [0.95, AH, -0.20], [0.92, AH, -0.35], [0.90, AH, -0.50]));
  P.add('turret', slab(                                                          // left upper facet
    [-1.44, BK, 0.03], [-1.44, BK, 1.04], [-1.02, BK, -0.55], [-1.17, BK, -0.35],
    [-0.95, AH, -0.20], [-0.95, AH, 0.86], [-0.90, AH, -0.50], [-0.92, AH, -0.35]));
  P.add('turret', slab(                                                          // front-right upper arrow
    [0.06, BK, 1.958], [0.80, BK, 1.608], [1.44, BK, 1.04], [0.06, BK, 1.476],
    [0.05, 0.545, 1.911], [0.66, AH, 1.242], [0.95, AH, 0.86], [0.05, AH, 1.413]));
  P.add('turret', slab(                                                          // front-left upper arrow
    [-0.80, BK, 1.608], [-0.06, BK, 1.958], [-0.06, BK, 1.476], [-1.44, BK, 1.04],
    [-0.66, AH, 1.242], [-0.05, 0.545, 1.911], [-0.05, AH, 1.413], [-0.95, AH, 0.86]));
  // apex chin cap: the arrow tip tops out LOW over the gun trough — TWO
  // co-planar pieces to the print's 2.21..2.27w tip flat (no staircase)
  // PROPORTION ROUND r2 NOSE-LINE NOTE: the oracle's turret-union yMax runs
  // 2.532 (z_w 0.6-0.8) -> 2.474 (1.0-1.2) -> 2.158 (1.2-1.4), so the r1
  // chin's flat 2.21-2.27 shelf looks 0.20 low. Re-lofting the chin to those
  // heights was TRIED and measured turret 76.1 (flat), whole 77.5 -> 77.2,
  // stations 84.6 -> 83.8: the ref's 2.474 read is a NARROW shroud-edge
  // feature, not a 0.84-wide plate. Reverted; the flat chin stands.
  P.add('turret', slab(
    [-0.66, AH, 1.242], [0.66, AH, 1.242], [0.42, 0.525, 1.678], [-0.42, 0.525, 1.678],
    [-0.66, AH + 0.005, 1.273], [0.66, AH + 0.005, 1.273], [0.42, 0.585, 1.694], [-0.42, 0.585, 1.694]));
  P.add('turret', slab(                                                          // flat apex tip over the trough
    [-0.42, 0.525, 1.678], [0.42, 0.525, 1.678], [0.30, 0.525, 1.911], [-0.30, 0.525, 1.911],
    [-0.42, 0.585, 1.694], [0.42, 0.585, 1.694], [0.30, 0.585, 1.896], [-0.30, 0.585, 1.896]));
  // One shallow connected crown follows the actual cheek perimeter. The old
  // 1.90 x 1.91 rectangle bridged straight across the diagonal shoulders and
  // made the roof read as a square lid. This ten-station cap instead narrows
  // around the gun throat, follows both cheek breaks, and meets the raised
  // rear crown at the existing -0.50 m seam.
  const t14RoofPlan = [
    [-0.90, -0.50], [0.90, -0.50], [0.95, -0.20], [0.95, 0.86],
    [0.66, 1.242], [0.18, 1.413], [-0.18, 1.413], [-0.66, 1.242],
    [-0.95, 0.86], [-0.95, -0.20],
  ];
  P.add('turret', polyMultiLoft(t14RoofPlan, [
    { height: AH - 0.055, inset: 0.965 },
    { height: AH - 0.018, inset: 0.985 },
    { height: AH, inset: 1 },
  ]));
  // RAISED REAR ROOF crown (print 2.72w, z -0.40..-1.10w): frustum sides
  // (the print's crown flanks lean — front cols ±1.16-1.21 read 2.73)
  P.add('turret', frustum(1.24, 0.40, -0.52, 1.16, 0.28, -0.50, AH, 1.035));    // crown front extended to z_w -0.32 (ref 2.74 line)
  // BUSTLE: wide box to the -2.28 local tail, underside FLOATING at
  // 0.285 (1.97w — the print's below-bustle air is real §B2 air); rear
  // half narrows to ±0.965 (print plan x ±1.05 ends at -1.96w), corner
  // chamfer wedges + rising tail underside wedge.
  P.add('turret', box(2.04, 0.55, 0.86), 0, 0.5625, -0.93);                     // bustle front z -0.50..-1.36
  P.add('turret', orientedSlab99(                                               // bustle rear TAPERS ±0.965 -> ±0.90 (print plan chamfer; the old
    [-0.965, 0.285, -1.35], [0.965, 0.285, -1.35], [0.90, 0.285, -1.87], [-0.90, 0.285, -1.87],   // proud strakes owned the ±1.02 plan cols to -2.86w)
    [-0.965, 0.835, -1.35], [0.965, 0.835, -1.35], [0.90, 0.835, -1.87], [-0.90, 0.835, -1.87]));
  P.add('turret', slab(                                                          // tail wedge (underside rises 0.285 -> 0.65; rear edge 24mm clear
    [-0.90, 0.285, -1.84], [0.90, 0.285, -1.84], [0.87, 0.65, -2.255], [-0.87, 0.65, -2.255],  // of the -2.94w column window — AA-sliver law)
    [-0.90, 0.835, -1.84], [0.90, 0.835, -1.84], [0.87, 0.835, -2.255], [-0.87, 0.835, -2.255]));
  // turret RING BASKET under the shroud (mask-parity mass: the print
  // carries a real crew-basket dipping below its deck inside the hull —
  // 2779 interpen verts, packet ORACLE facts; in-game this drum is fully
  // occluded by the hull band, exactly like the print's).
  // PROPORTION ROUND r2: measured off the oracle's own turret-union
  // z-profile (world frame), the print holds yMin 1.346 FLAT from z -1.2
  // all the way to its +1.358 nose — a 2.56 m run — and only lets the
  // bustle float (yMin 1.97..2.28) behind z -1.2. The r1 drum covered just
  // z -0.28..+1.05, so the whole mid-shroud read 0.33-0.63 too HIGH on the
  // side turret row. Drum stretched to the measured run; the rear float is
  // deliberately preserved (it is real §B2 air on the print).
  P.add('turret', box(1.70, 0.314, 2.558), 0, -0.182, 0.679);
  // hard shadow seams along the knuckle + facet junctions + roof panels
  for (const s2 of [-1, 1]) {
    P.add('turretDark', box(0.02, 0.02, 0.95), s2 * 1.435, BK, 0.55);           // knuckle seam (follows the trimmed shoulder span)
    P.add('turretDark', box(0.016, 0.30, 0.03), s2 * 0.42, 0.62, 1.694, 0.42, -s2 * 0.55, 0); // arrow ridge seams
    P.add('turretDark', box(0.16, 0.14, 0.10), s2 * 0.70, AH - 0.10, 1.133, 0, s2 * 0.5, 0);  // corner EO box
    P.add('turretGlass', box(0.09, 0.07, 0.02), s2 * 0.72, AH - 0.09, 1.180, 0, s2 * 0.5, 0);
  }
  // Panel breaks now echo the tapered crown instead of painting another
  // square plate over it.
  P.add('turretDark', box(0.022, 0.012, 1.14), 0, AH + 0.008, 0.69);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.018, 0.012, 0.66), s * 0.42, AH + 0.008, 1.10,
      0, -s * 0.66, 0);
    P.add('turretDark', box(0.018, 0.012, 0.54), s * 0.76, AH + 0.008, 0.54,
      0, -s * 0.10, 0);
  }
  // gun trough: dark slot the clean tube emerges from, under the arrow apex
  P.add('turretDark', box(0.5, 0.40, 0.2), 0, 0.30, 1.771);
  // Afganit hard-kill launch tubes ringing the shroud base (§B3.1 grammar,
  // PROPORTION ROUND: the old 9 cm box stubs read as unidentifiable blocks
  // at 1x — banked r1 note): real launch CYLINDERS r 0.05 x 0.30 canted out
  // along the belt, each muzzle closed by a glossy membrane cap (the real
  // tubes ship capped). The k=0 pair tucks z 1.52 -> 1.12 onto the ref's own
  // ring line (plan_turret ±1.29 cols: ref front 0.70w vs the stubs' 0.98w).
  for (let k = 0; k < 5; k++) {
    for (const s of [-1, 1]) {
      const tx = s * (1.24 - k * 0.13), tz = k === 0 ? 1.12 : 1.52 - k * 0.42;
      P.add('turretDark', cylZ(0.05, 0.30, 10), tx, 0.10, tz, 0.25, s * (0.5 + k * 0.18), 0);
      P.add('turretGlass', cylZ(0.036, 0.304, 10), tx, 0.10, tz, 0.25, s * (0.5 + k * 0.18), 0);
    }
  }
  // ---- sensor suite at the PRINT's stations --------------------------------
  // FINISH r2 (dims 3.16 datum coupling, packet-filed): the old fat pano
  // head (3 cols at 3.71-3.77) + 2-col meteo tip carried p95 to 3.40 =
  // dims 48.1. Re-derived from the REF's own reads: pano = slim tower,
  // head top 3.05 (ref front max 3.04), ONE grid-centered column; the
  // 3.77w ref side spike is a real WHIP riding the tower (1 col, budget
  // <=4 above 3.16 aligned with ref spikes); meteo tip 3.37 one column.
  // p95 lands on the RWS/EO plateau 3.10-3.15 -> heightM ~3.15 vs 3.16.
  // PROPORTION ROUND (ref decode): the ref's pano HEAD plateau (3.05w) sits
  // at x 0.69..0.73 — INBOARD of its 3.76w whip-spike column (0.82). The old
  // cluster stacked head+whip on 0.82 and left the ref's 0.686/0.729 cols
  // empty (front err 0.16 x2). Cluster moved to x 0.70; the whip keeps its
  // own 0.82 column on a bridged side bracket (§A floaters law).
  P.add('turret', box(0.09, 0.30, 0.10), 0.70, 0.985, -1.72);                   // tower base (slimmed — the old 0.14 box AA-kissed the -2.454w side col)
  P.add('turretDetail', cylY(0.028, 0.034, 0.16, 8), 0.70, 1.215, -1.72);       // shaft
  P.add('turretDark', cylY(0.038, 0.038, 0.09, 10), 0.70, 1.32, -1.72);         // pano head (top 3.05w at the ref's 0.686/0.729 cols)
  P.add('turretGlass', box(0.05, 0.05, 0.012), 0.70, 1.325, -1.675);
  P.add('turretDetail', box(0.12, 0.026, 0.03), 0.765, 1.13, -1.72);            // whip bracket off the shaft (bridges to the whip base)
  {
    const wh = FITTINGS.antennaWhip({ mats: P.mats, h: 0.90, rake: 0.0, seed: 21 });
    wh.position.set(0.82, 1.135, -1.72);                                        // whip to 3.84w on its own bracket (ref front spike col x 0.82)
    P.turretG.add(wh);
  }
  // RWS + EO stack on the bustle front — re-derived to the print's OWN
  // plateau (side ref 3.07-3.16 tops across z_w -0.74..-1.83): pedestal +
  // two tiers + EO head span the full shelf; §B3 census MG (production
  // PKTM) aims FORWARD-right on the mount, level, top 3.12w.
  // PROPORTION ROUND r2 NOTE: the measured oracle yMax collapses 3.083 ->
  // 2.581 between z_w -1.0 and -0.8, so the stack looks 0.28/0.44 long here.
  // Pulling both forward faces back to that line was TRIED and measured
  // turret 76.1 (flat) with whole 77.5 -> 76.4 — the exposed crown re-phases
  // the whole row for no turret gain. Reverted; the r1 stations stand.
  const rwsPedestalTopY = 1.055;
  const rwsRearTierCenterY = rwsPedestalTopY + 0.13;
  const rwsFrontTierCenterY = rwsPedestalTopY + 0.10;
  P.add('turret', box(0.78, 0.22, 1.10), -0.23, 0.945, -0.75);                  // stack pedestal (z_w -0.80..-1.90)
  // These two electronics tiers were hovering 85-100 mm over the pedestal.
  // Seat their lower faces on its roof and keep them in the equipment bucket
  // so they do not inflate the base-turret armor envelope.
  P.addEquipment('turret', box(0.74, 0.26, 0.555), -0.23, rwsRearTierCenterY, -1.1125);
  P.addEquipment('turretDark', box(0.26, 0.15, 0.26), -0.45, 1.285, -0.90);
  P.add('turretGlass', box(0.18, 0.09, 0.02), -0.45, 1.30, -0.76);
  P.addEquipment('turret', box(0.60, 0.20, 0.55), -0.25, rwsFrontTierCenterY, -0.395);
  P.add('turretGlass', box(0.16, 0.08, 0.02), -0.25, 1.195, -0.11);
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', scale: 0.78, tone: 'dark', seed: 16, elev: 0.03, ammo: true, rotation: [0, Math.PI - 0.35, 0] });
    mg.position.set(0.10, 0.94, -0.80);                                         // stowed aft-right, SUNK into a pedestal tray (PROPORTION ROUND: the
    P.turretG.add(mg);                                                          // 1.06 seat's 3.02w receiver tops owned 8 front cols vs the ref's
                                                                                // clean 2.58-2.71 crown; §B3 census MG holds, tops now ~2.88w)
  }
  // Purpose-built low-profile 30 mm remote autocannon on the vehicle-left
  // crown. Its buried turntable, split shield, ammunition coffin, recoil
  // cradle, and independent EO head follow the M551A1 TTS station's useful
  // visual grammar without reusing that vehicle's geometry.
  const leftRwsX = -0.82;
  const leftRwsZ = -0.10;
  P.addEquipment('turretDetail', cylY(0.20, 0.23, 0.075, 14), leftRwsX, 1.0725, leftRwsZ);
  P.addEquipment('turret', box(0.44, 0.28, 0.52), leftRwsX, 1.30, leftRwsZ + 0.22);
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.10, 0.36, 0.62), leftRwsX + s * 0.255,
      1.33, leftRwsZ + 0.23, 0, 0, s * 0.15);
  }
  P.addEquipment('turret', box(0.60, 0.08, 0.58), leftRwsX, 1.53, leftRwsZ + 0.23);
  P.addEquipment('turret', box(0.30, 0.34, 0.44), leftRwsX - 0.37,
    1.32, leftRwsZ + 0.13, 0, -0.08, 0);
  P.add('turretDetail', box(0.32, 0.025, 0.46), leftRwsX - 0.37,
    1.502, leftRwsZ + 0.13, 0, -0.08, 0);
  P.addEquipment('turret', box(0.23, 0.30, 0.28), leftRwsX + 0.34,
    1.35, leftRwsZ + 0.15, 0, 0.08, 0);
  P.add('turretDark', box(0.19, 0.24, 0.025), leftRwsX + 0.35,
    1.35, leftRwsZ + 0.30, 0, 0.08, 0);
  P.add('turretGlass', box(0.085, 0.095, 0.014), leftRwsX + 0.32,
    1.40, leftRwsZ + 0.318, 0, 0.08, 0);
  P.add('turretGlass', box(0.052, 0.052, 0.014), leftRwsX + 0.40,
    1.31, leftRwsZ + 0.325, 0, 0.08, 0);
  {
    const autocannon = new THREE.Group();
    autocannon.name = 't14_left_remote_weapon';
    autocannon.userData.remoteControlled = true;
    autocannon.userData.caliberMm = 30;
    autocannon.userData.stationVariant = 'armata-30mm-autocannon';
    autocannon.userData.forwardFacing = true;
    const darkParts = [
      xform(cylX(0.065, 0.55, P.q ? 18 : 12), leftRwsX, 1.235, leftRwsZ + 0.33),
      xform(cylZ(0.050, 1.16, P.q ? 20 : 14), leftRwsX, 1.355, leftRwsZ + 1.00),
      xform(cylZ(0.088, 0.30, P.q ? 20 : 14), leftRwsX, 1.355, leftRwsZ + 0.44),
      xform(cylZ(0.066, 0.14, P.q ? 18 : 12), leftRwsX, 1.355, leftRwsZ + 1.65),
      xform(cylZ(0.024, 0.022, P.q ? 14 : 10), leftRwsX, 1.355, leftRwsZ + 1.73),
      xform(box(0.13, 0.11, 0.28), leftRwsX - 0.19, 1.38, leftRwsZ + 0.39),
    ];
    const geometry = mergeAll(darkParts);
    geometry.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
    const weaponMesh = new THREE.Mesh(geometry, P.mats.dark);
    weaponMesh.name = 't14_30mm_autocannon_mechanism';
    weaponMesh.castShadow = true;
    weaponMesh.receiveShadow = true;
    weaponMesh.userData.appearanceRole = 'machineGun';
    autocannon.add(weaponMesh);
    FITTINGS.markExact(autocannon, 'pintleMG');
    autocannon.name = 't14_left_remote_weapon';
    P.turretG.add(autocannon);
  }
  // meteo mast front-LEFT (print spike col: tip 3.37w at z_w 0.12, ONE
  // grid-centered column): base block + slim mast + crossbar vanes + tip
  P.add('turretDetail', box(0.10, 0.10, 0.10), -0.70, 0.895, 0.72);             // base block on the crown
  P.add('turretDetail', cylY(0.022, 0.028, 0.56, 8), -0.70, 1.22, 0.72);        // mast
  P.add('turretDetail', box(0.14, 0.025, 0.025), -0.70, 1.38, 0.72);            // crossbar (vanes at 3.06w — ref front band 2.7-3.0)
  P.add('turretDark', cylX(0.024, 0.06, 8), -0.765, 1.38, 0.72);                // vane pods
  P.add('turretDark', cylX(0.024, 0.06, 8), -0.635, 1.38, 0.72);
  P.add('turretDetail', cylY(0.012, 0.012, 0.14, 6), -0.70, 1.565, 0.72);       // tip joint sleeve
  P.add('turretDark', box(0.045, 0.09, 0.045), -0.70, 1.64, 0.72);              // tip sensor (3.37w)
  P.add('turretDark', box(0.04, 0.06, 0.04), -0.70, 1.32, 0.83);                // aft sensor pod (3.06w — ref's second meteo column)
  for (const s of [-1, 1]) {                                                    // Afganit AESA / optical cheek pockets
    // Four armor rails form a real square recess rather than a solid boss.
    // Three separately inset panes read as thermal/daylight/laser channels,
    // with the smallest lower pane doubling as an IR illuminator.
    const sensorYaw = s * 0.55;
    const sensorPitch = -0.10;
    const sensorCenter = new THREE.Vector3(s * 0.90, 0.56, 1.367);
    const sensorEuler = new THREE.Euler(sensorPitch, sensorYaw, 0, 'XYZ');
    const onSensor = (dx, dy, depth) => new THREE.Vector3(dx, dy, depth)
      .applyEuler(sensorEuler).add(sensorCenter);
    for (const [dx, dy, w, h] of [
      [0, 0.15, 0.36, 0.055], [0, -0.15, 0.36, 0.055],
      [-0.15, 0, 0.055, 0.245], [0.15, 0, 0.055, 0.245],
    ]) {
      const rail = onSensor(dx, dy, 0);
      P.addEquipment('turret', box(w, h, 0.07), rail.x, rail.y, rail.z,
        sensorPitch, sensorYaw, 0);
    }
    const socket = onSensor(0, 0, -0.014);
    P.add('turretDark', box(0.265, 0.245, 0.038), socket.x, socket.y, socket.z,
      sensorPitch, sensorYaw, 0);
    const apertures = [
      [-s * 0.050, 0.042, 0.115, 0.105],
      [s * 0.066, 0.052, 0.060, 0.060],
      [s * 0.064, -0.062, 0.052, 0.050],
    ];
    for (const [dx, dy, w, h] of apertures) {
      const lens = onSensor(dx, dy, 0.004);
      P.add('turretGlass', box(w, h, 0.012), lens.x, lens.y, lens.z,
        sensorPitch, sensorYaw, 0);
    }
    const divider = onSensor(-s * 0.003, -0.015, 0.002);
    P.add('turretDetail', box(0.018, 0.19, 0.014), divider.x, divider.y, divider.z,
      sensorPitch, sensorYaw, 0);
    P.add('turretDark', box(0.28, 0.26, 0.04), s * 1.19, BK + 0.10, -0.24, 0.1, s * 2.6, 0); // rear pair tucked to the trimmed shoulder (was 1.24 —
  }                                                                             // proud of the new belt edge at the ±1.42 plan cols)

  // Distributed unmanned-turret electronics: shoulder cameras, corner laser
  // warning receivers, side APS controllers, rear observation cameras and
  // armored cable raceways. Every housing begins on a known roof/facet datum;
  // the glass elements stay proud enough to read without becoming floaters.
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.20, 0.12, 0.27), s * 0.61, AH + 0.06, 0.57,
      -0.06, -s * 0.08, 0);
    P.add('turretDark', box(0.15, 0.074, 0.035), s * 0.61, AH + 0.07, 0.716,
      -0.06, -s * 0.08, 0);
    P.add('turretGlass', box(0.098, 0.046, 0.014), s * 0.61, AH + 0.07, 0.739,
      -0.06, -s * 0.08, 0);

    P.addEquipment('turretDetail', cylY(0.052, 0.062, 0.055, 10),
      s * 0.83, AH + 0.0275, 0.90);
    P.add('turretGlass', cylY(0.038, 0.042, 0.018, 10),
      s * 0.83, AH + 0.064, 0.90);

    P.addEquipment('turretDetail', box(0.14, 0.17, 0.18),
      s * 1.12, 0.61, 0.31, 0, s * Math.PI / 2, 0);
    P.add('turretGlass', box(0.085, 0.075, 0.014),
      s * 1.218, 0.63, 0.31, 0, s * Math.PI / 2, 0);

    P.addEquipment('turret', box(0.16, 0.11, 0.20),
      s * 0.57, 1.09, -0.45, 0, Math.PI, 0);
    P.add('turretDark', box(0.12, 0.070, 0.025),
      s * 0.57, 1.095, -0.558, 0, Math.PI, 0);
    P.add('turretGlass', box(0.075, 0.040, 0.012),
      s * 0.57, 1.095, -0.578, 0, Math.PI, 0);

    P.add('turretDetail', box(0.034, 0.022, 0.54),
      s * 0.43, AH + 0.012, 0.55, 0, -s * 0.24, 0);
  }
  P.addEquipment('turretDetail', cylY(0.055, 0.065, 0.070, 12),
    0, AH + 0.035, 1.02);
  P.add('turretGlass', cylY(0.041, 0.046, 0.022, 12),
    0, AH + 0.081, 1.02);
  // vertical smoke-tube banks on the bustle flanks
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', cylY(0.035, 0.035, 0.3, 8), s * (0.72 + k * 0.09), 0.90 - k * 0.02, -0.68, 0.12, 0, s * 0.15);
    }
  }
  // Raised-crown service seams are narrow inspection breaks, not filled roof
  // panels. The rear pair also provides a visual load path to the RWS stack.
  P.add('turretDark', box(0.022, 0.012, 0.44), 0, 1.035 + 0.006, -0.28);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.54, 0.012, 0.022), s * 0.31, 1.035 + 0.006, -0.44);
  }
  // GLONASS dome on the rear crown center (roof-presence order; top 2.79w —
  // under the ref's 3.15 center plateau, mask-interior from side/plan)
  P.add('turretDark', cylY(0.05, 0.05, 0.045, 10), 0.05, 1.0575, -0.30);
  P.add('turretDetail', cylY(0.062, 0.062, 0.014, 10), 0.05, 1.028, -0.30);     // mount collar
  // Paired rear communications whips overlap the 0.835 m bustle roof through
  // armored collars instead of starting in free air.
  for (const [x, rake, seed] of [[-0.66, -0.035, 22], [0.46, 0.035, 23]]) {
    P.addEquipment('turretDark', cylY(0.055, 0.065, 0.055, 10), x, 0.8625, -1.88);
    const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 0.78, r: 0.010, rake, seed });
    antenna.name = `t14_rear_antenna_${x < 0 ? 'left' : 'right'}`;
    antenna.position.set(x, 0.89, -1.88);
    P.turretG.add(antenna);
  }
  // clean 2A82 tube: thermal sleeve, NO evacuator (§16.1 key barrel read).
  // The current reference packet measures a 9.97 m overall envelope over
  // the −4.32 m tail.  Preserve the wholly authored 2A82 construction but
  // shorten its run to that datum; the old 6.45 m tube made the procedural
  // vehicle roughly 0.8 m too long and was the dominant gun-profile miss.
  // bore line 2.03w level (the print's tube). Chin + boot at the ladder-r1
  // trough station (gun pivot world z 0.0).
  P.addGunExtra(box(0.44, 0.44, 0.3), 0, 0.02, 1.38);                           // shroud chin
  P.addGunExtra(cylZ(0.14, 0.36, 12, 0.17), 0, 0, 1.50);                        // boot collar
  buildGun(P, { len: 5.64, r: 0.07, sleeve: true, evac: null, baseR: 0.15 });
  muzzleBore(P, { len: 5.64, r: 0.07 });                                        // §B3.1 (shadow-named, 3fca39b)
  // 7 road wheels (first Russian 7-wheel), sprocket rear, deep skirts hide
  // the top run. LADDER r1 gear re-seat (oracle ground truth): the print's
  // ground span is x 1.09..1.63 / z -2.47..+2.85 with HIGH-TUCKED end
  // wheels (departure/approach ramps rise from z ±2.5 to end drums mostly
  // hidden behind the skirt band — §B6 trapezoid emphatically holds).
  // Shoe orbits (r + 0.175): sprocket {−3.50, 1.00, 0.33} far −4.005 /
  // bottom 0.495; idler {3.52, 0.98, 0.30} far 3.995 / bottom 0.505 —
  // both clear of the center-lane bow/tail solids (±1.06 vs track inner
  // 1.09, 0.03 lane law) and under the 1.665 fender line.
  // FINISH r2: end drums raised further (§B6 trapezoid stronger) — the
  // print's band ramps sit HIGH (ref stern bottoms 0.64-0.76 vs the old
  // 0.33-0.52 read): sprocket shoe-orbit top 1.535 = sponson floor 1.565
  // − 0.03 EXACT (§B4 lane law), idler 1.415. Track-clip re-verified.
  // PROPORTION ROUND (owner "not wide at all" — the stance): the ref's
  // ground span reads x 1.09..1.61 with WIDE dual roadwheels (0.52-class);
  // the old 0.22 wheels at xc 1.33 put the visible wheel faces 1.22..1.44 —
  // 17 cm inboard of the ref's outer face per side. Band 1.09..1.59 (inner
  // face pinned by the ±1.06 belly + 0.03 lane law), wheels 1.12..1.56.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.44, xc: 1.34, dishR: 0.76,
    wheelZs: [2.85, 1.963, 1.076, 0.19, -0.697, -1.584, -2.47],
    sprocket: { z: -3.42, y: 1.08, r: 0.28 }, idler: { z: 3.55, y: 0.94, r: 0.26 },
    rollers: [2.2, 0.75, -0.75, -2.2].map((z) => ({ z, y: 1.12, r: 0.08 })),
    // pinCapOuter (bradley §D class): the default caps would reach
    // xc + trackW*0.49 + 0.029 = 1.614 — 16 mm from the widened fringe's
    // 1.63 inner face (lane law wants 0.03+). Clamped flush with the pads.
    trackW: 0.50, topY: 1.28, contactZF: 2.92, contactZR: -2.50, pinCapOuter: 0.24,
    // §B8.1 NATIVE-TONE wheel countability (the print's 7 wheels read
    // pale-green under the skirt; the stock rubber read near-black).
    paintedEnds: true, coveredTop: true, tireHex: '#4e5544',
  });
  // Malachit ERA: tile field flat on the 8.8-deg upper glacis (dark
  // mounting bed under the rows so the seams read recessed)
  const t14GlacisZ = (y) => 2.15 + (1.665 - y) * 6.43;
  for (const s of [-1, 1]) {
    // The backing sheet had the opposite pitch from the glacis, so its rear
    // edge dove through the hull while its forward edge floated. Match the
    // actual 8.8-degree nose plane; the tiles already use the equivalent
    // face-normal rotation below.
    P.add('hullDark', box(1.44, 0.025, 1.55), s * 0.80, 1.50, 3.03, 8.8 * D2R, 0, 0);
  }
  P.eraCluster('glacis_era_R', (put) => {
    for (let row = 0; row < 4; row++) for (let c = 0; c < 5; c++) {
      const y = 1.625 - row * 0.055;
      put(0.17 + c * 0.33, y + 0.02, t14GlacisZ(y), -81.2 * D2R, 0, 0);
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (let row = 0; row < 4; row++) for (let c = 0; c < 5; c++) {
      const y = 1.625 - row * 0.055;
      put(-0.17 - c * 0.33, y + 0.02, t14GlacisZ(y), -81.2 * D2R, 0, 0);
    }
  });
  // tile field on the three front armor panels (faces 1.86 + thin tiles —
  // inside the rear-screen ±1.945 width anchor)
  P.eraCluster('skirt_era_R', (put) => {
    for (let c = 0; c < 7; c++) for (let row = 0; row < 3; row++)
      put(1.865, 0.95 + row * 0.23, 3.75 - c * 0.44, 0, Math.PI / 2, 0);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (let c = 0; c < 7; c++) for (let row = 0; row < 3; row++)
      put(-1.865, 0.95 + row * 0.23, 3.75 - c * 0.44, 0, -Math.PI / 2, 0);
  });
  // white 512 on the FRONT ERA panel tile field (the dense rear screen now
  // walls off the old band-face seat; parade T-14s carry the number on the
  // forward skirt panels). Tile faces 1.94 — decal planes 5 mm proud.
  // PROPORTION ROUND: decal planes pinned 5 mm proud of the TILE faces
  // (1.90) — the old 1.9455 seat floated 45 mm off the panel (§D decal-float
  // phantom-column hazard) and was the single widest point on the model.
  P.decal('hull', 'number', '512', 0.30, [1.905, 1.22, 3.05], Math.PI / 2);
  P.decal('hull', 'number', '512', 0.30, [-1.905, 1.22, 3.05], -Math.PI / 2);
  P.turretG.userData.t14RoofFidelityReceipt = {
    lowerBeltHeightM: BK,
    roofDatumM: 1.035,
    moldedCrown: true,
    crownPlanVertexCount: t14RoofPlan.length,
    crownThroatHalfWidthM: 0.18,
    crownShoulderHalfWidthM: 0.95,
    mainRwsPedestalTopM: rwsPedestalTopY,
    mainRwsRearTierBottomM: rwsRearTierCenterY - 0.13,
    mainRwsFrontTierBottomM: rwsFrontTierCenterY - 0.10,
    leftRemoteWeaponStation: true,
    leftRemoteWeaponStationX: leftRwsX,
    leftRemoteWeaponCaliberMm: 30,
    leftRemoteWeaponVariant: 'armata-30mm-autocannon',
    leftRemoteWeaponForwardFacing: true,
    rearAntennaCount: 2,
    cheekSensorRecessCount: 2,
    cheekSensorLensCount: 6,
    auxiliaryTechPartCount: 22,
    externalTechLensCount: 9,
  };
  P.hullG.userData.t14HullFidelityReceipt = {
    glacisAngleDeg: 8.8,
    glacisBackingFacesOutward: true,
    frontMudguardsSupported: true,
  };
  P.topY = AH + 0.85;                                                           // sensor mast top
}

/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const MODERN2_BUILDERS = {
  leo2a4: buildLeo2A4,
  t80u: buildT80U,
  leclerc: buildLeclerc,
  // Complete first-party rebuild. The supplied GLB is used only as a
  // read-only measurement/visual oracle: no source mesh, vertex payload or
  // runtime import participates in this playable. Every triangle comes from
  // the authored KIT construction in buildType99A above.
  type99a: buildType99A,
  leo1a5: buildLeo1A5,
  mbt70: buildMBT70,
  t14: buildT14,
};
