// facadeBounce.selftest — the skies lane (2026-10-06): the sunlit facades' light on the shaded ground below them (the
// facades lane's fill check on Steinburg: shaded flat ground at ~0.17 of its sunlit value with nothing from the lit walls
// across the street). Pins: the gather's directions (cosine-weighted, stratified, unit, over the hemisphere) and reaches;
// the estimator and its cap on the CPU twin (no hit lifts nothing; a lit facade lifts the street in its own tint; the
// Steinburg street worked through); the GLSL's gates, literals and estimator; the aerial pass's include, its place after
// the contact shadows and before the haze, and the lever it rides. No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FACADE_BOUNCE_GAIN_MAX, FACADE_BOUNCE_GLSL, FACADE_BOUNCE_MAX_VIS, FACADE_BOUNCE_MIN_NY, FACADE_BOUNCE_RANGE_M,
  FACADE_BOUNCE_REACH_M, FACADE_BOUNCE_SAMPLES, FACADE_BOUNCE_SIN2, facadeBounceDirections, facadeBounceGain,
} from './facadeBounce.ts';

// 1. directions: eight, unit, over the hemisphere, the elevations cosine-weighted in sin² (stratified) and turned evenly
assert.equal(FACADE_BOUNCE_SAMPLES, 8);
assert.deepEqual([...FACADE_BOUNCE_SIN2], [0.125, 0.375, 0.625, 0.875], 'sin² θ at the four strata midpoints (cosine-weighted)');
for (const turn of [0, 0.7, 3.1]) {
  const dirs = facadeBounceDirections(turn);
  assert.equal(dirs.length, 8);
  for (const { dir, reach } of dirs) {
    assert.ok(Math.abs(Math.hypot(...dir) - 1) < 1e-9, 'unit');
    assert.ok(dir[2] > 0.3 && dir[2] < 0.95, 'over the hemisphere, off the pole and off the horizon');
    assert.ok(FACADE_BOUNCE_REACH_M.includes(reach));
  }
  const meanZ = dirs.reduce((s, d) => s + d.dir[2], 0) / 8;
  assert.ok(Math.abs(meanZ - (2 / 3)) < 0.03, `a cosine-weighted set averages cos θ ≈ 2/3 (${meanZ.toFixed(3)})`);
  const sumXY = dirs.reduce((s, d) => [s[0] + d.dir[0], s[1] + d.dir[1]], [0, 0]);
  assert.ok(Math.hypot(...sumXY) < 0.6, 'the azimuths spread round the normal');
}
assert.deepEqual([...FACADE_BOUNCE_REACH_M], [3.5, 6, 9.5, 14], 'a street to a square: 3.5–14 m');

// 2. the estimator (CPU twin): E_b = π / 8 · Σ L, over the up-facing fill, capped
assert.deepEqual(facadeBounceGain(Array(8).fill([0, 0, 0]), 0.3), [1, 1, 1], 'an open field: no surface above the horizon, no lift');
const warm = [0.16, 0.13, 0.10];
const one = facadeBounceGain([warm, ...Array(7).fill([0, 0, 0])], 0.3);
for (let c = 0; c < 3; c++) assert.ok(Math.abs(one[c] - (1 + warm[c] * Math.PI / 8 / 0.3)) < 1e-12, 'one hit: its share');
assert.ok(one[0] > one[2], 'a warm facade lifts the street in its own tint');
assert.deepEqual(facadeBounceGain(Array(8).fill([5, 5, 5]), 0.3), [1 + FACADE_BOUNCE_GAIN_MAX, 1 + FACADE_BOUNCE_GAIN_MAX, 1 + FACADE_BOUNCE_GAIN_MAX], 'capped');
assert.deepEqual(facadeBounceGain([warm, warm, warm], 0.3, 0), [1, 1, 1], 'strength 0: off');
{
  // Steinburg's street (the facades lane's shops-eye, r3b): the shaded road 0.0222 (HDR, linear) under its fill, the sunlit
  // road 0.132; with the cobbles' albedo ~0.25 the up-facing fill is π · 0.0222 / 0.25 ≈ 0.28; three of the eight
  // directions meeting the sunlit fronts across the street (their pixels ~0.15, the sunlit road's level) lift it by ~60 %:
  // the shaded road at ~0.27 of the sunlit one instead of 0.17
  const fillUp = Math.PI * 0.0222 / 0.25;
  const g = facadeBounceGain([[0.15, 0.15, 0.15], [0.15, 0.15, 0.15], [0.15, 0.15, 0.15], ...Array(5).fill([0, 0, 0])], fillUp);
  const ratio = 0.0222 * g[1] / 0.132;
  assert.ok(g[1] > 1.4 && g[1] < 1.9, `the lift ${g[1].toFixed(2)}`);
  assert.ok(ratio > 0.24 && ratio < 0.32, `the street's shade at ${ratio.toFixed(2)} of its sun (was 0.17)`);
}

// 3. the GLSL: gates, estimator, cap, fade
for (const [needle, what] of [
  [`if ( sunVis < 0.0 || sunVis > ${FACADE_BOUNCE_MAX_VIS.toFixed(4)} ) return vec3( 1.0 );`, 'opaque receivers in a cast shadow only'],
  [`if ( N.y < ${FACADE_BOUNCE_MIN_NY.toFixed(4)} ) return vec3( 1.0 );`, 'up-facing receivers (the walls take the ground bounce)'],
  ['float fillUp = uContactAmb.x + uContactAmb.z + uContactAmb.w * max( uContactFillDir.y, 0.0 );', "the contact shadows' ambient at n = up"],
  ['if ( sceneW < c.w - ( 0.05 + 0.01 * c.w ) ) {', 'a surface in front of the sample point'],
  ['if ( hit.a >= 1.5000 ) sum += hit.rgb;', 'opaque lit hits only (never the sky, a card, water)'],
  [`vec3 gain = sum * ${(Math.PI / 8).toFixed(4)} / fillUp * uFacadeBounce`, 'the cosine-weighted estimator'],
  [`return 1.0 + min( gain, vec3( ${FACADE_BOUNCE_GAIN_MAX.toFixed(4)} ) );`, 'capped'],
  [`smoothstep( ${(FACADE_BOUNCE_RANGE_M - 15).toFixed(4)}, ${FACADE_BOUNCE_RANGE_M.toFixed(4)}, dist )`, 'faded out by its range'],
]) assert.ok(FACADE_BOUNCE_GLSL.includes(needle), what);

// 4. the aerial pass: the block after the contact shadows' helpers, applied after their shade and before the haze, on the
// contact shadows' lever (their uniforms and tier), the strength a QA knob
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.ok(post.indexOf('${CONTACT_SHADOW_GLSL}') < post.indexOf('${FACADE_BOUNCE_GLSL}'), 'included after the contact helpers it uses');
const shadeAt = post.indexOf('texel.rgb *= cotContactShade( vUv, uCamPos + ray * rayT, -viewZ, texel.a );');
const bounceAt = post.indexOf('texel.rgb *= cotFacadeBounce( vUv, uCamPos + ray * rayT, -viewZ, texel.a );');
assert.ok(shadeAt > 0 && bounceAt > shadeAt, 'applied after the contact shade');
assert.ok(post.indexOf('if ( uFacadeBounce > 0.0 && -viewZ < ${FACADE_BOUNCE_RANGE_M.toFixed(1)} ) {') > 0, 'gated by its strength and range');
assert.ok(post.includes('facadeBounceOn = resolved.contactShadows && !!preset.facadeBounce;'), 'its own gate: the preset lever, with the contact shadows');
assert.ok(post.includes("aerial.uniforms.uFacadeBounce.value = facadeBounceOn && lightFx.contactShadows ? lightTune('FACADE_BOUNCE', FACADE_BOUNCE_STRENGTH) : 0;"),
  'the strength a QA knob, 0 off the gate');
// the coordinator's conditions (2026-10-06): High and above only, never on mobile; no screen-space noise (a slow pan must
// not shimmer): the directions are fixed in the receiver's world frame
const { PRESETS } = await import('./quality.ts');
for (const [name, on] of [['ultra', true], ['high', true], ['medium', false], ['low', false], ['mobile', false]]) {
  assert.equal(!!PRESETS[name]?.facadeBounce, on, `${name}: ${on ? 'on' : 'off'}`);
}
assert.ok(!FACADE_BOUNCE_GLSL.includes('gl_FragCoord') && !/uTime|uFrame/.test(FACADE_BOUNCE_GLSL), 'no screen-space or temporal noise in the gather');

console.log('facadeBounce.selftest: eight cosine-weighted directions (3.5–14 m), the estimator and its cap on the CPU twin (Steinburg\'s shaded street 0.17 → ~0.27 of its sun), the GLSL gates (world-fixed directions, no screen noise), High/Ultra only, and the aerial pass\'s include, order and gate PASS; no GPU/art claim');
