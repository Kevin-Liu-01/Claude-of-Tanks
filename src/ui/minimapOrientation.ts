export const MINIMAP_NORTH_UP = 0;
export const MINIMAP_SPAWN_FLIPPED = Math.PI;

/**
 * Keep the tactical map stable for the whole round while making the local
 * deployment direction read as screen-up. Battlefields use opposing north /
 * south deployment zones, so the far-side spawn needs one 180-degree flip;
 * small authored yaw offsets must not make the map drift or rotate diagonally.
 */
export function minimapRotationForSpawnYaw(yaw: number): number {
  const value = Number(yaw);
  if (!Number.isFinite(value)) return MINIMAP_NORTH_UP;
  return Math.cos(value) < -0.25 ? MINIMAP_SPAWN_FLIPPED : MINIMAP_NORTH_UP;
}

/** Write a north-up canvas point through the round's optional 180-degree flip. */
export function orientMinimapPoint(
  x: number,
  y: number,
  size: number,
  rotation: number,
  out?: number[],
): number[] {
  const target = out || [0, 0];
  if (rotation === MINIMAP_SPAWN_FLIPPED) {
    target[0] = size - x;
    target[1] = size - y;
  } else {
    target[0] = x;
    target[1] = y;
  }
  return target;
}

/** A world yaw needs the same half-turn as the map beneath its marker. */
export function orientMinimapYaw(yaw: number, rotation: number): number {
  return yaw + (rotation === MINIMAP_SPAWN_FLIPPED ? Math.PI : 0);
}
