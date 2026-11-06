// src/world/landmarks/andalusia.ts — the Serranía de Ronda's bullring (landmarks-271, 2026-11-06). Cliffbridge is the
// white villages under the limestone crags round Ronda: the census (buildings-270 signature places) names the plaza de
// toros — "a circular two-tier arcade of stone columns under a tile roof ring around a sand arena", Ronda's of 1785 the
// oldest of its kind — near the bridgehead, facing an open plaza, and found it missing.
//
// - bullring: the ring's outer wall in whitewash over a stone plinth, its ground storey's barred windows in dressed
//   surrounds and the upper storey's arched openings between pilasters, the stone bands at each floor; the tile roof
//   ring over the upper gallery; the Puerta del Príncipe on the front, a stone portal of paired columns under a
//   pediment and balcony; inside, the arena's sand, the red barrera and its burladeros, the stone tiers rising to the
//   gallery's Tuscan columns under the roof.
//
// Drawn in its own frame (x across, y up, z out of the front) into the regional part sink, in the map kit's render, stone
// and roofing (no draw call of its own). The outer wall, tiers and the portal are structure; the columns, barrera,
// railings and the window joinery are dressing.
import { PartSink, rgb, shade, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve, columnProfile } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const BARRERA = rgb(0x7a2a1e), IRON = rgb(0x2a2726), SAND = rgb(0xc9a56a), DOOR = rgb(0x5a3a26);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/**
 * The plaza de toros: the ring (`radius` to its outer wall, `height` to its eaves) in `sides` facets, the arena
 * (`arena` radius), the portal on the front (+z).
 */
export const bullring: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const mobile = ctx.tier === 'mobile', v = ctx.variant;
  const Ro = num(ctx, 'radius', 18, 40), H = num(ctx, 'height', 8, 16), Ra = Math.min(Ro - 6, num(ctx, 'arena', 10, 34));
  const n = Math.max(16, Math.round(num(ctx, 'sides', 16, 48)));
  const foot = -0.6 - ctx.groundFall, F1 = H * 0.48;
  const ang = (k: number): number => (k / n) * Math.PI * 2 + Math.PI / n;
  const at = (k: number, r: number, y: number): Vec3 => [Math.sin(ang(k)) * r, y, Math.cos(ang(k)) * r];
  // the facet a k sits in faces out along the facet's middle; facet 0's middle is the front (+z)
  const front = (k: number): boolean => k === n - 1 || k === 0;
  // ---- the outer wall: each facet a face (u along it) with its windows in two storeys
  for (let k = 0; k < n; k++) {
    const a = at(k - 1 + n, Ro, 0), b = at(k, Ro, 0);
    // (the facet between corner k-1 and k, its middle at angle (k - 1/2) * step + step/2 = k * step)
    const mid = (k / n) * Math.PI * 2;
    const ox = Math.sin(mid), oz = Math.cos(mid), ux = Math.cos(mid), uz = -Math.sin(mid);
    const width = Math.hypot(b[0] - a[0], b[2] - a[2]), cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
    const P = (u: number, y: number, o = 0): Vec3 => [cx + ux * u + ox * o, y, cz + uz * u + oz * o];
    const portal = k === 0;
    // the wall in its parts: under, beside and over the openings (a ground window, an upper arch), each cut through
    const gw = 0.9, gy0 = 1.4, gy1 = 2.8, aw = 1.5, ay0 = F1 + 0.6, ay1 = H - 1.2;
    const quad = (u0: number, u1: number, y0: number, y1: number, shadeK = 1) => sink.quad('plaster3', P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), { shade: shadeK });
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
      for (let i = 0; i < 6; i++) sink.quad('plaster3', arch[i + 1], arch[i], P(Math.cos(Math.PI * i / 6) * aw / 2, H - 0.001), P(Math.cos(Math.PI * (i + 1) / 6) * aw / 2, H - 0.001), {});
      // the openings' reveals and dark backs, the ground window's grille and surround, the arch's stone ring
      sink.quad('dark', P(-gw / 2, gy0, -0.5), P(gw / 2, gy0, -0.5), P(gw / 2, gy1, -0.5), P(-gw / 2, gy1, -0.5), { decor: true });
      for (const s of [-1, 1]) sink.quad('plaster3', P(s * gw / 2, gy0, s < 0 ? 0 : -0.5), P(s * gw / 2, gy0, s < 0 ? -0.5 : 0), P(s * gw / 2, gy1, s < 0 ? -0.5 : 0), P(s * gw / 2, gy1, s < 0 ? 0 : -0.5), { shade: 0.75, decor: true });
      sink.quad('stone', P(-gw / 2 - 0.2, gy0 - 0.15, 0.06), P(gw / 2 + 0.2, gy0 - 0.15, 0.06), P(gw / 2 + 0.2, gy0, 0.06), P(-gw / 2 - 0.2, gy0, 0.06), { decor: true });
      if (!mobile) for (let u = -gw / 2 + 0.15; u < gw / 2; u += 0.15) bar(sink, 'structureMetal', P(u, gy0, -0.1), P(u, gy1, -0.1), 0.025, { colour: IRON, decor: true, fine: true });
      // (its dark back 0.16 m in: in front of the gallery's inner wall, 0.2 m behind the facet at its middle)
      const back: Vec3[] = [P(-aw / 2, ay0, -0.16), P(aw / 2, ay0, -0.16), ...arch.map((p) => [p[0] - ox * 0.16, p[1], p[2] - oz * 0.16] as Vec3)];
      sink.polygon('dark', [back[0], back[1], ...back.slice(2)], { decor: true });
      for (let i = 0; i < 6; i++) bar(sink, 'stone', [arch[i][0] + ox * 0.05, arch[i][1] + 0.1, arch[i][2] + oz * 0.05], [arch[i + 1][0] + ox * 0.05, arch[i + 1][1] + 0.1, arch[i + 1][2] + oz * 0.05], 0.2, { decor: true });
      // the iron balcony rail across the upper opening
      if (!mobile) bar(sink, 'structureMetal', P(-aw / 2, ay0 + 0.95, 0.15), P(aw / 2, ay0 + 0.95, 0.15), 0.04, { colour: IRON, decor: true, fine: true });
    }
    // the pilasters at the facet's corners and the stone bands at the floor and the eaves, the plinth
    sink.quad('stone', P(-half, foot, 0.12), P(half, foot, 0.12), P(half, 0.9, 0.12), P(-half, 0.9, 0.12), { decor: true, shade: 0.9 });
    for (const [y0, y1] of [[F1 - 0.15, F1 + 0.15], [H - 0.35, H]] as const) sink.quad('stone', P(-half, y0, 0.1), P(half, y0, 0.1), P(half, y1, 0.1), P(-half, y1, 0.1), { decor: true });
    sink.quad('stone', P(-half, 0.9, 0.08), P(-half + 0.45, 0.9, 0.08), P(-half + 0.45, H - 0.35, 0.08), P(-half, H - 0.35, 0.08), { decor: true, shade: 0.95 });
    void front;
  }
  // ---- the roof ring over the gallery: tiles sloping in from the eaves to the gallery's columns, the cornice
  const Rg = Ro - 4.2, yr = H + 1.6, yi = H + 0.2;
  for (let k = 0; k < n; k++) {
    const a = at(k - 1 + n, Ro + 0.7, H + 0.05), b = at(k, Ro + 0.7, H + 0.05), c = at(k, Rg - 0.4, yi), d = at(k - 1 + n, Rg - 0.4, yi);
    const ra = at(k - 1 + n, Ro - 1.2, yr), rb = at(k, Ro - 1.2, yr);
    sink.quad('roof', a, b, rb, ra, {});
    sink.quad('roof', ra, rb, c, d, {});
    sink.quad('roof', b, a, at(k - 1 + n, Ro, H), at(k, Ro, H), { decor: true, shade: 0.6 });
  }
  // ---- inside: the stands from the gallery's floor down to the barrera, in tiers of stone
  const tiers = 8, yTop = F1 + 0.8, rTop = Rg - 0.6, rBot = Ra + 1.6, yBot = 1.5;
  for (let t = 0; t < tiers; t++) {
    const r0 = rTop - (rTop - rBot) * t / tiers, r1 = rTop - (rTop - rBot) * (t + 1) / tiers;
    const y = yTop - (yTop - yBot) * t / tiers, y1 = yTop - (yTop - yBot) * (t + 1) / tiers;
    revolve(sink, 'stone', 0, 0, [[r0, y], [r1, y], [r1, y1], [r1 - 0.01, y1]], n, { shade: 0.92 - 0.02 * (t % 2) }, Math.PI / n);
  }
  // the gallery's floor behind the tiers, its back wall (the outer wall's inside) and the Tuscan columns on the gallery
  revolve(sink, 'stone', 0, 0, [[Ro - 0.3, yTop], [rTop, yTop]], n, { shade: 0.85 }, Math.PI / n);
  revolve(sink, 'plaster3', 0, 0, [[Ro - 0.3, yTop], [Ro - 0.35, yTop], [Ro - 0.35, H], [Ro - 0.3, H]], n, { shade: 0.8 }, Math.PI / n);
  // (the stands' solid under the tiers, from the ground to the gallery: the ring's mass)
  revolve(sink, 'stone', 0, 0, [[rBot + 0.3, foot], [rBot, foot], [rBot, yBot], [rBot + 0.01, yBot]], n, { shade: 0.7 }, Math.PI / n);
  for (let k = 0; k < n * 2; k++) {
    const a = (k / (n * 2)) * Math.PI * 2;
    const x = Math.sin(a) * Rg, z = Math.cos(a) * Rg;
    revolve(sink, 'stone', x, z, columnProfile(0.2, yi - yTop - 0.05, yTop), mobile ? 6 : 8, { decor: true });
  }
  // the arena's sand, the barrera (its red boards on posts) and the burladeros' screens, the callejón behind it
  revolve(sink, 'structureMetal', 0, 0, [[Ra, 0.05], [0.001, 0.05]], mobile ? 24 : 40, { colour: SAND, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[Ra - 0.01, 0.05], [Ra, 0.05], [Ra, 1.45], [Ra + 0.08, 1.45], [Ra + 0.08, 0.05], [Ra + 0.09, 0.05]], n * 2, { colour: BARRERA, decor: true });
  revolve(sink, 'structureMetal', 0, 0, [[Ra + 0.19, 1.4], [Ra + 0.2, 1.4], [Ra + 0.2, 1.55], [Ra - 0.05, 1.55]], n * 2, { colour: shade(BARRERA, 0.7), decor: true });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    sink.placed(a, Math.sin(a) * (Ra - 0.8), 0, Math.cos(a) * (Ra - 0.8), () => sink.span('structureMetal', -0.9, 0.05, -0.05, 0.9, 1.6, 0.05, { colour: BARRERA, decor: true }));
  }
  revolve(sink, 'stone', 0, 0, [[Ra + 0.1, 0.03], [rBot, 0.03]], n, { decor: true, shade: 0.75 }, Math.PI / n);
  // ---- the Puerta del Príncipe: a stone portal proud of the front facet — paired Tuscan columns either side of the
  // arched gate, the entablature, the balcony over it with its iron rail and the pediment with the royal arms' boss
  const pz = Ro * Math.cos(Math.PI / n), pw = 2 * Ro * Math.sin(Math.PI / n);
  sink.span('stone', -pw / 2 + 0.2, foot, pz, pw / 2 - 0.2, H, pz + 0.5, { shade: 0.95 });
  const gw = 3.0, gh = 4.6;
  sink.span('dark', -gw / 2, 0, pz + 0.49, gw / 2, gh, pz + 0.52, { decor: true });
  for (let i = 0; i <= 8; i++) {
    const t0 = Math.PI * i / 8, t1 = Math.PI * (i + 1) / 8;
    if (i === 8) break;
    sink.quad('dark', [Math.cos(t1) * gw / 2, gh + Math.sin(t1) * gw / 2, pz + 0.52], [Math.cos(t0) * gw / 2, gh + Math.sin(t0) * gw / 2, pz + 0.52], [Math.cos(t0) * gw / 2, gh, pz + 0.52], [Math.cos(t1) * gw / 2, gh, pz + 0.52], { decor: true });
    bar(sink, 'stone', [Math.cos(t0) * (gw / 2 + 0.15), gh + Math.sin(t0) * (gw / 2 + 0.15), pz + 0.6], [Math.cos(t1) * (gw / 2 + 0.15), gh + Math.sin(t1) * (gw / 2 + 0.15), pz + 0.6], 0.3, { decor: true, shade: 0.9 });
  }
  sink.span('structureWood', -gw / 2 + 0.05, 0, pz + 0.46, gw / 2 - 0.05, gh - 0.05, pz + 0.5, { colour: DOOR, decor: true });
  for (const s of [-1, 1]) for (const dx of [2.2, 3.0]) {
    revolve(sink, 'stone', s * dx, pz + 1.1, columnProfile(0.3, F1 - 0.2, 0.2), mobile ? 8 : 12, {});
    sink.span('stone', s * dx - 0.45, -0.3, pz + 0.65, s * dx + 0.45, 0.2, pz + 1.55, {});
  }
  sink.span('stone', -3.6, F1 - 0.1, pz + 0.5, 3.6, F1 + 0.6, pz + 1.7, {});
  // the balcony over the gate and its door, the pediment over the upper storey
  sink.span('dark', -0.8, F1 + 0.65, pz + 0.49, 0.8, F1 + 3.2, pz + 0.52, { decor: true });
  if (!mobile) for (let x = -3.3; x <= 3.31; x += 0.22) bar(sink, 'structureMetal', [x, F1 + 0.6, pz + 1.6], [x, F1 + 1.6, pz + 1.6], 0.03, { colour: IRON, decor: true, fine: true });
  bar(sink, 'structureMetal', [-3.4, F1 + 1.6, pz + 1.6], [3.4, F1 + 1.6, pz + 1.6], 0.05, { colour: IRON, decor: true });
  const py = H + 0.1;
  sink.polygon('stone', [[-3.4, py, pz + 0.7], [3.4, py, pz + 0.7], [0, py + 1.7, pz + 0.7]], {});
  sink.span('stone', -3.6, py - 0.4, pz + 0.5, 3.6, py, pz + 0.9, {});
  sink.cylinder('stone', [0, py + 0.6, pz + 0.7], 'z', 0.12, 0.42, 12, { decor: true });
  // the bull's-head shield, the lamps either side of the gate
  if (!mobile) for (const s of [-1, 1]) {
    bar(sink, 'structureMetal', [s * 1.8, gh - 0.4, pz + 0.5], [s * 1.8, gh - 0.4, pz + 1.2], 0.04, { colour: IRON, decor: true, fine: true });
    sink.span('structureMetal', s * 1.8 - 0.18, gh - 0.9, pz + 1.05, s * 1.8 + 0.18, gh - 0.35, pz + 1.4, { colour: IRON, decor: true, fine: true });
  }
  void v;
  return { parts: sink.finish(), tints: { plaster3: [1.04, 1.03, 1.0] } };
};
