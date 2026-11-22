// src/world/landmarks/navajo.ts — Monument Valley's trading post and hogans (landmarks-271, 2026-11-06). Titan Gorge is
// Monument Valley: the census (buildings-270 signature places) names "a stone trading post under the cliff at
// Goulding's, earth-covered hogans" and the sheep corrals of juniper posts as what is built there, and found them missing.
//
// - tradingPost: Goulding's: a two-storey block of the valley's red sandstone laid as random rubble in irregular courses
//   (each course its own height, setback and run of stones), set on a stepped bench of slickrock with fallen slabs at its
//   edge; an asymmetric front (the wide shop window, the off-centre door, the bay to the right without a porch) under a
//   stepped parapet whose high part carries the hand-lettered sign; the porch of peeled posts on its corbels, its stone
//   steps; the vigas through the wall, canales and the back chimney; the outside stair up the -x end to the upper door;
//   the single-storey wareroom beside it; sand banked against the back; the hitching rail of juniper posts, the gas
//   pumps and the beaten yard out front.
// - hogan: the Diné dwelling: a low earth mound (8 m across, under 3 m high), slumped and lumpy, over eight-sided cribbed
//   juniper logs that show at its foot; the smoke hole's log frame and the stovepipe at the crown; the door on the east
//   (+z) in a short entry of upright logs under its own earth, with a plank door; red sand drifted on the windward side;
//   the brush ramada (shade house) on forked juniper posts at -x; the worn paths to the ramada and to the gate of
//   (`corral`) the sheep corral of juniper posts and brush beside it (+x).
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink, in the map kit's stone
// (no draw call of their own). Walls, the mound and the stair's mass are structure; the rubble skin, the bench, the
// porch, pumps, rails, the ramada, sand and paths are dressing.
import { LocalFrame, PartSink, facePoint, faceBox, rgb, shade, type EmitOptions, type Face, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, extrude, revolve } from './kit.ts';
import { letterText } from './lettering.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const POST = rgb(0x8a7458), VIGA = rgb(0x6a5440), EARTH = rgb(0xa05e3c), PUMP = rgb(0xb2302a), SIGN = rgb(0xe2d6b8);
const JUNIPER = rgb(0x6e604e), LOG = rgb(0x7d6a55), CHINK = rgb(0x8a5a40), PLANK = rgb(0x8f7f66), BRUSH = rgb(0x8c7a52);
const FRAME = rgb(0x4a6a72), DOOR_PAINT = rgb(0x3e5a6a), LETTER = rgb(0x6a2a20), SAND = rgb(0xbf8258), TRODDEN = rgb(0xb3906c);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** An opening a rubble skin runs round (face u and heights). */
interface Hole { u0: number; u1: number; y0: number; y1: number }

/** A face rectangle's four corners `o` out of the face, counter-clockwise seen from outside. */
const fq = (face: Face, u0: number, u1: number, y0: number, y1: number, o: number): [Vec3, Vec3, Vec3, Vec3] =>
  [facePoint(face, u0, y0, o), facePoint(face, u1, y0, o), facePoint(face, u1, y1, o), facePoint(face, u0, y1, o)];

/**
 * Random rubble on a face, from y0 up to y1 between u0 and u1: courses 0.35–0.8 m high, each broken into runs of 1.2–3.5 m
 * that stand their own 5–13 cm proud, each with its own print of the stone (offset, scale and a tilt of a few degrees),
 * so neither the courses' joints nor their heights line up; the openings left as reveals. `ragged`: the wall's top
 * eroded, each run's top a little high or low; `long` lengthens the runs (a back wall). Dressing over the structural wall.
 */
function rubble(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, holes: readonly Hole[], v: () => number, ragged = false, long = 1): void {
  let y = y0;
  while (y < y1 - 0.05) {
    const h = 0.45 + v() * 0.5;
    const yt = y + h > y1 - 0.3 ? y1 : y + h;
    const cuts = holes.filter((o) => o.y0 < yt - 0.02 && o.y1 > y + 0.02).sort((a, b) => a.u0 - b.u0);
    const runs: Array<[number, number]> = [];
    let u = u0;
    for (const o of cuts) { if (o.u0 > u + 0.05) runs.push([u, Math.min(o.u0, u1)]); u = Math.max(u, o.u1); }
    if (u1 > u + 0.05) runs.push([u, u1]);
    for (const [a, b] of runs) {
      let s = a;
      while (s < b - 0.05) {
        let e = Math.min(b, s + (1.6 + v() * 2.6) * long);
        if (b - e < 0.8) e = b;
        const t = 0.05 + v() * 0.08, k = 0.8 + v() * 0.5, rot = (v() - 0.5) * 0.09, top = yt >= y1 && ragged ? yt + (v() - 0.6) * 0.18 : yt;
        const cu = face.u, c = Math.cos(rot) * k, sn = Math.sin(rot) * k;
        const opts: EmitOptions = {
          decor: true, shade: (y < y0 + 0.6 ? 0.8 : 0.86) + v() * 0.18,
          uv: { kind: 'plane', origin: facePoint(face, s - v() * 4, y - v() * 3, 0), u: [cu[0] * c, sn, cu[2] * c], v: [-cu[0] * sn, c, -cu[2] * sn] },
        };
        sink.quad('stone', ...fq(face, s, e, y, top, t), opts);
        sink.quad('stone', facePoint(face, s, top, t), facePoint(face, e, top, t), facePoint(face, e, top, 0), facePoint(face, s, top, 0), opts);
        // (the ends only at an opening's reveal or the wall's end: a step between two runs is a few centimetres)
        if (s === a) sink.quad('stone', facePoint(face, s, y, 0), facePoint(face, s, y, t), facePoint(face, s, top, t), facePoint(face, s, top, 0), opts);
        if (e === b) sink.quad('stone', facePoint(face, e, y, t), facePoint(face, e, y, 0), facePoint(face, e, top, 0), facePoint(face, e, top, t), opts);
        s = e;
      }
    }
    y = yt;
  }
}

/**
 * A bank of sand or earth laid against something: `at(t, o)` the ground point at t (0–1 along it) and o metres out, its
 * crest `h` over `y0` at the wall falling to the toe `out` metres off on the ground; humped along its length, its ends
 * run out to nothing. Dressing in the vertex-coloured wood bucket (the ground's own colour).
 */
function bank(sink: PartSink, at: (t: number, o: number) => readonly [number, number], y0: number, h: number, out: number,
  g: (x: number, z: number) => number, v: () => number, colour: Rgb, n = 6): void {
  const rows: Vec3[][] = [[], [], []], skew = (v() - 0.5) * 0.5;
  for (let i = 0; i <= n; i++) {
    // (one hump, leant toward one end, its crest wandering ±8 %)
    const t = i / n, bump = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t + skew * t * (1 - t)))), 0.6) * (0.92 + v() * 0.16), o = out * (0.35 + 0.65 * bump);
    const [wx, wz] = at(t, 0), [mx, mz] = at(t, o * 0.42), [tx, tz] = at(t, o);
    const wy = Math.max(y0, g(wx, wz)) + h * bump, ty = g(tx, tz) - 0.08;
    rows[0].push([tx, ty, tz]);
    rows[1].push([mx, Math.max(g(mx, mz) - 0.04, lerp(wy, ty, 0.5) + 0.06 * bump), mz]);
    rows[2].push([wx, wy, wz]);
  }
  const opts: EmitOptions = { decor: true, colourAt: (p) => shade(colour, 0.9 + 0.08 * Math.sin(p[0] * 1.7 + p[2] * 2.3) + 0.04 * Math.min(1, p[1])) };
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) sink.quad('structureWood', rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i], opts);
}

/** A worn path on the ground through `pts` (x, z), `w` wide, draped 5 cm over it. */
function path(sink: PartSink, pts: ReadonlyArray<readonly [number, number]>, w: number, g: (x: number, z: number) => number, colour: Rgb): void {
  // the path's line in steps of at most 1.2 m, so it follows the ground
  const line: Array<[number, number]> = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
    for (let k = 0; k < steps; k++) line.push([lerp(ax, bx, k / steps), lerp(az, bz, k / steps)]);
  }
  line.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  const edge = line.map(([x, z], i): [Vec3, Vec3] => {
    const [px, pz] = line[Math.max(0, i - 1)], [nx, nz] = line[Math.min(line.length - 1, i + 1)];
    const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, end = i === 0 || i === line.length - 1 ? 0.6 : 1;
    const ox = (-dz / l) * w / 2 * end, oz = (dx / l) * w / 2 * end;
    return [[x + ox, g(x + ox, z + oz) + 0.05, z + oz], [x - ox, g(x - ox, z - oz) + 0.05, z - oz]];
  });
  const opts: EmitOptions = { decor: true, ground: true, colourAt: (p) => shade(colour, 0.94 + 0.06 * Math.sin(p[0] * 2.1 + p[2] * 1.3)) };
  for (let i = 0; i + 1 < edge.length; i++) {
    // wound to face up whichever way the line runs
    const [l0, r0] = edge[i], [l1, r1] = edge[i + 1];
    const ny = (r0[2] - l0[2]) * (l1[0] - l0[0]) - (r0[0] - l0[0]) * (l1[2] - l0[2]);
    if (ny >= 0) sink.quad('structureWood', l0, r0, r1, l1, opts); else sink.quad('structureWood', l0, l1, r1, r0, opts);
  }
}

/** A rock or a fallen slab on the ground: a box turned `yaw` and tipped `tilt` about its own x, half sunk. */
function slab(sink: PartSink, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, tilt: number, shadeK: number): void {
  const ax: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)], az0: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const ay: Vec3 = [az0[0] * Math.sin(tilt), Math.cos(tilt), az0[2] * Math.sin(tilt)];
  const az: Vec3 = [az0[0] * Math.cos(tilt), -Math.sin(tilt), az0[2] * Math.cos(tilt)];
  const c: Vec3 = [x, y, z];
  sink.box('stone', c, [sx / 2, sy / 2, sz / 2], { decor: true, shade: shadeK }, new LocalFrame(ax, ay, az, c), { ny: true });
}

/** A slickrock ledge's outline: a rounded rectangle (x0..x1, z0..z1) at height y, its edge wandering a little. */
function ledge(x0: number, x1: number, z0: number, z1: number, y: number, v: () => number, round = 0.35, n = 16): Vec3[] {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), j = 1 + (v() - 0.5) * 0.05;
    pts.push([cx + Math.sign(c) * Math.pow(Math.abs(c), round) * hx * j, y, cz + Math.sign(s) * Math.pow(Math.abs(s), round) * hz * j]);
  }
  return pts;
}

/**
 * A window in a rubble wall: the dark void, its painted frame set back in the reveal, the glazing bars, the timber
 * lintel over it and the stone sill under it. Returns the hole the rubble runs round.
 */
function windowIn(sink: PartSink, face: Face, u: number, y0: number, y1: number, w: number, lights: number, v: () => number): Hole {
  const u0 = u - w / 2, u1 = u + w / 2, fw = 0.08, paint = shade(FRAME, 0.8 + v() * 0.35);
  sink.quad('dark', ...fq(face, u0, u1, y0, y1, 0.004), { decor: true });
  const frame: EmitOptions = { colour: paint, decor: true };
  sink.quad('structureWood', ...fq(face, u0, u0 + fw, y0, y1, 0.035), frame);
  sink.quad('structureWood', ...fq(face, u1 - fw, u1, y0, y1, 0.035), frame);
  sink.quad('structureWood', ...fq(face, u0 + fw, u1 - fw, y1 - fw, y1, 0.035), frame);
  sink.quad('structureWood', ...fq(face, u0 + fw, u1 - fw, y0, y0 + fw, 0.035), frame);
  const bars: EmitOptions = { colour: paint, decor: true, fine: 'near' };
  for (let k = 1; k < lights; k++) { const m = lerp(u0, u1, k / lights); sink.quad('structureWood', ...fq(face, m - 0.03, m + 0.03, y0 + fw, y1 - fw, 0.04), bars); }
  if (lights > 2) { const ym = lerp(y0, y1, 0.62); sink.quad('structureWood', ...fq(face, u0 + fw, u1 - fw, ym - 0.03, ym + 0.03, 0.04), bars); }
  // the lintel: a squared timber longer one side than the other; the sill: a slab of the same stone
  const lh = 0.2 + v() * 0.06;
  faceBox(sink, 'structureWood', face, u + (v() - 0.5) * 0.2, y1 + lh / 2, 0.08, w + 0.45 + v() * 0.35, lh, 0.16, { colour: shade(VIGA, 0.8 + v() * 0.3), decor: true }, 'ends');
  faceBox(sink, 'stone', face, u + (v() - 0.5) * 0.1, y0 - 0.07, 0.1, w + 0.2 + v() * 0.25, 0.14, 0.2, { decor: true, shade: 0.9 }, { ends: true, bottom: true });
  return { u0, u1, y0, y1 };
}

/** A plank door (`colour`) in a rubble wall, from its threshold at y0, with its lintel and its stone threshold. */
function doorIn(sink: PartSink, face: Face, u: number, y0: number, w: number, h: number, colour: Rgb, v: () => number): Hole {
  sink.quad('dark', ...fq(face, u - w / 2, u + w / 2, y0, y0 + h, 0.004), { decor: true });
  faceBox(sink, 'structureWood', face, u, y0 + (h - 0.06) / 2, 0.04, w - 0.12, h - 0.06, 0.05, { colour, decor: true });
  for (let k = 1; k < 4; k++) {
    const m = lerp(u - w / 2 + 0.06, u + w / 2 - 0.06, k / 4);
    sink.quad('structureWood', ...fq(face, m - 0.015, m + 0.015, y0 + 0.05, y0 + h - 0.1, 0.067), { colour: shade(colour, 0.55), decor: true, fine: 'near' });
  }
  const lh = 0.22;
  faceBox(sink, 'structureWood', face, u + (v() - 0.5) * 0.2, y0 + h + lh / 2, 0.08, w + 0.6 + v() * 0.3, lh, 0.16, { colour: shade(VIGA, 0.85), decor: true });
  faceBox(sink, 'stone', face, u, y0 - 0.06, 0.18, w + 0.3, 0.12, 0.36, { decor: true, shade: 0.85 });
  return { u0: u - w / 2, u1: u + w / 2, y0, y1: y0 + h };
}

/** Goulding's trading post: the main block (`width` x `depth`, two storeys), the wareroom at +x, the porch at +z. */
export const tradingPost: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, g = (x: number, z: number): number => ctx.ground?.(x, z) ?? 0;
  const W = num(ctx, 'width', 10, 24), D = num(ctx, 'depth', 8, 16), foot = -0.6 - ctx.groundFall;
  const x0 = -W / 2 - 3, x1 = x0 + W, cx = (x0 + x1) / 2;
  const wx0 = x1, wx1 = x1 + 6, wz0 = -D * 0.4, wz1 = D * 0.4 - 0.5, wcx = (wx0 + wx1) / 2;
  const pz = D / 2 + 3.0;
  // the bench lifts with the ground along the front, so the porch is never buried where the front stands higher
  const L = Math.min(ctx.groundFall, Math.max(0, ...[x0, cx, x1, wx1].map((x) => g(x, D / 2 + 1))));
  const bench0 = L + 0.3, bench1 = L + 0.65, FL = L + 0.8, UF = FL + 3.2, H = FL + 6.1, Hhi = H + 1.2, Hlo = H + 0.6, Hw = FL + 3.15;
  const step = x0 + W * 0.6, yb = bench1 - 0.05;

  // ---- the rock bench: two ledges of slickrock under the block, the wareroom and the porch, fallen slabs at its edge
  const rockUv = (s: number): EmitOptions['uv'] => ({ kind: 'plane', origin: [cx, 0, 0], u: [0.09 * s, 0, 0.05 * s], v: [0, 0.12 * s, 0.04 * s] });
  extrude(sink, 'stone', ledge(x0 - 1.8, wx1 + 1.6, -D / 2 - 2.0, pz + 1.3, bench0, v, 0.5), [0, -1, 0], bench0 - foot, { decor: true, shade: 0.82, uv: rockUv(1) });
  extrude(sink, 'stone', ledge(x0 - 0.9, wx1 + 0.7, -D / 2 - 0.8, pz + 0.35, bench1, v), [0, -1, 0], bench1 - bench0 + 0.1, { decor: true, shade: 0.93, uv: rockUv(1.3) });
  for (const [x, z, s] of [[x0 - 1.2, D / 2 + 1.2, 0.9], [wx1 + 1.6, -D / 2, 0.8], [x1 - 1, pz + 1.6, 0.7], [x0 + 3, -D / 2 - 2.0, 1.1]] as const) {
    slab(sink, x, g(x, z) + 0.12 * s, z, 1.6 * s, 0.45 * s, 1.0 * s, v() * 3, 0.2 + v() * 0.25, 0.8 + v() * 0.15);
  }

  // ---- the block: structural walls and stepped parapets (the high part over the shop's left two-thirds is the sign's)
  sink.span('stone', x0, foot, -D / 2, x1, H, D / 2, {});
  for (const [a, b, c, d, top] of [[x0, D / 2 - 0.35, step, D / 2, Hhi], [step, D / 2 - 0.35, x1, D / 2, Hlo], [x0, -D / 2, x1, -D / 2 + 0.35, Hlo],
    [x0, -D / 2, x0 + 0.35, D / 2 - 1.3, Hlo], [x0, D / 2 - 1.3, x0 + 0.35, D / 2, Hhi], [x1 - 0.35, -D / 2, x1, D / 2, Hlo]] as const) sink.span('stone', a, H, b, c, top, d, {});
  const front: Face = { origin: [cx, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const back: Face = { origin: [cx, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
  const left: Face = { origin: [x0, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
  const right: Face = { origin: [x1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
  // the front: the wide shop window and the door off the middle, two windows in the right bay; four upper windows that
  // keep to no grid of the ground floor's
  const fu = (k: number): number => -W / 2 + W * k + (v() - 0.5) * 0.3;
  const holes: Hole[] = [];
  holes.push(windowIn(sink, front, fu(0.17), FL + 0.5, FL + 2.2, Math.min(3.0, W * 0.19), 3, v));
  const ud = fu(0.39), xd = cx + ud;
  holes.push(doorIn(sink, front, ud, FL, 1.3, 2.25, DOOR_PAINT, v));
  for (const k of [0.62, 0.84]) holes.push(windowIn(sink, front, fu(k), FL + 0.75 + v() * 0.08, FL + 2.15, 0.95 + v() * 0.15, 2, v));
  for (const k of [0.11, 0.33, 0.6, 0.86]) holes.push(windowIn(sink, front, fu(k), FL + 3.6 + v() * 0.1, FL + 4.85 + v() * 0.08, 0.85 + v() * 0.2, 2, v));
  rubble(sink, front, -W / 2 - 0.13, step - cx, yb, Hhi, holes, v, true);
  rubble(sink, front, step - cx, W / 2 + 0.13, yb, Hlo, holes, v, true);
  // the back: few small windows, the back door, the chimney stack up the wall
  const bh: Hole[] = [windowIn(sink, back, -W * 0.28, FL + 0.9, FL + 2.0, 0.8, 2, v), windowIn(sink, back, W * 0.12, FL + 3.8, FL + 4.8, 0.8, 2, v),
    doorIn(sink, back, W * 0.3, FL, 1.0, 2.1, shade(PLANK, 0.8), v)];
  rubble(sink, back, -W / 2 - 0.13, W / 2 + 0.13, yb, Hlo, bh, v, true, 1.8);
  const chu = -W * 0.06;
  faceBox(sink, 'stone', back, chu, (FL + 2.6 + Hlo + 1.5) / 2, 0.3, 1.1, Hlo + 1.5 - FL - 2.6, 0.6, { shade: 0.88 });
  faceBox(sink, 'stone', back, chu, Hlo + 1.58, 0.32, 1.25, 0.16, 0.7, { decor: true, shade: 0.8 });
  // the -x end: the upper door off the stair's landing, a window over the stair's foot
  const zl0 = -D / 2 + 0.25, zl1 = -D / 2 + 2.0, sxa = x0 - 1.25, zf = D / 2 - 0.7, riser = 11;
  const lh: Hole[] = [doorIn(sink, left, -D / 2 + 1.1, UF, 0.95, 2.0, shade(PLANK, 0.9), v), windowIn(sink, left, D / 2 - 2.5, FL + 3.7, FL + 4.75, 0.85, 2, v)];
  const hid = (f: number): Hole => ({ u0: zl0 + 0.1, u1: lerp(zf, zl1, f) - 0.1, y0: yb - 0.1, y1: lerp(bench1, UF, f) - 0.4 });
  rubble(sink, left, -D / 2, D / 2 - 1.3, yb, Hlo, [...lh, hid(0.15), hid(0.5), hid(0.85)], v, true, 1.6);
  rubble(sink, left, D / 2 - 1.3, D / 2, yb, Hhi, [], v, true);
  // the +x end: above the wareroom's roof, and the strips either side of it
  rubble(sink, right, -D / 2, D / 2, Hw + 0.2, Hlo, [], v, true, 2);
  rubble(sink, right, -D / 2, -wz1, yb, Hw + 0.2, [], v);
  rubble(sink, right, -wz0, D / 2, yb, Hw + 0.2, [], v);
  // the vigas' ends through the front wall under the parapet, each its own length, and the canales through the parapets
  for (let u = x0 + 0.6 + v() * 0.3; u < x1 - 0.4; u += 1.3 + v() * 0.5) {
    bar(sink, 'structureWood', [u, H - 0.45, D / 2], [u + (v() - 0.5) * 0.06, H - 0.45 + (v() - 0.5) * 0.06, D / 2 + 0.3 + v() * 0.3], 0.2, { colour: shade(VIGA, 0.75 + v() * 0.35), decor: true, fine: true });
  }
  for (const [a, b] of [[[x1 - 1.6, H + 0.12, -D / 2], [x1 - 1.6, H + 0.02, -D / 2 - 0.7]], [[x1 - 0.8, H + 0.12, D / 2], [x1 - 0.8, H + 0.02, D / 2 + 0.7]]] as const) {
    bar(sink, 'structureWood', a, b, 0.2, { colour: shade(VIGA, 0.7), decor: true });
  }
  bar(sink, 'structureMetal', [x0 + 1.4, H, -D / 2 + 1.4], [x0 + 1.4, H + 1.9, -D / 2 + 1.4], 0.13, { colour: rgb(0x333333), decor: true });
  // the sign board on the high parapet: three planks, hand-lettered in two lines
  const bw = Math.min(W * 0.6 - 0.9, 6.4), bu0 = (x0 + step) / 2 - bw / 2 + (v() - 0.5) * 0.4, bu1 = bu0 + bw, by0 = H + 0.02, by1 = H + 1.32;
  for (let k = 0; k < 3; k++) {
    const y0 = lerp(by0, by1, k / 3) + 0.015, y1 = lerp(by0, by1, (k + 1) / 3) - 0.015;
    sink.span('structureWood', bu0, y0, D / 2 + 0.14, bu1, y1, D / 2 + 0.2, { colour: shade(SIGN, 0.88 + v() * 0.14), decor: true });
  }
  for (const x of [bu0 + 0.3, bu1 - 0.3]) bar(sink, 'structureWood', [x, by0 - 0.1, D / 2 + 0.22], [x, by1 + 0.12, D / 2 + 0.22], 0.08, { colour: shade(VIGA, 0.9), decor: true, fine: 'near' });
  const board: Face = { origin: [(bu0 + bu1) / 2, 0, D / 2 + 0.2], u: [1, 0, 0], out: [0, 0, 1], width: bw };
  letterText(sink, 'structureWood', board, "GOULDING'S", (v() - 0.5) * 0.15, by0 + 0.62, { capHeight: 0.55, maxWidth: bw - 0.7, weight: 0.8, colour: LETTER });
  letterText(sink, 'structureWood', board, 'TRADING POST', (v() - 0.5) * 0.15, by0 + 0.15, { capHeight: 0.36, maxWidth: bw - 1.0, weight: 0.8, colour: LETTER });

  // ---- the porch over the shop's left two-thirds: plank deck on the bench, peeled posts on corbels, the shed roof
  const xa = x0 + 0.3, xb = x0 + W * 0.72;
  sink.span('structureWood', xa, bench1 - 0.02, D / 2, xb, FL, pz, { colour: shade(PLANK, 0.85), decor: true });
  const posts = Math.max(3, Math.round((xb - xa) / 3.2));
  for (let k = 0; k <= posts; k++) {
    const x = lerp(xa + 0.15, xb - 0.15, k / posts) + (k > 0 && k < posts ? (v() - 0.5) * 0.5 : 0), lean = (v() - 0.5) * 0.08;
    bar(sink, 'structureWood', [x, FL - 0.02, pz - 0.2], [x + lean, FL + 2.55, pz - 0.2], 0.2, { colour: shade(POST, 0.85 + v() * 0.25), decor: true });
    sink.span('structureWood', x + lean - 0.38, FL + 2.5, pz - 0.31, x + lean + 0.38, FL + 2.62, pz - 0.09, { colour: shade(VIGA, 0.9), decor: true });
  }
  sink.span('structureWood', xa - 0.1, FL + 2.62, pz - 0.33, xb + 0.1, FL + 2.9, pz - 0.07, { colour: VIGA, decor: true });
  sink.quad('structureWood', [xa - 0.2, FL + 2.84, pz + 0.35], [xb + 0.2, FL + 2.84, pz + 0.35], [xb + 0.2, FL + 3.2, D / 2], [xa - 0.2, FL + 3.2, D / 2], { colour: shade(PLANK, 0.75) });
  sink.quad('structureWood', [xb + 0.2, FL + 2.82, pz + 0.35], [xa - 0.2, FL + 2.82, pz + 0.35], [xa - 0.2, FL + 3.18, D / 2], [xb + 0.2, FL + 3.18, D / 2], { colour: shade(VIGA, 0.55), decor: true });
  sink.span('structureWood', xa - 0.2, FL + 2.7, pz + 0.33, xb + 0.2, FL + 2.86, pz + 0.38, { colour: shade(PLANK, 0.65), decor: true });
  // the bench by the door and the stone steps down off the deck at the door
  sink.span('structureWood', xa + 0.6, FL, D / 2 + 0.25, xa + 2.8, FL + 0.45, D / 2 + 0.7, { colour: VIGA, decor: true });
  sink.span('stone', xd - 1.1, bench0 - 0.05, pz - 0.05, xd + 1.1, FL - 0.15, pz + 0.55, { decor: true, shade: 0.88 });
  sink.span('stone', xd - 1.3, bench0 - 0.2, pz + 0.5, xd + 1.3, bench0 + 0.17, pz + 1.0, { decor: true, shade: 0.84 });

  // ---- the outside stair up the -x end to the upper door: its rubble mass against the wall, the treads, a pole rail
  extrude(sink, 'stone', [[sxa, foot, zf + 0.3], [sxa, bench1 - 0.25, zf + 0.3], [sxa, UF - 0.02, zl1 - 0.3], [sxa, UF - 0.02, zl0], [sxa, foot, zl0]], [1, 0, 0], 1.27, { shade: 0.9 });
  for (let k = 0; k < riser; k++) {
    const y = lerp(bench1, UF, (k + 1) / riser), za = lerp(zf, zl1, (k + 1) / riser), zb = lerp(zf, zl1, k / riser) + 0.06;
    // (its top, its riser and its outer end: the rest is in the mass, the wall and the next tread)
    const xo = sxa - 0.04 - v() * 0.06;
    sink.box('stone', [(xo + x0) / 2, y - 0.18, (za + zb) / 2], [(x0 - xo) / 2, 0.18, (zb - za) / 2], { decor: true, shade: 0.82 + v() * 0.16 }, undefined, { px: true, ny: true, nz: true });
  }
  sink.span('stone', sxa - 0.06, UF - 0.14, zl0 - 0.05, x0, UF + 0.04, zl1, { decor: true, shade: 0.88 });
  const railTop: Vec3[] = [[sxa + 0.06, FL + 1.0, zf - 0.4], [sxa + 0.06, lerp(bench1, UF, 0.55) + 0.95, lerp(zf, zl1, 0.55)], [sxa + 0.06, UF + 0.95, zl1 - 0.2], [sxa + 0.06, UF + 0.95, zl0 + 0.1]];
  railTop.forEach((p, i) => {
    bar(sink, 'structureWood', [p[0], p[1] - 0.98, p[2]], p, 0.1, { colour: shade(JUNIPER, 0.9 + v() * 0.2), decor: true, fine: true });
    if (i > 0) bar(sink, 'structureWood', railTop[i - 1], p, 0.08, { colour: JUNIPER, decor: true, fine: true });
  });

  // ---- the wareroom at +x: one storey of the same rubble, its flat roof behind a ragged parapet, a loading door
  sink.span('stone', wx0, foot, wz0, wx1, Hw, wz1, { shade: 0.95 });
  for (const [a, b, c, d] of [[wx0, wz1 - 0.3, wx1, wz1], [wx1 - 0.3, wz0, wx1, wz1], [wx0, wz0, wx1, wz0 + 0.3]] as const) sink.span('stone', a, Hw, b, c, Hw + 0.35, d, { decor: true });
  const wf: Face = { origin: [wcx, 0, wz1], u: [1, 0, 0], out: [0, 0, 1], width: 6 };
  const wr: Face = { origin: [wx1, 0, (wz0 + wz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: wz1 - wz0 };
  const wb: Face = { origin: [wcx, 0, wz0], u: [-1, 0, 0], out: [0, 0, -1], width: 6 };
  const wd = doorIn(sink, wf, 0.3, FL, 2.4, 2.3, shade(PLANK, 0.75), v);
  bar(sink, 'structureWood', [wcx + 0.3, FL + 0.2, wz1 + 0.08], [wcx + 0.3, FL + 2.2, wz1 + 0.08], 0.06, { colour: shade(PLANK, 0.5), decor: true, fine: 'near' });
  rubble(sink, wf, -3, 3.13, yb, Hw + 0.35, [wd], v, true);
  const ww = windowIn(sink, wr, 0, FL + 1.0, FL + 1.9, 0.8, 2, v);
  rubble(sink, wr, -(wz1 - wz0) / 2 - 0.13, (wz1 - wz0) / 2 + 0.13, yb, Hw + 0.35, [ww], v, true, 1.6);
  rubble(sink, wb, -3.13, 3, yb, Hw + 0.35, [], v, true, 2);
  for (let x = wx0 + 0.7 + v() * 0.3; x < wx1 - 0.4; x += 1.1 + v() * 0.4) {
    bar(sink, 'structureWood', [x, Hw - 0.35, wz1], [x, Hw - 0.35 + (v() - 0.5) * 0.05, wz1 + 0.25 + v() * 0.25], 0.18, { colour: shade(VIGA, 0.75 + v() * 0.3), decor: true, fine: true });
  }

  // ---- the sand the wind off the cliff has banked against the back of the block and the wareroom, the water barrels
  bank(sink, (t, o) => [lerp(x1 - 0.5, x0 + 1.0, t), -D / 2 - 0.1 - o], bench1, 0.9 + v() * 0.4, 2.6, g, v, SAND);
  bank(sink, (t, o) => [lerp(wx1 + 0.4, wx0, t), wz0 - 0.1 - o], bench1, 0.55 + v() * 0.25, 2.0, g, v, SAND, 5);
  for (let k = 0; k < 2; k++) sink.cylinder('structureMetal', [x0 - 0.9 + k * 0.85, bench0, -D / 2 - 0.9], 'y', 0.9, 0.36, 8, { colour: shade(rgb(0x3a5a3a), 0.8 + v() * 0.3), decor: true });

  // ---- the yard: the beaten ground off the steps to the pumps and the road, the hitching rail of juniper posts, the pumps
  const pumpX = cx + W * 0.36, pumpZ = pz + 3.0;
  path(sink, [[xd, pz + 0.9], [xd + 0.3, pz + 2.6], [pumpX - 1.2, pumpZ], [pumpX + 1.6, pumpZ - 0.2]], 2.6, g, TRODDEN);
  path(sink, [[xd, pz + 1.0], [xd - 0.6, pz + 3.4], [xd - 1.6, D / 2 + 7.2]], 2.4, g, TRODDEN);
  const hx0 = cx - W * 0.44, hx1 = cx - W * 0.2, hz = pz + 2.1;
  for (const x of [hx0, (hx0 + hx1) / 2 + (v() - 0.5) * 0.6, hx1]) bar(sink, 'structureWood', [x, g(x, hz) - 0.3, hz], [x + (v() - 0.5) * 0.1, g(x, hz) + 1.12, hz], 0.16, { colour: shade(JUNIPER, 0.85 + v() * 0.3), decor: true });
  bar(sink, 'structureWood', [hx0 - 0.3, g(hx0, hz) + 1.02, hz], [hx1 + 0.3, g(hx1, hz) + 1.0 + (v() - 0.5) * 0.08, hz], 0.12, { colour: shade(JUNIPER, 1.05), decor: true });
  // the gas pumps (two, the round-globed visible pumps of the 1930s) on their island
  const gp = g(pumpX, pumpZ);
  sink.span('stone', pumpX - 2.0, gp - 0.25, pumpZ - 0.55, pumpX + 2.0, gp + 0.18, pumpZ + 0.55, { shade: 0.8 });
  for (const k of [-1, 1]) {
    const px = pumpX + k * 1.2;
    sink.span('structureMetal', px - 0.3, gp + 0.18, pumpZ - 0.3, px + 0.3, gp + 2.2, pumpZ + 0.3, { colour: shade(PUMP, 0.85 + v() * 0.2), decor: true });
    sink.cylinder('glass', [px, gp + 2.2, pumpZ], 'y', 0.9, 0.22, 6, { decor: true });
    revolve(sink, 'structureMetal', px, pumpZ, [[0.001, gp + 3.1], [0.25, gp + 3.25], [0.001, gp + 3.45]], 8, { colour: SIGN, decor: true });
  }
  return { parts: sink.finish() };
};

/**
 * The hogan (`radius` to its mound's foot) with its entry on the east (+z), its ramada at -x and, `corral` true, the
 * sheep corral of juniper posts beside it (+x).
 */
export const hogan: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, g = (x: number, z: number): number => ctx.ground?.(x, z) ?? 0;
  const R = num(ctx, 'radius', 2.5, 6), foot = -0.6 - ctx.groundFall, n = 8;
  const Rw = R * 0.85, logTop = 0.72, top = 2.05 + R * 0.2;
  // ---- the eight walls of cribbed juniper: a mud-chinked core, the logs' courses at its foot each running past the
  // corners, the ends crossing the next side's (the earth's foot covers the rest of the walls)
  const corner = (k: number, r: number, y: number): Vec3 => [Math.sin((k + 0.5) / n * Math.PI * 2) * r, y, Math.cos((k + 0.5) / n * Math.PI * 2) * r];
  for (let k = 0; k < n; k++) sink.quad('structureWood', corner(k, Rw, foot), corner(k + 1, Rw, foot), corner(k + 1, Rw, logTop), corner(k, Rw, logTop), { colour: CHINK });
  sink.polygon('structureWood', Array.from({ length: n }, (_, k) => corner(k, Rw - 0.1, logTop)), { colour: CHINK });
  for (let k = 0; k < n; k++) {
    for (let y = 0.12 + (k % 2) * 0.12; y < logTop; y += 0.25) {
      const a = corner(k, Rw + 0.06, y), b = corner(k + 1, Rw + 0.06, y), dx = (b[0] - a[0]) * 0.12, dz = (b[2] - a[2]) * 0.12;
      bar(sink, 'structureWood', [a[0] - dx, y, a[2] - dz], [b[0] + dx, y + (v() - 0.5) * 0.05, b[2] + dz], 0.22, { colour: shade(LOG, 0.7 + v() * 0.35), decor: true });
    }
  }
  // ---- the earth mound over the cribbed roof: sixteen columns, each slumped its own way, from its soffit over the logs
  // to the smoke hole, lighter where the rain has washed it
  const NS = 16, lump = Array.from({ length: NS }, () => (v() - 0.5) * 0.12);
  const prof: Array<[number, number, number]> = [[Rw * 0.9, logTop - 0.08, 0], [Rw + 0.2, logTop, 0.5], [Rw + 0.12, logTop + 0.4, 1], [Rw * 0.93, 1.25, 1],
    [Rw * 0.8, lerp(1.25, top, 0.42), 0.9], [Rw * 0.62, lerp(1.25, top, 0.7), 0.7], [Rw * 0.38, lerp(1.25, top, 0.9), 0.4], [0.55, top, 0]];
  const rings = prof.map(([r, y, w]) => Array.from({ length: NS }, (_, i): Vec3 => {
    const a = (i / NS) * Math.PI * 2, rr = r * (1 + lump[i] * w);
    return [Math.sin(a) * rr, y + lump[(i + 3) % NS] * w * 0.8, Math.cos(a) * rr];
  }));
  const earth: EmitOptions = { colourAt: (p) => shade(EARTH, 0.84 + 0.2 * Math.min(1, Math.max(0, p[1] / top)) + 0.05 * Math.sin(Math.atan2(p[0], p[2]) * 5 + p[1] * 3)) };
  for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < NS; i++) {
    const j = (i + 1) % NS;
    sink.quad('structureWood', rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i], earth);
  }
  sink.polygon('structureWood', rings[rings.length - 1], earth);
  // the smoke hole's frame of four logs at the crown, the stovepipe up through it with its cap
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, b = ((k + 1) / 4) * Math.PI * 2 + Math.PI / 4;
    bar(sink, 'structureWood', [Math.sin(a) * 0.62, top + 0.05, Math.cos(a) * 0.62], [Math.sin(b) * 0.62, top + 0.05, Math.cos(b) * 0.62], 0.16, { colour: shade(LOG, 0.75), decor: true });
  }
  const sp: Vec3 = [-0.15, top - 0.1, -0.1], st = top + 1.0 + v() * 0.3;
  sink.cylinder('structureMetal', sp, 'y', st - sp[1], 0.1, 8, { colour: rgb(0x55524e), decor: true });
  revolve(sink, 'structureMetal', sp[0], sp[2], [[0.001, st + 0.1], [0.24, st + 0.1], [0.001, st + 0.3]], 8, { colour: rgb(0x403d3a), decor: true });
  // ---- the entry on the east: a short passage under its own earth, its face of upright logs round the plank door
  const ez = Rw - 0.45, zf = Rw + 1.45;
  sink.span('structureWood', -0.95, foot, ez, 0.95, 1.85, zf, { colour: CHINK });
  extrude(sink, 'structureWood', [[-1.25, 1.72, Rw * 0.55], [-0.95, 2.08, Rw * 0.55], [0, 2.3, Rw * 0.55], [0.95, 2.08, Rw * 0.55], [1.25, 1.72, Rw * 0.55]], [0, 0, 1], zf + 0.15 - Rw * 0.55, { ...earth, decor: true });
  for (const s of [-1, 1]) bank(sink, (t, o) => [s * (0.95 + o), lerp(s > 0 ? zf - 0.05 : ez, s > 0 ? ez : zf - 0.05, t)], 0, 1.75, 1.1, g, v, EARTH, 4);
  const doorF: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: 1.9 };
  for (const s of [-1, 1]) for (const [u, lean] of [[0.6, 0.02], [0.8, 0.06], [1.0, 0.11]] as const) {
    bar(sink, 'structureWood', [s * u, -0.15, zf + 0.1], [s * (u - lean), 1.98 + v() * 0.1, zf + 0.1], 0.2, { colour: shade(LOG, 0.8 + v() * 0.3), decor: true });
  }
  bar(sink, 'structureWood', [-1.2, 1.95, zf + 0.16], [1.2, 1.97, zf + 0.16], 0.2, { colour: shade(LOG, 0.85), decor: true });
  sink.quad('dark', ...fq(doorF, -0.5, 0.5, 0, 1.85, 0.004), { decor: true });
  faceBox(sink, 'structureWood', doorF, 0, 0.9, 0.05, 0.86, 1.72, 0.06, { colour: shade(PLANK, 0.95), decor: true });
  for (const m of [-0.21, 0, 0.21]) sink.quad('structureWood', ...fq(doorF, m - 0.012, m + 0.012, 0.08, 1.72, 0.081), { colour: shade(PLANK, 0.55), decor: true, fine: 'near' });
  for (const y of [0.35, 1.45]) bar(sink, 'structureWood', [-0.38, y, zf + 0.1], [0.38, y, zf + 0.1], 0.06, { colour: shade(PLANK, 0.8), decor: true, fine: 'near' });
  bar(sink, 'structureWood', [-0.34, 0.38, zf + 0.1], [0.34, 1.42, zf + 0.1], 0.06, { colour: shade(PLANK, 0.8), decor: true, fine: 'near' });
  slab(sink, 0, g(0, zf + 0.45) - 0.02, zf + 0.45, 1.3, 0.16, 0.6, 0.1, 0, 0.85);
  // ---- red sand drifted on the windward side (west, -z) and the north-west, over the logs' foot
  for (const [a0, a1, h] of [[2.45, 4.2, 0.8], [4.6, 5.4, 0.55]] as const) {
    bank(sink, (t, o) => { const a = lerp(a0, a1, t), r = Rw + 0.05 + o; return [Math.sin(a) * r, Math.cos(a) * r]; }, 0, h + v() * 0.3, Math.min(1.5, 0.15 * R + 1.1), g, v, SAND);
  }
  // ---- the ramada at -x: forked juniper posts, two stringers, cross poles and its brush roof; the bench log under it
  // (with the camp: the footprint without the corral holds the hogan alone)
  const camp = ctx.params.corral !== false, rx = -(R + 5.2), rw = 2.1, rd = 1.8;
  if (camp) {
    const rp: Array<[number, number]> = [[-rw, -rd], [0, -rd], [rw, -rd], [-rw, rd], [0, rd], [rw, rd]];
    for (const [ox, oz] of rp) {
      const x = rx + ox + (v() - 0.5) * 0.3, z = oz + (v() - 0.5) * 0.2, gy = g(x, z), hy = gy + 2.35 + v() * 0.2;
      bar(sink, 'structureWood', [x, gy - 0.3, z], [x + (v() - 0.5) * 0.12, hy, z], 0.17, { colour: shade(JUNIPER, 0.85 + v() * 0.3), decor: true });
      for (const s of [-1, 1]) bar(sink, 'structureWood', [x, hy - 0.25, z], [x + s * 0.18, hy + 0.12, z], 0.08, { colour: JUNIPER, decor: true, fine: true });
    }
    const ry = g(rx, 0) + 2.5;
    for (const s of [-1, 1]) bar(sink, 'structureWood', [rx - rw - 0.4, ry, s * rd], [rx + rw + 0.4, ry + (v() - 0.5) * 0.1, s * rd], 0.15, { colour: shade(JUNIPER, 0.9), decor: true });
    for (let k = 0; k < 7; k++) {
      const x = rx - rw - 0.2 + (2 * rw + 0.4) * k / 6;
      bar(sink, 'structureWood', [x, ry + 0.12, -rd - 0.4], [x + (v() - 0.5) * 0.3, ry + 0.12, rd + 0.4], 0.09, { colour: shade(JUNIPER, 1.0 + v() * 0.2), decor: true, fine: true });
    }
    const roof: Vec3[] = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), j = 0.9 + v() * 0.2;
      return [rx + Math.sign(c) * Math.pow(Math.abs(c), 0.5) * (rw + 0.5) * j, ry + 0.45, Math.sign(s) * Math.pow(Math.abs(s), 0.5) * (rd + 0.5) * j];
    });
    extrude(sink, 'structureWood', roof, [0, -1, 0], 0.28, { colourAt: (p) => shade(BRUSH, 0.85 + 0.15 * Math.sin(p[0] * 3.1 + p[2] * 2.2)), decor: true });
    const heap = Array.from({ length: 7 }, (_, i): Vec3 => {
      const a = (i / 7) * Math.PI * 2;
      return [rx + 0.3 * (v() - 0.5) + Math.cos(a) * rw * (0.66 + v() * 0.08), ry + 0.62 + v() * 0.12, Math.sin(a) * rd * (0.66 + v() * 0.08)];
    });
    extrude(sink, 'structureWood', heap, [0, -1, 0], 0.25, { colour: shade(BRUSH, 1.1), decor: true });
    for (let k = 0; k < 10; k++) {
      const p = roof[k % roof.length], a = Math.atan2(p[2], p[0] - rx) + (v() - 0.5) * 0.5, l = 0.5 + v() * 0.5;
      bar(sink, 'structureWood', [p[0] - Math.cos(a) * 0.3, ry + 0.3, p[2] - Math.sin(a) * 0.3], [p[0] + Math.cos(a) * l, ry + 0.1 - v() * 0.3, p[2] + Math.sin(a) * l], 0.06, { colour: shade(BRUSH, 0.8 + v() * 0.3), decor: true, fine: true });
    }
    bar(sink, 'structureWood', [rx - 1.4, g(rx - 1.4, -0.6) + 0.18, -0.6], [rx + 1.2, g(rx + 1.2, -0.9) + 0.18, -0.9], 0.3, { colour: shade(LOG, 0.8), decor: true });
  }
  // ---- the swept ground: the yard off the door, the paths to the ramada and to the corral's gate
  const gateA = Math.PI * 0.8, cx = R + 7.5, cr = 5.0;
  path(sink, [[0, zf + 0.05], [0, zf + 0.55], [0, R + 1.65]], 2.2, g, TRODDEN);
  if (camp) path(sink, [[-0.9, zf + 0.55], [-2.2, zf + 0.2], [-R - 1.2, 3.0], [rx + rw - 0.2, 0.4]], 1.0, g, TRODDEN);
  if (camp) path(sink, [[0.9, zf + 0.55], [2.2, zf + 0.2], [R + 0.8, 3.6], [cx + Math.cos(gateA) * cr, Math.sin(gateA) * cr]], 1.0, g, TRODDEN);
  // ---- the sheep corral beside it: juniper posts leaning every way, rails and brush between, its gate toward the door
  if (camp) {
    const posts = 24, gate = Math.floor(gateA / (Math.PI * 2) * posts);
    for (let k = 0; k < posts; k++) {
      const a = (k / posts) * Math.PI * 2;
      // (each post on its own ground: the hogan is seated on its body alone)
      const x = cx + Math.cos(a) * cr, z = Math.sin(a) * cr, lean = (v() - 0.5) * 0.3, gy = g(x, z);
      bar(sink, 'structureWood', [x, gy - 0.3, z], [x + lean, gy + 1.4 + v() * 0.4, z + lean], 0.13, { colour: shade(JUNIPER, 0.8 + v() * 0.4), decor: true });
      if (k === gate) {
        // the gate's poles slid back and leant against the post
        bar(sink, 'structureWood', [x + 0.1, gy + 1.3, z + 0.1], [x - 0.6, gy - 0.05, z + 1.4], 0.08, { colour: JUNIPER, decor: true });
        continue;
      }
      const b = ((k + 1) / posts) * Math.PI * 2, bx = cx + Math.cos(b) * cr, bz = Math.sin(b) * cr;
      const by = g(bx, bz);
      for (const h of [0.55, 1.1]) bar(sink, 'structureWood', [x, gy + h, z], [bx, by + h + v() * 0.25, bz], 0.09, { colour: JUNIPER, decor: true });
      // the brush woven between the rails, sticks leaning every way
      for (let i = 0; i < 3; i++) {
        const f = (i + 0.5) / 3, mx = x + (bx - x) * f, mz = z + (bz - z) * f, my = gy + (by - gy) * f;
        bar(sink, 'structureWood', [mx - 0.2 + v() * 0.4, my - 0.1, mz - 0.2 + v() * 0.4], [mx - 0.25 + v() * 0.5, my + 1.2 + v() * 0.4, mz - 0.25 + v() * 0.5], 0.05, { colour: shade(JUNIPER, 1.1 + v() * 0.3), decor: true, fine: true });
      }
    }
  }
  return { parts: sink.finish() };
};
