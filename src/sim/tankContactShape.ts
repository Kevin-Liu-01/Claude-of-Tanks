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

interface ContactBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

type ContactBoundsSource = ContactSpec['dims'] | readonly number[];

const cache = new WeakMap<ContactSpec, {
  source: ContactBoundsSource;
  rect: TankContactRect;
}>();

function hasExactContactPoints(
  points: readonly number[] | undefined,
): points is readonly number[] {
  return Array.isArray(points) && points.length >= 12;
}

function publishedContactBounds(dims: ContactSpec['dims']): ContactBounds {
  return {
    minX: -dims.widthM * 0.5,
    maxX: dims.widthM * 0.5,
    minY: 0,
    maxY: dims.heightM,
    minZ: -dims.hullLengthM * 0.5,
    maxZ: dims.hullLengthM * 0.5,
  };
}

function exactContactBounds(points: readonly number[]): ContactBounds {
  const bounds: ContactBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (let index = 0; index < points.length; index += 3) {
    const x = points[index];
    const y = points[index + 1];
    const z = points[index + 2];
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  return bounds;
}

function contactRectFromBounds(bounds: ContactBounds, exact: boolean): TankContactRect {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  return Object.freeze({
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidth: Math.max(0.05, (maxX - minX) * 0.5),
    halfLength: Math.max(0.05, (maxZ - minZ) * 0.5),
    minY,
    maxY,
    height: Math.max(0.1, maxY - minY),
    exact,
  });
}

export function tankContactRect(spec: ContactSpec): TankContactRect {
  const points = spec?.armor?.bodyContactPoints?.hull;
  const exact = hasExactContactPoints(points);
  const source: ContactBoundsSource = exact ? points : spec.dims;
  const previous = cache.get(spec);
  if (previous?.source === source) return previous.rect;

  const bounds = exact ? exactContactBounds(points) : publishedContactBounds(spec.dims);
  const rect = contactRectFromBounds(bounds, exact);
  cache.set(spec, { source, rect });
  return rect;
}
