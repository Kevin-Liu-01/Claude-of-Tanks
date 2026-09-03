// Geometry-derived collision profiles for procedural structures.
//
// Building dimensions remain placement hints. Collision is instead certified
// from connected solids in the authored mesh so recesses, courtyards, open
// frames and narrow supports do not inherit one oversized rectangular box.

import type { BufferGeometry } from 'three';
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

type StructureGeometryBuckets = Record<string, BufferGeometry[] | undefined>;

export interface StructureFootprintReceipt {
  sourceParts: number;
  collisionParts: number;
  precision: number;
  recall: number;
  iou: number;
  score: number;
}

export interface StructureCollisionBand extends StructureFootprintReceipt {
  minY: number;
  maxY: number;
  parts: SimpleCollisionShape[];
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

function geometrySolids(geometry: BufferGeometry, bucket: string): LocalSolid[] {
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return [];
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  const sets = disjointSet(triangleCount);
  const owners = new Map<string, number>();
  const vertexAt = (streamIndex: number) => index ? index.getX(streamIndex) : streamIndex;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const vertex = vertexAt(triangle * 3 + corner);
      const key = vertexKey(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      const owner = owners.get(key);
      if (owner == null) owners.set(key, triangle);
      else sets.join(triangle, owner);
    }
  }

  const components = new Map<number, {
    minY: number;
    maxY: number;
    vertices: Map<string, [number, number]>;
    projectedTriangles: number[][];
  }>();
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
      const vertex = vertexAt(triangle * 3 + corner);
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      component.minY = Math.min(component.minY, y);
      component.maxY = Math.max(component.maxY, y);
      component.vertices.set(`${Math.round(x * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`, [x, z]);
      projected.push(x, z);
    }
    if (Math.abs(polygonArea(projected)) >= 1e-6) component.projectedTriangles.push(projected);
  }

  const solids: LocalSolid[] = [];
  for (const component of components.values()) {
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

function mergeProjectedTriangles(triangles: number[][]) {
  const deduped = new Map<string, number[]>();
  for (const triangle of triangles) {
    const key = [...polygonVertexKeys(triangle)].sort().join('|');
    if (!deduped.has(key)) deduped.set(key, triangle);
  }
  const polygons = [...deduped.values()];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let a = 0; a < polygons.length; a++) {
      const keysA = polygonVertexKeys(polygons[a]);
      for (let b = a + 1; b < polygons.length; b++) {
        let shared = 0;
        for (const key of polygonVertexKeys(polygons[b])) if (keysA.has(key)) shared++;
        if (shared < 2) continue;
        const vertices: Array<[number, number]> = [];
        for (const polygon of [polygons[a], polygons[b]]) {
          for (let index = 0; index < polygon.length; index += 2) {
            vertices.push([polygon[index], polygon[index + 1]]);
          }
        }
        const hull = convexHull2(vertices);
        const sourceArea = Math.abs(polygonArea(polygons[a])) + Math.abs(polygonArea(polygons[b]));
        const hullArea = Math.abs(polygonArea(hull));
        if (hullArea > sourceArea + Math.max(1e-5, sourceArea * 1e-4)) continue;
        polygons[a] = hull;
        polygons.splice(b, 1);
        changed = true;
        break outer;
      }
    }
  }
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

function rasterFootprintRectangles(source: number[][], resolution: number) {
  const bounds = boundsOf(source);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width <= 1e-6 || depth <= 1e-6) return [];
  const dx = width / resolution, dz = depth / resolution;
  interface Span { x0: number; x1: number; z0: number; z1: number }
  let active = new Map<string, Span>();
  const complete: Span[] = [];
  for (let zIndex = 0; zIndex < resolution; zIndex++) {
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
      const z = bounds.minZ + (zIndex + 0.5) * dz;
      const occupied = containsAny(x, z, source);
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
  // Open-ended decorative cylinders high on towers (rails, collars and trim)
  // have no projected cap area. Treating their outer hull as a solid disc
  // blocks shells in visibly empty air. Ground-bearing open solids remain
  // physical because they can be structural walls or posts.
  const collisionSolids = groundContact
    ? solids
    : solids.filter((solid) => solid.projectedTriangles.length > 0 || solid.minY <= CONTACT_TOP);
  const activeSolids = collisionSolids.length ? collisionSolids : solids;
  const projectedCount = activeSolids.reduce(
    (total, solid) => total + solid.projectedTriangles.length, 0,
  );
  // Triangle-pair merging is valuable for ordinary authored primitives, but
  // quadratic on scanned/curved meshes. Dense meshes go straight to the
  // bounded raster union below; occupancy scoring already treats overlaps as
  // one silhouette.
  const source = projectedCount > 512
    ? activeSolids.flatMap((solid) => solid.projectedTriangles.length
      ? solid.projectedTriangles
      : [solid.points])
    : uniquePolygons(activeSolids.flatMap((solid) => {
    const projected = mergeProjectedTriangles(solid.projectedTriangles);
    return projected.length ? projected : [solid.points];
    }));
  const collision = collapseDenseFootprint(source);
  return {
    minY,
    maxY,
    parts: collision.map(polygonShape),
    ...scoreFootprint(source, collision),
  };
}

function collectSolids(buckets: StructureGeometryBuckets) {
  const solids: LocalSolid[] = [];
  for (const [bucket, geometries] of Object.entries(buckets)) {
    if (!geometries || IGNORED_BUCKETS.has(bucket)) continue;
    for (const geometry of geometries) solids.push(...geometrySolids(geometry, bucket));
  }
  return solids;
}

export function deriveStructureCollisionProfile(
  buckets: StructureGeometryBuckets,
): StructureCollisionProfile {
  const solids = collectSolids(buckets);
  const contactSolids = solids.filter((solid) =>
    solid.bucket !== 'roof' && solid.minY <= CONTACT_TOP && solid.maxY >= 0.06);
  if (!contactSolids.length) throw new Error('structure has no ground-contact collision solids');
  const contact = makeBand(
    contactSolids,
    Math.min(...contactSolids.map((solid) => solid.minY)),
    Math.max(...contactSolids.map((solid) => solid.maxY)),
    true,
  );

  const minY = Math.min(...solids.map((solid) => solid.minY));
  const maxY = Math.max(...solids.map((solid) => solid.maxY));
  const shell: StructureCollisionBand[] = [];
  for (let bandMin = Math.floor(minY / SHELL_BAND_HEIGHT) * SHELL_BAND_HEIGHT;
    bandMin < maxY; bandMin += SHELL_BAND_HEIGHT) {
    const bandMax = Math.min(maxY, bandMin + SHELL_BAND_HEIGHT);
    const active = solids.filter((solid) => solid.maxY > bandMin + 1e-4 && solid.minY < bandMax - 1e-4);
    if (active.length) shell.push(makeBand(active, bandMin, bandMax));
  }
  return {
    contact,
    shell,
    minimumScore: Math.min(contact.score, ...shell.map((band) => band.score)),
  };
}

/**
 * Independent release-gate score against projected source triangles. Unlike
 * the runtime receipt, this catches extraction or convexification mistakes
 * rather than scoring a collision footprint against its own source hulls.
 */
export function certifyStructureCollisionProfile(
  buckets: StructureGeometryBuckets,
  profile = deriveStructureCollisionProfile(buckets),
): StructureCollisionCertification {
  const solids = collectSolids(buckets);
  const scoreSolids = (active: LocalSolid[], band: StructureCollisionBand) => {
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
  record: CollisionRecord, band: StructureCollisionBand,
  x: number, z: number, yaw: number,
) {
  setCompoundShape(record, transformParts(band.parts, x, z, yaw));
  return record;
}

export function appendStructureCollisionBand(
  list: CollisionRecord[], band: StructureCollisionBand,
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
