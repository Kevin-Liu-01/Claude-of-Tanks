/**
 * Lossless finite-point gunnery intent for network play.
 *
 * Yaw/pitch alone describe only a ray. The old network path rebuilt every
 * camera hit 1,000 m away, which changed close-range parallax between the
 * hull origin and gun trunnion and made multiplayer barrels lay high. Keeping
 * the bounded distance reconstructs the same world point used by solo play;
 * the authority still owns traverse limits, gun limits, dispersion and fire.
 */

export const DEFAULT_AIM_DISTANCE_M = 1000;
export const MIN_AIM_DISTANCE_M = 0.01;
export const MAX_AIM_DISTANCE_M = 2000;

function clampDistance(value) {
  if (!Number.isFinite(value)) return DEFAULT_AIM_DISTANCE_M;
  return Math.max(MIN_AIM_DISTANCE_M, Math.min(MAX_AIM_DISTANCE_M, value));
}

export function encodeAimIntent(origin, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const horizontal = Math.hypot(dx, dz);
  return {
    aimYaw: Math.atan2(dx, dz),
    aimPitch: Math.atan2(dy, Math.max(1e-6, horizontal)),
    aimDistance: clampDistance(Math.hypot(horizontal, dy)),
  };
}

export function decodeAimIntent(input, origin, out) {
  const pitch = Number(input?.aimPitch) || 0;
  const yaw = Number(input?.aimYaw) || 0;
  const distance = clampDistance(Number(input?.aimDistance));
  const cosPitch = Math.cos(pitch);
  return out.set(
    origin.x + Math.sin(yaw) * cosPitch * distance,
    origin.y + Math.sin(pitch) * distance,
    origin.z + Math.cos(yaw) * cosPitch * distance,
  );
}
