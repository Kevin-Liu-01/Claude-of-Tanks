import assert from 'node:assert/strict';
import {
  advanceTankPresentationPose,
  createTankPresentationPose,
  resetTankPresentationPose,
  sampleTankPresentationPose,
} from './presentationPose.js';

const SIM_DT = 1 / 60;

function makeState() {
  return {
    pos: { x: 0, y: 2, z: 0 },
    yaw: 0,
    speed: 10,
    verticalSpeed: 0,
    grounded: true,
    yawRate: 0.2,
    visualPitch: 0,
    visualRoll: 0,
    turretYaw: 0,
    gunPitch: 0,
    trackScroll: { l: 0, r: 0 },
    _swayEst: 0,
    _susp: { p: 0, r: 0, pv: 0, rv: 0 },
    _flinch: { p: 0, r: 0, pv: 0, rv: 0 },
  };
}

function runSchedule(frameDts) {
  const state = makeState();
  const tracker = createTankPresentationPose(state);
  let accumulator = 0;
  let simTime = 0;
  let renderTime = 0;
  let priorX = 0;
  let maxVelocityError = 0;
  let samples = 0;
  for (let frame = 0; frame < 420; frame++) {
    const dt = frameDts[frame % frameDts.length];
    renderTime += dt;
    accumulator += dt;
    while (accumulator + 1e-12 >= SIM_DT) {
      simTime += SIM_DT;
      state.pos.x = state.speed * simTime;
      state.yaw = state.yawRate * simTime;
      state.trackScroll.l = state.speed * simTime;
      state.trackScroll.r = state.speed * simTime;
      advanceTankPresentationPose(tracker, state);
      accumulator -= SIM_DT;
    }
    const pose = sampleTankPresentationPose(tracker, state, accumulator / SIM_DT);
    const expectedX = state.speed * Math.max(0, renderTime - SIM_DT);
    assert.ok(Math.abs(pose.pos.x - expectedX) < 1e-8,
      `presentation time drifted at frame ${frame}: ${pose.pos.x} vs ${expectedX}`);
    if (renderTime > SIM_DT * 3) {
      const velocity = (pose.pos.x - priorX) / dt;
      maxVelocityError = Math.max(maxVelocityError, Math.abs(velocity - state.speed));
      samples++;
    }
    priorX = pose.pos.x;
  }
  assert.ok(samples > 100);
  assert.ok(maxVelocityError < 1e-6, `visible velocity error ${maxVelocityError}`);
}

for (const hz of [30, 60, 90, 120, 144]) runSchedule([1 / hz]);
runSchedule([1 / 144, 1 / 90, 1 / 72, 1 / 120, 1 / 55, 1 / 100]);

{
  const state = makeState();
  state.yaw = 179 * Math.PI / 180;
  state.turretYaw = 179 * Math.PI / 180;
  const tracker = createTankPresentationPose(state);
  state.yaw = -179 * Math.PI / 180;
  state.turretYaw = -179 * Math.PI / 180;
  advanceTankPresentationPose(tracker, state);
  const pose = sampleTankPresentationPose(tracker, state, 0.5);
  assert.ok(Math.abs(Math.abs(pose.yaw) - Math.PI) < 1e-9, 'hull yaw took the long arc');
  assert.ok(Math.abs(Math.abs(pose.turretYaw) - Math.PI) < 1e-9,
    'turret yaw took the long arc');
}

{
  const state = makeState();
  const tracker = createTankPresentationPose(state);
  state.pos.x = 100;
  advanceTankPresentationPose(tracker, state);
  assert.equal(sampleTankPresentationPose(tracker, state, 0).pos.x, 100,
    'teleports must snap instead of sweeping across the battlefield');
}

{
  const state = makeState();
  const tracker = createTankPresentationPose();
  resetTankPresentationPose(tracker, state);
  const pose = sampleTankPresentationPose(tracker, state, 0.25);
  const nested = pose.pos;
  assert.equal(sampleTankPresentationPose(tracker, state, 0.75), pose,
    'render sampling must reuse the pose object');
  assert.equal(pose.pos, nested, 'render sampling must reuse nested objects');
}

console.log('presentationPose selftest: all checks passed');
