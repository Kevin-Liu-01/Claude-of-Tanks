/**
 * Tree grounding decals are contact cues, never canopy-shadow substitutes.
 * Keeping them root-sized prevents dense groves from accumulating overlapping
 * transparent shadow sheets underneath the real CSM and GTAO layers.
 */
export const TREE_ROOT_DECAL_MAX_RADIUS_M = 2.4;

export function treeRootDecalRadius(rootRadiusM) {
  if (!Number.isFinite(rootRadiusM) || rootRadiusM <= 0) return 0;
  return Math.min(rootRadiusM, TREE_ROOT_DECAL_MAX_RADIUS_M);
}

export function treeRootDecalAreaM2(rootRadiusM) {
  const radius = treeRootDecalRadius(rootRadiusM);
  return Math.PI * radius * radius;
}
