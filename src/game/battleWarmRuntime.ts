import {
  Vector3,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextFrame,
  type WorkYielder,
} from '../engine/frameScheduler.ts';

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
  prewarmBurn?(): void;
  setDestroyed?(options: { pop: boolean }): void;
  resetDestroyed?(): void;
}

interface BattleWarmEntity {
  specId?: string;
  camo?: string;
  isPlayer?: boolean;
  state?: BattleWarmState;
  visual?: BattleWarmVisual;
  _openingRoute?: unknown[];
  spec?: {
    gun?: {
      shells?: ShellSpecLike[];
    };
  };
  combat?: {
    shellSlot?: number;
  };
}

interface BattleWarmGame {
  tanks: BattleWarmEntity[];
  player?: BattleWarmEntity | null;
  shells?: unknown[];
}

interface TerrainWarmPoint {
  x: number;
  z: number;
  radiusM: number;
}

interface BattleWarmWorld {
  heightField?: {
    warmFastTilesAround(points: TerrainWarmPoint[]): Iterable<unknown>;
  };
  update?(
    dt: number,
    cameraPosition: Vector3,
    cameraForward: Vector3,
    focusPosition: Vec3Like,
  ): void;
}

export interface TerrainWarmOptions {
  game: BattleWarmGame;
  world: BattleWarmWorld | null;
  yieldForBudget?: WorkYielder | null;
  primePresentation?: boolean;
}

/** Prepare exact opening terrain and vegetation caches behind the battle veil. */
export async function warmBattleTerrainTiles({
  game,
  world,
  yieldForBudget = null,
  primePresentation = true,
}: TerrainWarmOptions): Promise<void> {
  const heightField = world?.heightField;
  const warmer = heightField?.warmFastTilesAround;
  if (typeof warmer !== 'function') return;
  const points: TerrainWarmPoint[] = [];
  for (const entity of game.tanks) {
    const position = entity?.state?.pos;
    if (!position) continue;
    points.push({ x: position.x, z: position.z, radiusM: entity.isPlayer ? 64 : 0 });
    if (entity.isPlayer || !Array.isArray(entity._openingRoute)) continue;
    let lastX = position.x;
    let lastZ = position.z;
    let routeM = 0;
    let sinceWarmM = 0;
    for (const waypoint of entity._openingRoute) {
      if (!waypoint) continue;
      const routePoint = waypoint as { [index: number]: unknown };
      const waypointX = Number(routePoint[0]);
      const waypointZ = Number(routePoint[1]);
      if (!Number.isFinite(waypointX) || !Number.isFinite(waypointZ)) continue;
      const stepM = Math.hypot(waypointX - lastX, waypointZ - lastZ);
      routeM += stepM;
      sinceWarmM += stepM;
      lastX = waypointX;
      lastZ = waypointZ;
      if (sinceWarmM >= 24 || routeM >= 70) {
        points.push({ x: waypointX, z: waypointZ, radiusM: 10 });
        sinceWarmM = 0;
      }
      if (routeM >= 70) break;
    }
  }
  for (const _tile of warmer.call(heightField, points)) {
    if (yieldForBudget) await yieldForBudget();
  }

  const focus = game.player || game.tanks.find((entity) => entity?.state);
  if (primePresentation && focus?.state && typeof world?.update === 'function') {
    const yaw = focus.state.yaw || 0;
    const warmCamera = new Vector3(
      focus.state.pos.x - Math.sin(yaw) * 12,
      focus.state.pos.y + 5,
      focus.state.pos.z - Math.cos(yaw) * 12,
    );
    const warmForward = new Vector3(Math.sin(yaw), -0.16, Math.cos(yaw)).normalize();
    world.update(0, warmCamera, warmForward, focus.state.pos);
    if (yieldForBudget) await yieldForBudget(true);
  }
}

type BurnStepFactory = (
  specId: string,
  anisotropy: number,
  selection: string,
) => Iterable<unknown>;

export interface WreckWarmOptions {
  entities: Iterable<BattleWarmEntity>;
  prebakeBurntSteps: BurnStepFactory;
  anisotropy: number;
}

/** Prebuild only the fielded roster's destroyed variants before first blood. */
export async function warmNetworkWrecks({
  entities,
  prebakeBurntSteps,
  anisotropy,
}: WreckWarmOptions): Promise<void> {
  const yieldForFrameBudget = createFrameBudgetYielder(8);
  const warmedSpecs = new Set<string>();
  for (const entity of entities) {
    const visual = entity?.visual;
    if (!visual) continue;
    try { visual.prewarmBurn?.(); } catch (_) { /* warm only */ }
    const selection = entity.camo || 'factory';
    const wreckKey = entity.specId ? `${entity.specId}:${selection}` : '';
    if (wreckKey && entity.specId && !warmedSpecs.has(wreckKey)) {
      warmedSpecs.add(wreckKey);
      try {
        for (const _step of prebakeBurntSteps(entity.specId, anisotropy, selection)) {
          await yieldForFrameBudget();
        }
      } catch (_) { /* warm only */ }
    }
    if (visual.setDestroyed && visual.resetDestroyed) {
      try {
        visual.setDestroyed({ pop: false });
        visual.resetDestroyed();
        visual.setDestroyed({ pop: true });
        visual.resetDestroyed();
      } catch (_) { /* warm only */ }
    }
    await yieldForFrameBudget(true);
  }
}

interface BattleFxPort {
  group: Object3D & { userData: { softParticles?: { layer?: number } } };
  warmTextures?(): void;
  warmOpeningEffects(
    position: Vector3,
    direction: Vector3,
    normal: Vector3,
    distance: number,
  ): void;
  update(dt: number, shells: unknown[], camera: Camera): void;
  destruction(position: Vector3, source: null, kind: 'shot' | 'ammorack'): void;
  resetAll(): void;
}

interface StudioFxPort extends BattleFxPort {
  warmTexturesChunked?(yieldForBudget: WorkYielder): Promise<void>;
  preloadTextures?(): Promise<void>;
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
  fx: BattleFxPort;
  post: BattlePostPort;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  shells: unknown[];
  warmRender(): void;
}

let openingEffectsWarmed = false;
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
  initializeForwardPrograms(root: Object3D): Iterable<unknown>;
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

/** Prime common network muzzle, impact, destruction and soft-particle paths once. */
export async function warmNetworkOpeningEffects({
  fx,
  post,
  renderer,
  scene,
  camera,
  shells,
  warmRender,
}: OpeningEffectsWarmOptions): Promise<void> {
  if (openingEffectsWarmed) return;
  const position = new Vector3(-460, 0, -460);
  const normal = new Vector3(0, 1, 0);
  const direction = new Vector3(0, 0, 1);
  try {
    fx.warmTextures?.();
    fx.warmOpeningEffects(position, direction, normal, 120);
    await nextFrame();
    try { fx.update(0.016, shells, camera); } catch (_) { /* warm only */ }
    fx.destruction(position, null, 'shot');
    await nextFrame();
    try { fx.update(0.016, shells, camera); } catch (_) { /* warm only */ }
    fx.destruction(position, null, 'ammorack');
    await nextFrame();
    try { fx.update(0.016, shells, camera); } catch (_) { /* warm only */ }
    post.prepareSoftParticles();
    const layerMask = camera.layers.mask;
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    try {
      renderer.compile(fx.group, camera, scene);
      warmRender();
    } finally {
      camera.layers.mask = layerMask;
    }
    openingEffectsWarmed = true;
  } catch (error) {
    console.warn('[warm] opening effects failed (continuing):', error);
  } finally {
    fx.resetAll();
  }
}

/** WebGL context restoration invalidates every renderer-lifetime receipt. */
export function invalidateBattleWarmRuntime(): void {
  openingEffectsWarmed = false;
  studioEffectsWarmed = false;
  studioEffectsWarmPromise = null;
  warmGeneration += 1;
}
