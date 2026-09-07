import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createCombatState } from '../sim/damage.ts';
import { SnapshotBuffer, captureWorldSnapshot, SNAPSHOT_FLAGS } from './snapshot.ts';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';

await ensureTankBuilder('m1a2');
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const normal = new Vector3(0, 1, 0);
const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0,
  getNormalAt: () => normal, getGroundType: () => 'hard' };

function modelFrames(steerAt = () => 0.4, { throttle = 1, heightField = flat } = {}) {
  const spec = getSpec('m1a2');
  const tank = { id: 'remote', specId: spec.id, spec, team: 'bravo',
    state: createTankState(spec, new Vector3(), 0), combat: createCombatState(spec),
    input: { throttle, steer: 0.4, brake: false, fire: false, shellSlot: 0,
      aimLocked: true, aimPoint: new Vector3(0, 0, 1000) } };
  const snapshots = [], poses = [];
  for (let tick = 0; tick <= 720; tick++) {
    poses.push({ yaw: tank.state.yaw, pitch: tank.state.visualPitch, roll: tank.state.visualRoll,
      trackL: tank.state.trackScroll.l, trackR: tank.state.trackScroll.r });
    if (tick % 3 === 0) snapshots.push(captureWorldSnapshot({ tick,
      serverTimeMs: tick * 1000 / 60, entities: [tank] }));
    tank.input.steer = steerAt(tick / 60);
    updateTank(tank, heightField, SIM_DT);
  }
  return { snapshots, poses };
}

function truthAngle(poses, timeMs, key = 'yaw') {
  const coordinate = Math.max(0, Math.min(poses.length - 1, timeMs * 60 / 1000));
  const low = Math.floor(coordinate), high = Math.min(poses.length - 1, low + 1);
  return poses[low][key] + angleDelta(poses[low][key], poses[high][key]) * (coordinate - low);
}

function measure(model, { oneWayMs = 20, lossEvery = 0, hz = 120, variable = false } = {}) {
  const delivery = model.snapshots.flatMap((snapshot, index) =>
    lossEvery && index % lossEvery === 10 ? [] : [{ snapshot, at: snapshot.serverTimeMs + oneWayMs }]);
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 85, maxInterpolationDelayMs: 220 });
  const speeds = [], errors = [], attitudeErrors = [];
  let next = 0, previous = null, previousTime = 0, now = 0;
  for (let frame = 0; now < 12000; frame++) {
    while (next < delivery.length && delivery[next].at <= now) {
      buffer.push(delivery[next].snapshot, delivery[next].at); next++;
    }
    const sampled = buffer.sample(now);
    const frameMs = variable ? [1000 / 144, 1000 / 60, 1000 / 90][frame % 3] : 1000 / hz;
    if (!sampled?.entities.length) { now += frameMs; continue; }
    const yaw = sampled.entities[0].yaw;
    if (now > 5000 && previous !== null) {
      speeds.push(Math.abs(angleDelta(previous, yaw)) * 1000 / (now - previousTime));
      errors.push(Math.abs(angleDelta(truthAngle(model.poses, sampled.serverTimeMs), yaw)));
      for (const key of ['pitch', 'roll']) attitudeErrors.push(Math.abs(angleDelta(
        truthAngle(model.poses, sampled.serverTimeMs, key), sampled.entities[0][key])));
    }
    previous = yaw;
    previousTime = now;
    now += frameMs;
  }
  return { minAngularSpeed: Math.min(...speeds), maxAngularSpeed: Math.max(...speeds),
    stoppedFrames: speeds.filter((speed) => speed < 1e-10).length,
    meanErrorRad: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    maxErrorRad: Math.max(...errors), maxAttitudeErrorRad: Math.max(...attitudeErrors) };
}

const steady = modelFrames();
const changing = modelFrames((time) => time < 7 ? 0.4 : time < 8 ? 0 : time < 10 ? -0.4 : 0);

test('20 Hz real shared-model turns retain angular cadence across late/lost snapshots', () => {
  for (const hz of [60, 120, 144]) {
    for (const scenario of [{ oneWayMs: 20 }, { oneWayMs: 50 }, { oneWayMs: 20, lossEvery: 20 }]) {
      const receipt = measure(steady, { hz, ...scenario });
      console.log(JSON.stringify({ fixture: 'steady-turn', hz, ...scenario, ...receipt }));
      assert.equal(receipt.stoppedFrames, 0, 'a moving hull cannot freeze while its position extrapolates');
      assert.ok(receipt.maxAngularSpeed < 0.30, 'packet recovery cannot multiply a steady 0.249 rad/s turn');
      assert.ok(receipt.minAngularSpeed > 0.20, 'ordinary late delivery cannot create a slow/fast turn cycle');
      assert.ok(receipt.maxErrorRad < 0.0005, 'continuation follows shared-model truth, not just smoothed step metrics');
    }
  }
});

function testBridge() {
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null,
    allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null };
  return createBrowserBattleBridge({ game, viewerId: 'other',
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, bus: { emit() {} },
    createTankVisual: () => ({ root: { position: new Vector3() }, setVisible() {}, dispose() {},
      syncFromState(state) { this.root.position.copy(state.pos); } }),
  });
}

test('remote pivot tracks follow shared movement differential instead of sliding frozen shoes', () => {
  const model = modelFrames(() => 1, { throttle: 0 });
  const bridge = testBridge();
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  for (const snapshot of model.snapshots) {
    buffer.push(snapshot); bridge.apply(buffer.sample(snapshot.serverTimeMs));
  }
  const presented = bridge.entities.get('remote').state.trackScroll;
  const actual = model.poses.at(-1);
  console.log(JSON.stringify({ fixture: 'pivot-tracks', actualLeft: actual.trackL,
    actualRight: actual.trackR, presentedLeft: presented.l, presentedRight: presented.r }));
  bridge.dispose();
  assert.ok(actual.trackL > 1 && actual.trackR < -1, 'shared pivot uses counter-rotating tracks');
  assert.ok(Math.abs(presented.l - actual.trackL) < 0.001, 'left track advances through shortest wrapped hull turn');
  assert.ok(Math.abs(presented.r - actual.trackR) < 0.001, 'right track reverses instead of sharing left scroll');
});

test('variable display frames retain a steady remote turn through snapshot loss', () => {
  const receipt = measure(steady, { lossEvery: 20, variable: true });
  console.log(JSON.stringify({ fixture: 'variable-display', ...receipt }));
  assert.equal(receipt.stoppedFrames, 0);
  assert.ok(receipt.maxAngularSpeed < 0.30 && receipt.minAngularSpeed > 0.20);
  assert.ok(receipt.maxErrorRad < 0.0005);
});

test('track phases do not count staged spawn, death movement or respawn as driven distance', async () => {
  const bridge = testBridge();
  await bridge.prepareRoster([{ id: 'remote', specId: 'm1a2', team: 'bravo' }]);
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  const apply = (tick, yaw, fields = {}) => {
    buffer.push(snapshot(tick, tick * 1000 / 60, yaw, fields));
    bridge.apply(buffer.sample(tick * 1000 / 60));
    const phase = bridge.entities.get('remote').state.trackScroll;
    return [phase.l, phase.r];
  };
  try {
    assert.deepEqual(apply(0, 2, { x: 10000 }), [0, 0]);
    const driven = apply(3, 2.05, { x: 10000 });
    assert.notEqual(driven[0], driven[1]);
    assert.deepEqual(apply(6, 2.2, { flags: SNAPSHOT_FLAGS.DESTROYED }), driven);
    assert.deepEqual(apply(9, -2, { x: -10000 }), driven);
  } finally { bridge.dispose(); }
});

test('uneven grounded terrain keeps pitch/roll continuation near real support attitude', () => {
  const height = (x, z) => 0.4 * Math.sin(x / 9) + 0.6 * Math.sin(z / 12);
  const heightField = { getHeightAt: height, getHeightAtFast: height,
    getNormalAt: (x, z) => new Vector3(-0.4 / 9 * Math.cos(x / 9), 1,
      -0.6 / 12 * Math.cos(z / 12)).normalize(), getGroundType: () => 'hard' };
  const model = modelFrames(() => 0.4, { heightField });
  for (const lossEvery of [0, 20]) {
    const receipt = measure(model, { lossEvery });
    console.log(JSON.stringify({ fixture: 'uneven-terrain', lossEvery, ...receipt }));
    assert.ok(receipt.maxAttitudeErrorRad < 0.003, 'short continuation cannot exaggerate support attitude');
    assert.ok(receipt.maxErrorRad < 0.0005);
  }
});

test('real shared-model turn release/reversal remains bounded against authority', () => {
  for (const lossEvery of [0, 20]) {
    const receipt = measure(changing, { lossEvery });
    console.log(JSON.stringify({ fixture: 'release-and-reverse', lossEvery, ...receipt }));
    assert.ok(receipt.maxErrorRad < 0.012, 'short continuation cannot conceal materially wrong authority orientation');
    assert.ok(receipt.meanErrorRad < 0.001, 'release/reversal prediction error remains sub-degree and brief');
  }
});

function snapshot(tick, time, yaw, overrides = {}) {
  const frame = captureWorldSnapshot({ tick, serverTimeMs: time, entities: [{
    id: 'remote', specId: 'm1a2', team: 'bravo',
    state: { pos: { x: 0, y: 0, z: time / 100 }, yaw, speed: 10, grounded: true,
      visualPitch: yaw / 10, visualRoll: -yaw / 10, turretYaw: yaw, gunPitch: yaw / 5 },
    combat: { hp: 1000, maxHp: 1000 },
  }] });
  Object.assign(frame.entities[0], overrides);
  return frame;
}

test('angular continuation uses the short wrap and stops after one observed interval', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
  buffer.push(snapshot(0, 0, Math.PI - 0.025));
  buffer.push(snapshot(3, 50, -Math.PI + 0.025));
  const first = buffer.sample(50).entities[0].yaw;
  const continued = buffer.sample(75).entities[0].yaw;
  assert.ok(Math.abs(angleDelta(first, continued) - 0.025) < 0.0002);
  const cap = buffer.sample(100).entities[0].yaw;
  assert.ok(Math.abs(angleDelta(cap, buffer.sample(300).entities[0].yaw)) < 1e-10,
    'a long outage cannot invent continued rotation beyond its last observed interval');
});

test('remote continuation never modifies raw own authority or supplied snapshots', () => {
  const buffer = new SnapshotBuffer({ interpolationDelayMs: 0, immediateEntityId: 'remote' });
  const older = snapshot(0, 0, 0), latest = snapshot(3, 50, 0.05);
  const priorBytes = JSON.stringify([older, latest]);
  buffer.push(older); buffer.push(latest);
  const sample = buffer.sample(75);
  assert.ok(Math.abs(sample.immediateAuthority.entity.yaw - 0.05) < 0.0001);
  assert.equal(JSON.stringify([older, latest]), priorBytes);
});

test('stops, deaths, respawns, teleports and spotting gaps cannot retain stale angular motion', () => {
  const stopped = new SnapshotBuffer({ interpolationDelayMs: 0 });
  stopped.push(snapshot(0, 0, 0)); stopped.push(snapshot(3, 50, 0.05));
  stopped.push(snapshot(6, 100, 0.05));
  const angle = stopped.sample(100).entities[0].yaw;
  assert.equal(stopped.sample(150).entities[0].yaw, angle);
  for (const [prior, current] of [
    [{}, { flags: SNAPSHOT_FLAGS.DESTROYED }],
    [{ flags: SNAPSHOT_FLAGS.DESTROYED }, {}],
    [{}, { x: 10000 }],
    [{}, { specId: 't90m' }],
    [{}, { flags: SNAPSHOT_FLAGS.AIRBORNE }],
    [{ flags: SNAPSHOT_FLAGS.OVERTURNED }, {}],
    [{ flags: SNAPSHOT_FLAGS.AUTO_RIGHTING }, {}],
  ]) {
    const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
    buffer.push(snapshot(0, 0, 0, prior)); buffer.push(snapshot(3, 50, 0.05, current));
    const received = buffer.sample(50).entities[0].yaw;
    assert.equal(buffer.sample(75).entities[0].yaw, received);
  }
  const hidden = new SnapshotBuffer({ interpolationDelayMs: 0 });
  const absent = snapshot(3, 50, 0.05); absent.entities.length = 0;
  hidden.push(snapshot(0, 0, 0)); hidden.push(absent); hidden.push(snapshot(6, 100, 0.1));
  const returned = hidden.sample(100).entities[0].yaw;
  assert.equal(hidden.sample(125).entities[0].yaw, returned);
});
