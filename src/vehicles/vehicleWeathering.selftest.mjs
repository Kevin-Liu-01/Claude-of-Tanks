// vehicleWeathering.selftest.mjs — the vehicles' weathering by battlefield (vehicleWeathering.ts, 2026-10-04, the
// vehicle-look lane): every battlefield has a row whose soil is the map's own dirt (the terrain's dirt-tone law over its
// loam base, world/rockDressing.ts), the climates' amounts stay in range (snow only where it snows, mud only where it is
// wet), the uniforms follow the row and the detail level without a relink, the per-frame sync applies a row only on a
// change, the Garage keeps a light motor-pool wear, and the hook lays the layer once, before the light is gathered, on
// every vehicle material but the optics.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CLEAN_VEHICLE_WEATHER, VEHICLE_WEATHER_BY_MAP, VEHICLE_WEATHER_FRAGMENT_GLSL, VEHICLE_WEATHER_LEVEL, VEHICLE_WEATHER_REACH_DRY_M,
  VEHICLE_WEATHER_REACH_WET_M, VEHICLE_WEATHER_SNOW, VEHICLE_WEATHER_PACKED_SNOW, VEHICLE_WEATHER_SNOW_LUMP, VEHICLE_WEATHER_SLUSH,
  VEHICLE_WEATHER_SNOW_PACK_COVER, VEHICLE_WEATHER_SNOW_REACH_M,
  VEHICLE_WEATHER_MUD_ROUGHNESS, applyVehicleWeather,
  bindVehicleWeatherUniforms, garageVehicleWeather, liftedDustHex, mudColorOf, setVehicleWeatherLevel, syncVehicleWeather,
  vehicleWeatherForMap, vehicleWeatherLevelFor, vehicleWeatherState,
} from './vehicleWeathering.ts';
import { vehicleAmbientFloorHook } from './materials.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { rockDressingFor } from '../world/rockDressing.ts';

const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const BARE = new Set(['desert', 'urban', 'autumn', 'steppe', 'railyard', 'badlands', 'alpine', 'caldera', 'foundry', 'ruinspires',
  'blackglass', 'titan_gorge', 'skybridge', 'copper_mesa', 'moon']);

// 1. one row per battlefield, its soil the map's own dirt
assert.deepEqual(Object.keys(VEHICLE_WEATHER_BY_MAP).sort(), [...MAP_IDS].sort(), 'one row per battlefield');
const soil = new THREE.Color();
for (const id of MAP_IDS) {
  const row = VEHICLE_WEATHER_BY_MAP[id];
  const dirt = rockDressingFor(id, getMapConfig(id)?.splat?.dirtTone ?? null).soil;
  soil.setRGB(dirt[0], dirt[1], dirt[2]);
  assert.equal(row.soilHex, soil.getHex(THREE.SRGBColorSpace), `${id}: the soil is the map's dirt (rockDressing's law), 0x${soil.getHexString(THREE.SRGBColorSpace)}`);
  for (const key of ['dust', 'film', 'snow', 'wet', 'grime', 'wear']) {
    assert.ok(row[key] >= 0 && row[key] <= 1, `${id}.${key} in 0..1`);
  }
  assert.ok(row.film <= 0.12, `${id}: the film stays a film (the camo keeps its contrast): ${row.film}`);
  assert.ok(row.dust >= 0.45 && row.dust <= 0.8, `${id}: every battlefield leaves its dirt on the running gear, as a film (${row.dust})`);
  // the dry dust: the battlefield's bare ground where it authors one and is bare, dirty slush on the snow maps, else the
  // dirt lifted and bleached
  const config = getMapConfig(id);
  const ground = config?.sky?.lighting?.groundAlbedoHex ?? config?.sky?.atmosphere?.groundAlbedoHex ?? null;
  if (row.snow >= 0.5) assert.equal(row.dustHex, VEHICLE_WEATHER_SLUSH, `${id}: dirty slush`);
  else if (id === 'oasis') assert.equal(row.dustHex, VEHICLE_WEATHER_BY_MAP.desert.dustHex, 'oasis: Sirocco\'s sand');
  else if (BARE.has(id)) assert.equal(row.dustHex, ground, `${id}: the bare ground is the dust (0x${(ground ?? 0).toString(16)})`);
  else assert.equal(row.dustHex, liftedDustHex(row.soilHex), `${id}: its dirt lifted`);
  const dustColor = new THREE.Color().setHex(row.dustHex, THREE.SRGBColorSpace), dirtColor = new THREE.Color().setHex(row.soilHex, THREE.SRGBColorSpace);
  assert.ok(luma(dustColor) > luma(dirtColor), `${id}: dust is paler than the dirt it rose from`);
}
// the bare battlefields (their light model's ground albedo is bare ground, not a sward or snow)
assert.deepEqual([...BARE].filter((id) => !(getMapConfig(id)?.sky?.lighting?.groundAlbedoHex ?? getMapConfig(id)?.sky?.atmosphere?.groundAlbedoHex)), [],
  'every bare battlefield authors its ground albedo');
const snowy = MAP_IDS.filter((id) => VEHICLE_WEATHER_BY_MAP[id].snow > 0).sort();
assert.deepEqual(snowy, ['alpine', 'whiteout', 'winter'], 'snow only on the snow maps');
for (const id of ['desert', 'badlands', 'titan_gorge', 'copper_mesa', 'oasis', 'mars', 'moon']) {
  assert.equal(VEHICLE_WEATHER_BY_MAP[id].wet, 0, `${id}: dry dust, no mud`);
}
for (const id of ['delta', 'monsoon', 'mangrove', 'polders', 'fjord']) {
  assert.ok(VEHICLE_WEATHER_BY_MAP[id].wet >= 0.7, `${id}: wet mud`);
}
assert.equal(vehicleWeatherForMap('no-such-map').dust, VEHICLE_WEATHER_BY_MAP.verdant.dust, 'an unknown id is temperate loam');

// 2. lifted dust keeps the dirt's hue and is paler and less saturated; mud is the dirt darkened; mud stays matte
for (const id of ['verdant', 'coastal', 'fjord', 'mars']) {
  const hex = VEHICLE_WEATHER_BY_MAP[id].soilHex;
  const base = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const dust = new THREE.Color().setHex(liftedDustHex(hex), THREE.SRGBColorSpace), mud = mudColorOf(hex);
  assert.ok(luma(dust) > luma(base) * 1.15, `${id}: dust is paler than its dirt`);
  assert.ok(luma(mud) < luma(base) * 0.7, `${id}: mud is darker than its dirt`);
  const hsl = { h: 0, s: 0, l: 0 }, dh = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl, THREE.SRGBColorSpace); dust.getHSL(dh, THREE.SRGBColorSpace);
  assert.ok(Math.abs(hsl.h - dh.h) < 0.02 && dh.s < hsl.s, `${id}: the dust keeps the dirt's hue, bleached`);
}
assert.ok(VEHICLE_WEATHER_MUD_ROUGHNESS >= 0.6, 'damp mud never turns glossy (chrome-silver slush on the first pair)');
assert.ok(VEHICLE_WEATHER_PACKED_SNOW.every((v, i) => v < VEHICLE_WEATHER_SNOW[i] * 0.75), 'trodden snow is greyer than fresh');
// the slush is the dark wet dirt (a pale grey slush under a grey snow veil turned the dark wheels and shoes one even mid
// grey, read as polished alloy on the lane's final pair); the white is the snow's
assert.ok(luma(new THREE.Color().setHex(VEHICLE_WEATHER_SLUSH, THREE.SRGBColorSpace)) < 0.18, 'the slush is dark wet dirt, not a pale veil');
assert.ok(Math.min(...VEHICLE_WEATHER_PACKED_SNOW) > 0.5, 'and the trodden snow is still snow, well above it');

// 3. the uniforms: the row and the level, one identity for every program (no relink)
const uniforms = {}, uniforms2 = {};
bindVehicleWeatherUniforms(uniforms); bindVehicleWeatherUniforms(uniforms2);
for (const key of ['uVehWeatherA', 'uVehWeatherB', 'uVehDust', 'uVehMud']) assert.strictEqual(uniforms[key], uniforms2[key], `${key}: one shared uniform`);
setVehicleWeatherLevel(2);
applyVehicleWeather(VEHICLE_WEATHER_BY_MAP.winter);
let state = vehicleWeatherState();
assert.deepEqual(state.a.map((v) => +v.toFixed(3)), [0.45, 0, 0.8, 0.3], 'winter: dust, film, snow, wet');
assert.equal(state.b[2], 2, 'the level gates the layer');
applyVehicleWeather(CLEAN_VEHICLE_WEATHER);
assert.equal(vehicleWeatherState().b[2], 0, 'a clean row closes the gate whatever the level');
assert.throws(() => setVehicleWeatherLevel(3), /0, 1 or 2/);
for (const [preset, level] of [['ultra', 2], ['high', 2], ['medium', 1], ['low', 1], ['mobile', 1], ['mobile-low', 1], ['mobile-high', 1]]) {
  assert.equal(vehicleWeatherLevelFor(preset), level, `${preset} → ${level}`);
}
assert.equal(Object.keys(VEHICLE_WEATHER_LEVEL).length, 7);

// 4. the per-frame sync: a row only on a change; the Garage's light motor-pool wear; the QA switch
const garage = garageVehicleWeather('desert');
assert.equal(garage.soilHex, VEHICLE_WEATHER_BY_MAP.desert.soilHex, 'the Garage wears its workshop map\'s dirt');
assert.equal(garage.dustHex, VEHICLE_WEATHER_BY_MAP.desert.dustHex, 'and its dust');
assert.equal(garageVehicleWeather('winter').dustHex, liftedDustHex(VEHICLE_WEATHER_BY_MAP.winter.soilHex), 'a winter workshop\'s floor is dry dirt, not slush');
assert.equal(garage.snow, 0); assert.equal(garage.wet, 0); assert.equal(garage.film, 0);
assert.ok(garage.dust <= 0.3 && garage.grime > 0 && garage.wear > 0, 'seams, edges and a little running-gear dust');
assert.equal(syncVehicleWeather(true, 'verdant'), true, 'entering the Garage applies its row');
assert.equal(syncVehicleWeather(true, 'verdant'), false, 'the steady Garage frame applies nothing');
assert.equal(vehicleWeatherState().a[2], 0, 'no snow in the Garage');
assert.equal(syncVehicleWeather(false, 'winter'), true, 'a battlefield applies its row');
assert.equal(syncVehicleWeather(false, 'winter'), false);
assert.equal(+vehicleWeatherState().a[2].toFixed(3), 0.8, 'the winter battlefield snows');
globalThis.window = { __VEHICLE_WEATHER_DEBUG: { off: true } };
try {
  syncVehicleWeather(false, 'winter');
  assert.equal(vehicleWeatherState().b[2], 0, 'the QA switch draws every vehicle clean');
  globalThis.window.__VEHICLE_WEATHER_DEBUG = { scale: 0.5 };
  syncVehicleWeather(false, 'winter');
  assert.equal(+vehicleWeatherState().a[2].toFixed(3), 0.4, 'the QA scale multiplies the amounts');
  assert.equal(vehicleWeatherState().b[2], 2, 'and keeps the level');
  delete globalThis.window.__VEHICLE_WEATHER_DEBUG;
  syncVehicleWeather(false, 'winter');
  assert.equal(+vehicleWeatherState().a[2].toFixed(3), 0.8, 'releasing the switch restores the row');
} finally {
  delete globalThis.window;
}
assert.equal(syncVehicleWeather(false, null), true, 'no world: clean');
assert.equal(vehicleWeatherState().b[2], 0);

// 5. the hook: the layer once, before the light is gathered, gated by the level and the ground reference; the optics opt out
const material = new THREE.MeshStandardMaterial();
material.onBeforeCompile = vehicleAmbientFloorHook;
const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
material.onBeforeCompile(shader, {});
const fragment = shader.fragmentShader;
assert.equal(fragment.split(VEHICLE_WEATHER_FRAGMENT_GLSL).length, 2, 'the layer appears once');
assert.ok(fragment.indexOf(VEHICLE_WEATHER_FRAGMENT_GLSL) < fragment.indexOf('#include <lights_physical_fragment>'), 'before the light is gathered');
assert.ok(fragment.indexOf('#include <normal_fragment_maps>') < fragment.indexOf(VEHICLE_WEATHER_FRAGMENT_GLSL), 'after the normal (the seams read it)');
assert.ok(fragment.indexOf('uniform vec3 uVehUp;') < fragment.indexOf('uniform vec4 uVehWeatherA;'), 'its uniforms follow the ground reference');
assert.match(VEHICLE_WEATHER_FRAGMENT_GLSL, /#ifndef COT_VEH_CLEAN/, 'the optics opt out');
assert.match(VEHICLE_WEATHER_FRAGMENT_GLSL, /if \( uVehWeatherB\.z > 0\.5 && uVehGround\.w > 0\.5 \)/, 'gated by the level and a vehicle root');
assert.equal(shader.vertexShader.split('vCotVehObj = transformed;').length, 2, 'each part\'s own frame, once');
assert.ok(shader.vertexShader.indexOf('#include <begin_vertex>') < shader.vertexShader.indexOf('vCotVehObj = transformed;'));
for (const key of ['uVehWeatherA', 'uVehWeatherB', 'uVehDust', 'uVehMud']) assert.strictEqual(shader.uniforms[key], uniforms[key], `${key} bound`);
material.dispose();

// 6. the height law (the GLSL's cvLow, noise at its mean): dust holds on the running gear and is gone well up the hull,
// and wet mud stays lower than dry dust
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const low = (h, wet) => 1 - smoothstep(0.12, VEHICLE_WEATHER_REACH_DRY_M + (VEHICLE_WEATHER_REACH_WET_M - VEHICLE_WEATHER_REACH_DRY_M) * wet, h);
assert.ok(low(0.3, 0) > 0.85 && low(0.3, 1) > 0.7, 'the running gear (0.3 m) is under the dust');
assert.ok(low(1.6, 0) === 0 && low(1.0, 1) === 0, 'the upper hull is past its reach');
assert.ok(low(0.6, 1) < low(0.6, 0), 'mud stays lower than dust');
assert.ok(VEHICLE_WEATHER_SNOW.every((v) => v > 0.75 && v < 0.9), 'snow is snow-white, not clipped white');

// 7. the snow law (the GLSL's cvSnowTop and cvSnowPack at the breakup's quantiles, one octave: 10th percentile 0.24,
// median 0.49, 90th percentile 0.74): a sheet of fresh snow on the deck; trodden snow packed low in the running gear (the
// bottom run, the wheels' feet) with holes, nothing up the wheels; fresh snow on the gear's tops only in lumps — never a
// veil over a whole wheel or shoe, never an unbroken band along a curved top, never blotches over the whole gear
const [lumpLo, lumpHi] = VEHICLE_WEATHER_SNOW_LUMP;
const [coverLo, coverHi] = VEHICLE_WEATHER_SNOW_PACK_COVER;
const lerp = (a, b, t) => a + (b - a) * t;
const snowTop = (up, b, lowness) => smoothstep(0.55, 0.85, up + (b - 0.5) * 0.35) * smoothstep(lerp(0.3, lumpLo, lowness), lerp(0.55, lumpHi, lowness), b);
const snowPack = (h, b) => (1 - smoothstep(0.1, VEHICLE_WEATHER_SNOW_REACH_M, h + (b - 0.5) * 0.3)) * smoothstep(coverLo, coverHi, b);
assert.ok(snowTop(1, 0.49, 0) > 0.75, 'the deck takes a sheet of fresh snow');
assert.ok(snowTop(1, 0.49, 1) < 0.05, 'a running-gear top at the breakup\'s median shows its steel');
assert.equal(snowTop(1, 0.74, 1), 1, 'fresh snow on a gear top only where a lump is');
assert.equal(snowPack(0.05, 0.49), 1, 'the bottom run is packed');
assert.ok(snowPack(0.2, 0.49) > 0.6, 'and the wheels\' feet');
assert.equal(snowPack(0.05, 0.24), 0, 'with holes where the breakup is low');
assert.equal(snowPack(0.6, 0.74), 0, 'nothing packs up the wheels, whatever the breakup');
assert.ok(VEHICLE_WEATHER_SNOW_REACH_M < 0.5, 'the packed band stays under the road wheels\' hubs');
assert.doesNotMatch(VEHICLE_WEATHER_FRAGMENT_GLSL, /cvSnowPack > cvSnowTop \?/, 'fresh and trodden snow blend, no seam inside a lump');
assert.match(VEHICLE_WEATHER_FRAGMENT_GLSL, /float cvSnowLow = 1\.0 - smoothstep\( 0\.1, [0-9.]+, cvH \+ \( cvB - 0\.5 \) \* 0\.3 \);/, 'the GLSL is the law above');
assert.match(VEHICLE_WEATHER_FRAGMENT_GLSL, /float cvSnowPack = cvSnowLow \* smoothstep\( [0-9.]+, [0-9.]+, cvB \);/);

console.log(`vehicleWeathering.selftest: ${MAP_IDS.length} battlefield rows on their own dirt, climates in range, shared uniforms, `
  + 'change-only sync, Garage wear, QA switch, the layer once before the light, optics clean PASS');
