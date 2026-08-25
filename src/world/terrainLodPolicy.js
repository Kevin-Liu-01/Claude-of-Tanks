// Pure terrain-LOD policy. Kept free of Three.js/DOM so the opening-region
// streaming contract can be verified in Node without constructing WebGL.

export const TERRAIN_LOD_DIST = Object.freeze([200, 430]);

export function terrainLodForDistance(distanceM, currentLevel = 2) {
  const t0 = TERRAIN_LOD_DIST[0] * (currentLevel === 0 ? 1.1 : 0.9);
  const t1 = TERRAIN_LOD_DIST[1] * (currentLevel <= 1 ? 1.1 : 0.9);
  return distanceM < t0 ? 0 : distanceM < t1 ? 1 : 2;
}

/**
 * Geometry required before the opening frame. Chunks inside the opening
 * near/mid region already pay for the shared 97x97 height/normal grid, so
 * derive all three index densities from that same grid while it is hot. The
 * extra coarse vertices are cheap; leaving them missing made the renderer
 * rebuild dozens of geometries during the rollout. Truly far chunks retain
 * only their visible coarse level and stream if the battle travels there.
 */
export function initialTerrainLods(distanceM) {
  return distanceM < TERRAIN_LOD_DIST[1] ? [0, 1, 2] : [2];
}

/**
 * Pick at most one missing geometry for this rendered frame. Missing visible
 * detail wins first; then a one-band lookahead quietly prepares the next finer
 * level before the camera reaches its normal switch threshold.
 *
 * @param {Array<{cx:number,cz:number,level:number,present:boolean[]}>} chunks
 * @param {?{index:number,level:number,distanceM:number,urgent:boolean}} [out]
 * @returns {null|{index:number,level:number,distanceM:number,urgent:boolean}}
 */
export function chooseTerrainLodBuild(chunks, camX, camZ, out = null) {
  let bestIndex = -1;
  let bestLevel = -1;
  let bestDistance = Infinity;
  let bestUrgent = false;
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const distanceM = Math.hypot(camX - chunk.cx, camZ - chunk.cz);
    const want = terrainLodForDistance(distanceM, chunk.level);
    const present = chunk.present || chunk.lods;
    if (!present[want]) {
      if (bestIndex < 0 || !bestUrgent || distanceM < bestDistance) {
        bestIndex = index;
        bestLevel = want;
        bestDistance = distanceM;
        bestUrgent = true;
      }
      continue;
    }
    if (bestUrgent) continue;

    // Prepare one finer band roughly one chunk before its visible threshold.
    let prefetch = -1;
    if (want === 2 && distanceM < TERRAIN_LOD_DIST[1] + 125) prefetch = 1;
    else if (want === 1 && distanceM < TERRAIN_LOD_DIST[0] + 125) prefetch = 0;
    if (prefetch >= 0 && !present[prefetch]) {
      if (bestIndex < 0 || distanceM < bestDistance) {
        bestIndex = index;
        bestLevel = prefetch;
        bestDistance = distanceM;
        bestUrgent = false;
      }
    }
  }
  if (bestIndex < 0) return null;
  const result = out || {};
  result.index = bestIndex;
  result.level = bestLevel;
  result.distanceM = bestDistance;
  result.urgent = bestUrgent;
  return result;
}
