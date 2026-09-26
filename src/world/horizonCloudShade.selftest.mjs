// Round 72 (2026-09-25): the volumetric layer's cloud shadows on the ring (horizonCloudShade.ts) — the tile the
// ring's field lookup mirrors equals the layer's, the binder follows the layer's live uniforms by reference, stays
// off without a layer / a shadow regime / the gobo fields, and the GLSL fetches sit inside the layer's branch.
import assert from 'node:assert/strict';
import { CLOUD_WEATHER_TILE_M } from '../engine/volumetricClouds.ts';
import {
  HORIZON_CLOUD_SHADE_FRAGMENT, HORIZON_CLOUD_SHADE_STRENGTH, HORIZON_CLOUD_SHADE_TILE_M, HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS,
  bindHorizonCloudShade, createHorizonCloudShadeUniforms,
} from './horizonCloudShade.ts';
import { HORIZON_VISTA_FRAGMENT, HORIZON_VISTA_UNIFORM_DECLARATIONS } from './horizonVista.ts';

assert.equal(HORIZON_CLOUD_SHADE_TILE_M, CLOUD_WEATHER_TILE_M, 'the ring reads the weather field on the layer\'s own tile');
assert.ok(HORIZON_CLOUD_SHADE_STRENGTH > 0.4 && HORIZON_CLOUD_SHADE_STRENGTH < 0.8, 'the shade darkens the sun term without blacking it out');

const uniforms = createHorizonCloudShadeUniforms();
const names = ['uVCWeather', 'uVCStreets', 'uVCWeatherShift', 'uVCStreetShift', 'uVCWindDir', 'uVCStreetMix', 'uVCFieldMix', 'uVCThreshold', 'uVCBase', 'uVCShade'];
assert.deepEqual(Object.keys(uniforms).sort(), names.slice().sort(), 'ten cloud-shade uniforms');
for (const name of names) {
  assert.match(HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS, new RegExp(`uniform [a-zA-Z0-9]+ ${name};`), `${name} is declared`);
  assert.match(HORIZON_VISTA_UNIFORM_DECLARATIONS, new RegExp(`uniform [a-zA-Z0-9]+ ${name};`), `${name} reaches the vista program`);
}
assert.equal(uniforms.uVCShade.value, 0, 'off until bound');
assert.match(HORIZON_CLOUD_SHADE_FRAGMENT, /if \(uVCShade > 0\.001\) \{/, 'the fetches sit inside the layer\'s branch');
assert.equal((HORIZON_CLOUD_SHADE_FRAGMENT.match(/texture2D\(/g) ?? []).length, 2, 'two field fetches: the weather and the streets');
assert.match(HORIZON_CLOUD_SHADE_FRAGMENT, /\/ 12000\.0\)/, 'the lookups divide by the 12 km tile');
assert.ok(HORIZON_VISTA_FRAGMENT.includes(HORIZON_CLOUD_SHADE_FRAGMENT) && HORIZON_VISTA_FRAGMENT.includes('sunVis *= cloudLit;'),
  'the vista program multiplies its sun visibility by the cloud shade');

// the binder
assert.equal(bindHorizonCloudShade(uniforms, null), false, 'no layer: off');
assert.equal(uniforms.uVCShade.value, 0);
const weather = { isTexture: true, name: 'weather' }, streets = { isTexture: true, name: 'streets' };
const shift = { x: 12, y: -7 }, streetShift = { x: 3, y: 4 }, wind = { x: 0.6, y: 0.8 };
const layer = {
  active: true, shadowsActive: true, currentPreset: { shadow: true, baseM: 1400, coverage: 0.3 },
  goboMaterial: { uniforms: {
    tWeather: { value: weather }, tStreets: { value: streets }, uWeatherShift: { value: shift }, uStreetShift: { value: streetShift },
    uWindDir: { value: wind }, uStreets: { value: 0.85 }, uFieldMix: { value: 0.1 }, uThreshold: { value: 0.42 },
  } },
};
assert.equal(bindHorizonCloudShade(uniforms, layer), true, 'a shadowing layer binds');
assert.equal(uniforms.uVCWeather.value, weather); assert.equal(uniforms.uVCStreets.value, streets);
assert.equal(uniforms.uVCWeatherShift.value, shift, 'the shift is bound by reference (the wind moves it without a copy)');
assert.equal(uniforms.uVCWindDir.value, wind);
assert.equal(uniforms.uVCStreetMix.value, 0.85); assert.equal(uniforms.uVCFieldMix.value, 0.1); assert.equal(uniforms.uVCThreshold.value, 0.42);
assert.equal(uniforms.uVCBase.value, 1400); assert.equal(uniforms.uVCShade.value, HORIZON_CLOUD_SHADE_STRENGTH);
shift.x = 99;
assert.equal(uniforms.uVCWeatherShift.value.x, 99, 'a later wind step reaches the ring with no rebind');
assert.equal(bindHorizonCloudShade(uniforms, { ...layer, currentPreset: { shadow: false, baseM: 700, coverage: 0.9 } }), false, 'a regime without shadows: off');
assert.equal(uniforms.uVCShade.value, 0);
assert.equal(bindHorizonCloudShade(uniforms, { ...layer, active: false }), false, 'an inactive layer: off');
assert.equal(bindHorizonCloudShade(uniforms, { ...layer, goboMaterial: undefined }), false, 'no gobo uniforms exposed: off (the cloud lane owns that module)');
assert.equal(bindHorizonCloudShade(uniforms, { ...layer, shadowsActive: false }), false, 'shadows not attached: off');
console.log('horizonCloudShade.selftest: tile, uniforms, program and binder PASS');
