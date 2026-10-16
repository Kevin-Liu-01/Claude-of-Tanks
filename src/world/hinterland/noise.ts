// src/world/hinterland/noise.ts — the Hinterland's noise (HL-0, the horizons stream, 2026-10-13).
//
// The JS twin of the panorama's NOISE_GLSL (horizonPanorama.ts: Dave Hoskins' hash12 and Quilez's value noise with
// analytic derivatives), so the far forms that won wave 24 keep their law when they move from the bake into the
// Hinterland's field (B-architecture §4.1, §4.6). Allocation-free: the derivative form writes into a caller's scratch.
// Float64 here and float32 on the GPU, so the twins agree in law, not bit for bit; the Hinterland's heights are made
// on the CPU (the worker), so the one source of truth is this file.

function fract(v: number): number { return v - Math.floor(v); }

/** hash12 (Hoskins): a cell's value in [0, 1). */
export function hash12(px: number, py: number): number {
  let x = fract(px * 0.1031), y = fract(py * 0.1031), z = fract(px * 0.1031);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  return fract((x + y) * z);
}

/** Value noise in [-1, 1] with its derivatives (Quilez's noised): out[0] value, out[1] d/dx, out[2] d/dy. */
export function noised(px: number, py: number, out: Float64Array | number[]): Float64Array | number[] {
  const ix = Math.floor(px), iy = Math.floor(py);
  const wx = px - ix, wy = py - iy;
  const ux = wx * wx * wx * (wx * (wx * 6 - 15) + 10), uy = wy * wy * wy * (wy * (wy * 6 - 15) + 10);
  const dux = 30 * wx * wx * (wx * (wx - 2) + 1), duy = 30 * wy * wy * (wy * (wy - 2) + 1);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  const k1 = b - a, xk2_black_panther = c - a, k4 = a - b - c + d;
  out[0] = -1 + 2 * (a + k1 * ux + xk2_black_panther * uy + k4 * ux * uy);
  out[1] = 2 * dux * (k1 + k4 * uy);
  out[2] = 2 * duy * (xk2_black_panther + k4 * ux);
  return out;
}

/** Value noise in [-1, 1] (noised's value alone, cheaper). */
export function noise2(px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py);
  const wx = px - ix, wy = py - iy;
  const ux = wx * wx * wx * (wx * (wx * 6 - 15) + 10), uy = wy * wy * wy * (wy * (wy * 6 - 15) + 10);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return -1 + 2 * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
}

/** fBm of noise2 over `octaves` (gain 0.5, lacunarity ~2 with the panorama's rotation), normalised to [-1, 1]. */
export function fbm2(px: number, py: number, octaves: number): number {
  let sum = 0, amp = 1, norm = 0, x = px, y = py;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x, y); norm += amp; amp *= 0.5;
    const nx = 1.6 * x - 1.2 * y, ny = 1.2 * x + 1.6 * y; // ROT = mat2(1.6, 1.2, -1.2, 1.6) (column-major)
    x = nx; y = ny;
  }
  return sum / norm;
}

/** A seed's offset pair for a named field (so two fields of one map never share their lattice). */
export function seedOffset(seed: number, salt: number): [number, number] {
  return [hash12(seed * 0.0137 + salt, salt * 1.7) * 997 - 498, hash12(salt * 2.3, seed * 0.0219 - salt) * 997 - 498];
}

export function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** FNV-1a of a string, for a map's place seed (new content only: the battlefield's own outland keeps the terrain seed). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32, the codebase's seeded stream (no Math.random anywhere in the Hinterland). */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
