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
