// src/world/landmarks/navajo.ts — Monument Valley's trading post and hogans (landmarks-271, 2026-11-06). Titan Gorge is
// Monument Valley: the census (buildings-270 signature places) names "a stone trading post under the cliff at
// Goulding's, earth-covered hogans" and the sheep corrals of juniper posts as what is built there, and found them missing.
//
// - tradingPost: Goulding's: a two-storey block of the valley's red sandstone laid in rough courses, flat-roofed behind
//   a parapet with its timber vigas showing, the store's porch of peeled posts along the front with the bench and the
//   gas pumps, the outside stair to the upper floor's door, the painted sign board; the single-storey wareroom beside it.
// - hogan: the Diné dwelling, eight-sided cribbed logs under an earth-covered dome, its doorway on the east (+z) under
//   a short entry with the blanket over it, the stovepipe through the roof, and (`corral`) the sheep corral of juniper
//   posts and brush beside it.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink, in the map kit's stone and
// render (no draw call of their own). Walls and the hogan's body are structure; the porch, pumps, rails and the corral's
// posts are dressing.
import { PartSink, rgb, shade, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const POST = rgb(0x8a7458), VIGA = rgb(0x6a5440), EARTH = rgb(0x9a5a3a), EARTH_DARK = rgb(0x7a4630), PUMP = rgb(0xb2302a), SIGN = rgb(0xe6dcc0);
const JUNIPER = rgb(0x5e4e3c), BLANKET = rgb(0x8a2f2a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** Goulding's trading post: the main block (`width` x `depth`, two storeys), the wareroom at +x, the porch at +z. */
export const tradingPost: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const mobile = ctx.tier === 'mobile', v = ctx.variant;
  const W = num(ctx, 'width', 10, 24), D = num(ctx, 'depth', 8, 16), H = 6.6, foot = -0.6 - ctx.groundFall;
  const x0 = -W / 2 - 3, x1 = x0 + W;
  // the block's sandstone walls with their windows: two rows on the front, the door in the middle
  sink.span('stone', x0, foot, -D / 2, x1, H, D / 2, {});
  for (const [y0, y1] of [[1.0, 2.4], [4.0, 5.3]] as const) for (let u = x0 + 1.6; u < x1 - 1; u += 2.6) {
    if (y0 < 2 && Math.abs(u - (x0 + W / 2)) < 1.2) continue;
    sink.span('dark', u - 0.5, y0, D / 2 - 0.01, u + 0.5, y1, D / 2 + 0.02, { decor: true });
    sink.span('structureWood', u - 0.65, y1, D / 2, u + 0.65, y1 + 0.18, D / 2 + 0.12, { colour: VIGA, decor: true });
  }
  sink.span('dark', x0 + W / 2 - 0.7, 0, D / 2 - 0.01, x0 + W / 2 + 0.7, 2.4, D / 2 + 0.02, { decor: true });
  sink.span('structureWood', x0 + W / 2 - 0.6, 0.02, D / 2 + 0.02, x0 + W / 2 + 0.6, 2.3, D / 2 + 0.06, { colour: rgb(0x3e5a6a), decor: true });
  // the parapet and the vigas' ends through the wall under it
  for (const [a, b, c, d] of [[x0, D / 2 - 0.35, x1, D / 2], [x0, -D / 2, x1, -D / 2 + 0.35], [x0, -D / 2, x0 + 0.35, D / 2], [x1 - 0.35, -D / 2, x1, D / 2]] as const) sink.span('stone', a, H, b, c, H + 0.7, d, {});
  if (!mobile) for (let u = x0 + 0.8; u < x1 - 0.4; u += 1.2) bar(sink, 'structureWood', [u, H - 0.5, D / 2], [u, H - 0.5, D / 2 + 0.45], 0.2, { colour: VIGA, decor: true, fine: true });
  // the sign board on the parapet
  sink.span('structureWood', x0 + 1, H + 0.7, D / 2 - 0.2, x1 - 1, H + 1.7, D / 2 - 0.05, { colour: SIGN, decor: true });
  sink.span('structureWood', x0 + 1.3, H + 0.95, D / 2 - 0.06, x1 - 1.3, H + 1.45, D / 2 - 0.04, { colour: rgb(0x6a2a20), decor: true, fine: mobile ? undefined : 'near' });
  // the porch of peeled posts along the front, its shed roof of planks and the bench
  const pz = D / 2 + 3.2;
  for (let u = x0 + 0.3; u <= x1 - 0.2; u += (W - 0.5) / 4) bar(sink, 'structureWood', [u, -0.2, pz], [u, 3.0, pz], 0.22, { colour: POST, decor: true });
  sink.quad('structureWood', [x0, 3.1, pz + 0.4], [x1, 3.1, pz + 0.4], [x1, 3.6, D / 2], [x0, 3.6, D / 2], { colour: shade(VIGA, 1.1) });
  sink.quad('structureWood', [x1, 3.08, pz + 0.4], [x0, 3.08, pz + 0.4], [x0, 3.58, D / 2], [x1, 3.58, D / 2], { colour: shade(VIGA, 0.6), decor: true });
  sink.span('structureWood', x0, 0, D / 2, x1, 0.3, pz + 0.3, { colour: shade(VIGA, 0.9), decor: true });
  sink.span('structureWood', x0 + 1, 0.3, D / 2 + 0.3, x0 + 3.5, 0.75, D / 2 + 0.8, { colour: VIGA, decor: true });
  // the gas pumps out front (two, the round-globed visible pumps of the 1930s)
  for (const k of [0, 1]) {
    const px = x0 + W / 2 - 1.5 + k * 3, pzz = pz + 3.5;
    sink.span('stone', px - 0.6, -0.2, pzz - 0.6, px + 0.6, 0.2, pzz + 0.6, { shade: 0.8 });
    sink.span('structureMetal', px - 0.3, 0.2, pzz - 0.3, px + 0.3, 2.2, pzz + 0.3, { colour: PUMP, decor: true });
    sink.cylinder('glass', [px, 2.2, pzz], 'y', 0.9, 0.22, 8, { decor: true });
    revolve(sink, 'structureMetal', px, pzz, [[0.001, 3.1], [0.2, 3.1], [0.25, 3.3], [0.001, 3.45]], 8, { colour: SIGN, decor: true });
  }
  // the outside stair up the -x end to the upper door, on its stone wall
  const sx = x0 - 1.2;
  sink.polygon('stone', [[sx - 0.6, 0, D / 2 - 0.5], [sx - 0.6, 0, -D / 2 + 0.5], [sx - 0.6, 3.9, -D / 2 + 0.5]], {});
  for (let k = 0; k < 13; k++) {
    const z = D / 2 - 0.5 - (k + 1) * (D - 1) / 13, y = (k + 1) * 3.9 / 13;
    sink.span('stone', sx - 0.6, y - 0.3, z, sx + 0.6, y, z + (D - 1) / 13, {});
  }
  sink.span('dark', x0 - 0.01, 3.9, -D / 2 + 0.7, x0 + 0.02, 6.0, -D / 2 + 1.7, { decor: true });
  // the wareroom at +x: one storey of the same stone, its flat roof and a loading door
  const wx0 = x1, wx1 = x1 + 6, wD = D * 0.8;
  sink.span('stone', wx0, foot, -wD / 2, wx1, 3.6, wD / 2 - 0.5, { shade: 0.95 });
  sink.span('stone', wx0, 3.6, -wD / 2, wx1, 4.0, wD / 2 - 0.5, { decor: true, shade: 0.9 });
  sink.span('structureWood', wx0 + 1.6, 0, wD / 2 - 0.52, wx0 + 4.2, 2.6, wD / 2 - 0.46, { colour: shade(VIGA, 0.8), decor: true });
  // the stovepipe and the water barrels at the back corner
  bar(sink, 'structureMetal', [x0 + 1.2, H, -D / 2 + 1.2], [x0 + 1.2, H + 2.2, -D / 2 + 1.2], 0.12, { colour: rgb(0x333333), decor: true });
  for (let k = 0; k < 3; k++) sink.cylinder('structureMetal', [x1 + 1.2 + k * 1.0, 0, -wD / 2 - 0.8], 'y', 0.9, 0.38, 10, { colour: shade(rgb(0x3a5a3a), 0.8 + v() * 0.3), decor: true });
  return { parts: sink.finish() };
};

/**
 * The hogan (`radius` to its walls) with its entry on the east (+z) and, `corral` true, the sheep corral of juniper posts
 * beside it (+x).
 */
export const hogan: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const mobile = ctx.tier === 'mobile', v = ctx.variant;
  const R = num(ctx, 'radius', 2.5, 6), foot = -0.6 - ctx.groundFall, n = 8, wallH = 1.9;
  // the eight walls of cribbed logs, chinked with mud (the log ends at the corners as dressing)
  const corner = (k: number, r: number, y: number): Vec3 => [Math.sin((k + 0.5) / n * Math.PI * 2) * r, y, Math.cos((k + 0.5) / n * Math.PI * 2) * r];
  for (let k = 0; k < n; k++) {
    sink.quad('structureWood', corner(k, R, foot), corner(k + 1, R, foot), corner(k + 1, R, wallH), corner(k, R, wallH), { colour: JUNIPER });
    if (!mobile) for (let y = 0.25; y < wallH; y += 0.28) bar(sink, 'structureWood', corner(k, R + 0.05, y), corner(k + 1, R + 0.05, y), 0.09, { colour: shade(JUNIPER, 0.7 + v() * 0.3), decor: true, fine: true });
  }
  // the earth dome over the cribbed roof, mounded higher at the middle round the smoke hole
  const dome: Array<[number, number]> = [[R + 0.35, wallH - 0.3]];
  for (let i = 1; i <= 7; i++) { const a = (Math.PI / 2) * i / 7; dome.push([Math.max(0.5, Math.cos(a) * (R + 0.35)), wallH - 0.3 + Math.sin(a) * R * 0.62]); }
  dome.push([0.45, wallH - 0.3 + R * 0.62 - 0.05]);
  revolve(sink, 'structureWood', 0, 0, dome, mobile ? 10 : 16, { colour: EARTH });
  revolve(sink, 'structureWood', 0, 0, [[0.45, wallH - 0.3 + R * 0.62 - 0.05], [0.3, wallH - 0.3 + R * 0.62 - 0.4], [0.29, wallH - 0.3 + R * 0.62 - 0.4]], 8, { colour: EARTH_DARK, decor: true });
  bar(sink, 'structureMetal', [0.1, wallH, 0.1], [0.1, wallH + R * 0.62 + 0.8, 0.1], 0.1, { colour: rgb(0x2e2e2e), decor: true });
  // the entry on the east: a short boxed passage under its own earth, the blanket over the door
  const ez = R * Math.cos(Math.PI / n);
  sink.span('structureWood', -0.9, foot, ez - 0.2, 0.9, 1.9, ez + 1.2, { colour: JUNIPER });
  sink.span('structureWood', -1.0, 1.9, ez - 0.3, 1.0, 2.25, ez + 1.35, { colour: EARTH });
  sink.span('structureWood', -0.5, 0.05, ez + 1.2, 0.5, 1.7, ez + 1.24, { colour: BLANKET, decor: true });
  // the sheep corral beside it: juniper posts leaning every way, brush between, its gate gap toward the hogan
  if (ctx.params.corral !== false) {
    const cx = R + 7.5, cr = 5.0, posts = mobile ? 14 : 24;
    for (let k = 0; k < posts; k++) {
      const a = (k / posts) * Math.PI * 2;
      if (Math.abs(Math.sin(a) + 1) < 0.08) continue;
      // (each post on its own ground: the hogan is seated on its body alone)
      const x = cx + Math.cos(a) * cr, z = Math.sin(a) * cr, lean = (v() - 0.5) * 0.3, gy = ctx.ground?.(x, z) ?? 0;
      bar(sink, 'structureWood', [x, gy - 0.3, z], [x + lean, gy + 1.4 + v() * 0.4, z + lean], 0.13, { colour: shade(JUNIPER, 0.8 + v() * 0.4), decor: true });
      const b = ((k + 1) / posts) * Math.PI * 2, bx = cx + Math.cos(b) * cr, bz = Math.sin(b) * cr;
      bar(sink, 'structureWood', [x, gy + 0.9, z], [bx, (ctx.ground?.(bx, bz) ?? 0) + 0.9 + v() * 0.3, bz], 0.08, { colour: JUNIPER, decor: true, fine: mobile ? undefined : true });
    }
  }
  return { parts: sink.finish() };
};
