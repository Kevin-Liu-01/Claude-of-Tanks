/** Full authored terrain extends to +/-512 m; gameplay stops well inside it. */
export const TERRAIN_HALF_EXTENT_M = 512;

/**
 * Keeps the complete tank hull and chase camera inside terrain/horizon cover.
 * The remaining 42 m is a visual safety apron, not playable ground.
 */
export const PLAYABLE_HALF_EXTENT_M = 470;

interface Push2 {
  x: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Add the minimum translation that keeps an oriented hull inside the playable
 * square. The caller applies `outPush` to the tank root after all contacts.
 */
export function pushHullInsidePlayableBounds(
  centerX: number,
  centerZ: number,
  forwardX: number,
  forwardZ: number,
  rightX: number,
  rightZ: number,
  halfLengthM: number,
  halfWidthM: number,
  outPush: Push2,
  halfExtentM = PLAYABLE_HALF_EXTENT_M,
): boolean {
  const extentX = Math.abs(forwardX) * halfLengthM + Math.abs(rightX) * halfWidthM;
  const extentZ = Math.abs(forwardZ) * halfLengthM + Math.abs(rightZ) * halfWidthM;
  const limitX = Math.max(0, halfExtentM - extentX);
  const limitZ = Math.max(0, halfExtentM - extentZ);
  const safeX = clamp(centerX, -limitX, limitX);
  const safeZ = clamp(centerZ, -limitZ, limitZ);
  const pushX = safeX - centerX;
  const pushZ = safeZ - centerZ;
  outPush.x += pushX;
  outPush.z += pushZ;
  return pushX !== 0 || pushZ !== 0;
}
