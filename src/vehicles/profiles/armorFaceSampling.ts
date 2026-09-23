// Bilinear sample of an authored armor face (round 46 cleanup,
// docs/CLEANUP-2026-09-22.md §4.3): the Italian, Japanese and Ukrainian packs
// carried this identical body under three names.
import * as THREE from 'three';

type ArmorFaceCorner = readonly [number, number, number];

export interface ArmorFaceSample {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  du: THREE.Vector3;
  dv: THREE.Vector3;
}

/** Sample a quad face p00→p10→p11→p01 at (u, v); the normal is flipped toward outwardHint. */
export function sampleArmorFace(
  p00: ArmorFaceCorner,
  p10: ArmorFaceCorner,
  p11: ArmorFaceCorner,
  p01: ArmorFaceCorner,
  u: number,
  v: number,
  outwardHint: ArmorFaceCorner,
): ArmorFaceSample {
  const a = new THREE.Vector3(...p00);
  const b = new THREE.Vector3(...p10);
  const c = new THREE.Vector3(...p11);
  const d = new THREE.Vector3(...p01);
  const point = a.clone().multiplyScalar((1 - u) * (1 - v))
    .addScaledVector(b, u * (1 - v))
    .addScaledVector(c, u * v)
    .addScaledVector(d, (1 - u) * v);
  const du = b.clone().sub(a).multiplyScalar(1 - v)
    .add(c.clone().sub(d).multiplyScalar(v));
  const dv = d.clone().sub(a).multiplyScalar(1 - u)
    .add(c.clone().sub(b).multiplyScalar(u));
  const normal = new THREE.Vector3().crossVectors(du, dv).normalize();
  if (normal.dot(new THREE.Vector3(...outwardHint)) < 0) normal.negate();
  return { point, normal, du, dv };
}
