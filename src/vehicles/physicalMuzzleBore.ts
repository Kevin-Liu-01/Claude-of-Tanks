import * as THREE from 'three';

/** Explicit dimensions of a profile's actual annulus, inner wall and backstop. */
export interface PhysicalMuzzleBore {
  readonly outerRadiusM: number;
  readonly innerRadiusM: number;
  readonly depthM: number;
  /** Measured metal lips outside the aperture, ahead of the circular mouth. */
  readonly rimProjectionM?: number;
}

/** Build-time verification, before the legacy muzzle furniture is installed.
 * Axial rays verify the backstop and rim; radial rays verify inward wall stock.
 * A declaration alone cannot turn a capped tube into a physical bore. */
export function verifyPhysicalMuzzleBore(
  frame: THREE.Object3D, muzzleZ: number, bore: PhysicalMuzzleBore,
): { minimumDepthM: number; maximumRimOffsetM: number; maximumWallErrorM: number; measuredOuterRadiusM: number; measuredProjectionM: number } {
  const { outerRadiusM: outer, innerRadiusM: inner, depthM: depth } = bore;
  const projection = bore.rimProjectionM ?? 0;
  if (![outer, inner, depth, muzzleZ, projection].every(Number.isFinite)
      || projection < 0 || projection > .1
      || inner < .003 || outer <= inner || outer > .65 || depth < .01 || depth > .5) {
    throw new RangeError('Physical muzzle bore needs finite ordered radii and a 10–500 mm recess');
  }
  frame.updateWorldMatrix(true, true);
  const direction = new THREE.Vector3(0, 0, -1).transformDirection(frame.matrixWorld);
  const ray = new THREE.Raycaster();
  const surfaces: THREE.Object3D[] = [];
  frame.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // Native gun buckets have one visible material. A mixed mesh containing
    // invisible groups cannot stand in as proof of physical rendered stock.
    if (materials.some(material => !material.visible || !material.colorWrite
        || (material.transparent && (!Number.isFinite(material.opacity) || material.opacity <= .001)))) return;
    surfaces.push(object);
  });
  // Read the real terminal vertex ring in the common gun frame. Mid-rim
  // samples alone would accept an oversized outer-radius declaration.
  const { frontZ, measuredOuterRadiusM, measuredProjectionM } = measureTerminalStock(frame, surfaces, muzzleZ, inner, outer);
  if (Math.abs(measuredOuterRadiusM-outer) > Math.max(.0005,outer*.01)) {
    throw new Error(`Physical muzzle outer stock does not match its declared radius (${measuredOuterRadiusM} vs ${outer} m)`);
  }
  if (Math.abs(measuredProjectionM-projection) > .0015) {
    throw new Error(`Physical muzzle projecting stock differs from its measured lip extent (${measuredProjectionM} vs ${projection} m)`);
  }
  const axialHits = (x: number, y: number): number[] => {
    ray.set(frame.localToWorld(new THREE.Vector3(x, y, frontZ + .01)), direction);
    return ray.intersectObjects(surfaces, false).map(hit => frame.worldToLocal(hit.point.clone()).z);
  };
  const hitZ = (x: number, y: number): number | null => axialHits(x, y)[0] ?? null;
  let minimumDepthM = Infinity;
  // Avoid exact fan centers and radial triangle seams: transformed coplanar
  // edge rays can miss both adjacent triangles through floating-point error.
  const sampleRing = (radius: number) => [.173, 1.887, 3.349, 4.941]
    .map(angle => [Math.cos(angle) * radius, Math.sin(angle) * radius]);
  for (const [x, y] of [[inner * .001, inner * .00137], ...sampleRing(inner * .6)]) {
    const z = hitZ(x, y);
    const measured = z === null ? Infinity : muzzleZ - z;
    if (!Number.isFinite(measured) || Math.abs(measured - depth) > .005) {
      throw new Error(`Physical muzzle aperture is capped or lacks its ${depth} m backstop (${measured} m at ${x}, ${y}; ${surfaces.map(s => s.name).join(",")})`);
    }
    minimumDepthM = Math.min(minimumDepthM, measured);
  }
  const maximumRimOffsetM = verifyAnnularRim(bore, muzzleZ, axialHits, sampleRing);
  const maximumWallErrorM = verifyWallStock(frame, surfaces, ray, muzzleZ, depth, inner, sampleRing);
  return { minimumDepthM, maximumRimOffsetM, maximumWallErrorM, measuredOuterRadiusM, measuredProjectionM };
}

/** A measured brake lip may hide the middle of the mouth annulus. Keep the
 * original first-hit test unless that declared projection actually intervenes.
 * Then require both the seated middle stock behind it and exposed inner stock;
 * the lip itself cannot substitute for a missing or displaced annular face. */
function verifyAnnularRim(
  bore: PhysicalMuzzleBore, muzzleZ: number, axialHits: (x: number, y: number) => number[],
  sampleRing: (radius: number) => number[][],
): number {
  const { outerRadiusM: outer, innerRadiusM: inner } = bore;
  const projection = bore.rimProjectionM ?? 0;
  let maximumOffset = 0;
  let occluded = false;
  for (const [x, y] of sampleRing((outer + inner) / 2)) {
    const hits = axialHits(x, y);
    let seated: number | undefined = hits[0];
    if (projection > 0 && seated !== undefined && seated > muzzleZ + .005) {
      if (seated > muzzleZ + projection + .0015) throw new Error('Physical muzzle annulus occluder exceeds its declared projection');
      occluded = true;
      seated = hits.find(z => Math.abs(z - muzzleZ) <= .005);
    }
    if (seated === undefined || Math.abs(seated - muzzleZ) > .005) throw new Error('Physical muzzle lacks a seated annular rim');
    maximumOffset = Math.max(maximumOffset, Math.abs(seated - muzzleZ));
  }
  if (occluded) {
    for (const [x, y] of sampleRing(inner + (outer - inner) * .25)) {
      const first = axialHits(x, y)[0];
      if (first === undefined || Math.abs(first - muzzleZ) > .005) throw new Error('Physical muzzle lacks a first-visible inner annulus');
      maximumOffset = Math.max(maximumOffset, Math.abs(first - muzzleZ));
    }
  }
  return maximumOffset;
}

/** Scalar terminal envelope in the same gun frame; does not alter stock. */
function measureTerminalStock(
  frame: THREE.Object3D, surfaces: readonly THREE.Object3D[], muzzleZ: number, inner: number, outer: number,
): { frontZ: number; measuredOuterRadiusM: number; measuredProjectionM: number } {
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const inverseFrame = frame.matrixWorld.clone().invert();
  let frontZ = muzzleZ;
  let measuredOuterRadiusM = 0;
  let measuredProjectionM = 0;
  for (const surface of surfaces) {
    if (!(surface instanceof THREE.Mesh)) continue;
    const positions = surface.geometry.getAttribute('position');
    matrix.multiplyMatrices(inverseFrame, surface.matrixWorld);
    for (let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(matrix);
      frontZ = Math.max(frontZ, point.z);
      const radial = Math.hypot(point.x, point.y);
      if (radial >= inner && radial <= outer*1.001 && point.z >= muzzleZ) {
        measuredProjectionM = Math.max(measuredProjectionM, point.z-muzzleZ);
      }
      if (Math.abs(point.z-muzzleZ) <= .0001) {
        measuredOuterRadiusM=Math.max(measuredOuterRadiusM,Math.hypot(point.x,point.y));
      }
    }
  }
  return { frontZ, measuredOuterRadiusM, measuredProjectionM };
}

/** Verify all existing radial wall witnesses independently of axial seating. */
function verifyWallStock(
  frame: THREE.Object3D, surfaces: THREE.Object3D[], ray: THREE.Raycaster,
  muzzleZ: number, depth: number, inner: number, sampleRing: (radius: number) => number[][],
): number {
  let maximumWallErrorM = 0;
  for (const fraction of [.2, .55, .85]) for (const [x, y] of sampleRing(1)) {
    ray.set(frame.localToWorld(new THREE.Vector3(0, 0, muzzleZ - depth * fraction)),
      new THREE.Vector3(x, y, 0).transformDirection(frame.matrixWorld));
    const hit = ray.intersectObjects(surfaces, false)[0];
    const point = hit ? frame.worldToLocal(hit.point.clone()) : null;
    const radiusError = point ? Math.abs(Math.hypot(point.x, point.y) - inner) : Infinity;
    // Fourteen-sided LOW cylinders have a 2.5% chord inset; retain that actual
    // stock instead of requiring a mathematically smooth circular surface.
    if (radiusError > Math.max(.0005, inner * .03)) {
      throw new Error(`Physical muzzle lacks inward-facing bore wall stock (${radiusError} m)`);
    }
    maximumWallErrorM = Math.max(maximumWallErrorM, radiusError);
  }
  return maximumWallErrorM;
}
