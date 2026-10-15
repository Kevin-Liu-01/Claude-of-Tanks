// src/world/swardPatch.ts — the sward's own patches (grass r2, 2026-10-15). The blind critics on main: "one species and
// one colour (Amberford is all mustard), no tussocks, seed heads, flowers or height variety". A sward wanders in colour
// patch by patch — fresh regrowth greener in one, last season's straw standing in another, a russet stand of sorrel or
// dock in seed — and in light, at 5–11 m: read as patches from tens of metres, where a clump's own jitter averages away.
// The tall-grass tier (tallGrass.ts) and the tufts (vegetation.ts) read the same field, so a patch is one stand in both.
// Pure and position-hashed (no stream, no map knowledge): the noise the tall-grass tier has drawn its tussocks from
// since 2026-10-03, moved here unchanged.

/** The lattice hash (tallGrass.ts's cell seeds and every sward noise). */
export function swardCellSeed(seed: number, ix: number, iz: number): number {
  let h = (seed ^ 0x7F4A7C15) >>> 0;
  h = Math.imul(h ^ (ix * 0x85EBCA6B), 0xC2B2AE35) >>> 0;
  h = Math.imul(h ^ (iz * 0x27D4EB2F), 0x165667B1) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Ground lane (2026-10-03): a smooth value noise on a `cell`-metre lattice (0..1) — the sward's tussocks (1.7 m) and
 * its tall and grazed patches (9 m). Position-hashed: it draws nothing from a cell's seeded stream.
 */
export function swardNoise(x: number, z: number, cell: number, salt: number): number {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number): number => (swardCellSeed(salt, a, b) & 0xffff) / 65535;
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * grass r2 (2026-10-15; the grassvis census, deploy 205 against main at the same poses: the sward's luminance spread
 * halved on every map — 35-42 to 18-21 — the tone curve's lost local contrast (the SKY lane's audit: AgX keeps ~65 %) and
 * the sward's own): the sward's depth, 0 = main's flat sward, 1 = its roots, its card blades' feet and the gaps between
 * them darker and its tips brighter. One uniform both tiers' materials share (the tufts' card contrast, the blades' root
 * and tip); the QA hook window.__SWARD_TONE flips it live.
 */
export const SWARD_TONE: { value: number } = { value: 1 };
if (typeof window !== 'undefined') (window as unknown as { __SWARD_TONE?: { value: number } }).__SWARD_TONE = SWARD_TONE;

/** A patch's multipliers on a sward tint (r, g, b), its cured share (0..1: last season's straw) and its light. */
export interface SwardPatch { r: number; g: number; b: number; cured: number; value: number }

/** The kinds whose sward carries russet stands (a reed bed, a dune's marram and the tundra's sedge do not). */
export type SwardPatchKind = 'meadow' | 'steppe' | 'savanna' | 'reed' | 'tundra' | 'verge' | 'dune';

/**
 * The sward's patch at (x, z): fresh regrowth (an 11 m hue field's top quarter: greener, less red and blue), last
 * season's straw (its bottom quarter: `cured`, the caller's own dry colour), a russet stand (a 5.2 m field's top tenth on
 * a meadow, a savanna or a steppe) and the light (a 7.5 m value field, ±14 %).
 */
export function swardPatchAt(x: number, z: number, kind: SwardPatchKind, out: SwardPatch): SwardPatch {
  const hueN = swardNoise(x, z, 11, 0x7ee5), valN = swardNoise(x, z, 7.5, 0x3a7c);
  const fresh = smooth(0.60, 0.86, hueN);
  const rus = kind === 'meadow' || kind === 'savanna' || kind === 'steppe' ? 0.8 * smooth(0.74, 0.92, swardNoise(x, z, 5.2, 0x91f3)) : 0;
  out.r = (1 - 0.12 * fresh) * (1 + 0.22 * rus);
  out.g = (1 + 0.07 * fresh) * (1 - 0.14 * rus);
  out.b = (1 - 0.14 * fresh) * (1 - 0.30 * rus);
  out.cured = smooth(0.62, 0.88, 1 - hueN);
  out.value = 0.86 + 0.28 * valN;
  return out;
}
