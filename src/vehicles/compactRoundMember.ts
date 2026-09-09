import * as THREE from 'three';

type Point = readonly [number, number, number];

/** Retriangulate only the two planar fans of an owned closed cylinder.
 * Positions, normals, UVs, side faces and occupied stock are unchanged. */
export function compactCylinderCaps(geometry: THREE.CylinderGeometry): THREE.CylinderGeometry {
  const segments = geometry.parameters.radialSegments;
  if (geometry.parameters.openEnded || geometry.parameters.heightSegments !== 1
    || geometry.parameters.thetaLength !== Math.PI * 2 || geometry.groups.length !== 3)
    throw new RangeError('Compact caps require a closed, single-span cylinder');
  const original = geometry.index!;
  const indices = Array.from({ length: segments * 6 }, (_, i) => original.getX(i));
  const groups = geometry.groups.slice();
  geometry.clearGroups();
  geometry.addGroup(0, indices.length, 0);
  for (const [cap, group] of groups.slice(1).entries()) {
    const begin = indices.length;
    const rim = Array.from({ length: segments }, (_, i) => original.getX(group.start + i * 3 + cap));
    for (let i = 1; i < segments - 1; i++) {
      if (cap === 0) indices.push(rim[0], rim[i], rim[i + 1]);
      else indices.push(rim[0], rim[i + 1], rim[i]);
    }
    geometry.addGroup(begin, indices.length - begin, cap + 1);
  }
  geometry.setIndex(indices);
  return geometry;
}

/** Same occupied closed polygon cylinder and attributes as roundMember.
 * Only its two planar cap fans are retriangulated without redundant centers. */
export function compactRoundMember(a: Point, b: Point, radius: number, segments: number): THREE.BufferGeometry {
  if (![...a, ...b, radius].every(Number.isFinite) || radius <= 0
    || !Number.isInteger(segments) || segments < 3 || segments > 128) {
    throw new RangeError('Invalid compact round member');
  }
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  if (delta.lengthSq() < 1e-10) throw new RangeError('Round member needs distinct endpoints');
  const geometry = compactCylinderCaps(new THREE.CylinderGeometry(radius, radius, delta.length(), segments));
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
  return geometry;
}

