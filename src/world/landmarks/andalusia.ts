// src/world/landmarks/andalusia.ts — the Serranía de Ronda's bullring and alcazaba (landmarks-271, 2026-11-06; the
// realism pass, landmarks-273, 2026-11-16). Cliffbridge is the white villages under the limestone crags round Ronda: the
// census (buildings-270 signature places) names the plaza de toros — "a circular two-tier arcade of stone columns under a
// tile roof ring around a sand arena", Ronda's of 1785 the oldest of its kind — near the bridgehead, facing an open
// plaza, and found it missing.
//
// - bullring: the ring's outer wall in brilliant whitewash over a stone plinth, its ground storey's barred windows in
//   dressed surrounds and the upper storey's arched openings between stone pilasters, the stone bands at each floor; the
//   moulded stone cornice under the tile roof ring's eave, 0.5 m out over it; the Puerta del Príncipe on the front, a
//   stone portal of paired Tuscan columns on pedestals, the balcony and its door between pilasters, the pediment with
//   its raking cornices, the royal arms and the finials; inside, the arena's sand, the red barrera and its burladeros,
//   the stone tiers, and the two arcaded galleries over them (Tuscan columns under round arches, the upper behind its
//   parapet) under the roof; outside, the worn flagged apron round the ring's foot and its stone bollards.
//
// - alcazaba: the old town's Moorish citadel across the gorge (the census: "a keep tower and curtain wall stubs" on the
//   rock above the village), on its rise of rock and earth: the curtain of tapia (rammed earth) in formwork lifts, each
//   lift stepped back on the one below, its cajones (the shutter boxes) each a tone of their own, eroded to hollows
//   between the lime-rich lift joints, patched with rubble stone laced with brick where the render fell; the wall-walk
//   behind a parapet of pyramid-capped (Almohad) merlons, the parapet fallen and the merlons gone along much of it, the
//   curtain breached to stubs over rubble spills; square towers every 25-35 m, 3.5 m proud of the curtain, with brick-
//   arched windows and their own battlements; the keep (torre del homenaje) astride the back curtain; the gate tower of
//   dressed stone with its horseshoe arch in its side (the bent entrance) up a ramp; inside, the ward's ground, the
//   cistern's vault, a well, rubble and the footings of its houses, a stair to the wall-walk.
//
// Drawn in their own frames (x across, y up, z out of the front) into the regional part sink, in the map kit's render,
// stone and roofing (no draw call of their own). The outer walls, tiers, the curtain's cores, the towers, the keep and
// the rise are structure; the columns, barrera, railings, the tapia's skin of lifts, the merlons, rubble and joinery are
// dressing.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { LIMEWASH_UV, bar, columnProfile, extrude, revolve, smoothRender } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const BARRERA = rgb(0x7a2a1e), IRON = rgb(0x2a2726), SAND = rgb(0xc9a56a), DOOR = rgb(0x5a3a26);
/** The ring's whitewash over the kit's cal (harbour.ts's lighthouse white). */
const WHITEWASH: [number, number, number] = [1.06, 1.06, 1.04];
const UP: Vec3 = [0, 1, 0], DOWN: Vec3 = [0, -1, 0];

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
const centroid = (pts: readonly Vec3[]): Vec3 => {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / pts.length, y / pts.length, z / pts.length];
};

/** A planar convex polygon wound to face `want` (any vector on its outward side), whichever way its corners came. */
function facing(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], want: Vec3, opts: EmitOptions): void {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  sink.polygon(bucket, nx * want[0] + ny * want[1] + nz * want[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** A Tuscan column cut for a gallery's many: six sides, a base, the shaft's taper, the echinus and the abacus. */
const galleryColumn = (r: number, h: number, y: number): Array<[number, number]> =>
  [[r * 1.25, y], [r * 1.25, y + 0.14], [r, y + 0.22], [r * 0.88, y + h - 0.26], [r * 1.22, y + h - 0.12], [r * 1.22, y + h]];

/**
 * The plaza de toros: the ring (`radius` to its outer wall, `height` to its eaves) in `sides` facets, the arena
 * (`arena` radius), the portal on the front (+z).
 */
export const bullring: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const Ro = num(ctx, 'radius', 18, 40), H = num(ctx, 'height', 8, 16), Ra = Math.min(Ro - 6, num(ctx, 'arena', 10, 34));
  const n = Math.max(16, Math.round(num(ctx, 'sides', 16, 48)));
  const foot = -0.6 - ctx.groundFall, F1 = H * 0.48, RENDER = 'plaster' as const;
  const ang = (k: number): number => (k / n) * Math.PI * 2 + Math.PI / n;
  const at = (k: number, r: number, y: number): Vec3 => [Math.sin(ang(k)) * r, y, Math.cos(ang(k)) * r];
  // ---- the outer wall: each facet a face (u along it) with its windows in two storeys
  for (let k = 0; k < n; k++) {
    const a = at(k - 1 + n, Ro, 0), b = at(k, Ro, 0);
    // (the facet between corner k-1 and k, its middle at angle (k - 1/2) * step + step/2 = k * step)
    const mid = (k / n) * Math.PI * 2;
    const ox = Math.sin(mid), oz = Math.cos(mid), ux = Math.cos(mid), uz = -Math.sin(mid), OUT: Vec3 = [ox, 0, oz];
    const width = Math.hypot(b[0] - a[0], b[2] - a[2]), cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
    const P = (u: number, y: number, o = 0): Vec3 => [cx + ux * u + ox * o, y, cz + uz * u + oz * o];
    const portal = k === 0, tone = 0.97 + v() * 0.05;
    // the wall in its parts: under, beside and over the openings (a ground window, an upper arch), each cut through
    const gw = 0.9, gy0 = 1.4, gy1 = 2.8, aw = 1.5, ay0 = F1 + 0.6, ay1 = H - 1.2;
    const quad = (u0: number, u1: number, y0: number, y1: number) => sink.quad(RENDER, P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), { shade: tone });
    const half = width / 2;
    if (portal) {
      quad(-half, half, foot, H);
    } else {
      quad(-half, half, foot, gy0); quad(-half, -gw / 2, gy0, gy1); quad(gw / 2, half, gy0, gy1); quad(-half, half, gy1, ay0);
      quad(-half, -aw / 2, ay0, ay1); quad(aw / 2, half, ay0, ay1);
      // the arch's head over the upper opening, the wall over it to the eaves
      const arch: Vec3[] = [];
      for (let i = 0; i <= 6; i++) { const t = Math.PI * i / 6; arch.push(P(Math.cos(t) * aw / 2, ay1 + Math.sin(t) * aw / 2 * 0.9)); }
      quad(-half, -aw / 2, ay1, H); quad(aw / 2, half, ay1, H);
      // (the spandrels over the arch, strip by strip from its line to the eaves)
      for (let i = 0; i < 6; i++) sink.quad(RENDER, arch[i + 1], arch[i], P(Math.cos(Math.PI * i / 6) * aw / 2, H - 0.001), P(Math.cos(Math.PI * (i + 1) / 6) * aw / 2, H - 0.001), { shade: tone });
      // the openings' reveals and dark backs, the ground window's grille and surround, the arch's stone ring
      sink.quad('dark', P(-gw / 2, gy0, -0.5), P(gw / 2, gy0, -0.5), P(gw / 2, gy1, -0.5), P(-gw / 2, gy1, -0.5), { decor: true });
      for (const s of [-1, 1]) sink.quad(RENDER, P(s * gw / 2, gy0, s < 0 ? 0 : -0.5), P(s * gw / 2, gy0, s < 0 ? -0.5 : 0), P(s * gw / 2, gy1, s < 0 ? -0.5 : 0), P(s * gw / 2, gy1, s < 0 ? 0 : -0.5), { shade: 0.72, decor: true });
      extrude(sink, 'stone', [P(-gw / 2 - 0.2, gy0 - 0.15), P(gw / 2 + 0.2, gy0 - 0.15), P(gw / 2 + 0.2, gy0), P(-gw / 2 - 0.2, gy0)], OUT, 0.06, { decor: true });
      for (let u = -gw / 2 + 0.18; u < gw / 2; u += 0.18) bar(sink, 'structureMetal', P(u, gy0, -0.1), P(u, gy1, -0.1), 0.025, { colour: IRON, decor: true, fine: true });
      // (its dark back 0.16 m in: in front of the gallery's inner wall, 0.2 m behind the facet at its middle)
      const back: Vec3[] = [P(-aw / 2, ay0, -0.16), P(aw / 2, ay0, -0.16), ...arch.map((p) => [p[0] - ox * 0.16, p[1], p[2] - oz * 0.16] as Vec3)];
      sink.polygon('dark', [back[0], back[1], ...back.slice(2)], { decor: true });
      // the arch's dressed voussoirs, flat on the face 5 cm out, the keystone's pair a shade lighter
      const R = (t: number, r: number): Vec3 => P(Math.cos(t) * r, ay1 + Math.sin(t) * r * 0.9, 0.05);
      for (let i = 0; i < 6; i++) {
        const t0 = Math.PI * i / 6, t1 = Math.PI * (i + 1) / 6;
        facing(sink, 'stone', [R(t0, aw / 2), R(t1, aw / 2), R(t1, aw / 2 + 0.24), R(t0, aw / 2 + 0.24)], OUT, { decor: true, shade: i === 2 || i === 3 ? 0.98 : 0.88 });
      }
      // the iron balcony rail across the upper opening
      // (leaded into the jambs either side: its returns run back into the wall)
      const railY = ay0 + 0.95, railU = aw / 2 + 0.06;
      bar(sink, 'structureMetal', P(-railU, railY, 0.15), P(railU, railY, 0.15), 0.04, { colour: IRON, decor: true, fine: true });
      for (const s of [-1, 1]) bar(sink, 'structureMetal', P(s * railU, railY, 0.15), P(s * railU, railY, -0.03), 0.04, { colour: IRON, decor: true, fine: true });
    }
    // the pilasters at the facet's corners and the stone bands at the plinth and the floor (the cornice is the eaves')
    sink.quad('stone', P(-half, foot, 0.12), P(half, foot, 0.12), P(half, 0.9, 0.12), P(-half, 0.9, 0.12), { decor: true, shade: 0.9 });
    sink.quad('stone', P(-half, F1 - 0.15, 0.1), P(half, F1 - 0.15, 0.1), P(half, F1 + 0.15, 0.1), P(-half, F1 + 0.15, 0.1), { decor: true });
    sink.quad('stone', P(-half, 0.9, 0.08), P(-half + 0.45, 0.9, 0.08), P(-half + 0.45, H - 0.62, 0.08), P(-half, H - 0.62, 0.08), { decor: true, shade: 0.95 });
  }
  // ---- the cornice: a moulded stone course under the eaves (a fillet, the cyma, the corona), the eave 0.5 m past it
  revolve(sink, 'stone', 0, 0, [[Ro - 0.02, H - 0.62], [Ro + 0.1, H - 0.62], [Ro + 0.1, H - 0.5], [Ro + 0.24, H - 0.32], [Ro + 0.24, H - 0.2],
    [Ro + 0.38, H - 0.2], [Ro + 0.38, H - 0.02], [Ro - 0.02, H - 0.02]], n, { decor: true, shade: 0.94 }, Math.PI / n);
  // ---- the roof ring over the gallery: tiles sloping in from the eaves to the gallery's columns, the tile ends and the
  // eave's underside over the cornice
  const Rg = Ro - 4.2, yr = H + 1.6, yi = H + 0.2, Re = Ro + 0.88;
  for (let k = 0; k < n; k++) {
    const k0 = k - 1 + n, mid = (k / n) * Math.PI * 2, OUT: Vec3 = [Math.sin(mid), 0, Math.cos(mid)];
    const a = at(k0, Re, H + 0.06), b = at(k, Re, H + 0.06), c = at(k, Rg - 0.4, yi), d = at(k0, Rg - 0.4, yi);
    const ra = at(k0, Ro - 1.2, yr), rb = at(k, Ro - 1.2, yr);
    sink.quad('roof', a, b, rb, ra, {});
    sink.quad('roof', ra, rb, c, d, {});
    facing(sink, 'roof', [at(k0, Re, H - 0.08), at(k, Re, H - 0.08), b, a], OUT, { decor: true, shade: 0.85 });
    facing(sink, 'roof', [at(k0, Re, H - 0.08), at(k, Re, H - 0.08), at(k, Ro + 0.38, H - 0.02), at(k0, Ro + 0.38, H - 0.02)], DOWN, { decor: true, shade: 0.55 });
  }
  // ---- inside: the stands from the lower gallery's floor down to the barrera, in tiers of stone
  const tiers = 6, yTop = H * 0.36, yMid = (yTop + yi) / 2, rTop = Rg - 0.6, rBot = Ra + 1.6, yBot = 1.5;
  for (let t = 0; t < tiers; t++) {
    const r0 = rTop - (rTop - rBot) * t / tiers, r1 = rTop - (rTop - rBot) * (t + 1) / tiers;
    const y = yTop - (yTop - yBot) * t / tiers, y1 = yTop - (yTop - yBot) * (t + 1) / tiers;
    revolve(sink, 'stone', 0, 0, [[r0, y], [r1, y], [r1, y1], [r1 - 0.01, y1]], n, { shade: 0.92 - 0.02 * (t % 2) }, Math.PI / n);
  }
  // the lower gallery's floor behind the tiers, its back wall (the outer wall's inside, facing in), the upper gallery's
  // floor slab on the arcade
  revolve(sink, 'stone', 0, 0, [[Ro - 0.3, yTop], [rTop, yTop]], n, { shade: 0.85 }, Math.PI / n);
  revolve(sink, RENDER, 0, 0, [[Ro - 0.3, H], [Ro - 0.35, H], [Ro - 0.35, yTop], [Ro - 0.3, yTop]], n, { shade: 0.8 }, Math.PI / n);
  revolve(sink, 'stone', 0, 0, [[Ro - 0.35, yMid], [Rg - 0.3, yMid], [Rg - 0.3, yMid - 0.25], [Ro - 0.35, yMid - 0.25]], n, { shade: 0.88 }, Math.PI / n);
  // (the stands' solid under the tiers, from the ground to the gallery: the ring's mass)
  revolve(sink, 'stone', 0, 0, [[rBot + 0.3, foot], [rBot, foot], [rBot, yBot], [rBot + 0.01, yBot]], n, { shade: 0.7 }, Math.PI / n);
  // ---- the two arcaded galleries: a Tuscan column on every line, round arches between them carrying the render's
  // spandrels and a stone string course; the upper behind its parapet (the antepecho) with a stone coping
  const m2 = n * 2, chord = 2 * Rg * Math.sin(Math.PI / m2), ra = chord / 2 - 0.26, halfC = chord / 2;
  const colAt = (k: number): [number, number] => { const a = (k / m2) * Math.PI * 2; return [Math.sin(a) * Rg, Math.cos(a) * Rg]; };
  // (the upper gallery's timber ceiling under the tiles, at the eaves: its arches show it, not the sky)
  revolve(sink, 'structureWood', 0, 0, [[Rg + 0.05, H], [Ro - 0.3, H]], m2, { colour: rgb(0x6a4a32), decor: true });
  for (const [y0, y1, upper] of [[yTop, yMid - 0.25, false], [yMid, yi, true]] as const) {
    const top = y1 - 0.3, ys = top - 0.16 - ra;
    for (let k = 0; k < m2; k++) {
      const [x0, z0] = colAt(k), [x1, z1] = colAt(k + 1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, rr = Math.hypot(mx, mz);
      const ux = (x1 - x0) / chord, uz = (z1 - z0) / chord, ix = -mx / rr, iz = -mz / rr, IN: Vec3 = [ix, 0, iz];
      const Q = (t: number, y: number, off = 0): Vec3 => [mx + ux * t + ix * off, y, mz + uz * t + iz * off];
      const o: EmitOptions = { decor: true, shade: 0.94 };
      for (let i = 0; i < 4; i++) {
        const t0 = Math.PI * i / 4, t1 = Math.PI * (i + 1) / 4;
        facing(sink, RENDER, [Q(Math.cos(t0) * ra, ys + Math.sin(t0) * ra), Q(Math.cos(t1) * ra, ys + Math.sin(t1) * ra), Q(Math.cos(t1) * ra, top), Q(Math.cos(t0) * ra, top)], IN, o);
      }
      for (const s of [-1, 1]) facing(sink, RENDER, [Q(s * ra, ys), Q(s * halfC, ys), Q(s * halfC, top), Q(s * ra, top)], IN, o);
      facing(sink, 'stone', [Q(-halfC, top, 0.08), Q(halfC, top, 0.08), Q(halfC, y1, 0.08), Q(-halfC, y1, 0.08)], IN, { decor: true });
      facing(sink, 'stone', [Q(-halfC, top, 0), Q(halfC, top, 0), Q(halfC, top, 0.08), Q(-halfC, top, 0.08)], DOWN, { decor: true, shade: 0.7 });
      if (upper) {
        facing(sink, RENDER, [Q(-halfC, y0, 0.02), Q(halfC, y0, 0.02), Q(halfC, y0 + 0.95, 0.02), Q(-halfC, y0 + 0.95, 0.02)], IN, o);
        facing(sink, 'stone', [Q(-halfC, y0 + 0.95, 0.06), Q(halfC, y0 + 0.95, 0.06), Q(halfC, y0 + 0.95, -0.2), Q(-halfC, y0 + 0.95, -0.2)], UP, { decor: true });
      }
      revolve(sink, 'stone', x0, z0, galleryColumn(0.2, ys - y0, y0), 6, { decor: true });
    }
  }
  // the arena's sand, the barrera (its red boards on posts) and the burladeros' screens, the callejón behind it
  revolve(sink, 'structureMetal', 0, 0, [[Ra, 0.05], [0.001, 0.05]], 40, { colour: SAND, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[Ra - 0.01, 0.05], [Ra, 0.05], [Ra, 1.45], [Ra + 0.08, 1.45], [Ra + 0.08, 0.05], [Ra + 0.09, 0.05]], n * 2, { colour: BARRERA, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[Ra + 0.19, 1.4], [Ra + 0.2, 1.4], [Ra + 0.2, 1.55], [Ra - 0.05, 1.55]], n * 2, { colour: shade(BARRERA, 0.7), decor: true });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    sink.placed(a, Math.sin(a) * (Ra - 0.8), 0, Math.cos(a) * (Ra - 0.8), () => sink.span('structureMetal', -0.9, 0.05, -0.05, 0.9, 1.6, 0.05, { colour: BARRERA, decor: true }));
  }
  revolve(sink, 'stone', 0, 0, [[Ra + 0.1, 0.03], [rBot, 0.03]], n, { decor: true, shade: 0.75 }, Math.PI / n);
  // ---- the Puerta del Príncipe: a stone portal proud of the front facet — paired Tuscan columns on pedestals either side
  // of the arched gate, the entablature and the balcony over it, its door between pilasters, the upper entablature and
  // the pediment with its raking cornices, the royal arms' boss and the finials
  const pz = Ro * Math.cos(Math.PI / n), pw = 2 * Ro * Math.sin(Math.PI / n), FRONT: Vec3 = [0, 0, 1];
  sink.span('stone', -pw / 2 + 0.2, foot, pz, pw / 2 - 0.2, H, pz + 0.5, { shade: 0.95 });
  const gw = 3.0, gh = 4.6;
  sink.span('dark', -gw / 2, 0, pz + 0.49, gw / 2, gh, pz + 0.52, { decor: true });
  for (let i = 0; i < 8; i++) {
    const t0 = Math.PI * i / 8, t1 = Math.PI * (i + 1) / 8;
    sink.quad('dark', [Math.cos(t1) * gw / 2, gh + Math.sin(t1) * gw / 2, pz + 0.52], [Math.cos(t0) * gw / 2, gh + Math.sin(t0) * gw / 2, pz + 0.52], [Math.cos(t0) * gw / 2, gh, pz + 0.52], [Math.cos(t1) * gw / 2, gh, pz + 0.52], { decor: true });
    bar(sink, 'stone', [Math.cos(t0) * (gw / 2 + 0.15), gh + Math.sin(t0) * (gw / 2 + 0.15), pz + 0.6], [Math.cos(t1) * (gw / 2 + 0.15), gh + Math.sin(t1) * (gw / 2 + 0.15), pz + 0.6], 0.3, { decor: true, shade: i === 3 || i === 4 ? 1.0 : 0.9 });
  }
  // the gate's leaves in their frame, two iron bands across them
  sink.span('structureWood', -gw / 2 + 0.05, 0, pz + 0.46, gw / 2 - 0.05, gh - 0.05, pz + 0.5, { colour: DOOR, decor: true });
  for (const y of [1.0, 3.2]) bar(sink, 'structureMetal', [-gw / 2 + 0.1, y, pz + 0.52], [gw / 2 - 0.1, y, pz + 0.52], 0.05, { colour: IRON, decor: true, fine: true });
  for (const s of [-1, 1]) for (const dx of [2.2, 3.0]) {
    revolve(sink, 'stone', s * dx, pz + 1.1, columnProfile(0.3, F1 - 1.0, 0.9), 12, {});
    sink.span('stone', s * dx - 0.42, -0.3, pz + 0.68, s * dx + 0.42, 0.9, pz + 1.52, {});
    sink.span('stone', s * dx - 0.48, 0.78, pz + 0.62, s * dx + 0.48, 0.9, pz + 1.58, { decor: true, shade: 0.92 });
  }
  sink.span('stone', -3.6, F1 - 0.1, pz + 0.5, 3.6, F1 + 0.6, pz + 1.7, {});
  // the balcony over the gate: its door in a stone frame between pilasters, the iron rail on the entablature
  sink.span('dark', -0.8, F1 + 0.65, pz + 0.49, 0.8, F1 + 3.2, pz + 0.52, { decor: true });
  for (const [x0, y0, x1, y1] of [[-1.05, F1 + 0.6, -0.8, F1 + 3.45], [0.8, F1 + 0.6, 1.05, F1 + 3.45], [-1.05, F1 + 3.2, 1.05, F1 + 3.55]] as const)
    sink.span('stone', x0, y0, pz + 0.5, x1, y1, pz + 0.66, { decor: true, shade: 0.98 });
  for (const s of [-1, 1]) sink.span('stone', s * 2.0 - 0.28, F1 + 0.6, pz + 0.5, s * 2.0 + 0.28, H - 0.4, pz + 0.72, { shade: 0.93 });
  for (let x = -3.3; x <= 3.31; x += 0.22) bar(sink, 'structureMetal', [x, F1 + 0.6, pz + 1.6], [x, F1 + 1.6, pz + 1.6], 0.03, { colour: IRON, decor: true, fine: true });
  bar(sink, 'structureMetal', [-3.4, F1 + 1.6, pz + 1.6], [3.4, F1 + 1.6, pz + 1.6], 0.05, { colour: IRON, decor: true });
  // the upper entablature and the pediment over it: the tympanum's solid, the raking cornices along its slopes
  const py = H + 0.1, pr = 1.7;
  sink.span('stone', -3.6, py - 0.4, pz + 0.5, 3.6, py, pz + 0.9, {});
  extrude(sink, 'stone', [[-3.3, py, pz + 0.5], [3.3, py, pz + 0.5], [0, py + pr, pz + 0.5]], [0, 0, 1], 0.32, {});
  for (const s of [-1, 1]) bar(sink, 'stone', [s * 3.55, py + 0.08, pz + 0.78], [0, py + pr + 0.2, pz + 0.78], 0.24, { decor: true, shade: 0.92 });
  sink.cylinder('stone', [0, py + 0.6, pz + 0.82], 'z', 0.12, 0.42, 12, { decor: true });
  facing(sink, 'stone', [[-0.32, py + 0.25, pz + 0.83], [0.32, py + 0.25, pz + 0.83], [0.32, py + 0.95, pz + 0.83], [-0.32, py + 0.95, pz + 0.83]], FRONT, { decor: true, shade: 1.05 });
  // (the finials: stone balls on their blocks at the pediment's ends and its apex)
  for (const [x, y] of [[-3.35, py], [3.35, py], [0, py + pr + 0.28]] as const) {
    sink.span('stone', x - 0.2, y - 0.02, pz + 0.55, x + 0.2, y + 0.3, pz + 0.85, { decor: true });
    revolve(sink, 'stone', x, pz + 0.7, [[0.12, y + 0.3], [0.2, y + 0.42], [0.17, y + 0.58], [0.05, y + 0.66]], 6, { decor: true });
  }
  // the lamps either side of the gate
  for (const s of [-1, 1]) {
    bar(sink, 'structureMetal', [s * 1.8, gh - 0.4, pz + 0.5], [s * 1.8, gh - 0.4, pz + 1.2], 0.04, { colour: IRON, decor: true, fine: true });
    sink.span('structureMetal', s * 1.8 - 0.18, gh - 0.9, pz + 1.05, s * 1.8 + 0.18, gh - 0.35, pz + 1.4, { colour: IRON, decor: true, fine: true });
  }
  // ---- the plaza at its foot: a flagged apron round the ring, worn to beaten earth in places, wider before the gate
  // and darker on the gate's line, the stone bollards (guardacantones) on its edge
  const Rp = Ro + 1.35, EARTHEN: Rgb = [0.8, 0.72, 0.6];
  for (let k = 0; k < n; k++) {
    const k0 = k - 1 + n, mid = (k / n) * Math.PI * 2, OUT: Vec3 = [Math.sin(mid), 0, Math.cos(mid)];
    const worn = v() < 0.22, o: EmitOptions = worn ? { decor: true, ground: true, tint: EARTHEN, shade: 0.8 + v() * 0.1 } : { decor: true, ground: true, density: 1.1, shade: 0.72 + v() * 0.2 };
    const bucket = worn ? 'plaster2' as const : 'stone' as const;
    facing(sink, bucket, [at(k0, Ro - 0.05, 0.04), at(k, Ro - 0.05, 0.04), at(k, Rp, 0.04), at(k0, Rp, 0.04)], UP, o);
    facing(sink, bucket, [at(k0, Rp, foot), at(k, Rp, foot), at(k, Rp, 0.04), at(k0, Rp, 0.04)], OUT, o);
    if (k % 2 === 1 && k !== 1 && k !== n - 1) {
      const p = at(k, Ro + 1.05, 0);
      revolve(sink, 'stone', p[0], p[2], [[0.17, -0.1], [0.17, 0.6], [0.11, 0.8], [0.04, 0.86]], 5, { decor: true, shade: 0.85 + v() * 0.1 });
    }
  }
  const zP = Ro + 2.3;
  sink.span('stone', -4.6, foot, pz + 0.5, 4.6, 0.05, zP, { decor: true, ground: true, density: 1.1, shade: 0.78 });
  facing(sink, 'stone', [[-1.7, 0.055, pz + 0.5], [1.7, 0.055, pz + 0.5], [1.7, 0.055, zP], [-1.7, 0.055, zP]], UP, { decor: true, ground: true, density: 1.1, shade: 0.62 });
  for (const x of [-4.3, -1.95, 1.95, 4.3]) revolve(sink, 'stone', x, zP - 0.3, [[0.17, 0], [0.17, 0.65], [0.11, 0.85], [0.04, 0.91]], 5, { decor: true });
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV, [RENDER]), tints: { plaster: WHITEWASH } };
};

// ------------------------------------------------------------------------------------------------------- the alcazaba

/** The tapia's formwork lift (a course of the shutters' height) and how far each lift stands back on the one below. */
const LIFT = 0.85, STEP = 0.045, TAPIA = 'plaster2' as const;
/** The rise the citadel stands on, the curtain's thickness (half) and its core's face behind the skin of lifts. */
const RISE = 2.0, HALF = 1.1, CORE = 0.45;
/** Earth: the rise's banks and the ward's ground, the tapia's own clay darker and browner. */
const EARTH: Rgb = [0.74, 0.66, 0.54];

/** A face's frame: a point at `s` along it, `y` up and `d` out of the building (the face's outward normal is +d). */
type Pt = (s: number, y: number, d: number) => Vec3;
interface Side { P: Pt; d0: number; ext: (d: number) => readonly [number, number] }

/** The four sides of an axis-aligned block (+x, -x, +z, -z), each run mitred to its neighbours at any depth d. */
function rectSides(cx: number, cz: number, hx: number, hz: number): Side[] {
  const ex = (d: number): readonly [number, number] => [-(d - hx + hz), d - hx + hz];
  const ez = (d: number): readonly [number, number] => [-(d - hz + hx), d - hz + hx];
  return [
    { P: (s, y, d) => [cx + d, y, cz + s], d0: hx, ext: ex },
    { P: (s, y, d) => [cx - d, y, cz + s], d0: hx, ext: ex },
    { P: (s, y, d) => [cx + s, y, cz + d], d0: hz, ext: ez },
    { P: (s, y, d) => [cx + s, y, cz - d], d0: hz, ext: ez },
  ];
}

interface Lifts {
  P: Pt;
  /** the first lift's foot (the plinth's head) and the face's head */
  yb: number; head: number;
  /** the first lift's face and the core's behind the skin (an erosion hollow stops short of it) */
  d0: number; core: number;
  ext: (d: number) => readonly [number, number];
  /** a cajón's length; the shares of them eroded to hollows and patched in stone and brick */
  cell: number; hollow: number; patch: number;
  putlog: boolean;
  tone: number;
  /** cells kept whole (a window's): [s0, s1, y0, y1] */
  keep?: ReadonlyArray<readonly [number, number, number, number]>;
}

/**
 * A tapia face in its formwork lifts: each lift LIFT tall and STEP behind the one below, its cajones (staggered from row
 * to row) each a tone of their own; a share eroded to a hollow under the lift's lime-rich head, a share patched in
 * rubble stone laced with brick courses; rows of putlog holes; the ledge each lift leaves on the one below. Dressing (the
 * core behind it is the structure). Returns the top lift's face.
 */
function lifts(sink: PartSink, f: Lifts, v: () => number): { d: number } {
  const OUT = sub(f.P(0, 0, 1), f.P(0, 0, 0)), AL = sub(f.P(1, 0, 0), f.P(0, 0, 0));
  const q = (bucket: RegionalBucket, s0: number, s1: number, y0: number, y1: number, d: number, opts: EmitOptions) =>
    facing(sink, bucket, [f.P(s0, y0, d), f.P(s1, y0, d), f.P(s1, y1, d), f.P(s0, y1, d)], OUT, opts);
  let d = f.d0;
  for (let i = 0, y0 = f.yb; y0 < f.head - 0.02; i++, y0 += LIFT) {
    d = f.d0 - i * STEP;
    const [sa, sb] = f.ext(d), y1 = Math.min(y0 + LIFT, f.head), full = y0 + LIFT <= f.head + 1e-6;
    const row = f.tone * (0.9 + v() * 0.12);
    const k = Math.max(1, Math.round((sb - sa) / f.cell)), cuts = [sa];
    for (let j = 1; j <= k; j++) {
      const t = (j - (i % 2) * 0.5 + (v() - 0.5) * 0.3) / k;
      if (t > 0.08 && t < 0.92) cuts.push(sa + (sb - sa) * t);
    }
    cuts.push(sb);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const c0 = cuts[c], c1 = cuts[c + 1], r = v(), tone = row * (0.92 + v() * 0.14);
      const kept = f.keep?.some(([k0, k1, ky0, ky1]) => c1 > k0 && c0 < k1 && y1 > ky0 && y0 < ky1) ?? false;
      const o: EmitOptions = { decor: true, shade: tone };
      if (!kept && full && i >= 1 && y1 < f.head - 0.25 && c1 - c0 > 1.3 && r < f.hollow) {
        // the hollow: the cajón's earth washed out under the lift's lime-rich head, its edges left standing
        const m0 = c0 + 0.18 + v() * 0.3, m1 = c1 - 0.18 - v() * 0.3, top = y1 - 0.1 - v() * 0.18, bot = y0 + v() * 0.12;
        const depth = Math.min(0.12 + v() * 0.16, d - f.core - 0.04), e = d - depth;
        q(TAPIA, c0, m0, y0, y1, d, o); q(TAPIA, m1, c1, y0, y1, d, o); q(TAPIA, m0, m1, top, y1, d, o);
        if (bot > y0 + 0.01) q(TAPIA, m0, m1, y0, bot, d, o);
        if (depth > 0.03) {
          q(TAPIA, m0, m1, bot, top, e, { decor: true, shade: tone * 0.62 });
          facing(sink, TAPIA, [f.P(m0, bot, e), f.P(m0, bot, d), f.P(m0, top, d), f.P(m0, top, e)], AL, { decor: true, shade: tone * 0.55 });
          facing(sink, TAPIA, [f.P(m1, bot, e), f.P(m1, bot, d), f.P(m1, top, d), f.P(m1, top, e)], neg(AL), { decor: true, shade: tone * 0.55 });
          facing(sink, TAPIA, [f.P(m0, top, e), f.P(m1, top, e), f.P(m1, top, d), f.P(m0, top, d)], DOWN, { decor: true, shade: tone * 0.45 });
          facing(sink, TAPIA, [f.P(m0, bot, e), f.P(m1, bot, e), f.P(m1, bot, d), f.P(m0, bot, d)], UP, { decor: true, shade: tone * 0.85 });
        } else q(TAPIA, m0, m1, bot, top, d, o);
        continue;
      }
      if (!kept && r < f.hollow + f.patch && c1 - c0 > 0.8) {
        // the render fallen and the gap patched: rubble stone laced with brick courses (verdugadas)
        q('stone', c0, c1, y0, y1, d, { decor: true, shade: 0.78 + v() * 0.16, density: 1.1 });
        const nb = full ? 2 : 1;
        for (let b = 0; b < nb; b++) {
          const yy = y0 + (b + 0.5) * (y1 - y0) / nb;
          q('roof', c0 + 0.06, c1 - 0.06, yy - 0.05, yy + 0.05, d + 0.015, { decor: true, shade: 0.8 });
        }
        continue;
      }
      q(TAPIA, c0, c1, y0, y1, d, o);
      if (f.putlog && full && i % 3 === 1) {
        for (let s = c0 + 0.35 + v() * 0.3; s < c1 - 0.25; s += 1.05 + v() * 0.3) q('dark', s - 0.07, s + 0.07, y0 + 0.05, y0 + 0.17, d + 0.008, { decor: true, fine: 'near' });
      }
    }
    if (full && y0 + LIFT < f.head - 0.02) {
      const dn = d - STEP, [na, nb] = f.ext(dn);
      facing(sink, TAPIA, [f.P(sa, y1, d), f.P(sb, y1, d), f.P(nb, y1, dn), f.P(na, y1, dn)], UP, { decor: true, shade: f.tone * 1.04 });
    }
  }
  return { d };
}

/** An Almohad merlon on its parapet's head at y: a block from s0 to s1, dIn to dOut deep, `h` tall, its pyramid cap. */
function merlon(sink: PartSink, bucket: RegionalBucket, P: Pt, s0: number, s1: number, dIn: number, dOut: number, y: number, h: number, cap: boolean, opts: EmitOptions): void {
  const c = P((s0 + s1) / 2, y + h / 2, (dIn + dOut) / 2);
  const put = (pts: Vec3[]) => facing(sink, bucket, pts, sub(centroid(pts), c), opts);
  const A = P(s0, y, dOut), B = P(s1, y, dOut), C = P(s1, y + h, dOut), D = P(s0, y + h, dOut);
  const E = P(s0, y, dIn), F = P(s1, y, dIn), G = P(s1, y + h, dIn), K = P(s0, y + h, dIn);
  put([A, B, C, D]); put([F, E, K, G]); put([E, A, D, K]); put([B, F, G, C]);
  if (cap) {
    const apex = P((s0 + s1) / 2, y + h + 0.36, (dIn + dOut) / 2);
    put([D, C, apex]); put([C, G, apex]); put([G, K, apex]); put([K, D, apex]);
  } else put([D, C, G, K]);
}

/** A side's battlement on its terrace at y: the parapet `ph` tall (its outer face too when `outer`), its merlons. */
function battlement(sink: PartSink, bucket: RegionalBucket, f: Side, dOut: number, y: number, ph: number, merlons: boolean, v: () => number,
  opts: EmitOptions, outer = false): void {
  const OUT = sub(f.P(0, 0, 1), f.P(0, 0, 0)), dIn = dOut - 0.6, [ia, ib] = f.ext(dIn), [oa, ob] = f.ext(dOut);
  facing(sink, bucket, [f.P(ia, y, dIn), f.P(ib, y, dIn), f.P(ib, y + ph, dIn), f.P(ia, y + ph, dIn)], neg(OUT), opts);
  facing(sink, bucket, [f.P(oa, y + ph, dOut), f.P(ob, y + ph, dOut), f.P(ib, y + ph, dIn), f.P(ia, y + ph, dIn)], UP, opts);
  if (outer) facing(sink, bucket, [f.P(oa, y, dOut), f.P(ob, y, dOut), f.P(ob, y + ph, dOut), f.P(oa, y + ph, dOut)], OUT, opts);
  if (!merlons) return;
  const len = ob - oa, m = Math.max(2, Math.round(len / 2.1));
  for (let j = 0; j < m; j++) {
    const c = oa + (j + 0.5) * len / m, r = v();
    if (r < 0.12) continue;
    const stub = r < 0.22;
    merlon(sink, bucket, f.P, c - 0.44, c + 0.44, dIn, dOut, y + ph, stub ? 0.45 + v() * 0.3 : 1.1, !stub, opts);
  }
}

/** A battered block (a plinth): its foot `hxB` x `hzB` at yB, its head `hxT` x `hzT` at yT, closed. */
function frustum(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, hxB: number, hzB: number, yB: number, hxT: number, hzT: number, yT: number, opts: EmitOptions): void {
  const c: Vec3 = [cx, (yB + yT) / 2, cz];
  const p = (sx: number, sz: number, top: boolean): Vec3 => [cx + sx * (top ? hxT : hxB), top ? yT : yB, cz + sz * (top ? hzT : hzB)];
  const ring: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % 4], pts = [p(ax, az, false), p(bx, bz, false), p(bx, bz, true), p(ax, az, true)];
    facing(sink, bucket, pts, sub(centroid(pts), c), opts);
  }
  facing(sink, bucket, ring.map(([sx, sz]) => p(sx, sz, true)), UP, opts);
  facing(sink, bucket, ring.map(([sx, sz]) => p(sx, sz, false)), DOWN, opts);
}

/** A window (or a door) under a round brick arch on a face at d: the dark opening, the voussoirs, the jambs, a stone sill. */
function brickArch(sink: PartSink, P: Pt, s: number, y0: number, w: number, h: number, d: number): void {
  const OUT = sub(P(0, 0, 1), P(0, 0, 0)), r = w / 2, ys = y0 + h;
  const hole: Vec3[] = [P(s - r, y0, d + 0.02), P(s + r, y0, d + 0.02)];
  for (let i = 0; i <= 6; i++) { const a = Math.PI * i / 6; hole.push(P(s + Math.cos(a) * r, ys + Math.sin(a) * r, d + 0.02)); }
  facing(sink, 'dark', hole, OUT, { decor: true });
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI * i / 6, a1 = Math.PI * (i + 1) / 6, R = (a: number, k: number): Vec3 => P(s + Math.cos(a) * k, ys + Math.sin(a) * k, d + 0.04);
    facing(sink, 'roof', [R(a0, r), R(a1, r), R(a1, r + 0.22), R(a0, r + 0.22)], OUT, { decor: true, shade: i % 2 ? 0.92 : 0.76 });
  }
  for (const [u0, u1] of [[s - r - 0.18, s - r], [s + r, s + r + 0.18]] as const)
    facing(sink, 'roof', [P(u0, y0, d + 0.04), P(u1, y0, d + 0.04), P(u1, ys, d + 0.04), P(u0, ys, d + 0.04)], OUT, { decor: true, shade: 0.84 });
  facing(sink, 'stone', [P(s - r - 0.22, y0 - 0.12, d + 0.05), P(s + r + 0.22, y0 - 0.12, d + 0.05), P(s + r + 0.22, y0, d + 0.05), P(s - r - 0.22, y0, d + 0.05)], OUT, { decor: true });
}

interface Tower {
  cx: number; cz: number; hx: number; hz: number; foot: number; yb: number; top: number; ruined: boolean;
  /** windows: [side (+x, -x, +z, -z), s, sill, width, height to the spring] */
  wins: ReadonlyArray<readonly [number, number, number, number, number]>;
  merlons: readonly boolean[]; tone: number; cell: number; hollow: number; patch: number;
}

/** A square tapia tower (or the keep): its core, its battered stone socle, its lifts on every side, battlements. */
function tapiaTower(sink: PartSink, v: () => number, t: Tower): void {
  sink.span(TAPIA, t.cx - t.hx + 0.6, t.foot, t.cz - t.hz + 0.6, t.cx + t.hx - 0.6, t.top, t.cz + t.hz - 0.6, { shade: 0.88 });
  frustum(sink, 'stone', t.cx, t.cz, t.hx + 0.42, t.hz + 0.42, t.foot, t.hx + 0.02, t.hz + 0.02, t.yb, { shade: 0.86 });
  const ph = t.ruined ? 0.3 + v() * 0.35 : 1.0;
  rectSides(t.cx, t.cz, t.hx, t.hz).forEach((f, i) => {
    const mine = t.wins.filter((w) => w[0] === i);
    const keep = mine.map(([, s, y, w, h]) => [s - w / 2 - 0.4, s + w / 2 + 0.4, y - 0.2, y + h + w / 2 + 0.3] as const);
    const top = lifts(sink, { P: f.P, yb: t.yb, head: t.top + ph, d0: f.d0, core: f.d0 - 0.6, ext: f.ext, cell: t.cell, hollow: t.hollow, patch: t.patch, putlog: false, tone: t.tone, keep }, v);
    for (const [, s, y, w, h] of mine) brickArch(sink, f.P, s, y, w, h, f.d0 - Math.floor((y - t.yb) / LIFT) * STEP);
    battlement(sink, TAPIA, f, top.d, t.top, ph, t.merlons[i] && !(t.ruined && v() < 0.6), v, { decor: true, shade: t.tone });
  });
}

interface Seg { s0: number; s1: number; kind: 'intact' | 'lost' | 'breach'; head: number }
interface Wall { foot: number; yb: number; ww: number; pt: number; ruin: number }

/**
 * A run of the curtain from corner a to b (its centre line), drawn along the `parts` of it between its towers: the stone
 * plinth's batter, the rise's banks of earth and rock at its foot (`room`: how far out they may run at s, 0 for none),
 * and the wall in stretches of a few metres, each standing whole to its battlement, its parapet fallen, or breached to a
 * stub over its rubble. Local frame: z along the run, -x out of the ward.
 */
function curtain(sink: PartSink, v: () => number, w: Wall, a: readonly [number, number], b: readonly [number, number],
  parts: ReadonlyArray<readonly [number, number]>, room: (s: number) => number): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  sink.placed(Math.atan2(ux, uz), a[0], 0, a[1], () => {
    const P: Pt = (s, y, d) => [-d, y, s];
    const AL: Vec3 = [0, 0, 1], IN: Vec3 = [1, 0, 0];
    for (const [p0, p1] of parts) {
      if (p1 - p0 < 1) continue;
      // the plinth: a battered course of rubble stone the tapia was raised on
      extrude(sink, 'stone', [[-0.3, RISE - 0.5, p0], [-(HALF + 0.45), RISE - 0.5, p0], [-(HALF + 0.03), w.yb, p0], [-0.3, w.yb, p0]], [0, 0, 1], p1 - p0, { shade: 0.86 });
      // the rise: banks of earth and outcrops of the rock, each its own run, toe and lip
      for (let s = p0; s < p1 - 0.4;) {
        const e = Math.min(p1, s + 3.2 + v() * 3), r = room((s + e) / 2), rock = v() < 0.45;
        const toe = HALF + 0.45 + Math.min(r, 1.3 + v() * 1.7), lip = RISE - 0.12 + v() * 0.25, knee = 0.04 + v() * 0.35;
        if (r > 0.6) {
          extrude(sink, rock ? 'stone' : TAPIA, [[-0.3, w.foot, s - 0.2], [-toe, w.foot, s - 0.2], [-toe, knee, s - 0.2], [-(HALF + 0.55), lip, s - 0.2], [-0.3, RISE - 0.15, s - 0.2]],
            [0, 0, 1], e - s + 0.4, rock ? { shade: 0.66 + v() * 0.14, density: 0.22 } : { shade: 0.78 + v() * 0.1, tint: EARTH });
        }
        s = e;
      }
      // the stretches and what time left of each
      const n = Math.max(1, Math.round((p1 - p0) / 3.4)), cuts = [p0];
      for (let j = 1; j < n; j++) cuts.push(p0 + (p1 - p0) * (j + (v() - 0.5) * 0.35) / n);
      cuts.push(p1);
      const segs: Seg[] = [];
      for (let j = 0; j < n; j++) {
        const r = v(), inner = j > 0 && j < n - 1 && segs[j - 1].kind !== 'breach';
        const kind: Seg['kind'] = inner && r < w.ruin * 0.8 ? 'breach' : r < 0.2 + w.ruin ? 'lost' : 'intact';
        const head = kind === 'intact' ? w.pt + (v() - 0.5) * 0.12 : kind === 'lost' ? w.ww + 0.7 - v() * 2.4 : w.yb + 0.5 + v() * 1.9;
        segs.push({ s0: cuts[j], s1: cuts[j + 1], kind, head });
      }
      for (const g of segs) {
        const tone = 0.94 + v() * 0.1, len = g.s1 - g.s0;
        // the core (the structure): its inner face the ward's side, its head the wall-walk where the walk survives
        sink.span(TAPIA, -CORE, w.foot, g.s0, HALF, Math.min(g.head, w.ww), g.s1, { shade: 0.86 + v() * 0.1 });
        const top = lifts(sink, { P, yb: w.yb, head: g.head, d0: HALF, core: CORE, ext: () => [g.s0, g.s1], cell: 2.6, hollow: 0.13, patch: 0.08, putlog: true, tone }, v);
        const o: EmitOptions = { decor: true, shade: tone };
        if (g.head > w.ww + 0.05) {
          // the parapet over the walk (its outer face the top lifts) and its pyramid-capped merlons, a share fallen
          const dIn = top.d - 0.62;
          facing(sink, TAPIA, [P(g.s0, w.ww, dIn), P(g.s1, w.ww, dIn), P(g.s1, g.head, dIn), P(g.s0, g.head, dIn)], IN, o);
          facing(sink, TAPIA, [P(g.s0, g.head, dIn), P(g.s1, g.head, dIn), P(g.s1, g.head, top.d), P(g.s0, g.head, top.d)], UP, o);
          for (const [s, dir] of [[g.s0, neg(AL)], [g.s1, AL]] as const) facing(sink, TAPIA, [P(s, w.ww, dIn), P(s, w.ww, top.d), P(s, g.head, top.d), P(s, g.head, dIn)], dir, { decor: true, shade: tone * 0.85 });
          if (g.kind === 'intact') {
            const m = Math.max(1, Math.floor(len / 2.0));
            for (let k = 0; k < m; k++) {
              const c = g.s0 + (k + 0.5) * len / m, r = v();
              if (r < 0.14) continue;
              const stub = r < 0.26;
              merlon(sink, TAPIA, P, c - 0.47, c + 0.47, dIn, top.d, g.head, stub ? 0.4 + v() * 0.35 : 1.1 + v() * 0.1, !stub, { decor: true, shade: tone * (0.95 + v() * 0.08) });
            }
          }
        } else {
          // a broken head: the lifts' tops over the core's, lumps of the fallen courses left on it
          facing(sink, TAPIA, [P(g.s0, g.head, CORE), P(g.s1, g.head, CORE), P(g.s1, g.head, top.d), P(g.s0, g.head, top.d)], UP, o);
          for (let l = v() < 0.5 ? 1 : 2; l > 0; l--) {
            const z0 = g.s0 + 0.3 + v() * Math.max(0.1, len - 1.8), zl = 0.6 + v() * 0.8, hh = 0.25 + v() * 0.5, dA = -HALF + 0.15 + v() * 0.6, dB = Math.min(top.d - 0.05, dA + 0.7 + v() * 0.6);
            sink.span(TAPIA, -dB, Math.min(g.head, w.ww) - 0.02, z0, -dA, g.head + hh, z0 + zl, { decor: true, shade: tone * 0.95 });
          }
        }
        if (g.kind === 'breach') {
          // the breach: its spill of earth and stone down both faces, blocks of the fallen tapia thrown off it
          extrude(sink, 'stone', [[-(HALF + 2.0 + v()), 0.0, g.s0 + len * 0.1], [HALF + 1.4 + v(), RISE - 0.35, g.s0 + len * 0.1], [0.5, g.head + 0.3, g.s0 + len * 0.1], [-0.7, g.head + 0.3, g.s0 + len * 0.1]],
            [0, 0, 1], len * 0.8, { decor: true, shade: 0.72, density: 0.8 });
          for (let i = 0; i < 4; i++) {
            const out = i % 2 === 0, x = (out ? -1 : 1) * (HALF + 0.9 + v() * 1.6), z = g.s0 + v() * len, ha = 0.35 + v() * 0.4, hc = 0.3 + v() * 0.35, hh = 0.35 + v() * 0.4, y0 = out ? 0 : RISE - 0.25;
            sink.placed(v() * Math.PI, x, 0, z, () => sink.span(TAPIA, -ha, y0, -hc, ha, y0 + hh + (out ? 0.6 : 0), hc, { decor: true, shade: 0.8 + v() * 0.15 }));
          }
        }
      }
      // the steps between neighbours' heads: the higher stretch's end over the lower's head, lift by lift
      for (let j = 0; j + 1 < segs.length; j++) {
        const A = segs[j], B = segs[j + 1], hi = A.head > B.head ? A : B, lo = hi === A ? B : A, dir = hi === A ? AL : neg(AL), s = A.s1;
        const yTo = hi.head > w.ww + 0.05 ? w.ww : hi.head;
        for (let i = 0, y0 = w.yb; y0 < yTo - 0.01; i++, y0 += LIFT) {
          const ya = Math.max(y0, lo.head), yc = Math.min(y0 + LIFT, yTo);
          if (yc - ya < 0.01) continue;
          const d = HALF - i * STEP;
          facing(sink, TAPIA, [P(s, ya, CORE), P(s, ya, d), P(s, yc, d), P(s, yc, CORE)], dir, { decor: true, shade: 0.8 });
        }
      }
    }
  });
}

/**
 * The horseshoe arch of the gate in its own frame (x across, the face at zf, the passage back to zb): the masonry over
 * it, its spandrels and soffit, the horseshoe's returns below the spring, the voussoirs in alternating stone and brick,
 * the alfiz framing it, the closed leaves at the passage's back under a timber tympanum.
 */
function horseshoe(sink: PartSink, ga: number, base: number, spring: number, zf: number, zb: number, top: number): void {
  const n = 12, arcAt = (i: number): number => -0.17 * Math.PI + 1.34 * Math.PI * i / n;
  const p = (a: number, z: number, k = 1): Vec3 => [Math.cos(a) * ga * k, spring + Math.sin(a) * ga * 1.1 * k, z];
  const crown = spring + ga * 1.1, FRONT: Vec3 = [0, 0, 1];
  sink.span('stone', -ga, crown, zb, ga, top, zf, { shade: 0.92 });
  for (let i = 0; i < n; i++) {
    const a0 = arcAt(i), a1 = arcAt(i + 1), am = (a0 + a1) / 2;
    facing(sink, 'stone', [p(a1, zf), p(a0, zf), [Math.cos(a0) * ga * 1.12, crown + 0.02, zf], [Math.cos(a1) * ga * 1.12, crown + 0.02, zf]], FRONT, { shade: 0.92 });
    facing(sink, 'stone', [p(a0, zf), p(a1, zf), p(a1, zb), p(a0, zb)], [-Math.cos(am), -Math.sin(am), 0], { shade: 0.7 });
    facing(sink, i % 2 ? 'stone' : 'roof', [p(a1, zf + 0.04), p(a0, zf + 0.04), p(a0, zf + 0.04, 1.34), p(a1, zf + 0.04, 1.34)], FRONT, { decor: true, shade: i % 2 ? 1.0 : 0.9 });
  }
  for (const s of [-1, 1]) sink.span('stone', s < 0 ? -ga - 0.01 : ga * 0.86, spring - ga * 0.62, zb, s < 0 ? -ga * 0.86 : ga + 0.01, spring + 0.1, zf, {});
  const ay0 = spring - ga * 0.66, ay1 = spring + ga * 1.1 * 1.42, ax = ga * 1.48;
  for (const [x0, y0, x1, y1] of [[-ax - 0.25, ay0, -ax, ay1], [ax, ay0, ax + 0.25, ay1], [-ax - 0.25, ay1, ax + 0.25, ay1 + 0.25]] as const)
    sink.span('stone', x0, y0, zf, x1, y1, zf + 0.14, { decor: true, shade: 0.92 });
  // the leaves, closed, iron-banded; the timber tympanum over them in the horseshoe's head
  sink.span('structureWood', -ga * 0.98, base, zb, ga * 0.98, spring - ga * 0.62, zb + 0.1, { colour: DOOR, decor: true });
  sink.span('structureWood', -ga * 0.84, spring - ga * 0.62, zb, ga * 0.84, spring, zb + 0.1, { colour: DOOR, decor: true });
  const tymp: Vec3[] = [];
  for (let i = 0; i <= 6; i++) tymp.push(p(Math.PI * i / 6, zb + 0.02));
  facing(sink, 'structureWood', tymp, FRONT, { colour: shade(DOOR, 0.8), decor: true });
  for (const y of [base + 0.5, spring - ga * 0.9]) bar(sink, 'structureMetal', [-ga * 0.9, y, zb + 0.12], [ga * 0.9, y, zb + 0.12], 0.05, { colour: IRON, decor: true, fine: true });
}

/**
 * The alcazaba: the keep (`keep` square, `height` tall over the rise) astride the back curtain, the curtain walls
 * (`wall` high over the rise) round a `ward` x `depth` court with square towers at its corners, the gate tower on the
 * front (+z) with its arch in its side, breaches where the look stream throws them (`ruin`: the share of the walls'
 * length fallen).
 */
export const alcazaba: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const K = num(ctx, 'keep', 8, 16), KH = num(ctx, 'height', 12, 26), WH = num(ctx, 'wall', 5, 12), W = num(ctx, 'ward', 24, 60), D = num(ctx, 'depth', 18, 50);
  const ruin = num(ctx, 'ruin', 0, 0.6), foot = -0.6 - ctx.groundFall;
  // the curtain's centre line 1.6 m in from the ward's edge: the towers stand 3.5 m proud of its face within the plan
  const XC = W / 2 - 1.6, ZC = D / 2 - 1.6, wall: Wall = { foot, yb: RISE + 0.9, ww: RISE + WH - 1.5, pt: RISE + WH - 0.5, ruin };
  const TH = RISE + WH + 2.6, proud = 3.5;
  // ---- the ward's ground on the rise
  sink.span(TAPIA, -XC, foot, -ZC, XC, RISE, ZC, { shade: 0.8, tint: EARTH });
  // ---- the corner towers: square, 3.5 m proud of both curtains, a window in an outer face, the odd one's top fallen
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
    const ox = sx * XC, oz = sz * ZC, xa = ox - sx * 2.9, xb = ox + sx * (HALF + proud), za = oz - sz * 2.9, zb = oz + sz * (HALF + proud);
    const ruined = v() < ruin * 1.2, top = TH - (ruined ? 1.5 + v() * 2.5 : 0), side = v() < 0.5 ? (sx > 0 ? 0 : 1) : (sz > 0 ? 2 : 3);
    tapiaTower(sink, v, { cx: (xa + xb) / 2, cz: (za + zb) / 2, hx: Math.abs(xb - xa) / 2, hz: Math.abs(zb - za) / 2, foot, yb: RISE + 1.0, top, ruined,
      wins: [[side, 0, top - 2.7, 0.75, 1.1]], merlons: [true, true, true, true], tone: 0.92 + v() * 0.1, cell: 2.5, hollow: 0.12, patch: 0.07 });
  }
  // ---- the keep astride the back curtain, 3.5 m proud of it: brick-arched windows high on each side, its door raised
  // over the ward, one side's merlons gone
  const kz1 = -(ZC + HALF + proud), kz0 = kz1 + K, kxLo = -XC + 2.9 + K / 2 + 1.5, kxHi = XC - 2.9 - K / 2 - 1.5;
  const kx = kxLo <= kxHi ? Math.min(kxHi, Math.max(kxLo, -W * 0.13)) : 0, KT = RISE + KH, bare = Math.floor(v() * 4);
  const kwins: Array<readonly [number, number, number, number, number]> = [];
  for (let i = 0; i < 4; i++) for (const s of [-K * 0.2, K * 0.2]) kwins.push([i, s, KT - 3.4, 0.8, 1.3]);
  kwins.push([2, 0, RISE + 4.2, 1.1, 1.8]);
  tapiaTower(sink, v, { cx: kx, cz: (kz0 + kz1) / 2, hx: K / 2, hz: K / 2, foot, yb: RISE + 1.2, top: KT, ruined: false, wins: kwins,
    merlons: [0, 1, 2, 3].map((i) => i !== bare), tone: 0.96, cell: 2.8, hollow: 0.15, patch: 0.1 });
  // ---- the gate tower: dressed stone, its horseshoe arch in its east side (the bent entrance: in along the curtain,
  // turned through the tower into the ward), a window over the front, its battlement, the ramp up to the arch
  const gx0 = -4.5, gx1 = 4.5, gz0 = ZC - 2.8, gz1 = ZC + HALF + proud + 0.6, gTop = RISE + WH + 2.8, ga = 1.05, gZ = (ZC + HALF + gz1) / 2, xb = gx1 - 1.5;
  sink.span('stone', gx0, foot, gz0, xb, gTop, gz1, { shade: 0.92 });
  sink.span('stone', xb, foot, gz0, gx1, gTop, gZ - ga, { shade: 0.92 });
  sink.span('stone', xb, foot, gZ + ga, gx1, gTop, gz1, { shade: 0.92 });
  sink.span('stone', xb, foot, gZ - ga, gx1, RISE, gZ + ga, { shade: 0.8 });
  frustum(sink, 'stone', 0, (gz0 + gz1) / 2, (gx1 - gx0) / 2 + 0.3, (gz1 - gz0) / 2 + 0.3, foot, (gx1 - gx0) / 2 + 0.02, (gz1 - gz0) / 2 + 0.02, RISE + 0.8, { shade: 0.84 });
  sink.placed(Math.PI / 2, gx1, 0, gZ, () => horseshoe(sink, ga, RISE, RISE + 2.3, 0, -1.5, gTop));
  const gSides = rectSides(0, (gz0 + gz1) / 2, (gx1 - gx0) / 2, (gz1 - gz0) / 2);
  gSides.forEach((f) => battlement(sink, 'stone', f, f.d0, gTop, 1.0, true, v, { decor: true, shade: 0.9 }, true));
  brickArch(sink, gSides[2].P, 0, gTop - 3.0, 0.9, 1.3, gSides[2].d0);
  brickArch(sink, gSides[3].P, 0, RISE, 2.2, 1.9, gSides[3].d0);
  const rampEnd = gx1 + RISE / 0.17;
  extrude(sink, 'stone', [[gx1, foot, ZC + HALF + 0.45], [rampEnd, foot, ZC + HALF + 0.45], [rampEnd, 0.02, ZC + HALF + 0.45], [gx1, RISE, ZC + HALF + 0.45]], [0, 0, 1], gz1 - 0.3 - (ZC + HALF + 0.45), { density: 0.9, shade: 0.82 });
  // ---- the curtains between them, their banks clear of the ramp
  const sideRoom = (): number => 3.0;
  curtain(sink, v, wall, [-XC, ZC], [XC, ZC], [[2.0, XC + gx0 + 1.0], [XC + gx1 - 1.0, 2 * XC - 2.0]], (s) => (s - XC > gx1 && s - XC < rampEnd + 0.5 ? 0 : 3.0));
  curtain(sink, v, wall, [XC, ZC], [XC, -ZC], [[2.0, 2 * ZC - 2.0]], sideRoom);
  curtain(sink, v, wall, [XC, -ZC], [-XC, -ZC], [[2.0, XC - kx - K / 2 + 1.0], [XC - kx + K / 2 - 1.0, 2 * XC - 2.0]], sideRoom);
  curtain(sink, v, wall, [-XC, -ZC], [-XC, ZC], [[2.0, 2 * ZC - 2.0]], sideRoom);
  // ---- the ward: a stair up the west curtain to its walk, the cistern's vault, the well head, rubble, house footings
  const stx = -XC + HALF, steps = 12, rise1 = (wall.ww - RISE) / steps;
  for (let i = 0; i < steps; i++) sink.span('stone', stx, RISE - 0.1, -ZC * 0.25 + i * 0.62, stx + 1.3, RISE + (i + 1) * rise1, -ZC * 0.25 + 8.0, { decor: true, shade: 0.82 + (i % 2) * 0.05 });
  const cx = W * 0.17, cz = D * 0.03;
  extrude(sink, TAPIA, [[cx - 3, RISE - 0.1, cz - 2], [cx - 3, RISE - 0.1, cz + 2], [cx - 3, RISE + 1.0, cz + 2], [cx - 3, RISE + 1.6, cz + 1.3], [cx - 3, RISE + 1.85, cz], [cx - 3, RISE + 1.6, cz - 1.3], [cx - 3, RISE + 1.0, cz - 2]],
    [1, 0, 0], 6, { decor: true, shade: 1.0, tint: [1.12, 1.1, 1.05] });
  revolve(sink, 'stone', W * 0.26, -D * 0.2, [[1.1, RISE - 0.3], [1.1, RISE + 0.8], [0.8, RISE + 0.8], [0.8, RISE + 0.5], [0.79, RISE + 0.5]], 10, { shade: 0.9 });
  for (const [fx, fz] of [[-0.3, 0.12], [-0.07, 0.18], [0.35, 0.24], [0.3, -0.3]] as const) {
    const x = fx * W + (v() - 0.5) * 2, z = fz * D + (v() - 0.5) * 2;
    sink.placed(v() * Math.PI, x, 0, z, () => extrude(sink, 'stone', [[-1.4, RISE - 0.1, -0.9], [1.4, RISE - 0.1, -0.9], [0.6, RISE + 0.5 + v() * 0.4, -0.9], [-0.8, RISE + 0.4, -0.9]], [0, 0, 1], 1.6 + v() * 1.2, { decor: true, shade: 0.78 }));
  }
  const hx = -W * 0.33, hz = -D * 0.12;
  for (const [x0, z0, x1, z1] of [[-2.5, -2, 2.5, -1.55], [-2.5, 1.55, 2.5, 2], [-2.5, -1.55, -2.05, 1.55], [2.05, -1.55, 2.5, 0.2]] as const)
    sink.span('stone', hx + x0, RISE - 0.1, hz + z0, hx + x1, RISE + 0.35 + v() * 0.35, hz + z1, { decor: true, shade: 0.8 });
  return { parts: sink.finish(), tints: { plaster2: [0.92, 0.86, 0.76] } };
};
