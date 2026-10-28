// The Leopard 1A1 (release 263; the owner, 2026-10-28: "keep ur new leopard variants and make one that uses the old
// hull and has like a rounder 'unarmored' version that looks more like the world of tanks leopard 1", then "the old
// turret is still bad and the new turret for leopard is better, but need it to look accurate"): the Bundeswehr's
// first-series Leopard 1 with the 1A1's thermal sleeve and rubber skirts, before the Blohm & Voss appliqué of the
// 1A1A1. It keeps the Leopard 1A5's pre-262 hull and running gear and carries the bare cast turret
// (profiles/leopard1A1.ts; docs/references/tanks/leo1a1.md). It clones the 1A5 (the L7A3, the hull's armour) with the
// thinner bare casting and the 1A1's period round.
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'leo1a1', 'leo1a5', { name: 'Leopard 1A1', nation: 'Germany', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
// The 1A5's measured curve belongs to its own turret and hull; the 1A1's is swept for its casting on the old hull.
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
// 40.0 t; 3.25 m over the tracks (3.37 m over the skirts); 2.39 m to the turret roof, 2.61 m over the cupola.
Object.assign(spec.dims, { hullLengthM: 7.09, overallLengthM: 9.54, widthM: 3.37, heightM: 2.61 });
Object.assign(spec, { weightTons: 40.0, hp: 1450 });
// The bare casting: no spaced plates over the cheeks, sides or mantlet.
for (const plate of spec.armor.turretPlates) {
  if (plate.kind === 'external') continue;
  plate.keMm = Math.round(plate.keMm * 0.8);
  plate.ceMm = Math.round(plate.ceMm * 0.8);
}
// DM23, the Bundeswehr's first 105 mm APFSDS (1979), in place of the 1A5's DM63.
spec.gun.shells[0] = { ...spec.gun.shells[0], name: 'DM23 APFSDS', pen100Mm: 404, pen1000Mm: 368, pen2000Mm: 331 };
spec.visual = { ...spec.visual, number: '211' };

registerFleetSpecs(registries, ['leo1a1'], { leo1a1: spec });
