/**
 * The hull's body mode (audit M8, 2026-11-02): the one owner of the phase its attitude integrates in.
 *
 *   supported  the tracks carry the hull; the attitude spring follows the ground fit (movement.ts
 *              updateSupportedAttitude)
 *   tumbling   rigid attitude: in flight past the tumble angle, landed on the shell, kicked off a roof, or with the
 *              centre of mass past the side (movement.ts updateRigidAttitude)
 *   righting   rigid attitude under the critically damped righting torque: the self-right edge or the bots' rollover
 *              countdown (rollover.ts), until the hull lands on its tracks
 *
 * `overturned` (the centre of mass past the side, judged on the gravity up-vector with hysteresis) is an attribute of the
 * two rigid modes only: a supported hull is never overturned. The flags the wire, the checkpoint, the AI and the HUD read
 * (`state.overturned`, `_body.tumbling`, `_body.autoRighting`) are this machine's storage, and every writer goes through
 * the functions below, so the dead ends of the old flag cluster cannot be built: overturned with the tumble settled (the
 * drivetrain locked, the self-right and the jump refused) or auto-righting with no rigid phase to clear it (AUTO_RIGHTING
 * on the wire until the hull died). Leaving the rigid phase (`settleHullOnTracks`, `finishHullRighting`) is judged
 * terrain-relative by movement.ts, as before, and now clears the overturn with it; it is refused while the centre of mass
 * is past the side, so the overturn cannot re-enter on the next step and flap.
 *
 * Ground contact's two copies (`state.grounded`, `_ride.grounded`) have one writer here too (`setHullGrounded`).
 *
 * Pure flag logic: no clock, no randomness, no allocation; Node-runnable like the rest of src/sim.
 */

/** Gravity up-vector (cos pitch · cos roll) below which the centre of mass has crossed past the side. */
export const OVERTURN_ENTER_UP_Y = -0.08;
/** Gravity up-vector at or above which an overturned rigid hull is back on its side of upright. */
export const OVERTURN_EXIT_UP_Y = 0.48;

export type HullBodyMode = 'supported' | 'tumbling' | 'righting';

/** The slice of a movement state the machine reads and writes (TankState, the rollover and client states satisfy it). */
export interface HullBodyState {
  overturned?: boolean;
  _body?: { tumbling?: boolean; autoRighting?: boolean };
}

/** The two copies of ground contact: `grounded` (the step's groundedAtStart, the row's AIRBORNE flag) and the ride's
 * (the viewer checkpoint's flag bit 1). */
export interface HullGroundState {
  grounded?: boolean;
  _ride?: { grounded?: boolean };
}

function bodyOf(state: HullBodyState): { tumbling?: boolean; autoRighting?: boolean } {
  return state._body || (state._body = { tumbling: false, autoRighting: false });
}

function write(state: HullBodyState, mode: HullBodyMode, overturned: boolean): void {
  const body = bodyOf(state);
  body.tumbling = mode !== 'supported';
  body.autoRighting = mode === 'righting';
  state.overturned = mode !== 'supported' && overturned;
}

/** The mode the flags hold (a righting latch outside the rigid phase reads as righting, never as supported). */
export function hullBodyMode(state: HullBodyState | null | undefined): HullBodyMode {
  if (state?._body?.autoRighting === true) return 'righting';
  if (state?._body?.tumbling === true || state?.overturned === true) return 'tumbling';
  return 'supported';
}

/** A launch, a landing on the shell, a stack kick or a step past the side: a supported hull takes the rigid phase. A
 * rigid hull keeps its mode (a righting hull stays under its torque). True when the mode changed. */
export function enterHullTumble(state: HullBodyState): boolean {
  const mode = hullBodyMode(state);
  write(state, mode === 'supported' ? 'tumbling' : mode, state.overturned === true);
  return mode === 'supported';
}

/** A grounded tumbling hull at rest on its tracks (movement.ts judges that against the ground fit): back to supported,
 * the overturn with it. Refused from any other mode, and while the centre of mass is past the side (`upY`, the gravity
 * up-vector). */
export function settleHullOnTracks(state: HullBodyState, upY: number): boolean {
  if (hullBodyMode(state) !== 'tumbling' || !(upY >= OVERTURN_ENTER_UP_Y)) return false;
  write(state, 'supported', false);
  return true;
}

/** The self-right edge or the rollover countdown: a tumbling hull takes the righting torque. Refused from supported (no
 * rigid phase would ever clear it) and while already righting. */
export function startHullRighting(state: HullBodyState): boolean {
  if (hullBodyMode(state) !== 'tumbling') return false;
  write(state, 'righting', state.overturned === true);
  return true;
}

/** The righting torque landed the hull on its tracks: supported, the overturn cleared. Refused from any other mode and
 * while the centre of mass is past the side. */
export function finishHullRighting(state: HullBodyState, upY: number): boolean {
  if (hullBodyMode(state) !== 'righting' || !(upY >= OVERTURN_ENTER_UP_Y)) return false;
  write(state, 'supported', false);
  return true;
}

/** The overturn's hysteresis on the gravity up-vector, once per attitude update: a rigid hull enters it below
 * OVERTURN_ENTER_UP_Y and leaves it from OVERTURN_EXIT_UP_Y; a supported hull that crosses the side enters the tumble
 * with it. */
export function updateHullOverturn(state: HullBodyState, upY: number): void {
  const mode = hullBodyMode(state);
  if (mode === 'supported') {
    if (upY < OVERTURN_ENTER_UP_Y) write(state, 'tumbling', true);
    else state.overturned = false;
    return;
  }
  write(state, mode, state.overturned === true ? upY < OVERTURN_EXIT_UP_Y : upY < OVERTURN_ENTER_UP_Y);
}

/** An authored pose or a teleport onto the ground (movement.ts resetTankVerticalState): an upright hull is supported, its
 * tumble and any righting with it; an overturned one keeps its rigid phase. */
export function resetHullBodyMode(state: HullBodyState): void {
  if (state.overturned === true) write(state, hullBodyMode(state), true);
  else write(state, 'supported', false);
}

/**
 * Restore the mode from the authority's bits (the viewer checkpoint, or a snapshot row's TUMBLING, OVERTURNED and
 * AUTO_RIGHTING flags: src/mp/match/hullBodyRow.ts, wire 10). The bits of a legal authority mode restore it exactly; any
 * other combination keeps its rigid phase, so a restored hull never holds a dead end either.
 */
export function restoreHullBodyMode(
  state: HullBodyState, overturned: boolean, tumbling: boolean, autoRighting: boolean,
): void {
  const mode: HullBodyMode = autoRighting ? 'righting' : tumbling || overturned ? 'tumbling' : 'supported';
  write(state, mode, overturned);
}

/** Ground contact's one writer: both copies at once, so no path (a step, a launch, a roof seat, a row or a checkpoint
 * restore) can leave them apart. */
export function setHullGrounded(state: HullGroundState, grounded: boolean): void {
  state.grounded = grounded;
  if (state._ride) state._ride.grounded = grounded;
}
