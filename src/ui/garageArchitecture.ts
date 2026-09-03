import * as THREE from 'three';

import { type GarageVariant } from '../game/garageVariants.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import type {
  GarageEnvironmentAssetLibrary,
  GarageEnvironmentBuild,
} from './garageEnvironmentKit.ts';

interface ArchitectureEngineContext {
  anisotropy?: number;
  renderer?: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageArchitectureStats {
  key: GarageVariant['architecture'];
  mapId: string;
  mode: 'verdant-workshop' | 'garage-environment';
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
  source: 'verdant-workshop' | 'authentic-garage-scene-pack';
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
  treeDetailTier: 'battlefield-near' | 'battlefield-far' | 'none';
  backdropLayers: number;
  horizonStyle: 'flat' | 'rolling' | 'urban' | 'coastal' | 'alpine' | 'mesa' | 'none';
  horizonMaxHeightM: number;
  groundCover: number;
  structures: number;
  facilityProps: number;
  facilityStations: number;
  approachLabel: string;
  approachStyle: string;
  approachSegments: number;
  approachDetails: number;
  approachConnected: boolean;
  approachGroundErrorM: number;
  connectedExteriorParts: number;
  connectedExteriorBuildings: number;
  maxExteriorSupportGapM: number;
  looseParts: number;
  railSegments: number;
  placementZones: number;
  openingViewFrames: number;
  structuralConnections: number;
  unsupportedParts: number;
  heavyLiftSystems: number;
  operationalMachines: number;
  servicePurposeTags: readonly string[];
  facilityMaterialClasses: number;
  openingSightlineIntrusions: number;
  placementOverlaps: number;
  maxGroundContactErrorM: number;
  platformGroundClearanceM: number;
  outdoorWarmReady: boolean;
  lastBuildMs: number;
}

const CACHE_LIMIT = 2;
const loadEnvironmentKit = () => import('./garageEnvironmentKit.ts');

function buildVerdantWorkshopOwner(): GarageEnvironmentBuild {
  const root = new THREE.Group();
  root.name = 'garage_environment_field_shed';
  root.userData.perfOwner = 'garage/verdant-workshop-stage';
  const stats = Object.freeze({
    distinctiveElements: Object.freeze([
      'restored enclosed workshop shell',
      'connected high-bay maintenance volume',
      'wall tools, service signage and floor equipment',
      'authored industrial lighting fixtures',
    ]),
    drawCalls: 0,
    enclosingSurfaces: 4,
    landmarkHeightM: 10,
    objects: 0,
    serviceFrame: 'original enclosed Verdant motor-pool workshop',
    signature: 'field_shed:restored-original-workshop',
    sourceBeat: 'authored-field-workshop',
    sourceLandmarkLocal: Object.freeze([0, 10, -21] as const),
    sourceStructure: 'original Verdant indoor motor pool',
    terrainProfile: 'sealed concrete maintenance floor',
    terrainSourceAnchor: Object.freeze([0, 0] as const),
    terrainVertices: 0,
    textureSets: Object.freeze(['original-wall', 'original-floor', 'original-podium']),
    treeSpecies: Object.freeze([]),
    trees: 0,
    treeDetailTier: 'none',
    backdropLayers: 0,
    horizonStyle: 'none',
    horizonMaxHeightM: 0,
    groundCover: 0,
    structures: 1,
    facilityProps: 0,
    facilityStations: 4,
    approachLabel: 'original enclosed workshop floor',
    approachStyle: 'farm-lane',
    approachSegments: 0,
    approachDetails: 0,
    approachConnected: true,
    approachGroundErrorM: 0,
    connectedExteriorParts: 0,
    connectedExteriorBuildings: 0,
    maxExteriorSupportGapM: 0,
    looseParts: 0,
    railSegments: 0,
    placementZones: 4,
    openingViewFrames: 0,
    structuralConnections: 80,
    unsupportedParts: 0,
    heavyLiftSystems: 3,
    operationalMachines: 7,
    servicePurposeTags: Object.freeze([
      'heavy-lift', 'welding', 'component-rebuild', 'rollover-teardown',
      'enclosed-workshop',
    ]),
    facilityMaterialClasses: 8,
    openingSightlineIntrusions: 0,
    placementOverlaps: 0,
    maxGroundContactErrorM: 0,
    platformGroundClearanceM: 0.025,
    triangles: 0,
  });
  Object.assign(root.userData, stats, {
    mode: 'verdant-workshop',
    ready: true,
    source: 'verdant-workshop',
  });
  return {
    root,
    stats,
    dispose() {
      root.removeFromParent();
      root.clear();
    },
  };
}

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
  const warmPending = new Map<GarageVariant['architecture'], Promise<GarageEnvironmentBuild | null>>();
  const preparationPending = new Map<GarageVariant['architecture'], Promise<GarageEnvironmentBuild | null>>();
  let assets: GarageEnvironmentAssetLibrary | null = null;
  let active: GarageEnvironmentBuild | null = null;
  let selected: GarageVariant | null = null;
  let lastBuildMs = 0;
  let environmentKitPromise: ReturnType<typeof loadEnvironmentKit> | null = null;
  let selectionGeneration = 0;
  const warmedArchitectures = new Set<GarageVariant['architecture']>();
  let disposed = false;

  const getEnvironmentKit = (): ReturnType<typeof loadEnvironmentKit> => (
    environmentKitPromise ||= loadEnvironmentKit()
  );

  const ensureAssets = (
    kit: Awaited<ReturnType<typeof loadEnvironmentKit>>,
  ): GarageEnvironmentAssetLibrary => {
    if (!assets) {
      assets = kit.createGarageEnvironmentAssetLibrary(engineCtx);
      registerRetainedObject3DResources(group, { textures: assets.retainedTextures() });
    }
    return assets;
  };

  const touch = (key: GarageVariant['architecture'], build: GarageEnvironmentBuild): void => {
    cache.delete(key);
    cache.set(key, build);
  };

  const trim = (): void => {
    while (cache.size > CACHE_LIMIT) {
      const oldest = [...cache.entries()].find(([key, build]) => (
        build !== active
        && !pending.has(key)
        && !warmPending.has(key)
        && !preparationPending.has(key)
      ));
      if (!oldest) return;
      const [key, build] = oldest;
      cache.delete(key);
      warmedArchitectures.delete(key);
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
      mode: selectedReady && root?.userData.mode === 'verdant-workshop'
        ? 'verdant-workshop' : 'garage-environment',
      signature: selectedReady ? String(root?.userData.signature || '') : '',
      objects: selectedReady ? Number(root?.userData.objects || 0) : 0,
      drawCalls: selectedReady ? Number(root?.userData.drawCalls || root?.userData.objects || 0) : 0,
      triangles: selectedReady ? Number(root?.userData.triangles || 0) : 0,
      cached: cache.size,
      cacheLimit: CACHE_LIMIT,
      residentTextureSets: textureStats.residentSets,
      referencedTextureSets: textureStats.referencedSets,
      enclosingSurfaces: selectedReady ? Number(root?.userData.enclosingSurfaces || 0) : 0,
      ready: selectedReady && root?.userData.ready === true,
      source: selectedReady && root?.userData.source === 'verdant-workshop'
        ? 'verdant-workshop' : 'authentic-garage-scene-pack',
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
      treeDetailTier: selectedReady
        ? root?.userData.treeDetailTier || 'none' : 'none',
      backdropLayers: selectedReady ? Number(root?.userData.backdropLayers || 0) : 0,
      horizonStyle: selectedReady ? root?.userData.horizonStyle || 'none' : 'none',
      horizonMaxHeightM: selectedReady ? Number(root?.userData.horizonMaxHeightM || 0) : 0,
      groundCover: selectedReady ? Number(root?.userData.groundCover || 0) : 0,
      structures: selectedReady ? Number(root?.userData.structures || 0) : 0,
      facilityProps: selectedReady ? Number(root?.userData.facilityProps || 0) : 0,
      facilityStations: selectedReady ? Number(root?.userData.facilityStations || 0) : 0,
      approachLabel: selectedReady ? String(root?.userData.approachLabel || '') : '',
      approachStyle: selectedReady ? String(root?.userData.approachStyle || '') : '',
      approachSegments: selectedReady ? Number(root?.userData.approachSegments || 0) : 0,
      approachDetails: selectedReady ? Number(root?.userData.approachDetails || 0) : 0,
      approachConnected: selectedReady && root?.userData.approachConnected === true,
      approachGroundErrorM: selectedReady
        ? Number(root?.userData.approachGroundErrorM || 0) : 0,
      connectedExteriorParts: selectedReady
        ? Number(root?.userData.connectedExteriorParts || 0) : 0,
      connectedExteriorBuildings: selectedReady
        ? Number(root?.userData.connectedExteriorBuildings || 0) : 0,
      maxExteriorSupportGapM: selectedReady
        ? Number(root?.userData.maxExteriorSupportGapM || 0) : 0,
      looseParts: selectedReady ? Number(root?.userData.looseParts || 0) : 0,
      railSegments: selectedReady ? Number(root?.userData.railSegments || 0) : 0,
      placementZones: selectedReady ? Number(root?.userData.placementZones || 0) : 0,
      openingViewFrames: selectedReady ? Number(root?.userData.openingViewFrames || 0) : 0,
      structuralConnections: selectedReady
        ? Number(root?.userData.structuralConnections || 0) : 0,
      unsupportedParts: selectedReady ? Number(root?.userData.unsupportedParts || 0) : 0,
      heavyLiftSystems: selectedReady ? Number(root?.userData.heavyLiftSystems || 0) : 0,
      operationalMachines: selectedReady ? Number(root?.userData.operationalMachines || 0) : 0,
      servicePurposeTags: selectedReady ? root?.userData.servicePurposeTags || [] : [],
      facilityMaterialClasses: selectedReady
        ? Number(root?.userData.facilityMaterialClasses || 0) : 0,
      openingSightlineIntrusions: selectedReady
        ? Number(root?.userData.openingSightlineIntrusions || 0) : 0,
      placementOverlaps: selectedReady ? Number(root?.userData.placementOverlaps || 0) : 0,
      maxGroundContactErrorM: selectedReady
        ? Number(root?.userData.maxGroundContactErrorM || 0) : 0,
      platformGroundClearanceM: selectedReady
        ? Number(root?.userData.platformGroundClearanceM || 0) : 0,
      outdoorWarmReady: selected?.architecture === 'field_shed'
        || warmedArchitectures.has(selected?.architecture || 'field_shed'),
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
  };

  const attach = (
    variant: GarageVariant,
    build: GarageEnvironmentBuild,
  ): GarageEnvironmentBuild | null => {
    if (disposed) {
      build.dispose();
      return null;
    }
    build.root.userData.architectureKey = variant.architecture;
    build.root.userData.mapId = variant.mapId;
    build.root.visible = false;
    group.add(build.root);
    if (variant.architecture === 'field_shed') warmedArchitectures.add(variant.architecture);
    touch(variant.architecture, build);
    trim();
    if (selected?.architecture === variant.architecture
        && warmedArchitectures.has(variant.architecture)) {
      show(variant, build);
    }
    return build;
  };

  const ensure = (variant: GarageVariant): Promise<GarageEnvironmentBuild | null> => {
    const cached = cache.get(variant.architecture);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(variant.architecture);
    if (inFlight) return inFlight;
    const task = (variant.architecture === 'field_shed'
      ? Promise.resolve(buildVerdantWorkshopOwner())
      : getEnvironmentKit().then(async (kit) => {
      if (disposed) return null;
      const library = ensureAssets(kit);
      await kit.prepareGarageEnvironmentAssets(library, variant);
      if (disposed) return null;
      const startedAt = performance.now();
      const build = kit.buildGarageEnvironment(engineCtx, library, variant, requestRender);
      lastBuildMs = performance.now() - startedAt;
      return build;
    })).then((build) => build ? attach(variant, build) : null)
      .finally(() => pending.delete(variant.architecture));
    pending.set(variant.architecture, task);
    return task;
  };

  const warmForReveal = (
    variant: GarageVariant,
    build: GarageEnvironmentBuild | null,
  ): Promise<GarageEnvironmentBuild | null> => {
    if (!build || disposed || warmedArchitectures.has(variant.architecture)) {
      return Promise.resolve(build);
    }
    const current = warmPending.get(variant.architecture);
    if (current) return current;
    const task = (async () => {
      const { renderer, scene, camera } = engineCtx;
      if (!renderer || !scene || !camera || typeof document === 'undefined') {
        warmedArchitectures.add(variant.architecture);
        return build;
      }
      const textures = new Set<THREE.Texture>();
      build.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          const candidate = material as THREE.MeshStandardMaterial;
          if (candidate.map) textures.add(candidate.map);
          if (candidate.normalMap) textures.add(candidate.normalMap);
        }
      });
      const waitForImage = (texture: THREE.Texture): Promise<void> => {
        const image = texture.image as (EventTarget & {
          complete?: boolean;
          naturalWidth?: number;
          decode?: () => Promise<void>;
        }) | null;
        if (!image || (image.complete && Number(image.naturalWidth || 0) > 0)) {
          return Promise.resolve();
        }
        if (typeof image.decode === 'function') return image.decode().catch(() => undefined);
        return new Promise((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      };
      await Promise.race([
        Promise.all([...textures].map(waitForImage)),
        new Promise((resolve) => setTimeout(resolve, 1_200)),
      ]);
      if (disposed || cache.get(variant.architecture) !== build) return null;
      // Upload one decoded texture per frame. A cold pack can reference twelve
      // images; batching them into its first visible draw caused a 200-500 ms
      // ANGLE frame on constrained devices.
      for (const texture of textures) {
        renderer.initTexture(texture);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (disposed || cache.get(variant.architecture) !== build) return null;
      }
      const priorVisible = build.root.visible;
      build.root.visible = true;
      try {
        await Promise.race([
          renderer.compileAsync(build.root, camera, scene).catch(() => undefined),
          new Promise<void>((resolve) => setTimeout(resolve, 900)),
        ]);
      } finally {
        build.root.visible = priorVisible;
      }
      if (disposed || cache.get(variant.architecture) !== build) return null;
      warmedArchitectures.add(variant.architecture);
      publish();
      return build;
    })().finally(() => warmPending.delete(variant.architecture));
    warmPending.set(variant.architecture, task);
    return task;
  };

  const prepare = async (variant: GarageVariant): Promise<GarageEnvironmentBuild | null> => {
    const existing = preparationPending.get(variant.architecture);
    if (existing) return existing;
    const task = Promise.resolve()
      .then(() => ensure(variant))
      .then((build) => warmForReveal(variant, build))
      .finally(() => {
        preparationPending.delete(variant.architecture);
        trim();
      });
    preparationPending.set(variant.architecture, task);
    return task;
  };

  function setVariant(variant: GarageVariant): GarageArchitectureStats {
    selected = variant;
    const generation = ++selectionGeneration;
    const cached = cache.get(variant.architecture);
    if (cached && warmedArchitectures.has(variant.architecture)) {
      lastBuildMs = 0;
      show(variant, cached);
    } else {
      publish();
      // UI selection can change several times in one task (keyboard repeat,
      // rapid cards, automated convergence). Start only the final requested
      // pack instead of synchronously constructing every stale intermediate.
      queueMicrotask(() => {
        if (!disposed && generation === selectionGeneration
            && selected?.architecture === variant.architecture) {
          void prepare(variant).then((build) => {
            if (build && !disposed && generation === selectionGeneration
                && selected?.architecture === variant.architecture) show(variant, build);
          });
        }
      });
    }
    return collectStats();
  }

  return {
    group,
    setVariant,
    async prepareSelector(): Promise<void> {
      await getEnvironmentKit();
    },
    prepareVariant(variant: GarageVariant): Promise<GarageArchitectureStats> {
      return prepare(variant).then(() => collectStats());
    },
    stats: collectStats,
    async whenReady(): Promise<GarageArchitectureStats> {
      const target = selected;
      if (target) {
        const build = await prepare(target);
        if (build && selected === target) show(target, build);
      }
      return collectStats();
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const build of cache.values()) build.dispose();
      cache.clear();
      pending.clear();
      warmPending.clear();
      preparationPending.clear();
      active = null;
      assets?.dispose();
      assets = null;
      group.clear();
    },
  };
}
