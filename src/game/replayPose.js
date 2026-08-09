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

function smoothstep(x, min, max) {
  if (max <= min) return x >= max ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

/**
 * Build a wall-clock flight map for a replayed shell. Distance is sampled
 * against the same terminal slow-motion profile used by the kill cam, then
 * the accumulated time is normalized to `durationS`. This is deliberately a
 * lookup table rather than per-frame integration: the shell reaches the
 * armor on the exact final frame regardless of refresh rate or a long rAF.
 */
export function createReplayFlightTimeline(totalM, durationS, opts = {}) {
  const total = Math.max(0, Number(totalM) || 0);
  const duration = Math.max(0.001, Number(durationS) || 0.001);
  const slowRate = Math.max(0.05, Math.min(1, Number(opts.slowRate) || 0.25));
  const slowStartM = Math.max(0.01, Number(opts.slowStartM) || 44);
  const slowFullM = Math.max(0, Math.min(slowStartM, Number(opts.slowFullM) || 13));
  const count = Math.max(17, Math.min(129, Math.ceil(total / 4) + 1));
  const distances = new Float32Array(count);
  const times = new Float32Array(count);
  if (total <= 1e-6) {
    times[count - 1] = duration;
    return { total, duration, distances, times };
  }

  let weighted = 0;
  for (let i = 1; i < count; i++) {
    const d0 = total * ((i - 1) / (count - 1));
    const d1 = total * (i / (count - 1));
    const remaining = total - (d0 + d1) * 0.5;
    const ramp = smoothstep(remaining, slowFullM, slowStartM);
    const rate = slowRate + (1 - slowRate) * ramp;
    weighted += (d1 - d0) / rate;
    distances[i] = d1;
    times[i] = weighted;
  }
  const scale = duration / weighted;
  for (let i = 1; i < count; i++) times[i] *= scale;
  // Float32 normalization can leave the endpoint a few microseconds adrift.
  distances[count - 1] = total;
  times[count - 1] = duration;
  return { total, duration, distances, times };
}

/** Sample a replay timeline at wall-clock time, returning traveled meters. */
export function replayDistanceAtTime(timeline, elapsedS) {
  if (!timeline || timeline.total <= 0) return 0;
  const t = Number(elapsedS) || 0;
  if (t <= 0) return 0;
  if (t >= timeline.duration) return timeline.total;
  const times = timeline.times;
  let lo = 0;
  let hi = times.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = Math.max(1e-8, times[hi] - times[lo]);
  const f = Math.max(0, Math.min(1, (t - times[lo]) / span));
  return timeline.distances[lo]
    + (timeline.distances[hi] - timeline.distances[lo]) * f;
}
