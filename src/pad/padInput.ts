/**
 * The phone controller's input model (docs/PHONE-CONTROLLER.md "Controls"), pure and Node-runnable.
 *
 * The phone's side: the wheel angle from `deviceorientation` (β, γ) and the screen's rotation, the steering curve
 * (centre, dead zone, power curve, full lock), the aim's speed curve, and the lever and stick shapes. The desktop's
 * mapper that applies what the phone sends is padDesk.ts.
 */
const DEG = Math.PI / 180;

export interface SteeringCurve {
  /** Wheel angle (degrees from centre) at full lock. */
  maxAngleDeg: number;
  /** Degrees around centre that steer nothing (hand tremor). */
  deadzoneDeg: number;
  /** Power on the normalized angle past the dead zone: > 1 is finer near centre. */
  curve: number;
}

export const DEFAULT_STEERING: SteeringCurve = Object.freeze({ maxAngleDeg: 35, deadzoneDeg: 3, curve: 1.6 });
/** Below this share of gravity in the screen's plane the phone lies too flat to read as a wheel. */
const MIN_SCREEN_PLANE_UP = 0.3;

/** Wrap degrees to (-180, 180]. */
export function wrapDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/**
 * The wheel angle in degrees, positive when the phone is turned clockwise (a right turn) as its user sees it; null when
 * the phone lies too flat. β and γ are `deviceorientation`'s; `screenAngleDeg` is `screen.orientation.angle` (90 when the
 * phone is turned counter-clockwise into landscape). The world's up vector in the device frame is
 * (−sin γ cos β, sin β, cos γ cos β); its angle in the screen's plane is the wheel's, whatever the phone's lean.
 */
export function wheelAngleDeg(betaDeg: number, gammaDeg: number, screenAngleDeg: number): number | null {
  if (!Number.isFinite(betaDeg) || !Number.isFinite(gammaDeg)) return null;
  const b = betaDeg * DEG;
  const g = gammaDeg * DEG;
  const ux = -Math.sin(g) * Math.cos(b);
  const uy = Math.sin(b);
  const a = (Number(screenAngleDeg) || 0) * DEG;
  const right = ux * Math.cos(a) - uy * Math.sin(a);
  const up = ux * Math.sin(a) + uy * Math.cos(a);
  if (Math.hypot(right, up) < MIN_SCREEN_PLANE_UP) return null;
  // world up leaning toward the screen's left is a clockwise turn of the phone
  return -Math.atan2(right, up) / DEG;
}

/** Steering −1 (left) .. 1 (right) from a wheel angle, the centre the player set and the curve. */
export function steerFromAngle(angleDeg: number, centreDeg: number, curve: SteeringCurve = DEFAULT_STEERING): number {
  const d = wrapDeg(angleDeg - centreDeg);
  const span = Math.max(1, curve.maxAngleDeg - curve.deadzoneDeg);
  const past = Math.max(0, Math.abs(d) - curve.deadzoneDeg) / span;
  return Math.sign(d) * Math.min(1, past) ** curve.curve;
}

// ---- the locked frame (phone side) -------------------------------------------------------------------------
// The controller is laid out once in the landscape the phone is held in and glued to the phone from then on: when the
// system turns the page, the frame turns back by the same angle (padPage.ts). Angles are screen.orientation's, degrees
// from the device's natural orientation; a frame's turn is CSS rotate(), clockwise on the viewport.

const quarter = (deg: number): number => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;

/** The angle a controller locks to: the system's own when it shows landscape, else the quarter turn from portrait most
 *  phones are turned into (the top to the left). */
export function lockAngle(screenDeg: number, wide: boolean): number {
  return quarter(wide ? screenDeg : screenDeg + 90);
}

/** How far the frame turns on the viewport to stay where it was on the phone: the system's turn, undone. */
export function frameTurn(lockDeg: number, screenDeg: number): number {
  return quarter(lockDeg - screenDeg);
}

/** A movement on the viewport (dx, dy) in the axes of a frame turned by `turnDeg`. */
export function frameDelta(turnDeg: number, dx: number, dy: number): [number, number] {
  switch (quarter(turnDeg)) {
    case 90: return [dy, -dx];
    case 180: return [-dx, -dy];
    case 270: return [-dy, dx];
    default: return [dx, dy];
  }
}

/** The viewport's safe-area insets (top, right, bottom, left) on a turned frame's own sides: its side i lies on the
 *  viewport's side i + turn / 90. */
export function frameInsets(turnDeg: number, insets: readonly number[]): number[] {
  const k = quarter(turnDeg) / 90;
  return [0, 1, 2, 3].map((side) => insets[(side + k) % 4] ?? 0);
}

/** A spring lever or stick axis: −1..1 from an offset and the travel, with a small dead zone. */
export function leverValue(offset: number, travel: number, deadzone = 0.06): number {
  if (!(travel > 0)) return 0;
  const v = Math.max(-1, Math.min(1, offset / travel));
  const past = Math.max(0, Math.abs(v) - deadzone) / (1 - deadzone);
  return Math.sign(v) * past;
}

// ---- the sight's drag (phone side) -------------------------------------------------------------------------------

/** The sight's gain by the finger's speed (owner 2026-11-03: looking around "needs to be a lot more intuitive"): a
 *  slow drag keeps the mouse's precision (1×), a swipe turns a few times as far and a flick swings the gun round, so a
 *  turn to the rear is one or two flicks rather than six drags across the sight. Speeds in px per ms, smoothed. */
export interface AimCurve {
  /** Below this speed the drag is 1:1. */
  slowPxPerMs: number;
  /** The gain added per px/ms above it. */
  perPxPerMs: number;
  /** The most it multiplies, unscoped and in the scope (where a flick must not throw the sight off the target). */
  max: number;
  maxScoped: number;
}

export const AIM_CURVE: AimCurve = Object.freeze({ slowPxPerMs: 0.1, perPxPerMs: 4, max: 5, maxScoped: 2 });

export function aimGain(speedPxPerMs: number, scoped = false, curve: AimCurve = AIM_CURVE): number {
  const speed = Math.max(0, Number(speedPxPerMs) || 0);
  return Math.min(scoped ? curve.maxScoped : curve.max, 1 + curve.perPxPerMs * Math.max(0, speed - curve.slowPxPerMs));
}

/** The finger's speed from one move: its distance over the time since the last, smoothed with the speed before (a
 *  move or two of jitter neither starts nor stops a flick). */
export function aimSpeed(previousPxPerMs: number, distancePx: number, elapsedMs: number): number {
  const instant = Math.max(0, distancePx) / Math.max(4, elapsedMs);
  return previousPxPerMs * 0.5 + instant * 0.5;
}
