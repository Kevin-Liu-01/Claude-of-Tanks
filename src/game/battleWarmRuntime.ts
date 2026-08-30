import {
  Vector3,
  type Camera,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type {
  DeploymentForwardWarmBatch,
  IsolatedForwardWarmOptions,
} from '../engine/deploymentWarm.ts';
import type { DeploymentShadowWarmOwner } from '../engine/deploymentShadowWarm.ts';
import type { ForwardProgramWarmOwner } from '../engine/programWarm.ts';
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
  _openingRoute?: unknown[];
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
    focusPosition: Vector3,
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
    const state = entity?.state;
    const position = state?.pos;
    if (!position) continue;
    points.push({ x: position.x, z: position.z, radiusM: entity.isPlayer ? 64 : 0 });
    if (entity.isPlayer) {
      // A player can cover roughly 140 m during the opening live window. The
      // 64 m deployment disc handles steering; extend a narrow corridor along
      // the spawn heading so ordinary straight-line acceleration never has
      // to synchronously bake a terrain tile after controls unlock. This is
      // only three small, overlapping points—not a costly larger square.
      const yaw = Number(state.yaw) || 0;
      for (const distanceM of [80, 112, 144]) {
        points.push({
          x: position.x + Math.sin(yaw) * distanceM,
          z: position.z + Math.cos(yaw) * distanceM,
          radiusM: 10,
        });
      }
      continue;
    }
    if (!Array.isArray(entity._openingRoute)) continue;
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
      if (sinceWarmM >= 24 || routeM >= 120) {
        points.push({ x: waypointX, z: waypointZ, radiusM: 10 });
        sinceWarmM = 0;
      }
      if (routeM >= 120) break;
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
    const warmFocus = new Vector3(
      focus.state.pos.x,
      focus.state.pos.y,
      focus.state.pos.z,
    );
    world.update(0, warmCamera, warmForward, warmFocus);
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
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  compilePrograms(root: Object3D): void;
  warmRender(): void;
}

type WreckWarmMesh = Object3D & {
  isMesh?: boolean;
  material?: Material | Material[];
  castShadow?: boolean;
  receiveShadow?: boolean;
};

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
    geometry?: {
      attributes?: Record<string, unknown>;
      morphAttributes?: Record<string, unknown[]>;
    };
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
    const candidate = object as WreckWarmMesh & {
      geometry?: { attributes?: Record<string, unknown> };
    };
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
  candidates: Array<{ source: WreckWarmMesh; material: Material }>;
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

/** Prebuild only the fielded roster's destroyed variants before first blood. */
export async function warmNetworkWrecks({
  entities,
  prebakeBurntSteps,
  anisotropy,
  renderer,
  scene,
  camera,
  compilePrograms,
  warmRender,
}: WreckWarmOptions): Promise<void> {
  const yieldForFrameBudget = createFrameBudgetYielder(8);
  const warmedSpecs = new Set<string>();
  const roster = [...entities];
  const fallbackProbes = new Map<string, { source: WreckWarmMesh; material: Material }>();
  for (const entity of roster) {
    const visual = entity?.visual;
    if (!visual) continue;
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
    if (visual.root) {
      const rootWasVisible = visual.root.visible;
      const restoreBattleDetails = visual.stageBattleDetailsForWarm?.() ?? (() => {});
      try {
        visual.root.visible = true;
        const fallbackSources = [
          ...(visual.prewarmBurn?.() ?? []),
          ...potentialFallbackWarmMeshes(visual.root),
        ];
        const before = renderer.info.programs?.length || 0;
        compilePrograms(visual.root);
        const programs = renderer.info.programs || [];
        for (let index = before; index < programs.length; index++) {
          try { programs[index]?.getUniforms?.(); } catch (_) { /* warm only */ }
        }
        const material = visual.getWreckFallbackMaterial?.() ?? null;
        if (material) {
          initializeMaterialTextures(renderer, material);
          for (const source of fallbackSources) {
            const candidate = source as WreckWarmMesh;
            if (!candidate.isMesh || !candidate.material) continue;
            const signature = wreckProbeSignature(candidate);
            if (!fallbackProbes.has(signature)) {
              fallbackProbes.set(signature, { source: candidate, material });
            }
          }
        }
      } catch (_) { /* warm only */ }
      finally {
        try { restoreBattleDetails(); } catch (_) { /* warm only */ }
        visual.root.visible = rootWasVisible;
      }
    }
    await yieldForFrameBudget(true);
  }

  if (fallbackProbes.size) {
    warmWreckFallbackProbe({
      candidates: [...fallbackProbes.values()],
      scene,
      camera,
      compilePrograms,
      warmRender,
    });
  }
  await yieldForFrameBudget(true);
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
  impact(kind: string, position: Vector3, normal: Vector3, caliberMm: number): void;
  dust(position: Vector3, direction: Vector3, scale: number): void;
  exhaust(position: Vector3, scale: number, moving: boolean): void;
  update(dt: number, shells: unknown[], camera: Camera): void;
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
  warmTexturesChunked?(yieldForBudget: WorkYielder): Promise<void>;
  preloadTextures?(): Promise<unknown>;
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
  camera: Camera;
  shells: unknown[];
  decalVisual?: { root: Object3D } | null;
  compilePrograms(root: Object3D): void;
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

/** Prime common network muzzle, impact, destruction and soft-particle paths once. */
export async function warmNetworkOpeningEffects({
  fx,
  post,
  camera,
  shells,
  decalVisual = null,
  compilePrograms,
  warmRender,
}: OpeningEffectsWarmOptions): Promise<void> {
  if (openingEffectsWarmed) return;
  const position = new Vector3(-460, 0, -460);
  const normal = new Vector3(0, 1, 0);
  const direction = new Vector3(0, 0, 1);
  try {
    fx.warmTextures?.();
    fx.warmOpeningEffects(position, direction, normal, 120);
    for (const kind of [
      'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era', 'spaced_absorb',
    ]) fx.impact(kind, position, normal, 120);
    fx.dust(position, direction, 1);
    fx.exhaust(position, 1, true);
    await nextFrame();
    try { fx.update(0.016, shells, camera); } catch (_) { /* warm only */ }
    fx.destruction(position, null, 'shot');
    await nextFrame();
    try { fx.update(0.016, shells, camera); } catch (_) { /* warm only */ }
    fx.destruction(position, null, 'ammorack');
    await nextFrame();
    try { fx.update(0.016, shells, camera); } catch (_) { /* warm only */ }
    // Impact particles live under the FX root, but persistent armor scars are
    // created lazily under the struck vehicle. Prime one shared pooled decal
    // mesh while the network loader is opaque so first contact cannot allocate
    // geometry, upload its buffers, and link its material inside a live frame.
    if (decalVisual?.root && fx.armorScar) {
      const rootWasVisible = decalVisual.root.visible;
      try {
        decalVisual.root.visible = true;
        decalVisual.root.getWorldPosition(position);
        position.y += 0.5;
        normal.set(0, 1, 0);
        fx.armorScar(decalVisual, position, normal, 120);
        compilePrograms(decalVisual.root);
      } finally {
        fx.clearVehicleDecals?.(decalVisual);
        decalVisual.root.visible = rootWasVisible;
      }
      await nextFrame();
    }
    post.prepareSoftParticles();
    const layerMask = camera.layers.mask;
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    try {
      compilePrograms(fx.group);
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

type WarmGenerator = Generator<unknown, unknown, unknown>;

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
  effectDetail?: Record<string, unknown>;
  hiddenDetail?: Record<string, unknown>;
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
  warmRender(): unknown;
  deploymentShadowWarm: DeploymentShadowWarmOwner;
  forwardProgramWarm: ForwardProgramWarmOwner;
  lighting: CombatWarmLightingPort;
  scratch1: Vector3;
  scratch2: Vector3;
  scratch3: Vector3;
  anisotropy: number;
  ensureStagedVisuals(count: number): boolean;
  prebakeBurntSteps(specId: string, anisotropy: number): Iterable<unknown>;
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

function* warmDestroyedRosterVariantsSteps(
  context: CombatWarmRuntimeContext,
): WarmGenerator {
  const { game, renderer, forwardProgramWarm } = context;
  for (const entity of game.tanks.slice()) {
    const visual = entity?.visual;
    if (!entity.specId || !visual?.root || !visual.setDestroyed || !visual.resetDestroyed) continue;
    try {
      yield* context.prebakeBurntSteps(entity.specId, context.anisotropy);
    } catch (_) { /* warm only */ }
    const rootWasVisible = visual.root.visible;
    try {
      visual.setDestroyed({ pop: true, ageS: 0 });
      visual.root.visible = true;
      const before = (renderer.info.programs || []).length;
      forwardProgramWarm.compile(visual.root);
      const programs = renderer.info.programs || [];
      for (let index = before; index < programs.length; index += 1) {
        try { programs[index].getUniforms(); } catch (_) { /* warm only */ }
      }
    } catch (_) { /* warm only */ }
    finally {
      try { visual.resetDestroyed(); } catch (_) { /* warm only */ }
      visual.root.visible = rootWasVisible;
    }
    if (visual.setTrackState) {
      try {
        visual.setTrackState('trackL', true);
        visual.setTrackState('trackL', false);
      } catch (_) { /* warm only */ }
    }
    yield;
  }
  return undefined;
}

function* compileHiddenVariantsSteps(
  context: CombatWarmRuntimeContext,
  detail: Record<string, unknown> | null = null,
): WarmGenerator {
  const {
    game, renderer, camera, forwardProgramWarm, lighting,
  } = context;
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
      const wasVisible = object.visible;
      try {
        object.visible = true;
        const before = (renderer.info.programs || []).length;
        forwardProgramWarm.compile(object);
        const programs = renderer.info.programs || [];
        for (let index = before; index < programs.length; index += 1) {
          try { programs[index].getUniforms(); } catch (_) { /* warm only */ }
        }
      } catch (_) { /* warm only */ }
      finally {
        object.visible = wasVisible;
      }
      if (performance.now() - sliceAt >= 6) {
        yield;
        sliceAt = performance.now();
      }
    }
    return undefined;
  };

  for (const entity of game.tanks) {
    if (!entity.visual?.root) continue;
    try { yield* compileAll(entity.visual.root); } catch (_) { /* warm only */ }
    yield;
  }
  const world = context.world();
  if (world?.group) {
    try { yield* compileAll(world.group); } catch (_) { /* warm only */ }
    yield;
    yield* forwardProgramWarm.linkerBreathingSlices(40);
  }

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

  for (const fov of [20, 8]) {
    try {
      collectFlips();
      const priorFov = camera.fov;
      camera.fov = fov;
      camera.updateProjectionMatrix();
      lighting?.updateFrustums?.();
      const renderAt = performance.now();
      context.warmRender();
      if (detail) detail[`scope${fov}RenderMs`] = Math.round(performance.now() - renderAt);
      camera.fov = priorFov;
      camera.updateProjectionMatrix();
      unflip();
    } catch (_) { unflip(); }
    yield;
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

  const effectDetail: Record<string, unknown> = {};
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
  let error: unknown = null;
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

  yield* context.deploymentShadowWarm.warmDepthProgramSteps();
  mark('shadows');
  rareTrace.hiddenDetail = {};
  yield* compileHiddenVariantsSteps(context, rareTrace.hiddenDetail);
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
