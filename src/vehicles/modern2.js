// src/vehicles/modern2.js — HD procedural builders + specs for the modern
// roster expansion, wave 2 (docs/research/modern-roster.md):
//   leo2a4  Leopard 2A4        (§9,  priority 3)
//   t80u    T-80U              (§15, priority 3)
//   leclerc Leclerc S2         (§20, priority 3)
//   type99a Type 99A / ZTZ-99A (§22, priority 3)
//   leo1a5  Leopard 1A5        (§10, priority 4)
//   t14     T-14 Armata        (§16, priority 4)
//
// Registration pattern (established by modern1.js): tankFactory.js imports
// MODERN2_BUILDERS and merges it into its BUILDERS table at the clearly-marked
// extension hook; builders draw on tankFactory's exported geometry KIT.
// NOTE: tankFactory <-> modern2 is a deliberate module cycle — this module
// must not READ tankFactory bindings at module scope (TDZ during our
// evaluation); builders destructure KIT at call time. Specs/model-source rows
// register here by mutating the exported specs.js tables (specs.js itself is
// a contested file, left untouched). Armor values are open-source RHAe
// estimates per the roster doc (game-design baselines).

import * as THREE from 'three';
import { KIT } from './tankFactory.js';
// §I fittings census: the FITTINGS import is the spelling that survives
// synchronous top-level createTank rigs (kit.js attach-site note).
import { FITTINGS, muzzleBore } from './profiles/kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

// type99a REMOVED from the roster BY OWNER 2026-08-06 (owner order relayed
// at the oracle-backed moderns round; icons already deleted) — its spec +
// buildType99A stay DORMANT below (k2/leo2a7 delist pattern): no TANK_SPECS
// row, no garage card, no ledger row.
export const MODERN2_IDS = ['leo2a4', 't80u', 'leclerc', 'leo1a5', 't14'];

// ---------------------------------------------------------------------------
// Pure spec helpers (local copies — specs.js keeps its helpers module-local).
// Same math as specs.js: par() planarity guarantee, apfsdsPens anchoring.
// ---------------------------------------------------------------------------

function par(name, physicalMm, v0, v1, v3, o = {}) {
  const v2 = [v1[0] + v3[0] - v0[0], v1[1] + v3[1] - v0[1], v1[2] + v3[2] - v0[2]];
  return {
    name,
    verts: [v0, v1, v2, v3],
    physicalMm,
    keMm: o.keMm !== undefined ? o.keMm : physicalMm,
    ceMm: o.ceMm !== undefined ? o.ceMm : physicalMm,
    kind: o.kind || 'main',
    era: o.era || null,
    moduleLink: o.moduleLink || null,
    gunFollow: !!o.gunFollow,
  };
}
const fr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [-w, yB, zB], [w, yB, zB], [-w, yT, zT], o);
const rr = (name, mm, w, yB, zB, yT, zT, o) =>
  par(name, mm, [w, yB, zB], [-w, yB, zB], [w, yT, zT], o);
const sR = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [xB, yB, zF], [xB, yB, zR], [xT, yT, zF], o);
const sL = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  par(name, mm, [-xB, yB, zR], [-xB, yB, zF], [-xT, yT, zR], o);
const rf = (name, mm, w, y, zR, zF, o) =>
  par(name, mm, [-w, y, zF], [w, y, zF], [-w, y, zR], o);
const chR = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [xIn, y0, zIn], [xOut, y0, zOut], [xIn - xi, y1, zIn - tb], o);
const chL = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  par(name, mm, [-xOut, y0, zOut], [-xIn, y0, zIn], [-xOut + xi, y1, zOut - tb], o);
const mbox = (module, min, max, turretLocal = false) => ({ module, min, max, turretLocal });
const cbox = (crew, min, max, turretLocal = false) => ({ crew, min, max, turretLocal });
const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps, extra) => ({
  name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
  moduleDmg: caliberMm, tracer: type, ...(extra || {}),
});
const apfsdsPens = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000), quoted2km];
};
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

// ERA behavior packs (t90m precedent: keReduction fraction + flat CE add).
const KONTAKT5 = { keReduction: 0.20, ceFlatMm: 400 };
const FY4 = { keReduction: 0.22, ceFlatMm: 380 };
const MALACHIT = { keReduction: 0.25, ceFlatMm: 450 };

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------
export const MODERN2_SPECS = {
  leo2a4: {
    id: 'leo2a4', name: 'Leopard 2A4', nation: 'Germany', era: 'modern', class: 'mbt',
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
    dims: { hullLengthM: 7.72, overallLengthM: 9.67, widthM: 3.70, heightM: 2.48 },
    armor: mbtArmor({
      hl: 3.86, hw: 1.85, roofY: 1.72, trkTop: 1.0, floor: 0.5,
      turretPivot: [0, 1.72, -0.15], gunPivot: [0, 0.42, 0.55],
      barrelLenM: 5.28, barrelRadM: 0.079,
      glacis: { ke: 400, ce: 600, phys: 450 }, lower: { ke: 250, ce: 300 },
      side: { ke: 80, ce: 80 }, rear: 45, roof: 40,
      cheek: { ke: 420, ce: 700, phys: 600 }, tSide: { ke: 300, ce: 420 },
      tRear: 60, tRoof: 40, mantlet: { ke: 350, ce: 420 },
      tHalfW: 1.20, tFrontZ: 0.95, tRearZ: -1.90, tH: 0.76,
      glacisNoseZ: 3.83, glacisTopZ: 1.0, crew4: true,
    }),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '414', trackWidthM: 0.635, camoScale: 0.5,
    },
  },

  t80u: {
    id: 't80u', name: 'T-80U', nation: 'USSR/Russia', era: 'modern', class: 'mbt',
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
    dims: { hullLengthM: 7.01, overallLengthM: 9.65, widthM: 3.60, heightM: 2.20 },
    armor: mbtArmor({
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
    }),
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
    id: 'leclerc', name: 'Leclerc S2', nation: 'France', era: 'modern', class: 'mbt',
    hp: 2350,
    enginePowerHp: 1500, weightTons: 54.5, topSpeedKmh: 71, reverseSpeedKmh: 25,
    hullTraverseDegS: 46,
    terrainResistance: MODERN_TR, pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 15, gunDepressionDeg: 8,
    gun: {
      caliberMm: 120, reloadS: 5.0, baseAccuracy: 0.30, aimTimeS: 1.9,
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

  type99a: {
    id: 'type99a', name: 'Type 99A (ZTZ-99A)', nation: 'China', era: 'modern', class: 'mbt',
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
    dims: { hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.5, heightM: 2.35 },
    armor: mbtArmor({
      hl: 3.8, hw: 1.75, roofY: 1.42, trkTop: 1.0, floor: 0.43,
      turretPivot: [0, 1.42, 0.1], gunPivot: [0, 0.34, 0.55],
      barrelLenM: 6.25, barrelRadM: 0.068,
      glacis: { ke: 500, ce: 700, phys: 550 }, lower: { ke: 130, ce: 130 },
      side: { ke: 100, ce: 100 }, rear: 45, roof: 45,
      cheek: { ke: 600, ce: 850, phys: 700 }, tSide: { ke: 300, ce: 420 },
      tRear: 55, tRoof: 45, mantlet: { ke: 380, ce: 450 },
      tHalfW: 1.15, tFrontZ: 0.95, tRearZ: -1.45, tH: 0.72,
      glacisNoseZ: 3.72, glacisTopZ: 2.05,
      hullEra: [
        // ERA-DEF/GEOMETRY COUPLING (BASE-21 rebuild 2026-08-06): era-kind
        // defs move WITH the re-anchored geometry — skirts to the ±1.75/1.76
        // anchor (the old 1.86 floated outside it), glacis onto the new
        // 19-deg plane. Core armor untouched (orchestrator lane).
        fr('glacis_era_L', 15, 0.8, 0.95, 3.46, 1.42, 2.10, { kind: 'era', era: FY4 }),
        fr('glacis_era_R', 15, 0.8, 0.95, 3.46, 1.42, 2.10, { kind: 'era', era: FY4 }),
        sR('skirt_era_R', 15, 1.76, 0.55, 1.76, 1.15, 0.3, 3.45, { kind: 'era', era: FY4 }),
        sL('skirt_era_L', 15, 1.76, 0.55, 1.76, 1.15, 0.3, 3.45, { kind: 'era', era: FY4 }),
      ],
      turretEra: [
        chR('turret_era_R', 15, 0.24, 1.05, 1.20, 0.28, 0.05, 0.62, 0.08, 0, { kind: 'era', era: FY4 }),
        chL('turret_era_L', 15, 0.24, 1.05, 1.20, 0.28, 0.05, 0.62, 0.08, 0, { kind: 'era', era: FY4 }),
      ],
    }),
    visual: {
      // PLA woodland digital splinter (tight micro-square scale)
      scheme: 'digital', base: '#4d573f', weather: '#57614a',
      patches: ['#6f684c', '#39412f', '#23261e'],
      marking: 'number', number: '215', trackWidthM: 0.58, camoScale: 0.42,
    },
  },

  leo1a5: {
    id: 'leo1a5', name: 'Leopard 1A5', nation: 'Germany', era: 'modern', class: 'mbt',
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
      barrelLenM: 5.2, barrelRadM: 0.062,
      glacis: { ke: 70, ce: 70, phys: 70 }, lower: { ke: 70, ce: 70 },
      side: { ke: 35, ce: 35 }, rear: 25, roof: 20,
      cheek: { ke: 120, ce: 120, phys: 120 }, tSide: { ke: 45, ce: 45 },
      tRear: 35, tRoof: 20, mantlet: { ke: 120, ce: 120 },
      tHalfW: 1.05, tFrontZ: 0.75, tRearZ: -1.15, tH: 0.72,
      glacisNoseZ: 3.50, glacisTopZ: 1.45, crew4: true,
    }),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '123', trackWidthM: 0.55, camoScale: 0.5,
    },
  },

  t14: {
    id: 't14', name: 'T-14 Armata', nation: 'Russia', era: 'modern', class: 'mbt',
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
    dims: { hullLengthM: 8.7, overallLengthM: 10.8, widthM: 3.9, heightM: 3.16 },
    armor: mbtArmor({
      // MEASURED-LADDER r1 (oracle 3DYAROSLAV2 print, §B8 proportion truth):
      // deck raised to the print's 1.685 line (the r7 eyeball cut 1.62->1.50
      // predates the oracle; the print + the published 2.7 roof both want
      // the higher deck), gun bore-line 2.03 (print tube axis, level).
      hl: 4.35, hw: 1.95, roofY: 1.685, trkTop: 1.05, floor: 0.43,
      turretPivot: [0, 1.685, -0.60], gunPivot: [0, 0.345, 0.6],
      // gunBarrel proxy true-up (packet-filed literal, §C shadow-proxy
      // sizes law): the built 2A82 visible run is 6.45 (pivot world z 0.0,
      // muzzle +6.45 = 10.8 overall) — was a stale 6.0.
      barrelLenM: 6.45, barrelRadM: 0.07,
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
  if (P.q) for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.6, 0.02, 0.05), 0, 1.39, -1.6 - k * 0.16);
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
  if (P.q) for (let k = 0; k < 7; k++) P.add('hullDetail', box(1.8, 0.025, 0.06), 0, 1.615, -1.68 - k * 0.17);
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
// Type 99A / ZTZ-99A — BASE-21 photo-class rebuild (owner directive
// 2026-08-06; authored from the slice-3 build-ready blueprint in
// docs/references/tanks/type99a.md — every station below is that spec's
// computed value). PHOTO CLASS, no oracle — FALSE-0: never gate this id.
// Family inspo = the russia/t72 lineage (low hull, center driver, rear
// drive, 125 boot, log + fuel drums, NSVT-class 12.7) under a WELDED
// ANGULAR turret with wedge appliqué cheeks meeting the ARROW SEAM —
// never the russia cast dome (§H.4). FY-4 ERA: chevron glacis field +
// skirt tile WALL + cheek arrays, all via the armor-linked eraClusters
// (ERA-DEF/GEOMETRY COUPLING law: the era-kind plate defs moved to the
// new ±1.75 anchor in this same edit).
// Old-build debts closed: skirts/tiles at ±1.90-1.93 vs the 3.5 spec
// (§D violation), muzzle +6.90 = 10.70 vs 11.0, census mg0+0d.
// Frame (§D): width anchor ±1.75 EXACT (skirt tile + panel faces); hull
// z ±3.80; muzzle +7.20 = 11.0 EXACT; roof world 2.14; published 2.35 =
// the crest line (pano head 2.50 / mast 2.64 documented real-fitting
// spikes, t14 precedent).
// ---------------------------------------------------------------------------
function buildType99A(P) {
  const { box, frustum, polyTurret, cylY, cylX, cylZ, torus,
    buildGun, buildRunningGear, fenders, liftEye, periscope,
    smokeCluster, stowage, tarpRoll, ammoCan } = KIT;
  const slab = orientedSlab99;                                                  // §C missing-side law
  const { rng } = P;
  const D2R = Math.PI / 180;
  const num = P.spec.visual.number || '';
  // ---- GEAR (§B6 trapezoid; blueprint lane math: band 1.08..1.66, outer
  // face 0.03 clear of the 1.69 skirt inner plane; orbits: sprocket far
  // -3.715/top 1.025, idler far +3.715/top 0.975 = the crest) --------------
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.37, wheelW: 0.22, wheelY: 0.47, xc: 1.37,
    dishR: 0.78,
    wheelZs: [2.50, 1.50, 0.50, -0.50, -1.50, -2.50],
    sprocket: { z: -3.22, y: 0.53, r: 0.32 }, idler: { z: 3.24, y: 0.50, r: 0.30 },
    rollers: [1.55, 0, -1.55].map((z) => ({ z, y: 0.90, r: 0.08 })),
    trackW: 0.58, topY: 0.90, arms: true, paintedEnds: true, coveredTop: 1.0,
  });
  // ---- hull: belly + deck band (t72-low roof 1.42 = the ring base) -------
  P.add('hull', box(2.10, 0.60, 7.55), 0, 0.70, 0);                            // belly ±1.05, y 0.40..1.00 (0.03
                                                                               //   inboard of the 1.08 band face —
                                                                               //   §B2 channels stay open)
  P.add('hull', frustum(1.60, 2.10, -3.78, 1.56, 2.05, -3.74, 1.00, 1.42));    // deck band
  fenders(P, 1.05, 1.74, 1.02, -3.74, 3.60, 0.03);
  // ---- GLACIS (§B1 ONE plane, 19 deg: y(z) = 1.42 - 0.3448(z - 2.05), in
  // CO-PLANAR pieces per the t14 FRUSTUM-UNDERSIDE law). FULL-WIDTH-TOE
  // BINDING MATH (banked): underside vs the 0.975 idler crest @ z 3.24 —
  // any full-width toe forward of ~3.1 clips; 3.02 clears by >=0.19. ------
  P.add('hull', slab(                                                          // center prow ±1.05, the FULL line
    [-1.05, 0.82, 3.79], [1.05, 0.82, 3.79], [1.05, 0.78, 3.67], [-1.05, 0.78, 3.67],
    [-1.05, 1.42, 2.05], [1.05, 1.42, 2.05], [1.05, 1.42, 1.87], [-1.05, 1.42, 1.87]));
  P.add('hull', slab(                                                          // full-width piece STARTS AT THE
    [-1.60, 1.086, 3.02], [1.60, 1.086, 3.02], [1.60, 1.046, 2.90], [-1.60, 1.046, 2.90], // TOE z 3.02 on the same plane
    [-1.60, 1.42, 2.05], [1.60, 1.42, 2.05], [1.60, 1.42, 1.87], [-1.60, 1.42, 1.87]));
  P.add('hull', slab(                                                          // lower bow center lane, co-planar
    [-1.05, 0.40, 3.55], [1.05, 0.40, 3.55], [1.05, 0.40, 3.43], [-1.05, 0.40, 3.43],
    [-1.05, 0.82, 3.79], [1.05, 0.82, 3.79], [1.05, 0.78, 3.67], [-1.05, 0.78, 3.67]));
  // front mudguards + flaps (blueprint margins: guard underside 1.005 over
  // the 0.975 crest; flap inner 3.742 = 0.027 clear of the +3.715 orbit)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.64, 0.03, 0.44), s * 1.39, 1.02, 3.50);
    P.add('hullRubber', box(0.56, 0.30, 0.026), s * 1.40, 0.86, 3.755);
  }
  // ---- rear: center lane below the band + full width above; russia kit --
  P.add('hull', box(2.06, 0.60, 0.08), 0, 0.70, -3.72);                        // center-lane plate, face -3.76
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.70, 0.38, 0.05), s * 0.90, 1.24, -3.775);          // exhaust grilles
    if (P.q) for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.66, 0.045, 0.05), s * 0.90, 1.11 + k * 0.09, -3.79);
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.44, 1.36, -3.77);           // taillights
    P.add('hullRubber', box(0.56, 0.30, 0.026), s * 1.40, 0.84, -3.755);       // rear flaps (0.027 clear of -3.715)
  }
  P.add('hullDetail', box(0.30, 0.18, 0.04), 0, 1.22, -3.78);                  // convoy light plate
  P.add('hullDark', box(0.06, 0.28, 0.45), -1.72, 0.95, -2.30);                // LEFT hull exhaust port (t72 read)
                                                                               //   — outward-facing plate on the
                                                                               //   skirt line, face -1.75 (§D: the
                                                                               //   blueprint's 0.45-along-x dims
                                                                               //   reached -1.855 and rescaled the
                                                                               //   whole build; WIDTH-GUARD-BY-
                                                                               //   DRESSING law)
  P.decal('hull', 'soot', null, 0.8, [-1.66, 0.95, -2.62], -Math.PI / 2);
  // unditching log (§I fitting) + TWIN FUEL DRUMS (hand-authored russia
  // read; hull furniture — they never yaw, §B5)
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.4, r: 0.10, straps: 2, seed: 9 });
    log.position.set(0, 1.30, -3.68);                                          // spans x ±1.2 — overlaps the flap
    P.hullG.add(log);                                                          //   columns (no top-down slot)
  }
  for (const s of [-1, 1]) {
    // drums LEVEL (the r1 nose-up tilt pinched two 10-cell §B2 slivers
    // between the elliptical rear rims, the log end and the flap edges —
    // axis-aligned plan rectangles cannot pinch)
    P.add('hullDark', cylZ(0.28, 0.80, 14), s * 0.88, 1.35, -3.35);            // fuel drums, z -2.95..-3.75
    // end ribs: KIT.torus lies AXIS-Y — rx pi/2 stands the rings around the
    // drum's z axis (the r1 flat donuts poked 28cm past the stern and their
    // donut-hole crescents were the §B2 10-cell flood pair)
    P.add('hullDetail', torus(0.28, 0.018, 14), s * 0.88, 1.35, -3.74, Math.PI / 2, 0, 0);
    P.add('hullDetail', torus(0.28, 0.018, 14), s * 0.88, 1.35, -2.96, Math.PI / 2, 0, 0);
    P.add('hullDetail', box(0.08, 0.26, 0.06), s * 0.88, 1.10, -3.14);         // saddle brackets
    P.add('hullDetail', box(0.08, 0.26, 0.06), s * 0.88, 1.10, -3.56);
  }
  // ---- glacis furniture ON the plane: center driver hatch + periscopes,
  // splash V, deck seams, engine field, fender bins, shadow strips ---------
  P.add('hull', box(0.50, 0.05, 0.45), 0, 1.435, 2.15, -19 * D2R, 0, 0);       // driver CENTER hatch (99A tell)
  P.add('hullDark', box(0.44, 0.02, 0.38), 0, 1.462, 2.14, -19 * D2R, 0, 0);
  periscope(P, 'hullDetail', -0.14, 1.475, 1.90);
  periscope(P, 'hullDetail', 0.14, 1.475, 1.90);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.85, 0.045, 0.07), s * 0.42, 1.24, 2.62, -19 * D2R, s * 0.42, 0); // splash V
  }
  P.add('hullDark', box(1.55, 0.02, 0.85), 0, 1.43, -2.60);                    // engine grille inset
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.45, 0.02, 0.05), 0, 1.437, -2.30 - k * 0.15);
  P.add('hull', box(0.90, 0.08, 0.80), -0.45, 1.46, -1.55);                    // intake hump
  P.add('hullDark', box(0.78, 0.02, 0.66), -0.45, 1.505, -1.55);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.16, 1.10), s * 1.45, 1.10, 1.20);                // fender stowage boxes
    P.add('hullDark', box(0.31, 0.014, 1.12), s * 1.45, 1.185, 1.20);          // lid seams
    P.add('hull', box(0.30, 0.16, 1.10), s * 1.45, 1.10, -0.60);
    P.add('hullDark', box(0.31, 0.014, 1.12), s * 1.45, 1.185, -0.60);
    P.add('hullShadow', box(0.52, 0.026, 7.0), s * 1.38, 1.00, -0.05);         // sponson shadow strips
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.020, seed: 11,
      pts: [[1.28, 1.05, 3.22], [0.40, 1.30, 2.50], [-0.60, 1.20, 2.80]] });   // draped over the ERA field
    P.hullG.add(tc);
    for (const s of [-1, 1]) {
      const lc = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, r: 0.045, rake: -0.30, seed: 5 + s });
      lc.position.set(s * 1.42, 1.06, 3.55);
      P.hullG.add(lc);
    }
  }
  liftEye(P, 'hullDetail', -1.15, 1.44, 1.60);
  liftEye(P, 'hullDetail', 1.15, 1.44, 1.60);
  liftEye(P, 'hullDetail', -1.15, 1.44, -2.95);
  liftEye(P, 'hullDetail', 1.15, 1.44, -2.95);
  // ---- SKIRTS at the ±1.75 anchor (§D guard): 3 thick front panels +
  // FY-4 TILE WALL (armor-linked bricks, faces ±1.75 EXACT) + rubber rear -
  for (const s of [-1, 1]) {
    for (const zc of [2.90, 1.80, 0.70]) {
      P.add('hull', box(0.05, 0.56, 1.05), s * 1.715, 0.86, zc);               // front panels (faces 1.69/1.74)
      P.add('hull', box(0.05, 0.10, 1.05), s * 1.715, 0.555, zc, s * 0.20, 0, 0); // chamfered lower lips
      P.add('hullDark', box(0.055, 0.50, 0.022), s * 1.715, 0.86, zc - 0.525); // deep seams
    }
    P.add('hullRubber', box(0.035, 0.42, 3.40), s * 1.705, 0.82, -1.95);       // rear rubber run
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.042, 0.34, 0.02), s * 1.706, 0.80, -0.60 - k * 0.68);
    P.add('hullRubber', box(0.03, 0.10, 3.36), s * 1.70, 0.575, -1.95);        // lower fringe
  }
  P.eraCluster('skirt_era_R', (put) => {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 7; c++)
      put(1.715, 0.66 + row * 0.23, 3.30 - c * 0.47, 0, Math.PI / 2, 0);       // tile faces ±1.75 EXACT
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 7; c++)
      put(-1.715, 0.66 + row * 0.23, 3.30 - c * 0.47, 0, -Math.PI / 2, 0);
  });
  // ---- GLACIS ERA (FY-4 chevron field): dark mounting bed first (t14 r5
  // lesson — inter-tile gaps read as recessed seams), then the clusters ----
  const zOf = (y) => 2.05 + (1.42 - y) * 2.90 + 0.05;
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.50, 0.60, 0.025), s * 0.80, 1.19, zOf(1.19) - 0.045, -71 * D2R, 0, 0);
  }
  P.eraCluster('glacis_era_R', (put) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const y = 0.95 + r * 0.12;
      put(0.17 + c * 0.33, y, zOf(y), -71 * D2R, 0, 0);
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const y = 0.95 + r * 0.12;
      put(-(0.17 + c * 0.33), y, zOf(y), -71 * D2R, 0, 0);
    }
  });
  P.decal('hull', 'number', num, 0.26, [1.745, 0.88, 1.80], Math.PI / 2);      // plates on the front panels
  P.decal('hull', 'number', num, 0.26, [-1.745, 0.88, 1.80], -Math.PI / 2);
  P.topY = 1.10;

  // ================= WELDED ANGULAR TURRET (never the russia dome):
  // proven 12-pt plan core + WEDGE APPLIQUÉ CHEEKS authored EXACTLY on
  // the armor chR/chL plate lines (defs unchanged; face lean 7.6 deg,
  // planarity exact by the uniform 0.08 top pullback) + the ARROW SEAM
  // prism pair over the gun slot. Roof local 0.72 = world 2.14. ===========
  P.add('turret', polyTurret([
    [0.40, 0.95], [0.92, 0.62], [1.10, 0.16], [1.10, -0.42], [0.80, -0.88],
    [0.42, -1.10], [-0.42, -1.10], [-0.80, -0.88], [-1.10, -0.42], [-1.10, 0.16],
    [-0.92, 0.62], [-0.40, 0.95],
  ], 0.72, 1.04, 0.92), 0, 0, -0.15);
  P.add('turret', slab(                                                        // R wedge cheek (armor chR line)
    [0.24, 0.02, 1.05], [1.20, 0.02, 0.28], [1.20, 0.02, 0.04], [0.24, 0.02, 0.81],
    [0.24, 0.62, 0.97], [1.20, 0.62, 0.20], [1.20, 0.62, -0.04], [0.24, 0.62, 0.73]));
  P.add('turret', slab(                                                        // L wedge cheek (corner-swapped
    [-1.20, 0.02, 0.28], [-0.24, 0.02, 1.05], [-0.24, 0.02, 0.81], [-1.20, 0.02, 0.04], // mirror, §C winding)
    [-1.20, 0.62, 0.20], [-0.24, 0.62, 0.97], [-0.24, 0.62, 0.73], [-1.20, 0.62, -0.04]));
  P.add('turret', slab(                                                        // ARROW SEAM prism, R half
    [0, 0.38, 1.13], [0.24, 0.38, 1.05], [0.24, 0.38, 0.81], [0, 0.38, 0.89],
    [0, 0.62, 1.05], [0.24, 0.62, 0.97], [0.24, 0.62, 0.73], [0, 0.62, 0.81]));
  P.add('turret', slab(                                                        // ARROW SEAM prism, L half
    [-0.24, 0.38, 1.05], [0, 0.38, 1.13], [0, 0.38, 0.89], [-0.24, 0.38, 0.81],
    [-0.24, 0.62, 0.97], [0, 0.62, 1.05], [0, 0.62, 0.81], [-0.24, 0.62, 0.73]));
  P.add('turretDark', box(0.05, 0.26, 0.05), 0, 0.50, 1.075, -30 * D2R, 0, 0); // ridge seam strip down the arrow
                                                                               //   (r1 self-read: widened — the
                                                                               //   0.022 strip vanished under the
                                                                               //   digital camo; the seam must
                                                                               //   read as TWO planes meeting)
  for (const s of [-1, 1]) {                                                   // wedge top-edge catch-light strips
    P.add('turretDetail', box(1.15, 0.022, 0.035), s * 0.72, 0.625, 0.585, 0, s * 39 * D2R, 0);
  }
  P.add('turretDark', box(0.46, 0.36, 0.06), 0, 0.20, 0.84);                   // gun-slot dark recess wall
  // CHEEK ERA arrays ON the face planes (blueprint parametrization:
  // P(u,v) + 0.045 along the face normal n = (0.622, 0.103, 0.776))
  const cheekEra = (put, s) => {
    for (const v of [0.25, 0.72]) for (let c = 0; c < 6; c++) {
      const u = 0.08 + c * 0.165;
      put(s * (0.24 + 0.96 * u + 0.622 * 0.045), 0.02 + 0.60 * v + 0.103 * 0.045,
        1.05 - 0.77 * u - 0.08 * v + 0.776 * 0.045, -0.10, s * 0.68, 0);
    }
  };
  P.eraCluster('turret_era_R', (put) => cheekEra(put, 1), true);
  P.eraCluster('turret_era_L', (put) => cheekEra(put, -1), true);
  for (const s of [-1, 1]) {                                                   // low-relief side appliqué modules
    P.add('turret', box(0.10, 0.40, 0.85), s * 1.12, 0.28, -0.15, 0, s * 0.04, 0);
    P.add('turretDark', box(0.02, 0.34, 0.015), s * 1.17, 0.28, -0.38, 0, s * 0.04, 0);
    P.add('turretDark', box(0.02, 0.34, 0.015), s * 1.17, 0.28, 0.08, 0, s * 0.04, 0);
  }
  // ---- roof cluster: pano RIGHT-REAR (head top world 2.50 — documented
  // spike over the 2.35 crest), JD-3 DAZZLER LEFT (the distinctive pair),
  // gunner sight doors left-front, hatches, meteo mast ---------------------
  P.add('turretDetail', cylY(0.06, 0.075, 0.22, 12), 0.44, 0.83, -0.72);       // pano pedestal
  P.add('turretDark', cylY(0.115, 0.115, 0.20, 12), 0.44, 0.98, -0.72);        // pano head drum
  P.add('turretGlass', box(0.12, 0.07, 0.02), 0.44, 1.00, -0.615);             // fwd window
  P.add('turretDetail', box(0.20, 0.03, 0.20), 0.44, 1.085, -0.72);            // cap
  P.add('turretDetail', cylY(0.10, 0.11, 0.15, 12), -0.50, 0.795, -0.62);      // JD-3 dazzler drum
  P.add('turretDark', box(0.14, 0.10, 0.04), -0.50, 0.88, -0.53);              // dazzler window (+z facing)
  P.add('turretGlass', box(0.10, 0.06, 0.014), -0.50, 0.88, -0.508);
  P.add('turret', box(0.42, 0.10, 0.38), -0.42, 0.77, 0.28);                   // gunner sight hood
  P.add('turretDark', box(0.34, 0.075, 0.03), -0.42, 0.77, 0.47);              // dark aperture
  P.add('turretGlass', box(0.26, 0.05, 0.014), -0.42, 0.765, 0.485);           // glass slit
  P.add('turretDark', box(0.012, 0.075, 0.36), -0.42, 0.775, 0.29);            // door split seam
  P.add('turret', cylY(0.23, 0.23, 0.045, 16), 0.44, 0.735, -0.30);            // commander hatch ring
  P.add('turretDark', torus(0.23, 0.013, 16), 0.44, 0.783, -0.30);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.44, 0.73, -0.20);             // gunner hatch
  P.add('turretDark', torus(0.20, 0.012, 14), -0.44, 0.772, -0.20);
  P.add('turretDetail', box(0.09, 0.09, 0.09), 0, 0.765, -1.15);               // meteo mast base
  P.add('turretDetail', cylY(0.02, 0.026, 0.50, 8), 0, 0.99, -1.15);           // mast (top ~2.64 world, documented)
  P.add('turretDark', box(0.05, 0.05, 0.05), 0, 1.265, -1.15);
  // ---- QJC88 12.7 (NSVT-class silhouette — §H.4 national grammar) +
  // smoke 2x5 + bustle kit --------------------------------------------------
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'dark', scale: 0.95, ammo: true,
      rotation: [0, 0.4, 0], seed: 18,
    });
    mg.position.set(0.58, 0.745, -0.42);
    P.turretG.add(mg);
    const aw = FITTINGS.antennaWhip({ mats: P.mats, h: 0.55, rake: 0.07, seed: 6 });
    aw.position.set(0.85, 0.73, -0.95);
    P.turretG.add(aw);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.50, seed: 13 });
    links.position.set(-0.62, 0.60, -1.30);                                    // bustle floor left
    P.turretG.add(links);
  }
  smokeCluster(P, 1.05, 0.38, 0.28, 5, 0.95, 0.6);
  smokeCluster(P, -1.05, 0.38, 0.28, 5, -0.95, 0.6);
  // bustle basket wrapping the rear: rails + posts + duffels + tarp
  P.add('turretDetail', box(1.90, 0.05, 0.05), 0, 0.55, -1.52);
  P.add('turretDetail', box(1.90, 0.05, 0.05), 0, 0.10, -1.52);
  for (let k = 0; k < 9; k++) P.add('turretDetail', box(0.03, 0.45, 0.03), -0.88 + k * 0.22, 0.325, -1.52);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 0.85), s * 1.12, 0.55, -1.05, 0, s * 0.25, 0);
    stowage(P, 'turretCloth', rng, [[s * 1.02, 0.30, -1.00, 0.16, 0.26, 0.70]]);
  }
  stowage(P, 'turretCloth', rng, [[0, 0.30, -1.35, 0.90, 0.34, 0.35]]);
  tarpRoll(P, 'turretCloth', 0.30, 0.62, -1.42, 1.10, 0.09, true);
  ammoCan(P, 'turretDark', 0.88, 0.60, -1.32, -0.15);
  P.decal('turret', 'number', num, 0.28, [1.135, 0.30, -0.45], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', num, 0.28, [-1.135, 0.30, -0.45], -Math.PI / 2, 0, -0.05);
  // ---- 125 mm ZPT-98 with the RUSSIAN-STYLE BOOT (§B3.1: round carriers
  // only — root drum + stacked tapered collars + cinch rings; sleeve +
  // mid-tube evacuator via buildGun). Muzzle +7.20 = 11.0 overall EXACT. --
  P.addGunExtra(cylZ(0.19, 0.14, P.q ? 20 : 12), 0, 0, 0.30);                  // root drum (round carrier)
  P.addGunExtra(cylZ(0.155, 0.28, P.q ? 20 : 12, 0.185), 0, 0, 0.42);          // boot collar A (fat->taper)
  P.addGunExtra(cylZ(0.145, 0.26, P.q ? 20 : 12, 0.165), 0, 0, 0.66);          // boot collar B
  P.addGunExtraDark(cylZ(0.16, 0.04, P.q ? 20 : 12), 0, 0, 0.55);              // cinch rings
  P.addGunExtraDark(cylZ(0.16, 0.04, P.q ? 20 : 12), 0, 0, 0.79);
  buildGun(P, { len: 6.508, r: 0.068, sleeve: true, evac: 0.52, baseR: 0.15, evacR: 1.75 });
  // §B3.1 MUZZLE BORE: capped tube ends 6.508; the bored face holds the
  // 6.55 muzzle line (+7.20 world = 11.0 overall EXACT)
  muzzleBore99(P, 6.55, 0.068, 0.042, 14);
  P.muzzleZ = 6.55;
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
  if (P.q) for (let k = 0; k < 6; k++) P.add('hullDetail', box(1.8, 0.02, 0.055), 0, 1.31, -1.95 - k * 0.16);
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
// T-14 Armata — NOT a pancake: long tall hull, 7 wheels behind full-length
// sawtooth skirts, crew-capsule bow, and the sci-fi faceted unmanned turret
// shroud with sensor mast, AESA corner panels, APS tubes and a clean gun.
// ---------------------------------------------------------------------------
function buildT14(P) {
  const { box, frustum, slab, cylY, cylX, cylZ, torus,
    buildGun, buildRunningGear, fenders, headlight, liftEye, periscope,
    towCable, stowage } = KIT;
  const { rng } = P;
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
    [-0.62, 0.82, 4.28], [0.62, 0.82, 4.28], [0.62, 1.095, 4.335], [-0.62, 1.095, 4.335]));  // prow tip to 4.335 (ref nose vertex 4.345; spec ±4.35)
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
    P.add('hullRubber', box(0.02, 0.30, 3.30), s * 1.69, 0.65, 2.10);           // rubber fringe 0.50..0.80 (x 1.68..1.70 — clear of the ±1.73 col window)
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
  P.add('hull', frustum(1.06, -3.98, -4.02, 1.06, -4.10, -4.14, 0.74, 1.26));   // raked lower rear plate (center lane)
  P.add('hull', orientedSlab99(                                                 // raked upper RAMP: bottom (1.26,-4.13) -> top (1.70,-3.93)
    [-1.60, 1.26, -4.01], [1.60, 1.26, -4.01], [1.60, 1.26, -4.13], [-1.60, 1.26, -4.13],
    [-1.60, 1.70, -3.81], [1.60, 1.70, -3.81], [1.60, 1.70, -3.93], [-1.60, 1.70, -3.93]));
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.60, 0.20), s * 1.35, 1.40, -4.235);               // corner posts x 1.10..1.60, z -4.335..-4.135 (BODY anchor col)
    P.add('hullDark', box(0.48, 0.03, 0.16), s * 1.35, 1.715, -4.235);          // post cap seams (clear of the -4.32 col boundary)
    P.add('hullDark', box(1.15, 0.02, 1.5), s * 0.82, 1.75, -3.25);             // rear-deck grille fields
    if (P.q) for (let k = 0; k < 6; k++) {
      P.add('hullDetail', box(1.05, 0.025, 0.06), s * 0.82, 1.757, -2.70 - k * 0.2);
    }
    P.add('hullDark', box(0.55, 0.24, 0.05), s * 0.90, 1.46, -4.06, -0.42, 0, 0); // exhaust grilles ON the ramp
    P.add('hullRubber', box(0.42, 0.21, 0.026), s * 1.51, 1.505, -4.35);        // rear flaps x 1.30..1.72, y 1.40..1.61 (print -4.38 col read)
    P.add('hullDetail', box(0.07, 0.05, 0.14), s * 1.45, 1.63, -4.30);          // flap hangers off the posts
  }
  // rear-ramp kit: unditching log (§I census) LYING ON the raked ramp,
  // stowage bins on the posts, louvres on the ramp face, tow lugs low
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.3, r: 0.095, straps: 2, seed: 14 });
    log.position.set(0, 1.50, -4.045);
    log.rotation.x = -0.42;
    P.hullG.add(log);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.44, 0.22, 0.10), s * 1.35, 1.42, -4.10);          // stowage bins against the posts
    P.add('hullDark', box(0.46, 0.02, 0.11), s * 1.35, 1.54, -4.10);            // bin lids
    for (let k = 0; k < 3; k++) {                                               // heat-shield louvres on the ramp
      P.add('hullDetail', box(0.50, 0.04, 0.024), s * 0.60, 1.32 + k * 0.10, -4.115 + k * 0.046, -0.42, 0, 0);
    }
    P.add('hullDetail', box(0.13, 0.11, 0.10), s * 0.9, 1.28, -4.06);           // tow lugs at the ramp foot
  }
  P.add('hullDark', box(0.16, 0.08, 0.03), 0, 1.66, -3.90, -0.42, 0, 0);        // convoy light on the ramp crest
  headlight(P, -1.72, 1.18, 4.05, -0.20, 0.05);                                 // off the mudguard corners — the wrap lane (x 1.09..1.66) stays open
  headlight(P, 1.72, 1.18, 4.05, -0.20, 0.05);
  // bow tow hooks under the nose + front mudflaps x 1.30..1.72 (face 4.31,
  // 0.86..1.12 — the ref bow bottom line; orbit far edge 3.995 clears)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.14, 0.12, 0.18), s * 0.72, 0.62, 3.78);
    P.add('hullRubber', box(0.42, 0.26, 0.026), s * 1.51, 0.99, 4.30);
    P.add('hullDetail', box(0.07, 0.04, 0.14), s * 1.51, 1.14, 4.24);           // flap hangers
    P.add('hullRubber', box(0.16, 0.28, 0.026), s * 1.81, 1.00, 4.25);          // LOW corner flaps to x 1.89 (ref bow corners sit under the 1.24 nose line)
  }
  {
    const tc = FITTINGS.towCable({ mats: P.mats, r: 0.020, seed: 11,
      pts: [[-1.2, 1.50, 2.6], [-0.4, 1.45, 3.1], [0.5, 1.47, 2.85]] });
    P.hullG.add(tc);
  }
  liftEye(P, 'hullDetail', -1.5, 1.70, 0.5);
  liftEye(P, 'hullDetail', 1.5, 1.70, 0.5);

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
  const BK = 0.40;                                   // knuckle line height (2.085 world)
  // lower belt: leans OUT (base narrower than knuckle) — R / L / front pair / rear
  // LOWER BELT (leans OUT, deck -> knuckle). Knuckle ring (print plan):
  // apex (0.06,2.22) arrow (0.80,1.77) shoulder (1.44,1.04) side rear
  // (1.44,-0.14) corner (1.17,-0.35) bustle join (1.02,-0.55).
  P.add('turret', slab(                                                          // right lower belt (shoulder..corner)
    [1.36, 0, 1.00], [1.36, 0, -0.12], [1.11, 0, -0.32], [0.97, 0, -0.52],
    [1.44, BK, 1.04], [1.44, BK, -0.14], [1.17, BK, -0.35], [1.02, BK, -0.55]));
  P.add('turret', slab(                                                          // left lower belt
    [-1.36, 0, -0.12], [-1.36, 0, 1.00], [-0.97, 0, -0.52], [-1.11, 0, -0.32],
    [-1.44, BK, -0.14], [-1.44, BK, 1.04], [-1.02, BK, -0.55], [-1.17, BK, -0.35]));
  P.add('turret', slab(                                                          // front-right lower arrow
    [0.06, 0, 2.14], [0.75, 0, 1.70], [1.36, 0, 1.00], [0.06, 0, 1.55],
    [0.06, BK, 2.22], [0.80, BK, 1.77], [1.44, BK, 1.04], [0.06, BK, 1.60]));
  P.add('turret', slab(                                                          // front-left lower arrow
    [-0.75, 0, 1.70], [-0.06, 0, 2.14], [-0.06, 0, 1.55], [-1.36, 0, 1.00],
    [-0.80, BK, 1.77], [-0.06, BK, 2.22], [-0.06, BK, 1.60], [-1.44, BK, 1.04]));
  P.add('turret', box(1.94, BK + 0.02, 0.26), 0, (BK + 0.02) / 2, -0.60);       // lower rear wall under the bustle front
  // UPPER BELT (leans IN to the roof): roof ring apex (0.05,1.52) front
  // (0.66,1.30) shoulder (0.95,0.86) rear (0.90,-0.42).
  P.add('turret', slab(                                                          // right upper facet
    [1.44, BK, 1.04], [1.44, BK, -0.14], [1.17, BK, -0.35], [1.02, BK, -0.55],
    [0.95, AH, 0.86], [0.95, AH, -0.20], [0.92, AH, -0.35], [0.90, AH, -0.50]));
  P.add('turret', slab(                                                          // left upper facet
    [-1.44, BK, -0.14], [-1.44, BK, 1.04], [-1.02, BK, -0.55], [-1.17, BK, -0.35],
    [-0.95, AH, -0.20], [-0.95, AH, 0.86], [-0.90, AH, -0.50], [-0.92, AH, -0.35]));
  P.add('turret', slab(                                                          // front-right upper arrow
    [0.06, BK, 2.22], [0.80, BK, 1.77], [1.44, BK, 1.04], [0.06, BK, 1.60],
    [0.05, 0.545, 2.16], [0.66, AH, 1.30], [0.95, AH, 0.86], [0.05, AH, 1.52]));
  P.add('turret', slab(                                                          // front-left upper arrow
    [-0.80, BK, 1.77], [-0.06, BK, 2.22], [-0.06, BK, 1.60], [-1.44, BK, 1.04],
    [-0.66, AH, 1.30], [-0.05, 0.545, 2.16], [-0.05, AH, 1.52], [-0.95, AH, 0.86]));
  // apex chin cap: the arrow tip tops out LOW over the gun trough — TWO
  // co-planar pieces to the print's 2.21..2.27w tip flat (no staircase)
  P.add('turret', slab(
    [-0.66, AH, 1.30], [0.66, AH, 1.30], [0.42, 0.525, 1.86], [-0.42, 0.525, 1.86],
    [-0.66, AH + 0.005, 1.34], [0.66, AH + 0.005, 1.34], [0.42, 0.585, 1.88], [-0.42, 0.585, 1.88]));
  P.add('turret', slab(                                                          // flat apex tip over the trough
    [-0.42, 0.525, 1.86], [0.42, 0.525, 1.86], [0.30, 0.525, 2.16], [-0.30, 0.525, 2.16],
    [-0.42, 0.585, 1.88], [0.42, 0.585, 1.88], [0.30, 0.585, 2.14], [-0.30, 0.585, 2.14]));
  P.add('turret', box(1.90, 0.05, 2.02), 0, AH - 0.025, 0.52);                  // front roof crown plate (2.53w)
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
  // turret RING BASKET under the shroud front (mask-parity mass: the print
  // carries a real crew-basket dipping below its deck inside the hull —
  // 2779 interpen verts, packet ORACLE facts; in-game this drum is fully
  // occluded by the hull band, exactly like the print's)
  P.add('turret', box(1.70, 0.36, 1.50), 0, -0.205, 1.07);
  // hard shadow seams along the knuckle + facet junctions + roof panels
  for (const s2 of [-1, 1]) {
    P.add('turretDark', box(0.02, 0.02, 1.20), s2 * 1.435, BK, 0.45);           // knuckle seam
    P.add('turretDark', box(0.016, 0.30, 0.03), s2 * 0.42, 0.62, 1.88, 0.42, -s2 * 0.55, 0); // arrow ridge seams
    P.add('turretDark', box(0.16, 0.14, 0.10), s2 * 0.70, AH - 0.10, 1.16, 0, s2 * 0.5, 0);  // corner EO box
    P.add('turretGlass', box(0.09, 0.07, 0.02), s2 * 0.72, AH - 0.09, 1.22, 0, s2 * 0.5, 0);
  }
  P.add('turretDark', box(0.9, 0.02, 0.9), 0, AH + 0.028, 0.45);
  // gun trough: dark slot the clean tube emerges from, under the arrow apex
  P.add('turretDark', box(0.5, 0.40, 0.2), 0, 0.30, 1.98);
  // small square APS hard-kill launch tubes ringing the shroud base
  for (let k = 0; k < 5; k++) {
    for (const s of [-1, 1]) {
      P.add('turretDark', box(0.09, 0.09, 0.14),
        s * (1.24 - k * 0.13), 0.10, 1.52 - k * 0.42, 0.25, s * (0.5 + k * 0.18), 0);
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
  P.add('turret', box(0.14, 0.30, 0.14), 0.82, 0.985, -1.72);                   // tower base (top 2.82w)
  P.add('turretDetail', cylY(0.028, 0.034, 0.16, 8), 0.82, 1.215, -1.72);       // shaft
  P.add('turretDark', cylY(0.038, 0.038, 0.09, 10), 0.82, 1.32, -1.72);         // pano head (top 3.05w, 1 col at z_w -2.32)
  P.add('turretGlass', box(0.05, 0.05, 0.012), 0.82, 1.325, -1.675);
  {
    const wh = FITTINGS.antennaWhip({ mats: P.mats, h: 0.90, rake: 0.0, seed: 21 });
    wh.position.set(0.82, 1.135, -1.72);                                        // whip to 3.84w on the tower x (ref front spike col x 0.82)
    P.turretG.add(wh);
  }
  // RWS + EO stack on the bustle front — re-derived to the print's OWN
  // plateau (side ref 3.07-3.16 tops across z_w -0.74..-1.83): pedestal +
  // two tiers + EO head span the full shelf; §B3 census MG (production
  // PKTM) aims FORWARD-right on the mount, level, top 3.12w.
  P.add('turret', box(0.78, 0.22, 1.10), -0.23, 0.945, -0.75);                  // stack pedestal (z_w -0.80..-1.90)
  P.add('turret', box(0.74, 0.26, 0.555), -0.23, 1.285, -1.1125);               // housing rear tier (top 3.10w, spans z_w -1.435..-1.99 = ref plateau)
  P.add('turretDark', box(0.26, 0.15, 0.26), -0.45, 1.385, -0.90);              // EO head (top 3.145w)
  P.add('turretGlass', box(0.18, 0.09, 0.02), -0.45, 1.40, -0.76);
  P.add('turret', box(0.60, 0.20, 0.55), -0.25, 1.24, -0.395);                  // front tier (top 3.02w, front edge z_w -0.725 clear of the -0.63 col)
  P.add('turretGlass', box(0.16, 0.08, 0.02), -0.25, 1.28, -0.11);
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', scale: 0.85, tone: 'dark', seed: 16, elev: 0.03, ammo: true, rotation: [0, Math.PI - 0.35, 0] });
    mg.position.set(0.10, 1.06, -0.80);                                         // stowed aft-right on the pedestal — barrel line rides UNDER the
    P.turretG.add(mg);                                                          // 3.10w tier silhouette (side-mask shadowed; §B3 census MG)
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
  for (const s of [-1, 1]) {                                                    // Afganit AESA plates
    P.add('turretDark', box(0.30, 0.30, 0.04), s * 0.90, BK + 0.16, 1.46, -0.1, s * 0.55, 0);
    P.add('turretDark', box(0.28, 0.26, 0.04), s * 1.24, BK + 0.10, -0.24, 0.1, s * 2.6, 0);
  }
  // vertical smoke-tube banks on the bustle flanks
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', cylY(0.035, 0.035, 0.3, 8), s * (0.72 + k * 0.09), 0.90 - k * 0.02, -0.68, 0.12, 0, s * 0.15);
    }
  }
  // roof panel seams (unmanned: no hatches on the shroud)
  P.add('turretDark', box(0.7, 0.012, 1.2), 0, AH + 0.006, 0.50);
  P.add('turretDark', box(1.9, 0.012, 0.5), 0, 1.035 + 0.006, -0.20);
  // clean 2A82 tube: thermal sleeve, NO evacuator (§16.1 key barrel read).
  // Muzzle +6.45 world = the published 10.8 overall over the −4.32 tail;
  // bore line 2.03w level (the print's tube). Chin + boot at the ladder-r1
  // trough station (gun pivot world z 0.0).
  P.addGunExtra(box(0.44, 0.44, 0.3), 0, 0.02, 1.38);                           // shroud chin
  P.addGunExtra(cylZ(0.14, 0.36, 12, 0.17), 0, 0, 1.50);                        // boot collar
  buildGun(P, { len: 6.45, r: 0.07, sleeve: true, evac: null, baseR: 0.15 });
  muzzleBore(P, { len: 6.45, r: 0.07 });                                        // §B3.1 (shadow-named, 3fca39b)
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
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.22, xc: 1.33, dishR: 0.76,
    wheelZs: [2.85, 1.963, 1.076, 0.19, -0.697, -1.584, -2.47],
    sprocket: { z: -3.42, y: 1.08, r: 0.28 }, idler: { z: 3.55, y: 0.94, r: 0.26 },
    rollers: [2.2, 0.75, -0.75, -2.2].map((z) => ({ z, y: 1.12, r: 0.08 })),
    trackW: 0.48, topY: 1.28, contactZF: 2.92, contactZR: -2.50,
    // §B8.1 NATIVE-TONE wheel countability (the print's 7 wheels read
    // pale-green under the skirt; the stock rubber read near-black).
    paintedEnds: true, coveredTop: true, tireHex: '#4e5544',
  });
  // Malachit ERA: tile field flat on the 8.8-deg upper glacis (dark
  // mounting bed under the rows so the seams read recessed)
  const t14GlacisZ = (y) => 2.15 + (1.665 - y) * 6.43;
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.44, 0.025, 1.55), s * 0.80, 1.48, 3.03, -8.8 * D2R, 0, 0);
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
  P.decal('hull', 'number', '512', 0.30, [1.9455, 1.22, 3.05], Math.PI / 2);
  P.decal('hull', 'number', '512', 0.30, [-1.9455, 1.22, 3.05], -Math.PI / 2);
  P.topY = AH + 0.85;                                                           // sensor mast top
}

/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const MODERN2_BUILDERS = {
  leo2a4: buildLeo2A4,
  t80u: buildT80U,
  leclerc: buildLeclerc,
  type99a: buildType99A,
  leo1a5: buildLeo1A5,
  t14: buildT14,
};
