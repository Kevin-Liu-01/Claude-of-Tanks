import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
import { ENTITY_FLAGS, quantizeAngle, quantizePosition, quantizeVelocity, zeroEntityRow } from '../wire/index.ts';
import { captureMovementCheckpoint } from './movementCheckpoint.ts';
import { DEFAULT_CORRECTION_POLICY, LocalPredictor } from './prediction.ts';

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
const DT = 1 / 60;

/** The authority side: the same shared movement, stepped with the same quantized controls. */
function createReference(x = 0, z = 0, yaw = 0) {
  const state = createTankState(SPEC, new Vector3(x, height(x, z), z), yaw);
  return { spec: SPEC, state, combat: null, input: { throttle: 0, steer: 0, brake: false, aimLocked: true, aimPoint: new Vector3(0, 0, 500) } };
}

function control(tick, { throttle = 0, steer = 0, brake = false, aimYaw = 0, fire = false } = {}) {
  return { tick, throttle, steer, brake, fire, aimLocked: true, aimYaw, aimPitch: 0, aimDistance: 500, shellSlot: 0, fireSeq: 0, actionSeq: 0, actionBits: 0 };
}

function applyControl(entity, c) {
  entity.input.throttle = c.throttle;
  entity.input.steer = c.steer;
  entity.input.brake = c.brake;
  entity.input.aimLocked = c.aimLocked;
  const origin = entity.state.pos;
  entity.input.aimPoint.set(origin.x + Math.sin(c.aimYaw) * c.aimDistance, origin.y, origin.z + Math.cos(c.aimYaw) * c.aimDistance);
}

function rowOf(entity, flags = 0) {
  const s = entity.state;
  return {
    ...zeroEntityRow(1),
    x: quantizePosition(s.pos.x), y: quantizePosition(s.pos.y), z: quantizePosition(s.pos.z),
    speed: quantizeVelocity(s.speed), verticalSpeed: quantizeVelocity(s.verticalSpeed),
    yaw: quantizeAngle(s.yaw), pitch: quantizeAngle(s.visualPitch), roll: quantizeAngle(s.visualRoll),
    turretYaw: quantizeAngle(s.turretYaw), gunPitch: quantizeAngle(s.gunPitch),
    hp: flags & ENTITY_FLAGS.DESTROYED ? 0 : 2000, maxHp: 2000,
    flags: flags | (s.grounded ? 0 : ENTITY_FLAGS.AIRBORNE),
  };
}

function viewerOf(entity) {
  const checkpoint = captureMovementCheckpoint(entity.state);
  return {
    entityId: 1, modules: [0, 0, 0, 0, 0, 0, 0], crewBits: 3, equipment: [1000, 1000, 1000, 1000],
    modeSpeedMultiplier: 1000, modeGravityScale: 1000,
    movementVersion: checkpoint.version, movementFlags: checkpoint.flags, movementValues: checkpoint.values.map(Math.fround),
  };
}

/**
 * Drive both sides from one control script. The authority row for tick S reaches
 * the client `lagTicks` later (it has predicted up to S + lagTicks by then).
 */
function simulate({ ticks, script, lagTicks = 6, serverScript = script, predictor = new LocalPredictor(SPEC, { heightField: FIELD }), seedFirst = true, onTick = () => {} }) {
  const server = createReference();
  const history = new Map();
  const errors = [];
  const presented = [];
  const controls = new Map();
  let displayTick = -1;
  let rowSeeded = false;
  for (let tick = 0; tick < ticks; tick++) {
    const c = control(tick, script(tick));
    controls.set(tick, c);
    const serverControl = control(tick, serverScript(tick));
    applyControl(server, serverControl);
    updateTank(server, FIELD, SIM_DT, null);
    if (tick % 2 === 0) history.set(tick, { row: rowOf(server), viewer: viewerOf(server) });
    // The authority for tick (tick - lagTicks) arrives now.
    const authorityTick = tick - lagTicks;
    if (seedFirst && !rowSeeded && authorityTick >= 0) {
      const first = history.get(authorityTick - (authorityTick % 2));
      predictor.reconcile({ tick: authorityTick - (authorityTick % 2), ...first }, (t) => controls.get(t) ?? null, tick - 1);
      rowSeeded = true;
    }
    predictor.recordTick(c);
    if (rowSeeded && authorityTick >= 0 && authorityTick % 2 === 0) {
      const authority = history.get(authorityTick);
      predictor.reconcile({ tick: authorityTick, ...authority }, (t) => controls.get(t) ?? null, tick);
      errors.push(predictor.getStats().lastPositionErrorM);
    }
    // Present once per tick (a 60 Hz display): the display tick trails by half a tick.
    displayTick = tick - 0.5;
    predictor.present(DT, displayTick);
    presented.push({ x: predictor.presented.pos.x, y: predictor.presented.pos.y, z: predictor.presented.pos.z, yaw: predictor.presented.yaw, turretYaw: predictor.presented.turretYaw });
    onTick(tick, predictor, server);
  }
  return { predictor, server, errors, presented, controls, history };
}

function maxStep(presented, from = 1) {
  let largest = 0;
  for (let n = from; n < presented.length; n++) {
    const a = presented[n - 1], b = presented[n];
    largest = Math.max(largest, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return largest;
}

// ------------------------------------------------------------ deterministic replay: a matching script predicts exactly
{
  const script = (tick) => ({ throttle: tick > 30 ? 1 : 0, steer: tick > 120 && tick < 300 ? 0.6 : 0, aimYaw: tick > 200 ? 0.8 : 0 });
  const { predictor, errors, presented, server, history } = simulate({ ticks: 420, script, lagTicks: 7 });
  const stats = predictor.getStats();
  assert.ok(stats.reconciliations > 190, `reconciles on every authority row: ${stats.reconciliations}`);
  assert.equal(stats.hardSnaps, 0);
  assert.equal(stats.checkpointsApplied, stats.reconciliations + 1, 'every row carried a checkpoint');
  assert.ok(Math.max(...errors) < 0.01, `identical controls replay to within a centimetre: ${Math.max(...errors)}`);
  assert.ok(stats.maxCorrectionStepM < 0.01, 'nothing to correct, nothing released');
  const speed = Math.abs(server.state.speed);
  assert.ok(speed > 10, `the reference drives (${speed} m/s)`);
  assert.ok(maxStep(presented, 40) < speed * DT * 1.15 + 0.02, `presentation steps are v·dt: ${maxStep(presented, 40)}`);
  // The presented tank runs ahead of the delayed authority row by the lag (zero input latency).
  const last = presented.at(-1);
  const lastAuthority = history.get(predictor.authorityTick).row;
  assert.ok(Math.hypot(last.x - lastAuthority.x / 1000, last.z - lastAuthority.z / 1000) > 0.5, 'the local tank is ahead of the delayed authority');
  assert.ok(Math.abs(last.x - server.state.pos.x) < 0.5 && Math.abs(last.z - server.state.pos.z) < 0.5, 'and level with the same-tick reference');
  assert.ok(Math.abs(predictor.presented.turretYaw - server.state.turretYaw) < 0.3, 'turret aim tracks the script');
  assert.equal(predictor.simulationState.pos.x, predictor.simulationState.pos.x, 'the simulation state is exposed');
}

// ------------------------------------------------------------ a divergence corrects within the envelopes
{
  // The server brakes hard at tick 240 for 30 ticks (a contact the client never saw); the client keeps its script.
  const script = (tick) => ({ throttle: tick > 30 ? 1 : 0 });
  const serverScript = (tick) => (tick >= 240 && tick < 270 ? { throttle: 0, brake: true } : script(tick));
  const trace = [];
  const { predictor, presented } = simulate({
    ticks: 420, script, serverScript, lagTicks: 6,
    onTick: (tick, p) => trace.push({ tick, correction: p.getStats().correctionM, step: p.getStats().maxCorrectionStepM }),
  });
  const stats = predictor.getStats();
  assert.equal(stats.hardSnaps, 0, 'a braking divergence is far below the 7 m snap');
  assert.ok(stats.maxPositionErrorM > 0.05, `the divergence was seen: ${stats.maxPositionErrorM}`);
  assert.ok(stats.maxCorrectionStepM <= DEFAULT_CORRECTION_POLICY.maxHorizontalStepM + DEFAULT_CORRECTION_POLICY.maxVerticalStepM + 1e-9,
    `release per frame is bounded: ${stats.maxCorrectionStepM}`);
  assert.ok(stats.maxCorrectionStepM <= 0.25, 'correction release ≤ 0.25 m');
  const peak = trace.reduce((best, entry) => (entry.correction > best.correction ? entry : best), trace[0]);
  assert.ok(peak.correction > 0.05);
  const later = trace.find((entry) => entry.tick === peak.tick + 7);
  assert.ok(later.correction < peak.correction, 'the correction decays on the display clock');
  // The presented pose never steps more than motion + the release cap.
  assert.ok(maxStep(presented, 40) <= 18 * DT + 0.25, `presented step ${maxStep(presented, 40)}`);
  // Decay rate: hull tau 110 ms → about e^-1 after 110 ms when nothing else is staged.
  const p = new LocalPredictor(SPEC, { heightField: FIELD });
  const settle = (entity) => { for (let n = 0; n < 180; n++) { applyControl(entity, control(n)); updateTank(entity, FIELD, SIM_DT, null); } return entity; };
  const idle = settle(createReference(10, 10));
  p.reconcile({ tick: 0, row: rowOf(idle), viewer: viewerOf(idle) }, () => null, 0);
  const displaced = settle(createReference(11, 10)); // authority 1 m off the client's prediction
  p.recordTick(control(1));
  p.recordTick(control(2));
  p.reconcile({ tick: 2, row: rowOf(displaced), viewer: viewerOf(displaced) }, () => control(0), 2);
  const staged = p.getStats().correctionM;
  assert.ok(Math.abs(staged - 1) < 0.02, `a 1 m authority shift stages a 1 m correction: ${staged}`);
  let released = 0;
  for (let n = 0; n < 7; n++) { p.present(DT, 2); released = Math.max(released, p.getStats().maxCorrectionStepM); }
  const afterMs = p.getStats().correctionM;
  assert.ok(afterMs > Math.exp(-7 * DT / 0.11) * 0.8 && afterMs < Math.exp(-7 * DT / 0.11) * 1.2 + 0.05, `110 ms hull envelope: ${afterMs}`);
  assert.ok(released <= 0.2 + 1e-9, 'never more than 0.2 m horizontal per frame');
  for (let n = 0; n < 120; n++) p.present(DT, 2);
  assert.ok(p.getStats().correctionM < 0.01, 'the correction converges');
  assert.ok(Math.abs(p.presented.pos.x - displaced.state.pos.x) < 0.02, 'the presented tank ends on the authority');
}

// ------------------------------------------------------------ aim envelope (75 ms) is faster than the hull
{
  const p = new LocalPredictor(SPEC, { heightField: FIELD });
  const base = createReference(0, 0);
  p.reconcile({ tick: 0, row: rowOf(base), viewer: viewerOf(base) }, () => null, 0);
  p.recordTick(control(1));
  const turned = createReference(0, 0);
  turned.state.turretYaw = 0.5;
  turned.state.pos.x = 0.5;
  p.reconcile({ tick: 1, row: rowOf(turned), viewer: viewerOf(turned) }, () => control(0), 1);
  const before = { turret: Math.abs(p.presented.turretYaw - 0.5), hull: Math.abs(p.presented.pos.x - 0.5) };
  for (let n = 0; n < 5; n++) p.present(DT, 1);
  const after = { turret: Math.abs(p.presented.turretYaw - 0.5), hull: Math.abs(p.presented.pos.x - 0.5) };
  assert.ok(after.turret / before.turret < after.hull / before.hull, 'aim settles faster than the hull');
}

// ------------------------------------------------------------ hard snap, death, respawn
{
  const p = new LocalPredictor(SPEC, { heightField: FIELD });
  const here = createReference(0, 0);
  p.reconcile({ tick: 0, row: rowOf(here), viewer: viewerOf(here) }, () => null, 0);
  assert.equal(p.isInitialized, true);
  p.recordTick(control(1));
  const far = createReference(50, 0);
  p.reconcile({ tick: 1, row: rowOf(far), viewer: viewerOf(far) }, () => control(0), 1);
  assert.equal(p.getStats().hardSnaps, 1, 'a 50 m error snaps');
  p.present(DT, 1);
  assert.ok(Math.abs(p.presented.pos.x - 50) < 1e-6, 'the snap shows the authority pose at once');
  assert.equal(p.getStats().correctionM, 0);
  // Death: the simulation stops taking input; the wreck settles on the authority through the bounded path.
  const wreck = createReference(50.6, 0);
  p.recordTick(control(2, { throttle: 1 }));
  p.reconcile({ tick: 2, row: rowOf(wreck, ENTITY_FLAGS.DESTROYED), viewer: viewerOf(wreck) }, () => control(0), 2);
  assert.equal(p.isDestroyed, true);
  assert.equal(p.getStats().terminalSyncs, 1);
  const frozen = p.simulationState.pos.x;
  for (let n = 3; n < 20; n++) p.recordTick(control(n, { throttle: 1 }));
  assert.equal(p.simulationState.pos.x, frozen, 'a destroyed tank ignores controls');
  for (let n = 0; n < 90; n++) p.present(DT, 2);
  assert.ok(Math.abs(p.presented.pos.x - 50.6) < 0.02, 'the wreck settles onto the terminal pose');
  // Respawn: a live row far away re-seeds without a snap or a correction.
  const spawn = createReference(-120, 40, 1.2);
  p.reconcile({ tick: 40, row: rowOf(spawn), viewer: viewerOf(spawn) }, () => control(0), 40);
  assert.equal(p.isDestroyed, false);
  assert.equal(p.getStats().respawns, 1);
  assert.equal(p.getStats().hardSnaps, 1, 'a respawn is not a snap');
  p.present(DT, 40);
  assert.ok(Math.abs(p.presented.pos.x + 120) < 1e-6 && Math.abs(p.presented.yaw - 1.2) < 1e-3, 'the spawn pose (yaw at turn-unit resolution)');
}

// ------------------------------------------------------------ resting hull hold: quantization chatter never reaches the screen
{
  const p = new LocalPredictor(SPEC, { heightField: FIELD });
  const parked = createReference(4, 4);
  for (let n = 0; n < 240; n++) { applyControl(parked, control(n)); updateTank(parked, FIELD, SIM_DT, null); }
  p.reconcile({ tick: 0, row: rowOf(parked), viewer: viewerOf(parked) }, () => null, 0);
  const poses = [];
  let tick = 0;
  for (let n = 1; n <= 120; n++) {
    tick = n;
    p.recordTick(control(tick));
    if (n % 2 === 0) {
      const row = rowOf(parked);
      // ±1 mm of height and ±1 turn unit of yaw jitter, as a quantized authority at rest produces.
      row.y += n % 4 === 0 ? 1 : -1;
      row.yaw = (row.yaw + (n % 4 === 0 ? 1 : 65535)) & 0xffff;
      p.reconcile({ tick: n, row, viewer: viewerOf(parked) }, (t) => control(t), tick);
    }
    p.present(DT, tick - 0.5);
    poses.push([p.presented.pos.x, p.presented.pos.y, p.presented.pos.z, p.presented.yaw]);
  }
  assert.ok(p.getStats().restingHolds > 0, 'the hull is held at rest');
  const first = poses[10];
  for (const pose of poses.slice(10)) {
    assert.ok(Math.abs(pose[1] - first[1]) < 1e-9 && Math.abs(pose[3] - first[3]) < 1e-9, 'no chatter while parked');
  }
  assert.equal(p.holdsRestingHull, true);
  p.recordTick(control(121, { throttle: 1 }));
  assert.equal(p.holdsRestingHull, false, 'drive intent releases the hold at once');
}

// ------------------------------------------------------------ missing checkpoint, contact smoothing hook, reset
{
  let contacts = 0;
  const collide = (position, radius, outPush) => {
    outPush.set(0, 0, 0);
    if (position.z + radius <= 20) return false;
    outPush.z = 20 - radius - position.z;
    contacts++;
    return true;
  };
  const p = new LocalPredictor(SPEC, { heightField: FIELD, collide });
  const start = createReference(0, 0);
  p.reconcile({ tick: 0, row: rowOf(start), viewer: null }, () => null, 0);
  assert.equal(p.getStats().checkpointsMissing, 1, 'a row without the viewer section still seeds');
  for (let n = 1; n <= 300; n++) p.recordTick(control(n, { throttle: 1 }));
  assert.ok(contacts > 0, 'the collision adapter is consulted during prediction');
  assert.ok(p.simulationState.pos.z < 21, 'the wall holds the predicted hull');
  p.reset();
  assert.equal(p.isInitialized, false);
  assert.throws(() => new LocalPredictor(SPEC, { heightField: null }));
}

console.log('mp prediction: exact replay with matching controls, divergence corrected inside the 110/160/75 ms envelopes with ≤ 0.2 m releases, hard snap at 7 m, death/respawn, resting hold, collision adapter pass');
