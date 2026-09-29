type Road = [number, number][];
/** Follow the eastern wadi around the mesa; keep village frontage samples and
 * the existing two-road graph. Same node count, no added live terrain work. */
export function routeDesertRoads(mapId: string | undefined, roads: Road[]): void {
  if (mapId !== 'desert') return;
  const offsets = [[-512, 0], [-448, 0], [-352, 100], [-288, 125], [-192, 140],
    [-96, 150], [0, 0], [96, 0], [160, 80], [240, 130], [320, 180], [416, 210], [512, 210]];
  for (const node of roads[0]) {
    for (let i = 1; i < offsets.length; i++) {
      const a = offsets[i - 1], b = offsets[i];
      if (node[1] > b[0]) continue;
      const t = (node[1] - a[0]) / (b[0] - a[0]);
      node[0] += (a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t));
      break;
    }
  }
}
/** Grade outwards from the unchanged village crossing. A 14% construction
 * profile leaves raster/pad headroom below the 18% measured-road budget.
 * Only the road plane moves; distant mesa shape and material remain intact. */
export function gradeDesertRoads(mapId: string | undefined, roads: readonly Road[], elevations: number[][]): void {
  if (mapId !== 'desert') return;
  for (let r = 0; r < roads.length; r++) {
    const nodes = roads[r], row = elevations[r];
    for (const step of [-1, 1]) {
      const centre = desertCrossingAnchor(nodes, r, step);
      gradeDesertApproach(nodes, row, centre, step);
    }
  }
}

function desertCrossingAnchor(nodes: Road, r: number, step: number): number {
  // Keep the full crossing platform, not only one nearest vertex: a
  // rising arm inside the intersection would disagree with the other road.
  const axis = r === 0 ? 1 : 0;
  const fixed = r === 0 ? (step < 0 ? 0 : 96) : (step < 0 ? -64 : 96);
  let centre = 0;
  for (let i = 1; i < nodes.length; i++) if (Math.abs(nodes[i][axis] - fixed)
    < Math.abs(nodes[centre][axis] - fixed)) centre = i;
  return centre;
}

function gradeDesertApproach(nodes: Road, row: number[], centre: number, step: number): void {
  const end = step < 0 ? 0 : nodes.length - 1;
  let total = 0;
  for (let i = centre + step; i >= 0 && i < nodes.length; i += step) {
    const j = i - step;
    total += Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
  }
  const endLevel = row[end];
  const grade = Math.max(.14, Math.abs(endLevel - row[centre]) / total);
  let travelled = 0;
  for (let i = centre + step; i >= 0 && i < nodes.length; i += step) {
    const j = i - step;
    const length = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
    travelled += length;
    const rise = length * grade, remainingRise = Math.max(0, total - travelled) * grade;
    // Anticipate the fixed boundary height instead of cutting a deep slot
    // through its rim after following a low valley to the last station.
    const low = Math.max(row[j] - rise, endLevel - remainingRise);
    const high = Math.min(row[j] + rise, endLevel + remainingRise);
    row[i] = Math.max(low, Math.min(high, row[i]));
  }
}

/** Blend only overlapping outer earthworks. The road core keeps its surveyed
 * plane; this construction-only bake adds no live queries or retained grids. */
export function blendDesertRoadBanks(mapId: string | undefined, roads: readonly Road[], elevations: number[][],
  distances: Float32Array, grid: Float32Array, size: number, mapSize: number, cx: number, cz: number): void {
  if (mapId !== 'desert') return;
  const cell = mapSize / (size - 1), half = mapSize / 2;
  for (let i = 0; i < grid.length; i++) {
    if (distances[i] <= 14 || distances[i] >= 104) continue;
    const x = (i % size) * cell - half, z = Math.floor(i / size) * cell - half;
    const radius = Math.hypot(x - cx, z - cz);
    if (radius <= 54) continue;
    let sum = 0, weight = 0, contributors = 0;
    for (let r = 0; r < roads.length; r++) {
      const sample = desertBankPlane(roads[r], elevations[r], x, z);
      const d = Math.sqrt(sample[0]);
      if (d >= 104) continue;
      const w = Math.pow((104 - d) / Math.max(.01, d - 14), 4);
      sum += sample[1] * w; weight += w; contributors++;
    }
    if (contributors < 2) continue;
    const t = Math.min(1, (radius - 54) / 24);
    grid[i] += (sum / weight - grid[i]) * t * t * (3 - 2 * t);
  }
}

function desertBankPlane(nodes: Road, row: number[], x: number, z: number): [number, number] {
  let distance = Infinity, height = 0;
  for (let s = 1; s < nodes.length; s++) {
    const a = nodes[s - 1], b = nodes[s], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = (x - a[0] - t * dx) ** 2 + (z - a[1] - t * dz) ** 2;
    if (d < distance) { distance = d; height = row[s - 1] + (row[s] - row[s - 1]) * t; }
  }
  return [distance, height];
}
