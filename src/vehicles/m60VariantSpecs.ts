// The IDF's M60s drawn on the M60A1's castings (the owner, 2026-10-28: "for the m60 new variants, lets add the: * Magach
// Series (Israel) ... (Magach 6 and Magach 7 families)"). Each is a clone of the M60A1 row that shares its balanced
// package (fleetBalancePass) with what its mark changed; the geometry is profiles/pattonCast.ts `buildM60CastSteps`
// ('magach6b', 'magach7c'), the sources docs/references/tanks/<id>.md and the Latrun photographs.
// - magach6b (Israel): an M60A1 rebuilt with Blazer boxes on the turret and the glacis, the low Urdan cupola, the
//   thermal-sleeved 105 mm, the .50 over the gun, the IDF basket (the Yad la-Shiryon tank).
// - magach7c (Israel): the Magach 7 of the late 1980s, the turret and the glacis under flat passive armour, deep
//   bolted skirts, the Urdan cupola and its .50, the AVDS-1790-5A of 908 hp (the Yad la-Shiryon Magach 7C).
import './supplementalFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { reactivePlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
/** Blazer: a shaped-charge layer with a small kinetic effect (the Magach 3's and the Sabra's first-generation boxes). */
const BLAZER = Object.freeze({ keReduction: 0.08, ceFlatMm: 300 });

function magach(id: string, name: string): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, 'm60a1', { name, nation: 'Israel', era: 'cold-war' });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  // the A1's depression map is its own fittings' (each mark is swept on its own build)
  delete spec.gunPitchByYawDeg;
  stripSilhouetteDimensions(spec.dims);
  return spec;
}

const m6b = magach('magach6b', 'Magach 6B');
Object.assign(m6b.dims, { hullLengthM: 6.95, overallLengthM: 9.44, widthM: 3.63, heightM: 3.05 });
Object.assign(m6b, { weightTons: 51, topSpeedKmh: 48 });
m6b.armor.hullPlates.push(reactivePlate('magach6b_glacis_era', 'front', BLAZER));
m6b.armor.turretPlates.push(
  reactivePlate('magach6b_turret_era_L', 'left', BLAZER),
  reactivePlate('magach6b_turret_era_R', 'right', BLAZER),
);
m6b.visual = { ...m6b.visual, marking: 'number', number: '6' };

const m7c = magach('magach7c', 'Magach 7C');
Object.assign(m7c.dims, { hullLengthM: 6.95, overallLengthM: 9.44, widthM: 3.80, heightM: 3.05 });
Object.assign(m7c, { weightTons: 55, topSpeedKmh: 48 });
m7c.visual = { ...m7c.visual, marking: 'number', number: '7' };

registerFleetSpecs(registries, ['magach6b', 'magach7c'], { magach6b: m6b, magach7c: m7c });
