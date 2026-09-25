// Round 66 (2026-09-24, the FFT ocean): every water map authors its sea state in an `ocean` block (wind, fetch, swell,
// amplitude, choppiness, foam, breakers, caustics — src/world/oceanSpectrum.ts). Presentation authoring never feeds
// relief, so the byte receipt (badlandsRelief.selftest) authenticates each exact current block and projects it back to
// the text the historical digest was taken from — the round-47 pattern (round47MapPresentation.test-support.mjs). A
// later edit to one of these blocks must update its pair (the receipt fails loudly on a block it no longer finds once).
import assert from 'node:assert/strict';

export const ROUND66_OCEAN_EDITS = {
 "coastal.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): an onshore breeze off the open sea to the east with a little swell behind\n  // it — a real coast, its breakers on the bay's strand; amplitude 0.7 keeps the swell under the jetty deck\n  ocean: { windSpeed: 5.2, windDirDeg: 190, fetchKm: 30, swell: 0.35, swellDirDeg: 185, amplitude: 0.7, choppiness: 0.9, foam: 0.5, breakers: 0.85, caustics: 0.6 },\n",
   ""
  ]
 ],
 "saltwind.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the narrows' westerly runs up the bay from the open sea, a longer swell\n  // under the chop; the surf breaks on the 20 m strand (round 52) and runs up it\n  ocean: { windSpeed: 5.0, windDirDeg: 8, fetchKm: 24, swell: 0.4, swellDirDeg: 5, amplitude: 0.75, choppiness: 0.9, foam: 0.5, breakers: 0.9, caustics: 0.7 },\n",
   ""
  ]
 ],
 "fjord.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): a sheltered fjord — a light air down the arms, a faint swell from the mouth;\n  // the owner's approved look is kept (amplitude 0.45: centimetres, read as the same water from the chase camera)\n  ocean: { windSpeed: 3.2, windDirDeg: 250, fetchKm: 6, swell: 0.1, amplitude: 0.45, choppiness: 0.7, foam: 0.15, breakers: 0.3, caustics: 0.4 },\n",
   ""
  ]
 ],
 "reservoir.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): a highland lake under a light breeze — a fine chop, no whitecaps; the\n  // owner's approved look is kept (amplitude 0.6)\n  ocean: { windSpeed: 3.0, windDirDeg: 150, fetchKm: 3, amplitude: 0.6, foam: 0, breakers: 0.15, caustics: 0.4 },\n",
   ""
  ]
 ],
 "delta.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the river carries only the faintest ripple under a 2.4 m/s air; the\n  // owner's approved look is kept (amplitude 0.55)\n  ocean: { windSpeed: 2.4, windDirDeg: 110, fetchKm: 2, amplitude: 0.55, foam: 0, breakers: 0.05, caustics: 0.3 },\n",
   ""
  ]
 ],
 "monsoon.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the flooded river under the monsoon air — a low ripple, silt hides the bed\n  // so the caustics stay faint; the owner's approved look is kept (amplitude 0.6)\n  ocean: { windSpeed: 2.8, windDirDeg: 200, fetchKm: 2.5, amplitude: 0.6, foam: 0, breakers: 0.05, caustics: 0.2 },\n",
   ""
  ]
 ],
 "autumn.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the river's ripple under a light air off the meadows\n  ocean: { windSpeed: 2.6, windDirDeg: 100, fetchKm: 2, amplitude: 0.6, foam: 0, breakers: 0.05, caustics: 0.35 },\n",
   ""
  ]
 ],
 "polders.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the polders' drained lakes take the sea wind across the flats — a short\n  // steady chop that reads as moving water where the sheet lay flat\n  ocean: { windSpeed: 3.6, windDirDeg: 300, fetchKm: 5, amplitude: 0.9, foam: 0.05, breakers: 0.2, caustics: 0.3 },\n",
   ""
  ]
 ],
 "skybridge.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the mountain lake under the wind funnelled down the gorge — a clear,\n  // lively chop over the spillway reach where the sheet lay flat\n  ocean: { windSpeed: 3.8, windDirDeg: 40, fetchKm: 4, amplitude: 1, foam: 0.1, breakers: 0.25, caustics: 0.55 },\n",
   ""
  ]
 ],
 "mangrove.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): the tidal creeks under a warm air — a slow ripple on tannin-dark water,\n  // little to see of the bed\n  ocean: { windSpeed: 2.6, windDirDeg: 80, fetchKm: 3, amplitude: 0.8, foam: 0, breakers: 0.15, caustics: 0.25 },\n",
   ""
  ]
 ],
 "oasis.ts": [
  [
   "  // round 66 (2026-09-24, the FFT ocean): a still spring pool with a breath of desert wind — clear water over pale\n  // sand, so its caustics are the strongest of the fleet\n  ocean: { windSpeed: 2.8, windDirDeg: 120, fetchKm: 2, amplitude: 0.7, foam: 0, breakers: 0.1, caustics: 0.9 },\n",
   ""
  ]
 ]
};

export function historicalRound66OceanSource(source, file) {
  const pairs = ROUND66_OCEAN_EDITS[file];
  if (!pairs) return source;
  for (const [current, historical] of pairs) {
    assert.equal(source.split(current).length, 2, `${file}: one exact round-66 ocean block`);
    source = source.replace(current, historical);
  }
  return source;
}
