import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { createTankState, resetTankVerticalState, SIM_DT, updateTank } from '../sim/movement.ts';
import { LocalTankPredictor } from './localTankPrediction.ts';
import { captureMovementPredictionState, applyMovementPredictionState } from './movementPredictionState.ts';
import { capturePredictionAuthorityState } from './predictionAuthorityState.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';
import { SNAPSHOT_FLAGS, SnapshotBuffer, captureWorldSnapshot, createSnapshotDelta } from './snapshot.ts';
import { decodeAimIntent } from './aimIntent.ts';

await ensureTankBuilder('udes03');

const height = (x, z) => 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2);
const field = { getHeightAt: height, getHeightAtFast: height, getGroundType: () => 'hard' };
const drive = { throttle: 1, steer: 0.25, brake: false, fire: false,
  aimYaw: 0.2, aimPitch: 0, aimLocked: true };

function entity(specId = 'm1a2') {
  const spec = getSpec(specId);
  return { id: 'viewer', spec, state: createTankState(spec, new Vector3(), 0),
    combat: { modules: { engine: { state: 'ok' }, trackL: { state: 'ok' } }, crew: {} },
    input: { ...drive, aimPoint: new Vector3() } };
}

function sample(source, tick, ackInputSeq = tick) {
  const state = source.state;
  return { tick, ackInputSeq, predictionState: capturePredictionAuthorityState(source), entity: {
    x: state.pos.x, y: state.pos.y, z: state.pos.z, yaw: state.yaw,
    pitch: state.visualPitch, roll: state.visualRoll,
    turretYaw: state.turretYaw, gunPitch: state.gunPitch,
    vx: Math.sin(state.yaw) * state.speed, vz: Math.cos(state.yaw) * state.speed,
    vy: state.verticalSpeed, flags: state.grounded ? 0 : SNAPSHOT_FLAGS.AIRBORNE,
  } };
}

function hull(state) {
  return [state.visualPitch + state._susp.p * 2.2,
    state.visualRoll + state._susp.r * 1.9 + state._swayEst * 2.4];
}

test('fixed checkpoint is detached, JSON safe, and restores every admitted scalar in place', () => {
  const source = entity();
  for (let tick = 0; tick < 90; tick++) updateTank(source, field, SIM_DT);
  const checkpoint = captureMovementPredictionState(source.state);
  assert.equal(checkpoint.values.length, 43);
  assert.deepEqual(JSON.parse(JSON.stringify(checkpoint)), checkpoint);
  const target = entity().state;
  const ride = target._ride;
  const spring = target._spring;
  const contact = { halfLenM: 2, halfWidM: 1, zCenterM: 0 };
  assert.equal(applyMovementPredictionState(target, checkpoint, contact), true);
  assert.deepEqual(captureMovementPredictionState(target), checkpoint);
  assert.equal(target._ride, ride);
  assert.equal(target._spring, spring);
  assert.equal(target._sup.cg, contact, 'geometry is rebound locally, never serialized');
  target._susp.p += 1;
  assert.notDeepEqual(captureMovementPredictionState(target), checkpoint);
  assert.deepEqual(captureMovementPredictionState(source.state), checkpoint);
});

test('fresh and airborne checkpoints retain uninitialized support without nonfinite wire values', () => {
  const source = entity();
  resetTankVerticalState(source.state, 4, 3, false);
  const checkpoint = captureMovementPredictionState(source.state);
  assert.ok(checkpoint);
  assert.ok(checkpoint.values.every(Number.isFinite));
  const target = entity().state;
  assert.equal(applyMovementPredictionState(target, checkpoint), true);
  assert.ok(Number.isNaN(target._ride.supportY));
  assert.ok(Number.isNaN(target._sup.x));
  assert.ok(Number.isNaN(target._sup.z));
  assert.equal(target._ride.y, 4);
  assert.equal(target._ride.v, 3);
  assert.equal(target._ride.grounded, false);
});

test('malformed checkpoints are rejected atomically, including sparse or oversized numeric arrays', () => {
  const source = entity();
  const good = captureMovementPredictionState(source.state);
  const sparse = good.values.slice();
  delete sparse[8];
  const badNumbers = [NaN, Infinity, -Infinity, 1_000_001, '1', null, undefined];
  const bad = [null, [], 1, {}, { ...good, version: 2 },
    { ...good, values: [] }, { ...good, values: [...good.values, 0] },
    { ...good, values: sparse }, ...[-1, 1024, 1.5, NaN].map(flags => ({ ...good, flags })),
    ...badNumbers.map(value => ({ ...good, values: good.values.map((old, i) => i === 5 ? value : old) }))];
  for (const value of bad) {
    const target = entity().state;
    const before = structuredClone(target);
    assert.equal(applyMovementPredictionState(target, value), false);
    assert.deepEqual(structuredClone(target), before);
  }
  source.state._spring.pitchV = Infinity;
  assert.equal(captureMovementPredictionState(source.state), null);
});

test('actual compact wire preserves viewer checkpoint without serializing another entity', () => {
  const source = entity();
  source.hiddenEnemy = { id: 'hidden-enemy', x: 600, z: 200 };
  for (let tick = 0; tick < 90; tick++) updateTank(source, field, SIM_DT);
  const predictionState = capturePredictionAuthorityState(source);
  const packet = createEnvelope(MESSAGE_TYPES.SNAPSHOT, {
    tick: 90, serverTimeMs: 1500, ackInputSeq: 90, entities: [], shells: [], events: [],
    meta: { localPrediction: predictionState },
  }, { tick: 90, seq: 1, ack: 0 });
  const bytes = snapshotWireCodec.encode(packet);
  const restored = snapshotWireCodec.decode(bytes).payload.meta.localPrediction;
  assert.deepEqual(restored, predictionState);
  assert.equal(new TextDecoder().decode(bytes).includes('hidden-enemy'), false);
  const shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  prediction.reconcile({ ...sample(source, 90), predictionState: restored });
  assert.equal(prediction.getStats().movementCheckpoints, 1);
});

test('wrong identity, legacy, malformed, stale tick and new-life checkpoints have separate ownership', () => {
  const source = entity();
  const shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  prediction.reconcile({ ...sample(source, 0), predictionState: undefined });
  prediction.reconcile({ ...sample(source, 3), predictionState: { ...capturePredictionAuthorityState(source), id: 'enemy' } });
  prediction.reconcile({ ...sample(source, 6), predictionState: { id: 'viewer', movement: {} } });
  prediction.reconcile(sample(source, 9));
  assert.equal(prediction.reconcile(sample(source, 8)), false);
  assert.deepEqual([prediction.getStats().missingMovementCheckpoints,
    prediction.getStats().rejectedMovementCheckpoints, prediction.getStats().movementCheckpoints], [1, 2, 1]);
  prediction.reconcile({ ...sample(source, 12), entity: { ...sample(source, 12).entity, destroyed: true } });
  prediction.recordInput(drive, SIM_DT, 13);
  assert.equal(prediction.getStats().pendingInputs, 0);
  const fresh = entity();
  fresh.state.pos.x = 3;
  prediction.reconcile(sample(fresh, 15));
  assert.equal(shown.state.pos.x, 3);
  assert.equal(prediction.getStats().correctionM, 0);
  assert.deepEqual(captureMovementPredictionState(prediction.simEntity.state),
    captureMovementPredictionState(fresh.state));
  prediction.resetForPresentationResume();
  prediction.reconcile(sample(fresh, 0, 0));
  assert.equal(shown.state.pos.x, 3);
});

test('rendered suspension and sway stay continuous across correction without stealing visual flinch', () => {
  const source = entity();
  const shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  prediction.reconcile(sample(source, 0));
  for (let tick = 1; tick <= 90; tick++) prediction.recordInput(drive, SIM_DT, tick);
  const before = hull(shown.state);
  assert.ok(Math.abs(shown.state._susp.p) > 0);
  assert.ok(Math.abs(shown.state._swayEst) > 0);
  shown.state._flinch.pv = 0.7;
  shown.state._flinch.rv = -0.2;
  Object.assign(source.state.pos, shown.state.pos);
  source.state._susp.p = -0.03;
  source.state._susp.r = 0.02;
  source.state._swayEst = -0.01;
  prediction.reconcile(sample(source, 90));
  const after = hull(shown.state);
  for (let axis = 0; axis < 2; axis++) assert.ok(Math.abs(after[axis] - before[axis]) < 1e-12);
  assert.equal(shown.state._flinch.pv, 0.7);
  assert.equal(shown.state._flinch.rv, -0.2);
});

test('death preserves the suspension layers frozen by the wreck renderer until a fresh life', () => {
  const source = entity();
  const shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  prediction.reconcile(sample(source, 0));
  for (let tick = 1; tick <= 90; tick++) prediction.recordInput(drive, SIM_DT, tick);
  const before = hull(shown.state);
  const frozenPitch = shown.state._susp.p * 2.2;
  const frozenRoll = shown.state._susp.r * 1.9 + shown.state._swayEst * 2.4;
  source.state.pos.copy(shown.state.pos);
  const death = sample(source, 90);
  death.entity.destroyed = true;
  prediction.reconcile(death);
  // tankFactoryCore keeps its last suspension/sway while destroyed, rather
  // than reading a newly restored live suspension from renderState.
  assert.ok(Math.abs(shown.state.visualPitch + frozenPitch - before[0]) < 1e-12);
  assert.ok(Math.abs(shown.state.visualRoll + frozenRoll - before[1]) < 1e-12);
  const frozen = { ...shown.state._susp };
  prediction.advancePrediction(null, 0.1);
  assert.deepEqual(shown.state._susp, frozen);
  prediction.reconcile(sample(source, 93));
  assert.deepEqual(shown.state._susp, source.state._susp);
  assert.equal(shown.state._swayEst, source.state._swayEst);
});

test('100 ms delayed exact replay preserves real tank landing and damaged-track trajectories', () => {
  for (const specId of ['m1a2', 'udes03']) {
    for (const scenario of ['landing', 'damaged', 'immobilized']) {
      const source = entity(specId);
      const shown = entity(specId);
      if (scenario === 'landing') resetTankVerticalState(source.state, 3, 4, false);
      else {
        for (const tank of [source, shown]) {
          tank.combat.modules.engine.state = 'yellow';
          tank.combat.modules.trackL.state = scenario === 'damaged' ? 'yellow' : 'red';
        }
      }
      const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
      prediction.reconcile(sample(source, 0));
      const pending = [];
      let airborne = 0;
      let grounded = 0;
      for (let tick = 1; tick <= 360; tick++) {
        const input = { ...drive, brake: tick > 270, throttle: tick > 270 ? 0 : 1 };
        Object.assign(source.input, input);
        decodeAimIntent(input, source.state.pos, source.input.aimPoint);
        updateTank(source, field, SIM_DT);
        prediction.recordInput(input, SIM_DT, tick);
        if (tick % 3 === 0) pending.push(sample(source, tick));
        while (pending.length && pending[0].tick <= tick - 6) prediction.reconcile(pending.shift());
        assert.ok(shown.state.pos.distanceTo(source.state.pos) < 1e-9,
          `${specId}/${scenario} tick ${tick} must replay the same trajectory`);
        const actual = hull(shown.state);
        const expected = hull(source.state);
        for (let axis = 0; axis < 2; axis++) assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-9);
        if (source.state.grounded) grounded++; else airborne++;
      }
      if (scenario === 'landing') assert.ok(airborne > 10 && grounded > 10);
    }
  }
});

test('a checkpoint on the landing tick retains the pending next-tick attitude impulse', () => {
  const source = entity();
  resetTankVerticalState(source.state, 3, 4, false);
  let tick = 0;
  while (tick < 300 && source.state.landingImpactMps === 0) {
    updateTank(source, field, SIM_DT);
    tick++;
  }
  assert.ok(source.state.landingImpactMps > 1, 'the fixture reaches a real energetic landing');
  const shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  prediction.reconcile(sample(source, tick));
  assert.equal(prediction.simEntity.state.landingImpactMps, source.state.landingImpactMps,
    'the landing impulse belongs to the restored authority tick');
  updateTank(source, field, SIM_DT);
  prediction.recordInput(drive, SIM_DT, tick + 1);
  assert.ok(Math.abs(shown.state.visualPitch - source.state.visualPitch) < 1e-12);
  assert.ok(Math.abs(shown.state.visualRoll - source.state.visualRoll) < 1e-12);
});

function wireTrajectory(checkpoint, delayTicks) {
  const source = entity();
  const shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  const buffer = new SnapshotBuffer({ immediateEntityId: 'viewer' });
  const inFlight = [];
  const maxima = { yM: 0, verticalStepM: 0, pitchRad: 0, rollRad: 0 };
  let previousShownY = 0;
  let previousSoloY = 0;
  function wire(tick) {
    const predictionState = capturePredictionAuthorityState(source);
    if (!checkpoint) delete predictionState.movement;
    const world = captureWorldSnapshot({ tick, serverTimeMs: tick * SIM_DT * 1000,
      ackInputSeq: tick, entities: [source], viewerId: 'viewer',
      meta: { localPrediction: predictionState } });
    const envelope = createEnvelope(MESSAGE_TYPES.SNAPSHOT, createSnapshotDelta(world),
      { tick, seq: tick, ack: 0 });
    return snapshotWireCodec.decode(snapshotWireCodec.encode(envelope)).payload;
  }
  buffer.push(wire(0), 0);
  prediction.reconcile(buffer.sample(0).immediateAuthority);
  for (let tick = 1; tick <= 600; tick++) {
    const input = { ...drive, throttle: tick < 450 ? 1 : 0,
      steer: tick > 120 && tick < 400 ? 0.25 : 0, brake: tick >= 450 };
    Object.assign(source.input, input);
    decodeAimIntent(input, source.state.pos, source.input.aimPoint);
    updateTank(source, field, SIM_DT);
    prediction.recordInput(input, SIM_DT, tick);
    if (tick % 3 === 0) inFlight.push(wire(tick));
    while (inFlight.length && inFlight[0].tick <= tick - delayTicks) {
      buffer.push(inFlight.shift(), tick * SIM_DT * 1000);
      prediction.reconcile(buffer.sample(tick * SIM_DT * 1000).immediateAuthority);
    }
    const actual = shown.state;
    const expected = source.state;
    const actualHull = hull(actual);
    const expectedHull = hull(expected);
    maxima.yM = Math.max(maxima.yM, Math.abs(actual.pos.y - expected.pos.y));
    maxima.verticalStepM = Math.max(maxima.verticalStepM, Math.abs(
      actual.pos.y - previousShownY - expected.pos.y + previousSoloY));
    maxima.pitchRad = Math.max(maxima.pitchRad, Math.abs(actualHull[0] - expectedHull[0]));
    maxima.rollRad = Math.max(maxima.rollRad, Math.abs(actualHull[1] - expectedHull[1]));
    previousShownY = actual.pos.y;
    previousSoloY = expected.pos.y;
  }
  if (checkpoint) {
    assert.ok(prediction.getStats().movementCheckpoints > 190);
    assert.equal(prediction.getStats().missingMovementCheckpoints, 0);
    assert.equal(prediction.getStats().rejectedMovementCheckpoints, 0);
  }
  return maxima;
}

test('real quantized capture/wire/buffer path greatly reduces, but does not erase, moving error', () => {
  for (const delayTicks of [0, 6]) {
    const legacy = wireTrajectory(false, delayTicks);
    const current = wireTrajectory(true, delayTicks);
    assert.ok(current.yM < legacy.yM * 0.1);
    assert.ok(current.verticalStepM < legacy.verticalStepM * 0.1);
    assert.ok(current.pitchRad < legacy.pitchRad * 0.1);
    assert.ok(current.rollRad < legacy.rollRad * 0.2);
    assert.ok(current.yM < 0.012 && current.verticalStepM < 0.006);
    assert.ok(current.pitchRad < 0.002 && current.rollRad < 0.0002);
    assert.ok(current.yM > 0, 'public pose quantization is not claimed to be exact solo parity');
  }
});
