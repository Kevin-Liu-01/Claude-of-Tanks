/**
 * The phone controller's input model (docs/PHONE-CONTROLLER.md "Controls"), pure and Node-runnable.
 *
 * The phone's side: the two thumbs. The left is a floating stick (it lands where the thumb does; its push is the drive's
 * throttle and steer), the right an aim area (a drag aims at the speed curve's gain, so a slow drag is precise and a
 * flick swings the gun round). The frame's quarter turn for a page the system keeps portrait, and the safe areas on the
 * frame's own sides. The desktop's mapper that applies what the phone sends is padDesk.ts.
 */

// ---- the sticks (phone side) -------------------------------------------------------------------------------------

/** A stick's travel: its push past a small dead zone, to the ring and no further, as -1..1 on each axis (y up). */
export interface StickCurve {
  /** The ring's radius: a push this far is full travel. */
  radiusPx: number;
  /** The share of the radius that moves nothing (a resting thumb's wobble). */
  deadzone: number;
  /** Power on the push past the dead zone: > 1 is finer near the centre. */
  curve: number;
}

export const DRIVE_STICK: StickCurve = Object.freeze({ radiusPx: 64, deadzone: 0.12, curve: 1.3 });

/** The stick's value from the thumb's offset (dx right, dy down, in px) from where it landed: x right, y forward. The
 *  push keeps its direction; only its length is curved, so a diagonal stays a diagonal. */
export function stickValue(dx: number, dy: number, curve: StickCurve = DRIVE_STICK): [number, number] {
  const length = Math.hypot(dx, dy);
  if (!(curve.radiusPx > 0) || length === 0) return [0, 0];
  const push = Math.min(1, length / curve.radiusPx);
  const past = Math.max(0, push - curve.deadzone) / (1 - curve.deadzone);
  const scaled = past ** curve.curve;
  // (0 - dy, not -dy: a still axis reads 0, never -0)
  return [(scaled * dx) / length, (scaled * (0 - dy)) / length];
}

/** Where the stick's knob sits: the offset, held inside the ring. */
export function stickKnob(dx: number, dy: number, radiusPx: number): [number, number] {
  const length = Math.hypot(dx, dy);
  if (length <= radiusPx || length === 0) return [dx, dy];
  return [dx * radiusPx / length, dy * radiusPx / length];
}

// ---- the frame (phone side) -------------------------------------------------------------------------------
// The controller is always laid out landscape. A page the system shows landscape is not turned; a page it keeps portrait
// (an iPhone with rotation lock on, held sideways) is turned a quarter: the phone's top to the left, the way most hands
// turn one, or the other way with Flip (padPage.ts). A frame's turn is CSS rotate(), clockwise on the viewport.

const quarter = (deg: number): number => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;

/** How far the frame turns on the viewport: none when the page is landscape, a quarter when it is portrait. */
export function frameTurnFor(wide: boolean, flipped = false): number {
  return wide ? 0 : flipped ? 270 : 90;
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
