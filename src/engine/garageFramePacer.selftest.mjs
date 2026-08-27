import assert from 'node:assert/strict';
import { createGarageFramePacer } from './garageFramePacer.ts';

const pacer = createGarageFramePacer({ idleFramesPerSecond: 10, activeTailMs: 200 });

assert.equal(pacer.shouldRender(0), true, 'the first Garage frame always paints');
assert.equal(pacer.shouldRender(16), false, 'a settled Garage skips display-rate redraws');
assert.equal(pacer.shouldRender(99), false, 'idle cadence is bounded');
assert.equal(pacer.shouldRender(100), true, 'the idle fail-safe paints on schedule');

assert.equal(pacer.shouldRender(110, { dirty: true }), true,
  'async scene completion paints immediately');
assert.equal(pacer.shouldRender(126, { animate: true }), true,
  'visible motion restores display-rate painting');
assert.equal(pacer.shouldRender(142), true,
  'animation keeps a short full-rate tail to avoid a clipped final frame');
assert.equal(pacer.shouldRender(343), true,
  'idle cadence resumes after the interaction tail');
assert.equal(pacer.shouldRender(359), false,
  'settled frames are skipped again');

pacer.noteActivity(500);
assert.equal(pacer.shouldRender(516), true, 'input activity wakes the Garage immediately');
pacer.reset(1000);
assert.equal(pacer.shouldRender(1000), true, 'a Garage re-entry always paints immediately');
assert.equal(pacer.stats.idleFramesPerSecond, 10);
assert.ok(pacer.stats.rendered > 0 && pacer.stats.skipped > 0,
  'diagnostics expose both render and skip decisions');

const defaultPacer = createGarageFramePacer();
assert.equal(defaultPacer.stats.idleFramesPerSecond, 2,
  'the static Garage watchdog must not keep a mostly idle GPU hot');
assert.equal(defaultPacer.shouldRender(0), true);
assert.equal(defaultPacer.shouldRender(499), false);
assert.equal(defaultPacer.shouldRender(500), true,
  'un-signaled async completion remains visible within half a second');

console.log('garageFramePacer.selftest: static Garage is demand-paced without clipping motion');
