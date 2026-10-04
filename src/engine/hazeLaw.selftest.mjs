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
  HAZE_TARGET_SKY_K, HAZE_TINT_SHARE, hazeExtinctionChroma, hazeLayerInverseScale, hazeSigma, hazeTargetTerms,
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
assert.match(post, /const terms = hazeTargetTerms\(overcast, atmosphere\.fogMix, hazeTermsScratch\);\s*law\.set\(hazeSigma\(atmosphere\.fogDensity\), hazeLayerInverseScale\(\), terms\.x, terms\.y\);\s*hazeExtinctionChroma\(u\.uHazeChroma\.value as THREE\.Vector3\);/,
  'the light model\'s overcast and the map\'s fogMix set the target; the extinction\'s chroma per frame (QA-tunable)');
// the pass draws the hue by the terms' whole weight (2026-10-04: fogMix × the share under an open sky, the whole tint under
// a closed deck — the mountains lane's trace of Whiteout's beige band over its far ice sheet)
assert.match(post, /vec3 target = mix\( skyT, uAtmoFogTint \* \( skyL \/ tintL \), uHazeLaw\.z \);/, 'the target\'s hue by the terms\' weight');
{
  for (const fogMix of [0.3, 0.56, 0.82, 1.4]) {
    const open = hazeTargetTerms(0, fogMix, { x: 0, y: 0 }), closed = hazeTargetTerms(1, fogMix, { x: 0, y: 0 }), half = hazeTargetTerms(0.5, fogMix, { x: 0, y: 0 });
    near(open.x, Math.min(1, fogMix * HAZE_TINT_SHARE), 1e-12, `fogMix ${fogMix}: the tint's share of the hue under an open sky`);
    assert.equal(open.y, HAZE_TARGET_SKY_K);
    // under a closed deck the target is the deck's grey whatever the map's fogMix: the clear sky's LUT is light no one sees
    // there (Whiteout, fogMix 0.56: the old rule kept 44 % of its warm anti-sun horizon at the 13° sun)
    assert.equal(closed.x, 1, `fogMix ${fogMix}: all of the authored tint under a closed deck`);
    assert.ok(Math.abs(closed.y - HAZE_TARGET_SKY_K * HAZE_OVERCAST_K) < 1e-12, 'the deck\'s level');
    assert.ok(half.x >= open.x && half.x <= 1 && half.y < open.y && half.y > closed.y, 'between them under half a deck');
  }
  assert.equal(hazeTargetTerms(1, Number.NaN, { x: 0, y: 0 }).x, 1, 'a missing fogMix: still the deck\'s grey under a closed deck');
  const out = { x: 0, y: 0 }; assert.equal(hazeTargetTerms(0.3, 0.5, out), out, 'written in place');
  assert.match(clouds, /const terms = hazeTargetTerms\(overcast, a\.fogMix \?\? 0, this\.hazeTerms\);/, 'the cloud trace reads the same terms');
  assert.match(clouds, /\.set\(terms\.x, terms\.y, 0, smoothstep01\(overcast \/ 0\.3\)\);/, 'its hue by the terms\' weight, its share by the overcast');
  const panorama = here('../world/horizonPanorama.ts');
  assert.match(panorama, /const terms = hazeTargetTerms\(overcast, atmosphere\.fogMix \?\? 0, \{ x: 0, y: 0 \}\);\s*const mix = terms\.x, targetK = terms\.y;/,
    'the far bake\'s port reads the same terms');
  // the extinction's chroma, read per frame (1: HAZE_EXT_CHROMA exactly)
  const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  assert.deepEqual([...Object.values(hazeExtinctionChroma(v)).slice(0, 3)], [...HAZE_EXT_CHROMA], 'the per-channel extinction');
  assert.match(clouds, /vec3 law = mix\( target, uOvercastTint \* \( luma\( target \) \/ max\( luma\( uOvercastTint \), 1e-4 \) \), uOvercastHaze\.x \) \* uOvercastHaze\.y;/,
    'the pass\'s target: the tint\'s hue at the sky\'s luminance, a level under it');
}
assert.doesNotMatch(clouds, /HAZE_LAW_GLSL|hazeSigma/, 'the clouds keep their own haze law (CLOUD_AERIAL)');
// ---- the dome's horizon under a deck (2026-10-04, Whiteout's beige band over its far ice sheet; Titan Gorge, Frosthollow):
// from an elevated eye the dome showed between the deck and the far ridges, and it was the clear sky's LUT — warm at the
// anti-sun horizon under a low sun. The pair (e675ad400 against the haze target alone) left the band pixel for pixel: it
// is sky, which the aerial pass never touches. Under a deck the horizon takes the tint's hue at the sky's own luminance
// (the haze target's hue under a closed deck) by the overcast, over its first seven degrees.
{
  const sky = here('./sky.ts');
  assert.match(sky, /float deckW = max\( uDeckHorizon\.w \* \( 1\.0 - smoothstep\( 0\.0, 0\.12, direction\.y \) \), uDeckClosed \);\s*if \( deckW > 0\.0 \) \{\s*float deckTintL = max\( dot\( uDeckHorizon\.rgb, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \), 1e-4 \);[\s\S]{0,300}float deckL = dot\( skyCol, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \);\s*if \( uDeckClosed > 0\.0 \) \{\s*vec2 hzXZ = length\( direction\.xz \) > 1e-4 \? normalize\( direction\.xz \) : vec2\( 1\.0, 0\.0 \);\s*deckL = mix\( deckL, dot\( atmoSky\( vec3\( hzXZ\.x, 0\.0, hzXZ\.y \) \), vec3\( 0\.2126, 0\.7152, 0\.0722 \) \), uDeckClosed \);\s*\}\s*skyCol = mix\( skyCol, uDeckHorizon\.rgb \* \( deckL \/ deckTintL \), deckW \);\s*\}\s*float cosSun = dot\( direction, uSunDirection \);/,
    'the dome: the deck\'s grey at the horizon (a closed deck\'s everywhere, at the horizon\'s level), after the environment bake\'s early return and before the knee');
  assert.ok(sky.indexOf('float deckW') > sky.indexOf('if ( uEnvBake > 0.5 ) {'), 'the environment bake keeps the raw sky');
  // the hole itself was the cloud field's: a closed deck keeps a thin sheet where its weather field runs at its floor
  assert.match(clouds, /o\.cov = max\( o\.cov, uClosedFloor \* smoothstep\( 0\.97, 1\.0, uCoverage \) \);/, 'the slab\'s closed-deck floor');
  assert.match(clouds, /float covB = max\( smoothstep\( 1\.0 - fbCov, 1\.0 - fbCov \+ 0\.35, fb \), uClosedFloor \* smoothstep\( 0\.97, 1\.0, uCoverage \) \)/, 'the far band\'s');
  assert.match(clouds, /t\.uClosedFloor\.value = lightTune\('CLOUD_CLOSED_COVER_FLOOR', CLOUD_CLOSED_COVER_FLOOR\);/, 'the floor per frame (QA-tunable)');
  assert.match(clouds, /const CLOUD_CLOSED_COVER_FLOOR = 0\.7;/, 'Titan Gorge closed at establishing and bird (0.5 left a cream patch, ΔE 11.5 from the deck; 0.7 a thin brighter patch, ΔE 4.1)');
  assert.match(sky, /deckOvercast = model\.mode === 'physical' \? Math\.min\(1, Math\.max\(0, model\.overcast\)\) : 0;\s*const deckKnob = lightTune\('SKY_DECK_HORIZON', 1\);\s*\(u\.uDeckHorizon\.value as THREE\.Vector4\)\.set\(tint\.r, tint\.g, tint\.b, deckOvercast \* deckKnob\);/,
    'by the light model\'s overcast, on the grounded rig only');
  // a closed deck (Titan Gorge's dense overcast, Whiteout's stratus) greys the whole dome, ramped in over the last tenth of
  // the overcast: the 0.8 decks (Frosthollow, Ironworks) keep the blue in their breaks
  assert.match(sky, /const closedT = Math\.min\(1, Math\.max\(0, \(deckOvercast - 0\.9\) \/ 0\.1\)\);\s*u\.uDeckClosed\.value = closedT \* closedT \* \(3 - 2 \* closedT\) \* deckKnob;/);
  // the twin: Whiteout's anti-sun horizon at the 13° sun under its own tint and closed deck
  const Y = [0.2126, 0.7152, 0.0722], lum = (c) => c[0] * Y[0] + c[1] * Y[1] + c[2] * Y[2];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const dome = (sky, tint, overcast, dirY, horizon = sky) => {
    const closedW = smooth(0.9, 1, overcast), w = Math.max(overcast * (1 - smooth(0, 0.12, dirY)), closedW);
    const k = (lum(sky) + (lum(horizon) - lum(sky)) * closedW) / Math.max(lum(tint), 1e-4);
    return sky.map((v, i) => v + (tint[i] * k - v) * w);
  };
  const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const tint = [0xb3, 0xbf, 0xc9].map((v) => srgbToLinear(v / 255)), warm = [0.60, 0.52, 0.30];
  const closed = dome(warm, tint, 1, 0);
  near(lum(closed), lum(warm), 1e-12, 'the horizon keeps the sky\'s luminance');
  near(closed[2] / closed[0], tint[2] / tint[0], 1e-12, 'a closed deck: the tint\'s hue at the horizon');
  assert.deepEqual(dome(warm, tint, 0, 0), warm, 'an open sky: the LUT');
  assert.deepEqual(dome(warm, tint, 0.8, 0.13), warm, 'seven degrees up under a broken deck: the sky its gaps show');
  const zenith = dome([0.2, 0.35, 0.8], tint, 1, 0.9, warm);
  near(zenith[2] / zenith[0], tint[2] / tint[0], 1e-12, 'a closed deck: no blue anywhere, its gaps the deck\'s grey');
  near(lum(zenith), lum(warm), 1e-12, '... as bright as its horizon (a thin patch reads brighter grey, never the clear zenith\'s dark)');
}


console.log(`hazeLaw.selftest: Beer–Lambert law (σ ${HAZE_SIGMA_PER_FOG} × fogDensity, layer ${HAZE_LAYER_SCALE_M} m), ${checked} maps readable at 2 km and separated to 3 km, layer integral exact, wiring PASS`);
