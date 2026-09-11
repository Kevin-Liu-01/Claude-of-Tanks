import type * as THREE from 'three';

/** Give the existing far-trunk foot an irregular flare without adding any
 * vertex, triangle, material or per-frame work. No shared RNG is consumed:
 * crown generation and placement keep exactly the same random stream.
 */
export function shapeFarTreeBase(geometry: THREE.BufferGeometry, phase = 0): void {
  const position = geometry.getAttribute('position');
  let baseY = Infinity;
  for (let i = 0; i < position.count; i++) baseY = Math.min(baseY, position.getY(i));
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > baseY + 1e-6) continue;
    const x = position.getX(i), z = position.getZ(i);
    const angle = Math.atan2(z, x);
    const flare = 1.08 + 0.14 * Math.cos(angle * 3 + phase)
      + 0.06 * Math.sin(angle * 2 - 0.4);
    position.setXYZ(i, x * flare, position.getY(i), z * flare);
  }
  geometry.computeVertexNormals();
}
