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
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
spec.armor = leo2a3B4Armor();
spec.visual = { ...spec.visual, number: '232' };

registerFleetSpecs(registries, ['leo2a3_b4'], { leo2a3_b4: spec });
