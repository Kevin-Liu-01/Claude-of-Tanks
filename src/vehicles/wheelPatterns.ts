// Deterministic fleet wheel-family vocabulary.
//
// The geometry factory consumes these records; keeping the selection pure
// makes it possible to prove full-roster coverage under Node without a DOM or
// renderer. Patterns describe mechanical face construction, not paint. Wheel
// paint continues to come from the active camouflage material.
//
// Selection (owner 2026-09-22, "standardize our wheels across NATIONS"): every
// standardized or donor hull takes the pattern of its nation wheel donor from
// nationWheelSets.ts; only the period hulls that keep their own constructions
// still resolve through the family rules below. The former per-family regex
// table and the hashed nation fallbacks left with that change.

import type { RuntimeValue } from '../runtimeTypes.ts';
import { resolveNationWheel } from './nationWheelSets.ts';

export const WHEEL_PATTERN_DEFINITIONS = Object.freeze({
  'christie-six': Object.freeze({
    label: 'six-window Christie disc', motif: 'perforated', fasteners: 8,
    pockets: 6, idlerHoles: 8, endFasteners: 8, rollerHub: 0.44,
  }),
  'interleaved-dish': Object.freeze({
    label: 'deep interleaved pressed dish', motif: 'deep-dish', fasteners: 16,
    pockets: 0, idlerHoles: 8, endFasteners: 12, rollerHub: 0.42,
  }),
  'cast-five-spoke': Object.freeze({
    label: 'five-spoke cast wheel', motif: 'spoke', fasteners: 10,
    pockets: 5, idlerHoles: 5, endFasteners: 10, rollerHub: 0.50,
  }),
  'pressed-six': Object.freeze({
    label: 'six-rib pressed wheel', motif: 'rib', fasteners: 6,
    pockets: 6, idlerHoles: 6, endFasteners: 8, rollerHub: 0.46,
  }),
  'pressed-eight': Object.freeze({
    label: 'eight-rib pressed wheel', motif: 'rib', fasteners: 8,
    pockets: 8, idlerHoles: 8, endFasteners: 10, rollerHub: 0.45,
  }),
  'split-rim-ten': Object.freeze({
    label: 'ten-fastener split rim', motif: 'split-rim', fasteners: 10,
    pockets: 0, idlerHoles: 10, endFasteners: 10, rollerHub: 0.52,
  }),
  // Leopard 2 family: a plain dished steel disc with a bolt ring and a proud
  // hub, no spokes or pockets. The former eight-rib 'radial-eight' motif read
  // as a spoked perforated wheel on every Leopard-hull study and no longer
  // has a fleet owner, so it left the authored vocabulary (2026-09-11).
  'plain-dish-twelve': Object.freeze({
    label: 'twelve-fastener plain dished wheel', motif: 'plain-dish', fasteners: 12,
    pockets: 0, idlerHoles: 8, endFasteners: 12, rollerHub: 0.50,
  }),
  'scalloped-six': Object.freeze({
    label: 'six-pocket scalloped wheel', motif: 'scalloped', fasteners: 6,
    pockets: 6, idlerHoles: 6, endFasteners: 8, rollerHub: 0.50,
  }),
  'flanged-twelve': Object.freeze({
    label: 'twelve-fastener flanged wheel', motif: 'flanged', fasteners: 12,
    pockets: 0, idlerHoles: 10, endFasteners: 12, rollerHub: 0.55,
  }),
  'deep-dish-eight': Object.freeze({
    label: 'eight-fastener deep dish', motif: 'deep-dish', fasteners: 8,
    pockets: 0, idlerHoles: 8, endFasteners: 10, rollerHub: 0.47,
  }),
  'armored-hub-six': Object.freeze({
    label: 'six-fastener armored hub', motif: 'armored-hub', fasteners: 6,
    pockets: 0, idlerHoles: 6, endFasteners: 8, rollerHub: 0.60,
  }),
  'solid-bogie-six': Object.freeze({
    label: 'six-spoke solid bogie wheel', motif: 'solid-spoke', fasteners: 6,
    pockets: 6, idlerHoles: 6, endFasteners: 6, rollerHub: 0.48,
  }),
} as const);

export type WheelPatternId = keyof typeof WHEEL_PATTERN_DEFINITIONS;
type WheelPatternDefinition = typeof WHEEL_PATTERN_DEFINITIONS[WheelPatternId];
export type WheelPattern = Readonly<{ id: WheelPatternId } & WheelPatternDefinition>;

interface WheelPatternSpec {
  id?: RuntimeValue;
  nation?: RuntimeValue;
  era?: RuntimeValue;
  role?: RuntimeValue;
}

export const WHEEL_PATTERN_IDS = Object.freeze(
  Object.keys(WHEEL_PATTERN_DEFINITIONS) as WheelPatternId[],
);

// Period constructions (owner exception list 2026-09-22): the pre-1950 hulls keep
// their era's wheel family instead of their nation's modern donor.
const PERIOD_RULES: ReadonlyArray<readonly [RegExp, WheelPatternId]> = Object.freeze([
  [/(?:^|_)kv2(?:$|_)/, 'christie-six'],
  // jpz_e100_x keeps the interleaved dish its retired donor authored (2026-09-23).
  [/jpz_e100/, 'interleaved-dish'],
]);

function pattern(id: WheelPatternId): WheelPattern {
  return Object.freeze({ id, ...WHEEL_PATTERN_DEFINITIONS[id] });
}

/** Resolve one stable mechanical motif for a vehicle's complete wheel train. */
export function wheelPatternFor(
  spec: WheelPatternSpec | null | undefined,
  _style = 'rubber',
  override: WheelPatternId | null = null,
): WheelPattern {
  if (override != null && !WHEEL_PATTERN_DEFINITIONS[override]) {
    throw new Error(`Unknown wheel pattern: ${override}`);
  }
  const nation = resolveNationWheel(spec);
  if (nation.kind !== 'keep' && nation.pattern) {
    // owner 2026-09-14 ("nation patterns, no per-tank overrides") and 2026-09-22 (nation wheel
    // sets): the table is the only selector for donor and standardized hulls; a profile may only
    // restate it.
    if (override != null && override !== nation.pattern) {
      throw new Error(`${String(spec?.id)}: wheel pattern override ${override} contradicts the nation standard ${nation.pattern}`);
    }
    return pattern(nation.pattern);
  }
  if (override != null) return pattern(override);
  const id = String(spec?.id || '').toLowerCase();
  for (const [matcher, patternId] of PERIOD_RULES) {
    if (matcher.test(id)) return pattern(patternId);
  }
  // Community placeholder hulls and synthetic specs.
  return pattern('split-rim-ten');
}
