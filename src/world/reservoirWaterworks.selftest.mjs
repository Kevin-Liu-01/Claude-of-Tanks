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
import { pushHullFromObstacle, rayCollisionRecord, setCircleShape,
  shellPassesThroughCollisionRecord } from './collision.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const geometryHash = geometry => hash(Buffer.concat([
  ...Object.values(geometry.attributes).map(a => bytes(a.array)),
  ...(geometry.index ? [bytes(geometry.index.array)] : []),
]));
const clone = value => JSON.parse(JSON.stringify(value));
// Captured from the V25 producer before the intake-only reprofile. The named
// kiosk/bank/penstock partition includes every position/normal/UV/index byte.
const fixedPartition = {
  1337: '1a3aeae9cd1844391de1b7b832f9352404d511d4b7a3cfa833b477d2d1bcb45f',
  2049: 'de198fa60378d42bec58042783b0da71bcc7ac87d260ed374ee718dd514703b3',
  7719: '0a4508862b4253469e1400708e8cd209a1ac8ce81e9e6c1392421f2961345a9e',
};

function unchangedPartitionHash(geometry) {
  const h = createHash('sha256');
  for (const name of ['kiosk-body', 'kiosk-cap', 'bank-body', 'bank-cap', 'kiosk-door',
    'kiosk-window', 'kiosk-lintel', 'kiosk-vent', 'bank-hatch', 'bank-stop',
    'connected-penstock', 'penstock-support']) {
    for (const g of geometry.filter(g => g.name === `reservoir-${name}`)) {
      h.update(g.name);
      for (const a of Object.values(g.attributes)) h.update(bytes(a.array));
      h.update(bytes(g.index.array));
    }
  }
  return h.digest('hex');
}

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
          assert.deepEqual(ob.max, [body.x + body.width / 2, body.collisionTop, body.z + body.depth / 2]);
          assert.deepEqual(ob.shape2, { kind: 'obb', cx: body.x, cz: body.z,
            hw: body.width / 2, hl: body.depth / 2, yaw: 0 });
        }
      }
      validateAssembly(result, buckets, field);
      const geometry = Object.values(buckets).flat().filter(g => g.name.startsWith('reservoir-'));
      assert.equal(unchangedPartitionHash(geometry), fixedPartition[seed],
        'kiosk, bank, pipe and every support remain byte-identical to V25');
      validateIntake(result, geometry, donors[2].collider);
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

function validateBodySupport(body, geometry, field) {
  const box = geometry.find(g => g.name === `reservoir-${body.name}-body`).boundingBox;
  const cap = geometry.find(g => g.name === `reservoir-${body.name}-cap`).boundingBox;
  assert.ok(Math.abs(box.min.x - (body.x - body.width / 2)) < 1e-5);
  assert.ok(Math.abs(box.max.x - (body.x + body.width / 2)) < 1e-5);
  assert.ok(Math.abs(box.min.y - body.bottom) < 1e-5 && Math.abs(box.max.y - body.top) < 1e-5);
  assert.ok(cap.min.y < box.max.y - 0.05 && cap.max.y > box.max.y + 0.05,
    'roof cap is visible above the opaque body and overlaps its actual support');
  assert.ok(Math.abs(cap.min.x - box.min.x) < 1e-5 && Math.abs(cap.max.x - box.max.x) < 1e-5
    && Math.abs(cap.min.z - box.min.z) < 1e-5 && Math.abs(cap.max.z - box.max.z) < 1e-5,
  'body and closed cap retain the same exact hard collision plan');
  for (let x = box.min.x; x <= box.max.x; x += 0.5) for (let z = box.min.z; z <= box.max.z; z += 0.5) {
    assert.ok(body.bottom < field.getHeightAt(x, z), 'whole foundation is buried, never placed on its centre alone');
    assert.ok(field._roadDist(x, z) >= 8);
  }
}

function validateAssembly(receipt, buckets, field) {
  assert.equal(receipt.bodies.length, 3); assert.equal(receipt.pipe.length, 8);
  assert.ok(receipt.after.triangles <= receipt.before.triangles);
  assert.ok(receipt.after.sourceBytes <= receipt.before.sourceBytes);
  assert.ok(receipt.after.mergedBytes <= receipt.before.mergedBytes);
  assert.deepEqual(receipt.after, { geometries: 31, triangles: 456, sourceBytes: 27632, mergedBytes: 43776 },
    'the intake reprofile preserves every current source/merged budget, not just the larger donor allowance');
  const geometry = Object.values(buckets).flat().filter(g => g.name.startsWith('reservoir-'));
  for (const g of geometry) {
    assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv']);
    for (const a of Object.values(g.attributes)) assert.ok([...a.array].every(Number.isFinite));
    for (const i of g.index.array) assert.ok(i < g.attributes.position.count);
    g.computeBoundingBox();
  }
  for (const body of receipt.bodies) validateBodySupport(body, geometry, field);
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

function meshDistance(geometries, origin, direction) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster(origin, direction, 0, 100);
  const meshes = geometries.map(g => new THREE.Mesh(g, material));
  const hits = ray.intersectObjects(meshes, false);
  material.dispose();
  return hits[0]?.distance ?? -1;
}

function validateTrimAttachment(body, geometry) {
  const b = geometry.boundingBox;
  const axis = b.max.z > body.z + body.depth / 2 ? 'z' : 'x';
  const tangent = axis === 'x' ? 'z' : 'x';
  const half = axis === 'x' ? body.width / 2 : body.depth / 2;
  const tangentHalf = axis === 'x' ? body.depth / 2 : body.width / 2;
  const face = body[axis] + half;
  assert.ok(b.min[axis] < face - 0.009 && b.max[axis] > face + 0.009,
    `${geometry.name}: real +${axis} masonry overlap plus visible attached relief`);
  assert.ok(b.max[axis] <= face + 0.060005, 'trim is explicitly shallow, not extra hard footprint');
  assert.ok(b.min.y >= body.bottom && b.max.y <= body.top + 1e-5);
  assert.ok(b.min[tangent] > body[tangent] - tangentHalf && b.max[tangent] < body[tangent] + tangentHalf);
  return axis;
}

function validateApproachScreen(body, geometry) {
  const b = geometry.boundingBox, uv = geometry.attributes.uv;
  const screen = geometry.name === 'reservoir-intake-screen';
  const width = screen ? 2.8 : 2.9, depth = screen ? 0.10 : 0.16;
  assert.ok(Math.abs(b.max.x - b.min.x - width) < 1e-5, 'exposed screen/bar has its authored along-X width');
  assert.ok(Math.abs(b.max.z - b.min.z - depth) < 1e-5);
  assert.ok(Math.abs((b.max.x + b.min.x) / 2 - body.x) < 1e-5);
  assert.ok(Math.abs((b.max.z + b.min.z) / 2 - (body.z + body.depth / 2 - 0.02)) < 1e-5);
  const faceU = [16, 17, 18, 19].map(i => uv.getX(i));
  assert.ok(Math.abs(Math.max(...faceU) - Math.min(...faceU) - width * 0.65) < 1e-5,
    'existing slab primitive rebuilds metric UVs for the widened +Z face');
}

function validateIntakeFacade(body, geometry) {
  const trim = geometry.filter(g =>
    /reservoir-(intake-screen|intake-face-pier|intake-header|screen-crossbar)$/.test(g.name));
  assert.equal(trim.length, 11, 'two screens, six bars, two buttresses and one header are reused');
  const approach = trim.filter(g => validateTrimAttachment(body, g) === 'z');
  assert.equal(approach.length, 4, 'exactly one existing screen and three bars move to the approach wall');
  assert.equal(approach.filter(g => g.name === 'reservoir-intake-screen').length, 1);
  assert.equal(approach.filter(g => g.name === 'reservoir-screen-crossbar').length, 3);
  for (const g of approach) validateApproachScreen(body, g);
  const header = trim.find(g => g.name === 'reservoir-intake-header').boundingBox;
  const piers = trim.filter(g => g.name === 'reservoir-intake-face-pier');
  for (const g of piers) assert.ok(g.boundingBox.intersectsBox(header)
    && g.boundingBox.max.y > header.min.y + 0.2, 'both buttresses visibly support the header');
  const screens = trim.filter(g => g.name === 'reservoir-intake-screen');
  for (const g of trim.filter(g => g.name === 'reservoir-screen-crossbar')) {
    assert.ok(screens.some(s => s.boundingBox.intersectsBox(g.boundingBox)), 'bar intersects a real screen');
  }
  return trim;
}

function validateHood(body, hood) {
  const p = hood.attributes.position, n = hood.attributes.normal, uv = hood.attributes.uv;
  assert.equal(p.count, 24); assert.equal(hood.index.count, 36);
  assert.ok(Math.abs(body.top + 0.6) < 1e-8);
  assert.ok(Math.abs(body.collisionTop - 0.44) < 1e-5);
  let bottomCount = 0, upperCount = 0;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getX(i) - body.x) <= body.width / 2 + 1e-5);
    assert.ok(Math.abs(p.getZ(i) - body.z) <= body.depth / 2 + 1e-5);
    assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
    if (p.getY(i) < body.top) {
      bottomCount++;
      assert.ok(Math.abs(p.getY(i) - (body.top - 0.06)) < 1e-5, 'whole underside embedded in solid support');
      assert.ok(Math.abs(Math.abs(p.getX(i) - body.x) - body.width / 2) < 1e-5);
      assert.ok(Math.abs(Math.abs(p.getZ(i) - body.z) - body.depth / 2) < 1e-5);
    } else {
      upperCount++;
      assert.ok(Math.abs(p.getY(i) - body.collisionTop) < 1e-5, 'flat closed top matches the actual collision height');
      assert.ok(Math.abs(Math.abs(p.getX(i) - body.x) - body.width / 2) < 1e-5);
      assert.ok(Math.abs(Math.abs(p.getZ(i) - body.z) - body.depth / 2) < 1e-5);
    }
  }
  assert.equal(bottomCount, 12); assert.equal(upperCount, 12);
  // The top face uses actual deformed dimensions, not the old broad 12cm cap UVs.
  const edge3 = Math.hypot(p.getX(8) - p.getX(9), p.getY(8) - p.getY(9), p.getZ(8) - p.getZ(9));
  const edgeUv = Math.hypot(uv.getX(8) - uv.getX(9), uv.getY(8) - uv.getY(9));
  assert.ok(Math.abs(edgeUv / edge3 - 0.65) < 0.002, 'closed top retains metric texture density');
  const vRange = Math.max(...Array.from({ length: 4 }, (_, i) => uv.getY(i)))
    - Math.min(...Array.from({ length: 4 }, (_, i) => uv.getY(i)));
  assert.ok(vRange > 0.5, 'service-head face does not stretch a 12cm UV range over its full height');
}

function validateIntakeCollision(body, geometry, collider, trim) {
  const solid = geometry.filter(g => ['reservoir-intake-body', 'reservoir-intake-cap'].includes(g.name));
  validateHoodRayParity(body, solid, collider);
  const normal = new THREE.Vector3(), direction = new THREE.Vector3(-1, 0, 0);
  const front = body.x + body.width / 2;
  assert.equal(shellPassesThroughCollisionRecord(collider), false, 'closed waterworks remain hard ballistic cover');
  for (const y of [-7.5, -5, -2, body.top - 0.001]) {
    for (const z of [body.z - 2.9, body.z, body.z + 2.9]) {
      const origin = new THREE.Vector3(front + 2, y, z);
      const physical = rayCollisionRecord(origin, direction, collider, 100, normal);
      const visible = meshDistance(solid, origin, direction);
      assert.ok(Math.abs(physical - visible) < 1e-5,
        'full-height rectangular masonry and tank-contact region exactly match the hard OBB');
      const decorated = meshDistance([...solid, ...trim], origin, direction);
      assert.ok(physical - decorated >= -1e-5 && physical - decorated <= 0.06001,
        'decorative relief is bounded separately from hard collision');
    }
  }
  for (const gap of [0.24, 0.26]) {
    const push = { x: 0, z: 0 };
    assert.equal(pushHullFromObstacle({ x: front + gap, z: body.z }, 0, 1, 1, 0,
      0.25, 0.25, collider, push), gap < 0.25, 'tank footprint contacts the existing hard plan only');
  }
  assert.equal(rayCollisionRecord(new THREE.Vector3(front + 1, body.collisionTop + 0.001, body.z),
    new THREE.Vector3(-1, 0, 0), collider, 100, normal), -1, 'nothing blocks above the actual hood maximum');
}

function assertShellParity(solid, collider, origin, direction, label) {
  const physical = rayCollisionRecord(origin, direction, collider, 100, new THREE.Vector3());
  const visible = meshDistance(solid, origin, direction);
  assert.equal(physical >= 0, visible >= 0, `${label}: no invisible blocker or missing solid cover`);
  assert.ok(Math.abs(physical - visible) < 1e-5,
    `${label}: physical ${physical}m versus emitted shell ${visible}m`);
}

function validateHoodRayParity(body, solid, collider) {
  // These horizontal rays falsified the prior vertical-slack-only test:
  // the tapered hood used to hit at7.486667m / miss while its OBB hit at1m.
  for (const z of [99, 101.9]) assertShellParity(solid, collider,
    new THREE.Vector3(51, 0.43, z), new THREE.Vector3(-1, 0, 0), 'reported upper-band ray');
  let cases = 2;
  const heights = [body.bottom - 0.001, body.bottom + 0.001, -5, body.top - 0.001,
    body.top + 0.001, 0.14, 0.43, body.collisionTop - 0.0001, body.collisionTop + 0.0001];
  for (let angle = 0; angle < 32; angle++) {
    const dx = Math.cos(angle * Math.PI / 16), dz = Math.sin(angle * Math.PI / 16);
    for (const y of heights) {
      assertShellParity(solid, collider, new THREE.Vector3(body.x + dx * 12, y, body.z + dz * 12),
        new THREE.Vector3(-dx, 0, -dz), 'azimuth / full-height ray');
      cases++;
    }
    const origin = new THREE.Vector3(body.x + dx * 12, body.collisionTop + 4, body.z + dz * 12);
    const below = origin.clone().setY(body.bottom - 4);
    for (const y of [body.bottom, body.top, body.collisionTop]) {
      assertShellParity(solid, collider, origin,
        new THREE.Vector3(body.x, y, body.z).sub(origin).normalize(), 'descending diagonal ray');
      assertShellParity(solid, collider, below,
        new THREE.Vector3(body.x, y, body.z).sub(below).normalize(), 'ascending diagonal ray');
      cases += 2;
    }
  }
  for (const x of [-3.501, -3.499, -3.2, 0, 3.2, 3.499, 3.501]) {
    for (const z of [-3.001, -2.999, -2.7, 0, 2.7, 2.999, 3.001]) {
      assertShellParity(solid, collider, new THREE.Vector3(body.x + x, 3, body.z + z),
        new THREE.Vector3(0, -1, 0), 'vertical interior / exterior edge ray');
      assertShellParity(solid, collider, new THREE.Vector3(body.x + x, body.bottom - 3, body.z + z),
        new THREE.Vector3(0, 1, 0), 'upward interior / exterior edge ray');
      cases += 2;
    }
  }
  for (const offset of [-0.0001, 0.0001]) {
    for (const y of [body.top + 0.001, body.collisionTop - 0.001]) {
      assertShellParity(solid, collider,
        new THREE.Vector3(body.x + body.width / 2 + offset, y, body.z + 8),
        new THREE.Vector3(0, 0, -1), 'grazing upper side');
      cases++;
    }
  }
  assert.equal(cases, 584, 'all azimuth, ascending/descending, vertical, reported and grazing cases executed');
}

function validateIntake(receipt, geometry, collider) {
  const body = receipt.bodies[2], hood = geometry.find(g => g.name === 'reservoir-intake-cap');
  validateHood(body, hood);
  const trim = validateIntakeFacade(body, geometry);
  validateIntakeCollision(body, geometry, collider, trim);
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
