/**
 * Turbo's cooldown as the seat's own surfaces show it (turbo-spin-275): the HUD tile and the phone controller's key. It
 * follows the seat's `tank:turbo` events (a solo press, game/playerBattleActions.ts; a room's tank_turbo from the host,
 * mp/presentation/battlePresentation.ts), each carrying the cooldown it starts, so the network client, which holds no
 * authority state, counts down as the host does. DOM-free, Node-runnable.
 */
import type { EventBus } from './stateCore.ts';
import { battleScoped } from './battleScope.ts';
import { canTankAirSpin, type HullFlightState } from '../sim/hullFlight.ts';

interface TurboCooldown {
  /** Seconds left at `nowS` (0: ready). */
  readyIn(nowS: number): number;
  /** The cooldown's share run at `nowS` (1: ready). */
  refill(nowS: number): number;
  /** A new battle or life: ready. */
  reset(): void;
  dispose(): void;
}

/** `ownId`: the seat's tank id now; `clock`: the time base its readers pass as `nowS`, read when the event lands; `event`:
 *  the move's (flip-boost-276: the air spin's `tank:airSpin` carries its cooldown as Turbo's does). */
export function createTurboCooldown(
  bus: EventBus, ownId: () => string | null | undefined, clock: () => number, event: 'tank:turbo' | 'tank:airSpin' = 'tank:turbo',
): TurboCooldown {
  // (life-reset-279) the battle's own (game/battleScope.ts battleScoped): its time is the battle's clock, which restarts at 0,
  // so a Turbo used at 500 s greyed the next battle's tile and the phone's key for its first 500 s. Across a life it
  // stays: the hull's own cooldown (sim/modeMoves.ts turboReadyS) spans a revive on both drivers, and the tile shows it.
  const cooldown = battleScoped(() => ({ readyAtS: -Infinity, totalS: 1 }));
  const off = bus.on(event, (payload) => {
    const { id, readyS } = (payload ?? {}) as { id?: string; readyS?: number };
    const own = ownId();
    if (!id || !own || id !== own || !(Number(readyS) > 0)) return;
    const now = cooldown();
    now.totalS = Number(readyS);
    now.readyAtS = clock() + now.totalS;
  });
  // a room's restart is a new battle on the same scope, its clock back at 0 (battlePresentation.ts 'battle:restarted')
  const offRestart = bus.on('battle:restarted', () => { cooldown().readyAtS = -Infinity; });
  return {
    readyIn: (nowS) => Math.max(0, cooldown().readyAtS - nowS),
    refill: (nowS) => {
      const { readyAtS, totalS } = cooldown();
      return Math.min(1, Math.max(0, 1 - Math.max(0, readyAtS - nowS) / totalS));
    },
    reset: () => { cooldown().readyAtS = -Infinity; },
    dispose: () => { off(); offRestart(); },
  };
}

/** A jump mode's moves the phone greys this moment (turbo-spin-275): the air spin when the sim's own test refuses it
 *  (sim/hullFlight.ts: its flight's dodge spent, a turn under way, on its roof) or while it cools (flip-boost-276), Turbo
 *  while it cools. */
export function modeMovesUnavailable(state: HullFlightState | null | undefined, turboWaitS: number, airSpinWaitS = 0): string[] {
  const out: string[] = [];
  if (!canTankAirSpin(state) || airSpinWaitS > 0) out.push('airSpin');
  if (turboWaitS > 0) out.push('turbo');
  return out;
}
