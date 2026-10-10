import type { WaterDisturbance } from './shallowWater.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { createSourcedTextureState, type SourcedTextureResult, type SourcedTextureState } from './sourcedTextureReceipt.ts';
// src/world/map.ts — composes terrain meshes + vegetation + props into the World.
// Contract: docs/ARCHITECTURE.md §2.7 (World shape), §3.2 (layout rules).
// Which battlefield gets built is driven by a map config (src/world/maps/*):
// createMap(engineCtx, { mapId }) — any id from maps/index.ts MAP_IDS.

import * as THREE from 'three';
import {
  createHeightField,
  createHeightFieldAsync,
  buildTerrainMeshes,
  buildTerrainMeshesAsync,
  finishHorizonRingAsync,
  sampleSplatNoise,
} from './terrain.ts';
// The visual horizon installs the ring the terrain meshes are built with (horizonRingHook.ts).
import './maps/horizon.ts';
// Round 73 (2026-09-25): the tall-grass tier and the pressure field its blades bend to
import { createTallGrass, type TallGrass } from './tallGrass.ts';
import type { GroundDisturbance } from './groundPressure.ts';
import type { HeightField, TerrainMapConfig } from './terrain.ts';
import {
  createVegetation,
  createVegetationAsync,
} from './vegetation.ts';
import type { TreeObstacle } from './vegetation.ts';
import { bindHorizonForestImpostors } from './horizonForestImpostors.ts';
import type { HorizonPanoramaHandle } from './horizonPanorama.ts';
import {
  createProps,
  createPropsAsync,
  plannedSurfacePaints,
  preloadPropModels,
} from './props.ts';
import { createGroundLitter, groundLitterProfile, type GroundLitterConfig } from './groundLitter.ts';
import type { CrushableRecord } from './props.ts';
import type { BattlefieldMapConfig } from './maps/index.ts';
import { createGroundCoverClearance } from './groundCoverClearance.ts';
import { withGroundCoverHoles, type GroundCoverHole } from './sceneryPlan.ts';
import { clearShrubsFromSolids } from './shrubClearance.ts';
import { prepareSourcedTerrain } from './sourcedTextures.ts';
import { getDeviceTier } from '../engine/quality.ts';
import { startHorizonRingBuild } from './horizonRingPrefetch.ts';
import { supplyHorizonRing, withdrawHorizonRing } from './horizonRingHook.ts';
import { worldBuildConfig, type BuildMapConfig } from './worldBuildConfig.ts';
import { startPlannedWreckBakes } from './wreckBakePrefetch.ts';
import { startSurfacePaints } from './surfacePaintPrefetch.ts';
import {
  createObstacleGrid,
  nearestColliderHit,
  type ColliderRayHit,
  type CollisionRecord,
  type ObstacleQuery,
} from './collision.ts';
import {
  createStructureDamageSeam, patchStructureMaterialEntries, type StructureDamageSeam, type StructureMaterialInfo,
} from './structureDamageSeam.ts';
import { createStructureDamage } from '../sim/structureDamage.ts';
import { rubbleHeightFor, type TerrainDeformation } from '../sim/terrainDeformation.ts';
import { installTerrainCraterMesh } from './terrainCraterMesh.ts';
import { createGroundCoverCraters } from './groundCoverCraters.ts';

type EngineContext = Parameters<typeof buildTerrainMeshes>[1] &
  Parameters<typeof createVegetation>[1] &
  Parameters<typeof createProps>[1] & {
  scene: THREE.Scene;
  /** Releases a lit material from the cascaded-shadow setup (main.ts engine context). */
  releaseShadowMaterial?(material: THREE.Material): void;
};

interface WorldOptions {
  mapId?: string;
  seed?: number;
  /** Frontline Assault builds carve the trench system into the terrain. */
  terrainVariant?: 'assault-trenches';
}

interface WorldSlicingOptions {
  fineSlices?: boolean;
}

type WorldBuildProgress = (label: string, fraction: number) => Promise<void> | void;
type BuildSliceProgress = (completed: number, total: number) => Promise<void>;

interface SpawnLayoutPoint {
  x: number;
  z: number;
  yaw?: number;
}

interface LayoutDisc {
  x: number;
  z: number;
  r: number;
}

type WorldHeightField = HeightField;

interface TerrainUserData {
  sourcedTexturesReady?: Promise<SourcedTextureResult[]>;
  cancelSourcedTextures?(): void;
  streamingStats?: RuntimeValue;
  updateLOD(cameraPosition: THREE.Vector3): void;
  updateWater?(deltaSeconds: number, anchorX?: number, anchorZ?: number): void;
  disposeWater?(): void;
  resetWater?(): void;
  setWaterTime?(timeSeconds: number): void;
  setWaterDisturbances?(sources: readonly WaterDisturbance[]): void;
  warmStreaming?(cameraPosition: THREE.Vector3, maxJobs: number): number;
  /** Ground lane (2026-10-03): the vegetation's woods mask into the terrain material and onto the height field. */
  applyWoodsMask?(mask: Float32Array): void;
  [key: string]: RuntimeValue;
}

type TerrainRoot = ReturnType<typeof buildTerrainMeshes> & { userData: TerrainUserData };

function isTerrainRoot(root: ReturnType<typeof buildTerrainMeshes>): root is TerrainRoot {
  return typeof root.userData.updateLOD === 'function';
}

function requireTerrainRoot(root: ReturnType<typeof buildTerrainMeshes>): TerrainRoot {
  if (!isTerrainRoot(root)) {
    throw new TypeError('terrain root is missing its LOD update contract');
  }
  return root;
}

function isTreeObstacle(record: CollisionRecord): record is TreeObstacle {
  return Number.isInteger(record.treeIdx);
}

export interface ConcealmentDisc {
  x: number;
  z: number;
  r: number;
  add: number;
}

type VegetationRuntime = ReturnType<typeof createVegetation>;

interface MapFeatureRecord {
  x: number;
  z: number;
  [key: string]: RuntimeValue;
}

type PropsRuntime = ReturnType<typeof createProps>;

export interface WorldRayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  kind: 'terrain' | 'prop';
  record: CollisionRecord | null;
}

export interface WorldRuntime {
  mapId: string;
  /** Non-null for the assault-trenches build of this map; never reused for standard battles. */
  terrainVariant: 'assault-trenches' | null;
  /**
   * The device tier this world's placements were counted at (props environmentRichness, vegetation treeRichness): the
   * mobile tier places fewer props and trees, so its obstacle list is laid out otherwise than the desktop tier's — the
   * layout the multiplayer collision manifests are captured from (ghost-crunch lane, 2026-10-02).
   */
  layoutTier: 'mobile' | 'desktop';
  /** Release external callbacks at final eviction, not temporary dormancy. */
  dispose(): void;
  /** Readiness snapshot only; never performs streaming work. */
  getGrassWorkState: VegetationRuntime['getGrassWorkState'];
  /** (b17) The field walls' stone forms still to build near the camera (0 when every wanted cell has its stones):
   *  a readiness snapshot only, as the grass's. */
  getFieldWallWorkState(): { pending: number };
  config: BattlefieldMapConfig;
  heightField: WorldHeightField;
  minimapTextureState: SourcedTextureState;
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): WorldRayHit | null;
  getObstacles(): CollisionRecord[];
  getColliders(): CollisionRecord[];
  queryObstacles: ObstacleQuery;
  getConcealment(): ConcealmentDisc[];
  crushables: CrushableRecord[];
  crushProp(index: number, dx: number, dz: number, speedMetersPerSecond?: number): boolean;
  destructibles: RuntimeValue[];
  looseProps: RuntimeValue[];
  getLoosePropStats(): { total: number; active: number };
  tankWreckSpots: RuntimeValue[];
  utilityPolePlacements: RuntimeValue[];
  decorationGroundingReceipts: RuntimeValue[];
  crushObstacle(
    record: CollisionRecord | null | undefined,
    dx: number,
    dz: number,
    speedMetersPerSecond?: number,
    cause?: 'ram' | 'shell',
    /** `settled`: lay the prop at its final pose at once, no fall, no debris, no sound (state older than this viewer's view). */
    options?: { settled?: boolean },
  ): boolean;
  resetDestructibles(): void;
  /**
   * Step only the destruction's clock — props' falls, tosses and loose dressing, the felled trunks — by `dt` seconds
   * (2026-10-06: the Scene Studio's hulls crush what they overrun on its timeline, its world update held at dt 0).
   */
  advanceDestruction(dt: number): void;
  /** The felled trees' falls alone (the Studio: its props fall on their own clock, updateProps). */
  advanceToppledVegetation(dt: number): void;
  /**
   * Ground lane (2026-10-08, the FX lane's explosive marks): the cover inside `r` of (x, z) cleared for the rest of the
   * battle and the tall grass laid low in the ring out to 1.6 r — presentation only (no overlay stamp, no lift; the
   * crater law's presentation hole, groundCoverCraters.ts addHole). Call it once per mark; the battle's reset clears it.
   */
  clearCoverAt(x: number, z: number, r: number): void;
  /**
   * Destruction (docs/DESTRUCTION.md §16): a structure's damage seam by its group id — its anatomy (the sim's mound
   * filled in), where its parts are in the merged buckets, and its kit chain's stage builders — or null.
   */
  structureDamage(structureIdx: number): StructureDamageSeam | null;
  /**
   * Hand every props-bucket material (each batch's own clone included, and the depth material every bucket that casts
   * a structure's shadow draws its shadow with: info.role 'depth') to `patch` once, with the meshes drawing it; returns
   * how many. For the presentation's structure-state shader: call it before the warm so programs compile once, chain
   * any existing onBeforeCompile and extend customProgramCacheKey. Merged geometries that hold a structure part carry
   * `aDamage` (structureIdx + 1; 0 for anything else). Every bucket mesh and batch is in world space.
   */
  patchStructureMaterials(patch: (material: THREE.Material, info: StructureMaterialInfo) => void): number;
  /** The structure's seam `touchShadows()` by id (a no-op for an id the world does not know). */
  touchStructureShadows(structureIdx: number): void;
  /**
   * The battle's ground overlay (sim/terrainDeformation.ts: craters, rubble heaps) this world draws and drapes on —
   * the solo battle's own ground, or a network round's mirror (crater-render-spec §B). Bound per battle, null between;
   * the terrain's userData carries it too (`groundOverlay`) for the drawn ground to follow.
   */
  bindGroundOverlay(overlay: TerrainDeformation | null): void;
  /** The bound overlay, or null: what decals and dressing drape on (base + `offsetAt`). */
  groundOverlay(): TerrainDeformation | null;
  spawnPoints: {
    player: { pos: [number, number, number]; yaw?: number };
    enemies: Array<{ pos: [number, number, number]; yaw?: number }>;
  };
  getMinimapFeatures(): {
    roads: Array<Array<[number, number]>>;
    buildings: MapFeatureRecord[];
    tacticalBeats: MapFeatureRecord[];
    treeClusters: Array<{ x: number; z: number; r: number }>;
    waterOrSoft: LayoutDisc[];
  };
  update(
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    cameraForward?: THREE.Vector3 | null,
    focusPosition?: THREE.Vector3 | null,
  ): void;
  warmTerrainLookahead(cameraPosition: THREE.Vector3, maxJobs?: number): number;
  /** Round 77c: bake the vegetation's impostor atlas under cover (the activation / solo loading warm). */
  warmImpostors(): boolean;
  setWindTime(timeSeconds: number): void;
  /**
   * The props' own clock (hinge topples, loose bodies, pole LOD) advanced by `deltaSeconds`, as `update` does it. A frame
   * stepped without an update — the Studio's export steps, and its playback, whose update runs at dt 0 — calls this every
   * fixed step, or a prop felled in a clip never animates its fall (fix/studio-world-step, 2026-10-08).
   */
  updateProps(deltaSeconds: number, cameraPosition: THREE.Vector3): void;
  /**
   * The drawn ground follows what it is bound to now (fix/studio-world-step, 2026-10-08): the terrain's
   * `syncGroundOverlay` hook (a deformed ground's chunks, when a module installs one) and its `followGroundOverlay` hook
   * (the ground cover over them). `update` reaches the same through its LOD walk; a frame rendered without an update (the
   * Studio's export steps and captures) calls this, or a crater dug mid-clip never reaches the picture. O(1) when nothing
   * is new; a no-op on a world with no such hooks.
   */
  syncGround(): void;
  /** Water pass 6/7: the vehicles in the water this frame (footprint, heading, speed -> wake). No-op on maps without water. */
  setWaterDisturbances(sources: readonly WaterDisturbance[]): void;
  resetWater(): void;
  advanceWater(dt: number, anchorX: number, anchorZ: number): void;
  /** Round 73: every hull this frame (footprint, heading, speed) — the tall grass lies down under it. */
  setGroundDisturbances?(sources: readonly GroundDisturbance[]): void;
  setSniperFade(
    fraction: number,
    immediate?: boolean,
    fovDegrees?: number | null,
    aimDistanceMeters?: number | null,
  ): void;
  group: THREE.Group;
  _buildDetail?: { vegetation: RuntimeValue; terrain: RuntimeValue; props: RuntimeValue };
  /** Round 73: the tall-grass tier (diagnostics and the round's probes). */
  _tallGrass?: TallGrass;
}

const _pt = new THREE.Vector3();
const _bisA = new THREE.Vector3();

/**
 * Build the full battlefield world for a map config and add it to the scene.
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {{mapId?:string, seed?:number}} [opts] world options
 * @returns {object} World (ARCHITECTURE §2.7) + {mapId, config}
 */
export function createMap(
  engineContext: RuntimeValue,
  { mapId = 'verdant', seed = 1337, terrainVariant }: WorldOptions = {},
): WorldRuntime {
  const engineCtx = engineContext as EngineContext;
  const config: BuildMapConfig = worldBuildConfig(mapId, terrainVariant);
  const heightField = createHeightField(seed, config);
  const terrain = requireTerrainRoot(buildTerrainMeshes(heightField, engineCtx, config));
  const vegetation = createVegetation(heightField, engineCtx, 2001, config);
  const props = createProps(heightField, engineCtx, 2002, config, vegetation);
  return assembleWorld(engineCtx, config, heightField, terrain, vegetation, props);
}

/**
 * BOOT DEFERRAL: same world, built one subsystem per animation frame so a
 * loading bar can report real progress and keep animating instead of freezing
 * for the whole build. main.ts uses this for the pre-battle load; the
 * synchronous {@link createMap} stays the path for screenshot-contract map
 * switches (which must not span frames).
 *
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {{mapId?:string, seed?:number}} [opts] world options
 * @param {?function(string, number): (Promise<void>|void)} [onStep] called
 *   BEFORE each subsystem with (label, fractionComplete); await it to yield
 * @returns {Promise<object>} World (ARCHITECTURE §2.7) + {mapId, config}
 */
export async function createMapAsync(
  engineContext: RuntimeValue,
  { mapId = 'verdant', seed = 1337, terrainVariant }: WorldOptions = {},
  onStep: WorldBuildProgress | null = null,
  { fineSlices = false }: WorldSlicingOptions = {},
): Promise<WorldRuntime> {
  const engineCtx = engineContext as EngineContext;
  const config: BuildMapConfig = worldBuildConfig(mapId, terrainVariant);
  // Transfer/decompress the exact authored sandbag and utility-pole streams
  // while terrain and vegetation occupy the main thread. Previously their
  // 1.2 MB numeric JSON lived inside the map JavaScript chunk and had to be
  // parsed before even the height field could start.
  const propModelsReady = preloadPropModels();
  const terrainConfig: TerrainMapConfig = config;
  const terrainSources = prepareSourcedTerrain(config.id, terrainConfig.splat || {}, { worker: true });
  // (the time-to-battle lane, 2026-10-07) the map's planned wreck bakes start in their own worker now, beside the
  // terrain and the vegetation, instead of one by one inside the props build (wreckBakePrefetch.ts)
  const wreckPrefetch = seed === 1337 ? startPlannedWreckBakes(mapId, terrainVariant) : null;
  // (and the props build's fixed-input prints — the straw's, the dry-stone walls' — in the surface paint worker)
  const surfacePrefetch = typeof Worker === 'undefined' ? null : startSurfacePaints(plannedSurfacePaints(config));
  // (and the horizon ring's geometry pipeline in its own worker, supplied to the terrain build through the ring's hook and
  // taken after its chunks; a rematch on the same map takes the kept ring instead — horizonRingPrefetch.ts)
  const ringSource = startHorizonRingBuild({
    mapId, terrainVariant: terrainVariant ?? null, fieldSeed: seed, ringSeed: 1337, vista: getDeviceTier() !== 'mobile',
    debugColors: !!(globalThis as typeof globalThis & { __HORIZON_DEBUG?: boolean }).__HORIZON_DEBUG,
  });
  supplyHorizonRing(ringSource);
  let completed = false;
  try {
    const step = async (label: string, fraction: number): Promise<void> => {
      if (onStep) await onStep(label, fraction);
    };
    // perf-r3 (play-session probe): the old five-yield build left each
    // subsystem ATOMIC — 1.5-2.4 s tasks that pinned the loading bar (and
    // fused into a single ~29 s task on a loaded machine). Each subsystem now
    // drains its chunked twin, yielding through `step` after every slice so
    // the bar creeps THROUGH a subsystem instead of jumping between them.
    const sub = (label: string, f0: number, f1: number): BuildSliceProgress => (
      completed: number,
      total: number,
    ) => step(label, f0 + (f1 - f0) * Math.min(1, completed / Math.max(1, total)));
    await step('Surveying terrain', 0.0);
    const heightField = fineSlices
      ? await createHeightFieldAsync(seed, config, fraction => step('Surveying terrain', fraction * 0.34))
      : createHeightField(seed, config);
    await step('Building terrain meshes', 0.34);
    const terrain = requireTerrainRoot(await buildTerrainMeshesAsync(heightField, engineCtx, config,
      sub('Building terrain meshes', 0.34, 0.58), fineSlices, {
        // The deployment view gets exact near/mid detail and every other chunk
        // gets its exact visible coarse level. Missing levels grow one geometry
        // at a time as the camera approaches.
        // Heightfield/collision/spotting data remains complete and deterministic.
        streamFarLods: true,
        focus: heightField._layout.spawns.player,
      }, terrainSources));
    await step('Planting vegetation', 0.58);
    const vegetation = await createVegetationAsync(heightField, engineCtx, 2001, config,
      sub('Planting vegetation', 0.58, 0.82), fineSlices);
    await step('Placing structures', 0.82);
    const propModelsAwaitStart = performance.now();
    await propModelsReady;
    const propModelsAwaitEnd = performance.now();
    const props = await createPropsAsync(heightField, engineCtx, 2002, config,
      sub('Placing structures', 0.82, 0.96), fineSlices, vegetation, wreckPrefetch, surfacePrefetch);
    if (props._buildDetail) {
      const elapsedMs = propModelsAwaitEnd - propModelsAwaitStart;
      // Time at the consumer's await, not the overlapped archive transfer's
      // duration or CPU cost. All timestamps use the page performance clock.
      props._buildDetail.propModelsAwait = { count: 1, totalMs: elapsedMs, maxMs: elapsedMs,
        startMs: propModelsAwaitStart, endMs: propModelsAwaitEnd };
    }
    await step('Sealing the battlefield', 0.96);
    // (the time-to-battle lane, 2026-10-08) the horizon ring last: the worker started with this build has had the whole
    // build to answer (terrain.ts finishHorizonRingAsync: built here meanwhile if it has not); its source and timing for
    // the load probes, beside the terrain's streaming record
    await finishHorizonRingAsync(terrain, sub('Sealing the battlefield', 0.96, 0.99), fineSlices);
    terrain.userData.horizonRingLoad = ringSource.stats;
    const world = assembleWorld(engineCtx, config, heightField, terrain, vegetation, props);
    world._buildDetail = {
      vegetation: vegetation._buildDetail || null,
      terrain: terrain.userData.streamingStats || null,
      props: props._buildDetail || null,
    };
    completed = true;
    return world;
  } finally {
    // the planned wreck bakes nobody took (a cancelled build, a request the plan did not hold) and their worker go
    wreckPrefetch?.dispose();
    surfacePrefetch?.dispose();
    withdrawHorizonRing(ringSource);
    ringSource.dispose();
    if (!completed) {
      try { terrainSources.cancel?.(); } catch { /* preserve the original build failure */ }
    }
  }
}

/**
 * Wire built subsystems into the World facade and add it to the scene. Shared
 * by {@link createMap} and {@link createMapAsync} so both produce an identical
 * world object.
 * @returns {object} World (ARCHITECTURE §2.7)
 */
/**
 * The scenery lane (b14): the boulders' beds (props.ts buildRockBeds — the ground built up against each stone's foot)
 * draw with the battlefield's own terrain material, so their colour, grain and light are the ground's at that place.
 * The material is the one every terrain chunk draws (its layer means mark it); a world without it draws no beds. The
 * beds cast nothing and their geometry is world space.
 */
function bindRockBeds(terrain: TerrainRoot, propsGroup: THREE.Group): void {
  const beds = propsGroup.userData.rockBeds as THREE.BufferGeometry[] | undefined;
  if (!beds?.length) return;
  let ground: THREE.Material | null = null;
  terrain.traverse((object) => {
    const material = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh).material : null;
    if (!ground && material && !Array.isArray(material) && material.userData.layerMeans && material.userData.groundClock) ground = material;
  });
  if (!ground) return;
  for (const geometry of beds) {
    const mesh = new THREE.Mesh(geometry, ground);
    mesh.name = 'rock-beds';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    propsGroup.add(mesh);
  }
}

function assembleWorld(
  engineCtx: EngineContext,
  config: BuildMapConfig,
  heightField: WorldHeightField,
  terrain: TerrainRoot,
  vegetation: VegetationRuntime,
  props: PropsRuntime,
): WorldRuntime {
  const layout = heightField._layout;
  // ground lane (2026-10-03): the trees are placed — the terrain draws its forest floor under them and no field there,
  // and the ground tiers built below (the litter, the tall grass) read the same cover
  if (vegetation._woodsMask) terrain.userData.applyWoodsMask?.(vegetation._woodsMask);

  const group = new THREE.Group();
  group.name = 'world-' + config.id;
  group.add(terrain, vegetation.group, props.group);
  bindRockBeds(terrain, props.group);
  engineCtx.scene.add(group);
  // Round 77c: where the world baked an impostor atlas (desktop, a renderer) the horizon ring's forest over the red
  // line draws from it — the same trees under the same law at the rim's stature (horizonForestImpostors.ts); the
  // mobile tier and the receipts keep the ring's lobes.
  const ringForest = terrain.getObjectByName('horizon-forest');
  if (ringForest && vegetation._treeImpostors) {
    bindHorizonForestImpostors(ringForest, {
      library: vegetation._treeImpostors, rimMix: vegetation._rimMix, rimTreeHeightM: vegetation._rimTreeHeightM,
      rimTreeTint: vegetation._rimTreeTint,
      setupMaterial: (material, hook) => engineCtx.setupShadowMaterial?.(material, hook),
      releaseMaterial: (material) => engineCtx.releaseShadowMaterial?.(material),
    });
  }
  // the mountains lane (2026-10-03): the far horizon panorama bakes where the renderer is — under the loading cover with
  // the impostors (warmImpostors), else on the first update — and again after a GPU suspension (horizonPanorama.ts)
  const horizonPanorama = (terrain.getObjectByName('horizon-ring')?.userData.horizonPanorama ?? null) as HorizonPanoramaHandle | null;
  const panoramaRenderer = (engineCtx as { renderer?: THREE.WebGLRenderer }).renderer ?? null;
  let panoramaFailed = false;
  const bakePanorama = (): void => {
    if (!horizonPanorama || panoramaFailed || horizonPanorama.baked || !panoramaRenderer) return;
    try { horizonPanorama.ensureBaked(panoramaRenderer); } catch { panoramaFailed = true; }
  };
  // perf-governor r1 (discoverthreejs "matrixAutoUpdate = false for static
  // objects"): every world dynamic goes through instanceMatrix writes or
  // shader uniforms — no object-level transform under this group ever changes
  // after build (breaks/crushes zero-scale INSTANCES; the grass carpet
  // re-parks instances; wind is vertex-shader). Freeze the whole subtree so
  // the per-frame updateMatrixWorld walk stops recomposing hundreds of
  // static matrices.
  group.updateMatrixWorld(true);
  group.traverse((o) => { o.matrixAutoUpdate = false; });
  // Object3D.updateMatrixWorld still recursively visits every descendant even
  // when matrixAutoUpdate is false. This world owns thousands of immutable
  // nodes; all legitimate motion is expressed through instance buffers,
  // uniforms, geometry LOD swaps, and visibility flags. Its world matrices
  // were just finalized, so make the subtree an explicit traversal leaf.
  // getWorldPosition/updateWorldMatrix remains available for diagnostics and
  // no visual/simulation detail is removed.
  group.userData.matrixTraversalFrozen = true;
  group.updateMatrixWorld = () => {};

  const obstacles = [...props.obstacles, ...vegetation.treeObstacles];
  const colliders = [...props.colliders, ...vegetation.treeObstacles];
  // 2026-10-07 (the map-vehicles lane): the moored hulls stand in the water as a standing tank does, and lap it
  // through the same disturbance sources the vehicles feed (props.ts waterContacts); they follow the frame's own sources
  // (the vehicles keep the first slots), into one reused list, and stand from the first frame and after a reset
  const waterContacts = props.waterContacts ?? [];
  const waterSources: WaterDisturbance[] = [];
  const setWater = (sources: readonly WaterDisturbance[]): void => {
    if (!waterContacts.length) { terrain.userData.setWaterDisturbances?.(sources); return; }
    waterSources.length = 0;
    for (const source of sources) waterSources.push(source);
    for (const contact of waterContacts) waterSources.push(contact);
    terrain.userData.setWaterDisturbances?.(waterSources);
  };
  setWater([]);
  // Static spatial broad phases: movement queries only the handful of props
  // around a hull, and a shell/LOS ray only the cells spanned by its segment.
  // The narrow phase still uses the authored OBB/circle/convex footprint.
  const queryObstacles = createObstacleGrid(obstacles);
  const queryColliders = createObstacleGrid(colliders);
  // the scenery lane (2026-10-03): no grass, litter or tall grass grows up through a pavement's clints or a scree fan
  const groundCoverHoles = [
    ...((props.group.userData.scenery as { groundCoverHoles?: GroundCoverHole[] } | undefined)?.groundCoverHoles ?? []),
    // the regional-buildings lane (2026-10-03): nor through a kit house's yard (props.ts placeRegionalYards)
    ...((props.group.userData.regionalYardHoles as GroundCoverHole[] | undefined) ?? []),
    // the map-vehicles lane (2026-10-08): nor through the mud a landing's hauled-out boat lies in (props.ts)
    ...((props.group.userData.boatMudHoles as GroundCoverHole[] | undefined) ?? []),
  ];
  // the hitbox lane (2026-10-07): the stones' colliders are their own now (props.ts refitRockColliders); the ground cover
  // keeps the footprints it was sealed against through their cosmetic twins, so no tuft, stone or shrub moves with them
  const rockGroundCover = (props.group.userData.rockGroundCover as CollisionRecord[] | undefined) ?? [];
  const queryGroundCover = rockGroundCover.length ? createObstacleGrid([...obstacles, ...rockGroundCover]) : queryObstacles;
  const groundCoverClearance = () => withGroundCoverHoles(createGroundCoverClearance(queryGroundCover), groundCoverHoles);
  // Keep the synchronous seal visible in load diagnostics: it runs after the
  // sliced vegetation builder, so its work is not in that builder's timings.
  const groundCoverSealStarted = performance.now();
  vegetation.setGroundCoverClearance(groundCoverClearance());
  // the scenery lane (b12; Fjord, wave 74: foliage cards through a boulder): and no shrub stands inside a boulder or a
  // structure the props placed after it — cosmetic, its cover disc stays (shrubClearance.ts)
  group.userData.shrubsCleared = clearShrubsFromSolids(vegetation.group, groundCoverClearance());
  group.userData.groundCoverSealMs = performance.now() - groundCoverSealStarted;
  // environment density pass (2026-09-12): the ground litter tier streams
  // stones, clods and splinters under the camera, kept out of the same sealed
  // footprints as the grass carpet.
  const litter = createGroundLitter(heightField, {
    seed: 2005,
    // the per-map profile table lives with the tier; a map's optional
    // `vegetation.litter` (typed per module) overrides it
    config: (config.vegetation as { litter?: GroundLitterConfig | null } | undefined)?.litter
      ?? groundLitterProfile(config.id),
    blocked: groundCoverClearance(),
    // every lit world material joins the cascaded-shadow setup (see terrain/vegetation);
    // receipts stub the engine context without the hook, production always has it
    setupMaterial: (material, hook) => engineCtx.setupShadowMaterial?.(material, hook),
    releaseMaterial: (material) => engineCtx.releaseShadowMaterial?.(material),
  });
  group.add(litter.group);
  // Round 73 (2026-09-25, the ground redux): the tall-grass tier — blades in a camera-centred ring, bent by the
  // world-anchored pressure field every hull stamps (groundPressure.ts), kept out of the same sealed footprints;
  // null field on the mobile tier and without a renderer (receipts), where the sward is absent or stands still
  const tallGrass = createTallGrass(heightField, {
    seed: 2006,
    mapId: config.id,
    blocked: groundCoverClearance(),
    renderer: (engineCtx as { renderer?: THREE.WebGLRenderer }).renderer ?? null,
    splatNoise: sampleSplatNoise,
    setupMaterial: (material, hook) => engineCtx.setupShadowMaterial?.(material, hook),
    releaseMaterial: (material) => engineCtx.releaseShadowMaterial?.(material),
  });
  group.add(tallGrass.group);
  const rayCandidates: CollisionRecord[] = [];

  const sp = layout.spawns;
  const spawnPoints: WorldRuntime['spawnPoints'] = {
    player: {
      pos: [sp.player.x, heightField.getHeightAt(sp.player.x, sp.player.z), sp.player.z],
      yaw: sp.player.yaw,
    },
    enemies: sp.enemies.map((e: SpawnLayoutPoint) => ({
      pos: [e.x, heightField.getHeightAt(e.x, e.z), e.z],
      yaw: e.yaw,
    })),
  };

  // Sourced terrain/building textures arrive asynchronously. Expose one
  // stable readiness seam so presentation snapshots cannot permanently bake
  // the procedural fallback on a cold hostname while a warm cache captures
  // the final materials.
  const minimapTextureState = createSourcedTextureState(
    terrain.userData.sourcedTexturesReady, props.sourcedTexturesReady,
  );

  const _bestNrm = new THREE.Vector3();
  const _nearestHit: ColliderRayHit = { distance: Infinity, record: null };

  /**
   * Cheap world raycast: heightfield ray-march + tight prop-shape tests.
   * @param {THREE.Vector3} origin ray origin (world)
   * @param {THREE.Vector3} dir unit direction
   * @param {number} maxDist maximum distance, meters
   * @returns {null|{point:THREE.Vector3,normal:THREE.Vector3,dist:number,kind:('terrain'|'prop')}}
   */
  // perf-r3b: the march samples terrain height dozens of times per ray and
  // LOS/spotting fires many rays per frame — the baked 1 m grid (≤ ~1 cm from
  // analytic, tighter than the rendered mesh itself) serves it. Spawn seating
  // above keeps the exact analytic query.
  const hAtF = heightField.getHeightAtFast || heightField.getHeightAt;

  function nearestPropHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): { distance: number; record: CollisionRecord | null } {
    const endX = origin.x + dir.x * maxDist;
    const endZ = origin.z + dir.z * maxDist;
    queryColliders(
      Math.min(origin.x, endX), Math.min(origin.z, endZ),
      Math.max(origin.x, endX), Math.max(origin.z, endZ), rayCandidates);
    // destroyed records stay in the broad phase for O(1) rematch restore; a structure with openings (destruction P2)
    // answers as a whole
    nearestColliderHit(rayCandidates, origin, dir, maxDist, _bestNrm, _nearestHit);
    return { distance: _nearestHit.distance, record: _nearestHit.record };
  }

  function terrainHitDistance(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): number {
    const refineHit = (lowDistance: number, highDistance: number): number => {
      let low = lowDistance;
      let high = highDistance;
      for (let index = 0; index < 6; index++) {
        const mid = (low + high) * 0.5;
        _bisA.copy(dir).multiplyScalar(mid).add(origin);
        if (_bisA.y - hAtF(_bisA.x, _bisA.z) <= 0) high = mid;
        else low = mid;
      }
      return (low + high) * 0.5;
    };
    let distance = 0;
    let clearance = origin.y - hAtF(origin.x, origin.z);
    if (clearance <= 0) return 0;
    while (distance < maxDist) {
      const step = Math.min(Math.max(clearance * 0.5, 0.5), 2.0);
      const priorDistance = distance;
      distance = Math.min(distance + step, maxDist);
      _pt.copy(dir).multiplyScalar(distance).add(origin);
      if (dir.y > 0 && _pt.y > heightField.maxY + 2) return -1;
      clearance = _pt.y - hAtF(_pt.x, _pt.z);
      if (clearance <= 0) return refineHit(priorDistance, distance);
      if (distance >= maxDist) return -1;
    }
    return -1;
  }

  function raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): WorldRayHit | null {
    const propHit = nearestPropHit(origin, dir, maxDist);
    const terrainT = terrainHitDistance(origin, dir, Math.min(maxDist, propHit.distance));
    let hitT: number;
    let kind: WorldRayHit['kind'];
    if (terrainT >= 0 && terrainT < propHit.distance) { hitT = terrainT; kind = 'terrain'; }
    else if (propHit.record && propHit.distance <= maxDist) { hitT = propHit.distance; kind = 'prop'; }
    else return null;
    const point = new THREE.Vector3().copy(dir).multiplyScalar(hitT).add(origin);
    const normal = kind === 'terrain'
      ? heightField.getNormalAt(point.x, point.z).clone()
      : _bestNrm.clone();
    return { point, normal, dist: hitT, kind, record: kind === 'prop' ? propHit.record : null };
  }

  // destruction (§7): the battle's ground overlay, bound per battle (crater-render-spec §B)
  let boundGroundOverlay: TerrainDeformation | null = null;
  // ground lane (crater-render-spec §B): the drawn terrain follows that overlay, polled from its own updateLOD pass
  installTerrainCraterMesh(terrain);
  // ground lane (crater-render-spec §C): the ground cover follows it too — one law, synced after the terrain each frame
  const groundCoverCraters = createGroundCoverCraters();
  /** The cover in the bound overlay's reach takes its new stamps after the terrain took them (`update`'s steps after its
   * LOD walk): the terrain's `followGroundOverlay` hook, which `world.syncGround` runs after its `syncGroundOverlay` for a
   * frame rendered without an update (the Studio's export steps and captures). O(1) when nothing is new. */
  function followGroundCover(): void {
    groundCoverCraters.sync(boundGroundOverlay);
    vegetation.followCraters?.(groundCoverCraters);
    tallGrass.followCraters?.(groundCoverCraters);
    litter.followCraters?.(groundCoverCraters);
  }
  terrain.userData.followGroundOverlay = followGroundCover;
  // destruction (§16): each structure's seam on first ask, its mound from the world's own structure table
  const structureSeams = new Map<number, StructureDamageSeam>();
  let structureTable: ReturnType<typeof createStructureDamage> | null = null;
  const getStructureDamage = (structureIdx: number): StructureDamageSeam | null => {
    const cached = structureSeams.get(structureIdx);
    if (cached) return cached;
    const described = props.structureDamage.get(structureIdx);
    if (!described) return null;
    structureTable ??= createStructureDamage(obstacles, colliders);
    const state = structureTable.byId(structureIdx);
    if (state && !described.anatomy.mound) {
      described.anatomy.mound = { cx: state.cx, cz: state.cz, hw: state.hw, hd: state.hd, yaw: state.yaw,
        heightM: rubbleHeightFor(state.topY - state.baseY) };
    }
    const seam = createStructureDamageSeam(structureIdx, described.builder, described.style, described.anatomy,
      props.structureSpans.get(structureIdx) ?? []);
    structureSeams.set(structureIdx, seam);
    return seam;
  };
  const unregisterDestructibles = props.registerDestructibles();
  return {
    mapId: config.id,
    terrainVariant: config.assaultTrenches ? 'assault-trenches' : null,
    dispose() {
      terrain.userData.cancelSourcedTextures?.();
      unregisterDestructibles();
      vegetation.dispose();
      litter.dispose();
      tallGrass.dispose(); // round 73: the sward, its materials and the pressure field's targets
      terrain.userData.disposeWater?.(); // water pass 8: the reactive field's render targets
      horizonPanorama?.dispose(); // the mountains lane: the far panorama's atlas
    },
    config,
    heightField,
    layoutTier: getDeviceTier(),
    minimapTextureState,
    // Checkpoint-only diagnostics; never force streaming or alter readiness.
    getGrassWorkState: () => vegetation.getGrassWorkState(),
    getFieldWallWorkState: () => ({ pending: (props.group.userData.fieldWallLod as { pending?: number } | undefined)?.pending ?? 0 }),
    /** Round 73: the tall-grass tier (diagnostics and the round's probes: state, meshes, the press field). */
    _tallGrass: tallGrass,
    raycast,
    /** @returns {Array<{min:number[],max:number[]}>} static obstacle AABBs */
    getObstacles: () => obstacles,
    /** Shell/LOS cover records; exposed for deterministic server manifests. */
    getColliders: () => colliders,
    /** Allocation-free local obstacle broad phase; caller owns `out`. */
    queryObstacles,
    /**
     * SPOTTING WIRING: vegetation concealment discs for src/sim/spotting.ts.
     * @returns {Array<{x:number,z:number,r:number,add:number}>}
     */
    getConcealment: () => vegetation.concealers || [],
    // effects_combat r1: crushable props (telegraph poles + world-dressing r1
    // 'loop'-class small clutter) — hull overlap in main.ts triggers
    // crushProp (hinge-topple / debris swap) + fx.propCrush splinters.
    structureDamage: getStructureDamage,
    patchStructureMaterials: (patch) => patchStructureMaterialEntries(props.structureMaterials, patch),
    touchStructureShadows: (structureIdx) => { getStructureDamage(structureIdx)?.touchShadows(); },
    bindGroundOverlay: (overlay) => { boundGroundOverlay = overlay; terrain.userData.groundOverlay = overlay; },
    groundOverlay: () => boundGroundOverlay,
    crushables: props.crushables || [],
    crushProp: (i: number, dx: number, dz: number, speedMps = 0) => (
      props.crushProp(i, dx, dz, speedMps)
    ),
    // world-dressing r1: destructible small-prop records (probes/debug —
    // gameplay paths run through crushObstacle/crushProp/the fx seam)
    destructibles: props.destructibles || [],
    // Lightweight sleeping map clutter (galvanized churns, bins, cans,
    // bottles, wheels...). Exposed for debug telemetry and deterministic
    // probes; gameplay still enters through crushProp/shell seams.
    looseProps: props.looseRecords || [],
    getLoosePropStats: () => props.getLoosePropStats
      ? props.getLoosePropStats() : { total: 0, active: 0 },
    // DESTRUCTIBLES r1: baked real-tank wreck placements (probes/debug)
    tankWreckSpots: props.tankWreckSpots || [],
    // Authored utility stations with exact terrain-support receipts. Visual
    // audits use these to distinguish intentional flat-ground pairs from the
    // single posts required on shelves and gorge shoulders.
    utilityPolePlacements: props.utilityPolePlacements || [],
    decorationGroundingReceipts: props.decorationGroundingReceipts || [],
    // gameplay_feel r6: crushable OBSTACLE records. state.ts's collider
    // queues the hull overrun, marks the record `crushed`, then calls this
    // for the world-side fall/break. Tree trunks (treeIdx, vegetation.ts)
    // hinge-topple; world-dressing r1 destructible props (propIdx, props.ts
    // — fences, carts, stalls, bales, lamps...) topple or swap to debris via
    // the same seam.
    // `options.settled` (multiplayer world state, 2026-10-01): destruction that happened before this viewer looked —
    // a late joiner's or a reconnected seat's persistent destroyed list — lands at its final pose with no fall, no
    // debris and no sound; only an event the seat witnesses live animates.
    crushObstacle: (
      ob: CollisionRecord | null | undefined,
      dx: number,
      dz: number,
      speedMps = 0,
      cause: 'ram' | 'shell' = 'ram',
      options?: { settled?: boolean },
    ) => {
      if (!ob) return false;
      const settled = options?.settled === true;
      if (isTreeObstacle(ob)) {
        const toppled = vegetation.crushTree(ob, dx, dz, settled);
        if (toppled) {
          ob.crushed = true;
          ob.dead = true;
        }
        return toppled;
      }
      // DESTRUCTIBLES r1: the overrun speed rides through so debris inherits
      // the hull's velocity (props.ts breakRecord scales the throw).
      if (ob.propIdx != null && props.crushDestructible) {
        return props.crushDestructible(ob.propIdx, dx, dz, speedMps, cause, settled);
      }
      return false;
    },
    // DESTRUCTIBLES r1: rematch hook — startBattle restores every broken/
    // toppled destructible of the (cached, reused) world to its intact state.
    clearCoverAt: (x, z, r) => { groundCoverCraters.addHole(x, z, r); },
    resetDestructibles: () => {
      groundCoverCraters.resetHoles(); // ground lane: the battle's presentation holes go with it
      if (props.resetDestructibles) props.resetDestructibles();
      if (vegetation.resetToppled) vegetation.resetToppled();
    },
    advanceDestruction: (dt: number) => {
      props.advanceDestructibles?.(dt);
      vegetation.advanceToppled?.(dt);
    },
    advanceToppledVegetation: (dt: number) => { vegetation.advanceToppled?.(dt); },
    spawnPoints,
    /** @returns {{roads:Array, buildings:Array, tacticalBeats:Array, treeClusters:Array, waterOrSoft:Array}} minimap features */
    getMinimapFeatures: () => ({
      roads: layout.roads.map((nodes: Array<readonly [number, number]>) => (
        nodes.map(([x, z]: readonly [number, number]) => [x, z] as [number, number])
      )),
      buildings: props.features.buildings.map((building) => ({ ...building })),
      tacticalBeats: props.features.tacticalBeats.map((beat) => ({ ...beat })),
      treeClusters: vegetation._clusters.map((cluster: { x: number; z: number; r: number }) => ({
        x: cluster.x, z: cluster.z, r: cluster.r,
      })),
      waterOrSoft: [...layout.marshes, ...layout.lakes].map((disc: LayoutDisc) => ({
        ...disc,
      })),
    }),
    /**
     * Per-frame world update: terrain LOD swap + vegetation wind/density.
     * @param {number} dt seconds
     * @param {THREE.Vector3} cameraPos world camera position
     * @param {THREE.Vector3|null} [cameraFwd] unit camera forward — drives the
     *   scoped grass center-cone clear-out
     * @param {THREE.Vector3|null} [focusPos] chase-camera focus — non-null
     *   enables the tree occlusion fade along focus→camera
     */
    update(
      dt: number,
      cameraPos: THREE.Vector3,
      cameraFwd: THREE.Vector3 | null = null,
      focusPos: THREE.Vector3 | null = null,
    ) {
      terrain.userData.updateLOD(cameraPos);
      // ground lane (crater-render-spec §C): the cover in a crater's reach, after the terrain took the same stamps
      groundCoverCraters.sync(boundGroundOverlay);
      vegetation.followCraters?.(groundCoverCraters);
      tallGrass.followCraters?.(groundCoverCraters);
      litter.followCraters?.(groundCoverCraters);
      // water pass 8: the reactive field's window follows the chase focus (the camera when there is none)
      const waterAnchor = focusPos ?? cameraPos;
      terrain.userData.updateWater?.(dt, waterAnchor.x, waterAnchor.z);
      vegetation.update(dt, cameraPos, cameraFwd, focusPos);
      bakePanorama(); // a no-op once baked
      litter.update(cameraPos);
      tallGrass.update(dt, cameraPos, focusPos, cameraFwd); // round 73: the sward's ring, wind and press
      if (props.updateProps) props.updateProps(dt, cameraPos); // pole LOD + hinge-topple anims
    },
    /**
     * Build exact terrain lookahead meshes in an explicitly bounded batch.
     * Used only during the frozen deployment countdown; live streaming keeps
     * its conservative, incrementally sliced live-streaming fallback.
     */
    warmTerrainLookahead(cameraPos: THREE.Vector3, maxJobs = 1) {
      return terrain.userData.warmStreaming?.(cameraPos, maxJobs) || 0;
    },
    warmImpostors: () => { bakePanorama(); return vegetation.warmImpostors(); },
    /** Freeze hook for screenshots. @param {number} t wind time, seconds */
    setWindTime(t: number) { vegetation.setWindTime(t); terrain.userData.setWaterTime?.(t); tallGrass.setWindTime(t); },
    updateProps(dt: number, cameraPos: THREE.Vector3) { if (props.updateProps) props.updateProps(dt, cameraPos); },
    syncGround() {
      (terrain.userData.syncGroundOverlay as (() => void) | undefined)?.();
      (terrain.userData.followGroundOverlay as (() => void) | undefined)?.();
    },
    setWaterDisturbances(sources) { setWater(sources); },
    resetWater() { terrain.userData.resetWater?.(); setWater([]); },
    advanceWater(dt, x, z) { terrain.userData.updateWater?.(dt, x, z); },
    /** Round 73: the hulls' footprints this frame press the tall grass (main.ts publishes every vehicle). */
    setGroundDisturbances(sources) { tallGrass.setDisturbances(sources); },
    /**
     * Sniper near-grass suppression passthrough (see vegetation.setSniperFade).
     * @param {number} f target fade 0..1
     * @param {boolean} [immediate=false] snap instead of easing
     * @param {number} [fovDeg] live camera FOV — high zoom (≤15°) switches the
     *   scope-corridor foliage fade from screen-door dither to a binary cut
     * @param {number} [aimDistM] live server-aim distance (rig.aimDist) — the
     *   scope-ray foliage corridor is culled out to this distance (r5)
     */
    setSniperFade(
      f: number,
      immediate = false,
      fovDeg: number | null = null,
      aimDistM: number | null = null,
    ) {
      vegetation.setSniperFade(f, immediate, fovDeg, aimDistM);
      tallGrass.setSniperFade(f, immediate); // round 73: the blades clear the scope corridor with the tufts
    },
    group,
  };
}
