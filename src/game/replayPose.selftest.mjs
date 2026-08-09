import { Vector3 } from 'three';
import { alignReplayPoseToShot, captureReplayPose, replayStateFromPose } from './replayPose.js';

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
