// The Olifant Mk 2 (release 262; the owner, 2026-10-27: "add ... olifant mk2 (special turret with remote control machine
// gun and optics)"): the South African Army's Centurion derivative of 2007 (LIW/Denel; 26 built): the Mk 1B's hull on
// torsion bars with its armoured skirts and the Continental AV-1790 diesel of 1,040 hp, under a new turret of modular
// composite armour with a stabilised commander's thermal sight on a post and the 105 mm GT-3B with its thermal sleeve
// (tanks-encyclopedia, Olifant Mk 2; Wikipedia, Olifant; the Commons photographs). No source shows a remote-controlled
// machine gun: the loader's pintle 7.62 mm is the Mk 1B's documented anti-aircraft gun. Built as the family's
// 'olifant_mk2' mark (profiles/centurionFamily.ts; docs/references/tanks/olifant_mk2.md). It clones the Mk 5/2 and flies
// South Africa's flag (owner 2026-10-28: "do it then"), drawn in the UK tree's special lane beside the Centurions it
// came from; its own package: the diesel, the composite turret, the stabilised fire control and the GT-3B's modern
// APFSDS. The SANDF's three-tone coat.
import './classicFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'olifant_mk2', 'centurion5_2', { name: 'Olifant Mk 2', nation: 'South Africa', era: 'modern' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
stripSilhouetteDimensions(spec.dims);
// the family hull (the Commons profile's hull length to deck height matches the Centurion's; tanks-encyclopedia's 8.30 m
// is contested), 3.43 m over the armoured skirts, 2.63 m to the turret roof
Object.assign(spec.dims, { hullLengthM: 7.63, overallLengthM: 9.62, widthM: 3.43, heightM: 2.63 });
Object.assign(spec, { hp: 2050, weightTons: 60, enginePowerHp: 1040, topSpeedKmh: 58, reverseSpeedKmh: 20 });
// the composite turret and the glacis pack (the plates keep their names; the anatomy fits them to the drawn box)
for (const plate of spec.armor.turretPlates) {
  if (plate.name === 'turret_cheek_R' || plate.name === 'turret_cheek_L') Object.assign(plate, { keMm: 520, ceMm: 780 });
  if (plate.name === 'mantlet') Object.assign(plate, { keMm: 430, ceMm: 600 });
  if (plate.name === 'turret_side_R' || plate.name === 'turret_side_L') Object.assign(plate, { keMm: 200, ceMm: 320 });
}
for (const plate of spec.armor.hullPlates) {
  if (plate.name === 'upper_glacis') Object.assign(plate, { keMm: 400, ceMm: 520 });
  if (plate.name.startsWith('hull_side_')) Object.assign(plate, { keMm: 90, ceMm: 160 });
}
// the stabilised fire control and the GT-3B's rounds
spec.gun = {
  ...spec.gun, reloadS: 7.0, baseAccuracy: 0.25, aimTimeS: 1.8,
  shells: [
    { name: 'M1060 APFSDS', type: 'APFSDS', caliberMm: 105, pen100Mm: 520, pen1000Mm: 490, pen2000Mm: 460, dmg: 420, velocityMps: 1560, moduleDmg: 110, tracer: 'APFSDS' },
    { name: 'M9203 HEAT', type: 'HEAT', caliberMm: 105, pen100Mm: 400, pen1000Mm: 400, dmg: 440, velocityMps: 1170, moduleDmg: 120, tracer: 'HEAT' },
    { name: 'M1063 HE', type: 'HE', caliberMm: 105, pen100Mm: 60, pen1000Mm: 60, dmg: 520, velocityMps: 730, moduleDmg: 130, tracer: 'HE' },
  ],
};
// the SANDF's sand, green and brown
spec.visual = {
  ...spec.visual,
  scheme: 'woodland', base: '#a08e66', weather: '#ad9c76', patches: ['#5c6644', '#7a6142'],
  marking: 'number', number: '21', camoScale: 0.60,
};

registerFleetSpecs(registries, ['olifant_mk2'], { olifant_mk2: spec });
