import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { mulberry32 } from './vegetation.ts';
import { TREE_ARCHETYPES, treeTrunkCollisionRadiusM } from './treeSpecies.ts';
import { treeRootDecalRadius, treeRootDecalAreaM2 } from './treeGrounding.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';
import { setCircleShape } from './collision.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';
import { isClearOfSpawns } from './spawnClearance.ts';
import { createStructureClearances, excludeStructureVegetation, overlapsStructureClearance } from './vegetationClearance.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { authoredTreeStations, redistributeAuthoredTrees } from './authoredTreePlacement.ts';
import { SHORELINE_SEGMENTS, shorelineDistance, shorelineRadiusAt } from './shoreline.ts';
import polders from './maps/polders.ts';
import mangrove from './maps/mangrove.ts';
import orchard from './maps/orchard.ts';

// Exercise the ACTUAL seeded placement stage, with its real matrix/interaction
// records and real terrain. Skip unrelated canvas texture and grass work, not
// tree logic. This pattern is also used by vegetationResources.selftest.
const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const start = source.indexOf('  // Keep the authored random admission sequence');
const end = source.indexOf('  // near/far instanced meshes', start);
const noiseStart = source.indexOf('function treePositionNoise(');
const noiseEnd = source.indexOf('function _mustReplace(', noiseStart);
assert.ok(start > 0 && end > start && noiseEnd > noiseStart);
const dependencies = { THREE, mulberry32, TREE_ARCHETYPES, treeTrunkCollisionRadiusM, setCircleShape,
  PLAYABLE_HALF_EXTENT_M, isClearOfSpawns, createStructureClearances, excludeStructureVegetation,
  DESTRUCTIBLE_BUILDING_TYPES, redistributeAuthoredTrees };
const builder = new Function(...Object.keys(dependencies), `return ${stripTypeScriptTypes(`function* placement(heightField, cfg) {
  const seed = 2001, rng = mulberry32(seed), group = new THREE.Group();
  const veg = { parks: null, palettes: {}, avoid: null, ...cfg.vegetation };
  const speciesList = veg.species, treeGeo = Object.fromEntries(speciesList.map(sp => [sp, true]));
  const L = heightField._layout, v = L.village, noVeg = heightField._noVeg;
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qLean = new THREE.Quaternion();
  const _axLean = new THREE.Vector3(), _pv = new THREE.Vector3(), _sv = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
  const palOf = sp => veg.palettes[sp] || {};
  const inAvoid = (x,z) => veg.avoid?.some(a => Math.hypot(x-a.x,z-a.z)<a.r) || false;
  ${source.slice(noiseStart, noiseEnd)}
  ${source.slice(start, end)}
  return { trees, treeObstacles, concealers, clusters, group, nextRoll: rng() };
}`)}`)(...Object.values(dependencies));

function build(hf, cfg) {
  const generator = builder(hf, cfg);
  let next; do { next = generator.next(); } while (!next.done);
  return next.value;
}

// Instantiate the production pool allocator itself. Tiny stand-in primitive
// geometry avoids re-testing immutable species modelling, but buffer lengths
// and counts come from real InstancedMesh/InstancedBufferAttribute allocations.
const poolStart = source.indexOf('  function makeTreeMesh('), poolEnd = source.indexOf('  const nearMeshes', poolStart);
assert.ok(poolStart > end && poolEnd > poolStart);
const allocate = new Function('THREE', `return ${stripTypeScriptTypes(`function capacities(trees) {
  const group = new THREE.Group(), _whiteScratch = new THREE.Color(1,1,1), foliageDepthMats = {};
  ${source.slice(poolStart, poolEnd)}
  const capacity = Math.max(1, trees.filter(tree => tree.species === 'oak').length);
  const mesh = makeTreeMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 'oak', false, capacity);
  if (mesh.instanceMatrix.count !== capacity || mesh.instanceColor.count !== capacity
    || mesh.geometry.getAttribute('aFadeI').count !== capacity || mesh.geometry.getAttribute('aLodF').count !== capacity) {
    throw new Error('Production pool must allocate its explicit nonzero capacity');
  }
  const result = { matrix: mesh.instanceMatrix.array.byteLength, color: mesh.instanceColor.array.byteLength,
    fade: mesh.geometry.getAttribute('aFadeI').array.byteLength, lod: mesh.geometry.getAttribute('aLodF').array.byteLength };
  mesh.geometry.dispose(); mesh.material.dispose();
  return result;
}`)}`)(THREE);

// Execute the production decal builder. Only its unexamined Canvas2D pigment
// operations are stubbed; every position, index and terrain sample is real.
const decalStart = source.indexOf('  function createTreeRootDecals(');
const decalEnd = source.indexOf('  createTreeRootDecals();', decalStart);
const decals = new Function('THREE', 'mulberry32', 'treeRootDecalRadius', 'treeRootDecalAreaM2',
  `return ${stripTypeScriptTypes(`function roots(trees, heightField) {
    // This authored-placement checkpoint precedes tidal/road compaction.
    const rootDecalOrdinals = null;
    const seed = 2001, group = new THREE.Group();
    const document = { createElement: () => ({ width: 0, height: 0 }) };
    const context2d = () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} });
    ${source.slice(decalStart, decalEnd)}
    createTreeRootDecals();
    return group.children[0];
  }`)}`)(THREE, mulberry32, treeRootDecalRadius, treeRootDecalAreaM2);

const crushStart = source.indexOf('  function crushTree('), crushEnd = source.indexOf('  function updateTreeCrush(', crushStart);
const topple = new Function('THREE', 'setToppleAxis', 'settledToppleAngle',
  `return ${stripTypeScriptTypes(`function lifecycle(trees, treeObstacles, heightField) {
    const treeCrushAnims = [], _tcax = new THREE.Vector3();
    const writeTreeSlot = () => { throw new Error('Unpartitioned tree must not upload'); };
    const nearMeshes = {}, farMeshes = {};
    ${source.slice(crushStart, crushEnd)}
    return { crushTree, resetToppled, treeCrushAnims };
  }`)}`)(THREE, setToppleAxis, settledToppleAngle);

function assertRoots(before, after, hf) {
  const a = decals(before.trees, hf), b = decals(after.trees, hf);
  assert.deepEqual(b.geometry.index.array, a.geometry.index.array, 'root decal topology and indices unchanged');
  assert.deepEqual(b.geometry.attributes.uv.array, a.geometry.attributes.uv.array, 'root decal UV/RNG unchanged');
  assert.equal(b.geometry.attributes.position.array.byteLength, a.geometry.attributes.position.array.byteLength);
  assert.deepEqual(b.userData, a.userData, 'same decal count, maximum radius and projected area');
  const positions = b.geometry.attributes.position;
  after.trees.forEach((tree, index) => {
    const original = before.trees[index];
    assert.ok(Math.abs(positions.getX(index * 9) - tree.x) < 0.00004);
    assert.ok(Math.abs(positions.getZ(index * 9) - tree.z) < 0.00004);
    if (tree.x === original.x && tree.z === original.z) return;
    for (let vertex = index * 9; vertex < (index + 1) * 9; vertex++) {
      const x = positions.getX(vertex), z = positions.getZ(vertex), y = positions.getY(vertex);
      assert.equal(hf._noVeg(x, z), false, `entire actual decal is dry: tree ${index} at ${tree.x},${tree.z}; vertex ${x},${z}`);
      assert.equal(hf.getWaterMaskAt(x, z), 0);
      assert.ok(Math.abs(y - hf.getHeightAt(x, z) - 0.05) < 0.00006, 'root vertex conforms to real ground');
    }
  });
  for (const mesh of [a, b]) { mesh.material.map.dispose(); mesh.material.dispose(); mesh.geometry.dispose(); }
}

function assertMovedSupport(tree, hf, config) {
  const radius = treeRootDecalRadius(tree.dr) * 1.08 + 0.15;
  for (let i = 0; i < 16; i++) {
    const x = tree.x + Math.cos(i * Math.PI / 8) * radius, z = tree.z + Math.sin(i * Math.PI / 8) * radius;
    assert.equal(hf._noVeg(x, z), false); assert.equal(hf.getWaterMaskAt(x, z), 0);
    assert.ok(hf.getNormalAt(x, z).y > 0.82);
    assert.ok(Math.abs(hf.getHeightAt(x, z) - hf.getHeightAt(tree.x, tree.z)) <= 1.2);
  }
  for (const [ax, az, bx, bz] of config.props.wallRuns) {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((tree.x - ax) * dx + (tree.z - az) * dz) / (dx * dx + dz * dz)));
    const envelope = tree.cr + Math.sin(TREE_ARCHETYPES[tree.species].leanMaxRad) * tree.fallH;
    assert.ok(Math.hypot(tree.x - ax - dx * t, tree.z - az - dz * t) >= envelope + 1.5);
  }
}

function nearestBankMetres(lakes, point) {
  if (lakes.some(lake => shorelineDistance(lake, point.x, point.z, 1) < 1)) return -1;
  let distance = Infinity;
  for (const lake of lakes) for (let i = 0; i < SHORELINE_SEGMENTS; i++) {
    const a = i * Math.PI * 2 / SHORELINE_SEGMENTS;
    const b = (i + 1) * Math.PI * 2 / SHORELINE_SEGMENTS;
    const ra = shorelineRadiusAt(lake, a), rb = shorelineRadiusAt(lake, b);
    const ax = lake.x + Math.cos(a) * ra, az = lake.z + Math.sin(a) * ra;
    const dx = lake.x + Math.cos(b) * rb - ax, dz = lake.z + Math.sin(b) * rb - az;
    const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(point.x - ax - dx * t, point.z - az - dz * t));
  }
  return distance;
}

for (const config of [polders, mangrove, orchard]) for (const seed of config.id === 'polders' ? [1337, 2049, 7719] : [1337, 2025]) {
  const hf = createHeightField(seed, config);
  const before = build(hf, { ...config, vegetation: { ...config.vegetation, authoredTrees: undefined } });
  const after = build(hf, config), replay = build(hf, config);
  assert.equal(after.nextRoll, before.nextRoll, `${config.id}: no placement RNG changes`);
  assert.equal(after.trees.length, before.trees.length);
  assert.equal(after.treeObstacles.length, before.treeObstacles.length);
  assert.equal(after.concealers.length, before.concealers.length);
  assert.deepEqual(after.clusters, before.clusters, 'same forest/minimap stand allocation');
  assert.deepEqual(allocate(after.trees), allocate(before.trees), 'actual GPU instance buffer capacities unchanged');
  assert.deepEqual(after.trees.map(tree => tree.mat.elements), replay.trees.map(tree => tree.mat.elements));
  assert.deepEqual(after.group.userData.authoredTrees, replay.group.userData.authoredTrees);
  assertRoots(before, after, hf);
  const structures = createStructureClearances(config.props.tacticalBeats, DESTRUCTIBLE_BUILDING_TYPES);
  let moved = 0;
  for (let i = 0; i < before.trees.length; i++) {
    const a = before.trees[i], b = after.trees[i];
    for (const key of Object.keys(a).filter(key => !['x', 'z', 'cy', 'mat'].includes(key))) assert.deepEqual(b[key], a[key]);
    for (let k = 0; k < 16; k++) if (![12, 13, 14].includes(k)) assert.equal(b.mat.elements[k], a.mat.elements[k]);
    if (a.x === b.x && a.z === b.z) { assert.deepEqual(b.mat.elements, a.mat.elements); continue; }
    moved++;
    assert.ok(Math.abs(b.mat.elements[13] - (hf.getHeightAt(b.x, b.z) - 0.06)) < 1e-10);
    assert.ok(Math.abs((b.cy - b.mat.elements[13]) - (a.cy - a.mat.elements[13])) < 1e-10);
    assert.equal(hf._noVeg(b.x, b.z), false); assert.equal(hf.getWaterMaskAt(b.x, b.z), 0);
    assert.ok(hf._roadDist(b.x, b.z) >= 9); assert.ok(hf.getNormalAt(b.x, b.z).y > 0.82);
    assert.notEqual(hf.getGroundType(b.x, b.z), 'soft');
    const v = hf._layout.village;
    assert.equal(b.x > v.x0 - 24 && b.x < v.x1 + 24 && b.z > v.z0 - 24 && b.z < v.z1 + 24, false);
    assert.ok(isClearOfSpawns(b.x, b.z, [hf._layout.spawns.player, ...hf._layout.spawns.enemies], 26));
    assert.equal(overlapsStructureClearance(structures, b.x, b.z,
      b.cr + Math.sin(TREE_ARCHETYPES[b.species].leanMaxRad) * b.fallH), false);
    assertMovedSupport(b, hf, config);
  }
  for (let i = 0; i < after.treeObstacles.length; i++) {
    const a = before.treeObstacles[i], b = after.treeObstacles[i], tree = after.trees[b.treeIdx];
    assert.equal(b.treeIdx, a.treeIdx); assert.equal(b.shape2.r, a.shape2.r);
    assert.equal(b.shape2.cx, tree.x); assert.equal(b.shape2.cz, tree.z);
    assert.equal(after.concealers[i].x, tree.x); assert.equal(after.concealers[i].z, tree.z);
    assert.equal(after.concealers[i].r, before.concealers[i].r);
    assert.equal(after.concealers[i].add, before.concealers[i].add);
    assert.ok(Math.abs((b.max[1] - b.min[1]) - (a.max[1] - a.min[1])) < 1e-10);
    assert.ok(Math.abs(b.min[1] - hf.getHeightAt(tree.x, tree.z)) < 1e-10);
    for (const axis of [0, 2]) {
      assert.ok(Math.abs((b.max[axis] - b.min[axis]) - (a.max[axis] - a.min[axis])) < 1e-10);
      assert.ok(Math.abs((b.max[axis] + b.min[axis]) / 2 - (axis === 0 ? tree.x : tree.z)) < 1e-10);
    }
  }
  const receipts = after.group.userData.authoredTrees;
  assert.equal(receipts.reduce((n, row) => n + row.accepted, 0), moved);
  assert.ok(moved >= receipts.reduce((n, row) => n + row.attempted, 0) * 0.85, 'at least 85% of authored sites actually placed');
  for (const row of receipts) {
    assert.equal(row.accepted + row.unsafe + row.noDonor, row.attempted);
    assert.ok(row.accepted >= 8, `${row.id}: a meaningful continuous row/bank allocation`);
    assert.equal(row.noDonor, 0, `${row.id}: existing species allocation is sufficient`);
  }
  for (const feature of config.vegetation.authoredTrees.filter(row => row.species === 'willow')) {
    for (const point of authoredTreeStations(feature)) {
      const shore = nearestBankMetres(config.terrain.lakes, point);
      assert.ok(shore > 0 && shore < 15, `${feature.id}: follows a real lake-bank envelope, not arbitrary open land`);
    }
  }
  const life = topple(after.trees, after.treeObstacles, hf);
  for (const obstacle of after.treeObstacles) {
    const tree = after.trees[obstacle.treeIdx], original = before.trees[obstacle.treeIdx];
    if (tree.x === original.x && tree.z === original.z) continue;
    assert.equal(life.crushTree(obstacle, 1, 0), true);
    const fall = life.treeCrushAnims.at(-1);
    assert.equal(fall.t, tree); assert.equal(fall.x, tree.x); assert.equal(fall.z, tree.z);
    assert.equal(fall.y, obstacle.min[1]); assert.deepEqual(fall.base.elements, tree.mat.elements);
    tree.mat.makeTranslation(1000, -1000, 1000);
  }
  life.resetToppled();
  assert.equal(life.treeCrushAnims.length, 0);
  assert.deepEqual(after.trees.map(tree => tree.mat.elements), replay.trees.map(tree => tree.mat.elements), 'reset preserves the relocated upright pose');
  console.log(JSON.stringify({ map: config.id, seed, actualTrees: after.trees.length,
    actualTrunks: after.treeObstacles.length, onePoolBytes: allocate(after.trees), moved, features: receipts }));
}
assert.throws(() => authoredTreeStations({ count: 10000, path: [[0, 0], [1, 1]] }));
assert.deepEqual(redistributeAuthoredTrees([], [], [], new Set(),
  [{ id: 'no-species-budget', species: 'oak', count: 2, path: [[0, 0], [10, 0]] }], {}, () => true, [], []),
[{ id: 'no-species-budget', attempted: 2, accepted: 0, unsafe: 0, noDonor: 2 }], 'missing donors remain explicit, never add replacement trees');
assert.ok(source.indexOf('redistributeAuthoredTrees(trees') < source.indexOf('  createTreeMeshPools();'));
assert.ok(source.indexOf('redistributeAuthoredTrees(trees') < source.indexOf('  createTreeRootDecals();'));
assert.ok(source.indexOf('excludeStructureVegetation(') < source.indexOf('redistributeAuthoredTrees(trees'));
console.log('authoredTreePlacement: actual seeded placement, species/variant/RNG/capacity parity, dry generated decals and paired collision/spotting/topple/reset PASS; no GPU/visual claim');
