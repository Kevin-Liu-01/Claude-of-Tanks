import * as THREE from 'three';

type EraSurface = number[][];
interface SurfaceDescriptor {
  center: THREE.Vector3;
  normal: THREE.Vector3;
}

function describeEraSurface(surface: EraSurface): SurfaceDescriptor {
  const center = surface.reduce(
    (sum, value) => sum.add(new THREE.Vector3().fromArray(value)), new THREE.Vector3(),
  ).multiplyScalar(1 / surface.length);
  const origin = new THREE.Vector3().fromArray(surface[0]);
  const normal = new THREE.Vector3().fromArray(surface[1]).sub(origin)
    .cross(new THREE.Vector3().fromArray(surface[3]).sub(origin)).normalize();
  return { center, normal };
}

/** Preserve the legacy first-match/outward-face policy and exact arithmetic.
 * Descriptors belong only to this invocation. Retained surfaces are immutable
 * during the scan, so comparing them never needs another point-cloud summary.
 */
export function deduplicateEraSurfaces(surfaces: readonly EraSurface[]): EraSurface[] {
  const deduplicated: EraSurface[] = [];
  const descriptors: SurfaceDescriptor[] = [];
  for (const surface of surfaces) {
    const descriptor = describeEraSurface(surface);
    const duplicateIndex = descriptors.findIndex((candidate) =>
      descriptor.normal.dot(candidate.normal) > 0.995
        && descriptor.center.distanceTo(candidate.center) < 0.05);
    if (duplicateIndex < 0) {
      deduplicated.push(surface);
      descriptors.push(descriptor);
      continue;
    }
    const candidateDescriptor = descriptors[duplicateIndex];
    if (descriptor.center.dot(descriptor.normal)
        > candidateDescriptor.center.dot(descriptor.normal)) {
      deduplicated[duplicateIndex] = surface;
      descriptors[duplicateIndex] = descriptor;
    }
  }
  return deduplicated;
}
