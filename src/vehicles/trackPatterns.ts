// Deterministic fleet track-family vocabulary.
//
// Running-gear profiles author the mechanical envelope (width, pitch, wheel
// stations and end drums). This module owns the shoe construction shared by
// that envelope. Keeping family selection here replaces the historical mix
// of `innerLinks`, `integratedLinks` and profile-local exceptions with one
// explicit, testable contract while preserving era-specific track identity.

import type { RuntimeValue } from '../runtimeTypes.ts';

export const TRACK_PATTERN_DEFINITIONS = Object.freeze({
  'interleaved-cleat': Object.freeze({
    label: 'wide interleaved cleat shoe',
    surface: 'triple-bar', padCoverage: 0.94, padHeight: 0.078,
    grouserHeight: 0.035, shoulderHeight: 0.008,
    webHeight: 0.046, webDepth: 0.64, hornHeight: 0.18,
    pinStyle: 'end-caps', pinRadius: 0.038,
    shadePalette: Object.freeze([0x2a2c2b, 0x323533, 0x3a3c39]),
  }),
  'early-cast-steel': Object.freeze({
    label: 'cast-steel block shoe',
    surface: 'cast-block', padCoverage: 0.93, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.050, webDepth: 0.66, hornHeight: 0.20,
    pinStyle: 'end-caps', pinRadius: 0.040,
    shadePalette: Object.freeze([0x30312f, 0x383936, 0x282a29]),
  }),
  'soviet-single-pin': Object.freeze({
    label: 'single-pin chevron shoe',
    surface: 'chevron', padCoverage: 0.92, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.044, webDepth: 0.62, hornHeight: 0.19,
    pinStyle: 'end-caps', pinRadius: 0.018,
    shadePalette: Object.freeze([0x292b2a, 0x323432, 0x3b3d3a]),
  }),
  'nato-double-pin': Object.freeze({
    label: 'paired-pad double-pin shoe',
    surface: 'paired-pad', padCoverage: 0.92, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.044, webDepth: 0.64, hornHeight: 0.18,
    pinStyle: 'end-caps', pinRadius: 0.033,
    shadePalette: Object.freeze([0x2d2f2e, 0x363937, 0x3d403d]),
  }),
  'merkava-heavy': Object.freeze({
    label: 'heavy chevron double-pin shoe',
    surface: 'heavy-chevron', padCoverage: 0.95, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.050, webDepth: 0.68, hornHeight: 0.22,
    pinStyle: 'end-caps', pinRadius: 0.038,
    shadePalette: Object.freeze([0x282a29, 0x303331, 0x393b38]),
  }),
  'compact-ifv': Object.freeze({
    label: 'fine-pitch IFV shoe',
    surface: 'fine-rib', padCoverage: 0.91, padHeight: 0.060,
    grouserHeight: 0.032, shoulderHeight: 0.006,
    webHeight: 0.040, webDepth: 0.60, hornHeight: 0.16,
    pinStyle: 'end-caps', pinRadius: 0.028,
    shadePalette: Object.freeze([0x2e302f, 0x373a38, 0x3e413e]),
  }),
  'eastern-ifv': Object.freeze({
    label: 'open-chevron IFV shoe',
    surface: 'open-chevron', padCoverage: 0.92, padHeight: 0.058,
    grouserHeight: 0.026, shoulderHeight: 0.004,
    webHeight: 0.042, webDepth: 0.62, hornHeight: 0.17,
    pinStyle: 'end-caps', pinRadius: 0.024,
    shadePalette: Object.freeze([0x292b29, 0x343634, 0x3c3e3b]),
  }),
  'british-rubber-pad': Object.freeze({
    label: 'British split rubber-block shoe',
    surface: 'rubber-block', padCoverage: 0.93, padHeight: 0.060,
    grouserHeight: 0.018, shoulderHeight: 0.004,
    webHeight: 0.046, webDepth: 0.66, hornHeight: 0.19,
    pinStyle: 'end-caps', pinRadius: 0.032,
    shadePalette: Object.freeze([0x2c2f2e, 0x353836, 0x3d403e]),
  }),
  'franco-italian-modular': Object.freeze({
    label: 'Franco-Italian split-chevron shoe',
    surface: 'split-chevron', padCoverage: 0.92, padHeight: 0.060,
    grouserHeight: 0.021, shoulderHeight: 0.004,
    webHeight: 0.045, webDepth: 0.64, hornHeight: 0.18,
    pinStyle: 'end-caps', pinRadius: 0.031,
    shadePalette: Object.freeze([0x2b2d2c, 0x343735, 0x3b3e3c]),
  }),
  'japanese-modular': Object.freeze({
    label: 'Japanese staggered-rib shoe',
    surface: 'staggered-rib', padCoverage: 0.92, padHeight: 0.058,
    grouserHeight: 0.022, shoulderHeight: 0.004,
    webHeight: 0.043, webDepth: 0.63, hornHeight: 0.17,
    pinStyle: 'end-caps', pinRadius: 0.030,
    shadePalette: Object.freeze([0x2f3130, 0x383a38, 0x40423f]),
  }),
  'hydropneumatic-dead-track': Object.freeze({
    label: 'compact dead-track block shoe',
    surface: 'dead-track', padCoverage: 0.94, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.046, webDepth: 0.70, hornHeight: 0.17,
    pinStyle: 'end-caps', pinRadius: 0.034,
    shadePalette: Object.freeze([0x292b2a, 0x313432, 0x393c39]),
  }),
  'siege-wide': Object.freeze({
    label: 'wide siege traction shoe',
    surface: 'heavy-chevron', padCoverage: 0.96, padHeight: 0.084,
    grouserHeight: 0.038, shoulderHeight: 0.009,
    webHeight: 0.052, webDepth: 0.72, hornHeight: 0.23,
    pinStyle: 'end-caps', pinRadius: 0.042,
    shadePalette: Object.freeze([0x292b2a, 0x333532, 0x3b3d39]),
  }),
} as const);

export type TrackPatternId = keyof typeof TRACK_PATTERN_DEFINITIONS;
export type TrackPatternDefinition = typeof TRACK_PATTERN_DEFINITIONS[TrackPatternId];
export type TrackPattern = Readonly<{ id: TrackPatternId } & TrackPatternDefinition>;

interface TrackPatternSpec {
  id?: RuntimeValue;
}

interface WheelPatternReference {
  id?: RuntimeValue;
}

export const TRACK_PATTERN_IDS = Object.freeze(
  Object.keys(TRACK_PATTERN_DEFINITIONS) as TrackPatternId[],
);

const FAMILY_RULES: ReadonlyArray<readonly [RegExp, TrackPatternId]> = Object.freeze([
  [/(?:^|_)t95(?:$|_)/, 'siege-wide'],
  [/(?:tiger1|panther_g|jpz_e100|sturmtiger)/, 'interleaved-cleat'],
  [/(?:m4a3e8|t34_85|kv2|isu152|isu122s)/, 'early-cast-steel'],
  [/(?:udes03|strv103a|strv103)(?:$|_)/, 'hydropneumatic-dead-track'],
  [/(?:bmp2|bmp3|bwp1|upior|bmpt)/, 'eastern-ifv'],
  [/(?:m2a2_bradley|m3a3_bradley|m2a3_bradley|spz_puma|marder1a3|cv90)/, 'compact-ifv'],
  [/(?:chieftain|challenger|centurion|vickers|fv510)/, 'british-rubber-pad'],
  [/(?:amx|leclerc|carro45t|ariete)/, 'franco-italian-modular'],
  [/(?:stb1|type74|type90|type10|type89)(?:$|_)/, 'japanese-modular'],
  [/(?:merkava)/, 'merkava-heavy'],
  [/(?:t62|t64|t72|t80|t84|t90|pt91|type59|ztz85|type99|ztz99|vt4|t14|ua_t)/, 'soviet-single-pin'],
]);

/** Resolve one stable shoe construction for a vehicle's complete track train. */
export function trackPatternFor(
  spec: TrackPatternSpec | null | undefined,
  wheelPattern: string | WheelPatternReference | null = null,
  override: TrackPatternId | null = null,
): TrackPattern {
  if (override != null) {
    if (!TRACK_PATTERN_DEFINITIONS[override]) {
      throw new Error(`Unknown track pattern: ${override}`);
    }
    return Object.freeze({ id: override, ...TRACK_PATTERN_DEFINITIONS[override] });
  }

  const id = String(spec?.id || '').toLowerCase();
  for (const [matcher, patternId] of FAMILY_RULES) {
    if (matcher.test(id)) {
      return Object.freeze({ id: patternId, ...TRACK_PATTERN_DEFINITIONS[patternId] });
    }
  }

  const wheelId = typeof wheelPattern === 'string' ? wheelPattern : wheelPattern?.id;
  const patternId = wheelId === 'interleaved-dish'
    ? 'interleaved-cleat'
    : wheelId === 'christie-six'
      ? 'early-cast-steel'
      : wheelId === 'armored-hub-six'
        ? 'compact-ifv'
        : 'nato-double-pin';
  return Object.freeze({ id: patternId, ...TRACK_PATTERN_DEFINITIONS[patternId] });
}
