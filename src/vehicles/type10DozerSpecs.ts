// The Type 10 Kaitaku (開拓, land-clearing; the id keeps its first name, type10_dozer): the modern Type 10 (`type10`, the independent X build of sourceXSecondWaveSpecs.ts) carrying the
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
// breaching tank. Paint (owner 2026-11-02: the digital woodland "is terrible"; the Type 10's service bands, "obv ...
// more distinct", in "the type 90bs dark camo"): the JGSDF bands on the Type 90 (B)'s dark olive, with a warm brown and a
// near-black green.
const spec = cloneFleetVariant(registries.tankSpecs, 'type10_dozer', 'type10', { name: 'Type 10 Kaitaku', nation: 'Japan' });
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
  scheme: 'stripes', base: '#383c2b', weather: '#444838', patches: ['#4a3a29', '#262b1f'],
  marking: 'number', number: '24', camoScale: 0.5,
};

// Owner 2026-10-22 ("side armor and turret armor"): the field kit's bolted modules are spaced armour over their faces.
const applique = type10DozerAppliquePlates();
spec.armor.hullPlates.push(...applique.hullPlates);
spec.armor.turretPlates.push(...applique.turretPlates);

registerFleetSpecs(registries, ['type10_dozer'], { type10_dozer: spec });
