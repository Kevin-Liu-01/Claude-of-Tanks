import * as THREE from 'three';

/** Close the central V beneath the X bustle roof, inside its existing shell.
 * The roof underside is 35 mm below the authored .66/.52 m crown. The
 * centerline keel and raked rear face retain the original shell's datums.
 * Eight outward triangles form one closed solid; no doubled roof face or
 * floating cover is needed. Standard Challenger 3 does not use this part.
 */
export function buildChallenger3XRearTurretClosure(): THREE.BufferGeometry {
  const vertices = [
    0, 0.10, -2.55,
    1.05, 0.625, -2.55,
    -1.05, 0.625, -2.55,
    0, 0.15, -3.27,
    1.05, 0.485, -3.34,
    -1.05, 0.485, -3.34,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0.5, 0, 1, 0, 0, 0, 0.5, 1, 1, 1, 0, 1,
  ], 2));
  geometry.setIndex([
    0, 1, 2, 3, 5, 4,
    0, 3, 4, 0, 4, 1,
    0, 2, 5, 0, 5, 3,
    1, 4, 5, 1, 5, 2,
  ]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}
