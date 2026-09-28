/** The load-bearing surface is the rendered near terrain, including its
 * Float32 vertices and triangle diagonal. Bilinear/analytic heights describe
 * a different surface and can leave a visible gap under an entire track. */
const SIZE = 1024, HALF = SIZE / 2, CHUNK = 128, SEGMENTS = 96;
const CELLS = SIZE / CHUNK * SEGMENTS, N = CELLS + 1;
const STEP = CHUNK / SEGMENTS;

export function createTerrainContactSampler(
  heightAt: (x: number, z: number) => number,
): (x: number, z: number) => number {
  // Lazy vertices: bounded to 2.3 MiB per resident battlefield, no allocation
  // in the live query. Rendering and headless authority use the same grid.
  const heights = new Float32Array(N * N);
  const ready = new Uint8Array(Math.ceil(N * N / 8));
  const coordinates = new Float32Array(N);
  const exactCoordinates = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    // Match buildChunkGeometrySteps' operation order at chunk boundaries.
    const chunk = Math.min(Math.floor(i / SEGMENTS), SIZE / CHUNK - 1);
    exactCoordinates[i] = -HALF + chunk * CHUNK + (i - chunk * SEGMENTS) * STEP;
    coordinates[i] = exactCoordinates[i];
  }
  function vertex(x: number, z: number): number {
    const i = z * N + x, byte = i >>> 3, bit = 1 << (i & 7);
    if (!(ready[byte] & bit)) {
      heights[i] = heightAt(exactCoordinates[x], exactCoordinates[z]);
      ready[byte] |= bit;
    }
    return heights[i];
  }
  function cell(value: number): number {
    let i = Math.max(0, Math.min(CELLS - 1, Math.floor((value + HALF) / STEP)));
    // Float32 X/Z can round the nominal cell boundary in either direction.
    if (i > 0 && value < coordinates[i]) i--;
    else if (i < CELLS - 1 && value > coordinates[i + 1]) i++;
    return i;
  }
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return heightAt(x, z);
    const ix = cell(x), iz = cell(z);
    const u = (x - coordinates[ix]) / (coordinates[ix + 1] - coordinates[ix]);
    const v = (z - coordinates[iz]) / (coordinates[iz + 1] - coordinates[iz]);
    const b = vertex(ix + 1, iz), c = vertex(ix, iz + 1);
    if (u + v <= 1) {
      const a = vertex(ix, iz);
      return a + (b - a) * u + (c - a) * v;
    }
    const d = vertex(ix + 1, iz + 1);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
}
