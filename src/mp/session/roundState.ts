import type { RuntimeValue } from '../../runtimeTypes.ts';
import { transitionBattleCountdown } from '../../game/preBattleCountdown.ts';

export interface RoundState {
  result: RuntimeValue;
  resultReason: RuntimeValue;
  timeS: number;
  preBattleS: number;
}

/** Boot-safe reset shared by cold intent cover and the loaded round owner. */
export function resetRoundState(game: RoundState): void {
  game.result = null;
  game.resultReason = null;
  game.timeS = 0;
  transitionBattleCountdown(game, 'arm'); // (2026-11-02 audit F1) the countdown's one writer: a new round's count
}
