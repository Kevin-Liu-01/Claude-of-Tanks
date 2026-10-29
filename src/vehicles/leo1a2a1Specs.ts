// The Leopard 1A2A1 (release 263; the owner, 2026-10-28: a Leopard 1 on the old hull "that looks more like the world of
// tanks leopard 1", then "make it based off the 1a5 more with a slightly rounded corners and the correct mantlet"): the
// 262 Leopard 1A5's turret lines cast as one with rounded corners and no bolts, its chevron mask closing to a line, the
// thermal sleeve and rubber skirts, and the Munster 1A2A1's PERI R12. It keeps the Leopard 1A5's pre-262 hull and running
// gear (profiles/leopard1A2A1.ts; docs/references/tanks/leo1a2a1.md) and clones the 1A5 (the L7A3, the hull's armour)
// with the thinner turret armour and the period round.
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'leo1a2a1', 'leo1a5', { name: 'Leopard 1A2A1', nation: 'Germany', era: 'cold-war' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
// Its own depression curve, measured on its casting and the old hull (tools/gun-depression-sweep.mjs, 26 mm; no
// mount conflict): the full -9 degrees but for the bow's width rods at 26-31 and the stern deck, exhaust and fuel cans aft
// of 149 degrees.
spec.gunPitchByYawDeg = [[0, -9], [25, -9], [27, -7.7], [28, -7.6], [30, -7.6], [31, -8], [32, -9], [149, -9],
  [154, -6.8], [155, -5.6], [158, -3.9], [159, -3.5], [164, -3.4], [165, -2.5], [166, -2.1], [167, -1.8], [172, -1.8],
  [175, -3], [180, -3]];
stripSilhouetteDimensions(spec.dims);
// About 40 t; 3.25 m over the tracks (3.37 m over the skirts); 2.39 m to the turret roof, 2.70 m over the PERI R12.
Object.assign(spec.dims, { hullLengthM: 7.09, overallLengthM: 9.54, widthM: 3.37, heightM: 2.70 });
Object.assign(spec, { weightTons: 40.0, hp: 1450 });
// No spaced plates: the 1A5's lines are one casting here, so its turret armour is the casting's alone.
for (const plate of spec.armor.turretPlates) {
  if (plate.kind === 'external') continue;
  plate.keMm = Math.round(plate.keMm * 0.8);
  plate.ceMm = Math.round(plate.ceMm * 0.8);
}
// DM23, the Bundeswehr's first 105 mm APFSDS (1979), in place of the 1A5's DM63.
spec.gun.shells[0] = { ...spec.gun.shells[0], name: 'DM23 APFSDS', pen100Mm: 404, pen1000Mm: 368, pen2000Mm: 331 };
spec.visual = { ...spec.visual, number: '211' };

registerFleetSpecs(registries, ['leo1a2a1'], { leo1a2a1: spec });
