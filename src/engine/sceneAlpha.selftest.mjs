// sceneAlpha.selftest — the scene target's alpha law, its one writer and its readers (contact r2, the engine-cs lane,
// 2026-10-14: the ground occlusion's snow law keyed on each receiver's own snow cover, which the terrain writes there).
// Pinned: the half-float round trip of every sun visibility at every snow level (the target is HalfFloat), the band's
// place between the lit band and the vehicles (every reader's thresholds read a snowy pixel as lit ground), the GLSL's
// constants against the CPU law, the lighting chunk writing the band only under COT_SNOW_COVER, the terrain defining it
// with its cover law, and the aerial pass's readers going through the one decode.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SCENE_ALPHA_LIT, SCENE_ALPHA_OPAQUE, SCENE_ALPHA_READ_GLSL, SCENE_ALPHA_SNOW_BAND, SCENE_ALPHA_SNOW_BASE, SCENE_ALPHA_SNOW_LEVELS,
  SCENE_ALPHA_SNOW_MIN, SCENE_ALPHA_SNOW_READ_GLSL, SCENE_ALPHA_SNOW_SPAN, SCENE_ALPHA_SNOW_WRITE_GLSL, decodeSceneSnow,
  decodeSceneSunVis, encodeSceneAlpha, sceneSnowLevel,
} from './sceneAlpha.ts';
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';
import { contactShadowSunVisibility } from './contactShadows.ts';

const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
// a half float's rounding (round to nearest even on the 10-bit mantissa), the target's storage
const half = (x) => THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(x));

// ---- 1. the band sits between the lit band's top and the vehicles'
const top = SCENE_ALPHA_SNOW_BASE + (SCENE_ALPHA_SNOW_LEVELS - 1) * SCENE_ALPHA_SNOW_BAND + SCENE_ALPHA_SNOW_SPAN;
assert.ok(SCENE_ALPHA_LIT + 1 < SCENE_ALPHA_SNOW_MIN && SCENE_ALPHA_SNOW_MIN < SCENE_ALPHA_SNOW_BASE, 'over a sunlit pixel\'s 3.0');
assert.ok(half(top) < VEHICLE_ALPHA_MIN && top < VEHICLE_ALPHA_MIN, `under the vehicles' ${VEHICLE_ALPHA_MIN} (top ${top})`);
assert.ok(SCENE_ALPHA_SNOW_SPAN < SCENE_ALPHA_SNOW_BAND, 'a gap between the levels');
assert.ok(SCENE_ALPHA_SNOW_MIN >= SCENE_ALPHA_OPAQUE, 'a snowy pixel is lit to every reader that asks (≥ 1.5)');

// ---- 2. the round trip through the half-float target: every visibility, every cover
let worstVis = 0;
for (let k = 0; k <= 1000; k++) {
  const v = k / 1000;
  for (const cover of [0, 0.1, 0.2, 0.34, 0.5, 0.6, 0.67, 0.84, 1]) {
    const a = half(encodeSceneAlpha(v, cover));
    const level = sceneSnowLevel(cover);
    assert.equal(decodeSceneSnow(a), level / SCENE_ALPHA_SNOW_LEVELS, `cover ${cover} at visibility ${v}: level ${level}`);
    worstVis = Math.max(worstVis, Math.abs(decodeSceneSunVis(a) - v));
    assert.ok(a >= SCENE_ALPHA_OPAQUE && a < VEHICLE_ALPHA_MIN, 'lit ground to every threshold reader');
    assert.equal(contactShadowSunVisibility(a), decodeSceneSunVis(a), 'the contact shadows decode through the law');
  }
}
assert.ok(worstVis <= 1 / 64, `the visibility survives the half float within 1/64 (worst ${worstVis.toFixed(5)})`);
// off the band nothing changes: a lit pixel 2 + v, a vehicle 4 + v, a card its coverage
for (const v of [0, 0.25, 1]) {
  assert.equal(encodeSceneAlpha(v, 0), 2 + v, 'no snow: 2 + v as before');
  assert.equal(decodeSceneSunVis(2 + v), v); assert.equal(decodeSceneSnow(2 + v), 0);
  assert.equal(decodeSceneSunVis(4 + v), v, 'a vehicle'); assert.equal(decodeSceneSnow(4 + v), 0);
}
assert.equal(decodeSceneSunVis(0.7), -1, 'a card'); assert.equal(decodeSceneSnow(0.7), 0);
assert.equal(sceneSnowLevel(0.16), 0, 'a trace of snow writes none'); assert.equal(sceneSnowLevel(0.17), 1);

// ---- 3. the GLSL carries the CPU law's numbers
const f4 = (x) => x.toFixed(4);
for (const c of [SCENE_ALPHA_SNOW_BASE, SCENE_ALPHA_SNOW_BAND, SCENE_ALPHA_SNOW_SPAN]) {
  assert.ok(SCENE_ALPHA_SNOW_WRITE_GLSL.includes(f4(c)) && SCENE_ALPHA_READ_GLSL.includes(f4(c)), `writer and reader share ${c}`);
}
assert.ok(SCENE_ALPHA_SNOW_WRITE_GLSL.includes(`floor( clamp( cotSnowCover, 0.0, 1.0 ) * ${f4(SCENE_ALPHA_SNOW_LEVELS)} + 0.5 )`), 'the level, rounded');
assert.ok(SCENE_ALPHA_READ_GLSL.startsWith(SCENE_ALPHA_SNOW_READ_GLSL) && SCENE_ALPHA_READ_GLSL.includes('float cotSunVisOf( float a ) {')
  && SCENE_ALPHA_SNOW_READ_GLSL.includes('float cotSnowOf( float a ) {'), 'the readers');
assert.ok(SCENE_ALPHA_READ_GLSL.includes(`if ( a >= ${f4(VEHICLE_ALPHA_MIN)} ) return clamp( a - 4.0, 0.0, 1.0 );`)
  && SCENE_ALPHA_READ_GLSL.includes(`if ( a >= ${f4(SCENE_ALPHA_SNOW_MIN)} )`), 'vehicles first, then the band');

// ---- 4. the wiring: the one writer, its one material, the readers
const lighting = here('./lighting.ts'), terrain = here('../world/terrain.ts'), contact = here('./contactShadows.ts');
const ground = here('./vehicleGroundOcclusion.ts');
assert.match(lighting, /#if defined\( COT_SUN_VIS_CAPTURED \) && defined\( OPAQUE \) && defined\( USE_CSM \)\n#ifdef COT_SNOW_COVER\n\{\$\{SCENE_ALPHA_SNOW_WRITE_GLSL\}\n\}\n#else\ngl_FragColor\.a = 2\.0 \+ cotSunVis;\n#endif\n#endif/,
  'the lit chunk writes the band only where COT_SNOW_COVER is defined');
assert.equal((terrain.match(/#define COT_SNOW_COVER 1/g) ?? []).length, 1, 'the terrain defines it, once');
assert.ok(terrain.includes('float cotSnowCover = 0.0;')
  && terrain.includes('cotSnowCover = uReduxD.y > 1.5 ? smoothstep(0.38, 0.60, dot(gSplatAlbedo, vec3(0.2126, 0.7152, 0.0722))) : 0.0;'),
  'its cover: a snow map\'s final albedo between its bare layers and its snow');
assert.ok(terrain.indexOf('cotSnowCover = uReduxD.y') > terrain.indexOf('gSplatAlbedo *= 1.0 - fMs * uSea * 0.42;'), 'read off the final albedo');
assert.ok(contact.includes('${SCENE_ALPHA_READ_GLSL}') && !contact.includes('float cotSunVisOf( float a ) {'), 'the contact block reads through the law');
assert.ok(ground.includes('float snowW = uVehGroundSnow * cotSnowOf( alpha );'), 'the ground occlusion weighs its snow law by the receiver\'s cover');

console.log(`sceneAlpha.selftest: the snow band between the lit band and the vehicles (${SCENE_ALPHA_SNOW_BASE}–${top.toFixed(2)}), `
  + `the half-float round trip (visibility within ${worstVis.toFixed(4)}, every level exact), the GLSL's numbers, the one writer (the terrain under `
  + `COT_SNOW_COVER) and the readers PASS`);
