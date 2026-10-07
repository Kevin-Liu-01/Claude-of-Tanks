// horizonPanoramaTown.selftest — the skies lane (2026-10-06, mr1's Suzhou Creek: "a hazy, built-up delta skyline past the
// levee"): the panorama's city edge. Pins: the knobs (off on every map unless it authors them), the height pass's law (blocks
// on a turned grid with the streets between, districts by a broad field, towers and chimneys in a share of the blocks, from a
// distance out; the cover written negative in the peaks' channel, the output line the bake contract pins kept), the strip's
// roofs and walls over that cover, and that every reader of the peaks' channel thresholds it (a negative cover bares no peak).
// No GPU or art claim.
import assert from 'node:assert/strict';
import { HORIZON_PANORAMA_SHADERS, resolveHorizonPanoramaCharacter } from './horizonPanorama.ts';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';

// 1. the knobs: off unless a map authors them
for (const c of ['rolling', 'alpine', 'coastal', 'mesa', 'polar', 'volcanic']) {
  const ch = resolveHorizonPanoramaCharacter(c);
  assert.equal(ch.townM, 0, `${c}: no town by default`);
  assert.ok(ch.townShare > 0 && ch.townShare <= 1 && ch.townTowers >= 0 && ch.townTowers < 0.5 && ch.townFromM >= 1500, `${c}: sane defaults`);
}
const towns = MAP_IDS.filter((id) => {
  const pano = getMapConfig(id).horizon?.panorama;
  return pano && typeof pano === 'object' && (pano.townM ?? 0) > 0;
});
const ch = resolveHorizonPanoramaCharacter('coastal', { regional: 'plain', townM: 12, townShare: 0.55, townTowers: 0.06, townFromM: 1800 });
assert.deepEqual([ch.townM, ch.townShare, ch.townTowers, ch.townFromM], [12, 0.55, 0.06, 1800], 'a map\'s town knobs win');

// 2. the height pass
const H = HORIZON_PANORAMA_SHADERS.height, S = HORIZON_PANORAMA_SHADERS.strip;
for (const [needle, what] of [
  ['uniform vec4 uTown;', 'the town knobs reach the height pass'],
  ['if (uTown.x > 0.0) {', 'a map without a town skips the block'],
  ['vec2 q = vec2(bu / 78.0, bv / 56.0);', 'blocks of ~78 x 56 m on a turned grid'],
  ['float town = lot * district * smoothstep(uTown.w, uTown.w + 600.0, length(p));', 'streets, districts, from a distance out'],
  ['float spire = step(1.0 - uTown.z, hash12(cell + vec2(11.7, 2.3))) * core * uTown.x * (2.0 + 3.0 * hash12(cell + vec2(5.5, 1.1)));', 'towers and chimneys in a share of the blocks'],
  ['if (town > 0.01) gPeak = -town;', 'the cover written negative in the peaks\' channel'],
  ['vec4(h, gPlinth, gTree, gPeak)', 'the bake contract\'s output line kept'],
]) assert.ok(H.includes(needle), what);

// 3. the strip: roofs and walls over the cover; every reader of the peaks' channel thresholds it
assert.ok(S.includes('float townW = clamp(-texture2D(uHeight, g).a, 0.0, 1.0);'), 'the strip decodes the town');
assert.ok(S.includes('col = mix(col, mix(wallT, roof, smoothstep(0.7, 0.92, n.y)), townW);'), 'roofs on the tops, walls on the faces');
const alphaReads = S.match(/texture2D\(uHeight, g\)\.a[^;]*/g) ?? [];
assert.ok(alphaReads.length >= 4, 'the strip reads the peaks\' channel');
assert.ok(S.includes('smoothstep(0.08, 0.3, texture2D(uHeight, g).a)') && S.includes('smoothstep(0.3, 0.7, texture2D(uHeight, g).a)')
  && S.includes('texture2D(uHeight, g).a > 0.01'), 'the peaks\' and the jebels\' reads threshold above zero: a town bares nothing');

console.log(`horizonPanoramaTown.selftest: the city edge off by default (${towns.length ? `on ${towns.join(', ')}` : 'no map authors one yet'}), the height pass's blocks, districts and towers written negative in the peaks' channel, the strip's roofs and walls PASS; no GPU/art claim`);
