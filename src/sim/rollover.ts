/**
 * Deterministic rollover lifecycle shared by solo and authoritative matches.
 *
 * Physics remains responsible for the pose. This helper only detects a tank
 * that has settled on its side/roof and advances the recovery window. Any
 * meaningful shove or continuing angular motion restarts the window, so team
 * mates can physically right the vehicle before assisted recovery begins.
 */

export const ROLLOVER_AUTO_RIGHT_S = 15;
export const SELF_RIGHT_LAUNCH_MPS = 2.8;
export const SELF_RIGHT_ANGULAR_MPS = 2.05;

interface RolloverState {
  speed?: number;
  verticalSpeed?: number;
  grounded?: boolean;
  visualPitch?: number;
  visualRoll?: number;
  overturned?: boolean;
  rolloverCountdownS?: number;
  _spring?: { pitchV?: number; rollV?: number };
  _body?: { tumbling?: boolean; autoRighting?: boolean };
  _terr?: { pitch?: number; roll?: number };
  _ride?: { y?: number; v?: number; airTime?: number };
  _rollover?: { elapsedS: number; expired: boolean };
}

const LINEAR_RESET_MPS = 0.45;
const VERTICAL_RESET_MPS = 0.35;
const ANGULAR_RESET_RAD_S = 0.25;
const SIDE_UP_Y = 0.48;

function wrapAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** True only while a living movement state can accept one self-right edge. */
export function canSelfRightTank(state: RolloverState | null | undefined): boolean {
  return !!state && state.overturned === true && state.grounded !== false &&
    state._body?.tumbling === true && state._body.autoRighting !== true;
}

/**
 * Start a deterministic recovery shove without snapping or teleporting pose.
 * The shortest overturned attitude axis receives a bounded angular impulse,
 * while the vertical ride gets enough separation for the hull to visibly
 * bounce before the existing critically damped righting torque takes over.
 */
export function requestTankSelfRight(state: RolloverState | null | undefined): boolean {
  if (!state || !canSelfRightTank(state)) return false;
  const body = state._body!;
  const spring = state._spring;
  if (!spring) return false;

  const pitchError = wrapAngle((state.visualPitch || 0) - (state._terr?.pitch || 0));
  const rollError = wrapAngle((state.visualRoll || 0) - (state._terr?.roll || 0));
  const usePitch = Math.abs(pitchError) >= Math.abs(rollError);
  if (usePitch) {
    spring.pitchV = -Math.sign(pitchError || 1) * SELF_RIGHT_ANGULAR_MPS;
    spring.rollV = (spring.rollV || 0) * 0.35;
  } else {
    spring.rollV = -Math.sign(rollError || 1) * SELF_RIGHT_ANGULAR_MPS;
    spring.pitchV = (spring.pitchV || 0) * 0.35;
  }

  state.speed = (state.speed || 0) * 0.2;
  state.verticalSpeed = Math.max(state.verticalSpeed || 0, SELF_RIGHT_LAUNCH_MPS);
  if (state._ride) {
    state._ride.v = Math.max(state._ride.v || 0, SELF_RIGHT_LAUNCH_MPS);
    state._ride.airTime = 0;
  }
  body.tumbling = true;
  body.autoRighting = true;
  state.rolloverCountdownS = 0;
  if (state._rollover) {
    state._rollover.elapsedS = 0;
    state._rollover.expired = true;
  }
  return true;
}

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
  if (state._body?.autoRighting) {
    rollover.elapsedS = 0;
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
