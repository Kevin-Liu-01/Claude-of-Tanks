import * as THREE from 'three';

/** Select actual native triangle draw offsets, never a fitted rectangle.
 * Selection happens before builder transforms; indices survive those transforms. */
export function markEraHitFaces(geometry: THREE.BufferGeometry,
  outward: readonly [number, number, number], minimumDot = .5): THREE.BufferGeometry {
  const direction = new THREE.Vector3(...outward).normalize();
  if (direction.lengthSq() < .99 || !(minimumDot >= 0 && minimumDot <= 1))
    throw new Error('ERA face selection requires a finite outward axis and cosine threshold');
  const p = geometry.getAttribute('position'), index = geometry.getIndex();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const starts: number[] = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).sub(a);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).sub(a);
    const normal = b.cross(c);
    if (normal.lengthSq() > 1e-18 && normal.normalize().dot(direction) > minimumDot) starts.push(i);
  }
  if (!starts.length) throw new Error('ERA cover has no real outward triangle');
  geometry.userData.eraHitFaceVertexStarts = starts;
  return geometry;
}

/** Hardware is removed with its cassette but cannot expand its hit field. */
export function markEraFurniture(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.userData.eraHitFaceVertexStarts = [];
  return geometry;
}
