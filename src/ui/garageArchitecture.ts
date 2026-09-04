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
  presented: boolean;
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
  wrecks: number;
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
  collisionAuditedStructures: number;
  collisionFootprints: number;
  collisionEnvelopeFill: number;
  openCollisionMaxFill: number;
  structurePerimeterSectors: number;
  treeTrunkMinRadialSegments: number;
  treeTrunksRooted: boolean;
  structureUnsupportedParts: number;
  maxStructureConnectionGapM: number;
  looseParts: number;
  railSegments: number;
  serviceVehicles: number;
  placementZones: number;
  openingViewFrames: number;
  structuralConnections: number;
  unsupportedParts: number;
  heavyLiftSystems: number;
  operationalMachines: number;
  factoryProcessZones: number;
  elevatedAccessSystems: number;
  secureStorageSystems: number;
  environmentSpecificAssemblies: number;
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
const TEXTURE_READY_TIMEOUT_MS = 600;
const loadEnvironmentKit = () => import('./garageEnvironmentKit.ts');
type GarageEnvironmentKitLoader = typeof loadEnvironmentKit;

function numericStat(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function textStat(value: string | null | undefined): string {
  return String(value || '');
}

function listStat<T>(value: readonly T[] | null | undefined): readonly T[] {
  return value || [];
}

function nullableStat<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function drawCallStat(
  drawCalls: number | null | undefined,
  objects: number | null | undefined,
): number {
  return numericStat(drawCalls) || numericStat(objects);
}

function treeDetailTierStat(value: string | null | undefined): GarageArchitectureStats['treeDetailTier'] {
  return value === 'battlefield-near' || value === 'battlefield-far' ? value : 'none';
}

function horizonStyleStat(value: string | null | undefined): GarageArchitectureStats['horizonStyle'] {
  switch (value) {
    case 'flat':
    case 'rolling':
    case 'urban':
    case 'coastal':
    case 'alpine':
    case 'mesa':
      return value;
    default:
      return 'none';
  }
}

function selectedBuildIsReady(
  selected: GarageVariant | null,
  selectedBuild: GarageEnvironmentBuild | null | undefined,
  active: GarageEnvironmentBuild | null,
  group: THREE.Group,
  retiredBuilds: WeakSet<GarageEnvironmentBuild>,
): selectedBuild is GarageEnvironmentBuild {
  return !!selected
    && !!selectedBuild
    && active === selectedBuild
    && active.root === selectedBuild.root
    && selectedBuild.root.parent === group
    && !retiredBuilds.has(selectedBuild)
    && selectedBuild.root.userData.architectureKey === selected.architecture
    && selectedBuild.root.userData.ready === true;
}

function selectedBuildIsPresented(
  selected: GarageVariant | null,
  selectedBuild: GarageEnvironmentBuild | null | undefined,
  group: THREE.Group,
  ready: boolean,
): boolean {
  return ready && !!selectedBuild && (
    selected?.architecture === 'field_shed'
    || (group.visible && selectedBuild.root.visible && selectedBuild.root.children.length > 0)
  );
}

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
    collisionAuditedStructures: 1,
    collisionFootprints: 12,
    collisionEnvelopeFill: 0.68,
    openCollisionMaxFill: 0.68,
    structurePerimeterSectors: 4,
    treeTrunkMinRadialSegments: 0,
    treeTrunksRooted: false,
    structureUnsupportedParts: 0,
    maxStructureConnectionGapM: 0,
    looseParts: 0,
    railSegments: 0,
    placementZones: 4,
    openingViewFrames: 0,
    structuralConnections: 80,
    unsupportedParts: 0,
    heavyLiftSystems: 3,
    operationalMachines: 7,
    factoryProcessZones: 5,
    elevatedAccessSystems: 4,
    secureStorageSystems: 2,
    environmentSpecificAssemblies: 10,
    servicePurposeTags: Object.freeze([
      'heavy-lift', 'welding', 'component-rebuild', 'rollover-teardown',
      'enclosed-workshop', 'plate-preparation', 'elevated-inspection',
      'secured-parts-storage',
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
  loadKit: GarageEnvironmentKitLoader = loadEnvironmentKit,
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
  const initializedTextures = new WeakSet<THREE.Texture>();
  const retiredBuilds = new WeakSet<GarageEnvironmentBuild>();
  let disposed = false;

  const getEnvironmentKit = (): ReturnType<GarageEnvironmentKitLoader> => {
    if (!environmentKitPromise) {
      const request = loadKit();
      const retryable = request.catch((error) => {
        // A transient chunk/network failure must not poison every subsequent
        // Garage selection for the lifetime of the page.
        if (environmentKitPromise === retryable) environmentKitPromise = null;
        throw error;
      });
      environmentKitPromise = retryable;
    }
    return environmentKitPromise;
  };

  const ensureAssets = (
    kit: Awaited<ReturnType<typeof loadEnvironmentKit>>,
  ): GarageEnvironmentAssetLibrary => {
    if (!assets) {
      assets = kit.createGarageEnvironmentAssetLibrary(engineCtx);
      registerRetainedObject3DResources(group, { textures: assets.retainedTextures() });
      // The complete Garage texture library is only ~1 MB compressed and is
      // requested only after explicit environment intent. Start all nine
      // surface pairs together so later destinations never pay a serial
      // network/decode round trip while the selector is already closed.
      assets.warmAll(requestRender);
    }
    return assets;
  };

  const touch = (key: GarageVariant['architecture'], build: GarageEnvironmentBuild): void => {
    cache.delete(key);
    cache.set(key, build);
  };

  const retire = (
    key: GarageVariant['architecture'],
    build: GarageEnvironmentBuild,
  ): void => {
    if (cache.get(key) === build) cache.delete(key);
    warmedArchitectures.delete(key);
    if (active === build) active = null;
    retiredBuilds.add(build);
    build.dispose();
  };

  const trim = (): void => {
    while (cache.size > CACHE_LIMIT) {
      const oldest = [...cache.entries()].find(([key, build]) => (
        build !== active
        // A selected build can finish its preparation promise one microtask
        // before the caller presents it. Never let a concurrent selector
        // prewarm evict that handoff target in the gap.
        && key !== selected?.architecture
        && !pending.has(key)
        && !warmPending.has(key)
        && !preparationPending.has(key)
      ));
      if (!oldest) return;
      const [key, build] = oldest;
      retire(key, build);
    }
  };

  const collectStats = (): GarageArchitectureStats => {
    const textureStats = assets?.diagnostics() || { residentSets: 0, referencedSets: 0 };
    const selectedBuild = selected ? cache.get(selected.architecture) : null;
    const selectedReady = selectedBuildIsReady(
      selected, selectedBuild, active, group, retiredBuilds,
    );
    const selectedPresented = selectedBuildIsPresented(
      selected, selectedBuild, group, selectedReady,
    );
    const data = selectedReady ? selectedBuild.root.userData : {};
    return {
      key: selected?.architecture || 'field_shed',
      mapId: selected?.mapId || 'verdant',
      mode: data.mode === 'verdant-workshop'
        ? 'verdant-workshop' : 'garage-environment',
      signature: textStat(data.signature),
      objects: numericStat(data.objects),
      drawCalls: drawCallStat(data.drawCalls, data.objects),
      triangles: numericStat(data.triangles),
      cached: cache.size,
      cacheLimit: CACHE_LIMIT,
      residentTextureSets: textureStats.residentSets,
      referencedTextureSets: textureStats.referencedSets,
      enclosingSurfaces: numericStat(data.enclosingSurfaces),
      ready: selectedReady,
      presented: selectedPresented,
      source: data.source === 'verdant-workshop'
        ? 'verdant-workshop' : 'authentic-garage-scene-pack',
      sourceBeat: textStat(data.sourceBeat),
      sourceStructure: textStat(data.sourceStructure),
      sourceLandmarkLocal: nullableStat(data.sourceLandmarkLocal),
      distinctiveElements: listStat<string>(data.distinctiveElements),
      landmarkHeightM: numericStat(data.landmarkHeightM),
      serviceFrame: textStat(data.serviceFrame),
      terrainProfile: textStat(data.terrainProfile),
      terrainSourceAnchor: nullableStat(data.terrainSourceAnchor),
      terrainVertices: numericStat(data.terrainVertices),
      textureSets: listStat<string>(data.textureSets),
      treeSpecies: listStat<string>(data.treeSpecies),
      trees: numericStat(data.trees),
      treeDetailTier: treeDetailTierStat(data.treeDetailTier),
      backdropLayers: numericStat(data.backdropLayers),
      horizonStyle: horizonStyleStat(data.horizonStyle),
      horizonMaxHeightM: numericStat(data.horizonMaxHeightM),
      groundCover: numericStat(data.groundCover),
      structures: numericStat(data.structures),
      wrecks: numericStat(data.wrecks),
      facilityProps: numericStat(data.facilityProps),
      facilityStations: numericStat(data.facilityStations),
      approachLabel: textStat(data.approachLabel),
      approachStyle: textStat(data.approachStyle),
      approachSegments: numericStat(data.approachSegments),
      approachDetails: numericStat(data.approachDetails),
      approachConnected: data.approachConnected === true,
      approachGroundErrorM: numericStat(data.approachGroundErrorM),
      connectedExteriorParts: numericStat(data.connectedExteriorParts),
      connectedExteriorBuildings: numericStat(data.connectedExteriorBuildings),
      maxExteriorSupportGapM: numericStat(data.maxExteriorSupportGapM),
      collisionAuditedStructures: numericStat(data.collisionAuditedStructures),
      collisionFootprints: numericStat(data.collisionFootprints),
      collisionEnvelopeFill: numericStat(data.collisionEnvelopeFill),
      openCollisionMaxFill: numericStat(data.openCollisionMaxFill),
      structurePerimeterSectors: numericStat(data.structurePerimeterSectors),
      treeTrunkMinRadialSegments: numericStat(data.treeTrunkMinRadialSegments),
      treeTrunksRooted: data.treeTrunksRooted === true,
      structureUnsupportedParts: numericStat(data.structureUnsupportedParts),
      maxStructureConnectionGapM: numericStat(data.maxStructureConnectionGapM),
      looseParts: numericStat(data.looseParts),
      railSegments: numericStat(data.railSegments),
      serviceVehicles: numericStat(data.serviceVehicles),
      placementZones: numericStat(data.placementZones),
      openingViewFrames: numericStat(data.openingViewFrames),
      structuralConnections: numericStat(data.structuralConnections),
      unsupportedParts: numericStat(data.unsupportedParts),
      heavyLiftSystems: numericStat(data.heavyLiftSystems),
      operationalMachines: numericStat(data.operationalMachines),
      factoryProcessZones: numericStat(data.factoryProcessZones),
      elevatedAccessSystems: numericStat(data.elevatedAccessSystems),
      secureStorageSystems: numericStat(data.secureStorageSystems),
      environmentSpecificAssemblies: numericStat(data.environmentSpecificAssemblies),
      servicePurposeTags: listStat<string>(data.servicePurposeTags),
      facilityMaterialClasses: numericStat(data.facilityMaterialClasses),
      openingSightlineIntrusions: numericStat(data.openingSightlineIntrusions),
      placementOverlaps: numericStat(data.placementOverlaps),
      maxGroundContactErrorM: numericStat(data.maxGroundContactErrorM),
      platformGroundClearanceM: numericStat(data.platformGroundClearanceM),
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

  const show = (variant: GarageVariant, build: GarageEnvironmentBuild): boolean => {
    if (retiredBuilds.has(build)
      || cache.get(variant.architecture) !== build
      || build.root.parent !== group) {
      return false;
    }
    if (active && active !== build) active.root.visible = false;
    active = build;
    active.root.visible = true;
    active.root.userData.architectureKey = variant.architecture;
    active.root.userData.mapId = variant.mapId;
    touch(variant.architecture, build);
    trim();
    publish();
    requestRender();
    return true;
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
      const { renderer } = engineCtx;
      if (!renderer || typeof document === 'undefined') {
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
      await Promise.race([
        build.texturesReady || Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, TEXTURE_READY_TIMEOUT_MS)),
      ]);
      if (disposed || cache.get(variant.architecture) !== build) return null;
      // Upload each shared texture exactly once. Rebuilt LRU packs reference
      // the same library objects, so reinitializing all twelve images on every
      // switch only stretched a cheap 8-15 ms geometry build across hundreds
      // of milliseconds of redundant presentation frames.
      for (const texture of textures) {
        if (initializedTextures.has(texture)) continue;
        renderer.initTexture(texture);
        initializedTextures.add(texture);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (disposed || cache.get(variant.architecture) !== build) return null;
      }
      // garageStage submits exact opaque, transparent, instanced, alpha-test,
      // vertex-color, and CSM program seeds during the covered Verdant boot.
      // compileAsync on every destination never resolved promptly on ANGLE,
      // so the old race timeout added a guaranteed ~900 ms to every switch
      // without compiling a program shape that had not already been seeded.
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
    const shown = !!cached
      && warmedArchitectures.has(variant.architecture)
      && show(variant, cached);
    if (shown) {
      lastBuildMs = 0;
    } else {
      if (cached && (retiredBuilds.has(cached) || cached.root.parent !== group)) {
        retire(variant.architecture, cached);
      }
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
          }).catch(() => {
            // The stage owns bounded retry/fallback presentation. Keep this
            // background convenience path from turning the same recoverable
            // load failure into an unhandled rejection.
            if (!disposed && generation === selectionGeneration) publish();
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
        if (build && selected === target && !show(target, build)) {
          // Defensive recovery for any future lifecycle path that retires a
          // build while an async caller still owns its completion value.
          const replacement = await ensure(target);
          if (replacement && selected === target) show(target, replacement);
        }
      }
      return collectStats();
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const build of cache.values()) {
        retiredBuilds.add(build);
        build.dispose();
      }
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
