// Round 76 (2026-09-26, the deck pass): foundry.ts and railyard.ts re-grade their haze — the aerosol, the fog and a
// warm aerosol absorption for the smog — on their sky lines, now that the volumetric deck carries the overcast (the
// round-65 open note: an overcast is a cloud layer, not a heavy aerosol). Sky authoring never feeds relief, so the byte
// receipt (badlandsRelief.selftest) authenticates each exact current block and projects it back to the text the
// historical digest was taken from — the round-47 / round-70 pattern. A later edit to one of these blocks must update
// its pair (the receipt fails loudly on a block it no longer finds exactly once).
import assert from 'node:assert/strict';

export const ROUND76_DECK_REGRADE_EDITS = {
  'foundry.ts': [
    [
      "    // round 76 (2026-09-26, the deck pass): the industrial haze comes off the whole frame and onto the deck's base and\n    // the horizon band — the aerosol at half (mie 0.012 -> 0.006: the sun's transmittance rises, the ground's fill with\n    // it), the fog a third thinner and neutral, the smog as the aerosol's warm absorption (mieTintHex: soot and dust\n    // scatter blue least), the bird view no longer a grey wash\n    mieCoefficient: 0.006, mieDirectionalG: 0.88, fogDensity: 0.00052,\n    fogTintHex: 0x858384, fogMix: 0.45, envIntensity: 0.22,\n    atmosphere: { mieTintHex: 0xd2b28c },\n",
      '    mieCoefficient: 0.012, mieDirectionalG: 0.88, fogDensity: 0.00074,\n    fogTintHex: 0x788286, fogMix: 0.64, envIntensity: 0.22,\n',
    ],
  ],
  'railyard.ts': [
    [
      "    // round 76 (2026-09-26, the deck pass): the flat overcast is the deck's now — the fog (the fleet's heaviest) a\n    // quarter thinner and mixed less toward its grey, so the far yard keeps its contrast under the closed deck\n    fogDensity: 0.00060, fogTintHex: 0x9aa0a6, fogMix: 0.72, envIntensity: 0.30,\n",
      '    fogDensity: 0.00080, fogTintHex: 0x9aa0a6, fogMix: 0.9, envIntensity: 0.30,\n',
    ],
  ],
  // the brief's vegetation note: Saltmere Bay's shore palms stood beside maritime pines and cedars — the species list
  // and the lone mix drop the palm (one rng draw per lone tree whatever the mix: the placements stay), its palette with it
  'coastal.ts': [
    [
      "    // round 76 (2026-09-26): no palm beside the maritime pines and cedars — a species mismatch on a temperate shore\n    species: ['pine', 'cedar', 'oak'],\n    clusterMix: [['pine', 0.48], ['cedar', 0.32], ['oak', 0.20]],\n    loneMix: [['pine', 0.38], ['cedar', 0.31], ['oak', 0.31]],\n",
      "    species: ['pine', 'cedar', 'oak', 'palm'],\n    clusterMix: [['pine', 0.48], ['cedar', 0.32], ['oak', 0.20]],\n    loneMix: [['pine', 0.30], ['cedar', 0.25], ['oak', 0.25], ['palm', 0.20]],\n",
    ],
    [
      '      oak: { // salt-pruned coastal scrub\n',
      "      // shore palms: real green (the desert palette's dusty olive would read\n      // dead against the bay), still desaturated enough to sit in the grade\n      palm: {\n        texTone: (h: number, s: number, l: number) => [clamp01(h), clamp01(s * 0.85), clamp01(l * 0.95)],\n        cardHue: 0.25, cardSat: 0.30,\n        frond: { hue: 0.25, sat: 0.30, l: 0.36 },\n        canopy: { hue: 0.26, sat: 0.28, l0: 0.28, l1: 0.44 },\n      },\n      oak: { // salt-pruned coastal scrub\n",
    ],
  ],
};

export function historicalRound76DeckRegradeSource(source, file) {
  const pairs = ROUND76_DECK_REGRADE_EDITS[file];
  if (!pairs) return source;
  for (const [current, historical] of pairs) {
    assert.equal(source.split(current).length, 2, `${file}: one exact round-76 deck re-grade block`);
    source = source.replace(current, historical);
  }
  return source;
}
