import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import { t } from '../ui/i18n.ts';
import { transitionAppPhase, type AppPhase } from './appLifecycle.ts';
import { transitionBattleCountdown } from './preBattleCountdown.ts';
import type { GaragePresentationRestoreReceipt } from './garagePhasePresentationRuntime.ts';
import type { BattleAgainOutcome } from './battleEntryIntent.ts';

/**
 * The Garage return's one state (2026-11-02 audit F3). It is moved only by `moveTo` along RETURN_EDGES, by the
 * return that owns the current trace; the trace's flags below are its published diagnostics, never its control.
 * - idle: nothing owed (no return yet, or the last one handed over a restored Garage)
 * - entering: a foreground return swaps the Garage in under its veil
 * - preparing / prepared: (perf-246) a return behind the battle report; prepared waits for the player's Return
 * - handoff: the prepared Garage takes the screen
 * - restoreSkipped: Battle Again left the GPU restore unpaid (the next battle's cover owns the screen)
 * - restoring: paying a skipped restore (Battle Again did not start a battle after all)
 * - failed: a return threw; Garage frames stay suppressed until a later return succeeds
 * - superseded: (audit F3 review) a return cut short by another presentation (it owns the scene) or a graphics-context
 *   change (the context recovery retries the return); frames stay suppressed, but it is no failure: nothing to notify
 */
export type GarageReturnState =
  | 'idle' | 'entering' | 'preparing' | 'prepared' | 'handoff' | 'restoreSkipped' | 'restoring' | 'failed' | 'superseded';

export const GARAGE_RETURN_EDGES: Readonly<Record<GarageReturnState, readonly GarageReturnState[]>> = Object.freeze({
  idle: Object.freeze(['entering', 'preparing'] as const),
  entering: Object.freeze(['idle', 'restoreSkipped', 'failed', 'superseded'] as const),
  preparing: Object.freeze(['prepared', 'failed', 'superseded'] as const),
  prepared: Object.freeze(['handoff', 'entering', 'preparing'] as const),
  handoff: Object.freeze(['idle', 'failed'] as const),
  restoreSkipped: Object.freeze(['restoring', 'entering', 'preparing'] as const),
  restoring: Object.freeze(['idle', 'failed', 'superseded'] as const),
  failed: Object.freeze(['entering', 'preparing'] as const),
  superseded: Object.freeze(['entering', 'preparing'] as const),
});

/** The two player-facing return operations; one holds the transition lease at a time. */
export type GarageReturnOperation = 'leave' | 'battleAgain';

/** A second, different return operation while one is in flight: refused by name, never silently merged. */
export class GarageReturnBusyError extends Error {
  readonly code = 'garage_return_busy';
  readonly active: GarageReturnOperation;
  readonly requested: GarageReturnOperation;
  constructor(active: GarageReturnOperation, requested: GarageReturnOperation) {
    super(`The Garage return is busy with ${active}; ${requested} was not started.`);
    this.name = 'GarageReturnBusyError';
    this.active = active;
    this.requested = requested;
  }
}

/**
 * (2026-11-02 audit F3 review) A return cut short by another presentation (`presentation`: a round activated, a newer
 * return) or by its graphics context (`context`: lost, replaced, or the caller's own context expired). Not a failure:
 * the presentation that took the scene, or the context recovery that retries the return, owns the screen, so callers
 * open no failure notice for it (and a Retry there would race that recovery).
 */
export class GarageReturnSupersededError extends Error {
  readonly code = 'garage_return_superseded';
  readonly by: 'presentation' | 'context';
  constructor(by: 'presentation' | 'context', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GarageReturnSupersededError';
    this.by = by;
  }
}

export function isGarageReturnSuperseded(error: unknown): error is GarageReturnSupersededError {
  return error instanceof GarageReturnSupersededError
    || (!!error && typeof error === 'object' && (error as { code?: unknown }).code === 'garage_return_superseded');
}

export function isGarageReturnBusy(error: unknown): error is GarageReturnBusyError {
  return error instanceof GarageReturnBusyError
    || (!!error && typeof error === 'object' && (error as { code?: unknown }).code === 'garage_return_busy');
}

/** The wait a Battle Again gives the previous entry to finish, and the next one to cover. */
const BATTLE_AGAIN_WAIT_MS = 15_000;

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
  hideEndOverlay(): void;
  exitPointerLock(): void;
  hideHud(): void;
  showGarage(specId: string): void;
  poseGarageCamera(): void;
  startShowroom(): void;
  /**
   * Battle Again's replay of the entry it follows (round 8 Y4 s3-04, main.ts: battleEntryIntent.ts replayBattleEntry):
   * 'started' once the Garage's own press for it started, 'lobby' when a couch rematch found no phone here and opened
   * the couch lobby, 'unavailable' when nothing could start.
   */
  triggerBattle(): BattleAgainOutcome;
}

interface GarageReturnAudioPort {
  ambientOn(enabled: boolean): void;
  playGarageSting(): void;
}

interface GarageReturnGameState {
  phase: AppPhase;
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
  /** Resolves once no battle entry is pending (the entry lifecycle's settle edge; no polling). */
  whenBattleEntrySettled(): Promise<void>;
  /** Resolves once a battle entry's cover owns the screen (the entry lifecycle's cover edge; no polling). */
  whenBattleEntryCovering(): Promise<void>;
  nowMs?: () => number;
  /** The one deadline timer of a Battle Again wait; `signal` aborts it (clears the timer) once the edge arrived. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  publishTrace?: (trace: GarageReturnTrace) => void;
}

export interface GarageReturnRuntime {
  readonly transitioning: boolean;
  /** The player-facing operation holding the transition lease, or null. */
  readonly operation: GarageReturnOperation | null;
  /** The return's explicit state (GarageReturnState); the frame gate and the lifecycle read it. */
  readonly state: GarageReturnState;
  /** Ordinary Garage frames stay suppressed (the Garage is not handed over restored). */
  readonly framesSuppressed: boolean;
  /**
   * (round 3 B2) The return still owes the player the Garage once nothing is in flight: a failed return (its notice is
   * the screen, frames suppressed, and its Retry, the return again, tears down whatever loaded under it), or one a
   * context change cut short over the Garage's scene (the context recovery retries it there). A battle, solo or network,
   * takes the scene from no such return (main.ts battleSceneRefusal); a skipped restore is Battle Again's own next
   * battle, and a Garage prepared behind the report is the report's. (review r1) False while a return is in flight (a
   * Leave's veil fading in over a failed return, a retry): that return decides, so a start waits for it (whenSettled).
   */
  readonly owesGarage: boolean;
  /**
   * (round 3 B2, review r1) The error that left the return 'failed'; null in every other state. A battle the failed
   * return refused reopens its notice with it (main.ts offerOwedGarageReturn): the notice closes by its X, Escape or a
   * press beside it, which runs nothing, and the return stays 'failed' until a return lands.
   */
  readonly failure: unknown;
  /**
   * Resolves when no return is in flight: a Leave until its entry settles (its veil's fade-in, before the entry begins,
   * included; its dwell and fade-out not, so a waiting start covers under the still-opaque veil) and any return entry
   * (swap, preparation, handoff, skipped restore); null: none is. Battle Again's lease is not waited for: its own
   * trigger starts the next battle inside it.
   */
  whenSettled(): Promise<void> | null;
  readonly lastTrace: GarageReturnTrace | null;
  enter(options?: GarageReturnOptions): Promise<void>;
  /** Retry an interrupted canonical return under the restored device's cover. */
  recoverAfterContextRestore(isCurrent: () => boolean): Promise<boolean>;
  leave(): Promise<void>;
  /**
   * Covered return then a new entry; the trigger defaults to the replay of the last entry (ui.triggerBattle; the campaign
   * ladder passes its own). A trigger that opened the couch lobby ('lobby') settles in the Garage: no failure, no wait.
   */
  battleAgain(trigger?: () => BattleAgainOutcome): Promise<void>;
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
      ['setGarageSpots', 'setGarageSunTrim', 'hideEndOverlay',
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
        whenBattleEntrySettled: options.whenBattleEntrySettled,
        whenBattleEntryCovering: options.whenBattleEntryCovering,
        nowMs: options.nowMs ?? (() => performance.now()),
        sleep: options.sleep ?? (() => Promise.resolve()),
        publishTrace: options.publishTrace ?? (() => {}),
      },
      'garage return lifecycle',
      ['getSelectedSpecId', 'restoreGaragePresentation', 'createEntryScheduler', 'isBattleEntryPending',
        'isBattleEntryCovering', 'whenBattleEntrySettled', 'whenBattleEntryCovering', 'nowMs', 'sleep', 'publishTrace'],
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
    whenBattleEntrySettled,
    whenBattleEntryCovering,
    nowMs = () => performance.now(),
    sleep = (milliseconds, signal) => new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    }),
    publishTrace = () => {},
  } = options;

  // The leases: the player-facing transition (one operation), the return entry in flight (its kind), the context
  // recovery (its device). Joining callers share a lease's promise; the state below is what they did.
  let transitionLease: { readonly promise: Promise<void>; readonly operation: GarageReturnOperation } | null = null;
  let entryLease: { readonly promise: Promise<void>; readonly prepares: boolean } | null = null;
  let recoveryLease: { readonly promise: Promise<boolean>; readonly isCurrent: () => boolean } | null = null;
  // (round 2 U21, review 2) a Leave's run until its entry settles: its veil's fade-in included, its dwell and fade-out not
  let leaveEntry: Promise<void> | null = null;
  let lastTrace: GarageReturnTrace | null = null;
  let lastEntryOptions: GarageReturnOptions = {};
  let state: GarageReturnState = 'idle';
  // (round 3 B2, review r1) what left the return 'failed' (read only in that state)
  let failure: unknown = null;
  // perf-246: Battle Again abandons a preparation behind the report by advancing the generation its isCurrent reads.
  let preparationGeneration = 0;

  /** The one state writer: only the return that owns the current trace moves it, and only along an edge. */
  const moveTo = (next: GarageReturnState, trace: GarageReturnTrace): void => {
    if (trace !== lastTrace) return;
    if (!GARAGE_RETURN_EDGES[state].includes(next)) {
      throw new Error(`Garage return cannot move from ${state} to ${next}.`);
    }
    state = next;
  };
  /**
   * A thrown return step: the current return's state becomes 'failed', or 'superseded' when another presentation or a
   * context change cut it short (a step after its success edge keeps its state).
   */
  const fail = (trace: GarageReturnTrace, error: unknown): void => {
    const next: GarageReturnState = isGarageReturnSuperseded(error) ? 'superseded' : 'failed';
    if (trace === lastTrace && GARAGE_RETURN_EDGES[state].includes(next)) {
      state = next;
      failure = next === 'failed' ? error : null;
    }
  };

  const performEntry = async (options: GarageReturnOptions, isCallerCurrent: () => boolean): Promise<void> => {
    const entryScheduler = createEntryScheduler?.();
    const prepareOnly = options.prepareOnly === true;
    // A preparation (prepare() or its context-loss retry) is abandoned the moment Battle Again advances the generation.
    const generation = preparationGeneration;
    const isCurrent = (): boolean => isCallerCurrent() && (!prepareOnly || generation === preparationGeneration);
    const assertCurrent = (): void => {
      if (!isCurrent() || (entryScheduler && !entryScheduler.isCurrent())) {
        throw new GarageReturnSupersededError('context', 'Garage return recovery was superseded or its graphics context changed.');
      }
    };
    assertCurrent();
    const trace: GarageReturnTrace = {
      stages: {}, presentationUnready: true, cooperativeYieldCount: 0, cooperativeYieldMs: 0,
      ...(prepareOnly ? { awaitingHandoff: true } : {}),
    };
    // Publish ownership before any adapter can mutate roots/phase or re-enter.
    // Failure deliberately leaves the state 'failed' or 'superseded' (frames suppressed) after the pending promise clears.
    lastTrace = trace;
    moveTo(prepareOnly ? 'preparing' : 'entering', trace);
    try {
      await performEntrySteps(options, trace, entryScheduler, isCurrent, assertCurrent);
    } catch (error) {
      fail(trace, error);
      throw error;
    }
  };

  /**
   * (round 8 Y4 s2-03) A restore that rejects once its currency ended was abandoned, not failed: the return records why,
   * and owes nothing it would not owe to that cause. Another presentation took the scene (a phase writer that does not
   * wait for the return, the dev still's garage -> shot, or a newer return): superseded by the presentation, so no
   * failure notice opens over it and owesGarage refuses no later start. The caller (a preparation Battle Again abandoned)
   * or the graphics context expired: superseded by the context, which the context recovery retries. Anything else, or a
   * restore that failed while still current, stays the return's failure. The message keeps "abandoned" (269's receipt).
   */
  const abandonedRestore = (
    trace: GarageReturnTrace,
    cause: unknown,
    isCurrent: () => boolean,
    entryScheduler: GarageReturnEntryScheduler | undefined,
  ): GarageReturnSupersededError | null => {
    if (game.phase !== 'garage' || lastTrace !== trace) {
      return new GarageReturnSupersededError('presentation', 'Garage restore abandoned: superseded by another presentation.',
        { cause });
    }
    if (!isCurrent() || (entryScheduler && !entryScheduler.isCurrent())) {
      return new GarageReturnSupersededError('context',
        'Garage restore abandoned: its caller or its graphics context is no longer current.', { cause });
    }
    return null;
  };

  const performEntrySteps = async (
    options: GarageReturnOptions,
    trace: GarageReturnTrace,
    entryScheduler: GarageReturnEntryScheduler | undefined,
    isCurrent: () => boolean,
    assertCurrent: () => void,
  ): Promise<void> => {
    const prepareOnly = options.prepareOnly === true;
    const preserveRoom = options.preserveRoom ?? network.shouldPreserveRoom();
    // (round 2, app-flow review 2) A return from the Studio releases no network presentation: the Studio never holds one
    // (the edge table refuses studio -> battle, and a network round takes the scene from a Studio only once it has left,
    // main.ts takeSceneForRound). The release ran from every phase, so the Studio's exit disposed the kept room's round
    // that was waiting on that very hand-over and left its match ('returned_to_garage'), with no failure and no notice.
    const releasesNetwork = game.phase !== 'studio';
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
        throw new GarageReturnSupersededError('presentation', 'Garage return was superseded by another presentation.');
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

    if (releasesNetwork) {
      if (preserveRoom) network.disposePresentation();
      else network.closeMatch('returned_to_garage');
    }
    markStage('networkRelease');

    transitionBattleCountdown(game, 'clear');
    warm.invalidate();
    warm.cancel();
    warm.setPending(false);
    presentation.setShotMode(false);
    presentation.setCaptureHidden(false);
    presentation.unfreezeEffects();
    // The scene is the Garage's from here; the screen changes hands (the announcement) at showGarageScreen, or at
    // the handoff of a preparation behind the report.
    transitionAppPhase(game, 'garage', { reason: prepareOnly ? 'garage-return:prepare' : 'garage-return', announce: false });

    // The return's state and the Garage phase now suppress all ordinary
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
      moveTo('restoreSkipped', trace);
      return;
    }
    // (269) the restore is the Garage's only while the Garage is the phase: a battle started from the Garage it already
    // shows abandons it at its next step, as the dressing before it stops (main.ts finishGarageDressingUnderCover)
    try {
      trace.presentationRestore = await restoreGaragePresentation(
        () => isCurrent() && game.phase === 'garage' && (!entryScheduler || entryScheduler.isCurrent()),
      );
    } catch (error) {
      throw abandonedRestore(trace, error, isCurrent, entryScheduler) ?? error;
    }
    assertOwnedGarage();
    if (!trace.presentationRestore) {
      throw new Error('Garage return completed without a presentation restore receipt');
    }
    trace.presentationUnready = false;
    markStage('presentationRestore');
    trace.totalMs = Math.round(nowMs() - startedAt);
    moveTo(prepareOnly ? 'prepared' : 'idle', trace);
    // Covered restore frames are intentionally bursty. Start the Garage's
    // quality baseline only after every resource and shadow unit is ready.
    if (!prepareOnly) presentation.setAdaptiveSuspended(false);
  };

  /** The Garage's screen: its phase event, the end of the battle UI, the Garage UI (the entry's own order). */
  function showGarageScreen(selectedSpecId: string, markStage: (name: string) => void): void {
    // The screen changes hands: the lifecycle announces the Garage (phase:change). A return whose scene another
    // presentation already took (a battle started under it) announces nothing and never takes the scene back.
    if (game.phase === 'garage') transitionAppPhase(game, 'garage', { reason: 'garage-return:screen' });
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
    if (game.phase !== 'garage' || lastTrace !== trace || state !== 'prepared') {
      throw new GarageReturnSupersededError('presentation', 'The prepared Garage was superseded before its handoff.');
    }
    // (round 2 U20) the report is no longer the screen: a retry of this return (its context recovery) hands it over
    lastEntryOptions = { preserveRoom: lastEntryOptions.preserveRoom };
    moveTo('handoff', trace);
    try {
      performHandoffSteps(trace, startedAt, markStage);
    } catch (error) {
      fail(trace, error);
      throw error;
    }
  };

  const performHandoffSteps = (trace: GarageReturnTrace, startedAt: number, markStage: (name: string) => void): void => {
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
    moveTo('idle', trace);
    presentation.setAdaptiveSuspended(false);
  };

  /** perf-246: Battle Again did not start a battle after all — pay the skipped restore before the Garage shows. */
  const performSkippedRestore = async (trace: GarageReturnTrace): Promise<void> => {
    if (game.phase !== 'garage' || lastTrace !== trace || state !== 'restoreSkipped') return;
    const startedAt = nowMs();
    moveTo('restoring', trace);
    try {
      trace.presentationRestore = await restoreGaragePresentation();
      if (game.phase !== 'garage' || lastTrace !== trace) {
        throw new GarageReturnSupersededError('presentation', 'Garage return was superseded by another presentation.');
      }
      if (!trace.presentationRestore) {
        throw new Error('Garage return completed without a presentation restore receipt');
      }
    } catch (error) {
      fail(trace, error);
      throw error;
    }
    trace.restoreSkipped = false;
    trace.presentationUnready = false;
    trace.stages.presentationRestore = Math.round(nowMs() - startedAt);
    moveTo('idle', trace);
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
      if (entryLease?.promise === tracked) entryLease = null;
    });
    // Direct recovery callers and synchronous phase listeners share one entry,
    // so an older overlapping completion cannot release a successor's cover.
    entryLease = { promise: tracked, prepares: prepareOnly };
    work().then(resolveEntry, rejectEntry);
    return tracked;
  };

  const enter = (options: GarageReturnOptions = {}, isCurrent = () => true): Promise<void> => {
    if (entryLease) {
      if (!entryLease.prepares || options.prepareOnly) return entryLease.promise;
      // A foreground return over a preparation behind the report: Battle Again abandons it (the next battle must not
      // wait for the Garage's warm); a Return lets it finish and then hands the screen over.
      if (options.skipPresentationRestore) preparationGeneration += 1;
      return entryLease.promise.catch(() => {}).then(() => enter(options, isCurrent));
    }
    const prepared = lastTrace;
    if (!options.prepareOnly && game.phase === 'garage' && prepared && state === 'prepared') {
      return track(() => performHandoff(prepared));
    }
    return track(() => performEntry(options, isCurrent), options.prepareOnly === true);
  };

  const prepare = (): Promise<boolean> => {
    if (transitionLease || entryLease || game.phase === 'garage' || isBattleEntryPending()
      || network.shouldPreserveRoom()) {
      return Promise.resolve(false);
    }
    preparationGeneration += 1;
    return enter({ prepareOnly: true }).then(() => state === 'prepared', () => false);
  };

  /**
   * (round 2 U20) The context recovery decides from the return's state, never its trace's diagnostics (a failed
   * handoff's trace says its preparation restored the Garage, so it was never retried). Nothing is owed by an idle
   * return, a Garage prepared behind the report (main restores its GPU; its handoff restores nothing) or a skipped
   * restore (the next battle's entry owns the screen); a return in flight is waited for; a failed or superseded one is
   * retried.
   */
  const recoveryRetries = (current: GarageReturnState): boolean => current === 'failed' || current === 'superseded';
  const currentState = (): GarageReturnState => state;
  const performContextRecovery = async (isCurrent: () => boolean): Promise<boolean> => {
    const interrupted = lastTrace;
    if (game.phase !== 'garage' || !interrupted || state === 'idle' || state === 'prepared' || state === 'restoreSkipped') {
      return false;
    }
    // A loss can still be unwinding through the original entry's await. Do not
    // race its teardown or mistake its eventual rejection for a recovery failure.
    await entryLease?.promise.catch(() => {});
    if (!isCurrent()) throw new Error('Garage graphics recovery belongs to an expired context.');
    if (game.phase !== 'garage') return false;
    if (lastTrace !== interrupted) {
      // A newer user-owned return wins. Wait for it, but never retry it with the
      // older room policy or clear its incomplete transaction using a GPU receipt.
      await entryLease?.promise;
      if (!isCurrent()) throw new Error('Garage graphics recovery belongs to an expired context.');
      if (game.phase !== 'garage') return false;
      // (the newer return's state as it settled: the awaits above moved it, which the narrowing does not see)
      const settled = currentState();
      if (recoveryRetries(settled) || settled === 'restoreSkipped') throw new Error('The newer Garage return is not ready.');
      return false;
    }
    if (!recoveryRetries(state)) return false;
    // (the options of the return it retries, as it last ran: a handoff's are a foreground return's)
    await enter(lastEntryOptions, () => isCurrent() && game.phase === 'garage');
    return true;
  };

  const recoverAfterContextRestore = (isCurrent: () => boolean): Promise<boolean> => {
    if (recoveryLease) {
      if (recoveryLease.isCurrent()) return recoveryLease.promise;
      // A second restored device must not inherit the older device's rejected
      // preparation. Join its unwind, then acquire a fresh canonical retry.
      return recoveryLease.promise.catch(() => false).then(() => recoverAfterContextRestore(isCurrent));
    }
    const pending = performContextRecovery(isCurrent);
    const tracked = pending.finally(() => {
      if (recoveryLease?.promise === tracked) recoveryLease = null;
    });
    recoveryLease = { promise: tracked, isCurrent };
    return tracked;
  };

  /**
   * The transition lease. The same operation joins the one in flight (a repeated click); a different one is refused
   * by name (GarageReturnBusyError): a Leave during Battle Again, or the reverse, never silently becomes the other.
   */
  const beginTransition = (kind: GarageReturnOperation, operation: () => Promise<void>): Promise<void> => {
    if (transitionLease) {
      if (transitionLease.operation === kind) return transitionLease.promise;
      return Promise.reject(new GarageReturnBusyError(transitionLease.operation, kind));
    }
    let resolvePending!: () => void;
    let rejectPending!: (error: Error) => void;
    const pending = new Promise<void>((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    // Arm the latch before invoking any adapter. A transition may synchronously
    // emit phase/UI events, and those re-entrant callers must join this lease.
    const tracked = pending.finally(() => {
      if (transitionLease?.promise === tracked) transitionLease = null;
    });
    transitionLease = { promise: tracked, operation: kind };
    try {
      operation().then(resolvePending, rejectPending);
    } catch (error) {
      rejectPending(error instanceof Error
        ? error
        : new Error('Garage return transition failed', { cause: error }));
    }
    return tracked;
  };

  /** One event-driven wait with one deadline: true when the edge arrived first (its deadline timer then clears). */
  const waitFor = async (edge: Promise<void>, milliseconds: number): Promise<boolean> => {
    const deadline = new AbortController();
    try {
      return await Promise.race([edge.then(() => true), sleep(milliseconds, deadline.signal).then(() => false)]);
    } finally {
      deadline.abort();
    }
  };

  const leave = (): Promise<void> => beginTransition('leave', async () => {
    // (round 2 U21, review 2) "this Leave's entry has settled", for whenSettled: released when its entry settles or, if
    // the veil was taken over before the entry ran, when the Leave ends
    let settleEntry!: () => void;
    const entrySettled = new Promise<void>((resolve) => { settleEntry = resolve; });
    const releaseEntry = (): void => {
      if (leaveEntry === entrySettled) leaveEntry = null;
      settleEntry();
    };
    leaveEntry = entrySettled;
    try {
      // Input state releases immediately; the scene swap remains under the veil. The report stays on screen until the
      // veil covers it (enter() clears it there): hiding it first showed the bare battle for a few frames
      // (2026-10-22, nav-perf-240).
      presentation.clearBattle({ keepScreens: true });
      await transition.run(() => enter().finally(releaseEntry), {
        kicker: t('transition.kicker.leavingBattle'),
        title: t('transition.title.garage'),
        mapId: world.currentMapId() || game.mapId,
        progress: false,
        minShowMs: 150,
        pace: 'quick',
      });
    } finally {
      releaseEntry();
    }
  });

  const battleAgain = (trigger: () => BattleAgainOutcome = () => ui.triggerBattle()): Promise<void> => (
    beginTransition('battleAgain', async () => {
      await transition.run(async () => {
        // Cover the whole wait, and never dispose state owned by an entry that
        // has not finished. The report stays intact until covered enter().
        if (isBattleEntryPending()) await waitFor(whenBattleEntrySettled(), BATTLE_AGAIN_WAIT_MS);
        if (isBattleEntryPending()) {
          throw new Error('The previous battle is still loading. Please try Battle Again when it finishes.');
        }
        // perf-246: straight back into a battle never pays the Garage's warm: a preparation behind the report is
        // abandoned, a prepared Garage only hands over its screen, and a fresh return skips the GPU restore.
        await enter({ skipPresentationRestore: true });
        const restoreSkipped = async (): Promise<void> => {
          await entryLease?.promise.catch(() => {});
          const trace = lastTrace;
          if (trace && state === 'restoreSkipped') await track(() => performSkippedRestore(trace));
        };
        let outcome: BattleAgainOutcome;
        try {
          outcome = trigger();
        } catch (error) {
          await restoreSkipped();
          throw error;
        }
        // (round 8 Y4 s3-04) a couch rematch with no phone here opened the couch lobby over the Garage: the return
        // settles there (its skipped restore paid), with no failure notice and no wait for a battle that is not coming
        if (outcome === 'lobby') {
          await restoreSkipped();
          return;
        }
        if (outcome !== 'started') {
          await restoreSkipped();
          throw new Error('Battle Again is unavailable. Your Garage is ready; choose a battle from there.');
        }
        if (!isBattleEntryCovering() && !await waitFor(whenBattleEntryCovering(), BATTLE_AGAIN_WAIT_MS)) {
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
    })
  );

  /**
   * (round 2 U21) The one "a return is in flight" edge every battle start waits on (main's whenGarageSettled): it read
   * only the entry lease, so a start accepted while a Leave's veil still faded in (the lease held, the entry not yet
   * begun) did not wait, and its cover and load ran under the veil where the return's teardown cleared them.
   * (review 2) A Leave counts until its entry settles, not for its whole lease: through the veil's dwell and fade-out
   * the queued start held the latch with no cover, main's lifecycle read 'garage' over the uncovered Garage (whose
   * presses .cot-trans.out passes), a Studio opened there, and the start then covered and loaded over it. Now the
   * start's cover lands in the microtask chain that ends the entry, under the still-opaque veil (z-index 170 over the
   * loader's 150), which then fades out onto it.
   */
  const whenSettled = (): Promise<void> | null => {
    const leaving = leaveEntry;
    const entering = entryLease?.promise ?? null;
    if (!leaving && !entering) return null;
    return Promise.all([leaving, entering].map((lease) => lease?.then(() => {}, () => {})))
      .then(() => whenSettled() ?? undefined);
  };

  return {
    get transitioning() { return transitionLease !== null; },
    get operation() { return transitionLease?.operation ?? null; },
    get state() { return state; },
    get framesSuppressed() { return state !== 'idle'; },
    get owesGarage() {
      return !leaveEntry && !entryLease && (state === 'failed' || (state === 'superseded' && game.phase === 'garage'));
    },
    get failure() { return state === 'failed' ? failure : null; },
    whenSettled,
    get lastTrace() { return lastTrace; },
    get awaitingHandoff() {
      return game.phase === 'garage' && (state === 'preparing' || state === 'prepared' || state === 'handoff');
    },
    enter,
    recoverAfterContextRestore,
    leave,
    battleAgain,
    prepare,
  };
}
