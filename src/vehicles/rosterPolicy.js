// Player-facing historical fleet policy.
//
// Source rows and builders remain available as archaeological/reference input,
// but only the owner-approved legacy vehicles below stay in the selectable
// roster. This keeps registration history intact while ensuring garage,
// battles, asset generation and release gates all consume the same policy.

export const RETAINED_WW2_IDS = Object.freeze([
  'tiger1',
  'panther_g',
  'kv2',
  'jpz_e100',
  'sturmtiger',
  'isu122s',
  'isu152',
  'm26_pershing',
  'm45_patton',
  't95',
]);

// The former garage Cold War catalog boundary. Variants intentionally treated
// as modern by that catalog (Abrams, T-80/T-90, post-1991 T-72s, Challengers,
// Merkavas and IFVs) remain in the modern fleet.
export const COLD_WAR_IDS = Object.freeze([
  'm46_patton', 'm47_patton', 'm48', 'm60a1', 'm60a2', 'm60a3',
  'leo1a5',
  't54', 'type59', 't62mv1', 't64bv1', 't72b_1987',
  'centurion3', 'centurion5', 'chieftain5', 'chieftain_mk10', 'vickers_mk1',
  'amx30', 'amx30b2',
  'strv103', 'type74',
  't95',
]);

export const RETAINED_COLD_WAR_IDS = Object.freeze([
  'centurion3', 'centurion5',
  'chieftain5', 'chieftain_mk10',
  'amx30', 'amx30b2',
  'type59', 'type74', 'strv103',
  't64bv1', 'leo1a5',
  'm46_patton', 'm47_patton', 'm48',
  'm60a1', 'm60a2', 'm60a3',
  't95',
]);

const RETAINED_WW2 = new Set(RETAINED_WW2_IDS);
const COLD_WAR = new Set(COLD_WAR_IDS);
const RETAINED_COLD_WAR = new Set(RETAINED_COLD_WAR_IDS);

/** Whether a registered spec is intentionally absent from the live roster. */
export function isRetiredHistoricalTank(spec) {
  if (!spec || !spec.id) return false;
  if (COLD_WAR.has(spec.id)) return !RETAINED_COLD_WAR.has(spec.id);
  return spec.era === 'ww2' && !RETAINED_WW2.has(spec.id);
}

/** Stable policy label for audit output and tooling. */
export function historicalRosterClass(spec) {
  if (!spec || !spec.id) return 'modern';
  if (COLD_WAR.has(spec.id)) return 'coldwar';
  if (spec.era === 'ww2') return 'ww2';
  return 'modern';
}
