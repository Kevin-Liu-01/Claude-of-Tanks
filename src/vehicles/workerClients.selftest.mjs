// workerClients.selftest.mjs — the decor planner's and the riding-parts prebuild's worker clients follow the one
// worker-client pattern (2026-11-02 audit R6, app/workerClientHealth.ts). Copyright © 2026 Kevin B. Liu.
//
// The decor client had no deadline and no messageerror handler, and its `broken` latch was permanent: a reply that could
// not be read, or a plan that hung in the serial worker, stalled that stepped build forever (tankFactoryCore's
// `while (!settled && !failed) yield wait`), and every later stepped build queued behind it (the Garage pedestal, the
// battle streamer, MP seats, the Gallery). The prebuild latched before its worker started and ignored messageerror. Now:
// a deadline from dispatch, messageerror and error close the worker and settle what it held (those tanks plan in-line),
// the next job starts a fresh worker, three failures in a row at most. The material painter's and the composer's
// clients are proved in their own selftests (materialPainterWorker, sourcedTextureCompositionClient).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MAX_CONSECUTIVE_WORKER_FAILURES, createWorkerClientHealth } from '../app/workerClientHealth.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const within = (promise, ms = 400) => Promise.race([
  promise.then((value) => ({ outcome: 'resolved', value }), (error) => ({ outcome: 'rejected', error })),
  new Promise((resolve) => setTimeout(() => resolve({ outcome: 'hung' }), ms)),
]);

// the wire's heavy neighbour (the decoration planner itself) is stubbed: this proves the client, not the plan
const WIRE_STUB = `data:text/javascript,${encodeURIComponent(
  'export function decorPlanRequest(args) { return { request: { id: args.id }, transfer: [] }; } export function decorPlanFrom(reply) { return reply; }')}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './decorPlanWire.ts' && context.parentURL?.endsWith('/src/vehicles/decorPlanClient.ts')) return { url: WIRE_STUB, shortCircuit: true };
    return next(specifier, context);
  },
});

// ---- the health count
{
  const health = createWorkerClientHealth();
  assert.equal(MAX_CONSECUTIVE_WORKER_FAILURES, 3);
  assert.equal(health.failed(), true); assert.equal(health.failed(), true);
  health.succeeded();
  assert.equal(health.failures, 0, 'a success starts the count again');
  assert.equal(health.failed(), true); assert.equal(health.failed(), true); assert.equal(health.failed(), false);
  assert.equal(health.state, 'unavailable');
  const closed = createWorkerClientHealth(); closed.close(); assert.equal(closed.state, 'unavailable');
}

// ---- the page's decor client, as a stepped build reaches it: a reply that cannot be read settles (in-line), not hangs
{
  const workers = [];
  globalThis.Worker = class {
    constructor(url, options) { this.url = String(url); this.options = options; this.posted = []; this.terminated = 0; workers.push(this); }
    postMessage(message) { this.posted.push(message); setImmediate(() => this.onmessageerror?.({})); }
    terminate() { this.terminated++; }
  };
  const { planDecoration } = await import('./decorPlanClient.ts');
  const first = await within(planDecoration({ id: 'a' }));
  assert.equal(first.outcome, 'rejected', 'an unreadable reply rejects the plan (the tank plans in-line) instead of stalling its build');
  assert.match(first.error.message, /could not be read/);
  assert.equal(workers[0].terminated, 1);
  assert.match(workers[0].url, /decorPlanWorker\.ts$/);
  const second = await within(planDecoration({ id: 'b' }));
  assert.equal(second.outcome, 'rejected');
  assert.equal(workers.length, 2, 'the next plan started a fresh worker');
  delete globalThis.Worker;
}

// ---- the client's machine, on injected ports
const { createDecorPlanClient } = await import('./decorPlanClient.ts');
function decorHarness(deadlineMs = 100) {
  let now = 0;
  const timers = new Set(), workers = [];
  const client = createDecorPlanClient({
    createWorker() {
      const port = { onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: 0,
        postMessage(message) { port.posted.push(message); }, terminate() { port.terminated++; },
        reply(index = 0, body = { reply: { plan: index } }) { port.onmessage?.({ data: { id: port.posted[index].id, ...body } }); } };
      workers.push(port);
      return port;
    },
    schedule(callback, delay) { const timer = { callback, at: now + delay }; timers.add(timer); return () => timers.delete(timer); },
  }, deadlineMs);
  const advance = (ms) => {
    now += ms;
    for (const timer of [...timers].sort((a, b) => a.at - b.at)) if (timer.at <= now && timers.delete(timer)) timer.callback();
  };
  return { client, workers, timers, advance };
}
{
  // a deadline from dispatch: the second request's clock starts when the first reply comes back
  const h = decorHarness();
  const a = h.client.plan({ n: 'a' }, []), b = h.client.plan({ n: 'b' }, []);
  assert.equal(h.timers.size, 1, 'one clock: the worker\'s job');
  h.advance(90); h.workers[0].reply(0); assert.deepEqual(await a, { plan: 0 });
  h.advance(90);
  assert.equal((await within(b, 20)).outcome, 'hung', '180 after its request, 90 into its turn: not late');
  h.advance(10);
  const late = await within(b, 20);
  assert.equal(late.outcome, 'rejected'); assert.match(late.error.message, /timed out/);
  assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.client.health.state, 'available', 'one failure, not the session\'s');
  const c = h.client.plan({ n: 'c' }, []);
  assert.equal(h.workers.length, 2, 'a fresh worker for the next plan');
  h.workers[1].reply(0); assert.deepEqual(await c, { plan: 0 });
  assert.equal(h.client.health.failures, 0);
}
{
  // error and messageerror reject everything the worker held; a plan's own error rejects that plan alone
  for (const event of ['onerror', 'onmessageerror']) {
    const h = decorHarness();
    const a = h.client.plan({}, []), b = h.client.plan({}, []);
    h.workers[0][event]({ message: 'boom' });
    assert.equal((await within(a, 20)).outcome, 'rejected'); assert.equal((await within(b, 20)).outcome, 'rejected');
    assert.equal(h.workers[0].terminated, 1); assert.equal(h.timers.size, 0);
  }
  const h = decorHarness();
  const a = h.client.plan({}, []), b = h.client.plan({}, []);
  h.workers[0].reply(0, { error: 'no decoration here' });
  assert.equal((await within(a, 20)).outcome, 'rejected');
  h.workers[0].reply(1); assert.equal((await within(b, 20)).outcome, 'resolved', 'the worker goes on');
  assert.equal(h.workers.length, 1);
}
{
  // three failures in a row leave every later tank in-line, at once and without a worker
  const h = decorHarness();
  for (let i = 0; i < 3; i++) { const job = h.client.plan({}, []); h.advance(100); assert.equal((await within(job, 20)).outcome, 'rejected'); }
  assert.equal(h.client.health.state, 'unavailable');
  const count = h.workers.length;
  const after = await within(h.client.plan({}, []), 20);
  assert.equal(after.outcome, 'rejected'); assert.match(after.error.message, /unavailable/);
  assert.equal(h.workers.length, count);
}

// ---- the riding-parts prebuild: a failed start or worker is not a session latch; messageerror loses one part
{
  const created = [];
  let constructThrows = 1;
  globalThis.Worker = class {
    constructor(url) {
      if (constructThrows-- > 0) throw new Error('CSP');
      this.url = String(url); this.posted = []; this.terminated = 0; created.push(this);
    }
    postMessage(message) { this.posted.push(message); }
    terminate() { this.terminated++; }
  };
  const { startRidingPartsPrebuild, ridingPartsPrebuildState } = await import('./ridingPartsPrebuild.ts');
  startRidingPartsPrebuild(['m1a1']);
  assert.equal(created.length, 0); assert.equal(ridingPartsPrebuildState(), 'idle', 'a worker that could not start is not a latch');
  startRidingPartsPrebuild(['m1a1']);
  assert.equal(created.length, 1); assert.equal(ridingPartsPrebuildState(), 'running');
  assert.deepEqual(created[0].posted[0].order, ['m1a1']);
  assert.equal(typeof created[0].onmessageerror, 'function', 'a part that cannot be read is handled');
  created[0].onmessageerror({});
  assert.equal(ridingPartsPrebuildState(), 'running', 'and the rest go on');
  startRidingPartsPrebuild(['t72']);
  assert.equal(created.length, 1, 'a running prebuild is not started twice');
  created[0].onerror({});
  assert.equal(created[0].terminated, 1); assert.equal(ridingPartsPrebuildState(), 'idle');
  startRidingPartsPrebuild(['t72']);
  assert.equal(created.length, 2, 'a failed worker is started again by a later ask');
  created[1].onmessage({ data: { kind: 'riding-parts-done' } });
  assert.equal(ridingPartsPrebuildState(), 'done');
  startRidingPartsPrebuild(['t90']);
  assert.equal(created.length, 2, 'once done, never again');
  delete globalThis.Worker;
}

await settle();
hook.deregister();
console.log('workerClients.selftest: decor plans settle on a deadline from dispatch, error and messageerror; a fresh worker after a failure, three in a row at most; the prebuild restarts after a failed start');
