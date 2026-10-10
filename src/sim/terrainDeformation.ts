/**
 * terrainDeformation.ts — the ground a match deforms (destruction core lane, 2026-10-07; docs/DESTRUCTION.md §7).
 *
 * A per-match overlay of stamps added to the terrain the simulation drives on: craters (a bowl and a thrown rim,
 * ragged by a seed) and rubble mounds (a collapsed structure's heap over its footprint, a cosine skirt every hull can
 * climb). `createDeformedHeightField` wraps a match's height field once: heights add `offsetAt`, the contact surface
 * adds the offsets of its triangle's three lattice vertices with the same weights (terrainContactSurface.ts: the
 * 1.333 m lattice and its diagonal), so the contact surface is exactly a mesh whose vertices moved by `offsetAt` —
 * what the presentation draws. The base field is never touched: a cached world or a shared terrain keeps no stamp
 * after its match.
 *
 * Pure, deterministic in the stamps and their order, Node-runnable; one bucket read answers a query far from every
 * stamp. Allocates when a stamp is added, never per query.
 */
import { Vector3 } from 'three';

/** Stamps are bucketed on a 16 m grid over the 1,024 m map. */
const BUCKET_M = 16;
const WORLD_HALF_M = 512;
const BUCKETS = (WORLD_HALF_M * 2) / BUCKET_M;
/** At most this many stamps touch one bucket (a pit under repeated fire stops deepening there). */
export const STAMPS_PER_BUCKET = 8;
/** The overlay's clamp (§7). */
const MAX_DEPTH_M = 2.5;
const MAX_RAISE_M = 3;
/** The terrain contact lattice (terrainContactSurface.ts): 1,024 m in 768 cells. */
const LATTICE_STEP = 128 / 96;
const LATTICE_CELLS = 768;
/** A crater's influence reaches 2 R (its rim's broad outer flank); the flank fades out over the last 0.4 R. */
const CRATER_REACH = 2;
const CRATER_FADE_START = 1.6;
/**
 * The rim (crater round 3, 2026-10-08): its crest at the bowl's ragged edge, steep inside (0.3 R) and a broad thrown
 * flank outside (0.55 R), broad enough that the 1.333 m lattice the ground is drawn and driven on carries it (the old
 * 0.35 R flank lost most of a 125 mm crater's rim between the lattice's vertices); its height broken round the crater
 * by the seed, 0.55–1.45 of the rim: thrown earth, not a torus.
 */
const RIM_INNER = 0.3;
const RIM_OUTER = 0.55;
const RIM_BREAK = 0.45;
/** Rubble: the plateau holds the inner 70 % of the footprint; the skirt runs max(3, 2.2·h) m past its edge. */
const RUBBLE_PLATEAU = 0.7;
const RUBBLE_SKIRT_MIN_M = 3;
const RUBBLE_SKIRT_PER_HEIGHT = 2.2;
const NORMAL_EPS_M = 1.2;

export interface CraterStamp {
  readonly kind: 'crater';
  readonly x: number;
  readonly z: number;
  readonly radiusM: number;
  readonly depthM: number;
  readonly rimM: number;
  readonly seed: number;
  /** Angular wobble phases of the ragged rim (from the seed). */
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
}

export interface RubbleStamp {
  readonly kind: 'rubble';
  readonly cx: number;
  readonly cz: number;
  readonly hw: number;
  readonly hd: number;
  readonly yaw: number;
  readonly heightM: number;
  /** cos / sin of the yaw, and the falloff width past the plateau. */
  readonly c: number;
  readonly s: number;
  readonly falloffM: number;
}

export type TerrainStamp = CraterStamp | RubbleStamp;

/**
 * The ground a stamp moves, as an axis-aligned box [minX, minZ, maxX, maxZ] into `out` (a crater's 2 R influence with
 * its 10 % wobble margin; a heap's rotated footprint grown by its skirt): what a renderer re-reads (crater-render-spec §B).
 */
export function stampBounds(stamp: TerrainStamp, out: number[] | Float64Array): number[] | Float64Array {
  if (stamp.kind === 'crater') {
    const reach = stamp.radiusM * CRATER_REACH * 1.1;
    out[0] = stamp.x - reach; out[1] = stamp.z - reach; out[2] = stamp.x + reach; out[3] = stamp.z + reach;
    return out;
  }
  const ex = Math.abs(stamp.s) * stamp.hd + Math.abs(stamp.c) * stamp.hw + stamp.falloffM;
  const ez = Math.abs(stamp.c) * stamp.hd + Math.abs(stamp.s) * stamp.hw + stamp.falloffM;
  out[0] = stamp.cx - ex; out[1] = stamp.cz - ez; out[2] = stamp.cx + ex; out[3] = stamp.cz + ez;
  return out;
}

export interface TerrainDeformation {
  /** Stamps in the order they were added (the order every peer adds them). */
  readonly stamps: readonly TerrainStamp[];
  /** Grows by one with every stamp (consumers re-read the ground when it moves). */
  readonly revision: number;
  /** The highest the overlay can raise the ground (a ray march's ceiling). */
  readonly maxRaiseM: number;
  /** Whether any stamp touches the 16 m bucket of (x, z). */
  near(x: number, z: number): boolean;
  /** The overlay at (x, z): the stamps' sum, clamped to [−2.5, +3] m. */
  offsetAt(x: number, z: number): number;
  /** The overlay on the terrain contact lattice's triangle under (x, z) (§7: what a deformed mesh would carry). */
  contactOffsetAt(x: number, z: number): number;
  /** A crater; false when its buckets are full (the caller then makes it a mark). */
  addCrater(x: number, z: number, radiusM: number, depthM: number, rimM: number, seed: number): boolean;
  /** A collapsed structure's heap over its footprint (cx, cz, half extents across/along, yaw), `heightM` high. */
  addRubble(cx: number, cz: number, hw: number, hd: number, yaw: number, heightM: number): void;
  /** Every stamp gone (a cached world's next battle). */
  reset(): void;
}

function bucketIndex(value: number): number {
  const index = Math.floor((value + WORLD_HALF_M) / BUCKET_M);
  return index < 0 ? 0 : index >= BUCKETS ? BUCKETS - 1 : index;
}

/** The rubble height for a structure of `heightM` (§7): 0.18 of its height, 0.6–2.6 m. */
export function rubbleHeightFor(structureHeightM: number): number {
  return Math.max(0.6, Math.min(2.6, 0.18 * Math.max(0, structureHeightM)));
}

/** A crater's profile at distance r from its centre and angle a (§7): a bowl, a rim broken round it, ragged by the
 * seed's phases. */
export function craterProfile(stamp: CraterStamp, r: number, angle: number): number {
  const wobble = 1 + 0.08 * (0.5 * Math.sin(3 * angle + stamp.p1) + 0.3 * Math.sin(5 * angle + stamp.p2)
    + 0.2 * Math.sin(7 * angle + stamp.p3));
  const radius = stamp.radiusM * wobble;
  if (!(radius > 0) || r >= radius * CRATER_REACH) return 0;
  const q = r / radius;
  const bowl = q < 1 ? -stamp.depthM * (1 - q * q) * (1 - q * q) : 0;
  const ring = (q - 1) / (q < 1 ? RIM_INNER : RIM_OUTER);
  const broken = 1 + RIM_BREAK * (0.5 * Math.sin(2 * angle + stamp.p2) + 0.3 * Math.sin(4 * angle + stamp.p3)
    + 0.2 * Math.sin(6 * angle + stamp.p1));
  let rim = stamp.rimM * broken * Math.exp(-ring * ring);
  if (q > CRATER_FADE_START) {
    const t = (CRATER_REACH - q) / (CRATER_REACH - CRATER_FADE_START);
    rim *= t * t * (3 - 2 * t);
  }
  return bowl + rim;
}

/** A collapsed structure's heap as the sim raises it: its footprint (world frame) and height (§7). */
export interface RubbleMound {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  yaw: number;
  heightM: number;
}

/**
 * The heap's height above the ground at world (x, z) — the exact profile the simulation adds to the terrain when the
 * structure collapses (the plateau over the inner 70 % of the footprint, a cosine skirt to nothing), for the
 * presentation and the kits to seat rubble on so tracks meet what the eye sees.
 */
export function rubbleMoundHeightAt(mound: RubbleMound, x: number, z: number): number {
  const height = Math.max(0, mound.heightM);
  const falloff = rubbleFalloffM(mound.hw, mound.hd, height);
  const c = Math.cos(mound.yaw), s = Math.sin(mound.yaw);
  const dx = x - mound.cx, dz = z - mound.cz;
  const along = Math.abs(dx * s + dz * c) - mound.hd * RUBBLE_PLATEAU;
  const across = Math.abs(dx * c - dz * s) - mound.hw * RUBBLE_PLATEAU;
  const ox = across > 0 ? across : 0, oz = along > 0 ? along : 0;
  const outside = Math.sqrt(ox * ox + oz * oz);
  return outside >= falloff ? 0 : height * 0.5 * (1 + Math.cos(Math.PI * outside / falloff));
}

/** A rubble mound's profile at (x, z) (§7): the plateau's height, a cosine skirt to nothing. */
export function rubbleProfile(stamp: RubbleStamp, x: number, z: number): number {
  const dx = x - stamp.cx, dz = z - stamp.cz;
  // forward (sin yaw, cos yaw) along hd, right (cos yaw, −sin yaw) across hw
  const along = Math.abs(dx * stamp.s + dz * stamp.c) - stamp.hd * RUBBLE_PLATEAU;
  const across = Math.abs(dx * stamp.c - dz * stamp.s) - stamp.hw * RUBBLE_PLATEAU;
  const ox = across > 0 ? across : 0, oz = along > 0 ? along : 0;
  const outside = Math.sqrt(ox * ox + oz * oz);
  if (outside >= stamp.falloffM) return 0;
  return stamp.heightM * 0.5 * (1 + Math.cos(Math.PI * outside / stamp.falloffM));
}

/** The seed's three wobble phases (deterministic, no RNG state): a crater's ragged edge, and the presentation's decal
 * edge that follows it (crater-render-spec §D) — one law, not a copy. */
export function craterWobblePhases(seed: number): [number, number, number] {
  return phases(seed);
}
function phases(seed: number): [number, number, number] {
  const s = seed >>> 0;
  return [((s & 0xff) / 256) * Math.PI * 2, (((s >>> 8) & 0xff) / 256) * Math.PI * 2, (((s >>> 16) & 0xff) / 256) * Math.PI * 2];
}

export function createTerrainDeformation(): TerrainDeformation {
  const stamps: TerrainStamp[] = [];
  // per bucket: how many stamps touch it, and their indices (STAMPS_PER_BUCKET slots each)
  const counts = new Uint8Array(BUCKETS * BUCKETS);
  const slots = new Int32Array(BUCKETS * BUCKETS * STAMPS_PER_BUCKET);
  let revision = 0;
  let maxRaise = 0;

  function bucketsOf(x0: number, z0: number, x1: number, z1: number, visit: (bucket: number) => boolean): boolean {
    for (let bz = bucketIndex(z0); bz <= bucketIndex(z1); bz++) {
      for (let bx = bucketIndex(x0); bx <= bucketIndex(x1); bx++) if (!visit(bz * BUCKETS + bx)) return false;
    }
    return true;
  }

  function admit(stamp: TerrainStamp, x0: number, z0: number, x1: number, z1: number, force: boolean): boolean {
    // a crater stops where its buckets are full; a rubble mound always lands (it replaces a building's own ground)
    if (!force && !bucketsOf(x0, z0, x1, z1, (bucket) => counts[bucket] < STAMPS_PER_BUCKET)) return false;
    const index = stamps.length;
    stamps.push(stamp);
    bucketsOf(x0, z0, x1, z1, (bucket) => {
      if (counts[bucket] < STAMPS_PER_BUCKET) {
        slots[bucket * STAMPS_PER_BUCKET + counts[bucket]] = index;
        counts[bucket]++;
      }
      return true;
    });
    revision++;
    return true;
  }

  function offsetAt(x: number, z: number): number {
    const bucket = bucketIndex(z) * BUCKETS + bucketIndex(x);
    const count = counts[bucket];
    if (count === 0) return 0;
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const stamp = stamps[slots[bucket * STAMPS_PER_BUCKET + k]];
      if (stamp.kind === 'crater') {
        const dx = x - stamp.x, dz = z - stamp.z;
        const r = Math.sqrt(dx * dx + dz * dz);
        if (r < stamp.radiusM * CRATER_REACH * 1.1) sum += craterProfile(stamp, r, Math.atan2(dz, dx));
      } else {
        sum += rubbleProfile(stamp, x, z);
      }
    }
    return sum < -MAX_DEPTH_M ? -MAX_DEPTH_M : sum > MAX_RAISE_M ? MAX_RAISE_M : sum;
  }

  function latticeOffset(ix: number, iz: number): number {
    return offsetAt(-WORLD_HALF_M + ix * LATTICE_STEP, -WORLD_HALF_M + iz * LATTICE_STEP);
  }

  function contactOffsetAt(x: number, z: number): number {
    if (counts[bucketIndex(z) * BUCKETS + bucketIndex(x)] === 0) return 0;
    const gx = Math.max(0, Math.min(LATTICE_CELLS - 1e-6, (x + WORLD_HALF_M) / LATTICE_STEP));
    const gz = Math.max(0, Math.min(LATTICE_CELLS - 1e-6, (z + WORLD_HALF_M) / LATTICE_STEP));
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const u = gx - ix, v = gz - iz;
    // the contact sampler's triangle split (terrainContactSurface.ts): a, b = +x, c = +z, d = +x+z
    const b = latticeOffset(ix + 1, iz), c = latticeOffset(ix, iz + 1);
    if (u + v <= 1) {
      const a = latticeOffset(ix, iz);
      return a + (b - a) * u + (c - a) * v;
    }
    const d = latticeOffset(ix + 1, iz + 1);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  return {
    stamps,
    get revision() { return revision; },
    get maxRaiseM() { return maxRaise; },
    near: (x, z) => counts[bucketIndex(z) * BUCKETS + bucketIndex(x)] > 0,
    offsetAt,
    contactOffsetAt,
    addCrater(x, z, radiusM, depthM, rimM, seed) {
      if (!(radiusM > 0)) return false;
      const [p1, p2, p3] = phases(seed);
      const reach = radiusM * CRATER_REACH * 1.1;
      const stamp: CraterStamp = { kind: 'crater', x, z, radiusM, depthM, rimM, seed: seed >>> 0, p1, p2, p3 };
      const admitted = admit(stamp, x - reach, z - reach, x + reach, z + reach, false);
      if (admitted) maxRaise = Math.min(MAX_RAISE_M, maxRaise + rimM * (1 + RIM_BREAK));
      return admitted;
    },
    addRubble(cx, cz, hw, hd, yaw, heightM) {
      const height = Math.max(0, heightM);
      const falloff = rubbleFalloffM(hw, hd, height);
      const stamp: RubbleStamp = { kind: 'rubble', cx, cz, hw, hd, yaw, heightM: height,
        c: Math.cos(yaw), s: Math.sin(yaw), falloffM: falloff };
      const ex = Math.abs(stamp.s) * hd + Math.abs(stamp.c) * hw + falloff;
      const ez = Math.abs(stamp.c) * hd + Math.abs(stamp.s) * hw + falloff;
      admit(stamp, cx - ex, cz - ez, cx + ex, cz + ez, true);
      maxRaise = Math.min(MAX_RAISE_M, maxRaise + height);
    },
    reset() {
      stamps.length = 0;
      counts.fill(0);
      revision++;
      maxRaise = 0;
    },
  };
}

/** The slice of a height field the wrapper overrides; everything else reads through to the base. */
export interface DeformableHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
  getNormalAt?(x: number, z: number): unknown;
  maxY?: number;
}

/** The ground a rubble mound reaches past its footprint (§7): 0.3 of the shorter half extent plus its skirt. */
export function rubbleFalloffM(hw: number, hd: number, heightM: number): number {
  return 0.3 * Math.min(hw, hd) + Math.max(RUBBLE_SKIRT_MIN_M, RUBBLE_SKIRT_PER_HEIGHT * Math.max(0, heightM));
}

/**
 * The match's height field: the base plus the overlay (§7). Every other member (ground types, water, roads, bridge
 * decks, layout) reads through to the base by the prototype chain.
 */
export function createDeformedHeightField<T extends DeformableHeightField>(base: T, overlay: TerrainDeformation): T {
  const field = Object.create(base) as T;
  const normal = new Vector3();
  const baseFast = base.getHeightAtFast ? base.getHeightAtFast.bind(base) : base.getHeightAt.bind(base);
  const baseContact = base.getContactHeightAt ? base.getContactHeightAt.bind(base) : null;
  const getHeightAt = (x: number, z: number): number => base.getHeightAt(x, z) + overlay.offsetAt(x, z);
  Object.defineProperties(field, {
    getHeightAt: { value: getHeightAt, writable: true, configurable: true },
    getHeightAtFast: { value: (x: number, z: number): number => baseFast(x, z) + overlay.offsetAt(x, z), writable: true, configurable: true },
  });
  if (typeof base.getNormalAt === 'function') {
    const baseNormal = base.getNormalAt.bind(base);
    Object.defineProperty(field, 'getNormalAt', {
      value: (x: number, z: number) => {
        if (!overlay.near(x, z) && !overlay.near(x + NORMAL_EPS_M, z) && !overlay.near(x - NORMAL_EPS_M, z)
          && !overlay.near(x, z + NORMAL_EPS_M) && !overlay.near(x, z - NORMAL_EPS_M)) return baseNormal(x, z);
        const hl = getHeightAt(x - NORMAL_EPS_M, z), hr = getHeightAt(x + NORMAL_EPS_M, z);
        const hd = getHeightAt(x, z - NORMAL_EPS_M), hu = getHeightAt(x, z + NORMAL_EPS_M);
        return normal.set(hl - hr, 2 * NORMAL_EPS_M, hd - hu).normalize();
      },
      writable: true, configurable: true,
    });
  }
  if (typeof base.maxY === 'number') {
    Object.defineProperty(field, 'maxY', { get: () => (base.maxY as number) + overlay.maxRaiseM, configurable: true });
  }
  if (baseContact) {
    Object.defineProperty(field, 'getContactHeightAt', {
      value: (x: number, z: number): number => baseContact(x, z) + overlay.contactOffsetAt(x, z), writable: true, configurable: true,
    });
  }
  return field;
}
