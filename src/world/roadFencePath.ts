type Point = readonly [number, number];
/** Offset every chord between two physical dressing stations. Shared endpoints
 * use the same neighbouring road tangents, so adjoining fence runs meet. */
export function roadFencePath(road: readonly Point[], first: number, last: number, offset: number): Point[] {
  const result: Point[] = [];
  for (let i = first; i <= last; i++) {
    const p = road[i], a = road[Math.max(0, i - 1)], b = road[Math.min(road.length - 1, i + 1)];
    const before = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const after = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ax = before > 1e-8 ? (p[0] - a[0]) / before : (b[0] - p[0]) / after;
    const az = before > 1e-8 ? (p[1] - a[1]) / before : (b[1] - p[1]) / after;
    const bx = after > 1e-8 ? (b[0] - p[0]) / after : ax;
    const bz = after > 1e-8 ? (b[1] - p[1]) / after : az;
    const sum = Math.hypot(ax + bx, az + bz);
    if (!Number.isFinite(sum) || sum < 1e-8) { result.push(p); continue; }
    const nx = -(az + bz) / sum, nz = (ax + bx) / sum;
    const miter = offset / Math.max(0.5, nx * -az + nz * ax);
    result.push([p[0] + nx * miter, p[1] + nz * miter]);
  }
  return result;
}

export function fencePathSampler(points: readonly Point[]): { length: number; at(distance: number): Point } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(
    points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = lengths[lengths.length - 1];
  return { length, at(distance) {
    if (distance <= 0) return points[0];
    if (distance >= length) return points[points.length - 1];
    let i = 1; while (lengths[i] < distance) i++;
    const t = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
    return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
  } };
}
