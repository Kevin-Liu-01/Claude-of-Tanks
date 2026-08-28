// src/world/map.ts — composes terrain meshes + vegetation + props into the World.
// Contract: docs/ARCHITECTURE.md §2.7 (World shape), §3.2 (layout rules).
// Which battlefield gets built is driven by a map config (src/world/maps/*):
// createMap(engineCtx, { mapId }) — any id from maps/index.ts MAP_IDS.

import * as THREE from 'three';
import {
  createHeightField as createHeightFieldLegacy,
  buildTerrainMeshes as buildTerrainMeshesLegacy,
  buildTerrainMeshesAsync as buildTerrainMeshesAsyncLegacy,
} from './terrain.ts';
import {
  createVegetation as createVegetationLegacy,
  createVegetationAsync as createVegetationAsyncLegacy,
} from './vegetation.ts';
import {
  createProps as createPropsLegacy,
  createPropsAsync as createPropsAsyncLegacy,
  preloadPropModels,
} from './props.ts';
import { getMapConfig, type BattlefieldMapConfig } from './maps/index.ts';
import {
  createObstacleGrid,
  rayCollisionRecord,
  type CollisionRecord,
  type ObstacleQuery,
} from './collision.ts';

interface EngineContext {
  scene: THREE.Scene;
}

interface WorldOptions {
  mapId?: string;
  seed?: number;
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
  [key: string]: unknown;
}

interface HeightFieldLayout {
  spawns: { player: SpawnLayoutPoint; enemies: SpawnLayoutPoint[] };
  roads: Array<Array<readonly [number, number]>>;
  marshes: LayoutDisc[];
  lakes: LayoutDisc[];
}

export interface WorldHeightField {
  _layout: HeightFieldLayout;
  maxY: number;
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt(x: number, z: number): THREE.Vector3;
}

interface TerrainUserData {
  sourcedTexturesReady?: Promise<unknown>;
  streamingStats?: unknown;
  updateLOD(cameraPosition: THREE.Vector3): void;
  warmStreaming?(cameraPosition: THREE.Vector3, maxJobs: number): number;
  [key: string]: unknown;
}

type TerrainRoot = THREE.Object3D & { userData: TerrainUserData };

export interface ConcealmentDisc {
  x: number;
  z: number;
  r: number;
  add: number;
}

interface VegetationRuntime {
  group: THREE.Object3D;
  treeObstacles: CollisionRecord[];
  concealers?: ConcealmentDisc[];
  _clusters: Array<{ x: number; z: number; r: number }>;
  _buildDetail?: unknown;
  update(
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    cameraForward?: THREE.Vector3 | null,
    focusPosition?: THREE.Vector3 | null,
  ): void;
  setWindTime(timeSeconds: number): void;
  setSniperFade(
    fraction: number,
    immediate?: boolean,
    fovDegrees?: number | null,
    aimDistanceMeters?: number | null,
  ): void;
  crushTree?(record: CollisionRecord, dx: number, dz: number): unknown;
  resetToppled?(): void;
}

interface MapFeatureRecord {
  [key: string]: unknown;
}

interface PropsRuntime {
  group: THREE.Object3D;
  obstacles: CollisionRecord[];
  colliders: CollisionRecord[];
  sourcedTexturesReady?: Promise<unknown>;
  features: {
    buildings: MapFeatureRecord[];
    tacticalBeats: MapFeatureRecord[];
  };
  crushables?: unknown[];
  destructibles?: unknown[];
  looseRecords?: unknown[];
  tankWreckSpots?: unknown[];
  utilityPolePlacements?: unknown[];
  decorationGroundingReceipts?: unknown[];
  crushProp?(index: number, dx: number, dz: number, speedMetersPerSecond: number): unknown;
  crushDestructible?(
    index: number,
    dx: number,
    dz: number,
    speedMetersPerSecond: number,
    cause: string,
  ): unknown;
  getLoosePropStats?(): { total: number; active: number };
  resetDestructibles?(): void;
  updateProps?(deltaSeconds: number, cameraPosition: THREE.Vector3): void;
}

export interface WorldRayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  kind: 'terrain' | 'prop';
  record: CollisionRecord | null;
}

export interface WorldRuntime {
  mapId: string;
  config: BattlefieldMapConfig;
  heightField: WorldHeightField;
  minimapTextureState: { settled: boolean; promise: Promise<void> };
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): WorldRayHit | null;
  getObstacles(): CollisionRecord[];
  getColliders(): CollisionRecord[];
  queryObstacles: ObstacleQuery;
  getConcealment(): ConcealmentDisc[];
  crushables: unknown[];
  crushProp(index: number, dx: number, dz: number, speedMetersPerSecond?: number): unknown;
  destructibles: unknown[];
  looseProps: unknown[];
  getLoosePropStats(): { total: number; active: number };
  tankWreckSpots: unknown[];
  utilityPolePlacements: unknown[];
  decorationGroundingReceipts: unknown[];
  crushObstacle(
    record: CollisionRecord | null | undefined,
    dx: number,
    dz: number,
    speedMetersPerSecond?: number,
  ): unknown;
  resetDestructibles(): void;
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
  setWindTime(timeSeconds: number): void;
  setSniperFade(
    fraction: number,
    immediate?: boolean,
    fovDegrees?: number | null,
    aimDistanceMeters?: number | null,
  ): void;
  group: THREE.Group;
  _buildDetail?: { vegetation: unknown; terrain: unknown };
}

const createHeightField = createHeightFieldLegacy as unknown as (
  seed: number,
  config: BattlefieldMapConfig,
) => WorldHeightField;
const buildTerrainMeshes = buildTerrainMeshesLegacy as unknown as (
  heightField: WorldHeightField,
  engineContext: EngineContext,
  config: BattlefieldMapConfig,
) => TerrainRoot;
const buildTerrainMeshesAsync = buildTerrainMeshesAsyncLegacy as unknown as (
  heightField: WorldHeightField,
  engineContext: EngineContext,
  config: BattlefieldMapConfig,
  onProgress: BuildSliceProgress,
  fineSlices: boolean,
  options: { streamFarLods: boolean; focus: SpawnLayoutPoint },
) => Promise<TerrainRoot>;
const createVegetation = createVegetationLegacy as unknown as (
  heightField: WorldHeightField,
  engineContext: EngineContext,
  seed: number,
  config: BattlefieldMapConfig,
) => VegetationRuntime;
const createVegetationAsync = createVegetationAsyncLegacy as unknown as (
  heightField: WorldHeightField,
  engineContext: EngineContext,
  seed: number,
  config: BattlefieldMapConfig,
  onProgress: BuildSliceProgress,
  fineSlices: boolean,
) => Promise<VegetationRuntime>;
const createProps = createPropsLegacy as unknown as (
  heightField: WorldHeightField,
  engineContext: EngineContext,
  seed: number,
  config: BattlefieldMapConfig,
) => PropsRuntime;
const createPropsAsync = createPropsAsyncLegacy as unknown as (
  heightField: WorldHeightField,
  engineContext: EngineContext,
  seed: number,
  config: BattlefieldMapConfig,
  onProgress: BuildSliceProgress,
  fineSlices: boolean,
) => Promise<PropsRuntime>;

const _pt = new THREE.Vector3();
const _bisA = new THREE.Vector3();

/**
 * Build the full battlefield world for a map config and add it to the scene.
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {{mapId?:string, seed?:number}} [opts] world options
 * @returns {object} World (ARCHITECTURE §2.7) + {mapId, config}
 */
export function createMap(
  engineContext: unknown,
  { mapId = 'verdant', seed = 1337 }: WorldOptions = {},
): WorldRuntime {
  const engineCtx = engineContext as EngineContext;
  const config = getMapConfig(mapId);
  const heightField = createHeightField(seed, config);
  const terrain = buildTerrainMeshes(heightField, engineCtx, config);
  const vegetation = createVegetation(heightField, engineCtx, 2001, config);
  const props = createProps(heightField, engineCtx, 2002, config);
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
  engineContext: unknown,
  { mapId = 'verdant', seed = 1337 }: WorldOptions = {},
  onStep: WorldBuildProgress | null = null,
  { fineSlices = false }: WorldSlicingOptions = {},
): Promise<WorldRuntime> {
  const engineCtx = engineContext as EngineContext;
  const config = getMapConfig(mapId);
  // Transfer/decompress the exact authored sandbag and utility-pole streams
  // while terrain and vegetation occupy the main thread. Previously their
  // 1.2 MB numeric JSON lived inside the map JavaScript chunk and had to be
  // parsed before even the height field could start.
  const propModelsReady = preloadPropModels();
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
  const heightField = createHeightField(seed, config);
  await step('Building terrain meshes', 0.34);
  const terrain = await buildTerrainMeshesAsync(heightField, engineCtx, config,
    sub('Building terrain meshes', 0.34, 0.58), fineSlices, {
      // The deployment view gets exact near/mid detail and every other chunk
      // gets its exact visible coarse level. Missing levels grow one geometry
      // at a time as the camera approaches.
      // Heightfield/collision/spotting data remains complete and deterministic.
      streamFarLods: true,
      focus: heightField._layout.spawns.player,
    });
  await step('Planting vegetation', 0.58);
  const vegetation = await createVegetationAsync(heightField, engineCtx, 2001, config,
    sub('Planting vegetation', 0.58, 0.82), fineSlices);
  await step('Placing structures', 0.82);
  await propModelsReady;
  const props = await createPropsAsync(heightField, engineCtx, 2002, config,
    sub('Placing structures', 0.82, 0.96), fineSlices);
  await step('Sealing the battlefield', 0.96);
  const world = assembleWorld(engineCtx, config, heightField, terrain, vegetation, props);
  world._buildDetail = {
    vegetation: vegetation._buildDetail || null,
    terrain: terrain.userData.streamingStats || null,
  };
  return world;
}

/**
 * Wire built subsystems into the World facade and add it to the scene. Shared
 * by {@link createMap} and {@link createMapAsync} so both produce an identical
 * world object.
 * @returns {object} World (ARCHITECTURE §2.7)
 */
function assembleWorld(
  engineCtx: EngineContext,
  config: BattlefieldMapConfig,
  heightField: WorldHeightField,
  terrain: TerrainRoot,
  vegetation: VegetationRuntime,
  props: PropsRuntime,
): WorldRuntime {
  const layout = heightField._layout;

  const group = new THREE.Group();
  group.name = 'world-' + config.id;
  group.add(terrain, vegetation.group, props.group);
  engineCtx.scene.add(group);
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
  // Static spatial broad phases: movement queries only the handful of props
  // around a hull, and a shell/LOS ray only the cells spanned by its segment.
  // The narrow phase still uses the authored OBB/circle/convex footprint.
  const queryObstacles = createObstacleGrid(obstacles);
  const queryColliders = createObstacleGrid(props.colliders);
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
  const minimapTextureState: WorldRuntime['minimapTextureState'] = {
    settled: false,
    promise: Promise.resolve(),
  };
  minimapTextureState.promise = Promise.all([
    terrain.userData.sourcedTexturesReady || Promise.resolve(),
    props.sourcedTexturesReady || Promise.resolve(),
  ]).then(() => { minimapTextureState.settled = true; });

  const _aabbNrm = new THREE.Vector3();
  const _bestNrm = new THREE.Vector3();

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

  function raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): WorldRayHit | null {
    // props first — they bound the terrain march
    let best = Infinity;
    let bestKind: WorldRayHit['kind'] | null = null;
    let bestRecord: CollisionRecord | null = null;
    const ex = origin.x + dir.x * maxDist;
    const ez = origin.z + dir.z * maxDist;
    queryColliders(
      Math.min(origin.x, ex), Math.min(origin.z, ez),
      Math.max(origin.x, ex), Math.max(origin.z, ez), rayCandidates);
    for (const c of rayCandidates) {
      // DESTRUCTIBLES r1: a destroyed wall segment / truck stops blocking
      // shells and AI line-of-sight — its collider is flagged dead in place
      // (O(1) rematch restore) rather than spliced out.
      if (c.dead) continue;
      const t = rayCollisionRecord(origin, dir, c, Math.min(maxDist, best), _aabbNrm);
      if (t >= 0 && t < best) {
        best = t;
        bestKind = 'prop';
        bestRecord = c;
        _bestNrm.copy(_aabbNrm);
      }
    }
    // terrain march with adaptive step + bisection refinement
    let terrainT = -1;
    let t = 0;
    let clearance = origin.y - hAtF(origin.x, origin.z);
    if (clearance <= 0) {
      terrainT = 0;
    } else {
      const limit = Math.min(maxDist, best);
      let prevT = 0;
      while (t < limit) {
        const step = Math.min(Math.max(clearance * 0.5, 0.5), 2.0);
        prevT = t;
        t = Math.min(t + step, limit);
        _pt.copy(dir).multiplyScalar(t).add(origin);
        if (dir.y > 0 && _pt.y > heightField.maxY + 2) break; // rising above all terrain
        clearance = _pt.y - hAtF(_pt.x, _pt.z);
        if (clearance <= 0) {
          let lo = prevT, hi = t;
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) * 0.5;
            _bisA.copy(dir).multiplyScalar(mid).add(origin);
            if (_bisA.y - hAtF(_bisA.x, _bisA.z) <= 0) hi = mid; else lo = mid;
          }
          terrainT = (lo + hi) * 0.5;
          break;
        }
        if (t >= limit) break;
      }
    }
    let hitT: number;
    let kind: WorldRayHit['kind'];
    if (terrainT >= 0 && terrainT < best) { hitT = terrainT; kind = 'terrain'; }
    else if (bestKind && best <= maxDist) { hitT = best; kind = 'prop'; }
    else return null;
    const point = new THREE.Vector3().copy(dir).multiplyScalar(hitT).add(origin);
    const normal = kind === 'terrain'
      ? heightField.getNormalAt(point.x, point.z).clone()
      : _bestNrm.clone();
    return { point, normal, dist: hitT, kind, record: kind === 'prop' ? bestRecord : null };
  }

  return {
    mapId: config.id,
    config,
    heightField,
    minimapTextureState,
    raycast,
    /** @returns {Array<{min:number[],max:number[]}>} static obstacle AABBs */
    getObstacles: () => obstacles,
    /** Shell/LOS cover records; exposed for deterministic server manifests. */
    getColliders: () => props.colliders,
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
    crushables: props.crushables || [],
    crushProp: (i: number, dx: number, dz: number, speedMps = 0) => (
      props.crushProp?.(i, dx, dz, speedMps)
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
    // gameplay_feel r6: crushable OBSTACLE records. state.js's collider
    // queues the hull overrun, marks the record `crushed`, then calls this
    // for the world-side fall/break. Tree trunks (treeIdx, vegetation.ts)
    // hinge-topple; world-dressing r1 destructible props (propIdx, props.ts
    // — fences, carts, stalls, bales, lamps...) topple or swap to debris via
    // the same seam.
    crushObstacle: (
      ob: CollisionRecord | null | undefined,
      dx: number,
      dz: number,
      speedMps = 0,
    ) => {
      if (!ob) return false;
      if (ob.treeIdx != null && vegetation.crushTree) return vegetation.crushTree(ob, dx, dz);
      // DESTRUCTIBLES r1: the overrun speed rides through so debris inherits
      // the hull's velocity (props.ts breakRecord scales the throw).
      if (ob.propIdx != null && props.crushDestructible) return props.crushDestructible(ob.propIdx, dx, dz, speedMps, 'ram');
      return false;
    },
    // DESTRUCTIBLES r1: rematch hook — startBattle restores every broken/
    // toppled destructible of the (cached, reused) world to its intact state.
    resetDestructibles: () => {
      if (props.resetDestructibles) props.resetDestructibles();
      if (vegetation.resetToppled) vegetation.resetToppled();
    },
    spawnPoints,
    /** @returns {{roads:Array, buildings:Array, tacticalBeats:Array, treeClusters:Array, waterOrSoft:Array}} minimap features */
    getMinimapFeatures: () => ({
      roads: layout.roads.map((nodes: Array<readonly [number, number]>) => (
        nodes.map(([x, z]: readonly [number, number]) => [x, z] as [number, number])
      )),
      buildings: props.features.buildings.map((building: MapFeatureRecord) => ({ ...building })),
      tacticalBeats: props.features.tacticalBeats.map((beat: MapFeatureRecord) => ({ ...beat })),
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
      vegetation.update(dt, cameraPos, cameraFwd, focusPos);
      if (props.updateProps) props.updateProps(dt, cameraPos); // pole LOD + hinge-topple anims
    },
    /**
     * Build exact terrain lookahead meshes in an explicitly bounded batch.
     * Used only during the frozen deployment countdown; live streaming keeps
     * its conservative one-job-per-four-frames fallback.
     */
    warmTerrainLookahead(cameraPos: THREE.Vector3, maxJobs = 1) {
      return terrain.userData.warmStreaming?.(cameraPos, maxJobs) || 0;
    },
    /** Freeze hook for screenshots. @param {number} t wind time, seconds */
    setWindTime(t: number) { vegetation.setWindTime(t); },
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
    },
    group,
  };
}
