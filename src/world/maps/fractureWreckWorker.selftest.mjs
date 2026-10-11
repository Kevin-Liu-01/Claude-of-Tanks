// fractureWreckWorker.selftest.mjs — (the destructible-kits lane, 2026-10-11; the coordinator: "build wreck states
// lazily: when a piece is first destroyed, or during idle time after the battle is live") the deferred broken states
// built off the page's thread. The production worker runs in a Node thread with only its port adapted (every buffer
// crosses threads), behind the production client: each deferred kind's job is structured-cloneable and builds there the
// very wreck its page builder builds, in the intact's attribute layout (the pool's empty stand-in, so the swap changes
// no program); the client keeps one job in flight and gives up on a failed, silent, refusing or disposed worker; the
// wire refuses what it cannot carry; and props.ts warms its pools through it, drops a reply for a pool that broke first
// and lets the worker go with the world.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { DESTRUCTIBLE_BUILDING_TYPES, shedKitTypes } from './structureKit.ts';
import { buildPillbox, fortFor } from './fortKit.ts';
import { createFractureWreckClient } from './fractureWreckClient.ts';
import { deferredWreck } from './fractureWreckJob.ts';
import { packFractureWreck, unpackFractureWreck } from './fractureWreckWire.ts';

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function digest(g) {
  const h = createHash('sha256');
  for (const [name, a] of Object.entries(g.attributes)) h.update(`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).update(bytes(a.array));
  if (g.index) h.update('index').update(bytes(g.index.array));
  return h.digest('hex');
}
// (by name: three binds a program's attributes by name, in any order)
const layout = (g) => Object.entries(g.attributes).map(([n, a]) => `${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(' ');

// the production worker in a Node thread, only its messaging port adapted (as wreckBakeWorker.selftest.mjs)
const entry = new URL('./fractureWreckWorker.ts', import.meta.url).href;
const bootstrap = new URL('data:text/javascript,' + encodeURIComponent(`
  import { parentPort } from 'node:worker_threads';
  globalThis.self = {
    set onmessage(handler) { parentPort.on('message', data => handler({ data })); },
    postMessage(reply, transfer) { parentPort.postMessage(reply, transfer); }
  };
  await import(${JSON.stringify(entry)});
`));
let started = 0, terminated = 0;
function nodePort() {
  started++;
  const thread = new Worker(bootstrap);
  const port = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage(data) { thread.postMessage(data); },
    terminate() { terminated++; void thread.terminate(); },
  };
  thread.on('message', (data) => port.onmessage?.({ data }));
  thread.on('error', (error) => port.onerror?.({ message: error.message }));
  return port;
}

// every deferred kind: the sheds in three maps' styles (Verdant's boards, the winter's snow, Frontier's fibre-cement)
// and the four pillbox forms (props.ts builds the pillbox's job from fortFor, pinned below)
const cases = [];
for (const map of ['verdant', 'winter', 'frontier']) {
  const types = shedKitTypes(map, false);
  for (const id of ['fieldhut', 'leanto']) {
    cases.push({ label: `${map} ${id}`, make: types[id].brokenDeferred(mulberry32(41)), intact: () => types[id].build(mulberry32(41)) });
  }
}
for (const map of ['coastal', 'steppe', 'saltwind', 'verdant']) {
  const f = fortFor(map);
  assert.ok(f, `${map}: a pillbox`);
  cases.push({
    label: `${map} pillbox ${f.style}`,
    make: deferredWreck({ kit: 'pillbox', style: f.style, tones: f.tones, seed: f.seed }, () => buildPillbox(f.style, f.tones, f.seed, true)),
    intact: () => buildPillbox(f.style, f.tones, f.seed, false),
  });
}
// the part-built light kinds settled from their own parts (legacyWreck.ts; the destructible-kits lane, round 3)
const SETTLED = ['huntingblind', 'fishershack', 'saunahut', 'alpinerefuge', 'stilthouse', 'longhouse', 'deserttent',
  'commandtent', 'fieldhospital', 'guardpost', 'motorpool', 'transformershed', 'checkpointhut', 'securityoffice',
  'servicegarage', 'corneroffice'];
for (const id of SETTLED) {
  const meta = DESTRUCTIBLE_BUILDING_TYPES[id];
  cases.push({ label: id, make: meta.brokenDeferred(mulberry32(17)), intact: () => meta.build(mulberry32(17)) });
}
assert.deepEqual(new Set(cases.map((c) => c.make.job.kit === 'pillbox' ? c.make.job.style : c.make.job.kind)),
  new Set(['fieldhut', 'leanto', 'regelbau', 'dot', 'hex', 'logearth', ...SETTLED]), 'every deferred kind and form');

const client = createFractureWreckClient(nodePort, 60_000);
try {
  for (const c of cases) {
    const job = c.make.job;
    assert.deepEqual(structuredClone(job), job, `${c.label}: the job crosses a thread as it is`);
    const page = c.make();
    let ticks = 0;
    const interval = setInterval(() => ticks++, 1);
    let built;
    try {
      built = await client.build(job);
    } finally {
      clearInterval(interval);
    }
    assert.equal(digest(built), digest(page), `${c.label}: the worker builds the page's wreck, vertex for vertex`);
    const intact = c.intact();
    assert.equal(layout(page), layout(intact), `${c.label}: the wreck in the intact's layout (the pool's stand-in is emptyLike(intact))`);
    assert.ok(ticks > 0, `${c.label}: the page's thread runs while the worker builds`);
    for (const g of [page, built, intact]) g.dispose();
  }
  assert.equal(started, 1, 'one worker for every job');

  // one job in flight
  const a = client.build(cases[0].make.job), b = client.build(cases[1].make.job);
  await assert.rejects(b, /one wreck at a time/, 'a second job while one is in flight is refused');
  (await a).dispose();
} finally {
  client.dispose();
}
assert.equal(terminated, 1, 'the worker goes with its client');
await assert.rejects(client.build(cases[0].make.job), /disposed/, 'a disposed client builds nothing');

// a silent worker times out; a refusing one and a failing one end the job; a worker that cannot start rejects
const fake = (react) => {
  const port = { onmessage: null, onerror: null, onmessageerror: null, terminated: 0, sent: [],
    postMessage(data) { port.sent.push(data); react(port, data); }, terminate() { port.terminated++; } };
  return port;
};
{
  const port = fake(() => {});
  const silent = createFractureWreckClient(() => port, 40);
  await assert.rejects(silent.build(cases[0].make.job), /timed out/);
  assert.equal(port.terminated, 1, 'a silent worker is terminated');
}
{
  const port = fake((p, data) => queueMicrotask(() => p.onmessage({ data: { requestId: data.requestId, ok: false, message: 'no such kit' } })));
  const refusing = createFractureWreckClient(() => port, 1000);
  await assert.rejects(refusing.build(cases[0].make.job), /no such kit/);
  assert.equal(port.terminated, 1, 'a refusing worker is terminated');
}
{
  const port = fake((p) => queueMicrotask(() => p.onerror({ message: 'module failed' })));
  const failing = createFractureWreckClient(() => port, 1000);
  await assert.rejects(failing.build(cases[0].make.job), /module failed/);
}
{
  const port = fake((p, data) => queueMicrotask(() => p.onmessage({ data: { requestId: data.requestId + 7, ok: false, message: 'stale' } })));
  const stale = createFractureWreckClient(() => port, 40);
  await assert.rejects(stale.build(cases[0].make.job), /timed out/, 'a reply for another request is not this one\'s');
}
{
  const port = fake(() => {});
  const pending = createFractureWreckClient(() => port, 60_000);
  const job = pending.build(cases[0].make.job);
  pending.dispose();
  await assert.rejects(job, /disposed/, 'disposing ends the job in flight');
  assert.equal(port.terminated, 1);
}
await assert.rejects(createFractureWreckClient(() => { throw new Error('no workers here'); }).build(cases[0].make.job), /no workers here/);
{
  // a worker left without a job (a world gone mid-warm sends no more) goes by itself, and the next job starts another
  const wire = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    return packFractureWreck(g).wire;
  })();
  const ports = [];
  const idleClient = createFractureWreckClient(() => {
    const port = fake((p, data) => queueMicrotask(() => p.onmessage({ data: { requestId: data.requestId, ok: true, wire } })));
    ports.push(port);
    return port;
  }, 1000, 40);
  (await idleClient.build(cases[0].make.job)).dispose();
  assert.equal(ports[0].terminated, 0, 'busy a moment ago: still up');
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(ports[0].terminated, 1, 'idle past its time: terminated');
  (await idleClient.build(cases[0].make.job)).dispose();
  assert.equal(ports.length, 2, 'the next job starts a new worker');
  idleClient.dispose();
  assert.equal(ports[1].terminated, 1);
}

// the wire: plain streams transferred once each, index and groups carried, an instanced attribute refused
{
  const g = new THREE.BufferGeometry();
  const shared = new Float32Array(18);
  g.setAttribute('position', new THREE.BufferAttribute(shared.subarray(0, 9), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(shared.subarray(9, 18), 3));
  g.setAttribute('mask', new THREE.BufferAttribute(new Uint8Array([1, 0, 1]), 1, true));
  g.setIndex([0, 1, 2]);
  g.addGroup(0, 3, 1);
  shared.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const { wire, transfer } = packFractureWreck(g);
  assert.equal(transfer.length, 3, 'one transfer per distinct buffer');
  const back = unpackFractureWreck(structuredClone(wire, { transfer }));
  assert.deepEqual([...back.getAttribute('normal').array], [0, 0, 1, 0, 0, 1, 0, 0, 1], 'a view keeps its offset');
  assert.equal(back.getAttribute('mask').normalized, true);
  assert.deepEqual([...back.index.array], [0, 1, 2]);
  assert.deepEqual(back.groups, [{ start: 0, count: 3, materialIndex: 1 }]);
  const inst = new THREE.BufferGeometry();
  inst.setAttribute('position', new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
  assert.throws(() => packFractureWreck(inst), /not a plain buffer attribute/);
}

// props.ts: the pillbox's job, the warm through the worker, the reply dropped for a pool that broke first, the worker
// gone with the world
{
  const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
  assert.match(props, /return deferredWreck\(\{ kit: 'pillbox', style: fort\.style, tones: fort\.tones, seed: fort\.seed \},\n\s*\(\) => buildPillbox\(fort\.style, fort\.tones, fort\.seed, true\)\);/,
    'the pillbox\'s job is the page builder\'s numbers');
  assert.match(props, /const geoB = deferred \? emptyLike\(geoI\) : meta\.broken\(drng\);/, 'the stand-in takes the intact\'s layout');
  assert.match(props, /brokenWarmClient\.build\(make\.job\)\.then\(\(geoB\) => \{\n\s*brokenWarmBusy = false;\n\s*if \(target\.makeBroken === make && !brokenWarmDone\) installBrokenGeometry\(target, geoB\);\n\s*else geoB\.dispose\(\);/,
    'a reply installs only into a pool still waiting for it');
  assert.match(props, /if \(typeof Worker === 'undefined'\) \{ stopBrokenWarm\(\); return; \}/, 'no worker: the first break builds it');
  assert.match(props, /if \(!pool\.imB\) return;\n\s*ensureBrokenGeometry\(pool\);\n\s*const bi = pool\.nBroken\+\+;/,
    'a copy that breaks first (or a late joiner\'s) builds its wreck on the page before its broken slot draws');
  assert.match(props, /if \(stepDestruction\(dt\)\) updatePoleLod\(cameraPos\);\n\s*warmBrokenPools\(dt\);/, 'the warm runs from the live frame');
}
console.log(`fractureWreckWorker.selftest: ${cases.length} deferred wrecks (field hut, lean-to, Regelbau, DOT, hex, log and earth, ${SETTLED.length} part-built light kinds) built in the worker equal the page's, in the intact's layout; one job in flight; silent, refusing, failing and disposed workers end their job; an idle worker goes by itself; the wire carries views, index and groups and refuses instanced streams; props.ts warms through it`);
