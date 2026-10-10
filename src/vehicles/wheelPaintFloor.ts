// Road-wheel paint floor (owner 2026-09-14: "road wheels are gray by default and all just blend
// in"). A painted steel dish has to read against its rubber tire in every scheme, so wheel paint —
// the camouflage-derived fleet tone, a profile's wheelHex, or a retoned clone — never drops below
// this linear luminance; brighter paint is untouched. The tire rubber (#292a28) sits at 0.023, so the
// floor is about twice the tire.
//
// Launch night 2026-10-08 (wave 289, every critic in all four parts: "road wheels read as bare cream or beige
// plastic"; the coordinator: "wheel discs in the vehicle's base paint, hull hue and value"): the floor used to sit at
// 0.075 and pull a dark paint toward road dust (#766e56) to reach it, so every dark scheme's dishes landed on one
// khaki grey, #504e3c, brighter than the hull they belong to and the same on a K2, a Leopard and an Abrams. A dark
// paint now rises to the floor in its own hue (scaled, which keeps its chromaticity exactly), and the floor sits at
// 0.045, so the darkest service greens keep their own value. Only a colour with no luminance to scale (black) still
// takes the dust direction.
import type { Color } from 'three';

export const WHEEL_PAINT_FLOOR_LUMINANCE = 0.045;
/** Road dust, linear RGB (#766e56): the lift's direction for a colour too dark to scale in its own hue. */
export const WHEEL_DUST_LINEAR: readonly [number, number, number] = [0.184, 0.158, 0.093];
/** Below this linear luminance a colour has no hue worth keeping and is lifted toward dust instead. */
const WHEEL_SCALE_MIN_LUMINANCE = 0.004;

type LinearRgb = readonly [number, number, number];

export function linearLuminance([r, g, b]: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function srgbChannelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}

/** Raise a linear colour to the floor in its own hue (a uniform scale, which keeps its chromaticity); returns the same
 * triple when it already reaches the floor. A near-black colour, with no hue to keep, is mixed toward road dust. */
export function liftLinearRgbToWheelFloor(rgb: LinearRgb, floor = WHEEL_PAINT_FLOOR_LUMINANCE): LinearRgb {
  const lum = linearLuminance(rgb);
  if (lum >= floor) return rgb;
  if (lum >= WHEEL_SCALE_MIN_LUMINANCE) {
    const k = floor / lum;
    return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
  }
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
