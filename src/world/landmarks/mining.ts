// src/world/landmarks/mining.ts — a mine's works (the map-content lane, 2026-10-09; owner: "some maps like whiteout
// crossing and mesa mines look unfinished and so empty"): the steel poppet headframe over its shaft with the winding
// house behind it, the truck-loading ore bin on its legs, the inclined conveyor gallery on its bents from a tail house to
// a head tower, and a string of side-tipping ore cars behind a little diesel on a narrow-gauge spur.
//
// Reference: the Mount Lyell Mining and Railway Company's works at Queenstown, Tasmania, as they stood in the 1970s: the
// North Lyell and Prince Lyell shafts' steel headframes (some 20 m to the sheaves) with their corrugated-iron winding
// houses, the ore bins and the conveyors that carried the ore from the crusher to the concentrator, and the 3 ft 6 in
// gauge cars of the company's railway. Paint: red oxide on the steel, galvanised and rusting corrugated iron.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink,
// so it merges into the props' material buckets: no draw call of its own. Lattice, ropes, rails and rungs are dressing;
// the legs, the bodies and the footings are structure.
import type { SimpleCollisionShape } from '../collision.ts';
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const RUST = rgb(0x6e3a24);
const IRON = rgb(0x2c2d2e), ORE = rgb(0x7a4a32), TIMBER = rgb(0x6a5644), CREAM = rgb(0xd6cfbd), YELLOW = rgb(0xc8a83a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));
const rusting = (base: Rgb, y0: number, y1: number, k = 0.3) => (p: Vec3): Rgb => {
  const t = Math.min(1, Math.max(0, (p[1] - y0) / Math.max(0.01, y1 - y0)));
  return lerp(lerp(base, RUST, k), base, Math.sqrt(t));
};

/**
 * A narrow-gauge spur with its ore cars: the ballast bed, the sleepers and the rails along z, a string of side-tipping
 * V-skip cars on their frames and wheels, and the little four-wheeled diesel at the head (+z).
 */
export const oreCars: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const n = Math.round(num(ctx, 'cars', 1)), gauge = num(ctx, 'gauge', 0.6), pitch = 3.0;
  const len = n * pitch + 4.6, z0 = -len / 2;
  // (the track lies on the ground in short lengths — plan.ts drapes — and each car and the diesel stand level on it)
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const zA = z0 - 1.5, zB = -z0 + 1.5, segs = Math.max(2, Math.ceil((zB - zA) / 3));
  const track = (z: number) => gl(0, z);
  for (let k = 0; k < segs; k++) {
    const a = zA + ((zB - zA) * k) / segs, b = zA + ((zB - zA) * (k + 1)) / segs, ga = track(a), gb = track(b);
    sink.span('stone', -1.2, Math.min(ga, gb) - 0.4, a, 1.2, Math.max(ga, gb) + 0.2, b, { decor: true });
    for (const sx of [-1, 1]) bar(sink, 'structureMetal', [sx * gauge / 2, ga + 0.38, a], [sx * gauge / 2, gb + 0.38, b], 0.08, { colour: IRON, decor: true });
  }
  // (the connectivity sweep, 217: the rails stood 2 cm over the sleepers) the sleepers up to the rails' foot
  for (let z = zA + 0.3; z <= zB - 0.3; z += 0.7) { const g = track(z); sink.span('structureWood', -0.95, g + 0.2, z - 0.1, 0.95, g + 0.345, z + 0.1, { colour: TIMBER, decor: true, fine: true }); }
  // the cars
  for (let k = 0; k < n; k++) {
    const cz = z0 + 1.2 + (k + 0.5) * pitch, tone = lerp(ORE, RUST, ctx.variant() * 0.6);
    const rail = Math.max(track(cz - 1.0), track(cz + 1.0), track(cz)) + 0.42;
    sink.span('structureMetal', -0.75, rail + 0.35, cz - 1.15, 0.75, rail + 0.6, cz + 1.15, { colour: IRON });
    // the V-skip: two sloped sides meeting at a keel, the end plates, the ore heaped in it
    const yk = rail + 0.75, yt = rail + 1.75, w = 0.95;
    sink.quad('structureMetal', [w, yt, cz - 1.0], [w, yt, cz + 1.0], [0, yk, cz + 1.0], [0, yk, cz - 1.0], { colour: tone });
    sink.quad('structureMetal', [-w, yt, cz + 1.0], [-w, yt, cz - 1.0], [0, yk, cz - 1.0], [0, yk, cz + 1.0], { colour: tone });
    for (const e of [-1, 1]) {
      const pts: Vec3[] = [[-w, yt, cz + e * 1.0], [0, yk, cz + e * 1.0], [w, yt, cz + e * 1.0]];
      sink.polygon('structureMetal', e > 0 ? pts : [...pts].reverse(), { colour: shade(tone, 0.8) });
    }
    sink.span('structureMetal', -0.12, rail + 0.6, cz - 0.9, 0.12, yk + 0.02, cz + 0.9, { colour: IRON });
    sink.polygon('structureMetal', [[-w + 0.1, yt - 0.05, cz + 0.9], [w - 0.1, yt - 0.05, cz + 0.9], [w - 0.1, yt - 0.05, cz - 0.9], [-w + 0.1, yt - 0.05, cz - 0.9]], { colour: ORE, decor: true });
    // the wheels down to the rails and the couplers
    for (const wz of [-0.7, 0.7]) for (const sx of [-1, 1]) {
      const g = track(cz + wz) + 0.42;
      sink.cylinder('structureMetal', [sx * gauge / 2 - (sx > 0 ? 0 : 0.1), g + 0.22, cz + wz], 'x', 0.1, 0.22, 8, { colour: IRON, decor: true });
      bar(sink, 'structureMetal', [sx * gauge / 2 - 0.05, g + 0.22, cz + wz], [sx * gauge / 2 - 0.05, rail + 0.36, cz + wz], 0.08, { colour: IRON, decor: true });
    }
    sink.span('structureMetal', -0.1, rail + 0.38, cz + 1.15, 0.1, rail + 0.52, cz + 1.5, { colour: IRON, decor: true });
  }
  // the diesel at the head: frame, hood, cab, its stack
  const lz = -z0 - 2.0, rail = Math.max(track(lz - 1.6), track(lz + 1.6), track(lz)) + 0.42;
  sink.span('structureMetal', -0.85, rail + 0.3, lz - 1.6, 0.85, rail + 0.65, lz + 1.6, { colour: IRON });
  sink.span('structureMetal', -0.6, rail + 0.65, lz - 0.2, 0.6, rail + 1.6, lz + 1.5, { colourAt: rusting(YELLOW, rail + 0.65, rail + 1.6, 0.3) });
  sink.span('structureMetal', -0.8, rail + 0.65, lz - 1.55, 0.8, rail + 2.4, lz - 0.3, { colourAt: rusting(YELLOW, rail + 0.65, rail + 2.4, 0.25) });
  sink.span('structureMetal', -0.9, rail + 2.4, lz - 1.65, 0.9, rail + 2.5, lz - 0.2, { colour: IRON });
  for (const sx of [-1, 1]) sink.quad('glass', [sx * 0.81, rail + 1.6, lz - (sx > 0 ? 1.4 : 0.45)], [sx * 0.81, rail + 1.6, lz - (sx > 0 ? 0.45 : 1.4)],
    [sx * 0.81, rail + 2.2, lz - (sx > 0 ? 0.45 : 1.4)], [sx * 0.81, rail + 2.2, lz - (sx > 0 ? 1.4 : 0.45)], { decor: true });
  sink.cylinder('structureMetal', [0.3, rail + 1.6, lz + 0.9], 'y', 0.7, 0.07, 6, { colour: IRON, decor: true });
  for (const wz of [-0.9, 0.9]) for (const sx of [-1, 1]) {
    const g = track(lz + wz) + 0.42;
    sink.cylinder('structureMetal', [sx * gauge / 2 - (sx > 0 ? 0 : 0.1), g + 0.3, lz + wz], 'x', 0.1, 0.3, 8, { colour: IRON, decor: true });
  }
  // the ore spilt along the track (dressing)
  const gsp = track(z0 + 3.6) + 0.22;
  sink.polygon('structureMetal', [[-1.1, gsp, z0 + 2], [1.0, gsp, z0 + 2.4], [1.1, gsp, z0 + 5.2], [-0.9, gsp, z0 + 4.8]], { colour: lerp(ORE, CREAM, 0.1), decor: true });
  // the movement record: the cars' and the diesel's run from the lowest ground under the track to the tops (on a slope the
  // derived contact band, the solids under 1.8 m over the base, can miss cars standing higher up it)
  let top = 0;
  for (let z = z0; z <= -z0; z += 1.5) top = Math.max(top, track(z) + 0.42 + 2.5);
  const movement: SimpleCollisionShape[] = [{ kind: 'obb', cx: 0, cz: (z0 + 0.05 + (-z0 - 0.4)) / 2, hw: 0.95, hl: (-z0 - 0.4 - (z0 + 0.05)) / 2, yaw: 0, y0: -0.3, y1: top }];
  return { parts: sink.finish(), movement };
};
