import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const KF51B_GUN_RECESS = Object.freeze({ halfWidthM: 0.43, backZM: 0.94 });

function clipFace(
  face: readonly THREE.Vector3[], axis: 'x' | 'z', limit: number, sign: number,
  boundary: Map<string, THREE.Vector3>,
): THREE.Vector3[] {
  const clipped: THREE.Vector3[] = [];
  const remember = (point: THREE.Vector3): void => {
    boundary.set(point.toArray().map(v => v.toFixed(6)).join(','), point);
  };
  for (let j = 0; j < face.length; j++) {
    const a = face[j], b = face[(j + 1) % face.length];
    const da = sign * (a[axis] - limit), db = sign * (b[axis] - limit);
    if (da <= 0) clipped.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const point = a.clone().lerp(b, da / (da - db));
      point[axis] = limit;
      clipped.push(point);
      remember(point);
    }
    if (Math.abs(da) < 1e-7) remember(a);
  }
  return clipped;
}

// The Panther's convex loft is split into two closed cheeks and a closed
// central rear body. Preserve its authored outer triangles; cap each cut in
// actual armor instead of hiding the nose with a dark overlay or an open mesh.
function closedSlice(
  source: THREE.BufferGeometry, axis: 'x' | 'z', limit: number, below: boolean,
): THREE.BufferGeometry {
  const positions = source.getAttribute('position');
  const output: number[] = [];
  const boundary = new Map<string, THREE.Vector3>();
  const sign = below ? 1 : -1;
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16) {
      output.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    }
  };
  for (let i = 0; i < positions.count; i += 3) {
    const face = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, i + offset));
    const clipped = clipFace(face, axis, limit, sign, boundary);
    for (let j = 1; j < clipped.length - 1; j++) triangle(clipped[0], clipped[j], clipped[j + 1]);
  }
  const ring = [...boundary.values()];
  if (ring.length >= 3) {
    const center = ring.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(ring.length);
    const angle = (v: THREE.Vector3): number => axis === 'x'
      ? Math.atan2(v.z - center.z, v.y - center.y)
      : Math.atan2(v.y - center.y, v.x - center.x);
    ring.sort((a, b) => angle(a) - angle(b));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (below) triangle(center, a, b);
      else triangle(center, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(output.length / 3 * 2), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Consumes the original closed loft; returns one closed mesh with a front U recess. */
export function recessKF51BTurret(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const { halfWidthM, backZM } = KF51B_GUN_RECESS;
  const left = closedSlice(source, 'x', -halfWidthM, true);
  const right = closedSlice(source, 'x', halfWidthM, false);
  const middleRight = closedSlice(source, 'x', -halfWidthM, false);
  const middle = closedSlice(middleRight, 'x', halfWidthM, true);
  const rear = closedSlice(middle, 'z', backZM, true);
  const result = mergeGeometries([left, right, rear]);
  for (const geometry of [source, left, right, middleRight, middle, rear]) geometry.dispose();
  if (!result) throw new Error('KF51-U closed turret recess could not be assembled');
  return result;
}
