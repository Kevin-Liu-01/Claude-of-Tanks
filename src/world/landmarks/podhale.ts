// src/world/landmarks/podhale.ts — Podhale's wooden church (landmarks-271, 2026-11-06; realism pass 273, 2026-11-16).
// Frosthollow is Podhale under the Tatras in the winter of 1945: the census (buildings-270 signature places) names the
// wooden churches with shingle towers (Dębno Podhalańskie's St Michael is the type) as the region's signature, and
// found the map's onion-domed kit church standing in for them.
//
// - woodenChurch: the nave and the narrower chancel with its three-sided end, both of horizontal larch logs (zrąb), each
//   course its own log, the logs of both walls running on past every corner in a stack of sawn ends; the nave's steep
//   gabled shingle roof, the chancel's lower one hipped round its three-sided end, the sygnaturka turret on the nave's
//   ridge over the chancel; the soboty, the low pent skirt on struts round the body and the tower; the west tower of
//   battered post-and-beam with vertical boarding, its overhanging belfry (izbica) on a shingled apron, and the baroque
//   helmet over it (bulb, lantern, bulb, cross); the churchyard's log wall under its shingle cap with the roofed
//   lychgate on the tower door's axis, the spruces and the crosses inside it. On a snow map (ctx.snowCap) January lies
//   on the roofs' lower courses and on the soboty, drifts against the weather (-x) side, banks along the drip lines, and
//   a trodden path runs from the gate to the door.
//
// Drawn in its own frame (x across, y up, z out of the front: the tower's door) into the regional part sink, its logs,
// boards and shingles in the map kit's wood and roofing (no draw call of its own). The walls, the roofs and the tower are
// structure; the logs' faces, the arcade's struts, the churchyard and the snow are dressing.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, cross, revolve, ringY } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

/** weathered larch: dark brown, silvering grey on the weather side; the sawn ends paler; the shingles near black */
const LOG = rgb(0x4a3a2c), LOG_SILVER = rgb(0x665d53), LOG_DARK = rgb(0x2a2019), BOARD = rgb(0x4c3f34), END_GRAIN = rgb(0x7a6852);
const SHINGLE = rgb(0x39312b), IRON = rgb(0x2c2c2c), SPRUCE = rgb(0x1e2d21), BARK = rgb(0x3a2f27);
/** a log course (m) */
const COURSE = 0.32;
const UP: Vec3 = [0, 1, 0], DOWN: Vec3 = [0, -1, 0];
type P2 = readonly [number, number];

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const L3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
function unit(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return unit([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

/** A planar convex polygon facing `out` (its winding set from its normal). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], out: Vec3, opts: EmitOptions): void {
  const n = normalOf(pts[0], pts[1], pts[2]);
  sink.polygon(bucket, n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** A plan polyline offset `d` outward (the right of each a->b seen from above, (dz, -dx)), mitred at its corners. */
function offsetLine(pts: readonly P2[], d: number, closed: boolean): Array<[number, number]> {
  const n = pts.length, nrm = (a: P2, b: P2): P2 => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };
  return pts.map((p, i) => {
    const prev = closed || i > 0 ? nrm(pts[(i - 1 + n) % n], p) : null, next = closed || i + 1 < n ? nrm(p, pts[(i + 1) % n]) : null;
    if (!prev || !next) { const m = (prev ?? next) as P2; return [p[0] + m[0] * d, p[1] + m[1] * d]; }
    const k = d / (1 + prev[0] * next[0] + prev[1] * next[1]);
    return [p[0] + (prev[0] + next[0]) * k, p[1] + (prev[1] + next[1]) * k];
  });
}

/**
 * A log wall from a to b (plan points), y0..y1, facing out to the right of a->b: the wall's plane (the structure), and
 * on it each course its own log (dressing), standing 3-6.5 cm proud, thicker at its butt, its arrises chamfered so the
 * groove between two logs reads; the splash courses darker, the weather side silvered. `half` starts the wall half a
 * log up (the crossing walls' logs sit half a log above or below each other at the notch).
 */
function logWall(sink: PartSink, v: () => number, a: P2, b: P2, y0: number, y1: number, half: boolean, weather: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ox = (b[1] - a[1]) / len, oz = -(b[0] - a[0]) / len;
  const P = (p: P2, y: number, o: number): Vec3 => [p[0] + ox * o, y, p[1] + oz * o];
  sink.quad('structureWood', P(b, y0, 0), P(a, y0, 0), P(a, y1, 0), P(b, y1, 0), { colour: shade(LOG_DARK, 0.8) });
  for (let y = y0, k = 0; y < y1 - 0.06; k++) {
    const top = Math.min(y1, y + (k === 0 && half ? COURSE * 0.5 : COURSE));
    const butt = v() < 0.5, oa = butt ? 0.06 : 0.03 + 0.015 * v(), ob = butt ? 0.03 + 0.015 * v() : 0.06, c = Math.min(0.05, (top - y) * 0.28);
    const tone = shade(mix(LOG, LOG_SILVER, Math.min(1, weather * 0.6 + v() * 0.3)), (0.82 + 0.3 * v()) * (y < y0 + 0.65 ? 0.7 : 1));
    sink.quad('structureWood', P(b, y + c, ob), P(a, y + c, oa), P(a, top - c, oa), P(b, top - c, ob), { colour: tone, decor: true });
    sink.quad('structureWood', P(b, top - c, ob), P(a, top - c, oa), P(a, top, 0), P(b, top, 0), { colour: shade(tone, 1.15), decor: true, fine: true });
    sink.quad('structureWood', P(b, y, 0), P(a, y, 0), P(a, y + c, oa), P(b, y + c, ob), { colour: shade(tone, 0.45), decor: true, fine: true });
    y = top;
  }
}

/**
 * The logs of a wall running on past its corner c along d (unit), the wall facing n: a stack of ends 0.24-0.3 m out,
 * each log's sawn end its own reach and tone (the wall's courses: `half` as logWall's).
 */
function cornerEnds(sink: PartSink, v: () => number, c: P2, d: P2, n: P2, y0: number, y1: number, half: boolean): void {
  const p = 0.24 + 0.06 * v(), t0 = -0.24, t1 = 0.05;
  const Q = (s: number, t: number, y: number): Vec3 => [c[0] + d[0] * s + n[0] * t, y, c[1] + d[1] * s + n[1] * t];
  const D: Vec3 = [d[0], 0, d[1]], N: Vec3 = [n[0], 0, n[1]], o = { colour: shade(LOG, 0.75), decor: true };
  facing(sink, 'structureWood', [Q(0, t1, y0), Q(p, t1, y0), Q(p, t1, y1), Q(0, t1, y1)], N, o);
  facing(sink, 'structureWood', [Q(0, t0, y0), Q(p, t0, y0), Q(p, t0, y1), Q(0, t0, y1)], [-N[0], 0, -N[2]], o);
  facing(sink, 'structureWood', [Q(p, t0, y0), Q(p, t1, y0), Q(p, t1, y1), Q(p, t0, y1)], D, { colour: shade(LOG_DARK, 0.7), decor: true });
  for (let y = y0, k = 0; y < y1 - 0.06; k++) {
    const top = Math.min(y1, y + (k === 0 && half ? COURSE * 0.5 : COURSE)), e = p + 0.005 + 0.03 * v(), g = Math.min(0.035, (top - y) * 0.2);
    facing(sink, 'structureWood', [Q(e, t0 + 0.02, y + g), Q(e, t1 - 0.01, y + g), Q(e, t1 - 0.01, top - g), Q(e, t0 + 0.02, top - g)], D,
      { colour: shade(END_GRAIN, 0.75 + 0.35 * v()), decor: true });
    y = top;
  }
}

/**
 * A shingled roof facet from its eave edge e0-e1 up to r1-r0 (r0 = r1 for a hip's triangle), facing up: the facet, its
 * underside a roof's thickness below (dressing), the shingles' course lines every 0.55 m up it (fine dressing).
 */
function shingles(sink: PartSink, e0: Vec3, e1: Vec3, r1: Vec3, r0: Vec3, colour: Rgb, decor = false): void {
  const tri = r0[0] === r1[0] && r0[1] === r1[1] && r0[2] === r1[2];
  const top = tri ? [e0, e1, r1] : [e0, e1, r1, r0];
  facing(sink, 'roof', top, UP, { colour, decor });
  let N = normalOf(e0, e1, r1);
  if (N[1] < 0) N = [-N[0], -N[1], -N[2]];
  facing(sink, 'roof', top.map((p) => add(p, N, -0.12)), DOWN, { colour: shade(colour, 0.45), decor: true });
  const run = Math.hypot((r0[0] + r1[0] - e0[0] - e1[0]) / 2, (r0[1] + r1[1] - e0[1] - e1[1]) / 2, (r0[2] + r1[2] - e0[2] - e1[2]) / 2);
  for (let d = 0.55; d < run - 0.3; d += 0.55) {
    const f0 = d / run, f1 = (d + 0.08) / run;
    const pts = [add(L3(e0, r0, f0), N, 0.02), add(L3(e1, r1, f0), N, 0.02), add(L3(e1, r1, f1), N, 0.02), add(L3(e0, r0, f1), N, 0.02)];
    facing(sink, 'roof', pts, UP, { colour: shade(colour, 0.6), decor: true, fine: true });
  }
}

/**
 * January's snow on a roof facet (shingles' frame): lying from the eave up a fraction fMin..fMax of the facet, its top
 * edge ragged, a third of a metre thick at the eave where it runs out past the shingles as a cornice. Dressing.
 */
function facetSnow(sink: PartSink, v: () => number, e0: Vec3, e1: Vec3, r1: Vec3, r0: Vec3, fMin: number, fMax: number, segs: number): void {
  let N = normalOf(e0, e1, r1);
  if (N[1] < 0) N = [-N[0], -N[1], -N[2]];
  const Dn = unit([(e0[0] + e1[0] - r0[0] - r1[0]) / 2, (e0[1] + e1[1] - r0[1] - r1[1]) / 2, (e0[2] + e1[2] - r0[2] - r1[2]) / 2]);
  const fs = Array.from({ length: segs + 1 }, () => fMin + (fMax - fMin) * v());
  const E = (u: number): Vec3 => L3(e0, e1, u), S = (u: number, f: number): Vec3 => add(L3(E(u), L3(r0, r1, u), f), N, 0.16);
  const B = (u: number): Vec3 => add(add(E(u), N, 0.2), Dn, 0.12), Bl = (u: number): Vec3 => add(add(E(u), Dn, 0.12), N, -0.04);
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs, u1 = (i + 1) / segs;
    facing(sink, 'plaster', [B(u0), B(u1), S(u1, fs[i + 1]), S(u0, fs[i])], UP, { decor: true });
    facing(sink, 'plaster', [Bl(u0), Bl(u1), B(u1), B(u0)], Dn, { decor: true });
  }
}

/**
 * A bank of snow along a wall from (ax, az) to (bx, bz), crested `h` above the ground and running out `out` metres
 * along (nx, nz), both toes sunk in the snow, the ends tapering (polarStations.ts's snowBank). Snow maps only; dressing.
 */
function snowBank(sink: PartSink, ctx: LandmarkBuildContext, ax: number, az: number, bx: number, bz: number, nx: number, nz: number,
  h: number, out: number): void {
  if (!ctx.snowCap) return;
  const gl = (x: number, z: number) => ctx.ground?.(x, z) ?? 0;
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(len / 2.5));
  const face = (pts: Vec3[], up: Vec3) => facing(sink, 'plaster', pts, up, { decor: true });
  let prev: Vec3[] | null = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, taper = Math.sqrt(Math.sin(Math.PI * t)), reach = 0.55 + 0.45 * taper;
    const back: Vec3 = [x - nx * 0.7 * reach, gl(x - nx * 0.7 * reach, z - nz * 0.7 * reach) - 0.12, z - nz * 0.7 * reach];
    const crest: Vec3 = [x, gl(x, z) + h * (0.2 + 0.8 * taper), z];
    const toe: Vec3 = [x + nx * out * reach, gl(x + nx * out * reach, z + nz * out * reach) - 0.12, z + nz * out * reach];
    const row = [back, crest, toe];
    if (prev) {
      face([prev[0], prev[1], row[1], row[0]], [-nx, 1, -nz]);
      face([prev[1], prev[2], row[2], row[1]], [nx, 1, nz]);
    } else face(row, [-(bz - az), 0, bx - ax]);
    prev = row;
  }
  if (prev) face([...prev].reverse(), [bx - ax, 0, bz - az]);
}

/** A spruce: its trunk and five tiers of drooping boughs, January's snow lying in patches on each tier. Dressing. */
function spruce(sink: PartSink, ctx: LandmarkBuildContext, x: number, z: number, h: number, r: number): void {
  const v = ctx.variant, g = ctx.ground?.(x, z) ?? 0, ph = v() * Math.PI, tone = shade(SPRUCE, 0.85 + 0.3 * v());
  revolve(sink, 'structureWood', x, z, [[0.2, g - 0.3], [0.17, g + 0.9]], 7, { colour: BARK, decor: true }, ph);
  const prof: Array<[number, number]> = [[0.22, g + 0.8]], tiers: Array<[number, number, number, number]> = [], n = 5, span = h - 1.0;
  for (let k = 0; k < n; k++) {
    const t = k / n, yb = g + 0.8 + span * t * 0.92, Rk = r * (1 - t * 0.8) * (0.9 + 0.2 * v());
    const yt = k === n - 1 ? g + h : yb + span * 0.3, rt = k === n - 1 ? 0.001 : Rk * 0.3;
    prof.push([Rk, yb], [rt, yt]);
    tiers.push([Rk, yb, rt, yt]);
  }
  revolve(sink, 'structureWood', x, z, prof, 7, { colour: tone, decor: true }, ph);
  if (!ctx.snowCap) return;
  for (const [Rk, yb, rt, yt] of tiers) {
    const P = (a: number, s: number): Vec3 => {
      const rr = Rk + (rt - Rk) * s + 0.05;
      return [x + Math.cos(a) * rr, yb + (yt - yb) * s + 0.06, z + Math.sin(a) * rr];
    };
    for (let j = 0; j < 3; j++) {
      const a0 = ph + (j + 0.6 * v()) * Math.PI * 2 / 3, da = 0.45 + 0.4 * v(), am = a0 + da / 2, a1 = a0 + da, s0 = 0.04, s1 = 0.2 + 0.18 * v();
      facing(sink, 'plaster', [P(a0, s0), P(am, s0), P(am, s1 + 0.06), P(a0, s1)], UP, { decor: true });
      facing(sink, 'plaster', [P(am, s0), P(a1, s0), P(a1, s1), P(am, s1 + 0.06)], UP, { decor: true });
    }
  }
}

/**
 * The wooden church: the nave (`width` x `length`), the chancel seven tenths as wide with its three-sided end, the tower
 * (`tower` sets the shaft: its head at 0.7 of it, the izbica and helmet over it) at the front, the soboty round the body
 * and the tower, the churchyard (`yard` metres across) inside its log wall.
 */
export const woodenChurch: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, snow = ctx.snowCap, gl = (x: number, z: number) => ctx.ground?.(x, z) ?? 0;
  const W = num(ctx, 'width', 6, 12), L = num(ctx, 'length', 8, 18), T = num(ctx, 'tower', 10, 22);
  const foot = -0.6 - ctx.groundFall, wallH = 5.4, cWall = 4.7, sill = 0.5, tan = Math.tan(60 * Math.PI / 180);
  const Wc = W * 0.7, Lc = L * 0.55, nz0 = -L / 2 + 2, nz1 = nz0 + L, cz1 = nz0, cz0 = nz0 - Lc, e = Wc * 0.32;
  // the tower: battered from tb at its foot to tt at its head (ty); its half width at a height
  const tb = Math.max(5.2, W * 0.78), tt = tb * 0.74, ty = T * 0.7, tz = nz1 + tb / 2 - 1.1;
  const hwT = (y: number) => tb / 2 - (tb - tt) / 2 * (y - foot) / (ty - foot);

  // ---- the stone footing under the sill logs
  sink.span('stone', -W / 2 - 0.15, foot, nz0 - 0.15, W / 2 + 0.15, sill, nz1, { shade: 0.8 });
  sink.span('stone', -Wc / 2 - 0.15, foot, cz0 - 0.15, Wc / 2 + 0.15, sill, cz1, { shade: 0.8 });

  // ---- the log walls (the weather side, -x, silvered), the corners' stacks of log ends
  const wx = (nx: number) => (nx < -0.3 ? 1 : nx > 0.3 ? 0 : 0.45);
  const hx = hwT(foot) - 0.4;
  logWall(sink, v, [W / 2, nz1], [hx, nz1], sill, wallH, false, 0.45);
  logWall(sink, v, [-hx, nz1], [-W / 2, nz1], sill, wallH, false, 0.45);
  logWall(sink, v, [-W / 2, nz1], [-W / 2, nz0], sill, wallH, true, 1);
  logWall(sink, v, [-W / 2, nz0], [W / 2, nz0], sill, wallH, false, 0.6);
  logWall(sink, v, [W / 2, nz0], [W / 2, nz1], sill, wallH, true, 0);
  const chancel: P2[] = [[-Wc / 2, cz1], [-Wc / 2, cz0 + e], [-Wc / 4, cz0], [Wc / 4, cz0], [Wc / 2, cz0 + e], [Wc / 2, cz1]];
  for (let k = 0; k + 1 < chancel.length; k++) {
    const a = chancel[k], b = chancel[k + 1], nx = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    logWall(sink, v, a, b, sill, cWall, k % 2 === 0, wx(nx));
  }
  sink.quad('structureWood', [-W / 2, wallH, nz1], [W / 2, wallH, nz1], [W / 2, wallH, nz0], [-W / 2, wallH, nz0], { colour: LOG_DARK });
  for (const s of [-1, 1]) {
    for (const z of [nz1, nz0]) cornerEnds(sink, v, [s * W / 2, z], [s, 0], [0, z === nz1 ? 1 : -1], sill, wallH - 0.6, false);
    cornerEnds(sink, v, [s * W / 2, nz1], [0, 1], [s, 0], sill, wallH - 0.6, true);
    cornerEnds(sink, v, [s * W / 2, nz0], [0, -1], [s, 0], sill, wallH - 0.6, true);
    // the chancel's shoulder and its end corner: the side wall's logs on past the shoulder, the facet's both ways
    const sh: P2 = [s * Wc / 2, cz0 + e], en: P2 = [s * Wc / 4, cz0];
    const fl = Math.hypot(en[0] - sh[0], en[1] - sh[1]), f: P2 = [(en[0] - sh[0]) / fl, (en[1] - sh[1]) / fl];
    const fn: P2 = s < 0 ? [f[1], -f[0]] : [-f[1], f[0]];
    cornerEnds(sink, v, sh, [0, -1], [s, 0], sill, cWall - 0.6, true);
    cornerEnds(sink, v, sh, [-f[0], -f[1]], fn, sill, cWall - 0.6, false);
    cornerEnds(sink, v, en, f, fn, sill, cWall - 0.6, false);
    cornerEnds(sink, v, en, [s, 0], [0, -1], sill, cWall - 0.6, true);
  }
  // the few small windows, on the south (+x) side under the soboty
  const pane = (x: number, z0: number, z1: number, y0: number, y1: number) => facing(sink, 'dark', [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], [1, 0, 0], { decor: true });
  for (const z of [nz0 + L * 0.3, nz0 + L * 0.68]) pane(W / 2 + 0.075, z - 0.35, z + 0.35, 1.95, 2.75);
  pane(Wc / 2 + 0.075, cz0 + e + 1.3, cz0 + e + 1.9, 1.95, 2.65);

  // ---- the roofs: the nave's steep gable through its walls' heads, the chancel's lower ridge hipped round its end
  const nR = wallH + (W / 2) * tan, ov = 0.7, X = W / 2 + ov, yE = wallH - ov * tan, zv0 = nz0 - 0.5, zv1 = nz1 + 0.4;
  const roofTone = () => shade(SHINGLE, 0.85 + 0.3 * v());
  const naveR: Array<[Vec3, Vec3, Vec3, Vec3]> = [
    [[X, yE, zv0], [X, yE, zv1], [0, nR, zv1], [0, nR, zv0]],
    [[-X, yE, zv1], [-X, yE, zv0], [0, nR, zv0], [0, nR, zv1]],
  ];
  for (const [a, b, c, d] of naveR) {
    shingles(sink, a, b, c, d, roofTone());
    if (snow) facetSnow(sink, v, a, b, c, d, 0.18, 0.42, 5);
  }
  for (const [z, s] of [[nz1, 1], [nz0, -1]] as const) {
    facing(sink, 'structureWood', [[-W / 2, wallH, z], [W / 2, wallH, z], [0, nR, z]], [0, 0, s], { colour: BOARD });
    // the gable's vertical boarding
    for (let x = -W / 2 + 0.5; x < W / 2 - 0.3; x += 0.5) {
      const yTop = nR - Math.abs(x) * tan - 0.05;
      if (yTop > wallH + 0.2) facing(sink, 'structureWood', [[x - 0.03, wallH, z + s * 0.025], [x + 0.03, wallH, z + s * 0.025], [x + 0.03, yTop, z + s * 0.025], [x - 0.03, yTop, z + s * 0.025]], [0, 0, s], { colour: shade(BOARD, 0.6), decor: true, fine: true });
    }
  }
  const ovc = 0.7, cR = cWall + (Wc / 2) * tan, yEc = cWall - ovc * tan, zh = cz0 + Wc / 2;
  const ce = offsetLine(chancel, ovc, false).map(([x, z]): Vec3 => [x, yEc, z]);
  const Rf: Vec3 = [0, cR, cz1], H: Vec3 = [0, cR, zh];
  const cFacets: Array<[Vec3, Vec3, Vec3, Vec3]> = [[ce[0], ce[1], H, Rf], [ce[1], ce[2], H, H], [ce[2], ce[3], H, H], [ce[3], ce[4], H, H], [ce[4], ce[5], Rf, H]];
  for (const [a, b, c, d] of cFacets) {
    shingles(sink, a, b, c, d, roofTone());
    if (snow) facetSnow(sink, v, a, b, c, d, 0.2, 0.45, a[0] === b[0] ? 3 : 2);
  }
  // the sygnaturka on the nave's ridge over the chancel: a little boarded belfry, its louvred openings, its bulb and cross
  const sz = nz0 + 1.2, sb0 = nR - 0.9, sb1 = nR + 1.0;
  sink.span('structureWood', -0.45, sb0, sz - 0.45, 0.45, sb1, sz + 0.45, { colour: BOARD, decor: true });
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const cx = ax * 0.46, cz = sz + az * 0.46, ux = az, uz = -ax;
    facing(sink, 'dark', [[cx - ux * 0.22, nR + 0.15, cz - uz * 0.22], [cx + ux * 0.22, nR + 0.15, cz + uz * 0.22], [cx + ux * 0.22, sb1 - 0.2, cz + uz * 0.22], [cx - ux * 0.22, sb1 - 0.2, cz - uz * 0.22]], [ax, 0, az], { decor: true });
  }
  revolve(sink, 'roof', 0, sz, [[0.6, sb1], [0.72, sb1 + 0.3], [0.55, sb1 + 0.65], [0.2, sb1 + 0.95], [0.07, sb1 + 1.2], [0.001, sb1 + 1.4]], 8, { colour: SHINGLE, decor: true }, Math.PI / 8);
  cross(sink, 'structureMetal', 0, sb1 + 1.35, sz, 0.8, 'latin', IRON);

  // ---- the soboty: the low pent skirt round the body and the tower, 1.4 m out, its eave at 1.75 m, on raking struts
  const sb = 1.4, sy = 1.75, sTop = 2.9, hT = hwT(sTop), tzF = tz + hT;
  const inner: P2[] = [[W / 2, nz1], [hT, nz1], [hT, tzF], [-hT, tzF], [-hT, nz1], [-W / 2, nz1], [-W / 2, nz0], [-Wc / 2, nz0],
    [-Wc / 2, cz0 + e], [-Wc / 4, cz0], [Wc / 4, cz0], [Wc / 2, cz0 + e], [Wc / 2, nz0], [W / 2, nz0]];
  const outer = offsetLine(inner, sb, true);
  for (let k = 0; k < inner.length; k++) {
    const j = (k + 1) % inner.length;
    const o0: Vec3 = [outer[k][0], sy, outer[k][1]], o1: Vec3 = [outer[j][0], sy, outer[j][1]];
    const i0: Vec3 = [inner[k][0], sTop, inner[k][1]], i1: Vec3 = [inner[j][0], sTop, inner[j][1]];
    shingles(sink, o0, o1, i1, i0, shade(roofTone(), 1.05));
    if (snow) facetSnow(sink, v, o0, o1, i1, i0, 0.55, 0.95, Math.max(1, Math.round(Math.hypot(o1[0] - o0[0], o1[2] - o0[2]) / 2.6)));
    // its struts, out of the wall to the eave purlin, every 3.2 m along the run
    const L2 = Math.hypot(inner[j][0] - inner[k][0], inner[j][1] - inner[k][1]);
    for (let t = L2 / 2 - Math.floor(L2 / 2 / 3.2) * 3.2; t < L2; t += 3.2) {
      const f = t / L2, ix = inner[k][0] + (inner[j][0] - inner[k][0]) * f, iz = inner[k][1] + (inner[j][1] - inner[k][1]) * f;
      const ox = outer[k][0] + (outer[j][0] - outer[k][0]) * f, oz = outer[k][1] + (outer[j][1] - outer[k][1]) * f;
      bar(sink, 'structureWood', [ix, sy - 0.75, iz], [ix + (ox - ix) * 0.82, sy - 0.02, iz + (oz - iz) * 0.82], 0.13, { colour: LOG_DARK, decor: true });
    }
  }

  // ---- the tower: battered walls of vertical boarding from its foot to its head, the door
  const tq = (sx: number, sz2: number, w: number, y: number, out = 0): Vec3 => [sx * (w / 2 + out), y, tz + sz2 * (w / 2 + out)];
  const sides: Array<[[number, number], [number, number]]> = [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]]];
  for (const [[ax, az], [bx, bz]] of sides) {
    const out: Vec3 = [(ax + bx) / 2, 0, (az + bz) / 2];
    facing(sink, 'structureWood', [tq(ax, az, tb, foot), tq(bx, bz, tb, foot), tq(bx, bz, tt, ty), tq(ax, az, tt, ty)], out, { colour: BOARD });
    for (let k = 1; k < 16; k++) {
      const f = k / 16, mx = ax + (bx - ax) * f, mz = az + (bz - az) * f, dx = (bx - ax) * 0.018, dz = (bz - az) * 0.018;
      const p0 = tq(mx, mz, tb, sTop - 0.4, 0.025), p1 = tq(mx, mz, tt, ty, 0.025);
      facing(sink, 'structureWood', [[p0[0] - dx, p0[1], p0[2] - dz], [p0[0] + dx, p0[1], p0[2] + dz], [p1[0] + dx, p1[1], p1[2] + dz], [p1[0] - dx, p1[1], p1[2] - dz]], out,
        { colour: shade(BOARD, 0.55), decor: true, fine: true });
    }
  }
  const zf = (y: number) => tz + hwT(y) + 0.04;
  facing(sink, 'dark', [[-0.62, sill - 0.05, zf(sill)], [0.62, sill - 0.05, zf(sill)], [0.62, 2.45, zf(2.45)], [-0.62, 2.45, zf(2.45)]], [0, 0, 1], { decor: true });
  for (const s of [-1, 1]) bar(sink, 'structureWood', [s * 0.72, sill - 0.05, zf(sill) + 0.03], [s * 0.72, 2.55, zf(2.55) + 0.03], 0.16, { colour: LOG_DARK, decor: true });
  bar(sink, 'structureWood', [-0.9, 2.6, zf(2.6) + 0.03], [0.9, 2.6, zf(2.6) + 0.03], 0.18, { colour: LOG_DARK, decor: true });
  sink.span('stone', -0.95, foot, zf(0) - 0.1, 0.95, sill - 0.05, zf(0) + 0.55, { shade: 0.7, decor: true });

  // ---- the izbica: the boarded belfry overhanging the shaft's head on its shingled apron, its louvred openings
  const iw = tt + 1.3, iy0 = ty, iy1 = ty + 2.8;
  sink.span('structureWood', -iw / 2, iy0, tz - iw / 2, iw / 2, iy1, tz + iw / 2, { colour: shade(BOARD, 1.05) });
  for (const [[ax, az], [bx, bz]] of sides) {
    const out: Vec3 = [(ax + bx) / 2, 0, (az + bz) / 2];
    // the apron: a pent of shingles flaring out and down from the izbica's sill, its soffit back to the shaft
    const a0 = tq(ax, az, iw, iy0 + 0.25), b0 = tq(bx, bz, iw, iy0 + 0.25), a1 = tq(ax, az, iw + 1.6, iy0 - 0.45), b1 = tq(bx, bz, iw + 1.6, iy0 - 0.45);
    shingles(sink, a1, b1, b0, a0, roofTone());
    if (snow) facetSnow(sink, v, a1, b1, b0, a0, 0.5, 0.9, 2);
    facing(sink, 'roof', [a1, b1, tq(bx, bz, tt, iy0 - 0.5), tq(ax, az, tt, iy0 - 0.5)], DOWN, { colour: shade(SHINGLE, 0.4), decor: true });
    // three openings to a side, each with its louvres
    const ux = (bx - ax) / 2, uz = (bz - az) / 2;
    for (const k of [-1, 0, 1]) {
      const c = k * iw * 0.3, cx = out[0] * (iw / 2 + 0.02) + ux * c, cz = tz + out[2] * (iw / 2 + 0.02) + uz * c;
      const P = (u: number, y: number, o = 0): Vec3 => [cx + ux * u + out[0] * o, y, cz + uz * u + out[2] * o];
      facing(sink, 'dark', [P(-0.3, iy0 + 0.7), P(0.3, iy0 + 0.7), P(0.3, iy1 - 0.5), P(-0.3, iy1 - 0.5)], out, { decor: true });
      for (let y = iy0 + 0.95; y < iy1 - 0.6; y += 0.35) facing(sink, 'structureWood', [P(-0.3, y - 0.12, 0.08), P(0.3, y - 0.12, 0.08), P(0.3, y, 0), P(-0.3, y, 0)], [out[0], 1, out[2]], { colour: shade(BOARD, 0.8), decor: true, fine: 'near' });
    }
    for (let k = 1; k < 12; k++) {
      const f = k / 12, m = tq(ax + (bx - ax) * f, az + (bz - az) * f, iw, iy0 + 0.25, 0.02), dx = ux * 0.03, dz = uz * 0.03;
      if (Math.min(Math.abs(f - 0.5), Math.abs(Math.abs(f - 0.5) - 0.3)) < 0.06) continue; // (the openings)
      facing(sink, 'structureWood', [[m[0] - dx, iy0 + 0.25, m[2] - dz], [m[0] + dx, iy0 + 0.25, m[2] + dz], [m[0] + dx, iy1, m[2] + dz], [m[0] - dx, iy1, m[2] - dz]], out,
        { colour: shade(BOARD, 0.6), decor: true, fine: true });
    }
  }

  // ---- the baroque helmet: a shingled roof from the izbica's eaves to an octagonal neck, the bulb, the open lantern, the
  // smaller bulb and the cross
  const he = iw / 2 + 0.45, hy0 = iy1 - 0.25, rN = 1.25, yN = iy1 + 1.3, ph = Math.PI / 8;
  const oct = ringY(0, yN, tz, rN, 8, ph);
  const sqAt = (p: Vec3): Vec3 => { const dx = p[0], dz = p[2] - tz, m = Math.max(Math.abs(dx), Math.abs(dz)); return [dx / m * he, hy0, tz + dz / m * he]; };
  for (let i = 0; i < 8; i++) {
    const p = oct[i], q = oct[(i + 1) % 8], mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2 - tz;
    if (Math.abs(Math.abs(mx) - Math.abs(mz)) > 0.3) {
      // a side facet: the square's side to the octagon's edge facing it
      const a = sqAt(p), b = sqAt(q);
      shingles(sink, a, b, q, p, SHINGLE);
      if (snow) facetSnow(sink, v, a, b, q, p, 0.2, 0.45, 2);
      facing(sink, 'roof', [a, b, [b[0] * (iw / 2) / he, iy1, tz + (b[2] - tz) * (iw / 2) / he], [a[0] * (iw / 2) / he, iy1, tz + (a[2] - tz) * (iw / 2) / he]], DOWN, { colour: shade(SHINGLE, 0.4), decor: true });
    } else {
      // a corner: the square's corner to the octagon's diagonal edge
      const c: Vec3 = [Math.sign(mx) * he, hy0, tz + Math.sign(mz) * he], a = sqAt(p), b = sqAt(q);
      for (const tri of [[a, c, p], [c, b, q], [c, q, p]] as Vec3[][]) facing(sink, 'roof', tri, [Math.sign(mx), 0.8, Math.sign(mz)], { colour: shade(SHINGLE, 0.95) });
      const at = (p: Vec3): Vec3 => [p[0] * (iw / 2) / he, iy1, tz + (p[2] - tz) * (iw / 2) / he];
      facing(sink, 'roof', [a, c, at(c), at(a)], DOWN, { colour: shade(SHINGLE, 0.4), decor: true });
      facing(sink, 'roof', [c, b, at(b), at(c)], DOWN, { colour: shade(SHINGLE, 0.4), decor: true });
    }
  }
  revolve(sink, 'roof', 0, tz, [[rN, yN], [1.7, yN + 0.55], [1.82, yN + 1.05], [1.62, yN + 1.6], [1.1, yN + 2.1], [0.55, yN + 2.5], [0.38, yN + 2.75]], 8, { colour: SHINGLE, decor: true }, ph);
  revolve(sink, 'structureWood', 0, tz, [[0.62, yN + 2.72], [0.62, yN + 3.55]], 8, { colour: BOARD, decor: true }, ph);
  const lo = ringY(0, yN + 2.9, tz, 0.64, 8, ph), hi = ringY(0, yN + 3.4, tz, 0.64, 8, ph);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, out: Vec3 = [(lo[i][0] + lo[j][0]) / 2, 0, (lo[i][2] + lo[j][2]) / 2 - tz];
    facing(sink, 'dark', [L3(lo[i], lo[j], 0.22), L3(lo[i], lo[j], 0.78), L3(hi[i], hi[j], 0.78), L3(hi[i], hi[j], 0.22)], out, { decor: true });
  }
  revolve(sink, 'roof', 0, tz, [[0.8, yN + 3.55], [0.74, yN + 3.95], [0.5, yN + 4.35], [0.17, yN + 4.7], [0.07, yN + 5.0], [0.001, yN + 5.3]], 8, { colour: SHINGLE, decor: true }, ph);
  cross(sink, 'structureMetal', 0, yN + 5.25, tz, 1.3, 'latin', IRON);

  // ---- the churchyard: its log wall under a shingled cap in panels between paired posts, the lychgate on the door's axis
  const yw = Math.max(W + 8, num(ctx, 'yard', 14, 40)), yz1 = zf(0) + 2.85, yz0 = cz0 - 4, gx = 1.6, wt = 0.16, wTop = 1.25;
  const run = (a: P2, b: P2, endPost = false): void => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 6)), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    for (let k = 0; k < n; k++) {
      const p0: P2 = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], p1: P2 = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
      const g = Math.min(gl(p0[0], p0[1]), gl(p1[0], p1[1]), gl((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)), top = g + wTop;
      const tone = shade(mix(LOG, LOG_SILVER, 0.3 + 0.5 * v()), 0.8 + 0.25 * v());
      // the logs' block (a hair short of each post), the course lines on both faces
      const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2, hl = len / n / 2;
      sink.box('structureWood', [cx, (g - 0.3 + top) / 2, cz], [Math.abs(ux) * hl + Math.abs(uz) * wt, (top - g + 0.3) / 2, Math.abs(uz) * hl + Math.abs(ux) * wt], { colour: tone, decor: true }, undefined, { ny: true });
      for (const s of [-1, 1]) for (const y of [g + 0.42, g + 0.84]) {
        const ox = uz * (wt + 0.01) * s, oz = -ux * (wt + 0.01) * s;
        facing(sink, 'structureWood', [[p0[0] + ox, y - 0.035, p0[1] + oz], [p1[0] + ox, y - 0.035, p1[1] + oz], [p1[0] + ox, y, p1[1] + oz], [p0[0] + ox, y, p0[1] + oz]], [uz * s, 0, -ux * s],
          { colour: shade(tone, 0.45), decor: true, fine: true });
      }
      // the shingled cap, both slopes, the snow on it
      const cv = wt + 0.22, ridge = top + 0.32;
      for (const s of [-1, 1]) {
        const ox = uz * cv * s, oz = -ux * cv * s;
        const e0: Vec3 = [p0[0] + ox - ux * 0.05, top - 0.02, p0[1] + oz - uz * 0.05], e1: Vec3 = [p1[0] + ox + ux * 0.05, top - 0.02, p1[1] + oz + uz * 0.05];
        const r0: Vec3 = [p0[0] - ux * 0.05, ridge, p0[1] - uz * 0.05], r1: Vec3 = [p1[0] + ux * 0.05, ridge, p1[1] + uz * 0.05];
        facing(sink, 'roof', [e0, e1, r1, r0], UP, { colour: shade(SHINGLE, 0.9 + 0.2 * v()), decor: true });
        if (snow) facing(sink, 'plaster', [add(L3(e0, r0, 0.25), UP, 0.07), add(L3(e1, r1, 0.25), UP, 0.07), add(r1, UP, 0.14), add(r0, UP, 0.14)], UP, { decor: true });
      }
      // the paired clamp posts at the panel's start (and the run's end)
      for (const p of k + 1 === n && endPost ? [p0, p1] : [p0]) {
        const gp = gl(p[0], p[1]);
        sink.box('structureWood', [p[0], (gp - 0.3 + gp + wTop + 0.12) / 2, p[1]], [Math.abs(ux) * 0.09 + Math.abs(uz) * (wt + 0.07), (wTop + 0.42) / 2, Math.abs(uz) * 0.09 + Math.abs(ux) * (wt + 0.07)],
          { colour: LOG_DARK, decor: true }, undefined, { ny: true });
      }
    }
  };
  run([-yw / 2, yz1], [-gx, yz1], true); run([gx, yz1], [yw / 2, yz1]); run([yw / 2, yz1], [yw / 2, yz0]); run([yw / 2, yz0], [-yw / 2, yz0]); run([-yw / 2, yz0], [-yw / 2, yz1]);
  // the lychgate: four log posts, their tie beams, a steep shingled gable roof along the wall, boarded gables, a cross;
  // its two plank leaves stand open inward
  const g0 = gl(0, yz1), gy = g0 + 2.45, gR = g0 + 3.55, gd = 0.55;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(sink, 'structureWood', [sx * 1.4, g0 - 0.3, yz1 + sz * gd], [sx * 1.4, gy, yz1 + sz * gd], 0.2, { colour: LOG_DARK, decor: true });
  for (const sz of [-1, 1]) bar(sink, 'structureWood', [-1.75, gy - 0.05, yz1 + sz * gd], [1.75, gy - 0.05, yz1 + sz * gd], 0.18, { colour: LOG_DARK, decor: true });
  for (const sx of [-1, 1]) {
    bar(sink, 'structureWood', [sx * 1.4, gy - 0.05, yz1 - gd - 0.3], [sx * 1.4, gy - 0.05, yz1 + gd + 0.3], 0.16, { colour: LOG_DARK, decor: true });
    facing(sink, 'structureWood', [[sx * 1.55, gy, yz1 - gd - 0.3], [sx * 1.55, gy, yz1 + gd + 0.3], [sx * 1.55, gy + 0.16, yz1 + gd + 0.3], [sx * 1.55, gR - 0.1, yz1], [sx * 1.55, gy + 0.16, yz1 - gd - 0.3]], [sx, 0, 0], { colour: BOARD, decor: true });
    // the leaf, swung in against the wall's line
    sink.span('structureWood', sx * 1.32 - 0.04, g0 + 0.05, yz1 - gd - 1.25, sx * 1.32 + 0.04, g0 + 1.55, yz1 - gd - 0.05, { colour: shade(BOARD, 1.1), decor: true });
  }
  for (const sz of [-1, 1]) {
    const e0: Vec3 = [-2.0, gy, yz1 + sz * (gd + 0.45)], e1: Vec3 = [2.0, gy, yz1 + sz * (gd + 0.45)], r1: Vec3 = [2.0, gR, yz1], r0: Vec3 = [-2.0, gR, yz1];
    shingles(sink, e0, e1, r1, r0, SHINGLE, true);
    if (snow) facetSnow(sink, v, e0, e1, r1, r0, 0.4, 0.7, 2);
  }
  cross(sink, 'structureWood', 0, gR - 0.05, yz1, 0.7, 'latin', LOG_DARK);

  // ---- the churchyard's spruces and its wooden crosses
  spruce(sink, ctx, -8.2, yz0 + 3.4, 10 + 2 * v(), 2.0);
  spruce(sink, ctx, 8.3, yz0 + 4.2, 8.5 + 2 * v(), 1.8);
  spruce(sink, ctx, -yw / 2 + 2.6, yz1 - 3.6, 9 + 2 * v(), 1.9);
  for (const [x, z] of [[yw / 2 - 2.6, nz0 + 2.0], [yw / 2 - 2.4, nz0 + 4.6], [-yw / 2 + 2.6, nz0 + 1.0]] as const) {
    const g = gl(x, z);
    cross(sink, 'structureWood', x, g - 0.3, z, 1.5 + 0.3 * v(), 'latin', shade(LOG_DARK, 0.9 + 0.4 * v()), (v() - 0.5) * 0.3);
    snowBank(sink, ctx, x, z - 0.9, x, z + 0.9, 1, 0, 0.3, 0.4);
  }

  // ---- the snow on the ground: the drifts against the weather (-x) walls under the soboty, the banks along the soboty's
  // drip line where the roofs shed, the trodden path from the gate to the door with its shovelled banks
  if (snow) {
    for (const s of [-1, 1]) {
      const h = s < 0 ? 1.0 : 0.45, out = s < 0 ? 2.4 : 1.0;
      snowBank(sink, ctx, s * (W / 2 + 0.45), nz1 - 0.3, s * (W / 2 + 0.45), nz0 + 0.3, s, 0, h, out);
      snowBank(sink, ctx, s * (Wc / 2 + 0.45), nz0 - 0.4, s * (Wc / 2 + 0.45), cz0 + e + 0.2, s, 0, h * 0.85, out * 0.8);
    }
    snowBank(sink, ctx, -Wc / 4 - 0.4, cz0 - 0.45, Wc / 4 + 0.4, cz0 - 0.45, 0, -1, 0.6, 1.4);
    for (let k = 0; k < inner.length; k++) {
      const j = (k + 1) % inner.length, a = outer[k], b = outer[j], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1.2) continue;
      const nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len, wsd = nx < -0.3 ? 1.6 : 1;
      const bank = (p: P2, q: P2) => snowBank(sink, ctx, p[0] + nx * 0.2, p[1] + nz * 0.2, q[0] + nx * 0.2, q[1] + nz * 0.2, nx, nz, 0.4 * wsd, 0.8 * wsd);
      if (nz > 0.9 && a[0] > 1.6 && b[0] < -1.6) { bank(a, [1.0, a[1]]); bank([-1.0, b[1]], b); } else bank(a, b);
    }
    // the path: trampled snow, grey and packed, from the door's step out through the gate
    const z0 = zf(0) + 0.55, z1 = yz1 + 1.0, segs = Math.max(2, Math.ceil((z1 - z0) / 1.2));
    for (let k = 0; k < segs; k++) {
      const za = z0 + (z1 - z0) * k / segs, zb = z0 + (z1 - z0) * (k + 1) / segs, wa = 0.6 + 0.12 * v(), wb = 0.6 + 0.12 * v();
      facing(sink, 'plaster', [[-wa, gl(-wa, za) + 0.04, za], [wa, gl(wa, za) + 0.04, za], [wb, gl(wb, zb) + 0.04, zb], [-wb, gl(-wb, zb) + 0.04, zb]], UP, { shade: 0.72, decor: true });
    }
    // the lee drift inside the churchyard's weather-side wall
    snowBank(sink, ctx, -yw / 2 + 0.6, yz0 + 1.0, -yw / 2 + 0.6, yz1 - 1.0, 1, 0, 0.7, 1.6);
  }
  return { parts: sink.finish() };
};
