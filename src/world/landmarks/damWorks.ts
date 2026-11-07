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
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const STEEL = rgb(0x5a5f62), RED_OXIDE = rgb(0x8a3a2a), CABLE = rgb(0x2a2a2a), CAB = rgb(0xd2c8a8), BUCKET = rgb(0x5e5e5a);
const PAD = rgb(0x6a4a3c), MARK = rgb(0xd8d2c4), BERM = rgb(0x8a5a42), HULL = rgb(0xd4d6d8), HULL_DARK = rgb(0x3a3c40), LAMP = rgb(0xf2d27a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** A lattice leg's lacing between two of its chords (zig-zag every `step` up), dressing. */
function lace(sink: PartSink, a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3, steps: number, colour: Rgb): void {
  const at = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    bar(sink, 'structureMetal', at(a0, a1, t0), at(b0, b1, t1), 0.09, { colour, decor: true, fine: true });
    bar(sink, 'structureMetal', at(a0, a1, t1), at(b0, b1, t1), 0.08, { colour, decor: true, fine: true });
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
    bar(sink, 'structureMetal', P(sx, sz, 0.8), P(sx, sz, H), 0.42, { colour: RED_OXIDE });
  }
  // the lacing on all four faces and the horizontal struts every panel
  const panels = Math.max(6, Math.round(H / 4));
  for (let k = 0; k < 4; k++) {
    const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
    lace(sink, P(ax, az, 0.8), P(ax, az, H), P(bx, bz, 0.8), P(bx, bz, H), panels, RED_OXIDE);
  }
  // the head frame: a deck on the tower's top and the boom cantilevered 7 m over the span, its sheaves at the tip
  const hy = H, tip = 7.5;
  sink.span('structureMetal', -T / 2 - 0.6, hy, -T / 2 - 0.6, T / 2 + 0.6, hy + 0.4, T / 2 + 0.6, { colour: STEEL, decor: true });
  for (const s of [-1, 1]) {
    bar(sink, 'structureMetal', [s * T / 2, hy + 0.4, -T / 2], [s * 0.9, hy + 2.6, T / 2 + tip], 0.3, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * T / 2, hy + 0.4, T / 2], [s * 0.9, hy + 0.6, T / 2 + tip], 0.3, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * T / 2, hy + 3.8, -T / 2 + 0.5], [s * 0.9, hy + 2.6, T / 2 + tip], 0.18, { colour: RED_OXIDE, decor: true });
    bar(sink, 'structureMetal', [s * T / 2, hy + 0.4, -T / 2 + 0.5], [s * T / 2, hy + 3.8, -T / 2 + 0.5], 0.22, { colour: RED_OXIDE, decor: true });
  }
  for (const s of [-0.5, 0.5]) sink.cylinder('structureMetal', [s - 0.15, hy + 1.6, T / 2 + tip - 0.2], 'x', 0.3, 0.9, 16, { colour: STEEL, decor: true });
  // the operator's cab on its platform two thirds up, its windows to the span
  const cy = H * 0.62, cw = 3.4;
  const wAt = B + (T - B) * cy / H;
  sink.span('structureMetal', -cw / 2, cy - 0.2, wAt / 2 - 0.2, cw / 2, cy, wAt / 2 + 2.4, { colour: STEEL, decor: true });
  sink.span('structureWood', -cw / 2 + 0.2, cy, wAt / 2 + 0.1, cw / 2 - 0.2, cy + 2.4, wAt / 2 + 2.2, { colour: CAB, decor: true });
  sink.span('glass', -cw / 2 + 0.4, cy + 1.1, wAt / 2 + 2.2, cw / 2 - 0.4, cy + 2.1, wAt / 2 + 2.22, { decor: true });
  sink.span('structureWood', -cw / 2, cy + 2.4, wAt / 2, cw / 2, cy + 2.6, wAt / 2 + 2.4, { colour: shade(CAB, 0.6), decor: true });
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

/** A lander standing on its legs at (0, 0): a stubby hull, its nose, the engine skirt and the four legs on their pads. */
function lander(sink: PartSink): void {
  const R = 4.2, n = 24, base = 3.2;
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.9, base], [R, base + 1.2], [R, base + 11], [R * 0.82, base + 13.5], [R * 0.45, base + 15.2], [0.001, base + 15.8]], n, { colour: HULL });
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.9, base], [R * 0.95, base - 0.6], [R * 0.4, base - 0.8], [R * 0.39, base - 0.8]], n, { colour: HULL_DARK, decor: true });
  // the engine bells under the skirt
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    revolve(sink, 'structureMetal', Math.cos(a) * 1.5, Math.sin(a) * 1.5, [[0.4, base - 0.8], [0.95, base - 2.2], [0.9, base - 2.2]], 10, { colour: shade(HULL_DARK, 0.8), decor: true });
  }
  // the legs: struts from the hull's shoulder out and down to round pads
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, ox = Math.cos(a), oz = Math.sin(a);
    const pad: Vec3 = [ox * (R + 3.4), 0.3, oz * (R + 3.4)];
    bar(sink, 'structureMetal', [ox * R * 0.95, base + 3.0, oz * R * 0.95], pad, 0.32, { colour: HULL_DARK });
    bar(sink, 'structureMetal', [ox * R * 0.92, base + 0.2, oz * R * 0.92], pad, 0.22, { colour: HULL_DARK, decor: true });
    revolve(sink, 'structureMetal', pad[0], pad[2], [[0.001, 0.0], [0.9, 0.0], [0.9, 0.25], [0.3, 0.45], [0.29, 0.45]], 10, { colour: HULL_DARK, decor: true });
  }
  // the hull's markings: the cargo door's outline and the windows' band
  sink.span('structureMetal', -1.4, base + 4.0, R - 0.02, 1.4, base + 7.4, R + 0.03, { colour: shade(HULL, 0.82), decor: true });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    sink.placed(a, 0, base + 10, 0, () => sink.span('glass', -0.3, 0, R - 0.03, 0.3, 0.6, R + 0.02, { decor: true }));
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
  // the sintered disc, its marking ring and the cross, the approach lights round its rim
  revolve(sink, 'structureMetal', 0, 0, [[R + 0.6, -0.3], [R, 0.12], [0.001, 0.12]], n, { colour: PAD, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.72, 0.13], [R * 0.68, 0.13]], n, { colour: MARK, decor: true });
  for (const yaw of [0, Math.PI / 2]) sink.placed(yaw, 0, 0, 0, () => sink.span('structureMetal', -0.6, 0.12, -R * 0.55, 0.6, 0.14, R * 0.55, { colour: MARK, decor: true }));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    sink.span('structureMetal', Math.cos(a) * (R + 1.2) - 0.25, 0, Math.sin(a) * (R + 1.2) - 0.25, Math.cos(a) * (R + 1.2) + 0.25, 0.5, Math.sin(a) * (R + 1.2) + 0.25, { colour: LAMP, decor: true });
  }
  // the blast berm: bagged regolith in a 150-degree arc on the -z side, its courses stepped
  const bR = R + 5, segs = 18;
  for (let k = 0; k < segs; k++) {
    const a0 = Math.PI * (1.08 + 0.84 * k / segs), a1 = Math.PI * (1.08 + 0.84 * (k + 1) / segs);
    const am = (a0 + a1) / 2, len = bR * (a1 - a0) + 0.1;
    sink.placed(-am + Math.PI / 2, Math.cos(am) * bR, 0, Math.sin(am) * bR, () => {
      sink.span('structureWood', -len / 2, -0.4, -1.6, len / 2, 2.2, 1.6, { colour: shade(BERM, 0.92 + v() * 0.1) });
      sink.span('structureWood', -len / 2, 2.2, -1.1, len / 2, 3.4, 1.1, { colour: shade(BERM, 0.88 + v() * 0.1) });
      sink.span('structureWood', -len / 2, 3.4, -0.6, len / 2, 4.2, 0.6, { colour: shade(BERM, 0.84 + v() * 0.1) });
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
