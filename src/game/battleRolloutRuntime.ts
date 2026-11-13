import type { RuntimeValue } from '../runtimeTypes.ts';
import { battleCountdownState, transitionBattleCountdown } from './preBattleCountdown.ts';

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

interface BattleRolloutRuntimeOptions {
  game: BattleRolloutGame;
  /**
   * (2026-11-02 audit F1) The battle's one rollout edge (the battle frame runtime's latch, battleFrameRuntime.ts
   * `rollout`): a battle opened at 0 rolls out through it, so the count's own fall to 0 can never emit a second.
   */
  rollout(): void;
  audio: BattleRolloutAudio;
  getHud(): BattleRolloutHud | null;
  defaultPreBattleSeconds: number;
}

interface BattleRolloutRuntime {
  open(preBattleSeconds?: number): void;
}

/** Presents the first controllable battle frame without moving its camera. */
export function createBattleRolloutRuntime({
  game,
  rollout,
  audio,
  getHud,
  defaultPreBattleSeconds,
}: BattleRolloutRuntimeOptions): BattleRolloutRuntime {
  if (!game || typeof rollout !== 'function' || !audio
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
      // (audit F1) the countdown's owner opens an armed count only; a running or open count is never reopened
      transitionBattleCountdown(game, 'open', preBattleSeconds);
      getHud()?.preBattleCountdown(game.preBattleS);
      audio.resume();
      audio.ambientOn(true);
      if (battleCountdownState(game.preBattleS) === 'open') rollout();
    },
  });
}
