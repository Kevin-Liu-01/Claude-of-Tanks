import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SnapshotBuffer,
  SNAPSHOT_FLAGS,
  captureWorldSnapshot,
} from './snapshot.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';
import { createEnvelope, MESSAGE_TYPES, PLAYER_ACTION_BITS } from './protocol.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { MatchClientRuntime } from './matchRuntime.ts';

function snapshot(tick, serverTimeMs, overrides = {}) {
  const source = {
    id: 'remote', specId: 'm1a2', team: 'bravo',
    state: {
      pos: { x: 0, y: 2, z: 0 }, yaw: Math.PI / 2, speed: 0,
      verticalSpeed: 0, grounded: true,
    },
    combat: { hp: 1000, maxHp: 1000 },
  };
  const frame = captureWorldSnapshot({ tick, serverTimeMs, entities: [source] });
  Object.assign(frame.entities[0], overrides);
  return frame;
}

test('binary no-input receipts preserve null and never acknowledge the first lost action', () => {
  const link = createLoopbackTransportPair({ direct: true });
  const client = new MatchClientRuntime({ playerId: 'viewer', transport: link.client });
  client.submitInput({ inputSeq: 0, throttle: 0, steer: 0, brake: false, fire: true,
    aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: PLAYER_ACTION_BITS.REPAIR });
  const frame = snapshot(3, 50);
  frame.ackInputSeq = null;
  const encoded = snapshotWireCodec.encode(createEnvelope(MESSAGE_TYPES.SNAPSHOT, frame,
    { seq: 3, tick: 3 }));
  const decoded = snapshotWireCodec.decode(encoded);
  assert.equal(decoded.payload.ackInputSeq, null,
    'RTC/WebSocket binary encoding must preserve the no-input sentinel');
  link.host.send(decoded);
  assert.equal(client.getStats().pendingInputEdges, 2,
    'a binary no-input snapshot cannot retire first fire or repair retries');
  client.close();
});

test('binary guided-projectile presentation survives without breaking legacy shell rows', () => {
  const frame = captureWorldSnapshot({ tick: 3, serverTimeMs: 50, entities: [],
    meta: { phase: 'playing' },
    shells: [true, false].map((guided, index) => ({
      id: index + 1, shooterId: 'viewer', pos: { x: 2, y: 3, z: 4 },
      vel: { x: 10, y: 20, z: 30 }, spec: { type: 'HEAT', guided },
    })),
  });
  const envelope = createEnvelope(MESSAGE_TYPES.SNAPSHOT, frame, { seq: 3, tick: 3 });
  const encoded = snapshotWireCodec.encode(envelope);
  const decoded = snapshotWireCodec.decode(encoded);
  assert.equal(decoded.payload.shells[0].guided, true,
    'guided HEAT remains an ATGM presentation on RTC and ranked WebSocket');
  assert.equal(decoded.payload.shells[1].guided, false,
    'ordinary HEAT retains its unguided presentation');
  assert.deepEqual(decoded.payload.meta, frame.meta, 'codec bookkeeping does not mutate gameplay metadata');
  const legacy = JSON.parse(new TextDecoder().decode(encoded));
  assert.equal(legacy[10][0].length, 9, 'same-version old receivers still accept shell row width');
  legacy[12] = frame.meta;
  const oldDecoded = snapshotWireCodec.decode(new TextEncoder().encode(JSON.stringify(legacy)));
  assert.equal(oldDecoded.payload.shells[0].guided, false,
    'legacy senders without guided metadata decode conservatively');
});

test('grounded packet gaps cannot turn stale support velocity into a ground dive', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(0, 0, { y: 200, vy: 500 }));
  buffer.push(snapshot(3, 50, { y: 202, vy: -500 }));
  const y = buffer.sample(150).entities[0].y;
  assert.equal(y, 2.02, 'opposing support tangent must not extrapolate below the last height');
});

test('grounded extrapolation preserves consistent ramp motion and bounds support spikes', () => {
  const ramp = new SnapshotBuffer({ interpolationDelayMs: 0 });
  ramp.push(snapshot(0, 0, { x: 0, y: 200, vx: 1000, vy: 100 }));
  ramp.push(snapshot(3, 50, { x: 50, y: 205, vx: 1000, vy: 100 }));
  assert.ok(Math.abs(ramp.sample(150).entities[0].y - 2.15) < 1e-10,
    'a real 1 m/s ramp ascent continues during the gap');

  const spike = new SnapshotBuffer({ interpolationDelayMs: 0 });
  spike.push(snapshot(0, 0, { y: 200, vy: 500 }));
  spike.push(snapshot(3, 50, { y: 201, vy: 500 }));
  assert.ok(spike.sample(150).entities[0].y <= 2.071,
    'support tangent cannot exceed the monotone 3x endpoint slope bound');

  const descent = new SnapshotBuffer({ interpolationDelayMs: 0 });
  descent.push(snapshot(0, 0, { x: 0, y: 210, vx: 1000, vy: -100 }));
  descent.push(snapshot(3, 50, { x: 50, y: 205, vx: 1000, vy: -100 }));
  assert.ok(Math.abs(descent.sample(150).entities[0].y - 1.95) < 1e-10,
    'a real downhill tangent is not mistaken for a support spike');
});

test('airborne extrapolation keeps authoritative vertical velocity', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(0, 0, { y: 500, vy: 300, flags: SNAPSHOT_FLAGS.AIRBORNE }));
  assert.equal(buffer.sample(100).entities[0].y, 5.3);
});

test('teleports, respawns and identity changes do not interpolate through the arena', () => {
  for (const [before, after, label] of [
    [{ x: 0 }, { x: 10000 }, 'teleport'],
    [{ x: 0, flags: SNAPSHOT_FLAGS.DESTROYED }, { x: 400 }, 'respawn'],
    [{ x: 0 }, { x: 400, specId: 't90m' }, 'replacement vehicle'],
  ]) {
    const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
    buffer.push(snapshot(0, 0, before));
    buffer.push(snapshot(3, 50, after));
    assert.equal(buffer.sample(25).entities[0].x, after.x / 100, label);
  }
});

test('death settles at authority and never extrapolates an old drive velocity', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(0, 0, { x: 0, vx: 1000 }));
  buffer.push(snapshot(3, 50, { x: 50, vx: 1000, flags: SNAPSHOT_FLAGS.DESTROYED }));
  assert.equal(buffer.sample(25).entities[0].x, 0.5,
    'destroyed combat state and final hull pose arrive together');
  assert.equal(buffer.sample(150).entities[0].x, 0.5,
    'a wreck does not continue the pre-death drive command');
  buffer.push(snapshot(6, 100, { x: 70, vx: 1000, flags: SNAPSHOT_FLAGS.DESTROYED }));
  assert.equal(buffer.sample(150).entities[0].x, 0.7,
    'a later authoritative contact can still push the wreck');
});

test('owned prediction receives untouched authority despite grounded presentation safety', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0, immediateEntityId: 'remote' });
  buffer.push(snapshot(0, 0, { y: 200, vy: 500 }));
  buffer.push(snapshot(3, 50, { y: 202, vy: -500 }));
  const frame = buffer.sample(150);
  assert.equal(frame.immediateAuthority.entity.y, 2.02);
  assert.equal(frame.immediateAuthority.entity.vy, -5);
  assert.equal(frame.entities[0].y, 1.52,
    'the local deterministic predictor remains the owner of support motion');
});

test('owned prediction mobility metadata pairs with latest authority, not remote render time', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 100, immediateEntityId: 'remote' });
  const oldState = { modules: { engine: 'green' }, modeSpeedMultiplier: 1 };
  const latestState = { modules: { engine: 'red' }, modeSpeedMultiplier: 1.85 };
  const older = snapshot(0, 0);
  older.meta = { localPrediction: oldState };
  buffer.push(older);
  const latest = snapshot(3, 50, { x: 25 });
  latest.meta = { localPrediction: latestState };
  buffer.push(latest);
  const frame = buffer.sample(100);
  assert.equal(frame.meta.localPrediction, oldState, 'remote presentation remains buffered');
  assert.equal(frame.immediateAuthority.tick, 3);
  assert.equal(frame.immediateAuthority.predictionState, latestState,
    'local reconciliation receives mobility and pose from one authority tick');
  buffer.push({ ...snapshot(6, 100), meta: { localPrediction: [] } });
  assert.equal(buffer.sample(150).immediateAuthority.predictionState, null,
    'non-record metadata cannot enter the prediction contract');
  buffer.push(snapshot(9, 150));
  assert.equal(buffer.sample(200).immediateAuthority.predictionState, null,
    'absent metadata does not retain an earlier authority record');
});

test('owned respawns bypass the continuous correction limiter even near the wreck', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0, immediateEntityId: 'remote' });
  buffer.push(snapshot(0, 0, { flags: SNAPSHOT_FLAGS.DESTROYED }));
  buffer.sample(0);
  buffer.push(snapshot(3, 50, { x: 400 }));
  const frame = buffer.sample(50);
  assert.equal(frame.entities[0].x, 4);
  assert.equal(frame.immediateAuthority.entity.x, 4);
});

test('rest anchoring does not survive a spotting gap or a respawn', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(0, 0));
  assert.equal(buffer.sample(0).entities[0].x, 0);
  const hidden = snapshot(3, 50);
  hidden.entities = [];
  buffer.push(hidden);
  assert.equal(buffer.sample(50).entities.length, 0);
  buffer.push(snapshot(6, 100, { x: 2 }));
  assert.equal(buffer.sample(100).entities[0].x, 0.02,
    'new visibility starts at the exact current authority pose');
  buffer.push(snapshot(9, 150, { x: 3, flags: SNAPSHOT_FLAGS.DESTROYED }));
  assert.equal(buffer.sample(150).entities[0].x, 0.03,
    'death releases a sub-deadzone hold');
  buffer.push(snapshot(12, 200, { x: 4 }));
  assert.equal(buffer.sample(200).entities[0].x, 0.04,
    'respawn releases a sub-deadzone wreck hold');
});

test('invalid timing never poisons a valid buffered timeline', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(3, 50));
  assert.equal(buffer.push(snapshot(6, 25)), false,
    'an increasing tick with regressing authority time is rejected');
  assert.equal(buffer.latestTick, 3, 'rejected timing cannot advance admission state');
  assert.throws(() => buffer.sample(NaN), /time/i);
  assert.throws(() => buffer.sample(Infinity), /time/i);
  assert.ok(Number.isFinite(buffer.sample(75).entities[0].x));
  for (const options of [
    { interpolationDelayMs: NaN }, { maxExtrapolationMs: Infinity },
    { maxInterpolationDelayMs: NaN }, { capacity: Infinity }, { capacity: 2.5 },
  ]) assert.throws(() => new SnapshotBuffer(options), /configuration/i);
});

test('clear establishes a fresh authority epoch without prior rest or render-clock state', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(30, 500, { x: 400 }));
  buffer.sample(750);
  buffer.clear();
  assert.equal(buffer.sample(0), null);
  buffer.push(snapshot(0, 0, { x: 401 }));
  const frame = buffer.sample(0);
  assert.equal(frame.serverTimeMs, 0);
  assert.equal(frame.entities[0].x, 4.01);
});

test('sub-deadzone auto-righting and airborne apex motion do not stick to a rest anchor', () => {
  for (const flags of [SNAPSHOT_FLAGS.AUTO_RIGHTING, SNAPSHOT_FLAGS.AIRBORNE]) {
    const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
    buffer.push(snapshot(0, 0, { flags }));
    buffer.sample(0);
    buffer.push(snapshot(3, 50, { flags, x: 1, roll: 10 }));
    const frame = buffer.sample(50);
    assert.equal(frame.entities[0].x, 0.01);
    assert.ok(frame.entities[0].roll > 0, 'meaningful lifecycle motion has no resting deadzone');
  }
});
