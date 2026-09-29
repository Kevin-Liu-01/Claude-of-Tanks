type Road = readonly (readonly [number, number])[];

function distances(road: Road): number[] {
  const result = [0];
  for (let i = 1; i < road.length; i++) result.push(result[i - 1]
    + Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]));
  return result;
}
function sample(values: readonly number[], distance: readonly number[], at: number): number {
  if (at <= 0) return values[0];
  if (at >= distance[distance.length - 1]) return values[values.length - 1];
  let lo = 0, hi = distance.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (distance[mid] < at) lo = mid; else hi = mid; }
  const t = (at - distance[lo]) / (distance[hi] - distance[lo]);
  return values[lo] + (values[hi] - values[lo]) * t;
}
/** Retain the established four-pass,32m smoothing footprint even when turning
 * arcs introduce short geometric chords. Construction only, no live queries. */
export function smoothRoadGradesByDistance(roads: readonly Road[], elevations: number[][]): void {
  for (let r = 0; r < roads.length; r++) {
    const distance = distances(roads[r]), values = elevations[r];
    for (let pass = 0; pass < 4; pass++) {
      const prev = values.slice();
      for (let i = 1; i < values.length - 1; i++) values[i] = .25 * sample(prev, distance, distance[i] - 32)
        + .5 * prev[i] + .25 * sample(prev, distance, distance[i] + 32);
    }
  }
}
type GradeKnot = { at: number; level: number };

function collectRoadPairGrades(roads: readonly Road[], elevations: number[][],
  along: number[][], knots: GradeKnot[][], a: number, b: number): void {
  const seen: [number, number][] = [];
  for (let i = 1; i < roads[a].length; i++) for (let j = 1; j < roads[b].length; j++) {
    const p = roads[a][i - 1], q = roads[a][i], r = roads[b][j - 1], s = roads[b][j];
    const dx = q[0] - p[0], dz = q[1] - p[1], ex = s[0] - r[0], ez = s[1] - r[1];
    const cross = dx * ez - dz * ex;
    if (Math.abs(cross) < 1e-8) continue;
    const rx = r[0] - p[0], rz = r[1] - p[1];
    const t = (rx * ez - rz * ex) / cross, u = (rx * dz - rz * dx) / cross;
    if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
    const x = p[0] + dx * t, z = p[1] + dz * t;
    if (seen.some(point => Math.hypot(point[0] - x, point[1] - z) < 1)) continue;
    seen.push([x, z]);
    const da = along[a][i - 1] + Math.hypot(dx, dz) * t;
    const db = along[b][j - 1] + Math.hypot(ex, ez) * u;
    const level = (sample(elevations[a], along[a], da) + sample(elevations[b], along[b], db)) * .5;
    knots[a].push({at: da, level}); knots[b].push({at: db, level});
  }
}

function applyRoadJunctionGrades(along: number[][], elevations: number[][],
  knots: GradeKnot[][], road: number): void {
  const row = knots[road].sort((a,b) => a.at - b.at);
  if (!row.length) return;
  for (let i = 0; i < elevations[road].length; i++) {
    const at = along[road][i];
    let right = row.findIndex(k => k.at >= at);
    if (right < 0) right = row.length;
    const left = row[Math.max(0,right-1)], next = row[Math.min(row.length-1,right)];
    const nearest = Math.abs(at-left.at) < Math.abs(at-next.at) ? left : next;
    const distance = Math.abs(at-nearest.at);
    const weight = Math.max(0, Math.min(1,(128-distance)/96));
    let target = nearest.level;
    if (left !== next && distance > 32) {
      const t = Math.max(0,Math.min(1,(at-left.at-32)/Math.max(1,next.at-left.at-64)));
      target = left.level+(next.level-left.level)*t;
    }
    elevations[road][i] += (target-elevations[road][i])*weight;
  }
}

/** A route pair may meet more than once (Longleaf's yard loop). Grade each
 * actual crossing, rather than blending just the closest pair of samples. */
export function blendRoadNetworkGrades(roads: readonly Road[], elevations: number[][]): void {
  const along = roads.map(distances);
  const knots: GradeKnot[][] = roads.map(() => []);
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    collectRoadPairGrades(roads, elevations, along, knots, a, b);
  }
  for (let road = 0; road < roads.length; road++) {
    applyRoadJunctionGrades(along, elevations, knots, road);
  }
}
