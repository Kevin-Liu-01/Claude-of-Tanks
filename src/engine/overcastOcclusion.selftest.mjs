// overcastOcclusion.selftest — the skies lane (2026-10-06): the sky's occlusion at contacts under a closed deck (the
// gauntlet's wave 190 on Frosthollow: "the tank … appears to hover", "nothing … receives contact darkening"). Pins: the
// gather's directions (cosine-weighted, stratified, world-fixed) and contact reaches; the deck's weight (0 under an open sky,
// the full strength at a closed deck) and the shade on the CPU twin; the GLSL's gates, estimator and fade, with no
// screen-space or temporal noise; the aerial pass's include, its place after the contact shadows and before the haze, and the
// lever it rides. No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SKY_OCCLUSION_DECK, SKY_OCCLUSION_GLSL, SKY_OCCLUSION_RANGE_M, SKY_OCCLUSION_REACH_M, SKY_OCCLUSION_SAMPLES, SKY_OCCLUSION_SIN2,
  SKY_OCCLUSION_STRENGTH, skyOcclusionShade, skyOcclusionWeight,
} from './overcastOcclusion.ts';

// 1. the set: eight cosine-weighted directions, a contact's reach
assert.equal(SKY_OCCLUSION_SAMPLES, 8);
assert.deepEqual([...SKY_OCCLUSION_SIN2], [0.125, 0.375, 0.625, 0.875], 'sin² θ at the strata midpoints');
const meanCos = [...SKY_OCCLUSION_SIN2].reduce((s, v) => s + Math.sqrt(1 - v), 0) / 4;
assert.ok(Math.abs(meanCos - 2 / 3) < 0.03, `cosine-weighted: mean cos θ ≈ 2/3 (${meanCos.toFixed(3)})`);
assert.deepEqual([...SKY_OCCLUSION_REACH_M], [0.35, 0.7, 1.3, 2.4], 'a crevice to a hull\'s skirt: 0.35–2.4 m');

// 2. the deck's weight and the shade (CPU twin)
assert.equal(skyOcclusionWeight(0), 0, 'an open sky: off (the sun\'s shadows and the contact march ground objects)');
assert.equal(skyOcclusionWeight(SKY_OCCLUSION_DECK[0]), 0);
assert.equal(skyOcclusionWeight(1), SKY_OCCLUSION_STRENGTH, 'a closed deck: the full strength');
assert.equal(skyOcclusionWeight(SKY_OCCLUSION_DECK[1]), SKY_OCCLUSION_STRENGTH);
assert.ok(skyOcclusionWeight(0.79) > 0.5 * SKY_OCCLUSION_STRENGTH, 'Frosthollow\'s 0.79 deck takes most of it');
assert.equal(skyOcclusionWeight(Number.NaN), 0);
assert.equal(skyOcclusionShade(0, 0.7), 1, 'open ground: untouched');
assert.ok(Math.abs(skyOcclusionShade(4, 0.7) - 0.65) < 1e-12, 'half the dome hidden (a wall\'s foot): 0.65');
assert.ok(Math.abs(skyOcclusionShade(8, 0.7) - 0.3) < 1e-12, 'the whole dome hidden (under a hull): 0.3');
assert.equal(skyOcclusionShade(8, 0), 1, 'weight 0: off');

// 3. the GLSL
for (const [needle, what] of [
  ['if ( cotSunVisOf( alpha ) < 0.0 ) return 1.0;', 'opaque receivers only (never a card, water, the sky)'],
  ['vec3 start = P + N * ( 0.02 + dist * 0.002 );', 'off the surface by a distance-scaled bias'],
  ['if ( sceneW < c.w - ( 0.02 + 0.004 * c.w ) ) {', 'a surface in front of the sample point'],
  ['return 1.0 - uSkyOcc * hits * 0.1250', 'the hidden share of the dome, at the deck\'s weight'],
  [`smoothstep( ${(SKY_OCCLUSION_RANGE_M - 10).toFixed(4)}, ${SKY_OCCLUSION_RANGE_M.toFixed(4)}, dist )`, 'faded out by its range'],
]) assert.ok(SKY_OCCLUSION_GLSL.includes(needle), what);
assert.ok(!SKY_OCCLUSION_GLSL.includes('gl_FragCoord') && !/uTime|uFrame/.test(SKY_OCCLUSION_GLSL), 'world-fixed directions: no screen-space or temporal noise to shimmer');

// 4. the aerial pass
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.ok(post.indexOf('${CONTACT_SHADOW_GLSL}') < post.indexOf('${SKY_OCCLUSION_GLSL}'), 'included after the contact helpers it uses');
assert.match(post, /\$\{CONTACT_SHADOW_GLSL\}\s*\$\{VEHICLE_OCCLUSION_GLSL\}/, 'the vehicle block keeps its place beside the contact shadows');
const shadeAt = post.indexOf('texel.rgb *= cotContactShade( vUv, uCamPos + ray * rayT, -viewZ, texel.a );');
const occAt = post.indexOf('texel.rgb *= cotSkyOcclusion( vUv, uCamPos + ray * rayT, -viewZ, texel.a );');
assert.ok(shadeAt > 0 && occAt > shadeAt, 'after the contact shade, before the haze');
assert.ok(post.includes("? skyOcclusionWeight(groundModel?.overcast ?? 0, lightTune('SKY_OCCLUSION', SKY_OCCLUSION_STRENGTH)) : 0;"),
  "the deck's weight on the contact shadows' lever (the mobile tier and ?fx=off keep it off)");

console.log('overcastOcclusion.selftest: eight cosine-weighted world-fixed directions (0.35–2.4 m), the deck\'s weight (0 open, 0.7 closed) and the shade on the CPU twin, the GLSL gates and the aerial pass\'s include, order and lever PASS; no GPU/art claim');
