// src/world/hinterland/lod.ts — the Hinterland's continuous distance-dependent LOD selection (HL-3, the horizons
// stream, 2026-10-13; B-architecture §4.2). Pure, allocation-free per frame.
//
// A quadtree rooted on the map's centre covers the land to the limb; the battlefield square is its hole. Each frame the
// tree is walked from the root: a node splits while the camera stands within K times its size (K grows with the zoom, so
// the scope refines only the nodes inside its narrow cone — the frustum's side planes cull the rest), a node wholly
// inside the square or outside the view is dropped, and every kept node is one instanced grid patch (PATCH_QUADS ×
// PATCH_QUADS quads) whose vertices morph to the next coarser grid as their distance approaches the range at which the
// coarser neighbour begins (1.5 K S to 2 K S): adjacent nodes differ by at most one level along any edge the morph
// meets, so there are no cracks and no pops. The output is a Float32Array of [x0, z0, size, kFactor] per node.

/** Quads per patch side (a 16 × 16 grid: 512 triangles a node). */
export const HINTERLAND_PATCH_QUADS = 16;

export interface HinterlandLodOptions {
  /** The root's half-extent (m): the coarsest level's. */
  rootHalfM: number;
  /** The smallest node (m): its vertex spacing is minSizeM / PATCH_QUADS (the finest level's texel). */
  minSizeM: number;
  /** The battlefield square's half-extent (m): a node wholly inside it is never drawn. */
  holeHalfM: number;
  /** Split distance in node sizes at the base field of view (higher: finer). */
  k: number;
  /** The most nodes a frame may draw. */
  maxNodes: number;
}

export const HINTERLAND_LOD_DESKTOP: Readonly<HinterlandLodOptions> = Object.freeze({
  rootHalfM: 81_920, minSizeM: 64, holeHalfM: 512, k: 2.4, maxNodes: 1400,
});
export const HINTERLAND_LOD_MOBILE: Readonly<HinterlandLodOptions> = Object.freeze({
  rootHalfM: 49_152, minSizeM: 128, holeHalfM: 512, k: 1.6, maxNodes: 600,
});

/** A side-plane frustum test for an axis-aligned box (true: some of it may be in view). */
export type HinterlandBoxVisible = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => boolean;

/**
 * Select the nodes for a camera. `fovDeg` is the camera's vertical field of view (the scope narrows it); `heightRange`
 * gives a node's ground span for the culling box (conservative is fine). Writes [x0, z0, size, k] per node into `out`
 * and returns the count.
 */
export function selectHinterlandNodes(
  camX: number, camY: number, camZ: number, fovDeg: number, visible: HinterlandBoxVisible | null,
  heightRange: (x0: number, z0: number, size: number, out: [number, number]) => [number, number],
  opts: HinterlandLodOptions, out: Float32Array,
): number {
  const zoom = Math.max(1, Math.min(10, 60 / Math.max(2, fovDeg)));
  // (the scope sharpens the split distance a little under its zoom: ×8 refines its cone about 3.9 times, the triangle
  // budget holding — the side planes have already culled everything outside the cone)
  const k = opts.k * Math.pow(zoom, 0.65);
  let count = 0;
  const range: [number, number] = [0, 0];
  const cap = Math.min(opts.maxNodes, Math.floor(out.length / 4));
  // an explicit stack (no recursion, no allocation): x0, z0, size per entry
  const stack = STACK;
  let sp = 0;
  const root = opts.rootHalfM * 2;
  stack[sp++] = -opts.rootHalfM; stack[sp++] = -opts.rootHalfM; stack[sp++] = root;
  while (sp > 0 && count < cap) {
    const size = stack[--sp], z0 = stack[--sp], x0 = stack[--sp];
    const x1 = x0 + size, z1 = z0 + size;
    // the square's hole
    const h = opts.holeHalfM;
    if (x0 >= -h && x1 <= h && z0 >= -h && z1 <= h) continue;
    heightRange(x0, z0, size, range);
    if (visible && !visible(x0, range[0], z0, x1, range[1], z1)) continue;
    // the camera's distance to the node's box
    const dx = Math.max(x0 - camX, 0, camX - x1), dz = Math.max(z0 - camZ, 0, camZ - z1);
    const dy = Math.max(range[0] - camY, 0, camY - range[1]);
    const d = Math.hypot(dx, dy, dz);
    // (a split never leaves a hole: when the budget could not hold the four children and everything still queued, the
    // node is drawn whole)
    if (size > opts.minSizeM && d < k * size && sp + 12 <= stack.length && count + sp / 3 + 4 <= cap) {
      const half = size / 2;
      stack[sp++] = x0; stack[sp++] = z0; stack[sp++] = half;
      stack[sp++] = x0 + half; stack[sp++] = z0; stack[sp++] = half;
      stack[sp++] = x0; stack[sp++] = z0 + half; stack[sp++] = half;
      stack[sp++] = x0 + half; stack[sp++] = z0 + half; stack[sp++] = half;
      continue;
    }
    out[count * 4] = x0; out[count * 4 + 1] = z0; out[count * 4 + 2] = size; out[count * 4 + 3] = k;
    count++;
  }
  return count;
}
const STACK = new Float64Array(3 * 4 * 64);

/** The morph factor of a vertex at distance d in a node of size S (0: its own grid, 1: the coarser one's). */
export function hinterlandMorph(d: number, size: number, k: number): number {
  const start = 1.5 * k * size, end = 2 * k * size;
  return Math.max(0, Math.min(1, (d - start) / (end - start)));
}
