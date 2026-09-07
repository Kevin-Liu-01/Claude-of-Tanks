// Independent analytic solid construction. Inputs are scalar planes, never
// sampled source contours/triangles. Every created cell is closed stock.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
export type ArietePlane = readonly [number, number, number, number];

export function arietePlaneStock(planes: readonly ArietePlane[]): THREE.BufferGeometry {
  const normals = planes.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const points: THREE.Vector3[] = [];
  for (let a = 0; a < planes.length; a++) for (let b = a + 1; b < planes.length; b++) {
    for (let c = b + 1; c < planes.length; c++) {
      const matrix = new THREE.Matrix3().set(planes[a][0], planes[a][1], planes[a][2],
        planes[b][0], planes[b][1], planes[b][2], planes[c][0], planes[c][1], planes[c][2]);
      if (Math.abs(matrix.determinant()) < 1e-9) continue;
      const point = new THREE.Vector3(-planes[a][3], -planes[b][3], -planes[c][3])
        .applyMatrix3(matrix.invert());
      if (planes.some((p, i) => normals[i].dot(point) + p[3] > 1e-7)) continue;
      if (!points.some(p => p.distanceToSquared(point) < 1e-12)) points.push(point);
    }
  }
  if (points.length < 4) throw new Error('Ariete analytic armor cell is empty');
  const geometry = new ConvexGeometry(points), position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) { uv[i * 2] = position.getX(i); uv[i * 2 + 1] = position.getZ(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export function arieteForePlanes(minX: number, maxX: number): ArietePlane[] {
  return [[-1, 0, 0, minX], [1, 0, 0, -maxX], [0, 0, -1, .543],
    [0, 0, 1, -1.956398], [0, -1, 0, 1.356694],
    [0, -.986216234, .165461593, 1.150671058]];
}
