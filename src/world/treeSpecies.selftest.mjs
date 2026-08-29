import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { isTreeSpecies, TREE_ARCHETYPES, TREE_SPECIES } from './treeSpecies.ts';

assert.equal(TREE_SPECIES.length, 13, 'fleet exposes thirteen distinct procedural tree archetypes');
assert.equal(new Set(TREE_SPECIES).size, TREE_SPECIES.length, 'tree archetype ids stay unique');

for (const species of TREE_SPECIES) {
  assert.equal(isTreeSpecies(species), true, `${species}: registry type guard accepts the species`);
  const archetype = TREE_ARCHETYPES[species];
  for (const [field, value] of Object.entries(archetype)) {
    if (field === 'family') continue;
    assert.ok(Number.isFinite(value) && value > 0, `${species}.${field}: finite positive proportion`);
  }
  assert.ok(archetype.canopyCenterM < archetype.fallHeightM,
    `${species}: canopy is carried below the authored fall length`);
}
assert.equal(isTreeSpecies('telephone-pole'), false, 'non-tree ids stay outside the registry');

const signatures = new Set();
const usedSpecies = new Set();
for (const mapId of MAP_IDS) {
  const vegetation = getMapConfig(mapId).vegetation;
  assert.ok(vegetation.species.length >= 3,
    `${mapId}: biome declares at least three distinct tree archetypes`);
  assert.equal(new Set(vegetation.species).size, vegetation.species.length,
    `${mapId}: biome species list has no duplicates`);
  const declared = new Set(vegetation.species);
  for (const species of declared) {
    assert.equal(isTreeSpecies(species), true, `${mapId}: ${species} is a registered tree`);
    usedSpecies.add(species);
  }
  for (const [mixName, mix] of [
    ['clusterMix', vegetation.clusterMix],
    ['loneMix', vegetation.loneMix],
    ['rimMix', vegetation.rimMix],
  ]) {
    assert.ok(mix.length >= 2, `${mapId}.${mixName}: placement does not collapse to one silhouette`);
    assert.ok(mix.every(([species, weight]) => declared.has(species)
      && Number.isFinite(weight) && weight > 0),
    `${mapId}.${mixName}: weights are positive and reference declared species`);
  }
  assert.ok(declared.has(vegetation.bushSpecies),
    `${mapId}: bush archetype is included in its biome declaration`);
  signatures.add(vegetation.species.join('|'));
}

assert.deepEqual([...usedSpecies].sort(), [...TREE_SPECIES].sort(),
  'the battlefield roster uses every procedural tree archetype');
assert.ok(signatures.size >= 16,
  'the twenty battlefields retain strongly differentiated vegetation signatures');

console.log('treeSpecies.selftest: thirteen archetypes and twenty biome mixes passed');
