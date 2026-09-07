// Source-measured circular bearing step and the inclined rear casting floor.
// The two scalar circle bounds are not a replacement for the turret yaw datum.
export function chieftain10CastFloor(z: number, width: number): [number, number][] {
  const radius = 1.37645, centerZ = .614026;
  const circle = radius * radius - (z - centerZ) ** 2;
  const half = Math.sqrt(Math.max(0, circle));
  const allInside = half >= width - .006;
  const hasStep = circle > 0 && !allInside;
  const q = hasStep ? Math.min(width - .006, half) : width * .60;
  const outerQ = q + .003;
  const middle = Math.max(outerQ + .001, Math.min(width - .001, .766));
  const plane = (x: number): number => Math.max(1.578237,
    1.719639 - .088927 * z + Math.max(0, Math.abs(x) - .766) * .22346);
  const outside = (x: number): number => allInside ? 1.578237 : plane(x);
  const bottom = circle > 0 ? 1.578237 : plane(0);
  return [[-width, outside(width)], [-middle, outside(middle)],
    [-outerQ, outside(outerQ)], [-q, bottom], [q, bottom],
    [outerQ, outside(outerQ)], [middle, outside(middle)], [width, outside(width)]];
}
