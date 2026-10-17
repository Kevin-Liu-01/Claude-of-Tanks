// src/world/landmarks/fjordWorks.ts — a Nordland fjord farm's and fishing village's works (the map-content lane,
// 2026-10-10; the owner: Nordhavn "very bare"): what stood round Bjerkvik at the head of the Herjangsfjord in May 1940 —
// the hay racks (hesjer) strung across the infields, the stockfish racks (hjeller) on the shore and the headlands with the
// cod hung in pairs to dry, and the stabbur, the farm's storehouse raised on its posts.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink:
// it merges into the props' material buckets. Long pieces follow the ground (plan.ts drapes): each post foots on the
// ground under it.
import { PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const POLE = rgb(0x6a5a46), POLE_DARK = rgb(0x4a3e30), HAY = rgb(0xa89a5a), HAY_DRY = rgb(0x8c7c46), FISH = rgb(0xb8ad94);
const FISH_DARK = rgb(0x8a7e66), TAR = rgb(0x2e2a26), RED_OCHRE = rgb(0x7a2e22), TURF = rgb(0x4e5a34);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * A round pole from a to b (the maps lane, 2026-10-16; the LOOKS r2 sweep: the racks' poles were plain boxes): a
 * six-sided prism of radius r round the line, its ends closed — a peeled spruce pole, not a sawn post.
 */
function pole(sink: PartSink, a: Vec3, b: Vec3, r: number, opts: EmitOptions): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const ref: Vec3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const u0 = cr(ax, ref), ul = Math.hypot(u0[0], u0[1], u0[2]), u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul], v = cr(ax, u);
  const ring = (c: Vec3): Vec3[] => Array.from({ length: 6 }, (_, k) => {
    const t = (k / 6) * Math.PI * 2, cu = Math.cos(t) * r, cv = Math.sin(t) * r;
    return [c[0] + u[0] * cu + v[0] * cv, c[1] + u[1] * cu + v[1] * cv, c[2] + u[2] * cu + v[2] * cv];
  });
  const A = ring(a), B = ring(b);
  for (let k = 0; k < 6; k++) { const j = (k + 1) % 6; sink.quad('structureWood', A[k], A[j], B[j], B[k], opts); }
  sink.polygon('structureWood', [...A].reverse(), opts);
  sink.polygon('structureWood', B, opts);
}

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
    pole(sink, [x, y - 0.4, 0], [x, y + H + 0.15, 0], 0.05, { colour: POLE, decor: true });
  }
  for (const e of [-1, 1]) {
    const x = e * L / 2, y = g(x);
    pole(sink, [x, y + H * 0.8, 0], [x + e * 1.1, y - 0.2, 0], 0.035, { colour: POLE_DARK, decor: true, fine: true });
  }
  // the hay hung on the wires: per bay, a ridge of bundles on each face, the tone varying bay by bay
  for (let k = 0; k < n; k++) {
    const x0 = -L / 2 + k * step + 0.06, x1 = x0 + step - 0.12, y0 = g(x0), y1 = g(x1);
    const tone = lerp(HAY, HAY_DRY, ctx.variant());
    const top0 = y0 + H, top1 = y1 + H, foot0 = y0 + 0.35, foot1 = y1 + 0.35;
    // (the maps lane, 2026-10-16; the LOOKS r2 sweep: each bay's hay a plain wedge) the hay bellies out over the wires: on
    // each face a foot, a belly a third up standing out past the foot, the shoulder under the top wire, the top's ridge;
    // the bay's cut ends close it
    const rows = (foot: number, top: number) => [[foot, 0.42], [foot + (top - foot) * 0.34, 0.47], [foot + (top - foot) * 0.78, 0.26], [top, 0.05]] as const;
    const at = (x: number, y: number, z: number): Vec3 => [x, y, z];
    const r0 = rows(foot0, top0), r1 = rows(foot1, top1);
    for (const sz of [-1, 1]) for (let i = 0; i + 1 < r0.length; i++) {
      const a = at(x0, r0[i][0], sz * r0[i][1]), b = at(x1, r1[i][0], sz * r1[i][1]), c = at(x1, r1[i + 1][0], sz * r1[i + 1][1]), d = at(x0, r0[i + 1][0], sz * r0[i + 1][1]);
      const c0 = shade(tone, (sz > 0 ? 1 : 0.82) * (0.92 + 0.08 * i));
      sink.polygon('structureWood', sz > 0 ? [a, b, c, d] : [b, a, d, c], { colour: c0, decor: true });
    }
    sink.quad('structureWood', [x0, top0, -0.05], [x1, top1, -0.05], [x1, top1, 0.05], [x0, top0, 0.05], { colour: shade(tone, 1.05), decor: true });
    // (the bundles' cut ends, facing out along the rack: the building-integrity gate saw into the bay through them)
    const end = (x: number, r: typeof r0, out: number) => {
      const ring: Vec3[] = [...r.map(([y, z]) => at(x, y, z)), ...[...r].reverse().map(([y, z]) => at(x, y, -z))];
      // (the ring as listed faces -x)
      sink.polygon('structureWood', out < 0 ? ring : [...ring].reverse(), { colour: shade(tone, 0.9), decor: true });
    };
    end(x0, r0, -1);
    end(x1, r1, 1);
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
  // (the maps lane, 2026-10-16; the LOOKS r2 sweep: the frames' poles plain boxes, the cod flat quads) the A-frames of
  // round spruce poles, sunk at their feet, meeting at the ridge pole
  const footY = base - 0.5;
  for (let k = 0; k <= n; k++) {
    const x = -L / 2 + k * step;
    for (const sz of [-1, 1]) {
      const y = g(x, sz * half);
      pole(sink, [x, Math.min(y - 0.5, footY), sz * half], [x, top, 0], 0.07, { colour: POLE });
    }
  }
  pole(sink, [-L / 2 - 0.3, top - 0.05, 0], [L / 2 + 0.3, top - 0.05, 0], 0.06, { colour: POLE_DARK });
  for (const f of [0.45, 0.75]) for (const sz of [-1, 1]) {
    // each rail lashed across the frames on their legs' line (at its height the legs stand this far out)
    const y = top - H * (1 - f) * 0.9, z = sz * half * (top - y) / (top - footY);
    pole(sink, [-L / 2 - 0.1, y, z], [L / 2 + 0.1, y, z], 0.035, { colour: POLE_DARK, decor: true });
    // the cod in pairs over the rail, tied at the tails: the tie lies over the rail, a fish hangs each side of it — head
    // down, the body widest a little below the tail — both faces of each (the outer in the fish's tone)
    const pairs = Math.round(L / 0.35);
    for (let p = 0; p < pairs; p++) {
      if (ctx.rng() < 0.12) continue;
      const x = -L / 2 + (p + 0.5) * (L / pairs), drop = 0.75 + 0.2 * ctx.rng();
      const tone = lerp(FISH, FISH_DARK, Math.abs(x) / (L / 2) * 0.6 + ctx.variant() * 0.3);
      const yt = y + 0.04, fine = p % 2 === 1;
      const outline = (zz: number): Vec3[] => [[x - 0.04, yt, zz], [x - 0.075, y - drop * 0.45, zz], [x, y - drop, zz],
        [x + 0.075, y - drop * 0.45, zz], [x + 0.04, yt, zz]];
      const front = outline(z + 0.04), back = outline(z - 0.04);
      // (each outline as listed faces +z)
      const plusZ = sz > 0 ? tone : shade(tone, 0.85), minusZ = sz > 0 ? shade(tone, 0.85) : tone;
      sink.polygon('structureWood', front, { colour: plusZ, decor: true, fine });
      sink.polygon('structureWood', [...front].reverse(), { colour: minusZ, decor: true, fine });
      sink.polygon('structureWood', [...back].reverse(), { colour: minusZ, decor: true, fine });
      sink.polygon('structureWood', back, { colour: plusZ, decor: true, fine });
      // the tie over the rail, joining the tails (up and down faces)
      const tie: Vec3[] = [back[0], front[0], front[4], back[4]];
      sink.polygon('structureWood', tie, { colour: shade(tone, 0.8), decor: true, fine });
      sink.polygon('structureWood', [...tie].reverse(), { colour: shade(tone, 0.8), decor: true, fine });
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
    pole(sink, [x, y + 0.3, z], [x, floor, z], 0.15, { colour: POLE_DARK });
  }
  // the lower log storey, the upper one jutting 0.4 m, the turf roof
  sink.span('structureWood', -hw, floor, -hd, hw, floor + 2.0, hd, { colour: paint });
  sink.span('structureWood', -hw - 0.4, floor + 2.0, -hd - 0.4, hw + 0.4, eave, hd + 0.4, { colour: shade(paint, 1.08) });
  for (let y = floor + 0.25; y < eave - 0.1; y += 0.25) for (const sx of [-1, 1]) {
    const w = y > floor + 2 ? hw + 0.42 : hw + 0.02;
    sink.span('structureWood', sx * w - 0.02, y - 0.02, -(y > floor + 2 ? hd + 0.4 : hd), sx * w + 0.02, y + 0.02, y > floor + 2 ? hd + 0.4 : hd, { colour: shade(paint, 0.8), decor: true, fine: true });
  }
  // the turf roof (sod over birch bark), in the vertex-coloured timber bucket: a map without a regional kit merges its
  // plain roof bucket without a tint record, and the sod is no tile anyway. (The maps lane, 2026-10-16; the
  // building-integrity gate: the roof's quads stood 0.5 m clear of the walls, wound inward, open at their edges.) Two
  // closed slabs whose undersides rest on the upper storey's eaves and meet the gables' rakes, the ridge over the middle;
  // sod on top, the bark-dark boards beneath.
  const A = hw + 0.4, B = hd + 0.4, o = 0.5, r = eave + 1.5, k = (r - eave) / A, X = A + o, Z = B + o, yl = eave - k * o, t = 0.12;
  const under = (x: number) => eave + k * (A - Math.abs(x));
  const roofColour = (top: Rgb) => (q: Vec3): Rgb => (q[1] > under(q[0]) + t / 2 ? top : POLE_DARK);
  sink.prism('structureWood', [[-X, yl, -Z], [-X, yl, Z], [0, r, Z], [0, r, -Z]], [0, 1, 0], t, { colourAt: roofColour(TURF) });
  sink.prism('structureWood', [[X, yl, Z], [X, yl, -Z], [0, r, -Z], [0, r, Z]], [0, 1, 0], t, { colourAt: roofColour(shade(TURF, 0.85)) });
  // the gables under the rakes: from the eaves' corners up the roof's underside to its apex
  for (const sz of [-1, 1]) sink.polygon('structureWood', sz > 0 ? [[-A, eave, B], [A, eave, B], [0, r, B]] : [[A, eave, -B], [-A, eave, -B], [0, r, -B]], { colour: shade(paint, 1.08) });
  // the turf's green lip along the eaves (dressing) and the door up its stair on the front
  for (const sx of [-1, 1]) sink.span('structureWood', sx * X - 0.12, yl + 0.06, -Z, sx * X + 0.12, yl + t + 0.18, Z, { colour: shade(TURF, 1.15), decor: true });
  // the door (the maps lane, 2026-10-16; the LOOKS r2 sweep: a dark plate laid on the logs): a leaf of weathered boards
  // in its frame — jambs and a head proud of the logs, the leaf 3 cm back in them, its ledges and the iron strap hinges
  const df = { colour: POLE_DARK, decor: true };
  for (const sx of [-1, 1]) sink.span('structureWood', sx * 0.47 - 0.07, floor + 0.05, hd, sx * 0.47 + 0.07, floor + 1.92, hd + 0.08, df);
  sink.span('structureWood', -0.54, floor + 1.8, hd, 0.54, floor + 1.94, hd + 0.08, df);
  sink.span('structureWood', -0.4, floor + 0.05, hd, 0.4, floor + 1.8, hd + 0.05, { colour: POLE, decor: true });
  for (const y of [floor + 0.35, floor + 1.45]) {
    sink.span('structureWood', -0.38, y - 0.06, hd + 0.05, 0.38, y + 0.06, hd + 0.08, { colour: shade(POLE, 0.85), decor: true, fine: true });
    sink.span('structureMetal', -0.36, y - 0.02, hd + 0.08, 0.05, y + 0.02, hd + 0.095, { colour: TAR, decor: true, fine: true });
  }
  for (let s = 0; s < 4; s++) {
    const y0 = gTop + (floor - gTop) * s / 4;
    sink.span('structureWood', -0.5, y0 - 0.05, hd + 0.3 + (3 - s) * 0.3, 0.5, y0 + (floor - gTop) / 4, hd + 0.6 + (3 - s) * 0.3, { colour: POLE, decor: true });
  }
  return { parts: sink.finish() };
};
