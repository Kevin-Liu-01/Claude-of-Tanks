import { Vector3 } from 'three';
import {
  alignReplayPoseToShot, captureReplayPose, createReplayFlightTimeline,
  replayDistanceAtTime, replayStateFromPose,
} from './replayPose.js';

const state = {
  pos: new Vector3(4, 2, 8), yaw: Math.PI, visualPitch: 0.04, visualRoll: -0.02,
  turretYaw: 0, gunPitch: 0,
};
const pose = captureReplayPose(state);
state.pos.x = 99;
if (pose.pos[0] !== 4) throw new Error('shot-time pose was not copied');
alignReplayPoseToShot(pose, [1, 0.1, 0], { gunDepressionDeg: 10, gunElevationDeg: 20 });
const replay = replayStateFromPose(pose);
const gunYaw = replay.yaw + replay.turretYaw;
if (Math.abs(Math.sin(gunYaw) - 1) > 1e-9 || Math.abs(Math.cos(gunYaw)) > 1e-9) {
  throw new Error('replayed turret does not follow the captured shell direction');
}
const casemate = captureReplayPose({ ...state, pos: new Vector3(), yaw: 0 });
alignReplayPoseToShot(casemate, [1, 0, 0], {
  gunArcDeg: 5, gunDepressionDeg: 8, gunElevationDeg: 15,
});
if (Math.abs(casemate.yaw - Math.PI / 2) > 1e-9 || casemate.turretYaw !== 0) {
  throw new Error('casemate hull was not turned into an out-of-arc shot');
}

// The full slow-motion ramp must fit INSIDE the advertised flight duration.
// The old frame integrator appended slow-mo after that budget and then used a
// stall guard that snapped short/medium shots through their final meters.
for (const total of [8, 30, 130, 440]) {
  const duration = Math.max(1.9, Math.min(3.4, 1.2 + total * 0.005));
  const timeline = createReplayFlightTimeline(total, duration);
  if (replayDistanceAtTime(timeline, 0) !== 0) {
    throw new Error(`flight ${total} m does not begin at the muzzle`);
  }
  if (Math.abs(replayDistanceAtTime(timeline, duration) - total) > 1e-6) {
    throw new Error(`flight ${total} m does not reach armor on time`);
  }
  let prev = -1;
  for (let i = 0; i <= 240; i++) {
    const d = replayDistanceAtTime(timeline, duration * i / 240);
    if (d + 1e-6 < prev || d > total + 1e-6) {
      throw new Error(`flight ${total} m timeline is not monotonic`);
    }
    prev = d;
  }
  const early = replayDistanceAtTime(timeline, duration * 0.1);
  const late = total - replayDistanceAtTime(timeline, duration * 0.9);
  if (total > 13 && !(early > late)) {
    throw new Error(`flight ${total} m lost its terminal slow-motion ramp`);
  }
}
