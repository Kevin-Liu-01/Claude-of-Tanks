import { getMapConfig } from '../src/world/maps/index.ts';
import { buildTerrainMeshesAsync, createHeightField } from '../src/world/terrain.js';

const config = getMapConfig('verdant');
const heightField = createHeightField(1337, config);
const engineCtx = {
  anisotropy: 4,
  setupShadowMaterial() {},
};

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((m) => materials.add(m));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

async function sample(streamFarLods) {
  const startedAt = performance.now();
  const group = await buildTerrainMeshesAsync(
    heightField,
    engineCtx,
    config,
    null,
    false,
    streamFarLods ? { streamFarLods: true, focus: heightField._layout.spawns.player } : null,
  );
  const ms = performance.now() - startedAt;
  const stats = group.userData.streamingStats;
  const streamJobMs = [];
  if (streamFarLods) {
    const updateLOD = group.userData.updateLOD;
    let priorJobs = stats.streamedGeometryCount;
    // Drive a camera from deployment toward the enemy base. Four render
    // updates per position honor the production one-job-per-four-frames rate.
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      const camera = { x: 2 + 35 * t, z: -95 + 430 * t };
      for (let frame = 0; frame < 4; frame++) {
        const jobStartedAt = performance.now();
        updateLOD(camera);
        const jobMs = performance.now() - jobStartedAt;
        if (stats.streamedGeometryCount !== priorJobs) {
          streamJobMs.push(jobMs);
          priorJobs = stats.streamedGeometryCount;
        }
      }
    }
  }
  disposeGroup(group);
  return { ms, stats: { ...stats }, streamJobMs };
}

// Alternate order after one warm-up to limit JIT/GC bias.
await sample(false);
const runs = [];
for (const streamed of [true, false, false, true, true, false]) {
  runs.push({ streamed, ...(await sample(streamed)) });
  await new Promise((resolve) => setTimeout(resolve, 50));
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0];
};
const eagerMs = median(runs.filter((r) => !r.streamed).map((r) => r.ms));
const streamedMs = median(runs.filter((r) => r.streamed).map((r) => r.ms));
window.__TERRAIN_STREAM_BENCH = {
  eagerMs,
  streamedMs,
  savingsMs: eagerMs - streamedMs,
  savingsPct: (eagerMs - streamedMs) / eagerMs * 100,
  streamedStats: runs.find((r) => r.streamed).stats,
  streamJobs: {
    count: runs.filter((r) => r.streamed).flatMap((r) => r.streamJobMs).length,
    maxMs: Math.max(...runs.filter((r) => r.streamed).flatMap((r) => r.streamJobMs)),
  },
  runs: runs.map((r) => ({ streamed: r.streamed, ms: r.ms })),
};
