import type { RuntimeValue } from '../runtimeTypes.ts';

export interface NetworkRoundState {
  result: RuntimeValue;
  resultReason: RuntimeValue;
  timeS: number;
  preBattleS: number;
}

/** Boot-safe reset shared by cold intent cover and the loaded round owner. */
export function resetNetworkRoundState(game: NetworkRoundState): void {
  game.result = null;
  game.resultReason = null;
  game.timeS = 0;
  game.preBattleS = Infinity;
}
