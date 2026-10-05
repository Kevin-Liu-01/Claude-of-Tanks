// src/world/maps/regional/hostomel.ts — the airfield kit (Kestrel Airfield: Hostomel, the Antonov company's airport on
// the pine plateau north-west of Kyiv, fought over from 24 February 2022). The cargo hangar under a barrel vault of
// sheet steel springing from low concrete kerb walls, its apron gable one full-height run of sliding door leaves under
// the door girder, the vault torn open by shellfire with its ribs bare across the holes; smaller portal-frame
// maintenance hangars of corrugated sheet with a block workshop lean-to; the control tower, a concrete shaft under a
// glazed cab with raked panes, a catwalk and its masts; low terminal and office blocks of the 1970s and 80s, render and
// concrete bands under flat roofs, the windows in ribbons; the airport fire station with its hose tower; a Rozhnovsky
// water tower; shelled concrete shells. Burnt-out and boarded windows come from the house grammar's wear pass.
import { PartSink, faceBox, facePanel, pick, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, paneBucket, windowUnit, type WindowStyle } from './openings.ts';
import { tvAerial } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** The sheet steel's liveries: the Antonov hangars' grey-blue and grey-green paint, a pale galvanised grey. */
const LIVERY: readonly Rgb[] = [0x8f9ca0, 0x84907f, 0xa9ada6, 0x7b8790].map(rgb);
const DOOR_LIVERY: readonly Rgb[] = [0x6c787c, 0x5f6c63, 0x8b908b, 0x9a8f72].map(rgb);
const RIB = rgb(0x4e5558), RUST = rgb(0x5e4030), TRUSS = rgb(0x3c4144), MULLION = rgb(0x3a3f42);
/** Painted steel doors of the stores and the fire station's red appliance doors. */
const STEEL_DOORS: readonly Rgb[] = [0x5a6a74, 0x6b6f6a, 0x4f5d55].map(rgb);
const FIRE_RED = rgb(0x9a2e24);
/** Aluminium window frames of the terminal and office blocks, the cab's dark mullions. */
const OFFICE_WINDOW: WindowStyle = { frame: rgb(0xb9bcb7), frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: null, sill: { bucket: 'stone', out: 0.06 }, shutters: null };
const STAIR_WINDOW: WindowStyle = { frame: rgb(0xb9bcb7), frameWidth: 0.05, frameOut: 0.03, bars: 'none', surround: null, sill: null, shutters: null };

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** A face's polygon in (u, y): points reversed when they wind clockwise (wallPolygon wants them counter-clockwise). */
function ccw(poly: Array<[number, number]>): Array<[number, number]> {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; }
  return a < 0 ? [...poly].reverse() : poly;
}

/**
 * A barrel vault's section: the circular segment over the span 2 * half rising `rise` above the springing at y0
 * (the outer surface). `at(x)` is its height over x, `arc(x0, x1, n)` points along it.
 */
interface Vault { half: number; rise: number; y0: number; rho: number; cy: number; t0: number }
function vault(half: number, rise: number, y0: number): Vault {
  const rho = (half * half + rise * rise) / (2 * rise);
  return { half, rise, y0, rho, cy: y0 + rise - rho, t0: Math.asin(Math.min(1, half / rho)) };
}
const vaultAt = (v: Vault, x: number, inset = 0): number => v.cy + Math.sqrt(Math.max(0, (v.rho - inset) ** 2 - x * x));
/** n + 1 section points by angle from x0 to x1 (either direction) at radius rho - inset. */
function arc(v: Vault, x0: number, x1: number, n: number, inset = 0): Array<[number, number]> {
  const r = v.rho - inset;
  const a0 = Math.asin(Math.max(-1, Math.min(1, x0 / r))), a1 = Math.asin(Math.max(-1, Math.min(1, x1 / r)));
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [r * Math.sin(a), v.cy + r * Math.cos(a)] as [number, number]; });
}

/**
 * The vault's shell between z0 and z1 over the section's segments [i0, i1): outer and inner sheet, the cut ends and,
 * on the outermost segments, the springing faces. Each segment is a closed slab (the collision derivation's welded
 * solid); the outer face takes a plane UV that runs over the arch (the sheet's corrugations ride it).
 */
function vaultShell(sink: PartSink, v: Vault, n: number, i0: number, i1: number, z0: number, z1: number, t: number, bucket: RegionalBucket, colour?: Rgb): void {
  const out = arc(v, -v.half, v.half, n);
  // the inner sheet on the same radii as the outer (a slab's edges run square through its thickness)
  const inn = out.map(([x, y]): [number, number] => { const k = (v.rho - t) / v.rho; return [x * k, v.cy + (y - v.cy) * k]; });
  const P = (p: [number, number], z: number): Vec3 => [p[0], p[1], z];
  // arc length from the crown to each section point (the outer surface): the UV's v
  const s = out.map(([x]) => Math.abs(Math.asin(Math.max(-1, Math.min(1, x / v.rho)))) * v.rho);
  const opts = colour ? { colour } : {};
  for (let i = i0; i < i1; i++) {
    const a = out[i], b = out[i + 1], ai = inn[i], bi = inn[i + 1];
    // down the arch away from the crown: the side of the pair farther from x = 0
    const far = Math.abs(b[0]) > Math.abs(a[0]) ? b : a, near = far === b ? a : b, sNear = far === b ? s[i] : s[i + 1];
    const len = Math.hypot(far[0] - near[0], far[1] - near[1]) || 1;
    const down: Vec3 = [(far[0] - near[0]) / len, (far[1] - near[1]) / len, 0];
    const uv = { kind: 'plane' as const, origin: [near[0] - down[0] * sNear, near[1] - down[1] * sNear, 0] as Vec3, u: [0, 0, 1] as Vec3, v: down };
    // outer face (normal out of the arch), inner face (toward its axis), the two cut ends (+z, -z)
    sink.quad(bucket, P(a, z0), P(a, z1), P(b, z1), P(b, z0), { ...opts, uv });
    sink.quad(bucket, P(ai, z1), P(ai, z0), P(bi, z0), P(bi, z1), { ...opts, uv, shade: 0.6 });
    sink.quad(bucket, P(a, z1), P(ai, z1), P(bi, z1), P(b, z1), opts);
    sink.quad(bucket, P(a, z0), P(b, z0), P(bi, z0), P(ai, z0), opts);
    // the segment's sides where the shell stops (a hole's edge, the springing)
    if (i === i0) sink.quad(bucket, P(a, z1), P(a, z0), P(ai, z0), P(ai, z1), opts);
    if (i === i1 - 1) sink.quad(bucket, P(b, z0), P(b, z1), P(bi, z1), P(bi, z0), opts);
  }
}

/** Arch ribs over the vault at z (standing seams of the sheet; one member per section segment). */
function vaultRib(sink: PartSink, v: Vault, n: number, i0: number, i1: number, z: number, colour: Rgb, exposed = false, inset = -0.02): void {
  const pts = arc(v, -v.half, v.half, n, inset);
  for (let i = i0; i < i1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const mx = (ax + bx) / 2, my = (ay + by) / 2 - v.cy, l = Math.hypot(mx, my) || 1;
    sink.member('structureMetal', [ax, ay, z], [bx, by, z], exposed ? 0.16 : 0.1, exposed ? 0.28 : 0.07, [mx / l, my / l, 0], { colour, decor: true, ...(exposed ? { exposed: true } : {}) }, exposed ? 0 : 0.02);
  }
}

/**
 * The cargo hangar: a barrel vault of sheet steel on low concrete kerb walls, the span across the plot's width and the
 * apron gable (+z) one run of full-height sliding leaves on their tracks under a deep door girder, concrete door
 * pockets either side, the back gable clad in sheet with a clerestory band and a personnel door. Shellfire has torn
 * the vault: one or two holes with the inner trusses bare across them, sheet flaps hanging into the dark, a door leaf
 * gone from its track.
 */
const cargoHangar = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  // the vault's springing kerbs 0.5 m in from the plot sides, the door tracks and girder 1.1 m in front of the body
  const W = Math.max(18, Math.min(60, ctx.info.w - 1.0)), D = Math.max(16, Math.min(80, ctx.info.d - 1.9));
  const zb = -D / 2 - 0.4, zf = D / 2 - 0.4; // the body's back and front planes (shifted back for the door tracks)
  const hk = 2.2 + rng() * 0.8, rise = Math.min(18, W * (0.34 + rng() * 0.06));
  // the section's segments are structure (collision): the same on every tier
  const v = vault(W / 2, rise, hk), n = Math.max(14, Math.min(22, Math.round(W / 2.2)));
  const livery = pick(rng, LIVERY), doorLivery = pick(rng, DOOR_LIVERY);
  const t = 0.24;
  // the kerb walls the vault springs from, and their buttresses under the ribs
  for (const [x0, x1] of [[-W / 2, -W / 2 + 0.45], [W / 2 - 0.45, W / 2]]) sink.span('stone', x0, -0.4, zb, x1, hk, zf);
  const bay = mobile ? 7.2 : 4.8;
  for (let z = zb + bay / 2; z < zf; z += bay) for (const side of [-1, 1]) {
    sink.span('stone', side > 0 ? W / 2 : -W / 2 - 0.35, -0.4, z - 0.3, side > 0 ? W / 2 + 0.35 : -W / 2, hk + 0.2, z + 0.3, { decor: true });
  }
  // the shell, with the holes the war tore in it (segments [i0, i1) open between za and zb)
  const holes: Array<{ i0: number; i1: number; za: number; zb: number }> = [];
  if (rng() < 0.8) {
    const count = rng() < 0.45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const len = Math.max(2, Math.round(n * (0.14 + rng() * 0.12)));
      const i0 = Math.max(1, Math.min(n - len - 1, Math.floor(n * (0.15 + rng() * 0.6))));
      const span = Math.min(D * 0.4, 5 + rng() * 9);
      const zc = zb + 2 + span / 2 + rng() * Math.max(0, D - span - 4);
      const h = { i0, i1: i0 + len, za: zc - span / 2, zb: zc + span / 2 };
      if (!holes.some((o) => h.i0 < o.i1 && o.i0 < h.i1 && h.za < o.zb && o.za < h.zb)) holes.push(h);
    }
  }
  const zOver = 0.35; // the vault overhangs the gables
  // each segment's runs of sheet along z (between the holes over it); consecutive segments with the same runs are one
  // slab, so no side faces stand inside the shell
  const runs = Array.from({ length: n }, (_, i) => {
    const out: Array<[number, number]> = [];
    let z = zb - zOver;
    for (const h of holes.filter((o) => i >= o.i0 && i < o.i1).sort((p, q) => p.za - q.za)) {
      if (h.za > z + 0.05) out.push([z, h.za]);
      z = Math.max(z, h.zb);
    }
    if (zf + zOver > z + 0.05) out.push([z, zf + zOver]);
    return out;
  });
  for (let i = 0; i < n;) {
    let j = i + 1;
    while (j < n && JSON.stringify(runs[j]) === JSON.stringify(runs[i])) j++;
    for (const [za, zz] of runs[i]) vaultShell(sink, v, n, i, j, za, zz, t, 'roof');
    i = j;
  }
  // the standing ribs every bay, and the trusses bare across each hole
  for (let z = zb + bay / 2; z < zf; z += bay) {
    const inHole = holes.filter((h) => z > h.za && z < h.zb);
    if (!inHole.length) { vaultRib(sink, v, n, 0, n, z, RIB); continue; }
    // the sheet's ribs stop at the hole's edges; the truss below shows through
    let i = 0;
    for (const h of inHole.sort((p, q) => p.i0 - q.i0)) { if (h.i0 > i) vaultRib(sink, v, n, i, h.i0, z, RIB); i = Math.max(i, h.i1); }
    if (i < n) vaultRib(sink, v, n, i, n, z, RIB);
  }
  for (const h of holes) {
    let k = 0;
    for (let z = h.za + 0.8; z < h.zb - 0.4; z += 2.4, k++) vaultRib(sink, v, n, Math.max(0, h.i0 - 1), Math.min(n, h.i1 + 1), z, k % 2 ? RUST : TRUSS, true, t + 0.3);
    // purlins along the hole and flaps of sheet bent down into it
    const mid = arc(v, -v.half, v.half, n, t + 0.18);
    for (let i = h.i0; i <= h.i1; i += 2) sink.member('structureMetal', [mid[i][0], mid[i][1], h.za], [mid[i][0], mid[i][1], h.zb], 0.12, 0.12, [0, 1, 0], { colour: TRUSS, decor: true, exposed: true }, 0);
    if (!mobile) {
      // dressing: its draws come from the look stream, so a phone's build keeps the desktop's geometry after it
      const look = ctx.variant, edge = arc(v, -v.half, v.half, n);
      for (let k = 0; k < 4; k++) {
        const i = h.i0 + Math.floor(look() * (h.i1 - h.i0)), z = look() < 0.5 ? h.za : h.zb, dir = z === h.za ? 1 : -1;
        const [x0, y0] = edge[i], [x1, y1] = edge[i + 1], drop = 1.2 + look() * 1.6;
        // one face, the sheet's outside: it turns from the sky toward the hole's far side as the flap droops
        const flap: [Vec3, Vec3, Vec3, Vec3] = [[x1, y1, z], [x0, y0, z], [x0 * 0.97, y0 - drop * 0.8, z + dir * drop * 0.4], [x1 * 0.97, y1 - drop, z + dir * drop * 0.5]];
        if (dir < 0) flap.reverse();
        sink.quad('roof', ...flap, { decor: true });
      }
    }
  }
  // the crown's ridge vent, a dark monitor between the holes
  for (let z = zb + 3; z < zf - 3; z += 6) {
    if (holes.some((h) => z > h.za - 1 && z < h.zb + 1 && h.i0 <= n / 2 && h.i1 > n / 2)) continue;
    sink.span('dark', -0.6, v.y0 + v.rise - 0.05, z - 1.4, 0.6, v.y0 + v.rise + 0.45, z + 1.4, { decor: true });
  }
  // the back gable: one sheet wall under the arch, a clerestory band of translucent panels, a personnel door
  const back: Face = { origin: [0, 0, zb], u: [-1, 0, 0], out: [0, 0, -1], width: W };
  const arch = arc(v, W / 2, -W / 2, n, t * 0.5);
  wallPolygon(sink, 'structureMetal', back, ccw([[-W / 2, 0], [W / 2, 0], ...arch.map(([x, y]): [number, number] => [x, y])]), 0.3, { colour: livery });
  sink.span('stone', -W / 2, -0.4, zb, W / 2, 1.0, zb + 0.4);
  const clerestory = hk + rise * 0.55;
  for (let u = -W / 2 + 2; u < W / 2 - 2; u += 2.6) {
    if (vaultAt(v, Math.abs(u) + 1.2, t) < clerestory + 1.4) continue;
    facePanel(sink, 'glass', back, u, clerestory + 0.6, 0.02, 2.2, 1.0, { decor: true });
  }
  doorUnit(sink, back, W * 0.3, 0, 1.1, 2.3, { leaf: pick(rng, STEEL_DOORS), frame: { bucket: 'structureMetal', width: 0.1, out: 0.06, colour: RIB }, steps: null, leafKind: 'plank' }, 0);
  // the apron gable: door pockets, the girder over the opening, the sheet gable above it
  const front: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const pocket = Math.max(2.2, Math.min(4.5, W * 0.1)), Wd = W - 2 * pocket;
  const girder = Math.max(1.4, Math.min(3.0, W * 0.07));
  const Hd = vaultAt(v, Wd / 2 + 0.6, t) - girder - 0.3;
  const archF = (x0: number, x1: number) => arc(v, x0, x1, Math.max(2, Math.round(n * Math.abs(x1 - x0) / W)), t * 0.5);
  for (const side of [-1, 1]) {
    const xo = side * W / 2, xi = side * Wd / 2;
    const poly: Array<[number, number]> = [[xo, -0.4], [xi, -0.4], ...archF(xi, xo)];
    wallPolygon(sink, 'stone', front, ccw(poly), 0.45);
  }
  wallPolygon(sink, 'structureMetal', front, ccw([[-Wd / 2, Hd], [Wd / 2, Hd], ...archF(Wd / 2, -Wd / 2)]), 0.3, { colour: livery });
  // the door girder: a deep box beam proud of the gable, bearing on the pockets, its lattice on the face, the track's
  // guide under it
  const gc = shade(livery, 0.82);
  faceBox(sink, 'structureMetal', front, 0, Hd + girder / 2, 0.35, Wd + 1.0, girder, 0.7, { colour: gc });
  faceBox(sink, 'structureMetal', front, 0, Hd - 0.08, 0.95, Wd + 2 * pocket * 0.9, 0.16, 0.3, { colour: RIB, decor: true });
  if (!mobile) {
    const panels = Math.max(4, Math.round(Wd / (girder * 1.4))), pw = (Wd + 1.0) / panels;
    for (let k = 0; k < panels; k++) {
      const u0 = -(Wd + 1.0) / 2 + k * pw, ya = Hd + 0.15, yb = Hd + girder - 0.15;
      const [ua, ub] = k % 2 ? [u0, u0 + pw] : [u0 + pw, u0];
      sink.member('structureMetal', [ua, ya, zf + 0.7], [ub, yb, zf + 0.7], 0.12, 0.06, [0, 0, 1], { colour: shade(gc, 0.7), decor: true }, 0);
      sink.member('structureMetal', [u0, ya, zf + 0.7], [u0, yb, zf + 0.7], 0.14, 0.06, [0, 0, 1], { colour: shade(gc, 0.7), decor: true }, 0);
    }
  }
  // the gable sheet over the girder: its standing seams, and a band of lights along the girder's top
  const gy = Hd + girder;
  for (let u = -Wd / 2 + 1.2; u < Wd / 2; u += 2.4) {
    const top = vaultAt(v, Math.abs(u), t) - 0.3;
    if (top < gy + 0.6) continue;
    if (!mobile) faceBox(sink, 'structureMetal', front, u, (gy + top) / 2, 0.03, 0.1, top - gy, 0.06, { colour: shade(livery, 0.8), decor: true });
    if (top > gy + 2.4 && Math.abs(u) + 1.2 < Wd / 2) facePanel(sink, 'glass', front, u + 1.2, gy + 1.1, 0.02, 1.9, 1.2, { decor: true });
  }
  // the sliding leaves on two tracks (alternate leaves on the outer track); one gone, the hangar's dark behind its gap
  const leaves = Math.max(4, Math.round(Wd / 5.5)), lw = Wd / leaves;
  const missing = rng() < 0.55 ? 1 + Math.floor(rng() * (leaves - 2)) : -1;
  // the hangar's dark behind the leaves: a backing across the opening a metre and a half in (it closes the shell for
  // the collision, so a leaf gone from its track opens no way into the hangar)
  if (missing >= 0) sink.span('dark', -Wd / 2, -0.1, zf - 1.6, Wd / 2, Hd, zf - 1.4);
  for (let k = 0; k < leaves; k++) {
    const u = -Wd / 2 + (k + 0.5) * lw, track = k % 2 ? 0.75 : 0.32;
    if (k === missing) continue;
    faceBox(sink, 'structureMetal', front, u, Hd / 2 - 0.05, track, lw + 0.12, Hd + 0.1, 0.22, { colour: doorLivery });
    if (!mobile) {
      for (const f of [0.25, 0.5, 0.75]) faceBox(sink, 'structureMetal', front, u - lw / 2 + lw * f, Hd / 2, track + 0.14, 0.12, Hd - 0.3, 0.06, { colour: shade(doorLivery, 0.78), decor: true });
      faceBox(sink, 'structureMetal', front, u, Hd * 0.42, track + 0.14, lw - 0.2, 0.14, 0.06, { colour: shade(doorLivery, 0.78), decor: true });
      // a row of small lights at two thirds of the leaf
      for (const f of [0.3, 0.7]) facePanel(sink, paneBucket(ctx.variant, 0.2), front, u - lw / 2 + lw * f, Hd * 0.7, track + 0.115, Math.min(1.2, lw * 0.28), 0.8, { decor: true, window: [0, 0, 1] });
    }
  }
  // the bottom track along the apron and the scorched apron edge under a burnt leaf
  faceBox(sink, 'structureMetal', front, 0, 0.03, 0.55, Wd + 2 * pocket, 0.06, 0.9, { colour: TRUSS, decor: true });
  return sink.finish();
};

/**
 * The maintenance hangar: a portal-frame shed of corrugated sheet on a concrete kerb, a low gabled sheet roof, sliding
 * doors across most of the apron gable (one leaf run open), a band of translucent panels under the eaves, a block
 * workshop lean-to down one side where the plot allows it.
 */
const maintenanceHangar = (ctx: RegionalBuildContext): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const annex = ctx.info.w >= 13.5;
  const W = Math.max(8, Math.min(22, ctx.info.w - 0.8 - (annex ? 4.2 : 0))), D = Math.max(10, Math.min(36, ctx.info.d - 1.4));
  const cx = annex ? -2.1 : 0, zb = -D / 2 - 0.3, zf = D / 2 - 0.3, zc = (zb + zf) / 2;
  // a portal frame's shallow pitch (a steeper one read as a barn on the old airfield)
  const He = 5.6 + rng() * 1.4, pitch = 6 + rng() * 3;
  const livery = pick(rng, LIVERY), doorLivery = pick(rng, DOOR_LIVERY);
  sink.placed(0, cx, 0, zc, () => {
    sink.span('stone', -W / 2, -0.4, -D / 2, W / 2, 1.0, D / 2);
    sink.span('structureMetal', -W / 2, 1.0, -D / 2, W / 2, He, D / 2, { colour: livery });
    const roof: RoofSpec = { kind: 'gable', pitchDeg: pitch, eave: 0.4, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    const rg = roofGeometry(W, D, He, roof);
    emitRoof(sink, rg, roof);
    for (const z of [D / 2, -D / 2]) {
      const face: Face = z > 0 ? { origin: [0, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: W } : { origin: [0, 0, z], u: [-1, 0, 0], out: [0, 0, -1], width: W };
      wallPolygon(sink, 'structureMetal', face, ccw([[-W / 2, He], [W / 2, He], [0, rg.ridgeY]]), 0.25, { colour: livery });
    }
    // standing seams of the cladding and the band of translucent panels under the eaves
    const sides: Face[] = [{ origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D }, { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D }];
    for (const f of sides) {
      if (!mobile) for (let u = -D / 2 + 1.5; u < D / 2 - 0.5; u += 3) faceBox(sink, 'structureMetal', f, u, (He + 1.0) / 2, 0.03, 0.1, He - 1.0, 0.06, { colour: shade(livery, 0.8), decor: true });
      for (let u = -D / 2 + 2.2; u < D / 2 - 1.5; u += 4.4) facePanel(sink, 'glass', f, u, He - 0.8, 0.065, 3.0, 0.7, { decor: true });
    }
    // the apron gable's sliding doors, one leaf run across the other, the dark hangar in the gap
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const Wd = W - 1.6, Hd = He - 0.6, lw = Wd / 2;
    const open = 0.3 + rng() * 0.4;
    faceBox(sink, 'dark', front, -Wd / 2 + lw * open / 2, Hd / 2, 0.02, lw * open, Hd, 0.02, { decor: true });
    faceBox(sink, 'structureMetal', front, -Wd / 2 + lw / 2 + lw * open, Hd / 2, 0.3, lw, Hd, 0.18, { colour: doorLivery });
    faceBox(sink, 'structureMetal', front, Wd / 2 - lw / 2, Hd / 2, 0.12, lw, Hd, 0.18, { colour: doorLivery });
    faceBox(sink, 'structureMetal', front, 0, Hd + 0.15, 0.25, Wd + 1.2, 0.3, 0.4, { colour: RIB, decor: true });
    if (!mobile) for (const u of [-Wd / 2 + lw / 2 + lw * open, Wd / 2 - lw / 2]) {
      faceBox(sink, 'structureMetal', front, u, Hd * 0.5, u > 0 ? 0.24 : 0.42, lw - 0.3, 0.12, 0.06, { colour: shade(doorLivery, 0.78), decor: true });
      facePanel(sink, 'glass', front, u, Hd * 0.72, u > 0 ? 0.215 : 0.395, lw * 0.6, 0.6, { decor: true });
    }
    // a personnel door in the back gable
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    doorUnit(sink, back, W * 0.25, 0, 1.0, 2.2, { leaf: pick(rng, STEEL_DOORS), frame: { bucket: 'structureMetal', width: 0.1, out: 0.05, colour: RIB }, steps: null, leafKind: 'plank' }, 0);
    // shrapnel through the sheet: a torn panel on one long wall, dark behind it
    if (rng() < 0.6) {
      const f = sides[rng() < 0.5 ? 0 : 1], u = (rng() - 0.5) * (D - 4), y = 2.2 + rng() * (He - 3.4);
      faceBox(sink, 'dark', f, u, y, 0.005, 1.4 + rng(), 1.0 + rng() * 0.8, 0.01, { decor: true });
      sink.quad('structureMetal', ...([[-0.7, 0.5], [0.7, 0.5], [0.8, -0.6], [-0.5, -0.9]].map(([du, dy]) => [
        f.origin[0] + f.u[0] * (u + du) + f.out[0] * (0.05 - dy * 0.3), y + dy, f.origin[2] + f.u[2] * (u + du) + f.out[2] * (0.05 - dy * 0.3)] as Vec3)) as [Vec3, Vec3, Vec3, Vec3],
        { colour: shade(livery, 0.7), decor: true });
    }
  });
  if (annex) {
    // the workshop lean-to: block walls, a sheet roof falling away from the hangar, windows and a door
    const aw = 3.8, ad = Math.min(D * 0.7, 16);
    sink.placed(0, cx + W / 2 + aw / 2, 0, zc + D * 0.1, () => {
      const openings: Opening[] = [{ face: 'right', storey: 0, kind: 'door', u: -ad / 2 + 1.4, w: 1.0, y0: 0, h: 2.2 }];
      for (const o of windowRhythm('right', 0, ad, { w: 1.4, h: 1.1, sill: 1.1, spacing: 2.6, margin: 1.0, avoid: [[-ad / 2 + 0.6, -ad / 2 + 2.2]] })) openings.push(o);
      const dialect: HouseDialect = {
        window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, OFFICE_WINDOW, rng, 0.3),
        door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: pick(rng, STEEL_DOORS), frame: { bucket: 'stone', width: 0.1, out: 0.04 }, steps: null, leafKind: 'plank' }, y0 + o.y0),
      };
      buildHouse(sink, {
        w: aw, d: ad, plinth: { h: 0.2, out: 0.04, bucket: 'stone' }, storeys: [{ h: 3.2, wall: 'stone' }],
        roof: { kind: 'shed', pitchDeg: 8, eave: 0.3, verge: 0.2, thickness: 0.1, bucket: 'roof' }, gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.12,
      }, dialect);
    });
  }
  return sink.finish();
};

/** The hangars: a cargo hangar under its vault on a plot 20 m wide or more, a maintenance hangar on a smaller one. */
const hangar: RegionalBuilder = (ctx) => (ctx.info.w >= 21 ? cargoHangar(ctx) : maintenanceHangar(ctx));

/**
 * The control tower: a concrete shaft with its stair lights up the apron face, the cab on a slab wider than the shaft,
 * eight raked panes between dark mullions round a dark core, the cab roof's overhang, a catwalk with its rail, the
 * aerial mast and the beacon.
 */
const controlTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const S = Math.max(2.6, Math.min(3.6, Math.min(ctx.info.w, ctx.info.d) - 0.5));
  // the cab and its roof stay within 0.6 m of the plot (the plot guard allows 0.8)
  const Hs = 12.5 + rng() * 3, C = Math.min(S + 1.1, Math.min(ctx.info.w, ctx.info.d) + 0.4), Hc = 3.0;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.4 ? 'stone' : 'plaster';
  sink.span(wall, -S / 2, -0.4, -S / 2, S / 2, Hs, S / 2);
  const front: Face = { origin: [0, 0, S / 2], u: [1, 0, 0], out: [0, 0, 1], width: S };
  doorUnit(sink, front, 0, 0, 1.1, 2.3, { leaf: pick(rng, STEEL_DOORS), frame: { bucket: 'stone', width: 0.14, out: 0.05 }, steps: { bucket: 'stone' }, leafKind: 'glazed' }, 0.15);
  for (let y = 3.6; y < Hs - 2; y += 3.0) windowUnit(sink, front, 0, y, 0.7, 1.2, STAIR_WINDOW, rng, 0.25);
  // the cab: floor slab, the dark core (its collision), raked panes and mullions, the roof slab
  sink.span('stone', -C / 2 - 0.15, Hs, -C / 2 - 0.15, C / 2 + 0.15, Hs + 0.35, C / 2 + 0.15);
  const y0 = Hs + 0.35, y1 = y0 + Hc;
  sink.span('dark', -C / 2 + 0.35, y0, -C / 2 + 0.35, C / 2 - 0.35, y1, C / 2 - 0.35);
  const ring = (r: number, y: number): Vec3[] => Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + k * Math.PI / 4, q = r / Math.cos(Math.PI / 8);
    return [Math.cos(a) * q, y, Math.sin(a) * q] as Vec3;
  });
  const lo = ring(C / 2 - 0.15, y0 + 0.9), hi = ring(C / 2 + 0.2, y1 - 0.1), base = ring(C / 2 - 0.15, y0);
  const broken = rng() < 0.5 ? Math.floor(rng() * 8) : -1;
  for (let k = 0; k < 8; k++) {
    const a = lo[k], b = lo[(k + 1) % 8], c = hi[(k + 1) % 8], d = hi[k];
    // the raked pane (lit at night on its outward face), the sill panel under it
    const e1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], nl = Math.hypot(nx, ny, nz) || 1;
    sink.quad(k === broken ? 'dark' : paneBucket(rng, 0.5), b, a, d, c, { decor: true, window: [nx / nl, ny / nl, nz / nl] });
    sink.quad('plaster', base[(k + 1) % 8], base[k], a, b, { decor: true });
    if (!mobile) sink.member('structureMetal', a, d, 0.1, 0.06, [a[0] / Math.hypot(a[0], a[2]), 0, a[2] / Math.hypot(a[0], a[2])], { colour: MULLION, decor: true, exposed: true }, 0);
  }
  sink.span('stone', -C / 2 - 0.3, y1, -C / 2 - 0.3, C / 2 + 0.3, y1 + 0.35, C / 2 + 0.3);
  // the catwalk under the cab with its rail, the mast and its beacon
  if (!mobile) {
    const r = C / 2 + 0.2;
    for (const [ax, az, bx, bz] of [[-r, -r, r, -r], [r, -r, r, r], [r, r, -r, r], [-r, r, -r, -r]]) {
      sink.member('structureMetal', [ax, Hs + 1.05, az], [bx, Hs + 1.05, bz], 0.05, 0.05, [0, 1, 0], { colour: MULLION, decor: true, exposed: true }, 0);
    }
  }
  const mx = (rng() - 0.5) * C * 0.4, mz = (rng() - 0.5) * C * 0.4;
  sink.cylinder('structureMetal', [mx, y1 + 0.35, mz], 'y', 4.5, 0.07, 6, { colour: rgb(0xb8b8b0), decor: true }, 0.04);
  sink.cylinder('structureMetal', [mx, y1 + 4.85, mz], 'y', 0.35, 0.14, 6, { colour: rgb(0xa83224), decor: true });
  for (const k of [0.45, 0.7]) sink.member('structureMetal', [mx - 0.7, y1 + 0.35 + 4.5 * k, mz], [mx + 0.7, y1 + 0.35 + 4.5 * k, mz], 0.04, 0.04, [0, 0, 1], { colour: rgb(0xb8b8b0), decor: true, exposed: true }, 0);
  return sink.finish();
};

/** Ribbon windows: a storey's windows close-set on a face, the piers between them narrow. */
function ribbon(face: 'front' | 'back' | 'left' | 'right', storey: number, width: number, avoid: Array<[number, number]> = []): Opening[] {
  return windowRhythm(face, storey, width, { w: 1.35, h: 1.45, sill: 0.95, spacing: 1.75, margin: 0.7, avoid });
}

/**
 * The terminal and office block: two or three storeys of render with concrete bands at the floors, the windows in
 * ribbons, a flat roof behind a parapet, the entrance under a flat canopy on two columns; the terminal's roof sign
 * frame and the plant on the roof.
 */
const officeBlock: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const W = Math.max(8, Math.min(30, ctx.info.w - 0.6)), D = Math.max(8, Math.min(30, ctx.info.d - 2.0));
  const storeys = Math.max(2, Math.min(3, Math.floor((ctx.info.h - 1) / 3.2)));
  const wall: RegionalBucket = rng() < 0.35 ? 'plaster2' : 'plaster';
  const door = { face: 'front' as const, storey: 0, kind: 'door' as const, u: (rng() - 0.5) * W * 0.3, w: 1.8, y0: 0, h: 2.4 };
  // the glazed stair hall over the entrance, up the front's full height
  const hallW = Math.min(6.2, Math.max(3.6, W * 0.36));
  const openings: Opening[] = [door];
  for (let i = 0; i < storeys; i++) {
    openings.push(...ribbon('front', i, W, [[door.u - hallW / 2 - 0.2, door.u + hallW / 2 + 0.2]]));
    openings.push(...ribbon('back', i, W));
    for (const face of ['left', 'right'] as const) openings.push(...ribbon(face, i, D));
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, OFFICE_WINDOW, rng, 0.35),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x6a6e6e), frame: { bucket: 'stone', width: 0.16, out: 0.06 }, transom: true, steps: { bucket: 'stone' }, leafKind: 'glazed' }, y0 + o.y0),
  };
  sink.placed(0, 0, 0, -0.7, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.45, out: 0.05, bucket: 'stone' }, storeys: Array.from({ length: storeys }, () => ({ h: 3.3, wall })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.3, bucket: 'stone', parapet: 0.7 }, gableBucket: wall,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.14, spall: 'stone',
    }, dialect);
    // the concrete bands at the floor slabs, carried round the corners
    for (let i = 1; i < storeys; i++) {
      const y = frame.floors[i];
      sink.span('stone', -W / 2 - 0.06, y - 0.18, -D / 2 - 0.06, W / 2 + 0.06, y + 0.12, D / 2 + 0.06, { decor: true });
    }
    // the stair hall's curtain wall over the door: a concrete frame, a grid of panes between mullions
    const f: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const hy0 = 3.0, hy1 = frame.eaveY + 0.2;
    for (const side of [-1, 1]) faceBox(sink, 'stone', f, door.u + side * (hallW / 2 + 0.15), hy1 / 2, 0.25, 0.3, hy1 + 0.4, 0.5);
    faceBox(sink, 'stone', f, door.u, hy1 + 0.2, 0.25, hallW + 0.6, 0.4, 0.5);
    faceBox(sink, 'stone', f, door.u, hy0 - 0.15, 0.25, hallW, 0.3, 0.5, { decor: true });
    const cols = Math.max(3, Math.round(hallW / 1.3)), rows = Math.max(2, Math.round((hy1 - hy0) / 1.6));
    const cw = hallW / cols, rh = (hy1 - hy0) / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      facePanel(sink, paneBucket(rng, 0.45), f, door.u - hallW / 2 + (c + 0.5) * cw, hy0 + (r + 0.5) * rh, 0.3, cw - 0.06, rh - 0.06, { decor: true, window: [0, 0, 1] });
    }
    if (!mobile) {
      for (let c = 1; c < cols; c++) faceBox(sink, 'structureMetal', f, door.u - hallW / 2 + c * cw, (hy0 + hy1) / 2, 0.34, 0.07, hy1 - hy0, 0.08, { colour: MULLION, decor: true });
      for (let r = 1; r < rows; r++) faceBox(sink, 'structureMetal', f, door.u, hy0 + r * rh, 0.34, hallW, 0.07, 0.08, { colour: MULLION, decor: true });
    }
    // the entrance canopy on two columns
    const cz = D / 2 + 1.25;
    sink.span('stone', door.u - 2.2, 3.0, D / 2, door.u + 2.2, 3.28, cz + 0.05);
    for (const dx of [-1.9, 1.9]) sink.cylinder('stone', [door.u + dx, -0.2, cz - 0.25], 'y', 3.2, 0.13, 8, {});
    // the plant on the roof, and the terminal's sign frame over the apron front
    const top = frame.eaveY + 0.3;
    const look = ctx.variant;
    if (!mobile) for (let k = 0; k < 2 + Math.floor(look() * 2); k++) {
      const x = (look() - 0.5) * (W - 3), z = (look() - 0.5) * (D - 3);
      sink.span('structureMetal', x - 0.8, top, z - 0.6, x + 0.8, top + 1.0, z + 0.6, { colour: rgb(0x8a8e8c), decor: true });
    }
    if (W >= 12) {
      const sw = Math.min(W * 0.6, 12), sy = top + 0.7;
      for (const dx of [-sw / 2 + 0.3, 0, sw / 2 - 0.3]) sink.member('structureMetal', [dx, top, D / 2 - 0.6], [dx, sy + 1.6, D / 2 - 0.6], 0.08, 0.08, [0, 0, 1], { colour: MULLION, decor: true, exposed: true }, 0);
      sink.span('structureMetal', -sw / 2, sy, D / 2 - 0.66, sw / 2, sy + 1.4, D / 2 - 0.54, { colour: rgb(0x2e4a7a), decor: true });
    }
  });
  return sink.finish();
};

/**
 * The airport fire station: a long single storey of appliance bays behind red doors, a two-storey watch room at one
 * end, the hose tower with its louvred top at the back corner, flat roofs.
 */
const fireStation: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(9, Math.min(20, ctx.info.w - 0.8)), D = Math.max(10, Math.min(20, ctx.info.d - 1.6));
  // bays under 3 m wide: a hull never noses into one
  const bays = W >= 11 ? 3 : 2, bayW = Math.min(2.9, (W - 1.2) / bays - 0.5);
  const wall: RegionalBucket = 'plaster2';
  const openings: Opening[] = [];
  for (let k = 0; k < bays; k++) openings.push({ face: 'front', storey: 0, kind: 'gate', u: -W / 2 + 0.6 + (k + 0.5) * ((W - 1.2) / bays), w: bayW, y0: 0, h: 3.8 });
  for (const face of ['left', 'right'] as const) openings.push(...windowRhythm(face, 0, D, { w: 1.2, h: 1.0, sill: 2.0, spacing: 2.8, margin: 1.2 }));
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, OFFICE_WINDOW, rng, 0.3),
    // the red roller doors: a solid leaf at the back of the reveal (it closes the bay for the collision), its slats
    door: (s, face, o, y0) => {
      const r = s.recess, go = r > 0 ? -r + 0.04 : 0.02, y = y0 + o.y0;
      faceBox(s, 'structureMetal', face, o.u, y + o.h / 2, go, o.w + 0.02, o.h, 0.06, { colour: FIRE_RED });
      for (let k = 1; k < 9; k++) faceBox(s, 'structureMetal', face, o.u, y + o.h * k / 9, go + 0.035, o.w - 0.1, 0.035, 0.012, { colour: shade(FIRE_RED, 0.72), decor: true, fine: true });
      faceBox(s, 'stone', face, o.u, y + o.h + 0.12, 0.04, o.w + 0.4, 0.24, 0.08, { decor: true });
    },
  };
  sink.placed(0, 0, 0, -0.6, () => {
    buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.8, wall }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.2, verge: 0.2, thickness: 0.3, bucket: 'stone', parapet: 0.5 }, gableBucket: wall,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.16,
    }, dialect);
    // the hose tower at the back corner: a slim block shaft, louvred openings at the top, a flat cap
    const tx = W / 2 - 1.6, tz = -D / 2 + 1.6, th = Math.max(11, Math.min(14, ctx.info.h - 1));
    sink.span(wall, tx - 1.4, -0.4, tz - 1.4, tx + 1.4, th, tz + 1.4);
    for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const f: Face = { origin: [tx + ox * 1.4, 0, tz + oz * 1.4], u: [ux, 0, uz], out: [ox, 0, oz], width: 2.8 };
      faceBox(sink, 'dark', f, 0, th - 1.6, 0.005, 1.4, 1.8, 0.01, { decor: true });
      for (let y = th - 2.4; y < th - 0.8; y += 0.3) faceBox(sink, 'structureMetal', f, 0, y, 0.04, 1.4, 0.06, 0.08, { colour: RIB, decor: true });
    }
    sink.span('stone', tx - 1.6, th, tz - 1.6, tx + 1.6, th + 0.3, tz + 1.6);
  });
  return sink.finish();
};

/**
 * The Rozhnovsky water tower of the Soviet airfields: a round brick or concrete shaft, the riveted steel tank wider
 * than it under a low cone, the ladder up the shaft, a door at its foot.
 */
const waterTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const half = Math.min(ctx.info.w, ctx.info.d) / 2;
  const R = Math.max(1.2, Math.min(1.8, half - 1.2)), Rt = Math.max(R + 0.6, Math.min(3.0, half + 0.4));
  const H = Math.max(10, Math.min(16, ctx.info.h - 3.5)), Ht = 3.6;
  const shaft: RegionalBucket = rng() < 0.6 ? 'stone' : 'plaster';
  sink.cylinder('stone', [0, -0.4, 0], 'y', 0.8, R + 0.25, 10, {}, R + 0.2, true);
  sink.cylinder(shaft, [0, 0.4, 0], 'y', H - 0.4, R, 10, {}, R * 0.92, true);
  // the tank: its floor cone, the drum, the roof cone
  sink.cylinder('structureMetal', [0, H - 0.8, 0], 'y', 0.8, R * 0.9, 12, { colour: rgb(0x6c7270) }, Rt, false);
  sink.cylinder('structureMetal', [0, H, 0], 'y', Ht, Rt, 12, { colour: rgb(0x7c8380) }, Rt, true);
  sink.cylinder('structureMetal', [0, H + Ht, 0], 'y', 1.1, Rt + 0.1, 12, { colour: rgb(0x5c6260) }, 0.3, true);
  // the ladder up the shaft's apron side, a door at its foot
  for (const dx of [-0.25, 0.25]) sink.member('structureMetal', [dx, 0.6, R * 0.97 + 0.12], [dx, H - 0.6, R * 0.9 + 0.12], 0.04, 0.04, [0, 0, 1], { colour: RIB, decor: true, exposed: true }, 0);
  const f: Face = { origin: [0, 0, R * 0.98], u: [1, 0, 0], out: [0, 0, 1], width: 1.6 };
  doorUnit(sink, f, -0.9, 0.4, 0.9, 2.1, { leaf: pick(rng, STEEL_DOORS), frame: { bucket: 'stone', width: 0.12, out: 0.05 }, steps: null, leafKind: 'plank' }, 0.4);
  return sink.finish();
};

/** A shelled office block: walls broken to stubs, a floor slab fallen in across the ground storey, rebar at the breaks. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, ctx.info.w - 0.3), D = Math.max(7, ctx.info.d - 0.3), t = 0.3;
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k < 5; k++) {
      if (rng() < 0.3) continue;
      const a = k / 5, b = (k + 1) / 5, top = 0.8 + rng() * 4.6;
      if (along) sink.span('plaster', x0 + (x1 - x0) * a, -0.3, z0, x0 + (x1 - x0) * b, top, z1);
      else sink.span('plaster', x0, -0.3, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
      if (top > 2.5) for (let r = 0; r < 3; r++) {
        const x = along ? x0 + (x1 - x0) * (a + (b - a) * rng()) : (x0 + x1) / 2, z = along ? (z0 + z1) / 2 : z0 + (z1 - z0) * (a + (b - a) * rng());
        sink.member('structureWood', [x, top, z], [x + (rng() - 0.5) * 0.6, top + 0.5 + rng() * 0.6, z + (rng() - 0.5) * 0.6], 0.03, 0.03, [0, 0, 1], { colour: RUST, decor: true, exposed: true }, 0);
      }
    }
  }
  // the fallen slab and the rubble under it
  sink.member('stone', [-W * 0.35, 0.3, -D * 0.25], [W * 0.3, 2.6, D * 0.2], Math.min(W, D) * 0.6, 0.22, [0.3, 1, -0.2], { exposed: true });
  sink.span('stone', -W * 0.38, -0.2, -D * 0.3, W * 0.32, 0.8, D * 0.28, { decor: true });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the dachas

/** The garden cooperatives' paints (board green, blue, ochre, cream, red-brown, sky blue) and the trim's white. */
const DACHA_PAINT: readonly Rgb[] = [0x4f7d4a, 0x3f6f9a, 0xc9a24a, 0xd9cfae, 0x7a3e30, 0x5a8aa0].map(rgb);
/** Their roofs: asbestos-cement sheet greys, sheet painted green, red or brown. */
const DACHA_SHEET: readonly Rgb[] = [0x9aa0a0, 0x878c8a, 0x4f7a52, 0x8a3a30, 0x6a4a3a].map(rgb);
const DACHA_TRIM = rgb(0xe3ded2), DACHA_PLANK = rgb(0x7a6048);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). A kit house fills it (the
 * coordinator's rule, 2026-10-05: a kit body short of its base opens a lane the bots drive through).
 */
function footprint(ctx: RegionalBuildContext): { w: number; d: number; cx: number; cz: number } {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/** The glazed veranda's panes: small lights in white frames over the boarded dado. */
const VERANDA_WINDOW: WindowStyle = { frame: DACHA_TRIM, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null };

/**
 * The dacha of the garden cooperatives round the airport (the sadovi tovarystva of Hostomel and Bucha, laid out from
 * the 1960s on six-sotok plots): a cottage of one storey in planks or rendered block on a brick plinth under a steep
 * gable of asbestos-cement or painted sheet, the attic room behind a gable window to the lane, a small brick stack, and
 * the glazed veranda down one side (or across the back on a deep lot) under its lean-to — boarded to the sill in the
 * house's paint, small panes above, the door and its steps to the lane. House and veranda fill the base's footprint;
 * the house's gable faces the lot's +z (the lane).
 */
const dacha: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const paint = pick(rng, DACHA_PAINT), livery = pick(rng, DACHA_SHEET);
  const wall: RegionalBucket = rng() < 0.35 ? 'plaster' : 'wood';
  const sheet = rng() < 0.55;
  // the veranda down one side on a wide lot, across the back on a deep one
  const sideways = fp.w >= fp.d * 0.8;
  const side = rng() < 0.5 ? 1 : -1;
  const vD = sideways ? clamp(fp.w * 0.3, 1.8, 2.8) : clamp(fp.d * 0.26, 1.8, 2.6);
  const W = Math.max(3.6, sideways ? fp.w - vD : fp.w), D = Math.max(4.4, sideways ? fp.d : fp.d - vD);
  const bx = sideways ? fp.cx - side * vD / 2 : fp.cx, bz = sideways ? fp.cz : fp.cz + vD / 2;
  const pitch = 40 + rng() * 8, wallH = 2.4 + rng() * 0.25, plinth = 0.45;
  const win: WindowStyle = {
    frame: rng() < 0.6 ? DACHA_TRIM : paint, frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.6 ? 'cross' : 'two',
    surround: wall === 'wood' ? { bucket: 'structureWood', width: 0.1, out: 0.03, lintel: 0.16, colour: rng() < 0.6 ? DACHA_TRIM : paint } : null,
    sill: { bucket: 'structureWood', out: 0.06, colour: DACHA_TRIM }, shutters: null,
  };
  // the side the veranda does not cover keeps its windows; the lane gable two (or one and the door, with the veranda behind)
  const free: 'left' | 'right' = side > 0 ? 'left' : 'right';
  const openings: Opening[] = sideways
    ? [...windowRhythm('front', 0, W - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 1.6, margin: 0.7, max: 2 }),
      ...windowRhythm(free, 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.1, max: 2 }),
      ...windowRhythm('back', 0, W - 0.1, { w: 0.8, h: 1.1, sill: 0.95, spacing: 1.6, margin: 1.0, max: 1 })]
    : [{ face: 'front', storey: 0, kind: 'door', u: -(W - 0.1) * 0.22, w: 0.85, y0: 0, h: 1.95 },
      { face: 'front', storey: 0, kind: 'window', u: (W - 0.1) * 0.2, w: 0.9, y0: 0.85, h: 1.2 },
      ...windowRhythm('left', 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.0, max: 2 }),
      ...windowRhythm('right', 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.0, max: 2 })];
  const roof: RoofSpec = { kind: 'gable', pitchDeg: pitch, eave: 0.35, verge: 0.32, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: 'saddle' };
  sink.placed(0, bx, 0, bz, () => {
    const frame = buildHouse(sink, {
      w: W - 0.1, d: D - 0.1, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: 'wood', openings,
      chimneys: [{ x: -side * (W - 0.1) * 0.18, z: -(D - 0.1) * 0.2, sx: 0.42, sz: 0.52, above: 0.6, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: rng() < 0.5 ? DACHA_TRIM : paint, bucket: 'structureWood' }, reveal: 0.1,
      spall: wall === 'plaster' ? undefined : null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, win, rng, 0.4),
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: rng() < 0.5 ? paint : DACHA_PLANK, frame: { bucket: 'structureWood', width: 0.09, out: 0.04, colour: DACHA_TRIM },
        steps: { bucket: 'stone' }, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
    });
    // the attic room's window in the lane gable (two lights in a white frame on the boarded gable)
    const gf: Face = { origin: [0, 0, (D - 0.1) / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const rise = frame.roof.ridgeY - frame.eaveY, gy = frame.eaveY + rise * 0.36, gh = clamp(rise * 0.34, 0.7, 1.1), gw = clamp(W * 0.17, 0.7, 1.0);
    faceBox(sink, 'structureWood', gf, 0, gy, 0.02, gw + 0.16, gh + 0.16, 0.04, { colour: DACHA_TRIM, decor: true });
    faceBox(sink, paneBucket(rng, 0.3), gf, 0, gy, 0.045, gw, gh, 0.01, { decor: true });
    faceBox(sink, 'structureWood', gf, 0, gy, 0.055, 0.05, gh, 0.02, { colour: DACHA_TRIM, decor: true, fine: true });
    // the house's paint on the corner boards and the gable's apron board
    if (wall === 'wood') {
      for (const fx of [-1, 1]) for (const face of [gf, { origin: [0, 0, -(D - 0.1) / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W } as Face]) {
        faceBox(sink, 'structureWood', face, fx * ((W - 0.1) / 2 - 0.06), plinth + wallH / 2, 0.03, 0.12, wallH, 0.05, { colour: paint, decor: true, fine: true });
      }
      faceBox(sink, 'structureWood', gf, 0, frame.eaveY + 0.06, 0.04, W - 0.1, 0.14, 0.05, { colour: paint, decor: true });
    }
    if (look() < 0.5) tvAerial(sink, frame, (look() - 0.5) * D * 0.4, look);
  });
  // the veranda: a body of its own under a lean-to rising to the house wall (its local +x out from the house)
  const vH = 2.2, vPlinth = 0.4;
  const vRoof: RoofSpec = { kind: 'shed', pitchDeg: 12, eave: 0.25, verge: 0.2, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: null };
  const vLen = sideways ? D : W;
  const vOpen: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: sideways ? 0 : (side > 0 ? -1 : 1) * (vD / 2 - 0.6), w: 0.82, y0: 0, h: 1.95 },
    ...windowRhythm('right', 0, vLen - 0.06, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.72, margin: 0.3 }),
    ...windowRhythm('back', 0, vD - 0.06, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.72, margin: 0.3, max: 2 }),
  ];
  // sideways: the veranda's local frame is the house's turned by 0 (side +1) or π (side -1), its +x away from the house;
  // across the back: turned a quarter so its +x runs out to the lot's -z
  const vyaw = sideways ? (side > 0 ? 0 : Math.PI) : -Math.PI / 2;
  const vx = sideways ? fp.cx + side * (fp.w / 2 - vD / 2) : fp.cx, vz = sideways ? fp.cz : fp.cz - fp.d / 2 + vD / 2;
  sink.placed(vyaw, vx, 0, vz, () => {
    const vf = buildHouse(sink, {
      w: vD - 0.06, d: vLen - 0.06, plinth: { h: vPlinth, out: 0.03, bucket: 'stone' }, storeys: [{ h: vH, wall: 'wood' }],
      roof: vRoof, roofColour: sheet ? livery : undefined, openings: vOpen, chimneys: [], gutters: null, verge: null, reveal: 0.05, spall: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, VERANDA_WINDOW, rng, 0.35),
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: paint, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: DACHA_TRIM }, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, fr.floors[o.storey] + o.y0),
    });
    // the boarded dado in the house's paint along the open sides, a rail at the sill
    const L = vLen - 0.06, w = vD - 0.06;
    const outer: Face = { origin: [w / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L };
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.5, 0.03, L - 0.04, 0.95, 0.04, { colour: paint, decor: true });
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.98, 0.06, L, 0.07, 0.08, { colour: DACHA_TRIM, decor: true }, 'ends');
    // the lean-to leaves two triangles open over its ends: boarded
    const rise = w * Math.tan(12 * Math.PI / 180);
    const front: Face = { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: w };
    const back: Face = { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w };
    wallPolygon(sink, 'wood', front, [[-w / 2, vf.eaveY], [w / 2, vf.eaveY], [-w / 2, vf.eaveY + rise]], 0.12);
    wallPolygon(sink, 'wood', back, [[-w / 2, vf.eaveY], [w / 2, vf.eaveY], [w / 2, vf.eaveY + rise]], 0.12);
  });
  return sink.finish();
};

/**
 * The garden shed at the plot's back (the yards' outbuilding): planks or old sheet on a timber frame under a lean-to
 * of asbestos sheet, a plank door; it fills its plot.
 */
const gardenShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  const W = Math.max(1.8, fp.w - 0.06), D = Math.max(1.6, fp.d - 0.06), h = 2.0 + rng() * 0.25;
  const sheetWall = rng() < 0.3, livery = pick(rng, DACHA_SHEET);
  const roof: RoofSpec = { kind: 'shed', pitchDeg: 10, eave: 0.2, verge: 0.15, thickness: 0.06, bucket: 'structureMetal', ridge: null };
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h, wall: 'wood' }], roof, roofColour: livery,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 1.2), w: 0.8, y0: 0, h: 1.8 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.04, spall: null,
    }, {
      window: () => { /* none */ },
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: DACHA_PLANK, frame: { bucket: 'structureWood', width: 0.06, out: 0.03, colour: shade(DACHA_PLANK, 0.85) }, steps: null, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
    });
    const rise = W * Math.tan(10 * Math.PI / 180);
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    wallPolygon(sink, 'wood', front, [[-W / 2, frame.eaveY], [W / 2, frame.eaveY], [-W / 2, frame.eaveY + rise]], 0.1);
    wallPolygon(sink, 'wood', back, [[-W / 2, frame.eaveY], [W / 2, frame.eaveY], [W / 2, frame.eaveY + rise]], 0.1);
    // an old sheet patched over one side
    if (sheetWall) {
      const sf: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      faceBox(sink, 'structureMetal', sf, 0, h * 0.45, 0.03, D * 0.8, h * 0.8, 0.03, { colour: shade(livery, 0.85), decor: true });
    }
  });
  return sink.finish();
};

export const HOSTOMEL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  warehouse: hangar,
  depot: maintenanceHangar,
  tower: controlTower,
  foundryoffice: officeBlock,
  firestation: fireStation,
  watertower: waterTower,
  ruin,
  // the map-revival lane (2026-10-05): the dacha cooperatives on the access roads outside the perimeter, their sheds
  cottage: dacha,
  woodshed: gardenShed,
});

export const HOSTOMEL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'hostomel',
  region: 'Hostomel (Antonov) airport, Kyiv oblast: a barrel-vaulted cargo hangar, sheet-steel maintenance hangars, a concrete tower under its glazed cab, 1970s terminal and office blocks; the dachas of the garden cooperatives outside the perimeter',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.46, 0.49, 0.48] },
    stone: { kind: 'block', tint: [0.6, 0.6, 0.57] },
    sourced: { plaster: true, wood: false },
    tones: {
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.25 + 0.04), Math.min(1, l * 0.95 + 0.06)],
      plaster2: (_h, s, l) => [0.13, Math.min(1, s * 0.5 + 0.18), Math.min(1, l * 1.05 + 0.1)],
    },
  },
  builders: HOSTOMEL_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [0.96, 0.95, 0.92], [0.9, 0.9, 0.88], [1.0, 0.97, 0.92]],
    stone: [[1, 1, 1], [0.93, 0.93, 0.91], [0.86, 0.86, 0.85], [0.97, 0.95, 0.92]],
    roof: [[1, 1, 1], [0.9, 0.9, 0.88], [0.82, 0.8, 0.76], [1.05, 1.04, 1.02]],
    damp: 0.55, moss: 0.25,
  },
  // shellfire and the fires of February 2022: more of the airfield's windows burnt out or boarded than a village's
  wear: 0.45,
  // the map-revival lane (2026-10-05): the dachas' garden plots (yards.ts) — a picket fence and gate round the yard,
  // the garden shed at its back, the kitchen-garden beds
  yard: { kinds: ['cottage'], fence: 'fencepicket', gate: 'gate', shed: 'woodshed', shedSize: [2.6, 2.2], garden: true },
});
