import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

/** Welded Panther stock keeps the authored silhouette stations; its actual
 * supporting planes replace inward quad diagonals and a concave cap fan.
 * This is explicitly scoped to that convex shell, never a casting normal fix. */
export function convexCrownedStock(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const points = new Map<string, THREE.Vector3>();
  const p = source.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    points.set(v.toArray().map(n => n.toFixed(7)).join(','), v);
  }
  const geometry = new ConvexGeometry([...points.values()]);
  const positions = geometry.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < positions.count; i++) uv.push(positions.getX(i), positions.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  source.dispose();
  return geometry;
}

/** Finite shallow skin over a nonplanar cheek. Both faces use the same
 * diagonal: opposite diagonals on a warped quad cut through a thin panel. */
export function leopardThermalSkin(
  corners: readonly (readonly number[])[], backing: readonly number[],
): THREE.BufferGeometry {
  const front = corners.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const offset = new THREE.Vector3(backing[0], backing[1], backing[2]);
  if (new THREE.Triangle(front[0], front[1], front[2]).getNormal(new THREE.Vector3()).dot(offset) > 0) {
    [front[1], front[3]] = [front[3], front[1]];
  }
  const rear = front.map(p => p.clone().add(offset)), positions: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => { positions.push(...a.toArray(), ...b.toArray(), ...c.toArray()); };
  triangle(front[0], front[1], front[2]);triangle(front[0], front[2], front[3]);
  triangle(rear[0], rear[2], rear[1]);triangle(rear[0], rear[3], rear[2]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangle(front[i], rear[i], rear[j]);triangle(front[i], rear[j], front[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.computeVertexNormals();
  geometry.userData.primaryStockRole = 'leo2a6m-thermal-skin';
  return geometry;
}
