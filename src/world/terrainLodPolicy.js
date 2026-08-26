// Pure terrain-LOD policy. Kept free of Three.js/DOM so the opening-region
// streaming contract can be verified in Node without constructing WebGL.

export const TERRAIN_LOD_DIST = Object.freeze([200, 430]);

export function terrainLodForDistance(distanceM, currentLevel = 2) {
  const t0 = TERRAIN_LOD_DIST[0] * (currentLevel === 0 ? 1.1 : 0.9);
  const t1 = TERRAIN_LOD_DIST[1] * (currentLevel <= 1 ? 1.1 : 0.9);
  return distanceM < t0 ? 0 : distanceM < t1 ? 1 : 2;
}

/**
 * Geometry required before the opening frame. Build the exact visible level
 * first and retain a coarse fallback for outward camera travel. The former
 * `[0, 1, 2]` policy constructed two invisible buffers for every near/mid
 * chunk and briefly put mid-distance chunks on level 0 before the first live
 * update corrected them. Missing levels use the bounded look-ahead seam below.
 */
export function initialTerrainLods(distanceM) {
  if (distanceM < TERRAIN_LOD_DIST[0]) return [0, 2];
  if (distanceM < TERRAIN_LOD_DIST[1]) return [1, 2];
  return [2];
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

/**
 * Drain a bounded number of terrain streaming jobs for one camera position.
 * The callback owns the actual geometry build and must make the completed
 * level visible through `chunk.present`/`chunk.lods` before it returns. This
 * keeps the scheduling policy Node-testable while letting the live terrain
 * implementation reuse its fine-grid cache.
 *
 * @param {Array<object>} chunks
 * @param {number} camX
 * @param {number} camZ
 * @param {number} maxJobs
 * @param {function(object):void} build
 * @returns {number} number of completed jobs
 */
export function warmTerrainLodBuilds(chunks, camX, camZ, maxJobs, build) {
  const limit = Math.max(0, Math.floor(Number(maxJobs) || 0));
  if (!limit || typeof build !== 'function') return 0;
  const job = { index: -1, level: -1, distanceM: 0, urgent: false };
  let completed = 0;
  while (completed < limit) {
    const next = chooseTerrainLodBuild(chunks, camX, camZ, job);
    if (!next) break;
    build(next);
    completed++;
  }
  return completed;
}
