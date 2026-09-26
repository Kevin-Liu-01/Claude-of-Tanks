// Round 72 (2026-09-25, owner: "the mountains look so flat and untextured and boring"): Whiteout's horizon block moved
// from the rolling ladder to the polar character on the alpine one (a dated comment and the horizon line). The relief
// never feeds the playable relief or the splat, so the byte receipts that hold a map's authoring against its historical
// source (badlandsRelief) project the block back to its round-49 text before comparing, the way round 71's clouds
// block and round 47's presentation blocks are projected.
import assert from 'node:assert/strict';

const ROUND72_WHITEOUT_HORIZON = [
  "  // round 72 (2026-09-25, owner: \"the mountains look so flat and untextured and boring\"): the polar character on the alpine\n"
  + "  // ladder — the foothill kept low (amp 1.0: at 1.45 the first ridge, a terrain-material face, walled off the ranges)\n"
  + "  // and the polar character's boost standing the ranges behind it to the stratus, snow on the broad faces with rock on\n"
  + "  // the steep ones, the scoured ribs at a third (at 1 they greyed every upper slope to heath), spruce and birch stands\n"
  + "  // on the lower slopes\n"
  + "  horizon: { baseHex: 0xa3b1be, amp: 1.0, style: 'alpine', relief: 'polar', treeline: 0.22, snowline: 0.30, forestHex: 0x536371, rockHex: 0x5b6772, bareRock: 0.35, haze: 0.92, grain: 0.60 },\n",
  "  horizon: { baseHex: 0xa3b1be, amp: 0.72, style: 'rolling', treeline: 0.08, snowline: 0.08, forestHex: 0x536371, rockHex: 0x5b6772, bareRock: 1, haze: 0.92, grain: 0.60 },\n",
];

export function historicalRound72ReliefSource(source, file) {
  if (file !== 'whiteout.ts') return source;
  const [current, historical] = ROUND72_WHITEOUT_HORIZON;
  assert.equal(source.split(current).length, 2, `${file}: one exact round-72 horizon block`);
  return source.replace(current, historical);
}
