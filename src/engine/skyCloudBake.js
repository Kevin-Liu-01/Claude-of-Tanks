/**
 * Pure deterministic cloud texture bakes. This module intentionally has no
 * DOM or Three.js dependency so the expensive FBM work can run in a worker.
 */

/** Deterministic PRNG (Mulberry32). */
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a period-one value-noise FBM sampler in both axes. */
function makeFbm(rng, octaves, base) {
  const lattices = [];
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    lattices.push({ n, grid });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  return function fbm(u, v) {
    let sum = 0;
    let amp = 0.55;
    let tot = 0;
    for (let o = 0; o < octaves; o++) {
      const { n, grid } = lattices[o];
      let uu = (u + o * 0.37) % 1;
      if (uu < 0) uu += 1;
      let vv = (v + o * 0.61) % 1;
      if (vv < 0) vv += 1;
      const x = uu * n;
      const y = vv * n;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = smooth(x - x0);
      const fy = smooth(y - y0);
      const xa = x0 % n;
      const xb = (x0 + 1) % n;
      const ya = y0 % n;
      const yb = (y0 + 1) % n;
      const g00 = grid[ya * n + xa];
      const g10 = grid[ya * n + xb];
      const g01 = grid[yb * n + xa];
      const g11 = grid[yb * n + xb];
      sum += (g00 + (g10 - g00) * fx + (g01 - g00) * fy
        + (g00 - g10 - g01 + g11) * fx * fy) * amp;
      tot += amp;
      amp *= 0.5;
    }
    return sum / tot;
  };
}

function clampNum(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

function smoothstepNum(a, b, x) {
  const t = clampNum((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Return the exact RGBA bytes for the low cumulus deck. */
export function bakeCumulusPixels(width, height, config) {
  const {
    seed, warp, macroAniso, threshold, cluster, edge, edgeWisp, coreWidth,
    marchSteps, marchStepPx, shadeK, lit, shade, silver, detailAmp,
    alphaVariation, maxAlpha,
  } = config;
  const rng = mulberry32(seed);
  const fbmD = makeFbm(rng, 6, 8);
  const fbmWX = makeFbm(rng, 3, 5);
  const fbmWY = makeFbm(rng, 3, 5);
  const fbmM = makeFbm(rng, 2, 3);
  const fbmHF = makeFbm(rng, 3, 48);

  const mask = new Float32Array(width * height);
  const core = new Float32Array(width * height);
  const sigma = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      let wu = (u + (fbmWX(u, v) - 0.5) * warp) % 1;
      if (wu < 0) wu += 1;
      let wv = (v + (fbmWY(u, v) - 0.5) * warp) % 1;
      if (wv < 0) wv += 1;
      const d = fbmD(wu, wv);
      const mac = fbmM(u, (v * macroAniso) % 1);
      const thr = threshold + (mac - 0.5) * 2 * cluster;
      const i = y * width + x;
      const edgeWidth = edge + edgeWisp * (1 - smoothstepNum(0.35, 0.62, mac));
      const m = smoothstepNum(thr, thr + edgeWidth, d)
        * (0.72 + 0.28 * smoothstepNum(0.25, 0.75, fbmHF(u * 0.25, v * 0.25)));
      const c = smoothstepNum(thr + edgeWidth, thr + edgeWidth + coreWidth, d);
      mask[i] = m;
      core[i] = c;
      sigma[i] = m * (0.3 + 0.7 * c);
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const m = mask[i];
      if (m <= 0) {
        pixels[o + 3] = 0;
        continue;
      }
      let occl = 0;
      for (let s = 1; s <= marchSteps; s++) {
        let yy = (y - s * marchStepPx) % height;
        if (yy < 0) yy += height;
        occl += sigma[yy * width + x];
      }
      const light = Math.pow(Math.exp(-shadeK * occl), 0.85);
      const silverLine = 1 + silver * (1 - core[i]) * light;
      pixels[o] = Math.min(255, Math.round(255
        * (shade[0] + (lit[0] - shade[0]) * light) * silverLine));
      pixels[o + 1] = Math.min(255, Math.round(255
        * (shade[1] + (lit[1] - shade[1]) * light) * silverLine));
      pixels[o + 2] = Math.min(255, Math.round(255
        * (shade[2] + (lit[2] - shade[2]) * light) * silverLine * 0.97));
      const macroA = 1 - alphaVariation
        * (1 - fbmM(x / width, ((y / height) * macroAniso) % 1));
      const hfA = 1 - detailAmp * (1 - core[i]) * fbmHF(x / width, y / height);
      pixels[o + 3] = Math.round(255 * maxAlpha * macroA * hfA * m
        * (0.30 + 0.70 * core[i]));
    }
  }
  return pixels;
}

/** Return the exact RGBA bytes for the high cirrus deck. */
export function bakeCirrusPixels(width, height, config) {
  const { seed } = config;
  const rng = mulberry32(seed + 11);
  const fbm = makeFbm(rng, 4, 4);
  const fbmW = makeFbm(rng, 2, 3);
  const fbmB = makeFbm(rng, 2, 2);
  const fbmE = makeFbm(rng, 3, 14);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const litColor = [1.0, 0.99, 0.955];
  const shadeColor = [0.66, 0.72, 0.85];
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      let wu = (u + (fbmW(u, v) - 0.5) * 0.16 + (fbmE(u, v) - 0.5) * 0.06) % 1;
      if (wu < 0) wu += 1;
      const sv = (v * 3) % 1;
      const s = fbm(wu, sv);
      const bank = smoothstepNum(0.34, 0.60, fbmB(u, v));
      const a = smoothstepNum(0.56, 0.88, s) * bank
        * (0.62 + 0.38 * smoothstepNum(0.3, 0.7, fbmE(u + 0.31, v + 0.57)));
      const s2 = fbm(wu, (sv + 0.018) % 1);
      const light = clampNum((s - s2) * 9 + 0.55, 0, 1);
      const o = (y * width + x) * 4;
      pixels[o] = Math.round(255
        * (shadeColor[0] + (litColor[0] - shadeColor[0]) * light));
      pixels[o + 1] = Math.round(255
        * (shadeColor[1] + (litColor[1] - shadeColor[1]) * light));
      pixels[o + 2] = Math.round(255
        * (shadeColor[2] + (litColor[2] - shadeColor[2]) * light));
      pixels[o + 3] = Math.round(255 * a * 0.6);
    }
  }
  return pixels;
}
