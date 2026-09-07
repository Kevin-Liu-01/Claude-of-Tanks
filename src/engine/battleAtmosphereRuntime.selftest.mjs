import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { createBattleAtmosphereRuntime, BATTLE_WEATHER_BIOMES } from './battleAtmosphereRuntime.ts';
import { getVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';

assert.deepEqual(Object.keys(BATTLE_WEATHER_BIOMES).sort(), [...MAP_IDS].sort(), 'every catalog map is covered without loading full configs');
assert.equal(Object.isFrozen(BATTLE_WEATHER_BIOMES), true);
assert.equal(BATTLE_WEATHER_BIOMES.winter, 'cold'); assert.equal(BATTLE_WEATHER_BIOMES.alpine, 'cold');
assert.equal(BATTLE_WEATHER_BIOMES.desert, 'arid'); assert.equal(BATTLE_WEATHER_BIOMES.monsoon, 'tropical');
assert.equal(BATTLE_WEATHER_BIOMES.whiteout, 'cold'); assert.equal(BATTLE_WEATHER_BIOMES.mangrove, 'tropical');
assert.equal(BATTLE_WEATHER_BIOMES.polders, 'coastal'); assert.equal(BATTLE_WEATHER_BIOMES.copper_mesa, 'arid');
const scene = new THREE.Scene();
const base = Object.freeze({ sunElevationDeg: 38, sunAzimuthDeg: 104,
  fogDensity: .0006, fogTintHex: 0x849ea0, fogMix: .56, envIntensity: .22,
  cloudOpacity: 1.16, cloudOpacity2: .96, cloudTintHex: 0xdce4df,
  sunIntensity: 3.55, sunColorHex: 0xffe7c5, hemiIntensity: .42, fillIntensity: .66, postExposure: .95 });
let authoredReads = 0;
const applied = [];
const runtime = createBattleAtmosphereRuntime({
  get scene() { throw new Error('atmosphere must not acquire a precipitation scene'); },
  get getCameraPosition() { throw new Error('fixed day/night must not acquire a frame camera'); },
  getAuthoredPreset() { authoredReads++; return base; },
  applyPreset(preset) { applied.push(preset); },
});
assert.equal(runtime.weather, null); assert.equal(applied.length, 0); assert.equal(scene.children.length, 0);
assert.deepEqual(Object.keys(runtime).sort(), ['dispose', 'prepare', 'reset', 'weather']);
assert.equal(runtime.update, undefined, 'fixed day/night has no frame-loop entry point');
runtime.reset();
assert.equal(applied.length, 0, 'Garage constructor/reset has no presentation work');
try {
  runtime.prepare(undefined, 'verdant');
  assert.equal(runtime.weather, null, 'old server has no invented authoritative weather seed');
  assert.deepEqual(applied.at(-1), base); assert.equal(scene.children.length, 0);
  runtime.prepare(undefined, 'verdant');
  assert.equal(applied.length, 1, 'same legacy match is idempotent');
  runtime.reset(); assert.deepEqual(applied.at(-1), base);
  runtime.prepare(1337, 'monsoon');
  assert.equal(runtime.weather.condition, 'clear'); assert.equal(runtime.weather.timeOfDay, 'day');
  const day = applied.at(-1);
  assert.deepEqual(day, base, 'all authored day fog/cloud/light values remain exact');
  assert.equal(scene.children.length, 0);
  const callbacksBefore = applied.length, readsBefore = authoredReads;
  runtime.prepare(2 ** 32 + 1337, 'monsoon');
  assert.equal(applied.length, callbacksBefore, 'same canonical seed cannot re-bake');
  assert.equal(authoredReads, readsBefore, 'same match requires no authored-preset read');
  runtime.prepare(3, 'winter');
  const night = applied.at(-1);
  assert.equal(runtime.weather.condition, 'clear'); assert.equal(runtime.weather.timeOfDay, 'night');
  assert.equal(getVehicleReadabilityScale(), .12, 'night dims daylight-calibrated vehicle floors');
  assert.equal(night.skyIntensity, .035); assert.equal(night.sunElevationDeg, 20);
  assert.equal(night.sunIntensity, .32); assert.equal(night.sunColorHex, 0xa6bce8);
  assert.equal(night.hemiIntensity, .28); assert.equal(night.fillIntensity, .12); assert.equal(night.envIntensity, .75);
  assert.equal(night.cloudTintHex, 0x33455e); assert.equal(night.fogTintHex, 0x34455a);
  assert.equal(night.fogMix, .7); assert.equal(night.postExposure, .95);
  assert.equal(night.cloudOpacity, base.cloudOpacity); assert.equal(night.cloudOpacity2, base.cloudOpacity2);
  assert.equal(night.fogDensity, base.fogDensity, 'night retains authored fog density');
  assert.equal(scene.children.length, 0, 'old snow seed allocates no particles or lights');
  const beforeRematch = applied.length;
  runtime.prepare(13, 'winter');
  assert.equal(applied.length, beforeRematch + 1, 'same map/new seed reapplies atmosphere');
  assert.equal(runtime.weather.timeOfDay, 'day');
  assert.equal(getVehicleReadabilityScale(), 1, 'day rematch restores exact authored readability');
  assert.deepEqual(applied.at(-1), base, 'day rematch restores the exact authored preset');
  runtime.prepare(16, 'winter');
  assert.equal(runtime.weather.condition, 'clear', 'old fog seed cannot amplify map fog');
  assert.equal(applied.at(-1).fogDensity, base.fogDensity);
  runtime.prepare(0, 'verdant');
  assert.equal(runtime.weather.condition, 'clear'); assert.equal(scene.children.length, 0);
  const beforeInvalid = applied.length;
  const beforeInvalidWeather = runtime.weather;
  assert.throws(() => runtime.prepare(NaN, 'verdant'), /seed/);
  assert.throws(() => runtime.prepare(1, 'random'), /catalog map id/);
  assert.equal(applied.length, beforeInvalid, 'invalid prepare cannot mutate atmosphere');
  assert.strictEqual(runtime.weather, beforeInvalidWeather);
  runtime.reset();
  assert.deepEqual(applied.at(-1), base); assert.equal(runtime.weather, null);
  const afterReset = applied.length;
  runtime.reset();
  assert.equal(applied.length, afterReset, 'reset restores exactly once; no frame entry can wake');
  runtime.prepare(3, 'winter');
  assert.equal(getVehicleReadabilityScale(), .12);
  assert.equal(scene.children.length, 0);
  for (const mapId of MAP_IDS) {
    runtime.reset();
    runtime.prepare(3, mapId);
    assert.equal(runtime.weather.timeOfDay, 'night', `${mapId}: shared night selection`);
    assert.equal(runtime.weather.condition, 'clear', `${mapId}: no weather`);
    assert.equal(runtime.weather.precipitationIntensity, 0, `${mapId}: no precipitation`);
    assert.equal(scene.children.length, 0, `${mapId}: no weather resources`);
    runtime.reset();
    assert.deepEqual(applied.at(-1), base, `${mapId}: Garage restores authored presentation`);
    runtime.prepare(13, mapId);
    assert.equal(runtime.weather.timeOfDay, 'day', `${mapId}: day rematch`);
    assert.deepEqual(applied.at(-1), base, `${mapId}: unchanged authored day preset`);
  }
} finally { runtime.dispose(); }
const afterDispose = applied.length;
assert.equal(getVehicleReadabilityScale(), 1, 'dispose restores Garage readability');
runtime.dispose(); runtime.reset();
assert.equal(applied.length, afterDispose);
assert.equal(scene.children.length, 0);
assert.throws(() => runtime.prepare(1337, 'monsoon'), /disposed/);

// Actual material colors: alias de-duplication, name/type exclusion, same-ID
// rebuilt worlds, rematches and exact restoration all execute production owner.
function horizonFixture() {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const shared = new THREE.MeshBasicMaterial({ color: 0x779966 });
  const untouched = new THREE.MeshBasicMaterial({ color: 0xccaa77 });
  const mixed = new THREE.MeshBasicMaterial({ color: 0x55aabb });
  const standard = new THREE.MeshStandardMaterial({ color: 0x9f6633 });
  for (const [name, material] of [['horizon-ring', shared], ['horizon-treeline', [shared]],
    ['ordinary-prop', untouched], ['horizon-ring', standard],
    ['horizon-treeline', mixed], ['unrelated-shared-prop', mixed]]) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; root.add(mesh);
  }
  const materials = [shared, untouched, mixed, standard];
  const snapshots = materials.map(material => [material, material.color, material.color.clone(), material.version]);
  return { root, shared, geometry, materials, snapshots };
}
const first = horizonFixture(), second = horizonFixture();
let worldRoot = first.root;
const horizonRuntime = createBattleAtmosphereRuntime({
  getAuthoredPreset: () => base,
  getWorldRoot: () => worldRoot, applyPreset() {},
});
function colorsRestored(fixture) {
  for (const [material, identity, color, version] of fixture.snapshots) {
    assert.strictEqual(material.color, identity); assert.deepEqual(material.color, color);
    assert.equal(material.version, version, 'no new shader/needsUpdate');
  }
}
try {
  horizonRuntime.prepare(3, 'winter');
  const initial = first.snapshots[0][2];
  assert.deepEqual(first.shared.color.toArray(), [initial.r * .12, initial.g * .12, initial.b * .12],
    'two named meshes sharing one material get exactly one night multiplier');
  for (const [material, identity, color, version] of first.snapshots.slice(1)) {
    assert.strictEqual(material.color, identity); assert.deepEqual(material.color, color);
    assert.equal(material.version, version, 'unnamed/standard/mixed-use materials untouched');
  }
  const dimmed = first.shared.color.clone();
  horizonRuntime.prepare(3, 'winter');
  assert.deepEqual(first.shared.color, dimmed, 'same match never compounds tint');
  horizonRuntime.prepare(7, 'winter');
  assert.deepEqual(first.shared.color, dimmed, 'new night restores before collecting again');
  worldRoot = second.root;
  horizonRuntime.prepare(7, 'winter');
  colorsRestored(first);
  assert.deepEqual(second.shared.color, dimmed, 'same map/seed but rebuilt root is re-keyed');
  horizonRuntime.prepare(13, 'winter');
  colorsRestored(second);
  horizonRuntime.prepare(3, 'winter'); horizonRuntime.reset();
  colorsRestored(second);
  horizonRuntime.prepare(3, 'winter'); horizonRuntime.dispose();
  colorsRestored(second);
} finally {
  horizonRuntime.dispose();
  for (const fixture of [first, second]) {
    fixture.geometry.dispose(); for (const material of fixture.materials) material.dispose();
  }
}
const source = readFileSync(new URL('./battleAtmosphereRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from ['"].*maps\/index|from ['"].*quality|requestAnimationFrame\(|setTimeout\(|performance\.|Math\.random\(/);
assert.doesNotMatch(source, /from ['"].*(?:battlePrecipitation|battleVehicleLighting)|new THREE\./,
  'clear-only owner must not acquire a precipitation/lamp pool or create GPU resources');
console.log(`battleAtmosphereRuntime self-test: all ${MAP_IDS.length} biomes, covered match rekey, authored clouds/fog, unchanged night, no frame owner and exact restore PASS`);
