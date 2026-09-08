import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrameLoopScheduler } from '../engine/frameLoopScheduler.ts';
import { createNetworkBrowserSessionRuntime } from '../net/networkBrowserSessionRuntime.ts';
import { createBattleEntryLifecycle } from './battleEntryLifecycle.ts';

function createIdleEntryFixture() {
  let now = 0, nextHandle = 0, focused = true, hidden = false, wakeCount = 0;
  let idleCancelled = 0, backgroundTicks = 0, samples = 0, readyCalls = 0;
  let recurring, idle;
  const frames = new Map();
  const snapshot = {
    tick: 3, serverTimeMs: 50, ackInputSeq: null,
    entities: [{ id: 'viewer' }], shells: [], events: [],
    meta: { phase: 'loading' }, immediateAuthority: null,
  };
  const client = { closed: false, connected: true };
  const session = createNetworkBrowserSessionRuntime({
    getPlayer: () => null, isBattleActive: () => false,
    shouldPresentDisconnect: () => false,
    nextFrame: async () => { throw new Error('authority should already be sampled'); },
  });
  const match = {
    role: 'client', client,
    update() { samples++; return snapshot; },
    submitInput() { throw new Error('covered entry must not submit controls'); },
    ready() { readyCalls++; },
    close() { client.closed = true; },
  };
  const lifecycle = createBattleEntryLifecycle({
    nextFrame: async () => {},
    wakeFrameLoop() {
      assert.equal(lifecycle.renderingCovered, true,
        'coverage must be established before waking the single frame owner');
      wakeCount++;
      scheduler.restart();
    },
  });
  const scheduler = createFrameLoopScheduler({
    tick(at) {
      scheduler.schedule();
      // The real main-frame covered branch pumps without any scene work.
      if (lifecycle.renderingCovered) session.pump(1 / 60, at);
    },
    isBootComplete: () => true,
    shouldUseIdleCadence: () => !lifecycle.renderingCovered && !session.match,
    idleIntervalMs: 5000,
    hasBackgroundWork: () => !!session.match,
    backgroundTick(at) { backgroundTicks++; session.pumpBackground(at); },
    requestFrame(callback) { const handle = ++nextHandle; frames.set(handle, callback); return handle; },
    cancelFrame(handle) { frames.delete(handle); },
    now: () => now,
    setDelayed(callback, ms) {
      assert.equal(ms, 5000, 'use the existing settled-Garage watchdog');
      idle = callback;
      return ++nextHandle;
    },
    clearDelayed() { idleCancelled++; idle = null; },
    setRecurring(callback, ms) {
      assert.ok(ms === 100 || ms === 50, 'only the existing scheduler recovery clock is used');
      recurring = callback;
      return ++nextHandle;
    },
    clearRecurring() { recurring = null; },
    documentState: { get hidden() { return hidden; }, hasFocus: () => focused },
    inputTarget: { addEventListener() {}, removeEventListener() {} },
  });
  scheduler.schedule();
  return {
    lifecycle, scheduler, session, client, frames,
    publish() { session.publishMatch(match); },
    setFocused(value) { focused = value; },
    setHidden(value) { hidden = value; },
    fireFrame() {
      assert.equal(frames.size, 1);
      const [handle, callback] = frames.entries().next().value;
      frames.delete(handle);
      now += 16;
      callback(now);
    },
    fireRecovery() { now += 100; recurring(); },
    dispose() { session.close('test_complete'); scheduler.dispose(); },
    get idle() { return idle; },
    get focused() { return focused; },
    get wakeCount() { return wakeCount; },
    get idleCancelled() { return idleCancelled; },
    get samples() { return samples; },
    get readyCalls() { return readyCalls; },
    get backgroundTicks() { return backgroundTicks; },
  };
}

// A remote START has no local pointer/key event to wake a settled Garage.
// Exercise the actual lifecycle, frame scheduler and sampled-authority owner.
{
  const f = createIdleEntryFixture();
  assert.equal(typeof f.idle, 'function');
  assert.equal(f.wakeCount, 0, 'construction cannot evaluate the later-declared frame owner');
  f.lifecycle.coverRendering();
  assert.equal(f.idle, null, 'remote entry must cancel the pending five-second idle timer');
  assert.equal(f.frames.size, 1, 'remote entry queues one active frame immediately');
  assert.equal(f.session.match, null, 'the wake does not acquire or publish a match');
  const queuedFrame = [...f.frames.entries()][0];
  f.lifecycle.coverRendering();
  assert.equal(f.wakeCount, 1, 'the same cover owner cannot repeatedly restart its pending frame');
  assert.deepEqual([...f.frames.entries()][0], queuedFrame,
    'repeated coverage preserves the exact already-queued animation callback');
  assert.equal(f.idleCancelled, 1);
  f.publish();
  assert.equal(f.session.latestSnapshot, null);
  f.fireFrame();
  assert.equal(f.samples, 1);
  assert.equal(f.frames.size, 1, 'the existing tick re-arms the same single loop');
  assert.equal(f.session.bridge, null, 'authority sampling does not publish the prepared bridge');
  assert.equal((await f.session.waitForInitialSnapshot({ viewerId: 'viewer' })).tick, 3);
  assert.equal(f.readyCalls, 0, 'a covered wake cannot bypass the post-reveal READY barrier');
  f.lifecycle.uncoverRendering();
  f.lifecycle.coverRendering();
  assert.equal(f.wakeCount, 2, 'a genuinely new cover owns one new wake');
  assert.equal(f.frames.size, 1, 're-cover replaces rather than duplicates the queued frame');
  f.dispose();
}

{
  const f = createIdleEntryFixture();
  const cancelled = new Error('entry cancelled');
  await assert.rejects(f.lifecycle.run(async () => {
    f.lifecycle.coverRendering();
    f.publish();
    f.session.close('entry_cancelled');
    throw cancelled;
  }, false), (error) => error === cancelled);
  assert.equal(f.client.closed, true);
  assert.equal(f.lifecycle.pending, false);
  assert.equal(f.lifecycle.renderingCovered, false);
  f.fireFrame();
  assert.equal(f.samples, 0, 'a queued wake cannot sample a match closed before its delivery');
  assert.equal(f.readyCalls, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(typeof f.idle, 'function', 'cancelled entry returns to ordinary Garage cadence');
  f.dispose();
}

{
  const f = createIdleEntryFixture();
  f.setFocused(false);
  f.lifecycle.coverRendering();
  f.lifecycle.coverRendering();
  assert.equal(f.focused, false, 'covered entry never forces document focus');
  assert.equal(f.frames.size, 0, 'unfocused entry never requests a presentation frame');
  assert.equal(f.idle, null);
  f.publish();
  f.fireRecovery();
  assert.equal(f.backgroundTicks, 1, 'the existing render-free background pump stays authoritative');
  assert.equal(f.samples, 1);
  assert.equal(f.session.bridge, null);
  assert.equal(f.readyCalls, 0);
  f.session.close('entry_cancelled');
  f.fireRecovery();
  assert.equal(f.samples, 1, 'the recovery clock cannot touch a closed match');
  assert.equal(f.frames.size, 0);
  f.dispose();
}

{
  const f = createIdleEntryFixture();
  f.setHidden(true);
  f.lifecycle.coverRendering();
  f.publish();
  const queuedFrame = [...f.frames.entries()][0];
  // A focused embedded pane can report hidden and never deliver its rAF.
  f.fireRecovery();
  assert.equal(f.samples, 1, 'the existing focused-hidden rescue still pumps under cover');
  assert.equal(f.backgroundTicks, 0, 'focused hidden panes are not reclassified as background');
  assert.deepEqual([...f.frames.entries()][0], queuedFrame,
    'timer recovery cannot create a second animation clock');
  assert.equal(f.readyCalls, 0);
  f.dispose();
}

{
  const f = createIdleEntryFixture();
  f.dispose();
  f.lifecycle.coverRendering();
  assert.equal(f.frames.size, 0, 'a late cover cannot restart a disposed frame owner');
  assert.equal(f.idle, null);
  assert.equal(f.samples, 0);
}

const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /createBattleEntryLifecycle\(\{\s*nextFrame,\s*wakeFrameLoop:\s*\(\) => frameLoop\.restart\(\),/,
  'production composition must lazily wire the existing single-loop restart');

let nowMs = 100;
let frames = 0;
const receipts = [];
let lifecycle;
lifecycle = createBattleEntryLifecycle({
  now: () => nowMs,
  nextFrame: async () => {
    nowMs += 16;
    frames += 1;
    lifecycle.noteBattleFrame();
  },
  getRevealContext: () => ({ phase: 'battle', loaderVisible: true }),
  onReveal: (receipt) => receipts.push(receipt),
});

let releaseEntry;
const firstEntry = lifecycle.run(async () => {
  lifecycle.coverRendering();
  await new Promise((resolve) => { releaseEntry = resolve; });
  return 'entered';
}, 'busy');
assert.equal(lifecycle.pending, true);
assert.equal(lifecycle.renderingCovered, true);
assert.equal(await lifecycle.run(async () => 'overlap', 'busy'), 'busy',
  'all entry modes share one critical section');
releaseEntry();
assert.equal(await firstEntry, 'entered');
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false,
  'a completed entry cannot strand the render loop behind the cover');

await assert.rejects(
  lifecycle.run(async () => {
    lifecycle.coverRendering();
    throw new Error('entry failed');
  }, 'busy'),
  /entry failed/,
);
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false,
  'a failed entry releases both lifecycle gates');

lifecycle.coverRendering();
const receipt = await lifecycle.primeReveal();
assert.equal(frames, 1);
assert.equal(lifecycle.renderingCovered, false);
assert.deepEqual(receipt, {
  primed: true,
  frameSerial: 1,
  waitMs: 16,
  phase: 'battle',
  loaderVisible: true,
});
assert.deepEqual(receipts, [receipt]);

let stalledNow = 0;
const stalled = createBattleEntryLifecycle({
  now: () => stalledNow,
  revealTimeoutMs: 20,
  nextFrame: async () => { stalledNow += 11; },
});
stalled.coverRendering();
await assert.rejects(stalled.primeReveal(), /did not present/);
assert.equal(stalled.renderingCovered, false,
  'a reveal timeout still releases covered rendering for recovery');

assert.throws(
  () => createBattleEntryLifecycle({ nextFrame: async () => {}, revealTimeoutMs: 0 }),
  /positive and finite/,
);
assert.throws(
  () => createBattleEntryLifecycle({ nextFrame: async () => {}, wakeFrameLoop: true }),
  /requires frame/,
);

console.log('battleEntryLifecycle.selftest: idle wake, exclusivity and covered reveal passed');
