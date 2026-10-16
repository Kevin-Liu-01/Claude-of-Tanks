// src/world/landmarks/fjordWorks.ts — a Nordland fjord farm's and fishing village's works (the map-content lane,
// 2026-10-10; the owner: Nordhavn "very bare"): what stood round Bjerkvik at the head of the Herjangsfjord in May 1940 —
// the hay racks (hesjer) strung across the infields, the stockfish racks (hjeller) on the shore and the headlands with the
// cod hung in pairs to dry, and the stabbur, the farm's storehouse raised on its posts.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink:
// it merges into the props' material buckets. Long pieces follow the ground (plan.ts drapes): each post foots on the
// ground under it.
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const POLE = rgb(0x6a5a46), POLE_DARK = rgb(0x4a3e30), HAY = rgb(0xa89a5a), HAY_DRY = rgb(0x8c7c46), FISH = rgb(0xb8ad94);
const FISH_DARK = rgb(0x8a7e66), TAR = rgb(0x2e2a26), RED_OCHRE = rgb(0x7a2e22), TURF = rgb(0x4e5a34);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// --------------------------------------------------------------------------------------------------------------- hesje

/**
 * A hay rack (hesje): posts in a line along x every 2.4 m, the wires between them hung with hay to a man's height, the
 * hay a thatch of slanted bundles on both faces, the end posts braced. Low cover a hull drives through: dressing.
 */
export const hayRack: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 6), n = Math.max(2, Math.round(L / 2.4)), step = L / n, H = 1.7;
  const g = (x: number) => ctx.ground?.(x, 0) ?? 0;
  for (let k = 0; k <= n; k++) {
    const x = -L / 2 + k * step, y = g(x);
    bar(sink, 'structureWood', [x, y - 0.4, 0], [x, y + H + 0.15, 0], 0.09, { colour: POLE, decor: true });
  }
  for (const e of [-1, 1]) {
    const x = e * L / 2, y = g(x);
    bar(sink, 'structureWood', [x, y + H * 0.8, 0], [x + e * 1.1, y - 0.2, 0], 0.07, { colour: POLE_DARK, decor: true, fine: true });
  }
  // the hay hung on the wires: per bay, a ridge of bundles on each face, the tone varying bay by bay
  for (let k = 0; k < n; k++) {
    const x0 = -L / 2 + k * step + 0.06, x1 = x0 + step - 0.12, y0 = g(x0), y1 = g(x1);
    const tone = lerp(HAY, HAY_DRY, ctx.variant());
    const top0 = y0 + H, top1 = y1 + H, foot0 = y0 + 0.35, foot1 = y1 + 0.35;
    for (const sz of [-1, 1]) {
      const pts: Vec3[] = [[x0, foot0, sz * 0.42], [x1, foot1, sz * 0.42], [x1, top1, sz * 0.05], [x0, top0, sz * 0.05]];
      sink.polygon('structureWood', sz > 0 ? pts : [pts[1], pts[0], pts[3], pts[2]], { colour: sz > 0 ? tone : shade(tone, 0.82), decor: true });
    }
    sink.quad('structureWood', [x0, top0, -0.05], [x1, top1, -0.05], [x1, top1, 0.05], [x0, top0, 0.05], { colour: shade(tone, 1.05), decor: true });
  }
  return { parts: sink.finish() };
};

// ----------------------------------------------------------------------------------------------------------- fish rack

/**
 * A stockfish rack (hjell): A-frames of poles along x every 3 m, the ridge pole and two rails a side between them, the
 * cod hung in pairs over the rails in rows, a little greyer toward the ends. The poles are the solid (a hull is stopped
 * by the frames' feet); the fish are dressing.
 */
export const fishRack: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 9), n = Math.max(2, Math.round(L / 3)), step = L / n, H = num(ctx, 'height', 4), half = H * 0.42;
  const g = (x: number, z = 0) => ctx.ground?.(x, z) ?? 0;
  const base = Math.min(...Array.from({ length: n + 1 }, (_, k) => g(-L / 2 + k * step)));
  const top = Math.max(...Array.from({ length: n + 1 }, (_, k) => g(-L / 2 + k * step))) + H;
  for (let k = 0; k <= n; k++) {
    const x = -L / 2 + k * step;
    for (const sz of [-1, 1]) {
      const y = g(x, sz * half);
      bar(sink, 'structureWood', [x, Math.min(y - 0.5, base - 0.5), sz * half], [x, top, 0], 0.14, { colour: POLE });
    }
  }
  bar(sink, 'structureWood', [-L / 2 - 0.3, top - 0.05, 0], [L / 2 + 0.3, top - 0.05, 0], 0.12, { colour: POLE_DARK });
  for (const f of [0.45, 0.75]) for (const sz of [-1, 1]) {
    const y = top - H * (1 - f) * 0.9, z = sz * half * (1 - f);
    bar(sink, 'structureWood', [-L / 2, y, z], [L / 2, y, z], 0.07, { colour: POLE_DARK, decor: true });
    // the cod in pairs over the rail: a pair is two narrow quads hanging below it
    const pairs = Math.round(L / 0.35);
    for (let p = 0; p < pairs; p++) {
      if (ctx.rng() < 0.12) continue;
      const x = -L / 2 + (p + 0.5) * (L / pairs), drop = 0.75 + 0.2 * ctx.rng();
      const tone = lerp(FISH, FISH_DARK, Math.abs(x) / (L / 2) * 0.6 + ctx.variant() * 0.3);
      sink.quad('structureWood', [x - 0.07, y - drop, z + sz * 0.02], [x + 0.07, y - drop, z + sz * 0.02], [x + 0.06, y, z + sz * 0.02], [x - 0.06, y, z + sz * 0.02],
        { colour: tone, decor: true, fine: p % 2 === 1 });
      sink.quad('structureWood', [x + 0.07, y - drop, z - sz * 0.02], [x - 0.07, y - drop, z - sz * 0.02], [x - 0.06, y, z - sz * 0.02], [x + 0.06, y, z - sz * 0.02],
        { colour: shade(tone, 0.85), decor: true, fine: p % 2 === 1 });
    }
  }
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------ stabbur

/**
 * The stabbur, the farm's storehouse: a log body on its stone and post stilts, the upper storey jutting over the lower
 * under a turf roof, the door up its stair; tarred dark or painted in the red ochre of the farm.
 */
export const stabbur: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = num(ctx, 'width', 3), D = num(ctx, 'depth', 3), hw = W / 2, hd = D / 2;
  const g = (x: number, z: number) => ctx.ground?.(x, z) ?? 0;
  let gTop = -Infinity, gLo = Infinity;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const y = g(sx * (hw - 0.3), sz * (hd - 0.3)); gTop = Math.max(gTop, y); gLo = Math.min(gLo, y); }
  const floor = gTop + 1.0, eave = floor + 3.6;
  const paint = ctx.variant() < 0.5 ? RED_OCHRE : TAR;
  // the stilts: a stone under each post, the post to the sill
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (hw - 0.3), z = sz * (hd - 0.3), y = g(x, z);
    sink.span('stone', x - 0.3, Math.min(y - 0.6, gLo - 0.6), z - 0.3, x + 0.3, y + 0.3, z + 0.3);
    bar(sink, 'structureWood', [x, y + 0.3, z], [x, floor, z], 0.28, { colour: POLE_DARK });
  }
  // the lower log storey, the upper one jutting 0.4 m, the turf roof
  sink.span('structureWood', -hw, floor, -hd, hw, floor + 2.0, hd, { colour: paint });
  sink.span('structureWood', -hw - 0.4, floor + 2.0, -hd - 0.4, hw + 0.4, eave, hd + 0.4, { colour: shade(paint, 1.08) });
  for (let y = floor + 0.25; y < eave - 0.1; y += 0.25) for (const sx of [-1, 1]) {
    const w = y > floor + 2 ? hw + 0.42 : hw + 0.02;
    sink.span('structureWood', sx * w - 0.02, y - 0.02, -(y > floor + 2 ? hd + 0.4 : hd), sx * w + 0.02, y + 0.02, y > floor + 2 ? hd + 0.4 : hd, { colour: shade(paint, 0.8), decor: true, fine: true });
  }
  const r = eave + 1.5, o = 0.5;
  // the turf roof (sod over birch bark), in the vertex-coloured timber bucket: a map without a regional kit merges its
  // plain roof bucket without a tint record, and the sod is no tile anyway
  sink.quad('structureWood', [-hw - 0.4 - o, eave - 0.1, hd + 0.4 + o], [-hw - 0.4 - o, eave - 0.1, -hd - 0.4 - o], [0, r, -hd - 0.4 - o], [0, r, hd + 0.4 + o], { colour: TURF });
  sink.quad('structureWood', [hw + 0.4 + o, eave - 0.1, -hd - 0.4 - o], [hw + 0.4 + o, eave - 0.1, hd + 0.4 + o], [0, r, hd + 0.4 + o], [0, r, -hd - 0.4 - o], { colour: shade(TURF, 0.85) });
  // the roof's underside at the eaves (seen from below)
  sink.quad('structureWood', [-hw - 0.4 - o, eave - 0.12, -hd - 0.4 - o], [-hw - 0.4 - o, eave - 0.12, hd + 0.4 + o], [0, r - 0.02, hd + 0.4 + o], [0, r - 0.02, -hd - 0.4 - o], { colour: POLE_DARK, decor: true });
  sink.quad('structureWood', [hw + 0.4 + o, eave - 0.12, hd + 0.4 + o], [hw + 0.4 + o, eave - 0.12, -hd - 0.4 - o], [0, r - 0.02, -hd - 0.4 - o], [0, r - 0.02, hd + 0.4 + o], { colour: POLE_DARK, decor: true });
  for (const sz of [-1, 1]) sink.polygon('structureWood', sz > 0 ? [[-hw - 0.4, eave, hd + 0.4], [hw + 0.4, eave, hd + 0.4], [0, r - 0.1, hd + 0.4]] : [[hw + 0.4, eave, -hd - 0.4], [-hw - 0.4, eave, -hd - 0.4], [0, r - 0.1, -hd - 0.4]], { colour: shade(paint, 1.08) });
  // the turf's green lip along the eaves (dressing) and the door up its stair on the front
  for (const sx of [-1, 1]) sink.span('structureWood', sx * (hw + 0.4 + o) - 0.12, eave - 0.2, -hd - 0.9, sx * (hw + 0.4 + o) + 0.12, eave, hd + 0.9, { colour: shade(TURF, 1.15), decor: true });
  sink.quad('structureWood', [-0.4, floor + 0.05, hd + 0.02], [0.4, floor + 0.05, hd + 0.02], [0.4, floor + 1.8, hd + 0.02], [-0.4, floor + 1.8, hd + 0.02], { colour: TAR, decor: true });
  for (let s = 0; s < 4; s++) {
    const y0 = gTop + (floor - gTop) * s / 4;
    sink.span('structureWood', -0.5, y0 - 0.05, hd + 0.3 + (3 - s) * 0.3, 0.5, y0 + (floor - gTop) / 4, hd + 0.6 + (3 - s) * 0.3, { colour: POLE, decor: true });
  }
  return { parts: sink.finish() };
};
