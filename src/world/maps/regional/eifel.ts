// src/world/maps/regional/eifel.ts — the Eifel kit (Highland Reservoir: the Rur and Urft dams in the northern Eifel,
// Rurberg, Einruhr, the Monschau country). Black-and-white Fachwerk on ground storeys of grey-brown greywacke rubble,
// weather gables hung with dark Moselle slate, steep slate roofs, green shutters; the dam company's Wilhelminian
// buildings of quarry stone with rendered dressings under hipped slate with a ridge lantern; stone halls with arched
// cart doors. The Fachwerk builders are the Hessian kit's (hessian.ts) under the Eifel palette.
import { PartSink, faceBox, facePoint, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type UvMode, type Vec3 } from './geometry.ts';
import { buildHouse, roofCrown, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofGeometry, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bindFachwerk, type FachwerkPalette } from './hessian.ts';
import { facadeOn, trimRing, windowHead } from './facade.ts';
import { orientedPrism } from './millWorks.ts';
import { archGlazing, archHead } from './sarajevoParts.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const EIFEL_PALETTE: FachwerkPalette = Object.freeze({
  // Monschau framing is near black over white infill; some houses tar their timbers brown
  timbers: [0x3e352f, 0x463b33, 0x352e29, 0x55473b].map(rgb),
  frame: rgb(0xd2cec4),
  doors: [0x3f5f4a, 0x5a3a2a, 0x3e4e5a].map(rgb),
  shutters: [0x3f6a4c, 0x4b5f52].map(rgb),
  shutterShare: 0.45, hungGable: 0.55, stoneGround: 0.5, halfHip: 0.25,
});

const DRESSING = 'plaster3' as const;
/** (dome-detail-275) the iron of the anchors, the vane, the pipes; the oak of the hoist and the louvres */
const IRON = rgb(0x34383a), OAK = rgb(0x4a3a2c), GATE_GREEN = rgb(0x4a5a50);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const WINDOW: WindowStyle = {
  frame: rgb(0xd2cec4), frameWidth: 0.07, frameOut: 0.05, bars: 'six',
  surround: { bucket: DRESSING, width: 0.2, out: 0.07, lintel: 0.28 }, sill: { bucket: DRESSING, out: 0.12 }, shutters: null,
};

function companyDialect(rng: () => number): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...WINDOW, bars: 'cross' } : WINDOW, rng, 0.35),
    door: (sink, face, o, y0) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, GATE_GREEN, { bucket: DRESSING, width: 0.34, out: 0.1 });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x4a3a2c), frame: { bucket: DRESSING, width: 0.26, out: 0.09, arch: true },
        transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0);
    },
  };
}

// ------------------------------------------------------------------------------------------------ the slater's craft

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

/** A planar polygon wound so its normal looks toward `toward` (dome-detail-275). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
  sink.polygon(bucket, dot(n, toward) >= 0 ? pts : [...pts].reverse(), opts);
}

/**
 * A surface the slater hangs (dome-detail-275): a point `v` up it from its foot, `t` along it, `h` off it; `lim(v)` how
 * far either way along it the surface reaches at `v` (a hip's line or a spire's face closing it); `reach` its run.
 */
interface Slope { P: (v: number, t: number, h: number) => Vec3; n: Vec3; down: Vec3; along: Vec3; lim: (v: number) => number; reach: number }

/**
 * A plane trapezoid face as a Slope (dome-detail-275): from the middle of its foot `foot` to the middle of its head
 * `head`, its edges level along `along`, half `w0` wide at the foot and `w1` at the head; `outward` any vector off it.
 */
function faceSlope(foot: Vec3, head: Vec3, along: Vec3, w0: number, w1: number, outward: Vec3): Slope {
  const run = sub(head, foot), len = Math.hypot(run[0], run[1], run[2]), s = normalize3(run);
  let n = normalize3(cross(along, s));
  if (dot(n, outward) < 0) n = neg(n);
  return {
    P: (v, t, h) => [foot[0] + s[0] * v + along[0] * t + n[0] * h, foot[1] + s[1] * v + along[1] * t + n[1] * h, foot[2] + s[2] * v + along[2] * t + n[2] * h],
    n, down: neg(s), along, lim: (v) => w0 + (w1 - w0) * Math.min(1, Math.max(0, v / len)), reach: len,
  };
}

/**
 * The slope of a gable or hip roof's +x (side 1) or -x side, in the house's roof frame (house.ts roofGeometry: the
 * ridge along z), from its eave's edge on the covering's top; `end` a hip roof's end slope at +z (1) or -z (-1) instead
 * (dome-detail-275, after savoyard.ts roofSlope).
 */
function roofSlope(rg: RoofGeometry, roof: RoofSpec, side: 1 | -1, end: boolean): Slope {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), hip = rg.kind === 'hip';
  if (end) {
    const ye = rg.topAt(0, side * D) ?? rg.eaveY;
    return {
      P: (v, t, h) => [t, ye + sinP * v + cosP * h, side * (D - cosP * v + sinP * h)], n: [0, cosP, side * sinP], down: [0, -sinP, side * cosP], along: [1, 0, 0],
      lim: (v) => xe - cosP * Math.max(0, v), reach: (D - rg.ridgeHalf) / cosP,
    };
  }
  const ye = rg.topAt(side * xe, 0) ?? rg.eaveY;
  return {
    P: (v, t, h) => [side * (xe - cosP * v + sinP * h), ye + sinP * v + cosP * h, t], n: [side * sinP, cosP, 0], down: [side * cosP, -sinP, 0], along: [0, 0, 1],
    lim: (v) => (hip ? rg.ridgeHalf + xe - cosP * Math.max(0, v) : D), reach: xe / cosP,
  };
}

/**
 * One slate (or a run of them in one course) on a Slope (dome-detail-275): its butt `b` proud facing down the slope, its
 * face thinning up to the course over it, its ends cut where the surface closes; `under` its underside too (the eave's
 * course out past the edge).
 */
function slate(sink: PartSink, sl: Slope, v0: number, v1: number, t0: number, t1: number, b: number, o: EmitOptions, under: boolean): void {
  const la = sl.lim(v0), lc = sl.lim(v1);
  const a0 = Math.max(t0, -la), a1 = Math.min(t1, la), c0 = Math.max(t0, -lc), c1 = Math.min(t1, lc);
  if (a1 - a0 < 0.1 || c1 - c0 < 0.04 || v1 - v0 < 0.08) return;
  const P = sl.P, A0 = P(v0, a0, 0), A1 = P(v0, a1, 0), B0 = P(v0, a0, b), B1 = P(v0, a1, b), C0 = P(v1, c0, 0.006), C1 = P(v1, c1, 0.006);
  facing(sink, 'roof', [A0, A1, B1, B0], sl.down, o);
  facing(sink, 'roof', [B0, B1, C1, C0], sl.n, o);
  facing(sink, 'roof', [A0, B0, C0], neg(sl.along), o);
  facing(sink, 'roof', [A1, B1, C1], sl.along, o);
  if (under) facing(sink, 'roof', [A0, A1, C1, C0], neg(sl.n), o);
}

interface HangOpts {
  /** the course's gauge up the surface (m) */
  course: number;
  /** where the courses stop (v) */
  top: number;
  /** a slate run's mean length along the course (m) */
  run: number;
  /** the verge's column of slates (the Ortgang) at either end of a course, its width, or 0 */
  verge?: number;
  /** the foot's course (the Fußgebinde) thick, out past the edge, its underside seen */
  foot?: boolean;
  /** holes left open: [v0, v1, t0, t1] (a stripped patch, a window) */
  holes?: ReadonlyArray<readonly [number, number, number, number]>;
  butt?: number;
}

/**
 * Moselle slate hung in its courses over a Slope (dome-detail-275; the work list: "a smooth roof"; the roof bar: "roofs
 * in courses, in relief"): each course a run of slates of their own lengths and tones, its butt a finger proud of the
 * course over it and jogging a little (the old German cover's irregular courses); the foot's course a hand thick and
 * out past the edge; up a gable's rakes the verge's column of slates, darker; the holes (a stripped patch, a window)
 * left open. Dressing: the covering keeps the collision.
 */
function hang(sink: PartSink, sl: Slope, look: () => number, o: HangOpts): void {
  const uv: UvMode = { kind: 'plane', origin: sl.P(0, 0, 0), u: sl.along, v: sl.down };
  const butt = o.butt ?? 0.04;
  for (let k = 0, v = 0; v < o.top - 0.12; k++, v = k * o.course) {
    const foot = !!o.foot && k === 0;
    const vb = foot ? -0.06 : v, vt = Math.min(o.top, v + o.course * 1.3);
    const L = sl.lim(Math.max(0, vb));
    const cuts = (o.holes ?? []).filter((h) => vt > h[0] && vb < h[1]);
    const lay = (a: number, c: number, b: number, tone: number) => {
      let segs: Array<[number, number]> = [[a, c]];
      for (const h of cuts) segs = segs.flatMap(([s0, s1]): Array<[number, number]> => [[s0, Math.min(s1, h[2])], [Math.max(s0, h[3]), s1]]).filter(([s0, s1]) => s1 - s0 > 0.12);
      const jog = foot ? 0 : (look() - 0.5) * 0.05;
      for (const [s0, s1] of segs) slate(sink, sl, vb + jog, vt, s0, s1, b, { decor: true, uv, shade: tone }, foot);
    };
    let t0 = -L, t1 = L;
    if (o.verge) {
      lay(-L, -L + o.verge, butt + 0.015, 0.72 + look() * 0.1);
      lay(L - o.verge, L, butt + 0.015, 0.72 + look() * 0.1);
      t0 += o.verge; t1 -= o.verge;
    }
    for (let t = t0; t < t1 - 0.05;) {
      let w = o.run * (0.55 + look() * 0.9);
      if (t1 - t - w < 0.7) w = t1 - t;
      lay(t, t + w - 0.006, foot ? 0.07 : butt, (foot ? 0.78 : 0.88) + look() * 0.16);
      t += w;
    }
  }
}

/**
 * A house's slate roof in its courses (dome-detail-275): a gable's two slopes with their verges' columns, or a hip's
 * four slopes cut at the hips; war wear's stripped patch (HouseFrame.roofPatch) left open with its battens.
 */
function slateRoof(sink: PartSink, frame: HouseFrame, look: () => number, run: number): void {
  const rg = frame.roof, roof = frame.spec.roof, hip = rg.kind === 'hip' && rg.hipTan === undefined;
  if (rg.kind !== 'gable' && !hip) return;
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave, p = frame.roofPatch;
  const slopes: ReadonlyArray<readonly [1 | -1, boolean]> = hip ? [[1, false], [-1, false], [1, true], [-1, true]] : [[1, false], [-1, false]];
  for (const [side, end] of slopes) {
    const sl = roofSlope(rg, roof, side, end);
    const holes: Array<[number, number, number, number]> = [];
    if (p && !end && p.side === side) holes.push([(xe - p.x1) / cosP - 0.06, (xe - p.x0) / cosP + 0.06, p.z0 - 0.06, p.z1 + 0.06]);
    hang(sink, sl, look, { course: 0.42, top: sl.reach - 0.08, run, verge: rg.kind === 'gable' ? 0.42 : 0, foot: true, holes });
  }
}

/**
 * A ring of dressed voussoirs round a round head (dome-detail-275): `n` (odd) wedges standing `out` proud, each its own
 * tone, the keystone longer and a finger prouder; `ring` the voussoirs' depth from the intrados.
 */
function voussoirs(sink: PartSink, face: Face, u: number, spring: number, r: number, ring: number, n: number, out: number, look: () => number): void {
  const P = (a: number, rad: number): Vec3 => facePoint(face, u + Math.cos(a) * rad, spring + Math.sin(a) * rad, 0);
  const g = 0.012 / r;
  for (let j = 0; j < n; j++) {
    const a0 = Math.PI * j / n + g, a1 = Math.PI * (j + 1) / n - g, key = j === (n - 1) / 2;
    const rr = r + ring * (key ? 1.3 : j % 2 ? 0.86 : 1);
    orientedPrism(sink, DRESSING, [P(a0, r), P(a1, r), P(a1, rr), P(a0, rr)], face.out, key ? out + 0.035 : out, { decor: true, shade: 0.88 + look() * 0.16 });
  }
}

/** Long and short dressed stones up a corner of a body (dome-detail-275, after the office's rendered quoins). */
function quoins(sink: PartSink, b: HouseFrame['bodies'][number], y0: number, y1: number, look: () => number, step = 0.45): void {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    for (let y = y0, k = 0; y < y1 - 0.2; y += step, k++) {
      const lx = k % 2 ? 0.36 : 0.62, lz = k % 2 ? 0.62 : 0.36;
      sink.quoin(DRESSING, sx > 0 ? x - lx : x - 0.04, y, sz > 0 ? z - lz : z - 0.04, sx > 0 ? x + 0.04 : x + lx, y + step - 0.03, sz > 0 ? z + 0.04 : z + lz, sx, sz,
        { decor: true, shade: 0.92 + look() * 0.12 });
    }
  }
}

/**
 * A louvred opening (dome-detail-275): the dark behind, the frame and its slats of oak tilted down and out (fine
 * joinery), on a face at (u, y) its centre.
 */
function louvre(sink: PartSink, face: Face, u: number, y: number, w: number, h: number): void {
  faceBox(sink, 'dark', face, u, y, 0.01, w, h, 0.02, { decor: true });
  for (const s of [-1, 1]) faceBox(sink, 'structureWood', face, u + s * (w / 2 + 0.03), y, 0.03, 0.06, h + 0.06, 0.06, { colour: OAK, decor: true, fineSides: true });
  for (let k = 1, n = Math.max(2, Math.round(h / 0.16)); k < n; k++) {
    const yy = y - h / 2 + h * k / n;
    sink.member('structureWood', facePoint(face, u - w / 2, yy + 0.04, 0.01), facePoint(face, u + w / 2, yy + 0.04, 0.01), 0.1, 0.02,
      normalize3([face.out[0], 0.6, face.out[2]]), { colour: shade(OAK, 0.9), decor: true, fine: true }, 0);
  }
}

/** A weathervane on a finial (dome-detail-275): the rod, the ball, the banner of sheet iron, the cock's-tail cut. */
function vane(sink: PartSink, x: number, y: number, z: number, h: number, look: () => number): void {
  sink.cylinder('structureMetal', [x, y, z], 'y', h, 0.025, 6, { colour: IRON, decor: true });
  sink.revolve('structureMetal', [x, y + h * 0.3, z], 'y', [[0, 0.02], [0.03, 0.08], [0.09, 0.11], [0.15, 0.08], [0.18, 0.02]], 10, { colour: shade(IRON, 1.3), decor: true });
  const a = look() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
  facing(sink, 'structureMetal', [[x, y + h * 0.62, z], [x + ca * 0.55, y + h * 0.62, z + sa * 0.55], [x + ca * 0.62, y + h * 0.62 + 0.24, z + sa * 0.62], [x, y + h * 0.62 + 0.3, z]],
    [-sa, 0, ca], { colour: IRON, decor: true });
  facing(sink, 'structureMetal', [[x, y + h * 0.62, z], [x, y + h * 0.62 + 0.3, z], [x + ca * 0.62, y + h * 0.62 + 0.24, z + sa * 0.62], [x + ca * 0.55, y + h * 0.62, z + sa * 0.55]],
    [sa, 0, -ca], { colour: IRON, decor: true });
}

/**
 * A raised panel of dressed stone with its lettering (dome-detail-275): a slab standing proud, its moulded border and,
 * in it, the lines of cut letters as dark strokes (near fine detail).
 */
function inscription(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number): void {
  faceBox(sink, DRESSING, face, u, y, 0.035, w, h, 0.07, { decor: true, shade: 1.04 });
  faceBox(sink, DRESSING, face, u, y, 0.08, w - 0.16, h - 0.16, 0.02, { decor: true, shade: 0.94, fine: 'near' });
  const lines = h > 0.5 ? 2 : 1;
  for (let l = 0; l < lines; l++) {
    const yy = y + (lines > 1 ? (l ? -0.1 : 0.1) : 0), span = (w - 0.4) * (l ? 0.7 : 1);
    for (let x = -span / 2; x < span / 2 - 0.05;) {
      const wl = 0.035 + look() * 0.07;
      faceBox(sink, 'dark', face, u + x + wl / 2, yy, 0.092, wl, 0.08, 0.005, { decor: true, fine: 'near' });
      x += wl + 0.03 + (look() < 0.2 ? 0.07 : 0);
    }
  }
}

// ------------------------------------------------------------------------------------------------ the company's office

/**
 * A dormer on a roof slope (dome-detail-275): its front wall of rendered stone standing on the slope a little up from
 * the eave, a window in it, its cheeks slate-hung back into the roof, its little gabled roof in slate.
 */
function dormer(sink: PartSink, sl: Slope, tanP: number, vf: number, t: number, look: () => number, rng: () => number): void {
  const Q = sl.P(vf, t, 0), dh = normalize3([sl.down[0], 0, sl.down[2]]), ax = normalize3(cross([0, 1, 0], dh));
  const f: Face = { origin: [Q[0], 0, Q[2]], u: ax, out: dh, width: 1.5 };
  const wd = 1.5, yb = Q[1] - 0.05, yt = Q[1] + 1.75, rise = 0.62, ew = wd / 2 + 0.14, back = (yt + rise - Q[1]) / tanP + 0.35;
  faceBox(sink, 'roof', f, 0, (yb + yt) / 2, -back / 2 - 0.02, wd - 0.04, yt - yb, back, {}, { back: true, bottom: true });
  faceBox(sink, DRESSING, f, 0, (yb + yt) / 2, 0.01, wd, yt - yb, 0.06, { decor: true }, { back: true, bottom: true });
  const fw: Face = { ...f, origin: [Q[0] + dh[0] * 0.04, 0, Q[2] + dh[2] * 0.04] };
  windowUnit(sink, fw, 0, yb + 0.35, 0.9, 1.15, { ...WINDOW, surround: { bucket: DRESSING, width: 0.12, out: 0.05 }, bars: 'cross' }, rng, 0.25);
  // the front gable over it, and the two slopes of its roof back into the roof
  orientedPrism(sink, DRESSING, [facePoint(f, -wd / 2, yt, -0.02), facePoint(f, wd / 2, yt, -0.02), facePoint(f, 0, yt + rise - 0.06, -0.02)], dh, 0.06, { decor: true });
  for (const s of [-1, 1]) {
    const pts: Vec3[] = [facePoint(f, s * ew, yt - 0.05, 0.2), facePoint(f, 0, yt + rise, 0.2), facePoint(f, 0, yt + rise, -back), facePoint(f, s * ew, yt - 0.05, -back)];
    const up = normalize3([ax[0] * s * rise, ew, ax[2] * s * rise]);
    orientedPrism(sink, 'roof', pts, up, 0.07, { shade: 0.86 + look() * 0.12 });
  }
}

/**
 * The company's ridge lantern (dome-detail-275; the work list's note: a plain box under a pyramid): a Dachreiter on the
 * hip's apex, its slate-hung base out of the roof, its louvred belfry stage of painted boards with a cornice, the
 * bell-cast cap of slate, the ball and the weathervane.
 */
function ridgeLantern(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const top = frame.roof.ridgeTopY, a = 0.72, b = 0.56;
  roofCrown(sink, frame, { kind: 'lantern', x0: -a, x1: a, z0: -a, z1: a, y0: top - 0.9, y1: top + 4.2, bucket: 'roof' }, () => {
    sink.span('roof', -a, top - 0.9, -a, a, top + 0.7, a);
    // the base's sill board and the stage's cornice
    sink.band(DRESSING, -a - 0.05, top + 0.62, -a - 0.05, a + 0.05, top + 0.76, a + 0.05, { decor: true });
    sink.span(DRESSING, -b, top + 0.76, -b, b, top + 1.86, b);
    for (const [ox, oz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const f: Face = { origin: [ox * b, 0, oz * b], u: [oz, 0, -ox], out: [ox, 0, oz], width: 2 * b };
      louvre(sink, f, 0, top + 1.3, 0.5, 0.78);
    }
    sink.band(DRESSING, -b - 0.06, top + 1.86, -b - 0.06, b + 0.06, top + 1.98, b + 0.06, { decor: true });
    sink.band(DRESSING, -b - 0.12, top + 1.98, -b - 0.12, b + 0.12, top + 2.06, b + 0.12, { decor: true });
    // the bell-cast cap: the kick over the cornice, then the spire to its point
    const q = Math.SQRT2;
    sink.cylinder('roof', [0, top + 2.06, 0], 'y', 0.24, (b + 0.16) * q, 4, {}, (b - 0.02) * q, true, Math.PI / 4);
    sink.cylinder('roof', [0, top + 2.3, 0], 'y', 1.45, (b - 0.02) * q, 4, {}, 0.05, true, Math.PI / 4);
    vane(sink, 0, top + 3.6, 0, 0.95, look);
  });
}

/**
 * The company's door case (dome-detail-275): a portal standing proud of the front in rendered stone, the pilasters on
 * their bases either side of the door, the entablature with the company's lettered panel in its frieze, the cornice and
 * the segmental pediment over it; a boot scraper by the steps.
 */
function doorCase(sink: PartSink, face: Face, u: number, floor: number, doorW: number, look: () => number): void {
  // (`top` the frieze's middle, clear over the door frame's keystone)
  const pu = doorW / 2 + 0.5, top = floor + 3.78, out = 0.16, fr = 0.36;
  for (const s of [-1, 1]) {
    faceBox(sink, DRESSING, face, u + s * pu, floor + 0.15, out / 2 + 0.02, 0.48, 0.3, out + 0.04, { decor: true, shade: 0.95 });
    faceBox(sink, DRESSING, face, u + s * pu, (floor + 0.3 + top - fr / 2 - 0.16) / 2, out / 2, 0.38, top - fr / 2 - 0.16 - floor - 0.3, out, { decor: true });
    faceBox(sink, DRESSING, face, u + s * pu, top - fr / 2 - 0.08, out / 2 + 0.02, 0.48, 0.16, out + 0.04, { decor: true, shade: 0.95 });
  }
  const ew = 2 * pu + 0.6;
  faceBox(sink, DRESSING, face, u, top, out / 2, ew, fr, out, { decor: true });
  inscription(sink, { ...face, origin: facePoint(face, 0, 0, out) }, u, top, ew - 0.9, fr - 0.08, look);
  faceBox(sink, DRESSING, face, u, top + fr / 2 + 0.06, out / 2 + 0.07, ew + 0.2, 0.12, out + 0.14, { decor: true, shadow: true });
  const pts: Vec3[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = Math.PI * k / 8;
    pts.push(facePoint(face, u + Math.cos(t) * (ew / 2 + 0.05), top + fr / 2 + 0.12 + Math.sin(t) * 0.42, 0));
  }
  orientedPrism(sink, DRESSING, pts, face.out, out + 0.08, { decor: true, shade: 0.97 });
  // the boot scraper's iron blade between two posts beside the steps
  for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + pu + 0.55 + s * 0.13, 0.12, 0.45, 0.03, 0.24, 0.03, { colour: IRON, decor: true, fine: 'near' });
  faceBox(sink, 'structureMetal', face, u + pu + 0.55, 0.2, 0.45, 0.28, 0.02, 0.06, { colour: IRON, decor: true, fine: 'near' });
}

/**
 * The dam company's office: two storeys of quarry stone, rendered dressings, a hipped slate roof and a ridge lantern.
 * (dome-detail-275, the work list: "a smooth roof"; its presentation) Its slates in their courses round the hips; the
 * ridge lantern raised to a louvred Dachreiter with its bell-cast cap and vane; the dormers out of the slopes over the
 * first floor's bays; the second stack; the portal standing proud of the door with the company's lettered frieze and
 * its pediment.
 */
const companyOffice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const W = Math.max(10, Math.min(13, ctx.info.w - 0.6)), D = Math.max(11, Math.min(14, ctx.info.d - 0.6));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.8 }];
  for (const i of [0, 1]) for (const face of ['front', 'right', 'back', 'left'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    const avoid: Array<[number, number]> = face === 'front' && i === 0 ? [[-1.6, 1.6]] : [];
    for (const o of windowRhythm(face, i, width, { w: 1.05, h: i ? 1.6 : 1.8, sill: 0.95, spacing: 2.3, margin: 1.2, avoid })) openings.push(o);
  }
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'stone' }, { h: 3.3, wall: 'stone' }],
    roof: { kind: 'hip', pitchDeg: 38, eave: 0.55, verge: 0.55, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone',
    openings, chimneys: [{ x: W * 0.25, z: -D * 0.2, sx: 0.6, sz: 0.6, above: 1.0, bucket: 'stone', cap: 'slab' }, { x: -W * 0.25, z: D * 0.14, sx: 0.6, sz: 0.6, above: 1.0, bucket: 'stone', cap: 'slab' }],
    gutters: { colour: rgb(0x8c9193) }, verge: null,
  }, companyDialect(ctx.rng));
  // rendered quoins and a string course between the storeys
  const b = frame.bodies[0];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    for (let y = 0.7, k = 0; y < frame.eaveY - 0.3; y += 0.45, k++) {
      const lx = k % 2 ? 0.36 : 0.62, lz = k % 2 ? 0.62 : 0.36;
      sink.quoin(DRESSING, sx > 0 ? x - lx : x - 0.04, y, sz > 0 ? z - lz : z - 0.04, sx > 0 ? x + 0.04 : x + lx, y + 0.42, sz > 0 ? z + 0.04 : z + lz, sx, sz, { decor: true });
    }
  }
  sink.band(DRESSING, b.x0 - 0.06, frame.floors[1] - 0.1, b.z0 - 0.06, b.x1 + 0.06, frame.floors[1] + 0.12, b.z1 + 0.06, { decor: true });
  if (facadeOn()) {
    // the company's cornice under the hipped eaves, and hoods over the first floor's windows (facade craft)
    trimRing(sink, DRESSING, frame.bodies[1], frame.eaveY - 0.32, [{ h: 0.12, out: 0.06 }, { h: 0.08, out: 0.12 }, { h: 0.12, out: 0.2 }]);
    for (const o of frame.spec.openings) {
      if (o.storey !== 1 || o.kind !== 'window' || o.state) continue;
      windowHead(sink, frame.faces[o.face], o.u, frame.floors[1] + o.y0 + o.h + 0.28, o.w + 0.4, { kind: 'hood', bucket: DRESSING, h: 0.2, out: 0.12, ext: 0.02 });
    }
  }
  // (dome-detail-275) the slates in their courses round the hips
  slateRoof(sink, frame, look, 4);
  // (dome-detail-275) the dormers over the first floor's bays: two in the front slope, one in each of the others
  const rg = frame.roof, roof = frame.spec.roof, cosP = 1 / Math.hypot(1, rg.tanP);
  if (rg.kind === 'hip' && rg.hipTan === undefined) {
    const vf = roof.eave / cosP + 0.3;
    const front = frame.spec.openings.filter((o) => o.face === 'front' && o.storey === 1 && o.kind === 'window').map((o) => o.u).sort((p, q) => Math.abs(p - 2.3) - Math.abs(q - 2.3));
    const du = front.length ? Math.abs(front[0]) : 2.3;
    for (const [side, end, t] of [[1, true, du], [1, true, -du], [-1, true, 0], [1, false, 0], [-1, false, 0]] as const) {
      const sl = roofSlope(rg, roof, side, end);
      dormer(sink, sl, rg.tanP, vf, end && side > 0 ? t : 0, look, ctx.rng);
    }
  }
  // (dome-detail-275) the ridge lantern: a louvred Dachreiter under its bell-cast slate cap and vane
  ridgeLantern(sink, frame, look);
  // (dome-detail-275) the portal round the door
  doorCase(sink, frame.faces.front, 0, frame.floors[0], 1.5, look);
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the stone hall

/**
 * The hall's great cart door (dome-detail-275; the work list: "a blank gable"): the plank leaves in the rectangle under
 * the round head, the head boarded at the back of the reveal over a transom; the jambs of dressed stone in long and short
 * blocks, the imposts at the springing, the ring of voussoirs with its keystone; the wheel guards at the jambs' feet and
 * the cobbled ramp up to the threshold.
 */
function cartArch(sink: PartSink, face: Face, o: Opening, y0: number, look: () => number): void {
  const y = y0 + o.y0, r = o.w / 2, spring = y + o.h, back = -sink.recess + 0.03;
  gateUnit(sink, face, o.u, y, o.w, o.h, GATE_GREEN, { bucket: DRESSING, width: 0.06, out: 0.02 });
  const fan: Vec3[] = [facePoint(face, o.u, spring, back)];
  for (let k = 0; k <= 8; k++) fan.push(facePoint(face, o.u + Math.cos(Math.PI * k / 8) * (r - 0.01), spring + Math.sin(Math.PI * k / 8) * (r - 0.01), back));
  facing(sink, 'structureWood', fan, face.out, { colour: shade(GATE_GREEN, 0.78), decor: true });
  for (const du of [-0.5, 0, 0.5]) faceBox(sink, 'structureWood', face, o.u + du * r, spring + (Math.sqrt(1 - du * du) * r) / 2, back + 0.02, 0.09, Math.sqrt(1 - du * du) * r, 0.03, { colour: shade(GATE_GREEN, 0.68), decor: true, fine: true });
  faceBox(sink, 'structureWood', face, o.u, spring + 0.05, back + 0.05, o.w, 0.12, 0.08, { colour: OAK, decor: true });
  for (const s of [-1, 1]) {
    for (let yy = y, k = 0; yy < spring - 0.12; k++) {
      const hgt = Math.min(spring - 0.2 - yy, 0.42 + look() * 0.12), wl = k % 2 ? 0.3 : 0.5;
      if (hgt < 0.1) break;
      faceBox(sink, DRESSING, face, o.u + s * (r + wl / 2), yy + hgt / 2, 0.03, wl, hgt - 0.02, 0.06, { decor: true, shade: 0.9 + look() * 0.14 });
      yy += hgt;
    }
    faceBox(sink, DRESSING, face, o.u + s * (r + 0.28), spring - 0.1, 0.045, 0.6, 0.2, 0.09, { decor: true, shadow: true });
    // the wheel guard: a rounded post of stone a hand off the jamb's foot
    sink.cylinder('stone', facePoint(face, o.u + s * (r + 0.22), -0.1, 0.24), 'y', 0.85, 0.17, 8, { decor: true }, 0.1);
  }
  voussoirs(sink, face, o.u, spring, r, 0.5, 11, 0.07, look);
  // the cobbled ramp up to the threshold, its kerbs, from the yard
  const run = 1.05, hw = r + 0.55;
  orientedPrism(sink, 'stone', [facePoint(face, o.u - hw, -0.06, 0), facePoint(face, o.u - hw, -0.06, run), facePoint(face, o.u - hw, 0.03, run), facePoint(face, o.u - hw, y, 0.02)],
    face.u, 2 * hw, { decor: true, shade: 0.8 });
  for (const s of [-1, 1]) {
    orientedPrism(sink, DRESSING, [facePoint(face, o.u + s * hw - 0.07, -0.06, 0), facePoint(face, o.u + s * hw - 0.07, -0.06, run + 0.04), facePoint(face, o.u + s * hw - 0.07, 0.08, run + 0.04), facePoint(face, o.u + s * hw - 0.07, y + 0.07, 0.02)],
      face.u, 0.14, { decor: true, shade: 0.86 });
  }
}

/**
 * A stepped buttress against a wall (dome-detail-275): from below the ground its stages of [depth out of the wall, top],
 * each a hand narrower than the one under it, each offset weathered back to the next (the last to the wall) in a sloped
 * cap of dressed stone. The stages solid.
 */
function buttress(sink: PartSink, face: Face, u: number, w: number, stages: ReadonlyArray<readonly [number, number]>): void {
  let y = -0.3;
  stages.forEach(([d, top], i) => {
    const hw = w / 2 - i * 0.05, next = i + 1 < stages.length ? stages[i + 1][0] : 0;
    faceBox(sink, 'stone', face, u, (y + top) / 2, d / 2 - 0.02, 2 * hw, top - y, d + 0.04, {}, { back: true });
    orientedPrism(sink, DRESSING, [facePoint(face, u - hw - 0.01, top, next), facePoint(face, u - hw - 0.01, top, d + 0.02), facePoint(face, u - hw - 0.01, top + (d - next) * 0.9, next)],
      face.u, 2 * hw + 0.02, { decor: true, shade: 0.92 });
    y = top;
  });
}

/**
 * A stone hall: one tall storey of quarry stone under slate, arched cart doors, high windows (warehouses).
 * (dome-detail-275, the work list: "a blank gable and a long wall under a smooth roof; no quoins or coursing in relief")
 * The cart doors round-headed in dressed jambs and voussoirs, with their ramps and wheel guards; the long walls' high
 * lights round-headed in their rings, the slit vents under them, the stepped buttresses between the bays, a sill course
 * and a corbelled cornice under the eaves, the side door with its bench; the barred lights beside the front's cart door;
 * the corners chained in dressed stone; the front gable's loft door with the hoist
 * beam and pulley over it, the owl hole in the back one, the tie anchors; the slates in their courses with the verges'
 * columns; the two louvred ventilators on the ridge.
 */
const stoneHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // (dome-detail-275) the hall a little narrower on its plot, for the buttresses along its sides (their faces still
  // reach the plot's to within half a metre: regionalArchitecture.selftest's coverage), and a little shorter for the ramps
  const W = Math.max(9, Math.min(14, ctx.info.w - 2.0)), D = Math.max(14, Math.min(23, ctx.info.d - 1.0));
  const sideDoor = -(D / 2 - 2.6);
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 2.9, arch: {} },
    { face: 'back', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 2.6, arch: {} },
    { face: 'right', storey: 0, kind: 'door', u: sideDoor, w: 1.1, y0: 0, h: 2.2 },
  ];
  // (dome-detail-275) the barred lights either side of the front's cart door
  for (const s of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'window', u: s * (W / 2 - 2.0), w: 0.8, y0: 2.0, h: 0.9 });
  const piers: Array<{ face: 'left' | 'right'; u: number }> = [];
  for (const face of ['left', 'right'] as const) {
    const lights = windowRhythm(face, 0, D, { w: 1.2, h: 1.3, sill: 3.0, spacing: 3.4, margin: 1.8, avoid: face === 'right' ? [[sideDoor - 0.6, sideDoor + 0.6]] : [] })
      .map((o): Opening => ({ ...o, arch: {} }));
    openings.push(...lights);
    // the slit vents low in the wall under the lights; the buttresses between the bays, clear of the side door
    for (const o of lights) openings.push({ face, storey: 0, kind: 'loft', u: o.u, w: 0.16, y0: 0.9, h: 1.0 });
    const us = lights.map((o) => o.u).sort((p, q) => p - q);
    for (let i = 0; i + 1 < us.length; i++) {
      const m = (us[i] + us[i + 1]) / 2;
      if (face === 'right' && Math.abs(m - sideDoor) < 1.5) continue;
      piers.push({ face, u: m });
    }
  }
  // (dome-detail-275) the gables' openings: the loft door in the front one, the owl hole in the back one
  const holes = new Map<number, { u0: number; u1: number; y0: number; y1: number }>();
  const base = companyDialect(ctx.rng);
  const dialect: HouseDialect = {
    ...base,
    window: (s, face, o, y0) => {
      const y = y0 + o.y0;
      if (o.kind === 'loft') {
        // the slit: the dark of the hall behind, in dressed jambs, the lintel and the sill
        faceBox(s, 'dark', face, o.u, y + o.h / 2, -s.recess + 0.01, o.w, o.h, 0.02, { decor: true });
        for (const sd of [-1, 1]) faceBox(s, DRESSING, face, o.u + sd * (o.w / 2 + 0.09), y + o.h / 2, 0.02, 0.18, o.h + 0.2, 0.04, { decor: true, fineSides: true });
        faceBox(s, DRESSING, face, o.u, y + o.h + 0.08, 0.025, o.w + 0.5, 0.16, 0.05, { decor: true, fineSides: true });
        faceBox(s, DRESSING, face, o.u, y - 0.06, 0.03, o.w + 0.4, 0.12, 0.06, { decor: true });
        return;
      }
      if (!o.arch) {
        // the barred light beside the cart door
        windowUnit(s, face, o.u, y, o.w, o.h, { ...WINDOW, bars: 'grille' }, ctx.rng, 0.2);
        return;
      }
      // the high light, round-headed: the sash under the head, the fanlight in it, the jambs and the ring
      const r = o.w / 2, spring = y + o.h;
      windowUnit(s, face, o.u, y, o.w, o.h, { ...WINDOW, surround: null }, ctx.rng, 0.3);
      archGlazing(s, face, o.u, spring, r, WINDOW.frame);
      for (const sd of [-1, 1]) faceBox(s, DRESSING, face, o.u + sd * (r + 0.1), (y + spring) / 2, 0.02, 0.2, spring - y, 0.04, { decor: true, fineSides: true });
      archHead(s, face, o.u, spring, r, DRESSING, 0.2, 7);
      faceBox(s, DRESSING, face, o.u, spring + r + 0.1, 0.045, 0.22, 0.32, 0.09, { decor: true });
    },
    door: (s, face, o, y0, fr) => {
      if (o.kind === 'gate') cartArch(s, face, o, y0, look);
      else base.door(s, face, o, y0, fr);
    },
    gableOpenings: (face, poly) => {
      const side = face.out[2] > 0 ? 1 : -1, eave = poly[0][1], rise = Math.max(...poly.map(([, y]) => y)) - eave;
      const tan = rise / Math.max(...poly.map(([u]) => Math.abs(u)));
      const loft = side > 0, hw = loft ? 0.6 : 0.2, y0 = eave + (loft ? 0.5 : 1.6), top = Math.min(y0 + (loft ? 1.6 : 0.4), eave + rise - (hw + 0.1) * tan - 0.5);
      if (top - y0 < (loft ? 0.9 : 0.3)) return [];
      const h = { u0: -hw, u1: hw, y0, y1: top };
      holes.set(side, h);
      return [h];
    },
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: [{ h: 5.6, wall: 'stone' }],
    roof: { kind: 'gable', pitchDeg: 38, eave: 0.45, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone',
    openings, chimneys: [], gutters: { colour: rgb(0x8c9193) }, verge: null,
  }, dialect);
  const F = frame.faces, fl = frame.floors[0];
  // (dome-detail-275) the corners chained in dressed stone, long and short
  quoins(sink, frame.bodies[0], fl + 0.05, frame.eaveY, look);
  // (dome-detail-275) the sill course under the high lights and the corbelled cornice under the eaves, along both sides
  for (const f of [F.left, F.right]) {
    faceBox(sink, DRESSING, f, 0, fl + 2.93, 0.03, D, 0.14, 0.06, { decor: true });
    faceBox(sink, DRESSING, f, 0, frame.eaveY - 0.1, 0.09, D + 0.2, 0.2, 0.18, { decor: true, shadow: true });
    faceBox(sink, DRESSING, f, 0, frame.eaveY - 0.27, 0.045, D + 0.08, 0.14, 0.09, { decor: true });
  }
  // (dome-detail-275) the buttresses between the bays, in two offsets
  for (const p of piers) buttress(sink, F[p.face], p.u, 0.72, [[0.55, fl + 1.9 + look() * 0.2], [0.34, fl + 3.9]]);
  // (dome-detail-275) the gables' openings dressed: the loft door's plank leaves and its hoist, the owl hole's dark
  const rg = frame.roof;
  sink.recess = frame.gableReveal;
  try {
    for (const [side, h] of holes) {
      const g = side > 0 ? F.front : F.back, w = h.u1 - h.u0, ht = h.y1 - h.y0, bk = -sink.recess + 0.03;
      for (const sd of [-1, 1]) faceBox(sink, DRESSING, g, sd * (w / 2 + 0.1), h.y0 + ht / 2, 0.02, 0.2, ht + 0.2, 0.04, { decor: true, fineSides: true });
      faceBox(sink, DRESSING, g, 0, h.y1 + 0.1, 0.03, w + 0.56, 0.2, 0.06, { decor: true, fineSides: true });
      faceBox(sink, DRESSING, g, 0, h.y0 - 0.06, 0.04, w + 0.44, 0.12, 0.08, { decor: true });
      if (side < 0) { faceBox(sink, 'dark', g, 0, h.y0 + ht / 2, bk - 0.02, w, ht, 0.02, { decor: true }); continue; }
      for (const sd of [-1, 1]) {
        faceBox(sink, 'structureWood', g, sd * w / 4, h.y0 + ht / 2, bk, w / 2 - 0.02, ht - 0.02, 0.05, { colour: shade(GATE_GREEN, 0.9), decor: true });
        for (const t of [0.2, 0.8]) faceBox(sink, 'structureWood', g, sd * w / 4, h.y0 + ht * t, bk + 0.04, w / 2 - 0.1, 0.09, 0.03, { colour: shade(GATE_GREEN, 0.74), decor: true, fine: true });
      }
      // the hoist beam out of the gable's head, its pulley and rope
      const by = Math.min(rg.ridgeY - 0.5, h.y1 + 0.6), P = (o: number, yy: number) => facePoint(g, 0, yy, o);
      sink.member('structureWood', P(-0.25, by), P(0.75, by), 0.18, 0.18, [0, 1, 0], { colour: OAK, decor: true, exposed: true }, 0);
      sink.member('structureMetal', P(0.62, by + 0.03), P(0.62, by - 0.3), 0.03, 0.03, g.u, { colour: IRON, decor: true, exposed: true }, 0);
      sink.cylinder('structureMetal', facePoint(g, -0.03, by - 0.38, 0.62), 'x', 0.06, 0.11, 10, { colour: IRON, decor: true });
      sink.member('structureWood', P(0.62, by - 0.46), P(0.62, h.y0 - 0.6), 0.025, 0.025, g.u, { colour: rgb(0x8a7a5a), decor: true, fine: true }, 0);
    }
  } finally { sink.recess = 0; }
  // (dome-detail-275) the tie anchors' iron crosses on the gables at the tie beam's height
  for (const g of [F.front, F.back]) for (const u of [-W * 0.32, W * 0.32]) {
    faceBox(sink, 'structureMetal', g, u, frame.eaveY - 0.35, 0.02, 0.05, 0.5, 0.03, { colour: IRON, decor: true, fine: 'near' });
    faceBox(sink, 'structureMetal', g, u, frame.eaveY - 0.35, 0.035, 0.42, 0.05, 0.03, { colour: IRON, decor: true, fine: 'near' });
  }
  // (dome-detail-275) the stone bench by the side door: two blocks and the slab
  {
    const f = F.right, u = sideDoor + 1.6;
    for (const s of [-1, 1]) faceBox(sink, 'stone', f, u + s * 0.55, 0.22, 0.25, 0.22, 0.44, 0.4, { decor: true, shade: 0.9 });
    faceBox(sink, 'stone', f, u, 0.48, 0.27, 1.5, 0.08, 0.46, { decor: true, shade: 1.02 });
  }
  // (dome-detail-275) the slates in their courses
  slateRoof(sink, frame, look, 5);
  // (dome-detail-275) the ventilators on the ridge: slate-hung boxes, louvred both sides, under their own little roofs
  for (const z of [-D * 0.24, D * 0.24]) {
    const top = rg.ridgeTopY, a = 0.42, l = 0.7, hb = 0.75;
    roofCrown(sink, frame, { kind: 'turret', x0: -a, x1: a, z0: z - l, z1: z + l, y0: top - 0.45, y1: top + hb + 0.5, bucket: 'roof' }, () => {
      sink.span('roof', -a, top - 0.45, z - l, a, top + hb, z + l);
      for (const s of [-1, 1]) louvre(sink, { origin: [s * a, 0, z], u: [0, 0, -s], out: [s, 0, 0], width: 2 * l }, 0, top + hb / 2, 2 * l - 0.3, hb - 0.3);
      const ew = a + 0.14, rise = 0.42;
      for (const s of [-1, 1]) {
        orientedPrism(sink, 'roof', [[s * ew, top + hb - 0.05, z - l - 0.12], [s * ew, top + hb - 0.05, z + l + 0.12], [0, top + hb + rise, z + l + 0.12], [0, top + hb + rise, z - l - 0.12]],
          normalize3([s * rise, ew, 0]), 0.06, { shade: 0.86 + look() * 0.12 });
        facing(sink, 'roof', [[-a, top + hb, z + s * l], [a, top + hb, z + s * l], [0, top + hb + rise - 0.05, z + s * l]], [0, 0, s], { decor: true });
      }
    });
  }
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the waterworks' tower

/**
 * (the looks lane, 2026-10-13; LOOKS-BRIEF section 6: Highland Reservoir's water tower drawn by the generic builder) the
 * waterworks' tower of the Rur and Urft dams' villages (a Wasserturm of about 1905): an octagonal shaft of greywacke
 * rubble on a battered plinth with dressed quoins at its angles, its door and its stair slits; a corbel table under the
 * tank house, hung with Moselle slate; the conical slate cap with its lantern and finial.
 * (dome-detail-275: its details and presentation) The cordon over the batter; the corbels under the tank house, two
 * stepped stones to each face; the tank house's slates in their courses, its lights on the faces (they straddled the
 * angles), its sill and eave boards; the cap bell-cast, its slates in courses; the lantern louvred, the ball and the
 * vane; the date stone over the door; the paved apron round the foot, the rising main and the valve chamber's cover.
 */
const waterTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const half = Math.min(ctx.info.w, ctx.info.d) / 2;
  const R = Math.max(1.7, Math.min(2.4, half - 0.8)), H = 10.5, ph = Math.PI / 8;
  sink.cylinder('stone', [0, -0.4, 0], 'y', 1.2, R + 0.35, 8, {}, R + 0.18, true, ph);
  sink.cylinder('stone', [0, 0.8, 0], 'y', H - 0.8, R, 8, {}, R * 0.92, true, ph);
  // (dome-detail-275) the cordon where the batter meets the shaft
  sink.cylinder(DRESSING, [0, 0.74, 0], 'y', 0.18, R + 0.24, 8, { decor: true }, R + 0.2, true, ph);
  // the dressed quoins at the shaft's angles (the stone a shade lighter: the dressing render)
  for (let k = 0; k < 8; k++) {
    const a = ph + k * Math.PI / 4;
    for (let y = 1.0, j = 0; y < H - 0.6; y += 0.6, j++) {
      const rr = R * (1 - (y / H) * 0.08) + 0.02, l = j % 2 ? 0.22 : 0.36;
      sink.span(DRESSING, Math.cos(a) * rr - l / 2, y, Math.sin(a) * rr - l / 2, Math.cos(a) * rr + l / 2, y + 0.5, Math.sin(a) * rr + l / 2, { decor: true });
    }
  }
  // the corbel table and the tank house hung with slate, wider than the shaft
  const T = Math.max(R + 0.45, Math.min(3.2, half - 0.3)), ty = H + 0.35, th = 3.4;
  sink.cylinder('stone', [0, H - 0.1, 0], 'y', 0.45, R * 0.93, 8, { decor: true }, T * 0.98, true, ph);
  sink.cylinder('roof', [0, ty, 0], 'y', th, T, 8, {}, T, true, ph);
  // (dome-detail-275) a face of the octagon: its centre's bearing k * 45 degrees, at the apothem
  const side = (k: number, r: number): Face => {
    const a = k * Math.PI / 4;
    return { origin: [Math.cos(a) * r * Math.cos(ph), 0, Math.sin(a) * r * Math.cos(ph)], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 2 * r * Math.sin(ph) };
  };
  // (dome-detail-275) the corbels under the tank house: two to each face, each two stones stepping out under the table
  const Rt = R * 0.92;
  for (let k = 0; k < 8; k++) {
    const f = side(k, Rt);
    for (const u of [-0.32, 0.32]) {
      faceBox(sink, DRESSING, f, u * f.width, H - 0.42, 0.11, 0.26, 0.3, 0.22, { decor: true, shade: 0.94 });
      faceBox(sink, DRESSING, f, u * f.width, H - 0.17, 0.2, 0.3, 0.22, 0.4, { decor: true, shade: 0.98 });
    }
  }
  // (dome-detail-275) the tank house's sill board over the corbel table and its eave board under the cap
  sink.cylinder('structureWood', [0, ty - 0.02, 0], 'y', 0.16, T + 0.08, 8, { colour: OAK, decor: true }, T + 0.08, true, ph);
  sink.cylinder('structureWood', [0, ty + th - 0.22, 0], 'y', 0.22, T + 0.1, 8, { colour: OAK, decor: true }, T + 0.1, true, ph);
  // its lights on alternate faces (dome-detail-275: on the faces, not straddling the angles), the slates hung round them
  const lit = new Set([1, 3, 5, 7]);
  for (let k = 0; k < 8; k++) {
    const f = side(k, T), wy = ty + 1.2;
    if (lit.has(k)) windowUnit(sink, f, 0, wy, 0.55, 0.95, { ...WINDOW, surround: { bucket: 'structureWood', width: 0.08, out: 0.05, colour: OAK }, sill: { bucket: 'structureWood', out: 0.08, colour: OAK }, bars: 'cross' }, rng, 0.2);
    const sl = faceSlope(facePoint(f, 0, ty + 0.14, 0), facePoint(f, 0, ty + th - 0.22, 0), f.u, f.width / 2, f.width / 2, f.out);
    hang(sink, sl, look, { course: 0.3, top: sl.reach, run: 3, foot: true, butt: 0.035, holes: lit.has(k) ? [[1.2 - 0.14 - 0.35, 1.2 - 0.14 + 1.05, -0.38, 0.38]] : [] });
  }
  // the cap (dome-detail-275: bell-cast over the eave, then the cone to its lantern), its slates in courses
  const cy = ty + th, r0 = T + 0.4, r1 = T - 0.1, ch = 3.2;
  sink.cylinder('roof', [0, cy, 0], 'y', 0.5, r0, 8, {}, r1, true, ph);
  sink.cylinder('roof', [0, cy + 0.5, 0], 'y', ch - 0.5, r1, 8, {}, 0.45, true, ph);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a), ap = Math.cos(ph), hs = Math.sin(ph);
    const sl = faceSlope([c * r1 * ap, cy + 0.5, s * r1 * ap], [c * 0.45 * ap, cy + ch, s * 0.45 * ap], [-s, 0, c], r1 * hs, 0.45 * hs, [c, 0.3, s]);
    hang(sink, sl, look, { course: 0.34, top: sl.reach * 0.8, run: 4, butt: 0.035 });
  }
  // the lantern (dome-detail-275: louvred on its faces) and its cap, the ball and the vane
  const ly = cy + ch;
  sink.cylinder('roof', [0, ly, 0], 'y', 0.9, 0.42, 8, {}, 0.42, true, ph);
  for (const k of [0, 2, 4, 6]) louvre(sink, side(k, 0.42), 0, ly + 0.45, 0.2, 0.55);
  sink.cylinder('roof', [0, ly + 0.9, 0], 'y', 0.12, 0.56, 8, { decor: true }, 0.5, true, ph);
  sink.cylinder('roof', [0, ly + 1.02, 0], 'y', 0.9, 0.5, 8, {}, 0.04, true, ph);
  vane(sink, 0, ly + 1.8, 0, 1.0, look);
  // the door and its stair slits
  const door: Face = { origin: [0, 0, R * Math.cos(ph) + 0.01], u: [1, 0, 0], out: [0, 0, 1], width: 1.4 };
  doorUnit(sink, door, 0, 0.8, 1.05, 2.2, { leaf: rgb(0x3e4a42), frame: { bucket: DRESSING, width: 0.22, out: 0.16, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.8); // (the r2 sweep: the leaf in a 16 cm embrasure, not painted on the shaft)
  // (dome-detail-275) the date stone over the door: the waterworks' name and its year
  {
    const y = 3.75, at = R * (1 - 0.08 * (y - 0.8) / (H - 0.8)) * Math.cos(ph);
    inscription(sink, { ...door, origin: [0, 0, at] }, 0, y, 0.9, 0.42, look);
  }
  // (on the tapering shaft's face at their height)
  for (const y of [5.2, 7.6]) {
    const at = R * (1 - 0.08 * (y - 0.8) / (H - 0.8)) * Math.cos(ph);
    const slit: Face = { ...door, origin: [0, 0, at] };
    faceBox(sink, 'dark', slit, 0.2, y, 0.005, 0.14, 0.7, 0.02, { decor: true });
    // (props census r2 sweep, Lane C 2026-10-16: the slits were dark plates on the shaft) each in its dressed surround,
    // jambs, lintel and sill standing 13 cm proud, the slit at the back of its embrasure
    for (const s of [-1, 1]) faceBox(sink, DRESSING, slit, 0.2 + s * 0.12, y, 0.065, 0.1, 0.9, 0.13, { decor: true });
    for (const s of [-1, 1]) faceBox(sink, DRESSING, slit, 0.2, y + s * 0.4, 0.065, 0.34, 0.1, 0.13, { decor: true });
  }
  // (dome-detail-275) the paved apron round the foot, its kerb; the rising main out of the ground into the batter, its
  // flanges; the valve chamber's iron cover beside it
  {
    const ra = Math.min(half + 0.4, R + 1.05), ring: Vec3[] = [];
    for (let k = 0; k < 8; k++) ring.push([Math.cos(ph + k * Math.PI / 4) * ra, 0.04, Math.sin(ph + k * Math.PI / 4) * ra]);
    facing(sink, 'stone', ring, [0, 1, 0], { decor: true, ground: true, shade: 0.82 });
    for (let k = 0; k < 8; k++) {
      const p = ring[k], q = ring[(k + 1) % 8];
      sink.member('stone', [p[0], 0.02, p[2]], [q[0], 0.02, q[2]], 0.14, 0.1, [0, 1, 0], { decor: true, exposed: true, shade: 0.95 }, 0.06);
    }
    const a = -Math.PI / 2 - Math.PI / 4, c = Math.cos(a), s = Math.sin(a), rp = R + 0.3;
    sink.pipe('structureMetal', [c * (ra + 0.2), 0.07, s * (ra + 0.2)], [c * (rp - 0.15), 0.07, s * (rp - 0.15)], 0.13, 10, { colour: IRON, decor: true, caps: true });
    for (const t of [0.35, 0.75]) {
      const at: Vec3 = [c * (rp + (ra + 0.2 - rp) * t), 0.07, s * (rp + (ra + 0.2 - rp) * t)];
      sink.pipe('structureMetal', [at[0] - c * 0.03, at[1], at[2] - s * 0.03], [at[0] + c * 0.03, at[1], at[2] + s * 0.03], 0.19, 10, { colour: shade(IRON, 0.9), decor: true, caps: true });
    }
    const b = a + Math.PI / 2.6, cx = Math.cos(b) * (R + 0.72), cz = Math.sin(b) * (R + 0.72);
    sink.span('structureMetal', cx - 0.32, 0.03, cz - 0.32, cx + 0.32, 0.08, cz + 0.32, { colour: shade(IRON, 1.1), decor: true });
  }
  return sink.finish();
};

const EIFEL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  ...bindFachwerk(EIFEL_PALETTE, ['cottage', 'tavern', 'farmhouse', 'barn', 'granary', 'woodshed', 'depot', 'ruin', 'church', 'chapel', 'rangerlodge']),
  foundryoffice: companyOffice,
  warehouse: stoneHall,
  // (the looks lane, 2026-10-13) the waterworks' tower
  watertower: waterTower,
});

export const EIFEL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'eifel',
  region: 'Northern Eifel (Rur and Urft dams, Monschau country): black-and-white Fachwerk on greywacke under Moselle slate',
  surfaces: {
    roof: { kind: 'slate', tint: [0.27, 0.29, 0.32] },
    stone: { kind: 'greywacke', tint: [0.47, 0.45, 0.42] },
    // (buildings-270, the sourced-plaster class: under the photo set none of the map's render tones showed) the walls the
    // procedural limewash canvas, the primary family's tone measured on it against the reference photos (the white lime infill, #e5e0d4 (warmed: a neutral white read violet under the sky in round 2) against #efece4)
    sourced: { plaster: false, wood: true },
    render: { kind: 'limewash', seed: 0x3e52 },
    tones: { plaster: (_h, s, l) => [0.115, Math.min(1, s * 0.15 + 0.24), Math.min(1, l * 0.55 + 0.59)] },
  },
  builders: EIFEL_BUILDERS,
  // the yards: a plank fence round the kitchen garden and the woodshed, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [4.2, 5.1], garden: true },
});

export type { RegionalParts };
