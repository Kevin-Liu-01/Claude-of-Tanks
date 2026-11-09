/**
 * Crew lines a pack is known to lack, and nothing else (270, Main's ruling 2026-11-08). Air Support (air-support-270)
 * added eight crew lines to the 17 packs of its day; crew-languages-270 added 21 world packs without them. Generating
 * the 8 x 21 takes (~336 takes, ~26k ElevenLabs credits) waits on the owner (docs: ~/cot-launch-state/streams/TESTS-OWED.md).
 * Until then a crew on one of these packs stays silent for these lines (crewRadio.ts: a pack with no take of a line plays
 * nothing). The completeness receipts (crewRadio.selftest, soundAssets.selftest) excuse exactly this list: any other
 * missing line or pack fails, and a listed take that now exists fails too, so the list shrinks as takes land.
 */
export const CREW_LINE_GAP_LINES = Object.freeze([
  'start_air_support', 'air_call_recon', 'air_call_artillery', 'air_call_strafe', 'air_call_bomb',
  'air_incoming', 'artillery_incoming', 'aircraft_downed',
]);

export const CREW_LINE_GAP_PACKS = Object.freeze([
  'es-ES', 'es-419', 'pt-PT', 'nl', 'no', 'fi', 'el', 'cs', 'hu', 'ro', 'tr',
  'ar', 'fa', 'hi', 'ur', 'bn', 'id-ID', 'ms', 'vi', 'th', 'fil',
]);

/** True when `lang` is known to lack line `id` (the listed lines on the listed packs). */
export function isCrewLineGap(lang, id) {
  return CREW_LINE_GAP_PACKS.includes(lang) && CREW_LINE_GAP_LINES.includes(id);
}
