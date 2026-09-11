import { ROAD_ENDPOINT_INTENTS, type RoadPoint } from './roadEndpoints.ts';
import type { MapId } from './catalog.ts';

function smooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Fjord's two northern added approaches overlap at the border. A shared
 * z-aligned plane removes nearest-route elevation disagreement throughout
 * that overlap, not just at the final nodes. The 398..430 tie-in changes
 * existing road height support deliberately; XY/station ordinals stay exact.
 * Run after ordinary smoothing/junctions and before the elevation raster.
 */
export function alignFjordNorthernRoadGrades(mapId: string | undefined,
  roads: readonly (readonly RoadPoint[])[], elevations: number[][]): void {
  if (mapId !== 'fjord') return;
  const a = roads[1], b = roads[2];
  const ai = a.length - 1, bi = b.length - 1;
  if (a[ai][1] !== 512 || b[bi][1] !== 512
    || Math.abs(a[ai][0] - b[bi][0]) >= 14) throw new Error('Fjord northern grade ownership changed');
  alignNorthernRoadPlane(roads, elevations);
}

function hasRoadAnchor(nodes: readonly RoadPoint[], x: number, z: number): boolean {
  for (const node of nodes) if (node[0] === x && node[1] === z) return true;
  return false;
}

/** Copper's northern roads 1/2 disagree across their nearest-route boundary.
 * Reuse Fjord's bounded common-z grade throughout the 430..512 rim, with one
 * existing 32m station band for the tie-in. This deliberately changes road
 * heights north of398, not XY, stations, the quarry, or any live query/grid.
 * Incomplete historical layouts must omit this completed-exit-owned call.
 */
export function alignCopperNorthernRoadGrades(mapId: string | undefined,
  roads: readonly (readonly RoadPoint[])[], elevations: number[][]): void {
  if (mapId !== 'copper_mesa') return;
  const a = roads[1], b = roads[2];
  const ae = a?.[a.length - 1], be = b?.[b.length - 1];
  if (!ae || !be || ae[1] !== 512 || be[1] !== 512
    || !hasRoadAnchor(a, -72, 462) || !hasRoadAnchor(b, 4, 458)
    || Math.abs(ae[0] - (-72 + 98 * 50 / 178)) > 1e-9
    || Math.abs(be[0] - (4 + 48 * 54 / 268)) > 1e-9) {
    throw new Error('Copper northern grade ownership changed');
  }
  alignNorthernRoadPlane(roads, elevations);
}

function alignNorthernRoadPlane(roads: readonly (readonly RoadPoint[])[], elevations: number[][]): void {
  const a = roads[1], b = roads[2], ea = elevations[1], eb = elevations[2];
  const ai = a.length - 1, bi = b.length - 1;
  const gradeA = (ea[ai] - ea[ai - 1]) / (a[ai][1] - a[ai - 1][1]);
  const gradeB = (eb[bi] - eb[bi - 1]) / (b[bi][1] - b[bi - 1][1]);
  const grade = Math.max(-.12, Math.min(.12, (gradeA + gradeB) * .5));
  const level = (ea[ai] + eb[bi]) * .5;
  for (let route = 1; route <= 2; route++) {
    const nodes = roads[route], row = elevations[route];
    for (let index = 0; index < nodes.length; index++) {
      const z = nodes[index][1];
      if (z <= 398) continue;
      const target = level + (z - 512) * grade;
      row[index] = z >= 430 ? target : row[index] + (target - row[index]) * smooth(398, 430, z);
    }
  }
}

/** Explicit policy only; callers choose when to use it during construction. */
export function usesBoundedRoadShoulders(mapId: string | undefined): boolean {
  return mapId === 'alpine' || mapId === 'reservoir' || mapId === 'monsoon'
    || mapId === 'blackglass' || mapId === 'titan_gorge' || mapId === 'skybridge'
    // The current Redrock canyon has sheer relief outside its road bed. Its
    // added exits need the same finite earthwork apron as the tall-rim maps.
    || mapId === 'badlands';
}

/** The maximum-axis radius of a segment can reach its minimum between the
 * endpoints, where x=z or x=-z. Reservoir's oblique exit does exactly this.
 * Construction scalars only; checking endpoint radii would miss the approach.
 */
export function minimumRoadSegmentRadius(a: RoadPoint, b: RoadPoint): number {
  let radius = Math.min(Math.max(Math.abs(a[0]), Math.abs(a[1])),
    Math.max(Math.abs(b[0]), Math.abs(b[1])));
  const dx = b[0] - a[0], dz = b[1] - a[1];
  for (let sign = -1; sign <= 1; sign += 2) {
    const t = (sign * a[1] - a[0]) / (dx - sign * dz);
    if (t > 0 && t < 1) radius = Math.min(radius,
      Math.max(Math.abs(a[0] + dx * t), Math.abs(a[1] + dz * t)));
  }
  return radius;
}

function addedBoundary(anchor: RoadPoint, terminal: RoadPoint, half: number): boolean {
  return (anchor[0] !== terminal[0] || anchor[1] !== terminal[1])
    && Math.max(Math.abs(anchor[0]), Math.abs(anchor[1])) < half;
}

function minimumAddedApproachRadius(road: readonly RoadPoint[], anchor: RoadPoint, end: number): number {
  const at = road.findIndex(p => p[0] === anchor[0] && p[1] === anchor[1]);
  if (at < 0) throw new Error('Added boundary approach lost its authored anchor');
  const step = end ? 1 : -1;
  let radius = Infinity;
  for (let i = at; i + step >= 0 && i + step < road.length; i += step) {
    radius = Math.min(radius, minimumRoadSegmentRadius(road[i], road[i + step]));
  }
  return radius;
}

/** Only the reviewed Alpine/Reservoir pilot admits road shoulders farther
 * inward. Other maps keep the original430 opening; no added pass means
 * no grading. This replaces the previous enable scalar, not a retained index.
 */
export function roadBorderCorridorStart(mapId: string | undefined,
  roads: readonly (readonly RoadPoint[])[], paths: readonly (readonly RoadPoint[])[],
  pathOffset: number, mapSize: number): number | null {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return null;
  const half = mapSize / 2, inward = mapId === 'alpine' || mapId === 'reservoir';
  let start: number | null = null;
  for (let i = 0; i < paths.length; i++) for (let end = 0; end < 2; end++) {
    if (intents[i + pathOffset][end] !== 'boundary') continue;
    const path = paths[i], road = roads[i + pathOffset];
    const anchor = end ? path[path.length - 1] : path[0];
    const terminal = end ? road[road.length - 1] : road[0];
    if (!addedBoundary(anchor, terminal, half)) continue;
    const candidate = inward ? minimumAddedApproachRadius(road, anchor, end) - 32 : half - 82;
    start = Math.min(start ?? candidate, candidate);
  }
  return start;
}

function stampPortal(corridor: Float32Array, size: number, mapSize: number,
  anchor: RoadPoint, inward: RoadPoint, width: number, border: number, fullWidth: boolean): void {
  const half = mapSize / 2, step = mapSize / (size - 1);
  const dx = anchor[0] - inward[0], dz = anchor[1] - inward[1];
  const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
  if (!length) throw new Error('Degenerate road border corridor');
  // Skybridge's tall bank needs the full smooth transition, not a redundant
  // constant-CW core. Pavement independently owns its 3.8m flat road surface.
  // Same support/end tangents; the mask derivative bound is 1.5/68, not 1.5/62.
  const coreWidth = fullWidth ? 0 : 6;
  for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) {
    const x = ix * step - half, z = iz * step - half;
    const radius = Math.max(Math.abs(x), Math.abs(z));
    // Leave a cell guard at the declared opening. Bilinear support cannot
    // leak into the excluded inner square; radial admission avoids a hard ring.
    if (radius <= border + step) continue;
    const along = (x - anchor[0]) * ux + (z - anchor[1]) * uz;
    const across = Math.abs((x - anchor[0]) * uz - (z - anchor[1]) * ux);
    if (along <= -32 || across >= width) continue;
    const weight = smooth(border + step, border + 32, radius)
      * smooth(-32, 16, along) * (1 - smooth(coreWidth, width, across));
    const at = iz * size + ix;
    corridor[at] = Math.max(corridor[at], weight);
  }
}

/** Construction-only landscape authoring in the existing corridor grid.
 * True road distance/elevation, road paint and station ordinals are untouched.
 * The returned scalar is the smooth-admission start. Bounded stamps cap at64m,
 * except Skybridge's one-cell68m construction transition. Its live road-plane
 * distance support remains64m. Other maps retain their exact prior stamp.
 */
export function stampRoadBorderCorridors(mapId: string | undefined,
  roads: readonly (readonly RoadPoint[])[], paths: readonly (readonly RoadPoint[])[],
  pathOffset: number, rimHeight: number, corridor: Float32Array, size: number, mapSize: number): number | null {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  const start = roadBorderCorridorStart(mapId, roads, paths, pathOffset, mapSize);
  if (start === null) return null;
  const half = mapSize / 2;
  // Tall-rim and dense-exit maps grade a bounded road bank, not the whole
  // deployment-CW band. All other map policies retain their prior width.
  const stampLimit = mapId === 'skybridge' ? 68 : 64;
  // Redrock's authored canyon replaces the synthetic rim (rimHeight=0).
  // Its actual rock bank still needs the full finite 64 m exit apron.
  const width = mapId === 'badlands' ? 64 : Math.min(usesBoundedRoadShoulders(mapId) ? stampLimit : Infinity,
    Math.max(32, 6 + Math.abs(rimHeight) * 2.4));
  for (let i = 0; i < paths.length; i++) for (let end = 0; end < 2; end++) {
    if (intents[i + pathOffset][end] !== 'boundary') continue;
    const path = paths[i], road = roads[i + pathOffset];
    const anchor = end ? path[path.length - 1] : path[0];
    const terminal = end ? road[road.length - 1] : road[0];
    if (!addedBoundary(anchor, terminal, half)) continue;
    stampPortal(corridor, size, mapSize, anchor, end ? path[path.length - 2] : path[1], width, start, mapId === 'skybridge');
  }
  return start;
}
