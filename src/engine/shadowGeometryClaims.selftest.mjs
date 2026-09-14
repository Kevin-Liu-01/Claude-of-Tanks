import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { markShadowOnly, SHADOW_ONLY_LAYER } from './renderLayers.ts';

if (typeof global.gc !== 'function') {
  const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], {
    stdio: 'inherit', timeout: 30_000,
  });
  assert.equal(child.error, undefined, 'native GC test must finish within its finite timeout');
  assert.equal(child.status, 0, 'native GC child must pass');
  process.exit(0);
}

// Execute the actual private cascade-caster-proxy block (r8, 2026-09-13),
// without constructing a renderer or exposing production test APIs. Three's
// real meshes, lights and attributes exercise the same proxy build, per-cascade
// compaction, upload marking and draw hooks the shadow pass uses.
const source = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
const start = source.indexOf('const SHADOW_CULL_MIN_TRIS =');
const end = source.indexOf('// --- r6 SHADOW-CASTER RESCUE', start);
assert.ok(start >= 0 && end > start, 'the complete production caster-proxy block must be present');
const actual = stripTypeScriptTypes(source.slice(start, end), { mode: 'strip' });
const shadows = new Function('THREE', 'markShadowOnly', `${actual}\nreturn {
  register: registerCasterCascades, resolve: resolveCasterRecord, build: buildCasterRecord,
  update: updateCasterProxies, before: casterProxyBeforeShadow, after: casterProxyAfterShadow,
  records: _casterRecords, owners: _casterOwners, proxyOf: _proxyOf,
  MIN_TRIS: SHADOW_CULL_MIN_TRIS, MARGIN: SHADOW_CULL_MARGIN,
};`)(THREE, markShadowOnly);

function makeGeometry(capacity = 3) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const weights = new Float32Array(capacity);
  weights.set([11, 22, 33]);
  geometry.setAttribute('instanceWeight', new THREE.InstancedBufferAttribute(weights, 1));
  return geometry;
}

const OWNER_X = [100, 0, 200];
function makeMesh(geometry, capacity = 3) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), capacity);
  for (let i = 0; i < 3; i++) {
    mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(OWNER_X[i], 0, 0));
    mesh.setColorAt(i, new THREE.Color(0.1 + i * 0.2, 0.2, 0.3));
  }
  mesh.count = 3;
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** A cascade light whose orthographic box spans ±halfExtent across the scene, looking down obliquely. */
function makeCascade(halfExtent) {
  const light = new THREE.DirectionalLight();
  const cam = light.shadow.camera;
  cam.left = -halfExtent; cam.right = halfExtent; cam.top = halfExtent; cam.bottom = -halfExtent;
  cam.near = 0.5; cam.far = 1000;
  cam.updateProjectionMatrix();
  light.position.set(0, 200, 100);
  light.target.position.set(0, 0, 0);
  return light;
}

const lights = [makeCascade(50), makeCascade(150), makeCascade(5000)];
shadows.register(lights);
const cam = (i) => lights[i].shadow.camera;

// --- qualification gate: light meshes never get proxies, heavy ones do -------
{
  const light = makeMesh(makeGeometry());
  assert.equal(shadows.resolve(light), null, `12 tris x 3 instances sits under the ${shadows.MIN_TRIS}-tri gate`);
  assert.equal(light.children.length, 0, 'an unqualified owner gets no proxies');
  const heavy = makeMesh(makeGeometry(3000), 3000);
  const rec = shadows.resolve(heavy);
  assert.ok(rec, '12 tris x 3000 capacity qualifies');
  assert.equal(rec.proxies.length, lights.length - 1, 'one proxy per cascade except the last');
  assert.equal(heavy.children.length, 2, 'proxies are children of their owner');
  for (const proxy of rec.proxies) {
    assert.equal(proxy.layers.mask, 1 << SHADOW_ONLY_LAYER, 'proxies live on the shadow-only layer');
    assert.equal(proxy.geometry.attributes.position, heavy.geometry.attributes.position, 'vertex buffers are shared with the owner');
    assert.notEqual(proxy.geometry.attributes.instanceWeight, heavy.geometry.attributes.instanceWeight, 'instanced attributes are the proxy\'s own');
    assert.equal(proxy.instanceMatrix.count, 3000, 'proxy instance capacity matches the owner');
    assert.ok(proxy.instanceColor, 'the owner\'s instance-colour variant is mirrored');
    assert.equal(proxy.count, 0);
    assert.equal(proxy.frustumCulled, false);
    assert.equal(proxy.castShadow, true);
    assert.equal(proxy.receiveShadow, false);
    const hits = [];
    proxy.count = 3;
    proxy.raycast(new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0)), hits);
    assert.equal(hits.length, 0, 'shadow proxies never answer picking rays');
    proxy.count = 0;
  }
}

// --- per-cascade compaction: exactly the visible instances, in owner order ---
const geometry = makeGeometry();
const mesh = makeMesh(geometry);
const world = new THREE.Group();
world.add(mesh);
mesh.updateMatrixWorld(true);
const ownerBytes = Float32Array.from(mesh.instanceMatrix.array);
const rec = shadows.build(mesh);
assert.ok(rec && rec.proxies.length === 2, 'a direct build mirrors the small owner for the two near cascades');
assert.equal(rec.ready, false, 'an owner casts everywhere until its proxies hold a compaction');
{
  mesh.count = 3;
  shadows.before(mesh, cam(0));
  assert.equal(mesh.count, 3, 'not-yet-compacted owners keep drawing in near cascades');
  shadows.after(mesh);
}
shadows.update(lights, world, true);
assert.equal(rec.ready, true);
assert.deepEqual(Array.from(rec.counts), [1, 2], 'cascade 0 (±50 m) sees x=0; cascade 1 (±150 m) sees x=100 and x=0');
{
  const [p0, p1] = rec.proxies;
  assert.deepEqual(Array.from(p0.instanceMatrix.array.slice(0, 16)), Array.from(ownerBytes.slice(16, 32)), 'cascade 0 prefix = owner instance 1');
  assert.equal(p0.geometry.attributes.instanceWeight.array[0], 22, 'instanced attributes travel with their instance');
  assert.deepEqual(Array.from(p1.instanceMatrix.array.slice(0, 32)), Array.from(ownerBytes.slice(0, 32)), 'cascade 1 prefix = owner instances 0,1 in owner order');
  assert.deepEqual(Array.from(p1.geometry.attributes.instanceWeight.array.slice(0, 2)), [11, 22]);
  assert.deepEqual(p0.instanceMatrix.updateRanges, [{ start: 0, count: 16 }], 'only the compacted prefix is marked for upload');
  assert.deepEqual(p1.instanceMatrix.updateRanges, [{ start: 0, count: 32 }]);
  assert.deepEqual(p1.geometry.attributes.instanceWeight.updateRanges, [{ start: 0, count: 2 }]);
  assert.ok(p0.instanceMatrix.version > 0 && p1.instanceMatrix.version > 0, 'needsUpdate bumped the proxy versions');
  assert.deepEqual(Array.from(mesh.instanceMatrix.array), Array.from(ownerBytes), 'owner bytes are never written');
  assert.equal(mesh.count, 3, 'owner count is untouched by compaction');
}

// --- draw hooks: proxies draw only in their cascade, owners only in the last --
{
  const [p0, p1] = rec.proxies;
  shadows.before(p0, cam(0)); assert.equal(p0.count, 1, 'proxy 0 draws its compaction in cascade 0');
  shadows.after(p0); assert.equal(p0.count, 0, 'proxies return to zero after their draw');
  shadows.before(p0, cam(1)); assert.equal(p0.count, 0, 'proxy 0 draws nothing in cascade 1');
  shadows.after(p0);
  shadows.before(p1, cam(1)); assert.equal(p1.count, 2); shadows.after(p1);
  shadows.before(p1, cam(2)); assert.equal(p1.count, 0); shadows.after(p1);
  shadows.before(mesh, cam(0)); assert.equal(mesh.count, 0, 'the owner yields near cascades to its proxies');
  shadows.after(mesh); assert.equal(mesh.count, 3, 'the owner has its count back for the colour pass');
  shadows.before(mesh, cam(1)); assert.equal(mesh.count, 0); shadows.after(mesh); assert.equal(mesh.count, 3);
  shadows.before(mesh, cam(2)); assert.equal(mesh.count, 3, 'the owner itself casts into the last cascade');
  shadows.after(mesh); assert.equal(mesh.count, 3);
  mesh.count = 0;
  shadows.before(mesh, cam(2)); shadows.after(mesh);
  assert.equal(mesh.count, 0, 'an owner emptied by its world stays empty through the hooks');
  mesh.count = 3;
  // the probe escape hatch: owners draw everything, proxies nothing
  globalThis.window = { __SHADOW_DEBUG: { noCull: true } };
  shadows.before(mesh, cam(0)); assert.equal(mesh.count, 3, 'noCull: the owner draws every instance everywhere');
  shadows.after(mesh);
  shadows.before(p0, cam(0)); assert.equal(p0.count, 0, 'noCull: proxies stay silent'); shadows.after(p0);
  delete globalThis.window;
}

// --- owners change: instance rewrites re-derive spheres; detached worlds are skipped; geometry swaps rebuild --
{
  mesh.setMatrixAt(2, new THREE.Matrix4().makeTranslation(10, 0, 0));
  mesh.instanceMatrix.needsUpdate = true;
  shadows.update(lights, world, true);
  assert.deepEqual(Array.from(rec.counts), [2, 3], 'moving instance 2 to x=10 brings it into both near cascades');
  assert.equal(rec.proxies[0].geometry.attributes.instanceWeight.array[1], 33, 'the moved instance carries its own attribute');
  const elsewhere = new THREE.Group();
  const detached = makeMesh(makeGeometry());
  elsewhere.add(detached);
  detached.updateMatrixWorld(true);
  const detachedRec = shadows.build(detached);
  shadows.update(lights, world, true);
  assert.equal(detachedRec.ready, false, 'owners outside the lit scene root are not compacted');
  shadows.before(detached, cam(0)); assert.equal(detached.count, 3, 'and keep casting everywhere'); shadows.after(detached);
  const swapped = makeGeometry();
  mesh.geometry = swapped;
  shadows.update(lights, world, true);
  assert.equal(shadows.records.get(mesh), undefined, 'a geometry swap forgets the record so the next draw re-classifies');
  assert.equal(mesh.children.length, 0, 'and removes the stale proxies');
  assert.equal(shadows.proxyOf.has(rec.proxies[0] ?? {}), false);
}

// --- memory: a discarded world is collected while its shared library geometry lives on ---
const nextTask = () => new Promise(resolve => setImmediate(resolve));
async function requireCollected(refs, label) {
  for (let attempt = 0; attempt < 16; attempt++) {
    await nextTask();
    global.gc();
    await nextTask();
    if (refs.every(ref => ref.deref() === undefined)) return;
  }
  assert.fail(`${label}: object remains retained while its library geometry is alive`);
}
function buildDiscardedWorld(sharedGeometry) {
  const discarded = new THREE.Group();
  const owner = makeMesh(sharedGeometry);
  discarded.add(owner);
  owner.updateMatrixWorld(true);
  const record = shadows.build(owner);
  shadows.update(lights, discarded, true);
  assert.equal(record.ready, true);
  return [new WeakRef(owner), new WeakRef(discarded), ...record.proxies.map((proxy) => new WeakRef(proxy))];
}
{
  const shared = makeGeometry();
  const library = new Map([['cached-pole', shared]]);
  const refs = buildDiscardedWorld(shared);
  await requireCollected(refs, 'discarded owner, its proxies and its world');
  assert.equal(library.get('cached-pole'), shared, 'the shared geometry itself stays strongly alive');
  shadows.update(lights, world, true);
  assert.ok(shadows.owners.every((ref) => ref.deref() !== undefined), 'the per-frame pass prunes dead owners');
}

console.log(`shadowGeometryClaims.selftest: caster proxies — gate, per-cascade compaction in owner order, upload ranges, draw hooks (owner/proxy/noCull), rewrites, detached worlds, geometry swap and GC PASS`);
