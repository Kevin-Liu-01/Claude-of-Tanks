// src/world/landmarks/forts.ts — forts as set pieces (landmarks-271, 2026-11-06).
//
// - desertFort: the Desert Patrol's police fort of Wadi Rum (Badlands; the census, buildings-270 signature places: "a
//   square crenellated fort, corner tower, gate arch, flagpole" at the village's edge facing the valley). A walled square
//   of rendered sandstone, its parapet crenellated all round, the rooms along the inside of the walls under flat roofs,
//   the gate arch in the front under a raised parapet, the taller tower at one front corner with its flagpole and flag,
//   loopholes in the walls, the water tank by the gate.
//
// Drawn in its own frame (x across, y up, z out of the front) into the regional part sink, in the map kit's masonry and
// render (no draw call of its own). The walls, rooms and tower are structure; the merlons are structure too (a shell
// meets them); the doors, flag and fittings are dressing.
import { PartSink, rgb, shade, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { archedFace, bar, type ArchHole } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const DOOR = rgb(0x5a4a38), IRON = rgb(0x2c2b2a);
const FLAG_BLACK = rgb(0x1a1a1a), FLAG_WHITE = rgb(0xeeeeee), FLAG_GREEN = rgb(0x1f7a3a), FLAG_RED = rgb(0xb4232a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** A crenellated parapet along a wall's top from a to b (plan points) at y, `t` thick: the merlons and the coping. */
function crenels(sink: PartSink, bucket: RegionalBucket, a: readonly [number, number], b: readonly [number, number], y: number, t: number,
  h = 0.7, merlon = 0.7, gap = 0.55): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
  const n = Math.max(1, Math.round((L + gap) / (merlon + gap))), m = (L - (n - 1) * gap) / n;
  // the parapet's breast wall under the crenels
  const corner = (s: number, w: number, o: number, yy: number): Vec3 => [a[0] + ux * s + nx * w * o, yy, a[1] + uz * s + nz * w * o];
  for (let k = 0; k < n; k++) {
    const s0 = k * (m + gap), s1 = s0 + m;
    const p = [corner(s0, t / 2, -1, y), corner(s1, t / 2, 1, y + h)];
    sink.span(bucket, Math.min(p[0][0], p[1][0], corner(s1, t / 2, -1, y)[0], corner(s0, t / 2, 1, y)[0]), y,
      Math.min(p[0][2], p[1][2], corner(s1, t / 2, -1, y)[2], corner(s0, t / 2, 1, y)[2]),
      Math.max(p[0][0], p[1][0], corner(s1, t / 2, -1, y)[0], corner(s0, t / 2, 1, y)[0]), y + h,
      Math.max(p[0][2], p[1][2], corner(s1, t / 2, -1, y)[2], corner(s0, t / 2, 1, y)[2]), {});
  }
}

/**
 * The Desert Patrol fort: a `size` square of walls `height` high and `wall` thick, the rooms `rooms` deep inside them,
 * the gate arch in the front (+z), the tower (`tower` high) at the front-left corner (-x, +z) with its flagpole.
 */
export const desertFort: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const mobile = ctx.tier === 'mobile', v = ctx.variant;
  const S = num(ctx, 'size', 18, 44), H = num(ctx, 'height', 3.5, 8), T = 0.9, R = num(ctx, 'rooms', 3, 7), TH = num(ctx, 'tower', H + 2, 16);
  const foot = -0.6 - ctx.groundFall, wall: RegionalBucket = 'plaster', h2 = S / 2;
  // the four outer walls (the front's two runs either side of the gate) with their loopholes; the plinth's batter
  const gw = 3.6, gh = 3.9;
  const loop = (u: number): ArchHole => ({ u, w: 0.22, y0: 2.2, spring: 2.9, form: 'flat' });
  const faces = {
    front: { origin: [0, 0, h2] as Vec3, u: [1, 0, 0] as Vec3, out: [0, 0, 1] as Vec3, width: S },
    right: { origin: [h2, 0, 0] as Vec3, u: [0, 0, -1] as Vec3, out: [1, 0, 0] as Vec3, width: S },
    back: { origin: [0, 0, -h2] as Vec3, u: [-1, 0, 0] as Vec3, out: [0, 0, -1] as Vec3, width: S },
    left: { origin: [-h2, 0, 0] as Vec3, u: [0, 0, 1] as Vec3, out: [-1, 0, 0] as Vec3, width: S },
  };
  for (const [name, face] of Object.entries(faces)) {
    const holes: ArchHole[] = [];
    if (name === 'front') holes.push({ u: 0, w: gw, y0: 0, spring: gh - gw / 2 * 0.6, form: 'segmental', rise: gw / 2 * 0.6 });
    for (let u = -S / 2 + 3.2; u < S / 2 - 2.5; u += 3.6) if (name !== 'front' || Math.abs(u) > gw / 2 + 1.0) holes.push(loop(u));
    archedFace(sink, wall, face, { u0: -S / 2, u1: S / 2, y0: foot, y1: H }, holes, T, { through: false });
    // the inner face of the wall and its top (the wall's thickness), the battered plinth
    const inner = { origin: [face.origin[0] - face.out[0] * T, 0, face.origin[2] - face.out[2] * T] as Vec3, u: [-face.u[0], 0, -face.u[2]] as Vec3,
      out: [-face.out[0], 0, -face.out[2]] as Vec3, width: S - 2 * T };
    archedFace(sink, wall, inner, { u0: -(S - 2 * T) / 2, u1: (S - 2 * T) / 2, y0: 0, y1: H }, name === 'front' ? [{ u: 0, w: gw, y0: 0, spring: gh - gw / 2 * 0.6, form: 'segmental', rise: gw / 2 * 0.6 }] : [], 0, {});
    const o = face.out, u = face.u;
    const P = (uu: number, y: number, oo: number): Vec3 => [face.origin[0] + u[0] * uu + o[0] * oo, y, face.origin[2] + u[2] * uu + o[2] * oo];
    sink.quad(wall, P(-S / 2, H, 0), P(S / 2, H, 0), P(S / 2, H, -T), P(-S / 2, H, -T), {});
    sink.quad(wall, P(-S / 2, foot, 0.45), P(S / 2, foot, 0.45), P(S / 2, 0.9, 0), P(-S / 2, 0.9, 0), { decor: true, shade: 0.9 });
  }
  // the parapet's crenels round the wall heads (the gate's raised in a stepped pediment)
  const c = h2 - T / 2;
  const corners: Array<[number, number]> = [[-c, c], [c, c], [c, -c], [-c, -c]];
  for (let k = 0; k < 4; k++) crenels(sink, wall, corners[k], corners[(k + 1) % 4], H, T);
  sink.span(wall, -gw / 2 - 1.4, H, h2 - T, gw / 2 + 1.4, H + 1.6, h2, {});
  crenels(sink, wall, [-gw / 2 - 1.4, h2 - T / 2], [gw / 2 + 1.4, h2 - T / 2], H + 1.6, T, 0.6, 0.55, 0.45);
  // the gate's leaves, studded, closed in the arch; the lamp over it and the fort's name plaque
  sink.span('structureWood', -gw / 2 + 0.05, 0, h2 - T + 0.2, gw / 2 - 0.05, gh, h2 - T + 0.32, { colour: DOOR, decor: true });
  if (!mobile) for (let y = 0.5; y < gh - 0.3; y += 0.6) for (let x = -gw / 2 + 0.35; x < gw / 2 - 0.2; x += 0.5) sink.span('structureMetal', x - 0.04, y - 0.04, h2 - T + 0.32, x + 0.04, y + 0.04, h2 - T + 0.36, { colour: IRON, decor: true, fine: 'near' });
  sink.span('stone', -1.6, gh + 0.5, h2 + 0.01, 1.6, gh + 1.25, h2 + 0.08, { decor: true, shade: 0.8 });
  // the rooms round the court: their flat roofs (the walk behind the parapet) on the inner walls, doors and windows on
  // the court, the court's floor
  const ri = h2 - T - R, rh = H - 0.5;
  for (const [x0, z0, x1, z1] of [[-h2 + T, ri, h2 - T, h2 - T], [-h2 + T, -h2 + T, h2 - T, -ri], [-h2 + T, -ri, -ri, ri], [ri, -ri, h2 - T, ri]] as const) {
    // (the front range is cut by the gate's passage)
    if (z0 === ri) {
      sink.span(wall, x0, foot, z0, -gw / 2 - 0.5, rh, z1, {});
      sink.span(wall, gw / 2 + 0.5, foot, z0, x1, rh, z1, {});
      sink.span(wall, -gw / 2 - 0.5, gh + 0.3, z0, gw / 2 + 0.5, rh, z1, {});
    } else sink.span(wall, x0, foot, z0, x1, rh, z1, {});
  }
  // doors and windows on the court faces of the rooms
  for (let u = -ri + 2.2; u < ri - 1; u += 4.2) {
    for (const [px, pz, ox, oz] of [[u, ri, 0, -1], [u, -ri, 0, 1], [-ri, u, 1, 0], [ri, u, -1, 0]] as const) {
      if (pz === ri && Math.abs(u) < gw / 2 + 1) continue;
      const door = v() < 0.4;
      const w = door ? 0.9 : 0.8, y0 = door ? 0 : 1.1, y1 = door ? 2.1 : 2.0;
      const ax = Math.abs(ox) > 0, x0 = ax ? px + ox * 0.01 : px - w / 2, x1 = ax ? px + ox * 0.03 : px + w / 2;
      const z0 = ax ? pz - w / 2 : pz + oz * 0.01, z1 = ax ? pz + w / 2 : pz + oz * 0.03;
      sink.span('dark', Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), { decor: true });
    }
  }
  sink.quad('stone', [-ri, 0.03, ri], [ri, 0.03, ri], [ri, 0.03, -ri], [-ri, 0.03, -ri], { decor: true, shade: 0.88, uv: { kind: 'world' } });
  // the court's well with its frame
  sink.cylinder('stone', [ri * 0.3, -0.3, -ri * 0.3], 'y', 1.1, 0.8, 10, { shade: 0.85 });
  for (const s of [-1, 1]) bar(sink, 'structureWood', [ri * 0.3 + s * 0.8, 0.8, -ri * 0.3], [ri * 0.3 + s * 0.8, 2.5, -ri * 0.3], 0.1, { colour: DOOR, decor: true });
  bar(sink, 'structureWood', [ri * 0.3 - 0.9, 2.5, -ri * 0.3], [ri * 0.3 + 0.9, 2.5, -ri * 0.3], 0.1, { colour: DOOR, decor: true });
  // the tower at the front-left corner, proud of both walls, its loopholes, its crenels, the flagpole and flag
  const tw = 6.2, tx = -h2 + tw / 2 - 1.0, tz = h2 - tw / 2 + 1.0;
  const tf = { origin: [tx, 0, tz + tw / 2] as Vec3, u: [1, 0, 0] as Vec3, out: [0, 0, 1] as Vec3, width: tw };
  const tl = { origin: [tx - tw / 2, 0, tz] as Vec3, u: [0, 0, 1] as Vec3, out: [-1, 0, 0] as Vec3, width: tw };
  const tb = { origin: [tx, 0, tz - tw / 2] as Vec3, u: [-1, 0, 0] as Vec3, out: [0, 0, -1] as Vec3, width: tw };
  const tr = { origin: [tx + tw / 2, 0, tz] as Vec3, u: [0, 0, -1] as Vec3, out: [1, 0, 0] as Vec3, width: tw };
  for (const f of [tf, tl, tb, tr]) archedFace(sink, wall, f, { u0: -tw / 2, u1: tw / 2, y0: foot, y1: TH }, [
    { u: 0, w: 0.25, y0: H + 1.2, spring: H + 2.0, form: 'flat' }, { u: 0, w: 0.7, y0: TH - 2.6, spring: TH - 1.5, form: 'segmental', rise: 0.25 },
  ], 0.6, {});
  sink.quad(wall, [tx - tw / 2, TH, tz + tw / 2], [tx + tw / 2, TH, tz + tw / 2], [tx + tw / 2, TH, tz - tw / 2], [tx - tw / 2, TH, tz - tw / 2], {});
  const tc = tw / 2 - 0.35;
  const tcs: Array<[number, number]> = [[tx - tc, tz + tc], [tx + tc, tz + tc], [tx + tc, tz - tc], [tx - tc, tz - tc]];
  for (let k = 0; k < 4; k++) crenels(sink, wall, tcs[k], tcs[(k + 1) % 4], TH, 0.7, 0.8, 0.75, 0.55);
  // (a string course under the tower's top storey)
  sink.span(wall, tx - tw / 2 - 0.12, TH - 3.2, tz - tw / 2 - 0.12, tx + tw / 2 + 0.12, TH - 2.95, tz + tw / 2 + 0.12, { decor: true, shade: 0.92 });
  const fx = tx + 1.4, fz = tz - 1.4, poleTop = TH + 7.5;
  bar(sink, 'structureMetal', [fx, TH, fz], [fx, poleTop, fz], 0.1, { colour: rgb(0xb8b8b0), decor: true });
  // the flag of Jordan: black, white, green, the red chevron at the hoist (dressing, both faces), stirring in the wind
  const fw = 3.6, fh = 1.8, fy = poleTop - 0.2 - fh, wave = (x: number): number => Math.sin(x * 1.7 + v() * 0.5) * 0.14;
  const band = (y0: number, y1: number, colour: typeof FLAG_RED): void => {
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * fw, b = (k + 1) / 6 * fw;
      const p0: Vec3 = [fx + a, y0, fz + wave(a)], p1: Vec3 = [fx + b, y0, fz + wave(b)], p2: Vec3 = [fx + b, y1, fz + wave(b)], p3: Vec3 = [fx + a, y1, fz + wave(a)];
      sink.quad('structureMetal', p0, p1, p2, p3, { colour, decor: true });
      sink.quad('structureMetal', p1, p0, p3, p2, { colour: shade(colour, 0.85), decor: true });
    }
  };
  band(fy + fh * 2 / 3, fy + fh, FLAG_BLACK);
  band(fy + fh / 3, fy + fh * 2 / 3, FLAG_WHITE);
  band(fy, fy + fh / 3, FLAG_GREEN);
  for (const s of [1, -1]) {
    const tri: Vec3[] = [[fx, fy, fz + s * 0.01], [fx + fw * 0.45, fy + fh / 2, fz + wave(fw * 0.45) + s * 0.01], [fx, fy + fh, fz + s * 0.01]];
    sink.polygon('structureMetal', s > 0 ? tri : [tri[0], tri[2], tri[1]], { colour: FLAG_RED, decor: true });
  }
  // the water tank on its stand beside the gate, outside the front wall
  const wx = gw / 2 + 3.6, wz = h2 + 2.2;
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]] as const) bar(sink, 'structureMetal', [wx + dx, foot, wz + dz], [wx + dx * 0.8, 3.2, wz + dz * 0.8], 0.12, { colour: IRON });
  sink.cylinder('structureMetal', [wx, 3.2, wz], 'y', 1.6, 1.1, 12, { colour: rgb(0x8a8578) });
  return { parts: sink.finish() };
};
