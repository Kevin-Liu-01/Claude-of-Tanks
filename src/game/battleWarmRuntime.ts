import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { BotRoutePoint } from '../sim/botRoutePlanner.ts';
import type {
  DeploymentForwardWarmBatch,
  IsolatedForwardWarmOptions,
} from '../engine/deploymentWarm.ts';
import type { DeploymentShadowWarmOwner } from '../engine/deploymentShadowWarm.ts';
import {
  captureNewProgramUniformSteps,
  ProgramUniformPreparationError,
  snapshotRendererPrograms,
  type ForwardProgramCompileTiming,
  type ForwardProgramWarmOwner,
} from '../engine/programWarm.ts';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextPaintFrame,
  type WorkYielder,
} from '../engine/frameScheduler.ts';
import {
  COMBAT_WARM_PROGRAM_CHECKPOINT,
  type CombatWarmExecution,
} from './combatWarmCoordinator.ts';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface BattleWarmState {
  pos: Vec3Like;
  yaw?: number;
}

interface BattleWarmVisual {
  root?: Object3D;
  prewarmBurn?(): Object3D[] | void;
  getWreckFallbackMaterial?(): Material | null;
  stageBattleDetailsForWarm?(): () => void;
  setDestroyed?(options?: { pop?: boolean; ageS?: number }): void;
  resetDestroyed?(): void;
  setTrackState?(module: string, destroyed: boolean): void;
}

interface BattleWarmEntity {
  specId?: string;
  camo?: string;
  isPlayer?: boolean;
  state?: BattleWarmState | null;
  visual?: BattleWarmVisual | null;
  _openingRoute?: BotRoutePoint[] | null;
  spec?: {
    dims?: { heightM?: number };
    gun?: {
      shells?: ShellSpecLike[];
    };
  };
  combat?: {
    shellSlot?: number;
  } | null;
}

interface BattleWarmGame {
  tanks: BattleWarmEntity[];
  player?: BattleWarmEntity | null;
  shells?: RuntimeValue[];
}

interface TerrainWarmPoint {
  x: number;
  z: number;
  radiusM: number;
}

interface BattleWarmWorld {
  getGrassWorkState?(): {
    disposed: boolean;
    carpet?: { cold: boolean; pending: boolean };
  };
  heightField?: {
    warmFastTilesAround(points: TerrainWarmPoint[]): Iterable<number>;
  };
  update?(
    dt: number,
    cameraPosition: Vector3,
    cameraForward: Vector3,
    focusPosition: Vector3,
  ): void;
}

export interface TerrainWarmOptions {
  game: BattleWarmGame;
  world: BattleWarmWorld | null;
  yieldForBudget?: WorkYielder | null;
  primePresentation?: boolean;
  presentationCamera?: Camera;
}

export interface OpeningTerrainPresentationOptions {
  game: BattleWarmGame;
  world: BattleWarmWorld | null;
  camera: Camera;
  yieldForBudget?: WorkYielder | null;
  signal?: AbortSignal;
  /** Recheck the caller's generation at this producer's own resume boundary. */
  assertCurrent?: () => void;
  /** Same selected entity as live world-frame presentation (observer included). */
  focusEntity?: {
    state?: BattleWarmState | null;
    visual?: { root?: Object3D } | null;
    spec?: { dims?: { heightM?: number } };
  } | null;
}

const PLAYER_OPENING_CORRIDOR_M = [80, 112, 144] as const;

function appendPlayerTerrainWarmPoints(
  state: BattleWarmState,
  points: TerrainWarmPoint[],
): void {
  const yaw = Number(state.yaw) || 0;
  for (const distanceM of PLAYER_OPENING_CORRIDOR_M) {
    points.push({
      x: state.pos.x + Math.sin(yaw) * distanceM,
      z: state.pos.z + Math.cos(yaw) * distanceM,
      radiusM: 10,
    });
  }
}

function appendBotRouteWarmPoints(
  entity: BattleWarmEntity,
  state: BattleWarmState,
  points: TerrainWarmPoint[],
): void {
  if (!entity._openingRoute) return;
  let lastX = state.pos.x;
  let lastZ = state.pos.z;
  let routeM = 0;
  let sinceWarmM = 0;
  for (const waypoint of entity._openingRoute) {
    const waypointX = Number(waypoint[0]);
    const waypointZ = Number(waypoint[1]);
    if (!Number.isFinite(waypointX) || !Number.isFinite(waypointZ)) continue;
    const stepM = Math.hypot(waypointX - lastX, waypointZ - lastZ);
    routeM += stepM;
    sinceWarmM += stepM;
    lastX = waypointX;
    lastZ = waypointZ;
    if (sinceWarmM >= 24 || routeM >= 120) {
      points.push({ x: waypointX, z: waypointZ, radiusM: 10 });
      sinceWarmM = 0;
    }
    if (routeM >= 120) break;
  }
}

function collectOpeningTerrainWarmPoints(game: BattleWarmGame): TerrainWarmPoint[] {
  const points: TerrainWarmPoint[] = [];
  for (const entity of game.tanks) {
    const state = entity.state;
    if (!state) continue;
    points.push({ x: state.pos.x, z: state.pos.z, radiusM: entity.isPlayer ? 64 : 0 });
    if (entity.isPlayer) appendPlayerTerrainWarmPoints(state, points);
    else appendBotRouteWarmPoints(entity, state, points);
  }
  return points;
}

export async function primeOpeningTerrainPresentation({
  game, world, camera, yieldForBudget = null, signal, assertCurrent, focusEntity,
}: OpeningTerrainPresentationOptions): Promise<void> {
  const requireCurrent = (): void => {
    signal?.throwIfAborted();
    assertCurrent?.();
  };
  requireCurrent();
  const focus = focusEntity === undefined
    ? game.player || game.tanks.find((entity) => entity.state) : focusEntity;
  if (!focus?.state || typeof world?.update !== 'function') return;
  // Snapshot the existing rig's solved reveal pose, including its distance,
  // pitch, articulation and collision pull-in. Even a sub-metre heuristic error
  // can select another 16 m carpet cell. Never move the camera during this job.
  const warmCamera = camera.position.clone();
  const warmForward = camera.getWorldDirection(new Vector3());
  const warmFocus = new Vector3().copy(focus.state.pos);
  focus.visual?.root?.getWorldPosition(warmFocus);
  warmFocus.y += (focus.spec?.dims?.heightM ?? 0) * 0.75;
  // The live scheduler no longer builds the near carpet in one blocking call.
  // Finish that same camera's first carpet behind the existing veil, yielding
  // between bounded updates. Account this in openingGroundCover, not an invisible
  // pre-probe settle; the countdown must not reveal an empty cold carpet.
  for (let batch = 0; batch < 900; batch++) {
    requireCurrent();
    world.update(0, warmCamera, warmForward, warmFocus);
    if (yieldForBudget) await yieldForBudget(true);
    requireCurrent();
    const grass = world.getGrassWorkState?.();
    if (grass?.disposed) throw new Error('Opening ground cover world was disposed');
    if (!grass?.carpet || (!grass.carpet.cold && !grass.carpet.pending)) return;
    if (!yieldForBudget) await nextPaintFrame();
  }
  throw new Error('Opening ground cover did not complete within 900 bounded batches');
}

/** Prepare exact opening terrain and vegetation caches behind the battle veil. */
export async function warmBattleTerrainTiles({
  game,
  world,
  yieldForBudget = null,
  primePresentation = true,
  presentationCamera,
}: TerrainWarmOptions): Promise<void> {
  const heightField = world?.heightField;
  const warmer = heightField?.warmFastTilesAround;
  if (typeof warmer !== 'function') return;
  const points = collectOpeningTerrainWarmPoints(game);
  for (const _tile of warmer.call(heightField, points)) {
    if (yieldForBudget) await yieldForBudget();
  }
  // Callers without a solved reveal camera warm terrain only. They explicitly
  // prime presentation after their existing camera owner performs activation.
  if (primePresentation && presentationCamera) {
    await primeOpeningTerrainPresentation({ game, world, camera: presentationCamera, yieldForBudget });
  }
}

type BurnStepFactory = (
  specId: string,
  anisotropy: number,
  selection: string,
) => Iterable<void>;

export interface WreckWarmOptions {
  signal?: AbortSignal;
  entities: Iterable<BattleWarmEntity>;
  prebakeBurntSteps: BurnStepFactory;
  anisotropy: number;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  compilePrograms(root: Object3D): void;
  warmRender(): void;
}

type WreckWarmMesh = Object3D & {
  isMesh?: boolean;
  geometry?: BufferGeometry;
  material?: Material | Material[];
  castShadow?: boolean;
  receiveShadow?: boolean;
};

type WreckFallbackProbe = { source: WreckWarmMesh; material: Material };

type WreckWarmLight = Object3D & {
  isLight?: boolean;
  castShadow?: boolean;
  shadow?: {
    autoUpdate: boolean;
    needsUpdate: boolean;
  };
};

function containsLight(root: Object3D): boolean {
  let found = false;
  root.traverse((object) => {
    if ((object as WreckWarmLight).isLight) found = true;
  });
  return found;
}

function initializeMaterialTextures(renderer: WebGLRenderer, material: Material): void {
  for (const value of Object.values(material)) {
    if (typeof value !== 'object' || value === null || !('isTexture' in value)) continue;
    try {
      renderer.initTexture(value as Parameters<WebGLRenderer['initTexture']>[0]);
    } catch (_) { /* first real draw remains the fallback */ }
  }
}

function wreckProbeSignature(source: WreckWarmMesh): string {
  const candidate = source as WreckWarmMesh & {
    isBatchedMesh?: boolean;
    isInstancedMesh?: boolean;
    isSkinnedMesh?: boolean;
  };
  const attributes = Object.keys(candidate.geometry?.attributes ?? {}).sort().join(',');
  const morphs = Object.entries(candidate.geometry?.morphAttributes ?? {})
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => `${name}:${values.length}`)
    .sort()
    .join(',');
  return [attributes, morphs, !!candidate.isBatchedMesh,
    !!candidate.isInstancedMesh, !!candidate.isSkinnedMesh].join('|');
}

function potentialFallbackWarmMeshes(root: Object3D): WreckWarmMesh[] {
  const candidates: WreckWarmMesh[] = [];
  root.traverse((object) => {
    const candidate = object as WreckWarmMesh;
    if (!candidate.isMesh || !candidate.material
      || Array.isArray(candidate.material)) return;
    const material = candidate.material as Material & { isMeshStandardMaterial?: boolean };
    if (material.colorWrite === false || material.visible === false) return;
    // Standard materials accept the in-place burn driver. Non-standard
    // fittings use the shared fallback, and normal-less geometry has its own
    // production program key even if an earlier presentation temporarily
    // replaced its material before this later warm traversal.
    if (!material.isMeshStandardMaterial
      || !candidate.geometry?.attributes?.normal) candidates.push(candidate);
  });
  return candidates;
}

/**
 * Submit one real destroyed-only material draw against the production lights.
 * Hiding non-light scene roots prevents a shader warm from becoming a second
 * full battlefield render; one forced shadow light also covers the generic
 * depth variant without redrawing all four CSM cascades.
 */
function warmWreckFallbackProbe({
  candidates,
  scene,
  camera,
  compilePrograms,
  warmRender,
}: {
  candidates: WreckFallbackProbe[];
  scene: Scene;
  camera: Camera;
  compilePrograms(root: Object3D): void;
  warmRender(): void;
}): void {
  const probes = candidates.map(({ source, material }, index) => {
    const probe = source.clone(false) as WreckWarmMesh;
    probe.name = `WreckFallbackWarmProbe:${index}`;
    probe.material = material;
    probe.visible = true;
    probe.frustumCulled = false;
    probe.castShadow = true;
    probe.receiveShadow = true;
    probe.layers.mask = camera.layers.mask;
    return probe;
  });

  const hiddenRoots: Object3D[] = [];
  const shadowStates: Array<{
    shadow: NonNullable<WreckWarmLight['shadow']>;
    autoUpdate: boolean;
    needsUpdate: boolean;
  }> = [];
  scene.traverse((object) => {
    const light = object as WreckWarmLight;
    if (!light.isLight || !light.castShadow || !light.shadow) return;
    shadowStates.push({
      shadow: light.shadow,
      autoUpdate: light.shadow.autoUpdate,
      needsUpdate: light.shadow.needsUpdate,
    });
  });
  const selectedShadow = shadowStates[0]?.shadow ?? null;

  try {
    scene.add(...probes);
    for (const root of scene.children) {
      if (probes.includes(root as WreckWarmMesh)
        || root.visible === false || containsLight(root)) continue;
      root.visible = false;
      hiddenRoots.push(root);
    }
    for (const state of shadowStates) {
      state.shadow.autoUpdate = false;
      state.shadow.needsUpdate = false;
    }
    if (selectedShadow) selectedShadow.needsUpdate = true;
    for (const probe of probes) compilePrograms(probe);
    warmRender();
  } catch (_) { /* first live draw remains the compatibility fallback */ }
  finally {
    for (const probe of probes) probe.removeFromParent();
    for (const root of hiddenRoots) root.visible = true;
    for (const state of shadowStates) {
      state.shadow.autoUpdate = state.autoUpdate;
      state.shadow.needsUpdate = state.needsUpdate;
    }
  }
}

async function warmBurntVariant(
  entity: BattleWarmEntity,
  prebakeBurntSteps: BurnStepFactory,
  anisotropy: number,
  warmedSpecs: Set<string>,
  yieldForFrameBudget: WorkYielder,
  valid: () => boolean,
): Promise<void> {
  if (!valid() || !entity.specId) return;
  const selection = entity.camo || 'factory';
  const wreckKey = `${entity.specId}:${selection}`;
  if (warmedSpecs.has(wreckKey)) return;
  warmedSpecs.add(wreckKey);
  try {
    for (const _step of prebakeBurntSteps(entity.specId, anisotropy, selection)) {
      if (!valid()) return;
      await yieldForFrameBudget();
      if (!valid()) return;
    }
  } catch (_) { valid(); /* warm only, unless the entry was aborted */ }
}

function collectWreckFallbackProbes(
  sources: Object3D[],
  material: Material | null,
  fallbackProbes: Map<string, WreckFallbackProbe>,
): void {
  if (!material) return;
  for (const source of sources) {
    const candidate = source as WreckWarmMesh;
    if (!candidate.isMesh || !candidate.material) continue;
    const signature = wreckProbeSignature(candidate);
    if (!fallbackProbes.has(signature)) {
      fallbackProbes.set(signature, { source: candidate, material });
    }
  }
}

function warmWreckVisual(
  visual: BattleWarmVisual,
  renderer: WebGLRenderer,
  compilePrograms: (root: Object3D) => void,
  fallbackProbes: Map<string, WreckFallbackProbe>,
  valid: () => boolean,
): Generator<void, void, void> | null {
  const root = visual.root;
  if (!valid() || !root) return null;
  const rootWasVisible = root.visible;
  const restoreBattleDetails = visual.stageBattleDetailsForWarm?.();
  try {
    root.visible = true;
    const fallbackSources = [
      ...(visual.prewarmBurn?.() ?? []),
      ...potentialFallbackWarmMeshes(root),
    ];
    const before = snapshotRendererPrograms(renderer);
    compilePrograms(root);
    if (!valid()) return null;
    const uniforms = captureNewProgramUniformSteps(renderer, before, { isCurrent: valid });
    const material = visual.getWreckFallbackMaterial?.() ?? null;
    if (material) initializeMaterialTextures(renderer, material);
    collectWreckFallbackProbes(fallbackSources, material, fallbackProbes);
    return uniforms;
  } catch (_) { valid(); /* warm only, unless the entry was aborted */ }
  finally {
    try { restoreBattleDetails?.(); } catch (_) { /* warm only */ }
    root.visible = rootWasVisible;
  }
  return null;
}

async function consumeWreckUniformSteps(
  uniforms: Generator<void, void, void> | null,
  yieldForFrameBudget: WorkYielder,
  valid: () => boolean,
): Promise<boolean> {
  if (!uniforms) return valid();
  try {
    for (const _step of uniforms) {
      await yieldForFrameBudget(true);
      if (!valid()) return false;
    }
  } finally { uniforms.return(); }
  return valid();
}

/** Prebuild only the fielded roster's destroyed variants before first blood. */
export async function warmNetworkWrecks({
  signal,
  entities,
  prebakeBurntSteps,
  anisotropy,
  renderer,
  scene,
  camera,
  compilePrograms,
  warmRender,
}: WreckWarmOptions): Promise<void> {
  signal?.throwIfAborted();
  const generation = warmGeneration;
  const info = renderer.info;
  const gl = renderer.getContext();
  const valid = (): boolean => {
    signal?.throwIfAborted();
    return generation === warmGeneration && renderer.info === info
      && renderer.getContext() === gl && !gl.isContextLost();
  };
  if (!valid()) return;
  const yieldForFrameBudget = createFrameBudgetYielder(8);
  const warmedSpecs = new Set<string>();
  const roster = [...entities];
  const fallbackProbes = new Map<string, WreckFallbackProbe>();
  for (const entity of roster) {
    if (!valid()) return;
    const visual = entity.visual;
    if (!visual) continue;
    await warmBurntVariant(
      entity, prebakeBurntSteps, anisotropy, warmedSpecs, yieldForFrameBudget, valid,
    );
    if (!valid()) return;
    const uniforms = warmWreckVisual(visual, renderer, compilePrograms, fallbackProbes, valid);
    if (!await consumeWreckUniformSteps(uniforms, yieldForFrameBudget, valid)) return;
    if (!valid()) return;
    await yieldForFrameBudget(true);
    if (!valid()) return;
  }

  if (!valid()) return;
  if (fallbackProbes.size) {
    warmWreckFallbackProbe({
      candidates: [...fallbackProbes.values()],
      scene,
      camera,
      compilePrograms,
      warmRender,
    });
  }
  if (!valid()) return;
  await yieldForFrameBudget(true);
  valid();
}

interface BattleFxPort {
  group: Object3D & { userData: { softParticles?: { layer?: number } } };
  warmTextures?(): void;
  warmTexturesChunked?(
    yieldForBudget: WorkYielder,
    options?: { assets?: 'preload' | 'ready-only' },
  ): Promise<void>;
  warmOpeningEffects(
    position: Vector3,
    direction: Vector3,
    normal: Vector3,
    distance: number,
  ): void;
  impact(kind: string, position: Vector3, normal: Vector3, caliberMm: number): void;
  dust(position: Vector3, direction: Vector3, scale: number): void;
  exhaust(position: Vector3, scale: number, moving: boolean): void;
  update(dt: number, shells: RuntimeValue[], camera: Camera): void;
  destruction(position: Vector3, source: null, kind: 'shot' | 'ammorack'): void;
  armorScar?(
    visual: { root: Object3D },
    position: Vector3,
    normal: Vector3,
    caliberMm: number,
  ): void;
  clearVehicleDecals?(visual: { root: Object3D }): void;
  resetAll(): void;
}

interface StudioFxPort extends BattleFxPort {
  preloadTextures?(): Promise<RuntimeValue>;
  impact(kind: string, position: Vector3, normal: Vector3, caliberMm: number): void;
  dust(position: Vector3, direction: Vector3, scale: number): void;
  exhaust(position: Vector3, scale: number, moving: boolean): void;
  propBreak(
    kind: string,
    position: Vector3,
    direction: Vector3,
    heightM: number,
  ): void;
  propCrush(position: Vector3, direction: Vector3, heightM: number): void;
}

interface BattlePostPort {
  prepareSoftParticles(): void;
}

export interface OpeningEffectsWarmOptions {
  signal?: AbortSignal;
  renderer?: Pick<WebGLRenderer, 'info' | 'getContext'>;
  timing?: ForwardProgramCompileTiming;
  fx: BattleFxPort & {
    warmProjectilePresentation(position: Vector3, direction: Vector3): void;
    composeFiringMoment(options: {
      muzzlePos: Vector3;
      dir: Vector3;
      caliberMm: number;
      tracerType: 'APFSDS';
      ageS: number;
    }): void;
  };
  post: BattlePostPort;
  camera: Camera;
  shells: RuntimeValue[];
  decalVisual?: { root: Object3D } | null;
  compilePrograms(root: Object3D, timing?: ForwardProgramCompileTiming): void;
  /** Covered real compositor submission, including the active late-FX pass. */
  warmRender(): void;
}

let studioEffectsWarmed = false;
let studioEffectsWarmPromise: Promise<void> | null = null;
let warmGeneration = 0;

export interface StudioWarmTrace {
  stages: Record<string, number>;
  totalMs: number;
  error?: string;
}

export interface StudioEffectsWarmOptions {
  fx: StudioFxPort;
  post: BattlePostPort;
  renderer: Pick<WebGLRenderer, 'initTexture'>;
  camera: Camera;
  initializeForwardPrograms(root: Object3D): Iterable<RuntimeValue>;
  isCombatPipelineWarmed(): boolean;
  onProgress?(fraction: number, label: string): void;
  onTrace?(trace: StudioWarmTrace): void;
  now?: () => number;
}

/** Prime shared Studio effects without importing the battle warm into garage boot. */
export function warmStudioEffects({
  fx,
  post,
  renderer,
  camera,
  initializeForwardPrograms,
  isCombatPipelineWarmed,
  onProgress,
  onTrace,
  now = () => performance.now(),
}: StudioEffectsWarmOptions): Promise<void> {
  if (isCombatPipelineWarmed() || studioEffectsWarmed) {
    onProgress?.(1, 'Studio effects ready');
    return Promise.resolve();
  }
  if (studioEffectsWarmPromise) {
    return studioEffectsWarmPromise.then(() => {
      onProgress?.(1, 'Studio effects ready');
    });
  }

  const generation = warmGeneration;
  const request = (async () => {
    const yieldForLoad = createOpaqueLoadingYielder(10, 64);
    const trace: StudioWarmTrace = { stages: {}, totalMs: 0 };
    const startedAt = now();
    let markedAt = startedAt;
    const mark = (name: string): void => {
      const marked = now();
      trace.stages[name] = Math.round(marked - markedAt);
      markedAt = marked;
    };
    onProgress?.(0.08, 'Baking Studio effects');
    try {
      if (fx.warmTexturesChunked) {
        await fx.warmTexturesChunked(yieldForLoad);
      } else {
        await fx.preloadTextures?.();
        fx.warmTextures?.();
      }
      mark('textures');
      onProgress?.(0.58, 'Priming Studio effects');
      await yieldForLoad(true);
      const position = new Vector3(-460, 0, -460);
      const normal = new Vector3(0, 1, 0);
      const direction = new Vector3(0, 0, 1);
      fx.warmOpeningEffects(position, direction, normal, 120);
      await yieldForLoad();
      fx.destruction(position, null, 'shot');
      await yieldForLoad();
      fx.destruction(position, null, 'ammorack');
      await yieldForLoad();
      fx.update(1 / 60, [], camera);
      post.prepareSoftParticles();
      await yieldForLoad();
      const layerMask = camera.layers.mask;
      camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
      try {
        for (const _step of initializeForwardPrograms(fx.group)) {
          await yieldForLoad();
        }
        fx.group.traverse((object) => {
          const renderObject = object as Object3D & {
            material?: object | object[];
          };
          const materials = Array.isArray(renderObject.material)
            ? renderObject.material : (renderObject.material ? [renderObject.material] : []);
          for (const material of materials) {
            for (const value of Object.values(material)) {
              if (typeof value !== 'object' || value === null || !('isTexture' in value)) continue;
              try {
                renderer.initTexture(value as Parameters<WebGLRenderer['initTexture']>[0]);
              } catch (_) { /* first render fallback */ }
            }
          }
        });
        await yieldForLoad(true);
      } finally {
        camera.layers.mask = layerMask;
      }
      mark('effects');
    } catch (error) {
      console.warn('[warm] Studio pipeline failed (continuing):', error);
      trace.error = String(error);
    } finally {
      fx.resetAll();
    }
    onProgress?.(1, 'Studio effects ready');
    trace.totalMs = Math.round(now() - startedAt);
    if (generation === warmGeneration) studioEffectsWarmed = true;
    onTrace?.(trace);
  })();
  studioEffectsWarmPromise = request;
  request.catch(() => {
    if (studioEffectsWarmPromise === request) studioEffectsWarmPromise = null;
  });
  return request;
}

interface ShellSpecLike {
  velocityMps: number;
  caliberMm?: number;
}

interface WarmShell {
  pos: Vector3;
  prevPos: Vector3;
}

type WarmShellFactory = (
  shellSpec: ShellSpecLike,
  shooterId: string,
  isPlayer: boolean,
  muzzlePosition: Vector3,
  direction: Vector3,
  id: number,
) => WarmShell;

export interface CombatFxSubmissionOptions {
  game: BattleWarmGame;
  fx: StudioFxPort;
  post: BattlePostPort;
  camera: Camera;
  createShell: WarmShellFactory;
}

export interface CombatFxSubmission {
  staged: boolean;
  restore(): void;
}

/** Stage every first-combat FX pool behind the covered deployment compile. */
export function stageCombatFxProgramSubmission({
  game,
  fx,
  post,
  camera,
  createShell,
}: CombatFxSubmissionOptions): CombatFxSubmission {
  const playerPosition = game.player?.state?.pos;
  const position = playerPosition
    ? new Vector3(playerPosition.x, playerPosition.y + 1.4, playerPosition.z + 4)
    : new Vector3(0, 2, 4);
  const normal = new Vector3(0, 1, 0);
  const direction = new Vector3(0, 0, 1);
  const priorMask = camera.layers.mask;
  const rootWasVisible = fx.group.visible;
  let staged = false;
  try {
    const gun = game.player?.spec?.gun;
    const shellSlot = game.player?.combat?.shellSlot ?? 0;
    const shellSpec = gun?.shells?.[shellSlot] ?? gun?.shells?.[0] ?? null;
    fx.warmOpeningEffects(position, direction, normal, shellSpec?.caliberMm ?? 120);
    for (const kind of [
      'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era', 'spaced_absorb',
    ]) fx.impact(kind, position, normal, 120);
    fx.dust(position, direction, 1);
    fx.exhaust(position, 1, true);
    fx.destruction(position, null, 'shot');
    fx.destruction(position, null, 'ammorack');
    for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
      fx.propBreak(kind, position, direction, 1.5);
    }
    fx.propCrush(position, direction, 7);
    const warmShells: WarmShell[] = [];
    if (shellSpec) {
      const shell = createShell(
        shellSpec, '__deployment_warm__', true, position, direction, -1,
      );
      shell.prevPos.copy(position).addScaledVector(direction, -4);
      shell.pos.copy(position).addScaledVector(direction, 4);
      warmShells.push(shell);
    }
    try { fx.update(0.016, warmShells, camera); } catch (_) { /* warm only */ }
    post.prepareSoftParticles();
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    fx.group.visible = true;
    staged = true;
  } catch (error) {
    console.warn('[warm] combat FX program staging failed (continuing):', error);
  }
  return {
    staged,
    restore() {
      fx.group.visible = rootWasVisible;
      camera.layers.mask = priorMask;
      fx.resetAll();
    },
  };
}

interface NetworkScarStage {
  visual: { root: Object3D };
  visible: boolean;
  detached: boolean;
  objects: Array<{ object: Object3D; parent: Object3D | null; visible: boolean; removed(): void }>;
}

function createOpeningEffectsLease({ renderer, signal }: OpeningEffectsWarmOptions) {
  const generation = warmGeneration;
  const info = renderer?.info;
  const gl = renderer?.getContext();
  const current = (): boolean => generation === warmGeneration && (!renderer ||
    (renderer.info === info && renderer.getContext() === gl && !!gl && !gl.isContextLost()));
  return {
    current,
    valid(): boolean { signal?.throwIfAborted(); return current(); },
  };
}

function scarStillAttached(scar: NetworkScarStage): boolean {
  return !scar.detached && scar.objects.every(({ object, parent }) => object.parent === parent);
}

function hideNetworkScar(scar: NetworkScarStage): void {
  for (const { object, parent } of scar.objects) if (object.parent === parent) object.visible = false;
}

function restoreNetworkScarObjects(scar: NetworkScarStage): void {
  if (scar.detached) return;
  for (const { object, parent, visible } of scar.objects) {
    // A returned pooled mesh needs its own visibility back; a mesh reused by
    // another root no longer belongs to this warm and must not be mutated.
    if (object.parent === parent || object.parent === null) object.visible = visible;
  }
}

function captureNetworkScarObject(scar: NetworkScarStage, object: Object3D): void {
  const visible = object.visible;
  const removed = (): void => {
    // Three dispatches removal synchronously, before this mesh can be borrowed
    // from the decal pool again. Never let a later owner inherit our hidden flag.
    object.removeEventListener('removed', removed);
    object.visible = visible;
    scar.detached = true;
  };
  object.addEventListener('removed', removed);
  scar.objects.push({ object, parent: object.parent, visible, removed });
}

function stageNetworkArmorScar(
  options: OpeningEffectsWarmOptions,
  scar: NetworkScarStage,
  valid: () => boolean,
): Generator<void, void, void> | null {
  const { fx, camera, compilePrograms, renderer, timing } = options;
  const root = scar.visual.root;
  const priorMask = camera.layers.mask;
  const beforeObjects = new Set<Object3D>();
  root.traverse((object) => beforeObjects.add(object));
  try {
    root.visible = true;
    const position = root.getWorldPosition(new Vector3());
    position.y += 0.5;
    fx.armorScar?.(scar.visual, position, new Vector3(0, 1, 0), 120);
    if (!valid()) return null;
    const before = renderer ? snapshotRendererPrograms(renderer) : null;
    compilePrograms(root, timing);
    if (!valid() || !renderer || !before) return null;
    return captureNewProgramUniformSteps(renderer, before, { isCurrent: valid, timing });
  } finally {
    root.traverse((object) => {
      if (!beforeObjects.has(object)) {
        captureNetworkScarObject(scar, object);
      }
    });
    hideNetworkScar(scar);
    root.visible = scar.visible;
    camera.layers.mask = priorMask;
  }
}

async function warmNetworkScarPrograms(
  uniforms: Generator<void, void, void> | null,
  scar: NetworkScarStage,
  valid: () => boolean,
): Promise<boolean> {
  if (!uniforms) return valid() && scarStillAttached(scar);
  try {
    for (const _step of uniforms) {
      hideNetworkScar(scar);
      await nextPaintFrame();
      if (!valid() || !scarStillAttached(scar)) return false;
    }
  } finally { uniforms.return(); }
  return valid() && scarStillAttached(scar);
}

async function warmNetworkEffectTextures(options: OpeningEffectsWarmOptions, valid: () => boolean): Promise<boolean> {
  const yieldFrame = async (): Promise<void> => {
    await nextPaintFrame();
    if (!valid()) throw new Error('Opening effects renderer changed');
  };
  await yieldFrame();
  if (!valid()) return false;
  const { fx } = options;
  if (fx.warmTexturesChunked) {
    await fx.warmTexturesChunked(createFrameBudgetYielder(8, { yieldFrame }), { assets: 'ready-only' });
  } else fx.warmTextures?.();
  if (!valid()) return false;
  await yieldFrame();
  return valid();
}

function stageAndRenderNetworkEffects({ fx, post, camera, warmRender }: OpeningEffectsWarmOptions): void {
  const direction = camera.getWorldDirection(new Vector3());
  const position = camera.getWorldPosition(new Vector3()).addScaledVector(direction, 10);
  const normal = new Vector3(0, 1, 0);
  fx.warmOpeningEffects(position, direction, normal, 120);
  for (const kind of [
    'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era', 'spaced_absorb',
  ]) fx.impact(kind, position, normal, 120);
  fx.dust(position, direction, 1);
  fx.exhaust(position, 1, true);
  fx.destruction(position, null, 'shot');
  fx.destruction(position, null, 'ammorack');
  // No yield/update time may expire these exact pooled instances before the
  // actual compositor draw, including its separate late-FX/depth-copy pass.
  fx.composeFiringMoment({
    muzzlePos: position, dir: direction, caliberMm: 120, tracerType: 'APFSDS', ageS: 0.016,
  });
  fx.update(0, [], camera);
  fx.warmProjectilePresentation(position, direction);
  post.prepareSoftParticles();
  camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
  fx.group.visible = true;
  // Do not subtree-compile this attached FX root: Three would count its lights twice.
  warmRender();
}

function renderNetworkOpeningEffects(
  options: OpeningEffectsWarmOptions,
  scar: NetworkScarStage | null,
  valid: () => boolean,
): void {
  const { fx, camera } = options;
  const mask = camera.layers.mask;
  const visible = fx.group.visible;
  const rootVisible = scar?.visual.root.visible;
  try {
    if (scar) { restoreNetworkScarObjects(scar); scar.visual.root.visible = true; }
    stageAndRenderNetworkEffects(options);
    valid();
  } finally {
    camera.layers.mask = mask;
    fx.group.visible = visible;
    if (scar && !scar.detached) scar.visual.root.visible = rootVisible!;
  }
}

function cleanupNetworkOpeningEffects(
  options: OpeningEffectsWarmOptions,
  scar: NetworkScarStage | null,
  fxStaged: boolean,
  current: () => boolean,
): void {
  const ownsScar = !scar || scarStillAttached(scar);
  try {
    if (scar) {
      for (const { object, removed } of scar.objects) object.removeEventListener('removed', removed);
      restoreNetworkScarObjects(scar);
      if (ownsScar) options.fx.clearVehicleDecals?.(scar.visual);
    }
  } finally {
    // A cancelled atlas/scar wait has not emitted live FX and must not reset
    // a newer entry's shared pools. Synchronous staging always owns cleanup.
    if (fxStaged || (ownsScar && !options.signal?.aborted && current())) options.fx.resetAll();
  }
}

/** Restore first-shot FX on every covered entry, including after GPU suspension. */
export async function warmNetworkOpeningEffects(options: OpeningEffectsWarmOptions): Promise<void> {
  const { fx, decalVisual = null, signal } = options;
  signal?.throwIfAborted();
  const lease = createOpeningEffectsLease(options);
  if (!lease.valid()) return;
  let scar: NetworkScarStage | null = null;
  let fxStaged = false;
  try {
    if (!await warmNetworkEffectTextures(options, lease.valid)) return;
    if (decalVisual && fx.armorScar) {
      scar = { visual: decalVisual, visible: decalVisual.root.visible, detached: false, objects: [] };
      const uniforms = stageNetworkArmorScar(options, scar, lease.valid);
      if (!await warmNetworkScarPrograms(uniforms, scar, lease.valid)) return;
      if (!lease.valid() || !scarStillAttached(scar)) return;
    }
    if (!lease.valid()) return;
    fxStaged = true;
    renderNetworkOpeningEffects(options, scar, lease.valid);
  } catch (error) {
    signal?.throwIfAborted();
    console.warn('[warm] opening effects failed (continuing):', error);
  } finally { cleanupNetworkOpeningEffects(options, scar, fxStaged, lease.current); }
}

/** WebGL context restoration invalidates every renderer-lifetime receipt. */
export function invalidateBattleWarmRuntime(): void {
  studioEffectsWarmed = false;
  studioEffectsWarmPromise = null;
  warmGeneration += 1;
}

type WarmGenerator = Generator<object | void, object | void, void>;

interface CombatWarmFxPort extends StudioFxPort {
  muzzleFlash(position: Vector3, direction: Vector3, caliberMm: number): void;
  armorScar(
    visual: { root: Object3D },
    position: Vector3,
    normal: Vector3,
    caliberMm: number,
  ): void;
}

interface CombatWarmWorld extends BattleWarmWorld {
  group?: Object3D;
}

interface CombatWarmLightingPort {
  updateFrustums?(): void;
}

interface CombatWarmTrace {
  stages: Record<string, number>;
  effectDetail?: Record<string, RuntimeValue>;
  hiddenDetail?: Record<string, RuntimeValue>;
  totalMs?: number;
}

interface CombatWarmWindow extends Window {
  __COMBAT_OPENING_WARM?: CombatWarmTrace;
  __COMBAT_RARE_WARM?: CombatWarmTrace;
  __COMBAT_WARM?: {
    opening: CombatWarmTrace | null;
    rare: CombatWarmTrace;
    totalMs: number;
  };
}

/**
 * Exact integration ports used by the fallback solo/capture warm path. The
 * owner is loaded only after Battle or deterministic-capture intent, while
 * retaining the existing generators and their synchronous drain contract.
 * Main supplies renderer-owned services without leaking its composition-root
 * state into this isolated battle-only module.
 */
export interface CombatWarmRuntimeContext {
  game: BattleWarmGame;
  fx: CombatWarmFxPort;
  post: BattlePostPort;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  scene: Scene;
  world(): CombatWarmWorld | null;
  warmRender(): RuntimeValue;
  deploymentShadowWarm: DeploymentShadowWarmOwner;
  forwardProgramWarm: ForwardProgramWarmOwner;
  lighting: CombatWarmLightingPort;
  scratch1: Vector3;
  scratch2: Vector3;
  scratch3: Vector3;
  anisotropy: number;
  ensureStagedVisuals(count: number): boolean;
  prebakeBurntSteps(specId: string, anisotropy: number): Iterable<void>;
  warmWreckTextures(renderer: WebGLRenderer): void;
  createIsolatedForwardWarmBatches(
    options: IsolatedForwardWarmOptions,
  ): Iterable<DeploymentForwardWarmBatch>;
  isOpeningReady(): boolean;
  isRareReady(): boolean;
  markOpeningReady(): void;
  markRareReady(): void;
  isDestructionWarmed(): boolean;
  setDestructionWarmed(warmed: boolean): void;
}

function* prebakeDestroyedVariantSteps(
  context: CombatWarmRuntimeContext,
  specId: string,
): Generator<void, void, void> {
  try {
    yield* context.prebakeBurntSteps(specId, context.anisotropy);
  } catch (_) { /* warm only */ }
}

/** Preserve the synchronous solo/capture drain; only network wreck warming is cooperative. */
function initializeNewProgramUniforms(renderer: WebGLRenderer, before: number): void {
  const programs = renderer.info.programs || [];
  for (let index = before; index < programs.length; index += 1) {
    try { programs[index]?.getUniforms?.(); } catch (_) { /* warm only */ }
  }
}

function warmDestroyedVisual(
  context: CombatWarmRuntimeContext,
  visual: BattleWarmVisual & Required<Pick<BattleWarmVisual, 'root' | 'setDestroyed' | 'resetDestroyed'>>,
): void {
  const { renderer, forwardProgramWarm } = context;
  const rootWasVisible = visual.root.visible;
  try {
    visual.setDestroyed({ pop: true, ageS: 0 });
    visual.root.visible = true;
    const before = (renderer.info.programs || []).length;
    forwardProgramWarm.compile(visual.root);
    initializeNewProgramUniforms(renderer, before);
  } catch (_) { /* warm only */ }
  finally {
    try { visual.resetDestroyed(); } catch (_) { /* warm only */ }
    visual.root.visible = rootWasVisible;
  }
}

function warmDestroyedTrackState(visual: BattleWarmVisual): void {
  if (!visual.setTrackState) return;
  try {
    visual.setTrackState('trackL', true);
    visual.setTrackState('trackL', false);
  } catch (_) { /* warm only */ }
}

function* warmDestroyedRosterVariantsSteps(
  context: CombatWarmRuntimeContext,
): WarmGenerator {
  const { game } = context;
  for (const entity of game.tanks.slice()) {
    const visual = entity.visual;
    if (!entity.specId || !visual?.root || !visual.setDestroyed || !visual.resetDestroyed) continue;
    for (const _ of prebakeDestroyedVariantSteps(context, entity.specId)) yield;
    warmDestroyedVisual(context, visual as BattleWarmVisual & Required<Pick<
      BattleWarmVisual, 'root' | 'setDestroyed' | 'resetDestroyed'
    >>);
    warmDestroyedTrackState(visual);
    yield;
  }
  return undefined;
}

function* compileHiddenVariantsSteps(
  context: CombatWarmRuntimeContext,
  detail: Record<string, RuntimeValue> | null = null,
  execution: CombatWarmExecution = { cooperative: false },
): WarmGenerator {
  const {
    game, renderer, camera, forwardProgramWarm, lighting,
  } = context;
  const generation = warmGeneration;
  const lifetime = execution.cooperative ? { info: renderer.info, gl: renderer.getContext() } : null;
  const valid = (): boolean => !lifetime || (generation === warmGeneration
    && renderer.info === lifetime.info && renderer.getContext() === lifetime.gl
    && !lifetime.gl.isContextLost?.());
  const assertCurrent = (): void => {
    if (!valid()) throw new ProgramUniformPreparationError({ status: 'incomplete', reason: 'invalidated', pending: null });
  };
  const timing: ForwardProgramCompileTiming = {};
  if (detail) {
    detail.programs = timing;
    detail.programPendingScope = 'latest captured cohort; bounded best-effort readiness, not an aggregate completion guarantee';
  }
  const compile = (object: Object3D): void => {
    const startedAt = performance.now();
    try { forwardProgramWarm.compile(object, timing); }
    finally {
      if (detail) {
        const elapsed = performance.now() - startedAt;
        detail.compileCount = Number(detail.compileCount ?? 0) + 1;
        detail.compileMs = Number(detail.compileMs ?? 0) + elapsed;
        detail.maxCompileMs = Math.max(Number(detail.maxCompileMs ?? 0), elapsed);
      }
    }
  };
  const compileAll = function* (root: Object3D): WarmGenerator {
    const objects: Object3D[] = [];
    root.traverse((object) => {
      const renderable = object as Object3D & {
        isMesh?: boolean;
        isPoints?: boolean;
        isLine?: boolean;
        isSprite?: boolean;
      };
      if (renderable.isMesh || renderable.isPoints || renderable.isLine || renderable.isSprite) {
        objects.push(object);
      }
    });
    let sliceAt = performance.now();
    for (const object of objects) {
      assertCurrent();
      const wasVisible = object.visible;
      let uniforms: Generator<void, void, void> | null = null;
      let drainSubmitted: (() => void) | null = null;
      try {
        object.visible = true;
        if (execution.cooperative) {
          const before = snapshotRendererPrograms(renderer);
          compile(object);
          assertCurrent();
          // Capture before restoring the staged object; consume only afterwards.
          uniforms = captureNewProgramUniformSteps(renderer, before, { isCurrent: valid, timing });
          const submitted = (renderer.info.programs || []).filter(program => !before.has(program))
            .map(program => ({ program, handle: program.program }));
          drainSubmitted = () => {
            assertCurrent();
            const visible = object.visible;
            try {
              object.visible = true;
              for (const entry of submitted) {
                if (entry.program.program !== entry.handle || !renderer.info.programs?.includes(entry.program)) continue;
                try { entry.program.getUniforms(); } catch (_) { /* legacy synchronous drain */ }
              }
            } finally { object.visible = visible; }
          };
        } else {
          const before = (renderer.info.programs || []).length;
          compile(object);
          initializeNewProgramUniforms(renderer, before);
        }
      } catch (_) { assertCurrent(); /* warm only */ }
      finally {
        object.visible = wasVisible;
      }
      try {
        if (uniforms) {
          for (const _step of uniforms) {
            yield COMBAT_WARM_PROGRAM_CHECKPOINT;
            assertCurrent();
            if (!execution.cooperative) {
              // drain() may resume this exact suspended generator. Never spin
              // a cooperative KHR poller synchronously or restart its effects.
              uniforms.return();
              drainSubmitted?.();
              break;
            }
          }
        }
      } finally { uniforms?.return(); }
      assertCurrent();
      if (performance.now() - sliceAt >= 6) {
        yield;
        sliceAt = performance.now();
      }
    }
    return undefined;
  };

  for (const entity of game.tanks) {
    assertCurrent();
    if (!entity.visual?.root) continue;
    try { yield* compileAll(entity.visual.root); } catch (_) { assertCurrent(); /* warm only */ }
    yield;
  }
  assertCurrent();
  const world = context.world();
  if (world?.group) {
    try { yield* compileAll(world.group); } catch (_) { assertCurrent(); /* warm only */ }
    yield;
    for (const _ of forwardProgramWarm.linkerBreathingSlices(40)) {
      yield;
      assertCurrent();
    }
  }
  assertCurrent();

  const flips: Object3D[] = [];
  const collectFlips = (): void => {
    flips.length = 0;
    for (const entity of game.tanks) {
      if (!entity.visual?.root) continue;
      entity.visual.root.traverse((object) => {
        if (object.visible === false) {
          flips.push(object);
          object.visible = true;
        }
      });
    }
  };
  const unflip = (): void => {
    for (const object of flips) object.visible = false;
  };

  try {
    collectFlips();
    lighting?.updateFrustums?.();
    const renderAt = performance.now();
    context.warmRender();
    if (detail) detail.baseRenderMs = Math.round(performance.now() - renderAt);
    unflip();
  } catch (_) { unflip(); }
  yield;
  assertCurrent();

  for (const fov of [20, 8]) {
    const priorFov = camera.fov;
    try {
      collectFlips();
      camera.fov = fov;
      camera.updateProjectionMatrix();
      lighting?.updateFrustums?.();
      const renderAt = performance.now();
      context.warmRender();
      if (detail) detail[`scope${fov}RenderMs`] = Math.round(performance.now() - renderAt);
    } catch (_) { /* warm only */ }
    finally {
      camera.fov = priorFov;
      camera.updateProjectionMatrix();
      unflip();
    }
    yield;
    assertCurrent();
  }
  lighting?.updateFrustums?.();
  return undefined;
}

export function* createCombatOpeningWarmSteps(
  context: CombatWarmRuntimeContext,
): WarmGenerator {
  if (context.isOpeningReady()) return;
  const { game, fx, post, renderer, camera, scene } = context;
  const warmTrace: CombatWarmTrace = { stages: {} };
  const warmStartedAt = performance.now();
  let warmMarkedAt = warmStartedAt;
  const markWarmStage = (name: string): void => {
    const now = performance.now();
    warmTrace.stages[name] = Math.round(now - warmMarkedAt);
    warmMarkedAt = now;
  };

  fx.warmTextures?.();
  while (!context.ensureStagedVisuals(1)) yield;
  yield;
  markWarmStage('visuals');
  for (const entity of game.tanks) entity.visual?.prewarmBurn?.();
  markWarmStage('rosterHooks');

  const effectDetail: Record<string, RuntimeValue> = {};
  let effectDetailAt = performance.now();
  const markEffectDetail = (name: string): void => {
    const now = performance.now();
    effectDetail[name] = Math.round(now - effectDetailAt);
    effectDetailAt = now;
  };
  markEffectDetail('start');
  {
    const position = new Vector3(-460, 0, -460);
    const normal = new Vector3(0, 1, 0);
    const direction = new Vector3(0, 0, 1);
    const rootWasVisible = fx.group.visible;
    fx.group.visible = false;
    try {
      fx.muzzleFlash(position, direction, 120);
      yield;
      for (const kind of [
        'pen', 'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era',
        'spaced_absorb', 'terrain',
      ]) {
        fx.impact(kind, position, normal, 120);
        yield;
      }
      fx.dust(position, direction, 1);
      fx.exhaust(position, 1, true);
      yield;
      markEffectDetail('openingEffects');
      try { fx.update(0.016, game.shells ?? [], camera); } catch (_) { /* warm only */ }
      const softParticlesAt = performance.now();
      post.prepareSoftParticles();
      effectDetail.softParticles = Math.round(performance.now() - softParticlesAt);
      const warmLayerMask = camera.layers.mask;
      camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
      try {
        const before = (renderer.info.programs || []).length;
        const forwardAt = performance.now();
        const batches: DeploymentForwardWarmBatch[] = [];
        for (const batch of context.createIsolatedForwardWarmBatches({
          scene, root: fx.group, warmRender: context.warmRender, cohortSize: 1,
        })) {
          batches.push(batch);
          yield;
        }
        const programs = renderer.info.programs || [];
        effectDetail.forwardPrograms = {
          added: Math.max(0, programs.length - before),
          wallMs: Math.round(performance.now() - forwardAt),
        };
        effectDetail.warmRenderBatches = batches;
        effectDetail.warmRender = batches.reduce((sum, batch) => sum + batch.ms, 0);
      } finally {
        camera.layers.mask = warmLayerMask;
      }
    } catch (error) {
      console.warn('[warm] fx volley failed (continuing):', error);
    } finally {
      fx.group.visible = rootWasVisible;
    }
    fx.resetAll();
  }
  warmTrace.effectDetail = effectDetail;
  markWarmStage('effects');
  if (!fx.group.userData.battleTexturesStaged) {
    fx.group.traverse((object) => {
      const renderable = object as Object3D & { material?: Material | Material[] };
      const materials = Array.isArray(renderable.material)
        ? renderable.material : (renderable.material ? [renderable.material] : []);
      for (const material of materials) {
        initializeMaterialTextures(renderer, material);
      }
    });
  }
  yield;
  markWarmStage('textures');
  context.markOpeningReady();
  warmTrace.totalMs = Math.round(performance.now() - warmStartedAt);
  if (typeof window !== 'undefined') {
    (window as CombatWarmWindow).__COMBAT_OPENING_WARM = warmTrace;
  }
}

function* warmCombatDestructionEffectSteps(
  context: CombatWarmRuntimeContext,
): WarmGenerator {
  if (context.isDestructionWarmed()) return { cached: true, totalMs: 0, batches: 0 };
  const { game, fx, post, camera, scene } = context;
  const startedAt = performance.now();
  const playerPosition = game.player?.state?.pos;
  const position = playerPosition
    ? new Vector3(playerPosition.x, playerPosition.y + 1.4, playerPosition.z + 4)
    : new Vector3(0, 2, 4);
  context.scratch3.set(1, 0, 0);
  const rootWasVisible = fx.group.visible;
  let batches = 0;
  let maxBatchMs = 0;
  let error: RuntimeValue = null;
  fx.group.visible = false;
  try {
    fx.destruction(position, null, 'shot');
    yield;
    fx.destruction(position, null, 'ammorack');
    yield;
    for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
      fx.propBreak(kind, position, context.scratch3, 1.5);
      yield;
    }
    fx.propCrush(position, context.scratch3, 7);
    yield;
    try { fx.update(0.016, game.shells ?? [], camera); } catch (_) { /* warm only */ }
    post.prepareSoftParticles();
    const mask = camera.layers.mask;
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    try {
      for (const batch of context.createIsolatedForwardWarmBatches({
        scene, root: fx.group, warmRender: context.warmRender, cohortSize: 1,
      })) {
        batches += 1;
        maxBatchMs = Math.max(maxBatchMs, batch.ms);
        yield batch;
      }
    } finally {
      camera.layers.mask = mask;
    }
  } catch (cause) {
    error = cause;
    console.warn('[warm] combat destruction variants failed (continuing):', cause);
  } finally {
    fx.group.visible = rootWasVisible;
    fx.resetAll();
  }
  if (!error) context.setDestructionWarmed(true);
  return {
    cached: false,
    batches,
    maxBatchMs,
    totalMs: Math.round(performance.now() - startedAt),
    error: error ? String(error) : null,
  };
}

export function* createCombatRareWarmSteps(
  context: CombatWarmRuntimeContext,
  execution?: CombatWarmExecution,
): WarmGenerator {
  if (context.isRareReady()) return;
  if (!context.isOpeningReady()) yield* createCombatOpeningWarmSteps(context);
  const { game, fx, renderer } = context;
  const rareTrace: CombatWarmTrace = { stages: {} };
  const startedAt = performance.now();
  let markedAt = startedAt;
  const mark = (name: string): void => {
    const now = performance.now();
    rareTrace.stages[name] = Math.round(now - markedAt);
    markedAt = now;
  };

  yield* warmDestroyedRosterVariantsSteps(context);
  mark('wreckVariants');
  for (const entity of game.tanks) {
    if (!entity.visual?.root || !entity.state) continue;
    context.scratch1.copy(entity.state.pos);
    context.scratch1.y += (entity.spec?.dims?.heightM || 2.4) * 0.5;
    context.scratch2.set(0, 0, 1);
    try { fx.armorScar({ root: entity.visual.root }, context.scratch1, context.scratch2, 100); }
    catch (_) { /* warm only */ }
    yield;
  }
  mark('armorScars');
  yield* warmCombatDestructionEffectSteps(context);
  mark('destructionEffects');

  context.warmWreckTextures(renderer);
  fx.group.traverse((object) => {
    const renderable = object as Object3D & { material?: Material | Material[] };
    const materials = Array.isArray(renderable.material)
      ? renderable.material : (renderable.material ? [renderable.material] : []);
    for (const material of materials) {
      initializeMaterialTextures(renderer, material);
    }
  });
  yield;
  mark('textures');

  for (const _ of context.deploymentShadowWarm.warmDepthProgramSteps()) yield;
  mark('shadows');
  rareTrace.hiddenDetail = { startedAt: performance.now() };
  try { yield* compileHiddenVariantsSteps(context, rareTrace.hiddenDetail, execution); }
  finally { rareTrace.hiddenDetail.finishedAt = performance.now(); }
  mark('hiddenVariants');
  context.markRareReady();
  rareTrace.totalMs = Math.round(performance.now() - startedAt);
  if (typeof window !== 'undefined') {
    const runtimeWindow = window as CombatWarmWindow;
    runtimeWindow.__COMBAT_RARE_WARM = rareTrace;
    runtimeWindow.__COMBAT_WARM = {
      opening: runtimeWindow.__COMBAT_OPENING_WARM || null,
      rare: rareTrace,
      totalMs: (runtimeWindow.__COMBAT_OPENING_WARM?.totalMs || 0) + rareTrace.totalMs,
    };
  }
}
