import type { Object3D } from 'three';
import { gameModeDefinition, normalizeGameMode } from '../sim/matchModes.ts';
import type { WorkYielder } from '../engine/frameScheduler.ts';
import type {
  BattleVisualEntity,
  BattleVisualStreamer,
} from './battleVisualStreamer.ts';

interface LoadingEntity extends BattleVisualEntity {
  isPlayer?: boolean;
  spec?: unknown;
}

interface LoadingGame {
  tanks: LoadingEntity[];
  player?: LoadingEntity | null;
}

interface LoadingWorld {
  mapId: string;
  group: Object3D;
}

interface MapConfig {
  name?: string;
  props?: { tankWrecks?: { ids?: string[] } };
}

interface BattleLoadPort {
  show(options: {
    mapName: string;
    thumb: string;
    biome: string;
    mode: string;
    allies: unknown[];
    enemies: unknown[];
  }): void;
  progress(fraction: number, label: string): void;
  rosters(allies: unknown[], enemies: unknown[]): void;
  hide(): Promise<unknown>;
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
  battleLoad: BattleLoadPort;
  audio: AudioPort;
  acquisition: EntryAcquisitionPort;
  deployment: DeploymentPort;
  lifecycle: EntryLifecyclePort;
  getPendingMapId(): string;
  getMapConfig(mapId: string): MapConfig;
  getMapThumb(mapId: string): string;
  hasCachedWorld(mapId: string): boolean;
  getWorld(): LoadingWorld;
  ensureWorld(
    mapId: string,
    onProgress: (fraction: number, label: string) => void,
    options: { precompile: boolean; services: boolean },
  ): Promise<unknown>;
  ensureBattleVisuals(): Promise<unknown>;
  getBattleVisuals(): BattleVisualStreamer;
  ensureBattleHud(): Promise<unknown>;
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
  prepareBattleWorldServices(world: LoadingWorld): void;
  getPedestalVisual(): unknown;
  prebakeSharedTextures(
    spec: unknown,
    anisotropy: number,
    quality: 'preview',
    yieldForBudget: WorkYielder,
  ): Promise<unknown>;
  anisotropy: number;
  rosterRows(team: string): unknown[];
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
    options?: { randomRoster?: boolean; gameMode?: string },
  ): Promise<void>;
}

/**
 * Own the covered solo entry from Battle intent through the visible countdown.
 * The composition root supplies capabilities; acquisition order, progress,
 * exact-roster preparation, diagnostics, and reveal fallback stay here.
 */
export function createSoloBattleLoadingRuntime({
  game,
  post,
  battleIntent,
  battleLoad,
  audio,
  acquisition,
  deployment,
  lifecycle,
  getPendingMapId,
  getMapConfig,
  getMapThumb,
  hasCachedWorld,
  getWorld,
  ensureWorld,
  ensureBattleVisuals,
  getBattleVisuals,
  ensureBattleHud,
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
}: SoloBattleLoadingRuntimeOptions): SoloBattleLoadingRuntime {
  const required = [post?.setAdaptiveSuspended, battleIntent?.consumeMap,
    battleIntent?.prepareRoster, battleLoad?.show, battleLoad?.progress,
    battleLoad?.rosters, battleLoad?.hide, audio?.resume, audio?.loadingOn,
    audio?.ambientOn, audio?.warmBattleEvents, acquisition?.acquireSolo,
    deployment?.warm, lifecycle?.primeReveal, getPendingMapId, getMapConfig,
    getMapThumb, hasCachedWorld, getWorld, ensureWorld, ensureBattleVisuals,
    getBattleVisuals, ensureBattleHud, ensureTouchControls, preloadSettings,
    preloadArmorAim, planRoster, planCamoOverrides, ensureTankBuilders,
    preloadSoloAuthority, preloadBattleClient, preloadBattleWarm, ensureKillcam,
    preloadBattleStart, ensureFx, startBattle, prepareBattleWorldServices, getPedestalVisual,
    prebakeSharedTextures, rosterRows, warmShotCards, getCamoSweep,
    prepareRevealCamera, resolveVisiblePreBattleSeconds, openBattle,
    scheduleDeferredWarm, nextFrame, createLoadingYielder, now, delay];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('solo battle loading runtime requires every lifecycle port');
  }
  if (!Number.isFinite(anisotropy) || anisotropy < 0 ||
      !Number.isFinite(preBattleHoldSeconds) || preBattleHoldSeconds < 0 ||
      !Number.isFinite(minimumVisiblePreBattleSeconds) || minimumVisiblePreBattleSeconds < 0) {
    throw new TypeError('solo battle loading runtime requires finite quality and countdown values');
  }

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
      const config = getMapConfig(resolved);
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
        mapName: config.name || resolved,
        thumb: getMapThumb(resolved),
        biome: resolved,
        mode: normalizedGameMode === 'standard'
          ? mapId === 'random' ? 'Random Battle · Any Battlefield' : 'Random Battle · Standard'
          : `${gameModeDefinition(normalizedGameMode).label} · ${
            mapId === 'random' ? 'Any Battlefield' : 'Selected Battlefield'}`,
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
      const plannedWorldVehicles = config.props?.tankWrecks?.ids || [];
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
        () => ensureWorld(
          resolved,
          (fraction, label) => battleLoad.progress(0.02 + fraction * 0.53, label),
          { precompile: false, services: false },
        ),
        () => ensureTankBuilders([...plannedRoster, ...plannedWorldVehicles]),
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
      await battleVisuals.stageBattleVisualReveal(game.player, loadYield);
      playerVisualTiming.uploadMs = Math.round(now() - uploadStartedAt);
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
      post.setAdaptiveSuspended(false);
      mark('restoreRenderer');
      if (!revealPrimed) {
        prepareRevealCamera();
        await lifecycle.primeReveal();
      }
      mark('primeReveal');
      await battleLoad.hide();
      mark('hide');
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
