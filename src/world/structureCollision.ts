// Geometry-derived collision profiles for procedural structures.
//
// Building dimensions remain placement hints. Collision is instead certified
// from connected solids in the authored mesh so recesses, courtyards, open
// frames and narrow supports do not inherit one oversized rectangular box.

import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three';
import {
  convexHull2, setCompoundShape,
  type CollisionRecord, type SimpleCollisionShape,
} from './collision.ts';

const WELD_SCALE = 10_000;
const SAMPLE_GRID = 72;
const CONTACT_TOP = 1.8;
// 2026-09-19 (owner: "building hitboxes extend into empty air"): shell bands are 0.5 m tall and each carries only
// the geometry that actually lies in its height range (triangles clipped to the band), so a sloped roof is a
// staircase of strips instead of its whole projection repeated at every height; bands with identical footprints
// (plain walls) merge back into one record, so a wall costs no more than before.
const SHELL_BAND_HEIGHT = 0.5;
/** Above this many projected pieces a source is a scanned mesh: skip the quadratic pair merge, raster instead. */
const DENSE_SOURCE_LIMIT = 512;
/** Concave section loops up to this many vertices are ear-clipped into convex parts; longer ones are rastered. */
const SECTION_CLIP_VERTICES = 48;
/** Shell-band parts under this cross-section (a 14 cm post, a bracket, window joinery) are not published: they
 * never stop a shell in play and they were more than half of every dense city shard. */
const SHELL_MIN_PART_AREA = 0.02;
const IGNORED_BUCKETS = new Set(['glass', 'curtain']);

interface LocalSolid {
  bucket: string;
  minY: number;
  maxY: number;
  points: number[];
  projectedTriangles: number[][];
  /** Source triangles, flat x y z per corner, for height-clipped band projections. */
  triangles: number[][];
  /** Every face vertical or horizontal (a box, a wall, an upright cylinder): the footprint is the same at every
   * height, so shell bands reuse the whole-solid projection instead of clipping. Computed once, lazily. */
  prismatic?: boolean;
}

/** A projected footprint polygon with the local vertical extent of the geometry that produced it. */
interface RangedPolygon {
  points: number[];
  y0: number;
  y1: number;
}

/** Construction-only view; consumers must not retain geometry/component scratch. */
export interface StructureSourceSolid {
  readonly bucket: string;
  readonly minY: number;
  readonly maxY: number;
  readonly points: readonly number[];
}

interface SolidComponent {
  minY: number;
  maxY: number;
  vertices: Map<string, [number, number]>;
  projectedTriangles: number[][];
  triangles: number[][];
}

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute;

interface IndexedVertex {
  x: number;
  y: number;
  z: number;
  weldKey: string;
  projectionKey: string;
}

type StructureGeometryBuckets = Record<string, BufferGeometry[] | undefined>;

interface StructureFootprintReceipt {
  sourceParts: number;
  collisionParts: number;
  precision: number;
  recall: number;
  iou: number;
  score: number;
}

export interface StructureCollisionRuntimeBand {
  minY: number;
  maxY: number;
  parts: SimpleCollisionShape[];
}

interface StructureCollisionBand
  extends StructureCollisionRuntimeBand, StructureFootprintReceipt {}

export interface StructureCollisionRuntimeProfile {
  contact: StructureCollisionRuntimeBand;
  shell: StructureCollisionRuntimeBand[];
}

interface StructureCollisionProfile {
  contact: StructureCollisionBand;
  shell: StructureCollisionBand[];
  minimumScore: number;
}

interface StructureCollisionCertification {
  contact: StructureFootprintReceipt;
  shell: StructureFootprintReceipt[];
  minimumScore: number;
}

interface DisjointSet {
  parent: Int32Array;
  find(index: number): number;
  join(a: number, b: number): void;
}

function disjointSet(size: number): DisjointSet {
  const parent = new Int32Array(size);
  for (let index = 0; index < size; index++) parent[index] = index;
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const join = (a: number, b: number) => {
    a = find(a); b = find(b);
    if (a !== b) parent[b] = a;
  };
  return { parent, find, join };
}

function vertexKey(x: number, y: number, z: number) {
  return `${Math.round(x * WELD_SCALE)},${Math.round(y * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`;
}

function streamVertex(index: BufferAttribute | null, streamIndex: number): number {
  return index ? index.getX(streamIndex) : streamIndex;
}

function indexedVertex(
  position: PositionAttribute, vertex: number, cache: Map<number, IndexedVertex>,
): IndexedVertex {
  let cached = cache.get(vertex);
  if (!cached) {
    const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
    cached = { x, y, z, weldKey: vertexKey(x, y, z),
      projectionKey: `${Math.round(x * WELD_SCALE)},${Math.round(z * WELD_SCALE)}` };
    cache.set(vertex, cached);
  }
  return cached;
}

function joinTrianglesBySharedVertex(
  position: PositionAttribute,
  index: BufferAttribute | null,
  triangleCount: number,
  sets: DisjointSet,
  vertices: Map<number, IndexedVertex> | null = null,
): void {
  const owners = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const vertex = streamVertex(index, triangle * 3 + corner);
      const cached = vertices ? indexedVertex(position, vertex, vertices) : null;
      const key = cached ? cached.weldKey
        : vertexKey(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      const owner = owners.get(key);
      if (owner == null) owners.set(key, triangle);
      else sets.join(triangle, owner);
    }
  }
}

function collectSolidComponents(
  position: PositionAttribute,
  index: BufferAttribute | null,
  triangleCount: number,
  sets: DisjointSet,
  vertices: Map<number, IndexedVertex> | null = null,
): Map<number, SolidComponent> {
  const components = new Map<number, SolidComponent>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const root = sets.find(triangle);
    let component = components.get(root);
    if (!component) {
      component = {
        minY: Infinity,
        maxY: -Infinity,
        vertices: new Map(),
        projectedTriangles: [],
        triangles: [],
      };
      components.set(root, component);
    }
    const projected: number[] = [];
    const corners: number[] = [];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = streamVertex(index, triangle * 3 + corner);
      const cached = vertices?.get(vertex);
      const x = cached ? cached.x : position.getX(vertex);
      const y = cached ? cached.y : position.getY(vertex);
      const z = cached ? cached.z : position.getZ(vertex);
      component.minY = Math.min(component.minY, y);
      component.maxY = Math.max(component.maxY, y);
      component.vertices.set(
        cached ? cached.projectionKey : `${Math.round(x * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`,
        [x, z],
      );
      projected.push(x, z);
      corners.push(x, y, z);
    }
    component.triangles.push(corners);
    if (Math.abs(polygonArea(projected)) >= 1e-6) component.projectedTriangles.push(projected);
  }
  return components;
}

function solidsFromComponents(
  components: Iterable<SolidComponent>,
  bucket: string,
): LocalSolid[] {
  const solids: LocalSolid[] = [];
  for (const component of components) {
    if (component.maxY - component.minY < 0.025) continue;
    const points = convexHull2([...component.vertices.values()]);
    if (points.length < 6 || Math.abs(polygonArea(points)) < 0.0025) continue;
    solids.push({
      bucket,
      minY: component.minY,
      maxY: component.maxY,
      points,
      projectedTriangles: component.projectedTriangles,
      triangles: component.triangles,
    });
  }
  return solids;
}

function geometrySolids(geometry: BufferGeometry, bucket: string): LocalSolid[] {
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return [];
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  const sets = disjointSet(triangleCount);
  // Call-local and referenced-index-bounded: no geometry/version cache survives
  // mutation or another extraction. Preserve every original join and Map.set.
  const vertices = index ? new Map<number, IndexedVertex>() : null;
  joinTrianglesBySharedVertex(position, index, triangleCount, sets, vertices);
  const components = collectSolidComponents(position, index, triangleCount, sets, vertices);
  return solidsFromComponents(components.values(), bucket);
}

function polygonArea(points: number[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 2) {
    const next = (index + 2) % points.length;
    area += points[index] * points[next + 1] - points[next] * points[index + 1];
  }
  return area * 0.5;
}

function pointInPolygon(x: number, z: number, points: number[]) {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i], zi = points[i + 1];
    const xj = points[j], zj = points[j + 1];
    if (((zi > z) !== (zj > z)) &&
      x < (xj - xi) * (z - zi) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonContains(outer: number[], inner: number[]) {
  for (let index = 0; index < inner.length; index += 2) {
    if (!pointInPolygon(inner[index], inner[index + 1], outer)) return false;
  }
  return true;
}

function uniquePolygons(polygons: number[][]) {
  const sorted = polygons.slice().sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  const kept: number[][] = [];
  for (const polygon of sorted) {
    if (kept.some((points) => polygonContains(points, polygon))) continue;
    kept.push(polygon);
  }
  return kept;
}

function polygonVertexKeys(points: number[]) {
  const keys = new Set<string>();
  for (let index = 0; index < points.length; index += 2) {
    keys.add(`${Math.round(points[index] * WELD_SCALE)},${Math.round(points[index + 1] * WELD_SCALE)}`);
  }
  return keys;
}

function dedupeProjectedTriangles(triangles: number[][]): number[][] {
  const deduped = new Map<string, number[]>();
  for (const triangle of triangles) {
    const key = [...polygonVertexKeys(triangle)].sort().join('|');
    if (!deduped.has(key)) deduped.set(key, triangle);
  }
  return [...deduped.values()];
}

function projectedPolygonKeys(polygon: number[], cache: Map<number[], Set<string>>): Set<string> {
  let keys = cache.get(polygon);
  if (!keys) {
    keys = polygonVertexKeys(polygon);
    cache.set(polygon, keys);
  }
  return keys;
}

function sharedVertexCount(
  keys: ReadonlySet<string>, polygon: number[], cache: Map<number[], Set<string>>,
): number {
  let shared = 0;
  for (const key of projectedPolygonKeys(polygon, cache)) if (keys.has(key)) shared++;
  return shared;
}

function combinedConvexHull(first: number[], second: number[]): number[] | null {
  const vertices: Array<[number, number]> = [];
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 2) {
      vertices.push([polygon[index], polygon[index + 1]]);
    }
  }
  const hull = convexHull2(vertices);
  const sourceArea = Math.abs(polygonArea(first)) + Math.abs(polygonArea(second));
  const hullArea = Math.abs(polygonArea(hull));
  return hullArea <= sourceArea + Math.max(1e-5, sourceArea * 1e-4) ? hull : null;
}

function mergeFirstProjectedPair(polygons: number[][], vertexKeys: Map<number[], Set<string>>): boolean {
  for (let first = 0; first < polygons.length; first++) {
    const firstKeys = projectedPolygonKeys(polygons[first], vertexKeys);
    for (let second = first + 1; second < polygons.length; second++) {
      if (sharedVertexCount(firstKeys, polygons[second], vertexKeys) < 2) continue;
      const hull = combinedConvexHull(polygons[first], polygons[second]);
      if (!hull) continue;
      polygons[first] = hull;
      polygons.splice(second, 1);
      return true;
    }
  }
  return false;
}

function mergeProjectedTriangles(triangles: number[][]) {
  const polygons = dedupeProjectedTriangles(triangles);
  // Pair search restarts in the same order, but unchanged polygon arrays need
  // not rebuild welded vertex strings for every comparison. Each accepted
  // hull is a new array, so its keys cannot alias the replaced polygon's keys.
  // This construction-local cache is discarded with this one merge call.
  const vertexKeys = new Map<number[], Set<string>>();
  while (mergeFirstProjectedPair(polygons, vertexKeys)) { /* restart after each exact merge */ }
  return uniquePolygons(polygons);
}

/** Sutherland-Hodgman clip of a flat x y z polygon to the horizontal slab y0 <= y <= y1. */
function clipPolygonToSlab(polygon: number[], y0: number, y1: number): number[] {
  let input = polygon;
  for (const [level, keepAbove] of [[y0, true], [y1, false]] as Array<[number, boolean]>) {
    if (input.length < 9) return [];
    const output: number[] = [];
    const count = input.length / 3;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = input[i * 3], ay = input[i * 3 + 1], az = input[i * 3 + 2];
      const bx = input[j * 3], by = input[j * 3 + 1], bz = input[j * 3 + 2];
      const aIn = keepAbove ? ay >= level : ay <= level;
      const bIn = keepAbove ? by >= level : by <= level;
      if (aIn) output.push(ax, ay, az);
      if (aIn !== bIn) {
        // interpolate from the lexicographically lower endpoint so the two triangles sharing this edge produce
        // the identical crossing point (the pair merge welds by exact coordinate keys)
        const forward = ax < bx || (ax === bx && (ay < by || (ay === by && az <= bz)));
        const [px, py, pz, qx, qy, qz] = forward ? [ax, ay, az, bx, by, bz] : [bx, by, bz, ax, ay, az];
        const t = (level - py) / (qy - py);
        output.push(px + (qx - px) * t, level, pz + (qz - pz) * t);
      }
    }
    input = output;
  }
  return input;
}

/** Closed horizontal section loops of a solid at height `y` (welded segment chains; open chains are discarded). */
function sliceContours(solid: LocalSolid, y: number): number[][] {
  const segments: Array<[number, number, number, number]> = [];
  const cross = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number] | null => {
    if ((ay < y) === (by < y)) return null;
    const forward = ax < bx || (ax === bx && (ay < by || (ay === by && az <= bz)));
    const [px, py, pz, qx, qy, qz] = forward ? [ax, ay, az, bx, by, bz] : [bx, by, bz, ax, ay, az];
    const t = (y - py) / (qy - py);
    return [Math.fround(px + (qx - px) * t), Math.fround(pz + (qz - pz) * t)];
  };
  for (const tri of solid.triangles) {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const point = cross(tri[i * 3], tri[i * 3 + 1], tri[i * 3 + 2], tri[j * 3], tri[j * 3 + 1], tri[j * 3 + 2]);
      if (point) points.push(point);
    }
    if (points.length === 2 && (points[0][0] !== points[1][0] || points[0][1] !== points[1][1])) {
      segments.push([points[0][0], points[0][1], points[1][0], points[1][1]]);
    }
  }
  if (segments.length < 3) return [];
  // weld at the extraction's own 0.1 mm scale: the raw per-triangle corners of a shared edge differ by float noise
  const key = (x: number, z: number) => `${Math.round(x * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`;
  const byEnd = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const k of [key(segment[0], segment[1]), key(segment[2], segment[3])]) {
      const list = byEnd.get(k);
      if (list) list.push(index); else byEnd.set(k, [index]);
    }
  });
  const used = new Uint8Array(segments.length);
  const loops: number[][] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const loop = [segments[start][0], segments[start][1]];
    let cx = segments[start][2], cz = segments[start][3];
    const startKey = key(segments[start][0], segments[start][1]);
    let closed = false;
    for (let guard = 0; guard < segments.length; guard++) {
      const k = key(cx, cz);
      if (k === startKey) { closed = true; break; }
      loop.push(cx, cz);
      const next = (byEnd.get(k) || []).find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = 1;
      const segment = segments[next];
      if (key(segment[0], segment[1]) === k) { cx = segment[2]; cz = segment[3]; } else { cx = segment[0]; cz = segment[1]; }
    }
    if (closed && loop.length >= 6 && Math.abs(polygonArea(loop)) >= 0.0025) loops.push(loop);
  }
  return loops;
}

/** Ear-clip a simple (possibly concave) loop into triangles; the pair merge rebuilds maximal convex pieces. */
function triangulateLoop(points: number[]): number[][] {
  const count = points.length / 2;
  const order = Array.from({ length: count }, (_, i) => i);
  const ccw = polygonArea(points) > 0;
  const x = (i: number) => points[i * 2], z = (i: number) => points[i * 2 + 1];
  const inside = (px: number, pz: number, a: number, b: number, c: number) => {
    const d1 = (x(b) - x(a)) * (pz - z(a)) - (z(b) - z(a)) * (px - x(a));
    const d2 = (x(c) - x(b)) * (pz - z(b)) - (z(c) - z(b)) * (px - x(b));
    const d3 = (x(a) - x(c)) * (pz - z(c)) - (z(a) - z(c)) * (px - x(c));
    return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
  };
  const triangles: number[][] = [];
  let guard = count * count;
  while (order.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const a = order[(i + order.length - 1) % order.length], b = order[i], c = order[(i + 1) % order.length];
      const cross = (x(b) - x(a)) * (z(c) - z(a)) - (z(b) - z(a)) * (x(c) - x(a));
      if (Math.abs(cross) < 1e-12 || (cross > 0) !== ccw) continue;
      if (order.some((k) => k !== a && k !== b && k !== c && inside(x(k), z(k), a, b, c))) continue;
      triangles.push([x(a), z(a), x(b), z(b), x(c), z(c)]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) triangles.push([x(order[0]), z(order[0]), x(order[1]), z(order[1]), x(order[2]), z(order[2])]);
  return triangles.filter((triangle) => Math.abs(polygonArea(triangle)) >= 1e-6);
}

function isConvexPolygon(points: number[]): boolean {
  const count = points.length / 2;
  let sign = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count, k = (i + 2) % count;
    const ex = points[j * 2] - points[i * 2], ez = points[j * 2 + 1] - points[i * 2 + 1];
    const fx = points[k * 2] - points[j * 2], fz = points[k * 2 + 1] - points[j * 2 + 1];
    const c = ex * fz - ez * fx;
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/**
 * The footprint of one solid inside a height band: the volume slab's projection — the surface triangles clipped
 * to the band plus the solid's closed section loops at the band planes (the interior of a wall at that height, a
 * sandbag ring's cross-section), merged like the whole-solid projection. A slice that is all vertical faces (a
 * plain wall with no section loop) contributes the hull of its clipped vertices. Each polygon carries the
 * vertical extent it came from. Concave section loops and scanned meshes stay raw for the raster collapse.
 */
function bandProjection(solid: LocalSolid, bandMin: number, bandMax: number): { pieces: RangedPolygon[]; dense: boolean } {
  const pieces: RangedPolygon[] = [];
  let dense = solid.triangles.length > DENSE_SOURCE_LIMIT;
  const outline: Array<[number, number]> = [];
  let sliceMin = Infinity, sliceMax = -Infinity;
  for (const triangle of solid.triangles) {
    const clipped = clipPolygonToSlab(triangle, bandMin, bandMax);
    if (clipped.length < 9) continue;
    const projected: number[] = [];
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < clipped.length; i += 3) {
      const x = Math.fround(clipped[i]), z = Math.fround(clipped[i + 2]);
      projected.push(x, z);
      outline.push([x, z]);
      y0 = Math.min(y0, clipped[i + 1]); y1 = Math.max(y1, clipped[i + 1]);
    }
    sliceMin = Math.min(sliceMin, y0); sliceMax = Math.max(sliceMax, y1);
    if (Math.abs(polygonArea(projected)) >= 1e-6) pieces.push({ points: projected, y0, y1 });
  }
  if (!outline.length) return { pieces: [], dense };
  const slabMin = Math.max(bandMin, solid.minY), slabMax = Math.min(bandMax, solid.maxY);
  let loops = 0;
  for (const level of [bandMin, bandMax]) {
    if (level <= solid.minY + 1e-6 || level >= solid.maxY - 1e-6) continue;
    for (const loop of sliceContours(solid, level)) {
      loops++;
      if (isConvexPolygon(loop)) { pieces.push({ points: loop, y0: slabMin, y1: slabMax }); continue; }
      // an authored concave section (a wall with recesses, a courtyard ring) is ear-clipped and the merge below
      // reassembles its convex pieces the way it assembles a face's triangles; a scanned ring of hundreds of
      // vertices stays whole and sends the band to the raster (ear-clipping it is slow and brittle)
      if (dense || loop.length > 2 * SECTION_CLIP_VERTICES) {
        pieces.push({ points: loop, y0: slabMin, y1: slabMax });
        dense = true;
        continue;
      }
      for (const triangle of triangulateLoop(loop)) pieces.push({ points: triangle, y0: slabMin, y1: slabMax });
    }
  }
  if (!pieces.length || (!loops && !dense)) {
    // no section loop closed (an open sloped surface, or the band planes miss the solid): the hull of the clipped
    // vertices stands in for the slab — a planar strip's hull is the strip itself
    const hull = convexHull2(outline);
    if (hull.length >= 6 && Math.abs(polygonArea(hull)) >= 0.0025) {
      pieces.push({ points: hull, y0: sliceMin, y1: sliceMax });
    }
    if (!pieces.length) return { pieces: [], dense };
  }
  return { pieces: dense ? pieces : mergeRangedPolygons(pieces), dense };
}

function mergeRangedPolygons(items: RangedPolygon[]): RangedPolygon[] {
  // same pairwise exact-hull merge as the whole-solid projection, carrying the union of the vertical extents
  const deduped = new Map<string, RangedPolygon>();
  for (const item of items) {
    const key = [...polygonVertexKeys(item.points)].sort().join('|');
    const prior = deduped.get(key);
    if (!prior) deduped.set(key, { points: item.points, y0: item.y0, y1: item.y1 });
    else { prior.y0 = Math.min(prior.y0, item.y0); prior.y1 = Math.max(prior.y1, item.y1); }
  }
  // containment first: a section loop already inside a face projection must not widen a hull with air
  const polygons = uniqueRangedPolygons([...deduped.values()]);
  const vertexKeys = new Map<number[], Set<string>>();
  let merged = true;
  while (merged) {
    merged = false;
    for (let first = 0; first < polygons.length && !merged; first++) {
      const firstKeys = projectedPolygonKeys(polygons[first].points, vertexKeys);
      for (let second = first + 1; second < polygons.length; second++) {
        if (sharedVertexCount(firstKeys, polygons[second].points, vertexKeys) < 2) continue;
        const hull = combinedConvexHull(polygons[first].points, polygons[second].points);
        if (!hull) continue;
        polygons[first] = {
          points: hull,
          y0: Math.min(polygons[first].y0, polygons[second].y0),
          y1: Math.max(polygons[first].y1, polygons[second].y1),
        };
        polygons.splice(second, 1);
        merged = true;
        break;
      }
    }
  }
  return uniqueRangedPolygons(polygons);
}

/**
 * Drop polygons inside a larger one. In a shell band a contained slice that rises above its container keeps its
 * own part (a chimney through a roof strip); in the ground-contact band the container absorbs it and takes the
 * taller extent (the old footprint set, with a conservative top for the hull-span test).
 */
function uniqueRangedPolygons(items: RangedPolygon[], absorb = false): RangedPolygon[] {
  const sorted = items.slice().sort((a, b) => Math.abs(polygonArea(b.points)) - Math.abs(polygonArea(a.points)));
  const kept: RangedPolygon[] = [];
  for (const item of sorted) {
    const outer = kept.find((candidate) => (absorb || (candidate.y0 <= item.y0 + 0.05 && candidate.y1 >= item.y1 - 0.05))
      && polygonContains(candidate.points, item.points));
    if (outer) {
      if (absorb) { outer.y0 = Math.min(outer.y0, item.y0); outer.y1 = Math.max(outer.y1, item.y1); }
      continue;
    }
    kept.push({ points: item.points, y0: item.y0, y1: item.y1 });
  }
  return kept;
}

/** Give collapsed raster rectangles the vertical extent of the source polygons they cover. */
function rangeRectangles(rectangles: number[][], source: RangedPolygon[]): RangedPolygon[] {
  return rectangles.map((points) => {
    const bounds = boundsOf([points]);
    let y0 = Infinity, y1 = -Infinity;
    for (const item of source) {
      const b = boundsOf([item.points]);
      if (b.maxX < bounds.minX || b.minX > bounds.maxX || b.maxZ < bounds.minZ || b.minZ > bounds.maxZ) continue;
      y0 = Math.min(y0, item.y0); y1 = Math.max(y1, item.y1);
    }
    if (!Number.isFinite(y0)) {
      for (const item of source) { y0 = Math.min(y0, item.y0); y1 = Math.max(y1, item.y1); }
    }
    return { points, y0, y1 };
  });
}

function rangedShape(item: RangedPolygon): SimpleCollisionShape {
  return { ...polygonShape(item.points), y0: item.y0, y1: item.y1 };
}

function boundsOf(polygons: number[][]) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const points of polygons) for (let index = 0; index < points.length; index += 2) {
    minX = Math.min(minX, points[index]); minZ = Math.min(minZ, points[index + 1]);
    maxX = Math.max(maxX, points[index]); maxZ = Math.max(maxZ, points[index + 1]);
  }
  return { minX, minZ, maxX, maxZ };
}

function containsAny(x: number, z: number, polygons: number[][]) {
  return polygons.some((points) => pointInPolygon(x, z, points));
}

function scoreFootprint(source: number[][], collision: number[][]): StructureFootprintReceipt {
  const bounds = boundsOf([...source, ...collision]);
  let sourceHits = 0, collisionHits = 0, intersection = 0, union = 0;
  const sample = (x: number, z: number) => {
    const expected = containsAny(x, z, source);
    const actual = containsAny(x, z, collision);
    if (expected) sourceHits++;
    if (actual) collisionHits++;
    if (expected && actual) intersection++;
    if (expected || actual) union++;
  };
  for (let zIndex = 0; zIndex < SAMPLE_GRID; zIndex++) for (let xIndex = 0; xIndex < SAMPLE_GRID; xIndex++) {
    sample(
      bounds.minX + (xIndex + 0.371) / SAMPLE_GRID * (bounds.maxX - bounds.minX),
      bounds.minZ + (zIndex + 0.619) / SAMPLE_GRID * (bounds.maxZ - bounds.minZ),
    );
  }
  // Height-clipped bands (2026-09-19) can hold only pole-thin slices spread over a wide site; the global grid
  // misses those entirely, so every polygon smaller than a few grid cells also gets its own local sample patch.
  const cellArea = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ) / (SAMPLE_GRID * SAMPLE_GRID);
  for (const polygon of [...source, ...collision]) {
    const local = boundsOf([polygon]);
    const area = (local.maxX - local.minX) * (local.maxZ - local.minZ);
    if (!(area > 0) || area > cellArea * 9) continue;
    for (let zIndex = 0; zIndex < 8; zIndex++) for (let xIndex = 0; xIndex < 8; xIndex++) {
      sample(
        local.minX + (xIndex + 0.371) / 8 * (local.maxX - local.minX),
        local.minZ + (zIndex + 0.619) / 8 * (local.maxZ - local.minZ),
      );
    }
  }
  const precision = intersection / Math.max(1, collisionHits);
  const recall = intersection / Math.max(1, sourceHits);
  const iou = intersection / Math.max(1, union);
  return {
    sourceParts: source.length,
    collisionParts: collision.length,
    precision,
    recall,
    iou,
    score: 100 * (precision * 0.42 + recall * 0.38 + iou * 0.20),
  };
}

function collapseDenseFootprint(source: number[][]) {
  if (source.length <= 1) return source;
  const allPoints: Array<[number, number]> = [];
  for (const points of source) for (let index = 0; index < points.length; index += 2) {
    allPoints.push([points[index], points[index + 1]]);
  }
  const hull = convexHull2(allPoints);
  const score = scoreFootprint(source, [hull]);
  if (score.precision >= 0.94) return [hull];
  if (source.length <= 64) return source;

  // Dense scanned meshes (notably the sourced sandbag emplacements) can
  // project thousands of curved surface triangles. Publishing every triangle
  // as a narrow-phase shape bloats the map manifest and makes contact cost
  // depend on source tessellation. Raster the occupied silhouette into merged
  // row spans instead: recesses remain open, the approximation is scored by
  // the same independent occupancy gate, and the runtime representation stays
  // strictly bounded.
  let best: { polygons: number[][]; score: number } | null = null;
  for (const resolution of [64, 56, 48, 40, 36, 32, 28, 24, 20, 16]) {
    const polygons = rasterFootprintRectangles(source, resolution);
    if (!polygons.length || polygons.length > 64) continue;
    const receipt = scoreFootprint(source, polygons);
    if (!best || receipt.score > best.score) best = { polygons, score: receipt.score };
    if (receipt.score > 90) return polygons;
  }
  return best?.polygons ?? [hull];
}

interface RasterCandidatePolygon {
  points: number[];
  bounds: ReturnType<typeof boundsOf>;
}

function rasterCandidatePolygons(source: number[][]) {
  const polygons: RasterCandidatePolygon[] = [];
  // Runtime source positions are Float32. Restrict rejection to that exact
  // finite domain: its edge differences/products stay representable in Double.
  // Other numeric inputs retain the original predicate, including its quirks.
  for (const points of source) {
    if (!points.every((value) => Number.isFinite(value) && Math.fround(value) === value)) return null;
    const bounds = boundsOf([points]);
    const values = Object.values(bounds);
    if (!values.every(Number.isFinite)) return null;
    // The ray intersection performs several floating operations. Widen only
    // the rejection envelope; inclusive edge samples still use the exact test.
    const guard = Math.max(1, ...values.map(Math.abs)) * Number.EPSILON * 16;
    polygons.push({ points, bounds: {
      minX: bounds.minX - guard, maxX: bounds.maxX + guard,
      minZ: bounds.minZ - guard, maxZ: bounds.maxZ + guard,
    } });
  }
  return polygons;
}

function rasterCellOccupied(x: number, z: number, source: number[][], row?: RasterCandidatePolygon[]) {
  return row
    ? row.some((polygon) => x >= polygon.bounds.minX && x <= polygon.bounds.maxX
      && pointInPolygon(x, z, polygon.points))
    : containsAny(x, z, source);
}

// 2026-09-19: a cell counts as occupied when its centre or any of four inset corners lies in a source polygon —
// height-clipped slices of dense scanned meshes are thinner than a raster cell and slipped between centres.
const RASTER_SUBSAMPLES: ReadonlyArray<readonly [number, number]> = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

function rasterFootprintRectangles(source: number[][], resolution: number, useBounds = false) {
  const bounds = boundsOf(source);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width <= 1e-6 || depth <= 1e-6) return [];
  const dx = width / resolution, dz = depth / resolution;
  const candidates = useBounds ? rasterCandidatePolygons(source) : null;
  interface Span { x0: number; x1: number; z0: number; z1: number }
  let active = new Map<string, Span>();
  const complete: Span[] = [];
  for (let zIndex = 0; zIndex < resolution; zIndex++) {
    const rowMinZ = bounds.minZ + zIndex * dz, rowMaxZ = rowMinZ + dz;
    const row = candidates?.filter((polygon) => rowMaxZ >= polygon.bounds.minZ && rowMinZ <= polygon.bounds.maxZ);
    const next = new Map<string, Span>();
    let runStart = -1;
    const flush = (runEnd: number) => {
      if (runStart < 0) return;
      const key = `${runStart}:${runEnd}`;
      const prior = active.get(key);
      next.set(key, prior
        ? { ...prior, z1: bounds.minZ + (zIndex + 1) * dz }
        : {
          x0: bounds.minX + runStart * dx,
          x1: bounds.minX + runEnd * dx,
          z0: bounds.minZ + zIndex * dz,
          z1: bounds.minZ + (zIndex + 1) * dz,
        });
      runStart = -1;
    };
    for (let xIndex = 0; xIndex < resolution; xIndex++) {
      const cellX = bounds.minX + xIndex * dx;
      const occupied = RASTER_SUBSAMPLES.some(([u, v]) =>
        rasterCellOccupied(cellX + u * dx, rowMinZ + v * dz, source, row));
      if (occupied && runStart < 0) runStart = xIndex;
      if (!occupied && runStart >= 0) flush(xIndex);
    }
    flush(resolution);
    for (const [key, span] of active) if (!next.has(key)) complete.push(span);
    active = next;
  }
  complete.push(...active.values());
  return complete.map((span) => [
    span.x0, span.z0,
    span.x1, span.z0,
    span.x1, span.z1,
    span.x0, span.z1,
  ]);
}

function polygonShape(points: number[]): SimpleCollisionShape {
  let cx = 0, cz = 0;
  for (let index = 0; index < points.length; index += 2) {
    cx += points[index]; cz += points[index + 1];
  }
  const count = points.length / 2;
  return { kind: 'convex', cx: cx / count, cz: cz / count, points: points.slice() };
}

function shapePolygon(shape: SimpleCollisionShape) {
  if (shape.kind === 'convex') return shape.points;
  if (shape.kind === 'obb') {
    const c = Math.cos(shape.yaw), s = Math.sin(shape.yaw);
    return [
      [-shape.hw, -shape.hl], [shape.hw, -shape.hl],
      [shape.hw, shape.hl], [-shape.hw, shape.hl],
    ].flatMap(([x, z]) => [shape.cx + x * c + z * s, shape.cz - x * s + z * c]);
  }
  const points: number[] = [];
  for (let index = 0; index < 32; index++) {
    const angle = index / 32 * Math.PI * 2;
    points.push(shape.cx + Math.cos(angle) * shape.r, shape.cz + Math.sin(angle) * shape.r);
  }
  return points;
}

function makeBand(
  solids: LocalSolid[], minY: number, maxY: number, groundContact = false,
): StructureCollisionBand {
  const band = groundContact ? null : bandSource(solids, minY, maxY);
  const source = band ? (band.dense ? band.source : shedTrim(band.source)) : collisionSource(solids, true);
  const sourcePoints = source.map((item) => item.points);
  const collision = collapseDenseFootprint(sourcePoints);
  const ranged = collision === sourcePoints ? source : rangeRectangles(collision, source);
  return {
    minY,
    maxY,
    parts: ranged.map(rangedShape),
    ...scoreFootprint(sourcePoints, collision),
  };
}

function isPrismatic(solid: LocalSolid): boolean {
  if (solid.prismatic !== undefined) return solid.prismatic;
  let prismatic = true;
  for (const t of solid.triangles) {
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2];
    const vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) continue;
    const vertical = Math.abs(ny) < 1e-3 * length;
    const horizontal = Math.abs(nx) < 1e-3 * length && Math.abs(nz) < 1e-3 * length;
    if (!vertical && !horizontal) { prismatic = false; break; }
  }
  solid.prismatic = prismatic;
  return prismatic;
}

/**
 * Every solid's raw pieces inside one shell band. Prismatic solids reuse their (cached) whole projection with the
 * band's slab as their extent; sloped, curved and scanned solids are height-clipped. A band whose active solids
 * project more than the dense limit is flagged dense: it skips the pair merge, exactly like the whole-solid path.
 * The runtime band and the release-gate certification both start from this selection.
 */
function bandPieces(
  solids: LocalSolid[], minY: number, maxY: number, projectedCache?: Map<LocalSolid, number[][]>,
): { items: RangedPolygon[]; dense: boolean } {
  const items: RangedPolygon[] = [];
  const projectedCount = solids.reduce((total, solid) => total + solid.projectedTriangles.length, 0);
  let dense = projectedCount > DENSE_SOURCE_LIMIT;
  for (const solid of solids) {
    if (!dense && isPrismatic(solid)) {
      const y0 = Math.max(minY, solid.minY), y1 = Math.min(maxY, solid.maxY);
      for (const points of solidProjection(solid, projectedCache)) items.push({ points, y0, y1 });
      continue;
    }
    const projection = bandProjection(solid, minY, maxY);
    items.push(...projection.pieces);
    dense ||= projection.dense;
  }
  dense ||= items.length > DENSE_SOURCE_LIMIT;
  return { items, dense };
}

const publishable = (item: RangedPolygon): boolean => Math.abs(polygonArea(item.points)) >= SHELL_MIN_PART_AREA;

/** The band's published footprint: merged and containment-deduped, sub-threshold trim shed (dense sources raw). */
function bandSource(
  solids: LocalSolid[], minY: number, maxY: number, projectedCache?: Map<LocalSolid, number[][]>,
): { source: RangedPolygon[]; dense: boolean } {
  const { items, dense } = bandPieces(solids, minY, maxY, projectedCache);
  if (dense) return { source: items, dense };
  return { source: uniqueRangedPolygons(items).filter(publishable), dense };
}

/** A compound holds at most 64 parts: shed the smallest decorative slices (ledges, trim) before rastering. */
const PART_LIMIT = 64;
const TRIM_AREA = 0.05;
function shedTrim(source: RangedPolygon[]): RangedPolygon[] {
  if (source.length <= PART_LIMIT) return source;
  const ranked = source.map((item) => ({ item, area: Math.abs(polygonArea(item.points)) }))
    .sort((a, b) => b.area - a.area);
  const kept = ranked.filter((entry, index) => index < PART_LIMIT || entry.area >= TRIM_AREA).map((entry) => entry.item);
  return kept.length <= PART_LIMIT ? kept : source;
}

function makeRuntimeBand(
  solids: LocalSolid[], minY: number, maxY: number, groundContact = false,
  projectedCache?: Map<LocalSolid, number[][]>,
): StructureCollisionRuntimeBand {
  const band = groundContact ? null : bandSource(solids, minY, maxY, projectedCache);
  const source = band
    ? (band.dense ? band.source : shedTrim(band.source))
    : collisionSource(solids, true, projectedCache);
  if (source.length <= PART_LIMIT) return { minY, maxY, parts: source.map(rangedShape) };
  const collision = collapseRuntimeFootprint(source.map((item) => item.points));
  return { minY, maxY, parts: rangeRectangles(collision, source).map(rangedShape) };
}

/** Whole-solid projections for the ground-contact band, each carrying its solid's full height. */
function collisionSource(
  solids: LocalSolid[], groundContact: boolean, projectedCache?: Map<LocalSolid, number[][]>,
): RangedPolygon[] {
  const activeSolids = contactSolidSelection(solids, groundContact);
  // Triangle-pair merging is useful for ordinary primitives but quadratic on dense scanned meshes.
  const projectedCount = activeSolids.reduce(
    (total, solid) => total + solid.projectedTriangles.length, 0,
  );
  if (projectedCount > 512) {
    return activeSolids.flatMap((solid) => (solid.projectedTriangles.length
      ? solid.projectedTriangles
      : [solid.points]).map((points) => ({ points, y0: solid.minY, y1: solid.maxY })));
  }
  const ranged: RangedPolygon[] = [];
  for (const solid of activeSolids) {
    for (const points of solidProjection(solid, projectedCache)) ranged.push({ points, y0: solid.minY, y1: solid.maxY });
  }
  return uniqueRangedPolygons(ranged, true);
}

function contactSolidSelection(solids: LocalSolid[], groundContact: boolean): LocalSolid[] {
  // Open-ended decorative cylinders high on towers (rails, collars and trim)
  // have no projected cap area. Ground-bearing open solids remain physical
  // because they can be structural walls or posts. Triangle-pair merging is
  // useful for ordinary primitives but quadratic on dense scanned meshes.
  const collisionSolids = groundContact
    ? solids
    : solids.filter((solid) => solid.projectedTriangles.length > 0 || solid.minY <= CONTACT_TOP);
  return collisionSolids.length ? collisionSolids : solids;
}

function solidProjection(solid: LocalSolid, projectedCache?: Map<LocalSolid, number[][]>): number[][] {
  let projected = projectedCache?.get(solid);
  if (!projected) {
    projected = mergeProjectedTriangles(solid.projectedTriangles);
    projectedCache?.set(solid, projected);
  }
  return projected.length ? projected : [solid.points];
}

function collapseRuntimeFootprint(source: number[][]): number[][] {
  // Runtime construction needs the already-certified collision geometry, not
  // another 72x72 quality measurement for every placed building. Preserve
  // ordinary authored polygons exactly; only dense scanned silhouettes use a
  // single bounded raster pass before falling back to their enclosing hull.
  for (const resolution of [48, 40, 32, 24, 16]) {
    const polygons = rasterFootprintRectangles(source, resolution, true);
    if (polygons.length > 0 && polygons.length <= 64) return polygons;
  }
  const points: Array<[number, number]> = [];
  for (const polygon of source) {
    for (let index = 0; index < polygon.length; index += 2) {
      points.push([polygon[index], polygon[index + 1]]);
    }
  }
  return [convexHull2(points)];
}

function collectSolids(buckets: StructureGeometryBuckets) {
  const solids: LocalSolid[] = [];
  for (const [bucket, geometries] of Object.entries(buckets)) {
    if (!geometries || IGNORED_BUCKETS.has(bucket)) continue;
    for (const geometry of geometries) solids.push(...geometrySolids(geometry, bucket));
  }
  return solids;
}

function deriveContactBand<T extends StructureCollisionRuntimeBand>(
  solids: LocalSolid[],
  createBand: (active: LocalSolid[], minY: number, maxY: number, ground: boolean) => T,
): T {
  const contactSolids = solids.filter((solid) =>
    solid.bucket !== 'roof' && solid.minY <= CONTACT_TOP && solid.maxY >= 0.06);
  if (!contactSolids.length) throw new Error('structure has no ground-contact collision solids');
  return createBand(
    contactSolids,
    Math.min(...contactSolids.map((solid) => solid.minY)),
    Math.max(...contactSolids.map((solid) => solid.maxY)),
    true,
  );
}

function deriveCollisionBands<T extends StructureCollisionRuntimeBand>(
  solids: LocalSolid[],
  createBand: (active: LocalSolid[], minY: number, maxY: number, ground: boolean) => T,
): { contact: T; shell: T[] } {
  const contact = deriveContactBand(solids, createBand);
  const minY = Math.min(...solids.map((solid) => solid.minY));
  const maxY = Math.max(...solids.map((solid) => solid.maxY));
  const shell: T[] = [];
  for (let bandMin = Math.floor(minY / SHELL_BAND_HEIGHT) * SHELL_BAND_HEIGHT;
    bandMin < maxY; bandMin += SHELL_BAND_HEIGHT) {
    const bandMax = Math.min(maxY, bandMin + SHELL_BAND_HEIGHT);
    const active = solids.filter((solid) =>
      solid.maxY > bandMin + 1e-4 && solid.minY < bandMax - 1e-4);
    if (!active.length) continue;
    const band = createBand(active, bandMin, bandMax, false);
    if (!band.parts.length) continue;
    const previous = shell[shell.length - 1];
    if (previous && sameFootprint(previous.parts, band.parts) && previous.maxY >= bandMin - 1e-6) {
      // a plain wall spans many bands with one footprint: keep one record and stretch its parts
      previous.maxY = bandMax;
      previous.parts.forEach((part, index) => {
        const next = band.parts[index];
        if (part.y0 !== undefined && next.y0 !== undefined) part.y0 = Math.min(part.y0, next.y0);
        if (part.y1 !== undefined && next.y1 !== undefined) part.y1 = Math.max(part.y1, next.y1);
      });
      continue;
    }
    shell.push(band);
  }
  return { contact, shell };
}

function footprintKey(part: SimpleCollisionShape): string {
  const r = (value: number) => Math.round(value * 1000);
  if (part.kind === 'circle') return `c${r(part.cx)},${r(part.cz)},${r(part.r)}`;
  if (part.kind === 'obb') return `o${r(part.cx)},${r(part.cz)},${r(part.hw)},${r(part.hl)},${r(part.yaw)}`;
  return `v${part.points.map(r).join(',')}`;
}

function sameFootprint(a: SimpleCollisionShape[], b: SimpleCollisionShape[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (footprintKey(a[index]) !== footprintKey(b[index])) return false;
  return true;
}

export function deriveStructureCollisionProfile(
  buckets: StructureGeometryBuckets,
): StructureCollisionProfile {
  const solids = collectSolids(buckets);
  const { contact, shell } = deriveCollisionBands(solids, makeBand);
  return {
    contact,
    shell,
    minimumScore: Math.min(contact.score, ...shell.map((band) => band.score)),
  };
}

function deriveRuntimeCollisionBands(solids: LocalSolid[]): StructureCollisionRuntimeProfile {
  // One extraction owns these immutable projections across contact/shell bands.
  // The cache ends here; no geometry-keyed or global residency spans calls.
  const projectedCache = new Map<LocalSolid, number[][]>();
  return deriveCollisionBands(solids, (active, minY, maxY, ground) =>
    makeRuntimeBand(active, minY, maxY, ground, projectedCache));
}

/**
 * Build the certified runtime shape without re-running the expensive quality
 * sampler embedded in authoring audits. The release gate independently scores
 * this exact fast-path output for every structure family.
 */
export function deriveRuntimeStructureCollisionProfile(
  buckets: StructureGeometryBuckets,
): StructureCollisionRuntimeProfile {
  return deriveRuntimeCollisionBands(collectSolids(buckets));
}

/** Exact full-profile contact result for consumers that do not use shell bands. */
export function deriveRuntimeStructureContactBand(
  buckets: StructureGeometryBuckets,
): StructureCollisionRuntimeBand {
  return deriveContactBand(collectSolids(buckets), makeRuntimeBand);
}

/** Same collision result, exposing the already-extracted solids to cosmetic admission. */
export function deriveRuntimeStructureCollisionWithSolids(
  buckets: StructureGeometryBuckets,
): { profile: StructureCollisionRuntimeProfile; solids: readonly StructureSourceSolid[]; contactTop: number } {
  const solids = collectSolids(buckets);
  return { profile: deriveRuntimeCollisionBands(solids), solids, contactTop: CONTACT_TOP };
}

/**
 * Independent release-gate score against projected source triangles. Unlike
 * the runtime receipt, this catches extraction or convexification mistakes
 * rather than scoring a collision footprint against its own source hulls.
 */
export function certifyStructureCollisionProfile(
  buckets: StructureGeometryBuckets,
  profile: StructureCollisionRuntimeProfile = deriveStructureCollisionProfile(buckets),
): StructureCollisionCertification {
  const solids = collectSolids(buckets);
  const scoreSolids = (active: LocalSolid[], band: StructureCollisionRuntimeBand) => {
    const source = active.flatMap((solid) => solid.projectedTriangles);
    if (!source.length) throw new Error('structure band has no projected source surface');
    return scoreFootprint(source, band.parts.map(shapePolygon));
  };
  const contactSolids = solids.filter((solid) =>
    solid.bucket !== 'roof' && solid.minY <= CONTACT_TOP && solid.maxY >= 0.06);
  const contact = scoreSolids(contactSolids, profile.contact);
  // shell bands hold height-clipped strips: score them against the same band pieces the runtime selects, with the
  // same sub-threshold trim shed (a 14 cm post is not published, so it is not owed either)
  const shell = profile.shell.map((band) => {
    const active = solids.filter((solid) => solid.maxY > band.minY + 1e-4 && solid.minY < band.maxY - 1e-4);
    const { items, dense } = bandPieces(active, band.minY, band.maxY);
    const source = (dense ? items : items.filter(publishable)).map((item) => item.points);
    if (!source.length) throw new Error('structure band has no projected source surface');
    return scoreFootprint(source, band.parts.map(shapePolygon));
  });
  return {
    contact,
    shell,
    minimumScore: Math.min(contact.score, ...shell.map((receipt) => receipt.score)),
  };
}

function transformParts(
  parts: SimpleCollisionShape[], x: number, z: number, yaw: number, baseY?: number,
): SimpleCollisionShape[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // vertical extents are local to the structure: they become world heights only with a known base
  const extent = (part: SimpleCollisionShape) => (baseY !== undefined && part.y0 !== undefined && part.y1 !== undefined
    ? { y0: baseY + part.y0, y1: baseY + part.y1 }
    : {});
  return parts.map((part) => {
    if (part.kind === 'circle') {
      return {
        kind: 'circle' as const, r: part.r,
        cx: x + part.cx * c + part.cz * s, cz: z - part.cx * s + part.cz * c, ...extent(part),
      };
    }
    if (part.kind === 'obb') {
      return {
        kind: 'obb' as const, hw: part.hw, hl: part.hl,
        cx: x + part.cx * c + part.cz * s,
        cz: z - part.cx * s + part.cz * c,
        yaw: part.yaw + yaw,
        ...extent(part),
      };
    }
    const points = new Array(part.points.length);
    for (let index = 0; index < part.points.length; index += 2) {
      const lx = part.points[index], lz = part.points[index + 1];
      points[index] = x + lx * c + lz * s;
      points[index + 1] = z - lx * s + lz * c;
    }
    return { ...polygonShape(points), ...extent(part) };
  });
}

/** `baseY` (the structure's ground height) lets every part keep its own world-space vertical extent. */
export function applyStructureCollisionBand(
  record: CollisionRecord, band: StructureCollisionRuntimeBand,
  x: number, z: number, yaw: number, baseY?: number,
) {
  setCompoundShape(record, transformParts(band.parts, x, z, yaw, baseY));
  return record;
}

/**
 * Add a band's parts to a record that already carries a compound (a consumer with a fixed record allocation packs
 * surplus bands into its last record; per-part vertical extents keep every strip at its own height).
 */
export function mergeStructureCollisionBand(
  record: CollisionRecord, band: StructureCollisionRuntimeBand,
  x: number, z: number, yaw: number, baseY: number,
) {
  const existing = record.shape2
    ? record.shape2.kind === 'compound' ? record.shape2.parts : [record.shape2]
    : [];
  const merged = [...existing, ...transformParts(band.parts, x, z, yaw, baseY)];
  const priorMin = record.min[1], priorMax = record.max[1];
  setCompoundShape(record, merged);
  record.min[1] = Math.min(priorMin, baseY + band.minY);
  record.max[1] = Math.max(priorMax, baseY + band.maxY);
  return record;
}

export function appendStructureCollisionBand(
  list: CollisionRecord[], band: StructureCollisionRuntimeBand,
  x: number, baseY: number, z: number, yaw: number,
) {
  const record: CollisionRecord = {
    min: [x, baseY + band.minY, z],
    max: [x, baseY + band.maxY, z],
  };
  applyStructureCollisionBand(record, band, x, z, yaw, baseY);
  list.push(record);
  return record;
}
