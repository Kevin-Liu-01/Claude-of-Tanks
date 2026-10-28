// The Leopard 2A3 of the fourth batch (release 262): a fresh first-party build on the release's Leopard 2-pattern hull
// with its own vertical-faced turret (profiles/leopard2a3B4.ts; docs/references/tanks/leo2a3_b4.md). It carries the
// current 2A3's combat data (Main 2026-10-27: "at tier IV with the current 2A3's combat data"): the stats, the gun and
// its rounds, the paint, cloned from leo2a3 (shown since 262 as the "Leopard 2A2 OTCO"), the 260 balance trims applied
// beside it (fleetBalancePass.ts), and the 2A2's basic armour package on its own drawn hull and turret.
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
