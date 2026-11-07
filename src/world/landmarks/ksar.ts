// src/world/landmarks/ksar.ts — the Dahar's fortified granary and its saint's tomb (landmarks-271, 2026-11-06). Sirocco
// Wadi is the Dahar of southern Tunisia: the census (buildings-270 signature places) names the ghorfa ksar — barrel-
// vaulted granary cells stacked three and four high round a courtyard, their outside stairs and timber pegs (Ksar Ouled
// Soltane, Ksar Hadada) — and the white-domed marabout on its knoll, and found neither on the map.
//
// - ghorfaKsar: the courtyard ringed by columns of ghorfas, each column one to four vaults high (the skyline the
//   look stream draws), every vault's rounded end on the court with its low door, palm-wood lintel and pegs; the stair
//   ramps climbing the faces without rails; the single gate through the front range under its own vaults; the back walls
//   blind, the ksar's outer wall.
// - marabout: the saint's tomb — a whitewashed cube on its plinth, the drum and the egg dome, the low enclosure wall
//   round its graves and the gate in it.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink, in the map kit's render
// (no draw call of their own). The vaults' masses, the stairs and the walls are structure; the pegs, lintels and door
// planks are dressing.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const PALM = rgb(0x5a4632), DOOR = rgb(0x4a3a2a), DOOR_BLUE = rgb(0x3d5f7a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** The ksar's plan (plan.ts and the builder agree): the court and the ranges' depth. */
export function ksarLayout(p: Readonly<Record<string, number | string | boolean>>) {
  const cw = Math.max(16, Number(p.court)), cd = Math.max(12, Number(p.courtDepth)), D = Math.max(6, Number(p.cell));
  return { cw, cd, D, across: cw / 2 + D + 0.4, along: cd / 2 + D + 0.4 };
}

/**
 * One column of vaulted cells in a range, in the range's frame: x0..x1 along the range, the front (on the court) at
 * z = 0 and the back at z = -D, `tiers` vaults high, each `tier` tall. The column's mass with its vaulted top, and on
 * its front each vault's rounded end in a raised rim, its door, lintel and pegs.
 */
function ghorfaColumn(sink: PartSink, x0: number, x1: number, D: number, tiers: number, tier: number, foot: number, v: () => number,
  opts: { gate?: boolean } = {}): void {
  const w = x1 - x0, r = w / 2, cx = (x0 + x1) / 2, H = tiers * tier, n = 10;
  // (foot is relative to the column's own ground, which the caller has placed at y = 0)
  const wall: RegionalBucket = 'plaster';
  // the column's mass up to the springing of its top vault, then the vault's half barrel along z
  const spring = H - r * 0.8;
  if (opts.gate) {
    // the gate's passage through the range at ground level: its side walls and the vault over it
    for (const s of [-1, 1]) sink.span(wall, s > 0 ? x1 - 0.5 : x0, foot, -D, s > 0 ? x1 : x0 + 0.5, tier, 0, {});
    const arc: Vec3[] = [];
    for (let k = 0; k <= n; k++) { const a = Math.PI * k / n; arc.push([cx + Math.cos(a) * (r - 0.5), tier - 0.6 + Math.sin(a) * (r - 0.5) * 0.9, 0]); }
    for (let k = 0; k < n; k++) sink.quad(wall, [arc[k + 1][0], arc[k + 1][1], 0], [arc[k][0], arc[k][1], 0], [arc[k][0], arc[k][1], -D], [arc[k + 1][0], arc[k + 1][1], -D], { decor: true, shade: 0.7 });
    sink.span(wall, x0, tier, -D, x1, spring, 0, {});
  } else sink.span(wall, x0, foot, -D, x1, spring, 0, {});
  const top: Array<[number, number]> = [];
  for (let k = 0; k <= n; k++) { const a = Math.PI * k / n; top.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r * 0.8]); }
  for (let k = 0; k < n; k++) {
    const [ax, ay] = top[k], [bx, by] = top[k + 1];
    sink.quad(wall, [bx, by, 0], [ax, ay, 0], [ax, ay, -D], [bx, by, -D], {});
  }
  // the vault's two end faces (the front's on the court, the back's)
  const end = (z: number): Vec3[] => [[x0, spring, z], ...top.slice(0, -1).map(([x, y]): Vec3 => [x, y, z])];
  sink.polygon(wall, end(0), {});
  sink.polygon(wall, end(-D).reverse(), {});
  // each vault's front: the rim of its rounded end proud of the face (the stacked arches that make the ksar), its door
  for (let t = opts.gate ? 1 : 0; t < tiers; t++) {
    const yb = t * tier, ys = yb + tier - r * 0.8;
    const rim: Vec3[] = [[x0 + 0.08, yb + 0.05, 0.06]];
    for (let k = 0; k <= n; k++) { const a = Math.PI * (n - k) / n; rim.push([cx + Math.cos(a) * (r - 0.08), Math.min(ys + Math.sin(a) * (r - 0.08) * 0.8, yb + tier - 0.04), 0.06]); }
    rim.push([x1 - 0.08, yb + 0.05, 0.06]);
    for (let k = 0; k + 1 < rim.length; k++) bar(sink, wall, rim[k], rim[k + 1], 0.13, { decor: true, shade: 0.9 });
    // the low door off centre, its palm-wood lintel and the pegs (the stair's handholds) beside it
    const du = (v() - 0.5) * (w - 1.6) * 0.5, dw = 0.75, dh = Math.min(1.35, tier - 1.1);
    sink.span('dark', cx + du - dw / 2, yb + 0.3, 0.01, cx + du + dw / 2, yb + 0.3 + dh, 0.03, { decor: true });
    sink.span('structureWood', cx + du - dw / 2 - 0.2, yb + 0.3 + dh, -0.02, cx + du + dw / 2 + 0.2, yb + 0.45 + dh, 0.12, { colour: PALM, decor: true });
    if (v() < 0.45) sink.span('structureWood', cx + du - dw / 2 + 0.04, yb + 0.32, 0.03, cx + du + dw / 2 - 0.04, yb + 0.28 + dh, 0.07, { colour: v() < 0.3 ? DOOR_BLUE : DOOR, decor: true, fine: true });
    for (let k = 0; k < 2 + Math.floor(v() * 3); k++) {
      const px = x0 + 0.35 + v() * (w - 0.7), py = yb + 0.6 + v() * (tier - 1.2);
      if (Math.abs(px - (cx + du)) < dw / 2 + 0.15) continue;
      bar(sink, 'structureWood', [px, py, 0.0], [px, py - 0.04, 0.45], 0.07, { colour: PALM, decor: true, fine: true });
    }
  }
}

/**
 * A stair ramp against a range's front (the range's frame, front at z = 0): from the ground at u0 up to the door sill
 * at height h over u1, d deep, its treads stepped on the top (no rail, as the ksour have none).
 */
function stair(sink: PartSink, u0: number, u1: number, h: number, d: number): void {
  const wall: RegionalBucket = 'plaster', dir = Math.sign(u1 - u0), run = Math.abs(u1 - u0), steps = Math.max(4, Math.round(h / 0.28));
  // the solid wedge under the treads
  const a: Vec3 = [u0, 0, 0], b: Vec3 = [u1, h, 0];
  sink.polygon(wall, dir > 0 ? [[u0, 0, d], [u1, 0, d], [u1, h, d]] : [[u1, 0, d], [u0, 0, d], [u1, h, d]], {});
  sink.quad(wall, dir > 0 ? [u1, 0, d] : [u1, 0, 0], dir > 0 ? [u1, 0, 0] : [u1, 0, d], dir > 0 ? [u1, h, 0] : [u1, h, d], dir > 0 ? [u1, h, d] : [u1, h, 0], {});
  void a; void b;
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    const x0 = u0 + (u1 - u0) * t0, x1 = u0 + (u1 - u0) * t1, y = h * t1;
    sink.span(wall, Math.min(x0, x1), Math.max(0, y - h / steps - 0.02), 0, Math.max(x0, x1), y, d, {});
  }
  void run;
}

/**
 * The ghorfa ksar round its court (`court` x `courtDepth`), every range `cell` deep, columns `bay` wide, one to `tiers`
 * vaults high (the look stream draws each column's height, the gate range lower), the gate in the front range (+z).
 */
export const ghorfaKsar: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const { cw, cd, D } = ksarLayout(ctx.params);
  const bay = num(ctx, 'bay', 2.2, 4), tierH = num(ctx, 'tierHeight', 2.4, 3.6), maxT = Math.round(num(ctx, 'tiers', 2, 5));
  const foot = -0.6 - ctx.groundFall;
  // the four ranges in their own frames: front (+z, the gate's), back, left and right. Front and back span the court's
  // width plus the side ranges' depth (the corners are theirs); the sides run between them.
  type Range = { name: 'front' | 'back' | 'left' | 'right'; yaw: number; ox: number; oz: number; len: number; gate: boolean };
  const ranges: Range[] = [
    { name: 'front', yaw: Math.PI, ox: 0, oz: cd / 2, len: cw + 2 * D, gate: true },
    { name: 'back', yaw: 0, ox: 0, oz: -cd / 2, len: cw + 2 * D, gate: false },
    { name: 'left', yaw: Math.PI / 2, ox: -cw / 2, oz: 0, len: cd, gate: false },
    { name: 'right', yaw: -Math.PI / 2, ox: cw / 2, oz: 0, len: cd, gate: false },
  ];
  const bases: Record<Range['name'], number[]> = { front: [], back: [], left: [], right: [] };
  // the ground (over the piece's base) at a point of a range's frame, and a column's [front's ground, lowest ground]
  const groundAt = (range: Range, lx: number, lz: number): number => {
    const c = Math.cos(range.yaw), s = Math.sin(range.yaw);
    return ctx.ground?.(range.ox + lx * c + lz * s, range.oz - lx * s + lz * c) ?? 0;
  };
  const groundOf = (range: Range, x0: number, x1: number, d: number): [number, number] => {
    const front = Math.max(0, Math.min(groundAt(range, (x0 + x1) / 2, 0), groundAt(range, x0, 0), groundAt(range, x1, 0)));
    let low = front;
    for (const [lx, lz] of [[x0, 0], [x1, 0], [x0, -d], [x1, -d], [(x0 + x1) / 2, -d / 2]] as const) low = Math.min(low, groundAt(range, lx, lz));
    return [front, Math.max(0, low)];
  };
  for (const range of ranges) {
    const cols = Math.max(3, Math.round(range.len / bay)), b = range.len / cols;
    const gateCol = Math.floor(cols / 2);
    // (the range's frame: its front on the court at z = 0 facing +z, its back at -D; placed so the front faces in)
    sink.placed(range.yaw, range.ox, 0, range.oz, () => {
      let prev = 0;
      const heights: number[] = [];
      for (let c = 0; c < cols; c++) {
        // the skyline: neighbours differ by a tier at most, the corners and the gate range lower
        const corner = range.len > cw && (c === 0 || c === cols - 1);
        let t = 1 + Math.floor(v() * maxT);
        if (c > 0) t = Math.max(prev - 1, Math.min(prev + 1, t));
        if (range.gate) t = Math.min(t, maxT - 1);
        if (corner) t = Math.max(1, t - 1);
        if (range.gate && Math.abs(c - gateCol) <= 0) t = Math.max(2, t);
        heights.push(Math.max(1, Math.min(maxT, t)));
        prev = heights[c];
      }
      for (let c = 0; c < cols; c++) {
        const x0 = -range.len / 2 + c * b, x1 = x0 + b;
        // (the front and back ranges' end columns are the corners: their courtward fronts stand behind the side ranges)
        // each column on its own ground: seated at its front's ground (its doors never buried), its foot down to the
        // lowest ground under it, so a ksar on a slope steps up it as the hillside ksour do
        const [base, low] = groundOf(range, x0, x1, D);
        sink.placed(0, 0, base, 0, () => ghorfaColumn(sink, x0, x1, D, heights[c], tierH, foot + (low - base), v, { gate: range.gate && c === gateCol }));
        bases[range.name].push(base);
      }
      // the stair ramps up the court face: one per three or four columns, each to a second-tier door
      for (let c = 1; c + 1 < cols; c += 3 + Math.floor(v() * 2)) {
        if (heights[c] < 2 || (range.gate && Math.abs(c - gateCol) < 2)) continue;
        const x = -range.len / 2 + (c + 0.5) * b, up = Math.min(heights[c] - 1, 2) * tierH + 0.3, dir = v() < 0.5 ? -1 : 1;
        const foot0 = groundAt(range, x + dir * (up * 1.1 + 0.4), 0.5);
        sink.placed(0, 0, foot0, 0, () => stair(sink, x + dir * (up * 1.1 + 0.4), x + dir * 0.4, Math.max(1, up + bases[range.name][c] - foot0), 0.95));
      }
    });
  }
  // the court's floor: beaten earth with a threshing circle and a stone trough
  const g = (x: number, z: number): number => (ctx.ground?.(x, z) ?? 0) + 0.03;
  const nx = Math.ceil(cw / 3), nz = Math.ceil(cd / 3);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = -cw / 2 + cw * i / nx, xb = -cw / 2 + cw * (i + 1) / nx, za = cd / 2 - cd * j / nz, zb = cd / 2 - cd * (j + 1) / nz;
    sink.quad('stone', [xa, g(xa, za), za], [xb, g(xb, za), za], [xb, g(xb, zb), zb], [xa, g(xa, zb), zb], { decor: true, shade: 0.9, uv: { kind: 'world' } });
  }
  sink.placed(0, 0, g(0, -cd / 6), -cd / 6, () => revolve(sink, 'stone', 0, 0, [[3.2, 0.02], [3.2, 0.1], [2.9, 0.1], [0.001, 0.05]], 20, { decor: true, shade: 0.8 }));
  const ty = g(cw / 2 - 2.5, cd / 2 - 1.6);
  sink.span('stone', cw / 2 - 3.5, ty - 0.6, cd / 2 - 2.0, cw / 2 - 1.5, ty + 0.6, cd / 2 - 1.2, { shade: 0.85 });
  return { parts: sink.finish() };
};

/**
 * The marabout (a saint's koubba): a whitewashed cube (`size` square, `height` to its parapet) on a plinth, the
 * octagonal drum and the egg dome, a finial; the low wall of its enclosure (`yard` square) round its graves, the
 * gate in its front.
 */
export const marabout: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const S = num(ctx, 'size', 4, 9), H = num(ctx, 'height', 3, 6), Y = Math.max(S + 4, num(ctx, 'yard', S + 4, 30));
  const foot = -0.6 - ctx.groundFall, white: RegionalBucket = 'plaster3';
  sink.span('stone', -S / 2 - 0.4, foot, -S / 2 - 0.4, S / 2 + 0.4, 0.35, S / 2 + 0.4, { shade: 0.9 });
  sink.span(white, -S / 2, 0.35, -S / 2, S / 2, H, S / 2, {});
  // the parapet's merlons at the corners (the koubba's horns) and the door's arch on the front
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span(white, sx * S / 2 - (sx > 0 ? 0.7 : 0), H, sz * S / 2 - (sz > 0 ? 0.7 : 0), sx * S / 2 + (sx < 0 ? 0.7 : 0), H + 0.75, sz * S / 2 + (sz < 0 ? 0.7 : 0), {});
  sink.span('dark', -0.55, 0.35, S / 2 + 0.005, 0.55, 2.3, S / 2 + 0.02, { decor: true });
  const arc: Vec3[] = [];
  for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; arc.push([Math.cos(a) * 0.55, 2.3 + Math.sin(a) * 0.5, S / 2 + 0.012]); }
  sink.polygon('dark', [...arc], { decor: true });
  sink.span('structureWood', -0.5, 0.36, S / 2 + 0.02, 0.5, 2.25, S / 2 + 0.06, { colour: v() < 0.6 ? rgb(0x2f6b4f) : DOOR_BLUE, decor: true });
  // the drum and the egg dome
  const dr = S * 0.36, n = 18;
  revolve(sink, white, 0, 0, [[S * 0.42, H - 0.01], [S * 0.42, H + 0.25], [dr, H + 0.25], [dr, H + 1.0]], 8, {}, Math.PI / 8);
  const dome: Array<[number, number]> = [];
  for (let k = 0; k <= 8; k++) { const a = (Math.PI / 2) * k / 8; dome.push([Math.max(0.001, Math.cos(a) * dr * (1 + 0.12 * Math.sin(a * 2))), H + 1.0 + Math.sin(a) * dr * 1.25]); }
  revolve(sink, white, 0, 0, dome, n, {});
  bar(sink, 'structureMetal', [0, H + 1.0 + dr * 1.25, 0], [0, H + 2.0 + dr * 1.25, 0], 0.06, { colour: rgb(0x8a7a4a), decor: true });
  for (const y of [H + 1.55 + dr * 1.25, H + 1.8 + dr * 1.25]) revolve(sink, 'structureMetal', 0, 0, [[0.001, y - 0.12], [0.13, y], [0.001, y + 0.12]], 8, { colour: rgb(0x8a7a4a), decor: true });
  // the enclosure wall round the graves, its gate on the front, the graves' low stones
  const t = 0.4, h = 1.1, y0 = Y / 2;
  const segs: Array<[number, number, number, number]> = [[-y0, -y0, y0, -y0 + t], [-y0, -y0, -y0 + t, y0], [y0 - t, -y0, y0, y0], [-y0, y0 - t, -1.0, y0], [1.0, y0 - t, y0, y0]];
  for (const [x0, z0, x1, z1] of segs) {
    sink.span(white, x0, foot, z0, x1, h, z1, {});
    sink.span(white, x0 - 0.05, h, z0 - 0.05, x1 + 0.05, h + 0.12, z1 + 0.05, { decor: true, shade: 0.92 });
  }
  for (const s of [-1, 1]) sink.span(white, s * 1.0 - 0.3, foot, y0 - 0.5, s * 1.0 + 0.3, 1.7, y0 + 0.1, {});
  for (let k = 0; k < 9; k++) {
    const gx = (v() - 0.5) * (Y - 2.5), gz = (v() - 0.5) * (Y - 2.5);
    if (Math.abs(gx) < S / 2 + 1 && Math.abs(gz) < S / 2 + 1) continue;
    const o: EmitOptions = { decor: true, shade: 0.85 + v() * 0.12 };
    sink.span(white, gx - 0.3, 0, gz - 0.9, gx + 0.3, 0.25, gz + 0.9, o);
    sink.span(white, gx - 0.12, 0, gz - 0.95, gx + 0.12, 0.6, gz - 0.8, o);
  }
  return { parts: sink.finish(), tints: { plaster3: [1.06, 1.06, 1.05] } };
};

void shade;
