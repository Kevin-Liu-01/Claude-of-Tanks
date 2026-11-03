// The ground overlay's clock as a declared state (2026-11-02 audit S2, terrainDeformation.ts): unset on a fresh overlay
// and after every reset, set by setTime. A solo world's overlay is reset for each battle (game/state.ts setupBattle) and
// the old reset kept the previous battle's last time, so a heap laid before the next battle's first step started on
// that stale clock and stood flat until the new battle's clock caught up with it (up to a whole battle). Held here:
// - reset unsets the clock (clockS NaN): a heap laid next stands whole at once, as on a fresh overlay, bit for bit;
// - setTime with a time that is not finite is the unset clock, never a time;
// - the lattice offsets' cache (cacheEpoch) survives clock steps once every heap on the clock has risen (the old count of
//   timed heaps never fell, so one collapse dropped the cache every step for the rest of the battle), and is dropped
//   again by a step back into a rise; the contact reads are the same numbers either way.
import assert from 'node:assert/strict';
import { RUBBLE_GROW_S, createTerrainDeformation } from './terrainDeformation.ts';

const HEAP = [40, 40, 6, 8, 0.3, 1.5];
const bits = (value) => Buffer.from(new Float64Array([value]).buffer).toString('hex');

// a heap laid on a reset overlay before its battle's first clock step
{
  const fresh = createTerrainDeformation();
  fresh.addRubble(...HEAP);
  const whole = fresh.offsetAt(40, 40);
  assert.ok(whole > 1, `with no clock a heap stands whole at once (${whole})`);

  const reused = createTerrainDeformation();
  reused.setTime(310); // the last battle ran 310 s
  reused.addRubble(-40, 40, 6, 8, 0.3, 1.5);
  reused.reset();
  reused.addRubble(...HEAP);
  assert.equal(bits(reused.offsetAt(40, 40)), bits(whole),
    `the heap laid after the reset stands whole, as on a fresh overlay (it read ${reused.offsetAt(40, 40)} where a fresh one reads ${whole})`);
  assert.equal(bits(reused.contactOffsetAt(40, 40)), bits(fresh.contactOffsetAt(40, 40)), 'its contact surface too');
  assert.ok(!reused.growing, 'and nothing rises on the old battle\'s time');
  assert.ok(Number.isNaN(fresh.clockS), 'a fresh overlay\'s clock is unset');
  assert.ok(Number.isNaN(reused.clockS), `reset unsets the clock (it read ${reused.clockS})`);

  // the battle's first step sets the clock: the next heap rises on it
  reused.setTime(1 / 60);
  assert.equal(reused.clockS, 1 / 60);
  reused.addRubble(-40, -40, 6, 8, 0.3, 1.5);
  assert.ok(reused.growing && reused.offsetAt(-40, -40) === 0, 'a heap laid on the set clock begins flat and rises');

  for (const t of [NaN, Infinity, -Infinity]) {
    reused.setTime(t);
    assert.ok(Number.isNaN(reused.clockS), `setTime(${t}) unsets the clock`);
  }
}

// the cache once every heap on the clock has risen
{
  const overlay = createTerrainDeformation();
  overlay.setTime(10);
  overlay.addCrater(38, 44, 2.5, 0.8, 0.3, 77);
  overlay.addRubble(...HEAP);
  let epoch = overlay.cacheEpoch;
  overlay.setTime(11);
  assert.notEqual(overlay.cacheEpoch, epoch, 'a rising heap moves the ground with the clock');
  overlay.setTime(10 + RUBBLE_GROW_S + 1.5);
  const risen = [overlay.contactOffsetAt(40, 40), overlay.contactOffsetAt(38.4, 43.1, true)].map(bits);
  epoch = overlay.cacheEpoch;
  for (let tick = 0; tick < 600; tick++) {
    overlay.setTime(14 + tick / 60);
    assert.equal(overlay.cacheEpoch, epoch, `every heap risen: the clock step at tick ${tick} keeps the cache`);
  }
  assert.deepEqual([overlay.contactOffsetAt(40, 40), overlay.contactOffsetAt(38.4, 43.1, true)].map(bits), risen, 'the same ground');
  // the same reads with the cache dropped at every step (a fresh overlay with the same stamps)
  const control = createTerrainDeformation();
  control.setTime(10);
  control.addCrater(38, 44, 2.5, 0.8, 0.3, 77);
  control.addRubble(...HEAP);
  control.setTime(24);
  assert.deepEqual([control.contactOffsetAt(40, 40), control.contactOffsetAt(38.4, 43.1, true)].map(bits), risen, 'a cache kept is the uncached ground to the bit');
  overlay.setTime(11);
  assert.notEqual(overlay.cacheEpoch, epoch, 'a clock stepped back into the rise drops the cache');
  assert.ok(overlay.contactOffsetAt(40, 40) < control.contactOffsetAt(40, 40), 'and reads the heap half risen again');
  // a later heap starts a rise of its own: the clock moves the ground again
  overlay.setTime(30);
  overlay.addRubble(-60, 30, 5, 5, 1, 1.2);
  epoch = overlay.cacheEpoch;
  overlay.setTime(30.5);
  assert.notEqual(overlay.cacheEpoch, epoch, 'the new heap rises with the clock');
  overlay.reset();
  epoch = overlay.cacheEpoch;
  overlay.setTime(5);
  overlay.setTime(6);
  assert.equal(overlay.cacheEpoch, epoch, 'after a reset no heap is on the clock');
}

console.log('terrainOverlayClock selftest passed: reset unsets the clock (a heap laid next stands whole, bit for bit a fresh overlay\'s); '
  + 'a non-finite time is no clock; the lattice cache survives clock steps once every heap has risen, the same ground to the bit');
