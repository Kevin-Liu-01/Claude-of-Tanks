import {
  Vector3,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import {
  createFrameBudgetYielder,
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
}
