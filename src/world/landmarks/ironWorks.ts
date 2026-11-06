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
import { PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
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

/** A square lattice tower or girder's four chords from a to b (centre line), `w` wide, with zig-zag lacing (dressing). */
function lattice(sink: PartSink, a: Vec3, b: Vec3, w: number, colour: Rgb, mobile: boolean, chord = 0.16): void {
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
  const lace: EmitOptions = { colour: shade(colour, 0.9), decor: true, fine: mobile ? undefined : true };
  for (let k = 0; k < panels; k++) {
    const p = at(k), q = at(k + 1);
    for (let f = 0; f < 4; f++) {
      const [i0, j0] = corners[f], [i1, j1] = corners[(f + 1) % 4];
      if (mobile && f % 2) continue;
      bar(sink, 'structureMetal', corner(p, k % 2 ? i0 : i1, k % 2 ? j0 : j1), corner(q, k % 2 ? i1 : i0, k % 2 ? j1 : j0), chord * 0.55, lace);
    }
    bar(sink, 'structureMetal', corner(q, -1, -1), corner(q, 1, -1), chord * 0.6, lace);
    bar(sink, 'structureMetal', corner(q, -1, 1), corner(q, 1, 1), chord * 0.6, lace);
  }
}

/** A run of large pipe from a to b (r its radius), its flanged joints every 6 m (dressing). */
function pipe(sink: PartSink, a: Vec3, b: Vec3, r: number, colour: Rgb, mobile: boolean): void {
  bar(sink, 'structureMetal', a, b, r * 2, { colour, decor: true });
  if (mobile) return;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  for (let s = 3; s < L - 1; s += 6) {
    const k = s / L, p: Vec3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const k2 = (s + 0.25) / L, q: Vec3 = [a[0] + (b[0] - a[0]) * k2, a[1] + (b[1] - a[1]) * k2, a[2] + (b[2] - a[2]) * k2];
    bar(sink, 'structureMetal', p, q, r * 2 + 0.22, { colour: shade(colour, 0.8), decor: true, fine: true });
  }
}

/** A riveted cylinder's bands (the plates' seams) up a drum from y0 to y1 (dressing, fine). */
function bands(sink: PartSink, x: number, z: number, r: number, y0: number, y1: number, pitch: number, colour: Rgb, n: number): void {
  for (let y = y0 + pitch; y < y1 - 0.3; y += pitch) revolve(sink, 'structureMetal', x, z, [[r + 0.04, y], [r + 0.04, y + 0.14]], n, { colour, decor: true, fine: true });
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
  const mobile = ctx.tier === 'mobile', v = ctx.variant;
  const L = blastFurnaceLayout(ctx.params);
  const { H, stoves } = L;
  const foot = -0.8 - ctx.groundFall, n = mobile ? 14 : 22;
  sink.placed(0, L.fx, 0, L.fz, () => {
    // ---- the furnace: the hearth's jacket, the bosh, the stack tapering to the throat, the top cone
    const hearthR = 5.2, boshY = 7.5, boshR = 6.4, throatR = 4.2, top = H;
    revolve(sink, 'structureMetal', 0, 0, [[hearthR + 0.8, foot], [hearthR + 0.8, 1.2], [hearthR, 1.2], [hearthR, boshY - 3], [boshR, boshY], [boshR, boshY + 1.5],
      [throatR, top - 2.5], [throatR, top]], n, { colour: RUST });
    bands(sink, 0, 0, hearthR, 1.2, boshY - 3, 0.9, RUST_DARK, n);
    // the stack's binding hoops
    for (let y = boshY + 3; y < top - 3; y += 2.4) {
      const r = boshR + (throatR - boshR) * (y - boshY - 1.5) / (top - 2.5 - boshY - 1.5);
      revolve(sink, 'structureMetal', 0, 0, [[r + 0.08, y], [r + 0.08, y + 0.3]], n, { colour: RUST_DARK, decor: true, fine: mobile ? undefined : 'near' });
    }
    // the bustle main ringing the bosh and the tuyere stocks down to the hearth
    const bustleY = boshY + 1.2, bustleR = boshR + 2.4, tuyeres = mobile ? 8 : 14;
    for (let k = 0; k < tuyeres; k++) {
      const a = (k / tuyeres) * Math.PI * 2, b = ((k + 1) / tuyeres) * Math.PI * 2;
      pipe(sink, [Math.cos(a) * bustleR, bustleY, Math.sin(a) * bustleR], [Math.cos(b) * bustleR, bustleY, Math.sin(b) * bustleR], 0.65, STEEL, true);
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
        bar(sink, 'structureMetal', [Math.cos(a) * colR0, 3, Math.sin(a) * colR0], [Math.cos(b) * colR0, bustleY + 2, Math.sin(b) * colR0], 0.22, { colour: RUST_DARK, decor: true, fine: mobile ? undefined : true });
      }
    }
    // the charging platform at the throat and its railing, the top's bell housing and the receiving hopper
    sink.span('structureMetal', -colR1 - 1.2, platY - 0.35, -colR1 - 1.2, colR1 + 1.2, platY, colR1 + 1.2, { colour: STEEL, decor: true });
    if (!mobile) ringRail(sink, 0, 0, colR1 + 1.0, platY, 16, STEEL);
    revolve(sink, 'structureMetal', 0, 0, [[throatR, top], [throatR - 0.6, top + 1.8], [2.2, top + 3.6], [2.2, top + 6.5], [1.6, top + 7.2], [0.001, top + 7.4]], n, { colour: OXIDE, decor: true });
    // the gas uptakes: four from the top's shoulder, joined in pairs and on to the downcomer's head
    const upY = top + 11, headX = -2.2;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const p: Vec3 = [Math.cos(a) * (throatR - 0.4), top + 1.0, Math.sin(a) * (throatR - 0.4)];
      const q: Vec3 = [Math.cos(a) * 2.2, upY, Math.sin(a) * 2.2];
      pipe(sink, p, q, 0.7, RUST, mobile);
      pipe(sink, q, [headX, upY + 1.4, 0], 0.7, RUST, mobile);
    }
    // the bleeders' caps over the uptakes' head
    for (const s of [-1, 1]) sink.cylinder('structureMetal', [headX, upY + 1.4, s * 0.9], 'y', 2.4, 0.4, 8, { colour: RUST_DARK, decor: true });
    // the downcomer: from the head down at a steep fall to the dust catcher's top at -x
    const dcX = -14, dcZ = 2, dcTop = 15;
    pipe(sink, [headX, upY + 1.0, 0], [dcX + 0.8, dcTop + 2.4, dcZ], 1.15, RUST, mobile);
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
      pipe(sink, [sx, 9, sz + stoveR - 0.2], [sx, 9, sz + 6.8], 0.75, STEEL, true);
      sink.cylinder('structureMetal', [sx, 8.0, sz + stoveR + 1.2], 'z', 1.2, 1.0, 10, { colour: STEEL, decor: true });
      if (!mobile) for (const dx of [-0.25, 0.25]) bar(sink, 'structureMetal', [sx + stoveR + 0.35 + 0, 1.4, sz + dx], [sx + stoveR + 0.35, stoveH, sz + dx], 0.05, { colour: STEEL, decor: true, fine: true });
      // the platform ring at the dome's foot
      if (!mobile) ringRail(sink, sx, sz, stoveR + 0.9, stoveH, 14, STEEL);
      revolve(sink, 'structureMetal', sx, sz, [[stoveR + 1.0, stoveH - 0.2], [stoveR + 1.0, stoveH], [stoveR, stoveH]], n, { colour: STEEL, decor: true });
    }
    // the hot-blast main along the stoves' fronts, on to the bustle main
    pipe(sink, [stoveXs[0] - 2, 9, sz + 6.8], [stoveXs[stoveXs.length - 1] + 2, 9, sz + 6.8], 1.0, STEEL, mobile);
    pipe(sink, [0, 9, sz + 6.8], [0, bustleY, -bustleR + 0.4], 1.0, STEEL, mobile);
    // the clean-gas main from the dust catcher round to the stoves' burners, on its trestles
    const gasY = 12.5;
    pipe(sink, [dcX, gasY, dcZ - 3.4], [dcX, gasY, sz - 6], 1.0, RUST, mobile);
    pipe(sink, [dcX, gasY, sz - 6], [stoveXs[stoveXs.length - 1], gasY, sz - 6], 1.0, RUST, mobile);
    for (const sx of stoveXs) pipe(sink, [sx, gasY, sz - 6], [sx, 3.5, sz - stoveR - 0.2], 0.55, RUST, mobile);
    for (let x = dcX; x <= stoveXs[stoveXs.length - 1]; x += 8) lattice(sink, [x, foot, sz - 6], [x, gasY - 1, sz - 6], 1.2, RUST_DARK, mobile, 0.14);
    // ---- the skip bridge: a lattice girder from the stock house's skip pit up to the furnace's top
    const skipRun = L.skip;
    if (skipRun > 0) {
      const sx0 = 6 + skipRun, top0: Vec3 = [3.0, top + 5.5, 0], foot0: Vec3 = [sx0, 1.5, 0];
      lattice(sink, foot0, top0, 2.6, RUST_DARK, mobile, 0.2);
      // its trestle bent at the mid-run, the skip pit's head frame and the skip on its track
      const mid: Vec3 = [(foot0[0] + top0[0]) / 2, (foot0[1] + top0[1]) / 2, 0];
      lattice(sink, [mid[0], foot, 0], [mid[0], mid[1] - 1.4, 0], 2.0, RUST_DARK, mobile, 0.18);
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
