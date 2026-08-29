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

export interface StructureAttachmentPart {
  id: string;
  geometry: BufferGeometry;
  support: string;
}

export interface StructureAttachmentRecord {
  part: string;
  support: string;
  gap: number;
}

export interface StructureAttachmentReceipt {
  id: string;
  parts: number;
  maxGap: number;
  epsilon: number;
  records: StructureAttachmentRecord[];
}

function boundsGap(a: Box3, b: Box3): number {
  const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x);
  const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y);
  const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z);
  return Math.hypot(dx, dy, dz);
}

/**
 * Verify named fixture-to-support joints before authoring parts are merged.
 * Unlike the whole-assembly flood fill below, this catches a lamp head that
 * happens to touch some unrelated AABB but not the arm intended to carry it.
 */
export function certifyStructureAttachments(
  id: string,
  base: { id: string; geometry: BufferGeometry },
  parts: StructureAttachmentPart[],
  epsilon = 0.025,
): StructureAttachmentReceipt {
  if (!id || !base.id || !parts.length || !(epsilon >= 0)) {
    throw new TypeError(`${id || 'structure'}: invalid attachment audit`);
  }
  const supports = new Map<string, Box3>();
  base.geometry.computeBoundingBox();
  if (!base.geometry.boundingBox) throw new Error(`${id}: ${base.id} has no finite bounds`);
  supports.set(base.id, base.geometry.boundingBox.clone());
  const records: StructureAttachmentRecord[] = [];
  let maxGap = 0;
  for (const part of parts) {
    if (!part.id || supports.has(part.id)) throw new Error(`${id}: duplicate attachment ${part.id}`);
    const support = supports.get(part.support);
    if (!support) throw new Error(`${id}: attachment ${part.id} has missing support ${part.support}`);
    part.geometry.computeBoundingBox();
    if (!part.geometry.boundingBox) throw new Error(`${id}: attachment ${part.id} has no finite bounds`);
    const bounds = part.geometry.boundingBox.clone();
    const gap = boundsGap(bounds, support);
    if (gap > epsilon) {
      throw new Error(`${id}: attachment ${part.id} floats ${gap.toFixed(3)} m from ${part.support}`);
    }
    maxGap = Math.max(maxGap, gap);
    records.push({ part: part.id, support: part.support, gap });
    supports.set(part.id, bounds);
  }
  return { id, parts: records.length + 1, maxGap, epsilon, records };
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
