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
/** Rubble: the plateau (its crown) holds the inner 70 % of the footprint; the skirt runs max(3, 2.2·h) m past its edge. */
const RUBBLE_PLATEAU = 0.7;
const RUBBLE_SKIRT_MIN_M = 3;
const RUBBLE_SKIRT_PER_HEIGHT = 2.2;
/**
 * The heap's crown (destruction stream, 2026-10-13; the owner: a building's rubble should not "end up on a flat 2d
 * plane"). The plateau is no longer level: its top falls by up to CROWN_DROP of the heap's height, leaning to one side
 * (the mass slumped that way, CROWN_LEAN of the shape) and broken by two crossed swells no shorter than CROWN_WAVE_M on
 * the ground, so the 1.333 m contact lattice and the drawn ground carry them; the skirt runs down from the crown's height
 * at the plateau's edge. Every heap differs: its lean and swells come from a hash of its footprint's centre to the
 * centimetre, which every peer derives from the same structure records, so the authority, each mirror and the
 * presentation's kits (rubbleMoundHeightAt) raise the same heap. The crown never rises past `heightM` (the overlay's
 * ceilings hold) and never steepens the skirt.
 */
const CROWN_DROP = 0.42;
const CROWN_LEAN = 0.55;
const CROWN_WAVE_M = 4.5;
const CROWN_PARAMS = 9;
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
  /** When the heap began to rise (the overlay's clock, s) and how long it takes (RUBBLE_GROW_S); -Infinity: risen. */
  readonly t0: number;
  readonly growS: number;
  /** Its crown (heapCrown): the lean, the swells' phases and wave numbers. */
  readonly crown: Float64Array;
}

/**
 * A graded earthwork (the proving ground's drive course, 2026-10-20): a band `hw` either side of its axis carrying a
 * piecewise-linear profile along the axis (ramps, a flat top, a ditch, a run of moguls), a cosine skirt `skirtM` past the
 * band's sides. Authored, not dug: the course sums apart from the battle's craters and heaps and keeps its own clamp, so
 * a match without a course reads the ground it always did.
 */
export interface CourseStamp {
  readonly kind: 'course';
  readonly cx: number;
  readonly cz: number;
  /** The axis heading (forward = (sin yaw, cos yaw)) and its cos / sin. */
  readonly yaw: number;
  readonly c: number;
  readonly s: number;
  readonly hw: number;
  readonly skirtM: number;
  /** Knots (u, h) along the axis from its centre, u ascending; the profile is 0 past the first and last knot. */
  readonly profile: Float64Array;
}

export type TerrainStamp = CraterStamp | RubbleStamp | CourseStamp;

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
  if (stamp.kind === 'course') {
    courseExtent(stamp, out);
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
  /** The overlay on the terrain contact lattice's triangle under (x, z) (§7: what a deformed mesh would carry); `flipped`:
   * the base surface splits that cell along its a–d diagonal (world/terrainContactSurface.ts terrainCellFlipped, the
   * base's own Float32 corner heights decide, so the overlay rides the mesh's own triangles). */
  contactOffsetAt(x: number, z: number, flipped?: boolean): number;
  /** A crater; false when its buckets are full (the caller then makes it a mark). */
  addCrater(x: number, z: number, radiusM: number, depthM: number, rimM: number, seed: number): boolean;
  /** A collapsed structure's heap over its footprint (cx, cz, half extents across/along, yaw), `heightM` high, rising
   * from `t0` (the overlay's clock; default now, or risen at once when no clock was set) over RUBBLE_GROW_S. */
  addRubble(cx: number, cz: number, hw: number, hd: number, yaw: number, heightM: number, t0?: number): void;
  /** A graded earthwork (CourseStamp): always lands, risen at once. */
  addCourse(stamp: CourseStamp): void;
  /** Every stamp gone (a cached world's next battle). */
  reset(): void;
  /** The overlay's clock (s, the match's own): a heap rises with it (physics stream, 2026-10-13). */
  setTime(timeS: number): void;
  /** Whether a heap is still rising. */
  readonly growing: boolean;
  /** Grows by one with every clock step that moved a rising heap (a renderer re-reads those heaps' ground). */
  readonly growthRevision: number;
  /** How far stamp `index` has risen (0..1; a crater 1). */
  stampGrowth(index: number): number;
}

const _courseBox = new Float64Array(4);

function bucketIndex(value: number): number {
  const index = Math.floor((value + WORLD_HALF_M) / BUCKET_M);
  return index < 0 ? 0 : index >= BUCKETS ? BUCKETS - 1 : index;
}

/**
 * How long a heap takes to rise (physics stream, 2026-10-13; the census: a hull rammed into a building as it fell was
 * lifted 0.38 m in a step by the heap stamped whole under it): eased in and out over two seconds, the time its walls
 * take to come down onto it, so a hull beside or on the footprint rides it up at under 2 m/s.
 */
export const RUBBLE_GROW_S = 2;
/** The share of its height a heap stands `elapsedS` after it began to rise (smoothstep over RUBBLE_GROW_S). */
export function rubbleGrowth(elapsedS: number, growS = RUBBLE_GROW_S): number {
  if (!(elapsedS < growS)) return 1;
  if (!(elapsedS > 0)) return 0;
  const u = elapsedS / growS;
  return u * u * (3 - 2 * u);
}

/** The rubble height for a structure of `heightM` (§7): 0.18 of its height, 0.6–2.6 m. */
export function rubbleHeightFor(structureHeightM: number): number {
  return Math.max(0.6, Math.min(2.6, 0.18 * Math.max(0, structureHeightM)));
}

/** The course's own clamp: an authored earthwork may stand taller and dig deeper than a battle's heap or crater. */
const MAX_COURSE_M = 6;

/** The ground a course stamp moves, [minX, minZ, maxX, maxZ] into `out`. */
function courseExtent(stamp: CourseStamp, out: number[] | Float64Array): void {
  const profile = stamp.profile;
  const half = Math.max(Math.abs(profile[0] ?? 0), Math.abs(profile[profile.length - 2] ?? 0));
  const across = stamp.hw + stamp.skirtM;
  const ex = Math.abs(stamp.s) * half + Math.abs(stamp.c) * across;
  const ez = Math.abs(stamp.c) * half + Math.abs(stamp.s) * across;
  out[0] = stamp.cx - ex; out[1] = stamp.cz - ez; out[2] = stamp.cx + ex; out[3] = stamp.cz + ez;
}

/** A course stamp's height at world (x, z): the profile along its axis, full across its band, a cosine skirt past it. */
export function courseProfile(stamp: CourseStamp, x: number, z: number): number {
  const dx = x - stamp.cx, dz = z - stamp.cz;
  const u = dx * stamp.s + dz * stamp.c, v = Math.abs(dx * stamp.c - dz * stamp.s);
  const past = v - stamp.hw;
  if (past >= stamp.skirtM) return 0;
  const profile = stamp.profile, last = profile.length - 2;
  if (last < 0 || u <= profile[0] || u >= profile[last]) return 0;
  let k = 0;
  while (k + 2 < last && profile[k + 2] <= u) k += 2;
  const u0 = profile[k], u1 = profile[k + 2];
  const h = profile[k + 1] + (profile[k + 3] - profile[k + 1]) * (u1 > u0 ? (u - u0) / (u1 - u0) : 0);
  return past > 0 ? h * 0.5 * (1 + Math.cos(Math.PI * past / stamp.skirtM)) : h;
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
 * structure collapses (its crown over the inner 70 % of the footprint, a cosine skirt to nothing), for the
 * presentation and the kits to seat rubble on so tracks meet what the eye sees.
 */
export function rubbleMoundHeightAt(mound: RubbleMound, x: number, z: number): number {
  const height = Math.max(0, mound.heightM);
  heapCrown(mound.cx, mound.cz, mound.hw, mound.hd, _moundCrown);
  const h = _moundShape;
  h.cx = mound.cx; h.cz = mound.cz; h.hw = mound.hw; h.hd = mound.hd; h.c = Math.cos(mound.yaw); h.s = Math.sin(mound.yaw);
  h.heightM = height; h.falloffM = rubbleFalloffM(mound.hw, mound.hd, height);
  return heapHeight(h, x, z);
}
const _moundCrown = new Float64Array(CROWN_PARAMS);
const _moundShape: HeapShape = { cx: 0, cz: 0, hw: 0, hd: 0, c: 1, s: 0, heightM: 0, falloffM: 0, crown: _moundCrown };

/** A mound as the overlay's stamp, its crown worked out once: rubbleProfile(stamp, x, z) is rubbleMoundHeightAt(mound, x,
 * z) to the bit, for a ground sampled under falling pieces every step (no crown, no closure a sample). */
export function rubbleStampOf(mound: RubbleMound): RubbleStamp {
  const height = Math.max(0, mound.heightM);
  return { kind: 'rubble', cx: mound.cx, cz: mound.cz, hw: mound.hw, hd: mound.hd, yaw: mound.yaw, heightM: height,
    c: Math.cos(mound.yaw), s: Math.sin(mound.yaw), falloffM: rubbleFalloffM(mound.hw, mound.hd, height), t0: -Infinity,
    growS: RUBBLE_GROW_S, crown: heapCrown(mound.cx, mound.cz, mound.hw, mound.hd, new Float64Array(CROWN_PARAMS)) };
}

/** A rubble mound's profile at (x, z) (§7): its crown over the plateau, a cosine skirt to nothing (`scale` of it: rising;
 * the heap is linear in its height, so a rising heap is the risen one scaled). */
export function rubbleProfile(stamp: RubbleStamp, x: number, z: number, scale = 1): number {
  return scale * heapHeight(stamp, x, z);
}

/** A heap's crown from its footprint (CROWN_DROP): [lean cos, lean sin, three phases, four wave numbers]. */
function heapCrown(cx: number, cz: number, hw: number, hd: number, out: Float64Array): Float64Array {
  let h = Math.imul((Math.round(cx * 100) | 0) ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul((Math.round(cz * 100) | 0) ^ 0x27d4eb2f, 0x85ebca77);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  const turn = (shift: number): number => (((h >>> shift) & 0xff) / 256) * Math.PI * 2;
  const lean = turn(0);
  out[0] = Math.cos(lean); out[1] = Math.sin(lean);
  out[2] = turn(8); out[3] = turn(16); out[4] = turn(24);
  // wave numbers on the plateau normalised to its edges (±1): a swell no shorter than CROWN_WAVE_M on the ground and at
  // most a cycle and a half across the plateau; the second, oblique swell 1.3 times longer
  const ea = Math.max(1e-3, hd * RUBBLE_PLATEAU), eb = Math.max(1e-3, hw * RUBBLE_PLATEAU);
  out[5] = (Math.PI * 2 * ea) / Math.max(CROWN_WAVE_M, (2 * ea) / 1.5);
  out[6] = (Math.PI * 2 * eb) / Math.max(CROWN_WAVE_M, (2 * eb) / 1.5);
  out[7] = out[5] / 1.3; out[8] = out[6] / 1.3;
  return out;
}

/** What a heap's height reads (a stamp's fields): its footprint, yaw's cos and sin, height, falloff and crown. */
interface HeapShape { cx: number; cz: number; hw: number; hd: number; c: number; s: number; heightM: number; falloffM: number;
  crown: Float64Array }
/** The heap at (x, z): the crown at the nearest plateau point, the cosine skirt from it past the plateau's edge. (Its
 *  shape by reference, not a dozen numbers: a number handed to a call is a new heap number each time in V8, and the
 *  ground under falling pieces is read here every step.) */
function heapHeight(shape: HeapShape, x: number, z: number): number {
  const cx = shape.cx, cz = shape.cz, hw = shape.hw, hd = shape.hd, c = shape.c, s = shape.s, height = shape.heightM;
  const falloff = shape.falloffM, crown = shape.crown;
  const dx = x - cx, dz = z - cz;
  // forward (sin yaw, cos yaw) along hd, right (cos yaw, −sin yaw) across hw
  const alongAt = dx * s + dz * c, acrossAt = dx * c - dz * s;
  const ea = hd * RUBBLE_PLATEAU, eb = hw * RUBBLE_PLATEAU;
  const along = Math.abs(alongAt) - ea, across = Math.abs(acrossAt) - eb;
  const ox = across > 0 ? across : 0, oz = along > 0 ? along : 0;
  const outside = Math.sqrt(ox * ox + oz * oz);
  if (outside >= falloff) return 0;
  const a = ea > 1e-3 ? Math.max(-1, Math.min(1, alongAt / ea)) : 0;
  const b = eb > 1e-3 ? Math.max(-1, Math.min(1, acrossAt / eb)) : 0;
  const lean = (crown[0] * b + crown[1] * a) * Math.SQRT1_2;
  const swell = 0.6 * Math.sin(crown[5] * a + crown[2]) * Math.sin(crown[6] * b + crown[3])
    + 0.4 * Math.sin(crown[7] * a - crown[8] * b + crown[4]);
  const g = CROWN_LEAN * lean + (1 - CROWN_LEAN) * swell;
  const top = height * (1 - CROWN_DROP * 0.5 * (1 - g));
  return outside > 0 ? top * 0.5 * (1 + Math.cos(Math.PI * outside / falloff)) : top;
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
  let courseRaise = 0;
  let now = NaN;
  let growthRevision = 0;
  /** Rubble stamps still rising (indices into `stamps`). */
  const rising: number[] = [];
  const growthOf = (stamp: TerrainStamp): number =>
    stamp.kind === 'rubble' && Number.isFinite(stamp.t0) && Number.isFinite(now) ? rubbleGrowth(now - stamp.t0, stamp.growS) : 1;

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
    let course = 0;
    for (let k = 0; k < count; k++) {
      const stamp = stamps[slots[bucket * STAMPS_PER_BUCKET + k]];
      if (stamp.kind === 'crater') {
        const dx = x - stamp.x, dz = z - stamp.z;
        const r = Math.sqrt(dx * dx + dz * dz);
        if (r < stamp.radiusM * CRATER_REACH * 1.1) sum += craterProfile(stamp, r, Math.atan2(dz, dx));
      } else if (stamp.kind === 'course') {
        course += courseProfile(stamp, x, z);
      } else {
        sum += rubbleProfile(stamp, x, z, growthOf(stamp));
      }
    }
    const battle = sum < -MAX_DEPTH_M ? -MAX_DEPTH_M : sum > MAX_RAISE_M ? MAX_RAISE_M : sum;
    return course === 0 ? battle : battle + (course < -MAX_COURSE_M ? -MAX_COURSE_M : course > MAX_COURSE_M ? MAX_COURSE_M : course);
  }

  function latticeOffset(ix: number, iz: number): number {
    return offsetAt(-WORLD_HALF_M + ix * LATTICE_STEP, -WORLD_HALF_M + iz * LATTICE_STEP);
  }

  function contactOffsetAt(x: number, z: number, flipped = false): number {
    if (counts[bucketIndex(z) * BUCKETS + bucketIndex(x)] === 0) return 0;
    const gx = Math.max(0, Math.min(LATTICE_CELLS - 1e-6, (x + WORLD_HALF_M) / LATTICE_STEP));
    const gz = Math.max(0, Math.min(LATTICE_CELLS - 1e-6, (z + WORLD_HALF_M) / LATTICE_STEP));
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const u = gx - ix, v = gz - iz;
    // the contact sampler's triangle split (terrainContactSurface.ts): a, b = +x, c = +z, d = +x+z; a steep base cell
    // (2026-10-15) splits along a–d
    const b = latticeOffset(ix + 1, iz), c = latticeOffset(ix, iz + 1);
    if (flipped) {
      const a = latticeOffset(ix, iz), d = latticeOffset(ix + 1, iz + 1);
      return u >= v ? a + (b - a) * u + (d - b) * v : a + (c - a) * v + (d - c) * u;
    }
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
    get maxRaiseM() { return maxRaise + courseRaise; },
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
    addRubble(cx, cz, hw, hd, yaw, heightM, t0) {
      const height = Math.max(0, heightM);
      const falloff = rubbleFalloffM(hw, hd, height);
      // (no clock set — a consumer that never steps one — or a settled heap: risen at once, as before)
      const start = t0 !== undefined ? t0 : Number.isFinite(now) ? now : -Infinity;
      const stamp: RubbleStamp = { kind: 'rubble', cx, cz, hw, hd, yaw, heightM: height,
        c: Math.cos(yaw), s: Math.sin(yaw), falloffM: falloff, t0: start, growS: RUBBLE_GROW_S,
        crown: heapCrown(cx, cz, hw, hd, new Float64Array(CROWN_PARAMS)) };
      if (Number.isFinite(start) && growthOf(stamp) < 1) rising.push(stamps.length);
      const ex = Math.abs(stamp.s) * hd + Math.abs(stamp.c) * hw + falloff;
      const ez = Math.abs(stamp.c) * hd + Math.abs(stamp.s) * hw + falloff;
      admit(stamp, cx - ex, cz - ez, cx + ex, cz + ez, true);
      maxRaise = Math.min(MAX_RAISE_M, maxRaise + height);
    },
    addCourse(stamp) {
      courseExtent(stamp, _courseBox);
      admit(stamp, _courseBox[0], _courseBox[1], _courseBox[2], _courseBox[3], true);
      let top = 0;
      for (let k = 1; k < stamp.profile.length; k += 2) top = Math.max(top, stamp.profile[k]);
      courseRaise = Math.min(MAX_COURSE_M, courseRaise + top);
    },
    reset() {
      stamps.length = 0;
      counts.fill(0);
      revision++;
      maxRaise = 0;
      courseRaise = 0;
      rising.length = 0;
    },
    setTime(timeS) {
      now = timeS;
      if (!rising.length) return;
      growthRevision++;
      // a heap fully risen leaves the list (its ground moves no more)
      let kept = 0;
      for (let i = 0; i < rising.length; i++) if (growthOf(stamps[rising[i]]) < 1) rising[kept++] = rising[i];
      rising.length = kept;
    },
    get growing() { return rising.length > 0; },
    get growthRevision() { return growthRevision; },
    stampGrowth(index) {
      const stamp = stamps[index];
      return stamp ? growthOf(stamp) : 1;
    },
  };
}

/** The slice of a height field the wrapper overrides; everything else reads through to the base. */
export interface DeformableHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
  /** The base surface's steep-cell split (world/terrain.ts getContactCellFlippedAt), which the overlay rides. */
  getContactCellFlippedAt?(x: number, z: number): boolean;
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
  // (2026-10-15) the base surface's steep-cell split, which the overlay's offsets ride (a stub field without one keeps b–c)
  const baseFlippedAt = base.getContactCellFlippedAt ? base.getContactCellFlippedAt.bind(base) : null;
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
      value: (x: number, z: number): number => baseContact(x, z)
        + overlay.contactOffsetAt(x, z, baseFlippedAt !== null && overlay.near(x, z) && baseFlippedAt(x, z)), writable: true, configurable: true,
    });
  }
  return field;
}
