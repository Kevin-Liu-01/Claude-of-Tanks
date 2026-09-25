/**
 * cloudNoise.ts — the volumetric cloud layer's noise volumes and weather field (round 68, 2026-09-24).
 *
 * Pure, deterministic and DOM-free so the bakes run in a worker (cloudNoiseWorker.ts) and the receipt
 * (volumetricClouds.selftest.mjs) pins their bytes in Node. Written from Schneider & Vos, "The Real-time
 * Volumetric Cloudscapes of Horizon Zero Dawn" (SIGGRAPH 2015 / Nubis 2017): a tileable Perlin–Worley
 * base-shape volume (R: Perlin fbm dilated by inverted Worley, GBA: Worley fbm at rising frequencies), a
 * tileable Worley-fbm detail volume that erodes the shape's edges, and a 2D weather field (R: the coverage
 * field the per-map coverage thresholds cut, G: cell profile — where cumulus columns rise, B: column height
 * variation, A: a fine breakup). Every noise is integer-lattice periodic, so the volumes tile in world space.
 * Nothing here is copied from any reference implementation; the hashes and lattices are first-party.
 */

/** Shipped sizes (the receipt pins the bytes at these). */
export const CLOUD_SHAPE_SIZE = 64;
export const CLOUD_DETAIL_SIZE = 32;
export const CLOUD_WEATHER_SIZE = 256;
export const CLOUD_NOISE_SEED = 2068;

/** Integer-lattice hash → [0, 1). Periodic by construction: callers wrap the lattice coordinate first. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  h = Math.imul(h ^ (h >>> 7), 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Tileable 3D Worley F1 distance with `cells` feature points per axis over the unit cube, accumulated into
 * `out` (N³ floats) scaled by `amp`. Distances are in cell units (0 at a feature point, ~1 at the farthest).
 */
function worley3(N: number, cells: number, seed: number, out: Float32Array, amp: number): void {
  const fp = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++) for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const i = ((z * cells + y) * cells + x) * 3;
    fp[i] = hash3(x, y, z, seed);
    fp[i + 1] = hash3(x, y, z, seed + 7);
    fp[i + 2] = hash3(x, y, z, seed + 13);
  }
  const s = cells / N;
  // the three wrapped lattice rows / columns / slices around a texel, hoisted out of the 27-cell loop
  const wz = [0, 0, 0], wy = [0, 0, 0], wx = [0, 0, 0];
  const gzs = [0, 0, 0], gys = [0, 0, 0], gxs = [0, 0, 0];
  for (let z = 0; z < N; z++) {
    const pz = (z + 0.5) * s, cz = Math.floor(pz);
    for (let k = 0; k < 3; k++) { gzs[k] = cz + k - 1; wz[k] = ((gzs[k] % cells) + cells) % cells; }
    for (let y = 0; y < N; y++) {
      const py = (y + 0.5) * s, cy = Math.floor(py);
      for (let k = 0; k < 3; k++) { gys[k] = cy + k - 1; wy[k] = ((gys[k] % cells) + cells) % cells; }
      for (let x = 0; x < N; x++) {
        const px = (x + 0.5) * s, cx = Math.floor(px);
        for (let k = 0; k < 3; k++) { gxs[k] = cx + k - 1; wx[k] = ((gxs[k] % cells) + cells) % cells; }
        let best = 1e9;
        for (let oz = 0; oz < 3; oz++) {
          const rowZ = wz[oz] * cells, gz = gzs[oz];
          for (let oy = 0; oy < 3; oy++) {
            const rowY = (rowZ + wy[oy]) * cells, gy = gys[oy];
            for (let ox = 0; ox < 3; ox++) {
              const i = (rowY + wx[ox]) * 3;
              const dx = gxs[ox] + fp[i] - px, dy = gy + fp[i + 1] - py, dz = gz + fp[i + 2] - pz;
              const dd = dx * dx + dy * dy + dz * dz;
              if (dd < best) best = dd;
            }
          }
        }
        out[(z * N + y) * N + x] += amp * Math.min(1, Math.sqrt(best));
      }
    }
  }
}

/** Tileable 3D gradient (Perlin) noise with `cells` lattice points per axis, accumulated into `out` × amp (≈ −0.7..0.7). */
function perlin3(N: number, cells: number, seed: number, out: Float32Array, amp: number): void {
  const g = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++) for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const i = ((z * cells + y) * cells + x) * 3;
    const a = hash3(x, y, z, seed) * 6.283185307179586, b = hash3(x, y, z, seed + 3) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - b * b));
    g[i] = r * Math.cos(a); g[i + 1] = r * Math.sin(a); g[i + 2] = b;
  }
  const s = cells / N;
  const dot = (xi: number, yi: number, zi: number, dx: number, dy: number, dz: number): number => {
    const i = ((zi * cells + yi) * cells + xi) * 3;
    return g[i] * dx + g[i + 1] * dy + g[i + 2] * dz;
  };
  for (let z = 0; z < N; z++) {
    const pz = (z + 0.5) * s, cz = Math.floor(pz), fz = pz - cz, uz = fade(fz), z0 = cz % cells, z1 = (cz + 1) % cells;
    for (let y = 0; y < N; y++) {
      const py = (y + 0.5) * s, cy = Math.floor(py), fy = py - cy, uy = fade(fy), y0 = cy % cells, y1 = (cy + 1) % cells;
      for (let x = 0; x < N; x++) {
        const px = (x + 0.5) * s, cx = Math.floor(px), fx = px - cx, ux = fade(fx), x0 = cx % cells, x1 = (cx + 1) % cells;
        const n000 = dot(x0, y0, z0, fx, fy, fz), n100 = dot(x1, y0, z0, fx - 1, fy, fz);
        const n010 = dot(x0, y1, z0, fx, fy - 1, fz), n110 = dot(x1, y1, z0, fx - 1, fy - 1, fz);
        const n001 = dot(x0, y0, z1, fx, fy, fz - 1), n101 = dot(x1, y0, z1, fx - 1, fy, fz - 1);
        const n011 = dot(x0, y1, z1, fx, fy - 1, fz - 1), n111 = dot(x1, y1, z1, fx - 1, fy - 1, fz - 1);
        const nx00 = n000 + ux * (n100 - n000), nx10 = n010 + ux * (n110 - n010);
        const nx01 = n001 + ux * (n101 - n001), nx11 = n011 + ux * (n111 - n011);
        const nxy0 = nx00 + uy * (nx10 - nx00), nxy1 = nx01 + uy * (nx11 - nx01);
        out[(z * N + y) * N + x] += amp * (nxy0 + uz * (nxy1 - nxy0));
      }
    }
  }
}

/** Tileable 2D gradient noise with `cells` lattice points per axis, accumulated into `out` × amp. */
function perlin2(N: number, cells: number, seed: number, out: Float32Array, amp: number): void {
  const g = new Float32Array(cells * cells * 2);
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const a = hash3(x, y, 0, seed) * 6.283185307179586;
    g[(y * cells + x) * 2] = Math.cos(a); g[(y * cells + x) * 2 + 1] = Math.sin(a);
  }
  const s = cells / N;
  const dot = (xi: number, yi: number, dx: number, dy: number): number => g[(yi * cells + xi) * 2] * dx + g[(yi * cells + xi) * 2 + 1] * dy;
  for (let y = 0; y < N; y++) {
    const py = (y + 0.5) * s, cy = Math.floor(py), fy = py - cy, uy = fade(fy), y0 = cy % cells, y1 = (cy + 1) % cells;
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * s, cx = Math.floor(px), fx = px - cx, ux = fade(fx), x0 = cx % cells, x1 = (cx + 1) % cells;
      const n00 = dot(x0, y0, fx, fy), n10 = dot(x1, y0, fx - 1, fy), n01 = dot(x0, y1, fx, fy - 1), n11 = dot(x1, y1, fx - 1, fy - 1);
      const nx0 = n00 + ux * (n10 - n00), nx1 = n01 + ux * (n11 - n01);
      out[y * N + x] += amp * (nx0 + uy * (nx1 - nx0));
    }
  }
}

/**
 * Tileable 2D cumulus cell field: the maximum over nearby lattice cells of a radial blob at a jittered centre
 * with a hashed radius; the cell is present only where `gate` (a smooth mesoscale field) admits it, so cells
 * cluster into streets and clearings instead of a uniform pepper.
 */
function cellField2(N: number, cells: number, seed: number, gate: Float32Array, gateBias: number, out: Float32Array): void {
  const s = cells / N;
  for (let y = 0; y < N; y++) {
    const py = (y + 0.5) * s, cy = Math.floor(py);
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * s, cx = Math.floor(px);
      const meso = gate[y * N + x] + gateBias;
      let best = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy, wy = ((gy % cells) + cells) % cells;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, wx = ((gx % cells) + cells) % cells;
          const jx = hash3(wx, wy, 1, seed), jy = hash3(wx, wy, 2, seed), hr = hash3(wx, wy, 3, seed), hp = hash3(wx, wy, 4, seed);
          const dx = gx + 0.2 + jx * 0.6 - px, dy = gy + 0.2 + jy * 0.6 - py;
          const d = Math.sqrt(dx * dx + dy * dy);
          const radius = 0.34 + hr * hr * 0.42;
          // a cell switches on where the mesoscale field exceeds its own hashed threshold (soft edge)
          const on = Math.min(1, Math.max(0, (meso - (hp - 0.15)) / 0.3));
          const v = Math.max(0, 1 - d / radius) * on;
          if (v > best) best = v;
        }
      }
      out[y * N + x] = best;
    }
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Rank-equalise a field to a uniform histogram on (0, 1) (ties broken by index, so the result is deterministic). */
function equalise(field: Float32Array): Float32Array {
  const count = field.length;
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((a, b) => field[a] - field[b] || a - b);
  const out = new Float32Array(count);
  for (let rank = 0; rank < count; rank++) out[order[rank]] = (rank + 0.5) / count;
  return out;
}
const toByte = (v: number): number => Math.round(clamp01(v) * 255);

/**
 * The base-shape volume: RGBA8, `size`³, tileable. R = Perlin fbm dilated by inverted Worley fbm (the
 * "Perlin–Worley" of Schneider), remapped so its median sits near 0.5; G, B, A = inverted Worley fbm with
 * 4 / 8 / 16 cells per period (the shape's low, mid and high billow frequencies).
 */
export function bakeCloudShapeVolume(size = CLOUD_SHAPE_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N * N;
  const perlin = new Float32Array(count);
  perlin3(N, 4, seed + 11, perlin, 0.5);
  perlin3(N, 8, seed + 12, perlin, 0.25);
  perlin3(N, 16, seed + 13, perlin, 0.125);
  perlin3(N, 32, seed + 14, perlin, 0.0625);
  // five Worley fields at 4 / 8 / 16 / 32 / 64 cells per period; the three fbm channels share them
  // (HZD's GBA are Worley fbm at rising base frequencies — sharing octaves keeps the bake at five
  // evaluations instead of nine, and the channels stay distinct at their own base frequency)
  const W = [4, 8, 16, 32, 64].map((cells, k) => { const f = new Float32Array(count); worley3(N, cells, seed + 21 + k, f, 1); return f; });
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = clamp01(perlin[i] * 0.9 + 0.5); // gradient fbm ≈ −0.7..0.7 → 0..1
    const billow1 = 1 - (W[0][i] * 0.625 + W[1][i] * 0.25 + W[2][i] * 0.125);
    const billow2 = 1 - (W[1][i] * 0.625 + W[2][i] * 0.25 + W[3][i] * 0.125);
    const billow3 = 1 - (W[2][i] * 0.625 + W[3][i] * 0.25 + W[4][i] * 0.125);
    // Perlin–Worley: the billows keep their round lumps, the Perlin breaks their regularity
    const pw = clamp01(p + (1 - p) * billow1 * 0.5);
    const base = clamp01((pw - 0.35) / 0.65);
    out[i * 4] = toByte(base);
    out[i * 4 + 1] = toByte(billow1);
    out[i * 4 + 2] = toByte(billow2);
    out[i * 4 + 3] = toByte(billow3);
  }
  return out;
}

/**
 * The detail volume: RGBA8, `size`³, tileable. R, G, B = inverted Worley fbm at 4 / 8 / 16 cells per period;
 * A = 1 (unused). Sampled at a fine world scale, it erodes the base shape's outer shell into cauliflower lumps
 * (tops) and wisps (undersides).
 */
export function bakeCloudDetailVolume(size = CLOUD_DETAIL_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N * N;
  const D = [4, 8, 16, 32, 64].map((cells, k) => { const f = new Float32Array(count); worley3(N, cells, seed + 51 + k, f, 1); return f; });
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = toByte(1 - (D[0][i] * 0.625 + D[1][i] * 0.25 + D[2][i] * 0.125));
    out[i * 4 + 1] = toByte(1 - (D[1][i] * 0.625 + D[2][i] * 0.25 + D[3][i] * 0.125));
    out[i * 4 + 2] = toByte(1 - (D[2][i] * 0.625 + D[3][i] * 0.25 + D[4][i] * 0.125));
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * The weather field: RGBA8, `size`², tileable over one weather tile (CLOUD_WEATHER_TILE_M in the layer).
 *   R  cumuliform coverage 0..1 — carried by the cumulus cells (500 m and 1 km on a 12 km tile), clustered by
 *      a smooth mesoscale fbm, equalised: a low coverage admits the strongest cell cores as separate puffs, a high
 *      one merges them (the per-map coverage threshold cuts it: 1 − c admits exactly the fraction c)
 *   G  cumulus cell profile 0..1 — 1 at the centre of a cell, where a column rises highest
 *   B  stratiform coverage 0..1 — carried by the mesoscale field (broad clear / cloudy regions), equalised
 *   A  fine breakup 0..1 (turrets, the base line's wander, thin edges)
 */
export function bakeCloudWeatherMap(size = CLOUD_WEATHER_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N;
  const meso = new Float32Array(count);
  perlin2(N, 3, seed + 81, meso, 0.55); perlin2(N, 6, seed + 82, meso, 0.28); perlin2(N, 12, seed + 83, meso, 0.14);
  // the mesoscale field in 0..1 gates the cells (−0.6..0.6 → 0..1)
  const gate = new Float32Array(count);
  for (let i = 0; i < count; i++) gate[i] = clamp01(meso[i] * 0.8 + 0.5);
  const cells = new Float32Array(count);
  // cells of 1/24 of the tile (500 m on a 12 km tile: 340–760 m puffs), admitted by the mesoscale field
  cellField2(N, 24, seed + 91, gate, 0.0, cells);
  const bigCells = new Float32Array(count);
  // a few 1 km cells at a stricter gate
  cellField2(N, 12, seed + 92, gate, -0.15, bigCells);
  const fine = new Float32Array(count);
  perlin2(N, 24, seed + 111, fine, 0.6); perlin2(N, 48, seed + 112, fine, 0.4);
  // two coverage fields, each equalised to a uniform histogram so a map's coverage c admits exactly the
  // fraction c of the field (threshold 1 − c on the stored value) whatever the noise's own distribution:
  // the cumuliform one carried by the cells (the mesoscale field clusters them), the stratiform one by the
  // mesoscale field (broad clear / cloudy regions)
  const cumuliform = new Float32Array(count), stratiform = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const m = gate[i];
    const cell = Math.max(cells[i], bigCells[i] * 0.9);
    cumuliform[i] = cell * 0.75 + m * 0.2 + fine[i] * 0.05;
    stratiform[i] = m * 0.8 + cell * 0.15 + fine[i] * 0.05;
  }
  const equalisedCumulus = equalise(cumuliform), equalisedStratus = equalise(stratiform);
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const cell = Math.max(cells[i], bigCells[i] * 0.85);
    out[i * 4] = toByte(equalisedCumulus[i]);
    out[i * 4 + 1] = toByte(cell);
    out[i * 4 + 2] = toByte(equalisedStratus[i]);
    out[i * 4 + 3] = toByte(fine[i] * 0.8 + 0.5);
  }
  return out;
}

/** The three bakes the layer uploads (the worker posts each buffer as it finishes). */
export interface CloudNoiseBake {
  shape: Uint8Array;
  detail: Uint8Array;
  weather: Uint8Array;
}

export function bakeCloudNoise(seed = CLOUD_NOISE_SEED): CloudNoiseBake {
  return {
    shape: bakeCloudShapeVolume(CLOUD_SHAPE_SIZE, seed),
    detail: bakeCloudDetailVolume(CLOUD_DETAIL_SIZE, seed),
    weather: bakeCloudWeatherMap(CLOUD_WEATHER_SIZE, seed),
  };
}
