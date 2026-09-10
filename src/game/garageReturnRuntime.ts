import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import { t } from '../ui/i18n.ts';
import type { GaragePresentationRestoreReceipt } from './garagePhasePresentationRuntime.ts';

export interface GarageReturnTrace {
  stages: Record<string, number>;
  /** Owned return state: only an exact successful restore permits Garage frames. */
  presentationUnready: boolean;
  totalMs?: number;
  /** Scheduling opportunities only; no GPU-completion or displayed-frame claim. */
  cooperativeYieldCount?: number;
  cooperativeYieldMs?: number;
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
  pace?: 'standard' | 'quick';
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
  /** True only when the canonical, enabled Garage Battle control was invoked. */
  triggerBattle(): boolean;
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

interface GarageReturnEntryScheduler {
  /** Snapshot validity for this entry, including the renderer/context lifetime. */
  isCurrent(): boolean;
  yieldControl(): Promise<void>;
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
  /** Optional for non-browser integrations; a fresh scheduler belongs to each entry. */
  createEntryScheduler?: () => GarageReturnEntryScheduler;
  isBattleEntryPending(): boolean;
  isBattleEntryCovering(): boolean;
  nowMs?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  publishTrace?: (trace: GarageReturnTrace) => void;
}

export interface GarageReturnRuntime {
  readonly transitioning: boolean;
  readonly lastTrace: GarageReturnTrace | null;
  enter(options?: GarageReturnOptions): Promise<void>;
  /** Retry an interrupted canonical return under the restored device's cover. */
  recoverAfterContextRestore(isCurrent: () => boolean): Promise<boolean>;
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
        createEntryScheduler: options.createEntryScheduler ?? (() => null),
        isBattleEntryPending: options.isBattleEntryPending,
        isBattleEntryCovering: options.isBattleEntryCovering,
        nowMs: options.nowMs ?? (() => performance.now()),
        sleep: options.sleep ?? (() => Promise.resolve()),
        publishTrace: options.publishTrace ?? (() => {}),
      },
      'garage return lifecycle',
      ['getSelectedSpecId', 'restoreGaragePresentation', 'createEntryScheduler', 'isBattleEntryPending',
        'isBattleEntryCovering', 'nowMs', 'sleep', 'publishTrace'],
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
    createEntryScheduler,
    isBattleEntryPending,
    isBattleEntryCovering,
    nowMs = () => performance.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    publishTrace = () => {},
  } = options;

  let activeTransition: Promise<void> | null = null;
  let activeEntry: Promise<void> | null = null;
  let activeRecovery: Promise<boolean> | null = null;
  let recoveryIsCurrent: (() => boolean) | null = null;
  let lastTrace: GarageReturnTrace | null = null;
  let lastEntryOptions: GarageReturnOptions = {};

  const performEntry = async (options: GarageReturnOptions, isCurrent: () => boolean): Promise<void> => {
    const entryScheduler = createEntryScheduler?.();
    const assertCurrent = (): void => {
      if (!isCurrent() || (entryScheduler && !entryScheduler.isCurrent())) {
        throw new Error('Garage return recovery was superseded or its graphics context changed.');
      }
    };
    assertCurrent();
    const trace: GarageReturnTrace = {
      stages: {}, presentationUnready: true, cooperativeYieldCount: 0, cooperativeYieldMs: 0,
    };
    // Publish ownership before any adapter can mutate roots/phase or re-enter.
    // Failure deliberately retains this state after the pending promise clears.
    lastTrace = trace;
    const preserveRoom = options.preserveRoom ?? network.shouldPreserveRoom();
    lastEntryOptions = { preserveRoom };
    const selectedSpecId = getSelectedSpecId();
    const startedAt = nowMs();
    let markedAt = startedAt;
    const markStage = (name: string): void => {
      const at = nowMs();
      trace.stages[name] = Math.round(at - markedAt);
      markedAt = at;
    };
    publishTrace(trace);

    const assertOwnedGarage = (): void => {
      assertCurrent();
      if (entryScheduler && (game.phase !== 'garage' || lastTrace !== trace)) {
        throw new Error('Garage return was superseded by another presentation.');
      }
    };
    let sliceStartedAt = startedAt;
    let cooperativeYieldMs = 0;
    let cooperativeYieldCount = 0;
    const yieldCheckpoint = async (scheduler: GarageReturnEntryScheduler): Promise<void> => {
      const waitStartedAt = nowMs();
      trace.cooperativeYieldCount = ++cooperativeYieldCount;
      try {
        await scheduler.yieldControl();
      } finally {
        const endedAt = nowMs();
        const waitedMs = Math.max(0, endedAt - waitStartedAt);
        cooperativeYieldMs += waitedMs;
        trace.cooperativeYieldMs = Math.round(cooperativeYieldMs);
        // Preserve each original stage's work accounting; separately report
        // only our scheduling wait instead of inflating the following stage.
        markedAt += waitedMs;
        sliceStartedAt = endedAt;
      }
      assertOwnedGarage();
    };
    const checkpoint = (): Promise<void> | undefined => {
      if (!entryScheduler) return;
      assertOwnedGarage();
      if (nowMs() - sliceStartedAt < 8) return;
      return yieldCheckpoint(entryScheduler);
    };

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

    // The published unready trace and Garage phase now suppress all ordinary
    // scene frames. Never yield earlier while reset roots could still render.
    const afterReset = checkpoint();
    if (afterReset) { await afterReset; assertOwnedGarage(); }
    work.noteActivity();
    work.resetFramePacer(nowMs());
    work.scheduleDressing();
    await world.ensureGaragePlacement();
    assertOwnedGarage();
    markStage('worldServices');
    const afterWorldServices = checkpoint();
    if (afterWorldServices) { await afterWorldServices; assertOwnedGarage(); }

    if (settings.isOpen()) settings.close({ noRelock: true });
    world.setDormant(true);
    world.setFarCascadeDormant(true);
    world.clearCamoOverrides();

    const adoptedVisual = roster.adoptBattlePlayer(selectedSpecId);
    roster.clearBattle(adoptedVisual);
    presentation.resetHudFrame();
    markStage('worldAndHero');
    const afterWorldAndHero = checkpoint();
    if (afterWorldAndHero) { await afterWorldAndHero; assertOwnedGarage(); }

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
    const afterGarageUi = checkpoint();
    if (afterGarageUi) { await afterGarageUi; assertOwnedGarage(); }
    ui.poseGarageCamera();
    ui.startShowroom();
    markStage('camera');

    audio.ambientOn(false);
    audio.playGarageSting();
    markStage('audio');
    trace.presentationRestore = await restoreGaragePresentation();
    assertOwnedGarage();
    if (!trace.presentationRestore) {
      throw new Error('Garage return completed without a presentation restore receipt');
    }
    trace.presentationUnready = false;
    markStage('presentationRestore');
    trace.totalMs = Math.round(nowMs() - startedAt);
    // Covered restore frames are intentionally bursty. Start the Garage's
    // quality baseline only after every resource and shadow unit is ready.
    presentation.setAdaptiveSuspended(false);
  };

  const enter = (options: GarageReturnOptions = {}, isCurrent = () => true): Promise<void> => {
    if (activeEntry) return activeEntry;
    let resolveEntry!: () => void;
    let rejectEntry!: (error: Error) => void;
    const pending = new Promise<void>((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const tracked = pending.finally(() => {
      if (activeEntry === tracked) activeEntry = null;
    });
    // Direct recovery callers and synchronous phase listeners share one entry,
    // so an older overlapping completion cannot release a successor's cover.
    activeEntry = tracked;
    performEntry(options, isCurrent).then(resolveEntry, rejectEntry);
    return tracked;
  };

  const performContextRecovery = async (isCurrent: () => boolean): Promise<boolean> => {
    const interrupted = lastTrace;
    const originalOptions = lastEntryOptions;
    if (game.phase !== 'garage' || !interrupted?.presentationUnready) return false;
    // A loss can still be unwinding through the original entry's await. Do not
    // race its teardown or mistake its eventual rejection for a recovery failure.
    await activeEntry?.catch(() => {});
    if (!isCurrent()) throw new Error('Garage graphics recovery belongs to an expired context.');
    if (game.phase !== 'garage') return false;
    if (lastTrace !== interrupted) {
      // A newer user-owned return wins. Wait for it, but never retry it with the
      // older room policy or clear its incomplete transaction using a GPU receipt.
      await activeEntry;
      if (!isCurrent()) throw new Error('Garage graphics recovery belongs to an expired context.');
      if (game.phase !== 'garage') return false;
      if (lastTrace?.presentationUnready) throw new Error('The newer Garage return is not ready.');
      return false;
    }
    if (!interrupted.presentationUnready) return false;
    await enter(originalOptions, () => isCurrent() && game.phase === 'garage');
    return true;
  };

  const recoverAfterContextRestore = (isCurrent: () => boolean): Promise<boolean> => {
    if (activeRecovery) {
      if (recoveryIsCurrent?.()) return activeRecovery;
      // A second restored device must not inherit the older device's rejected
      // preparation. Join its unwind, then acquire a fresh canonical retry.
      return activeRecovery.catch(() => false).then(() => recoverAfterContextRestore(isCurrent));
    }
    const pending = performContextRecovery(isCurrent);
    const tracked = pending.finally(() => {
      if (activeRecovery === tracked) {
        activeRecovery = null;
        recoveryIsCurrent = null;
      }
    });
    activeRecovery = tracked;
    recoveryIsCurrent = isCurrent;
    return tracked;
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
      kicker: t('transition.kicker.leavingBattle'),
      title: t('transition.title.garage'),
      mapId: world.currentMapId() || game.mapId,
      progress: false,
      minShowMs: 150,
      pace: 'quick',
    });
  });

  const battleAgain = (): Promise<void> => {
    if (activeTransition) return activeTransition;
    return beginTransition(async () => {
      await transition.run(async () => {
        // Cover the whole wait, and never dispose state owned by an entry that
        // has not finished. The report stays intact until covered enter().
        const waitStartedAt = nowMs();
        while (isBattleEntryPending() && nowMs() - waitStartedAt < 15_000) {
          await sleep(150);
        }
        if (isBattleEntryPending()) {
          throw new Error('The previous battle is still loading. Please try Battle Again when it finishes.');
        }
        await enter();
        if (!ui.triggerBattle()) {
          throw new Error('Battle Again is unavailable. Your Garage is ready; choose a battle from there.');
        }
        const handoffStartedAt = nowMs();
        while (!isBattleEntryCovering() && nowMs() - handoffStartedAt < 15_000) {
          await sleep(16);
        }
        if (!isBattleEntryCovering()) {
          throw new Error('The next battle did not start. Please check your battle selection and try again.');
        }
      }, {
        kicker: t('transition.kicker.regrouping'),
        title: t('transition.title.nextBattle'),
        mapId: world.currentMapId() || game.mapId,
        progress: false,
        minShowMs: 420,
      });
    });
  };

  return {
    get transitioning() { return activeTransition !== null; },
    get lastTrace() { return lastTrace; },
    enter,
    recoverAfterContextRestore,
    leave,
    battleAgain,
  };
}
