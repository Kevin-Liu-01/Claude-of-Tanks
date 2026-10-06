// src/world/landmarks/kit.ts — the set-piece library's geometry kernel (the landmarks lane, 2026-10-05), on top of the
// regional kits' part sink (maps/regional/geometry.ts): surfaces of revolution (drums, domes, onions, shafts, basins),
// walls pierced by round, segmental and pointed arches (blind, with a reveal and a dark backing, or through, with the
// intrados the full thickness), stepped plinths, mouldings, tent and pyramid roofs, crosses, stars, iron railings and
// lattice members. Everything is emitted in the piece's own frame (x across, y up, z out of its front).
//
// Collision is derived from the structural solids (structureCollision.ts): one welded solid's whole projection is its
// ground-contact footprint, so a passage a hull drives through (a gate, an arch) is built as separate solids — the
// piers on the ground and the arch ring over them, lifted ARCH_GAP_M clear so the two never weld.
import {
  LocalFrame, PartSink, facePoint, normalize3,
  type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, wallPolygon } from '../maps/regional/house.ts';

/** The lift of an arch ring over the piers it springs from: they stay separate solids (the passage stays open). */
export const ARCH_GAP_M = 0.002;

/** The ring of `n` points at radius r and height y about (x, z): the order PartSink.cylinder emits about +y. */
export function ringY(x: number, y: number, z: number, r: number, n: number, phase = 0): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = -(i / n * Math.PI * 2 + phase);
    out.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
  }
  return out;
}

/** A quad's UV frame for a ring band: u the arc length round the ring from the seam, v the height. */
function bandUv(p: Vec3, q: Vec3, arcAtP: number): EmitOptions['uv'] {
  const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
  const ux = dx / l, uz = dz / l;
  return { kind: 'plane', origin: [p[0] - ux * arcAtP, 0, p[2] - uz * arcAtP], u: [ux, 0, uz], v: [0, 1, 0] };
}

/**
 * A surface of revolution about the vertical through (x, z): `profile` is [radius, y] pairs from the bottom up. A flat
 * step (two rows at one height) is an annulus facing up or down; the ends close with caps where their radius is > 0.
 * The UVs run round the ring by arc length and up by height, so a course or a tile row wraps the drum unbroken.
 */
export function revolve(sink: PartSink, bucket: RegionalBucket, x: number, z: number,
  profile: ReadonlyArray<readonly [number, number]>, n: number, opts: EmitOptions = {}, phase = 0): void {
  if (profile.length < 2) return;
  const rings = profile.map(([r, y]) => ringY(x, y, z, Math.max(0, r), n, phase));
  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
    const a = rings[k], b = rings[k + 1];
    if (Math.abs(y1 - y0) < 1e-5) {
      if (Math.abs(r1 - r0) < 1e-5) continue;
      // an annulus: a top step where the profile narrows, a soffit where it widens
      const up = r1 < r0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const outer = up ? a : b, inner = up ? b : a;
        if (up) sink.quad(bucket, outer[i], outer[j], inner[j], inner[i], { ...opts, uv: { kind: 'world' } });
        else sink.quad(bucket, inner[i], inner[j], outer[j], outer[i], { ...opts, uv: { kind: 'world' } });
      }
      continue;
    }
    if (r0 < 1e-5 && r1 < 1e-5) continue;
    const rm = (r0 + r1) / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const arc = rm * Math.PI * 2 * i / n;
      if (r0 < 1e-5) sink.polygon(bucket, [a[i], b[j], b[i]], { ...opts, uv: bandUv(b[i], b[j], arc) });
      else if (r1 < 1e-5) sink.polygon(bucket, [a[i], a[j], b[i]], { ...opts, uv: bandUv(a[i], a[j], arc) });
      else sink.quad(bucket, a[i], a[j], b[j], b[i], { ...opts, uv: bandUv(a[i], a[j], arc) });
    }
  }
  // the end caps close a profile whose end rises or falls into it; an end that is itself a flat step (a deck, a pool's
  // surface: an annulus already) takes none
  const [rb, yb0] = profile[0], [, yb1] = profile[1];
  const [rt, yt1] = profile[profile.length - 1], [, yt0] = profile[profile.length - 2];
  if (rb > 1e-5 && Math.abs(yb1 - yb0) > 1e-5) sink.polygon(bucket, [...rings[0]].reverse(), { ...opts, uv: { kind: 'world' } });
  if (rt > 1e-5 && Math.abs(yt1 - yt0) > 1e-5) sink.polygon(bucket, [...rings[rings.length - 1]], { ...opts, uv: { kind: 'world' } });
}

// ---------------------------------------------------------------------------------------------------------- arches

type ArchForm = 'round' | 'segmental' | 'pointed' | 'flat';

/** An opening in a face: its centre along the face, width, foot, the spring line and the arch over it. */
export interface ArchHole {
  u: number;
  w: number;
  /** foot of the opening (a door's threshold, a window's sill) */
  y0: number;
  /** the spring line: the jambs stand from y0 to here, the arch rises over it */
  spring: number;
  form: ArchForm;
  /** segmental arches: the rise over the spring line (default a quarter of the width) */
  rise?: number;
}

/** The arch's crown height over its spring line. */
export function archRise(h: ArchHole): number {
  if (h.form === 'flat') return 0;
  if (h.form === 'round') return h.w / 2;
  if (h.form === 'pointed') return h.w * Math.sqrt(0.55);
  return Math.min(h.w / 2, h.rise ?? h.w / 4);
}

/** The arch line from the left spring point to the right one, as (u, y) points (n segments, flat: the two corners). */
export function archLine(h: ArchHole, n = 8): Array<[number, number]> {
  const half = h.w / 2, u0 = h.u - half;
  if (h.form === 'flat') return [[u0, h.spring], [h.u + half, h.spring]];
  const out: Array<[number, number]> = [];
  if (h.form === 'pointed') {
    // two arcs struck from the springs' opposite thirds (an equilateral-ish Gothic head), meeting at the apex
    const R = h.w * 0.8, k = Math.max(2, Math.ceil(n / 2));
    // each arc is centred on the spring line R from its own spring: the left one right of the left spring, and so on
    const cl = h.u - half + R, cr = h.u + half - R;
    const apexY = Math.sqrt(Math.max(0, R * R - (h.u - cl) * (h.u - cl)));
    const a0 = Math.PI, a1 = Math.atan2(apexY, h.u - cl);
    for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; out.push([cl + Math.cos(a) * R, h.spring + Math.sin(a) * R]); }
    const b0 = Math.atan2(apexY, h.u - cr), b1 = 0;
    for (let i = 1; i <= k; i++) { const a = b0 + (b1 - b0) * i / k; out.push([cr + Math.cos(a) * R, h.spring + Math.sin(a) * R]); }
    out[out.length - 1] = [h.u + half, h.spring];
    out[0] = [u0, h.spring];
    return out;
  }
  const rise = archRise(h);
  const R = (half * half + rise * rise) / (2 * rise);
  const cy = h.spring + rise - R;
  const alpha = Math.asin(Math.min(1, half / R));
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + alpha - (2 * alpha) * i / n;
    out.push([h.u + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  out[0] = [u0, h.spring];
  out[n] = [h.u + half, h.spring];
  return out;
}

/** A rectangle of a face (u along it, y up). */
interface FaceRect { u0: number; u1: number; y0: number; y1: number }

/**
 * A face pierced by arched openings: the wall in vertical columns that follow every arch (no opening reads as a
 * rectangle with a painted arch), each opening's reveal (jambs, the intrados, the sill) back `reveal` metres, and a
 * dark backing behind it unless `through` (a through opening's reveal is the wall's whole thickness: no backing).
 */
export function archedFace(sink: PartSink, bucket: RegionalBucket, face: Face, rect: FaceRect, holes: readonly ArchHole[],
  reveal: number, opts: EmitOptions & { through?: boolean; segments?: number; revealShade?: number } = {}): void {
  const n = opts.segments ?? 8;
  const lines = holes.map((h) => archLine(h, n));
  const cuts = new Set<number>([rect.u0, rect.u1]);
  for (const line of lines) for (const [u] of line) cuts.add(u);
  const us = [...cuts].filter((u) => u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6).sort((a, b) => a - b);
  const P = (u: number, y: number, o = 0): Vec3 => facePoint(face, u, y, o);
  const { through: _through, segments: _segments, revealShade: _revealShade, ...emit } = opts;
  const headAt = (k: number, u: number): number => {
    // the arch line's height at one of its own points (columns are cut at every point)
    const line = lines[k];
    let best = line[0][1], bd = Infinity;
    for (const [lu, ly] of line) { const d = Math.abs(lu - u); if (d < bd) { bd = d; best = ly; } }
    return best;
  };
  for (let i = 0; i + 1 < us.length; i++) {
    const ua = us[i], ub = us[i + 1];
    if (ub - ua < 1e-5) continue;
    const um = (ua + ub) / 2;
    const k = holes.findIndex((h) => um > h.u - h.w / 2 && um < h.u + h.w / 2);
    if (k < 0) { sink.quad(bucket, P(ua, rect.y0), P(ub, rect.y0), P(ub, rect.y1), P(ua, rect.y1), emit); continue; }
    const h = holes[k];
    if (h.y0 > rect.y0 + 1e-4) sink.quad(bucket, P(ua, rect.y0), P(ub, rect.y0), P(ub, h.y0), P(ua, h.y0), emit);
    const ya = Math.min(rect.y1, headAt(k, ua)), yb = Math.min(rect.y1, headAt(k, ub));
    if (rect.y1 - Math.min(ya, yb) > 1e-4) {
      if (rect.y1 - ya < 1e-4) sink.polygon(bucket, [P(ua, ya), P(ub, yb), P(ub, rect.y1)], emit);
      else if (rect.y1 - yb < 1e-4) sink.polygon(bucket, [P(ua, ya), P(ub, yb), P(ua, rect.y1)], emit);
      else sink.quad(bucket, P(ua, ya), P(ub, yb), P(ub, rect.y1), P(ua, rect.y1), emit);
    }
  }
  if (reveal <= 0) return;
  const r = -reveal, dark = opts.revealShade ?? 1;
  holes.forEach((h, k) => {
    const line = lines[k], u0 = h.u - h.w / 2, u1 = h.u + h.w / 2;
    // the jambs face into the opening, the sill up, the intrados down toward the opening's axis
    if (h.spring > h.y0 + 1e-4) {
      sink.quad(bucket, P(u0, h.y0), P(u0, h.y0, r), P(u0, h.spring, r), P(u0, h.spring), { ...emit, shade: 0.74 * dark });
      sink.quad(bucket, P(u1, h.y0), P(u1, h.spring), P(u1, h.spring, r), P(u1, h.y0, r), { ...emit, shade: 0.74 * dark });
    }
    if (h.y0 > rect.y0 + 1e-4) sink.quad(bucket, P(u0, h.y0), P(u1, h.y0), P(u1, h.y0, r), P(u0, h.y0, r), { ...emit, shade: 0.9 * dark });
    for (let i = 0; i + 1 < line.length; i++) {
      const [ua, ya] = line[i], [ub, yb] = line[i + 1];
      sink.quad(bucket, P(ua, ya), P(ua, ya, r), P(ub, yb, r), P(ub, yb), { ...emit, shade: 0.68 * dark });
    }
    if (!opts.through) {
      const back = r - 0.004;
      const outline: Vec3[] = [P(u0, h.y0, back), P(u1, h.y0, back)];
      for (let i = line.length - 1; i >= 0; i--) outline.push(P(line[i][0], line[i][1], back));
      sink.polygon('dark', outline, { decor: true });
    }
  });
}

/**
 * A free-standing wall pierced through by arched openings (an arcade, a gate's attic, a bridge spandrel, a belfry's
 * open stage): x0..x1 along x, y0..y1 up, the front face at z = +t/2 and the back at -t/2. The intrados runs the whole
 * thickness. `ends` closes the x faces (a wall that abuts nothing), `top`/`bottom` its caps.
 */
export function archedSlab(sink: PartSink, bucket: RegionalBucket, x0: number, x1: number, y0: number, y1: number, t: number,
  holes: readonly ArchHole[], opts: EmitOptions & { ends?: boolean; top?: boolean; bottom?: boolean; segments?: number } = {}): void {
  const { ends = true, top = true, bottom = false, segments, ...emit } = opts;
  const front: Face = { origin: [0, 0, t / 2], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 };
  const back: Face = { origin: [0, 0, -t / 2], u: [-1, 0, 0], out: [0, 0, -1], width: x1 - x0 };
  archedFace(sink, bucket, front, { u0: x0, u1: x1, y0, y1 }, holes, t, { ...emit, through: true, segments, revealShade: 1 });
  archedFace(sink, bucket, back, { u0: -x1, u1: -x0, y0, y1 }, holes.map((h) => ({ ...h, u: -h.u })), 0, { ...emit, segments });
  const zf = t / 2, zb = -t / 2;
  if (top) sink.quad(bucket, [x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb], emit);
  if (ends) {
    sink.quad(bucket, [x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf], emit);
    sink.quad(bucket, [x0, y0, zb], [x0, y0, zf], [x0, y1, zf], [x0, y1, zb], emit);
  }
  if (bottom) {
    // the soffit between the openings (an arch ring over its piers)
    const edges = [x0, ...holes.flatMap((h) => [h.u - h.w / 2, h.u + h.w / 2]), x1].sort((a, b) => a - b);
    for (let i = 0; i + 1 < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      if (b - a < 1e-4) continue;
      const mid = (a + b) / 2;
      if (holes.some((h) => h.y0 <= y0 + 1e-4 && mid > h.u - h.w / 2 && mid < h.u + h.w / 2)) continue;
      sink.quad(bucket, [a, y0, zb], [b, y0, zb], [b, y0, zf], [a, y0, zf], { ...emit, shade: 0.7 });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------- masonry

/** A rectangular block from two corners with a few options (a thin wrapper that keeps the call sites short). */
export function block(sink: PartSink, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  opts: EmitOptions = {}): void {
  sink.span(bucket, x0, y0, z0, x1, y1, z1, opts);
}

/** Steps round a rectangle: `count` treads of `rise` and `tread`, the top one w × d, the lowest buried `sink` deep. */
export function steppedBase(sink: PartSink, bucket: RegionalBucket, w: number, d: number, count: number, rise: number, tread: number,
  depth = 0.6, opts: EmitOptions = {}): number {
  for (let k = 0; k < count; k++) {
    const grow = (count - 1 - k) * tread;
    const yb = k === 0 ? -depth : k * rise;
    sink.span(bucket, -w / 2 - grow, yb, -d / 2 - grow, w / 2 + grow, (k + 1) * rise, d / 2 + grow, opts);
  }
  return count * rise;
}

/** A moulding round a w × d body at height y (a string course, a cornice): `out` proud, `h` tall. Faces only. */
export function moulding(sink: PartSink, bucket: RegionalBucket, w: number, d: number, y: number, h: number, out: number,
  opts: EmitOptions = {}): void {
  sink.band(bucket, -w / 2 - out, y, -d / 2 - out, w / 2 + out, y + h, d / 2 + out, opts);
}

/** A tent roof (n-sided pyramid) of radius r at height y rising h: an octagonal belfry's or a water tower's hood. */
export function tentRoof(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, r: number, y: number, h: number, n: number,
  opts: EmitOptions = {}, phase = Math.PI / n): void {
  revolve(sink, bucket, cx, cz, [[r, y], [0, y + h]], n, opts, phase);
}

// ---------------------------------------------------------------------------------------------------------- domes

/** An onion dome's profile (radius over the drum's, height over its base) — the Russian swelling bulb with its neck. */
const ONION: ReadonlyArray<readonly [number, number]> = [
  [1.0, 0], [1.16, 0.18], [1.26, 0.42], [1.22, 0.66], [1.06, 0.9], [0.8, 1.12], [0.5, 1.3], [0.24, 1.44], [0.1, 1.54], [0.0, 1.6],
];
/** A helm dome (the older, flatter Novgorod/Ukrainian form) and a hemisphere. */
const HELM: ReadonlyArray<readonly [number, number]> = [[1.0, 0], [1.04, 0.22], [0.98, 0.5], [0.8, 0.8], [0.5, 1.02], [0.18, 1.14], [0, 1.18]];
const HEMI: ReadonlyArray<readonly [number, number]> = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 7) * Math.PI / 2;
  return [Math.cos(a), Math.sin(a)] as const;
});

type DomeForm = 'onion' | 'helm' | 'hemisphere';

/** A dome of radius r on a base at y: returns its top height. */
export function dome(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, form: DomeForm, segments: number,
  opts: EmitOptions = {}): number {
  const profile = form === 'onion' ? ONION : form === 'helm' ? HELM : HEMI;
  revolve(sink, bucket, x, z, profile.map(([pr, py]) => [pr * r, y + py * r] as const), segments, opts);
  return y + profile[profile.length - 1][1] * r;
}

/** A drum: a cylinder with a base moulding and a cornice, windows painted as dark slots round it. Returns its top. */
export function drum(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, h: number, segments: number,
  opts: EmitOptions & { windows?: number; cornice?: RegionalBucket } = {}): number {
  const { windows = 0, cornice = bucket, ...emit } = opts;
  revolve(sink, bucket, x, z, [[r, y], [r, y + h]], segments, emit);
  revolve(sink, cornice, x, z, [[r, y + h], [r * 1.09, y + h], [r * 1.09, y + h + 0.22], [r * 0.98, y + h + 0.22]], segments, emit);
  if (windows > 0) {
    // narrow round-headed slots round the drum, set a hair proud (dark glazing), each under a little hood
    // each slot on the centre of a facet (the ring's facets are flat: a slot across a vertex would stand off it)
    const facet = r * Math.cos(Math.PI / segments) + 0.012, every = Math.max(1, Math.round(segments / windows));
    for (let k = 0; k < windows; k++) {
      const a = -((k * every + 0.5) / segments * Math.PI * 2);
      const nx = Math.cos(a), nz = Math.sin(a);
      const face: Face = { origin: [x + nx * facet, 0, z + nz * facet], u: [nz, 0, -nx], out: [nx, 0, nz], width: 1 };
      const ww = Math.min(0.55, r * 0.34), wy0 = y + h * 0.22, wy1 = y + h * 0.78;
      const slot: Vec3[] = [facePoint(face, -ww / 2, wy0), facePoint(face, ww / 2, wy0), facePoint(face, ww / 2, wy1 - ww / 2)];
      for (let i = 1; i < 6; i++) { const t = i / 6 * Math.PI; slot.push(facePoint(face, Math.cos(t) * ww / 2, wy1 - ww / 2 + Math.sin(t) * ww / 2)); }
      slot.push(facePoint(face, -ww / 2, wy1 - ww / 2));
      sink.polygon('dark', slot, { decor: true });
    }
  }
  return y + h + 0.22;
}

// ---------------------------------------------------------------------------------------------------------- symbols

/** A cross on a short mast from (x, y, z): Orthodox (three bars, the foot bar slanted) or Latin. Returns its top. */
export function cross(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, size: number, style: 'orthodox' | 'latin',
  colour: Rgb, yaw = 0): number {
  const t = 0.05 * size + 0.02, top = y + size;
  const o: EmitOptions = { colour, decor: true };
  sink.placed(yaw, x, 0, z, () => {
    sink.span(bucket, -t, y, -t, t, top, t, o);
    if (style === 'latin') {
      sink.span(bucket, -size * 0.32, top - size * 0.34 - t, -t, size * 0.32, top - size * 0.34 + t, t, o);
    } else {
      sink.span(bucket, -size * 0.14, top - size * 0.12 - t * 0.8, -t, size * 0.14, top - size * 0.12 + t * 0.8, t, o);
      sink.span(bucket, -size * 0.3, top - size * 0.3 - t, -t, size * 0.3, top - size * 0.3 + t, t, o);
      // the foot bar slants (the Orthodox suppedaneum)
      sink.member(bucket, [-size * 0.2, top - size * 0.62 + size * 0.06, 0], [size * 0.2, top - size * 0.62 - size * 0.06, 0],
        t * 1.6, t * 2, [0, 0, 1], { ...o, exposed: true }, t);
    }
  });
  return top;
}

/** A five-pointed star standing upright in the x–y plane at (x, y, z), `r` its outer radius, `depth` thick. */
export function star(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, depth: number, opts: EmitOptions = {},
  yaw = 0): void {
  const inner = r * 0.42;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 === 0 ? r : inner;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  sink.placed(yaw, x, y, z, () => {
    // the centre pentagon and five point triangles, each a convex prism (the faces weld along their shared edges)
    const zf = depth / 2, zb = -depth / 2;
    const pent: Vec3[] = [];
    for (let i = 1; i < 10; i += 2) pent.push([pts[i][0], pts[i][1], zf]);
    sink.polygon(bucket, pent, opts);
    sink.polygon(bucket, pent.map(([px, py]): Vec3 => [px, py, zb]).reverse(), opts);
    for (let i = 0; i < 10; i += 2) {
      // the point's inner corners before and after its tip, counter-clockwise seen from the front
      const tip = pts[i], before = pts[(i + 9) % 10], after = pts[(i + 1) % 10];
      sink.polygon(bucket, [[before[0], before[1], zf], [tip[0], tip[1], zf], [after[0], after[1], zf]], opts);
      sink.polygon(bucket, [[after[0], after[1], zb], [tip[0], tip[1], zb], [before[0], before[1], zb]], opts);
      // the two outer edges of the point, in that order (each side quad faces out)
      for (const [a, b] of [[before, tip], [tip, after]] as const) {
        sink.quad(bucket, [a[0], a[1], zb], [b[0], b[1], zb], [b[0], b[1], zf], [a[0], a[1], zf], opts);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------------------- iron and timber

/** A free member between two points (a strut, a lattice bar, a rail), square `t` thick, every face kept. */
export function bar(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, t: number, opts: EmitOptions = {}): void {
  const d = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  // any axis not parallel to the member orients its cross-section
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = normalize3([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  sink.member(bucket, a, b, t, t, out, { ...opts, exposed: true }, t / 2);
}

/**
 * A wrought-iron railing from a to b on the ground: posts with finials every `pitch`, a top and a bottom rail and the
 * bars between (the bars are fine joinery: a long view reads the rails and the posts).
 */
export function railing(sink: PartSink, a: readonly [number, number], b: readonly [number, number], height: number, colour: Rgb,
  opts: { pitch?: number; base?: number; plinth?: RegionalBucket | null } = {}): void {
  const pitch = opts.pitch ?? 2.4, base = opts.base ?? 0;
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.2) return;
  const iron: EmitOptions = { colour, decor: true };
  if (opts.plinth) {
    // a low dwarf wall the railing stands on, footed below the ground (0.32 wide; a hull rolls over it like a kerb)
    sink.member(opts.plinth, [a[0], -0.3, a[1]], [b[0], -0.3, b[1]], 0.32, base + 0.35, [0, 1, 0], { decor: true, exposed: true }, 0);
  }
  const posts = Math.max(1, Math.round(len / pitch));
  for (let k = 0; k <= posts; k++) {
    const t = k / posts, x = a[0] + dx * t, z = a[1] + dz * t;
    sink.span('structureMetal', x - 0.045, base - 0.05, z - 0.045, x + 0.045, base + height + 0.08, z + 0.045, iron);
    sink.span('structureMetal', x - 0.065, base + height + 0.08, z - 0.065, x + 0.065, base + height + 0.2, z + 0.065, { ...iron, fine: true });
  }
  for (const y of [base + 0.14, base + height - 0.06]) {
    bar(sink, 'structureMetal', [a[0], y, a[1]], [b[0], y, b[1]], 0.04, iron);
  }
  const bars = Math.floor(len / 0.13);
  for (let k = 1; k < bars; k++) {
    const t = k / bars, x = a[0] + dx * t, z = a[1] + dz * t;
    sink.span('structureMetal', x - 0.011, base + 0.14, z - 0.011, x + 0.011, base + height + 0.02, z + 0.011, { ...iron, fine: true });
  }
}

// ---------------------------------------------------------------------------------------------------------- bodies

export type FaceName = 'front' | 'right' | 'back' | 'left';
export const FACE_NAMES: readonly FaceName[] = ['front', 'right', 'back', 'left'];

/** The four faces of a w × d body centred at (cx, cz): front +z, right +x, back -z, left -x (u left to right outside). */
function facesAt(cx: number, cz: number, w: number, d: number): Record<FaceName, Face> {
  return {
    front: { origin: [cx, 0, cz + d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w },
    right: { origin: [cx + w / 2, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: d },
    back: { origin: [cx, 0, cz - d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    left: { origin: [cx - w / 2, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: d },
  };
}

/**
 * A rectangular masonry body (a tower stage, a nave, a hall) from y0 to y1, w × d at (cx, cz): each face pierced by its
 * openings (archedFace: a reveal back to a dark backing), the top closed. Returns the faces for the dressing.
 */
export function archedBody(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, w: number, d: number, y0: number, y1: number,
  holes: Partial<Record<FaceName, ArchHole[]>>, reveal: number, opts: EmitOptions = {}): Record<FaceName, Face> {
  const faces = facesAt(cx, cz, w, d);
  for (const name of FACE_NAMES) {
    const face = faces[name];
    archedFace(sink, bucket, face, { u0: -face.width / 2, u1: face.width / 2, y0, y1 }, holes[name] ?? [], reveal, opts);
  }
  sink.quad(bucket, [cx - w / 2, y1, cz + d / 2], [cx + w / 2, y1, cz + d / 2], [cx + w / 2, y1, cz - d / 2], [cx - w / 2, y1, cz - d / 2], opts);
  return faces;
}

/** The outline of an opening on a face plane `o` metres out: the foot, the jambs and the arch (convex, ccw outside). */
function openingOutline(face: Face, h: ArchHole, o: number, n = 8): Vec3[] {
  const line = archLine(h, n);
  const out: Vec3[] = [facePoint(face, h.u - h.w / 2, h.y0, o), facePoint(face, h.u + h.w / 2, h.y0, o)];
  for (let i = line.length - 1; i >= 0; i--) out.push(facePoint(face, line[i][0], line[i][1], o));
  return out;
}

/**
 * The glazing of an opening archedFace cut: the pane at the back of the reveal (a lit curtain at night for a share of
 * them, else dark glass), a frame round it, a mullion and a transom at the spring line (the frame is fine joinery).
 */
export function archWindow(sink: PartSink, face: Face, h: ArchHole, reveal: number, frame: Rgb, lit: boolean, opts: { bars?: boolean } = {}): void {
  const back = -reveal;
  sink.polygon(lit ? 'curtain' : 'glass', openingOutline(face, h, back + 0.012), { decor: true, window: face.out });
  const f = { colour: frame, decor: true, fine: true };
  const line = archLine(h, 8), fw = 0.06, fo = back + 0.035;
  const u0 = h.u - h.w / 2 + fw / 2, u1 = h.u + h.w / 2 - fw / 2;
  sink.member('structureWood', facePoint(face, u0, h.y0, fo), facePoint(face, u0, h.spring, fo), fw, 0.05, face.out, f);
  sink.member('structureWood', facePoint(face, u1, h.y0, fo), facePoint(face, u1, h.spring, fo), fw, 0.05, face.out, f);
  sink.member('structureWood', facePoint(face, u0, h.y0 + fw / 2, fo), facePoint(face, u1, h.y0 + fw / 2, fo), fw, 0.05, face.out, f);
  for (let i = 0; i + 1 < line.length; i++) {
    const [ua, ya] = line[i], [ub, yb] = line[i + 1];
    sink.member('structureWood', facePoint(face, ua, ya - fw / 2, fo), facePoint(face, ub, yb - fw / 2, fo), fw, 0.05, face.out, f);
  }
  if (opts.bars !== false) {
    const crown = h.spring + archRise(h);
    sink.member('structureWood', facePoint(face, h.u, h.y0, fo), facePoint(face, h.u, crown - fw, fo), fw * 0.7, 0.04, face.out, f);
    if (h.form !== 'flat') sink.member('structureWood', facePoint(face, u0, h.spring, fo), facePoint(face, u1, h.spring, fo), fw * 0.7, 0.04, face.out, f);
  }
}

/**
 * A dressed surround round an opening (the nalichnik of a Russian church window, a classical architrave): the
 * archivolt following the arch, a strip down each jamb, a keystone at the crown and a sill under it. Dressing proud of
 * the face (no collision); its sides are fine joinery.
 */
export function archSurround(sink: PartSink, bucket: RegionalBucket, face: Face, h: ArchHole, width: number, out: number,
  opts: { keystone?: boolean; sill?: boolean; colour?: Rgb } = {}): void {
  const dec: EmitOptions = { decor: true, ...(opts.colour ? { colour: opts.colour } : {}) };
  const line = archLine(h, 8);
  // the archivolt: a band of quads between the arch line and its offset outward (away from the opening)
  const offset = line.map(([u, y], i): [number, number] => {
    const [pu, py] = line[Math.max(0, i - 1)], [nu, ny] = line[Math.min(line.length - 1, i + 1)];
    const tu = nu - pu, ty = ny - py, l = Math.hypot(tu, ty) || 1;
    // the normal away from the opening (the arch's outside); the springs keep vertical jamb edges
    const nu2 = i === 0 ? -1 : i === line.length - 1 ? 1 : -ty / l, ny2 = i === 0 || i === line.length - 1 ? 0 : tu / l;
    return [u + nu2 * width, y + ny2 * width];
  });
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], c = offset[i + 1], d = offset[i];
    sink.quad(bucket, facePoint(face, a[0], a[1], out), facePoint(face, b[0], b[1], out), facePoint(face, c[0], c[1], out), facePoint(face, d[0], d[1], out), dec);
    // the outer edge back to the wall (fine: a few centimetres deep), facing away from the opening, and the inner one
    sink.quad(bucket, facePoint(face, c[0], c[1], 0), facePoint(face, d[0], d[1], 0), facePoint(face, d[0], d[1], out), facePoint(face, c[0], c[1], out), { ...dec, fine: true });
    sink.quad(bucket, facePoint(face, a[0], a[1], 0), facePoint(face, b[0], b[1], 0), facePoint(face, b[0], b[1], out), facePoint(face, a[0], a[1], out), { ...dec, fine: true });
  }
  // the jamb strips from the sill to the spring
  for (const side of [-1, 1]) {
    const ui = h.u + side * h.w / 2, uo = ui + side * width;
    const [ua, ub] = side < 0 ? [uo, ui] : [ui, uo];
    sink.quad(bucket, facePoint(face, ua, h.y0, out), facePoint(face, ub, h.y0, out), facePoint(face, ub, h.spring, out), facePoint(face, ua, h.spring, out), dec);
    const edge: Vec3[] = [facePoint(face, uo, h.y0, 0), facePoint(face, uo, h.y0, out), facePoint(face, uo, h.spring, out), facePoint(face, uo, h.spring, 0)];
    sink.polygon(bucket, side < 0 ? edge : edge.reverse(), { ...dec, fine: true });
    // the inner edge, facing into the opening (seen past the reveal's lip at a glancing angle)
    const inner: Vec3[] = [facePoint(face, ui, h.y0, 0), facePoint(face, ui, h.spring, 0), facePoint(face, ui, h.spring, out), facePoint(face, ui, h.y0, out)];
    sink.polygon(bucket, side < 0 ? inner : inner.reverse(), { ...dec, fine: true });
  }
  if (opts.keystone !== false && h.form !== 'flat') {
    const crown = h.spring + archRise(h);
    const kw = Math.max(0.16, h.w * 0.12);
    const k0: Vec3 = facePoint(face, h.u - kw * 0.4, crown - 0.05, out + 0.03), k1: Vec3 = facePoint(face, h.u + kw * 0.4, crown - 0.05, out + 0.03);
    const k2: Vec3 = facePoint(face, h.u + kw * 0.6, crown + width + 0.08, out + 0.03), k3: Vec3 = facePoint(face, h.u - kw * 0.6, crown + width + 0.08, out + 0.03);
    sink.quad(bucket, k0, k1, k2, k3, dec);
  }
  if (opts.sill !== false && h.y0 > 0.3) {
    const sw = h.w + 2 * width + 0.12;
    sink.box(bucket, facePoint(face, h.u, h.y0 - 0.06, 0.06), [sw / 2, 0.06, 0.06], { ...dec, fineSides: true }, new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]),
      { nz: true });
  }
}

/** Pilaster strips at the four corners of a w × d body at (cx, cz) from y0 to y1, `width` wide, `out` proud. */
export function cornerPilasters(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, w: number, d: number, y0: number, y1: number,
  width: number, out: number, opts: EmitOptions = {}): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * w / 2, z = cz + sz * d / 2;
    sink.quoin(bucket, x - (sx > 0 ? width : out), y0, z - (sz > 0 ? width : out), x + (sx > 0 ? out : width), y1, z + (sz > 0 ? out : width),
      sx, sz, { decor: true, ...opts });
  }
}

/** A Tuscan column's profile (radius r, height h): a base, the shaft with its entasis, the echinus and the abacus. */
export function columnProfile(r: number, h: number, y = 0): Array<[number, number]> {
  return [[r * 1.32, y], [r * 1.32, y + 0.16], [r * 1.14, y + 0.24], [r, y + 0.32], [r * 0.98, y + h * 0.33], [r * 0.86, y + h - 0.42],
    [r * 0.9, y + h - 0.36], [r * 1.18, y + h - 0.2], [r * 1.18, y + h - 0.17]];
}

/**
 * A classical portico on a face: a stylobate of three steps, `columns` Tuscan columns, the entablature and a pediment
 * under a gable roof whose ridge runs out from the face. Built in the face's frame (u across, out away from the wall).
 */
export function portico(sink: PartSink, face: Face, opts: { width: number; depth: number; height: number; columns: number;
  bucket: RegionalBucket; roofBucket: RegionalBucket; roofColour?: Rgb; pitchDeg?: number }): void {
  const { width, depth, height, columns, bucket } = opts;
  const yaw = Math.atan2(face.out[0], face.out[2]);
  sink.placed(yaw, face.origin[0], 0, face.origin[2], () => {
    // local frame: x across the face (u reversed or not: the portico is symmetric), z out from the wall
    steppedBase(sink, 'stone', width, depth * 2, 3, 0.16, 0.3, 0.6);
    const top = 0.48, r = Math.min(0.34, width / (columns * 4.2));
    for (let i = 0; i < columns; i++) {
      const x = -width / 2 + r * 1.6 + (width - r * 3.2) * i / Math.max(1, columns - 1);
      revolve(sink, bucket, x, depth - r * 1.6, columnProfile(r, height, top), 10);
      sink.span(bucket, x - r * 1.3, top + height - 0.17, depth - r * 2.9, x + r * 1.3, top + height, depth - r * 0.3);
    }
    // the entablature: architrave and frieze, the cornice proud of them
    const ey = top + height;
    sink.span(bucket, -width / 2, ey, 0, width / 2, ey + 0.75, depth);
    sink.band(bucket, -width / 2 - 0.12, ey + 0.75, -0.001, width / 2 + 0.12, ey + 0.92, depth + 0.12);
    // the pediment: a gable roof over the portico (ridge out from the wall), its tympanum wall at the front
    const pitch = opts.pitchDeg ?? 24;
    const roof = { kind: 'gable' as const, pitchDeg: pitch, eave: 0.12, verge: 0.14, thickness: 0.1, bucket: opts.roofBucket, ridge: null };
    const rg = roofGeometry(width, depth, ey + 0.92, roof);
    sink.placed(0, 0, 0, depth / 2, () => {
      emitRoof(sink, rg, roof, opts.roofColour);
      if (rg.gable) wallPolygon(sink, bucket, { origin: [0, 0, depth / 2], u: [1, 0, 0], out: [0, 0, 1], width }, rg.gable, 0.3);
    });
  });
}

/**
 * The faces of an n-sided prism about (cx, cz) with inradius `rIn`, facet 0 facing +z (the piece's front) and the rest
 * counter-clockwise seen from above. Each face's u runs left to right seen from outside; facets meet at the vertices.
 */
function prismFaces(cx: number, cz: number, rIn: number, n: number): Face[] {
  const width = 2 * rIn * Math.tan(Math.PI / n);
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    // facet i faces the direction turned i steps from +z toward +x
    const a = i * Math.PI * 2 / n;
    const ox = Math.sin(a), oz = Math.cos(a);
    faces.push({ origin: [cx + ox * rIn, 0, cz + oz * rIn], u: [oz, 0, -ox], out: [ox, 0, oz], width });
  }
  return faces;
}

/**
 * An n-sided masonry prism (an octagonal tower or shaft) from y0 to y1, its facets pierced by arched openings (holes
 * keyed by facet index), the top closed. Returns the faces.
 */
export function prismBody(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, rIn: number, n: number, y0: number, y1: number,
  holes: Readonly<Record<number, ArchHole[]>>, reveal: number, opts: EmitOptions = {}): Face[] {
  const faces = prismFaces(cx, cz, rIn, n);
  faces.forEach((face, i) => {
    archedFace(sink, bucket, face, { u0: -face.width / 2, u1: face.width / 2, y0, y1 }, holes[i] ?? [], reveal, opts);
  });
  // the top: the polygon through the facets' upper corners (in facet order it faces up)
  const top: Vec3[] = faces.map((f) => facePoint(f, f.width / 2, y1));
  sink.polygon(bucket, top, opts);
  return faces;
}

/**
 * A convex profile extruded by `depth` along `dir`, wound whichever way the profile was written: the cap at the profile
 * faces away from `dir`, the far cap along it, the sides out.
 */
export function extrude(sink: PartSink, bucket: RegionalBucket, points: readonly Vec3[], dir: Vec3, depth: number, opts: EmitOptions = {}): void {
  if (points.length < 3) return;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  // prism() wants the profile counter-clockwise seen from +dir: its Newell normal along dir
  const along = nx * dir[0] + ny * dir[1] + nz * dir[2];
  sink.prism(bucket, along >= 0 ? points : [...points].reverse(), dir, depth, opts);
}

/**
 * A smooth lime render on a set piece's rendered walls: their UVs scaled by `k` (< 1), so the shared render print — a
 * cottage's rough clay at the houses' scale — spreads into the soft mottling of a church's or a monument's limewash
 * (the first capture read the village print on 30 m of church wall as "speckled granite"). Same material, no new draw.
 */
/**
 * The UV scale of a limewashed or painted surface (smoothRender): the regional plaster and metal tiles carry a grey noise
 * that reads as granite on a whitewashed church (at the tile's own density) or as blotches (at a fifth of it); at this
 * scale a whole wall samples a few texels of the tile, so the limewash reads as one coat and its weathering (the
 * occlusion and damp the weathering pass paints per vertex) shows on it.
 */
export const LIMEWASH_UV = 0.006;

export function smoothRender(parts: RegionalParts, k: number, buckets: readonly RegionalBucket[] = ['plaster', 'plaster2', 'plaster3']): RegionalParts {
  for (const name of buckets) {
    for (const geometry of parts[name] ?? []) {
      const uv = geometry.getAttribute('uv');
      if (!uv) continue;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
      uv.needsUpdate = true;
    }
  }
  return parts;
}

/**
 * Settle a piece onto uneven ground: every vertex lifted by the ground's height under it (types.ts ground, over the base),
 * so wreckage and debris lie on the slope they fell on. A grade of a few percent bends a long hull imperceptibly;
 * vertical edges stay vertical and welded corners stay welded (the collision is derived after).
 */
export function settleOnGround(parts: RegionalParts, ground: ((lx: number, lz: number) => number) | undefined): RegionalParts {
  if (!ground) return parts;
  const memo = new Map<string, number>();
  for (const list of Object.values(parts)) {
    for (const geometry of list) {
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
        let g = memo.get(key);
        if (g === undefined) { g = ground(x, z); memo.set(key, g); }
        p.setY(i, p.getY(i) + g);
      }
      p.needsUpdate = true;
      geometry.computeBoundingBox();
    }
  }
  return parts;
}
