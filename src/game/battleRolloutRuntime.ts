import type { RuntimeValue } from '../runtimeTypes.ts';
import type { EventBus } from './stateCore.ts';

interface BattleRolloutGame {
  preBattleS: number;
}

interface BattleRolloutHud {
  preBattleCountdown(seconds: number): void;
}

interface BattleRolloutAudio {
  resume(): RuntimeValue;
  ambientOn(active: boolean): void;
}

export interface BattleRolloutRuntimeOptions {
  game: BattleRolloutGame;
  bus: EventBus;
  audio: BattleRolloutAudio;
  getHud(): BattleRolloutHud | null;
  defaultPreBattleSeconds: number;
}

export interface BattleRolloutRuntime {
  open(preBattleSeconds?: number): void;
}

/** Presents the first controllable battle frame without moving its camera. */
export function createBattleRolloutRuntime({
  game,
  bus,
  audio,
  getHud,
  defaultPreBattleSeconds,
}: BattleRolloutRuntimeOptions): BattleRolloutRuntime {
  if (!game || !bus || typeof bus.emit !== 'function' || !audio
    || typeof audio.resume !== 'function' || typeof audio.ambientOn !== 'function'
    || typeof getHud !== 'function' || !Number.isFinite(defaultPreBattleSeconds)
    || defaultPreBattleSeconds < 0) {
    throw new TypeError('battle rollout runtime requires valid state and presentation ports');
  }

  return Object.freeze({
    open(preBattleSeconds = defaultPreBattleSeconds) {
      if (!Number.isFinite(preBattleSeconds) || preBattleSeconds < 0) {
        throw new TypeError('battle rollout countdown must be finite and non-negative');
      }
      if (game.preBattleS === Infinity) game.preBattleS = preBattleSeconds;
      getHud()?.preBattleCountdown(game.preBattleS);
      audio.resume();
      audio.ambientOn(true);
      if (game.preBattleS <= 0) bus.emit('battle:rollout', {});
    },
  });
}
