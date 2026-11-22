/**
 * The phone controller's input model (docs/PHONE-CONTROLLER.md "Controls"), pure and Node-runnable.
 *
 * The phone's side: the two thumbs. The left is a floating stick (it lands where the thumb does; its push is the drive's
 * throttle and steer), the right a floating aim stick (its push is how fast the gun turns, a gamepad's right stick).
 * The frame's quarter turn for a page the system keeps portrait, and the safe areas on the frame's own sides. The
 * desktop's mapper that applies what the phone sends is padDesk.ts.
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

// ---- the aim stick (phone side) ----------------------------------------------------------------------------------

/** The right stick (owner 2026-11-21: "it should be a joystick too. its just more intuitive"): the push is how fast the
 *  gun turns, held as long as the thumb holds it, like a gamepad's right stick. Finer near the centre than the drive's,
 *  so a small push lays the gun; a thumb that lands on the fire button pushes it past a press's wobble. */
export const AIM_STICK: StickCurve = Object.freeze({ radiusPx: 56, deadzone: 0.1, curve: 1.8 });
export const TRIGGER_AIM_STICK: StickCurve = Object.freeze({ radiusPx: 56, deadzone: 0.2, curve: 1.8 });

/** Full push, in phone px per second of aim: the gamepad's right stick (input.ts PAD_AIM_RATE, 760 mouse px a second)
 *  over the desktop's PAD_AIM_GAIN (1.25), so both sticks turn the gun alike: about 96° a second at the mouse's 0.0022
 *  rad per px. */
export const AIM_STICK_RATE = 608;

/** Held at the rim, the turn speeds up (a turn to the rear without waiting): after `afterMs` at `push` or more it ramps to
 *  `max` over `rampMs`. Never in the scope, where a held push must not throw the sight off a target. */
export const AIM_RIM = Object.freeze({ push: 0.9, afterMs: 250, rampMs: 400, max: 1.8 });

export function aimRimBoost(rimMs: number, scoped = false): number {
  if (scoped) return 1;
  const ramp = Math.max(0, Math.min(1, (rimMs - AIM_RIM.afterMs) / AIM_RIM.rampMs));
  return 1 + (AIM_RIM.max - 1) * ramp;
}

/** One step of the aim stick: the aim it adds over `dtMs` (dx right, dy down, phone px, the axes frame's totals) for a
 *  push (x right, y up, -1..1) at the player's speed `scale`, and the time held at the rim after it. */
export function aimStickStep(x: number, y: number, dtMs: number, rimMs: number, scale = 1, scoped = false): { dx: number; dy: number; rimMs: number } {
  const dt = Math.max(0, Math.min(100, Number(dtMs) || 0));
  const push = Math.hypot(x, y);
  const rim = push >= AIM_RIM.push ? rimMs + dt : 0;
  const k = AIM_STICK_RATE * scale * aimRimBoost(rim, scoped) * dt / 1000;
  // (0 - y: a stick pushed up looks up, a screen move up; a still axis reads 0, never -0)
  return { dx: x * k, dy: (0 - y) * k, rimMs: rim };
}
