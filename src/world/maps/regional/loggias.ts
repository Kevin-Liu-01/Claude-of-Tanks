// src/world/maps/regional/loggias.ts — the harbour square's civic market buildings of the Dalmatian coast, member-built
// (props census #23, the looks lane 2026-10-16; WORKLIST.md "Markets & stalls", the judges on kit:dalmatian/marketRow:
// "no spandrels fill between the voussoir ring and the architrave, so the arches read as rings hung under a beam; the
// piers have no base or impost moulding; the roof soffit a flat slab with no timbers; the back one 12 m blank stone
// plane"; on kit:dalmatian/market: "box-only: every pier a base, shaft and cap span; a flat roof soffit with no
// timbers; the tables with no lip or drain; the platform slabs with no joints"). The town loggia (loža: Trogir, Hvar,
// Korčula) and the fish market (ribarnica: Trogir, Supetar), their limestone columns turned with base and capital, the
// loggia's arcade with its spandrels laid up to the architrave and the cornice round it, the open timber roofs under the
// canal tiles. Both fall as open frames (shedFall.ts): the columns break to heaps of their drums, the roof drops on its
// timbers, the loggia's back wall stands to a ragged top over its stones.
import { PartSink, alongPlot, faceBox, facePoint, pick, plotAxes, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofGeometry, type RoofSpec } from './house.ts';
import { archHead } from './sarajevoParts.ts';
import { hallRoofTimbers } from './marketHall.ts';
import { recordShed } from './shedFall.ts';
import type { RegionalBuildContext } from './types.ts';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const canalHip = (pitch: number, eave: number): RoofSpec => ({ kind: 'hip', pitchDeg: pitch, eave, verge: eave, thickness: 0.15, bucket: 'roof', ridge: 'round' });
const OAK: readonly Rgb[] = [0x5e4a36, 0x6a523a, 0x54412f].map(rgb);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** A quad wound to face `want` (any vector with a positive dot on its outward normal). */
function facing(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, c: Vec3, d: Vec3, want: Vec3, opts: EmitOptions): void {
  const u = sub(b, a), v = sub(d, a);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) sink.quad(bucket, a, b, c, d, opts);
  else sink.quad(bucket, d, c, b, a, opts);
}

/**
 * A limestone column on the floor `y0` at (x, z), its abacus's top `ys`, its shaft's radius at the foot `r`: the square
 * plinth, the torus and its fillet, the shaft diminishing to the astragal, the bell flaring to the abacus with a leaf
 * curled under each corner. Returns it as a leg (foot, head) for the frame's reading.
 */
function column(sink: PartSink, x: number, z: number, y0: number, ys: number, r: number, tint: Rgb, mobile: boolean): { foot: Vec3; head: Vec3 } {
  const o = { tint }, pl = r + 0.06, ab = r + 0.06, top = ys - 0.4, rt = r * 0.86;
  sink.span('stone', x - pl, y0 - 0.02, z - pl, x + pl, y0 + 0.13, z + pl, { tint: shade(tint, 0.97) });
  sink.cylinder('stone', [x, y0 + 0.13, z], 'y', 0.1, r + 0.05, 10, o, r + 0.03);
  sink.cylinder('stone', [x, y0 + 0.23, z], 'y', 0.07, r + 0.015, 10, o, r + 0.005);
  sink.cylinder('stone', [x, y0 + 0.3, z], 'y', top - y0 - 0.3, r, 10, o, rt, false);
  sink.cylinder('stone', [x, top, z], 'y', 0.06, rt + 0.03, 10, o, rt + 0.03);
  sink.cylinder('stone', [x, top + 0.06, z], 'y', 0.22, rt, 10, o, ab * 1.08);
  sink.span('stone', x - ab, ys - 0.12, z - ab, x + ab, ys, z + ab, { tint: shade(tint, 1.03) });
  sink.dressing(mobile, () => {
    // the leaves: a block curled out of the bell's lip under each corner of the abacus
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const a = ab - 0.13, b = ab - 0.02;
      sink.span('stone', Math.min(x + sx * a, x + sx * b), ys - 0.25, Math.min(z + sz * a, z + sz * b), Math.max(x + sx * a, x + sx * b), ys - 0.12,
        Math.max(z + sz * a, z + sz * b), { decor: true, fine: true, tint: shade(tint, 1.04) });
    }
  });
  return { foot: [x, y0, z], head: [x, ys, z] };
}

/** One bay of an arcade: its arch's springers along the wall (the arch's span from a to b). */
interface Bay { a: number; b: number }

/**
 * An arcade's wall over its supports, on `face` (its outer plane at o = 0, its inner at o = -t), from u0 to u1 between
 * the springing `ys` and the architrave's soffit `yt`: the solid over each support, the spandrels laid up over each arch
 * in strips to the architrave on both faces, the intrados through the wall; the voussoirs proud on both faces with a
 * keystone at each crown; its ends where they stand free.
 */
function arcadeWall(sink: PartSink, face: Face, u0: number, u1: number, bays: readonly Bay[], ys: number, yt: number, t: number, tint: Rgb,
  ends: readonly [boolean, boolean], mobile: boolean): void {
  const P = (u: number, y: number, o: number) => facePoint(face, u, y, o), out = face.out, inn = neg(out), opts: EmitOptions = { tint };
  const back: Face = { origin: P(0, 0, -t), u: neg(face.u), out: inn, width: face.width };
  const cuts = [u0, ...bays.flatMap((b) => [b.a, b.b]), u1];
  for (let k = 0; k + 1 < cuts.length; k += 2) {
    const ua = cuts[k], ub = cuts[k + 1];
    if (ub - ua < 0.004) continue;
    for (const o of [0, -t]) facing(sink, 'stone', P(ua, ys, o), P(ub, ys, o), P(ub, yt, o), P(ua, yt, o), o === 0 ? out : inn, opts);
  }
  const n = 8;
  for (const { a, b } of bays) {
    const m = (a + b) / 2, r = (b - a) / 2;
    const arc = (j: number): [number, number] => [m - Math.cos(Math.PI * j / n) * r, ys + Math.sin(Math.PI * j / n) * r];
    const centre = P(m, ys, -t / 2);
    for (let j = 0; j < n; j++) {
      const [ua, ya] = arc(j), [ub, yb] = arc(j + 1);
      for (const o of [0, -t]) facing(sink, 'stone', P(ua, ya, o), P(ub, yb, o), P(ub, yt, o), P(ua, yt, o), o === 0 ? out : inn, opts);
      facing(sink, 'stone', P(ua, ya, 0), P(ub, yb, 0), P(ub, yb, -t), P(ua, ya, -t), sub(centre, P((ua + ub) / 2, (ya + yb) / 2, -t / 2)), { tint, shade: 0.8 });
    }
    // the voussoirs a hand proud on both faces, the keystone standing out of the ring at the crown
    const ring = Math.min(0.26, yt - (ys + r) - 0.02);
    if (ring > 0.08) {
      archHead(sink, face, m, ys, r, 'stone', ring, 9);
      archHead(sink, back, -m, ys, r, 'stone', ring, 9);
      sink.dressing(mobile, () => {
        for (const [f, u] of [[face, m], [back, -m]] as const) faceBox(sink, 'stone', f, u, ys + r + ring / 2, 0.045, 0.2, ring + 0.06, 0.09, { decor: true, tint: shade(tint, 1.05) });
      });
    }
  }
  if (ends[0]) facing(sink, 'stone', P(u0, ys, 0), P(u0, ys, -t), P(u0, yt, -t), P(u0, yt, 0), neg(face.u), opts);
  if (ends[1]) facing(sink, 'stone', P(u1, ys, 0), P(u1, ys, -t), P(u1, yt, -t), P(u1, yt, 0), face.u, opts);
}

/**
 * The boards laid on the rafters under a hip roof's covering (centred on the emitting frame, its ridge along z): the two
 * long slopes and the two hip ends, a hand under the covering's soffit, seen from under the eaves and from inside.
 */
function roofBoards(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, timber: Rgb): void {
  const ex = rg.s + roof.eave, ez = rg.halfD + (rg.hipVerge ?? roof.verge), rh = rg.ridgeHalf;
  const under = (x: number, z: number): number => {
    const along = Math.max(0, Math.abs(z) - rh) * (rg.hipTan ?? rg.tanP);
    return rg.ridgeY - Math.max(Math.abs(x) * rg.tanP, along) - 0.025;
  };
  const p = (x: number, z: number): Vec3 => [x, under(x, z), z];
  const o = { colour: shade(timber, 1.12), decor: true };
  for (const sx of [-1, 1]) facing(sink, 'structureWood', p(sx * ex, -ez), p(sx * ex, ez), p(0, rh), p(0, -rh), [0, -1, 0], o);
  // the fascia round the eaves, closing the boards' edge up to the covering's
  const lift = (q: Vec3, dy: number): Vec3 => [q[0], q[1] + dy, q[2]];
  for (const sx of [-1, 1]) facing(sink, 'structureWood', lift(p(sx * ex, -ez), -0.01), lift(p(sx * ex, ez), -0.01), lift(p(sx * ex, ez), 0.06), lift(p(sx * ex, -ez), 0.06), [sx, 0, 0], o);
  for (const sz of [-1, 1]) facing(sink, 'structureWood', lift(p(-ex, sz * ez), -0.01), lift(p(ex, sz * ez), -0.01), lift(p(ex, sz * ez), 0.06), lift(p(-ex, sz * ez), 0.06), [0, 0, sz], o);
  for (const sz of [-1, 1]) {
    const a = p(-ex, sz * ez), b = p(ex, sz * ez), c = p(0, sz * rh);
    const u = sub(b, a), v = sub(c, a), ny = u[2] * v[0] - u[0] * v[2];
    sink.polygon('structureWood', ny < 0 ? [a, b, c] : [c, b, a], o);
  }
}

/** The steps and the platform under a building: each a slab course, its tread's nosing worn, its joints. */
function steps(sink: PartSink, x0: number, x1: number, z0: number, z1: number, rises: readonly number[], run: number, sides: { x0: boolean; x1: boolean; z0: boolean; z1: boolean },
  look: () => number, mobile: boolean): { x0: number; x1: number; z0: number; z1: number } {
  let a = { x0, x1, z0, z1 }, y = -0.45, last = a;
  for (let k = 0; k < rises.length; k++) {
    const top = rises[k], tint: Rgb = [0.97 + k * 0.01, 0.96 + k * 0.01, 0.93 + k * 0.01];
    sink.span('stone', a.x0, y, a.z0, a.x1, top, a.z1, { tint });
    const cur = a;
    last = cur;
    sink.dressing(mobile, () => {
      // the nosing along each open edge, worn back in places; the joints down the riser and across the tread
      const edges: Array<[Vec3, Vec3, Vec3]> = [];
      if (sides.x1) edges.push([[cur.x1, top, cur.z0], [cur.x1, top, cur.z1], [1, 0, 0]]);
      if (sides.x0) edges.push([[cur.x0, top, cur.z1], [cur.x0, top, cur.z0], [-1, 0, 0]]);
      if (sides.z1) edges.push([[cur.x1, top, cur.z1], [cur.x0, top, cur.z1], [0, 0, 1]]);
      if (sides.z0) edges.push([[cur.x0, top, cur.z0], [cur.x1, top, cur.z0], [0, 0, -1]]);
      for (const [p, q, nrm] of edges) {
        const len = Math.hypot(q[0] - p[0], q[2] - p[2]), dir: Vec3 = [(q[0] - p[0]) / len, 0, (q[2] - p[2]) / len];
        for (let s = 0.75 + look() * 0.4; s < len - 0.1; s += 0.8 + look() * 0.45) {
          const j: Vec3 = [p[0] + dir[0] * s + nrm[0] * 0.002, 0, p[2] + dir[2] * s + nrm[2] * 0.002];
          facing(sink, 'dark', [j[0] - dir[0] * 0.006, top - 0.17, j[2] - dir[2] * 0.006], [j[0] + dir[0] * 0.006, top - 0.17, j[2] + dir[2] * 0.006],
            [j[0] + dir[0] * 0.006, top, j[2] + dir[2] * 0.006], [j[0] - dir[0] * 0.006, top, j[2] - dir[2] * 0.006], nrm, { decor: true, fine: true });
          const ti: Vec3 = [j[0] - nrm[0] * 0.002, top + 0.002, j[2] - nrm[2] * 0.002], tj: Vec3 = [ti[0] - nrm[0] * run * 0.95, top + 0.002, ti[2] - nrm[2] * run * 0.95];
          facing(sink, 'dark', [ti[0] - dir[0] * 0.006, ti[1], ti[2] - dir[2] * 0.006], [ti[0] + dir[0] * 0.006, ti[1], ti[2] + dir[2] * 0.006],
            [tj[0] + dir[0] * 0.006, tj[1], tj[2] + dir[2] * 0.006], [tj[0] - dir[0] * 0.006, tj[1], tj[2] - dir[2] * 0.006], [0, 1, 0], { decor: true, fine: true });
        }
        // the worn arris: a lighter strip along the nosing
        facing(sink, 'stone', [p[0] + nrm[0] * 0.004, top - 0.035, p[2] + nrm[2] * 0.004], [q[0] + nrm[0] * 0.004, top - 0.035, q[2] + nrm[2] * 0.004],
          [q[0] + nrm[0] * 0.004, top - 0.002, q[2] + nrm[2] * 0.004], [p[0] + nrm[0] * 0.004, top - 0.002, p[2] + nrm[2] * 0.004], nrm, { decor: true, fine: true, tint: [1.08, 1.07, 1.04] });
      }
    });
    y = top;
    a = { x0: a.x0 + (sides.x0 ? run : 0), x1: a.x1 - (sides.x1 ? run : 0), z0: a.z0 + (sides.z0 ? run : 0), z1: a.z1 - (sides.z1 ? run : 0) };
  }
  return last;
}

/** The floor's slabs: their joints in courses across, broken bond along (fine dressing). */
function slabJoints(sink: PartSink, x0: number, x1: number, z0: number, z1: number, y: number, look: () => number): void {
  const o = { decor: true, fine: true } as const;
  const rows = Math.max(2, Math.round((x1 - x0) / 0.85));
  for (let i = 0; i <= rows; i++) {
    const x = x0 + (x1 - x0) * i / rows;
    if (i > 0 && i < rows) facing(sink, 'dark', [x - 0.007, y, z0], [x + 0.007, y, z0], [x + 0.007, y, z1], [x - 0.007, y, z1], [0, 1, 0], o);
    if (i === rows) break;
    const xb = x0 + (x1 - x0) * (i + 1) / rows;
    for (let z = z0 + (i % 2 ? 0.55 : 0.05) + look() * 0.3; z < z1 - 0.2; z += 0.9 + look() * 0.35) {
      facing(sink, 'dark', [x, y, z - 0.007], [xb, y, z - 0.007], [xb, y, z + 0.007], [x, y, z + 0.007], [0, 1, 0], o);
    }
  }
}

/**
 * The entablature round an open hall's top, a ring on its walls: the architrave band, the bed mould and the corona, each
 * its own course projecting further out (a hand inside); the front wall's run (+x) from `xf0` to `xf1` and the back's
 * from `xb0` to `xb1` the full length, the ends' runs between them on walls `t` thick about z = ±`ze`, out to ±`zo`.
 */
function entablature(sink: PartSink, xb0: number, xb1: number, xf0: number, xf1: number, ze: number, t: number, zo: number, y: number, tint: Rgb): number {
  const courses: Array<[number, number]> = [[0.03, 0.3], [0.08, 0.1], [0.18, 0.18]];
  for (const [p, h] of courses) {
    const o = { tint: shade(tint, 1.02 + p * 0.2) };
    sink.span('stone', xf0 - 0.03, y, -zo - p, xf1 + p, y + h, zo + p, o);
    sink.span('stone', xb0 - p, y, -zo - p, xb1 + 0.03, y + h, zo + p, o);
    sink.span('stone', xb1 + 0.03, y, ze - t / 2 - 0.03, xf0 - 0.03, y + h, zo + p, o);
    sink.span('stone', xb1 + 0.03, y, -zo - p, xf0 - 0.03, y + h, -ze + t / 2 + 0.03, o);
    y += h;
  }
  return y;
}

// ------------------------------------------------------------------------------------------------ the loggia

/**
 * The town loggia (loža) on the harbour square (kit:dalmatian/marketRow): an open hall on a stepped plinth of dressed
 * slabs, its front an arcade of round arches on limestone columns with their bases and capitals, its ends an arch each
 * from the corner column to a respond on the back wall; the spandrels laid up flush to the architrave, the voussoirs and
 * keystones proud on both faces, the cornice round the top under the hipped canal-tile roof with its eaves; the open
 * timber roof inside on its tie beams, trusses, rafters and boards. The back wall solid: on its inside the stone bench on
 * its corbels the length of the hall, the Lion of St Mark in relief in its frame over an inscription tablet, the
 * responds; on its outside a blind arcade of pilasters and rings over a plinth course under a string course. On a market
 * row's plot (wider than deep) the loggia lies along it, its arcade down one long side (plotAxes).
 */
export function dalmatianLoggia(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const plot = plotAxes(ctx.info);
  const W = clamp(plot.w - 0.8, plot.turned ? 4.0 : 5.4, 8), D = clamp(plot.d - 0.8, 8, 15);
  const stone: Rgb = [0.98, 0.97, 0.94], oak = pick(ctx.rng, OAK);
  alongPlot(sink, plot.turned, () => {
    const run = 0.32, bw = 0.5, t = 0.42, hw = 0.24, r0 = 0.18;
    const xbo = -W / 2, xbi = xbo + bw;
    // the stepped plinth: two steps round the open sides up to the hall's floor, its back flush with the back wall
    const plat = steps(sink, xbo, W / 2, -D / 2, D / 2, [0.12, 0.24, 0.36], run, { x0: false, x1: true, z0: true, z1: true }, look, mobile);
    const floor = 0.36;
    const xc = plat.x1 - 0.3, zc = plat.z1 - 0.3;
    // ---- the columns, the responds on the back wall
    const nb = Math.max(3, Math.round(2 * zc / 2.4)), zs = Array.from({ length: nb + 1 }, (_, k) => -zc + 2 * zc * k / nb);
    const ys = floor + 2.8, legs: Array<{ foot: Vec3; head: Vec3 }> = [];
    for (const z of zs) legs.push(column(sink, xc, z, floor, ys, r0, stone, mobile));
    const xr = xbi + 0.14;
    for (const sz of [-1, 1]) {
      const z = sz * zc;
      sink.span('stone', xbi - 0.02, floor - 0.02, z - 0.25, xbi + 0.24, floor + 0.3, z + 0.25, { tint: shade(stone, 0.97) });
      sink.span('stone', xbi - 0.02, floor + 0.3, z - 0.2, xbi + 0.18, ys - 0.22, z + 0.2, { tint: stone });
      sink.span('stone', xbi - 0.02, ys - 0.22, z - 0.27, xbi + 0.4, ys, z + 0.27, { tint: shade(stone, 1.03) });
      legs.push({ foot: [xr, floor, z], head: [xr, ys, z] });
    }
    // ---- the arcades: the front's bays between its columns, each end's one arch from its respond to the corner column
    const rEnd = (xc - hw - (xr + hw)) / 2, crown = ys + Math.max(rEnd, (2 * zc / nb - 2 * hw) / 2);
    const yt = crown + 0.3;
    const front: Face = { origin: [xc + t / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2 * zc };
    const fb: Bay[] = [];
    for (let k = 0; k < nb; k++) fb.push({ a: -zs[nb - k] + hw, b: -zs[nb - k - 1] - hw });
    arcadeWall(sink, front, -(zc + hw), zc + hw, fb, ys, yt, t, stone, [true, true], mobile);
    for (const sz of [-1, 1]) {
      const end: Face = sz > 0 ? { origin: [0, 0, zc + t / 2], u: [1, 0, 0], out: [0, 0, 1], width: xc - xbi } : { origin: [0, 0, -zc - t / 2], u: [-1, 0, 0], out: [0, 0, -1], width: xc - xbi };
      const bay: Bay = sz > 0 ? { a: xr + hw, b: xc - hw } : { a: -(xc - hw), b: -(xr + hw) };
      // (the integrity check, 2026-10-16: the open ends let the sky through two arches at once) the ends walled up to their
      // arches' crowns, each arch a blind one in its wall over the bench's ends; the arcade open to the square alone
      arcadeWall(sink, end, sz > 0 ? xbi - 0.02 : -(xc - t / 2), sz > 0 ? xc - t / 2 : -(xbi - 0.02), [bay], ys, yt, t, stone, [false, false], mobile);
      sink.span('stone', xbi - 0.02, floor - 0.02, sz * zc - t / 2 + 0.04, xc - t / 2, ys + (xc - xr) / 2 - hw - 0.02, sz * zc + t / 2 - 0.04, { tint: shade(stone, 0.97) });
    }
    // ---- the back wall, the architrave and cornice round the top
    const zo = zc + hw;
    sink.span('stone', xbo, -0.45, -zo, xbi, yt, zo, { tint: shade(stone, 0.96) });
    const eaveY = entablature(sink, xbo, xbi, xc - t / 2, xc + t / 2, zc, t, zo, yt, stone);
    // the roof: canal tiles on the cornice, its timbers inside on tie beams from the back wall to the arcade
    const rx0 = xbo, rx1 = xc + t / 2, rw = rx1 - rx0, rd = 2 * zo, cx = (rx0 + rx1) / 2;
    const roof = canalHip(22, 0.36);
    const rg = roofGeometry(rw, rd, eaveY, roof);
    sink.placed(0, cx, 0, 0, () => {
      emitRoof(sink, rg, roof);
      const px = (xc - (xbo + bw / 2)) / 2, tieTop = eaveY - 0.02, inner = zs.slice(1, -1);
      for (const z of inner) sink.span('structureWood', -px - 0.2, tieTop - 0.24, z - 0.11, px + 0.2, tieTop, z + 0.11, { colour: oak });
      hallRoofTimbers(sink, { rg, roof, px, zs: inner, tieTop, eaveY, rd, timber: oak, mobile });
      sink.dressing(mobile, () => roofBoards(sink, rg, roof, oak));
    });
    // ---- the back wall's inside: the bench on its corbels, the relief and its tablet
    const inside: Face = { origin: [xbi, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2 * zo };
    const seat = floor + 0.46, bz = zc - 0.4;
    sink.span('stone', xbi - 0.02, seat - 0.09, -bz, xbi + 0.44, seat, bz, { decor: true, tint: shade(stone, 1.02) });
    for (let z = -bz + 0.25; z <= bz - 0.2; z += Math.max(0.9, (2 * bz - 0.5) / Math.max(1, Math.round((2 * bz - 0.5) / 1.1)))) {
      // a corbel: its top under the seat, its face curving back down to the wall (a prism of its profile)
      sink.prism('stone', [[xbi - 0.01, seat - 0.09, z - 0.08], [xbi - 0.01, floor + 0.05, z - 0.08], [xbi + 0.12, floor + 0.12, z - 0.08], [xbi + 0.3, seat - 0.2, z - 0.08], [xbi + 0.36, seat - 0.09, z - 0.08]],
        [0, 0, 1], 0.16, { decor: true, tint: shade(stone, 0.98) });
    }
    sink.dressing(mobile, () => {
      // the Lion of St Mark in its frame: the field sunk a little, the lion passant with his wings, his halo and the open book
      // (the lion's carving is fine work, read from inside the hall: its frame is not)
      const ry = floor + 2.0, k = shade(stone, 0.9), relief = { decor: true, fine: true, tint: shade(stone, 1.04) };
      faceBox(sink, 'stone', inside, 0, ry, 0.01, 1.5, 0.95, 0.02, { decor: true, tint: k });
      for (const [u, y, w, h] of [[0, ry + 0.52, 1.66, 0.1], [0, ry - 0.52, 1.66, 0.1], [0.78, ry, 0.1, 1.14], [-0.78, ry, 0.1, 1.14]] as const) {
        faceBox(sink, 'stone', inside, u, y, 0.04, w, h, 0.08, { decor: true, tint: shade(stone, 1.06) });
      }
      faceBox(sink, 'stone', inside, 0.05, ry - 0.05, 0.05, 0.62, 0.24, 0.06, relief);
      faceBox(sink, 'stone', inside, -0.32, ry + 0.06, 0.06, 0.24, 0.3, 0.07, relief);
      faceBox(sink, 'stone', inside, -0.43, ry + 0.07, 0.07, 0.16, 0.16, 0.06, relief);
      sink.cylinder('stone', facePoint(inside, -0.43, ry + 0.12, 0.02), 'x', 0.03, 0.15, 10, { decor: true, fine: true, tint: shade(stone, 1.08) });
      for (const u of [-0.24, -0.08, 0.18, 0.32]) faceBox(sink, 'stone', inside, u, ry - 0.3, 0.045, 0.06, 0.26, 0.05, relief);
      const wingAt = (u: number, y: number): Vec3 => facePoint(inside, u, y, 0.02);
      sink.prism('stone', [wingAt(-0.2, ry + 0.05), wingAt(0.12, ry + 0.06), wingAt(0.25, ry + 0.38)], [1, 0, 0], 0.045, relief);
      sink.member('stone', facePoint(inside, 0.36, ry - 0.08, 0.05), facePoint(inside, 0.58, ry + 0.2, 0.05), 0.04, 0.03, [1, 0, 0], { ...relief, exposed: true }, 0.01);
      for (const [u, tilt] of [[-0.6, 0.25], [-0.48, -0.25]] as const) faceBox(sink, 'stone', inside, u, ry - 0.14 + tilt * 0.05, 0.05, 0.13, 0.18, 0.025, { decor: true, fine: true, tint: [1.12, 1.11, 1.08] });
      // the tablet under it, its inscription in lines of cut letters
      const ty = floor + 1.15;
      faceBox(sink, 'stone', inside, 0, ty, 0.03, 1.3, 0.42, 0.06, { decor: true, tint: shade(stone, 1.05) });
      for (let line = 0; line < 3; line++) {
        let u = -0.52 + look() * 0.05;
        while (u < 0.5) {
          const len = 0.05 + look() * 0.12;
          if (u + len > 0.52) break;
          faceBox(sink, 'dark', inside, u + len / 2, ty + 0.11 - line * 0.11, 0.061, len, 0.045, 0.002, { decor: true, fine: true });
          u += len + 0.03 + (look() < 0.25 ? 0.05 : 0);
        }
      }
      // the floor's slabs between the back wall and the columns
      slabJoints(sink, xbi + 0.02, plat.x1 - 0.02, plat.z0 + 0.02, plat.z1 - 0.02, floor + 0.003, look);
    });
    // ---- the back wall's outside: the blind arcade over a plinth course, the string course at the springing
    const outside: Face = { origin: [xbo, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * zo };
    faceBox(sink, 'stone', outside, 0, 0.18, 0.04, 2 * zo, 0.5, 0.08, { tint: shade(stone, 0.92) }, 'ends');
    sink.dressing(mobile, () => {
      faceBox(sink, 'stone', outside, 0, ys - 0.06, 0.03, 2 * zo, 0.12, 0.06, { decor: true, tint: shade(stone, 1.04) }, 'ends');
      for (const z of zs) faceBox(sink, 'stone', outside, z, (0.43 + ys - 0.12) / 2, 0.03, 0.42, ys - 0.12 - 0.43, 0.06, { decor: true, tint: shade(stone, 1.0) });
      for (let k = 0; k < nb; k++) {
        const a = zs[k] + 0.21, b = zs[k + 1] - 0.21;
        archHead(sink, outside, (a + b) / 2, ys, (b - a) / 2, 'stone', Math.min(0.24, yt - ys - (b - a) / 2 - 0.04), 9);
      }
    });
    // the frame's reading: the columns heap as their drums, the roof drops on its timbers, the back wall stands ragged
    recordShed(sink, legs, {
      W, D, pitchDeg: 22, eaveY, eave: roof.eave, verge: roof.verge, deck: 0.15, post: 0.36, posts: [], pad: null, timber: oak,
      boards: null, boardW: 0.2, back: false, ends: false, roof: { bucket: 'roof', colour: null, shape: 'tile' },
      stone: { bucket: 'stone', t: bw, top: eaveY }, pile: 0, gable: true,
      masses: [...zs.map((z) => ({ x: xc, z, r: 0.42, h: ys + 0.6, bucket: 'stone' as RegionalBucket })), ...[-1, 1].map((sz) => ({ x: (xr + xc) / 2, z: sz * zc, r: 0.5, h: 1.2, bucket: 'stone' as RegionalBucket }))],
    });
  }, 1);
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ the fish market

/**
 * The fish market (ribarnica) on the base market plot (kit:dalmatian/market): a stepped platform of dressed slabs with
 * their joints falling to a drain down the middle under its iron grate and out through a spout in the step; six
 * limestone columns with their bases and capitals under a stone architrave and its cornice; the hipped canal-tile roof
 * on its tie beams, truss and rafters with its boards; the two stone fish tables on their slab legs, each slab with its
 * raised lip and its drain lip and spout at the low end, the catch laid out on them on ice and in slatted crates, the
 * crates stacked by the columns, the water standpipe with its tap over a stone basin.
 */
export function dalmatianRibarnica(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const W = clamp(ctx.info.w - 0.3, 4.8, 6.4), D = clamp(ctx.info.d - 0.3, 3.8, 5.0);
  const stone: Rgb = [0.98, 0.97, 0.94], oak = pick(ctx.rng, OAK);
  const run = 0.3;
  const plat = steps(sink, -W / 2 - run, W / 2 + run, -D / 2 - run, D / 2 + run, [0.16, 0.32], run, { x0: true, x1: true, z0: true, z1: true }, look, mobile);
  const floor = 0.32, px = W / 2 - 0.36, pz = D / 2 - 0.36, ys = floor + 2.35;
  const xs = [-px, 0, px], legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (const sz of [-1, 1]) for (const x of xs) legs.push(column(sink, x, sz * pz, floor, ys, 0.16, stone, mobile));
  // the architrave on the capitals all round, the cornice over it
  const ab = 0.22;
  for (const sz of [-1, 1]) sink.span('stone', -px - ab, ys, sz * pz - ab, px + ab, ys + 0.3, sz * pz + ab, { tint: shade(stone, 1.02) });
  for (const sx of [-1, 1]) sink.span('stone', sx * px - ab, ys, -pz + ab, sx * px + ab, ys + 0.3, pz - ab, { tint: shade(stone, 1.02) });
  sink.span('stone', -px - ab - 0.1, ys + 0.3, -pz - ab - 0.1, px + ab + 0.1, ys + 0.44, -pz + ab, { tint: shade(stone, 1.05) });
  sink.span('stone', -px - ab - 0.1, ys + 0.3, pz - ab, px + ab + 0.1, ys + 0.44, pz + ab + 0.1, { tint: shade(stone, 1.05) });
  for (const sx of [-1, 1]) sink.span('stone', sx > 0 ? px - ab : -px - ab - 0.1, ys + 0.3, -pz + ab, sx > 0 ? px + ab + 0.1 : -px + ab, ys + 0.44, pz - ab, { tint: shade(stone, 1.05) });
  const eaveY = ys + 0.44;
  // the roof along the long side: canal tiles on the cornice, its tie beams across at the columns, the truss, rafters, boards
  const roof = canalHip(21, 0.32), across = 2 * (pz + ab + 0.1), length = 2 * (px + ab + 0.1);
  const rg = roofGeometry(across, length, eaveY, roof);
  sink.placed(Math.PI / 2, 0, 0, 0, () => {
    emitRoof(sink, rg, roof);
    const tieTop = eaveY - 0.02, hx = pz;
    for (const x of xs) sink.span('structureWood', -hx - 0.2, tieTop - 0.24, -x - 0.1, hx + 0.2, tieTop, -x + 0.1, { colour: oak });
    hallRoofTimbers(sink, { rg, roof, px: hx, zs: xs.map((x) => -x), tieTop, eaveY, rd: length, timber: oak, mobile });
    sink.dressing(mobile, () => roofBoards(sink, rg, roof, oak));
  });
  // ---- the drain down the middle of the floor, its grate, its spout through the step
  const drainW = 0.14;
  sink.span('dark', -px + 0.3, floor - 0.02, -drainW / 2, px - 0.3, floor + 0.004, drainW / 2, { decor: true });
  sink.span('stone', px - 0.3, floor - 0.02, -drainW / 2, plat.x1 + run + 0.04, floor + 0.004, drainW / 2, { decor: true, tint: [0.78, 0.78, 0.76] });
  for (const sz of [-1, 1]) sink.span('stone', px - 0.3, floor, sz * drainW / 2 - (sz < 0 ? 0.05 : 0), plat.x1 + run + 0.06, floor + 0.05, sz * drainW / 2 + (sz > 0 ? 0.05 : 0), { decor: true, tint: shade(stone, 0.95) });
  sink.dressing(mobile, () => {
    for (let x = -0.35; x <= 0.36; x += 0.07) sink.span('structureMetal', x - 0.012, floor + 0.004, -drainW / 2 - 0.02, x + 0.012, floor + 0.02, drainW / 2 + 0.02, { colour: rgb(0x2e2c2a), decor: true, fine: true });
    slabJoints(sink, plat.x0 + 0.02, plat.x1 - 0.02, plat.z0 + 0.02, -drainW / 2 - 0.01, floor + 0.003, look);
    slabJoints(sink, plat.x0 + 0.02, plat.x1 - 0.02, drainW / 2 + 0.01, plat.z1 - 0.02, floor + 0.003, look);
  });
  // ---- the fish tables: a low display slab on its base each side of the drain, the lip round it, its spout at the low end
  // (the integrity check, 2026-10-16: the aisle between them a pace wider and the slabs low, so the hall reads open)
  const L = Math.max(2.4, 2 * px - 0.9), tz = pz - 0.7, top = floor + 0.62, catches: readonly Rgb[] = [0x9aa4a8, 0xb4babc, 0x7e8a90, 0xa88a7a].map(rgb);
  const crateC: readonly Rgb[] = [0x8a7458, 0x9a8466, 0x7a6448].map(rgb);
  for (const sz of [-1, 1]) {
    const z = sz * tz;
    // (the integrity check, 2026-10-16: the space under a slab on legs read as the inside of the stall) each table's slab
    // on its masonry base, the slab overhanging it a hand all round, a plinth course at its foot
    sink.span('stone', -L / 2 + 0.12, floor, z - 0.3, L / 2 - 0.12, top - 0.12, z + 0.3, { tint: shade(stone, 0.96) });
    sink.span('stone', -L / 2 + 0.08, floor, z - 0.34, L / 2 - 0.08, floor + 0.12, z + 0.34, { tint: shade(stone, 0.9) });
    sink.span('stone', -L / 2, top - 0.12, z - 0.4, L / 2, top, z + 0.4, { tint: shade(stone, 1.02) });
    // the lip down both long sides and round the high end; the low end open to its spout over the drain side
    for (const s of [-1, 1]) sink.span('stone', -L / 2, top, z + s * 0.4 - (s > 0 ? 0.05 : 0), L / 2, top + 0.05, z + s * 0.4 + (s < 0 ? 0.05 : 0), { decor: true, tint: shade(stone, 1.05) });
    sink.span('stone', -L / 2, top, z - 0.35, -L / 2 + 0.05, top + 0.05, z + 0.35, { decor: true, tint: shade(stone, 1.05) });
    sink.span('stone', L / 2, top - 0.08, z - 0.06, L / 2 + 0.16, top - 0.02, z + 0.06, { decor: true, tint: shade(stone, 0.98) });
    sink.span('dark', L / 2 + 0.06, top - 0.019, z - 0.03, L / 2 + 0.16, top - 0.017, z + 0.03, { decor: true, fine: true });
    sink.dressing(mobile, () => {
      // the wet slab: a darker run down its middle to the spout; the catch on its bed of ice, a crate or two of it
      sink.span('stone', -L / 2 + 0.05, top + 0.001, z - 0.05, L / 2, top + 0.003, z + 0.05, { decor: true, fine: true, tint: [0.72, 0.74, 0.76] });
      const ice0 = -L / 2 + 0.2, ice1 = ice0 + L * 0.45;
      sink.span('stone', ice0, top, z - 0.3, ice1, top + 0.04, z + 0.3, { decor: true, tint: [1.12, 1.14, 1.16] });
      for (let k = 0, n = 6 + Math.floor(look() * 4); k < n; k++) {
        const fx = ice0 + 0.15 + (ice1 - ice0 - 0.3) * k / Math.max(1, n - 1), fz = z + (look() - 0.5) * 0.36, len = 0.26 + look() * 0.16, yaw = (look() - 0.5) * 0.8 + Math.PI / 2;
        fish(sink, [fx, top + 0.04, fz], len, yaw, pick(look, catches));
      }
      for (let c = 0, m = 1 + Math.floor(look() * 2); c < m; c++) crate(sink, [ice1 + 0.35 + c * 0.6, top, z], 0, pick(look, crateC), look, pick(look, catches));
    });
  }
  sink.dressing(mobile, () => {
    // the crates stacked by the columns, the standpipe and its basin at the far end
    for (const [x, z, n] of [[-px + 0.15, pz - 0.55, 3], [px - 0.15, -pz + 0.55, 2]] as const) {
      for (let k = 0; k < n; k++) crate(sink, [x + (look() - 0.5) * 0.06, floor + k * 0.255, z + (look() - 0.5) * 0.06], (look() - 0.5) * 0.2, pick(look, crateC), look, k === n - 1 ? pick(look, catches) : null);
    }
    const bx = -px, bz = 0;
    sink.span('stone', bx - 0.3, floor, bz - 0.22, bx + 0.3, floor + 0.42, bz + 0.22, { decor: true, tint: shade(stone, 0.96) });
    sink.span('dark', bx - 0.24, floor + 0.36, bz - 0.16, bx + 0.24, floor + 0.425, bz + 0.16, { decor: true });
    sink.cylinder('structureMetal', [bx, floor + 0.42, bz - 0.2], 'y', 0.75, 0.035, 8, { colour: rgb(0x3a4446), decor: true });
    sink.cylinder('structureMetal', [bx, floor + 1.12, bz - 0.2], 'z', 0.18, 0.025, 8, { colour: rgb(0x3a4446), decor: true });
    sink.cylinder('structureMetal', [bx, floor + 1.13, bz - 0.12], 'y', 0.06, 0.03, 6, { colour: rgb(0x8a6a3a), decor: true });
  });
  recordShed(sink, legs, {
    W: 2 * px + 0.6, D: 2 * pz + 0.6, pitchDeg: 21, eaveY, eave: roof.eave, verge: roof.verge, deck: 0.15, post: 0.32, posts: [], pad: null, timber: oak,
    boards: null, boardW: 0.2, back: false, ends: false, roof: { bucket: 'roof', colour: null, shape: 'tile' }, stone: null, pile: 0, gable: true,
    masses: legs.map((l) => ({ x: l.foot[0], z: l.foot[2], r: 0.38, h: ys + 0.4, bucket: 'stone' as RegionalBucket })),
  });
  return sink.finish();
}

/** A fish laid on its side at `c` (its belly down), `len` long along `yaw`: the body's lozenge, the tail's fork. */
function fish(sink: PartSink, c: Vec3, len: number, yaw: number, colour: Rgb): void {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), w = len * 0.22;
  const at = (a: number, b: number, y = 0): Vec3 => [c[0] + ca * a - sa * b, c[1] + y, c[2] + sa * a + ca * b];
  const body: Vec3[] = [at(len * 0.5, 0), at(len * 0.25, -w / 2), at(-len * 0.2, -w / 2.4), at(-len * 0.32, 0), at(-len * 0.2, w / 2.4), at(len * 0.25, w / 2)];
  sink.prism('structureWood', body, [0, 1, 0], 0.035, { colour, decor: true });
  sink.prism('structureWood', [at(-len * 0.3, 0), at(-len * 0.5, -w * 0.45), at(-len * 0.44, 0), at(-len * 0.5, w * 0.45)], [0, 1, 0], 0.012, { colour: shade(colour, 0.8), decor: true });
}

/** A slatted fish crate standing at `c` (its foot), turned `yaw`: its base, two slats a side with the gap between, the
 *  corner posts; its load (fish on ice) if any. */
function crate(sink: PartSink, c: Vec3, yaw: number, colour: Rgb, look: () => number, load: Rgb | null): void {
  const hx = 0.27, hz = 0.19, h = 0.26;
  sink.placed(yaw, c[0], c[1], c[2], () => {
    const k = { colour: shade(colour, 0.9 + look() * 0.2), decor: true } as const;
    sink.span('structureWood', -hx, 0, -hz, hx, 0.03, hz, k);
    for (const [y0, y1] of [[0.03, 0.12], [0.16, h]] as const) {
      for (const s of [-1, 1]) {
        sink.span('structureWood', -hx, y0, s * hz - (s > 0 ? 0.015 : 0), hx, y1, s * hz + (s < 0 ? 0.015 : 0), k);
        sink.span('structureWood', s * hx - (s > 0 ? 0.015 : 0), y0, -hz + 0.015, s * hx + (s < 0 ? 0.015 : 0), y1, hz - 0.015, k);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('structureWood', sx * hx - (sx > 0 ? 0.03 : 0), 0.03, sz * hz - (sz > 0 ? 0.03 : 0), sx * hx + (sx < 0 ? 0.03 : 0), h, sz * hz + (sz < 0 ? 0.03 : 0), { ...k, colour: shade(colour, 0.8) });
    if (load) {
      sink.span('stone', -hx + 0.016, h - 0.06, -hz + 0.016, hx - 0.016, h - 0.03, hz - 0.016, { decor: true, tint: [1.12, 1.14, 1.16] });
      for (let j = 0; j < 4; j++) fish(sink, [-hx + 0.11 + j * 0.105, h - 0.03, (look() - 0.5) * 0.08], 0.3, Math.PI / 2 + (look() - 0.5) * 0.3, shade(load, 0.9 + look() * 0.2));
    }
  });
}
