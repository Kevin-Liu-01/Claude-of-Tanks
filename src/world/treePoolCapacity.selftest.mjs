import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { mulberry32 } from './vegetation.ts';
import { TREE_ARCHETYPES, treeTrunkCollisionRadiusM } from './treeSpecies.ts';
import { setCircleShape } from './collision.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';
import { isClearOfSpawns } from './spawnClearance.ts';
import { createStructureClearances, excludeStructureVegetation } from './vegetationClearance.ts';
import { redistributeAuthoredTrees } from './authoredTreePlacement.ts';
import { relocateTidalMangroves } from './tidalMangrove.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { getMapConfig } from './maps/index.ts';
import { applyLodShadowFadeDepth } from '../engine/lodShadowFade.ts';

// Actual seeded tree placement, allocation, full/incremental partition and LOD
// transition code. Tiny immutable geometry avoids unrelated atlas/mesh baking.
// These are real typed-array capacities, NOT native draw-time/GPU-memory proof.
const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production section exists: ${start}`);
  return source.slice(a, b);
}
const poolCode = section('  function makeTreeMesh(', "  yield { stage: 'treeRimAndMeshes' };");
const capacityLine = 'const capacity = Math.min(trees.length, Math.max(1, speciesCounts.get(sp) ?? 0));';
assert.equal(poolCode.split(capacityLine).length, 2, 'one construction-only species capacity owner');
const dependencies = { THREE, mulberry32, TREE_ARCHETYPES, treeTrunkCollisionRadiusM, setCircleShape,
  PLAYABLE_HALF_EXTENT_M, isClearOfSpawns, createStructureClearances, excludeStructureVegetation,
  redistributeAuthoredTrees, relocateTidalMangroves, DESTRUCTIBLE_BUILDING_TYPES, applyLodShadowFadeDepth };

function compile(legacy) {
  const pools = legacy ? poolCode.replace(capacityLine, 'const capacity = trees.length;') : poolCode;
  return new Function(...Object.keys(dependencies), `return (${stripTypeScriptTypes(`
    function* build(heightField, cfg, mobileTier, overrideTrees) {
      const seed = 2001, TREE_NEAR_IN = 260, TREE_NEAR_OUT = 290;
      ${section('  const treeNearIn =', '  let groundCoverBlocked:')}
      const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qLean = new THREE.Quaternion();
      const _axLean = new THREE.Vector3(), _pv = new THREE.Vector3(), _sv = new THREE.Vector3();
      const _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
      const NEAR_VARIANTS = 3, FAR_VARIANTS = 2, speciesList = veg.species;
      ${section('  const palOf =', '  const foliageTex =')}
      const inAvoid = (x,z) => veg.avoid?.some(a => Math.hypot(x-a.x,z-a.z)<a.r) || false;
      const geometry = () => new THREE.BufferGeometry().setAttribute('position',
        new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]), 3));
      const treeGeo = {}, treeGeoFar = {}, foliageMats = {}, foliageDepthMats = {};
      const barkMat = new THREE.MeshStandardMaterial(), canopyFarMat = new THREE.MeshStandardMaterial();
      for (const sp of speciesList) {
        treeGeo[sp] = Array.from({ length: 3 }, () => ({ trunk: geometry(), cards: geometry() }));
        treeGeoFar[sp] = Array.from({ length: 2 }, () => ({ trunk: geometry(), canopy: geometry() }));
        foliageMats[sp] = new THREE.MeshStandardMaterial();
        foliageDepthMats[sp] = new THREE.MeshDepthMaterial();
      }
      ${section('function treePositionNoise(', 'function _mustReplace(')}
      ${section('  // weighted species pick', '  // Each LOD is a trunk mesh')}
      if (overrideTrees) { trees.length = 0; trees.push(...overrideTrees); }
      const _whiteScratch = new THREE.Color(1, 1, 1);
      ${pools}
      const uCamFwd = { value: new THREE.Vector3(0,0,1) };
      const attribute = (geo, name) => geo.getAttribute(name);
      const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
      ${section('  const _lastCam =', '  // gameplay_feel r6 (round critique MAJOR')}
      return { trees, treeObstacles, concealers, group, nearMeshes, farMeshes, nearSlots, farSlots,
        nextRoll: rng(), makeTreeMesh, rebuildPartitionFull, repartitionTrees, tickLodTransitions,
        scope(radius) { scopeZoomR = radius; },
        dispose() {
          const materials = new Set([barkMat, canopyFarMat, ...Object.values(foliageMats),
            ...Object.values(foliageDepthMats)]);
          for (const mesh of group.children) mesh.geometry.dispose();
          for (const material of materials) material.dispose();
          group.clear();
        }
      };
    }
  `)});`)(...Object.values(dependencies));
}
const candidate = compile(false), legacy = compile(true);
function build(factory, hf, config, mobile, overrideTrees) {
  const generator = factory(hf, config, mobile, overrideTrees);
  let step; do { step = generator.next(); } while (!step.done);
  return step.value;
}
function streams(mesh) {
  return [mesh.instanceMatrix, mesh.instanceColor,
    mesh.geometry.getAttribute('aFadeI'), mesh.geometry.getAttribute('aLodF')];
}
function assertCapacity(mesh, count, population = count) {
  const expected = Math.min(population, Math.max(1, count));
  for (const attribute of streams(mesh)) {
    assert.ok(attribute?.array instanceof Float32Array, 'capacity must allocate a real typed array');
    assert.equal(attribute.count, expected, 'nonzero exact species capacity, never undefined/zero');
    assert.equal(attribute.array.byteLength, expected * attribute.itemSize * 4);
    assert.equal(attribute.usage, THREE.DynamicDrawUsage);
  }
  assert.ok(mesh.count <= expected, 'every active slot fits its allocated backing');
}
function census(fixture) {
  const geometries = new Set(), materials = new Set();
  let bytes = 0;
  for (const mesh of fixture.group.children) {
    geometries.add(mesh.geometry); materials.add(mesh.material);
    if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
    bytes += streams(mesh).reduce((sum, attr) => sum + attr.array.byteLength, 0);
  }
  return { meshes: fixture.group.children.length, geometries: geometries.size, materials: materials.size, bytes };
}
function compare(before, after) {
  assert.deepEqual(after.trees, before.trees, 'every active tree/slot/transform/tint/LOD state is exact');
  assert.deepEqual(after.treeObstacles, before.treeObstacles, 'collision records and tree indices exact');
  assert.deepEqual(after.concealers, before.concealers, 'spotting records exact');
  assert.equal(after.nextRoll, before.nextRoll, 'same complete placement RNG tail');
  assert.deepEqual(after.group.userData, before.group.userData, 'same authored placement receipts');
  assert.equal(after.group.children.length, before.group.children.length, 'scene owner count unchanged');
  for (let i = 0; i < after.group.children.length; i++) {
    const a = before.group.children[i], b = after.group.children[i];
    for (const key of ['count', 'visible', 'castShadow', 'receiveShadow', 'frustumCulled', 'matrixAutoUpdate']) {
      assert.equal(b[key], a[key], `pool ${i}/${key}`);
    }
    assert.deepEqual(b.userData, a.userData);
    const aStreams = streams(a), bStreams = streams(b);
    for (let s = 0; s < aStreams.length; s++) {
      const prefix = b.count * bStreams[s].itemSize;
      assert.deepEqual(bStreams[s].array.subarray(0, prefix), aStreams[s].array.subarray(0, prefix),
        `pool ${i} stream ${s}: actual active prefix bytes match`);
      assert.deepEqual(bStreams[s].updateRanges, aStreams[s].updateRanges, 'same ranged upload requests');
      assert.equal(bStreams[s].version, aStreams[s].version, 'same upload count');
      for (const range of bStreams[s].updateRanges) {
        assert.ok(range.start >= 0 && range.start + range.count <= bStreams[s].array.length);
      }
    }
  }
  for (const sp of Object.keys(after.nearMeshes)) {
    const population = after.trees.filter(t => t.species === sp).length;
    for (const mesh of [...after.nearMeshes[sp].flat(), ...after.farMeshes[sp].flat()]) {
      assertCapacity(mesh, population, after.trees.length);
    }
  }
}
function drive(before, after) {
  const camera = new THREE.Vector3();
  const checkpoints = [[0, 0], [280, 0], [500, 300], [-500, -300], [0, 0]];
  for (const [index, [x, z]] of checkpoints.entries()) {
    camera.set(x, 4, z);
    for (const f of [before, after]) {
      f.scope(index === 2 ? 640 : 0);
      f.repartitionTrees(camera);
    }
    compare(before, after); // both LODs coexist before transition retirement
    for (const dt of [.1, .12, .15]) {
      for (const f of [before, after]) f.tickLodTransitions(dt);
      compare(before, after);
    }
  }
  for (const f of [before, after]) f.rebuildPartitionFull(camera.set(80, 3, 20));
  compare(before, after); // a forced full rebuild retains the same slot ordering
}

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const requested = option('map');
const mapIds = requested ? [requested] : ['verdant', 'polders', 'mangrove'];
const sourceHash = createHash('sha256').update(source).digest('hex');
for (const mapId of mapIds) {
  const config = getMapConfig(mapId);
  assert.equal(config.id, mapId, 'unknown requested test map');
  const hf = createHeightField(1337, config);
  for (const mobile of [false, true]) {
    const before = build(legacy, hf, config, mobile), after = build(candidate, hf, config, mobile);
    try {
      compare(before, after);
      const a = census(before), b = census(after);
      assert.deepEqual({ ...b, bytes: 0 }, { ...a, bytes: 0 }, 'same mesh/geometry/material owners');
      assert.ok(after.trees.length > 0 && b.bytes > 0 && b.bytes < a.bytes, 'real non-vacuous backing reduction');
      const geo = new THREE.BufferGeometry(), mat = new THREE.MeshBasicMaterial();
      assert.throws(() => after.makeTreeMesh(geo, mat, config.vegetation.species[0], false, 0), /valid capacity/);
      geo.dispose(); mat.dispose();
      drive(before, after);
      console.log(JSON.stringify({ map: mapId, tier: mobile ? 'mobile' : 'desktop', seed: 1337,
        trees: after.trees.length, before: a, after: b, savedBytes: a.bytes - b.bytes, sourceHash }));
    } finally { before.dispose(); after.dispose(); }
  }
}

// An empty population must retain zero-byte owned meshes and a color
// attribute. Reject missing capacity explicitly rather than testing NaN/empty
// arrays against one another and incorrectly reporting equality as success.
const config = getMapConfig('verdant'), hf = createHeightField(1337, config);
const empty = build(candidate, hf, config, false, []);
try {
  for (const mesh of empty.group.children) { assertCapacity(mesh, 0); assert.equal(mesh.count, 0); }
  assert.equal(census(empty).bytes, 0);
  for (const value of [undefined, -1, .5, NaN, Infinity]) {
    const geo = new THREE.BufferGeometry(), mat = new THREE.MeshBasicMaterial();
    assert.throws(() => empty.makeTreeMesh(geo, mat, 'oak', false, value), /valid capacity/);
    geo.dispose(); mat.dispose();
  }
} finally { empty.dispose(); }
console.log('treePoolCapacity: exact seeded scene/partition parity and reduced real backing bytes PASS; native performance and GPU memory not measured');
