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
  const n1 = noise2(s * 0.42 + 3.1, a * 1.9 + 1.7), n2 = noise2(s * 1.3 + 11.2, a * 4.1 + 5.3);
  const loss = smoothstep(0.6, 0.66, n1 * 0.62 + n2 * 0.38 + burn * 0.22);
  const soot = smoothstep(0.42, 0.5, burn + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.2);
  return lerp(lerp(base, BARE, loss * 0.85), SOOT, soot * 0.94);
}

/** An airfoil panel (a wing or stabiliser half, a fin) along local x from 0 to `span`: chord and thickness tapering,
 *  the leading edge swept back by `sweep` (m over the span), its root ragged where it broke. */
function panel(sink: PartSink, P: Pose, span: number, rootChord: number, tipChord: number, sweep: number, thick: number,
  paint: (s: number, a: number) => Rgb, opts: { rootRag?: number; rng?: () => number; decor?: boolean; n?: number } = {}): void {
  const steps = 8, sections: Section[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, chord = rootChord + (tipChord - rootChord) * t;
    sections.push({ s: span * t, cy: 0, cz: -(sweep * t + chord / 2), hw: chord / 2, hh: Math.max(0.12, chord * thick / 2), rag: k === 0 ? opts.rootRag : undefined });
  }
  loft(sink, 'structureMetal', P, sections, opts.n ?? 8, (s, a) => paint(s, a),
    { capStart: opts.rootRag ? SOOT : shade(WHITE, 0.8), capEnd: shade(WHITE, 0.85), rng: opts.rng, ...(opts.decor ? { decor: true } : {}) });
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
 * The An-225 Mriya in the ruin of its hangar (plan.ts aircraftWreck).
 */
export const aircraftWreck: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rng = ctx.rng;
  const W = Math.max(40, Number(ctx.params.width)), Dp = Math.max(28, Number(ctx.params.depth)), strip = Math.max(0, Number(ctx.params.strip));
  // the plot's z range in the piece's frame (the strip in front of it, toward +z)
  const z0 = -(Dp + strip + 2) / 2, z1 = z0 + Dp, mid = (z0 + z1) / 2;
  const fall = -0.6 - ctx.groundFall;

  // ---- the hangar's floor: the concrete slab under the whole plot and a metre past its front, the fire's scar on it
  drapedRect(sink, 'plaster2', undefined, { cx: 0, cz: (z0 + z1 + 1) / 2, hw: W / 2, hd: (z1 + 1 - z0) / 2 }, { lift: 0.06, cell: 2, skirt: 0.4 });
  const scar = (x: number, z: number, r: number, colour: Rgb, y: number) => {
    const ring: Vec3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = -i / 16 * Math.PI * 2, rr = r * (0.62 + 0.38 * noise2(x * 0.1 + i * 0.7, z * 0.1));
      ring.push([x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]);
    }
    sink.polygon('structureMetal', ring, { colour, decor: true });
  };
  scar(-8, mid - 2, 15, lerp(ASH, SOOT, 0.7), 0.075);
  scar(-14, mid - 5, 8, SOOT, 0.085);
  scar(4, z0 + 9.5, 8.5, lerp(ASH, SOOT, 0.55), 0.08);
  scar(W / 2 - 13, mid + 4, 7, lerp(ASH, SOOT, 0.6), 0.08);
  scar(-W / 2 + 9, z1 - 4, 6, lerp(ASH, SOOT, 0.45), 0.078);

  // ---- the hangar's low concrete walls: the back, and the two sides broken where the fire brought the frame down
  const wallH = 2.2, wallT = 0.32;
  sink.span('stone', -W / 2, fall, z0, W / 2, wallH, z0 + wallT);
  for (const sx of [-1, 1]) {
    const runs: Array<[number, number]> = sx < 0 ? [[z0, z0 + 13], [z0 + 19, z0 + 27]] : [[z0, z0 + 8], [z0 + 14, z0 + 24], [z0 + 30, z1]];
    for (const [a, b] of runs) {
      const h = wallH - (b > z0 + 25 ? 0.8 : 0);
      sink.span('stone', sx * W / 2 - (sx > 0 ? wallT : 0), fall, a, sx * W / 2 + (sx > 0 ? 0 : wallT), h, b);
      // the broken end of a run: its concrete crumbled down to the reinforcement
      sink.span('stone', sx * W / 2 - (sx > 0 ? wallT : 0) - 0.05, h - 0.02, b - 0.02, sx * W / 2 + (sx > 0 ? 0 : wallT) + 0.05, h + 0.35, b + 0.02, { decor: true });
    }
  }

  // ---- the forward fuselage: its axis turned 31° from x so the nose (+x) points out toward the apron, broken behind the wing
  const FY = -0.55, FO: Vec3 = [-6, 0, mid + 7.5];
  const fuse = pose(FY, 0, 0.03, FO);
  // its belly on the floor (the gear collapsed under it); a slab-sided section (round 2: "egg-shaped", "bloated")
  const keel = 0.04, H = 4.1, Wf = 3.65, PW = 2.7;
  const stations: Section[] = [];
  for (let s = -21; s <= 8.01; s += 1.0) stations.push({ s, cy: keel + H, hw: Wf, hh: H, pw: PW });
  stations[0] = { ...stations[0], rag: 0.16 };
  // the nose rounds down to the visor's tip
  for (const [s, k, kh] of [[9.4, 0.985, 0.98], [10.8, 0.95, 0.94], [12.0, 0.88, 0.86], [13.1, 0.78, 0.76], [14.1, 0.64, 0.63], [14.9, 0.47, 0.48],
    [15.5, 0.3, 0.32], [15.9, 0.13, 0.15], [16.05, 0.03, 0.04]] as const) {
    stations.push({ s, cy: keel + H * (0.62 + 0.38 * kh), hw: Wf * k, hh: H * kh, pw: 2 + (PW - 2) * k });
  }
  // the fire: black from the wing box back to the break, scorched over the flight deck, its smoke along the crown
  // (and the smoke that rolled forward over the whole hull from the fire behind the wing: its crown sooted to the nose)
  const burn = (s: number, a: number) => Math.max(smoothstep(4, -12, s), 0.62 * Math.max(0, 1 - Math.abs(s - 8.5) / 3.8),
    0.34 + 0.4 * Math.max(0, Math.cos(a)) * smoothstep(22, 6, s));
  const skin = (s: number, a: number, y: number) => burntSkin(livery(y, keel + H, H), s, a, burn(s, a));
  const base = (s: number, a: number, y: number) => burntSkin((y - keel - H) / H < -0.62 ? GREY_BELLY : WHITE, s, a, burn(s, a));
  loft(sink, 'structureMetal', fuse, stations, 32, base, { capEnd: shade(BARE, 0.7), rng, panels: true });
  // the livery's blue and yellow bands, hard-edged strips just proud of the skin (a vertex-painted band zig-zagged across
  // the hull's triangles), burnt with it
  {
    const band = (t: number) => Math.acos(-Math.pow(t, PW / 2)); // the angle from the crown where the section's height is -t
    const run = stations.filter((x) => x.s <= 12).map((x) => ({ ...x, hw: x.hw * 1.004, hh: x.hh * 1.004, rag: undefined }));
    for (const side of [1, -1]) {
      for (const [t0, t1, colour] of [[0.18, 0.42, BLUE], [0.42, 0.62, YELLOW]] as const) {
        const a0 = band(t0) * side, a1 = band(t1) * side;
        loft(sink, 'structureMetal', fuse, run, 3, (s, a) => burntSkin(colour, s, a, burn(s, a)),
          { decor: true, arc: side > 0 ? [a0, a1] : [a1, a0], panels: true });
      }
    }
  }
  // its panels: the frame lines round it and the lap joints along it, a line darker than the skin they run on
  for (let s = -18; s <= 11; s += 2.4) {
    const sec = stations.reduce((best, x) => (Math.abs(x.s - s) < Math.abs(best.s - s) ? x : best));
    loft(sink, 'structureMetal', fuse, [{ ...sec, s, hw: sec.hw * 1.006, hh: sec.hh * 1.006, rag: undefined }, { ...sec, s: s + 0.07, hw: sec.hw * 1.006, hh: sec.hh * 1.006, rag: undefined }],
      24, (ss, a, y) => lerp(skin(ss, a, y), SEAM, 0.55), { decor: true, fine: true });
  }
  for (const a of [Math.PI * 0.32, Math.PI * 0.68, -Math.PI * 0.32, -Math.PI * 0.68]) {
    const run = stations.filter((x) => x.s <= 10.8);
    loft(sink, 'structureMetal', fuse, run.map((x) => ({ ...x, hw: x.hw * 1.006, hh: x.hh * 1.006, rag: undefined })), 1,
      (s, aa, y) => lerp(skin(s, aa, y), SEAM, 0.5), { decor: true, fine: true, arc: [a - 0.012, a + 0.012] });
  }
  // the break: the skin's inside scorched, the ring frames and the stringers standing out past its torn edge
  loft(sink, 'structureMetal', fuse, [stations[0], ...stations.slice(1, 7)], 32, (s) => lerp(SOOT, CHAR_STEEL, smoothstep(-21, -15, s) * 0.5),
    { inside: true, decor: true, capEnd: SOOT });
  const frame = (s: number): Section => ({ s, cy: keel + H, hw: Wf, hh: H, pw: PW });
  frameArc(sink, fuse, frame(-21.9), -2.5, 2.2, 0.14, CHAR_STEEL);
  frameArc(sink, fuse, frame(-23.0), -1.3, 1.6, 0.13, lerp(CHAR_STEEL, RUST, 0.3));
  frameArc(sink, fuse, frame(-24.1), -0.2, 1.1, 0.12, CHAR_STEEL);
  for (const a of [-2.2, -1.5, -0.7, 0.1, 0.9, 1.7, 2.1]) {
    const reach = -21 - 1.4 - 2.2 * noise2(a * 3.1, 1.3);
    const q = sectionPoint(frame(0), a, 0.99);
    bar(sink, 'structureMetal', at(fuse, [-20.9, keel + H + q.y, q.z]), at(fuse, [reach, keel + H + q.y * 0.97 - 0.15, q.z * 0.97]), 0.07, { colour: CHAR_STEEL, decor: true });
  }
  // the flight deck's hump over the nose and its burnt-out windscreen
  loft(sink, 'structureMetal', fuse, [
    { s: 3, cy: keel + 2 * H - 0.4, hw: 1.9, hh: 0.4 }, { s: 6, cy: keel + 2 * H - 0.1, hw: 2.1, hh: 0.62 },
    { s: 10.4, cy: keel + 2 * H - 0.35, hw: 1.9, hh: 0.62 }, { s: 12.2, cy: keel + 2 * H - 0.9, hw: 1.4, hh: 0.3 },
  ], 12, (s, a) => burntSkin(WHITE, s, a, 0.55 + 0.4 * smoothstep(4, 11, s)), { capStart: SOOT, panels: true });
  for (const side of [-1, 1]) {
    const q = (s: number, y: number, z: number) => at(fuse, [s, y, side * z]);
    const pts = side > 0 ? [q(10.5, keel + 2 * H - 0.55, 0.3), q(10.5, keel + 2 * H - 0.55, 1.5), q(11.6, keel + 2 * H - 1.05, 1.15), q(11.6, keel + 2 * H - 1.05, 0.3)]
      : [q(10.5, keel + 2 * H - 0.55, 1.5), q(10.5, keel + 2 * H - 0.55, 0.3), q(11.6, keel + 2 * H - 1.05, 0.3), q(11.6, keel + 2 * H - 1.05, 1.15)];
    // the burnt-out panes, both faces (a hull's curve leaves either one toward the eye)
    sink.polygon('structureMetal', pts, { colour: GLASS_BURNT, decor: true });
    sink.polygon('structureMetal', [...pts].reverse(), { colour: GLASS_BURNT, decor: true });
  }
  // the nose visor's hinge line round the nose
  {
    const sec = stations.find((x) => x.s === 10.8)!;
    loft(sink, 'structureMetal', fuse, [{ ...sec, hw: sec.hw * 1.008, hh: sec.hh * 1.008 }, { ...sec, s: sec.s + 0.09, hw: sec.hw * 1.008, hh: sec.hh * 1.008 }], 24,
      () => SEAM, { decor: true, fine: true });
  }
  // the wing's centre box on the fuselage's back (the high wing), its stubs broken off both sides
  for (const side of [-1, 1]) {
    // a stub along the fuselage's ±z from its crown, swept back, drooping (the An-225's anhedral), its outer end ragged;
    // a panel's span runs along its own x and its chord back along its -z: the +z stub turns a quarter one way, turned
    // over about its span so its chord runs aft, the -z stub the other way (the box's leading edge at station -3)
    const P = pose(FY + (side > 0 ? -Math.PI / 2 : Math.PI / 2), side > 0 ? Math.PI : 0, 0, at(fuse, [-3, keel + 2 * H - 0.5, 0]));
    panel(sink, P, 11, 12.5, 10.4, 3.2, 0.12, (s, a) => burntSkin(WHITE, s, a, 0.45 + smoothstep(2, 11, s) * 0.6), { rng, rootRag: 0 });
    // its own broken tip
    loft(sink, 'structureMetal', P, [{ s: 11, cy: 0, cz: -(3.2 + 5.2), hw: 5.2, hh: 0.62, rag: 0.18 }, { s: 11.4, cy: 0, cz: -(3.2 + 5.2), hw: 4.4, hh: 0.4, rag: 0.3 }],
      8, () => SOOT, { capEnd: SOOT, rng, decor: true });
    // the inboard engine still hanging under the near stub
    if (side > 0) {
      const pylon = at(P, [6.5, -0.6, -2.0]);
      sink.span('structureMetal', pylon[0] - 0.3, pylon[1] - 2.0, pylon[2] - 2.0, pylon[0] + 0.3, pylon[1], pylon[2] + 0.6, { colour: lerp(WHITE, SOOT, 0.6), decor: true });
      nacelle(sink, pose(FY + Math.PI, 0.05, 0, [pylon[0], pylon[1] - 3.0, pylon[2]]), 0.7, true);
    }
  }
  // ---- the outer wing panels broken off along the plot's back, one propped on its broken root, one flat
  // panel A: the left outer wing, its broken root near the middle propped on debris, its tip toward the west wall
  const wingA = pose(Math.PI, 0.1, -0.08, [-2.5, 2.3, z0 + 0.9]);
  // the crushed nacelle its root rests on
  sink.span('structureMetal', -5.2, -0.1, z0 + 2.0, -1.6, 1.75, z0 + 6.4, { colour: lerp(STEEL, SOOT, 0.7) });
  panel(sink, wingA, 24.5, 9.8, 4.8, 7.0, 0.11, (s, a) => burntSkin(Math.cos(a) > 0 ? WHITE : GREY_BELLY, s, a, Math.max(0, 0.8 - s / 26)),
    { rootRag: 0.2, rng, n: 8 });
  // its outer engine still on the pylon, burnt
  const pyA = at(wingA, [9, -0.5, -3.4]);
  sink.span('structureMetal', pyA[0] - 0.28, pyA[1] - 1.7, pyA[2] - 0.4, pyA[0] + 0.28, pyA[1], pyA[2] + 2.0, { colour: lerp(WHITE, SOOT, 0.7), decor: true });
  nacelle(sink, pose(Math.PI / 2 + 0.05, 0.08, 0, [pyA[0], Math.max(1.4, pyA[1] - 2.7), pyA[2] + 1.6]), 0.85, true);
  // panel B: a piece of the right wing, flat on the floor along the back toward the east wall
  const wingB = pose(0, -0.03, 0.04, [3, 0.28, z0 + 7.8]);
  panel(sink, wingB, 18, 6.0, 3.4, 4.0, 0.1, (s, a) => burntSkin(WHITE, s, a, Math.max(0.15, 0.7 - s / 22)), { rootRag: 0.25, rng, n: 8 });
  // the fallen engines: one on its side beside the panels, one nose-down in the debris
  nacelle(sink, pose(0.6, 0, 1.1, [-W / 2 + 7, 1.3, mid + 12]), 0.9, true);
  nacelle(sink, pose(-0.4, -0.35, 0.2, [W / 2 - 6, 1.1, z0 + 13]), 0.8, true);
  // ---- the tail, torn away: the aft fuselage cone with the stabiliser across x and the twin fins standing
  const TY = Math.PI / 3;
  const tail = pose(TY, 0.07, 0, [W / 2 - 20.5, 0, mid + 4.4]);
  const tailSections: Section[] = [
    { s: -3.5, cy: 3.06, hw: 3.0, hh: 3.0, rag: 0.2, pw: 2.4 }, { s: -2, cy: 3.12, hw: 2.95, hh: 2.98, pw: 2.4 }, { s: 0, cy: 3.2, hw: 2.8, hh: 2.9, pw: 2.4 },
    { s: 2.5, cy: 3.55, hw: 2.45, hh: 2.6, pw: 2.3 }, { s: 5, cy: 3.9, hw: 2.0, hh: 2.2, pw: 2.2 }, { s: 7, cy: 4.2, hw: 1.6, hh: 1.75 },
    { s: 9, cy: 4.5, hw: 1.15, hh: 1.25 }, { s: 11.5, cy: 4.9, hw: 0.45, hh: 0.5 },
  ];
  loft(sink, 'structureMetal', tail, tailSections, 18, (s, a, y) => burntSkin(livery(y, 3.4, 2.9), s, a, Math.max(0, 0.85 - (s + 3.5) / 9)), { capEnd: WHITE, rng, panels: true });
  loft(sink, 'structureMetal', tail, tailSections.slice(0, 3), 18, () => SOOT, { inside: true, decor: true, capEnd: SOOT });
  frameArc(sink, tail, { s: -4.3, cy: 3.06, hw: 3.0, hh: 3.0, pw: 2.4 }, -2.0, 1.4, 0.12, CHAR_STEEL);
  // the stabiliser, each half from the cone's top out to its fin; the fins at its tips with the flag
  for (const side of [-1, 1]) {
    // each half spans along the tail's ±z (its chord running back along the cone toward the tip); the -z half turned
    // over about its span
    const root = at(tail, [3.0, 5.6, 0]);
    const S = pose(TY + (side > 0 ? -Math.PI / 2 : Math.PI / 2), side > 0 ? 0 : Math.PI, 0, root);
    const halfSpan = 16.3;
    panel(sink, S, halfSpan, 6.6, 3.6, 4.6, 0.1, (s, a) => burntSkin(WHITE, s, a, Math.max(0, 0.35 - s / 40)), { n: 8 });
    // the fin standing on the stabiliser's tip, swept back, the flag low on it (the chord along the cone's +x)
    const tip = at(S, [halfSpan - 0.5, 0, side > 0 ? -2.6 : 2.6]);
    const F = pose(TY - Math.PI / 2, 0, Math.PI / 2, [tip[0], tip[1] - 2.2, tip[2]]);
    panel(sink, F, 11.5, 6.4, 3.0, 4.2, 0.09, (s, a) => burntSkin(s < 7 ? (s < 4.2 ? YELLOW : BLUE) : WHITE, s, a, 0.12), { n: 8 });
  }

  // ---- the hangar's barrel vault in ruins over the whole plot: seven blackened lattice ribs from wall to wall, four
  // still whole, three broken and hanging; their footings, the purlins between the standing ones, the sheeting left on
  // the back bays and the burnt cladding over the back wall
  const span = W - 2, rise = 16.5, R = (span * span / 4 + rise * rise) / (2 * rise), cyArc = rise - R;
  const arcAt = (t: number): [number, number] => {
    const half = Math.asin(Math.min(1, span / 2 / R)), a = Math.PI / 2 + half - 2 * half * t;
    return [Math.cos(a) * R, cyArc + Math.sin(a) * R];
  };
  const ribZ = Array.from({ length: 7 }, (_, k) => z0 + 1.2 + k * ((Dp - 2.4) / 6));
  // each rib's state: the fraction of its arc standing from each footing, and how far the broken end hangs
  const states: Array<[number, number, number]> = [[1, 0, 0], [1, 0, 0], [0.58, 0.3, 1.0], [1, 0, 0], [0.34, 0.26, 1.4], [0.47, 0.4, 0.6], [1, 0, 0]];
  const girder = (k: number) => ({ colour: lerp(CHAR_STEEL, RUST, 0.15 + 0.25 * noise2(k * 1.7, 0.4)), decor: true as const });
  const depthRib = 1.35;
  ribZ.forEach((z, r) => {
    const [left, right, droop] = states[r];
    for (const sx of [-1, 1]) {
      // the concrete footing (collision: it stays where the rib stood)
      sink.span('stone', sx * span / 2 - 1.0, fall, z - 0.9, sx * span / 2 + 1.0, 1.1, z + 0.9);
    }
    const draw = (t0: number, t1: number, sag: number) => {
      const steps = Math.max(2, Math.round((t1 - t0) * 26));
      for (let k = 0; k < steps; k++) {
        const ta = t0 + (t1 - t0) * k / steps, tb = t0 + (t1 - t0) * (k + 1) / steps;
        const [xa, ya] = arcAt(ta), [xb, yb] = arcAt(tb);
        const sa = sag * Math.pow((ta - t0) / Math.max(1e-6, t1 - t0), 2), sb = sag * Math.pow((tb - t0) / Math.max(1e-6, t1 - t0), 2);
        // the girder's two chords and its zig-zag web (the hangar's lattice ribs)
        bar(sink, 'structureMetal', [xa, ya - sa + depthRib, z], [xb, yb - sb + depthRib, z], 0.28, girder(r));
        bar(sink, 'structureMetal', [xa, ya - sa + 0.1, z], [xb, yb - sb + 0.1, z], 0.28, girder(r));
        bar(sink, 'structureMetal', [xa, ya - sa + 0.1, z], [xb, yb - sb + depthRib, z], 0.12, { ...girder(r), fine: true });
      }
    };
    if (left > 0) draw(0, left, left < 1 ? droop * 4 : 0);
    if (right > 0 && left < 1) draw(1 - right, 1, right < 1 ? droop * 2 : 0);
    if (left >= 1) return;
    // a broken rib's fallen length lies across the floor below it, its end on the wreck
    const [xa, ya] = arcAt(left);
    const fx = xa + 9 + 6 * noise2(r, 2.2), fz = z + (r % 2 ? 2.5 : -2.5);
    bar(sink, 'structureMetal', [xa, ya - droop * 4 + 0.5, z], [fx, 2.6 + 3 * noise2(r, 4.1), fz], 0.55, girder(r));
    bar(sink, 'structureMetal', [fx, 2.6 + 3 * noise2(r, 4.1), fz], [fx + 7, 0.35, fz + (r % 2 ? 1.2 : -1.2)], 0.55, girder(r));
  });
  // purlins between neighbouring ribs that both still stand at that point of the arc, a few sagging
  const standsAt = (r: number, t: number) => { const [l, rt] = states[r]; return t <= l || t >= 1 - rt; };
  for (let r = 0; r + 1 < ribZ.length; r++) {
    for (const t of [0.06, 0.18, 0.3, 0.42, 0.5, 0.58, 0.7, 0.82, 0.94]) {
      if (!standsAt(r, t) || !standsAt(r + 1, t) || noise2(r * 3.3, t * 9.1) < 0.28) continue;
      const [x, y] = arcAt(t), sag = noise2(r * 1.9, t * 5.7) > 0.7 ? 0.9 : 0.05;
      const m: Vec3 = [x, y + depthRib + 0.1 - sag, (ribZ[r] + ribZ[r + 1]) / 2];
      bar(sink, 'structureMetal', [x, y + depthRib + 0.1, ribZ[r]], m, 0.15, girder(r));
      bar(sink, 'structureMetal', m, [x, y + depthRib + 0.1, ribZ[r + 1]], 0.15, girder(r));
    }
  }
  // the sheeting left on the two back bays (both faces: its burnt underside from the floor), in patches
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 12; k++) {
      const t = 0.04 + k * 0.08, [x, y] = arcAt(t), [x2, y2] = arcAt(t + 0.075);
      if (noise2(r * 5.1 + k * 0.9, 3.3) < 0.42) continue;
      const colour = lerp(lerp(STEEL, RUST, noise2(k, r)), SOOT, 0.35 + 0.4 * noise2(k * 2.1, r * 1.3));
      const ya = y + depthRib + 0.22, yb = y2 + depthRib + 0.22;
      sink.quad('structureMetal', [x, ya, ribZ[r]], [x, ya, ribZ[r + 1]], [x2, yb, ribZ[r + 1]], [x2, yb, ribZ[r]], { colour, decor: true });
      sink.quad('structureMetal', [x, ya - 0.01, ribZ[r + 1]], [x, ya - 0.01, ribZ[r]], [x2, yb - 0.01, ribZ[r]], [x2, yb - 0.01, ribZ[r + 1]], { colour: SOOT, decor: true });
    }
  }
  // the back wall over the concrete: its girts, the burnt cladding still hanging on them in panels, a few torn and askew
  for (let y = wallH + 1.5; y < 14; y += 2.6) {
    const half = Math.sqrt(Math.max(0, R * R - (y - cyArc) * (y - cyArc)));
    if (half < 2) continue;
    bar(sink, 'structureMetal', [-Math.min(half, span / 2), y, z0 + wallT / 2], [Math.min(half, span / 2), y, z0 + wallT / 2], 0.14, girder(0));
  }
  for (let x = -span / 2 + 1.5; x < span / 2 - 1.5; x += 1.6) {
    const top = arcAt(0.5 - x / span * 0.98)[1] * 0.92, n = noise2(x * 0.37, 7.7);
    if (n < 0.3) continue;
    const h0 = wallH, h1 = Math.min(top, wallH + 2.6 + n * 9), skew = n > 0.85 ? 0.35 : 0;
    const colour = lerp(lerp(STEEL, RUST, noise2(x, 1)), SOOT, 0.3 + 0.5 * noise2(x * 0.9, 2.2));
    const zc = z0 + wallT / 2;
    sink.quad('structureMetal', [x, h0, zc + 0.01], [x + 1.55, h0, zc + 0.01], [x + 1.55 + skew, h1, zc + 0.01], [x + skew, h1, zc + 0.01], { colour, decor: true });
    sink.quad('structureMetal', [x + 1.55, h0, zc - 0.01], [x, h0, zc - 0.01], [x + skew, h1, zc - 0.01], [x + 1.55 + skew, h1, zc - 0.01], { colour: SOOT, decor: true });
  }
  // the fallen roof: sheets strewn over the floor and across the wreck, folded where they fell
  for (let k = 0; k < 34; k++) {
    const x = (noise2(k * 1.31, 0.7) - 0.5) * (W - 6), z = z0 + 2 + noise2(k * 0.73, 4.9) * (Dp - 3);
    const colour = lerp(lerp(STEEL, RUST, noise2(k * 2.9, 1.1)), SOOT, 0.25 + 0.6 * noise2(k * 0.41, 8.3));
    sheet(sink, x, 0.06, z, noise2(k * 3.7, 2.5) * Math.PI * 2, 1.05, 2.6 + 1.2 * noise2(k, 6), 0.12 + 0.3 * noise2(k * 5.1, 1.9), 0, colour);
  }
  // a few lean on the walls and on the wing panels
  for (const [x, z, yaw, tilt] of [[-W / 2 + 1.2, z0 + 15, Math.PI / 2, 0.55], [W / 2 - 1.3, z0 + 10, -Math.PI / 2, 0.5], [-1.5, z0 + 4.2, 0.2, 0.35],
    [8, z0 + 9.5, -0.4, 0.3]] as const) {
    sheet(sink, x, 0.06, z, yaw, 1.05, 3.0, 0.2, tilt, lerp(RUST, SOOT, 0.55));
  }

  // ---- the debris on the apron's edge (dressing): burnt skin, a buckled door panel
  for (let k = 0; k < 14; k++) {
    // (each piece inside the strip whatever its turn: its centre at least its own size from the strip's far edge)
    const x = (rng() - 0.5) * (W - 8), u = rng(), a = rng() * Math.PI * 2, s = 1.0 + rng() * 2.8;
    const z = z1 + 1 + u * Math.max(0.5, strip - 1.5 - s * 1.2);
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
  // the wreckage lies on the floor it fell on (the plot falls 2 m to its back corner at Hostomel)
  // the painted skin and the hangar's steel: the metal tile's grey noise read as a speckled hull (kit.ts LIMEWASH_UV)
  return { parts: settleOnGround(smoothRender(finishWreck(sink), LIMEWASH_UV, ['structureMetal']), ctx.ground), tints: { plaster2: [0.7, 0.7, 0.68] } };
};
