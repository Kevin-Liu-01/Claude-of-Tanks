/**
 * Tight, cached body-contact bounds derived from the same finalized hull shell
 * used by armor traces and rollover ground support. Published dimensions are
 * presentation measurements and can include antennas, gun overhang, or omit
 * skirts; they are only a fallback for synthetic/unfinalized fixtures.
 */

interface TankContactRect {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfLength: number;
  minY: number;
  maxY: number;
  height: number;
  exact: boolean;
  /** How far the shell's underside rises above the root at the nose and the tail (the lowest point in the front and
   * rear tenths of its length, never below 0): the glacis and tail plates the track plane runs under. */
  frontLiftM: number;
  rearLiftM: number;
}

interface ContactSpec {
  dims: { widthM: number; hullLengthM: number; heightM: number };
  armor?: {
    bodyContactPoints?: { hull?: readonly number[]; turret?: readonly number[] };
    turretPivot?: readonly number[];
    modules?: readonly { module: string; min: readonly number[]; max: readonly number[] }[];
  };
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

/** The lowest shell point (local y) in the front and rear tenths of the hull's length, clamped at the root. */
function endLifts(points: readonly number[], minZ: number, maxZ: number): { front: number; rear: number } {
  const band = (maxZ - minZ) * 0.1;
  let front = Infinity, rear = Infinity;
  for (let index = 0; index + 2 < points.length; index += 3) {
    const y = points[index + 1], z = points[index + 2];
    if (z >= maxZ - band && y < front) front = y;
    if (z <= minZ + band && y < rear) rear = y;
  }
  return { front: Number.isFinite(front) ? Math.max(0, front) : 0, rear: Number.isFinite(rear) ? Math.max(0, rear) : 0 };
}

function contactRectFromBounds(bounds: ContactBounds, exact: boolean, points: readonly number[] | null): TankContactRect {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const lifts = points ? endLifts(points, minZ, maxZ) : { front: 0, rear: 0 };
  return Object.freeze({
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidth: Math.max(0.05, (maxX - minX) * 0.5),
    halfLength: Math.max(0.05, (maxZ - minZ) * 0.5),
    minY,
    maxY,
    height: Math.max(0.1, maxY - minY),
    exact,
    frontLiftM: lifts.front,
    rearLiftM: lifts.rear,
  });
}

const topCache = new WeakMap<ContactSpec, number>();

/**
 * Height of the hull-plus-turret shell above ground contact — the body a structure part must clear for the hull to
 * pass beneath it. Exact shells come from the same finalized armor as the contact rect; synthetic fixtures fall
 * back to the published height.
 */
export function tankBodyTopM(spec: ContactSpec): number {
  const cached = topCache.get(spec);
  if (cached !== undefined) return cached;
  let top = tankContactRect(spec).maxY;
  const turret = spec?.armor?.bodyContactPoints?.turret;
  if (hasExactContactPoints(turret)) {
    top = Math.max(top, exactContactBounds(turret).maxY + (spec.armor?.turretPivot?.[1] ?? 0));
  }
  if (!(top > 0.1)) top = spec.dims.heightM;
  topCache.set(spec, top);
  return top;
}

export function tankContactRect(spec: ContactSpec): TankContactRect {
  const points = spec?.armor?.bodyContactPoints?.hull;
  const exact = hasExactContactPoints(points);
  const source: ContactBoundsSource = exact ? points : spec.dims;
  const previous = cache.get(spec);
  if (previous?.source === source) return previous.rect;

  const bounds = exact ? exactContactBounds(points) : publishedContactBounds(spec.dims);
  const rect = contactRectFromBounds(bounds, exact, exact ? points : null);
  cache.set(spec, { source, rect });
  return rect;
}

/**
 * The hull's centre of mass along its length, from the centre of its track contact (m, + toward the nose; physics lane
 * round 5). The anatomy places the masses that move it: the turret at its pivot (TURRET_MASS_SHARE of the vehicle) and
 * the power pack, the engine and transmission modules, at their middle (POWER_PACK_MASS_SHARE); the hull, its armour
 * and its running gear stand on the track contact's centre. A rear-engined tank's centre of mass sits a quarter to a
 * third of a metre behind its tracks' middle (T-90M 0.24 m, M1A2 0.35 m), a Merkava's, its engine forward, a quarter to
 * two fifths of a metre ahead; an IFV with its engine forward and its turret aft (Bradley, CV90) keeps it near the
 * middle. 0 for a hull without an anatomy (a synthetic fixture).
 */
const TURRET_MASS_SHARE = 0.3;
const POWER_PACK_MASS_SHARE = 0.1;
const massCache = new WeakMap<ContactSpec, {
  modules: unknown; pivot: unknown; rect: TankContactRect; offset: number;
}>();
export function tankMassCenterOffsetM(spec: ContactSpec): number {
  const armor = spec?.armor;
  const modules = armor?.modules;
  const pivot = armor?.turretPivot;
  const rect = tankContactRect(spec);
  const cached = massCache.get(spec);
  if (cached && cached.modules === modules && cached.pivot === pivot && cached.rect === rect) return cached.offset;
  let offset = 0;
  if (Array.isArray(modules)) {
    let low = Infinity, high = -Infinity;
    for (const volume of modules) {
      if (volume.module !== 'engine' && volume.module !== 'transmission') continue;
      low = Math.min(low, volume.min[2]);
      high = Math.max(high, volume.max[2]);
    }
    if (Number.isFinite(low) && Number.isFinite(high)) offset += POWER_PACK_MASS_SHARE * ((low + high) / 2 - rect.centerZ);
    if (offset !== 0 && Array.isArray(pivot) && Number.isFinite(pivot[2])) {
      offset += TURRET_MASS_SHARE * (pivot[2] - rect.centerZ);
    }
  }
  massCache.set(spec, { modules, pivot, rect, offset });
  return offset;
}
