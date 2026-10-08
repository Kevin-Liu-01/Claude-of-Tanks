// src/world/lakeCandidateIndex.ts — which lake discs can reach a point (the map-revival lane, 2026-10-08, Skybridge round
// 6; the owner's top performance complaint is load time).
//
// Every per-point lake loop in the terrain (the height composition, the wet mask, the shore distance the material bakes,
// the vegetation's exclusion, the ground type) walked every disc, each discarding a far one by its bounding square
// (shoreline.ts shorelineDistance). A map whose water is a chain of many discs — Skybridge's drowned meander is 80-odd
// ellipses along its curve — paid that walk at every height sample and every baked texel. This grid answers the same
// question first: 16 m cells over the discs' outermost bands, each cell listing, in ascending order, the discs whose band
// can reach it. A loop over a cell's list skips exactly the discs that would have discarded themselves, in the same
// order, so every result is bit-identical. Maps with a handful of discs keep the plain loop (no index).

/** The slice of a disc the index reads. */
interface IndexedDisc {
  x: number;
  z: number;
  r: number;
}

/** The candidate grid (buildLakeCandidateIndex). */
export interface LakeCandidateIndex {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** Each cell's ascending disc indices. */
  cells: Int32Array[];
  /** The list for a point outside the grid: no disc reaches it. */
  empty: Int32Array;
}

/** Below this many discs the plain loop stays (it costs no more than the lookup). */
const MIN_DISCS = 9;
const CELL_M = 16;

/**
 * The index over `lakes`, each reaching out to its radius times the larger of `minBand` and its own band (`bands[i]`,
 * when given), or null for a map with fewer than MIN_DISCS discs.
 */
export function buildLakeCandidateIndex(lakes: readonly IndexedDisc[], bands: ArrayLike<number> | null,
  minBand = 1.32): LakeCandidateIndex | null {
  if (lakes.length < MIN_DISCS) return null;
  const reach = lakes.map((lake, i) => lake.r * Math.max(minBand, bands ? bands[i] ?? 0 : 0) + 0.5);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  lakes.forEach((lake, i) => {
    x0 = Math.min(x0, lake.x - reach[i]); x1 = Math.max(x1, lake.x + reach[i]);
    z0 = Math.min(z0, lake.z - reach[i]); z1 = Math.max(z1, lake.z + reach[i]);
  });
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL_M)), nz = Math.max(1, Math.ceil((z1 - z0) / CELL_M));
  const lists: number[][] = Array.from({ length: nx * nz }, () => []);
  lakes.forEach((lake, i) => {
    const a = Math.max(0, Math.floor((lake.x - reach[i] - x0) / CELL_M)), b = Math.min(nx - 1, Math.floor((lake.x + reach[i] - x0) / CELL_M));
    const c = Math.max(0, Math.floor((lake.z - reach[i] - z0) / CELL_M)), d = Math.min(nz - 1, Math.floor((lake.z + reach[i] - z0) / CELL_M));
    for (let j = c; j <= d; j++) for (let k = a; k <= b; k++) lists[j * nx + k].push(i);
  });
  return { x0, z0, cell: CELL_M, nx, nz, cells: lists.map((list) => Int32Array.from(list)), empty: new Int32Array(0) };
}

/** The ascending indices of the discs that can reach (x, z). */
export function lakeCandidatesAt(index: LakeCandidateIndex, x: number, z: number): Int32Array {
  const k = Math.floor((x - index.x0) / index.cell), j = Math.floor((z - index.z0) / index.cell);
  if (k < 0 || j < 0 || k >= index.nx || j >= index.nz) return index.empty;
  return index.cells[j * index.nx + k];
}
