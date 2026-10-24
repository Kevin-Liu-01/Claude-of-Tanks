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
  /**
   * (perf-246) A preparation behind the battle report: the Garage is swapped and warmed, but its screen (the phase
   * event, the UI, the showroom, the audio) waits for the player's Return. Garage frames stay suppressed until then.
   */
  awaitingHandoff?: boolean;
  /** (perf-246) Battle Again left the Garage's GPU restore unpaid; the next battle's cover owns the screen. */
  restoreSkipped?: boolean;
}

export interface GarageReturnOptions {
  preserveRoom?: boolean;
  /** Swap and warm the Garage under the report without handing the screen over (`prepare`). */
  prepareOnly?: boolean;
  /** Straight back into a battle: skip the Garage's GPU restore (Battle Again). */
  skipPresentationRestore?: boolean;
}

interface GarageReturnTransitionOptions {
  readonly holdSceneDuringFadeIn?: boolean;
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
  /** Release replay and aim state; `keepScreens` leaves the report and the HUD up for the veil to cover. */
  clearBattle(options?: { readonly keepScreens?: boolean }): void;
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
  phase: 'garage' | 'battle' | 'ended' | 'shot' | 'studio';
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
  /** `isCurrent` turns false when the restore was abandoned (a cancelled preparation): stop at the next step. */
  restoreGaragePresentation(
    isCurrent?: () => boolean,
  ): Promise<NonNullable<GarageReturnTrace['presentationRestore']>>;
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
  /** Covered return then a new entry; the trigger defaults to the Garage BATTLE click (the campaign ladder passes its own). */
  battleAgain(trigger?: () => boolean): Promise<void>;
  /**
   * (perf-246) Swap and warm the Garage behind the opaque battle report, so the Return costs only its handoff.
   * Resolves false when refused (a room, a transition, an entry, a Garage already up) or abandoned.
   */
  prepare(): Promise<boolean>;
  /** A prepared (or preparing) Garage still owes its screen handoff. */
  readonly awaitingHandoff: boolean;
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
  // perf-246: the in-flight preparation behind the report (its entry is `activeEntry`); Battle Again abandons it by
  // advancing the generation its isCurrent reads.
  let preparing = false;
  let preparationGeneration = 0;

  const performEntry = async (options: GarageReturnOptions, isCallerCurrent: () => boolean): Promise<void> => {
    const entryScheduler = createEntryScheduler?.();
    const prepareOnly = options.prepareOnly === true;
    // A preparation (prepare() or its context-loss retry) is abandoned the moment Battle Again advances the generation.
    const generation = preparationGeneration;
    const isCurrent = (): boolean => isCallerCurrent() && (!prepareOnly || generation === preparationGeneration);
    const assertCurrent = (): void => {
      if (!isCurrent() || (entryScheduler && !entryScheduler.isCurrent())) {
        throw new Error('Garage return recovery was superseded or its graphics context changed.');
      }
    };
    assertCurrent();
    const trace: GarageReturnTrace = {
      stages: {}, presentationUnready: true, cooperativeYieldCount: 0, cooperativeYieldMs: 0,
      ...(prepareOnly ? { awaitingHandoff: true } : {}),
    };
    // Publish ownership before any adapter can mutate roots/phase or re-enter.
    // Failure deliberately retains this state after the pending promise clears.
    lastTrace = trace;
    const preserveRoom = options.preserveRoom ?? network.shouldPreserveRoom();
    // A context loss re-runs a preparation as a preparation: the report is still the screen.
    lastEntryOptions = prepareOnly ? { preserveRoom, prepareOnly } : { preserveRoom };
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
    // to either network disposal or the Garage pedestal cache. A preparation keeps the report (and the HUD it
    // hides) as the screen: the handoff clears them.
    presentation.clearBattle(prepareOnly ? { keepScreens: true } : undefined);
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

    if (!prepareOnly && settings.isOpen()) settings.close({ noRelock: true });
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

    if (prepareOnly) {
      // The restore's shadows, uploads and settle frame are framed from the Garage camera. The showroom's
      // UI-aware pose is solved again at the handoff, once the Garage UI exists.
      ui.poseGarageCamera();
      markStage('camera');
    } else {
      showGarageScreen(selectedSpecId, markStage);
      const afterGarageUi = checkpoint();
      if (afterGarageUi) { await afterGarageUi; assertOwnedGarage(); }
      ui.poseGarageCamera();
      ui.startShowroom();
      markStage('camera');
      audio.ambientOn(false);
      audio.playGarageSting();
      markStage('audio');
    }
    if (options.skipPresentationRestore) {
      // Battle Again: the next battle's cover takes the screen before any Garage frame could show, so the GPU
      // restore (the program links of a first return) is not paid. Frames stay suppressed: presentationUnready.
      trace.restoreSkipped = true;
      trace.totalMs = Math.round(nowMs() - startedAt);
      return;
    }
    trace.presentationRestore = await restoreGaragePresentation(
      () => isCurrent() && (!entryScheduler || entryScheduler.isCurrent()),
    );
    assertOwnedGarage();
    if (!trace.presentationRestore) {
      throw new Error('Garage return completed without a presentation restore receipt');
    }
    trace.presentationUnready = false;
    markStage('presentationRestore');
    trace.totalMs = Math.round(nowMs() - startedAt);
    // Covered restore frames are intentionally bursty. Start the Garage's
    // quality baseline only after every resource and shadow unit is ready.
    if (!prepareOnly) presentation.setAdaptiveSuspended(false);
  };

  /** The Garage's screen: its phase event, the end of the battle UI, the Garage UI (the entry's own order). */
  function showGarageScreen(selectedSpecId: string, markStage: (name: string) => void): void {
    ui.emitGaragePhase();
    ui.hideEndOverlay();
    ui.exitPointerLock();
    ui.hideHud();
    markStage('eventAndHud');
    ui.showGarage(selectedSpecId);
    markStage('garageUi');
  }

  /** perf-246: the Return over a prepared Garage — only the screen changes hands; nothing is restored. */
  const performHandoff = async (trace: GarageReturnTrace): Promise<void> => {
    const startedAt = nowMs();
    let markedAt = startedAt;
    const markStage = (name: string): void => {
      const at = nowMs();
      trace.stages[name] = Math.round(at - markedAt);
      markedAt = at;
    };
    if (game.phase !== 'garage' || lastTrace !== trace || !trace.awaitingHandoff) {
      throw new Error('The prepared Garage was superseded before its handoff.');
    }
    presentation.clearBattle();
    if (settings.isOpen()) settings.close({ noRelock: true });
    markStage('handoffReset');
    work.noteActivity();
    work.resetFramePacer(nowMs());
    showGarageScreen(getSelectedSpecId(), markStage);
    ui.poseGarageCamera();
    ui.startShowroom();
    markStage('handoffCamera');
    audio.ambientOn(false);
    audio.playGarageSting();
    trace.awaitingHandoff = false;
    markStage('handoffAudio');
    trace.stages.handoff = Math.round(nowMs() - startedAt);
    presentation.setAdaptiveSuspended(false);
  };

  /** perf-246: Battle Again did not start a battle after all — pay the skipped restore before the Garage shows. */
  const performSkippedRestore = async (trace: GarageReturnTrace): Promise<void> => {
    if (game.phase !== 'garage' || lastTrace !== trace || !trace.restoreSkipped) return;
    const startedAt = nowMs();
    trace.presentationRestore = await restoreGaragePresentation();
    if (game.phase !== 'garage' || lastTrace !== trace) {
      throw new Error('Garage return was superseded by another presentation.');
    }
    if (!trace.presentationRestore) {
      throw new Error('Garage return completed without a presentation restore receipt');
    }
    trace.restoreSkipped = false;
    trace.presentationUnready = false;
    trace.stages.presentationRestore = Math.round(nowMs() - startedAt);
    presentation.setAdaptiveSuspended(false);
  };

  const track = (work: () => Promise<void>, prepareOnly = false): Promise<void> => {
    let resolveEntry!: () => void;
    let rejectEntry!: (error: Error) => void;
    const pending = new Promise<void>((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const tracked = pending.finally(() => {
      if (activeEntry === tracked) {
        activeEntry = null;
        preparing = false;
      }
    });
    // Direct recovery callers and synchronous phase listeners share one entry,
    // so an older overlapping completion cannot release a successor's cover.
    activeEntry = tracked;
    preparing = prepareOnly;
    work().then(resolveEntry, rejectEntry);
    return tracked;
  };

  const enter = (options: GarageReturnOptions = {}, isCurrent = () => true): Promise<void> => {
    if (activeEntry) {
      if (!preparing || options.prepareOnly) return activeEntry;
      // A foreground return over a preparation behind the report: Battle Again abandons it (the next battle must not
      // wait for the Garage's warm); a Return lets it finish and then hands the screen over.
      if (options.skipPresentationRestore) preparationGeneration += 1;
      return activeEntry.catch(() => {}).then(() => enter(options, isCurrent));
    }
    const prepared = lastTrace;
    if (!options.prepareOnly && game.phase === 'garage' && prepared?.awaitingHandoff
      && !prepared.presentationUnready) {
      return track(() => performHandoff(prepared));
    }
    return track(() => performEntry(options, isCurrent), options.prepareOnly === true);
  };

  const prepare = (): Promise<boolean> => {
    if (activeTransition || activeEntry || game.phase === 'garage' || isBattleEntryPending()
      || network.shouldPreserveRoom()) {
      return Promise.resolve(false);
    }
    preparationGeneration += 1;
    return enter({ prepareOnly: true })
      .then(() => lastTrace?.awaitingHandoff === true && !lastTrace.presentationUnready, () => false);
  };

  const performContextRecovery = async (isCurrent: () => boolean): Promise<boolean> => {
    const interrupted = lastTrace;
    const originalOptions = lastEntryOptions;
    // A skipped restore (Battle Again) has no Garage to recover: the next battle's entry owns the screen.
    if (game.phase !== 'garage' || !interrupted?.presentationUnready || interrupted.restoreSkipped) return false;
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
    // Input state releases immediately; the scene swap remains under the veil. The report stays on screen until the
    // veil covers it (enter() clears it there): hiding it first showed the bare battle for a few frames
    // (2026-10-22, nav-perf-240).
    presentation.clearBattle({ keepScreens: true });
    await transition.run(() => enter(), {
      kicker: t('transition.kicker.leavingBattle'),
      title: t('transition.title.garage'),
      mapId: world.currentMapId() || game.mapId,
      progress: false,
      minShowMs: 150,
      pace: 'quick',
    });
  });

  const battleAgain = (trigger: () => boolean = () => ui.triggerBattle()): Promise<void> => {
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
        // perf-246: straight back into a battle never pays the Garage's warm: a preparation behind the report is
        // abandoned, a prepared Garage only hands over its screen, and a fresh return skips the GPU restore.
        await enter({ skipPresentationRestore: true });
        const restoreSkipped = async (): Promise<void> => {
          await activeEntry?.catch(() => {});
          const trace = lastTrace;
          if (trace?.restoreSkipped) await track(() => performSkippedRestore(trace));
        };
        let triggered: boolean;
        try {
          triggered = trigger();
        } catch (error) {
          await restoreSkipped();
          throw error;
        }
        if (!triggered) {
          await restoreSkipped();
          throw new Error('Battle Again is unavailable. Your Garage is ready; choose a battle from there.');
        }
        const handoffStartedAt = nowMs();
        while (!isBattleEntryCovering() && nowMs() - handoffStartedAt < 15_000) {
          await sleep(16);
        }
        if (!isBattleEntryCovering()) {
          await restoreSkipped();
          throw new Error('The next battle did not start. Please check your battle selection and try again.');
        }
      }, {
        kicker: t('transition.kicker.regrouping'),
        title: t('transition.title.nextBattle'),
        holdSceneDuringFadeIn: true,
        mapId: world.currentMapId() || game.mapId,
        progress: false,
        minShowMs: 420,
      });
    });
  };

  return {
    get transitioning() { return activeTransition !== null; },
    get lastTrace() { return lastTrace; },
    get awaitingHandoff() { return game.phase === 'garage' && lastTrace?.awaitingHandoff === true; },
    enter,
    recoverAfterContextRestore,
    leave,
    battleAgain,
    prepare,
  };
}
