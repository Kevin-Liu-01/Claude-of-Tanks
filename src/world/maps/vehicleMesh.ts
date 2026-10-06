// src/world/maps/vehicleMesh.ts — the map-vehicles lane's mesh toolkit (2026-10-05).
//
// Every civilian vehicle, cart, boat and wreck part the maps place is assembled here into ONE indexed geometry with
// four streams: position, normal, uv (the shared vehicle paint detail tile, mapped from the surface) and colour, plus
// a fifth, `surf` (normalized bytes: roughness, metalness, paint mask), which the vehicle material reads
// (vehicleSurface.ts): the glass is glossy and dark, the chrome metallic, the rubber matte, and the body paint takes
// each instance's own colour through the paint mask.
//
// The shapes are surfaces, not boxes: `grid` meshes any parametric patch (a body loft, a canopy, a hull) with smooth
// normals and crisp material edges (a vertex is shared only inside one material), `lathe` turns profiles (tyres,
// rims, lamps, tanks), `sweep` and `tube` run sections along paths (fenders, bumpers, rails), `box` carries a chamfer
// that catches the light. The colours are baked once per build from the materials and the vehicle's weathering
// (vehicleWeathering below): a voxel ambient occlusion with the ground as an occluder, so a body settles on its
// shadow, wheel arches and beds go dark and the underside is never lit; dirt splashed up the lower panels and behind
// the wheels in the map's own soil; dust on the dry maps' top faces; rust on old bodies; and the burnt state.
//
// Deterministic and renderer-free (THREE only for the final BufferGeometry): no Math.random, no clock.

import * as THREE from 'three';

export type Vec3 = [number, number, number];

export type MaterialRole =
  | 'paint' | 'glass' | 'chrome' | 'rubber' | 'trim' | 'lamp' | 'lampRed' | 'lampAmber' | 'wood' | 'canvas'
  | 'steel' | 'under' | 'interior' | 'plate' | 'cargo' | 'rust';

export interface VehicleMaterial {
  readonly role: MaterialRole;
  /** Linear albedo. Paint carries a light neutral the instance colour tints (paint mask 1). */
  readonly rgb: readonly [number, number, number];
  readonly rough: number;
  readonly metal: number;
  /** Share of the instance colour this surface takes (body paint 1, everything else 0). */
  readonly paint: number;
  /** How readily dirt, dust and rust settle on it (glass and lamps little, body and chassis fully). */
  readonly weather: number;
}

export function material(role: MaterialRole, rgb: readonly [number, number, number], rough: number, metal = 0,
  paint = 0, weather = 1): VehicleMaterial {
  return Object.freeze({ role, rgb: Object.freeze([rgb[0], rgb[1], rgb[2]] as [number, number, number]), rough, metal, paint, weather });
}

/** sRGB hex to a linear triple (authoring colours are written as the eye reads them). */
export function linearHex(hex: number, scale = 1): [number, number, number] {
  const c = (v: number) => {
    const s = v / 255;
    return (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * scale;
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

/** The weathering a build bakes into its colours (vehicleWeathering's output). */
export interface VehicleWeathering {
  /** Soil splashed up the lower body (linear) and how much (0..1). */
  readonly dirtRgb: readonly [number, number, number];
  readonly dirt: number;
  /** Height the dirt fades out by (m). */
  readonly dirtTop: number;
  /** Dust on the upward faces (dry maps). */
  readonly dustRgb: readonly [number, number, number];
  readonly dust: number;
  /** 0 new .. 1 derelict: rust blooms on the lower edges and seams. */
  readonly rust: number;
  /** The burnt-out state: paint to char and oxide, glass and rubber gone, lamps dead. */
  readonly burnt: boolean;
  /** Wheel centres (z, y) and radii: the spray zones behind them. */
  readonly wheels: readonly { z: number; y: number; r: number }[];
  /** Per-model salt for the noise fields. */
  readonly seed: number;
  /** Bake the voxel ambient occlusion (desktop); the mobile tier takes the analytic term only. */
  readonly voxelAo: boolean;
}

// ---------------------------------------------------------------------------------------------------- noise

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Trilinear value noise in [0, 1). */
export function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    v += w * hash3(xi + dx, yi + dy, zi + dz, seed);
  }
  return v;
}

function fbm(x: number, y: number, z: number, seed: number): number {
  return valueNoise(x, y, z, seed) * 0.55 + valueNoise(x * 2.03, y * 2.03, z * 2.03, seed + 17) * 0.3
    + valueNoise(x * 4.1, y * 4.1, z * 4.1, seed + 41) * 0.15;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------------- the sink

type Mat34 = Float64Array; // row-major 3x4

function identity(): Mat34 { return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]); }
function multiply(a: Mat34, b: Mat34): Mat34 {
  const o = new Float64Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
    }
  }
  return o;
}

/**
 * Accumulates one vehicle: vertices carry a material index and are coloured at `build`. Transforms compose like a
 * scene graph (`push`, then `translate` / `rotate*` / `scale` apply to everything emitted until `pop`); a mirroring
 * transform flips the winding so faces stay outward.
 */
export class VehicleMesh {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly mat: number[] = [];
  private readonly idx: number[] = [];
  private readonly materials: VehicleMaterial[] = [];
  /** Vertex indices emitted inside `outboard` (mirrors) and `dressing` (seams, handles, trim): from, to pairs. */
  private readonly outboardRuns: number[] = [];
  private readonly dressingRuns: number[] = [];
  private readonly materialIds = new Map<VehicleMaterial, number>();
  private m: Mat34 = identity();
  private readonly stack: Mat34[] = [];
  private cof: Float64Array = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private flipped = false;
  /** The mobile tier: boxes drop their chamfers. */
  coarse = false;

  get vertexCount(): number { return this.pos.length / 3; }
  get triangleCount(): number { return this.idx.length / 3; }

  push(): this { this.stack.push(this.m); return this; }
  pop(): this { const m = this.stack.pop(); if (!m) throw new Error('VehicleMesh: pop without push'); this.setMatrix(m); return this; }

  private setMatrix(m: Mat34): void {
    this.m = m;
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    // cofactor matrix (det * inverse-transpose), signed back to the true normal transform below
    const cof = new Float64Array([
      e * i - f * h, -(d * i - f * g), d * h - e * g,
      -(b * i - c * h), a * i - c * g, -(a * h - b * g),
      b * f - c * e, -(a * f - c * d), a * e - b * d,
    ]);
    const det = a * cof[0] + b * cof[1] + c * cof[2];
    this.flipped = det < 0;
    if (det < 0) for (let k = 0; k < 9; k++) cof[k] = -cof[k];
    this.cof = cof;
  }

  private apply(t: Mat34): this { this.setMatrix(multiply(this.m, t)); return this; }
  translate(x: number, y: number, z: number): this { return this.apply(new Float64Array([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z])); }
  scale(x: number, y: number, z: number): this { return this.apply(new Float64Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0])); }
  rotateX(r: number): this { const c = Math.cos(r), s = Math.sin(r); return this.apply(new Float64Array([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0])); }
  rotateY(r: number): this { const c = Math.cos(r), s = Math.sin(r); return this.apply(new Float64Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0])); }
  rotateZ(r: number): this { const c = Math.cos(r), s = Math.sin(r); return this.apply(new Float64Array([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0])); }

  /** Emit the same parts twice: as authored and mirrored across x = 0 (the vehicle's centre plane). */
  /**
   * Parts outside the body that neither fit nor collide (the mirrors on their arms): drawn as any other part, kept out
   * of the body box the fit reads (`geometry.userData.bodyBox`) and out of the solid the collision is taken from.
   */
  outboard(emit: () => void): void {
    const from = this.pos.length / 3;
    emit();
    this.outboardRuns.push(from, this.pos.length / 3);
  }

  /**
   * Surface dressing a few millimetres proud of the body (door seams, handles, trim strips, wipers): drawn as any other
   * part and left out of the collision solids (`geometry.userData.noCollisionVertices`, read by structureCollision.ts
   * like a separate noCollision geometry).
   */
  dressing(emit: () => void): void {
    const from = this.pos.length / 3;
    emit();
    this.dressingRuns.push(from, this.pos.length / 3);
  }

  mirrored(emit: (side: 1 | -1) => void): void {
    emit(1);
    this.push().scale(-1, 1, 1);
    emit(-1);
    this.pop();
  }

  private materialId(m: VehicleMaterial): number {
    let id = this.materialIds.get(m);
    if (id === undefined) { id = this.materials.length; this.materials.push(m); this.materialIds.set(m, id); }
    return id;
  }

  /** One vertex in the current frame. */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, m: VehicleMaterial): number {
    const t = this.m, c = this.cof;
    this.pos.push(t[0] * x + t[1] * y + t[2] * z + t[3], t[4] * x + t[5] * y + t[6] * z + t[7], t[8] * x + t[9] * y + t[10] * z + t[11]);
    let ox = c[0] * nx + c[1] * ny + c[2] * nz, oy = c[3] * nx + c[4] * ny + c[5] * nz, oz = c[6] * nx + c[7] * ny + c[8] * nz;
    const l = Math.hypot(ox, oy, oz) || 1;
    ox /= l; oy /= l; oz /= l;
    this.nrm.push(ox, oy, oz);
    this.mat.push(this.materialId(m));
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    if (this.flipped) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void { this.tri(a, b, c); this.tri(a, c, d); }

  /**
   * A parametric patch: `at(i, j, out)` writes the point of grid row i (0..nu) and column j (0..nv). Normals follow
   * the grid (cross of the i and j derivatives, so the patch faces where i x j points); quads take `matAt(i, j)` and
   * share vertices only within one material, so every material edge is crisp. `creaseJ` lists columns where the
   * surface folds (normals one-sided either side); closed directions wrap.
   */
  grid(nu: number, nv: number, at: (i: number, j: number, out: Vec3) => void, matAt: (i: number, j: number) => VehicleMaterial,
    opts: { closeU?: boolean; closeV?: boolean; creaseI?: readonly number[]; creaseJ?: readonly number[]; flip?: boolean;
      skip?: (i: number, j: number) => boolean } = {}): void {
    const ru = opts.closeU ? nu : nu + 1, rv = opts.closeV ? nv : nv + 1;
    const P = new Float64Array(ru * rv * 3);
    const tmp: Vec3 = [0, 0, 0];
    for (let i = 0; i < ru; i++) for (let j = 0; j < rv; j++) {
      at(i, j, tmp);
      const k = (i * rv + j) * 3;
      P[k] = tmp[0]; P[k + 1] = tmp[1]; P[k + 2] = tmp[2];
    }
    const wrapI = (i: number) => (opts.closeU ? ((i % ru) + ru) % ru : Math.max(0, Math.min(ru - 1, i)));
    const wrapJ = (j: number) => (opts.closeV ? ((j % rv) + rv) % rv : Math.max(0, Math.min(rv - 1, j)));
    const creaseI = new Set(opts.creaseI ?? []), creaseJ = new Set(opts.creaseJ ?? []);
    const pt = (i: number, j: number, out: Vec3): Vec3 => {
      const k = (wrapI(i) * rv + wrapJ(j)) * 3;
      out[0] = P[k]; out[1] = P[k + 1]; out[2] = P[k + 2];
      return out;
    };
    const a: Vec3 = [0, 0, 0], b: Vec3 = [0, 0, 0];
    // derivative along one direction from the side `side` (-1 backward, +1 forward, 0 central), stepping past
    // degenerate (collapsed) neighbours
    const deriv = (i: number, j: number, alongI: boolean, side: number, out: Vec3): boolean => {
      for (let step = 1; step <= 3; step++) {
        const lo = side > 0 ? 0 : -step, hi = side < 0 ? 0 : step;
        if (alongI) {
          const i0 = opts.closeU ? i + lo : Math.max(0, i + lo), i1 = opts.closeU ? i + hi : Math.min(nu, i + hi);
          pt(i1, j, a); pt(i0, j, b);
        } else {
          const j0 = opts.closeV ? j + lo : Math.max(0, j + lo), j1 = opts.closeV ? j + hi : Math.min(nv, j + hi);
          pt(i, j1, a); pt(i, j0, b);
        }
        out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
        if (Math.hypot(out[0], out[1], out[2]) > 1e-7) return true;
      }
      return false;
    };
    const du: Vec3 = [0, 0, 0], dv: Vec3 = [0, 0, 0];
    const normalAt = (i: number, j: number, si: number, sj: number, out: Vec3): void => {
      const okU = deriv(i, j, true, si, du), okV = deriv(i, j, false, sj, dv);
      if (okU && okV) {
        out[0] = du[1] * dv[2] - du[2] * dv[1]; out[1] = du[2] * dv[0] - du[0] * dv[2]; out[2] = du[0] * dv[1] - du[1] * dv[0];
      } else { out[0] = 0; out[1] = 1; out[2] = 0; }
      if (opts.flip) { out[0] = -out[0]; out[1] = -out[1]; out[2] = -out[2]; }
      const l = Math.hypot(out[0], out[1], out[2]);
      if (l < 1e-12) { out[0] = 0; out[1] = 1; out[2] = 0; } else { out[0] /= l; out[1] /= l; out[2] /= l; }
    };
    const cache = new Map<number, number>();
    const n: Vec3 = [0, 0, 0], p: Vec3 = [0, 0, 0];
    const vertexFor = (i: number, j: number, si: number, sj: number, m: VehicleMaterial): number => {
      const wi = wrapI(i), wj = wrapJ(j);
      const sideI = creaseI.has(i) || creaseI.has(wi) ? si : 0, sideJ = creaseJ.has(j) || creaseJ.has(wj) ? sj : 0;
      const key = (((wi * rv + wj) * 9 + (sideI + 1) * 3 + (sideJ + 1)) * 256) + this.materialId(m);
      let v = cache.get(key);
      if (v === undefined) {
        pt(i, j, p);
        normalAt(i, j, sideI, sideJ, n);
        v = this.vertLocal(p, n, m);
        cache.set(key, v);
      }
      return v;
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      if (opts.skip?.(i, j)) continue;
      const m = matAt(i, j);
      const v00 = vertexFor(i, j, 1, 1, m), v10 = vertexFor(i + 1, j, -1, 1, m);
      const v11 = vertexFor(i + 1, j + 1, -1, -1, m), v01 = vertexFor(i, j + 1, 1, -1, m);
      // drop collapsed triangles (a cone's apex row, a section pinched to a point)
      const ok = (x: number, y: number, z: number) => {
        const ax = this.pos[y * 3] - this.pos[x * 3], ay = this.pos[y * 3 + 1] - this.pos[x * 3 + 1], az = this.pos[y * 3 + 2] - this.pos[x * 3 + 2];
        const bx = this.pos[z * 3] - this.pos[x * 3], by = this.pos[z * 3 + 1] - this.pos[x * 3 + 1], bz = this.pos[z * 3 + 2] - this.pos[x * 3 + 2];
        return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) > 1e-9;
      };
      if (opts.flip) {
        if (ok(v00, v11, v10)) this.tri(v00, v11, v10);
        if (ok(v00, v01, v11)) this.tri(v00, v01, v11);
      } else {
        if (ok(v00, v10, v11)) this.tri(v00, v10, v11);
        if (ok(v00, v11, v01)) this.tri(v00, v11, v01);
      }
    }
  }

  private vertLocal(p: Vec3, n: Vec3, m: VehicleMaterial): number {
    return this.vert(p[0], p[1], p[2], n[0], n[1], n[2], m);
  }

  /**
   * A surface of revolution about the local X axis (wheels lie across the vehicle): `profile` lists (radius, x) from
   * one end to the other; `matAt(k)` colours the band between profile points k and k + 1. `segments` around,
   * optionally only an arc (a0..a1, angles from +y toward +z). The outside faces away from the axis when the profile
   * runs toward +x with the radius growing outward... callers pass `flip` when their profile runs the other way.
   */
  lathe(profile: readonly (readonly [number, number])[], segments: number, matAt: (k: number) => VehicleMaterial,
    opts: { a0?: number; a1?: number; creases?: readonly number[]; flip?: boolean; radial?: (k: number, s: number) => number } = {}): void {
    const full = opts.a0 === undefined && opts.a1 === undefined;
    const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? Math.PI * 2;
    this.grid(profile.length - 1, segments, (i, j, out) => {
      const ang = a0 + (a1 - a0) * (j / segments);
      const r = profile[i][0] * (opts.radial ? opts.radial(i, full ? j % segments : j) : 1);
      out[0] = profile[i][1]; out[1] = Math.cos(ang) * r; out[2] = Math.sin(ang) * r;
    }, (i) => matAt(i), { closeV: full, creaseI: opts.creases, flip: !opts.flip });
  }

  /** An axis-aligned box centred at (x, y, z), its edges chamfered by `c` (0 = sharp). */
  box(x: number, y: number, z: number, w: number, h: number, d: number, m: VehicleMaterial, c = 0): void {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const cc = this.coarse ? 0 : Math.max(0, Math.min(c, hx * 0.49, hy * 0.49, hz * 0.49));
    // a face of the convex box: wound outward (its normal agrees with its centroid's direction from the centre)
    const flat = (pts: Vec3[]) => {
      const e1: Vec3 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
      const e2: Vec3 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      let cx = 0, cy = 0, cz = 0;
      for (const q of pts) { cx += q[0]; cy += q[1]; cz += q[2]; }
      if (nx * cx + ny * cy + nz * cz < 0) { pts = [...pts].reverse(); nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const v = pts.map((q) => this.vert(x + q[0], y + q[1], z + q[2], nx, ny, nz, m));
      for (let k = 1; k + 1 < v.length; k++) this.tri(v[0], v[k], v[k + 1]);
    };
    if (cc === 0) {
      for (const s of [1, -1]) {
        flat([[s * hx, -hy, -hz], [s * hx, hy, -hz], [s * hx, hy, hz], [s * hx, -hy, hz]]);
        flat([[-hx, s * hy, -hz], [hx, s * hy, -hz], [hx, s * hy, hz], [-hx, s * hy, hz]]);
        flat([[-hx, -hy, s * hz], [hx, -hy, s * hz], [hx, hy, s * hz], [-hx, hy, s * hz]]);
      }
      return;
    }
    // each corner cut into three points, one on each face it touches
    const P = (sx: number, sy: number, sz: number, axis: 0 | 1 | 2): Vec3 => [
      sx * (axis === 0 ? hx : hx - cc), sy * (axis === 1 ? hy : hy - cc), sz * (axis === 2 ? hz : hz - cc),
    ];
    for (const s of [1, -1]) {
      flat([P(s, -1, -1, 0), P(s, 1, -1, 0), P(s, 1, 1, 0), P(s, -1, 1, 0)]);
      flat([P(-1, s, -1, 1), P(1, s, -1, 1), P(1, s, 1, 1), P(-1, s, 1, 1)]);
      flat([P(-1, -1, s, 2), P(1, -1, s, 2), P(1, 1, s, 2), P(-1, 1, s, 2)]);
    }
    for (const a of [1, -1]) for (const b of [1, -1]) {
      flat([P(a, b, -1, 0), P(a, b, 1, 0), P(a, b, 1, 1), P(a, b, -1, 1)]); // edges along z
      flat([P(a, -1, b, 0), P(a, 1, b, 0), P(a, 1, b, 2), P(a, -1, b, 2)]); // edges along y
      flat([P(-1, a, b, 1), P(1, a, b, 1), P(1, a, b, 2), P(-1, a, b, 2)]); // edges along x
    }
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      flat([P(sx, sy, sz, 0), P(sx, sy, sz, 1), P(sx, sy, sz, 2)]);
    }
  }

  /** A tube of radius r along a path (closed sections, parallel-transported frames), capped at open ends. */
  tube(path: readonly Vec3[], r: number | ((k: number) => number), segments: number, m: VehicleMaterial,
    opts: { closed?: boolean; caps?: boolean } = {}): void {
    const radius = typeof r === 'number' ? () => r : r;
    this.sweep(path, Array.from({ length: segments }, (_, k) => {
      const a = (k / segments) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)] as [number, number];
    }), () => m, { closedPath: opts.closed, closedSection: true, scaleAt: radius, caps: opts.caps ?? !opts.closed });
  }

  /**
   * A section swept along a path. The section's (x, y) map to the frame's (side, up); `up` sets the initial frame
   * (default: world up, or x when the path runs vertically). `scaleAt(k)` scales the section at path point k.
   */
  sweep(path: readonly Vec3[], section: readonly (readonly [number, number])[], matAt: (k: number) => VehicleMaterial,
    opts: { closedPath?: boolean; closedSection?: boolean; scaleAt?: (k: number) => number; up?: Vec3; caps?: boolean;
      creases?: readonly number[] } = {}): void {
    const n = path.length;
    const tangents: Vec3[] = [];
    for (let k = 0; k < n; k++) {
      const prev = path[opts.closedPath ? (k - 1 + n) % n : Math.max(0, k - 1)];
      const next = path[opts.closedPath ? (k + 1) % n : Math.min(n - 1, k + 1)];
      const t: Vec3 = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
      const l = Math.hypot(t[0], t[1], t[2]) || 1;
      tangents.push([t[0] / l, t[1] / l, t[2] / l]);
    }
    // parallel transport of a side vector
    const sides: Vec3[] = [], ups: Vec3[] = [];
    let up: Vec3 = opts.up ?? (Math.abs(tangents[0][1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
    for (let k = 0; k < n; k++) {
      const t = tangents[k];
      let sx = up[1] * t[2] - up[2] * t[1], sy = up[2] * t[0] - up[0] * t[2], sz = up[0] * t[1] - up[1] * t[0];
      let l = Math.hypot(sx, sy, sz);
      if (l < 1e-6) { sx = 1; sy = 0; sz = 0; l = 1; }
      sx /= l; sy /= l; sz /= l;
      const ux = t[1] * sz - t[2] * sy, uy = t[2] * sx - t[0] * sz, uz = t[0] * sy - t[1] * sx;
      sides.push([sx, sy, sz]); ups.push([ux, uy, uz]);
      up = [ux, uy, uz];
    }
    const ns = section.length;
    const scale = opts.scaleAt ?? (() => 1);
    this.grid(opts.closedPath ? n : n - 1, opts.closedSection ? ns : ns - 1, (i, j, out) => {
      const k = opts.closedPath ? i % n : i, q = section[opts.closedSection ? j % ns : j], s = scale(k);
      const P = path[k], S = sides[k], U = ups[k];
      out[0] = P[0] + (S[0] * q[0] + U[0] * q[1]) * s;
      out[1] = P[1] + (S[1] * q[0] + U[1] * q[1]) * s;
      out[2] = P[2] + (S[2] * q[0] + U[2] * q[1]) * s;
    }, (i) => matAt(i), { closeU: opts.closedPath, closeV: opts.closedSection, creaseJ: opts.creases, flip: true });
    if (opts.caps && !opts.closedPath && opts.closedSection) {
      for (const end of [0, n - 1]) {
        const s = scale(end), P = path[end], S = sides[end], U = ups[end], T = tangents[end];
        const sign = end === 0 ? -1 : 1, m = matAt(Math.max(0, Math.min(n - 2, end)));
        const centre = this.vert(P[0], P[1], P[2], T[0] * sign, T[1] * sign, T[2] * sign, m);
        const ring = section.map((q) => this.vert(P[0] + (S[0] * q[0] + U[0] * q[1]) * s, P[1] + (S[1] * q[0] + U[1] * q[1]) * s,
          P[2] + (S[2] * q[0] + U[2] * q[1]) * s, T[0] * sign, T[1] * sign, T[2] * sign, m));
        for (let k = 0; k < ns; k++) {
          if (sign < 0) this.tri(centre, ring[(k + 1) % ns], ring[k]);
          else this.tri(centre, ring[k], ring[(k + 1) % ns]);
        }
      }
    }
  }

  /** A flat convex polygon (points in order, counter-clockwise seen from the side it faces). */
  polygon(points: readonly Vec3[], m: VehicleMaterial): void {
    const e1: Vec3 = [points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]];
    const e2: Vec3 = [points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const v = points.map((q) => this.vert(q[0], q[1], q[2], nx, ny, nz, m));
    for (let k = 1; k + 1 < v.length; k++) this.tri(v[0], v[k], v[k + 1]);
  }

  /**
   * Bake the colours and the surface stream and hand back one indexed geometry. `weathering` drives the dirt, dust,
   * rust and burn fields and the occlusion; `paintRgb` is the light neutral body paint stands in for (the instance
   * colour multiplies it in game).
   */
  build(weathering: VehicleWeathering): THREE.BufferGeometry {
    const count = this.pos.length / 3;
    const position = new Float32Array(this.pos);
    const normal = new Float32Array(this.nrm);
    const uv = new Float32Array(count * 2);
    const color = new Float32Array(count * 3);
    const surf = new Uint8Array(count * 3);
    const ao = ambientOcclusion(position, normal, this.idx, weathering.voxelAo);
    for (let v = 0; v < count; v++) {
      const px = position[v * 3], py = position[v * 3 + 1], pz = position[v * 3 + 2];
      const nx = normal[v * 3], ny = normal[v * 3 + 1], nz = normal[v * 3 + 2];
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ax >= ay && ax >= az) { uv[v * 2] = pz * 0.85; uv[v * 2 + 1] = py * 0.85; }
      else if (ay >= az) { uv[v * 2] = px * 0.85; uv[v * 2 + 1] = pz * 0.85; }
      else { uv[v * 2] = px * 0.85; uv[v * 2 + 1] = py * 0.85; }
      const m = this.materials[this.mat[v]];
      const out = shadeVertex(m, px, py, pz, ny, ao[v], weathering);
      color[v * 3] = out[0]; color[v * 3 + 1] = out[1]; color[v * 3 + 2] = out[2];
      surf[v * 3] = Math.round(out[3] * 255); surf[v * 3 + 1] = Math.round(out[4] * 255); surf[v * 3 + 2] = Math.round(out[5] * 255);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('surf', new THREE.BufferAttribute(surf, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(count <= 65535 ? new Uint16Array(this.idx) : new Uint32Array(this.idx), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    // the body's own box (the outboard parts left out) and the outboard vertex runs, for the fit and the collision
    const outboard = new Uint8Array(count);
    for (let k = 0; k < this.outboardRuns.length; k += 2) outboard.fill(1, this.outboardRuns[k], this.outboardRuns[k + 1]);
    const body = new THREE.Box3(), at = new THREE.Vector3();
    for (let v = 0; v < count; v++) if (!outboard[v]) body.expandByPoint(at.set(position[v * 3], position[v * 3 + 1], position[v * 3 + 2]));
    geometry.userData.bodyBox = body;
    if (this.outboardRuns.length) geometry.userData.outboard = outboard;
    if (this.outboardRuns.length || this.dressingRuns.length) {
      const noCollision = outboard.slice();
      for (let k = 0; k < this.dressingRuns.length; k += 2) noCollision.fill(1, this.dressingRuns[k], this.dressingRuns[k + 1]);
      geometry.userData.noCollisionVertices = noCollision;
    }
    return geometry;
  }
}

// ---------------------------------------------------------------------------------------------------- shading

const _shade = new Float64Array(6);
const CHAR: readonly [number, number, number] = [0.022, 0.019, 0.017];
const OXIDE: readonly [number, number, number] = [0.105, 0.042, 0.018];
const ASH: readonly [number, number, number] = [0.20, 0.19, 0.175];
const RUST: readonly [number, number, number] = [0.16, 0.062, 0.026];

function mix3(o: Float64Array, c: readonly [number, number, number], t: number): void {
  o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t;
}

/** One vertex's colour and surface: material, occlusion, then the weathering fields (or the burn). */
function shadeVertex(m: VehicleMaterial, px: number, py: number, pz: number, ny: number,
  occlusion: number, w: VehicleWeathering): Float64Array {
  const o = _shade;
  o[0] = m.rgb[0]; o[1] = m.rgb[1]; o[2] = m.rgb[2];
  let rough = m.rough, metal = m.metal, paint = m.paint;
  const seed = w.seed;
  if (w.burnt) {
    // the burn: paint to char with oxide blooms (the upper panels go to ash-grey and orange oxide, the lower to soot),
    // glass gone (the dark cabin shows), rubber gone, chrome dulled
    const heat = fbm(px * 1.7, py * 1.7, pz * 1.7, seed + 301);
    const up = Math.max(0, ny);
    if (m.role === 'glass' || m.role === 'interior' || m.role === 'lamp' || m.role === 'lampRed' || m.role === 'lampAmber') {
      o[0] = CHAR[0] * 0.8; o[1] = CHAR[1] * 0.8; o[2] = CHAR[2] * 0.8; rough = 0.95; metal = 0;
    } else if (m.role === 'rubber') {
      o[0] = CHAR[0]; o[1] = CHAR[1]; o[2] = CHAR[2]; rough = 0.98; metal = 0;
    } else if (m.role === 'wood' || m.role === 'canvas' || m.role === 'cargo') {
      o[0] = CHAR[0] * 1.2; o[1] = CHAR[1] * 1.1; o[2] = CHAR[2]; rough = 0.97; metal = 0;
    } else {
      // burnt sheet steel: mottled oxide brown, the hottest panels (roof, bonnet) burnt through to grey-white ash,
      // soot-black in patches and streaked up the sides above the waist where the flames left the cabin
      o[0] = OXIDE[0]; o[1] = OXIDE[1]; o[2] = OXIDE[2];
      const mottle = fbm(px * 4.1, py * 4.1, pz * 4.1, seed + 307);
      mix3(o, RUST, smooth(0.45, 0.75, mottle) * 0.6);
      mix3(o, ASH, smooth(0.5, 0.8, heat) * up * 0.85);
      mix3(o, CHAR, smooth(0.62, 0.82, fbm(px * 2.2, py * 2.2, pz * 2.2, seed + 311)) * 0.75);
      if (Math.abs(ny) < 0.55) mix3(o, CHAR, smooth(0.85, 1.5, py) * 0.55 * (0.6 + 0.4 * valueNoise(px * 3, py * 0.8, pz * 3, seed + 313)));
      rough = 0.9; metal = 0.05;
    }
    paint = 0;
    const soot = smooth(1.4, 2.4, py) * 0.25;
    o[0] *= 1 - soot; o[1] *= 1 - soot; o[2] *= 1 - soot;
  } else {
    const weather = m.weather;
    if (weather > 0) {
      // dirt: splashed up from the ground, heaviest behind each wheel, broken by noise
      const n = fbm(px * 2.3, py * 2.3, pz * 2.3, seed + 11);
      let spray = 0;
      for (const wheel of w.wheels) {
        const dz = pz - wheel.z, dy = py - wheel.y;
        const behind = Math.exp(-((dz + wheel.r * 0.6) ** 2) / (wheel.r * wheel.r * 1.8) - (dy * dy) / (wheel.r * wheel.r * 1.4));
        spray = Math.max(spray, behind);
      }
      // the splash band: thick on the sills and valances, thinning up the panels in streaks; faces turned up or
      // out to the side above it keep their paint
      const low = smooth(w.dirtTop, 0.04, py) * (ny > 0.55 ? 0.35 : 1);
      const streak = valueNoise(px * 1.1, py * 6.0, pz * 1.1, seed + 7);
      const dirt = Math.min(1, w.dirt * weather * (low * (0.35 + 0.75 * n) * (0.6 + 0.6 * streak) + spray * 0.6 * n)) * (ny < -0.5 ? 0.6 : 1);
      mix3(o, w.dirtRgb, dirt);
      paint *= 1 - dirt;
      rough += (0.95 - rough) * dirt;
      metal *= 1 - dirt;
      // dust on the faces the sky sees
      if (w.dust > 0 && ny > 0.45) {
        const d = w.dust * weather * smooth(0.45, 0.95, ny) * (0.6 + 0.6 * fbm(px * 1.3, py, pz * 1.3, seed + 23));
        mix3(o, w.dustRgb, Math.min(0.85, d));
        paint *= 1 - Math.min(0.85, d);
        rough += (0.95 - rough) * d;
      }
      // rust: blooms along the lower edges and seams of an old body
      if (w.rust > 0 && (m.role === 'paint' || m.role === 'steel' || m.role === 'chrome' || m.role === 'trim')) {
        const r = fbm(px * 3.1, py * 3.1, pz * 3.1, seed + 31) + smooth(0.9, 0.2, py) * 0.25 - (1 - w.rust) * 0.55;
        const rust = smooth(0.52, 0.72, r) * weather;
        mix3(o, RUST, rust);
        paint *= 1 - rust;
        rough += (0.92 - rough) * rust;
        metal *= 1 - rust;
      }
    }
  }
  // the occlusion darkens the ambient-lit share; the paint mask is untouched (the instance colour multiplies it)
  o[0] *= occlusion; o[1] *= occlusion; o[2] *= occlusion;
  o[3] = Math.max(0.02, Math.min(1, rough));
  o[4] = Math.max(0, Math.min(1, metal));
  o[5] = Math.max(0, Math.min(1, paint));
  return o;
}

// ---------------------------------------------------------------------------------------------------- occlusion

/** Fixed cosine-weighted ray directions about +z (rotated onto each normal). */
const AO_DIRS: readonly Vec3[] = (() => {
  const out: Vec3[] = [];
  const count = 14;
  for (let k = 0; k < count; k++) {
    const u = (k + 0.5) / count, phi = k * 2.399963229728653;
    const r = Math.sqrt(u), z = Math.sqrt(1 - u);
    out.push([Math.cos(phi) * r, Math.sin(phi) * r, z]);
  }
  return out;
})();

/**
 * Per-vertex ambient occlusion. The analytic term (always): faces near the ground and facing down are darker. The
 * voxel term (desktop): the triangles are rasterised into an occupancy grid and each vertex casts fixed rays over its
 * hemisphere for 1.4 m, the ground plane (y = 0) counting as an occluder — wheel wells, beds, the underside and the
 * gaps between parts go dark the way they do under a sky.
 */
function ambientOcclusion(position: Float32Array, normal: Float32Array, index: readonly number[], voxel: boolean): Float32Array {
  const count = position.length / 3;
  const ao = new Float32Array(count);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let v = 0; v < count; v++) {
    const x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  for (let v = 0; v < count; v++) {
    const y = position[v * 3 + 1], ny = normal[v * 3 + 1];
    const ground = 0.62 + 0.38 * smooth(0, 0.85, y);
    const facing = ny < 0 ? 1 - 0.55 * -ny : 1;
    ao[v] = ground * facing;
  }
  if (!voxel || !Number.isFinite(minX)) return ao;
  const cell = 0.07;
  const pad = 2;
  const ox = minX - cell * pad, oy = Math.min(0, minY) - cell * pad, oz = minZ - cell * pad;
  const nx = Math.ceil((maxX - ox) / cell) + pad + 1, ny = Math.ceil((maxY - oy) / cell) + pad + 1, nz = Math.ceil((maxZ - oz) / cell) + pad + 1;
  const grid = new Uint8Array(nx * ny * nz);
  const mark = (x: number, y: number, z: number) => {
    const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell), k = Math.floor((z - oz) / cell);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) grid[(k * ny + j) * nx + i] = 1;
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const e1 = Math.hypot(position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]);
    const e2 = Math.hypot(position[c] - position[a], position[c + 1] - position[a + 1], position[c + 2] - position[a + 2]);
    const steps = Math.min(60, Math.max(1, Math.ceil(Math.max(e1, e2) / (cell * 0.7))));
    for (let s = 0; s <= steps; s++) for (let r = 0; r <= steps - s; r++) {
      const u = s / steps, w = r / steps, q = 1 - u - w;
      mark(position[a] * q + position[b] * u + position[c] * w, position[a + 1] * q + position[b + 1] * u + position[c + 1] * w,
        position[a + 2] * q + position[b + 2] * u + position[c + 2] * w);
    }
  }
  const reach = 1.4, step = cell * 0.9;
  // vertices split only by material share a position and a normal: cast their rays once
  const seen = new Map<string, number>();
  for (let v = 0; v < count; v++) {
    const px = position[v * 3], py = position[v * 3 + 1], pz = position[v * 3 + 2];
    const vx = normal[v * 3], vy = normal[v * 3 + 1], vz = normal[v * 3 + 2];
    const key = `${Math.round(px * 500)},${Math.round(py * 500)},${Math.round(pz * 500)},${Math.round(vx * 8)},${Math.round(vy * 8)},${Math.round(vz * 8)}`;
    const known = seen.get(key);
    if (known !== undefined) { ao[v] = Math.min(ao[v], known); continue; }
    // a frame about the normal
    let tx = Math.abs(vy) < 0.9 ? 0 : 1, ty = Math.abs(vy) < 0.9 ? 1 : 0, tz = 0;
    let bx = ty * vz - tz * vy, by = tz * vx - tx * vz, bz = tx * vy - ty * vx;
    const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    tx = vy * bz - vz * by; ty = vz * bx - vx * bz; tz = vx * by - vy * bx;
    let open = 0;
    for (const d of AO_DIRS) {
      const dx = tx * d[0] + bx * d[1] + vx * d[2], dy = ty * d[0] + by * d[1] + vy * d[2], dz = tz * d[0] + bz * d[1] + vz * d[2];
      let hit = false;
      for (let t = cell * 1.6; t < reach; t += step) {
        const x = px + dx * t, y = py + dy * t, z = pz + dz * t;
        if (y < 0) { hit = true; break; }
        const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell), k = Math.floor((z - oz) / cell);
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) break;
        if (grid[(k * ny + j) * nx + i]) { hit = true; break; }
      }
      if (!hit) open++;
    }
    const sky = open / AO_DIRS.length;
    const occluded = (0.18 + 0.82 * Math.pow(sky, 0.8)) * (0.92 + 0.08 * sky);
    seen.set(key, occluded);
    ao[v] = Math.min(ao[v], occluded);
  }
  return ao;
}

/** Default weathering: a clean, lightly road-dirty vehicle. */
export function vehicleWeathering(overrides: Partial<VehicleWeathering> = {}): VehicleWeathering {
  return {
    dirtRgb: [0.11, 0.085, 0.06], dirt: 0.5, dirtTop: 0.55, dustRgb: [0.36, 0.31, 0.24], dust: 0, rust: 0,
    burnt: false, wheels: [], seed: 1, voxelAo: true, ...overrides,
  };
}
