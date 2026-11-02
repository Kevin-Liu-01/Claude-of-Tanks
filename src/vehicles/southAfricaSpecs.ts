// The South African Army line (release 269; the owner, 2026-11-02: "flesh out south african and australian tank trees";
// Main's ruling the same day, ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md): the Centurion as South Africa rebuilt
// it, from the Semel of 1974 to the Olifant Mk 1B of 1991 (the Mk 2 of 2007 stays in olifantMk2Specs.ts), each on the
// Centurion family's own mark (profiles/centurionFamily.ts; docs/references/tanks/olifant_mk1.md and the packets beside
// it). Combat data from published figures (tanks-encyclopedia's Olifant Mk I, Mk 1B and Mk 2 articles; army-technology;
// the SA Armour Museum), rounds and armour at the family's footing where no figure exists, as each comment says; the
// shown tiers by capability (II for the 20-pdr marks, III for the 105 mm marks beside the Sho't Kal and the Mk 2), the
// lineage never stepping down to the Mk 2.
import './classicFleetSpecs.ts';
import './olifantMk2Specs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { modernArmor } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const southAfrican = (id: string, donor: string, name: string, era: 'cold-war' | 'modern') => {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donor, { name, nation: 'South Africa', era, role: 'mbt' });
  // (each mark's own gun depression is measured on its build: tools/gun-depression-sweep.mjs)
  for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
  stripSilhouetteDimensions(spec.dims);
  return spec;
};

// The SADF's nutria brown of the 1970s and 1980s (the Angola and De Brug photographs; TE's Mk 1A "dark sand livery"): one
// flat coat, greyer and lighter than the Soviet plain brown, the tank's tactical number on the turret's side bin
const sadfBrown = (number: string) => ({ scheme: 'solid' as const, base: '#857356', weather: '#917f62', patches: [] as string[],
  marking: 'number' as const, number, camoScale: 0.55 });

// ------------------------------------------------------------------------------------------------------- Semel --
// 1974, 35 Centurion Mk 5s (TE: "Centurion Mk.5A"): the Skokiaan's Continental AVI-1790-8 fuel-injected petrol V12 of 810
// hp and its Allison CD-850-5 semi-automatic gearbox, hydraulic steering and brakes, about 1,400 litres of fuel, the air
// filters moved; the 20-pdr and the Mk 5's skirts kept. No published weight or speed: the Mk 5's 51.8 t, and the
// Olifant Mk 1's 45 km/h less the petrol engine's lower torque (42).
const semel = southAfrican('semel', 'strv81', 'Semel', 'cold-war');
Object.assign(semel.dims, { hullLengthM: 7.56, overallLengthM: 9.85, widthM: 3.39, heightM: 2.94 });
Object.assign(semel, { weightTons: 51.8, enginePowerHp: 810, topSpeedKmh: 42, reverseSpeedKmh: 13 });
semel.visual = { ...semel.visual, ...sadfBrown('11') };

// ------------------------------------------------------------------------------------------------- Olifant Mk 1 --
// 1978 (153 Centurion Mk 3s converted 1979-84; TE): the Teledyne Continental AVDS-1790-2A diesel of 750 hp and a
// semi-automatic gearbox, 56 t, 45 km/h; the 20-pdr kept with the new fire control and its laser rangefinder (the War
// Thunder forum's "The Earliest Elephant", from Venter), two banks of four 81 mm dischargers, the skirts off in the bush
// (the 1987-88 Angola photographs). Hull 7.56 x 3.39 (over the skirts) x 2.94 m (TE): 3.28 m over the guards with the
// skirts off, as the Australian Mk 5/1's.
const olifant_mk1 = southAfrican('olifant_mk1', 'strv81', 'Olifant Mk 1', 'cold-war');
Object.assign(olifant_mk1.dims, { hullLengthM: 7.56, overallLengthM: 9.85, widthM: 3.28, heightM: 2.94 });
Object.assign(olifant_mk1, { hp: 1500, weightTons: 56, enginePowerHp: 750, topSpeedKmh: 45, reverseSpeedKmh: 14 });
olifant_mk1.gun = { ...olifant_mk1.gun, baseAccuracy: 0.285, aimTimeS: 2.15 };
olifant_mk1.visual = { ...olifant_mk1.visual, ...sadfBrown('22') };

// ------------------------------------------------------------------------------------------------ Olifant Mk 1A --
// 1985 (TE; Wikipedia): the Mk 1 rearmed with the stabilised 105 mm, an Israeli L7 first and then the GT3 from Lyttelton
// Engineering Works, the Eloptro 8x gunner's sight with its laser rangefinder and a passive night sight; the 750 hp AVDS
// and its two-range transmission, 56 t, 45 km/h; the long bustle box, the net racks and the bush bar (the De Brug and
// Angola photographs). Its APFSDS a step under the Mk 2's (no published figure for the GT3's 1985 rounds).
const olifant_mk1a = southAfrican('olifant_mk1a', 'centurion5_2', 'Olifant Mk 1A', 'cold-war');
Object.assign(olifant_mk1a.dims, { hullLengthM: 7.56, overallLengthM: 9.62, widthM: 3.28, heightM: 2.94 });
Object.assign(olifant_mk1a, { hp: 1950, weightTons: 56, enginePowerHp: 750, topSpeedKmh: 45, reverseSpeedKmh: 14 });
olifant_mk1a.gun = {
  ...olifant_mk1a.gun, reloadS: 6.9, baseAccuracy: 0.28, aimTimeS: 1.95,
  shells: olifant_mk1a.gun.shells.map((shell, i) => i === 0
    ? { ...shell, name: 'GT3 APFSDS', pen100Mm: 500, pen1000Mm: 468, pen2000Mm: 436, dmg: 420, velocityMps: 1500 }
    : shell),
};
olifant_mk1a.visual = { ...olifant_mk1a.visual, ...sadfBrown('21A') };

// ------------------------------------------------------------------------------------------------ Olifant Mk 1B --
// 1991, 44 built by OMC (TE): the torsion-bar hull lengthened for the bigger engine compartment, a double floor, the
// armoured skirts; passive composite packs on the glacis and spaced add-on armour on the turret's front, sides and roof;
// the GT3B with its thermal sleeve and fume extractor, Reutech's fire control, the searchlight over the gun; 59 t, 58
// km/h; the Continental AVDS-1790 at 850 (TE), 900 (army-technology) or 950 hp (Wikipedia): 900. The Mk 2 conversion
// of 2007 kept this hull and armour and added the stabilised thermal sight and hunter-killer control, so the Mk 1B
// shoots slower to aim and a little less armour on the turret's cheeks than its successor's new composite turret.
const olifant_mk1b = southAfrican('olifant_mk1b', 'olifant_mk2', 'Olifant Mk 1B', 'cold-war');
Object.assign(olifant_mk1b, { hp: 2000, weightTons: 59, enginePowerHp: 900, topSpeedKmh: 58, reverseSpeedKmh: 18 });
for (const plate of olifant_mk1b.armor.turretPlates) {
  if (plate.name === 'turret_cheek_R' || plate.name === 'turret_cheek_L') Object.assign(plate, { keMm: 480, ceMm: 700 });
  if (plate.name === 'mantlet') Object.assign(plate, { keMm: 410, ceMm: 560 });
}
olifant_mk1b.gun = {
  ...olifant_mk1b.gun, reloadS: 7.0, baseAccuracy: 0.27, aimTimeS: 1.9,
  shells: olifant_mk1b.gun.shells.map((shell, i) => i === 0 ? { ...shell, pen100Mm: 510, pen1000Mm: 480, pen2000Mm: 450 } : shell),
};
// the SANDF's three-tone of the 1990s as the Tempe tank wears it: sand under a mid green and a dark green in broad soft
// patches (the blotch painter; the Mk 2's woodland coat is browner and its patches smaller); the TTD wore the same
olifant_mk1b.visual = {
  ...olifant_mk1b.visual,
  scheme: 'blotch', base: '#a7936b', weather: '#b3a07a', patches: ['#5d6a43', '#3e4a35'],
  marking: 'number', number: '31B', camoScale: 0.72, patchK: 2.0,
};

// ------------------------------------------------------------------------------------------------- Olifant TTD --
// Project Loggim's Tank Technology Demonstrator (one prototype, 1992; TE; the SA Armour Museum): hull 7.78 x 3.62 x 2.99
// m, 58.3 t, a twin-turbo V-8 diesel of 1,234 hp (920 kW), 71 km/h, four forward and two reverse gears, 360 degrees of
// traverse in under ten seconds, -10/+20 degrees; spaced multi-layer armour, 750 mm effective over the glacis; the 105
// mm GT3 for its trials (the 120 mm GT6 never fitted) with the Mk 2's rounds; the CS60N and GS60 stabilised sights with
// thermal, a laser rangefinder and hunter-killer control. The armour box is the build's (profiles/ttd.ts datums).
const ttd = southAfrican('ttd', 'olifant_mk2', 'Olifant TTD', 'modern');
Object.assign(ttd.dims, { hullLengthM: 7.78, overallLengthM: 9.41, widthM: 3.62, heightM: 2.99 });
Object.assign(ttd, { hp: 2200, weightTons: 58.3, enginePowerHp: 1234, topSpeedKmh: 71, reverseSpeedKmh: 30,
  hullTraverseDegS: 32, turretTraverseDegS: 36, gunElevationDeg: 20, gunDepressionDeg: 10 });
ttd.armor = modernArmor({
  hl: 3.89, hw: 1.68, inW: 1.00, floor: 0.50, trkTop: 0.89, roofY: 1.72,
  turretPivot: [0, 1.72, 0.40], gunPivot: [0, 0.52, 1.20], barrelLenM: 3.92, barrelRadM: 0.09,
  glacis: [450, 450, 650], lower: [140, 140, 180], side: [70, 70, 90], skirt: [40, 40, 140], rear: 35, roof: 30,
  tw: 1.45, tFrontZ: 1.60, tRearZ: -2.78, tH: 0.84,
  cheek: [520, 520, 740], tSide: [210, 210, 300], tRear: 50, tRoof: 40, mantlet: [400, 400, 560], loader: true, bustleAmmo: true,
});
ttd.gun = { ...ttd.gun, caliberMm: 105, reloadS: 6.4, baseAccuracy: 0.24, aimTimeS: 1.65 };
// the SANDF's three-tone as the demonstrator wore it, the Mk 1B's: sand under a mid green and a dark green in broad soft
// patches (the parade, mobility and museum photographs)
ttd.visual = {
  ...ttd.visual,
  scheme: 'blotch', base: '#ab976f', weather: '#b6a37d', patches: ['#5f6b45', '#3e4a35'],
  marking: 'number', number: '01', camoScale: 0.78, patchK: 2.0,
};

registerFleetSpecs(registries, ['semel', 'olifant_mk1', 'olifant_mk1a', 'olifant_mk1b', 'ttd'],
  { semel, olifant_mk1, olifant_mk1a, olifant_mk1b, ttd });
