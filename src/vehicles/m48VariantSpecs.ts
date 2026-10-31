// The M48s drawn on the M48A5's measured castings (release 266; the owner, 2026-10-28: "add the israeli m48 variant to
// israel and add a new m48 variant for the usa since its a really great modeel", then "also add the m48 super to germany
// as well as the kpfz m48 a2 g a2"). Each is a clone of the M48A5 row that shares its balanced package
// (fleetBalancePass) with what its mark changed; the geometry is profiles/pattonCast.ts `buildM48VariantCastSteps`, the
// sources docs/references/tanks/<id>.md.
// - m48a3_patton (USA): the M48A3 Mod B of Vietnam, an M48A1 rebuilt with the AVDS-1790-2A diesel, the 90 mm M41 and its
//   T-shaped deflector, the M1 cupola on its vision-block riser (8.68 m over the gun, 3.63 m wide, 48.5 t; AFV Database,
//   Wikipedia, Hunnicutt).
// - magach3 (Israel): the IDF's Magach 3 as at Sultan Yacoub in 1982 (now at Latrun), the 105 mm, the low Urdan cupola,
//   Blazer boxes on the turret and the glacis (49.1 t, 750 hp: the Kubinka placard).
// - m48a2ga2 (Germany): the Bundeswehr's M48A2C rebuilt by Wegmann in 1978-80 (650 tanks): the 105 mm L7A3 in its
//   thermal sleeve, a low cupola with the MG3, Wegmann dischargers, the petrol AV-1790 kept (9.30 m, 3.63 m, 3.16 m,
//   48.0 t, 825 hp: the Munster placard).
// - m48_super (Germany): Krauss-Maffei and Wegmann's 1994 demonstrator (five built, no buyer): the GA2 under bolted
//   composite plates and skirts, the MTU MB 837 of 1,000 hp, the MOLF 48 fire control (53 t: War Thunder, unverified).
import './supplementalFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { reactivePlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
/** Blazer: a shaped-charge layer with a small kinetic effect (the M60A3's and the Sabra's first-generation boxes). */
const BLAZER = Object.freeze({ keReduction: 0.08, ceFlatMm: 300 });

function m48(id: string, name: string, nation: string): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, 'm48a5_patton', { name, nation, era: 'cold-war' });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  // the A5's depression map is its own fittings' (each mark is swept on its own build)
  delete spec.gunPitchByYawDeg;
  stripSilhouetteDimensions(spec.dims);
  return spec;
}

const m48a3 = m48('m48a3_patton', 'M48A3 Patton', 'USA');
Object.assign(m48a3.dims, { hullLengthM: 6.87, overallLengthM: 8.69, widthM: 3.63, heightM: 3.12 });
Object.assign(m48a3, { weightTons: 48.5, topSpeedKmh: 48 });
m48a3.gun = { ...m48a3.gun, caliberMm: 90 };
m48a3.visual = { ...m48a3.visual, number: 'B23' };
// measured by tools/gun-depression-sweep.mjs (26 mm from the hull) on the release-266 build: the full -9 deg over the front
// 61 deg either side, the air cleaners and the engine deck over the rear
m48a3.gunPitchByYawDeg = [
  [0, -9], [61, -9], [63, -8.5], [67, -8], [71, -7.9], [111, -7.9], [115, -8.2], [118, -8.7], [119, -9], [122, -9],
  [123, -8.7], [124, -5], [125, -3.5], [126, -2.9], [128, -2.2], [135, -0.1], [136, 0.1], [145, 0.3], [149, 0.1],
  [150, 0], [151, -0.8], [152, -0.8], [153, -1], [154, -2.1], [155, -3.8], [157, -3.6], [158, -2.1], [159, -1.6],
  [160, -0.1], [161, 1], [162, 1.3], [180, 1.4]
];

const magach3 = m48('magach3', 'Magach 3', 'Israel');
Object.assign(magach3.dims, { hullLengthM: 6.87, overallLengthM: 9.31, widthM: 3.63, heightM: 2.95 });
Object.assign(magach3, { weightTons: 49.1, topSpeedKmh: 48 });
magach3.armor.hullPlates.push(reactivePlate('magach3_glacis_era', 'front', BLAZER));
magach3.armor.turretPlates.push(
  reactivePlate('magach3_turret_era_L', 'left', BLAZER),
  reactivePlate('magach3_turret_era_R', 'right', BLAZER),
);
magach3.visual = { ...magach3.visual, marking: 'number', number: '3' };
// measured by tools/gun-depression-sweep.mjs on the release-266 build (the Blazer on the glacis and the deck, the pleated
// boot)
magach3.gunPitchByYawDeg = [
  [0, -9], [28, -9], [34, -8.2], [36, -8.2], [39, -9], [61, -9], [63, -8.5], [67, -8], [71, -7.9], [111, -7.9],
  [115, -8.2], [118, -8.7], [119, -9], [122, -9], [123, -7.5], [124, -4.3], [125, -2.8], [126, -2.3], [129, -1.3],
  [133, -0.2], [138, 0.6], [140, 0.8], [147, 0.8], [150, 0.2], [151, -0.6], [152, -0.6], [153, -0.8], [155, -2.8],
  [157, -2.9], [161, 1.2], [162, 1.5], [165, 1.6], [166, 2.3], [167, 2.5], [180, 2.5]
];

const ga2 = m48('m48a2ga2', 'Kpz M48A2GA2', 'Germany');
Object.assign(ga2.dims, { hullLengthM: 6.87, overallLengthM: 9.30, widthM: 3.63, heightM: 3.16 });
Object.assign(ga2, { weightTons: 48, topSpeedKmh: 48 });
ga2.visual = { ...ga2.visual, marking: 'number', number: '211' };
// measured by tools/gun-depression-sweep.mjs on the release-266 build (the squared shield block over the ring face); over
// the rear (yaw 158-180) the block stands within 2.3 deg of the engine deck's grilles where the barrel alone would depress
// further: the curve follows the barrel there (the sweep's mount-conflict window)
ga2.gunPitchByYawDeg = [
  [0, -9], [23, -9], [24, -8.9], [25, -8.1], [35, -7.6], [36, -7.6], [39, -8.5], [46, -8.5], [47, -7.8], [48, -6.2],
  [49, -5], [50, -4.3], [51, -3.9], [52, -3.6], [54, -3.1], [56, -3.1], [57, -3.3], [58, -3.6], [59, -4.3], [63, -4.5],
  [68, -5.1], [69, -5.3], [71, -6], [75, -9], [105, -9], [106, -8.3], [107, -6.9], [108, -4.4], [109, -3.5],
  [110, -2.9], [112, -2.9], [113, -3], [118, -4.5], [120, -2.9], [121, -2], [123, -1.1], [124, -0.9], [126, -0.9],
  [128, -1.5], [130, -3.1], [140, -3.1], [141, -2.2], [147, -0.5], [149, -0.5], [155, -2.2], [156, 0.6], [159, 0.8],
  [161, 2.4], [163, 3.2], [164, 3.3], [180, 3.3]
];

const sup = m48('m48_super', 'M48 Super', 'Germany');
Object.assign(sup.dims, { hullLengthM: 6.87, overallLengthM: 9.30, widthM: 3.75, heightM: 3.16 });
Object.assign(sup, { weightTons: 53, topSpeedKmh: 48 });
sup.visual = { ...sup.visual, marking: 'number', number: '1' };
// measured by tools/gun-depression-sweep.mjs on the release-266 build: the armour plate over the mantlet holds the gun
// up over the front fender bins abeam
sup.gunPitchByYawDeg = [
  [0, -9], [21, -9], [22, -5.4], [23, -4.7], [24, -4.6], [28, -4.6], [29, -4.7], [30, -5], [33, -7.7], [36, -7.6],
  [37, -7.9], [38, -8.4], [41, -8.3], [55, -8.3], [56, -6], [59, -4.6], [65, -4.6], [66, -4.8], [67, -7.3], [68, -8],
  [71, -7.9], [106, -7.9], [107, -2.8], [108, -1.1], [110, -1.1], [111, -7.9], [124, -8.3], [125, -7], [127, -5.4],
  [129, -5.4], [130, -5.7], [132, -6.8], [134, -6.3], [136, -6.2], [138, 0], [139, 0.4], [148, 0.6], [153, 1.4],
  [157, 1.7], [160, 1.7], [161, 2.4], [163, 3.2], [164, 3.3], [180, 3.3]
];

registerFleetSpecs(registries, ['m48a3_patton', 'magach3', 'm48a2ga2', 'm48_super'],
  { m48a3_patton: m48a3, magach3, m48a2ga2: ga2, m48_super: sup });
