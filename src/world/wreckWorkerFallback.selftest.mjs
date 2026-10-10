// Receipt for the wreck worker fallback (the wreck-worker lane, 2026-10-09; the launch smoke's "[battle] entry failed
// Error: Wreck worker timed out"): the wreck worker never decides whether a battle starts. The real props build wrapper
// (createPropsAsync) drives the real wreck bake client (wreckBakeClient.ts) over browser-like Worker ports that fail
// the ways a worker fails in a browser — it never replies (a stalled chunk request), it replies with an error, it fires
// onerror (a module that failed to load or evaluate) before or during a bake — and in every case the build completes
// with the main-thread bake of the same request, or with no wreck at that site when even that cannot build the donor.
// A cancelled build still rejects, the client's timeout counts only the worker's silence (never the build's pacing),
// the worker reports a rejection nobody handled, and the main-thread bake is the worker's own wreck, vertex for vertex.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createWreckBakeClient } from './wreckBakeClient.ts';
import { startWreckBakePrefetch } from './wreckBakePrefetch.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck, bakeTankWreckSteps } from './wrecks.ts';
import { outputIdentity } from '../../tools/wreck-paint-bench.mjs';

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function createPropsAsync(');
const end = source.indexOf('\nfunction* propsBuildSteps(', start);
assert.ok(start >= 0 && end > start);
const wrapper = stripTypeScriptTypes(source.slice(start, end)).replace('export ', '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A browser-like Worker port; `mode` is how it fails. */
class FixtureWorker {
  onmessage = null;
  onerror = null;
  onmessageerror = null;
  requests = [];
  terminated = 0;
  constructor(mode) {
    this.mode = mode;
    // 'startup-error': the module graph failed to load before any request (a worker chunk that 404s)
    if (mode === 'startup-error') setTimeout(() => this.onerror?.({ message: '' }), 0);
  }
  postMessage(request) {
    this.requests.push(request);
    const { mode } = this;
    if (mode === 'ok') setTimeout(() => this.onmessage?.({ data: { requestId: request.requestId, ok: true, wire: null } }), 2);
    else if (mode === 'error-reply') setTimeout(() => this.onmessage?.({ data: { requestId: request.requestId, ok: false, message: 'Failed to fetch dynamically imported module' } }), 2);
    else if (mode === 'worker-rejection') setTimeout(() => this.onmessage?.({ data: { requestId: 0, ok: false, message: 'Wreck worker: detached failure' } }), 2);
    else if (mode === 'onerror') setTimeout(() => this.onerror?.({ message: '' }), 2);
    // 'silent': never answers, never fails (a module request the network never completes)
  }
  terminate() { this.terminated++; }
}

/**
 * The real createPropsAsync over a generator fixture: each step is yielded as the props build would. The wrapper's
 * client is the real one over FixtureWorker ports (`modes[n]` for the n-th worker it starts); the main-thread fallback
 * is `mainBake` (bakeTankWreckSteps' seat) after `acquire` (ensureTankBuilder's).
 */
function harness({ steps, modes, timeoutMs = 60, acquire = async () => {}, mainBake, tick = null, prefetch = null }) {
  const workers = [];
  const events = [];
  const warnings = [];
  function* build() {
    try {
      for (const step of steps) { events.push('work'); yield step; }
      events.push('complete');
      return { built: true };
    } finally { events.push('closed'); }
  }
  const makeClient = () => createWreckBakeClient(() => {
    const worker = new FixtureWorker(modes[Math.min(workers.length, modes.length - 1)]);
    workers.push(worker);
    return worker;
  }, timeoutMs);
  const run = new Function('propsBuildSteps', 'ensureTankBuilder', 'Worker', 'createWreckBakeClient', 'performance',
    'bakeTankWreckSteps', 'console', `${wrapper}\nreturn createPropsAsync;`)(build, acquire, function Worker() {},
    makeClient, performance, mainBake ?? (function* () { throw new Error('unexpected main-thread bake'); }),
    { ...console, warn: (...args) => warnings.push(args.join(' ')) });
  return { run: () => run({}, {}, 2002, null, tick, true, null, prefetch), workers, events, warnings };
}

const request = (specId, seed = 2002, pop = false) => ({ specId, options: { seed, pop, remnant: 0x4e5834 }, result: null });
const mainBakeOf = (calls) => function* (ctx, specId, options) {
  calls.push([ctx, specId, options]);
  yield { fine: true, progress: false, stage: `wreck-${specId}:construct` };
  return { specId, seed: options.seed, mainThread: true };
};

// 1. A worker that never replies, one that replies with an error, one that fires onerror during the bake, one whose
//    failure arrives as the worker's own report (requestId 0): the build completes with the main-thread bake.
for (const mode of ['silent', 'error-reply', 'onerror', 'worker-rejection']) {
  const calls = [], acquired = [];
  const first = request('m551_sheridan'), second = request('marder1a3', 2133, true);
  const h = harness({ steps: [{ fine: true, progress: false, wreckBake: first }, { fine: true, progress: false, wreckBake: second }],
    modes: [mode], acquire: async (id) => { acquired.push(id); }, mainBake: mainBakeOf(calls) });
  const startedAt = performance.now();
  const runtime = await h.run();
  assert.deepEqual(runtime.built, true, `${mode}: the props build completes`);
  assert.deepEqual(h.events, ['work', 'work', 'complete', 'closed'], `${mode}: every step ran`);
  assert.deepEqual(first.result, { specId: 'm551_sheridan', seed: 2002, mainThread: true }, `${mode}: the main-thread bake`);
  assert.deepEqual(second.result, { specId: 'marder1a3', seed: 2133, mainThread: true }, `${mode}: the next request too`);
  assert.deepEqual(calls.map(([ctx, id, options]) => [ctx, id, options]),
    [[{}, 'm551_sheridan', first.options], [{}, 'marder1a3', second.options]],
    `${mode}: the worker's own bake of the same donor, seed, pop and remnant, on the main thread`);
  assert.deepEqual(acquired, ['m551_sheridan', 'marder1a3'], `${mode}: each donor's builder loads on the main thread`);
  assert.equal(h.workers.length, 1, `${mode}: one worker failure is the build's last worker`);
  assert.equal(h.workers[0].terminated, 1, `${mode}: the failed worker is terminated`);
  assert.equal(h.warnings.length, 1, `${mode}: one warning: ${h.warnings.join(' / ')}`);
  assert.match(h.warnings[0], /wreck worker failed/);
  assert.deepEqual(runtime._buildDetail.wreckFallbacks, { count: 2, missing: 0, reason: h.warnings[0].match(/failed \((.*)\);/)[1] });
  if (mode === 'silent') {
    assert.match(h.warnings[0], /timed out/);
    assert.ok(performance.now() - startedAt < 2000, 'a silent worker costs its timeout once, not per wreck');
  }
}

// 2. The worker failed to start (onerror before the first bake, while the build was still pacing earlier work: a chunk
//    the worker's module graph could not load). The wrapper prepares its worker up front when no prefetch holds the plan.
{
  const calls = [];
  const only = request('leo2a7v');
  const h = harness({ steps: [{ stage: 'buildings' }, { fine: true, progress: false, wreckBake: only }],
    modes: ['startup-error'], mainBake: mainBakeOf(calls), tick: () => sleep(10) });
  const runtime = await h.run();
  assert.deepEqual(runtime.built, true, 'startup failure: the props build completes');
  assert.equal(only.result.mainThread, true, 'startup failure: the main-thread bake');
  assert.equal(calls.length, 1);
  assert.equal(h.workers.length, 1, 'no second worker after a failed start');
  assert.match(h.warnings[0], /startup failed|Wreck worker failed/);
}

// 3. The main-thread bake cannot build the donor either (its builder chunk did not load): no wreck at that site, the
//    build still completes, and the count of missing wrecks says so.
{
  const only = request('t90a');
  const h = harness({ steps: [{ fine: true, progress: false, wreckBake: only }], modes: ['error-reply'],
    acquire: async () => { throw new TypeError('Failed to fetch dynamically imported module'); } });
  const runtime = await h.run();
  assert.deepEqual(runtime.built, true, 'no donor anywhere: the props build completes');
  assert.equal(only.result, null, 'no donor anywhere: no wreck at that site');
  assert.deepEqual(runtime._buildDetail.wreckFallbacks.missing, 1);
  assert.equal(h.warnings.length, 2, 'the worker failure and the missing donor each warn once');
}

// 4. A cancelled build stays cancelled: a tick that fails while the worker is awaited is not a worker failure.
{
  const cancel = new Error('Cancelled stale battlefield prefetch: verdant');
  const calls = [];
  const only = request('m1a1');
  const h = harness({ steps: [{ fine: true, progress: false, wreckBake: only }], modes: ['silent'],
    mainBake: mainBakeOf(calls), tick: () => { throw cancel; } });
  await assert.rejects(h.run(), (error) => error === cancel, 'the cancellation, not a fallback');
  assert.equal(calls.length, 0, 'no main-thread bake for a cancelled build');
  assert.deepEqual(h.events, ['work', 'closed']);
  assert.equal(h.warnings.length, 0);
}

// 5. The planned bakes (wreckBakePrefetch.ts) from a worker that never replies: the first planned bake fails at its
//    timeout, the rest of the plan does not start another worker, and the props build bakes every request itself
//    without starting its own worker.
{
  const calls = [];
  const prefetchWorkers = [];
  const prefetch = startWreckBakePrefetch([['m551_sheridan', 2002, 0], ['marder1a3', 2133, 1]],
    () => createWreckBakeClient(() => { const w = new FixtureWorker('silent'); prefetchWorkers.push(w); return w; }, 60));
  const first = request('m551_sheridan'), second = request('marder1a3', 2133, true);
  const h = harness({ steps: [{ fine: true, progress: false, wreckBake: first }, { fine: true, progress: false, wreckBake: second }],
    modes: ['ok'], mainBake: mainBakeOf(calls), prefetch });
  const startedAt = performance.now();
  try {
    const runtime = await h.run();
    assert.deepEqual(runtime.built, true, 'planned bakes failed: the props build completes');
    assert.equal(first.result.mainThread, true);
    assert.equal(second.result.mainThread, true);
    assert.equal(h.workers.length, 0, 'the props build starts no worker of its own after the planned bake failed');
    assert.equal(prefetchWorkers.length, 1, 'the plan stops after its first failure: no second silent worker');
    assert.ok(performance.now() - startedAt < 2000, 'one timeout in all');
  } finally { prefetch.dispose(); }
}

// 6. A working worker is untouched: no fallback, no warning, no main-thread builder.
{
  const only = request('k2');
  const h = harness({ steps: [{ fine: true, progress: false, wreckBake: only }], modes: ['ok'],
    acquire: async () => assert.fail('a working worker loads no donor on the main thread') });
  const runtime = await h.run();
  assert.equal(only.result, null, 'the worker\'s own (null) bake');
  assert.equal(runtime._buildDetail.wreckFallbacks, undefined);
  assert.equal(h.warnings.length, 0);
}

// 7. The client's timeout is the worker's silence: a checkpoint (the build's pacing — a garage lull, a background
//    lease, a hidden tab) far longer than the timeout never times out a worker that answers after it.
{
  let worker = null, checkpoints = 0;
  const client = createWreckBakeClient(() => (worker = new FixtureWorker('manual')), 200);
  const pending = client.bake('t90m', {}, async () => {
    if (++checkpoints !== 1) return;
    await sleep(400); // twice the timeout, with no reply yet; the reply comes in the next wait
    setTimeout(() => worker.onmessage({ data: { requestId: worker.requests[0].requestId, ok: true, wire: null } }), 5);
  });
  assert.equal(await pending, null, 'a paused build is not worker silence');
  assert.equal(worker.terminated, 0);
  const silent = createWreckBakeClient(() => new FixtureWorker('silent'), 40);
  await assert.rejects(silent.bake('t90m', {}, async () => { await sleep(5); }), /timed out/, 'real silence still times out');
  client.dispose(); silent.dispose();
}

// 8. The worker module: a rejection nobody handled is reported as the failure of the request in flight (requestId 0
//    when none is), since a browser fires no error event at the page's Worker for it.
{
  const posted = [];
  let onmessage = null, rejectionListener = null;
  const previous = globalThis.self;
  globalThis.self = {
    set onmessage(handler) { onmessage = handler; },
    get onmessage() { return onmessage; },
    postMessage(reply) { posted.push(reply); },
    addEventListener(type, listener) { if (type === 'unhandledrejection') rejectionListener = listener; },
  };
  try {
    await import('./wreckBakeWorker.ts');
    assert.equal(typeof onmessage, 'function');
    assert.equal(typeof rejectionListener, 'function', 'the worker listens for unhandled rejections');
    rejectionListener({ reason: new Error('detached') });
    assert.deepEqual(posted.at(-1), { requestId: 0, ok: false, message: 'Wreck worker: detached' }, 'no request in flight: requestId 0');
    const handled = onmessage({ data: { requestId: 7, specId: '__not_a_vehicle__', options: {} } });
    rejectionListener({ reason: new Error('builder side effect') });
    assert.deepEqual(posted.at(-1), { requestId: 7, ok: false, message: 'Wreck worker: builder side effect' },
      'in flight: that request fails at once');
    await handled;
    assert.equal(posted.at(-1).requestId, 7, 'the handler still answers its request (the client takes the first reply)');
  } finally {
    if (previous === undefined) delete globalThis.self; else globalThis.self = previous;
  }
}

// 9. The fallback is the worker's wreck: the real props wrapper over a silent worker bakes a real donor on the main
//    thread, and its geometry, colours, shadow proxy and collision solids equal the worker's bake (wreckBakeWorker.ts:
//    bakeTankWreck with an empty engine context, which wreckBakeWorker.selftest holds equal to the worker's reply).
{
  const real = request('t90m', 2526, true);
  const h = harness({ steps: [{ fine: true, progress: false, wreckBake: real }], modes: ['silent'], timeoutMs: 30,
    acquire: ensureTankBuilder, mainBake: bakeTankWreckSteps });
  const runtime = await h.run();
  assert.deepEqual(runtime.built, true);
  assert.ok(real.result?.geo, 'the real donor baked on the main thread');
  await ensureTankBuilder('t90m');
  const control = bakeTankWreck({}, 't90m', real.options);
  try {
    assert.deepEqual(outputIdentity(real.result), outputIdentity(control),
      'same donor, seed, pop and remnant: the same wreck as the worker bakes');
  } finally {
    for (const baked of [real.result, control]) { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); }
  }
}

console.log('wreckWorkerFallback.selftest: a silent, erroring, onerror or self-reporting worker, a failed startup and failed planned bakes all complete the props build with the main-thread bake (or no wreck); cancellation still rejects; the timeout is worker silence; the fallback is the worker\'s wreck PASS');
