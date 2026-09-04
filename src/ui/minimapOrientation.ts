const TAU = Math.PI * 2;

/** Normalize a marker angle so equivalent headings produce stable canvas paths. */
export function normalizeMinimapAngle(angle: number): number {
  const value = Number(angle);
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return Math.abs(wrapped) < 1e-10 ? 0 : wrapped;
}

/**
 * Project a world-space point onto the fixed north-up tactical map.
 * World +X is east/right and world +Z is north/up. This is also the raster
 * contract used by the offline top-down bake, so landmarks and live markers
 * cannot acquire independent mirroring or heading transforms.
 */
export function projectWorldToMinimap(
  worldX: number,
  worldZ: number,
  worldSize: number,
  mapSize: number,
  out?: number[],
): number[] {
  const target = out || [0, 0];
  const half = worldSize * 0.5;
  target[0] = ((worldX + half) / worldSize) * mapSize;
  target[1] = ((half - worldZ) / worldSize) * mapSize;
  return target;
}

/** Canvas polar angle for a horizontal world direction on a north-up map. */
export function minimapAngleForDirection(worldX: number, worldZ: number): number {
  return normalizeMinimapAngle(Math.atan2(-worldZ, worldX));
}
