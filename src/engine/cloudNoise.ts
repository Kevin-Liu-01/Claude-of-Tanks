/**
 * cloudNoise.ts — the volumetric cloud layer's noise volumes and weather fields (round 68, 2026-09-24; round 71,
 * 2026-09-25: the multi-scale weather, the street / anvil / cirrus companion field, the curl volume, blue noise).
 *
 * Pure, deterministic and DOM-free so the bakes run in a worker (cloudNoiseWorker.ts) and the receipt
 * (volumetricClouds.selftest.mjs) pins their bytes in Node. Written from Schneider & Vos, "The Real-time
 * Volumetric Cloudscapes of Horizon Zero Dawn" (SIGGRAPH 2015 / Nubis 2017): a tileable Perlin–Worley
 * base-shape volume (R: Perlin fbm dilated by inverted Worley, GBA: Worley fbm at rising frequencies), a
 * tileable Worley-fbm detail volume that erodes the shape's edges, a tileable curl volume (the curl of a
 * gradient-noise potential, Bridson 2007) that warps the erosion lattice, two 2D weather fields — the weather
 * map of Nubis (coverage, type, precipitation) written first-party: the isotropic one (R: the multi-scale
 * cumuliform coverage — synoptic bands, mesoscale groups, local cells; G: convective vigour, the cloud type;
 * B: the broad stratiform coverage; A: a fine breakup) and the companion one in the wind frame (R: cumuliform
 * coverage in streets along the wind; G: the anvil / precipitation field; B: cirrus streaks; A: cirrus fibres)
 * — and a void-and-cluster blue-noise tile (Ulichney 1993) for the march offsets. Every noise is integer-lattice
 * periodic, so the volumes tile in world space. Nothing here is copied from any reference implementation; the
 * hashes and lattices are first-party.
 */

/** Shipped sizes (the receipt pins the bytes at these). */
export const CLOUD_SHAPE_SIZE = 64;
export const CLOUD_DETAIL_SIZE = 32;
export const CLOUD_WEATHER_SIZE = 256;
export const CLOUD_CURL_SIZE = 32;
export const CLOUD_BLUE_SIZE = 32;
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

/**
 * Tileable 2D gradient noise with `cells` lattice points along x and `cellsY` (default the same) along y —
 * unequal counts stretch the features along the axis with fewer cells (streets, fronts, cirrus streaks) —
 * accumulated into `out` × amp.
 */
function perlin2(N: number, cells: number, seed: number, out: Float32Array, amp: number, cellsY = cells): void {
  const g = new Float32Array(cells * cellsY * 2);
  for (let y = 0; y < cellsY; y++) for (let x = 0; x < cells; x++) {
    const a = hash3(x, y, 0, seed) * 6.283185307179586;
    g[(y * cells + x) * 2] = Math.cos(a); g[(y * cells + x) * 2 + 1] = Math.sin(a);
  }
  const s = cells / N, sy = cellsY / N;
  const dot = (xi: number, yi: number, dx: number, dy: number): number => g[(yi * cells + xi) * 2] * dx + g[(yi * cells + xi) * 2 + 1] * dy;
  for (let y = 0; y < N; y++) {
    const py = (y + 0.5) * sy, cy = Math.floor(py), fy = py - cy, uy = fade(fy), y0 = cy % cellsY, y1 = (cy + 1) % cellsY;
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
function cellField2(N: number, cells: number, seed: number, gate: Float32Array, gateBias: number, out: Float32Array, plateau = false): void {
  const s = cells / N;
  for (let y = 0; y < N; y++) {
    const py = (y + 0.5) * s, cy = Math.floor(py);
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * s, cx = Math.floor(px);
      const meso = gate[y * N + x] + gateBias;
      let best = 0, union = 1;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy, wy = ((gy % cells) + cells) % cells;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, wx = ((gx % cells) + cells) % cells;
          const jx = hash3(wx, wy, 1, seed), jy = hash3(wx, wy, 2, seed), hr = hash3(wx, wy, 3, seed), hp = hash3(wx, wy, 4, seed);
          const dx = gx + 0.2 + jx * 0.6 - px, dy = gy + 0.2 + jy * 0.6 - py;
          const d = Math.sqrt(dx * dx + dy * dy);
          // a cell switches on where the mesoscale field exceeds its own hashed threshold — 5 % of the cells
          // at a field value of 0.4, 30 % at 0.5, 80 % at 0.7 — so the cells cluster into groups with clear
          // regions between them (a soft edge on the threshold)
          const on = Math.min(1, Math.max(0, (Math.min(1, Math.max(0, (meso - 0.38) * 2.5)) - hp + 0.08) / 0.16));
          if (plateau) {
            // round 71c: a minimum radius (0.45–0.8 of a cell: 540–960 m on a 600 m lattice) with a plateau profile
            // (full to 55 % of the radius, then a smooth shoulder), so a coverage threshold admits most of a cell
            // or none of it — never the tiny cap of a cone — and neighbouring cells soft-union into one mass
            const radius = 0.45 + hr * 0.35;
            const t = Math.min(1, Math.max(0, (radius - d) / (radius * 0.45)));
            const v = t * t * (3 - 2 * t) * on;
            union *= 1 - v;
          } else {
            const radius = 0.34 + hr * hr * 0.42;
            const v = Math.max(0, 1 - d / radius) * on;
            if (v > best) best = v;
          }
        }
      }
      out[y * N + x] = plateau ? 1 - union : best;
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
 * Tileable street rolls in the wind frame: `rows` Gaussian ridges across y per tile (the boundary layer's roll
 * circulation), each wandering along x by a low-frequency noise (never a ruled grid), its width varying along
 * its length, with a slowly varying amplitude along the roll (a roll fades and reappears over 6–12 km), a hashed
 * strength per row, and a chain of rounded lumps riding on it (the cumulus of a street: separate but aligned,
 * soft gaps between — 71b's continuous roll read as a tube, 71a's cells gated onto rows as beads).
 */
function streetRolls(N: number, rows: number, seed: number, out: Float32Array): void {
  const wobble = new Float32Array(N * N);
  perlin2(N, 2, seed, wobble, 0.55, 4); perlin2(N, 4, seed + 1, wobble, 0.25, 8);
  const amp = new Float32Array(N * N);
  perlin2(N, 2, seed + 2, amp, 0.6, 3); perlin2(N, 4, seed + 3, amp, 0.3, 6);
  // the roll's width varies along its length (71c: a constant width read as a tube)
  const widthN = new Float32Array(N * N);
  perlin2(N, 3, seed + 5, widthN, 0.7, 5); perlin2(N, 6, seed + 6, widthN, 0.3, 10);
  // lumps along the roll: a chain of rounded cumulus 860 m apart (14 per 12 km tile) with jittered spacing and
  // radius, each row's chain phased so the lumps never align across rolls; the roll between lumps keeps 15 %
  const lumps = 14;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const v = (y + 0.5) / N * rows + wobble[i] * 0.8;
    const row = Math.round(v);
    const wr = ((row % rows) + rows) % rows;
    const d = v - row;
    const strength = 0.7 + 0.3 * hash3(wr, 0, 7, seed + 4);
    const width = 0.13 + 0.12 * clamp01(0.5 + widthN[i]);
    const ridge = Math.exp(-(d * d) / (2 * width * width));
    const u = (x + 0.5) / N * lumps + hash3(wr, 1, 9, seed + 8) * lumps;
    const k0 = Math.floor(u);
    let best = 0;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const wk = ((k % lumps) + lumps) % lumps;
      // a fifth of the lumps are missing and the rest vary in size and spacing (a regular chain read as a grid)
      if (hash3(wk, wr, 13, seed + 11) < 0.2) continue;
      const centre = k + 0.5 + (hash3(wk, wr, 11, seed + 9) - 0.5) * 0.7;
      const radius = 0.25 + 0.45 * hash3(wk, wr, 12, seed + 10);
      const dx = (u - centre) / radius;
      const lump = Math.max(0, 1 - dx * dx);
      if (lump > best) best = lump;
    }
    out[i] = ridge * (0.15 + 0.85 * best) * strength * clamp01(0.55 + amp[i] * 0.9);
  }
}

/**
 * The weather field: RGBA8, `size`², tileable over one weather tile (CLOUD_WEATHER_TILE_M in the layer).
 *   R  cumuliform coverage 0..1 — multi-scale: plateau cells 540–960 m across (and a few of 1 km) on a 12 km
 *      tile, neighbours soft-unioned into masses, admitted by a mesoscale group field (1–3 km) that a synoptic
 *      band field (4–6 km: the fronts and clearings) modulates, equalised so the per-map coverage threshold
 *      admits exactly that fraction (1 − c on the stored value)
 *   G  convective vigour 0..1 — a smooth mesoscale field (equalised) the layer maps between a map's type range:
 *      0 stratus, 0.5 cumulus, 1 cumulonimbus (the Nubis weather map's type channel)
 *   B  stratiform coverage 0..1 — carried by the mesoscale and synoptic fields (broad clear / cloudy regions), equalised
 *   A  fine breakup 0..1 (turrets, the base line's wander, thin edges)
 */
export function bakeCloudWeatherMap(size = CLOUD_WEATHER_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N;
  const meso = new Float32Array(count);
  perlin2(N, 3, seed + 81, meso, 0.55); perlin2(N, 6, seed + 82, meso, 0.28); perlin2(N, 12, seed + 83, meso, 0.14);
  // the synoptic scale: two to three bands per tile, stretched (a front is longer than it is wide)
  const syn = new Float32Array(count);
  perlin2(N, 2, seed + 71, syn, 0.6, 3); perlin2(N, 3, seed + 72, syn, 0.4, 5);
  // the mesoscale field in 0..1 gates the cells, the synoptic field shifts the gate (−0.6..0.6 → 0..1)
  const gate = new Float32Array(count);
  for (let i = 0; i < count; i++) gate[i] = clamp01(meso[i] * 0.72 + syn[i] * 0.55 + 0.5);
  const cells = new Float32Array(count);
  // cells on a 1/20 lattice (600 m on a 12 km tile), each 540–960 m across with a plateau profile, neighbours
  // soft-unioned into mid-size masses (71c: the cone cells' tiny caps were the far field's identical puffs)
  cellField2(N, 20, seed + 91, gate, 0.0, cells, true);
  const bigCells = new Float32Array(count);
  // a few 1 km cells at a stricter gate
  cellField2(N, 12, seed + 92, gate, -0.15, bigCells, true);
  const fine = new Float32Array(count);
  perlin2(N, 24, seed + 111, fine, 0.6); perlin2(N, 48, seed + 112, fine, 0.4);
  const vigour = new Float32Array(count);
  perlin2(N, 4, seed + 121, vigour, 0.6); perlin2(N, 8, seed + 122, vigour, 0.3); perlin2(N, 16, seed + 123, vigour, 0.1);
  // the coverage fields, each equalised to a uniform histogram so a map's coverage c admits exactly the
  // fraction c of the field whatever the noise's own distribution: the cumuliform one carried by the cells
  // (the gate clusters them into groups along the synoptic bands), the stratiform one by the gate itself
  const cumuliform = new Float32Array(count), stratiform = new Float32Array(count), vig = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const m = gate[i];
    const cell = Math.max(cells[i], bigCells[i] * 0.9);
    cumuliform[i] = cell * 0.72 + m * 0.23 + fine[i] * 0.05;
    stratiform[i] = m * 0.8 + cell * 0.15 + fine[i] * 0.05;
    // vigour leans toward the deep coverage (the convective groups) but keeps its own field
    vig[i] = vigour[i] * 0.6 + (m - 0.5) * 0.5;
  }
  const equalisedCumulus = equalise(cumuliform), equalisedStratus = equalise(stratiform), equalisedVigour = equalise(vig);
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = toByte(equalisedCumulus[i]);
    out[i * 4 + 1] = toByte(equalisedVigour[i]);
    out[i * 4 + 2] = toByte(equalisedStratus[i]);
    out[i * 4 + 3] = toByte(fine[i] * 0.8 + 0.5);
  }
  return out;
}

/**
 * The companion weather field in the WIND FRAME (the layer rotates its lookup so x runs along the wind):
 *   R  cumuliform coverage in cloud streets — seven rolls per tile (1.7 km apart on 12 km) along the wind, their
 *      width and amplitude varying along the roll, a chain of rounded lumps 860 m apart riding on each (aligned
 *      cumulus with soft gaps, the roll between them at 15 %), equalised
 *   G  the anvil / precipitation field — a broad, stretched field (equalised): its top share marks where a
 *      cumulonimbus spreads an anvil
 *   B  cirrus streaks — gradient fbm stretched 6:1 along x (equalised, so a cirrus coverage c admits c)
 *   A  cirrus fibres — finer strands along the same axis, 0..1
 */
export function bakeCloudWeatherStreets(size = CLOUD_WEATHER_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N;
  const rolls = new Float32Array(count);
  streetRolls(N, 7, seed + 141, rolls);
  // the lumps along a roll: 750 m and 375 m along the wind, a little shorter across
  const lumps = new Float32Array(count);
  perlin2(N, 16, seed + 151, lumps, 0.6, 24); perlin2(N, 32, seed + 152, lumps, 0.4, 48);
  const fine = new Float32Array(count);
  perlin2(N, 24, seed + 161, fine, 0.6); perlin2(N, 48, seed + 162, fine, 0.4);
  const anvil = new Float32Array(count);
  perlin2(N, 2, seed + 171, anvil, 0.6, 3); perlin2(N, 4, seed + 172, anvil, 0.4, 6);
  const streaks = new Float32Array(count);
  perlin2(N, 2, seed + 181, streaks, 0.5, 12); perlin2(N, 4, seed + 182, streaks, 0.3, 24); perlin2(N, 8, seed + 183, streaks, 0.2, 48);
  const fibres = new Float32Array(count);
  perlin2(N, 6, seed + 191, fibres, 0.6, 96); perlin2(N, 12, seed + 192, fibres, 0.4, 160);
  const streets = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // the chain's lumps carry the roll (depth 0.85 in streetRolls); the finer lump noise varies them a little
    const modulation = 1 - 0.2 * clamp01(0.5 - lumps[i] * 0.9);
    streets[i] = rolls[i] * modulation + fine[i] * 0.04;
  }
  const eqStreets = equalise(streets), eqAnvil = equalise(anvil), eqStreaks = equalise(streaks);
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = toByte(eqStreets[i]);
    out[i * 4 + 1] = toByte(eqAnvil[i]);
    out[i * 4 + 2] = toByte(eqStreaks[i]);
    out[i * 4 + 3] = toByte(fibres[i] * 0.9 + 0.5);
  }
  return out;
}

/**
 * The curl volume: RGBA8, `size`³, tileable. RGB = the curl of a three-component gradient-noise potential
 * (two octaves), a divergence-free field that advects the detail lattice at the cloud's edges so the erosion
 * swirls instead of pitting (Bridson, Hourihan & Nordenstam 2007, "Curl-noise for procedural fluid flow"),
 * mapped −1..1 → 0..255. A = 255.
 */
export function bakeCloudCurlVolume(size = CLOUD_CURL_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N * N;
  const psi = [0, 1, 2].map((k) => {
    const f = new Float32Array(count);
    perlin3(N, 4, seed + 201 + k, f, 0.7);
    perlin3(N, 8, seed + 211 + k, f, 0.3);
    return f;
  });
  const at = (f: Float32Array, x: number, y: number, z: number): number => f[((((z % N) + N) % N) * N + (((y % N) + N) % N)) * N + (((x % N) + N) % N)];
  const out = new Uint8Array(count * 4);
  let peak = 1e-6;
  const curl = new Float32Array(count * 3);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (z * N + y) * N + x;
    // central differences on the periodic lattice
    const dPz_dy = at(psi[2], x, y + 1, z) - at(psi[2], x, y - 1, z), dPy_dz = at(psi[1], x, y, z + 1) - at(psi[1], x, y, z - 1);
    const dPx_dz = at(psi[0], x, y, z + 1) - at(psi[0], x, y, z - 1), dPz_dx = at(psi[2], x + 1, y, z) - at(psi[2], x - 1, y, z);
    const dPy_dx = at(psi[1], x + 1, y, z) - at(psi[1], x - 1, y, z), dPx_dy = at(psi[0], x, y + 1, z) - at(psi[0], x, y - 1, z);
    curl[i * 3] = dPz_dy - dPy_dz; curl[i * 3 + 1] = dPx_dz - dPz_dx; curl[i * 3 + 2] = dPy_dx - dPx_dy;
    for (let c = 0; c < 3; c++) peak = Math.max(peak, Math.abs(curl[i * 3 + c]));
  }
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = toByte(curl[i * 3 + c] / peak * 0.5 + 0.5);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * A blue-noise tile: RGBA8, `size`², the void-and-cluster rank of every texel (Ulichney 1993) with a toroidal
 * Gaussian energy (σ = 1.5 texels, a 13-texel window) — the march's per-texel ray offset, so the start jitter of
 * neighbouring rays decorrelates without the low-frequency clumps of white noise or the ramps of a gradient
 * pattern. R = G = B = rank / (size² − 1), A = 255.
 */
export function bakeCloudBlueNoise(size = CLOUD_BLUE_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N, R = 6, sigma = 1.5;
  const kernel = new Float32Array((2 * R + 1) * (2 * R + 1));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) kernel[(dy + R) * (2 * R + 1) + dx + R] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  const energy = new Float32Array(count);
  const binary = new Uint8Array(count);
  const splat = (x: number, y: number, sign: number): void => {
    for (let dy = -R; dy <= R; dy++) {
      const yy = (((y + dy) % N) + N) % N;
      for (let dx = -R; dx <= R; dx++) energy[yy * N + ((((x + dx) % N) + N) % N)] += sign * kernel[(dy + R) * (2 * R + 1) + dx + R];
    }
  };
  // the initial pattern: a tenth of the texels on, hashed; then swap the tightest cluster into the largest void until stable
  let ones = 0;
  for (let i = 0; i < count; i++) if (hash3(i % N, Math.floor(i / N), 5, seed + 301) < 0.1) { binary[i] = 1; ones++; splat(i % N, Math.floor(i / N), 1); }
  const argExt = (want: number, max: boolean): number => {
    let best = -1, bestE = max ? -Infinity : Infinity;
    for (let i = 0; i < count; i++) if (binary[i] === want) { const e = energy[i]; if (max ? e > bestE : e < bestE) { bestE = e; best = i; } }
    return best;
  };
  for (let iter = 0; iter < count; iter++) {
    const cluster = argExt(1, true);
    binary[cluster] = 0; splat(cluster % N, Math.floor(cluster / N), -1);
    const voidT = argExt(0, false);
    binary[voidT] = 1; splat(voidT % N, Math.floor(voidT / N), 1);
    if (voidT === cluster) break;
  }
  const rank = new Int32Array(count).fill(-1);
  // phase 1: remove the tightest clusters of the initial pattern, ranking downward
  const work = Uint8Array.from(binary);
  let n = ones;
  while (n > 0) { const c = argExt(1, true); binary[c] = 0; splat(c % N, Math.floor(c / N), -1); rank[c] = --n; }
  // phase 2: restore, then fill the largest voids upward
  for (let i = 0; i < count; i++) { binary[i] = work[i]; }
  energy.fill(0);
  for (let i = 0; i < count; i++) if (binary[i]) splat(i % N, Math.floor(i / N), 1);
  n = ones;
  while (n < count) { const v = argExt(0, false); binary[v] = 1; splat(v % N, Math.floor(v / N), 1); rank[v] = n++; }
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const b = toByte(rank[i] / (count - 1));
    out[i * 4] = b; out[i * 4 + 1] = b; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}

/** The six bakes the layer uploads (the worker posts each buffer as it finishes). */
export interface CloudNoiseBake {
  shape: Uint8Array;
  detail: Uint8Array;
  weather: Uint8Array;
  streets: Uint8Array;
  curl: Uint8Array;
  blue: Uint8Array;
}

export function bakeCloudNoise(seed = CLOUD_NOISE_SEED): CloudNoiseBake {
  return {
    shape: bakeCloudShapeVolume(CLOUD_SHAPE_SIZE, seed),
    detail: bakeCloudDetailVolume(CLOUD_DETAIL_SIZE, seed),
    weather: bakeCloudWeatherMap(CLOUD_WEATHER_SIZE, seed),
    streets: bakeCloudWeatherStreets(CLOUD_WEATHER_SIZE, seed),
    curl: bakeCloudCurlVolume(CLOUD_CURL_SIZE, seed),
    blue: bakeCloudBlueNoise(CLOUD_BLUE_SIZE, seed),
  };
}
