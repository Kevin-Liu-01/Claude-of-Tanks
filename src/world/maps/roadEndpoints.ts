import type { MapId } from './catalog.ts';
import type { TerrainMapConfig } from '../terrain.ts';

/** Added approach nodes guide the new road cuts. Seeded vegetation admission
 * uses the original interior paths so those additions cannot shift the random
 * sequence across an entire forest. The sampler is construction-only. */
export function originalRoadPlacementConfig(cfg: TerrainMapConfig | null): TerrainMapConfig | null {
  if (cfg?.id !== 'alpine' && cfg?.id !== 'reservoir') return cfg;
  const roads = cfg.terrain?.roads;
  if (!roads || roads === 'country' || !roads.paths) return cfg;
  const paths = roads.paths.slice();
  if (cfg.id === 'alpine') {
    for (let i = 0; i < 3; i++) paths[i] = paths[i].slice(1, -1);
  } else {
    paths[0] = paths[0].slice(1);
    paths[4] = paths[4].slice(3, -2);
  }
  return { ...cfg, terrain: { ...cfg.terrain, roads: { ...roads, paths } } };
}

export type RoadPoint = readonly [number, number];
export type RoadEndpoint = 'boundary' | 'loop' | 'shore' | { junction: number; at?: RoadPoint };
export type RoadEnds = readonly [RoadEndpoint, RoadEndpoint];
const through: RoadEnds = ['boundary', 'boundary'];
const join = (start: number, end: number): RoadEnds => [{ junction: start }, { junction: end }];

/** Authored endpoint ownership, in createLayout road order (grid before paths).
 * Crossbars end AT their named outer spines; through routes leave the terrain
 * instead of stopping on its grass apron. These are design decisions, not a
 * nearest-road heuristic. Coastal's two connected beach approaches are the
 * sole shore termini; Caldera's first road is a genuine closed mining loop.
 */
export const ROAD_ENDPOINT_INTENTS: Readonly<Record<MapId, readonly RoadEnds[]>> = {
  verdant: [through, through], desert: [through, through], winter: [through, through],
  urban: Array.from({ length: 8 }, () => through),
  coastal: [through, through, ['boundary', 'shore'], ['boundary', 'shore']],
  autumn: [through, through], steppe: [through, through],
  railyard: Array.from({ length: 6 }, () => through),
  frontier: [through, through, through, join(0, 2)],
  fjord: [through, through, through, join(0, 2), join(0, 2)],
  // The two southwest approaches converge before the border: one shared
  // exit avoids intersecting unequal-height parallel cuts in the narrow rim.
  delta: [[{ junction: 2, at: [-466.54, -404] }, 'boundary'], through, through, through, join(2, 3)],
  badlands: [through, through, through, join(0, 2), join(0, 2)],
  monsoon: [through, through, through, join(0, 2), join(0, 2)],
  alpine: [through, through, through, join(0, 2), join(0, 2)],
  caldera: [['loop', 'loop'], through, through, join(1, 2), join(1, 2)],
  foundry: [...Array.from({ length: 6 }, () => through), join(0, 2), join(0, 2), join(0, 2)],
  ruinspires: Array.from({ length: 12 }, () => through),
  blackglass: Array.from({ length: 6 }, () => through),
  titan_gorge: [through, through, through, join(0, 2), join(0, 1)],
  skybridge: [through, through, through, join(0, 2), join(0, 1)],
  polders: [join(1, 3), through, through, through, join(1, 3)],
  copper_mesa: [through, through, through, through, join(1, 3)],
  airfield: [through, through, through, through, join(2, 3), join(2, 3)],
  oasis: [through, through, through, join(1, 2), join(1, 2)],
  whiteout: [join(1, 3), through, through, through, join(1, 3)],
  orchard: [through, through, through, join(1, 2), join(1, 2)],
  longleaf: [join(1, 3), through, through, through, join(1, 3)],
  mangrove: [through, through, through, join(0, 2), join(0, 2)],
  saltwind: [through, through, through, join(0, 2), join(0, 2)],
  reservoir: [['boundary', { junction: 4 }], join(0, 4), join(0, 1), join(0, 1), through],
};

/** Segment intersection, including touching and collinear overlap. The
 * returned fraction belongs to AB; a crossing need not be a sampled vertex.
 */
export function roadIntersection(a: RoadPoint, b: RoadPoint, c: RoadPoint, d: RoadPoint): number | null {
  const dx = b[0] - a[0], dz = b[1] - a[1], ex = d[0] - c[0], ez = d[1] - c[1];
  const qx = c[0] - a[0], qz = c[1] - a[1], cross = dx * ez - dz * ex;
  if (Math.abs(cross) > 1e-9) {
    const t = (qx * ez - qz * ex) / cross, u = (qx * dz - qz * dx) / cross;
    return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8
      ? Math.max(0, Math.min(1, t)) : null;
  }
  if (Math.abs(qx * dz - qz * dx) > 1e-7) return null;
  const length2 = dx * dx + dz * dz;
  if (length2 < 1e-12) return null;
  const t0 = (qx * dx + qz * dz) / length2;
  const t1 = ((d[0] - a[0]) * dx + (d[1] - a[1]) * dz) / length2;
  const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
  return lo <= hi + 1e-8 ? Math.min(1, lo) : null;
}

function sampleExtension(a: RoadPoint, b: RoadPoint): [number, number][] {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 32));
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
}

function boundaryPoint(line: readonly RoadPoint[], half: number): [number, number] {
  const a = line[0], b = line[1], dx = a[0] - b[0], dz = a[1] - b[1];
  const tx = dx === 0 ? Infinity : ((dx > 0 ? half : -half) - a[0]) / dx;
  const tz = dz === 0 ? Infinity : ((dz > 0 ? half : -half) - a[1]) / dz;
  const t = Math.min(tx, tz);
  if (!Number.isFinite(t) || t < -1e-8) throw new Error('Road boundary bearing must point out of the map');
  return [Math.max(-half, Math.min(half, a[0] + dx * t)), Math.max(-half, Math.min(half, a[1] + dz * t))];
}

function trimToJunction(line: [number, number][], target: readonly RoadPoint[]): [number, number][] | null {
  // Search inward from the terminal. Trimming removes only the naked tail
  // beyond the first junction, never a new diagonal through an obstacle.
  for (let i = 0; i < line.length - 1; i++) {
    let first = Infinity;
    for (let j = 0; j < target.length - 1; j++) {
      const t = roadIntersection(line[i], line[i + 1], target[j], target[j + 1]);
      if (t !== null) first = Math.min(first, t);
    }
    if (first === Infinity) continue;
    const a = line[i], b = line[i + 1];
    const point: [number, number] = [a[0] + (b[0] - a[0]) * first, a[1] + (b[1] - a[1]) * first];
    // Keep an exactly coincident original node's identity for dressing station
    // provenance. Object.is also preserves the previous arithmetic's signed zero.
    if (first === 0 && Object.is(point[0], a[0]) && Object.is(point[1], a[1])) return line.slice(i);
    return first > 1 - 1e-8 ? line.slice(i + 1) : [point, ...line.slice(i + 1)];
  }
  return null;
}

function completeStart(line: [number, number][], intent: RoadEndpoint,
  roads: readonly (readonly RoadPoint[])[], half: number): [number, number][] {
  if (intent === 'loop' || intent === 'shore') return line;
  if (intent === 'boundary') {
    if (Math.max(Math.abs(line[0][0]), Math.abs(line[0][1])) >= half - 1e-8) return line;
    return [...sampleExtension(boundaryPoint(line, half), line[0]), ...line];
  }
  const target = roads[intent.junction];
  if (!target) throw new Error('Road junction references a missing route');
  if (intent.at) return [...sampleExtension(intent.at, line[0]), ...line];
  // An exact authored endpoint already on its spine is left byte-identical.
  const trimmed = trimToJunction(line, target);
  if (trimmed) return trimmed;
  const extended = [boundaryPoint(line, half), ...line];
  const joined = trimToJunction(extended, target);
  if (!joined) throw new Error(`Road bearing does not reach authored junction ${intent.junction}`);
  return [...sampleExtension(joined[0], line[0]), ...line];
}

/** Construction-only completion. No RNG, height query, retained cache, shader
 * or new road type. The same resulting polylines feed client/server terrain,
 * road masks, navigation and procedural dressing. Inputs remain immutable.
 */
export function completeRoadEndpoints(mapId: string | undefined, roads: [number, number][][],
  half = 512): [number, number][][] {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return roads; // ad-hoc selftest/authoring layouts are unchanged
  if (roads.length !== intents.length) throw new Error(`${mapId}: road endpoint intent count does not match routes`);
  const portals = roads.map((road, index) => {
    let line = intents[index][0] === 'boundary' ? completeStart(road, 'boundary', roads, half) : road;
    if (intents[index][1] === 'boundary') line = completeStart(line.slice().reverse(), 'boundary', roads, half).reverse();
    return line;
  });
  return portals.map((road, index) => {
    let line = completeStart(road, intents[index][0], portals, half);
    line = completeStart(line.slice().reverse(), intents[index][1], portals, half).reverse();
    if (line.length < 2) throw new Error(`${mapId}: road ${index} has no length after junction completion`);
    return line;
  });
}

function gradePortal(elevations: number[], road: readonly RoadPoint[], anchor: RoadPoint, start: boolean): void {
  const at = road.findIndex(p => p[0] === anchor[0] && p[1] === anchor[1]);
  if (at < 0) return; // a trimmed crossbar no longer owns an outward tail
  const inward = start ? at + 1 : at - 1;
  if (inward < 0 || inward >= road.length) return;
  const p = road[inward], length = Math.hypot(p[0] - anchor[0], p[1] - anchor[1]);
  const grade = Math.max(-.12, Math.min(.12, (elevations[at] - elevations[inward]) / length));
  const step = start ? -1 : 1;
  for (let i = at + step; i >= 0 && i < road.length; i += step) {
    elevations[i] = elevations[at] + grade * Math.hypot(road[i][0] - anchor[0], road[i][1] - anchor[1]);
  }
}

/** Continue the authored road's grade through the artificial boundary berm.
 * Only newly added portal samples change: a shallow engineered cut, not a
 * road climbing the rim wall. Existing road heights still use the established
 * common smoothing/junction bake. No terrain query or extra retained grid.
 */
export function gradeRoadPortals(mapId: string | undefined, roads: readonly (readonly RoadPoint[])[],
  elevations: number[][], paths: readonly (readonly RoadPoint[])[], pathOffset: number): void {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return;
  for (let i = 0; i < paths.length; i++) {
    const route = i + pathOffset, path = paths[i];
    if (intents[route][0] !== 'loop' && intents[route][0] !== 'shore') gradePortal(elevations[route], roads[route], path[0], true);
    if (intents[route][1] !== 'loop' && intents[route][1] !== 'shore') gradePortal(elevations[route], roads[route], path[path.length - 1], false);
  }
}

/** Preserve the existing road bake before adding exits on three reviewed maps.
 * All other maps retain their previous construction order exactly. */
export function usesInheritedRoadGrades(mapId: string | undefined): boolean {
  return mapId === 'blackglass' || mapId === 'titan_gorge' || mapId === 'skybridge';
}

function sampleRoadGrade(point: RoadPoint, road: readonly RoadPoint[], elevations: readonly number[]): number {
  let best = Infinity, height = elevations[0];
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    const distance = (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dz) ** 2;
    if (distance < best) {
      best = distance;
      height = elevations[i - 1] + (elevations[i] - elevations[i - 1]) * t;
    }
  }
  return height;
}

/** Replace construction-only scalar rows; no second retained elevation grid.
 * Exact object identity preserves every inherited station, including the last.
 * New trimmed intersections interpolate the old line; boundary tails are then
 * handled by gradeRoadPortals using the inherited terminal grade. */
export function remapInheritedRoadElevations(source: readonly (readonly RoadPoint[])[],
  completed: readonly (readonly RoadPoint[])[], elevations: number[][]): void {
  for (let route = 0; route < completed.length; route++) {
    const old = elevations[route], original = source[route];
    elevations[route] = completed[route].map(point => {
      const station = original.indexOf(point);
      return station >= 0 ? old[station] : sampleRoadGrade(point, original, old);
    });
  }
}

/** Only an inserted junction endpoint takes its named spine's grade. Existing
 * stations and their original junction neighborhoods are not blended again. */
export function alignAddedRoadJunctionGrades(mapId: string | undefined,
  source: readonly (readonly RoadPoint[])[], completed: readonly (readonly RoadPoint[])[], elevations: number[][]): void {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return;
  for (let route = 0; route < completed.length; route++) for (let end = 0; end < 2; end++) {
    const intent = intents[route][end], line = completed[route], at = end ? line.length - 1 : 0;
    if (typeof intent !== 'object' || source[route].includes(line[at])) continue;
    elevations[route][at] = sampleRoadGrade(line[at], completed[intent.junction], elevations[intent.junction]);
  }
}

interface PortalGrid {
  size: number;
  mapSize: number;
  route: ArrayLike<number>;
  segment: ArrayLike<number>;
  elevation: Float32Array;
  sample(x: number, z: number): number;
}

function alignApronExit(grid: PortalGrid, road: readonly RoadPoint[], route: number,
  anchor: RoadPoint, start: boolean): void {
  const at = road.findIndex(p => p[0] === anchor[0] && p[1] === anchor[1]);
  const outside = start ? at - 1 : at + 1;
  if (at < 0 || outside < 0 || outside >= road.length) return;
  const point = road[outside], length = Math.hypot(point[0] - anchor[0], point[1] - anchor[1]);
  const ux = (point[0] - anchor[0]) / length, uz = (point[1] - anchor[1]) / length;
  const level = grid.sample(anchor[0], anchor[1]);
  const grade = Math.max(-.12, Math.min(.12,
    (level - grid.sample(anchor[0] - ux * 8, anchor[1] - uz * 8)) / 8));
  const step = grid.mapSize / (grid.size - 1), half = grid.mapSize / 2;
  for (let i = 0; i < grid.elevation.length; i++) {
    if (grid.route[i] !== route || (start ? grid.segment[i] >= at : grid.segment[i] < at)) continue;
    const x = i % grid.size * step - half, z = Math.floor(i / grid.size) * step - half;
    grid.elevation[i] = level + grade * ((x - anchor[0]) * ux + (z - anchor[1]) * uz);
  }
}

function apronExitAnchor(mapId: string | undefined, path: readonly RoadPoint[], end: number,
  onApron: (x: number, z: number) => boolean): RoadPoint | null {
  const first = end ? path.length - 1 : 0, step = end ? -1 : 1;
  const anchor = path[first];
  if (onApron(anchor[0], anchor[1])) return anchor;
  // Reservoir's reviewed normal outlet moved the old apron anchor inside
  // the authored path. Other maps keep their exact legacy ownership.
  if (mapId !== 'reservoir') return null;
  const next = path[first + step];
  if (!next) return null;
  const dx = next[0] - anchor[0], dz = next[1] - anchor[1];
  let previous = 0;
  for (let at = first + step; at >= 0 && at < path.length; at += step) {
    const point = path[at], px = point[0] - anchor[0], pz = point[1] - anchor[1];
    const along = px * dx + pz * dz;
    // An apron plane cannot be projected through a bend or reversal. Exact
    // collinearity is conservative for authored nodes, not position welding.
    if (px * dz !== pz * dx || along <= previous) return null;
    if (onApron(point[0], point[1])) return point;
    previous = along;
  }
  return null;
}

/** An apron is the final-priority road plane. Its departure must continue
 * that actual plane, not the pre-apron hill elevation underneath it. Only
 * outward route/segment-owned cells in the existing grid are touched.
 */
export function alignHardstandRoadPortals(mapId: string | undefined, roads: readonly (readonly RoadPoint[])[],
  paths: readonly (readonly RoadPoint[])[], pathOffset: number, grid: PortalGrid,
  onApron: (x: number, z: number) => boolean): void {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return;
  for (let i = 0; i < paths.length; i++) {
    const route = i + pathOffset, path = paths[i];
    for (let end = 0; end < 2; end++) {
      if (intents[route][end] !== 'boundary') continue;
      const anchor = apronExitAnchor(mapId, path, end, onApron);
      if (!anchor) continue;
      alignApronExit(grid, roads[route], route, anchor, !end);
    }
  }
}

function roadsTouch(a: readonly RoadPoint[], b: readonly RoadPoint[]): boolean {
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    if (roadIntersection(a[i - 1], a[i], b[j - 1], b[j]) !== null) return true;
  }
  return false;
}

/** Diagnostic topology, not a per-frame navigation cache. */
export function roadNetworkComponentCount(roads: readonly (readonly RoadPoint[])[]): number {
  const visited = new Set<number>();
  let count = 0;
  for (let root = 0; root < roads.length; root++) {
    if (visited.has(root)) continue;
    count++; visited.add(root);
    const pending = [root];
    while (pending.length) {
      const current = pending.pop()!;
      for (let i = 0; i < roads.length; i++) {
        if (visited.has(i) || !roadsTouch(roads[current], roads[i])) continue;
        visited.add(i); pending.push(i);
      }
    }
  }
  return count;
}
