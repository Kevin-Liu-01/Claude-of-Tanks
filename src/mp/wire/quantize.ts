/**
 * Quantization helpers: simulation units (m, m/s, rad, s) <-> wire integers.
 * Round trips are bit-exact on the integer side; the float side is exact to
 * the documented resolution (1 mm, 1 cm/s, 1/65536 turn, 2 ms).
 */
import {
  ANGLE_TURN_UNITS, MULTIPLIER_SCALE, POSITION_SCALE, RELOAD_MS_UNITS, SHELL_VELOCITY_SCALE, VELOCITY_SCALE,
} from './constants.ts';

// The seat's control quantizers belong to the core (sim/seatControl.ts: the local driver stages a seat with them too).
export {
  dequantizeAimDistance, dequantizeAimPitch, dequantizeAngle, dequantizeControlAxis, quantizeAimDistance, quantizeAimPitch,
  quantizeAngle, quantizeControlAxis, wrapAngle,
} from '../../sim/seatControl.ts';

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

/** Shortest signed difference b - a in turn units, in [-32768, 32767]. */
export function angleUnitsDelta(a: number, b: number): number {
  let delta = (b - a) % ANGLE_TURN_UNITS;
  if (delta > ANGLE_TURN_UNITS / 2 - 1) delta -= ANGLE_TURN_UNITS;
  else if (delta < -ANGLE_TURN_UNITS / 2) delta += ANGLE_TURN_UNITS;
  return delta;
}

/** Seconds -> RELOAD_MS_UNITS steps, rounded up so any positive remainder stays positive. */
export function quantizeReloadS(seconds: number): number {
  const ms = Math.max(0, finite(seconds)) * 1000;
  const units = Math.ceil(ms / RELOAD_MS_UNITS - 1e-9);
  return units <= 0 ? 0 : Math.min(65535, units);
}
export function dequantizeReloadS(units: number): number { return (units * RELOAD_MS_UNITS) / 1000; }

export function quantizeMultiplier(value: number): number {
  return clampInt(finite(value, 1) * MULTIPLIER_SCALE, 0, 65535);
}
export function dequantizeMultiplier(units: number): number { return units / MULTIPLIER_SCALE; }

export function clampU16(value: number): number { return clampInt(value, 0, 65535); }
/** A unit quaternion component as an i16 (±1 = ±32767) and back. */
export function quantizeUnitComponent(value: number): number {
  return clampInt(Math.round((Number.isFinite(value) ? value : 0) * 32767), -32767, 32767);
}
export function dequantizeUnitComponent(units: number): number { return units / 32767; }
export function clampU8(value: number): number { return clampInt(value, 0, 255); }
