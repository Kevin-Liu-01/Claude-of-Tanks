import * as THREE from 'three';

export const KF51B_GUN_RECESS = Object.freeze({ halfWidthM: 0.43, backZM: 0.88 });

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
  const indices = source.getIndex();
  const cornerCount = indices?.count ?? positions.count;
  const output: number[] = [];
  const boundary = new Map<string, THREE.Vector3>();
  const sign = below ? 1 : -1;
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16) {
      output.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    }
  };
  for (let i = 0; i < cornerCount; i += 3) {
    const face = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(
      positions, indices ? indices.getX(i + offset) : i + offset,
    ));
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

// The three clipped volumes touch along the two x cut planes. Keep only
// the exposed portion of those walls ahead of the recess back: buried caps
// would leave coincident inward faces and four-way edges inside the armor.
function joinRecess(geometries: readonly THREE.BufferGeometry[], halfWidthM: number, backZM: number): THREE.BufferGeometry {
  const faces: THREE.Vector3[][] = [];
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 3) {
      const face = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position, i + offset));
      const onPartition = [-halfWidthM, halfWidthM].some(x => face.every(p => Math.abs(p.x - x) < 1e-6));
      const polygon = onPartition ? clipFace(face, 'z', backZM, -1, new Map()) : face;
      if (polygon.length >= 3) faces.push(polygon);
    }
  }
  // Sequential clipping subdivides the two sides of a shared edge differently.
  // Insert the same boundary vertices on both sides before triangulation, so
  // the finished U is one closed surface instead of a set of touching solids.
  const points = new Map<string, THREE.Vector3>();
  const key = (p: THREE.Vector3): string => p.toArray().map(v => v.toFixed(6)).join(',');
  for (const face of faces) for (const p of face) if (!points.has(key(p))) {
    const existing = [...points.values()].find(v => v.distanceToSquared(p) < 1e-10);
    points.set(key(p), existing ?? p);
  }
  const vertices = [...new Set(points.values())];
  const output: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16) output.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  };
  for (const face of faces) {
    const boundary: THREE.Vector3[] = [];
    for (let i = 0; i < face.length; i++) {
      const a = points.get(key(face[i]))!, b = points.get(key(face[(i + 1) % face.length]))!;
      const edge = b.clone().sub(a), lengthSq = edge.lengthSq();
      if (lengthSq < 1e-14) continue;
      const along = [{ p: a, t: 0 }];
      for (const p of vertices) {
        const t = p.clone().sub(a).dot(edge) / lengthSq;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        if (a.clone().addScaledVector(edge, t).distanceToSquared(p) < 1e-10) along.push({ p, t });
      }
      along.sort((l, r) => l.t - r.t);
      boundary.push(...along.map(entry => entry.p));
    }
    if (boundary.length === 3) triangle(boundary[0], boundary[1], boundary[2]);
    else if (boundary.length > 3) {
      const center = boundary.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(boundary.length);
      for (let i = 0; i < boundary.length; i++) triangle(center, boundary[i], boundary[(i + 1) % boundary.length]);
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(output.length / 3 * 2), 2));
  result.computeVertexNormals();
  return result;
}

/** Consumes the original closed loft; returns one closed mesh with a front U recess. */
export function recessClosedTurret(source: THREE.BufferGeometry,
  { halfWidthM, backZM }: { readonly halfWidthM: number; readonly backZM: number },
): THREE.BufferGeometry {
  const left = closedSlice(source, 'x', -halfWidthM, true);
  const right = closedSlice(source, 'x', halfWidthM, false);
  const middleRight = closedSlice(source, 'x', -halfWidthM, false);
  const middle = closedSlice(middleRight, 'x', halfWidthM, true);
  const rear = closedSlice(middle, 'z', backZM, true);
  const result = joinRecess([left, right, rear], halfWidthM, backZM);
  for (const geometry of [source, left, right, middleRight, middle, rear]) geometry.dispose();
  result.userData.closedGunRecess = { halfWidthM, backZM };
  return result;
}

/** Preserve the Panther's installed gun opening. */
export function recessKF51BTurret(source: THREE.BufferGeometry): THREE.BufferGeometry {
  return recessClosedTurret(source, KF51B_GUN_RECESS);
}
