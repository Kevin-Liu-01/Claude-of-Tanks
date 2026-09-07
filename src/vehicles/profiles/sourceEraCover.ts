// Partition first-party armor skin into a removable cover and a closed
// permanent backing. Exterior triangles stay on their exact authored planes.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type PlanPoint = readonly [number, number];
type Edge = readonly [Point, Point];
interface Partition { backing: THREE.BufferGeometry; cover: THREE.BufferGeometry | null; }
const EPS = 1e-8;

function signedArea(polygon: readonly PlanPoint[]): number {
  return polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
}

function validateFootprint(mask: readonly PlanPoint[], depth: number): void {
  if (mask.length < 3 || !mask.every(p => p.length === 2 && p.every(Number.isFinite))
      || !(depth > 0 && depth < .1)) throw new Error('ERA cover requires a finite shallow convex footprint');
  const sign = Math.sign(signedArea(mask));
  if (!sign) throw new Error('ERA cover footprint has zero area');
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i], b = mask[(i + 1) % mask.length], c = mask[(i + 2) % mask.length];
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (turn * sign <= EPS) throw new Error('ERA cover footprint must be strictly convex');
  }
}

function distance(p: Point, a: PlanPoint, b: PlanPoint, sign: number): number {
  return sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
}

function halfPlane(points: readonly Point[], a: PlanPoint, b: PlanPoint, sign: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const dp = distance(p, a, b, sign), dq = distance(q, a, b, sign);
    if (dp >= -EPS) result.push(p);
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const t = dp / (dp - dq);
      result.push([p[0] + (q[0] - p[0]) * t,
        p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return result;
}

function splitPolygon(points: readonly Point[], mask: readonly PlanPoint[]): { inside: Point[]; outside: Point[][] } {
  const sign = Math.sign(signedArea(mask));
  let inside = [...points];
  const outside: Point[][] = [];
  for (let i = 0; i < mask.length && inside.length >= 3; i++) {
    const a = mask[i], b = mask[(i + 1) % mask.length];
    const excluded = halfPlane(inside, a, b, -sign);
    if (excluded.length >= 3) outside.push(excluded);
    inside = halfPlane(inside, a, b, sign);
  }
  return { inside, outside };
}

function triangleArea(a: Point, b: Point, c: Point): number {
  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  return ab.cross(ac).lengthSq();
}

function appendPolygon(output: number[], polygon: readonly Point[], reverse = false): void {
  for (let i = 1; i + 1 < polygon.length; i++) {
    const points = reverse ? [polygon[0], polygon[i + 1], polygon[i]] : [polygon[0], polygon[i], polygon[i + 1]];
    if (triangleArea(points[0], points[1], points[2]) > 1e-18) output.push(...points.flat());
  }
}

function vertexKey(p: Point): string { return p.map(v => Math.round(v * 1e6)).join(','); }

function addEdges(edges: Map<string, Edge>, polygon: readonly Point[]): void {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const ka = vertexKey(a), kb = vertexKey(b);
    if (ka === kb) continue;
    const reverse = `${kb}/${ka}`;
    if (edges.has(reverse)) edges.delete(reverse);
    else edges.set(`${ka}/${kb}`, [a, b]);
  }
}

function geometry(positions: number[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Input is native authored geometry in its owner frame, never source topology.
 * The depth is a concealed gameplay-layer partition, not a source measurement. */
export function partitionEraCover(input: THREE.BufferGeometry, mask: readonly PlanPoint[], depth: number): Partition {
  validateFootprint(mask, depth);
  const p = input.getAttribute('position'), ix = input.getIndex();
  const backing: number[] = [], cover: number[] = [];
  const edges = new Map<string, Edge>();
  const skinStarts: number[] = [];
  const lower = ([x, y, z]: Point): Point => [x, y - depth, z];
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const triangle: Point[] = [0, 1, 2].map(j => {
      const k = ix ? ix.getX(i + j) : i + j;
      return [p.getX(k), p.getY(k), p.getZ(k)];
    });
    // A downward cast selects the actual top skin, not vertical reveals,
    // belly, gun throat, or the rear wall of an optical opening.
    const [a, b, c] = triangle;
    const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (normalY <= EPS) { appendPolygon(backing, triangle); continue; }
    const split = splitPolygon(triangle, mask);
    for (const outside of split.outside) appendPolygon(backing, outside);
    if (split.inside.length < 3) continue;
    appendPolygon(backing, split.inside.map(lower));
    const start = cover.length / 3;
    appendPolygon(cover, split.inside);
    for (let offset = start; offset < cover.length / 3; offset += 3) skinStarts.push(offset);
    appendPolygon(cover, split.inside.map(lower), true);
    addEdges(edges, split.inside);
  }
  for (const [a, b] of edges.values()) {
    appendPolygon(cover, [b, a, lower(a), lower(b)]);
    appendPolygon(backing, [a, b, lower(b), lower(a)]);
  }
  const coverGeometry = cover.length ? geometry(cover) : null;
  if (coverGeometry) coverGeometry.userData.eraHitFaceVertexStarts = skinStarts;
  return { backing: geometry(backing), cover: coverGeometry };
}

/** Call after structural carriers exist and before their seated seam fittings.
 * Only the closed cover is damageable; each original carrier stays permanent. */
export function bindPartitionedEraCover(P: TankBuilderPort, owner: 'hull' | 'turret', name: string,
  worldFootprint: readonly PlanPoint[], depth = .018): void {
  const root = owner === 'hull' ? P.hullG : P.turretG;
  const footprint: PlanPoint[] = worldFootprint.map(([x, z]) => [x - root.position.x, z - root.position.z]);
  const covers: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(owner, part => {
    const split = partitionEraCover(part, footprint, depth);
    if (split.cover) {
      part.copy(split.backing);
      covers.push(split.cover);
    }
    split.backing.dispose();
  });
  if (!covers.length) throw new Error(`${name}: no actual cover surface inside source panel footprint`);
  P.destructibleCluster(name, () => {
    for (const cover of covers) P.addExternalArmor(owner, cover);
  });
}
