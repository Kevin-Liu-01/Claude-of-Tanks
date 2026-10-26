import assert from 'node:assert/strict';
import { runClientSoak } from './mp-client-soak.mjs';
import { TICK_HZ } from '../src/mp/wire/constants.ts';
import { KEYFRAME_INTERVAL_TICKS } from '../server/match/publisher.ts';

// Four headless clients against the real MatchActor for 20 s of virtual time at the charter's
// link (100 ms RTT ± 30 ms, 3 % loss on replaceable frames): every client gate on the real
// authority, bots, lag compensation and publisher. The two-minute run is the tool itself.
const report = await runClientSoak({ clients: 4, seconds: 20, rttMs: 100, jitterMs: 30, loss: 0.03, server: 'actor', mapId: 'verdant', seed: 0x50ac });
for (const row of report.rows) {
  assert.deepEqual(row.failures, [], `${row.player}: ${row.failures.join('; ')}`);
  assert.equal(row.phase, 'live');
  assert.ok(row.snapshots > 20 * row.snapshotHz * 0.75, `${row.player}: ${row.snapshots} snapshots assembled in 20 s at ${row.snapshotHz} Hz`);
  // the publisher's periodic keyframe on each viewer's slot (KEYFRAME_INTERVAL_TICKS, six seconds since mp-scale-251)
  assert.ok(row.keyframes >= Math.floor((20 * TICK_HZ) / KEYFRAME_INTERVAL_TICKS), `${row.player}: a keyframe every cycle (${row.keyframes})`);
  assert.equal(row.hardSnaps, 0);
  assert.ok(row.maxRemoteStepM <= 0.5 && row.maxOwnStepM <= 0.5, `${row.player}: pose steps ${row.maxRemoteStepM} / ${row.maxOwnStepM}`);
  assert.ok(row.maxCorrectionStepM <= 0.25, `${row.player}: release ${row.maxCorrectionStepM}`);
  assert.ok(row.maxMispredictionM < 1, `${row.player}: misprediction ${row.maxMispredictionM} m (hulls and shells the client cannot see)`);
  assert.ok(row.ackLagP50 <= row.rttTicks + row.intervalTicks, `${row.player}: ack lag ${row.ackLagP50} ≤ RTT ${row.rttTicks} + one snapshot interval (${row.intervalTicks} ticks at ${row.snapshotHz} Hz)`);
  assert.ok(row.events > 0 && row.presentationEvents > 0, `${row.player}: events reached the presentation`);
  assert.ok(row.ownShots > 0 && row.predictedShots > 0, `${row.player}: own shots ${row.ownShots}, predicted ${row.predictedShots}`);
  assert.ok(row.bytesInPerS < 18 * 1024, `${row.player}: ${row.bytesInPerS} B/s down`);
  assert.ok(row.bytesOutPerS < 4 * 1024, `${row.player}: ${row.bytesOutPerS} B/s up`);
}
assert.equal(report.serverStats.rejectedInputs, 0, 'the real input buffer rejected nothing');
assert.equal(report.serverStats.droppedSnapshots, 0, 'no backpressure drops');
assert.ok(report.serverStats.lagComp.rewoundShots > 0, 'the client\'s interpDelayMs fed lag compensation');
assert.equal(report.pass, true);
// A solo match on a local host, paused (RUST-ENGINE-DECISION §7 step 5): the actor holds its tick through 8 s of pause, the
// client's PausableClock rests with it, and every gate holds across the resume — no stall, no snap, no rejected input.
const solo = await runClientSoak({ clients: 1, seconds: 20, rttMs: 0, jitterMs: 0, loss: 0, server: 'actor', mapId: 'verdant', seed: 0x50ad,
  pauseAtS: 6, pauseForS: 8 });
assert.equal(solo.pause?.paused, true, 'the solo match paused');
assert.equal(solo.pause.ticksWhilePaused, 0, 'no tick ran while paused');
assert.deepEqual(solo.rows[0].failures, [], solo.rows[0].failures.join('; '));
assert.equal(solo.rows[0].phase, 'live');
assert.equal(solo.rows[0].stalls, 0, 'the pause is no stall');
assert.equal(solo.serverStats.rejectedInputs, 0, 'no input refused across the resume');
assert.ok(solo.serverStats.ticks > 11 * 60 && solo.serverStats.ticks < 12.5 * 60, `${solo.serverStats.ticks} ticks in 12 s of play`);
assert.equal(solo.pass, true);

console.log(`mp client soak receipt: 4 clients × 20 s on the real MatchActor pass (down ${(report.rows[0].bytesInPerS / 1024).toFixed(1)} KB/s, ack lag p50 ${report.rows[0].ackLagP50} ticks, misprediction ≤ ${Math.max(...report.rows.map((row) => row.maxMispredictionM))} m); a solo match paused 8 s resumes on its tick with no stall`);
