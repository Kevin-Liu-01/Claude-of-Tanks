import * as THREE from 'three';
import { convexHull2, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';
import { capPlanesOf } from './rockCollision.ts';
import { convexSlabs, slabParts } from './slabCollision.ts';

/**
 * Small, posed solid envelopes; never include the gun, antennas or loose debris. The movement record's solids are the
 * posed vertices' convex corners (collectWreckShellSolids), so its drawn top (placeWreckCollision: capPlanesOf) follows
 * the steel as it leans — the glacis, the engine deck, a turret's flanks. (destruction lane 2026-10-17, DST-03: these were
 * each mesh's outline extruded from its lowest point to its highest, so the support top stood at the hull's highest
 * point everywhere over its plan: the fidelity census still read wreck records floating a hull 0.46 m over the drawn
 * steel at the median, 85 % of their points.)
 */
export function collectWreckSolids(root: THREE.Object3D): number[][] {
  return collectWreckShellSolids(root);
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
 * hull, which placeWreckShellCollision cuts level by level. collectWreckSolids' prisms stand each mesh's outline from its
 * lowest point to its highest (the movement record's law: a hull's floor is a solid's top), so over a sloped glacis, a
 * rear deck or a cast turret's flanks they hold air: a fifth of the shell rays a wreck's prisms stopped passed 10+ cm
 * clear of the steel. The hull of the vertices leans with the plates.
 */
export function collectWreckShellSolids(root: THREE.Object3D): number[][] {
  const groups = [[], []] as number[][];
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
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(transform);
      points.push(point.x, point.y, point.z);
    }
  });
  return groups.filter(points => points.length > 0).map((points) => {
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
  });
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
