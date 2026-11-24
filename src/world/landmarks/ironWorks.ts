// src/world/landmarks/ironWorks.ts — an ironworks' blast furnace (landmarks-271, 2026-11-06). Foundry is the Völklingen
// ironworks on the Saar: the census (buildings-270 signature places) names its photograph — a row of rusting blast
// furnaces with their inclined skip bridges, hot-blast stoves and gas pipes — and found none of it on the map.
//
// - blastFurnace: one furnace of the row as it stood in the 1930s-40s: the riveted shaft on its hearth jacket and bosh,
//   the bustle main ringing it over the tuyeres, the columns carrying the charging platform at the throat, the top's
//   gas uptakes joined into the downcomer that drops to the dust catcher, the lattice headframe over the bell; the three
//   Cowper stoves in a row behind it on the hot-blast main; the inclined skip bridge from the stock house up to the
//   top; the cast house at its foot. Rust-brown steel throughout, as the works stands today.
//
// Drawn in its own frame (x across, y up, z out of the front: the cast house's open side) into the regional part sink:
// it merges into the props' buckets (no draw call of its own). The furnace, stoves, dust catcher and the cast house's
// walls are structure; the lattices, pipes, platforms and the skip bridge are dressing a hull drives under.
import { LocalFrame, normalize3, PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { DRESS_PROUD, bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const RUST = rgb(0x6e3f28), RUST_DARK = rgb(0x4a2c1e), OXIDE = rgb(0x8a5034), STEEL = rgb(0x4f4a46), SOOT = rgb(0x2a2420);
const BRICK_RED = rgb(0x7a3b2c);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** The furnace's plan (plan.ts footprint and the builder agree): the furnace's axis offset so the whole is centred. */
export function blastFurnaceLayout(p: Readonly<Record<string, number | string | boolean>>) {
  const H = Math.max(26, Math.min(40, Number(p.height)));
  const stoves = Math.max(2, Math.min(4, Math.round(Number(p.stoves))));
  const skip = Math.max(0, Number(p.skip));
  // (x) the dust catcher 14 m off the furnace's -x side to the skip pit at +x; (z) the clean-gas main 21.5 m behind, the
  // cast house's eaves 20.2 m out in front
  const stoveSpan = (stoves - 1) * 10.5;
  const x0 = Math.min(-19, -stoveSpan / 2 - 5), x1 = Math.max(stoveSpan / 2 + 5, 6 + skip + 2.6, 11.7);
  const z0 = -22.6, z1 = 20.3;
  return { H, stoves, skip, fx: -(x0 + x1) / 2, fz: -(z0 + z1) / 2, across: (x1 - x0) / 2 + 0.5, along: (z1 - z0) / 2 + 0.5 };
}

/** A square lattice tower or girder's four chords from a to b (centre line), `w` wide, with zig-zag lacing (dressing) on
 *  its four faces, or on two opposite faces (`faces` 2). */
function lattice(sink: PartSink, a: Vec3, b: Vec3, w: number, colour: Rgb, chord = 0.16, faces: 2 | 4 = 4): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const t: Vec3 = [dx / L, dy / L, dz / L];
  // two axes across the member: one horizontal, one completing the frame
  let n1: Vec3 = Math.abs(t[1]) > 0.95 ? [1, 0, 0] : [-t[2], 0, t[0]];
  const l1 = Math.hypot(n1[0], n1[1], n1[2]); n1 = [n1[0] / l1, n1[1] / l1, n1[2] / l1];
  const n2: Vec3 = [t[1] * n1[2] - t[2] * n1[1], t[2] * n1[0] - t[0] * n1[2], t[0] * n1[1] - t[1] * n1[0]];
  const corner = (p: Vec3, i: number, j: number): Vec3 => [p[0] + (n1[0] * i + n2[0] * j) * w / 2, p[1] + (n1[1] * i + n2[1] * j) * w / 2, p[2] + (n1[2] * i + n2[2] * j) * w / 2];
  const o: EmitOptions = { colour, decor: true };
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [i, j] of corners) bar(sink, 'structureMetal', corner(a, i, j), corner(b, i, j), chord, o);
  const panels = Math.max(1, Math.round(L / Math.max(1.2, w)));
  const at = (k: number): Vec3 => [a[0] + dx * k / panels, a[1] + dy * k / panels, a[2] + dz * k / panels];
  const lace: EmitOptions = { colour: shade(colour, 0.9), decor: true, fine: true };
  for (let k = 0; k < panels; k++) {
    const p = at(k), q = at(k + 1);
    for (let f = 0; f < 4; f++) {
      if (faces === 2 && f % 2) continue;
      const [i0, j0] = corners[f], [i1, j1] = corners[(f + 1) % 4];
      bar(sink, 'structureMetal', corner(p, k % 2 ? i0 : i1, k % 2 ? j0 : j1), corner(q, k % 2 ? i1 : i0, k % 2 ? j1 : j0), chord * 0.55, lace);
    }
    bar(sink, 'structureMetal', corner(q, -1, -1), corner(q, 1, -1), chord * 0.6, lace);
    bar(sink, 'structureMetal', corner(q, -1, 1), corner(q, 1, 1), chord * 0.6, lace);
  }
}

/** A run of large pipe from a to b (r its radius), its flanged joints every 6 m (dressing). */
function pipe(sink: PartSink, a: Vec3, b: Vec3, r: number, colour: Rgb): void {
  bar(sink, 'structureMetal', a, b, r * 2, { colour, decor: true });
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  for (let s = 3; s < L - 1; s += 6) {
    const k = s / L, p: Vec3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const k2 = (s + 0.25) / L, q: Vec3 = [a[0] + (b[0] - a[0]) * k2, a[1] + (b[1] - a[1]) * k2, a[2] + (b[2] - a[2]) * k2];
    bar(sink, 'structureMetal', p, q, r * 2 + 0.22, { colour: shade(colour, 0.8), decor: true, fine: true });
  }
}

/** A riveted cylinder's bands (the plates' seams) up a drum from y0 to y1 (dressing, fine). */
function bands(sink: PartSink, x: number, z: number, r: number, y0: number, y1: number, pitch: number, colour: Rgb, n: number): void {
  for (let y = y0 + pitch; y < y1 - 0.3; y += pitch) revolve(sink, 'structureMetal', x, z, [[r, y], [r + 0.04, y], [r + 0.04, y + 0.14], [r, y + 0.14]], n, { colour, decor: true, fine: true });
}

/** A ring of a platform's railing at radius r on its deck at y (dressing). */
function ringRail(sink: PartSink, x: number, z: number, r: number, y: number, n: number, colour: Rgb): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
    const p: Vec3 = [x + Math.cos(a) * r, y, z + Math.sin(a) * r], q: Vec3 = [x + Math.cos(b) * r, y, z + Math.sin(b) * r];
    bar(sink, 'structureMetal', p, [p[0], y + 1.05, p[2]], 0.05, { colour, decor: true, fine: true });
    bar(sink, 'structureMetal', [p[0], y + 1.05, p[2]], [q[0], y + 1.05, q[2]], 0.05, { colour, decor: true, fine: true });
  }
}

/**
 * The blast furnace (`height`: the throat's platform over the ground), its `stoves` Cowpers in a row behind it and its
 * skip bridge (`skip`: the incline's run along +x from the furnace's top to the skip pit).
 */
export const blastFurnace: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const L = blastFurnaceLayout(ctx.params);
  const { H, stoves } = L;
  const foot = -0.8 - ctx.groundFall, n = 22;
  sink.placed(0, L.fx, 0, L.fz, () => {
    // ---- the furnace: the hearth's jacket, the bosh, the stack tapering to the throat, the top cone
    const hearthR = 5.2, boshY = 7.5, boshR = 6.4, throatR = 4.2, top = H;
    revolve(sink, 'structureMetal', 0, 0, [[hearthR + 0.8, foot], [hearthR + 0.8, 1.2], [hearthR, 1.2], [hearthR, boshY - 3], [boshR, boshY], [boshR, boshY + 1.5],
      [throatR, top - 2.5], [throatR, top]], n, { colour: RUST });
    bands(sink, 0, 0, hearthR, 1.2, boshY - 3, 0.9, RUST_DARK, n);
    // the stack's binding hoops
    for (let y = boshY + 3; y < top - 3; y += 2.4) {
      const r = boshR + (throatR - boshR) * (y - boshY - 1.5) / (top - 2.5 - boshY - 1.5);
      revolve(sink, 'structureMetal', 0, 0, [[r, y], [r + 0.08, y], [r + 0.08, y + 0.3], [r, y + 0.3]], n, { colour: RUST_DARK, decor: true, fine: 'near' });
    }
    // the bustle main ringing the bosh and the tuyere stocks down to the hearth
    const bustleY = boshY + 1.2, bustleR = boshR + 2.4, tuyeres = 14;
    for (let k = 0; k < tuyeres; k++) {
      const a = (k / tuyeres) * Math.PI * 2, b = ((k + 1) / tuyeres) * Math.PI * 2;
      pipe(sink, [Math.cos(a) * bustleR, bustleY, Math.sin(a) * bustleR], [Math.cos(b) * bustleR, bustleY, Math.sin(b) * bustleR], 0.65, STEEL);
      bar(sink, 'structureMetal', [Math.cos(a) * bustleR, bustleY - 0.6, Math.sin(a) * bustleR], [Math.cos(a) * (hearthR + 0.2), boshY - 4.6, Math.sin(a) * (hearthR + 0.2)], 0.28,
        { colour: STEEL, decor: true });
    }
    // the columns carrying the platform at the throat (eight, battered in toward the top) and their bracing
    const colR0 = boshR + 4.2, colR1 = throatR + 3.4, platY = top - 1.2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      sink.cylinder('structureMetal', [Math.cos(a) * colR0, foot, Math.sin(a) * colR0], 'y', bustleY + 2 - foot, 0.45, 8, { colour: RUST_DARK });
      bar(sink, 'structureMetal', [Math.cos(a) * colR0, bustleY + 2, Math.sin(a) * colR0], [Math.cos(a) * colR1, platY, Math.sin(a) * colR1], 0.62, { colour: RUST_DARK, decor: true });
      if (k % 2 === 0) {
        const b = a + Math.PI / 4;
        bar(sink, 'structureMetal', [Math.cos(a) * colR0, 3, Math.sin(a) * colR0], [Math.cos(b) * colR0, bustleY + 2, Math.sin(b) * colR0], 0.22, { colour: RUST_DARK, decor: true, fine: true });
      }
    }
    // the charging platform at the throat and its railing, the top's bell housing and the receiving hopper
    sink.span('structureMetal', -colR1 - 1.2, platY - 0.35, -colR1 - 1.2, colR1 + 1.2, platY, colR1 + 1.2, { colour: STEEL, decor: true });
    ringRail(sink, 0, 0, colR1 + 1.0, platY, 16, STEEL);
    revolve(sink, 'structureMetal', 0, 0, [[throatR, top], [throatR - 0.6, top + 1.8], [2.2, top + 3.6], [2.2, top + 6.5], [1.6, top + 7.2], [0.001, top + 7.4]], n, { colour: OXIDE, decor: true });
    // the gas uptakes: four from the top's shoulder, joined in pairs and on to the downcomer's head
    const upY = top + 11, headX = -2.2;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const p: Vec3 = [Math.cos(a) * (throatR - 0.4), top + 1.0, Math.sin(a) * (throatR - 0.4)];
      const q: Vec3 = [Math.cos(a) * 2.2, upY, Math.sin(a) * 2.2];
      pipe(sink, p, q, 0.7, RUST);
      pipe(sink, q, [headX, upY + 1.4, 0], 0.7, RUST);
    }
    // the bleeders' caps over the uptakes' head
    for (const s of [-1, 1]) sink.cylinder('structureMetal', [headX, upY + 1.4, s * 0.9], 'y', 2.4, 0.4, 8, { colour: RUST_DARK, decor: true });
    // the downcomer: from the head down at a steep fall to the dust catcher's top at -x
    const dcX = -14, dcZ = 2, dcTop = 15;
    pipe(sink, [headX, upY + 1.0, 0], [dcX + 0.8, dcTop + 2.4, dcZ], 1.15, RUST);
    // the dust catcher: a tall drum on its legs, its cone below, the clean-gas main out of its side to the stoves
    revolve(sink, 'structureMetal', dcX, dcZ, [[0.6, 3.0], [3.6, 7.2], [3.6, dcTop], [2.0, dcTop + 2.2], [1.0, dcTop + 2.8], [0.001, dcTop + 2.9]], n, { colour: RUST });
    bands(sink, dcX, dcZ, 3.6, 7.2, dcTop, 1.4, RUST_DARK, n);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      sink.cylinder('structureMetal', [dcX + Math.cos(a) * 3.1, foot, dcZ + Math.sin(a) * 3.1], 'y', 7.6 - foot, 0.32, 8, { colour: RUST_DARK });
    }
    // ---- the hot-blast stoves: Cowpers on their plinths in a row behind the furnace, each a riveted drum with its dome
    const sz = -15.5, stoveR = 3.7, stoveH = Math.max(H, 26) + 3, span = (stoves - 1) * 10.5;
    const stoveXs = Array.from({ length: stoves }, (_, k) => -span / 2 + k * 10.5);
    for (const sx of stoveXs) {
      sink.cylinder('stone', [sx, foot, sz], 'y', 1.4 - foot, stoveR + 0.6, n, { shade: 0.8 });
      revolve(sink, 'structureMetal', sx, sz, [[stoveR, 1.4], [stoveR, stoveH], [stoveR * 0.92, stoveH + 1.1], [stoveR * 0.7, stoveH + 2.2], [stoveR * 0.38, stoveH + 2.9], [0.001, stoveH + 3.1]], n,
        { colour: shade(RUST, 0.92 + v() * 0.12) });
      bands(sink, sx, sz, stoveR, 1.4, stoveH, 1.6, RUST_DARK, n);
      // the hot-blast valve and its branch to the main, the chimney valve's stub, the ladder up its side
      pipe(sink, [sx, 9, sz + stoveR - 0.2], [sx, 9, sz + 6.8], 0.75, STEEL);
      sink.cylinder('structureMetal', [sx, 8.0, sz + stoveR + 1.2], 'z', 1.2, 1.0, 10, { colour: STEEL, decor: true });
      for (const dx of [-0.25, 0.25]) bar(sink, 'structureMetal', [sx + stoveR + 0.35 + 0, 1.4, sz + dx], [sx + stoveR + 0.35, stoveH, sz + dx], 0.05, { colour: STEEL, decor: true, fine: true });
      // the platform ring at the dome's foot
      ringRail(sink, sx, sz, stoveR + 0.9, stoveH, 14, STEEL);
      revolve(sink, 'structureMetal', sx, sz, [[stoveR + 1.0, stoveH - 0.2], [stoveR + 1.0, stoveH], [stoveR, stoveH]], n, { colour: STEEL, decor: true });
    }
    // the hot-blast main along the stoves' fronts, on to the bustle main
    pipe(sink, [stoveXs[0] - 2, 9, sz + 6.8], [stoveXs[stoveXs.length - 1] + 2, 9, sz + 6.8], 1.0, STEEL);
    pipe(sink, [0, 9, sz + 6.8], [0, bustleY, -bustleR + 0.4], 1.0, STEEL);
    // the clean-gas main from the dust catcher round to the stoves' burners, on its trestles
    const gasY = 12.5;
    pipe(sink, [dcX, gasY, dcZ - 3.4], [dcX, gasY, sz - 6], 1.0, RUST);
    pipe(sink, [dcX, gasY, sz - 6], [stoveXs[stoveXs.length - 1], gasY, sz - 6], 1.0, RUST);
    for (const sx of stoveXs) pipe(sink, [sx, gasY, sz - 6], [sx, 3.5, sz - stoveR - 0.2], 0.55, RUST);
    for (let x = dcX; x <= stoveXs[stoveXs.length - 1]; x += 8) lattice(sink, [x, foot, sz - 6], [x, gasY - 1, sz - 6], 1.2, RUST_DARK, 0.14);
    // ---- the skip bridge: a lattice girder from the stock house's skip pit up to the furnace's top
    const skipRun = L.skip;
    if (skipRun > 0) {
      const sx0 = 6 + skipRun, top0: Vec3 = [3.0, top + 5.5, 0], foot0: Vec3 = [sx0, 1.5, 0];
      lattice(sink, foot0, top0, 2.6, RUST_DARK, 0.2);
      // its trestle bent at the mid-run, the skip pit's head frame and the skip on its track
      const mid: Vec3 = [(foot0[0] + top0[0]) / 2, (foot0[1] + top0[1]) / 2, 0];
      lattice(sink, [mid[0], foot, 0], [mid[0], mid[1] - 1.4, 0], 2.0, RUST_DARK, 0.18);
      sink.span('structureMetal', sx0 - 2.5, foot, -2.5, sx0 + 2.5, 3.2, 2.5, { colour: RUST_DARK });
      const k = 0.35 + v() * 0.4, skipAt: Vec3 = [foot0[0] + (top0[0] - foot0[0]) * k, foot0[1] + (top0[1] - foot0[1]) * k + 1.6, 0];
      sink.placed(0, skipAt[0], skipAt[1], skipAt[2], () => sink.span('structureMetal', -1.0, -0.6, -0.8, 1.0, 0.6, 0.8, { colour: SOOT, decor: true }));
    }
    // ---- the cast house before the furnace: brick gable walls, its iron roof on trusses, open to the front
    const cw = 22, cd = 13, cy = 10.5, cz0 = 6.6;
    for (const s of [-1, 1]) sink.span('stone', s * cw / 2 - 0.5, foot, cz0, s * cw / 2 + 0.5, cy, cz0 + cd, { colour: BRICK_RED });
    sink.span('stone', -cw / 2, foot, cz0 + cd - 0.5, -3, cy - 3.5, cz0 + cd + 0.5);
    sink.span('stone', 3, foot, cz0 + cd - 0.5, cw / 2, cy - 3.5, cz0 + cd + 0.5);
    // the roof's two slopes (iron sheet) over the hall and its ridge lantern
    const rp = (x: number, z: number, y: number): Vec3 => [x, y, z];
    sink.quad('structureMetal', rp(-cw / 2 - 0.6, cz0 + cd + 0.6, cy), rp(cw / 2 + 0.6, cz0 + cd + 0.6, cy), rp(cw / 2 + 0.6, cz0 + cd / 2, cy + 3.2), rp(-cw / 2 - 0.6, cz0 + cd / 2, cy + 3.2), { colour: STEEL });
    sink.quad('structureMetal', rp(cw / 2 + 0.6, cz0 - 0.6, cy), rp(-cw / 2 - 0.6, cz0 - 0.6, cy), rp(-cw / 2 - 0.6, cz0 + cd / 2, cy + 3.2), rp(cw / 2 + 0.6, cz0 + cd / 2, cy + 3.2), { colour: STEEL });
    sink.span('structureMetal', -cw / 2, cy + 3.2, cz0 + cd / 2 - 1.0, cw / 2, cy + 4.4, cz0 + cd / 2 + 1.0, { colour: SOOT, decor: true });
    for (const s of [-1, 1]) {
      sink.polygon('stone', s > 0 ? [rp(s * cw / 2 + 0.5, cz0, cy), rp(s * cw / 2 + 0.5, cz0 + cd, cy), rp(s * cw / 2 + 0.5, cz0 + cd / 2, cy + 3.2)]
        : [rp(s * cw / 2 - 0.5, cz0 + cd, cy), rp(s * cw / 2 - 0.5, cz0, cy), rp(s * cw / 2 - 0.5, cz0 + cd / 2, cy + 3.2)], { colour: BRICK_RED, decor: true });
    }
    // the roof's columns along the open front and the runner gutter's glow-darkened floor
    for (let x = -cw / 2 + 5.5; x < cw / 2 - 1; x += 5.5) sink.span('structureMetal', x - 0.3, foot, cz0 + 0.2, x + 0.3, cy, cz0 + 0.8, { colour: RUST_DARK });
    sink.span('structureMetal', -cw / 2 + 0.5, 0.02, cz0, cw / 2 - 0.5, 0.06, cz0 + cd - 0.5, { colour: SOOT, decor: true });
    // ---- the headframe over the bell: a lattice tower astride the top with the skip's sheave at its head
    for (const [ax, az] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]] as const) {
      bar(sink, 'structureMetal', [ax * 1.4, platY, az * 1.4], [ax * 0.5, top + 14, az * 0.5], 0.3, { colour: RUST_DARK, decor: true });
    }
    sink.span('structureMetal', -1.8, top + 14, -1.8, 1.8, top + 14.6, 1.8, { colour: RUST_DARK, decor: true });
    sink.cylinder('structureMetal', [0.6, top + 15.4, 0], 'z', 0.3, 1.1, 12, { colour: STEEL, decor: true });
  });
  return { parts: sink.finish() };
};

/** A round tube from a to b (r its radius, `seg` sides, its ends open): a main, a riser, a vent stack. */
function tube(sink: PartSink, bucket: 'structureMetal', a: Vec3, b: Vec3, r: number, seg: number, opts: EmitOptions): void {
  const d = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize3([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  const w: Vec3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const at = (p: Vec3, i: number): Vec3 => {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r;
    return [p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s];
  };
  for (let i = 0; i < seg; i++) sink.quad(bucket, at(a, i), at(a, i + 1), at(b, i + 1), at(b, i), opts);
}

/** A patch on a drum of radius r about the axis (the arc t0..t1 in radians, y0 to y1), 0.03 m proud: with `rag` a band
 *  of flaked paint, its edges ragged up and down by the look stream, or with `taper` a rust streak narrowing to its foot
 *  (dressing). */
function drumPatch(sink: PartSink, r: number, t0: number, t1: number, y0: number, y1: number, colour: Rgb,
  o: { taper?: number; rag?: () => number; facets: number }): void {
  const segs = Math.max(1, Math.ceil(Math.abs(t1 - t0) * r / 1.2)), tm = (t0 + t1) / 2, taper = o.taper ?? 0;
  // (on the drum's own facets (a revolve of `facets`, a vertex at angle 0), a hand off them: on the true circle a patch
  // stood up to 8 cm off a 36-facet lift's flats)
  const step = Math.PI * 2 / o.facets;
  const rr = (t: number): number => r * Math.cos(step / 2) / Math.cos((((t % step) + step) % step) - step / 2) + DRESS_PROUD;
  const P = (t: number, y: number): Vec3 => [Math.cos(t) * rr(t), y, Math.sin(t) * rr(t)];
  const foot = (t: number): number => tm + (t - tm) * (1 - taper);
  // (the ragged edge: each seam's top and foot moved a hand, the band's ends pinched)
  const lo: number[] = [], hi: number[] = [], tall = y1 - y0;
  for (let s = 0; s <= segs; s++) {
    // (an end's foot and top meet at most at the middle: never crossed)
    const end = s === 0 || s === segs, k = end ? 0.18 : 0.35, e = end ? 0.3 : 0;
    lo.push(o.rag ? y0 + tall * (e + o.rag() * k) : y0);
    hi.push(o.rag ? y1 - tall * (e + o.rag() * k) : y1);
  }
  for (let s = 0; s < segs; s++) {
    const ta = t0 + (t1 - t0) * s / segs, tb = t0 + (t1 - t0) * (s + 1) / segs;
    sink.quad('structureMetal', P(foot(tb), lo[s + 1]), P(foot(ta), lo[s]), P(ta, hi[s]), P(tb, hi[s + 1]), { colour, decor: true });
  }
}

/** A gabled house in a frame (x along the ridge, z across, y up): walls `wall` from y0 to the eaves at y1, the roof's
 *  ridge `rise` over them, its eaves and verges overhanging, the gables (dressing) under it. */
function gableHouse(sink: PartSink, f: LocalFrame, c: Vec3, hx: number, hz: number, y0: number, y1: number, rise: number,
  wall: { bucket: 'stone' | 'structureMetal'; opts: EmitOptions }, roof: { bucket: 'roof' | 'structureMetal'; opts: EmitOptions }): void {
  sink.box(wall.bucket, [c[0], (y0 + y1) / 2, c[2]], [hx, (y1 - y0) / 2, hz], wall.opts, f);
  const p = (x: number, y: number, z: number): Vec3 => f.toWorld([c[0], 0, c[2]], x, y, z);
  const ex = hx + 0.25, ez = hz + 0.3, yr = y1 + rise;
  sink.quad(roof.bucket, p(-ex, yr, 0), p(ex, yr, 0), p(ex, y1 - 0.1, -ez), p(-ex, y1 - 0.1, -ez), roof.opts);
  sink.quad(roof.bucket, p(ex, yr, 0), p(-ex, yr, 0), p(-ex, y1 - 0.1, ez), p(ex, y1 - 0.1, ez), roof.opts);
  // the gables under it
  sink.polygon(wall.bucket, [p(hx, y1, -hz), p(hx, yr - 0.02, 0), p(hx, y1, hz)], { ...wall.opts, decor: true });
  sink.polygon(wall.bucket, [p(-hx, y1, hz), p(-hx, yr - 0.02, 0), p(-hx, y1, -hz)], { ...wall.opts, decor: true });
}

/** A frame turned to the angle a about +y: x radial (out from the axis), z tangential, y up. */
const radialFrame = (a: number): LocalFrame => new LocalFrame([Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)], [0, 0, 0]);

/**
 * gasholder: the works' column-guided gasholder (the census for Foundry: "a riveted steel column-guided gasholder,
 * 40 m across, 40 m high, between the works and the railway"). The water tank at the foot, brick and wider than the bell,
 * its coping a hand proud of the lowest lift and the water's dark ring between them; the telescoping lifts (`lifts`),
 * each a riveted drum stepped 0.4 m in from the one below, the cup-and-grip seal a projecting trough at each joint;
 * the gas's level (the look stream) drawn as a holder works: the crown lift and those under it fully out, the lowest
 * part-risen from the tank. The crown's dome with its curb, handrail, gangway and vent house. Round it the guide frame:
 * lattice standards (`columns`) on stone pads on piers bonded to the tank, tied by ring girders and braced corner to
 * corner in every bay, the walkway at the top and the stair up one standard. Rust streaks under each seal, bands of
 * flaked paint, the tank's damp line. At its foot the inlet and outlet mains to the valve house between two standards,
 * and the fenced, cindered yard.
 */
export const gasholder: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const ground: (x: number, z: number) => number = ctx.ground ?? (() => 0);
  const R = num(ctx, 'radius', 10, 30), H = num(ctx, 'height', 16, 50), lifts = Math.round(num(ctx, 'lifts', 1, 4)), cols = Math.round(num(ctx, 'columns', 8, 20));
  const foot = -0.8 - ctx.groundFall, n = 36;
  const fill = 0.55 + v() * 0.4;
  const Rc = R + 2.6, top = H + 2, lim = R + 4.4;
  // ---- the tank: a brick ring wall a hand wider than the lowest lift, its coping, the water's ring inside
  const tankH = Math.min(5, H * 0.14), Rt = R + 0.75, Rw = R + 0.3;
  revolve(sink, 'stone', 0, 0, [[Rt, foot], [Rt, tankH - 0.3], [Rt + 0.15, tankH - 0.3], [Rt + 0.15, tankH], [Rw - 0.1, tankH],
    [Rw - 0.1, tankH - 0.15], [Rw, tankH - 0.15], [Rw, tankH - 1.2], [Rw - 0.01, tankH - 1.2]], n, { shade: 0.84 });
  revolve(sink, 'dark', 0, 0, [[Rw, tankH - 0.5], [R, tankH - 0.5]], n, { decor: true });
  // the damp line under the coping and the rising damp at the foot (darker courses)
  for (const [y0, y1, s] of [[tankH - 1.5, tankH - 0.3, 0.62], [-0.2, 0.7, 0.68]] as const) {
    revolve(sink, 'stone', 0, 0, [[Rt, y0], [Rt + 0.02, y0], [Rt + 0.02, y1], [Rt, y1]], n, { shade: s, decor: true });
  }

  // ---- the lifts: each drum 0.4 m in from the one below, rising out of the cup at the head of the one below
  const step = (top - 2 - tankH - 2.2) / lifts, inset = 0.4;
  const heads: Array<{ r: number; y: number; from: number }> = [];
  {
    let r = R, from = tankH - 0.5, head = tankH;
    for (let k = 0; k < lifts; k++) {
      const rise = k === 0 ? step * fill : step;
      const y0 = from - 1.0;
      head = (k === 0 ? tankH : head) + rise;
      // (each lift painted in its own year: a shade apart)
      revolve(sink, 'structureMetal', 0, 0, [[r - 0.01, y0], [r, y0], [r, head], [r - 0.01, head]], n, { colour: shade(RUST, 0.86 + 0.14 * v()) });
      bands(sink, 0, 0, r, from, head, 1.5, RUST_DARK, n);
      heads.push({ r, y: head, from });
      if (k < lifts - 1) {
        // the cup and grip: a trough round the lift's head the next lift's grip dips into, its water seal
        revolve(sink, 'structureMetal', 0, 0, [[r - 0.01, head - 0.6], [r, head - 0.6], [r + 0.46, head - 0.48], [r + 0.46, head + 0.12],
          [r - inset, head + 0.12], [r - inset - 0.01, head + 0.12]], n, { colour: RUST_DARK, decor: true });
        from = head + 0.12;
      }
      r -= inset;
    }
  }
  const crown = heads[heads.length - 1], rTop = crown.r, domeRise = rTop * 0.1;
  const domeY = (rr: number): number => crown.y + 0.15 + domeRise * Math.sqrt(Math.max(0, 1 - (rr / rTop) ** 2));
  // the crown: its curb angle, the dome over it
  revolve(sink, 'structureMetal', 0, 0, [[rTop - 0.01, crown.y - 0.35], [rTop, crown.y - 0.35], [rTop + 0.16, crown.y - 0.3], [rTop + 0.16, crown.y + 0.2],
    [rTop - 0.25, crown.y + 0.2], [rTop - 0.26, crown.y + 0.2]], n, { colour: RUST_DARK, decor: true });
  const dome: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) { const a = (Math.PI / 2) * i / 8; dome.push([Math.max(0.001, Math.cos(a) * rTop), crown.y + 0.15 + Math.sin(a) * domeRise]); }
  revolve(sink, 'structureMetal', 0, 0, dome, n, { colour: OXIDE });
  // the crown's handrail, the gangway across the dome to the vent house at its middle
  ringRail(sink, 0, 0, rTop - 0.35, domeY(rTop - 0.35) - 0.05, cols * 2, STEEL);
  {
    const ga = Math.PI / cols, gc = Math.cos(ga), gs = Math.sin(ga), stops = [rTop - 0.35, rTop * 0.68, rTop * 0.36, 1.5];
    const at = (rr: number, w: number, dy: number): Vec3 => [gc * rr - gs * w, domeY(rr) + dy, gs * rr + gc * w];
    for (let i = 0; i + 1 < stops.length; i++) {
      const r0 = stops[i], r1 = stops[i + 1];
      sink.quad('structureMetal', at(r0, -0.45, 0.12), at(r1, -0.45, 0.12), at(r1, 0.45, 0.12), at(r0, 0.45, 0.12), { colour: STEEL, decor: true });
      for (const w of [-0.5, 0.5]) {
        bar(sink, 'structureMetal', at(r0, w, 0.05), at(r1, w, 0.05), 0.08, { colour: STEEL, decor: true });
        bar(sink, 'structureMetal', at(r0, w, 1.05), at(r1, w, 1.05), 0.05, { colour: STEEL, decor: true, fine: true });
        bar(sink, 'structureMetal', at(r0, w, 0), at(r0, w, 1.05), 0.05, { colour: STEEL, decor: true, fine: true });
      }
    }
    const vy = domeY(0) - 0.1, vf = radialFrame(ga);
    gableHouse(sink, vf, [0, 0, 0], 1.3, 1.05, vy, vy + 2.1, 0.55,
      { bucket: 'structureMetal', opts: { colour: shade(STEEL, 1.05), decor: true } }, { bucket: 'structureMetal', opts: { colour: RUST_DARK, decor: true } });
    sink.box('dark', vf.toWorld([0, 0, 0], 1.32, vy + 0.95, 0), [0.03, 0.9, 0.45], { decor: true }, vf);
    sink.cylinder('structureMetal', [-gc * 0.6, vy + 2.0, -gs * 0.6], 'y', 1.9, 0.22, 8, { colour: RUST_DARK, decor: true });
    sink.cylinder('structureMetal', [-gc * 0.6, vy + 3.9, -gs * 0.6], 'y', 0.25, 0.42, 8, { colour: RUST_DARK, decor: true });
  }

  // ---- the weathering in form: rust streaks run down from each seal and the curb, bands of flaked paint at the seals
  for (const h of heads) {
    const span = h.y - h.from;
    const streaks = 5 + Math.floor(v() * 4);
    for (let s = 0; s < streaks; s++) {
      const t = v() * Math.PI * 2, w = (0.25 + v() * 0.55) / h.r, len = Math.min(span - 0.8, 1.4 + v() * span * 0.6);
      const col = v() < 0.4 ? shade(RUST_DARK, 0.75) : shade(OXIDE, 1.15);
      if (len > 0.5) drumPatch(sink, h.r, t - w / 2, t + w / 2, h.y - 0.6 - len, h.y - 0.6, col, { taper: 0.75, facets: n });
    }
    const flakes = 2 + Math.floor(v() * 2);
    for (let s = 0; s < flakes; s++) {
      const t = v() * Math.PI * 2, arc = (3 + v() * 9) / h.r, tall = 0.6 + v() * 1.0, y0 = h.from + 0.2 + v() * Math.max(0.1, span - tall - 1.2);
      drumPatch(sink, h.r, t, t + arc, y0, y0 + tall, shade(OXIDE, 1.12 + v() * 0.1), { rag: v, facets: n });
    }
  }

  // ---- the guide frame: each standard on its stone pad on a pier bonded to the tank, the lattice up to the walkway
  const levels = [tankH + 0.35, ...[0.24, 0.49, 0.74].map((f) => tankH + 0.35 + (top - tankH - 0.35) * f), top];
  const colAt = (k: number, y: number): Vec3 => { const a = (k / cols) * Math.PI * 2; return [Math.cos(a) * Rc, y, Math.sin(a) * Rc]; };
  for (let k = 0; k < cols; k++) {
    const a = (k / cols) * Math.PI * 2, f = radialFrame(a), ca = Math.cos(a), sa = Math.sin(a);
    const pr0 = Rt - 0.1, pr1 = Rc + 0.75, pm = (pr0 + pr1) / 2;
    sink.box('stone', [ca * pm, (foot + tankH) / 2, sa * pm], [(pr1 - pr0) / 2, (tankH - foot) / 2, 0.7], { shade: 0.78 }, f);
    sink.box('stone', [ca * Rc, tankH + 0.175, sa * Rc], [0.85, 0.175, 0.85], { shade: 1.05 }, f);
    sink.box('structureMetal', [ca * Rc, tankH + 0.42, sa * Rc], [0.75, 0.07, 0.75], { colour: STEEL, decor: true }, f);
    standard(sink, a, Rc, tankH + 0.35, top, 1.2, RUST_DARK);
    // (the guide rail the lifts' rollers run on, down the standard's inner face across its lacing)
    bar(sink, 'structureMetal', [ca * (Rc - 0.6), tankH + 0.35, sa * (Rc - 0.6)], [ca * (Rc - 0.6), top, sa * (Rc - 0.6)], 0.14, { colour: STEEL, decor: true });
  }
  // the ring girders (each a deep pair of chords) and the bracing corner to corner in every bay between them
  for (let i = 0; i < levels.length; i++) for (let k = 0; k < cols; k++) {
    const gy = levels[i];
    if (i > 0) for (const dy of [0, -0.9]) bar(sink, 'structureMetal', colAt(k, gy + dy), colAt(k + 1, gy + dy), 0.34, { colour: RUST_DARK, decor: true });
    if (i + 1 < levels.length) {
      const y0 = i === 0 ? gy + 0.3 : gy - 0.9, y1 = levels[i + 1] - 0.9;
      const col = v() < 0.12 ? shade(OXIDE, 0.95) : shade(RUST_DARK, 1.12);
      bar(sink, 'structureMetal', colAt(k, y0), colAt(k + 1, y1), 0.13, { colour: col, decor: true });
      bar(sink, 'structureMetal', colAt(k + 1, y0), colAt(k, y1), 0.13, { colour: col, decor: true });
    }
  }
  // each standard's diaphragm plate at every girder and brace level: the girders, aimed at the standard's centre, frame
  // into its plate (the hollow between its four angles held nothing for them)
  const plateYs = new Set<number>([levels[0] + 0.3]);
  for (let i = 1; i < levels.length; i++) { plateYs.add(levels[i]); plateYs.add(levels[i] - 0.9); }
  for (let k = 0; k < cols; k++) {
    const a = (k / cols) * Math.PI * 2, f = radialFrame(a);
    for (const y of plateYs) sink.box('structureMetal', [Math.cos(a) * Rc, y, Math.sin(a) * Rc], [0.6, 0.05, 0.6], { colour: RUST_DARK, decor: true }, f);
  }
  // each lift's guide rollers on their brackets running on the standards, at its head
  for (const h of heads) for (let c = 0; c < cols; c++) {
    const a = (c / cols) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    bar(sink, 'structureMetal', [ca * (h.r - 0.1), h.y + 0.3, sa * (h.r - 0.1)], [ca * (Rc - 0.7), h.y + 0.3, sa * (Rc - 0.7)], 0.22, { colour: STEEL, decor: true });
    sink.span('structureMetal', ca * (Rc - 0.75) - 0.3, h.y, sa * (Rc - 0.75) - 0.3, ca * (Rc - 0.75) + 0.3, h.y + 0.6, sa * (Rc - 0.75) + 0.3, { colour: shade(STEEL, 0.8), decor: true });
  }
  // the walkway on the top girder, its railing
  revolve(sink, 'structureMetal', 0, 0, [[Rc - 0.7, top + 0.02], [Rc + 0.7, top + 0.02], [Rc + 0.7, top + 0.14], [Rc - 0.7, top + 0.14]], cols * 3, { colour: STEEL, decor: true });
  ringRail(sink, 0, 0, Rc + 0.6, top + 0.14, cols * 2, STEEL);
  // the stair up the first standard, flight by flight
  const sx = Rc + 1.2, sz = 0;
  // (the flights switch back on landings every 3 m, each flight a stringer pair with its treads and a handrail)
  for (let fy = 0; fy < top - 0.5; fy += 3) {
    const dz = (Math.floor(fy / 3) % 2 ? -1 : 1) * 2.2, y1 = Math.min(top, fy + 3);
    for (const dx of [-0.45, 0.45]) bar(sink, 'structureMetal', [sx + dx, fy, sz - dz], [sx + dx, y1, sz + dz], 0.1, { colour: STEEL, decor: true });
    for (let t = 0.1; t < 1; t += 0.14) {
      const y = fy + (y1 - fy) * t, z = sz - dz + 2 * dz * t;
      sink.span('structureMetal', sx - 0.45, y - 0.03, z - 0.12, sx + 0.45, y + 0.03, z + 0.12, { colour: STEEL, decor: true, fine: 'near' });
    }
    bar(sink, 'structureMetal', [sx + 0.5, fy + 1.0, sz - dz], [sx + 0.5, y1 + 1.0, sz + dz], 0.05, { colour: STEEL, decor: true });
    for (const [py, pz] of [[fy, sz - dz], [y1, sz + dz]] as const) bar(sink, 'structureMetal', [sx + 0.5, py, pz], [sx + 0.5, py + 1.03, pz], 0.05, { colour: STEEL, decor: true });
    sink.span('structureMetal', sx - 0.6, y1 - 0.08, sz + dz - 0.7 * Math.sign(dz) - 0.7, sx + 0.6, y1, sz + dz + 0.7 * Math.sign(dz) - 0.7 + 1.4 * (dz > 0 ? 1 : 0), { colour: STEEL, decor: true });
  }

  // ---- the yard: the inlet and outlet mains out between two standards to the valve house, the cinders, the fence
  {
    // (the bay between standards nearest the works' quarter)
    const am = (Math.floor(cols / 8) + 0.5) / cols * Math.PI * 2, f = radialFrame(am), ca = Math.cos(am), sa = Math.sin(am);
    const hx = 2.1, hz = 2.5, ex = hx + 0.25, ez = hz + 0.3;
    // the house as far out as the yard allows
    let d = Infinity;
    for (const [i, j] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ox = ca * ex * i - sa * ez * j, oz = sa * ex * i + ca * ez * j;
      if (ca > 1e-3) d = Math.min(d, (lim - 0.4 - ox) / ca);
      if (sa > 1e-3) d = Math.min(d, (lim - 0.4 - oz) / sa);
    }
    const cx = ca * d, cz = sa * d;
    let g0 = Infinity;
    for (const [i, j] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g0 = Math.min(g0, ground(cx + ca * hx * i - sa * hz * j, cz + sa * hx * i + ca * hz * j));
    // the valve house: brick under a tiled roof, its door to the yard and a window each side
    gableHouse(sink, f, [cx, 0, cz], hx, hz, g0 - 0.4, g0 + 3.3, 1.3, { bucket: 'stone', opts: { shade: 0.9 } }, { bucket: 'roof', opts: { shade: 0.78, decor: true } });
    const fp = (x: number, y: number, z: number): Vec3 => f.toWorld([cx, 0, cz], x, y, z);
    sink.box('dark', fp(-hx - 0.02, g0 + 1.15, 1.1), [0.05, 1.15, 0.6], { decor: true }, f);
    for (const j of [-1, 1]) sink.box('dark', fp(0.3, g0 + 1.9, j * (hz + 0.02)), [0.6, 0.55, 0.05], { decor: true }, f);
    // the mains: out through the tank wall under the water line, on their saddles, each through its valve to the house
    const r0 = Rt - 0.2, r1 = d - hx;
    for (const j of [-0.85, 0.85]) {
      const mid = ground(ca * (r0 + r1) / 2 - sa * j, sa * (r0 + r1) / 2 + ca * j), y = mid + 0.85;
      const P = (rr: number, dy = 0): Vec3 => [ca * rr - sa * j, y + dy, sa * rr + ca * j];
      tube(sink, 'structureMetal', P(r0), P(r1 + 0.1), 0.4, 10, { colour: shade(RUST, 0.8), decor: true });
      for (const rr of [r0 + 0.6, r1 - 0.5]) {
        const gy = ground(ca * rr - sa * j, sa * rr + ca * j);
        sink.box('stone', [ca * rr - sa * j, (gy + y) / 2 - 0.3, sa * rr + ca * j], [0.3, (y - gy) / 2, 0.55], { shade: 0.95, decor: true }, f);
      }
      // the valve: its body, the spindle and handwheel over it
      const vr = (r0 + r1) / 2;
      sink.box('structureMetal', P(vr), [0.35, 0.62, 0.55], { colour: STEEL, decor: true }, f);
      bar(sink, 'structureMetal', P(vr, 0.6), P(vr, 1.5), 0.08, { colour: STEEL, decor: true });
      sink.cylinder('structureMetal', P(vr, 1.45), 'y', 0.06, 0.38, 8, { colour: RUST_DARK, decor: true });
    }
    // the cinders: a draped bed over the yard, darker and wetter round the tank, its edge ragged into the ground
    const S = lim - 0.2, cells = Math.max(6, Math.round((2 * S) / 2.6)), cs = (2 * S) / cells;
    const jit: number[] = [];
    for (let i = 0; i <= cells * 4; i++) jit.push((v() - 0.5) * 0.6);
    const at = (i: number, j: number): Vec3 => {
      let x = -S + cs * i, z = -S + cs * j;
      const edge = i === 0 || j === 0 || i === cells || j === cells;
      if (i === 0) x -= jit[j] * 0.5 + 0.1; else if (i === cells) x += jit[cells + j] * 0.5 - 0.1;
      if (j === 0) z -= jit[2 * cells + i] * 0.5 + 0.1; else if (j === cells) z += jit[3 * cells + i] * 0.5 - 0.1;
      return [x, ground(x, z) + (edge ? 0.008 : 0.05), z];
    };
    const cinder = (p: Vec3): Rgb => {
      const wet = Math.max(0, 1 - Math.abs(Math.hypot(p[0], p[2]) - Rt - 1) / 3);
      const k = (0.3 + 0.03 * Math.sin(p[0] * 0.71 + p[2] * 0.37) * Math.cos(p[2] * 0.53)) * (1 - 0.25 * wet);
      return [k, k * 0.96, k * 0.93];
    };
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
      const p00 = at(i, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1), p10 = at(i + 1, j);
      if (Math.max(Math.hypot(p00[0], p00[2]), Math.hypot(p01[0], p01[2]), Math.hypot(p11[0], p11[2]), Math.hypot(p10[0], p10[2])) < Rt - 0.3) continue;
      sink.polygon('plaster3', [p00, p01, p11], { decor: true, tintAt: cinder });
      sink.polygon('plaster3', [p00, p11, p10], { decor: true, tintAt: cinder });
    }
    // slag and broken brick at the tank's foot
    for (let s = 0; s < 18; s++) {
      const a = v() * Math.PI * 2, rr = Rt + 0.4 + v() * 1.6, x = Math.cos(a) * rr, z = Math.sin(a) * rr, q = 0.12 + v() * 0.2, y = ground(x, z);
      sink.span('stone', x - q, y - 0.08, z - q * 0.8, x + q, y + q * 0.9, z + q * 0.8, { shade: 0.45 + v() * 0.3, decor: true, fine: true });
    }
    // the fence: concrete posts with their cranked barbed-wire arms, the rails between, a gate toward the works' road
    // (the gate: the one post at the stair's foot left out, a gap of two bays)
    const F = lim - 0.1, gate = [-2, 2];
    const sides: Array<[number, number, number, number]> = [[-F, -F, F, -F], [F, -F, F, F], [F, F, -F, F], [-F, F, -F, -F]];
    for (const [x0, z0, x1, z1] of sides) {
      const len = Math.hypot(x1 - x0, z1 - z0), posts = Math.max(2, Math.round(len / 3.1)), ox = Math.sign(x0 + x1) * 0.5, oz = Math.sign(z0 + z1) * 0.5;
      let prev: Vec3 | null = null;
      for (let k = 0; k <= posts; k++) {
        const x = x0 + (x1 - x0) * k / posts, z = z0 + (z1 - z0) * k / posts, y = ground(x, z);
        // (the gate's gap on the +x side)
        const inGate = x0 === F && x1 === F && z > gate[0] && z < gate[1];
        if (!inGate) {
          sink.span('stone', x - 0.07, y - 0.5, z - 0.07, x + 0.07, y + 2.1, z + 0.07, { shade: 0.95, decor: true });
          bar(sink, 'structureMetal', [x, y + 2.05, z], [x + ox * 0.35, y + 2.45, z + oz * 0.35], 0.06, { colour: STEEL, decor: true, fine: true });
        }
        const cur: Vec3 = [x, y, z];
        if (prev && !inGate && !(x0 === F && x1 === F && prev[2] > gate[0] && prev[2] < gate[1])) {
          for (const h of [0.15, 1.15, 2.0]) bar(sink, 'structureMetal', [prev[0], prev[1] + h, prev[2]], [x, y + h, z], h === 1.15 ? 0.03 : 0.05, { colour: STEEL, decor: true, fine: h === 1.15 });
          bar(sink, 'structureMetal', [prev[0] + ox * 0.3, prev[1] + 2.38, prev[2] + oz * 0.3], [x + ox * 0.3, y + 2.38, z + oz * 0.3], 0.025, { colour: STEEL, decor: true, fine: true });
        }
        prev = cur;
      }
    }
  }
  return { parts: sink.finish() };
};

/** A guide standard at the angle a on radius rc from y0 to y1: a square lattice w wide whose faces are turned to the
 *  holder (x radial, z tangential), its four chords and zig-zag lacing on the outer and inner faces (dressing). */
function standard(sink: PartSink, a: number, rc: number, y0: number, y1: number, w: number, colour: Rgb): void {
  const ca = Math.cos(a), sa = Math.sin(a);
  const p = (i: number, j: number, y: number): Vec3 => [ca * (rc + i * w / 2) - sa * j * w / 2, y, sa * (rc + i * w / 2) + ca * j * w / 2];
  const o: EmitOptions = { colour, decor: true };
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bar(sink, 'structureMetal', p(i, j, y0), p(i, j, y1), 0.16, o);
  const panels = Math.max(1, Math.round((y1 - y0) / (w * 1.15))), lace: EmitOptions = { colour: shade(colour, 0.9), decor: true, fine: true };
  for (let k = 0; k < panels; k++) {
    const ya = y0 + (y1 - y0) * k / panels, yb = y0 + (y1 - y0) * (k + 1) / panels, j = k % 2 ? 1 : -1;
    for (const i of [-1, 1]) bar(sink, 'structureMetal', p(i, j, ya), p(i, -j, yb), 0.09, lace);
  }
}
