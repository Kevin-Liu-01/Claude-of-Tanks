import assert from 'node:assert/strict';
import { NO_TICK, buildSnapshotPacket, decodeMessage, encodeMessage, zeroEntityRow } from '../wire/index.ts';
import { SnapshotStream } from './snapshotStream.ts';

function frame(tick, positions, destroyed = [], revision = 0) {
  return {
    tick, serverTimeMs: tick * 1000 / 60 | 0, ackedInputTick: tick, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 2,
    meta: { phase: 2, countdownMs: 0, battleTimeMs: tick * 16, verdict: 0, verdictReason: '', destructibleRevision: revision },
    destroyed,
    entities: positions.map(([entityId, x], index) => ({ ...zeroEntityRow(entityId), x, z: index * 1000, hp: 100, maxHp: 100 })),
    shells: [], viewer: null, modeStateJson: null,
  };
}

/** The server side of the exchange: encode against the client's acked frame through the real codec. */
function deliver(stream, current, baseline) {
  const packet = buildSnapshotPacket(current, baseline);
  const decoded = decodeMessage(encodeMessage(packet, baseline), { resolveBaseline: stream.resolveBaseline });
  if (!decoded.ok) return { ok: false, reason: decoded.error.code };
  return stream.accept(decoded.message);
}

{
  const stream = new SnapshotStream({ ringSize: 4 });
  assert.equal(stream.ackTick, NO_TICK, 'before a keyframe the client owes a keyframe request');
  assert.equal(stream.isAwaitingKeyframe, true);
  const f0 = frame(100, [[1, 0], [2, 5000]]);
  const first = deliver(stream, f0, null);
  assert.equal(first.ok, true);
  assert.equal(first.keyframe, true);
  assert.equal(stream.ackTick, 100);
  assert.equal(stream.latest.entities.length, 2);
  const f1 = frame(102, [[1, 1200], [2, 5000]]);
  assert.equal(deliver(stream, f1, f0).ok, true, 'a delta against the acked keyframe assembles');
  assert.deepEqual(stream.latest.entities.map((row) => row.x), [1200, 5000]);
  const f2 = frame(104, [[1, 2400], [2, 5000], [3, -100]]);
  assert.equal(deliver(stream, f2, f1).ok, true);
  assert.equal(stream.latest.entities.length, 3);
  const f3 = frame(106, [[1, 3600], [3, -100]]);
  assert.equal(deliver(stream, f3, f2).ok, true, 'a hidden entity is removed by the delta');
  assert.deepEqual(stream.latest.entities.map((row) => row.entityId), [1, 3]);
  assert.equal(deliver(stream, f1, f0).ok, false, 'an older tick is stale');
  assert.equal(stream.stats().stale, 1);
  // Loss: the next frame skips a snapshot interval.
  const f4 = frame(110, [[1, 4000], [3, -100]]);
  assert.equal(deliver(stream, f4, f3).ok, true);
  assert.equal(stream.stats().estimatedMissing, 1, 'a gap of one snapshot interval counts as one missing');
  assert.equal(stream.lastGapTick, 110);
  assert.ok(Math.abs(stream.stats().lossRate - 1 / 6) < 1e-9);
  // The ring holds four frames: a delta against frame 100 has no baseline any more.
  const late = deliver(stream, frame(112, [[1, 4100]]), f0);
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'missing_baseline', 'an evicted baseline is a missing baseline (the codec rejects relative groups)');
  assert.equal(stream.isAwaitingKeyframe, false, 'a codec-level rejection reaches the stream only through noteMissingBaseline');
  assert.equal(stream.stats().missingBaselines, 0);
  stream.noteMissingBaseline();
  assert.equal(stream.stats().missingBaselines, 1);
  assert.equal(stream.isAwaitingKeyframe, true);
  assert.equal(stream.ackTick, NO_TICK, 'the ack becomes a keyframe request');
  // A delta whose baseline decodes (absolute groups only) but is unknown to the stream is rejected the same way.
  const packet = buildSnapshotPacket(frame(114, [[1, 999000]]), frame(100, [[1, 0]]));
  assert.equal(packet.entities[0].mask & 1, 1, 'a 999 m move falls back to the absolute group');
  const rejected = stream.accept(decodeMessage(encodeMessage(packet, frame(100, [[1, 0]]))).message);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'missing_baseline');
  assert.equal(stream.stats().missingBaselines, 2);
  // The recovering keyframe restores everything, including persistent destroyed indices and the revision.
  const recovery = frame(116, [[1, 4300], [2, 7000]], [3, 8, 21], 5);
  const recovered = deliver(stream, recovery, null);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.keyframe, true);
  assert.equal(stream.isAwaitingKeyframe, false);
  assert.equal(stream.ackTick, 116);
  assert.deepEqual(stream.latest.destroyed, [3, 8, 21]);
  assert.equal(stream.latest.meta.destructibleRevision, 5);
  const next = frame(118, [[1, 4400], [2, 7000]], [3, 8, 21, 40], 6);
  assert.equal(deliver(stream, next, recovery).ok, true);
  assert.deepEqual(stream.latest.destroyed, [3, 8, 21, 40], 'a delta adds newly destroyed indices to the persistent set');
  const stats = stream.stats();
  assert.equal(stats.received, 7);
  assert.equal(stats.keyframes, 2);
  assert.equal(stats.latestTick, 118);
  stream.reset();
  assert.equal(stream.latest, null);
  assert.equal(stream.ackTick, NO_TICK, 'a new socket starts with a keyframe request');
}

console.log('mp snapshot stream: keyframe + delta assembly through the codec, stale rejection, loss estimate, evicted/unknown baselines → keyframe request → recovery with persistent destroyed state pass');
