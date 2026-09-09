// First-party construction vocabulary for the new Abrams X rig. Inputs are
// sparse authored design stations, never source vertex/topology payloads.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export type XY = readonly [number, number];
export type XYZ = readonly [number, number, number];
export type CrossSection = { z: number; ring: readonly XY[] };
export type ArmorPlane = readonly [number, number, number, number];

/** Independently authored convex armor bounded by a small set of design
 * planes n·p <= d. This constructs new topology from plane intersections;
 * it does not retain reference vertices, triangle indices or mesh samples. */
export function planeBoundedArmor(planes: readonly ArmorPlane[]): THREE.BufferGeometry {
  if (planes.length < 4 || planes.length > 16
    || planes.some(p => !p.every(Number.isFinite) || Math.hypot(p[0], p[1], p[2]) < 1e-9)) {
    throw new Error('Armor requires four to sixteen finite design planes');
  }
  const normals = planes.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const vertices: THREE.Vector3[] = [];
  for (let a = 0; a < planes.length - 2; a++) {
    for (let b = a + 1; b < planes.length - 1; b++) {
      for (let c = b + 1; c < planes.length; c++) {
        const bc = new THREE.Vector3().crossVectors(normals[b], normals[c]);
        const determinant = normals[a].dot(bc);
        if (Math.abs(determinant) < 1e-8) continue;
        const point = bc.multiplyScalar(planes[a][3])
          .add(new THREE.Vector3().crossVectors(normals[c], normals[a]).multiplyScalar(planes[b][3]))
          .add(new THREE.Vector3().crossVectors(normals[a], normals[b]).multiplyScalar(planes[c][3]))
          .divideScalar(determinant);
        if (planes.some((p, i) => normals[i].dot(point) - p[3] > 1e-6)
          || vertices.some(v => v.distanceToSquared(point) < 1e-12)) continue;
        vertices.push(point);
      }
    }
  }
  if (vertices.length < 4) throw new Error('Armor planes do not enclose a solid');
  const geometry = new ConvexGeometry(vertices);
  const positions = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < positions.count; i++) uv.push(positions.getX(i), positions.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

function validateLoftSections(stations: readonly CrossSection[]): number {
  if (stations.length < 2) throw new Error('An Abrams loft needs at least two stations');
  const count = stations[0].ring.length;
  for (let k = 0; k < stations.length; k++) {
    const section = stations[k];
    if (section.ring.length !== count || count < 3 || !Number.isFinite(section.z)
      || section.ring.some(p => p.length !== 2 || !p.every(Number.isFinite))) {
      throw new Error('Invalid Abrams loft section');
    }
    if (k && section.z <= stations[k - 1].z) throw new Error('Loft stations must ascend');
    let signedArea = 0;
    for (let i = 0; i < count; i++) {
      const a = section.ring[i], b = section.ring[(i + 1) % count];
      signedArea += a[0] * b[1] - b[0] * a[1];
    }
    if (signedArea <= 1e-9) throw new Error('Loft section must be counterclockwise');
  }
  return count;
}

/** A closed, outward-facing longitudinal loft, including concave wheel wells.
 * Rings run counterclockwise in XY viewed from +Z; stations ascend in Z.
 * True openings are assembled from separate wall/shelf solids, not cut by
 * deleting triangles from this closed body. */
export function closedSectionLoft(stations: readonly CrossSection[]): THREE.BufferGeometry {
  const count = validateLoftSections(stations);
  const positions: number[] = [];
  const point = (s: number, v: number): XYZ => [...stations[s].ring[v], stations[s].z];
  const tri = (a: XYZ, b: XYZ, c: XYZ) => positions.push(...a, ...b, ...c);
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      tri(point(s, i), point(s, j), point(s + 1, j));
      tri(point(s, i), point(s + 1, j), point(s + 1, i));
    }
  }
  for (const s of [0, stations.length - 1]) {
    const contour = stations[s].ring.map(([x, y]) => new THREE.Vector2(x, y));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      if (s === 0) tri(point(s, c), point(s, b), point(s, a));
      else tri(point(s, a), point(s, b), point(s, c));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** A real round support, cable or rail between explicit attachment points. */
export function roundMember(a: XYZ, b: XYZ, radius: number, segments = 10): THREE.BufferGeometry {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  if (delta.lengthSq() < 1e-10 || radius <= 0) throw new Error('Invalid round member');
  const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
  return geometry;
}

/** Radius-profiled hollow tube with true muzzle opening; no capped barrel end.
 * Station order runs from the breech toward the muzzle. The inner wall is
 * recessed to a source-independent visual depth, not a second silhouette. */
export function profiledTube(
  stations: readonly { z: number; r: number }[], boreRadius: number, segments = 48,
): THREE.BufferGeometry {
  if (stations.length < 2 || boreRadius <= 0 || stations.some(s => s.r <= boreRadius)) {
    throw new Error('Invalid tube wall');
  }
  const profile = stations.map(s => new THREE.Vector2(s.r, s.z));
  const front = stations[stations.length - 1], rear = stations[0];
  profile.push(new THREE.Vector2(boreRadius, front.z), new THREE.Vector2(boreRadius, rear.z),
    new THREE.Vector2(rear.r, rear.z));
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

