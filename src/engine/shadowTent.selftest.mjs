// 2026-10-14 (SKY shadows r2a, P1): the cascades' tent PCF. The kernel rides on each cascade's shadow radius (100 + k), so
// three's getShadow call sites stay its own — vegetation's leaf floor counts and wraps the three directional sites (the
// r2a capture caught "expected three directional shadow sites, found 1" when the sites were renamed) and the coast
// wrapper calls getShadow; spot, point and other directional lights keep three's disk exactly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SHADOW_TENT_DEFAULT, SHADOW_TENT_GLSL, SHADOW_TENT_RADIUS_BASE, THREE_PCF_GET_SHADOW, THREE_PCF_GET_SHADOW_RENAMED,
  shadowTentBiasRadius, shadowTentHalfTexels, shadowTentRadius, shadowTentTaps,
} from './shadowTent.ts';
import { PRESETS } from './quality.ts';

assert.equal(THREE.ShaderChunk.shadowmap_pars_fragment.split(THREE_PCF_GET_SHADOW).length, 2, 'three\'s PCF getShadow, once (the rename anchor)');
assert.ok(THREE_PCF_GET_SHADOW_RENAMED.startsWith('float cotThreeGetShadow('), 'renamed, same signature');
assert.match(SHADOW_TENT_GLSL, /float getShadow\( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord \) \{\s*if \( shadowRadius > 99\.5 \) return cotTentShadow\( shadowRadius - 100\.0,/, 'a tent-coded radius takes the tent');
assert.match(SHADOW_TENT_GLSL, /return cotThreeGetShadow\( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord \);/, 'any other radius three\'s disk');
assert.match(SHADOW_TENT_GLSL, /#ifndef OPAQUE\s*k = 3\.0;\s*#endif/, 'the alpha-to-coverage cards take the smallest tent');
// the call sites stay three's: the CSM chunk's three directional sites (vegetation's leaf floor counts them)
const csmShader = readFileSync(new URL('../../node_modules/three/examples/jsm/csm/CSMShader.js', import.meta.url), 'utf8');
assert.equal(csmShader.split('getShadow( directionalShadowMap[ i ]').length - 1, 3, 'the CSM chunk carries three directional sites');
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.doesNotMatch(lighting, /replace\(\s*'getShadow\( directionalShadowMap|COT_CSM_SHADOW|cotCsmShadow\(/, 'lighting.ts renames no call site');
assert.match(readFileSync(new URL('../world/vegetation.ts', import.meta.url), 'utf8'), /if \(sites !== 3\) throw/, 'vegetation still counts three sites');
assert.match(lighting, /THREE\.ShaderChunk\.shadowmap_pars_fragment = `\$\{pars\.replace\(THREE_PCF_GET_SHADOW, THREE_PCF_GET_SHADOW_RENAMED\)\}\n\$\{SHADOW_TENT_GLSL\}`;/, 'three\'s disk renamed, the tent appended');
// the kernels and their codes
assert.deepEqual([3, 5, 7].map(shadowTentRadius), [103, 105, 107]);
assert.equal(SHADOW_TENT_RADIUS_BASE, 100);
assert.deepEqual([3, 5, 7].map(shadowTentTaps), [4, 9, 16]);
assert.deepEqual([3, 5, 7].map(shadowTentHalfTexels), [1.5, 2, 2.5]);
for (const k of [3, 5, 7]) assert.ok(Math.abs((0.95 * shadowTentBiasRadius(k) + 1) - shadowTentHalfTexels(k)) < 1e-12, `${k}: the bias law reaches its half footprint`);
assert.deepEqual([...SHADOW_TENT_DEFAULT], [3, 3, 3, 3]);
for (const name of ['ultra', 'high', 'medium']) {
  assert.deepEqual([...PRESETS[name].shadowTent], [5, 3, 3, 3], `${name}: 5 on the near cascade`);
  assert.deepEqual([...PRESETS[name].shadowTentDeck], [7, 7, 3, 3], `${name}: 7 on the near pair under a closed deck`);
}
for (const name of ['low', 'ultralow']) assert.equal(PRESETS[name].shadowTent, undefined, `${name}: 3 everywhere`);
console.log('shadowTent.selftest: tent kernels coded on the cascade radius, three\'s call sites and disk kept, the preset tables PASS');
