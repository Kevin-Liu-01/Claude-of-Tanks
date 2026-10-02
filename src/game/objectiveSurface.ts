import { RingGeometry, type Mesh } from 'three';

/** Dense enough to drape over terrain triangles instead of spanning a hill
 * with one flat fan. Each marker owns its geometry; captures never deform
 * another objective's ring. Coordinates remain in the authored XY plane. */
export function objectiveRing(inner: number, outer: number): RingGeometry {
  return new RingGeometry(inner, outer, Math.max(48, Math.ceil(outer * Math.PI * 2 / .8)),
    Math.max(1, Math.ceil((outer - inner) / .8)));
}

/** Stationary ground markers face up (-PI/2 about X). Refit only on placement
 * changes, or when their sampled surface changes after map replacement. */
export function fitObjectiveSurface(mesh: Mesh, x: number, y: number, z: number,
  sample: ((x: number, z: number) => number) | undefined, lift = .065): void {
  if (!sample) return;
  const center = sample(x, z);
  const cache = mesh.userData.surfacePlacement as number[] | undefined;
  if (cache && cache[0] === x && cache[1] === y && cache[2] === z && cache[3] === center) return;
  const positions = mesh.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const height = sample(x + positions.getX(i), z - positions.getY(i));
    positions.setZ(i, (Number.isFinite(height) ? height : center) - y + lift - mesh.position.y);
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();
  mesh.userData.surfacePlacement = [x, y, z, center];
}
