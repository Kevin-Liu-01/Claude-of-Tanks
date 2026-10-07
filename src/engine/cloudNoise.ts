/**
 * cloudNoise.ts — the volumetric cloud layer's weather fields (round 68, 2026-09-24; round 71, 2026-09-25: the
 * multi-scale weather, the street / anvil / cirrus companion field, blue noise; Clouds 2.0, 2026-10-06: the local
 * weather the layered medium reads — the 3D shape and detail volumes are baked on the GPU, cloudVolumeNoise.ts).
 *
 * Pure, deterministic and DOM-free so the bakes run in a worker (cloudNoiseWorker.ts) and the receipt
 * (volumetricClouds.selftest.mjs) pins them in Node. The 2D weather fields are the weather map of Nubis (Schneider &
 * Vos 2015/2017: coverage, type, precipitation) written first-party: the isotropic one (R: the multi-scale cumuliform
 * coverage — synoptic bands, mesoscale groups, local cells; G: convective vigour, the cloud type; B: the broad
 * stratiform coverage; A: a fine breakup), the companion one in the wind frame (R: cumuliform coverage in streets along
 * the wind; G: the anvil / precipitation field; B: cirrus streaks; A: cirrus fibres), the local weather of the layered
 * medium (bakeCloudLocalWeather), and a void-and-cluster blue-noise tile (Ulichney 1993) for the march offsets. Every
 * noise is integer-lattice periodic, so the fields tile in world space. Nothing here is copied from any reference
 * implementation; the hashes and lattices are first-party.
 */

/** Shipped sizes (the receipt pins the bytes at these). */
export const CLOUD_WEATHER_SIZE = 256;
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

/** Immutable cell attributes, cached once per worker bake rather than per pixel. */
function cumulusCellAttributes(cells: number, seed: number): Float64Array {
  const attributes = new Float64Array(cells * cells * 8);
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const i = (y * cells + x) * 8;
    const angle = hash3(x, y, 5, seed) * Math.PI * 2;
    attributes[i] = hash3(x, y, 1, seed);
    attributes[i + 1] = hash3(x, y, 2, seed);
    attributes[i + 2] = hash3(x, y, 3, seed);
    attributes[i + 3] = hash3(x, y, 4, seed);
    attributes[i + 4] = Math.cos(angle);
    attributes[i + 5] = Math.sin(angle);
    attributes[i + 6] = 0.78 + hash3(x, y, 6, seed) * 0.42;
    attributes[i + 7] = 0.58 + hash3(x, y, 7, seed) * 0.22;
  }
  return attributes;
}

/**
 * Tileable 2D cumulus cell field: the maximum over nearby lattice cells of a warped, rotated lobe at a jittered centre
 * with a hashed radius; the cell is present only where `gate` (a smooth mesoscale field) admits it, so cells
 * cluster into streets and clearings instead of a uniform pepper.
 */
function cellField2(N: number, cells: number, seed: number, gate: Float32Array, gateBias: number, out: Float32Array, plateau = false): void {
  const s = cells / N;
  const attributes = cumulusCellAttributes(cells, seed);
  // Periodic domain distortion breaks the circular footprints and lattice without
  // adding any runtime texture lookup. Each mass still belongs to its weather group.
  const warpX = new Float32Array(N * N), warpY = new Float32Array(N * N);
  perlin2(N, cells, seed + 211, warpX, 0.7);
  perlin2(N, cells * 2, seed + 212, warpX, 0.3);
  perlin2(N, cells, seed + 213, warpY, 0.7);
  perlin2(N, cells * 2, seed + 214, warpY, 0.3);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * s + warpX[y * N + x] * 0.8;
      const py = (y + 0.5) * s + warpY[y * N + x] * 0.8;
      const cx = Math.floor(px), cy = Math.floor(py);
      const meso = gate[y * N + x] + gateBias;
      let best = 0, union = 1;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy, wy = ((gy % cells) + cells) % cells;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, wx = ((gx % cells) + cells) % cells;
          const i = (wy * cells + wx) * 8;
          const jx = attributes[i], jy = attributes[i + 1], hr = attributes[i + 2], hp = attributes[i + 3];
          const dx = gx + 0.05 + jx * 0.9 - px, dy = gy + 0.05 + jy * 0.9 - py;
          const cos = attributes[i + 4], sin = attributes[i + 5], aspect = attributes[i + 6];
          const along = (dx * cos + dy * sin) / aspect;
          const across = (-dx * sin + dy * cos) * aspect;
          const d = Math.sqrt(along * along + across * across);
          // a cell switches on where the mesoscale field exceeds its own hashed threshold — 5 % of the cells
          // at a field value of 0.4, 30 % at 0.5, 80 % at 0.7 — so the cells cluster into groups with clear
          // regions between them (a soft edge on the threshold)
          const on = Math.min(1, Math.max(0, (Math.min(1, Math.max(0, (meso - 0.38) * 2.5)) - hp + 0.08) / 0.16));
          if (plateau) {
            // Unequal overlapping lobes, with a small, variable core instead of
            // an identical flat-topped disc extruded through the whole cloud slab.
            const radius = 0.3 + hr * 0.5;
            const shoulder = attributes[i + 7];
            const t = Math.min(1, Math.max(0, (radius - d) / (radius * shoulder)));
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
 * Clouds 2.0: equalise through a 65 536-bin histogram of the field's range (linear time; the comparator sort of
 * `equalise` took a second for a 512² channel under load). Each value maps to its bin's mid-rank, so the result is
 * uniform to a bin's width and deterministic.
 */
function equaliseHistogram(field: Float32Array): Float32Array {
  const count = field.length, BINS = 65536;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < count; i++) { const v = field[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const scale = hi > lo ? (BINS - 1) / (hi - lo) : 0;
  const bins = new Uint32Array(BINS);
  const bin = new Uint32Array(count);
  for (let i = 0; i < count; i++) { const b = Math.round((field[i] - lo) * scale); bin[i] = b; bins[b]++; }
  const mid = new Float32Array(BINS);
  let below = 0;
  for (let b = 0; b < BINS; b++) { mid[b] = (below + bins[b] * 0.5) / count; below += bins[b]; }
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = mid[bin[i]];
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
  // Each wind street has its own population and spacing, rather than repeating
  // the same fourteen-bead cadence across the sky. The roll between lumps keeps 15 %.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const v = (y + 0.5) / N * rows + wobble[i] * 0.8;
    const row = Math.round(v);
    const wr = ((row % rows) + rows) % rows;
    const d = v - row;
    const strength = 0.7 + 0.3 * hash3(wr, 0, 7, seed + 4);
    const width = 0.13 + 0.12 * clamp01(0.5 + widthN[i]);
    const ridge = Math.exp(-(d * d) / (2 * width * width));
    const lumps = 9 + Math.floor(hash3(wr, 0, 15, seed + 12) * 10);
    const u = (x + 0.5) / N * lumps + hash3(wr, 1, 9, seed + 8) * lumps;
    const k0 = Math.floor(u);
    let best = 0;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const wk = ((k % lumps) + lumps) % lumps;
      // a fifth of the lumps are missing and the rest vary in size and spacing (a regular chain read as a grid)
      if (hash3(wk, wr, 13, seed + 11) < 0.2) continue;
      const centre = k + 0.5 + (hash3(wk, wr, 11, seed + 9) - 0.5) * 1.0;
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
 *   R  cumuliform coverage 0..1 — multi-scale: warped lobes of unequal size and aspect ratio on a 12 km
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
  // Jittered, warped lobes on a 600 m lattice overlap into irregular masses.
  // Unequal shoulders keep the admitted cores from becoming identical discs.
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
    cumuliform[i] = cell * 0.65 + m * 0.23 + fine[i] * 0.12;
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

/** Clouds 2.0 (2026-10-06): the local weather's texel count (its world period is CLOUD_LOCAL_TILE_M in the layer). */
export const CLOUD_LOCAL_SIZE = 512;

/** Tileable 2D inverted Worley (1 − the squared F1 distance in cell units, clamped at 1), accumulated into `out` × amp. */
function worley2(N: number, cells: number, seed: number, out: Float32Array, amp: number): void {
  const fp = new Float32Array(cells * cells * 2);
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    fp[(y * cells + x) * 2] = hash3(x, y, 9, seed);
    fp[(y * cells + x) * 2 + 1] = hash3(x, y, 10, seed);
  }
  const s = cells / N;
  for (let y = 0; y < N; y++) {
    const py = (y + 0.5) * s, cy = Math.floor(py);
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * s, cx = Math.floor(px);
      let best = 1;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy, wy = ((gy % cells) + cells) % cells;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, wx = ((gx % cells) + cells) % cells;
          const i = (wy * cells + wx) * 2;
          const dx = gx + fp[i] - px, dy = gy + fp[i + 1] - py;
          const dd = dx * dx + dy * dy;
          if (dd < best) best = dd;
        }
      }
      out[y * N + x] += amp * (1 - best);
    }
  }
}

/**
 * Clouds 2.0 (2026-10-06): the local weather — RGBA8, `size`², tileable over one CLOUD_LOCAL_TILE_M period (48 km). Each
 * channel is a coverage the layers' shells threshold (a map's coverage c admits the fraction c of it: every channel is
 * rank-equalised); the 3D shape volume then carves the admitted area into clouds, so a cloud is never one weather cell:
 *   R  cumuliform — an inverted-Worley fbm over four octaves (cells of 4, 2, 1 and 0.5 km) whose crests, where the
 *      octaves' cells line up, are groups of masses of every size, lifted and lowered by a broad cluster field (16 km
 *      fields and clearings), so the sky holds cloud fields, gaps and lone masses instead of an even pepper
 *   G  aloft — the same law two octaves finer and under its own cluster field: the elements of an altocumulus layer
 *   B  stratiform — a gradient fbm (16 km to 1 km): the broad decks, their thin parts and breaks
 *   A  cells — an inverted-Worley fbm at 1.2 and 0.6 km: a stratocumulus deck's cells (thick cores, thin borders)
 */
export function bakeCloudLocalWeather(size = CLOUD_LOCAL_SIZE, seed = CLOUD_NOISE_SEED): Uint8Array {
  const N = size, count = N * N;
  const clusterA = new Float32Array(count);
  perlin2(N, 3, seed + 401, clusterA, 0.65); perlin2(N, 6, seed + 402, clusterA, 0.35);
  const clusterB = new Float32Array(count);
  perlin2(N, 4, seed + 403, clusterB, 0.6); perlin2(N, 8, seed + 404, clusterB, 0.4);
  const cu = new Float32Array(count);
  worley2(N, 12, seed + 411, cu, 0.40); worley2(N, 24, seed + 412, cu, 0.36); worley2(N, 48, seed + 413, cu, 0.33); worley2(N, 96, seed + 414, cu, 0.30);
  const ac = new Float32Array(count);
  worley2(N, 48, seed + 421, ac, 0.40); worley2(N, 96, seed + 422, ac, 0.36); worley2(N, 192, seed + 423, ac, 0.30);
  const st = new Float32Array(count);
  perlin2(N, 3, seed + 431, st, 0.5); perlin2(N, 6, seed + 432, st, 0.25); perlin2(N, 12, seed + 433, st, 0.14);
  perlin2(N, 24, seed + 434, st, 0.07); perlin2(N, 48, seed + 435, st, 0.04);
  const ce = new Float32Array(count);
  worley2(N, 40, seed + 441, ce, 0.65); worley2(N, 80, seed + 442, ce, 0.35);
  for (let i = 0; i < count; i++) {
    cu[i] += clusterA[i] * 0.55;
    ac[i] += clusterB[i] * 0.6;
  }
  const r = equaliseHistogram(cu), g = equaliseHistogram(ac), b = equaliseHistogram(st), a = equaliseHistogram(ce);
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = toByte(r[i]);
    out[i * 4 + 1] = toByte(g[i]);
    out[i * 4 + 2] = toByte(b[i]);
    out[i * 4 + 3] = toByte(a[i]);
  }
  return out;
}

/** The four bakes the layer uploads from the worker (the noise volumes are baked on the GPU: cloudVolumeNoise.ts). */
export interface CloudNoiseBake {
  weather: Uint8Array;
  streets: Uint8Array;
  blue: Uint8Array;
  local: Uint8Array;
}

export function bakeCloudNoise(seed = CLOUD_NOISE_SEED): CloudNoiseBake {
  return {
    weather: bakeCloudWeatherMap(CLOUD_WEATHER_SIZE, seed),
    streets: bakeCloudWeatherStreets(CLOUD_WEATHER_SIZE, seed),
    blue: bakeCloudBlueNoise(CLOUD_BLUE_SIZE, seed),
    local: bakeCloudLocalWeather(CLOUD_LOCAL_SIZE, seed),
  };
}
