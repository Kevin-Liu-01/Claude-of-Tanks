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
      // gun x -0.11: the print's fused M242 sits LEFT of the turret center
      // (plan-turret r4) — followed for mask parity.
      turretPivot: [0, 1.895, -0.45], gunPivot: [-0.115, 0.375, 0.60],
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
      // AFV r1 rebuild (oracle-measured envelope, docs/references/vertex/
      // bmp2.json): tub floor 0.41, sponson roof 1.63, fenders to +-1.575;
      // ring plane 1.66 at hull center z 0 (the print's autoPivot) — the old
      // +0.30 ring seat cost every turret column.
      hl: 3.36, hw: 1.575, inW: 1.0, floor: 0.41, trkTop: 1.14, roofY: 1.63,
      turretPivot: [0, 1.66, 0.0], gunPivot: [0, 0.285, 0.55],
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
      [s < 0 ? -1.05 : 1.02, 1.13, 2.55], [s < 0 ? -1.02 : 1.05, 1.13, 2.55],    // 1.09 sprocket wrap apex (§B4)
      [s < 0 ? -1.02 : 1.05, 1.13, -3.20], [s < 0 ? -1.05 : 1.02, 1.13, -3.20],
      [s < 0 ? -1.62 : 1.55, 1.62, 2.30], [s < 0 ? -1.55 : 1.62, 1.62, 2.30],
      [s < 0 ? -1.55 : 1.62, 1.62, -3.24], [s < 0 ? -1.62 : 1.55, 1.62, -3.24]));
  }
  P.add('hull', box(2.10, 0.32, 5.00), 0, 1.75, -0.70);                         // upper spine y 1.59..1.91
  P.add('hull', box(2.04, 0.06, 5.00), 0, 1.875, -0.70);                        // roof plate, top 1.905
  for (const s of [-1, 1]) {                                                    // cambered roof edges (print
    P.add('hull', slab(                                                          // 1.90 @ +-1.0 -> 1.63 @ +-1.58)
      [s < 0 ? -1.58 : 1.00, 1.60, 1.83], [s < 0 ? -1.00 : 1.58, 1.60, 1.83],
      [s < 0 ? -1.00 : 1.58, 1.60, -3.24], [s < 0 ? -1.58 : 1.00, 1.60, -3.24],
      [s < 0 ? -1.58 : 1.00, s < 0 ? 1.635 : 1.905, 1.83], [s < 0 ? -1.00 : 1.58, s < 0 ? 1.905 : 1.635, 1.83],
      [s < 0 ? -1.00 : 1.58, s < 0 ? 1.905 : 1.635, -3.24], [s < 0 ? -1.58 : 1.00, s < 0 ? 1.635 : 1.905, -3.24]));
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
  P.add('hull', frustum(1.50, 2.52, 2.42, 1.60, 1.83, 1.60, 1.52, 1.895));      // upper glacis (crest at z 1.83)
  P.add('hull', frustum(1.42, 3.02, 2.92, 1.50, 2.55, 2.42, 1.30, 1.52));       // lower glacis to the shelf
  P.add('hull', box(2.90, 0.12, 0.33), 0, 1.30, 3.135);                         // nose shelf/beam -> 3.30, top 1.36
  // two-segment lower bow (ref line: shallow (2.97,0.41)->(3.24,0.70), then
  // the steep lip curl to the shelf)
  P.add('hull', frustum(1.34, 3.06, 2.94, 1.40, 3.245, 3.125, 0.42, 0.70));
  P.add('hull', frustum(1.40, 3.245, 3.125, 1.44, 3.295, 3.195, 0.70, 1.24));
  // driver hatch front-LEFT on the plateau + periscope row (§6.5)
  P.add('hull', box(0.62, 0.075, 0.62), -0.85, 1.565, 2.56, -0.14, 0, 0);       // hatch plinth (print 1.60 @ 2.50)
  P.add('hullDark', box(0.56, 0.02, 0.54), -0.85, 1.60, 2.55, -0.14, 0, 0);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', -1.05 + k * 0.24, 1.60, 2.28, (1 - k) * 0.12);
  // wire cutter blade leaned low onto the glacis toe (identity cue; ~2 cols
  // x <=0.15 over the ref line — §C decoration allowance, packet-noted)
  P.add('hullDetail', box(0.045, 0.38, 0.045), -0.85, 1.44, 2.98, -0.50, 0, 0);
  P.add('hullDark', box(0.03, 0.20, 0.07), -0.85, 1.56, 2.90, -0.50, 0, 0);
  // trim-vane stub ridge on the plateau (print 1.57 @ 2.72..2.90)
  P.add('hullDetail', box(2.30, 0.045, 0.42), 0, 1.475, 2.78, -0.16, 0, 0);
  // ---- stern: RAMP face (center recessed to -3.20 like the print) +
  // undercut wedge (print ramp bottom 0.58 @ -3.04) + corner bumperettes ----
  // undercut wedge: NARROWED to the inter-track span (§B4 — the r6 full-width
  // wedge ate 153 voxels of the raised sprocket wrap); outboard corner caps
  // ride ABOVE the wrap and close the stern corners.
  P.add('hull', slab(                                                            // straight prism: flared flanks ate
    [-0.83, 0.55, -2.86], [0.83, 0.55, -2.86], [0.83, 0.55, -3.04], [-0.83, 0.55, -3.04], // the wrap (§B4 r7)
    [-0.83, 1.34, -2.94], [0.83, 1.34, -2.94], [0.83, 1.34, -3.31], [-0.83, 1.34, -3.31]));
  for (const s of [-1, 1]) {
    P.add('hull', box(0.74, 0.20, 0.38), s * 1.17, 1.24, -3.10);                // stern corner caps (over the wrap)
  }
  P.add('hull', box(3.10, 0.72, 0.10), 0, 1.54, -3.21);                         // ramp upper face -> -3.26
  P.add('hullDark', box(0.66, 1.10, 0.03), 0.42, 1.35, -3.272);                 // integral door outline
  P.add('hullDetail', cylY(0.045, 0.045, 0.10, 8), 0.70, 1.30, -3.278, Math.PI / 2, 0, 0); // door handle
  P.add('hullDetail', box(2.9, 0.06, 0.06), 0, 1.86, -3.235);                   // ramp hinge line
  P.add('hullDetail', box(2.6, 0.05, 0.05), 0, 0.62, -3.15);                    // lower hinge bar (clear of the wrap)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.62, 0.18, 0.24), s * 1.13, 1.02, -3.19);                // corner bumperettes -> -3.31
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.24, 1.02, -3.315);           // taillights on them
  }
  // ---- A2 appliqué + skirts. The print is ASYMMETRIC (its right flank
  // runs full-length wide with tall gear; its left is narrower with a rear
  // bracket): right skirt to +1.635, left to +-1.545, LEFT REAR RACK BOX at
  // -1.64 carrying the >=0.35 z-band that keeps widthM on the 3.28 datum. --
  for (const s of [-1, 1]) {
    const xa = s < 0 ? 1.545 : 1.575;                                           // appliqué line per side
    P.add('hull', box(0.045, s < 0 ? 0.50 : 0.72, 4.6), s * xa, s < 0 ? 1.30 : 1.43, -0.60); // upper slab
    P.add('hull', box(0.055, 0.48, 5.75), s * (s < 0 ? 1.5175 : 1.6075), 0.86, -0.175); // skirt z -3.05..2.70
    P.add('hullDark', box(0.05, 0.46, 0.02), s * xa, 1.30, 0.65);               // slab joint seams
    P.add('hullDark', box(0.05, 0.46, 0.02), s * xa, 1.30, -1.55);
    for (const zc of [-2.4, -0.9, 0.8, 1.9]) {
      P.add('hullDetail', box(0.06, 0.10, 0.30), s * 1.52, 1.14, zc);           // skirt hanger brackets
    }
    if (P.q) for (let k = 0; k < 8; k++) {
      P.add('hullDark', cylX(0.018, 0.03, 6), s * (xa + 0.008), 1.32, 1.5 - k * 0.56); // flush bolt heads
    }
    // front/rear mudguards over the raised end wheels
    P.add('hull', box(0.40, 0.045, 0.72), s * 1.28, 1.02, 2.82);
    P.add('hullRubber', box(0.36, 0.30, 0.04), s * 1.28, 0.86, 3.16);
    P.add('hull', box(0.40, 0.045, 0.55), s * 1.28, 1.16, -2.95);               // clear of the 1.09 wrap apex (§B4)
    P.add('hullRubber', box(0.36, 0.26, 0.04), s * 1.28, 0.94, -3.24);
  }
  // left rear stowage rack box (the print's own widest-left element)
  P.add('hull', box(0.05, 0.52, 0.42), -1.615, 1.04, -2.20);
  P.add('hullDark', box(0.06, 0.05, 0.44), -1.615, 1.10, -2.20);
  P.add('hullDark', box(0.06, 0.05, 0.44), -1.615, 0.86, -2.20);
  // exhaust on the RIGHT hull side (engine front-right, §6.5)
  P.add('hullDark', box(0.03, 0.42, 0.95), 1.625, 1.42, 1.45);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.045, 0.055, 0.85), 1.63, 1.30 + k * 0.13, 1.45);
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
      mats: P.mats, links: 4, width: 0.48, seed: 9, rotation: [-0.40, 0, 0],
    });
    links.position.set(0.72, 1.52, 2.35);                                       // laid on the glacis
    P.hullG.add(links);
  }
  liftEye(P, 'hullDetail', -0.98, 1.91, 0.2);
  liftEye(P, 'hullDetail', 0.98, 1.91, 0.2);
  stowage(P, 'hullCloth', rng, [[-0.80, 1.945, -2.35, 0.40, 0.13, 1.05]]);      // rolled tarps by the cargo hump
  // ---- running gear: rear drive + front idler, BOTH raised (§B6/packet).
  // Band 0.85..1.38 (the print's treads reach +-1.385). ---------------------
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.18, xc: 1.115, dishR: 0.85,
    wheelZs: [1.88, 1.13, 0.38, -0.37, -1.12, -1.87],
    sprocket: { z: -2.72, y: 0.68, r: 0.28 }, idler: { z: 2.55, y: 0.56, r: 0.24 },
    rollers: [[1.5, 0.90], [0.0, 0.90], [-1.5, 0.90]].map(([z, y]) => ({ z, y, r: 0.08 })),
    trackW: 0.53, topY: 0.95, paintedEnds: true,
  });
  // ---- turret cluster (ring plane 1.895 at the print's z -0.45 seat) ------
  // core box (print: bottom 1.89 over world -1.44..+0.36, roof 2.76-2.80)
  P.add('turret', cylY(0.60, 0.66, 0.09, 22), 0, 0.005, -0.10);                 // base ring collar
  // core: tall section ends world 0.17 (print roof 2.76 ends there); FRONT
  // STEP to world 0.60 at 2.44 (the print's mantlet-housing shoulder)
  // r2 front-row finding: the print's 2.76-2.80 side plateau is its RIGHT
  // stowage tower; the core roof is STEPPED — 2.72 right of center, 2.55
  // left (front_whole 96). Core tops out at 2.555 with a right roof riser.
  P.add('turret', frustum(0.82, 0.66, -1.00, 0.78, 0.61, -0.95, 0.02, 0.66));   // core, roof 2.555
  P.add('turret', box(0.76, 0.17, 1.45), 0.36, 0.74, -0.175);                   // right roof riser, top 2.72
  P.add('turret', box(1.36, 0.525, 0.39), 0, 0.28, 0.855);                      // front step, top 2.44
  P.add('turretDark', box(0.10, 0.12, 0.06), 0.24, 0.42, 1.045);                // coax M240 slit (right of gun)
  P.add('turret', box(0.30, 0.16, 0.28), -0.18, 0.37, 1.19);                    // slim M242 rotor housing
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
      mats: P.mats, w: 1.55, d: 0.55, h: 0.30, rails: 2, fill: 0.55, seed: 11,
      rotation: [0, Math.PI, 0],                                                // open face aft
    });
    rack.position.set(-0.05, 0.50, -0.835);                                     // rails top ~2.70 world
    P.turretG.add(rack);
    // rack tail shelf duffel (print 2.45/2.11 over world -1.78..-1.57)
    stowage(P, 'turretCloth', rng, [[-0.05, 0.40, -1.15, 0.90, 0.26, 0.30]]);
    // LEFT mast cluster: antenna mount tower + twin whips (the print's own
    // 2.98 spikes, front x -0.83..-0.97, side z -1.51..-0.99)
    P.add('turretDetail', box(0.11, 0.34, 0.13), -0.88, 0.88, -0.78);           // mount tower, top 2.945
    P.add('turretDetail', box(0.16, 0.05, 0.60), -0.88, 0.72, -0.78);           // mount arm along z
    // antenna base rail: carries the print's 2.96-2.98 plateau across
    // z -1.44..-0.92 so heightM p95 anchors at the published 2.98 (the r5
    // lowered bustle dropped p95 to 2.87)
    P.add('turretDetail', box(0.10, 0.045, 0.52), -0.88, 1.04, -0.73);
    for (const [wx, wz] of [[-0.85, -1.00], [-0.97, -0.60]]) {
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.62, rake: 0.04, seed: wx < -0.9 ? 5 : 8 });
      whip.position.set(wx, 0.34, wz);                                          // tops ~2.97 (print spikes 2.98)
      P.turretG.add(whip);
    }
    // side stowage wings: TALL right tower (print front 2.78-2.80 over
    // x 0.77..1.35, plan z -1.09..0.18) + left wing shelf behind the pod
    P.add('turretDetail', box(0.05, 0.30, 1.27), 1.28, 0.30, -0.45);            // right wing rail
    P.add('turret', box(0.46, 0.30, 1.10), 1.07, 0.30, -0.45);                  // right bin base
    stowage(P, 'turretCloth', rng, [
      [1.05, 0.66, -0.45, 0.46, 0.38, 1.00],                                    // right tower fill, top ~2.79
      [-1.05, 0.46, -0.85, 0.36, 0.26, 0.75],                                   // left wing duffels
      [-0.30, 0.62, -0.85, 0.55, 0.26, 0.40],                                   // duffels over the rack (<=2.72)
      [0.42, 0.60, -0.78, 0.45, 0.22, 0.38],
    ]);
    P.add('turretDetail', box(0.05, 0.26, 0.95), -1.26, 0.36, -0.75);           // left wing rail
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
        mats: P.mats, count: 4, r: 0.038, len: 0.24, pitch: -0.45,
        splay: s * 1.05, spacing: 0.095, seed: 6 + s,
      });
      bank.position.set(s * 0.52, 0.52, 0.86);
      P.turretG.add(bank);
    }
  }
  // ---- TOW twin-pod on the turret LEFT — elevates with the gun (§6.5;
  // §B5 satisfied: recoilG rides under rig_turret). Print pod band tops
  // ~2.1-2.4 at x -0.86..-1.19 — pod seated LOW on the mount arm. ----------
  P.addGunExtra(box(0.37, 0.48, 1.22), -0.93, -0.08, -0.32);                    // armored pod box (1.93..2.41)
  P.addGunExtra(box(0.41, 0.05, 1.26), -0.93, 0.185, -0.32);                    // lid rib
  P.addGunExtraDark(cylZ(0.115, 0.06, 14), -0.93, 0.04, 0.30);                  // upper tube muzzle
  P.addGunExtraDark(cylZ(0.115, 0.06, 14), -0.93, -0.20, 0.30);                 // lower tube muzzle
  P.addGunExtra(box(0.32, 0.26, 0.34), -0.61, -0.04, 0.10);                     // elevation arm to the mount
  // ---- 25 mm M242: box mantlet/rotor + thin tube (muzzle 2.39) ------------
  P.addGunExtra(box(0.40, 0.34, 0.52), 0.02, -0.04, 0.28);                      // rotor/mantlet block
  P.addGunExtra(box(0.16, 0.16, 0.42), 0.02, 0.0, 0.62);                        // cradle
  buildGun(P, { len: 2.30, r: 0.038, baseR: 0.085 });
  P.add('gunDark', cylZ(0.052, 0.13, 8), 0, 0, 2.22);                           // flash suppressor
  P.add('gunDark', cylZ(0.020, 0.30, 6), 0.09, 0.10, 0.85);                     // coax barrel stub
  // callsign + exhaust soot (right side, engine front-right)
  P.decal('hull', 'number', 'C-21', 0.42, [1.658, 1.43, -0.5], Math.PI / 2);
  P.decal('hull', 'number', 'C-21', 0.42, [-1.59, 1.30, -0.5], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.6, [1.655, 1.50, 1.45], Math.PI / 2);
  P.topY = 1.05;
}

// ==================================== BMP-2 =================================
// AFV r1 REBUILD against the m_bergman quarantine oracle (vertex report
// docs/references/vertex/bmp2.json — all silhouette targets below are that
// report's gate-world numbers; the print is length-stylized -5.8% so all MID
// features sit at the print's own z while both ENDS stretch to the published
// 6.72 envelope, dims sovereign). §17.5 identity: low boat hull, sharp
// two-plane prow, conical two-man center turret, long thin 2A42 + roof
// Konkurs tube, twin bulged rear doors, firing ports 4L/3R, 3+3 smoke,
// FRONT drive sprocket + REAR idler both raised (§B6 trapezoid).
function buildBMP2(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, sph, lathe, xform, torus,
    buildGun, buildRunningGear, periscope, shovelTool, stowage } = KIT;
  const { rng } = P;
  // ---- hull core: tub +-1.0, sponsons to +-1.37, roof plate +-1.35 --------
  P.add('hull', box(2.00, 1.23, 5.00), 0, 1.025, -0.45);                        // center tub y 0.41..1.64, z -2.95..2.05
  for (const s of [-1, 1]) {
    P.add('hull', box(0.33, 0.36, 4.90), s * 1.135, 1.45, -0.85);               // sponsons x 0.97..1.30, z -3.30..1.60
  }
  P.add('hull', box(2.60, 0.07, 4.92), 0, 1.596, -0.83);                        // roof plate +-1.30, z -3.29..1.63
  P.add('hull', box(1.90, 0.055, 1.05), 0, 1.657, -2.02);                       // raised troop band (ref edge tops 1.62)
  // rear deck wedge: top 1.62 @ -2.90 -> 1.33 @ -3.34; BOAT-TAIL bottom
  // rising 0.53 @ -2.90 -> 0.85 @ -3.28 (ref stern undercut)
  P.add('hull', slab(
    [-1.35, 0.62, -2.86], [1.35, 0.62, -2.86], [1.35, 0.92, -3.28], [-1.35, 0.92, -3.28],
    [-1.35, 1.62, -2.90], [1.35, 1.62, -2.90], [1.35, 1.33, -3.34], [-1.35, 1.33, -3.34]));
  // ---- two-plane BOAT PROW (oracle lines: glacis slope 0.226, prow 0.727 —
  // the r2 workorder pinned the ref's covered-run line (1.55,0.07)->(2.90,
  // 1.05); the prow face now rides it exactly from (2.18,0.42)) -------------
  P.add('hull', frustum(1.02, 3.34, 3.28, 1.35, 1.63, 1.40, 1.245, 1.632));     // upper glacis
  P.add('hull', frustum(1.00, 2.18, 2.04, 1.02, 3.34, 3.26, 0.42, 1.255));      // lower prow (leans out)
  // blunt nose beam (stowed trim vane + splash rail): keeps the converging
  // boat edge a >=0.30 m BODY band so dims hullLengthM reads the published
  // envelope (12%-band law), and reads as the real folded vane at the lip.
  P.add('hull', box(2.04, 0.26, 0.13), 0, 1.14, 3.30);
  P.add('hullDetail', box(2.04, 0.05, 0.16), 0, 1.285, 3.27, -0.22, 0, 0);      // vane top lip
  // nose corner caps: close the plan notch between glacis edge and fender tip
  // (kept UNDER the glacis plane so the side profile stays the oracle line)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, 0.26, 1.06), s * 1.10, 1.28, 2.58, 0, s * -0.28, 0);
  }
  // wave-breaker ribs + trim-vane roll ridge lying on the glacis plane
  P.add('hullDetail', box(2.04, 0.055, 0.40), 0, 1.375, 2.82, -0.22, 0, 0);     // vane roll (oracle 1.42 @ 2.9)
  P.add('hullDetail', box(1.90, 0.025, 0.07), 0, 1.435, 2.50, -0.22, 0, 0);
  P.add('hullDetail', box(2.20, 0.025, 0.07), 0, 1.50, 2.12, -0.22, 0, 0);
  // ---- fenders: FRONT + REAR SECTIONS ONLY (r4 stations: the print's
  // mid-hull slices measure 2.75 wide — its fender planks exist only over
  // z 1.75..2.85 and -2.0..-3.07; the mid span is bare track). The low
  // outer rails at +-1.575 ride the sections (width datum 3.15). ------------
  for (const s of [-1, 1]) {
    P.add('hull', box(0.21, 0.055, 1.32), s * 1.42, 1.24, 2.29);                // front plank z 1.63..2.95
    P.add('hull', box(0.21, 0.055, 1.30), s * 1.42, 1.24, -2.67);               // rear plank z -3.32..-2.02
    P.add('hullRubber', box(0.03, 0.42, 0.90), s * 1.54, 1.00, 2.28);           // front dust skirt
    P.add('hullRubber', box(0.03, 0.42, 0.92), s * 1.54, 1.00, -2.52);          // rear dust skirt
    P.add('hull', box(0.03, 0.21, 0.88), s * 1.56, 0.955, 2.28);                // outer rails (0.85..1.06)
    P.add('hull', box(0.03, 0.21, 0.95), s * 1.56, 0.955, -2.52);
    for (const zc of [-2.55, -2.15, 1.95, 2.6]) {
      P.add('hullDark', box(0.215, 0.03, 0.03), s * 1.42, 1.212, zc);           // support ribs
    }
    // bow mudguard curve piece + small tucked flap; stern flap (rubber)
    P.add('hull', box(0.21, 0.05, 0.30), s * 1.42, 1.21, 2.88, -0.45, 0, 0);
    P.add('hullRubber', box(0.21, 0.34, 0.05), s * 1.42, 1.03, 2.55);
    P.add('hullRubber', box(0.21, 0.30, 0.045), s * 1.42, 1.10, -3.33);
  }
  // ---- deck furniture ------------------------------------------------------
  // driver front-LEFT: hatch + 3 periscopes at the glacis crest, infantry
  // hatch behind (commander moved into the turret on the BMP-2)
  P.add('hull', cylY(0.24, 0.24, 0.035, 16), -0.62, 1.648, 1.42);
  P.add('hullDark', torus(0.24, 0.012, 18), -0.62, 1.662, 1.42);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', -0.84 + k * 0.21, 1.652, 1.72, (k - 1) * -0.10);
  P.add('hull', cylY(0.22, 0.22, 0.03, 14), -0.62, 1.646, 0.62);                // infantry hatch behind driver
  P.add('hullDark', torus(0.22, 0.011, 16), -0.62, 1.658, 0.62);
  // engine deck RIGHT: louvred grille + intake mushroom far right (the
  // oracle's 1.73-1.76 bump projects at x ~1.13 in front view) + exhaust
  // louvre on the right sponson edge
  P.add('hullDark', box(0.90, 0.025, 1.10), 0.66, 1.638, 1.00);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.82, 0.03, 0.055), 0.66, 1.648, 1.42 - k * 0.21);
  P.add('hull', cylY(0.14, 0.17, 0.09, 14), 1.13, 1.675, 0.58);                 // intake mushroom
  P.add('hull', cylY(0.19, 0.19, 0.026, 14), 1.13, 1.733, 0.58);
  P.add('hullDark', box(0.28, 0.02, 0.85), 1.13, 1.636, 1.18);                  // exhaust louvre
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.24, 0.026, 0.05), 1.13, 1.645, 1.43 - k * 0.25);
  // splash rib ahead of the ring + filler caps
  P.add('hullDetail', box(2.0, 0.032, 0.06), 0, 1.648, 1.28);
  P.add('hullDetail', cylY(0.07, 0.07, 0.025, 10), -0.95, 1.645, 0.15);
  // ---- troop compartment ---------------------------------------------------
  for (const s of [-1, 1]) {                                                    // roof hatches (two long lids)
    P.add('hull', box(0.80, 0.03, 0.92), s * 0.50, 1.70, -2.02);
    P.add('hullDark', box(0.84, 0.012, 0.96), s * 0.50, 1.692, -2.02);
    P.add('hullDetail', box(0.10, 0.045, 0.08), s * 0.86, 1.70, -2.02);         // hinge blocks
  }
  // firing ports 4 LEFT / 3 RIGHT with vision blocks above (packet identity)
  const ports = (s, zs) => zs.forEach((zc) => {
    P.add('hullDark', xform(sph(0.055, 10), 0, 0, 0, 0, 0, 0, [0.6, 1, 1]), s * 1.305, 1.40, zc);
    P.add('hullDark', box(0.05, 0.045, 0.10), s * 1.306, 1.52, zc + 0.10);      // vision block
    P.add('hullGlass', box(0.052, 0.02, 0.08), s * 1.307, 1.525, zc + 0.10);
  });
  ports(-1, [-0.55, -1.15, -1.75, -2.35]);
  ports(1, [-0.85, -1.45, -2.05]);
  // ---- stern: twin outward-opening doors with fuel-cell bulges, seated on
  // the boat-tail slope (face (-3.28,0.85)->(-3.34,1.33), lean rx -0.124) ----
  for (const s of [-1, 1]) {
    P.add('hull', box(0.80, 0.54, 0.05), s * 0.44, 1.09, -3.325, -0.124, 0, 0); // door leaf
    P.add('hull', xform(sph(0.26, 14, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0, [1, 1.35, 0.22]),
      s * 0.44, 1.09, -3.345);                                                  // vertical fuel-cell bulge
    P.add('hullDark', box(0.03, 0.52, 0.055), s * 0.855, 1.09, -3.325, -0.124, 0, 0); // hinge line (outer edges)
    P.add('hullDark', box(0.15, 0.07, 0.04), s * 1.15, 1.36, -3.325);           // taillights
  }
  P.add('hullDark', box(0.03, 0.52, 0.06), 0, 1.09, -3.33, -0.124, 0, 0);       // center door seam
  P.add('hullDark', xform(cylX(0.045, 0.05, 8), 0, 0, 0, 0, 0, Math.PI / 2), -0.30, 1.15, -3.36); // door firing port
  P.add('hullDetail', cylY(0.04, 0.04, 0.09, 8), 0.62, 1.00, -3.35, Math.PI / 2, 0, 0); // door handle
  // ---- fittings (§B3 census + §I workflow) ---------------------------------
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, seed: 3,
      pts: [[-0.95, 1.56, 1.90], [-0.15, 1.44, 2.42], [0.85, 1.52, 2.10]],
    });
    P.hullG.add(cable);
    const lampL = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, r: 0.04, rake: -0.22, seed: 2 });
    lampL.position.set(-1.05, 1.50, 2.30);
    P.hullG.add(lampL);
    const lampR = FITTINGS.lightCluster({ mats: P.mats, pods: 1, r: 0.042, rake: -0.22, seed: 5 });
    lampR.position.set(1.05, 1.50, 2.30);
    P.hullG.add(lampR);
    // NOTE r1: no whip antenna — the print carries none and a 0.6 m whip cost
    // 0.35-err columns in side_hull (curve masks see thin geometry even when
    // the dims 12%-band filter does not). Antenna BASE POT only (reads as the
    // stowed-whip mount, common on parked BMPs); kept small + forward where
    // the deck is still flat (r5: a 1.79-top pot on the descending rear deck
    // printed 0.13-err columns).
    P.add('hullDark', cylY(0.03, 0.04, 0.06, 10), 1.20, 1.66, -2.35);
    P.add('hullDark', cylY(0.018, 0.018, 0.035, 8), 1.20, 1.71, -2.35);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.30, pitch: 0.15, seed: 7 });
    links.position.set(1.42, 1.295, -2.45);
    P.hullG.add(links);
  }
  shovelTool(P, -1.42, 1.292, 2.32, 0.9);                                       // pioneer tools, left front plank
  stowage(P, 'hullCloth', rng, [[-1.42, 1.312, -2.5, 0.20, 0.09, 0.72]]);       // low duffel, under deck line
  // ---- running gear: FRONT sprocket + REAR idler, both raised (§B6) -------
  // r3: the sprocket rides HIGH (y 0.77 @ z 2.05, wrap bottom ~0.42) so the
  // approach ramp + wrap KISS the oracle's covered-run line (slope 0.727);
  // the wrap bulges only ~0.05-0.07 below it on 2-3 columns — the certified
  // §B6 residual shrank from ~0.3 m x 16 cols (r1) to that.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.16, xc: 1.205, dishR: 0.82,
    wheelZs: [1.35, 0.69, 0.03, -0.63, -1.29, -1.95],
    sprocket: { z: 2.05, y: 0.77, r: 0.26 }, idler: { z: -2.52, y: 0.50, r: 0.24 },
    rollers: [[0.95, 1.00], [-0.25, 1.00], [-1.40, 1.00]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.30, topY: 1.06, arms: true, paintedEnds: true,
  });
  // ---- conical two-man turret, ring plane 1.66 at hull center z 0 ---------
  // (turret-local: y rel 1.66, z rel 0; oracle dome r 0.99, crest 2.16)
  P.add('turret', cylY(0.90, 0.915, 0.05, 30), 0, -0.02, 0.02);                 // base contact ring
  P.add('turret', lathe([
    [0.98, 0.0], [0.99, 0.055], [0.955, 0.145], [0.885, 0.235], [0.775, 0.32],
    [0.625, 0.395], [0.44, 0.45], [0.23, 0.485], [0.0, 0.50],
  ], 30, 0.94), 0, 0, 0.02);                                                    // z-squeezed: ref front undercut @ 0.94
  P.add('turret', cylY(0.56, 0.56, 0.75, 20), 0, -0.375, 0.0);                  // turret basket (oracle band z +-0.56)
  // rear roof riser (the print's aft-biased crown: 2.08-2.15 over z -0.85..-0.55)
  P.add('turret', frustum(0.62, -0.52, -0.88, 0.45, -0.56, -0.80, 0.30, 0.47));
  // mantlet boss + coax PKT (right) + sight drum (left)
  P.add('turret', box(0.34, 0.26, 0.38), 0, 0.27, 0.87);
  P.add('turretDark', box(0.10, 0.10, 0.10), 0.315, 0.255, 0.84);
  P.add('turretDark', cylZ(0.026, 0.42, 8), 0.315, 0.255, 1.05);                // coax PKT
  P.add('turretDetail', cylZ(0.05, 0.14, 10), -0.28, 0.30, 0.86);               // gunner day sight
  P.add('turretDark', cylZ(0.04, 0.02, 10), -0.28, 0.30, 0.935);
  // commander cupola RIGHT + TKN-3 head; gunner hatch LEFT
  P.add('turret', cylY(0.24, 0.285, 0.09, 18), 0.36, 0.505, -0.10);
  P.add('turret', cylY(0.245, 0.245, 0.045, 18), 0.36, 0.5725, -0.10);
  P.add('turret', cylY(0.25, 0.25, 0.028, 18), 0.36, 0.617, -0.10);
  P.add('turret', box(0.13, 0.09, 0.16), 0.36, 0.675, -0.02);                   // TKN-3 binocular head
  P.add('turretGlass', box(0.10, 0.03, 0.02), 0.36, 0.685, 0.065);
  P.add('turret', cylY(0.235, 0.235, 0.04, 16), -0.35, 0.53, -0.16);            // gunner hatch lid
  P.add('turretDark', torus(0.235, 0.011, 16), -0.35, 0.552, -0.16);
  P.add('turret', box(0.16, 0.10, 0.18), -0.33, 0.50, 0.24);                    // BPK sight hood
  P.add('turretGlass', box(0.12, 0.035, 0.02), -0.33, 0.52, 0.335);
  P.add('turretDetail', cylZ(0.062, 0.11, 12), 0.42, 0.545, 0.16);              // OU-3GA2 IR spotlight
  P.add('turretDark', cylZ(0.052, 0.02, 12), 0.42, 0.545, 0.225);
  // KONKURS launcher on the roof (THE BMP-2 tell): pedestal + elevated tube.
  // r1 workorder: the first seat (z -0.86..+0.14) rode 2.31-2.38 over the
  // oracle's DESCENDING rear dome — the tube now lives exactly in the
  // oracle's own stack band (2.40 @ -0.55 .. 2.47 @ +0.10).
  P.add('turretDetail', box(0.12, 0.14, 0.13), 0.02, 0.52, -0.38);              // pedestal
  P.add('turretDetail', box(0.10, 0.06, 0.09), 0.02, 0.615, -0.32);             // yoke
  P.add('turretDark', xform(cylZ(0.072, 0.66, 12), 0, 0, 0, -0.13, 0, 0), 0.02, 0.695, -0.305); // 9M113 tube
  P.add('turretDark', xform(cylZ(0.082, 0.05, 12), 0, 0, 0.33, -0.13, 0, 0), 0.02, 0.695, -0.305); // muzzle ring
  P.add('turretDetail', xform(cylZ(0.076, 0.04, 12), 0, 0, -0.32, -0.13, 0, 0), 0.02, 0.695, -0.305); // rear cap
  // 902V smoke: 3+3 on the FRONT cheeks (§B3 via KIT.fittings; oracle's own
  // 2.05-2.10 front bumps)
  for (const s of [-1, 1]) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.040, len: 0.26, pitch: -0.45,
      splay: s * 0.95, spacing: 0.105, seed: 3 + s,
    });
    bank.position.set(s * 0.58, 0.30, 0.74);                                    // print front bumps 2.10 @ 0.78..0.92
    P.turretG.add(bank);
  }
  // roof PKT on the gunner ring (§B3 decoration law: tastefully-integrated
  // pintle MG even though the print carries none; top 2.42 < published 2.45,
  // inside the oracle's own stack band so the heightM p95 budget is untouched)
  {
    // r3: scale 0.62 + seat z -0.22 keeps the WHOLE gun (muzzle sweep incl.)
    // inside the oracle's own 2.40-2.47 stack band z -0.55..+0.12 — the r2
    // barrel swept to z +0.25 at 2.44 over the ref's LOW front dome.
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', scale: 0.62, tone: 'two-tone', elev: 0.02,
      ammo: true, rotation: [0, 0.35, 0], seed: 6,
    });
    mg.position.set(-0.34, 0.575, -0.22);
    P.turretG.add(mg);
  }
  // ---- 2A42: long thin tube, muzzle 3.07 (inside the 6.72 envelope) -------
  P.addGunExtra(box(0.18, 0.20, 0.35), 0, -0.02, 0.18);                         // cradle
  P.addGunExtra(cylZ(0.062, 0.62, 12), 0, 0, 0.63);                             // barrel root sleeve
  // plan-width rails: the print's fused gun reads halfW ~0.09 from above
  // (r4 plan-turret cover) — thin side rails match it without fattening the
  // side-view tube band
  P.addGunExtra(cylZ(0.014, 1.95, 6), 0.082, 0.0, 1.42);
  P.addGunExtra(cylZ(0.014, 1.95, 6), -0.082, 0.0, 1.42);
  buildGun(P, { len: 2.52, r: 0.036, baseR: 0.088 });
  P.add('gunDark', cylZ(0.052, 0.15, 10, 0.036), 0, 0, 2.44);                   // conical flash hider
  P.decal('turret', 'number', '245', 0.24, [0.945, 0.20, 0.05], Math.PI / 2, 0, 0.20);
  P.decal('turret', 'number', '245', 0.24, [-0.945, 0.20, 0.05], -Math.PI / 2, 0, -0.20);
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
