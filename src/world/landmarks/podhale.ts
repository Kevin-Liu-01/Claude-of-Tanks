// src/world/landmarks/podhale.ts — Podhale's wooden church (landmarks-271, 2026-11-06). Frosthollow is Podhale under the
// Tatras in the winter of 1945: the census (buildings-270 signature places) names the wooden churches with shingle
// towers (Dębno Podhalańskie's St Michael is the type) as the region's signature, and found the map's onion-domed kit
// church standing in for them.
//
// - woodenChurch: the log nave and the narrower chancel with its three-sided end under one steep shingled roof, the
//   chancel's ridge stepped down; the soboty, the low pent-roofed arcade on posts round the whole body; the west tower
//   of battered post-and-beam boarding with its overhanging belfry (izbica) and the shingled cap rising to a little
//   bulb and its cross; the porch at the tower's door; the larch fence round its churchyard with the roofed gate.
//
// Drawn in its own frame (x across, y up, z out of the front: the tower's door) into the regional part sink, its logs,
// boards and shingles in the map kit's wood and roofing (no draw call of its own). The walls and the tower are
// structure; the arcade's posts, the fence and the joinery are dressing.
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, cross, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const LOG = rgb(0x5a3e28), LOG_DARK = rgb(0x3e2a1b), BOARD = rgb(0x6a4a30), SHINGLE = rgb(0x4a3a30), IRON = rgb(0x2c2c2c);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** A log wall from a to b (plan points), y0..y1: the face and its log courses' shadow lines, the corner notches' ends
 *  (dressing), facing out to the right of a->b. */
function logWall(sink: PartSink, a: readonly [number, number], b: readonly [number, number], y0: number, y1: number, mobile: boolean, colour: Rgb = LOG): void {
  const P = (p: readonly [number, number], y: number): Vec3 => [p[0], y, p[1]];
  sink.quad('structureWood', P(b, y0), P(a, y0), P(a, y1), P(b, y1), { colour });
  if (mobile) return;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L * -1, nz = (b[0] - a[0]) / L;
  // (the outward normal is to the right of a->b seen from above: (dz, -dx))
  const ox = -nx, oz = -nz;
  for (let y = y0 + 0.3; y < y1; y += 0.3) {
    sink.quad('structureWood', [b[0] + ox * 0.01, y - 0.03, b[1] + oz * 0.01], [a[0] + ox * 0.01, y - 0.03, a[1] + oz * 0.01], [a[0] + ox * 0.01, y, a[1] + oz * 0.01], [b[0] + ox * 0.01, y, b[1] + oz * 0.01],
      { colour: shade(colour, 0.6), decor: true, fine: true });
  }
}

/** A gable roof's two slopes over a w (x) span from z0 to z1, eaves at y, ridge at ry, overhanging `ov`, its ends
 *  either gables or (hipEnd) a hip down to the eave at that end. */
function steepRoof(sink: PartSink, w: number, z0: number, z1: number, y: number, ry: number, ov: number, colour: Rgb): void {
  const X = w / 2 + ov;
  sink.quad('roof', [-X, y - 0.3, z1 + ov * 0.6], [-X, y - 0.3, z0 - ov * 0.6], [0, ry, z0 - ov * 0.6], [0, ry, z1 + ov * 0.6], { colour });
  sink.quad('roof', [X, y - 0.3, z0 - ov * 0.6], [X, y - 0.3, z1 + ov * 0.6], [0, ry, z1 + ov * 0.6], [0, ry, z0 - ov * 0.6], { colour });
  // the undersides at the eaves
  sink.quad('roof', [-X, y - 0.32, z0 - ov * 0.6], [-X, y - 0.32, z1 + ov * 0.6], [-w / 2, y + ov * (ry - y) / X - 0.3, z1 + ov * 0.6], [-w / 2, y + ov * (ry - y) / X - 0.3, z0 - ov * 0.6], { colour: shade(colour, 0.5), decor: true });
  sink.quad('roof', [X, y - 0.32, z1 + ov * 0.6], [X, y - 0.32, z0 - ov * 0.6], [w / 2, y + ov * (ry - y) / X - 0.3, z0 - ov * 0.6], [w / 2, y + ov * (ry - y) / X - 0.3, z1 + ov * 0.6], { colour: shade(colour, 0.5), decor: true });
}

/**
 * The wooden church: the nave (`width` x `length`), the chancel two thirds as wide with its three-sided end, the tower
 * (`tower` to its cap's foot) at the front, the soboty round the body, the churchyard fence (`yard` metres round).
 */
export const woodenChurch: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const mobile = ctx.tier === 'mobile';
  const W = num(ctx, 'width', 6, 12), L = num(ctx, 'length', 8, 18), T = num(ctx, 'tower', 10, 22);
  const foot = -0.6 - ctx.groundFall, wallH = 5.0, pitch = Math.tan(56 * Math.PI / 180);
  const Wc = W * 0.7, Lc = L * 0.55, nz0 = -L / 2 + 2, nz1 = nz0 + L, cz1 = nz0, cz0 = nz0 - Lc;
  // the stone footing under the sill beams
  sink.span('stone', -W / 2 - 0.2, foot, nz0 - 0.1, W / 2 + 0.2, 0.5, nz1 + 0.2, { shade: 0.85 });
  sink.span('stone', -Wc / 2 - 0.2, foot, cz0, Wc / 2 + 0.2, 0.5, cz1, { shade: 0.85 });
  // the nave's log walls (a box), the chancel's with its three-sided end
  const nave: Array<[number, number]> = [[-W / 2, nz1], [W / 2, nz1], [W / 2, nz0], [-W / 2, nz0]];
  for (let k = 0; k < 4; k++) logWall(sink, nave[(k + 1) % 4], nave[k], 0.5, wallH, mobile);
  const e = Wc * 0.32;
  const chancel: Array<[number, number]> = [[Wc / 2, cz1], [Wc / 2, cz0 + e], [Wc / 4, cz0], [-Wc / 4, cz0], [-Wc / 2, cz0 + e], [-Wc / 2, cz1]];
  for (let k = 0; k + 1 < chancel.length; k++) logWall(sink, chancel[k + 1], chancel[k], 0.5, wallH - 0.4, mobile);
  sink.quad('structureWood', [-W / 2, wallH, nz1], [W / 2, wallH, nz1], [W / 2, wallH, nz0], [-W / 2, wallH, nz0], { colour: LOG_DARK });
  // the small windows high in the side walls
  for (const s of [-1, 1]) for (const z of [nz0 + L * 0.3, nz0 + L * 0.7]) sink.span('dark', s * W / 2 - 0.02, 2.6, z - 0.4, s * W / 2 + 0.02, 3.5, z + 0.4, { decor: true });
  // the roofs: the nave's steep gable, the chancel's lower ridge with its hipped three-sided end
  const nRidge = wallH + (W / 2) * pitch, cRidge = wallH - 0.4 + (Wc / 2) * pitch;
  steepRoof(sink, W, nz0, nz1, wallH, nRidge, 0.9, SHINGLE);
  steepRoof(sink, Wc, cz0 + e, cz1, wallH - 0.4, cRidge, 0.8, SHINGLE);
  // the nave's back gable over the chancel's ridge, and the chancel's hipped end facets
  sink.polygon('structureWood', [[W / 2, wallH, nz0], [-W / 2, wallH, nz0], [0, nRidge, nz0]], { colour: BOARD });
  const hip: Vec3 = [0, cRidge, cz0 + e - 0.6], ey = wallH - 0.7;
  const ends: Vec3[] = [[Wc / 2 + 0.8, ey, cz0 + e - 0.5], [Wc / 4 + 0.5, ey, cz0 - 0.8], [-Wc / 4 - 0.5, ey, cz0 - 0.8], [-Wc / 2 - 0.8, ey, cz0 + e - 0.5]];
  for (let k = 0; k + 1 < ends.length; k++) sink.polygon('roof', [ends[k], ends[k + 1], hip], { colour: SHINGLE });
  // the soboty: the pent roof round the body on its posts, 1.6 m out, its eave at 2.2 m
  const sb = 1.6, sy = 2.2, sTop = 3.2;
  const ring: Array<[number, number]> = [[-W / 2 - sb, nz1 + sb], [W / 2 + sb, nz1 + sb], [W / 2 + sb, nz0], [Wc / 2 + sb, nz0], [Wc / 2 + sb, cz0 - sb * 0.6], [-Wc / 2 - sb, cz0 - sb * 0.6], [-Wc / 2 - sb, nz0], [-W / 2 - sb, nz0]];
  const inner: Array<[number, number]> = [[-W / 2, nz1], [W / 2, nz1], [W / 2, nz0], [Wc / 2, nz0], [Wc / 2, cz0], [-Wc / 2, cz0], [-Wc / 2, nz0], [-W / 2, nz0]];
  for (let k = 0; k < ring.length; k++) {
    const j = (k + 1) % ring.length;
    sink.quad('roof', [ring[j][0], sy, ring[j][1]], [ring[k][0], sy, ring[k][1]], [inner[k][0], sTop, inner[k][1]], [inner[j][0], sTop, inner[j][1]], { colour: shade(SHINGLE, 1.05) });
    sink.quad('roof', [ring[k][0], sy - 0.05, ring[k][1]], [ring[j][0], sy - 0.05, ring[j][1]], [inner[j][0], sTop - 0.05, inner[j][1]], [inner[k][0], sTop - 0.05, inner[k][1]], { colour: shade(SHINGLE, 0.5), decor: true });
    // its posts along the run
    const L2 = Math.hypot(ring[j][0] - ring[k][0], ring[j][1] - ring[k][1]);
    for (let t = 0; t < L2 - 0.3; t += 2.0) {
      const x = ring[k][0] + (ring[j][0] - ring[k][0]) * t / L2, z = ring[k][1] + (ring[j][1] - ring[k][1]) * t / L2;
      bar(sink, 'structureWood', [x, 0.3, z], [x, sy, z], 0.16, { colour: LOG_DARK, decor: true });
    }
  }
  // the tower over the front: battered boarded walls from its sill to the belfry, the izbica's overhang, the cap
  const tz = nz1 + 1.2, tb = 4.6, tt = 3.6, ty = T - 3;
  const tq = (sx: number, sz: number, w: number, y: number): Vec3 => [sx * w / 2, y, tz + sz * w / 2];
  const sides: Array<[[number, number], [number, number]]> = [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]]];
  for (const [[ax, az], [bx, bz]] of sides) {
    sink.quad('structureWood', tq(ax, az, tb, foot), tq(bx, bz, tb, foot), tq(bx, bz, tt, ty), tq(ax, az, tt, ty), { colour: BOARD });
    if (!mobile) for (let k = 1; k < 14; k++) {
      const f = k / 14, p0 = tq(ax + (bx - ax) * f, az + (bz - az) * f, tb, 0.6), p1 = tq(ax + (bx - ax) * f, az + (bz - az) * f, tt, ty);
      bar(sink, 'structureWood', p0, p1, 0.05, { colour: shade(BOARD, 0.7), decor: true, fine: true });
    }
  }
  // the izbica: a box wider than the shaft's head, its louvred openings, its sloped skirt under it
  const iw = 5.2, iy0 = ty, iy1 = ty + 2.6;
  sink.span('structureWood', -iw / 2, iy0, tz - iw / 2, iw / 2, iy1, tz + iw / 2, { colour: BOARD });
  for (const [sx, sz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    sink.span('dark', sx * iw / 2 - (sz ? 1.0 : 0.02), iy0 + 0.7, tz + sz * iw / 2 - (sx ? 1.0 : 0.02), sx * iw / 2 + (sz ? 1.0 : 0.02), iy1 - 0.5, tz + sz * iw / 2 + (sx ? 1.0 : 0.02), { decor: true });
  }
  for (const [[ax, az], [bx, bz]] of sides) sink.quad('roof', tq(ax, az, tt, iy0 - 0.9), tq(bx, bz, tt, iy0 - 0.9), tq(bx, bz, iw + 0.3, iy0 + 0.05), tq(ax, az, iw + 0.3, iy0 + 0.05), { colour: SHINGLE });
  // the cap: a steep shingled pyramid to the neck, the little bulb and its lantern, the cross
  const capTop = iy1 + 4.2;
  for (const [[ax, az], [bx, bz]] of sides) sink.polygon('roof', [tq(ax, az, iw + 0.5, iy1 - 0.2), tq(bx, bz, iw + 0.5, iy1 - 0.2), [0, capTop, tz]], { colour: SHINGLE });
  revolve(sink, 'roof', 0, tz, [[0.3, capTop - 0.5], [0.55, capTop + 0.2], [0.45, capTop + 0.75], [0.12, capTop + 1.2], [0.001, capTop + 1.3]], mobile ? 8 : 12, { colour: SHINGLE });
  cross(sink, 'structureMetal', 0, capTop + 1.3, tz, 1.1, 'latin', IRON);
  // the porch at the tower's door: two posts and a small gable roof, the door itself
  const pz = tz + tb / 2;
  sink.span('dark', -0.65, 0.4, pz + 0.01, 0.65, 2.4, pz + 0.04, { decor: true });
  for (const s of [-1, 1]) bar(sink, 'structureWood', [s * 1.1, 0.3, pz + 1.6], [s * 1.1, 2.4, pz + 1.6], 0.15, { colour: LOG_DARK, decor: true });
  sink.quad('roof', [-1.6, 2.3, pz + 1.9], [-1.6, 2.3, pz], [0, 3.4, pz], [0, 3.4, pz + 1.9], { colour: SHINGLE, decor: true });
  sink.quad('roof', [1.6, 2.3, pz], [1.6, 2.3, pz + 1.9], [0, 3.4, pz + 1.9], [0, 3.4, pz], { colour: SHINGLE, decor: true });
  // the churchyard's larch fence (low boards on posts) with the roofed gate on the front
  const yw = Math.max(W + 8, num(ctx, 'yard', 14, 40)), yz1 = pz + 5, yz0 = cz0 - 4;
  const fence = (a: [number, number], b: [number, number]): void => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= len; t += 2.4) {
      const x = a[0] + (b[0] - a[0]) * t / len, z = a[1] + (b[1] - a[1]) * t / len;
      bar(sink, 'structureWood', [x, -0.3, z], [x, 1.2, z], 0.12, { colour: LOG_DARK, decor: true });
    }
    sink.quad('structureWood', [a[0], 0.2, a[1]], [b[0], 0.2, b[1]], [b[0], 1.05, b[1]], [a[0], 1.05, a[1]], { colour: BOARD, decor: true });
    sink.quad('structureWood', [b[0], 0.2, b[1]], [a[0], 0.2, a[1]], [a[0], 1.05, a[1]], [b[0], 1.05, b[1]], { colour: shade(BOARD, 0.8), decor: true });
  };
  fence([-yw / 2, yz1], [-1.6, yz1]); fence([1.6, yz1], [yw / 2, yz1]); fence([yw / 2, yz1], [yw / 2, yz0]); fence([yw / 2, yz0], [-yw / 2, yz0]); fence([-yw / 2, yz0], [-yw / 2, yz1]);
  for (const s of [-1, 1]) bar(sink, 'structureWood', [s * 1.6, -0.3, yz1], [s * 1.6, 2.6, yz1], 0.2, { colour: LOG_DARK, decor: true });
  sink.quad('roof', [-2.2, 2.4, yz1 - 0.7], [-2.2, 2.4, yz1 + 0.7], [0, 3.4, yz1 + 0.7], [0, 3.4, yz1 - 0.7], { colour: SHINGLE, decor: true });
  sink.quad('roof', [2.2, 2.4, yz1 + 0.7], [2.2, 2.4, yz1 - 0.7], [0, 3.4, yz1 - 0.7], [0, 3.4, yz1 + 0.7], { colour: SHINGLE, decor: true });
  return { parts: sink.finish() };
};
