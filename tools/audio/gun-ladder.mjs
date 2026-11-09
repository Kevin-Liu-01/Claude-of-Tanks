// The calibre ladder (world-sfx-269, 2026-11-04): a bigger bore's close report sits lower — more of its energy under
// LADDER_HZ — than a lighter gun's, by the pair's factor. tools/sfx-smoke.mjs gates its captured scenes on these pairs
// in the browser; tools/audio/loudness-receipt.mjs records each ladder bank's shipped low share (low150) and
// src/audio/sfxLoudness.selftest.mjs holds the pairs on those files' means, so a bank generated or picked out of order
// fails in Node, not on whichever take a browser run draws (the 17 cm boom shipped under the 76 mm on every take).
export const LADDER_HZ = 150;

/** [heavier bank, lighter bank, factor]: the heavier bank's low share exceeds the lighter one's times the factor. */
export const GUN_LADDER = Object.freeze([
  ['gun_152h_close', 'mg_rifle_close', 1.5],
  ['gun_120_close', 'ac_30_close', 1],
  ['gun_170_close', 'gun_76_close', 1],
  ['gun_152h_close', 'gun_90_close', 1],
]);

/** Every bank a ladder pair names. */
export const LADDER_BANKS = Object.freeze([...new Set(GUN_LADDER.flatMap(([heavier, lighter]) => [heavier, lighter]))]);
