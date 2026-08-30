import * as THREE from 'three';
import { getMapConfig } from '../src/world/maps/index.ts';
import {
  buildTerrainMeshesAsync,
  createHeightField,
  type TerrainMapConfig,
} from '../src/world/terrain.ts';

const config = getMapConfig('verdant');
type TerrainEngineContext = Parameters<typeof buildTerrainMeshesAsync>[1];

interface TerrainStreamingStats {
  enabled: boolean;
  totalGeometryCount: number;
  initialGeometryCount: number;
  initialFineGridCount: number;
  streamedGeometryCount: number;
}

interface TerrainRuntimeGroup extends THREE.Group {
  userData: THREE.Object3D['userData'] & {
    streamingStats: TerrainStreamingStats;
    updateLOD(camera: { readonly x: number; readonly z: number }): void;
  };
}

interface TerrainSample {
  readonly ms: number;
  readonly stats: TerrainStreamingStats;
  readonly streamJobMs: readonly number[];
}

interface TerrainRun extends TerrainSample {
  readonly streamed: boolean;
}

interface TerrainStreamBenchmark {
  readonly eagerMs: number;
  readonly streamedMs: number;
  readonly savingsMs: number;
  readonly savingsPct: number;
  readonly streamedStats: TerrainStreamingStats;
  readonly streamJobs: { readonly count: number; readonly maxMs: number };
  readonly runs: readonly { readonly streamed: boolean; readonly ms: number }[];
}

declare global {
  interface Window {
    __TERRAIN_STREAM_BENCH: TerrainStreamBenchmark;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumberTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isTerrainMapConfig(value: unknown): value is TerrainMapConfig {
  if (!isRecord(value)) return false;
  if (value.splat !== undefined) {
    if (!isRecord(value.splat)) return false;
    for (const key of ['tintA', 'tintB', 'tintC', 'roadTint', 'iceSky']) {
      const tuple = value.splat[key];
      if (tuple !== undefined && !isNumberTuple(tuple, 3)) return false;
    }
  }
  if (value.terrain !== undefined) {
    if (!isRecord(value.terrain)) return false;
    const roads = value.terrain.roads;
    if (roads !== undefined && roads !== 'country') {
      if (!isRecord(roads)) return false;
      if (roads.paths !== undefined && (!Array.isArray(roads.paths)
        || !roads.paths.every((path) => Array.isArray(path)
          && path.every((point) => isNumberTuple(point, 2))))) return false;
    }
  }
  return true;
}

const terrainConfigCandidate: unknown = config;
if (!isTerrainMapConfig(terrainConfigCandidate)) {
  throw new Error('Verdant map config is incompatible with the terrain benchmark');
}
const terrainConfig = terrainConfigCandidate;
const heightField = createHeightField(1337, terrainConfig);
const engineCtx: TerrainEngineContext = {
  anisotropy: 4,
  setupShadowMaterial() {},
};

function disposeGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
    else materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

async function sample(streamFarLods: boolean): Promise<TerrainSample> {
  const startedAt = performance.now();
  const group = await buildTerrainMeshesAsync(
    heightField,
    engineCtx,
    terrainConfig,
    null,
    false,
    streamFarLods ? { streamFarLods: true, focus: heightField._layout.spawns.player } : null,
  );
  const ms = performance.now() - startedAt;
  const runtimeGroup = group as TerrainRuntimeGroup;
  const stats = runtimeGroup.userData.streamingStats;
  const streamJobMs: number[] = [];
  if (streamFarLods) {
    const updateLOD = runtimeGroup.userData.updateLOD;
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
const runs: TerrainRun[] = [];
for (const streamed of [true, false, false, true, true, false]) {
  runs.push({ streamed, ...(await sample(streamed)) });
  await new Promise((resolve) => setTimeout(resolve, 50));
}
const median = (values: readonly number[]): number => {
  if (!values.length) throw new Error('terrain benchmark requires at least one sample');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0]!;
};
const eagerMs = median(runs.filter((r) => !r.streamed).map((r) => r.ms));
const streamedMs = median(runs.filter((r) => r.streamed).map((r) => r.ms));
const streamedRun = runs.find((run) => run.streamed);
if (!streamedRun) throw new Error('terrain benchmark requires a streamed sample');
const streamJobSamples = runs.filter((run) => run.streamed).flatMap((run) => run.streamJobMs);
window.__TERRAIN_STREAM_BENCH = {
  eagerMs,
  streamedMs,
  savingsMs: eagerMs - streamedMs,
  savingsPct: (eagerMs - streamedMs) / eagerMs * 100,
  streamedStats: streamedRun.stats,
  streamJobs: {
    count: streamJobSamples.length,
    maxMs: Math.max(...streamJobSamples),
  },
  runs: runs.map((r) => ({ streamed: r.streamed, ms: r.ms })),
};
