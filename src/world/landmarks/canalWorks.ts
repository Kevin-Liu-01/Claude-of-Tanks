// src/world/landmarks/canalWorks.ts — a Cà Mau canal hamlet's market and its charcoal works (landmarks-271, 2026-11-06).
// Mangrove Reach is the canal country at the tip of the Mekong delta: the census (buildings-270 signature places) names
// the chợ — "a long open hall on posts with a low hipped roof, a raised gable sign over the entrance, and steps and
// pontoons down to the water" where the sampans tie up — and the mangrove charcoal kilns, the beehive domes under their
// thatched shed where the boats load the charcoal, and found neither.
//
// - canalMarket: the hall on its raised floor along the bank (its back to the land, +z to the water), concrete posts
//   under a low hipped iron roof, the raised gable over the landward entrance with its sign; the stalls inside (tables,
//   baskets and awnings); the quay's edge and its steps, the pontoons floating on the canal on their ramps, the sampans
//   moored at them, some under their arched nipa hoods.
// - charcoalKilns: the beehive kilns of brick and mud in a row, each with its stoking arch and vent holes, under an open
//   shed of poles and nipa thatch; the stacks of mangrove billets drying, the landing stage at the water.
//
// Drawn in their own frames (x across, y up, z out of the front: the water) into the regional part sink (no draw call of
// their own). Both stand at the canal's edge (plan.ts inWater): they follow the bank (ctx.ground) and float what floats
// on the water (ctx.water). The hall's floor and posts and the kilns are structure; the roof's sheets, the stalls, the
// pontoons and the boats are dressing.
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const TIN = rgb(0x8a8d8c), RUST = rgb(0x7a4a32), CONCRETE = 0.92, TIMBER = rgb(0x5b4632), NIPA = rgb(0x8c7a4c), HULL = rgb(0x4a3a2c);
const HULL_PAINT = [rgb(0x2f5b77), rgb(0x3f6b3c), rgb(0x7a3a2a)], AWNING = [rgb(0x2a6a8a), rgb(0xb0402a), rgb(0x3f7a3a), rgb(0xc4a03a)];
const BRICK = rgb(0x8a4a34), BILLET = rgb(0x5a3c28);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** The bank's height (over the piece's base) under a rectangle: its highest point, so a floor on it is never buried. */
function bankTop(ctx: LandmarkBuildContext, x0: number, z0: number, x1: number, z1: number): number {
  let hi = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) hi = Math.max(hi, ctx.ground?.(x0 + (x1 - x0) * i / 4, z0 + (z1 - z0) * j / 2) ?? 0);
  return hi;
}

/** The water's surface (over the piece's base) at a point, or null where it is dry. */
function surfaceAt(ctx: LandmarkBuildContext, x: number, z: number): number | null {
  const d = ctx.water?.(x, z) ?? 0;
  return d > 0.05 ? (ctx.ground?.(x, z) ?? 0) + d : null;
}

/** A sampan at (x, y, z) heading yaw: its hull narrowing to both ends, the thwarts, and (hood) an arched nipa hood. */
function sampan(sink: PartSink, x: number, y: number, z: number, yaw: number, len: number, colour: Rgb, hood: boolean, mobile: boolean): void {
  sink.placed(yaw, x, y, z, () => {
    const n = 8, beam = len * 0.17, sheer = 0.55;
    const half = (t: number): number => beam / 2 * Math.sin(Math.PI * t) ** 0.6;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, z0 = -len / 2 + len * t0, z1 = -len / 2 + len * t1;
      const r0 = half(t0), r1 = half(t1), up0 = sheer * (1 + 0.6 * Math.abs(t0 - 0.5)), up1 = sheer * (1 + 0.6 * Math.abs(t1 - 0.5));
      for (const s of [-1, 1]) {
        const a: Vec3 = [s * r0, up0, z0], b: Vec3 = [s * r1, up1, z1], c: Vec3 = [s * r1 * 0.4, -0.2, z1], d: Vec3 = [s * r0 * 0.4, -0.2, z0];
        if (s > 0) sink.quad('structureWood', d, c, b, a, { colour: k % 2 ? shade(colour, 0.9) : colour, decor: true });
        else sink.quad('structureWood', a, b, c, d, { colour: k % 2 ? shade(colour, 0.9) : colour, decor: true });
      }
      // the bottom boards and the inside floor
      sink.quad('structureWood', [-r0 * 0.4, -0.2, z0], [-r1 * 0.4, -0.2, z1], [r1 * 0.4, -0.2, z1], [r0 * 0.4, -0.2, z0], { colour: HULL, decor: true });
      sink.quad('structureWood', [-r0 * 0.9, 0.12, z0], [r0 * 0.9, 0.12, z0], [r1 * 0.9, 0.12, z1], [-r1 * 0.9, 0.12, z1], { colour: HULL, decor: true });
    }
    if (hood) {
      // the arched hood over the middle third: hoops of split bamboo under a nipa mat
      const hz0 = -len * 0.18, hz1 = len * 0.12, hr = beam * 0.48, hy = 0.5;
      for (let k = 0; k < 6; k++) {
        const a0 = Math.PI * k / 6, a1 = Math.PI * (k + 1) / 6;
        const p = (a: number, zz: number): Vec3 => [Math.cos(a) * hr, hy + Math.sin(a) * hr * 1.1, zz];
        sink.quad('straw', p(a0, hz1), p(a0, hz0), p(a1, hz0), p(a1, hz1), { colour: NIPA, decor: true });
        sink.quad('straw', p(a1, hz1), p(a1, hz0), p(a0, hz0), p(a0, hz1), { colour: shade(NIPA, 0.6), decor: true });
      }
    } else if (!mobile) {
      bar(sink, 'structureWood', [-beam * 0.4, 0.4, len * 0.3], [beam * 0.4, 0.4, len * 0.3], 0.08, { colour: HULL, decor: true, fine: true });
      // the long-tail's motor and its shaft at the stern
      sink.span('structureMetal', -0.2, 0.3, -len / 2 + 0.6, 0.2, 0.7, -len / 2 + 1.1, { colour: rgb(0x2a2a2a), decor: true });
      bar(sink, 'structureMetal', [0, 0.45, -len / 2 + 0.7], [0, -0.3, -len / 2 - 1.6], 0.05, { colour: rgb(0x555555), decor: true, fine: true });
    }
  });
}

/**
 * The canal market: the hall (`length` x `depth`) along the bank behind the quay, its landing's `pontoons` floating on
 * the canal at +z, `boats` sampans moored at them.
 */
export const canalMarket: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, mobile = ctx.tier === 'mobile';
  const L = num(ctx, 'length', 16, 40), D = num(ctx, 'depth', 8, 18), P = Math.round(num(ctx, 'pontoons', 0, 5)), B = Math.round(num(ctx, 'boats', 0, 10));
  const hz0 = -D - 0.5, hz1 = -0.5;
  // the hall's floor: a concrete slab on the bank's top, its plinth down to the lowest ground under it
  const fy = bankTop(ctx, -L / 2, hz0, L / 2, hz1 + 3) + 0.45, foot = -0.6 - ctx.groundFall;
  sink.span('stone', -L / 2 - 0.3, foot, hz0 - 0.3, L / 2 + 0.3, fy, hz1 + 3.0, { shade: CONCRETE });
  // the posts (every bay), the eaves beams, the low hipped iron roof and the raised gable over the landward entrance
  const bays = Math.max(3, Math.round(L / 5)), bw = L / bays, ey = fy + 3.4, ry = ey + 2.0;
  for (let i = 0; i <= bays; i++) for (const z of [hz0, hz1]) sink.span('stone', -L / 2 + i * bw - 0.17, fy, z - 0.17, -L / 2 + i * bw + 0.17, ey, z + 0.17, { shade: 0.86 });
  for (let i = 1; i < bays; i++) sink.span('stone', -L / 2 + i * bw - 0.15, fy, (hz0 + hz1) / 2 - 0.15, -L / 2 + i * bw + 0.15, ry - 0.3, (hz0 + hz1) / 2 + 0.15, { shade: 0.86 });
  for (const z of [hz0, hz1]) sink.span('structureWood', -L / 2 - 0.2, ey - 0.3, z - 0.15, L / 2 + 0.2, ey, z + 0.15, { colour: TIMBER, decor: true });
  const ov = 1.4, X = L / 2 + ov, Z0 = hz0 - ov, Z1 = hz1 + ov, zm = (hz0 + hz1) / 2, rl = L / 2 - D / 2;
  const roof = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, k: number): void => {
    sink.quad('structureMetal', a, b, c, d, { colour: v() < 0.25 ? RUST : shade(TIN, 0.92 + 0.08 * (k % 2)) });
    sink.quad('structureMetal', b, a, d, c, { colour: shade(TIN, 0.55), decor: true });
  };
  roof([-X, ey - 0.4, Z1], [X, ey - 0.4, Z1], [rl, ry, zm], [-rl, ry, zm], 0);
  roof([X, ey - 0.4, Z0], [-X, ey - 0.4, Z0], [-rl, ry, zm], [rl, ry, zm], 1);
  sink.polygon('structureMetal', [[X, ey - 0.4, Z1], [X, ey - 0.4, Z0], [rl, ry, zm]], { colour: shade(TIN, 0.85) });
  sink.polygon('structureMetal', [[-X, ey - 0.4, Z0], [-X, ey - 0.4, Z1], [-rl, ry, zm]], { colour: shade(TIN, 0.85) });
  // the corrugations' ridges down the slopes (dressing)
  if (!mobile) for (let x = -X + 0.4; x < X; x += 0.8) {
    for (const [z0, z1] of [[Z1, zm], [Z0, zm]] as const) {
      const ax = Math.max(-rl, Math.min(rl, x));
      bar(sink, 'structureMetal', [x, ey - 0.38, z0], [ax, ry + 0.02, z1 + (z0 > zm ? 0.05 : -0.05)], 0.03, { colour: shade(TIN, 1.1), decor: true, fine: true });
    }
  }
  // the raised gable over the landward entrance (the hall's back, -z) with its sign board
  const gw = 7.0, gz = hz0 - 0.2;
  sink.polygon('plaster', [[-gw / 2, ey - 0.3, gz], [gw / 2, ey - 0.3, gz], [gw / 2, ey + 1.6, gz], [0, ey + 3.2, gz], [-gw / 2, ey + 1.6, gz]].reverse() as Vec3[], {});
  sink.polygon('plaster', [[-gw / 2, ey - 0.3, gz + 0.3], [gw / 2, ey - 0.3, gz + 0.3], [gw / 2, ey + 1.6, gz + 0.3], [0, ey + 3.2, gz + 0.3], [-gw / 2, ey + 1.6, gz + 0.3]] as Vec3[], { shade: 0.8 });
  sink.span('structureMetal', -2.6, ey + 0.1, gz - 0.06, 2.6, ey + 1.2, gz - 0.02, { colour: rgb(0x2a5a8a), decor: true });
  sink.span('structureMetal', -2.3, ey + 0.35, gz - 0.07, 2.3, ey + 0.95, gz - 0.06, { colour: rgb(0xe8d8b0), decor: true, fine: mobile ? undefined : 'near' });
  // the stalls inside: low tables with their baskets and awnings, in two rows along the hall
  const stalls = mobile ? Math.round(bays * 0.8) : bays * 2;
  for (let k = 0; k < stalls; k++) {
    const x = -L / 2 + (k % bays + 0.5) * bw + (v() - 0.5), z = k < bays ? zm - D * 0.22 : zm + D * 0.22;
    sink.span('structureWood', x - 1.2, fy + 0.7, z - 0.7, x + 1.2, fy + 0.8, z + 0.7, { colour: TIMBER, decor: true });
    for (const [dx, dz] of [[-1.1, -0.6], [1.1, -0.6], [1.1, 0.6], [-1.1, 0.6]] as const) bar(sink, 'structureWood', [x + dx, fy, z + dz], [x + dx, fy + 0.72, z + dz], 0.06, { colour: TIMBER, decor: true, fine: true });
    if (!mobile) for (let b = 0; b < 3; b++) revolve(sink, 'straw', x - 0.7 + b * 0.7, z + (v() - 0.5) * 0.6, [[0.2, fy + 0.8], [0.26, fy + 0.98], [0.001, fy + 1.0]], 8, { colour: shade(NIPA, 0.8 + v() * 0.3), decor: true, fine: true });
    if (v() < 0.6) sink.span('structureMetal', x - 1.4, fy + 2.1, z - 1.0, x + 1.4, fy + 2.15, z + 1.0, { colour: AWNING[Math.floor(v() * AWNING.length)], decor: true });
  }
  // the quay's edge before the hall: its steps down to the water at each end
  const qz = hz1 + 3.0;
  for (const sx of [-L / 3, L / 3]) for (let k = 0; k < 4; k++) sink.span('stone', sx - 1.2, foot, qz + k * 0.45, sx + 1.2, fy - 0.35 * (k + 1), qz + (k + 1) * 0.45, { shade: 0.85, decor: true });
  // the pontoons: floating on the canal before the quay, each on its ramp from the quay's edge; the sampans at them
  const pz = qz + 2.0, pl = 7.5;
  let boats = 0;
  for (let k = 0; k < P; k++) {
    const px = -L / 2 + (k + 0.5) * L / P;
    const s = surfaceAt(ctx, px, pz + pl / 2) ?? (ctx.ground?.(px, pz + pl / 2) ?? 0) + 0.02;
    const top = s + 0.45;
    // the float (drums under a plank deck) and its ramp up to the quay
    sink.span('structureMetal', px - 1.8, s - 0.35, pz, px + 1.8, s + 0.15, pz + pl, { colour: rgb(0x3d5a74), decor: true });
    sink.span('structureWood', px - 2.0, s + 0.15, pz - 0.1, px + 2.0, top, pz + pl + 0.1, { colour: TIMBER, decor: true });
    const r0: Vec3 = [px, fy, qz], r1: Vec3 = [px, top, pz + 0.2];
    for (const dx of [-0.6, 0.6]) bar(sink, 'structureWood', [r0[0] + dx, r0[1] - 0.05, r0[2]], [r1[0] + dx, r1[1], r1[2]], 0.12, { colour: TIMBER, decor: true });
    sink.quad('structureWood', [px - 0.6, top + 0.04, pz + 0.2], [px + 0.6, top + 0.04, pz + 0.2], [px + 0.6, fy + 0.04, qz], [px - 0.6, fy + 0.04, qz], { colour: shade(TIMBER, 1.1), decor: true });
    // the bollards at the float's corners
    if (!mobile) for (const [dx, dz] of [[-1.8, 0.4], [1.8, 0.4], [-1.8, pl - 0.4], [1.8, pl - 0.4]] as const) bar(sink, 'structureWood', [px + dx, top, pz + dz], [px + dx, top + 0.5, pz + dz], 0.14, { colour: shade(TIMBER, 0.7), decor: true, fine: true });
    // a boat either side, moored along the float
    for (const side of [-1, 1]) {
      if (boats >= B) break;
      const bx = px + side * 3.2, bz = pz + pl / 2 + (v() - 0.5) * 1.5, bs = surfaceAt(ctx, bx, bz);
      if (bs === null) continue;
      sampan(sink, bx, bs + 0.1, bz, (v() - 0.5) * 0.15, 7 + v() * 2.5, HULL_PAINT[Math.floor(v() * HULL_PAINT.length)], v() < 0.5, mobile);
      boats++;
    }
  }
  return { parts: sink.finish() };
};

/**
 * The charcoal works: `kilns` beehive kilns in a row (`radius` each) under their open thatched shed, the billet stacks
 * behind them, the landing stage at the water (+z).
 */
export const charcoalKilns: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant, mobile = ctx.tier === 'mobile';
  const K = Math.round(num(ctx, 'kilns', 2, 8)), R = num(ctx, 'radius', 2, 3.5), H = R * 1.45;
  const span = K * (2 * R + 1.4), y0 = bankTop(ctx, -span / 2, -R - 1, span / 2, R + 1);
  const foot = -0.6 - ctx.groundFall, n = mobile ? 12 : 20;
  for (let k = 0; k < K; k++) {
    const x = -span / 2 + (k + 0.5) * (2 * R + 1.4), z = 0;
    // the dome: brick under a mud skin, its foot ring of brick, the stoking arch on the front and the vent holes round it
    revolve(sink, 'stone', x, z, [[R + 0.3, foot], [R + 0.3, y0 + 0.5], [R, y0 + 0.6]], n, { shade: 0.85 });
    const dome: Array<[number, number]> = [];
    for (let i = 0; i <= 8; i++) { const a = (Math.PI / 2) * i / 8; dome.push([Math.max(0.001, Math.cos(a) * R), y0 + 0.6 + Math.sin(a) * H]); }
    revolve(sink, 'structureMetal', x, z, dome, n, { colour: shade(BRICK, 0.85 + v() * 0.15) });
    sink.placed(0, x, y0, z + R - 0.15, () => {
      sink.span('dark', -0.45, 0.2, 0, 0.45, 1.1, 0.3, { decor: true });
      bar(sink, 'structureMetal', [-0.6, 1.2, 0.25], [0.6, 1.2, 0.25], 0.18, { colour: shade(BRICK, 0.7), decor: true });
    });
    if (!mobile) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      sink.span('dark', x + Math.cos(a) * (R - 0.02) - 0.08, y0 + 0.9, z + Math.sin(a) * (R - 0.02) - 0.08, x + Math.cos(a) * (R + 0.02) + 0.08, y0 + 1.05, z + Math.sin(a) * (R + 0.02) + 0.08, { decor: true, fine: true });
    }
    // the smoke-blackened crown
    revolve(sink, 'structureMetal', x, z, [[R * 0.42, y0 + 0.6 + H * 0.9 + 0.01], [0.001, y0 + 0.6 + H + 0.03]], n, { colour: rgb(0x2a2420), decor: true });
  }
  // the shed over the row: poles and a long nipa roof, its ridge along x
  const sw = span + 2, sd = 2 * R + 5, sy = y0 + H + 1.6, ry = sy + 2.4;
  for (let x = -sw / 2; x <= sw / 2 + 0.01; x += sw / Math.max(2, K)) for (const z of [-sd / 2, sd / 2]) bar(sink, 'structureWood', [x, foot, z], [x, sy, z], 0.18, { colour: TIMBER });
  for (const s of [-1, 1]) {
    sink.quad('straw', s > 0 ? [-sw / 2 - 0.8, sy - 0.3, s * (sd / 2 + 1)] : [sw / 2 + 0.8, sy - 0.3, s * (sd / 2 + 1)], s > 0 ? [sw / 2 + 0.8, sy - 0.3, s * (sd / 2 + 1)] : [-sw / 2 - 0.8, sy - 0.3, s * (sd / 2 + 1)],
      s > 0 ? [sw / 2 + 0.8, ry, 0] : [-sw / 2 - 0.8, ry, 0], s > 0 ? [-sw / 2 - 0.8, ry, 0] : [sw / 2 + 0.8, ry, 0], { colour: NIPA, decor: true });
    sink.quad('straw', s > 0 ? [sw / 2 + 0.8, sy - 0.3, s * (sd / 2 + 1)] : [-sw / 2 - 0.8, sy - 0.3, s * (sd / 2 + 1)], s > 0 ? [-sw / 2 - 0.8, sy - 0.3, s * (sd / 2 + 1)] : [sw / 2 + 0.8, sy - 0.3, s * (sd / 2 + 1)],
      s > 0 ? [-sw / 2 - 0.8, ry, 0] : [sw / 2 + 0.8, ry, 0], s > 0 ? [sw / 2 + 0.8, ry, 0] : [-sw / 2 - 0.8, ry, 0], { colour: shade(NIPA, 0.55), decor: true });
  }
  bar(sink, 'structureWood', [-sw / 2 - 0.8, ry, 0], [sw / 2 + 0.8, ry, 0], 0.2, { colour: TIMBER, decor: true });
  // the billet stacks behind the kilns (cords of mangrove wood, bark on), and the landing stage before them
  for (let k = 0; k < K; k++) {
    const x = -span / 2 + (k + 0.5) * (2 * R + 1.4), z = -R - 2.2;
    sink.span('structureWood', x - R * 0.8, y0, z - 0.6, x + R * 0.8, y0 + 1.4 + v() * 0.4, z + 0.6, { colour: BILLET });
    if (!mobile) for (let i = 0; i < 6; i++) sink.cylinder('structureWood', [x - R * 0.7 + i * R * 0.28, y0 + 0.3 + (i % 2) * 0.5, z + 0.6], 'z', 0.04, 0.1, 6, { colour: shade(BILLET, 1.3), decor: true, fine: true });
  }
  const lz = sd / 2 + 1.2, ly = (surfaceAt(ctx, 0, lz + 2) ?? y0) + 0.5;
  const deck = Math.max(ly, y0 + 0.1);
  sink.span('structureWood', -3, deck - 0.3, lz, 3, deck, lz + 4, { colour: TIMBER, decor: true });
  for (const [dx, dz] of [[-2.8, 0.2], [2.8, 0.2], [-2.8, 3.8], [2.8, 3.8]] as const) bar(sink, 'structureWood', [dx, foot - 1.5, lz + dz], [dx, deck + 0.4, lz + dz], 0.14, { colour: shade(TIMBER, 0.8), decor: true });
  const bs = surfaceAt(ctx, 5, lz + 3);
  if (bs !== null) sampan(sink, 5.5, bs + 0.1, lz + 2.5, Math.PI / 2 + (v() - 0.5) * 0.2, 9, HULL, false, mobile);
  return { parts: sink.finish() };
};
