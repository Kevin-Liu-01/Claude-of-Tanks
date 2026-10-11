// src/world/landmarks/marketcross.ts — the English market cross (the buildings lane, 2026-10-11, round 4: a landmark per
// map, Amberford). The covered buttercross of a market town's square, as Malmesbury's (c. 1490) and Chichester's stand:
// an octagon of stone on three steps, its eight piers carrying pointed arches open to every side round a central
// pillar, the parapet over the arches with its pierced band and a pinnacle on every pier, the octagonal roof of stone
// slates rising inside the parapet to a lantern, and the cross on the lantern's spire. The market folk sat on the
// bench round the central pillar and the steps; the arches kept off the rain.
//
// All of the region's stone (the map kit's ashlar under its weathering), the roof in the kit's roof bucket; every
// member meets the next (kitConnectivity): the arch heads spring from the piers and meet at their crowns, the
// pinnacles stand on the parapet, the cross on the spire.
import { PartSink, type EmitOptions, type Vec3 } from '../maps/regional/geometry.ts';
import { cross, revolve } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

export const marketCross: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = Math.max(2.6, Number(ctx.params.radius)), k = R / 3.4;
  const base = -0.6 - ctx.groundFall, n = 8, phase = Math.PI / 8;
  // the corners of an octagon of "radius" r (to its corners), its first corner at -phase (ringY's convention)
  const corner = (r: number, i: number): [number, number] => { const a = -((i / n) * Math.PI * 2 + phase); return [Math.cos(a) * r, Math.sin(a) * r]; };
  // ---- the steps: three octagonal courses
  const steps = 3, rise = 0.22, tread = 0.42 * k;
  for (let s = 0; s < steps; s++) {
    const r = R + (steps - s) * tread, y0 = s === 0 ? base : s * rise, y1 = (s + 1) * rise;
    revolve(sink, 'stone', 0, 0, [[r, y0], [r, y1], [0, y1]], n, {}, phase);
  }
  const floor = steps * rise;
  // ---- the central pillar and the bench round its foot
  revolve(sink, 'stone', 0, 0, [[0.75 * k, floor], [0.75 * k, floor + 0.45], [0.42 * k, floor + 0.45], [0.42 * k, floor + 3.9 * k], [0, floor + 3.9 * k]], n, {}, phase);
  // ---- the piers at the octagon's corners, the arches between them
  const pierR = R - 0.3 * k, pw = 0.28 * k, archTop = floor + 3.4 * k, spring = floor + 2.3 * k;
  const piers: Array<[number, number]> = Array.from({ length: n }, (_, i) => corner(pierR, i));
  for (const [x, z] of piers) {
    sink.span('stone', x - pw, floor, z - pw, x + pw, archTop + 0.2, z + pw);
  }
  // the arch heads: a pointed (two-centred) arch between each pair of piers, laid as short voussoir lengths from each
  // pier's inner face to the crown (dressing), and the spandrel band over them to the parapet's string course
  const head: EmitOptions = { decor: true };
  for (let i = 0; i < n; i++) {
    const [ax, az] = piers[i], [bx, bz] = piers[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const half = len / 2 - pw, out: Vec3 = [uz, 0, -ux];
    // a pointed arch: y rises from the springing at each pier to a point at the crown (the curve steep at the piers,
    // its two halves meeting at an angle over the middle)
    const crown = archTop - 0.15, pts: Vec3[] = [];
    for (let j = 0; j <= 8; j++) {
      const u = -half + (2 * half * j) / 8, y = spring + (crown - spring) * Math.pow(1 - Math.abs(u) / half, 0.6);
      pts.push([ax + ux * (pw + half + u), y, az + uz * (pw + half + u)]);
    }
    for (let j = 0; j + 1 < pts.length; j++) sink.member('stone', pts[j], pts[j + 1], 0.22 * k, 0.3, out, { ...head, exposed: true }, 0.15);
    // the spandrel panel over the arch, up to the string course
    sink.span('stone', Math.min(ax, bx) - 0.001, archTop - 0.05, Math.min(az, bz) - 0.001, Math.max(ax, bx) + 0.001, archTop + 0.2, Math.max(az, bz) + 0.001, { decor: true });
  }
  // ---- the entablature ring on the piers, the parapet and its pierced band, the pinnacles on the piers
  revolve(sink, 'stone', 0, 0, [[R, archTop + 0.2], [R, archTop + 0.65], [R - 0.55 * k, archTop + 0.65]], n, {}, phase);
  revolve(sink, 'stone', 0, 0, [[R + 0.08, archTop + 0.65], [R + 0.08, archTop + 0.8], [R - 0.02, archTop + 0.8]], n, { decor: true }, phase);
  const parapetTop = archTop + 1.55 * k;
  revolve(sink, 'stone', 0, 0, [[R - 0.05, archTop + 0.8], [R - 0.05, parapetTop], [R - 0.3, parapetTop], [R - 0.3, archTop + 0.8]], n, {}, phase);
  for (let i = 0; i < n; i++) {
    const [px, pz] = corner(R - 0.05, i);
    // a crocketed pinnacle: its shaft and its spirelet
    revolve(sink, 'stone', px, pz, [[0.2 * k, parapetTop - 0.02], [0.2 * k, parapetTop + 0.55 * k], [0.24 * k, parapetTop + 0.55 * k], [0.02, parapetTop + 1.6 * k]], 4,
      { decor: true }, Math.PI / 4);
  }
  // ---- the roof inside the parapet, the lantern and its spire, the cross
  const roofTop = parapetTop + 2.3 * k;
  revolve(sink, 'roof', 0, 0, [[R - 0.28, archTop + 0.75], [0.62 * k, roofTop]], n, {}, phase);
  const lanternTop = roofTop + 1.3 * k;
  for (let i = 0; i < n; i++) {
    const [x, z] = corner(0.55 * k, i);
    sink.span('stone', x - 0.07, roofTop - 0.25, z - 0.07, x + 0.07, lanternTop, z + 0.07, { decor: true });
  }
  revolve(sink, 'stone', 0, 0, [[0.6 * k, roofTop - 0.3], [0.6 * k, roofTop + 0.05], [0.55 * k, roofTop + 0.05]], n, {}, phase);
  revolve(sink, 'stone', 0, 0, [[0.68 * k, lanternTop], [0.68 * k, lanternTop + 0.18], [0.04, lanternTop + 1.5 * k]], n, { decor: true }, phase);
  cross(sink, 'stone', 0, lanternTop + 1.45 * k, 0, 0.75, 'latin', [0.62, 0.6, 0.56]);
  return { parts: sink.finish() };
};
