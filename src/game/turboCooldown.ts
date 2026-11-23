/**
 * Turbo's cooldown as the seat's own surfaces show it (turbo-spin-275): the HUD tile and the phone controller's key. It
 * follows the seat's `tank:turbo` events (a solo press, game/playerBattleActions.ts; a room's tank_turbo from the host,
 * mp/presentation/battlePresentation.ts), each carrying the cooldown it starts, so the network client, which holds no
 * authority state, counts down as the host does. DOM-free, Node-runnable.
 */
import type { EventBus } from './stateCore.ts';
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

/** `ownId`: the seat's tank id now; `clock`: the time base its readers pass as `nowS`, read when the event lands. */
export function createTurboCooldown(bus: EventBus, ownId: () => string | null | undefined, clock: () => number): TurboCooldown {
  let readyAtS = -Infinity;
  let totalS = 1;
  const off = bus.on('tank:turbo', (payload) => {
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

/** A jump mode's moves the phone greys this moment (turbo-spin-275): the air spin unless the hull flies (sim/hullFlight.ts,
 *  the sim's own test), Turbo while it cools. */
export function modeMovesUnavailable(state: HullFlightState | null | undefined, turboWaitS: number): string[] {
  const out: string[] = [];
  if (!canTankAirSpin(state)) out.push('airSpin');
  if (turboWaitS > 0) out.push('turbo');
  return out;
}
