import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import type {
  GarageEnvironmentAssetLibrary,
  GarageEnvironmentBuild,
} from './garageEnvironmentKit.ts';

interface ArchitectureEngineContext {
  anisotropy?: number;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageArchitectureStats {
  key: GarageVariant['architecture'];
  mapId: string;
  mode: 'garage-environment';
  signature: string;
  objects: number;
  drawCalls: number;
  triangles: number;
  cached: number;
  cacheLimit: number;
  residentTextureSets: number;
  referencedTextureSets: number;
  enclosingSurfaces: number;
  ready: boolean;
  source: 'authentic-garage-scene-pack';
  sourceBeat: string;
  sourceStructure: string;
  sourceLandmarkLocal: readonly [number, number, number] | null;
  distinctiveElements: readonly string[];
  landmarkHeightM: number;
  serviceFrame: string;
  terrainProfile: string;
  terrainSourceAnchor: readonly [number, number] | null;
  terrainVertices: number;
  textureSets: readonly string[];
  treeSpecies: readonly string[];
  trees: number;
  lastBuildMs: number;
}

const CACHE_LIMIT = 2;
const loadEnvironmentKit = () => import('./garageEnvironmentKit.ts');

/**
 * Own the bounded Garage scene-pack cache. Loading the real world-asset
 * builders is intentionally outside the boot-critical Garage chunk; packs
 * stream behind the existing cover and stale rapid-switch completions never
 * become visible.
 */
export function createGarageArchitectureController(
  engineCtx: ArchitectureEngineContext,
  parent: THREE.Object3D,
  requestRender: () => void = () => {},
) {
  const group = new THREE.Group();
  group.name = 'garage_variant_architecture';
  group.userData.perfOwner = 'garage/architecture';
  parent.add(group);

  const cache = new Map<GarageVariant['architecture'], GarageEnvironmentBuild>();
  const pending = new Map<GarageVariant['architecture'], Promise<GarageEnvironmentBuild | null>>();
  let assets: GarageEnvironmentAssetLibrary | null = null;
  let active: GarageEnvironmentBuild | null = null;
  let selected: GarageVariant | null = null;
  let lastBuildMs = 0;
  let textureWarmScheduled = false;
  let disposed = false;

  const touch = (key: GarageVariant['architecture'], build: GarageEnvironmentBuild): void => {
    cache.delete(key);
    cache.set(key, build);
  };

  const trim = (): void => {
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.entries().next().value as
        [GarageVariant['architecture'], GarageEnvironmentBuild] | undefined;
      if (!oldest) return;
      const [key, build] = oldest;
      if (build === active) {
        touch(key, build);
        continue;
      }
      cache.delete(key);
      build.dispose();
    }
  };

  const collectStats = (): GarageArchitectureStats => {
    const root = active?.root;
    const textureStats = assets?.diagnostics() || { residentSets: 0, referencedSets: 0 };
    const selectedReady = !!selected && root?.userData.architectureKey === selected.architecture;
    return {
      key: selected?.architecture || 'field_shed',
      mapId: selected?.mapId || 'verdant',
      mode: 'garage-environment',
      signature: selectedReady ? String(root?.userData.signature || '') : '',
      objects: selectedReady ? Number(root?.userData.objects || 0) : 0,
      drawCalls: selectedReady ? Number(root?.userData.drawCalls || root?.userData.objects || 0) : 0,
      triangles: selectedReady ? Number(root?.userData.triangles || 0) : 0,
      cached: cache.size,
      cacheLimit: CACHE_LIMIT,
      residentTextureSets: textureStats.residentSets,
      referencedTextureSets: textureStats.referencedSets,
      enclosingSurfaces: 0,
      ready: selectedReady && root?.userData.ready === true,
      source: 'authentic-garage-scene-pack',
      sourceBeat: selectedReady ? String(root?.userData.sourceBeat || '') : '',
      sourceStructure: selectedReady ? String(root?.userData.sourceStructure || '') : '',
      sourceLandmarkLocal: selectedReady ? root?.userData.sourceLandmarkLocal || null : null,
      distinctiveElements: selectedReady ? root?.userData.distinctiveElements || [] : [],
      landmarkHeightM: selectedReady ? Number(root?.userData.landmarkHeightM || 0) : 0,
      serviceFrame: selectedReady ? String(root?.userData.serviceFrame || '') : '',
      terrainProfile: selectedReady ? String(root?.userData.terrainProfile || '') : '',
      terrainSourceAnchor: selectedReady ? root?.userData.terrainSourceAnchor || null : null,
      terrainVertices: selectedReady ? Number(root?.userData.terrainVertices || 0) : 0,
      textureSets: selectedReady ? root?.userData.textureSets || [] : [],
      treeSpecies: selectedReady ? root?.userData.treeSpecies || [] : [],
      trees: selectedReady ? Number(root?.userData.trees || 0) : 0,
      lastBuildMs,
    };
  };

  const publish = (): GarageArchitectureStats => {
    const stats = collectStats();
    Object.assign(group.userData, stats);
    return stats;
  };

  const show = (variant: GarageVariant, build: GarageEnvironmentBuild): void => {
    if (active && active !== build) active.root.visible = false;
    active = build;
    active.root.visible = true;
    active.root.userData.architectureKey = variant.architecture;
    active.root.userData.mapId = variant.mapId;
    touch(variant.architecture, build);
    trim();
    publish();
    requestRender();
    if (!textureWarmScheduled && assets) {
      textureWarmScheduled = true;
      // The active pack already acquired six of nine tiny surface sets. Start
      // the remaining six image requests in the same bounded construction
      // transaction, before interactive readiness. A later timer can collide
      // with the first selector click and turn otherwise-async image decode
      // into a visible long frame on 4x-throttled CPUs.
      assets.warmAll(requestRender);
    }
  };

  const ensure = (variant: GarageVariant): Promise<GarageEnvironmentBuild | null> => {
    const cached = cache.get(variant.architecture);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(variant.architecture);
    if (inFlight) return inFlight;
    const task = loadEnvironmentKit().then((kit) => {
      if (disposed) return null;
      if (!assets) {
        assets = kit.createGarageEnvironmentAssetLibrary(engineCtx);
        // Warmed surface sets are intentionally not all attached to the active
        // pack. Declare them on the architecture owner so phase suspension can
        // evict every Garage-only GPU texture before battle and re-upload only
        // the active materials under the covered return frame.
        registerRetainedObject3DResources(group, { textures: assets.retainedTextures() });
      }
      const startedAt = performance.now();
      const build = kit.buildGarageEnvironment(engineCtx, assets, variant, requestRender);
      lastBuildMs = performance.now() - startedAt;
      if (disposed) {
        build.dispose();
        return null;
      }
      build.root.userData.architectureKey = variant.architecture;
      build.root.userData.mapId = variant.mapId;
      build.root.visible = false;
      group.add(build.root);
      touch(variant.architecture, build);
      trim();
      if (selected?.architecture === variant.architecture) show(variant, build);
      return build;
    }).finally(() => pending.delete(variant.architecture));
    pending.set(variant.architecture, task);
    return task;
  };

  function setVariant(variant: GarageVariant): GarageArchitectureStats {
    selected = variant;
    const cached = cache.get(variant.architecture);
    if (cached) {
      lastBuildMs = 0;
      show(variant, cached);
    } else {
      publish();
      void ensure(variant);
    }
    return collectStats();
  }

  return {
    group,
    setVariant,
    stats: collectStats,
    async whenReady(): Promise<GarageArchitectureStats> {
      if (selected) await ensure(selected);
      return collectStats();
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const build of cache.values()) build.dispose();
      cache.clear();
      pending.clear();
      active = null;
      assets?.dispose();
      assets = null;
      group.clear();
    },
  };
}
