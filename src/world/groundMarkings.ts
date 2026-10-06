// src/world/groundMarkings.ts — paint on the paved ground (the map-revival lane, 2026-10-05: Kestrel Airfield's apron
// markings, at the coordinator's ruling: "receive-only decal strips on the apron … thin quads a few millimetres up, no
// shadow casting, faded paint with breaks at the joints. Taxi centrelines, stand numbers and lead-in lines are enough;
// keep the draws to one or two merged buckets").
//
// A map authors its stripes (polylines with a width and a paint) and its numbers (seven-segment numerals, ICAO style on a
// painted box); this module turns them into one geometry: the stripes' corners rounded into curves, each stripe broken
// where it crosses a joint of the pavement's slab grid (the sealant flexes and the paint flakes off it), nothing inside the
// keep-outs, every vertex seated on the ground the caller gives (props.ts: the terrain mesh as drawn) a few centimetres
// up. The paint's tone is vertex colour and alpha, faded a little stripe to stripe; the wear inside a stripe is the
// worn-paint mask (wornPaintTexture), sampled in world metres so it runs on across every stripe. No randomness: the
// fade is a hash of the stripe's place.
import * as THREE from 'three';

type GroundPaint = 'yellow' | 'white' | 'black';

interface GroundMarkingLine {
  /** the stripe's nodes (x, z), metres; corners are rounded into curves */
  points: ReadonlyArray<readonly [number, number]>;
  /** the stripe's width, metres */
  width: number;
  paint: GroundPaint;
  /** how far a corner's curve starts before the node (metres, default 8; never past 40 % of either leg) */
  round?: number;
}

interface GroundMarkingNumber {
  /** the numerals' centre */
  x: number;
  z: number;
  /** the direction the numerals read toward — their tops point along it (degrees; 0 is +z, 90 is +x) */
  headingDeg: number;
  /** digits only */
  text: string;
  /** the numerals' height, metres */
  height: number;
  paint: GroundPaint;
  /** a box painted under the numerals, half a numeral's width round them */
  box?: GroundPaint;
}

interface GroundMarkingKeepOut { x0: number; x1: number; z0: number; z1: number }

export interface GroundMarkingsConfig {
  lines: readonly GroundMarkingLine[];
  numbers?: readonly GroundMarkingNumber[];
  /** ground no stripe or number paints (a runway, a set piece's plot) */
  keepOut?: readonly GroundMarkingKeepOut[];
  /** the pavement's slab grid, metres (the splat pavement's slabM); 0 = no joints */
  slabM?: number;
  /** the paint lost each side of a joint, metres across the joint */
  breakM?: number;
}

/** sRGB paint tones (aged: the chrome yellow gone toward the concrete, the white toward cream) and their opacity. */
const PAINT: Record<GroundPaint, { hex: number; alpha: number }> = {
  yellow: { hex: 0xcfa846, alpha: 0.84 },
  white: { hex: 0xe2dfd3, alpha: 0.8 },
  black: { hex: 0x22221f, alpha: 0.7 },
};
/** the worn-paint mask's tile, metres */
const WEAR_TILE_M = 7;
/** a stripe is cut into pieces no longer than this so it follows the ground */
const PIECE_M = 2.5;

function hash2(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 8) + 0x9e37, 0x85ebca6b) ^ Math.imul(Math.round(z * 8) + 0x7f4a, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 8) / 16777216;
}

/** The stripe's centreline with each interior corner replaced by a quadratic curve (control at the node). */
function roundedPolyline(points: ReadonlyArray<readonly [number, number]>, round: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], [cx, cz] = points[i + 1];
    const l0 = Math.hypot(bx - ax, bz - az), l1 = Math.hypot(cx - bx, cz - bz);
    if (l0 < 1e-6 || l1 < 1e-6) continue;
    const t0x = (bx - ax) / l0, t0z = (bz - az) / l0, t1x = (cx - bx) / l1, t1z = (cz - bz) / l1;
    const turn = Math.acos(Math.max(-1, Math.min(1, t0x * t1x + t0z * t1z)));
    if (turn < 0.02) { out.push([bx, bz]); continue; }
    const d = Math.min(round, 0.4 * l0, 0.4 * l1);
    const px = bx - t0x * d, pz = bz - t0z * d, qx = bx + t1x * d, qz = bz + t1z * d;
    const steps = Math.max(3, Math.ceil(turn / 0.12));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      out.push([u * u * px + 2 * u * t * bx + t * t * qx, u * u * pz + 2 * u * t * bz + t * t * qz]);
    }
  }
  const last = points[points.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** The parameter interval [s0, s1] (metres along a leg from (ax, az), direction (tx, tz), length len) inside a rect. */
function legInsideRect(ax: number, az: number, tx: number, tz: number, len: number, r: GroundMarkingKeepOut): [number, number] | null {
  let lo = 0, hi = len;
  for (const [p, d, min, max] of [[ax, tx, r.x0, r.x1], [az, tz, r.z0, r.z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < min || p > max) return null; continue; }
    let a = (min - p) / d, b = (max - p) / d;
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a); hi = Math.min(hi, b);
    if (lo >= hi) return null;
  }
  return [lo, hi];
}

interface Sink { pos: number[]; col: number[]; uv: number[]; idx: number[] }

function paintRgba(paint: GroundPaint, fadeX: number, fadeZ: number): [number, number, number, number] {
  const p = PAINT[paint];
  const c = new THREE.Color(p.hex); // sRGB hex into the working (linear) space
  const f = 0.9 + 0.1 * hash2(fadeX, fadeZ);
  return [c.r * f, c.g * f, c.b * f, p.alpha * (0.88 + 0.12 * hash2(fadeZ + 3.1, fadeX - 7.7))];
}

function pushVertex(sink: Sink, x: number, y: number, z: number, rgba: readonly number[]): number {
  sink.pos.push(x, y, z);
  sink.col.push(rgba[0], rgba[1], rgba[2], rgba[3]);
  sink.uv.push(x / WEAR_TILE_M, z / WEAR_TILE_M);
  return sink.pos.length / 3 - 1;
}

/** A flat quad on the ground from its four corners (counter-clockwise seen from above). */
function pushQuad(sink: Sink, corners: ReadonlyArray<readonly [number, number]>, groundAt: (x: number, z: number) => number,
  lift: number, rgba: readonly number[]): void {
  const base = corners.map(([x, z]) => pushVertex(sink, x, groundAt(x, z) + lift, z, rgba));
  sink.idx.push(base[0], base[2], base[1], base[0], base[3], base[2]);
}

function emitLine(sink: Sink, line: GroundMarkingLine, cfg: GroundMarkingsConfig, groundAt: (x: number, z: number) => number,
  lift: number, paved: ((x: number, z: number) => boolean) | null): number {
  if (line.points.length < 2) return 0;
  const pts = roundedPolyline(line.points, line.round ?? 8);
  const half = line.width / 2, slab = cfg.slabM ?? 0, brk = cfg.breakM ?? 0.09;
  let pieces = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
    // what this leg loses: the keep-outs, and a gap at every slab joint it crosses squarely enough to show one
    const cuts: Array<[number, number]> = [];
    for (const r of cfg.keepOut ?? []) {
      const inside = legInsideRect(ax, az, tx, tz, len, r);
      if (inside) cuts.push(inside);
    }
    if (slab > 0) {
      for (const [p0, d, n] of [[ax, tx, nx], [az, tz, nz]] as const) {
        if (Math.abs(d) < 0.35) continue; // running along the joints: no break to see
        const gap = brk / Math.abs(d) + half * Math.abs(n) / Math.abs(d);
        const p1 = p0 + d * len;
        for (let k = Math.ceil(Math.min(p0, p1) / slab); k * slab <= Math.max(p0, p1); k++) {
          const s = (k * slab - p0) / d;
          cuts.push([s - gap, s + gap]);
        }
      }
    }
    cuts.sort((a, b) => a[0] - b[0]);
    // the painted spans: the leg less its cuts
    const spans: Array<[number, number]> = [];
    let at = 0;
    for (const [c0, c1] of cuts) {
      if (c0 > at) spans.push([at, Math.min(c0, len)]);
      at = Math.max(at, c1);
      if (at >= len) break;
    }
    if (at < len) spans.push([at, len]);
    for (const [s0, s1] of spans) {
      if (s1 - s0 < 0.06) continue;
      const rgba = paintRgba(line.paint, ax + tx * s0, az + tz * s0);
      const n = Math.max(1, Math.ceil((s1 - s0) / PIECE_M));
      for (let k = 0; k < n; k++) {
        const u0 = s0 + (s1 - s0) * k / n, u1 = s0 + (s1 - s0) * (k + 1) / n;
        const x0 = ax + tx * u0, z0 = az + tz * u0, x1 = ax + tx * u1, z1 = az + tz * u1;
        if (paved && !paved((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        pushQuad(sink, [[x0 - nx * half, z0 - nz * half], [x1 - nx * half, z1 - nz * half],
          [x1 + nx * half, z1 + nz * half], [x0 + nx * half, z0 + nz * half]], groundAt, lift, rgba);
        pieces++;
      }
    }
  }
  return pieces;
}

/** The seven segments as glyph-local rectangles [u0, v0, u1, v1] (u along the reading, v up; w wide, h tall, s stroke).
 * The verticals run the full half heights and the bars stop at them, so no two segments overlap (a translucent paint
 * drawn twice reads darker). */
function segmentRects(w: number, h: number, s: number): Record<string, [number, number, number, number]> {
  return {
    a: [s, h - s, w - s, h], b: [w - s, h / 2, w, h], c: [w - s, 0, w, h / 2], d: [s, 0, w - s, s],
    e: [0, 0, s, h / 2], f: [0, h / 2, s, h], g: [s, h / 2 - s / 2, w - s, h / 2 + s / 2],
  };
}
const DIGITS: Record<string, string> = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function emitNumber(sink: Sink, num: GroundMarkingNumber, cfg: GroundMarkingsConfig, groundAt: (x: number, z: number) => number,
  lift: number): number {
  if ((cfg.keepOut ?? []).some((r) => num.x >= r.x0 && num.x <= r.x1 && num.z >= r.z0 && num.z <= r.z1)) return 0;
  const digits = [...num.text].filter((ch) => DIGITS[ch]);
  if (!digits.length) return 0;
  const h = num.height, w = h * 0.56, s = h * 0.17, gap = h * 0.3;
  const totalW = digits.length * w + (digits.length - 1) * gap;
  const a = num.headingDeg * Math.PI / 180;
  // v: the numerals' up (the heading); u: the reading direction, the right hand of someone facing the heading. (u, v)
  // turns the other way round from the stripes' (along, across) frame, so a quad here lists its corners u-first
  // clockwise to face up.
  const vx = Math.sin(a), vz = Math.cos(a), ux = -vz, uz = vx;
  const at = (gu: number, gv: number): [number, number] => [num.x + ux * gu + vx * gv, num.z + uz * gu + vz * gv];
  let pieces = 0;
  if (num.box) {
    const pu = totalW / 2 + w * 0.5, pv = h / 2 + w * 0.5;
    pushQuad(sink, [at(-pu, -pv), at(-pu, pv), at(pu, pv), at(pu, -pv)], groundAt, lift, paintRgba(num.box, num.x, num.z));
    pieces++;
  }
  const rgba = paintRgba(num.paint, num.z, num.x);
  const rects = segmentRects(w, h, s);
  digits.forEach((ch, i) => {
    const u = -totalW / 2 + i * (w + gap);
    for (const seg of DIGITS[ch]) {
      const [u0, v0, u1, v1] = rects[seg];
      // the numerals sit a few millimetres over their box (one draw: the later triangles blend over the earlier)
      pushQuad(sink, [at(u + u0, v0 - h / 2), at(u + u0, v1 - h / 2), at(u + u1, v1 - h / 2), at(u + u1, v0 - h / 2)],
        groundAt, lift + 0.004, rgba);
      pieces++;
    }
  });
  return pieces;
}

/** The marked ground as one geometry (position, normal, colour with alpha, uv in wear tiles), or null when nothing paints.
 * `paved` (optional) is the ground paint stands on: a stripe's piece off it is left out (the grass verge between a
 * taxiway and its apron takes no paint). */
export function buildGroundMarkingGeometry(cfg: GroundMarkingsConfig, groundAt: (x: number, z: number) => number,
  lift = 0.035, paved: ((x: number, z: number) => boolean) | null = null): { geometry: THREE.BufferGeometry; pieces: number } | null {
  const sink: Sink = { pos: [], col: [], uv: [], idx: [] };
  let pieces = 0;
  // boxes and their numerals after the stripes: a number painted over a line covers it
  for (const line of cfg.lines) pieces += emitLine(sink, line, cfg, groundAt, lift, paved);
  for (const num of cfg.numbers ?? []) pieces += emitNumber(sink, num, cfg, groundAt, lift);
  if (!sink.idx.length) return null;
  const geometry = new THREE.BufferGeometry();
  const count = sink.pos.length / 3;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(sink.pos, 3));
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) normals[i * 3 + 1] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(sink.col, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(sink.uv, 2));
  geometry.setIndex(sink.idx);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, pieces };
}

/** The ground paint stands on: an apron's own rect (0.3 m in from its edges) or within 2.2 m of a road's line — inside the
 * narrowest a carriageway's noisy edge comes, so the grass verge between a taxiway and its apron takes no paint. */
export function pavedGround(hardstands: ReadonlyArray<{ x: number; z: number; width: number; length: number; yawDeg?: number }>,
  roads: ReadonlyArray<ReadonlyArray<readonly [number, number]>>): (x: number, z: number) => boolean {
  const strips = hardstands.map((h) => {
    const a = (h.yawDeg ?? 0) * Math.PI / 180;
    return { x: h.x, z: h.z, c: Math.cos(a), s: Math.sin(a), hw: h.width / 2 - 0.3, hl: h.length / 2 - 0.3 };
  });
  return (px, pz) => {
    for (const r of strips) {
      const dx = px - r.x, dz = pz - r.z;
      if (Math.abs(dx * r.c - dz * r.s) <= r.hw && Math.abs(dx * r.s + dz * r.c) <= r.hl) return true;
    }
    for (const line of roads) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i], ex = bx - ax, ez = bz - az, len2 = ex * ex + ez * ez;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len2)) : 0;
      if (Math.hypot(px - ax - ex * t, pz - az - ez * t) < 2.2) return true;
    }
    return false;
  };
}

/** The worn-paint mask: white, its alpha the paint left — mostly whole, thinned in drifts, lost in flakes and tyre
 * scuffs. Tileable value noise on a periodic lattice, so the wear runs on across tiles; no DOM (a DataTexture). */
export function wornPaintTexture(anisotropy = 4): THREE.DataTexture {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const lattice = (period: number, salt: number) => {
    const values = new Float32Array(period * period);
    for (let i = 0; i < values.length; i++) values[i] = hash2(i * 1.37 + salt, salt * 0.71 - i * 0.29);
    return (x: number, y: number) => {
      const fx = x * period, fy = y * period;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => values[((j % period + period) % period) * period + ((i % period + period) % period)];
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return top + (bottom - top) * sy;
    };
  };
  const drift = lattice(4, 11), flake = lattice(16, 23), grain = lattice(48, 37);
  const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const thin = 0.55 + 0.45 * smooth(0.25, 0.7, drift(u, v));        // drifts where the paint has thinned
      const lost = smooth(0.66, 0.8, flake(u, v) * 0.75 + grain(u, v) * 0.25); // flakes gone to the concrete
      const a = Math.max(0.12, thin * (1 - 0.85 * lost) * (0.86 + 0.14 * grain(u, v)));
      const o = (y * N + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.name = 'ground-markings-wear';
  texture.needsUpdate = true;
  return texture;
}
