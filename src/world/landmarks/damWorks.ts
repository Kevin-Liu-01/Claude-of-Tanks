// src/world/landmarks/damWorks.ts — set pieces of works and stations (landmarks-271, 2026-11-06).
//
// - cablewayTower: Glen Canyon's dam-building years (Skybridge; the census, buildings-270 signature places: "cableway
//   towers and a concrete batch plant, towers 40 m, on the canyon rims"). The head tower of a high-line cableway: a
//   tapered steel lattice on its concrete footings, the head frame cantilevered over the span (+z) with its sheaves, the
//   operator's cab on its platform facing the span, the backstay cables to their deadman anchors behind; and (`cable`)
//   the track and hoist cables sagging across the span to the far tower, the carriage and its concrete bucket hung on
//   them part way.
// - landingPad: an Olympus basin station's pad (Mars; the census: "a landing pad, a sintered pad with a blast wall and
//   a cargo crane, 1 km from the habitat"). The sintered regolith disc with its marking ring and the approach lights,
//   the blast berm of bagged regolith round its station side, the cargo gantry crane straddling the unloading lane, the
//   pad's service module with its airlock, and a lander standing on its legs at the pad's centre.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink (no draw call of their
// own). The legs, footings, berm, module and the lander's body are structure; lattices, cables, lights and markings
// are dressing.
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, extrude, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const STEEL = rgb(0x5a5f62), RED_OXIDE = rgb(0x8a3a2a), CABLE = rgb(0x2a2a2a), CAB = rgb(0xd2c8a8), BUCKET = rgb(0x5e5e5a);
const PAD = rgb(0x6a4a3c), MARK = rgb(0xd8d2c4), BERM = rgb(0x8a5a42), HULL = rgb(0xc9ccd0), HULL_DARK = rgb(0x3a3c40), LAMP = rgb(0xf2d27a);
const TILE = rgb(0x1e1f22), SEAM = rgb(0x4a3328), SCORCH = rgb(0x2a1e1a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** A lattice's lacing between two of its chords (zig-zag every `step` up), dressing; heavy enough to read at range. */
function lace(sink: PartSink, a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3, steps: number, colour: Rgb): void {
  const at = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    bar(sink, 'structureMetal', at(a0, a1, t0), at(b0, b1, t1), 0.14, { colour, decor: true });
    bar(sink, 'structureMetal', at(a0, a1, t1), at(b0, b1, t1), 0.16, { colour, decor: true });
  }
}

/** A sagging cable from a to b (sag at its middle), in `n` straight runs. */
function catenary(sink: PartSink, a: Vec3, b: Vec3, sag: number, r: number, n: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  for (let k = 0; k < n; k++) bar(sink, 'structureMetal', pts[k], pts[k + 1], r, { colour: CABLE, decor: true });
  return pts;
}

/**
 * The cableway's head tower (`height`), its span toward +z; with `cable`, the cables across `span` metres to the far
 * tower's head (the same height over the far ground: `farRise` the far ground over this one's).
 */
export const cablewayTower: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const H = num(ctx, 'height', 20, 60), B = 9, T = 3, foot = -0.6 - ctx.groundFall;
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const P = (sx: number, sz: number, y: number): Vec3 => { const w = B + (T - B) * Math.max(0, y) / H; return [sx * w / 2, y, sz * w / 2]; };
  for (const [sx, sz] of legs) {
    sink.span('stone', sx * B / 2 - 1.1, foot, sz * B / 2 - 1.1, sx * B / 2 + 1.1, 0.8, sz * B / 2 + 1.1, { shade: 0.88 });
    // the leg: a heavy angle member from the footing to the head (structure), battered in
    bar(sink, 'structureMetal', P(sx, sz, 0.8), P(sx, sz, H), 0.6, { colour: RED_OXIDE });
  }
  // the lacing on all four faces and the horizontal struts every panel
  const panels = Math.max(6, Math.round(H / 4));
  for (let k = 0; k < 4; k++) {
    const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
    lace(sink, P(ax, az, 0.8), P(ax, az, H), P(bx, bz, 0.8), P(bx, bz, H), panels, RED_OXIDE);
  }
  // the gusset plates where each panel's lacing meets the legs
  for (let k = 1; k < panels; k++) for (const [sx, sz] of legs) {
    const c = P(sx, sz, 0.8 + (H - 0.8) * k / panels);
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
  // the operator's cab on its platform two thirds up, its windows to the span
  const cy = H * 0.62, cw = 3.4;
  const wAt = B + (T - B) * cy / H;
  sink.span('structureMetal', -cw / 2, cy - 0.2, wAt / 2 - 0.2, cw / 2, cy, wAt / 2 + 2.4, { colour: STEEL, decor: true });
  sink.span('structureWood', -cw / 2 + 0.2, cy, wAt / 2 + 0.1, cw / 2 - 0.2, cy + 2.4, wAt / 2 + 2.2, { colour: CAB, decor: true });
  sink.span('glass', -cw / 2 + 0.4, cy + 1.1, wAt / 2 + 2.2, cw / 2 - 0.4, cy + 2.1, wAt / 2 + 2.22, { decor: true });
  sink.span('structureWood', -cw / 2, cy + 2.4, wAt / 2, cw / 2, cy + 2.6, wAt / 2 + 2.4, { colour: shade(CAB, 0.6), decor: true });
  // the platform's brackets back to the legs, its railing, and the caged ladder up the near leg from the ground
  for (const s of [-1, 1]) {
    bar(sink, 'structureMetal', [s * cw / 2, cy - 0.2, wAt / 2 + 2.4], P(s, 1, cy - 3.2), 0.2, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * cw / 2, cy + 1.05, wAt / 2], [s * cw / 2, cy + 1.05, wAt / 2 + 2.4], 0.06, { colour: STEEL, decor: true });
  }
  const lx = B / 2 - 0.9;
  for (const dx of [-0.25, 0.25]) bar(sink, 'structureMetal', [lx + dx, 0.8, B / 2 + 0.4], [lx * (wAt / B) + dx, cy, wAt / 2 + 0.4], 0.06, { colour: STEEL, decor: true });
  for (let y = 3; y < cy - 0.5; y += 1.5) {
    const f = y / cy, x = lx + (lx * (wAt / B) - lx) * f, z = B / 2 + 0.4 + (wAt / 2 - B / 2) * f;
    bar(sink, 'structureMetal', [x - 0.4, y, z], [x + 0.4, y, z + 0.7], 0.05, { colour: STEEL, decor: true, fine: true });
  }
  // the backstays from the head down to the deadman anchors behind
  const back = num(ctx, 'backstay', 12, 40);
  for (const s of [-1, 1]) {
    sink.span('stone', s * 4 - 1.4, foot, -back - 1.4, s * 4 + 1.4, 1.0, -back + 1.4, { shade: 0.85 });
    bar(sink, 'structureMetal', [s * 0.8, hy + 3.6, -T / 2], [s * 4, 1.0, -back], 0.09, { colour: CABLE, decor: true });
  }
  // the cables across the span to the far tower's head, the carriage and its bucket on them
  if (ctx.params.cable === true) {
    const span = num(ctx, 'span', 40, 600), rise = Number(ctx.params.farRise) || 0;
    const a: Vec3 = [-0.5, hy + 2.4, T / 2 + tip], b: Vec3 = [0.5, hy + 2.4 + rise, span - T / 2 - tip];
    const sag = span * 0.045, n = 24;
    const track = catenary(sink, a, b, sag, 0.09, n);
    catenary(sink, [0.5, a[1] - 0.6, a[2]], [-0.5, b[1] - 0.6, b[2]], sag * 1.02, 0.05, n);
    const k = Math.round(n * (0.3 + v() * 0.4)), at = track[k];
    sink.span('structureMetal', at[0] - 0.6, at[1] - 0.6, at[2] - 1.2, at[0] + 0.6, at[1] + 0.2, at[2] + 1.2, { colour: STEEL, decor: true });
    bar(sink, 'structureMetal', [at[0], at[1] - 0.6, at[2]], [at[0], at[1] - 9, at[2]], 0.05, { colour: CABLE, decor: true });
    revolve(sink, 'structureMetal', at[0], at[2], [[0.5, at[1] - 12.4], [1.6, at[1] - 11.0], [1.7, at[1] - 9.4], [1.6, at[1] - 9.2], [1.5, at[1] - 9.2]], 12, { colour: BUCKET, decor: true });
  }
  return { parts: sink.finish() };
};

/**
 * A lander standing on its legs at (0, 0), a steel cargo ship of the 2090s: the hull in its welded rings under the ogive
 * nose, the dark heat shield down its windward (-x) side, the aft flaps and forward canards on its flanks, the engine bay
 * with its sea-level and vacuum bells below the skirt, six shock-strut legs braced to the skirt on their pads, the cargo
 * hatch (+x) with its deck and the lift tower down to the pad, the crew portholes' ring, the RCS pods.
 */
function lander(sink: PartSink): void {
  const R = 4.2, n = 24, base = 3.4, top = base + 15.6;
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.94, base], [R, base + 0.6], [R, base + 11.4], [R * 0.9, base + 13.4], [R * 0.66, base + 14.8],
    [R * 0.32, top - 0.3], [0.001, top]], n, { colour: HULL });
  // the welded rings of the barrel
  for (let y = base + 1.9; y < base + 11.2; y += 1.85) revolve(sink, 'structureMetal', 0, 0, [[R, y], [R + 0.035, y], [R + 0.035, y + 0.07], [R, y + 0.07]], n, { colour: shade(HULL, 0.78), decor: true });
  // the heat shield's tiles down the windward half, its edge at the flaps' hinge line
  sink.cylinder('structureMetal', [0, base + 0.6, 0], 'y', 10.8, R + 0.045, 12, { colour: TILE, decor: true }, R + 0.045, false, Math.PI / 2, Math.PI);
  // the flaps on the flanks (±z), set a little to windward: the aft pair long and deep, the canards high and short
  for (const s of [-1, 1]) {
    const flap = (y0: number, y1: number, y2: number, r0: number, out: number): void => {
      const P = (y: number, r: number): Vec3 => [-1.25, y, s * r];
      extrude(sink, 'structureMetal', [P(y0, r0), P(y0, r0 + out), P(y1, r0 + out), P(y2, r0)], [1, 0, 0], 0.32, { colour: TILE, decor: true });
    };
    flap(base + 0.8, base + 5.0, base + 6.6, R - 0.4, 2.6);
    flap(base + 11.3, base + 12.6, base + 13.8, R * 0.9 - 0.6, 1.7);
  }
  // the engine bay: three sea-level bells inside, three vacuum bells outboard, open below the skirt
  for (let k = 0; k < 6; k++) {
    const vac = k % 2 === 1, a = (k / 6) * Math.PI * 2, r = vac ? 2.55 : 1.15, e = vac ? 1.1 : 0.72, L = vac ? 2.8 : 1.9;
    revolve(sink, 'structureMetal', Math.cos(a) * r, Math.sin(a) * r, [[0.32, base - 0.05], [0.42, base - 0.45], [e * 0.72, base - L * 0.6], [e, base - L], [e - 0.06, base - L]], 12,
      { colour: shade(HULL_DARK, vac ? 0.9 : 0.75), decor: true });
  }
  // the legs: a shock strut from the hull's skirt out and down to its pad, its damper's sleeve, two braces to the skirt
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6, ox = Math.cos(a), oz = Math.sin(a);
    const top3: Vec3 = [ox * R * 0.97, base + 2.6, oz * R * 0.97], pad: Vec3 = [ox * (R + 2.6), 0.42, oz * (R + 2.6)];
    const knee: Vec3 = [top3[0] + (pad[0] - top3[0]) * 0.7, top3[1] + (pad[1] - top3[1]) * 0.7, top3[2] + (pad[2] - top3[2]) * 0.7];
    const mid: Vec3 = [(top3[0] + pad[0]) / 2, (top3[1] + pad[1]) / 2, (top3[2] + pad[2]) / 2];
    bar(sink, 'structureMetal', top3, pad, 0.34, { colour: HULL_DARK });
    bar(sink, 'structureMetal', top3, mid, 0.52, { colour: shade(HULL_DARK, 1.25), decor: true });
    for (const d of [-0.24, 0.24]) {
      const b = a + d;
      bar(sink, 'structureMetal', [Math.cos(b) * R * 0.95, base + 0.25, Math.sin(b) * R * 0.95], knee, 0.17, { colour: HULL_DARK, decor: true });
    }
    revolve(sink, 'structureMetal', pad[0], pad[2], [[0.001, 0.0], [1.05, 0.0], [1.05, 0.2], [0.42, 0.44], [0.41, 0.44]], 12, { colour: HULL_DARK, decor: true });
  }
  // the cargo hatch on the lee side (+x): its dark opening in a frame, the deck swung out from its sill, the lift tower
  // down to the pad with its car at the foot
  const hy0 = base + 5.6, hy1 = base + 8.4, hw = 1.3;
  sink.span('dark', R - 0.3, hy0, -hw, R + 0.05, hy1, hw, { decor: true });
  for (const z of [-hw - 0.1, hw + 0.1]) bar(sink, 'structureMetal', [R + 0.06, hy0 - 0.1, z], [R + 0.06, hy1 + 0.1, z], 0.18, { colour: shade(HULL, 0.7), decor: true });
  bar(sink, 'structureMetal', [R + 0.06, hy1 + 0.1, -hw - 0.1], [R + 0.06, hy1 + 0.1, hw + 0.1], 0.18, { colour: shade(HULL, 0.7), decor: true });
  sink.span('structureMetal', R, hy0 - 0.25, -1.2, R + 2.3, hy0, 1.2, { colour: STEEL, decor: true });
  for (const z of [-1.15, 1.15]) bar(sink, 'structureMetal', [R + 0.3, hy0 + 1.0, z], [R + 2.3, hy0 + 1.0, z], 0.05, { colour: LAMP, decor: true });
  const tx = R + 2.0;
  for (const z of [-1.0, 1.0]) bar(sink, 'structureMetal', [tx, 0.25, z], [tx, hy0, z], 0.2, { colour: STEEL });
  for (let y = 1.2; y < hy0; y += 1.2) bar(sink, 'structureMetal', [tx, y, -1.0], [tx, y + 1.2, 1.0], 0.07, { colour: STEEL, decor: true, fine: true });
  sink.span('structureMetal', tx - 1.1, 0.25, -0.9, tx + 1.1, 0.4, 0.9, { colour: STEEL, decor: true });
  for (const [x, z] of [[tx - 1.05, -0.85], [tx - 1.05, 0.85], [tx + 1.05, -0.85], [tx + 1.05, 0.85]] as const) bar(sink, 'structureMetal', [x, 0.4, z], [x, 2.6, z], 0.06, { colour: LAMP, decor: true });
  sink.span('structureMetal', tx - 1.1, 2.6, -0.9, tx + 1.1, 2.7, 0.9, { colour: LAMP, decor: true });
  // the crew deck's portholes all round under the nose; the RCS pods fore and aft
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    sink.placed(a, 0, base + 12.2, 0, () => sink.span('glass', -0.2, 0, R * 0.93 - 0.05, 0.2, 0.4, R * 0.93 + 0.06, { decor: true }));
  }
  for (const [y, r] of [[base + 1.6, R], [base + 13.9, R * 0.78]] as const) for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    sink.placed(a, 0, y, 0, () => sink.span('structureMetal', -0.35, 0, r - 0.1, 0.35, 0.7, r + 0.35, { colour: shade(HULL, 0.82), decor: true }));
  }
}

/**
 * The landing pad (`radius`), the blast berm round its -z (station) side, the crane over the unloading lane at +x, the
 * service module at -x, the lander at its centre (`lander`).
 */
export const landingPad: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const R = num(ctx, 'radius', 16, 40), n = 48;
  // the sintered slab with its chamfered edge (low enough to drive onto), the tiles' seams, the marking ring and the
  // cross, the scorch under the lander, the approach lights on their posts round the rim
  revolve(sink, 'structureMetal', 0, 0, [[R + 1.0, -0.3], [R + 0.4, 0.22], [R, 0.25], [0.001, 0.25]], n, { colour: PAD, decor: true });
  for (const r of [R * 0.36, R * 0.84]) revolve(sink, 'structureMetal', 0, 0, [[r + 0.05, 0.255], [r - 0.05, 0.255]], n, { colour: SEAM, decor: true });
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    sink.placed(a, 0, 0, 0, () => sink.span('structureMetal', -0.05, 0.25, R * 0.36, 0.05, 0.256, R - 0.1, { colour: SEAM, decor: true }));
  }
  revolve(sink, 'structureMetal', 0, 0, [[7.5, 0.258], [0.001, 0.258]], 24, { colour: SCORCH, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.72, 0.26], [R * 0.68, 0.26]], n, { colour: MARK, decor: true });
  for (const yaw of [0, Math.PI / 2]) sink.placed(yaw, 0, 0, 0, () => {
    for (const s of [-1, 1]) sink.span('structureMetal', -0.6, 0.25, s > 0 ? R * 0.42 : -R * 0.62, 0.6, 0.262, s > 0 ? R * 0.62 : -R * 0.42, { colour: MARK, decor: true });
  });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = Math.cos(a) * (R + 1.6), z = Math.sin(a) * (R + 1.6);
    bar(sink, 'structureMetal', [x, 0, z], [x, 1.3, z], 0.12, { colour: STEEL, decor: true });
    sink.span('structureMetal', x - 0.22, 1.3, z - 0.22, x + 0.22, 1.6, z + 0.22, { colour: LAMP, decor: true });
  }
  // the blast berm: bagged regolith in a 150-degree arc on the -z side, a sloped bank with its courses of bags
  const bR = R + 4.4, segs = 18;
  for (let k = 0; k < segs; k++) {
    const a0 = Math.PI * (1.08 + 0.84 * k / segs), a1 = Math.PI * (1.08 + 0.84 * (k + 1) / segs);
    const am = (a0 + a1) / 2, len = bR * (a1 - a0) + 0.1;
    sink.placed(-am + Math.PI / 2, Math.cos(am) * bR, 0, Math.sin(am) * bR, () => {
      const c = shade(BERM, 0.9 + v() * 0.12);
      extrude(sink, 'structureWood', [[-len / 2, -0.4, -2.5], [-len / 2, -0.4, 2.5], [-len / 2, 4.2, 0.8], [-len / 2, 4.2, -0.8]], [1, 0, 0], len, { colour: c });
      // the bag courses on both slopes, a few centimetres proud
      for (const s of [-1, 1]) for (let t = 0.12; t < 0.95; t += 0.11) {
        const z0 = s * (2.5 - 1.7 * t), y0 = -0.4 + 4.6 * t, z1 = s * (2.5 - 1.7 * (t + 0.012)), y1 = -0.4 + 4.6 * (t + 0.012), nz = s * 0.06, ny = 0.03;
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
    bar(sink, 'structureMetal', [-2.4, 3.6, 0], [-4.2, 4.6, 0], 0.12, { colour: HULL_DARK, decor: true });
  });
  if (ctx.params.lander !== false) lander(sink);
  return { parts: sink.finish() };
};
