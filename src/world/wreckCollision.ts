import * as THREE from 'three';
import { convexHull2, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';
import { capPlanesOf } from './rockCollision.ts';
import { convexSlabs, slabParts } from './slabCollision.ts';

/** The movement record's hull as columns: across (x) and along (z) the posed hull, each column's own convex top. */
const MOVEMENT_CELLS: readonly [number, number] = [3, 3];
/** How far a column's clip reaches past its own bounds (m): neighbours overlap, so no seam opens between their tops. */
const MOVEMENT_CELL_MARGIN_M = 0.05;

/**
 * Small, posed solid envelopes; never include the gun, antennas or loose debris. The movement record's solids are the
 * posed steel's convex corners (collectWreckShellSolids), so its drawn top (placeWreckCollision: capPlanesOf) follows the
 * steel as it leans — the glacis, the engine deck, a turret's flanks — and the hull's are taken column by column (its
 * triangles clipped to a 3 x 3 grid over its plan), so a top bridges no more than a column: one convex top over the whole
 * hull ran from the stowage on its fenders to the turret ring and stood over the engine deck between them. (destruction
 * lane 2026-10-17, DST-03: these were each mesh's outline extruded from its lowest point to its highest, so the support
 * top stood at the hull's highest point everywhere over its plan. Desert's fidelity census: wreck support floating over
 * the drawn steel at 85 % of its points, median 0.46 m; one convex hull per group 65 %, 0.20 m; the columns 39 %,
 * 0.12 m, the rest the crumple's dents, which collision does not follow.)
 */
export function collectWreckSolids(root: THREE.Object3D): number[][] {
  return collectWreckShellSolids(root, MOVEMENT_CELLS, MOVEMENT_CELL_MARGIN_M);
}

/** Directions whose extreme vertices stand for a solid's convex hull (a Fibonacci sphere; deterministic). */
const SUPPORT_DIRECTIONS: readonly number[] = (() => {
  const n = 128, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    out.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  return out;
})();

/**
 * The posed hull and turret as their shell solids (the hitbox lane, 2026-10-08): the same meshes collectWreckSolids
 * reads, every vertex posed, and of each group the vertices extreme in one of 128 directions — the corners of its convex
 * hull, which placeWreckShellCollision cuts level by level. (Prisms standing each mesh's outline from its lowest point to
 * its highest held air over a sloped glacis, a rear deck or a cast turret's flanks: a fifth of the shell rays they
 * stopped passed 10+ cm clear of the steel. The hull of the vertices leans with the plates.) `cells` above 1 x 1 (the
 * movement record's, collectWreckSolids) takes the hull's group column by column: its triangles clipped to each column
 * (reaching `marginM` past it), each column's clipped corners its own solid; the turret stays whole.
 */
export function collectWreckShellSolids(root: THREE.Object3D, cells: readonly [number, number] = [1, 1], marginM = 0): number[][] {
  const groups = [[], []] as number[][];
  const [nx, nz] = cells;
  const split = nx > 1 || nz > 1;
  /** The hull group's triangles (posed, root frame), for the cells' clipped clouds. */
  const hullTris: number[] = [];
  const inverse = root.matrixWorld.clone().invert();
  const transform = new THREE.Matrix4();
  const point = new THREE.Vector3();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const turret = object.name === 'turret' || object.name === 'turretExternalArmor';
    const hull = object.name === 'hull' || object.name === 'hullExternalArmor' ||
      object.name === 'gearTrackPadsSimplified';
    if (!hull && !turret) return;
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (!node.visible) return;
      if (node === root) break;
    }
    const position = object.geometry.attributes.position;
    if (!position?.count) return;
    transform.multiplyMatrices(inverse, object.matrixWorld);
    const points = groups[turret ? 1 : 0];
    const first = points.length / 3;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(transform);
      points.push(point.x, point.y, point.z);
    }
    if (turret || !split) return;
    const index = object.geometry.index;
    const n = index ? index.count : position.count;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const v = first + (index ? index.getX(t + k) : t + k);
        hullTris.push(points[v * 3], points[v * 3 + 1], points[v * 3 + 2]);
      }
    }
  });
  const out: number[][] = [];
  groups.forEach((points, g) => {
    if (!points.length) return;
    if (g === 1 || !split) { out.push(convexCorners(points)); return; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < points.length; i += 3) {
      x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]); z0 = Math.min(z0, points[i + 2]); z1 = Math.max(z1, points[i + 2]);
    }
    const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
    const clouds: number[][] = Array.from({ length: nx * nz }, () => []);
    for (let t = 0; t < hullTris.length; t += 9) {
      const tx0 = Math.min(hullTris[t], hullTris[t + 3], hullTris[t + 6]), tx1 = Math.max(hullTris[t], hullTris[t + 3], hullTris[t + 6]);
      const tz0 = Math.min(hullTris[t + 2], hullTris[t + 5], hullTris[t + 8]), tz1 = Math.max(hullTris[t + 2], hullTris[t + 5], hullTris[t + 8]);
      const i0 = Math.max(0, Math.floor((tx0 - marginM - x0) / sx)), i1 = Math.min(nx - 1, Math.floor((tx1 + marginM - x0) / sx));
      const k0 = Math.max(0, Math.floor((tz0 - marginM - z0) / sz)), k1 = Math.min(nz - 1, Math.floor((tz1 + marginM - z0) / sz));
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        clipTriangleInto(hullTris, t, x0 + i * sx - marginM, x0 + (i + 1) * sx + marginM, z0 + k * sz - marginM, z0 + (k + 1) * sz + marginM,
          clouds[i * nz + k]!);
      }
    }
    for (const cloud of clouds) if (cloud.length >= 12) out.push(convexCorners(cloud));
  });
  return out;
}

/** The part of triangle `t` of `tris` inside the column [ax, bx] x [az, bz] (Sutherland-Hodgman), its corners pushed to `out`. */
function clipTriangleInto(tris: readonly number[], t: number, ax: number, bx: number, az: number, bz: number, out: number[]): void {
  let poly: number[] = [tris[t]!, tris[t + 1]!, tris[t + 2]!, tris[t + 3]!, tris[t + 4]!, tris[t + 5]!, tris[t + 6]!, tris[t + 7]!, tris[t + 8]!];
  const planes: Array<[number, number, number]> = [[0, 1, ax], [0, -1, bx], [2, 1, az], [2, -1, bz]];
  for (const [axis, sign, at] of planes) {
    const next: number[] = [];
    const n = poly.length / 3;
    for (let i = 0; i < n; i++) {
      const a = i * 3, b = ((i + 1) % n) * 3;
      const da = (poly[a + axis]! - at) * sign, db = (poly[b + axis]! - at) * sign;
      if (da >= 0) next.push(poly[a]!, poly[a + 1]!, poly[a + 2]!);
      if ((da >= 0) !== (db >= 0)) {
        const f = da / (da - db);
        next.push(poly[a]! + (poly[b]! - poly[a]!) * f, poly[a + 1]! + (poly[b + 1]! - poly[a + 1]!) * f, poly[a + 2]! + (poly[b + 2]! - poly[a + 2]!) * f);
      }
    }
    poly = next;
    if (!poly.length) return;
  }
  for (const v of poly) out.push(v);
}

/** Of a point cloud, the points extreme in one of SUPPORT_DIRECTIONS: the corners of its convex hull, in cloud order. */
function convexCorners(points: readonly number[]): number[] {
  const kept = new Set<number>();
  for (let d = 0; d < SUPPORT_DIRECTIONS.length; d += 3) {
    const dx = SUPPORT_DIRECTIONS[d], dy = SUPPORT_DIRECTIONS[d + 1], dz = SUPPORT_DIRECTIONS[d + 2];
    let best = -1, bestDot = -Infinity;
    for (let i = 0; i < points.length; i += 3) {
      const dot = points[i] * dx + points[i + 1] * dy + points[i + 2] * dz;
      if (dot > bestDot) { bestDot = dot; best = i; }
    }
    kept.add(best);
  }
  const out: number[] = [];
  for (const i of [...kept].sort((a, b) => a - b)) out.push(points[i], points[i + 1], points[i + 2]);
  return out;
}

/** Build once at placement with the same complete transform used by the visible wreck. */
export function placeWreckCollision(solids: readonly number[][], transform: THREE.Matrix4): CollisionRecord {
  const record: CollisionRecord = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], kind: 'tank-wreck' };
  const point = new THREE.Vector3();
  const parts: SimpleCollisionShape[] = [];
  for (const solid of solids) {
    const projected: [number, number][] = [];
    const px: number[] = [], py: number[] = [], pz: number[] = [];
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < solid.length; i += 3) {
      point.set(solid[i], solid[i + 1], solid[i + 2]).applyMatrix4(transform);
      projected.push([point.x, point.z]);
      px.push(point.x); py.push(point.y); pz.push(point.z);
      y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y);
    }
    const points = convexHull2(projected);
    if (points.length < 6) continue;
    record.min[1] = Math.min(record.min[1], y0);
    record.max[1] = Math.max(record.max[1], y1);
    let cx = 0, cz = 0;
    for (let i = 0; i < points.length; i += 2) { cx += points[i]; cz += points[i + 1]; }
    const part: Extract<SimpleCollisionShape, { kind: 'convex' }> = { kind: 'convex', cx: cx / (points.length / 2), cz: cz / (points.length / 2), points, y0, y1 };
    // (physics stream, 2026-10-13: the census's wreck records floated a hull 0.71 m over the drawn steel at the median —
    // a prism to the hull's highest point) the solid's drawn top: its support planes over its plan, the glacis, the
    // engine deck and the turret's flanks as they lean (rockCollision.ts capPlanesOf)
    const tp = capPlanesOf(px, py, pz, points);
    if (tp) part.tp = tp;
    parts.push(part);
  }
  if (!parts.length) throw new Error('Wreck has no solid collision bodies');
  return setCompoundShape(record, parts);
}

/** A wreck's shell slabs are at most this tall (m). */
const WRECK_SHELL_SLAB_M = 0.5;
/** And their outlines at most this many corners. */
const WRECK_SHELL_CORNERS = 10;

/**
 * The wreck's shell and sight record (the hitbox lane, 2026-10-07): each posed solid (hull, turret) cut into slabs that
 * lean with it. The movement record stays the solids' prisms (placeWreckCollision: a hull's floor is a solid's top); the
 * prisms extruded a wreck tipped on a slope or a fallen turret from its lowest to its highest point, so a third of the
 * shell rays that met a wreck's collider passed 10+ cm clear of the steel.
 */
export function placeWreckShellCollision(solids: readonly number[][], transform: THREE.Matrix4): CollisionRecord {
  const record: CollisionRecord = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], kind: 'tank-wreck' };
  const point = new THREE.Vector3();
  const parts: SimpleCollisionShape[] = [];
  for (const solid of solids) {
    const world: number[] = [];
    for (let i = 0; i < solid.length; i += 3) {
      point.set(solid[i], solid[i + 1], solid[i + 2]).applyMatrix4(transform);
      world.push(point.x, point.y, point.z);
    }
    parts.push(...slabParts(convexSlabs(world, WRECK_SHELL_SLAB_M, WRECK_SHELL_CORNERS)));
  }
  if (!parts.length) throw new Error('Wreck has no solid collision bodies');
  setCompoundShape(record, parts);
  for (const part of parts) {
    record.min[1] = Math.min(record.min[1], part.y0!);
    record.max[1] = Math.max(record.max[1], part.y1!);
  }
  return record;
}
