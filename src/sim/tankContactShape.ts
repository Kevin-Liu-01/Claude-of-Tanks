/**
 * Tight, cached body-contact bounds derived from the same finalized hull shell
 * used by armor traces and rollover ground support. Published dimensions are
 * presentation measurements and can include antennas, gun overhang, or omit
 * skirts; they are only a fallback for synthetic/unfinalized fixtures.
 */

export interface TankContactRect {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfLength: number;
  minY: number;
  maxY: number;
  height: number;
  exact: boolean;
}

interface ContactSpec {
  dims: { widthM: number; hullLengthM: number; heightM: number };
  armor?: { bodyContactPoints?: { hull?: readonly number[] } };
}

const cache = new WeakMap<object, { source: unknown; rect: TankContactRect }>();

export function tankContactRect(spec: ContactSpec): TankContactRect {
  const points = spec?.armor?.bodyContactPoints?.hull;
  const source = Array.isArray(points) && points.length >= 12 ? points : spec.dims;
  const previous = cache.get(spec as object);
  if (previous?.source === source) return previous.rect;

  let minX = -spec.dims.widthM * 0.5;
  let maxX = spec.dims.widthM * 0.5;
  let minY = 0;
  let maxY = spec.dims.heightM;
  let minZ = -spec.dims.hullLengthM * 0.5;
  let maxZ = spec.dims.hullLengthM * 0.5;
  const exact = source === points;
  if (exact) {
    minX = minY = minZ = Infinity;
    maxX = maxY = maxZ = -Infinity;
    for (let index = 0; index < points.length; index += 3) {
      const x = points[index];
      const y = points[index + 1];
      const z = points[index + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const rect = Object.freeze({
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidth: Math.max(0.05, (maxX - minX) * 0.5),
    halfLength: Math.max(0.05, (maxZ - minZ) * 0.5),
    minY,
    maxY,
    height: Math.max(0.1, maxY - minY),
    exact,
  });
  cache.set(spec as object, { source, rect });
  return rect;
}
