// The Type 90 (B): the production Type 90 (`type90`, the independent X build of sourceXSecondWaveSpecs.ts) built ready
// for the Type 92 mine-clearing roller (profiles/type90B.ts). Owner 2026-10-31 ("add a type 90 b esp with that awesome
// machine gun"; Main: a variant at its parent's tier, the kit its difference). Japan's pack registers before the
// second-wave X builds, so the B clones `type90` here, once it exists: the Type 90's armour, frame and gun rig, with the
// roller's mounting plate and its own number.
import './sourceXSecondWaveSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { type90bRollerPlate } from './type90bArmor.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

const spec = cloneFleetVariant(registries.tankSpecs, 'type90b', 'type90', { name: 'Type 90 (B)', nation: 'Japan' });
// its combat is its own (fleetBalancePass.ts sets its clip with the Type 90's), not re-mirrored from the Kyū-maru donor
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
// type90's silhouette rows are its source oracle's measurements; the B has no oracle of its own (its photo packet,
// docs/references/photos/type90b-20261031.json, proves its dimensions).
stripSilhouetteDimensions(spec.dims);
// Its one combat difference (Main 2026-10-31): the roller's 10 mm mounting plate, spaced over the lower front plate
// (type90bArmor.ts; profiles/type90B.ts draws it from the same datums). Mobility, hit points and the clip are the Type 90's
// (fleetBalancePass.ts).
spec.armor.hullPlates.push(type90bRollerPlate());
// The JGSDF's two-tone in large bands, olive drab under dark chocolate brown, as the Type 90 photographs show it (267, the
// photo critic: the family's sage green with small tan blobs read as no JGSDF coat)
spec.visual = { ...spec.visual, scheme: 'stripes', base: '#4a5132', weather: '#5a6141', patches: ['#3d2f23', '#33402a'],
  camoScale: 0.72, marking: 'number', number: '42' };

registerFleetSpecs(registries, ['type90b'], { type90b: spec });
