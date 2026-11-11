// workerCalls.selftest — improve-271 (plans 017, 031, the surface paint prefetch; on R6's count): the plumbing. A
// silent worker fails what it holds at the deadline, an error or an unreadable reply fails it at once, an abandoned worker
// is terminated and never posted to again, a fresh one starts under R6's count (a worker that never answered, or one that
// could not start, is one failure like any other: Main, 2026-11-11), and a reply after the deadline is dropped.
import assert from 'node:assert/strict';
import { createWorkerCalls } from './workerCalls.ts';

/** A clock the receipt advances by hand. */
function manualTimers() {
  let now = 0, serial = 0;
  const live = new Map();
  return {
    set(callback, ms) { const h = ++serial; live.set(h, { at: now + ms, callback }); return h; },
    clear(h) { live.delete(h); },
    advance(ms) {
      now += ms;
      for (;;) {
        let next = null;
        for (const [h, t] of live) if (t.at <= now && (!next || t.at < next[1].at)) next = [h, t];
        if (!next) return;
        live.delete(next[0]);
        next[1].callback();
      }
    },
    get armed() { return live.size; },
  };
}

class FakeWorker {
  constructor() { this.posted = []; this.terminated = 0; this.onmessage = null; this.onerror = null; this.onmessageerror = null; }
  postMessage(message) { this.posted.push(message); }
  terminate() { this.terminated++; }
  answer(data) { this.onmessage?.({ data }); }
}

function client(overrides = {}) {
  const timers = manualTimers();
  const spawned = [];
  const calls = createWorkerCalls({
    name: 'test worker', idOf: (d) => d.id, silenceMs: 1000, timers,
    spawn: () => { const w = new FakeWorker(); spawned.push(w); return w; },
    ...overrides,
  });
  return { timers, spawned, calls };
}
function recorder() {
  const log = { replies: [], failures: [] };
  return { log, call: { reply: (d) => { log.replies.push(d); return d.last !== false; }, fail: (e) => log.failures.push(e.message) } };
}

// ---- control: an answering worker settles the call and leaves no timer armed
{
  const { timers, spawned, calls } = client();
  const r = recorder();
  assert.equal(calls.post(1, { id: 1 }, undefined, r.call), true);
  assert.equal(timers.armed, 1, 'a held call arms the deadline');
  spawned[0].answer({ id: 1 });
  assert.deepEqual(r.log.replies, [{ id: 1 }]);
  assert.equal(timers.armed, 0, 'nothing held: no timer');
  timers.advance(5000);
  assert.deepEqual(r.log.failures, [], 'no deadline fires after the answer');
  assert.equal(spawned[0].terminated, 0);
}

// ---- a worker that never answers: every call it holds fails at the deadline; it is terminated, and it is one failure
// of R6's count like any other: the next call starts a fresh worker until the count runs out
{
  const { timers, spawned, calls } = client();
  const a = recorder(), b = recorder();
  calls.post(1, { id: 1 }, undefined, a.call);
  timers.advance(600);
  calls.post(2, { id: 2 }, undefined, b.call);
  timers.advance(399);
  assert.deepEqual(a.log.failures, [], 'not before the deadline');
  timers.advance(1);
  assert.deepEqual(a.log.failures, ['test worker went silent']);
  assert.deepEqual(b.log.failures, ['test worker went silent'], 'silence runs from the call that found it idle');
  assert.equal(spawned[0].terminated, 1);
  spawned[0].answer({ id: 1 });
  assert.deepEqual(a.log.replies, [], 'a reply after the deadline is dropped');
  assert.equal(calls.health.failures, 1, 'one failure');
  const c = recorder();
  assert.equal(calls.post(3, { id: 3 }, undefined, c.call), true, 'a fresh worker takes the next call');
  assert.equal(spawned.length, 2);
  assert.equal(spawned[0].posted.length, 2, 'never posted to the silent one again');
  timers.advance(1000);
  calls.post(4, { id: 4 }, undefined, recorder().call);
  timers.advance(1000);
  assert.equal(spawned.length, 3);
  assert.equal(calls.health.state, 'unavailable', 'three silent workers in a row');
  assert.equal(calls.post(5, { id: 5 }, undefined, recorder().call), false, 'every later call takes its fallback');
  assert.equal(spawned.length, 3);
}

// ---- a streaming answer is never silent; the first message may take longer than the rest
{
  const { timers, spawned, calls } = client({ firstSilenceMs: 3000 });
  const r = recorder();
  calls.post(1, { id: 1 }, undefined, r.call);
  timers.advance(2900);
  spawned[0].answer({ id: 1, last: false });
  for (let i = 0; i < 5; i++) { timers.advance(900); spawned[0].answer({ id: 1, last: false }); }
  spawned[0].answer({ id: 1 });
  assert.equal(r.log.replies.length, 7);
  assert.deepEqual(r.log.failures, []);
}

// ---- an error after answers: what it held fails and the next call starts a fresh worker; R6's count: a finished call
// starts it again, `maxFailures` failures in a row (no call finished between) leave the client unavailable
{
  const { spawned, calls } = client({ maxFailures: 2 });
  const a = recorder(), b = recorder(), c = recorder(), d = recorder(), e = recorder();
  calls.post(1, { id: 1 }, undefined, a.call);
  spawned[0].answer({ id: 1 });
  calls.post(2, { id: 2 }, undefined, b.call);
  spawned[0].onerror({ message: 'boom' });
  assert.deepEqual(b.log.failures, ['test worker failed: boom']);
  assert.equal(spawned[0].terminated, 1);
  assert.equal(calls.health.failures, 1);
  assert.equal(calls.post(3, { id: 3 }, undefined, c.call), true);
  assert.equal(spawned.length, 2, 'a fresh worker');
  assert.equal(spawned[0].posted.length, 2, 'never posted to the dead one again');
  spawned[1].answer({ id: 3 });
  assert.equal(calls.health.failures, 0, 'a finished call starts the count again');
  spawned[1].onmessageerror({});
  calls.post(4, { id: 4 }, undefined, d.call);
  assert.equal(spawned.length, 3);
  spawned[2].answer({ id: 4, last: false });
  spawned[2].onerror({ message: 'again' });
  assert.equal(calls.health.state, 'unavailable', 'two failures in a row');
  assert.equal(calls.post(5, { id: 5 }, undefined, e.call), false, 'fallback from here on');
  assert.equal(spawned.length, 3);
}

// ---- an unreadable reply fails every call at once; dispose fails what is held and closes
{
  const { spawned, calls } = client();
  const a = recorder(), b = recorder();
  calls.post(1, { id: 1 }, undefined, a.call);
  calls.post(2, { id: 2 }, undefined, b.call);
  spawned[0].onmessageerror({});
  assert.deepEqual([...a.log.failures, ...b.log.failures], ['test worker reply could not be read', 'test worker reply could not be read']);
  const second = client();
  const held = recorder();
  second.calls.post(1, { id: 1 }, undefined, held.call);
  second.calls.dispose(new Error('disposed'));
  assert.deepEqual(held.log.failures, ['disposed']);
  assert.equal(second.spawned[0].terminated, 1);
  assert.equal(second.calls.post(2, { id: 2 }, undefined, recorder().call), false);
}

// ---- warm: the worker starts before its first call, which still has the first-message grace
{
  const { timers, spawned, calls } = client({ firstSilenceMs: 3000 });
  assert.equal(calls.warm(), true);
  assert.equal(spawned.length, 1);
  assert.equal(timers.armed, 0, 'nothing held: no deadline while it loads');
  const r = recorder();
  calls.post(1, { id: 1 }, undefined, r.call);
  assert.equal(spawned.length, 1, 'the warmed worker takes the call');
  timers.advance(2999);
  assert.deepEqual(r.log.failures, []);
  timers.advance(1);
  assert.deepEqual(r.log.failures, ['test worker went silent']);
}

// ---- no worker at all, and a post that throws
{
  // a worker that cannot start is a failure of the count: three tries, then the client is unavailable
  let tries = 0;
  const none = client({ spawn: () => { tries++; return null; } });
  for (let id = 1; id <= 4; id++) assert.equal(none.calls.post(id, { id }, undefined, recorder().call), false);
  assert.equal(tries, 3, 'three starts, then none');
  assert.equal(none.calls.available, false);
  const throwing = client({ spawn: () => { throw new Error('no Worker'); } });
  assert.equal(throwing.calls.post(1, { id: 1 }, undefined, recorder().call), false);
  assert.equal(throwing.calls.health.failures, 1);
  const refuse = client();
  const r = recorder();
  const ok = refuse.calls.post(1, { id: 1 }, undefined, recorder().call);
  refuse.spawned[0].postMessage = () => { throw new Error('DataCloneError'); };
  assert.equal(ok, true);
  assert.equal(refuse.calls.post(2, { id: 2 }, undefined, r.call), false, 'a message the worker cannot take: the caller falls back');
  assert.equal(refuse.calls.running, true, 'the worker itself is not blamed');
}

console.log('workerCalls.selftest: deadline from the idle call, streaming never silent, first-message grace, abandon on error/unreadable/silence, a fresh worker under R6\'s count (a silent or unstartable one counted like any failure), dispose PASS');
