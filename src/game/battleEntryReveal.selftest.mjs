// 2026-11-02 audit F2/F3: the battle entry lifecycle's exits and edges. primeReveal waited for its first battle frame
// with no exit, so a frame owner that stopped presenting battle frames held the entry latch for good (every later
// entry was refused as busy); Battle Again polled the latch every 150 ms and 16 ms; and "the entry" had no identity of
// its own (main read the scene watchdog's counter, which spectating advances).
import assert from 'node:assert/strict';
import * as entryLifecycle from './battleEntryLifecycle.ts';

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

console.log('battleEntryReveal.selftest: reveal exits (left, stalled, hidden pauses), entry edges and serial passed');
