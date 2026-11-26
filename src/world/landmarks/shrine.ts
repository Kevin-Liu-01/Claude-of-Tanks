// src/world/landmarks/shrine.ts — a Shinto shrine's precinct (landmarks-271, 2026-11-06; its realism pass, 273). Caldera is
// the Aso valley in Kumamoto: the census (buildings-270 signature places) names Aso Shrine — its two-storey rōmon gate, one
// of the three great gates of Japan, the torii and the haiden at the end of a straight sandō lined with stone lanterns —
// as what makes the town, and found it missing.
//
// - shrine: the precinct along its approach (front +z, where the road arrives): the stone torii at the mouth (the
//   gates family's `torii`, placed as a child), the sandō — a band of gravel between andesite kerbs, its paving of granite
//   slabs — between pairs of kasuga lanterns, the komainu on their pedestals at the gate's steps, the rōmon over the
//   approach on its stone kidan, the tamagaki fence of boards on its stone sill round the inner court of raked gravel,
//   the temizuya's basin under its copper roof, the haiden raised on posts with its veranda and the karahafu porch over
//   its steps, the honden behind it in its own fence (nagare-zukuri: the front slope sweeping on over its stair), two
//   massha along the court's side and the sacred tree's kerb (the tree is the map's own sugi: plan.ts shrineFlora).
//
// (realism 273; the identity critic: "the rōmon's top roof is a tall boxy gable with flat planes ... reads as a castle
// yagura or a pagoda") every roof is drawn in the Japanese way: the slopes concave (shallow at the eave, steep at the
// ridge), the eaves sweeping up and out at the corners (sori), the cypress-bark covering's thick layered edge over the
// fascia, the flying rafters and the soffit back to the bracket sets (tokyō) on the post heads; the irimoya's hips
// running up to a gable set in under its bargeboards, the stacked ridge with its onigawara.
//
// Drawn in its own frame (x across, y up, z out of the front) into the regional part sink: the bark roofs and the timber
// are coloured wood, the kawara ridges the kit's roof, the walls its render, the stone its stone in the caldera's dark
// andesite. The posts, walls, floors, platforms and lanterns are structure; the brackets, rails, lattices, ropes and the
// ground's gravel and kerbs are dressing.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, extrude, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext, LandmarkPlacement } from './types.ts';

const TIMBER = rgb(0x6a5040), TIMBER_DARK = rgb(0x46352a), BOARD = rgb(0x8a735c);
/** cypress bark (hiwada): a dark red-brown that greys under the weather, its cut edge the paler layered bark */
const BARK = rgb(0x6a4636), BARK_CUT = rgb(0x9a7458);
const COPPER = rgb(0x5f8a76), GILT = rgb(0xb59a4e), WHITE = rgb(0xe8e2d4), BAMBOO = rgb(0x9c9459), ROPE = rgb(0xa8382c);
/** the caldera's andesite (kerbs, steps, footings, platforms, lanterns): a dark volcanic grey over the kit's stone */
const ANDESITE: Rgb = [0.76, 0.76, 0.79];
/** the court's raked gravel, pale (the precinct's #c8c2b6) */
const PALE_GRAVEL: Rgb = [1.1, 1.06, 1.0];

type Stream = () => number;
const UP: Vec3 = [0, 1, 0], DOWN: Vec3 = [0, -1, 0];
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp3 = (a: Vec3, b: Vec3, f: number): Vec3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const drop = (p: Vec3, h: number): Vec3 => [p[0], p[1] - h, p[2]];
const uvOffset = (rng: Stream): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const stoneOf = (s: number, decor = false): EmitOptions => ({ shade: s, tint: ANDESITE, decor });

/** The precinct's plan along its axis (plan.ts footprint and the builder agree). */
export function shrineLayout(p: Readonly<Record<string, number | string | boolean>>) {
  const length = Math.max(48, Math.min(110, Number(p.length)));
  const width = Math.max(26, Math.min(44, Number(p.width)));
  return { length, width, front: length / 2, back: -length / 2 };
}

/** A planar polygon turned to face `want` (any winding in). */
function face(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], want: Vec3, opts: EmitOptions): void {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  sink.polygon(bucket, nx * want[0] + ny * want[1] + nz * want[2] >= 0 ? pts : [...pts].reverse(), opts);
}

// ---------------------------------------------------------------------------------------------------------- roofs

/** A Japanese roof's section: the share of its rise at `s` of its run from the eave (shallow at the eave, steep above). */
const sweep = (s: number): number => 0.55 * s + 0.45 * s * s;

/** A roof's covering: its bucket, its colour and the colour of its cut edge. */
interface Cover { bucket: RegionalBucket; colour: Rgb; cut: Rgb }
const bark = (v: Stream): Cover => ({ bucket: 'structureWood', colour: shade(BARK, 0.9 + 0.16 * v()), cut: BARK_CUT });
const copper: Cover = { bucket: 'structureMetal', colour: COPPER, cut: shade(COPPER, 0.78) };
/** The covering's paint: darker toward the eaves, where the rain runs off and the moss takes. */
const weathered = (c: Cover, y0: number, h: number): EmitOptions => ({ colour: c.colour, colourAt: (p) => shade(c.colour, 0.8 + 0.22 * clamp01((p[1] - y0) / h)) });

/** The four sides of a rectangle in ring order (front +z, right +x, back -z, left -x): out of it, and along it. */
const SIDES: ReadonlyArray<{ o: Vec3; w: Vec3 }> = [
  { o: [0, 0, 1], w: [1, 0, 0] }, { o: [1, 0, 0], w: [0, 0, -1] }, { o: [0, 0, -1], w: [-1, 0, 0] }, { o: [-1, 0, 0], w: [0, 0, 1] },
];

/**
 * A hipped band of roof from its eave rectangle (X, Z half-sizes at height y, at the middle of each side) up to an upper
 * rectangle (Xu, Zu at yU): `G` the share of the rise at u of the run, the corners swept up `sori` and out `kick`, the
 * sweep fading up the slope. The hips run corner to corner.
 */
interface HipRing { cx: number; cz: number; X: number; Z: number; y: number; Xu: number; Zu: number; yU: number; G: (u: number) => number; sori: number; kick: number }

function ringPoint(r: HipRing, k: number, t: number, u: number): Vec3 {
  const { o, w } = SIDES[k], even = k % 2 === 0;
  const L0 = even ? r.X : r.Z, F0 = even ? r.Z : r.X, L = L0 + ((even ? r.Xu : r.Zu) - L0) * u, F = F0 + ((even ? r.Zu : r.Xu) - F0) * u;
  const lift = Math.pow(Math.abs(t), 2.5) * Math.pow(1 - u, 1.6);
  const a = t * L + Math.sign(t) * r.kick * lift, f = F + r.kick * lift;
  return [r.cx + w[0] * a + o[0] * f, r.y + (r.yU - r.y) * r.G(u) + r.sori * lift, r.cz + w[2] * a + o[2] * f];
}

function hipSurface(sink: PartSink, r: HipRing, n: readonly [number, number], rows: number, c: Cover, opts: EmitOptions): void {
  for (let k = 0; k < 4; k++) {
    const nk = n[k % 2], o = SIDES[k].o;
    for (let j = 0; j < rows; j++) for (let i = 0; i < nk; i++) {
      const t0 = -1 + 2 * i / nk, t1 = -1 + 2 * (i + 1) / nk, u0 = j / rows, u1 = (j + 1) / rows;
      face(sink, c.bucket, [ringPoint(r, k, t0, u0), ringPoint(r, k, t1, u0), ringPoint(r, k, t1, u1), ringPoint(r, k, t0, u1)], [o[0], 1, o[2]], opts);
    }
  }
}

/** The eave's build-up under a roof's edge: its thickness (`edge`), the timber under it, the wall head the soffit runs
 *  back to, the rafters' spacing (0: none) and a scale for a small roof's layers. */
interface Eave { edge: number; timber: Rgb; wallX: number; wallZ: number; wallY: number; rafter: number; k: number }

/** A flying rafter's end under the soffit: its underside, its two sides and its cut end (no top: the soffit covers it). */
function rafter(sink: PartSink, a: Vec3, b: Vec3, t: number, colour: Rgb): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l * t / 2, sz = dx / l * t / 2;
  const A0: Vec3 = [a[0] - sx, a[1], a[2] - sz], A1: Vec3 = [a[0] + sx, a[1], a[2] + sz], B0: Vec3 = [b[0] - sx, b[1], b[2] - sz], B1: Vec3 = [b[0] + sx, b[1], b[2] + sz];
  const opts: EmitOptions = { colour, decor: true, fine: 'near' };
  face(sink, 'structureWood', [drop(A0, t), drop(A1, t), drop(B1, t), drop(B0, t)], DOWN, opts);
  face(sink, 'structureWood', [A0, B0, drop(B0, t), drop(A0, t)], [-sx, 0, -sz], opts);
  face(sink, 'structureWood', [A1, B1, drop(B1, t), drop(A1, t)], [sx, 0, sz], opts);
  face(sink, 'structureWood', [A0, A1, drop(A1, t), drop(A0, t)], [-dx, 0, -dz], opts);
}

/**
 * One side's eave: `at(i, d, h)` the point d in from and h under the i-th of `count` points along the eave's top edge;
 * the covering's thick cut edge and its second, stepped-in layer, the fascia board, the flying rafters' soffit and their
 * ends, the band of the base rafters' ends, and the soffit back to the wall head W (none: open).
 */
function eaveStrip(sink: PartSink, count: number, at: (i: number, d: number, h: number) => Vec3, W: readonly Vec3[] | null, o: Vec3, c: Cover, e: Eave): void {
  const k = e.k, T = e.edge, d1 = 0.14 * k, d2 = 0.42 * k, d3 = 1.3 * k, h1 = T + 0.2 * k, h2 = T + 0.46 * k, h3 = T + 0.4 * k, h4 = T + 0.72 * k;
  for (let i = 0; i + 1 < count; i++) {
    const j = i + 1;
    const vf = (bucket: RegionalBucket, d: number, top: number, bot: number, colour: Rgb): void =>
      face(sink, bucket, [at(i, d, bot), at(j, d, bot), at(j, d, top), at(i, d, top)], o, { colour, decor: true });
    const hf = (bucket: RegionalBucket, da: number, db: number, ha: number, hb: number, colour: Rgb): void =>
      face(sink, bucket, [at(i, da, ha), at(j, da, ha), at(j, db, hb), at(i, db, hb)], DOWN, { colour, decor: true });
    vf(c.bucket, 0, 0, T, c.cut);
    if (k < 0.5) {
      // a small roof's edge: the cut edge, its fascia, the soffit back
      vf('structureWood', 0, T, h2, e.timber);
      if (W) face(sink, 'structureWood', [at(i, 0, h2), at(j, 0, h2), W[j], W[i]], DOWN, { colour: shade(e.timber, 0.62), decor: true });
      continue;
    }
    hf(c.bucket, 0, d1, T, T, shade(c.colour, 0.7));
    vf(c.bucket, d1, T, h1, shade(c.cut, 0.8));
    hf('structureWood', d1, d2, h1, h1, shade(e.timber, 0.7));
    vf('structureWood', d2, h1, h2, e.timber);
    hf('structureWood', d2, d3, h2, h3, shade(e.timber, 0.78));
    vf('structureWood', d3, h3, h4, shade(e.timber, 0.9));
    if (W) face(sink, 'structureWood', [at(i, d3, h4), at(j, d3, h4), W[j], W[i]], DOWN, { colour: shade(e.timber, 0.62), decor: true });
    if (e.rafter > 0) {
      const a0 = at(i, d2, h2), a1 = at(j, d2, h2), cnt = Math.max(1, Math.round(Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) / e.rafter));
      for (let q = 0; q < cnt; q++) {
        const f = (q + 0.5) / cnt;
        rafter(sink, lerp3(at(i, d2 + 0.02, h2), at(j, d2 + 0.02, h2), f), lerp3(at(i, d3, h3), at(j, d3, h3), f), 0.14 * k, shade(e.timber, 1.15));
      }
    }
  }
}

/** The eaves of a hipped ring all round, mitred at the corners, the corner rafter (sumigi) under each swept corner. */
function hipEaves(sink: PartSink, r: HipRing, n: readonly [number, number], c: Cover, e: Eave): void {
  for (let side = 0; side < 4; side++) {
    const { o, w } = SIDES[side], nk = n[side % 2], even = side % 2 === 0;
    const prev = SIDES[(side + 3) % 4].o, next = SIDES[(side + 1) % 4].o;
    const Lw = even ? e.wallX : e.wallZ, Fw = even ? e.wallZ : e.wallX;
    const E: Vec3[] = [], M: Vec3[] = [], W: Vec3[] = [];
    for (let i = 0; i <= nk; i++) {
      const t = -1 + 2 * i / nk, adj = i === 0 ? prev : i === nk ? next : null;
      E.push(ringPoint(r, side, t, 0));
      M.push(adj ? [o[0] + adj[0], 0, o[2] + adj[2]] : o);
      W.push([r.cx + w[0] * t * Lw + o[0] * Fw, e.wallY, r.cz + w[2] * t * Lw + o[2] * Fw]);
    }
    const at = (i: number, d: number, h: number): Vec3 => [E[i][0] - M[i][0] * d, E[i][1] - h, E[i][2] - M[i][2] * d];
    eaveStrip(sink, nk + 1, at, W, o, c, e);
    bar(sink, 'structureWood', [W[nk][0], e.wallY - 0.2 * e.k, W[nk][2]], at(nk, 1.0 * e.k, e.edge + 0.6 * e.k), 0.3 * e.k, { colour: TIMBER_DARK, decor: true });
  }
}

/** A stacked kawara ridge from -half to half at yr over (cx, cz), the onigawara at its ends with the toribusuma over them. */
function ridge(sink: PartSink, cx: number, cz: number, half: number, yr: number, k: number): void {
  sink.span('roof', cx - half, yr - 0.2 * k, cz - 0.48 * k, cx + half, yr + 0.38 * k, cz + 0.48 * k, { decor: true, shade: 0.7 });
  sink.span('roof', cx - half + 0.1, yr + 0.38 * k, cz - 0.36 * k, cx + half - 0.1, yr + 0.6 * k, cz + 0.36 * k, { decor: true, shade: 0.62 });
  sink.pipe('roof', [cx - half + 0.12, yr + 0.68 * k, cz], [cx + half - 0.12, yr + 0.68 * k, cz], 0.16 * k, 8, { decor: true, shade: 0.6, caps: true });
  for (const s of [-1, 1]) {
    const x = cx + s * (half + 0.02), yb = yr - 0.22 * k;
    extrude(sink, 'roof', [[x, yb, cz - 0.56 * k], [x, yb, cz + 0.56 * k], [x, yb + 0.8 * k, cz + 0.62 * k], [x, yb + 1.3 * k, cz + 0.36 * k],
      [x, yb + 1.3 * k, cz - 0.36 * k], [x, yb + 0.8 * k, cz - 0.62 * k]], [-s, 0, 0], 0.34 * k, { decor: true, shade: 0.56 });
    bar(sink, 'roof', [x - s * 0.25 * k, yb + 1.28 * k, cz], [x + s * 0.7 * k, yb + 1.62 * k, cz], 0.16 * k, { decor: true, shade: 0.56 });
  }
}

interface Irimoya {
  over: number; sori: number; kick: number;
  /** the share of the run the hips take (the gable's foot) */
  sb: number;
  /** the main slopes' overhang past the gable */
  verge: number;
  n: readonly [number, number]; rows: number; edge: number; wallY: number; rafter: number; k: number; cover: Cover;
}

/**
 * An irimoya (hip-and-gable) roof over a w (x) by d (z) body at (cx, cz): the eaves `over` out at height y (the middle of
 * each side), the corners swept up and out, the hips rising at 45° in plan to the gables' foot, the main slopes going on
 * to the ridge at ridgeY over the gables set in under their bargeboards, the gilt gegyo at each apex, the ridge's stack.
 */
function irimoya(sink: PartSink, cx: number, cz: number, w: number, d: number, y: number, ridgeY: number, o: Irimoya): void {
  const X = w / 2 + o.over, Z = d / 2 + o.over, H = ridgeY - y, sb = o.sb, gb = sweep(sb), k = o.k;
  const yh = y + H * gb, zh = Z * (1 - sb), a = X - Z * sb, av = a + o.verge, T = o.edge;
  const r: HipRing = { cx, cz, X, Z, y, Xu: a, Zu: zh, yU: yh, G: (u) => sweep(u * sb) / gb, sori: o.sori, kick: o.kick };
  const top = weathered(o.cover, y, H);
  hipSurface(sink, r, o.n, o.rows, o.cover, top);
  // the main slopes over the gables, on to the ridge
  const S = [0, 1 / 3, 2 / 3, 1].map((f) => sb + (1 - sb) * f);
  const R = (x: number, s: number, side: number): Vec3 => [cx + x, y + H * sweep(s), cz + side * Z * (1 - s)];
  for (const side of [1, -1]) for (let j = 0; j < 3; j++) {
    face(sink, o.cover.bucket, [R(-av, S[j], side), R(av, S[j], side), R(av, S[j + 1], side), R(-av, S[j + 1], side)], [0, 1, side], top);
  }
  hipEaves(sink, r, o.n, o.cover, { edge: T, timber: TIMBER_DARK, wallX: w / 2, wallZ: d / 2, wallY: o.wallY, rafter: o.rafter, k });
  // the hips' rolls
  for (let side = 0; side < 4; side++) for (let j = 0; j < o.rows; j++) {
    const p0 = ringPoint(r, side, 1, j / o.rows), p1 = ringPoint(r, side, 1, (j + 1) / o.rows);
    bar(sink, o.cover.bucket, [p0[0], p0[1] + 0.07 * k, p0[2]], [p1[0], p1[1] + 0.07 * k, p1[2]], 0.34 * k, { colour: shade(o.cover.colour, 0.72), decor: true });
  }
  for (const s of [-1, 1]) {
    // the gable (tsuma), boarded, set in under the main slopes
    const gx = cx + s * a, C: Vec3 = [gx, yh - 0.1 * k, cz], outline: Vec3[] = [];
    for (const sj of S) outline.push([gx, y + H * sweep(sj) - 0.12 * k, cz + Z * (1 - sj)]);
    for (const sj of [...S].reverse().slice(1)) outline.push([gx, y + H * sweep(sj) - 0.12 * k, cz - Z * (1 - sj)]);
    for (let i = 0; i + 1 < outline.length; i++) face(sink, 'structureWood', [C, outline[i], outline[i + 1]], [s, 0, 0], { colour: TIMBER_DARK });
    bar(sink, 'structureWood', [gx + s * 0.06, yh - 0.04, cz - zh], [gx + s * 0.06, yh - 0.04, cz + zh], 0.2 * k, { colour: TIMBER, decor: true });
    // the verges: the covering's cut edge, the bargeboard (hafu) under it, the soffit back to the gable
    for (const side of [1, -1]) for (let j = 0; j < 3; j++) {
      const p0: Vec3 = [cx + s * av, y + H * sweep(S[j]), cz + side * Z * (1 - S[j])], p1: Vec3 = [cx + s * av, y + H * sweep(S[j + 1]), cz + side * Z * (1 - S[j + 1])];
      face(sink, o.cover.bucket, [p0, p1, drop(p1, T), drop(p0, T)], [s, 0, 0], { colour: o.cover.cut, decor: true });
      sink.member('structureWood', [p0[0] - s * 0.1 * k, p0[1] - T - 0.2 * k, p0[2]], [p1[0] - s * 0.1 * k, p1[1] - T - 0.2 * k, p1[2]], 0.46 * k, 0.12 * k, [s, 0, 0],
        { colour: TIMBER_DARK, decor: true, exposed: true });
      face(sink, 'structureWood', [drop(p0, T), drop(p1, T), [gx, p1[1] - T, p1[2]], [gx, p0[1] - T, p0[2]]], DOWN, { colour: shade(TIMBER_DARK, 0.8), decor: true });
    }
    // the gilt gegyo hung at the apex between the bargeboards
    const gxo = cx + s * (av + 0.04 * k), yA = ridgeY - T - 0.3 * k;
    face(sink, 'structureMetal', [[gxo, yA, cz - 0.55 * k], [gxo, yA, cz + 0.55 * k], [gxo, yA - 0.55 * k, cz + 0.42 * k], [gxo, yA - 0.95 * k, cz], [gxo, yA - 0.55 * k, cz - 0.42 * k]],
      [s, 0, 0], { colour: GILT, decor: true });
  }
  ridge(sink, cx, cz, av + 0.1, ridgeY, k);
}

/** A pent roof round a storey (the rōmon's lower roof): from its eave `over` out at y up to the line `inset` out at yTop. */
function pent(sink: PartSink, cx: number, cz: number, w: number, d: number, y: number, yTop: number, over: number, inset: number, sori: number, kick: number,
  wallY: number, c: Cover, n: readonly [number, number], rafterPitch: number): void {
  const r: HipRing = { cx, cz, X: w / 2 + over, Z: d / 2 + over, y, Xu: w / 2 + inset, Zu: d / 2 + inset, yU: yTop, G: sweep, sori, kick };
  hipSurface(sink, r, n, 2, c, weathered(c, y, yTop - y));
  hipEaves(sink, r, n, c, { edge: 0.3, timber: TIMBER_DARK, wallX: w / 2, wallZ: d / 2, wallY, rafter: rafterPitch, k: 1 });
  for (let side = 0; side < 4; side++) for (let j = 0; j < 2; j++) {
    const p0 = ringPoint(r, side, 1, j / 2), p1 = ringPoint(r, side, 1, (j + 1) / 2);
    bar(sink, c.bucket, [p0[0], p0[1] + 0.07, p0[2]], [p1[0], p1[1] + 0.07, p1[2]], 0.32, { colour: shade(c.colour, 0.72), decor: true });
  }
}

interface Nagare {
  back: number; front: number; rise: number; verge: number; sori: number; kick: number; edge: number;
  n: number; rowsF: number; rowsB: number; k: number; rafter: number; cover: Cover;
}

/**
 * A nagare-zukuri roof over a w by d body (walls to wallY): a gable roof whose ridge stands behind the middle and whose
 * front slope sweeps on, flatter, `front` past the front wall over the steps (the kōhai). Returns the front eave's height
 * and line, for the posts under it.
 */
function nagareRoof(sink: PartSink, cx: number, cz: number, w: number, d: number, wallY: number, o: Nagare): { yF: number; zF: number } {
  const k = o.k, T = o.edge, zr = cz - d * 0.12, yr = wallY + o.rise, zB = cz - d / 2 - o.back, zF = cz + d / 2 + o.front;
  const yB = wallY + 0.3 * k, yF = yr - (yr - yB) * ((zF - zr) / (zr - zB)) * 0.62, X = w / 2 + o.verge;
  const Q = (side: number, t: number, s: number): Vec3 => {
    const lift = Math.pow(Math.abs(t), 2.5) * Math.pow(1 - s, 1.6), zE = side > 0 ? zF : zB, yE = side > 0 ? yF : yB;
    return [cx + t * X + Math.sign(t) * o.kick * lift, yE + (yr - yE) * sweep(s) + o.sori * lift, zr + (zE - zr) * (1 - s) + side * o.kick * lift];
  };
  const yLow = Math.min(yF, yB), top = weathered(o.cover, yLow, yr - yLow);
  for (const side of [1, -1]) {
    const rows = side > 0 ? o.rowsF : o.rowsB;
    for (let j = 0; j < rows; j++) for (let i = 0; i < o.n; i++) {
      const t0 = -1 + 2 * i / o.n, t1 = -1 + 2 * (i + 1) / o.n, s0 = j / rows, s1 = (j + 1) / rows;
      face(sink, o.cover.bucket, [Q(side, t0, s0), Q(side, t1, s0), Q(side, t1, s1), Q(side, t0, s1)], [0, 1, side], top);
    }
    // the eave along this side, its soffit back to the wall head
    const o3: Vec3 = [0, 0, side], E: Vec3[] = [], W: Vec3[] = [];
    for (let i = 0; i <= o.n; i++) {
      const t = side > 0 ? -1 + 2 * i / o.n : 1 - 2 * i / o.n;
      E.push(Q(side, t, 0));
      W.push([cx + t * w / 2, wallY, cz + side * d / 2]);
    }
    eaveStrip(sink, o.n + 1, (i, dd, h) => [E[i][0], E[i][1] - h, E[i][2] - side * dd], W, o3, o.cover, { edge: T, timber: TIMBER_DARK, wallX: w / 2, wallZ: d / 2, wallY, rafter: o.rafter, k });
    // the verges: the cut edge, the bargeboard, the soffit back to the gable
    for (const s of [-1, 1]) for (let j = 0; j < rows; j++) {
      const p0 = Q(side, s, j / rows), p1 = Q(side, s, (j + 1) / rows);
      face(sink, o.cover.bucket, [p0, p1, drop(p1, T), drop(p0, T)], [s, 0, 0], { colour: o.cover.cut, decor: true });
      sink.member('structureWood', [p0[0] - s * 0.08 * k, p0[1] - T - 0.2 * k, p0[2]], [p1[0] - s * 0.08 * k, p1[1] - T - 0.2 * k, p1[2]], 0.44 * k, 0.11 * k, [s, 0, 0],
        { colour: TIMBER_DARK, decor: true, exposed: true });
      face(sink, 'structureWood', [drop(p0, T), drop(p1, T), [cx + s * w / 2, p1[1] - T, p1[2]], [cx + s * w / 2, p0[1] - T, p0[2]]], DOWN,
        { colour: shade(TIMBER_DARK, 0.8), decor: true });
    }
  }
  // the gables over the end walls, under the slopes
  const under = (z: number): number => {
    const back = z <= zr, s = back ? 1 - (zr - z) / (zr - zB) : 1 - (z - zr) / (zF - zr), yE = back ? yB : yF;
    return yE + (yr - yE) * sweep(s) - T;
  };
  for (const s of [-1, 1]) {
    const gx = cx + s * w / 2, C: Vec3 = [gx, wallY, cz];
    const zs = [cz - d / 2, (cz - d / 2 + zr) / 2, zr, (zr + cz + d / 2) / 2, cz + d / 2];
    const outline: Vec3[] = [[gx, wallY, cz - d / 2], ...zs.map((z): Vec3 => [gx, under(z), z]), [gx, wallY, cz + d / 2]];
    for (let i = 0; i + 1 < outline.length; i++) face(sink, 'structureWood', [C, outline[i], outline[i + 1]], [s, 0, 0], { colour: TIMBER_DARK });
  }
  // the box ridge, its copper cap, the boards at its ends
  sink.span('structureWood', cx - X - 0.05, yr - 0.15 * k, zr - 0.3 * k, cx + X + 0.05, yr + 0.35 * k, zr + 0.3 * k, { colour: shade(o.cover.colour, 0.7), decor: true });
  sink.span('structureMetal', cx - X - 0.1, yr + 0.35 * k, zr - 0.36 * k, cx + X + 0.1, yr + 0.43 * k, zr + 0.36 * k, { colour: COPPER, decor: true });
  return { yF, zF };
}

// ---------------------------------------------------------------------------------------------------------- joinery

/**
 * A bracket set (tokyō) on a post head at (x, y, z), stepping out along `o` (a unit along x or z): the bearing block, then
 * `tiers` of an arm along the wall crossed by an arm reaching out `step` further each tier, the small block at its tip.
 */
function bracket(sink: PartSink, v: Stream, x: number, y: number, z: number, o: Vec3, tiers: number, step: number): void {
  const alongX = o[0] === 0;
  const box = (yy: number, half: number, hy: number, out: number, depth: number, colour: Rgb): void => {
    const cx = x + o[0] * out, cz = z + o[2] * out, hx = alongX ? half : depth, hz = alongX ? depth : half;
    sink.span('structureWood', cx - hx, yy, cz - hz, cx + hx, yy + hy, cz + hz, { colour, decor: true });
  };
  box(y, 0.34, 0.3, 0, 0.34, TIMBER_DARK);
  for (let k = 0; k < tiers; k++) {
    const yk = y + 0.3 + k * 0.34, reach = k * step, tip = (k + 1) * step;
    box(yk, 0.62 + 0.14 * k, 0.2, reach, 0.12, shade(TIMBER, 0.95 + 0.1 * v()));
    box(yk, 0.12, 0.2, tip / 2, tip / 2 + 0.14, TIMBER);
    // (landmarks-world-276, the integrity census: the tip's block was fine detail, and every tier over it, the purlin
    // and the roof stood on it: stranded past the fine-detail distance and on a phone) drawn at every distance
    box(yk + 0.2, 0.14, 0.14, tip, 0.14, TIMBER_DARK);
  }
}

/** A plain bracket (funa-hijiki): the bearing block on the post head and the boat-shaped arm along the wall over it. */
function funa(sink: PartSink, x: number, y: number, z: number, alongX: boolean, colour: Rgb): void {
  sink.span('structureWood', x - 0.26, y, z - 0.26, x + 0.26, y + 0.24, z + 0.26, { colour: TIMBER_DARK, decor: true });
  sink.span('structureWood', x - (alongX ? 0.75 : 0.12), y + 0.24, z - (alongX ? 0.12 : 0.75), x + (alongX ? 0.75 : 0.12), y + 0.46, z + (alongX ? 0.12 : 0.75), { colour, decor: true });
}

/** A round post on its footing stone from the ground to `top` at (x, z). */
function post(sink: PartSink, v: Stream, x: number, z: number, top: number, r: number): void {
  revolve(sink, 'stone', x, z, [[r * 1.9, -0.3], [r * 1.55, 0.2]], 6, stoneOf(0.74 + 0.1 * v()), Math.PI / 6);
  sink.cylinder('structureWood', [x, 0.2, z], 'y', top - 0.2, r, 8, { colour: shade(TIMBER, 0.9 + 0.18 * v()) });
}

/** A veranda's short post (engawa-zuka) on its stone, dressing under the floor's edge. */
function shortPost(sink: PartSink, x: number, z: number, top: number): void {
  sink.span('stone', x - 0.17, -0.2, z - 0.17, x + 0.17, 0.12, z + 0.17, stoneOf(0.72, true));
  sink.span('structureWood', x - 0.08, 0.12, z - 0.08, x + 0.08, top, z + 0.08, { colour: TIMBER_DARK, decor: true });
}

/** A lattice (koshi) between x0 and x1, y0 and y1 in the plane z, facing f (±1 along z): its frame and its bars. */
function lattice(sink: PartSink, x0: number, x1: number, y0: number, y1: number, z: number, f: number, pitch: number, colour: Rgb): void {
  const q = (a0: number, a1: number, b0: number, b1: number, opts: EmitOptions): void =>
    face(sink, 'structureWood', [[a0, b0, z], [a1, b0, z], [a1, b1, z], [a0, b1, z]], [0, 0, f], opts);
  const frame: EmitOptions = { colour: TIMBER_DARK, decor: true }, fine: EmitOptions = { colour, decor: true, fine: true };
  q(x0, x1, y0, y0 + 0.1, frame); q(x0, x1, y1 - 0.1, y1, frame); q(x0, x0 + 0.1, y0, y1, frame); q(x1 - 0.1, x1, y0, y1, frame);
  const nv = Math.max(1, Math.round((x1 - x0) / pitch));
  for (let i = 1; i < nv; i++) { const x = x0 + (x1 - x0) * i / nv; q(x - 0.03, x + 0.03, y0, y1, fine); }
  const nh = Math.max(1, Math.round((y1 - y0) / pitch));
  for (let i = 1; i < nh; i++) { const y = y0 + (y1 - y0) * i / nh; q(x0, x1, y - 0.03, y + 0.03, fine); }
}

/** A railing (kōran) along a veranda's edge from a to b: its top and middle rails, its posts. */
function koran(sink: PartSink, a: readonly [number, number], b: readonly [number, number], floor: number): void {
  const top = floor + 0.82, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  bar(sink, 'structureWood', [a[0], top, a[1]], [b[0], top, b[1]], 0.13, { colour: TIMBER_DARK, decor: true });
  bar(sink, 'structureWood', [a[0], floor + 0.42, a[1]], [b[0], floor + 0.42, b[1]], 0.08, { colour: TIMBER, decor: true });
  const n = Math.max(1, Math.round(L / 1.5));
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
    bar(sink, 'structureWood', [x, floor, z], [x, top, z], 0.1, i === 0 || i === n ? { colour: TIMBER_DARK, decor: true } : { colour: TIMBER_DARK, decor: true, fine: true });
  }
}

/** A sacred rope (shimenawa) from x0 to x1 at z, sagging `sag` from y, thickest in the middle, its paper streamers (shide). */
function shimenawa(sink: PartSink, x0: number, x1: number, y: number, z: number, sag: number, r: number): void {
  const P = (u: number): Vec3 => [(x0 + x1) / 2 + u * (x1 - x0) / 2, y - sag * (1 - u * u), z];
  const R = (u: number): number => r * (0.45 + 0.55 * (1 - u * u));
  for (let i = 0; i < 6; i++) { const u0 = -1 + i / 3, u1 = -1 + (i + 1) / 3; sink.pipe('straw', P(u0), P(u1), R(u0), 6, { decor: true }, R(u1)); }
  for (const u of [-0.55, -0.18, 0.18, 0.55]) {
    const p = P(u), y0 = p[1] - R(u) * 0.8;
    for (let k = 0; k < 2; k++) {
      const dx = k % 2 ? 0.07 : -0.07, yy = y0 - k * 0.2;
      sink.span('structureWood', p[0] + dx - 0.07, yy - 0.2, z + 0.02, p[0] + dx + 0.07, yy, z + 0.05, { colour: WHITE, decor: true, fine: 'near' });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------- the rōmon

/** A band of darker gravel along a roof's drip line (amaochi), its kerbs of andesite either side, round (cx, cz). */
function dripLine(sink: PartSink, cx: number, cz: number, X: number, Z: number): void {
  const h = 0.32, y = 0.09, o: EmitOptions = { decor: true, ground: true, shade: 0.58, tint: ANDESITE }, kerb = stoneOf(0.68, true);
  for (const s of [-1, 1]) {
    face(sink, 'stone', [[cx - X - h, y, cz + s * (Z - h)], [cx + X + h, y, cz + s * (Z - h)], [cx + X + h, y, cz + s * (Z + h)], [cx - X - h, y, cz + s * (Z + h)]], UP, o);
    face(sink, 'stone', [[cx + s * (X - h), y, cz - Z + h], [cx + s * (X + h), y, cz - Z + h], [cx + s * (X + h), y, cz + Z - h], [cx + s * (X - h), y, cz + Z - h]], UP, o);
    for (const e of [-h, h]) {
      bar(sink, 'stone', [cx - X - e, 0.07, cz + s * (Z + e)], [cx + X + e, 0.07, cz + s * (Z + e)], 0.16, kerb);
      bar(sink, 'stone', [cx + s * (X + e), 0.07, cz - Z - e], [cx + s * (X + e), 0.07, cz + Z + e], 0.16, kerb);
    }
  }
}

/** The rōmon at z = gz: three bays of 4 m on its andesite kidan, its passage open along z. Returns its platform's half-depth. */
function romon(sink: PartSink, v: Stream, gz: number, base: number): number {
  const w = 12, d = 6.6, bay = w / 3, kh = 0.45, kx = w / 2 + 1.6, kz = d / 2 + 1.6;
  const head = 4.7, lowTop = head + 0.98, pentY = lowTop + 0.9, pentTop = pentY + 0.88, deck = pentTop + 0.26;
  const upW = w - 0.8, upD = d - 0.8, upHead = deck + 2.3, upTop = upHead + 1.32, eaveY = upTop + 0.95, ridgeY = eaveY + 5.0;
  // the kidan: one platform of dressed andesite, two steps up to the passage either side, the drip line round it
  sink.span('stone', -kx, base, gz - kz, kx, kh, gz + kz, stoneOf(0.72));
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const z0 = gz + s * kz, z1 = gz + s * (kz + 0.9 - k * 0.45);
    sink.span('stone', -bay / 2 - 0.5, base, Math.min(z0, z1), bay / 2 + 0.5, 0.15 * (k + 1), Math.max(z0, z1), stoneOf(0.8 - 0.05 * k));
  }
  dripLine(sink, 0, gz, w / 2 + 2.4, d / 2 + 2.4);
  // the lower storey: three rows of four round posts on their stones, the middle row's main pillars the stoutest
  for (const zz of [-d / 2, 0, d / 2]) for (let i = 0; i <= 3; i++) {
    const x = -w / 2 + i * bay, r = zz === 0 ? 0.36 : 0.3;
    revolve(sink, 'stone', x, gz + zz, [[r * 1.75, kh - 0.05], [r * 1.5, kh + 0.16]], 8, stoneOf(0.82), Math.PI / 8);
    sink.cylinder('structureWood', [x, kh + 0.16, gz + zz], 'y', head - kh - 0.16, r, 8, { colour: shade(TIMBER, 0.9 + 0.16 * v()) });
  }
  // the head ties (kashiranuki) along the rows and across the frames, the tie beams (nuki) through the side bays' posts
  for (const zz of [-d / 2, 0, d / 2]) {
    sink.span('structureWood', -w / 2 - 0.35, head - 0.42, gz + zz - 0.16, w / 2 + 0.35, head, gz + zz + 0.16, { colour: TIMBER_DARK });
    for (const s of [-1, 1]) sink.span('structureWood', Math.min(s * (w / 2 + 0.25), s * bay / 2), 3.3, gz + zz - 0.12, Math.max(s * (w / 2 + 0.25), s * bay / 2), 3.62, gz + zz + 0.12,
      { colour: TIMBER_DARK, decor: true });
  }
  for (let i = 0; i <= 3; i++) sink.span('structureWood', -w / 2 + i * bay - 0.16, head - 0.42, gz - d / 2 - 0.25, -w / 2 + i * bay + 0.16, head, gz + d / 2 + 0.25, { colour: TIMBER_DARK });
  // the side bays: the wall down the middle, the guardians' niches behind lattice either face over a board wainscot
  for (const s of [-1, 1]) {
    const xc = s * (w / 2 - bay / 2), x0 = xc - bay / 2 + 0.3, x1 = xc + bay / 2 - 0.3;
    sink.span('plaster', x0, kh, gz - 0.12, x1, head - 0.42, gz + 0.12, { shade: 0.96 });
    for (const f of [-1, 1]) {
      const zf = gz + f * d / 2;
      sink.span('structureWood', x0, kh, zf - 0.06, x1, 1.35, zf + 0.06, { colour: BOARD });
      sink.span('dark', x0, 1.35, zf - f * 0.34 - 0.03, x1, head - 0.42, zf - f * 0.34 + 0.03, { decor: true });
      sink.span('structureWood', x0, 1.3, Math.min(zf, zf - f * 0.37), x1, 1.35, Math.max(zf, zf - f * 0.37), { colour: BOARD, decor: true });
      lattice(sink, x0, x1, 1.35, head - 0.42, zf + f * 0.02, f, 0.28, TIMBER);
    }
  }
  // the passage's great doors, folded back against the middle row
  for (const s of [-1, 1]) {
    const x = s * (bay / 2 - 0.42);
    sink.span('structureWood', x - 0.07, kh + 0.05, gz - bay / 2 + 0.1, x + 0.07, head - 0.6, gz - 0.3, { colour: shade(TIMBER_DARK, 0.9), decor: true });
    for (const y of [1.3, 2.7, 3.7]) sink.span('structureWood', x - 0.11, y, gz - bay / 2 + 0.1, x + 0.11, y + 0.16, gz - 0.3, { colour: TIMBER_DARK, decor: true, fine: true });
  }
  // the lower bracket sets, two steps out, the purlin on their tips, the pent roof round the storey
  for (const zz of [-d / 2, d / 2]) for (let i = 0; i <= 3; i++) bracket(sink, v, -w / 2 + i * bay, head, gz + zz, [0, 0, Math.sign(zz)], 2, 0.42);
  for (const s of [-1, 1]) for (const zz of [-d / 2, 0, d / 2]) bracket(sink, v, s * w / 2, head, gz + zz, [s, 0, 0], 2, 0.42);
  const lo = 0.84;
  for (const s of [-1, 1]) {
    sink.span('structureWood', -w / 2 - lo, lowTop - 0.22, gz + s * (d / 2 + lo) - 0.12, w / 2 + lo, lowTop, gz + s * (d / 2 + lo) + 0.12, { colour: TIMBER_DARK, decor: true });
    sink.span('structureWood', s * (w / 2 + lo) - 0.12, lowTop - 0.22, gz - d / 2 - lo, s * (w / 2 + lo) + 0.12, lowTop, gz + d / 2 + lo, { colour: TIMBER_DARK, decor: true });
  }
  pent(sink, 0, gz, w, d, pentY, pentTop, 2.4, 0.75, 0.55, 0.3, lowTop + 0.02, bark(v), [10, 6], 1.0);
  // the upper storey: its deck over the pent roof, the balcony's railing round it
  sink.span('structureWood', -w / 2 - 0.8, pentTop - 0.04, gz - d / 2 - 0.8, w / 2 + 0.8, deck, gz + d / 2 + 0.8, { colour: TIMBER_DARK });
  const rx = w / 2 + 0.68, rz = d / 2 + 0.68;
  const ring: Array<[number, number]> = [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4];
    koran(sink, [ax, gz + az], [bx, gz + bz], deck);
  }
  // its posts, its walls of boards: the panelled doors in the middle bay of either face, barred windows in the rest
  const ub = upW / 3;
  for (const s of [-1, 1]) for (let i = 0; i <= 3; i++) sink.cylinder('structureWood', [-upW / 2 + i * ub, deck, gz + s * upD / 2], 'y', upHead - deck, 0.26, 8, { colour: shade(TIMBER, 0.9 + 0.16 * v()) });
  for (const s of [-1, 1]) sink.cylinder('structureWood', [s * upW / 2, deck, gz], 'y', upHead - deck, 0.26, 8, { colour: shade(TIMBER, 0.9 + 0.16 * v()) });
  const barred = (x0: number, x1: number, zf: number, f: number): void => {
    const xm = (x0 + x1) / 2, y0 = deck + 0.9, y1 = upHead - 0.65;
    sink.span('dark', xm - 0.75, y0, zf - 0.08, xm + 0.75, y1, zf + 0.08, { decor: true });
    for (let b = -2; b <= 2; b++) face(sink, 'structureWood', [[xm + b * 0.27 - 0.04, y0, zf + f * 0.09], [xm + b * 0.27 + 0.04, y0, zf + f * 0.09], [xm + b * 0.27 + 0.04, y1, zf + f * 0.09], [xm + b * 0.27 - 0.04, y1, zf + f * 0.09]], [0, 0, f], { colour: TIMBER, decor: true, fine: true });
  };
  for (const f of [-1, 1]) {
    const zf = gz + f * upD / 2;
    for (let i = 0; i < 3; i++) {
      const x0 = -upW / 2 + i * ub + 0.24, x1 = x0 + ub - 0.48;
      sink.span('structureWood', x0, deck, zf - 0.06, x1, upHead - 0.3, zf + 0.06, { colour: i === 1 ? TIMBER_DARK : BOARD });
      if (i === 1) {
        face(sink, 'structureWood', [[-0.04, deck + 0.1, zf + f * 0.07], [0.04, deck + 0.1, zf + f * 0.07], [0.04, upHead - 0.4, zf + f * 0.07], [-0.04, upHead - 0.4, zf + f * 0.07]], [0, 0, f], { colour: BOARD, decor: true });
        for (const y of [deck + 0.5, deck + 1.1]) for (const x of [-0.9, -0.5, 0.5, 0.9]) sink.span('structureMetal', x - 0.05, y, zf + f * 0.06 - 0.03, x + 0.05, y + 0.1, zf + f * 0.06 + 0.03, { colour: GILT, decor: true, fine: 'near' });
      } else barred(x0, x1, zf, f);
    }
  }
  for (const s of [-1, 1]) for (const f of [-1, 1]) {
    const z0 = Math.min(gz, gz + f * upD / 2) + 0.24, z1 = Math.max(gz, gz + f * upD / 2) - 0.24;
    sink.span('structureWood', s * upW / 2 - 0.06, deck, z0, s * upW / 2 + 0.06, upHead - 0.3, z1, { colour: BOARD });
  }
  for (const f of [-1, 1]) sink.span('structureWood', -upW / 2 - 0.22, upHead - 0.32, gz + f * upD / 2 - 0.2, upW / 2 + 0.22, upHead, gz + f * upD / 2 + 0.2, { colour: TIMBER_DARK });
  for (const s of [-1, 1]) sink.span('structureWood', s * upW / 2 - 0.2, upHead - 0.32, gz - upD / 2 - 0.22, s * upW / 2 + 0.2, upHead, gz + upD / 2 + 0.22, { colour: TIMBER_DARK });
  // the upper bracket sets, three steps out (mitesaki), the purlin on their tips, the great roof over all
  for (const f of [-1, 1]) for (let i = 0; i <= 3; i++) bracket(sink, v, -upW / 2 + i * ub, upHead, gz + f * upD / 2, [0, 0, f], 3, 0.5);
  for (const s of [-1, 1]) for (const zz of [-upD / 2, 0, upD / 2]) bracket(sink, v, s * upW / 2, upHead, gz + zz, [s, 0, 0], 3, 0.5);
  const uo = 1.5;
  for (const s of [-1, 1]) {
    sink.span('structureWood', -upW / 2 - uo, upTop - 0.24, gz + s * (upD / 2 + uo) - 0.13, upW / 2 + uo, upTop, gz + s * (upD / 2 + uo) + 0.13, { colour: TIMBER_DARK, decor: true });
    sink.span('structureWood', s * (upW / 2 + uo) - 0.13, upTop - 0.24, gz - upD / 2 - uo, s * (upW / 2 + uo) + 0.13, upTop, gz + upD / 2 + uo, { colour: TIMBER_DARK, decor: true });
  }
  irimoya(sink, 0, gz, upW, upD, eaveY, ridgeY, { over: 2.7, sori: 0.95, kick: 0.45, sb: 0.55, verge: 0.55, n: [10, 6], rows: 3, edge: 0.36, wallY: upTop + 0.04, rafter: 0.85, k: 1, cover: bark(v) });
  // the name tablet hung on the upper storey's face over the approach
  const zt = gz + upD / 2 + 0.07;
  sink.span('structureWood', -0.66, upHead - 2.0, zt, 0.66, upHead - 0.05, zt + 0.18, { colour: TIMBER_DARK, decor: true });
  sink.span('structureMetal', -0.48, upHead - 1.84, zt + 0.18, 0.48, upHead - 0.21, zt + 0.2, { colour: GILT, decor: true });
  return kz;
}

// ---------------------------------------------------------------------------------------------------------- the halls

/**
 * The haiden at z = hz, w x d: raised on round posts over its shadowed crawl space, the veranda round its front and
 * sides behind its railing, board walls under the white kokabe, the lattice shutters of its front and the open middle
 * bay behind its blind, the bark irimoya over all, the karahafu porch over its steps with the offering box, the bell's rope
 * and the shimenawa. Returns the z of the stone at the steps' foot.
 */
function haiden(sink: PartSink, v: Stream, hz: number, w: number, d: number): number {
  const fh = 1.25, bays = 5, bw = w / bays, bd = d / 3, ver = 1.3, nag = fh + 2.2;
  const head = fh + 3.0, eaveY = head + 1.45, ridgeY = eaveY + 4.4, zf = hz + d / 2, zv = zf + ver;
  for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) post(sink, v, -w / 2 + i * bw, hz + s * d / 2, head, 0.22);
  for (let j = 1; j < 3; j++) for (const s of [-1, 1]) post(sink, v, s * w / 2, hz - d / 2 + j * bd, head, 0.22);
  // the crawl space in shadow, the floor and its veranda on their short posts
  sink.span('dark', -w / 2 + 0.3, 0.04, hz - d / 2 + 0.3, w / 2 - 0.3, fh - 0.22, zf - 0.3, { decor: true });
  sink.span('structureWood', -w / 2 - ver, fh - 0.22, hz - d / 2 - 0.12, w / 2 + ver, fh, zv, { colour: TIMBER_DARK });
  for (let i = 0; i <= bays; i++) if (Math.abs(-w / 2 + i * bw) > 2.2) shortPost(sink, -w / 2 + i * bw, zv - 0.15, fh - 0.22);
  for (let j = 0; j < 3; j++) for (const s of [-1, 1]) shortPost(sink, s * (w / 2 + ver - 0.15), hz - d / 2 + (j + 0.5) * bd, fh - 0.22);
  // the board walls of the back and sides, the white kokabe over the nageshi, the head beam round all
  sink.span('structureWood', -w / 2 + 0.1, fh, hz - d / 2 - 0.04, w / 2 - 0.1, nag, hz - d / 2 + 0.1, { colour: BOARD });
  for (const s of [-1, 1]) sink.span('structureWood', s * w / 2 - 0.07, fh, hz - d / 2 + 0.1, s * w / 2 + 0.07, nag, zf - 0.1, { colour: shade(BOARD, 0.96) });
  sink.span('plaster', -w / 2 + 0.1, nag, hz - d / 2 - 0.02, w / 2 - 0.1, head - 0.35, hz - d / 2 + 0.08, { shade: 0.97 });
  sink.span('plaster', -w / 2 + 0.1, nag, zf - 0.08, w / 2 - 0.1, head - 0.35, zf + 0.02, { shade: 0.97 });
  for (const s of [-1, 1]) sink.span('plaster', s * w / 2 - 0.05, nag, hz - d / 2 + 0.1, s * w / 2 + 0.05, head - 0.35, zf - 0.1, { shade: 0.95 });
  for (const s of [-1, 1]) {
    sink.span('structureWood', -w / 2 - 0.2, nag - 0.1, hz + s * d / 2 - 0.18, w / 2 + 0.2, nag + 0.1, hz + s * d / 2 + 0.18, { colour: TIMBER_DARK, decor: true });
    sink.span('structureWood', s * w / 2 - 0.18, nag - 0.1, hz - d / 2, s * w / 2 + 0.18, nag + 0.1, zf, { colour: TIMBER_DARK, decor: true });
    sink.span('structureWood', -w / 2 - 0.26, head - 0.36, hz + s * d / 2 - 0.2, w / 2 + 0.26, head, hz + s * d / 2 + 0.2, { colour: TIMBER_DARK });
    sink.span('structureWood', s * w / 2 - 0.2, head - 0.36, hz - d / 2, s * w / 2 + 0.2, head, zf, { colour: TIMBER_DARK });
  }
  // the front: the lattice shutters (shitomido) of the outer bays, the middle bay open behind its half-rolled blind
  for (let i = 0; i < bays; i++) {
    const x0 = -w / 2 + i * bw + 0.24, x1 = x0 + bw - 0.48;
    if (i === 2) {
      sink.span('dark', x0, fh, zf - 1.3, x1, nag, zf - 1.1, {});
      sink.span('straw', x0, nag - 0.95, zf - 0.07, x1, nag - 0.05, zf - 0.02, { decor: true });
      continue;
    }
    sink.span('dark', x0, fh, zf - 0.22, x1, nag, zf - 0.12, {});
    lattice(sink, x0, x1, fh, nag, zf - 0.06, 1, 0.34, TIMBER);
    bar(sink, 'structureWood', [x0, (fh + nag) / 2, zf - 0.04], [x1, (fh + nag) / 2, zf - 0.04], 0.1, { colour: TIMBER_DARK, decor: true });
  }
  for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) funa(sink, -w / 2 + i * bw, head, hz + s * d / 2, true, TIMBER);
  for (let j = 1; j < 3; j++) for (const s of [-1, 1]) funa(sink, s * w / 2, head, hz - d / 2 + j * bd, false, TIMBER);
  // the railing round the veranda, parted at the steps
  const sw = 1.9, ex = w / 2 + ver - 0.1, ez = zv - 0.1;
  koran(sink, [-ex, ez], [-sw, ez], fh); koran(sink, [sw, ez], [ex, ez], fh);
  for (const s of [-1, 1]) {
    koran(sink, [s * ex, ez], [s * ex, hz - d / 2 + 0.1], fh);
    revolve(sink, 'structureMetal', s * sw, ez, [[0.09, fh + 0.82], [0.12, fh + 0.9], [0.08, fh + 1.02], [0.001, fh + 1.12]], 6, { colour: COPPER, decor: true, fine: 'near' });
  }
  // the roof
  irimoya(sink, 0, hz, w, d, eaveY, ridgeY, { over: ver + 1.35, sori: 0.7, kick: 0.35, sb: 0.5, verge: 0.5, n: [10, 6], rows: 3, edge: 0.34, wallY: head + 0.47, rafter: 1.25, k: 1, cover: bark(v) });
  dripLine(sink, 0, hz, w / 2 + ver + 1.35, d / 2 + ver + 1.35);
  // the porch: its four posts, the side ties back to the hall, the rainbow beam (kōryō) over the front pair
  const pw = 6.4, pzF = zv + 2.9, kY = eaveY - 1.05;
  for (const s of [-1, 1]) {
    post(sink, v, s * pw / 2, pzF, kY, 0.2);
    post(sink, v, s * pw / 2, zv - 0.15, kY, 0.2);
    sink.span('structureWood', s * pw / 2 - 0.13, kY - 0.36, zf, s * pw / 2 + 0.13, kY, pzF + 0.15, { colour: TIMBER_DARK });
  }
  sink.span('structureWood', -pw / 2 - 0.3, kY - 0.42, pzF - 0.15, pw / 2 + 0.3, kY, pzF + 0.15, { colour: TIMBER_DARK });
  // the karahafu: its bargeboard arching up to a rounded crest and flicking up at its ends, its roof running back into the
  // hall's, the thick bark edge over the board, the porch's ceiling under it
  const half = pw / 2 + 0.75, yb = kY + 0.3, crest = 1.35, zF = pzF + 0.75, zB = zf + 0.6, rise = 0.1, segs = 12;
  const kara = (u: number): number => yb + crest * Math.pow(1 - u * u, 1.4) + 0.32 * Math.pow(Math.abs(u), 6);
  const c = bark(v), top = weathered(c, yb, crest + rise);
  for (let k = 0; k < segs; k++) {
    const u0 = -1 + 2 * k / segs, u1 = -1 + 2 * (k + 1) / segs, x0 = u0 * half, x1 = u1 * half, y0 = kara(u0), y1 = kara(u1);
    face(sink, c.bucket, [[x0, y0, zF], [x1, y1, zF], [x1, y1 + rise, zB], [x0, y0 + rise, zB]], UP, top);
    face(sink, c.bucket, [[x0, y0 - 0.34, zF], [x1, y1 - 0.34, zF], [x1, y1, zF], [x0, y0, zF]], [0, 0, 1], { colour: c.cut, decor: true });
    sink.member('structureWood', [x0, y0 - 0.58, zF - 0.06], [x1, y1 - 0.58, zF - 0.06], 0.48, 0.12, [0, 0, 1], { colour: TIMBER_DARK, decor: true, exposed: true });
    face(sink, 'structureWood', [[x0, y0 - 0.82, zF - 0.1], [x1, y1 - 0.82, zF - 0.1], [x1, y1 - 0.82 + rise, zB], [x0, y0 - 0.82 + rise, zB]], DOWN, { colour: shade(TIMBER_DARK, 0.8), decor: true });
  }
  for (const s of [-1, 1]) {
    const yE = kara(s);
    face(sink, c.bucket, [[s * half, yE - 0.34, zF], [s * half, yE - 0.34 + rise, zB], [s * half, yE + rise, zB], [s * half, yE, zF]], [s, 0, 0], { colour: c.cut, decor: true });
  }
  const yc = kara(0);
  sink.member('roof', [0, yc + 0.05, zF], [0, yc + 0.05 + rise * 0.5, zF + (zB - zF) * 0.5], 0.36, 0.3, UP, { decor: true, shade: 0.62, exposed: true });
  extrude(sink, 'roof', [[-0.4, yc - 0.05, zF + 0.02], [0.4, yc - 0.05, zF + 0.02], [0.44, yc + 0.45, zF + 0.02], [0.26, yc + 0.8, zF + 0.02], [-0.26, yc + 0.8, zF + 0.02], [-0.44, yc + 0.45, zF + 0.02]],
    [0, 0, -1], 0.3, { decor: true, shade: 0.56 });
  face(sink, 'structureMetal', [[-0.5, yc - 0.62, zF + 0.04], [0.5, yc - 0.62, zF + 0.04], [0.38, yc - 1.05, zF + 0.04], [0, yc - 1.35, zF + 0.04], [-0.38, yc - 1.05, zF + 0.04]], [0, 0, 1], { colour: GILT, decor: true });
  // the frog-leg strut (kaerumata) on the beam's middle, up to the ceiling
  face(sink, 'structureWood', [[-0.55, kY, pzF + 0.16], [0.55, kY, pzF + 0.16], [0.24, yc - 0.8, pzF + 0.16], [-0.24, yc - 0.8, pzF + 0.16]], [0, 0, 1], { colour: TIMBER, decor: true });
  // the steps up to the veranda (kizahashi) on their stringers, the stone at their foot, the offering box on it
  const nst = 5, riser = fh / (nst + 1), tread = 0.3, foot = zv + nst * tread;
  for (let k = 0; k < nst; k++) sink.span('structureWood', -sw + 0.12, fh - (k + 1) * riser - 0.08, zv + k * tread, sw - 0.12, fh - (k + 1) * riser, zv + (k + 1) * tread + 0.04, { colour: shade(TIMBER, 1.05) });
  for (const s of [-1, 1]) bar(sink, 'structureWood', [s * (sw - 0.06), fh - 0.1, zv], [s * (sw - 0.06), 0.1, foot + 0.1], 0.16, { colour: TIMBER_DARK, decor: true });
  sink.span('stone', -sw - 0.25, -0.25, foot, sw + 0.25, 0.2, foot + 1.25, stoneOf(0.7));
  sink.span('structureWood', -0.95, 0.2, foot + 0.3, 0.95, 0.95, foot + 1.0, { colour: TIMBER_DARK, decor: true });
  for (const x of [-0.6, -0.2, 0.2, 0.6]) sink.span('structureWood', x - 0.05, 0.95, foot + 0.32, x + 0.05, 1.0, foot + 0.98, { colour: shade(TIMBER, 1.1), decor: true, fine: 'near' });
  // the bell (suzu) on the beam and its rope, the shimenawa across the porch's front
  revolve(sink, 'structureMetal', 0, pzF - 0.32, [[0.06, kY - 0.42], [0.2, kY - 0.55], [0.22, kY - 0.72], [0.12, kY - 0.86], [0.001, kY - 0.88]], 8, { colour: GILT, decor: true });
  bar(sink, 'structureWood', [0, kY - 0.86, pzF - 0.32], [0, 1.1, pzF - 0.32], 0.1, { colour: ROPE, decor: true, fine: 'near' });
  shimenawa(sink, -pw / 2 + 0.2, pw / 2 - 0.2, kY - 0.5, pzF + 0.05, 0.42, 0.24);
  return foot + 1.25;
}

/**
 * The honden at z = cz (the body's middle): nagare-zukuri, raised on its posts with the veranda round its front and
 * sides, its three doors, the front slope sweeping over the steps to the kōhai's posts and the low deck (hamayuka) under
 * it.
 */
function honden(sink: PartSink, v: Stream, cz: number): void {
  const w = 7.2, d = 5.0, fh = 1.6, head = fh + 2.5, ver = 1.0, bw = w / 3, zf = cz + d / 2, zv = zf + ver;
  for (let i = 0; i <= 3; i++) for (const s of [-1, 1]) post(sink, v, -w / 2 + i * bw, cz + s * d / 2, head, 0.2);
  for (const s of [-1, 1]) post(sink, v, s * w / 2, cz, head, 0.2);
  sink.span('dark', -w / 2 + 0.25, 0.04, cz - d / 2 + 0.25, w / 2 - 0.25, fh - 0.2, zf - 0.25, { decor: true });
  sink.span('structureWood', -w / 2 - ver, fh - 0.2, cz - d / 2 - 0.08, w / 2 + ver, fh, zv, { colour: TIMBER_DARK });
  for (const [x, z] of [[-w / 2 - ver + 0.15, zv - 0.15], [w / 2 + ver - 0.15, zv - 0.15], [-w / 2 - ver + 0.15, cz], [w / 2 + ver - 0.15, cz]] as const) shortPost(sink, x, z, fh - 0.2);
  // its walls of boards, the three doors of the front with their gilt fittings, the head beam round
  sink.span('structureWood', -w / 2 + 0.05, fh, cz - d / 2 - 0.04, w / 2 - 0.05, head - 0.3, cz - d / 2 + 0.08, { colour: BOARD });
  for (const s of [-1, 1]) sink.span('structureWood', s * w / 2 - 0.06, fh, cz - d / 2 + 0.08, s * w / 2 + 0.06, head - 0.3, zf - 0.08, { colour: BOARD });
  for (let i = 0; i < 3; i++) {
    const x0 = -w / 2 + i * bw + 0.22, x1 = x0 + bw - 0.44;
    sink.span('structureWood', x0, fh, zf - 0.1, x1, head - 0.3, zf + 0.02, { colour: i === 1 ? shade(TIMBER_DARK, 0.85) : TIMBER_DARK });
    for (const y of [fh + 0.5, head - 0.8]) sink.span('structureMetal', x0 + 0.1, y, zf + 0.02, x1 - 0.1, y + 0.08, zf + 0.05, { colour: GILT, decor: true, fine: 'near' });
  }
  for (const s of [-1, 1]) {
    sink.span('structureWood', -w / 2 - 0.22, head - 0.32, cz + s * d / 2 - 0.18, w / 2 + 0.22, head, cz + s * d / 2 + 0.18, { colour: TIMBER_DARK });
    sink.span('structureWood', s * w / 2 - 0.18, head - 0.32, cz - d / 2, s * w / 2 + 0.18, head, zf, { colour: TIMBER_DARK });
  }
  for (let i = 0; i <= 3; i++) for (const s of [-1, 1]) funa(sink, -w / 2 + i * bw, head, cz + s * d / 2, true, TIMBER);
  const sw = 1.4, ex = w / 2 + ver - 0.1, ez = zv - 0.1;
  koran(sink, [-ex, ez], [-sw, ez], fh); koran(sink, [sw, ez], [ex, ez], fh);
  for (const s of [-1, 1]) koran(sink, [s * ex, ez], [s * ex, cz - d / 2 + 0.1], fh);
  const { yF, zF } = nagareRoof(sink, 0, cz, w, d, head + 0.45, { back: 1.5, front: ver + 2.9, rise: 3.0, verge: 0.85, sori: 0.45, kick: 0.25, edge: 0.3,
    n: 8, rowsF: 5, rowsB: 3, k: 0.85, rafter: 0, cover: bark(v) });
  // the kōhai: its posts at the front eave, the beam over them and the ties back to the body
  const kz = zF - 0.75, kY = yF - 0.95;
  for (const s of [-1, 1]) {
    post(sink, v, s * (w / 2 - 0.35), kz, kY, 0.17);
    sink.span('structureWood', s * (w / 2 - 0.35) - 0.11, kY - 0.3, zf, s * (w / 2 - 0.35) + 0.11, kY, kz + 0.12, { colour: TIMBER_DARK });
  }
  sink.span('structureWood', -w / 2 + 0.05, kY - 0.36, kz - 0.13, w / 2 - 0.05, kY, kz + 0.13, { colour: TIMBER_DARK });
  // the steps from the low deck up to the veranda, the deck between the kōhai's posts
  const hamaY = 0.5, n = 4, riser = (fh - hamaY) / (n + 1), tread = 0.32, sz = zv + n * tread;
  for (let k = 0; k < n; k++) sink.span('structureWood', -sw + 0.1, fh - (k + 1) * riser - 0.08, zv + k * tread, sw - 0.1, fh - (k + 1) * riser, zv + (k + 1) * tread + 0.04, { colour: shade(TIMBER, 1.05) });
  for (const s of [-1, 1]) bar(sink, 'structureWood', [s * (sw - 0.05), fh - 0.1, zv], [s * (sw - 0.05), hamaY, sz], 0.14, { colour: TIMBER_DARK, decor: true });
  sink.span('stone', -w / 2 + 0.2, -0.25, sz, w / 2 - 0.2, 0.2, kz + 0.5, stoneOf(0.72));
  sink.span('structureWood', -w / 2 + 0.6, 0.2, sz, w / 2 - 0.6, hamaY, kz - 0.25, { colour: TIMBER });
  shimenawa(sink, -w / 2 + 0.6, w / 2 - 0.6, kY - 0.42, kz + 0.16, 0.3, 0.16);
}

/** A massha: a small nagare shrine on its stone base at (x, z), its front turned `yaw` from +z. */
function massha(sink: PartSink, v: Stream, x: number, z: number, yaw: number): void {
  sink.placed(yaw, x, 0, z, () => {
    sink.span('stone', -1.3, -0.3, -1.1, 1.3, 0.5, 1.35, stoneOf(0.72 + 0.08 * v()));
    sink.span('stone', -0.8, -0.3, 1.35, 0.8, 0.24, 1.8, stoneOf(0.76));
    sink.span('structureWood', -0.75, 0.5, -0.6, 0.75, 1.55, 0.6, { colour: BOARD });
    sink.span('structureWood', -0.45, 0.62, 0.6, 0.45, 1.4, 0.65, { colour: TIMBER_DARK, decor: true });
    sink.span('structureWood', -0.82, 1.42, -0.66, 0.82, 1.6, 0.66, { colour: TIMBER_DARK, decor: true });
    const { yF, zF } = nagareRoof(sink, 0, 0, 1.5, 1.2, 1.6, { back: 0.4, front: 0.85, rise: 0.8, verge: 0.3, sori: 0.14, kick: 0.06, edge: 0.1,
      n: 4, rowsF: 3, rowsB: 2, k: 0.3, rafter: 0, cover: bark(v) });
    for (const s of [-1, 1]) sink.span('structureWood', s * 0.62 - 0.05, 0.5, zF - 0.3, s * 0.62 + 0.05, yF - 0.2, zF - 0.2, { colour: TIMBER, decor: true });
  });
}

// ---------------------------------------------------------------------------------------------------------- the court

/** A stone lantern (ishidōrō, the kasuga form) at (x, z): the hexagonal base, the round shaft with its node, the platform,
 *  the fire box with its openings, the hat and its jewel. Each a little different in its proportion, its turn and its age. */
function lantern(sink: PartSink, v: Stream, x: number, z: number, h: number): void {
  const k = h / 2.45 * (0.95 + 0.1 * v()), ph = v() * Math.PI / 3, o: EmitOptions = { ...stoneOf(0.78 + 0.16 * v()), density: 0.12 };
  revolve(sink, 'stone', x, z, [[0.5 * k, -0.35], [0.5 * k, 0.14 * k], [0.16 * k, 0.34 * k]], 6, o, ph);
  revolve(sink, 'stone', x, z, [[0.15 * k, 0.34 * k], [0.15 * k, 0.86 * k], [0.19 * k, 0.9 * k], [0.13 * k, 1.32 * k]], 6, o, ph);
  revolve(sink, 'stone', x, z, [[0.17 * k, 1.32 * k], [0.37 * k, 1.43 * k], [0.37 * k, 1.52 * k], [0.27 * k, 1.52 * k]], 6, o, ph);
  revolve(sink, 'stone', x, z, [[0.27 * k, 1.52 * k], [0.27 * k, 1.9 * k]], 6, o, ph);
  for (const i of [0, 3]) {
    const th = -((i + 0.5) / 6 * Math.PI * 2 + ph), ap = 0.27 * k * Math.cos(Math.PI / 6) + 0.01, cx = x + Math.cos(th) * ap, cz = z + Math.sin(th) * ap;
    const tx = -Math.sin(th) * 0.09 * k, tz = Math.cos(th) * 0.09 * k;
    face(sink, 'dark', [[cx - tx, 1.6 * k, cz - tz], [cx + tx, 1.6 * k, cz + tz], [cx + tx, 1.82 * k, cz + tz], [cx - tx, 1.82 * k, cz - tz]], [Math.cos(th), 0, Math.sin(th)], { decor: true });
  }
  revolve(sink, 'stone', x, z, [[0.29 * k, 1.9 * k], [0.58 * k, 1.97 * k], [0.4 * k, 2.08 * k], [0.11 * k, 2.24 * k]], 6, o, ph);
  revolve(sink, 'stone', x, z, [[0.11 * k, 2.24 * k], [0.14 * k, 2.3 * k], [0.001, 2.47 * k]], 6, { ...o, decor: true }, ph);
}

/** A tamagaki from a to b: boards with a hand's gap between on rails, its posts, the andesite sill it stands on. */
function tamagaki(sink: PartSink, v: Stream, a: readonly [number, number], b: readonly [number, number], h: number): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.5) return;
  const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
  bar(sink, 'stone', [a[0], 0, a[1]], [b[0], 0, b[1]], 0.36, stoneOf(0.7, true));
  const np = Math.max(1, Math.round(L / 3.6));
  for (let i = 0; i <= np; i++) {
    const x = a[0] + ux * L * i / np, z = a[1] + uz * L * i / np;
    sink.span('structureWood', x - 0.09, 0.1, z - 0.09, x + 0.09, h + 0.14, z + 0.09, { colour: shade(TIMBER, 0.88 + 0.16 * v()) });
  }
  bar(sink, 'structureWood', [a[0], h, a[1]], [b[0], h, b[1]], 0.13, { colour: TIMBER_DARK, decor: true });
  bar(sink, 'structureWood', [a[0], 0.45, a[1]], [b[0], 0.45, b[1]], 0.09, { colour: TIMBER, decor: true });
  const pitch = 0.4, bw = 0.22, nb = Math.floor(L / pitch);
  for (let i = 0; i < nb; i++) {
    const c = (i + 0.5) * L / nb, col = shade(BOARD, 0.84 + 0.18 * v()), yt = h - 0.04 - 0.05 * v();
    for (const s of [1, -1]) {
      const ox = nx * s * 0.035, oz = nz * s * 0.035;
      const p0: Vec3 = [a[0] + ux * (c - bw / 2) + ox, 0.18, a[1] + uz * (c - bw / 2) + oz], p1: Vec3 = [a[0] + ux * (c + bw / 2) + ox, 0.18, a[1] + uz * (c + bw / 2) + oz];
      face(sink, 'structureWood', [p0, p1, [p1[0], yt, p1[2]], [p0[0], yt, p0[2]]], [nx * s, 0, nz * s], { colour: col, decor: true, fine: true });
    }
  }
}

/** The temizuya at (tx, tz): the andesite basin on its paving under a copper roof on four posts, its spout and ladles. */
function temizuya(sink: PartSink, v: Stream, tx: number, tz: number): void {
  const hw = 1.35, hd = 0.85, ph = 2.45;
  sink.span('stone', tx - 2.0, -0.2, tz - 1.5, tx + 2.0, 0.12, tz + 1.5, { decor: true, ground: true, shade: 0.8, tint: ANDESITE, density: 0.9 });
  for (const [dx, dz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const) {
    sink.span('stone', tx + dx - 0.2, -0.3, tz + dz - 0.2, tx + dx + 0.2, 0.26, tz + dz + 0.2, stoneOf(0.76));
    sink.span('structureWood', tx + dx - 0.09, 0.26, tz + dz - 0.09, tx + dx + 0.09, ph, tz + dz + 0.09, { colour: shade(TIMBER, 0.95 + 0.1 * v()) });
  }
  for (const s of [-1, 1]) {
    sink.span('structureWood', tx - hw - 0.14, ph - 0.24, tz + s * hd - 0.1, tx + hw + 0.14, ph, tz + s * hd + 0.1, { colour: TIMBER_DARK });
    sink.span('structureWood', tx + s * hw - 0.1, ph - 0.24, tz - hd - 0.14, tx + s * hw + 0.1, ph, tz + hd + 0.14, { colour: TIMBER_DARK });
  }
  sink.span('stone', tx - 0.95, -0.2, tz - 0.42, tx + 0.95, 0.8, tz + 0.42, stoneOf(0.66));
  face(sink, 'dark', [[tx - 0.8, 0.81, tz - 0.28], [tx + 0.8, 0.81, tz - 0.28], [tx + 0.8, 0.81, tz + 0.28], [tx - 0.8, 0.81, tz + 0.28]], UP, { decor: true });
  sink.span('structureWood', tx - 1.28, 0.12, tz - 0.06, tx - 1.16, 1.3, tz + 0.06, { colour: BAMBOO, decor: true });
  bar(sink, 'structureWood', [tx - 1.22, 1.24, tz], [tx - 0.6, 1.02, tz], 0.08, { colour: BAMBOO, decor: true, fine: 'near' });
  for (const dx of [-0.45, 0, 0.45]) bar(sink, 'structureWood', [tx + dx, 0.82, tz - 0.5], [tx + dx + 0.06, 0.86, tz + 0.1], 0.04, { colour: BAMBOO, decor: true, fine: 'near' });
  irimoya(sink, tx, tz, 2 * hw, 2 * hd, ph + 0.42, ph + 1.55, { over: 0.75, sori: 0.28, kick: 0.15, sb: 0.5, verge: 0.22, n: [4, 3], rows: 2, edge: 0.14, wallY: ph + 0.06, rafter: 0, k: 0.4, cover: copper });
}

/** A komainu on its pedestal at (x, z), seated facing the approach, its head turned toward the way (s: the side). */
function komainu(sink: PartSink, v: Stream, x: number, z: number, s: number): void {
  const o = stoneOf(0.74 + 0.08 * v()), b = stoneOf(0.64, true);
  sink.span('stone', x - 0.62, -0.3, z - 0.78, x + 0.62, 0.42, z + 0.78, o);
  sink.span('stone', x - 0.48, 0.42, z - 0.64, x + 0.48, 1.12, z + 0.64, { ...o, shade: 0.8 });
  sink.span('stone', x - 0.56, 1.12, z - 0.7, x + 0.56, 1.24, z + 0.7, o);
  const hx = x - s * 0.06;
  sink.span('stone', x - 0.34, 1.24, z - 0.55, x + 0.34, 1.74, z + 0.02, b);
  sink.span('stone', x - 0.26, 1.24, z - 0.06, x + 0.26, 2.05, z + 0.38, b);
  for (const f of [-1, 1]) sink.span('stone', x + f * 0.17 - 0.08, 1.24, z + 0.3, x + f * 0.17 + 0.08, 1.78, z + 0.5, b);
  sink.span('stone', hx - 0.34, 1.86, z - 0.14, hx + 0.34, 2.36, z + 0.2, b);
  sink.span('stone', hx - 0.25, 1.96, z + 0.1, hx + 0.25, 2.38, z + 0.52, b);
  sink.span('stone', x - 0.14, 1.6, z - 0.66, x + 0.14, 2.14, z - 0.44, b);
}

/** The sacred tree's stone kerb at (x, z) (the tree is the map's own: plan.ts shrineFlora). */
function sacredKerb(sink: PartSink, x: number, z: number): void {
  const kb = stoneOf(0.66, true), e = 1.7;
  for (const s of [-1, 1]) {
    bar(sink, 'stone', [x - e, 0.06, z + s * e], [x + e, 0.06, z + s * e], 0.22, kb);
    bar(sink, 'stone', [x + s * e, 0.06, z - e], [x + s * e, 0.06, z + e], 0.22, kb);
  }
}

/** The sandō's paving between z0 (toward the front) and z1: granite slabs two to a row, the joints staggered. */
function paving(sink: PartSink, v: Stream, z0: number, z1: number, half: number): void {
  face(sink, 'stone', [[-half - 0.04, 0.1, z1], [half + 0.04, 0.1, z1], [half + 0.04, 0.1, z0], [-half - 0.04, 0.1, z0]], UP, { decor: true, ground: true, shade: 0.5, tint: ANDESITE });
  let z = z0, row = 0;
  while (z - 0.6 > z1) {
    const len = Math.min(z - z1, 0.78 + 0.3 * v()), split = (row % 2 ? 0.32 : -0.32) + (v() - 0.5) * 0.2, y = 0.13;
    for (const [xa, xb] of [[-half, split - 0.025], [split + 0.025, half]] as const) {
      face(sink, 'stone', [[xa, y, z - len + 0.025], [xb, y, z - len + 0.025], [xb, y, z - 0.025], [xa, y, z - 0.025]], UP, { decor: true, ground: true, shade: 0.8 + 0.16 * v(), density: 0.9 });
    }
    z -= len; row++;
  }
}

/**
 * The shrine precinct (`length` along its approach, `width` across), its front (+z) at the road: the torii at the mouth,
 * the lantern pairs along the sandō, the rōmon at `gate` of the way in (0-1), the inner court's fence, the temizuya, the
 * haiden, the honden behind it, the massha and the sacred cedar.
 */
export const shrine: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, base = -0.5 - ctx.groundFall;
  const { length, width, front, back } = shrineLayout(ctx.params);
  // the honden at the back in its fence, the haiden before it, the gate at `gate` of the way in (room kept for the court)
  const hallW = Math.min(15, width - 10), hallD = 9;
  let hallZ = back + 22.2;
  if (hallZ > front - 30.6) hallZ = Math.max(back + hallD / 2 + 2.8, front - 30.6);
  const withHonden = hallZ - hallD / 2 >= back + 16.2;
  const gateZ = Math.min(front - 9, Math.max(hallZ + 21.6, front - Math.max(16, length * num(ctx, 'gate', 0.15, 0.6))));
  const fx = width / 2 - 0.6, sw = 3.4, gateKz = 4.9;
  const gateFront = gateZ + gateKz + 0.9, gateBack = gateZ - gateKz - 0.9;
  // the ground: the court's raked gravel, the sandō's band of darker gravel between its kerbs, its granite paving
  face(sink, 'stone', [[-fx + 0.25, 0.03, back + 0.85], [fx - 0.25, 0.03, back + 0.85], [fx - 0.25, 0.03, gateZ], [-fx + 0.25, 0.03, gateZ]], UP,
    { decor: true, ground: true, shade: 0.94, tint: PALE_GRAVEL, uv: { kind: 'world' } });
  const romonKz = romon(sink, v, gateZ, base);
  const stairFoot = haiden(sink, v, hallZ, hallW, hallD);
  face(sink, 'stone', [[-sw, 0.06, stairFoot], [sw, 0.06, stairFoot], [sw, 0.06, front - 0.2], [-sw, 0.06, front - 0.2]], UP, { decor: true, ground: true, shade: 0.8, uv: { kind: 'world' } });
  for (const s of [-1, 1]) {
    bar(sink, 'stone', [s * sw, 0.06, front - 0.2], [s * sw, 0.06, gateZ + romonKz], 0.24, stoneOf(0.66, true));
    bar(sink, 'stone', [s * sw, 0.06, gateZ - romonKz], [s * sw, 0.06, stairFoot], 0.24, stoneOf(0.66, true));
  }
  paving(sink, v, front - 0.3, gateFront, 1.3);
  paving(sink, v, gateBack, stairFoot, 1.3);
  // the tamagaki round the inner court, from the gate's ends round to the back
  const fh = 1.45, wing = 7.7;
  tamagaki(sink, v, [-wing, gateZ], [-fx, gateZ], fh);
  tamagaki(sink, v, [wing, gateZ], [fx, gateZ], fh);
  tamagaki(sink, v, [-fx, gateZ], [-fx, back + 0.6], fh);
  tamagaki(sink, v, [fx, gateZ], [fx, back + 0.6], fh);
  tamagaki(sink, v, [-fx, back + 0.6], [fx, back + 0.6], fh);
  // the honden in its own fence behind the haiden
  if (withHonden) {
    honden(sink, v, back + 6.0);
    const mx = 6.6, mz = back + 15.2;
    for (const s of [-1, 1]) {
      tamagaki(sink, v, [s * mx, back + 0.6], [s * mx, mz], 1.6);
      tamagaki(sink, v, [s * mx, mz], [s * 1.5, mz], 1.6);
    }
  }
  // the lantern pairs along the approach outside the gate and in the court, the guardians at the gate's steps
  for (let z = front - 3.2; z > gateFront + 2.2; z -= 3.4) for (const s of [-1, 1]) lantern(sink, v, s * (sw + 1.2), z, 2.45);
  for (let z = gateBack - 2.6; z > stairFoot + 1.5; z -= 3.3) for (const s of [-1, 1]) lantern(sink, v, s * (sw + 1.2), z, 2.3);
  for (const s of [-1, 1]) komainu(sink, v, s * 2.9, gateFront + 1.4, s);
  temizuya(sink, v, sw + 5.0, gateBack - 3.0);
  // the massha along the court's side, turned to the approach; the sacred cedar in the back corner behind the haiden
  for (const dz of [8.2, 11.8]) massha(sink, v, -fx + 2.3, hallZ + dz, Math.PI / 2);
  sacredKerb(sink, fx - 3.2, Math.min(back + 9, hallZ - hallD / 2 - 4.0));
  // the torii at the mouth of the approach (gates.ts torii, placed after this piece in its frame)
  const children: LandmarkPlacement[] = [{ kind: 'torii', x: 0, z: front - 1.4, yawDeg: 0, params: { span: 6.2, height: 7.6, material: 'stone' }, ground: 'veto' }];
  return { parts: sink.finish(), children };
};
