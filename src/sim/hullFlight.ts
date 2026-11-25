/**
 * A hull in flight, as the jump, the air spin and the HUD read it (turbo-spin-275): one test in a dependency-free leaf, so
 * the HUD greys the air spin by the rule the simulation applies without taking movement.ts into its chunk. Node-runnable.
 */

/** Air spin (turbo-spin-275): one flip or roll a press, a whole turn in about this long, at this mean rate (rad/s). Here,
 *  in the leaf, so the checkpoint codec, the migration and the bots read it without movement.ts. A dodge's quick turn
 *  since flip-boost-276 (was 0.9 s): a ground dodge's hop (AirSpinRules.hopMps) holds the hull up for all of it. Since
 *  thrust-flips-277 the turn is the thrusters' burn (hullThrusters.ts AIR_SPIN_BURN: spin-up, coast, counter-burn), not a
 *  set rate; this is that burn's length from the press (turboSpin.selftest.mjs measures it within 3 ticks). */
const AIR_SPIN_TURN_S = 0.65;
export const AIR_SPIN_RATE = 2 * Math.PI / AIR_SPIN_TURN_S;

/** Flight shorter than this after the ride leaves its support still counts as on the ground (a step's lift, a bump). */
const JUMP_AIRTIME_GRACE_S = 0.05;

/** The slice of a movement state the test reads (TankState and the client copies satisfy it). */
export interface HullFlightState {
  grounded?: boolean;
  _ride?: { airTime?: number };
  _body?: { autoRighting?: boolean };
  _airSpinAxis?: number;
  /** The flight's dodge is spent (flip-boost-276; movement.ts TankState._flipUsed): cleared on the ground. */
  _flipUsed?: boolean;
  overturned?: boolean;
}

/** A hull in flight: off the ground, or its ride past the jump's grace. */
export function tankAirborne(state: HullFlightState | null | undefined): boolean {
  if (!state) return false;
  return state.grounded === false || (state._ride ? (state._ride.airTime || 0) > JUMP_AIRTIME_GRACE_S : false);
}

/**
 * Whether an air-spin press would dodge now (flip-boost-276): not held by the righting torque, no turn under way, and
 * either in flight with the flight's dodge unspent or on the ground on its tracks (the ground dodge). The cooldown is
 * the entity's (sim/modeMoves.ts airSpinReadyIn).
 */
export function canTankAirSpin(state: HullFlightState | null | undefined): boolean {
  if (!state || state._body?.autoRighting === true || state._airSpinAxis) return false;
  return tankAirborne(state) ? state._flipUsed !== true : state.overturned !== true;
}
