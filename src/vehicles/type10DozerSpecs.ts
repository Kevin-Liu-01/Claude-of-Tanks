// The Type 10 (Dozer): the modern Type 10 (`type10`, the independent X build of sourceXSecondWaveSpecs.ts) carrying the
// JGSDF dozer kit (profiles/type10Dozer.ts). Owner 2026-10-22: the kit belongs on the modern Type 10, not on the
// TK-X ("u applied it to the wrong next gen moodel instead of the 'modern' model"). Japan's pack registers before the
// second-wave X builds, so the dozer clones `type10` here, once it exists: type10's armour, frame and gun rig, with the
// dozer's own stats, number and paint.
import './sourceXSecondWaveSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { type10DozerAppliquePlates } from './type10DozerArmor.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

// Owner order 2026-10-21: the Type 10 fitted with the JGSDF dozer kit (ドーザ装置付き). Same gun, fire control and armour
// as the Type 10; the 2 t blade and its rams cost a little speed and pivot, and the bow blade makes it the family's
// breaching tank. Paint: the green digital of the owner's reference render (plate 99-0239).
const spec = cloneFleetVariant(registries.tankSpecs, 'type10_dozer', 'type10', { name: 'Type 10 (Dozer)', nation: 'Japan' });
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
// type10's silhouette rows are its source oracle's measurements; the dozer has no oracle of its own.
stripSilhouetteDimensions(spec.dims);
Object.assign(spec, {
  hp: 2650, enginePowerHp: 1200, weightTons: 50.0, topSpeedKmh: 66,
  reverseSpeedKmh: 30, hullTraverseDegS: 44, turretTraverseDegS: 46, gunPitchDegS: 36,
});
spec.visual = {
  ...spec.visual,
  scheme: 'digital', base: '#3e4b33', weather: '#545e43', patches: ['#1f271b', '#5e7040', '#735a3c'],
  marking: 'number', number: '24', camoScale: 0.40,
};

// Owner 2026-10-22 ("side armor and turret armor"): the field kit's bolted modules are spaced armour over their faces.
const applique = type10DozerAppliquePlates();
spec.armor.hullPlates.push(...applique.hullPlates);
spec.armor.turretPlates.push(...applique.turretPlates);

registerFleetSpecs(registries, ['type10_dozer'], { type10_dozer: spec });
