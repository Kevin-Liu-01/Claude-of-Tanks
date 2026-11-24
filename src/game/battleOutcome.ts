/**
 * battleOutcome.ts — the one closed set of outcomes a battle's records can take (leave-no-loss-276). Copyright © 2026
 * Kevin B. Liu.
 *
 * Kevin (2026-11-24): "leaving battles early should not count as a loss". A battle the player left before its verdict
 * has no result: it is 'left', never a defeat and never a win. It stands in the battle history as "Left", and no total
 * hears it: not the battles, the wins, losses or draws, the win rate, the kills or damage, the medals or the
 * achievements. Before, the leave path (death-flow-275 R6) sent 'defeat', and every record reader turned any value it
 * did not know into a defeat too.
 *
 * Every reader takes its outcome through `battleOutcomeOf`, which returns null for anything outside the set (no
 * fallthrough to a defeat), and asks `outcomeCounts` whether the totals hear it. Both switch over the whole set, so a
 * new outcome does not compile until each is told about it. `src/game/battleOutcome.selftest.mjs` holds the rule.
 *
 * A stored row naming no outcome of the set (a later version's, a bad import's) is never rewritten or dropped: the
 * records hold it as a `KeptRecordRow`, which saves back exactly what was read, counts toward no total and is shown
 * nowhere (Main, 2026-11-24: a future version or a bad import must never lose a player's records).
 */

export const BATTLE_OUTCOMES = Object.freeze(['victory', 'defeat', 'draw', 'left'] as const);
export type BattleOutcome = typeof BATTLE_OUTCOMES[number];
/** An outcome the totals hear: a verdict the battle reached. */
export type BattleVerdict = Exclude<BattleOutcome, 'left'>;

function unreachable(value: never): never {
  throw new TypeError(`unhandled battle outcome ${String(value)}`);
}

/** The outcome a payload or stored row names, or null when it names none of the set (never a defeat by default). */
export function battleOutcomeOf(value: unknown): BattleOutcome | null {
  return typeof value === 'string' && (BATTLE_OUTCOMES as readonly string[]).includes(value) ? value as BattleOutcome : null;
}

/** A stored history row the records cannot read (its result is outside the set): held as read, written back as read
 *  (`JSON.stringify` serialises the original value through `toJSON`), never counted and never shown. */
export class KeptRecordRow {
  readonly raw: unknown;
  constructor(raw: unknown) { this.raw = raw; }
  toJSON(): unknown { return this.raw; }
}

/** Whether the outcome counts toward any total (battles, wins, losses, draws, win rate, kills, damage, medals,
 *  achievements). A left battle counts toward none. */
export function outcomeCounts(outcome: BattleOutcome): outcome is BattleVerdict {
  switch (outcome) {
    case 'victory':
    case 'defeat':
    case 'draw':
      return true;
    case 'left':
      return false;
    default:
      return unreachable(outcome);
  }
}
