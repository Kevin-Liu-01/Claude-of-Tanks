// src/world/hinterland/pyramid.ts — the Hinterland's height pyramid and its CPU sampler (HL-1/HL-3, the horizons
// stream, 2026-10-13; B-architecture §4.1).
//
// The field (field.ts) is exact but costs microseconds a point (the battlefield's own outland alone is ~5 µs), so the
// worker evaluates it once onto nested square grids centred on the map — fine near the edge, coarse to the limb — and
// everything after reads the grids: the mesh's vertex shader (as textures), the envelope's 80 km ray march, the plan
// view, the planner's seating. Each level holds only what the finer one does not (its interior keeps a margin band
// for the geomorph between levels and is filled from the finer level), so the levels together cost about as many
// samples as one. The battlefield's outland is asked exactly within 260 m of the edge (roads leaving the square, the
// rim, the residual's 180 m) and from a 24 m cache past it (its hills are smooth at that scale).
import type { HinterlandField, HinterlandGround } from './field.ts';

export interface HinterlandLevelSpec { texelM: number; halfM: number }

/** Desktop: 4 m to 1.15 km (0.64 km past the edge), 16 m to 4 km, 96 m to 16 km, 512 m to 82 km (the limb). */
export const HINTERLAND_LEVELS_DESKTOP: readonly HinterlandLevelSpec[] = Object.freeze([
  { texelM: 4, halfM: 1152 }, { texelM: 16, halfM: 4096 }, { texelM: 96, halfM: 16320 }, { texelM: 512, halfM: 81920 },
].map((l) => Object.freeze(l)));
/** Phones (§4.8): half the resolution, 48 km. */
export const HINTERLAND_LEVELS_MOBILE: readonly HinterlandLevelSpec[] = Object.freeze([
  { texelM: 8, halfM: 1152 }, { texelM: 32, halfM: 4096 }, { texelM: 192, halfM: 16320 }, { texelM: 768, halfM: 49152 },
].map((l) => Object.freeze(l)));

export interface HinterlandLevel {
  texelM: number;
  halfM: number;
  /** Samples per side (vertex-centred: sample i stands at -halfM + i * texelM). */
  n: number;
  heights: Float32Array;
}

export interface HinterlandPyramid {
  levels: HinterlandLevel[];
  /** Samples the field was asked for (the rest came from finer levels or the square's hole). */
  evaluated: number;
  ms: number;
}

/** The battlefield's square (no hinterland inside it): heights there are the ground's own, for continuity only. */
const SQUARE_M = 512;

/**
 * The battlefield's ground with its outland cached past `exactWithinM` of the edge on a `gridM` lattice (filled lazily,
 * so only what a bake reads is computed). Everything else passes through.
 */
export function createCachedGround(ground: HinterlandGround, { gridM = 24, halfM = 2600, exactWithinM = 260 } = {}): HinterlandGround {
  if (!ground.getOutlandHeightAt) return ground;
  const outland = ground.getOutlandHeightAt.bind(ground);
  const n = Math.ceil((2 * halfM) / gridM) + 1;
  const cache = new Float32Array(n * n).fill(Number.NaN);
  const at = (i: number, j: number): number => {
    const k = j * n + i;
    let v = cache[k];
    if (v !== v) { v = outland(-halfM + i * gridM, -halfM + j * gridM); cache[k] = v; }
    return v;
  };
  return {
    getHeightAt: ground.getHeightAt.bind(ground),
    getBorderWoodsAt: ground.getBorderWoodsAt?.bind(ground),
    getBorderHedgeAt: ground.getBorderHedgeAt?.bind(ground),
    getOutlandHeightAt(x: number, z: number): number {
      const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - SQUARE_M;
      if (edgeOut < exactWithinM || Math.abs(x) >= halfM - gridM || Math.abs(z) >= halfM - gridM) return outland(x, z);
      const fx = (x + halfM) / gridM, fz = (z + halfM) / gridM, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    },
  };
}

/**
 * Bake the field onto the levels. `heightAt` defaults to the field's own; `yieldEvery` lets a caller (a generator in the
 * worker) breathe. Each level evaluates the texels outside the finer level's interior (a margin of `marginTexels` of
 * its own inside the finer level's edge) and outside the square; the rest is filled from the finer level.
 */
export function bakeHinterlandPyramid(
  field: Pick<HinterlandField, 'heightAt'>, levels: readonly HinterlandLevelSpec[] = HINTERLAND_LEVELS_DESKTOP,
  { marginTexels = 3, ground = null as HinterlandGround | null } = {},
): HinterlandPyramid {
  const started = performance.now();
  const out: HinterlandLevel[] = [];
  let evaluated = 0;
  for (let li = 0; li < levels.length; li++) {
    const { texelM, halfM } = levels[li];
    const n = Math.round((2 * halfM) / texelM) + 1;
    const heights = new Float32Array(n * n);
    const finer = out[li - 1] ?? null;
    const inner = finer ? finer.halfM - marginTexels * texelM : -1;
    for (let j = 0; j < n; j++) {
      const z = -halfM + j * texelM;
      for (let i = 0; i < n; i++) {
        const x = -halfM + i * texelM;
        const k = j * n + i;
        if (finer && Math.abs(x) < inner && Math.abs(z) < inner) { heights[k] = sampleLevel(finer, x, z); continue; }
        if (Math.abs(x) < SQUARE_M - 2 * texelM && Math.abs(z) < SQUARE_M - 2 * texelM) {
          // (the square's interior is the battlefield's: kept for the bilinear across the edge, not drawn)
          heights[k] = ground ? ground.getHeightAt(x, z) : 0;
          continue;
        }
        heights[k] = field.heightAt(x, z, texelM);
        evaluated++;
      }
    }
    out.push({ texelM, halfM, n, heights });
  }
  return { levels: out, evaluated, ms: performance.now() - started };
}

/** Bilinear height from one level (clamped to its extent). */
export function sampleLevel(level: HinterlandLevel, x: number, z: number): number {
  const { n, texelM, halfM, heights } = level;
  const fx = Math.max(0, Math.min(n - 1.0001, (x + halfM) / texelM)), fz = Math.max(0, Math.min(n - 1.0001, (z + halfM) / texelM));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * n + i;
  return (heights[k] * (1 - tx) + heights[k + 1] * tx) * (1 - tz) + (heights[k + n] * (1 - tx) + heights[k + n + 1] * tx) * tz;
}

/** The finest level that holds (x, z) with a texel to spare, or the coarsest. */
export function levelFor(pyramid: HinterlandPyramid, x: number, z: number): HinterlandLevel {
  const ax = Math.abs(x), az = Math.abs(z);
  for (const level of pyramid.levels) if (ax < level.halfM - level.texelM && az < level.halfM - level.texelM) return level;
  return pyramid.levels[pyramid.levels.length - 1];
}

/** The pyramid's height at (x, z): the finest level that holds it, bilinear. */
export function samplePyramid(pyramid: HinterlandPyramid, x: number, z: number): number {
  return sampleLevel(levelFor(pyramid, x, z), x, z);
}
