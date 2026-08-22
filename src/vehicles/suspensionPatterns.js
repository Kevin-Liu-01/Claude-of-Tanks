// Deterministic fleet suspension vocabulary.
//
// Track profiles own wheel stations and travel. This module resolves how the
// hull mechanically reaches those stations so every procedural vehicle shows
// a suspension connection without reviving per-profile swing-arm switches.

export const SUSPENSION_PATTERN_DEFINITIONS = Object.freeze({
  'torsion-swing-arm': Object.freeze({
    label: 'trailing torsion swing arm',
    kind: 'single', anchorLiftRatio: 0.62, trailRatio: 0.72,
    armHeightRatio: 0.16, armWidthRatio: 0.68,
  }),
  'paired-bogie': Object.freeze({
    label: 'paired-wheel bogie carrier',
    kind: 'paired', anchorLiftRatio: 0.82, trailRatio: 0,
    armHeightRatio: 0.18, armWidthRatio: 0.78,
  }),
  'hydropneumatic-link': Object.freeze({
    label: 'short hydropneumatic swing link',
    kind: 'single', anchorLiftRatio: 0.70, trailRatio: 0.42,
    armHeightRatio: 0.20, armWidthRatio: 0.74,
  }),
});

export const SUSPENSION_PATTERN_IDS = Object.freeze(
  Object.keys(SUSPENSION_PATTERN_DEFINITIONS));

const FAMILY_RULES = Object.freeze([
  [/(?:^|_)(?:m4a3e8|centurion3|centurion5|strv81)(?:$|_)/, 'paired-bogie'],
  [/(?:^|_)(?:strv103|strv103a|udes03|stb1|type74|type90|type90a|type10|type10b|pl01)(?:$|_)/,
    'hydropneumatic-link'],
]);

/** Resolve one stable hull-to-wheel suspension layout for a complete gear unit. */
export function suspensionPatternFor(spec, wheelPattern = null, override = null) {
  if (override != null) {
    const definition = SUSPENSION_PATTERN_DEFINITIONS[override];
    if (!definition) throw new Error(`Unknown suspension pattern: ${override}`);
    return Object.freeze({ id: override, ...definition });
  }

  const id = String(spec?.id || '').toLowerCase();
  for (const [matcher, patternId] of FAMILY_RULES) {
    if (matcher.test(id)) {
      return Object.freeze({
        id: patternId,
        ...SUSPENSION_PATTERN_DEFINITIONS[patternId],
      });
    }
  }

  const patternId = wheelPattern?.id === 'solid-bogie-six'
    ? 'paired-bogie'
    : 'torsion-swing-arm';
  return Object.freeze({
    id: patternId,
    ...SUSPENSION_PATTERN_DEFINITIONS[patternId],
  });
}
