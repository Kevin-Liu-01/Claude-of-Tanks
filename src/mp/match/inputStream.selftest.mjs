import assert from 'node:assert/strict';
import { ACTION_BITS, CONTROL_FLAGS, INPUT_MARGIN_UNKNOWN, MESSAGE_TYPE, NO_TICK, decodeMessage, encodeMessage } from '../wire/index.ts';
import { InputStream, NEUTRAL_CONTROL, seqNewer, seqNewerOrEqual } from './inputStream.ts';

const control = (overrides = {}) => ({ ...NEUTRAL_CONTROL, brake: false, aimLocked: false, ...overrides });

// ------------------------------------------------------------ sequence arithmetic
assert.equal(seqNewer(1, 0), true);
assert.equal(seqNewer(0, 65535), true, 'u16 wrap');
assert.equal(seqNewer(65535, 0), false);
assert.equal(seqNewer(5, 5), false);
assert.equal(seqNewerOrEqual(5, 5), true);

// ------------------------------------------------------------ scheduling
{
  const stream = new InputStream();
  assert.equal(stream.isStarted, false);
  assert.equal(stream.dueTicks(10), 0, 'nothing is due before start');
  assert.throws(() => stream.sample(control()), /not started/);
  stream.start(100);
  assert.equal(stream.pendingTick, 100);
  assert.equal(stream.dueTicks(99.5), 0);
  assert.equal(stream.dueTicks(100.2), 1, 'the tick is due once the target reaches it');
  assert.equal(stream.dueTicks(103.9), 4, 'a stalled frame samples up to four ticks');
  assert.equal(stream.dueTicks(120), 4, 'far behind: skips ahead and samples four');
  assert.equal(stream.pendingTick, 117, 'skipped ticks are never sampled');
  assert.equal(stream.stats().skippedTicks, 17);
}

// ------------------------------------------------------------ sampling + edges
{
  const stream = new InputStream();
  stream.start(1000);
  const first = stream.sample(control({ throttle: 0.5, steer: -1, aimYaw: Math.PI / 2, aimPitch: 0.1, aimDistance: 250, shellSlot: 1 }));
  assert.equal(first.tick, 1000);
  assert.ok(Math.abs(first.throttle - 0.5) < 0.01 && first.steer === -1, 'replay controls are the quantized values');
  assert.ok(Math.abs(first.aimYaw - Math.PI / 2) < 1e-3 && Math.abs(first.aimPitch - 0.1) < 1e-3 && first.aimDistance === 250);
  assert.equal(first.fireSeq, 0);
  assert.equal(first.actionSeq, 0);
  const pressed = stream.sample(control({ fire: true }));
  assert.equal(pressed.fireSeq, 1, 'a trigger press increments fireSeq once');
  assert.equal(stream.sample(control({ fire: true })).fireSeq, 1, 'holding the trigger repeats the value');
  assert.equal(stream.sample(control({ fire: false })).fireSeq, 1, 'releasing keeps the value');
  assert.equal(stream.sample(control({ fire: true })).fireSeq, 2, 'the next press is a new value');
  const acted = stream.sample(control({ actionPresses: ACTION_BITS.REPAIR }));
  assert.equal(acted.actionSeq, 1);
  assert.equal(acted.actionBits, ACTION_BITS.REPAIR);
  const repeated = stream.sample(control());
  assert.equal(repeated.actionSeq, 1);
  assert.equal(repeated.actionBits, ACTION_BITS.REPAIR, 'an unacknowledged press repeats in every later frame');
  const second = stream.sample(control({ actionPresses: ACTION_BITS.FIRST_AID }));
  assert.equal(second.actionSeq, 2, 'a new press bumps the sequence');
  assert.equal(second.actionBits, ACTION_BITS.REPAIR | ACTION_BITS.FIRST_AID, 'the union of unacknowledged presses');
  assert.equal(stream.sample(control({ actionPresses: ACTION_BITS.REPAIR })).actionSeq, 2, 'a repeat of a pending bit is not a new press');

  // The frame carries the newest three ticks, oldest first, and decodes through the wire.
  const message = stream.frame(4242, 91.6);
  assert.equal(message.type, MESSAGE_TYPE.INPUT);
  assert.equal(message.clientTick, 1008);
  assert.equal(message.snapshotAckTick, 4242);
  assert.equal(message.interpDelayMs, 92);
  assert.equal(message.controls.length, 3);
  assert.deepEqual(message.controls.map((c) => c.actionSeq), [1, 2, 2]);
  const decoded = decodeMessage(encodeMessage(message));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.message.controls, message.controls, 'the wire round trip is exact');
  assert.equal(encodeMessage(message).byteLength, 2 + 4 + 4 + 1 + 1 + 3 * 15, 'a full frame is 57 B');
  assert.equal((decoded.message.controls[2].flags & CONTROL_FLAGS.FIRE_HELD), 0);

  // Acknowledgements release bits by their first sequence and measure the ack lag.
  stream.acknowledge({ ackedInputTick: 1003, ackedFireSeq: 2, ackedActionSeq: 1, inputMarginTicks: 2 }, 5_000);
  let stats = stream.stats();
  assert.equal(stats.ackLagTicks, 5, '1008 sampled − 1003 acknowledged');
  assert.equal(stats.pendingFireEdges, 0);
  assert.equal(stats.pendingActionBits, ACTION_BITS.FIRST_AID, 'seq 1 (REPAIR) consumed, seq 2 (FIRST_AID) still pending');
  assert.equal(stream.sample(control()).actionBits, ACTION_BITS.FIRST_AID);
  stream.acknowledge({ ackedInputTick: 1009, ackedFireSeq: 2, ackedActionSeq: 2, inputMarginTicks: 2 }, 5_100);
  assert.equal(stream.stats().pendingActionBits, 0);
  assert.equal(stream.sample(control()).actionBits, 0, 'nothing repeats once acknowledged');
  stream.acknowledge({ ackedInputTick: 1005, ackedFireSeq: 1, ackedActionSeq: 1, inputMarginTicks: 2 }, 5_200);
  assert.equal(stream.stats().ackedInputTick, 1009, 'an older acknowledgement never moves the watermark back');
  assert.equal(stream.controlAt(1004).tick, 1004);
  assert.equal(stream.controlAt(1012).tick, 1010, 'a tick without a sample resolves to the newest before it');
  assert.equal(stream.controlAt(900), null);
  stats = stream.stats();
  assert.equal(stats.sampledTicks, 11);
  assert.equal(stats.framesBuilt, 1);
}

// ------------------------------------------------------------ lead controller
{
  const stream = new InputStream({ initialLeadTicks: 2 });
  stream.start(0);
  const ack = (marginTicks, nowMs) => stream.acknowledge({ ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: marginTicks }, nowMs);
  ack(INPUT_MARGIN_UNKNOWN, 0);
  assert.equal(stream.lead, 2, 'an unknown margin changes nothing');
  ack(0, 100);
  assert.equal(stream.lead, 3, 'a late or zero-margin control raises the lead');
  ack(-2, 200);
  assert.equal(stream.lead, 3, 'raises are rate-limited to one per 250 ms');
  ack(-2, 400);
  assert.equal(stream.lead, 4);
  ack(2, 500);
  assert.equal(stream.lead, 4, 'a margin inside 1..3 holds the lead');
  ack(5, 600);
  assert.equal(stream.lead, 3, 'a wide margin lowers the lead');
  ack(5, 900);
  assert.equal(stream.lead, 3, 'lowers are rate-limited to one per second');
  ack(5, 1_700);
  assert.equal(stream.lead, 2);
  for (let n = 0; n < 40; n++) ack(9, 2_000 + n * 1_100);
  assert.equal(stream.lead, 0, 'the lead never drops below its floor');
  for (let n = 0; n < 40; n++) ack(-1, 60_000 + n * 300);
  assert.equal(stream.lead, 12, 'nor rises above its ceiling');
  assert.equal(stream.stats().lastMarginTicks, -1);
}

// ------------------------------------------------------------ restart + history bound
{
  const stream = new InputStream({ historyTicks: 8 });
  stream.start(0);
  for (let n = 0; n < 20; n++) stream.sample(control({ actionPresses: n === 3 ? ACTION_BITS.SELF_RIGHT : 0 }));
  assert.equal(stream.controlAt(5), null, 'history is bounded');
  assert.equal(stream.controlAt(19).tick, 19);
  assert.equal(stream.stats().pendingActionBits, ACTION_BITS.SELF_RIGHT);
  stream.clearPendingEdges();
  assert.equal(stream.stats().pendingActionBits, 0, 'a reconnect forgets unsent presses');
  stream.start(500);
  assert.equal(stream.frame(NO_TICK, 0), null, 'a restarted stream has no frame until it samples');
  assert.equal(stream.controlAt(19), null, 'old ticks belong to the dead socket');
  assert.equal(stream.sample(control()).tick, 500);
  assert.throws(() => new InputStream({ redundancy: 4 }));
}

console.log('mp input stream: 60 Hz scheduling, quantized replay controls, fire/action edges repeated until acknowledged, 57 B frames, lead controller pass');
