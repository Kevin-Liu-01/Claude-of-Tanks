// src/world/maps/vehicleFarForm.ts — the parked vehicles' distance form (229; the owner: "add a lot of cars in civic
// areas"; the coordinator's ruling: "cars beyond about 120 m use a merged low form with a cheap shadow").
//
// A vehicle pool's geometry keeps its full body (tagged aVehicleLod = 1) and gains a low form (2) derived from that
// body: a hull lofted through stations along the vehicle (each station's section an octagon from the body's own
// width, shoulder, mid-window and roof at that station) and a six-sided prism for each tyre, every vertex coloured from
// the body's skin under it (its colour, roughness, metalness and paint mask), so the far form wears each copy's livery
// through the paint mask as the body does. The vehicle material's vertex hook folds the body's vertices to the
// instance's origin beyond VEHICLE_NEAR_M and the low form's within it, as the clutter pools do (clutterKit.ts): one
// pool and one draw, about 200 triangles rasterised for a far copy instead of the body's 3,000-9,500. The shadow
// stand-in (the role's canonical solid) gains the low hull the same way, folded in the shadow passes by the eye's
// place (a uniform: the shadow camera is not the eye). Geometry without the tag reads 0 and is never folded (the
// wrecks, the carts, a crushed copy that drops the tag).
//
// The low form lies inside the body's box, so the pool's bounds, its caster height and every collider (built from the
// role's collision solid, never from this geometry) are unchanged. geometry.userData.vehicleFar names where it starts
// ({ vertexStart, indexStart }): a copy that wants the body alone draws [0, indexStart) and drops the tag.
import * as THREE from 'three';

/** The vertex attribute that tags a vehicle pool's body (1) and its far form (2); untagged geometry reads 0. */
export const VEHICLE_LOD_ATTRIBUTE = 'aVehicleLod';
/** The distance (m, in plan from the eye to the instance's origin) past which a vehicle draws its far form. */
export const VEHICLE_NEAR_M = 120;
/** The program key suffix of a material that runs the hook. */
export const VEHICLE_LOD_KEY = '-vlod1';

/** Where a geometry's far form starts (its vertices and its indices run to the end). */
export interface VehicleFarRange { vertexStart: number; indexStart: number }

/** The low hull's positions and triangles alone (the shadow stand-in's far form). */
export interface VehicleFarHull { positions: Float32Array; indices: Uint32Array }

interface Wheel { z: number; y: number; r: number }

// ------------------------------------------------------------------------------------------------ the body's skin

/** Area-weighted points on the body's triangles (one a small triangle, four a large one), with their normals, colours
 *  and surface streams, binned on a 0.3 m grid (the bins in a fixed order: the same build every time). */
class Skin {
  readonly n: number;
  readonly p: Float32Array; readonly nrm: Float32Array; readonly a: Float32Array;
  readonly col: Float32Array; readonly surf: Float32Array;
  private static readonly CELL = 0.3;
  private readonly lo: [number, number, number];
  private readonly dims: [number, number, number];
  /** The samples by cell: cellStart[c] .. cellStart[c + 1] in `order`. */
  private readonly cellStart: Uint32Array;
  private readonly order: Uint32Array;

  constructor(geometry: THREE.BufferGeometry, keep: (x: number, y: number, z: number) => boolean) {
    const pos = geometry.getAttribute('position').array as ArrayLike<number>;
    const nrm = geometry.getAttribute('normal').array as ArrayLike<number>;
    const col = geometry.getAttribute('color').array as ArrayLike<number>;
    const surfAttr = geometry.getAttribute('surf') as THREE.BufferAttribute;
    const surf = surfAttr.array as ArrayLike<number>, surfScale = surfAttr.normalized ? 1 / 255 : 1;
    const index = geometry.index!.array as ArrayLike<number>;
    const triangles = index.length / 3;
    const cap = triangles * 4;
    const P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), A = new Float32Array(cap);
    const C = new Float32Array(cap * 3), S = new Float32Array(cap * 3);
    let n = 0;
    const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < triangles; t++) {
      const i0 = index[t * 3] * 3, i1 = index[t * 3 + 1] * 3, i2 = index[t * 3 + 2] * 3;
      const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
      const bx = pos[i2] - pos[i0], by = pos[i2 + 1] - pos[i0 + 1], bz = pos[i2 + 2] - pos[i0 + 2];
      const area = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      if (area < 1e-7) continue;
      let nx = nrm[i0] + nrm[i1] + nrm[i2], ny = nrm[i0 + 1] + nrm[i1 + 1] + nrm[i2 + 1], nz = nrm[i0 + 2] + nrm[i1 + 2] + nrm[i2 + 2];
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-6) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const points = area < 0.004 ? 1 : 4;
      for (let k = 0; k < points; k++) {
        // the centroid, or the three points halfway from it to each corner and the centroid
        const w0 = points === 1 || k === 3 ? 1 / 3 : k === 0 ? 0.5 : 0.25, w1 = points === 1 || k === 3 ? 1 / 3 : k === 1 ? 0.5 : 0.25;
        const w2 = 1 - w0 - w1;
        const x = pos[i0] * w0 + pos[i1] * w1 + pos[i2] * w2;
        const y = pos[i0 + 1] * w0 + pos[i1 + 1] * w1 + pos[i2 + 1] * w2;
        const z = pos[i0 + 2] * w0 + pos[i1 + 2] * w1 + pos[i2 + 2] * w2;
        if (!keep(x, y, z)) continue;
        P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
        N[n * 3] = nx; N[n * 3 + 1] = ny; N[n * 3 + 2] = nz;
        A[n] = area / points;
        for (let c = 0; c < 3; c++) {
          C[n * 3 + c] = (col[i0 + c] + col[i1 + c] + col[i2 + c]) / 3;
          S[n * 3 + c] = ((surf[i0 + c] + surf[i1 + c] + surf[i2 + c]) / 3) * surfScale;
        }
        if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z;
        if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
        n++;
      }
    }
    this.n = n;
    this.p = P.subarray(0, n * 3); this.nrm = N.subarray(0, n * 3); this.a = A.subarray(0, n);
    this.col = C.subarray(0, n * 3); this.surf = S.subarray(0, n * 3);
    if (!n) { lo[0] = lo[1] = lo[2] = 0; hi[0] = hi[1] = hi[2] = 0; }
    this.lo = lo;
    this.dims = [0, 1, 2].map((k) => Math.floor((hi[k] - lo[k]) / Skin.CELL) + 1) as [number, number, number];
    const cells = this.dims[0] * this.dims[1] * this.dims[2];
    const cellOf = new Uint32Array(n), counts = new Uint32Array(cells + 1);
    for (let i = 0; i < n; i++) {
      cellOf[i] = this.cell(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      counts[cellOf[i] + 1]++;
    }
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    this.cellStart = counts.slice();
    const fill = counts.slice(0, cells);
    this.order = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.order[fill[cellOf[i]]++] = i;
  }

  private cell(x: number, y: number, z: number): number {
    const c = Skin.CELL, d = this.dims;
    const ix = Math.min(d[0] - 1, Math.max(0, Math.floor((x - this.lo[0]) / c)));
    const iy = Math.min(d[1] - 1, Math.max(0, Math.floor((y - this.lo[1]) / c)));
    const iz = Math.min(d[2] - 1, Math.max(0, Math.floor((z - this.lo[2]) / c)));
    return (ix * d[1] + iy) * d[2] + iz;
  }

  /** Every sample within `r` (m) of p whose normal is within about 70° of n (cell by cell in a fixed order). */
  near(px: number, py: number, pz: number, r: number, nx: number, ny: number, nz: number, out: number[]): number[] {
    out.length = 0;
    const c = Skin.CELL, d = this.dims, lo = this.lo, r2 = r * r, p = this.p, nrm = this.nrm;
    const x0 = Math.max(0, Math.floor((px - r - lo[0]) / c)), x1 = Math.min(d[0] - 1, Math.floor((px + r - lo[0]) / c));
    const y0 = Math.max(0, Math.floor((py - r - lo[1]) / c)), y1 = Math.min(d[1] - 1, Math.floor((py + r - lo[1]) / c));
    const z0 = Math.max(0, Math.floor((pz - r - lo[2]) / c)), z1 = Math.min(d[2] - 1, Math.floor((pz + r - lo[2]) / c));
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const row = (ix * d[1] + iy) * d[2];
        for (let k = this.cellStart[row + z0], end = this.cellStart[row + z1 + 1]; k < end; k++) {
          const i = this.order[k];
          if (nrm[i * 3] * nx + nrm[i * 3 + 1] * ny + nrm[i * 3 + 2] * nz < 0.35) continue;
          const dx = p[i * 3] - px, dy = p[i * 3 + 1] - py, dz = p[i * 3 + 2] - pz;
          if (dx * dx + dy * dy + dz * dz <= r2) out.push(i);
        }
      }
    }
    return out;
  }
}

/** A weighted histogram on [0, 4) m in 1 cm bins: the quantiles of a station's widths and heights without a sort. */
class Quantiles {
  private static readonly BIN = 0.01;
  private readonly bins = new Float64Array(400);
  private total = 0;
  private count = 0;

  reset(): this { this.bins.fill(0); this.total = 0; this.count = 0; return this; }

  add(v: number, w: number): void {
    this.bins[Math.min(399, Math.max(0, Math.floor(v / Quantiles.BIN)))] += w;
    this.total += w;
    this.count++;
  }

  /** The weighted q-quantile (the bin's middle); NaN when nothing was added. */
  at(q: number): number {
    if (!this.count || this.total <= 0) return Number.NaN;
    let run = 0;
    for (let b = 0; b < 400; b++) {
      run += this.bins[b];
      if (run >= q * this.total) return (b + 0.5) * Quantiles.BIN;
    }
    return 399.5 * Quantiles.BIN;
  }
}

// ------------------------------------------------------------------------------------------------ the far form

/** The far form's streams as they are written (the body's own streams, appended). */
class FarStreams {
  readonly pos: number[] = []; readonly nrm: number[] = []; readonly uv: number[] = [];
  readonly col: number[] = []; readonly surf: number[] = []; readonly idx: number[] = [];
  /** Indices of the hull alone (no tyres), into pos: the shadow stand-in's far form. */
  readonly hullIdx: number[] = [];
  private readonly found: number[] = [];
  private readonly skin: Skin;
  private readonly paint: { col: number[]; surf: number[] };
  private readonly under: { col: number[]; surf: number[] };

  constructor(skin: Skin, paint: { col: number[]; surf: number[] }, under: { col: number[]; surf: number[] }) {
    this.skin = skin;
    this.paint = paint;
    this.under = under;
  }

  /** A vertex at p facing n, coloured from the body's outer skin under it. */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const v = this.pos.length / 3;
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz);
    // the paint tile's planar coordinates by the face's dominant axis (vehicleMesh.ts build)
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ax >= ay && ax >= az) this.uv.push(z * 0.85, y * 0.85);
    else if (ay >= az) this.uv.push(x * 0.85, z * 0.85);
    else this.uv.push(x * 0.85, y * 0.85);
    this.shade(x, y, z, nx, ny, nz);
    return v;
  }

  private shade(px: number, py: number, pz: number, nx: number, ny: number, nz: number): void {
    const s = this.skin;
    // the footprint on the face's plane: tight across the vehicle's height (a window band is 0.3-0.5 m), wide along it
    // (the stations are 0.42 m apart: neighbouring stations blend instead of striping)
    for (const grow of [1, 2]) {
      const rx = 0.3 * grow, ry = 0.17 * grow, rz = 0.42 * grow;
      const near = s.near(px, py, pz, rz, nx, ny, nz, this.found);
      if (!near.length) continue;
      // of the skin facing this way only the outer layer (the cab's seats and the bed's floor stay inside)
      let outer = -Infinity;
      for (const i of near) outer = Math.max(outer, s.p[i * 3] * nx + s.p[i * 3 + 1] * ny + s.p[i * 3 + 2] * nz);
      // the tint is the paint mask's: the shader draws colour x mix(1, tint, mask), so the far vertex keeps the skin's
      // painted share (B) and the rest (A) apart: colour A + B and mask B / (A + B) give back the skin's own mean under
      // every livery (a plain mean of the mask would lift a black car toward its light base paint)
      let wsum = 0, a0 = 0, a1 = 0, a2 = 0, b0 = 0, b1 = 0, b2 = 0, u0 = 0, u1 = 0;
      for (const i of near) {
        const depth = s.p[i * 3] * nx + s.p[i * 3 + 1] * ny + s.p[i * 3 + 2] * nz;
        if (depth < outer - 0.2) continue;
        let dx = s.p[i * 3] - px, dy = s.p[i * 3 + 1] - py, dz = s.p[i * 3 + 2] - pz;
        const along = dx * nx + dy * ny + dz * nz;
        dx -= along * nx; dy -= along * ny; dz -= along * nz;
        const e = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry) + (dz / rz) * (dz / rz));
        if (e >= 1) continue;
        const w = s.a[i] * (1 - e) * (1 - e);
        wsum += w;
        const m = s.surf[i * 3 + 2], wa = w * (1 - m), wb = w * m;
        a0 += s.col[i * 3] * wa; a1 += s.col[i * 3 + 1] * wa; a2 += s.col[i * 3 + 2] * wa;
        b0 += s.col[i * 3] * wb; b1 += s.col[i * 3 + 1] * wb; b2 += s.col[i * 3 + 2] * wb;
        u0 += s.surf[i * 3] * w; u1 += s.surf[i * 3 + 1] * w;
      }
      if (wsum > 0) {
        const lumA = 0.2126 * a0 + 0.7152 * a1 + 0.0722 * a2, lumB = 0.2126 * b0 + 0.7152 * b1 + 0.0722 * b2;
        this.col.push((a0 + b0) / wsum, (a1 + b1) / wsum, (a2 + b2) / wsum);
        // no flat far face glossier than satin paint (a large flat mirror reads as a sheet at range)
        this.surf.push(Math.max(0.42, u0 / wsum), u1 / wsum, lumA + lumB > 1e-9 ? lumB / (lumA + lumB) : 0);
        return;
      }
    }
    // nothing of the skin faces this way here: the underside's own shade below, the body paint elsewhere
    const fill = ny < -0.5 ? this.under : this.paint;
    this.col.push(...fill.col);
    this.surf.push(...fill.surf);
  }

  /** A flat quad (a, b, c, d in order round it), facing away from `inside`. */
  quad(q: readonly (readonly [number, number, number])[], inside: readonly [number, number, number], hull: boolean): void {
    const [a, b, c, d] = q;
    let nx = (c[1] - a[1]) * (d[2] - b[2]) - (c[2] - a[2]) * (d[1] - b[1]);
    let ny = (c[2] - a[2]) * (d[0] - b[0]) - (c[0] - a[0]) * (d[2] - b[2]);
    let nz = (c[0] - a[0]) * (d[1] - b[1]) - (c[1] - a[1]) * (d[0] - b[0]);
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return; // a degenerate face (a box section's shoulder): nothing to draw
    nx /= l; ny /= l; nz /= l;
    const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - inside[0], my = (a[1] + b[1] + c[1] + d[1]) / 4 - inside[1];
    const mz = (a[2] + b[2] + c[2] + d[2]) / 4 - inside[2];
    const flip = nx * mx + ny * my + nz * mz < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const v = q.map((p) => this.vert(p[0], p[1], p[2], nx, ny, nz));
    const tris = flip ? [v[0], v[2], v[1], v[0], v[3], v[2]] : [v[0], v[1], v[2], v[0], v[2], v[3]];
    this.idx.push(...tris);
    if (hull) this.hullIdx.push(...tris);
  }

  /** A flat convex polygon facing (nx, ny, nz) (points in order round it, either way). */
  polygon(points: readonly (readonly [number, number, number])[], nx: number, ny: number, nz: number, hull: boolean): void {
    const v = points.map((p) => this.vert(p[0], p[1], p[2], nx, ny, nz));
    const a = points[0], b = points[1], c = points[2];
    const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const flip = cx * nx + cy * ny + cz * nz < 0;
    for (let k = 1; k + 1 < v.length; k++) {
      const tri = flip ? [v[0], v[k + 1], v[k]] : [v[0], v[k], v[k + 1]];
      this.idx.push(...tri);
      if (hull) this.hullIdx.push(...tri);
    }
  }
}

/** One station's section: the body's half width and shoulder, the window's middle and the roof (m). */
/** One station's section: five heights up one flank (the floor at the sill, the belt, the window's middle, the window's
 *  top and the roof) and the body's half width at each. */
interface Section { z: number; h: number[]; w: number[] }

/**
 * Append a vehicle body's far form to its geometry (in place, before the renderer has drawn it) and tag both forms.
 * The geometry is a fitted role build (civilianVehicleKit.ts: position, normal, uv, color, surf, an index; +Z the
 * nose, the lowest tyre point at y = 0; userData.wheels where the fit stands them). Returns the far form's start and
 * its hull (for the shadow stand-in), or null for a geometry that is not a vehicle body.
 */
export function appendVehicleFarForm(geometry: THREE.BufferGeometry): { range: VehicleFarRange; hull: VehicleFarHull } | null {
  for (const name of ['position', 'normal', 'uv', 'color', 'surf']) if (!geometry.getAttribute(name)) return null;
  if (!geometry.index) return null;
  geometry.computeBoundingBox();
  const box = (geometry.userData.bodyBox as THREE.Box3 | undefined) ?? geometry.boundingBox!;
  const hw = Math.max(-box.min.x, box.max.x);
  // the hull is symmetric: no wider than the body's narrower side (a spare wheel on one flank widens one side only)
  const hx = Math.min(-geometry.boundingBox!.min.x, geometry.boundingBox!.max.x);
  const wheels = ((geometry.userData.wheels as Wheel[] | undefined) ?? []).filter((w) => w.r > 0.05);
  // the mirrors and every outboard part leave the skin (they never widen the hull)
  const skin = new Skin(geometry, (x) => Math.abs(x) <= hw + 0.01);
  if (skin.n < 16) return null;

  // the tyres: each axle's outer sidewall from the skin facing out round its hub
  const hist = new Quantiles();
  const tyres = wheels.map((w) => {
    hist.reset();
    for (let i = 0; i < skin.n; i++) {
      const y = skin.p[i * 3 + 1], z = skin.p[i * 3 + 2];
      // the lower half of the wheel's disc (no wing or running board reaches below the hub)
      if (y > w.y || (y - w.y) * (y - w.y) + (z - w.z) * (z - w.z) > w.r * w.r * 0.81 || Math.abs(skin.nrm[i * 3]) < 0.6) continue;
      hist.add(Math.abs(skin.p[i * 3]), skin.a[i]);
    }
    const sidewall = hist.at(0.95);
    const outer = Math.min(hx, Number.isFinite(sidewall) ? sidewall : hw * 0.85);
    const width = Math.min(0.32, Math.max(0.14, w.r * 0.55));
    return { ...w, outer, inner: Math.max(0.05, outer - width) };
  });
  const inTyre = (x: number, y: number, z: number) => {
    for (const t of tyres) {
      if (Math.abs(x) >= t.inner - 0.04 && (y - t.y) * (y - t.y) + (z - t.z) * (z - t.z) < t.r * t.r * 1.08) return true;
    }
    return false;
  };
  const body = new Uint8Array(skin.n); // 1: the body's skin (off the tyres)

  // the floor pan's height: the low skin under the middle of the body, off the tyres
  let zMin = Infinity, zMax = -Infinity;
  hist.reset();
  for (let i = 0; i < skin.n; i++) {
    const x = skin.p[i * 3], y = skin.p[i * 3 + 1], z = skin.p[i * 3 + 2];
    if (inTyre(x, y, z)) continue;
    body[i] = 1;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    if (Math.abs(x) < hw * 0.45) hist.add(y, skin.a[i]);
  }
  if (!(zMax > zMin)) return null;
  const rMax = tyres.reduce((m, t) => Math.max(m, t.r), 0.3);
  const floor = hist.at(0.08);
  // the sill: the lowest of the flanks facing out between the wheel arches (the hull's floor, so the tyres show under it)
  hist.reset();
  for (let i = 0; i < skin.n; i++) {
    if (!body[i] || Math.abs(skin.p[i * 3]) < hw * 0.75 || Math.abs(skin.nrm[i * 3]) < 0.5) continue;
    const z = skin.p[i * 3 + 2];
    if (tyres.some((t) => Math.abs(z - t.z) < t.r * 1.15)) continue;
    hist.add(skin.p[i * 3 + 1], skin.a[i]);
  }
  const sill = hist.at(0.04);
  const y0 = Math.min(Math.max(0.12, Number.isFinite(sill) ? sill : Number.isFinite(floor) ? floor : 0.25), rMax * 1.6);

  // the stations, about 0.42 m apart, each section from the body's skin within its reach
  const count = Math.max(6, Math.round((zMax - zMin) / 0.42) + 1);
  const step = (zMax - zMin) / (count - 1), reach = step * 0.6;
  const at: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < skin.n; i++) {
    if (!body[i] || skin.p[i * 3 + 1] < y0 - 0.05) continue;
    const z = skin.p[i * 3 + 2];
    for (let k = Math.max(0, Math.ceil((z - reach - zMin) / step)); k <= Math.min(count - 1, Math.floor((z + reach - zMin) / step)); k++) at[k].push(i);
  }
  const sections: (Section | null)[] = [];
  const isGlass = (i: number) => skin.surf[i * 3] < 0.16 && skin.surf[i * 3 + 1] < 0.3 && skin.surf[i * 3 + 2] < 0.5;
  for (let k = 0; k < count; k++) {
    const z = zMin + k * step, list = at[k];
    if (list.length < 6) { sections.push(null); continue; }
    const X = (i: number) => Math.abs(skin.p[i * 3]), Y = (i: number) => skin.p[i * 3 + 1];
    hist.reset();
    for (const i of list) hist.add(Y(i), skin.a[i]);
    const top = Math.min(geometry.boundingBox!.max.y, Math.max(y0 + 0.22, hist.at(0.985)));
    hist.reset();
    for (const i of list) hist.add(X(i), skin.a[i]);
    const wb = Math.min(hx, Math.max(0.2, hist.at(0.97)));
    // the side glass's band (the flanks' glass: the windscreen and the back light come from the roof line's slope)
    hist.reset();
    let glass = 0;
    for (const i of list) if (isGlass(i) && Math.abs(skin.nrm[i * 3]) >= 0.35) { hist.add(Y(i), skin.a[i]); glass += skin.a[i]; }
    let belt: number, winTop: number;
    if (glass >= 0.01) {
      belt = hist.at(0.1);
      winTop = hist.at(0.9);
    } else {
      // no side glass here (a bonnet, a boot, a cargo body): the shoulder, and the rows up to the roof in proportion
      hist.reset();
      for (const i of list) if (X(i) >= wb * 0.86) hist.add(Y(i), skin.a[i]);
      const shoulder = hist.at(0.97);
      belt = Number.isFinite(shoulder) ? shoulder : y0 + (top - y0) * 0.5;
      winTop = belt + (top - belt) * 0.85;
    }
    belt = Math.min(top - 0.1, Math.max(y0 + 0.08, belt));
    winTop = Math.min(top - 0.02, Math.max(belt + 0.06, winTop));
    const h = [y0, belt, (belt + winTop) / 2, winTop, top];
    // the half width at each height: the skin within 10 cm of it (the sill's and the roof's taken just inside them)
    const w = h.map((y, r) => {
      const yy = r === 0 ? y + 0.08 : r === 4 ? y - 0.06 : y;
      hist.reset();
      for (const i of list) if (Math.abs(Y(i) - yy) < 0.1) hist.add(X(i), skin.a[i]);
      const v = hist.at(0.95);
      return Math.min(hx, Math.max(0.15, Number.isFinite(v) ? v : wb));
    });
    sections.push({ z, h, w });
  }
  // a station the skin missed takes its neighbours' section
  for (let k = 0; k < count; k++) {
    if (sections[k]) continue;
    let a = k - 1, b = k + 1;
    while (a >= 0 && !sections[a]) a--;
    while (b < count && !sections[b]) b++;
    const sa = a >= 0 ? sections[a] : null, sb = b < count ? sections[b] : null;
    const from = sa ?? sb, to = sb ?? sa;
    if (!from || !to) return null;
    const t = sa && sb ? (k - a) / (b - a) : 0;
    const mix = (p: number, q: number) => p + (q - p) * t;
    sections[k] = { z: zMin + k * step, h: from.h.map((v, r) => mix(v, to.h[r])), w: from.w.map((v, r) => mix(v, to.w[r])) };
  }
  const S = sections as Section[];

  // the body paint's own colour and surface, and the underside's: a vertex the skin never reached wears one
  const average = (weight: (i: number) => number, fallback: { col: number[]; surf: number[] }) => {
    const col = [0, 0, 0], surf = [0, 0, 0];
    let sum = 0;
    for (let i = 0; i < skin.n; i++) {
      const w = weight(i);
      if (w <= 0) continue;
      sum += w;
      for (let k = 0; k < 3; k++) { col[k] += skin.col[i * 3 + k] * w; surf[k] += skin.surf[i * 3 + k] * w; }
    }
    return sum > 0 ? { col: col.map((v) => v / sum), surf: surf.map((v) => v / sum) } : fallback;
  };
  const paint = average((i) => skin.a[i] * skin.surf[i * 3 + 2], { col: [0.5, 0.5, 0.5], surf: [0.6, 0, 0] });
  const under = average((i) => (skin.nrm[i * 3 + 1] < -0.5 ? skin.a[i] : 0), { col: [0.03, 0.03, 0.03], surf: [0.9, 0, 0] });
  const out = new FarStreams(skin, paint, under);

  // the hull: a ten-sided section at every station (up one flank, across the roof and down the other), lofted
  const ring = (s: Section): [number, number, number][] => {
    const right = s.h.map((y, r) => [s.w[r], y, s.z] as [number, number, number]);
    const left = s.h.map((y, r) => [-s.w[r], y, s.z] as [number, number, number]).reverse();
    return [...right, ...left];
  };
  for (let k = 0; k + 1 < count; k++) {
    const a = ring(S[k]), b = ring(S[k + 1]);
    const inside: [number, number, number] = [0, (y0 + (S[k].h[4] + S[k + 1].h[4]) / 2) / 2, (S[k].z + S[k + 1].z) / 2];
    for (let e = 0; e < 10; e++) {
      const f = (e + 1) % 10;
      out.quad([a[e], a[f], b[f], b[e]], inside, true);
    }
  }
  // the nose and the tail: the section's rungs (each height's pair) closed rung by rung
  for (const [s, nz] of [[S[count - 1], 1], [S[0], -1]] as const) {
    const r = ring(s);
    for (let k = 0; k < 4; k++) out.polygon([r[k], r[k + 1], r[8 - k], r[9 - k]], 0, 0, nz, true);
  }

  // the tyres: a six-sided prism each side of every axle, a flat on the ground, the outer face capped
  for (const t of tyres) {
    for (const side of [1, -1]) {
      const xo = side * t.outer, xi = side * t.inner;
      const rim: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const angle = Math.PI / 6 + (k * Math.PI) / 3; // vertices at 30°, 90°...: flats on the ground and the top
        rim.push([t.y + Math.sin(angle) * t.r, t.z + Math.cos(angle) * t.r]);
      }
      const hub: [number, number, number] = [(xo + xi) / 2, t.y, t.z];
      for (let k = 0; k < 6; k++) {
        const [ya, za] = rim[k], [yb, zb] = rim[(k + 1) % 6];
        out.quad([[xo, ya, za], [xo, yb, zb], [xi, yb, zb], [xi, ya, za]], hub, false);
      }
      out.polygon(rim.map(([y, z]) => [xo, y, z] as [number, number, number]), side, 0, 0, false);
    }
  }

  // append the far form's streams to the body's and tag both
  const vertexStart = geometry.getAttribute('position').count;
  const oldIndex = geometry.index.array as ArrayLike<number>;
  const indexStart = oldIndex.length;
  const total = vertexStart + out.pos.length / 3;
  const grow = (name: string, add: readonly number[], scale = 1) => {
    const old = geometry.getAttribute(name) as THREE.BufferAttribute;
    const Ctor = old.array.constructor as new (n: number) => Float32Array | Uint8Array;
    const next = new Ctor(total * old.itemSize);
    next.set(old.array as ArrayLike<number>);
    for (let i = 0; i < add.length; i++) next[vertexStart * old.itemSize + i] = scale === 1 ? add[i] : Math.round(Math.min(1, Math.max(0, add[i])) * scale);
    geometry.setAttribute(name, new THREE.BufferAttribute(next, old.itemSize, old.normalized));
  };
  grow('position', out.pos);
  grow('normal', out.nrm);
  grow('uv', out.uv);
  grow('color', out.col);
  const surfAttr = geometry.getAttribute('surf') as THREE.BufferAttribute;
  grow('surf', out.surf, surfAttr.array instanceof Uint8Array && surfAttr.normalized ? 255 : 1);
  const index = total > 65535 ? new Uint32Array(indexStart + out.idx.length) : new Uint16Array(indexStart + out.idx.length);
  index.set(oldIndex);
  for (let i = 0; i < out.idx.length; i++) index[indexStart + i] = vertexStart + out.idx[i];
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const tag = new Uint8Array(total);
  tag.fill(1, 0, vertexStart);
  tag.fill(2, vertexStart);
  geometry.setAttribute(VEHICLE_LOD_ATTRIBUTE, new THREE.BufferAttribute(tag, 1));
  const range: VehicleFarRange = { vertexStart, indexStart };
  geometry.userData.vehicleFar = range;

  // the hull alone, compacted, for the shadow stand-in
  const used = new Map<number, number>(), positions: number[] = [], hullIdx: number[] = [];
  for (const v of out.hullIdx) {
    let at = used.get(v);
    if (at === undefined) { at = used.size; used.set(v, at); positions.push(out.pos[v * 3], out.pos[v * 3 + 1], out.pos[v * 3 + 2]); }
    hullIdx.push(at);
  }
  return { range, hull: { positions: Float32Array.from(positions), indices: Uint32Array.from(hullIdx) } };
}

/** Append the low hull to a shadow stand-in (positions and an index only) and tag both forms. */
export function appendVehicleFarShadow(solid: THREE.BufferGeometry, hull: VehicleFarHull): void {
  const position = solid.getAttribute('position') as THREE.BufferAttribute;
  const start = position.count, total = start + hull.positions.length / 3;
  const next = new Float32Array(total * 3);
  next.set(position.array as Float32Array);
  next.set(hull.positions, start * 3);
  solid.setAttribute('position', new THREE.BufferAttribute(next, 3));
  const old = solid.index ? (solid.index.array as ArrayLike<number>) : Uint32Array.from({ length: start }, (_, i) => i);
  const index = new Uint32Array(old.length + hull.indices.length);
  index.set(old);
  for (let i = 0; i < hull.indices.length; i++) index[old.length + i] = start + hull.indices[i];
  solid.setIndex(new THREE.BufferAttribute(index, 1));
  const tag = new Uint8Array(total);
  tag.fill(1, 0, start);
  tag.fill(2, start);
  solid.setAttribute(VEHICLE_LOD_ATTRIBUTE, new THREE.BufferAttribute(tag, 1));
  solid.userData.vehicleFar = { vertexStart: start, indexStart: old.length } satisfies VehicleFarRange;
}

// ------------------------------------------------------------------------------------------------ the fold

/** The fold's GLSL: `origin` the instance's world origin, `eye` the eye's world place. */
function foldGlsl(eye: string): string {
  return /* glsl */`
{
  // (vehicleFarForm.ts) a vehicle's body folds away past VEHICLE_NEAR_M, its far form within it
  if (${VEHICLE_LOD_ATTRIBUTE} > 0.5) {
    vec4 cotVehicleAt = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    cotVehicleAt = instanceMatrix * cotVehicleAt;
    #endif
    cotVehicleAt = modelMatrix * cotVehicleAt;
    vec2 cotVehicleD = cotVehicleAt.xz - ${eye}.xz;
    bool cotVehicleFar = dot(cotVehicleD, cotVehicleD) > ${(VEHICLE_NEAR_M * VEHICLE_NEAR_M).toFixed(1)};
    if ((${VEHICLE_LOD_ATTRIBUTE} < 1.5) == cotVehicleFar) transformed = vec3(0.0);
  }
}`;
}

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`vehicleFarForm: shader anchor missing: ${anchor}`);
  return out;
}

/** Untagged geometry reads 0 (never folded) on a material that runs a fold. */
export function vehicleLodDefaults(material: THREE.Material): void {
  const m = material as THREE.Material & { defaultAttributeValues?: Record<string, number[]> };
  m.defaultAttributeValues = { ...(m.defaultAttributeValues ?? {}), [VEHICLE_LOD_ATTRIBUTE]: [0] };
}

/** The vehicle material's hook (chained after its surface hook): the fold by the camera drawing it, the eye. */
export function vehicleLodHook(shader: { vertexShader: string }): void {
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>', `#include <common>\nattribute float ${VEHICLE_LOD_ATTRIBUTE};`);
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>${foldGlsl('cameraPosition')}`);
}

/** The eye's world place for the shadow passes (w = 1 once an eye is known; until then every copy draws its body). */
const VEHICLE_EYE = { value: new THREE.Vector4(0, 0, 0, 0) };

/** Called once a frame with the eye's place (props.ts updateProps). */
export function setVehicleEye(eye: THREE.Vector3): void {
  if (Number.isFinite(eye.x) && Number.isFinite(eye.z)) VEHICLE_EYE.value.set(eye.x, eye.y, eye.z, 1);
}

let casterDepth: THREE.MeshDepthMaterial | null = null;

/** The shadow stand-ins' depth material: the fold by the eye (one program for every vehicle pool). */
export function vehicleCasterDepthMaterial(): THREE.MeshDepthMaterial {
  if (casterDepth) return casterDepth;
  const material = new THREE.MeshDepthMaterial({ name: 'VehicleCasterDepth', depthPacking: THREE.RGBADepthPacking });
  vehicleLodDefaults(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uVehicleEye = VEHICLE_EYE;
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>',
      `#include <common>\nattribute float ${VEHICLE_LOD_ATTRIBUTE};\nuniform vec4 uVehicleEye;`);
    // no eye yet: every copy draws its body (the far form folded)
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
if (uVehicleEye.w < 0.5) { if (${VEHICLE_LOD_ATTRIBUTE} > 1.5) transformed = vec3(0.0); }
else${foldGlsl('uVehicleEye')}`);
  };
  material.customProgramCacheKey = () => 'world-vehicle-caster-depth-v1';
  casterDepth = material;
  return material;
}
