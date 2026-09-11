import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createStructureClearances, excludeStructureVegetation, overlapsStructureClearance, excludeVegetation,
} from './vegetationClearance.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const toWorld = (site, x, z) => [
  site.x + x * site.cos + z * site.sin,
  site.z - x * site.sin + z * site.cos,
];
let checked = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  const sites = createStructureClearances(config.props.tacticalBeats, DESTRUCTIBLE_BUILDING_TYPES);
  assert.equal(sites.length, config.props.tacticalBeats.filter((beat) => beat.structure).length);
  for (const site of sites) {
    assert.ok(overlapsStructureClearance(sites, site.x, site.z, 0), `${id}: trunk inside roof rejected`);
    const branch = toWorld(site, site.halfWidth + 3.5, 0);
    assert.ok(overlapsStructureClearance([site], ...branch, 4), `${id}: crown overlap rejected`);
    assert.equal(overlapsStructureClearance([site], ...branch, 3), false,
      `${id}: nearby tree beyond eave/crown boundary remains`);
    const corner = toWorld(site, site.halfWidth + 3, site.halfLength + 3);
    assert.equal(overlapsStructureClearance([site], ...corner, 4), false,
      `${id}: rounded corner avoids excessive square yard clearance`);
    assert.ok(overlapsStructureClearance([site], ...corner, 4.3));
    checked++;
  }
}

const polders = getMapConfig('polders');
const pump = polders.props.tacticalBeats.find((beat) => beat.id === 'tidegate-pump-yard');
assert.ok(pump.x > polders.terrain.village.x1 + 24,
  'regression is outside the existing village exclusion, not a camera-composition issue');
const sites = createStructureClearances([pump], DESTRUCTIBLE_BUILDING_TYPES);
const trees = [
  { x: 430, z: 450, radius: 3, id: 'outer-rim-no-obstacle' },
  { x: pump.x, z: pump.z, radius: 5, id: 'roof-tree' },
  { x: -340, z: 300, radius: 4, id: 'unaffected' },
  { x: pump.x + 1, z: pump.z - 1, radius: 0.6, id: 'sapling' },
];
const retained = [trees[0], trees[2]];
const obstacles = [{ treeIdx: 1, id: 'roof' }, { treeIdx: 2, id: 'keep' }, { treeIdx: 3, id: 'sapling' }];
const concealment = [{ id: 'roof' }, { id: 'keep' }, { id: 'sapling' }];
assert.equal(excludeStructureVegetation(trees, obstacles, concealment, sites, (tree) => tree.radius), 2);
assert.deepEqual(trees, retained, 'unaffected candidate objects and order remain exact');
assert.deepEqual(obstacles, [{ treeIdx: 1, id: 'keep' }], 'topple indices point at compacted tree slots');
assert.deepEqual(concealment, [{ id: 'keep' }], 'no invisible roof-tree spotting concealment survives');
assert.equal(excludeStructureVegetation(trees, obstacles, concealment, sites, (tree) => tree.radius), 0,
  'repeated clearance is idempotent');
assert.throws(() => excludeStructureVegetation(trees, obstacles, [], sites, () => 1), /before non-tree/);
assert.deepEqual(createStructureClearances([{ x: 1, z: 2 }], DESTRUCTIBLE_BUILDING_TYPES), []);

const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const finalPlacement = source.indexOf('  placeSaplings();');
const filter = source.indexOf('    rejectedTrees: excludeStructureVegetation(');
const pools = source.indexOf('  function createTreeMeshPools(');
const decals = source.indexOf('  createTreeRootDecals();');
assert.ok(finalPlacement < filter && filter < pools && filter < decals,
  'every mature/belt/rim/sapling candidate is filtered before visual/root-decal allocation');
assert.match(source, /tree\.cr \+ Math\.sin\(TREE_ARCHETYPES\[tree\.species\]\.leanMaxRad\) \* \(tree\.fallH \?\? 0\)/,
  'clearance includes canopy width and maximum trunk lean, not just trunk collision radius');
console.log(`vegetationClearance.selftest: ${checked} oriented structure envelopes; collision/spotting/index compaction passes`);

// Authored donor metadata must keep physical identity through later filtering.
const donorTrees = [{id:'removed-first'}, {id:'donor-a'}, {id:'removed-donor'}, {id:'donor-b'}];
const donorA = donorTrees[1], donorB = donorTrees[3];
const donorReceipts = [{treeIndices:[1,2,3], accepted:3, unsafe:0}];
assert.equal(excludeVegetation(donorTrees, [], [], tree=>tree.id.startsWith('removed'), donorReceipts),2);
assert.deepEqual(donorReceipts,[{treeIndices:[0,1], sourceTreeIndices:[1,2,3], accepted:2, unsafe:1}]);
assert.equal(donorTrees[donorReceipts[0].treeIndices[0]], donorA);
assert.equal(donorTrees[donorReceipts[0].treeIndices[1]], donorB);
assert.equal(excludeVegetation(donorTrees, [], [], ()=>false, donorReceipts),0);
assert.deepEqual(donorReceipts[0].sourceTreeIndices,[1,2,3]);
assert.equal(donorReceipts[0].unsafe,1,'repeat filtering cannot count the same removed donor twice');
