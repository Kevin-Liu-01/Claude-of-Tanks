import type { RuntimeValue } from '../src/runtimeTypes.ts';
import * as THREE from 'three';
import { getMapConfig } from '../src/world/maps/index.ts';
import {
  buildTerrainMeshesAsync,
  createHeightField,
  type TerrainMapConfig,
} from '../src/world/terrain.ts';

const requestedMaps = new URLSearchParams(window.location.search).getAll('map');
const mapId = requestedMaps[0] ?? 'verdant';
if (requestedMaps.length > 1 || (mapId !== 'verdant' && mapId !== 'winter')) {
  throw new Error('terrain benchmark: map must be verdant or winter');
}
const config = getMapConfig(mapId);
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
  readonly streamUpdateMs: readonly number[];
  readonly buildSlices: {
    readonly count: number;
    readonly maxMs: number;
    readonly horizonMaxMs: number;
    readonly materialMaxMs: number;
    readonly geometryMaxMs: number;
  };
}

interface TerrainRun extends TerrainSample {
  readonly streamed: boolean;
}

interface TerrainStreamBenchmark {
  readonly scenario: {
    readonly mapId: 'verdant' | 'winter';
    readonly seed: 1337;
    readonly cameraPath: {
      readonly start: { readonly x: 2; readonly z: -95 };
      readonly end: { readonly x: 37; readonly z: 335 };
      readonly positions: 181;
      readonly updatesPerPosition: 4;
    };
  };
  readonly cold: {
    readonly ms: number;
    readonly maxBuildSliceMs: number;
    readonly horizonMaxMs: number;
    readonly materialMaxMs: number;
    readonly geometryMaxMs: number;
  };
  readonly eagerMs: number;
  readonly streamedMs: number;
  readonly savingsMs: number;
  readonly savingsPct: number;
  readonly streamedStats: TerrainStreamingStats;
  readonly streamJobs: { readonly count: number; readonly maxMs: number };
  readonly streamUpdates: {
    readonly count: number;
    readonly maxMs: number;
    readonly p95Ms: number;
    readonly p99Ms: number;
    readonly completedGeometryPerRun: readonly number[];
    readonly includesPartialWork: true;
  };
  readonly runs: readonly {
    readonly streamed: boolean;
    readonly ms: number;
    readonly maxBuildSliceMs: number;
    readonly horizonMaxMs: number;
    readonly materialMaxMs: number;
    readonly geometryMaxMs: number;
  }[];
}

declare global {
  interface Window {
    __TERRAIN_STREAM_BENCH: TerrainStreamBenchmark;
  }
}

type BenchmarkFieldValue = object | string | number | boolean | null | undefined;
type BenchmarkRecord = Record<string, BenchmarkFieldValue>;

function isRecord<Value>(value: Value): value is Value & BenchmarkRecord {
  return typeof value === 'object' && value !== null;
}

function isNumberTuple(value: RuntimeValue, length: number): boolean {
  return Array.isArray(value) && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function hasValidSplatConfig(value: BenchmarkRecord): boolean {
  if (value.splat === undefined) return true;
  if (!isRecord(value.splat)) return false;
  const splat = value.splat;
  return ['tintA', 'tintB', 'tintC', 'roadTint', 'iceSky'].every((key) => {
    const tuple = splat[key];
    return tuple === undefined || isNumberTuple(tuple, 3);
  });
}

function hasValidTerrainRoads(value: BenchmarkRecord): boolean {
  if (value.terrain === undefined) return true;
  if (!isRecord(value.terrain)) return false;
  const roads = value.terrain.roads;
  if (roads === undefined || roads === 'country') return true;
  if (!isRecord(roads)) return false;
  return roads.paths === undefined || (Array.isArray(roads.paths)
    && roads.paths.every((path) => Array.isArray(path)
      && path.every((point) => isNumberTuple(point, 2))));
}

function isTerrainMapConfig(value: RuntimeValue): value is TerrainMapConfig {
  if (!isRecord(value)) return false;
  return hasValidSplatConfig(value) && hasValidTerrainRoads(value);
}

const terrainConfigCandidate: RuntimeValue = config;
if (!isTerrainMapConfig(terrainConfigCandidate)) {
  throw new Error(`${mapId} map config is incompatible with the terrain benchmark`);
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
  let sliceStartedAt = startedAt;
  const buildSliceMs: number[] = [];
  const horizonSliceMs: number[] = [];
  const materialSliceMs: number[] = [];
  const geometrySliceMs: number[] = [];
  const group = await buildTerrainMeshesAsync(
    heightField,
    engineCtx,
    terrainConfig,
    (completed) => {
      const sampleNow = performance.now();
      const elapsedMs = sampleNow - sliceStartedAt;
      buildSliceMs.push(elapsedMs);
      if (completed === 0) horizonSliceMs.push(elapsedMs);
      else if (completed === 1) materialSliceMs.push(elapsedMs);
      else geometrySliceMs.push(elapsedMs);
      sliceStartedAt = sampleNow;
    },
    true,
    streamFarLods ? { streamFarLods: true, focus: heightField._layout.spawns.player } : null,
  );
  const ms = performance.now() - startedAt;
  const runtimeGroup = group as TerrainRuntimeGroup;
  const stats = runtimeGroup.userData.streamingStats;
  const streamJobMs: number[] = [];
  const streamUpdateMs: number[] = [];
  if (streamFarLods) {
    const updateLOD = runtimeGroup.userData.updateLOD;
    let priorJobs = stats.streamedGeometryCount;
    // Retain the same fixed camera path on every map for comparison. Four
    // updates per position preserve the original fixed-cadence comparison.
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      const camera = { x: 2 + 35 * t, z: -95 + 430 * t };
      for (let frame = 0; frame < 4; frame++) {
        const jobStartedAt = performance.now();
        updateLOD(camera);
        const jobMs = performance.now() - jobStartedAt;
        // An incremental builder also works on calls that complete no mesh.
        // Measure every update, not just the final (often cheap) publication.
        streamUpdateMs.push(jobMs);
        if (stats.streamedGeometryCount !== priorJobs) {
          streamJobMs.push(jobMs);
          priorJobs = stats.streamedGeometryCount;
        }
      }
    }
  }
  disposeGroup(group);
  return {
    ms,
    stats: { ...stats },
    streamJobMs,
    streamUpdateMs,
    buildSlices: {
      count: buildSliceMs.length,
      maxMs: Math.max(...buildSliceMs),
      horizonMaxMs: Math.max(0, ...horizonSliceMs),
      materialMaxMs: Math.max(0, ...materialSliceMs),
      geometryMaxMs: Math.max(0, ...geometrySliceMs),
    },
  };
}

// Alternate order after one warm-up to limit JIT/GC bias.
const cold = await sample(false);
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
const streamUpdateSamples = runs.filter((run) => run.streamed)
  .flatMap((run) => run.streamUpdateMs).sort((a, b) => a - b);
const updatePercentile = (percent: number): number => streamUpdateSamples.length
  ? streamUpdateSamples[Math.ceil(percent * streamUpdateSamples.length) - 1]! : 0;
window.__TERRAIN_STREAM_BENCH = {
  scenario: {
    mapId,
    seed: 1337,
    cameraPath: { start: { x: 2, z: -95 }, end: { x: 37, z: 335 }, positions: 181, updatesPerPosition: 4 },
  },
  cold: {
    ms: cold.ms,
    maxBuildSliceMs: cold.buildSlices.maxMs,
    horizonMaxMs: cold.buildSlices.horizonMaxMs,
    materialMaxMs: cold.buildSlices.materialMaxMs,
    geometryMaxMs: cold.buildSlices.geometryMaxMs,
  },
  eagerMs,
  streamedMs,
  savingsMs: eagerMs - streamedMs,
  savingsPct: (eagerMs - streamedMs) / eagerMs * 100,
  streamedStats: streamedRun.stats,
  streamJobs: {
    count: streamJobSamples.length,
    maxMs: Math.max(0, ...streamJobSamples),
  },
  streamUpdates: {
    count: streamUpdateSamples.length,
    maxMs: Math.max(0, ...streamUpdateSamples),
    p95Ms: updatePercentile(0.95),
    p99Ms: updatePercentile(0.99),
    completedGeometryPerRun: runs.filter((run) => run.streamed)
      .map((run) => run.stats.streamedGeometryCount),
    includesPartialWork: true,
  },
  runs: runs.map((r) => ({
    streamed: r.streamed,
    ms: r.ms,
    maxBuildSliceMs: r.buildSlices.maxMs,
    horizonMaxMs: r.buildSlices.horizonMaxMs,
    materialMaxMs: r.buildSlices.materialMaxMs,
    geometryMaxMs: r.buildSlices.geometryMaxMs,
  })),
};
