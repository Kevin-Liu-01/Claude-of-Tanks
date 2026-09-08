import { LIQUID_MARSH_STRIDE } from './liquidMarshSurface.ts';
import { shorelineWetness, type ShorelineDisc } from './shoreline.ts';

export const LIQUID_INDEX_CELLS = 16;

export function liquidMarshIndexBucket(x: number, z: number, mapSize: number, words: number): number {
  const scale = LIQUID_INDEX_CELLS / mapSize, half = mapSize * 0.5;
  const cx = Math.max(0, Math.min(LIQUID_INDEX_CELLS - 1, ((x + half) * scale) | 0));
  const cz = Math.max(0, Math.min(LIQUID_INDEX_CELLS - 1, ((z + half) * scale) | 0));
  return (cz * LIQUID_INDEX_CELLS + cx) * words;
}

/** Reuse height's broad phase for the existing wet-mask bake/wake queries. */
export function sampleIndexedMarshWetness(
  marshes: readonly ShorelineDisc[],
  index: Uint32Array,
  bucket: number,
  words: number,
  x: number,
  z: number,
): number {
  let wetness = 0;
  for (let word = 0; word < words; word++) {
    let bits = index[bucket + word];
    while (bits) {
      const bit = bits & -bits;
      const at = word * 32 + 31 - Math.clz32(bit);
      bits ^= bit;
      wetness = Math.max(wetness, shorelineWetness(marshes[at], x, z, false));
      if (wetness === 1) return 1;
    }
  }
  return wetness;
}

/** Small construction-only broad phase; exact contours still decide height. */
export function buildLiquidMarshIndex(
  marshes: readonly ShorelineDisc[],
  surfaces: Float64Array,
  mapSize: number,
): Uint32Array | null {
  if (marshes.length <= 8) return null;
  const words = Math.ceil(marshes.length / 32);
  const result = new Uint32Array(LIQUID_INDEX_CELLS * LIQUID_INDEX_CELLS * words);
  const half = mapSize * 0.5, scale = LIQUID_INDEX_CELLS / mapSize;
  const cell = (coordinate: number): number => Math.max(0,
    Math.min(LIQUID_INDEX_CELLS - 1, Math.floor((coordinate + half) * scale)));
  for (let i = 0; i < marshes.length; i++) {
    const marsh = marshes[i];
    const radius = marsh.r * surfaces[i * LIQUID_MARSH_STRIDE + 3];
    const x0 = cell(marsh.x - radius), x1 = cell(marsh.x + radius);
    const z0 = cell(marsh.z - radius), z1 = cell(marsh.z + radius);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      result[(z * LIQUID_INDEX_CELLS + x) * words + (i >>> 5)] |= 1 << (i & 31);
    }
  }
  return result;
}
