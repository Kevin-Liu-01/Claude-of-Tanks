import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWreckBakeClient } from './wreckBakeClient.ts';
import { packWreckBake } from './wreckBakeWire.ts';

// Exercise the real client and wire decoder. Only the browser Worker port is
// replaced; tiny native geometries keep lifecycle coverage independent of the
// expensive procedural fleet and renderer.
const clients = [];
const task = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

class FixtureWorker {
  onmessage = null;
  onerror = null;
  onmessageerror = null;
  requests = [];
  terminations = 0;

  postMessage(request) {
    this.requests.push(request);
    this.onPost?.(request);
  }
  reply(data) { this.onmessage?.({ data }); }
  succeed(wire = null, requestId = this.requests.at(-1).requestId) {
    this.reply({ requestId, ok: true, wire });
  }
  terminate() { this.terminations++; }
}

function fixture({ makeWorker, timeoutMs } = {}) {
  const workers = [];
  const client = createWreckBakeClient(() => {
    const worker = makeWorker?.() ?? new FixtureWorker();
    workers.push(worker);
    return worker;
  }, timeoutMs);
  clients.push(client);
  return { client, workers };
}

function assertIdle(worker) {
  assert.equal(worker.onmessage, null, 'settled request releases its message closure');
  assert.equal(worker.onerror, null, 'settled request releases its error closure');
  assert.equal(worker.onmessageerror, null, 'settled request releases its transfer-error closure');
}

function bakeFixture() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, 0, -2, 1, 0, -2, 0, 2, 2,
  ]), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.1), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  const shadowGeo = geo.clone();
  shadowGeo.deleteAttribute('color');
  const baked = { geo, shadowGeo, hx: 1, hz: 2, h: 2, tris: 1 };
  try {
    const { wire, transfer } = packWreckBake(baked);
    return structuredClone(wire, { transfer });
  } finally {
    geo.dispose();
    shadowGeo.dispose();
  }
}

async function completeNull(client, workers) {
  const pending = client.bake('t90m', { seed: 101, pop: false }, () => {});
  const worker = workers.at(-1);
  await task();
  worker.succeed();
  assert.equal(await pending, null);
  assertIdle(worker);
  return worker;
}

try {
  {
    const { client, workers } = fixture();
    client.prepare(); client.prepare();
    assert.equal(workers.length, 1, 'explicit map preparation starts only one worker');
    assert.deepEqual(workers[0].requests, [], 'preparation never speculatively builds a donor');
    assert.equal(await completeNull(client, workers), workers[0]);
    client.dispose();
    assert.throws(() => client.prepare(), /disposed/);
  }
  for (const mode of ['error', 'messageerror']) {
    const { client, workers } = fixture();
    client.prepare();
    if (mode === 'error') workers[0].onerror({ message: 'early module failure' });
    else workers[0].onmessageerror({});
    assert.equal(workers[0].terminations, 1);
    await assert.rejects(client.bake('t90m', {}, () => {}), /early module failure|startup transfer failed/);
    assert.equal(workers.length, 1, 'early failure is surfaced, not hidden by a second worker');
    await completeNull(client, workers);
    assert.equal(workers.length, 2, 'a later explicit retry may create a fresh worker');
  }
  {
    const { client, workers } = fixture();
    assert.equal(workers.length, 0, 'creating a map client does not create a worker');
    client.dispose();
    client.dispose();
    await assert.rejects(client.bake('t90m', {}, () => {}), /disposed/);
    assert.equal(workers.length, 0, 'an unused or disposed client never loads fleet code');
  }

  {
    const { client, workers } = fixture();
    for (let job = 0; job < 6; job++) {
      let checkpoints = 0;
      const options = { seed: 2002 + job * 131, pop: job % 2 === 0 };
      const specId = job % 2 ? 't90m' : 'm1a1';
      const pending = client.bake(specId, options, () => { checkpoints++; });
      assert.equal(workers.length, 1, 'serial jobs reuse the map-owned worker');
      const worker = workers[0];
      assert.deepEqual(worker.requests.at(-1), { requestId: job + 1, specId, options });
      const wire = job % 2 ? null : bakeFixture();
      await task();
      worker.succeed(wire);
      const baked = await pending;
      assert.ok(checkpoints >= 1, 'an asynchronous reply passes the ownership checkpoint');
      if (wire) {
        try {
          assert.ok(baked.geo instanceof THREE.BufferGeometry);
          assert.ok(baked.shadowGeo instanceof THREE.BufferGeometry);
          assert.deepEqual([baked.hx, baked.hz, baked.h, baked.tris], [1, 2, 2, 1]);
          assert.deepEqual([...baked.geo.index.array], [0, 1, 2]);
          assert.deepEqual([...baked.geo.getAttribute('position').array],
            [-1, 0, -2, 1, 0, -2, 0, 2, 2]);
        } finally {
          baked?.geo.dispose();
          baked?.shadowGeo?.dispose();
        }
      } else assert.equal(baked, null, 'a nullable donor failure is a completed job, not a transport failure');
      assert.equal(worker.terminations, 0);
      assertIdle(worker);
    }
    client.dispose();
    client.dispose();
    assert.equal(workers[0].terminations, 1, 'completed worker is terminated exactly once');
  }

  {
    const { client, workers } = fixture();
    let settled = false;
    const pending = client.bake('m1a1', {}, () => {});
    void pending.then(() => { settled = true; });
    const worker = workers[0];
    worker.succeed(null, worker.requests[0].requestId + 1);
    await task();
    assert.equal(settled, false, 'another request ID cannot resolve this bake');
    await assert.rejects(client.bake('t90m', {}, () => {}), /one bake at a time/);
    assert.equal(worker.requests.length, 1, 'concurrent rejection sends no second job');
    assert.equal(worker.terminations, 0, 'concurrent rejection does not disturb the active job');
    worker.succeed();
    assert.equal(await pending, null);
    await completeNull(client, workers);
    assert.equal(workers.length, 1, 'concurrent rejection does not poison subsequent serial jobs');
  }

  for (const mode of ['reply-error', 'worker-error', 'worker-error-default', 'message-error']) {
    const { client, workers } = fixture();
    const expected = {
      'reply-error': /donor import failed/,
      'worker-error': /worker boot failed/,
      'worker-error-default': /Wreck worker failed/,
      'message-error': /transfer failed/,
    }[mode];
    const pending = client.bake('m1a1', {}, () => {});
    const rejected = assert.rejects(pending, expected);
    const worker = workers[0];
    if (mode === 'reply-error') worker.reply({
      requestId: worker.requests[0].requestId, ok: false, message: 'donor import failed',
    });
    else if (mode === 'message-error') worker.onmessageerror({});
    else worker.onerror({ message: mode === 'worker-error' ? 'worker boot failed' : '' });
    await rejected;
    assert.equal(worker.terminations, 1, `${mode}: broken worker is terminated`);
    assertIdle(worker);
    await completeNull(client, workers);
    assert.equal(workers.length, 2, `${mode}: retry gets a fresh worker`);
  }

  for (const mode of ['constructor', 'post-message']) {
    const failure = new Error(`${mode} failed`);
    let attempts = 0;
    const { client, workers } = fixture({ makeWorker() {
      attempts++;
      if (mode === 'constructor' && attempts === 1) throw failure;
      const worker = new FixtureWorker();
      if (attempts === 1) worker.onPost = () => { throw failure; };
      return worker;
    } });
    await assert.rejects(client.bake('m1a1', {}, () => {}), error => error === failure,
      'the original worker-creation or send error survives cleanup');
    if (mode === 'post-message') {
      assert.equal(workers[0].terminations, 1);
      assertIdle(workers[0]);
    } else assert.equal(workers.length, 0);
    await completeNull(client, workers);
    assert.equal(attempts, 2, `${mode}: synchronous exceptions release the busy latch`);
  }

  for (const replyOrder of ['before-checkpoint', 'during-checkpoint']) {
    const { client, workers } = fixture();
    const entered = deferred(), release = deferred();
    const failure = new Error(`cancelled ${replyOrder}`);
    const outputs = [];
    let geometryReads = 0;
    const wire = bakeFixture();
    const geo = wire.geo;
    Object.defineProperty(wire, 'geo', { get() { geometryReads++; return geo; } });
    const pending = client.bake('t90m', {}, async () => {
      entered.resolve();
      await release.promise;
      throw failure;
    });
    void pending.then(value => outputs.push(value), () => {});
    const rejected = assert.rejects(pending, error => error === failure);
    const worker = workers[0];
    if (replyOrder === 'before-checkpoint') worker.succeed(wire);
    await entered.promise;
    if (replyOrder === 'during-checkpoint') worker.succeed(wire);
    await task();
    assert.equal(geometryReads, 0, 'a reply stays as wire while the ownership checkpoint is queued');
    assert.deepEqual(outputs, [], 'no result escapes a suspended checkpoint');
    release.resolve();
    await rejected;
    assert.equal(geometryReads, 0, 'checkpoint cancellation never starts geometry hydration');
    assert.deepEqual(outputs, [], 'cancelled geometry is never published');
    assert.equal(worker.terminations, 1);
    assertIdle(worker);
  }

  {
    const { client, workers } = fixture();
    const pending = client.bake('t90m', {}, () => {});
    const rejected = assert.rejects(pending, /disposed/);
    const worker = workers[0];
    client.dispose();
    client.dispose();
    await rejected;
    assert.equal(worker.terminations, 1, 'dispose wakes and terminates an in-flight worker exactly once');
    assertIdle(worker);
    await assert.rejects(client.bake('t90m', {}, () => {}), /disposed/);
    assert.equal(workers.length, 1, 'disposed client cannot reopen a worker');
  }

  {
    const { client, workers } = fixture();
    const entered = deferred(), release = deferred();
    let geometryReads = 0;
    const wire = bakeFixture(), geo = wire.geo;
    Object.defineProperty(wire, 'geo', { get() { geometryReads++; return geo; } });
    const pending = client.bake('t90m', {}, async () => {
      entered.resolve();
      await release.promise;
    });
    const rejected = assert.rejects(pending, /disposed/);
    workers[0].succeed(wire);
    await entered.promise;
    client.dispose();
    release.resolve();
    await rejected;
    assert.equal(geometryReads, 0, 'disposal during a checkpoint prevents a ready reply from hydrating');
    assert.equal(workers[0].terminations, 1);
    assertIdle(workers[0]);
  }

  {
    const { client, workers } = fixture({ timeoutMs: 1 });
    let taskRan = false, checkpoints = 0;
    const pending = client.bake('t90m', {}, () => { checkpoints++; });
    const rejected = assert.rejects(pending, /timed out/);
    const taskId = setTimeout(() => { taskRan = true; }, 0);
    try { await rejected; } finally { clearTimeout(taskId); }
    assert.equal(taskRan, true, 'waiting for worker output yields actual tasks, not a starving Promise loop');
    assert.ok(checkpoints >= 1, 'an unresponsive worker still checks map cancellation');
    assert.equal(workers[0].terminations, 1, 'timeout terminates the unresponsive worker');
    assertIdle(workers[0]);
    await completeNull(client, workers);
    assert.equal(workers.length, 2, 'timeout releases the busy latch and failed worker');
  }

  {
    const { client, workers } = fixture({ timeoutMs: 1 });
    const pending = client.bake('t90m', {}, async () => { await task(); });
    await task();
    workers[0].succeed();
    assert.equal(await pending, null, 'a completed reply is not timed out by a slow scheduler checkpoint');
    assert.equal(workers[0].terminations, 0);
  }
} finally {
  for (const client of clients) client.dispose();
}

console.log('wreckBakeClient.selftest: passed');
