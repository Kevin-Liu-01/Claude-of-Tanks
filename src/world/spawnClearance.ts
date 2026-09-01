export interface SpawnPoint2D {
  x: number;
  z: number;
}

/**
 * Returns whether a world-space point is outside every protected spawn disc.
 * Callers assemble the spawn list once and reuse it across placement attempts.
 */
export function isClearOfSpawns(
  x: number,
  z: number,
  spawns: readonly SpawnPoint2D[],
  clearanceM: number,
): boolean {
  const clearanceSq = Math.max(0, clearanceM) ** 2;
  for (const spawn of spawns) {
    const dx = x - spawn.x;
    const dz = z - spawn.z;
    if (dx * dx + dz * dz < clearanceSq) return false;
  }
  return true;
}
