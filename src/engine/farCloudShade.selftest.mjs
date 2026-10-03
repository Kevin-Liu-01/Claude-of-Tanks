// farCloudShade.selftest — the far cloud shadows (2026-10-03, the skies-and-atmosphere lane; the gauntlet's wave 0: "no
// cloud shadows on the land"). Inside the cascades the clouds' gobos dither their shade into the shadow maps; beyond them
// (700 m on desktop) the clouds render the same shade small around the camera and the aerial pass takes each far pixel's
// sun share by it. Pinned: one field law and one core for the gobos and the map (they read the same uniform objects), the
// map world-anchored and refreshed on a schedule, the pass's law (the contact shadows' sun share), its place in the chain
// (after the world position and the vehicle occlusion, before the haze) and its hand-over with the last cascade's fade.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  CLOUD_FAR_SHADE_EVERY, CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SPAN_M, CLOUD_SHADOW_CORE,
} from './volumetricClouds.ts';

const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const clouds = here('./volumetricClouds.ts'), post = here('./post.ts');

// ---- the map: the gobos' shade, undithered, over a world-anchored square
assert.ok(CLOUD_SHADOW_CORE > 0.4 && CLOUD_SHADOW_CORE < 0.9, 'a cloud core takes most of the sun, never all of it');
assert.ok(CLOUD_FAR_SHADE_SPAN_M >= 8000, 'the square reaches an overview\'s far land');
const texel = CLOUD_FAR_SHADE_SPAN_M / CLOUD_FAR_SHADE_SIZE;
assert.ok(texel <= 60, `a texel (${texel.toFixed(1)} m) far under a cumulus shadow's few hundred metres`);
assert.ok(CLOUD_FAR_SHADE_EVERY >= 1 && CLOUD_FAR_SHADE_EVERY * 12 / 60 < texel / 4,
  'between refreshes a strong wind moves the field well under a texel');
const law = 'float shade = ${f(CLOUD_SHADOW_CORE)} * smoothstep( uThreshold - 0.08, uThreshold + 0.08, cloudField(';
assert.equal(clouds.split(law).length - 1, 2, 'the gobos and the far map cut the same field with the same core');
const clear = 'if ( uClear.z > 0.0 ) shade *= smoothstep( uClear.z * 0.6, uClear.z * 1.4, length(';
assert.equal(clouds.split(clear).length - 1, 2, 'and keep the same clear radius around a front\'s camera');
assert.match(clouds, /const FAR_SHADE_FRAGMENT = \/\* glsl \*\/`\nprecision highp float;\n\$\{CLOUD_FIELD_GLSL\}/, 'the map reads the shared field GLSL');
assert.match(clouds, /vec2 xz = uFarShadeRect\.xy \+ \( vUv - 0\.5 \) \* uFarShadeRect\.z;/, 'texel centres over the square');
assert.match(clouds, /tWeather: gu\.tWeather, tStreets: gu\.tStreets, uWeatherShift: gu\.uWeatherShift, uStreetShift: gu\.uStreetShift,\s*uWindDir: gu\.uWindDir, uStreets: gu\.uStreets, uFieldMix: gu\.uFieldMix, uCluster: gu\.uCluster, uThreshold: gu\.uThreshold, uClear: gu\.uClear,/,
  'the very uniform objects the gobos read: one drift, one cut, one clear radius');
assert.match(clouds, /const cx = Math\.round\(this\.cam\.pos\.x \/ texel\) \* texel, cz = Math\.round\(this\.cam\.pos\.z \/ texel\) \* texel;/,
  'snapped to its texel: the shadows never swim as the camera moves');
assert.match(clouds, /if \(!moved && \+\+this\.farShadeAge < CLOUD_FAR_SHADE_EVERY\) return;/, 'a refresh when the square moves, else on the schedule');
// (a deck that casts no cloud shadows publishes none: the overcast regimes — pinned above with the lever)
assert.match(clouds, /this\.updateGobos\(preset\);\s*this\.updateFarShade\(preset\);/, 'refreshed beside the gobos, after the wind moved');
assert.match(clouds, /this\.farShadeMaterial\.dispose\(\);\s*this\.farShadeTarget\?\.dispose\(\);/, 'disposed with the layer');

// ---- the pass: a far pixel loses its sun share where the sun's ray crosses a shaded cloud base
assert.match(post, /if \( uFarShade\.w > 0\.5 && -viewZ > uFarShadeFade\.x && uSunDir\.y > 0\.05 \) \{/, 'only beyond the cascades, the sun up');
assert.match(post, /float fsVis = cotSunVisOf\( texel\.a \);\s*if \( fsVis < 0\.0 \) fsVis = 1\.0;\s*if \( fsVis > 0\.02 \) \{/,
  'every far surface receives (a lit CSM surface by its own visibility, the far forests, the ring and the impostors in full sun; the sky never reaches the block)');
assert.match(post, /vec2 fsUv = \( fsP\.xz \+ uSunDir\.xz \* \( \( uFarShadeBase - fsP\.y \) \/ uSunDir\.y \) - uFarShade\.xy \) \* uFarShade\.z \+ 0\.5;/,
  'the point the sun\'s ray from the pixel crosses the cloud base, in the map\'s square');
assert.match(post, /texel\.rgb \*= 1\.0 - fsShade \* fsT \/ max\( fsT \+ fsA, 1e-4 \);/, 'the contact shadows\' law: the pixel\'s sun share');
// (2026-10-03: at level ground's share — past the cascades a depth-reconstructed normal degenerates: fp9's QA view showed
// the shade on the far ranges while the depth normal's sun term took all of it away)
assert.match(post, /float fsT = uContactSunLum \* uSunDir\.y \* fsVis;/, 'the sun on level ground');
assert.match(post, /float fsA = uContactAmb\.x \+ uContactAmb\.z \+ uContactAmb\.w \* max\( uContactFillDir\.y, 0\.0 \);/,
  'the rig\'s ambient on level ground, as the contact shadows weigh it');
assert.doesNotMatch(post.slice(post.indexOf('the far cloud shadows (FAR_CLOUD_SHADE_FADE note)'), post.indexOf('float wy = uCamPos.y + ray.y * rayT;')), /cotNormalAt/,
  'no depth normal past the cascades');
const vehAt = post.indexOf('texel.rgb *= cotVehicleOcclusionShade(');
const farAt = post.indexOf('if ( uFarShade.w > 0.5 && -viewZ > uFarShadeFade.x');
const hazeAt = post.indexOf('float wy = uCamPos.y + ray.y * rayT;');
assert.ok(vehAt > 0 && farAt > vehAt && hazeAt > farAt, 'after the world position and the vehicle occlusion, before the haze');
assert.match(post, /lightFx\.contactShadows \|\| lightFx\.vehicleOcclusion \|\| !!farShade\);/, 'the sun / ambient uniforms refresh for it');
assert.match(post, /fs\.set\(farShade\.rect\.x, farShade\.rect\.y, 1 \/ farShade\.rect\.z, lightTune\('FAR_CLOUD_SHADE', FAR_CLOUD_SHADE_ON\)\);/, 'on wherever the clouds publish a map (QA 2: the map shown)');
// off until its frames prove it (2026-10-03): the pass skips the block, the clouds render no map
assert.match(post, /export const FAR_CLOUD_SHADE_ON = 0;/); assert.match(clouds, /export const CLOUD_FAR_SHADE_ON = 0;/);
assert.match(clouds, /if \(!preset\.shadow \|\| preset\.coverage <= 0 \|\| !\(lightTune\('FAR_CLOUD_SHADE', CLOUD_FAR_SHADE_ON\) > 0\)\) \{ this\.farShadeValid = false; return; \}/,
  'no map is rendered while the lever is off');
assert.match(post, /const farShade = lightTune\('FAR_CLOUD_SHADE', FAR_CLOUD_SHADE_ON\) > 0/);
assert.match(post, /if \( uFarShade\.w > 1\.5 \) texel\.rgb = vec3\( fsShade \* 1\.6, step\( 0\.95, fract\( fsUv \* 8\.0 \) \) \* 0\.5 \);\s*else if \( fsShade > 0\.004 \) \{/, 'the QA view of the far shade');
assert.match(post, /\} else \{\s*fs\.w = 0;\s*\}/, 'off without one (the mobile tier, a deck, ?clouds=off)');

// ---- the hand-over: the map fades in exactly as three's last cascade fades its shadow out (view depth / shadow range)
const csm = readFileSync(createRequire(import.meta.url).resolve('three/examples/jsm/csm/CSMShader.js'), 'utf8');
assert.ok(csm.includes('margin = 0.25 * pow( closestEdge, 2.0 );') && csm.includes('csmy = cascade.y + margin / 2.0;')
  && csm.includes('float linearDepth = (vViewPosition.z) / (shadowFar - cameraNear);'),
  'three\'s CSM fade: the last cascade (edge 1) fades over 1 ± 0.125 of the shadow range (update this receipt if it changes)');
const fade = post.match(/const FAR_CLOUD_SHADE_FADE = Object\.freeze\(\[([\d.]+), ([\d.]+)\] as const\);/);
assert.ok(fade, 'post.ts declares the fade');
assert.deepEqual([Number(fade[1]), Number(fade[2])], [1 - 0.125, 1 + 0.125], 'complementary linear weights: the two shades sum to one');
assert.match(post, /const range = Math\.max\(Math\.min\(camera\.far, preset\.shadowMaxFar\) - camera\.near, 1\);/, 'the CSM\'s own shadow range');

// ---- the law, modelled: a sunlit flat pixel at Verdant (sun / shade 3.76 : 1) under a cloud core
const share = 3.76 / (3.76 + 1);
const shaded = 1 - CLOUD_SHADOW_CORE * share;
assert.ok(shaded > 0.45 && shaded < 0.6, `a lit field under a cloud core keeps ${(shaded * 100).toFixed(0)} % of its light (the cascades: the same)`);
assert.equal(1 - CLOUD_SHADOW_CORE * 0, 1, 'a slope already turned from the sun is untouched');

console.log(`farCloudShade.selftest: one field law for the gobos and the ${CLOUD_FAR_SHADE_SIZE}² map over ${CLOUD_FAR_SHADE_SPAN_M / 1000} km, snapped and scheduled, the sun-share law beyond the cascades, the seamless hand-over PASS`);
