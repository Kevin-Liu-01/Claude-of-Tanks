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

const WHITE = rgb(0xe9e9e6), GREY_BELLY = rgb(0xb9bcbf), BLUE = rgb(0x2c5aa0), YELLOW = rgb(0xf0c22c), SOOT = rgb(0x1c1a18);
const FAN = rgb(0x26282a), GLASS_BURNT = rgb(0x121314);
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

/** `P` turned about `pivot` (in P's own frame) by a yaw, a pitch and a roll: a broken section's kink. */
function around(P: Pose, pivot: Vec3, yaw: number, pitch: number, roll: number): Pose {
  const R = pose(yaw, pitch, roll, [0, 0, 0]).m;
  const m = Array.from({ length: 9 }, (_, k) => {
    const i = Math.floor(k / 3), j = k % 3;
    return P.m[i * 3] * R[j] + P.m[i * 3 + 1] * R[3 + j] + P.m[i * 3 + 2] * R[6 + j];
  });
  const rp: Vec3 = [R[0] * pivot[0] + R[1] * pivot[1] + R[2] * pivot[2], R[3] * pivot[0] + R[4] * pivot[1] + R[5] * pivot[2], R[6] * pivot[0] + R[7] * pivot[1] + R[8] * pivot[2]];
  const d: Vec3 = [pivot[0] - rp[0], pivot[1] - rp[1], pivot[2] - rp[2]];
  return { m, t: [P.t[0] + P.m[0] * d[0] + P.m[1] * d[1] + P.m[2] * d[2], P.t[1] + P.m[3] * d[0] + P.m[4] * d[1] + P.m[5] * d[2],
    P.t[2] + P.m[6] * d[0] + P.m[7] * d[1] + P.m[8] * d[2]] };
}

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

/**
 * Burnt aluminium (round 4, gauntlet wave 246: "pixel-block 'burn' patches … a coarse pixel-mosaic that reads as digital
 * camouflage rather than fire", "rust-orange smudges on aluminium"; "burnt aluminium is soot-black and grey-white ash"):
 * one smooth gradient a vertex, never a panel at a time — the livery where the fire stayed off, soot streaked aft along
 * the flow over it, bare aluminium at the scorch's margin, soot-black over the burnt, grey-white ash where it burnt
 * hottest. `heat` 0-1 is the fire's reach at the point.
 */
function burntAlu(base: Rgb, s: number, a: number, heat: number): Rgb {
  const n = noise2(s * 0.09 + 3.1, a * 0.8 + 1.7) - 0.5, n2 = noise2(s * 0.31 + 7.7, a * 1.9 + 3.3) - 0.5;
  const h = heat + n * 0.35 + n2 * 0.12;
  const ash = smoothstep(0.9, 1.04, h) * 0.85, black = smoothstep(0.46, 0.64, h) * (1 - ash * 0.85);
  const bare = smoothstep(0.3, 0.44, h) * (1 - black);
  const streak = smoothstep(0.58, 0.92, noise2(s * 0.05 + 1.3, a * 6.0 + 0.7)) * 0.4 * (1 - bare) * (1 - black);
  return lerp(lerp(lerp(base, BARE, bare * 0.8), SOOT, Math.max(black * 0.95, streak)), ASH_W, ash * 0.9);
}

/** An airfoil panel (a wing or stabiliser half, a fin) along local x from 0 to `span`: chord and thickness tapering,
 *  the leading edge (local +z) swept back by `sweep` (m over the span), `sag` dropping the tip (a wing gone soft in the
 *  fire), its root ragged where it broke. */
function panel(sink: PartSink, P: Pose, span: number, rootChord: number, tipChord: number, sweep: number, thick: number,
  paint: (s: number, a: number) => Rgb, opts: { rootRag?: number; rng?: () => number; decor?: boolean; n?: number; sag?: number } = {}): void {
  const steps = 10, sections: Section[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, chord = rootChord + (tipChord - rootChord) * t;
    sections.push({ s: span * t, cy: -(opts.sag ?? 0) * t * t, cz: -(sweep * t + chord / 2), hw: chord / 2, hh: Math.max(0.12, chord * thick / 2),
      rag: k === 0 ? opts.rootRag : undefined });
  }
  loft(sink, 'structureMetal', P, sections, opts.n ?? 8, (s, a) => paint(s, a),
    { capStart: opts.rootRag ? SOOT : shade(WHITE, 0.8), capEnd: shade(ASH_W, 0.8), rng: opts.rng, ...(opts.decor ? { decor: true } : {}) });
}

/** A D-18T on its pylon, along local x (the intake at x = 0, facing local -x): the cowl's lip round the open intake, the
 *  dark fan face set back in it behind the spinner, the cowl tapering to the hot nozzle and its plug — soot and ash, never
 *  bright metal (round 4: "intake-less capsule", "polished bronze engine cones"). */
function nacelle(sink: PartSink, P: Pose, heat: number, decor: boolean): void {
  const body = (s: number, a: number) => burntAlu(WHITE, s * 3 + heat * 40, a, heat);
  loft(sink, 'structureMetal', P, [
    { s: 0, cy: 0, hw: 1.16, hh: 1.16 }, { s: 0.18, cy: 0, hw: 1.31, hh: 1.31 }, { s: 1.7, cy: 0, hw: 1.34, hh: 1.34 },
    { s: 3.7, cy: 0, hw: 1.12, hh: 1.12 }, { s: 4.9, cy: 0, hw: 0.86, hh: 0.86 },
  ], 16, (s, a) => (s < 0.1 ? lerp(ASH_W, SOOT, heat * 0.6) : body(s, a)), { ...(decor ? { decor: true } : {}) });
  // the intake's throat down to the fan, its face dark, the spinner standing out of it
  loft(sink, 'structureMetal', P, [{ s: 0, cy: 0, hw: 1.16, hh: 1.16 }, { s: 0.75, cy: 0, hw: 1.06, hh: 1.06 }], 16, () => shade(ASH_W, 0.42),
    { inside: true, decor: true, capEnd: FAN });
  loft(sink, 'structureMetal', P, [{ s: 0.74, cy: 0, hw: 0.36, hh: 0.36 }, { s: 0.42, cy: 0, hw: 0.18, hh: 0.18 }, { s: 0.3, cy: 0, hw: 0.03, hh: 0.03 }], 10,
    () => lerp(ASH_W, SOOT, 0.35), { decor: true });
  // the nozzle's dark ring and the plug
  loft(sink, 'structureMetal', P, [{ s: 4.9, cy: 0, hw: 0.86, hh: 0.86 }, { s: 4.9, cy: 0, hw: 0.6, hh: 0.6 }], 16, () => SOOT, { decor: true });
  loft(sink, 'structureMetal', P, [{ s: 4.85, cy: 0, hw: 0.6, hh: 0.6 }, { s: 5.7, cy: 0, hw: 0.08, hh: 0.08 }], 10, () => CHAR, { decor: true });
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

/**
 * The melted skin at a break (round 4: "melted, curled skin"): flaps of the torn skin peeling off its ragged rim, each a
 * strip curling out and down from the hull into the gap, both faces (the outside soot and ash, the inside charred).
 */
function skinFlaps(sink: PartSink, P: Pose, sec: Section, dir: 1 | -1, count: number, seed: number): void {
  for (let k = 0; k < count; k++) {
    const n = noise2(seed + k * 1.37, 2.1), a = -Math.PI + (k + 0.5 + (n - 0.5) * 0.6) * Math.PI * 2 / count;
    const w = 0.7 + 0.5 * noise2(seed + k * 0.73, 4.4), len = 1.2 + 1.6 * noise2(seed + k * 2.9, 6.6);
    const da = w / (sec.hw + sec.hh);
    const ring = (aa: number, i: number): Vec3 => {
      const t = i / 4, q = sectionPoint(sec, aa, 1 + 0.32 * t * t), out = 0.9 * t * t;
      return at(P, [sec.s + dir * len * t * (1 - 0.35 * t), sec.cy + q.y - out * Math.max(0, Math.cos(aa)) * 0.6 - 0.5 * t * t, (sec.cz ?? 0) + q.z]);
    };
    const outside = lerp(SOOT, ASH_W, 0.25 + 0.5 * noise2(seed + k, 9.1)), inside = CHAR;
    for (let i = 0; i < 4; i++) {
      const p0 = ring(a - da, i), p1 = ring(a + da, i), p2 = ring(a + da, i + 1), p3 = ring(a - da, i + 1);
      sink.quad('structureMetal', p0, p1, p2, p3, { colour: outside, decor: true });
      sink.quad('structureMetal', p1, p0, p3, p2, { colour: inside, decor: true });
    }
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
 * A cladding sheet hanging from its fixing (round 4: "flat black monoliths", "a skyline of flat dark slabs"; "cladding
 * sheets hanging and curled as geometry"): `top` the fixing's middle, the sheet `w` wide across `along` (unit, level),
 * hanging `l` down and curling out toward `out` (unit, level) at its foot, a gentle twist; both faces.
 */
function hangingSheet(sink: PartSink, top: Vec3, along: Vec3, out: Vec3, w: number, l: number, curl: number, twist: number, colour: Rgb): void {
  const N = 5, pts: Vec3[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, ang = curl * t * t, y = top[1] - l * (Math.sin(ang) > 0 ? Math.sin(ang) / Math.max(ang, 1e-3) : 1) * t;
    const o = l * t * (1 - Math.cos(ang)) / Math.max(ang, 1e-3) * 1.2;
    const row: Vec3[] = [];
    for (const u of [-w / 2, w / 2]) {
      const tw = twist * t * (u > 0 ? 1 : -1) * 0.5;
      row.push([top[0] + along[0] * u + out[0] * (o + tw), y, top[2] + along[2] * u + out[2] * (o + tw)]);
    }
    pts.push(row);
  }
  const back = shade(colour, 0.62);
  for (let i = 0; i < N; i++) {
    const [a, b] = pts[i], [d, c] = pts[i + 1];
    sink.quad('structureMetal', a, b, c, d, { colour, decor: true });
    sink.quad('structureMetal', b, a, d, c, { colour: back, decor: true });
  }
}

/**
 * The An-225 Mriya in the ruin of its hangar (plan.ts aircraftWreck), round 4 (2026-10-07; gauntlet wave 246 on round 3:
 * the airframe "a bullet-nosed tube with no cockpit glazing", its engines "intake-less capsules", the burn "a coarse
 * pixel-mosaic", the hangar's cladding "flat black monoliths" and its ribs "thin rust-brown wire", the floor clean), from
 * the post-battle photographs at Hostomel:
 * - The silhouette at true scale: the slab-sided fuselage (7.3 m wide, 8.2 m deep) settled on its belly, nose to the
 *   apron, broken through the middle where it burnt — its ring frames, stringers and cargo floor in the gap, the torn skin
 *   curled and melted at both rims; the flight deck's glazed windscreen stepped down over the nose and its visor; the high
 *   wing still on the hull, gone soft in the fire — its 88.4 m span drooping from the roots to the tips, burnt to its spars
 *   over the gap — with the six D-18T nacelles on their pylons, intakes forward, fan faces and spinners in them; the
 *   32.6 m stabiliser on the upswept tail cone with the twin fins at its tips, the flag on them.
 * - Burnt aluminium: one smooth gradient a vertex (burntAlu) — soot-black and grey-white ash where the fire burnt, bare
 *   metal at its margin, the livery past it streaked with soot; no rust anywhere.
 * - The hangar at its full size: a concrete floor with the fire's scorch field black round the airframe, ash, puddles of
 *   melted alloy under the wing roots and the nacelles, debris and fallen sheeting; the low walls, broken; blackened steel
 *   arch ribs, the ones over the fire collapsed in sections across the wreck; the cladding hanging from the back wall's
 *   girts and the standing purlins in curled sheets.
 */
export const aircraftWreck: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rng = ctx.rng;
  // (the airframe is at true scale: the plot must hold its 88.4 m span and its 84 m length with the hangar round them)
  const W = Math.max(100, Number(ctx.params.width)), Dp = Math.max(92, Number(ctx.params.depth)), strip = Math.max(0, Number(ctx.params.strip));
  const z0 = -(Dp + strip + 2) / 2, z1 = z0 + Dp;
  const fall = -0.6 - ctx.groundFall;
  // the airframe's pose (its axis along +z, the tail near the back wall) and where its fire burnt
  const tailZ = z0 + 5.5, axisZ = tailZ + 42, axisX = -W * 0.03;

  // ---- the floor: the concrete slab, the fire's scorch field black round the airframe, ash, melt and debris on it
  drapedRect(sink, 'structureMetal', undefined, { cx: 0, cz: (z0 + z1 + 1) / 2, hw: W / 2, hd: (z1 + 1 - z0) / 2 },
    { lift: 0.06, cell: 4, skirt: 0.4, emit: { colour: CONCRETE } });
  const blob = (bx: number, bz: number, r: number, colour: Rgb, y: number, seed: number, stretch = 1) => {
    // (kept on the slab: inside the plot whatever its size)
    const x = Math.max(-W / 2 + r + 0.5, Math.min(W / 2 - r - 0.5, bx)), z = Math.max(z0 + r * stretch + 0.5, Math.min(z1 - r * stretch, bz));
    const ring: Vec3[] = [];
    for (let i = 0; i < 20; i++) {
      const a = -i / 20 * Math.PI * 2, rr = r * (0.55 + 0.45 * noise2(seed + i * 0.61, seed * 0.37));
      ring.push([x + Math.cos(a) * rr, y, z + Math.sin(a) * rr * stretch]);
    }
    sink.polygon('structureMetal', ring, { colour, decor: true });
  };
  // the scorch field: overlapping black lobes along the airframe and out under the wings
  for (let k = 0; k < 12; k++) {
    const t = k / 11, r = 10 + 8 * noise2(k * 1.7, 3.1);
    blob(axisX + (noise2(k, 0.4) - 0.5) * 30, axisZ - 34 + t * 66, r, lerp(SOOT, CHAR, 0.4 * noise2(k, 9)), 0.07 + k * 0.0008, k * 3.3, 1.3);
  }
  for (const side of [1, -1]) for (let k = 0; k < 4; k++) {
    blob(axisX + side * (12 + k * 8), axisZ - 2 - k * 4.5, 6 + 3 * noise2(k, side * 4), lerp(SOOT, CHAR, 0.3), 0.081 + k * 0.0008, 20 + k + side * 7);
  }
  // ash drifts in the black, and grey ash where the fire's edge was
  for (let k = 0; k < 9; k++) blob(axisX + (noise2(k * 2.3, 1.9) - 0.5) * 34, axisZ - 30 + noise2(k * 1.1, 6.2) * 62, 2 + 3 * noise2(k, 2.2),
    lerp(ASH_W, CONCRETE, 0.35 + 0.3 * noise2(k, 5)), 0.09, 40 + k);
  // the puddles of melted alloy under the wing roots, the nacelles and the burnt-through middle: bright, flowed flat
  for (let k = 0; k < 16; k++) {
    const side = k % 2 ? 1 : -1, d = 3 + 26 * noise2(k * 1.3, 4.4);
    blob(axisX + side * d, axisZ + 3 - d * 0.55 + (noise2(k, 7.7) - 0.5) * 7, 0.7 + 2.0 * noise2(k * 3.1, 0.2), lerp(BARE, MELT, 0.6), 0.1, 80 + k);
  }
  // debris: burnt skin, frames and fittings scattered out from the airframe
  for (let k = 0; k < 34; k++) {
    const ang = noise2(k * 1.9, 3.7) * Math.PI * 2, d = 5 + 30 * noise2(k * 0.77, 8.1);
    const x = axisX + Math.cos(ang) * d * 1.1, z = axisZ + Math.sin(ang) * d * 1.3;
    if (Math.abs(x) > W / 2 - 2 || z < z0 + 2 || z > z1 - 1) continue;
    const colour = lerp(lerp(ASH_W, BARE, noise2(k, 1)), SOOT, 0.35 + 0.6 * noise2(k * 0.41, 8.3));
    if (k % 3 === 0) bar(sink, 'structureMetal', [x, 0.2, z], [x + Math.cos(ang + 1.3) * 2.6, 0.25 + 0.4 * noise2(k, 2), z + Math.sin(ang + 1.3) * 2.6], 0.14, { colour: CHAR, decor: true });
    else sheet(sink, x, 0.06, z, ang * 2.1, 0.8 + 0.6 * noise2(k, 3), 1.2 + 1.4 * noise2(k, 6), 0.08 + 0.3 * noise2(k * 5.1, 1.9), 0.05 * (noise2(k, 4) - 0.5), colour);
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

  // ---- the arch ribs at the full span: blackened steel lattice girders, torn — the ones over the fire down in sections
  // across the wreck, the others buckled — on their concrete footings
  const span = W - 2.6, rise = Math.min(30, span * 0.27), R = (span * span / 4 + rise * rise) / (2 * rise), cyArc = rise - R + 1.5;
  const half = Math.asin(Math.min(1, span / 2 / R));
  const arcAt = (t: number): [number, number] => { const a = Math.PI / 2 + half - 2 * half * t; return [Math.cos(a) * R, cyArc + Math.sin(a) * R]; };
  const nRibs = Math.max(5, Math.round((Dp - 3) / 9) + 1);
  const ribZ = Array.from({ length: nRibs }, (_, k) => z0 + 1.5 + k * ((Dp - 3) / (nRibs - 1)));
  const depthRib = 2.4;
  const girder = (k: number) => ({ colour: lerp(CHAR_STEEL, CHAR, 0.3 + 0.5 * noise2(k * 1.7, 0.4)), decor: true as const });
  type RibState = { left: number; right: number; buckleAt: number; buckle: number; throw: number };
  const ribState = (k: number): RibState => {
    const overFire = Math.abs(ribZ[k] - (axisZ - 4)) < 30, n = noise2(k * 2.9, 1.3), m = noise2(k * 1.1, 5.7);
    if (k === 0 || k === nRibs - 1) return { left: 1, right: 0, buckleAt: 0.3 + 0.4 * n, buckle: 1.5 + 2 * m, throw: 0.4 };
    if (overFire && n < 0.72) return { left: 0.18 + 0.32 * n, right: 0.15 + 0.35 * m, buckleAt: 0.2, buckle: 0.8, throw: 0.6 };
    return { left: 1, right: 0, buckleAt: 0.25 + 0.5 * m, buckle: 3 + 4 * n, throw: 1.2 * (n - 0.5) };
  };
  const steps = 22;
  ribZ.forEach((z, r) => {
    const st = ribState(r);
    for (const sx of [-1, 1]) sink.span('stone', sx * span / 2 - 1.2, fall, z - 1.0, sx * span / 2 + 1.2, 1.3, z + 1.0);
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
        bar(sink, 'structureMetal', [a[0], a[1] + depthRib, a[2]], [b[0], b[1] + depthRib, b[2]], 0.55, girder(r));
        bar(sink, 'structureMetal', a, b, 0.55, girder(r));
        bar(sink, 'structureMetal', a, [b[0], b[1] + depthRib, b[2]], 0.24, { ...girder(r), fine: true });
      }
    };
    if (st.left >= 1) { draw(0, 1, null); return; }
    draw(0, st.left, st.left);
    draw(1 - st.right, 1, 1 - st.right);
    // the collapsed length between the breaks: in two sections across the wreck, one end on the floor, kinked at the joint
    const [xa, ya] = arcAt(st.left), [xb] = arcAt(1 - st.right);
    const kx = xa + (xb - xa) * (0.35 + 0.3 * noise2(r, 3.3)), ky = 3 + 6 * noise2(r * 2.1, 0.9), kz = z + (r % 2 ? 3.5 : -3.5);
    const lat = (a: Vec3, b: Vec3, w: number) => {
      bar(sink, 'structureMetal', a, b, w, girder(r));
      bar(sink, 'structureMetal', [a[0], a[1] + depthRib * 0.7, a[2]], [b[0], b[1] + depthRib * 0.7, b[2]], w * 0.7, girder(r));
      const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      bar(sink, 'structureMetal', a, [m[0], m[1] + depthRib * 0.7, m[2]], w * 0.4, { ...girder(r), fine: true });
      bar(sink, 'structureMetal', m, [b[0], b[1] + depthRib * 0.7, b[2]], w * 0.4, { ...girder(r), fine: true });
    };
    lat([xa, Math.max(2, ya - 7), z + 1.2], [kx, ky, kz], 0.7);
    lat([kx, ky, kz], [xb - (xb - xa) * 0.1, 0.4, kz + (r % 2 ? 2 : -2)], 0.7);
  });
  // purlins between neighbouring standing ribs, some sagging, and the roof sheets still hanging from them, curled
  const stands = (r: number, t: number) => { const s = ribState(r); return s.left >= 1 || t <= s.left - 0.05 || t >= 1 - s.right + 0.05; };
  for (let r = 0; r + 1 < ribZ.length; r++) {
    for (const t of [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92]) {
      if (!stands(r, t) || !stands(r + 1, t) || noise2(r * 3.3, t * 9.1) < 0.3) continue;
      const [x, y] = arcAt(t), sag = noise2(r * 1.9, t * 5.7) > 0.7 ? 1.4 : 0.1;
      const m: Vec3 = [x, y + depthRib - sag, (ribZ[r] + ribZ[r + 1]) / 2];
      bar(sink, 'structureMetal', [x, y + depthRib, ribZ[r]], m, 0.26, girder(r));
      bar(sink, 'structureMetal', m, [x, y + depthRib, ribZ[r + 1]], 0.26, girder(r));
      if (noise2(r * 2.1, t * 4.3) > 0.62) {
        const colour = lerp(lerp(ASH_W, CHAR_STEEL, 0.45), SOOT, 0.15 + 0.55 * noise2(r, t * 3));
        hangingSheet(sink, [x, y + depthRib - sag - 0.1, m[2] + (noise2(r, t) - 0.5) * 4], [0, 0, 1], [x > 0 ? -1 : 1, 0, 0],
          1.05, 3 + 4 * noise2(r * 1.3, t * 7.1), 0.9 + 1.4 * noise2(t, r), 0.4, colour);
      }
    }
  }
  // the burnt cladding on the back wall's girts: sheets still hung, torn short, curling off the wall
  for (let x = -span / 2 + 2; x < span / 2 - 2; x += 2.3) {
    const n = noise2(x * 0.37, 7.7);
    if (n < 0.4) continue;
    const top = Math.min(arcAt(0.5 - x / span * 0.98)[1] * 0.85, wallH + 2 + n * n * 8);
    const colour = lerp(lerp(ASH_W, CHAR_STEEL, 0.5), SOOT, 0.15 + 0.6 * noise2(x * 0.9, 2.2));
    hangingSheet(sink, [x + 1.05, top, z0 + wallT + 0.05], [1, 0, 0], [0, 0, 1], 1.05, Math.min(top - 0.4, 2 + 6 * noise2(x, 3.3)),
      0.6 + 1.6 * noise2(x * 1.3, 3.1), (noise2(x, 9) - 0.5) * 1.2, colour);
  }
  // the fallen roof: heaps of sheeting where bays came down
  for (let h = 0; h < 6; h++) {
    const hx = (noise2(h * 1.9, 2.1) - 0.5) * (W - 16), hz = z0 + 6 + noise2(h * 0.83, 5.3) * (Dp - 12);
    const n = 6 + Math.round(5 * noise2(h, 4.4));
    for (let k = 0; k < n; k++) {
      const colour = lerp(lerp(ASH_W, CHAR_STEEL, 0.55), SOOT, 0.2 + 0.6 * noise2(k * 0.41, h * 8.3));
      sheet(sink, hx + (noise2(h + k * 0.7, 1) - 0.5) * 5, 0.06 + k * 0.16, hz + (noise2(h + k * 0.9, 2) - 0.5) * 5,
        noise2(h * 3.7 + k, 2.5) * Math.PI * 2, 1.05, 3.0 + 1.5 * noise2(k, h), 0.15 + 0.4 * noise2(k * 5.1, h), 0.1 * (noise2(k, h * 3) - 0.5), colour);
    }
  }

  // ---- the airframe: one burnt An-225, nose to the apron, settled on its belly (the gear collapsed), listing a little
  const fuse = pose(-Math.PI / 2 - 0.035, 0, 0.02, [axisX, 0, axisZ]);
  // the fuselage's sections: [station, top, bottom, half width] — the upswept tail cone, the body, the flight deck's
  // windscreen stepped down over the nose, the visor's rounded tip
  const profile: Array<[number, number, number, number]> = [
    [-42.0, 7.85, 6.35, 0.5], [-41.4, 7.95, 5.6, 1.05], [-40.0, 8.05, 4.6, 1.75], [-37.8, 8.15, 3.45, 2.45], [-35.0, 8.2, 2.3, 3.0],
    [-32.0, 8.25, 1.2, 3.4], [-29.0, 8.25, 0.35, 3.62], [-26.0, 8.25, 0.06, 3.65],
  ];
  for (let s = -24; s <= 33.01; s += 1.5) profile.push([s, 8.25, 0.06, 3.65]);
  // (the windscreen: the crown's line breaks at its top edge and falls steeply to the nose's shoulder, then the nose
  // rounds down to the visor's tip — the An-124/225 face, not a bullet)
  profile.push([34.4, 8.22, 0.08, 3.62], [35.4, 8.12, 0.14, 3.55], [36.4, 7.55, 0.24, 3.4], [37.3, 6.75, 0.38, 3.18], [38.0, 6.25, 0.52, 2.95],
    [38.9, 5.85, 0.78, 2.62], [39.9, 5.35, 1.1, 2.18], [40.8, 4.75, 1.48, 1.62], [41.5, 4.1, 1.9, 1.02], [42.0, 3.5, 2.3, 0.48], [42.25, 3.05, 2.6, 0.14]);
  const toSection = ([s, top, bottom, hw]: [number, number, number, number], extra: Partial<Section> = {}): Section =>
    ({ s, cy: (top + bottom) / 2, hh: Math.max(0.08, (top - bottom) / 2), hw, pw: s > 38 || s < -38 ? 2.2 : 2.7, ...extra });
  const BURN0 = -13, BURN1 = 12;
  // the fire: through the middle; the forward fuselage burnt hard all the way to the flight deck, the aft one less, its
  // crown sooted by the smoke running aft
  const heatAt = (s: number, a: number) => {
    const up = Math.max(0, Math.cos(a));
    if (s >= BURN1) return 0.98 - 0.32 * smoothstep(BURN1, 42, s) + 0.18 * up;
    return 0.95 - 0.62 * smoothstep(BURN0, -40, s) + 0.28 * up * smoothstep(-42, -20, s);
  };
  const skinPaint = (s: number, a: number, y: number) => burntAlu((y - 4.15) / 4.1 < -0.62 ? GREY_BELLY : WHITE, s, a, heatAt(s, a));
  const fore = profile.filter(([s]) => s >= BURN1).map((p, i) => toSection(p, i === 0 ? { rag: 0.14 } : {}));
  // (the forward fuselage broke away at the burn: kinked off the axis and listing on its belly, the gap opened)
  const foreP = around(fuse, [BURN1, 0, 0], 0.05, 0, 0.055);
  const aft = profile.filter(([s]) => s <= BURN0).map((p, i, arr) => toSection(p, i === arr.length - 1 ? { rag: 0.14 } : {}));
  loft(sink, 'structureMetal', foreP, fore, 32, skinPaint, { capEnd: shade(ASH_W, 0.6), rng });
  loft(sink, 'structureMetal', fuse, aft, 32, skinPaint, { capStart: shade(WHITE, 0.7), rng });
  // the torn skins' scorched insides at the break, closed a few metres in by a scorched bulkhead
  const inner = (x: Section): Section => ({ ...x, hw: x.hw * 0.985, hh: x.hh * 0.985 });
  loft(sink, 'structureMetal', foreP, fore.slice(0, 4).map(inner), 32, () => SOOT, { inside: true, decor: true, capEnd: SOOT });
  loft(sink, 'structureMetal', fuse, aft.slice(-4).map(inner), 32, () => SOOT, { inside: true, decor: true, capStart: SOOT });
  // the melted skin curling off both rims into the gap
  skinFlaps(sink, foreP, fore[0], -1, 9, 5.5);
  skinFlaps(sink, fuse, aft[aft.length - 1], 1, 9, 17.5);
  // the livery's cheat line along the aft fuselage, where the fire stayed off it: the blue over the yellow, burnt with it
  {
    const band = (t: number, pw: number) => Math.acos(Math.max(-1, Math.min(1, -Math.sign(t) * Math.pow(Math.abs(t), pw / 2))));
    const lifted = aft.filter((x) => x.s >= -32).map((x) => ({ ...x, hw: x.hw * 1.004, hh: x.hh * 1.004, rag: undefined }));
    for (const side of [1, -1]) for (const [t0, t1, colour] of [[0.08, 0.26, BLUE], [0.26, 0.4, YELLOW]] as const) {
      const a0 = band(t0, 2.7) * side, a1 = band(t1, 2.7) * side;
      loft(sink, 'structureMetal', fuse, lifted, 3, (s, a) => burntAlu(colour, s, a, heatAt(s, a)), { decor: true, arc: side > 0 ? [a0, a1] : [a1, a0] });
    }
  }
  // the flight deck's windscreen: a frame of six panes across the step over the nose, the side windows behind it — the
  // glazing burnt out to the dark of the cockpit, the frame standing
  {
    const sec = (s: number) => { const p = profile.reduce((b, x) => (Math.abs(x[0] - s) < Math.abs(b[0] - s) ? x : b)); return toSection([s, p[1], p[2], p[3]]); };
    const S0 = 35.6, S1 = 37.2, rows: Section[] = [S0, (S0 + S1) / 2, S1].map((s) => { const x = sec(s); return { ...x, hw: x.hw * 1.01, hh: x.hh * 1.01 }; });
    const A = 0.95, panes = 6;
    for (let i = 0; i < panes; i++) {
      const a0 = -A + 2 * A * i / panes + 0.03, a1 = -A + 2 * A * (i + 1) / panes - 0.03;
      loft(sink, 'structureMetal', foreP, rows, 2, () => GLASS_BURNT, { decor: true, arc: [a0, a1] });
    }
    for (let i = 0; i <= panes; i++) {
      const a = -A + 2 * A * i / panes;
      const p0 = sectionPoint(rows[0], a, 1.012), p1 = sectionPoint(rows[2], a, 1.012);
      bar(sink, 'structureMetal', at(foreP, [S0, rows[0].cy + p0.y, p0.z]), at(foreP, [S1, rows[2].cy + p1.y, p1.z]), 0.12, { colour: lerp(ASH_W, SOOT, 0.5), decor: true });
    }
    for (const s of [S0, S1]) frameArc(sink, foreP, { ...sec(s), hw: sec(s).hw * 1.02, hh: sec(s).hh * 1.02 }, -A, A, 0.12, lerp(ASH_W, SOOT, 0.5));
    // the side windows behind it, and the visor's line round the nose
    for (const side of [1, -1]) for (let k = 0; k < 3; k++) {
      const s = 33.2 - k * 1.4, x = sec(s), a = side * 1.15;
      loft(sink, 'structureMetal', foreP, [{ ...x, s, hw: x.hw * 1.01, hh: x.hh * 1.01 }, { ...x, s: s + 0.9, hw: x.hw * 1.01, hh: x.hh * 1.01 }], 1,
        () => GLASS_BURNT, { decor: true, arc: side > 0 ? [a - 0.12, a + 0.12] : [a - 0.12, a + 0.12] });
    }
    const v = sec(38.6);
    loft(sink, 'structureMetal', foreP, [{ ...v, s: 38.6, hw: v.hw * 1.01, hh: v.hh * 1.01 }, { ...v, s: 38.75, hw: v.hw * 1.01, hh: v.hh * 1.01 }], 32,
      () => SEAM, { decor: true, fine: true });
  }
  // the burnt-through middle: the ring frames, a few broken, the stringers, the cargo floor (the solid a hull meets)
  {
    const body: Section = { s: 0, cy: 4.155, hw: 3.65, hh: 4.095, pw: 2.7 };
    for (let s = BURN0 + 0.8; s < BURN1 - 0.4; s += 1.5) {
      const gap = noise2(s * 0.7, 2.2), a0 = -Math.PI + (gap > 0.62 ? 0.9 : 0.05), a1 = Math.PI - (gap < 0.2 ? 1.1 : 0.05);
      frameArc(sink, fuse, { ...body, s }, a0, a1, 0.18, lerp(CHAR_STEEL, ASH_W, 0.3 * noise2(s, 4.1)));
    }
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI + (i + 0.5) * (Math.PI * 2 / 14), cut = noise2(i * 2.7, 6.1);
      const q = sectionPoint(body, a, 0.99), sEnd = cut > 0.55 ? BURN0 + (BURN1 - BURN0) * (0.3 + 0.4 * cut) : BURN1 + 0.2;
      bar(sink, 'structureMetal', at(fuse, [BURN0 - 0.2, body.cy + q.y, q.z]), at(fuse, [sEnd, body.cy + q.y - (cut > 0.55 ? 0.6 : 0), q.z]), 0.1,
        { colour: CHAR_STEEL, decor: true });
    }
    const fa = at(fuse, [BURN0, 0, -3.2]), fb = at(fuse, [BURN1, 0, 3.2]);
    sink.span('structureMetal', Math.min(fa[0], fb[0]), fall, Math.min(fa[2], fb[2]), Math.max(fa[0], fb[0]), 1.35, Math.max(fa[2], fb[2]), { colour: lerp(SOOT, CHAR_STEEL, 0.4) });
  }
  // the wing's centre box over the gap: burnt to its spars and ribs, still carrying the wing
  for (const s of [5.2, 1.8, -1.6, -5.0]) {
    bar(sink, 'structureMetal', at(fuse, [s, 8.7, -4.4]), at(fuse, [s, 8.7, 4.4]), 0.34, { colour: CHAR_STEEL, decor: true });
  }
  for (const z of [-3.6, -1.2, 1.2, 3.6]) bar(sink, 'structureMetal', at(fuse, [5.4, 8.7, z]), at(fuse, [-5.4, 8.7, z]), 0.24, { colour: CHAR_STEEL, decor: true });
  // the high wing, on the hull at its roots and gone soft in the fire: each half drooping from its root to a tip three to
  // four metres off the floor, swept back; its six nacelles on their pylons under the leading edge, intakes forward
  const wingSpan = 40.5, wingRoot = 12.6, wingTip = 4.6, wingSweep = 26.0, rootY = 8.75, sag = 3.2;
  for (const side of [1, -1]) {
    const rootX = axisX + side * 3.65, rootZ = axisZ + 5.6, droop = Math.atan2(rootY - 6.4, wingSpan);
    // (the left half mirrored: turned over end for end, its paint read from its own top)
    const P = side > 0 ? pose(0, 0, -droop, [rootX, rootY, rootZ]) : pose(Math.PI, Math.PI, droop, [rootX, rootY, rootZ]);
    const wingPaint = (s: number, a: number) => {
      const top = (side > 0 ? Math.cos(a) : -Math.cos(a)) > 0;
      return burntAlu(top ? WHITE : GREY_BELLY, s * 1.7 + side * 50, a, Math.max(0.22, 0.95 - s / 26) + (top ? 0.08 : -0.05));
    };
    panel(sink, P, wingSpan, wingRoot, wingTip, wingSweep, 0.11, wingPaint, { rng, n: 10, sag: side > 0 ? sag : -sag });
    for (const [k, d] of [[0, 7.5], [1, 15.5], [2, 23.5]] as const) {
      const t = d / wingSpan, chord = wingRoot + (wingTip - wingRoot) * t, under = Math.max(0.12, chord * 0.11 / 2);
      const le = at(P, [d, -sag * t * t * side, -(wingSweep * t)]);
      const intake: Vec3 = [le[0], le[1] - under - 1.75, le[2] + 2.3];
      nacelle(sink, pose(Math.PI / 2, 0, 0, intake), 0.55 + 0.35 * (1 - t) * noise2(k, side + 3), true);
      // the pylon: a thin web from the nacelle's spine up into the wing, swept back with it
      const top: Vec3 = [le[0], le[1] - under * 0.3, le[2] - 1.0], foot: Vec3 = [intake[0], intake[1] + 1.25, intake[2] - 1.2];
      const back: Vec3 = [top[0], top[1], top[2] - 3.4], backFoot: Vec3 = [foot[0], foot[1], foot[2] - 3.0];
      const pc = lerp(SOOT, ASH_W, 0.25 * noise2(k, side));
      for (const off of [0.16, -0.16]) {
        const o = (p: Vec3): Vec3 => [p[0] + off, p[1], p[2]];
        const quad: Vec3[] = off > 0 ? [o(foot), o(top), o(back), o(backFoot)] : [o(top), o(foot), o(backFoot), o(back)];
        sink.quad('structureMetal', quad[0], quad[1], quad[2], quad[3], { colour: pc, decor: true });
      }
    }
  }
  // the tail: the stabiliser across the tail cone's top, the twin fins at its tips, the flag on their outer faces —
  // soot streaked aft on them, the fire's least
  {
    const sStab = -37.6, yStab = 8.7;
    for (const side of [1, -1]) {
      const root = at(fuse, [sStab, yStab, 0]);
      const P = side > 0 ? pose(-0.035, 0, 0.012, [root[0], root[1], root[2] + 3.6]) : pose(Math.PI - 0.035, Math.PI, -0.012, [root[0], root[1], root[2] + 3.6]);
      panel(sink, P, 16.3, 7.4, 4.6, 4.6, 0.1, (s, a) => burntAlu(WHITE, s - 60, a, 0.24), { n: 8, decor: true });
      const tip = at(P, [16.3, 0, 0]);
      const F = pose(-0.035, 0, Math.PI / 2, [tip[0], tip[1], tip[2] - 4.6 + 0.4]);
      panel(sink, F, 9.6, 6.8, 4.0, 4.2, 0.09, (s, a) => {
        const outer = Math.sin(a) * side > 0.2, flag = outer ? (s > 4.6 ? BLUE : s > 1.2 ? YELLOW : WHITE) : WHITE;
        return burntAlu(flag, s - 80, a, 0.2);
      }, { n: 8, decor: true });
    }
  }

  // ---- the debris on the apron's edge (dressing, where the plot keeps a strip before its doors): burnt skin panels
  for (let k = 0; strip >= 4 && k < 14; k++) {
    const x = (rng() - 0.5) * (W - 8), u = rng(), a = rng() * Math.PI * 2, s = 1.0 + rng() * 2.8;
    const z = z1 + 1 + u * Math.max(0.5, strip - 1.5 - s * 1.2);
    const lift = 0.06 + rng() * 0.5, c = Math.cos(a), sn = Math.sin(a);
    const p = (u: number, v: number, h: number): Vec3 => [x + u * c - v * sn, h, z + u * sn + v * c];
    const colour = lerp(rng() < 0.4 ? ASH_W : BARE, SOOT, 0.4 + rng() * 0.6);
    sink.quad('structureMetal', p(-s, s * 0.5, 0.05), p(0, s * 0.5, lift), p(0, -s * 0.5, lift), p(-s, -s * 0.5, 0.05), { colour, decor: true });
    sink.quad('structureMetal', p(0, s * 0.5, lift), p(s, s * 0.5, 0.05), p(s, -s * 0.5, 0.05), p(0, -s * 0.5, lift), { colour: shade(colour, 0.85), decor: true });
    sink.quad('structureMetal', p(-s, -s * 0.5, 0.04), p(0, -s * 0.5, lift - 0.02), p(0, s * 0.5, lift - 0.02), p(-s, s * 0.5, 0.04), { colour: SOOT, decor: true });
    sink.quad('structureMetal', p(0, -s * 0.5, lift - 0.02), p(s, -s * 0.5, 0.04), p(s, s * 0.5, 0.04), p(0, s * 0.5, lift - 0.02), { colour: SOOT, decor: true });
  }
  return { parts: settleOnGround(smoothRender(finishWreck(sink), LIMEWASH_UV, ['structureMetal']), ctx.ground), tints: { plaster2: [0.7, 0.7, 0.68] } };
};
const CONCRETE = rgb(0x6c6862), CHAR = rgb(0x22201e), ASH_W = rgb(0xbfbcb5), MELT = rgb(0xd2d5d6);
