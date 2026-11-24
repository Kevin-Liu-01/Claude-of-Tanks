// src/world/maps/regional/roofRelief.ts — the shared roof relief (dome-detail-275; the roof bar: "roofs in courses, in
// relief"; the roof scan: 83 kit builders whose roofs were smooth slabs). A roof's covering laid in relief over the slab
// a roof grammar emits — plain tiles, pantiles and canal tiles in their courses and rolls, slates and shingles in runs
// with their butts proud, corrugated or asbestos sheets in courses with their end and side laps, felt in rolls with its
// laps and patches, thatch in its courses — so a smooth slab reads as the covering it is from 30 to 150 m.
//
// Opt-in, two ways: house.ts RoofSpec.relief (emitRoof lays it over every slope of a gable, hip, half-hip, shed or flat
// roof it emits, leaving the war's stripped patch open, HouseFrame.roofPatch), or layRoofRelief over a slope or a flat
// rectangle a builder with its own roof describes (reliefSlope, reliefFlat). Dressing only (the slab keeps the
// collision); the courses, rolls and laps coarse decor, the finest joints (a run's jogged end, a sheet's side lap, a
// patch's edges, a roll's head) `fine`. Its look draws from a stream of its own seeded by the sink's UV offset and the
// roof's measure, so opting in moves no build or look stream; and each roof's relief keeps to a triangle allowance
// (RoofRelief.budget; by default its plan area's), coarsening its runs, gauge and rolls until it fits.
import { PartSink, type EmitOptions, type RegionalBucket, type RegionalParts, type Rgb, type UvMode, type Vec3 } from './geometry.ts';
import type { RoofGeometry, RoofPatch, RoofSpec } from './house.ts';
import { registerBuildScope } from '../buildScopes.ts';

export type RoofReliefKind = 'tile' | 'pantile' | 'canal' | 'slate' | 'shingle' | 'sheet' | 'felt' | 'thatch';

/** A roof covering laid in relief (house.ts RoofSpec.relief, layRoofRelief). Every field but `kind` has the kind's default. */
export interface RoofRelief {
  kind: RoofReliefKind;
  /** the courses' gauge up the slope (m): a sheet's cover length, a felt roll's width */
  gauge?: number;
  /** across the slope (m): a sheet's width, the rolls' pitch of pantiles and canal tiles */
  pitch?: number;
  /** a sheet's corrugations drawn in relief across it (sheet only; default 2: a profile reads at range, not each wave) */
  ribs?: number;
  /**
   * how worn the covering is, against its kind's default (KINDS.wear): at the default about one patch (a run relaid, a
   * sheet replaced, a lichened run, a sheet's rust runs, a felt patch) to every PATCH_M2 of plan, at most half again more
   */
  wear?: number;
  /** the triangles this roof's relief may take on a desktop, fine parts with it (default: its plan area's allowance) */
  budget?: number;
  /** mixed into the relief's own look stream: two roofs of one build of one measure lay alike without it */
  seed?: number;
}

/** A plane of covering in the emitting frame: its top surface's outline (convex), its outward normal, its courses' way. */
export interface ReliefPlane {
  pts: readonly Vec3[];
  n: Vec3;
  /** up the slope (default its steepest ascent); a flat plane gives the way its rolls lap (default +x) */
  up?: Vec3;
  /** how far short of the top edge the relief stops (default 0.1: a ridge cap over it; 0 on a flat plane) */
  top?: number;
}

/** A rectangle in plan (the emitting frame's x and z) the relief leaves open: a war-stripped patch, a skylight, a hatch. */
export interface ReliefHole { x0: number; x1: number; z0: number; z1: number }

export interface ReliefOptions {
  /** the covering's bucket (the relief lies in it) */
  bucket: RegionalBucket;
  /** the covering's own emit options (emitRoof's slab: its colour or weathered paint, its tint): the relief shades them */
  base?: EmitOptions;
  holes?: readonly ReliefHole[];
  /** a flat plane's open edges get a gravel stop (an edge trim a hand high): false where a parapet rings it */
  edge?: boolean;
}

type Emit = (pts: Vec3[], toward: Vec3, o: EmitOptions) => void;

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
const mulRgb = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const shadeRgb = (c: Rgb, k: number): Rgb => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/** The relief's own stream (mulberry32): seeded by the build's UV offset and the roof's measure, never a build stream. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(sink: PartSink, planes: readonly ReliefPlane[], extra: number): number {
  let h = 0x9e3779b1 ^ Math.round(extra * 7919);
  const mix = (x: number) => { h = Math.imul(h ^ Math.round(x * 1000), 0x85ebca6b); h ^= h >>> 13; };
  mix(sink.uvOffset[0]); mix(sink.uvOffset[1]);
  for (const p of planes) for (const q of p.pts) { mix(q[0]); mix(q[1]); mix(q[2]); }
  return h >>> 0;
}

/** A plane in its own terms: a point `v` up it from its lowest edge, `t` along it, `h` off it; its (v, t) outline. */
interface Frame { o: Vec3; up: Vec3; along: Vec3; n: Vec3; reach: number; top: number; flat: boolean; poly: Array<[number, number]>; plan: number }

function frameOf(p: ReliefPlane): Frame | null {
  if (p.pts.length < 3) return null;
  const n = unit(p.n), Y: Vec3 = [0, 1, 0];
  let up = sub(Y, [n[0] * n[1], n[1] * n[1], n[2] * n[1]]);
  const flat = Math.hypot(up[0], up[1], up[2]) < 0.02;
  if (p.up) up = p.up;
  else if (flat) up = [1, 0, 0];
  up = unit(sub(up, [n[0] * dot(up, n), n[1] * dot(up, n), n[2] * dot(up, n)]));
  const along = unit(cross(n, up));
  let o = p.pts[0];
  for (const q of p.pts) if (dot(q, up) < dot(o, up)) o = q;
  const poly = p.pts.map((q): [number, number] => [dot(sub(q, o), up), dot(sub(q, o), along)]);
  const reach = Math.max(...poly.map(([v]) => v));
  let plan = 0;
  for (let i = 0; i < p.pts.length; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length];
    plan += a[0] * b[2] - b[0] * a[2];
  }
  if (reach < 0.3 || Math.abs(plan) / 2 < 0.25) return null;
  return { o, up, along, n, reach, top: p.top ?? (flat ? 0 : 0.1), flat, poly, plan: Math.abs(plan) / 2 };
}
const at = (f: Frame, v: number, t: number, h: number): Vec3 => [
  f.o[0] + f.up[0] * v + f.along[0] * t + f.n[0] * h,
  f.o[1] + f.up[1] * v + f.along[1] * t + f.n[1] * h,
  f.o[2] + f.up[2] * v + f.along[2] * t + f.n[2] * h,
];
/** The plane's chord along t at a height v up it (clamped into its outline), or null where it has none. */
function chord(f: Frame, v: number): [number, number] | null {
  const vv = Math.min(f.reach - 1e-6, Math.max(1e-6, v));
  let lo = Infinity, hi = -Infinity;
  const P = f.poly;
  for (let i = 0; i < P.length; i++) {
    const [va, ta] = P[i], [vb, tb] = P[(i + 1) % P.length];
    if ((va - vv) * (vb - vv) > 0 || va === vb) continue;
    const t = ta + (tb - ta) * (vv - va) / (vb - va);
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  return hi - lo > 1e-4 ? [lo, hi] : null;
}
/** A hole's box in a plane's (v, t), or null where it misses the plane. */
function holeBox(f: Frame, h: ReliefHole, pad: number): [number, number, number, number] | null {
  if (Math.abs(f.n[1]) < 0.05) return null;
  let v0 = Infinity, v1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const x of [h.x0 - pad, h.x1 + pad]) for (const z of [h.z0 - pad, h.z1 + pad]) {
    const y = f.o[1] - ((x - f.o[0]) * f.n[0] + (z - f.o[2]) * f.n[2]) / f.n[1];
    const d = sub([x, y, z], f.o), v = dot(d, f.up), t = dot(d, f.along);
    v0 = Math.min(v0, v); v1 = Math.max(v1, v); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  return v1 < 0 || v0 > f.reach ? null : [v0, v1, t0, t1];
}
/** [t0, t1] less the holes that cross the band v0..v1, pieces shorter than `min` dropped. */
function cut(t0: number, t1: number, v0: number, v1: number, holes: ReadonlyArray<readonly [number, number, number, number]>, min: number): Array<[number, number]> {
  let segs: Array<[number, number]> = [[t0, t1]];
  for (const h of holes) {
    if (v1 <= h[0] || v0 >= h[1]) continue;
    segs = segs.flatMap(([a, b]): Array<[number, number]> => [[a, Math.min(b, h[2])], [Math.max(a, h[3]), b]]);
  }
  return segs.filter(([a, b]) => b - a > min);
}

/** The kinds' measure: course gauge, butt (m proud), eave course's butt, mean run of one tone, wear share. */
const KINDS: Record<RoofReliefKind, { gauge: number; butt: number; foot: number; run: number; wear: number; pitch: number }> = {
  tile: { gauge: 0.3, butt: 0.035, foot: 0.06, run: 3.2, wear: 0.06, pitch: 0 },
  slate: { gauge: 0.26, butt: 0.024, foot: 0.05, run: 2.6, wear: 0.05, pitch: 0 },
  shingle: { gauge: 0.24, butt: 0.03, foot: 0.05, run: 1.5, wear: 0.08, pitch: 0 },
  // (dome-detail-275, the roof closeout) thatch's run: the span between the nodes its course line wanders through
  thatch: { gauge: 0.5, butt: 0.05, foot: 0.12, run: 1.5, wear: 0.05, pitch: 0 },
  felt: { gauge: 0.95, butt: 0.012, foot: 0.02, run: 4.4, wear: 0.12, pitch: 0 },
  pantile: { gauge: 0.32, butt: 0.024, foot: 0.04, run: 4, wear: 0.06, pitch: 0.3 },
  canal: { gauge: 0.42, butt: 0.03, foot: 0.05, run: 3.6, wear: 0.06, pitch: 0.42 },
  sheet: { gauge: 2.25, butt: 0.03, foot: 0.03, run: 0, wear: 0.08, pitch: 0.95 },
};
/** The coarsening ladder (a roof over its allowance takes the first level that fits): run, gauge, pitch, roll sides, ribs. */
const LEVELS: ReadonlyArray<{ run: number; gauge: number; pitch: number; segs: number }> = [
  { run: 1, gauge: 1, pitch: 1, segs: 3 },
  { run: 2, gauge: 1, pitch: 1, segs: 3 },
  { run: 3, gauge: 1.25, pitch: 1.3, segs: 2 },
  { run: 4, gauge: 1.5, pitch: 1.6, segs: 2 },
  { run: 5, gauge: 2, pitch: 2, segs: 2 },
  { run: 6, gauge: 2.6, pitch: 2.6, segs: 2 },
  { run: 8, gauge: 3.4, pitch: 3.4, segs: 2 },
];
/** A ladder level past its last step: the last coarsened half again a step, for a roof far over a small allowance. */
const EXTRA_LEVELS = 5;
function levelOf(L: number): (typeof LEVELS)[number] {
  const last = LEVELS[LEVELS.length - 1];
  if (L < LEVELS.length) return LEVELS[Math.max(0, L)];
  const k = 1.5 ** (L - LEVELS.length + 1);
  return { run: last.run * k, gauge: last.gauge * k, pitch: last.pitch * k, segs: last.segs };
}
/** A roof's default allowance: its plan area's (desktop triangles a square metre), within a floor and a ceiling. */
export const RELIEF_TRIS_PER_M2 = 6;
export const RELIEF_MAX_TRIS = 2400;

/**
 * The covering's wear, kept within about ±12 % of its own tone (the coordinator, 2026-11-22: the first patches read as
 * "bright orange blotches, not weathering"): a run of tiles relaid a touch redder and browner, a replaced sheet a little
 * cleaner, a faint grey-green lichen, silvered timber, a cooler new slate, rust in thin runs under a sheet's lap; and the
 * patches few, about one to every PATCH_M2 of plan.
 */
const RELAID: Rgb = [1.04, 0.97, 0.94], MOSS: Rgb = [0.95, 0.99, 0.93], RUST: Rgb = [1.04, 0.94, 0.86], SILVER: Rgb = [1.01, 1.02, 1.04];
const NEW_SLATE: Rgb = [0.98, 1.0, 1.03], CLEAN: Rgb = [1.0, 1.01, 1.03];
const PATCH_M2 = 40, TONE_LO = 0.88, TONE_HI = 1.12;
const toneIn = (k: number): number => Math.min(TONE_HI, Math.max(TONE_LO, k));
/** The chance a run, roll or sheet of a plane is a patch: its plan's share of patches over the cells it is laid in. */
function patchShare(f: Frame, relief: RoofRelief, cells: number): number {
  const K = KINDS[relief.kind], k = Math.min(1.5, Math.max(0.5, (relief.wear ?? K.wear) / K.wear));
  return Math.min(0.5, f.plan / PATCH_M2 * k / Math.max(1, cells));
}
/** A plane's chord across its middle (the width its cells are counted over). */
const midWidth = (f: Frame, top: number): number => { const c = chord(f, top / 2); return c ? c[1] - c[0] : 1; };

/**
 * Lay a covering in relief over `planes` (dome-detail-275). Returns the triangles laid. The planes' outlines are the
 * covering's top surface; the relief stands on it, stops `top` short of each plane's top edge, leaves `holes` open.
 */
export function layRoofRelief(sink: PartSink, relief: RoofRelief, planes: readonly ReliefPlane[], o: ReliefOptions): number {
  const frames = planes.map(frameOf).filter((f): f is Frame => f !== null);
  if (!frames.length) return 0;
  const plan = frames.reduce((a, f) => a + f.plan, 0);
  const budget = relief.budget ?? Math.min(RELIEF_MAX_TRIS, Math.max(60, Math.round(plan * RELIEF_TRIS_PER_M2)));
  const seed = seedOf(sink, planes, relief.seed ?? 0);
  // the first level of the ladder within the allowance (a sheet's ribs given up first); none within it, no relief
  let level = -1;
  const levels = LEVELS.length + EXTRA_LEVELS + (relief.kind === 'sheet' ? relief.ribs ?? 2 : 0);
  for (let L = 0; L < levels; L++) {
    let n = 0;
    layAll(relief, frames, o, L, seed, (pts) => { n += pts.length - 2; });
    if (n <= budget) { level = L; break; }
  }
  if (level < 0) return 0;
  let laid = 0;
  layAll(relief, frames, o, level, seed, (pts, toward, opts) => {
    const nn = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    sink.polygon(o.bucket, dot(nn, toward) >= 0 ? pts : [...pts].reverse(), opts);
    laid += pts.length - 2;
  });
  if (reliefLog) {
    for (const f of frames) {
      const k = 1 / f.poly.length, cv = f.poly.reduce((x, [v]) => x + v * k, 0), ct = f.poly.reduce((x, [, t]) => x + t * k, 0);
      reliefLog.push({ centre: sink.framePoint(at(f, cv, ct, 0)), plan: f.plan, tris: Math.round(laid * f.plan / plan), kind: relief.kind, level });
    }
  }
  return laid;
}

/**
 * (dome-detail-275) A plane of relief layRoofRelief laid: its plan centre in the building's frame, plan area and its share
 * of the triangles, the coarsening level it took (roofRelief.selftest reads the relief a builder laid over its own roofs).
 */
export interface ReliefLogEntry { centre: Vec3; plan: number; tris: number; kind: RoofReliefKind; level: number }
let reliefLog: ReliefLogEntry[] | null = null;
registerBuildScope('roofRelief.log', () => reliefLog !== null);
export function withReliefLog<T>(build: () => T): [T, ReliefLogEntry[]] {
  const prior = reliefLog, log: ReliefLogEntry[] = [];
  reliefLog = log;
  try { return [build(), log]; } finally { reliefLog = prior; }
}

/** A rectangular slope for layRoofRelief: its eave edge from `a` to `b` on the covering's top, `rise` from it to its top edge. */
export function reliefSlope(a: Vec3, b: Vec3, rise: Vec3, top = 0.1): ReliefPlane {
  const n = unit(cross(sub(b, a), rise));
  return { pts: [a, b, add(b, rise), add(a, rise)], n: n[1] < 0 ? neg(n) : n, top };
}
/** A flat rectangle for layRoofRelief at the covering's top `y`; its felt rolls lap along x (`lapX`) or z. */
export function reliefFlat(x0: number, z0: number, x1: number, z1: number, y: number, lapX = true): ReliefPlane {
  return { pts: [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], n: [0, 1, 0], up: lapX ? [1, 0, 0] : [0, 0, 1], top: 0 };
}

function layAll(relief: RoofRelief, frames: readonly Frame[], o: ReliefOptions, L: number, seed: number, emit: Emit): void {
  const look = stream(seed), K = KINDS[relief.kind], lv = levelOf(L);
  // a sheet covering first gives up its corrugations, then its sheets' size
  const R0 = relief.ribs ?? 2, sv = levelOf(L - R0), ribs = Math.max(0, R0 - L);
  const base = o.base ?? {};
  // the relief's paint from the covering's: a coloured sheet shaded (and its weathering down the slope kept), a textured
  // covering's occlusion and tint
  const paint = (f: Frame, tone: number, tint: Rgb | null, fine: boolean | 'near' = false): EmitOptions => {
    const uv: UvMode = { kind: 'plane', origin: f.o, u: o.bucket === 'straw' ? neg(f.up) : f.along, v: o.bucket === 'straw' ? f.along : neg(f.up) };
    // (276 perf hold) the courses stand centimetres off a slab that already casts the roof's shadow: they cast none
    const out: EmitOptions = { decor: true, noCast: true, uv, ...(fine ? { fine } : {}) };
    if (base.colourAt) {
      const ca = base.colourAt;
      return { ...out, colourAt: (p) => { const c = shadeRgb(ca(p), tone); return tint ? mulRgb(c, tint) : c; } };
    }
    if (base.colour) return { ...out, colour: tint ? mulRgb(shadeRgb(base.colour, tone), tint) : shadeRgb(base.colour, tone) };
    const bt = base.tint ?? null, t = tint && bt ? mulRgb(tint, bt) : tint ?? bt;
    return { ...out, shade: tone, ...(t ? { tint: t } : {}) };
  };
  for (const f of frames) {
    const holes = (o.holes ?? []).map((h) => holeBox(f, h, 0.06)).filter((h): h is [number, number, number, number] => h !== null);
    const top = f.reach - f.top;
    if (top < 0.25) continue;
    if (relief.kind === 'sheet') sheets(f, relief, K, sv, ribs, look, holes, top, paint, emit);
    else if (relief.kind === 'thatch') thatch(f, relief, K, lv, look, holes, top, paint, emit);
    else {
      if (relief.kind === 'pantile' || relief.kind === 'canal') rolls(f, relief, K, lv, look, holes, top, paint, emit);
      courses(f, relief, K, lv, look, holes, top, paint, emit);
    }
    if (f.flat) flatDress(f, relief, look, holes, paint, emit, o.edge !== false, relief.kind === 'felt');
  }
}

type Paint = (f: Frame, tone: number, tint: Rgb | null, fine?: boolean | 'near') => EmitOptions;
type Holes = ReadonlyArray<readonly [number, number, number, number]>;

/**
 * Courses up the slope `gauge` apart, each a run of its own tone (the length a roofer laid from one stack, a newer run
 * let in, the lichen and the wet toward the eave): its butt `butt` proud facing down the slope at its foot, its face
 * thinning up to the course over it; the eave course thicker and out past the edge with its underside seen. Slates and
 * shingles jog their butts run to run, the jog's ends fine. Pantiles and canal tiles: their laps under the rolls.
 * (Thatch lays its own courses: thatch.)
 */
function courses(f: Frame, relief: RoofRelief, K: (typeof KINDS)[RoofReliefKind], lv: (typeof LEVELS)[number], look: () => number,
  holes: Holes, top: number, paint: Paint, emit: Emit): void {
  const g = (relief.gauge ?? K.gauge) * lv.gauge, runMean = K.run * lv.run;
  const kind = relief.kind, rolled = kind === 'pantile' || kind === 'canal', jog = kind === 'slate' || kind === 'shingle';
  // the patches: runs relaid or lichened (a rolled covering's patches are its rolls'; a felt roof's lie over it)
  const pp = rolled || kind === 'felt' ? 0 : patchShare(f, relief, Math.ceil(top / g) * Math.max(1, midWidth(f, top) / runMean));
  const m = rolled ? 0.1 : 0.04;
  for (let k = 0; ; k++) {
    const foot = k === 0 && !f.flat && !rolled;
    const v0 = foot ? -0.04 : k * g, v1 = Math.min(top, (k + 1) * g);
    if (v1 - Math.max(0, v0) < 0.08 || k * g > top) break;
    const L0 = chord(f, Math.max(0, v0)), L1 = chord(f, v1);
    if (!L0 || !L1) continue;
    const a0 = L0[0] + m, b0 = L0[1] - m, a1 = L1[0] + m, b1 = L1[1] - m;
    if (b0 - a0 < 0.2 || b1 - a1 < 0.08) continue;
    const low = f.flat ? 0 : Math.max(0, 1 - v0 / 2.6);
    for (let t = a0; t < b0 - 0.05;) {
      let w = runMean * (0.45 + look() * 1.1);
      if (b0 - t - w < runMean * 0.35) w = b0 - t;
      // a patch is lichen more often toward the eave, else a run relaid
      const patch = look() < pp, moss = patch && look() < 0.3 + 0.5 * low, fresh = patch && !moss;
      const tone = toneIn((foot ? 0.92 : 0.93 + look() * 0.14) * (fresh ? 1.08 : moss ? 0.96 : 1));
      const tint = kind === 'felt' ? null : kind === 'slate' ? (fresh ? NEW_SLATE : moss ? MOSS : null)
        : fresh ? (kind === 'shingle' ? null : RELAID) : moss ? (kind === 'shingle' ? SILVER : MOSS) : null;
      const b = (foot ? K.foot : K.butt) * (jog ? 0.85 + look() * 0.3 : 1), dv = jog && !foot ? (look() - 0.5) * 0.035 : 0;
      for (const [s0, s1] of cut(t, t + w, v0, v1, holes, 0.15)) {
        // the run's ends at the foot and at the head, inside the chord (a hip closing it)
        const ta = Math.max(s0, a0), tb = Math.min(s1, b0);
        const tc = Math.max(s0, a1), td = Math.min(s1, b1);
        if (tb - ta < 0.12 || td - tc < 0.04) continue;
        const A0 = at(f, v0 + dv, ta, 0), A1 = at(f, v0 + dv, tb, 0), B0 = at(f, v0 + dv, ta, b), B1 = at(f, v0 + dv, tb, b);
        const C0 = at(f, v1, tc, 0.004), C1 = at(f, v1, td, 0.004);
        const op = paint(f, tone, tint);
        emit([A0, A1, B1, B0], neg(f.up), paint(f, tone * 0.72, tint));
        emit([B0, B1, C1, C0], f.n, op);
        if (foot) emit([A0, A1, at(f, 0, tb, 0), at(f, 0, ta, 0)], neg(f.n), paint(f, tone * 0.55, tint));
        if (jog) {
          emit([A0, B0, C0], neg(f.along), paint(f, tone * 0.8, tint, true));
          emit([A1, B1, C1], f.along, paint(f, tone * 0.8, tint, true));
        }
      }
      t += w;
    }
  }
}

/**
 * Thatch in its courses (dome-detail-275, the roof closeout: the first thatch "reads as boards", hard dark joints in
 * straight rows): a mat, not boards. Each course a strip of bundles whose butts make a soft lip, sloped and only a few
 * per cent darker than the field, its line wandering up and down the slope and its depth swelling and thinning along it
 * (a thinner, older stretch; a fuller, newer one; lichen toward the eave), its face passing up under the course over it,
 * the gauge course to course given or taken a fifth. The eave course thick, cut ragged out past the edge with its
 * underside seen; under a ridge cap a soft roll swelling up to it. Every strip closed at its ends (no back face seen).
 */
function thatch(f: Frame, relief: RoofRelief, K: (typeof KINDS)[RoofReliefKind], lv: (typeof LEVELS)[number], look: () => number,
  holes: Holes, top: number, paint: Paint, emit: Emit): void {
  // a roof over its allowance gives up its gauge before its nodes' span (the course line's waves straighten past it)
  const g = (relief.gauge ?? K.gauge) * lv.gauge, step = K.run * Math.min(1.6, lv.run), m = 0.04, wave = Math.min(0.14, g * 0.32);
  // the butts' depth with the gauge (a fine nipa's rows lie flatter than a long straw's courses)
  const butt = Math.min(K.butt, g * 0.085);
  const sc = (k: number): Vec3 => [f.n[0] * k, f.n[1] * k, f.n[2] * k];
  // the ridge roll's reach down the slope: under a ridge cap only (a lean-to's or a shed's top edge has none)
  const roll = !f.flat && f.top >= 0.08 ? Math.min(0.55, top * 0.15) : 0, courseTop = top - roll * 0.5;
  const bases: number[] = [0];
  for (let v = g * (0.8 + look() * 0.4); v < courseTop - 0.15; v += g * (0.8 + look() * 0.4)) bases.push(v);
  const pp = patchShare(f, relief, bases.length * Math.max(1, midWidth(f, top) / step));
  const inHole = (t: number, v0: number, v1: number) => holes.some((h) => v1 > h[0] && v0 < h[1] && t > h[2] && t < h[3]);
  /** A strip's nodes along t (its ends fixed, the inner ones jittered), the holes' edges among them. */
  const nodesOf = (a: number, b: number, span: number, v0: number, v1: number): number[] => {
    const n = Math.max(1, Math.round((b - a) / span)), ss: number[] = [];
    for (let i = 0; i <= n; i++) ss.push(i === 0 || i === n ? i / n : (i + (look() - 0.5) * 0.5) / n);
    for (const h of holes) if (v1 > h[0] && v0 < h[1]) for (const t of [h[2], h[3]]) { const s = (t - a) / (b - a); if (s > 0.01 && s < 0.99) ss.push(s); }
    return ss.sort((x, y) => x - y);
  };
  /** Lay a strip's segments (the ones clear of the holes) with `seg`, and close each run of them at both ends with `cap`. */
  const strip = (count: number, clear: (i: number) => boolean, seg: (i: number) => void, cap: (i: number, dir: number) => void): void => {
    for (let i = 0; i < count - 1; i++) {
      if (!clear(i)) continue;
      seg(i);
      if (i === 0 || !clear(i - 1)) cap(i, -1);
      if (i === count - 2 || !clear(i + 1)) cap(i + 1, 1);
    }
  };
  for (let k = 0; k < bases.length; k++) {
    const eave = k === 0 && !f.flat, vb = bases[k];
    const vh = k + 1 < bases.length ? Math.min(courseTop, bases[k + 1] + wave + 0.06) : courseTop;
    const F = chord(f, Math.max(0, vb)), H = chord(f, vh);
    if (!F || !H || vh - vb < 0.15) continue;
    const a0 = F[0] + m, b0 = F[1] - m, a1 = H[0] + m, b1 = H[1] - m;
    if (b0 - a0 < 0.3 || b1 - a1 < 0.1) continue;
    // the eave's nodes twice as close (its cut edge ragged); a stretch of one to three spans thinner, fuller or lichened
    const ss = nodesOf(a0, b0, eave ? step * 0.5 : step, vb - wave, vh), ct = 0.98 + look() * 0.04;
    let left = 0, state = 0;
    const nodes = ss.map((s, i) => {
      if (left-- <= 0) {
        left = look() * 3;
        const r = look();
        state = r < pp ? 3 : r < pp + 0.12 ? 1 : r < pp + 0.24 ? 2 : 0;
      }
      const end = i === 0 || i === ss.length - 1, thin = state === 1 || state === 3, full = state === 2;
      const vf = eave ? -(0.05 + look() * 0.13) : vb + (end ? 0 : (look() - 0.5) * 2 * wave), hf = eave ? -0.03 : 0;
      const b = eave ? K.foot * (0.8 + look() * 0.4) : butt * (0.4 + look() * 1.0) * (thin ? 0.55 : full ? 1.45 : 1);
      const lip = eave ? 0.07 : Math.min(vh - vf - 0.1, Math.max(0.1, b * 3.5));
      const tf = a0 + (b0 - a0) * s, th = a1 + (b1 - a1) * s, vc = vf + lip, tc = tf + (th - tf) * Math.max(0, (vc - vb) / (vh - vb));
      return {
        tf, th, b, lip, foot: at(f, vf, tf, hf), crest: at(f, vc, tc, b), head: at(f, vh, th, 0.004), inner: at(f, 0.02, tf, hf), base: at(f, vh, th, hf),
        tone: toneIn(ct * (thin ? 0.96 : full ? 1.04 : 1) * (state === 3 ? 0.97 : 1)), tint: state === 3 ? MOSS : null,
      };
    });
    strip(nodes.length, (i) => !inHole((nodes[i].tf + nodes[i + 1].tf) / 2, vb - wave, vh), (i) => {
      const p = nodes[i], q = nodes[i + 1];
      // the lip (the bundles' butts) a few per cent under the field; the face up under the next course; the eave's underside
      emit([p.foot, q.foot, q.crest, p.crest], add(sc(p.lip), f.up, -p.b), paint(f, p.tone * (eave ? 0.9 : 0.94), p.tint));
      emit([p.crest, q.crest, q.head, p.head], f.n, paint(f, p.tone, p.tint));
      if (eave) emit([p.foot, q.foot, q.inner, p.inner], neg(f.n), paint(f, p.tone * 0.62, p.tint));
    }, (i, dir) => {
      const p = nodes[i];
      emit(eave ? [p.foot, p.crest, p.head, p.base] : [p.foot, p.crest, p.head], [f.along[0] * dir, f.along[1] * dir, f.along[2] * dir], paint(f, p.tone * 0.88, p.tint));
    });
  }
  if (roll <= 0) return;
  // the ridge roll: the straw swelling from the last course up to the ridge cap, its top closed under the cap
  const v0 = top - roll, v1 = top - roll * 0.45, A = chord(f, v0), B = chord(f, v1), C = chord(f, top);
  if (!A || !B || !C || C[1] - C[0] < 0.8) return;
  const ss = nodesOf(A[0] + m, A[1] - m, step, v0, top), ct = 0.98 + look() * 0.04;
  const lerp = (c: [number, number], s: number) => c[0] + m + (c[1] - c[0] - 2 * m) * s;
  const nodes = ss.map((s, i) => {
    const end = i === 0 || i === ss.length - 1, h1 = 0.065 + (end ? 0.015 : look() * 0.03), h2 = 0.095 + (end ? 0.02 : look() * 0.04);
    return { t: lerp(A, s), h1, h2, p0: at(f, v0, lerp(A, s), 0), p1: at(f, v1, lerp(B, s), h1), p2: at(f, top, lerp(C, s), h2), p3: at(f, top, lerp(C, s), 0) };
  });
  const op = paint(f, ct, null);
  strip(nodes.length, (i) => !inHole((nodes[i].t + nodes[i + 1].t) / 2, v0, top), (i) => {
    const p = nodes[i], q = nodes[i + 1];
    emit([p.p0, q.p0, q.p1, p.p1], add(sc(v1 - v0), f.up, -p.h1), paint(f, ct * 0.97, null));
    emit([p.p1, q.p1, q.p2, p.p2], add(sc(top - v1), f.up, p.h1 - p.h2), op);
    emit([p.p2, q.p2, q.p3, p.p3], f.up, op);
  }, (i, dir) => {
    const p = nodes[i];
    emit([p.p0, p.p1, p.p2, p.p3], [f.along[0] * dir, f.along[1] * dir, f.along[2] * dir], paint(f, ct * 0.9, null));
  });
}

/**
 * The rolls of pantiles or canal tiles down the slope `pitch` apart (dome-detail-275, after polder and dalmatian): each
 * roll a half round of its own tone, its mouth dark at the eave, its head (fine) under the ridge or along a hip; a roll
 * stops where the chord no longer holds it (a hip), and breaks round a hole.
 */
function rolls(f: Frame, relief: RoofRelief, K: (typeof KINDS)[RoofReliefKind], lv: (typeof LEVELS)[number], look: () => number,
  holes: Holes, top: number, paint: Paint, emit: Emit): void {
  const pitch = (relief.pitch ?? K.pitch) * lv.pitch;
  const r = Math.min(relief.kind === 'canal' ? 0.085 : 0.065, pitch * 0.24), segs = lv.segs, m = 0.06;
  const L0 = chord(f, 0.02);
  if (!L0) return;
  const n = Math.max(1, Math.floor((L0[1] - L0[0] - 2 * m) / pitch));
  const span = n * pitch, t0 = (L0[0] + L0[1]) / 2 - span / 2, pp = patchShare(f, relief, n);
  const holds = (v: number, t: number) => { const c = chord(f, v); return !!c && c[0] + m <= t - r && c[1] - m >= t + r; };
  const ring = (t: number, v: number): Vec3[] => Array.from({ length: segs + 1 }, (_, i) => at(f, v, t + Math.cos(Math.PI * i / segs) * r, Math.sin(Math.PI * i / segs) * r * 0.85));
  const run = (t: number, v0: number, v1: number, tone: number, tint: Rgb | null, head: boolean): void => {
    const lo = ring(t, v0), hi = ring(t, v1), op = paint(f, tone, tint);
    for (let i = 0; i < segs; i++) {
      const th = Math.PI * (i + 0.5) / segs, want = add([f.n[0] * Math.sin(th), f.n[1] * Math.sin(th), f.n[2] * Math.sin(th)], f.along, Math.cos(th));
      emit([lo[i], lo[i + 1], hi[i + 1], hi[i]], want, op);
    }
    const c0 = at(f, v0, t, 0), c1 = at(f, v1, t, 0);
    for (let i = 0; i < segs; i++) {
      emit([c0, lo[i], lo[i + 1]], neg(f.up), paint(f, tone * 0.5, tint));
      if (head) emit([c1, hi[i], hi[i + 1]], f.up, paint(f, tone, tint, true));
    }
  };
  for (let k = 0; k < n; k++) {
    const t = t0 + (k + 0.5) * pitch + (look() - 0.5) * 0.02;
    if (!holds(0.02, t)) continue;
    // its reach: the highest v the chord still holds it at, to the top
    let ve = top;
    if (!holds(top, t)) {
      let lo = 0.02, hi = top;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (holds(mid, t)) lo = mid; else hi = mid; }
      ve = lo;
    }
    if (ve < 0.3) continue;
    const relaid = look() < pp, tone = toneIn((0.92 + look() * 0.14) * (relaid ? 1.05 : 1)), tint = relaid ? RELAID : null;
    const headed = ve < top - 1e-6 || f.top < 0.05;
    let spans: Array<[number, number]> = [[0.02, ve]];
    for (const h of holes) {
      if (t + r <= h[2] || t - r >= h[3]) continue;
      spans = spans.flatMap(([a, b]): Array<[number, number]> => [[a, Math.min(b, h[0] - look() * 0.1)], [Math.max(a, h[1] + look() * 0.1), b]]);
    }
    for (const [a, b] of spans) if (b - a > 0.2) run(t, a, b, tone, tint, b < ve - 1e-6 || headed);
  }
}

/**
 * Sheets in courses up the slope (dome-detail-275, after harbourSheds sheetCourses and navajoR2 tinCovering): each
 * course `gauge` up from the one under it and lapping it, its butt a corrugation's depth proud at its foot and thinning
 * to its head under the next; across, sheets `pitch` wide each its own tone (a galvanised replacement, a rusted one, a
 * painted one gone chalky), `ribs` of its corrugations drawn in relief. A sheet over a hole is left out. (The roof
 * closeout: regionalArchitecture's ray census saw the inside of the sheets through their open ends and the gaps between
 * a ribbed face and its straight butt.) Each sheet is a closed wedge seen from outside: its foot straight along its
 * ribs' crests over its butt, its side lapping a hand over its neighbour's edge and a little proud of it (the neighbour's
 * edge inside it), and a sheet with no neighbour on a side (the verge, a hip, a hole) closed there; its sides fine.
 */
function sheets(f: Frame, relief: RoofRelief, K: (typeof KINDS)[RoofReliefKind], lv: (typeof LEVELS)[number], ribs: number, look: () => number,
  holes: Holes, top: number, paint: Paint, emit: Emit): void {
  const g = (relief.gauge ?? K.gauge) * lv.gauge, W = (relief.pitch ?? K.pitch) * lv.pitch, lap = 0.15, B = K.butt, R = 0.022;
  const side = 0.05, rise = 0.01, head = -0.008, low = -0.008, nr = 2 * ribs;
  const L0 = chord(f, 0);
  if (!L0) return;
  const shift = look() * W, pp = patchShare(f, relief, Math.ceil(top / g) * midWidth(f, top) / W);
  const h = (j: number) => (j % 2 ? R : 0);
  for (let v = 0; v < top - 0.25; v += g) {
    const v1 = Math.min(top, v + g + lap), A = chord(f, v), C = chord(f, v1);
    if (!A || !C) continue;
    // the course's sheets and which of them are laid (a neighbour laid on a side: the lap over it, else that side closed)
    const row: Array<{ ta: number; tb: number; tc: number; td: number; ok: boolean }> = [];
    for (let t = L0[0] - shift; t < L0[1] - 0.05; t += W) {
      const ta = Math.max(t, A[0]), tb = Math.min(t + W, A[1]), tc = Math.max(t, C[0]), td = Math.min(t + W, C[1]);
      const ok = tb - ta >= 0.15 && td - tc >= 0.02 && !holes.some((q) => v1 > q[0] && v < q[1] && t + W > q[2] && t < q[3]);
      row.push({ ta, tb, tc, td, ok });
    }
    row.forEach(({ ta, tb, tc, td, ok }, i) => {
      if (!ok) return;
      const lapped = i > 0 && row[i - 1].ok && ta > A[0] + side && tc > C[0] + side, closed = !(i + 1 < row.length && row[i + 1].ok);
      // each sheet its own tone; a patch a newer sheet let in (a little cleaner), or rust run down from the lap over it
      const patch = look() < pp, rust = patch && look() < 0.5, fresh = patch && !rust;
      const tone = toneIn((0.93 + look() * 0.1) * (fresh ? 1.08 : 1)), tint = fresh ? CLEAN : null;
      const op = paint(f, tone, tint), n = Math.max(1, nr);
      // its columns across, the first over the neighbour's edge when it laps it, a hand proud of it; its foot straight
      // along the ribs' crests (so the butt under it closes it), the corrugations running out to its head
      // (the foot's lift falls straight across the sheet to its far edge, so the butt's top is the face's foot)
      const ua = lapped ? ta - side : ta, uc = lapped ? tc - side : tc;
      const tf = (j: number) => (j === 0 ? ua : ta + (tb - ta) * j / n);
      const foot = (j: number) => at(f, v, tf(j), B + (nr ? R : 0) + (lapped ? rise * (tb - tf(j)) / (tb - ua) : 0));
      const hd = (j: number) => at(f, v1, j === 0 ? uc : tc + (td - tc) * j / n, head + (nr ? h(j) : 0) + (j === 0 && lapped ? rise : 0));
      for (let j = 0; j < n; j++) emit([foot(j), foot(j + 1), hd(j + 1), hd(j)], f.n, op);
      // the butt down to the course under it
      const bl = at(f, v, ua, low), br = at(f, v, tb, low);
      emit([bl, br, foot(n), foot(0)], neg(f.up), paint(f, tone * 0.68, tint));
      // its sides (fine, as the lap was): the lap's end over the neighbour, or closed where it has none
      const sp = paint(f, tone * 0.7, tint, true);
      emit(lapped ? [bl, hd(0), foot(0)] : [bl, at(f, v1, uc, low), foot(0)], neg(f.along), sp);
      if (closed) emit([br, at(f, v1, td, low), foot(n)], f.along, sp);
      // the rust: two or three thin runs down the sheet from under the next course's lap, on its face (over its ribs)
      if (rust && v + g < top - 0.1 && tb - ta > 0.4) {
        const vt = v + g - 0.03, face = (vv: number) => B + (head - B) * (vv - v) / (v1 - v) + (nr ? R : 0) + 0.004;
        for (let k = 2 + Math.floor(look() * 2); k > 0; k--) {
          const tt = ta + 0.12 + look() * (tb - ta - 0.24), rw = 0.03 + look() * 0.04, vb = Math.max(v + 0.1, vt - 0.25 - look() * 0.45);
          emit([at(f, vb, tt - rw, face(vb)), at(f, vb, tt + rw, face(vb)), at(f, vt, tt + rw, face(vt)), at(f, vt, tt - rw, face(vt))], f.n, paint(f, tone, RUST));
        }
      }
    });
  }
}

/**
 * A flat roof's patched membrane (dome-detail-275): patches of newer felt or bitumen over the old, each a hand proud
 * with its edges fine, more where the roof is worn; along the open edges a gravel stop (the edge trim) a hand high.
 */
function flatDress(f: Frame, relief: RoofRelief, look: () => number, holes: Holes, paint: Paint, emit: Emit, edge: boolean, patched: boolean): void {
  const K = KINDS[relief.kind], k = Math.min(1.5, Math.max(0.5, (relief.wear ?? K.wear) / K.wear));
  const count = patched ? Math.round(f.plan / PATCH_M2 * k * (0.7 + look() * 0.6)) : 0;
  for (let i = 0; i < count; i++) {
    const v = 0.4 + look() * Math.max(0, f.reach - 0.8), c = chord(f, v);
    if (!c) continue;
    const pw = 0.5 + look() * 1.6, pl = 0.6 + look() * 2.2, t = c[0] + 0.3 + look() * Math.max(0, c[1] - c[0] - 0.6 - pl);
    const v0 = v - pw / 2, v1 = v + pw / 2, h = 0.018, dark = look() < 0.6;
    if (holes.some((q) => v1 > q[0] && v0 < q[1] && t + pl > q[2] && t < q[3])) continue;
    const c0 = chord(f, v0), c1 = chord(f, v1);
    if (!c0 || !c1 || t < Math.max(c0[0], c1[0]) + 0.1 || t + pl > Math.min(c0[1], c1[1]) - 0.1) continue;
    const tone = dark ? 0.88 + look() * 0.04 : 1.06 + look() * 0.04;
    const P = (vv: number, tt: number, hh: number) => at(f, vv, tt, hh);
    emit([P(v0, t, h), P(v0, t + pl, h), P(v1, t + pl, h), P(v1, t, h)], f.n, paint(f, tone, null));
    const side = paint(f, tone * 0.8, null, true);
    emit([P(v0, t, 0), P(v0, t + pl, 0), P(v0, t + pl, h), P(v0, t, h)], neg(f.up), side);
    emit([P(v1, t, 0), P(v1, t + pl, 0), P(v1, t + pl, h), P(v1, t, h)], f.up, side);
    emit([P(v0, t, 0), P(v1, t, 0), P(v1, t, h), P(v0, t, h)], neg(f.along), side);
    emit([P(v0, t + pl, 0), P(v1, t + pl, 0), P(v1, t + pl, h), P(v0, t + pl, h)], f.along, side);
  }
  if (!edge) return;
  // the gravel stop round the edge: its top a hand wide and its outer face, each edge of the outline (convex)
  const P = f.poly, cv = P.reduce((a, [v]) => a + v, 0) / P.length, ct = P.reduce((a, [, t]) => a + t, 0) / P.length;
  for (let i = 0; i < P.length; i++) {
    const [va, ta] = P[i], [vb, tb] = P[(i + 1) % P.length];
    const len = Math.hypot(vb - va, tb - ta);
    if (len < 0.3) continue;
    let nv = (tb - ta) / len, nt = -(vb - va) / len;
    if (nv * (cv - va) + nt * (ct - ta) > 0) { nv = -nv; nt = -nt; }
    const w = 0.1, h = 0.06, ia: [number, number] = [va - nv * w, ta - nt * w], ib: [number, number] = [vb - nv * w, tb - nt * w];
    const outward = add([f.up[0] * nv, f.up[1] * nv, f.up[2] * nv], f.along, nt);
    const op = paint(f, 1.08, null);
    emit([at(f, va, ta, h), at(f, vb, tb, h), at(f, ib[0], ib[1], h), at(f, ia[0], ia[1], h)], f.n, op);
    emit([at(f, va, ta, -0.02), at(f, vb, tb, -0.02), at(f, vb, tb, h), at(f, va, ta, h)], outward, paint(f, 0.95, null));
    emit([at(f, ia[0], ia[1], 0), at(f, ib[0], ib[1], 0), at(f, ib[0], ib[1], h), at(f, ia[0], ia[1], h)], neg(outward), paint(f, 0.8, null, true));
  }
}

/**
 * house.ts emitRoof's relief (RoofSpec.relief): over the slabs it laid (`slabs`: each slope's underside outline and
 * normal; the covering's top is the slab's thickness over it), or over a flat roof's covering inside its parapet with the
 * parapet's coping (or round its open edge the gravel stop); the war's stripped patch left open a hand clear. `dec` the
 * slab's own emit options.
 */
export function roofSpecRelief(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, slabs: ReadonlyArray<{ pts: readonly Vec3[]; n: Vec3 }>,
  dec: EmitOptions, patch: RoofPatch | null): void {
  const relief = roof.relief;
  if (!relief) return;
  const holes: ReliefHole[] = patch ? [{ x0: Math.min(patch.side * patch.x0, patch.side * patch.x1), x1: Math.max(patch.side * patch.x0, patch.side * patch.x1), z0: patch.z0, z1: patch.z1 }] : [];
  const base: EmitOptions = { ...(dec.colour ? { colour: dec.colour } : {}), ...(dec.colourAt ? { colourAt: dec.colourAt } : {}), ...(dec.tint ? { tint: dec.tint } : {}) };
  if (rg.kind !== 'flat') {
    const t = roof.thickness;
    const planes = slabs.map((s): ReliefPlane => ({ pts: s.pts.map((p) => add(p, s.n, t)), n: s.n, top: rg.kind === 'shed' ? 0.04 : 0.1 }));
    layRoofRelief(sink, relief, planes, { bucket: roof.bucket, base, holes });
    return;
  }
  // a flat roof: the covering inside its parapet's ring (0.22 m, house.ts emitRoof), its rolls along the long way
  const e = roof.eave, th = 0.22, inset = roof.parapet ? th : 0, y = rg.eaveY + roof.thickness;
  const X = rg.s + e - inset, Z = rg.halfD + e - inset;
  layRoofRelief(sink, relief, [reliefFlat(-X, -Z, X, Z, y, X < Z)], { bucket: roof.bucket, base, holes, edge: !roof.parapet });
  if (!roof.parapet) return;
  // the parapet's coping: a slab over its wall head proud of both faces, its drip a shade under it
  const pb: RegionalBucket = roof.parapetBucket ?? (roof.bucket === 'roof' ? 'plaster' : roof.bucket);
  const top = y + roof.parapet, xo = rg.s + e + 0.04, zo = rg.halfD + e + 0.04, w = th + 0.08, c = 0.07;
  const cap: EmitOptions = { decor: true, noCast: true, shade: 1.08, shadeAt: (p: Vec3) => (p[1] < top + 0.001 ? 0.7 : 1.08) };
  sink.span(pb, -xo, top, zo - w, xo, top + c, zo, cap);
  sink.span(pb, -xo, top, -zo, xo, top + c, -zo + w, cap);
  sink.span(pb, xo - w, top, -zo + w, xo, top + c, zo - w, cap);
  sink.span(pb, -xo, top, -zo + w, -xo + w, top + c, zo - w, cap);
}

/**
 * (dome-detail-275) The relief for a base builder's own buckets (railKit, urbanKit and the other THREE kits): laid over
 * `planes` in a sink of its own and returned as plain roof geometries — position, normal and uv, no occlusion, tint or
 * vertex colour (those buckets' materials read none; the courses read by their steps alone), no fine joinery (the base
 * kits have no fine-detail cells). Dressing: each carries userData.noCollision and uvJitter 'none' (no stream draws).
 */
export function reliefGeometries(relief: RoofRelief, planes: readonly ReliefPlane[], holes: readonly ReliefHole[] = []): RegionalParts['roof'] {
  const sink = new PartSink([0, 0]);
  layRoofRelief(sink, relief, planes, { bucket: 'roof', holes });
  const out: RegionalParts['roof'] = [];
  for (const g of sink.finish().roof) {
    if (g.userData.fine) continue;
    for (const a of ['shade', 'tint', 'color']) if (g.getAttribute(a)) g.deleteAttribute(a);
    delete g.userData.regional;
    out.push(g);
  }
  return out;
}

/**
 * (dome-detail-275) The top face of a base builder's pitched roof slab (a box pitched and moved into place, propGeometry
 * pitchRoofPlane): the vertices farthest along its outward normal `n`, in order round their centre, as a ReliefPlane.
 */
export function slabTop(geometry: RegionalParts['roof'][number], n: Vec3, top = 0.1): ReliefPlane {
  const p = geometry.getAttribute('position'), nn = unit(n);
  let best = -Infinity;
  for (let i = 0; i < p.count; i++) best = Math.max(best, p.getX(i) * nn[0] + p.getY(i) * nn[1] + p.getZ(i) * nn[2]);
  const pts: Vec3[] = [];
  for (let i = 0; i < p.count; i++) {
    const q: Vec3 = [p.getX(i), p.getY(i), p.getZ(i)];
    if (dot(q, nn) > best - 1e-4 && !pts.some((r) => Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) < 1e-4)) pts.push(q);
  }
  const c = pts.reduce((a: Vec3, q) => add(a, q, 1 / pts.length), [0, 0, 0]);
  const u = unit(sub(pts[0], c)), w = cross(nn, u);
  pts.sort((a, b) => Math.atan2(dot(sub(a, c), w), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), w), dot(sub(b, c), u)));
  return { pts, n: nn, top };
}
