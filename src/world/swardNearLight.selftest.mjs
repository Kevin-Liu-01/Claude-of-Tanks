// swardNearLight.selftest.mjs — a grass blade's light from a lamp close by (229; the barrel-glow lane's night critics on
// both builds: "thin grass blades next to the lamps glow bright yellow-green"). Pinned:
//   - the knee: every lamp pool's level (a street lamp's ~10 lux at its foot, a headlight's beam on the grass 9 m ahead),
//     the sun and the moon pass unchanged; a blade a metre or three from a 1200 cd headlight saturates under the cap,
//     continuously, never darker for more light, its colour kept;
//   - the block is three's Lambert term itself (RE_Direct_Lambert's signature and law) through the knee, installed after
//     `lights_lambert_pars_fragment` and before the light loop, once;
//   - only the two grass families take it (the ground, hulls and walls keep their light: the pools are as bright).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SWARD_NEAR_CAP, SWARD_NEAR_KNEE, SWARD_NEAR_LIGHT_GLSL, installSwardNearLight, swardNearLight } from './swardNearLight.ts';
import { STREET_LAMP_CANDELA } from './worldNightLighting.ts';

// ---- the knee
const lampFoot = STREET_LAMP_CANDELA / (3.9 * 3.9);
for (const [what, lux] of [['a street lamp\'s pool at its foot', lampFoot], ['a headlight\'s beam on the grass 9 m ahead', 1200 / 81],
  ['the sun', 4.5], ['the moon', 0.2], ['nothing', 0]]) {
  assert.equal(swardNearLight(lux), lux, `${what} (${lux.toFixed(2)} lux) passes unchanged`);
}
assert.ok(SWARD_NEAR_KNEE > lampFoot && SWARD_NEAR_KNEE > 1200 / 81, 'the knee over every pool');
let last = 0;
for (let lux = 0; lux <= 5000; lux += 0.5) {
  const v = swardNearLight(lux);
  assert.ok(v >= last - 1e-9, `never darker for more light (${lux})`);
  assert.ok(v < SWARD_NEAR_CAP, `under the cap (${lux})`);
  last = v;
}
assert.ok(Math.abs(swardNearLight(SWARD_NEAR_KNEE + 1e-6) - SWARD_NEAR_KNEE) < 1e-5, 'continuous at the knee');
const near1 = swardNearLight(1200 * 0.5), near3 = swardNearLight(1200 / 9 * 0.5);
assert.ok(near1 < SWARD_NEAR_CAP && near1 > near3 && near3 > SWARD_NEAR_KNEE,
  `a blade 1 m from a headlight ${near1.toFixed(1)} lux (was 600), 3 m ${near3.toFixed(1)} (was 67): still the brightest, no neon`);

// ---- the block: three's Lambert term through the knee, in its place
const chunk = THREE.ShaderChunk.lights_lambert_pars_fragment;
const sig = (src, name) => src.slice(src.indexOf(`void ${name}(`), src.indexOf(')', src.indexOf(`void ${name}(`)) + 1).replace(`void ${name}(`, '(');
assert.equal(sig(SWARD_NEAR_LIGHT_GLSL, 'RE_Direct_CotSward'), sig(chunk, 'RE_Direct_Lambert'), 'three\'s RE_Direct signature, as three draws it');
assert.match(chunk, /float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);\s*vec3 irradiance = dotNL \* directLight\.color;\s*reflectedLight\.directDiffuse \+= irradiance \* BRDF_Lambert\( material\.diffuseColor \);/,
  'three\'s Lambert law as the block repeats it (an upgrade that changes it breaks here)');
assert.match(SWARD_NEAR_LIGHT_GLSL, /vec3 irradiance = saturate\( dot\( geometryNormal, directLight\.direction \) \) \* directLight\.color;/);
assert.match(SWARD_NEAR_LIGHT_GLSL, /reflectedLight\.directDiffuse \+= irradiance \* BRDF_Lambert\( material\.diffuseColor \);/);
assert.ok(SWARD_NEAR_LIGHT_GLSL.includes(`cotLux > ${SWARD_NEAR_KNEE.toFixed(1)}`) && SWARD_NEAR_LIGHT_GLSL.includes(`cotOver / ${(SWARD_NEAR_CAP - SWARD_NEAR_KNEE).toFixed(1)}`),
  'the shader\'s knee is the receipt\'s');
const lambert = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
installSwardNearLight(lambert);
installSwardNearLight(lambert);
const f = lambert.fragmentShader;
assert.equal(f.split('RE_Direct_CotSward(').length - 1, 1, 'installed once');
const at = (s) => f.indexOf(s);
assert.ok(at('#include <lights_lambert_pars_fragment>') < at('#undef RE_Direct') && at('#define RE_Direct RE_Direct_CotSward') < at('#include <lights_fragment_begin>'),
  'after three\'s Lambert definitions, before the light loop');
const bare = { fragmentShader: '#include <common>\n#include <color_fragment>' };
installSwardNearLight(bare);
assert.equal(bare.fragmentShader, '#include <common>\n#include <color_fragment>', 'a stand-in without the chunk is left as is');

// ---- grass only
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tall = read('./tallGrass.ts'), veg = read('./vegetation.ts');
assert.equal(tall.split('installSwardNearLight(shader);').length - 1, 1, 'the tall grass tiers (one hook)');
assert.equal(veg.split('installSwardNearLight(shader);').length - 1, 1, 'the carpet\'s tufts (one hook)');
const within = (src, call, from, to) => src.indexOf(from) >= 0 && src.indexOf(from) < src.indexOf(call) && src.indexOf(call) < src.indexOf(to, src.indexOf(from));
assert.ok(within(tall, 'installSwardNearLight(shader);', 'function tallGrassHook(', 'export function tallGrassShaderSource'), 'inside the blades\' hook');
assert.ok(within(veg, 'installSwardNearLight(shader);', 'const grassWindHook', '// Far tufts collapse to one wider plane'), 'inside the tufts\' hook');
for (const file of ['../engine/terrain.ts', './terrain.ts', './props.ts']) {
  try { assert.ok(!read(file).includes('installSwardNearLight'), `${file} keeps its light`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
console.log(`swardNearLight.selftest: pools, sun and moon unchanged; a blade 1 m from a headlight ${near1.toFixed(1)} lux (was 600), 3 m ${near3.toFixed(1)} (was 67); grass only`);
