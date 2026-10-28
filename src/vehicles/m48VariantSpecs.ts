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

const magach3 = m48('magach3', 'Magach 3', 'Israel');
Object.assign(magach3.dims, { hullLengthM: 6.87, overallLengthM: 9.31, widthM: 3.63, heightM: 2.95 });
Object.assign(magach3, { weightTons: 49.1, topSpeedKmh: 48 });
magach3.armor.hullPlates.push(reactivePlate('magach3_glacis_era', 'front', BLAZER));
magach3.armor.turretPlates.push(
  reactivePlate('magach3_turret_era_L', 'left', BLAZER),
  reactivePlate('magach3_turret_era_R', 'right', BLAZER),
);
magach3.visual = { ...magach3.visual, marking: 'number', number: '3' };

const ga2 = m48('m48a2ga2', 'Kpz M48A2GA2', 'Germany');
Object.assign(ga2.dims, { hullLengthM: 6.87, overallLengthM: 9.30, widthM: 3.63, heightM: 3.16 });
Object.assign(ga2, { weightTons: 48, topSpeedKmh: 48 });
ga2.visual = { ...ga2.visual, marking: 'number', number: '211' };

const sup = m48('m48_super', 'M48 Super', 'Germany');
Object.assign(sup.dims, { hullLengthM: 6.87, overallLengthM: 9.30, widthM: 3.75, heightM: 3.16 });
Object.assign(sup, { weightTons: 53, topSpeedKmh: 48 });
sup.visual = { ...sup.visual, marking: 'number', number: '1' };

registerFleetSpecs(registries, ['m48a3_patton', 'magach3', 'm48a2ga2', 'm48_super'],
  { m48a3_patton: m48a3, magach3, m48a2ga2: ga2, m48_super: sup });
