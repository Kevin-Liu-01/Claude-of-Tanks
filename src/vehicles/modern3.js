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
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 2.98 },
    armor: modernArmor({
      hl: 3.27, hw: 1.80, inW: 1.18, floor: 0.35, trkTop: 0.95, roofY: 2.32,
      turretPivot: [0.55, 2.32, 0.30], gunPivot: [0, 0.28, 0.45],
      barrelLenM: 2.7, barrelRadM: 0.033,
      // aluminum + spaced appliqué: everything overmatched by tank guns (§6.2)
      glacis: [40, 60, 60], lower: [40, 50, 50], side: [30, 30, 30],
      skirt: [25, 30, 60], rear: 25, roof: 20,
      tw: 0.55, tFrontZ: 0.55, tRearZ: -0.70, tH: 0.55,
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
    dims: { hullLengthM: 6.72, overallLengthM: 6.72, widthM: 3.15, heightM: 2.45 },
    armor: modernArmor({
      hl: 3.36, hw: 1.57, inW: 1.05, floor: 0.30, trkTop: 0.80, roofY: 1.58,
      turretPivot: [0, 1.62, 0.30], gunPivot: [0, 0.26, 0.55],
      barrelLenM: 2.45, barrelRadM: 0.030,
      glacis: [33, 35, 35], lower: [26, 28, 28], side: [17, 18, 18],
      skirt: null, rear: 16, roof: 6,
      tw: 0.74, tFrontZ: 0.70, tRearZ: -0.72, tH: 0.48,
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
      hl: 3.8, hw: 1.79, inW: 1.22, floor: 0.46, trkTop: 1.03, roofY: 1.64,
      turretPivot: [0, 1.64, -0.15], gunPivot: [0, 0.30, 0.7],
      barrelLenM: 5.35, barrelRadM: 0.079,
      // lightest first-rank NATO MBT — sniper, not brawler (§26.2)
      glacis: [45, 110, 140], lower: [400, 350, 500], side: [40, 70, 70],
      skirt: [15, 40, 120], rear: 35, roof: 35,
      tw: 1.28, tFrontZ: 0.72, tRearZ: -1.50, tH: 0.80,
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
  // ONE continuous shallow glacis: nose lip (0.66, 3.74) -> ring (1.70, 0.55)
  P.add('hull', frustum(1.55, 3.74, 0.50, 1.55, 0.58, 0.50, 0.66, 1.70));
  P.add('hull', frustum(1.42, 3.42, 3.62, 1.52, 3.74, 3.62, 0.32, 0.66));       // nose plate
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
  headlight(P, -1.30, 0.86, 3.34, -1.1);
  headlight(P, 1.30, 0.86, 3.34, -1.1);
  periscope(P, 'hullDetail', 0, 1.63, 0.85);                                    // reclined driver's periscope
  liftEye(P, 'hullDetail', -1.35, 1.72, 0.3);
  liftEye(P, 'hullDetail', 1.35, 1.72, 0.3);
  towCable(P, [[-1.35, 0.90, 3.0], [-0.4, 0.80, 3.42], [0.6, 0.85, 3.28]]);
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
    sprocket: { z: -3.18, y: 0.70, r: 0.33 }, idler: { z: 3.12, y: 0.50, r: 0.29 },
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
  const { box, cylX, cylY, cylZ, frustum, buildGun, buildRunningGear,
    liftEye, periscope, smokeCluster, towCable, stowage, jerryCan } = KIT;
  const { rng } = P;
  // hull: tall slab-sided box
  P.add('hull', box(2.30, 0.62, 6.35), 0, 0.66, 0);                             // lower hull
  P.add('hull', box(3.44, 1.34, 4.9), 0, 1.64, -0.6);                           // main slab body
  P.add('hull', frustum(1.72, 3.18, 0.95, 1.72, 1.02, 0.95, 1.02, 2.31));       // ONE-PIECE ~60° glacis
  P.add('hull', box(3.30, 0.20, 0.62), 0, 0.95, 2.95);                          // horizontal nose shelf
  P.add('hull', frustum(1.60, 2.90, 3.26, 1.68, 3.26, 3.26, 0.34, 1.00));       // lower nose
  // headlight boxes on the shelf with brush guards (§6.5)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.34, 0.16, 0.14), s * 1.28, 1.10, 3.10);
    P.add('hullGlass', box(0.26, 0.09, 0.02), s * 1.28, 1.10, 3.18);
    P.add('hullDark', box(0.02, 0.22, 0.20), s * 1.44, 1.12, 3.12);             // brush guard ribs
    P.add('hullDark', box(0.02, 0.22, 0.20), s * 1.12, 1.12, 3.12);
  }
  // folded wading trim vane lying on the glacis (§6.5)
  P.add('hullDetail', box(2.55, 0.045, 0.9), 0, 1.68, 1.96, -1.04, 0, 0);
  P.add('hullDark', box(2.45, 0.03, 0.05), 0, 1.90, 1.74, -1.04, 0, 0);
  // driver hatch front-left on the glacis top + periscopes
  P.add('hull', cylY(0.26, 0.26, 0.035, 16), -0.85, 2.35, 1.15);
  periscope(P, 'hullDetail', -0.85, 2.38, 1.5);
  periscope(P, 'hullDetail', -0.55, 2.38, 1.48);
  // flat roof furniture: troop hatch + cargo hatch outlines, vents
  P.add('hullDark', box(1.15, 0.015, 1.3), 0.15, 2.325, -2.0);                  // cargo hatch seam
  P.add('hull', box(1.05, 0.05, 1.2), 0.15, 2.345, -2.0);                       // hatch lid
  P.add('hullDetail', box(0.5, 0.08, 0.4), -0.95, 2.36, -1.4);                  // intake vent
  // rear: full-width vertical TROOP RAMP with door outline (§6.5)
  P.add('hull', box(3.30, 1.55, 0.12), 0, 1.52, -3.20);
  P.add('hullDark', box(0.70, 1.25, 0.02), 0.45, 1.42, -3.27);                  // integral door outline
  P.add('hullDetail', cylY(0.045, 0.045, 0.10, 8), 0.75, 1.35, -3.28, Math.PI / 2, 0, 0); // door handle
  for (const s of [-1, 1]) P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.35, 2.15, -3.28); // taillights
  P.add('hullDetail', box(3.0, 0.06, 0.06), 0, 2.30, -3.24);                    // ramp hinge line
  // A2 SIGNATURE: two long horizontal appliqué slabs with stand-off bolts
  for (const s of [-1, 1]) {
    P.add('hull', box(0.07, 0.52, 5.6), s * 1.815, 1.28, -0.25);                // lower slab
    P.add('hull', box(0.07, 0.50, 5.0), s * 1.815, 1.88, -0.45);                // upper slab
    if (P.q) for (let k = 0; k < 9; k++) {
      P.add('hullDark', cylX(0.02, 0.09, 6), s * 1.85, 1.28, 2.3 - k * 0.62);   // stand-off bolts
      P.add('hullDark', cylX(0.02, 0.09, 6), s * 1.85, 1.88, 2.0 - k * 0.56);
    }
    P.add('hullDark', box(0.076, 0.48, 0.02), s * 1.815, 1.28, 0.9);            // slab joint seams
    P.add('hullDark', box(0.076, 0.46, 0.02), s * 1.815, 1.88, 0.6);
  }
  // aft-side stowage racks + gear (§6.5)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.05, 0.30, 1.4), s * 1.86, 2.02, -2.2);
    stowage(P, 'hullCloth', rng, [[s * 1.80, 2.1, -2.2, 0.18, 0.3, 1.2]]);
  }
  jerryCan(P, 'hullCloth', -1.75, 1.65, -2.9, 0.15);
  towCable(P, [[-1.2, 1.5, 2.7], [0, 1.75, 2.15], [1.2, 1.5, 2.7]]);
  liftEye(P, 'hullDetail', -1.5, 2.36, 0.4);
  liftEye(P, 'hullDetail', 1.5, 2.36, 0.4);
  // whip antennas rear corners
  P.add('hullDetail', box(0.03, 0.7, 0.03), -1.5, 2.7, -3.0, 0, 0, -0.12);
  P.add('hullDetail', box(0.03, 0.7, 0.03), 1.5, 2.7, -3.0, 0, 0, 0.12);
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.17, xc: 1.42,
    wheelZs: [2.3, 1.42, 0.54, -0.34, -1.22, -2.1],
    // drive sprocket FRONT, high idler rear (§6.5)
    sprocket: { z: 2.78, y: 0.50, r: 0.28 }, idler: { z: -2.72, y: 0.46, r: 0.26 },
    rollers: [1.5, 0.1, -1.4].map((z) => ({ z, y: 0.82, r: 0.08 })),
    trackW: 0.53, topY: 0.82,
  });
  // ---- small welded turret, offset RIGHT of centerline via turretPivot ----
  const BTH = 0.55;
  P.add('turret', cylY(0.52, 0.58, 0.10, 20), 0, 0.05, 0);                      // base ring collar
  P.add('turret', frustum(0.56, 0.56, -0.68, 0.50, 0.44, -0.62, 0.06, BTH));    // flat-faced box
  P.add('turretDark', box(0.10, 0.10, 0.06), 0.28, 0.30, 0.56);                 // coax slit
  // integrated square sight hood on the roof front (§6.5)
  P.add('turret', box(0.36, 0.26, 0.42), -0.12, BTH + 0.10, 0.18);
  P.add('turretDark', box(0.28, 0.12, 0.04), -0.12, BTH + 0.12, 0.40);
  P.add('turretGlass', box(0.22, 0.08, 0.02), -0.12, BTH + 0.12, 0.425);
  P.add('turretDetail', box(0.40, 0.045, 0.46), -0.12, BTH + 0.245, 0.16);      // hood brow
  P.add('turret', cylY(0.22, 0.22, 0.04, 14), 0.16, BTH + 0.02, -0.30);         // commander hatch
  periscope(P, 'turretDetail', 0.34, BTH + 0.04, -0.05);
  // smoke dischargers: 2x4 on the turret front corners
  smokeCluster(P, 0.42, 0.32, 0.48, 4, 0.55, 0.5);
  smokeCluster(P, -0.42, 0.32, 0.48, 4, -0.55, 0.5);
  P.add('turretDetail', box(0.03, 0.5, 0.03), -0.35, BTH + 0.2, -0.55, 0, 0, -0.1); // antenna
  // ARMORED TWIN TOW BOX on the LEFT cheek — elevates with the gun (§6.5)
  P.addGunExtra(box(0.38, 0.46, 1.20), -0.70, 0.10, -0.10);
  P.addGunExtraDark(box(0.30, 0.38, 0.05), -0.70, 0.10, 0.52);                  // twin tube face
  P.addGunExtra(box(0.42, 0.06, 1.24), -0.70, 0.36, -0.10);                     // lid rib
  P.addGunExtra(box(0.10, 0.24, 0.5), -0.44, 0.08, -0.1);                       // hinge arm to the mount
  // 25 mm M242: long thin tube + muzzle brake + under-barrel sleeve
  P.addGunExtra(box(0.16, 0.24, 0.5), 0.02, -0.02, 0.35);                       // gun cradle
  buildGun(P, { len: 2.7, r: 0.033, brake: 'single', baseR: 0.10 });
  // big white callsign on the appliqué slabs (§6.5)
  P.decal('hull', 'number', 'C-21', 0.5, [1.86, 1.6, 0.4], Math.PI / 2);
  P.decal('hull', 'number', 'C-21', 0.5, [-1.86, 1.6, 0.4], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.6, [-1.86, 2.0, 1.4], -Math.PI / 2);          // exhaust stain, left front
  P.topY = 0.95;
}

// ==================================== BMP-2 =================================
// §17.5: long low two-plane boat prow with wave-breaker ribs, bulged rear
// doors, small round center turret with 30 mm + Konkurs tube, 6 small dished
// wheels, front sprocket, firing-port dimples.
function buildBMP2(P) {
  const { box, cylX, cylY, cylZ, frustum, sph, lathe, xform, buildGun,
    buildRunningGear, headlight, periscope, smokeCluster, towCable, fenders,
    shovelTool } = KIT;
  P.add('hull', box(1.95, 0.46, 6.45), 0, 0.53, 0);                             // low hull core
  P.add('hull', box(2.72, 0.62, 5.35), 0, 1.06, -0.45);                         // mid body
  // two-plane BOAT PROW (§17.5): lower plane rakes OUT to the tip, upper
  // glacis rakes back to the roof, wave-breaker ribs across it
  P.add('hull', frustum(1.18, 2.60, 2.60, 1.30, 3.32, 2.60, 0.36, 1.00));       // lower prow (leans out)
  P.add('hull', frustum(1.30, 3.32, 1.45, 1.36, 1.50, 1.45, 1.00, 1.56));       // upper glacis
  for (let k = 0; k < 3; k++) {                                                 // wave-breaker lines
    P.add('hullDetail', box(1.9 - k * 0.25, 0.035, 0.06), 0, 1.12 + k * 0.14, 2.86 - k * 0.42, -0.30, 0, 0);
  }
  P.add('hull', box(2.72, 0.10, 2.5), 0, 1.53, 0.2);                            // forward roof
  // rear troop compartment: slightly taller roofline (§17.5)
  P.add('hull', box(2.72, 0.24, 2.6), 0, 1.60, -2.05);
  // roof troop hatches (two long lids)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.78, 0.05, 0.95), s * 0.55, 1.745, -2.0);
    P.add('hullDark', box(0.82, 0.015, 0.99), s * 0.55, 1.735, -2.0);
  }
  // rear face: TWO BULGED DOORS, each flat door + fuel-cell dome swell
  P.add('hull', box(2.6, 1.05, 0.10), 0, 0.98, -3.30);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.72, 1.0, 0.05), s * 0.48, 1.0, -3.34);                  // door leaf
    P.add('hull', xform(sph(0.30, 14, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0, [1, 1, 0.55]),
      s * 0.48, 1.02, -3.36);                                                   // dome swell
    P.add('hullDark', box(0.76, 0.02, 0.06), s * 0.48, 1.52, -3.33);            // hinge line
    P.add('hullDark', box(0.15, 0.07, 0.04), s * 1.15, 1.62, -3.36);            // taillights
  }
  P.add('hullDark', box(0.02, 1.0, 0.07), 0, 1.0, -3.37);                       // center door seam
  // firing-port dimples: 3 per side + louvred engine intake right-front deck
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    P.add('hullDark', xform(cylX(0.055, 0.06, 8), 0, 0, 0), s * 1.37, 1.28, -1.2 - k * 0.62);
  }
  P.add('hullDark', box(0.9, 0.02, 0.75), 0.55, 1.585, 0.9);                    // engine deck grille
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.8, 0.028, 0.06), 0.55, 1.595, 1.16 - k * 0.18);
  headlight(P, -1.05, 1.22, 3.02, -0.4, 0.045);                                 // prow-cheek headlight pods
  headlight(P, 1.05, 1.22, 3.02, -0.4, 0.045);
  fenders(P, 0.98, 1.44, 0.90, -3.15, 2.9, 0.03);
  shovelTool(P, -1.2, 0.95, 0.6, 0.85);                                         // pioneer tools on fender
  towCable(P, [[-0.9, 1.1, 2.7], [0, 1.25, 2.2], [0.9, 1.1, 2.7]]);
  periscope(P, 'hullDetail', -0.7, 1.60, 1.35);                                 // driver station left
  P.add('hull', cylY(0.24, 0.24, 0.03, 14), -0.7, 1.575, 1.05);                 // driver hatch
  P.add('hullDetail', box(0.025, 0.6, 0.025), -1.2, 1.9, -2.9, 0, 0, -0.1);     // whip antenna
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.27, wheelW: 0.14, xc: 1.28,
    wheelZs: [2.15, 1.3, 0.45, -0.4, -1.25, -2.1],
    sprocket: { z: 2.72, y: 0.42, r: 0.25 }, idler: { z: -2.66, y: 0.40, r: 0.23 }, // FRONT sprocket
    rollers: [1.35, 0.05, -1.3].map((z) => ({ z, y: 0.73, r: 0.07 })),
    trackW: 0.36, topY: 0.73, arms: true,
  });
  // ---- small ROUND two-man turret dead center (§17.5) ----
  P.add('turret', lathe([
    [0.82, 0.0], [0.85, 0.06], [0.82, 0.18], [0.74, 0.32], [0.60, 0.44],
    [0.38, 0.52], [0.0, 0.55],
  ], 26, 1.02), 0, 0, 0);
  P.add('turretDark', box(0.09, 0.09, 0.05), 0.32, 0.26, 0.72);                 // coax slit
  P.add('turretDetail', cylZ(0.06, 0.16, 10), -0.30, 0.28, 0.72);               // sight drum left of gun
  // low conical commander cupola (right) + gunner hatch (left)
  P.add('turret', cylY(0.20, 0.26, 0.11, 16), 0.36, 0.48, -0.14);
  P.add('turret', cylY(0.24, 0.24, 0.03, 16), 0.36, 0.56, -0.14);
  periscope(P, 'turretDetail', 0.36, 0.59, 0.06);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.38, 0.50, -0.14);              // gunner hatch lid
  // KONKURS launcher tube on a pedestal between the hatches, elevated ~10°
  P.add('turretDetail', box(0.10, 0.14, 0.10), 0, 0.58, -0.02);
  P.add('turretDark', cylZ(0.075, 1.05, 10), 0, 0.70, 0.28, -0.17, 0, 0);
  P.add('turretDark', cylZ(0.085, 0.10, 10), 0, 0.77, 0.78, -0.17, 0, 0);       // tube end ring
  // 902V smoke: 3-tube banks on the turret rear sides
  smokeCluster(P, 0.58, 0.32, -0.45, 3, 2.35, 0.45);
  smokeCluster(P, -0.58, 0.32, -0.45, 3, -2.35, 0.45);
  // 30 mm 2A42: long thin barrel with flash hider (§17.5)
  P.addGunExtra(box(0.20, 0.22, 0.40), 0, 0, 0.30);                             // cradle
  buildGun(P, { len: 2.45, r: 0.030, baseR: 0.085 });
  P.add('gunDark', cylZ(0.045, 0.14, 8, 0.032), 0, 0, 2.36);                    // flash hider cone
  P.decal('turret', 'number', '245', 0.24, [0.70, 0.22, 0.05], Math.PI / 2, 0, 0.18);
  P.decal('turret', 'number', '245', 0.24, [-0.70, 0.22, 0.05], -Math.PI / 2, 0, -0.18);
  P.decal('hull', 'soot', null, 0.55, [1.38, 1.35, -2.6], Math.PI / 2);         // exhaust louvre stain
  P.topY = 0.80;
}

// ================================== C1 Ariete ===============================
// §26.5: 90s NATO wedge between Leo 2A4 and CR2 — flat-faced angular turret
// with plan-angled cheeks, narrow vertical mantlet slot flanked by recesses,
// protruding gunner sight over the right cheek line, TURMS pano, 7 wheels.
function buildAriete(P) {
  const { box, cylX, cylY, cylZ, frustum, slab, buildGun, buildRunningGear,
    headlight, liftEye, periscope, pintleMG, smokeCluster, towCable, fenders,
    stowage, jerryCan, tarpRoll, torus } = KIT;
  const { rng } = P;
  P.add('hull', box(2.40, 0.56, 7.45), 0, 0.74, 0);                             // lower hull
  P.add('hull', box(3.28, 0.38, 4.9), 0, 1.45, -1.2);                           // upper band, flat long deck
  fenders(P, 1.27, 1.84, 1.27, -3.66, 3.6, 0.035);
  P.add('hull', frustum(1.66, 3.58, 1.32, 1.66, 1.32, 1.32, 1.02, 1.64));       // upper glacis
  P.add('hull', frustum(1.58, 3.24, 3.58, 1.66, 3.58, 3.58, 0.46, 1.02));       // lower glacis
  // prominent CENTRAL DRIVER BULGE on the glacis (§26.5)
  P.add('hull', box(0.78, 0.12, 1.0), 0, 1.44, 1.95, -0.27, 0, 0);
  P.add('hull', cylY(0.26, 0.26, 0.04, 16), 0, 1.545, 1.62);                    // driver hatch on the bulge
  P.add('hullDark', torus(0.26, 0.013, 16), 0, 1.55, 1.62);
  periscope(P, 'hullDetail', -0.2, 1.56, 1.95, -0.1);
  periscope(P, 'hullDetail', 0.2, 1.56, 1.95, 0.1);
  // rear plate: louvres, tow shackles, exhaust port LEFT-rear hull side
  P.add('hull', box(3.05, 0.5, 0.12), 0, 1.36, -3.70);
  P.add('hullDark', box(1.7, 0.36, 0.04), 0, 1.30, -3.77);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.6, 0.05, 0.05), 0, 1.17 + k * 0.10, -3.785);
  P.add('hullDark', box(0.30, 0.42, 0.55), -1.70, 1.10, -2.95);                 // exhaust box, left-rear side
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.05, 0.36, 0.42), -1.83 + k * 0.02, 1.10, -2.95);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.15, 0.08, 0.05), s * 1.35, 1.52, -3.77);            // taillights
    P.add('hullRubber', box(0.55, 0.34, 0.03), s * 1.5, 0.52, -3.78, 0.12, 0, 0);
    P.add('hullDetail', box(0.05, 0.24, 0.14), s * 1.1, 0.98, -3.78);           // tow brackets
  }
  // rubber skirts with 5 VERTICAL STIFFENER LINES per side (§26.5)
  // r3: dropped to the wheel axle line with the other skirted moderns (the
  // Ariete now ships this procedural model again — quarantine delist).
  for (const s of [-1, 1]) {
    P.add('hull', box(0.045, 0.68, 6.9), s * 1.82, 0.84, -0.05);
    P.add('hullRubber', box(0.03, 0.10, 6.85), s * 1.82, 0.47, -0.05);          // rubber lower lip
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.052, 0.62, 0.025), s * 1.82, 0.84, 2.6 - k * 1.32);
  }
  // deck furniture
  for (const s of [-1, 1]) P.add('hullDetail', box(0.9, 0.045, 0.07), s * 0.42, 1.40, 2.55, -0.27, s * 0.42, 0); // splash V
  P.add('hullDark', box(2.4, 0.02, 1.1), 0, 1.645, -2.5);                       // deck radiator inset
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.25, 0.03, 0.07), 0, 1.655, -2.92 + k * 0.21);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.03, 12), s * 1.28, 1.655, -0.3); // filler caps
  headlight(P, -1.34, 1.05, 3.48, -0.35);
  headlight(P, 1.34, 1.05, 3.48, -0.35);
  liftEye(P, 'hullDetail', -1.35, 1.66, 0.5);
  liftEye(P, 'hullDetail', 1.35, 1.66, 0.5);
  towCable(P, [[-1.2, 1.35, 2.8], [0, 1.5, 2.3], [1.2, 1.35, 2.8]]);
  // white 'EI' registration on the hull front (§26.5)
  P.decal('hull', 'number', 'EI 118', 0.3, [-0.95, 0.80, 3.6], 0, -0.2);
  buildRunningGear(P, {
    // SEVEN road wheels (§26.5 identity check)
    style: 'rubber', wheelR: 0.325, wheelW: 0.21, xc: 1.52,
    wheelZs: [2.85, 1.9, 0.95, 0.0, -0.95, -1.9, -2.85],
    sprocket: { z: -3.42, y: 0.48, r: 0.30 }, idler: { z: 3.38, y: 0.46, r: 0.29 },
    rollers: [2.1, 0.7, -0.7, -2.1].map((z) => ({ z, y: 0.90, r: 0.085 })),
    trackW: 0.60, topY: 0.90, paintedEnds: true, coveredTop: true,
  });
  // ---- turret: flat-faced angular box, cheeks angled back ~15° in plan ----
  const ATH = 0.80;
  P.add('turret', frustum(1.28, 0.35, -1.52, 1.20, 0.25, -1.48, 0.0, ATH));     // body
  P.add('turret', slab(                                                          // R cheek (near-vertical, 15° plan)
    [0.24, 0.02, 0.74], [1.28, 0.02, 0.42], [1.28, 0.02, 0.26], [0.24, 0.02, 0.58],
    [0.24, ATH, 0.68], [1.28, ATH, 0.36], [1.28, ATH, 0.20], [0.24, ATH, 0.52]));
  P.add('turret', slab(                                                          // L cheek
    [-1.28, 0.02, 0.42], [-0.24, 0.02, 0.74], [-0.24, 0.02, 0.58], [-1.28, 0.02, 0.26],
    [-1.28, ATH, 0.36], [-0.24, ATH, 0.68], [-0.24, ATH, 0.52], [-1.28, ATH, 0.20]));
  // NARROW VERTICAL MANTLET SLOT flanked by two rectangular recesses (§26.5)
  P.add('turret', box(0.50, ATH, 0.10), 0, ATH / 2, 0.60);                      // slot back wall
  P.add('turretDark', box(0.15, 0.52, 0.05), 0.33, 0.38, 0.64);                 // right recess
  P.add('turretDark', box(0.15, 0.52, 0.05), -0.33, 0.38, 0.64);                // left recess
  // gunner's sight box PROTRUDING ABOVE the right cheek line (§26.5 key ID)
  P.add('turret', box(0.42, 0.30, 0.48), 0.72, ATH + 0.06, 0.28);
  P.add('turretDark', box(0.32, 0.14, 0.04), 0.72, ATH + 0.08, 0.53);
  P.add('turretGlass', box(0.24, 0.09, 0.02), 0.72, ATH + 0.08, 0.555);
  P.add('turretDetail', box(0.46, 0.045, 0.52), 0.72, ATH + 0.23, 0.26);        // brow
  // TURMS panoramic sight center-right roof
  P.add('turretDetail', cylY(0.06, 0.08, 0.22, 12), 0.35, ATH + 0.11, -0.62);
  P.add('turretDark', cylY(0.11, 0.11, 0.18, 12), 0.35, ATH + 0.31, -0.62);
  P.add('turretGlass', box(0.11, 0.06, 0.02), 0.35, ATH + 0.33, -0.51);
  // hatches: commander right (behind TURMS), loader left + pintle MG
  P.add('turret', cylY(0.23, 0.23, 0.045, 14), 0.60, ATH + 0.02, -1.0);
  periscope(P, 'turretDetail', 0.60, ATH + 0.05, -0.70);
  P.add('turret', cylY(0.21, 0.21, 0.045, 14), -0.62, ATH + 0.02, -0.85);
  pintleMG(P, -0.62, ATH + 0.04, -1.0, false);
  // 4-tube smoke banks angled on each side (§26.5)
  smokeCluster(P, 1.16, 0.50, 0.05, 4, 1.1, 0.55);
  smokeCluster(P, -1.16, 0.50, 0.05, 4, -1.1, 0.55);
  // big full-width rear bustle rack + jerry cans (§26.5)
  const arkT = 0.68, arkB = 0.12, arkZ = -2.30;
  P.add('turretDetail', box(2.7, 0.05, 0.05), 0, arkT, arkZ);
  P.add('turretDetail', box(2.7, 0.05, 0.05), 0, arkB, arkZ);
  for (let k = 0; k < 12; k++) P.add('turretDetail', box(0.032, arkT - arkB, 0.032), -1.29 + k * 0.235, (arkT + arkB) / 2, arkZ);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 0.7), s * 1.33, arkT, -1.95);
    P.add('turretDetail', box(0.05, 0.05, 0.7), s * 1.33, arkB, -1.95);
  }
  P.add('turretDark', box(2.6, 0.02, 0.62), 0, arkB + 0.03, -1.98);             // mesh floor
  stowage(P, 'turretCloth', rng, [
    [-0.75, 0.36, -1.98, 0.6, 0.4, 0.45], [0.15, 0.32, -2.0, 0.55, 0.34, 0.42],
  ]);
  jerryCan(P, 'turretCloth', 0.95, 0.36, -1.98, 0.15);
  jerryCan(P, 'turretCloth', 1.2, 0.36, -1.96, -0.1);
  tarpRoll(P, 'turretCloth', -1.15, 0.55, -1.95, 0.6, 0.08, false, 8);
  P.add('turretDetail', box(0.03, 0.55, 0.03), -1.0, ATH + 0.22, -1.35, 0, 0, -0.1); // whip antenna
  P.add('turretDetail', box(0.03, 0.55, 0.03), 1.0, ATH + 0.22, -1.35, 0, 0, 0.1);
  // mantlet: narrow vertical block in the slot
  P.addGunExtra(box(0.34, 0.56, 0.26), 0, 0.02, 0.52);
  P.addGunExtra(cylZ(0.13, 0.28, 12, 0.16), 0, 0, 0.72);
  buildGun(P, { len: 5.35, r: 0.079, sleeve: true, evac: 0.5, collar: true, baseR: 0.16 }); // OTO 120/44
  P.decal('turret', 'number', '118', 0.30, [1.25, 0.34, -0.6], Math.PI / 2, 0, 0.04);
  P.decal('turret', 'number', '118', 0.30, [-1.25, 0.34, -0.6], -Math.PI / 2, 0, -0.04);
  P.decal('hull', 'soot', null, 0.65, [-1.86, 1.15, -2.9], -Math.PI / 2);       // left exhaust stain
  P.topY = 1.15;
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
