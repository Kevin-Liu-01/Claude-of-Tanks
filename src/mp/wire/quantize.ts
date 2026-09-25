/**
 * Quantization helpers: simulation units (m, m/s, rad, s) <-> wire integers.
 * Round trips are bit-exact on the integer side; the float side is exact to
 * the documented resolution (1 mm, 1 cm/s, 1/65536 turn, 2 ms).
 */
import {
  AIM_DISTANCE_SCALE, AIM_PITCH_UNITS, ANGLE_TURN_UNITS, CONTROL_AXIS_SCALE, MULTIPLIER_SCALE,
  POSITION_SCALE, RELOAD_MS_UNITS, SHELL_VELOCITY_SCALE, VELOCITY_SCALE,
} from './constants.ts';

const TWO_PI = Math.PI * 2;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampInt(value: number, low: number, high: number): number {
  const rounded = Math.round(finite(value));
  return rounded < low ? low : rounded > high ? high : rounded;
}

export function quantizePosition(meters: number): number {
  return clampInt(meters * POSITION_SCALE, -2147483648, 2147483647);
}
export function dequantizePosition(mm: number): number { return mm / POSITION_SCALE; }

export function quantizeVelocity(mps: number): number {
  return clampInt(mps * VELOCITY_SCALE, -32768, 32767);
}
export function dequantizeVelocity(units: number): number { return units / VELOCITY_SCALE; }

export function quantizeShellVelocity(mps: number): number {
  return clampInt(mps * SHELL_VELOCITY_SCALE, -32768, 32767);
}
export function dequantizeShellVelocity(units: number): number { return units / SHELL_VELOCITY_SCALE; }

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
/** Shortest signed difference b - a in turn units, in [-32768, 32767]. */
export function angleUnitsDelta(a: number, b: number): number {
  let delta = (b - a) % ANGLE_TURN_UNITS;
  if (delta > ANGLE_TURN_UNITS / 2 - 1) delta -= ANGLE_TURN_UNITS;
  else if (delta < -ANGLE_TURN_UNITS / 2) delta += ANGLE_TURN_UNITS;
  return delta;
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

/** Seconds -> RELOAD_MS_UNITS steps, rounded up so any positive remainder stays positive. */
export function quantizeReloadS(seconds: number): number {
  const ms = Math.max(0, finite(seconds)) * 1000;
  const units = Math.ceil(ms / RELOAD_MS_UNITS - 1e-9);
  return units <= 0 ? 0 : Math.min(65535, units);
}
export function dequantizeReloadS(units: number): number { return (units * RELOAD_MS_UNITS) / 1000; }
export function dequantizeReloadMs(units: number): number { return units * RELOAD_MS_UNITS; }

export function quantizeMultiplier(value: number): number {
  return clampInt(finite(value, 1) * MULTIPLIER_SCALE, 0, 65535);
}
export function dequantizeMultiplier(units: number): number { return units / MULTIPLIER_SCALE; }

export function clampU16(value: number): number { return clampInt(value, 0, 65535); }
export function clampU8(value: number): number { return clampInt(value, 0, 255); }
