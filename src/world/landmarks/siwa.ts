// src/world/landmarks/siwa.ts — Siwa's mosque and spring (landmarks-271, 2026-11-06; the realism pass, 273). Sunscar
// Oasis is Siwa under the crumbling kershef fortress of Shali: the census (buildings-270 signature places) names the old
// Shali mosque with its stubby battered mud minaret — "the first landmark on the approach" at the citadel's foot facing
// the market — and the Ain Juba spring (Cleopatra's Spring), its round stone-lined pool, steps and outflow channels into
// the palm gardens.
//
// - shaliMosque: the low prayer hall of salt-mud kershef as one moulded mass: its walls thick, leaning in and slumped,
//   their foot spreading over the ground, the corners rounded off, the parapet's line sagging and bitten where it has
//   washed away, its rounded merlons (some fallen) and corner horns; the palm-trunk beam ends and spouts through the
//   walls, small irregular windows under palm-log lintels, deep doorways; the lower annex behind, the mud stair up the
//   side to the roof; the minaret at its corner, a squat rounded-square shaft battered from a thick foot to a moulded
//   ledge, the set-back upper stage and its rounded crown, small square openings and its scaffold logs; the ablution
//   court's slumped wall, its gate posts.
// - springPool: a builder cannot cut into the terrain, so the sunken pool is built up in its bank: the earth bank, a low
//   dressed-stone parapet, the walk inside it and three stone tiers stepping down to the water about 1.5 m under the
//   coping, the wet riser at the waterline, the spring's eye; the stair up over the bank; the outflow under the bank
//   through the headwall into the channels (saqiya) of the walled palm gardens, their crops, date palms and olives; the
//   café's palm-frond shade.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink, in the map kit's render
// (no draw call of their own). Walls, the minaret and the pool's bank are structure; the beams, fronds and the water are
// dressing.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const PALM = rgb(0x5b4a37), FROND = rgb(0x7c7146), DOOR = rgb(0x4d3b2a), WATER = rgb(0x2f5d5a);
const FROND_GREEN = rgb(0x4e6a2c), DEAD_FROND = rgb(0x8a7550), OLIVE = rgb(0x6b7550), CROP = rgb(0x5f7a32);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

type P2 = readonly [number, number];
/** A plan outline: its points clockwise seen from above (the order ringY emits) and each one's outward normal. */
interface Outline { p: P2[]; n: P2[] }

/**
 * A rounded rectangle about (cx, cz), half-sizes a x b, its corners of radius rc: every straight side cut into runs
 * about `step` long, their points pushed in or out by up to `wobble` (a hand-built wall never runs true).
 */
function roundedPlan(cx: number, cz: number, a: number, b: number, rc: number, step: number, v: () => number, wobble: number): Outline {
  const p: P2[] = [], n: P2[] = [];
  const centres: P2[] = [[a - rc, b - rc], [-a + rc, b - rc], [-a + rc, -b + rc], [a - rc, -b + rc]];
  for (let q = 0; q < 4; q++) {
    const [ox, oz] = centres[q];
    for (let k = 0; k <= 4; k++) {
      const t = (q + k / 4) * Math.PI / 2, c = Math.cos(t), s = Math.sin(t);
      p.push([cx + ox + c * rc, cz + oz + s * rc]); n.push([c, s]);
    }
    // the straight side on to the next corner
    const t = (q + 1) * Math.PI / 2, c = Math.cos(t), s = Math.sin(t), [qx, qz] = centres[(q + 1) % 4];
    const ex = ox + c * rc, ez = oz + s * rc, sx = qx + c * rc, sz = qz + s * rc;
    const segs = Math.max(1, Math.round(Math.hypot(sx - ex, sz - ez) / step));
    for (let k = 1; k < segs; k++) {
      const f = (k + (v() - 0.5) * 0.4) / segs, w = (v() - 0.5) * wobble;
      p.push([cx + ex + (sx - ex) * f + c * w, cz + ez + (sz - ez) * f + s * w]); n.push([c, s]);
    }
  }
  return { p: p.reverse(), n: n.reverse() };
}

/** Closed rings (each clockwise seen from above, bottom up) joined band by band: the faces look out. */
function loft(sink: PartSink, bucket: RegionalBucket, rings: readonly Vec3[][], opts: (band: number) => EmitOptions): void {
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1], m = a.length;
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; sink.quad(bucket, a[i], a[j], b[j], b[i], opts(k)); }
  }
}

/** A vertical ring wall at radius r from y0 to y1 about the origin, its faces looking in (`inward`) or out. */
function ringWall(sink: PartSink, bucket: RegionalBucket, r: number, y0: number, y1: number, n: number, inward: boolean, opts: EmitOptions): void {
  const P = (i: number, y: number): Vec3 => { const a = -(i / n) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (let i = 0; i < n; i++) {
    if (inward) sink.quad(bucket, P(i + 1, y0), P(i, y0), P(i, y1), P(i + 1, y1), opts);
    else sink.quad(bucket, P(i, y0), P(i + 1, y0), P(i + 1, y1), P(i, y1), opts);
  }
}

/**
 * A slumped mud wall from a to b (plan points), `t` thick and `h` high: its faces leaning in as kershef walls weather,
 * its top rounded and sagging. In the wall's own frame: u along, the outer face on the right.
 */
function mudWall(sink: PartSink, bucket: RegionalBucket, a: P2, b: P2, foot: number, h: number, t: number, v: () => number): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = uz, nz = -ux;
  const lean = Math.min(0.18, t * 0.3), segs = Math.max(2, Math.round(L / 2.4));
  const P = (s: number, y: number, o: number): Vec3 => [a[0] + ux * s + nx * o, y, a[1] + uz * s + nz * o];
  // the top's height along the wall: it sags and swells as the mud has slumped
  const tops = Array.from({ length: segs + 1 }, () => h - 0.35 + v() * 0.7);
  for (let k = 0; k < segs; k++) {
    const s0 = L * k / segs, s1 = L * (k + 1) / segs, y0 = tops[k], y1 = tops[k + 1];
    sink.quad(bucket, P(s1, foot, t / 2 + 0.12), P(s0, foot, t / 2 + 0.12), P(s0, y0, t / 2 - lean), P(s1, y1, t / 2 - lean), {});
    sink.quad(bucket, P(s0, foot, -t / 2 - 0.12), P(s1, foot, -t / 2 - 0.12), P(s1, y1, -t / 2 + lean), P(s0, y0, -t / 2 + lean), {});
    sink.quad(bucket, P(s1, y1, t / 2 - lean), P(s0, y0, t / 2 - lean), P(s0, y0 + 0.12, 0), P(s1, y1 + 0.12, 0), { shade: 0.96 });
    sink.quad(bucket, P(s0, y0, -t / 2 + lean), P(s1, y1, -t / 2 + lean), P(s1, y1 + 0.12, 0), P(s0, y0 + 0.12, 0), { shade: 0.96 });
  }
  // the wall's ends, rounded off
  sink.quad(bucket, P(-0.1, foot, -t / 2), P(0, tops[0], -t / 2 + lean), P(0, tops[0], t / 2 - lean), P(-0.1, foot, t / 2), {});
  sink.quad(bucket, P(L + 0.1, foot, t / 2), P(L, tops[segs], t / 2 - lean), P(L, tops[segs], -t / 2 + lean), P(L + 0.1, foot, -t / 2), {});
}

/** What a mud block draws on a side facing (nx, nz): everything, all but windows, or nothing (a side buried in another). */
type SideDress = 'all' | 'blind' | 'none';

/**
 * One moulded kershef mass on `plan`, its roof at H: the foot spreading over the ground (the damp, salt-stained band),
 * the faces leaning in to a rounded crown that sags and is bitten where the parapet has washed away, the roof inside
 * it; on each straight run the rounded merlons (`crenel`: the share still standing), the palm-trunk beam ends under the
 * roof line, now and then a spout, small irregular windows under palm-log lintels and fallen mud at the foot; the
 * horns at the corners.
 */
function mudBlock(sink: PartSink, v: () => number, plan: Outline, o: { H: number; foot: number; crenel: number; windows: number; tone: number; buttress: boolean; dress: (nx: number, nz: number) => SideDress }): void {
  const { p, n } = plan, m = p.length, mud: RegionalBucket = 'plaster', lean = 0.3, H = o.H;
  const tops = p.map(() => H + 0.5 + v() * 0.45);
  for (let k = 0; k < 2; k++) { const i = Math.floor(v() * m); tops[i] -= 0.45; tops[(i + 1) % m] -= 0.2; }
  for (let i = 0; i < m; i++) tops[i] = Math.max(H + 0.2, tops[i]);
  const skirt = p.map(() => 0.45 + v() * 0.35);
  const at = (i: number, off: number, y: number): Vec3 => [p[i][0] + n[i][0] * off, y, p[i][1] + n[i][1] * off];
  const rings: Vec3[][] = [
    p.map((_, i) => at(i, 0.4 + v() * 0.2, o.foot)),
    p.map((_, i) => at(i, 0.05, skirt[i])),
    p.map((_, i) => at(i, -lean, tops[i])),
    p.map((_, i) => at(i, -lean - 0.3, tops[i] + 0.13)),
    p.map((_, i) => at(i, -lean - 0.6, tops[i] - 0.08)),
    p.map((_, i) => at(i, -lean - 0.66, H)),
  ];
  const bandShade = [0.8, 1, 0.97, 0.94, 0.86];
  loft(sink, mud, rings, (k) => ({ shade: bandShade[k] * o.tone }));
  // the roof of palm logs under mud, and the solid inside (the collision's core)
  const roof = rings[5], rc: Vec3 = [roof.reduce((s, q) => s + q[0], 0) / m, H, roof.reduce((s, q) => s + q[2], 0) / m];
  for (let i = 0; i < m; i++) sink.polygon(mud, [rc, roof[i], roof[(i + 1) % m]], { shade: 0.88 * o.tone });
  const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
  sink.span(mud, Math.min(...xs) + 0.7, o.foot, Math.min(...zs) + 0.7, Math.max(...xs) - 0.7, H - 0.02, Math.max(...zs) - 0.7, {});
  // the outer face's offset from the plan line at height y over point i
  const faceOff = (i: number, y: number): number => 0.05 + (-lean - 0.05) * Math.max(0, y - skirt[i]) / (tops[i] - skirt[i]);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, nx = n[i][0], nz = n[i][1];
    if (Math.abs(Math.abs(nx) - Math.abs(nz)) < 1e-6) {
      // a corner's middle: the horn rising off the parapet
      if (o.crenel > 0 && o.dress(nx, nz) !== 'none') {
        const c = at(i, -lean - 0.3, 0), y = tops[i] + 0.05, s = 0.9 + v() * 0.25;
        revolve(sink, mud, c[0], c[2], [[0.36 * s, y - 0.2], [0.3 * s, y + 0.45 * s], [0.13 * s, y + 0.82 * s], [0.001, y + 0.94 * s]], 6, { shade: o.tone, decor: true });
      }
      continue;
    }
    if (Math.abs(nx - n[j][0]) + Math.abs(nz - n[j][1]) > 1e-6) continue;
    const dress = o.dress(nx, nz);
    if (dress === 'none') continue;
    const len = Math.hypot(p[j][0] - p[i][0], p[j][1] - p[i][1]), yaw = Math.atan2(nx, nz);
    const along = (f: number, off: number, y: number): Vec3 => [p[i][0] + (p[j][0] - p[i][0]) * f + nx * off, y, p[i][1] + (p[j][1] - p[i][1]) * f + nz * off];
    const offAt = (f: number, y: number): number => faceOff(i, y) * (1 - f) + faceOff(j, y) * f;
    // the rounded merlons, some fallen
    for (const f of [0.25, 0.75]) {
      if (v() > o.crenel) continue;
      const y = tops[i] + (tops[j] - tops[i]) * f + 0.02, s = 0.82 + v() * 0.3, c = along(f, -lean - 0.3, 0);
      revolve(sink, mud, c[0], c[2], [[0.28 * s, y - 0.15], [0.27 * s, y + 0.2 * s], [0.17 * s, y + 0.42 * s], [0.001, y + 0.52 * s]], 5, { shade: 0.97 * o.tone, decor: true });
    }
    // the palm-trunk beam ends through the wall under the roof line, two to a run, never quite in line
    for (const f0 of [0.18, 0.62]) {
      if (len < 1.2 && f0 > 0.5) continue;
      const f = f0 + v() * 0.2, y = H - 0.3 + (v() - 0.5) * 0.14, off = offAt(f, y);
      bar(sink, 'structureWood', along(f, off - 0.3, y), along(f, off + 0.3 + v() * 0.3, y - v() * 0.06), 0.16 + v() * 0.07,
        { colour: shade(PALM, 0.8 + v() * 0.35), decor: true });
    }
    // now and then a spout (a split palm trunk) draining the roof
    if (v() < 0.22) {
      const f = 0.3 + v() * 0.4, off = offAt(f, H + 0.1);
      bar(sink, 'structureWood', along(f, off - 0.5, H + 0.12), along(f, off + 0.75, H - 0.05), 0.22, { colour: shade(PALM, 0.75), decor: true });
    }
    // a small window, every one its own size and height, under its palm-log lintel
    if (dress === 'all' && v() < o.windows) {
      const f = 0.3 + v() * 0.4, w = 0.3 + v() * 0.28, h = 0.35 + v() * 0.3, y = 1.3 + v() * Math.max(0.2, H - 2.4), c = along(f, offAt(f, y), y);
      const lintel = v() * 0.12;
      sink.placed(yaw, c[0], c[1], c[2], () => {
        sink.span('dark', -w / 2, -h / 2, -0.16, w / 2, h / 2, 0.04, { decor: true });
        bar(sink, 'structureWood', [-w / 2 - 0.22, h / 2 + 0.1, -0.03], [w / 2 + 0.18 + lintel, h / 2 + 0.12, -0.03], 0.13, { colour: PALM, decor: true });
      });
    }
    // a battered buttress shoring the slumped wall
    if (o.buttress && len > 1.6 && v() < 0.25) {
      const c = along(0.5, 0.05, 0), w = 0.8 + v() * 0.4, top = H * (0.6 + v() * 0.25), out = 0.9 + v() * 0.4;
      sink.placed(yaw, c[0], 0, c[2], () => sink.prism(mud, [[-w / 2, o.foot, -0.4], [-w / 2, top, -0.4], [-w / 2, top, 0.12], [-w / 2, o.foot, out]], [1, 0, 0], w, { shade: 0.95 * o.tone }));
    }
    // the mud fallen at the foot
    if (v() < 0.3) {
      const c = along(v(), 0.5 + v() * 0.25, 0), r = 0.22 + v() * 0.28;
      revolve(sink, mud, c[0], c[2], [[r, -0.25], [r * 0.75, r * 0.45], [0.001, r * 0.7]], 5, { decor: true, shade: 0.9 * o.tone });
    }
  }
}

/**
 * The old Shali mosque: the prayer hall (`width` x `depth`, `height` to its roof) as one slumped kershef mass with its
 * lower annex behind and the mud stair up its left side; the minaret (its height three quarters of `minaret`) at the
 * front-right corner, squat and battered, stepping in at its ledge to the rounded crown; the ablution court's low wall
 * before the doors (+z).
 */
export const shaliMosque: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const W = num(ctx, 'width', 8, 20), D = num(ctx, 'depth', 8, 20), H = num(ctx, 'height', 3, 6), M = num(ctx, 'minaret', 8, 18);
  const foot = -0.6 - ctx.groundFall, mud: RegionalBucket = 'plaster';
  // the hall and, behind it, the lower annex (a later build, its render a shade off the hall's)
  mudBlock(sink, v, roundedPlan(0, 0, W / 2, D / 2, 1.3, 2.2, v, 0.16),
    { H, foot, crenel: 0.82, windows: 0.55, tone: 1, buttress: true, dress: (_nx, nz) => (nz > 0.9 ? 'blind' : 'all') });
  mudBlock(sink, v, roundedPlan(-W / 2 + 3.3, -D / 2 - 1.9, 3.1, 2.7, 1.0, 2.0, v, 0.14),
    { H: H - 1.0, foot, crenel: 0.5, windows: 0.6, tone: 0.93, buttress: false, dress: (_nx, nz) => (nz > 0.9 ? 'none' : 'all') });
  // the deep doorways: thick mud jambs and head proud of the wall, the palm-log lintel, the plank door, a stone step
  for (const u of [-W / 4 - 0.4, 0.4]) {
    const z = D / 2, jh = 2.45 + v() * 0.15;
    sink.span(mud, u - 1.0, foot, z - 0.3, u - 0.55, jh, z + 0.5, { shade: 0.96 });
    sink.span(mud, u + 0.55, foot, z - 0.3, u + 1.0, jh, z + 0.5, { shade: 0.96 });
    sink.span(mud, u - 1.0, 2.05, z - 0.3, u + 1.0, jh + 0.15, z + 0.5, { shade: 0.96 });
    sink.span('dark', u - 0.55, 0, z - 0.25, u + 0.55, 2.05, z + 0.3, { decor: true });
    bar(sink, 'structureWood', [u - 1.15, 2.12, z + 0.56], [u + 1.2, 2.15, z + 0.56], 0.2, { colour: PALM, decor: true });
    if (v() < 0.7) sink.span('structureWood', u - 0.5, 0.25, z + 0.24, u + 0.5, 2.0, z + 0.3, { colour: DOOR, decor: true });
    sink.span('stone', u - 1.1, foot, z + 0.5, u + 1.1, 0.22, z + 1.1, { decor: true, shade: 0.85 });
  }
  // the mud stair up the left side to the roof, its treads worn uneven
  const steps = 12, run = Math.min(7.2, D - 3.2), z0 = run / 2 + 0.2;
  for (let k = 0; k < steps; k++) {
    const y = (k + 1) * H / steps + (v() - 0.5) * 0.06;
    sink.span(mud, -W / 2 - 1.05, foot, z0 - (k + 1) * run / steps, -W / 2 + 0.25, y, z0 - k * run / steps, { shade: 0.95 });
  }
  // the minaret: a squat rounded-square shaft battered from its thick foot to the moulded ledge, the set-back upper
  // stage and its rounded crown, every course a little off true
  const Mh = M * 0.76, mx = W / 2 - 1.75, mz = D / 2 - 1.75, yl = Mh * 0.72;
  const st: Array<[number, number, number]> = [[2.6, foot, 3.4], [2.35, 0.8, 3.4]];
  for (let k = 1; k <= 5; k++) { const f = k / 5; st.push([(2.35 - 0.95 * f) * (0.97 + v() * 0.06), 0.8 + (yl - 0.8) * f, 3.4 - 0.6 * f]); }
  st.push([1.62, yl + 0.06, 2.8], [1.62, yl + 0.3, 2.8], [1.12, yl + 0.34, 2.6], [1.06, Mh * 0.86, 2.4], [0.98, Mh * 0.9, 2.2],
    [0.8, Mh * 0.94, 2.1], [0.52, Mh * 0.975, 2], [0.18, Mh, 2], [0.001, Mh + 0.04, 2]);
  const ring = (h: number, y: number, e: number): Vec3[] => {
    const dx = (v() - 0.5) * 0.06, dz = (v() - 0.5) * 0.06;
    return Array.from({ length: 16 }, (_, i): Vec3 => {
      const a = -(i / 16) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      return [mx + dx + h * Math.sign(c) * Math.abs(c) ** (2 / e), y, mz + dz + h * Math.sign(s) * Math.abs(s) ** (2 / e)];
    });
  };
  loft(sink, mud, st.map(([h, y, e]) => ring(h, y, e)), (k) => ({ shade: k === 0 ? 0.82 : k === 7 ? 0.9 : 1 }));
  const halfAt = (y: number): number => {
    for (let k = 1; k < st.length; k++) if (y <= st[k][1]) { const f = (y - st[k - 1][1]) / (st[k][1] - st[k - 1][1]); return st[k - 1][0] + (st[k][0] - st[k - 1][0]) * f; }
    return 0;
  };
  // its small square openings under their lintels (front, right, and the upper stage's three outer sides)
  for (const [y, yaw] of [[2.7, 0], [3.6, Math.PI / 2], [5.4, 0], [5.9, Math.PI / 2], [Mh * 0.8, 0], [Mh * 0.8, Math.PI / 2], [Mh * 0.8, -Math.PI / 2]] as const) {
    const hh = halfAt(y) * (y > yl ? 1 : 0.97), w = 0.32 + v() * 0.12, h = 0.42 + v() * 0.16;
    sink.placed(yaw, mx, y, mz, () => {
      sink.span('dark', -w / 2, -h / 2, hh - 0.14, w / 2, h / 2, hh + 0.03, { decor: true });
      bar(sink, 'structureWood', [-w / 2 - 0.15, h / 2 + 0.08, hh - 0.04], [w / 2 + 0.15, h / 2 + 0.1, hh - 0.04], 0.12, { colour: PALM, decor: true });
    });
  }
  // the scaffold logs left through the shaft, and the horns at the ledge's corners
  for (const [y, yaw] of [[2.0, 0], [2.1, Math.PI / 2], [yl - 1.6, 0], [yl - 1.5, Math.PI / 2]] as const) {
    const hh = halfAt(y);
    for (const u of [-0.7 + v() * 0.2, 0.55 + v() * 0.2]) {
      sink.placed(yaw, mx, y, mz, () => bar(sink, 'structureWood', [u, 0, hh - 0.3], [u, -0.04, hh + 0.4 + v() * 0.2], 0.15, { colour: shade(PALM, 0.85 + v() * 0.3), decor: true }));
    }
  }
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const y = yl + 0.32, s = 0.85 + v() * 0.3;
    revolve(sink, mud, mx + sx * 1.18, mz + sz * 1.18, [[0.22 * s, y - 0.06], [0.17 * s, y + 0.35 * s], [0.001, y + 0.62 * s]], 5, { shade: 0.97, decor: true });
  }
  // the ablution court's slumped wall before the doors, its gate on the approach between two rounded posts
  const cz = D / 2 + 5.4;
  mudWall(sink, mud, [-W / 2 + 0.3, D / 2 + 0.2], [-W / 2 + 0.3, cz], foot, 1.6, 0.6, v);
  mudWall(sink, mud, [-W / 2 + 0.3, cz], [-1.6, cz], foot, 1.6, 0.6, v);
  mudWall(sink, mud, [1.6, cz], [W / 2 - 0.5, cz], foot, 1.6, 0.6, v);
  mudWall(sink, mud, [W / 2 - 0.5, cz], [W / 2 - 0.5, D / 2 + 1.4], foot, 1.5, 0.6, v);
  for (const sx of [-1, 1]) revolve(sink, mud, sx * 1.75, cz, [[0.5, foot], [0.45, 1.9], [0.3, 2.3], [0.001, 2.5 + v() * 0.15]], 6, { shade: 0.97 });
  sink.quad('stone', [-W / 2 + 0.7, 0.03, cz - 0.4], [W / 2 - 0.9, 0.03, cz - 0.4], [W / 2 - 0.9, 0.03, D / 2 + 0.5], [-W / 2 + 0.7, 0.03, D / 2 + 0.5],
    { decor: true, shade: 0.9, uv: { kind: 'world' } });
  return { parts: sink.finish() };
};

/** A date palm from (x, z), its crown at height h moved (lx, lz) by the trunk's lean, the old fronds hanging under it. */
function datePalm(sink: PartSink, v: () => number, x: number, z: number, h: number, lx: number, lz: number, foot: number): void {
  const top: Vec3 = [x + lx, h, z + lz];
  bar(sink, 'structureWood', [x, foot, z], top, 0.34 + v() * 0.08, { colour: shade(PALM, 0.85 + v() * 0.2), decor: true });
  const frond = (b: number, len: number, rise: number, droop: number, w: number, col: Rgb, under: Rgb): void => {
    const mid: Vec3 = [top[0] + Math.cos(b) * len * 0.5, h + rise, top[2] + Math.sin(b) * len * 0.5];
    const tip: Vec3 = [top[0] + Math.cos(b) * len, h - droop, top[2] + Math.sin(b) * len];
    const sx = -Math.sin(b) * w, sz = Math.cos(b) * w;
    for (const [p, q] of [[top, mid], [mid, tip]] as const) {
      sink.quad('structureWood', [p[0] - sx, p[1], p[2] - sz], [p[0] + sx, p[1], p[2] + sz], [q[0] + sx * 0.7, q[1], q[2] + sz * 0.7], [q[0] - sx * 0.7, q[1], q[2] - sz * 0.7], { colour: col, decor: true });
      sink.quad('structureWood', [p[0] + sx, p[1], p[2] + sz], [p[0] - sx, p[1], p[2] - sz], [q[0] - sx * 0.7, q[1], q[2] - sz * 0.7], [q[0] + sx * 0.7, q[1], q[2] + sz * 0.7], { colour: under, decor: true });
    }
  };
  for (let f = 0; f < 7; f++) {
    frond((f / 7) * Math.PI * 2 + v() * 0.4, 2.7 + v() * 0.6, 0.5, 1.2 + v() * 0.9, 0.5, shade(FROND_GREEN, 0.85 + v() * 0.3), shade(FROND_GREEN, 0.7));
  }
  // the dead fronds' skirt under the crown
  for (let f = 0; f < 2; f++) frond(f * Math.PI + v(), 1.2, -0.4, 2.1, 0.3, shade(DEAD_FROND, 0.85 + v() * 0.3), shade(DEAD_FROND, 0.7));
}

/** An olive: a short gnarled trunk and its round grey-green crown. */
function olive(sink: PartSink, v: () => number, x: number, z: number, r: number, foot: number): void {
  const lx = (v() - 0.5) * 0.5, lz = (v() - 0.5) * 0.5;
  bar(sink, 'structureWood', [x, foot, z], [x + lx, 1.5, z + lz], 0.28, { colour: shade(PALM, 0.8), decor: true });
  revolve(sink, 'structureWood', x + lx, z + lz, [[r * 0.5, 1.2], [r, 1.9], [r * 0.8, 2.7], [0.001, 3.0 + v() * 0.4]], 7, { colour: shade(OLIVE, 0.9 + v() * 0.2), decor: true });
}

/**
 * The spring (Ain Juba, Cleopatra's Spring): a round pool `radius` to its parapet's inner face, built up in its bank (a
 * builder cannot cut into the ground): the earth bank, the dressed-stone parapet with the stair's opening on the front,
 * the walk inside it and three stone tiers down to the water about 1.5 m under the coping; the outflow under the bank
 * through its headwall into the `channels` of the walled palm gardens to -x; palms, olives and the café's shade to +x.
 */
export const springPool: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, gf = ctx.groundFall;
  const R = num(ctx, 'radius', 4, 12), n = 32, ch = Math.round(num(ctx, 'channels', 0, 4));
  const Rw = R - 2.0, bankR = R + 1.95, zW = R + 1.45;
  // the earth bank the pool is built up in, its top under the parapet
  revolve(sink, 'plaster2', 0, 0, [[bankR, -0.5 - gf], [R + 1.4, 0.42], [R + 0.95, 0.95], [R + 0.6, 1.05], [R + 0.3, 1.05]], n, { shade: 0.92 });
  // the dressed-stone lining: the walk inside the parapet and the three tiers stepping down to the water
  revolve(sink, 'stone', 0, 0, [[R + 0.3, 1.05], [R - 0.35, 1.05], [R - 0.35, 0.8], [R - 0.9, 0.8], [R - 0.9, 0.55], [R - 1.45, 0.55], [R - 1.45, 0.3], [Rw, 0.3]], n, { shade: 0.95 });
  // the wet riser at the waterline, dark with the water's weed
  ringWall(sink, 'stone', Rw, -0.05, 0.3, n, true, { shade: 0.55 });
  // the parapet: dressed coping stones round the pool, open on the front for the stair
  const gap = 1.35 / (R + 0.5), sweep = Math.PI * 2 - 2 * gap, segs = Math.round(n * sweep / (Math.PI * 2));
  const rows = Array.from({ length: segs + 1 }, (_, s): Vec3[] => {
    const a = Math.PI / 2 - gap - sweep * s / segs, c = Math.cos(a), sn = Math.sin(a), h = (v() - 0.5) * 0.07;
    return ([[R + 0.82, 0.98], [R + 0.76, 1.5 + h], [R + 0.48, 1.62 + h], [R + 0.2, 1.5 + h], [R + 0.14, 0.98]] as const).map(([r, y]): Vec3 => [c * r, y, sn * r]);
  });
  for (let s = 0; s < segs; s++) for (let q = 0; q < 4; q++) sink.quad('stone', rows[s][q], rows[s + 1][q], rows[s + 1][q + 1], rows[s][q + 1], { shade: q === 1 || q === 2 ? 1 : 0.9 });
  sink.polygon('stone', rows[0], { shade: 0.9 });
  sink.polygon('stone', [...rows[segs]].reverse(), { shade: 0.9 });
  // the stair up over the bank to the walk
  for (let k = 0; k < 4; k++) sink.span('stone', -1.15, -0.4 - gf, R + 0.3, 1.15, (k + 1) * 1.05 / 4, bankR - k * (bankR - R - 0.45) / 4, { shade: 0.88 });
  // the water, darker under the walls, the spring's eye paler where it wells up, its rings
  revolve(sink, 'structureMetal', 0, 0, [[Rw, 0.12], [0.001, 0.12]], n, { colour: WATER, decor: true });
  revolve(sink, 'structureMetal', v() * 0.5, v() * 0.5, [[Rw * 0.5, 0.125], [0.001, 0.125]], 16, { colour: shade(WATER, 1.3), decor: true });
  for (const r of [0.6, 1.1]) revolve(sink, 'structureMetal', v() * 0.6, v() * 0.6, [[r + 0.06, 0.13], [r, 0.13]], 16, { colour: shade(WATER, 1.6), decor: true, fine: 'near' });
  // the outflow: under the bank through its stone headwall, then the stone-lined channels out into the gardens
  const spread = 3.0, xEnd = -(R + 13.1);
  if (ch > 0) {
    const half = (ch - 1) * spread / 2 + 0.9;
    sink.span('stone', -bankR - 0.15, -0.4 - gf, -half, -bankR + 0.75, 0.8, half, { shade: 0.85 });
    for (let k = 0; k < ch; k++) {
      const off = (k - (ch - 1) / 2) * spread;
      sink.span('dark', -bankR - 0.2, 0.0, off - 0.3, -bankR - 0.1, 0.42, off + 0.3, { decor: true });
      sink.span('stone', xEnd, -0.3 - gf, off - 0.55, -bankR - 0.15, 0.22, off - 0.3, { decor: true, shade: 0.85 });
      sink.span('stone', xEnd, -0.3 - gf, off + 0.3, -bankR - 0.15, 0.22, off + 0.55, { decor: true, shade: 0.85 });
      sink.span('structureMetal', xEnd, 0.02, off - 0.3, -bankR - 0.12, 0.11, off + 0.3, { colour: WATER, decor: true });
    }
  }
  // the gardens' low mud walls: along both sides of the -x garden and across its end (the channels' gap), the +x garden's L
  const x0 = Math.sqrt(Math.max(0, bankR * bankR - zW * zW)) + 0.05, xb = -(R + 13.0), gapZ = ch > 0 ? (ch - 1) * spread / 2 + 1.2 : 1.2;
  for (const s of [-1, 1]) mudWall(sink, 'plaster', [-x0, s * zW], [xb, s * zW], -0.5 - gf, 1.2, 0.5, v);
  mudWall(sink, 'plaster', [xb, -zW], [xb, -gapZ], -0.5 - gf, 1.2, 0.5, v);
  mudWall(sink, 'plaster', [xb, gapZ], [xb, zW], -0.5 - gf, 1.2, 0.5, v);
  mudWall(sink, 'plaster', [x0, zW], [R + 12.6, zW], -0.5 - gf, 1.2, 0.5, v);
  mudWall(sink, 'plaster', [R + 12.6, zW], [R + 12.6, 1.6], -0.5 - gf, 1.1, 0.5, v);
  // the crops in their rows between the channels and the walls
  for (const s of [-1, 1]) {
    for (let z = gapZ + 0.6; z < zW - 0.8; z += 1.3) {
      sink.span('structureWood', xb + 0.6, -0.05 - gf, s * z - 0.25, -(R + 2.8), 0.22 + v() * 0.12, s * z + 0.25, { colour: shade(CROP, 0.8 + v() * 0.35), decor: true });
    }
  }
  // the date palms round the pool and in the gardens, each trunk leaning a little toward the light over the water
  const palms: Array<[number, number]> = [
    [-(R + 2.7), zW - 3.5], [-(R + 2.9), -(zW - 3.6)], [-(R + 6.6), zW - 4.6], [-(R + 7.0), -(zW - 4.2)], [-(R + 10.3), zW - 3.9], [-(R + 10.4), -(zW - 5.0)],
    [R + 2.7, zW - 3.5], [R + 6.6, zW - 4.0], [R + 9.9, zW - 4.8],
  ];
  for (const [px0, pz0] of palms) {
    const px = px0 + (v() - 0.5) * 0.6, pz = pz0 + (v() - 0.5) * 0.6, h = 7 + v() * 4;
    datePalm(sink, v, px, pz, h, -Math.sign(px) * v() * 0.6, -Math.sign(pz) * v() * 0.7, -0.4 - gf);
  }
  olive(sink, v, R + 10.9, -(zW - 2.2), 1.5, -0.3 - gf);
  olive(sink, v, R + 11.4, -1.4, 1.3, -0.3 - gf);
  // the café's shade: six posts and a roof of laid palm fronds on its rafters, its benches of palm logs on mud blocks
  const sx = R + 5.6, sz = -(zW - 4.3);
  for (const [dx, dz] of [[-2.4, -1.8], [0, -1.8], [2.4, -1.8], [-2.4, 1.8], [0, 1.8], [2.4, 1.8]] as const) {
    bar(sink, 'structureWood', [sx + dx, -0.3 - gf, sz + dz], [sx + dx + (v() - 0.5) * 0.12, 2.6, sz + dz], 0.16, { colour: PALM });
  }
  for (const dz of [-1.8, 1.8]) bar(sink, 'structureWood', [sx - 2.7, 2.6, sz + dz], [sx + 2.7, 2.6, sz + dz], 0.14, { colour: PALM, decor: true });
  sink.span('straw', sx - 2.9, 2.68, sz - 2.2, sx + 2.9, 2.85, sz + 2.2, { colour: FROND, decor: true });
  for (let x = -2.6; x <= 2.6; x += 0.65) bar(sink, 'straw', [sx + x, 2.88, sz - 2.3], [sx + x + (v() - 0.5) * 0.3, 2.88, sz + 2.3], 0.12, { colour: shade(FROND, 0.9 + v() * 0.2), decor: true, fine: true });
  for (const dz of [-1.2, 1.2]) {
    sink.span('plaster', sx - 1.8, -0.2 - gf, sz + dz - 0.25, sx - 1.4, 0.45, sz + dz + 0.25, {});
    sink.span('plaster', sx + 1.4, -0.2 - gf, sz + dz - 0.25, sx + 1.8, 0.45, sz + dz + 0.25, {});
    bar(sink, 'structureWood', [sx - 1.9, 0.55, sz + dz], [sx + 1.9, 0.55, sz + dz], 0.24, { colour: PALM, decor: true });
  }
  return { parts: sink.finish() };
};
