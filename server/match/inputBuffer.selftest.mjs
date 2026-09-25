import assert from 'node:assert/strict';
import { CONTROL_FLAGS, MESSAGE_TYPE, NO_TICK } from '../../src/mp/wire/constants.ts';
import { quantizeAngle, quantizeAimDistance } from '../../src/mp/wire/quantize.ts';
import { createSeatInputBuffer } from './inputBuffer.ts';

const control = (overrides = {}) => ({
  throttle: 127, steer: 0, flags: 0, aimYaw: quantizeAngle(Math.PI / 2), aimPitch: 0, aimDistance: quantizeAimDistance(300),
  shellSlot: 1, fireSeq: 0, actionSeq: 0, actionBits: 0, ...overrides,
});
const frame = (clientTick, controls, extra = {}) => ({
  type: MESSAGE_TYPE.INPUT, clientTick, snapshotAckTick: NO_TICK, interpDelayMs: 100, controls, ...extra,
});

// On-time frames apply exactly on their tick (buffer 1: control T runs at server tick T + 1).
{
  const seat = createSeatInputBuffer();
  assert.equal(seat.bufferTicks, 1);
  const admitted = seat.admit(frame(10, [control({ throttle: 10 }), control({ throttle: 20 }), control({ throttle: 30 })]), 8);
  assert.deepEqual(admitted, { accepted: 3, stale: 0, farAhead: false });
  const again = seat.admit(frame(11, [control({ throttle: 20 }), control({ throttle: 30 }), control({ throttle: 40 })]), 9);
  assert.deepEqual(again, { accepted: 1, stale: 0, farAhead: false }, 'redundant copies of held ticks are not counted twice');
  const t9 = seat.inputFor(9);   // applies tick 8
  assert.equal(Math.round(t9.throttle * 127), 10);
  assert.equal(seat.lastAppliedTick, 8);
  assert.equal(Math.round(seat.inputFor(10).throttle * 127), 20);
  assert.equal(Math.round(seat.inputFor(11).throttle * 127), 30);
  assert.equal(Math.round(seat.inputFor(12).throttle * 127), 40);
  assert.equal(seat.lastAppliedTick, 11);
  const held = seat.inputFor(13); // nothing for tick 12: the last control is held (drive keeps going)
  assert.equal(Math.round(held.throttle * 127), 40);
  assert.equal(seat.stats.held, 1);
  assert.equal(held.brake, false);
  assert.equal(held.aimLocked, false);
  assert.ok(Math.abs(held.aimYaw - Math.PI / 2) < 1e-4);
  assert.ok(Math.abs(held.aimDistance - 300) < 0.05);
  assert.equal(held.shellSlot, 1);
  console.log('inputBuffer.selftest: on-time controls apply on their tick, redundancy dedupes, gaps hold the last control');
}

// Stale controls are dropped, far-ahead frames rejected whole, late controls still applied once.
{
  const seat = createSeatInputBuffer({ maxLeadTicks: 20 });
  seat.admit(frame(5, [control(), control(), control()]), 4);
  seat.inputFor(5); seat.inputFor(6);
  assert.equal(seat.lastAppliedTick, 5);
  const stale = seat.admit(frame(5, [control(), control(), control()]), 6);
  assert.deepEqual(stale, { accepted: 0, stale: 3, farAhead: false });
  const far = seat.admit(frame(100, [control()]), 6);
  assert.deepEqual(far, { accepted: 0, stale: 0, farAhead: true });
  assert.equal(seat.stats.farAhead, 1);
  // a control for tick 7 arrives when the server is already at tick 12: applied at the next inputFor (late)
  seat.admit(frame(7, [control({ throttle: 99 })]), 12);
  const late = seat.inputFor(13);
  assert.equal(Math.round(late.throttle * 127), 99);
  assert.equal(seat.stats.late, 1);
  assert.equal(seat.lastAppliedTick, 7);
  console.log('inputBuffer.selftest: stale dropped, far-ahead rejected, late controls applied once');
}

// Edges: a fire press fires once per fireSeq even when the press tick's frame is lost; held fire sustains; actions apply once.
{
  const seat = createSeatInputBuffer();
  seat.admit(frame(1, [control()]), 0);
  seat.inputFor(2);
  // press at tick 2 (fireSeq 1) — the frame carrying tick 2 is lost, tick 3 and 4 still carry fireSeq 1
  seat.admit(frame(4, [control({ fireSeq: 1 }), control({ fireSeq: 1 })]), 3);
  const t4 = seat.inputFor(4); // applies tick 3
  assert.equal(t4.fire, true, 'the press is honoured from a later frame');
  assert.equal(t4.fireIntentSeq, 1);
  const t5 = seat.inputFor(5); // applies tick 4: same fireSeq, no held flag -> no fire
  assert.equal(t5.fire, false);
  assert.equal(seat.lastAppliedFireSeq, 1);
  seat.admit(frame(6, [control({ fireSeq: 1, flags: CONTROL_FLAGS.FIRE_HELD }), control({ fireSeq: 1, flags: CONTROL_FLAGS.FIRE_HELD })]), 5);
  assert.equal(seat.inputFor(6).fire, true, 'held fire sustains');
  assert.equal(seat.inputFor(7).fire, true);
  seat.admit(frame(8, [control({ fireSeq: 2, actionSeq: 1, actionBits: 0b100 }), control({ fireSeq: 2, actionSeq: 1, actionBits: 0b100 })]), 7);
  const t8 = seat.inputFor(8);
  assert.equal(t8.fire, true, 'a new fireSeq fires again');
  assert.equal(t8.actionBits, 0b100, 'a new actionSeq applies its bits');
  const t9 = seat.inputFor(9);
  assert.equal(t9.actionBits, 0, 'the same actionSeq never applies twice');
  assert.equal(seat.lastAppliedActionSeq, 1);
  console.log('inputBuffer.selftest: fire and action edges apply exactly once per sequence, surviving lost frames');
}

// Lease: half a second without frames releases drive and fire but keeps aim and ammunition (v1 rule).
{
  const seat = createSeatInputBuffer();
  seat.admit(frame(1, [control({ throttle: 100, flags: CONTROL_FLAGS.FIRE_HELD })]), 0);
  seat.inputFor(2);
  for (let tick = 3; tick <= 31; tick++) assert.equal(Math.round(seat.inputFor(tick).throttle * 127), 100, `tick ${tick} still held`);
  const expired = seat.inputFor(33);
  assert.equal(expired.throttle, 0);
  assert.equal(expired.brake, true);
  assert.equal(expired.fire, false);
  assert.equal(expired.aimLocked, true);
  assert.equal(expired.shellSlot, 1, 'ammunition selection survives the lease');
  assert.ok(seat.stats.dry >= 1);
  const nobody = createSeatInputBuffer().inputFor(5);
  assert.equal(nobody.brake, true);
  console.log('inputBuffer.selftest: the 500 ms held-input lease releases drive and fire, keeps aim and ammunition');
}

// Adaptive buffer: chronic late arrivals grow the buffer to three ticks; generous margins shrink it back.
{
  const seat = createSeatInputBuffer();
  let tick = 0;
  for (let n = 0; n < 190; n++) {
    tick++;
    seat.admit(frame(tick - 2, [control()]), tick); // every frame two ticks late
    seat.inputFor(tick);
  }
  assert.equal(seat.bufferTicks, 3, `late arrivals grew the buffer (${seat.bufferTicks})`);
  assert.ok(seat.marginTicks <= 0, `margin reports late (${seat.marginTicks})`);
  for (let n = 0; n < 200; n++) {
    tick++;
    seat.admit(frame(tick + 8, [control()]), tick); // frames arrive eight ticks early
    seat.inputFor(tick);
  }
  assert.equal(seat.bufferTicks, 1, `generous margins shrank the buffer (${seat.bufferTicks})`);
  assert.ok(seat.marginTicks >= 1);
  seat.reset();
  assert.equal(seat.lastAppliedTick, -1);
  console.log('inputBuffer.selftest: the jitter buffer adapts between one and three ticks');
}

// Snapshot acknowledgements ride the input stream, never ahead of the server tick.
{
  const seat = createSeatInputBuffer();
  seat.admit(frame(3, [control()], { snapshotAckTick: 2 }), 5);
  assert.equal(seat.snapshotAckTick, 2);
  seat.admit(frame(4, [control()], { snapshotAckTick: 99 }), 5);
  assert.equal(seat.snapshotAckTick, 2, 'an ack beyond the server tick is ignored');
  seat.admit(frame(5, [control()], { snapshotAckTick: 1 }), 6);
  assert.equal(seat.snapshotAckTick, 2, 'acks never move backwards');
  assert.equal(seat.interpDelayMs, 100);
  console.log('inputBuffer.selftest: snapshot acks are monotonic and bounded by the server tick');
}
