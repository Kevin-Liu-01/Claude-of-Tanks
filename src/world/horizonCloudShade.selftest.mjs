// Round 72 (2026-09-25): the volumetric layer's cloud shadows on the ring (horizonCloudShade.ts). Since 2026-10-03 the
// vista samples the one undithered shade map every lit material reads (engine/cloudShadeMap.ts): pinned here are the
// four uniforms and their place in the vista program, the lookup (up the sun's ray to the base, the map's square, the
// edge and grazing-sun fades — the same law as cotCloudSun), the binder (by reference, off without a live map) and the
// layer's getter that hands the map over.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HORIZON_CLOUD_SHADE_FRAGMENT, HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS, bindHorizonCloudShade, createHorizonCloudShadeUniforms,
} from './horizonCloudShade.ts';
import { HORIZON_VISTA_FRAGMENT, HORIZON_VISTA_UNIFORM_DECLARATIONS } from './horizonVista.ts';
import { CLOUD_SHADE_PARS_GLSL, createCloudShadeUniforms } from '../engine/cloudShadeMap.ts';

const uniforms = createHorizonCloudShadeUniforms();
const names = ['uVCMap', 'uVCRect', 'uVCBase', 'uVCShade'];
assert.deepEqual(Object.keys(uniforms).sort(), names.slice().sort(), 'four cloud-shade uniforms');
for (const name of names) {
  assert.match(HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS, new RegExp(`uniform [a-zA-Z0-9]+ ${name};`), `${name} is declared`);
  assert.match(HORIZON_VISTA_UNIFORM_DECLARATIONS, new RegExp(`uniform [a-zA-Z0-9]+ ${name};`), `${name} reaches the vista program`);
}
assert.equal(uniforms.uVCShade.value, 0, 'off until bound');
assert.match(HORIZON_CLOUD_SHADE_FRAGMENT, /if \(uVCShade > 0\.001 && uSunDirW\.y > 0\.03\) \{/, 'the fetch sits inside the layer\'s branch');
assert.equal((HORIZON_CLOUD_SHADE_FRAGMENT.match(/texture2D\(/g) ?? []).length, 1, 'one fetch: the shade map');
assert.match(HORIZON_CLOUD_SHADE_FRAGMENT, /vec2 cxz = P\.xz \+ uSunDirW\.xz \* \(\(uVCBase - P\.y\) \/ uSunDirW\.y\);/, 'up the sun\'s ray to the cloud base');
assert.match(HORIZON_CLOUD_SHADE_FRAGMENT, /vec2 cuv = \(cxz - uVCRect\.xy\) \* uVCRect\.z \+ 0\.5;/, 'in the map\'s square');
// the same law as the lit materials' lookup (cloudShadeMap.ts): projection, square, edge fade, grazing-sun fade
assert.match(CLOUD_SHADE_PARS_GLSL, /vec2 uv = \( p - uCotCloudShade\.xy \) \* uCotCloudShade\.z \+ 0\.5;/);
assert.ok(HORIZON_CLOUD_SHADE_FRAGMENT.includes('smoothstep(0.84, 1.0, cedge)') && CLOUD_SHADE_PARS_GLSL.includes('smoothstep( 0.84, 1.0, edge )'), 'the same edge fade');
assert.ok(HORIZON_CLOUD_SHADE_FRAGMENT.includes('smoothstep(0.03, 0.08, uSunDirW.y)') && CLOUD_SHADE_PARS_GLSL.includes('smoothstep( 0.03, 0.08, uCotCloudSun.y )'), 'the same grazing-sun fade');
assert.ok(HORIZON_VISTA_FRAGMENT.includes(HORIZON_CLOUD_SHADE_FRAGMENT) && HORIZON_VISTA_FRAGMENT.includes('sunVis *= cloudLit;'),
  'the vista program multiplies its sun visibility by the cloud shade');

// the binder
assert.equal(bindHorizonCloudShade(uniforms, null), false, 'no layer: off');
assert.equal(uniforms.uVCShade.value, 0);
const shared = createCloudShadeUniforms();
const map = { isTexture: true, name: 'cloud-shade' };
shared.tCotCloudShade.value = map;
shared.uCotCloudShade.value.set(120, -60, 1 / 12000, 1);
shared.uCotCloudSun.value.set(0.3, 0.9, 0.3, 1500);
const layer = { active: true, cloudShade: shared };
assert.equal(bindHorizonCloudShade(uniforms, layer), true, 'a live map binds');
assert.equal(uniforms.uVCMap.value, map);
assert.equal(uniforms.uVCRect.value, shared.uCotCloudShade.value, 'the square by reference (the layer re-snaps it in place)');
assert.equal(uniforms.uVCBase.value, 1500); assert.equal(uniforms.uVCShade.value, 1);
shared.uCotCloudShade.value.x = 400;
assert.equal(uniforms.uVCRect.value.x, 400, 'a refreshed square reaches the ring with no rebind');
assert.equal(bindHorizonCloudShade(uniforms, { ...layer, active: false }), false, 'an inactive layer: off');
assert.equal(uniforms.uVCShade.value, 0);
assert.equal(bindHorizonCloudShade(uniforms, { ...layer, cloudShade: null }), false, 'no live map (a deck, no shadows): off');
shared.uCotCloudShade.value.w = 0;
assert.equal(bindHorizonCloudShade(uniforms, layer), false, 'a dropped map: off');

// the layer hands the map over only while it is live
const layerSrc = readFileSync(new URL('../engine/volumetricClouds.ts', import.meta.url), 'utf8');
assert.match(layerSrc, /get cloudShade\(\): CloudShadeUniforms \| null \{\s*const shared = this\.scene\.userData\.cloudShadeUniforms as CloudShadeUniforms \| undefined;\s*return this\.active && this\.farShadeValid && shared \? shared : null;/);
console.log('horizonCloudShade.selftest: the vista samples the one shade map — uniforms, program, lookup law and binder PASS');
