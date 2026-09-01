import type { Object3D } from 'three';
import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import { gameModeDefinition, normalizeGameMode } from '../sim/matchModes.ts';
import type { WorkYielder } from '../engine/frameScheduler.ts';
import type { BattleLoadRosterRow, BattleLoadScreen } from '../ui/battleLoad.ts';
import type { WorldRuntime } from '../world/map.ts';
import type { BattlefieldMapConfig } from '../world/maps/index.ts';
import type {
  BattleVisualEntity,
  BattleVisualStreamer,
} from './battleVisualStreamer.ts';

interface LoadingEntity extends BattleVisualEntity {
  isPlayer?: boolean;
}

interface LoadingGame {
  tanks: LoadingEntity[];
  player?: LoadingEntity | null;
}

interface AudioPort {
  resume(): unknown;
  loadingOn(active: boolean): void;
  ambientOn(active: boolean): void;
  warmBattleEvents(): Promise<unknown> | unknown;
}

interface FxRuntime {
  group: Object3D;
  preloadTextures?(): Promise<unknown> | unknown;
  warmTextures?(): unknown;
}

interface BattleIntentPort {
  consumeMap(specId: string, mapId: string): string;
  prepareRoster(options: {
    specId: string;
    mapId: string;
    rosterIds: string[];
    autoCamoIds: string[];
    yieldForBudget: WorkYielder;
  }): Promise<unknown> | unknown;
}

interface EntryAcquisitionPort {
  acquireSolo(tasks: Array<() => Promise<unknown> | unknown>): Promise<unknown>;
}

interface DeploymentPort {
  warm(camoSweep: PromiseLike<unknown> | unknown): Promise<{
    generation: number;
    revealPrimed: boolean;
  }>;
}

interface EntryLifecyclePort {
  primeReveal(): Promise<unknown>;
}

interface BattleLoadTrace {
  map: string;
  worldCached: boolean;
  stages: Record<string, number>;
  fxTextureUpload?: unknown;
  world?: unknown;
  worldTextureUpload?: unknown;
  totalMs?: number;
  loadingElapsedMs?: number;
  visiblePreBattleS?: number;
  expectedClickToControlMs?: number;
}

interface VisualLoadTiming {
  specId: string;
  quality: 'preview';
  startedAt: number;
  buildMs: number;
  prebakeMs: number;
  uploadMs?: number;
  preUploadYieldMs?: number;
  textureUploadMs?: number;
  compileMs?: number;
  postCompileYieldMs?: number;
  totalMs?: number;
}

type LoadingHost = typeof globalThis & {
  __VISUAL_LOAD_TIMINGS?: VisualLoadTiming[];
  __BATTLE_LOAD?: BattleLoadTrace;
  __WORLD_LOAD?: unknown;
};

export interface SoloBattleLoadingRuntimeOptions {
  game: LoadingGame;
  post: { setAdaptiveSuspended(suspended: boolean): void };
  battleIntent: BattleIntentPort;
  battleLoad: BattleLoadScreen;
  audio: AudioPort;
  acquisition: EntryAcquisitionPort;
  deployment: DeploymentPort;
  lifecycle: EntryLifecyclePort;
  getPendingMapId(): string;
  getMapName(mapId: string): string;
  loadMapConfig(mapId: string): Promise<BattlefieldMapConfig>;
  getMapThumb(mapId: string): string;
  hasCachedWorld(mapId: string): boolean;
  getWorld(): WorldRuntime;
  ensureWorld(
    mapId: string,
    onProgress: (fraction: number, label: string) => void,
    options: { precompile: boolean; services: boolean },
  ): Promise<unknown>;
  ensureBattleVisuals(): Promise<unknown>;
  getBattleVisuals(): BattleVisualStreamer;
  ensureBattleHud(): Promise<unknown>;
  preloadMinimap(mapId: string): Promise<unknown>;
  ensureTouchControls(): Promise<unknown>;
  preloadSettings(): Promise<unknown>;
  preloadArmorAim(): Promise<unknown>;
  planRoster(specId: string, randomRoster: boolean): string[];
  planCamoOverrides(specId: string, mapId: string, randomRoster: boolean): string[];
  ensureTankBuilders(specIds: string[]): Promise<unknown>;
  preloadSoloAuthority(): Promise<unknown>;
  preloadBattleClient(): Promise<unknown>;
  preloadBattleWarm(): Promise<unknown>;
  preloadBattleStart(): Promise<unknown>;
  ensureKillcam(): Promise<unknown>;
  ensureFx(): Promise<FxRuntime>;
  startBattle(
    specId: string,
    mapId: string,
    options: {
      deferVisuals: boolean;
      preBattleHold: boolean;
      randomRoster: boolean;
      gameMode?: string;
    },
  ): void;
  prepareBattleWorldServices(world: WorldRuntime): void;
  getPedestalVisual(): unknown;
  prebakeSharedTextures(
    spec: unknown,
    anisotropy: number,
    quality: 'preview',
    yieldForBudget: WorkYielder,
  ): Promise<unknown>;
  anisotropy: number;
  rosterRows(team: string): BattleLoadRosterRow[];
  warmShotCards(specIds: string[]): void;
  getCamoSweep(): PromiseLike<unknown> | unknown;
  prepareRevealCamera(): void;
  resolveVisiblePreBattleSeconds(
    requestedSeconds: number,
    loadingElapsedSeconds: number,
    minimumSeconds: number,
  ): number;
  preBattleHoldSeconds: number;
  minimumVisiblePreBattleSeconds: number;
  openBattle(seconds: number): void;
  scheduleDeferredWarm(generation: number): void;
  nextFrame(): Promise<unknown>;
  createLoadingYielder(budgetMs: number, maxDelayMs: number): WorkYielder;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<unknown>;
}

export interface SoloBattleLoadingRuntime {
  begin(
    specId: string,
    mapId?: string | null,
    options?: SoloBattleLoadingStartOptions,
  ): Promise<void>;
}

export interface SoloBattleLoadingStartOptions {
  randomRoster?: boolean;
  gameMode?: string;
}

function loadingModeLabel(gameMode: string, requestedMapId: string | null): string {
  const battlefield = requestedMapId === 'random' ? 'Any Battlefield' : 'Selected Battlefield';
  if (gameMode === 'standard') {
    return requestedMapId === 'random'
      ? 'Random Battle · Any Battlefield'
      : 'Random Battle · Standard';
  }
  return `${gameModeDefinition(gameMode).label} · ${battlefield}`;
}

function plannedWorldVehicleIds(mapConfig: BattlefieldMapConfig): string[] {
  const tankWrecks = mapConfig.props?.tankWrecks;
  if (!tankWrecks || !('ids' in tankWrecks) || !Array.isArray(tankWrecks.ids)) return [];
  return tankWrecks.ids;
}

function validateLoadingPorts(options: SoloBattleLoadingRuntimeOptions): void {
  try {
    if (!options.game) throw new TypeError('missing game state');
    checkedIntegrationPort(
      options.post ?? {}, 'solo battle loading quality', ['setAdaptiveSuspended'],
    );
    checkedIntegrationPort<BattleIntentPort>(
      options.battleIntent ?? {}, 'solo battle loading intent', ['consumeMap', 'prepareRoster'],
    );
    checkedIntegrationPort<BattleLoadScreen>(
      options.battleLoad ?? {},
      'solo battle loading screen',
      ['show', 'progress', 'rosters', 'hide'],
    );
    checkedIntegrationPort<AudioPort>(
      options.audio ?? {},
      'solo battle loading audio',
      ['resume', 'loadingOn', 'ambientOn', 'warmBattleEvents'],
    );
    checkedIntegrationPort<EntryAcquisitionPort>(
      options.acquisition ?? {}, 'solo battle loading acquisition', ['acquireSolo'],
    );
    checkedIntegrationPort<DeploymentPort>(
      options.deployment ?? {}, 'solo battle loading deployment', ['warm'],
    );
    checkedIntegrationPort<EntryLifecyclePort>(
      options.lifecycle ?? {}, 'solo battle loading lifecycle', ['primeReveal'],
    );
    checkedIntegrationPort(
      {
        getPendingMapId: options.getPendingMapId,
        getMapName: options.getMapName,
        loadMapConfig: options.loadMapConfig,
        getMapThumb: options.getMapThumb,
        hasCachedWorld: options.hasCachedWorld,
        getWorld: options.getWorld,
        ensureWorld: options.ensureWorld,
        ensureBattleVisuals: options.ensureBattleVisuals,
        getBattleVisuals: options.getBattleVisuals,
        ensureBattleHud: options.ensureBattleHud,
        preloadMinimap: options.preloadMinimap,
        ensureTouchControls: options.ensureTouchControls,
        preloadSettings: options.preloadSettings,
        preloadArmorAim: options.preloadArmorAim,
        planRoster: options.planRoster,
        planCamoOverrides: options.planCamoOverrides,
        ensureTankBuilders: options.ensureTankBuilders,
        preloadSoloAuthority: options.preloadSoloAuthority,
        preloadBattleClient: options.preloadBattleClient,
        preloadBattleWarm: options.preloadBattleWarm,
        preloadBattleStart: options.preloadBattleStart,
        ensureKillcam: options.ensureKillcam,
        ensureFx: options.ensureFx,
        startBattle: options.startBattle,
        prepareBattleWorldServices: options.prepareBattleWorldServices,
        getPedestalVisual: options.getPedestalVisual,
        prebakeSharedTextures: options.prebakeSharedTextures,
        rosterRows: options.rosterRows,
        warmShotCards: options.warmShotCards,
        getCamoSweep: options.getCamoSweep,
        prepareRevealCamera: options.prepareRevealCamera,
        resolveVisiblePreBattleSeconds: options.resolveVisiblePreBattleSeconds,
        openBattle: options.openBattle,
        scheduleDeferredWarm: options.scheduleDeferredWarm,
        nextFrame: options.nextFrame,
        createLoadingYielder: options.createLoadingYielder,
        now: options.now ?? (() => performance.now()),
        delay: options.delay ?? (() => Promise.resolve()),
      },
      'solo battle loading orchestration',
      ['getPendingMapId', 'getMapName', 'loadMapConfig', 'getMapThumb',
        'hasCachedWorld', 'getWorld', 'ensureWorld', 'ensureBattleVisuals',
        'getBattleVisuals', 'ensureBattleHud', 'preloadMinimap',
        'ensureTouchControls', 'preloadSettings', 'preloadArmorAim', 'planRoster',
        'planCamoOverrides', 'ensureTankBuilders', 'preloadSoloAuthority',
        'preloadBattleClient', 'preloadBattleWarm', 'preloadBattleStart',
        'ensureKillcam', 'ensureFx', 'startBattle', 'prepareBattleWorldServices',
        'getPedestalVisual', 'prebakeSharedTextures', 'rosterRows', 'warmShotCards',
        'getCamoSweep', 'prepareRevealCamera', 'resolveVisiblePreBattleSeconds',
        'openBattle', 'scheduleDeferredWarm', 'nextFrame', 'createLoadingYielder',
        'now', 'delay'],
    );
  } catch {
    throw new TypeError('solo battle loading runtime requires every lifecycle port');
  }
}

function validateLoadingNumbers(options: SoloBattleLoadingRuntimeOptions): void {
  if (!Number.isFinite(options.anisotropy) || options.anisotropy < 0 ||
      !Number.isFinite(options.preBattleHoldSeconds) || options.preBattleHoldSeconds < 0 ||
      !Number.isFinite(options.minimumVisiblePreBattleSeconds) ||
      options.minimumVisiblePreBattleSeconds < 0) {
    throw new TypeError('solo battle loading runtime requires finite quality and countdown values');
  }
}

/**
 * Own the covered solo entry from Battle intent through the visible countdown.
 * The composition root supplies capabilities; acquisition order, progress,
 * exact-roster preparation, diagnostics, and reveal fallback stay here.
 */
export function createSoloBattleLoadingRuntime(
  options: SoloBattleLoadingRuntimeOptions,
): SoloBattleLoadingRuntime {
  validateLoadingPorts(options);
  validateLoadingNumbers(options);
  const {
  game,
  post,
  battleIntent,
  battleLoad,
  audio,
  acquisition,
  deployment,
  lifecycle,
  getPendingMapId,
  getMapName,
  loadMapConfig,
  getMapThumb,
  hasCachedWorld,
  getWorld,
  ensureWorld,
  ensureBattleVisuals,
  getBattleVisuals,
  ensureBattleHud,
  preloadMinimap,
  ensureTouchControls,
  preloadSettings,
  preloadArmorAim,
  planRoster,
  planCamoOverrides,
  ensureTankBuilders,
  preloadSoloAuthority,
  preloadBattleClient,
  preloadBattleWarm,
  preloadBattleStart,
  ensureKillcam,
  ensureFx,
  startBattle,
  prepareBattleWorldServices,
  getPedestalVisual,
  prebakeSharedTextures,
  anisotropy,
  rosterRows,
  warmShotCards,
  getCamoSweep,
  prepareRevealCamera,
  resolveVisiblePreBattleSeconds,
  preBattleHoldSeconds,
  minimumVisiblePreBattleSeconds,
  openBattle,
  scheduleDeferredWarm,
  nextFrame,
  createLoadingYielder,
  now = () => performance.now(),
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = options;

  const host = globalThis as LoadingHost;

  return {
    async begin(specId, mapId = null, { randomRoster = true, gameMode = 'standard' } = {}) {
      // Debug/API entry can bypass the Garage's ui:battleStart event.
      post.setAdaptiveSuspended(true);
      const shownAt = now();
      host.__VISUAL_LOAD_TIMINGS = [];
      const loadYield = createLoadingYielder(12, 80);
      const requestedMapId = mapId || getPendingMapId();
      const normalizedGameMode = normalizeGameMode(gameMode);
      const resolved = battleIntent.consumeMap(specId, requestedMapId);
      const mapName = getMapName(resolved);
      const mapConfigPromise = loadMapConfig(resolved);
      const trace: BattleLoadTrace = {
        map: resolved,
        worldCached: hasCachedWorld(resolved),
        stages: {},
      };
      let markedAt = shownAt;
      const mark = (name: string): void => {
        const marked = now();
        trace.stages[name] = Math.round(marked - markedAt);
        markedAt = marked;
      };

      battleLoad.show({
        mapName: mapName || resolved,
        thumb: getMapThumb(resolved),
        biome: resolved,
        mode: loadingModeLabel(normalizedGameMode, mapId),
        allies: [],
        enemies: [],
      });
      audio.resume();
      audio.loadingOn(true);
      await nextFrame();
      await ensureBattleVisuals();
      const battleVisuals = getBattleVisuals();

      battleLoad.progress(0.01, 'Loading combat interface');
      const battleInterface = Promise.all([
        ensureBattleHud(),
        ensureTouchControls(),
        preloadSettings(),
        preloadArmorAim(),
      ]);

      battleLoad.progress(0.02, 'Loading battlefield');
      const plannedRoster = planRoster(specId, randomRoster);
      const plannedAutoCamoIds = planCamoOverrides(specId, resolved, randomRoster);
      const rosterTexture = battleIntent.prepareRoster({
        specId,
        mapId: resolved,
        rosterIds: plannedRoster,
        autoCamoIds: plannedAutoCamoIds,
        yieldForBudget: loadYield,
      });
      const fxTexture = ensureFx().then(async (live) => {
        await live.preloadTextures?.();
        live.warmTextures?.();
        const receipt = await battleVisuals.stageRootTextureUploads(live.group, loadYield);
        live.group.userData.battleTexturesStaged = true;
        trace.fxTextureUpload = receipt;
        return receipt;
      });

      await acquisition.acquireSolo([
        () => battleInterface,
        () => preloadMinimap(resolved),
        () => ensureWorld(
          resolved,
          (fraction, label) => battleLoad.progress(0.02 + fraction * 0.53, label),
          { precompile: false, services: false },
        ),
        async () => {
          const mapConfig = await mapConfigPromise;
          return ensureTankBuilders([...plannedRoster, ...plannedWorldVehicleIds(mapConfig)]);
        },
        () => preloadSoloAuthority(),
        () => preloadBattleClient(),
        () => preloadBattleWarm(),
        () => preloadBattleStart(),
        () => audio.warmBattleEvents(),
        () => fxTexture,
        () => ensureKillcam(),
        () => rosterTexture,
      ]);

      trace.world = host.__WORLD_LOAD || null;
      battleLoad.progress(0.55, 'Uploading battlefield textures');
      trace.worldTextureUpload = await battleVisuals.stageRootTextureUploads(
        getWorld().group,
        loadYield,
      );
      mark('world');
      battleLoad.progress(0.555, 'Battlefield ready');
      await nextFrame();

      battleLoad.progress(0.56, 'Assembling rosters');
      await nextFrame();
      const playerVisualStartedAt = now();
      startBattle(specId, resolved, {
        deferVisuals: true,
        preBattleHold: true,
        randomRoster,
        ...(normalizedGameMode === 'standard' ? {} : { gameMode: normalizedGameMode }),
      });
      battleLoad.progress(0.565, 'Drawing tactical map');
      prepareBattleWorldServices(getWorld());
      battleLoad.progress(0.57, 'Preparing player vehicle');
      const playerVisualTiming: VisualLoadTiming = {
        specId: game.player?.specId || specId,
        quality: 'preview',
        startedAt: Math.round(playerVisualStartedAt),
        buildMs: Math.round(now() - playerVisualStartedAt),
        prebakeMs: 0,
      };
      if (game.player?.visual && game.player.visual === getPedestalVisual()) {
        const prebakeStartedAt = now();
        await prebakeSharedTextures(game.player.spec, anisotropy, 'preview', loadYield);
        playerVisualTiming.prebakeMs = Math.round(now() - prebakeStartedAt);
      }
      (host.__VISUAL_LOAD_TIMINGS ||= []).push(playerVisualTiming);
      const uploadStartedAt = now();
      if (!game.player) throw new Error('solo battle loading requires a player after setup');
      const playerStageReceipt = await battleVisuals.stageBattleVisualReveal(
        game.player,
        loadYield,
      );
      playerVisualTiming.uploadMs = Math.round(now() - uploadStartedAt);
      playerVisualTiming.preUploadYieldMs = playerStageReceipt.preUploadYieldMs;
      playerVisualTiming.textureUploadMs = playerStageReceipt.textureUploadMs;
      playerVisualTiming.compileMs = playerStageReceipt.compileMs;
      playerVisualTiming.postCompileYieldMs = playerStageReceipt.postCompileYieldMs;
      playerVisualTiming.totalMs = Math.round(now() - playerVisualStartedAt);
      mark('roster');
      battleLoad.rosters(rosterRows('player'), rosterRows('enemy'));
      warmShotCards(game.tanks.map((entity) => entity.specId));
      battleLoad.progress(0.58, 'Painting vehicles');
      const openingVisual = (entity: BattleVisualEntity): boolean =>
        !!(entity as LoadingEntity).isPlayer;
      if (game.tanks.some((entity) => !entity.visual && openingVisual(entity))) {
        await nextFrame();
      }
      await battleVisuals.stream(openingVisual, loadYield, (fraction) => {
        battleLoad.progress(0.58 + fraction * 0.30, 'Painting vehicles');
      });
      mark('bake');

      battleLoad.progress(0.90, 'Preparing deployment');
      const {
        generation,
        revealPrimed,
      } = await deployment.warm(getCamoSweep());
      mark('warm');
      audio.loadingOn(false);
      audio.ambientOn(true);
      battleLoad.progress(1, 'Ready');

      const readyHoldMs = 900 - (now() - shownAt);
      if (readyHoldMs > 0) await delay(readyHoldMs);
      mark('holdCountdown');
      trace.totalMs = Math.round(now() - shownAt);
      host.__BATTLE_LOAD = trace;
      if (!revealPrimed) {
        prepareRevealCamera();
        await lifecycle.primeReveal();
      }
      mark('primeReveal');
      await battleLoad.hide();
      mark('hide');
      // Reveal is now complete; start a fresh governor baseline using only
      // playable battle frames, never covered compilation or upload yields.
      post.setAdaptiveSuspended(false);
      const loadingElapsedSeconds = (now() - shownAt) / 1000;
      const visiblePreBattleSeconds = resolveVisiblePreBattleSeconds(
        preBattleHoldSeconds,
        loadingElapsedSeconds,
        minimumVisiblePreBattleSeconds,
      );
      trace.loadingElapsedMs = Math.round(loadingElapsedSeconds * 1000);
      trace.visiblePreBattleS = visiblePreBattleSeconds;
      trace.expectedClickToControlMs = Math.round(
        loadingElapsedSeconds * 1000 + visiblePreBattleSeconds * 1000,
      );
      openBattle(visiblePreBattleSeconds);
      scheduleDeferredWarm(generation);
      mark('open');
      trace.totalMs = Math.round(now() - shownAt);
    },
  };
}
