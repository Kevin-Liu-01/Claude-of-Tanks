// Deterministic fleet suspension vocabulary.
//
// Track profiles own wheel stations and travel. This module resolves how the
// hull mechanically reaches those stations so every procedural vehicle shows
// a suspension connection without reviving per-profile swing-arm switches.

import type { RuntimeValue } from '../runtimeTypes.ts';
import { tankSeedId } from './tankIdAliases.ts';

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
} as const);

export type SuspensionPatternId = keyof typeof SUSPENSION_PATTERN_DEFINITIONS;
type SuspensionPatternDefinition = typeof SUSPENSION_PATTERN_DEFINITIONS[SuspensionPatternId];
export type SuspensionPattern = Readonly<{
  id: SuspensionPatternId;
} & SuspensionPatternDefinition>;

interface SuspensionPatternSpec {
  id?: RuntimeValue;
}

interface WheelPatternReference {
  id?: RuntimeValue;
}

export const SUSPENSION_PATTERN_IDS = Object.freeze(
  Object.keys(SUSPENSION_PATTERN_DEFINITIONS) as SuspensionPatternId[]);

const FAMILY_RULES: ReadonlyArray<readonly [RegExp, SuspensionPatternId]> = Object.freeze([
  [/(?:^|_)(?:m1a1|m1a2|m1a3|abramsx|ua_m1a1)(?:$|_)/, 'abrams-torsion-arm'],
  [/^(?:t64bv1|ua_t64bv|t64bm1m|t64bv|t64b1v_2022|pt64_tur)$/, 't64-torsion-arm'],
  [/(?:^|_)(?:centurion3|centurion5|strv81|strv105|chieftain5|chieftain_mk10)(?:$|_)/,
    'paired-bogie'],
  // Hydro lane 274 (owner 2026-11-20, "all pneumatic suspension tanks"): the Challenger 2/3 marks, Leclercs, Type 90B,
  // Osorios and the Redback run hydropneumatic or hydrogas gear and took the torsion arm until then.
  [/(?:^|_)(?:mbt70|strv103[a-z]?|strv152|udes03|stb1|type74|type90|type90a|type90b|type10|type10b|pl01|k1a1|k2|k2b|challenger1|challenger2|challenger2e|fv4034|challenger_3|challenger_3x|challenger3_td|challenger_x|challenger_x_sleek|leclerc|amx56|osorio_p1|osorio_p2|ee_t3_osorio|ee_t4_osorio|redback)(?:$|_)/,
    'hydropneumatic-link'],
]);

/**
 * How a hydropneumatic station carries its spring (hydro lane 274): an external strut between the arm and a hull
 * bracket (MBT-70, STB-1/Type 74, Strv 103/UDES, Leclerc, Osorio), an in-arm unit housed along the arm (K1/K2, Type 90,
 * Type 10, Redback, PL-01), or a hydrogas unit fixed to the hull at the arm pivot (every Challenger).
 */
export type HydraulicUnitKind = 'external-strut' | 'in-arm' | 'hydrogas';
export type HydraulicUnitStyle = Readonly<{
  kind: HydraulicUnitKind;
  /** Front-to-rear station ranks that carry a hydraulic unit; negative counts from the rear. Null: every station. */
  ranks: readonly number[] | null;
}>;

const HYDRAULIC_UNIT_RULES: ReadonlyArray<readonly [RegExp, HydraulicUnitStyle]> = Object.freeze([
  [/^(?:challenger|ua_challenger|fv4034)/, Object.freeze({ kind: 'hydrogas', ranks: null })],
  // K1 hybrid: hydropneumatic first, second and last stations, torsion bars between
  [/^k1/, Object.freeze({ kind: 'in-arm', ranks: Object.freeze([0, 1, -1]) })],
  // Type 90 hybrid: the two front and two rear stations are hydropneumatic
  [/^type90/, Object.freeze({ kind: 'in-arm', ranks: Object.freeze([0, 1, -2, -1]) })],
  [/^(?:k2|type10|redback|pl01)/, Object.freeze({ kind: 'in-arm', ranks: null })],
] as const);
const EXTERNAL_STRUT: HydraulicUnitStyle = Object.freeze({ kind: 'external-strut', ranks: null });

/** The hydraulic unit style of a hull on the hydropneumatic pattern; null for every other pattern. */
export function hydraulicUnitStyleFor(
  spec: SuspensionPatternSpec | null | undefined, pattern: Pick<SuspensionPattern, 'id'>,
): HydraulicUnitStyle | null {
  if (pattern.id !== 'hydropneumatic-link') return null;
  const id = tankSeedId(String(spec?.id || '')).toLowerCase();
  for (const [matcher, style] of HYDRAULIC_UNIT_RULES) if (matcher.test(id)) return style;
  return EXTERNAL_STRUT;
}

/** Whether a station (front-to-rear rank of `count`) carries a hydraulic unit under a style. */
export function hydraulicStationCarriesUnit(style: HydraulicUnitStyle, rank: number, count: number): boolean {
  if (!style.ranks) return true;
  return style.ranks.some((r) => (r < 0 ? count + r : r) === rank);
}

/** Resolve one stable hull-to-wheel suspension layout for a complete gear unit. */
export function suspensionPatternFor(
  spec: SuspensionPatternSpec | null | undefined,
  wheelPattern: WheelPatternReference | null = null,
  override: SuspensionPatternId | null = null,
): SuspensionPattern {
  if (override != null) {
    const definition = SUSPENSION_PATTERN_DEFINITIONS[override];
    if (!definition) throw new Error(`Unknown suspension pattern: ${override}`);
    return Object.freeze({ id: override, ...definition });
  }

  // The family rules read the schema-1 id vocabulary (tankIdAliases.ts): a rename never changes a hull's suspension.
  const id = tankSeedId(String(spec?.id || '')).toLowerCase();
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
