// The Christian II (release 262): a fictional Danish Army concept MBT, the Type 90 X's hull, running gear, turret and
// Rh 120 L/44 with bolted side modules and heavy field netting (profiles/christian2.ts; docs/references/tanks/christian2.md,
// docs/references/concepts/christian2-20261027.json). The owner, 2026-10-27: "base off of that type 90". Its spec clones
// `type90` here, once it exists (sourceXSecondWaveSpecs.ts): its armour, frame and gun rig, the bustle autoloader's
// three-round cycle, with the Christian II's own stats, round, number and paint, and the side modules' spaced plates.
import './sourceXSecondWaveSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { christian2SideModulePlates } from './christian2Armor.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'christian2', 'type90', { name: 'Christian II', nation: 'Denmark' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
// type90's silhouette rows are its source oracle's measurements; the concept has no oracle of its own.
stripSilhouetteDimensions(spec.dims);
// the built vehicle: the Type 90 X hull 7.80 m, 9.80 m over the gun, 3.62 m over the skirts, roof 2.46 m
Object.assign(spec.dims, { hullLengthM: 7.798844, overallLengthM: 9.80, widthM: 3.61781384, heightM: 2.459472 });
// 2020s concept: the side modules and the suit's frames put 3.8 t on the Type 90's 50.2 t; a 1,500 hp pack and a
// slightly slower pivot; a 3-round bustle cycle a little quicker than the Type 90's, firing a DM53-class APFSDS.
Object.assign(spec, {
  hp: 2450, enginePowerHp: 1500, weightTons: 54.0, topSpeedKmh: 68, reverseSpeedKmh: 30,
  hullTraverseDegS: 48, turretTraverseDegS: 42, gunPitchDegS: 34,
});
spec.gun = {
  ...spec.gun,
  reloadS: 17.0, baseAccuracy: 0.28, aimTimeS: 1.65,
  autoloader: { magazineSize: 3, intraClipS: 2.1, fullReloadS: 17.0 },
  shells: spec.gun.shells.map((shell) => shell.type === 'APFSDS'
    ? { ...shell, name: 'DM53A1 APFSDS', pen100Mm: 855, pen1000Mm: 778, pen2000Mm: 700, dmg: 530, velocityMps: 1750 }
    : shell),
};
spec.visual = {
  ...spec.visual,
  // its own Danish tri-tone: olive ground with black-green, brown and a pale grey-green (one patch colour more than the
  // NATO coats, so it stays its own catalog paint)
  scheme: 'nato', base: '#45503a', weather: '#58604a', patches: ['#24291f', '#6b5a40', '#7b8263'],
  marking: 'number', number: '21', camoScale: 0.46,
};
spec.armor.turretPlates.push(...christian2SideModulePlates());

registerFleetSpecs(registries, ['christian2'], { christian2: spec });
