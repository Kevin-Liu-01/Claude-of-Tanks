// src/world/landmarks/temples.ts — temples (the landmarks lane, 2026-10-05): the Bengal terracotta aat-chala temple of
// the Jamuna's villages (Jade River Delta) — a square brick cella on a plinth under a curved four-sided roof (the
// char-chala, its eaves drooping to the corners like a thatched hut's), a smaller cella on top under its own, eight
// slopes in all (aat-chala), the kalasa finial, a triple-arched front faced with terracotta plaques.
//
// The frame: the front (+z) is the arched façade and the steps; y = 0 the lowest ground under the plinth.
import { PartSink, rgb, shade, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { archedBody, bar, revolve, type ArchHole, type FaceName } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const TERRACOTTA = rgb(0xa45a3a), PLAQUE: readonly ReturnType<typeof rgb>[] = [0xa65c3c, 0x9a5236, 0xb06a46, 0x8e4a30].map(rgb);
const DARK = rgb(0x1f1a17), FINIAL = rgb(0x7a5a3a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/**
 * A char-chala roof: four curved slopes from an eave square `h0` (half side, its eave at `y0` mid-side, `droop` lower at
 * the corners — the Bengal roof's curve) up to a square `h1` at `y1` (or a point when h1 is 0), bulging outward by
 * `bulge` at mid-slope along the radial direction (so the hips close), and a fascia under the eave curve.
 */
function charChala(sink: PartSink, bucket: RegionalBucket, h0: number, y0: number, droop: number, h1: number, y1: number, bulge: number,
  opts: { decor?: boolean; fascia?: RegionalBucket; rib?: RegionalBucket; fasciaH?: number; tintAt?: (p: Vec3) => Rgb } = {}): void {
  const fasciaBucket = opts.fascia ?? bucket, ribBucket = opts.rib ?? bucket, FH = opts.fasciaH ?? 0.22;
  const slope = { decor: opts.decor, ...(opts.tintAt ? { tintAt: opts.tintAt } : {}) };
  const NU = 10, NT = 6;
  const point = (k: number, u: number, t: number): Vec3 => {
    // the front face's point (k = 0), turned a quarter per face about y
    const lower: Vec3 = [u * h0, y0 - droop * u * u, h0], upper: Vec3 = [u * h1, y1, h1];
    const x = lower[0] + (upper[0] - lower[0]) * t;
    let y = lower[1] + (upper[1] - lower[1]) * t, z = lower[2] + (upper[2] - lower[2]) * t;
    // (gauntlet wave 158: "rounded, dome-like roof tiers"): each slope swells out along its own normal and the swell
    // dies to nothing at the hips, so the four faces meet in crisp curved ridges — a hut's thatch, not a dome
    const b = bulge * Math.sin(Math.PI * t) * (1 - u * u);
    z += b; y += b * 0.2;
    // (wave 203: "the temple should read aat-chala curved hips"): the hips themselves bow out — every point pushed out
    // from the axis by the same convex swell, so a hip's two faces still meet on it and the ridge runs in a curve from
    // the drooping eave corner to the top, as a bamboo-framed thatch's does
    const r = Math.hypot(x, z) || 1, hb = bulge * 0.9 * Math.sin(Math.PI * t);
    const xr = x + x / r * hb;
    z += z / r * hb;
    const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    return [xr * c + z * s, y, -xr * s + z * c];
  };
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < NU; i++) for (let j = 0; j < NT; j++) {
      const u0 = -1 + 2 * i / NU, u1 = -1 + 2 * (i + 1) / NU, t0 = j / NT, t1 = (j + 1) / NT;
      const a = point(k, u0, t0), b = point(k, u1, t0), c = point(k, u1, t1), d = point(k, u0, t1);
      if (h1 === 0 && j === NT - 1) sink.polygon(bucket, [a, b, c], slope); else sink.quad(bucket, a, b, c, d, slope);
    }
    // the fascia: a band under the eave curve, its face outward and its soffit back to the wall head
    for (let i = 0; i < NU; i++) {
      const u0 = -1 + 2 * i / NU, u1 = -1 + 2 * (i + 1) / NU;
      const a = point(k, u0, 0), b = point(k, u1, 0);
      const a2: Vec3 = [a[0], a[1] - FH, a[2]], b2: Vec3 = [b[0], b[1] - FH, b[2]];
      sink.quad(fasciaBucket, a2, b2, b, a, { decor: true });
      // the soffit (seen from below) inward to the wall head
      const inA: Vec3 = [a[0] * 0.86, a[1] - FH, a[2] * 0.86], inB: Vec3 = [b[0] * 0.86, b[1] - FH, b[2] * 0.86];
      sink.quad(fasciaBucket, inA, inB, b2, a2, { decor: true, shade: 0.6 });
    }
    // the hip's moulded rib, riding its curve from the eave corner up (a terracotta roll a hand proud of the slopes)
    for (let j = 0; j < NT; j++) {
      const p0 = point(k, 1, j / NT), p1 = point(k, 1, (j + 1) / NT);
      bar(sink, ribBucket, [p0[0], p0[1] + 0.07, p0[2]], [p1[0], p1[1] + 0.07, p1[2]], 0.24, { decor: true });
    }
  }
}

/**
 * The aat-chala temple (plan.ts bengalTemple): see the module's note.
 */
export const bengalTemple: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const S = Math.max(5, Number(ctx.params.side)), base = -0.6 - ctx.groundFall, plinth = 1.0;
  const wallH = Math.max(3.4, S * 0.55), y0 = plinth + wallH;
  const wall: RegionalBucket = 'stone';
  // the plinth and its steps up to the front
  sink.span(wall, -S / 2 - 0.9, base, -S / 2 - 0.9, S / 2 + 0.9, plinth, S / 2 + 0.9);
  for (let k = 0; k < 4; k++) sink.span(wall, -1.6, plinth - 0.25 * (k + 1), S / 2 + 0.9 + k * 0.32, 1.6, plinth - 0.25 * k, S / 2 + 0.9 + (k + 1) * 0.32, { decor: true });
  // the bangla cornice (gauntlet wave 158: "a straight cornice"): the walls' top follows the eave's curve, highest at
  // the middle of each face and drooping to its corners, the fascia's underside its line
  const h0 = S / 2 + 0.55, droop = Math.min(0.95, S * 0.11);
  const cornice = (u: number) => y0 + 0.2 - droop * (u / h0) ** 2 - 0.22;
  const yLow = cornice(S / 2);
  // the cella: three arches across the front (the middle the door), one blind arch on each other face
  const aw = Math.min(1.5, S * 0.18), spring = Math.min(y0 - 1.1, yLow - aw * 0.74 - 0.12);
  const holes: Partial<Record<FaceName, ArchHole[]>> = {
    front: [-S * 0.28, 0, S * 0.28].map((u) => ({ u, w: aw, y0: plinth, spring, form: 'pointed' as const })),
    back: [{ u: 0, w: aw, y0: plinth + 0.6, spring, form: 'pointed' as const }],
    left: [{ u: 0, w: aw, y0: plinth + 0.6, spring, form: 'pointed' as const }],
    right: [{ u: 0, w: aw, y0: plinth + 0.6, spring, form: 'pointed' as const }],
  };
  // (round 4, gauntlet wave 244: the side arches "flat unlit blue-grey panels" — the reveals' dark backings catching the
  // sky): the arches run through the walls (no backing) into real spaces — the front's three into a porch 1.6 m deep
  // across the sanctum's face, each other face's into a chamber with a deity's terracotta panel on its back wall —
  // their surfaces in the terracotta under the occlusion of the space (the kit weathering's shade)
  const mossFoot = (p: Vec3): Rgb => {
    const t = Math.max(0, Math.min(1, (p[1] - plinth) / 1.4));
    return [0.82 + 0.18 * t, 0.9 + 0.1 * t, 0.74 + 0.26 * t];
  };
  const faces = archedBody(sink, wall, 0, 0, S, S, plinth, yLow, holes, 0.4, { through: true, tintAt: mossFoot });
  // each face's curved head over the walls' level top, up to the cornice's line (a convex panel: fanned from a corner)
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = faces[name], pts: Vec3[] = [];
    const at = (u: number, y: number): Vec3 => [f.origin[0] + f.u[0] * u, y, f.origin[2] + f.u[2] * u];
    pts.push(at(-S / 2, yLow), at(S / 2, yLow));
    for (let k = 12; k >= 0; k--) { const u = -S / 2 + S * k / 12; pts.push(at(u, cornice(u))); }
    sink.polygon(wall, pts.slice(0, 2).concat(pts.slice(2)), {});
  }
  const inner = S / 2 - 0.4, apex = spring + aw * 0.74;
  /** A box's inside (a space seen through its openings): the faces looking inward, each its own occlusion. */
  const room = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip: { px?: boolean; nx?: boolean; pz?: boolean; nz?: boolean }) => {
    // (each face wound to look into the space: its normal toward the room's middle)
    const mid: Vec3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const q = (pts: Vec3[], sh: number) => {
      const [a, b, c] = pts, n: Vec3 = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const toMid = n[0] * (mid[0] - a[0]) + n[1] * (mid[1] - a[1]) + n[2] * (mid[2] - a[2]);
      const o = toMid >= 0 ? pts : [...pts].reverse();
      sink.quad(wall, o[0], o[1], o[2], o[3], { decor: true, shade: sh });
    };
    q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.62); // the floor
    q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0.3); // the ceiling
    if (!skip.nz) q([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], 0.4);
    if (!skip.pz) q([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], 0.4);
    if (!skip.nx) q([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], 0.46);
    if (!skip.px) q([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.46);
  };
  // the porch across the front, and the sanctum's door in its back wall
  const zP = S / 2 - 1.6;
  room(-inner + 0.01, inner - 0.01, plinth, apex + 0.2, zP, inner + 0.02, { pz: true });
  sink.span('structureWood', -aw * 0.42, plinth, zP + 0.01, aw * 0.42, spring + aw * 0.3, zP + 0.06, { colour: DARK, decor: true });
  sink.span(wall, -aw * 0.42 - 0.18, plinth, zP + 0.01, -aw * 0.42, spring + aw * 0.42, zP + 0.08, { decor: true, shade: 0.55 });
  sink.span(wall, aw * 0.42, plinth, zP + 0.01, aw * 0.42 + 0.18, spring + aw * 0.42, zP + 0.08, { decor: true, shade: 0.55 });
  sink.span(wall, -aw * 0.42 - 0.18, spring + aw * 0.3, zP + 0.01, aw * 0.42 + 0.18, spring + aw * 0.42, zP + 0.08, { decor: true, shade: 0.55 });
  // the chambers behind the other faces' arches, and their deities in terracotta
  const relief = (cx: number, cy: number, cz: number, nx: number, nz: number, w: number, h: number, i: number) => {
    // a moulded panel: its field and frame, the figure standing out of it (the kit's plaster3: fired clay, not wood)
    const c = PLAQUE[i % PLAQUE.length], tint: Rgb = [c[0] * 1.9, c[1] * 1.9, c[2] * 1.9];
    const box = (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, k: number) => {
      const x0 = cx + nz * u0 + nx * d0, x1 = cx + nz * u1 + nx * d1, z0 = cz - nx * u0 + nz * d0, z1 = cz - nx * u1 + nz * d1;
      sink.span('plaster3', Math.min(x0, x1), cy + y0, Math.min(z0, z1), Math.max(x0, x1), cy + y1, Math.max(z0, z1), { decor: true, tint: [tint[0] * k, tint[1] * k, tint[2] * k] });
    };
    box(-w / 2, w / 2, -h / 2, h / 2, -0.01, 0.025, 1);
    box(-w / 2 + 0.06, w / 2 - 0.06, -h / 2 + 0.06, h / 2 - 0.06, 0.02, 0.04, 0.92);
    box(-w * 0.16, w * 0.16, -h * 0.34, h * 0.22, 0.03, 0.085, 1.08);
    box(-w * 0.1, w * 0.1, h * 0.22, h * 0.36, 0.03, 0.08, 1.08);
  };
  const cw = aw / 2 + 0.3, depth = 1.2;
  // (each inside the body, from the wall's inner face `depth` in; open on the arch's side, its deity on the far wall facing it)
  room(-cw, cw, plinth + 0.6, apex + 0.15, -inner - 0.02, -inner + depth, { nz: true }); // the back chamber
  relief(0, plinth + 0.6 + (apex - plinth - 0.6) / 2, -inner + depth - 0.01, 0, -1, aw * 0.8, (apex - plinth - 0.6) * 0.72, 1);
  for (const sx of [1, -1]) {
    const x0 = sx > 0 ? inner - depth : -inner - 0.02, x1 = sx > 0 ? inner + 0.02 : -inner + depth;
    room(x0, x1, plinth + 0.6, apex + 0.15, -cw, cw, sx > 0 ? { px: true } : { nx: true });
    relief(sx > 0 ? inner - depth + 0.01 : -inner + depth - 0.01, plinth + 0.6 + (apex - plinth - 0.6) / 2, 0, sx, 0, aw * 0.8, (apex - plinth - 0.6) * 0.72, 2 + sx);
  }
  // the terracotta plaques: rows across the front between and over the arches, columns between them — moulded panels
  // in fired clay with their figures standing out (round 4: "wood-grain rectangles" in the old metal paint)
  let n = 0;
  for (let row = 0; row < 3; row++) {
    const y = spring + aw * 0.74 + 0.3 + row * 0.42;
    for (let k = 0; k < 14; k++) {
      const u = -S / 2 + 0.35 + (S - 0.7) * (k + 0.5) / 14;
      if (y + 0.17 > cornice(u) - 0.1) continue;
      relief(u, y, S / 2 + 0.005, 0, 1, (S - 0.7) / 14 * 0.86, 0.36, n++);
    }
  }
  for (const u of [-S * 0.43, -S * 0.14, S * 0.14, S * 0.43]) for (let row = 0; row < 5; row++) {
    relief(u, plinth + 0.5 + row * 0.5, S / 2 + 0.005, 0, 1, 0.34, 0.42, n++);
  }
  // the weather on the brick: lime washed down from the cornice in streaks, soot over the arches' heads
  const streak = (f: (typeof faces)[FaceName], u: number, yTop: number, len: number, w: number, top: Rgb) => {
    const p = (uu: number, y: number): Vec3 => [f.origin[0] + f.u[0] * uu + f.out[0] * 0.006, y, f.origin[2] + f.u[2] * uu + f.out[2] * 0.006];
    const fade = (pt: Vec3): Rgb => { const t = Math.max(0, Math.min(1, (yTop - pt[1]) / len)); return [top[0] + (1 - top[0]) * t, top[1] + (1 - top[1]) * t, top[2] + (1 - top[2]) * t]; };
    sink.quad(wall, p(u - w / 2, yTop - len), p(u + w / 2, yTop - len), p(u + w / 2, yTop), p(u - w / 2, yTop), { decor: true, tintAt: fade });
  };
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = faces[name];
    for (let k = 0; k < 7; k++) {
      const u = -S / 2 + 0.4 + (S - 0.8) * ((k + 0.5) / 7 + (ctx.variant() - 0.5) * 0.08);
      const yTop = cornice(u) - 0.24, len = 0.8 + ctx.variant() * 1.8;
      // (the front's plaque rows keep clear: its streaks run in the joints between them)
      streak(f, u, yTop, len, 0.12 + ctx.variant() * 0.2, ctx.variant() < 0.6 ? [1.45, 1.42, 1.36] : [0.52, 0.5, 0.48]);
    }
    for (const h of holes[name] ?? []) {
      streak(f, h.u, apex + 0.55, 0.5, h.w * 0.7, [0.5, 0.48, 0.46]);
    }
  }
  // the lower char-chala, the upper cella and its roof, the finial
  const h1 = S * 0.27, yRoof1 = y0 + S * 0.32;
  // (round 4: the roofs were "mushroom-cap bulges in the walls' own brick texture"): lime-plastered slopes, weathered
  // green toward their eaves, a gentler swell, crisp terracotta rolls on the hips and the bangla cornice deep in brick
  const roofMoss = (lo: number, hi: number) => (p: Vec3): Rgb => {
    const t = Math.max(0, Math.min(1, (p[1] - lo) / Math.max(0.5, hi - lo)));
    return [0.66 + 0.36 * t, 0.74 + 0.27 * t, 0.6 + 0.36 * t];
  };
  charChala(sink, 'plaster3', h0, y0 + 0.2, droop, h1, yRoof1, S * 0.03,
    { fascia: wall, rib: 'plaster', fasciaH: 0.36, tintAt: roofMoss(y0 + 0.2 - droop, yRoof1) });
  const upperH = Math.max(1.3, S * 0.2), yUp = yRoof1 + upperH;
  sink.span(wall, -h1 + 0.05, yRoof1 - 0.3, -h1 + 0.05, h1 - 0.05, yUp, h1 - 0.05);
  for (const [u, nx, nz] of [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]] as const) {
    void u;
    const x = nx * (h1 - 0.03), z = nz * (h1 - 0.03);
    // (the upper cella's blind openings: the terracotta in its own shadow, not a black void)
    sink.span(wall, x - (nz ? 0.32 : 0.02), yRoof1 + 0.1, z - (nx ? 0.32 : 0.02), x + (nz ? 0.32 : 0.02), yUp - 0.35, z + (nx ? 0.32 : 0.02), { decor: true, shade: 0.45 });
  }
  const yApex = yUp + S * 0.33;
  charChala(sink, 'plaster3', h1 + 0.35, yUp + 0.12, Math.min(0.55, S * 0.07), 0, yApex, S * 0.03,
    { fascia: wall, rib: 'plaster', fasciaH: 0.28, tintAt: roofMoss(yUp + 0.12 - Math.min(0.55, S * 0.07), yApex) });
  revolve(sink, 'structureMetal', 0, 0, [[0.34, yApex - 0.15], [0.42, yApex + 0.12], [0.18, yApex + 0.42], [0.3, yApex + 0.7], [0.12, yApex + 1.0], [0.03, yApex + 1.45]], 10,
    { colour: FINIAL });
  return { parts: sink.finish(), tints: { stone: [TERRACOTTA[0] * 1.55, TERRACOTTA[1] * 1.55, TERRACOTTA[2] * 1.55] } };
};
