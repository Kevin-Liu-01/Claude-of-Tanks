import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import type { GaragePresentationRestoreReceipt } from './garagePhasePresentationRuntime.ts';

export interface GarageReturnTrace {
  stages: Record<string, number>;
  totalMs?: number;
  presentationRestore?: GaragePresentationRestoreReceipt;
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
  run<Result>(
    work: () => Result | Promise<Result>,
    options: GarageReturnTransitionOptions,
  ): Promise<Result>;
}

interface GarageReturnSettingsPort {
  isOpen(): boolean;
  close(options: { noRelock: boolean }): void;
}

interface GarageReturnPresentationPort {
  setAdaptiveSuspended(suspended: boolean): void;
  clearBattle(): void;
  resetBattleTank(): void;
  suspendEffects(): void;
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

interface GarageReturnRosterPort<Visual> {
  adoptBattlePlayer(specId: string): Visual | null;
  clearBattle(preservedVisual: Visual | null): void;
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

interface GarageReturnGameState {
  phase: 'garage' | 'battle' | 'ended' | 'shot';
  preBattleS: number;
  mapId: string;
}

export interface GarageReturnRuntimeOptions<Visual = object> {
  game: GarageReturnGameState;
  getSelectedSpecId(): string;
  presentation: GarageReturnPresentationPort;
  network: GarageReturnNetworkPort;
  warm: GarageReturnWarmPort;
  work: GarageReturnWorkPort;
  world: GarageReturnWorldPort;
  roster: GarageReturnRosterPort<Visual>;
  settings: GarageReturnSettingsPort;
  ui: GarageReturnUiPort;
  audio: GarageReturnAudioPort;
  transition: GarageReturnTransitionPort;
  restoreGaragePresentation(): Promise<NonNullable<GarageReturnTrace['presentationRestore']>>;
  isBattleEntryPending(): boolean;
  nowMs?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  publishTrace?: (trace: GarageReturnTrace) => void;
}

export interface GarageReturnRuntime {
  readonly transitioning: boolean;
  readonly lastTrace: GarageReturnTrace | null;
  enter(options?: GarageReturnOptions): Promise<void>;
  leave(): Promise<void>;
  battleAgain(): Promise<void>;
}

function validateGarageReturnPorts<Visual>(
  options: GarageReturnRuntimeOptions<Visual>,
): void {
  try {
    if (!options.game) throw new TypeError('missing game state');
    checkedIntegrationPort<GarageReturnPresentationPort>(
      options.presentation ?? {},
      'garage return presentation',
      ['setAdaptiveSuspended', 'clearBattle', 'resetBattleTank', 'suspendEffects',
        'setShotMode', 'setCaptureHidden', 'unfreezeEffects', 'resetHudFrame'],
    );
    checkedIntegrationPort<GarageReturnNetworkPort>(
      options.network ?? {},
      'garage return network',
      ['shouldPreserveRoom', 'disposePresentation', 'closeMatch'],
    );
    checkedIntegrationPort<GarageReturnWarmPort>(
      options.warm ?? {},
      'garage return warm state',
      ['invalidate', 'cancel', 'setPending'],
    );
    checkedIntegrationPort<GarageReturnWorkPort>(
      options.work ?? {},
      'garage return work scheduler',
      ['noteActivity', 'resetFramePacer', 'scheduleDressing'],
    );
    checkedIntegrationPort<GarageReturnWorldPort>(
      options.world ?? {},
      'garage return world',
      ['currentMapId', 'ensureGaragePlacement', 'setDormant',
        'setFarCascadeDormant', 'clearCamoOverrides'],
    );
    checkedIntegrationPort<GarageReturnRosterPort<Visual>>(
      options.roster ?? {},
      'garage return roster',
      ['adoptBattlePlayer', 'clearBattle', 'repaintHero'],
    );
    checkedIntegrationPort<GarageReturnSettingsPort>(
      options.settings ?? {},
      'garage return settings',
      ['isOpen', 'close'],
    );
    checkedIntegrationPort<GarageReturnUiPort>(
      options.ui ?? {},
      'garage return interface',
      ['setGarageSpots', 'setGarageSunTrim', 'emitGaragePhase', 'hideEndOverlay',
        'exitPointerLock', 'hideHud', 'showGarage', 'poseGarageCamera',
        'startShowroom', 'triggerBattle'],
    );
    checkedIntegrationPort<GarageReturnAudioPort>(
      options.audio ?? {},
      'garage return audio',
      ['ambientOn', 'playGarageSting'],
    );
    checkedIntegrationPort<GarageReturnTransitionPort>(
      options.transition ?? {},
      'garage return transition',
      ['run'],
    );
    checkedIntegrationPort(
      {
        getSelectedSpecId: options.getSelectedSpecId,
        restoreGaragePresentation: options.restoreGaragePresentation,
        isBattleEntryPending: options.isBattleEntryPending,
        nowMs: options.nowMs ?? (() => performance.now()),
        sleep: options.sleep ?? (() => Promise.resolve()),
        publishTrace: options.publishTrace ?? (() => {}),
      },
      'garage return lifecycle',
      ['getSelectedSpecId', 'restoreGaragePresentation', 'isBattleEntryPending',
        'nowMs', 'sleep', 'publishTrace'],
    );
  } catch {
    throw new TypeError('garage return runtime requires every lifecycle port');
  }
}

/**
 * Owns the complete battle/Studio-to-Garage transaction. The interface keeps
 * callers ignorant of teardown ordering while injected ports keep this state
 * machine independent from DOM, WebGL, Three.js, and the network transport.
 */
export function createGarageReturnRuntime<Visual = object>(
  options: GarageReturnRuntimeOptions<Visual>,
): GarageReturnRuntime {
  validateGarageReturnPorts(options);
  const {
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
    restoreGaragePresentation,
    isBattleEntryPending,
    nowMs = () => performance.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    publishTrace = () => {},
  } = options;

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

    // Decals and replay-owned DOM must release before the player visual moves
    // to either network disposal or the Garage pedestal cache.
    presentation.clearBattle();
    presentation.resetBattleTank();
    presentation.suspendEffects();
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
    trace.presentationRestore = await restoreGaragePresentation();
    markStage('presentationRestore');
    trace.totalMs = Math.round(nowMs() - startedAt);
    // Covered restore frames are intentionally bursty. Start the Garage's
    // quality baseline only after every resource and shadow unit is ready.
    presentation.setAdaptiveSuspended(false);
  };

  const beginTransition = (operation: () => Promise<void>): Promise<void> => {
    if (activeTransition) return activeTransition;
    let resolvePending!: () => void;
    let rejectPending!: (error: Error) => void;
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
      rejectPending(error instanceof Error
        ? error
        : new Error('Garage return transition failed', { cause: error }));
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
      minShowMs: 250,
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
