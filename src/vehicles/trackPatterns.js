// Deterministic fleet track-family vocabulary.
//
// Running-gear profiles author the mechanical envelope (width, pitch, wheel
// stations and end drums). This module owns the shoe construction shared by
// that envelope. Keeping family selection here replaces the historical mix
// of `innerLinks`, `integratedLinks` and profile-local exceptions with one
// explicit, testable contract while preserving era-specific track identity.

export const TRACK_PATTERN_DEFINITIONS = Object.freeze({
  'interleaved-cleat': Object.freeze({
    label: 'wide interleaved cleat shoe',
    surface: 'triple-bar', padCoverage: 0.94, padHeight: 0.078,
    grouserHeight: 0.035, shoulderHeight: 0.008,
    webHeight: 0.046, webDepth: 0.64, hornHeight: 0.18,
    pinStyle: 'end-caps', pinRadius: 0.038,
  }),
  'early-cast-steel': Object.freeze({
    label: 'cast-steel block shoe',
    surface: 'cast-block', padCoverage: 0.93, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.050, webDepth: 0.66, hornHeight: 0.20,
    pinStyle: 'end-caps', pinRadius: 0.040,
  }),
  'soviet-single-pin': Object.freeze({
    label: 'single-pin chevron shoe',
    surface: 'chevron', padCoverage: 0.92, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.044, webDepth: 0.62, hornHeight: 0.19,
    pinStyle: 'end-caps', pinRadius: 0.018,
  }),
  'nato-double-pin': Object.freeze({
    label: 'paired-pad double-pin shoe',
    surface: 'paired-pad', padCoverage: 0.92, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.044, webDepth: 0.64, hornHeight: 0.18,
    pinStyle: 'end-caps', pinRadius: 0.033,
  }),
  'merkava-heavy': Object.freeze({
    label: 'heavy chevron double-pin shoe',
    surface: 'heavy-chevron', padCoverage: 0.95, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.050, webDepth: 0.68, hornHeight: 0.22,
    pinStyle: 'end-caps', pinRadius: 0.038,
  }),
  'compact-ifv': Object.freeze({
    label: 'fine-pitch IFV shoe',
    surface: 'fine-rib', padCoverage: 0.91, padHeight: 0.060,
    grouserHeight: 0.032, shoulderHeight: 0.006,
    webHeight: 0.040, webDepth: 0.60, hornHeight: 0.16,
    pinStyle: 'end-caps', pinRadius: 0.028,
  }),
  'hydropneumatic-dead-track': Object.freeze({
    label: 'compact dead-track block shoe',
    surface: 'dead-track', padCoverage: 0.94, padHeight: 0.060,
    grouserHeight: 0.020, shoulderHeight: 0.003,
    webHeight: 0.046, webDepth: 0.70, hornHeight: 0.17,
    pinStyle: 'end-caps', pinRadius: 0.034,
  }),
  'siege-wide': Object.freeze({
    label: 'wide siege traction shoe',
    surface: 'heavy-chevron', padCoverage: 0.96, padHeight: 0.084,
    grouserHeight: 0.038, shoulderHeight: 0.009,
    webHeight: 0.052, webDepth: 0.72, hornHeight: 0.23,
    pinStyle: 'end-caps', pinRadius: 0.042,
  }),
});

export const TRACK_PATTERN_IDS = Object.freeze(Object.keys(TRACK_PATTERN_DEFINITIONS));

const FAMILY_RULES = Object.freeze([
  [/(?:^|_)t95(?:$|_)/, 'siege-wide'],
  [/(?:tiger1|panther_g|jpz_e100|sturmtiger)/, 'interleaved-cleat'],
  [/(?:m4a3e8|t34_85|kv2|isu152|isu122s)/, 'early-cast-steel'],
  [/(?:udes03|strv103a|strv103)(?:$|_)/, 'hydropneumatic-dead-track'],
  [/(?:m2a2_bradley|m3a3_bradley|m2a3_bradley|spz_puma|marder1a3|fv510|bwp1|upior|bmp2|bmp3|type89|bmpt)/, 'compact-ifv'],
  [/(?:merkava)/, 'merkava-heavy'],
  [/(?:t62|t64|t72|t80|t84|t90|pt91|type59|ztz85|type99|ztz99|t14|ua_t)/, 'soviet-single-pin'],
]);

/** Resolve one stable shoe construction for a vehicle's complete track train. */
export function trackPatternFor(spec, wheelPattern = null, override = null) {
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
