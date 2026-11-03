import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContextRecovery } from './contextRecovery.ts';
import { installContextResourceLifetime } from './contextResourceLifetime.ts';

// 2026-11-02 audit R3 (context loss/restore): a second loss during a restore only discarded the first restoration's
// result: its owner (main.ts onRestored) kept rebuilding on the dead context, and the next restored event started a
// second owner restoration beside it. The resource lifetime's loss count had to run before the recovery's owner by
// listener registration order (a comment). And the black-world guard inferred the recovery's outcome from a 15 s
// timer. Now: an AbortSignal per restoration (aborted by the next loss), restorations run one at a time, the
// lifetime's count runs first by code (beforeLost), and the machine publishes its state and a typed restore request.

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 16; i += 1) await Promise.resolve(); }

function fixture(onRestored, { beforeLost, onLost } = {}) {
  const notices = [];
  const timers = [];
  const controller = createContextRecovery({
    owner: () => ({ onLost, onRestored }),
    beforeRestore() {},
    beforeLost,
    recordLoss() {},
    notice: (state) => notices.push(state),
    schedule: () => 1,
    cancel() {},
    later: (callback, ms) => { const timer = { callback, ms, live: true }; timers.push(timer); return () => { timer.live = false; }; },
  });
  return { controller, notices, timers,
    lost: (event = { preventDefault() {} }) => controller.lost(event), restored: () => controller.restored() };
}

{
  // the superseded restoration sees its signal abort, and the next one starts only after it settles
  const first = deferred();
  const signals = [];
  let running = 0, maxRunning = 0;
  const f = fixture(async (signal) => {
    signals.push(signal);
    running += 1; maxRunning = Math.max(maxRunning, running);
    try {
      if (signals.length === 1) await first.promise;
      if (signal.aborted) throw new Error('superseded');
      return true;
    } finally { running -= 1; }
  });
  f.lost(); f.restored(); await flush();
  assert.equal(f.controller.state, 'restoring');
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, false);
  f.lost();
  assert.equal(signals[0].aborted, true, 'a newer loss aborts the running restoration');
  assert.equal(f.controller.state, 'lost');
  f.restored(); await flush();
  assert.equal(signals.length, 1, 'the newer restoration waits for the superseded one to settle');
  first.resolve(); await flush();
  assert.equal(signals.length, 2);
  assert.equal(signals[1].aborted, false);
  assert.equal(maxRunning, 1, 'two owner restorations never run at once');
  assert.equal(f.notices.at(-1), 'ready');
  assert.equal(f.controller.state, 'live');
}

{
  // an old await that never settles cannot block recovery: the bound starts the newer restoration anyway
  let calls = 0;
  const f = fixture(() => { calls += 1; return calls === 1 ? new Promise(() => {}) : true; });
  f.lost(); f.restored(); await flush();
  f.lost(); f.restored(); await flush();
  assert.equal(calls, 1);
  const bound = f.timers.find((timer) => timer.live && timer.ms > 1000);
  assert.ok(bound, 'a bounded wait is armed');
  bound.callback(); await flush();
  assert.equal(calls, 2, 'the bound starts the newer restoration');
  assert.equal(f.notices.at(-1), 'ready');
}

{
  // the resource lifetime counts the loss before the owner's onLost, whatever the listener order
  const canvas = new EventTarget();
  const gl = { createBuffer: () => ({}), deleteBuffer() {} };
  for (const family of ['Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader', 'VertexArray', 'Query', 'Sampler', 'TransformFeedback']) {
    gl[`create${family}`] = () => ({}); gl[`delete${family}`] = () => {};
  }
  gl.fenceSync = () => ({}); gl.deleteSync = () => {};
  const deleted = [];
  gl.deleteTexture = (texture) => deleted.push(texture);
  const lifetime = installContextResourceLifetime(gl, canvas);
  const texture = gl.createTexture();
  // the owner disposes a texture inside onLost; the recovery listener is registered BEFORE the lifetime's here
  const f = fixture(() => true, { beforeLost: (event) => lifetime.noteLost(event), onLost: () => gl.deleteTexture(texture) });
  const event = new Event('webglcontextlost');
  event.preventDefault = () => {};
  f.lost(event);
  canvas.dispatchEvent(event); // the lifetime's own listener on the same event: counted once
  assert.deepEqual(deleted, [], 'the owner\'s delete of a lost-context handle is retired: the count ran first');
  const fresh = gl.createTexture();
  gl.deleteTexture(fresh);
  assert.deepEqual(deleted, [fresh], 'one event counts one generation (the restored context\'s handles stay native)');
  lifetime.dispose();
}

{
  // the typed restore request (the black-world guard's H4): the outcome of the restoration that follows
  const control = { lost: 0, restores: 0, loseContext() { this.lost += 1; }, restoreContext() { this.restores += 1; } };
  let outcome = null;
  const f = fixture(() => true);
  f.controller.request(control).then((value) => { outcome = value; });
  assert.equal(control.lost, 1);
  f.lost();
  const timer = f.timers.find((entry) => entry.ms === 120);
  assert.ok(timer);
  timer.callback();
  assert.equal(control.restores, 1);
  f.restored(); await flush();
  assert.equal(outcome, 'ready');
  let failed = null;
  const g = fixture(() => false);
  g.controller.request(control).then((value) => { failed = value; });
  g.lost(); g.restored(); await flush();
  assert.equal(failed, 'failed', 'a failed restoration answers failed (no timer inference)');
  assert.equal(g.controller.state, 'failed');
  let disposed = null;
  const h = fixture(() => true);
  h.controller.request(control).then((value) => { disposed = value; });
  h.controller.dispose(); await flush();
  assert.equal(disposed, 'disposed');
}

{
  // the production wiring: renderer.ts runs the lifetime's count first and publishes state and request; main.ts's
  // restoration checks the signal at every currency check
  const renderer = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
  assert.match(renderer, /beforeLost: \(event\) => contextResources\.noteLost\(event\)/);
  assert.match(renderer, /contextRecoveryState = \(\) => recovery\.state/);
  assert.match(renderer, /requestContextRestore = \(\) =>/);
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.match(main, /async onRestored\(signal: AbortSignal\) \{/);
  assert.match(main, /const isCurrentRestoration = \(\) => !signal\.aborted && /);
}

console.log('contextRestoreOwner selftest: aborted, serialized restorations; loss counted first; typed restore outcome');
