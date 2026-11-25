// src/world/landmarks/damWorks.ts — set pieces of works and stations (landmarks-271, 2026-11-06; the realism pass, 273).
//
// - cablewayTower: Glen Canyon's dam-building years (Skybridge; the census, buildings-270 signature places: "cableway
//   towers and a concrete batch plant, towers 40 m, on the canyon rims"). The head tower of a high-line cableway: a
//   tapered steel lattice on battered concrete pedestals over spread footings, the head frame cantilevered over the
//   span (+z) with its head block, the bull wheel on the head deck and the counterweight box hung off its back, the
//   operator's cab on its platform facing the span, the hoist house at the tower's foot with the haul rope running up
//   to the bull wheel, the paired backstays to their turnbuckles and the deadman anchors buried behind; and (`cable`)
//   the track rope and the haul rope's two strands sagging across the span to the far tower, hung on carriers, the
//   carriage and its concrete bucket on its fall ropes part way.
// - landingPad: an Olympus basin station's pad (Mars; the census: "a landing pad, a sintered pad with a blast wall and
//   a cargo crane, 1 km from the habitat"). The raised sintered-regolith deck with its chamfered edge and the ramp down
//   to the unloading lane, the blast scorch streaked out from its centre, its seams, marking ring and cross, the approach
//   lights, dust banked against its edge and blown onto it; the blast berm of bagged regolith round its station side,
//   the cargo gantry crane straddling the unloading lane, the pad's service module with its airlock, and a lander
//   standing on its legs at the pad's centre.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink (no draw call of their
// own). The legs, footings, berm, module and the lander's body are structure; lattices, cables, lights and markings
// are dressing.
import { LocalFrame, PartSink, normalize3, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { DRESS_PROUD, bar, extrude, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const STEEL = rgb(0x5a5f62), RED_OXIDE = rgb(0x8a3a2a), CABLE = rgb(0x262626), CAB = rgb(0xd2c8a8), BUCKET = rgb(0x5e5e5a);
const SAND = rgb(0xb98656), SHED = rgb(0x8c8b82), SHED_ROOF = rgb(0x7a4a32), WET_CONCRETE = rgb(0x8a8780);
const MARK = rgb(0xd8d2c4), BERM = rgb(0x8a5a42), HULL = rgb(0xc9ccd0), HULL_DARK = rgb(0x3a3c40), LAMP = rgb(0xf2d27a);
const PAD_TOP = rgb(0xa48c7c), PAD_EDGE = rgb(0x907664), DUST = rgb(0xb0704e), SOOT = rgb(0x5e5650);
const TILE = rgb(0x63666c), TILE_JOINT = rgb(0x8a8d92), SEAM = rgb(0x5a4034), SCORCH = rgb(0x2a1e1a);
const LEG = rgb(0x6a6d72), PISTON = rgb(0xb0b4b8), BELL = rgb(0x8a7a6a), BELL_IN = rgb(0x2a2624);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A convex planar polygon turned to face `out`, whichever way its points were written. */
function facing(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], out: Vec3, opts: EmitOptions): void {
  const [a, b, c] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  sink.polygon(bucket, n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** A lattice's lacing between two of its chords (zig-zag every `step` up), dressing; heavy enough to read at range. */
function lace(sink: PartSink, a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3, steps: number, colour: Rgb): void {
  const at = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    bar(sink, 'structureMetal', at(a0, a1, t0), at(b0, b1, t1), 0.14, { colour, decor: true });
    bar(sink, 'structureMetal', at(a0, a1, t1), at(b0, b1, t1), 0.16, { colour, decor: true });
  }
}

/** A sagging rope from a to b (sag at its middle), in `n` straight runs `r` thick; its points. */
function catenary(sink: PartSink, a: Vec3, b: Vec3, sag: number, r: number, n: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  for (let k = 0; k < n; k++) rope(sink, pts[k], pts[k + 1], r);
  return pts;
}

/** A rope's straight run from a to b, `r` thick: a square member without its end caps (the runs abut end to end). */
function rope(sink: PartSink, a: Vec3, b: Vec3, r: number): void {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (length < 1e-3) return;
  const ay: Vec3 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
  const ref: Vec3 = Math.abs(ay[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = normalize3([ay[1] * ref[2] - ay[2] * ref[1], ay[2] * ref[0] - ay[0] * ref[2], ay[0] * ref[1] - ay[1] * ref[0]]);
  const ax = normalize3([ay[1] * out[2] - ay[2] * out[1], ay[2] * out[0] - ay[0] * out[2], ay[0] * out[1] - ay[1] * out[0]]);
  sink.box('structureMetal', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [r / 2, length / 2, r / 2], { colour: CABLE, decor: true },
    new LocalFrame(ax, ay, out, [0, 0, 0]), { py: true, ny: true });
}

/**
 * The cableway's head tower (`height`), its span toward +z; with `cable`, the ropes across `span` metres to the far
 * tower's head (the same height over the far ground: `farRise` the far ground over this one's).
 */
export const cablewayTower: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const H = num(ctx, 'height', 20, 60), B = 9, T = 3, foot = -0.6 - ctx.groundFall, top = 1.6;
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const P = (sx: number, sz: number, y: number): Vec3 => { const w = B + (T - B) * Math.max(0, y) / H; return [sx * w / 2, y, sz * w / 2]; };
  // the footings: each leg on a battered concrete pedestal over its spread footing, its base plate on the pedestal's
  // top, the rust run down the pedestal's two outer faces from the plate
  for (const [sx, sz] of legs) {
    const [cx, , cz] = P(sx, sz, top);
    sink.span('stone', cx - 1.85, foot, cz - 1.85, cx + 1.85, 0.3, cz + 1.85, { shade: 0.84 });
    revolve(sink, 'stone', cx, cz, [[1.25 * Math.SQRT2, 0.3], [0.8 * Math.SQRT2, top], [0.001, top]], 4, { shade: 0.88 + v() * 0.08 }, Math.PI / 4);
    sink.span('structureMetal', cx - 0.72, top, cz - 0.72, cx + 0.72, top + 0.09, cz + 0.72, { colour: shade(RED_OXIDE, 0.7), decor: true });
    for (const axis of [0, 2] as const) {
      const s = axis === 0 ? sx : sz, along = (axis === 0 ? cz : cx) + (v() - 0.5) * 0.6;
      const pt = (out: number, y: number, d: number): Vec3 => axis === 0 ? [cx + s * out, y, along + d] : [along + d, y, cz + s * out];
      const n: Vec3 = axis === 0 ? [s, 0.45, 0] : [0, 0.45, s];
      facing(sink, 'stone', [pt(0.825, top - 0.04, -0.3), pt(0.825, top - 0.04, 0.3), pt(1.27, 0.34, 0.12), pt(1.27, 0.34, -0.16)], n,
        { decor: true, shadeAt: (p) => (p[1] > 1.0 ? 0.55 : 0.78) });
    }
  }
  // the legs: heavy angle members from the plates to the head (structure), battered in; the lacing on all four faces
  // (each face's paint a little different: touched up face by face), the gusset plates where it meets the legs
  for (const [sx, sz] of legs) bar(sink, 'structureMetal', P(sx, sz, top), P(sx, sz, H), 0.6, { colour: RED_OXIDE });
  const panels = Math.max(6, Math.round(H / 4));
  for (let k = 0; k < 4; k++) {
    const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
    lace(sink, P(ax, az, top), P(ax, az, H), P(bx, bz, top), P(bx, bz, H), panels, shade(RED_OXIDE, 0.9 + v() * 0.14));
  }
  for (let k = 1; k < panels; k++) for (const [sx, sz] of legs) {
    const c = P(sx, sz, top + (H - top) * k / panels);
    sink.span('structureMetal', c[0] - 0.42, c[1] - 0.4, c[2] - 0.42, c[0] + 0.42, c[1] + 0.4, c[2] + 0.42, { colour: shade(RED_OXIDE, 0.85), decor: true });
  }
  // the head frame: a deck on the tower's top, the A-frame mast and the boom cantilevered 11 m over the span, laced,
  // its head block with the two great sheaves at the tip
  const hy = H, tip = 11;
  sink.span('structureMetal', -T / 2 - 0.6, hy, -T / 2 - 0.6, T / 2 + 0.6, hy + 0.4, T / 2 + 0.6, { colour: STEEL, decor: true });
  for (const s of [-1, 1]) {
    bar(sink, 'structureMetal', [s * T / 2, hy + 0.4, -T / 2], [s * 1.0, hy + 3.0, T / 2 + tip], 0.45, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * T / 2, hy + 0.4, T / 2], [s * 1.0, hy + 0.7, T / 2 + tip], 0.45, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * T / 2, hy + 5.6, -T / 2 + 0.5], [s * 1.0, hy + 3.0, T / 2 + tip], 0.24, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * T / 2, hy + 0.4, -T / 2 + 0.5], [s * 0.4, hy + 5.6, -T / 2 + 0.5], 0.3, { colour: RED_OXIDE, decor: true });
    lace(sink, [s * T / 2, hy + 0.4, T / 2], [s * 1.0, hy + 0.7, T / 2 + tip], [s * T / 2, hy + 0.4 + 2.6 * T / (T + tip), T / 2], [s * 1.0, hy + 3.0, T / 2 + tip], 5, RED_OXIDE);
  }
  sink.span('structureMetal', -1.3, hy + 0.5, T / 2 + tip - 1.2, 1.3, hy + 3.2, T / 2 + tip + 0.4, { colour: shade(STEEL, 0.8), decor: true });
  for (const s of [-0.65, 0.65]) sink.cylinder('structureMetal', [s - 0.12, hy + 1.85, T / 2 + tip + 0.2], 'x', 0.24, 1.6, 20, { colour: STEEL, decor: true });
  // the bull wheel the haul rope turns on, on its A-frame on the deck; the counterweight box hung off the head's back
  // on its two hangers from the mast
  const wz = 0.2, wy = hy + 2.3;
  sink.cylinder('structureMetal', [-0.18, wy, wz], 'x', 0.36, 1.6, 18, { colour: shade(STEEL, 0.78), decor: true });
  sink.cylinder('structureMetal', [-0.5, wy, wz], 'x', 1.0, 0.3, 8, { colour: STEEL, decor: true });
  for (const s of [-1, 1]) for (const dz of [-0.9, 0.9]) bar(sink, 'structureMetal', [s * 0.42, hy + 0.4, wz + dz], [s * 0.42, wy, wz], 0.16, { colour: RED_OXIDE, decor: true });
  sink.span('stone', -1.3, hy - 1.8, -T / 2 - 2.0, 1.3, hy + 0.4, -T / 2 - 0.6, { shade: 0.78, decor: true });
  for (const s of [-1, 1]) bar(sink, 'structureMetal', [s * 0.4, hy + 5.6, -T / 2 + 0.5], [s * 1.0, hy + 0.4, -T / 2 - 1.9], 0.16, { colour: RED_OXIDE, decor: true });
  // the haul rope from the bull wheel out along the boom to the head block
  bar(sink, 'structureMetal', [0.1, wy + 0.5, wz + 1.5], [0.3, hy + 1.4, T / 2 + tip - 1.1], 0.1, { colour: CABLE, decor: true });
  bar(sink, 'structureMetal', [-0.1, wy - 0.5, wz + 1.5], [0.3, hy + 0.8, T / 2 + tip - 1.1], 0.1, { colour: CABLE, decor: true });
  // the operator's cab on its platform two thirds up, its windows to the span
  const cy = H * 0.62, cw = 3.4;
  const wAt = B + (T - B) * cy / H;
  sink.span('structureMetal', -cw / 2, cy - 0.2, wAt / 2 - 0.2, cw / 2, cy, wAt / 2 + 2.4, { colour: STEEL, decor: true });
  sink.span('structureWood', -cw / 2 + 0.2, cy, wAt / 2 + 0.1, cw / 2 - 0.2, cy + 2.4, wAt / 2 + 2.2, { colour: CAB, decor: true });
  sink.span('glass', -cw / 2 + 0.4, cy + 1.1, wAt / 2 + 2.2, cw / 2 - 0.4, cy + 2.1, wAt / 2 + 2.22, { decor: true });
  sink.span('structureWood', -cw / 2, cy + 2.4, wAt / 2, cw / 2, cy + 2.6, wAt / 2 + 2.4, { colour: shade(CAB, 0.6), decor: true });
  // the platform's brackets back to the legs, its railing, and the caged ladder up the front face from the ground
  for (const s of [-1, 1]) {
    bar(sink, 'structureMetal', [s * cw / 2, cy - 0.2, wAt / 2 + 2.4], P(s, 1, cy - 3.2), 0.2, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * cw / 2, cy + 1.05, wAt / 2], [s * cw / 2, cy + 1.05, wAt / 2 + 2.4], 0.06, { colour: STEEL, decor: true });
    for (const pz of [wAt / 2 + 0.05, wAt / 2 + 2.35]) bar(sink, 'structureMetal', [s * cw / 2, cy, pz], [s * cw / 2, cy + 1.08, pz], 0.05, { colour: STEEL, decor: true });
  }
  const lx = 1.15, lz = (y: number): number => (B + (T - B) * y / H) / 2 + 0.4;
  for (const dx of [-0.25, 0.25]) bar(sink, 'structureMetal', [lx + dx, 0, lz(0)], [lx + dx, cy, lz(cy)], 0.07, { colour: STEEL, decor: true });
  for (let y = 0.6; y < cy - 0.3; y += 0.6) bar(sink, 'structureMetal', [lx - 0.25, y, lz(y)], [lx + 0.25, y, lz(y)], 0.05, { colour: STEEL, decor: true, fine: 'near' });
  // (the cage's hoops: each from one stile out round the climber's back and in to the other)
  for (let y = 3; y < cy - 0.5; y += 1.8) {
    const z = lz(y), hoop: Vec3[] = [[lx - 0.25, y, z], [lx, y, z + 0.75], [lx + 0.25, y, z]];
    for (let i = 0; i < 2; i++) bar(sink, 'structureMetal', hoop[i], hoop[i + 1], 0.05, { colour: STEEL, decor: true, fine: true });
  }
  // the hoist house at the tower's foot behind it: a corrugated-iron shed on its concrete plinth under a rusted gable,
  // its sliding door to the tower, the haul rope's two strands out of the slot over it and up to the bull wheel, its
  // stack; the grime of splash and oil along its wall foot
  const ez0 = -15.6, ez1 = -9.4, ew = 3.0, eh = 4.4;
  sink.span('stone', -ew - 0.3, foot, ez0 - 0.3, ew + 0.3, 0.45, ez1 + 0.3, { shade: 0.86 });
  sink.span('structureMetal', -ew, 0.45, ez0, ew, eh, ez1, { colour: shade(SHED, 0.94 + v() * 0.1) });
  sink.span('structureMetal', -ew - 0.03, 0.45, ez0 - 0.03, ew + 0.03, 1.1, ez1 + 0.03, { colour: shade(SHED, 0.62), decor: true });
  extrude(sink, 'structureMetal', [[-ew - 0.45, eh - 0.1, ez0 - 0.4], [ew + 0.45, eh - 0.1, ez0 - 0.4], [0, eh + 1.7, ez0 - 0.4]], [0, 0, 1], ez1 - ez0 + 0.8,
    { colour: shade(SHED_ROOF, 0.9 + v() * 0.15), decor: true });
  sink.span('dark', -1.6, 0.45, ez1, 0.4, 3.3, ez1 + 0.06, { decor: true });
  sink.span('structureMetal', -2.0, 3.3, ez1, 0.8, 3.5, ez1 + 0.18, { colour: STEEL, decor: true });
  sink.span('dark', 0.6, 3.5, ez1, 1.9, 4.1, ez1 + 0.05, { decor: true });
  for (const s of [-1, 1]) sink.span('glass', s > 0 ? ew : -ew - 0.04, 2.4, ez0 + 1.4, s > 0 ? ew + 0.04 : -ew, 3.4, ez0 + 2.8, { decor: true });
  sink.cylinder('structureMetal', [1.9, eh + 0.3, ez0 + 1.6], 'y', 2.8, 0.25, 8, { colour: shade(SHED_ROOF, 0.6), decor: true });
  bar(sink, 'structureMetal', [0.9, 3.8, ez1 + 0.02], [-0.1, wy - 0.5, wz - 1.55], 0.1, { colour: CABLE, decor: true });
  bar(sink, 'structureMetal', [1.6, 3.8, ez1 + 0.02], [0.1, wy + 0.3, wz - 1.6], 0.1, { colour: CABLE, decor: true });
  // the backstays in pairs from the mast's head down to their turnbuckles and the anchor rods out of the deadmen:
  // concrete blocks buried to their tops behind, the earth heaped over their backs
  const back = num(ctx, 'backstay', 12, 40);
  for (const s of [-1, 1]) {
    const ax = s * 4, az = -back;
    sink.span('stone', ax - 1.6, foot, az - 1.1, ax + 1.6, 0.7, az + 1.1, { shade: 0.82 });
    extrude(sink, 'structureWood', [[ax - 1.9, -0.25, az - 1.9], [ax - 1.9, 0.95, az - 0.6], [ax - 1.9, 0.5, az + 0.5]], [1, 0, 0], 3.8,
      { colour: shade(SAND, 0.88 + v() * 0.12), decor: true });
    for (const d of [-0.5, 0.5]) {
      const head: Vec3 = [s * 0.8 + d * 0.3, hy + 3.6, -T / 2], eye: Vec3 = [ax + d, 1.4, az + 1.7];
      const dl = Math.hypot(head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]);
      const tb: Vec3 = [eye[0] + (head[0] - eye[0]) * 1.3 / dl, eye[1] + (head[1] - eye[1]) * 1.3 / dl, eye[2] + (head[2] - eye[2]) * 1.3 / dl];
      bar(sink, 'structureMetal', [ax + d, 0.55, az + 0.95], eye, 0.14, { colour: shade(RED_OXIDE, 0.6), decor: true });
      bar(sink, 'structureMetal', eye, tb, 0.24, { colour: shade(RED_OXIDE, 0.7), decor: true });
      bar(sink, 'structureMetal', tb, head, 0.12, { colour: CABLE, decor: true });
    }
  }
  // the ropes across the span to the far tower's head: the track rope from the head block's upper sheave, the haul
  // rope's two strands under it, hung from carriers every few runs; the carriage on the track rope with its sheaves,
  // its fall ropes down to the hook block, the bucket of concrete on its bail
  if (ctx.params.cable === true) {
    const span = num(ctx, 'span', 40, 600), rise = Number(ctx.params.farRise) || 0;
    const zt = T / 2 + tip + 0.2;
    const a: Vec3 = [-0.5, hy + 2.4, zt], b: Vec3 = [0.5, hy + 2.4 + rise, span - zt];
    const sag = span * 0.045, n = 32;
    const track = catenary(sink, a, b, sag, 0.26, n);
    for (const [drop, r] of [[1.0, 0.16], [1.75, 0.14]] as const) catenary(sink, [a[0], a[1] - drop, a[2]], [b[0], b[1] - drop, b[2]], sag, r, n);
    let k = Math.round(n * (0.3 + v() * 0.4));
    if (k % 4 === 0) k++;
    for (let c = 4; c < n; c += 4) {
      const p = track[c];
      bar(sink, 'structureMetal', [p[0], p[1] + 0.2, p[2]], [p[0], p[1] - 1.9, p[2]], 0.1, { colour: STEEL, decor: true });
      sink.span('structureMetal', p[0] - 0.22, p[1] - 0.3, p[2] - 0.4, p[0] + 0.22, p[1] + 0.25, p[2] + 0.4, { colour: shade(STEEL, 0.8), decor: true });
    }
    const at = track[k], [x, y, z] = at;
    for (const s of [-1, 1]) sink.span('structureMetal', x + s * 0.32 - 0.06, y - 1.5, z - 1.6, x + s * 0.32 + 0.06, y + 0.4, z + 1.6, { colour: STEEL, decor: true });
    for (const dz of [-1.0, 1.0]) sink.cylinder('structureMetal', [x - 0.3, y + 0.05, z + dz], 'x', 0.6, 0.36, 10, { colour: shade(STEEL, 0.75), decor: true });
    sink.span('structureMetal', x - 0.45, y - 1.75, z - 0.7, x + 0.45, y - 1.45, z + 0.7, { colour: shade(STEEL, 0.85), decor: true });
    for (const dz of [-0.35, 0.35]) bar(sink, 'structureMetal', [x, y - 1.7, z + dz], [x, y - 9.6, z + dz * 0.6], 0.1, { colour: CABLE, decor: true });
    sink.span('structureMetal', x - 0.32, y - 10.5, z - 0.5, x + 0.32, y - 9.5, z + 0.5, { colour: rgb(0xb8902a), decor: true });
    const rim = y - 11.4;
    // (landmarks-world-276, the integrity census: the bail stopped short of the rim and the load stood clear of the
    // bucket's wall) the bail's legs down onto the rim's lip, the concrete out to the wall where it stands
    for (const s of [-1, 1]) bar(sink, 'structureMetal', [x, y - 10.4, z], [x, rim, z + s * 1.58], 0.09, { colour: STEEL, decor: true });
    revolve(sink, 'structureMetal', x, z, [[0.55, rim - 3.2], [1.5, rim - 1.8], [1.7, rim - 0.2], [1.62, rim], [1.5, rim]], 12, { colour: BUCKET, decor: true });
    revolve(sink, 'structureMetal', x, z, [[1.68, rim - 0.3], [0.001, rim - 0.3]], 12, { colour: WET_CONCRETE, decor: true });
    sink.span('structureMetal', x - 0.35, rim - 3.5, z - 0.35, x + 0.35, rim - 3.15, z + 0.35, { colour: shade(BUCKET, 0.7), decor: true });
  }
  return { parts: sink.finish() };
};

/**
 * A lander standing on its legs at (0, 0), a steel cargo ship of the 2090s: the hull in its welded rings under the ogive
 * nose, flared at its aft skirt and sooted above it, the tiled heat shield down its windward (-x) side, the aft flaps
 * and forward canards on its flanks, the engine bay with its sea-level and vacuum bells below the skirt, six shock-strut
 * legs braced to the skirt on their pads (on a deck `deck` over the ground), the cargo hatch (+x) with its deck and the lift tower down to the pad, the
 * crew portholes' ring, the RCS pods.
 */
function lander(sink: PartSink, v: () => number, deck: number): void {
  const R = 4.2, n = 24, base = 3.4, top = base + 15.6;
  const soot = (p: Vec3): Rgb => mix(SOOT, HULL, clamp01((p[1] - base - 0.3) / 3.0));
  revolve(sink, 'structureMetal', 0, 0, [[R * 1.05, base], [R * 1.05, base + 0.4], [R, base + 1.0], [R, base + 3.2], [R, base + 11.4], [R * 0.9, base + 13.4],
    [R * 0.66, base + 14.8], [R * 0.32, top - 0.3], [0.001, top]], n, { colour: HULL, colourAt: soot });
  // the welded rings of the barrel
  for (let y = base + 1.9; y < base + 11.2; y += 1.85) revolve(sink, 'structureMetal', 0, 0, [[R, y], [R + 0.035, y], [R + 0.035, y + 0.07], [R, y + 0.07]], n, { colour: shade(HULL, 0.78), decor: true });
  // the heat shield down the windward half, its edge at the flaps' hinge line: a lighter bed of joints and the tiles
  // over it in staggered courses, each tile's charcoal a little different, so it reads as tiled in any light
  const sy0 = base + 0.6, sh = 10.8, rows = 12, cols = 14, th = sh / rows, dth = Math.PI / cols, rT = R + 0.045 + DRESS_PROUD, gap = 0.035;
  sink.cylinder('structureMetal', [0, sy0, 0], 'y', sh, R + 0.045, cols, { colour: TILE_JOINT, decor: true }, R + 0.045, false, Math.PI / 2, Math.PI);
  for (let j = 0; j < rows; j++) {
    const y0 = sy0 + j * th + gap, y1 = sy0 + (j + 1) * th - gap, off = j % 2 ? -dth / 2 : 0;
    for (let i = 0; i <= cols; i++) {
      const t0 = Math.max(Math.PI / 2, Math.PI / 2 + i * dth + off), t1 = Math.min(Math.PI * 1.5, Math.PI / 2 + (i + 1) * dth + off);
      if (t1 - t0 < dth * 0.3) continue;
      const a0 = t0 + gap / rT, a1 = t1 - gap / rT, am = (a0 + a1) / 2;
      const p = (a: number, y: number): Vec3 => [Math.cos(a) * rT, y, Math.sin(a) * rT];
      facing(sink, 'structureMetal', [p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1)], [Math.cos(am), 0, Math.sin(am)],
        { colour: shade(TILE, 0.82 + v() * 0.3), decor: true });
    }
  }
  // the flaps on the flanks (±z), set a little to windward: the aft pair long and deep, the canards high and short
  for (const s of [-1, 1]) {
    const flap = (y0: number, y1: number, y2: number, r0: number, out: number): void => {
      const P = (y: number, r: number): Vec3 => [-1.25, y, s * r];
      extrude(sink, 'structureMetal', [P(y0, r0), P(y0, r0 + out), P(y1, r0 + out), P(y2, r0)], [1, 0, 0], 0.32, { colour: TILE, decor: true });
    };
    flap(base + 0.8, base + 5.0, base + 6.6, R - 0.4, 2.6);
    flap(base + 11.3, base + 12.6, base + 13.8, R * 0.9 - 0.6, 1.7);
  }
  // the engine bay: three sea-level bells inside, three vacuum bells outboard, open below the skirt, heat-tinted
  // outside and sooted dark within
  for (let k = 0; k < 6; k++) {
    const vac = k % 2 === 1, a = (k / 6) * Math.PI * 2, r = vac ? 2.55 : 1.15, e = vac ? 1.1 : 0.72, L = vac ? 2.8 : 1.9;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    revolve(sink, 'structureMetal', bx, bz, [[e - 0.06, base - L], [e, base - L], [e * 0.72, base - L * 0.6], [0.42, base - 0.45], [0.32, base + 0.02]], 12,
      { colour: shade(BELL, vac ? 1 : 0.85), decor: true });
    revolve(sink, 'structureMetal', bx, bz, [[0.3, base - 0.5], [e * 0.68, base - L * 0.6], [e - 0.07, base - L + 0.02]], 12, { colour: BELL_IN, decor: true });
  }
  // the legs: a shock strut from the hull's skirt out and down to its pad, its damper's sleeve and the bright piston
  // out of it, two braces to the skirt
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6, ox = Math.cos(a), oz = Math.sin(a);
    const top3: Vec3 = [ox * R * 0.97, base + 2.6, oz * R * 0.97], pad: Vec3 = [ox * (R + 2.6), 0.42, oz * (R + 2.6)];
    const at = (t: number): Vec3 => [top3[0] + (pad[0] - top3[0]) * t, top3[1] + (pad[1] - top3[1]) * t, top3[2] + (pad[2] - top3[2]) * t];
    bar(sink, 'structureMetal', top3, pad, 0.34, { colour: LEG });
    bar(sink, 'structureMetal', top3, at(0.48), 0.58, { colour: shade(LEG, 0.8), decor: true });
    bar(sink, 'structureMetal', at(0.46), at(0.68), 0.4, { colour: PISTON, decor: true });
    for (const d of [-0.24, 0.24]) {
      const b = a + d;
      bar(sink, 'structureMetal', [Math.cos(b) * R * 0.95, base + 0.25, Math.sin(b) * R * 0.95], at(0.7), 0.17, { colour: LEG, decor: true });
    }
    revolve(sink, 'structureMetal', pad[0], pad[2], [[0.001, 0.0], [1.05, 0.0], [1.05, 0.2], [0.42, 0.44], [0.41, 0.44]], 12, { colour: LEG, decor: true });
    // (the leg's footing down through the deck it stands on: the lander's structure reaches the ground)
    sink.span('structureMetal', pad[0] - 0.3, -deck, pad[2] - 0.3, pad[0] + 0.3, 0.44, pad[2] + 0.3, { colour: LEG });
  }
  // the cargo hatch on the lee side (+x): its dark opening in a frame, the deck swung out from its sill, the lift tower
  // down to the pad with its car at the foot
  const hy0 = base + 5.6, hy1 = base + 8.4, hw = 1.3;
  sink.span('dark', R - 0.3, hy0, -hw, R + 0.05, hy1, hw, { decor: true });
  for (const z of [-hw - 0.1, hw + 0.1]) bar(sink, 'structureMetal', [R + 0.06, hy0 - 0.1, z], [R + 0.06, hy1 + 0.1, z], 0.18, { colour: shade(HULL, 0.7), decor: true });
  bar(sink, 'structureMetal', [R + 0.06, hy1 + 0.1, -hw - 0.1], [R + 0.06, hy1 + 0.1, hw + 0.1], 0.18, { colour: shade(HULL, 0.7), decor: true });
  sink.span('structureMetal', R, hy0 - 0.25, -1.2, R + 2.3, hy0, 1.2, { colour: STEEL, decor: true });
  for (const z of [-1.15, 1.15]) bar(sink, 'structureMetal', [R + 0.3, hy0 + 1.0, z], [R + 2.3, hy0 + 1.0, z], 0.05, { colour: LAMP, decor: true });
  for (const z of [-1.15, 1.15]) for (const x of [R + 0.3, R + 1.3, R + 2.25]) bar(sink, 'structureMetal', [x, hy0, z], [x, hy0 + 1.03, z], 0.05, { colour: LAMP, decor: true });
  const tx = R + 2.0;
  for (const z of [-1.0, 1.0]) bar(sink, 'structureMetal', [tx, -deck, z], [tx, hy0, z], 0.2, { colour: STEEL });
  for (let y = 1.0; y < hy0; y += 1.2) bar(sink, 'structureMetal', [tx, y, -1.0], [tx, y + 1.2, 1.0], 0.07, { colour: STEEL, decor: true, fine: true });
  sink.span('structureMetal', tx - 1.1, 0, -0.9, tx + 1.1, 0.15, 0.9, { colour: STEEL, decor: true });
  for (const [x, z] of [[tx - 1.05, -0.85], [tx - 1.05, 0.85], [tx + 1.05, -0.85], [tx + 1.05, 0.85]] as const) bar(sink, 'structureMetal', [x, 0.15, z], [x, 2.35, z], 0.06, { colour: LAMP, decor: true });
  sink.span('structureMetal', tx - 1.1, 2.35, -0.9, tx + 1.1, 2.45, 0.9, { colour: LAMP, decor: true });
  // the crew deck's portholes all round under the nose; the RCS pods fore and aft, each with its dark thruster face
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    sink.placed(a, 0, base + 12.2, 0, () => sink.span('glass', -0.2, 0, R * 0.93 - 0.05, 0.2, 0.4, R * 0.93 + 0.06, { decor: true }));
  }
  for (const [y, r] of [[base + 1.6, R], [base + 13.9, R * 0.78]] as const) for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    sink.placed(a, 0, y, 0, () => {
      sink.span('structureMetal', -0.48, 0, r - 0.1, 0.48, 0.95, r + 0.5, { colour: shade(HULL, 0.82), decor: true });
      sink.span('dark', -0.22, 0.3, r + 0.5, 0.22, 0.62, r + 0.53, { decor: true });
    });
  }
}

/** A bank of dust against the deck's chamfered edge (its top at `R` and `dh`, its foot `run` out) from angle a0 to a1. */
function drift(sink: PartSink, R: number, dh: number, run: number, a0: number, a1: number, h: number, w: number, colour: Rgb): void {
  const edgeY = (r: number): number => r <= R + 0.3 ? dh : dh - (r - R - 0.3) / run * (dh + 0.3);
  const m = 6, rows: Vec3[][] = [];
  for (let i = 0; i <= m; i++) {
    const t = i / m, s = Math.sin(Math.PI * t), a = a0 + (a1 - a0) * t, c = Math.cos(a), sn = Math.sin(a);
    const ri = R + 0.35, rr = R + 0.7 + 0.5 * s, ro = R + 1.4 + w * s;
    rows.push([[c * ri, edgeY(ri) - 0.03, sn * ri], [c * rr, edgeY(rr) - 0.04 + h * s, sn * rr], [c * ro, -0.12, sn * ro]]);
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < 2; j++) {
    facing(sink, 'structureWood', [rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]], [0, 1, 0], { colour: shade(colour, j ? 1 : 0.94), decor: true });
  }
}

/**
 * The landing pad (`radius`), the blast berm round its -z (station) side, the crane over the unloading lane at +x, the
 * service module at -x, the lander at its centre (`lander`).
 */
export const landingPad: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const R = num(ctx, 'radius', 16, 40), n = 48, DH = 0.4, run = 1.3;
  // the raised sintered deck: its chamfered edge (rougher, dustier) down to the regolith, its top scorched black at the
  // centre and streaked out from it where the engines' blast has spread, its tiles' seams, the marking ring and the
  // cross, the approach lights round its foot
  revolve(sink, 'structureMetal', 0, 0, [[R + 0.3 + run, -0.3], [R + 0.3, DH], [R, DH]], n, { colour: PAD_EDGE, decor: true });
  const ph = v() * 6.28;
  const scorch = (p: Vec3): Rgb => {
    const r = Math.hypot(p[0], p[2]), a = Math.atan2(p[2], p[0]);
    const streak = 0.5 + 0.5 * Math.sin(a * 7 + ph) * Math.cos(a * 3 - ph * 0.7);
    const t = clamp01((r - 1.8) / (4.5 + 5.5 * streak));
    return mix(SCORCH, PAD_TOP, Math.pow(t, 0.75));
  };
  revolve(sink, 'structureMetal', 0, 0, [[R, DH], [R * 0.82, DH], [R * 0.64, DH], [R * 0.48, DH], [R * 0.34, DH], [R * 0.2, DH], [R * 0.08, DH], [0.001, DH]], n,
    { colour: PAD_TOP, colourAt: scorch, decor: true });
  const yS = DH + 0.005, yD = DH + 0.008, yM = DH + 0.011;
  for (const r of [R * 0.36, R * 0.84]) revolve(sink, 'structureMetal', 0, 0, [[r + 0.05, yS], [r - 0.05, yS]], n, { colour: SEAM, decor: true });
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    // (landmarks-world-276, the integrity census's slivers: a box 5 mm high and metres long drew needles for sides) the
    // seam a strip laid on the deck
    sink.placed(a, 0, 0, 0, () => sink.quad('structureMetal', [-0.05, yS, R - 0.1], [0.05, yS, R - 0.1], [0.05, yS, R * 0.36], [-0.05, yS, R * 0.36], { colour: SEAM, decor: true }));
  }
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.72, yM], [R * 0.68, yM]], n, { colour: shade(MARK, 0.92), decor: true });
  for (const yaw of [0, Math.PI / 2]) sink.placed(yaw, 0, 0, 0, () => {
    for (const s of [-1, 1]) sink.span('structureMetal', -0.6, DH, s > 0 ? R * 0.42 : -R * 0.62, 0.6, yM + 0.002, s > 0 ? R * 0.62 : -R * 0.42, { colour: shade(MARK, 0.92), decor: true });
  });
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) / 16) * Math.PI * 2, x = Math.cos(a) * (R + 1.9), z = Math.sin(a) * (R + 1.9);
    bar(sink, 'structureMetal', [x, 0, z], [x, 1.3, z], 0.12, { colour: STEEL, decor: true });
    sink.span('structureMetal', x - 0.22, 1.3, z - 0.22, x + 0.22, 1.6, z + 0.22, { colour: LAMP, decor: true });
  }
  // the ramp down from the deck to the unloading lane (+x), its hazard-painted kerbs
  extrude(sink, 'structureMetal', [[R - 0.4, DH, -3], [R + 6.5, -0.15, -3], [R - 0.4, -0.15, -3]], [0, 0, 1], 6, { colour: PAD_EDGE, decor: true });
  for (const s of [-1, 1]) bar(sink, 'structureMetal', [R - 0.4, DH + 0.06, s * 2.85], [R + 6.5, -0.09, s * 2.85], 0.3, { colour: rgb(0xb8902a), decor: true });
  // dust banked against the deck's edge, deepest on the open (windward) sides, and blown in tongues onto the deck
  const drifts: Array<[number, number]> = [[0.22, 0.42], [0.55, 0.85], [0.95, 1.1], [1.88, 1.935], [0.12, 0.2], [0.62, 0.72]];
  for (const [f0, f1] of drifts) {
    const a0 = Math.PI * (f0 + v() * 0.04), a1 = Math.PI * (f1 - v() * 0.04), c = shade(DUST, 0.88 + v() * 0.16);
    drift(sink, R, DH, run, a0, a1, 0.18 + v() * 0.22, 1.4 + v() * 1.6, c);
    const am = (a0 + a1) / 2, half = (a1 - a0) * 0.3, reach = 1.6 + v() * 2.4;
    facing(sink, 'structureWood', [[Math.cos(am - half) * (R - 0.05), yD, Math.sin(am - half) * (R - 0.05)], [Math.cos(am + half) * (R - 0.05), yD, Math.sin(am + half) * (R - 0.05)],
      [Math.cos(am + half * 0.2) * (R - reach), yD, Math.sin(am + half * 0.2) * (R - reach)]], [0, 1, 0], { colour: shade(c, 0.95), decor: true });
  }
  // the blast berm: bagged regolith in a 150-degree arc on the -z side, a sloped bank with its courses of bags
  const bR = R + 4.4, segs = 18;
  for (let k = 0; k < segs; k++) {
    const a0 = Math.PI * (1.08 + 0.84 * k / segs), a1 = Math.PI * (1.08 + 0.84 * (k + 1) / segs);
    const am = (a0 + a1) / 2, len = bR * (a1 - a0) + 0.1;
    sink.placed(-am + Math.PI / 2, Math.cos(am) * bR, 0, Math.sin(am) * bR, () => {
      const c = shade(BERM, 0.9 + v() * 0.12);
      extrude(sink, 'structureWood', [[-len / 2, -0.4, -2.5], [-len / 2, -0.4, 2.5], [-len / 2, 4.2, 0.8], [-len / 2, 4.2, -0.8]], [1, 0, 0], len, { colour: c });
      // the bag courses on both slopes, laid on the slope's face (DRESS_PROUD out along its normal: 6 cm held them off it)
      for (const s of [-1, 1]) for (let t = 0.12; t < 0.95; t += 0.11) {
        const z0 = s * (2.5 - 1.7 * t), y0 = -0.4 + 4.6 * t, z1 = s * (2.5 - 1.7 * (t + 0.012)), y1 = -0.4 + 4.6 * (t + 0.012);
        const nz = s * DRESS_PROUD * 4.6 / 4.904, ny = DRESS_PROUD * 1.7 / 4.904;
        const a: Vec3 = [-len / 2, y0 + ny, z0 + nz], b: Vec3 = [len / 2, y0 + ny, z0 + nz], cc: Vec3 = [len / 2, y1 + ny, z1 + nz], d: Vec3 = [-len / 2, y1 + ny, z1 + nz];
        sink.quad('structureWood', ...(s > 0 ? [a, b, cc, d] as const : [b, a, d, cc] as const), { colour: shade(c, 0.72), decor: true, fine: 'near' });
      }
    });
  }
  // the cargo gantry over the unloading lane at +x: two A-frame legs, the girder and the trolley with its hook
  const gx = R + 9, gs = 18, gh = 14;
  for (const z of [-gs / 2, gs / 2]) {
    for (const dx of [-3, 3]) bar(sink, 'structureMetal', [gx + dx, 0, z], [gx, gh, z], 0.35, { colour: STEEL });
    sink.span('stone', gx - 4, -0.4, z - 1, gx + 4, 0.4, z + 1, { shade: 0.6 });
  }
  sink.span('structureMetal', gx - 0.7, gh, -gs / 2 - 1.5, gx + 0.7, gh + 1.4, gs / 2 + 1.5, { colour: rgb(0xc8a22a), decor: true });
  sink.span('structureMetal', gx - 1.0, gh - 1.0, -2 + v() * 4, gx + 1.0, gh, -0.5 + v() * 4, { colour: STEEL, decor: true });
  // cargo containers waiting on the lane
  for (let k = 0; k < 3; k++) sink.span('structureMetal', gx - 1.3, 0, -gs / 2 + 2 + k * 5, gx + 1.3, 2.6, -gs / 2 + 4.5 + k * 5, { colour: [rgb(0xd8d8d0), rgb(0x2f5f8a), rgb(0xb8502a)][k % 3] });
  // the service module at -x: a pressurised cylinder lying on its cradles, the airlock at its end, its radiator
  const mx = -R - 9;
  sink.placed(0, mx, 0, 0, () => {
    sink.cylinder('structureMetal', [0, 2.4, -6], 'z', 12, 2.4, 18, { colour: HULL });
    for (const z of [-4.5, 4.5]) sink.span('structureMetal', -2.2, 0, z - 0.4, 2.2, 1.0, z + 0.4, { colour: HULL_DARK });
    sink.cylinder('structureMetal', [0, 2.0, 6], 'z', 2.4, 1.4, 12, { colour: shade(HULL, 0.85) });
    sink.span('structureMetal', -0.6, 1.2, 8.4, 0.6, 2.8, 8.45, { colour: HULL_DARK, decor: true });
    sink.span('structureMetal', -5.8, 4.6, -4, -2.6, 4.7, 4, { colour: rgb(0xe8e8e8), decor: true });
    for (const z of [-3, 0, 3]) bar(sink, 'structureMetal', [-2.0, 3.5, z], [-4.2, 4.6, z], 0.12, { colour: HULL_DARK, decor: true });
  });
  // the lander on the deck
  if (ctx.params.lander !== false) sink.placed(0, 0, DH, 0, () => lander(sink, v, DH));
  return { parts: sink.finish() };
};
