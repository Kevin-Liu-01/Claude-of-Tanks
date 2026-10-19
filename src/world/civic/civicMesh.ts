// src/world/civic/civicMesh.ts — the civic kit's world-space mesh writer (the maps lane, 228): flush skins draped over
// the ground (a square's bands, a path's gravel, a pavement's flags), profiles run along the ground (kerb units, a
// dwarf wall and its coping, a box hedge), each vertex seated on the ground under it (the seatSlab law: no level step
// at a joint, nothing floating over a fall). One non-indexed geometry on the props' vertex-coloured baked material:
// position, normal, uv (world, 0.3 a metre) and linear colour. Pure geometry: no materials, no draws from any stream.
import * as THREE from 'three';

export type Rgb = readonly [number, number, number];
type XZ = readonly [number, number];

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** An sRGB hex colour in linear albedo. */
export const hexRgb = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
export const scaleRgb = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A position hash in [0, 1): a flag's or a stone's tone, never a placement stream. */
export function civicHash(a: number, b: number, salt: number): number {
  let h = (Math.imul(Math.round(a * 97) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(b * 89) | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** A colour toned by a position hash (±k). */
export const toned = (c: Rgb, x: number, z: number, k: number, salt = 0): Rgb => scaleRgb(c, 1 + (civicHash(x, z, salt) - 0.5) * 2 * k);

export class CivicMesh {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  readonly t: number[] = [];
  readonly ground: (x: number, z: number) => number;
  constructor(ground: (x: number, z: number) => number) { this.ground = ground; }

  get triangles(): number { return this.p.length / 9; }

  /** A triangle with its face normal, wound to face `out` (default up). */
  tri(a: readonly number[], b: readonly number[], c: readonly number[], col: Rgb, out: readonly number[] = [0, 1, 0]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { const s = b; b = c; c = s; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-9)) return;
    for (const q of [a, b, c]) {
      this.p.push(q[0], q[1], q[2]); this.n.push(nx / l, ny / l, nz / l); this.c.push(col[0], col[1], col[2]); this.t.push(q[0] * 0.3, q[2] * 0.3);
    }
  }

  /** A quad a b c d (in order round it), wound to face `out`. */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], col: Rgb, out: readonly number[] = [0, 1, 0]): void {
    this.tri(a, b, c, col, out); this.tri(a, c, d, col, out);
  }

  /**
   * A flush skin over the ground: the quad with corners a b c d (round it, in the plane), cut into cells no longer than
   * `cell` m a side, each vertex `lift` over the ground under it.
   */
  skin(a: XZ, b: XZ, c: XZ, d: XZ, lift: number, col: Rgb | ((x: number, z: number) => Rgb), cell = 1.5): void {
    const nu = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - d[0], c[1] - d[1])) / cell));
    const nv = Math.max(1, Math.ceil(Math.max(Math.hypot(d[0] - a[0], d[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1])) / cell));
    const at = (i: number, j: number): number[] => {
      const u = i / nu, v = j / nv;
      const x = (a[0] * (1 - u) + b[0] * u) * (1 - v) + (d[0] * (1 - u) + c[0] * u) * v;
      const z = (a[1] * (1 - u) + b[1] * u) * (1 - v) + (d[1] * (1 - u) + c[1] * u) * v;
      return [x, this.ground(x, z) + lift, z];
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const p00 = at(i, j), p10 = at(i + 1, j), p11 = at(i + 1, j + 1), p01 = at(i, j + 1);
      const k = typeof col === 'function' ? col((p00[0] + p11[0]) / 2, (p00[2] + p11[2]) / 2) : col;
      this.quad(p00, p10, p11, p01, k);
    }
  }

  /** A flush skin over an axis-aligned rectangle. */
  skinRect(x0: number, z0: number, x1: number, z1: number, lift: number, col: Rgb | ((x: number, z: number) => Rgb), cell = 1.5): void {
    this.skin([x0, z0], [x1, z0], [x1, z1], [x0, z1], lift, col, cell);
  }

  /** A flush ring (r0..r1) round (x, z) in `seg` segments, each its own colour (`col(k)`); r0 = 0 a disc. */
  skinRing(x: number, z: number, r0: number, r1: number, seg: number, lift: number, col: (k: number) => Rgb, a0 = 0, a1 = Math.PI * 2): void {
    for (let k = 0; k < seg; k++) {
      const p = a0 + (a1 - a0) * (k / seg), q = a0 + (a1 - a0) * ((k + 1) / seg);
      const pt = (r: number, a: number): number[] => { const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r; return [px, this.ground(px, pz) + lift, pz]; };
      const k2 = col(k);
      if (r0 <= 0) { const cpt = [x, this.ground(x, z) + lift, z]; this.tri(cpt, pt(r1, p), pt(r1, q), k2); continue; }
      this.quad(pt(r0, p), pt(r1, p), pt(r1, q), pt(r0, q), k2);
    }
  }

  /**
   * A profile run from a to b along the ground: `section(end)` the section's [across, y] points at that end (across
   * along `side`, a unit vector normal to the run; y absolute), counter-clockwise seen from b; its long faces and its two
   * end caps (convex sections).
   */
  run(a: XZ, b: XZ, side: XZ, section: (end: 0 | 1) => ReadonlyArray<readonly [number, number]>, col: Rgb | ((face: number) => Rgb), caps = true): void {
    const s0 = section(0), s1 = section(1), n = s0.length;
    const at = (o: XZ, p: readonly [number, number]): number[] => [o[0] + side[0] * p[0], p[1], o[1] + side[1] * p[0]];
    const ax = b[0] - a[0], az = b[1] - a[1], al = Math.hypot(ax, az) || 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // the face's outward normal: the section edge's normal in (side, up), with no along part
      const ds = s0[j][0] - s0[i][0], dy = s0[j][1] - s0[i][1];
      const out = [side[0] * dy, -ds, side[1] * dy];
      const k = typeof col === 'function' ? col(i) : col;
      this.quad(at(a, s0[i]), at(b, s1[i]), at(b, s1[j]), at(a, s0[j]), k, out);
    }
    if (!caps) return;
    const capCol = typeof col === 'function' ? col(-1) : col;
    for (const [o, sec, sign] of [[a, s0, -1], [b, s1, 1]] as const) {
      const out = [ax / al * sign, 0, az / al * sign];
      for (let i = 1; i + 1 < n; i++) this.tri(at(o, sec[0]), at(o, sec[i]), at(o, sec[i + 1]), capCol, out);
    }
  }

  /**
   * A block standing on the ground: centre (x, z), turned `yaw` (its local x across, z along: world = R_y(yaw)),
   * half extents hw × hd, its top `h` over the ground at its centre (`level`) or over the ground at each corner, its foot
   * `embed` into the ground; the top's arrises chamfered by `ch`.
   */
  block(x: number, z: number, yaw: number, hw: number, hd: number, h: number, col: Rgb | ((face: number) => Rgb),
    opts: { embed?: number; level?: boolean; ch?: number; top?: number } = {}): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const w = (u: number, v: number): XZ => [x + u * c + v * s, z - u * s + v * c];
    const a = w(0, -hd), b = w(0, hd), side: XZ = [c, -s];
    const g0 = this.ground(a[0], a[1]), g1 = this.ground(b[0], b[1]);
    const gm = this.ground(x, z), embed = opts.embed ?? 0.06, ch = Math.min(opts.ch ?? 0, hw * 0.4, h * 0.4);
    const foot = Math.min(g0, g1, gm) - embed;
    const topAt = (end: 0 | 1) => opts.top ?? (opts.level ? gm + h : (end ? g1 : g0) + h);
    this.run(a, b, side, (end) => {
      const t = topAt(end);
      return ch > 0
        ? [[-hw, foot], [hw, foot], [hw, t - ch], [hw - ch, t], [-hw + ch, t], [-hw, t - ch]]
        : [[-hw, foot], [hw, foot], [hw, t], [-hw, t]];
    }, col);
  }

  geometry(name: string): THREE.BufferGeometry | null {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.name = name;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}
