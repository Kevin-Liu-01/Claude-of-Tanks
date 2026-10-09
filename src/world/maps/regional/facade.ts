// src/world/maps/regional/facade.ts — the facade craft the regional kits share (facades lane, 2026-10-05; the owner:
// "you are capable of making a lot more beautiful buildings then we have"). The house grammar (house.ts) and the
// opening units (openings.ts) lay out walls, roofs and openings; this module dresses them the way a mason, a joiner
// and a thatcher finish a real house: window heads (a lintel, a hood, a pediment, the carved crest of a Russian
// nalichnik), aprons under the sills, the thatch's eave course and its course lines, rain shadows under the eaves and
// the dirt run off the sills, gutter brackets and hopper heads, the oversailing course of a stack, painted bands.
//
// Three laws keep every map's world as it was:
//   - DRESSING ONLY. Every part here is decor (noCollision): a building's collision, its plot and every placement on
//     the map stay byte for byte (the collision shards, structureCollision.ts).
//   - DESKTOP ONLY. A phone builds none of it (facadeOn()): its parts, triangles and draws stay byte for byte.
//   - OWN STREAMS. Nothing here draws from a building's build stream: per-building choices draw from the facade stream
//     (index.ts forks it from the wear seed), per-element variation hashes the element's own position (hash01).
import {
  LocalFrame, faceBox, facePoint, normalize3, type EmitOptions, type Face, type PartSink, type RegionalBucket, type Rgb, type Vec3,
} from './geometry.ts';
import { masonryLayout } from '../../regionalSurfaces.ts';
import type { RegionalGround, StoneSurfaceKind } from './types.ts';

/** The facade craft's slot for the building being built (index.ts sets it around a kit build, like the wear slot). */
export interface FacadeContext {
  tier: 'desktop' | 'mobile';
  /** the building's facade stream (never its build or look stream) */
  rng: () => number;
  /** the style's stone tile (its painter and dressing: the dressed quoins map one of its stones onto each quoin) */
  stone?: { kind: StoneSurfaceKind; dressed?: boolean };
  /** the ground the placed building stands on (RegionalBuildContext.ground; absent in a bare build) */
  ground?: RegionalGround;
  /** (round 10) the style's ground craft (ArchitectureStyle.groundCraft): false keeps round 9's wall foot */
  groundCraft?: boolean;
  /** (round 10) the map's kit gated back to the craft's older layers (maps/regional/index.ts KIT_LEGACY_MAPS) */
  legacy?: boolean;
}
let facadeContext: FacadeContext | null = null;

/** Build `build` with the facade slot set (builders are synchronous: the slot never leaks between buildings). */
export function withFacade<T>(context: FacadeContext | null, build: () => T): T {
  const prior = facadeContext;
  facadeContext = context;
  try { return build(); } finally { facadeContext = prior; }
}

/** The craft's switch: on in the game; the receipts turn it off to hold a desktop build to the kits' own (facade.selftest). */
let craftEnabled = true;
export function setFacadeCraft(on: boolean): void {
  craftEnabled = on;
}

/** True on a desktop kit build: the facade craft is built. A phone, or a build outside a kit, keeps the plain parts. */
export function facadeOn(): boolean {
  return craftEnabled && facadeContext?.tier === 'desktop';
}

/** True on a desktop kit build whose style takes round 10's wall foot (ArchitectureStyle.groundCraft, default on). */
export function facadeGroundCraft(): boolean {
  return facadeOn() && facadeContext?.groundCraft !== false;
}

/** True in a kit build on a map gated back to the craft's older layers (maps/regional/index.ts KIT_LEGACY_MAPS). */
export function facadeLegacy(): boolean {
  return facadeContext?.legacy === true;
}

/**
 * True in a kit build (any tier, craft or none) whose style takes round 10's wall foot: its render losses are drawn by
 * no build, so the craft never takes away what the plain build drew (facade.selftest: the craft only adds).
 */
export function styleGroundCraft(): boolean {
  return !!facadeContext && facadeContext.groundCraft !== false;
}

/** The ground under the building being built (the wall-foot strip lies on it), or null: a bare build lays it level. */
export function facadeGround(): RegionalGround | null {
  return facadeContext?.ground ?? null;
}

const FALLBACK = (): number => 0.5;
/** The building's facade stream (a constant outside a kit build). */
export function facadeRng(): () => number {
  return facadeContext?.rng ?? FALLBACK;
}

/** A deterministic value in [0, 1) from a few coordinates (millimetre-quantised): per-element variation. */
export function hash01(...values: number[]): number {
  let h = 0x811c9dc5 >>> 0;
  for (const value of values) {
    const q = Math.round(value * 1000) | 0;
    h ^= q & 0xffff; h = Math.imul(h, 0x01000193) >>> 0;
    h ^= q >>> 16; h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const DECOR: EmitOptions = Object.freeze({ decor: true });

/**
 * A board or slab on a face: the outline `poly` ((u, y) pairs, counter-clockwise seen from outside, convex), its back
 * `o0` metres out of the wall plane and `depth` thick. The front reads at any range; the edges are fine joinery
 * unless `coarseEdges`; the back (against the wall or the board behind it) is never drawn.
 */
export function faceSlab(sink: PartSink, bucket: RegionalBucket, face: Face, poly: ReadonlyArray<readonly [number, number]>,
  o0: number, depth: number, opts: EmitOptions = {}, coarseEdges = false): void {
  if (poly.length < 3) return;
  const o1 = o0 + depth;
  const base = { ...DECOR, ...opts };
  sink.polygon(bucket, poly.map(([u, y]) => facePoint(face, u, y, o1)), base);
  const edge: EmitOptions = coarseEdges ? base : { ...base, fine: 'near' };
  for (let i = 0; i < poly.length; i++) {
    const [ua, ya] = poly[i], [ub, yb] = poly[(i + 1) % poly.length];
    if (Math.hypot(ub - ua, yb - ya) < 1e-4) continue;
    sink.quad(bucket, facePoint(face, ua, ya, o0), facePoint(face, ub, yb, o0), facePoint(face, ub, yb, o1), facePoint(face, ua, ya, o1), edge);
  }
}

/** One triangle turned to face `toward` (the kernel winds a polygon by its corner order). */
function orientedTri(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, c: Vec3, toward: Vec3, opts: EmitOptions): void {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0) sink.polygon(bucket, [a, b, c], opts);
  else sink.polygon(bucket, [a, c, b], opts);
}

// -------------------------------------------------------------------------------------------------------------------
// Window heads and aprons
// -------------------------------------------------------------------------------------------------------------------

/**
 * The carved crest of a Russian village window (nalichnik): a cornice ledge over the jambs, a crest board above it
 * cut to a gable peak, a round arch or a stepped head, its carved field in the second paint, three rosettes and a
 * finial. `outer` is the surround's outer width; `y` the top of the jambs.
 */
export interface CrestStyle {
  peak: 'gable' | 'arch' | 'stepped';
  /** the board's paint and the carved field's */
  colour: Rgb;
  field: Rgb;
  /** the crest board's height over the ledge (to its peak) */
  rise: number;
}

export function nalichnikCrest(sink: PartSink, face: Face, u: number, y: number, outer: number, style: CrestStyle): void {
  const wood = 'structureWood';
  const paint = { colour: style.colour };
  // the head board over the opening and the ledge on it, standing proud of the jambs, a little wider than the surround
  const lw = outer + 0.12;
  faceBox(sink, wood, face, u, y + 0.05, 0.02, outer, 0.1, 0.04, { ...DECOR, ...paint, fineSides: 'near' });
  faceBox(sink, wood, face, u, y + 0.13, 0.035, lw, 0.06, 0.07, { ...DECOR, ...paint, fineSides: 'near' });
  // the crest board over the ledge
  const bw = outer + 0.04, half = bw / 2, base = y + 0.16, top = base + style.rise;
  const shoulder = base + Math.min(0.08, style.rise * 0.4);
  let poly: Array<[number, number]>;
  if (style.peak === 'gable') {
    poly = [[u - half, base], [u + half, base], [u + half, shoulder], [u, top], [u - half, shoulder]];
  } else if (style.peak === 'arch') {
    poly = [[u - half, base], [u + half, base]];
    const r = style.rise - (shoulder - base);
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * k / 8;
      poly.push([u + Math.cos(a) * half, shoulder + Math.sin(a) * r]);
    }
  } else {
    // a stepped head: a wide lower board, a narrower upper one (two convex outlines)
    const mid = shoulder + (top - shoulder) * 0.5;
    poly = [[u - half, base], [u + half, base], [u + half, mid], [u - half, mid]];
    faceSlab(sink, wood, face, [[u - half * 0.62, mid], [u + half * 0.62, mid], [u + half * 0.62, top], [u - half * 0.62, top]], 0, 0.03, { ...paint, fineSides: 'near' });
  }
  // (wave 172: "without carved nalichniki relief") the board carved: a backing board that reads at range, and near the
  // camera a frame standing round a sunk field — the frame's face 32 mm proud, the field cut back to 18 mm in the second
  // paint — with the rosettes standing proud of both
  const inset = 0.035;
  const fieldPoly = shrink(poly, u, (base + Math.max(...poly.map(([, py]) => py))) / 2, inset);
  carvedBoard(sink, wood, face, poly, fieldPoly, style.colour, style.field);
  // three rosettes (the carving's bosses) in the board's paint on the field, and the finial on the peak
  const fy = base + (top - base) * 0.42;
  for (const du of [-half * 0.55, 0, half * 0.55]) {
    const s = du === 0 ? 0.045 : 0.032;
    faceSlab(sink, wood, face, [[u + du, fy - s], [u + du + s, fy], [u + du, fy + s], [u + du - s, fy]], 0.018, 0.024, { colour: style.colour, fine: 'near' });
  }
  faceSlab(sink, wood, face, [[u, top - 0.02], [u + 0.05, top + 0.05], [u, top + 0.13], [u - 0.05, top + 0.05]], 0, 0.03, { colour: style.colour, fine: 'near' });
}

/** The apron (podzor) under a nalichnik's sill: a board cut to a pointed drop, its field in the second paint. */
export function nalichnikApron(sink: PartSink, face: Face, u: number, y: number, outer: number, drop: number, colour: Rgb, field: Rgb): void {
  const half = outer / 2;
  const poly: Array<[number, number]> = [[u - half, y - drop * 0.62], [u, y - drop], [u + half, y - drop * 0.62], [u + half, y], [u - half, y]];
  carvedBoard(sink, 'structureWood', face, poly, shrink(poly, u, y - drop * 0.45, 0.04), colour, field);
}

/**
 * A carved board on a face (a nalichnik's crest or apron): a 12 mm backing board in `colour` that reads at range, and
 * near the camera (EmitOptions.fine 'near') a frame round the board's edge standing 32 mm proud and the sunk field
 * inside it at 18 mm in `field` — the carving's relief, its inner step catching the light. `inner` is the field's
 * outline, vertex for vertex the board's (shrink); without one the board is one slab.
 */
function carvedBoard(sink: PartSink, bucket: RegionalBucket, face: Face, poly: ReadonlyArray<readonly [number, number]>,
  inner: ReadonlyArray<readonly [number, number]> | null, colour: Rgb, field: Rgb): void {
  if (!inner) {
    faceSlab(sink, bucket, face, poly, 0, 0.032, { colour });
    return;
  }
  faceSlab(sink, bucket, face, poly, 0, 0.012, { colour });
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    faceSlab(sink, bucket, face, [poly[i], poly[j], inner[j], inner[i]], 0.012, 0.02, { colour, fine: 'near' });
  }
  faceSlab(sink, bucket, face, inner, 0.012, 0.006, { colour: field, fine: 'near' });
}

/** A convex outline pulled in toward (cu, cy) by `d` along each corner's ray (a carved field's border). */
function shrink(poly: ReadonlyArray<readonly [number, number]>, cu: number, cy: number, d: number): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  for (const [pu, py] of poly) {
    const du = pu - cu, dy = py - cy, l = Math.hypot(du, dy);
    if (l <= d * 1.5) return null;
    out.push([pu - du / l * d * 1.4, py - dy / l * d]);
  }
  return out;
}

// -------------------------------------------------------------------------------------------------------------------
// Thatch: the eave course and the course lines
// -------------------------------------------------------------------------------------------------------------------

/**
 * A thatched slope's courses (a straw roof, desktop): the doubled eave course standing proud of the slope at the
 * eaves, its edge bundled (the lift wanders along it), and two course lines up the slope, each a lip a couple of
 * centimetres proud. `eave0`, `eave1` are the slope's lower edge on its top surface, `top0`, `top1` the matching ends of
 * the slope's upper edge (on a hip, the ridge ends; on a hip's end slope, its apex twice), `n` the slope's normal.
 * `nipa` (an atap of nipa leaf; the facades lane, 2026-10-08, gauntlet wave 260): the doubled eave course alone, thick and
 * frayed (its lift wanders every half metre), and no course lines (the leaf rows are the print's, a hand's width apart;
 * lips a metre apart read as shingle courses).
 */
export function thatchCourses(sink: PartSink, bucket: RegionalBucket, eave0: Vec3, eave1: Vec3, top0: Vec3, top1: Vec3, n: Vec3,
  opts: { verges?: boolean; stepped?: boolean; nipa?: boolean } = {}): void {
  const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const add = (a: Vec3, k: number): Vec3 => [a[0] + n[0] * k, a[1] + n[1] * k, a[2] + n[2] * k];
  const along = [eave1[0] - eave0[0], eave1[1] - eave0[1], eave1[2] - eave0[2]];
  const length = Math.hypot(along[0], along[1], along[2]);
  if (length < 0.4) return;
  const down = normalize3([(eave0[0] + eave1[0] - top0[0] - top1[0]) / 2, (eave0[1] + eave1[1] - top0[1] - top1[1]) / 2,
    (eave0[2] + eave1[2] - top0[2] - top1[2]) / 2]);
  const slopeLen = Math.hypot((eave0[0] + eave1[0] - top0[0] - top1[0]) / 2, (eave0[1] + eave1[1] - top0[1] - top1[1]) / 2,
    (eave0[2] + eave1[2] - top0[2] - top1[2]) / 2);
  if (slopeLen < 0.8) return;
  // the straw's stalks run down the slope (the tile's u), and across the thickness on the cut faces
  const plane = (origin: Vec3, u: Vec3, v: Vec3): EmitOptions => ({ ...DECOR, uv: { kind: 'plane', origin, u, v } });
  const alongN = normalize3(along as unknown as Vec3);
  // the eaves beaten into three steps of butt ends (the south Russian and Ukrainian thatcher's stepped eave), then two
  // course lines up the slope
  const step = Math.min(0.24, slopeLen * 0.11);
  const courses: Array<{ from: number; to: number; lift: number; jitter: number }> = opts.nipa
    ? [{ from: 0, to: Math.min(0.32, slopeLen * 0.14), lift: 0.08, jitter: 0.03 }]
    : [
    ...(opts.stepped === false ? [] : [
      { from: 0, to: step, lift: 0.065, jitter: 0.02 },
      { from: step, to: 2 * step, lift: 0.055, jitter: 0.016 },
      { from: 2 * step, to: 3 * step, lift: 0.045, jitter: 0.012 },
    ]),
    // (a palm or grass thatch: its rows of shingles up the whole slope)
    ...(opts.stepped === false ? [0.18, 0.4, 0.62].map((t) => ({ from: slopeLen * t, to: slopeLen * t + 0.22, lift: 0.03, jitter: 0.01 })) : []),
    { from: slopeLen * 0.42, to: slopeLen * 0.42 + 0.26, lift: 0.028, jitter: 0.008 },
    { from: slopeLen * 0.68, to: slopeLen * 0.68 + 0.24, lift: 0.024, jitter: 0.006 },
  ].filter((c, k, all) => all.findIndex((d) => Math.abs(d.from - c.from) < 0.2) === k);
  for (const course of courses) {
    if (course.to > slopeLen - 0.15) continue;
    // the course's lower and upper lines, as fractions from the eave (0) to the top edge (1)
    const ta = course.from / slopeLen, tb = course.to / slopeLen;
    const lo0 = lerp(eave0, top0, ta), lo1 = lerp(eave1, top1, ta);
    const hi0 = lerp(eave0, top0, tb), hi1 = lerp(eave1, top1, tb);
    const span = Math.hypot(lo1[0] - lo0[0], lo1[1] - lo0[1], lo1[2] - lo0[2]);
    // (a bundle's wander every 1.3 m along the eave course, a course line straight: Verdant's thatch at a third of
    // its first cost)
    const cells = Math.max(1, Math.round(span / (opts.nipa ? 0.5 : course.jitter > 0.01 ? 1.3 : 4)));
    const lifts: number[] = [];
    for (let k = 0; k <= cells; k++) {
      const p = lerp(lo0, lo1, k / cells);
      const edge = k === 0 || k === cells;
      lifts.push(Math.max(0.006, course.lift + (edge && !opts.verges ? -course.lift * 0.6 : (hash01(p[0], p[1], p[2], 7.1) - 0.5) * 2 * course.jitter)));
    }
    const topOpts = plane(lo0, down, alongN);
    const cutOpts = plane(lo0, n, alongN);
    for (let k = 0; k < cells; k++) {
      const t0 = k / cells, t1 = (k + 1) / cells;
      const a0 = lerp(lo0, lo1, t0), a1 = lerp(lo0, lo1, t1), b0 = lerp(hi0, hi1, t0), b1 = lerp(hi0, hi1, t1);
      const la = add(a0, lifts[k]), lb = add(a1, lifts[k + 1]);
      // the course's back runs into the slope at its upper line; its butt ends stand proud at its lower line
      orientedTri(sink, bucket, la, lb, b1, n, topOpts);
      orientedTri(sink, bucket, la, b1, b0, n, topOpts);
      sink.quad(bucket, ...orient4(a0, a1, lb, la, down), cutOpts);
    }
    if (opts.verges) {
      // a gable roof's courses end at the verges: close the wedge's ends
      orientedTri(sink, bucket, lo0, add(lo0, lifts[0]), hi0, [-alongN[0], -alongN[1], -alongN[2]], cutOpts);
      orientedTri(sink, bucket, lo1, add(lo1, lifts[cells]), hi1, alongN, cutOpts);
    }
  }
}

/** Four corners of a planar quad ordered to face `toward`. */
function orient4(a: Vec3, b: Vec3, c: Vec3, d: Vec3, toward: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  return n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? [a, b, c, d] : [d, c, b, a];
}

/**
 * The riders (kozly) holding a thatch ridge down: pairs of poles crossed over the ridge at `zs`, their feet on the
 * slopes, their heads standing over the ridge. `ridgeTop` is the ridge's top line height, `tanP` the slope.
 */
export function ridgeRiders(sink: PartSink, zs: readonly number[], ridgeTop: number, tanP: number, colour: Rgb): void {
  const foot = 0.6, head = 0.2, lift = 0.05;
  for (const z of zs) {
    const tone = 0.86 + hash01(z, ridgeTop, 3.3) * 0.22;
    const c: Rgb = [colour[0] * tone, colour[1] * tone, colour[2] * tone];
    for (const side of [1, -1]) {
      const a: Vec3 = [side * foot, ridgeTop - foot * tanP + lift, z];
      const b: Vec3 = [-side * head, ridgeTop + head * tanP * 0.9 + lift + 0.06, z];
      sink.member('structureWood', a, b, 0.06, 0.06, [0, 0, 1], { ...DECOR, colour: c, exposed: true }, 0);
    }
    // the withy binding the pair where they cross
    sink.member('structureWood', [0, ridgeTop + lift + 0.04, z - 0.05], [0, ridgeTop + lift + 0.04, z + 0.05], 0.09, 0.09, [1, 0, 0],
      { ...DECOR, colour: [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], exposed: true, fine: true }, 0);
  }
}

// -------------------------------------------------------------------------------------------------------------------
// Painted bands and weathering on a wall face
// -------------------------------------------------------------------------------------------------------------------

/**
 * A painted band on a rendered wall (a dado, a line over the plinth): a render layer 2 cm proud of the wall in the
 * wall's own bucket under a paint (EmitOptions.tint). 2 cm keeps it off the wall in the depth buffer at any range. Runs
 * from u0 to u1 between y0 and y1, broken by the `gaps` (door openings) it meets.
 */
export function paintBand(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y0: number, y1: number,
  tint: Rgb, gaps: ReadonlyArray<readonly [number, number]> = []): void {
  const runs: Array<[number, number]> = [];
  let cur = u0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (b <= cur || a >= u1) continue;
    if (a > cur + 0.05) runs.push([cur, Math.min(a, u1)]);
    cur = Math.max(cur, b);
  }
  if (u1 > cur + 0.05) runs.push([cur, u1]);
  // (fine: a paint read near and middle range; past the fine-detail distance, and in the shadow maps, it is nothing)
  for (const [a, b] of runs) {
    sink.polygon(bucket, [facePoint(face, a, y0, 0.02), facePoint(face, b, y0, 0.02), facePoint(face, b, y1, 0.02), facePoint(face, a, y1, 0.02)], { ...DECOR, tint, fine: true });
  }
}

/** A painted surround (Faschen) round an opening (u, y bottom-centre, w × h) on a rendered wall, `width` wide, 2 cm proud. */
export function paintSurround(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, w: number, h: number,
  width: number, tint: Rgb, opts: { sill?: boolean } = {}): void {
  const l = u - w / 2, r = u + w / 2, b = opts.sill === false ? y : y - width, t = y + h + width;
  const band = (pts: ReadonlyArray<readonly [number, number]>) => sink.polygon(bucket, pts.map(([pu, py]) => facePoint(face, pu, py, 0.02)), { ...DECOR, tint, fine: true });
  band([[l - width, b], [l, b], [l, t], [l - width, t]]);
  band([[r, b], [r + width, b], [r + width, t], [r, t]]);
  band([[l, y + h], [r, y + h], [r, t], [l, t]]);
  if (opts.sill !== false) band([[l, b], [r, b], [r, y], [l, y]]);
}

/**
 * The dirt run off a sill: two streaks from the sill's ends down the wall (the water leaves the sill at its corners),
 * fading as they fall, 12 mm proud in the wall's bucket (fine: drawn near the camera only). `floor` is the lowest the
 * streaks may run (the storey's floor, or the head of an opening under them).
 */
export function sillStreaks(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, w: number, floor: number): void {
  for (const side of [-1, 1]) {
    const cu = u + side * (w / 2 + 0.01), k = hash01(cu, y, face.origin[0], face.origin[2]);
    const len = Math.min(y - floor - 0.05, 0.8 + k * 0.9);
    if (len < 0.3) continue;
    // (wave 116: readable at 30 m — a hand wide under the sill's end, a third darker, washing out down the wall)
    const half = 0.06 + k * 0.04, top = y - 0.1, bottom = top - len;
    const at = (p: Vec3) => {
      const t = Math.min(1, Math.max(0, (top - p[1]) / len));
      return 0.64 + 0.36 * t;
    };
    sink.polygon(bucket, [facePoint(face, cu - half, bottom, 0.012), facePoint(face, cu + half, bottom, 0.012),
      facePoint(face, cu + half * 0.6, top, 0.012), facePoint(face, cu - half * 0.6, top, 0.012)], { ...DECOR, fine: 'near', shadeAt: at });
  }
}

// -------------------------------------------------------------------------------------------------------------------
// Masonry: window heads, cornices, string courses
// -------------------------------------------------------------------------------------------------------------------

/** A window or door head on a masonry face: `y` is the top of the opening (or of its surround), `w` the width it spans. */
export type HeadStyle =
  /** a flat lintel block, `ext` past each side of the span */
  | { kind: 'lintel'; bucket: RegionalBucket; h: number; out: number; ext: number; colour?: Rgb }
  /** a straight hood: a frieze and a cornice ledge over it (the Verdachung of a baroque town house) */
  | { kind: 'hood'; bucket: RegionalBucket; h: number; out: number; ext: number; colour?: Rgb }
  /** a hood under a triangular pediment */
  | { kind: 'pediment'; bucket: RegionalBucket; h: number; out: number; ext: number; rise: number; colour?: Rgb }
  /** a segmental arch head, its keystone standing proud */
  | { kind: 'segment'; bucket: RegionalBucket; h: number; out: number; ext: number; rise: number; colour?: Rgb };

export function windowHead(sink: PartSink, face: Face, u: number, y: number, w: number, head: HeadStyle): void {
  const paint = head.colour ? { colour: head.colour } : {};
  const span = w + 2 * head.ext;
  const front: EmitOptions = { ...DECOR, ...paint };
  if (head.kind === 'lintel') {
    faceBox(sink, head.bucket, face, u, y + head.h / 2, head.out / 2, span, head.h, head.out, { ...front, fineSides: 'near' });
    return;
  }
  if (head.kind === 'segment') {
    // the arch band: flat over the opening, its extrados a segment rising `rise` over the band, a keystone at the crown
    const half = span / 2, pts: Array<[number, number]> = [[u - half, y], [u + half, y]];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * k / 8;
      pts.push([u + Math.cos(a) * half, y + head.h + Math.sin(a) * head.rise]);
    }
    faceSlab(sink, head.bucket, face, pts, 0, head.out, paint);
    const top = y + head.h + head.rise;
    faceSlab(sink, head.bucket, face, [[u - 0.08, y + 0.02], [u + 0.08, y + 0.02], [u + 0.11, top + 0.05], [u - 0.11, top + 0.05]], head.out, 0.025, paint);
    return;
  }
  // hood and pediment: the frieze, then the ledge standing further out, its underside the hood's shadow line
  const frieze = head.h * 0.55, ledge = head.h - frieze;
  faceBox(sink, head.bucket, face, u, y + frieze / 2, head.out * 0.3, span, frieze, head.out * 0.6, { ...front, fineSides: 'near' });
  sink.box(head.bucket, facePoint(face, u, y + frieze + ledge / 2, head.out / 2), [span / 2 + 0.03, ledge / 2, head.out / 2],
    { ...front, uv: { kind: 'world' }, fineSides: 'near' }, faceFrame(face), { nz: true }, { pz: true, ny: true });
  if (head.kind === 'pediment') {
    const base = y + head.h, half = span / 2 + 0.03;
    faceSlab(sink, head.bucket, face, [[u - half, base], [u + half, base], [u, base + head.rise]], 0, head.out * 0.7, paint);
  }
}

/** The stone tile's whole blocks, inset clear of their joints (canvas px, rows from the top), by kind and dressing. */
const ASHLAR_BLOCKS = new Map<string, ReadonlyArray<{ x0: number; x1: number; y0: number; y1: number }>>();
const ASHLAR_TILE = 512;
function ashlarBlocks(kind: StoneSurfaceKind, dressed: boolean): ReadonlyArray<{ x0: number; x1: number; y0: number; y1: number }> {
  const key = `${kind}:${dressed ? 1 : 0}`;
  let blocks = ASHLAR_BLOCKS.get(key);
  if (!blocks) {
    const layout = masonryLayout(kind, dressed, undefined, ASHLAR_TILE);
    // clear of the joint, its wander and a texel of filtering
    const m = layout.mortar + layout.wobble + 1.5;
    blocks = layout.courses.flatMap((c) => c.blocks.filter((b) => !b.split)
      .map((b) => ({ x0: b.x0 + m, x1: b.x1 - m, y0: c.y0 + m, y1: c.y1 - m })))
      .filter((b) => b.x1 - b.x0 > 8 && b.y1 - b.y0 > 8);
    ASHLAR_BLOCKS.set(key, blocks);
  }
  return blocks;
}

/**
 * A quoin turning the corner (PartSink.quoin's box and corner signs) as one dressed stone (facade craft, desktop; wave
 * 172 read the corners as "brick strips instead of dressed sandstone"): its two outer faces wrap one whole stone of the
 * style's own tile round the corner — a block clear of the tile's joints, picked per quoin and per building — so the
 * courses of the wall's masonry no longer run across it. The geometry is the plain quoin's; only its texture mapping
 * changes. A phone, a build outside a kit, or a bucket other than the stone keeps the plain quoin.
 */
export function dressedQuoin(sink: PartSink, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number,
  z1: number, sx: number, sz: number, opts: EmitOptions = {}): void {
  const stone = facadeContext?.stone;
  const xl = Math.min(x0, x1), xh = Math.max(x0, x1), yl = Math.min(y0, y1), yh = Math.max(y0, y1), zl = Math.min(z0, z1), zh = Math.max(z0, z1);
  const W = (xh - xl) + (zh - zl), H = yh - yl;
  const blocks = facadeOn() && bucket === 'stone' && stone && W > 0 && H > 0 ? ashlarBlocks(stone.kind, !!stone.dressed) : [];
  // the scale (tiles a metre) a block allows the quoin's wrapped faces, at most the tile's own 0.5: a stone magnified
  // past ~2.3x reads soft, so smaller blocks are passed over
  const fit = (b: { x0: number; x1: number; y0: number; y1: number }) =>
    Math.min(0.5, (b.y1 - b.y0) / ASHLAR_TILE / H, (b.x1 - b.x0) / ASHLAR_TILE / W);
  const good = blocks.filter((b) => fit(b) >= 0.22);
  if (!good.length) {
    sink.quoin(bucket, x0, y0, z0, x1, y1, z1, sx, sz, opts);
    return;
  }
  const [ou, ov] = sink.uvOffset;
  const b = good[Math.floor(hash01(xl, yl, zl, sx, sz, ou, ov) * good.length) % good.length];
  const k = fit(b);
  // the window: W x H metres at k tiles a metre, centred in the block; the canvas is flipped on upload (v = 1 - row / size)
  const cu = (b.x0 + b.x1) / 2 / ASHLAR_TILE, cv = 1 - (b.y0 + b.y1) / 2 / ASHLAR_TILE;
  const u0 = cu - W * k / 2, v0 = cv - H * k / 2;
  // the wrap: u runs from the far end of the face square to z, round the corner, to the far end of the face square to
  // x; v runs up. PartSink's plane UVs are dot(p - origin, axis) * density + the building's offset, so the origin is
  // set back along the axes to land the corner of the wrap on the window's corner
  const U: Vec3 = [sx, 0, -sz], V: Vec3 = [0, 1, 0];
  const p0: Vec3 = [sx > 0 ? xl : xh, yl, sz > 0 ? zh : zl];
  const a = (ou - u0) / k, c = (ov - v0) / k;
  const origin: Vec3 = [p0[0] + U[0] * a / 2, p0[1] + c, p0[2] + U[2] * a / 2];
  sink.quoin(bucket, x0, y0, z0, x1, y1, z1, sx, sz, { ...opts, uv: { kind: 'plane', origin, u: U, v: V }, density: k });
}

/** The local frame of a face (x along u, y up, z out) for PartSink.box. */
function faceFrame(face: Face): LocalFrame {
  return new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]);
}

/**
 * A moulded run along a face (a cornice, a string course, a plinth's water table): layers stacked upward from `y`,
 * each `h` tall standing `out` proud, from u0 to u1, and returned round the corners onto the side faces by `ret`.
 * The fronts and the undersides read at range (the shadow line under a cornice); tops and ends are near fine joinery.
 */
export function trimRun(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y: number,
  layers: ReadonlyArray<{ h: number; out: number }>, opts: { ret?: number; wrap?: boolean; colour?: Rgb; tint?: Rgb } = {}): void {
  const paint: EmitOptions = { ...DECOR, ...(opts.colour ? { colour: opts.colour } : {}), ...(opts.tint ? { tint: opts.tint } : {}) };
  const ret = opts.ret ?? 0;
  let yy = y;
  for (const layer of layers) {
    // a wrapped run (round a whole body) carries on past the corner by its projection, meeting the next face's run
    const o = layer.out, len = u1 - u0 + (ret > 0 || opts.wrap ? 2 * o : 0);
    sink.box(bucket, facePoint(face, (u0 + u1) / 2, yy + layer.h / 2, o / 2), [len / 2, layer.h / 2, o / 2], { ...paint, uv: { kind: 'world' }, fineSides: 'near' },
      faceFrame(face), { nz: true }, { pz: true, ny: true });
    if (ret > 0) {
      // the returns: short runs on the side faces from the corner back along them
      for (const end of [-1, 1]) {
        const cu = end < 0 ? u0 : u1;
        const side: Face = { origin: facePoint(face, cu, 0, 0), u: end < 0 ? face.out : [-face.out[0], -face.out[1], -face.out[2]],
          out: [face.u[0] * end, face.u[1] * end, face.u[2] * end], width: 0 };
        const along = Math.min(ret, 0.6);
        sink.box(bucket, facePoint(side, end < 0 ? -along / 2 : along / 2, yy + layer.h / 2, o / 2), [along / 2, layer.h / 2, o / 2],
          { ...paint, uv: { kind: 'world' }, fineSides: 'near' }, faceFrame(side), { nz: true }, { pz: true, ny: true });
      }
    }
    yy += layer.h;
  }
}

/**
 * A canopy over a door (a Vordach, a porch hood): a small roof of the house's covering on two timber brackets,
 * `y` the top of the door opening, `w` the door's width. 'shed' leans off the wall; 'gable' sets a little ridge
 * square to it. The covering reads at any range; the brackets are fine joinery.
 */
export function doorCanopy(sink: PartSink, face: Face, u: number, y: number, w: number,
  style: { kind: 'shed' | 'gable'; bucket: RegionalBucket; colour?: Rgb; timber: Rgb; depth?: number }): void {
  const depth = style.depth ?? 0.85, span = w + 0.7, t = 0.07, wall = y + 0.32;
  const paint = style.colour ? { colour: style.colour } : {};
  const timber = { ...DECOR, colour: style.timber };
  // the brackets: a post-less knee from the wall up to the canopy's front beam
  for (const side of [-1, 1]) {
    const cu = u + side * (span / 2 - 0.12);
    sink.member('structureWood', facePoint(face, cu, wall - 0.62, 0.02), facePoint(face, cu, wall - 0.06, depth - 0.12), 0.08, 0.08, face.u,
      { ...timber, exposed: true, fine: 'near' }, 0);
    faceBox(sink, 'structureWood', face, cu, wall - 0.04, (depth - 0.08) / 2, 0.08, 0.08, depth - 0.08, { ...timber, fine: 'near' });
  }
  faceBox(sink, 'structureWood', face, u, wall - 0.04, depth - 0.1, span - 0.1, 0.09, 0.09, { ...timber, fineSides: 'near' });
  if (style.kind === 'shed') {
    // one slab from the wall falling to the front beam
    const drop = 0.28;
    const a = facePoint(face, u - span / 2, wall + 0.02, 0), b = facePoint(face, u + span / 2, wall + 0.02, 0);
    const c = facePoint(face, u + span / 2, wall + 0.02 - drop, depth), d = facePoint(face, u - span / 2, wall + 0.02 - drop, depth);
    const n = normalize3([face.out[0] * drop, depth, face.out[2] * drop]);
    sink.prism(style.bucket, [d, c, b, a], n, t, { ...DECOR, ...paint });
    return;
  }
  // a little gable roof, its ridge running out from the wall
  const rise = span * 0.32;
  for (const side of [-1, 1]) {
    const eave = facePoint(face, u + side * span / 2, wall - 0.04, 0), eaveOut = facePoint(face, u + side * span / 2, wall - 0.04, depth);
    const ridge = facePoint(face, u, wall - 0.04 + rise, 0), ridgeOut = facePoint(face, u, wall - 0.04 + rise, depth);
    const n = normalize3([face.u[0] * side * rise, span / 2, face.u[2] * side * rise]);
    const pts: Vec3[] = side > 0 ? [ridge, ridgeOut, eaveOut, eave] : [eave, eaveOut, ridgeOut, ridge];
    sink.prism(style.bucket, pts, n, t, { ...DECOR, ...paint });
  }
  // its gable: a board triangle under the slopes
  faceSlab(sink, 'structureWood', face, [[u - span / 2 + 0.05, wall - 0.04], [u + span / 2 - 0.05, wall - 0.04], [u, wall - 0.04 + rise - 0.05]],
    depth - 0.06, 0.03, { colour: style.timber });
}

/** A moulded run round a whole body (a cornice under a hip roof's eaves, a string course): `trimRun` on its four faces. */
export function trimRing(sink: PartSink, bucket: RegionalBucket, body: { x0: number; x1: number; z0: number; z1: number }, y: number,
  layers: ReadonlyArray<{ h: number; out: number }>, opts: { colour?: Rgb; tint?: Rgb } = {}): void {
  const cx = (body.x0 + body.x1) / 2, cz = (body.z0 + body.z1) / 2, w = body.x1 - body.x0, d = body.z1 - body.z0;
  const faces: Face[] = [
    { origin: [cx, 0, body.z1], u: [1, 0, 0], out: [0, 0, 1], width: w },
    { origin: [body.x1, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: d },
    { origin: [cx, 0, body.z0], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    { origin: [body.x0, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: d },
  ];
  for (const face of faces) trimRun(sink, bucket, face, -face.width / 2, face.width / 2, y, layers, { ...opts, wrap: true });
}

/**
 * A pilaster (a lesene, a brick pier) up a face, a few centimetres proud: the rhythm of a facade within the fine-detail
 * distance, and past it, where its face is the wall's own colour, nothing (fine joinery whole, out of the shadow maps).
 */
export function pilaster(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, y1: number, width: number, out: number,
  opts: EmitOptions = {}): void {
  if (y1 - y0 < 0.2) return;
  faceBox(sink, bucket, face, u, (y0 + y1) / 2, out / 2, width, y1 - y0, out, { ...DECOR, ...opts, fine: true });
}

/**
 * A corbelled brick cornice (the dentil course of a brick shed or a Russian village church): a plain course, a row of
 * dentils standing out under a projecting course. Along one face from u0 to u1 at `y`.
 */
export function dentilCornice(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y: number, opts: { ret?: number } = {}): void {
  trimRun(sink, bucket, face, u0, u1, y, [{ h: 0.075, out: 0.05 }], { ret: opts.ret });
  const n = Math.max(2, Math.floor((u1 - u0) / 0.25));
  for (let k = 0; k < n; k++) {
    const u = u0 + (u1 - u0) * (k + 0.5) / n;
    faceBox(sink, bucket, face, u, y + 0.075 + 0.04, 0.05, 0.12, 0.08, 0.1, { ...DECOR, fine: 'near' });
  }
  trimRun(sink, bucket, face, u0, u1, y + 0.155, [{ h: 0.075, out: 0.12 }, { h: 0.075, out: 0.16 }], { ret: opts.ret });
}

/**
 * Dormers on a pitched roof's long slopes (facade craft, desktop): a gabled dormer (Giebelgaube) or a shed dormer
 * (Schleppgaube) every few metres along the slope, its front wall standing up from the slope with a small window, its
 * cheeks closing it back to the slope, its little roof of the house's covering. `roof` is the house's roof geometry in
 * its own frame (house.ts roofGeometry: ridge along z, slopes falling to ±x). Dressing only: a dormer sits on a roof.
 */
interface DormerStyle {
  kind: 'gable' | 'shed';
  wall: RegionalBucket;
  covering: RegionalBucket;
  /** the window unit drawn in the dormer's front (openings.ts windowUnit through a callback, so the kit's own joinery) */
  window: (face: Face, u: number, y: number, w: number, h: number) => void;
  colour?: Rgb;
}

export function roofDormers(sink: PartSink, roof: { s: number; halfD: number; tanP: number; eaveY: number; ridgeY: number; ridgeTopY: number;
  topAt(x: number, z: number): number | null }, sides: readonly (1 | -1)[], zs: readonly number[], style: DormerStyle): void {
  const dw = 1.3, fh = 1.25;
  for (const side of sides) {
    for (const zc of zs) {
      // the front wall stands where the slope is ~0.9 m above the eave
      const xf = Math.max(0.6, roof.s - 0.9 / roof.tanP);
      const yb = (roof.topAt(side * xf, zc) ?? roof.eaveY) - 0.12, yt = yb + 0.12 + fh;
      const xb = Math.max(0.15, (roof.ridgeTopY - yt) / roof.tanP);
      if (xb >= xf - 0.2) continue;
      const face: Face = { origin: [side * xf, 0, zc], u: [0, 0, -side], out: [side, 0, 0], width: dw };
      // the front wall and its window
      sink.quad(style.wall, facePoint(face, -dw / 2, yb, 0), facePoint(face, dw / 2, yb, 0), facePoint(face, dw / 2, yt, 0), facePoint(face, -dw / 2, yt, 0),
        { ...DECOR, ...(style.colour ? { colour: style.colour } : {}) });
      sink.near(() => style.window(face, 0, yb + 0.32, 0.72, fh - 0.5));
      // the cheeks: triangles from the front back to the slope
      for (const end of [-1, 1]) {
        const z = zc + end * dw / 2;
        const a: Vec3 = [side * xf, yb, z], b: Vec3 = [side * xf, yt, z], c: Vec3 = [side * xb, yt, z];
        const toward: Vec3 = [0, 0, end];
        orientedTri(sink, style.wall, a, b, c, toward, { ...DECOR, ...(style.colour ? { colour: style.colour } : {}) });
      }
      // the dormer's roof
      if (style.kind === 'shed') {
        const t = 0.1, over = 0.18;
        const pts: Vec3[] = [[side * (xf + over), yt + 0.05, zc - dw / 2 - 0.12], [side * (xf + over), yt + 0.05, zc + dw / 2 + 0.12],
          [side * xb, yt + 0.32, zc + dw / 2 + 0.12], [side * xb, yt + 0.32, zc - dw / 2 - 0.12]];
        const n = normalize3([side * 0.27, Math.abs(xf + over - xb), 0]);
        orientedPrism(sink, style.covering, pts, n, t);
      } else {
        const rise = dw * 0.42, over = 0.2;
        for (const end of [-1, 1]) {
          const eave = (x: number): Vec3 => [x, yt, zc + end * (dw / 2 + 0.12)];
          const ridge = (x: number): Vec3 => [x, yt + rise, zc];
          const pts: Vec3[] = [eave(side * (xf + over)), eave(side * xb), ridge(side * xb), ridge(side * (xf + over))];
          const n = normalize3([0, dw / 2, end * rise]);
          orientedPrism(sink, style.covering, pts, n, 0.09);
        }
        // the dormer's little gable over its window
        const g: Vec3[] = [[side * xf, yt, zc - dw / 2], [side * xf, yt, zc + dw / 2], [side * xf, yt + rise - 0.06, zc]];
        orientedTri(sink, style.wall, g[0], g[1], g[2], [side, 0, 0], { ...DECOR, ...(style.colour ? { colour: style.colour } : {}) });
      }
    }
  }
}

/** A prism whose base polygon is ordered to face `n` (PartSink.prism wants it counter-clockwise seen from +dir). */
function orientedPrism(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], n: Vec3, t: number): void {
  const ab = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], ac = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
  const c = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const ordered = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= 0 ? pts : [...pts].reverse();
  sink.prism(bucket, ordered, n, t, DECOR);
}

/**
 * A balconette under an upper window (the Mediterranean street front's balkon): a stone slab on two corbels at the
 * window's sill, an iron railing round it — its rails and bars fine joinery. `y` is the window's sill height, `w` its
 * width.
 */
export function balconette(sink: PartSink, face: Face, u: number, y: number, w: number, slab: RegionalBucket, iron: Rgb, depth = 0.5): void {
  const sw = w + 0.5, t = 0.13;
  faceBox(sink, slab, face, u, y - t / 2 - 0.02, depth / 2, sw, t, depth, { ...DECOR, fineSides: 'near' });
  // the corbels: stepped blocks under the slab's ends
  for (const side of [-1, 1]) {
    const cu = u + side * (sw / 2 - 0.16);
    faceBox(sink, slab, face, cu, y - t - 0.12, depth * 0.35, 0.18, 0.2, depth * 0.7, { ...DECOR, fineSides: 'near' });
    faceBox(sink, slab, face, cu, y - t - 0.3, depth * 0.2, 0.16, 0.16, depth * 0.4, { ...DECOR, fine: 'near' });
  }
  // the railing: a top rail and a foot rail round the three open sides, bars between
  const rail: EmitOptions = { colour: iron, decor: true, fine: 'near' };
  const h = 0.92, o = depth - 0.05;
  faceBox(sink, 'structureMetal', face, u, y + h, o, sw - 0.06, 0.04, 0.04, { colour: iron, decor: true });
  faceBox(sink, 'structureMetal', face, u, y + 0.08, o, sw - 0.06, 0.03, 0.03, rail);
  for (const side of [-1, 1]) {
    faceBox(sink, 'structureMetal', face, u + side * (sw / 2 - 0.05), y + h, o / 2, 0.04, 0.04, o, { colour: iron, decor: true });
    faceBox(sink, 'structureMetal', face, u + side * (sw / 2 - 0.05), y + h / 2, o, 0.04, h, 0.04, rail);
  }
  const bars = Math.max(4, Math.round(sw / 0.12));
  for (let k = 1; k < bars; k++) faceBox(sink, 'structureMetal', face, u - sw / 2 + sw * k / bars, y + h / 2, o, 0.018, h - 0.08, 0.018, rail);
}

/**
 * A carved gable (the Russian and Ukrainian prichelina): under each verge board a fringe of scallops along its lower
 * edge, and the towel board (polotentse) hanging from the apex, cut to a point, a rosette on it. The gable's rakes run
 * from (±x0, y0) at the eaves to (0, apex) on the plane z (`end` the gable's outward side, ±z).
 */
export function carvedVerge(sink: PartSink, x0: number, y0: number, apex: number, z: number, end: number, colour: Rgb): void {
  const o = z + end * 0.03;
  const c = { ...DECOR, colour };
  const face: Face = { origin: [0, 0, o], u: [end, 0, 0], out: [0, 0, end], width: 2 * x0 };
  for (const side of [-1, 1]) {
    // scallops: small triangles hanging under the rake, one every 0.3 m
    const len = Math.hypot(x0, apex - y0), n = Math.max(3, Math.floor(len / 0.3));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
      const p = (t: number): [number, number] => [side * x0 * (1 - t), y0 + (apex - y0) * t - 0.11];
      const [ua, ya] = p(t0), [ub, yb] = p(t1), [um, ym] = p(tm);
      const tri: Array<[number, number]> = side * end > 0 ? [[ua, ya], [um, ym - 0.1], [ub, yb]] : [[ua, ya], [ub, yb], [um, ym - 0.1]];
      faceSlab(sink, 'structureWood', face, tri.map(([u, y]): [number, number] => [u * end, y]), 0, 0.03, { colour, fine: 'near' });
    }
  }
  // the towel board from the apex
  const w = 0.22, top = apex - 0.12, bottom = top - 1.0;
  faceSlab(sink, 'structureWood', face, [[-w / 2, bottom + 0.14], [0, bottom], [w / 2, bottom + 0.14], [w / 2, top], [-w / 2, top]], 0, 0.035, c);
  faceSlab(sink, 'structureWood', face, [[0, bottom + 0.42], [0.07, bottom + 0.52], [0, bottom + 0.62], [-0.07, bottom + 0.52]], 0.035, 0.008, { colour: [colour[0] * 0.6, colour[1] * 0.6, colour[2] * 0.6], fine: 'near' });
}

// -------------------------------------------------------------------------------------------------------------------
// Wave 116 (2026-10-05): the big reads — a painted plinth, shopfronts, gable windows, a rendered tower
// -------------------------------------------------------------------------------------------------------------------

/**
 * The plinth painted a dark clay band (the khata's pryzba): its four faces and its ledge under a coat of paint 6 mm
 * proud, `tint` over the render's lime. `half` is the body's half width (x) and half depth (z) at the wall plane, `out`
 * the plinth's projection, `y0..y1` its run. Fine paint: drawn within the fine-detail distance, in no shadow map.
 */
export function plinthPaint(sink: PartSink, bucket: RegionalBucket, half: readonly [number, number], out: number, y0: number, y1: number,
  tint: Rgb): void {
  const [hx, hz] = half, o = out + 0.006, paint = { ...DECOR, tint, fine: true };
  const faces: Face[] = [
    { origin: [0, 0, hz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hx },
    { origin: [hx, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2 * hz },
    { origin: [0, 0, -hz], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * hx },
    { origin: [-hx, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * hz },
  ];
  for (const face of faces) {
    const w = face.width / 2 + o;
    sink.polygon(bucket, [facePoint(face, -w, y0, o), facePoint(face, w, y0, o), facePoint(face, w, y1, o), facePoint(face, -w, y1, o)], paint);
    // the ledge, from the wall to the plinth's edge
    const a = facePoint(face, -w, y1 + 0.004, 0), b = facePoint(face, w, y1 + 0.004, 0);
    const c = facePoint(face, w, y1 + 0.004, o), d = facePoint(face, -w, y1 + 0.004, o);
    orientedTri(sink, bucket, a, b, c, [0, 1, 0], paint);
    orientedTri(sink, bucket, a, c, d, [0, 1, 0], paint);
  }
}

/**
 * A shopfront's joinery (a Central European shop of the 1900s): the glazing divided into lights no wider than ~0.8 m
 * under a row of transom lights, a panelled stall riser under the sill, and a painted fascia board with a moulded
 * cornice over the opening — so a shop reads as a shop, not a plate-glass hole. (u, y) is the bottom-centre of the
 * glazing (above the riser), `w` × `h` the glazing, `riser` the stall riser's height under it; the bars stand at the
 * depth the window unit's do (`back`, the reveal's).
 */
export function shopfrontJoinery(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, riser: number, back: number,
  paint: Rgb, frame: Rgb, surround: number, top: number): void {
  const fine: EmitOptions = { ...DECOR, colour: frame, fine: 'near' };
  const bar = 0.045, barO = 0.05;
  const n = Math.max(2, Math.ceil(w / 0.8));
  for (let k = 1; k < n; k++) faceBox(sink, 'structureWood', face, u - w / 2 + w * k / n, y + h / 2, back + barO / 2, bar, h - 0.1, barO, fine, 'caps');
  // the transom: a bar 0.42 m under the head, its lights divided twice as often
  const ty = y + h - 0.42;
  faceBox(sink, 'structureWood', face, u, ty, back + barO / 2, w - 0.1, 0.07, barO, fine, 'ends');
  for (let k = 1; k < 2 * n; k += 2) faceBox(sink, 'structureWood', face, u - w / 2 + w * k / (2 * n), ty + 0.21, back + barO / 2, 0.03, 0.36, barO, fine, 'caps');
  // the stall riser: a painted panel across the opening's foot, a raised field in it
  const rw = w + 2 * surround, panel = { ...DECOR, colour: paint };
  faceBox(sink, 'structureWood', face, u, y - riser / 2, 0.025, rw, riser - 0.04, 0.05, { ...panel, fineSides: 'near' });
  const fields = Math.max(1, Math.round(rw / 1.1));
  for (let k = 0; k < fields; k++) {
    const fu = u - rw / 2 + rw * (k + 0.5) / fields;
    faceBox(sink, 'structureWood', face, fu, y - riser / 2, 0.06, rw / fields - 0.16, riser - 0.2, 0.02,
      { ...DECOR, colour: [paint[0] * 0.82, paint[1] * 0.82, paint[2] * 0.82], fine: 'near' });
  }
  // the fascia: a painted board over the opening's head, a moulded cornice on it, as deep as the storey leaves room for
  const foot = y + h + surround + 0.02, room = top - 0.06 - foot, board = Math.min(0.4, room - 0.08);
  // (wave 150: "a blank grey shop window") the shop's name: painted along the fascia in the board's other colour, or,
  // where the storey leaves no room for a board, gilded on the glass of the transom lights (fine: a near read)
  const lettering = (cy: number, height: number, o: number, ink: Rgb, width: number) => {
    const span = Math.min(width, 0.16 * Math.max(4, Math.floor(width / 0.24)));
    let cu = u - span / 2;
    for (let k = 0; cu < u + span / 2 - 0.06; k++) {
      const wk = 0.07 + 0.06 * hash01(face.origin[0], face.origin[2], u, k);
      if (cu + wk > u + span / 2) break;
      faceBox(sink, 'structureWood', face, cu + wk / 2, cy, o, wk, height, 0.004, { ...DECOR, colour: ink, fine: 'near' });
      cu += wk + (k % 6 === 5 ? 0.12 : 0.035);
    }
  };
  if (board < 0.2) {
    lettering(ty + 0.21, 0.15, back + barO + 0.004, [0.86, 0.72, 0.36], w - 0.3);
    return;
  }
  faceBox(sink, 'structureWood', face, u, foot + board / 2, 0.05, rw + 0.3, board, 0.1, { ...panel, fineSides: 'near' });
  faceBox(sink, 'structureWood', face, u, foot + board + 0.035, 0.09, rw + 0.44, 0.07, 0.18, { ...panel, fineSides: 'near' });
  const light = paint[0] + paint[1] + paint[2] > 1.2;
  lettering(foot + board / 2, Math.min(0.2, board * 0.5), 0.101, light ? [0.06, 0.05, 0.05] : [0.86, 0.72, 0.36], rw - 0.1);
}

/**
 * A shop window's display (wave 199 on Steinburg: "flat, opaque grey-beige rectangles with no glazing reflection or
 * interior visible, reading as boarded-up"): the goods standing on the glazing's bottom rail and on a shelf across it a
 * third of the way up — boxes, jars, bolts of cloth, loaves — in the narrow depth between the pane and its bars, shaded
 * a little as through glass. (u, y) the glazing's bottom-centre, `w` x `h` its size, `back` the pane's depth (the
 * reveal's); near fine dressing, every choice from the facade stream.
 */
export function shopDisplay(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, back: number): void {
  const rng = facadeRng();
  const near: EmitOptions = { ...DECOR, fine: 'near' };
  const o = back + 0.032, deep = 0.03, shelfY = y + Math.min(0.42, h * 0.3);
  faceBox(sink, 'structureWood', face, u, shelfY - 0.012, o, w - 0.12, 0.024, deep, { ...near, colour: [0.28, 0.22, 0.17] });
  const lights = Math.max(2, Math.ceil(w / 0.8));
  // (on the frame's bottom rail, a frame width up, and on the shelf)
  for (const base of [y + 0.07, shelfY]) {
    for (let k = 0; k < lights; k++) {
      const l0 = u - w / 2 + w * k / lights + 0.07, l1 = u - w / 2 + w * (k + 1) / lights - 0.07;
      let cu = l0 + rng() * 0.06;
      // (three wares a light and shelf at most: the window reads stocked, and stays cheap)
      for (let n = 0; n < 3 && cu < l1 - 0.08; n++) {
        const kind = rng(), c = GOODS[Math.floor(rng() * GOODS.length)];
        const tone = 0.68 + rng() * 0.2, colour: Rgb = [c[0] * tone, c[1] * tone, c[2] * tone];
        // a box, a tall jar, a bolt of cloth lying down, a loaf
        const [gw, gh] = kind < 0.4 ? [0.1 + rng() * 0.12, 0.08 + rng() * 0.2] : kind < 0.65 ? [0.06 + rng() * 0.03, 0.12 + rng() * 0.08]
          : kind < 0.85 ? [0.18 + rng() * 0.08, 0.07 + rng() * 0.04] : [0.14 + rng() * 0.06, 0.06 + rng() * 0.03];
        if (cu + gw > l1) break;
        faceBox(sink, 'structureWood', face, cu + gw / 2, base + gh / 2, o, gw, gh, deep, { ...near, colour }, { bottom: true });
        cu += gw + 0.015 + rng() * 0.05;
      }
    }
  }
}
/** the goods' packaging and wares: tins, card, glass, linen, bread */
const GOODS: readonly Rgb[] = [[0.62, 0.18, 0.14], [0.2, 0.3, 0.52], [0.78, 0.7, 0.5], [0.3, 0.42, 0.28], [0.72, 0.56, 0.3],
  [0.85, 0.82, 0.74], [0.42, 0.3, 0.22], [0.55, 0.6, 0.62]];

/**
 * The painted emblem on an inn's hanging sign (wave 150: "a blank inn sign"): a gilded beer tankard under its head of
 * foam, its lid and handle, in a painted border on both faces of the board. (u, y) the board's centre on the wall face,
 * `out` its centre's distance from the wall, `half` half its thickness, `w` × `h` its face (w along the wall's normal).
 * (The facades lane, 2026-10-08: it was a gilded star of two crossed triangles, a brewer's star by intent, which yellow
 * on a dark board in a German village of the war years reads as the yellow star of the persecution. Never a hexagram.)
 */
export function innEmblem(sink: PartSink, face: Face, u: number, y: number, out: number, half: number, w: number, h: number): void {
  const gold: Rgb = [0.78, 0.6, 0.22], rim: Rgb = [0.1, 0.08, 0.06];
  for (const side of [-1, 1]) {
    // the board's face toward `side` along the wall: a frame whose u is the wall's normal
    const n: Vec3 = [face.u[0] * side, face.u[1] * side, face.u[2] * side];
    const base: Vec3 = [face.origin[0] + face.u[0] * u, 0, face.origin[2] + face.u[2] * u];
    const f: Face = { origin: base, u: [face.out[0] * -side, 0, face.out[2] * -side], out: n, width: w };
    const c = -side * out;
    const r = Math.min(w, h) * 0.32, cy = y;
    faceSlab(sink, 'structureWood', f, [[c - w / 2 + 0.03, cy - h / 2 + 0.03], [c + w / 2 - 0.03, cy - h / 2 + 0.03], [c + w / 2 - 0.03, cy + h / 2 - 0.03], [c - w / 2 + 0.03, cy + h / 2 - 0.03]],
      half, 0.004, { colour: rim, fine: 'near' });
    // the tankard: its body, the lid's rim over it, the foam heaped over the rim, the handle's three bars on one side
    const rect = (u0: number, y0: number, u1: number, y1: number): Array<[number, number]> =>
      [[c + u0 * r, cy + y0 * r], [c + u1 * r, cy + y0 * r], [c + u1 * r, cy + y1 * r], [c + u0 * r, cy + y1 * r]];
    const foam: Rgb = [0.9, 0.86, 0.74];
    for (const [poly, colour] of [
      [rect(-0.55, -0.8, 0.4, 0.55), gold], [rect(-0.62, 0.55, 0.47, 0.66), gold],
      [rect(-0.5, 0.66, 0.36, 0.86), foam], [rect(-0.3, 0.86, 0.12, 0.98), foam],
      [rect(0.4, 0.3, 0.82, 0.44), gold], [rect(0.4, -0.52, 0.82, -0.38), gold], [rect(0.68, -0.52, 0.82, 0.44), gold],
    ] as Array<[Array<[number, number]>, Rgb]>) {
      faceSlab(sink, 'structureWood', f, poly, half + 0.004, 0.003, { colour, fine: 'near' });
    }
  }
}

/**
 * Windows lit into a gable (the attic's: a town house's gables are seldom blank): one or two at the first attic floor
 * clear of the loft door's strip, one small one high under the ridge where the gable is tall enough — each a window
 * unit standing on the gable face (no opening is cut: the gable keeps its structure). `gable` is the gable polygon
 * (u, y on the face), `eaveY`/`ridgeY` its foot and apex, `skip` a strip of u the gable's own fittings keep.
 */
export function gableWindows(gable: ReadonlyArray<readonly [number, number]>, eaveY: number, ridgeY: number, skip: number,
  place: (u: number, y: number, w: number, h: number) => void): void {
  const halfAt = (y: number) => {
    // the gable's half width at height y: the polygon's widest |u| at that height (a gable or a half-hip's trapezoid)
    let best = 0;
    for (let i = 0; i < gable.length; i++) {
      const [ua, ya] = gable[i], [ub, yb] = gable[(i + 1) % gable.length];
      if ((ya - y) * (yb - y) > 0 || Math.abs(yb - ya) < 1e-6) continue;
      best = Math.max(best, Math.abs(ua + (ub - ua) * (y - ya) / (yb - ya)));
    }
    return best;
  };
  const rise = ridgeY - eaveY;
  if (rise < 2.2) return;
  const y1 = eaveY + 0.55, h1 = Math.min(1.1, rise * 0.3), w1 = 0.7;
  const room = halfAt(y1 + h1 + 0.25) - 0.35;
  if (skip > 0) {
    // two windows flanking the loft door's strip
    const u = skip / 2 + 0.25 + w1 / 2;
    if (u + w1 / 2 <= room) for (const side of [-1, 1]) place(side * u, y1, w1, h1);
  } else if (room > w1 * 1.6) {
    for (const side of [-1, 1]) place(side * Math.min(room - w1 / 2, 0.9), y1, w1, h1);
  } else if (room > w1 / 2) place(0, y1, w1, h1);
  // a small window high in the gable, over the door strip's top
  const y2 = eaveY + Math.max(2.1, rise * 0.62), h2 = 0.55, w2 = 0.45;
  if (skip === 0 && y2 + h2 < ridgeY - 0.6 && halfAt(y2 + h2 + 0.15) > w2 / 2 + 0.25) place(0, y2, w2, h2);
}

/**
 * A tower shaft rendered over its rubble (the Hessian village church's west tower; wave 116 read its bare sandstone as
 * "a church tower brick scaled several times too large"): a coat of render on each face 12 mm proud, leaving the
 * corners `corner` wide and stopping clear of the openings in `holes` (u0, u1, y0, y1 per face, by face index front,
 * right, back, left). The four faces of a square shaft `s` wide centred on (cx, cz). (wave 172 read the bare corners
 * as "brick strips instead of dressed sandstone") Each corner is a column of dressed quoins, a stone 38 cm high every
 * 41 cm standing 3 cm proud of the shaft, each one whole stone of the style's tile (dressedQuoin).
 */
export function renderedShaft(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, s: number, y0: number, y1: number,
  corner: number, holes: ReadonlyArray<ReadonlyArray<readonly [number, number, number, number]>> = []): void {
  const h = s / 2;
  const faces: Face[] = [
    { origin: [cx, 0, cz + h], u: [1, 0, 0], out: [0, 0, 1], width: s },
    { origin: [cx + h, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: s },
    { origin: [cx, 0, cz - h], u: [-1, 0, 0], out: [0, 0, -1], width: s },
    { origin: [cx - h, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: s },
  ];
  faces.forEach((face, k) => {
    const u0 = -h + corner, u1 = h - corner;
    // the face in strips round its openings: below, above, and either side of each
    const cut = [...(holes[k] ?? [])].sort((a, b) => a[2] - b[2]);
    const rect = (a: number, b: number, ya: number, yb: number) => {
      if (b - a < 0.05 || yb - ya < 0.05) return;
      sink.polygon(bucket, [facePoint(face, a, ya, 0.012), facePoint(face, b, ya, 0.012), facePoint(face, b, yb, 0.012), facePoint(face, a, yb, 0.012)], DECOR);
    };
    let y = y0;
    for (const [hu0, hu1, hy0, hy1] of cut) {
      rect(u0, u1, y, hy0);
      rect(u0, Math.max(u0, hu0), hy0, hy1);
      rect(Math.min(u1, hu1), u1, hy0, hy1);
      y = hy1;
    }
    rect(u0, u1, y, y1);
  });
  // (wave 199: the corners read as "stripes of small red bricks") long and short stones by turns, each long one running
  // 22 cm past the corner strip into the render on alternate faces, under joints of 1.5 cm
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
    const x = cx + sx * h, z = cz + sz * h;
    for (let y = y0, k = 0; y + 0.38 <= y1 + 0.01; y += 0.395, k++) {
      const along = corner + (k & 1 ? 0 : 0.22), across = corner + (k & 1 ? 0.22 : 0);
      dressedQuoin(sink, 'stone', x - sx * along, y, z - sz * across, x + sx * 0.03, y + 0.38, z + sz * 0.03, sx, sz, DECOR);
    }
  }
}
