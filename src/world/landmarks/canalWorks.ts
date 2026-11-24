// src/world/landmarks/canalWorks.ts — a mangrove coast's canal market and its charcoal works (landmarks-271, 2026-11-06;
// the realism pass, landmarks-273, 2026-11-16). Mangrove Reach is canal country at a mangrove delta's tip: the census
// (buildings-270 signature places) names the market — a long open hall with a hipped roof, a raised gable sign over the
// entrance, and steps down to the boats — and the mangrove charcoal kilns, the brick domes of a Kuala Sepetang works under
// their long shed where the boats load the charcoal.
//
// - canalMarket: the hall of timber on its piles at the bank's edge (its back on the earth bank, +z to the water), plank
//   floors, a deep hipped roof of patched tin over timber posts and tie beams, the raised gable on its piers over the
//   landward stair; along the canal a plank walkway under bay-by-bay lean-tos of attap and tin, its railing, and timber
//   stairs down to the floating landing stages where the sampans moor. Inside, the stalls (trestle tables, baskets,
//   canvas awnings and the goods hung from them).
// - charcoalKilns: the brick domes in a row on their beaten-mud yard, each with its stoking arch (some half bricked up for a
//   burn), the flue ports round its foot, a chimney at its back and the soot over its crown and door; the long open shed
//   over them on timber posts and trusses, its steep, deep roof of stepped attap courses with tin repairs; the stacks of
//   mangrove billets behind, plank paths through the mud, the sacks and the charcoal heap at a small jetty with its sampan.
//
// Drawn in their own frames (x across, y up, z out of the front: the water) into the regional part sink (no draw call of
// their own). Both stand at the canal's edge (plan.ts inWater): they follow the bank (ctx.ground) and float what floats
// on the water (ctx.water). The hall's bank, piles, floors and posts, the roofs' tin and the kilns are structure; the
// thatch, the stalls, the stairs, the landing stages and the boats are dressing.
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, extrude, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const TIN = rgb(0x8a8d8c), RUST = rgb(0x7a4a32), TIMBER = rgb(0x5b4632), PILE = rgb(0x463a2e), PLANK = rgb(0x76624a), HULL = rgb(0x4a3a2c);
const HULL_PAINT = [rgb(0x2f5b77), rgb(0x3f6b3c), rgb(0x7a3a2a)], AWNING = [rgb(0x2a6a8a), rgb(0xb0402a), rgb(0x3f7a3a), rgb(0xc4a03a)];
const GOODS = [rgb(0xb8a040), rgb(0x8a8a80), rgb(0x9a6a3a), rgb(0x5a7a3a)], BASKET = rgb(0x9a8050);
const BRICK = rgb(0x8a4a34), CLAY = rgb(0x7a5a46), SOOT = rgb(0x2a2420), BILLET = rgb(0x4e3624), CUT = rgb(0x9a6a40);
const SACKS = [rgb(0x8a7550), rgb(0xc8c4b8), rgb(0x6f6a5c)];

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
function sampan(sink: PartSink, x: number, y: number, z: number, yaw: number, len: number, colour: Rgb, hood: boolean): void {
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
        sink.quad('straw', p(a0, hz1), p(a0, hz0), p(a1, hz0), p(a1, hz1), { decor: true });
        sink.quad('straw', p(a1, hz1), p(a1, hz0), p(a0, hz0), p(a0, hz1), { decor: true });
      }
    } else {
      bar(sink, 'structureWood', [-beam * 0.4, 0.4, len * 0.3], [beam * 0.4, 0.4, len * 0.3], 0.08, { colour: HULL, decor: true, fine: true });
      // the long-tail's motor and its shaft at the stern
      sink.span('structureMetal', -0.2, 0.3, -len / 2 + 0.6, 0.2, 0.7, -len / 2 + 1.1, { colour: rgb(0x2a2a2a), decor: true });
      bar(sink, 'structureMetal', [0, 0.45, -len / 2 + 0.7], [0, -0.3, -len / 2 - 1.6], 0.05, { colour: rgb(0x555555), decor: true, fine: true });
    }
  });
}

/** A convex polygon in (u, w) clipped to w >= at (above) or w <= at: the corners kept in order, consecutive repeats dropped. */
function clipW(poly: ReadonlyArray<readonly [number, number]>, at: number, above: boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const keep = (p: readonly [number, number]): boolean => (above ? p[1] >= at - 1e-6 : p[1] <= at + 1e-6);
  const push = (p: [number, number]): void => {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 1e-4) out.push(p);
  };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (keep(p)) push([p[0], p[1]]);
    if (keep(p) !== keep(q)) { const t = (at - p[1]) / (q[1] - p[1]); push([p[0] + (q[0] - p[0]) * t, at]); }
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) + Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return out;
}

/** A plank floor's boards: strips along `along` ('x' or 'z') over the rectangle at height y, each its own tone. */
function boards(sink: PartSink, v: () => number, x0: number, x1: number, z0: number, z1: number, y: number, along: 'x' | 'z', pitch: number): void {
  const [a0, a1] = along === 'x' ? [z0, z1] : [x0, x1];
  for (let a = a0; a < a1 - 0.05; a += pitch) {
    const b = Math.min(a1, a + pitch);
    const c = v() < 0.08 ? shade(PLANK, 0.35) : shade(PLANK, 0.72 + v() * 0.42);
    if (along === 'x') sink.quad('structureWood', [x0, y, b], [x1, y, b], [x1, y, a + 0.03], [x0, y, a + 0.03], { colour: c, decor: true });
    else sink.quad('structureWood', [a + 0.03, y, z1], [b, y, z1], [b, y, z0], [a + 0.03, y, z0], { colour: c, decor: true });
  }
}

/**
 * The canal market: the hall (`length` x `depth`) on its piles along the bank behind the walkway, its landing's
 * `pontoons` floating on the canal at +z, `boats` sampans moored at them.
 */
export const canalMarket: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const L = num(ctx, 'length', 16, 40), D = num(ctx, 'depth', 8, 18), P = Math.round(num(ctx, 'pontoons', 0, 5)), B = Math.round(num(ctx, 'boats', 0, 10));
  const hz0 = -D - 0.5, hz1 = -0.5, zm = (hz0 + hz1) / 2, qz = hz1 + 3.0;
  const foot = -0.6 - ctx.groundFall;
  // the hall's floor: over the bank's top and well over the canal's high water, on its piles
  const tide = surfaceAt(ctx, 0, qz + 4);
  const fy = Math.max(bankTop(ctx, -L / 2, hz0, L / 2, qz) + 1.1, tide === null ? -Infinity : tide + 1.5), wy = fy - 0.2;

  // ---- the earth bank under the hall's landward half (beaten earth, slumped toward the water) and the piles beyond it
  const bankY = fy - 0.24, toe = zm - 0.8 + (bankY - foot) * 1.1;
  extrude(sink, 'plaster2', [[-L / 2 - 0.6, foot, hz0 - 1.3], [-L / 2 - 0.6, bankY, hz0 - 0.5], [-L / 2 - 0.6, bankY, zm - 0.8], [-L / 2 - 0.6, foot, toe]], [1, 0, 0], L + 1.2, { shade: 0.52 });
  const bays = Math.max(3, Math.round(L / 5)), bw = L / bays, n = bays * 2;
  const rows: Array<[number, number]> = [[zm + 0.4, fy - 0.5], [zm + (hz1 - zm) * 0.55, fy - 0.5], [hz1, fy - 0.5], [qz - 0.2, wy - 0.45]];
  for (const [z, top] of rows) {
    // (the rows under the deck behind the bank's slope are dressing: the deck, the bank and the waterside rows hold it)
    const landward = z < hz1 - 0.01;
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + i * L / n + (v() - 0.5) * 0.18, r = 0.13 + v() * 0.04;
      sink.cylinder('structureWood', [x, foot, z + (v() - 0.5) * 0.15], 'y', top - foot, r, 6, { colour: shade(PILE, 0.7 + v() * 0.35), decor: landward }, r * 0.9, false);
    }
    // the bearer along the row's heads
    sink.span('structureWood', -L / 2 - 0.3, top, z - 0.13, L / 2 + 0.3, top + 0.26, z + 0.13, { colour: shade(TIMBER, 0.75) });
  }
  // cross-bracing in the waterside rows (every other pile bay), down to the mud
  for (const [z, top] of [rows[2], rows[3]]) for (let i = 0; i < n; i += 2) {
    const x0 = -L / 2 + i * L / n, x1 = x0 + L / n, g = (ctx.ground?.(x0, z) ?? 0) + 0.35;
    if (g < top - 0.9) bar(sink, 'structureWood', [x0, g, z], [x1, top - 0.1, z], 0.09, { colour: shade(PILE, 0.85), decor: true });
  }

  // ---- the floors: the hall's planks and the walkway's a step down, their boards (a few gone dark or missing)
  sink.span('structureWood', -L / 2 - 0.3, fy - 0.24, hz0 - 0.3, L / 2 + 0.3, fy, hz1, { colour: PLANK });
  sink.span('structureWood', -L / 2 - 0.3, wy - 0.19, hz1, L / 2 + 0.3, wy, qz, { colour: shade(PLANK, 0.9) });
  boards(sink, v, -L / 2 - 0.3, L / 2 + 0.3, hz0 - 0.3, hz1, fy + 0.006, 'x', 1.5);
  boards(sink, v, -L / 2 - 0.3, L / 2 + 0.3, hz1, qz, wy + 0.006, 'z', 1.05);

  // ---- the hall's frame: timber posts on the floor, the wall plates, a tie beam and a ridge post at every bay
  const ey = fy + 3.8, ov = 2.0, k = 0.46, ry = ey + k * D / 2, ye = ey - k * ov;
  for (let i = 0; i <= bays; i++) {
    const x = Math.max(-L / 2 + 0.14, Math.min(L / 2 - 0.14, -L / 2 + i * bw));
    for (const [z, s] of [[hz0 + 0.14, 1], [hz1 - 0.14, -1]] as const) {
      sink.span('structureWood', x - 0.13, fy, z - 0.13, x + 0.13, ey, z + 0.13, { colour: shade(TIMBER, 0.8 + v() * 0.3) });
      // its knee brace into the tie beam
      bar(sink, 'structureWood', [x, ey - 1.1, z], [x, ey - 0.3, z + s * 0.9], 0.1, { colour: TIMBER, decor: true, fine: true });
    }
    sink.span('structureWood', x - 0.1, ey - 0.3, hz0, x + 0.1, ey, hz1, { colour: shade(TIMBER, 0.85), decor: true });
    if (i > 0 && i < bays) sink.span('structureWood', x - 0.12, ey, zm - 0.12, x + 0.12, ry - 0.2, zm + 0.12, { colour: shade(TIMBER, 0.8), decor: true });
  }
  for (const z of [hz0, hz1]) sink.span('structureWood', -L / 2 - 0.2, ey - 0.3, z - 0.15, L / 2 + 0.2, ey, z + 0.15, { colour: TIMBER, decor: true });

  // ---- the deep hipped roof: tin sheets laid in strips, each its own age (grey, dull, rusted, a patch lapped over)
  const X = L / 2 + ov, Z0 = hz0 - ov, Z1 = hz1 + ov, rl = Math.max(0.5, L / 2 - D / 2);
  // (each sheet runs from the eaves up the slope, two lengths to a run, cut at the hips; the eaves rust first)
  const Wz = D / 2 + ov, Wx = X - rl, pitchRise = ry - ye;
  const sheet = (rusty: number): { colour: Rgb } => {
    const r = v();
    return { colour: r < rusty ? shade(RUST, 0.75 + v() * 0.35) : r < rusty + 0.1 ? shade(TIN, 0.62) : shade(TIN, 0.84 + v() * 0.2) };
  };
  const slopes: Array<{ u0: number; u1: number; run: number; top: (u: number) => number; knees: number[]; at: (u: number, w: number) => Vec3; flip: boolean }> = [
    { u0: -X, u1: X, run: Wz, top: (u) => Math.min(Wz, (X - Math.abs(u)) * Wz / Wx), knees: [rl, -rl], at: (u, w) => [u, ye + pitchRise * w / Wz, Z1 - w], flip: false },
    { u0: -X, u1: X, run: Wz, top: (u) => Math.min(Wz, (X - Math.abs(u)) * Wz / Wx), knees: [rl, -rl], at: (u, w) => [u, ye + pitchRise * w / Wz, Z0 + w], flip: true },
    { u0: Z0, u1: Z1, run: Wx, top: (u) => Wx - Math.abs(u - zm) * Wx / Wz, knees: [zm], at: (u, w) => [X - w, ye + pitchRise * w / Wx, u], flip: true },
    { u0: Z0, u1: Z1, run: Wx, top: (u) => Wx - Math.abs(u - zm) * Wx / Wz, knees: [zm], at: (u, w) => [-X + w, ye + pitchRise * w / Wx, u], flip: false },
  ];
  for (const f of slopes) {
    for (let a = f.u0, j = 0; a < f.u1 - 0.01; j++) {
      const b = Math.min(f.u1, a + 1.0 + v() * 0.3);
      const strip: Array<[number, number]> = [[a, 0], [b, 0], [b, f.top(b)], ...f.knees.filter((q) => q > a && q < b).map((q): [number, number] => [q, f.top(q)]), [a, f.top(a)]];
      for (const [w0, w1, up] of [[0, f.run * 0.5, 0], [f.run * 0.5, f.run, 0.03]] as const) {
        const poly = clipW(clipW(strip, w0, true), w1, false);
        if (poly.length < 3) continue;
        const pts = poly.map(([u, w]): Vec3 => { const p = f.at(u, w); return [p[0], p[1] + up + (j % 2) * 0.015, p[2]]; });
        sink.polygon('structureMetal', f.flip ? pts.reverse() : pts, { ...sheet(up ? 0.06 : 0.16), decor: true });
      }
      a = b;
    }
  }
  // its underside (the roof's collision: four planes, the sheets on them are dressing), the fascia boards round the
  // eaves, the ridge and the hips' capping
  const under = { colour: shade(TIN, 0.5) };
  sink.quad('structureMetal', [X, ye - 0.02, Z1], [-X, ye - 0.02, Z1], [-rl, ry - 0.02, zm], [rl, ry - 0.02, zm], under);
  sink.quad('structureMetal', [-X, ye - 0.02, Z0], [X, ye - 0.02, Z0], [rl, ry - 0.02, zm], [-rl, ry - 0.02, zm], under);
  sink.polygon('structureMetal', [[X, ye - 0.02, Z0], [X, ye - 0.02, Z1], [rl, ry - 0.02, zm]], under);
  sink.polygon('structureMetal', [[-X, ye - 0.02, Z1], [-X, ye - 0.02, Z0], [-rl, ry - 0.02, zm]], under);
  const fascia = { colour: shade(TIMBER, 0.7), decor: true };
  for (const z of [Z0, Z1]) sink.span('structureWood', -X, ye - 0.28, z - 0.04, X, ye + 0.02, z + 0.04, fascia);
  for (const x of [-X, X]) sink.span('structureWood', x - 0.04, ye - 0.28, Z0, x + 0.04, ye + 0.02, Z1, fascia);
  const cap = { colour: shade(TIN, 0.7), decor: true };
  bar(sink, 'structureMetal', [-rl, ry + 0.06, zm], [rl, ry + 0.06, zm], 0.14, cap);
  for (const e of [-1, 1]) for (const z of [Z0, Z1]) bar(sink, 'structureMetal', [e * X, ye + 0.06, z], [e * rl, ry + 0.06, zm], 0.1, cap);

  // ---- the landward entrance: the raised gable with its sign on two rendered piers, the concrete stair up to the floor
  const gw = 7.0, gz = Z0 + 0.1, gy0 = ye - 0.7, sb = ctx.ground?.(0, hz0 - 2.0) ?? 0;
  for (const e of [-1, 1]) sink.span('plaster', e * (gw / 2 - 0.45), foot, gz - 0.25, e * (gw / 2 + 0.05), gy0, gz + 0.25, { shade: 0.9 });
  extrude(sink, 'plaster', [[-gw / 2, gy0, gz - 0.15], [gw / 2, gy0, gz - 0.15], [gw / 2, ye + 1.5, gz - 0.15], [0, ye + 3.4, gz - 0.15], [-gw / 2, ye + 1.5, gz - 0.15]], [0, 0, 1], 0.3, {});
  sink.span('structureMetal', -2.6, ye + 0.15, gz - 0.21, 2.6, ye + 1.3, gz - 0.16, { colour: rgb(0x2a5a8a), decor: true });
  sink.span('structureMetal', -2.3, ye + 0.4, gz - 0.22, 2.3, ye + 1.05, gz - 0.21, { colour: rgb(0xe8d8b0), decor: true, fine: 'near' });
  // a damp stain down the render from the gable's foot
  sink.span('plaster', -gw / 2 - 0.01, gy0 - 0.02, gz - 0.17, gw / 2 + 0.01, gy0 + 0.35, gz - 0.16, { shade: 0.6, decor: true });
  const rise = fy - sb, steps = Math.max(2, Math.ceil(rise / 0.21)), tread = Math.min(0.32, 2.6 / steps);
  for (let s = 0; s < steps; s++) {
    const top = fy - (s + 1) * rise / (steps + 1), z1 = hz0 - 0.3 - s * tread;
    sink.span('stone', -1.5, foot, z1 - tread, 1.5, top, z1, { shade: 0.78 + v() * 0.1, decor: true });
  }

  // ---- the walkway along the canal: its posts and railing, the lean-tos bay by bay (attap or tin, as each was built)
  const px = Array.from({ length: P }, (_, i) => -L / 2 + (i + 0.5) * L / P), sx = px.map((x) => x + 1.1);
  const openBay = (x0: number, x1: number): boolean => sx.some((s) => s > x0 - 0.6 && s < x1 + 0.6);
  const pz0 = hz1 + 0.15, pz1 = qz + 0.5;
  // the lean-tos' ledger, spiked to the hall's front posts
  sink.span('structureWood', -L / 2, ey - 1.5, hz1 - 0.01, L / 2, ey - 1.28, hz1 + 0.15, { colour: shade(TIMBER, 0.8), decor: true });
  for (let i = 0; i < bays; i++) {
    const x0 = -L / 2 + i * bw, x1 = x0 + bw + 0.05, attap = v() < 0.65, dy = (v() - 0.5) * 0.16;
    const y0 = ey - 1.0 + dy, y1 = y0 - 0.75 - v() * 0.1;
    if (attap) {
      // a thick mat of nipa fronds, its cut edge showing
      sink.quad('straw', [x0, y1, pz1], [x1, y1, pz1], [x1, y0, pz0], [x0, y0, pz0], { decor: true });
      sink.quad('straw', [x1, y1 - 0.2, pz1], [x0, y1 - 0.2, pz1], [x0, y0 - 0.2, pz0], [x1, y0 - 0.2, pz0], { decor: true });
      sink.span('straw', x0, y1 - 0.2, pz1 - 0.1, x1, y1, pz1 + 0.06, { decor: true });
    } else {
      const c = sheet(0.3);
      sink.quad('structureMetal', [x0, y1, pz1], [x1, y1, pz1], [x1, y0, pz0], [x0, y0, pz0], { ...c, decor: true });
      sink.quad('structureMetal', [x1, y1 - 0.02, pz1], [x0, y1 - 0.02, pz1], [x0, y0 - 0.02, pz0], [x1, y0 - 0.02, pz0], { colour: shade(c.colour, 0.6), decor: true });
    }
    const postY = y1 - 0.2 + (y0 - y1) * (pz1 - (qz - 0.25)) / (pz1 - pz0);
    for (const x of i === bays - 1 ? [x0, x1 - 0.05] : [x0]) {
      if (sx.some((s) => Math.abs(s - x) < 0.8)) continue;
      const xx = Math.max(-L / 2 + 0.1, Math.min(L / 2 - 0.1, x));
      sink.span('structureWood', xx - 0.08, wy, qz - 0.33, xx + 0.08, postY, qz - 0.17, { colour: shade(TIMBER, 0.8 + v() * 0.3), decor: true });
    }
    // the railing, open where a stair goes down
    if (!openBay(x0, x1)) for (const h of [0.95, 0.5]) bar(sink, 'structureWood', [x0, wy + h, qz - 0.25], [x1 - 0.05, wy + h, qz - 0.25], 0.07, { colour: shade(TIMBER, 0.9), decor: true, fine: h < 0.6 });
  }

  // ---- the stalls: trestle tables in two rows facing the middle aisle, a canvas awning over each, goods hung from it
  for (let r = 0; r < 2; r++) for (let j = 0; j < bays; j++) {
    const s = r ? 1 : -1, x = -L / 2 + (j + 0.5) * bw + (v() - 0.5) * 0.8, z = zm + s * D * 0.22, w = 0.9 + v() * 0.4;
    if (v() < 0.15) {
      // a stall shut up: its goods in crates and sacks on the boards
      for (let c = 0; c < 3; c++) sink.span('structureWood', x - 1 + c * 0.75, fy, z - 0.35, x - 0.45 + c * 0.75, fy + 0.4 + v() * 0.3, z + 0.35, { colour: shade(BASKET, 0.6 + v() * 0.4), decor: true });
      continue;
    }
    sink.span('structureWood', x - w, fy + 0.7, z - 0.6, x + w, fy + 0.8, z + 0.6, { colour: shade(TIMBER, 1.1), decor: true });
    for (const dx of [-w + 0.15, w - 0.15]) sink.span('structureWood', x + dx - 0.04, fy, z - 0.5, x + dx + 0.04, fy + 0.7, z + 0.5, { colour: TIMBER, decor: true });
    revolve(sink, 'structureWood', x - w * 0.45 + v() * w * 0.9, z + (v() - 0.5) * 0.5, [[0.2, fy + 0.8], [0.28, fy + 0.98], [0.001, fy + 1.0]], 6, { colour: shade(BASKET, 0.8 + v() * 0.3), decor: true, fine: true });
    // the awning: two poles at the stall's back, the canvas sloping down toward the aisle, its valance
    const zb = z + s * 0.7, za = z - s * 1.25, ya = fy + 2.0 + v() * 0.25, yb = ya + 0.35, col = AWNING[Math.floor(v() * AWNING.length)];
    for (const dx of [-w - 0.1, w + 0.1]) bar(sink, 'structureWood', [x + dx, fy, zb], [x + dx, yb, zb], 0.07, { colour: TIMBER, decor: true });
    const A: Vec3 = [x - w - 0.2, yb, zb], Bv: Vec3 = [x + w + 0.2, yb, zb], C: Vec3 = [x + w + 0.2, ya, za], Dv: Vec3 = [x - w - 0.2, ya, za];
    const up = s < 0 ? [Bv, A, Dv, C] as const : [A, Bv, C, Dv] as const;
    sink.quad('structureMetal', up[0], up[1], up[2], up[3], { colour: col, decor: true });
    sink.quad('structureMetal', up[1], up[0], up[3], up[2], { colour: shade(col, 0.6), decor: true });
    sink.span('structureMetal', x - w - 0.2, ya - 0.25, za - 0.02, x + w + 0.2, ya, za + 0.02, { colour: shade(col, 0.85), decor: true });
    // what hangs from its edge: hands of bananas, strings of dried fish, baskets, bunches of greens
    for (let g = 0; g < 3; g++) {
      const gx = x - w * 0.7 + g * w * 0.7 + (v() - 0.5) * 0.2, gl = 0.35 + v() * 0.4;
      sink.span('structureWood', gx - 0.12, ya - 0.25 - gl, za - s * 0.12, gx + 0.12, ya - 0.25, za - s * 0.02, { colour: GOODS[Math.floor(v() * GOODS.length)], decor: true, fine: 'near' });
    }
  }

  // ---- the landing: a timber stair down from the walkway to each floating stage, the sampans moored along them
  const pz = qz + 2.2, pl = 7.5;
  let moored = 0;
  for (let i = 0; i < P; i++) {
    const s = surfaceAt(ctx, px[i], pz + pl / 2) ?? (ctx.ground?.(px[i], pz + pl / 2) ?? 0) + 0.02;
    const top = s + 0.45;
    // the float (drums under a plank deck) and its bollards
    sink.span('structureMetal', px[i] - 1.8, s - 0.35, pz, px[i] + 1.8, s + 0.15, pz + pl, { colour: rgb(0x3d5a74), decor: true });
    sink.span('structureWood', px[i] - 2.0, s + 0.15, pz - 0.1, px[i] + 2.0, top, pz + pl + 0.1, { colour: shade(PLANK, 0.85), decor: true });
    for (const [dx, dz] of [[-1.8, 0.4], [1.8, 0.4], [-1.8, pl - 0.4], [1.8, pl - 0.4]] as const) bar(sink, 'structureWood', [px[i] + dx, top, pz + dz], [px[i] + dx, top + 0.5, pz + dz], 0.14, { colour: shade(TIMBER, 0.7), decor: true, fine: true });
    // the stair: two stringers from the walkway's edge to the stage, its treads, a handrail on the open side
    const drop = wy - top, x = sx[i], st = Math.max(1, Math.round(Math.abs(drop) / 0.22));
    for (const dx of [-0.6, 0.6]) bar(sink, 'structureWood', [x + dx, wy - 0.1, qz], [x + dx, top + 0.02, pz + 0.3], 0.12, { colour: shade(TIMBER, 0.8), decor: true });
    for (let t = 1; t <= st; t++) {
      const f = t / (st + 1), ty = wy + (top - wy) * f, tz = qz + (pz + 0.3 - qz) * f;
      sink.span('structureWood', x - 0.6, ty - 0.05, tz - 0.14, x + 0.6, ty + 0.02, tz + 0.14, { colour: shade(PLANK, 0.8 + v() * 0.3), decor: true });
    }
    bar(sink, 'structureWood', [x + 0.65, wy + 0.95, qz - 0.25], [x + 0.65, top + 0.95, pz + 0.3], 0.06, { colour: TIMBER, decor: true, fine: true });
    bar(sink, 'structureWood', [x + 0.65, top, pz + 0.3], [x + 0.65, top + 0.95, pz + 0.3], 0.07, { colour: TIMBER, decor: true, fine: true });
    // a boat either side, moored along the float, its painter to the bollard
    for (const side of [-1, 1]) {
      if (moored >= B) break;
      const bx = px[i] + side * 3.2, bz = pz + pl / 2 + (v() - 0.5) * 1.5, bs = surfaceAt(ctx, bx, bz);
      if (bs === null) continue;
      const len = 7 + v() * 2.5;
      sampan(sink, bx, bs + 0.1, bz, (v() - 0.5) * 0.15, len, HULL_PAINT[Math.floor(v() * HULL_PAINT.length)], v() < 0.5);
      bar(sink, 'structureWood', [px[i] + side * 1.8, top + 0.4, pz + pl - 0.4], [bx, bs + 0.6, bz + len / 2 - 0.3], 0.025, { colour: rgb(0x8a7a5a), decor: true, fine: 'near' });
      moored++;
    }
  }
  return { parts: sink.finish() };
};

/**
 * The charcoal works: `kilns` brick domes in a row (`radius` each) under their long open shed, the billet stacks behind
 * them, the sacks, the charcoal heap and the jetty at the water (+z).
 */
export const charcoalKilns: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const K = Math.round(num(ctx, 'kilns', 2, 8)), R = num(ctx, 'radius', 2, 3.5), H = R * 1.45;
  const pitch = 2 * R + 1.4, span = K * pitch, sd = 2 * R + 5, eo = 1.2;
  const y0 = bankTop(ctx, -span / 2, -sd / 2 - 2, span / 2, sd / 2 + 1);
  const foot = -0.6 - ctx.groundFall;

  // ---- the yard: a platform of beaten, wet mud, its edges slumped into the bank; darker puddled patches on it
  const yx = span / 2 + 1.0, yz0 = -sd / 2 - 2.6, yz1 = sd / 2 + 1.4, yt = y0 + 0.05;
  extrude(sink, 'plaster2', [[-yx, foot, yz0 - 0.9], [-yx, yt, yz0], [-yx, yt, yz1], [-yx, foot, yz1 + 1.1]], [1, 0, 0], 2 * yx, { shade: 0.5 });
  for (let p = 0; p < 4; p++) {
    const cx = (v() - 0.5) * span * 0.9, cz = R + 1.3 + (v() - 0.5) * 1.6, rx = 0.8 + v() * 1.2, rz = 0.5 + v() * 0.5, pts: Vec3[] = [];
    for (let i = 0; i < 6; i++) { const a = -i / 6 * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, yt + 0.008, cz + Math.sin(a) * rz]); }
    sink.polygon('plaster2', pts, { shade: 0.3, decor: true });
  }
  // the plank paths laid over it: along the kilns' doors and out to the jetty, in short runs of two boards
  const board = (x0: number, z0: number, x1: number, z1: number): void => {
    sink.span('structureWood', Math.min(x0, x1), yt, Math.min(z0, z1), Math.max(x0, x1), yt + 0.06 + v() * 0.03, Math.max(z0, z1), { colour: shade(PLANK, 0.6 + v() * 0.35), decor: true });
  };
  const az = R + 1.25, jx = 3.0;
  for (let x = -span / 2 + 0.3; x < span / 2 - 0.5;) {
    const l = Math.min(span / 2 - 0.3 - x, 3.0 + v() * 1.5), dz = (v() - 0.5) * 0.12;
    board(x, az - 0.32 + dz, x + l, az - 0.04 + dz);
    board(x + 0.1, az + 0.04 + dz, x + l - 0.1, az + 0.32 + dz);
    x += l + 0.08 + v() * 0.25;
  }
  for (let z = az + 0.4; z < yz1 - 0.2;) {
    const l = Math.min(yz1 - 0.1 - z, 2.5 + v());
    board(jx - 0.32, z, jx - 0.04, z + l);
    board(jx + 0.04, z + 0.1, jx + 0.32, z + l - 0.05);
    z += l + 0.1;
  }

  // ---- the shed's roof line (its pitch 37 degrees, the eaves deep and low): a height on its underside at |z|
  const sy = y0 + H + 1.4, tp = Math.tan(37 * Math.PI / 180), yr = sy + tp * sd / 2, ze = sd / 2 + eo, yeave = sy - tp * eo;
  const roofUnder = (z: number): number => yr - tp * Math.abs(z);

  // ---- the kilns
  for (let k = 0; k < K; k++) {
    const x = -span / 2 + (k + 0.5) * pitch, z = 0;
    // (each kiln built to its own size and burnt to its own colour: the look stream)
    const Rk = R * (0.86 + v() * 0.16), Hk = H * (0.9 + v() * 0.16), body = shade(v() < 0.5 ? BRICK : CLAY, 0.85 + v() * 0.2), b0 = y0 + 0.6;
    // the stone footing ring, smoke-dark
    revolve(sink, 'stone', x, z, [[Rk + 0.3, foot], [Rk + 0.3, y0 + 0.5], [Rk + 0.05, b0]], 16, { shade: 0.62 + v() * 0.15 });
    // the dome: a bell of brick under its clay skin, smooth-shaded, the crown's last courses black with soot
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 8; i++) { const a = (Math.PI / 2) * i / 9; prof.push([Hk * Math.sin(a), Rk * Math.cos(a) ** 0.72]); }
    sink.revolve('structureMetal', [x, b0, z], 'y', prof, 16, { colour: body, bandColour: (band) => band >= 7 ? SOOT : band === 6 ? shade(body, 0.55) : body });
    // (landmarks-world-276, the integrity census's slivers: the last band ran to a 1 mm ring, sixteen needles) the crown
    // closed to its point (kit.ts revolve: the axis in triangles)
    revolve(sink, 'structureMetal', x, z, [[prof[8][1], b0 + prof[8][0]], [0, b0 + Hk]], 16, { colour: SOOT });
    // the soot fanned up the dome from the door
    for (let i = 1; i < 7; i++) {
      // (three facets across, each corner on the dome's skin)
      const [ya, ra] = prof[i], [yb, rb] = prof[i + 1], wa = 0.45 + i * 0.08, wb = wa + 0.08;
      const on = (r: number, dx: number, y: number): Vec3 => [x + dx, b0 + y, z + Math.sqrt(Math.max(0.01, r * r - dx * dx)) + 0.06];
      for (let c = 0; c < 3; c++) {
        const f0 = -1 + c * 2 / 3, f1 = f0 + 2 / 3;
        sink.quad('structureMetal', on(ra, wa * f0, ya), on(ra, wa * f1, ya), on(rb, wb * f1, yb), on(rb, wb * f0, yb), { colour: shade(SOOT, 1.3 + i * 0.1), decor: true });
      }
    }
    // the stoking arch on the aisle side: its brick front, the dark mouth, the voussoirs; some bricked half up for a burn
    const zf = z + Rk;
    sink.span('structureMetal', x - 0.95, y0, zf - 0.8, x + 0.95, y0 + 2.0, zf + 0.25, { colour: shade(body, 0.9) });
    const mouth: Vec3[] = [[x - 0.4, y0 + 0.12, zf + 0.26], [x + 0.4, y0 + 0.12, zf + 0.26]];
    for (let i = 0; i <= 6; i++) { const a = Math.PI * i / 6; mouth.push([x + Math.cos(a) * 0.4, y0 + 1.0 + Math.sin(a) * 0.4, zf + 0.26]); }
    sink.polygon('dark', mouth, { decor: true });
    for (let i = 0; i < 5; i++) {
      const a0 = Math.PI * i / 5, a1 = Math.PI * (i + 1) / 5;
      bar(sink, 'structureMetal', [x + Math.cos(a0) * 0.56, y0 + 1.0 + Math.sin(a0) * 0.56, zf + 0.3], [x + Math.cos(a1) * 0.56, y0 + 1.0 + Math.sin(a1) * 0.56, zf + 0.3], 0.16, { colour: shade(BRICK, 0.65), decor: true });
    }
    if (v() < 0.5) sink.span('structureMetal', x - 0.4, y0 + 0.12, zf + 0.2, x + 0.4, y0 + 0.6 + v() * 0.5, zf + 0.3, { colour: shade(BRICK, 1.15), decor: true });
    sink.quad('structureMetal', [x - 0.7, y0 + 1.5, zf + 0.27], [x + 0.7, y0 + 1.5, zf + 0.27], [x + 0.85, y0 + 2.0, zf + 0.27], [x - 0.85, y0 + 2.0, zf + 0.27], { colour: SOOT, decor: true });
    // the flue ports round the foot (between the door and the chimney)
    for (const a of [0.9, -0.9, 2.2, -2.2]) {
      const fx = x + Math.sin(a) * Rk, fz = z + Math.cos(a) * Rk;
      sink.span('dark', fx - 0.13, b0 + 0.05, fz - 0.13, fx + 0.13, b0 + 0.3, fz + 0.13, { decor: true, fine: true });
    }
    // the chimney at its back: a square brick stack against the dome's foot, its cap and its sooted mouth
    const zc = z - Rk - 0.15, ct = Math.min(b0 + Hk * 0.78, roofUnder(zc) - 0.6);
    sink.span('structureMetal', x - 0.35, foot, zc - 0.35, x + 0.35, ct, zc + 0.35, { colour: shade(BRICK, 0.8 + v() * 0.15) });
    sink.span('structureMetal', x - 0.45, ct, zc - 0.45, x + 0.45, ct + 0.15, zc + 0.45, { colour: shade(BRICK, 0.6), decor: true });
    sink.span('structureMetal', x - 0.36, ct - 0.8, zc - 0.36, x + 0.36, ct, zc + 0.36, { colour: SOOT, decor: true });
  }

  // ---- the shed: timber posts (a little out of true) in two rows, the trusses (tie beam, king post, rafters, braces)
  const sw = span + 1.0, go = 0.6;
  for (let i = 0; i <= K; i++) {
    const x = -sw / 2 + i * sw / K;
    for (const s of [-1, 1]) {
      const zp = s * sd / 2;
      bar(sink, 'structureWood', [x, foot, zp], [x + (v() - 0.5) * 0.12, sy, zp + (v() - 0.5) * 0.08], 0.22, { colour: shade(TIMBER, 0.8 + v() * 0.3) });
      bar(sink, 'structureWood', [x, sy - 1.1, zp], [x, sy - 0.2, zp - s * 0.9], 0.11, { colour: TIMBER, decor: true, fine: true });
      bar(sink, 'structureWood', [x, yeave - 0.09, s * ze], [x, yr - 0.09, 0], 0.15, { colour: shade(TIMBER, 0.75), decor: true });
    }
    sink.span('structureWood', x - 0.1, sy - 0.26, -sd / 2 - 0.1, x + 0.1, sy, sd / 2 + 0.1, { colour: shade(TIMBER, 0.85), decor: true });
    bar(sink, 'structureWood', [x, sy, 0], [x, yr - 0.1, 0], 0.14, { colour: TIMBER, decor: true });
  }
  for (const s of [-1, 1]) sink.span('structureWood', -sw / 2 - 0.2, sy - 0.26, s * sd / 2 - 0.12, sw / 2 + 0.2, sy, s * sd / 2 + 0.12, { colour: TIMBER, decor: true });
  // the roof: on each side three courses of attap, each lapped over the one below it, 0.35 m thick at the eaves
  const th = 0.35, rx0 = -sw / 2 - go, rlen = sw + 2 * go;
  for (const s of [-1, 1]) for (let c = 0; c < 3; c++) {
    const u0 = Math.max(0, c / 3 - 0.05), u1 = Math.min(1, (c + 1) / 3 + 0.03), lift = c * 0.12;
    const P0: [number, number] = [s * ze * (1 - u0), yeave + (yr - yeave) * u0 + lift], P1: [number, number] = [s * ze * (1 - u1), yeave + (yr - yeave) * u1 + lift];
    extrude(sink, 'straw', [[rx0, P0[1], P0[0]], [rx0, P1[1], P1[0]], [rx0, P1[1] + th - 0.1, P1[0]], [rx0, P0[1] + th, P0[0]]], [1, 0, 0], rlen, { decor: true });
  }
  // the ridge capped with a roll of tin, and the gables' upper triangles closed with attap
  const rt = yr + 0.24 + th;
  extrude(sink, 'structureMetal', [[rx0 - 0.1, rt - 0.35, -0.55], [rx0 - 0.1, rt - 0.35, 0.55], [rx0 - 0.1, rt + 0.15, 0]], [1, 0, 0], rlen + 0.2, { colour: shade(RUST, 0.9), decor: true });
  for (const s of [-1, 1]) {
    const gx = s * sw / 2, tri: Vec3[] = [[gx, sy, -sd / 2], [gx, sy, sd / 2], [gx, yr - 0.1, 0]];
    sink.polygon('straw', s > 0 ? tri : [...tri].reverse(), { decor: true });
    sink.polygon('straw', s > 0 ? [...tri].reverse() : tri, { decor: true });
  }
  // the tin sheets patched into the thatch where it failed, and the soot on its underside over each kiln's crown
  for (let p = 0; p < 3; p++) {
    // (laid on one course, clear of the course lapped over it)
    const s = v() < 0.5 ? -1 : 1, c = Math.floor(v() * 3), x0 = -sw / 2 + v() * (sw - 2.4), cu0 = Math.max(0, c / 3 - 0.05), cu1 = Math.min(1, (c + 1) / 3 + 0.03);
    const u0 = c / 3 + 0.03, u1 = c / 3 + 0.24;
    const q = (x: number, u: number): Vec3 => [x, yeave + (yr - yeave) * u + c * 0.12 + th - 0.1 * (u - cu0) / (cu1 - cu0) + 0.03, s * ze * (1 - u)];
    const pts = [q(x0, u0), q(x0 + 2.2, u0), q(x0 + 2.2, u1), q(x0, u1)];
    sink.polygon('structureMetal', s > 0 ? pts : [...pts].reverse(), { colour: shade(v() < 0.5 ? RUST : TIN, 0.75 + v() * 0.3), decor: true });
  }
  for (let k = 0; k < K; k++) {
    const x = -span / 2 + (k + 0.5) * pitch;
    for (const s of [-1, 1]) {
      // (landmarks-world-276, the integrity census: the soot ran 14-26 cm under the courses it blackens, on the roof's
      // base line, where the middle course stands 0.12 m up) on the middle course's underside, within its lap
      const q = (dx: number, u: number): Vec3 => [x + dx, yeave + (yr - yeave) * u + 0.12 - 0.02, s * ze * (1 - u)];
      const pts = [q(-1.4, 0.36), q(1.4, 0.36), q(1.4, 0.66), q(-1.4, 0.66)];
      sink.polygon('structureMetal', s > 0 ? [...pts].reverse() : pts, { colour: SOOT, decor: true });
    }
  }

  // ---- the billets behind the shed: cords of mangrove wood, bark on, their sawn ends out (the rows' gaps dark), the top
  // courses loose; at the shed's ends a round stack of billets stood on end
  for (let k = 0; k < K; k++) {
    const x = -span / 2 + (k + 0.5) * pitch + (v() - 0.5) * 0.8, z = -sd / 2 - 1.5, w = 2.2 + v() * 0.9, h = 1.0 + v() * 0.45, d = 1.2 + v() * 0.3;
    const prof: Vec3[] = [[x - w / 2, yt, z - d / 2], [x + w / 2, yt, z - d / 2], [x + w / 2 - 0.2, yt + h, z - d / 2], [x - w / 2 + 0.2, yt + h, z - d / 2]];
    extrude(sink, 'structureWood', prof, [0, 0, 1], d, { colour: BILLET });
    for (const e of [-1, 1]) {
      const pts = prof.map((p): Vec3 => [p[0], p[1], z + e * (d / 2 + 0.01)]);
      sink.polygon('structureWood', e > 0 ? pts : [...pts].reverse(), { colour: shade(CUT, 0.8 + v() * 0.3), decor: true });
      for (let r = 1; r < 3; r++) {
        const gy = yt + h * r / 3, gi = 0.2 * r / 3, ez = z + e * (d / 2 + 0.02);
        const gap: Vec3[] = [[x - w / 2 + gi, gy, ez], [x + w / 2 - gi, gy, ez], [x + w / 2 - gi, gy + 0.05, ez], [x - w / 2 + gi, gy + 0.05, ez]];
        sink.polygon('structureWood', e > 0 ? gap : gap.reverse(), { colour: SOOT, decor: true, fine: true });
      }
    }
    for (let row = 0; row < 2; row++) {
      const ww = w - 0.4 - row * 0.5, logs = Math.min(9 - row * 2, Math.max(2, Math.floor(ww / 0.24)));
      for (let i = 0; i < logs; i++) {
        const lx = x - ww / 2 + 0.12 + i * (ww - 0.24) / (logs - 1) + (v() - 0.5) * 0.05, lz = z - d / 2 - 0.05 + (v() - 0.5) * 0.2;
        sink.cylinder('structureWood', [lx, yt + h + 0.1 + row * 0.19, lz], 'z', d + 0.1, 0.1 + v() * 0.03, 5, { colour: shade(BILLET, 0.85 + v() * 0.35), decor: true });
      }
    }
  }
  for (const e of [-1, 1]) {
    const rr = 0.75 + v() * 0.2, rh = 1.3 + v() * 0.3;
    const sx = e * (span / 2 + 0.3), sz = -sd / 2 - 1.4;
    sink.revolve('structureWood', [sx, yt, sz], 'y', [[0, rr], [rh, rr * 0.97], [rh + 0.12, rr * 0.85]], 10,
      { colour: BILLET, bandColour: (band) => band ? shade(CUT, 0.9) : shade(BILLET, 0.95) });
    // (the stack's sawn top closed to its middle, as the kilns' crowns: no 1 mm ring of needles)
    revolve(sink, 'structureWood', sx, sz, [[rr * 0.85, yt + rh + 0.12], [0, yt + rh + 0.14]], 10, { colour: shade(CUT, 0.9) });
  }

  // ---- at the landing: the charcoal heap, the sacks filled from it, and the jetty with its sampan
  revolve(sink, 'dark', -jx - 1.5, yz1 - 1.2, [[1.0, yt - 0.02], [0.6, yt + 0.4], [0.001, yt + 0.55]], 8, { decor: true });
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4), col = i % 4, x = jx + 0.8 + col * 0.62 + (v() - 0.5) * 0.08, z = yz1 - 1.9 + (row % 2) * 0.95, y = row < 2 ? yt : yt + 0.34;
    if (row === 2 && col > 2) continue;
    sink.span('structureWood', x - 0.28, y, z - 0.42, x + 0.28, y + 0.34, z + 0.42, { colour: shade(SACKS[Math.floor(v() * SACKS.length)], 0.85 + v() * 0.25), decor: true });
  }
  const jz0 = yz1 - 0.4, jz1 = sd / 2 + 7.2, dk = Math.max((surfaceAt(ctx, jx, jz1 - 1) ?? -Infinity) + 0.6, yt + 0.15);
  sink.span('structureWood', jx - 1.2, dk - 0.22, jz0, jx + 1.2, dk, jz1, { colour: shade(PLANK, 0.85), decor: true });
  boards(sink, v, jx - 1.2, jx + 1.2, jz0, jz1, dk + 0.006, 'x', 0.55);
  for (let z = jz0 + 0.3; z < jz1; z += 2.1) for (const dx of [-1.15, 1.15]) {
    sink.cylinder('structureWood', [jx + dx, foot - 1.5, z], 'y', dk + 0.35 - (foot - 1.5), 0.12 + v() * 0.03, 6, { colour: shade(PILE, 0.7 + v() * 0.35), decor: true }, 0.11, false);
  }
  for (const dx of [-0.35, 0.35]) bar(sink, 'structureWood', [jx + dx, dk, jz1 - 0.05], [jx + dx, dk - 1.6, jz1 + 0.2], 0.06, { colour: TIMBER, decor: true, fine: true });
  const bz = jz1 - 3.6, bs = surfaceAt(ctx, jx + 2.2, bz);
  if (bs !== null) {
    sampan(sink, jx + 2.2, bs + 0.1, bz, (v() - 0.5) * 0.1, 7.5, HULL, false);
    // laden with sacks of charcoal
    for (let i = 0; i < 4; i++) sink.span('structureWood', jx + 1.95, bs + 0.22, bz - 1.4 + i * 0.75, jx + 2.45, bs + 0.55, bz - 0.8 + i * 0.75, { colour: shade(SACKS[i % 2], 0.9), decor: true });
  }
  return { parts: sink.finish() };
};
