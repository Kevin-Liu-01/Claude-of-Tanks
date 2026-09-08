// Construction-only earthy banks. Reuse the completed road raster as scratch;
// alpha already owns worn soil, while RGB remains road/ruts/canonical water.
const FULL_M = 3;
const FADE_M = 10;

function validate(
  pixels: Uint8ClampedArray,
  distance: Float32Array,
  size: number,
  mapSize: number,
  waterStart: number,
): void {
  if (!Number.isInteger(size) || size < 1 || pixels.length !== size * size * 4
    || distance.length !== size * size || pixels.buffer === distance.buffer) {
    throw new Error('Shore dirt requires separate, equally sized mask and scratch buffers');
  }
  if (!Number.isFinite(mapSize) || mapSize <= 0
    || !Number.isFinite(waterStart) || waterStart <= 0 || waterStart > 1) {
    throw new Error('Shore dirt requires finite metres and a positive normalized water onset');
  }
}

function relaxRow(
  distance: Float32Array,
  size: number,
  row: number,
  direction: number,
  step: number,
): void {
  const previousRow = row - direction;
  const across = step * Math.SQRT2;
  const start = direction > 0 ? 0 : size - 1;
  for (let x = start; x >= 0 && x < size; x += direction) {
    const at = row * size + x;
    const previousX = x - direction;
    let d = distance[at];
    if (previousX >= 0 && previousX < size) d = Math.min(d, distance[at - direction] + step);
    if (previousRow >= 0 && previousRow < size) {
      const above = previousRow * size + x;
      d = Math.min(d, distance[above] + step);
      if (x > 0) d = Math.min(d, distance[above - 1] + across);
      if (x + 1 < size) d = Math.min(d, distance[above + 1] + across);
    }
    distance[at] = d;
  }
}

function paintSoil(pixels: Uint8ClampedArray, distance: Float32Array): void {
  for (let i = 0; i < distance.length; i++) {
    const at = i * 4;
    // Existing road/yard paving keeps its complete original RGBA response.
    if (pixels[at] !== 0) continue;
    const t = Math.max(0, Math.min(1, (distance[i] - FULL_M) / (FADE_M - FULL_M)));
    const coverage = 1 - t * t * (3 - 2 * t);
    pixels[at + 3] = Math.max(pixels[at + 3], coverage * 255);
  }
}

/**
 * Grow a 3m full / 10m fading soil fringe from the EXISTING protected B mask.
 * Eight-neighbour chamfer distances overestimate Euclidean distance by at most
 * 8.24%, before the existing 2–4m mask sampling/filter footprint. No wrap, new
 * noise, retained arrays, queries, shader parameters or texture identities.
 * Call only after road painting: `distance` is intentionally overwritten.
 */
export function stampShoreDirtMask(
  pixels: Uint8ClampedArray,
  distance: Float32Array,
  size: number,
  mapSize: number,
  waterStart: number,
): void {
  validate(pixels, distance, size, mapSize, waterStart);
  const threshold = Math.ceil(waterStart * 255);
  let hasWater = false;
  for (let i = 0; i < distance.length; i++) {
    const wet = pixels[i * 4 + 2] >= threshold;
    distance[i] = wet ? 0 : Infinity;
    hasWater ||= wet;
  }
  if (!hasWater) return;
  const step = mapSize / size;
  for (let row = 0; row < size; row++) relaxRow(distance, size, row, 1, step);
  for (let row = size - 1; row >= 0; row--) relaxRow(distance, size, row, -1, step);
  paintSoil(pixels, distance);
}
