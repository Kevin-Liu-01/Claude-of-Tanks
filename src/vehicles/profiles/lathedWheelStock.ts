import * as THREE from 'three';

/** A sparse authored mechanical cross-section, in wheel-local metres. */
export type AxialWheelStation = readonly [axialM: number, radiusM: number];

/** Revolve a closed physical section about the wheel's X axle.
 *
 * Callers own all radii, axial depths, tire gaps and segment budgets. This
 * primitive contributes no donor dimensions, capped disc, wheel pattern or
 * placement. Pass its fresh geometry to the native running-gear stock hooks.
 */
export function lathedWheelSection(
  section: readonly AxialWheelStation[], segments: number,
): THREE.BufferGeometry {
  if (section.length < 4 || section.length > 64
      || !Number.isInteger(segments) || segments < 8 || segments > 128)
    throw new RangeError('Wheel stock requires a sparse section and 8–128 radial segments');
  const points = section.map(([axial, radius]) => {
    if (!Number.isFinite(axial) || !Number.isFinite(radius) || radius < 0)
      throw new RangeError('Wheel stock stations must be finite with nonnegative radii');
    return new THREE.Vector2(radius, axial);
  });
  if (!points[0].equals(points[points.length - 1])) points.push(points[0].clone());
  let twiceArea = 0;
  for (let i = 1; i < points.length; i++)
    twiceArea += points[i - 1].x * points[i].y - points[i].x * points[i - 1].y;
  if (Math.abs(twiceArea) < 1e-10) throw new RangeError('Wheel stock section must enclose physical area');
  if (twiceArea < 0) points.reverse();
  return new THREE.LatheGeometry(points, segments).rotateZ(-Math.PI / 2);
}
