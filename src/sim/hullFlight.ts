/**
 * A hull in flight, as the jump, the air spin and the HUD read it (turbo-spin-275): one test in a dependency-free leaf, so
 * the HUD greys the air spin by the rule the simulation applies without taking movement.ts into its chunk. Node-runnable.
 */

/** Air spin (turbo-spin-275): one flip or roll a press, a whole turn in this long, at this rate (rad/s). Here, in the
 *  leaf, so the checkpoint codec and the migration read it without movement.ts. */
const AIR_SPIN_TURN_S = 0.9;
export const AIR_SPIN_RATE = 2 * Math.PI / AIR_SPIN_TURN_S;

/** Flight shorter than this after the ride leaves its support still counts as on the ground (a step's lift, a bump). */
export const JUMP_AIRTIME_GRACE_S = 0.05;

/** The slice of a movement state the test reads (TankState and the client copies satisfy it). */
export interface HullFlightState {
  grounded?: boolean;
  _ride?: { airTime?: number };
  _body?: { autoRighting?: boolean };
  _airSpinAxis?: number;
}

/** A hull in flight: off the ground, or its ride past the jump's grace. */
export function tankAirborne(state: HullFlightState | null | undefined): boolean {
  if (!state) return false;
  return state.grounded === false || (state._ride ? (state._ride.airTime || 0) > JUMP_AIRTIME_GRACE_S : false);
}

/** Whether an air-spin press would turn the hull now: in flight, not held by the righting torque, no turn under way. */
export function canTankAirSpin(state: HullFlightState | null | undefined): boolean {
  return !!state && tankAirborne(state) && state._body?.autoRighting !== true && !state._airSpinAxis;
}
