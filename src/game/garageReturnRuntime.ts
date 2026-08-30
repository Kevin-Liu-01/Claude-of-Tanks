import type { GameState } from './stateCore.ts';

export interface GarageReturnTrace {
  stages: Record<string, number>;
  totalMs?: number;
}

export interface GarageReturnOptions {
  preserveRoom?: boolean;
}

interface GarageReturnTransitionOptions {
  kicker: string;
  title: string;
  mapId: string;
  progress: boolean;
  minShowMs: number;
}

interface GarageReturnTransitionPort {
  run(
    work: () => unknown,
    options: GarageReturnTransitionOptions,
  ): Promise<unknown>;
}

interface GarageReturnSettingsPort {
  isOpen(): boolean;
  close(options: { noRelock: boolean }): void;
}

interface GarageReturnPresentationPort {
  setAdaptiveSuspended(suspended: boolean): void;
  clearBattle(): void;
  resetBattleTank(): void;
  setShotMode(enabled: boolean): void;
  setCaptureHidden(hidden: boolean): void;
  unfreezeEffects(): void;
  resetHudFrame(): void;
}

interface GarageReturnNetworkPort {
  shouldPreserveRoom(): boolean;
  disposePresentation(): void;
  closeMatch(reason: string): void;
}

interface GarageReturnWarmPort {
  invalidate(): void;
  cancel(): void;
  setPending(pending: boolean): void;
}

interface GarageReturnWorkPort {
  noteActivity(): void;
  resetFramePacer(nowMs: number): void;
  scheduleDressing(): void;
}

interface GarageReturnWorldPort {
  currentMapId(): string | null;
  ensureGaragePlacement(): Promise<void> | void;
  setDormant(dormant: boolean): void;
  setFarCascadeDormant(dormant: boolean): void;
  clearCamoOverrides(): void;
}

interface GarageReturnRosterPort {
  adoptBattlePlayer(specId: string): unknown | null;
  clearBattle(preservedVisual: unknown | null): void;
  repaintHero(specId: string): void;
}

interface GarageReturnUiPort {
  setGarageSpots(enabled: boolean): void;
  setGarageSunTrim(enabled: boolean): void;
  emitGaragePhase(): void;
  hideEndOverlay(): void;
  exitPointerLock(): void;
  hideHud(): void;
  showGarage(specId: string): void;
  poseGarageCamera(): void;
  startShowroom(): void;
  triggerBattle(): void;
}

interface GarageReturnAudioPort {
  ambientOn(enabled: boolean): void;
  playGarageSting(): void;
}

export interface GarageReturnRuntimeOptions {
  game: GameState;
  getSelectedSpecId(): string;
  presentation: GarageReturnPresentationPort;
  network: GarageReturnNetworkPort;
  warm: GarageReturnWarmPort;
  work: GarageReturnWorkPort;
  world: GarageReturnWorldPort;
  roster: GarageReturnRosterPort;
  settings: GarageReturnSettingsPort;
  ui: GarageReturnUiPort;
  audio: GarageReturnAudioPort;
  transition: GarageReturnTransitionPort;
  resumeGarageGpu(): Promise<void>;
  isBattleEntryPending(): boolean;
  nowMs?: () => number;
  sleep?: (milliseconds: number) => Promise<unknown>;
  publishTrace?: (trace: GarageReturnTrace) => void;
}

export interface GarageReturnRuntime {
  readonly transitioning: boolean;
  readonly lastTrace: GarageReturnTrace | null;
  enter(options?: GarageReturnOptions): Promise<void>;
  leave(): Promise<void>;
  battleAgain(): Promise<void>;
}

/**
 * Owns the complete battle/Studio-to-Garage transaction. The interface keeps
 * callers ignorant of teardown ordering while injected ports keep this state
 * machine independent from DOM, WebGL, Three.js, and the network transport.
 */
export function createGarageReturnRuntime({
  game,
  getSelectedSpecId,
  presentation,
  network,
  warm,
  work,
  world,
  roster,
  settings,
  ui,
  audio,
  transition,
  resumeGarageGpu,
  isBattleEntryPending,
  nowMs = () => performance.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  publishTrace = () => {},
}: GarageReturnRuntimeOptions): GarageReturnRuntime {
  const required = [getSelectedSpecId, presentation?.setAdaptiveSuspended,
    presentation?.clearBattle, presentation?.resetBattleTank,
    presentation?.setShotMode, presentation?.setCaptureHidden,
    presentation?.unfreezeEffects, presentation?.resetHudFrame,
    network?.shouldPreserveRoom, network?.disposePresentation,
    network?.closeMatch, warm?.invalidate, warm?.cancel, warm?.setPending,
    work?.noteActivity, work?.resetFramePacer, work?.scheduleDressing,
    world?.currentMapId, world?.ensureGaragePlacement, world?.setDormant,
    world?.setFarCascadeDormant, world?.clearCamoOverrides,
    roster?.adoptBattlePlayer, roster?.clearBattle, roster?.repaintHero,
    settings?.isOpen, settings?.close, ui?.setGarageSpots,
    ui?.setGarageSunTrim, ui?.emitGaragePhase, ui?.hideEndOverlay,
    ui?.exitPointerLock, ui?.hideHud, ui?.showGarage,
    ui?.poseGarageCamera, ui?.startShowroom, ui?.triggerBattle,
    audio?.ambientOn, audio?.playGarageSting, transition?.run,
    resumeGarageGpu, isBattleEntryPending, nowMs, sleep, publishTrace];
  if (!game || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage return runtime requires every lifecycle port');
  }

  let activeTransition: Promise<void> | null = null;
  let lastTrace: GarageReturnTrace | null = null;

  const enter = async (options: GarageReturnOptions = {}): Promise<void> => {
    const preserveRoom = options.preserveRoom ?? network.shouldPreserveRoom();
    const selectedSpecId = getSelectedSpecId();
    const trace: GarageReturnTrace = { stages: {} };
    const startedAt = nowMs();
    let markedAt = startedAt;
    const markStage = (name: string): void => {
      const at = nowMs();
      trace.stages[name] = Math.round(at - markedAt);
      markedAt = at;
    };
    lastTrace = trace;
    publishTrace(trace);

    // Release the loader suspension before any Garage frame can be exposed.
    presentation.setAdaptiveSuspended(false);
    // Decals and replay-owned DOM must release before the player visual moves
    // to either network disposal or the Garage pedestal cache.
    presentation.clearBattle();
    presentation.resetBattleTank();
    markStage('presentationReset');

    if (preserveRoom) network.disposePresentation();
    else network.closeMatch('returned_to_garage');
    markStage('networkRelease');

    game.preBattleS = 0;
    warm.invalidate();
    warm.cancel();
    warm.setPending(false);
    presentation.setShotMode(false);
    presentation.setCaptureHidden(false);
    presentation.unfreezeEffects();
    game.phase = 'garage';

    work.noteActivity();
    work.resetFramePacer(nowMs());
    work.scheduleDressing();
    await world.ensureGaragePlacement();
    markStage('worldServices');

    if (settings.isOpen()) settings.close({ noRelock: true });
    world.setDormant(true);
    world.setFarCascadeDormant(true);
    world.clearCamoOverrides();

    const adoptedVisual = roster.adoptBattlePlayer(selectedSpecId);
    roster.clearBattle(adoptedVisual);
    presentation.resetHudFrame();
    markStage('worldAndHero');

    roster.repaintHero(selectedSpecId);
    ui.setGarageSpots(true);
    ui.setGarageSunTrim(true);
    markStage('lighting');

    ui.emitGaragePhase();
    ui.hideEndOverlay();
    ui.exitPointerLock();
    ui.hideHud();
    markStage('eventAndHud');

    ui.showGarage(selectedSpecId);
    markStage('garageUi');
    ui.poseGarageCamera();
    ui.startShowroom();
    markStage('camera');

    audio.ambientOn(false);
    audio.playGarageSting();
    markStage('audio');
    trace.totalMs = Math.round(nowMs() - startedAt);
    await resumeGarageGpu();
  };

  const beginTransition = (operation: () => Promise<void>): Promise<void> => {
    if (activeTransition) return activeTransition;
    let resolvePending!: () => void;
    let rejectPending!: (error: unknown) => void;
    const pending = new Promise<void>((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    // Arm the latch before invoking any adapter. A transition may synchronously
    // emit phase/UI events, and those re-entrant callers must join this lease.
    activeTransition = pending;
    try {
      operation().then(resolvePending, rejectPending);
    } catch (error) {
      rejectPending(error);
    }
    const tracked = pending.finally(() => {
      if (activeTransition === tracked) activeTransition = null;
    });
    activeTransition = tracked;
    return tracked;
  };

  const leave = (): Promise<void> => beginTransition(async () => {
    // Input state releases immediately; the scene swap remains under the veil.
    presentation.clearBattle();
    await transition.run(() => enter(), {
      kicker: 'Leaving battle',
      title: 'Garage',
      mapId: world.currentMapId() || game.mapId,
      progress: false,
      minShowMs: 760,
    });
  });

  const battleAgain = (): Promise<void> => {
    if (activeTransition) return activeTransition;
    const returnToGarage = beginTransition(async () => {
      const waitStartedAt = nowMs();
      while (isBattleEntryPending() && nowMs() - waitStartedAt < 15_000) {
        await sleep(150);
      }
      await transition.run(() => enter(), {
        kicker: 'Regrouping',
        title: 'Next battle',
        mapId: world.currentMapId() || game.mapId,
        progress: false,
        minShowMs: 420,
      });
    });
    // Match the old lifecycle exactly: release the transition latch before
    // driving the canonical Battle action for the next round.
    return returnToGarage.then(() => { ui.triggerBattle(); });
  };

  return {
    get transitioning() { return activeTransition !== null; },
    get lastTrace() { return lastTrace; },
    enter,
    leave,
    battleAgain,
  };
}
