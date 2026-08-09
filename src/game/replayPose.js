import { Vector3 } from 'three';

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function captureReplayPose(state) {
  return {
    pos: [state.pos.x, state.pos.y, state.pos.z],
    yaw: state.yaw || 0,
    pitch: state.visualPitch || 0,
    roll: state.visualRoll || 0,
    turretYaw: state.turretYaw || 0,
    gunPitch: state.gunPitch || 0,
  };
}

/** Guarantee the replayed barrel follows the shell's captured launch vector. */
export function alignReplayPoseToShot(pose, dir, spec) {
  if (!pose || !dir || dir.length < 3) return pose;
  const dx = Number(dir[0]) || 0;
  const dy = Number(dir[1]) || 0;
  const dz = Number(dir[2]) || 0;
  const horiz = Math.hypot(dx, dz);
  if (horiz < 1e-8) return pose;
  const worldYaw = Math.atan2(dx, dz);
  let relYaw = wrapPi(worldYaw - pose.yaw);
  const arc = spec && Number.isFinite(spec.gunArcDeg)
    ? Math.abs(spec.gunArcDeg) * Math.PI / 180 : Infinity;
  // Casemates cannot visually lay beyond their traverse arc. Turn the hull
  // into the shot rather than replaying a shell that exits through the flank.
  if (Math.abs(relYaw) > arc) {
    pose.yaw = worldYaw;
    relYaw = 0;
  }
  pose.turretYaw = relYaw;
  const worldPitch = Math.atan2(dy, horiz);
  const hullAtGun = pose.pitch * Math.cos(relYaw) + pose.roll * Math.sin(relYaw);
  const lo = -Math.abs((spec && spec.gunDepressionDeg) || 90) * Math.PI / 180;
  const hi = Math.abs((spec && spec.gunElevationDeg) || 90) * Math.PI / 180;
  pose.gunPitch = Math.max(lo, Math.min(hi, worldPitch - hullAtGun));
  return pose;
}

export function replayStateFromPose(pose) {
  return {
    pos: new Vector3(pose.pos[0], pose.pos[1], pose.pos[2]),
    yaw: pose.yaw, visualPitch: pose.pitch, visualRoll: pose.roll,
    turretYaw: pose.turretYaw, gunPitch: pose.gunPitch,
    yawRate: 0, speed: 0, trackScroll: { l: 0, r: 0 },
  };
}
