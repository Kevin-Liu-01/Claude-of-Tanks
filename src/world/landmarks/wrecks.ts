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
// Round 2 (2026-10-06; gauntlet wave 154: "an unburnt, airbrushed toy under a few undersized arches with no hangar floor
// beneath it", "the broken fuselage end … a smooth sealed egg shape with a flat white disc", "no burnt-out hangar around
// it"): the hangar is a shell round the whole wreck — its concrete floor under the plot with the fire's scar on it, the
// low concrete walls along its sides and back with the burnt cladding hanging over the back, seven blackened lattice
// ribs over the full span (four standing whole, three broken and hanging), purlins between them, sheeting left on the
// back bays and the fallen sheets strewn over the floor and the wreck; the fuselage slab-sided (a superellipse
// section), its skin in panels — the frame lines and the lap joints — the paint burnt off in patches to the bare
// aluminium and blackened where the fire ran, the nose rounded to its visor, the break open: the torn skin's ragged
// edge, the scorched inside, the ring frames and stringers standing out past it.
//
// The piece's frame: x across the plot, +z out of its open front toward the apron, y up; the origin is the centre of the
// plot and the apron strip together (plan.ts aircraftWreck). Collision comes from the fuselage, the tail, the wing
// panels, the arch footings and the walls (structural); the ribs, the engines, the sheets and the debris are dressing.
import * as THREE from 'three';
import { BUCKET_UV_DENSITY, PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, settleOnGround, LIMEWASH_UV, smoothRender } from './kit.ts';
import { drapedRect } from './grounds.ts';
import type { LandmarkBuilder } from './types.ts';

const WHITE = rgb(0xe9e9e6), GREY_BELLY = rgb(0xb9bcbf), BLUE = rgb(0x2c5aa0), YELLOW = rgb(0xf0c22c), SOOT = rgb(0x1c1a18), ASH = rgb(0x6a6560);
const RUST = rgb(0x6e4630), STEEL = rgb(0x5f6466), FAN = rgb(0x26282a), GLASS_BURNT = rgb(0x121314);
const BARE = rgb(0x8f9497), CHAR_STEEL = rgb(0x2c2622), SEAM = rgb(0x3a3d40);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Value noise in [0, 1) on a unit lattice (the paint's burn fronts and blisters). */
function noise2(x: number, y: number): number {
  const hash = (i: number, j: number) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

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
  /** the section's superellipse exponent (2: an ellipse; more: slab-sided) */
  pw?: number;
}

/** A section's point and outward normal at angle a (0 at the crown, a quarter turn at its +z side), local (y, z). */
function sectionPoint(sec: Section, a: number, j = 1): { y: number; z: number; ny: number; nz: number } {
  const p = sec.pw ?? 2, c = Math.cos(a), s = Math.sin(a);
  const e = 2 / p, f = 2 * (p - 1) / p;
  const y = Math.sign(c) * Math.pow(Math.abs(c), e) * sec.hh * j, z = Math.sign(s) * Math.pow(Math.abs(s), e) * sec.hw * j;
  let ny = Math.sign(c) * Math.pow(Math.abs(c), f) / sec.hh, nz = Math.sign(s) * Math.pow(Math.abs(s), f) / sec.hw;
  const l = Math.hypot(ny, nz) || 1;
  ny /= l; nz /= l;
  return { y, z, ny, nz };
}

/** The smooth hulls (fuselage, tail cone, wing panels, nacelles): built as their own geometries with analytic normals
 *  and per-vertex paint, handed to the part set after the sink's flat-shaded parts (finishWreck). */
let smooth: THREE.BufferGeometry[] = [];

/**
 * A lofted tube in a pose: sections along local x joined round, smooth-shaded (each vertex the section's own normal)
 * and painted per vertex by `paint` (station, angle round from the top, height), so the soot shades along the hull
 * instead of in facets. Ends close with a fan from the centre (a broken end's jagged ring stays star-shaped), or stay
 * open. `inside`: the tube's inner face (wound and lit inward), a broken hull's scorched interior. Structural unless
 * `decor` (the collision derivation welds it by its shared corners).
 */
function loft(_sink: PartSink, _bucket: RegionalBucket, P: Pose, sections: readonly Section[], n: number, paint: (s: number, a: number, y: number) => Rgb,
  opts: EmitOptions & { capStart?: Rgb | null; capEnd?: Rgb | null; rng?: () => number; inside?: boolean; arc?: readonly [number, number]; panels?: boolean } = {}): void {
  const { capStart = null, capEnd = null, inside = false, panels = false } = opts;
  const a0 = opts.arc?.[0] ?? 0, a1 = opts.arc?.[1] ?? Math.PI * 2, closed = !opts.arc;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const density = BUCKET_UV_DENSITY.structureMetal;
  const dir = (v: Vec3): Vec3 => [P.m[0] * v[0] + P.m[1] * v[1] + P.m[2] * v[2], P.m[3] * v[0] + P.m[4] * v[1] + P.m[5] * v[2], P.m[6] * v[0] + P.m[7] * v[1] + P.m[8] * v[2]];
  type V = { p: Vec3; n: Vec3; u: number; v: number; c: Rgb; s: number; a: number; y: number };
  const sign = inside ? -1 : 1;
  const rings: V[][] = sections.map((sec) => Array.from({ length: n + 1 }, (_, i): V => {
    // (a broken edge's jitter is a function of the station and the angle, so a torn skin's inside, drawn as its own tube,
    // meets its outside rim for rim)
    const a = a0 + (a1 - a0) * (closed ? (i % n) / n : i / n), j = sec.rag ? 1 - sec.rag * noise2(sec.s * 0.7 + 13.1, a * 3.3 + 0.5) : 1;
    const q = sectionPoint(sec, a, j);
    const p = at(P, [sec.s, sec.cy + q.y, (sec.cz ?? 0) + q.z]);
    return { p, n: dir([0, q.ny * sign, q.nz * sign]), u: sec.s * density, v: a * (sec.hw + sec.hh) * 0.5 * density, c: paint(sec.s, a, sec.cy + q.y),
      s: sec.s, a, y: sec.cy + q.y };
  }));
  // the seam's closing vertex repeats the first ring point (the same corner: a jagged ring keeps its first jitter)
  if (closed) for (const ring of rings) { ring[n] = { ...ring[n], p: ring[0].p, n: ring[0].n, c: ring[0].c }; }
  const push = (v: V) => { pos.push(...v.p); nor.push(...v.n); uv.push(v.u, v.v); col.push(...v.c); };
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < n; i++) {
      let a = rings[k][i], b = rings[k][i + 1], c = rings[k + 1][i + 1], d = rings[k + 1][i];
      if (panels) {
        // (`panels`: one paint to a skin panel, read at its middle — the burn, the soot and the bare metal change at the
        // panel's edges, as a burnt hull's skin does, instead of shading across it in an airbrushed gradient)
        const colour = paint((a.s + c.s) / 2, (a.a + b.a) / 2, (a.y + b.y + c.y + d.y) / 4);
        a = { ...a, c: colour }; b = { ...b, c: colour }; c = { ...c, c: colour }; d = { ...d, c: colour };
      }
      if (inside) { push(a); push(c); push(b); push(a); push(d); push(c); } else { push(a); push(b); push(c); push(a); push(c); push(d); }
    }
  }
  // (an inside tube's end cap faces back into the tube, toward its open end)
  const cap = (ring: V[], sec: Section, colour: Rgb, outerBack: boolean) => {
    const back = inside ? !outerBack : outerBack;
    const centre = at(P, [sec.s, sec.cy, sec.cz ?? 0]), axis = dir([back ? -1 : 1, 0, 0]);
    const C: V = { p: centre, n: axis, u: 0, v: 0, c: colour, s: sec.s, a: 0, y: sec.cy };
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

/**
 * The burnt skin's paint (round 2: "a smooth, airbrushed color gradient with no … soot/scorch"): the livery, burnt off
 * to the bare aluminium in blistered patches and blackened behind hard burn fronts, by the fire's reach `burn` (0-1).
 */
function burntSkin(base: Rgb, s: number, a: number, burn: number): Rgb {
  // (read a panel at a time, round 3: patches several panels across behind one burn front, not a checkerboard — the
  // fire's heat over the hull, blackened past the front, the paint burnt to bare metal along its edge, a few blistered
  // panels in the paint ahead of it)
  const n1 = noise2(s * 0.16 + 3.1, a * 1.1 + 1.7), n2 = noise2(s * 0.45 + 11.2, a * 2.3 + 5.3);
  const heat = burn + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.18;
  const soot = smoothstep(0.5, 0.56, heat), loss = smoothstep(0.38, 0.44, heat) * (1 - soot);
  const blister = smoothstep(0.74, 0.8, noise2(s * 0.7 + 21.3, a * 3.1 + 2.9)) * 0.5;
  return lerp(lerp(base, BARE, Math.max(loss, blister) * 0.85), SOOT, soot * 0.92);
}

/** An airfoil panel (a wing or stabiliser half, a fin) along local x from 0 to `span`: chord and thickness tapering,
 *  the leading edge swept back by `sweep` (m over the span), its root ragged where it broke. */
function panel(sink: PartSink, P: Pose, span: number, rootChord: number, tipChord: number, sweep: number, thick: number,
  paint: (s: number, a: number) => Rgb, opts: { rootRag?: number; rng?: () => number; decor?: boolean; n?: number; panels?: boolean } = {}): void {
  const steps = 8, sections: Section[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, chord = rootChord + (tipChord - rootChord) * t;
    sections.push({ s: span * t, cy: 0, cz: -(sweep * t + chord / 2), hw: chord / 2, hh: Math.max(0.12, chord * thick / 2), rag: k === 0 ? opts.rootRag : undefined });
  }
  loft(sink, 'structureMetal', P, sections, opts.n ?? 8, (s, a) => paint(s, a),
    { capStart: opts.rootRag ? SOOT : shade(WHITE, 0.8), capEnd: shade(WHITE, 0.85), rng: opts.rng, panels: opts.panels, ...(opts.decor ? { decor: true } : {}) });
}

/** A D-18T nacelle along local x (the intake at x = 0): the cowl's lip, the dark fan face set back in it, the cowl
 *  tapering to the exhaust and its cone; burnt by `soot`. */
function nacelle(sink: PartSink, P: Pose, soot: number, decor: boolean): void {
  const body = (s: number, a: number) => burntSkin(WHITE, s * 3, a, soot);
  loft(sink, 'structureMetal', P, [
    { s: 0, cy: 0, hw: 1.12, hh: 1.12 }, { s: 0.25, cy: 0, hw: 1.24, hh: 1.24 }, { s: 1.6, cy: 0, hw: 1.27, hh: 1.27 },
    { s: 3.6, cy: 0, hw: 1.1, hh: 1.1 }, { s: 4.8, cy: 0, hw: 0.82, hh: 0.82 },
  ], 14, (s, a) => body(s, a), { capEnd: SOOT, ...(decor ? { decor: true } : {}) });
  // the intake's inside down to the fan, and the fan face
  loft(sink, 'structureMetal', P, [{ s: 0, cy: 0, hw: 1.12, hh: 1.12 }, { s: 0.55, cy: 0, hw: 1.04, hh: 1.04 }], 14, () => shade(BARE, 0.55),
    { inside: true, decor: true, capEnd: FAN });
  loft(sink, 'structureMetal', P, [{ s: 4.8, cy: 0, hw: 0.55, hh: 0.55 }, { s: 5.6, cy: 0, hw: 0.06, hh: 0.06 }], 8, () => SOOT, { decor: true });
}

/** A ring frame of the broken hull, standing past the torn skin: a run of bars round the section from a0 to a1. */
function frameArc(sink: PartSink, P: Pose, sec: Section, a0: number, a1: number, width: number, colour: Rgb): void {
  const steps = Math.max(2, Math.round(Math.abs(a1 - a0) / 0.3));
  let prev: Vec3 | null = null;
  for (let k = 0; k <= steps; k++) {
    const q = sectionPoint(sec, a0 + (a1 - a0) * k / steps, 0.985);
    const p = at(P, [sec.s, sec.cy + q.y, (sec.cz ?? 0) + q.z]);
    if (prev) bar(sink, 'structureMetal', prev, p, width, { colour, decor: true });
    prev = p;
  }
}

/** A corrugated sheet lying folded (two facets along its length, both faces), `w` wide and `l` long, its fold lifted. */
function sheet(sink: PartSink, x: number, y: number, z: number, yaw: number, w: number, l: number, lift: number, tilt: number, colour: Rgb): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const p = (u: number, v: number, h: number): Vec3 => [x + u * c + v * s, y + h + v * tilt, z - u * s + v * c];
  const under = shade(colour, 0.55), side = shade(colour, 0.82);
  sink.quad('structureMetal', p(-w / 2, -l / 2, 0.03), p(-w / 2, l / 2, 0.03), p(0, l / 2, lift), p(0, -l / 2, lift), { colour, decor: true });
  sink.quad('structureMetal', p(0, -l / 2, lift), p(0, l / 2, lift), p(w / 2, l / 2, 0.03), p(w / 2, -l / 2, 0.03), { colour: side, decor: true });
  sink.quad('structureMetal', p(0, -l / 2, lift - 0.02), p(0, l / 2, lift - 0.02), p(-w / 2, l / 2, 0.01), p(-w / 2, -l / 2, 0.01), { colour: under, decor: true });
  sink.quad('structureMetal', p(w / 2, -l / 2, 0.01), p(w / 2, l / 2, 0.01), p(0, l / 2, lift - 0.02), p(0, -l / 2, lift - 0.02), { colour: under, decor: true });
}

/**
 * The An-225 Mriya in the ruin of its hangar (plan.ts aircraftWreck), round 3 (2026-10-07; gauntlet wave 202: the
 * forward fuselage "a smooth, bloated white dome with a pinched seam at its tip … an inflated sack", "assembled from
 * smooth, bloated primitives … a separate tail cone angled off to the right and a fin standing beside the outer arch",
 * the floor "reddish gravel sprouting fresh green grass", the ribs "perfectly regular, untorn arches" too small): one
 * burnt airframe at true scale lying where it burnt, inside the hangar at its true size.
 * - The airframe, nose to the apron: the slab-sided fuselage (7.3 m wide, 8.2 m deep) from the upswept tail cone to the
 *   nose, whose top line drops past the flight deck's windscreen to the visor's rounded tip, the visor's line round it;
 *   the middle third burnt through to its ring frames, stringers and cargo floor, the skins ending ragged either side;
 *   the wing's centre box burnt to its spars over it, both outer wings broken at the roots and lying on the slab, swept
 *   back, their tips on the floor; the six engines fallen from them, one rolled away; the 32.6 m stabiliser on the tail
 *   cone with the twin fins at its tips, the flag on them; the livery's cheat line and the skin painted a panel at a
 *   time — burnt to bare metal, sooted or still white.
 * - The hangar: a soot-black slab with the fire's ash and pools of melted alloy; the low walls, broken; arch ribs at the
 *   full span, torn — some broken with their ends hanging and their fallen lengths across the wreck, some buckled — the
 *   purlins between those standing; heaps of fallen roof sheeting and sheets strewn; the burnt cladding on the back wall.
 */
export const aircraftWreck: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rng = ctx.rng;
  // (the airframe is at true scale: the plot must hold its 88.4 m span and its 84 m length with the hangar round them)
  const W = Math.max(100, Number(ctx.params.width)), Dp = Math.max(92, Number(ctx.params.depth)), strip = Math.max(0, Number(ctx.params.strip));
  const z0 = -(Dp + strip + 2) / 2, z1 = z0 + Dp;
  const fall = -0.6 - ctx.groundFall;

  // ---- the slab: dark concrete over the plot and a metre past its front, the fire's soot, ash and melted alloy on it
  drapedRect(sink, 'structureMetal', undefined, { cx: 0, cz: (z0 + z1 + 1) / 2, hw: W / 2, hd: (z1 + 1 - z0) / 2 },
    { lift: 0.06, cell: 4, skirt: 0.4, emit: { colour: SLAB } });
  const blob = (bx: number, bz: number, r: number, colour: Rgb, y: number, seed: number) => {
    // (kept on the slab: inside the plot whatever its size)
    const x = Math.max(-W / 2 + r + 0.5, Math.min(W / 2 - r - 0.5, bx)), z = Math.max(z0 + r + 0.5, Math.min(z1 - r, bz));
    const ring: Vec3[] = [];
    for (let i = 0; i < 18; i++) {
      const a = -i / 18 * Math.PI * 2, rr = r * (0.55 + 0.45 * noise2(seed + i * 0.61, seed * 0.37));
      ring.push([x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]);
    }
    sink.polygon('structureMetal', ring, { colour, decor: true });
  };
  // the airframe's pose (its axis along +z, the tail near the back wall) and where its fire burnt
  const tailZ = z0 + 5.5, axisZ = tailZ + 42, axisX = -W * 0.03;
  for (let k = 0; k < 9; k++) {
    const t = k / 8, r = 9 + 9 * noise2(k * 1.7, 3.1);
    blob(axisX + (noise2(k, 0.4) - 0.5) * 34, axisZ - 26 + t * 40, r, lerp(SOOT, ASH, 0.15 * noise2(k, 9)), 0.075 + k * 0.001, k * 3.3);
  }
  for (let k = 0; k < 7; k++) blob(axisX + (noise2(k * 2.3, 1.9) - 0.5) * (W - 14), z0 + 4 + noise2(k * 1.1, 6.2) * (Dp - 8), 4 + 5 * noise2(k, 2.2), lerp(ASH, SOOT, 0.4), 0.072, 40 + k);
  // the pools of melted alloy where the wing roots and the engines burnt
  for (let k = 0; k < 11; k++) {
    const side = k % 2 ? 1 : -1, d = 5 + 22 * noise2(k * 1.3, 4.4);
    blob(axisX + side * d, axisZ + 2 - d * 0.55 + (noise2(k, 7.7) - 0.5) * 6, 0.9 + 2.2 * noise2(k * 3.1, 0.2), lerp(BARE, rgb(0xc8ccce), 0.5), 0.095, 80 + k);
  }

  // ---- the hangar's low walls: the back and the two sides, broken where the frame came down
  const wallH = 3.0, wallT = 0.4;
  sink.span('stone', -W / 2, fall, z0, W / 2, wallH, z0 + wallT);
  for (const sx of [-1, 1]) {
    let z = z0;
    while (z < z1 - 2) {
      const run = 8 + 14 * noise2(sx * 5.1 + z * 0.13, 2.7), gap = 3 + 6 * noise2(sx * 2.3 + z * 0.21, 8.1);
      const b = Math.min(z1, z + run), h = wallH - (noise2(z * 0.3, sx) > 0.6 ? 1.2 : 0);
      sink.span('stone', sx * W / 2 - (sx > 0 ? wallT : 0), fall, z, sx * W / 2 + (sx > 0 ? 0 : wallT), h, b);
      sink.span('stone', sx * W / 2 - (sx > 0 ? wallT : 0) + (sx > 0 ? -0.05 : 0), h - 0.02, b - 0.02, sx * W / 2 + (sx > 0 ? 0 : wallT) + (sx > 0 ? 0 : 0.05), h + 0.4, b + 0.02, { decor: true });
      z = b + gap;
    }
  }

  // ---- the arch ribs at the full span: lattice girders, torn — broken with their ends hanging and the fallen lengths
  // across the wreck, or buckled — on their concrete footings
  const span = W - 2.6, rise = Math.min(30, span * 0.27), R = (span * span / 4 + rise * rise) / (2 * rise), cyArc = rise - R + 1.5;
  const half = Math.asin(Math.min(1, span / 2 / R));
  const arcAt = (t: number): [number, number] => { const a = Math.PI / 2 + half - 2 * half * t; return [Math.cos(a) * R, cyArc + Math.sin(a) * R]; };
  const nRibs = Math.max(5, Math.round((Dp - 3) / 9) + 1);
  const ribZ = Array.from({ length: nRibs }, (_, k) => z0 + 1.5 + k * ((Dp - 3) / (nRibs - 1)));
  const depthRib = 2.4;
  const girder = (k: number) => ({ colour: lerp(CHAR_STEEL, RUST, 0.12 + 0.3 * noise2(k * 1.7, 0.4)), decor: true as const });
  // (each rib: the share of its arc standing from each footing, a buckle — its centre, depth and sideways throw — and
  // how its torn ends hang; over the airframe's fire most are down)
  type RibState = { left: number; right: number; buckleAt: number; buckle: number; throw: number };
  const ribState = (k: number): RibState => {
    const overFire = Math.abs(ribZ[k] - (axisZ - 4)) < 30, n = noise2(k * 2.9, 1.3), m = noise2(k * 1.1, 5.7);
    if (k === 0 || k === nRibs - 1) return { left: 1, right: 0, buckleAt: 0.3 + 0.4 * n, buckle: 1.5 + 2 * m, throw: 0.4 };
    if (overFire && n < 0.72) return { left: 0.18 + 0.32 * n, right: 0.15 + 0.35 * m, buckleAt: 0.2, buckle: 0.8, throw: 0.6 };
    return { left: 1, right: 0, buckleAt: 0.25 + 0.5 * m, buckle: 3 + 4 * n, throw: 1.2 * (n - 0.5) };
  };
  const steps = 26;
  ribZ.forEach((z, r) => {
    const st = ribState(r);
    for (const sx of [-1, 1]) sink.span('stone', sx * span / 2 - 1.2, fall, z - 1.0, sx * span / 2 + 1.2, 1.3, z + 1.0);
    // the rib's points: the arc, dented by its buckle (down and thrown sideways round its centre), and, past a break,
    // torn down toward the floor
    const bent = (t: number, end: number | null): Vec3 => {
      const [x, y] = arcAt(t), d = Math.exp(-Math.pow((t - st.buckleAt) / 0.12, 2));
      let yy = y - st.buckle * d, zz = z + st.throw * d;
      if (end !== null) { const k = Math.max(0, Math.abs(t - end) < 0.12 ? 1 - Math.abs(t - end) / 0.12 : 0); yy -= k * k * 4.5; zz += k * 1.6; }
      return [x, yy, zz];
    };
    const draw = (t0: number, t1: number, end: number | null) => {
      const n = Math.max(2, Math.round((t1 - t0) * steps));
      for (let k = 0; k < n; k++) {
        const ta = t0 + (t1 - t0) * k / n, tb = t0 + (t1 - t0) * (k + 1) / n;
        const a = bent(ta, end), b = bent(tb, end);
        bar(sink, 'structureMetal', [a[0], a[1] + depthRib, a[2]], [b[0], b[1] + depthRib, b[2]], 0.4, girder(r));
        bar(sink, 'structureMetal', a, b, 0.4, girder(r));
        bar(sink, 'structureMetal', a, [b[0], b[1] + depthRib, b[2]], 0.18, { ...girder(r), fine: true });
      }
    };
    if (st.left >= 1) { draw(0, 1, null); return; }
    draw(0, st.left, st.left);
    draw(1 - st.right, 1, 1 - st.right);
    // the fallen length between the breaks: across the wreck from one torn end to the floor, kinked
    const [xa, ya] = arcAt(st.left), [xb] = arcAt(1 - st.right);
    const kx = xa + (xb - xa) * (0.35 + 0.3 * noise2(r, 3.3)), ky = 3 + 6 * noise2(r * 2.1, 0.9), kz = z + (r % 2 ? 3.5 : -3.5);
    bar(sink, 'structureMetal', [xa, Math.max(2, ya - 7), z + 1.2], [kx, ky, kz], 0.6, girder(r));
    bar(sink, 'structureMetal', [kx, ky, kz], [xb - (xb - xa) * 0.1, 0.4, kz + (r % 2 ? 2 : -2)], 0.6, girder(r));
    bar(sink, 'structureMetal', [xa, Math.max(2, ya - 7) + depthRib * 0.7, z + 1.2], [kx, ky + depthRib * 0.7, kz], 0.4, girder(r));
  });
  // purlins between neighbouring standing ribs, some sagging
  const stands = (r: number, t: number) => { const s = ribState(r); return s.left >= 1 || t <= s.left - 0.05 || t >= 1 - s.right + 0.05; };
  for (let r = 0; r + 1 < ribZ.length; r++) {
    for (const t of [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92]) {
      if (!stands(r, t) || !stands(r + 1, t) || noise2(r * 3.3, t * 9.1) < 0.3) continue;
      const [x, y] = arcAt(t), sag = noise2(r * 1.9, t * 5.7) > 0.7 ? 1.4 : 0.1;
      const m: Vec3 = [x, y + depthRib - sag, (ribZ[r] + ribZ[r + 1]) / 2];
      bar(sink, 'structureMetal', [x, y + depthRib, ribZ[r]], m, 0.22, girder(r));
      bar(sink, 'structureMetal', m, [x, y + depthRib, ribZ[r + 1]], 0.22, girder(r));
    }
  }
  // the burnt cladding still on the back wall's girts, torn
  for (let x = -span / 2 + 2; x < span / 2 - 2; x += 2.2) {
    const n = noise2(x * 0.37, 7.7);
    if (n < 0.35) continue;
    const top = arcAt(0.5 - x / span * 0.98)[1] * 0.85, h1 = Math.min(top, wallH + 1.5 + n * n * 9), skew = (noise2(x * 1.3, 3.1) - 0.5) * 1.4;
    const colour = lerp(lerp(STEEL, RUST, noise2(x, 1)), SOOT, 0.35 + 0.5 * noise2(x * 0.9, 2.2)), zc = z0 + wallT / 2;
    sink.quad('structureMetal', [x, wallH, zc + 0.01], [x + 2.1, wallH, zc + 0.01], [x + 2.1 + skew, h1, zc + 0.01], [x + skew, h1, zc + 0.01], { colour, decor: true });
    sink.quad('structureMetal', [x + 2.1, wallH, zc - 0.01], [x, wallH, zc - 0.01], [x + skew, h1, zc - 0.01], [x + 2.1 + skew, h1, zc - 0.01], { colour: SOOT, decor: true });
  }
  // the fallen roof: heaps of sheeting where bays came down, and sheets strewn over the slab and the wreck
  const heaps: Array<[number, number]> = [];
  for (let k = 0; k < 7; k++) heaps.push([(noise2(k * 1.9, 2.1) - 0.5) * (W - 16), z0 + 6 + noise2(k * 0.83, 5.3) * (Dp - 12)]);
  heaps.forEach(([hx, hz], h) => {
    const n = 7 + Math.round(6 * noise2(h, 4.4));
    for (let k = 0; k < n; k++) {
      const colour = lerp(lerp(STEEL, RUST, noise2(h * 7 + k, 1.1)), SOOT, 0.3 + 0.6 * noise2(k * 0.41, h * 8.3));
      sheet(sink, hx + (noise2(h + k * 0.7, 1) - 0.5) * 5, 0.06 + k * 0.16, hz + (noise2(h + k * 0.9, 2) - 0.5) * 5,
        noise2(h * 3.7 + k, 2.5) * Math.PI * 2, 1.05, 3.0 + 1.5 * noise2(k, h), 0.15 + 0.4 * noise2(k * 5.1, h), 0.1 * (noise2(k, h * 3) - 0.5), colour);
    }
  });
  for (let k = 0; k < 40; k++) {
    const x = (noise2(k * 1.31, 0.7) - 0.5) * (W - 6), z = z0 + 2 + noise2(k * 0.73, 4.9) * (Dp - 3);
    const colour = lerp(lerp(STEEL, RUST, noise2(k * 2.9, 1.1)), SOOT, 0.25 + 0.6 * noise2(k * 0.41, 8.3));
    sheet(sink, x, 0.06, z, noise2(k * 3.7, 2.5) * Math.PI * 2, 1.05, 2.6 + 1.2 * noise2(k, 6), 0.12 + 0.3 * noise2(k * 5.1, 1.9), 0, colour);
  }

  // ---- the airframe: one burnt An-225, nose to the apron, on its belly (the gear collapsed), listing a little
  const fuse = pose(-Math.PI / 2 - 0.035, 0, 0.02, [axisX, 0, axisZ]);
  // the fuselage's sections: [station, top, bottom, half width] — the upswept tail cone, the body, the flight deck's
  // windscreen and the visor's nose
  const profile: Array<[number, number, number, number]> = [
    [-42.0, 7.85, 6.35, 0.5], [-41.4, 7.95, 5.6, 1.05], [-40.0, 8.05, 4.6, 1.75], [-37.8, 8.15, 3.45, 2.45], [-35.0, 8.2, 2.3, 3.0],
    [-32.0, 8.25, 1.2, 3.4], [-29.0, 8.25, 0.35, 3.62], [-26.0, 8.25, 0.06, 3.65],
  ];
  for (let s = -24; s <= 30.01; s += 1.5) profile.push([s, 8.25, 0.06, 3.65]);
  profile.push([31.5, 8.2, 0.08, 3.62], [33.0, 8.05, 0.14, 3.55], [34.5, 7.75, 0.24, 3.42], [36.0, 7.3, 0.38, 3.2], [37.5, 6.7, 0.56, 2.9],
    [38.8, 6.0, 0.8, 2.52], [40.0, 5.25, 1.08, 2.05], [41.0, 4.45, 1.42, 1.5], [41.7, 3.75, 1.8, 0.95], [42.1, 3.15, 2.2, 0.42], [42.25, 2.85, 2.45, 0.12]);
  const toSection = ([s, top, bottom, hw]: [number, number, number, number], extra: Partial<Section> = {}): Section =>
    ({ s, cy: (top + bottom) / 2, hh: Math.max(0.08, (top - bottom) / 2), hw, pw: s > 38 || s < -38 ? 2.2 : 2.7, ...extra });
  const BURN0 = -13, BURN1 = 12;
  // the fire: black over the burnt-through middle, scorched out from it, its smoke sooting the crown fore and aft
  const burn = (s: number, a: number) => Math.max(smoothstep(BURN1 + 10, BURN1 - 1, s) * smoothstep(BURN0 - 10, BURN0 + 1, s),
    0.3 + 0.45 * Math.max(0, Math.cos(a)) * smoothstep(42, 18, Math.abs(s)));
  const skinPaint = (s: number, a: number, y: number) => {
    const t = (y - 4.15) / 4.1;
    return burntSkin(t < -0.62 ? GREY_BELLY : WHITE, s, a, burn(s, a));
  };
  const fore = profile.filter(([s]) => s >= BURN1).map((p, i) => toSection(p, i === 0 ? { rag: 0.14 } : {}));
  const aft = profile.filter(([s]) => s <= BURN0).map((p, i, arr) => toSection(p, i === arr.length - 1 ? { rag: 0.14 } : {}));
  loft(sink, 'structureMetal', fuse, fore, 32, skinPaint, { capEnd: shade(WHITE, 0.6), rng, panels: true });
  loft(sink, 'structureMetal', fuse, aft, 32, skinPaint, { capStart: shade(WHITE, 0.7), rng, panels: true });
  // the torn skins' scorched insides at the break
  const inner = (x: Section): Section => ({ ...x, hw: x.hw * 0.985, hh: x.hh * 0.985 });
  // (each closed a few metres in by a scorched bulkhead: no view through the hull from its open end)
  loft(sink, 'structureMetal', fuse, fore.slice(0, 4).map(inner), 32, () => SOOT, { inside: true, decor: true, capEnd: SOOT });
  loft(sink, 'structureMetal', fuse, aft.slice(-4).map(inner), 32, () => SOOT, { inside: true, decor: true, capStart: SOOT });
  // the livery's cheat line along both sides, fore and aft: the blue over the yellow, hard-edged, burnt with the skin
  {
    const band = (t: number, pw: number) => Math.acos(Math.max(-1, Math.min(1, -Math.sign(t) * Math.pow(Math.abs(t), pw / 2))));
    for (const run of [fore.filter((x) => x.s <= 36), aft.filter((x) => x.s >= -30)]) {
      const lifted = run.map((x) => ({ ...x, hw: x.hw * 1.004, hh: x.hh * 1.004, rag: undefined }));
      for (const side of [1, -1]) for (const [t0, t1, colour] of [[0.08, 0.26, BLUE], [0.26, 0.4, YELLOW]] as const) {
        const a0 = band(t0, 2.7) * side, a1 = band(t1, 2.7) * side;
        loft(sink, 'structureMetal', fuse, lifted, 3, (s, a) => burntSkin(colour, s, a, burn(s, a)), { decor: true, arc: side > 0 ? [a0, a1] : [a1, a0], panels: true });
      }
    }
  }
  // the flight deck's windscreen (burnt-out glazing) and the visor's line round the nose behind it
  {
    const at6 = (s: number) => toSection(profile.reduce((b, x) => (Math.abs(x[0] - s) < Math.abs(b[0] - s) ? x : b)));
    const glaze = [34.4, 35.2, 36.0, 36.8, 37.5].map((s) => ({ ...at6(s), s, hw: at6(s).hw * 1.008, hh: at6(s).hh * 1.008 }));
    loft(sink, 'structureMetal', fuse, glaze, 6, () => GLASS_BURNT, { decor: true, arc: [-0.95, 0.95] });
    const v = at6(33.6);
    loft(sink, 'structureMetal', fuse, [{ ...v, s: 33.6, hw: v.hw * 1.008, hh: v.hh * 1.008 }, { ...v, s: 33.75, hw: v.hw * 1.008, hh: v.hh * 1.008 }], 32,
      () => SEAM, { decor: true, fine: true });
  }
  // the burnt-through middle: the ring frames, a few broken, the stringers, the cargo floor (the solid a hull meets)
  {
    const body: Section = { s: 0, cy: 4.155, hw: 3.65, hh: 4.095, pw: 2.7 };
    for (let s = BURN0 + 0.8; s < BURN1 - 0.4; s += 1.5) {
      const gap = noise2(s * 0.7, 2.2), a0 = -Math.PI + (gap > 0.62 ? 0.9 : 0.05), a1 = Math.PI - (gap < 0.2 ? 1.1 : 0.05);
      frameArc(sink, fuse, { ...body, s }, a0, a1, 0.16, lerp(CHAR_STEEL, BARE, 0.25 * noise2(s, 4.1)));
    }
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI + (i + 0.5) * (Math.PI * 2 / 14), cut = noise2(i * 2.7, 6.1);
      const q = sectionPoint(body, a, 0.99), sEnd = cut > 0.55 ? BURN0 + (BURN1 - BURN0) * (0.3 + 0.4 * cut) : BURN1 + 0.2;
      bar(sink, 'structureMetal', at(fuse, [BURN0 - 0.2, body.cy + q.y, q.z]), at(fuse, [sEnd, body.cy + q.y - (cut > 0.55 ? 0.6 : 0), q.z]), 0.1,
        { colour: CHAR_STEEL, decor: true });
    }
    // the cargo floor and the crushed lower hull under it
    const fa = at(fuse, [BURN0, 0, -3.2]), fb = at(fuse, [BURN1, 0, 3.2]);
    sink.span('structureMetal', Math.min(fa[0], fb[0]), fall, Math.min(fa[2], fb[2]), Math.max(fa[0], fb[0]), 1.35, Math.max(fa[2], fb[2]), { colour: lerp(SOOT, CHAR_STEEL, 0.4) });
  }
  // the wing's centre box over the burnt middle: its spars and ribs burnt bare, the roots' stubs torn
  for (const s of [5.2, 1.8, -1.6, -5.0]) {
    bar(sink, 'structureMetal', at(fuse, [s, 8.55, -4.2]), at(fuse, [s, 8.55, 4.2]), 0.32, { colour: CHAR_STEEL, decor: true });
  }
  for (const z of [-3.6, -1.2, 1.2, 3.6]) bar(sink, 'structureMetal', at(fuse, [5.4, 8.55, z]), at(fuse, [-5.4, 8.55, z]), 0.22, { colour: CHAR_STEEL, decor: true });
  // the outer wings, broken at the roots: each lies on the slab from the hull's side, swept back, its tip on the floor
  const wingSpan = 40.5, wingRoot = 12.6, wingTip = 4.6, wingSweep = 22.5;
  for (const side of [1, -1]) {
    // (the right half mirrored: turned over end for end, its paint read from its own top)
    const rootX = axisX + side * 4.25, rootY = 2.7, rootZ = axisZ + 5.5, droop = Math.atan2(rootY - 0.75, wingSpan);
    const P = side > 0 ? pose(0.03, 0, -droop, [rootX, rootY, rootZ]) : pose(Math.PI - 0.03, Math.PI, droop, [rootX, rootY, rootZ]);
    const wingPaint = (s: number, a: number) => burntSkin((side > 0 ? Math.cos(a) : -Math.cos(a)) > 0 ? WHITE : GREY_BELLY, s + side * 50, a, Math.max(0.25, 0.9 - s / 30));
    panel(sink, P, wingSpan, wingRoot, wingTip, wingSweep, 0.11, wingPaint, { rootRag: 0.2, rng, n: 10, panels: true });
    // its engines fallen from it: three on the slab before its leading edge, the outer one rolled away
    for (const [k, d] of [[0, 8.5], [1, 16.5], [2, 24.5]] as const) {
      const le = at(P, [d, 0, -(wingSweep * d / wingSpan)]);
      const away = k === 2 && side < 0;
      const yaw = -Math.PI / 2 + (noise2(k * 3.1, side) - 0.5) * 0.6 + (away ? 1.2 : 0);
      nacelle(sink, pose(yaw, 0, (noise2(k, side * 2) - 0.5) * 0.5, [le[0] + (away ? side * 7 : side * 0.6), 1.25, le[2] + 3.4 + (away ? 5 : 0)]), 0.35 + 0.5 * noise2(k, side), true);
    }
  }
  // the tail: the stabiliser across the tail cone's top, the twin fins at its tips, the flag on their outer faces
  {
    const sStab = -37.6, yStab = 8.7;
    for (const side of [1, -1]) {
      const root = at(fuse, [sStab, yStab, 0]);
      const P = side > 0 ? pose(-0.035, 0, 0.012, [root[0], root[1], root[2] + 3.6]) : pose(Math.PI - 0.035, Math.PI, -0.012, [root[0], root[1], root[2] + 3.6]);
      panel(sink, P, 16.3, 7.4, 4.6, 4.6, 0.1, (s, a) => burntSkin(WHITE, s - 60, a, 0.28), { n: 8, decor: true, panels: true });
      // the fin at its tip: up from the stabiliser, swept back, the flag's blue over its yellow on the outer face
      const tip = at(P, [16.3, 0, 0]);
      const F = pose(-0.035, 0, Math.PI / 2, [tip[0], tip[1], tip[2] - 4.6 + 0.4]);
      panel(sink, F, 9.6, 6.8, 4.0, 4.2, 0.09, (s, a) => {
        const outer = Math.sin(a) * side > 0.2, flag = outer ? (s > 4.6 ? BLUE : s > 1.2 ? YELLOW : WHITE) : WHITE;
        return burntSkin(flag, s - 80, a, 0.22);
      }, { n: 8, decor: true, panels: true });
    }
  }

  // ---- the debris on the apron's edge (dressing, where the plot keeps a strip before its doors): burnt skin panels
  for (let k = 0; strip >= 4 && k < 14; k++) {
    const x = (rng() - 0.5) * (W - 8), u = rng(), a = rng() * Math.PI * 2, s = 1.0 + rng() * 2.8;
    const z = z1 + 1 + u * Math.max(0.5, strip - 1.5 - s * 1.2);
    const lift = 0.06 + rng() * 0.5, c = Math.cos(a), sn = Math.sin(a);
    const p = (u: number, v: number, h: number): Vec3 => [x + u * c - v * sn, h, z + u * sn + v * c];
    const colour = lerp(rng() < 0.4 ? WHITE : GREY_BELLY, SOOT, 0.4 + rng() * 0.6);
    sink.quad('structureMetal', p(-s, s * 0.5, 0.05), p(0, s * 0.5, lift), p(0, -s * 0.5, lift), p(-s, -s * 0.5, 0.05), { colour, decor: true });
    sink.quad('structureMetal', p(0, s * 0.5, lift), p(s, s * 0.5, 0.05), p(s, -s * 0.5, 0.05), p(0, -s * 0.5, lift), { colour: shade(colour, 0.85), decor: true });
    sink.quad('structureMetal', p(-s, -s * 0.5, 0.04), p(0, -s * 0.5, lift - 0.02), p(0, s * 0.5, lift - 0.02), p(-s, s * 0.5, 0.04), { colour: SOOT, decor: true });
    sink.quad('structureMetal', p(0, -s * 0.5, lift - 0.02), p(s, -s * 0.5, 0.04), p(s, s * 0.5, 0.04), p(0, s * 0.5, lift - 0.02), { colour: SOOT, decor: true });
  }
  return { parts: settleOnGround(smoothRender(finishWreck(sink), LIMEWASH_UV, ['structureMetal']), ctx.ground), tints: { plaster2: [0.7, 0.7, 0.68] } };
};
const SLAB = rgb(0x2e2b28);
