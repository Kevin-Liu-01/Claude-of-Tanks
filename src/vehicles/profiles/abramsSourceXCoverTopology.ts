// Invocation-local shared cuts for a native skin partition. No spatial weld,
// borrowed geometry, persistent cache, or inferred proximity is involved.
export type CoverPoint = readonly [number, number, number];
const pointKey = (p: CoverPoint): string => p.join(',');
const compare = (a: CoverPoint, b: CoverPoint): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const edgeKey = (a: CoverPoint, b: CoverPoint): string =>
  compare(a, b) <= 0 ? `${pointKey(a)}/${pointKey(b)}` : `${pointKey(b)}/${pointKey(a)}`;

export function createCoverCuts(): {
  record(a: CoverPoint, b: CoverPoint, cut: CoverPoint): void;
  expand(polygon: readonly CoverPoint[]): CoverPoint[];
} {
  const cuts = new Map<string, Map<string, CoverPoint>>();
  function record(a: CoverPoint, b: CoverPoint, cut: CoverPoint): void {
    const key = pointKey(cut);
    if (key === pointKey(a) || key === pointKey(b)) return;
    const edge = edgeKey(a, b), entries = cuts.get(edge) ?? new Map<string, CoverPoint>();
    entries.set(key, cut); cuts.set(edge, entries);
  }
  function edge(a: CoverPoint, b: CoverPoint): CoverPoint[] {
    const entries = cuts.get(edgeKey(a, b));
    if (!entries?.size) return [a];
    const middle = [...entries.values()].sort(compare);
    if (compare(a, b) > 0) middle.reverse();
    const chain = [a, ...middle, b], result: CoverPoint[] = [];
    for (let i = 0; i + 1 < chain.length; i++) result.push(...edge(chain[i], chain[i + 1]));
    return result;
  }
  return { record, expand: polygon => polygon.flatMap((a, i) => edge(a, polygon[(i + 1) % polygon.length])) };
}

type PlanPoint = readonly [number, number];
function turn(a: PlanPoint, b: PlanPoint, c: PlanPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Ear clipping retains every actual Float32 boundary vertex. A plain fan
 * can silently discard a collinear first-edge cut and recreate a T-junction. */
export function triangulateCoverPolygon(points: readonly CoverPoint[]): CoverPoint[][] {
  const stored = points.map(([x, y, z]): CoverPoint => [Math.fround(x), Math.fround(y), Math.fround(z)]);
  const polygon = stored.filter((p, i) => pointKey(p) !== pointKey(stored[(i + stored.length - 1) % stored.length]));
  if (polygon.length < 3) return [];
  const normal = [0, 0, 0];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
    normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
    normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const axis = normal.reduce((best, n, i) => Math.abs(n) > Math.abs(normal[best]) ? i : best, 0);
  if (!normal[axis]) return [];
  const project = (p: CoverPoint): PlanPoint => axis === 0 ? [p[1], p[2]] : axis === 1 ? [p[2], p[0]] : [p[0], p[1]];
  const sign = Math.sign(normal[axis]), indices = polygon.map((_, i) => i), result: CoverPoint[][] = [];
  while (indices.length > 3) {
    let found = false;
    for (let i = 0; i < indices.length; i++) {
      const ids = [indices[(i + indices.length - 1) % indices.length], indices[i], indices[(i + 1) % indices.length]];
      const [a, b, c] = ids.map(j => project(polygon[j]));
      if (turn(a, b, c) * sign <= 0) continue;
      // An ear diagonal may not pass through any retained boundary point.
      if (indices.some(j => !ids.includes(j) && (() => {
        const p = project(polygon[j]);
        return turn(a, b, p) * sign >= 0 && turn(b, c, p) * sign >= 0 && turn(c, a, p) * sign >= 0;
      })())) continue;
      result.push(ids.map(j => polygon[j])); indices.splice(i, 1); found = true; break;
    }
    if (!found) throw new Error('ERA cover polygon cannot preserve its exact boundary');
  }
  const final = indices.map(i => polygon[i]);
  if (turn(project(final[0]), project(final[1]), project(final[2])) !== 0) result.push(final);
  return result;
}

