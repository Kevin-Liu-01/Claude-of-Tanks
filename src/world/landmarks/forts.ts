// src/world/landmarks/forts.ts — forts as set pieces (landmarks-271, 2026-11-06; the realism pass, 273, 2026-11-16).
//
// - desertFort: the Desert Patrol's police fort of Wadi Rum (Badlands; the census, buildings-270 signature places: "a
//   square crenellated fort, corner tower, gate arch, flagpole" at the village's edge facing the valley). A walled square
//   of mud brick under a mud render: its walls battered and softly bulging, on a projecting plinth course, the parapet's
//   merlons worn round (a few slumped to stumps), towers at two opposite corners, the gate raised in its own block with
//   the machicolation box over the arch, the rooms along the inside of the walls under flat roofs, the timber water
//   spouts, the steel water tank on its braced stand, sand drifted against the walls and fallen render at their feet,
//   the flag of Jordan (black, white and green, the red chevron and its white seven-pointed star) stirring on the tower.
//
// Drawn in its own frame (x across, y up, z out of the front) into the regional part sink, in the map kit's masonry and
// render (no draw call of its own). The walls, rooms and towers are structure; the merlons are structure too (a shell
// meets them); the doors, flag, drifts and fittings are dressing.
import { PartSink, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { mound } from '../maps/regional/dressing.ts';
import { archSurround, archedFace, bar, extrude, revolve, type ArchHole } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const DOOR = rgb(0x5a4a38), IRON = rgb(0x2c2b2a);
const FLAG_BLACK = rgb(0x1a1a1a), FLAG_WHITE = rgb(0xeeeeee), FLAG_GREEN = rgb(0x1f7a3a), FLAG_RED = rgb(0xb4232a);
const SAND = rgb(0xcf9d68), MUD = rgb(0xa77d55);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

type UV = [number, number];
/** Sutherland–Hodgman: the part of a convex polygon where the linear `f` is ≥ 0. */
function clipPoly(poly: readonly UV[], f: (p: UV) => number): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

/** A sheet through rows of points (each row the same count): row to row along +x, point to point over the profile. */
function sheet(sink: PartSink, bucket: RegionalBucket, rows: ReadonlyArray<readonly Vec3[]>, opts: EmitOptions): void {
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < rows[i].length; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    sink.polygon(bucket, [a, b, c], opts);
    sink.polygon(bucket, [a, c, d], opts);
  }
}

/**
 * A battered mud-brick face: its plane leaning back `b` m between the ground and its top `y1` (its foot that much wider
 * each side, where the neighbouring face meets it on the hip), in `cols` columns whose verticals bulge out a little
 * under half height (`v`): the soft, hand-plastered mass of a mud wall, not a plumb slab. Returns the point on the face
 * at (u, y), `o` proud of it (bulges included), for the slits, spouts, stains and drifts set on it.
 */
function mudFace(sink: PartSink, bucket: RegionalBucket, face: Face, y0: number, y1: number, b: number, cols: number,
  v: () => number): (u: number, y: number, o?: number) => Vec3 {
  const ob = (y: number): number => b * (y1 - y) / y1;
  const ym = y0 + (y1 - y0) * 0.42;
  const bulges = Array.from({ length: cols + 1 }, (_, i) => (i > 0 && i < cols ? 0.04 + v() * 0.14 : 0));
  const rows = [y0, ym, y1].map((y, r) => {
    const half = face.width / 2 + ob(y);
    return bulges.map((bu, i): Vec3 => facePoint(face, -half + 2 * half * i / cols, y, ob(y) + (r === 1 ? bu : 0)));
  });
  for (let r = 0; r < 2; r++) for (let i = 0; i < cols; i++) {
    const a = rows[r][i], bb = rows[r][i + 1], c = rows[r + 1][i + 1], d = rows[r + 1][i];
    sink.polygon(bucket, [a, bb, c], {});
    sink.polygon(bucket, [a, c, d], {});
  }
  return (u, y, o = 0) => {
    const half = face.width / 2 + ob(y), f = clamp01((u + half) / (2 * half)) * cols, i = Math.min(cols - 1, Math.floor(f));
    const across = bulges[i] + (bulges[i + 1] - bulges[i]) * (f - i);
    const up = y < ym ? clamp01((y - y0) / (ym - y0)) : clamp01((y1 - y) / (y1 - ym));
    return facePoint(face, u, y, ob(y) + across * up + 0.03 + o);
  };
}

/**
 * The parapet's merlons along a wall head from a to b (plan points, the line on the merlons' centre) at y, `t` thick:
 * each a mud block worn round at the top (its shoulders weathered off), each its own height (`v`), one in a dozen slumped
 * to a stump. Its underside sits on the wall head and is not drawn.
 */
function merlons(sink: PartSink, bucket: RegionalBucket, a: readonly [number, number], b: readonly [number, number], y: number, t: number,
  h: number, m: number, gap: number, v: () => number): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
  const n = Math.max(1, Math.round((L + gap) / (m + gap))), w = (L - (n - 1) * gap) / n;
  const P = (s: number, yy: number, side: number): Vec3 => [a[0] + ux * s + nx * side * t / 2, y + yy, a[1] + uz * s + nz * side * t / 2];
  for (let k = 0; k < n; k++) {
    const r0 = v(), r1 = v(), stump = r1 < 0.08;
    const hk = stump ? h * 0.38 : h * (0.84 + r0 * 0.24), s0 = k * (w + gap) + (stump ? w * 0.12 : 0), s1 = k * (w + gap) + w - (stump ? w * 0.2 : 0);
    const cw = (s1 - s0) * (0.2 + r0 * 0.1), lean = (r0 - 0.5) * 0.12;
    const prof: UV[] = [[s0, 0], [s1, 0], [s1, hk * 0.7], [s1 - cw, hk - lean * h], [s0 + cw, hk + lean * h], [s0, hk * 0.7]];
    sink.polygon(bucket, prof.map(([s, yy]) => P(s, yy, 1)), {});
    sink.polygon(bucket, prof.map(([s, yy]) => P(s, yy, -1)).reverse(), {});
    for (let i = 1; i < prof.length; i++) {
      const p = prof[i], q = prof[(i + 1) % prof.length];
      sink.quad(bucket, P(p[0], p[1], 1), P(p[0], p[1], -1), P(q[0], q[1], -1), P(q[0], q[1], 1), {});
    }
  }
}

/**
 * The Desert Patrol fort: a `size` square of walls `height` high, the rooms `rooms` deep inside them, the gate block in
 * the front (+z), the tower (`tower` high) at the front-left corner (-x, +z) with its flagpole, its fellow at the
 * back-right.
 */
export const desertFort: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const S = num(ctx, 'size', 18, 44), H = num(ctx, 'height', 3.5, 8), T = 0.9, R = num(ctx, 'rooms', 3, 7), TH = num(ctx, 'tower', H + 2, 16);
  const foot = -0.6 - ctx.groundFall, wall: RegionalBucket = 'plaster', h2 = S / 2;
  // (the batter of the curtain: its foot 0.5 m out of its head, about 6°)
  const B = 0.5, ob = (y: number): number => B * (H - y) / H;
  const gw = 3.6, gh = 3.9, gx = 3.3, gz1 = h2 + 1.3, gH = H + 1.5;
  const tw = 6.2, tx = -h2 + tw / 2 - 0.7, tz = h2 - tw / 2 + 0.7;
  const tw2 = 5.6, TH2 = Math.max(H + 1.5, TH - 1.3), tx2 = h2 - tw2 / 2 + 0.7, tz2 = -h2 + tw2 / 2 - 0.7;
  // the four outer walls: battered and bulging mud, their loopholes, the plinth course at their feet, the spouts
  const faces: Array<[string, Face]> = [
    ['front', { origin: [0, 0, h2], u: [1, 0, 0], out: [0, 0, 1], width: S }],
    ['right', { origin: [h2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: S }],
    ['back', { origin: [0, 0, -h2], u: [-1, 0, 0], out: [0, 0, -1], width: S }],
    ['left', { origin: [-h2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: S }],
  ];
  const decor: EmitOptions = { decor: true };
  for (const [name, face] of faces) {
    const at = mudFace(sink, wall, face, foot, H, B, 6, v);
    // (a tower stands at the u < -9 end of the front and the back, at the u > 9 end of the two sides)
    const towerEnd = name === 'front' || name === 'back' ? -1 : 1;
    const free = (u: number, w: number): boolean => towerEnd * u < h2 - tw + 0.4 - w && (name !== 'front' || Math.abs(u) > gx + 0.4 + w);
    for (let u = -S / 2 + 3.2; u < S / 2 - 2.5; u += 3.6) {
      if (!free(u, 0.2)) continue;
      const y0 = 2.1 + (v() - 0.5) * 0.3;
      sink.quad('dark', at(u - 0.11, y0), at(u + 0.11, y0), at(u + 0.11, y0 + 0.75), at(u - 0.11, y0 + 0.75), decor);
    }
    // the top of the wall (the walk behind the parapet)
    const P = (uu: number, y: number, oo: number): Vec3 => facePoint(face, uu, y, oo);
    sink.quad(wall, P(-S / 2, H, 0), P(S / 2, H, 0), P(S / 2, H, -T), P(-S / 2, H, -T), {});
    // the plinth course: a battered step of harder brick 0.55 m high round the foot, worn round on its top (the front's
    // two runs either side of the gate block)
    const prof = (u: number): Vec3[] => [P(u, foot, ob(foot) - 0.05), P(u, foot, ob(foot) + 0.28), P(u, 0.3, ob(0.3) + 0.28), P(u, 0.55, ob(0.55) + 0.1), P(u, 0.55, ob(0.55) - 0.05)];
    const pe = S / 2 + 0.84;
    if (name === 'front') {
      extrude(sink, wall, prof(-pe), face.u, pe - gx, { shade: 0.9 });
      extrude(sink, wall, prof(gx), face.u, pe - gx, { shade: 0.9 });
    } else extrude(sink, wall, prof(-pe), face.u, 2 * pe, { shade: 0.9 });
    // the roofs' timber water spouts (mizab) through the parapet, the wash stained down the render under each
    for (let uu = -S / 2 + 4.9; uu < S / 2 - 2; uu += 7.2) {
      if (!free(uu, 0.4)) continue;
      bar(sink, 'structureWood', at(uu, H - 0.75, -0.12), at(uu, H - 0.85, 0.72), 0.2, { colour: DOOR, decor: true });
      sink.quad(wall, at(uu - 0.22, H - 3.0, -0.015), at(uu + 0.22, H - 3.0, -0.015), at(uu + 0.13, H - 0.95, -0.015), at(uu - 0.13, H - 0.95, -0.015),
        { decor: true, shadeAt: (p) => 0.66 + 0.3 * clamp01((H - 0.95 - p[1]) / 2.05), fine: 'near' });
    }
    // the render fallen away in patches (the brick under it showing darker), a lighter patch of new render, the damp
    // band the rains leave over the plinth
    for (let k = 0; k < 3; k++) {
      const u = -S / 2 + 3 + v() * (S - 6), y = 1.2 + v() * (H - 2.4), r = 0.45 + v() * 0.6, patched = k === 2;
      if (!free(u, r)) continue;
      const ring: Vec3[] = [];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, rr = r * (0.7 + 0.3 * Math.abs(Math.sin(i * 2.3 + u))); ring.push(at(u + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr * 0.8, 0.01)); }
      sink.polygon(patched ? wall : 'plaster2', ring, { decor: true, shade: patched ? 1.08 : 0.82 });
    }
    sink.quad(wall, at(-S / 2 - 0.3, 0.55, 0.012), at(S / 2 + 0.3, 0.55, 0.012), at(S / 2, 1.6, 0.012), at(-S / 2, 1.6, 0.012),
      { decor: true, shadeAt: (p) => 0.8 + 0.2 * clamp01((p[1] - 0.55) / 1.05) });
    // sand drifted against the wall's foot in three banks (dressing), the gate's threshold kept clear
    for (let k = 0; k < 3; k++) {
      const c = -S / 2 + 4.5 + k * (S - 9) / 2 + (v() - 0.5) * 2.5, half = 1.8 + v() * 1.8, hd = 0.4 + v() * 0.5;
      if (!free(c, half) || (name === 'front' && Math.abs(c) < gx + 1.2 + half)) continue;
      const u0 = c - half, u1 = c + half;
      // (a rounded bank: its crest against the wall, its shoulder, its toe, the ends tapering into the ground)
      const W0 = at(u0, foot, -0.06), W1 = at(u1, foot, -0.06), R0 = at(u0 + 1.1, hd, -0.06), R1 = at(u1 - 1.1, hd, -0.06);
      const M0 = at(u0 + 0.7, hd * 0.55, 0.42), M1 = at(u1 - 0.7, hd * 0.55, 0.42), T0 = at(u0 + 0.3, foot, 1.05), T1 = at(u1 - 0.3, foot, 1.05);
      const sand: EmitOptions = { decor: true, colourAt: (p) => shade(SAND, 0.9 + 0.12 * clamp01(p[1] / hd)) };
      sink.quad('structureWood', M0, M1, R1, R0, sand);
      sink.quad('structureWood', T0, T1, M1, M0, sand);
      sink.polygon('structureWood', [W0, T0, M0], sand);
      sink.polygon('structureWood', [W0, M0, R0], sand);
      sink.polygon('structureWood', [T1, W1, M1], sand);
      sink.polygon('structureWood', [M1, W1, R1], sand);
    }
  }
  // the parapet's merlons round the wall heads, on their outer edge
  const c = h2 - 0.3;
  const corners: Array<[number, number]> = [[-c, c], [c, c], [c, -c], [-c, -c]];
  for (let k = 0; k < 4; k++) merlons(sink, wall, corners[k], corners[(k + 1) % 4], H, 0.6, 0.75, 0.85, 0.6, v);
  // the gate block: raised 1.5 m over the curtain and proud of it, the gate's arch through it, the machicolation box
  // over the arch on its corbels (its murder hole under it), its own merlons
  const gf: Face = { origin: [0, 0, gz1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * gx };
  const gate: ArchHole = { u: 0, w: gw, y0: 0, spring: gh - gw / 2 * 0.6, form: 'segmental', rise: gw / 2 * 0.6 };
  archedFace(sink, wall, gf, { u0: -gx, u1: gx, y0: foot, y1: gH }, [gate], 0.7, {});
  const gz0 = h2 - T;
  sink.quad(wall, [gx, foot, gz1], [gx, foot, gz0], [gx, gH, gz0], [gx, gH, gz1], {});
  sink.quad(wall, [-gx, foot, gz0], [-gx, foot, gz1], [-gx, gH, gz1], [-gx, gH, gz0], {});
  sink.quad(wall, [-gx, gH, gz1], [gx, gH, gz1], [gx, gH, gz0], [-gx, gH, gz0], {});
  sink.quad(wall, [gx, H, gz0], [-gx, H, gz0], [-gx, gH, gz0], [gx, gH, gz0], {});
  for (const s of [-1, 1]) sink.span(wall, s * (gw / 2 + 0.02), foot, gz1 - 0.1, s * (gx + 0.28), 0.5, gz1 + 0.28, { shade: 0.9 });
  merlons(sink, wall, [-gx + 0.3, gz1 - 0.3], [gx - 0.3, gz1 - 0.3], gH, 0.6, 0.7, 0.7, 0.5, v);
  sink.span(wall, -1.3, gh + 0.95, gz1 - 0.04, 1.3, gh + 2.0, gz1 + 0.78, {});
  for (const x of [-1.05, 0, 1.05]) sink.span(wall, x - 0.14, gh + 0.45, gz1 - 0.04, x + 0.14, gh + 0.95, gz1 + 0.72, { shade: 0.9 });
  sink.quad('dark', [-1.0, gh + 0.94, gz1 + 0.18], [1.0, gh + 0.94, gz1 + 0.18], [1.0, gh + 0.94, gz1 + 0.6], [-1.0, gh + 0.94, gz1 + 0.6], decor);
  for (const x of [-0.6, 0.6]) sink.quad('dark', [x - 0.08, gh + 1.25, gz1 + 0.79], [x + 0.08, gh + 1.25, gz1 + 0.79], [x + 0.08, gh + 1.75, gz1 + 0.79], [x - 0.08, gh + 1.75, gz1 + 0.79], decor);
  // the gate's leaves, closed in the arch, on their iron straps; the trodden apron before it
  const lz = gz1 - 0.6;
  sink.span('structureWood', -gw / 2 + 0.05, 0, lz - 0.1, gw / 2 - 0.05, gh, lz, { colour: DOOR, decor: true });
  for (const y of [0.45, 1.5, 2.6]) sink.span('structureMetal', -gw / 2 + 0.1, y, lz, gw / 2 - 0.1, y + 0.12, lz + 0.04, { colour: IRON, decor: true, fine: 'near' });
  sink.quad('stone', [-2.1, 0.03, gz1 + 2.2], [2.1, 0.03, gz1 + 2.2], [2.6, 0.03, gz1 + 0.3], [-2.6, 0.03, gz1 + 0.3], { decor: true, shade: 0.82, uv: { kind: 'world' } });
  // the rooms round the court: their flat roofs (the walk behind the parapet) on the inner walls, doors and windows on
  // the court, the court's floor; the inner face of the walls (the gate's passage through the front's)
  const ri = h2 - T - R, rh = H - 0.5;
  for (const [, face] of faces) {
    const inner: Face = { origin: [face.origin[0] - face.out[0] * T, 0, face.origin[2] - face.out[2] * T], u: [-face.u[0], 0, -face.u[2]],
      out: [-face.out[0], 0, -face.out[2]], width: S - 2 * T };
    archedFace(sink, wall, inner, { u0: -(S - 2 * T) / 2, u1: (S - 2 * T) / 2, y0: 0, y1: H }, face.out[2] > 0.5 ? [gate] : [], 0, {});
  }
  for (const [x0, z0, x1, z1] of [[-h2 + T, ri, h2 - T, h2 - T], [-h2 + T, -h2 + T, h2 - T, -ri], [-h2 + T, -ri, -ri, ri], [ri, -ri, h2 - T, ri]] as const) {
    // (the front range is cut by the gate's passage)
    if (z0 === ri) {
      sink.span(wall, x0, foot, z0, -gw / 2 - 0.5, rh, z1, {});
      sink.span(wall, gw / 2 + 0.5, foot, z0, x1, rh, z1, {});
      sink.span(wall, -gw / 2 - 0.5, gh + 0.3, z0, gw / 2 + 0.5, rh, z1, {});
    } else sink.span(wall, x0, foot, z0, x1, rh, z1, {});
  }
  for (let u = -ri + 2.2; u < ri - 1; u += 4.2) {
    for (const [px, pz, ox, oz] of [[u, ri, 0, -1], [u, -ri, 0, 1], [-ri, u, 1, 0], [ri, u, -1, 0]] as const) {
      if (pz === ri && Math.abs(u) < gw / 2 + 1) continue;
      const door = v() < 0.4;
      const w = door ? 0.9 : 0.8, y0 = door ? 0 : 1.1, y1 = door ? 2.1 : 2.0;
      // a dark opening on the court face (wound to face the court)
      const ax = Math.abs(ox) > 0, o = 0.02;
      const p = (s: number, y: number): Vec3 => (ax ? [px + ox * o, y, pz - ox * s] : [px + oz * s, y, pz + oz * o]);
      sink.quad('dark', p(-w / 2, y0), p(w / 2, y0), p(w / 2, y1), p(-w / 2, y1), decor);
    }
  }
  sink.quad('stone', [-ri, 0.03, ri], [ri, 0.03, ri], [ri, 0.03, -ri], [-ri, 0.03, -ri], { decor: true, shade: 0.88, uv: { kind: 'world' } });
  // the court's well with its frame
  sink.cylinder('stone', [ri * 0.3, -0.3, -ri * 0.3], 'y', 1.1, 0.8, 10, { shade: 0.85 });
  for (const s of [-1, 1]) bar(sink, 'structureWood', [ri * 0.3 + s * 0.8, 0.8, -ri * 0.3], [ri * 0.3 + s * 0.8, 2.5, -ri * 0.3], 0.1, { colour: DOOR, decor: true });
  bar(sink, 'structureWood', [ri * 0.3 - 0.9, 2.5, -ri * 0.3], [ri * 0.3 + 0.9, 2.5, -ri * 0.3], 0.1, { colour: DOOR, decor: true });
  // the two towers at opposite corners, proud of both walls: battered like the curtain, their loopholes and the
  // window of the top room, a plinth, merlons round their heads
  const tower = (cx: number, cz: number, w: number, th: number, b: number): void => {
    const tfaces: Face[] = [
      { origin: [cx, 0, cz + w / 2], u: [1, 0, 0], out: [0, 0, 1], width: w },
      { origin: [cx + w / 2, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: w },
      { origin: [cx, 0, cz - w / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w },
      { origin: [cx - w / 2, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: w },
    ];
    for (const f of tfaces) {
      const at = mudFace(sink, wall, f, foot, th, b, 3, v);
      sink.quad('dark', at(-0.12, H + 1.2), at(0.12, H + 1.2), at(0.12, H + 2.0), at(-0.12, H + 2.0), decor);
      const wy = th - 2.6, ws = th - 1.6;
      sink.polygon('dark', [at(-0.36, wy), at(0.36, wy), at(0.36, ws), at(0.2, ws + 0.22), at(-0.2, ws + 0.22), at(-0.36, ws)], decor);
    }
    sink.quad(wall, [cx - w / 2, th, cz + w / 2], [cx + w / 2, th, cz + w / 2], [cx + w / 2, th, cz - w / 2], [cx - w / 2, th, cz - w / 2], {});
    const ph = w / 2 + b + 0.16;
    sink.span(wall, cx - ph, foot, cz - ph, cx + ph, 0.42, cz + ph, { shade: 0.9 });
    const tc = w / 2 - 0.3;
    const tcs: Array<[number, number]> = [[cx - tc, cz + tc], [cx + tc, cz + tc], [cx + tc, cz - tc], [cx - tc, cz - tc]];
    for (let k = 0; k < 4; k++) merlons(sink, wall, tcs[k], tcs[(k + 1) % 4], th, 0.6, 0.8, 0.85, 0.55, v);
  };
  tower(tx, tz, tw, TH, 0.55);
  tower(tx2, tz2, tw2, TH2, 0.45);
  // fallen render and brick heaped at the walls' feet (under the corners and a slumped stretch of the back)
  const heaps: Array<[number, number]> = [[h2 + 0.75, h2 - 3.5], [-h2 - 0.75, -h2 + 4.0], [-3.5, -h2 - 0.9], [-6.0, -h2 - 0.8], [h2 + 0.75, 2.0]];
  for (const [x, z] of heaps) {
    const r = 0.55 + v() * 0.35;
    mound(sink, [x, foot, z], [1, 0, 0], [0, 0, 1], r, r * 0.8, 0.35 + v() * 0.35 - foot, MUD, { decor: true }, v() * 3, 5);
  }
  // the flagpole on the tower and the flag of Jordan: black, white and green, the red chevron at the hoist reaching half
  // the fly and the white seven-pointed star in it; a cloth (six panels) that ripples and droops toward the fly, both
  // faces, the chevron and the star on the same surface as the stripes (dressing)
  const fx = tx + 1.4, fz = tz - 1.4, poleTop = TH + 7.5;
  bar(sink, 'structureMetal', [fx, TH, fz], [fx, poleTop, fz], 0.1, { colour: rgb(0xb8b8b0), decor: true });
  sink.cylinder('structureMetal', [fx, poleTop, fz], 'y', 0.16, 0.1, 6, { colour: rgb(0xc8b070), decor: true });
  const fw = 3.6, fh = 1.8, fy = poleTop - 0.12 - fh, ph = v() * Math.PI * 2, cw = fw / 2;
  const cloth = (x: number, y: number, lift = 0): Vec3 => {
    const t = x / fw;
    return [fx + 0.06 + x * 0.97, fy + y - 0.3 * t * t, fz + Math.sin(t * 4.4 + ph) * 0.2 * t + lift];
  };
  const panel = (poly: readonly UV[], colour: Rgb): void => {
    if (poly.length < 3) return;
    const front = poly.map(([x, y]) => cloth(x, y));
    sink.polygon('structureMetal', front, { colour, decor: true });
    sink.polygon('structureMetal', [...front].reverse(), { colour: shade(colour, 0.82), decor: true });
  };
  const upper = (x: number): number => fh / 2 + fh / 2 * (1 - x / cw), lower = (x: number): number => fh / 2 - fh / 2 * (1 - x / cw);
  const bands: Array<[number, number, Rgb]> = [[fh * 2 / 3, fh, FLAG_BLACK], [fh / 3, fh * 2 / 3, FLAG_WHITE], [0, fh / 3, FLAG_GREEN]];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * fw, b = (k + 1) / 6 * fw;
    for (const [y0, y1, colour] of bands) {
      const cell: UV[] = [[a, y0], [b, y0], [b, y1], [a, y1]];
      if (a >= cw - 1e-6) { panel(cell, colour); continue; }
      panel(clipPoly(cell, (p) => p[1] - upper(p[0])), colour);
      panel(clipPoly(cell, (p) => lower(p[0]) - p[1]), colour);
    }
    if (a < cw - 1e-6) panel(clipPoly(clipPoly([[a, 0], [b, 0], [b, fh], [a, fh]], (p) => upper(p[0]) - p[1]), (p) => p[1] - lower(p[0])), FLAG_RED);
  }
  const sx = cw * 0.34, sy = fh / 2, sr = fh * 0.12;
  for (const s of [1, -1]) for (let i = 0; i < 14; i++) {
    const r0 = i % 2 === 0 ? sr : sr * 0.48, r1 = i % 2 === 0 ? sr * 0.48 : sr, a0 = Math.PI / 2 + i * Math.PI / 7, a1 = a0 + Math.PI / 7;
    const cc = cloth(sx, sy, s * 0.012), p0 = cloth(sx + Math.cos(a0) * r0, sy + Math.sin(a0) * r0, s * 0.012), p1 = cloth(sx + Math.cos(a1) * r1, sy + Math.sin(a1) * r1, s * 0.012);
    sink.polygon('structureMetal', s > 0 ? [cc, p0, p1] : [cc, p1, p0], { colour: FLAG_WHITE, decor: true });
  }
  // the stair up to the wall walk along the left range's court face, its flights' parapet; the shade over the court's
  // front corner (timber posts and a palm-frond mat) with the patrol's stores under it
  const stx = -ri + 0.6, stRun = rh * 1.3;
  for (let k = 0; k < 9; k++) {
    const y = rh * (k + 1) / 9, z = ri - 1.2 - stRun * k / 9;
    sink.span(wall, stx, foot, z - stRun / 9, stx + 1.1, y, z, {});
  }
  sink.span(wall, stx + 1.1, foot, ri - 1.2 - stRun, stx + 1.3, rh * 0.5, ri - 1.2, { decor: true });
  const cx0 = ri - 7.5, cz0 = ri - 6.0;
  for (const [x, z] of [[cx0, cz0], [ri - 0.3, cz0], [cx0, ri - 0.3], [ri - 0.3, ri - 0.3]] as const) bar(sink, 'structureWood', [x, 0, z], [x, 2.7, z], 0.14, { colour: DOOR, decor: true });
  sink.span('straw', cx0 - 0.3, 2.7, cz0 - 0.3, ri, 2.82, ri, { colour: rgb(0x9a8058), decor: true });
  for (let k = 0; k < 5; k++) sink.cylinder('structureMetal', [cx0 + 1 + k * 1.1, 0, cz0 + 1.0 + (k % 2) * 0.4], 'y', 0.9, 0.3, 8, { colour: [rgb(0x4a5a3a), rgb(0x6a5a3a)][k % 2], decor: true });
  sink.span('structureWood', cx0 + 1.0, 0, ri - 2.4, cx0 + 3.2, 0.8, ri - 1.2, { colour: rgb(0x7a6a4a), decor: true });
  // the water tank on its braced steel stand beside the gate, outside the front wall: the legs on their concrete
  // footings, the cross bracing, the tank weathered to rust below its seams, its lid, the ladder and the down pipe
  const wx = gx + 2.6, wz = h2 + 2.2, wy = 3.4, TANK = rgb(0x8a8578);
  const legs: Array<[number, number]> = [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]];
  for (const [dx, dz] of legs) {
    bar(sink, 'structureMetal', [wx + dx, foot, wz + dz], [wx + dx * 0.8, wy, wz + dz * 0.8], 0.12, { colour: IRON });
    sink.span('stone', wx + dx - 0.22, foot, wz + dz - 0.22, wx + dx + 0.22, 0.2, wz + dz + 0.22, { shade: 0.85 });
  }
  for (let k = 0; k < 4; k++) {
    const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
    bar(sink, 'structureMetal', [wx + ax * 0.97, 0.3, wz + az * 0.97], [wx + bx * 0.84, wy - 0.3, wz + bz * 0.84], 0.05, { colour: IRON, decor: true });
    bar(sink, 'structureMetal', [wx + bx * 0.97, 0.3, wz + bz * 0.97], [wx + ax * 0.84, wy - 0.3, wz + az * 0.84], 0.05, { colour: IRON, decor: true });
  }
  sink.cylinder('structureMetal', [wx, wy, wz], 'y', 1.6, 1.1, 12, { colour: TANK });
  sink.cylinder('structureMetal', [wx, wy - 0.02, wz], 'y', 0.55, 1.115, 12, { colour: mix(TANK, rgb(0x7a4a2a), 0.55), decor: true }, 1.115, false);
  revolve(sink, 'structureMetal', wx, wz, [[1.16, wy + 1.6], [1.16, wy + 1.66], [0.001, wy + 2.05]], 12, { colour: shade(TANK, 0.9) });
  for (const s of [-0.22, 0.22]) bar(sink, 'structureMetal', [wx - 1.16, 0.0, wz + s], [wx - 1.16, wy + 1.6, wz + s], 0.04, { colour: IRON, decor: true, fine: 'near' });
  for (let y = 0.4; y < wy + 1.5; y += 0.5) bar(sink, 'structureMetal', [wx - 1.16, y, wz - 0.22], [wx - 1.16, y, wz + 0.22], 0.03, { colour: IRON, decor: true, fine: 'near' });
  bar(sink, 'structureMetal', [wx + 0.3, wy, wz - 0.4], [wx + 0.3, 0.4, wz - 0.4], 0.07, { colour: shade(TANK, 0.75), decor: true });
  return { parts: sink.finish() };
};

const TURF = rgb(0x6f7d45), TURF_DRY = rgb(0x8a8456), SNOW = rgb(0xe4e9ee), SNOW_DRY = rgb(0xd3dbe2), ARMOUR = rgb(0x3e423f), WIRE = rgb(0x3a3430);

/**
 * casemateFort: a fortress front of the 1880s-1930s as a set piece, in two styles.
 * - 'lorraine': a Metz fort's barracks group (the census for Autumn: "Fort Driant type: turf-covered concrete barracks,
 *   armoured turret cupolas, a dry ditch and wire" on the crest above the valley). The casemate block's concrete front in
 *   its court (its doors, the tall steel-shuttered windows and the dressed portal with the fort's name), weathered in
 *   streaks under the earth line and the sills; the earth cover one rounded mass rolling from the front's top course
 *   over the vaults and down the back and both ends to the ground; the steel cupolas of the turret battery and an
 *   observation cloche in the turf; the court's concrete counterscarp, the glacis over it and the wire on the glacis, so
 *   the lower front sits below a viewer's eye in the valley.
 * - 'alpine': a Sardinian (and later Maginot) battery on the alpine spurs: a polygonal front of squared stone in two faces
 *   meeting at a salient, a caponier in the ditch at the salient, deep splayed gun embrasures in dressed stone surrounds
 *   with their steel shutters and guns, the parapet and its chemin de ronde over the front, the armoured entrance block
 *   at the left flank over its drawbridge pit, the snow-covered earth over the vaults (its vents and an observation
 *   cloche), the stone counterscarp and its snow bank following the front.
 * `length` the front (x), `depth` the block and its cover (z), the front (+z) on the ditch.
 */
export const casemateFort: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const alpine = ctx.params.style === 'alpine';
  // the cover's earth: turf in Lorraine; on the Alpine spurs the snow that lies on every other slope of the map
  const EARTH = alpine ? SNOW : TURF, EARTH_DRY = alpine ? SNOW_DRY : TURF_DRY;
  const Lf = num(ctx, 'length', 24, 90), D = num(ctx, 'depth', 10, 30), H = num(ctx, 'height', 3.5, 8);
  const cup = Math.round(num(ctx, 'cupolas', 0, 4)), foot = -0.6 - ctx.groundFall;
  const wall: RegionalBucket = alpine ? 'stone' : 'plaster3', decor: EmitOptions = { decor: true };
  const g = (x: number, z: number): number => ctx.ground?.(x, z) ?? 0;
  // the plan: Lorraine's straight front at z1; the alpine front's two faces falling back 0.18 m a metre from the salient
  // (x = 0, zS) to its ends (zE), the entrance block on the left flank from -Lf/2 to xe; the cover's back foot at z0
  const z0 = -D / 2 - 1, z1 = D / 2 - 8, zS = D / 2 - 7, slope = 0.182, zE = zS - slope * Lf / 2, xe = -Lf / 2 + 7;
  const zf = (x: number): number => (alpine ? zS - slope * Math.abs(x) : z1);
  // (it drapes: the front stands on the highest ground along it, its foot down to the lowest; the cover's back and ends
  // run down to the ground as it lies, so a fort cut into a côte or a spur sits in its slope)
  let yb = 0;
  for (let i = 0; i <= 8; i++) { const x = -Lf / 2 + Lf * i / 8; yb = Math.max(yb, g(x, zf(x))); }
  const blockFoot = foot - yb;
  // the cover's mottling: turf and its dry patches, or drifted snow and its wind-scoured crust
  const p1 = v() * 6.28, p2 = v() * 6.28;
  const mottle = (p: Vec3): Rgb => {
    const n = 0.5 + 0.5 * Math.sin(p[0] * 0.21 + p1) * Math.sin(p[2] * 0.33 + p[0] * 0.07 + p2);
    return shade(mix(EARTH, EARTH_DRY, n), (alpine ? 0.94 : 0.9) + 0.12 * clamp01((p[1] + 1) / 8));
  };
  const earth: EmitOptions = { colourAt: mottle };
  sink.placed(0, 0, yb, 0, () => {
    // the cover's profile from its lip (t 0) over the crest to the back's foot (t 1): heights in the block's frame; the
    // back tilts with the ground behind (a fort cut into a slope has its back buried)
    const Rc = alpine ? 1.7 : 3.2, top = H + Rc;
    const PROFILE: ReadonlyArray<readonly [number, number]> = alpine
      ? [[0, H + 0.1], [0.06, H + 0.45 * Rc], [0.15, H + 0.8 * Rc], [0.27, top], [0.42, H + 0.95 * Rc], [0.56, H + 0.7 * Rc], [0.7, top * 0.6],
        [0.83, top * 0.32], [0.93, top * 0.1], [1, -0.3]]
      : [[0, H - 0.1], [0.03, H + 0.35 * Rc], [0.08, H + 0.65 * Rc], [0.15, H + 0.87 * Rc], [0.25, H + 0.98 * Rc], [0.36, top], [0.48, H + 0.92 * Rc],
        [0.6, H + 0.7 * Rc], [0.72, top * 0.62], [0.84, top * 0.33], [0.93, top * 0.12], [1, -0.3]];
    const CREST = alpine ? 3 : 5;
    // (the lip: Lorraine's turf rolls over the front's top course, 15 cm proud; the alpine snow starts behind the walk)
    const zLip = (x: number): number => (alpine ? zf(x) - 2.08 : z1 + 0.15);
    // (the ends spill forward: Lorraine's to the counterscarp, closing the court's ends; the alpine ones into the ditch)
    const spill = alpine ? 2.5 : 4.45;
    const section = (x: number, s: number, bump: number): Vec3[] => {
      const f = Math.sqrt(Math.max(0, 1 - s * s)), zs = zLip(x) + s * spill;
      const base = (z: number): number => g(x, z) - yb - 0.3;
      const pts: Vec3[] = [[x, s > 0 ? Math.min(base(zs), blockFoot) : H - 0.3, s > 0 ? zs : zLip(x) - 0.2]];
      for (const [t, y] of PROFILE) {
        const z = zs + (z0 - zs) * t, raw = y + (g(x, z) - yb) * t + bump * Math.sin(Math.PI * t);
        pts.push([x, base(z) + (raw - base(z)) * f, z]);
      }
      return pts;
    };
    // the stations along the cover: its ends rolling down to the ground (s 0 to 1 past the block), the block between
    const xl = alpine ? xe : -Lf / 2, xr = Lf / 2, exL = alpine ? 7.2 : 4, exR = 4;
    const ENDS = [0.0001, 0.4, 0.7, 0.9, 1];
    const main: number[] = [];
    const nMain = Math.max(2, Math.ceil((xr - xl) / 7.5));
    for (let i = 0; i <= nMain; i++) main.push(xl + (xr - xl) * i / nMain);
    // (alpine: a station on the salient, where the front's lip turns)
    const stations = alpine ? [...main.filter((x) => Math.abs(x) > 1), 0].sort((a, b) => a - b) : main;
    const rows: Vec3[][] = [];
    for (const s of [...ENDS].reverse()) rows.push(section(xl - exL * s, s, 0));
    for (const x of stations) rows.push(section(x, 0, (v() - 0.5) * 0.5));
    for (const s of ENDS) rows.push(section(xr + exR * s, s, 0));
    sheet(sink, 'structureWood', rows, earth);
    const crestAt = (x: number): Vec3 => section(x, 0, 0)[CREST + 1];

    if (alpine) {
      // the polygonal front: two faces of squared stone meeting at the salient (the left from the entrance block)
      const faceOf = (a: UV, b: UV): Face => {
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
        return { origin: [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], u: [dx / l, 0, dz / l], out: [-dz / l, 0, dx / l], width: l };
      };
      const fl = faceOf([xe, zf(xe)], [0, zS]), fr = faceOf([0, zS], [Lf / 2, zE]);
      // the casemates' mass behind the front (its embrasures' throats cut 1.5 m into it)
      extrude(sink, wall, [[xe, blockFoot, zf(xe) - 1.62], [0, blockFoot, zS - 1.62], [Lf / 2, blockFoot, zE - 1.62], [Lf / 2, blockFoot, zS - 9], [xe, blockFoot, zS - 9]],
        [0, 1, 0], H - blockFoot, { shade: 0.9 });
      sink.quad(wall, [Lf / 2, blockFoot, zE], [Lf / 2, blockFoot, zE - 1.62], [Lf / 2, H, zE - 1.62], [Lf / 2, H, zE], {});
      const along = (f: Face, prof: ReadonlyArray<readonly [number, number]>, u0: number, u1: number, bucket: RegionalBucket, opts: EmitOptions): void =>
        extrude(sink, bucket, prof.map(([o, y]) => facePoint(f, u0, y, o)), f.u, u1 - u0, opts);
      const fronts: Array<[Face, number[]]> = [[fl, [0.3, 0.62]], [fr, [0.28, 0.55, 0.82]]];
      for (const [f, embr] of fronts) {
        const w = f.width, holes: ArchHole[] = embr.map((t): ArchHole => ({ u: -w / 2 + t * w, w: 2.0, y0: 1.2, spring: 2.5, form: 'flat' }));
        archedFace(sink, wall, f, { u0: -w / 2, u1: w / 2, y0: blockFoot, y1: H }, holes, 0, {});
        for (const h of holes) {
          // the embrasure: splayed from its 2 m mouth to a 0.7 m throat 1.5 m in, the steel shutter in the throat with
          // the gun's slot (a gun run out through it in most), the dressed surround, the wash stained under the sill
          const Q = (u: number, y: number, o: number): Vec3 => facePoint(f, h.u + u, y, o);
          const ol = Q(-1, 1.2, 0), or = Q(1, 1.2, 0), ou = Q(1, 2.5, 0), oul = Q(-1, 2.5, 0);
          const il = Q(-0.35, 1.55, -1.5), ir = Q(0.35, 1.55, -1.5), iu = Q(0.35, 2.2, -1.5), iul = Q(-0.35, 2.2, -1.5);
          const splay: EmitOptions = { decor: true, shade: 0.7 };
          sink.quad(wall, ol, or, ir, il, { ...splay, shade: 0.82 });
          sink.quad(wall, ou, oul, iul, iu, { ...splay, shade: 0.55 });
          sink.quad(wall, oul, ol, il, iul, splay);
          sink.quad(wall, or, ou, iu, ir, splay);
          sink.quad('structureMetal', Q(-0.36, 1.54, -1.49), Q(0.36, 1.54, -1.49), Q(0.36, 2.21, -1.49), Q(-0.36, 2.21, -1.49), { colour: ARMOUR, decor: true });
          sink.quad('dark', Q(-0.24, 1.8, -1.48), Q(0.24, 1.8, -1.48), Q(0.24, 1.95, -1.48), Q(-0.24, 1.95, -1.48), decor);
          if (v() < 0.7) bar(sink, 'structureMetal', Q(0, 1.87, -1.6), Q(0, 1.87, -0.35), 0.16, { colour: shade(ARMOUR, 0.8), decor: true });
          archSurround(sink, 'stone', f, h, 0.45, 0.12, { keystone: false, sill: true });
        }
        // the wash streaked down the stone from the cordon (under the snow on the parapet)
        for (let u = -w / 2 + 1.2; u < w / 2 - 0.8; u += 2.3) {
          const uu = u + (v() - 0.5) * 0.9, len = 0.6 + v() * 0.9, sw = 0.5 + v() * 0.5, y1 = H - 0.42;
          sink.quad(wall, facePoint(f, uu - sw / 2, y1 - len, 0.012), facePoint(f, uu + sw / 2, y1 - len, 0.012), facePoint(f, uu + sw / 2 + 0.15, y1, 0.012), facePoint(f, uu - sw / 2 - 0.15, y1, 0.012),
            { decor: true, shadeAt: (p) => 0.66 + 0.34 * clamp01((y1 - p[1]) / len) });
        }
        // the talus at the front's foot, the cordon under the parapet, the parapet (its superior slope falling to the
        // front, its loopholes, snow on it) and the chemin de ronde behind it, snow drifted against the parapet
        along(f, [[-0.05, blockFoot], [0.7, blockFoot], [0.0, 1.0], [-0.05, 1.0]], -w / 2, w / 2 + 0.7, wall, { shade: 0.85 });
        along(f, [[-0.02, H - 0.42], [0.12, H - 0.38], [0.18, H - 0.24], [0.12, H - 0.1], [-0.02, H - 0.07]], -w / 2, w / 2 + 0.2, 'stone', { decor: true, shade: 1.08 });
        along(f, [[0.05, H - 0.05], [0.05, H + 1.0], [-0.75, H + 1.2], [-0.75, H - 0.05]], -w / 2, w / 2 + 0.8, wall, { shade: 0.95 });
        along(f, [[0.08, H + 0.98], [-0.78, H + 1.18], [-0.7, H + 1.33], [-0.05, H + 1.12]], -w / 2, w / 2 + 0.8, 'structureWood', { decor: true, colour: SNOW_DRY });
        along(f, [[-0.75, H - 0.05], [-2.1, H - 0.05], [-2.1, H + 0.1], [-0.75, H + 0.1]], -w / 2, w / 2 + 1.2, 'stone', { shade: 0.78 });
        along(f, [[-0.75, H + 0.1], [-0.75, H + 0.55], [-1.45, H + 0.1]], -w / 2, w / 2, 'structureWood', { decor: true, colour: SNOW });
        for (let u = -w / 2 + 1.6; u < w / 2 - 1; u += 3.4) {
          const uu = u + (v() - 0.5) * 0.8;
          sink.quad('dark', facePoint(f, uu - 0.07, H + 0.35, 0.065), facePoint(f, uu + 0.07, H + 0.35, 0.065), facePoint(f, uu + 0.07, H + 0.8, 0.065), facePoint(f, uu - 0.07, H + 0.8, 0.065), decor);
        }
      }
      // the caponier in the ditch at the salient: a low pentagon of stone flanking both faces through its loopholes,
      // its stone roof under snow
      const cap: UV[] = [[-3.2, zf(3.2) - 0.3], [-2.3, zS + 3.0], [0, zS + 4.2], [2.3, zS + 3.0], [3.2, zf(3.2) - 0.3]];
      const Hc = 2.9;
      extrude(sink, wall, cap.map(([x, z]): Vec3 => [x, blockFoot, z]), [0, 1, 0], Hc - blockFoot, {});
      const cc: UV = [0, zS + 1.6];
      extrude(sink, 'structureWood', cap.map(([x, z]): Vec3 => [cc[0] + (x - cc[0]) * 0.97, Hc, cc[1] + (z - cc[1]) * 0.97]), [0, 1, 0], 0.4, { decor: true, colour: SNOW });
      for (let i = 0; i < 4; i++) {
        const a = cap[i], b = cap[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
        const ex = dx / l, ez = dz / l, nx = ez, nz = -ex;
        // (e × y faces the edge's outside: the pentagon is wound clockwise seen from above)
        const flip = nx * (a[0] + b[0] - 2 * cc[0]) + nz * (a[1] + b[1] - 2 * cc[1]) < 0 ? -1 : 1;
        for (const t of i === 0 || i === 3 ? [0.35, 0.7] : [0.5]) {
          const px = a[0] + dx * t + nx * flip * 0.02, pz = a[1] + dz * t + nz * flip * 0.02, sx = ex * 0.08 * -flip, sz = ez * 0.08 * -flip;
          sink.quad('dark', [px - sx, 1.0, pz - sz], [px + sx, 1.0, pz + sz], [px + sx, 1.65, pz + sz], [px - sx, 1.65, pz - sz], decor);
        }
      }
      // the entrance block on the left flank: proud of the front and higher than it, its round-arched door between
      // dressed quoins with the steel doors shut in it and the date stone over it, its parapet and snow, the drawbridge
      // over its pit before the door (lowered, the pit dark either side of it) and the chains up to the arch
      const xc = (-Lf / 2 + xe) / 2, We = xe + Lf / 2, ze = zS, zeB = ze - 8, He = H + 1.6;
      const fe: Face = { origin: [xc, 0, ze], u: [1, 0, 0], out: [0, 0, 1], width: We };
      const door: ArchHole = { u: 0, w: 2.2, y0: 0, spring: 2.3, form: 'round' };
      archedFace(sink, wall, fe, { u0: -We / 2, u1: We / 2, y0: blockFoot, y1: He }, [door], 0.75, {});
      archSurround(sink, 'stone', fe, door, 0.45, 0.12, { keystone: true, sill: false });
      sink.quad(wall, [-Lf / 2, blockFoot, zeB], [-Lf / 2, blockFoot, ze], [-Lf / 2, He, ze], [-Lf / 2, He, zeB], {});
      sink.quad(wall, [xe, blockFoot, ze], [xe, blockFoot, zeB], [xe, He, zeB], [xe, He, ze], {});
      sink.quad(wall, [xe, blockFoot, zeB], [-Lf / 2, blockFoot, zeB], [-Lf / 2, He, zeB], [xe, He, zeB], {});
      sink.quad(wall, [-Lf / 2, He, ze], [xe, He, ze], [xe, He, zeB], [-Lf / 2, He, zeB], {});
      sink.span(wall, -Lf / 2, He, ze - 0.6, xe, He + 0.75, ze, { shade: 0.95 });
      sink.span('structureWood', -Lf / 2 - 0.02, He + 0.75, ze - 0.62, xe + 0.02, He + 0.9, ze + 0.02, { decor: true, colour: SNOW_DRY });
      sink.span('structureWood', -Lf / 2 + 0.1, He, zeB + 0.3, xe - 0.1, He + 0.35, ze - 0.6, { decor: true, colour: SNOW });
      for (const u of [-2.4, 2.4]) sink.quad('dark', [xc + u - 0.07, He + 0.2, ze + 0.01], [xc + u + 0.07, He + 0.2, ze + 0.01], [xc + u + 0.07, He + 0.6, ze + 0.01], [xc + u - 0.07, He + 0.6, ze + 0.01], decor);
      for (const [x, sx] of [[-Lf / 2, 1], [xe, -1]] as const) for (let k = 0, y = blockFoot; y < He - 0.2; k++, y += 0.9) {
        const l = k % 2 ? 0.5 : 0.9;
        sink.quoin('stone', sx > 0 ? x - 0.05 : x - l, y, ze - (k % 2 ? 0.9 : 0.5), sx > 0 ? x + l : x + 0.05, Math.min(He, y + 0.88), ze + 0.06, sx > 0 ? -1 : 1, 1, { decor: true, shade: 1.12 });
      }
      sink.span('structureMetal', xc - 1.06, 0, ze - 0.68, xc + 1.06, 3.4, ze - 0.6, { colour: ARMOUR, decor: true });
      for (const y of [0.6, 1.6, 2.6]) sink.span('structureMetal', xc - 1.0, y, ze - 0.6, xc + 1.0, y + 0.1, ze - 0.56, { colour: shade(ARMOUR, 0.8), decor: true, fine: 'near' });
      sink.span('stone', xc - 0.8, 4.15, ze, xc + 0.8, 4.75, ze + 0.08, { decor: true, shade: 0.8 });
      const gl = Math.min(0, g(xc, ze + 1.5) - yb), pz1 = ze + 2.8;
      sink.quad('dark', [xc - 1.8, gl + 0.04, pz1], [xc + 1.8, gl + 0.04, pz1], [xc + 1.8, gl + 0.04, ze + 0.05], [xc - 1.8, gl + 0.04, ze + 0.05], decor);
      for (const s of [-1, 1]) sink.span('stone', xc + s * 1.8, Math.min(foot, gl - 0.4), ze, xc + s * 2.15, gl + 0.25, pz1 + 0.35, { shade: 0.85 });
      sink.span('stone', xc - 2.15, Math.min(foot, gl - 0.4), pz1, xc + 2.15, gl + 0.25, pz1 + 0.35, { shade: 0.85 });
      sink.span('structureWood', xc - 1.3, gl + 0.12, ze + 0.02, xc + 1.3, gl + 0.3, pz1 + 0.1, { colour: rgb(0x5d4a36), decor: true });
      for (const s of [-1, 1]) bar(sink, 'structureMetal', [xc + s * 1.25, 3.5, ze + 0.06], [xc + s * 1.25, gl + 0.32, pz1], 0.05, { colour: IRON, decor: true, fine: true });
      // the cover's vents (the casemates' stove pipes in stone stacks) and the observation cloche on the crest
      for (const x of [-7, 9]) {
        const c = crestAt(x);
        sink.span('stone', x - 0.35, c[1] - 0.6, c[2] - 0.35, x + 0.35, c[1] + 1.2, c[2] + 0.35, { decor: true, shade: 0.9 });
        sink.span('stone', x - 0.5, c[1] + 1.2, c[2] - 0.5, x + 0.5, c[1] + 1.35, c[2] + 0.5, { decor: true, shade: 0.8 });
        sink.span('structureWood', x - 0.48, c[1] + 1.35, c[2] - 0.48, x + 0.48, c[1] + 1.5, c[2] + 0.48, { decor: true, colour: SNOW });
      }
      const oc = crestAt(Lf / 2 - 6);
      revolve(sink, 'structureMetal', oc[0], oc[2], [[0.95, oc[1] - 0.5], [0.9, oc[1] + 0.75], [0.6, oc[1] + 1.15], [0.001, oc[1] + 1.25]], 12, { colour: ARMOUR });
      sink.span('dark', oc[0] - 0.4, oc[1] + 0.5, oc[2] + 0.8, oc[0] + 0.4, oc[1] + 0.64, oc[2] + 0.95, decor);
    } else {
      // the casemate block: its concrete front pierced by the tall windows, the doors and the central portal; the vaults'
      // mass behind it; the ends closed
      const front: Face = { origin: [0, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: Lf };
      const bays = Math.max(3, Math.round(Lf / 4.2)) | 1, mid = (bays - 1) / 2, bay = Lf / bays;
      const holes: ArchHole[] = [];
      for (let k = 0; k < bays; k++) {
        const u = -Lf / 2 + (k + 0.5) * bay;
        holes.push(k === mid ? { u, w: 2.6, y0: 0, spring: 2.6, form: 'segmental', rise: 0.6 }
          : Math.abs(k - mid) === 4 ? { u, w: 1.6, y0: 0, spring: 2.5, form: 'segmental', rise: 0.3 }
            : { u, w: 1.3, y0: 0.9, spring: 2.75, form: 'segmental', rise: 0.3 });
      }
      archedFace(sink, wall, front, { u0: -Lf / 2, u1: Lf / 2, y0: blockFoot, y1: H }, holes, 0.9, {});
      sink.span(wall, -Lf / 2, blockFoot, z1 - 6, Lf / 2, H, z1 - 0.9, {});
      sink.quad(wall, [Lf / 2, blockFoot, z1], [Lf / 2, blockFoot, z1 - 0.9], [Lf / 2, H, z1 - 0.9], [Lf / 2, H, z1], {});
      sink.quad(wall, [-Lf / 2, blockFoot, z1 - 0.9], [-Lf / 2, blockFoot, z1], [-Lf / 2, H, z1], [-Lf / 2, H, z1 - 0.9], {});
      const P = (u: number, y: number, o: number): Vec3 => [u, y, z1 + o];
      holes.forEach((h, k) => {
        const crown = h.spring + (h.rise ?? 0);
        if (k === mid) {
          // the portal: its dressed stone frame and keystone, the steel doors, the plaque with the fort's name
          archSurround(sink, 'stone', front, h, 0.55, 0.15, { keystone: true, sill: false });
          sink.span('structureMetal', h.u - h.w / 2 + 0.05, 0, z1 - 0.72, h.u + h.w / 2 - 0.05, crown, z1 - 0.66, { colour: ARMOUR, decor: true });
          sink.span('stone', h.u - 1.6, crown + 0.75, z1 - 0.02, h.u + 1.6, crown + 1.35, z1 + 0.1, { decor: true, shade: 0.82 });
          sink.quad('dark', P(h.u - 1.3, crown + 0.93, 0.105), P(h.u + 1.3, crown + 0.93, 0.105), P(h.u + 1.3, crown + 1.17, 0.105), P(h.u - 1.3, crown + 1.17, 0.105), { decor: true, fine: 'near' });
          return;
        }
        archSurround(sink, wall, front, h, 0.28, 0.12, { keystone: false, sill: h.y0 > 0 });
        if (h.y0 === 0) { sink.span('structureMetal', h.u - h.w / 2 + 0.05, 0, z1 - 0.88, h.u + h.w / 2 - 0.05, crown, z1 - 0.84, { colour: ARMOUR, decor: true }); return; }
        // the window's steel shutters: shut in the reveal, or folded back either side of it (heavy plate, each leaf's
        // two faces: they read from the valley); the wash stained down from its sill
        if (v() < 0.55) sink.span('structureMetal', h.u - h.w / 2 + 0.02, h.y0, z1 - 0.55, h.u + h.w / 2 - 0.02, crown, z1 - 0.5, { colour: ARMOUR, decor: true });
        else for (const s of [-1, 1]) {
          const a = P(h.u + s * (h.w / 2 + 0.3), h.y0 - 0.05, 0.14), b = P(h.u + s * (h.w / 2 + 0.95), h.y0 - 0.05, 0.62);
          const c = P(h.u + s * (h.w / 2 + 0.95), h.spring + 0.1, 0.62), d = P(h.u + s * (h.w / 2 + 0.3), h.spring + 0.1, 0.14);
          sink.quad('structureMetal', ...(s > 0 ? [a, b, c, d] as const : [b, a, d, c] as const), { colour: ARMOUR, decor: true });
          sink.quad('structureMetal', ...(s > 0 ? [b, a, d, c] as const : [a, b, c, d] as const), { colour: shade(ARMOUR, 0.8), decor: true });
        }
        const sl = h.y0 - 0.12, len = 0.6 + v() * 0.8;
        sink.quad(wall, P(h.u - h.w * 0.32, sl - len, 0.013), P(h.u + h.w * 0.32, sl - len, 0.013), P(h.u + h.w * 0.4, sl, 0.013), P(h.u - h.w * 0.4, sl, 0.013),
          { decor: true, shadeAt: (p) => 0.74 + 0.26 * clamp01((sl - p[1]) / len) });
      });
      // the concrete weathered: the earth's wash streaked down from the top course bay by bay, the damp band over the
      // court's floor between the doors, spalled patches; the drain along the foot
      for (let k = 0; k < bays; k++) {
        const u = -Lf / 2 + (k + 0.5) * bay, len = 0.6 + v() * 0.9, dark = 0.58 + v() * 0.14, w = bay * (0.42 + v() * 0.22);
        sink.quad(wall, P(u - w / 2, H - len, 0.012), P(u + w / 2, H - len, 0.012), P(u + w / 2 + 0.2, H, 0.012), P(u - w / 2 - 0.2, H, 0.012),
          { decor: true, shadeAt: (p) => dark + (1 - dark) * clamp01((H - p[1]) / len) });
      }
      const grounded = holes.filter((h) => h.y0 === 0).map((h) => [h.u - h.w / 2 - 0.05, h.u + h.w / 2 + 0.05]);
      const cuts = [-Lf / 2, ...grounded.flat(), Lf / 2];
      for (let i = 0; i + 1 < cuts.length; i += 2) {
        sink.quad(wall, P(cuts[i], blockFoot, 0.012), P(cuts[i + 1], blockFoot, 0.012), P(cuts[i + 1], 0.75, 0.012), P(cuts[i], 0.75, 0.012),
          { decor: true, shadeAt: (p) => 0.72 + 0.28 * clamp01(p[1] / 0.75) });
      }
      for (let k = 0; k < 4; k++) {
        const u = -Lf / 2 + 2 + v() * (Lf - 4), y = 3.4 + v() * (H - 4.3), r = 0.25 + v() * 0.3;
        sink.polygon(wall, [P(u - r, y - r * 0.6, 0.014), P(u + r * 0.8, y - r * 0.7, 0.014), P(u + r * 1.1, y + r * 0.3, 0.014), P(u - r * 0.2, y + r * 0.6, 0.014), P(u - r * 1.1, y + r * 0.2, 0.014)],
          { decor: true, shade: 0.84 });
      }
      sink.span('stone', -Lf / 2, -0.25, z1, Lf / 2, 0.05, z1 + 0.55, { decor: true, shade: 0.75 });
      // the turret battery's cupolas on the crest: steel domes in their concrete collars, the gun's slit in each, the
      // muzzles turned (look stream) to the valley; the observation cloche at the end
      for (let k = 0; k < cup; k++) {
        const x = -Lf / 2 + (k + 0.5) * Lf / cup + (v() - 0.5) * 2, c = crestAt(x), y = c[1] - 0.2, z = c[2];
        revolve(sink, 'stone', x, z, [[3.6, y - 0.6], [3.5, y + 0.3], [2.6, y + 0.45], [2.55, y + 0.4]], 24, { shade: 0.86 });
        const dome: Array<[number, number]> = [];
        for (let i = 0; i <= 6; i++) { const a = (Math.PI / 2) * i / 6; dome.push([Math.max(0.001, Math.cos(a) * 2.4), y + 0.4 + Math.sin(a) * 1.0]); }
        revolve(sink, 'structureMetal', x, z, dome, 24, { colour: ARMOUR });
        const yaw = (v() - 0.5) * 1.2;
        sink.placed(yaw, x, y + 0.9, z, () => {
          sink.span('dark', -0.9, -0.15, 2.05, 0.9, 0.15, 2.15, { decor: true });
          for (const s of [-0.4, 0.4]) bar(sink, 'structureMetal', [s, 0, 1.8], [s, 0, 3.3], 0.22, { colour: shade(ARMOUR, 0.8), decor: true });
        });
      }
      const oc = crestAt(Lf / 2 - 4);
      revolve(sink, 'structureMetal', oc[0], oc[2] + 1, [[1.0, oc[1] - 0.6], [0.95, oc[1] + 0.9], [0.6, oc[1] + 1.4], [0.001, oc[1] + 1.5]], 12, { colour: ARMOUR });
      sink.span('dark', oc[0] - 0.45, oc[1] + 0.6, oc[2] + 1.85, oc[0] + 0.45, oc[1] + 0.75, oc[2] + 2.0, decor);
    }
  });
  // the ditch's counterscarp: its revetment (the ditch's far side) breaking the ground in runs that follow it, the bank
  // of the glacis over it falling away to the ground (Lorraine: the wire on it)
  const runAlong = (a: UV, b: UV, n: number, wallH: number, bank: number, taper0: boolean, taper1: boolean): void => {
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, p: UV = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const q: UV = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      const ex = dx / l, ez = dz / l, nx = -ez, nz = ex;
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, gy = g(mx + nx * 0.3, mz + nz * 0.3), gt = g(mx + nx * (0.6 + bank), mz + nz * (0.6 + bank));
      const tapered = (taper0 && k === 0) || (taper1 && k === n - 1), hk = tapered ? wallH * 0.55 : wallH, low = Math.min(foot, gy - 1.2);
      const at = (o: number, y: number): Vec3 => [p[0] + nx * o, y, p[1] + nz * o];
      extrude(sink, alpine ? 'stone' : 'plaster3', [at(0, low), at(0.6, low), at(0.6, gy + hk), at(0, gy + hk)], [ex, 0, ez], l + 0.05, { shade: 0.86 });
      extrude(sink, 'structureWood', [at(0.6, gy + hk), at(0.6, low), at(0.6 + bank, Math.min(gt, gy) - 1.2), at(0.6 + bank, gt - 0.25)], [ex, 0, ez], l + 0.05, earth);
      // (a tapered run's open end: the bank hipped down to the ground past it)
      if (tapered) {
        const s = taper0 && k === 0 ? -1 : 1, e: UV = s < 0 ? p : [q[0] + ex * 0.05, q[1] + ez * 0.05];
        const B: Vec3 = [e[0] + nx * 0.6, gy + hk, e[1] + nz * 0.6], C: Vec3 = [e[0] + nx * (0.6 + bank), gt - 0.25, e[1] + nz * (0.6 + bank)];
        const G: Vec3 = [e[0] + ex * s * 2.5 + nx * (0.6 + bank / 2), g(e[0] + ex * s * 2.5, e[1] + nz * (0.6 + bank / 2)) - 0.2, e[1] + ez * s * 2.5 + nz * (0.6 + bank / 2)];
        sink.polygon('structureWood', s > 0 ? [B, C, G] : [C, B, G], earth);
      }
    }
  };
  if (alpine) {
    // (parallel to the faces 5.2 m out: the caponier's nose 1 m short of it; the entrance block keeps its own pit)
    const lift = 5.2 * Math.hypot(1, slope), xa = xe - 0.5, xb = Lf / 2 + 1.5;
    // (each face's run carried 0.8 m past the salient into its fellow, so the angle closes)
    runAlong([xa, zf(xa) + lift], [0.8, zS + lift + slope * 0.8], 3, 0.8, 2.6, true, false);
    runAlong([-0.8, zS + lift + slope * 0.8], [xb, zf(xb) + lift], 4, 0.8, 2.6, false, true);
  } else {
    const c0 = z1 + 4, runs = Math.max(2, Math.round((Lf + 4) / 6)), bank = 5.0;
    runAlong([-Lf / 2 - 2, c0], [Lf / 2 + 2, c0], runs, 2.4, bank, true, true);
    // the wire on the glacis: iron pickets and two strands (fine dressing)
    const zw = c0 + 0.6 + 2.4;
    const yAt = (x: number): number => { const gy = g(x, c0 + 0.3), gt = g(x, c0 + 0.6 + bank); return gy + 2.4 + (gt - 0.25 - gy - 2.4) * 2.4 / bank; };
    for (let x = -Lf / 2; x < Lf / 2; x += 3) {
      const zz = zw + (v() - 0.5) * 0.3, y0 = yAt(x), y1 = yAt(x + 3), lean = (v() - 0.5) * 0.15;
      bar(sink, 'structureMetal', [x, y0 - 0.3, zz], [x + lean, y0 + 1.3, zz], 0.06, { colour: WIRE, decor: true, fine: true });
      for (const y of [0.55, 1.15]) {
        const a: Vec3 = [x, y0 + y, zz], b: Vec3 = [x + 3, y1 + y + (v() - 0.5) * 0.12, zz], up = 0.03;
        const opts: EmitOptions = { colour: WIRE, decor: true, fine: true };
        sink.quad('structureMetal', a, b, [b[0], b[1] + up, b[2]], [a[0], a[1] + up, a[2]], opts);
        sink.quad('structureMetal', b, a, [a[0], a[1] + up, a[2]], [b[0], b[1] + up, b[2]], opts);
      }
    }
  }
  return { parts: sink.finish() };
};
