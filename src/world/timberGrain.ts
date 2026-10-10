// src/world/timberGrain.ts — the structure wood's grain painter (the facades lane, round 6), free of three and the DOM
// so the surface paint worker paints it ahead of the props build (structureDetailTile.ts) with the same texels.

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * The structure wood's grain (the facades lane, round 6; gauntlet wave 241 on Steinburg's framing: "smooth,
 * smeared-grain planks", "stretched, blurred wood texture"): hewn and weathered oak at its own scale — `s` px over the
 * structure buckets' 1.82 m tile (0.55 uv/m; 256 px is 7 mm a pixel, twice the old tile's texels): latewood lines
 * every 2.5 mm meandering along the grain, broad figure streaks, drying checks, silvered raised grain in patches and two
 * knots, over the old tile's plank seams (every 0.4 m, the last plank 0.23 m, where a framing member's uv never
 * reaches). The grain runs along v (y), as the members' UVs lay it. Seamless: periodic lattice noise, a whole number
 * of growth lines across the tile, the knots clear of its edges. Returns the albedo's luminance (the vertex colour
 * gives the hue) and the height its normal and surface maps are drawn from.
 */
export function paintTimberGrain(s: number, seed: number): { lum: Float32Array; hgt: Float32Array } {
  const lum = new Float32Array(s * s), hgt = new Float32Array(s * s);
  // pnoise2's lattice read once per field, not hashed per pixel (a 256 px tile in one props slice)
  const lattice = (cx: number, cy: number, sd: number) => {
    const g = new Float32Array(cx * cy);
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) g[j * cx + i] = hash2(i, j, sd);
    return (x: number, y: number) => {
      const fx = x / s * cx, fy = y / s * cy, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const i0 = ((x0 % cx) + cx) % cx, i1 = (i0 + 1) % cx, j0 = ((y0 % cy) + cy) % cy, j1 = (j0 + 1) % cy;
      const a = g[j0 * cx + i0], b = g[j0 * cx + i1], c = g[j1 * cx + i0], d = g[j1 * cx + i1];
      return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    };
  };
  const warpA = lattice(16, 2, seed), warpB = lattice(48, 6, seed + 1), streakF = lattice(32, 3, seed + 2), silverF = lattice(6, 2, seed + 5);
  const k = s / 256, lines = 72, period = s / lines;
  const seamEvery = 56 * k, seamWidth = 4 * k;
  // the knots: a dark core in a ring, the growth lines swept round it — on the boards only: a framing member's uv keeps
  // to u 0.05-0.18 of the tile (geometry.ts member UVs), where hewn oak was chosen straight-grained
  const knots = [[0.31, 0.27, 4.5, 10], [0.74, 0.62, 4, 9], [0.6, 0.86, 3.5, 8]].map(([u, v, rx, ry]) => [u * s, v * s, rx * k, ry * k]);
  // the drying checks: long hairline splits along the grain, wandering a little, tapering at both ends (wrapping in v)
  const checks = new Float32Array(s * s);
  for (let c = 0; c < 14; c++) {
    const cx = hash2(c, 1, seed + 6) * s, cy = hash2(c, 2, seed + 6) * s, len = (40 + hash2(c, 3, seed + 6) * 110) * k;
    const amp = (0.6 + hash2(c, 4, seed + 6) * 1.6) * k, wave = (60 + hash2(c, 5, seed + 6) * 80) * k, deep = 0.5 + hash2(c, 6, seed + 6) * 0.5;
    if ((cx % seamEvery) < seamWidth + 3 * k) continue;
    for (let t = 0; t < len; t++) {
      const y = Math.floor(cy + t) % s, xf = cx + Math.sin(t / wave * Math.PI * 2) * amp;
      const taper = Math.min(1, t / (len * 0.2), (len - t) / (len * 0.2)) * deep;
      const x0 = Math.floor(xf), fr = xf - x0;
      checks[y * s + (((x0 % s) + s) % s)] = Math.max(checks[y * s + (((x0 % s) + s) % s)], taper * (1 - fr));
      checks[y * s + (((x0 + 1) % s + s) % s)] = Math.max(checks[y * s + (((x0 + 1) % s + s) % s)], taper * fr);
    }
  }
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x;
    let sweep = 0, knot = 0;
    for (const [kx, ky, rx, ry] of knots) {
      const dx = (x - kx) / rx, dy = (y - ky) / ry, d2 = dx * dx + dy * dy;
      if (d2 > 16) continue;
      sweep += Math.exp(-d2 * 0.35) * 2.6 * rx * dx / Math.sqrt(dx * dx + 0.25);
      knot = Math.max(knot, d2 < 1 ? 1 : d2 < 1.8 ? 0.45 : 0);
    }
    const warp = (warpA(x, y) - 0.5) * 16 * k + (warpB(x, y) - 0.5) * 4 * k + sweep;
    const c = 0.5 + 0.5 * Math.cos((x + warp) / period * Math.PI * 2), line = c * c * c * c * c;
    const streak = streakF(x, y);
    const check = checks[i];
    const silver = smooth(0.55, 0.82, silverF(x, y));
    const seam = (x % seamEvery) < seamWidth ? 1 : 0;
    let a = 0.86 + (streak - 0.5) * 0.18 - line * 0.12 + silver * 0.05 - knot * 0.22;
    a *= 1 - check * 0.45;
    if (seam) a *= 0.68;
    lum[i] = a;
    hgt[i] = seam ? 0.08 : clamp(0.5 + (1 - line) * 0.09 * (0.6 + silver) + (streak - 0.5) * 0.08 - check * 0.3 - knot * 0.06);
  }
  return { lum, hgt };
}
