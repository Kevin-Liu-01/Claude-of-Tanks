/**
 * The phone controller's input model (docs/PHONE-CONTROLLER.md "Controls"), pure and Node-runnable.
 *
 * Phone side: the wheel angle from `deviceorientation` (β, γ) and the screen's rotation, the steering curve (centre,
 * dead zone, power curve, full lock), and the lever and stick shapes. Desktop side: the mapper that turns axes frames
 * and ctl messages into calls on the game's input-action layer (src/game/input.ts's virtual controls, the touch HUD's
 * path), with the stale-frame fail-safe. The mapper is the only place a phone touches the game; the sim never sees it.
 */
import { PAD_AIM_SCALE, PAD_HOLD_ACTIONS, padSeqNewer } from './padProtocol.ts';
import type { PadAxes, PadCtlMessage, PadHoldAction, PadTapAction } from './padProtocol.ts';

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

// ---- the desktop's mapper -----------------------------------------------------------------------------------

/** The input layer's virtual controls (src/game/input.ts InputLayer), the touch HUD's path. */
export interface PadInputPort {
  setVirtualMove(x: number, y: number): void;
  addVirtualAim(dx: number, dy: number): void;
  pressVirtual(actionId: PadHoldAction | PadTapAction): void;
  releaseVirtual(actionId: PadHoldAction | PadTapAction): void;
  tapVirtual(actionId: PadTapAction): void;
}

export interface PadInputMapper {
  /** Apply one decoded axes frame (aim totals in eighths). False when it is older than the newest applied. */
  applyAxes(axes: PadAxes, nowMs: number): boolean;
  applyCtl(message: PadCtlMessage): void;
  /** Once a frame: no axes frame for `staleMs` centres the stick and releases every held control. */
  tick(nowMs: number, staleMs: number): void;
  /** Centre the stick and release everything (unpaired, paused, link lost). */
  releaseAll(): void;
  /** The newest frame's phone clock and when it was applied (latency readout). */
  readonly lastPhoneT: number;
  readonly lastAppliedAt: number;
}

/** How far behind the newest frame a frame may arrive and still count as late rather than a restarted stream. */
const PAD_LATE_FRAMES = 64;
/** The longest the stale fail-safe waits, however slowly a throttled phone's heartbeat comes. */
const PAD_STALE_MAX_MS = 1500;

/** The aim pad's drag in phone px, scaled to the mouse's units (the touch HUD's aim drag uses 1.18). */
export const PAD_AIM_GAIN = 1.25;

export function createPadInputMapper(input: PadInputPort, onPause?: () => void): PadInputMapper {
  const pressed = new Set<PadHoldAction>();
  /** The phone's axes seq at each hold's newest ctl event: a frame at or past it is the hold's truth. */
  const ctlSeq = new Map<PadHoldAction, number>();
  let haveFrame = false;
  let seq = 0;
  let aimX = 0;
  let aimY = 0;
  let lastAt = -Infinity;
  let lastPhoneT = 0;
  let moving = false;
  /** The last eight gaps between frames: their median is the phone's usual gap, which a throttled phone (low power)
   *  stretches; one long pause or one burst does not move it. */
  const gaps = new Float64Array(8);
  let gapCount = 0;
  const sorted = new Float64Array(8);
  const usualGap = (): number => {
    const n = Math.min(gapCount, 8);
    if (!n) return 0;
    sorted.set(gaps);
    sorted.subarray(0, n).sort();
    return sorted[n >> 1]!;
  };

  const press = (action: PadHoldAction): void => { if (!pressed.has(action)) { pressed.add(action); input.pressVirtual(action); } };
  const release = (action: PadHoldAction): void => { if (pressed.delete(action)) input.releaseVirtual(action); };

  const mapper: PadInputMapper = {
    get lastPhoneT() { return lastPhoneT; },
    get lastAppliedAt() { return lastAt; },
    applyAxes(axes, nowMs) {
      if (haveFrame && !padSeqNewer(axes.seq, seq)) {
        // a frame a few behind the newest arrived late (the channel is unordered); one far behind is a phone whose
        // stream restarted (a reload resumed the pairing): a fresh baseline, never a dropped controller
        if (((seq - axes.seq) & 0xffff) <= PAD_LATE_FRAMES) return false;
        haveFrame = false;
      }
      if (haveFrame) {
        // int32 totals wrap: the difference is the drag since the last frame applied, lost frames included
        const dx = ((axes.aimX - aimX) | 0) / PAD_AIM_SCALE;
        const dy = ((axes.aimY - aimY) | 0) / PAD_AIM_SCALE;
        if (dx !== 0 || dy !== 0) input.addVirtualAim(dx * PAD_AIM_GAIN, dy * PAD_AIM_GAIN);
      }
      if (haveFrame) gaps[gapCount++ % 8] = Math.min(2000, nowMs - lastAt);
      haveFrame = true;
      seq = axes.seq; aimX = axes.aimX; aimY = axes.aimY;
      lastAt = nowMs; lastPhoneT = axes.t;
      moving = axes.steer !== 0 || axes.throttle !== 0;
      input.setVirtualMove(axes.steer, axes.throttle);
      for (let i = 0; i < PAD_HOLD_ACTIONS.length; i++) {
        const action = PAD_HOLD_ACTIONS[i]!;
        const at = ctlSeq.get(action);
        // a frame older than the hold's last ctl event predates it (the two channels are not ordered together)
        if (at !== undefined && padSeqNewer(at, axes.seq)) continue;
        if (axes.held & (1 << i)) press(action); else release(action);
      }
      return true;
    },
    applyCtl(message) {
      switch (message.k) {
        case 'down': ctlSeq.set(message.a, message.s); press(message.a); return;
        case 'up': ctlSeq.set(message.a, message.s); release(message.a); return;
        case 'tap': input.tapVirtual(message.a); return;
        case 'pause': onPause?.(); return;
        default: return;
      }
    },
    tick(nowMs, staleMs) {
      // four of the phone's usual gaps, never less than the link's own window nor more than the cap
      if (!haveFrame || nowMs - lastAt <= Math.min(PAD_STALE_MAX_MS, Math.max(staleMs, usualGap() * 4))) return;
      if (moving || pressed.size) mapper.releaseAll();
    },
    releaseAll() {
      for (const action of [...pressed]) release(action);
      if (moving) { moving = false; input.setVirtualMove(0, 0); }
      // the next frame is a fresh baseline: a phone that slept does not swing the gun by its drag since
      haveFrame = false;
    },
  };
  return mapper;
}
