/**
 * A hull in flight, as the jump, the boosts and the HUD read it (turbo-spin-275): one test in a dependency-free leaf, so
 * the HUD greys the boost by the rule the simulation applies without taking movement.ts into its chunk. Node-runnable.
 */

/**
 * The boost nozzles (thrust-boosts-279; owner 2026-11-27: "the subsequent side/rear boosts that alow you to roll shouldnt
 * like just have you end at rogiinal position they should literally be just like a additional force vector added from
 * that side"). Each names the push a press fires (sim/hullThrusters.ts mounts them): UP the belly pair, FORWARD the butt
 * (Turbo in flight), BACK the nose's underside, LEFT the right side's pair (the hull goes left, +x), RIGHT the left
 * side's. 0 is none.
 */
export const BOOST_NOZZLES = Object.freeze({ NONE: 0, UP: 1, FORWARD: 2, BACK: 3, LEFT: 4, RIGHT: 5 } as const);

/** A boost's burn: its nozzles push at a constant thrust for this long (s) and deliver the press's whole shove. */
export const BOOST_BURN_S = 0.2;

/** A stick or key past this share of its throw picks the nozzle. */
const BOOST_PICK = 0.3;

/** Flight shorter than this after the ride leaves its support still counts as on the ground (a step's lift, a bump). */
const JUMP_AIRTIME_GRACE_S = 0.05;

/**
 * The nozzle a press fires from the drive it is pressed with (thrust-boosts-279, Main's ruling A): A/D (steer, + is left)
 * that side's push, S the nose's (back), W or no drive the belly's (up: W is held through a run, so a climb never needs
 * the key let go). A steer as strong as the throttle picks the side. The butt (FORWARD) is Turbo's in flight, never a pick.
 */
export function boostNozzleFor(throttle: number, steer: number): number {
  const t = Number.isFinite(throttle) ? throttle : 0;
  const s = Number.isFinite(steer) ? steer : 0;
  if (Math.abs(s) >= BOOST_PICK && Math.abs(s) >= Math.abs(t)) return s > 0 ? BOOST_NOZZLES.LEFT : BOOST_NOZZLES.RIGHT;
  return t <= -BOOST_PICK ? BOOST_NOZZLES.BACK : BOOST_NOZZLES.UP;
}

/** The slice of a movement state the test reads (TankState and the client copies satisfy it). */
export interface HullFlightState {
  grounded?: boolean;
  _ride?: { airTime?: number };
  _body?: { autoRighting?: boolean };
  /** The nozzle the flight last fired (movement.ts TankState._boostNozzle; 0 none since the ground). */
  _boostNozzle?: number;
  /** The burn under way (s left; movement.ts TankState._boostBurnS): a press waits for it to end. */
  _boostBurnS?: number;
  /** The flight's boosts spent (movement.ts TankState._boostsUsed): cleared on the ground. */
  _boostsUsed?: number;
  overturned?: boolean;
}

/** A hull in flight: off the ground, or its ride past the jump's grace. */
export function tankAirborne(state: HullFlightState | null | undefined): boolean {
  if (!state) return false;
  return state.grounded === false || (state._ride ? (state._ride.airTime || 0) > JUMP_AIRTIME_GRACE_S : false);
}

/** The nozzle a Turbo press just lit (the butt's, in flight), else 0: the `tank:turbo` event's, for a viewer's plumes. */
export function turboNozzle(state: HullFlightState | null | undefined): number {
  return state && (state._boostBurnS ?? 0) > 0 && state._boostNozzle === BOOST_NOZZLES.FORWARD ? BOOST_NOZZLES.FORWARD : 0;
}

/** The boosts a hull has left of `charges` (AirSpinRules.charges): the flight's unspent ones, all of them on the ground. */
export function tankBoostsLeft(state: HullFlightState | null | undefined, charges: number): number {
  const all = Math.max(0, Math.floor(Number.isFinite(charges) ? charges : 0));
  if (!state || !tankAirborne(state)) return all;
  return Math.max(0, all - Math.max(0, state._boostsUsed ?? 0));
}

/**
 * Whether a boost press would fire now (thrust-boosts-279): not held by the righting torque, no burn under way, and either
 * in flight with a charge left of `charges` or on the ground on its tracks (the ground press hops, then fires). The gap
 * between presses is the entity's cooldown (sim/modeMoves.ts airSpinReadyIn).
 */
export function canTankBoost(state: HullFlightState | null | undefined, charges: number): boolean {
  if (!state || state._body?.autoRighting === true || (state._boostBurnS ?? 0) > 0) return false;
  return tankAirborne(state) ? tankBoostsLeft(state, charges) > 0 : state.overturned !== true;
}
