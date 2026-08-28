export const MINIMAP_NORTH_UP = 0;
export const MINIMAP_SPAWN_FLIPPED = Math.PI;

const TAU = Math.PI * 2;

/** Normalize an angle so equivalent headings produce one stable transform. */
export function normalizeMinimapAngle(angle: number): number {
  const value = Number(angle);
  if (!Number.isFinite(value)) return MINIMAP_NORTH_UP;
  const wrapped = ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return Math.abs(wrapped) < 1e-10 ? MINIMAP_NORTH_UP : wrapped;
}

/**
 * Keep the tactical map stable for the whole round while making the local
 * deployment direction read as screen-up. Map spawn axes are not all due
 * north/south, so a binary 0/180-degree flip is not sufficient.
 */
export function minimapRotationForSpawnYaw(yaw: number): number {
  const value = Number(yaw);
  if (!Number.isFinite(value)) return MINIMAP_NORTH_UP;
  return normalizeMinimapAngle(-value);
}

/** Rotate a north-up canvas point around the map center into deployment-up. */
export function orientMinimapPoint(
  x: number,
  y: number,
  size: number,
  rotation: number,
  out?: number[],
): number[] {
  const target = out || [0, 0];
  const half = size * 0.5;
  const dx = x - half;
  const dy = y - half;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  target[0] = half + c * dx - s * dy;
  target[1] = half + s * dx + c * dy;
  return target;
}

/** A world yaw needs the same rotation as the map beneath its marker. */
export function orientMinimapYaw(yaw: number, rotation: number): number {
  return normalizeMinimapAngle(yaw + rotation);
}

/** Canvas polar angle for a horizontal world direction vector. */
export function orientMinimapDirection(
  worldX: number,
  worldZ: number,
  rotation: number,
): number {
  return normalizeMinimapAngle(Math.atan2(-worldZ, worldX) + rotation);
}
