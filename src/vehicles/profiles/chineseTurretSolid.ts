// Release 276: the ZTZ-99A2 / ZTZ-99A / VT-4A1 turret shells lofted from their plan outlines
// (chineseTurretOutlines.ts) as one closed solid each, and the face tiles seated on that solid's planar faces.
// First-party geometric primitive; callers own every measurement. Builds only at vehicle creation.
// First-party: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { convexSlab } from './kit.ts';
import { cheekFaceQuad, type CheekCourse, type CheekFace, type OutlinePoint, type OutlineRing, type TurretOutline } from './chineseTurretOutlines.ts';

type V3 = THREE.Vector3;
const v3 = (p: OutlinePoint | readonly number[]): V3 => new THREE.Vector3(p[0], p[1], p[2]);

/** Twice the signed plan area (x, z) of a ring. */
function planArea2(ring: OutlineRing): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p[0] * q[2] - q[0] * p[2];
  }
  return a;
}

/** A closed solid between plan rings stacked upward (each ring the same count and correspondence). Side quads are
 * split on the diagonal that keeps the panel convex outward; the floor and roof are the bottom and top rings
 * triangulated in plan (concave rings included). Outward winding throughout. */
export function outlineSolid(rings: readonly OutlineRing[]): THREE.BufferGeometry {
  if (rings.length < 2) throw new Error('outlineSolid needs two rings');
  const n = rings[0].length;
  if (rings.some((r) => r.length !== n)) throw new Error('outlineSolid rings differ in count');
  const flip = planArea2(rings[0]) < 0;
  const rs = flip ? rings.map((r) => [...r].reverse()) : rings.map((r) => [...r]);
  for (const r of rs) if (planArea2(r) <= 1e-8) throw new Error('outlineSolid ring is not one simple plan loop');
  const out: number[] = [];
  const tri = (a: V3, b: V3, c: V3, outward: V3): void => {
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.lengthSq() < 1e-16) return;
    if (nrm.dot(outward) >= 0) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    else out.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  };
  for (let k = 0; k + 1 < rs.length; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = v3(rs[k][i]), b0 = v3(rs[k][j]), a1 = v3(rs[k + 1][i]), b1 = v3(rs[k + 1][j]);
      // counter-clockwise in (x, z): the outward horizontal normal of edge a->b is (dz, 0, -dx)
      const e = b0.clone().sub(a0).add(b1.clone().sub(a1));
      const outward = new THREE.Vector3(e.z, 0, -e.x).normalize();
      // the diagonal whose midpoint stands further out makes the convex (outward) ridge
      const dAC = a0.clone().add(b1).multiplyScalar(0.5).dot(outward);
      const dBD = b0.clone().add(a1).multiplyScalar(0.5).dot(outward);
      if (dAC >= dBD) { tri(a0, b0, b1, outward); tri(a0, b1, a1, outward); }
      else { tri(a0, b0, a1, outward); tri(b0, b1, a1, outward); }
    }
  }
  const cap = (ring: readonly OutlinePoint[], up: number): void => {
    const faces = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[2])), []);
    for (const [a, b, c] of faces) tri(v3(ring[a]), v3(ring[b]), v3(ring[c]), new THREE.Vector3(0, up, 0));
  };
  cap(rs[0], -1);
  cap(rs.at(-1)!, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const uv: number[] = [];
  for (let i = 0; i < out.length; i += 3) uv.push(out[i], out[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export type { CheekFace, CheekCourse };

/** cheekFaceQuad (chineseTurretOutlines.ts) as vectors. */
export function cheekFaceCorners(o: TurretOutline, side: 1 | -1, face: CheekFace, course: CheekCourse): V3[] {
  return cheekFaceQuad(o, side, face, course).map(v3);
}

/** The outward unit normal of a face given as [bottom-inner, bottom-outer, top-outer, top-inner]. */
export function faceNormal(c: readonly V3[]): V3 {
  const n = c[1].clone().sub(c[0]).cross(c[3].clone().sub(c[0])).normalize();
  // outward: away from the turret's vertical axis and up
  const centre = c.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.25);
  if (n.dot(new THREE.Vector3(centre.x, 0.6, centre.z)) < 0) n.negate();
  return n;
}

/** The largest distance of the face's fourth corner from the plane of its first three (0 for a planar face). */
export function faceTwistM(c: readonly V3[]): number {
  const n = c[1].clone().sub(c[0]).cross(c[2].clone().sub(c[0])).normalize();
  return Math.abs(c[3].clone().sub(c[0]).dot(n));
}

export interface SeatedTile {
  readonly geometry: THREE.BufferGeometry;
  /** the tile's base corners on the face, its outward normal and its thickness (for receipts and ERA records) */
  readonly base: readonly V3[];
  readonly normal: V3;
  readonly thicknessM: number;
  /** its eight corners: the sunk underside, then the bevelled top */
  readonly corners: readonly V3[];
}

/** A closed tile on a planar face: the face patch [u0,u1] x [v0,v1] (u along the face from its inner edge, v up it),
 * its underside `sinkM` into the face (so no daylight shows under it), standing `thicknessM` proud with a `bevelM`
 * chamfer round its top. Convex by construction (convexSlab). */
export function seatedTile(c: readonly V3[], u0: number, u1: number, v0: number, v1: number,
  thicknessM: number, bevelM = 0.008, sinkM = 0.004): SeatedTile {
  const at = (u: number, v: number): V3 => c[0].clone().lerp(c[1], u).lerp(c[3].clone().lerp(c[2], u), v);
  const n = faceNormal(c);
  const base = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  const centre = base.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.25);
  const bottom = base.map((p) => p.clone().addScaledVector(n, -sinkM));
  const top = base.map((p) => {
    const toward = centre.clone().sub(p);
    return p.clone().addScaledVector(toward, Math.min(0.45, bevelM / Math.max(1e-6, toward.length())))
      .addScaledVector(n, thicknessM);
  });
  const geometry = convexSlab(...bottom.map((p) => p.toArray()), ...top.map((p) => p.toArray()));
  return Object.freeze({ geometry, base: Object.freeze(base), normal: n, thicknessM, corners: Object.freeze([...bottom, ...top]) });
}

/** Evenly spaced tile columns across [0, 1] with `gapM` between tiles and `edgeM` kept from both ends, measured
 * along an edge of `lengthM`. */
export function tileSpans(count: number, lengthM: number, gapM: number, edgeM: number): [number, number][] {
  const usable = lengthM - 2 * edgeM - (count - 1) * gapM;
  const w = usable / count, spans: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = edgeM + i * (w + gapM);
    spans.push([a / lengthM, (a + w) / lengthM]);
  }
  return spans;
}

export interface CheekTileCourse {
  readonly face: CheekFace;
  readonly course: CheekCourse;
  readonly columns: number;
  readonly rows: number;
  /** gap between tiles and margin kept from the face's edges, metres */
  readonly gapM: number;
  readonly edgeM: number;
  readonly thicknessM: number;
}

export interface CheekTileRecord {
  readonly side: 1 | -1;
  readonly face: CheekFace;
  readonly course: CheekCourse;
  readonly base: readonly (readonly number[])[];
  readonly normal: readonly number[];
  readonly thicknessM: number;
  readonly corners: readonly (readonly number[])[];
}

/** Seats the courses' tiles on both cheeks (each tile a closed convex block on one planar face of the outline solid)
 * into `bucket`, and returns their records. */
export function addCheekTiles(P: { add(bucket: string, g: THREE.BufferGeometry): unknown }, o: TurretOutline,
  courses: readonly CheekTileCourse[], bucket = 'turretExternalArmor'): CheekTileRecord[] {
  const records: CheekTileRecord[] = [];
  for (const side of [-1, 1] as const) {
    for (const c of courses) {
      const corners = cheekFaceCorners(o, side, c.face, c.course);
      const twist = faceTwistM(corners);
      if (twist > 1e-4) throw new Error(`${o.id}: the ${c.face} ${c.course} face is not planar (${twist.toFixed(5)} m)`);
      const along = Math.max(corners[0].distanceTo(corners[1]), corners[3].distanceTo(corners[2]));
      const up = Math.min(corners[0].distanceTo(corners[3]), corners[1].distanceTo(corners[2]));
      const us = tileSpans(c.columns, along, c.gapM, c.edgeM), vs = tileSpans(c.rows, up, c.gapM, c.edgeM);
      for (const [u0, u1] of us) for (const [v0, v1] of vs) {
        const t = seatedTile(corners, u0, u1, v0, v1, c.thicknessM);
        P.add(bucket, t.geometry);
        records.push(Object.freeze({ side, face: c.face, course: c.course, base: t.base.map((p) => p.toArray()),
          normal: t.normal.toArray(), thicknessM: t.thicknessM, corners: t.corners.map((p) => p.toArray()) }));
      }
    }
  }
  return records;
}
