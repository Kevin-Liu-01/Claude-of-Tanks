/** The load-bearing surface is the rendered near terrain, including its
 * Float32 vertices and triangle diagonal. Bilinear/analytic heights describe
 * a different surface and can leave a visible gap under an entire track. */
const SIZE = 1024, HALF = SIZE / 2, CHUNK = 128, SEGMENTS = 96;

/**
 * The steep-cell diagonal (the ground lane, 2026-10-15; the maps critics on Aegis' gorge and Redrock: "a sawtooth
 * crest"). A cell (a at its own corner, b = +x, c = +z, d = +x+z) is split along its b–c diagonal, as every cell always
 * was, unless it is a steep convex fold — one of its edges rises over TERRAIN_FLIP_STEEP_M (~29°), its a–d pair stands
 * above its b–c pair and the two splits part by over half a metre at its centre (a + d − b − c > TERRAIN_FLIP_FOLD_M):
 * a crest or a cliff's lip running along a–d, which b–c sawed down into teeth — and its true centre (the height field
 * there, Float32) lies nearer the a–d midpoint than the b–c one by over TERRAIN_FLIP_PREFER_M. Then the crest runs along
 * the triangles' shared edge, drawn and driven as the land holds it. Gullies, ditches and wall feet (concave folds) keep
 * b–c: lowering them into the true notch gave a track a felt jolt the contact census counts (orchard's terrace ditch),
 * so the split only ever raises a sawn crest. Planes, gentle ground and every tie keep b–c, so ordinary ground does not
 * move by a bit. The render mesh (terrain.ts buildChunkGeometrySteps, terrainNearMeshHeightAt), this contact surface, the
 * battle's ground overlay (sim/terrainDeformation.ts contactOffsetAt) and the debris ground (fx/latticeGround.ts) all
 * split by this one rule, on the same Float32 corner heights and the same centre (the cell's own corner coordinate +
 * half a step) where they share the lattice.
 */
export const TERRAIN_FLIP_STEEP_M = 0.75;
export const TERRAIN_FLIP_FOLD_M = 1.0;
export const TERRAIN_FLIP_PREFER_M = 0.1;
/** Whether a cell is a steep convex fold, the only cells whose split the centre decides (cheap: the corners alone). */
export function terrainCellFoldCandidate(a: number, b: number, c: number, d: number): boolean {
  return a + d - b - c > TERRAIN_FLIP_FOLD_M
    && Math.max(Math.abs(b - a), Math.abs(c - a), Math.abs(d - b), Math.abs(d - c)) > TERRAIN_FLIP_STEEP_M;
}
/** A steep convex fold's split: a–d when its centre's Float32 height lies nearer a–d's midpoint by the preference. */
export function terrainCellFlipped(a: number, b: number, c: number, d: number, centre: number): boolean {
  return terrainCellFoldCandidate(a, b, c, d)
    && Math.abs(centre - (a + d) * 0.5) + TERRAIN_FLIP_PREFER_M < Math.abs(centre - (b + c) * 0.5);
}
/** A cell's height at (u, v) in [0, 1]² on the split the rule picks (a, b = +x, c = +z, d = +x+z). */
export function terrainCellHeight(a: number, b: number, c: number, d: number, u: number, v: number, flipped: boolean): number {
  if (!flipped) return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  return u >= v ? a + (b - a) * u + (d - b) * v : a + (c - a) * v + (d - c) * u;
}
const CELLS = SIZE / CHUNK * SEGMENTS, N = CELLS + 1;
const STEP = CHUNK / SEGMENTS;

/** A point on the rendered near terrain: its height, and (normalAt) the face normal of the triangle it lies on. */
export interface TerrainContactSampler {
  (x: number, z: number): number;
  /**
   * The unit normal of the triangle the height comes from (the same cell, the same diagonal, the same Float32
   * vertices) into `out`; straight up off the square. The time-to-battle lane (2026-10-08; the coordinator's ruling:
   * grass follows the ground the player sees): the grass and tall grass slope tests read it instead of the analytic
   * normal's four heights.
   */
  normalAt<T extends { x: number; y: number; z: number }>(x: number, z: number, out: T): T;
  /**
   * The perf stream (2026-10-13; the owner: "going into games takes a long time"): a near chunk's fine grid
   * (terrain.ts buildFineGridSteps: `x0 + (gx - 1) * step` across, the same down, `source(x, z)` at each point) hands its
   * heights to the lazy vertices it shares exactly — the same coordinate doubles, the same height function — so the
   * contact queries of the build (grass seating, decals, placement) and of play stop recomputing them (~0.13–0.35 s of
   * a battle entry). A grid of another height function, or a point that is not exactly a vertex, seeds nothing.
   * Returns the vertices seeded.
   */
  seedGrid(x0: number, z0: number, step: number, pn: number, grid: ArrayLike<number>,
    source: (x: number, z: number) => number): number;
  /** (2026-10-15) Whether the cell under (x, z) takes the a–d diagonal (terrainCellFlipped); false off the square. */
  cellFlippedAt(x: number, z: number): boolean;
}

export function createTerrainContactSampler(
  heightAt: (x: number, z: number) => number,
): TerrainContactSampler {
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
  // (2026-10-15) a steep fold's split, decided once per cell on its centre's height (terrainCellFlipped; rare cells)
  const foldSplit = new Map<number, boolean>();
  function flippedCell(ix: number, iz: number, a: number, b: number, c: number, d: number): boolean {
    if (!terrainCellFoldCandidate(a, b, c, d)) return false;
    const key = iz * N + ix;
    let flipped = foldSplit.get(key);
    if (flipped === undefined) {
      const centre = Math.fround(heightAt(exactCoordinates[ix] + STEP * 0.5, exactCoordinates[iz] + STEP * 0.5));
      flipped = terrainCellFlipped(a, b, c, d, centre);
      foldSplit.set(key, flipped);
    }
    return flipped;
  }
  const sample = ((x: number, z: number): number => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return heightAt(x, z);
    const ix = cell(x), iz = cell(z);
    const u = (x - coordinates[ix]) / (coordinates[ix + 1] - coordinates[ix]);
    const v = (z - coordinates[iz]) / (coordinates[iz + 1] - coordinates[iz]);
    const a = vertex(ix, iz), b = vertex(ix + 1, iz), c = vertex(ix, iz + 1), d = vertex(ix + 1, iz + 1);
    return terrainCellHeight(a, b, c, d, u, v, flippedCell(ix, iz, a, b, c, d));
  }) as TerrainContactSampler;
  sample.cellFlippedAt = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
    const ix = cell(x), iz = cell(z);
    return flippedCell(ix, iz, vertex(ix, iz), vertex(ix + 1, iz), vertex(ix, iz + 1), vertex(ix + 1, iz + 1));
  };
  /** The vertex index whose exact coordinate is `value`, or -1. */
  const exactIndex = (value: number): number => {
    const i = Math.round((value + HALF) / STEP);
    return i >= 0 && i < N && exactCoordinates[i] === value ? i : -1;
  };
  sample.seedGrid = (x0, z0, step, pn, grid, source) => {
    if (source !== heightAt || !(pn > 0) || grid.length < pn * pn) return 0;
    let seeded = 0;
    for (let gz = 0; gz < pn; gz++) {
      const iz = exactIndex(z0 + (gz - 1) * step);
      if (iz < 0) continue;
      for (let gx = 0; gx < pn; gx++) {
        const ix = exactIndex(x0 + (gx - 1) * step);
        if (ix < 0) continue;
        const i = iz * N + ix, byte = i >>> 3, bit = 1 << (i & 7);
        if (ready[byte] & bit) continue;
        heights[i] = grid[gz * pn + gx];
        ready[byte] |= bit;
        seeded++;
      }
    }
    return seeded;
  };
  sample.normalAt = (x, z, out) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < -HALF || x > HALF || z < -HALF || z > HALF) {
      out.x = 0; out.y = 1; out.z = 0;
      return out;
    }
    const ix = cell(x), iz = cell(z);
    const dx = coordinates[ix + 1] - coordinates[ix], dz = coordinates[iz + 1] - coordinates[iz];
    const u = (x - coordinates[ix]) / dx, v = (z - coordinates[iz]) / dz;
    const a = vertex(ix, iz), b = vertex(ix + 1, iz), c = vertex(ix, iz + 1), d = vertex(ix + 1, iz + 1);
    let sx: number, sz: number;
    if (!flippedCell(ix, iz, a, b, c, d)) {
      if (u + v <= 1) { sx = (b - a) / dx; sz = (c - a) / dz; }
      else { sx = (d - c) / dx; sz = (d - b) / dz; }
    } else if (u >= v) { sx = (b - a) / dx; sz = (d - b) / dz; }
    else { sx = (d - c) / dx; sz = (c - a) / dz; }
    const inverse = 1 / Math.hypot(sx, 1, sz);
    out.x = -sx * inverse; out.y = inverse; out.z = -sz * inverse;
    return out;
  };
  return sample;
}
