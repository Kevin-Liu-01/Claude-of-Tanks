// src/world/landmarks/stave.ts — the Norwegian stave church (the buildings lane, 2026-10-11, round 4: a landmark per
// map, Nordhavn Fjord). Borgund in Lærdal (c. 1180) is the type: a nave raised over its aisles on the staves, its
// steep clerestory roof the highest; a chancel to the east and its round apse under a cone and a little round tower;
// the open gallery (svalgang) round the whole, low, under its own pent roof, arcaded on its posts; roofs of tarred
// shingles laid in courses on every plane, tier over tier; the ridge turret over the nave with its open belfry, its
// skirt and its tall spire; carved dragon heads reaching out from the ends of the clerestory's ridge, crosses on the
// lower gables; the west portal's carved frame. All of tarred pine, near black; the sills on a footing of stones.
//
// The piece's front (+z) is the west front, its portal toward the approach; the chancel and the apse lie toward -z.
// Every member meets another (kitConnectivity): the battens, the shingle courses and the arcade's posts are dressing on
// their walls and planes; the dragons' necks rise from the ridge's end in a chain, the heads short blocks.
import { PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { cross, revolve } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const TAR = rgb(0x2a231d), TAR_LIGHT = rgb(0x3b3027), SHINGLE = rgb(0x2e2721), CARVED = rgb(0x6e5a43), IRON = rgb(0x1f1e1d);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

type V = Vec3;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const crossV = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * A roof plane laid on the quad (a, b, c, d) — its underside, counter-clockwise seen from above — `t` thick, and its
 * shingle courses: thin strips across it every `pitch` metres up the slope from its low edge (a→b) to its high edge
 * (d→c), each trimmed to the plane's sides (fine dressing).
 */
export function plane(sink: PartSink, a: V, b: V, c: V, d: V, t: number, colour: Rgb, pitch = 0.32, opts: EmitOptions = {}): void {
  let n = norm(crossV(sub(b, a), sub(d, a)));
  if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
  sink.prism('structureWood', [a, b, c, d], n, t, { colour, ...opts });
  // the courses: from the low edge up, each strip from side to side at its height (the sides may converge at a hip)
  const rise = Math.hypot(...sub(lerp(d, c, 0.5), lerp(a, b, 0.5)));
  const courses = Math.floor(rise / pitch), lift: V = [n[0] * (t - 0.004), n[1] * (t - 0.004), n[2] * (t - 0.004)];
  for (let k = 1; k < courses; k++) {
    const f = k / courses, p = add(lerp(a, d, f), lift), q = add(lerp(b, c, f), lift);
    if (Math.hypot(...sub(q, p)) < 0.3) continue;
    sink.member('structureWood', p, q, 0.07, 0.022, n, { colour: shade(colour, 0.78), decor: true, fine: true, ends: true }, 0.004);
  }
}

/**
 * A pent roof round a rectangle: from the wall line (x0..x1, z0..z1) at `yHigh` down `run` metres outward (`runZ` on
 * the ends) to `yLow`, four trapezoid planes meeting at the hips.
 */
export function pentRing(sink: PartSink, x0: number, x1: number, z0: number, z1: number, yHigh: number, run: number, runZ: number, yLow: number,
  t: number, colour: Rgb, sides: { px?: boolean; nx?: boolean; pz?: boolean; nz?: boolean } = { px: true, nx: true, pz: true, nz: true }): void {
  const X0 = x0 - run, X1 = x1 + run;
  // (with no plane on an end the sides stop square there: another body meets them)
  const Z0 = sides.nz ? z0 - runZ : z0, Z1 = sides.pz ? z1 + runZ : z1;
  if (sides.px) plane(sink, [X1, yLow, Z1], [X1, yLow, Z0], [x1, yHigh, z0], [x1, yHigh, z1], t, colour);
  if (sides.nx) plane(sink, [X0, yLow, Z0], [X0, yLow, Z1], [x0, yHigh, z1], [x0, yHigh, z0], t, colour);
  if (sides.pz) plane(sink, [X0, yLow, Z1], [X1, yLow, Z1], [x1, yHigh, z1], [x0, yHigh, z1], t, colour);
  if (sides.nz) plane(sink, [X1, yLow, Z0], [X0, yLow, Z0], [x0, yHigh, z0], [x1, yHigh, z0], t, colour);
}

/** A gable roof over a body x ∈ ±half, z ∈ [z0, z1], its wall head at y, `pitch` degrees, eaves `over` out; returns the
 *  ridge's height. The gable triangles close its ends. */
function gable(sink: PartSink, half: number, z0: number, z1: number, y: number, pitchDeg: number, over: number, overZ: number, colour: Rgb): number {
  const tan = Math.tan(pitchDeg * Math.PI / 180), ridge = y + half * tan, lo = y - over * tan;
  const za = z0 - overZ, zb = z1 + overZ;
  plane(sink, [half + over, lo, zb], [half + over, lo, za], [0, ridge, za], [0, ridge, zb], 0.16, colour);
  plane(sink, [-half - over, lo, za], [-half - over, lo, zb], [0, ridge, zb], [0, ridge, za], 0.16, colour);
  // the gables: tarred boards, closing the ends under the roof
  sink.prism('structureWood', [[half, y, z1], [-half, y, z1], [0, ridge, z1]], [0, 0, -1], 0.12, { colour: TAR });
  sink.prism('structureWood', [[-half, y, z0], [half, y, z0], [0, ridge, z0]], [0, 0, 1], 0.12, { colour: TAR });
  // the ridge board
  sink.span('structureWood', -0.12, ridge - 0.02, za, 0.12, ridge + 0.16, zb, { colour: shade(colour, 0.85) });
  return ridge;
}

/** The staves' battens: vertical strips every `step` along a wall face from (x, z) along `dir` for `len`, out along
 *  `out`, from y0 to y1 (fine dressing). */
function staves(sink: PartSink, x: number, z: number, dir: V, out: V, len: number, y0: number, y1: number, step = 0.42): void {
  for (let s = step / 2; s < len; s += step) {
    const p: V = [x + dir[0] * s, y0, z + dir[2] * s];
    sink.member('structureWood', p, [p[0], y1, p[2]], 0.06, 0.03, out, { colour: TAR_LIGHT, decor: true, fine: true }, 0.004);
  }
}

/**
 * A carved dragon head reaching out from a ridge's end at (0, y, z) toward `dir` (±1 along z): a neck rising in three
 * lengths, each from the last, and the head a short block with its jaw (dressing, every piece meeting the next).
 */
function dragon(sink: PartSink, y: number, z: number, dir: 1 | -1, size: number): void {
  const o: EmitOptions & { exposed?: boolean } = { colour: TAR, decor: true, exposed: true };
  const pts: V[] = [[0, y + 0.05, z], [0, y + 0.45 * size, z + dir * 0.55 * size], [0, y + 1.05 * size, z + dir * 0.85 * size], [0, y + 1.5 * size, z + dir * 0.9 * size]];
  for (let k = 0; k + 1 < pts.length; k++) sink.member('structureWood', pts[k], pts[k + 1], 0.2 * size, 0.16 * size, [1, 0, 0], o, 0.08 * size);
  const h = pts[3];
  // the head and its open jaw: blocks turned out from the neck's top (short: no free end to carry)
  sink.span('structureWood', -0.09 * size, h[1] - 0.12 * size, Math.min(h[2], h[2] + dir * 0.42 * size), 0.09 * size, h[1] + 0.08 * size, Math.max(h[2], h[2] + dir * 0.42 * size), o);
  sink.span('structureWood', -0.07 * size, h[1] - 0.3 * size, Math.min(h[2] + dir * 0.05 * size, h[2] + dir * 0.32 * size), 0.07 * size, h[1] - 0.12 * size,
    Math.max(h[2] + dir * 0.05 * size, h[2] + dir * 0.32 * size), o);
}

export const staveChurch: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const look = ctx.variant;
  const L = Math.max(14, Number(ctx.params.length)), W = Math.max(10, Number(ctx.params.width));
  const k = Math.min(L / 16, W / 11);
  const base = -0.6 - ctx.groundFall, sill = 0.35;
  // the plan, scaled to the footprint (Borgund's proportions on a 16 x 11 m site)
  const aw = 3.8 * k, a0 = -1.5 * k, a1 = 6.0 * k;                // the aisled body
  const cw = 2.6 * k, c0 = a0 + 1.2 * k, c1 = a1 - 1.2 * k;       // the clerestory, its aisles 1.2 m all round
  const hw = 2.1 * k, h0 = -5.4 * k;                               // the chancel (h0 to a0)
  const gw = aw + 1.5 * k, g0 = a0, g1 = a1 + 1.5 * k;             // the gallery: 1.5 m round three sides
  const aisleTop = sill + 3.05, clereTop = aisleTop + 4.2, galleryTop = sill + 1.75;
  // ---- the footing: a course of stones under the sills
  sink.span('stone', -gw - 0.1, base, g0 - 0.1, gw + 0.1, sill, g1 + 0.1);
  sink.span('stone', -hw - 0.1, base, h0 - 0.1, hw + 0.1, sill, g0 - 0.1);
  revolve(sink, 'stone', 0, h0, [[1.85 * k, base], [1.85 * k, sill], [0, sill]], 14);
  // ---- the gallery: its low wall round the body (the west door's gap), the posts and their arcade over it, its plate
  const wallTop = sill + 0.85, door = 1.5 * k;
  const low = { colour: TAR } as const;
  sink.span('structureWood', -gw, sill, g0, -gw + 0.14, wallTop, g1, low);
  sink.span('structureWood', gw - 0.14, sill, g0, gw, wallTop, g1, low);
  sink.span('structureWood', -gw + 0.14, sill, g1 - 0.14, -door / 2, wallTop, g1, low);
  sink.span('structureWood', door / 2, sill, g1 - 0.14, gw - 0.14, wallTop, g1, low);
  const plate = { colour: TAR_LIGHT } as const;
  for (const [x0, z0, x1, z1] of [[-gw, g0, -gw + 0.16, g1], [gw - 0.16, g0, gw, g1], [-gw, g1 - 0.16, gw, g1]] as const) {
    sink.span('structureWood', x0, galleryTop - 0.16, z0, x1, galleryTop, z1, plate);
  }
  // the arcade: posts from the low wall to the plate every metre or so, a round head between each pair (dressing)
  const post = (x: number, z: number) => sink.span('structureWood', x - 0.07, wallTop, z - 0.07, x + 0.07, galleryTop - 0.16, z + 0.07, { colour: TAR_LIGHT, decor: true });
  const arch = (p: V, q: V, out: V) => {
    // a round head between two posts, as six short lengths springing from the posts' heads under the plate
    const mid = lerp(p, q, 0.5), r = Math.hypot(...sub(q, p)) / 2 - 0.07, along = norm(sub(q, p));
    const spring = galleryTop - 0.16 - r;
    let prev: V | null = null;
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (1 - i / 6), pt: V = [mid[0] + along[0] * Math.cos(a) * r, spring + Math.sin(a) * r, mid[2] + along[2] * Math.cos(a) * r];
      if (prev) sink.member('structureWood', prev, pt, 0.06, 0.08, out, { colour: CARVED, decor: true, fine: true, exposed: true }, 0.04);
      prev = pt;
    }
  };
  const run = (x0: number, z0: number, x1: number, z1: number, out: V) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 1.05));
    let prev: V | null = null;
    for (let i = 0; i <= n; i++) {
      const p: V = [x0 + (x1 - x0) * i / n, wallTop, z0 + (z1 - z0) * i / n];
      post(p[0], p[2]);
      if (prev) arch(prev, p, out);
      prev = p;
    }
  };
  run(-gw + 0.07, g0 + 0.07, -gw + 0.07, g1 - 0.07, [-1, 0, 0]);
  run(gw - 0.07, g0 + 0.07, gw - 0.07, g1 - 0.07, [1, 0, 0]);
  run(-gw + 0.07, g1 - 0.07, -door / 2 - 0.07, g1 - 0.07, [0, 0, 1]);
  run(door / 2 + 0.07, g1 - 0.07, gw - 0.07, g1 - 0.07, [0, 0, 1]);
  // the gallery's pent roof, from the aisle walls down over its plate (the plane through the plate's top), square at
  // its east end; the east ends closed under it in boards
  const gHigh = aisleTop - 0.35, gSlope = (gHigh - galleryTop) / (gw - aw), gOver = 0.25;
  pentRing(sink, -aw, aw, a0, a1, gHigh, gw - aw + gOver, gw - aw + gOver, galleryTop - gOver * gSlope, 0.12, SHINGLE, { px: true, nx: true, pz: true });
  for (const sx of [-1, 1]) {
    // (counter-clockwise seen from +z, the prism's dir: its cap at the points faces east, out of the gallery)
    const pts: V[] = sx > 0 ? [[aw, sill, g0], [gw, sill, g0], [gw, galleryTop, g0], [aw, gHigh, g0]] : [[-gw, sill, g0], [-aw, sill, g0], [-aw, gHigh, g0], [-gw, galleryTop, g0]];
    sink.prism('structureWood', pts, [0, 0, 1], 0.14, { colour: TAR });
  }
  // the west door's porch: two posts, a little gable over the gap in the low wall
  for (const sx of [-1, 1]) sink.span('structureWood', sx * door / 2 - 0.09, sill, g1 - 0.05, sx * door / 2 + 0.09, galleryTop + 0.4, g1 + 0.13, { colour: CARVED });
  const pr = gable(sink, door / 2 + 0.2, g1 - 0.4, g1 + 0.6, galleryTop + 0.4, 50, 0.1, 0.05, SHINGLE);
  cross(sink, 'structureWood', 0, pr + 0.16, g1 + 0.55, 0.7, 'latin', TAR);
  // ---- the aisled body: its staves to the aisle roof, the west portal
  sink.span('structureWood', -aw, sill, a0, aw, aisleTop, a1, { colour: TAR });
  staves(sink, -aw, a1, [1, 0, 0], [0, 0, 1], 2 * aw, sill + 0.02, aisleTop - 0.4);
  staves(sink, -aw, a0, [1, 0, 0], [0, 0, -1], 2 * aw, sill + 0.02, aisleTop - 0.4);
  staves(sink, aw, a0, [0, 0, 1], [1, 0, 0], a1 - a0, sill + 0.02, aisleTop - 0.4);
  staves(sink, -aw, a0, [0, 0, 1], [-1, 0, 0], a1 - a0, sill + 0.02, aisleTop - 0.4);
  // the portal: the dark door, its carved jambs and the round head of its frame (Borgund's vine and dragon work)
  sink.span('structureWood', -0.6, sill, a1, 0.6, sill + 2.3, a1 + 0.05, { colour: shade(TAR, 0.7), decor: true });
  for (const sx of [-1, 1]) sink.span('structureWood', sx * 0.6 - (sx > 0 ? 0 : 0.28), sill, a1, sx * 0.6 + (sx > 0 ? 0.28 : 0), sill + 2.4, a1 + 0.12, { colour: CARVED, decor: true });
  sink.span('structureWood', -0.88, sill + 2.4, a1, 0.88, sill + 2.75, a1 + 0.12, { colour: CARVED, decor: true });
  sink.span('structureMetal', -0.05, sill + 1.0, a1 + 0.05, 0.05, sill + 1.25, a1 + 0.09, { colour: IRON, decor: true });
  // the aisle roof round the clerestory, from its walls down over the aisle walls' heads (the plane through them)
  const rHigh = aisleTop + 1.45, rSlope = (rHigh - aisleTop) / (aw - cw), rOver = 0.3;
  pentRing(sink, -cw, cw, c0, c1, rHigh, aw - cw + rOver, aw - cw + rOver, aisleTop - rOver * rSlope, 0.14, SHINGLE);
  // ---- the clerestory: its staves, its little round windows under the eaves, its steep roof and the dragons
  sink.span('structureWood', -cw, aisleTop, c0, cw, clereTop, c1, { colour: TAR });
  staves(sink, -cw, c1, [1, 0, 0], [0, 0, 1], 2 * cw, aisleTop + 1.5, clereTop - 0.1);
  staves(sink, -cw, c0, [1, 0, 0], [0, 0, -1], 2 * cw, aisleTop + 1.5, clereTop - 0.1);
  staves(sink, cw, c0, [0, 0, 1], [1, 0, 0], c1 - c0, aisleTop + 1.5, clereTop - 0.1);
  staves(sink, -cw, c0, [0, 0, 1], [-1, 0, 0], c1 - c0, aisleTop + 1.5, clereTop - 0.1);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = c0 + (c1 - c0) * (i + 0.5) / 3;
    sink.span('dark', sx > 0 ? cw : -cw - 0.012, clereTop - 1.0, z - 0.18, sx > 0 ? cw + 0.012 : -cw, clereTop - 0.64, z + 0.18, { decor: true });
  }
  const ridge = gable(sink, cw, c0, c1, clereTop, 59, 0.35, 0.35, SHINGLE);
  dragon(sink, ridge + 0.14, c1 + 0.35, 1, 1.0 * k);
  dragon(sink, ridge + 0.14, c0 - 0.35, -1, 1.0 * k);
  // ---- the ridge turret: its base astride the ridge, the open belfry, the skirt, the second stage and the spire
  const tz = (c0 + c1) / 2, ts = 0.8 * k, tb = ridge - 0.6;
  sink.span('structureWood', -ts, tb, tz - ts, ts, tb + 1.7, tz + ts, { colour: TAR });
  const belfry = tb + 1.7;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    sink.span('structureWood', sx * ts - (sx > 0 ? 0.16 : 0), belfry, sz * ts - (sz > 0 ? 0.16 : 0) + tz, sx * ts + (sx > 0 ? 0 : 0.16), belfry + 1.05,
      sz * ts + (sz > 0 ? 0 : 0.16) + tz, { colour: TAR });
  }
  sink.span('structureWood', -ts - 0.04, belfry + 1.05, tz - ts - 0.04, ts + 0.04, belfry + 1.2, tz + ts + 0.04, { colour: TAR_LIGHT });
  // the skirt: a low pyramid frustum, then the second stage and the spire
  revolve(sink, 'structureWood', 0, tz, [[ts * 1.55, belfry + 1.2], [ts * 0.72, belfry + 1.75]], 4, { colour: SHINGLE }, Math.PI / 4);
  sink.span('structureWood', -ts * 1.1, belfry + 1.16, tz - ts * 1.1, ts * 1.1, belfry + 1.2, tz + ts * 1.1, { colour: TAR });
  const s2 = ts * 0.62;
  sink.span('structureWood', -s2, belfry + 1.55, tz - s2, s2, belfry + 2.45, tz + s2, { colour: TAR });
  const spireTop = belfry + 2.45 + 4.6 * k;
  revolve(sink, 'structureWood', 0, tz, [[s2 * 1.5, belfry + 2.45], [0.04, spireTop]], 4, { colour: SHINGLE }, Math.PI / 4);
  sink.span('structureWood', -s2 * 1.06, belfry + 2.41, tz - s2 * 1.06, s2 * 1.06, belfry + 2.45, tz + s2 * 1.06, { colour: TAR });
  cross(sink, 'structureMetal', 0, spireTop - 0.05, tz, 0.9, 'latin', IRON);
  // ---- the chancel: its walls, its gable with a cross at the east end, the apse under its cone and its round tower
  sink.span('structureWood', -hw, sill, h0, hw, aisleTop, a0, { colour: TAR });
  staves(sink, hw, h0, [0, 0, 1], [1, 0, 0], a0 - h0, sill + 0.02, aisleTop - 0.4);
  staves(sink, -hw, h0, [0, 0, 1], [-1, 0, 0], a0 - h0, sill + 0.02, aisleTop - 0.4);
  const hr = gable(sink, hw, h0, a0, aisleTop, 55, 0.3, 0.05, SHINGLE);
  cross(sink, 'structureWood', 0, hr + 0.14, h0 + 0.2, 0.9, 'latin', TAR);
  // (the apse a full drum whose west half stands inside the chancel: what shows is its round east end)
  const ar = 1.7 * k, apseTop = aisleTop - 0.5;
  revolve(sink, 'structureWood', 0, h0, [[ar, sill], [ar, apseTop]], 14, { colour: TAR });
  const rt = 0.62 * k, rtTop = apseTop + 2.5;
  revolve(sink, 'structureWood', 0, h0, [[ar, apseTop - 0.15], [ar + 0.3, apseTop - 0.15], [rt + 0.01, apseTop + 1.5]], 14, { colour: SHINGLE });
  revolve(sink, 'structureWood', 0, h0, [[rt, apseTop + 1.2], [rt, rtTop]], 10, { colour: TAR });
  revolve(sink, 'structureWood', 0, h0, [[rt, rtTop - 0.05], [rt + 0.18, rtTop - 0.05], [0.03, rtTop + 1.9 * k]], 10, { colour: SHINGLE });
  void look;
  return { parts: sink.finish() };
};
