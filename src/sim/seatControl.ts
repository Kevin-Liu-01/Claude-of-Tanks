/**
 * A seat's controls for one fixed step as integers (replay-system-275, docs/REPLAY.md §1 and §3 item 2).
 *
 * The control quantizers are the wire's (moved here from src/mp/wire/quantize.ts, which re-exports them, so the core owns
 * them and the local driver can stage a seat without reaching src/mp): throttle and steer in 1/127, the aim as an intent
 * (sim/aimIntent.ts) in 1/65536 turn of yaw, 1/32767 of a quarter turn of pitch and 5 cm of distance.
 *
 * `captureSeatControl` reads what a driver staged on a hull this step into integers; `applySeatControl` writes integers
 * back as the step reads them, the aim decoded against the hull (its drone while one flies), as the seat stage does
 * (sim/playerInputStage.ts). The local driver runs both every step for each seated hull, so a battle's live controls are
 * exactly what its recording replays; a replay runs only the apply. Node-runnable, no allocation per call.
 */
import { decodeAimIntent, encodeAimIntent, type MutableVector3Like, type Vector3Like } from './aimIntent.ts';

export const ANGLE_TURN_UNITS = 65536;       // u16 turns
export const AIM_PITCH_UNITS = 32767;        // i16 over +-pi/2
export const AIM_DISTANCE_SCALE = 20;        // 5 cm units, u16 (max 3276 m)
export const CONTROL_AXIS_SCALE = 127;       // i8 throttle / steer

const TWO_PI = Math.PI * 2;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampInt(value: number, low: number, high: number): number {
  const rounded = Math.round(finite(value));
  return rounded < low ? low : rounded > high ? high : rounded;
}

/** Any radian value -> u16 turn in [0, 65535]. */
export function quantizeAngle(radians: number): number {
  const turns = finite(radians) / TWO_PI;
  const units = Math.round((turns - Math.floor(turns)) * ANGLE_TURN_UNITS);
  return units & (ANGLE_TURN_UNITS - 1);
}
/** u16 turn -> radians in (-pi, pi]. */
export function dequantizeAngle(units: number): number {
  return wrapAngle((units / ANGLE_TURN_UNITS) * TWO_PI);
}
export function wrapAngle(radians: number): number {
  let angle = finite(radians) % TWO_PI;
  if (angle > Math.PI) angle -= TWO_PI;
  else if (angle <= -Math.PI) angle += TWO_PI;
  return angle;
}

export function quantizeAimPitch(radians: number): number {
  return clampInt((finite(radians) / (Math.PI / 2)) * AIM_PITCH_UNITS, -AIM_PITCH_UNITS, AIM_PITCH_UNITS);
}
export function dequantizeAimPitch(units: number): number {
  return (units / AIM_PITCH_UNITS) * (Math.PI / 2);
}

export function quantizeAimDistance(meters: number): number {
  return clampInt(meters * AIM_DISTANCE_SCALE, 0, 65535);
}
export function dequantizeAimDistance(units: number): number { return units / AIM_DISTANCE_SCALE; }

export function quantizeControlAxis(value: number): number {
  return clampInt(finite(value) * CONTROL_AXIS_SCALE, -CONTROL_AXIS_SCALE, CONTROL_AXIS_SCALE);
}
export function dequantizeControlAxis(units: number): number { return units / CONTROL_AXIS_SCALE; }

export const SEAT_FLAG_BRAKE = 1;
export const SEAT_FLAG_FIRE = 2;
export const SEAT_FLAG_AIM_LOCKED = 4;

/** One seat's staged controls for one step, in integer units. `fireIntentSeq` is -1 for none. */
export interface SeatControl {
  throttle: number;
  steer: number;
  flags: number;
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
  shellSlot: number;
  actionBits: number;
  auxiliaryBits: number;
  fireIntentSeq: number;
}

/** The field order a recording writes and reads (one change-mask bit each). */
export const SEAT_CONTROL_FIELDS = ['throttle', 'steer', 'flags', 'aimYaw', 'aimPitch', 'aimDistance', 'shellSlot',
  'actionBits', 'auxiliaryBits', 'fireIntentSeq'] as const satisfies readonly (keyof SeatControl)[];

export function createSeatControl(): SeatControl {
  return { throttle: 0, steer: 0, flags: 0, aimYaw: 0, aimPitch: 0, aimDistance: 0, shellSlot: 0, actionBits: 0, auxiliaryBits: 0,
    fireIntentSeq: -1 };
}

/** The hull fields a seat's controls live in (the page's entity and the authority's both carry them). */
export interface SeatControlEntity {
  state: { pos: Vector3Like };
  aerial?: (Vector3Like & { active: boolean }) | null;
  input: {
    throttle: number;
    steer: number;
    brake: boolean;
    fire: boolean;
    aimLocked: boolean;
    shellSlot: number;
    actionBits: number;
    auxiliaryBits?: number;
    fireIntentSeq?: number | null;
    aimPoint: MutableVector3Like;
  };
}

const aimOrigin = (entity: SeatControlEntity): Vector3Like => (entity.aerial?.active ? entity.aerial : entity.state.pos);

/** What a driver staged on `entity` this step, as integers, into `out`. */
export function captureSeatControl(entity: SeatControlEntity, out: SeatControl): SeatControl {
  const input = entity.input;
  out.throttle = quantizeControlAxis(input.throttle);
  out.steer = quantizeControlAxis(input.steer);
  out.flags = (input.brake ? SEAT_FLAG_BRAKE : 0) | (input.fire ? SEAT_FLAG_FIRE : 0) | (input.aimLocked ? SEAT_FLAG_AIM_LOCKED : 0);
  const intent = encodeAimIntent(aimOrigin(entity), input.aimPoint);
  out.aimYaw = quantizeAngle(intent.aimYaw);
  out.aimPitch = quantizeAimPitch(intent.aimPitch);
  out.aimDistance = quantizeAimDistance(intent.aimDistance);
  out.shellSlot = input.shellSlot | 0;
  out.actionBits = input.actionBits | 0;
  out.auxiliaryBits = (input.auxiliaryBits ?? 0) | 0;
  out.fireIntentSeq = Number.isSafeInteger(input.fireIntentSeq) ? input.fireIntentSeq! : -1;
  return out;
}

const _intent = { aimYaw: 0, aimPitch: 0, aimDistance: 0 };

/** `control` written onto `entity` as the step reads it. */
export function applySeatControl(entity: SeatControlEntity, control: SeatControl): void {
  const input = entity.input;
  input.throttle = dequantizeControlAxis(control.throttle);
  input.steer = dequantizeControlAxis(control.steer);
  input.brake = (control.flags & SEAT_FLAG_BRAKE) !== 0;
  input.fire = (control.flags & SEAT_FLAG_FIRE) !== 0;
  input.aimLocked = (control.flags & SEAT_FLAG_AIM_LOCKED) !== 0;
  input.shellSlot = control.shellSlot;
  input.actionBits = control.actionBits;
  input.auxiliaryBits = control.auxiliaryBits;
  input.fireIntentSeq = control.fireIntentSeq >= 0 ? control.fireIntentSeq : null;
  _intent.aimYaw = dequantizeAngle(control.aimYaw);
  _intent.aimPitch = dequantizeAimPitch(control.aimPitch);
  _intent.aimDistance = dequantizeAimDistance(control.aimDistance);
  decodeAimIntent(_intent, aimOrigin(entity), input.aimPoint);
}
