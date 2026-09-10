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
const SHELL_BAND_HEIGHT = 1.5;
const IGNORED_BUCKETS = new Set(['glass', 'curtain']);

interface LocalSolid {
  bucket: string;
  minY: number;
  maxY: number;
  points: number[];
  projectedTriangles: number[][];
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

export interface StructureFootprintReceipt {
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

export interface StructureCollisionBand
  extends StructureCollisionRuntimeBand, StructureFootprintReceipt {}

export interface StructureCollisionRuntimeProfile {
  contact: StructureCollisionRuntimeBand;
  shell: StructureCollisionRuntimeBand[];
}

export interface StructureCollisionProfile {
  contact: StructureCollisionBand;
  shell: StructureCollisionBand[];
  minimumScore: number;
}

export interface StructureCollisionCertification {
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
      };
      components.set(root, component);
    }
    const projected: number[] = [];
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
    }
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
  for (let zIndex = 0; zIndex < SAMPLE_GRID; zIndex++) for (let xIndex = 0; xIndex < SAMPLE_GRID; xIndex++) {
    const x = bounds.minX + (xIndex + 0.371) / SAMPLE_GRID * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + (zIndex + 0.619) / SAMPLE_GRID * (bounds.maxZ - bounds.minZ);
    const expected = containsAny(x, z, source);
    const actual = containsAny(x, z, collision);
    if (expected) sourceHits++;
    if (actual) collisionHits++;
    if (expected && actual) intersection++;
    if (expected || actual) union++;
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
    const z = bounds.minZ + (zIndex + 0.5) * dz;
    const row = candidates?.filter((polygon) => z >= polygon.bounds.minZ && z <= polygon.bounds.maxZ);
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
      const x = bounds.minX + (xIndex + 0.5) * dx;
      const occupied = rasterCellOccupied(x, z, source, row);
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
  const source = collisionSource(solids, groundContact);
  const collision = collapseDenseFootprint(source);
  return {
    minY,
    maxY,
    parts: collision.map(polygonShape),
    ...scoreFootprint(source, collision),
  };
}

function makeRuntimeBand(
  solids: LocalSolid[], minY: number, maxY: number, groundContact = false,
  projectedCache?: Map<LocalSolid, number[][]>,
): StructureCollisionRuntimeBand {
  const source = collisionSource(solids, groundContact, projectedCache);
  const collision = source.length <= 64 ? source : collapseRuntimeFootprint(source);
  return { minY, maxY, parts: collision.map(polygonShape) };
}

function collisionSource(
  solids: LocalSolid[], groundContact: boolean, projectedCache?: Map<LocalSolid, number[][]>,
): number[][] {
  // Open-ended decorative cylinders high on towers (rails, collars and trim)
  // have no projected cap area. Ground-bearing open solids remain physical
  // because they can be structural walls or posts. Triangle-pair merging is
  // useful for ordinary primitives but quadratic on dense scanned meshes.
  const collisionSolids = groundContact
    ? solids
    : solids.filter((solid) => solid.projectedTriangles.length > 0 || solid.minY <= CONTACT_TOP);
  const activeSolids = collisionSolids.length ? collisionSolids : solids;
  const projectedCount = activeSolids.reduce(
    (total, solid) => total + solid.projectedTriangles.length, 0,
  );
  if (projectedCount > 512) {
    return activeSolids.flatMap((solid) => solid.projectedTriangles.length
      ? solid.projectedTriangles
      : [solid.points]);
  }
  return uniquePolygons(activeSolids.flatMap((solid) => {
    let projected = projectedCache?.get(solid);
    if (!projected) {
      projected = mergeProjectedTriangles(solid.projectedTriangles);
      projectedCache?.set(solid, projected);
    }
    return projected.length ? projected : [solid.points];
  }));
}

function collapseRuntimeFootprint(source: number[][]): number[][] {
  // Runtime construction needs the already-certified collision geometry, not
  // another 72x72 quality measurement for every placed building. Preserve
  // ordinary authored polygons exactly; only dense scanned silhouettes use a
  // single bounded raster pass before falling back to their enclosing hull.
  for (const resolution of [32, 24, 16]) {
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
    if (active.length) shell.push(createBand(active, bandMin, bandMax, false));
  }
  return { contact, shell };
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
  const shell = profile.shell.map((band) => scoreSolids(
    solids.filter((solid) =>
      solid.maxY > band.minY + 1e-4 && solid.minY < band.maxY - 1e-4),
    band,
  ));
  return {
    contact,
    shell,
    minimumScore: Math.min(contact.score, ...shell.map((receipt) => receipt.score)),
  };
}

function transformParts(
  parts: SimpleCollisionShape[], x: number, z: number, yaw: number,
): SimpleCollisionShape[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return parts.map((part) => {
    if (part.kind === 'circle') {
      return { ...part, cx: x + part.cx * c + part.cz * s, cz: z - part.cx * s + part.cz * c };
    }
    if (part.kind === 'obb') {
      return {
        ...part,
        cx: x + part.cx * c + part.cz * s,
        cz: z - part.cx * s + part.cz * c,
        yaw: part.yaw + yaw,
      };
    }
    const points = new Array(part.points.length);
    for (let index = 0; index < part.points.length; index += 2) {
      const lx = part.points[index], lz = part.points[index + 1];
      points[index] = x + lx * c + lz * s;
      points[index + 1] = z - lx * s + lz * c;
    }
    return polygonShape(points);
  });
}

export function applyStructureCollisionBand(
  record: CollisionRecord, band: StructureCollisionRuntimeBand,
  x: number, z: number, yaw: number,
) {
  setCompoundShape(record, transformParts(band.parts, x, z, yaw));
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
  applyStructureCollisionBand(record, band, x, z, yaw);
  list.push(record);
  return record;
}
