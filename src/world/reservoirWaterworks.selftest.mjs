import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { MAP_IDS } from './maps/index.ts';
import reservoir from './maps/reservoir.ts';
import { slabBox } from './propGeometry.ts';
import { setCircleShape } from './collision.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const geometryHash = geometry => hash(Buffer.concat([
  ...Object.values(geometry.attributes).map(a => bytes(a.array)),
  ...(geometry.index ? [bytes(geometry.index.array)] : []),
]));
const clone = value => JSON.parse(JSON.stringify(value));

function installFixtureCanvas() {
  globalThis.ImageData = class { constructor(data) { this.data = data; } };
  globalThis.Image = class {
    width = 8; height = 8;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
}

function recordMeshes(props) {
  const rows = [], mats = new Set();
  let vertices = 0, attributeBytes = 0;
  props.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const key = mesh.material.customProgramCacheKey(); mats.add(key);
    vertices += mesh.geometry.attributes.position.count;
    attributeBytes += Object.values(mesh.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0);
    if (['world-props-stone-v6', 'world-props-wood-v6', 'world-props-dark-v6'].includes(key)) return;
    rows.push({ name: mesh.name, material: key, count: mesh.count, geometry: geometryHash(mesh.geometry),
      matrix: mesh.matrix.elements, instances: mesh.instanceMatrix && hash(bytes(mesh.instanceMatrix.array)),
      colors: mesh.instanceColor && hash(bytes(mesh.instanceColor.array)) });
  });
  return { rows, mats: [...mats].sort(), vertices, attributeBytes };
}

async function wholeWorld(seed) {
  const propsUrl = new URL('./props.ts', import.meta.url).href;
  const helperUrl = new URL('./reservoirWaterworks.ts', import.meta.url).href;
  globalThis.__waterworksRng = [];
  let control = true, seam;
  globalThis.__captureWaterworks = (args, compose) => {
    const [, , field, donors, buckets, blockers] = args;
    assert.equal(donors.length, 3, 'three actually accepted full-production street-rubble packets');
    const removed = new Set(donors.flatMap(d => [...d.stone, ...d.wood]));
    const oldGeometries = Object.values(buckets).flat();
    const hashes = new Map(oldGeometries.map(g => [g, geometryHash(g)]));
    const records = donors.flatMap(d => [d.obstacle, d.collider]);
    const before = records.map(clone), disposed = new Set();
    removed.forEach(g => g.addEventListener('dispose', () => disposed.add(g)));
    const result = compose(control ? [args[0], undefined, ...args.slice(2)] : args);
    for (const g of oldGeometries) {
      if (!control && removed.has(g)) continue;
      assert.equal(geometryHash(g), hashes.get(g), 'every non-donor position/normal/UV/index byte stays identical');
      assert.ok(Object.values(buckets).some(bucket => bucket.includes(g)), 'every non-donor geometry object remains');
    }
    if (!control) {
      assert.equal(result?.status, 'built', `complete actual-world assembly: ${JSON.stringify(result)}`);
      assert.equal(disposed.size, removed.size, 'removed source buffers disposed exactly once');
      for (const g of removed) assert.ok(!Object.values(buckets).some(bucket => bucket.includes(g)));
      for (let i = 0; i < 3; i++) {
        assert.equal(donors[i].obstacle, records[i * 2]);
        assert.equal(donors[i].collider, records[i * 2 + 1]);
        assert.equal(blockers.filter(ob => ob === records[i * 2]).length, 1);
        assert.equal(blockers.filter(ob => ob === records[i * 2 + 1]).length, 1);
        const body = result.bodies[i];
        for (const ob of [donors[i].obstacle, donors[i].collider]) {
          assert.deepEqual(ob.min, [body.x - body.width / 2, body.bottom, body.z - body.depth / 2]);
          assert.deepEqual(ob.max, [body.x + body.width / 2, body.top + 0.06, body.z + body.depth / 2]);
          assert.deepEqual(ob.shape2, { kind: 'obb', cx: body.x, cz: body.z,
            hw: body.width / 2, hl: body.depth / 2, yaw: 0 });
        }
      }
      validateAssembly(result, buckets, field);
    } else assert.deepEqual(records.map(clone), before);
    seam = { donors: donors.slice(), before, result };
    return result;
  };
  registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url === propsUrl) {
      let text = result.source.toString().replace('export function mulberry32(a: number): Rng',
        'function originalMulberry32(a: number): Rng');
      text += `\nexport function mulberry32(seed: number): Rng {
        const next = originalMulberry32(seed), row = { seed, count: 0, next };
        globalThis.__waterworksRng.push(row);
        return () => { row.count++; return next(); };
      }\n`;
      return { ...result, source: text };
    }
    if (url === helperUrl) {
      let text = result.source.toString().replace('export function composeReservoirWaterworks(',
        'function originalComposeReservoirWaterworks(');
      text += `\nexport function composeReservoirWaterworks(...args: Parameters<typeof originalComposeReservoirWaterworks>) {
        return globalThis.__captureWaterworks(args, values => originalComposeReservoirWaterworks(...values));
      }\n`;
      return { ...result, source: text };
    }
    return result;
  } });
  const { createProps, preloadPropModels } = await import('./props.ts');
  const { ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
  const { wreckPool } = await import('./wrecks.ts');
  globalThis.fetch = async url => new Response(readFileSync(url));
  await preloadPropModels();
  await Promise.all(wreckPool('modern').map(id => ensureTankBuilder(id)));
  installFixtureCanvas();
  async function build() {
    globalThis.__waterworksRng = [];
    const props = createProps(createHeightField(seed, reservoir), { anisotropy: 4, setupShadowMaterial() {} }, 2002, reservoir);
    await props.sourcedTexturesReady;
    const rng = globalThis.__waterworksRng.map(row => ({ seed: row.seed, count: row.count, tail: [row.next(), row.next(), row.next()] }));
    return { props, rng, seam, meshes: recordMeshes(props) };
  }
  const before = await build(); control = false; const after = await build();
  assert.deepEqual(after.rng, before.rng, 'all real producer RNG counts and subsequent values are preserved');
  assert.deepEqual(after.meshes.rows, before.meshes.rows, 'all non-donor material families and instances are byte-identical');
  assert.deepEqual(after.meshes.mats, before.meshes.mats, 'no new shader/material family');
  assert.ok(after.meshes.vertices <= before.meshes.vertices && after.meshes.attributeBytes <= before.meshes.attributeBytes);
  for (const key of ['obstacles', 'colliders']) {
    const donorKey = key === 'obstacles' ? 'obstacle' : 'collider';
    const indices = before.seam.donors.map(d => before.props[key].indexOf(d[donorKey]));
    assert.equal(indices.length, 3, 'all three original physical slots are tracked, even after the temporary capture is cleared');
    assert.ok(indices.every(i => i >= 0));
    assert.equal(after.props[key].length, before.props[key].length);
    for (let i = 0; i < before.props[key].length; i++) {
      if (indices.includes(i)) assert.equal(after.props[key][i].kind, 'waterworks');
      else assert.deepEqual(after.props[key][i], before.props[key][i], 'all other full-world physical records unchanged');
    }
  }
  for (const key of ['crushables', 'destructibles', 'looseRecords', 'tankWreckSpots',
    'utilityNetwork', 'utilityPolePlacements', 'decorationGroundingReceipts', 'features']) {
    assert.equal(hash(JSON.stringify(after.props[key])), hash(JSON.stringify(before.props[key])), `${key}: later authoring preserved`);
  }
  console.log(JSON.stringify({ seed, donors: after.seam.result.donors, before: after.seam.result.before,
    after: after.seam.result.after, bodies: after.seam.result.bodies, fullWorldVertices: [before.meshes.vertices, after.meshes.vertices] }));
}

function validateAssembly(receipt, buckets, field) {
  assert.equal(receipt.bodies.length, 3); assert.equal(receipt.pipe.length, 8);
  assert.ok(receipt.after.triangles <= receipt.before.triangles);
  assert.ok(receipt.after.sourceBytes <= receipt.before.sourceBytes);
  assert.ok(receipt.after.mergedBytes <= receipt.before.mergedBytes);
  const geometry = Object.values(buckets).flat().filter(g => g.name.startsWith('reservoir-'));
  for (const g of geometry) {
    assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv']);
    for (const a of Object.values(g.attributes)) assert.ok([...a.array].every(Number.isFinite));
    for (const i of g.index.array) assert.ok(i < g.attributes.position.count);
    g.computeBoundingBox();
  }
  for (const body of receipt.bodies) {
    const box = geometry.find(g => g.name === `reservoir-${body.name}-body`).boundingBox;
    const cap = geometry.find(g => g.name === `reservoir-${body.name}-cap`).boundingBox;
    assert.ok(Math.abs(box.min.x - (body.x - body.width / 2)) < 1e-5);
    assert.ok(Math.abs(box.max.x - (body.x + body.width / 2)) < 1e-5);
    assert.ok(Math.abs(box.min.y - body.bottom) < 1e-5 && Math.abs(box.max.y - body.top) < 1e-5);
    assert.ok(cap.min.y < box.max.y - 0.05 && cap.max.y > box.max.y + 0.05,
      'roof cap is visible above the opaque body and overlaps its actual support');
    assert.ok(Math.abs(cap.min.x - box.min.x) < 1e-5 && Math.abs(cap.max.x - box.max.x) < 1e-5
      && Math.abs(cap.min.z - box.min.z) < 1e-5 && Math.abs(cap.max.z - box.max.z) < 1e-5,
    'full-footprint body/cap union exactly matches the existing simple collision slot');
    for (let x = box.min.x; x <= box.max.x; x += 0.5) for (let z = box.min.z; z <= box.max.z; z += 0.5) {
      assert.ok(body.bottom < field.getHeightAt(x, z), 'whole foundation is buried, never placed on its centre alone');
      assert.ok(field._roadDist(x, z) >= 8);
    }
  }
  const bankCap = geometry.find(g => g.name === 'reservoir-bank-cap').boundingBox;
  const hatches = geometry.filter(g => g.name === 'reservoir-bank-hatch');
  assert.equal(hatches.length, 2, 'both service hatches survive inside the same piece budget');
  for (const hatch of hatches) {
    const b = hatch.boundingBox;
    assert.ok(b.min.y < bankCap.max.y - 0.03 && b.max.y > bankCap.max.y + 0.03,
      'shallow hatch overlaps its actual cap support and remains visibly exposed above it');
    assert.ok(b.min.x >= bankCap.min.x && b.max.x <= bankCap.max.x
      && b.min.z >= bankCap.min.z && b.max.z <= bankCap.max.z, 'no unsupported hatch overhang');
  }
  const pipe = geometry.find(g => g.name === 'reservoir-connected-penstock');
  assert.equal(pipe.attributes.position.count, 58); assert.equal(pipe.index.count, 288);
  const p = pipe.attributes.position;
  for (let i = 0; i < 56; i++) assert.ok(p.getY(i) > field.getHeightAt(p.getX(i), p.getZ(i)), 'tube rings clear actual bank');
  for (const g of geometry.filter(g => g.name === 'reservoir-penstock-support')) {
    const b = g.boundingBox, x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
    for (const px of [b.min.x, b.max.x]) for (const pz of [b.min.z, b.max.z]) {
      assert.ok(b.min.y < field.getHeightAt(px, pz), 'brace feet are buried across the footprint');
    }
    const ring = receipt.pipe.find(v => Math.hypot(v[0] - x, v[2] - z) < 1e-5);
    assert.ok(ring && b.max.y > ring[1] - Math.sin(Math.PI / 3) * 0.34, 'brace intersects its connected pipe ring');
  }
}

function fixture() {
  const buckets = { stone: [], wood: [], dark: [slabBox(1, 1, 1)] };
  const donors = Array.from({ length: 3 }, (_, i) => {
    const stone = Array.from({ length: 13 }, () => slabBox(1, 1, 1).translate(-200 + i * 10, 0, 160));
    buckets.stone.push(...stone);
    const record = () => setCircleShape({ min: [-202 + i * 10, -1, 158], max: [-198 + i * 10, 1, 162] }, -200 + i * 10, 160, 2);
    return { stone, wood: [], obstacle: record(), collider: record() };
  });
  return { buckets, donors, blockers: donors.flatMap(d => [d.obstacle, d.collider]) };
}

if (process.argv[2] === '--world') {
  await wholeWorld(Number(process.argv[3]));
} else {
  const { composeReservoirWaterworks } = await import('./reservoirWaterworks.ts');
  const field = createHeightField(1337, reservoir), cfg = reservoir.props.reservoirWaterworks;
  for (const id of MAP_IDS.filter(id => id !== 'reservoir')) {
    const f = fixture(), geometry = Object.values(f.buckets).flat(), hashes = geometry.map(geometryHash);
    assert.equal(composeReservoirWaterworks(id, cfg, field, f.donors, f.buckets, f.blockers), null);
    assert.deepEqual(Object.values(f.buckets).flat(), geometry, `${id}: same geometry objects`);
    assert.deepEqual(geometry.map(geometryHash), hashes, `${id}: byte-identical despite supplied opt-in`);
    geometry.forEach(g => g.dispose());
  }
  for (const failure of ['unavailable', 'occupied', 'wet-kiosk', 'steep-kiosk', 'budget']) {
    const f = fixture(); let terrain = field;
    if (failure === 'unavailable') f.donors.pop();
    if (failure === 'occupied') f.blockers.push({ min: [43, -8, 97], max: [44, 2, 98] });
    if (failure === 'wet-kiosk') terrain = { ...field, getWaterMaskAt: () => 1 };
    if (failure === 'steep-kiosk') terrain = { ...field, getHeightAt: (x, z) => x < 18 ? x : field.getHeightAt(x, z) };
    if (failure === 'budget') f.donors[0].stone.splice(0, 12);
    const geometry = Object.values(f.buckets).flat(), hashes = geometry.map(geometryHash), records = clone(f.blockers);
    const result = composeReservoirWaterworks('reservoir', cfg, terrain, f.donors, f.buckets, f.blockers);
    assert.notEqual(result.status, 'built');
    assert.deepEqual(Object.values(f.buckets).flat(), geometry, `${failure}: no partial replacement`);
    assert.deepEqual(geometry.map(geometryHash), hashes); assert.deepEqual(f.blockers, records);
    geometry.forEach(g => g.dispose());
  }
  for (const seed of [1337, 2049, 7719]) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--world', String(seed)],
      { encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    console.log(child.stdout.trim());
  }
  console.log('reservoirWaterworks: actual3-seed full-world donors, atomic safety, budgets, geometry/physics/RNG and other29 guards PASS');
}
