// Shared hinge math for trees and destructible props.
//
// Three.js uses right-handed positive rotations. For an upright object's +Y
// axis to rotate toward an XZ impact direction (dx, dz), the horizontal hinge
// axis must be direction x up: (dz, 0, -dx). Using the opposite cross product
// makes the object fall back toward the rammer.

/**
 * Set `out` to the normalized hinge axis that tips +Y toward (dx, 0, dz).
 * A zero direction gets the deterministic +Z fall axis.
 * @param {{set:function(number,number,number):*}} out
 * @param {number} dx
 * @param {number} dz
 * @returns {*} out
 */
export function setToppleAxis(out, dx, dz) {
  const l = Math.hypot(dx, dz);
  if (l > 1e-8) return out.set(dz / l, 0, -dx / l);
  return out.set(1, 0, 0);
}

/**
 * Find the final hinge angle that lays an upright object onto the terrain.
 * Sampling the fall line keeps poles/trees from hovering over level ground
 * and lets them naturally stop earlier on an uphill bank or lean farther
 * into a downhill one.
 *
 * @param {{getHeightAt:function(number,number):number}} heightField
 * @param {number} x base world x
 * @param {number} y base world y
 * @param {number} z base world z
 * @param {number} dx fall direction x
 * @param {number} dz fall direction z
 * @param {number} height object height in metres
 * @param {number} [radius=0.1] approximate resting radius in metres
 * @returns {number} positive hinge rotation in radians
 */
export function settledToppleAngle(heightField, x, y, z, dx, dz, height, radius = 0.1) {
  const h = Math.max(0.25, Number(height) || 0.25);
  const r = Math.max(0.015, Number(radius) || 0.1);
  const l = Math.hypot(dx, dz);
  const ux = l > 1e-8 ? dx / l : 0;
  const uz = l > 1e-8 ? dz / l : 1;
  const sample = heightField && typeof heightField.getHeightAt === 'function'
    ? (sx, sz) => heightField.getHeightAt(sx, sz) : () => y;
  let needCos = -0.24; // allow a downhill rest up to about 104 degrees
  // Ignore the flared hinge root and solve against the useful trunk/post run.
  for (const f of [0.45, 0.7, 1]) {
    const groundDelta = sample(x + ux * h * f, z + uz * h * f) - y;
    needCos = Math.max(needCos, (groundDelta + r) / (h * f));
  }
  needCos = Math.max(-0.24, Math.min(0.44, needCos));
  return Math.acos(needCos);
}
