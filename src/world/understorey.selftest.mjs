// Round 77 (2026-09-26): the understorey — young growth at the forest edges (vegetation.ts buildUnderstoreyCards /
// placeUnderstorey). Pins the shrub's shape and storage, and on the real seeded producers of Verdant, Autumn and
// Fjord that the instances stand in the stands' edge annulus off roads, soft ground, water, the village and the
// spawns, that they add no cover disc and no trunk record (pure dressing), that the mobile tier plants none, and that
// the mesh carries the foliage material's instanced attributes. A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { isClearOfSpawns } from './spawnClearance.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas'); const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

function shapeContract(geometry) {
  assert.equal(geometry.index, null);
  assert.deepEqual(Object.keys(geometry.attributes).filter(k => k !== 'aFadeI' && k !== 'aLodF').sort(), ['aFlex', 'color', 'normal', 'position', 'uv']);
  const p = geometry.attributes.position;
  assert.equal(p.count, 120, 'ten folded sprays of twelve vertices');
  for (const name of ['position', 'normal', 'uv', 'color', 'aFlex']) {
    const a = geometry.attributes[name];
    assert.equal(a.count, 120); assert.equal(a.array.constructor, Float32Array); assert.ok(a.array.every(Number.isFinite), name);
  }
  const box = new THREE.Box3().setFromBufferAttribute(p), size = box.getSize(new THREE.Vector3());
  assert.ok(box.min.y >= -0.2 && box.min.y <= 0, `grounded (${box.min.y})`);
  assert.ok(size.y > 0.6 && size.y < 1.8 && size.x > 0.6 && size.z > 0.6, `a young shrub, not a pancake or a bush (${size.toArray()})`);
  for (let i = 0; i < 120; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i);
    assert.ok(Math.abs(n.length() - 1) < 2e-6 && n.y > 0, 'positive-up unit normals');
    assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= 1.4, 'inside the reach the placement keeps off the walls');
  }
  return { size: size.toArray().map(v => +v.toFixed(3)), minY: +box.min.y.toFixed(3) };
}

function produce(id) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const mesh = world.group.children.find(m => m.userData.understorey === true);
    const bushes = world.group.children.filter(m => m.userData.bush === true);
    const clusters = world._clusters;
    const tier = getDeviceTier();
    if (tier === 'mobile') {
      assert.equal(mesh, undefined, `${id}: the mobile tier plants no understorey`);
      return { id, tier, instances: 0 };
    }
    assert.ok(mesh?.isInstancedMesh, `${id}: one understorey mesh`);
    assert.ok(mesh.count > 0 && mesh.count === mesh.instanceMatrix.count, `${id}: a filled pool`);
    assert.strictEqual(mesh.material, bushes[0].material, 'the bush species\' foliage material');
    assert.strictEqual(mesh.customDepthMaterial, bushes[0].customDepthMaterial, 'and its alpha-tested shadow material');
    assert.ok(mesh.castShadow && mesh.receiveShadow && mesh.userData.aoExclude === true && !mesh.matrixAutoUpdate);
    assert.ok(mesh.geometry.userData.understorey === true);
    for (const key of ['aFadeI', 'aLodF']) {
      const a = mesh.geometry.attributes[key];
      assert.ok(a?.isInstancedBufferAttribute && a.count === mesh.count && a.array.every(v => v === 0), `${id}: ${key} present and zero`);
    }
    const shape = shapeContract(mesh.geometry);
    const matrix = new THREE.Matrix4(), spawns = [field._layout.spawns.player, ...field._layout.spawns.enemies];
    const v = field._layout.village;
    // round 77b (2026-09-26): the rim-forest blocks feather through the same law, at the rim trees' scale (× 1.4)
    // and the rim's bound (506 m); every instance stands in a stand's annulus or a rim block's
    const rimBlocks = world._rimBlocks;
    const annulus = (discs, x, z) => discs.map(c => Math.hypot(x - c.x, z - c.z) / c.r)
      .filter(r => r >= 0.82 - 1e-4 && r <= 1.6 + 1e-4).sort((a, b) => a - b)[0];
    let minR = Infinity, maxR = 0, standCount = 0, rimCount = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); const e = matrix.elements;
      const x = e[12], z = e[14], sc = Math.hypot(e[0], e[2]);
      // stands may overlap their neighbours' annuli (the separation rule keeps only centres 26 m past a radius), so
      // the instance must sit in SOME stand's edge annulus, not necessarily its nearest's; a rim shrub near an
      // edge stand can satisfy both laws, so each instance is judged by whichever law it satisfies
      const bound = Math.max(Math.abs(x), Math.abs(z));
      const standNear = annulus(clusters, x, z), rimNear = annulus(rimBlocks, x, z);
      const standOk = standNear !== undefined && sc >= 0.85 - 1e-4 && sc <= 1.6 + 1e-4 && bound <= 470 + 1e-6;
      const rimOk = rimNear !== undefined && sc >= 0.85 * 1.4 - 1e-4 && sc <= 1.6 * 1.4 + 1e-4 && bound <= 506 + 1e-6;
      assert.ok(standOk || rimOk, `${id}: a stand's or a rim block's shrub (${x}, ${z}, scale ${sc}, bound ${bound})`); // float32 instance matrices
      const near = standOk ? standNear : rimNear;
      if (standOk) standCount++; else rimCount++;
      minR = Math.min(minR, near); maxR = Math.max(maxR, near);
      assert.ok(field._roadDist(x, z) >= 6, `${id}: off the roads`);
      assert.notEqual(field.getGroundType(x, z), 'soft', `${id}: off soft ground`);
      assert.ok(field.getNormalAt(x, z).y >= 0.78, `${id}: off the steep faces`);
      assert.ok(isClearOfSpawns(x, z, spawns, 20), `${id}: clear of the spawns`);
      assert.ok(!(x > v.x0 - 12 && x < v.x1 + 12 && z > v.z0 - 12 && z < v.z1 + 12), `${id}: outside the village`);
      assert.ok(Math.abs(e[13] + 0.04 - field.getHeightAt(x, z)) < 2e-3, `${id}: seated on the ground`);
      assert.ok(!world.concealers.some(d => Math.abs(d.x - x) < 1e-3 && Math.abs(d.z - z) < 1e-3), `${id}: no cover disc of its own`);
      assert.ok(!world.treeObstacles.some(o => Math.abs((o.min[0] + o.max[0]) / 2 - x) < 1e-3 && Math.abs((o.min[2] + o.max[2]) / 2 - z) < 1e-3), `${id}: no trunk record`);
    }
    if (rimBlocks.length > 0) assert.ok(rimCount > 0, `${id}: the rim blocks carry an understorey (${rimBlocks.length} blocks)`);
    return { id, tier, instances: mesh.count, stand: standCount, rim: rimCount, clusters: clusters.length, rimBlocks: rimBlocks.length,
      shape, annulus: [+minR.toFixed(3), +maxR.toFixed(3)],
      bushes: bushes.reduce((n, m) => n + m.count, 0), concealers: world.concealers.length, trunks: world.treeObstacles.length };
  } finally { world.dispose(); disposeObject3DResources(world.group); }
}

const restore = canvasFixture(), savedWindow = globalThis.window, receipts = [];
try {
  // the device tier resolves once per module: the desktop pass runs unresolved (getDeviceTier reads 'desktop'),
  // the mobile pass resolves it from the query at the end (foliageAtlasPadding's pattern)
  assert.equal(getDeviceTier(), 'desktop');
  for (const id of ['verdant', 'autumn', 'fjord']) receipts.push(produce(id));
  const verdant = receipts[0];
  assert.ok(verdant.stand >= 200 && verdant.stand <= 2000, `Verdant's stands plant hundreds, not thousands (${verdant.stand})`);
  assert.ok(verdant.rim >= 100 && verdant.rim <= 2500, `Verdant's rim blocks plant hundreds (${verdant.rim})`); // round 77b
  assert.ok(verdant.annulus[0] < 0.95 && verdant.annulus[1] > 1.3, 'the annulus is used from the edge outward');
  const repeat = produce('verdant');
  assert.deepEqual(repeat, verdant, 'deterministic');
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  resolveDeviceTier(); assert.equal(getDeviceTier(), 'mobile');
  receipts.push(produce('verdant'));
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
  restore();
}
console.log(JSON.stringify({ receipts }));
console.log('understorey.selftest: shape (120 vertices, five streams, grounded), edge-annulus placement off roads / soft ground / slopes / spawns / the village for the stands and (round 77b) the rim blocks, no cover or trunk records, mobile none, deterministic PASS');
