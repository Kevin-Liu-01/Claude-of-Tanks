// Owner-supplied AFV/IFV oracle registrations.
//
// The GLBs remain local comparison material only. Runtime vehicles are
// first-party procedural constructions in profiles/afvFamily.js, inheriting
// complete certified hull/suspension rigs and publishing their own gameplay
// identity here.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

export const AFV_FAMILY_IDS = Object.freeze([
  'bmp3_rok',
  'ua_m2a3_bradley',
  'bmpt_terminator2',
  'upior_ifv',
  'marder1a3',
  'm3a3_bradley',
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
  name, type: 'APFSDS', caliberMm, pen100Mm: Math.round(pen * 1.10),
  pen1000Mm: Math.round(pen * 1.04), pen2000Mm: pen, dmg: damage,
  moduleDmg: caliberMm, tracer: 'APFSDS', velocityMps, count, reloadS,
});
const heat = (name, caliberMm, pen, damage, velocityMps, count, reloadS) => ({
  name, type: 'HEAT', caliberMm, pen100Mm: pen, pen1000Mm: pen,
  pen2000Mm: pen, dmg: damage, moduleDmg: caliberMm, tracer: 'HEAT',
  velocityMps, count, reloadS, guided: true,
});
const he = (name, caliberMm, damage, velocityMps, count, reloadS = 0.42) => ({
  name, type: 'HE', caliberMm, pen100Mm: 8, pen1000Mm: 8, pen2000Mm: 8,
  dmg: damage, moduleDmg: caliberMm, tracer: 'HE', velocityMps, count, reloadS,
});

export const AFV_FAMILY_SPECS = {
  bmp3_rok: variant('bmp3_rok', 'bmp2', {
    name: 'BMP-3 (ROK)', nation: 'South Korea', number: 'ROK 3',
    base: '#465341', weather: '#5e6753', patches: ['#2d352c', '#69604b', '#81765b'],
    dims: { hullLengthM: 7.14, overallLengthM: 7.20, widthM: 3.20, heightM: 2.40,
      silhouetteHullLengthM: 6.53, silhouetteOverallLengthM: 6.74,
      silhouetteWidthM: 3.20, silhouetteHeightM: 2.62 },
    trackWidthM: 0.38,
    stats: { hp: 1180, enginePowerHp: 500, weightTons: 18.7, topSpeedKmh: 70,
      reverseSpeedKmh: 20, turretTraverseDegS: 52, gunPitchDegS: 38 },
    gun: { caliberMm: 30, reloadS: 0.40, baseAccuracy: 0.29, aimTimeS: 1.35 },
    shells: [
      ap('3UBR11 APFSDS', 30, 100, 58, 1120, 180, 0.40),
      heat('9M117M1 Arkan', 100, 750, 430, 370, 8, 12.5),
      he('3UOF19 HE-FRAG', 100, 340, 355, 22, 4.0),
    ],
  }),
  ua_m2a3_bradley: variant('ua_m2a3_bradley', 'm2a2_bradley', {
    name: 'M2A3 Bradley (Ukraine)', nation: 'Ukraine', number: 'UA B3',
    base: '#4c5142', weather: '#666956', patches: ['#30352d', '#625b46', '#77705a'],
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 3.60,
      silhouetteHullLengthM: 6.58, silhouetteOverallLengthM: 6.62,
      silhouetteWidthM: 3.56, silhouetteHeightM: 3.09 },
    stats: { hp: 1550, weightTons: 34.3, topSpeedKmh: 61, reverseSpeedKmh: 20 },
    shells: [
      ap('M919 APFSDS-T', 25, 110, 62, 1345, 225, 0.50),
      heat('BGM-71E TOW-2A', 152, 900, 500, 300, 7, 14),
      he('M792 HEI-T', 25, 58, 1100, 300, 0.50),
    ],
  }),
  bmpt_terminator2: variant('bmpt_terminator2', 't72b3m', {
    name: 'BMPT Terminator 2', nation: 'Russia', number: 'BMPT-2',
    base: '#46513b', weather: '#5a624b', patches: ['#2c342b', '#655d44', '#756b50'],
    dims: { hullLengthM: 7.20, overallLengthM: 7.20, widthM: 3.59, heightM: 3.33,
      silhouetteHullLengthM: 6.99, silhouetteOverallLengthM: 7.52,
      silhouetteWidthM: 3.59, silhouetteHeightM: 2.56 },
    trackWidthM: 0.58,
    stats: { hp: 2250, enginePowerHp: 1000, weightTons: 44.0, topSpeedKmh: 60,
      reverseSpeedKmh: 18, turretTraverseDegS: 58, gunPitchDegS: 45,
      gunElevationDeg: 45, gunDepressionDeg: 5 },
    gun: { caliberMm: 30, reloadS: 0.34, baseAccuracy: 0.27, aimTimeS: 1.25 },
    shells: [
      ap('3UBR8 APDS', 30, 75, 56, 1120, 425, 0.34),
      heat('9M120-1 Ataka-T', 130, 850, 500, 550, 4, 13.5),
      he('3UOF8 HE-I', 30, 52, 960, 425, 0.34),
    ],
  }),
  upior_ifv: variant('upior_ifv', 'bmp2', {
    name: 'Upior Infantry Fighting Vehicle', nation: 'Poland', number: 'UPIOR',
    base: '#3f4a3e', weather: '#535d4d', patches: ['#28312b', '#5d5948', '#706750'],
    dims: { hullLengthM: 6.90, overallLengthM: 7.12, widthM: 3.45, heightM: 3.02,
      silhouetteHullLengthM: 6.61, silhouetteOverallLengthM: 6.72,
      silhouetteWidthM: 3.45, silhouetteHeightM: 2.82 },
    trackWidthM: 0.44,
    stats: { hp: 1700, enginePowerHp: 720, weightTons: 32.0, topSpeedKmh: 68,
      reverseSpeedKmh: 28, turretTraverseDegS: 60, gunPitchDegS: 46 },
    gun: { caliberMm: 30, reloadS: 0.38, baseAccuracy: 0.26, aimTimeS: 1.25 },
    shells: [
      ap('MK30 APFSDS-T', 30, 120, 60, 1385, 220, 0.38),
      heat('Spike-LR2', 152, 850, 510, 180, 4, 14.5),
      he('30 mm ABM', 30, 58, 1100, 220, 0.38),
    ],
  }),
  marder1a3: variant('marder1a3', 'bmp2', {
    name: 'Marder 1A3', nation: 'Germany', number: 'MARDER',
    scheme: 'stripes', base: '#46503f', weather: '#5a6250',
    patches: ['#293229', '#655a42', '#756d56'], camoScale: 0.43,
    dims: { hullLengthM: 6.88, overallLengthM: 6.88, widthM: 3.38, heightM: 3.23,
      silhouetteHullLengthM: 6.39, silhouetteOverallLengthM: 6.41,
      silhouetteWidthM: 3.38, silhouetteHeightM: 2.48 },
    trackWidthM: 0.45,
    stats: { hp: 1380, enginePowerHp: 600, weightTons: 33.5, topSpeedKmh: 65,
      reverseSpeedKmh: 28, turretTraverseDegS: 52, gunPitchDegS: 38 },
    gun: { caliberMm: 20, reloadS: 0.36, baseAccuracy: 0.29, aimTimeS: 1.30 },
    shells: [
      ap('DM63 APDS', 20, 70, 46, 1100, 500, 0.36),
      heat('MELLS', 152, 900, 510, 180, 4, 15),
      he('DM51 HEI', 20, 44, 1050, 750, 0.36),
    ],
  }),
  m3a3_bradley: variant('m3a3_bradley', 'm2a2_bradley', {
    name: 'M3A3 Bradley CFV', nation: 'USA', number: 'M3A3',
    scheme: 'nato', base: '#4b5340', weather: '#616955',
    patches: ['#282e27', '#62543e', '#736a53'], camoScale: 0.48,
    dims: { hullLengthM: 6.55, overallLengthM: 6.55, widthM: 3.61, heightM: 3.73,
      silhouetteHullLengthM: 6.64, silhouetteOverallLengthM: 6.70,
      silhouetteWidthM: 3.61, silhouetteHeightM: 3.24 },
    stats: { hp: 1520, weightTons: 33.2, topSpeedKmh: 61, reverseSpeedKmh: 20,
      viewRangeM: 500 },
    shells: [
      ap('M919 APFSDS-T', 25, 110, 62, 1345, 300, 0.48),
      heat('BGM-71F TOW-2B', 152, 900, 520, 300, 12, 14),
      he('M792 HEI-T', 25, 58, 1100, 300, 0.48),
    ],
  }),
};

for (const id of AFV_FAMILY_IDS) {
  TANK_SPECS[id] = TANK_SPECS[id] || AFV_FAMILY_SPECS[id];
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}
