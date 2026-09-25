import assert from 'node:assert/strict';
import { createFixedStepLoop } from './loop.ts';

// A fake clock and timer: every wake-up is exact, then we inject jitter and a stall.
{
  let nowMs = 1000;
  const timers = [];
  const schedule = (callback, delayMs) => {
    const timer = { at: nowMs + delayMs, callback, cancelled: false };
    timers.push(timer);
    return () => { timer.cancelled = true; };
  };
  const earliest = () => {
    timers.sort((a, b) => a.at - b.at);
    return timers.find((timer) => !timer.cancelled) ?? null;
  };
  /** Fire the earliest armed timer `lateMs` after its scheduled instant. */
  const fireNext = (lateMs = 0) => {
    const next = earliest();
    if (!next) return false;
    timers.splice(timers.indexOf(next), 1);
    nowMs = Math.max(nowMs, next.at + lateMs);
    next.callback();
    return true;
  };
  /** Fire every timer due by `untilMs`, each exactly on time. */
  const fire = (untilMs) => {
    while (earliest() && earliest().at <= untilMs) fireNext(0);
    nowMs = Math.max(nowMs, untilMs);
  };
  const seen = [];
  const loop = createFixedStepLoop({
    tickMs: 1000 / 60, maxCatchUpTicks: 6, now: () => nowMs, schedule,
    onTick: (tick, dt) => { seen.push(tick); assert.equal(dt, 1 / 60); },
  });
  assert.equal(loop.advance(), 0, 'a stopped loop runs nothing');
  loop.start();
  fire(1000 + 1000 / 60 * 10 + 0.001);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'ten exact wake-ups run ten consecutive ticks');
  // a timer that wakes 12 ms late does not drift the schedule: the next target is still on the grid
  fireNext(12);
  assert.equal(loop.tick, 11);
  const after = earliest().at;
  assert.ok(Math.abs(after - (1000 + 12 * 1000 / 60)) < 1e-6, `late wake-up keeps the grid (${after})`);
  assert.ok(loop.stats.lateWakeupMaxMs >= 12 - 1e-6);
  // a 500 ms stall: at most six ticks run, the rest are dropped and counted, the phase is kept
  fireNext(500);
  assert.equal(loop.stats.stalls, 1);
  assert.ok(loop.stats.droppedTicks >= 20, `dropped ${loop.stats.droppedTicks}`);
  fire(nowMs);
  const ticksAfterStall = loop.tick;
  fire(nowMs + 1000 / 60 * 3 + 0.001);
  assert.equal(loop.tick, ticksAfterStall + 3, 'after a stall the loop resumes one tick per interval');
  loop.stop();
  const pending = timers.filter((t) => !t.cancelled).length;
  assert.equal(pending, 0, 'stop cancels the armed timer');
  assert.equal(loop.running, false);
  assert.equal(loop.tickCost.count, loop.tick);
  console.log(`loop.selftest: ${loop.tick} ticks, ${loop.stats.wakeups} wake-ups, drift-free late wake, stall dropped ${loop.stats.droppedTicks} ticks`);
}

// Manual driving without timers (the receipts and the soak's in-process mode use this).
{
  let nowMs = 0;
  const loop = createFixedStepLoop({ now: () => nowMs, schedule: () => () => {}, onTick: () => {} });
  loop.start();
  nowMs = 1000;
  assert.equal(loop.advance(nowMs), 6, 'a one second gap runs the catch-up window');
  nowMs = 1000 + 1000 / 60 * 4;
  assert.equal(loop.advance(nowMs), 4);
  assert.throws(() => createFixedStepLoop({ tickMs: 0, onTick: () => {} }), TypeError);
  assert.throws(() => createFixedStepLoop({ maxCatchUpTicks: 0, onTick: () => {} }), TypeError);
  // an error inside a tick is reported and does not stop the loop
  const errors = [];
  const faulty = createFixedStepLoop({ now: () => nowMs, schedule: () => () => {}, onTick: (tick) => { if (tick === 2) throw new Error('boom'); }, onError: (e) => errors.push(e) });
  faulty.start();
  nowMs += 1000 / 60 * 3;
  assert.equal(faulty.advance(nowMs), 3);
  assert.equal(errors.length, 1);
  console.log('loop.selftest: manual advance, catch-up window and error isolation hold');
}

// Real timers for one short stretch: cadence stays within a tick of the wall clock.
{
  const started = performance.now();
  let count = 0;
  const loop = createFixedStepLoop({ onTick: () => { count++; } });
  loop.start();
  await new Promise((resolve) => setTimeout(resolve, 250));
  loop.stop();
  const elapsed = performance.now() - started;
  const expected = elapsed / (1000 / 60);
  assert.ok(Math.abs(count - expected) <= 3, `real timers: ${count} ticks in ${elapsed.toFixed(1)} ms (expected ~${expected.toFixed(1)})`);
  console.log(`loop.selftest: real timers ran ${count} ticks in ${elapsed.toFixed(0)} ms (max late wake ${loop.stats.lateWakeupMaxMs.toFixed(1)} ms)`);
}
