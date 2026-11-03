// 2026-11-02 audit F2/F3: the battle entry lifecycle's exits and edges. primeReveal waited for its first battle frame
// with no exit, so a frame owner that stopped presenting battle frames held the entry latch for good (every later
// entry was refused as busy); Battle Again polled the latch every 150 ms and 16 ms; and "the entry" had no identity of
// its own (main read the scene watchdog's counter, which spectating advances).
import assert from 'node:assert/strict';
import * as entryLifecycle from './battleEntryLifecycle.ts';
import { createFrameLoopScheduler } from '../engine/frameLoopScheduler.ts';
import { mainStatement, runMainStatements } from '../app/mainComposition.test-support.mjs';

const { createBattleEntryLifecycle, REVEAL_ABANDON_BUDGETS = 10 } = entryLifecycle;
const isAbandoned = (error) => error?.name === 'BattleRevealAbandonedError' && error.code === 'battle_reveal_abandoned';

/** A frame owner that never presents a battle frame; the fake clock advances per frame, with a bound. */
function stalledFrames({ msPerFrame = 100, maxFrames = 2000 } = {}) {
  let now = 0;
  let frames = 0;
  return {
    now: () => now,
    nextFrame: async () => {
      frames += 1;
      now += msPerFrame;
      if (frames > maxFrames) throw new Error('the reveal never exited');
    },
    get frames() { return frames; },
  };
}

// A reveal whose battle left the screen fails its entry at once, and the latch is free for the next entry.
{
  const clock = stalledFrames();
  let battle = true;
  const slow = [];
  const lifecycle = createBattleEntryLifecycle({
    nextFrame: clock.nextFrame, now: clock.now, revealTimeoutMs: 1000,
    canReveal: () => battle, onSlowReveal: (receipt) => slow.push(receipt.phase),
  });
  const entry = lifecycle.run(async () => {
    const reveal = lifecycle.primeReveal();
    battle = false; // the room was left under the cover: no battle frame can come
    return reveal;
  }, 'busy');
  await assert.rejects(entry, (error) => isAbandoned(error) && /left the screen/.test(error.message));
  assert.equal(lifecycle.pending, false, 'the abandoned reveal releases the entry latch');
  assert.ok(clock.frames < 5);
  assert.deepEqual(slow, ['abandoned']);
  assert.equal(await lifecycle.run(async () => 'next', 'busy'), 'next', 'the next entry is accepted');
}

// A frame owner that stopped presenting battle frames: the reveal reports extended, stalled, then abandons after
// REVEAL_ABANDON_BUDGETS budgets of presentable time.
{
  const clock = stalledFrames();
  const slow = [];
  const lifecycle = createBattleEntryLifecycle({
    nextFrame: clock.nextFrame, now: clock.now, revealTimeoutMs: 1000,
    onSlowReveal: (receipt) => slow.push(receipt.phase),
  });
  await assert.rejects(lifecycle.run(() => lifecycle.primeReveal(), 'busy'), isAbandoned);
  assert.deepEqual(slow, ['extended', 'stalled', 'abandoned']);
  const waited = clock.now();
  assert.ok(waited > 1000 * REVEAL_ABANDON_BUDGETS && waited < 1000 * (REVEAL_ABANDON_BUDGETS + 1), `abandoned at ${waited} ms`);
  assert.equal(lifecycle.pending, false);
}

// Hidden time (or a lost context) pauses the ceiling, and a frame that arrives late still reveals.
{
  const clock = stalledFrames();
  let presentable = false;
  let lifecycle;
  lifecycle = createBattleEntryLifecycle({
    nextFrame: async () => {
      await clock.nextFrame();
      if (clock.now() === 30_000) presentable = true; // the page comes back
      if (clock.now() === 31_000) lifecycle.noteBattleFrame();
    },
    now: clock.now, revealTimeoutMs: 1000, isPresentable: () => presentable,
  });
  const receipt = await lifecycle.run(() => lifecycle.primeReveal(), 'busy');
  assert.equal(receipt.primed, true, 'thirty hidden seconds never abandon a reveal');
  assert.equal(receipt.slow, 'stalled');
}

// The edges Battle Again waits on, the entry's own serial, and the acceptance hook before the task.
{
  const order = [];
  const lifecycle = createBattleEntryLifecycle({ nextFrame: async () => {}, onEntry: () => order.push('accepted') });
  let settled = false;
  let covered = false;
  await lifecycle.whenSettled();
  let finish;
  const entry = lifecycle.run(() => { order.push('task'); return new Promise((resolve) => { finish = resolve; }); }, 'busy');
  assert.deepEqual(order, ['accepted', 'task'], 'the acceptance hook runs before the task can arm anything');
  assert.equal(lifecycle.entrySerial, 1);
  assert.equal(await lifecycle.run(async () => 'second', 'busy'), 'busy');
  assert.equal(lifecycle.entrySerial, 1, 'a refused entry is not an entry');
  const whenSettled = lifecycle.whenSettled().then(() => { settled = true; });
  const whenCovered = lifecycle.whenCovered().then(() => { covered = true; });
  await Promise.resolve();
  assert.equal(covered, false);
  lifecycle.coverRendering();
  await whenCovered;
  assert.equal(covered, true, 'the cover edge resolves its waiters');
  assert.equal(settled, false);
  finish('done');
  assert.equal(await entry, 'done');
  await whenSettled;
  assert.equal(settled, true, 'the settle edge resolves its waiters');
}

// (audit F2 review) main's actual reveal ports over the real frame-loop scheduler. A window that lost focus stays
// `visible` (document.hidden false) while the scheduler runs no tick (its own focus rule), so no battle frame can come;
// counting that time toward the abandon ceiling failed a healthy entry back to the Garage when the player switched
// windows during loading. The ceiling counts only the time the scheduler can present.
{
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const revealWith = async ({ focusedAtStart, presentsBattleFrames }) => {
    let focused = focusedAtStart;
    const listeners = new Map();
    const target = {
      addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      removeEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener)),
      dispatch: (type) => { for (const listener of listeners.get(type) ?? []) listener({ type }); },
    };
    const documentState = { get hidden() { return false; }, hasFocus: () => focused, ...target };
    const frames = [];
    let tickCount = 0;
    const scope = {
      game: { phase: 'battle', tanks: [] },
      graphicsContextLost: false,
      document: documentState,
      // a 40 ms reveal budget: the abandon ceiling is REVEAL_ABANDON_BUDGETS of them (400 ms) of presentable time
      revealTimeoutForField: () => 40,
      nextFrame: () => sleep(5),
      createBattleEntryLifecycle: entryLifecycle.createBattleEntryLifecycle,
      sceneWatchdogEntryGeneration: 0,
      coveredBattleWatchdog: null,
    };
    const lifecycle = runMainStatements(mainStatement('const battleEntryLifecycle = createBattleEntryLifecycle({'),
      scope, 'battleEntryLifecycle');
    scope.frameLoop = createFrameLoopScheduler({
      tick: () => { tickCount += 1; if (presentsBattleFrames) lifecycle.noteBattleFrame(); },
      isBootComplete: () => true,
      requestFrame: (callback) => { frames.push(callback); return frames.length; },
      cancelFrame: () => {},
      now: () => performance.now(),
      setRecurring: () => 0, clearRecurring: () => {},
      setDelayed: () => 0, clearDelayed: () => {},
      documentState,
      inputTarget: target,
    });
    const pump = () => { for (const callback of frames.splice(0)) callback(performance.now()); };
    if (!focusedAtStart) target.dispatch('blur');
    else scope.frameLoop.restart();
    let outcome = null;
    const entry = lifecycle.run(() => lifecycle.primeReveal(), 'busy')
      .then((receipt) => { outcome = receipt; }, (error) => { outcome = error; });
    // three abandon ceilings of wall time with the window blurred (or focused, for the control)
    const until = performance.now() + 1200;
    while (performance.now() < until && outcome === null) { pump(); await sleep(10); }
    const blurredOutcome = outcome;
    if (!focusedAtStart) {
      focused = true;
      target.dispatch('focus'); // the player comes back: the scheduler restarts and presents
      while (outcome === null) { pump(); await sleep(5); }
    }
    await entry;
    scope.frameLoop.dispose();
    return { blurredOutcome, outcome, tickCount, lifecycle };
  };

  const blurred = await revealWith({ focusedAtStart: false, presentsBattleFrames: true });
  assert.equal(blurred.blurredOutcome, null, 'a blurred, visible window never abandons the reveal (no tick could present)');
  assert.equal(blurred.outcome?.primed, true, 'focus returns, the first battle frame presents, and the reveal completes');
  assert.equal(blurred.lifecycle.pending, false);

  const stalled = await revealWith({ focusedAtStart: true, presentsBattleFrames: false });
  assert.ok(isAbandoned(stalled.blurredOutcome), 'a focused frame owner that ticks and never presents a battle frame still abandons');
  assert.ok(stalled.tickCount > 0, 'the control case did tick');
}

console.log('battleEntryReveal.selftest: reveal exits (left, stalled, hidden and blurred pause), entry edges and serial passed');
