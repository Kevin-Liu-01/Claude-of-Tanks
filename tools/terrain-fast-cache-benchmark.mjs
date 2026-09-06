// Node-only comparison of the fixed old tile cache and actual current runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';

const terrainSource = readFileSync(new URL('../src/world/terrain.ts', import.meta.url), 'utf8');
// Immutable pre-change cache from ff68c3d6c; never regenerate from the live source.
const baselineCache = readFileSync(new URL('./fixtures/terrain-fast-cache-baseline.txt', import.meta.url), 'utf8');
const mapSource = readFileSync(new URL('../src/world/map.ts', import.meta.url), 'utf8');
const SIZE = 1024;
const HALF = 512;
const TILE = 16;

function between(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'production source extraction boundary changed');
  return source.slice(first, last);
}

function replaceOnce(source, search, replacement) {
  assert.equal(source.split(search).length, 2, 'production cache instrumentation anchor changed');
  return source.replace(search, replacement);
}

function cacheSource(mode) {
  let source = mode === 'tile' ? baselineCache
    : between(terrainSource, '  const FGN = MAP_SIZE + 1;', '  const _scratchN =');
  source = replaceOnce(source, 'fBaked[tz * FTN + tx] = 1;',
    'fBaked[tz * FTN + tx] = 1; stats.completedTiles++;');
  assert.ok(mode === 'tile' || mode === 'vertex');
  return source;
}

const factories = new Map();
export function createCacheExperiment(mode, analyticHeight) {
  if (!factories.has(mode)) {
    const source = stripTypeScriptTypes(cacheSource(mode));
    factories.set(mode, new Function('heightAt', 'stats', `
      const MAP_SIZE = 1024, HALF = 512;
      const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
      ${source}
      return { getHeightAtFast, warmFastTilesAround,
        bytes: { heights: fGrid.byteLength, completedTiles: fBaked.byteLength,
          vertices: typeof vertexReady === 'undefined' ? 0 : vertexReady.byteLength } };
    `));
  }
  const stats = { analyticCalls: 0, completedTiles: 0, queries: 0, missQueries: 0 };
  const cache = factories.get(mode)((x, z) => {
    stats.analyticCalls++;
    return analyticHeight(x, z);
  }, stats);
  return { ...cache, stats,
    getHeightAtFast(x, z) {
      const previous = stats.analyticCalls;
      const result = cache.getHeightAtFast(x, z);
      stats.queries++;
      if (stats.analyticCalls !== previous) stats.missQueries++;
      return result;
    } };
}

let rayFactory;
export function createTerrainRayExperiment(THREE, heightField, sample) {
  // Execute the live adaptive march/refinement, excluding prop and tank tests.
  const source = between(mapSource, '  function terrainHitDistance(', '  function raycast(');
  rayFactory ??= new Function('THREE', 'heightField', 'hAtF', `
      const _pt = new THREE.Vector3(), _bisA = new THREE.Vector3();
      ${stripTypeScriptTypes(source)}
      return terrainHitDistance;
    `);
  return rayFactory(THREE, heightField, sample);
}

export function createWinterCorridor(THREE, field) {
  // Same fixed path as the terrain streaming benchmark; not a production replay.
  const rays = [];
  for (let index = 0; index < 24; index++) {
    const t = index / 23;
    const x = 2 + 35 * t;
    const z = -95 + 430 * t;
    const yaw = ((index % 5) - 2) * 0.18;
    const pitch = [-0.025, 0, 0.025][index % 3];
    rays.push({ origin: new THREE.Vector3(x, field.getHeightAt(x, z) + 2, z),
      direction: new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)), maxDistance: 800 });
  }
  return rays;
}

function runRays(ray, rays, stats, repeats = 1) {
  const before = { ...stats };
  const distances = [];
  let maxRayMs = 0;
  let maxColdRayMs = 0;
  let coldRays = 0;
  const start = performance.now();
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const entry of rays) {
      const calls = stats.analyticCalls;
      const startedAt = performance.now();
      const result = ray(entry.origin, entry.direction, entry.maxDistance);
      const elapsed = performance.now() - startedAt;
      maxRayMs = Math.max(maxRayMs, elapsed);
      if (stats.analyticCalls > calls) {
        maxColdRayMs = Math.max(maxColdRayMs, elapsed);
        coldRays++;
      }
      if (repeat === 0) distances.push(result);
    }
  }
  return { distances, totalMs: performance.now() - start,
    maxRayMs, maxColdRayMs, coldRays,
    counts: Object.fromEntries(Object.keys(stats).map(key => [key, stats[key] - before[key]])) };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(runs, phase) {
  return { medianTotalMs: median(runs.map(run => run[phase].totalMs)),
    medianMaxRayMs: median(runs.map(run => run[phase].maxRayMs)),
    worstRayMs: Math.max(...runs.map(run => run[phase].maxRayMs)),
    medianMaxColdRayMs: median(runs.map(run => run[phase].maxColdRayMs)),
    counts: runs[0][phase].counts };
}

export async function benchmarkWinterCache({ rounds = 7, hotRepeats = 100 } = {}) {
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 9);
  assert.ok(Number.isInteger(hotRepeats) && hotRepeats >= 1 && hotRepeats <= 200);
  const [THREE, { createHeightField }, { default: winter }] = await Promise.all([
    import('three'), import('../src/world/terrain.ts'), import('../src/world/maps/winter.ts'),
  ]);
  const field = createHeightField(1337, winter);
  const rays = createWinterCorridor(THREE, field);
  const tiles = new Map();
  const discover = createCacheExperiment('tile', field.getHeightAt);
  const discoveryRay = createTerrainRayExperiment(THREE, field, (x, z) => {
    const tx = Math.floor(Math.max(0, Math.min(SIZE - 1e-4, x + HALF)) / TILE);
    const tz = Math.floor(Math.max(0, Math.min(SIZE - 1e-4, z + HALF)) / TILE);
    tiles.set(tz * 64 + tx, { x: tx * TILE - HALF, z: tz * TILE - HALF, radiusM: 0 });
    return discover.getHeightAtFast(x, z);
  });
  const reference = runRays(discoveryRay, rays, discover.stats).distances;
  const warmPoints = [...tiles.values()];
  const runs = { tile: [], vertex: [] };
  // The first pair warms code/JIT only; every measured cold run owns a fresh cache.
  for (let round = -1; round < rounds; round++) {
    for (const mode of round % 2 === 0 ? ['tile', 'vertex'] : ['vertex', 'tile']) {
      const cache = createCacheExperiment(mode, field.getHeightAt);
      const ray = createTerrainRayExperiment(THREE, field, cache.getHeightAtFast);
      const cold = runRays(ray, rays, cache.stats);
      assert.deepEqual(cold.distances, reference, 'cold ray hit distances must be exact');
      const hotPartial = runRays(ray, rays, cache.stats, hotRepeats);
      assert.deepEqual(hotPartial.distances, reference);
      assert.equal(hotPartial.counts.analyticCalls, 0, 'repeated rays cannot evaluate new vertices');
      const warmBefore = cache.stats.analyticCalls;
      const startedAt = performance.now();
      const warmKeys = [...cache.warmFastTilesAround(warmPoints)];
      const warm = { ms: performance.now() - startedAt,
        analyticCalls: cache.stats.analyticCalls - warmBefore, completedTiles: warmKeys.length };
      assert.deepEqual([...cache.warmFastTilesAround(warmPoints)], []);
      const hotComplete = runRays(ray, rays, cache.stats, hotRepeats);
      assert.deepEqual(hotComplete.distances, reference);
      assert.equal(hotComplete.counts.analyticCalls, 0);
      if (round >= 0) runs[mode].push({ cold, hotPartial, warm, hotComplete, bytes: cache.bytes });
    }
  }
  return { scenario: { map: 'winter', seed: 1337, rays: rays.length, rounds, hotRepeats,
    baselineRevision: 'ff68c3d6c', candidate: 'current-runtime',
    path: { start: { x: 2, z: -95 }, end: { x: 37, z: 335 } },
    maxDistanceM: 800, sampledTiles: tiles.size, productionReplay: false,
    scope: 'actual terrain-only ray march; no props, tanks, renderer or network',
    instrumentedCounters: true, fifoSerializesOnlyCooperatingTools: true },
  exactRayDistances: true,
  results: Object.fromEntries(Object.entries(runs).map(([mode, batches]) => [mode, {
    bytes: batches[0].bytes, cold: summarize(batches, 'cold'),
    hotPartial: summarize(batches, 'hotPartial'), hotComplete: summarize(batches, 'hotComplete'),
    warm: { medianMs: median(batches.map(batch => batch.warm.ms)),
      analyticCalls: batches[0].warm.analyticCalls, completedTiles: batches[0].warm.completedTiles },
    runs: batches,
  }])) };
}

export async function runWinterCacheBenchmark({ lock = createCaptureLock(), measure = benchmarkWinterCache } = {}) {
  console.error('terrain fast cache benchmark: waiting for shared FIFO');
  try {
    await lock.acquire(30 * 60 * 1000);
    console.error('terrain fast cache benchmark: FIFO acquired; Node-only measurement');
    return await measure();
  } finally { lock.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('terrain fast cache benchmark accepts no arguments');
  try { console.log(JSON.stringify(await runWinterCacheBenchmark(), null, 2)); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
