import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHeightField, sampleSplatNoise } from './terrain.ts';
import { buildGrassTuftGeometry, mulberry32 } from './vegetation.ts';
import longleaf from './maps/longleaf.ts';
import verdant from './maps/verdant.ts';

const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `actual production stage exists: ${start}`);
  return source.slice(a, b);
}
const treatment = '    if (veg.stubblePatches) t[5] *= stubbleHeightScale(x, z);';
assert.equal(source.split(treatment).length, 2, 'one record-construction application, never a frame update');
const stages = [
  section('  // shared placement filter/tint', "  yield { stage: 'grassPrep' }; // perf-r3"),
  section('  // ---- midfield grass scatter', '  const spawn = L.spawns.player;'),
  section('  interface CarpetSet {', "  yield { stage: 'grassCarpet' };"),
].join('\n');

// Execute real candidate filters, typed record packing, chunk allocation,
// carpet caching and instance writes. Only canvas pigmentation/shadow setup is
// omitted: this is renderer-free placement evidence, not an atlas/GPU test.
function compile(legacy) {
  const body = legacy ? stages.replace(treatment, '') : stages;
  return new Function('THREE', 'sampleSplatNoise', 'buildGrassTuftGeometry', `return (${stripTypeScriptTypes(`
    function build(heightField, config, mobileTier, mulberry32) {
      ${section('const HALF = 512;', 'function treePositionNoise(')}
      const seed = 2001, group = new THREE.Group(), veg = { avoid: null, ...config.vegetation };
      const L = heightField._layout, noVeg = heightField._noVeg, _c = new THREE.Color();
      ${section('  const grassPerChunk =', '  const uWindTime =')}
      const grassVariants = [0, 1].map(v => ({
        geo: buildGrassTuftGeometry(v === 0 ? 0.92 : 1.14, v === 0 ? 0.74 : 0.58),
        geoFar: buildGrassTuftGeometry(v === 0 ? 0.92 : 1.14, v === 0 ? 0.74 : 0.58, 1, 1.5),
        matMid: new THREE.MeshLambertMaterial(), matNear: new THREE.MeshLambertMaterial(),
      }));
      ${body}
      function chunk(ix, iz) {
        const gc = { ix, iz, x0: -HALF + ix * CHUNK_SIZE, z0: -HALF + iz * CHUNK_SIZE,
          meshes: null, built: false, job: null, lod: false };
        advanceGrassChunk(gc, grassPerChunk);
        return gc;
      }
      return { chunk, carpetCell, rebuildCarpet, carpetSets, group, grassVariants, stubbleHeightScale };
    }
  `)});`)(THREE, sampleSplatNoise, buildGrassTuftGeometry);
}
const build = compile(false), buildLegacy = compile(true);

function tracedRandom() {
  const rows = [];
  const make = seed => {
    const random = mulberry32(seed), row = { seed, calls: 0, last: 0, tail: random };
    rows.push(row);
    return () => { row.calls++; row.last = random(); return row.last; };
  };
  return { make, snapshot: () => rows.map(({ seed, calls, last, tail }) => ({ seed, calls, last, tail: tail() })) };
}
function dispose(fixture) {
  for (const v of fixture.grassVariants) {
    v.geo.dispose(); v.geoFar.dispose(); v.matMid.dispose(); v.matNear.dispose();
  }
  fixture.group.clear();
}
function capacities(fixture) {
  const meshes = fixture.group.children;
  const geometries = new Set(fixture.grassVariants.flatMap(v => [v.geo, v.geoFar]));
  const materials = new Set(fixture.grassVariants.flatMap(v => [v.matMid, v.matNear]));
  return {
    meshCount: meshes.length, geometryCount: geometries.size, materialCount: materials.size,
    geometryBytes: [...geometries].reduce((sum, g) => sum + g.index.array.byteLength
      + Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0), 0),
    matrixBytes: meshes.reduce((n, mesh) => n + mesh.instanceMatrix.array.byteLength, 0),
    colorBytes: meshes.reduce((n, mesh) => n + mesh.instanceColor.array.byteLength, 0),
  };
}
function inCore(x, z) {
  return longleaf.vegetation.stubblePatches.some(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
}
function inFeather(x, z) {
  return longleaf.vegetation.stubblePatches.some(p =>
    x > p.x0 - p.feather && x < p.x1 + p.feather && z > p.z0 - p.feather && z < p.z1 + p.feather);
}
function compareMesh(before, after, receipt) {
  assert.equal(after.count, before.count);
  assert.equal(after.instanceMatrix.array.byteLength, before.instanceMatrix.array.byteLength);
  assert.deepEqual(after.instanceColor.array, before.instanceColor.array);
  const a = after.instanceMatrix.array, b = before.instanceMatrix.array;
  after.geometry.computeBoundingBox(); before.geometry.computeBoundingBox();
  const matrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  for (let i = 0; i < after.count; i++) {
    const offset = i * 16, x = a[offset + 12], z = a[offset + 14];
    for (let slot = 0; slot < 16; slot++) {
      if (slot !== 5) assert.equal(a[offset + slot], b[offset + slot], 'position/yaw/width and every non-height component are exact');
    }
    if (!inFeather(x, z)) assert.equal(a[offset + 5], b[offset + 5], 'outside the authored feather is byte-identical');
    if (a[offset + 5] === b[offset + 5]) continue;
    assert.ok(inFeather(x, z));
    assert.ok(a[offset + 5] > 0 && a[offset + 5] < b[offset + 5]);
    receipt.shortened++;
    if (inCore(x, z)) {
      assert.ok(Math.abs(a[offset + 5] / b[offset + 5] - 0.16) < 1e-7);
      after.getMatrixAt(i, matrix);
      bounds.copy(after.geometry.boundingBox).applyMatrix4(matrix);
      // Actual written tuple root is terrain Y - 3 cm, including the near
      // carpet's separate 1.04 scale. Inspect transformed geometry, not just
      // the authored multiplier or a hypothetical unscaled card height.
      const ground = a[offset + 13] + 0.03, top = bounds.max.y - ground;
      assert.ok(top <= 0.14, 'the taller carpet variant stays below half the smallest authored 0.32 m log diameter');
      assert.ok(bounds.min.y < ground, 'shortening retains buried roots, never floating cards');
      before.getMatrixAt(i, matrix);
      bounds.copy(before.geometry.boundingBox).applyMatrix4(matrix);
      assert.ok(bounds.max.y - ground > top, 'the actual pre-treatment world-space card was taller');
      receipt.core++;
      receipt.maxCoreHeight = Math.max(receipt.maxCoreHeight, top);
    }
  }
  receipt.instances += after.count;
  receipt.matrixBytes += a.byteLength;
  receipt.colorBytes += after.instanceColor.array.byteLength;
}
function compareChunk(before, after, receipt) {
  assert.equal(after.meshes.length, before.meshes.length);
  for (let i = 0; i < after.meshes.length; i++) {
    compareMesh(before.meshes[i].mesh, after.meshes[i].mesh, receipt);
    for (const key of ['position', 'normal', 'uv']) {
      assert.deepEqual(after.meshes[i].geoNear.attributes[key].array, before.meshes[i].geoNear.attributes[key].array);
    }
    assert.deepEqual(after.meshes[i].geoNear.index.array, before.meshes[i].geoNear.index.array);
  }
}
function compareCarpet(before, after, receipt) {
  for (const z of [64, 100]) {
    before.rebuildCarpet(new THREE.Vector3(-94, 2, z));
    after.rebuildCarpet(new THREE.Vector3(-94, 2, z));
    for (let v = 0; v < 2; v++) {
      const a = after.carpetSets[v], b = before.carpetSets[v];
      assert.equal(a.active, b.active);
      compareMesh(b.meshes[b.active], a.meshes[a.active], receipt);
    }
  }
  // A repeated camera visit reuses exact cached records, with no re-scaling.
  const cached = after.carpetCell(-6, 4);
  assert.equal(after.carpetCell(-6, 4), cached);
  assert.equal(cached.byteLength, before.carpetCell(-6, 4).byteLength);
}
function checkPatchContract(fixture) {
  assert.equal(longleaf.vegetation.stubblePatches.length, 2);
  for (const patch of longleaf.vegetation.stubblePatches) {
    assert.ok(patch.x1 > patch.x0 && patch.z1 > patch.z0 && patch.feather > 0);
    assert.ok(Object.values(patch).every(Number.isFinite));
    assert.ok(patch.heightScale > 0 && patch.heightScale < 1);
    const z = (patch.z0 + patch.z1) / 2;
    assert.equal(fixture.stubbleHeightScale(patch.x0, z), 0.16);
    assert.equal(fixture.stubbleHeightScale(patch.x0 - patch.feather, z), 1);
    let previous = 0;
    for (let i = 0; i <= 8; i++) {
      const value = fixture.stubbleHeightScale(patch.x0 - patch.feather * i / 8, z);
      assert.ok(value >= previous && value >= 0.16 && value <= 1, 'continuous nonnegative feather');
      previous = value;
    }
  }
  for (const point of [...longleaf.props.loggingYard.bundles, ...longleaf.props.loggingYard.flatbeds]) {
    assert.equal(fixture.stubbleHeightScale(point.x, point.z), 0.16, 'both actual loading allocations are inside the core');
  }
  assert.equal(fixture.stubbleHeightScale(-94, 82), 1, 'keep an unworked separation between the two bays');
  assert.equal(fixture.stubbleHeightScale(-118, 64), 1, 'the existing wall boundary remains outside the treatment');
}

const receipts = [];
for (const seed of [1337, 2025, 7719]) {
  const field = createHeightField(seed, longleaf);
  for (const mobile of [false, true]) {
    const oldRandom = tracedRandom(), newRandom = tracedRandom();
    const before = buildLegacy(field, longleaf, mobile, oldRandom.make);
    const after = build(field, longleaf, mobile, newRandom.make);
    const receipt = { seed, mobile, shortened: 0, core: 0, maxCoreHeight: 0, instances: 0, matrixBytes: 0, colorBytes: 0 };
    checkPatchContract(after);
    compareChunk(before.chunk(3, 4), after.chunk(3, 4), receipt);
    compareChunk(before.chunk(4, 4), after.chunk(4, 4), receipt);
    compareCarpet(before, after, receipt);
    assert.deepEqual(capacities(after), capacities(before), 'unique retained resources and buffer capacities are exact');
    receipt.retained = capacities(after);
    assert.deepEqual(newRandom.snapshot(), oldRandom.snapshot(), 'all production chunk/cell RNG counts and tails are exact');
    assert.ok(receipt.shortened > 50 && receipt.core > 20, 'real accepted instances are shortened, not only authored metadata');
    receipts.push(receipt);
    dispose(before); dispose(after);
  }
}
// A separate real terrain/map config exercises the disabled path byte-for-byte.
{
  const field = createHeightField(1337, verdant), aRandom = tracedRandom(), bRandom = tracedRandom();
  const before = buildLegacy(field, verdant, false, aRandom.make), after = build(field, verdant, false, bRandom.make);
  const receipt = { shortened: 0, core: 0, maxCoreHeight: 0, instances: 0, matrixBytes: 0, colorBytes: 0 };
  compareChunk(before.chunk(3, 4), after.chunk(3, 4), receipt);
  compareCarpet(before, after, receipt);
  assert.equal(receipt.shortened, 0);
  assert.deepEqual(bRandom.snapshot(), aRandom.snapshot());
  dispose(before); dispose(after);
}
console.log(JSON.stringify({ test: 'loggingYardGrass', scope: 'actual CPU grass stages, two chunks and two carpet rebuilds per case; not GPU or whole-map census', receipts }));
