// src/world/landmarks/siwa.ts — Siwa's mosque and spring (landmarks-271, 2026-11-06). Sunscar Oasis is Siwa under the
// crumbling kershef fortress of Shali: the census (buildings-270 signature places) names the old Shali mosque with its
// tapering conical mud minaret — "the first landmark on the approach" at the citadel's foot facing the market — and the
// Ain Juba spring (Cleopatra's Spring), its round stone-lined pool, steps and outflow channels into the palm gardens.
//
// - shaliMosque: the low prayer hall of salt-mud kershef, its walls thick and softly slumped, the parapet's rounded
//   crenels, the palm-trunk beam ends through the walls and the low doors; the minaret at its corner, a square shaft
//   battered and tapering to a rounded cone with its little openings and the palm-rib balcony; the ablution court's wall.
// - springPool: the round pool in its stone ring, steps down its side, the outflow channels into the gardens and the
//   café's palm-frond shade on its posts.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink, in the map kit's render
// (no draw call of their own). Walls and the minaret are structure; the beams, fronds and the water are dressing.
import { PartSink, rgb, shade, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const PALM = rgb(0x5b4a37), FROND = rgb(0x7c7146), DOOR = rgb(0x4d3b2a), WATER = rgb(0x2f5d5a);

const FROND_GREEN = rgb(0x4e6a2c);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/**
 * A slumped mud wall from a to b (plan points), `t` thick and `h` high: its faces leaning in as kershef walls weather,
 * its top rounded, the rain's notches in the parapet. In the wall's own frame: u along, the outer face on the right.
 */
function mudWall(sink: PartSink, bucket: RegionalBucket, a: readonly [number, number], b: readonly [number, number], foot: number, h: number, t: number,
  v: () => number, opts: { crenels?: boolean; beams?: boolean }): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = uz, nz = -ux;
  const lean = 0.18, segs = Math.max(2, Math.round(L / 2.4));
  const P = (s: number, y: number, o: number): Vec3 => [a[0] + ux * s + nx * o, y, a[1] + uz * s + nz * o];
  // the top's height along the wall: it sags and swells as the mud has slumped
  const tops = Array.from({ length: segs + 1 }, () => h - 0.45 + v() * 0.9);
  for (let k = 0; k < segs; k++) {
    const s0 = L * k / segs, s1 = L * (k + 1) / segs, y0 = tops[k], y1 = tops[k + 1];
    // outer face (+o) and inner face (-o), leaning in toward the top; the rounded top between them
    sink.quad(bucket, P(s1, foot, t / 2), P(s0, foot, t / 2), P(s0, y0, t / 2 - lean), P(s1, y1, t / 2 - lean), {});
    sink.quad(bucket, P(s0, foot, -t / 2), P(s1, foot, -t / 2), P(s1, y1, -t / 2 + lean), P(s0, y0, -t / 2 + lean), {});
    sink.quad(bucket, P(s1, y1, t / 2 - lean), P(s0, y0, t / 2 - lean), P(s0, y0 + 0.12, 0), P(s1, y1 + 0.12, 0), { shade: 0.96 });
    sink.quad(bucket, P(s0, y0, -t / 2 + lean), P(s1, y1, -t / 2 + lean), P(s1, y1 + 0.12, 0), P(s0, y0 + 0.12, 0), { shade: 0.96 });
    if (opts.crenels) {
      // the rounded crenels of the parapet, two to a segment
      for (const f of [0.25, 0.75]) {
        const s = s0 + (s1 - s0) * f, y = y0 + (y1 - y0) * f + 0.1;
        revolve(sink, bucket, P(s, 0, 0)[0], P(s, 0, 0)[2], [[0.32, y - 0.05], [0.3, y + 0.35], [0.16, y + 0.62], [0.001, y + 0.7]], 8, {});
      }
    }
    if (opts.beams && k % 2 === 0) {
      // the palm-trunk beam ends through the wall under the roof line
      const s = (s0 + s1) / 2, y = Math.min(y0, y1) - 0.7;
      bar(sink, 'structureWood', P(s, y, t / 2 - lean * 0.8), P(s, y, t / 2 + 0.45), 0.2, { colour: PALM, decor: true });
    }
  }
  // the wall's ends
  sink.quad(bucket, P(0, foot, -t / 2), P(0, tops[0], -t / 2 + lean), P(0, tops[0], t / 2 - lean), P(0, foot, t / 2), {});
  sink.quad(bucket, P(L, foot, t / 2), P(L, tops[segs], t / 2 - lean), P(L, tops[segs], -t / 2 + lean), P(L, foot, -t / 2), {});
}

/**
 * The old Shali mosque: the prayer hall (`width` x `depth`, `height` to its roof) with its parapet's rounded crenels,
 * the minaret (`minaret` high) at its front-right corner, tapering from its square foot to the rounded cone, and the
 * ablution court's low wall before the doors (+z).
 */
export const shaliMosque: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const W = num(ctx, 'width', 8, 20), D = num(ctx, 'depth', 8, 20), H = num(ctx, 'height', 3, 6), M = num(ctx, 'minaret', 8, 18);
  const foot = -0.6 - ctx.groundFall, mud: RegionalBucket = 'plaster', t = 0.9;
  // the hall's four walls (doors cut as dark recesses in the front), its roof of palm logs under mud
  const c: Array<[number, number]> = [[-W / 2, D / 2], [W / 2, D / 2], [W / 2, -D / 2], [-W / 2, -D / 2]];
  for (let k = 0; k < 4; k++) mudWall(sink, mud, c[k], c[(k + 1) % 4], foot, H + 0.7, t, v, { crenels: true, beams: true });
  sink.quad(mud, [-W / 2 + 0.4, H, D / 2 - 0.4], [W / 2 - 0.4, H, D / 2 - 0.4], [W / 2 - 0.4, H, -D / 2 + 0.4], [-W / 2 + 0.4, H, -D / 2 + 0.4], { shade: 0.9 });
  sink.span(mud, -W / 2 + 0.4, foot, -D / 2 + 0.4, W / 2 - 0.4, H - 0.02, D / 2 - 0.4, { decor: false });
  for (const u of [-W / 4, W / 6]) {
    sink.span('dark', u - 0.55, 0, D / 2 + 0.36, u + 0.55, 2.0, D / 2 + 0.42, { decor: true });
    sink.span('structureWood', u - 0.75, 2.0, D / 2 + 0.3, u + 0.75, 2.2, D / 2 + 0.6, { colour: PALM, decor: true });
    if (v() < 0.6) sink.span('structureWood', u - 0.5, 0.02, D / 2 + 0.42, u + 0.5, 1.95, D / 2 + 0.47, { colour: DOOR, decor: true });
  }
  // the minaret: its battered square foot rounding into the tapering cone, the openings up it, the palm-rib balcony
  const mx = W / 2 - 1.2, mz = D / 2 - 1.2, n = 12;
  const r0 = 1.7;
  // (hand-moulded: its taper swells and pinches course by course, the top rounded off)
  const profile: Array<[number, number]> = [[r0 * 1.18, foot], [r0 * 1.04, 1.0]];
  for (let k = 1; k <= 9; k++) { const f = k / 10; profile.push([r0 * (1 - 0.52 * f) * (0.93 + v() * 0.12), 1.0 + (M * 0.9 - 1.0) * f]); }
  profile.push([r0 * 0.4, M * 0.93], [r0 * 0.27, M * 0.975], [0.12, M], [0.001, M + 0.04]);
  revolve(sink, mud, mx, mz, profile, n, {}, Math.PI / 4);
  for (let y = 2.6; y < M * 0.8; y += 2.2) {
    const k = y / M, r = r0 * (1 - 0.4 * k) + 0.03, a = v() * Math.PI * 2;
    sink.placed(a, mx, y, mz, () => sink.span('dark', -0.12, 0, r - 0.05, 0.12, 0.45, r + 0.01, { decor: true }));
  }
  // the muezzin's balcony: a thick moulded mud ring round the shaft on its palm-log brackets, its low rounded parapet
  const by = M * 0.62, rs = r0 * (1 - 0.52 * 0.62), br = rs + 0.55;
  revolve(sink, mud, mx, mz, [[rs - 0.05, by - 0.35], [br - 0.1, by - 0.12], [br, by + 0.1], [br - 0.05, by + 0.55], [br - 0.22, by + 0.6], [br - 0.24, by + 0.15], [rs - 0.05, by + 0.15]], n, { shade: 0.95 }, Math.PI / 4);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    bar(sink, 'structureWood', [mx + Math.cos(a) * (rs - 0.1), by - 0.2, mz + Math.sin(a) * (rs - 0.1)], [mx + Math.cos(a) * (br + 0.2), by - 0.25, mz + Math.sin(a) * (br + 0.2)], 0.14, { colour: PALM, decor: true });
  }
  // the ablution court's wall before the doors, its gap on the approach
  const cz = D / 2 + 5.5;
  mudWall(sink, mud, [-W / 2, D / 2 + 0.4], [-W / 2, cz], foot, 1.6, 0.6, v, {});
  mudWall(sink, mud, [-W / 2, cz], [-1.4, cz], foot, 1.6, 0.6, v, {});
  mudWall(sink, mud, [1.4, cz], [W / 2 - 3.2, cz], foot, 1.6, 0.6, v, {});
  sink.quad('stone', [-W / 2 + 0.3, 0.03, cz - 0.3], [W / 2 - 0.3, 0.03, cz - 0.3], [W / 2 - 0.3, 0.03, D / 2 + 0.5], [-W / 2 + 0.3, 0.03, D / 2 + 0.5], { decor: true, shade: 0.9, uv: { kind: 'world' } });
  return { parts: sink.finish() };
};

/**
 * The spring: its round pool (`radius`) in a ring of dressed stone with steps down one side, the water just under the
 * kerb, the outflow channels (`channels`) running out into the gardens, the café's palm-frond shade on its posts.
 */
export const springPool: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const R = num(ctx, 'radius', 4, 12), n = 40, ch = Math.round(num(ctx, 'channels', 0, 4));
  // the stone ring's coping, its outer batter and the inner wall dropping to the water
  revolve(sink, 'stone', 0, 0, [[R + 1.5, -0.4], [R + 1.25, 0.72], [R + 0.1, 0.82], [R, 0.78], [R, 0.08]], n, { shade: 0.9 });
  // the water (a dark green disc, its surface just under the kerb) and a lighter ring where the sun reaches the bed
  revolve(sink, 'structureMetal', 0, 0, [[R, 0.1], [0.001, 0.1]], n, { colour: WATER, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.98, 0.105], [R * 0.7, 0.105]], n, { colour: shade(WATER, 1.3), decor: true });
  // the steps down into it on the front, the bubbles' rings at its middle
  for (let k = 0; k < 5; k++) sink.span('stone', -1.2, 0.0, R + 0.9 - k * 0.5, 1.2, 0.8 - k * 0.15, R + 1.4 - k * 0.5, { decor: true, shade: 0.88 });
  for (const r of [0.6, 1.1]) revolve(sink, 'structureMetal', v() * 0.6, v() * 0.6, [[r + 0.06, 0.112], [r, 0.112]], 16, { colour: shade(WATER, 1.5), decor: true, fine: 'near' });
  // the outflow channels: stone-lined runs out through the ring into the gardens
  for (let k = 0; k < ch; k++) {
    // (parallel runs out to -x, 3 m apart, into the gardens' plots)
    const off = (k - (ch - 1) / 2) * 3.0, len = 8 + v() * 4;
    sink.placed(-Math.PI / 2, 0, 0, off, () => {
      sink.span('stone', -0.55, -0.3, R + 1.2, -0.3, 0.2, R + 1.2 + len, { decor: true, shade: 0.85 });
      sink.span('stone', 0.3, -0.3, R + 1.2, 0.55, 0.2, R + 1.2 + len, { decor: true, shade: 0.85 });
      sink.span('structureMetal', -0.3, 0.02, R + 0.6, 0.3, 0.08, R + 1.2 + len, { colour: WATER, decor: true });
    });
  }
  // the date palms round the pool: each trunk leaning a little, ringed, its crown of drooping fronds
  // (in two rows along the channels' gardens, inside the footprint)
  for (let k = 0; k < 4; k++) {
    const px = -(R + 3 + (k >> 1) * 5.5) + (v() - 0.5), pz = (k % 2 ? 1 : -1) * (4.4 + v() * 0.6);
    const h = 7 + v() * 4, lx = (v() - 0.5) * 1.2, lz = -Math.sign(pz) * v() * 0.6, topP: Vec3 = [px + lx, h, pz + lz];
    sink.cylinder('structureWood', [px, -0.3, pz], 'y', 0.4, 0.42, 8, { colour: PALM, decor: true });
    bar(sink, 'structureWood', [px, 0, pz], topP, 0.36, { colour: shade(PALM, 0.9), decor: true });
    for (let f = 0; f < 9; f++) {
      const b = (f / 9) * Math.PI * 2 + v() * 0.4, len = 2.7 + v() * 0.6, droop = 1.3 + v() * 0.9;
      const mid: Vec3 = [topP[0] + Math.cos(b) * len * 0.5, h + 0.5, topP[2] + Math.sin(b) * len * 0.5], tip: Vec3 = [topP[0] + Math.cos(b) * len, h - droop, topP[2] + Math.sin(b) * len];
      const sx = -Math.sin(b) * 0.45, sz = Math.cos(b) * 0.45;
      for (const [p, q] of [[topP, mid], [mid, tip]] as const) {
        sink.quad('structureWood', [p[0] - sx, p[1], p[2] - sz], [p[0] + sx, p[1], p[2] + sz], [q[0] + sx * 0.7, q[1], q[2] + sz * 0.7], [q[0] - sx * 0.7, q[1], q[2] - sz * 0.7], { colour: shade(FROND_GREEN, 0.85 + v() * 0.3), decor: true });
        sink.quad('structureWood', [p[0] + sx, p[1], p[2] + sz], [p[0] - sx, p[1], p[2] - sz], [q[0] - sx * 0.7, q[1], q[2] - sz * 0.7], [q[0] + sx * 0.7, q[1], q[2] + sz * 0.7], { colour: shade(FROND_GREEN, 0.7), decor: true });
      }
    }
  }
  // the café's shade: six posts and a roof of laid palm fronds on its rafters, beside the pool's steps
  const sx = R + 4.5, sz = R * 0.4;
  for (const [dx, dz] of [[-2.4, -1.8], [0, -1.8], [2.4, -1.8], [-2.4, 1.8], [0, 1.8], [2.4, 1.8]] as const) {
    bar(sink, 'structureWood', [sx + dx, -0.3, sz + dz], [sx + dx, 2.6, sz + dz], 0.16, { colour: PALM });
  }
  for (const dz of [-1.8, 1.8]) bar(sink, 'structureWood', [sx - 2.7, 2.6, sz + dz], [sx + 2.7, 2.6, sz + dz], 0.14, { colour: PALM, decor: true });
  sink.span('straw', sx - 2.9, 2.68, sz - 2.2, sx + 2.9, 2.85, sz + 2.2, { colour: FROND, decor: true });
  for (let x = -2.6; x <= 2.6; x += 0.45) bar(sink, 'straw', [sx + x, 2.88, sz - 2.3], [sx + x + (v() - 0.5) * 0.3, 2.88, sz + 2.3], 0.12, { colour: shade(FROND, 0.9 + v() * 0.2), decor: true, fine: true });
  // its benches: palm-log seats on mud blocks
  for (const dz of [-1.2, 1.2]) {
    sink.span('plaster', sx - 1.8, -0.2, sz + dz - 0.25, sx - 1.4, 0.45, sz + dz + 0.25, {});
    sink.span('plaster', sx + 1.4, -0.2, sz + dz - 0.25, sx + 1.8, 0.45, sz + dz + 0.25, {});
    bar(sink, 'structureWood', [sx - 1.9, 0.55, sz + dz], [sx + 1.9, 0.55, sz + dz], 0.24, { colour: PALM, decor: true });
  }
  return { parts: sink.finish() };
};
