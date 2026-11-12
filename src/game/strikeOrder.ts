/**
 * strikeOrder.ts — the crew's strike order (air-support-runs-272; owner 2026-11-11: "sometimes in air support u cant order
 * airstrikes and stuff even though its been called"). One owner for every transition of a call the crew makes from the
 * strike view, and one rule for whether a call can be made.
 *
 *   idle --press, refused at the plate--> denied(reason) --DENIED_S--> idle
 *   idle --press, sent--> sent --authority took it (mode:strike_called, ours)--> called --LOCK_S--> idle (binoculars down)
 *                              --authority refused it (mode:strike_denied, ours)--> denied(reason) --DENIED_S--> idle
 *                              --no verdict in SENT_TIMEOUT_S--> denied('LOST')
 *   any --the battle's clock went back (a new battle, a reset)--> idle;  any --reset() (a battle's start)--> idle
 *
 * Before (the receipts: game/strikeOrder.selftest.mjs) the order was two copies: the HUD guessed readiness with its own
 * partial copy of the authority's refusal rule (it never knew the side's one-AC-130 cap), the action owner locked the
 * reticle on the battle clock in a module singleton nobody reset, and the authority's refusal never came back. So the
 * plate read CALLED for a call nobody took, and a battle that followed a late call dropped every press until its clock
 * passed the last battle's. Now readiness is the authority's own rule (the view's refusals, sim/airSupport.ts), CALLED is
 * the authority's acceptance, a refusal is shown with its reason, and every state ends by itself.
 *
 * Pure: no DOM, no three.js; the clock is the caller's battle clock (game.timeS). Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { AirStrikeKind } from '../sim/matchRuleset.ts';
import { AIR_SUPPORT_RULES } from '../sim/matchRuleset.ts';
import { strikeMarkRefusal, type AirSupportView, type StrikeRefusal } from '../sim/airSupport.ts';

/** A call the plate refuses before sending, or the authority refused, or whose verdict never came. */
export type StrikeOrderRefusal = StrikeRefusal | 'LOST';

export type StrikeOrderState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'sent'; readonly kind: AirStrikeKind; readonly atS: number }
  | { readonly phase: 'called'; readonly kind: AirStrikeKind; readonly atS: number; readonly strikeId: number }
  | { readonly phase: 'denied'; readonly kind: AirStrikeKind; readonly atS: number; readonly reason: StrikeOrderRefusal };

/** A sent call waits this long for the authority's verdict (a round trip and a step, with room for a slow link). */
export const STRIKE_SENT_TIMEOUT_S = 2.5;
/** An accepted call holds the reticle locked this long, then the binoculars come down. */
export const STRIKE_LOCK_S = 0.9;
/** A refusal stays on the plate this long. */
export const STRIKE_DENIED_S = 1.6;

/**
 * Why `kind` cannot be called now at a mark `rangeM` from the hull (null: the authority would take it): the authority's
 * own ledger refusal from the viewer's view, then the mark's. No view (no ledger yet): not callable.
 */
export function strikeCallBlocker(air: AirSupportView | null | undefined, kind: AirStrikeKind, rangeM: number): StrikeRefusal | null {
  if (!air?.refusals) return 'DESTROYED';
  return air.refusals[kind] ?? strikeMarkRefusal(AIR_SUPPORT_RULES, rangeM);
}

const IDLE: StrikeOrderState = Object.freeze({ phase: 'idle' });

export interface StrikeOrder {
  /** The order now, after the time-driven transitions due by `nowS`. */
  read(nowS: number): StrikeOrderState;
  /** The crew presses CALL: sent (the caller sends the bit), refused at the plate, or ignored while a call is under way. */
  press(nowS: number, kind: AirStrikeKind, blocker: StrikeRefusal | null): 'sent' | 'denied' | 'busy';
  /** The authority took the crew's call (its strike_called). True when it answered the order under way. */
  accepted(nowS: number, kind: AirStrikeKind, strikeId: number): boolean;
  /** The authority refused the crew's call (its strike_denied). True when it answered the order under way. */
  refused(nowS: number, kind: AirStrikeKind, reason: StrikeRefusal): boolean;
  /** A battle starts (or the crew's seat changes): nothing carries over. */
  reset(): void;
  /** Whether the accepted call's lock ended since the last ask (the binoculars come down once). */
  takeLowered(nowS: number): boolean;
}

export function createStrikeOrder(): StrikeOrder {
  let state: StrikeOrderState = IDLE;
  let lowered = false;
  function settle(nowS: number): StrikeOrderState {
    if (state.phase === 'idle') return state;
    // the clock went back: a new battle on the same page (or a reset clock); nothing of the old one holds
    if (nowS < state.atS) { state = IDLE; return state; }
    const age = nowS - state.atS;
    if (state.phase === 'sent' && age > STRIKE_SENT_TIMEOUT_S) state = { phase: 'denied', kind: state.kind, atS: nowS, reason: 'LOST' };
    else if (state.phase === 'called' && age > STRIKE_LOCK_S) { state = IDLE; lowered = true; }
    else if (state.phase === 'denied' && age > STRIKE_DENIED_S) state = IDLE;
    return state;
  }
  return {
    read: settle,
    press(nowS, kind, blocker) {
      const now = settle(nowS);
      if (now.phase === 'sent' || now.phase === 'called') return 'busy';
      if (blocker) { state = { phase: 'denied', kind, atS: nowS, reason: blocker }; return 'denied'; }
      state = { phase: 'sent', kind, atS: nowS };
      return 'sent';
    },
    accepted(nowS, kind, strikeId) {
      const now = settle(nowS);
      if (now.phase !== 'sent' || now.kind !== kind) return false;
      state = { phase: 'called', kind, atS: nowS, strikeId };
      return true;
    },
    refused(nowS, kind, reason) {
      const now = settle(nowS);
      if (now.phase !== 'sent' || now.kind !== kind) return false;
      state = { phase: 'denied', kind, atS: nowS, reason };
      return true;
    },
    reset() { state = IDLE; lowered = false; },
    takeLowered(nowS) {
      settle(nowS);
      const was = lowered;
      lowered = false;
      return was;
    },
  };
}
