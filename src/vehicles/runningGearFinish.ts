// Running-gear finish — the one table that says what colour every part of a tank's running gear may be.
//
// Owner 2026-09-22: "look through all wheel colors many of which are arbitrary or super bright or just dont
// look good and make a better wheel system." Before this table the fleet decided wheel colours in nine
// places: the scheme-derived fleet wheel paint (materials.ts), a per-hull `wheelHex`/`tireHex`/`endWheelHex`
// clone in the running-gear builder, family "worn dish"/"worn drum" clones swapped onto discs and end wheels
// after the build (Leopard, Abrams, Challenger, UK, Merkava, casemates), in-place retints of the shared paint
// (T-72, T-90 Proryv, Terminator, Strv), fitting paint on the Merkava dish rings and untagged dark layers.
// The result was the T-62's saturated pale-olive dishes, end wheels a different tone from the road wheels
// beside them, and wheels that changed colour on the next camouflage repaint.
//
// The system (real vehicles): tires are dark rubber; every painted face — road-wheel dishes, hub caps, rims,
// return-roller discs, sprocket and idler bodies — carries the hull's own scheme paint, exactly one material
// per hull, re-tinted with the hull on every repaint; bolts, teeth, recess rings and other hardware are dark
// steel; a bare-metal wheel (unpainted end drums) is the worn track steel. Nothing on the running gear may be
// an arbitrary hex, brighter than the ceiling, or more saturated than the cap. The same materials serve HIGH
// and LOW quality, the Garage, the Gallery and (under the burn hook) wrecks.
//
// appearanceAudit.ts enforces the table after every build (normaliser), wheelQuality.ts audits it on every
// hull in the release gate, and runningGearFinish.selftest.mjs pins the numbers. Pure module: no three.js.
import { WHEEL_PAINT_FLOOR_LUMINANCE, linearLuminance } from './wheelPaintFloor.ts';

/** Fixed sRGB hexes of the neutral working-gear finishes. */
export const RUNNING_GEAR_PALETTE = Object.freeze({
  /** Road-wheel and return-roller tires, and the dark insets of a painted face (hub wells, lightening holes). */
  tireRubber: 0x292a28,
  /** Track shoes' pad steel. */
  trackPad: 0x30312f,
  /** Worn track steel: sprocket teeth, recess rings, end-wheel hardware, spare links, unpainted end drums. */
  trackSteel: 0x353634,
  /** Small dark hardware on a painted face (bolt heads, dish breaks). */
  gunmetal: 0x36342f,
  /** Wheel-bay ambient-occlusion walls. */
  gearShadow: 0x0b0c0a,
});

/** Linear-luminance slack under the wheel-paint floor left by its 8-bit sRGB application. */
export const WHEEL_PAINT_FLOOR_SRGB_TOLERANCE = 0.004;

export type RunningGearFinish = 'rubber' | 'scheme-paint' | 'scheme-paint-shade' | 'dark-steel' | 'shadow';

export interface RunningGearFinishRule {
  readonly finish: RunningGearFinish;
  /** Appearance roles (object first, material as fallback) the rule governs. */
  readonly roles: readonly string[];
  /** Material appearance roles allowed under those object roles. */
  readonly materialRoles: readonly string[];
  /** Fixed sRGB hex the normaliser snaps the material to (rubber, steel, shadow); undefined for scheme paint. */
  readonly hex?: number;
  /** Linear-luminance window every material under the rule must satisfy. */
  readonly minLuminance: number;
  readonly maxLuminance: number;
  /** HSL saturation cap (three.js Color.getHSL on the linear colour). */
  readonly maxSaturation: number;
  readonly note: string;
}

/** The one table. Order matters only for the reader; every rule owns disjoint roles. */
export const RUNNING_GEAR_FINISH_RULES: readonly RunningGearFinishRule[] = Object.freeze([
  Object.freeze({
    finish: 'rubber', roles: ['wheelTire', 'wheelInset', 'tireRubber'], materialRoles: ['tireRubber'],
    hex: RUNNING_GEAR_PALETTE.tireRubber, minLuminance: 0, maxLuminance: 0.035, maxSaturation: 0.10,
    note: 'tires and face insets are dark rubber (#292a28, linear luminance 0.023), never a per-hull tone',
  }),
  Object.freeze({
    finish: 'scheme-paint', roles: ['wheelDish'], materialRoles: ['wheelPaint', 'trackSteel', 'gunmetal'],
    // The floor is applied in 8-bit sRGB (wheelPaintFloor.ts liftSrgbToWheelFloor), so a floored paint may sit
    // up to 0.004 under it in linear luminance (the floor receipt's own tolerance).
    minLuminance: WHEEL_PAINT_FLOOR_LUMINANCE - WHEEL_PAINT_FLOOR_SRGB_TOLERANCE, maxLuminance: 0.45, maxSaturation: 0.30,
    note: 'dishes, hub caps, rims, roller discs and end-wheel bodies take the hull scheme wheel paint (one '
      + 'material per hull, floored by wheelPaintFloor.ts, re-tinted on repaint); bare metal is worn track '
      + 'steel; bolts on a painted face may be gunmetal',
  }),
  Object.freeze({
    finish: 'scheme-paint-shade', roles: ['suspensionLink'], materialRoles: ['wheelPaint'],
    minLuminance: WHEEL_PAINT_FLOOR_LUMINANCE * 0.4, maxLuminance: 0.45, maxSaturation: 0.30,
    note: 'suspension arms and recessed interleave rows ride the scheme paint in shade (the wheelsRecessed '
      + 'material, 0.66 x the paint in sRGB)',
  }),
  Object.freeze({
    finish: 'dark-steel', roles: ['trackHardware', 'trackSteel'], materialRoles: ['trackSteel'],
    hex: RUNNING_GEAR_PALETTE.trackSteel, minLuminance: 0, maxLuminance: 0.06, maxSaturation: 0.12,
    note: 'teeth, recess rings, end-wheel hardware and spare links are worn dark steel (hull-bucket fittings '
      + 'around the gear keep their own gunmetal role and are outside this table)',
  }),
  Object.freeze({
    finish: 'shadow', roles: ['gearShadow'], materialRoles: ['gearShadow'],
    hex: RUNNING_GEAR_PALETTE.gearShadow, minLuminance: 0, maxLuminance: 0.01, maxSaturation: 0.20,
    note: 'wheel-bay AO walls are near black',
  }),
]);

/** The rule an appearance role falls under, if any. */
export function runningGearFinishRuleFor(role: string | null | undefined): RunningGearFinishRule | null {
  if (!role) return null;
  for (const rule of RUNNING_GEAR_FINISH_RULES) if (rule.roles.includes(role)) return rule;
  return null;
}

/** The ratio the shaded wheel paint keeps to the paint, per sRGB channel (materials.ts wheelDarkRgbOf). */
export const WHEEL_PAINT_SHADE_RATIO = 0.66;

type LinearRgb = readonly [number, number, number];

/** three.js Color.getHSL saturation for a linear colour (the same maths, without a Color). */
export function hslSaturation([r, g, b]: LinearRgb): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  const delta = max - min;
  return lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
}

/** Whether a linear colour sits inside a rule's luminance window and saturation cap. */
export function withinRunningGearFinish(rgb: LinearRgb, rule: RunningGearFinishRule): boolean {
  const lum = linearLuminance(rgb);
  return lum >= rule.minLuminance - 1e-9 && lum <= rule.maxLuminance + 1e-9 && hslSaturation(rgb) <= rule.maxSaturation + 1e-9;
}

/** sRGB hex → linear triple (materials store colours in linear working space). */
export function hexToLinearRgb(hex: number): [number, number, number] {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((hex >> 16) & 255), channel((hex >> 8) & 255), channel(hex & 255)];
}
