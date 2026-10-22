// Seating stock on the face of stock already built (2026-10-21, owner: ERA "not on the glacis properly"): a ray
// straight down onto a bucket's parts finds the face under a point, and a cassette or plate lies on that face rather
// than on a hand-measured plane the hull no longer follows.
import * as THREE from 'three';

interface StockPort {
  forEachBucketPart(names: string | string[], visit: (geometry: THREE.BufferGeometry) => void): void;
  readonly spec: { readonly id: string };
}

/** Where a ray straight down meets `bucket`'s stock at (x, z) (its owner's frame), and that face's upward normal. */
export function stockTopFace(P: StockPort, x: number, z: number, bucket = 'hull'): { point: THREE.Vector3; normal: THREE.Vector3 } {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0));
  let best: THREE.Intersection | undefined;
  P.forEachBucketPart(bucket, (geometry) => {
    const hit = ray.intersectObject(new THREE.Mesh(geometry, material), false)[0];
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  });
  material.dispose();
  if (!best?.face) throw new Error(`${P.spec.id}: no ${bucket} face under x ${x}, z ${z}`);
  const normal = best.face.normal.clone();
  if (normal.y < 0) normal.negate();
  return { point: best.point.clone(), normal };
}

/** The XYZ Euler that lays a box on a face: its +Z along the face's normal, its +Y up the face toward -Z (the way a
 * glacis rises to the turret), its +X across. */
export function upSlopeTurn(normal: THREE.Vector3): THREE.Euler {
  const upSlope = new THREE.Vector3(0, 0, -1).addScaledVector(normal, normal.z).normalize();
  const across = new THREE.Vector3().crossVectors(upSlope, normal);
  return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, upSlope, normal));
}
