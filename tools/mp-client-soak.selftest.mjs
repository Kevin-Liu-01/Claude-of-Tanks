import assert from 'node:assert/strict';
import { runClientSoak } from './mp-client-soak.mjs';

// Four headless clients against the real MatchActor for 20 s of virtual time at the charter's
// link (100 ms RTT ± 30 ms, 3 % loss on replaceable frames): every client gate on the real
// authority, bots, lag compensation and publisher. The two-minute run is the tool itself.
const report = await runClientSoak({ clients: 4, seconds: 20, rttMs: 100, jitterMs: 30, loss: 0.03, server: 'actor', mapId: 'verdant', seed: 0x50ac });
for (const row of report.rows) {
  assert.deepEqual(row.failures, [], `${row.player}: ${row.failures.join('; ')}`);
  assert.equal(row.phase, 'live');
  assert.ok(row.snapshots > 400, `${row.player}: ${row.snapshots} snapshots assembled`);
  assert.ok(row.keyframes >= 8, `${row.player}: keyframes every 2 s (${row.keyframes})`);
  assert.equal(row.hardSnaps, 0);
  assert.ok(row.maxRemoteStepM <= 0.5 && row.maxOwnStepM <= 0.5, `${row.player}: pose steps ${row.maxRemoteStepM} / ${row.maxOwnStepM}`);
  assert.ok(row.maxCorrectionStepM <= 0.25, `${row.player}: release ${row.maxCorrectionStepM}`);
  assert.ok(row.maxMispredictionM < 1, `${row.player}: misprediction ${row.maxMispredictionM} m (hulls and shells the client cannot see)`);
  assert.ok(row.ackLagP50 <= row.rttTicks + 2, `${row.player}: ack lag ${row.ackLagP50} ≤ RTT ${row.rttTicks} + 2`);
  assert.ok(row.events > 0 && row.presentationEvents > 0, `${row.player}: events reached the presentation`);
  assert.ok(row.ownShots > 0 && row.predictedShots > 0, `${row.player}: own shots ${row.ownShots}, predicted ${row.predictedShots}`);
  assert.ok(row.bytesInPerS < 18 * 1024, `${row.player}: ${row.bytesInPerS} B/s down`);
  assert.ok(row.bytesOutPerS < 4 * 1024, `${row.player}: ${row.bytesOutPerS} B/s up`);
}
assert.equal(report.serverStats.rejectedInputs, 0, 'the real input buffer rejected nothing');
assert.equal(report.serverStats.droppedSnapshots, 0, 'no backpressure drops');
assert.ok(report.serverStats.lagComp.rewoundShots > 0, 'the client\'s interpDelayMs fed lag compensation');
assert.equal(report.pass, true);
console.log(`mp client soak receipt: 4 clients × 20 s on the real MatchActor pass (down ${(report.rows[0].bytesInPerS / 1024).toFixed(1)} KB/s, ack lag p50 ${report.rows[0].ackLagP50} ticks, misprediction ≤ ${Math.max(...report.rows.map((row) => row.maxMispredictionM))} m)`);
