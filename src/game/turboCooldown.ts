/**
 * Turbo's cooldown as the seat's own surfaces show it (turbo-spin-275): the HUD tile and the phone controller's key. It
 * follows the seat's `tank:turbo` events (a solo press, game/playerBattleActions.ts; a room's tank_turbo from the host,
 * mp/presentation/battlePresentation.ts), each carrying the cooldown it starts, so the network client, which holds no
 * authority state, counts down as the host does. DOM-free, Node-runnable.
 */
import type { EventBus } from './stateCore.ts';
import { canTankBoost, type HullFlightState } from '../sim/hullFlight.ts';

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
  let readyAtS = -Infinity;
  let totalS = 1;
  const off = bus.on(event, (payload) => {
    const { id, readyS } = (payload ?? {}) as { id?: string; readyS?: number };
    const own = ownId();
    if (!id || !own || id !== own || !(Number(readyS) > 0)) return;
    totalS = Number(readyS);
    readyAtS = clock() + totalS;
  });
  return {
    readyIn: (nowS) => Math.max(0, readyAtS - nowS),
    refill: (nowS) => Math.min(1, Math.max(0, 1 - Math.max(0, readyAtS - nowS) / totalS)),
    reset: () => { readyAtS = -Infinity; },
    dispose: off,
  };
}

/** A jump mode's moves the phone greys this moment (turbo-spin-275): the boost when the sim's own test refuses it
 *  (sim/hullFlight.ts canTankBoost: the flight's `charges` spent, a burn under way, on its roof) or between presses
 *  (flip-boost-276), Turbo while it cools. */
export function modeMovesUnavailable(state: HullFlightState | null | undefined, turboWaitS: number, airSpinWaitS = 0,
  charges = 0): string[] {
  const out: string[] = [];
  if (!canTankBoost(state, charges) || airSpinWaitS > 0) out.push('airSpin');
  if (turboWaitS > 0) out.push('turbo');
  return out;
}
