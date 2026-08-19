// Owner-supplied AFV/IFV oracle registrations.
//
// The GLBs remain local comparison material only. Runtime vehicles are
// first-party procedural constructions in profiles/afvFamily.js, inheriting
// complete certified hull/suspension rigs and publishing their own gameplay
// identity here.
//
// §5.248 IFV WAVE (2026-08-17): GROUND-UP print-measured ids joined the
// lane — bmp3, upior (new), marder1a3, m3a3_bradley. Their full spec rows
// live below with the modern3-pattern local armor mirror; the builders are
// original constructions in profiles/afvFamily.js authored from
// docs/references/vertex/<id>.json. §5.304 OWNER ORDER (verbatim): "keep our
// BMPT terminator 2, but remove the BMPT-72 Terminator 2" — the ground-up
// `bmpt` id is REMOVED (spec row, builder, tier, labels, markings, tool REG
// rows); the `bmpt_terminator2` clone stays the roster's Terminator
// (hash-frozen 1c7d8fbc at removal). §5.302/§5.306: marder1a3 and
// m3a3_bradley revert to their pre-wave hulls/bases per owner order — see
// their rows.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

const AFV_FAMILY_IDS = Object.freeze([
  'bmp3_rok',
  'ua_m2a3_bradley',
  'bmpt_terminator2',
  'bwp1',
  'marder1a3',
  'm3a3_bradley',
  // §5.248 ground-up wave (bmpt removed by §5.304 owner order — the
  // bmpt_terminator2 clone is the roster's Terminator)
  'bmp3',
  'upior',
  // §5.363 owner order — the Terminator on a T-90 hull (new id, tier 10)
  'bmpt_t90',
]);

function variant(id, donorId, o) {
  const donor = TANK_SPECS[donorId];
  if (!donor) throw new Error(`AFV family donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = o.name;
  spec.nation = o.nation;
  spec.era = 'modern';
  spec.class = 'ifv';
  spec.variantOf = donorId;
  delete spec.community;
  Object.assign(spec, o.stats || {});
  if (o.dims) spec.dims = { ...spec.dims, ...o.dims };
  if (o.gun) spec.gun = { ...spec.gun, ...o.gun };
  if (o.shells) spec.gun.shells = o.shells;
  spec.visual = {
    ...spec.visual,
    scheme: o.scheme || 'digital',
    base: o.base,
    weather: o.weather,
    patches: o.patches,
    marking: 'number',
    number: o.number,
    camoScale: o.camoScale ?? 0.50,
    trackWidthM: o.trackWidthM || spec.visual.trackWidthM,
  };
  return spec;
}

const ap = (name, caliberMm, pen, damage, velocityMps, count, reloadS = 0.42) => ({
  name, type: 'APFSDS', caliberMm,
  pen100Mm: Array.isArray(pen) ? pen[0] : Math.round(pen * 1.10),
  pen1000Mm: Array.isArray(pen) ? pen[1] : Math.round(pen * 1.04),
  pen2000Mm: Array.isArray(pen) ? pen[2] : pen, dmg: damage,
  moduleDmg: caliberMm, tracer: 'APFSDS', velocityMps, count, reloadS,
});
const heat = (name, caliberMm, pen, damage, velocityMps, count, reloadS, soundProfile) => ({
  name, type: 'HEAT', caliberMm, pen100Mm: pen, pen1000Mm: pen,
  pen2000Mm: pen, dmg: damage, moduleDmg: caliberMm, tracer: 'HEAT',
  velocityMps, count, reloadS, guided: true, soundProfile,
});
const he = (name, caliberMm, damage, velocityMps, count, reloadS = 0.42, soundProfile) => ({
  name, type: 'HE', caliberMm, pen100Mm: 8, pen1000Mm: 8, pen2000Mm: 8,
  dmg: damage, moduleDmg: caliberMm, tracer: 'HE', velocityMps, count, reloadS,
  soundProfile,
});

// ---------------------------------------------------------------------------
// Ground-up spec helpers — local mirror of the modern3.js parametric armor
// (that pack keeps modernArmor module-private; duplicated per pack ownership,
// the established convention for extension packs).
// ---------------------------------------------------------------------------

function gpar(name, physicalMm, v0, v1, v3, o = {}) {
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
const gfr = (name, mm, w, yB, zB, yT, zT, o) =>
  gpar(name, mm, [-w, yB, zB], [w, yB, zB], [-w, yT, zT], o);
const grr = (name, mm, w, yB, zB, yT, zT, o) =>
  gpar(name, mm, [w, yB, zB], [-w, yB, zB], [w, yT, zT], o);
const gsR = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  gpar(name, mm, [xB, yB, zF], [xB, yB, zR], [xT, yT, zF], o);
const gsL = (name, mm, xB, yB, xT, yT, zR, zF, o) =>
  gpar(name, mm, [-xB, yB, zR], [-xB, yB, zF], [-xT, yT, zR], o);
const grf = (name, mm, w, y, zR, zF, o) =>
  gpar(name, mm, [-w, y, zF], [w, y, zF], [-w, y, zR], o);
const gchR = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  gpar(name, mm, [xIn, y0, zIn], [xOut, y0, zOut], [xIn - xi, y1, zIn - tb], o);
const gchL = (name, mm, xIn, zIn, xOut, zOut, y0, y1, tb = 0, xi = 0, o) =>
  gpar(name, mm, [-xOut, y0, zOut], [-xIn, y0, zIn], [-xOut + xi, y1, zOut - tb], o);
const gmbox = (module, min, max, turretLocal = false) => ({ module, min, max, turretLocal });
const gcbox = (crew, min, max, turretLocal = false) => ({ crew, min, max, turretLocal });

const shell = (name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps, extra) => ({
  name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
  moduleDmg: caliberMm, tracer: type, ...(extra || {}),
});
const BLOOM_IFV = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

/**
 * Parametric IFV armor layout (mirror of modern3 modernArmor — same field
 * contract so hit zones, modules and crew boxes satisfy the asset checks).
 */
function ifvArmor(o) {
  const { hl, hw, inW, floor, trkTop, roofY, tw, tFrontZ, tRearZ, tH } = o;
  const tp = o.turretPivot;
  const A = (v) => ({ keMm: v[1], ceMm: v[2] });
  return {
    boundingRadiusM: hl + o.barrelLenM * 0.5 + 0.4,
    turretPivot: [tp[0], tp[1], tp[2]],
    gunPivot: [o.gunPivot[0], o.gunPivot[1], o.gunPivot[2]],
    gunBarrel: { lengthM: o.barrelLenM, radiusM: o.barrelRadM },
    hullPlates: [
      gfr('upper_glacis', o.glacis[0], hw * 0.92, floor + (roofY - floor) * 0.4, hl * 0.98, roofY, hl * 0.35, A(o.glacis)),
      gfr('lower_front', o.lower[0], hw * 0.9, floor, hl * 0.82, floor + (roofY - floor) * 0.4, hl * 0.98, A(o.lower)),
      gsR('hull_side_upper_R', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, A(o.side)),
      gsL('hull_side_upper_L', o.side[0], hw, trkTop, hw, roofY, -hl, hl * 0.5, A(o.side)),
      gsR('hull_side_lower_R', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, A(o.side)),
      gsL('hull_side_lower_L', o.side[0], inW, floor, inW, trkTop, -hl * 0.95, hl * 0.9, A(o.side)),
      ...(o.skirt ? [
        gsR('skirt_R', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...A(o.skirt) }),
        gsL('skirt_L', o.skirt[0], hw + 0.02, trkTop * 0.55, hw + 0.02, trkTop + 0.15, -hl * 0.9, hl * 0.9,
          { kind: 'spaced', ...A(o.skirt) }),
      ] : []),
      gsR('track_R', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackR' }),
      gsL('track_L', 20, hw * 0.86, 0.12, hw * 0.86, trkTop, -hl, hl, { kind: 'external', moduleLink: 'trackL' }),
      grr('hull_rear', o.rear, hw * 0.95, floor, -hl, roofY, -hl),
      grf('hull_roof', o.roof, hw * 0.95, roofY, -hl, hl * 0.35),
    ],
    turretPlates: [
      gchR('turret_cheek_R', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, A(o.cheek)),
      gchL('turret_cheek_L', o.cheek[0], tw * 0.16, tFrontZ, tw, tFrontZ - tw * 0.72, 0.0, tH, tH * 0.12, 0, A(o.cheek)),
      gpar('mantlet', o.mantlet[0],
        [-o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [o.barrelRadM * 3.6, o.gunPivot[1] - 0.24, tFrontZ + 0.06],
        [-o.barrelRadM * 3.6, o.gunPivot[1] + 0.24, tFrontZ + 0.03],
        { ...A(o.mantlet), gunFollow: true }),
      gsR('turret_side_R', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, A(o.tSide)),
      gsL('turret_side_L', o.tSide[0], tw, 0.0, tw, tH, tRearZ, tFrontZ - tw * 0.7, A(o.tSide)),
      grr('turret_rear', o.tRear, tw * 0.95, 0.0, tRearZ, tH, tRearZ),
      grf('turret_roof', o.tRoof, tw, tH + 0.01, tRearZ, tFrontZ - tw * 0.7),
    ],
    modules: [
      gmbox('engine', [-inW * 0.95, floor, -hl * 0.95], [inW * 0.95, roofY * 0.9, -hl * 0.5]),
      gmbox('fuelTank', [-inW * 0.95, floor, -hl * 0.48], [inW * 0.95, roofY * 0.65, -hl * 0.25]),
      gmbox('ammoRack', [-inW * 0.85, floor, -hl * 0.18], [inW * 0.85, roofY * 0.55, hl * 0.28]),
      gmbox('turretRing', [-tw * 0.85, roofY - 0.18, tp[2] - tw * 0.8], [tw * 0.85, roofY + 0.02, tp[2] + tw * 0.8]),
      gmbox('radio', [-tw * 0.6, 0.05, tRearZ * 0.85], [-tw * 0.1, tH * 0.55, tRearZ * 0.45], true),
      gmbox('optics', [tw * 0.2, tH * 0.55, tFrontZ * 0.3], [tw * 0.7, tH * 0.95, tFrontZ * 0.85], true),
      gmbox('gun', [-o.barrelRadM * 2.4, o.gunPivot[1] - 0.22, -tw * 0.5], [o.barrelRadM * 2.4, o.gunPivot[1] + 0.26, tFrontZ], true),
      gmbox('trackL', [-hw, 0, -hl], [-inW, trkTop, hl]),
      gmbox('trackR', [inW, 0, -hl], [hw, trkTop, hl]),
    ],
    crew: [
      gcbox('driver', [-inW * 0.75, floor + 0.15, hl * 0.5], [-inW * 0.05, roofY * 0.9, hl * 0.9]),
      gcbox('gunner', [tw * 0.12, 0.02, -tw * 0.35], [tw * 0.75, tH * 0.85, tw * 0.45], true),
      gcbox('commander', [tw * 0.12, 0.02, tRearZ * 0.6], [tw * 0.8, tH * 0.9, -tw * 0.35], true),
    ],
  };
}

const AFV_FAMILY_SPECS = {
  bmp3_rok: variant('bmp3_rok', 'bmp2', {
    name: 'BMP-3 (ROK)', nation: 'South Korea', number: 'ROK 3',
    base: '#465341', weather: '#5e6753', patches: ['#2d352c', '#69604b', '#81765b'],
    dims: { hullLengthM: 7.14, overallLengthM: 7.20, widthM: 3.20, heightM: 2.40,
      silhouetteHullLengthM: 6.53, silhouetteOverallLengthM: 6.74,
      silhouetteWidthM: 3.20, silhouetteHeightM: 2.62 },
    trackWidthM: 0.38,
    stats: { hp: 1550, enginePowerHp: 500, weightTons: 18.7, topSpeedKmh: 70,
      reverseSpeedKmh: 20, hullTraverseDegS: 48, turretTraverseDegS: 52, gunPitchDegS: 38 },
    gun: { caliberMm: 30, reloadS: 0.36, baseAccuracy: 0.29, aimTimeS: 1.35,
      soundProfile: '2a72' },
    shells: [
      ap('3UBR11 APFSDS', 30, [128, 116, 104], 58, 1120, 180, 0.36),
      heat('9M117M1 Arkan', 100, 750, 470, 370, 8, 12.5, 'arkan-launch'),
      he('3UOF19 HE-FRAG', 100, 340, 355, 22, 4.0, 'bmp3-100mm'),
    ],
  }),
  ua_m2a3_bradley: variant('ua_m2a3_bradley', 'm2a2_bradley', {
    name: 'M2A3 Bradley (Ukraine)', nation: 'Ukraine', number: 'UA B3',
    base: '#4c5142', weather: '#666956', patches: ['#30352d', '#625b46', '#77705a'],
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 3.60,
      silhouetteHullLengthM: 6.58, silhouetteOverallLengthM: 6.62,
      silhouetteWidthM: 3.56, silhouetteHeightM: 3.09 },
    stats: { hp: 1950, weightTons: 34.3, topSpeedKmh: 58, reverseSpeedKmh: 20,
      hullTraverseDegS: 40 },
    gun: { reloadS: 0.42, soundProfile: 'm242-bushmaster' },
    shells: [
      ap('M919 APFSDS-T', 25, [142, 128, 116], 64, 1345, 225, 0.42),
      heat('BGM-71E TOW-2A', 152, 900, 560, 300, 7, 14, 'tow-launch'),
      he('M792 HEI-T', 25, 56, 1100, 300, 0.42),
    ],
  }),
  bmpt_terminator2: variant('bmpt_terminator2', 't72b3m', {
    name: 'BMPT Terminator 2', nation: 'Russia', number: 'BMPT-2',
    // The previous digital field peaked in pale sage/khaki. Under the
    // garage key those tones made the ERA, engine covers and station armor
    // look like unpainted replacement parts. Keep the same three-tone
    // language, but inside the deeper Russian factory-olive family.
    base: '#35452f', weather: '#3f4d36', patches: ['#243128', '#4d4a37', '#5a523e'],
    dims: { hullLengthM: 7.20, overallLengthM: 7.20, widthM: 3.59, heightM: 3.33,
      silhouetteHullLengthM: 6.99, silhouetteOverallLengthM: 7.52,
      silhouetteWidthM: 3.59, silhouetteHeightM: 2.56 },
    trackWidthM: 0.58,
    stats: { hp: 2700, enginePowerHp: 1000, weightTons: 44.0, topSpeedKmh: 60,
      reverseSpeedKmh: 18, hullTraverseDegS: 34, turretTraverseDegS: 58, gunPitchDegS: 45,
      gunElevationDeg: 45, gunDepressionDeg: 5 },
    // OWNER ORDER (2026-08-17): "2 shooting holes for both its barrels ...
    // with a super fast reload". muzzles = the twin 2A42 tips' recoil-local
    // axes (tubes authored at x +-0.16 in addTerminatorStation) — the
    // factory's fallback-bore pass seats one dark mouth PER tip (opt-in
    // knob, absent-param byte-identical fleet-wide). reloadS 0.34 -> 0.30:
    // the fleet's fastest autocannon convention was marder1a3's 20 mm at
    // 0.20; the twin-plant Terminator trades some cycle rate for heavier fire.
    gun: { caliberMm: 30, reloadS: 0.30, baseAccuracy: 0.27, aimTimeS: 1.25,
      soundProfile: 'twin-2a42',
      muzzles: [{ x: -0.16, y: 0 }, { x: 0.16, y: 0 }] },
    shells: [
      ap('3UBR8 APDS', 30, [118, 106, 94], 52, 1120, 425, 0.30),
      heat('9M120-1 Ataka-T', 130, 850, 540, 550, 4, 13.5, 'ataka-launch'),
      he('3UOF8 HE-I', 30, 48, 960, 425, 0.30),
    ],
  }),
  bwp1: variant('bwp1', 'bmp2', {
    name: 'BWP-1 (Bojowy Wóz Piechoty 1)', nation: 'Poland', number: 'BWP-1',
    base: '#3f4a3e', weather: '#535d4d', patches: ['#28312b', '#5d5948', '#706750'],
    dims: { hullLengthM: 6.90, overallLengthM: 7.12, widthM: 3.45, heightM: 3.02,
      silhouetteHullLengthM: 6.61, silhouetteOverallLengthM: 6.72,
      silhouetteWidthM: 3.45, silhouetteHeightM: 2.82 },
    trackWidthM: 0.44,
    stats: { hp: 1850, enginePowerHp: 720, weightTons: 32.0, topSpeedKmh: 68,
      reverseSpeedKmh: 28, hullTraverseDegS: 48, turretTraverseDegS: 60, gunPitchDegS: 46 },
    gun: { caliberMm: 30, reloadS: 0.32, baseAccuracy: 0.26, aimTimeS: 1.25,
      soundProfile: 'mk30-2' },
    shells: [
      ap('MK30 APFSDS-T', 30, [158, 144, 130], 62, 1385, 220, 0.32),
      heat('Spike-LR2', 152, 850, 580, 180, 4, 14.5, 'spike-launch'),
      he('30 mm ABM', 30, 60, 1100, 220, 0.32),
    ],
  }),

  // -------------------------------------------------------------------------
  // §5.248 GROUND-UP WAVE — print-measured full spec rows (no donor cloning).
  // -------------------------------------------------------------------------

  marder1a3: {
    // Marder 1A3, the Bundeswehr's tall-hull IFV — 20 mm MK20 in the small
    // two-man turret, MILAN on the mount, rear ramp. §5.302 OWNER ORDER:
    // "now completely revert our marder hull while preserving its new
    // turret" — the pre-§5.286 Bradley-donor hull returns (buildBradley +
    // A3 rails); the §5.269 cast turret with the external MK20 carriage is
    // preserved and re-seated. Print marder1a3_arrafi.glb stays fused/
    // suspect (rip-poster account history) — PHOTOS GOVERN (§B7 class).
    id: 'marder1a3', name: 'Marder 1A3', nation: 'Germany', era: 'modern', class: 'ifv',
    hp: 1250,
    enginePowerHp: 600, weightTons: 33.5, topSpeedKmh: 65, reverseSpeedKmh: 17,
    hullTraverseDegS: 50,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 50, gunPitchDegS: 40, gunElevationDeg: 45, gunDepressionDeg: 12,
    gun: {
      // MK20 Rh202 belt bursts are LIVE per-shell reloads; MILAN pays its
      // full rail time.
      caliberMm: 20, reloadS: 0.20, baseAccuracy: 0.30, aimTimeS: 1.30,
      soundProfile: 'rh202',
      bloom: BLOOM_IFV,
      shells: [
        shell('DM63 APDS-T', 'APFSDS', 20, 72, 64, 32, 1100, { pen2000Mm: 56, reloadS: 0.20, count: 500 }),
        shell('MILAN 2', 'HEAT', 115, 720, 720, 450, 200,
          { reloadS: 15, count: 4, guided: true, soundProfile: 'milan-launch' }),
        shell('DM81 HEI-T', 'HE', 20, 6, 6, 30, 1045, { reloadS: 0.20, count: 750 }),
      ],
    },
    // Published Marder 1A3 data: 6.88 hull (gun never passes the bow —
    // overall = hull), 3.38 over the appliqué, 3.02 to the sight crown.
    // §5.302 hull revert: the silhouette* rows return with the pre-§5.286
    // Bradley-donor hull (hull-side honest-measured dims; heightM stays on
    // the preserved turret's sight-crown publication).
    dims: { hullLengthM: 6.88, overallLengthM: 6.88, widthM: 3.38, heightM: 3.02,
      silhouetteHullLengthM: 6.39, silhouetteOverallLengthM: 6.41,
      silhouetteWidthM: 3.38, silhouetteHeightM: 2.85 },
    armor: ifvArmor({
      // §5.302 reverted-hull envelope (m2a2 family datum — the Bradley donor
      // hull the order restores): roof 1.90, ring station (0.18, -0.05) at
      // 1.895 carrying the PRESERVED §5.269 cast turret + external MK20
      // carriage; turret-side values stay on the wave's print-measured band.
      hl: 3.27, hw: 1.64, inW: 0.95, floor: 0.45, trkTop: 0.95, roofY: 1.90,
      turretPivot: [0.18, 1.895, -0.05], gunPivot: [0, 0.78, 0.26],
      barrelLenM: 2.55, barrelRadM: 0.026,
      glacis: [30, 45, 75], lower: [25, 32, 45], side: [20, 35, 60],
      skirt: [15, 25, 45], rear: 15, roof: 12,
      tw: 0.75, tFrontZ: 0.80, tRearZ: -0.75, tH: 0.60,
      cheek: [35, 55, 80], tSide: [25, 40, 60], tRear: 15, tRoof: 10,
      mantlet: [35, 55, 80],
    }),
    visual: {
      // Bundeswehr NATO 3-tone
      scheme: 'stripes', base: '#46503f', weather: '#57604b',
      patches: ['#28302a', '#5f5643'], marking: 'number', number: 'Y-224',
      trackWidthM: 0.45, camoScale: 0.50,
    },
  },

  m3a3_bradley: {
    // M3A3 Bradley CFV — the two-man scout configuration. §5.306 OWNER
    // ORDER: "revert our m3a3 bradley CFV except add the extra equipment we
    // added and detailing and armor" — the pre-§5.286 buildBradley base
    // returns and the wave's equipment suite (TOW twin-box, ISU, CIV drum,
    // bustle, glacis appliqué, coax) re-seats on it. Print
    // m3a3_bradley_sipriv.glb is a rigged lowpoly (bind-pose vertex reads
    // are scattered — the browser gate poses it correctly).
    id: 'm3a3_bradley', name: 'M3A3 Bradley CFV', nation: 'USA', era: 'modern', class: 'ifv',
    hp: 1800,
    enginePowerHp: 600, weightTons: 34.4, topSpeedKmh: 61, reverseSpeedKmh: 20,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.75, medium: 0.85, soft: 1.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 60, gunPitchDegS: 40, gunElevationDeg: 30, gunDepressionDeg: 9,
    gun: {
      caliberMm: 25, reloadS: 0.40, baseAccuracy: 0.28, aimTimeS: 1.25,
      soundProfile: 'm242-bushmaster',
      bloom: BLOOM_IFV,
      shells: [
        shell('M919 APFSDS-T', 'APFSDS', 25, 136, 122, 62, 1345, { pen2000Mm: 110, reloadS: 0.40, count: 300 }),
        shell('BGM-71F TOW-2B', 'HEAT', 152, 900, 900, 600, 300,
          { reloadS: 14, count: 10, guided: true, soundProfile: 'tow-launch' }),
        shell('M792 HEI-T', 'HE', 25, 8, 8, 56, 1100, { reloadS: 0.40, count: 300 }),
      ],
    },
    // §5.306 base revert: the pre-§5.286 declared dims return with the
    // buildBradley base (silhouette* rows are that base's honest-measured
    // values; re-trued against the hybrid build at gate time).
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 3.73,
      silhouetteHullLengthM: 6.71, silhouetteOverallLengthM: 6.70,
      silhouetteWidthM: 3.61, silhouetteHeightM: 3.05 },
    armor: ifvArmor({
      hl: 3.27, hw: 1.64, inW: 0.95, floor: 0.45, trkTop: 0.95, roofY: 1.90,
      turretPivot: [0, 1.895, -0.45], gunPivot: [-0.06, 0.375, 0.60],
      barrelLenM: 2.30, barrelRadM: 0.038,
      glacis: [45, 70, 80], lower: [45, 60, 60], side: [35, 40, 45],
      skirt: [25, 35, 70], rear: 25, roof: 20,
      tw: 0.85, tFrontZ: 1.00, tRearZ: -1.10, tH: 0.90,
      cheek: [40, 70, 80], tSide: [35, 40, 45], tRear: 25, tRoof: 20,
      mantlet: [45, 70, 80],
    }),
    visual: {
      scheme: 'nato', base: '#4a553d', weather: '#535f46',
      patches: ['#232620', '#4b3b2d'], marking: 'number', number: 'C-30',
      trackWidthM: 0.53, camoScale: 0.50,
    },
  },

  bmp3: {
    // NEW GROUND-UP ID: the BMP-3 — low boat hull with the distinctive
    // raked bow, REAR engine + raised rear troop deck, 100 mm 2A70 +
    // 30 mm 2A72 twin plant in the low two-man turret. Built against the
    // fully semantic bmp3_rok_42manako print (docs/references/vertex/
    // bmp3.json; print +3.3% long in the width-anchored frame — features
    // author on the print's lines z-mapped x0.9684 into the PUBLISHED 7.14
    // envelope, pub-dims sovereignty).
    // NATION: Russia (§5.249 ASK-OWNER default; the print's ROK livery is
    // noted — a ROK-marked variant remains available as bmp3_rok).
    id: 'bmp3', name: 'BMP-3', nation: 'Russia', era: 'modern', class: 'ifv',
    hp: 1450,
    enginePowerHp: 500, weightTons: 18.7, topSpeedKmh: 70, reverseSpeedKmh: 20,
    hullTraverseDegS: 48,
    terrainResistance: { hard: 0.72, medium: 0.85, soft: 1.45 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 50, gunPitchDegS: 38, gunElevationDeg: 60, gunDepressionDeg: 6,
    gun: {
      // 2A72 belt is the rapid plant; the 2A70 pays real rail/loader time
      // on the ATGM and HE-FRAG natures (per-shell reloads are LIVE).
      caliberMm: 30, reloadS: 0.34, baseAccuracy: 0.30, aimTimeS: 1.35,
      soundProfile: '2a72',
      bloom: BLOOM_IFV,
      shells: [
        shell('3UBR11 APFSDS-T', 'APFSDS', 30, 112, 102, 55, 1120, { pen2000Mm: 92, reloadS: 0.34, count: 200 }),
        shell('9M117M1 Arkan', 'HEAT', 100, 750, 750, 500, 370,
          { reloadS: 12, count: 8, guided: true, soundProfile: 'arkan-launch' }),
        shell('3UOF19 HE-FRAG', 'HE', 100, 12, 12, 360, 250,
          { reloadS: 4.0, count: 22, soundProfile: 'bmp3-100mm' }),
      ],
    },
    // Published: 7.14 hull; the 2A70 muzzle overhangs the bow ~0.27 in the
    // print but published overall is hull-total 7.14 (IFV convention) —
    // the print's own overhang is honored in the build (overall reads the
    // gun; dims grace covers the published datum).
    dims: { hullLengthM: 7.14, overallLengthM: 7.14, widthM: 3.23, heightM: 2.40 },
    armor: ifvArmor({
      // Print envelope (x0.9684 z-map): tub floor 0.29, sponson/deck 1.84,
      // fender band to ±1.615, ring plane 1.85 at z +0.24.
      hl: 3.57, hw: 1.615, inW: 1.00, floor: 0.29, trkTop: 1.20, roofY: 1.84,
      turretPivot: [0, 1.85, 0.24], gunPivot: [0.05, 0.28, 0.65],
      barrelLenM: 2.95, barrelRadM: 0.058,
      glacis: [35, 45, 60], lower: [30, 35, 40], side: [25, 28, 30],
      skirt: null, rear: 20, roof: 10,
      tw: 1.15, tFrontZ: 1.10, tRearZ: -1.10, tH: 0.57,
      cheek: [45, 60, 80], tSide: [30, 35, 40], tRear: 20, tRoof: 12,
      mantlet: [45, 60, 80],
    }),
    visual: {
      scheme: 'stripes', base: '#44503a', weather: '#525c45',
      patches: ['#2a331f', '#5c5a41'], marking: 'number', number: '331',
      trackWidthM: 0.37, camoScale: 0.55,
    },
  },

  upior: {
    // NEW GROUND-UP ID: the Upiór — FICTIONAL Polish concept IFV; the print
    // IS the design (faceted stealth hull, BMP-2-class turret, tall left
    // sensor tower). DIMS = PRINT-PROPORTIONAL at the banked 3.00 width
    // anchor (§5.249 ASK-OWNER default "print-proportional"): the extract
    // reads L 5.11 / H 2.55 at W 3.00 — the REG row's provisional 6.70
    // length was a pre-extraction BMP-2-class guess and is superseded by
    // the print's own proportions (conflict reported to the orchestrator).
    id: 'upior', name: 'Upiór IFV', nation: 'Poland', era: 'modern', class: 'ifv',
    hp: 1700,
    enginePowerHp: 800, weightTons: 30.0, topSpeedKmh: 75, reverseSpeedKmh: 30,
    hullTraverseDegS: 52,
    terrainResistance: { hard: 0.70, medium: 0.82, soft: 1.45 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 55, gunPitchDegS: 40, gunElevationDeg: 35, gunDepressionDeg: 7,
    gun: {
      caliberMm: 30, reloadS: 0.30, baseAccuracy: 0.28, aimTimeS: 1.30,
      soundProfile: '2a72',
      bloom: BLOOM_IFV,
      shells: [
        shell('3UBR11 APFSDS-T', 'APFSDS', 30, 146, 132, 58, 1120, { pen2000Mm: 118, reloadS: 0.30, count: 220 }),
        shell('Spike-LR', 'HEAT', 152, 800, 800, 550, 180,
          { reloadS: 14, count: 4, guided: true, soundProfile: 'spike-launch' }),
        shell('3UOF8 HE-I', 'HE', 30, 8, 8, 52, 960, { reloadS: 0.30, count: 300 }),
      ],
    },
    // OWNER FLIP ORDER dims (2026-08-17): with the hull un-mirrored (wedge
    // bow +z, receipts shots/upior-flip/) the turret re-seats rear-of-mid
    // at the print's own ring station and the 30 mm stays BEHIND the nose
    // exactly like the print ("gun stays behind the nose", §5.248 packet):
    // overall = the hull's own span again. The §5.269 6.20 overall was the
    // mirrored front-of-mid seat's gun overhang.
    dims: { hullLengthM: 5.15, overallLengthM: 5.21, widthM: 3.00, heightM: 2.55 },
    armor: ifvArmor({
      // Print envelope (width-anchored frame IS the authoring frame): deck
      // crown 1.60, skirts to ±1.50, BMP-2-class turret ring 1.47 at
      // [x -0.10, z -0.74], roof 1.91, tower crown 2.55.
      hl: 2.555, hw: 1.50, inW: 0.85, floor: 0.28, trkTop: 0.83, roofY: 1.58,
      turretPivot: [-0.10, 1.47, -0.74], gunPivot: [0, 0.21, 0.55],
      barrelLenM: 2.40, barrelRadM: 0.035,
      glacis: [40, 90, 140], lower: [35, 60, 90], side: [30, 55, 90],
      skirt: [25, 45, 120], rear: 25, roof: 15,
      tw: 0.88, tFrontZ: 0.88, tRearZ: -0.77, tH: 0.45,
      // (OWNER FLIP ORDER 2026-08-17: ring back at the -0.74 rear-of-mid
      // print station — §5.269's +0.74 "native-frame fix" was itself the
      // mirrored read; pixel receipts shots/upior-flip/before/)
      cheek: [45, 80, 120], tSide: [30, 50, 80], tRear: 25, tRoof: 15,
      mantlet: [50, 90, 130],
    }),
    visual: {
      scheme: 'digital', base: '#3d4639', weather: '#4b5344',
      patches: ['#262e26', '#565243', '#6a6252'], marking: 'number', number: 'W-01',
      trackWidthM: 0.36, camoScale: 0.42,
    },
  },

  // -------------------------------------------------------------------------
  // §5.363 OWNER ORDER (verbatim): "add a bmp terminator 2 where it has an
  // even crazier beefier two autocannon turret with even more equipment and
  // decorations and even some era on a t90 hull". NEW id on the certified
  // T-90A donor (spec clone t90a; geometry T90_PROFILES.t90a + the beefed
  // station in profiles/afvFamily.js). FALSE-0/photo-class — never gated.
  // Tier 10 (one over bmpt_terminator2's 9 — the beefier variant).
  // -------------------------------------------------------------------------
};

AFV_FAMILY_SPECS.bmpt_t90 = variant('bmpt_t90', 't90a', {
  name: 'BMPT T-90', nation: 'Russia', number: 'BMPT-90',
  base: '#414c39', weather: '#565f48', patches: ['#2b3329', '#615a43', '#6f6852'],
  // Published stance: the T-90A donor's 6.86 hull IS the vehicle; overall
  // reads the twin 30 mm tips past the bow (measured tip +4.109 / stern
  // −3.455). heightM publishes the solid station crown (pano head cap at
  // 2.90 — whips are mask-filtered, §D whip-rough law). silhouette* rows
  // are honest node-measured AABBs (tools/tmp-bmpt-t90-measure.mjs, packet).
  dims: { hullLengthM: 6.86, overallLengthM: 7.56, widthM: 3.78, heightM: 2.90,
    silhouetteHullLengthM: 6.90, silhouetteOverallLengthM: 7.56,
    silhouetteWidthM: 3.78, silhouetteHeightM: 2.90 },
  trackWidthM: 0.58,
  // bmpt_terminator2's frame up a notch for the T-90 hull: +150 hp pool,
  // T-90M-class 1130 hp plant, 48 t with the full skirt/station ERA suite.
  stats: { hp: 2950, enginePowerHp: 1130, weightTons: 48.0, topSpeedKmh: 60,
    reverseSpeedKmh: 18, hullTraverseDegS: 32, turretTraverseDegS: 60, gunPitchDegS: 48,
    gunElevationDeg: 45, gunDepressionDeg: 5 },
  // §5.330 knob: muzzles = the twin 2A42 tips' recoil-local axes (tubes
  // authored at x ±0.20 in addTerminatorT90Station — wider than the clone's
  // ±0.16 for the beefier read); one bore assembly per tip (§B3.1 ×2).
  // reloadS 0.28 keeps the T-90 station distinct from the 0.30 s clone.
  gun: { caliberMm: 30, reloadS: 0.28, baseAccuracy: 0.26, aimTimeS: 1.20,
    soundProfile: 'twin-2a42',
    muzzles: [{ x: -0.20, y: 0 }, { x: 0.20, y: 0 }] },
  shells: [
    ap('3UBR8 APDS', 30, [122, 110, 98], 50, 1120, 500, 0.28),
    heat('9M120-1 Ataka-T', 130, 850, 560, 550, 8, 13.5, 'ataka-launch'),
    he('3UOF8 HE-I', 30, 46, 960, 500, 0.28),
  ],
});

for (const id of AFV_FAMILY_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || AFV_FAMILY_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
