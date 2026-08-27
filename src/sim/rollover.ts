/**
 * Deterministic rollover lifecycle shared by solo and authoritative matches.
 *
 * Physics remains responsible for the pose. This helper only detects a tank
 * that has settled on its side/roof and advances the recovery window. Any
 * meaningful shove or continuing angular motion restarts the window, so team
 * mates can physically right the vehicle before assisted recovery begins.
 */

export const ROLLOVER_AUTO_RIGHT_S = 15;

interface RolloverState {
  speed?: number;
  verticalSpeed?: number;
  visualPitch?: number;
  visualRoll?: number;
  overturned?: boolean;
  rolloverCountdownS?: number;
  _spring?: { pitchV?: number; rollV?: number };
  _body?: { tumbling?: boolean; autoRighting?: boolean };
  _rollover?: { elapsedS: number; expired: boolean };
}

const LINEAR_RESET_MPS = 0.45;
const VERTICAL_RESET_MPS = 0.35;
const ANGULAR_RESET_RAD_S = 0.25;
const SIDE_UP_Y = 0.48;

/** Returns true exactly once when a settled rollover starts assisted recovery. */
export function stepRolloverLifecycle(state: RolloverState, dt: number): boolean {
  const rollover = state._rollover ||
    (state._rollover = { elapsedS: 0, expired: false });
  if (!(dt > 0) || !Number.isFinite(dt)) return false;

  const upY = Math.cos(state.visualPitch || 0) * Math.cos(state.visualRoll || 0);
  const trapped = state.overturned === true ||
    (state._body?.tumbling === true && upY < SIDE_UP_Y);
  if (!trapped) {
    rollover.elapsedS = 0;
    rollover.expired = false;
    state.rolloverCountdownS = 0;
    return false;
  }

  const spring = state._spring;
  const moving = Math.abs(state.speed || 0) > LINEAR_RESET_MPS ||
    Math.abs(state.verticalSpeed || 0) > VERTICAL_RESET_MPS ||
    Math.abs(spring?.pitchV || 0) + Math.abs(spring?.rollV || 0) > ANGULAR_RESET_RAD_S;
  if (moving) {
    rollover.elapsedS = 0;
    rollover.expired = false;
    state.rolloverCountdownS = ROLLOVER_AUTO_RIGHT_S;
    return false;
  }

  const nextElapsedS = rollover.elapsedS + dt;
  rollover.elapsedS = nextElapsedS + 1e-9 >= ROLLOVER_AUTO_RIGHT_S
    ? ROLLOVER_AUTO_RIGHT_S
    : nextElapsedS;
  state.rolloverCountdownS = Math.max(0, ROLLOVER_AUTO_RIGHT_S - rollover.elapsedS);
  if (rollover.elapsedS < ROLLOVER_AUTO_RIGHT_S || rollover.expired) return false;
  rollover.expired = true;
  if (state._body) state._body.autoRighting = true;
  return true;
}
