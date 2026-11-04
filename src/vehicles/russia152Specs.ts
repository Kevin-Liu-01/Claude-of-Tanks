// The Russian 152 mm line (release 269; owner 2026-11-04: "NEW RUSSIAN 152 MM TANK LINE make a new russian tank called
// object 195 ... as well as a t14 armata with a 152 mm variannt ..., Object 477 "Molot" ..., and object 292 for a full
// line of 152 mm variant tanks"; DECISIONS "2026-11-04 Russian 152 mm line"). Each is a whole real vehicle on its real
// base, and each plays as a 152 mm gun: a heavy hit per shot, a slower reload and fewer rounds than the 125 mm line, at
// the published figures. docs/references/photos/russia-152-20261104.json holds the sources. No round designation, weight
// or penetration is published for any of the three guns (the LP-83, the 2A73, the 2A83), so the rounds carry their gun's
// name and their numbers are game figures at the line's footing, measured on the balance range; Main rules the tiers on
// the lane's fairness numbers.
import './sourceXFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, modernArmor, type ShellSpec } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { MOLOT_FRAME, OBJECT195_FRAME, OBJECT292_GUN_FRAME, T14_152_GUN_FRAME } from './russia152Frames.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

export const RUSSIA_152_IDS = Object.freeze(['object292', 'object477_molot', 'object195', 't14_152'] as const);

const variant = (id: string, donor: string, name: string, nation: string, era: string): FleetTankSpec => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation, era, role: 'mbt' });
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  return spec;
};

/** A 152 mm round. `pen` is [100 m, 1 km, 2 km]; HEAT and HE keep one figure. */
const round = (name: string, type: 'APFSDS' | 'HEAT' | 'HE', pen: readonly number[], dmg: number, velocityMps: number,
  count: number): ShellSpec => ({
  name, type, caliberMm: 152, pen100Mm: pen[0], pen1000Mm: pen[1] ?? pen[0], ...(pen[2] ? { pen2000Mm: pen[2] } : {}),
  dmg, velocityMps, moduleDmg: 150, tracer: type, count,
});

/** The line's three rounds for one gun: [APFSDS pen, damage, count], [HEAT pen, damage, count], [HE damage, count]. */
const rounds = (gun: string, apfsds: [readonly number[], number, number], heat: [number, number, number],
  he: [number, number]): ShellSpec[] => [
  round(`${gun} APFSDS`, 'APFSDS', apfsds[0], apfsds[1], 1780, apfsds[2]),
  round(`${gun} HEAT-FS`, 'HEAT', [heat[0]], heat[1], 950, heat[2]),
  round(`${gun} HE-FRAG`, 'HE', [72], he[0], 850, he[1]),
];

// ------------------------------------------------------------------------------------------------------ Object 292 --
// The Kirov Plant's 1990 trials tank (one built, Kubinka): the serial T-80BV's hull and 1,100 hp GTD-1000TF turbine under
// a reworked T-80 cast turret carrying a welded box for the LP-83 (profiles/object292.ts). 46 t, three crew; the LP-83's
// loading mechanism was designed for the box bustle (30 rounds, 16 ready, six a minute) and never fitted to the
// prototype. Its Kontakt-1 studs carry no bricks, so its hull is the BV's without the ERA plates.
const object292 = variant('object292', 't80bv', 'Object 292', 'USSR', 'modern');
// Tier VII (Main 2026-11-04, on the lane's fairness numbers: 2,350 HP and 700 damage at 10 s scored 0 of 17 pairs fair at VII,
// these levers 16 of 17, mean 0.397)
Object.assign(object292, { hp: 2500, weightTons: 46, enginePowerHp: 1100, topSpeedKmh: 70, gunElevationDeg: 15, gunDepressionDeg: 5 });
Object.assign(object292.dims, { overallLengthM: 3.39 + OBJECT292_GUN_FRAME.muzzleZ, widthM: 3.525, heightM: 2.25 });
object292.gun = {
  // 9 s: the six a minute (10 s) was the design rate of a loading mechanism the prototype never got (GlobalSecurity,
  // militaryrussia: "not installed"), so the 9 s breaks no real figure
  ...object292.gun, caliberMm: 152, reloadS: 9.0, baseAccuracy: 0.34, aimTimeS: 2.1, soundProfile: 'lp-83',
  shells: rounds('LP-83', [[840, 770, 700], 900, 14], [780, 820, 8], [1100, 8]),
};
object292.armor.hullPlates = object292.armor.hullPlates.filter((plate) => plate.kind !== 'era');
// the box turret's plates (the welded box over the T-80BV casting, steel only, no ERA): the cheek and mantlet ratings x1.35
// over the cast turret's for the steel weight-imitator blocks welded on its front (War Thunder devblog 2024: "steel blocks
// ... acting as weight imitators"; Main 2026-11-04, tier VII)
object292.armor.turretPlates = modernArmor({
  hl: 3.39, hw: 1.76, inW: 1.05, floor: 0.44, trkTop: 1.05, roofY: 1.45, turretPivot: [0, 1.45, 0],
  gunPivot: [0, OBJECT292_GUN_FRAME.trunnionY - 1.45, OBJECT292_GUN_FRAME.trunnionZ],
  barrelLenM: OBJECT292_GUN_FRAME.muzzleZ - OBJECT292_GUN_FRAME.trunnionZ, barrelRadM: 0.135,
  glacis: [0, 0, 0], lower: [0, 0, 0], side: [0, 0, 0], rear: 0, roof: 0,
  tw: 1.12, tFrontZ: 1.18, tRearZ: -2.30, tH: 0.80,
  cheek: [620, 810, 890], tSide: [200, 200, 240], tRear: 40, tRoof: 45, mantlet: [380, 513, 567],
}).turretPlates;
// the T-80BV hull's ring datum (profiles/t80.ts: the turret at y 1.45 over z 0; the BV row registered here still holds its
// donor's 1.442 / 0.145 until its own frame pass)
object292.armor.turretPivot = [0, 1.45, 0];
object292.armor.gunPivot = [0, OBJECT292_GUN_FRAME.trunnionY - 1.45, OBJECT292_GUN_FRAME.trunnionZ];
object292.armor.gunBarrel = { lengthM: OBJECT292_GUN_FRAME.muzzleZ - OBJECT292_GUN_FRAME.trunnionZ, radiusM: 0.135 };
// the plain green Kubinka shows (the national Russian plain, camoPolicy national_ru)
object292.visual = { scheme: 'solid', base: '#44553a', weather: '#4f6144', patches: [], marking: 'number', number: '292',
  trackWidthM: 0.58 };

// ------------------------------------------------------------------------------------------------ Object 477 Molot --
// KhKBM Kharkiv's 1987-91 OKR "Boxer", "Molot" from the late 1980s (Yu. Apukhtin's memoir; btvt.info): two prototypes, a
// 50 t specification exceeded by several tonnes, a 1,200 hp two-stroke diesel on the 6TDF, 63 km/h on trials, three crew
// (the driver ahead, the gunner and commander low under the turret), the Perm 152 mm smoothbore (btvt: 2A73) in an
// armoured casing on the roof of a low turret, 8 ready rounds on a belt in the turret's rear and 32 in two hull
// conveyors, and a 30 mm cannon to the gun's right. btvt's 10,650 mm over the gun and 2,434 mm to the turret's roof.
const molot = variant('object477_molot', 't84', 'Object 477 Molot', 'USSR', 'next-generation');
Object.assign(molot, {
  hp: 2550, weightTons: 55, enginePowerHp: 1200, topSpeedKmh: 63, reverseSpeedKmh: 18,
  turretTraverseDegS: 38, gunElevationDeg: 14, gunDepressionDeg: 6,
});
Object.assign(molot.dims, { hullLengthM: MOLOT_FRAME.hullFrontZ - MOLOT_FRAME.hullRearZ,
  overallLengthM: MOLOT_FRAME.muzzleZ - MOLOT_FRAME.hullRearZ, widthM: 3.52, heightM: MOLOT_FRAME.casingTopY });
molot.gun = {
  ...molot.gun, caliberMm: 152, reloadS: 9.0, baseAccuracy: 0.31, aimTimeS: 1.9, soundProfile: '2a73',
  shells: rounds('2A73', [[920, 850, 780], 720, 20], [820, 660, 10], [880, 10]),
};
molot.armor = modernArmor({
  hl: (MOLOT_FRAME.hullFrontZ - MOLOT_FRAME.hullRearZ) / 2, hw: 1.76, inW: 1.08, floor: 0.46, trkTop: 1.05,
  roofY: MOLOT_FRAME.roofY, turretPivot: [0, MOLOT_FRAME.ringY, MOLOT_FRAME.ringZ],
  gunPivot: [0, MOLOT_FRAME.trunnionY - MOLOT_FRAME.ringY, MOLOT_FRAME.trunnionZ - MOLOT_FRAME.ringZ],
  barrelLenM: MOLOT_FRAME.muzzleZ - MOLOT_FRAME.trunnionZ, barrelRadM: 0.135,
  // the modular nose "more than a metre deep along the shot line" with its built-in ERA, the multi-barrier flanks
  glacis: [520, 760, 1100], lower: [180, 260, 340], side: [80, 90, 140], skirt: [30, 30, 160], rear: 40, roof: 45,
  tw: 1.20, tFrontZ: 1.30, tRearZ: -1.70, tH: 0.48,
  cheek: [560, 700, 950], tSide: [160, 180, 260], tRear: 50, tRoof: 50, mantlet: [400, 420, 520],
});
// the Object 292's plain green (camoPolicy national_ru)
molot.visual = { scheme: 'solid', base: '#44553a', weather: '#4f6144', patches: [], marking: 'number', number: '477',
  trackWidthM: 0.58 };

// -------------------------------------------------------------------------------------------------------- Object 195 --
// UKBTM and Uralvagonzavod's OKR "Sovershenstvovanie-88" (the T-95): two prototypes (UVZ 2020), trials stopped on
// 29 December 2008. 52-58 t (Gen. S. Maev), the 1,650 hp X-type diesel (UVZ), three crew side by side in a capsule in the
// nose, an unmanned module carrying the 2A83, a 30 mm 2A42 beside it and the sights, on a carousel of vertical cassettes
// (24 mechanised rounds of about 40); seven T-90-type road wheels. The first prototype's Shtandart APS and radar are
// drawn on the build (profiles/object195X.ts).
const object195 = variant('object195', 't14_armata', 'Object 195', 'Russia', 'next-generation');
Object.assign(object195, {
  hp: 2800, weightTons: 55, enginePowerHp: 1650, topSpeedKmh: 70, reverseSpeedKmh: 25,
  turretTraverseDegS: 38, gunElevationDeg: 14, gunDepressionDeg: 7,
});
Object.assign(object195.dims, { hullLengthM: OBJECT195_FRAME.hullFrontZ - OBJECT195_FRAME.hullRearZ,
  overallLengthM: OBJECT195_FRAME.muzzleZ - OBJECT195_FRAME.hullRearZ, widthM: 3.56, heightM: 2.62 });
object195.gun = {
  ...object195.gun, caliberMm: 152, reloadS: 8.5, baseAccuracy: 0.29, aimTimeS: 1.75, soundProfile: '2a83',
  shells: rounds('2A83', [[1000, 920, 840], 740, 18], [860, 680, 8], [900, 10]),
};
object195.armor = modernArmor({
  hl: OBJECT195_FRAME.hullFrontZ, hw: 1.78, inW: 1.12, floor: 0.45, trkTop: 1.10, roofY: OBJECT195_FRAME.roofY,
  turretPivot: [0, OBJECT195_FRAME.ringY, OBJECT195_FRAME.ringZ],
  gunPivot: [0, OBJECT195_FRAME.trunnionY - OBJECT195_FRAME.ringY, OBJECT195_FRAME.trunnionZ - OBJECT195_FRAME.ringZ],
  barrelLenM: OBJECT195_FRAME.muzzleZ - OBJECT195_FRAME.trunnionZ, barrelRadM: 0.135,
  // the crew capsule behind the nose's combined armour and its built-in ERA; the module is thinner, as the T-14's
  glacis: [900, 950, 1250], lower: [300, 320, 380], side: [200, 200, 220], skirt: [40, 40, 180], rear: 60, roof: 55,
  tw: 0.96, tFrontZ: 1.30, tRearZ: -1.45, tH: 1.20,
  cheek: [320, 330, 340], tSide: [280, 280, 300], tRear: 60, tRoof: 50, mantlet: [320, 320, 340],
});
// the crew capsule: three side by side under the hatches behind the glacis, nobody in the module (the T-14's order)
object195.armor.crew = [
  crewBox('driver', [-1.02, .55, 1.55], [-.36, 1.55, 2.60]),
  crewBox('gunner', [-.33, .55, 1.55], [.33, 1.55, 2.60]),
  crewBox('commander', [.36, .55, 1.55], [1.02, 1.55, 2.60]),
];
object195.visual = { scheme: 'solid', base: '#46523a', weather: '#4e5a42', patches: [], marking: 'number', number: '195',
  trackWidthM: 0.58 };

// ------------------------------------------------------------------------------------------------------ T-14 152 --
// The T-14's hull, running gear and turret shell under the 2A83 (profiles/t14_152X.ts): the 152 mm gun the Armata's
// unmanned turret was laid out to take (UVZ to TASS, August 2018: "ready to create ... a 152-mm cannon on the Armata
// platform"; no such tank has been shown). Mass, mobility and protection are the T-14's; 40 rounds, 24 in the carousel.
const t14_152 = variant('t14_152', 't14_armata', 'T-14 152', 'Russia', 'next-generation');
Object.assign(t14_152.dims, { overallLengthM: 4.327 + T14_152_GUN_FRAME.muzzleZ });
t14_152.gun = {
  ...t14_152.gun, caliberMm: 152, reloadS: 8.5, baseAccuracy: 0.30, aimTimeS: 1.8, soundProfile: '2a83',
  shells: rounds('2A83', [[1000, 920, 840], 740, 18], [860, 680, 10], [900, 12]),
};
t14_152.armor.gunPivot = [0, T14_152_GUN_FRAME.trunnionY - 1.69, T14_152_GUN_FRAME.trunnionZ + 0.22];
t14_152.armor.gunBarrel = { lengthM: T14_152_GUN_FRAME.muzzleZ - T14_152_GUN_FRAME.trunnionZ, radiusM: 0.135 };
t14_152.visual = { ...t14_152.visual, number: '152' };

registerFleetSpecs(registries, RUSSIA_152_IDS, { object292, object477_molot: molot, object195, t14_152 });
