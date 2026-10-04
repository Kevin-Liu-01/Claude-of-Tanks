import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { createTankState, resetTankVerticalState, SIM_DT, updateTank } from '../sim/movement.ts';
import { captureMovementPredictionState, applyMovementPredictionState } from './movementPredictionState.ts';

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
  // round 32: + _autoTraverse; impact physics (2026-09-25): + _terr.fitPitch; bots lane (2026-10-02): + _body.restSupportY;
  // physics lane (2026-10-03, version 4): + _terr.tipPitch / tipRoll, the gravity tip of an overhanging hull;
  // (version 5, appended): + _ride.rebound / stroke, the landing the springs still owe and work through, and _susp.d / dv,
  // the dive; (version 6, appended, round 3): + _sup.top, the top track contact beside the springs' seat; (version 7,
  // appended, round 5): + _susp.l / lv, the side-to-side transfer the support seats the tracks without
  assert.equal(checkpoint.values.length, 55);
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

test('a version-4 checkpoint still decodes, with no landing stroke or dive in progress', () => {
  const source = entity();
  for (let tick = 0; tick < 60; tick++) updateTank(source, field, SIM_DT);
  const v6 = captureMovementPredictionState(source.state);
  const target = entity().state;
  target._susp.d = 0.3; target._ride.stroke = 1;
  assert.equal(applyMovementPredictionState(target, { version: 4, values: v6.values.slice(0, 48), flags: v6.flags }), true);
  assert.equal(target._ride.y, source.state._ride.y);
  assert.deepEqual([target._ride.rebound, target._ride.stroke, target._susp.d, target._susp.dv], [0, 0, 0, 0]);
  assert.equal(target._sup.top, target._sup.y, 'its top contact at its seat');
});

test('a version-5 checkpoint still decodes, its top contact at its seat', () => {
  const source = entity();
  for (let tick = 0; tick < 60; tick++) updateTank(source, field, SIM_DT);
  source.state._sup.top = source.state._sup.y + 0.05;
  const v6 = captureMovementPredictionState(source.state);
  assert.equal(v6.values[52], source.state._sup.top, 'version 6 carries the top contact last');
  const target = entity().state;
  assert.equal(applyMovementPredictionState(target, { version: 5, values: v6.values.slice(0, 52), flags: v6.flags }), true);
  assert.equal(target._ride.y, source.state._ride.y);
  assert.equal(target._sup.top, target._sup.y);
  const full = entity().state;
  assert.equal(applyMovementPredictionState(full, v6), true);
  assert.equal(full._sup.top, source.state._sup.top);
});

test('a version-6 checkpoint still decodes, with no side-to-side transfer in progress', () => {
  const source = entity();
  for (let tick = 0; tick < 60; tick++) updateTank(source, field, SIM_DT);
  source.state._susp.l = 0.01; source.state._susp.lv = 0.02;
  const v7 = captureMovementPredictionState(source.state);
  assert.deepEqual(v7.values.slice(53, 55), [0.01, 0.02], 'version 7 carries the side-to-side transfer last');
  const target = entity().state;
  target._susp.l = 0.4; target._susp.lv = 1;
  assert.equal(applyMovementPredictionState(target, { version: 6, values: v7.values.slice(0, 53), flags: v7.flags }), true);
  assert.equal(target._sup.top, source.state._sup.top);
  assert.deepEqual([target._susp.l, target._susp.lv], [0, 0]);
  const full = entity().state;
  assert.equal(applyMovementPredictionState(full, v7), true);
  assert.deepEqual([full._susp.l, full._susp.lv], [0.01, 0.02]);
});

test('malformed checkpoints are rejected atomically, including sparse or oversized numeric arrays', () => {
  const source = entity();
  const good = captureMovementPredictionState(source.state);
  const sparse = good.values.slice();
  delete sparse[8];
  const badNumbers = [NaN, Infinity, -Infinity, 1_000_001, '1', null, undefined];
  const bad = [null, [], 1, {}, { ...good, version: 3 }, { ...good, version: 4 }, { ...good, version: 5 }, { ...good, version: 6 },
    { ...good, version: 8 },
    { ...good, values: [] }, { ...good, values: [...good.values, 0] },
    { ...good, values: sparse }, ...[-1, 2048, 1.5, NaN].map(flags => ({ ...good, flags })),
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

// The checkpoint on the multiplayer wire and under the client's prediction: src/mp/match/movementCheckpoint.selftest.mjs.
