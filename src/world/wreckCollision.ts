import * as THREE from 'three';
import { convexHull2, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';

/** Small, posed solid envelopes; never include the gun, antennas or loose debris. */
export function collectWreckSolids(root: THREE.Object3D): number[][] {
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
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    transform.multiplyMatrices(inverse, object.matrixWorld);
    const points = groups[turret ? 1 : 0];
    // Preserve tapered noses/corners instead of replacing each part with a rectangle.
    const position = object.geometry.attributes.position;
    const outline: [number, number][] = [];
    for (let i = 0; i < position.count; i++) outline.push([position.getX(i), position.getZ(i)]);
    const footprint = convexHull2(outline);
    for (let i = 0; i < footprint.length; i += 2) for (const y of [box.min.y, box.max.y]) {
      point.set(footprint[i], y, footprint[i + 1]).applyMatrix4(transform);
      points.push(point.x, point.y, point.z);
    }
  });
  return groups.filter(points => points.length > 0);
}

/** Build once at placement with the same complete transform used by the visible wreck. */
export function placeWreckCollision(solids: readonly number[][], transform: THREE.Matrix4): CollisionRecord {
  const record: CollisionRecord = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], kind: 'tank-wreck' };
  const point = new THREE.Vector3();
  const parts: SimpleCollisionShape[] = [];
  for (const solid of solids) {
    const projected: [number, number][] = [];
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < solid.length; i += 3) {
      point.set(solid[i], solid[i + 1], solid[i + 2]).applyMatrix4(transform);
      projected.push([point.x, point.z]);
      y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y);
    }
    const points = convexHull2(projected);
    if (points.length < 6) continue;
    record.min[1] = Math.min(record.min[1], y0);
    record.max[1] = Math.max(record.max[1], y1);
    let cx = 0, cz = 0;
    for (let i = 0; i < points.length; i += 2) { cx += points[i]; cz += points[i + 1]; }
    parts.push({ kind: 'convex', cx: cx / (points.length / 2), cz: cz / (points.length / 2), points, y0, y1 });
  }
  if (!parts.length) throw new Error('Wreck has no solid collision bodies');
  return setCompoundShape(record, parts);
}
