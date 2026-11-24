/**
 * modeEndReport.ts — what a battle's mode adds to its end report (endscreen-modes-275): the mode score by side and its
 * target, the AC-130's escort, the Horde's wave, the front's sectors, the Juggernaut, the outbreak and the gun ladder, as
 * the viewer's own mode state (MatchModePresentationState, the HUD's) held them when the battle ended. Both drivers put it
 * on `battle:ended` (the solo sim's state.ts emitBattleEnded, a room's battlePresentation.ts endMatch), and the end screen
 * reads it through its mode descriptor (ui/endScreenModes.ts). Nothing here is recomputed: it copies the figures the HUD
 * already showed. Pure, no DOM, no wall clock; imports types and the ruleset's facets only.
 */
import type { MatchModePresentationState } from './matchModes.ts';
import { modePlaysSectors } from './matchRuleset.ts';

type Side = 'alpha' | 'bravo';

export interface ModeEndReport {
  readonly id: string;
  /** The viewer's side; the score's own figure is this side's. */
  readonly perspectiveTeam: Side;
  /** The mode's score by side where it keeps one (flags, sectors' points, goals); null where the battle is scored by kills. */
  readonly score: { readonly alpha: number; readonly bravo: number } | null;
  readonly target: number | null;
  /** AC-130: the ground troops' extraction. */
  readonly escort?: { readonly total: number; readonly rescued: number; readonly required: number; readonly alive: number };
  /** Endless Horde: the wave the battle ended on. */
  readonly horde?: { readonly wave: number };
  /** Frontline Assault: the sectors taken, of all of them. */
  readonly line?: { readonly index: number; readonly total: number };
  /** Juggernaut: whether the viewer was the boss. */
  readonly boss?: { readonly isPlayer: boolean; readonly team: Side };
  /** Infected: who was left on each side. */
  readonly infection?: { readonly survivors: number; readonly infected: number };
  /** Gun Game: the viewer's weapon on the ladder (1-based) of its length. */
  readonly weaponStage?: { readonly index: number; readonly total: number };
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** The modes scored by their own score rather than by kills (the HUD's score bar shows it): the flags, the ball and every
 *  sector battle (matchRuleset.ts modePlaysSectors). */
const scoredMode = (mode: string): boolean => mode === 'capture_the_flag' || mode === 'turbo_ball' || modePlaysSectors(mode);

/** The end report of the viewer's mode state; null without one. */
export function modeEndReport(state: Partial<MatchModePresentationState> | null | undefined, viewerId: string | null | undefined): ModeEndReport | null {
  if (!state || typeof state.id !== 'string') return null;
  const perspectiveTeam: Side = state.perspectiveTeam === 'bravo' ? 'bravo' : 'alpha';
  const scored = scoredMode(state.id) && !!state.score;
  const report: { -readonly [K in keyof ModeEndReport]: ModeEndReport[K] } = {
    id: state.id,
    perspectiveTeam,
    score: scored ? { alpha: Math.round(num(state.score!.alpha)), bravo: Math.round(num(state.score!.bravo)) } : null,
    target: scored && typeof state.target === 'number' && Number.isFinite(state.target) ? state.target : null,
  };
  if (state.escort) {
    const e = state.escort;
    report.escort = { total: num(e.total), rescued: num(e.rescued), required: num(e.required), alive: num(e.alive) };
  }
  if (state.horde) report.horde = { wave: Math.max(1, Math.floor(num(state.horde.wave))) };
  if (state.line) report.line = { index: Math.floor(num(state.line.index)), total: Math.floor(num(state.line.total)) };
  if (state.boss) report.boss = { isPlayer: !!viewerId && state.boss.id === viewerId, team: state.boss.team === 'bravo' ? 'bravo' : 'alpha' };
  if (state.infection) report.infection = { survivors: num(state.infection.survivors), infected: num(state.infection.infected) };
  if (state.weaponStage) report.weaponStage = { index: Math.floor(num(state.weaponStage.index)) + 1, total: Math.floor(num(state.weaponStage.total)) };
  return report;
}
