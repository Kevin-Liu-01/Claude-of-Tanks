// The Centurion Mk 5 AVRE (release 262; the owner, 2026-10-27: "add ... centurion mk 5 avre (extra era special turret,
// dozer)"): the Royal Engineers' FV4003 (about 40 on Mk 5 hulls, 1963-91) with the 165 mm L9A1 demolition gun firing a
// 29 kg HESH round and the FV4019 dozer blade, as twelve went to the Gulf in 1991 with reactive armour added (tanks-
// encyclopedia, FV4003; Wikipedia, Royal Ordnance L9; the Commons photographs). Built as the family's 'avre' mark
// (profiles/centurionFamily.ts; docs/references/tanks/centurion5_avre.md). It clones the Mk 5/2 (hull, turret, armour,
// Meteor) with its own gun; its reactive cassettes are consumable plates the combat-anatomy generator fits to the drawn
// courses. A demolition gun is measured in its own balance cohort, not against the tier's tank guns. The Mk 5/2's coat.
import './classicFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { reactivePlate } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
/** The Gulf AVREs' cassettes (ROMOR-A class): a shaped-charge layer with a small kinetic effect. */
const ROMOR = Object.freeze({ keReduction: 0.10, ceFlatMm: 350 });

const spec = cloneFleetVariant(registries.tankSpecs, 'centurion5_avre', 'centurion5_2', { name: 'Centurion Mk 5 AVRE', nation: 'UK', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// the family hull with the blade carried raised ahead of the nose (8.00 m over its lip), 3.39 m over the side plates and the
// blade, 3.0 m to the cupola
Object.assign(spec.dims, { hullLengthM: 7.56, overallLengthM: 8.00, widthM: 3.39, heightM: 3.0 });
Object.assign(spec, { hp: 1900, weightTons: 51.8, enginePowerHp: 880, topSpeedKmh: 35, reverseSpeedKmh: 12, balanceCohort: 'demolition-gun' });
spec.armor.gunBarrel = { lengthM: 2.78, radiusM: 0.105 };
spec.armor.hullPlates.push(reactivePlate('centurion5_avre_glacis_era', 'front', ROMOR));
spec.armor.turretPlates.push(
  reactivePlate('centurion5_avre_turret_era_L', 'left', ROMOR),
  reactivePlate('centurion5_avre_turret_era_R', 'right', ROMOR),
);
// the L9A1: one 29 kg HESH round, slow to load by hand, a low arc
spec.gun = {
  ...spec.gun, caliberMm: 165, reloadS: 20, baseAccuracy: 0.55, aimTimeS: 3.4,
  bloom: { move: 0.21, hullRot: 0.21, turret: 0.13, afterShot: 2.8 },
  shells: [
    { name: 'L37 HESH', type: 'HE', caliberMm: 165, pen100Mm: 165, pen1000Mm: 165, dmg: 1150, velocityMps: 259, moduleDmg: 165, tracer: 'HE' },
  ],
};
spec.visual = { ...spec.visual, number: '43' };

registerFleetSpecs(registries, ['centurion5_avre'], { centurion5_avre: spec });
