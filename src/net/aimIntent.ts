const DEFAULT_AIM_DISTANCE_M = 1000;

export const MIN_AIM_DISTANCE_M = 0.01;
export const MAX_AIM_DISTANCE_M = 2000;

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface AimIntentInput {
  aimYaw?: unknown;
  aimPitch?: unknown;
  aimDistance?: unknown;
}

export interface AimIntent {
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
}

export interface MutableVector3Like extends Vector3Like {
  set(x: number, y: number, z: number): this;
}

function clampDistance(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AIM_DISTANCE_M;
  return Math.max(MIN_AIM_DISTANCE_M, Math.min(MAX_AIM_DISTANCE_M, value));
}

export function encodeAimIntent(origin: Vector3Like, target: Vector3Like): AimIntent {
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

export function decodeAimIntent<T extends MutableVector3Like>(
  input: AimIntentInput | null | undefined,
  origin: Vector3Like,
  out: T,
): T {
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
