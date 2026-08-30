import type { DamagePanelController } from '../ui/damagePanel.ts';
import type { HudRuntime } from '../ui/hud.ts';

type MaybePromise<T> = T | PromiseLike<T>;
type DamagePanelSpec = Parameters<DamagePanelController['setTank']>[0];
type DamagePanelVisual = Parameters<DamagePanelController['setTank']>[1];
type EquipmentSelection = Parameters<DamagePanelController['setEquipment']>[0];

export interface SoloBattleStartOptions {
  deferVisuals?: boolean;
  preBattleHold?: boolean;
  randomRoster?: boolean;
  gameMode?: string;
}

interface SoloBattlePlayer {
  id: string;
  specId: string;
  spec: DamagePanelSpec;
  state: { yaw: number } | null;
  visual: DamagePanelVisual;
  equip?: EquipmentSelection;
}

interface SoloBattleGame {
  preBattleS: number;
  mapId: string;
  phase: string;
  player?: SoloBattlePlayer | null;
  tanks: Array<{ specId: string }>;
}

interface SoloBattleWorld {
  mapId: string;
  resetDestructibles?(): void;
}

interface SoloBattleFx {
  setFrozen(frozen: boolean): void;
  resetAll(): void;
}

interface SoloBattleStartTrace {
  specId: string;
  stages: Record<string, number>;
  totalMs?: number;
}

export interface SoloBattleStartRuntimeOptions {
  state: {
    game: SoloBattleGame;
    getPendingMapId(): string;
    setSelectedSpecId(specId: string): void;
    rememberSpecId(specId: string): void;
    setShotMode(active: boolean): void;
    setCaptureHidden(hidden: boolean): void;
    setSimulationAccumulator(value: number): void;
    setBattleStaged(staged: boolean): void;
    setCamoSweep(work: MaybePromise<unknown>): void;
  };
  world: {
    resolveMapId(mapId: string): string;
    switchMap(mapId: string): void;
    getActive(): SoloBattleWorld;
    setDormant(dormant: boolean): void;
    scheduleBlackWatchdog(): void;
  };
  round: {
    getFx(): SoloBattleFx;
    settings: { isOpen(): boolean; close(options: { noRelock: boolean }): void };
    killcam: { cancel(): void };
    armorAim: { clear(): void };
    resetDriveAim(): void;
    setCamoBiome(mapId: string): void;
    lendPlayerVisual(specId: string): void;
    setupBattle(
      game: SoloBattleGame,
      specId: string,
      world: SoloBattleWorld,
      options: {
        random: boolean;
        deferVisuals: boolean;
        deferCamoRepaint: boolean;
        deferOpeningRoutes: boolean;
        gameMode?: string;
      },
    ): void;
    combatWarm: { reset(): void; drain(): unknown };
    presentation: { primeDeploymentTerrainTiles(): void; resetSoloPoses(): void };
    applyPlayerCamo(specId: string): void;
    applyRosterCamo(options: {
      priorityIds: readonly string[];
      onlySpecIds: readonly string[];
    }): MaybePromise<unknown>;
  };
  ui: {
    hud: {
      shotInfo: { setPlayer(playerId: string): void };
      setMode: HudRuntime['setMode'];
    };
    playerActions: {
      setTank(spec: unknown): void;
      resetConsumables(): void;
    };
    damagePanel: {
      setTank: DamagePanelController['setTank'];
      setEquipment: DamagePanelController['setEquipment'];
    };
    hideGarage(): void;
    hideEndOverlay(): void;
    resetBattleResult(): void;
    setGarageLighting(active: boolean): void;
    emitPhaseChange(phase: string): void;
    emitConsumableReset(): void;
    rig: { release(): void; snapArcade(distance: number, yaw: number, pitch: number): void };
    stopShowroom(): void;
    openBattle(): void;
  };
  now?: () => number;
  recordTrace?: (trace: SoloBattleStartTrace) => void;
}

export interface SoloBattleStartRuntime {
  start(specId: string, mapId?: string | null, options?: SoloBattleStartOptions): void;
}

/**
 * Own the synchronous solo-round activation transaction after covered loading
 * has acquired the world, roster builders, combat modules, and presentation
 * owners. The caller chooses a tank/map; every reset and phase edge stays here.
 */
export function createSoloBattleStartRuntime({
  state,
  world,
  round,
  ui,
  now = () => performance.now(),
  recordTrace = () => {},
}: SoloBattleStartRuntimeOptions): SoloBattleStartRuntime {
  const required = [state?.getPendingMapId, state?.setSelectedSpecId,
    state?.rememberSpecId, state?.setShotMode, state?.setCaptureHidden,
    state?.setSimulationAccumulator, state?.setBattleStaged, state?.setCamoSweep,
    world?.resolveMapId, world?.switchMap, world?.getActive, world?.setDormant,
    world?.scheduleBlackWatchdog, round?.getFx, round?.settings?.isOpen,
    round?.settings?.close, round?.killcam?.cancel, round?.armorAim?.clear,
    round?.resetDriveAim, round?.setCamoBiome, round?.lendPlayerVisual,
    round?.setupBattle, round?.combatWarm?.reset, round?.combatWarm?.drain,
    round?.presentation?.primeDeploymentTerrainTiles,
    round?.presentation?.resetSoloPoses, round?.applyPlayerCamo,
    round?.applyRosterCamo, ui?.hud?.shotInfo?.setPlayer, ui?.hud?.setMode,
    ui?.playerActions?.setTank, ui?.playerActions?.resetConsumables,
    ui?.damagePanel?.setTank, ui?.damagePanel?.setEquipment, ui?.hideGarage,
    ui?.hideEndOverlay, ui?.resetBattleResult, ui?.setGarageLighting,
    ui?.emitPhaseChange, ui?.emitConsumableReset, ui?.rig?.release,
    ui?.rig?.snapArcade, ui?.stopShowroom, ui?.openBattle, now, recordTrace];
  if (!state?.game || required.some((value) => typeof value !== 'function')) {
    throw new TypeError('solo battle start runtime requires every activation port');
  }

  return {
    start(specId, mapId = null, {
      deferVisuals = false,
      preBattleHold = false,
      randomRoster = true,
      gameMode = 'standard',
    } = {}) {
      if (!specId) throw new TypeError('solo battle start requires a vehicle specification');

      const startedAt = now();
      let markedAt = startedAt;
      const trace: SoloBattleStartTrace = { specId, stages: {} };
      const mark = (name: string): void => {
        const marked = now();
        trace.stages[name] = Math.round(marked - markedAt);
        markedAt = marked;
      };

      const game = state.game;
      const fx = round.getFx();
      game.preBattleS = preBattleHold ? Infinity : 0;
      state.setShotMode(false);
      state.setCaptureHidden(false);
      fx.setFrozen(false);
      if (round.settings.isOpen()) round.settings.close({ noRelock: true });
      round.killcam.cancel();
      round.armorAim.clear();
      mark('resetPresentation');

      state.setSelectedSpecId(specId);
      state.rememberSpecId(specId);
      round.resetDriveAim();
      world.switchMap(world.resolveMapId(mapId || state.getPendingMapId()));
      world.setDormant(false);
      const activeWorld = world.getActive();
      activeWorld.resetDestructibles?.();
      world.scheduleBlackWatchdog();
      game.mapId = activeWorld.mapId;
      round.setCamoBiome(activeWorld.mapId);
      mark('activateWorld');

      round.lendPlayerVisual(specId);
      mark('lendPlayerVisual');
      round.setupBattle(game, specId, activeWorld, {
        random: randomRoster,
        deferVisuals,
        deferCamoRepaint: true,
        deferOpeningRoutes: deferVisuals,
        ...(gameMode === 'standard' ? {} : { gameMode }),
      });
      round.combatWarm.reset();
      mark('setupRoster');
      round.presentation.primeDeploymentTerrainTiles();
      mark('terrainTiles');
      state.setSimulationAccumulator(0);
      round.presentation.resetSoloPoses();
      state.setBattleStaged(true);

      round.applyPlayerCamo(specId);
      mark('playerCamo');
      state.setCamoSweep(round.applyRosterCamo({
        priorityIds: [specId],
        onlySpecIds: game.tanks.map((entity) => entity.specId),
      }));
      mark('scheduleRosterCamo');

      const player = game.player;
      if (!player?.state) throw new Error('solo battle setup did not create a player with ready state');
      ui.hud.shotInfo.setPlayer(player.id);
      fx.resetAll();
      mark('resetEffects');
      ui.playerActions.setTank(player.spec);
      ui.damagePanel.setTank(player.spec, player.visual);
      ui.damagePanel.setEquipment(player.equip ?? null);
      ui.hideGarage();
      ui.hideEndOverlay();
      ui.resetBattleResult();
      ui.hud.setMode('battle');
      game.phase = 'battle';
      ui.setGarageLighting(false);
      ui.emitPhaseChange('battle');
      ui.playerActions.resetConsumables();
      ui.emitConsumableReset();
      ui.rig.release();
      ui.rig.snapArcade(2, player.state.yaw, -10 * Math.PI / 180);
      ui.stopShowroom();
      mark('uiAndCamera');
      trace.totalMs = Math.round(now() - startedAt);
      recordTrace(trace);

      if (!deferVisuals) {
        round.combatWarm.drain();
        ui.openBattle();
      }
    },
  };
}
