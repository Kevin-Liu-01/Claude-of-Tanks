// src/world/maps/craftMesh.ts — the member-by-member mesh writer the looks lane's small props share (gateKit.ts, the
// wells and monuments): timbers with their grain along their length on the structure wood, masonry coursed level on a
// kit's stone print, iron and timber over a stone or render print's flat texel; round poles; turns and tilts of a
// written part (a leaf swung on its hinge, a broken piece laid down). Pure geometry: no DOM, no materials, no draws from
// any stream (hash noise).
import * as THREE from 'three';

export type V3 = [number, number, number];
export type Rgb = readonly [number, number, number];
/** The axes (a member's `side` hint). */
export const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

// ---------------------------------------------------------------------------------------------------------------
// colour (linear) and noise

export const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hexLin = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
export const mul = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
export const mulc = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** A deterministic stream of its own (the gate's member jitter): never the placement streams. */
export function stream(seed: number): () => number {
  let i = 0;
  return () => hash(i++, 0x6a7e, seed);
}

// ---------------------------------------------------------------------------------------------------------------
// the surfaces

/** The structure wood's tile: 0.55 repeats a metre, grain along v, planks 0.4 m across in u (timberGrain.ts). */
export const WOOD_UV_PER_M = 0.55;
/** The kits' stone and render prints: 0.5 repeats a metre (regionalSurfaces.ts). */
export const STONE_UV_PER_M = 0.5;
/** The structure wood's mean luminance (timberGrain.ts paints 0.55..1): vertex colours are albedo over it. */
export const WOOD_PRINT_MEAN = 0.8;

/**
 * One flat texel of each regional stone print (tools: the looks stream's flat-texel.mjs over regionalSurfaces.ts
 * masonry at its default seed, tint 1): the flattest 13 px window inside a block's face, its uv on the GPU (v = 1 - row)
 * and its untinted sRGB value. A gate's timber and iron sample it and carry their own colour over its value.
 */
export const STONE_FLAT_TEXEL: Readonly<Record<string, { uv: readonly [number, number]; srgb: Rgb }>> = Object.freeze({
  'sandstone:dressed': { uv: [0.8682, 0.4092], srgb: [0.941, 0.941, 0.937] },
  sandstone: { uv: [0.2744, 0.7412], srgb: [0.871, 0.965, 1] },
  granite: { uv: [0.1768, 0.2021], srgb: [0.878, 0.922, 0.965] },
  limestone: { uv: [0.5674, 0.8545], srgb: [0.945, 0.937, 0.929] },
  rubble: { uv: [0.708, 0.1904], srgb: [0.878, 0.827, 0.78] },
  brick: { uv: [0.8955, 0.0615], srgb: [0.839, 0.878, 0.918] },
  greywacke: { uv: [0.8525, 0.7764], srgb: [0.855, 0.851, 0.847] },
  fieldstone: { uv: [0.29, 0.9404], srgb: [0.886, 0.859, 0.827] },
  gneiss: { uv: [0.7549, 0.7725], srgb: [0.808, 0.796, 0.78] },
});

/** How one gate's surfaces map: the timber gates (structure wood), the stone gate (kit stone), the mud gate (render). */
export interface Surface {
  kind: 'wood' | 'stone' | 'render';
  /** stone: the flat texel's linear albedo (tint x value); render: the render print's mean albedo */
  texel?: Rgb;
  flatUv?: readonly [number, number];
}

// ---------------------------------------------------------------------------------------------------------------
// the mesh writer

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** How a member's faces take their print: a timber's grain along its length, a stone's courses level, a flat texel. */
export type UvMode = { kind: 'grain'; u0: number } | { kind: 'masonry' } | { kind: 'flat' };

export class Mesh {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly t: number[] = [];
  readonly c: number[] = [];
  readonly surface: Surface;
  constructor(surface: Surface) { this.surface = surface; }
  /** A colour (linear albedo) as the vertex colour over this surface's print. */
  colour(albedo: Rgb, printed: boolean): Rgb {
    const s = this.surface;
    if (s.kind === 'wood') return mul(albedo, 1 / WOOD_PRINT_MEAN);
    if (!printed && s.texel) return [albedo[0] / s.texel[0], albedo[1] / s.texel[1], albedo[2] / s.texel[2]];
    return albedo;
  }
  tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, ua: readonly [number, number], ub: readonly [number, number],
    uc: readonly [number, number], col: Rgb): void {
    for (const [p, n, u] of [[a, na, ua], [b, nb, ub], [c, nc, uc]] as const) {
      this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.t.push(u[0], u[1]); this.c.push(col[0], col[1], col[2]);
    }
  }
  /**
   * A flat quad a b c d wound to face `out` (the normal its own, turned to agree), its uvs by `uv`, its colour by `shade`
   * at each corner (linear albedo before the print's division).
   */
  quad(a: V3, b: V3, c: V3, d: V3, out: V3, uv: (q: V3, n: V3) => [number, number], shade: (q: V3, n: V3) => Rgb, printed: boolean): void {
    let g = norm(cross(sub(b, a), sub(d, a)));
    if (dot(g, out) < 0) { const t = b; b = d; d = t; g = scl(g, -1); }
    for (const q of [a, b, c, a, c, d]) {
      const col = this.colour(shade(q, g), printed), u = uv(q, g);
      this.p.push(q[0], q[1], q[2]); this.n.push(g[0], g[1], g[2]); this.t.push(u[0], u[1]); this.c.push(col[0], col[1], col[2]);
    }
  }
  /** The vertices written since `from`, turned about the vertical line (x0, z0) by `yaw`. */
  turn(from: number, x0: number, z0: number, yaw: number): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = from; i < this.p.length; i += 3) {
      const x = this.p[i] - x0, z = this.p[i + 2] - z0;
      this.p[i] = x0 + x * c + z * s; this.p[i + 2] = z0 - x * s + z * c;
      const nx = this.n[i], nz = this.n[i + 2];
      this.n[i] = nx * c + nz * s; this.n[i + 2] = -nx * s + nz * c;
    }
  }
  /** The vertices written since `from`, laid over: turned about the axis through `pivot` along `axis` by `angle`. */
  tilt(from: number, pivot: V3, axis: V3, angle: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...norm(axis)), angle);
    const v = new THREE.Vector3();
    for (let i = from; i < this.p.length; i += 3) {
      v.set(this.p[i] - pivot[0], this.p[i + 1] - pivot[1], this.p[i + 2] - pivot[2]).applyQuaternion(q);
      this.p[i] = v.x + pivot[0]; this.p[i + 1] = v.y + pivot[1]; this.p[i + 2] = v.z + pivot[2];
      v.set(this.n[i], this.n[i + 1], this.n[i + 2]).applyQuaternion(q);
      this.n[i] = v.x; this.n[i + 1] = v.y; this.n[i + 2] = v.z;
    }
  }
  get mark(): number { return this.p.length; }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/**
 * A member: the box from `a` to `b` (its axis), `w` across (along `side`, perpendicular to the axis) and `h` the third
 * way, with chamfered long arrises (`chamfer` m). Faces the `skip` list names (0 start end, 1 end end) are left out.
 */
export function member(m: Mesh, a: V3, b: V3, w: number, h: number, side: V3, col: Rgb, uvMode: UvMode,
  opts: { chamfer?: number; skipEnds?: boolean; shade?: (q: V3, n: V3) => Rgb } = {}): void {
  const axis = norm(sub(b, a)), len = Math.hypot(...sub(b, a));
  let s = norm(sub(side, scl(axis, dot(side, axis))));
  if (!Number.isFinite(s[0]) || Math.hypot(...s) < 0.5) s = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const t = norm(cross(axis, s));
  const ch = Math.min(opts.chamfer ?? 0, w * 0.3, h * 0.3);
  // the section: a rectangle with its corners cut (8 points), or 4
  const hw = w / 2, hh = h / 2;
  const sec: Array<[number, number]> = ch > 0
    ? [[hw, hh - ch], [hw - ch, hh], [-hw + ch, hh], [-hw, hh - ch], [-hw, -hh + ch], [-hw + ch, -hh], [hw - ch, -hh], [hw, -hh + ch]]
    : [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
  const at = (o: V3, k: number): V3 => add(o, add(scl(s, sec[k][0]), scl(t, sec[k][1])));
  const shade = opts.shade ?? (() => col);
  const uvOf = (q: V3, n: V3): [number, number] => {
    if (uvMode.kind === 'flat') return [m.surface.flatUv?.[0] ?? 0.5, m.surface.flatUv?.[1] ?? 0.5];
    const along = dot(sub(q, a), axis);
    if (uvMode.kind === 'grain') {
      // the grain along the member; across, a window inside one plank of the tile (0.4 m: 0.22 of a tile)
      const across = dot(sub(q, a), Math.abs(dot(n, s)) > 0.7 ? t : s);
      const span = Math.max(w, h) * WOOD_UV_PER_M;
      const k = span > 0.16 ? 0.16 / span : 1;
      return [uvMode.u0 + (across * WOOD_UV_PER_M) * k, along * WOOD_UV_PER_M];
    }
    // masonry: courses level, the face's horizontal along u (world-placed so neighbours' joints run on)
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]);
    return ay > 0.6 ? [q[0] * STONE_UV_PER_M, q[2] * STONE_UV_PER_M]
      : ax > 0.5 ? [q[2] * STONE_UV_PER_M, q[1] * STONE_UV_PER_M] : [q[0] * STONE_UV_PER_M, q[1] * STONE_UV_PER_M];
  };
  const printed = uvMode.kind !== 'flat';
  const N = sec.length;
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    const mid = scl(add(add(scl(s, sec[k][0]), scl(t, sec[k][1])), add(scl(s, sec[k2][0]), scl(t, sec[k2][1]))), 0.5);
    m.quad(at(a, k), at(b, k), at(b, k2), at(a, k2), mid, uvOf, shade, printed);
  }
  if (!opts.skipEnds) {
    const cap = (o: V3, out: V3) => {
      const ring = sec.map((_, k) => at(o, k));
      for (let k = 1; k + 1 < N; k++) {
        const q0 = ring[0], q1 = ring[k], q2 = ring[k + 1];
        const g = dot(norm(cross(sub(q1, q0), sub(q2, q0))), out) < 0;
        const [x1, x2] = g ? [q2, q1] : [q1, q2];
        const nn = out;
        for (const q of [q0, x1, x2]) {
          const col = m.colour(shade(q, nn), printed), u = uvOf(q, nn);
          m.p.push(q[0], q[1], q[2]); m.n.push(nn[0], nn[1], nn[2]); m.t.push(u[0], u[1]); m.c.push(col[0], col[1], col[2]);
        }
      }
    };
    cap(a, scl(axis, -1));
    cap(b, axis);
  }
}

/** A round pole from `a` to `b` (radius r0 at a, r1 at b), `seg` sides, grain along it. */
export function pole(m: Mesh, a: V3, b: V3, r0: number, r1: number, col: Rgb, u0: number, seg = 6,
  opts: { nodes?: number; nodeCol?: Rgb } = {}): void {
  // (on the stone or the render a pole is timber over the print's flat texel, never the masonry)
  const flat = m.surface.kind !== 'wood', fuv = m.surface.flatUv ?? [0.5, 0.5];
  const axis = norm(sub(b, a)), len = Math.hypot(...sub(b, a));
  const s = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t = norm(cross(axis, s));
  const rings = Math.max(1, opts.nodes ?? 1);
  const pt = (o: V3, r: number, k: number): V3 => {
    const ang = (k / seg) * Math.PI * 2;
    return add(o, add(scl(s, Math.cos(ang) * r), scl(t, Math.sin(ang) * r)));
  };
  const nrm = (k: number): V3 => { const ang = ((k) / seg) * Math.PI * 2; return add(scl(s, Math.cos(ang)), scl(t, Math.sin(ang))); };
  for (let ring = 0; ring < rings; ring++) {
    const f0 = ring / rings, f1 = (ring + 1) / rings;
    const o0 = add(a, scl(axis, len * f0)), o1 = add(a, scl(axis, len * f1));
    const ra = r0 + (r1 - r0) * f0, rb = r0 + (r1 - r0) * f1;
    for (let k = 0; k < seg; k++) {
      const p00 = pt(o0, ra, k), p01 = pt(o0, ra, k + 1), p10 = pt(o1, rb, k), p11 = pt(o1, rb, k + 1);
      const n0 = nrm(k), n1 = nrm(k + 1);
      const u = (kk: number) => u0 + (kk / seg) * 0.12;
      const c = m.colour(col, !flat);
      const uv = (uu: number, vv: number): [number, number] => (flat ? [fuv[0], fuv[1]] : [uu, vv]);
      m.tri(p00, p10, p11, n0, n0, n1, uv(u(k), len * f0 * WOOD_UV_PER_M), uv(u(k), len * f1 * WOOD_UV_PER_M), uv(u(k + 1), len * f1 * WOOD_UV_PER_M), c);
      m.tri(p00, p11, p01, n0, n1, n1, uv(u(k), len * f0 * WOOD_UV_PER_M), uv(u(k + 1), len * f1 * WOOD_UV_PER_M), uv(u(k + 1), len * f0 * WOOD_UV_PER_M), c);
    }
    if (opts.nodes && opts.nodeCol && ring > 0) {
      // a bamboo node: a slim dark collar where the rings meet
      member(m, add(o0, scl(axis, -0.012)), add(o0, scl(axis, 0.012)), ra * 2.25, ra * 2.25, s, opts.nodeCol, flat ? { kind: 'flat' } : { kind: 'grain', u0 });
    }
  }
  // the cut end at the top
  const top = add(a, scl(axis, len)), c = m.colour(mul(col, 0.85), !flat);
  const tu: [number, number] = flat ? [fuv[0], fuv[1]] : [u0, 0];
  for (let k = 0; k < seg; k++) m.tri(top, pt(top, r1, k), pt(top, r1, k + 1), axis, axis, axis, tu, tu, tu, c);
}
