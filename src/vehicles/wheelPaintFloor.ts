// Road-wheel paint floor (owner 2026-09-14: "road wheels are gray by default and all just blend
// in"). A painted steel dish has to read against its rubber tire in every scheme, so wheel paint —
// the camouflage-derived fleet tone, a profile's wheelHex, or a retoned clone — never drops below
// this linear luminance. Colours below it are pulled toward road dust until they reach it; brighter
// paint is untouched. The tire rubber (#292a28) sits at 0.023, so the floor is ~3x the tire.
import type { Color } from 'three';

export const WHEEL_PAINT_FLOOR_LUMINANCE = 0.075;
/** Road dust, linear RGB (#766e56). */
export const WHEEL_DUST_LINEAR: readonly [number, number, number] = [0.184, 0.158, 0.093];

export type LinearRgb = readonly [number, number, number];

export function linearLuminance([r, g, b]: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function srgbChannelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}

/** Mix a linear colour toward dust until it reaches the floor; returns the same triple when it already does. */
export function liftLinearRgbToWheelFloor(rgb: LinearRgb, floor = WHEEL_PAINT_FLOOR_LUMINANCE): LinearRgb {
  const lum = linearLuminance(rgb);
  if (lum >= floor) return rgb;
  const dustLum = linearLuminance(WHEEL_DUST_LINEAR);
  const t = Math.min(1, (floor - lum) / Math.max(1e-6, dustLum - lum));
  return [
    rgb[0] + (WHEEL_DUST_LINEAR[0] - rgb[0]) * t,
    rgb[1] + (WHEEL_DUST_LINEAR[1] - rgb[1]) * t,
    rgb[2] + (WHEEL_DUST_LINEAR[2] - rgb[2]) * t,
  ];
}

/** sRGB 0–255 triple in, sRGB triple out (materials.ts palette math). */
export function liftSrgbToWheelFloor(rgb: LinearRgb, floor = WHEEL_PAINT_FLOOR_LUMINANCE): [number, number, number] {
  const lifted = liftLinearRgbToWheelFloor(
    [srgbChannelToLinear(rgb[0]), srgbChannelToLinear(rgb[1]), srgbChannelToLinear(rgb[2])], floor);
  return [linearChannelToSrgb(lifted[0]), linearChannelToSrgb(lifted[1]), linearChannelToSrgb(lifted[2])];
}

/** In-place floor for a three.js Color (linear working space). Returns the colour for chaining. */
export function liftWheelPaintFloor<T extends Color>(color: T, floor = WHEEL_PAINT_FLOOR_LUMINANCE): T {
  const lifted = liftLinearRgbToWheelFloor([color.r, color.g, color.b], floor);
  color.setRGB(lifted[0], lifted[1], lifted[2]);
  return color;
}
