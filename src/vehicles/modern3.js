// src/vehicles/modern3.js — HD procedural builder pack #3 (modern roster).
// Vehicles (docs/research/modern-roster.md): Chieftain Mk 10 (§19), K2 Black
// Panther (§23), Type 10 (§24), M2A2 Bradley (§6), BMP-2 (§17), C1 Ariete (§26).
//
// Registration pattern (established by modern1.js/modern2.js): tankFactory.js
// imports MODERN3_BUILDERS and merges it into its BUILDERS table at the
// clearly-marked extension hook; builders draw on tankFactory's exported
// geometry KIT. NOTE: tankFactory <-> modern3 is a deliberate module cycle —
// KIT is only dereferenced INSIDE the builder bodies (at build time), never
// during module evaluation, so the TDZ is never hit.
//
// Specs merge into the specs.js tables at module init (idempotent).

import { KIT } from './tankFactory.js';
import { FITTINGS } from './profiles/kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const MODERN3_IDS = [
  'chieftain_mk10', 'k2', 'type10', 'm2a2_bradley', 'bmp2', 'ariete',
];

// ---------------------------------------------------------------------------
// Spec helpers — local mirrors of the specs.js plate/shell conventions
// (specs.js keeps them module-private; duplicated here per pack ownership).
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
// APFSDS pen curve anchored at the roster-quoted 2 km value (specs.js conv.)
const apfsdsPens = (quoted2km) => {
  const pen1000 = quoted2km / 0.90;
  return [Math.round(pen1000 / 0.91), Math.round(pen1000), quoted2km];
};
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

/**
 * Parametric modern armor layout (plate positions approximate the visual
 * build; KE/CE are the roster doc's RHAe estimates). Options:
 *   hl/hw/inW/floor/trkTop/roofY   hull envelope
 *   turretPivot/gunPivot/barrelLenM/barrelRadM
 *   glacis/lower/side/rear/roof    [physMm, keMm, ceMm] (side/rear/roof: mm)
 *   skirt                          [physMm, keMm, ceMm] | null (spaced)
 *   tw/tFrontZ/tRearZ/tH           turret envelope (turret-local)
 *   cheek/tSide/mantlet            [physMm, keMm, ceMm]
 *   tRear/tRoof                    mm
 *   loader                         4th crew member
 *   bustleAmmo                     ammo rack in the bustle (else hull floor)
 */
function modernArmor(o) {
  const { hl, hw, inW, floor, trkTop, roofY, tw, tFrontZ, tRearZ, tH } = o;
  const tp = o.turretPivot;
  const A = (v) => ({ keMm: v[1], ceMm: v[2] });
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.5 + 0.4,
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [o.gunPivot[0], o.gunPivot[1], o.gunPivot[2]],
    gunBarrel: { lengthM: o.barrelLenM, radiusM: o.barrelRadM },
    hullPlates: [
      fr('upper_glacis', o.glacis[0], hw * 0.92, floor + (roofY - floor) * 0.4, hl * 0.98, roofY, hl * 0.35, A(o.glacis)),
      fr('lower_front', o.lower[0], hw * 0.9, floor, hl * 0.82, floor + (roofY - floor) * 0.4, hl * 0.98, A(o.lower)),
      sR('hull_side_upper_R', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, A(o.side)),
      sL('hull_side_upper_L', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, A(o.side)),
      sR('hull_side_lower_R', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, A(o.side)),
      sL('hull_side_lower_L', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, A(o.side)),
      ...(o.skirt ? [
        sR('skirt_R', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...A(o.skirt) }),
        sL('skirt_L', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...A(o.skirt) }),
      ] : []),
      sR('track_R', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', o.rear, hw * 0.95, floor, -hl, roofY, -hl),
      rf('hull_roof', o.roof, hw * 0.95, roofY, -hl, hl * 0.35),
    ],
    turretPlates: [
      chR('turret_cheek_R', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, A(o.cheek)),
      chL('turret_cheek_L', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, A(o.cheek)),
      par('mantlet', o.mantlet[0],
        [-o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [-o.barrelRadM * 3.6, o.gunPivot[1] + 0.24, tFrontZ + 0.03],
        { ...A(o.mantlet), gunFollow: true }),
      sR('turret_side_R', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, A(o.tSide)),
      sL('turret_side_L', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, A(o.tSide)),
      rr('turret_rear', o.tRear, tw * 0.95, 0.0, tRearZ, tH, tRearZ),
      rf('turret_roof', o.tRoof, tw, tH + 0.01, tRearZ, tFrontZ - tw * 0.7),
    ],
    modules: [
      mbox('engine', [-inW * 0.95, floor, -hl * 0.95], [inW * 0.95, roofY * 0.9, -hl * 0.5]),
      mbox('fuelTank', [-inW * 0.95, floor, -hl * 0.48], [inW * 0.95, roofY * 0.65, -hl * 0.25]),
      o.bustleAmmo
        ? mbox('ammoRack', [-tw * 0.7, 0.0, tRearZ], [tw * 0.7, tH * 0.8, tRearZ * 0.45], true)
        : mbox('ammoRack', [-inW * 0.85, floor, -hl * 0.18], [inW * 0.85, roofY * 0.55, hl * 0.28]),
      mbox('turretRing', [-tw * 0.85, roofY - 0.18, tp[2] - tw * 0.8], [tw * 0.85, roofY + 0.02, tp[2] + tw * 0.8]),
      mbox('radio', [-tw * 0.6, 0.05, tRearZ * 0.85], [-tw * 0.1, tH * 0.55, tRearZ * 0.45], true),
      mbox('optics', [tw * 0.2, tH * 0.55, tFrontZ * 0.3], [tw * 0.7, tH * 0.95, tFrontZ * 0.85], true),
      mbox('gun', [-o.barrelRadM * 2.4, o.gunPivot[1] - 0.22, -tw * 0.5], [o.barrelRadM * 2.4, o.gunPivot[1] + 0.26, tFrontZ], true),
      mbox('trackL', [-hw, 0, -hl], [-inW, trkTop, hl]),
      mbox('trackR', [inW, 0, -hl], [hw, trkTop, hl]),
    ],
    crew: [
      cbox('driver', [-inW * 0.75, floor + 0.15, hl * 0.5], [-inW * 0.05, roofY * 0.9, hl * 0.9]),
      cbox('gunner', [tw * 0.12, 0.02, -tw * 0.35], [tw * 0.75, tH * 0.85, tw * 0.45], true),
      cbox('commander', [tw * 0.12, 0.02, tRearZ * 0.6], [tw * 0.8, tH * 0.9, -tw * 0.35], true),
      ...(o.loader
        ? [cbox('loader', [-tw * 0.75, 0.02, -tw * 0.3], [-tw * 0.12, tH * 0.8, tw * 0.45], true)]
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// The spec table (values per modern-roster.md sections cited above)
// ---------------------------------------------------------------------------

const MODERN3_SPECS = {
  chieftain_mk10: {
    id: 'chieftain_mk10', name: 'Chieftain Mk 10', nation: 'UK', era: 'modern', class: 'mbt',
    hp: 1750,
    enginePowerHp: 750, weightTons: 55, topSpeedKmh: 48, reverseSpeedKmh: 10,
    hullTraverseDegS: 28,
    terrainResistance: { hard: 0.85, medium: 1.0, soft: 1.8 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 26, gunPitchDegS: 20, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 8.0, baseAccuracy: 0.32, aimTimeS: 2.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('L23A1 APFSDS', 'APFSDS', 120, apfsdsPens(400)[0], apfsdsPens(400)[1], 480, 1534, { pen2000Mm: apfsdsPens(400)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 600, 670),   // 150 flat, no falloff — the identity round
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 670),
      ],
    },
    dims: { hullLengthM: 7.52, overallLengthM: 10.79, widthM: 3.66, heightM: 2.90 },
    armor: modernArmor({
      hl: 3.76, hw: 1.80, inW: 1.16, floor: 0.34, trkTop: 1.07, roofY: 1.72,
      turretPivot: [0, 1.72, 0.1], gunPivot: [0, 0.30, 0.8],
      barrelLenM: 6.1, barrelRadM: 0.082,
      // Stillbrew turret front; the famous 72° glacis is overmatched by
      // late APFSDS (§19.2) — ke sits below every modern round on purpose.
      glacis: [120, 300, 300], lower: [95, 120, 120], side: [38, 60, 60],
      skirt: null, rear: 25, roof: 20,
      tw: 1.05, tFrontZ: 1.45, tRearZ: -1.35, tH: 0.66,
      cheek: [300, 380, 450], tSide: [95, 160, 200], tRear: 45, tRoof: 25,
      mantlet: [250, 340, 400], loader: true,
    }),
    visual: {
      // BAOR green/black blotch (§19.5)
      scheme: 'stripes', base: '#3f4a36', weather: '#4a5540',
      patches: ['#1d1f1c', '#33402c'],
      marking: 'number', number: '22', trackWidthM: 0.61, camoScale: 0.55,
    },
  },

  k2: {
    id: 'k2', name: 'K2 Black Panther', nation: 'South Korea', era: 'modern', class: 'mbt',
    hp: 2450,
    enginePowerHp: 1500, weightTons: 55, topSpeedKmh: 70, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    // ISU hydropneumatic kneel (§23.3): modeled as best-in-class -10 depression.
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 5.2, baseAccuracy: 0.29, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('K279 APFSDS', 'APFSDS', 120, apfsdsPens(700)[0], apfsdsPens(700)[1], 530, 1760, { pen2000Mm: apfsdsPens(700)[2] }),
        shell('K280 HEAT-MP', 'HEAT', 120, 610, 610, 470, 1130),
        shell('K281 HE', 'HE', 120, 45, 45, 580, 1000),
      ],
    },
    dims: { hullLengthM: 7.5, overallLengthM: 10.8, widthM: 3.6, heightM: 2.4 },
    armor: modernArmor({
      hl: 3.75, hw: 1.79, inW: 1.22, floor: 0.45, trkTop: 1.05, roofY: 1.66,
      // tank_models r7 (barge read): ring moved 0.4 forward — K2 turret apex
      // ~2.1 m from the nose like the real vehicle; foredeck 34% -> ~28%.
      turretPivot: [0, 1.66, 0.30], gunPivot: [0, 0.30, 0.75],
      barrelLenM: 6.6, barrelRadM: 0.079,
      glacis: [45, 130, 160], lower: [550, 500, 700], side: [45, 100, 100],
      skirt: [80, 150, 400], rear: 40, roof: 40,
      tw: 1.30, tFrontZ: 1.30, tRearZ: -1.55, tH: 0.78,
      cheek: [650, 650, 900], tSide: [300, 300, 400], tRear: 60, tRoof: 45,
      mantlet: [350, 400, 480], loader: false, bustleAmmo: true,
    }),
    visual: {
      // ROK 3-color soft-edge blobs (§23.5)
      scheme: 'nato', base: '#4c5844', weather: '#56624d',
      patches: ['#23261f', '#5a4a38'],
      marking: 'number', number: '325', trackWidthM: 0.63, camoScale: 0.5,
    },
  },

  type10: {
    id: 'type10', name: 'Type 10', nation: 'Japan', era: 'modern', class: 'mbt',
    hp: 2300,
    enginePowerHp: 1200, weightTons: 48, topSpeedKmh: 70, reverseSpeedKmh: 25,
    hullTraverseDegS: 46,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 42, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 5.5, baseAccuracy: 0.29, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('Type 10 APFSDS', 'APFSDS', 120, apfsdsPens(680)[0], apfsdsPens(680)[1], 520, 1750, { pen2000Mm: apfsdsPens(680)[2] }),
        shell('JM12A1 HEAT-MP', 'HEAT', 120, 600, 600, 470, 1400),
        shell('Type 10 HE', 'HE', 120, 45, 45, 570, 1000),
      ],
    },
    dims: { hullLengthM: 6.79, overallLengthM: 9.49, widthM: 3.24, heightM: 2.30 },
    armor: modernArmor({
      hl: 3.4, hw: 1.61, inW: 1.06, floor: 0.42, trkTop: 1.0, roofY: 1.56,
      turretPivot: [0, 1.56, -0.05], gunPivot: [0, 0.28, 0.6],
      barrelLenM: 5.3, barrelRadM: 0.075,
      glacis: [45, 120, 150], lower: [450, 450, 600], side: [35, 60, 60],
      skirt: [60, 120, 300], rear: 35, roof: 40,
      tw: 1.15, tFrontZ: 1.05, tRearZ: -1.35, tH: 0.60,
      cheek: [600, 600, 850], tSide: [250, 250, 350], tRear: 50, tRoof: 40,
      mantlet: [320, 380, 450], loader: false, bustleAmmo: true,
    }),
    visual: {
      // JGSDF 2-tone hard-edge waves (§24.5); garage-kept — light weathering
      scheme: 'stripes', base: '#39463a', weather: '#445144',
      patches: ['#63523c', '#2e392f'],
      marking: 'number', number: '73', trackWidthM: 0.55, camoScale: 0.5,
    },
  },

  m2a2_bradley: {
    id: 'm2a2_bradley', name: 'M2A2 Bradley', nation: 'USA', era: 'modern', class: 'ifv',
    hp: 1300,
    enginePowerHp: 600, weightTons: 30.4, topSpeedKmh: 61, reverseSpeedKmh: 20,
    hullTraverseDegS: 42,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 60, gunPitchDegS: 40, gunElevationDeg: 30, gunDepressionDeg: 9,
    gun: {
      // §6.4 quotes per-shell reloads (0.5 s bursts / 14 s TOW); the sim has
      // ONE gun.reloadS — 3.2 s is the balance compromise until per-shell
      // reload lands. Per-shell values ride along as data (reloadS extra).
      caliberMm: 25, reloadS: 3.2, baseAccuracy: 0.30, aimTimeS: 1.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M919 APFSDS-T', 'APFSDS', 25, 110, 110, 60, 1345, { pen2000Mm: 110, reloadS: 0.5 }),
        shell('BGM-71 TOW-2A', 'HEAT', 152, 900, 900, 480, 300, { reloadS: 14 }),
        shell('M792 HEI-T', 'HE', 25, 8, 8, 55, 1100, { reloadS: 0.5 }),
      ],
    },
    // dims reconciliation (AFV r1, packet "Oracle status"): widthM rides the
    // PUBLISHED BASE 3.28 datum (armyrecognition A2 hull/skirts) — the old
    // 3.61 appliqué-stack datum made the width-anchored harness inflate the
    // 42manako oracle +11.5% on every axis (safeScale is uniform). The print
    // itself reads 3.236 as loaded (-1.3%, its untouched anchor axis). The
    // appliqué READ stays in the dressing, inside the 3.28 dims band.
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.28, heightM: 2.98 },
    armor: modernArmor({
      // AFV r1 rebuild (42manako oracle envelope, docs/references/vertex/
      // m2a2_bradley.json): hull roof 1.90 with the tall two-man turret
      // cluster to 2.98; ring plane 1.895 at the print's own z -0.45 seat.
      hl: 3.27, hw: 1.635, inW: 0.95, floor: 0.45, trkTop: 0.95, roofY: 1.90,
      // gun x -0.075: the print's fused M242 plan band reads x -0.15..0.0
      // (r3c gate-frame re-measure; the r2 "-0.11 tube center" put my tube
      // 0.04 left of its band and lit an extra plan-turret column).
      turretPivot: [0, 1.895, -0.45], gunPivot: [-0.075, 0.375, 0.60],
      barrelLenM: 2.30, barrelRadM: 0.038,
      // aluminum + spaced appliqué: everything overmatched by tank guns (§6.2)
      glacis: [40, 60, 60], lower: [40, 50, 50], side: [30, 30, 30],
      skirt: [25, 30, 60], rear: 25, roof: 20,
      tw: 0.82, tFrontZ: 0.98, tRearZ: -1.05, tH: 0.87,
      cheek: [35, 60, 60], tSide: [30, 30, 30], tRear: 25, tRoof: 20,
      mantlet: [40, 60, 60], loader: false,
    }),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'C-21', trackWidthM: 0.53, camoScale: 0.5,
    },
  },

  bmp2: {
    id: 'bmp2', name: 'BMP-2', nation: 'USSR', era: 'modern', class: 'ifv',
    hp: 900,
    enginePowerHp: 300, weightTons: 14.3, topSpeedKmh: 65, reverseSpeedKmh: 7,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.75, medium: 0.9, soft: 1.6 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 50, gunPitchDegS: 36, gunElevationDeg: 30, gunDepressionDeg: 5,
    gun: {
      // §17.4 per-shell reloads (0.4 s burst / 16 s Konkurs) — same sim
      // limitation + compromise as the Bradley above.
      caliberMm: 30, reloadS: 3.0, baseAccuracy: 0.32, aimTimeS: 1.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3UBR8 APDS', 'APFSDS', 30, 60, 60, 45, 1120, { pen2000Mm: 60, reloadS: 0.4 }),
        shell('9M113M Konkurs-M', 'HEAT', 135, 750, 750, 420, 250, { reloadS: 16 }),
        shell('3UOF8 HE-I', 'HE', 30, 6, 6, 45, 960, { reloadS: 0.4 }),
      ],
    },
    // dims two-datum note (packet): heightM 2.45 is the Wikipedia
    // turret+ATGM-stack datum (hull roof alone is 2.06); the spec rides the
    // 2.45 datum and the Bergman oracle agrees (bodyTop 2.42, -1.1%).
    dims: { hullLengthM: 6.72, overallLengthM: 6.72, widthM: 3.15, heightM: 2.45 },
    armor: modernArmor({
      // AFV r2 (post-warp): tub floor 0.41, sponson roof 1.63, fenders to
      // +-1.575; ring plane 1.66. REGISTRATION LAW: dims forces a body-thick
      // nose where the warped print's is body-thin, so the gate's side
      // bodySpan registration settles at dAlong +0.076 — every MID feature
      // (ring included) authors +0.076 forward of the print's own line; the
      // ends hold the published 6.72 envelope.
      hl: 3.36, hw: 1.575, inW: 1.0, floor: 0.41, trkTop: 1.14, roofY: 1.63,
      turretPivot: [0, 1.66, 0.03], gunPivot: [0, 0.285, 0.55],
      barrelLenM: 2.52, barrelRadM: 0.036,
      glacis: [33, 35, 35], lower: [26, 28, 28], side: [17, 18, 18],
      skirt: null, rear: 16, roof: 6,
      tw: 0.98, tFrontZ: 0.98, tRearZ: -0.96, tH: 0.50,
      cheek: [26, 30, 30], tSide: [19, 20, 20], tRear: 16, tRoof: 8,
      mantlet: [30, 33, 33], loader: false,
    }),
    visual: {
      scheme: 'solid', base: '#4a5138', weather: '#565e43', patches: [],
      marking: 'number', number: '245', trackWidthM: 0.36,
    },
  },

  ariete: {
    id: 'ariete', name: 'C1 Ariete', nation: 'Italy', era: 'modern', class: 'mbt',
    hp: 2150,
    enginePowerHp: 1250, weightTons: 54, topSpeedKmh: 65, reverseSpeedKmh: 25,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 6.2, baseAccuracy: 0.29, aimTimeS: 1.7,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM33 APFSDS', 'APFSDS', 120, apfsdsPens(480)[0], apfsdsPens(480)[1], 500, 1650, { pen2000Mm: apfsdsPens(480)[2] }),
        shell('MP HEAT', 'HEAT', 120, 600, 600, 470, 1400),
        shell('120 HE', 'HE', 120, 45, 45, 560, 1000),
      ],
    },
    dims: { hullLengthM: 7.59, overallLengthM: 9.67, widthM: 3.60, heightM: 2.50 },
    armor: modernArmor({
      hl: 3.8, hw: 1.79, inW: 1.22, floor: 0.42, trkTop: 0.92, roofY: 1.47,
      turretPivot: [0, 1.48, -0.12], gunPivot: [0, 0.31, 0.72],
      barrelLenM: 5.35, barrelRadM: 0.079,
      // lightest first-rank NATO MBT — sniper, not brawler (§26.2)
      glacis: [45, 110, 140], lower: [400, 350, 500], side: [40, 70, 70],
      skirt: [15, 40, 120], rear: 35, roof: 35,
      tw: 1.25, tFrontZ: 0.92, tRearZ: -1.62, tH: 0.64,
      cheek: [420, 400, 600], tSide: [250, 260, 380], tRear: 60, tRoof: 40,
      mantlet: [300, 360, 450], loader: true,
    }),
    visual: {
      // solid NATO green + low-contrast dark olive mottle (§26.5)
      scheme: 'stripes', base: '#42503a', weather: '#4c5a44',
      patches: ['#37432f', '#2c352a'],
      marking: 'number', number: '118', trackWidthM: 0.60, camoScale: 0.6,
    },
  },
};

// Register specs + model-source rows + garage roster ids (idempotent —
// vite HMR can re-evaluate this module).
for (const [id, spec] of Object.entries(MODERN3_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// ---------------------------------------------------------------------------
// Builders (KIT destructured inside each body — see cycle note above)
// ---------------------------------------------------------------------------

// =============================== Chieftain Mk 10 ===========================
// §19.5: reclined-driver one-piece shallow glacis (no stepped driver plate),
// tall louvred engine deck, needle-nose cast turret with Stillbrew collar,
// Horstmann bogies with external coil springs, NO skirts, IR searchlight.
function buildChieftain(P) {
  const { box, cylX, cylY, cylZ, frustum, buildGun, buildRunningGear, cupola,
    headlight, liftEye, periscope, pintleMG, smokeCluster, towCable, fenders,
    stowage, jerryCan, tarpRoll, ammoCan, spareTrackStrip, polyTurret } = KIT;
  const { rng } = P;
  // hull
  P.add('hull', box(2.30, 0.62, 7.30), 0, 0.72, 0);                             // lower hull
  // sponson band over the tracks — front face slants parallel to the glacis
  // so the side profile flows nose lip -> deck in one line
  P.add('hull', frustum(1.52, 2.49, -3.68, 1.52, 0.62, -3.68, 1.04, 1.68));
  // ONE continuous shallow glacis: nose lip (0.66, 3.74) -> ring (1.70, 0.55).
  // §B6/§B4 (uk b6 round, 2026-08-04): both bow plates NARROWED to the
  // inter-track span (halfW 1.15 < band inner face 1.195) — the old ±1.55
  // solids ran THROUGH the track channel and the front wrap was buried in
  // the glacis wedge (track-clip 75 vox front, the owner's §B4 class). The
  // raised-idler wrap now climbs in the open bow corner under the fender
  // toe like the real Mk 10 (idler proud of the glacis toe corners).
  P.add('hull', frustum(1.15, 3.74, 0.50, 1.15, 0.58, 0.50, 0.66, 1.70));
  P.add('hull', frustum(1.15, 3.42, 3.62, 1.15, 3.74, 3.62, 0.32, 0.66));       // nose plate (between the idlers)
  // r5 ("rear hull is a featureless container-like box nearly as tall as the
  // turret"): the raised deck drops to the real Chieftain's LOW engine deck —
  // a shallow 14 cm louvre platform just proud of the sponson line, sloping
  // nothing, with the louvre banks reading as deck relief instead of the
  // walls of a shipping container.
  P.add('hull', box(3.04, 0.14, 2.30), 0, 1.75, -2.50);                         // low engine deck
  // big louvred plates across the deck (§19.5) — detail bars over narrow
  // dark slots, never one big black slab
  for (let k = 0; k < 7; k++) {
    P.add('hullDetail', box(2.5, 0.05, 0.17), 0, 1.825, -1.62 - k * 0.28);
    P.add('hullDark', box(2.4, 0.02, 0.09), 0, 1.83, -1.76 - k * 0.28);
  }
  // rear plate: exhaust boxes low on the corners + taillights
  P.add('hull', box(3.0, 0.7, 0.1), 0, 1.30, -3.68);
  P.add('hull', box(2.9, 0.18, 0.1), 0, 1.72, -3.66);                           // upper rear plate
  for (const s of [-1, 1]) {
    P.add('hull', box(0.5, 0.42, 0.22), s * 1.05, 1.22, -3.72);                 // exhaust shroud boxes
    P.add('hullDark', box(0.34, 0.10, 0.06), s * 1.05, 1.10, -3.85);            // exhaust slots
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.4, 1.62, -3.73);             // taillights
  }
  fenders(P, 1.20, 1.83, 1.10, -3.68, 3.55, 0.04);
  // fender stowage bins — the Chieftain carries its kit along the track guards
  // r2 ("giant featureless hull stowage boxes"): panel splits, strap bands,
  // latch blocks and a stowed pioneer roll so the bins read as built kit
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.30, 0.24, 1.6), s * 1.66, 1.24, 1.5);
    P.add('hullDetail', box(0.30, 0.24, 1.3), s * 1.66, 1.24, -0.4);
    P.add('hullDark', box(0.31, 0.02, 1.55), s * 1.66, 1.37, 1.5);              // lid seams
    P.add('hullDark', box(0.31, 0.02, 1.25), s * 1.66, 1.37, -0.4);
    for (const zc of [1.05, 1.95, -0.05, -0.75]) {
      P.add('hullDark', box(0.315, 0.25, 0.025), s * 1.66, 1.24, zc);           // strap bands
      P.add('hullDetail', box(0.05, 0.06, 0.06), s * 1.815, 1.30, zc);          // latch blocks
    }
    P.add('hullDark', box(0.32, 0.025, 0.02), s * 1.66, 1.13, 1.5);             // base seam
    P.add('hullDark', box(0.32, 0.025, 0.02), s * 1.66, 1.13, -0.4);
    // r5 ("unpainted beige cylinder floats on the sponson"): the roll now
    // SITS on the bin lid, lashed with a center strap (hull frame — the r5
    // first pass parented it to the turret bucket and it levitated)
    tarpRoll(P, 'hullCloth', s * 1.66, 1.44, 0.9, 0.85, 0.065, false);          // stowed roll on the bin lid
    P.add('hullDark', box(0.30, 0.14, 0.03), s * 1.66, 1.44, 0.9);              // center lashing strap
  }
  // splash-board ridge across the glacis (§19.5)
  P.add('hullDetail', box(2.0, 0.055, 0.10), 0, 1.29, 1.85, -1.25, 0, 0);
  // §B6/§B4: headlights + glacis cable pulled INBOARD of the track channel
  // (old x ±1.30 / ±1.35 sat inside the band span 1.195..1.805 and the
  // raised idler wrap sweeps that corner — they now sit on the narrowed
  // glacis plate like the real Mk 10's inboard lamp brackets).
  headlight(P, -1.06, 0.88, 3.28, -1.1);
  headlight(P, 1.06, 0.88, 3.28, -1.1);
  periscope(P, 'hullDetail', 0, 1.63, 0.85);                                    // reclined driver's periscope
  liftEye(P, 'hullDetail', -1.35, 1.72, 0.3);
  liftEye(P, 'hullDetail', 1.35, 1.72, 0.3);
  towCable(P, [[-1.10, 0.86, 3.02], [-0.4, 0.78, 3.40], [0.6, 0.82, 3.28]]);
  spareTrackStrip(P, 'hull', -0.85, 0.94, 3.0, 2, -1.25, 0);
  // bridge-class yellow disc "60" stand-in + ZAP plate
  P.decal('hull', 'number', '60', 0.26, [0.95, 0.82, 3.35], 0, -1.25);
  // Horstmann bogies: 3 twin blocks per side, external coil springs VISIBLE
  // between the wheel pairs (§19.5 key detail)
  for (const [zc, z0, z1] of [[2.15, 2.55, 1.75], [0.15, 0.55, -0.25], [-1.85, -1.45, -2.25]]) {
    for (const s of [-1, 1]) {
      P.add('hullDetail', box(0.28, 0.36, 0.72), s * 1.30, 0.52, zc);           // bogie block
      P.add('hullDark', cylZ(0.09, 0.60, 10), s * 1.48, 0.80, zc);              // external coil spring
      P.add('hullDark', cylZ(0.06, 0.72, 8), s * 1.48, 0.80, zc);               // spring rod
      P.add('hullDetail', cylX(0.05, 0.34, 8), s * 1.42, 0.47, z0);             // axle stubs
      P.add('hullDetail', cylX(0.05, 0.34, 8), s * 1.42, 0.47, z1);
    }
  }
  // tank_models r2 (critic major: "near-rectangular exposed track run — the
  // Chieftain's top run should slope with a raised rear sprocket", plus "tan
  // sprocket with dark wheels"): the rear drive sprocket rides HIGH like the
  // real Mk 10 and the return rollers step down toward the front idler so
  // the whole top run reads as one descending slope (real trapezoid form);
  // paintedEnds pulls sprocket/idler onto the same scheme paint as the road
  // wheels instead of bare dust-steel drums.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.36, wheelW: 0.155, xc: 1.50, dishR: 0.80,
    wheelZs: [2.55, 1.75, 0.55, -0.25, -1.45, -2.25],
    // r5 ("six giant plain green discs with no paired-wheel gap"): BOTH rows
    // of each Horstmann pair keep scheme paint (recessDepth widens past the
    // 0.20 row spread) so the visible gap between paired rims reads; dishR
    // gives every wheel its rubber tire ring + hub separation.
    layers: [[-0.10, 0.10]], recessDepth: 0.30,                                 // paired steel-rimmed wheels
    // §B6 TRACK-RUN SILHOUETTE (owner law 2026-08-04): idler RAISED from the
    // r3 y 0.50 (road-wheel height, wheelY 0.46 — the front curled to ground
    // for a parallelogram read) to 0.60: wrap bottom 0.265, ~24° approach
    // ramp from the first road wheel, top wrap 0.935 meeting the stepped
    // roller line — the \________/ trapezoid at BOTH ends (rear ramp ~18°).
    sprocket: { z: -3.18, y: 0.70, r: 0.33 }, idler: { z: 3.12, y: 0.60, r: 0.29 },
    rollers: [[1.55, 0.80], [0.05, 0.88], [-1.6, 0.97]].map(([z, y]) => ({ z, y, r: 0.08 })),
    // r3: §19.5 "top run covered by shallow fenders with stowage bins" — the
    // exposed Horstmann wheel line stays (authentic), the horn comb goes.
    trackW: 0.61, topY: 0.90, paintedEnds: true, coveredTop: true,
  });
  // turret: long cast body with the needle-nose front (§19.5)
  const CTH = 0.78;
  P.add('turret', polyTurret([
    [0.18, 1.48], [0.76, 0.76], [1.06, 0.14], [1.10, -0.60], [0.76, -1.16],
    [0.34, -1.36], [-0.34, -1.36], [-0.76, -1.16], [-1.10, -0.60], [-1.06, 0.14],
    [-0.76, 0.76], [-0.18, 1.48],
  ], CTH, 1.07, 0.76), 0, 0, 0);
  // Stillbrew appliqué collar: blocky slabs wrapped around snout base + cheeks
  for (const s of [-1, 1]) {
    P.add('turret', box(0.66, 0.46, 0.30), s * 0.52, 0.26, 0.88, -0.06, s * 0.88, 0); // cheek slab
    P.add('turret', box(0.54, 0.34, 0.28), s * 0.90, 0.24, 0.30, -0.04, s * 1.05, 0); // shoulder slab
    P.add('turretDark', box(0.68, 0.03, 0.31), s * 0.52, 0.50, 0.88, -0.06, s * 0.88, 0); // weld bead
  }
  P.add('turret', box(0.76, 0.26, 0.66), 0, 0.50, 1.04);                        // collar over the snout
  // No. 15 commander cupola LEFT with its own episcope ring + GPMG (§19.5)
  cupola(P, 'turret', -0.52, CTH - 0.02, -0.40, 0.28, 0.22, 7);
  pintleMG(P, -0.52, CTH + 0.20, -0.55, false);
  P.add('turret', cylY(0.21, 0.21, 0.05, 12), 0.52, CTH, -0.35);                // loader hatch
  periscope(P, 'turretDetail', 0.35, CTH + 0.02, 0.15);
  // IR searchlight box on the turret LEFT cheek with barn door (§19.5)
  P.add('turret', box(0.44, 0.52, 0.34), -0.94, 0.36, 0.22, 0, -0.5, 0);
  P.add('turretDark', box(0.36, 0.42, 0.05), -1.06, 0.36, 0.38, 0, -0.5, 0);    // door face
  P.add('turretDetail', box(0.04, 0.46, 0.04), -1.18, 0.36, 0.28, 0, -0.5, 0);  // hinge
  // r5 ("add the turret-side stowage bins that define the Mk 10
  // silhouette"): long shallow bins hung along BOTH turret flanks with lid
  // seams and strap bands — the Chieftain's turret reads wider than its
  // casting because of exactly this kit.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.24, 0.34, 1.35), s * 1.06, 0.34, -0.72, 0, s * 0.06, 0);
    P.add('turretDark', box(0.25, 0.02, 1.30), s * 1.06, 0.46, -0.72, 0, s * 0.06, 0);  // lid seam
    for (const zc of [-0.25, -0.95]) {
      P.add('turretDark', box(0.255, 0.35, 0.025), s * 1.07, 0.34, zc, 0, s * 0.06, 0); // strap bands
    }
  }
  // long stowage tail: full-width rear bin + bustle basket (§19.5)
  P.add('turret', box(1.9, 0.44, 0.62), 0, 0.30, -1.62);
  P.add('turretDark', box(1.8, 0.02, 0.5), 0, 0.10, -2.12);                     // basket mesh floor
  P.add('turretDetail', box(1.9, 0.045, 0.045), 0, 0.42, -2.32);                // basket rails
  P.add('turretDetail', box(1.9, 0.045, 0.045), 0, 0.10, -2.32);
  for (let k = 0; k < 9; k++) P.add('turretDetail', box(0.03, 0.32, 0.03), -0.9 + k * 0.225, 0.26, -2.32);
  stowage(P, 'turretCloth', rng, [
    [-0.55, 0.30, -2.05, 0.55, 0.34, 0.4], [0.35, 0.28, -2.05, 0.6, 0.3, 0.42],
  ]);
  tarpRoll(P, 'turretCloth', 0, 0.58, -1.62, 1.5, 0.10, true);                  // camo net roll
  jerryCan(P, 'turretCloth', 0.85, 0.28, -2.05, 0.2);
  ammoCan(P, 'turretDark', -0.95, 0.24, -2.02, 0.1);
  // 2x6 smoke dischargers on the cheeks
  smokeCluster(P, 0.80, 0.38, 1.04, 6, 0.85, 0.7);
  smokeCluster(P, -0.80, 0.38, 1.04, 6, -0.85, 0.7);
  P.add('turretDetail', box(0.03, 0.55, 0.03), 0.85, 0.95, -1.2, 0, 0, 0.1);    // whip antenna
  // needle-nose mantlet-less snout: tapered collar the gun emerges from
  P.addGunExtra(cylZ(0.145, 0.55, 14, 0.21), 0, 0, 0.38);
  P.addGunExtra(box(0.42, 0.42, 0.28), 0, 0, 0.10);
  buildGun(P, { len: 6.1, r: 0.082, sleeve: true, evac: 0.58, baseR: 0.16 });   // L11A5, fat full sleeve
  // white callsign circle stand-ins
  P.decal('turret', 'number', '22', 0.32, [0.97, 0.30, -1.62], Math.PI / 2);
  P.decal('turret', 'number', '22', 0.32, [-0.97, 0.30, -1.62], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.7, [1.05, 1.3, -3.9], Math.PI);
  P.decal('hull', 'soot', null, 0.7, [-1.05, 1.3, -3.9], Math.PI);
  P.topY = 1.10;
}

// ================================ K2 Black Panther ==========================
// §23.5: lean NATO wedge, strongly raked one-piece turret front (steeper than
// Leo 2A6), stepped-down roof, tall KCPS pano tower rear-left, full skirts
// with stepped lower edge, 6 wheels, L/55.
function buildK2(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, buildGun, buildRunningGear,
    headlight, liftEye, periscope, pintleMG, smokeCluster, towCable, fenders,
    stowage, jerryCan, ammoCan, torus } = KIT;
  const { rng } = P;
  P.add('hull', box(2.40, 0.56, 7.35), 0, 0.73, 0);                             // lower hull
  P.add('hull', box(3.28, 0.36, 4.85), 0, 1.48, -1.18);                         // upper band
  fenders(P, 1.26, 1.84, 1.28, -3.6, 3.55, 0.035);
  P.add('hull', frustum(1.66, 3.70, 1.25, 1.66, 1.25, 1.25, 0.92, 1.66));       // long clean glacis
  P.add('hull', frustum(1.58, 3.38, 3.70, 1.66, 3.70, 3.70, 0.45, 0.92));       // lower front
  P.add('hull', box(3.05, 0.5, 0.12), 0, 1.38, -3.66);                          // rear plate
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.66, 0.38, 0.04), s * 0.95, 1.20, -3.73);            // exhaust grilles
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.66, 0.05, 0.05), s * 0.95, 1.06 + k * 0.10, -3.745);
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.35, 1.48, -3.72);            // taillights
    P.add('hullRubber', box(0.55, 0.32, 0.03), s * 1.5, 0.52, -3.72, 0.12, 0, 0); // mud flaps
  }
  // full-length angular skirts with the STEPPED lower edge (§23.5)
  // tank_models r2 (critic major: "real K2 wears side skirts covering the
  // gear" — the old x1.82 panels sat flush with the 1.815 track edge and
  // barely covered the wheels): pushed outboard of the track run, deepened
  // to mid-wheel, HEAVY armor blocks over the front third (proud, with bolt
  // seams) + thinner rubber-fringed run aft, per modern-roster.md §23.5.
  // r3 (clone-hull critical: "K2 shown with 7-8 half-exposed wheels" — the
  // skirt bottom sat at 0.71 m over 0.83 m wheel tops, so the whole wheel
  // band read bare): the full-length angular skirts now drop to ~0.57 m
  // (§23.5 — skirts hide the return run and half the wheels), with the
  // stepped lower plates riding just above the wheel axles.
  // r4 clone-hull fix: skirt run ends short of the nose with a raised
  // stepped stub over the idler — front wheel + rising track read again.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.07, 0.66, 6.3), s * 1.875, 0.90, -0.35);                // main skirt band (0.57-1.23)
    P.add('hull', box(0.11, 0.70, 1.9), s * 1.895, 0.90, 1.95);                 // heavy front blocks
    P.add('hull', box(0.11, 0.34, 0.85), s * 1.895, 1.06, 3.28, 0, 0, 0);       // stepped idler stub
    P.add('hullDark', box(0.115, 0.64, 0.02), s * 1.895, 0.90, 1.55);           // block split
    P.add('hullDark', box(0.115, 0.64, 0.02), s * 1.895, 0.90, 2.85);
    for (let k = 0; k < 4; k++) {                                               // stepped lower plates
      P.add('hull', box(0.06, 0.22, 1.45), s * 1.885, 0.575 - (k % 2) * 0.05, 2.5 - k * 1.7);
    }
    P.add('hullRubber', box(0.045, 0.14, 4.1), s * 1.875, 0.50, -1.55);         // rubber rear fringe
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.076, 0.58, 0.018), s * 1.875, 0.88, 2.8 - k * 1.4); // seams
  }
  // deck furniture: driver hatch (center-right), V splash board, filler caps
  for (const s of [-1, 1]) P.add('hullDetail', box(0.95, 0.045, 0.07), s * 0.43, 1.42, 2.4, -0.28, s * 0.42, 0);
  P.add('hull', cylY(0.28, 0.28, 0.035, 18), 0.45, 1.68, 1.75);                 // driver hatch ring
  P.add('hullDark', torus(0.28, 0.014, 18), 0.45, 1.685, 1.75);
  periscope(P, 'hullDetail', 0.25, 1.70, 2.05);
  periscope(P, 'hullDetail', 0.55, 1.70, 2.08);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.03, 12), s * 1.25, 1.675, -0.2); // filler caps
  headlight(P, -1.32, 1.02, 3.60, -0.35);
  headlight(P, 1.32, 1.02, 3.60, -0.35);
  liftEye(P, 'hullDetail', -1.35, 1.70, 0.6);
  liftEye(P, 'hullDetail', 1.35, 1.70, 0.6);
  towCable(P, [[-1.15, 1.35, 2.9], [0, 1.5, 2.05], [1.15, 1.35, 2.9]]);
  // rear deck fan/radiator louvers
  P.add('hullDark', box(2.5, 0.02, 1.15), 0, 1.665, -2.6);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.36, 0.03, 0.07), 0, 1.675, -3.05 + k * 0.22);
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.365, wheelW: 0.22, xc: 1.50,
    wheelZs: [2.6, 1.56, 0.52, -0.52, -1.56, -2.6],
    sprocket: { z: -3.22, y: 0.52, r: 0.29 }, idler: { z: 3.16, y: 0.50, r: 0.28 },
    rollers: [1.6, 0, -1.6].map((z) => ({ z, y: 0.95, r: 0.09 })),
    // r3: §23.5 return rollers are "hidden by skirts" — no horn comb.
    trackW: 0.63, topY: 0.95, paintedEnds: true, coveredTop: true,
  });
  // ---- turret: compact angular box + steep one-piece front wedge ----
  // r7 (barge read): base box extended aft 0.30 m — the K2 turret+bustle is
  // ~46% of hull length; the old 2.9 m turret over the 7.35 m hull read toy
  const KTH = 0.78;
  P.add('turret', frustum(1.30, 0.48, -1.85, 1.20, 0.30, -1.80, 0.0, KTH));     // base box
  // one-piece raked front wedge, TWO tiers (lower sweeps under the gun to the
  // plan apex; upper stops at |x| 0.32 leaving the mantlet slot)
  P.add('turret', slab(                                                          // R lower apex tier
    [0.03, 0.05, 1.32], [1.32, 0.05, 0.58], [1.32, 0.05, 0.40], [0.03, 0.05, 1.14],
    [0.03, 0.24, 1.22], [1.32, 0.24, 0.48], [1.32, 0.24, 0.30], [0.03, 0.24, 1.04]));
  P.add('turret', slab(                                                          // L lower apex tier
    [-1.32, 0.05, 0.58], [-0.03, 0.05, 1.32], [-0.03, 0.05, 1.14], [-1.32, 0.05, 0.40],
    [-1.32, 0.24, 0.48], [-0.03, 0.24, 1.22], [-0.03, 0.24, 1.04], [-1.32, 0.24, 0.30]));
  P.add('turret', slab(                                                          // R upper tier (steep ~58°)
    [0.32, 0.24, 1.06], [1.32, 0.24, 0.48], [1.32, 0.24, 0.30], [0.32, 0.24, 0.88],
    [0.32, KTH, 0.62], [1.32, KTH, 0.04], [1.32, KTH, -0.14], [0.32, KTH, 0.44]));
  P.add('turret', slab(                                                          // L upper tier
    [-1.32, 0.24, 0.48], [-0.32, 0.24, 1.06], [-0.32, 0.24, 0.88], [-1.32, 0.24, 0.30],
    [-1.32, KTH, 0.04], [-0.32, KTH, 0.62], [-0.32, KTH, 0.44], [-1.32, KTH, -0.14]));
  // dark standoff wall behind the wedge slot + painted slot back wall
  P.add('turretDark', box(0.68, 0.52, 0.06), 0, 0.30, 0.52);
  // STEPPED ROOF: front roof raised over the gunner sight (§23.5 signature)
  P.add('turret', box(2.35, 0.10, 1.05), 0, KTH + 0.05, -0.05);
  // gunner's sight embedded in the RIGHT front roof with armored shutter
  P.add('turretDark', box(0.52, 0.16, 0.42), 0.62, KTH + 0.10, 0.28);           // recess
  P.add('turret', box(0.44, 0.18, 0.34), 0.62, KTH + 0.13, 0.26);               // head
  P.add('turretDark', box(0.34, 0.12, 0.04), 0.62, KTH + 0.13, 0.44);           // shutter
  P.add('turretGlass', box(0.26, 0.08, 0.02), 0.62, KTH + 0.13, 0.465);
  P.add('turretDetail', box(0.48, 0.04, 0.38), 0.62, KTH + 0.235, 0.24);        // brow lid
  // KCPS panoramic sight TOWER rear-left (tallest point)
  P.add('turretDetail', cylY(0.07, 0.09, 0.34, 12), -0.52, KTH + 0.17, -1.12);
  P.add('turretDetail', cylY(0.10, 0.10, 0.08, 12), -0.52, KTH + 0.38, -1.12);
  P.add('turretDark', box(0.22, 0.26, 0.22), -0.52, KTH + 0.55, -1.12);
  P.add('turretGlass', box(0.14, 0.12, 0.02), -0.52, KTH + 0.57, -1.00);
  // commander hatch + crew .50 on a simple ring mount (RWS-less, §23.5)
  P.add('turret', cylY(0.23, 0.23, 0.045, 14), 0.55, KTH + 0.02, -0.60);
  pintleMG(P, 0.55, KTH + 0.04, -0.72);
  P.add('turret', cylY(0.21, 0.21, 0.045, 14), -0.55, KTH + 0.02, -0.45);       // gunner/loader hatch
  // bustle: autoloader blow-off panel seams + twin stowage baskets (r7: kit
  // rides the extended bustle)
  P.add('turretDetail', box(0.9, 0.015, 0.72), 0, KTH + 0.008, -1.40);          // blow-off panel
  P.add('turretDark', box(0.92, 0.012, 0.03), 0, KTH + 0.02, -1.02);            // panel seams
  P.add('turretDark', box(0.03, 0.012, 0.72), 0.45, KTH + 0.02, -1.40);
  P.add('turretDark', box(0.03, 0.012, 0.72), -0.45, KTH + 0.02, -1.40);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 1.0), s * (1.30 + 0.10), 0.55, -1.20); // basket rails
    P.add('turretDetail', box(0.05, 0.05, 1.0), s * (1.30 + 0.10), 0.18, -1.20);
    for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.03, 0.37, 0.03), s * (1.30 + 0.10), 0.365, -0.80 - k * 0.2);
    stowage(P, 'turretCloth', rng, [[s * 1.36, 0.38, -1.20, 0.14, 0.28, 0.8]]);
  }
  // r3 kit de-share (clone-hull critique: "identical rear slat-basket + tan
  // box stowage kit" across the moderns): the K2 drops the NATO-style tan
  // jerry can — ROK bustles carry hard cases; twin dark ammo cans instead.
  ammoCan(P, 'turretDark', -1.05, 0.28, -2.02, 0.15);
  ammoCan(P, 'turretDark', 0.95, 0.26, -2.02, -0.2);
  // 6-tube smoke banks angled on the rear corners
  smokeCluster(P, 1.02, 0.40, -1.60, 6, 2.05, 0.7);
  smokeCluster(P, -1.02, 0.40, -1.60, 6, -2.05, 0.7);
  P.add('turretDetail', box(0.03, 0.5, 0.03), -0.95, KTH + 0.25, -1.75);        // crosswind mast
  P.add('turretDetail', box(0.03, 0.55, 0.03), 0.95, KTH + 0.25, -1.8, 0, 0, 0.1); // whip antenna
  // mantlet in the wedge slot
  P.addGunExtra(box(0.55, 0.42, 0.30), 0, 0.02, 0.48);
  P.addGunExtra(cylZ(0.13, 0.30, 12, 0.16), 0, 0, 0.70);
  buildGun(P, { len: 6.6, r: 0.079, sleeve: true, evac: 0.62, collar: true, baseR: 0.16 }); // CN08 L/55
  P.decal('turret', 'number', '325', 0.28, [1.285, 0.30, -0.65], Math.PI / 2, 0, 0.07);
  P.decal('turret', 'number', '325', 0.28, [-1.285, 0.30, -0.65], -Math.PI / 2, 0, -0.07);
  P.decal('hull', 'soot', null, 0.8, [0.95, 1.25, -3.78], Math.PI);
  P.topY = 1.35;
}

// =================================== Type 10 ================================
// §24.5: smallest/narrowest MBT — clean wedge, flat deck, FIVE road wheels,
// flat modular bolt-stud skirts, low slab turret with the C4I pano box on a
// short pylon rear-center, very clean surfaces.
function buildType10(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, buildGun, buildRunningGear,
    headlight, liftEye, periscope, pintleMG, smokeCluster, towCable, fenders,
    torus } = KIT;
  P.add('hull', box(2.05, 0.52, 6.55), 0, 0.70, 0);                             // lower hull
  P.add('hull', box(2.92, 0.32, 4.3), 0, 1.40, -0.9);                           // upper band, completely flat deck
  fenders(P, 1.10, 1.60, 1.20, -3.3, 3.28, 0.03);
  P.add('hull', frustum(1.45, 3.32, 1.5, 1.45, 1.15, 1.5, 1.00, 1.56));         // upper glacis plane
  P.add('hull', frustum(1.36, 2.98, 3.32, 1.45, 3.32, 3.32, 0.42, 1.00));       // lower glacis plane
  P.add('hull', box(2.8, 0.46, 0.10), 0, 1.30, -3.34);                          // rear plate
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.55, 0.32, 0.04), s * 0.85, 1.18, -3.40);            // exhaust louvres
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.55, 0.05, 0.05), s * 0.85, 1.07 + k * 0.11, -3.415);
    P.add('hullRubber', box(0.46, 0.28, 0.03), s * 1.3, 0.5, -3.42, 0.1, 0, 0); // mud flaps
  }
  // FLAT MODULAR SLAB SKIRTS: straight lower edge, visible bolt studs, inset
  // from the fender line, step cutout at wheel 1 (§24.5)
  // r3 (clone-hull critical: "Type 10 should be a compact 5-wheel skirted
  // hull — shown with exposed wheels"): the modular slabs now drop to the
  // wheel axle line (§24.5 — flat slabs with a straight lower edge hiding
  // the upper half of the running gear).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.05, 0.60, 4.9), s * 1.56, 0.82, -0.65);                 // main modular run (0.52-1.12)
    P.add('hull', box(0.05, 0.44, 1.15), s * 1.56, 0.93, 2.35);                 // stepped front panel
    for (let k = 0; k < 4; k++) P.add('hullDark', box(0.056, 0.54, 0.016), s * 1.56, 0.82, 0.75 - k * 1.15); // module seams
    if (P.q) for (let k = 0; k < 10; k++) {                                     // bolt studs
      P.add('hullDark', cylX(0.018, 0.07, 6), s * 1.585, 1.06, 1.7 - k * 0.52);
    }
  }
  // deck furniture: driver hatch (right), periscopes, splash V, filler caps
  for (const s of [-1, 1]) P.add('hullDetail', box(0.8, 0.04, 0.06), s * 0.36, 1.38, 2.15, -0.3, s * 0.42, 0);
  P.add('hull', cylY(0.26, 0.26, 0.03, 16), 0.42, 1.575, 1.55);
  P.add('hullDark', torus(0.26, 0.013, 16), 0.42, 1.58, 1.55);
  periscope(P, 'hullDetail', 0.25, 1.60, 1.85);
  periscope(P, 'hullDetail', 0.55, 1.60, 1.88);
  headlight(P, -1.18, 1.06, 3.24, -0.4, 0.05);
  headlight(P, 1.18, 1.06, 3.24, -0.4, 0.05);
  liftEye(P, 'hullDetail', -1.2, 1.58, 0.6);
  liftEye(P, 'hullDetail', 1.2, 1.58, 0.6);
  towCable(P, [[-1.0, 1.3, 2.6], [0, 1.42, 1.9], [1.0, 1.3, 2.6]]);
  P.add('hullDark', box(2.2, 0.02, 1.0), 0, 1.565, -2.4);                       // rear deck radiator inset
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(2.05, 0.03, 0.07), 0, 1.575, -2.78 + k * 0.25);
  // JGSDF white plate on the hull front (§24.5)
  P.decal('hull', 'number', '99-0773', 0.30, [0, 0.80, 3.34], 0, -0.12);
  buildRunningGear(P, {
    // FIVE road wheels — the hard identity check (§24.5 / Appendix B)
    style: 'rubber', wheelR: 0.36, wheelW: 0.20, xc: 1.32,
    wheelZs: [2.25, 1.12, 0.0, -1.12, -2.25],
    sprocket: { z: -2.88, y: 0.50, r: 0.28 }, idler: { z: 2.84, y: 0.48, r: 0.27 },
    rollers: [1.35, 0, -1.35].map((z) => ({ z, y: 0.92, r: 0.085 })),
    // r3: the modular slab skirts enclose the return run (§24.5).
    trackW: 0.55, topY: 0.92, paintedEnds: true, coveredTop: true,
  });
  // ---- turret: low flat slab with shallow wedge front ----
  const TTH = 0.60;
  P.add('turret', frustum(1.14, 0.40, -1.38, 1.04, 0.24, -1.32, 0.0, TTH));     // slab body
  P.add('turret', slab(                                                          // R front wedge
    [0.10, 0.03, 1.02], [1.15, 0.03, 0.40], [1.15, 0.03, 0.24], [0.10, 0.03, 0.86],
    [0.10, TTH, 0.62], [1.15, TTH, 0.02], [1.15, TTH, -0.14], [0.10, TTH, 0.46]));
  P.add('turret', slab(                                                          // L front wedge
    [-1.15, 0.03, 0.40], [-0.10, 0.03, 1.02], [-0.10, 0.03, 0.86], [-1.15, 0.03, 0.24],
    [-1.15, TTH, 0.02], [-0.10, TTH, 0.62], [-0.10, TTH, 0.46], [-1.15, TTH, -0.14]));
  P.add('turret', box(0.56, 0.46, 0.20), 0, 0.26, 0.72);                        // gun embrasure block
  // gunner's sight: WIDE HORIZONTAL SLOT in the upper front face w/ shutter
  P.add('turretDark', box(0.68, 0.15, 0.07), 0.22, 0.47, 0.74, -0.35, 0, 0);
  P.add('turretGlass', box(0.56, 0.09, 0.02), 0.22, 0.47, 0.785, -0.35, 0, 0);
  P.add('turretDetail', box(0.72, 0.04, 0.10), 0.22, 0.56, 0.74, -0.35, 0, 0);  // shutter brow
  // flat panoramic C4I sight box on a SHORT PYLON, rear-center (§24.5)
  P.add('turretDetail', box(0.14, 0.20, 0.14), 0, TTH + 0.10, -0.90);           // pylon
  P.add('turretDark', box(0.40, 0.24, 0.30), 0, TTH + 0.32, -0.90);             // flat pano box
  P.add('turretGlass', box(0.28, 0.10, 0.02), 0, TTH + 0.34, -0.74);
  // hatches + roof .50 on a simple mount
  P.add('turret', cylY(0.22, 0.22, 0.04, 14), 0.48, TTH + 0.02, -0.35);         // commander
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.48, TTH + 0.02, -0.30);        // loader side hatch
  pintleMG(P, 0.48, TTH + 0.04, -0.50);
  periscope(P, 'turretDetail', 0.48, TTH + 0.05, -0.05);
  // small smoke banks on the slab cheeks (2x4)
  smokeCluster(P, 0.98, 0.44, 0.02, 4, 1.15, 0.5);
  smokeCluster(P, -0.98, 0.44, 0.02, 4, -1.15, 0.5);
  // shallow bustle with rack rails
  P.add('turretDetail', box(2.0, 0.04, 0.04), 0, 0.50, -1.52);
  P.add('turretDetail', box(2.0, 0.04, 0.04), 0, 0.16, -1.52);
  for (let k = 0; k < 8; k++) P.add('turretDetail', box(0.028, 0.34, 0.028), -0.95 + k * 0.27, 0.33, -1.52);
  P.add('turretDark', box(1.9, 0.015, 0.3), 0, 0.18, -1.44);
  // twin whip antennas (§24.5)
  P.add('turretDetail', box(0.025, 0.5, 0.025), 0.85, TTH + 0.2, -1.2, 0, 0, 0.1);
  P.add('turretDetail', box(0.025, 0.5, 0.025), -0.85, TTH + 0.2, -1.2, 0, 0, -0.1);
  P.addGunExtra(box(0.50, 0.38, 0.28), 0, 0.01, 0.42);                          // mantlet
  P.addGunExtra(cylZ(0.12, 0.26, 12, 0.15), 0, 0, 0.62);
  buildGun(P, { len: 5.3, r: 0.075, sleeve: true, evac: 0.55, baseR: 0.15 });   // JSW 120 L/44
  P.decal('turret', 'number', '73', 0.26, [1.10, 0.30, -0.55], Math.PI / 2, 0, 0.06);
  P.decal('turret', 'number', '73', 0.26, [-1.10, 0.30, -0.55], -Math.PI / 2, 0, -0.06);
  P.topY = 0.95;
}

// ================================ M2A2 Bradley ==============================
// §6.5: tall slab aluminum box, one-piece 60° glacis, nose shelf, rear troop
// ramp, RIGHT-offset two-man turret with 25 mm + elevating twin TOW box,
// A2 appliqué side slabs with stand-off bolts, front drive sprocket.
function buildBradley(P) {
  // AFV r1 REBUILD against the 42manako oracle (vertex report docs/
  // references/vertex/m2a2_bradley.json — all targets below are that
  // report's gate-world numbers; batch-38 normalized print, 0%/0%/0% with
  // width -1.3% documented). Print split: hull roof 1.90, tall two-man
  // turret CLUSTER 1.89..2.98 (core + bustle rack + twin whips + TOW pod
  // LEFT + right stowage wing), gun bar 2.23..2.31 to muzzle 2.39.
  // Packet identity: one-piece raked glacis, driver front-LEFT + wire
  // cutter, corner headlights, rear troop RAMP with door inset, appliqué
  // plates, full-length skirts, 2x4 smoke, rear drive + front idler BOTH
  // raised (§B6; the print carries real ramps at both ends).
  const { box, cylX, cylY, cylZ, frustum, slab, buildGun, buildRunningGear,
    liftEye, periscope, stowage } = KIT;
  const { rng } = P;
  // ---- hull: narrow tub between the tracks, upper body flared to +-1.62 --
  P.add('hull', box(1.90, 0.60, 5.35), 0, 0.75, -0.30);                         // tub y 0.45..1.05
  for (const s of [-1, 1]) {                                                    // flare slabs over the tracks
    P.add('hull', slab(                                                          // bottom edge 1.13: clear of the
      [s < 0 ? -1.05 : 1.02, 1.13, 2.55], [s < 0 ? -1.02 : 1.05, 1.13, 2.55],    // 1.09 wrap apex (§B4); LEFT flare
      [s < 0 ? -1.02 : 1.05, 1.13, -3.20], [s < 0 ? -1.05 : 1.02, 1.13, -3.20],  // ends at the print's own -1.51
      [s < 0 ? -1.49 : 1.55, 1.62, 2.30], [s < 0 ? -1.42 : 1.62, 1.62, 2.30],    // (r2 front read)
      [s < 0 ? -1.42 : 1.62, 1.62, s < 0 ? -2.94 : -3.24],                       // (r4: LEFT top-rear pulled -3.24
      [s < 0 ? -1.49 : 1.62, 1.62, s < 0 ? -2.94 : -3.24]));                     //   -> -2.94 — the ref left flank
                                                                                 //   plan band ends -2.95; the -1.44
                                                                                 //   col read my flare to -3.25.
                                                                                 //   Stern corner caps + bumperette
                                                                                 //   own the rear-left top-down
                                                                                 //   corner like the ref's)
  }
  P.add('hull', box(2.10, 0.32, 5.00), 0, 1.75, -0.70);                         // upper spine y 1.59..1.91
  P.add('hull', box(2.04, 0.06, 5.00), 0, 1.875, -0.70);                        // roof plate, top 1.905
  // r3: camber slabs narrowed to the print's own ROOF EDGE (its front trace
  // steps 1.90@1.0 -> 1.77@1.42-1.44 then DROPS to the skirt-top band — the
  // r2 slabs ran the camber out to ±1.58 and, with the wide glacis crest,
  // printed 1.88 across x 1.35-1.57 vs ref 1.42-1.60). Right edge 1.40 (its
  // roof edge ends sooner: 1.74@1.38, dip 1.57@1.42).
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s < 0 ? -1.45 : 1.00, 1.60, 1.83], [s < 0 ? -1.00 : 1.40, 1.60, 1.83],
      [s < 0 ? -1.00 : 1.40, 1.60, -3.24], [s < 0 ? -1.45 : 1.00, 1.60, -3.24],
      [s < 0 ? -1.45 : 1.00, s < 0 ? 1.76 : 1.905, 1.83], [s < 0 ? -1.00 : 1.40, s < 0 ? 1.905 : 1.74, 1.83],
      [s < 0 ? -1.00 : 1.40, s < 0 ? 1.905 : 1.74, -3.24], [s < 0 ? -1.45 : 1.00, s < 0 ? 1.76 : 1.905, -3.24]));
  }
  // raised roof furniture (print tops 2.02/2.06): engine strip + cargo lids
  P.add('hull', box(1.30, 0.075, 0.95), 0.20, 1.94, 1.05);                      // engine deck raise (top 1.98)
  P.add('hullDark', box(1.18, 0.02, 0.82), 0.20, 1.985, 1.05);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.10, 0.028, 0.06), 0.20, 1.995, 1.36 - k * 0.21);
  P.add('hull', box(1.00, 0.155, 0.42), 0.20, 1.985, -2.38);                    // cargo hatch hump (top 2.06)
  P.add('hullDark', box(1.04, 0.015, 0.46), 0.20, 1.955, -2.38);
  P.add('hull', box(1.00, 0.115, 0.20), 0.20, 1.965, -2.88);                    // rear roof box (top 2.02)
  P.add('hullDark', box(0.72, 0.015, 1.28), 0.20, 1.912, -1.55);                // troop hatch seam
  P.add('hullDetail', box(0.5, 0.06, 0.4), -0.95, 1.92, -1.3);                  // intake vent
  // ---- glacis, print two-slope form: steep upper (1.88@1.83 -> 1.52@2.48),
  // driver/vane plateau 1.57-1.60 over 2.4..2.9, nose shelf 1.36 flat -------
  P.add('hull', frustum(1.46, 2.52, 2.42, 1.26, 1.83, 1.60, 1.52, 1.895));      // upper glacis (crest at z 1.83;
                                                                                //   r4e: seam corners 1.50 -> 1.46 —
                                                                                //   probe-named: the ±1.50 verts at
                                                                                //   y 1.52 / z 2.42-2.55 lit the
                                                                                //   -1.51 plan col to z 2.61 where
                                                                                //   the ref's left flank band ends
                                                                                //   +1.28 (0.68-err col, 2 rows);
                                                                                //   r3 crest w 1.60 -> 1.26: the wide
                                                                                //   crest edge at y 1.895 owned the
                                                                                //   x ±1.29-1.57 front cols — the
                                                                                //   camber slabs carry that band)
  P.add('hull', frustum(1.42, 3.02, 2.92, 1.46, 2.55, 2.42, 1.30, 1.52));       // lower glacis to the shelf (r4e:
                                                                                //   top corners follow the seam)
  P.add('hull', box(1.30, 0.12, 0.24), 0, 1.30, 3.05);                          // nose shelf center -> 3.17 (r3b
  for (const sn of [-1, 1]) {                                                   //   TRUE ref bow plan: 3.17 center,
    P.add('hull', sn > 0 ? slab(                                                //   3.26 mid, 3.28 CORNERS — the r2
      [0.60, 1.24, 3.26], [0.75, 1.24, 3.26], [1.394, 1.24, 3.28], [0.60, 1.24, 2.90], // "corners 2.94" read was the
      [0.60, 1.36, 3.26], [0.75, 1.36, 3.26], [1.386, 1.36, 3.28], [0.60, 1.36, 2.90], // workorder plan-mirror bug)
    ) : slab(                                                                   // (r4: corner x 1.44 -> 1.394 — the
      [-0.75, 1.24, 3.26], [-0.60, 1.24, 3.26], [-0.60, 1.24, 2.90], [-1.394, 1.24, 3.28], // ref 3.28-corners live at
      [-0.75, 1.36, 3.26], [-0.60, 1.36, 3.26], [-0.60, 1.36, 2.90], [-1.386, 1.36, 3.28], // |x|<=1.40: its ±1.44 plan
    ), 0, 0, 0);                                                                //   col tops z 3.13, mine read 3.28
                                                                                //   — col ±1.364 keeps the corner)
  }
  // two-segment lower bow (ref line: shallow (2.97,0.41)->(3.24,0.70), then
  // the steep lip curl to the shelf)
  P.add('hull', frustum(1.29, 3.06, 2.94, 1.31, 3.245, 3.125, 0.42, 0.70));    // (r4: flanks 1.34/1.40 -> 1.29/
  P.add('hull', frustum(1.31, 3.245, 3.125, 1.36, 3.24, 3.14, 0.70, 1.24));    //   1.31/1.36 — the ref's lower bow
                                                                                //   NEVER reaches |x| 1.33 below
                                                                                //   y 0.876 (its ±1.35-1.46 flank
                                                                                //   floor; instrumented r4); the
                                                                                //   corner slabs carry the shelf
                                                                                //   width above 1.24)
                                                                                // (r3b: lip top pulled 3.295 ->
                                                                                //   3.24 — the ref plan CENTER is
                                                                                //   recessed 3.17; corners own 3.28)
  // r3 BOW BODY ANCHOR: the ref's z 3.27 side column is 0.39 thick (BODY
  // under the 12% filter) — mine read 0.19 there, pulling my body-span
  // front to 3.20 and the side registration to dAlong -0.074 (with the
  // stern handle knob; see below). This face plate makes the bow column
  // body-thick at the ref's own band (y 0.87..1.26) — registration snaps
  // toward 0 and every side mid re-pairs same-column.
  P.add('hull', box(2.60, 0.39, 0.078), 0, 1.065, 3.229);                       // (r3c: face to 3.268 — the plate
                                                                                //   fell 8 mm short of the 3.27 side
                                                                                //   column and reg drifted to -0.036)
  // driver hatch front-LEFT on the plateau + periscope row (§6.5)
  P.add('hull', box(0.62, 0.075, 0.62), -0.85, 1.5325, 2.56, -0.14, 0, 0);      // hatch plinth (r3: -0.03 — the ref
  P.add('hullDark', box(0.56, 0.02, 0.54), -0.85, 1.5675, 2.55, -0.14, 0, 0);   //   plateau reads 1.56-1.58 flat)
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', -1.05 + k * 0.24, 1.60, 2.28, (1 - k) * 0.12);
  // wire cutter blade leaned FLAT onto the glacis toe (identity cue; r3:
  // re-leaned -0.95 rad, tip <=1.45 — the r2 upright read +0.13..+0.15 on
  // the z 2.97-3.05 cols where the ref shelf is 1.36-1.37; residual ~+0.06
  // on 2 cols = inside the §C decoration allowance, packet-noted)
  P.add('hullDetail', box(0.045, 0.38, 0.045), -0.85, 1.28, 3.02, -0.95, 0, 0);
  P.add('hullDark', box(0.03, 0.20, 0.07), -0.85, 1.36, 2.96, -0.95, 0, 0);
  // trim-vane stub ridge on the plateau (r3: shortened out of the z>2.9
  // shelf cols; print 1.56 plateau runs to ~2.93 then drops to the shelf)
  P.add('hullDetail', box(2.30, 0.045, 0.30), 0, 1.475, 2.72, -0.12, 0, 0);
  // ---- stern: RAMP face (center recessed to -3.20 like the print) +
  // undercut wedge (print ramp bottom 0.58 @ -3.04) + corner bumperettes ----
  // undercut wedge: NARROWED to the inter-track span (§B4 — the r6 full-width
  // wedge ate 153 voxels of the raised sprocket wrap); outboard corner caps
  // ride ABOVE the wrap and close the stern corners.
  // r3 stern re-line to the ref's own measured profile (same-column once the
  // registration snaps to 0): undercut bottom 0.42@-2.90 -> 0.63@-3.13, aft
  // face rising to the 1.34 lip at -3.26 (the ref cliff), ramp face bottom
  // band 1.06..1.24 over -3.19..-3.26.
  P.add('hull', slab(                                                            // straight prism: flared flanks ate
    [-0.83, 0.42, -2.90], [0.83, 0.42, -2.90], [0.83, 0.63, -3.13], [-0.83, 0.63, -3.13], // the wrap (§B4 r7)
    [-0.83, 1.34, -2.94], [0.83, 1.34, -2.94], [0.83, 1.34, -3.26], [-0.83, 1.34, -3.26]));
  for (const s of [-1, 1]) {
    if (s > 0) P.add('hull', box(0.74, 0.20, 0.38), 1.17, 1.24, -3.10);         // stern corner caps (over the wrap)
    else P.add('hull', box(0.59, 0.20, 0.38), -1.115, 1.24, -3.10);             //   (r4 left: x to -1.41 — the -1.54
                                                                                //   face lit the -1.51 plan col and
                                                                                //   the r4-interim -1.48 still fed
                                                                                //   the -1.44 col z -3.2, where the
                                                                                //   ref's left flank ends -2.95;
                                                                                //   wrap band 1.315 stays covered)
  }
  P.add('hull', box(2.62, 0.72, 0.10), 0, 1.54, -3.21);                         // ramp upper face -> -3.26 (r3b:
                                                                                //   ±1.55 -> ±1.31 — its 1.90-top
                                                                                //   corners were the phantom 1.886
                                                                                //   band on EVERY ±1.35-1.57 front
                                                                                //   col; the ref ramp is ±1.31 with
                                                                                //   bumperettes owning the corners)
  P.add('hullDark', box(0.66, 0.75, 0.03), 0.42, 1.525, -3.272);                // integral door outline (r3: bottom
                                                                                //   1.15 — the 0.80 skirt hung below
                                                                                //   the ref's 1.24 ramp-lip band)
  P.add('hullDetail', cylY(0.045, 0.045, 0.10, 8), 0.70, 1.30, -3.24, Math.PI / 2, 0, 0); // door handle (r3: -3.278 ->
                                                                                //   -3.24 — the knob made the -3.33
                                                                                //   column BODY-thick (0.371 > the
                                                                                //   0.354 filter) and dragged the
                                                                                //   side registration -0.074)
  P.add('hullDetail', box(2.62, 0.06, 0.06), 0, 1.86, -3.235);                  // ramp hinge line (r3c: follows the
                                                                                //   ±1.31 ramp — its ±1.45 ends were
                                                                                //   the LAST 1.86-phantom band on the
                                                                                //   x ±1.33-1.46 front cols)
  P.add('hullDetail', box(2.6, 0.05, 0.05), 0, 0.70, -3.10);                    // lower hinge bar (r3: off the -3.19
                                                                                //   col — it undercut the ref's 1.06
                                                                                //   band by 0.44)
  // corner bumperettes (r3b: ASYMMETRIC per the ref plan — its left stern
  // corner ends -3.11, the right runs to -3.26; both off the -3.33 body
  // col. r3e: raised to y 1.04..1.22 — the 0.74-idler wrap top reaches
  // 1.05 and the old 0.93 bottoms clipped it 86 voxels (§B4); the ref's
  // own stern-corner band bottoms at 1.06 anyway.)
  P.add('hull', box(0.62, 0.18, 0.24), 1.13, 1.13, -3.14);                      // right -> -3.26
  P.add('hullDark', box(0.15, 0.08, 0.05), 1.24, 1.13, -3.25);
  P.add('hull', box(0.59, 0.18, 0.35), -1.115, 1.13, -3.075);                   // left -> -3.25 (r4: the fresh ref
                                                                                //   -1.364 plan col reads z -3.258 —
                                                                                //   the r3b "left ends -3.14" was
                                                                                //   the x>=1.42 zone; x pulled to
                                                                                //   -1.41 so the -1.44 col stays on
                                                                                //   the ref's own -2.95 flank end)
  P.add('hullDark', box(0.15, 0.08, 0.05), -1.24, 1.13, -3.13);
  // ---- A2 appliqué + skirts. The print is ASYMMETRIC (its right flank
  // runs full-length wide with tall gear; its left is narrower with a rear
  // bracket): right skirt to +1.635, left to +-1.545, LEFT REAR RACK BOX at
  // -1.64 carrying the >=0.35 z-band that keeps widthM on the 3.28 datum. --
  for (const s of [-1, 1]) {
    const xa = s < 0 ? 1.478 : 1.575;                                           // appliqué line per side (left
                                                                                //   r4: 1.475 -> 1.478 — the face at
                                                                                //   -1.4975 sat half a plan pixel
                                                                                //   inside the -1.51 col bound and
                                                                                //   read AA-partial; -1.5005 is a
                                                                                //   full pixel in, so the col reads
                                                                                //   the appliqué's own z-band
    // r3c: the RIGHT appliqué splits in two — its 3.19-wide end caps are the
    // only slice-paint it has (§C), and they must land in stations whose ref
    // width can carry them: rear plate caps in st1/st2 (ref 3.23/3.27), the
    // narrower front plate caps in st12 (ref 3.12).
    if (s > 0) {
      P.add('hull', box(0.045, 0.72, 0.70), 1.575, 1.43, -2.25);                // rear plate, z -2.60..-1.90
      P.add('hull', box(0.12, 0.72, 3.15), 1.5125, 1.43, -0.225);               // mid band 1.4525..1.5725 (r4:
                                                                                //   widened INBOARD — the ref keeps
                                                                                //   a 1.78-top band out from x 1.44:
                                                                                //   its 1.459/1.495 cols top 1.783
                                                                                //   where my thin plate left 1.60;
                                                                                //   caps/outer face unchanged,
                                                                                //   inner face 10 mm clear of the
                                                                                //   1.423 col bound), caps -1.80
                                                                                //   (st3, ref 3.13) / 1.35 (st9,
                                                                                //   ref 3.12) — st10 stays clear.
                                                                                //   (r3d: the r3c FRONT plate at
                                                                                //   z 2.38..2.76 broke the side rows
                                                                                //   — its 1.79 top rode the glacis
                                                                                //   line; st12 width now comes from
                                                                                //   the widened low mudguards)
    } else {
      P.add('hull', box(0.045, 0.50, 4.26), s * xa, 1.35, -0.84);               // left appliqué to 1.60 (ref's
                                                                                //   skirt-top band tops 1.60)
                                                                                //   (r4: front end 1.70 -> 1.29 —
                                                                                //   the ref's -1.51 plan col band
                                                                                //   is [-2.95..+1.28]: the 1.70 end
                                                                                //   overran it 0.42; cap moves
                                                                                //   st10 -> st9)
    }
    if (s > 0) P.add('hull', box(0.075, 0.48, 6.08), s * 1.608, 0.86, -0.07);   // narrow flank); right skirt on the
                                                                                //   print's full-length line (r3b:
                                                                                //   its plan runs -3.11..2.97)
    else P.add('hull', box(0.055, 0.92, 4.25), -1.465, 1.095, -0.825);          // LEFT: VERTICAL deep skirt plate
                                                                                //   x -1.445..-1.485, y 0.635..1.555,
                                                                                //   z -2.95..1.30 (r3d: the ref's
                                                                                //   front band hangs 0.63..1.60 at
                                                                                //   x 1.42..1.51 — the r2 TILTED
                                                                                //   slab projected only its top
                                                                                //   strip there and read +0.36
                                                                                //   bottoms; z-span is the ref's
                                                                                //   own -1.51 plan column band)
    P.add('hullDark', box(0.05, 0.46, 0.02), s * xa, 1.30, -0.24);              // slab joint seams (r4k: 0.65 ->
    P.add('hullDark', box(0.05, 0.46, 0.02), s * xa, 1.30, -1.55);              //   -0.24 — seam z-caps are st-width
                                                                                //   painters at ±1.60/±1.53: at 0.65
                                                                                //   they overfed st8 (3.12 vs ref
                                                                                //   3.067); at -0.24 they give st6
                                                                                //   its missing 3.12 read (ref
                                                                                //   3.126, flares alone 3.02). The
                                                                                //   -1.55 seam already feeds st3.
    for (const zc of (s > 0 ? [-2.4, -1.10, -0.70, 0.8, 2.1]
      : [-1.65, -1.10, -0.70, 0.8])) {                                          // (r4f left -2.4 -> -1.65: st3 read
                                                                                //   r4m2: -0.70 pair added — st5
                                                                                //   collapsed to 2.89-wide with NO
                                                                                //   vote (ref 3.046); the -0.70
                                                                                //   caps at -0.85/-0.55 sit fully
                                                                                //   inside st5 and vote 3.065;
                                                                                //   r4m: -0.9 -> -1.10 both sides —
                                                                                //   the -0.75 caps were st5's LAST
                                                                                //   3.10-width payer (ref 3.046);
                                                                                //   at -1.10 the caps vote in st4
                                                                                //   whose 3.126 band absorbs them;
                                                                                //   3.084 vs ref 3.126 — st3 had no
                                                                                //   left cap; st2's reader is the
                                                                                //   bag box either way)
      // r4: RIGHT brackets deepened to y 0.87..1.19 — the ref's 1.495/1.534
      // front cols bottom at 0.876 (its ODS hanger row) where my skirt line
      // starts 1.57 outboard; left row stays (the left skirt plate already
      // carries the 0.64 floor the ref reads there).
      if (s > 0) P.add('hullDetail', box(0.06, 0.32, 0.30), 1.505, 1.03, zc);   // skirt hanger brackets (left
                                                                                //   r4k right x 1.52 -> 1.505: the
                                                                                //   1.55 cap face fed st8 width
                                                                                //   3.08-3.11 vs ref 3.067; 1.535
                                                                                //   still lights the front 1.495/
                                                                                //   1.534 cols' 0.87 bottoms;
      else P.add('hullDetail', box(0.06, 0.10, 0.30), -1.50, 1.14, zc);
    }                                                                           //   1.9 dropped with the skirt
                                                                                //   shorten; left row inboard to
                                                                                //   bridge the vertical plate)
    // r4l: bolt rows on EXPLICIT width-safe slabs — cylX 6-seg walls PAINT
    // in slice renders (§C), so every bolt z is a station-width vote at
    // ±1.60/±1.51. The old 0.56-pitch row landed votes in st5 (-0.74: the
    // 2.16-wPct payer once the brackets were fixed), st7 (0.38) and the
    // st8/st9 boundary (0.94, half-lit). Safe slabs: st9/st6/st4/st3 (+st1
    // left), whose ref widths carry the 1.60-class read.
    if (P.q) for (const bz of (s > 0
      ? [1.00, 0.38, -0.10, -0.45, -1.00, -1.70]
      : [1.00, 0.38, -0.10, -0.45, -1.00, -1.70, -2.60])) {                      // (r4m: 0.38 restored — it WAS
                                                                                //   st7's 3.06-width reader, its
                                                                                //   removal cratered st7 to 6.2)
      P.add('hullDark', cylX(0.018, 0.03, 6), s * (xa + 0.008), 1.32, bz);      // flush bolt heads
    }
    // front/rear mudguards over the raised end wheels (r3: rear rubber
    // flaps DELETED — the ref stern corners carry none and their 0.81
    // bottoms undercut its 1.06-1.24 ramp-lip band on two columns).
    // r3e: the st12 width cap is a short OUTER TAB (x 1.53..1.575, z 2.46..
    // 2.94, bridged to the skirt) — the r3d full-width ±1.56 guard polluted
    // the plan x ±1.44-1.51 columns with its z 3.18 front (the ref's flank
    // there ends 2.97); the guard proper stays inside ±1.42.
    P.add('hull', box(0.34, 0.045, 0.72), s * 1.25, 1.05, 2.82);
    if (s > 0) P.add('hull', box(0.075, 0.045, 0.48), 1.5625, 1.05, 2.70);      // st12 cap tab (right; y 1.05:
                                                                                //   r4i: x 1.525..1.60 — BOTH jobs:
                                                                                //   st12's 1.60 width read AND the
                                                                                //   plan 1.52 col, whose z-max is
                                                                                //   the ref's own 3.28 bow-corner
                                                                                //   flank (the r4f 1.555 face left
                                                                                //   the col 0.46 short);
    else P.add('hull', box(0.09, 0.045, 0.48), -1.425, 1.05, 2.70);             // left tab inside the ref flank —
                                                                                //   (r4: outer face -1.50 -> -1.47
                                                                                //   — the ref's LEFT flank plan band
                                                                                //   ends z +1.28: the tab's z 2.94
                                                                                //   at x -1.50 owned the -1.51 col's
                                                                                //   0.98 err; -1.486 still AA-lit
                                                                                //   the col bound -1.494 at plan
                                                                                //   pixel pitch — 24 mm now, still
                                                                                //   laps the guard + caps st12)
                                                                                //   both clear the sprocket wrap
                                                                                //   top 0.975 (§B4)
                                                                                //   (x to -1.50, lapped onto the
                                                                                //   guard so it cannot float)
    P.add('hullRubber', box(0.30, 0.15, 0.04), s * 1.25, 0.955, 3.16);          // flap 0.88..1.03 (r4: the 0.71
                                                                                //   bottom under-ran the ref's
                                                                                //   0.876 flank floor at ±1.35-1.40)
    if (s > 0) P.add('hull', box(0.34, 0.045, 0.55), 1.25, 1.16, -2.95);        // clear of the 1.09 wrap apex (§B4)
    else P.add('hull', box(0.32, 0.045, 0.55), -1.245, 1.16, -2.95);            //   (r4i left: edge -1.42 -> -1.405
                                                                                //   — its 1 mm AA sliver fed the
                                                                                //   plan -1.44 col z -3.22 where
                                                                                //   the ref left flank ends -2.95)
  }
  // r3b: the r1/r2 "left rear bracket at x -1.62, z -2.0..-2.5" was a
  // PHANTOM — the ref's plan shows its x -1.59..-1.66 content ONLY at the
  // bow (z 2.0..2.5 = the bag box, whose own outer face carries the thin
  // 1.25..1.31 front bands the bracket was built for). The bracket ran a
  // full-length plan read where the ref has an island: DELETED.
  // (r3b note: a right rub-rail at x 1.70 would re-center the plan-X
  // registration toward the ref's +0.11 body mid, but widthM is a PLAN
  // pixel recipe with a 0.35 m z-band filter — any full-length rail at
  // 1.70 reads width 3.36 (+2.6%) and breaks dims. The residual plan
  // dAlong ~+0.05 is the certified cost of the 3.28 width datum.)
  // REAR-left fender bag box (r3b: the gate's own plan pairing puts the
  // ref's left bag island at its STERN, z -2.0..-2.5 — the r2 "front-left"
  // seat came from the workorder's plan-mirror bug and, once the phantom
  // bracket was deleted, the orientation guard flagged the whole plan row
  // (mirror 76.8 vs straight 0). Same front-view taper; the rear skirt
  // hanger bracket carries it; still the widthM left column at x -1.65.)
  P.add('hullCloth', slab(
    [-1.65, 1.24, -2.00], [-1.49, 1.13, -1.98], [-1.49, 1.13, -2.52], [-1.65, 1.24, -2.50],
    [-1.65, 1.33, -2.00], [-1.49, 1.55, -1.98], [-1.49, 1.55, -2.52], [-1.65, 1.33, -2.50]));
  // exhaust on the RIGHT hull side (engine front-right, §6.5)
  P.add('hullDark', box(0.03, 0.42, 0.95), 1.585, 1.42, 1.45);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.045, 0.055, 0.85), 1.59, 1.30 + k * 0.13, 1.45);
  // ---- fittings (§B3 census) ----------------------------------------------
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: true, seed: 2,
      pts: [[-1.05, 1.50, 2.42], [-0.1, 1.35, 2.83], [1.05, 1.48, 2.50]],
    });
    P.hullG.add(cable);
    for (const s of [-1, 1]) {
      const lamp = FITTINGS.lightCluster({
        mats: P.mats, pods: 2, spacing: 0.16, r: 0.05, rake: -0.25, seed: s + 3,
      });
      lamp.position.set(s * 1.22, 1.16, 3.135);
      P.hullG.add(lamp);
    }
    const links = FITTINGS.spareTrackLinks({
      mats: P.mats, links: 4, width: 0.48, seed: 9, rotation: [0, 0, 0],
    });
    links.position.set(0.72, 1.925, 0.80);                                      // laid on the right foredeck (r4:
    P.hullG.add(links);                                                         //   the glacis seat's ~1.96 top ran
                                                                                //   0.4 over the ref's 1.56 crest
                                                                                //   band on the side z 2.36-2.47
                                                                                //   cols; deck seat hides inside
                                                                                //   the engine-raise 1.98 envelope)
  }
  liftEye(P, 'hullDetail', -0.98, 1.91, 0.2);
  liftEye(P, 'hullDetail', 0.98, 1.91, 0.2);
  stowage(P, 'hullCloth', rng, [[-0.80, 1.945, -2.35, 0.40, 0.13, 1.05]]);      // rolled tarps by the cargo hump
  // ---- running gear: rear drive + front idler, BOTH raised (§B6/packet).
  // Band 0.85..1.38 (the print's treads reach +-1.385). ---------------------
  // r3 gear re-line (instrumented): trackW 0.33 -> 0.35 (rig band 0.96..1.31
  // = the ref's RIGHT tread edges exactly; its left band is 0.82..1.30 — the
  // spec 0.53 m track is wider than the r2 0.33 read, which left the ref's
  // ground columns at x 0.83-0.95 unserved); idler raised 0.68 -> 0.74 (ref
  // rear covered-line 0.43@-2.89); contact pinned 2.14/-2.16 (the ref's own
  // ramp starts — the default patch overhung to 2.03/-2.02 and read the
  // approach ramps 0.08-0.14 low).
  // r4 INSTRUMENT FIND (the ±1.35 order): the shoe PIN CAPS (cylX at
  // ±trackW*0.49, half-len 0.029) spanned xc±0.1956 = 0.954..1.346 — 26 mm
  // OUTSIDE the band BOTH sides. They ground-lit the ±1.35 cols (err 0.391,
  // the front binder: ref left tread STOPS at 1.30, flank bottoms 0.876)
  // AND the x 0.94 col (ref right-inner tread edge clean at 0.96; its 0.46
  // bottom is its own tub line — my tub ±0.95 serves it). pinCapOuter
  // 0.1625 clamps caps inside the band; band 0.98..1.315 (xc 1.1475,
  // trackW 0.335): outer edge 14 mm clear of the ±1.347 col bound 1.329
  // (§C 8 mm law), still grounds the ±1.312 cols the ref grounds.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.18, xc: 1.1475, dishR: 0.85,
    wheelZs: [1.88, 1.13, 0.38, -0.37, -1.12, -1.87],
    sprocket: { z: 2.55, y: 0.60, r: 0.24 }, idler: { z: -2.72, y: 0.74, r: 0.28 },
    rollers: [[1.5, 0.90], [0.0, 0.90], [-1.5, 0.90]].map(([z, y]) => ({ z, y, r: 0.08 })),
    trackW: 0.335, topY: 0.95, paintedEnds: true, pinCapOuter: 0.1625,
    contactZF: 2.14, contactZR: -2.16,
    // (r4 sprocket y 0.56 -> 0.60: instrumented — the ref's front climbing
    // band bottoms 0.23@2.55 / 0.29@2.69; my wrap read 0.17-0.22 there.
    // 0.60 puts the wrap arc at 0.265@2.55 / 0.296@2.69, and the 2.14-patch
    // tangent then tracks the ref's own 0.13@2.33..0.16@2.40 ramp line.)
  });
  // (r3e band 0.98..1.32: the ref's RIGHT tread does NOT ground the x 0.92-
  // 0.96 columns — the 0.96 inner edge lit them via AA; the outer 1.32
  // stays clear of the ±1.35 col starts)
  // static shoe rows for the print's ASYMMETRIC tread bands (r2-r4 + r3
  // instrument: right 0.96..1.46, left 0.82..1.30; track bucket so the §B4
  // audit measures them as track): right OUTER row carries the right's
  // extra width; left INNER row grounds the ref's x 0.83..0.95 columns.
  {
    // r4: pad rows TRIMMED to the contact patch (k 2..21, z -2.106..2.112 —
    // the r2 rows ran to ±2.55 and GROUNDED the approach/departure ramp
    // zones where the ref's tread reads a clear climbing band 0.13..0.45:
    // 4-5 side cols each end paid 0.10-0.16 bottoms, and §B6's trapezoid
    // read was flattened by grounded pads past the patch).
    const pads = [];
    for (let k = 2; k < 22; k++) pads.push([-2.55 + k * 0.222, 0]);
    for (const [pz] of pads) {
      P.add('hullTrack', box(0.15, 0.075, 0.16), 1.385, 0.092, pz);
      P.add('hullTrack', box(0.16, 0.075, 0.16), -0.90, 0.092, pz);
    }
    P.add('hullTrack', box(0.15, 0.05, 4.4), 1.385, 0.60, -0.25);               // return-run cover strip
  }
  // ---- turret cluster (ring plane 1.895 at the print's z -0.45 seat) ------
  // core box (print: bottom 1.89 over world -1.44..+0.36, roof 2.76-2.80)
  P.add('turret', cylY(0.60, 0.66, 0.09, 22), 0, 0.005, -0.10);                 // base ring collar
  // core: tall section ends world 0.17 (print roof 2.76 ends there); FRONT
  // STEP to world 0.60 at 2.44 (the print's mantlet-housing shoulder)
  // r2 front-row finding: the print's 2.76-2.80 side plateau is its RIGHT
  // stowage tower; the core roof is STEPPED — 2.72 right of center, 2.55
  // left (front_whole 96). Core tops out at 2.555 with a right roof riser.
  P.add('turret', frustum(0.80, 0.66, -1.00, 0.78, 0.61, -0.95, 0.02, 0.66));   // core, roof 2.555 (r4g: base 0.82
                                                                                //   -> 0.80 — the rectangular base
                                                                                //   corner crossed the plan 0.85 col
                                                                                //   with its full -1.45..0.21 world
                                                                                //   z-band where the ref cone's rear
                                                                                //   ends -0.61 at that x; tower fill
                                                                                //   B keeps the front read)
  // r4i riser SPLIT: the ref's fused print paints its 2.62-class core roof
  // into station slab 5 (everything faceted paints); my clean box's top face
  // slice-vanishes — the joint caps at world -0.75 give st5 a 2.72-top
  // painter (§C slice-paint law, the bmp2 r2 mechanism).
  P.add('turret', box(0.665, 0.17, 0.60), 0.3625, 0.74, -0.60);                 // riser rear, world z -1.35..-0.75
  P.add('turret', box(0.665, 0.17, 0.85), 0.3625, 0.74, 0.125);                 // right roof riser, top 2.72 (r3:
                                                                                //   east edge 0.71 — the ref dips
                                                                                //   2.47 at x 0.72 before the tower)
                                                                                // (r4: west edge -0.05 -> +0.03,
                                                                                //   east 0.695 — the ref's stepped
                                                                                //   roof reads 2.46-2.47 at x -0.06
                                                                                //   ..0.02 AND at 0.72: the step
                                                                                //   line sits right of center and
                                                                                //   the 0.71 edge AA-lit the 0.72
                                                                                //   col, +0.26/+0.14 x3 cols)
  P.add('turret', box(1.36, 0.525, 0.39), 0, 0.28, 0.855);                      // front step, top 2.44
  P.add('turretDark', box(0.10, 0.12, 0.06), 0.24, 0.42, 1.045);                // coax M240 slit (right of gun)
  P.add('turret', box(0.17, 0.16, 0.28), -0.115, 0.37, 1.19);                   // slim M242 rotor housing (r4j:
                                                                                //   x -0.33..-0.03 -> -0.20..-0.03 —
                                                                                //   its z-front 0.88 crossed the
                                                                                //   plan -0.26/-0.33 cols where the
                                                                                //   ref's fused rotor band is
                                                                                //   x -0.15..0 and its cheek face
                                                                                //   ends z +0.61)
  // A2 turret appliqué cheeks on the step face (thin, sub-column dressing)
  P.add('turret', box(0.36, 0.38, 0.045), -0.44, 0.26, 1.065);
  P.add('turret', box(0.32, 0.38, 0.045), 0.34, 0.26, 1.065);
  // ISU sight hood, low on the LEFT roof + window on the riser face
  P.add('turret', box(0.40, 0.045, 0.40), -0.32, 0.685, 0.14);
  P.add('turretDark', box(0.34, 0.09, 0.04), -0.32, 0.64, 0.355);
  P.add('turretGlass', box(0.28, 0.05, 0.02), -0.32, 0.645, 0.375);
  P.add('turretDark', box(0.30, 0.10, 0.04), 0.22, 0.77, 0.555);                // riser gunner window
  // commander hatch flush on the riser (right) + gunner hatch (left roof)
  P.add('turret', cylY(0.24, 0.24, 0.02, 16), 0.38, 0.833, 0.02);
  P.add('turretDark', box(0.30, 0.015, 0.30), 0.38, 0.852, 0.02);
  for (let k = 0; k < 3; k++) {
    P.add('turretDark', box(0.07, 0.04, 0.05), 0.24 + k * 0.14, 0.845, 0.24);   // periscope arc
    P.add('turretGlass', box(0.05, 0.022, 0.052), 0.24 + k * 0.14, 0.85, 0.245);
  }
  P.add('turret', cylY(0.22, 0.22, 0.02, 14), -0.40, 0.668, -0.30);
  P.add('turretDark', box(0.26, 0.015, 0.26), -0.40, 0.685, -0.30);
  // ---- bustle stowage rack: the print's tall rear cluster (2.90 rails,
  // duffel fill, twin whip antennas = the print's own 2.98 spikes) ---------
  {
    // r4 front-row law: the print's 2.89-2.98 side plateau is a LEFT MAST
    // CLUSTER (front x -0.77..-1.01 only) — the bustle itself stays under
    // the 2.72 center-band. Rack rails top 2.70.
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 1.42, d: 0.55, h: 0.30, rails: 2, fill: 0.40, seed: 11,
      rotation: [0, Math.PI, 0],                                                // open face aft (r3e w 1.42: the
    });                                                                         //   fill lumps poked the plan x0.85
                                                                                //   col 0.35 past the ref rack line)
    rack.position.set(-0.05, 0.36, -0.79);                                      // rails top ~2.56 world (ref front
                                                                                //   center band reads 2.46-2.55;
                                                                                //   r4: rear -1.56 -> -1.515 world —
                                                                                //   the rear face sat inside the
                                                                                //   turret-side 1.59 col where the
                                                                                //   ref's 2.45 band is 0.19 lower)
    P.turretG.add(rack);
    // rack tail shelf duffel (r3c: rear -1.845 — the ref's 2.43 rack band
    // ends at -1.855 and the side registration settled at -0.036: the r3
    // -1.87 tail lit one column past the mapped edge)
    // r4 NEGATIVE RESULT (banked): re-parenting this duffel to hullCloth
    // (matching a "ref bags are hull-frame" theory) CRATERED front_hull
    // 85->47 and side_hull 83->73 — the ref's own hull mask tops 1.95 at
    // center-x and 1.91 at z -1.4..-1.6: its bags ride the TURRET mask.
    // The turret_plan 0.04/-0.33 rear residual (~0.16) is the certified
    // price of serving the side_whole 2.43-band at world -1.8.
    stowage(P, 'turretCloth', rng, [[-0.05, 0.34, -1.185, 0.90, 0.26, 0.36]]); // rear -1.815: clear of the -1.86
                                                                                //   trace column (§C boundary law —
                                                                                //   r4i re-proved: extending to
                                                                                //   -1.85 lit the 1.88 side col 2.2
                                                                                //   where the ref reads its 1.93
                                                                                //   roofline; the r3c seat stands.
                                                                                //   r4g y 0.40 -> 0.34: lump bulge
                                                                                //   crested 2.64 into the side 1.59
                                                                                //   col — ref band there is 2.45)
    // LEFT mast cluster (r3 rebuild from the ref's own stepped profile:
    // 2.98 plateau world -1.10..-1.48, 2.87 step -0.94..-1.06, 2.78 east
    // step -0.64..-0.92, 2.86 west end block to -1.55): a three-step STAIR
    // of chunky mount boxes on the tower column (all overlap in y+z so the
    // cluster is one connected mass) + twin whips = the print's 2.98 spikes.
    P.add('turretDetail', box(0.20, 0.37, 0.13), -0.855, 0.90, -0.78);          // mount tower, top 2.98 (ref
    P.add('turretDetail', box(0.16, 0.05, 0.60), -0.88, 0.72, -0.78);           //   front plateau x -0.75..-1.12)
    P.add('turretDetail', box(0.25, 0.52, 0.40), -1.00, 0.825, -0.85);          // tall step: top 2.98, z -1.50..-1.10
                                                                                //   (r4: west face -1.10 -> -1.125 —
                                                                                //   the ref cluster spans to -1.12
                                                                                //   and its -1.13 col reads 2.89-top
                                                                                //   vs my bags' 2.53: half-col AA)
    P.add('turretDetail', box(0.20, 0.42, 0.20), -0.99, 0.77, -0.575);          // mid step: top 2.875, z -1.125..
                                                                                //   -0.925 (r3c: its cap sat ON the
                                                                                //   st4/st5 slab boundary -0.91 and
                                                                                //   painted 2.88 into slab 5)
    P.add('turretDetail', box(0.18, 0.34, 0.32), -0.90, 0.715, -0.33);          // east step: top 2.78, z -0.94..-0.62
    P.add('turretDetail', box(0.20, 0.30, 0.11), -0.99, 0.815, -1.075);         // west end block: top 2.86, to -1.58
    for (const [wx, wz] of [[-0.85, -1.00], [-0.97, -0.60]]) {
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.62, rake: 0.04, seed: wx < -0.9 ? 5 : 8 });
      whip.position.set(wx, 0.34, wz);                                          // tops ~2.97 (print spikes 2.98)
      P.turretG.add(whip);
    }
    // side stowage wings: TALL right tower (print front 2.76-2.80 over
    // x 0.77..1.35, plan front to world 0.19) + left wing shelf behind the
    // pod. r3: tower raised to the ref's 2.80 top + extended fwd; the rack
    // duffels dropped to <=2.56 (the ref's 2.55-2.56 center band — the r2
    // 2.65 tops owned 15 front cols); left wing rail shrunk to the ref's
    // bags-bracket plan island (world z -0.75..-0.45, top 2.175).
    // (r3d: the r2 right wing rail is fully deleted — the ref's plan x1.37
    // column is a tiny z 0.13..0.18 island whose real element must sit in a
    // y-band that would sweep through the hull roof under turret yaw (§B5);
    // the bin's own edge column carries the read instead)
    P.add('turret', box(0.525, 0.30, 1.24), 1.0625, 0.30, 0.02);                // right bin base x 0.80..1.325,
                                                                                //   z world -1.05..0.19 (r4g re-
                                                                                //   verify: the plan w-frame is
                                                                                //   -z_world-0.04 — the ref inboard
                                                                                //   tower DOES run to -1.12, the r4f
                                                                                //   front-half split was a frame
                                                                                //   misread; the core corner was
                                                                                //   the real 0.85-col excess)
    // r4 TOWER CORNER POST — the r3 "x 1.37 ref plan island (§B5-blocked)"
    // is NOT a sweep-blocked rail: it is the ref TOWER'S OWN front-right
    // corner (2.76-tall, z-footprint only 0.10..0.19 world — its "bin front
    // to world 0.19" r1 read). My bin's flat 1.36 east face lit the whole
    // -0.6..0.64 z-band into the 1.37 plan col (err 0.589). Re-cut: bin east
    // 1.325 (clear of the col bound 1.333), corner post carries the 1.35
    // front col's 2.76-2.80 tower read at the island's own z.
    P.add('turret', box(0.03, 0.755, 0.075), 1.34, 0.5275, 0.5875);             // post: x 1.325..1.355, world y
                                                                                //   2.045..2.80, world z 0.10..0.175
                                                                                //   (r4e: east 1.38 -> 1.355 — the
                                                                                //   1.38 face lit the front 1.38 col
                                                                                //   to 2.79 where the ref tops 1.75)
    stowage(P, 'turretCloth', rng, [
      [1.12, 0.72, -0.095, 0.36, 0.38, 1.02],                                   // tower fill A x 0.94..1.30, top
                                                                                //   2.805 (ref 2.80; r4f: front
                                                                                //   edge world -0.035 — the 0.015
                                                                                //   tip painted 2.8 into st7's top;
                                                                                //   r4: east 1.30 — stowage() DARK
                                                                                //   STRAPS bulge ~0.02 past nominal
                                                                                //   (probe-named: strap posts at
                                                                                //   x 1.34 owned the plan 1.37
                                                                                //   col's 0.467); the corner post
                                                                                //   carries the front 1.35 col)
      [-0.98, 0.46, -0.785, 0.30, 0.26, 0.55],                                  // left wing duffels (world z
                                                                                //   r4i: front cap -0.95 -> -0.96,
                                                                                //   into st4 where the mast's 2.98
                                                                                //   envelope hides it (it painted
                                                                                //   st5's top at 2.485);
                                                                                //   -1.50..-0.95 — the ref bags rear;
                                                                                //   r4: west edge -1.15 -> -1.13,
                                                                                //   off the -1.16 col the ref tops
                                                                                //   at 2.22)
      [-0.30, 0.53, -0.85, 0.55, 0.26, 0.40],                                   // duffels over the rack (<=2.56)
      [0.42, 0.51, -0.78, 0.45, 0.22, 0.38],
      // tower fill B (appended r4f — keep list order: stowage rng draws are
      // sequential per entry): the ref tower's INBOARD x 0.76..0.95 mass is
      // FRONT-HALF only (its plan 0.85 col rear ends world -0.61 while the
      // outboard tower runs to -1.05) — one fill there paid 0.19.
      [0.855, 0.72, 0.1275, 0.19, 0.38, 0.575],
    ]);
    // left bags DESCENDING STAIR (ref front: 2.53@x-1.11..-1.19 ->
    // 2.20-2.14@-1.19..-1.30 -> flank; plan island z -0.77..-0.47): two
    // chunky steps chained to the mast mid-step (x/y/z all overlap — the
    // stair is turret furniture and must never anchor on the gun-parented
    // TOW pod, which elevates away).
    P.add('turretCloth', box(0.065, 0.34, 0.375), -1.0925, 0.375, -0.4625);     // step1: top 2.44, x -1.06..-1.125
                                                                                //   (r4f: top 2.53 -> 2.44 + front
                                                                                //   cap -0.25 -> -0.275 — its st5
                                                                                //   z-cap painted the +2.46 topPct;
                                                                                //   ref st5 top is the 2.42 band)
                                                                                //   (r4: east of the mast line — the
                                                                                //   fresh ref front reads 2.18-2.22
                                                                                //   at x -1.16..-1.27: the r3 "2.53@
                                                                                //   -1.11..-1.19" read overhung)
    P.add('turretCloth', box(0.16, 0.245, 0.40), -1.225, 0.155, -0.20);         // step2: top 2.175, x -1.145..-1.305
                                                                                //   (r4: east edge -1.175 -> -1.145
                                                                                //   so the -1.16 col reads the 2.175
                                                                                //   step, not a half-lit boundary)
    // pintle M240 stowed on the bustle rail (§B3 MANDATORY MG — kept inside
    // the print's own 2.9-band so the heightM p95 budget is untouched)
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', scale: 0.85, tone: 'two-tone', elev: 0.03,
      ammo: true, rotation: [0, -0.45, 0], seed: 12,
    });
    mg.position.set(0.15, 0.52, -0.68);
    P.turretG.add(mg);
    // 2x4 smoke launchers on the turret front corners (§6.5)
    for (const s of [-1, 1]) {
      const bank = FITTINGS.smokeBank({
        mats: P.mats, count: 4, r: 0.038, len: 0.24, pitch: -0.28,
        splay: s * 1.05, spacing: 0.095, seed: 6 + s,                           // (r4 NEGATIVE: splay 0.70 made the
      });                                                                       //   plan 0.78 col WORSE 0.14->0.24 —
      bank.position.set(s * 0.52, 0.52, 0.86);                                  //   the flatter row projects MORE x;
      P.turretG.add(bank);                                                      //   1.05 restored, residual certified)
    }
  }
  // ---- TOW twin-pod on the turret LEFT — elevates with the gun (§6.5;
  // §B5 satisfied: recoilG rides under rig_turret). Print pod band tops
  // ~2.1-2.4 at x -0.86..-1.19 — pod seated LOW on the mount arm. ----------
  // r3: pod front re-cut as the ref's plan diagonal (its erect pod's front
  // corner slopes z 0.68@x -0.86 -> 0.21@x -1.23 seen from above — the r2
  // flat 0.44 face read ±0.25 on five plan-turret columns)
  P.addGunExtra(slab(                                                           // (pod x re-compensated -0.04 for
    [-1.155, -0.32, 0.06], [-0.785, -0.32, 0.53], [-0.785, -0.32, -0.93], [-1.155, -0.32, -0.93], // the gunPivot move:
    [-1.155, 0.16, 0.06], [-0.785, 0.16, 0.53], [-0.785, 0.16, -0.93], [-1.155, 0.16, -0.93],     // world seat identical)
  ), 0, 0, 0);                                                                  // armored pod box (1.93..2.41)
  P.addGunExtra(box(0.34, 0.05, 1.00), -0.96, 0.185, -0.43);                    // lid rib
  P.addGunExtraDark(cylZ(0.115, 0.06, 14), -0.97, 0.04, 0.22);                  // upper tube muzzle
  P.addGunExtraDark(cylZ(0.115, 0.06, 14), -0.97, -0.20, 0.22);                 // lower tube muzzle
  P.addGunExtra(box(0.32, 0.26, 0.34), -0.65, -0.04, 0.10);                     // elevation arm to the mount
  // ---- 25 mm M242: box mantlet/rotor + thin tube (muzzle 2.39) ------------
  P.addGunExtra(box(0.40, 0.34, 0.52), 0.02, -0.04, 0.28);                      // rotor/mantlet block
  P.addGunExtra(box(0.10, 0.12, 0.42), -0.055, -0.01, 0.62);                    // cradle/gun-bar (r3c: top 2.32 =
                                                                                //   r4h: x -0.04..0.08 -> -0.105..
                                                                                //   -0.005 — the 0.08 edge crossed
                                                                                //   the plan 0.04 col with the bar's
                                                                                //   z 0.98 where the ref's fused
                                                                                //   tube band stops at x 0 and its
                                                                                //   turret face ends z 0.61; now
                                                                                //   centred on the gun's own -0.075;
                                                                                //   the ref's own 2.31 bar — its old
                                                                                //   2.35 cap owned st9's top +0.105)
  // M242 tube SPLIT (bmp2 r2 law): buildGun's 12-seg tube rasterizes in the
  // plan/station slice renders where the print's smooth tube vanishes — the
  // breech stub ends short and a 28-seg extension carries the visible tube.
  // r3c: tube ends 2.22 rel (tip 2.375 world under the residual -0.036 side
  // registration — the 2.435 tip printed a 0.45-err column past the ref
  // muzzle) + a 12-seg thermal-sleeve joint at world 1.45..1.85: the ONLY
  // gun segment that paints in station slab 10 (ref slab-10 top IS its gun
  // bar 2.31; the 28-seg tube slice-vanishes, topPct was 9.5).
  buildGun(P, { len: 0.70, r: 0.038, baseR: 0.085 });
  P.addGunExtra(cylZ(0.038, 1.56, 28), 0, 0, 1.44);                             // tube rel 0.66..2.22
  P.addGunExtra(cylZ(0.045, 0.40, 12), 0, 0, 1.50);                             // sleeve joint, world 1.45..1.85
  P.muzzleZ = 2.24;                                                             // true muzzle anchor
  P.add('gunDark', cylZ(0.052, 0.13, 8), 0, 0, 2.16);                           // flash suppressor, tip 2.375 world
  // (r3d: the r1 coax barrel stub is deleted — the real M242 coax is
  // internal (only the port shows, kept on the step face above) and the
  // stub's 1.0-1.3 plan reach printed 0.26-0.5 err on the center columns)
  // callsign + exhaust soot (right side, engine front-right)
  P.decal('hull', 'number', 'C-21', 0.42, [1.576, 1.43, -0.5], Math.PI / 2);    // on the r3c mid appliqué band
  P.decal('hull', 'number', 'C-21', 0.42, [-1.505, 1.30, -0.5], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.6, [1.612, 1.50, 1.05], Math.PI / 2);         // (r4k z 1.45 -> 1.05: decals ARE
                                                                                //   mask geometry (§C) — the 1.612
                                                                                //   plane was st10's 3.05-vs-2.99
                                                                                //   width payer; at 1.05 it sits in
                                                                                //   st9 whose ref width carries it)
  P.topY = 1.05;
}

// ==================================== BMP-2 =================================
// AFV r2 RE-ANCHOR against the batch-39 WARPED m_bergman print (uniform z
// x1.0613 about the mask mid; docs/references/vertex/bmp2.json regenerated
// post-warp — every silhouette target below is a FRESH workorder/extract
// read, no r1 literals). The warped print now fills the published 6.72
// envelope (0% on every warped axis), so every feature sits at the print's
// own stretched line — the r1 mid-vs-ends tension is gone. §17.5 identity:
// low boat hull, sharp two-plane prow, conical two-man center turret, long
// thin 2A42 + roof Konkurs tube, twin bulged rear doors, firing ports 4L/3R,
// 3+3 smoke, FRONT drive sprocket + REAR idler both raised (§B6 trapezoid).
function buildBMP2(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, sph, lathe, xform, torus,
    buildGun, buildRunningGear, periscope, shovelTool, stowage } = KIT;
  const { rng } = P;
  // ---- hull core (warped lines): tub +-1.0, sponsons +-1.30, roof plate
  // top 1.629 out to z 1.68, stern deck step 1.593 over -3.25..-3.06 --------
  P.add('hull', box(2.08, 1.23, 4.58), 0, 1.025, -0.534);                        // center tub y 0.41..1.64, z -2.82..1.76
                                                                                //   (front capped UNDER the roof lip:
                                                                                //   an exposed tub top over the
                                                                                //   descending glacis cost 8 columns)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.33, 0.36, 4.89), s * 1.135, 1.45, -0.669);              // sponsons x 0.97..1.30, z -3.19..1.70
  }
  P.add('hull', box(2.60, 0.065, 4.78), 0, 1.5965, -0.634);                      // roof plate +-1.30, z -3.10..1.68
  P.add('hull', box(2.56, 0.05, 0.24), 0, 1.568, -3.084);                        // stern deck step, top 1.593
  // deck bands (r3c: halfW 0.19 — the ref FRONT deck reads 1.639 flat from
  // |x| 0.23 out; its raised lids live only at the center strip. Side-view
  // tops unchanged: side sees the max over x)
  P.add('hull', box(0.38, 0.058, 0.28), 0, 1.658, -2.034);                       // troop hatch band, top 1.687 (ref -2.24..-1.98)
  P.add('hull', box(0.38, 0.04, 0.43), 0, 1.648, -2.569);                       // rear lid band, top 1.668 (ref -2.86..-2.43)
  P.add('hull', box(0.38, 0.04, 0.17), 0, 1.648, -1.679);                       // hinge band, top 1.668 (ref -1.84..-1.67)
  // ---- stern (fresh warped read): belly ledge 0.36->0.49 out to -3.17,
  // cliff to 0.96 @ -3.22, upper step to -3.26, door band y 1.14..1.555 over
  // -3.26..-3.35; plan tail -3.336 only |x|<=0.72, corners pull to -3.24 ----
  // r3 stern-underside re-phase: the registration settled at +0.114 (gate
  // samples proc at ref_z+0.114), so the whole ledge->cliff->flap->doorband
  // bottom profile authors +0.114 forward of the ref's own lines. Targets
  // (proc frame): 0.35 flat to -2.96, 0.44@-3.03, cliff 0.50->0.97 over
  // -3.055..-3.125, flap band 0.96 @ -3.14..-3.19, door band 1.135@-3.22+.
  P.add('hull', slab(                                                            // boat-tail underside ledge —
    [-1.02, 0.35, -2.754], [1.02, 0.35, -2.754], [1.02, 0.375, -2.96], [-1.02, 0.375, -2.96], // BETWEEN the tracks (§B4)
    [-1.02, 0.66, -2.754], [1.02, 0.66, -2.754], [1.02, 0.66, -2.96], [-1.02, 0.66, -2.96]));
  P.add('hull', slab(                                                            // ledge B: rise to the cliff foot
    [-1.02, 0.375, -2.96], [1.02, 0.375, -2.96], [1.02, 0.47, -3.01], [-1.02, 0.47, -3.01],
    [-1.02, 0.66, -2.96], [1.02, 0.66, -2.96], [1.02, 0.66, -3.01], [-1.02, 0.66, -3.01]));
  P.add('hull', box(2.04, 0.54, 0.235), 0, 0.79, -2.9025);                      // stern body lower (inter-track)
  P.add('hull', box(2.60, 0.54, 0.33), 0, 1.325, -2.949);                       // stern body upper, y 1.055..1.595
  P.add('hull', slab(                                                            // upper step wedge: cliff bottom
    [-0.86, 0.50, -3.01], [0.86, 0.50, -3.01], [0.86, 0.97, -3.09], [-0.86, 0.97, -3.09], // rises 0.50 -> 0.97
    [-0.86, 1.59, -3.01], [0.86, 1.59, -3.01], [0.86, 1.59, -3.09], [-0.86, 1.59, -3.09]));
  P.add('hull', box(1.56, 0.44, 0.10), 0, 1.355, -3.23);                        // door recess frame: bottom 1.135
  for (const s of [-1, 1]) {                                                    //   rides the ref tail-band line
    P.add('hull', box(0.16, 0.58, 0.10), s * 0.92, 1.28, -3.114);               //   (+0.114-mapped)
  }
  // ---- two-plane BOAT PROW (warped lines): plane A rides the covered-run
  // line (1.63,0.066)->(3.06,1.036), knuckle plane B to the (3.36,1.222)
  // lip; glacis (1.83,1.533)->(2.84,1.319), nose plate to (3.13,1.276) ------
  P.add('hull', box(2.62, 0.05, 0.19), 0, 1.52, 1.851);                         // crest shoulder plate, top 1.545 (z 1.68..1.87)
  P.add('hull', frustum(1.06, 2.976, 2.896, 1.31, 1.976, 1.796, 1.295, 1.535));     // upper glacis plane
  P.add('hull', frustum(1.04, 3.20, 3.11, 1.06, 2.996, 2.876, 1.272, 1.317));     // glacis nose plate
  P.add('hull', frustum(0.98, 2.276, 2.136, 1.02, 3.176, 3.056, 0.40, 1.03));       // prow plane A (covered-run line;
                                                                                //   below it the 0.35-wide track's
                                                                                //   own approach ramp IS the print's
                                                                                //   covered-run bottom line)
  P.add('hull', frustum(1.02, 3.176, 3.056, 1.055, 3.365, 3.28, 1.03, 1.225));    // prow plane B (knuckle -> lip)
  // nose lip band (stowed trim vane): z 3.13..3.365, y 1.00..1.345 — the gate
  // body filter needs top-bot > 0.12*roughH = 0.297 at the tip columns (AA
  // shaves ~10 mm, so author 0.345) or hullLengthM reads the ref's own
  // body-cut 6.589 (dims is sovereign to the PUBLISHED 6.72; the ~2-column
  // +0.07 top / -0.16 bottom tip residual is the r1 trade re-derived).
  P.add('hull', slab(                                                           // (r3d: lip top SLOPES 1.42@3.13 ->
    [-1.065, 1.00, 3.365], [1.065, 1.00, 3.365], [1.065, 1.00, 3.13], [-1.065, 1.00, 3.13],  // 1.32@3.365 — the mapped
    [-1.065, 1.33, 3.365], [1.065, 1.33, 3.365], [1.065, 1.42, 3.13], [-1.065, 1.42, 3.13])); // ref knuckle falls 1.44->
                                                                                //   1.30 toward the tip; tip band
                                                                                //   0.33 holds the 0.297 dims body
                                                                                //   filter with AA margin)
  P.add('hullDetail', box(2.04, 0.055, 0.085), 0, 1.405, 3.061, -0.20, 0, 0);   // trim-vane roll (ref 1.446 @ 2.90..3.07)
  // bow corner wedges: the warped print's plan steps at x +-1.07 (nose beam
  // end) then runs a fender-tip diagonal to (+-1.56, 2.99); tops taper from
  // the glacis chamfer (1.40 @ rear-inner) under the side line to 1.28
  for (const s of [-1, 1]) {
    P.add('hull', s > 0 ? slab(
      [1.00, 1.12, 3.26], [1.13, 1.12, 3.26], [1.545, 1.10, 2.97], [1.00, 1.10, 2.97],
      [1.00, 1.28, 3.26], [1.13, 1.28, 3.26], [1.51, 1.24, 2.97], [1.00, 1.40, 2.97],
    ) : slab(
      [-1.13, 1.12, 3.26], [-1.00, 1.12, 3.26], [-1.00, 1.10, 2.97], [-1.545, 1.10, 2.97],
      [-1.13, 1.28, 3.26], [-1.00, 1.28, 3.26], [-1.00, 1.40, 2.97], [-1.51, 1.24, 2.97],
    ), 0, 0, 0);
  }
  // wave-breaker ribs on the glacis plane (ref sawtooth peaks +0.03)
  P.add('hullDetail', box(2.00, 0.026, 0.065), 0, 1.553, 2.026, -0.22, 0, 0);
  P.add('hullDetail', box(2.00, 0.026, 0.065), 0, 1.50, 2.19, -0.22, 0, 0);
  P.add('hullDetail', box(2.00, 0.026, 0.065), 0, 1.475, 2.356, -0.22, 0, 0);
  P.add('hullDetail', box(2.00, 0.026, 0.065), 0, 1.44, 2.50, -0.22, 0, 0);
  P.add('hullDetail', box(2.00, 0.026, 0.065), 0, 1.407, 2.656, -0.22, 0, 0);
  P.add('hullDetail', box(2.00, 0.026, 0.065), 0, 1.385, 2.78, -0.22, 0, 0);
  // ---- fenders: FRONT + REAR SECTIONS ONLY (warped bands: front plank
  // 1.86..3.02, rear -3.255..-2.115, tops 1.258, dust skirts down to 0.675;
  // short MID stubs at z -0.47..-0.01 carry the print's own st6 full-width
  // slab; outer rails +-1.575 hold the 3.15 width datum) --------------------
  for (const s of [-1, 1]) {
    P.add('hull', box(0.21, 0.055, 1.16), s * 1.42, 1.23, 2.44);                // front plank z 1.86..3.02
    P.add('hull', box(0.23, 0.055, 1.14), s * 1.43, 1.23, -2.685);              // rear plank z -3.255..-2.115
    P.add('hull', box(0.15, 0.08, 0.46), s * 1.4975, 0.9925, -0.24);             // mid fender stub (ref st6 band;
                                                                                //   r3b: dropped into the rail band
                                                                                //   y 0.95..1.03 — its 1.24 top owned
                                                                                //   the ±1.57 front cols once the
                                                                                //   st10 bump moved; st6 width keeps)
    P.add('hullRubber', box(0.15, 0.56, 0.60), s * 1.475, 0.955, 2.20);          // front dust skirt (0.675..1.235;
    P.add('hullRubber', box(0.15, 0.56, 1.40), s * 1.475, 0.955, -2.40);         //   ref front band spans x 1.40..1.56
                                                                                //   rear skirt fwd to -1.70: carries
                                                                                //   the rail chunks (floater bridge)
                                                                                //   and its side line caps the front
                                                                                //   skirt at z ~2.5)
    P.add('hull', box(0.025, 0.21, 0.44), s * 1.5625, 0.955, 2.64);
    P.add('hull', box(0.05, 0.06, 0.20), s * 1.5475, 0.955, 1.80);               // st10 width bump, dropped INTO the
                                                                                //   rail band (r3: at 1.225 it broke
                                                                                //   the front rows ±1.55-1.58 — ref
                                                                                //   band there is 0.84..1.06)
    // rear outer rail (0.85..1.06): r3 SEGMENTED ≤0.48 m (§C station end-cap
    // law: long thin boxes paint only their z-caps in slice renders — the
    // one-piece rail read x±1.55 in NO mid station). Chunks put caps inside
    // st1/st2/st3 so the ref's 3.09-3.15-wide rear-skirt band (the st3 wPct
    // 10.55 finding, instrumented) is finally measured on the proc side too.
    // Aft end pulled -3.25 -> -3.10 (the +0.114-mapped stern re-phase).
    for (const [zc, zl] of [[-2.885, 0.43], [-2.44, 0.44], [-2.055, 0.31], [-1.675, 0.44]]) {
      P.add('hull', box(0.03, 0.21, zl), s * 1.535, 0.955, zc);
    }                                                                           //   spans -3.10..-1.455; holds the
                                                                                //   ref's 3.10 band + st3 width
    for (const zc of [-3.15, -2.35, 2.05, 2.75]) {
      P.add('hullDark', box(0.215, 0.03, 0.03), s * 1.42, 1.198, zc);           // support ribs
    }
    // bow fender web: closes the top-down corner slit between plank, wedge
    // and glacis edge (SS-B2 - the r2 standard-check flood found 11 cells)
    P.add('hull', box(0.29, 0.03, 0.42), s * 1.185, 1.20, 2.79);
    // r3 fender-root chamfer: the ref's front trace falls 1.59@±1.32 ->
    // 1.42-1.47@±1.36-1.40 (deck-edge camber my flat 1.30-roof lacked, -0.11
    // to -0.15 on 2 cols/side). Confined to the st6 z-band so the matched
    // 2.75-wide stations st4/5/7/8 stay untouched.
    P.add('hull', s > 0 ? slab(
      [1.29, 1.30, -0.01], [1.365, 1.30, -0.01], [1.365, 1.30, -0.47], [1.29, 1.30, -0.47],
      [1.29, 1.52, -0.01], [1.365, 1.42, -0.01], [1.365, 1.42, -0.47], [1.29, 1.52, -0.47],
    ) : slab(
      [-1.365, 1.30, -0.01], [-1.29, 1.30, -0.01], [-1.29, 1.30, -0.47], [-1.365, 1.30, -0.47],
      [-1.365, 1.42, -0.01], [-1.29, 1.52, -0.01], [-1.29, 1.52, -0.47], [-1.365, 1.42, -0.47],
    ), 0, 0, 0);
    // tucked front flap; stern flap re-seated to -3.165 (its 0.96 bottom
    // carries the +0.114-mapped ref cliff-top line at proc -3.14..-3.19)
    P.add('hullRubber', box(0.21, 0.34, 0.05), s * 1.42, 1.03, 2.72);
    P.add('hullRubber', box(0.21, 0.28, 0.045), s * 1.44, 1.10, -3.165);
  }
  // ---- deck furniture (warped deck reads FLUSH: bumps <=1.64 forward of
  // the ring; driver furniture sinks to the ref's own 1.60-1.63 micro-band) -
  P.add('hull', cylY(0.24, 0.24, 0.022, 16), -0.62, 1.6265, 1.576);              // driver hatch, top 1.638
  P.add('hullDark', torus(0.24, 0.010, 18), -0.62, 1.639, 1.576);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', -0.84 + k * 0.21, 1.596, 1.536, (k - 1) * -0.10);
  P.add('hull', cylY(0.22, 0.22, 0.022, 14), -0.62, 1.6255, 0.736);              // infantry hatch behind driver
  P.add('hullDark', torus(0.22, 0.010, 16), -0.62, 1.638, 0.736);
  // engine deck RIGHT: louvred grille + SMALL intake mushrooms both sides
  // (fresh front read: caps r ~0.08 at x +-1.09..1.19 top 1.763 — the r1
  // r-0.19 cap smeared 4 side cols and 6 front cols) + exhaust louvre
  P.add('hullDark', box(0.90, 0.02, 1.10), 0.66, 1.632, 1.136);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.82, 0.024, 0.055), 0.66, 1.641, 1.556 - k * 0.21);
  // intake mushrooms (r3b instrument: the ref's tall 1.75 cap reads at
  // x +1.10..1.14 ONLY — engine right; the left deck is flat 1.62-1.66):
  // one tall RIGHT mushroom on the exact ref column, a flush LEFT pot.
  P.add('hull', cylY(0.05, 0.065, 0.06, 12), 1.125, 1.664, 0.696);
  P.add('hull', cylY(0.05, 0.05, 0.022, 12), 1.125, 1.725, 0.696);              // cap top 1.736 (ref col 1.754)
  P.add('hull', cylY(0.05, 0.065, 0.02, 12), -1.16, 1.639, 0.696);
  P.add('hull', cylY(0.05, 0.05, 0.012, 12), -1.16, 1.655, 0.696);
  P.add('hullDark', box(0.28, 0.02, 0.85), 1.13, 1.634, 1.326);                  // exhaust louvre
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.24, 0.024, 0.05), 1.13, 1.642, 1.576 - k * 0.25);
  // splash rib ahead of the ring + filler caps (flush band)
  P.add('hullDetail', box(2.0, 0.03, 0.06), 0, 1.618, 1.436);
  P.add('hullDetail', cylY(0.07, 0.07, 0.02, 10), -0.95, 1.6395, 0.236);
  // ---- troop compartment (lids flush INSIDE the 1.687 band) ---------------
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.14, 0.014, 0.24), s * 0.105, 1.683, -2.034);         // lid seams on the band (r3c: seams
    P.add('hullDetail', box(0.06, 0.03, 0.08), s * 0.15, 1.670, -2.034);         //   + hinges follow the 0.19 band)
  }
  // firing ports 4 LEFT / 3 RIGHT with vision blocks above (packet identity;
  // z re-anchored x1.0613 with the warp)
  const ports = (s, zs) => zs.forEach((zc) => {
    P.add('hullDark', xform(sph(0.055, 10), 0, 0, 0, 0, 0, 0, [0.6, 1, 1]), s * 1.305, 1.40, zc);
    P.add('hullDark', box(0.05, 0.045, 0.10), s * 1.306, 1.52, zc + 0.10);      // vision block
    P.add('hullGlass', box(0.052, 0.02, 0.08), s * 1.307, 1.525, zc + 0.10);
  });
  ports(-1, [-0.504, -1.144, -1.784, -2.414]);
  ports(1, [-0.824, -1.464, -2.104]);
  // ---- stern doors: twin outward-opening leaves IN the tail band (y
  // 1.135..1.555 over -3.26..-3.35, plan tail -3.336, bulge tips y 1.13..1.51
  // — the r1 doors ran a full-width diagonal to -3.40 and poisoned the
  // proc hull-span: every station slab re-phased off the ref's) -------------
  for (const s of [-1, 1]) {
    P.add('hull', box(0.70, 0.42, 0.05), s * 0.36, 1.345, -3.30, -0.02, 0, 0);  // door leaf y 1.135..1.555: the
                                                                                //   tail columns must stay >0.30 y-
                                                                                //   thick under ANY trace grouping
                                                                                //   (dims body filter) so the read
                                                                                //   holds the published 6.72
    P.add('hull', xform(sph(0.26, 14, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0, [1, 0.80, 0.13]),
      s * 0.36, 1.32, -3.325);                                                  // fuel-cell bulge, tip -3.368 (just
                                                                                //   proud of the leaf; ref's own tail
                                                                                //   pixels light -3.362 too)
    P.add('hullDark', box(0.04, 0.40, 0.055), s * 0.745, 1.34, -3.28, -0.073, 0, 0); // hinge posts (plan 0.73..0.81)
    P.add('hullDark', box(0.15, 0.07, 0.04), s * 0.93, 1.40, -3.247);           // taillights on the corner caps
  }
  P.add('hullDark', box(0.03, 0.40, 0.06), 0, 1.345, -3.295, -0.02, 0, 0);      // center door seam
  P.add('hullDark', xform(cylX(0.045, 0.05, 8), 0, 0, 0, 0, 0, Math.PI / 2), -0.30, 1.32, -3.295); // door firing port
  P.add('hullDetail', cylY(0.04, 0.04, 0.08, 8), 0.55, 1.20, -3.30, Math.PI / 2, 0, 0); // door handle
  // ---- fittings (§B3 census + §I workflow) ---------------------------------
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, seed: 3,
      pts: [[-0.95, 1.50, 2.096], [-0.15, 1.38, 2.646], [0.85, 1.46, 2.306]],
    });
    P.hullG.add(cable);
    const lampL = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, r: 0.04, rake: -0.22, seed: 2 });
    lampL.position.set(-1.05, 1.415, 2.516);
    P.hullG.add(lampL);
    const lampR = FITTINGS.lightCluster({ mats: P.mats, pods: 1, r: 0.042, rake: -0.22, seed: 5 });
    lampR.position.set(1.05, 1.415, 2.516);
    P.hullG.add(lampR);
    // NOTE r1: no whip antenna — the print carries none and a 0.6 m whip cost
    // 0.35-err columns in side_hull (curve masks see thin geometry even when
    // the dims 12%-band filter does not). Antenna BASE POT only, flattened
    // INTO the troop band (r2: the warped deck line is 1.657-1.687 here — a
    // proud pot printed +0.06 on two columns).
    P.add('hullDark', cylY(0.03, 0.04, 0.04, 10), 1.20, 1.665, -2.024);
    P.add('hullDark', cylY(0.018, 0.018, 0.022, 8), 1.20, 1.696, -2.024);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.30, pitch: 0.15, seed: 7 });
    links.position.set(1.38, 1.272, -2.60);                                     // laid FLAT on the rear plank
    P.hullG.add(links);
  }
  shovelTool(P, -1.42, 1.238, 2.42, 0.9);                                       // pioneer tools, sunk into the plank
  stowage(P, 'hullCloth', rng, [[-1.42, 1.278, -2.62, 0.20, 0.07, 0.66]]);      // low duffel, under the fender line
  // ---- running gear: FRONT sprocket + REAR idler, both raised (§B6).
  // r3: idler re-seated -2.554 -> -2.44 (+0.114 registration law — the r2
  // seat rode the ref's RAW wrap line and the gate read the wrap 0.08-0.16
  // deep over 5 stern-ramp columns). Post-shift wrap line vs the mapped ref
  // covered-run: +0.02..+0.05. Sprocket keeps the covered-run kiss; the
  // certified §B6 wrap-bulge residual stays 2-3 approach-ramp columns.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.16, xc: 1.205, dishR: 0.82,
    wheelZs: [1.506, 0.786, 0.066, -0.654, -1.374, -2.094],
    sprocket: { z: 2.256, y: 0.80, r: 0.26 }, idler: { z: -2.44, y: 0.60, r: 0.24 },
    rollers: [[1.086, 1.00], [-0.194, 1.00], [-1.414, 1.00]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.30, topY: 1.06, arms: true, paintedEnds: true,
    contactZF: 1.566, contactZR: -2.094,                                          // pin the patch at the ref's own
  });                                                                            // contact ends (default overhung
                                                                                 // wheelR*0.5 past the last wheel)
  // ---- conical two-man turret, ring plane 1.66 at hull z 0 (WARPED dome:
  // plan ellipse x-radius ~1.02 / z-radius ~1.05; front wall rises
  // (1.0,1.66)->(0.95,2.0) — the r1 revolution profile was 0.15-0.2 low at
  // the shoulders in front view, so the base wall is steepened and the
  // whole solid z-stretched with the print) ---------------------------------
  // r3 REGISTRATION RE-SEAT (+0.114 law): the gate samples proc at
  // ref_z+0.114, so every turret element authored at the ref's RAW line in
  // r2 read ~0.1 aft. Basket/riser/crest/stack shift +0.08..+0.10; the dome
  // z-radius shrinks 1.045 -> 0.97 (its smooth 30-seg plan overhung the
  // print's faceted dome at the diagonals AND its rear rim lit 2 cover
  // columns past the mapped ref rear falloff).
  P.add('turret', xform(cylY(0.90, 0.915, 0.05, 30), 0, 0, 0, 0, 0, 0, [1, 1, 0.85]), 0, -0.02, 0.02);
  P.add('turret', xform(lathe([
    [0.93, 0.0], [0.948, 0.06], [0.955, 0.16], [0.948, 0.25], [0.93, 0.35],
    [0.775, 0.385], [0.625, 0.425], [0.455, 0.45], [0.23, 0.485], [0.0, 0.50],
  ], 30), 0, 0, 0, 0, 0, 0, [1.02, 1, 1.031]), 0, 0, 0.01);                    // warped cone (z-scale 1.031: the
                                                                                //   r4 profile's 0.955 max radius
                                                                                //   needs it — rear extreme -0.9746
                                                                                //   back inside the r3 legal window
                                                                                //   [-0.975,-0.972] (slab-4's 1.86
                                                                                //   painter; st4 topPct hit 12.3
                                                                                //   when the re-cut left it -0.963);
                                                                                //   ONLY legal window — rear rim
                                                                                //   stays inside proc slab 4
                                                                                //   (<= -0.972, its 1.86-top painter)
                                                                                //   AND clear of the side -1.02
                                                                                //   cover column (>= -0.975))
                                                                                // r4 DOME RE-CUT (the ±1.04 order,
                                                                                //   instrumented): the r3 wall
                                                                                //   (1.0149 max at world 1.72) lit
                                                                                //   the ±1.01 front cols where the
                                                                                //   print's faceted dome is CLEAR
                                                                                //   until y 1.735, and read only
                                                                                //   1.898 at ±0.973 where the print
                                                                                //   wall rises 1.735..2.004. New
                                                                                //   barrel profile: max 0.9741 at
                                                                                //   world 1.82 (clears the ±1.01
                                                                                //   window by 18 mm), wall spans
                                                                                //   ~1.71..1.96 at ±0.973, and the
                                                                                //   z-extreme 0.9731 keeps the r3
                                                                                //   slab-4/side-col legal window.
  P.add('turret', xform(cylY(0.56, 0.56, 0.78, 20), 0, 0, 0, 0, 0, 0, [1, 1, 0.9964]), 0, -0.39, 0.113); // basket z -0.445..+0.671
                                                                                //   (r3d: both edges pulled INSIDE
                                                                                //   trace-column bounds — the AA-lit
                                                                                //   partial columns at ±0.72/-0.49
                                                                                //   read junk bottoms, §C boundary law)
                                                                                // r4 NEGATIVE (banked): two basket
                                                                                //   re-spans (0.79-scale front-trim;
                                                                                //   1.0536 symmetric) cratered
                                                                                //   turret_side 84.9 -> 69.9/79.2 —
                                                                                //   the two ~0.2 residual cols at
                                                                                //   ±0.6 are the certified price of
                                                                                //   the print's lumpy basket read;
                                                                                //   the r3d span is the measured
                                                                                //   optimum. DO NOT RE-SPAN.
  // rear roof riser (crown +0.08 re-seat: crest band lands at proc
  // -0.68..-0.51 = the ref's own 2.14 cols -0.79..-0.64 mapped +0.114)
  P.add('turret', box(1.36, 0.415, 0.30), 0, 0.2075, -0.65);
  P.add('turret', box(1.20, 0.075, 0.175), 0, 0.4535, -0.605);
  // mantlet boss (the ref's plan root blob x +-0.25 to z 1.13) + coax PKT
  // housing RIGHT (ref right-front plan lobe to z 1.17) + sight drum LEFT
  P.add('turret', box(0.50, 0.26, 0.30), 0, 0.22, 0.86);                        // (r3c: boss front 1.04 — the ref
  P.add('turretDark', box(0.10, 0.10, 0.10), 0.20, 0.255, 0.86);                //   plan front line at x<=0.25 is
  P.add('turretDark', cylZ(0.028, 0.34, 8), 0.20, 0.255, 0.87);                 //   0.97, not the r2 1.13 read)
                                                                                // coax PKT, tip 1.07
  P.add('turretDetail', cylZ(0.05, 0.14, 10), -0.28, 0.30, 0.90);               // gunner day sight, tip 0.97
  P.add('turretDark', cylZ(0.04, 0.02, 10), -0.28, 0.30, 0.975);
  // commander cupola RIGHT (r3: tiers dropped a further 0.075 — the ref
  // front saddle climbs 2.105@x0.2 / 2.14@0.24-0.31 / 2.17@0.34; the r2
  // 2.25-flat stack owned the x 0.16-0.30 front-saddle order) + TKN-3 head
  // at the ref's own 2.286 x 0.59..0.73
  P.add('turret', cylY(0.24, 0.285, 0.09, 18), 0.38, 0.40, -0.11);
  P.add('turret', cylY(0.245, 0.245, 0.04, 18), 0.38, 0.4625, -0.11);
  P.add('turret', cylY(0.25, 0.25, 0.024, 18), 0.38, 0.4945, -0.11);
  P.add('turret', box(0.06, 0.14, 0.06), 0.64, 0.475, 0.16);                    // TKN-3 mount stalk
  P.add('turret', box(0.13, 0.085, 0.16), 0.66, 0.585, 0.20);                   // TKN-3 binocular head, top 2.288
  P.add('turretGlass', box(0.10, 0.03, 0.02), 0.66, 0.598, 0.27);
  P.add('turret', cylY(0.235, 0.235, 0.036, 16), -0.42, 0.49, -0.17);           // gunner hatch lid, top 2.168 (r3:
  P.add('turretDark', torus(0.235, 0.011, 16), -0.42, 0.510, -0.17);            //   x -0.35 -> -0.42 — its 2.186 rim
                                                                                //   carries the ref's 2.17 front
                                                                                //   shelf out to x -0.65)
  P.add('turret', box(0.16, 0.10, 0.18), -0.33, 0.46, 0.26);                    // BPK sight hood, top 2.17
  P.add('turretGlass', box(0.12, 0.035, 0.02), -0.33, 0.48, 0.355);
  // right-front OU-3GA2 spotlight housing (ref plan lobe x 0.49..0.66 to
  // z 0.98, side band 2.03-2.09 over z 0.76..0.98) + left mirror lug (ref
  // front 2.029 @ x -0.79..-0.92, plan left lobe to z 0.77)
  P.add('turret', box(0.16, 0.13, 0.22), 0.58, 0.36, 0.78);                     // (r4: z 0.87 -> 0.78 — the lens at
  P.add('turretDark', cylZ(0.052, 0.02, 12), 0.58, 0.38, 0.895);                //   0.985 overran the fresh ref plan
                                                                                //   front 0.83 on the 0.49-0.65
                                                                                //   cols; the r2 "lobe to z 0.98"
                                                                                //   read was the mirror-bug class)
  for (const s of [-1, 1]) {                                                    // shoulder lugs BOTH sides (ref
    P.add('turret', box(0.23, 0.10, 0.30), s * 0.775, 0.32, 0.32);              // front band 2.0-2.03 x 0.66..0.89;
    P.add('turretDark', box(0.10, 0.06, 0.03), s * 0.775, 0.33, 0.475);         // plan lobes end rest-z ~0.50)
  }
  // dome shoulder handrails (ref side band 2.065-2.095 over z 0.81..1.03)
  P.add('turretDetail', box(0.03, 0.03, 0.22), 0.58, 0.38, 0.92);               // (r4: x 0.65 -> 0.58 — the rails'
  P.add('turretDetail', box(0.03, 0.03, 0.22), -0.58, 0.38, 0.92);              //   z 1.03 tips printed the plan
                                                                                //   ±0.64 cols 0.2 past the ref's
                                                                                //   0.80 front line; inboard they
                                                                                //   still paint the side 2.065-2.095
                                                                                //   band (side sees any x))
  // plan-widest handle stubs (the ref's x +-1.02..1.05 sliver at z 0.10..0.14)
  P.add('turretDetail', box(0.05, 0.03, 0.09), 0.99, 0.135, 0.12);              // (r4: the ref's ±1.01 front-col
  P.add('turretDetail', box(0.05, 0.03, 0.09), -0.99, 0.135, 0.12);             //   islands read y 1.775..1.808 at
                                                                                //   x <= 1.015 — the r2 stubs sat
                                                                                //   0.04 wider and 0.07 lower and
                                                                                //   lit the ±1.045 cols the print
                                                                                //   keeps clear)
  // KONKURS launcher (THE BMP-2 tell) — r3: whole stack +0.08 (the +0.114
  // sampling law; the r2 seat rode the ref's raw z lines). Tube top 2.39,
  // muzzle ring to 2.40; stack band now proc -0.48..+0.18, matching the
  // ref's 2.387 band -0.565..-0.07 sampled at +0.114.
  // r3b STATION-LAW CAP on the shift: +0.015 only (not the side-ideal
  // +0.08) — the tube's REAR CAP must stay inside proc station slab 5
  // (<= -0.483 world; the slab-5 top IS the 2.39 tube — pulling it out
  // cost topPct 9.3, the r2 packet's proc-fractional law). The muzzle
  // ring still lands on the side row's mapped 2.405 column.
  P.add('turretDetail', box(0.12, 0.14, 0.13), 0.05, 0.50, -0.385);             // pedestal
  P.add('turretDetail', box(0.10, 0.06, 0.09), 0.05, 0.60, -0.315);             // yoke
  P.add('turretDark', xform(cylZ(0.072, 0.66, 12), 0, 0, 0, -0.02, 0, 0), 0.05, 0.655, -0.175); // 9M113 tube
  P.add('turretDark', xform(cylZ(0.10, 0.05, 12), 0, 0, 0.33, -0.02, 0, 0), 0.06, 0.655, -0.175); // muzzle ring
  P.add('turretDetail', xform(cylZ(0.076, 0.04, 12), 0, 0, -0.32, -0.02, 0, 0), 0.05, 0.655, -0.175); // rear cap
  P.add('turretDetail', box(0.05, 0.09, 0.05), -0.24, 0.66, -0.125);            // IR sight stub (ref left-stack
                                                                                //   east flank 2.37 @ x -0.23)
  // 902V smoke: 3+3 on the front cheeks — fresh plan read: the print's
  // front bumps live at x +-0.33..0.49 reaching z ~1.0 (the r1 +-0.58 seat
  // was a column off outboard)
  for (const s of [-1, 1]) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.040, len: 0.22, pitch: -0.45,
      splay: s * 0.30, spacing: 0.105, seed: 3 + s,
    });
    bank.position.set(s * 0.41, 0.30, 0.72);                                    // (r3c splay 0.30: tube tips ended
                                                                                //   x 0.65 where the ref bumps stop
                                                                                //   at 0.49; r4: z 0.80 -> 0.72,
                                                                                //   len 0.26 -> 0.22 — the tips at
                                                                                //   z ~1.03-1.07 overran the ref's
                                                                                //   0.80-0.83 plan front line on
                                                                                //   the ±0.49-0.65 cols by 0.2)
    P.turretG.add(bank);
  }
  // roof PKT on the gunner ring (§B3 decoration law: tastefully-integrated
  // pintle MG even though the print carries none). r2: the MG now CARRIES
  // the print's own tall LEFT stack element (front x -0.55..-0.30 to 2.463,
  // side apex 2.476 at z -0.07..+0.01) — raised seat, apex 2.47 < ref 2.476,
  // aligned with the ref's own spike columns (heightM p95 law).
  {
    // r3: MG re-seated z +0.06 (apex on the +0.114-mapped spike band, proc
    // 0.08..0.155) and re-aimed AFT (stowed) — the r2 forward-right yaw ran
    // the barrel tip to proc z 0.19..0.31 / x -0.20 at 2.44-2.46, printing
    // +0.06..+0.25 on three side cols AND the front x -0.226 col (the
    // roof-stack saddle order's east face). Aft barrel hides inside the
    // 2.39 Konkurs band.
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', scale: 0.58, tone: 'two-tone', elev: 0.02,
      ammo: true, rotation: [0, Math.PI, 0], seed: 6,
    });
    mg.position.set(-0.42, 0.68, 0.06);                                         // apex 2.47 on the mapped spike
    P.turretG.add(mg);                                                          // columns; the sight housing below
    // gunner day-sight housing: carries the ref's tall LEFT stack west flank
    // (front 2.42-2.44 over x -0.56..-0.32; top dropped 2.4575 -> 2.4425 to
    // the ref's own 2.443 shoulder, z re-seated +0.08)
    P.add('turret', box(0.29, 0.155, 0.30), -0.415, 0.705, -0.02);              // (r3c: east edge -0.27 — the ref's
  }                                                                             //   2.44 band runs to x -0.26)
  // ---- 2A42: long thin tube to the WARPED muzzle 3.245 (ref tube band
  // 1.877..2.005 out to z 3.26; root collar to z 1.93 matches the ref's own
  // st10 slice paint; rails give the plan halfW ~0.115 fused-gun read) ------
  P.addGunExtra(box(0.18, 0.20, 0.35), 0, -0.02, 0.18);                         // cradle
  P.addGunExtra(box(0.23, 0.15, 0.47), 0, 0, 0.60);                            // root collar, z 0.95..1.42, top 2.02
                                                                                //   — ends INSIDE station slab 9: the
                                                                                //   gate's slice renders show the ref
                                                                                //   tube paints NOTHING in slabs
                                                                                //   10-12 (the vertex-JSON station
                                                                                //   table is a different instrument)
  P.addGunExtra(cylZ(0.016, 2.13, 28), 0.098, 0.0, 1.565);                      // plan rails, z 1.05..3.18 (28-seg
  P.addGunExtra(cylZ(0.016, 2.13, 28), -0.098, 0.0, 1.565);                     //   walls vanish from slice renders)
  // 2A42 tube SPLIT: buildGun carries the breech/root stub (its 12-seg tube
  // slice-paints, so it ends inside slab 9); the visible tube is our own
  // 28-seg smooth extension that vanishes from slabs 10-12 like the ref's.
  buildGun(P, { len: 0.84, r: 0.036, baseR: 0.088 });
  P.addGunExtra(cylZ(0.055, 1.91, 28), 0, 0, 1.745);                            // tube z 1.37..3.28 world (fat like
                                                                                //   the print's fused read: its side
                                                                                //   band is 1.875..2.0)
  P.muzzleZ = 2.785;                                                            // restore the true muzzle anchor
  P.add('gunDark', cylZ(0.060, 0.15, 10, 0.050), 0, 0, 2.705);                  // conical flash hider, tip 3.36
                                                                                //   (r3: the ref gun reads to 3.26
                                                                                //   and the gate samples +0.114 —
                                                                                //   the r2 3.275 tip left the gun
                                                                                //   band a full column short; the
                                                                                //   3.365 lip still owns overallLen)
  P.decal('turret', 'number', '245', 0.24, [0.965, 0.20, 0.05], Math.PI / 2, 0, 0.20);
  P.decal('turret', 'number', '245', 0.24, [-0.965, 0.20, 0.05], -Math.PI / 2, 0, -0.20);
  P.decal('hull', 'soot', null, 0.5, [1.32, 1.45, 0.9], Math.PI / 2);           // exhaust stain, right side
  P.topY = 0.85;
}

// ================================== C1 Ariete ===============================
// §26.5: 90s NATO wedge between Leo 2A4 and CR2 — flat-faced angular turret
// with plan-angled cheeks, narrow vertical mantlet slot flanked by recesses,
// protruding gunner sight over the right cheek line, TURMS pano, 7 wheels.
function buildAriete(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, buildGun, buildRunningGear,
    headlight, liftEye, periscope, pintleMG, smokeCluster, towCable, fenders,
    torus } = KIT;

  // Low welded hull: the old build stacked a full-width upper box over the
  // suspension, making the C1 read as a tall Challenger-shaped rectangle.
  // Keep the 7.59 m envelope, but put the visual mass in the long glacis and
  // shallow rear deck as on the production vehicle.
  P.add('hull', box(2.46, 0.54, 7.18), 0, 0.69, -0.02);                        // lower tub
  P.add('hull', box(3.18, 0.28, 4.88), 0, 1.29, -1.20);                        // shallow rear sponson/deck
  fenders(P, 1.25, 1.82, 1.17, -3.66, 3.58, 0.03);
  P.add('hull', frustum(1.68, 3.70, 1.30, 1.48, 1.34, 1.24, 1.00, 1.46));      // long upper glacis
  P.add('hull', frustum(1.48, 3.18, 3.70, 1.68, 3.70, 3.70, 0.42, 1.00));      // raked lower bow

  // Driver station is a flush roof hatch with three small vision blocks,
  // not the oversized central wedge that previously dominated the bow.
  P.add('hull', box(0.68, 0.055, 0.72), 0.27, 1.445, 1.56, -0.10, 0, 0);
  P.add('hullDark', box(0.62, 0.015, 0.03), 0.27, 1.478, 1.56, -0.10, 0, 0);
  for (let k = -1; k <= 1; k++) periscope(P, 'hullDetail', 0.27 + k * 0.17, 1.49, 1.88, k * 0.08);

  // Rear powerpack face, grille and the characteristic left-side exhaust.
  P.add('hull', box(3.02, 0.44, 0.10), 0, 1.22, -3.68);
  P.add('hullDark', box(1.78, 0.30, 0.035), 0.12, 1.20, -3.74);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.68, 0.035, 0.04), 0.12, 1.10 + k * 0.075, -3.765);
  P.add('hullDark', box(0.25, 0.34, 0.48), -1.68, 1.02, -2.96);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.035, 0.29, 0.38), -1.815, 1.02, -3.10 + k * 0.14);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.14, 0.07, 0.035), s * 1.32, 1.36, -3.75);
    P.add('hullRubber', box(0.48, 0.30, 0.025), s * 1.48, 0.48, -3.72, 0.10, 0, 0);
    P.add('hullDetail', box(0.05, 0.21, 0.13), s * 1.08, 0.88, -3.75);
  }

  // Seven separate skirt panels per side preserve the low silhouette and
  // expose only the lower halves of the seven road wheels.
  const skirtZ = [2.82, 1.88, 0.94, 0, -0.94, -1.88, -2.82];
  for (const s of [-1, 1]) {
    skirtZ.forEach((z, k) => {
      const h = k === 0 ? 0.50 : 0.58;
      const y = k === 0 ? 0.85 : 0.82;
      P.add('hull', box(0.045, h, 0.89), s * 1.79, y, z);
      P.add('hullDark', box(0.052, h * 0.92, 0.018), s * 1.795, y, z - 0.45);
    });
    P.add('hullRubber', box(0.025, 0.075, 6.48), s * 1.795, 0.50, -0.04);
  }

  // Deck furniture kept deliberately low and sparse.
  for (const s of [-1, 1]) P.add('hullDetail', box(0.82, 0.035, 0.055), s * 0.38, 1.39, 2.46, -0.25, s * 0.42, 0);
  P.add('hullDark', box(2.35, 0.018, 1.02), 0, 1.438, -2.47);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.20, 0.025, 0.055), 0, 1.448, -2.87 + k * 0.20);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.075, 0.075, 0.025, 12), s * 1.22, 1.445, -0.36);
  headlight(P, -1.30, 1.03, 3.49, -0.34);
  headlight(P, 1.30, 1.03, 3.49, -0.34);
  liftEye(P, 'hullDetail', -1.28, 1.43, 0.54);
  liftEye(P, 'hullDetail', 1.28, 1.43, 0.54);
  towCable(P, [[-1.14, 1.27, 2.83], [0, 1.40, 2.30], [1.14, 1.27, 2.83]]);
  P.decal('hull', 'number', 'EI 118', 0.27, [-0.92, 0.78, 3.66], 0, -0.20);
  buildRunningGear(P, {
    // SEVEN road wheels (§26.5 identity check)
    style: 'rubber', wheelR: 0.34, wheelW: 0.20, wheelY: 0.44, xc: 1.50,
    wheelZs: skirtZ,
    sprocket: { z: -3.39, y: 0.46, r: 0.30 }, idler: { z: 3.37, y: 0.45, r: 0.29 },
    rollers: [2.08, 0.69, -0.69, -2.08].map((z) => ({ z, y: 0.83, r: 0.08 })),
    trackW: 0.58, topY: 0.84, paintedEnds: true, coveredTop: true, arms: true,
  });
  // ---- low welded turret with sharply converging cheeks ----
  const ATH = 0.64;
  P.add('turret', cylY(1.06, 1.10, 0.10, 24), 0, 0.05, -0.12);                 // turret-ring collar
  P.add('turret', frustum(1.18, 0.50, -1.62, 1.05, 0.30, -1.54, 0.02, ATH));  // long low body
  P.add('turret', slab(                                                          // right cheek
    [0.18, 0.02, 0.94], [1.27, 0.02, 0.43], [1.27, 0.02, 0.17], [0.18, 0.02, 0.69],
    [0.18, ATH, 0.59], [1.08, ATH, 0.10], [1.08, ATH, -0.10], [0.18, ATH, 0.39]));
  P.add('turret', slab(                                                          // left cheek
    [-1.27, 0.02, 0.43], [-0.18, 0.02, 0.94], [-0.18, 0.02, 0.69], [-1.27, 0.02, 0.17],
    [-1.08, ATH, 0.10], [-0.18, ATH, 0.59], [-0.18, ATH, 0.39], [-1.08, ATH, -0.10]));
  P.add('turret', box(2.18, 0.48, 0.68), 0, 0.29, -1.57);                      // armored bustle, not an open cage

  // Narrow mantlet and the recessed apertures on either side of it.
  P.add('turret', box(0.47, 0.55, 0.10), 0, 0.30, 0.72);
  P.add('turretDark', box(0.13, 0.34, 0.035), 0.31, 0.31, 0.78);
  P.add('turretDark', box(0.13, 0.34, 0.035), -0.31, 0.31, 0.78);

  // OG14 gunner sight at the right front and TURMS panoramic head behind it.
  P.add('turret', box(0.34, 0.20, 0.36), 0.68, ATH + 0.06, 0.22);
  P.add('turretDark', box(0.26, 0.105, 0.035), 0.68, ATH + 0.06, 0.415);
  P.add('turretGlass', box(0.19, 0.065, 0.018), 0.68, ATH + 0.06, 0.438);
  P.add('turretDetail', box(0.38, 0.035, 0.40), 0.68, ATH + 0.175, 0.22);
  P.add('turretDetail', cylY(0.075, 0.09, 0.17, 12), 0.38, ATH + 0.085, -0.58);
  P.add('turretDark', cylY(0.13, 0.13, 0.18, 14), 0.38, ATH + 0.25, -0.58);
  P.add('turretGlass', box(0.12, 0.06, 0.018), 0.38, ATH + 0.26, -0.44);

  // Commander and loader stations sit almost flush with the turret roof.
  P.add('turret', cylY(0.22, 0.22, 0.038, 14), 0.61, ATH + 0.02, -1.00);
  periscope(P, 'turretDetail', 0.61, ATH + 0.05, -0.74);
  P.add('turret', cylY(0.20, 0.20, 0.038, 14), -0.60, ATH + 0.02, -0.88);
  pintleMG(P, -0.60, ATH + 0.035, -1.02, false);
  smokeCluster(P, 1.12, 0.42, 0.02, 4, 1.12, 0.48);
  smokeCluster(P, -1.12, 0.42, 0.02, 4, -1.12, 0.48);

  // The production C1 has a shallow rear basket. The previous meter-tall,
  // full-width rack was the largest source of the floating-box silhouette.
  const rackTop = 0.42, rackBot = 0.16, rackZ = -2.02;
  P.add('turretDetail', box(2.26, 0.035, 0.035), 0, rackTop, rackZ);
  P.add('turretDetail', box(2.26, 0.035, 0.035), 0, rackBot, rackZ);
  for (let k = 0; k < 9; k++) P.add('turretDetail', box(0.025, rackTop - rackBot, 0.025), -1.06 + k * 0.265, 0.29, rackZ);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.035, 0.035, 0.42), s * 1.11, rackBot, -1.82);
  P.add('turretDark', box(2.16, 0.015, 0.36), 0, rackBot, -1.82);
  P.add('turretDetail', box(0.025, 0.48, 0.025), -0.94, ATH + 0.20, -1.42, 0, 0, -0.09);
  P.add('turretDetail', box(0.025, 0.48, 0.025), 0.94, ATH + 0.20, -1.42, 0, 0, 0.09);

  P.addGunExtra(box(0.32, 0.46, 0.24), 0, 0.01, 0.52);
  P.addGunExtra(cylZ(0.125, 0.27, 12, 0.155), 0, 0, 0.72);
  buildGun(P, { len: 5.35, r: 0.079, sleeve: true, evac: 0.5, collar: true, baseR: 0.16 }); // OTO 120/44
  P.decal('turret', 'number', '118', 0.27, [1.18, 0.29, -0.58], Math.PI / 2, 0, 0.04);
  P.decal('turret', 'number', '118', 0.27, [-1.18, 0.29, -0.58], -Math.PI / 2, 0, -0.04);
  P.decal('hull', 'soot', null, 0.58, [-1.80, 1.03, -2.95], -Math.PI / 2);
  P.topY = 1.08;
}

// ---------------------------------------------------------------------------
// Constructor table — merged into tankFactory BUILDERS at the extension hook
// ---------------------------------------------------------------------------
export const MODERN3_BUILDERS = {
  chieftain_mk10: buildChieftain,
  k2: buildK2,
  type10: buildType10,
  m2a2_bradley: buildBradley,
  bmp2: buildBMP2,
  ariete: buildAriete,
};
