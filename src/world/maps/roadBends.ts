import { roadIntersection, type RoadPoint } from './roadEndpoints.ts';

type Route = readonly RoadPoint[];

function containsRoadJunction(paths: readonly Route[], route: number,
  start: RoadPoint, bend: RoadPoint, end: RoadPoint): boolean {
  for (let other = 0; other < paths.length; other++) {
    if (other === route) continue;
    for (let j = 1; j < paths[other].length; j++) {
      const p = paths[other][j - 1], q = paths[other][j];
      if (roadIntersection(start, bend, p, q) !== null || roadIntersection(bend, end, p, q) !== null) return true;
    }
  }
  return false;
}

/** Authoring-only, bounded turning arcs. Shared junctions and the first/last
 * approach segments retain their exact seats. Unlike a spline through the
 * whole route, this cannot overshoot a cliff or bow a straight bridge span.
 * Radius is the maximum distance trimmed along either incoming leg, in metres.
 */
export function roundRoadBends(paths: readonly Route[], radius = 24): RoadPoint[][] {
  if (!Number.isFinite(radius) || radius < 0 || radius > 32) throw new Error('Road bend radius must be 0..32m');
  return paths.map((path, route) => {
    const result: RoadPoint[] = [];
    for (let i = 0; i < path.length; i++) {
      const b = path[i];
      // Preserve border grading's authored tangent, and all short access paths.
      if (!radius || i < 2 || i >= path.length - 2 || Math.max(Math.abs(b[0]), Math.abs(b[1])) > 390) {
        result.push(b); continue;
      }
      const a = path[i - 1], c = path[i + 1];
      const incoming = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const outgoing = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (!incoming || !outgoing) { result.push(b); continue; }
      const ux = (b[0] - a[0]) / incoming, uz = (b[1] - a[1]) / incoming;
      const vx = (c[0] - b[0]) / outgoing, vz = (c[1] - b[1]) / outgoing;
      const dot = ux * vx + uz * vz;
      // Tiny bends are already gentle; reversals need an authored route fix.
      if (dot > .985 || dot < -.42) { result.push(b); continue; }
      const trim = Math.min(radius, incoming * .25, outgoing * .25);
      const start: RoadPoint = [b[0] - ux * trim, b[1] - uz * trim];
      const end: RoadPoint = [b[0] + vx * trim, b[1] + vz * trim];
      if (containsRoadJunction(paths, route, start, b, end)) { result.push(b); continue; }
      // Four short chords remove the single abrupt steering change. The curve
      // stays inside the original corner's triangle; the grading owner sees
      // the same resulting route as paint, collision and roadside placement.
      for (let step = 0; step <= 4; step++) {
        const t = step / 4, s = 1 - t;
        result.push([s * s * start[0] + 2 * s * t * b[0] + t * t * end[0],
          s * s * start[1] + 2 * s * t * b[1] + t * t * end[1]]);
      }
    }
    return result;
  });
}
