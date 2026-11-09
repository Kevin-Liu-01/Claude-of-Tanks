/**
 * `__DEBUG.battleHold`, the dev battle hold's switch (game/devBattleHold.ts is the step's side). `set(true)` holds the
 * page's solo battle alive and still for a check from its next step: bots stand and never fire, the player takes no
 * damage and the battle reaches no verdict. It stays armed through every later solo battle until `set(false)`; arm it
 * before `beginSoloBattle` to hold a battle from its first step. It refuses (throws) in a public build and while a
 * network battle runs, whose authority never reads it.
 */
import { DEV_BATTLE_HOLD } from '../game/devBattleHold.ts';

interface BattleHoldOptions {
  getGame(): { devBattleHold?: boolean };
  isNetworkBattle(): boolean;
  /** The build's switch (a public build has none); tests pass false. */
  enabled?: boolean;
}

interface BattleHold {
  /** Whether the hold is armed. */
  readonly armed: boolean;
  /** Arm (true) or release (false) the hold; returns what it set. */
  set(on: boolean): boolean;
}

export function createBattleHold({ getGame, isNetworkBattle, enabled = DEV_BATTLE_HOLD }: BattleHoldOptions): BattleHold {
  return {
    get armed() { return enabled && getGame().devBattleHold === true; },
    set(on) {
      if (typeof on !== 'boolean') throw new TypeError('battleHold.set takes true or false');
      if (on && !enabled) throw new Error('battleHold: a public build has no battle hold');
      if (on && isNetworkBattle()) throw new Error('battleHold: a network battle is never held');
      getGame().devBattleHold = on;
      return on;
    },
  };
}
