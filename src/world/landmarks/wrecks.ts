// src/world/landmarks/wrecks.ts — wrecks (the landmarks lane, 2026-10-05): the Antonov An-225 Mriya in the ruin of its
// hangar at Hostomel, destroyed in the fighting for the airport in February 2022.
//
// The aircraft at true scale (84.0 m long, 88.4 m span, 18.1 m to the fin tips; a fuselage 7.3 m wide and 8.2 m deep,
// the flight deck on its hump over the nose's cargo visor; a high wing swept and drooping, three D-18T turbofans under
// each half; the twin fins at the tips of a 32.6 m stabiliser) cannot lie whole on the 56 × 36 m hangar plot, so it lies
// as the photographs show it, broken up and burnt: the forward fuselage with the flight deck and the wing's centre box
// under the hangar's broken arch ribs, its nose toward the apron; the outer wing panels broken off along the plot's back,
// one engine still on its pylon and others fallen; the twin-fin tail torn away and lying apart, its fins standing, the
// flag on them; burnt skin, a door panel and debris spilling out onto the apron's edge (dressing, no collision). Paint
// from the Antonov livery — white over pale grey, the blue and yellow band — under the fire's soot.
//
// The piece's frame: x across the plot, +z out of its open front toward the apron, y up; the origin is the centre of the
// plot and the apron strip together (plan.ts aircraftWreck). Collision comes from the fuselage, the tail, the wing
// panels and the arch footings (structural); the ribs, the engines and the debris are dressing.
import * as THREE from 'three';
import { BUCKET_UV_DENSITY, PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, settleOnGround, LIMEWASH_UV, smoothRender } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const WHITE = rgb(0xe9e9e6), GREY_BELLY = rgb(0xb9bcbf), BLUE = rgb(0x2c5aa0), YELLOW = rgb(0xf0c22c), SOOT = rgb(0x1c1a18), ASH = rgb(0x6a6560);
const RUST = rgb(0x6e4630), STEEL = rgb(0x5f6466), FAN = rgb(0x26282a), GLASS_BURNT = rgb(0x121314);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A rigid pose in the piece's frame: a yaw about y, then a pitch about x, then a roll about z, and a translation. */
interface Pose { m: number[]; t: Vec3 }
function pose(yaw: number, pitch: number, roll: number, t: Vec3): Pose {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry(yaw) · Rx(pitch) · Rz(roll)
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (a: number[], b: number[]) => Array.from({ length: 9 }, (_, k) => {
    const i = Math.floor(k / 3), j = k % 3;
    return a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  });
  return { m: mul(mul(Ry, Rx), Rz), t };
}
const at = (P: Pose, p: Vec3): Vec3 => [
  P.m[0] * p[0] + P.m[1] * p[1] + P.m[2] * p[2] + P.t[0],
  P.m[3] * p[0] + P.m[4] * p[1] + P.m[5] * p[2] + P.t[1],
  P.m[6] * p[0] + P.m[7] * p[1] + P.m[8] * p[2] + P.t[2],
];

interface Section {
  /** station along the tube's axis (local x) */
  s: number;
  /** the section's centre (local y, z) and half extents across (z) and up (y) */
  cy: number;
  cz?: number;
  hw: number;
  hh: number;
  /** a broken edge: each point's radius jittered by up to this share */
  rag?: number;
}

/** The smooth hulls (fuselage, tail cone, wing panels, nacelles): built as their own geometries with analytic normals
 *  and per-vertex paint, handed to the part set after the sink's flat-shaded parts (finishWreck). */
let smooth: THREE.BufferGeometry[] = [];

/**
 * A lofted tube in a pose: elliptical sections along local x joined round, smooth-shaded (each vertex the ellipse's own
 * normal) and painted per vertex by `paint` (station, angle round from the top, height), so the soot shades along the
 * hull instead of in facets. Ends close with a fan from the centre (a broken end's jagged ring stays star-shaped).
 * Structural unless `decor` (the collision derivation welds it by its shared corners).
 */
function loft(_sink: PartSink, _bucket: RegionalBucket, P: Pose, sections: readonly Section[], n: number, paint: (s: number, a: number, y: number) => Rgb,
  opts: EmitOptions & { capStart?: Rgb | null; capEnd?: Rgb | null; rng?: () => number } = {}): void {
  const { capStart = null, capEnd = null, rng } = opts;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const density = BUCKET_UV_DENSITY.structureMetal;
  const dir = (v: Vec3): Vec3 => [P.m[0] * v[0] + P.m[1] * v[1] + P.m[2] * v[2], P.m[3] * v[0] + P.m[4] * v[1] + P.m[5] * v[2], P.m[6] * v[0] + P.m[7] * v[1] + P.m[8] * v[2]];
  type V = { p: Vec3; n: Vec3; u: number; v: number; c: Rgb };
  const rings: V[][] = sections.map((sec) => Array.from({ length: n + 1 }, (_, i): V => {
    const k = i % n, a = k / n * Math.PI * 2, j = sec.rag && rng && i < n ? 1 - sec.rag * rng() : 1;
    const ly = Math.cos(a) * sec.hh * j, lz = Math.sin(a) * sec.hw * j;
    const nl = Math.hypot(Math.cos(a) / sec.hh, Math.sin(a) / sec.hw) || 1;
    const p = at(P, [sec.s, sec.cy + ly, (sec.cz ?? 0) + lz]);
    return { p, n: dir([0, Math.cos(a) / sec.hh / nl, Math.sin(a) / sec.hw / nl]), u: sec.s * density, v: a * (sec.hw + sec.hh) * 0.5 * density,
      c: paint(sec.s, a, sec.cy + ly) };
  }));
  // the seam's closing vertex repeats the first ring point (the same corner: a jagged ring keeps its first jitter)
  for (const ring of rings) { ring[n] = { ...ring[n], p: ring[0].p, n: ring[0].n, c: ring[0].c }; }
  const push = (v: V) => { pos.push(...v.p); nor.push(...v.n); uv.push(v.u, v.v); col.push(...v.c); };
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < n; i++) {
      const a = rings[k][i], b = rings[k][i + 1], c = rings[k + 1][i + 1], d = rings[k + 1][i];
      push(a); push(b); push(c); push(a); push(c); push(d);
    }
  }
  const cap = (ring: V[], sec: Section, colour: Rgb, back: boolean) => {
    const centre = at(P, [sec.s, sec.cy, sec.cz ?? 0]), axis = dir([back ? -1 : 1, 0, 0]);
    const C: V = { p: centre, n: axis, u: 0, v: 0, c: colour };
    for (let i = 0; i < n; i++) {
      const a = { ...ring[i], n: axis, c: colour }, b = { ...ring[i + 1], n: axis, c: colour };
      if (back) { push(C); push(b); push(a); } else { push(C); push(a); push(b); }
    }
  };
  if (capStart) cap(rings[0], sections[0], capStart, true);
  if (capEnd) cap(rings[rings.length - 1], sections[sections.length - 1], capEnd, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.userData = { regional: true, uvJitter: 'none', ...(opts.decor ? { noCollision: true } : {}) };
  smooth.push(g);
}

/** The sink's parts with the smooth hulls joined to the metal bucket. */
function finishWreck(sink: PartSink): RegionalParts {
  const parts = sink.finish();
  parts.structureMetal.push(...smooth);
  smooth = [];
  return parts;
}

/** The livery under the soot: white over the pale grey belly, the blue and yellow band low on the side. */
function livery(y: number, cy: number, hh: number): Rgb {
  const t = (y - cy) / hh; // -1 at the keel, +1 at the crown
  if (t < -0.62) return GREY_BELLY;
  if (t < -0.42) return YELLOW;
  if (t < -0.18) return BLUE;
  return WHITE;
}

/** An airfoil panel (a wing or stabiliser half, a fin) along local x from 0 to `span`: chord and thickness tapering,
 *  the leading edge swept back by `sweep` (m over the span), its root ragged where it broke. */
function panel(sink: PartSink, P: Pose, span: number, rootChord: number, tipChord: number, sweep: number, thick: number,
  paint: (s: number, a: number) => Rgb, opts: { rootRag?: number; rng?: () => number; decor?: boolean; n?: number } = {}): void {
  const steps = 6, sections: Section[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, chord = rootChord + (tipChord - rootChord) * t;
    sections.push({ s: span * t, cy: 0, cz: -(sweep * t + chord / 2), hw: chord / 2, hh: Math.max(0.12, chord * thick / 2), rag: k === 0 ? opts.rootRag : undefined });
  }
  loft(sink, 'structureMetal', P, sections, opts.n ?? 8, (s, a) => paint(s, a),
    { capStart: opts.rootRag ? SOOT : shade(WHITE, 0.8), capEnd: shade(WHITE, 0.85), rng: opts.rng, ...(opts.decor ? { decor: true } : {}) });
}

/** A D-18T nacelle along local x (the intake at x = 0): the cowl, the dark fan face, the exhaust cone; burnt. */
function nacelle(sink: PartSink, P: Pose, soot: number, decor: boolean): void {
  const body = lerp(WHITE, SOOT, soot);
  loft(sink, 'structureMetal', P, [
    { s: 0, cy: 0, hw: 1.38, hh: 1.38 }, { s: 0.3, cy: 0, hw: 1.5, hh: 1.5 }, { s: 2.2, cy: 0, hw: 1.52, hh: 1.52 },
    { s: 4.2, cy: 0, hw: 1.22, hh: 1.22 }, { s: 5.0, cy: 0, hw: 0.95, hh: 0.95 },
  ], 12, () => body, { capStart: FAN, capEnd: SOOT, ...(decor ? { decor: true } : {}) });
  loft(sink, 'structureMetal', P, [{ s: 5.0, cy: 0, hw: 0.62, hh: 0.62 }, { s: 6.0, cy: 0, hw: 0.08, hh: 0.08 }], 8, () => SOOT, { decor: true });
}

/**
 * The An-225 Mriya in the ruin of its hangar (plan.ts aircraftWreck).
 */
export const aircraftWreck: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rng = ctx.rng;
  const W = Math.max(40, Number(ctx.params.width)), Dp = Math.max(28, Number(ctx.params.depth)), strip = Math.max(0, Number(ctx.params.strip));
  // the plot's z range in the piece's frame (the strip in front of it, toward +z)
  const z0 = -(Dp + strip + 2) / 2, z1 = z0 + Dp, mid = (z0 + z1) / 2;
  const soot = (s: number, from: number, to: number) => Math.min(1, Math.max(0, (s - from) / (to - from)));

  // ---- the forward fuselage: its axis turned 31° from x so the nose (+x) points out toward the apron, broken behind the wing
  const FY = -0.55, FO: Vec3 = [-6, 0, mid + 7.5];
  const fuse = pose(FY, 0, 0.03, FO);
  // its belly on the floor (the gear collapsed under it)
  const keel = 0.04, H = 4.1, Wf = 3.65;
  const stations: Section[] = [
    { s: -22, cy: keel + H, hw: Wf * 0.96, hh: H * 0.97, rag: 0.12 }, { s: -18, cy: keel + H, hw: Wf, hh: H },
    { s: -6, cy: keel + H, hw: Wf, hh: H }, { s: 4, cy: keel + H, hw: Wf, hh: H },
    { s: 8, cy: keel + H * 0.98, hw: Wf * 0.98, hh: H * 0.97 }, { s: 11, cy: keel + H * 0.93, hw: Wf * 0.9, hh: H * 0.88 },
    { s: 13.4, cy: keel + H * 0.82, hw: Wf * 0.72, hh: H * 0.72 }, { s: 15.0, cy: keel + H * 0.7, hw: Wf * 0.46, hh: H * 0.5 },
    { s: 15.8, cy: keel + H * 0.62, hw: Wf * 0.16, hh: H * 0.2 },
  ];
  // the fire: black from the wing box back to the break, scorched over the flight deck, its smoke streaking the crown
  // and blistering the paint in patches everywhere
  const burn = (s: number) => Math.max(soot(s, 2, -12), 0.6 * Math.max(0, 1 - Math.abs(s - 8.5) / 3.5));
  loft(sink, 'structureMetal', fuse, stations, 20, (s, a, y) => {
    const crown = Math.max(0, Math.cos(a));
    const patches = 0.35 * Math.max(0, Math.sin(s * 1.3 + a * 2.7) * Math.sin(s * 0.7 - a * 1.9));
    return lerp(livery(y, keel + H, H), SOOT, Math.min(1, burn(s) + crown * 0.55 * soot(s, 9, -6) + patches + 0.12 * rng()));
  }, { capStart: SOOT, capEnd: WHITE, rng });
  // the flight deck's hump over the nose and its burnt-out windscreen
  loft(sink, 'structureMetal', fuse, [
    { s: 3, cy: keel + 2 * H - 0.4, hw: 1.9, hh: 0.4 }, { s: 6, cy: keel + 2 * H - 0.1, hw: 2.1, hh: 0.62 },
    { s: 10.4, cy: keel + 2 * H - 0.35, hw: 1.9, hh: 0.62 }, { s: 12.2, cy: keel + 2 * H - 0.9, hw: 1.4, hh: 0.3 },
  ], 12, (s) => lerp(WHITE, SOOT, 0.55 + 0.4 * soot(s, 4, 11)), { capStart: SOOT });
  for (const side of [-1, 1]) {
    const q = (s: number, y: number, z: number) => at(fuse, [s, y, side * z]);
    const pts = side > 0 ? [q(10.5, keel + 2 * H - 0.55, 0.3), q(10.5, keel + 2 * H - 0.55, 1.5), q(11.6, keel + 2 * H - 1.05, 1.15), q(11.6, keel + 2 * H - 1.05, 0.3)]
      : [q(10.5, keel + 2 * H - 0.55, 1.5), q(10.5, keel + 2 * H - 0.55, 0.3), q(11.6, keel + 2 * H - 1.05, 0.3), q(11.6, keel + 2 * H - 1.05, 1.15)];
    // the burnt-out panes, both faces (a hull's curve leaves either one toward the eye)
    sink.polygon('structureMetal', pts, { colour: GLASS_BURNT, decor: true });
    sink.polygon('structureMetal', [...pts].reverse(), { colour: GLASS_BURNT, decor: true });
  }
  // the wing's centre box on the fuselage's back (the high wing), its stubs broken off both sides
  for (const side of [-1, 1]) {
    // a stub along the fuselage's ±z from its crown, swept back, drooping (the An-225's anhedral), its outer end ragged;
    // a panel's span runs along its own x and its chord back along its -z: the +z stub turns a quarter one way, turned
    // over about its span so its chord runs aft, the -z stub the other way (the box's leading edge at station -3)
    const P = pose(FY + (side > 0 ? -Math.PI / 2 : Math.PI / 2), side > 0 ? Math.PI : 0, 0, at(fuse, [-3, keel + 2 * H - 0.5, 0]));
    panel(sink, P, 11, 12.5, 10.4, 3.2, 0.12, (s) => lerp(WHITE, SOOT, Math.min(1, 0.3 + soot(s, 2, 11) * 0.7)), { rng, rootRag: 0 });
    // its own broken tip
    loft(sink, 'structureMetal', P, [{ s: 11, cy: 0, cz: -(3.2 + 5.2), hw: 5.2, hh: 0.62, rag: 0.18 }, { s: 11.4, cy: 0, cz: -(3.2 + 5.2), hw: 4.4, hh: 0.4, rag: 0.3 }],
      8, () => SOOT, { capEnd: SOOT, rng, decor: true });
    // the inboard engine still hanging under the near stub
    if (side > 0) {
      const pylon = at(P, [6.5, -0.6, -2.0]);
      sink.span('structureMetal', pylon[0] - 0.35, pylon[1] - 2.2, pylon[2] - 2.2, pylon[0] + 0.35, pylon[1], pylon[2] + 0.6, { colour: lerp(WHITE, SOOT, 0.6), decor: true });
      nacelle(sink, pose(FY + Math.PI, 0.05, 0, [pylon[0], pylon[1] - 3.2, pylon[2]]), 0.7, true);
    }
  }
  // ---- the outer wing panels broken off along the plot's back, one propped on its broken root, one flat
  // panel A: the left outer wing, its broken root near the middle propped on debris, its tip toward the west wall
  const wingA = pose(Math.PI, 0.1, -0.08, [-2.5, 2.3, z0 + 0.9]);
  // the crushed nacelle its root rests on
  sink.span('structureMetal', -5.2, -0.1, z0 + 2.0, -1.6, 1.75, z0 + 6.4, { colour: lerp(STEEL, SOOT, 0.7) });
  panel(sink, wingA, 24.5, 9.8, 4.8, 7.0, 0.11, (s, a) => lerp(Math.cos(a) > 0 ? WHITE : GREY_BELLY, SOOT, Math.max(0, 0.75 - s / 30) + 0.08 * rng()),
    { rootRag: 0.2, rng, n: 8 });
  // its outer engine still on the pylon, burnt
  const pyA = at(wingA, [9, -0.5, -3.4]);
  sink.span('structureMetal', pyA[0] - 0.3, pyA[1] - 1.8, pyA[2] - 0.4, pyA[0] + 0.3, pyA[1], pyA[2] + 2.0, { colour: lerp(WHITE, SOOT, 0.7), decor: true });
  nacelle(sink, pose(Math.PI / 2 + 0.05, 0.08, 0, [pyA[0], Math.max(1.5, pyA[1] - 2.9), pyA[2] + 1.6]), 0.85, true);
  // panel B: a piece of the right wing, flat on the floor along the back toward the east wall
  const wingB = pose(0, -0.03, 0.04, [3, 0.28, z0 + 7.8]);
  panel(sink, wingB, 18, 6.0, 3.4, 4.0, 0.1, (s) => lerp(WHITE, SOOT, Math.max(0.1, 0.6 - s / 25) + 0.08 * rng()), { rootRag: 0.25, rng, n: 8 });
  // the fallen engines: one on its side beside the panels, one nose-down in the debris
  nacelle(sink, pose(0.6, 0, 1.1, [-W / 2 + 7, 1.5, mid + 12]), 0.9, true);
  nacelle(sink, pose(-0.4, -0.35, 0.2, [W / 2 - 6, 1.2, z0 + 13]), 0.8, true);
  // ---- the tail, torn away: the aft fuselage cone with the stabiliser across x and the twin fins standing
  const TY = Math.PI / 3;
  const tail = pose(TY, 0.07, 0, [W / 2 - 20.5, 0, mid + 4.4]);
  loft(sink, 'structureMetal', tail, [
    { s: -3.5, cy: 3.06, hw: 3.0, hh: 3.0, rag: 0.16 }, { s: 0, cy: 3.2, hw: 2.8, hh: 2.9 }, { s: 5, cy: 3.9, hw: 2.0, hh: 2.2 },
    { s: 9, cy: 4.5, hw: 1.15, hh: 1.25 }, { s: 11.5, cy: 4.9, hw: 0.45, hh: 0.5 },
  ], 14, (s, _a, y) => lerp(livery(y, 3.4, 2.9), SOOT, Math.max(0, 0.7 - (s + 3.5) / 10) + 0.06 * rng()), { capStart: SOOT, capEnd: WHITE, rng });
  // the stabiliser, each half from the cone's top out to its fin; the fins at its tips with the flag
  for (const side of [-1, 1]) {
    // each half spans along the tail's ±z (its chord running back along the cone toward the tip); the -z half turned
    // over about its span
    const root = at(tail, [3.0, 5.6, 0]);
    const S = pose(TY + (side > 0 ? -Math.PI / 2 : Math.PI / 2), side > 0 ? 0 : Math.PI, 0, root);
    const halfSpan = 16.3;
    panel(sink, S, halfSpan, 6.6, 3.6, 4.6, 0.1, (s) => lerp(WHITE, SOOT, Math.max(0, 0.25 - s / 40)), { n: 8 });
    // the fin standing on the stabiliser's tip, swept back, the flag low on it (the chord along the cone's +x)
    const tip = at(S, [halfSpan - 0.5, 0, side > 0 ? -2.6 : 2.6]);
    const F = pose(TY - Math.PI / 2, 0, Math.PI / 2, [tip[0], tip[1] - 2.2, tip[2]]);
    panel(sink, F, 11.5, 6.4, 3.0, 4.2, 0.09, (s) => (s < 7 ? (s < 4.2 ? YELLOW : BLUE) : WHITE), { n: 8 });
  }
  // ---- the hangar's barrel vault in ruins: its ribs (arched lattice girders), the footings, the purlins and sheets
  const span = W - 2, rise = 15.5, R = (span * span / 4 + rise * rise) / (2 * rise), cyArc = rise - R;
  const arcAt = (t: number): [number, number] => {
    const half = Math.asin(Math.min(1, span / 2 / R)), a = Math.PI / 2 + half - 2 * half * t;
    return [Math.cos(a) * R, cyArc + Math.sin(a) * R];
  };
  const ribZ = [z0 + 1.5, z0 + 7.5, z0 + 13.5, z0 + 19.5, z0 + 25.5, z0 + 31.5].filter((z) => z < z1 - 0.5);
  // each rib's state: the fraction of its arc standing from each footing, and how the broken end hangs
  const states: Array<[number, number, number]> = [[1, 0, 0], [1, 0, 0], [0.42, 0.3, 0.7], [0.22, 0.12, 1.2], [0.07, 0.05, 0.2], [0.05, 0.08, 0.2]];
  const girder = { colour: lerp(STEEL, RUST, 0.4), decor: true as const };
  ribZ.forEach((z, r) => {
    const [left, right, droop] = states[Math.min(states.length - 1, r)];
    for (const sx of [-1, 1]) {
      // the concrete footing (collision: it stays where the rib stood)
      sink.span('stone', sx * span / 2 - 1.0, -0.6 - ctx.groundFall, z - 0.9, sx * span / 2 + 1.0, 1.1, z + 0.9);
    }
    const draw = (t0: number, t1: number, sag: number) => {
      const steps = Math.max(2, Math.round((t1 - t0) * 24));
      for (let k = 0; k < steps; k++) {
        const ta = t0 + (t1 - t0) * k / steps, tb = t0 + (t1 - t0) * (k + 1) / steps;
        const [xa, ya] = arcAt(ta), [xb, yb] = arcAt(tb);
        const sa = sag * Math.pow((ta - t0) / Math.max(1e-6, t1 - t0), 2), sb = sag * Math.pow((tb - t0) / Math.max(1e-6, t1 - t0), 2);
        // the girder's two chords and its zig-zag web (the hangar's lattice ribs)
        bar(sink, 'structureMetal', [xa, ya - sa + 1.1, z], [xb, yb - sb + 1.1, z], 0.22, girder);
        bar(sink, 'structureMetal', [xa, ya - sa + 0.1, z], [xb, yb - sb + 0.1, z], 0.22, girder);
        bar(sink, 'structureMetal', [xa, ya - sa + 0.1, z], [xb, yb - sb + 1.1, z], 0.1, { ...girder, fine: true });
      }
    };
    if (left > 0) draw(0, left, left < 1 ? droop * 4 : 0);
    if (right > 0 && left < 1) draw(1 - right, 1, 0);
    if (left >= 1) return;
    // a broken rib's fallen length lies across the wreck below it
    if (r === 3) {
      const [xa, ya] = arcAt(left);
      bar(sink, 'structureMetal', [xa, ya - droop * 4 + 0.5, z], [xa + 16, 3.2, z + 3], 0.5, girder);
      bar(sink, 'structureMetal', [xa + 16, 3.2, z + 3], [xa + 24, 0.4, z + 4.5], 0.5, girder);
    }
  });
  // purlins between the two standing ribs at the back, and the back wall's girts with what is left of the sheeting
  for (const t of [0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88]) {
    const [x, y] = arcAt(t);
    bar(sink, 'structureMetal', [x, y + 1.2, ribZ[0]], [x, y + 1.2, ribZ[1]], 0.14, girder);
  }
  for (let k = 0; k < 9; k++) {
    const t = 0.08 + k * 0.1, [x, y] = arcAt(t), [x2, y2] = arcAt(t + 0.07);
    if (rng() < 0.45) continue;
    // a corrugated sheet still on the roof between the back ribs
    sink.quad('structureMetal', [x, y + 1.3, ribZ[0]], [x, y + 1.3, ribZ[1]], [x2, y2 + 1.3, ribZ[1]], [x2, y2 + 1.3, ribZ[0]], { colour: lerp(STEEL, RUST, rng() * 0.6), decor: true });
    sink.quad('structureMetal', [x, y + 1.29, ribZ[1]], [x, y + 1.29, ribZ[0]], [x2, y2 + 1.29, ribZ[0]], [x2, y2 + 1.29, ribZ[1]], { colour: lerp(STEEL, SOOT, 0.5), decor: true });
  }
  for (let y = 2; y < 12; y += 2.5) bar(sink, 'structureMetal', [-span / 2 + Math.max(0, 12 - y) * 0, y, z0 + 1.2], [span / 2, y, z0 + 1.2], 0.12, { ...girder });
  // ---- the debris on the apron's edge (dressing): burnt skin, a buckled door panel, a burnt-out pallet
  for (let k = 0; k < 14; k++) {
    const x = (rng() - 0.5) * (W - 8), z = z1 + 1 + rng() * Math.max(1, strip - 1.5), a = rng() * Math.PI * 2, s = 1.0 + rng() * 2.8;
    const lift = 0.06 + rng() * 0.5, c = Math.cos(a), sn = Math.sin(a);
    const p = (u: number, v: number, h: number): Vec3 => [x + u * c - v * sn, h, z + u * sn + v * c];
    const colour = lerp(rng() < 0.4 ? WHITE : GREY_BELLY, SOOT, 0.4 + rng() * 0.6);
    // a curved skin panel: two facets folded along its middle
    sink.quad('structureMetal', p(-s, s * 0.5, 0.05), p(0, s * 0.5, lift), p(0, -s * 0.5, lift), p(-s, -s * 0.5, 0.05), { colour, decor: true });
    sink.quad('structureMetal', p(0, s * 0.5, lift), p(s, s * 0.5, 0.05), p(s, -s * 0.5, 0.05), p(0, -s * 0.5, lift), { colour: shade(colour, 0.85), decor: true });
    sink.quad('structureMetal', p(-s, -s * 0.5, 0.04), p(0, -s * 0.5, lift - 0.02), p(0, s * 0.5, lift - 0.02), p(-s, s * 0.5, 0.04), { colour: SOOT, decor: true });
    sink.quad('structureMetal', p(0, -s * 0.5, lift - 0.02), p(s, -s * 0.5, 0.04), p(s, s * 0.5, 0.04), p(0, s * 0.5, lift - 0.02), { colour: SOOT, decor: true });
  }
  // the hangar door's fallen panel on the apron's edge
  const door: Vec3[] = [[-W * 0.22, 0.12, z1 + 1.2], [W * 0.06, 0.12, z1 + 1.2], [W * 0.06, 0.5, z1 + 6.5], [-W * 0.22, 0.5, z1 + 6.5]];
  sink.quad('structureMetal', door[3], door[2], door[1], door[0], { colour: lerp(STEEL, RUST, 0.5), decor: true });
  sink.quad('structureMetal', ...door.map((p): Vec3 => [p[0], p[1] - 0.04, p[2]]) as [Vec3, Vec3, Vec3, Vec3], { colour: SOOT, decor: true });
  // ash and scorch: dark aprons under the fuselage's broken end and the burnt panels (flat, dressing)
  for (const [x, z, r] of [[-12, mid - 6, 7], [2, z0 + 7, 6], [W / 2 - 12, mid + 4, 5]] as const) {
    const ring: Vec3[] = [];
    for (let i = 0; i < 10; i++) { const a = -i / 10 * Math.PI * 2, rr = r * (0.75 + 0.25 * rng()); ring.push([x + Math.cos(a) * rr, 0.04, z + Math.sin(a) * rr]); }
    sink.polygon('structureMetal', ring, { colour: lerp(ASH, SOOT, 0.6), decor: true });
  }
  // the wreckage lies on the floor it fell on (the plot falls 2 m to its back corner at Hostomel)
  // the painted skin and the hangar's steel: the metal tile's grey noise read as a speckled hull (kit.ts LIMEWASH_UV)
  return { parts: settleOnGround(smoothRender(finishWreck(sink), LIMEWASH_UV, ['structureMetal']), ctx.ground) };
};
