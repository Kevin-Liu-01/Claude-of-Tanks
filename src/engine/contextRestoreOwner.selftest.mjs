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
  // the superseded restoration sees its signal abort, and the next one starts only after it settles. (Round 2 Q14) the
  // hazard is asserted first, in terms any version of the machine has (the owner's own calls): on the base a second loss
  // and restore started a second owner restoration beside the first; the machine's new records are checked after it
  const first = deferred();
  const signals = [];
  let running = 0, maxRunning = 0;
  const f = fixture(async (signal) => {
    signals.push(signal);
    running += 1; maxRunning = Math.max(maxRunning, running);
    try {
      if (signals.length === 1) await first.promise;
      if (signal?.aborted) throw new Error('superseded');
      return true;
    } finally { running -= 1; }
  });
  f.lost(); f.restored(); await flush();
  const restoring = { state: f.controller.state, calls: signals.length, aborted: signals[0]?.aborted };
  f.lost();
  const lost = { state: f.controller.state, aborted: signals[0]?.aborted };
  f.restored(); await flush();
  const beforeSettle = signals.length;
  first.resolve(); await flush();
  assert.equal(maxRunning, 1, 'two owner restorations never run at once');
  assert.equal(beforeSettle, 1, 'the newer restoration waits for the superseded one to settle');
  assert.equal(signals.length, 2, 'and starts once it has');
  assert.deepEqual(restoring, { state: 'restoring', calls: 1, aborted: false });
  assert.deepEqual(lost, { state: 'lost', aborted: true }, 'a newer loss aborts the running restoration');
  assert.equal(signals[1].aborted, false);
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

{
  // (review round 1) the production restoration, executed: main.ts onRestored hands its currency to the Garage GPU
  // restore, so a newer loss stops that restore at its next checkpoint (restorePresentationGpu's assertCurrent between
  // stages) and the next restoration starts as soon as it settles. Before, restoreGpu() got no currency check: the
  // superseded restore uploaded to its end beside the newer loss, and the next restoration waited for the 3 s bound.
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const body = main.match(/async onRestored\(signal: AbortSignal\) \{([\s\S]*?)\n  \},\n\};/)?.[1];
  assert.ok(body, 'exercise the production context-restored adapter');
  const pendingFrames = [];
  const frame = () => new Promise((resolve) => { pendingFrames.push(resolve); });
  const releaseFrame = async () => { for (const resolve of pendingFrames.splice(0)) resolve(); await flush(); };
  const uploads = [];
  let rearmed = 0;
  const garagePhasePresentation = {
    // the Garage restore pipeline's shape: stages across frames, a currency check before each stage commits
    async restoreGpu(isCurrent) {
      const call = uploads.push(0) - 1;
      for (let stage = 0; stage < 4; stage += 1) {
        await frame();
        if (isCurrent && !isCurrent()) throw new Error('Garage GPU restore superseded');
        uploads[call] += 1;
      }
    },
  };
  const onRestored = new Function('ports', `
    const { renderer, game, garagePhasePresentation } = ports;
    const noop = () => {};
    const lighting = { invalidateShadowMaps: noop, update: noop };
    const combatWarmComposition = { resetRendererWarmState: noop };
    const applyGraphicsRecovery = noop;
    const pedestal = { trim: noop };
    const worldRuntime = { enforceCacheBudget: noop };
    const nextFrame = async () => {};
    const viewport = { apply: noop };
    const post = { resetAdaptiveResolution: noop, render: noop, setAdaptiveHold: noop, setAdaptiveSuspended: noop };
    const sky = { bakeEnvironment: noop };
    const garageReturn = { recoverAfterContextRestore: async () => false };
    const rearmRafAfterContext = ports.rearm;
    let graphicsContextLost = true;
    let garagePresentationDirty = true;
    return async (signal) => { ${body} };
  `)({
    renderer: { info: {}, getContext: () => ({ isContextLost: () => false }) },
    game: { phase: 'garage' },
    garagePhasePresentation,
    rearm: () => { rearmed += 1; },
  });
  const f = fixture(onRestored);
  f.lost(); f.restored(); await flush();
  assert.equal(uploads.length, 1, 'the Garage restore is under way');
  await releaseFrame();
  assert.equal(uploads[0], 1);
  f.lost(); f.restored(); await flush();
  await releaseFrame();
  assert.equal(uploads[0], 1, 'the superseded Garage restore stopped at its next checkpoint');
  assert.equal(uploads.length, 2, 'and the newer restoration started once it settled, not at the 3 s bound');
  assert.equal(f.timers.filter((timer) => timer.ms > 1000).every((timer) => !timer.live), true, 'the bound was never needed');
  for (let i = 0; i < 4; i += 1) await releaseFrame();
  assert.equal(uploads[1], 4, 'the current restoration restores the Garage to the end');
  assert.equal(f.controller.state, 'live');
  assert.equal(rearmed, 1, 'only the current restoration resumes the frame loop');
}

console.log('contextRestoreOwner selftest: aborted, serialized restorations; loss counted first; typed restore outcome');
