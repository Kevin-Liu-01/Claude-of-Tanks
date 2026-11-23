// src/world/maps/regional/polder.ts — the Zeeland polder kit (Tidegate Polders: the Scheldt polders of Zeeland and
// Zeeuws-Vlaanderen). Farmhouses and labourers' cottages of red-brown Waal brick under steep orange pantiles, white
// sash frames with many lights, shutters painted green with white margins, a stack at each gable; the great
// Zeeuwse schuur, a barn of black-tarred weatherboard under a towering hipped thatch with a band of pantiles at the
// eaves and white-framed doors; a thatched smock mill with its stage; brick warehouses and a café on the dike road.
import { buildSmockMill } from './windmills.ts';
import {
  PartSink, faceBox, facePoint, normalize3, pick, rgb, shade, UV_MEMBER,
  type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, windowRhythm,
  type HoleRect, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofGeometry, type RoofPatch, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { facadeOn, roofDormers, thatchCourses, trimRun, windowHead } from './facade.ts';
import { orientedPrism } from './millWorks.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { polderPakhuis } from './harbourSheds.ts'; // props #25: the fish trade's pakhuis

const GREENS: readonly Rgb[] = [0x2f6a46, 0x3c7a52, 0x2a5a40].map(rgb);
const WHITE = rgb(0xd6d2c8);
const TAR = rgb(0x3a3733);
const DOORS: readonly Rgb[] = [0x2f6a46, 0x6a2a24, 0x2e4a66].map(rgb);

interface PolderState {
  rng: () => number;
  green: Rgb;
  door: Rgb;
  window: WindowStyle;
  litShare: number;
}

function stateFor(ctx: RegionalBuildContext): PolderState {
  const rng = ctx.rng;
  const green = pick(rng, GREENS);
  return {
    rng, green, door: pick(rng, DOORS),
    window: {
      frame: WHITE, frameWidth: 0.08, frameOut: 0.06, bars: 'six',
      surround: null, sill: { bucket: 'stone', out: 0.1 },
      shutters: rng() < 0.75 ? { colour: green, kind: 'panel', closed: 0.12 } : null,
    },
    litShare: 0.45,
  };
}

function dialect(st: PolderState): HouseDialect {
  return {
    window: (sink, face, o, y0) => {
      windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'cross' } : st.window,
        st.rng, o.kind === 'loft' ? 0.05 : st.litShare);
      // the segmental brick arch over the opening (a soldier course read; on a desktop build the arch itself, facade.ts)
      if (o.kind !== 'loft') {
        if (facadeOn()) windowHead(sink, face, o.u, y0 + o.y0 + o.h, o.w, { kind: 'segment', bucket: 'stone', h: 0.16, out: 0.05, ext: 0.12, rise: 0.1 });
        else faceBox(sink, 'stone', face, o.u, y0 + o.y0 + o.h + 0.11, 0.025, o.w + 0.24, 0.22, 0.05, { decor: true });
      }
    },
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, st.green, { bucket: 'structureWood', width: 0.16, out: 0.06, colour: WHITE });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: WHITE }, transom: o.h > 2.2,
        steps: { bucket: 'stone' }, leafKind: 'panel',
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const pantiles = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({
  kind, pitchDeg: pitch, eave: 0.3, verge: kind === 'hip' ? 0.3 : 0.12, thickness: 0.13, bucket: 'roof', ridge: 'round', hipFrac: 0.4,
});

/** Gable stacks: brick chimneys in the gable walls rising past the ridge (one or both ends). */
function gableStacks(sink: PartSink, rg: { ridgeTopY: number; halfD: number }, both: boolean, foot: number): void {
  for (const end of both ? [1, -1] : [1]) {
    const z = end * (rg.halfD - 0.35);
    sink.span('stone', -0.4, rg.ridgeTopY - 1.4, z - 0.3, 0.4, rg.ridgeTopY + 0.85, z + 0.3);
    sink.span('stone', -0.48, rg.ridgeTopY + 0.85, z - 0.38, 0.48, rg.ridgeTopY + 1.0, z + 0.38);
    // the breast down through the roof to the gable wall's head (the connectivity sweep: under a half-hip the stack
    // stood 0.2 m over the hip's slope)
    if (foot < rg.ridgeTopY - 1.4) sink.span('stone', -0.4, foot, z - 0.3, 0.4, rg.ridgeTopY - 1.4, z + 0.3, { decor: true });
  }
}

/**
 * A Zeeland house's eaves and gables (facade craft, desktop): the white-painted board gutter cornice (bakgoot) along
 * both eaves, and the wrought-iron wall anchors (muurankers) tying the gables back to the floor beams, a pair at the
 * attic floor of each gable.
 */
function zeelandEaves(sink: PartSink, frame: HouseFrame): void {
  for (const name of ['left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    trimRun(sink, 'structureWood', face, -half, half, frame.eaveY - 0.26, [{ h: 0.2, out: 0.06 }, { h: 0.06, out: 0.13 }], { colour: WHITE });
  }
  const iron: Rgb = [0.08, 0.08, 0.085];
  for (const name of ['front', 'back'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    for (const u of [-half * 0.55, half * 0.55]) {
      const y = frame.eaveY + 0.15;
      faceBox(sink, 'structureMetal', face, u, y, 0.02, 0.05, 0.62, 0.04, { colour: iron, decor: true });
      faceBox(sink, 'structureMetal', face, u, y + 0.22, 0.03, 0.22, 0.05, 0.03, { colour: iron, decor: true, fine: true });
      faceBox(sink, 'structureMetal', face, u, y - 0.22, 0.03, 0.22, 0.05, 0.03, { colour: iron, decor: true, fine: true });
    }
  }
}

/** The attic light in a brick gable over 2 m tall (brickHouse lays its unit; the house cuts it, gableOpenings). */
function atticLight(poly: Array<[number, number]>): HoleRect[] {
  const base = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
  return top - base > 2.0 ? [{ u0: -0.31, u1: 0.31, y0: base + 0.55, y1: base + 1.35 }] : [];
}

// ---- (dome-detail-275) the polder's roofs in relief, the warehouse's stepped gable, the yards' ground ----

const DEG = Math.PI / 180;
const IRON: Rgb = [0.08, 0.08, 0.085];
const ZINC: Rgb = [0.5, 0.52, 0.53];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg3 = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

/** A planar polygon wound to face `want` (dome-detail-275). */
function polyToward(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], want: Vec3, opts: EmitOptions): void {
  const u = sub3(pts[1], pts[0]), v = sub3(pts[2], pts[0]);
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  sink.polygon(bucket, dot3(n, want) >= 0 ? pts : [...pts].reverse(), opts);
}

/** One slope's top surface (dome-detail-275): its eave edge e0 → e1, its upper edge t0 (over e0's end) → t1, its normal. */
interface SlopeQuad { e0: Vec3; e1: Vec3; t0: Vec3; t1: Vec3; n: Vec3 }

/**
 * A slope laid out for courses (dome-detail-275): x along the eave from e0 (0..X), v up the fall line (0..L), h out of
 * the surface; its side edges (a verge stays at x = 0 / X, a hip line closes in) as x at height v.
 */
function slopeFrame(q: SlopeQuad) {
  const along = sub3(q.e1, q.e0), X = Math.hypot(along[0], along[1], along[2]);
  const a: Vec3 = [along[0] / X, along[1] / X, along[2] / X];
  const d0 = sub3(q.t0, q.e0), xt0 = dot3(d0, a);
  const upRaw: Vec3 = [d0[0] - a[0] * xt0, d0[1] - a[1] * xt0, d0[2] - a[2] * xt0], L = Math.hypot(upRaw[0], upRaw[1], upRaw[2]);
  const up: Vec3 = [upRaw[0] / L, upRaw[1] / L, upRaw[2] / L], xt1 = dot3(sub3(q.t1, q.e0), a), n = q.n;
  return {
    X, L, a, up, n, down: neg3(up),
    P: (x: number, v: number, h: number): Vec3 => [q.e0[0] + a[0] * x + up[0] * v + n[0] * h, q.e0[1] + a[1] * x + up[1] * v + n[1] * h,
      q.e0[2] + a[2] * x + up[2] * v + n[2] * h],
    left: (v: number): number => xt0 * v / L,
    right: (v: number): number => X + (xt1 - X) * v / L,
    /** how far up the slope a strip from x0 to x1 stays between the side edges */
    reach: (x0: number, x1: number): number => Math.min(xt0 > 1e-6 ? x0 * L / xt0 : Infinity, X - xt1 > 1e-6 ? (X - x1) * L / (X - xt1) : Infinity),
  };
}

/** The top surfaces of a gable roof's two slopes, or a hip roof's four, as house.ts emitRoof lays them (its own frame). */
function roofSlopes(rg: RoofGeometry, roof: RoofSpec): SlopeQuad[] {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, t = roof.thickness, e = roof.eave;
  const lo = rg.eaveY - e * rg.tanP, D = rg.halfD + roof.verge, xe = rg.s + e;
  const out: SlopeQuad[] = [];
  for (const side of [1, -1] as const) {
    const n: Vec3 = [side * sinP, cosP, 0], up = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
    const zr = rg.kind === 'gable' ? D : rg.ridgeHalf;
    out.push({ e0: up([side * xe, lo, -D]), e1: up([side * xe, lo, D]), t0: up([0, rg.ridgeY, -zr]), t1: up([0, rg.ridgeY, zr]), n });
  }
  // a hip at the main pitch with its verge as its eave (the schuur's foot): its end slopes close to the ridge's ends
  if (rg.kind === 'hip' && rg.hipTan === undefined && Math.abs(roof.verge - e) < 1e-6) {
    for (const end of [1, -1] as const) {
      const rise = rg.ridgeY - lo, run = D - rg.ridgeHalf, len = Math.hypot(rise, run);
      const n: Vec3 = [0, run / len, end * rise / len], up = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      const apex = up([0, rg.ridgeY, end * rg.ridgeHalf]);
      out.push({ e0: up([-xe, lo, end * D]), e1: up([xe, lo, end * D]), t0: apex, t1: apex, n });
    }
  }
  return out;
}

/** The pantiles' course up the slope and the pitch of their rolls across it (m; dome-detail-275). */
const PAN_COURSE = 0.3, PAN_ROW = 0.3;

/** A rectangle of a slope in its frame (x along the eave, v up the slope) left open: a war-stripped patch (dome-detail-275). */
interface SlopeHole { x0: number; x1: number; v0: number; v1: number }

/** The war's stripped patch (house.ts RoofPatch) on a gable slope from roofSlopes, in that slope's frame, or null. */
function patchHole(p: RoofPatch | null, q: SlopeQuad, rg: RoofGeometry, roof: RoofSpec): SlopeHole | null {
  if (!p || Math.sign(q.n[0]) !== p.side) return null;
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave, D = rg.halfD + roof.verge;
  return { x0: p.z0 + D, x1: p.z1 + D, v0: (xe - p.x1) / cosP, v1: (xe - p.x0) / cosP };
}

/**
 * Zeeland pantiles in relief (dome-detail-275; the work list: "the roof is a smooth slab"; the roof bar: "roofs in
 * courses, in relief"): on a slope's top surface the tiles' rolls down from the ridge to the eave, each roll's mouth dark
 * at the eave, its head under the ridge or along a hip; across them the courses' laps, each a finger proud of the course
 * below; every roll its own tone of the fired clay, now and then a tile slipped or a newer one let in. Dressing: the
 * slab keeps the collision. `vMax` stops the rolls part way up (under the schuur's thatch), `limit` (from the roll's
 * eave point) short of a dormer's front; over the war's stripped patch (`hole`) the rolls and laps stop at its edge,
 * each roll broken off a little short or long of its neighbours.
 */
function pantileRelief(sink: PartSink, q: SlopeQuad, look: () => number,
  opts: { vMax?: number; limit?: (p: Vec3) => number; hole?: SlopeHole | null } = {}): void {
  const f = slopeFrame(q);
  if (f.X < 0.6 || f.L < 0.6) return;
  const top = Math.min(f.L - 0.08, opts.vMax ?? Infinity), m = 0.1, segs = 3, hole = opts.hole ?? null;
  const uv = { kind: 'plane' as const, origin: q.e0, u: f.a, v: f.down };
  const rows = Math.max(2, Math.floor(f.X / PAN_ROW)), pitch = f.X / rows, r = Math.min(0.06, pitch * 0.23);
  const ring = (x: number, v: number, rr: number, lift: number): Vec3[] =>
    Array.from({ length: segs + 1 }, (_, i) => f.P(x + Math.cos(Math.PI * i / segs) * rr, v, lift + Math.sin(Math.PI * i / segs) * rr * 0.8));
  const run = (x: number, v0: number, v1: number, rr: number, lift: number, o: EmitOptions, mouth: number, head: boolean): void => {
    const lo = ring(x, v0, rr, lift), hi = ring(x, v1, rr, lift);
    for (let i = 0; i < segs; i++) {
      const th = Math.PI * (i + 0.5) / segs, want: Vec3 = [f.n[0] * Math.sin(th) + f.a[0] * Math.cos(th),
        f.n[1] * Math.sin(th) + f.a[1] * Math.cos(th), f.n[2] * Math.sin(th) + f.a[2] * Math.cos(th)];
      polyToward(sink, 'roof', [lo[i], lo[i + 1], hi[i + 1], hi[i]], want, o);
    }
    // the roll's mouth (dark in its hollow at the eave) and its head (left open under the ridge's cap)
    const b0 = f.P(x, v0, lift), b1 = f.P(x, v1, lift);
    for (let i = 0; i < segs; i++) {
      polyToward(sink, 'roof', [b0, lo[i], lo[i + 1]], f.down, { ...o, shade: mouth });
      if (head) polyToward(sink, 'roof', [b1, hi[i], hi[i + 1]], f.up, o);
    }
  };
  for (let k = 0; k < rows; k++) {
    const x = (k + 0.5) * pitch;
    const v1 = Math.min(top, f.reach(x - r - m, x + r + m), opts.limit ? opts.limit(f.P(x, 0, 0)) : Infinity);
    if (v1 < 0.3) continue;
    const tone = 0.78 + look() * 0.28, o: EmitOptions = { decor: true, uv, shade: tone }, mouth = k % 2 ? 0.48 : 0.56;
    // (a roll run up under the ridge's cap or into the thatch's butt shows no head)
    const headed = v1 < top - 1e-6;
    if (hole && x + r > hole.x0 && x - r < hole.x1) {
      const lo = hole.v0 - 0.03 - look() * 0.12, hi = hole.v1 + 0.03 + look() * 0.14;
      if (lo > 0.25) run(x, 0.02, lo, r, 0, o, mouth, true);
      if (v1 - hi > 0.2) run(x, hi, v1, r, 0, { ...o, shade: tone * 0.9 }, 0.6, headed);
      continue;
    }
    run(x, 0.02, v1, r, 0, o, mouth, headed);
    // a tile slipped a hand down its roll, or a newer one let in (its clay brighter)
    if (look() < 0.12 && v1 > 1.2) {
      const vs = PAN_COURSE * (1 + Math.floor(look() * (v1 / PAN_COURSE - 2)));
      run(x, vs, Math.min(v1, vs + PAN_COURSE), r * 1.06, 0.008, { decor: true, uv, shade: look() < 0.5 ? tone * 1.22 : tone * 0.7 }, 0.45, true);
    }
  }
  // the courses' laps across the rolls (split round the stripped patch)
  const butt = 0.024;
  const lap = (v: number, vb: number, a0: number, a1: number, c0: number, c1: number, o: EmitOptions): void => {
    if (a1 - a0 < 0.3 || c1 - c0 < 0.15) return;
    polyToward(sink, 'roof', [f.P(a0, v, 0), f.P(a1, v, 0), f.P(a1, v, butt), f.P(a0, v, butt)], f.down, { ...o, shade: 0.62 });
    polyToward(sink, 'roof', [f.P(a0, v, butt), f.P(a1, v, butt), f.P(c1, vb, 0), f.P(c0, vb, 0)], f.n, o);
    polyToward(sink, 'roof', [f.P(a0, v, 0), f.P(a0, v, butt), f.P(c0, vb, 0)], neg3(f.a), o);
    polyToward(sink, 'roof', [f.P(a1, v, 0), f.P(a1, v, butt), f.P(c1, vb, 0)], f.a, o);
  };
  for (let v = PAN_COURSE; v < top - 0.1; v += PAN_COURSE) {
    const vb = v + PAN_COURSE * 0.8;
    const a0 = f.left(v) + m, a1 = f.right(v) - m, c0 = f.left(vb) + m, c1 = f.right(vb) - m;
    const o: EmitOptions = { decor: true, uv, shade: 0.8 + look() * 0.16 };
    if (hole && vb > hole.v0 && v < hole.v1) {
      const h0 = hole.x0 - 0.02, h1 = hole.x1 + 0.02;
      lap(v, vb, a0, Math.min(a1, h0), c0, Math.min(c1, h0), o);
      lap(v, vb, Math.max(a0, h1), a1, Math.max(c0, h1), c1, o);
    } else lap(v, vb, a0, a1, c0, c1, o);
  }
}

/**
 * The tumbled brick courses (vlechtingen) up both rakes of a brick gable (dome-detail-275, as the farmhouse's road
 * gable carries them): a band a hand proud of the gable's brick, laid square to the rake.
 */
function vlechtingen(sink: PartSink, face: Face, gable: ReadonlyArray<readonly [number, number]>): void {
  const top = Math.max(...gable.map(([, y]) => y)), base = gable[0][1], half = Math.max(...gable.map(([u]) => Math.abs(u)));
  if (top - base < 1.6) return;
  for (const side of [-1, 1]) {
    const a = facePoint(face, side * (half - 0.25), base + 0.05, 0), b = facePoint(face, 0, top - 0.25, 0);
    sink.member('stone', a, b, 0.32, 0.035, face.out, { decor: true, shade: 1.06 }, 0);
  }
}

/**
 * A cart ramp (dome-detail-275: "set into the ground"): brick laid on edge from a gate's sill at `sill` over the wall
 * plinth down to the ground `run` out, `w` wide, on a face. Dressing.
 */
function cartRamp(sink: PartSink, face: Face, u: number, w: number, sill: number, run: number): void {
  const p = (o: number, y: number): Vec3 => facePoint(face, u - w / 2, y, o);
  orientedPrism(sink, 'stone', [p(-0.03, sill), p(-0.03, -0.05), p(run, -0.05)], face.u, w, { decor: true, tint: [0.84, 0.8, 0.77] });
}

/**
 * A Zeeland stepped gable (trapgevel; dome-detail-275, the work list: "the gable and back are blank"): on the gable wall
 * at z = end·halfD, the brick steps rising past the roof's line to the apex, each capped by its brick-on-edge course
 * (rollaag), standing a hand proud of the verge so the tiles die into it; the kneelers at the eaves on their corbels.
 * Dressing over the gable wall (the wall keeps the collision).
 */
function trapgevel(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, end: 1 | -1, look: () => number): void {
  const tT = roof.thickness * Math.hypot(1, rg.tanP), yTop = (x: number): number => rg.ridgeY + tT - Math.abs(x) * rg.tanP;
  const zIn = end * (rg.halfD - 0.26), zOut = end * (rg.halfD + roof.verge + 0.05);
  const za = Math.min(zIn, zOut), zb = Math.max(zIn, zOut);
  const N = Math.max(3, Math.round(rg.s / 0.8)), w = (rg.s + 0.06) / (N + 0.5);
  for (let k = 0; k <= N; k++) {
    for (const side of k ? [1, -1] : [1]) {
      const xi = k ? w / 2 + (k - 1) * w : 0, xo = k ? xi + w : w / 2;
      const topY = k ? yTop(xi) + 0.22 + look() * 0.04 : yTop(0) + 0.6, bot = yTop(xo) - tT - 0.08;
      const x0 = k ? Math.min(side * xi, side * xo) : -xo, x1 = k ? Math.max(side * xi, side * xo) : xo;
      sink.span('stone', x0, bot, za, x1, topY, zb, { decor: true });
      // the rollaag, a little over the step all round
      sink.span('stone', x0 - 0.035, topY, za - 0.03, x1 + 0.035, topY + 0.1, zb + 0.03, { decor: true, shade: 0.74 });
      // the kneeler's corbel under the outermost step
      if (k === N) {
        const xc = side > 0 ? x1 : x0;
        sink.span('stone', Math.min(xc, xc - side * w * 0.7), bot - 0.28, za, Math.max(xc, xc - side * w * 0.7), bot + 0.02, zb, { decor: true, shade: 0.86 });
      }
    }
  }
}

/** The labourer's cottage / farmhouse: brick, one storey and attic, gable to the road, pantiles. */
function brickHouse(ctx: RegionalBuildContext, opts: { farm?: boolean; storeys?: number } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const W = Math.max(5.2, ctx.info.w - 0.3), D = Math.max(7.0, ctx.info.d - 0.3);
  const count = opts.storeys ?? 1;
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) sts.push({ h: i === 0 ? 2.9 : 2.6, wall: 'stone' });
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: opts.farm ? 0 : W * 0.22, w: 1.0, y0: 0, h: 2.15 }];
  sts.forEach((_, i) => {
    for (const face of ['front', 'right', 'left', 'back'] as const) {
      const width = face === 'front' || face === 'back' ? W : D;
      const avoid: Array<[number, number]> = openings.filter((o) => o.face === face && o.storey === i).map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      for (const o of windowRhythm(face, i, width, { w: 0.95, h: 1.35, sill: 0.8, spacing: face === 'front' ? 1.9 : 2.5, margin: 0.9, avoid, max: face === 'back' ? 2 : 4 })) openings.push(o);
    }
  });
  // the attic's two gable lights
  const roof = opts.farm ? pantiles(50 + rng() * 4, rng() < 0.6 ? 'halfhip' : 'gable') : pantiles(48 + rng() * 6);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: sts, roof, gableBucket: 'stone', openings,
    chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: roof.kind === 'gable' ? { colour: WHITE, bucket: 'structureWood' } : null,
    // (props census E2, lane B 2026-10-14: the attic lights were glass laid on the gable's brick) cut through the gable
  }, { ...dialect(st), gableOpenings: (_face, poly) => atticLight(poly) });
  gableStacks(sink, frame.roof, opts.farm === true || rng() < 0.4, frame.eaveY);
  if (facadeOn()) zeelandEaves(sink, frame);
  if (frame.roof.gable) {
    const g = frame.roof.gable, top = Math.max(...g.map(([, y]) => y));
    if (top - frame.eaveY > 2.0) {
      for (const name of ['front', 'back'] as const) {
        sink.recess = frame.gableReveal;
        try {
          windowUnit(sink, frame.faces[name], 0, frame.eaveY + 0.55, 0.62, 0.8, { ...st.window, shutters: null }, st.rng, 0.25);
        } finally { sink.recess = 0; }
      }
    }
  }
  return sink.finish();
}

/**
 * The Zeeland farm (props census #15, Lane C 2026-10-16: "the two 15.5 m gable triangles carry one 0.62 x 0.8 m light
 * and two anchor pairs each: huge blank brick planes"), re-proportioned as the farmstead: the dwelling (voorhuis) gable
 * to the road at one side of the plot and the long, lower barn (schuur) across the back, its free front to the yard with
 * the cart doors, the stable door and lights, small stable lights along its back. Two house bodies (the damage reads
 * both). The dwelling's road gable carries two attic lights and the owl hole under the apex behind its white board and
 * makelaar, the tumbled brick courses (vlechtingen) up its rakes and the anchors; the barn's gables their hay hatches.
 * A plot too narrow for the two stands as the one brick house it was.
 */
function boerderij(ctx: RegionalBuildContext): RegionalParts {
  const W = Math.max(5.2, ctx.info.w - 0.3), D = Math.max(7.0, ctx.info.d - 0.3);
  if (W < 10.5) return brickHouse(ctx, { farm: true });
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const Wv = clampTo(W * 0.56, 6.2, 7.8), Dw = clampTo(D * 0.44, 3.8, 4.8), Dv = D - Dw + 0.3;
  const xv = -W / 2 + Wv / 2, zv = D / 2 - Dv / 2, zw = -D / 2 + Dw / 2;
  const iron: Rgb = [0.08, 0.08, 0.085];
  // the dwelling: its door and lights to the road, lights down its outer side and to the yard, the yard door
  const vo: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: -Wv * 0.18, w: 1.0, y0: 0, h: 2.15 }];
  vo.push(...windowRhythm('front', 0, Wv, { w: 0.95, h: 1.35, sill: 0.8, spacing: 1.9, margin: 0.9, avoid: [[-Wv * 0.18 - 0.5, -Wv * 0.18 + 0.5]], max: 3 }));
  vo.push(...windowRhythm('left', 0, Dv - 0.3, { w: 0.95, h: 1.35, sill: 0.8, spacing: 2.4, margin: 0.9, max: 2 }).map((o) => ({ ...o, u: o.u - 0.15 })));
  vo.push({ face: 'right', storey: 0, kind: 'door', u: -Dv * 0.12, w: 0.95, y0: 0, h: 2.05 });
  vo.push({ face: 'right', storey: 0, kind: 'window', u: Dv * 0.24, w: 0.95, y0: 0.8, h: 1.35 });
  const holes = new Map<'front' | 'back', HoleRect[]>();
  const gableHoles = (front: boolean, poly: Array<[number, number]>): HoleRect[] => {
    const base = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
    if (top - base < 2.0) return [];
    const out: HoleRect[] = front
      ? [-Wv * 0.2, Wv * 0.2].map((c) => ({ u0: c - 0.31, u1: c + 0.31, y0: base + 0.55, y1: base + 1.35 }))
      : [{ u0: -0.31, u1: 0.31, y0: base + 0.55, y1: base + 1.35 }];
    if (front && top - base > 3.4) out.push({ u0: -0.16, u1: 0.16, y0: top - 1.35, y1: top - 1.0 });
    holes.set(front ? 'front' : 'back', out);
    return out;
  };
  const roof = pantiles(50 + rng() * 4);
  sink.placed(0, xv, 0, zv, () => {
    const frame = buildHouse(sink, {
      w: Wv, d: Dv, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.9, wall: 'stone' }], roof, gableBucket: 'stone', openings: vo,
      chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: { colour: WHITE, bucket: 'structureWood' },
    }, { ...dialect(st), gableOpenings: (face, poly) => gableHoles(face.out[2] > 0, poly) });
    gableStacks(sink, frame.roof, true, frame.eaveY);
    if (facadeOn()) zeelandEaves(sink, frame);
    // the gables' lights (the owl hole left open behind its board)
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name];
      sink.recess = frame.gableReveal;
      try {
        for (const h of holes.get(name) ?? []) {
          if (h.u1 - h.u0 < 0.5) continue;
          windowUnit(sink, face, (h.u0 + h.u1) / 2, h.y0, h.u1 - h.u0, h.y1 - h.y0, { ...st.window, shutters: null }, st.rng, 0.25);
        }
      } finally { sink.recess = 0; }
    }
    const g = frame.roof.gable;
    if (g) {
      const top = Math.max(...g.map(([, y]) => y)), base = g[0][1], half = Math.max(...g.map(([u]) => Math.abs(u)));
      const f = frame.faces.front;
      // the tumbled courses up both rakes, a hand proud of the gable's brick, and the white makelaar and owl board
      for (const side of [-1, 1]) {
        const a = facePoint(f, side * (half - 0.25), base + 0.05, 0.0), b = facePoint(f, 0, top - 0.25, 0.0);
        sink.member('stone', a, b, 0.32, 0.035, f.out, { decor: true, shade: 1.06 }, 0);
      }
      if (top - base > 3.4) {
        faceBox(sink, 'structureWood', f, 0, top - 0.75, 0.04, 0.16, 1.2, 0.05, { colour: WHITE, decor: true });
        for (const side of [-1, 1]) faceBox(sink, 'structureWood', f, side * 0.29, top - 1.18, 0.03, 0.26, 0.5, 0.03, { colour: WHITE, decor: true });
      }
      // a second pair of anchors lower on the road gable
      for (const u of [-half * 0.3, half * 0.3]) faceBox(sink, 'structureMetal', f, u, base + 1.75, 0.02, 0.05, 0.5, 0.04, { colour: iron, decor: true });
    }
  });
  // the barn across the plot's back, built a quarter turned: its ridge along the plot's x, its long front (its left
  // face) to the yard, its back (right) along the plot's back
  const free0 = -W / 2 + Wv, free = W / 2 - free0, fc = (free0 + W / 2) / 2;
  const wo: Opening[] = [];
  if (free > 4.4) {
    wo.push({ face: 'left', storey: 0, kind: 'gate', u: fc - 0.6, w: 2.8, y0: 0, h: 2.55 });
    wo.push({ face: 'left', storey: 0, kind: 'door', u: Math.min(W / 2 - 0.9, fc + 1.6), w: 0.95, y0: 0, h: 1.95 });
  } else wo.push({ face: 'left', storey: 0, kind: 'door', u: fc, w: 1.0, y0: 0, h: 1.95 });
  wo.push(...windowRhythm('right', 0, W, { w: 0.6, h: 0.45, sill: 1.45, spacing: 2.6, margin: 1.2, max: 4, kind: 'loft' }));
  wo.push({ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.0, y0: 0, h: 1.95 });
  const barnHoles = (poly: Array<[number, number]>): HoleRect[] => {
    const base = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
    return top - base > 1.6 ? [{ u0: -0.42, u1: 0.42, y0: base + 0.3, y1: base + 1.15 }] : [];
  };
  sink.placed(Math.PI / 2, 0, 0, zw, () => {
    const frame = buildHouse(sink, {
      w: Dw, d: W, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.4, wall: 'stone' }], roof: pantiles(45), gableBucket: 'stone', openings: wo,
      chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: { colour: WHITE, bucket: 'structureWood' },
    }, { ...dialect(st), gableOpenings: (_face, poly) => barnHoles(poly) });
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name], g = frame.roof.gable;
      if (!g) continue;
      for (const h of barnHoles(g)) {
        sink.recess = frame.gableReveal;
        try {
          doorUnit(sink, face, 0, h.y0, h.u1 - h.u0, h.y1 - h.y0, { leaf: TAR, frame: { bucket: 'structureWood', width: 0.08, out: 0.05, colour: WHITE }, steps: null, leafKind: 'plank' });
        } finally { sink.recess = 0; }
      }
    }
  });
  return sink.finish();
}

/**
 * The tarred boards of a timber body (potdekselwerk; the props census #17, 2026-10-15): each lapped board's lower edge a
 * shadow line every 19 cm, broken round the openings and their white frames, raked under a gable's verges, and a tarred
 * corner board at every corner (dressing: the body's wall carries the collision).
 */
function tarBoards(sink: PartSink, frame: HouseFrame, mobile: boolean): void {
  const y0 = frame.floors[0], y1 = frame.eaveY;
  const line = { colour: shade(TAR, 0.62), decor: true, fine: true } as const;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    faceBox(sink, 'structureWood', face, -half + 0.08, (y0 + y1) / 2, 0.025, 0.16, y1 - y0, 0.04, { colour: shade(TAR, 0.85), decor: true }, 'caps');
    faceBox(sink, 'structureWood', face, half - 0.08, (y0 + y1) / 2, 0.025, 0.16, y1 - y0, 0.04, { colour: shade(TAR, 0.85), decor: true }, 'caps');
    if (mobile) continue;
    const holes = frame.spec.openings.filter((o) => o.face === name)
      .map((o) => [o.u - o.w / 2 - 0.16, o.u + o.w / 2 + 0.16, frame.floors[o.storey] + o.y0 - 0.12, frame.floors[o.storey] + o.y0 + o.h + 0.16] as const);
    for (let y = y0 + 0.19; y < y1 - 0.06; y += 0.19) {
      const cuts = holes.filter(([, , a, b]) => y > a && y < b).map(([a, b]) => [a, b] as const).sort((p, q) => p[0] - q[0]);
      let cur = -half + 0.17;
      for (const [a, b] of [...cuts, [half - 0.17, half - 0.17] as const]) {
        if (a - cur > 0.15) faceBox(sink, 'structureWood', face, (cur + a) / 2, y, 0.01, a - cur, 0.024, 0.02, line, 'ends');
        cur = Math.max(cur, b);
      }
    }
  }
  const g = frame.roof.gable;
  if (!g || mobile) return;
  const top = Math.max(...g.map(([, y]) => y)), s = frame.roof.s, tanP = frame.roof.tanP;
  for (const name of ['front', 'back'] as const) {
    const face = frame.faces[name];
    for (let y = y1 + 0.19; y < top - 0.25; y += 0.19) {
      const half = Math.min(s, s - (y - y1) / tanP) - 0.12;
      if (half > 0.2) faceBox(sink, 'structureWood', face, 0, y, 0.01, 2 * half, 0.024, 0.02, line, 'ends');
    }
  }
}

/**
 * A stall hatch shut in its white frame at the back of the opening's reveal (the schuur's and the tar shed's windows):
 * two tarred ledged leaves, their strap hinges, the bar across them.
 */
function stallHatch(sink: PartSink, face: Face, o: Opening, y0: number): void {
  const r = sink.recess, go = r > 0 ? -r + 0.03 : 0.02, y = y0 + o.y0, w = o.w, h = o.h, u = o.u;
  const fo = { colour: WHITE, decor: true, fineSides: true as const };
  for (const side of [-1, 1]) {
    faceBox(sink, 'structureWood', face, u + side * (w / 2 - 0.04), y + h / 2, go + 0.03, 0.08, h, 0.06, fo);
    faceBox(sink, 'structureWood', face, u + side * w / 4, y + h / 2, go, w / 2 - 0.09, h - 0.12, 0.035, { colour: shade(TAR, 0.95 + side * 0.04), decor: true, uv: UV_MEMBER });
    for (const t of [0.22, 0.78]) faceBox(sink, 'structureMetal', face, u + side * (w / 2 - 0.2), y + h * t, go + 0.022, 0.24, 0.035, 0.01, { colour: [0.15, 0.14, 0.13], decor: true, fine: true });
  }
  for (const dy of [0.04, h - 0.04]) faceBox(sink, 'structureWood', face, u, y + dy, go + 0.03, w, 0.08, 0.06, fo);
  faceBox(sink, 'structureWood', face, u, y + h * 0.5, go + 0.035, w - 0.1, 0.07, 0.03, { colour: shade(TAR, 0.85), decor: true, uv: UV_MEMBER });
}

/** A tarred timber body's dialect: the green cart doors and the plank doors in white frames, the hatches shut. */
function tarDialect(st: PolderState): HouseDialect {
  return {
    window: (s, face, o, y0) => stallHatch(s, face, o, y0),
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') { dialect(st).door(s, face, o, y0, frame); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(TAR, 1.2), frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: WHITE }, steps: null, leafKind: 'plank' },
        frame.floors[o.storey] + o.y0);
    },
  };
}

/**
 * The wolfseinden of a Zeeland barn's thatch (dome-detail-275; the work list: "the thatch hood reads as a smooth slab
 * with no thatch courses or ridge"): at each end of the ridge the hip cut back `g` into a small upright gable, the thatch
 * carried out over it as a hood; in it the owl board (uilenbord), tarred, with its white barge boards, its owl hole and
 * the white makelaar under the apex. Then the ridge laid end to end in half-round ridge tiles (vorstpannen) over the
 * rolled straw, each tile's lap a collar. Dressing.
 */
function wolfseinden(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, g: number): void {
  const tanP = rg.tanP, cosP = 1 / Math.hypot(1, tanP), sinP = tanP * cosP;
  const RT = rg.ridgeY + roof.thickness / cosP, zr = rg.ridgeHalf, hc = RT - g * tanP, over = 0.3, th = 0.26, drop = th / cosP;
  const apex = RT - drop, foot = hc - 0.04, b = (apex - foot) / tanP;
  for (const end of [1, -1] as const) {
    const zc = end * (zr + g), zo = end * (zr + g + over), out: Vec3 = [0, 0, end];
    // the hood: the main slopes' thatch carried on past the hip lines and out over the board
    for (const side of [1, -1] as const) {
      const n: Vec3 = [side * sinP, cosP, 0], down = normalize3([side * cosP, -sinP, 0]);
      orientedPrism(sink, 'straw', [[0, RT, end * zr], [0, RT, zo], [side * g, hc, zo], [side * g, hc, zc]], neg3(n), th,
        { decor: true, uv: { kind: 'plane', origin: [0, RT, 0], u: down, v: [0, 0, 1] } });
    }
    // the owl board, its barge boards, its owl hole and the makelaar
    orientedPrism(sink, 'structureWood', [[-b, foot, zc], [b, foot, zc], [0, apex, zc]], neg3(out), 0.05, { colour: shade(TAR, 1.15), decor: true, uv: UV_MEMBER });
    for (const side of [1, -1]) {
      // (set a hand down the hood's underside, so their white shows under the straw)
      const dn = 0.05 * Math.hypot(1, 1 / tanP);
      sink.member('structureWood', [side * (b - 0.05 / tanP), foot - dn * 0.1, zc + end * 0.02], [0, apex - dn, zc + end * 0.02], 0.15, 0.04, out, { colour: WHITE, decor: true }, 0);
    }
    const hole: Vec3[] = [[-0.13, foot + 0.12, zc + end * 0.006], [0.13, foot + 0.12, zc + end * 0.006], [0.13, foot + 0.32, zc + end * 0.006], [-0.13, foot + 0.32, zc + end * 0.006]];
    polyToward(sink, 'dark', hole, out, { decor: true });
    const mk = Math.min(0.75, (apex - foot) * 0.6);
    sink.span('structureWood', -0.06, apex - mk, Math.min(zc, zc + end * 0.07), 0.06, apex, Math.max(zc, zc + end * 0.07), { colour: WHITE, decor: true });
    sink.span('structureWood', -0.11, apex - mk - 0.12, Math.min(zc, zc + end * 0.08), 0.11, apex - mk, Math.max(zc, zc + end * 0.08), { colour: WHITE, decor: true });
  }
  // the ridge tiles, end to end over the straw's roll and the hoods
  const zEnd = zr + g + over;
  sink.cylinder('roof', [0, RT + 0.03, -zEnd], 'z', 2 * zEnd, 0.15, 10, { decor: true, shade: 0.82 });
  for (let z = -zEnd + 0.42; z < zEnd - 0.2; z += 0.42) sink.cylinder('roof', [0, RT + 0.03, z], 'z', 0.04, 0.158, 8, { decor: true, fine: true, shade: 0.7 }, 0.158, false);
}

/**
 * Patches in a thatch (dome-detail-275, the work list's "smooth slab"; the realism brief: "weathering in form"): on each
 * long slope a bed of moss gone green on the straw and a newer repair, its straw still pale, each a low pad a finger
 * proud of the coat. Dressing.
 */
function thatchPatches(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, look: () => number): void {
  for (const q of roofSlopes(rg, roof).slice(0, 2)) {
    const f = slopeFrame(q);
    for (let k = 0; k < 2; k++) {
      const moss = k === 0;
      const x = f.X * (0.28 + look() * 0.44), v = f.L * (0.22 + look() * 0.3), w = 0.9 + look() * 0.8, h = 0.7 + look() * 0.6;
      const pts: Vec3[] = [];
      for (let i = 0; i < 6; i++) {
        const t = i * Math.PI / 3, j = 0.8 + look() * 0.3;
        pts.push(f.P(x + Math.cos(t) * w / 2 * j, v + Math.sin(t) * h / 2 * j, 0.016));
      }
      polyToward(sink, 'straw', pts, f.n, { decor: true, uv: { kind: 'plane', origin: q.e0, u: f.down, v: f.a },
        tint: moss ? [0.62, 0.74, 0.5] : [1.14, 1.08, 0.88] });
    }
  }
}

/**
 * The Zeeuwse schuur (the props census #17, 2026-10-15, the judges: "build it on the house grammar ... keep the tar
 * weatherboard as separate boards and cut the openings: the cart gates hung at the back of a reveal with real leaves
 * and a wicket made of boards, and the stable door and windows recessed; give the thatch a ridge, a cut eave fringe and
 * a defined pantile foot course; a house plan then breaks it"): a tarred timber body on a brick plinth sunk to the
 * frost, the boards lapped, the cart doors in the street end, the stable door and the stall hatches in the long side
 * cut through it, under the towering hipped thatch that rides over its foot of pantiles at the eaves, its eave courses
 * beaten in steps and its ridge rolled.
 */
const schuur: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(7.0, ctx.info.w - 0.3), D = Math.max(10.5, ctx.info.d - 0.3);
  const wallH = 3.2, mobile = ctx.tier === 'mobile';
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 2.85 },
    { face: 'right', storey: 0, kind: 'door', u: -D * 0.25, w: 1.0, y0: 0, h: 1.9 },
  ];
  for (const u of [D * 0.05, D * 0.3]) {
    st.rng(); // (the glazed unit's pane draw, kept: the build stream after it is unchanged)
    openings.push({ face: 'right', storey: 0, kind: 'window', u, w: 0.7, y0: 1.35, h: 0.6 });
  }
  // the roof's foot: pantiles on the hip's lowest metre, the house's own covering (its collision and its plan's roof)
  const foot: RoofSpec = { kind: 'hip', pitchDeg: 48, eave: 0.45, verge: 0.45, thickness: 0.12, bucket: 'roof', ridge: null };
  sink.paint = TAR;
  let frame: HouseFrame;
  try {
    frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'structureWood' }], roof: foot,
      gableBucket: 'structureWood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.14, spall: null,
    }, tarDialect(st));
  } finally { sink.paint = null; }
  tarBoards(sink, frame, mobile);
  // the thatch rides over the tiled slab from a line a metre in (dressing: the tiles carry the collision), its eave courses
  // beaten in steps along both long slopes, its ridge rolled
  const inset = 1.0, thatchEave = frame.eaveY + inset * Math.tan(48 * Math.PI / 180);
  const straw: RoofSpec = { kind: 'hip', pitchDeg: 52, eave: 0.25, verge: 0.25, thickness: 0.4, bucket: 'straw', ridge: 'round', decor: true };
  const rg = roofGeometry(W - 2 * inset, D - 2 * inset, thatchEave, straw);
  emitRoof(sink, rg, straw);
  if (!mobile) {
    const sinP = Math.sin(52 * Math.PI / 180), cosP = Math.cos(52 * Math.PI / 180), t = straw.thickness;
    const lo = thatchEave - straw.eave * rg.tanP, Dz = rg.halfD + straw.verge;
    for (const side of [1, -1]) {
      const n: Vec3 = [side * sinP, cosP, 0], up = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      thatchCourses(sink, 'straw', up([side * (rg.s + straw.eave), lo, side * Dz * 0.82]), up([side * (rg.s + straw.eave), lo, -side * Dz * 0.82]),
        up([0, rg.ridgeY, side * rg.ridgeHalf]), up([0, rg.ridgeY, -side * rg.ridgeHalf]), n, { stepped: true });
    }
    // (dome-detail-275) the hip ends' eave courses and course lines as well
    const run = Dz - rg.ridgeHalf, rise = rg.ridgeY - lo, len = Math.hypot(rise, run), xC = rg.s + straw.eave;
    for (const end of [1, -1]) {
      const n: Vec3 = [0, run / len, end * rise / len], up = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      const apex = up([0, rg.ridgeY, end * rg.ridgeHalf]);
      thatchCourses(sink, 'straw', up([end * xC * 0.82, lo, end * Dz]), up([-end * xC * 0.82, lo, end * Dz]), apex, apex, n, { stepped: true });
    }
  }
  // (dome-detail-275) the wolfseinden with their owl boards and the tiled ridge; the thatch's moss and repairs; the
  // pantile foot in relief up under the thatch's edge
  const look = ctx.variant;
  wolfseinden(sink, rg, straw, 1.05 + look() * 0.25);
  thatchPatches(sink, rg, straw, look);
  const ft = frame.roof, vFoot = (foot.eave + inset - straw.eave) / Math.cos(48 * DEG) + 0.05;
  for (const q of roofSlopes(ft, foot)) pantileRelief(sink, q, look, { vMax: vFoot, hole: patchHole(frame.roofPatch, q, ft, foot) });
  // (dome-detail-275) the zinc gutters along the long eaves; a downpipe on its swan neck to a water butt at the stable
  // door's end, the other to the ground at the far end
  const e = foot.eave, lo = frame.eaveY - e * ft.tanP, Dg = ft.halfD + foot.verge - 0.15, s = ft.s;
  for (const side of [1, -1] as const) {
    const xo = side * (s + e), zp = side * (ft.halfD - 0.45), wall = side * s;
    sink.span('structureMetal', Math.min(xo - side * 0.05, xo + side * 0.13), lo - 0.15, -Dg, Math.max(xo - side * 0.05, xo + side * 0.13), lo + 0.01, Dg, { colour: ZINC, decor: true });
    sink.member('structureMetal', [side * (s + e + 0.04), lo - 0.1, zp], [side * (s + 0.045), lo - 0.62, zp], 0.08, 0.08, [0, 0, 1], { colour: ZINC, decor: true });
    const yFoot = side > 0 ? 0.82 : 0.1;
    sink.span('structureMetal', Math.min(wall, wall + side * 0.09), yFoot, zp - 0.045, Math.max(wall, wall + side * 0.09), lo - 0.56, zp + 0.045, { colour: ZINC, decor: true });
  }
  const oak = rgb(0x4e3b28), zb = ft.halfD - 0.45;
  sink.cylinder('structureWood', [s + 0.34, 0, zb], 'y', 0.95, 0.28, 12, { colour: oak, decor: true }, 0.305);
  for (const y of [0.16, 0.74]) sink.cylinder('structureMetal', [s + 0.34, y, zb], 'y', 0.045, 0.29 + y * 0.033, 12, { colour: IRON, decor: true, fine: true }, 0.292 + y * 0.033, false);
  // (dome-detail-275) the brick ramp up to the cart doors' sill, the stone step at the stable door
  cartRamp(sink, frame.faces.front, 0, 3.4, frame.floors[0], 0.6);
  for (const o of openings) if (o.kind === 'door') faceBox(sink, 'stone', frame.faces[o.face], o.u, 0.12, 0.2, o.w + 0.3, 0.34, 0.4, { decor: true, shade: 0.9 });
  return sink.finish();
};

/** A thatched smock mill on its brick base and stage (props census #22, Lane C 2026-10-16: windmills.ts buildSmockMill). */
const smockMill: RegionalBuilder = (ctx) => buildSmockMill(ctx, { tar: TAR, white: WHITE, door: stateFor(ctx).green });

/**
 * A brick warehouse (pakhuis) with loading doors above each other and a hoist beam (the base depot footprint).
 * (dome-detail-275; the work list: "the front reads like a house, but the gable and back are blank and the roof is
 * smooth") Its pantiles laid in relief; the street gable (+z) stepped (trapgevel) past the roof to its stack, two loft
 * lights cut under the steps; the back gable's tumbled courses and its loft hatch; the white board cornice and the wall
 * anchors at the loft floor down both long walls; the back wall's small lights, shuttered below and barred in the loft;
 * over the middle cart door the hoist dormer with its beam, hood and block; brick arches over the cart doors and the cart
 * ramps up to their sills; a pallet of sacks at the loading side.
 */
const pakhuis: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), look = ctx.variant;
  const W = Math.max(5.8, Math.min(8, ctx.info.w - 4.0)), D = Math.max(12, ctx.info.d - 2.6);
  const cx = ctx.bounds.minX + 0.15 + W / 2;
  const openings: Opening[] = [];
  let hoistU = Infinity, sackU = 0;
  for (let k = 0, n = Math.max(2, Math.round(D / 4.5)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push({ face: 'right', storey: 0, kind: k % 2 === 0 ? 'gate' : 'window', u, w: k % 2 === 0 ? 2.0 : 0.9, y0: k % 2 === 0 ? 0 : 1.0, h: k % 2 === 0 ? 2.6 : 1.2 });
    openings.push({ face: 'right', storey: 1, kind: 'loft', u, w: 0.9, y0: 0.6, h: 1.1 });
    if (k % 2 === 0 && Math.abs(u) < Math.abs(hoistU)) hoistU = u;
    if (k === 1) sackU = u;
  }
  // (dome-detail-275) the back wall's small lights: shuttered on the ground floor, barred in the loft
  for (const s of [0, 1]) {
    for (const o of windowRhythm('left', s, D, { w: 0.8, h: s ? 0.85 : 1.05, sill: s ? 0.7 : 1.2, spacing: 4.2, margin: 1.8, max: 3 })) openings.push(s ? { ...o, kind: 'loft' } : o);
  }
  const roof = pantiles(46);
  // (dome-detail-275) the new lights' lit panes draw from the look stream, so the build stream after them never moves
  const base = dialect({ ...st, litShare: 0.1 }), added = dialect({ ...st, litShare: 0.1, rng: look });
  const gableHoles = (front: boolean, poly: Array<[number, number]>): HoleRect[] => {
    const b = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
    if (top - b < 2.6) return [];
    return front ? [-0.8, 0.8].map((c) => ({ u0: c - 0.3, u1: c + 0.3, y0: b + 0.5, y1: b + 1.4 })) : [{ u0: -0.45, u1: 0.45, y0: b + 0.35, y1: b + 1.6 }];
  };
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h: 3.4, wall: 'stone' }, { h: 2.6, wall: 'stone' }],
      roof, gableBucket: 'stone', openings, chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: null,
    }, {
      ...base,
      window: (s, face, o, y0, fr) => (o.face === 'left' ? added : base).window(s, face, o, y0, fr),
      door: (s, face, o, y0, fr) => {
        base.door(s, face, o, y0, fr);
        // (dome-detail-275) the cart door's segmental brick arch
        if (o.kind === 'gate' && facadeOn()) windowHead(s, face, o.u, y0 + o.y0 + o.h, o.w, { kind: 'segment', bucket: 'stone', h: 0.2, out: 0.05, ext: 0.16, rise: 0.14 });
      },
      gableOpenings: (face, poly) => gableHoles(face.out[2] > 0, poly),
    });
    gableStacks(sink, frame.roof, false, frame.eaveY);
    const rg = frame.roof, ey = frame.eaveY;
    // (dome-detail-275) the board cornice and the gables' anchors; the street gable stepped, the back one's rakes tumbled
    if (facadeOn()) zeelandEaves(sink, frame);
    trapgevel(sink, rg, roof, 1, look);
    if (rg.gable) vlechtingen(sink, frame.faces.back, rg.gable);
    // the gables' openings: the street gable's loft lights, the back's loft hatch in its white frame
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name];
      sink.recess = frame.gableReveal;
      try {
        for (const h of rg.gable ? gableHoles(name === 'front', rg.gable) : []) {
          const u = (h.u0 + h.u1) / 2, w = h.u1 - h.u0;
          if (name === 'front') windowUnit(sink, face, u, h.y0, w, h.y1 - h.y0, { ...st.window, shutters: null, bars: 'cross' }, look, 0.1);
          else doorUnit(sink, face, u, h.y0, w, h.y1 - h.y0, { leaf: st.green, frame: { bucket: 'structureWood', width: 0.09, out: 0.05, colour: WHITE }, steps: null, leafKind: 'plank' });
        }
      } finally { sink.recess = 0; }
      if (rg.gable && name === 'back') faceBox(sink, 'stone', face, 0, ey + 1.6 + 0.13, 0.03, 1.2, 0.22, 0.06, { decor: true });
    }
    // the anchors tying the loft floor's beams, down both long walls
    for (const name of ['right', 'left'] as const) {
      const face = frame.faces[name], n = Math.max(3, Math.round(D / 2.3));
      for (let i = 0; i < n; i++) {
        const u = -D / 2 + (i + 0.5) * D / n;
        faceBox(sink, 'structureMetal', face, u, frame.floors[1] - 0.12, 0.02, 0.05, 0.56, 0.04, { colour: IRON, decor: true });
      }
    }
    // the hoist dormer over the middle cart door: a boarded cheek-and-gable dormer with its loading hatch, the beam out
    // of its gable under a hood, the block and the fall
    const zc = -hoistU, dw = 1.3, xf = Math.max(0.6, rg.s - 0.9 / rg.tanP);
    const yb = (rg.topAt(xf, zc) ?? ey) - 0.12, yt = yb + 0.12 + 1.25, rise = dw * 0.42, half = dw / 2 + 0.12;
    roofDormers(sink, rg, [1], [zc], {
      kind: 'gable', wall: 'structureWood', covering: 'roof', colour: WHITE,
      window: (face, u, y, w, h) => doorUnit(sink, face, u, y, w, h, { leaf: st.green, frame: { bucket: 'structureWood', width: 0.08, out: 0.05, colour: shade(WHITE, 0.92) }, steps: null, leafKind: 'plank' }),
    });
    // (the beam reaches past the eave and its gutter, so the fall hangs clear of the wall)
    const oak = rgb(0x4a3e32), yBeam = yt + rise - (0.09 / half) * rise - 0.004, xEnd = rg.s + roof.eave + 0.42, xFall = xEnd - 0.12;
    sink.span('structureWood', xf - 0.5, yBeam - 0.2, zc - 0.09, xEnd, yBeam, zc + 0.09, { colour: oak, decor: true });
    for (const end of [1, -1] as const) {
      const yE = yt + rise - 0.32 * rise / half;
      orientedPrism(sink, 'roof', [[xf + 0.2, yt + rise, zc], [xEnd + 0.08, yt + rise, zc], [xEnd + 0.08, yE, zc + end * 0.32], [xf + 0.2, yE, zc + end * 0.32]],
        normalize3([0, half, end * rise]), 0.07, { decor: true, shade: 0.9 });
    }
    sink.span('structureMetal', xFall - 0.07, yBeam - 0.44, zc - 0.07, xFall + 0.07, yBeam - 0.2, zc + 0.07, { colour: IRON, decor: true });
    const yHook = frame.floors[1] + 1.35;
    sink.span('structureMetal', xFall - 0.012, yHook, zc - 0.012, xFall + 0.012, yBeam - 0.44, zc + 0.012, { colour: rgb(0x6a5e4c), decor: true, fine: true });
    sink.span('structureMetal', xFall - 0.05, yHook - 0.12, zc - 0.03, xFall + 0.05, yHook, zc + 0.03, { colour: IRON, decor: true, fine: true });
    // the slopes' pantiles, short of the dormer's front
    const cosP = 1 / Math.hypot(1, rg.tanP), vFront = (rg.s + roof.eave - xf) / cosP - 0.1;
    for (const q of roofSlopes(rg, roof)) {
      pantileRelief(sink, q, look, { hole: patchHole(frame.roofPatch, q, rg, roof),
        limit: (p) => (p[0] > 0 && Math.abs(p[2] - zc) < dw / 2 + 0.16 ? vFront : Infinity) });
    }
    // the cart ramps up to the doors' sills, and a pallet of sacks against the loading side
    const right = frame.faces.right;
    for (const o of openings) if (o.face === 'right' && o.kind === 'gate') cartRamp(sink, right, o.u, o.w + 0.4, frame.floors[0], 0.85);
    const zs = -sackU, x0 = W / 2 + 0.12, jute = rgb(0x9a8a66);
    sink.span('structureWood', x0, 0, zs - 0.5, x0 + 1.0, 0.13, zs + 0.5, { colour: rgb(0x7a6a52), decor: true });
    for (let i = 0; i < 5; i++) {
      const lay = i < 3 ? 0 : 1, zi = zs - 0.33 + (lay ? 0.17 + (i - 3) * 0.33 : i * 0.33), y = 0.13 + 0.15 + lay * 0.27;
      sink.cylinder('structureWood', [x0 + 0.1 + look() * 0.08, y, zi], 'x', 0.78, 0.165, 7, { colour: shade(jute, 0.86 + look() * 0.2), decor: true });
    }
  });
  return sink.finish();
};

/**
 * The tarred shed (schuurtje: the woodshed, the granary's store, the yards' shed; the props census #17, 2026-10-15, the
 * judges: "tarred weatherboard as separate boards on a frame, a plinth sunk to -0.6 m, the doors hung in a cut opening
 * with board leaves (no painted wicket) in white frames, a pantile roof with eave and verge courses, and raked (not
 * stepped) gable boarding"): the schuur's craft at shed scale on the house grammar — a tarred timber body on its brick
 * plinth, the boards lapped and raked up the gables, the green doors hung in a cut opening in a white frame on the +x
 * side, a stall hatch in the back, pantiles with white verge boards. Its house plan breaks it.
 */
const tarShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(3.4, ctx.info.w - 0.4), D = Math.max(4.4, ctx.info.d - 0.4);
  const openings: Opening[] = [
    { face: 'right', storey: 0, kind: 'gate', u: 0, w: 2.0, y0: 0, h: 2.05 },
    { face: 'left', storey: 0, kind: 'window', u: D * 0.2, w: 0.6, y0: 1.2, h: 0.55 },
  ];
  sink.paint = TAR;
  let frame: HouseFrame;
  try {
    frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.25, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.35, wall: 'structureWood' }], roof: { ...pantiles(40), verge: 0.2 },
      gableBucket: 'structureWood', openings, chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.12, spall: null,
    }, tarDialect(st));
  } finally { sink.paint = null; }
  tarBoards(sink, frame, ctx.tier === 'mobile');
  return sink.finish();
};

/** A shelled brick farmhouse: the gable standing with its stack, the roof gone, rubble inside. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3), t = 0.35;
  const apex = 2.9 + (W / 2) * Math.tan(50 * Math.PI / 180);
  // (props census #7, lane B 2026-10-14; the judges: "slices of span boxes, the gable's window a dark plate") the ruin
  // grammar: the farmhouse's own brick walls broken low with a gap or two, the steep gable standing to its stack with
  // its window and the door under it cut through, the hearth against its inside, the pantiles slid in over the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'window', u: -0.9, w: 0.9, y0: 0.95, h: 1.3 },
    { face: 'front', storey: 0, kind: 'door', u: W * 0.25, w: 0.95, y0: 0, h: 2.1 }];
  for (const face of ['right', 'left'] as const) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * 2, w: 0.9, y0: 0.9, h: 1.2 });
  const low = (): RuinHead => ({ a: 0.8 + rng() * 2.0, b: 0.8 + rng() * 2.0, at: 0.15 + rng() * 0.7, dip: rng() < 0.5 ? 0.8 : 0.3, ragged: 0.3 });
  ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: null, storeys: [2.7], openings,
    heads: { front: { a: 2.9, b: 2.9, at: 0.42, dip: -(apex - 2.9) / 2.9, ragged: 0.15 }, right: low(), left: low(), back: low() }, stub: 0.4,
    lintel: { bucket: 'stone' }, roof: { bucket: 'roof', piece: [0.4, 0.3, 0.02] }, timber: rgb(0x2b2621), hearth: { face: 'front', u: 0.6, w: 1.3 },
    mobile: ctx.tier === 'mobile',
  }, rng, look);
  // the stack on the gable
  sink.span('stone', -0.45, 2.4, D / 2 - t, 0.35, apex + 0.7, D / 2);
  return sink.finish();
};

/**
 * The fish auction and mussel sheds of the Scheldt harbours: a brick pakhuis (harbourSheds.ts polderPakhuis).
 * (dome-detail-275; the work list: "the front and the shutters read; the roof is a smooth slab") Its pantiles laid in
 * relief (open over a war-stripped patch), the tumbled courses up both gables' rakes, the anchors tying the loft floor
 * down both long walls, and the brick cart ramps up to the yard doors' sills, laid in polderPakhuis's own frame (its
 * `more` hook: the body's measures, its roof and its stripped patch come from the build itself).
 */
const fishery: RegionalBuilder = (ctx) => {
  const look = ctx.variant;
  return polderPakhuis(ctx, { st: stateFor(ctx), dialect }, (sink, frame) => {
    const rg = frame.roof, roof = frame.spec.roof, D = frame.spec.d;
    for (const q of roofSlopes(rg, roof)) pantileRelief(sink, q, look, { hole: patchHole(frame.roofPatch, q, rg, roof) });
    if (rg.gable) for (const face of [frame.faces.front, frame.faces.back]) vlechtingen(sink, face, rg.gable);
    for (const face of [frame.faces.right, frame.faces.left]) {
      const n = Math.max(3, Math.round(D / 2.4));
      for (let i = 0; i < n; i++) faceBox(sink, 'structureMetal', face, -D / 2 + (i + 0.5) * D / n, frame.floors[1] - 0.14, 0.02, 0.05, 0.56, 0.04, { colour: IRON, decor: true });
    }
    for (const u of [-D * 0.18, D * 0.24]) cartRamp(sink, frame.faces.right, u, 2.6, 0.35, 0.7);
  });
};

const POLDER_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => brickHouse(ctx),
  farmhouse: boerderij,
  tavern: (ctx) => brickHouse(ctx, { storeys: 2 }),
  barn: schuur,
  mill: smockMill,
  depot: pakhuis,
  granary: tarShed,
  woodshed: tarShed,
  ruin,
  fishery,
});

export const POLDER_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'polder',
  region: 'Zeeland and Zeeuws-Vlaanderen (Scheldt polders): brick farms under pantiles, tarred barns under thatch',
  surfaces: {
    roof: { kind: 'pantile', tint: [0.64, 0.32, 0.20] },
    stone: { kind: 'brick', tint: [0.56, 0.30, 0.23] },
    // (buildings-270: Polders reverted to its base look, Main 11-06, the round-4 pairs 0–7)
    sourced: { plaster: true, wood: true },
  },
  builders: POLDER_BUILDERS,
  // the yards: a plank fence round the kitchen garden and the shed, a gate (yards.ts)
  // (2026-10-17, the Polders village blind 227: tidy, its modules to their slots and the shed out of the gate's way)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [4.1, 4.9], garden: true, tidy: true },
});
