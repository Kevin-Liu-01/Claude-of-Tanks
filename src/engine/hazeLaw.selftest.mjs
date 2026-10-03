// hazeLaw.selftest — the battlefield's Beer–Lambert aerial perspective (2026-10-03, the skies-and-atmosphere lane).
// The law keeps every authored map's far ranges readable (ridge contrast ≥ 40 % at 2 km on the ground, the mountains
// lane's and the integrator's line) while still separating near, mid and far (each kilometre adds haze: no plateau);
// the layer's path average equals the integral it stands for; the aerial pass runs it only over the physically based sky
// (the mobile tier's legacy law is untouched), a closed deck dims its in-scatter target, and the materials' fog keeps only
// a share of its old share on that path. The clouds keep their own law (volumetricClouds.ts CLOUD_AERIAL): the labs showed
// this law's slant through the layer washing a low deck's structure toward the horizon's white.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  HAZE_EXT_CHROMA, HAZE_LAW_GLSL, HAZE_LAYER_SCALE_M, HAZE_MATERIAL_FOG_SHARE, HAZE_OVERCAST_K, HAZE_SIGMA_PER_FOG,
  HAZE_TARGET_SKY_K, HAZE_TINT_SHARE, hazeLayerInverseScale, hazeSigma, hazeTargetTerms,
} from './hazeLaw.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';

const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

// ---- the constants
assert.ok(HAZE_SIGMA_PER_FOG > 0.2 && HAZE_SIGMA_PER_FOG < 0.8, 'σ per unit of fogDensity');
assert.ok(HAZE_LAYER_SCALE_M >= 300 && HAZE_LAYER_SCALE_M <= 2000, 'a boundary-layer scale height');
near(0.2126 * HAZE_EXT_CHROMA[0] + 0.7152 * HAZE_EXT_CHROMA[1] + 0.0722 * HAZE_EXT_CHROMA[2], 1, 0.02, 'the chroma keeps σ as the luminance extinction');
assert.ok(HAZE_EXT_CHROMA[2] > HAZE_EXT_CHROMA[1] && HAZE_EXT_CHROMA[1] > HAZE_EXT_CHROMA[0], 'aerosol haze dims blue faster than red');
assert.ok(HAZE_TINT_SHARE >= 0 && HAZE_TINT_SHARE <= 1 && HAZE_TARGET_SKY_K > 0.6 && HAZE_TARGET_SKY_K <= 1, 'the target');
assert.ok(HAZE_MATERIAL_FOG_SHARE >= 0 && HAZE_MATERIAL_FOG_SHARE < 0.5, 'the materials keep a minor share of their fog');
assert.ok(HAZE_OVERCAST_K > 0.2 && HAZE_OVERCAST_K < 1, 'a closed deck dims the in-scatter target, never to black');
assert.equal(hazeSigma(0), 0);
assert.equal(hazeSigma(Number.NaN), 0, 'a missing fogDensity hazes nothing');
near(hazeSigma(0.001), 0.001 * HAZE_SIGMA_PER_FOG, 1e-12, 'σ scales the authored air');
near(hazeLayerInverseScale(), 1 / HAZE_LAYER_SCALE_M, 1e-12, 'the layer');

// ---- the GLSL, modelled exactly
const layerMean = (a0, a1) => (Math.abs(a0 - a1) < 1e-3 ? Math.exp(-0.5 * (a0 + a1)) : (Math.exp(-a1) - Math.exp(-a0)) / (a0 - a1));
assert.match(HAZE_LAW_GLSL, /float hazeLayerMean\( float a0, float a1 \) \{\s*return abs\( a0 - a1 \) < 1e-3 \? exp\( -0\.5 \* \( a0 \+ a1 \) \) : \( exp\( -a1 \) - exp\( -a0 \) \) \/ \( a0 - a1 \);\s*\}/);
assert.match(HAZE_LAW_GLSL, /vec3 hazeTransmittance\( float sigma, float d, float layerMean, vec3 chroma \) \{\s*return exp\( -\( sigma \* d \* layerMean \) \* chroma \);\s*\}/);
// the path average equals the integral of exp(-y / H) along a straight path between the two heights
for (const [y0, y1] of [[0, 0], [0, 300], [300, 0], [6, 420], [300, 1400], [2, 9500]]) {
  const H = HAZE_LAYER_SCALE_M, n = 20000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.exp(-(y0 + (y1 - y0) * (i + 0.5) / n) / H);
  near(layerMean(y0 / H, y1 / H), sum / n, 1e-4, `layer mean ${y0} -> ${y1} m`);
}
assert.equal(layerMean(0, 0), 1, 'the datum density is 1');

// ---- every authored map: readable at 2 km, separated from 0.5 to 3 km
const files = { titan_gorge: 'titanGorge', copper_mesa: 'copperMesa' };
const T = (sigma, d, y0 = 6, y1 = 40) => Math.exp(-sigma * d * layerMean(y0 / HAZE_LAYER_SCALE_M, y1 / HAZE_LAYER_SCALE_M));
let checked = 0;
for (const id of MAP_IDS) {
  const config = (await import(pathToFileURL(new URL(`../world/maps/${files[id] ?? id}.ts`, import.meta.url).pathname).href)).default;
  const fog = config.sky?.fogDensity ?? 0.00074;
  const sigma = hazeSigma(fog);
  if (!(sigma > 0)) continue; // the airless moon
  checked++;
  const t2 = T(sigma, 2000);
  assert.ok(t2 >= 0.4, `${id}: a ridge 2 km out keeps ${t2.toFixed(2)} of its contrast (>= 0.40)`);
  // separation: each step out adds haze (no plateau) — 0.5, 1, 2, 3 km
  const ts = [500, 1000, 2000, 3000].map((d) => T(sigma, d));
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i - 1] - ts[i] > 0.02, `${id}: ${[500, 1000, 2000, 3000][i]} m hazier than the step before`);
  // the gameplay band stays clear: 300 m keeps >= 85 %
  assert.ok(T(sigma, 300) >= 0.85, `${id}: the 300 m aim band keeps its colour`);
}
assert.ok(checked >= 30, `the authored maps (${checked})`);

// ---- the wiring: the aerial pass (only over the physically based sky), the clouds, the materials' fog
const post = here('./post.ts'), sky = here('./sky.ts'), clouds = here('./volumetricClouds.ts');
assert.match(post, /bool hazeLaw = uAtmo > 0\.5 && uHazeLaw\.x > 0\.0;/, 'the law runs over the physically based sky only');
assert.match(post, /vec3 trans = hazeTransmittance\( sig, rayT, hazeLayerMean\( hzY0 \* uHazeLaw\.y, hzY1 \* uHazeLaw\.y \), uHazeChroma \);\s*texel\.rgb = texel\.rgb \* trans \+ hazeCol \* \( 1\.0 - trans \);/);
assert.match(post, /float hzD = max\( -viewZ - 85\.0, 0\.0 \);/, 'the legacy law stays for the mobile tier');
assert.match(post, /law\.set\(\s*hazeSigma\(atmosphere\.fogDensity\),\s*hazeLayerInverseScale\(\),/, 'σ from the map\'s air, every frame');
assert.match(post, /\(u\.uHazeLaw\.value as THREE\.Vector4\)\.x = 0;/, 'the legacy dome switches the law off');
assert.match(post, /\* \( hazeLaw \? uDetailW : 1\.0 \)/, 'the green hue clamp keeps only its sniper-scope share on the law');
assert.match(sky, /atmosphereState\.fogDensity = preset\.fogDensity;/, 'the sky publishes the map\'s air');
assert.match(sky, /\* \(atmosphereState\.active \? lightTune\('AERIAL_MATERIAL_FOG_SHARE', HAZE_MATERIAL_FOG_SHARE\) : 1\)\);/, 'the materials\' fog thins only over the physically based sky');
// the target's two terms under the light model's overcast, shared by the aerial pass and the cloud trace (2026-10-03, the
// gauntlet's wave 17 on Frosthollow: the deck's far rows paled to the clear horizon over ranges on the dim overcast haze)
assert.match(post, /const terms = hazeTargetTerms\(overcast, hazeTermsScratch\);\s*law\.set\(hazeSigma\(atmosphere\.fogDensity\), hazeLayerInverseScale\(\), terms\.x, terms\.y\);/,
  'the light model\'s overcast dims the target');
{
  const open = hazeTargetTerms(0, { x: 0, y: 0 }), closed = hazeTargetTerms(1, { x: 0, y: 0 }), half = hazeTargetTerms(0.5, { x: 0, y: 0 });
  assert.equal(open.x, HAZE_TINT_SHARE); assert.equal(open.y, HAZE_TARGET_SKY_K);
  assert.equal(closed.x, 1, 'all of the authored tint under a closed deck');
  assert.ok(Math.abs(closed.y - HAZE_TARGET_SKY_K * HAZE_OVERCAST_K) < 1e-12, 'the deck\'s level');
  assert.ok(half.x > open.x && half.x < 1 && half.y < open.y && half.y > closed.y, 'between them under half a deck');
  const out = { x: 0, y: 0 }; assert.equal(hazeTargetTerms(0.3, out), out, 'written in place');
  assert.match(clouds, /const terms = hazeTargetTerms\(overcast, this\.hazeTerms\);/, 'the cloud trace reads the same terms');
  assert.match(clouds, /\(a\.fogMix \?\? 0\) \* terms\.x\)\), terms\.y, 0, smoothstep01\(overcast \/ 0\.3\)\);/, 'its share by the map\'s fogMix, its weight by the overcast');
  assert.match(clouds, /vec3 law = mix\( target, uOvercastTint \* \( luma\( target \) \/ max\( luma\( uOvercastTint \), 1e-4 \) \), uOvercastHaze\.x \) \* uOvercastHaze\.y;/,
    'the pass\'s target: the tint\'s hue at the sky\'s luminance, a level under it');
}
assert.doesNotMatch(clouds, /HAZE_LAW_GLSL|hazeSigma/, 'the clouds keep their own haze law (CLOUD_AERIAL)');

// 2026-10-03 (the gauntlet's wave 13, Frosthollow: "the warm horizon band dims a step"): the target's blue-grey guard
// catches a greenish cast only, and half the legacy warm lobe stays toward the sun
assert.match(post, /if \( target\.g > target\.b && target\.g > target\.r \) \{/, 'a warm target keeps its warmth');
assert.match(post, /target \*= mix\( vec3\( 1\.0 \), vec3\( \$\{AERIAL_WARM_TINT\[0\]\.toFixed\(3\)\}, \$\{AERIAL_WARM_TINT\[1\]\.toFixed\(3\)\}, \$\{AERIAL_WARM_TINT\[2\]\.toFixed\(3\)\} \), \$\{HAZE_LAW_WARM_LOBE\.toFixed\(2\)\} \* sunAmt \);/,
  'the forward-scatter warm lobe');
assert.match(post, /const HAZE_LAW_WARM_LOBE = 0\.5;/);
{
  // the guard, modelled: a warm low sky toward the sun (r > g > b) passes; a greenish cast (g over r and b) is pulled
  const guard = (t) => t[1] > t[2] && t[1] > t[0];
  assert.equal(guard([1.0, 0.95, 0.85]), false, 'the warm horizon passes');
  assert.equal(guard([0.80, 0.90, 0.85]), true, 'a green cast is caught');
}
console.log(`hazeLaw.selftest: Beer–Lambert law (σ ${HAZE_SIGMA_PER_FOG} × fogDensity, layer ${HAZE_LAYER_SCALE_M} m), ${checked} maps readable at 2 km and separated to 3 km, layer integral exact, wiring PASS`);
