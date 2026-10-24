// brokenVehiclePool.selftest.mjs — perf-248: the burnt vehicles' and the broken carts' bodies built off the main thread
// (brokenVehiclePool.ts) are the bodies the inline build makes.
// 1. Every civilian and cart role on three maps and both tiers: `brokenJob` spends exactly the draws `broken` spends, the
//    body built from the job (brokenVehicleBuild.ts) is `broken`'s, and the wire (brokenVehicleJob.ts) carries it exactly:
//    the attributes in order with their bytes, the index, the draw range, the bounds, the name and the userData (a Box3
//    rebuilt as one).
// 2. The pooled build path (the deferred pool: the jobs posted as the pools finalize, the bodies built and sent through
//    the wire at the join) builds a world whose packed collision and every destructible mesh equal the inline build's.
// 3. The worker pool: posting, the newest job stolen and completed, a late reply dropped, a failed worker leaving its jobs
//    to the join, disposal.
// 4. The wiring: the props build posts as each pool finalizes and joins before the build returns; the async driver
//    waits at the join; workers only in the async build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installWorldBuildFixture, buildWorldCollisionData } from '../../tools/headlessWorldCollision.mjs';
import { civilianVehicleOverrides } from './maps/civilianVehicleKit.ts';
import { cartOverrides } from './maps/cartKit.ts';
import { buildBrokenVehicle } from './brokenVehicleBuild.ts';
import { packBrokenVehicleGeometry, unpackBrokenVehicleGeometry } from './brokenVehicleJob.ts';
import { createDeferredBrokenVehiclePool, setBrokenVehiclePoolFactory } from './brokenVehiclePool.ts';

installWorldBuildFixture();
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function seeded(seed) {
  let draws = 0;
  return { draws: () => draws, rng: () => {
    draws++; seed += 0x6D2B79F5; let v = seed;
    v = Math.imul(v ^ v >>> 15, v | 1);
    v ^= v + Math.imul(v ^ v >>> 7, v | 61);
    return ((v ^ v >>> 14) >>> 0) / 4294967296;
  } };
}
/** Every part of a geometry the renderer and the props runtime read, exactly. */
function sameGeometry(actual, expected, label) {
  assert.deepEqual(Object.keys(actual.attributes), Object.keys(expected.attributes), `${label}: attributes in order`);
  for (const [name, a] of Object.entries(expected.attributes)) {
    const b = actual.attributes[name];
    assert.equal(b.array.constructor, a.array.constructor, `${label}: ${name} type`);
    assert.equal(b.itemSize, a.itemSize);
    assert.equal(b.normalized, a.normalized);
    assert.ok(bytes(b.array).equals(bytes(a.array)), `${label}: ${name} bytes`);
  }
  assert.equal(!!actual.index, !!expected.index);
  if (expected.index) assert.ok(bytes(actual.index.array).equals(bytes(expected.index.array)) && actual.index.array.constructor === expected.index.array.constructor, `${label}: index`);
  assert.deepEqual(actual.drawRange, expected.drawRange, `${label}: draw range`);
  assert.deepEqual(actual.groups, expected.groups);
  assert.equal(actual.name, expected.name);
  assert.deepEqual(actual.boundingSphere && [actual.boundingSphere.center.toArray(), actual.boundingSphere.radius],
    expected.boundingSphere && [expected.boundingSphere.center.toArray(), expected.boundingSphere.radius], `${label}: sphere`);
  assert.deepEqual(actual.boundingBox && [actual.boundingBox.min.toArray(), actual.boundingBox.max.toArray()],
    expected.boundingBox && [expected.boundingBox.min.toArray(), expected.boundingBox.max.toArray()], `${label}: box`);
  assert.deepEqual(Object.keys(actual.userData), Object.keys(expected.userData), `${label}: userData keys in order`);
  for (const [key, value] of Object.entries(expected.userData)) {
    const other = actual.userData[key];
    if (value?.isBox3) {
      assert.ok(other instanceof THREE.Box3, `${label}: ${key} is a Box3`);
      assert.deepEqual([other.min.toArray(), other.max.toArray()], [value.min.toArray(), value.max.toArray()]);
    } else if (ArrayBuffer.isView(value)) {
      assert.ok(ArrayBuffer.isView(other) && other.constructor === value.constructor && bytes(other).equals(bytes(value)), `${label}: ${key}`);
    } else assert.deepEqual(other, value, `${label}: ${key}`);
  }
}

// ---- 1. draws, bodies and the wire
let roles = 0;
for (const [mapId, mobile] of [['verdant', false], ['winter', false], ['desert', true]]) {
  const kits = [['civilian', civilianVehicleOverrides(mapId, mobile)], ['cart', cartOverrides(mapId, mobile)]];
  for (const [kit, overrides] of kits) {
    for (const [role, override] of Object.entries(overrides)) {
      const label = `${mapId}${mobile ? ' (mobile)' : ''} ${kit} ${role}`;
      assert.equal(typeof override.brokenJob, 'function', `${label}: a map override carries its job`);
      const a = seeded(0x2481 + roles), b = seeded(0x2481 + roles);
      const inline = override.broken(a.rng);
      const job = override.brokenJob(b.rng);
      assert.equal(b.draws(), a.draws(), `${label}: the job spends the draws the body spends`);
      assert.equal(b.rng(), a.rng(), `${label}: the stream stands where it did`);
      assert.deepEqual({ kit: job.kit, mapId: job.mapId, mobile: job.mobile, role: job.role }, { kit, mapId, mobile, role });
      sameGeometry(buildBrokenVehicle(job), inline, `${label} from the job`);
      const { wire, transfer } = packBrokenVehicleGeometry(buildBrokenVehicle(job));
      const posted = structuredClone(wire, { transfer });
      assert.ok(transfer.every((buffer) => buffer.byteLength === 0), `${label}: the arrays handed over, not copied`);
      sameGeometry(unpackBrokenVehicleGeometry(posted), inline, `${label} through the wire`);
      roles++;
    }
  }
}
assert.ok(roles >= 20, `every role on three maps (${roles})`);
assert.throws(() => buildBrokenVehicle({ kit: 'civilian', mapId: 'verdant', mobile: false, role: 'hovercraft', seed: 1 }), /no hovercraft/);
{
  const grouped = new THREE.BoxGeometry(1, 1, 1);
  grouped.addGroup(0, 6, 0);
  assert.throws(() => packBrokenVehicleGeometry(grouped), /groups and morph attributes do not travel/);
}

// ---- 2. the pooled build path equals the inline build (Verdant: its parked cars, its carts)
const meshDigest = (dressing) => {
  const h = createHash('sha256');
  let broken = 0;
  dressing.group.traverse((object) => {
    if (!object.isMesh || !/^destructible-/.test(object.name)) return;
    if (/-broken$/.test(object.name)) broken++;
    h.update(JSON.stringify({ name: object.name, count: object.count, visible: object.visible, cast: object.castShadow,
      caster: object.userData.shadowCasterProfile ?? null, keys: Object.keys(object.geometry.userData) }));
    for (const [name, a] of Object.entries(object.geometry.attributes)) h.update(name).update(bytes(a.array));
    if (object.geometry.index) h.update(bytes(object.geometry.index.array));
    if (object.instanceMatrix) h.update(bytes(object.instanceMatrix.array));
  });
  return { digest: h.digest('hex'), broken };
};
setBrokenVehiclePoolFactory(null);
let inlineMeshes = null, pooledMeshes = null;
const inlineData = await buildWorldCollisionData('verdant', { inspect: ({ dressing }) => { inlineMeshes = meshDigest(dressing); } });
const pools = [];
setBrokenVehiclePoolFactory(() => { const pool = createDeferredBrokenVehiclePool(); pools.push(pool); return pool; });
const pooledData = await buildWorldCollisionData('verdant', { inspect: ({ dressing }) => { pooledMeshes = meshDigest(dressing); } });
setBrokenVehiclePoolFactory(null);
const posted = pools.reduce((n, pool) => n + pool.stats.posted, 0);
assert.ok(posted >= 2, `the pooled path ran (${posted} bodies posted)`);
assert.equal(pools.reduce((n, pool) => n + pool.stats.answered, 0), posted, 'every body taken through the wire at the join');
assert.equal(JSON.stringify(pooledData), JSON.stringify(inlineData), 'the packed collision equals the inline build\'s, byte for byte');
assert.ok(inlineMeshes.broken > posted, 'the broken meshes outnumber the pooled bodies (the other kinds keep their builders)');
assert.deepEqual(pooledMeshes, inlineMeshes, 'every destructible mesh (geometry bytes, instances, caster profiles) equals the inline build\'s');

// ---- 3. the worker pool
{
  const posts = [];
  const realWorker = globalThis.Worker;
  let failNext = false;
  globalThis.Worker = class {
    constructor() { this.onmessage = null; this.onerror = null; if (failNext) throw new Error('no workers here'); }
    postMessage(message) { posts.push([this, message]); }
    terminate() { this.terminated = true; }
  };
  try {
    const { brokenVehiclePoolFor } = await import('./brokenVehiclePool.ts');
    const job = (seed) => ({ kit: 'cart', mapId: 'verdant', mobile: false, role: Object.keys(cartOverrides('verdant', false))[0], seed });
    const pool = brokenVehiclePoolFor(true);
    const ids = [1, 2, 3].map((seed) => pool.post(job(seed)));
    assert.equal(posts.length, 3, 'three jobs posted');
    let settled = false;
    void pool.settled(60000).then(() => { settled = true; });
    const stolen = pool.steal();
    assert.equal(stolen.id, ids[2], 'the newest job is stolen first');
    const body = buildBrokenVehicle(stolen.job);
    pool.complete(stolen.id, body);
    assert.equal(pool.take(ids[2]), body, 'the stolen build is the job\'s answer');
    // a worker's reply: the first job through the wire; the stolen job's late reply is dropped
    const answer = (id) => {
      const [worker, message] = posts.find(([, m]) => m.id === id);
      const { wire, transfer } = packBrokenVehicleGeometry(buildBrokenVehicle(message.job));
      worker.onmessage({ data: { id, ok: true, wire: structuredClone(wire, { transfer }) } });
    };
    answer(ids[0]);
    sameGeometry(pool.take(ids[0]), buildBrokenVehicle(job(1)), 'a worker\'s answer');
    answer(ids[2]);
    assert.equal(pool.take(ids[2]), body, 'a late reply for a stolen job is dropped');
    assert.equal(settled, false);
    const [worker1] = posts.find(([, m]) => m.id === ids[1]);
    worker1.onmessage({ data: { id: ids[1], ok: false, message: 'boom' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, true, 'the join settles once every job has answered or failed');
    assert.equal(pool.take(ids[1]), null, 'a failed job is left to the join');
    assert.deepEqual({ ...pool.stats }, { posted: 3, answered: 2, failed: 1, stolen: 1 });
    pool.dispose();
    failNext = true;
    const dead = brokenVehiclePoolFor(true);
    const lost = dead.post(job(4));
    assert.equal(dead.take(lost), null, 'no worker: the join builds the body');
    assert.equal(dead.stats.failed, 1);
    await dead.settled(60000);
    assert.equal(brokenVehiclePoolFor(false), null, 'never in a synchronous build');
  } finally {
    globalThis.Worker = realWorker;
  }
}

// ---- 4. the wiring
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(props, /const vehiclePool = brokenVehiclePoolFor\(sourceApplication\.worker === true\);/, 'workers only in the async build');
assert.match(props, /const brokenJob = vehiclePool && meta\.brokenJob \? meta\.brokenJob\(drng\) : null;\s*const legacyB = brokenJob \? null : meta\.broken\(drng\);/,
  'a pool kind spends its draws through the job, every other kind builds as before');
{
  const finalize = props.indexOf('yield* finalizeDestructiblePools();');
  const join = props.indexOf("yield { stage: 'broken-vehicles', brokenVehicles: vehiclePool.settled(BROKEN_VEHICLE_WAIT_MS), stealBrokenVehicle };");
  const ret = props.indexOf('return { group, obstacles, colliders,');
  assert.ok(finalize > 0 && join > finalize && ret > join, 'the join comes after every pool has finalized and before the build returns');
}
assert.match(props, /if \(step\?\.brokenVehicles\) \{/, 'the async driver waits at the join');
const inhabit = readFileSync(new URL('./maps/inhabitKit.ts', import.meta.url), 'utf8');
assert.match(inhabit, /brokenJob: override\.brokenJob,/, 'the carts\' jobs reach their pools');

console.log(`brokenVehiclePool.selftest: ${roles} roles' draws, bodies and wire exact on three maps; the pooled Verdant build `
  + `(${posted} bodies) equals the inline one in collision and every destructible mesh; the worker pool and the wiring PASS`);
