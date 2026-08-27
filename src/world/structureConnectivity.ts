import { Box3, Vector3, type BufferGeometry } from 'three';

export interface StructureConnectivityReceipt {
  id: string;
  parts: number;
  connected: number;
  groundSupported: number;
  maxConnectionGap: number;
  epsilon: number;
}

export interface StructureConnectivityOptions {
  epsilon?: number;
  groundMinY?: number;
  groundMaxY?: number;
}

function boundsGap(a: Box3, b: Box3): number {
  const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x);
  const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y);
  const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z);
  return Math.hypot(dx, dy, dz);
}

/**
 * Certify that every authored structure part reaches the ground through a
 * touching support chain. A site may contain several grounded assemblies
 * (for example market stalls inside a walled compound), but no fixture may
 * float. Run this before material-bucket merging erases part identity.
 */
export function certifyGroundedStructureParts(
  id: string,
  parts: BufferGeometry[],
  {
    epsilon = 0.12,
    groundMinY = -0.14,
    groundMaxY = 0.10,
  }: StructureConnectivityOptions = {},
): StructureConnectivityReceipt {
  if (!id || !parts.length) throw new Error(`${id || 'structure'}: structure has no authored parts`);
  if (!(epsilon >= 0) || !(groundMaxY >= groundMinY)) {
    throw new TypeError(`${id}: invalid structure connectivity envelope`);
  }

  const bounds = parts.map((geometry) => {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
      throw new Error(`${id}: authored structure part has no finite bounds`);
    }
    return geometry.boundingBox.clone();
  });
  const footprint = bounds.slice(1).reduce(
    (all, partBounds) => all.union(partBounds),
    bounds[0].clone(),
  );
  const ground = new Box3(
    new Vector3(footprint.min.x, groundMinY, footprint.min.z),
    new Vector3(footprint.max.x, groundMaxY, footprint.max.z),
  );
  const connected = new Set<number>();
  const pending: Box3[] = [ground];
  let groundSupported = 0;
  let maxConnectionGap = 0;

  while (pending.length) {
    const support = pending.pop()!;
    for (let candidate = 0; candidate < bounds.length; candidate++) {
      if (connected.has(candidate)) continue;
      const gap = boundsGap(support, bounds[candidate]);
      if (gap > epsilon) continue;
      maxConnectionGap = Math.max(maxConnectionGap, gap);
      if (support === ground) groundSupported++;
      connected.add(candidate);
      pending.push(bounds[candidate]);
    }
  }

  if (connected.size !== parts.length) {
    const detached = bounds
      .map((_, index) => index)
      .filter((index) => !connected.has(index));
    throw new Error(`${id}: ${detached.length} floating authored part${
      detached.length === 1 ? '' : 's'} (${detached.join(', ')})`);
  }

  return {
    id,
    parts: parts.length,
    connected: connected.size,
    groundSupported,
    maxConnectionGap,
    epsilon,
  };
}
