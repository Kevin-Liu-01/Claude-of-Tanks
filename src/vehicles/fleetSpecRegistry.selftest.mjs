import assert from 'node:assert/strict';
import {
  bindFleetRegistries,
  cloneFleetVariant,
  registerFleetSpecs,
  scaleNonExternalArmor,
  stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';

const donor = {
  id: 'donor', name: 'Donor', nation: 'Test', era: 'modern', role: 'mbt', hp: 1,
  enginePowerHp: 1, weightTons: 1, topSpeedKmh: 1, reverseSpeedKmh: 1,
  hullTraverseDegS: 1, terrainResistance: { hard: 1, medium: 1, soft: 1 },
  pivotStyle: 'neutral', turretTraverseDegS: 1, gunPitchDegS: 1,
  gunElevationDeg: 1, gunDepressionDeg: 1,
  gun: { caliberMm: 1, reloadS: 1, baseAccuracy: 1, aimTimeS: 1,
    bloom: { move: 1, hullRot: 1, turret: 1, afterShot: 1 }, shells: [] },
  dims: { hullLengthM: 1, overallLengthM: 1, widthM: 1, heightM: 1,
    silhouetteHeightM: 9 },
  armor: {
    boundingRadiusM: 1, turretPivot: [0, 0, 0], gunPivot: [0, 0, 0],
    gunBarrel: { lengthM: 1, radiusM: 1 },
    hullPlates: [
      { name: 'main', verts: [], physicalMm: 10, keMm: 10, ceMm: 20, kind: 'main' },
      { name: 'track', verts: [], physicalMm: 10, keMm: 10, ceMm: 20, kind: 'external' },
    ],
    turretPlates: [], modules: [], crew: [],
  },
  visual: { scheme: 'solid', base: '#000', weather: '#000', patches: [],
    marking: 'number', number: '1', trackWidthM: 1, camoScale: 1 },
  community: true,
};
const tankSpecs = { donor };
const modelSources = {};
const allTankIds = ['donor'];
const registries = bindFleetRegistries(tankSpecs, modelSources, allTankIds);
const variant = cloneFleetVariant(registries.tankSpecs, 'variant', 'donor', {
  name: 'Variant', nation: 'Typed',
});

assert.equal(variant.variantOf, 'donor');
assert.equal(variant.community, undefined);
assert.notEqual(variant, donor);
assert.notEqual(variant.armor, donor.armor);
stripSilhouetteDimensions(variant.dims);
assert.equal(variant.dims.silhouetteHeightM, undefined);
scaleNonExternalArmor(variant, 1.5);
assert.equal(variant.armor.hullPlates[0].keMm, 15);
assert.equal(variant.armor.hullPlates[0].ceMm, 30);
assert.equal(variant.armor.hullPlates[1].keMm, 10);

registerFleetSpecs(registries, ['variant'], { variant });
registerFleetSpecs(registries, ['variant'], { variant });
assert.equal(registries.tankSpecs.variant, variant);
assert.deepEqual(modelSources.variant, { source: 'procedural' });
assert.deepEqual(allTankIds, ['donor', 'variant']);
assert.throws(() => bindFleetRegistries(null, {}, []), /Fleet registries require/);
assert.throws(() => cloneFleetVariant(registries.tankSpecs, 'x', 'missing', {
  name: 'Missing', nation: 'Typed',
}), /Fleet donor missing/);
assert.throws(() => registerFleetSpecs(registries, ['missing'], {}), /Fleet spec missing/);
assert.throws(() => scaleNonExternalArmor(variant, 0), /Armor scale must be positive/);

console.log('fleetSpecRegistry.selftest: registry binding, clone, scaling, cleanup, and idempotent registration passed');
