/**
 * strikeCall.ts — whether a crew's Air Support call would be taken (air-support-runs-272): the one readiness rule. The
 * authority refuses a call by its ledger (sim/airSupport.ts ledgerRefusal: points, cooldown, the side's air, its one
 * AC-130) and by its mark (strikeMarkRefusal); the viewer's view carries the ledger's part per kind (AirSupportView
 * refusals), so the strike view adds only the mark's and can never read a call as ready that the authority refuses
 * (game/strikeOrder.ts). A leaf with type-only imports: the composition root hands it to the action owner as a port
 * without pulling the mode's simulation into the boot graph. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { AirStrikeKind, AirSupportRules } from './matchRuleset.ts';
import type { AirSupportView, StrikeRefusal } from './airSupport.ts';

/** The mark's part of a call's refusal: a mark that is no point, or one beyond the caller's reach. */
export function strikeMarkRefusal(rules: Pick<AirSupportRules, 'callRangeM'>, rangeM: number): 'MARK' | 'RANGE' | null {
  if (!Number.isFinite(rangeM)) return 'MARK';
  return rangeM > rules.callRangeM ? 'RANGE' : null;
}

/** Why the viewer's call of `kind` at a mark `rangeM` from its hull would be refused now (null: the authority would take
 *  it): the authority's own ledger refusal from the viewer's view, then the mark's. No view (no ledger yet): not callable. */
export function strikeCallBlocker(rules: Pick<AirSupportRules, 'callRangeM'>, air: AirSupportView | null | undefined,
  kind: AirStrikeKind, rangeM: number): StrikeRefusal | null {
  if (!air?.refusals) return 'DESTROYED';
  return air.refusals[kind] ?? strikeMarkRefusal(rules, rangeM);
}
