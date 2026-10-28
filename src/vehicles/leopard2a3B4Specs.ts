// The early production Leopard 2s on the release's new construction (profiles/leopard2a3B4.ts; docs/references/tanks/
// leo2a3_b4.md): the hull and running gear of leopard2Hull.ts and one vertical-faced turret, in three batches.
// - leo2a3_b4, the Leopard 2A3 of the fourth batch: a new tank carrying the 2A3's combat data (Main 2026-10-27: "at
//   tier IV with the current 2A3's combat data"): the stats, the gun and its rounds, the paint, cloned from leo2a3, the
//   260 balance trims applied beside it (fleetBalancePass.ts), and the basic armour package on its own drawn hull and
//   turret.
// - leo2a2 (the 2A2) and leo2a3 (the 2A3 OTCO), rebuilt in place on the same construction (the owner, 2026-10-28: "all
//   based on our new leeopard 2 ... make a nnnew 2a2 and 2 nnnew 2a3 variannts, one of which is the otco"): their combat data
//   stands (the stats, the gun and rounds, the paint, the trims keyed to their ids); the drawn envelope and the measured
//   gun curves are this construction's. They are re-enveloped here, after classicFleetSpecs.ts made leopard2_proto from
//   leo2a2 and christian2Specs.ts cloned leo2a2's running template (fleetRegistration.ts's order), so neither moves.
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { leo2a3B4Armor } from './leopard2a3B4Armor.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'leo2a3_b4', 'leo2a3', { name: 'Leopard 2A3', nation: 'Germany' });
delete spec.variantOf;
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
spec.armor = leo2a3B4Armor();
// the gun's depression by turret yaw over its own hull, measured with tools/gun-depression-sweep.mjs at 26 mm (lane
// christian2-262): shallower over the headlight pods and up to level over the engine deck
spec.gunPitchByYawDeg = [[0, -9], [15, -9], [17, -7.5], [19, -7], [23, -6.6], [26, -6.6], [27, -6.9], [28, -7.6],
  [29, -8.8], [30, -9], [135, -9], [144, -5.3], [146, -3.6], [149, -2.6], [150, -1.4], [152, -0.3], [153, -0.1], [156, 0],
  [157, 0.6], [158, 0.9], [160, 0.9], [163, 0.1], [178, 0.1], [180, -0.4]];
spec.visual = { ...spec.visual, number: '232' };

registerFleetSpecs(registries, ['leo2a3_b4'], { leo2a3_b4: spec });

for (const id of ['leo2a2', 'leo2a3']) {
  const early = registries.tankSpecs[id];
  if (!early) throw new Error(`leopard2a3B4Specs: ${id} is not registered`);
  stripSilhouetteDimensions(early.dims);
  early.armor = leo2a3B4Armor();
  early.gunPitchByYawDeg = spec.gunPitchByYawDeg;
}
