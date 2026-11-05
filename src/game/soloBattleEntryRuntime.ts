import type { RuntimeValue } from '../runtimeTypes.ts';
import type { BattleEntryLifecycle } from './battleEntryLifecycle.ts';
import type {
  SoloBattleLoadingRuntime,
  SoloBattleLoadingStartOptions,
} from './soloBattleLoadingRuntime.ts';

import type { PendingBattlefield } from '../ui/battleLoad.ts';
import { normalizeGameMode } from '../sim/gameModeCatalog.ts';
import { soloRosterSeats } from './soloRosterPlan.ts';

interface EntryLoadScreen {
  showPending(map?: string | PendingBattlefield | null, seats?: { allies: number; enemies: number } | null): void;
  hide?(): Promise<RuntimeValue> | RuntimeValue;
}

interface EntryAudio {
  loadingOn(active: boolean): void;
}

export interface SoloBattleEntryRequest extends SoloBattleLoadingStartOptions {
  specId?: string;
  mapId?: string | null;
  /** Campaign ladder operation this sortie belongs to (mission brief copy); null for free sorties. */
  campaignOperationId?: string | null;
}

interface SoloBattleEntryRuntimeOptions {
  lifecycle: BattleEntryLifecycle;
  loading: SoloBattleLoadingRuntime;
  battleLoad: EntryLoadScreen;
  audio: EntryAudio;
  enterGarage(): Promise<void> | void;
  /** Leave the recovered Garage's pre-paint checkpoint before fading coverage. */
  nextFrame(): Promise<RuntimeValue>;
  isVisibleSpecId(specId: string): boolean;
  getSelectedSpecId(): string;
  getSelectedMapId(): string;
  /** The battlefield this entry will load (a Random pick resolved the way the loading owner will consume it), so the
   * pending cover names it from its first frame; null when it cannot be known before the loading owner runs. */
  /** The pending cover's battlefield and, planned before the loading owner arrives, its teams. */
  describePendingMap?(specId: string, mapId: string | null, options?: SoloBattleLoadingStartOptions): PendingBattlefield | null;
  reportError?(message: string, error: RuntimeValue): void;
  /**
   * Entry resilience (2026-09-25): show the player why the battle did not
   * start, after the recovered Garage is painted and the loader has faded.
   * Demand-loaded by the composition root; a failed notice never masks the
   * original failure. `retry` runs the same entry again: the notice's one action (loading states, 2026-10-27).
   */
  presentFailure?(error: RuntimeValue, retry: () => void): Promise<RuntimeValue> | RuntimeValue;
  /**
   * (2026-11-02 audit F3 review) The recovery's own Garage return failed: say so over the released cover, with the
   * one action that unblocks the player (`retry` runs the return again). Without it the entry notice carries the
   * return's failure and that retry. main binds the Garage return failure notice.
   */
  presentReturnFailure?(error: RuntimeValue, retry: () => void): Promise<RuntimeValue> | RuntimeValue;
  /** Beacon port: the bounded outcome of a failed solo entry. */
  onFailure?(error: RuntimeValue): void;
  /**
   * (2026-11-02 audit F2) "A battle entry began" (`ui:battleStart`) for an entry its caller did not announce: the Play
   * menu, the campaign ladder and `beginSelected` callers. The Garage BATTLE button announces its own press before it
   * calls `begin`. Runs once the entry is accepted and no Garage return is in flight (round 2 U19), before its cover:
   * inside the press's task unless it waited for a return.
   */
  announce?(payload: { specId: string; mapId: string | null; gameMode: string; campaignOperationId: string | null }): void;
  /**
   * (2026-11-02 audit F3) Resolves when no Garage return is in flight. An entry accepted during a return (a press
   * under its veil, a menu start) waits for it here, holding the entry latch, instead of racing its restore.
   */
  whenGarageSettled?(): Promise<void> | null | void;
  /**
   * (2026-11-02 audit F2 review) Record what this entry asked for beyond its tank and map (main: battleEntryIntent,
   * the mode's battlefield variant, its campaign operation, a watched battle), for every accepted entry: the Garage
   * button, the Play menu and the ladder, and a failure notice's retry, whose recovery return cleared the record.
   * Runs once no Garage return is in flight (a return's 'garage' announcement clears the record), before the cover.
   */
  recordIntent?(options: SoloBattleLoadingStartOptions | undefined): void;
  /**
   * (round 2, app-flow) A network round owns the screen outside the entry latch (main: the composition's `entering`, a
   * round the room's session entered on a later match_start while the room is kept, with no launch of its own). A
   * start then is refused as the latch refuses one (busy): it covered and loaded a solo battle over the round's loader.
   */
  isNetworkRoundEntering?(): boolean;
  /**
   * (round 2, app-flow review 2) The scene can hand over to a battle now (main: the app lifecycle's edge table). Read at
   * the press and again after a return wait, before the announcement, the intent and the cover; a start it refuses is
   * refused as the latch refuses one (busy). A start over the Studio (the __DEBUG.beginSoloBattle hook) covered and
   * loaded its world there and was refused only by the solo start after that load; a start queued behind a return
   * resumed with no check at all.
   */
  canTakeScene?(): boolean;
}

interface SoloBattleEntryRuntime {
  begin(
    specId: string,
    mapId?: string | null,
    options?: SoloBattleLoadingStartOptions,
  ): Promise<void>;
  beginSelected(request?: SoloBattleEntryRequest): Promise<void>;
}

/**
 * The pending cover as the entry chose it: its battlefield as described (or its id alone, where the description found
 * nothing) and the chosen mode, a campaign operation's with it. Its chip names the mode from the first frame: the
 * cover's placeholder read "Random Battle · Standard" over the Proving Ground and a campaign operation (the 262
 * production check).
 */
function withChosenMode(pending: PendingBattlefield | string | null, options: SoloBattleLoadingStartOptions | undefined): PendingBattlefield {
  const described: PendingBattlefield = typeof pending === 'string' || pending === null ? { mapId: pending ?? '' } : pending;
  const campaignOperationId = options?.campaignOperationId ?? null;
  return { ...described, modeId: normalizeGameMode(options?.gameMode ?? 'standard'),
    ...(campaignOperationId ? { campaign: true, campaignOperationId } : {}) };
}

/**
 * Owns the player-facing solo entry transaction and its fail-safe return. A
 * failed cold import or world build paints the restored Garage while coverage
 * is still opaque, then dismisses the loader so a first visit cannot strand a
 * stale or black WebGL frame.
 */
export function createSoloBattleEntryRuntime({
  lifecycle,
  loading,
  battleLoad,
  audio,
  enterGarage,
  nextFrame,
  isVisibleSpecId,
  getSelectedSpecId,
  getSelectedMapId,
  describePendingMap = () => null,
  reportError = (message, error) => console.error(message, error),
  presentFailure = () => {},
  presentReturnFailure = presentFailure,
  onFailure = () => {},
  announce = () => {},
  whenGarageSettled = () => {},
  recordIntent = () => {},
  isNetworkRoundEntering = () => false,
  canTakeScene = () => true,
}: SoloBattleEntryRuntimeOptions): SoloBattleEntryRuntime {
  const required = [battleLoad?.showPending, lifecycle?.run, lifecycle?.coverRendering,
    lifecycle?.uncoverRendering, loading?.begin, audio?.loadingOn, enterGarage,
    nextFrame, isVisibleSpecId, getSelectedSpecId, getSelectedMapId, reportError, presentFailure, presentReturnFailure,
    onFailure, announce, whenGarageSettled, recordIntent, isNetworkRoundEntering, canTakeScene];
  /** Another owner has the screen (a network round entering), or the scene may not hand over to a battle: busy. */
  const sceneRefused = (): boolean => isNetworkRoundEntering() || !canTakeScene();
  if (!battleLoad || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('solo battle entry runtime requires every recovery port');
  }

  const run = (
    specId: string,
    mapId: string | null,
    options: SoloBattleLoadingStartOptions | undefined,
    announced: boolean,
  ): Promise<void> => (sceneRefused() ? Promise.resolve() : lifecycle.run(async () => {
    try {
      // A Garage return still in flight (its veil, its restore) finishes first: the entry latch holds this request.
      // (no return in flight: no wait, so the announcement and the cover still land inside the press's task)
      const returning = whenGarageSettled();
      if (returning) {
        await returning;
        // (round 2, app-flow) a network round the room's session entered meanwhile has the screen, or (review 2) the
        // scene is not one a battle may take (a Studio opened meanwhile): busy, as at the press
        if (sceneRefused()) return;
      }
      // (round 2 U19) announced once the return is done: its 'garage' announcement (the battle before leaving) comes
      // first, so every ui:battleStart listener sees this battle begin after it (profile.ts keys its tally the same way)
      if (!announced) {
        try {
          announce({ specId, mapId, gameMode: options?.gameMode ?? 'standard',
            campaignOperationId: options?.campaignOperationId ?? null });
        } catch (error) {
          // the press's listeners never block the entry (garage.ts launchBattle contains them the same way)
          reportError('[battle] battle-start listener failed', error);
        }
      }
      // the entry's whole intent, after the return's 'garage' announcement (which clears it), before the cover
      recordIntent(options);
      // The loading transaction itself is demand-loaded. Own its canonical
      // surface inside the accepted entry latch before awaiting that import.
      let pending: PendingBattlefield | string | null = mapId;
      try { pending = describePendingMap(specId, mapId, options) ?? mapId; } catch { /* the cover never waits on a name */ }
      // (the cover's sheets hold the sortie's seats from the press, the loading owner's first frame the same; and its
      // rules row the chosen mode, whatever the description found)
      battleLoad.showPending(withChosenMode(pending, options), soloRosterSeats(options?.gameMode, options?.campaignOperationId));
      lifecycle.coverRendering();
      await loading.begin(specId, mapId, options);
    } catch (error) {
      reportError('[battle] entry failed', error);
      try { onFailure(error); } catch (_) { /* a beacon never changes recovery */ }
      audio.loadingOn(false);
      // (2026-11-02 audit F3 review) the recovery's return can fail as well: the cover still comes down (it stayed up
      // for good, over a frozen 'failed' return with no Esc and no notice), and the notice offers the return again.
      // A return that failed has no Garage to paint (its frames stay suppressed), so there is no paint to wait for; a
      // restored Garage still gets its paint first, and a failed paint keeps the cover (never an unpainted Garage).
      let returned = false;
      let returnError: RuntimeValue = null;
      try {
        await enterGarage();
        returned = true;
      } catch (recoveryError) {
        returnError = recoveryError;
        reportError('[battle] entry recovery return failed', recoveryError);
      }
      lifecycle.uncoverRendering();
      if (returned) await nextFrame();
      await battleLoad.hide?.();
      // Entry resilience (2026-09-25): the player used to be returned to the
      // Garage with nothing but a console line. The notice comes last so it
      // opens over a painted Garage, and its own failure is only reported.
      try {
        if (returned) await presentFailure(error, () => { void run(specId, mapId, options, false); });
        else await presentReturnFailure(returnError, retryReturn);
      } catch (noticeError) {
        reportError('[battle] entry failure notice unavailable', noticeError);
      }
    }
  }, undefined));

  /** A failed recovery return's retry: the return again, and its notice again if that fails too. */
  const retryReturn = (): void => {
    void Promise.resolve().then(() => enterGarage()).catch((again: RuntimeValue) => {
      reportError('[battle] entry recovery return failed', again);
      return presentReturnFailure(again, retryReturn);
    }).catch((noticeError: RuntimeValue) => reportError('[battle] entry failure notice unavailable', noticeError));
  };

  return Object.freeze({
    /** The Garage BATTLE button's entry: the button announced its press (`ui:battleStart`) itself. */
    begin: (specId: string, mapId: string | null = null, options: SoloBattleLoadingStartOptions | undefined = undefined) => (
      run(specId, mapId, options, true)
    ),
    beginSelected({
      specId,
      mapId,
      randomRoster = true,
      gameMode = 'standard',
      campaignOperationId = null,
    }: SoloBattleEntryRequest = {}) {
      const selected = specId && isVisibleSpecId(specId) ? specId : getSelectedSpecId();
      return run(selected, mapId || getSelectedMapId(), {
        randomRoster, gameMode, ...(campaignOperationId ? { campaignOperationId } : {}),
      }, false);
    },
  });
}
