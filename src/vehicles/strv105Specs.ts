// The Strv 105 (release 262; the owner, 2026-10-27: "add the strv 105 (special turret, era, machine gun, gun)"): the one
// Swedish prototype of 1994, a Strv 104 (a Strv 102 rebuilt by Hägglunds in 1984-87 with FFV reactive armour, the
// Continental AVDS-1790-2DC and the L7) given a new suspension, a thermal sight beside the gun and a new driver's hatch
// (Swedish Wikipedia, Stridsvagn 104 and 105; the Skaraborg photograph), dropped for the Leopard 2. Built as the family's
// 'strv105' mark (profiles/centurionFamily.ts; docs/references/tanks/strv105.md). It clones the Centurion Mk 5/2 (hull,
// turret, L7) and shares its balanced package (fleetBalancePass) with its own diesel; the Strv 104's FFV cassettes are
// consumable plates the combat-anatomy generator fits to the drawn courses. The Strv 81's Swedish coat.
import './classicFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { reactivePlate } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
/** FFV's first-generation cassettes: a shaped-charge layer with a small kinetic effect (as the M60A3's Blazer). */
const FFV = Object.freeze({ keReduction: 0.08, ceFlatMm: 300 });

const spec = cloneFleetVariant(registries.tankSpecs, 'strv105', 'centurion5_2', { name: 'Strv 105', nation: 'Sweden', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// the family hull (7.56 m; the Strv 104's 7.823 m is the Mk 10 figure, not drawn), 3.39 m over the side plates, 3.01 m to
// the cupola; 56 t with its cassettes
Object.assign(spec.dims, { hullLengthM: 7.56, overallLengthM: 9.62, widthM: 3.39, heightM: 3.01 });
Object.assign(spec, { weightTons: 56, topSpeedKmh: 50, reverseSpeedKmh: 18 });
spec.armor.hullPlates.push(reactivePlate('strv105_glacis_era', 'front', FFV));
spec.armor.turretPlates.push(
  reactivePlate('strv105_turret_era_L', 'front', FFV),
  reactivePlate('strv105_turret_era_R', 'front', FFV),
  reactivePlate('strv105_turret_roof_era', 'top', FFV),
);
spec.visual = { ...TANK_SPECS.strv81.visual, number: '105' };

registerFleetSpecs(registries, ['strv105'], { strv105: spec });
