// src/world/maps/regional/domes.ts — the kits' domes, bulbs and round roofs, turned smooth (dome-detail-275).
//
// Kevin's ruling (2026-11-22): "no more low quality/low poly buildings ... like the one in orchard valley of a dome on a
// building thats just so low detailed compared to others". The kits built their domes as stacked `cylinder` frustums:
// each frustum's side quads carry their own flat normal, so a dome of six rings by fourteen segments read as a faceted
// polyhedron beside houses dressed to the centimetre. A dome here is one `PartSink.revolve` (normals blended round the
// ring and up the profile, sharp only at a step or a shoulder), at least DOME_MIN_SEGMENTS round and DOME_MIN_RINGS up,
// more as it grows. domeDetail.selftest.mjs holds every kit to it.
import { normalize3, type EmitOptions, type PartSink, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';

/** The fewest segments round any dome, bulb or round roof (the faceting stops reading from the chase camera at 24). */
export const DOME_MIN_SEGMENTS = 24;
/** The fewest rows up a dome's curve (a smooth revolve's normals hide the rest). */
export const DOME_MIN_RINGS = 12;
/** Segments round a dome of radius r: DOME_MIN_SEGMENTS, rising by four a metre past three metres, at most 40. */
export const domeSegments = (r: number): number => Math.max(DOME_MIN_SEGMENTS, Math.min(40, 4 * Math.round(r * 2)));

/** A revolve's profile: [height over the start, radius] from the bottom up (PartSink.revolve's order). */
export type DomeProfile = Array<[number, number]>;

/**
 * Catmull-Rom through a coarse profile (a frustum stack's rings, a bulb's swell), `steps` rows between each pair, so the
 * same silhouette turns smooth: the kits' onion bulbs and mounds keep their drawn shape.
 */
export function smoothProfile(points: ReadonlyArray<readonly [number, number]>, steps = 3): DomeProfile {
  const out: DomeProfile = [];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const c = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), Math.max(0, c(1))]);
    }
  }
  const last = points[points.length - 1];
  out.push([last[0], last[1]]);
  // a profile never turns back on itself in height (a revolve of a fold would wind inside out)
  for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][0]) out[i][0] = out[i - 1][0];
  return out;
}

export type DomeForm = 'hemisphere' | 'pointed' | 'saucer';

export interface DomeOptions {
  form?: DomeForm;
  /** the shell rises this share of r straight before it turns (a stilted dome) */
  stilt?: number;
  /** two stepped haunch rings at the foot (the Levant's and the Maghreb's stepped base that sheds the drum's rain) */
  haunch?: boolean;
  /** the shell ends at this radius in a flat ring (a lantern's seat) instead of closing at the crown */
  openTop?: number;
  rings?: number;
  segments?: number;
  emit?: EmitOptions;
}

export interface DomeShell {
  /** the crown's height (the open ring's, for openTop) */
  top: number;
  /** the point on the shell's true surface at elevation `elev` (0 the springing, pi/2 the crown) and azimuth `phi`, `o` out */
  surface: (elev: number, phi: number, o?: number) => Vec3;
  /** the outward normal there */
  normal: (elev: number, phi: number) => Vec3;
}

/**
 * A dome of radius r springing at y over (x, z): a hemisphere, a pointed (two-centred) dome as Bengal's and the Mamluks'
 * are, or a saucer; stilted, on stepped haunches, closed at the crown or open to a lantern's ring. Returns where its
 * surface lies, for the bosses and finials set on it.
 */
export function smoothDome(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, opts: DomeOptions = {}): DomeShell {
  const form = opts.form ?? 'hemisphere';
  const n = Math.max(opts.segments ?? 0, domeSegments(r)), rings = Math.max(opts.rings ?? 0, DOME_MIN_RINGS, Math.round(r * 3.5));
  const s1 = opts.haunch ? Math.min(0.16, r * 0.06) : 0, s2 = opts.haunch ? Math.min(0.12, r * 0.045) : 0, base = s1 + s2;
  const stilt = r * (opts.stilt ?? 0);
  // the silhouette's arc: its centre (cx radially, from the axis), its radius rho, the angle it runs to at the crown
  const k = form === 'pointed' ? 1.3 : 1, rho = r * k, cx = r - rho, sy = form === 'saucer' ? 0.62 : 1;
  const thetaCrown = Math.acos(Math.max(-1, Math.min(1, -cx / rho)));
  const radiusAt = (th: number) => cx + rho * Math.cos(th), heightAt = (th: number) => rho * Math.sin(th) * sy;
  let thTop = thetaCrown;
  if (opts.openTop !== undefined && opts.openTop > 0) thTop = Math.acos(Math.max(-1, Math.min(1, (opts.openTop - cx) / rho)));
  const y0 = base + stilt;
  const profile: DomeProfile = opts.haunch ? [[0, r + 0.24], [s1, r + 0.24], [s1, r + 0.12], [base, r + 0.12], [base, r]] : [[0, r]];
  if (stilt > 0) profile.push([y0, r]);
  for (let i = 1; i <= rings; i++) {
    const th = thTop * i / rings;
    profile.push([y0 + heightAt(th), Math.max(0, radiusAt(th))]);
  }
  if (opts.openTop !== undefined && opts.openTop > 0) profile.push([profile[profile.length - 1][0], 0]);
  sink.revolve(bucket, [x, y, z], 'y', profile, n, opts.emit ?? {});
  // elevation measured on the arc (0 the springing, pi/2 the crown) mapped to the arc's own angle
  const th = (elev: number) => thetaCrown * Math.min(1, Math.max(0, elev / (Math.PI / 2)));
  const normal = (elev: number, phi: number): Vec3 => {
    const t = th(elev), nr = Math.cos(t), ny = Math.sin(t) / sy;
    const l = Math.hypot(nr, ny);
    return [nr / l * Math.cos(phi), ny / l, nr / l * Math.sin(phi)];
  };
  const surface = (elev: number, phi: number, o = 0): Vec3 => {
    const t = th(elev), rr = radiusAt(t), hh = y + y0 + heightAt(t), nn = normal(elev, phi);
    return [x + rr * Math.cos(phi) + nn[0] * o, hh + nn[1] * o, z + rr * Math.sin(phi) + nn[2] * o];
  };
  return { top: y + y0 + heightAt(thTop), surface, normal };
}

/**
 * Glass bell-lights through a dome's shell (the qamariyyat of a hammam): in rings at the given elevations, each a short
 * glass boss seated `sinkM` into the shell (its facets lie at most r(1 - cos(pi/n)) inside the true sphere) and standing
 * `proudM` out, its lit face to the sky. Dressing.
 */
export function glassBosses(sink: PartSink, shell: DomeShell, rings: ReadonlyArray<readonly [number, number]>, radius: number, look: () => number,
  opts: { sinkM?: number; proudM?: number; fine?: boolean } = {}): void {
  const sinkM = opts.sinkM ?? 0.05, proudM = opts.proudM ?? 0.07, fine = opts.fine ? { fine: true } : {};
  for (const [elev, count] of rings) {
    const off = look() * Math.PI * 2 / count;
    for (let k = 0; k < count; k++) {
      const phi = off + k * Math.PI * 2 / count, d = shell.normal(elev, phi);
      sink.pipe('glass', shell.surface(elev, phi, -sinkM), shell.surface(elev, phi, proudM), radius, 6, { decor: true, ...fine }, radius * 0.8);
      const t1 = normalize3([-d[2], 0, d[0]]), t2: Vec3 = [d[1] * t1[2] - d[2] * t1[1], d[2] * t1[0] - d[0] * t1[2], d[0] * t1[1] - d[1] * t1[0]];
      const c = shell.surface(elev, phi, proudM), rr = radius * 0.8;
      const cap: Vec3[] = Array.from({ length: 6 }, (_, i) => {
        const a = i / 6 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        return [c[0] + (t1[0] * ca + t2[0] * sa) * rr, c[1] + (t1[1] * ca + t2[1] * sa) * rr, c[2] + (t1[2] * ca + t2[2] * sa) * rr];
      });
      sink.polygon('curtain', cap, { decor: true, window: d, ...fine });
    }
  }
}

/**
 * A metal finial on a crown at (x, y, z): the alem's stem, two balls and its crescent (a mosque's, a bath's), or the
 * stem and a cross. `scale` 1 stands about 1.4 m. Dressing, in a coloured bucket.
 */
export function finialOn(sink: PartSink, x: number, y: number, z: number, scale: number, colour: Rgb, kind: 'alem' | 'cross' = 'alem'): void {
  const s = scale, o = { colour, decor: true } as const;
  if (kind === 'cross') {
    sink.revolve('structureMetal', [x, y - 0.05, z], 'y', [[0, 0.06 * s], [0.18 * s, 0.05 * s], [0.18 * s, 0.1 * s], [0.3 * s, 0.1 * s], [0.34 * s, 0.03 * s], [0.34 * s, 0]], 8, o);
    sink.span('structureMetal', x - 0.025 * s, y + 0.3 * s, z - 0.025 * s, x + 0.025 * s, y + 1.3 * s, z + 0.025 * s, o);
    sink.span('structureMetal', x - 0.3 * s, y + 0.92 * s, z - 0.025 * s, x + 0.3 * s, y + 1.0 * s, z + 0.025 * s, o);
    return;
  }
  sink.revolve('structureMetal', [x, y - 0.05, z], 'y', [[0, 0.05 * s], [0.25 * s, 0.035 * s], [0.25 * s, 0.11 * s], [0.36 * s, 0.13 * s], [0.47 * s, 0.11 * s],
    [0.5 * s, 0.03 * s], [0.62 * s, 0.07 * s], [0.72 * s, 0.03 * s], [0.95 * s, 0.015 * s], [0.95 * s, 0]], 8, o);
  // the crescent: an arc of short members, its horns to the sky
  // (kitConnectivity: the bowl stood 2.7 cm over the stem's tip) its belly sunk into the stem below the tip
  const cy = y + 1.02 * s, R = 0.18 * s, pts: Vec3[] = [];
  for (let k = 0; k <= 6; k++) { const a = Math.PI * (1.15 + 0.7 * k / 6); pts.push([x + Math.cos(a) * R, cy + Math.sin(a) * R, z]); }
  for (let k = 0; k + 1 < pts.length; k++) {
    const w = 0.035 * s * (1 - Math.abs(k - 2.5) / 4);
    sink.member('structureMetal', pts[k], pts[k + 1], Math.max(0.012, w), 0.025 * s, [0, 0, 1], { ...o, exposed: true }, 0);
  }
}

/**
 * A plastered or stone drum, round, from y rising h at radius r, turned smooth (no flat facets), with a base course and a
 * stepped cornice of `cornice` (dressing beyond the shell). Returns the cornice's top.
 */
export function roundDrum(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, h: number,
  cornice: RegionalBucket, emit: EmitOptions = {}): number {
  const n = domeSegments(r);
  sink.revolve(bucket, [x, y, z], 'y', [[0, r], [h, r], [h, 0]], n, emit);
  sink.revolve(cornice, [x, y, z], 'y', [[-0.02, r + 0.07], [0.2, r + 0.07], [0.2, r]], n, { ...emit, decor: true });
  sink.revolve(cornice, [x, y + h, z], 'y', [[-0.02, r], [-0.02, r + 0.1], [0.1, r + 0.1], [0.1, r + 0.18], [0.22, r + 0.18], [0.22, 0]], n, { ...emit, decor: true });
  return y + h + 0.22;
}

/**
 * A bulb (an onion, a shingled Alpine bulb, a lantern's cap) from the frustum rows a kit drew it in — [height, radius at
 * the foot, radius at the head] from the bottom up — turned smooth through the same silhouette (smoothProfile), closed
 * underneath and at its head. Returns the head's height.
 */
export function bulb(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number,
  rows: ReadonlyArray<readonly [number, number, number]>, emit: EmitOptions = {}): number {
  const pts: Array<[number, number]> = [[0, rows[0][1]]];
  let h = 0;
  for (const [dh, , r1] of rows) { h += dh; pts.push([h, r1]); }
  const rMax = Math.max(...rows.map(([, a, b]) => Math.max(a, b)));
  const profile: DomeProfile = [[0, 0], ...smoothProfile(pts, Math.max(2, Math.ceil(DOME_MIN_RINGS / rows.length))), [h, 0]];
  sink.revolve(bucket, [x, y, z], 'y', profile, domeSegments(rMax), emit);
  return y + h;
}

/**
 * The one sanctioned polygonal dome: a cloister vault over a polygonal body (an octagonal turret's cupola, as the
 * Vijecnica's corner turrets carry), its `sides` gores flat with crisp arrises on the body's corners and its profile
 * curved in `rows` (dome-detail-275). Use it only where the body under it is itself polygonal; a round body takes
 * smoothDome. Drawn as faces (no revolve), so domeDetail.selftest's round-dome laws do not apply to it. `phase` turns
 * the corners as PartSink.cylinder's phase does. Returns the apex's height.
 */
export function polygonalDome(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, r: number, sides: number,
  emit: EmitOptions = {}, phase = 0, rows = 8): number {
  const ring = (k: number): Vec3[] => {
    const th = (Math.PI / 2) * k / rows, rr = Math.cos(th) * r, yy = y + Math.sin(th) * r;
    return Array.from({ length: sides }, (_, i) => {
      const a = -(i / sides * Math.PI * 2 + phase);
      return [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr] as Vec3;
    });
  };
  const apex: Vec3 = [x, y + r, z];
  let lo = ring(0);
  for (let k = 1; k <= rows; k++) {
    const hi = k < rows ? ring(k) : null;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      if (hi) sink.quad(bucket, lo[i], lo[j], hi[j], hi[i], emit);
      else sink.polygon(bucket, [lo[i], lo[j], apex], emit);
    }
    if (hi) lo = hi;
  }
  return y + r;
}
