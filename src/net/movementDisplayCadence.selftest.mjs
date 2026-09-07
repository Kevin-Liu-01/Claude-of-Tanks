import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { LocalTankPredictor } from './localTankPrediction.ts';
import { capturePredictionAuthorityState } from './predictionAuthorityState.ts';
import { NetworkInputCadence } from './inputCadence.ts';
import { SNAPSHOT_FLAGS } from './snapshot.ts';

// Exact, unquantized 20 Hz authority receipts isolate display integration and
// upload/ACK phase from packet loss, quantization, contacts and changing input.
// A no-reconciliation control uses the identical record/advance API and frame
// pattern. Truth is the interpolated fixed-60-Hz shared-model trajectory, not
// a delayed snapshot position. This synthetic field is not a production map.
const input = { throttle: 1, steer: 0.25, brake: false, fire: false,
  aimLocked: true, aimYaw: 0, aimPitch: 0 };
const spec = getSpec('m1a2');
const entity = () => ({ id: 'viewer', spec, state: createTankState(spec, new Vector3(), 0),
  combat: { modules: {}, crew: {} }, input: { ...input, aimPoint: new Vector3(0, 0, 500) } });
const pose = state => [state.pos.x, state.pos.y, state.pos.z,
  state.visualPitch + state._susp.p * 2.2,
  state.visualRoll + state._susp.r * 1.9 + state._swayEst * 2.4];
const DISPLAY_PATTERNS = { '60Hz': [1 / 60], '120Hz': [1 / 120], variable: [0.0167, 0.025, 0.011] };

function sample(source, tick) {
  const s = source.state;
  return { tick, ackInputSeq: null, predictionState: capturePredictionAuthorityState(source), entity: {
    x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw, pitch: s.visualPitch, roll: s.visualRoll,
    turretYaw: s.turretYaw, gunPitch: s.gunPitch,
    vx: Math.sin(s.yaw) * s.speed, vz: Math.cos(s.yaw) * s.speed,
    vy: s.verticalSpeed, flags: s.grounded ? 0 : SNAPSHOT_FLAGS.AIRBORNE,
  } };
}

function observe(metrics, actual, before, ideal, previousError) {
  const error = actual.map((value, index) => value - ideal[index]);
  metrics.maxYErrorM = Math.max(metrics.maxYErrorM, Math.abs(error[1]));
  metrics.maxTotalHullPitchErrorRad = Math.max(metrics.maxTotalHullPitchErrorRad, Math.abs(error[3]));
  metrics.maxTotalHullRollErrorRad = Math.max(metrics.maxTotalHullRollErrorRad, Math.abs(error[4]));
  metrics.maxReconcileYStepM = Math.max(metrics.maxReconcileYStepM, Math.abs(actual[1] - before[1]));
  metrics.maxReconcileHullStepRad = Math.max(metrics.maxReconcileHullStepRad,
    Math.abs(actual[3] - before[3]), Math.abs(actual[4] - before[4]));
  if (previousError) {
    // Change in error removes the expected fixed-60-Hz movement between
    // frames. It is not an assertion that the tank itself should stand still.
    metrics.maxVerticalStepErrorM = Math.max(metrics.maxVerticalStepErrorM, Math.abs(error[1] - previousError[1]));
    metrics.maxPitchStepErrorRad = Math.max(metrics.maxPitchStepErrorRad, Math.abs(error[3] - previousError[3]));
    metrics.maxRollStepErrorRad = Math.max(metrics.maxRollStepErrorRad, Math.abs(error[4] - previousError[4]));
  }
  return error;
}

function measure(pattern, waves, echoes, authorityFirst = false, echoDelayS = 0) {
  const height = (x, z) => waves ? 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2) : 0;
  const field = { getHeightAt: height, getHeightAtFast: height, getGroundType: () => 'hard' };
  const server = entity(), shown = entity();
  const prediction = new LocalTankPredictor({ entity: shown, heightField: field });
  const cadence = new NetworkInputCadence();
  const snapshots = [], truth = [];
  for (let tick = 0; tick <= 722; tick++) {
    truth.push(pose(server.state));
    if (tick % 3 === 0) snapshots.push(sample(server, tick));
    updateTank(server, field, SIM_DT);
  }
  prediction.reconcile(snapshots[0]);
  let time = 0, tick = 0, sequence = 0, ack = null, nextSnapshot = 1;
  const uploads = [];
  let previousError = null;
  const metrics = { maxYErrorM: 0, maxVerticalStepErrorM: 0,
    maxTotalHullPitchErrorRad: 0, maxTotalHullRollErrorRad: 0,
    maxPitchStepErrorRad: 0, maxRollStepErrorRad: 0,
    maxReconcileYStepM: 0, maxReconcileHullStepRad: 0 };
  const rows = [];
  function admitAuthorityTicks() {
    while ((tick + 1) * SIM_DT <= time + 1e-9) {
      tick++;
      while (uploads[0]?.at <= tick * SIM_DT + 1e-9) ack = uploads.shift().sequence;
      if (tick % 3 === 0) snapshots[tick / 3].ackInputSeq = ack;
    }
  }
  for (let frame = 0; time < 12 - 1e-9; frame++) {
    const dt = Math.min(pattern[frame % pattern.length], 12 - time);
    time += dt;
    if (authorityFirst) admitAuthorityTicks();
    cadence.advance(dt);
    if (cadence.shouldSend(input)) {
      uploads.push({ at: time, sequence });
      prediction.recordInput(input, cadence.commit(input), sequence++, dt);
    } else prediction.advancePrediction(input, dt);
    if (!authorityFirst) admitAuthorityTicks();
    const before = pose(shown.state);
    while (nextSnapshot < snapshots.length &&
      snapshots[nextSnapshot].tick * SIM_DT + echoDelayS <= time + 1e-9) {
      if (echoes) prediction.reconcile(snapshots[nextSnapshot]);
      nextSnapshot++;
    }
    const actual = pose(shown.state);
    const fractional = time / SIM_DT, low = Math.floor(fractional), fraction = fractional - low;
    const ideal = truth[low].map((value, index) => value + (truth[low + 1][index] - value) * fraction);
    // Startup support placement is excluded; all motion after one second is
    // included, including every receipt and subsequent correction decay.
    if (time > 1) {
      previousError = observe(metrics, actual, before, ideal, previousError);
      rows.push(actual);
    }
  }
  return { metrics, stats: prediction.getStats(), rows };
}

function compareControl(echo, control) {
  assert.equal(echo.rows.length, control.rows.length);
  let maxYDifferenceM = 0, maxVerticalStepDifferenceM = 0, previous = null;
  for (let index = 0; index < echo.rows.length; index++) {
    const difference = echo.rows[index][1] - control.rows[index][1];
    maxYDifferenceM = Math.max(maxYDifferenceM, Math.abs(difference));
    if (previous !== null) maxVerticalStepDifferenceM = Math.max(maxVerticalStepDifferenceM,
      Math.abs(difference - previous));
    previous = difference;
  }
  return { maxYDifferenceM, maxVerticalStepDifferenceM };
}

function checkReceipt(result, echoes = true) {
  for (const value of Object.values(result.metrics)) assert.ok(Number.isFinite(value) && value >= 0);
  assert.equal(result.stats.hardSnaps, 0);
  assert.equal(result.stats.missingMovementCheckpoints, 0);
  assert.equal(result.stats.rejectedMovementCheckpoints, 0);
  // The deliberate no-echo control never receives an ACK and eventually
  // retires its bounded history; no replay consumes that history. Normal
  // echoed trajectories must retain every outstanding input without overflow.
  if (echoes) assert.equal(result.stats.droppedHistory, 0);
  assert.ok(echoes ? result.stats.movementCheckpoints >= 239 : result.stats.movementCheckpoints === 1);
  assert.ok(result.metrics.maxReconcileYStepM < 1e-12, 'reconcile preserves displayed height continuously');
  assert.ok(result.metrics.maxReconcileHullStepRad < 1e-12, 'total amplified hull attitude remains continuous');
}

test('synchronized 60 Hz displays remain exact with 20 Hz checkpoints and 0/100 ms delivery', () => {
  for (const waves of [false, true]) {
    const control = measure(DISPLAY_PATTERNS['60Hz'], waves, false);
    checkReceipt(control, false);
    for (const delay of [0, 0.1]) {
      const echo = measure(DISPLAY_PATTERNS['60Hz'], waves, true, false, delay);
      checkReceipt(echo);
      for (const value of Object.values(echo.metrics)) assert.ok(value < 1e-9);
      assert.ok(compareControl(echo, control).maxYDifferenceM < 1e-9);
    }
  }
});

test('120 Hz and variable display checkpoints bound remaining height and total-hull residuals', () => {
  for (const [name, heightBound, stepBound, pitchBound, pitchStepBound, rollBound] of [
    ['120Hz', 0.006, 0.0016, 0.004, 0.0038, 0.0045],
    ['variable', 0.033, 0.011, 0.012, 0.010, 0.011],
  ]) {
    for (const waves of [false, true]) {
      const control = measure(DISPLAY_PATTERNS[name], waves, false);
      checkReceipt(control, false);
      for (const delay of [0, 0.1]) {
        const echo = measure(DISPLAY_PATTERNS[name], waves, true, false, delay);
        checkReceipt(echo);
        const metrics = echo.metrics;
        assert.ok(metrics.maxYErrorM < heightBound);
        assert.ok(metrics.maxVerticalStepErrorM < stepBound);
        assert.ok(metrics.maxTotalHullPitchErrorRad < pitchBound);
        assert.ok(metrics.maxPitchStepErrorRad < pitchStepBound);
        assert.ok(metrics.maxTotalHullRollErrorRad < rollBound);
        assert.ok(metrics.maxRollStepErrorRad < 0.0025);
        if (waves) assert.ok(metrics.maxYErrorM < control.metrics.maxYErrorM / 3,
          'checkpoints reduce accumulated display-timestep drift; no claim that residual error is zero');
        console.log(JSON.stringify({ fixture: 'movement-display-cadence', name, waves, delay,
          echo: metrics, noReconcile: control.metrics, comparison: compareControl(echo, control) }));
      }
    }
  }
});

test('authority-before-upload phase is measured separately from fractional display integration', () => {
  // Even at 60 Hz, independently scheduled authority can tick before the
  // display's new upload. Its ACK then omits that upload, whose whole recorded
  // interval is replayed. Keep this distinct from a fractional-dt diagnosis.
  const pattern = DISPLAY_PATTERNS['60Hz'];
  const control = measure(pattern, true, false);
  for (const delay of [0, 0.1]) {
    const echo = measure(pattern, true, true, true, delay);
    checkReceipt(echo);
    assert.ok(control.metrics.maxYErrorM < 1e-9);
    assert.ok(echo.metrics.maxYErrorM < 0.027);
    assert.ok(echo.metrics.maxVerticalStepErrorM < 0.006);
    assert.ok(echo.metrics.maxTotalHullPitchErrorRad < 0.012);
    assert.ok(echo.metrics.maxPitchStepErrorRad < 0.0085);
    assert.ok(echo.metrics.maxTotalHullRollErrorRad < 0.011);
    assert.ok(echo.metrics.maxRollStepErrorRad < 0.0011);
    console.log(JSON.stringify({ fixture: 'authority-before-upload', delay,
      echo: echo.metrics, comparison: compareControl(echo, control) }));
  }
});
