// src/world/maps/regional/millWorks.ts — the water works the regional mills share (props census #22, Lane C
// 2026-10-16): a water wheel of shrouds, arms, floats or buckets on an iron hub; the banded oak axle; a launder (the
// flume's open trough on its frames, its water in it) and the trestles it rides on; a solid ring for rims and stones.
// Every emitter builds in the sink's current frame; a caller turns it with PartSink.placed.
import { LocalFrame, PartSink, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';

/**
 * A solid ring (an annulus `len` deep along `ax`): its outer and inner sides and its two faces, so a millstone's eye, a
 * shroud's or a hand wheel's rim is open through. e1 × e2 must be `ax`.
 */
export function ringSolid(sink: PartSink, bucket: RegionalBucket, c: Vec3, ax: Vec3, e1: Vec3, e2: Vec3, rIn: number, rOut: number,
  len: number, segs: number, opts: EmitOptions): void {
  const at = (k: number, r: number, t: number): Vec3 => {
    const a = (k / segs) * Math.PI * 2, cs = Math.cos(a) * r, sn = Math.sin(a) * r;
    return [c[0] + ax[0] * t + e1[0] * cs + e2[0] * sn, c[1] + ax[1] * t + e1[1] * cs + e2[1] * sn, c[2] + ax[2] * t + e1[2] * cs + e2[2] * sn];
  };
  for (let i = 0; i < segs; i++) {
    const j = i + 1;
    sink.quad(bucket, at(i, rOut, 0), at(j, rOut, 0), at(j, rOut, len), at(i, rOut, len), opts);
    sink.quad(bucket, at(j, rIn, 0), at(i, rIn, 0), at(i, rIn, len), at(j, rIn, len), opts);
    sink.quad(bucket, at(i, rIn, len), at(i, rOut, len), at(j, rOut, len), at(j, rIn, len), opts);
    sink.quad(bucket, at(j, rIn, 0), at(j, rOut, 0), at(i, rOut, 0), at(i, rIn, 0), opts);
  }
}

interface WaterWheelSpec {
  /** rim radius and the half width over the shrouds' middles (m) */
  R: number;
  half: number;
  /**
   * 'breast': floats standing a hand past the rims (an undershot or breastshot wheel turned by the race's flow);
   * 'overshot': buckets between a closed sole and the rims (filled from a launder over the top)
   */
  kind: 'breast' | 'overshot';
  /** the timber's colours: the shrouds and arms, the floats or buckets */
  wood: Rgb;
  boards: Rgb;
  iron: Rgb;
  /** collision-bearing (a wheel that stands in its structure's records) or dressing only */
  solid: boolean;
}

/**
 * A water wheel centred on the frame's origin, its axle along z: the two shrouds and their eight arms each, the iron
 * hub through them, and the floats or the buckets with their sole. The axle is the caller's (millAxle): it runs from a
 * bearing into a wall.
 */
export function waterWheel(sink: PartSink, w: WaterWheelSpec): void {
  const { R, half } = w;
  const base: EmitOptions = w.solid ? {} : { decor: true };
  const ax: Vec3 = [0, 0, 1], e1: Vec3 = [1, 0, 0], e2: Vec3 = [0, 1, 0];
  const rimDepth = w.kind === 'overshot' ? 0.34 : 0.3, rimT = w.kind === 'overshot' ? 0.08 : 0.09;
  for (const side of [-1, 1]) {
    const z = side * half;
    ringSolid(sink, 'structureWood', [0, 0, z - rimT / 2], ax, e1, e2, R - rimDepth, R, rimT, 24, { ...base, colour: w.wood });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 16, c = Math.cos(a), s = Math.sin(a);
      const r0 = 0.3, r1 = R - rimDepth + 0.04, rm = (r0 + r1) / 2;
      sink.box('structureWood', [c * rm, s * rm, z], [(r1 - r0) / 2, 0.07, 0.055], { ...base, colour: shade(w.wood, 1.08) },
        new LocalFrame([c, s, 0], [-s, c, 0], [0, 0, 1], [0, 0, 0]));
    }
  }
  sink.cylinder('structureMetal', [0, 0, -half - 0.06], 'z', 2 * half + 0.12, 0.34, 12, { ...base, colour: w.iron });
  if (w.kind === 'breast') {
    // the floats: 24 boards between the shrouds, standing a hand past the rims
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), rm = R - 0.22;
      sink.box('structureWood', [c * rm, s * rm, 0], [0.3, 0.025, half - 0.05], { ...base, colour: shade(w.boards, 0.82 + (k % 3) * 0.06) },
        new LocalFrame([c, s, 0], [-s, c, 0], [0, 0, 1], [0, 0, 0]));
    }
    return;
  }
  // the overshot's sole (the closed drum the buckets stand on) and its 24 buckets, each board raked forward from the
  // sole to the rim so it holds the launder's water down the wheel's turning side
  const rs = R - rimDepth + 0.02, n = 24, chord = Math.PI * rs / n + 0.006;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    sink.box('structureWood', [c * rs, s * rs, 0], [0.02, chord, half - rimT / 2 + 0.005], { ...base, colour: shade(w.boards, 0.78) },
      new LocalFrame([c, s, 0], [-s, c, 0], [0, 0, 1], [0, 0, 0]));
  }
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = a0 + 0.13;
    const p0: Vec3 = [Math.cos(a0) * (rs + 0.02), Math.sin(a0) * (rs + 0.02), 0], p1: Vec3 = [Math.cos(a1) * (R - 0.03), Math.sin(a1) * (R - 0.03), 0];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    sink.box('structureWood', [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0], [len / 2, 0.018, half - rimT / 2 + 0.005],
      { ...base, colour: shade(w.boards, 0.84 + (k % 3) * 0.06) }, new LocalFrame([ux, uy, 0], [-uy, ux, 0], [0, 0, 1], [0, 0, 0]));
  }
}

/** The wheel's oak axle along z from z0 to z1 at (0, 0), banded in iron at `bands`. */
export function millAxle(sink: PartSink, z0: number, z1: number, oak: Rgb, iron: Rgb, bands: readonly number[], solid = true): void {
  const base: EmitOptions = solid ? {} : { decor: true };
  sink.cylinder('structureWood', [0, 0, z0], 'z', z1 - z0, 0.17, 8, { ...base, colour: oak });
  for (const z of bands) sink.cylinder('structureMetal', [0, 0, z - 0.03], 'z', 0.06, 0.19, 8, { colour: iron, decor: true });
}

interface LaunderSpec {
  /** the trough's centre line at x, its floor's top at y, from z0 to z1 (along z) */
  x: number;
  y: number;
  z0: number;
  z1: number;
  /** inside width and side height */
  width: number;
  sides: number;
  wood: Rgb;
  solid: boolean;
  /** the water's depth in the trough (dressing), 0 for none */
  water: number;
}

/**
 * A launder along z: its plank floor and two side boards, a frame (a yoke: a bearer under the floor and two cleats up
 * the sides) every 1.1 m, and the water in it. The trough's ends are open: it pours over a wheel or meets a head.
 */
export function launder(sink: PartSink, l: LaunderSpec): void {
  const base: EmitOptions = l.solid ? {} : { decor: true };
  const hw = l.width / 2, t = 0.06, z0 = Math.min(l.z0, l.z1), z1 = Math.max(l.z0, l.z1);
  sink.span('structureWood', l.x - hw - t, l.y - t, z0, l.x + hw + t, l.y, z1, { ...base, colour: shade(l.wood, 0.86) });
  for (const s of [-1, 1]) sink.span('structureWood', l.x + s * hw, l.y, z0, l.x + s * (hw + t), l.y + l.sides, z1, { ...base, colour: l.wood });
  const frames = Math.max(2, Math.round((z1 - z0) / 1.1) + 1);
  for (let k = 0; k < frames; k++) {
    const z = z0 + 0.08 + (z1 - z0 - 0.16) * k / (frames - 1);
    sink.span('structureWood', l.x - hw - t - 0.05, l.y - t - 0.12, z - 0.05, l.x + hw + t + 0.05, l.y - t, z + 0.05, { colour: shade(l.wood, 0.78), decor: true });
    for (const s of [-1, 1]) {
      sink.span('structureWood', l.x + s * (hw + t), l.y - t - 0.12, z - 0.04, l.x + s * (hw + t + 0.05), l.y + l.sides, z + 0.04,
        { colour: shade(l.wood, 0.78), decor: true });
    }
  }
  if (l.water > 0) sink.quad('glass', [l.x - hw, l.y + l.water, z1], [l.x + hw, l.y + l.water, z1], [l.x + hw, l.y + l.water, z0], [l.x - hw, l.y + l.water, z0], { decor: true });
}

/**
 * A trestle across x at z: two posts from `foot` up to `top` at x ± spread, the cap beam over them and a raking brace
 * from one post's foot to the other's head.
 */
export function trestle(sink: PartSink, x: number, z: number, spread: number, foot: number, top: number, wood: Rgb, solid: boolean): void {
  const base: EmitOptions = solid ? {} : { decor: true };
  for (const s of [-1, 1]) sink.span('structureWood', x + s * spread - 0.07, foot, z - 0.07, x + s * spread + 0.07, top - 0.12, z + 0.07, { ...base, colour: wood });
  sink.span('structureWood', x - spread - 0.12, top - 0.12, z - 0.08, x + spread + 0.12, top, z + 0.08, { ...base, colour: shade(wood, 0.92) });
  const a: Vec3 = [x - spread + 0.07, foot + 0.35, z], b: Vec3 = [x + spread - 0.07, top - 0.3, z];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  sink.box('structureWood', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z + 0.1], [len / 2, 0.05, 0.03], { colour: shade(wood, 0.86), decor: true },
    new LocalFrame([ux, uy, 0], [-uy, ux, 0], [0, 0, 1], [0, 0, 0]));
}

/** A convex polygon extruded along `dir` by `depth`, wound so its caps face out whichever way the points run. */
export function orientedPrism(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], dir: Vec3, depth: number, opts: EmitOptions): void {
  const [a, b, c] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  sink.prism(bucket, n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0 ? pts : [...pts].reverse(), dir, depth, opts);
}

/**
 * Lapped weatherboards over a wall face (a mill's buck, a boarded store): courses `course` high from y0 to y1, each a
 * wedge thick at its foot and thin at its head so every course's lower edge stands proud of the one below it (the
 * shadow line a long view reads), cut round the face's openings and framed by them. Dressing over the wall's print.
 */
export function weatherboards(sink: PartSink, face: { origin: Vec3; u: Vec3; out: Vec3; width: number }, y0: number, y1: number,
  holes: ReadonlyArray<{ u0: number; u1: number; y0: number; y1: number }>, course: number, colour: Rgb, rng: () => number): void {
  const n = Math.max(1, Math.round((y1 - y0) / course)), h = (y1 - y0) / n, half = face.width / 2;
  const P = (u: number, y: number, o: number): Vec3 => [face.origin[0] + face.u[0] * u + face.out[0] * o, y + face.origin[1],
    face.origin[2] + face.u[2] * u + face.out[2] * o];
  for (let k = 0; k < n; k++) {
    const ya = y0 + k * h, yb = ya + h + 0.012;
    // the spans of this course clear of the openings (each opening keeps a hand of its frame bare)
    const cuts = holes.filter((o) => o.y0 - 0.06 < yb && o.y1 + 0.06 > ya).map((o): [number, number] => [o.u0 - 0.06, o.u1 + 0.06]).sort((p, q) => p[0] - q[0]);
    let cur = -half;
    const spans: Array<[number, number]> = [];
    for (const [a, b] of cuts) { if (a > cur) spans.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < half) spans.push([cur, half]);
    const tone = shade(colour, 0.88 + rng() * 0.18);
    for (const [a, b] of spans) {
      if (b - a < 0.08) continue;
      orientedPrism(sink, 'structureWood', [P(a, ya, 0), P(a, ya, 0.032), P(a, yb, 0.01), P(a, yb, 0)], face.u, b - a, { colour: tone, decor: true });
    }
  }
}

interface SailsSpec {
  /** the sails' tip radius, the heel (the lattice's first bar) and the bar pitch (m) */
  length: number;
  heel: number;
  pitch: number;
  /** the lattice's width on the trailing side of the stock, and the leading board's on the other */
  trailing: number;
  leading: number;
  /** the first sail's angle (radians, from +x toward +y) */
  phase: number;
  stock: Rgb;
  lattice: Rgb;
  iron: Rgb;
  /** the stock's section (m) */
  stockW: number;
}

/**
 * Four lattice sails in the frame's x-y plane, the windshaft along z: the two stocks crossing through the iron poll end
 * (the second a stock's depth in front of the first), and on each half-stock its sail — the sail bars across it from the
 * leading board to the trailing hemlath, the hemlaths along both edges, the heel and tip bars. Dressing.
 */
export function latticeSails(sink: PartSink, s: SailsSpec): void {
  const ex = { decor: true, exposed: true } as const, d = s.stockW;
  sink.span('structureMetal', -0.32, -0.32, -0.12, 0.32, 0.32, 2 * d + 0.12, { colour: s.iron, decor: true });
  for (let k = 0; k < 2; k++) {
    const a = s.phase + k * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a), z = k * d;
    sink.member('structureWood', [-c * s.length, -sn * s.length, z], [c * s.length, sn * s.length, z], d, d, [0, 0, 1], { colour: s.stock, ...ex }, 0);
  }
  for (let k = 0; k < 4; k++) {
    const a = s.phase + k * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a), px = -sn, py = c;
    const z = (k % 2) * d + d + 0.005;
    const at = (r: number, off: number): Vec3 => [c * r + px * off, sn * r + py * off, z];
    sink.member('structureWood', at(s.heel, s.trailing), at(s.length, s.trailing), 0.09, 0.07, [0, 0, 1], { colour: s.lattice, ...ex }, 0);
    sink.member('structureWood', at(s.heel, -s.leading), at(s.length, -s.leading), 0.07, 0.06, [0, 0, 1], { colour: s.lattice, ...ex }, 0);
    for (let r = s.heel; r <= s.length + 1e-6; r += s.pitch) {
      sink.member('structureWood', at(r, -s.leading - 0.03), at(r, s.trailing + 0.04), 0.06, 0.05, [0, 0, 1], { colour: s.lattice, ...ex }, 0);
    }
  }
}

/** A free timber from a to b (a brace, a tail pole), `w` square, every face kept: its frame turned to the line. */
export function beam(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, w: number, opts: EmitOptions): void {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-3) return;
  const ay: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  // the out axis square to the line (across the up direction, or across x for a near-vertical line)
  const ref: Vec3 = Math.abs(ay[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const c = [ay[1] * ref[2] - ay[2] * ref[1], ay[2] * ref[0] - ay[0] * ref[2], ay[0] * ref[1] - ay[1] * ref[0]];
  const cl = Math.hypot(c[0], c[1], c[2]);
  const az: Vec3 = [c[0] / cl, c[1] / cl, c[2] / cl];
  const ax: Vec3 = [ay[1] * az[2] - ay[2] * az[1], ay[2] * az[0] - ay[0] * az[2], ay[0] * az[1] - ay[1] * az[0]];
  sink.box(bucket, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w / 2, len / 2, w / 2], opts, new LocalFrame(ax, ay, az, [0, 0, 0]));
}

/**
 * A span from (x0, y0, z0) to (x1, y1, z1) with its long arrises eased by `c` (the r2 sweep's box-only share, Lane C
 * 2026-10-16): the octagonal section run along the span's longest side (a squared timber, a sawn plank, a dressed block).
 */
export function bevelSpan(sink: PartSink, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  c: number, opts: EmitOptions): void {
  const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const run = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
  const [a, b] = run === 0 ? [1, 2] : run === 1 ? [2, 0] : [0, 1];
  const k = Math.max(0.002, Math.min(c, Math.min(size[a], size[b]) * 0.33));
  const A0 = lo[a], A1 = hi[a], B0 = lo[b], B1 = hi[b];
  const sec: Array<[number, number]> = [[A1, B0 + k], [A1, B1 - k], [A1 - k, B1], [A0 + k, B1], [A0, B1 - k], [A0, B0 + k], [A0 + k, B0], [A1 - k, B0]];
  const pts: Vec3[] = sec.map(([pa, pb]) => { const v: [number, number, number] = [0, 0, 0]; v[a] = pa; v[b] = pb; v[run] = lo[run]; return v; });
  const dir: [number, number, number] = [0, 0, 0]; dir[run] = 1;
  orientedPrism(sink, bucket, pts, dir, size[run], opts);
}

/**
 * A member from `a` to `b` as PartSink.member lays it (`width` across, `depth` along `out`, standing `depth - embed` proud
 * of the line), its four long arrises eased (the r2 sweep's box-only share, Lane C 2026-10-16): a rolled section's
 * rounded edges, a sawn timber's eased arris; by a sixth of its section's smaller side, at most 3 cm.
 */
export function bevelMember(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, width: number, depth: number, out: Vec3,
  opts: EmitOptions & { ends?: boolean; exposed?: boolean } = {}, embed = 0.02): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-3) return;
  const ay: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const od = out[0] * ay[0] + out[1] * ay[1] + out[2] * ay[2];
  let on: Vec3 = [out[0] - ay[0] * od, out[1] - ay[1] * od, out[2] - ay[2] * od];
  const ol = Math.hypot(on[0], on[1], on[2]) || 1;
  on = [on[0] / ol, on[1] / ol, on[2] / ol];
  const ax: Vec3 = [ay[1] * on[2] - ay[2] * on[1], ay[2] * on[0] - ay[0] * on[2], ay[0] * on[1] - ay[1] * on[0]];
  const hw = width / 2, mid = depth / 2 - embed, hd = depth / 2, k = Math.max(0.002, Math.min(0.03, Math.min(width, depth) / 6));
  const sec: Array<[number, number]> = [[hw, -hd + k], [hw, hd - k], [hw - k, hd], [-hw + k, hd], [-hw, hd - k], [-hw, -hd + k], [-hw + k, -hd], [hw - k, -hd]];
  const pts: Vec3[] = sec.map(([u, v]) => [a[0] + ax[0] * u + on[0] * (mid + v), a[1] + ax[1] * u + on[1] * (mid + v), a[2] + ax[2] * u + on[2] * (mid + v)]);
  orientedPrism(sink, bucket, pts, ay, len, opts);
}
