// Historical analytic/indexed shoulder implementation from fd2d3ff3f.
// Test oracle only: current terrain uses the sampled road-border corridor.
// Keep arithmetic unchanged so historical regressions remain reproducible;
// do not import this fixture into production terrain or authoring modules.
import { ROAD_ENDPOINT_INTENTS, type RoadPoint } from '../maps/roadEndpoints.ts';
import type { MapId } from '../maps/catalog.ts';

function portalShoulderHeight(path: readonly RoadPoint[], end: number, x: number, z: number,
  height: number, width: number, elevation: (x: number, z: number) => number): number {
  const anchor = end ? path[path.length - 1] : path[0];
  if (Math.max(Math.abs(anchor[0]), Math.abs(anchor[1])) >= 512) return height;
  const inward = end ? path[path.length - 2] : path[1];
  const dx = anchor[0] - inward[0], dz = anchor[1] - inward[1], length2 = dx * dx + dz * dz;
  const alongDot = (x - anchor[0]) * dx + (z - anchor[1]) * dz;
  const acrossCross = (x - anchor[0]) * dz - (z - anchor[1]) * dx;
  // Most analytic queries are nowhere near an added pass. Reject those
  // using squared distances before hypot/division, with a tiny slack so the
  // original exact boundary predicates below still decide near-edge cases.
  if (alongDot < 0 && alongDot * alongDot > 1024 * length2 * (1 + 1e-12)) return height;
  if (acrossCross * acrossCross > width * width * length2 * (1 + 1e-12)) return height;
  const length = Math.hypot(dx, dz), along = alongDot / length;
  if (along <= -32) return height;
  const across = Math.abs(acrossCross) / length;
  if (across >= width) return height;
  const a = Math.max(0, Math.min(1, (along + 32) / 48));
  const plane = elevation(anchor[0] + dx / length * along, anchor[1] + dz / length * along);
  const shoulder = Math.max(0, across - 6);
  // Rounded cut/fill envelope: zero crossfall through the verge, tending
  // to a60% earth bank. Unlike a fixed-width lerp its slope is depth-bounded.
  const rise = .6 * shoulder * shoulder / (shoulder + 4);
  const target = Math.max(plane - rise, Math.min(plane + rise, height));
  // Natural terrain can still sit beyond the cut/fill envelope at the
  // bounded support edge (Reservoir's high southern saddle does). Taper the
  // correction to zero there instead of switching an arbitrary height off.
  const edge = Math.min(1, (width - across) / Math.min(32, width * .35));
  return height + (target - height) * a * a * (3 - 2 * a) * edge * edge * (3 - 2 * edge);
}

/** Grade only the added passes through the artificial rim, not pavement or
 * unrelated interior terrain. Called before liquid constraints; each pass
 * starts its smooth admission32m before the original terminal, never at an
 * abrupt square-coordinate threshold through a sloping shoulder.
 * The plane is sampled ON its portal, not from nearest-road ownership on a
 * hillside. No allocation/cache; at most12 endpoint tests per edge query.
 */
export function gradeRoadPortalShoulders(mapId: string | undefined, roads: readonly (readonly RoadPoint[])[], paths: readonly (readonly RoadPoint[])[],
  pathOffset: number, x: number, z: number, height: number, rimHeight: number,
  elevation: (x: number, z: number) => number): number {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return height;
  const width = Math.max(32, 6 + Math.abs(rimHeight) * 2.4);
  for (let i = 0; i < paths.length; i++) for (let end = 0; end < 2; end++) {
    if (intents[i + pathOffset][end] !== 'boundary') continue;
    const path = paths[i], road = roads[i + pathOffset];
    const anchor = end ? path[path.length - 1] : path[0], terminal = end ? road[road.length - 1] : road[0];
    if (anchor[0] === terminal[0] && anchor[1] === terminal[1]) continue;
    height = portalShoulderHeight(paths[i], end, x, z, height, width, elevation);
  }
  return height;
}

function portalOriginDistance2(path: readonly RoadPoint[], end: number, width: number): number {
  const a = end ? path[path.length - 1] : path[0], b = end ? path[path.length - 2] : path[1];
  const length = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ux = (a[0] - b[0]) / length, uz = (a[1] - b[1]) / length;
  // Closest point to the origin on the entire outward half-strip. Using
  // the unbounded strip is conservative even for oblique exits at map edges.
  const along = Math.max(-32, -a[0] * ux - a[1] * uz);
  const across = Math.max(-width, Math.min(width, -a[0] * uz + a[1] * ux));
  const x = a[0] + ux * along + uz * across, z = a[1] + uz * along - ux * across;
  return x * x + z * z;
}

/** Construction-only scalar: a square wholly inside the complement of every
 * added portal's support. No retained list/grid; interior analytic queries
 * skip the entire endpoint loop. The small subtraction keeps rounding safe.
 */
export function roadPortalInnerSquare(mapId: string | undefined, roads: readonly (readonly RoadPoint[])[],
  paths: readonly (readonly RoadPoint[])[], pathOffset: number, rimHeight: number): number {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return Infinity;
  const width = Math.max(32, 6 + Math.abs(rimHeight) * 2.4);
  let distance2 = Infinity;
  for (let i = 0; i < paths.length; i++) for (let end = 0; end < 2; end++) {
    if (intents[i + pathOffset][end] !== 'boundary') continue;
    const path = paths[i], road = roads[i + pathOffset];
    const a = end ? path[path.length - 1] : path[0], b = end ? road[road.length - 1] : road[0];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    distance2 = Math.min(distance2, portalOriginDistance2(path, end, width));
  }
  return Math.max(0, Math.sqrt(distance2 / 2) - 1e-7);
}

const PORTAL_STRIDE = 9;
export interface RoadPortalShoulderIndex {
  readonly data: Float64Array;
  readonly cells: Uint16Array;
  readonly width: number;
  readonly edgeWidth: number;
}

function stampPortalCells(cells: Uint16Array, data: Float64Array, at: number, bit: number, width: number): void {
  const ax = data[at], az = data[at + 1], dx = data[at + 2], dz = data[at + 3], length = data[at + 4];
  const slack = Math.max(1, Math.abs(dx), Math.abs(dz)) * 1e-7;
  for (let gz = 0; gz < 16; gz++) for (let gx = 0; gx < 16; gx++) {
    const x0 = gx * 64 - 512 - ax, z0 = gz * 64 - 512 - az, x1 = x0 + 64, z1 = z0 + 64;
    const alongMax = Math.max(x0 * dx + z0 * dz, x1 * dx + z0 * dz,
      x0 * dx + z1 * dz, x1 * dx + z1 * dz);
    const c0 = x0 * dz - z0 * dx, c1 = x1 * dz - z0 * dx;
    const c2 = x0 * dz - z1 * dx, c3 = x1 * dz - z1 * dx;
    // Linear extrema at all cell corners form a conservative broad phase.
    // Slack admits rounding-near support edges; the old exact predicates
    // below remain authoritative. False positives cost work, never geometry.
    if (alongMax < -32 * length - slack || Math.min(c0, c1, c2, c3) > width * length + slack
        || Math.max(c0, c1, c2, c3) < -width * length - slack) continue;
    cells[gz * 16 + gx] |= bit;
  }
}

function appendPortalDescriptor(values: number[], path: readonly RoadPoint[], road: readonly RoadPoint[],
  end: number, width: number): void {
  const a = end ? path[path.length - 1] : path[0], b = end ? road[road.length - 1] : road[0];
  if ((a[0] === b[0] && a[1] === b[1]) || Math.max(Math.abs(a[0]), Math.abs(a[1])) >= 512) return;
  const inward = end ? path[path.length - 2] : path[1];
  const dx = a[0] - inward[0], dz = a[1] - inward[1], length2 = dx * dx + dz * dz;
  const length = Math.hypot(dx, dz);
  if (!length) throw new Error('Degenerate road portal direction');
  values.push(a[0], a[1], dx, dz, length, 1024 * length2 * (1 + 1e-12),
    width * width * length2 * (1 + 1e-12), dx / length, dz / length);
}

/** Construction-only exact descriptor/index bake. Retains at most1376 backing
 * bytes on the current roster; no-pass maps allocate no retained index. */
export function buildRoadPortalShoulderIndex(mapId: string | undefined, roads: readonly (readonly RoadPoint[])[],
  paths: readonly (readonly RoadPoint[])[], pathOffset: number, rimHeight: number): RoadPortalShoulderIndex | null {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return null;
  const width = Math.max(32, 6 + Math.abs(rimHeight) * 2.4), values: number[] = [];
  for (let i = 0; i < paths.length; i++) for (let end = 0; end < 2; end++) {
    if (intents[i + pathOffset][end] !== 'boundary') continue;
    appendPortalDescriptor(values, paths[i], roads[i + pathOffset], end, width);
  }
  if (!values.length) return null;
  const count = values.length / PORTAL_STRIDE;
  if (count > 16) throw new Error(`${mapId}: portal candidate mask capacity exceeded`);
  const data = new Float64Array(values), cells = new Uint16Array(16 * 16);
  for (let i = 0; i < count; i++) stampPortalCells(cells, data, i * PORTAL_STRIDE, 1 << i, width);
  return { data, cells, width, edgeWidth: Math.min(32, width * .35) };
}

function indexedPortalHeight(index: RoadPortalShoulderIndex, at: number, x: number, z: number,
  height: number, elevation: (x: number, z: number) => number): number {
  const d = index.data, ax = d[at], az = d[at + 1], dx = d[at + 2], dz = d[at + 3];
  const alongDot = (x - ax) * dx + (z - az) * dz;
  if (alongDot < 0 && alongDot * alongDot > d[at + 5]) return height;
  const acrossCross = (x - ax) * dz - (z - az) * dx;
  if (acrossCross * acrossCross > d[at + 6]) return height;
  const along = alongDot / d[at + 4];
  if (along <= -32) return height;
  const across = Math.abs(acrossCross) / d[at + 4];
  if (across >= index.width) return height;
  const plane = elevation(ax + d[at + 7] * along, az + d[at + 8] * along);
  const shoulder = Math.max(0, across - 6);
  const rise = .6 * shoulder * shoulder / (shoulder + 4);
  const target = Math.max(plane - rise, Math.min(plane + rise, height));
  // Most admitted shoulders already lie inside the cut/fill envelope. Keep
  // the same IEEE result (including signed zero and Infinity - Infinity)
  // without computing two smooth tapers whose correction would be zero.
  if (target === height) return height + (target - height);
  const a = Math.max(0, Math.min(1, (along + 32) / 48));
  const edge = Math.min(1, (index.width - across) / index.edgeWidth);
  return height + (target - height) * a * a * (3 - 2 * a) * edge * edge * (3 - 2 * edge);
}

/** Inputs are already clamped by heightAt to the1024m playable chart. No
 * allocation, path/intent lookup, hypot, or changed floating-point order. */
export function gradeIndexedRoadPortalShoulders(index: RoadPortalShoulderIndex, x: number, z: number,
  height: number, elevation: (x: number, z: number) => number): number {
  const bits = index.cells[Math.min(15, (x + 512) >> 6) + Math.min(15, (z + 512) >> 6) * 16];
  return gradeSelectedRoadPortalShoulders(index, bits, x, z, height, elevation);
}

/** The live callsite already read the existing mask, and never calls this
 * for empty cells. Reuse that selection; retain original portal order. */
export function gradeSelectedRoadPortalShoulders(index: RoadPortalShoulderIndex, bits: number,
  x: number, z: number, height: number, elevation: (x: number, z: number) => number): number {
  while (bits) {
    const bit = bits & -bits;
    const at = (31 - Math.clz32(bit)) * PORTAL_STRIDE;
    height = indexedPortalHeight(index, at, x, z, height, elevation);
    bits ^= bit;
  }
  return height;
}
