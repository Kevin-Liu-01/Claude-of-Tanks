// decorPlanClient.selftest — improve-271 (plan 038): a decor worker that never answers, or whose reply cannot be read,
// cannot strand a tank build. The request rejects at the deadline (the stepped build then plans in-line), a reply after
// the deadline is dropped, an answering worker resolves with its timer cleared, and after a worker that had answered
// fails twice in all, later tanks go straight to the in-line plan. The deadline rule itself: src/workerCalls.selftest.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';

const workers = [];
class FakeWorker {
  constructor(url, options) {
    assert.ok(String(url).endsWith('/decorPlanWorker.ts'));
    assert.equal(options.name, 'cot-decor-plan');
    this.posted = []; this.terminated = 0; this.onmessage = null; this.onerror = null; this.onmessageerror = null;
    workers.push(this);
  }
  postMessage(message) { this.posted.push(message); }
  terminate() { this.terminated++; }
  answer(data) { this.onmessage?.({ data }); }
}
globalThis.Worker = FakeWorker;
const { planDecoration, resetDecorWorker, startDecorWorker } = await import('./decorPlanClient.ts');

function manualTimers() {
  let now = 0, serial = 0;
  const live = new Map();
  return {
    set(callback, ms) { const h = ++serial; live.set(h, { at: now + ms, callback }); return h; },
    clear(h) { live.delete(h); },
    advance(ms) {
      now += ms;
      for (const [h, t] of [...live].sort((a, b) => a[1].at - b[1].at)) if (t.at <= now && live.delete(h)) t.callback();
    },
    get armed() { return live.size; },
  };
}
function tankArgs() {
  const root = new THREE.Group(), hullG = new THREE.Group(), turretG = new THREE.Group();
  root.add(hullG); hullG.add(turretG);
  return { root, hullG, turretG, spec: { id: 'receipt' }, opts: {} };
}
const settle = (promise) => promise.then((value) => ({ value }), (error) => ({ error: error.message }));
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---- control: an answering worker resolves and its timer is cleared
{
  const clock = manualTimers();
  resetDecorWorker(clock);
  workers.length = 0;
  startDecorWorker();
  assert.equal(workers.length, 1, 'started ahead of its first request');
  const plan = settle(planDecoration(tankArgs()));
  const { id } = workers[0].posted[0];
  assert.equal(clock.armed, 1);
  workers[0].answer({ id, reply: null });
  assert.deepEqual(await plan, { value: null });
  assert.equal(clock.armed, 0, 'its timer cleared');
}

// ---- (a) a worker that never answers: the plan rejects within the deadline; (c) its late reply is dropped
{
  const clock = manualTimers();
  resetDecorWorker(clock);
  workers.length = 0;
  const plan = settle(planDecoration(tankArgs()));
  clock.advance(29_999);
  await flush();
  clock.advance(1);
  assert.deepEqual(await plan, { error: 'decor worker went silent' }, 'rejected at the first-answer deadline');
  assert.equal(workers[0].terminated, 1);
  assert.doesNotThrow(() => workers[0].answer({ id: workers[0].posted[0].id, reply: null }), 'a late reply is dropped');
  assert.deepEqual(await settle(planDecoration(tankArgs())), { error: 'decor worker unavailable' },
    'a worker that never answered is not started again: later tanks plan in-line');
  assert.equal(workers.length, 1);
}

// ---- (b) an unreadable reply rejects every request held; one fresh worker after an answering one, then in-line
{
  const clock = manualTimers();
  resetDecorWorker(clock);
  workers.length = 0;
  const first = settle(planDecoration(tankArgs()));
  workers[0].answer({ id: workers[0].posted[0].id, reply: null });
  await first;
  const a = settle(planDecoration(tankArgs())), b = settle(planDecoration(tankArgs()));
  workers[0].onmessageerror({});
  assert.deepEqual([await a, await b], [{ error: 'decor worker reply could not be read' }, { error: 'decor worker reply could not be read' }]);
  const third = settle(planDecoration(tankArgs()));
  assert.equal(workers.length, 2, 'a fresh worker after one that had answered');
  workers[1].answer({ id: workers[1].posted[0].id, reply: null });
  assert.deepEqual(await third, { value: null });
  const held = settle(planDecoration(tankArgs()));
  clock.advance(15_000);
  assert.deepEqual(await held, { error: 'decor worker went silent' }, 'a heard worker: the 15 s deadline');
  assert.deepEqual(await settle(planDecoration(tankArgs())), { error: 'decor worker unavailable' }, 'two failures: in-line from here on');
  assert.equal(workers.length, 2);
}

// ---- an error reply rejects only its own tank
{
  const clock = manualTimers();
  resetDecorWorker(clock);
  workers.length = 0;
  const plan = settle(planDecoration(tankArgs()));
  workers[0].answer({ id: workers[0].posted[0].id, error: 'planner threw' });
  assert.deepEqual(await plan, { error: 'planner threw' });
  assert.equal(workers[0].terminated, 0);
  resetDecorWorker();
}

console.log('decorPlanClient.selftest: an answering worker clears its deadline, a silent one rejects at it, a late reply dropped, an unreadable reply rejects all held, one fresh worker then in-line PASS');
