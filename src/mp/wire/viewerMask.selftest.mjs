// Wire 7 (2026-10-15, the MP stream; the §7 side-by-side's host uplink row, 112 -> 135 kbit/s): a delta's viewer names only
// the movement checkpoint values that changed since its baseline's. The checkpoint grew from 45 to 63 f32 values (physics
// versions 3-8) and rode every snapshot to its seat whole. This receipt: a masked delta round-trips the exact f32 values
// (a sign of zero included), a keyframe and every baseline it cannot follow (none, no viewer, another checkpoint version or
// length) write the full form, a masked viewer without its baseline is a typed missing_baseline, and on the real movement
// model (a hull driving, turning, then stopped, its checkpoint at 20 Hz) the masked viewer costs well under the full one.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
import { captureMovementCheckpoint } from '../match/movementCheckpoint.ts';
import { PHASE, VERDICT, WireError, applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage } from './index.ts';

const viewerOf = (values, version = 8) => ({
  entityId: 1, modules: new Array(15).fill(0), crewBits: 3, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000, modeGravityScale: 1000,
  movementVersion: version, movementFlags: 5, movementValues: values.map(Math.fround),
});
const frameOf = (tick, viewer) => ({
  tick, serverTimeMs: tick * 50 / 3 | 0, ackedInputTick: tick - 2, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 2,
  meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 50 / 3 | 0, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
  destroyed: [], entities: [], shells: [], viewer, modeStateJson: null,
});
/** Encode `frame` against `base` (null: a keyframe), decode it against the same baseline, assemble the frame. */
const roundTrip = (frame, base) => {
  const bytes = encodeMessage(buildSnapshotPacket(frame, base), base);
  const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => (base && base.tick === tick ? base : null) });
  assert.ok(decoded.ok, decoded.ok ? '' : `${decoded.error.code}: ${decoded.error.message}`);
  return { bytes, frame: applySnapshotPacket(decoded.message, base) };
};
const viewerBytes = (frame, base) => encodeMessage(buildSnapshotPacket(frame, base), base).byteLength - encodeMessage(buildSnapshotPacket({ ...frame, viewer: null }, base && { ...base, viewer: null }), base && { ...base, viewer: null }).byteLength;

const values = Array.from({ length: 63 }, (_, i) => Math.sin(i * 1.7) * 40 + i * 0.013);
const key = frameOf(600, viewerOf(values));
const { frame: keyAssembled } = roundTrip(key, null);
assert.deepEqual(keyAssembled.viewer.movementValues, key.viewer.movementValues, 'a keyframe carries every value');

// ---- a delta: 20 values moved (one of them 0 -> -0, which an f32 keeps), the rest masked out
{
  const next = values.slice();
  for (let i = 0; i < 63; i += 3) next[i] += 0.25 * (i + 1);
  next[1] = 0; values[1] = 0;
  const base = frameOf(600, viewerOf(values));
  const { frame: baseAssembled } = roundTrip(base, null);
  next[1] = -0;
  const delta = frameOf(603, viewerOf(next));
  const { frame: assembled } = roundTrip(delta, baseAssembled);
  assert.equal(assembled.viewer.movementValues.length, 63);
  for (let i = 0; i < 63; i++) assert.ok(Object.is(assembled.viewer.movementValues[i], Math.fround(next[i])), `value ${i} exact (${assembled.viewer.movementValues[i]} vs ${Math.fround(next[i])})`);
  assert.equal(assembled.viewer.movementVersion, 8);
  assert.equal(assembled.viewer.movementFlags, 5);
  const masked = viewerBytes(delta, baseAssembled), full = viewerBytes(delta, null);
  // 22 changed (21 moved + the zero's sign): a 8-byte mask and 22 values against 63 values
  assert.equal(full - masked, (63 - 22) * 4 - 8, `the masked form saves the unchanged values less the mask (${full} -> ${masked} B)`);
}

// ---- every baseline the mask cannot follow writes the full form, and still round-trips
{
  const next = values.map((v, i) => v + (i % 2 ? 0 : 1));
  const delta = frameOf(606, viewerOf(next));
  for (const [label, base] of [
    ['a baseline without a viewer', frameOf(600, null)],
    ['a baseline on another checkpoint version', frameOf(600, viewerOf(values, 7))],
    ['a baseline of another length', frameOf(600, viewerOf(values.slice(0, 45)))],
  ]) {
    const { frame: baseAssembled } = roundTrip(base, null);
    const { frame: assembled } = roundTrip(delta, baseAssembled);
    assert.deepEqual(assembled.viewer.movementValues, delta.viewer.movementValues, label);
    assert.equal(viewerBytes(delta, baseAssembled), viewerBytes(delta, null), `${label}: the full form`);
  }
}

// ---- a masked viewer without its baseline viewer: typed, never thrown
{
  const base = frameOf(600, viewerOf(values));
  const delta = frameOf(603, viewerOf(values.map((v) => v + 1)));
  const bytes = encodeMessage(buildSnapshotPacket(delta, base), base);
  const noViewer = decodeMessage(bytes, { resolveBaseline: (tick) => (tick === 600 ? { ...base, viewer: null } : null) });
  assert.equal(noViewer.ok, false);
  assert.equal(noViewer.error.code, 'missing_baseline');
  assert.ok(noViewer.error instanceof WireError || typeof noViewer.error.code === 'string');
}

// ---- the real checkpoint: a hull driving (and turning) for 11 s, then stopped for 6 s, its viewer every third tick
{
  const SPEC = {
    enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
    turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
    terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
    dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
    gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
    armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
  };
  const height = (x, z) => 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2);
  const FIELD = { getHeightAt: height, getHeightAtFast: height, getGroundType: () => 'hard' };
  const sim = { spec: SPEC, state: createTankState(SPEC, new Vector3(0, height(0, 0), 0), 0), combat: null, input: { throttle: 0, steer: 0, brake: false, aimLocked: true, aimPoint: new Vector3(0, 0, 500) } };
  let base = null;
  const sums = { driving: { masked: 0, full: 0, n: 0 }, stopped: { masked: 0, full: 0, n: 0 } };
  for (let tick = 0; tick < 1020; tick++) {
    const driving = tick < 780;
    sim.input.throttle = driving ? 1 : 0; sim.input.brake = !driving; sim.input.steer = tick > 300 && tick < 600 ? 0.4 : 0;
    updateTank(sim, FIELD, SIM_DT, null);
    if (tick % 3 !== 0 || tick < 120) continue;
    const checkpoint = captureMovementCheckpoint(sim.state);
    const frame = frameOf(tick, { ...viewerOf(checkpoint.values, checkpoint.version), movementFlags: checkpoint.flags });
    if (base) {
      const { frame: assembled } = roundTrip(frame, base);
      for (let i = 0; i < frame.viewer.movementValues.length; i++) assert.ok(Object.is(assembled.viewer.movementValues[i], Math.fround(frame.viewer.movementValues[i])), `tick ${tick} value ${i}`);
      const row = sums[driving ? 'driving' : tick > 900 ? 'stopped' : 'driving'];
      row.masked += viewerBytes(frame, base); row.full += viewerBytes(frame, null); row.n++;
      base = assembled;
    } else base = roundTrip(frame, null).frame;
  }
  const mean = (row, key) => row[key] / row.n;
  assert.equal(base.viewer.movementValues.length, 63, 'the version-8 checkpoint');
  assert.ok(mean(sums.driving, 'masked') < 0.75 * mean(sums.driving, 'full'), `driving: ${mean(sums.driving, 'masked').toFixed(0)} B against ${mean(sums.driving, 'full').toFixed(0)} B`);
  assert.ok(mean(sums.stopped, 'masked') < 0.5 * mean(sums.stopped, 'full'), `stopped: ${mean(sums.stopped, 'masked').toFixed(0)} B against ${mean(sums.stopped, 'full').toFixed(0)} B`);
  console.log(`viewerMask.selftest: masked deltas round-trip exact f32 values (the sign of zero kept), the full form wherever the baseline cannot follow, a missing baseline viewer is typed; the real 63-value checkpoint's viewer costs ${mean(sums.driving, 'masked').toFixed(0)} B a snapshot driving and ${mean(sums.stopped, 'masked').toFixed(0)} B stopped, against ${mean(sums.driving, 'full').toFixed(0)} B whole`);
}
