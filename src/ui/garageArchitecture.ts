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
  horizonStyle: 'flat' | 'rolling' | 'urban' | 'coastal' | 'alpine' | 'mesa' | 'dune' | 'none';
  horizonMaxHeightM: number;
  /** The horizon's largest elevation angle from the opening camera (deg). */
  horizonMaxElevationDeg: number;
  /** The map skyline's landmarks (type, name, compass bearing, distance, ring radius), or null for the biome backdrop. */
  skylineLandmarks: ReadonlyArray<{ readonly type: string; readonly name: string | null; readonly azDeg: number; readonly distM: number;
    readonly ringRadiusM: number; readonly elevationDeg: number }> | null;
  builtHorizonMassTopM: number;
  builtHorizonAccentTopM: number;
  /** The named landmarks of the pack's built skyline (garage r9, garageSkylineKit.ts). */
  kitSkylineLandmarks: readonly string[];
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
  approachTerrainGraded: boolean;
  approachMaxGrade: number;
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
  /** The garage r9 kit's receipt for the selected pack (pieces, triangles, cranes, displays), or null. */
  kit: GarageKitStats | null;
}

/** The kit receipt as the architecture stats publish it (garageKitPlacement.ts builds it). */
interface GarageKitStats {
  readonly kitPieces: number;
  readonly kitTriangles: number;
  readonly displayTriangles: number;
  readonly decalTriangles: number;
  readonly atmosphereTriangles: number;
  readonly cranes: ReadonlyArray<{ readonly kind: string; readonly atWork: boolean; readonly load: string | null }>;
  readonly brandPieces: number;
  readonly tankImages: number;
  readonly stations: number;
  readonly stationMonitors: number;
  readonly nameboards: number;
  readonly displayRects: readonly string[];
  readonly slideshow: { readonly position: readonly number[]; readonly yaw: number; readonly width: number; readonly height: number } | null;
}

const CACHE_LIMIT = 2;

type GarageArchitectureKey = GarageVariant['architecture'];

/**
 * 2026-11-02 audit R5: a scene pack's one phase. building: its kit, prepare and bake run. attached: built, hidden under
 * the group, its textures not warmed. warming: its textures upload a frame at a time. warmed: ready to show (the shown
 * pack is always a warmed one). retired: disposed, and gone from the controller.
 */
export type GaragePackPhase = 'building' | 'attached' | 'warming' | 'warmed' | 'retired';

/** Each phase's allowed next phases (the transition function refuses any other move). */
export const GARAGE_PACK_MOVES: Readonly<Record<GaragePackPhase, readonly GaragePackPhase[]>> = Object.freeze({
  building: ['attached', 'warmed', 'retired'],
  attached: ['warming', 'warmed', 'retired'],
  // back to attached: a cancelled prewarm, or a context lost mid-warm
  warming: ['warmed', 'attached', 'retired'],
  // back to attached: the renderer's warm state was reset (a lost WebGL context)
  warmed: ['attached', 'retired'],
  retired: [],
});

interface GaragePackRecord {
  readonly key: GarageArchitectureKey;
  phase: GaragePackPhase;
  build: GarageEnvironmentBuild | null;
  /** The step in flight (the build or the warm), shared by every caller asking for this pack. */
  promise: Promise<GarageEnvironmentBuild | null> | null;
  /** Only a prewarm has asked for it: a newer prewarm or a selection elsewhere may cancel it. */
  speculative: boolean;
  cancelled: boolean;
  /** Callers between its build and its reveal (trim never evicts it under them). */
  holds: number;
}
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
    case 'dune':
      return value;
    default:
      return 'none';
  }
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
    horizonMaxElevationDeg: 0,
    skylineLandmarks: null,
    builtHorizonMassTopM: 0,
    builtHorizonAccentTopM: 0,
    kitSkylineLandmarks: [],
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
    approachTerrainGraded: true,
    approachMaxGrade: 0,
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
    kit: null,
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

  // 2026-11-02 audit R5: one record per scene pack (its phase, its build, its step in flight) and one transition
  // function, instead of four promise maps, two sets, a WeakSet and a seven-way readiness inference. The map's order is
  // the LRU (touch moves a record to its end).
  const packs = new Map<GarageArchitectureKey, GaragePackRecord>();
  let assets: GarageEnvironmentAssetLibrary | null = null;
  // the shown pack: always a warmed record
  let active: GaragePackRecord | null = null;
  let selected: GarageVariant | null = null;
  let lastBuildMs = 0;
  let environmentKitPromise: ReturnType<typeof loadEnvironmentKit> | null = null;
  let selectionGeneration = 0;
  // Renderer-lifetime upload latch, replaced (not cleared) when the WebGL context is lost: a restored context holds
  // none of these uploads. `rendererEpoch` lets a warm in flight across a loss land renewable instead of warmed.
  let initializedTextures = new WeakSet<THREE.Texture>();
  let rendererEpoch = 0;
  let disposed = false;

  // The one writer of a record's phase. A move the table does not allow is refused; retiring disposes the build and
  // drops the record, so "cached but retired" cannot exist.
  const advance = (record: GaragePackRecord, next: GaragePackPhase): boolean => {
    if (!GARAGE_PACK_MOVES[record.phase].includes(next)) return false;
    record.phase = next;
    if (next === 'retired') {
      if (packs.get(record.key) === record) packs.delete(record.key);
      if (active === record) active = null;
      record.promise = null;
      record.build?.dispose();
    }
    return true;
  };
  const current = (record: GaragePackRecord): boolean => !disposed && packs.get(record.key) === record;
  const isCurrentSelection = (generation: number, variant: GarageVariant): boolean => !disposed
    && generation === selectionGeneration && selected?.architecture === variant.architecture;
  const settleStep = (record: GaragePackRecord, task: Promise<GarageEnvironmentBuild | null>): void => {
    const clear = (): void => { if (record.promise === task) record.promise = null; };
    task.then(clear, clear);
  };
  // A hover prewarm is the only caller that may be cancelled: a newer prewarm or a selection elsewhere stops it at its
  // next checkpoint (before the bake, between texture uploads), so N hovered cards no longer cost N bakes.
  const cancelPrewarms = (keep: GarageArchitectureKey): void => {
    for (const record of packs.values()) {
      if (record.speculative && record.key !== keep && record.key !== selected?.architecture
        && (record.phase === 'building' || record.phase === 'warming')) record.cancelled = true;
    }
  };

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

  const touch = (record: GaragePackRecord): void => {
    packs.delete(record.key);
    packs.set(record.key, record);
  };

  const trim = (): void => {
    while (packs.size > CACHE_LIMIT) {
      const oldest = [...packs.values()].find((record) => (
        record !== active
        // A selected build can finish its preparation promise one microtask
        // before the caller presents it. Never let a concurrent selector
        // prewarm evict that handoff target in the gap.
        && record.key !== selected?.architecture
        && record.phase !== 'building'
        && record.phase !== 'warming'
        && record.holds === 0
      ));
      if (!oldest) return;
      advance(oldest, 'retired');
    }
  };

  const builtPacks = (): number => {
    let count = 0;
    for (const record of packs.values()) if (record.build) count += 1;
    return count;
  };


  const collectStats = (): GarageArchitectureStats => {
    const textureStats = assets?.diagnostics() || { residentSets: 0, referencedSets: 0 };
    const record = selected ? packs.get(selected.architecture) ?? null : null;
    const selectedBuild = record?.build ?? null;
    // ready is the selected record's own phase: warmed, shown, and the build's own completion flag
    const selectedReady = !!record && !!selectedBuild && active === record && record.phase === 'warmed'
      && selectedBuild.root.userData.ready === true;
    const selectedPresented = selectedBuildIsPresented(
      selected, selectedBuild, group, selectedReady,
    );
    const data = selectedReady && selectedBuild ? selectedBuild.root.userData : {};
    return {
      key: selected?.architecture || 'field_shed',
      mapId: selected?.mapId || 'verdant',
      mode: data.mode === 'verdant-workshop'
        ? 'verdant-workshop' : 'garage-environment',
      signature: textStat(data.signature),
      objects: numericStat(data.objects),
      drawCalls: drawCallStat(data.drawCalls, data.objects),
      triangles: numericStat(data.triangles),
      cached: builtPacks(),
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
      horizonMaxElevationDeg: numericStat(data.horizonMaxElevationDeg),
      skylineLandmarks: Array.isArray(data.skylineLandmarks) ? data.skylineLandmarks as GarageArchitectureStats['skylineLandmarks'] : null,
      builtHorizonMassTopM: numericStat(data.builtHorizonMassTopM),
      builtHorizonAccentTopM: numericStat(data.builtHorizonAccentTopM),
      kitSkylineLandmarks: Array.isArray(data.kitSkylineLandmarks) ? data.kitSkylineLandmarks as string[] : [],
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
      approachTerrainGraded: data.approachTerrainGraded === true,
      approachMaxGrade: numericStat(data.approachMaxGrade),
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
      outdoorWarmReady: selected?.architecture === 'field_shed' || record?.phase === 'warmed',
      lastBuildMs,
      kit: (data.kit as GarageKitStats | null | undefined) ?? null,
    };
  };

  const publish = (): GarageArchitectureStats => {
    const stats = collectStats();
    Object.assign(group.userData, stats);
    return stats;
  };

  const show = (variant: GarageVariant, record: GaragePackRecord): boolean => {
    const build = record.build;
    if (!build || !current(record) || record.phase !== 'warmed') return false;
    if (active && active !== record && active.build) active.build.root.visible = false;
    active = record;
    build.root.visible = true;
    build.root.userData.architectureKey = variant.architecture;
    build.root.userData.mapId = variant.mapId;
    touch(record);
    trim();
    publish();
    requestRender();
    return true;
  };

  const attach = (
    variant: GarageVariant,
    record: GaragePackRecord,
    build: GarageEnvironmentBuild,
  ): GarageEnvironmentBuild | null => {
    if (!current(record) || record.phase !== 'building') {
      build.dispose();
      return null;
    }
    build.root.userData.architectureKey = variant.architecture;
    build.root.userData.mapId = variant.mapId;
    build.root.visible = false;
    group.add(build.root);
    record.build = build;
    // field_shed has nothing to warm: it attaches ready to show
    const attached: GaragePackPhase = variant.architecture === 'field_shed' ? 'warmed' : 'attached';
    advance(record, attached);
    touch(record);
    trim();
    if (selected?.architecture === variant.architecture && attached === 'warmed') show(variant, record);
    return current(record) ? build : null;
  };

  const ensure = (variant: GarageVariant, speculative: boolean): Promise<GarageEnvironmentBuild | null> => {
    const existing = packs.get(variant.architecture);
    if (existing) {
      // a selection takes over a prewarm of the same pack: it is no longer cancellable
      if (!speculative) { existing.speculative = false; existing.cancelled = false; }
      if (existing.phase === 'building' && existing.promise) return existing.promise;
      return Promise.resolve(existing.build);
    }
    const record: GaragePackRecord = {
      key: variant.architecture, phase: 'building', build: null, promise: null, speculative, cancelled: false, holds: 0,
    };
    packs.set(record.key, record);
    const stillWanted = (): boolean => current(record) && !record.cancelled;
    const task = (variant.architecture === 'field_shed'
      ? Promise.resolve(buildVerdantWorkshopOwner())
      : getEnvironmentKit().then(async (kit) => {
      if (!stillWanted()) return null;
      const library = ensureAssets(kit);
      // its prepared pieces and skyline stay cached until its bake, however many Garages prepare at once
      const release = kit.pinGarageEnvironmentCaches(variant);
      try {
        await kit.prepareGarageEnvironmentAssets(library, variant);
        // a cancelled prewarm (or a disposed controller) skips the synchronous bake, the switch's long task
        if (!stillWanted()) return null;
        const startedAt = performance.now();
        const build = kit.buildGarageEnvironment(engineCtx, library, variant, requestRender);
        lastBuildMs = performance.now() - startedAt;
        return build;
      } finally {
        release();
      }
    })).then((build) => {
      if (build) return attach(variant, record, build);
      if (current(record)) advance(record, 'retired');
      return null;
    }, (error) => {
      // a failed load or build leaves no record behind: the next request starts over
      if (current(record)) advance(record, 'retired');
      throw error;
    });
    record.promise = task;
    settleStep(record, task);
    return task;
  };

  const warmForReveal = (record: GaragePackRecord): Promise<GarageEnvironmentBuild | null> => {
    if (!current(record) || !record.build) return Promise.resolve(null);
    if (record.phase === 'warmed') return Promise.resolve(record.build);
    if (record.phase === 'warming' && record.promise) return record.promise;
    if (!advance(record, 'warming')) return Promise.resolve(null);
    const build = record.build;
    const epoch = rendererEpoch;
    const live = (): boolean => current(record) && record.phase === 'warming';
    const task = (async () => {
      const { renderer } = engineCtx;
      if (!renderer || typeof document === 'undefined') {
        advance(record, 'warmed');
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
      if (!live()) return null;
      // Upload each shared texture exactly once. Rebuilt LRU packs reference
      // the same library objects, so reinitializing all twelve images on every
      // switch only stretched a cheap 8-15 ms geometry build across hundreds
      // of milliseconds of redundant presentation frames.
      for (const texture of textures) {
        // a cancelled prewarm stops between uploads; it stays built, and a later request warms it
        if (record.cancelled) { advance(record, 'attached'); return null; }
        if (initializedTextures.has(texture)) continue;
        // (2026-11-02 audit R5) only an upload is latched: a loader image that missed the 600 ms race has nothing to
        // upload yet (three uploads only a texture whose version moved), and latching it skipped its warm for good
        if (texture.version === 0) continue;
        renderer.initTexture(texture);
        initializedTextures.add(texture);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (!live()) return null;
      }
      // garageStage submits exact opaque, transparent, instanced, alpha-test,
      // vertex-color, and CSM program seeds during the covered Verdant boot.
      // compileAsync on every destination never resolved promptly on ANGLE,
      // so the old race timeout added a guaranteed ~900 ms to every switch
      // without compiling a program shape that had not already been seeded.
      if (!live()) return null;
      // a context lost during the warm took its uploads with it: the pack stays renewable
      if (epoch !== rendererEpoch) { advance(record, 'attached'); return null; }
      advance(record, 'warmed');
      publish();
      return build;
    })();
    record.promise = task;
    settleStep(record, task);
    return task;
  };

  const prepare = async (variant: GarageVariant, speculative = false): Promise<GarageEnvironmentBuild | null> => {
    if (speculative) cancelPrewarms(variant.architecture);
    const building = ensure(variant, speculative);
    // held from the request to the reveal: the cache trim never evicts a pack its caller is about to warm or show
    const held = packs.get(variant.architecture);
    if (held) held.holds += 1;
    try {
      const build = await building;
      const record = packs.get(variant.architecture);
      if (!build || !record || record.build !== build) return null;
      return await warmForReveal(record);
    } finally {
      if (held) held.holds -= 1;
      trim();
    }
  };

  /**
   * The WebGL context was lost: every upload the latches record is gone. Every cached pack but the shown one (the
   * covered GPU restore re-uploads the visible Garage) warms again before its next reveal.
   */
  const resetRendererWarmState = (): void => {
    rendererEpoch += 1;
    initializedTextures = new WeakSet<THREE.Texture>();
    for (const record of packs.values()) {
      if (record !== active && record.phase === 'warmed' && record.key !== 'field_shed') advance(record, 'attached');
    }
    publish();
  };
  const canvas = engineCtx.renderer?.domElement;
  const onContextLost = (): void => { if (!disposed) resetRendererWarmState(); };
  if (typeof canvas?.addEventListener === 'function') canvas.addEventListener('webglcontextlost', onContextLost);

  function setVariant(variant: GarageVariant): GarageArchitectureStats {
    selected = variant;
    const generation = ++selectionGeneration;
    cancelPrewarms(variant.architecture);
    const record = packs.get(variant.architecture);
    const shown = !!record && record.phase === 'warmed' && show(variant, record);
    if (shown) {
      lastBuildMs = 0;
    } else {
      publish();
      // UI selection can change several times in one task (keyboard repeat,
      // rapid cards, automated convergence). Start only the final requested
      // pack instead of synchronously constructing every stale intermediate.
      queueMicrotask(() => {
        if (!isCurrentSelection(generation, variant)) return;
        void prepare(variant).then((build) => {
          const ready = packs.get(variant.architecture);
          if (build && ready && isCurrentSelection(generation, variant)) show(variant, ready);
        }).catch(() => {
          // The stage owns bounded retry/fallback presentation. Keep this
          // background convenience path from turning the same recoverable
          // load failure into an unhandled rejection.
          if (!disposed && generation === selectionGeneration) publish();
        });
      });
    }
    return collectStats();
  }

  return {
    group,
    setVariant,
    resetRendererWarmState,
    async prepareSelector(): Promise<void> {
      await getEnvironmentKit();
    },
    prepareVariant(variant: GarageVariant): Promise<GarageArchitectureStats> {
      return prepare(variant, true).then(() => collectStats());
    },
    stats: collectStats,
    /** The pack records' phases, oldest first (diagnostics and receipts). */
    packPhases: (): Array<{ key: GarageArchitectureKey; phase: GaragePackPhase }> => (
      [...packs.values()].map((record) => ({ key: record.key, phase: record.phase }))),
    async whenReady(): Promise<GarageArchitectureStats> {
      // the same staleness rule as setVariant's reveal: the selection this call started under must still stand
      const target = selected;
      const generation = selectionGeneration;
      if (target) {
        const build = await prepare(target);
        const record = packs.get(target.architecture);
        if (build && record && isCurrentSelection(generation, target)) show(target, record);
      }
      return collectStats();
    },
    dispose() {
      disposed = true;
      if (typeof canvas?.removeEventListener === 'function') canvas.removeEventListener('webglcontextlost', onContextLost);
      group.removeFromParent();
      for (const record of [...packs.values()]) advance(record, 'retired');
      packs.clear();
      active = null;
      assets?.dispose();
      assets = null;
      group.clear();
    },
  };
}
