// Round 70 (2026-09-25, the owner-approved Whiteout snow re-grade): whiteout.ts authors its sourced snow multiplier
// (splat.sourcedTint) and the stepped fallback law on its splat line, with a file-local clamp01 above the export; its
// own postExposure rides the sky line, whose tail lives in the round-47 pair (round47MapPresentation.test-support.mjs).
// Material and presentation authoring never feed relief, so the byte receipt (badlandsRelief.selftest) authenticates
// each exact current block and projects it back to the text the historical digest was taken from — the round-47 /
// round-66 pattern. A later edit to one of these blocks must update its pair (the receipt fails loudly on a block it
// no longer finds exactly once).
import assert from 'node:assert/strict';

export const ROUND70_SNOW_REGRADE_EDITS = {
 "whiteout.ts": [
  [
   "const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);\n",
   ""
  ],
  [
   "  // round 70 (owner 2026-09-25: yes to the Whiteout snow re-grade). Round 44's law — the lit snow must leave the tonemap\n  // shoulder below the capped sky — reaches the snow that RENDERS here: winter's round-48 grassTone step grades the\n  // procedural fallback only, the sourced Snow010A rendered untinted on both winter maps (applySourcedTerrain reads the\n  // splat for its palette id and mudRough alone). The photo snow's albedo takes a neutral-cold multiplier, the fallback\n  // law steps by the same factor (L 0.52 + 0.32·l → 0.46 + 0.28·l), postExposure 0.86 → 0.83 in the sky block below.\n  // Skyline metric and the snow boxes in the round-70 section of docs/MAP-BEAUTIFICATION.md.\n  splat: { sourcedPalette: 'winter', ...winter.splat,\n    sourcedTint: { G: [0.88, 0.885, 0.895] },\n    grassTone: (h: number, s: number, l: number) => [0.575, 0.03, clamp01(0.46 + l * 0.28)], // snowpack fallback\n    iceDrift: 0.3,",
   "  splat: { sourcedPalette: 'winter', ...winter.splat, iceDrift: 0.3,"
  ]
 ]
};

export function historicalRound70SnowRegradeSource(source, file) {
  const pairs = ROUND70_SNOW_REGRADE_EDITS[file];
  if (!pairs) return source;
  for (const [current, historical] of pairs) {
    assert.equal(source.split(current).length, 2, `${file}: one exact round-70 snow re-grade block`);
    source = source.replace(current, historical);
  }
  return source;
}
