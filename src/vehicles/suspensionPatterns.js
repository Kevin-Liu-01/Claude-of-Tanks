// Deterministic fleet suspension vocabulary.
//
// Track profiles own wheel stations and travel. This module resolves how the
// hull mechanically reaches those stations so every procedural vehicle shows
// a suspension connection without reviving per-profile swing-arm switches.

export const SUSPENSION_PATTERN_DEFINITIONS = Object.freeze({
  'torsion-swing-arm': Object.freeze({
    label: 'tapered trailing torsion swing arm',
    kind: 'single', anchorLiftRatio: 0.82, trailRatio: 1.05,
    armHeightRatio: 0.18, armWidthRatio: 0.58,
    jointRadiusRatio: 0.17, jointWidthRatio: 0.72,
    armSegments: 8, wheelEndTaper: 0.72,
  }),
  'abrams-torsion-arm': Object.freeze({
    label: 'Abrams heavy forged trailing arm',
    kind: 'single', anchorLiftRatio: 0.88, trailRatio: 1.10,
    armHeightRatio: 0.22, armWidthRatio: 0.70,
    jointRadiusRatio: 0.21, jointWidthRatio: 0.82,
    armSegments: 8, wheelEndTaper: 0.68,
  }),
  't64-torsion-arm': Object.freeze({
    label: 'T-64 exposed forged trailing arm',
    kind: 'single', anchorLiftRatio: 0.92, trailRatio: 1.12,
    armHeightRatio: 0.24, armWidthRatio: 0.82,
    jointRadiusRatio: 0.22, jointWidthRatio: 0.86,
    armSegments: 10, wheelEndTaper: 0.70,
  }),
  'paired-bogie': Object.freeze({
    label: 'paired-wheel cast bogie yoke',
    kind: 'paired', anchorLiftRatio: 1.08, trailRatio: 0,
    armHeightRatio: 0.22, armWidthRatio: 0.72,
    jointRadiusRatio: 0.23, jointWidthRatio: 0.88,
    armSegments: 8, wheelEndTaper: 0.78,
  }),
  'hydropneumatic-link': Object.freeze({
    label: 'rounded hydropneumatic rocker link',
    kind: 'single', anchorLiftRatio: 1.04, trailRatio: 0.62,
    armHeightRatio: 0.22, armWidthRatio: 0.68,
    jointRadiusRatio: 0.24, jointWidthRatio: 0.82,
    armSegments: 12, wheelEndTaper: 0.76,
  }),
});

export const SUSPENSION_PATTERN_IDS = Object.freeze(
  Object.keys(SUSPENSION_PATTERN_DEFINITIONS));

const FAMILY_RULES = Object.freeze([
  [/(?:^|_)(?:m1a1|m1a2|abramsx|ua_m1a1)(?:$|_)/, 'abrams-torsion-arm'],
  [/^(?:t64bv1|ua_t64bv)$/, 't64-torsion-arm'],
  [/(?:^|_)(?:m4a3e8|centurion3|centurion5|strv81|chieftain5|chieftain_mk10)(?:$|_)/,
    'paired-bogie'],
  [/(?:^|_)(?:mbt70|strv103|strv103a|udes03|stb1|type74|type90|type90a|type10|type10b|pl01|k1a1|k2|k2b|challenger1|challenger2|challenger_3)(?:$|_)/,
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
