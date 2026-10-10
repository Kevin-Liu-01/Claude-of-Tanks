// src/world/landmarks/virginLands.ts — the Virgin Lands' field works (the map-content lane, 2026-10-09; the census:
// Tarkhan Steppe's open steppe the emptiest ground after Whiteout and the mine): what the Komsomol campaign of 1954-60
// stood on the Kazakh steppe round a new grain sovkhoz in 1958 — the volunteers' tent camp in its rows, the field
// brigade's wagon-house on its skids, the threshing floor (tok) with its grain heaped in long ridges, and the herders'
// yurts with their felt over the lattice wall.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink:
// it merges into the props' material buckets. The tents are the props' own canvas tents (a hull flattens them).
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import { drapedRect } from './grounds.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const PLANK = rgb(0x7a6a52), PLANK_DARK = rgb(0x4e4436), IRON = rgb(0x2c2d2e), RED = rgb(0x9a2c22), GRAIN = rgb(0xc9a75e);
const FELT = rgb(0xd9cdb4), FELT_DARK = rgb(0x8a7a62), LATTICE = rgb(0x8a5a34), TARP = rgb(0x5a5e46);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------------------------------------------------ tent camp

/**
 * The volunteers' tent camp: the props' canvas tents in rows along a camp street (a hull flattens them), the flag on its
 * pole at the street's head and the field kitchen's stove beside it. All dressing but the flagpole's footing.
 */
export const tentCamp: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rows = Math.round(num(ctx, 'rows', 1)), per = Math.round(num(ctx, 'tents', 1)), pitch = 5.2;
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < per; k++) {
    const x = (r - (rows - 1) / 2) * 9, z = (k - (per - 1) / 2) * pitch;
    destructibles.push({ kind: 'tent', x: x + (r % 2 ? 1.5 : -1.5), z, yawDeg: r % 2 ? -90 : 90 });
  }
  // the flag at the street's head
  const fz = (per / 2) * pitch + 3, g = ctx.ground?.(0, fz) ?? 0;
  sink.span('stone', -0.3, Math.min(g - 0.6, -0.6), fz - 0.3, 0.3, g + 0.2, fz + 0.3);
  bar(sink, 'structureMetal', [0, g + 0.2, fz], [0, g + 8, fz], 0.08, { colour: IRON });
  sink.quad('structureMetal', [0.05, g + 6.6, fz], [1.9, g + 6.7, fz], [1.9, g + 7.8, fz], [0.05, g + 7.9, fz], { colour: RED, decor: true });
  sink.quad('structureMetal', [1.9, g + 6.7, fz], [0.05, g + 6.6, fz], [0.05, g + 7.9, fz], [1.9, g + 7.8, fz], { colour: shade(RED, 0.75), decor: true });
  // the field kitchen: its stove and chimney on a little cart
  const kx = 4, kg = ctx.ground?.(kx, fz) ?? 0;
  sink.span('structureMetal', kx - 0.7, kg, fz - 1.1, kx + 0.7, kg + 1.3, fz + 1.1, { colour: shade(TARP, 0.9) });
  sink.cylinder('structureMetal', [kx, kg + 1.3, fz + 0.5], 'y', 1.5, 0.1, 6, { colour: IRON, decor: true });
  return { parts: sink.finish(), destructibles };
};

// ---------------------------------------------------------------------------------------------------------- field wagon

/**
 * The field brigade's wagon-house (a vagonchik): a plank house on runners where the tractor drivers slept at the far
 * fields, its door and steps at one end, two small windows a side, the stovepipe through the roof, the iron hitch.
 */
export const fieldWagon: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 4), W = 2.6, H = 2.4, hl = L / 2, hw = W / 2;
  const paint = lerp(PLANK, rgb(0x5d6b4a), ctx.variant() * 0.6);
  // the runners and the floor frame
  for (const sx of [-1, 1]) sink.span('structureWood', sx * (hw - 0.25) - 0.12, -0.2 - ctx.groundFall, -hl - 0.4, sx * (hw - 0.25) + 0.12, 0.35, hl + 0.2, { colour: PLANK_DARK });
  sink.span('structureWood', -hw, 0.35, -hl, hw, 0.5, hl, { colour: PLANK_DARK });
  // the body, its pitched roof (a shallow gable along z)
  sink.span('structureWood', -hw, 0.5, -hl, hw, H, hl, { colour: paint });
  sink.quad('roof', [-hw - 0.15, H, hl + 0.15], [-hw - 0.15, H, -hl - 0.15], [0, H + 0.45, -hl - 0.15], [0, H + 0.45, hl + 0.15]);
  sink.quad('roof', [hw + 0.15, H, -hl - 0.15], [hw + 0.15, H, hl + 0.15], [0, H + 0.45, hl + 0.15], [0, H + 0.45, -hl - 0.15]);
  sink.polygon('structureWood', [[-hw, H, hl], [hw, H, hl], [0, H + 0.45, hl]], { colour: paint });
  sink.polygon('structureWood', [[hw, H, -hl], [-hw, H, -hl], [0, H + 0.45, -hl]], { colour: paint });
  // the plank seams (fine), the door and steps on the front end, the windows
  for (let k = 1; k < 6; k++) {
    const y = 0.5 + k * (H - 0.5) / 6;
    for (const sx of [-1, 1]) sink.span('structureWood', sx * hw - 0.015, y - 0.015, -hl, sx * hw + 0.015, y + 0.015, hl, { colour: shade(paint, 0.75), decor: true, fine: true });
  }
  sink.quad('structureWood', [-0.45, 0.55, hl + 0.02], [0.45, 0.55, hl + 0.02], [0.45, 2.15, hl + 0.02], [-0.45, 2.15, hl + 0.02], { colour: PLANK_DARK, decor: true });
  sink.span('structureWood', -0.5, 0.0, hl, 0.5, 0.3, hl + 0.5, { colour: PLANK_DARK, decor: true });
  for (const sx of [-1, 1]) for (const z of [-hl * 0.45, hl * 0.25]) {
    const x = sx * (hw + 0.02);
    const pts: Vec3[] = sx > 0 ? [[x, 1.3, z + 0.35], [x, 1.3, z - 0.35], [x, 1.85, z - 0.35], [x, 1.85, z + 0.35]] : [[x, 1.3, z - 0.35], [x, 1.3, z + 0.35], [x, 1.85, z + 0.35], [x, 1.85, z - 0.35]];
    sink.polygon('glass', pts, { decor: true });
  }
  sink.cylinder('structureMetal', [hw * 0.4, H + 0.2, -hl * 0.5], 'y', 1.0, 0.08, 6, { colour: IRON, decor: true });
  bar(sink, 'structureMetal', [0, 0.3, -hl - 0.4], [0, 0.3, -hl - 1.3], 0.1, { colour: IRON, decor: true });
  return { parts: sink.finish() };
};

// -------------------------------------------------------------------------------------------------------- threshing floor

/**
 * The threshing floor (tok): a beaten, swept floor draped on the ground, the threshed grain heaped in long ridges along it,
 * one ridge under its tarpaulin, the winnowing machine's frame at the end. The ridges are low dressing a hull drives over.
 */
export const threshingFloor: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 10), W = num(ctx, 'width', 8), ridges = Math.max(1, Math.round(Number(ctx.params.ridges)));
  drapedRect(sink, 'plaster3', ctx.ground, { cx: 0, cz: 0, hw: W / 2, hd: L / 2 }, { lift: 0.04, cell: 3 });
  for (let r = 0; r < ridges; r++) {
    const x = -W / 2 + (r + 0.5) * W / ridges, tarp = r === ridges - 1;
    const len = L * (0.7 + 0.2 * ctx.rng()), h = 1.1 + 0.4 * ctx.rng(), half = Math.min(W / ridges / 2 - 0.4, h * 1.4);
    const g0 = ctx.ground?.(x, -len / 2) ?? 0, g1 = ctx.ground?.(x, len / 2) ?? 0;
    const tone = tarp ? TARP : lerp(GRAIN, rgb(0xb08a46), ctx.variant() * 0.5);
    // a ridge: a triangular prism along z, its ends sloping down
    const A: Vec3 = [x - half, g0 + 0.03, -len / 2 + h], B: Vec3 = [x + half, g0 + 0.03, -len / 2 + h], T0: Vec3 = [x, g0 + h, -len / 2 + h];
    const C: Vec3 = [x - half, g1 + 0.03, len / 2 - h], D: Vec3 = [x + half, g1 + 0.03, len / 2 - h], T1: Vec3 = [x, g1 + h, len / 2 - h];
    const E0: Vec3 = [x, g0 + 0.03, -len / 2], E1: Vec3 = [x, g1 + 0.03, len / 2];
    sink.quad('structureMetal', A, C, T1, T0, { colour: shade(tone, 0.92), decor: true });
    sink.quad('structureMetal', D, B, T0, T1, { colour: tone, decor: true });
    sink.polygon('structureMetal', [B, A, E0], { colour: shade(tone, 0.8), decor: true });
    sink.polygon('structureMetal', [A, T0, E0], { colour: shade(tone, 0.85), decor: true });
    sink.polygon('structureMetal', [T0, B, E0], { colour: shade(tone, 0.95), decor: true });
    sink.polygon('structureMetal', [C, D, E1], { colour: shade(tone, 0.8), decor: true });
    sink.polygon('structureMetal', [T1, C, E1], { colour: shade(tone, 0.85), decor: true });
    sink.polygon('structureMetal', [D, T1, E1], { colour: shade(tone, 0.95), decor: true });
  }
  // the winnowing machine at the floor's end: its frame and hopper (a small solid)
  const g = ctx.ground?.(0, L / 2 + 1.5) ?? 0;
  sink.span('structureWood', -1.0, g, L / 2 + 0.8, 1.0, g + 1.6, L / 2 + 2.2, { colour: rgb(0x4a5a7a) });
  sink.span('structureWood', -0.6, g + 1.6, L / 2 + 1.0, 0.6, g + 2.2, L / 2 + 2.0, { colour: PLANK_DARK });
  return { parts: sink.finish(), tints: { plaster3: [0.78, 0.7, 0.56] } };
};

// ----------------------------------------------------------------------------------------------------------------- yurt

/**
 * A herders' yurt (kiyiz uy): the lattice wall (kerege) under its felt, the felt roof rising to the crown ring (shanyrak)
 * with its smoke hole, the bands round the felt, the painted wooden door to the south (+z).
 */
export const yurt: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = num(ctx, 'radius', 2), wall = 1.6, felt = lerp(FELT, rgb(0xc4b494), ctx.variant() * 0.6);
  sink.span('stone', -R - 0.1, -0.4 - ctx.groundFall, -R - 0.1, R + 0.1, 0.06, R + 0.1, { decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[R, 0.06], [R, wall], [R * 0.22, wall + R * 0.55], [R * 0.2, wall + R * 0.58]], 16, { colour: felt });
  // the crown ring and the smoke hole's cover
  revolve(sink, 'structureMetal', 0, 0, [[R * 0.22, wall + R * 0.58], [R * 0.24, wall + R * 0.66], [0.01, wall + R * 0.7]], 10, { colour: LATTICE, decor: true });
  // the bands round the felt (fine) and the darker skirt at its foot
  for (const y of [wall * 0.35, wall * 0.75]) revolve(sink, 'structureMetal', 0, 0, [[R + 0.02, y], [R + 0.02, y + 0.1]], 16, { colour: shade(LATTICE, 0.8), decor: true, fine: true });
  revolve(sink, 'structureMetal', 0, 0, [[R + 0.03, 0.06], [R + 0.03, 0.4]], 16, { colour: FELT_DARK, decor: true });
  // the door to the south, its painted frame
  sink.span('structureWood', -0.5, 0.06, R - 0.05, 0.5, 1.45, R + 0.08, { colour: RED });
  sink.quad('structureWood', [-0.38, 0.1, R + 0.09], [0.38, 0.1, R + 0.09], [0.38, 1.35, R + 0.09], [-0.38, 1.35, R + 0.09], { colour: rgb(0x2f4a7a), decor: true });
  return { parts: sink.finish() };
};
