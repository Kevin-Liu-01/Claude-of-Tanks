import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { createBattleAtmosphereRuntime, BATTLE_WEATHER_BIOMES } from './battleAtmosphereRuntime.ts';
import { getVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';

assert.deepEqual(Object.keys(BATTLE_WEATHER_BIOMES).sort(), [...MAP_IDS].sort(), 'all20 maps covered without fullconfigs');
assert.equal(Object.isFrozen(BATTLE_WEATHER_BIOMES), true);
assert.equal(BATTLE_WEATHER_BIOMES.winter, 'cold'); assert.equal(BATTLE_WEATHER_BIOMES.alpine, 'cold');
assert.equal(BATTLE_WEATHER_BIOMES.desert, 'arid'); assert.equal(BATTLE_WEATHER_BIOMES.monsoon, 'tropical');
const scene = new THREE.Scene(), camera = new THREE.Vector3(25, 6, -12);
const base = Object.freeze({ sunElevationDeg: 38, sunAzimuthDeg: 104,
  fogDensity: .0006, fogTintHex: 0x849ea0, fogMix: .56, envIntensity: .22,
  cloudOpacity: 1.16, cloudOpacity2: .96, cloudTintHex: 0xdce4df,
  sunIntensity: 3.55, sunColorHex: 0xffe7c5, hemiIntensity: .42, fillIntensity: .66, postExposure: .95 });
let authoredReads = 0, cameraReads = 0;
const applied = [];
const runtime = createBattleAtmosphereRuntime({
  scene, getCameraPosition() { cameraReads++; return camera; },
  getAuthoredPreset() { authoredReads++; return base; },
  applyPreset(preset) { applied.push(preset); },
});
assert.equal(runtime.weather, null); assert.equal(applied.length, 0); assert.equal(scene.children.length, 0);
runtime.update(1, 768); runtime.reset();
assert.equal(applied.length, 0); assert.equal(cameraReads, 0, 'Garage constructor/update has no work');
let geometryDisposed = 0, materialDisposed = 0;
try {
  runtime.prepare(undefined, 'verdant', 384);
  assert.equal(runtime.weather, null, 'old server has no invented authoritative weather seed');
  assert.deepEqual(applied.at(-1), base); assert.equal(scene.children.length, 0);
  runtime.prepare(undefined, 'verdant', 64);
  assert.equal(applied.length, 1, 'same legacy match is idempotent');
  runtime.reset(); assert.deepEqual(applied.at(-1), base);
  runtime.prepare(1337, 'monsoon', 384);
  assert.equal(runtime.weather.condition, 'rain'); assert.equal(runtime.weather.timeOfDay, 'day');
  const day = applied.at(-1);
  assert.equal(day.fogDensity, .0006 * 1.2); assert.equal(day.cloudOpacity, 1.16 * 1.3);
  assert.equal(day.cloudOpacity2, .96 * 1.3);
  for (const key of Object.keys(base).filter(key => !['fogDensity', 'cloudOpacity', 'cloudOpacity2'].includes(key))) {
    assert.equal(day[key], base[key], `day preserves authored ${key}`);
  }
  assert.equal(scene.children.length, 1);
  const mesh = scene.children[0], geometry = mesh.geometry, material = mesh.material;
  geometry.addEventListener('dispose', () => geometryDisposed++);
  material.addEventListener('dispose', () => materialDisposed++);
  const seedAttribute = geometry.attributes.aSeed;
  const callbacksBefore = applied.length, readsBefore = authoredReads;
  for (let i = 0; i < 240; i++) runtime.update(i / 60, 384);
  assert.equal(applied.length, callbacksBefore, 'no per-frame PMREM/fog/light callback');
  assert.equal(authoredReads, readsBefore);
  assert.strictEqual(geometry.attributes.aSeed, seedAttribute); assert.equal(seedAttribute.version, 0);
  assert.deepEqual(material.uniforms.uCamera.value, camera);
  runtime.prepare(2 ** 32 + 1337, 'monsoon', 0);
  assert.equal(applied.length, callbacksBefore, 'same canonicalseed cannot re-bake');
  assert.equal(mesh.visible, false); assert.equal(geometry.instanceCount, 0);
  runtime.update(4, 64);
  assert.equal(mesh.visible, true); assert.equal(geometry.instanceCount, Math.ceil(64 * .627));
  assert.equal(scene.children.length, 1, 'budget recovery reuses one attached mesh');
  runtime.prepare(3, 'winter', 64);
  const night = applied.at(-1);
  assert.equal(runtime.weather.condition, 'snow'); assert.equal(runtime.weather.timeOfDay, 'night');
  assert.equal(getVehicleReadabilityScale(), .12, 'night dims daylight-calibrated vehicle floors');
  assert.equal(night.skyIntensity, .035); assert.equal(night.sunElevationDeg, 20);
  assert.equal(night.sunIntensity, .32); assert.equal(night.sunColorHex, 0xa6bce8);
  assert.equal(night.hemiIntensity, .28); assert.equal(night.fillIntensity, .12); assert.equal(night.envIntensity, .75);
  assert.equal(night.cloudTintHex, 0x33455e); assert.equal(night.fogTintHex, 0x34455a);
  assert.equal(night.fogMix, .7); assert.equal(night.postExposure, .95);
  assert.equal(night.cloudOpacity, .8); assert.equal(night.cloudOpacity2, .8);
  assert.strictEqual(scene.children[0], mesh, 'rain/snow/map transfer reuses exact pool');
  assert.equal(material.uniforms.uSnow.value, 1);
  const beforeRematch = applied.length;
  runtime.prepare(13, 'winter', 64);
  assert.equal(applied.length, beforeRematch + 1, 'same map/new seed reapplies atmosphere');
  assert.equal(runtime.weather.timeOfDay, 'day');
  assert.equal(getVehicleReadabilityScale(), 1, 'day rematch restores exact authored readability');
  runtime.prepare(0, 'verdant', 384);
  assert.equal(runtime.weather.condition, 'clear'); assert.equal(scene.children.length, 0);
  assert.equal(mesh.visible, false); assert.equal(geometry.instanceCount, 0);
  const beforeInvalid = applied.length;
  assert.throws(() => runtime.prepare(NaN, 'verdant', 384), /seed/);
  assert.throws(() => runtime.prepare(1, 'random', 384), /catalog map id/);
  assert.throws(() => runtime.prepare(1, 'verdant', -1), /budget/);
  assert.equal(applied.length, beforeInvalid, 'invalid prepare cannot mutate atmosphere');
  runtime.reset();
  assert.deepEqual(applied.at(-1), base); assert.equal(runtime.weather, null);
  const afterReset = applied.length;
  runtime.reset(); runtime.update(10, 384);
  assert.equal(applied.length, afterReset, 'reset restores exactly once; later frame cannot wake');
  runtime.prepare(3, 'winter', 0);
  assert.equal(getVehicleReadabilityScale(), .12);
  assert.strictEqual(scene.children[0], mesh); assert.equal(mesh.visible, false);
} finally { runtime.dispose(); }
const afterDispose = applied.length;
assert.equal(getVehicleReadabilityScale(), 1, 'dispose restores Garage readability');
runtime.dispose(); runtime.reset(); runtime.update(20, 768);
assert.equal(applied.length, afterDispose);
assert.equal(scene.children.length, 0); assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1);
assert.throws(() => runtime.prepare(1337, 'monsoon', 384), /disposed/);

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
const horizonRuntime = createBattleAtmosphereRuntime({ scene,
  getCameraPosition: () => camera, getAuthoredPreset: () => base,
  getWorldRoot: () => worldRoot, applyPreset() {},
});
function colorsRestored(fixture) {
  for (const [material, identity, color, version] of fixture.snapshots) {
    assert.strictEqual(material.color, identity); assert.deepEqual(material.color, color);
    assert.equal(material.version, version, 'no new shader/needsUpdate');
  }
}
try {
  horizonRuntime.prepare(3, 'winter', 0);
  const initial = first.snapshots[0][2];
  assert.deepEqual(first.shared.color.toArray(), [initial.r * .12, initial.g * .12, initial.b * .12],
    'two named meshes sharing one material get exactly one night multiplier');
  for (const [material, identity, color, version] of first.snapshots.slice(1)) {
    assert.strictEqual(material.color, identity); assert.deepEqual(material.color, color);
    assert.equal(material.version, version, 'unnamed/standard/mixed-use materials untouched');
  }
  const dimmed = first.shared.color.clone();
  horizonRuntime.prepare(3, 'winter', 64); horizonRuntime.update(1, 0);
  assert.deepEqual(first.shared.color, dimmed, 'same match/frame never compounds tint');
  horizonRuntime.prepare(7, 'winter', 0);
  assert.deepEqual(first.shared.color, dimmed, 'new night restores before collecting again');
  worldRoot = second.root;
  horizonRuntime.prepare(7, 'winter', 0);
  colorsRestored(first);
  assert.deepEqual(second.shared.color, dimmed, 'same map/seed but rebuilt root is re-keyed');
  horizonRuntime.prepare(13, 'winter', 0);
  colorsRestored(second);
  horizonRuntime.prepare(3, 'winter', 0); horizonRuntime.reset();
  colorsRestored(second);
  horizonRuntime.prepare(3, 'winter', 0); horizonRuntime.dispose();
  colorsRestored(second);
} finally {
  horizonRuntime.dispose();
  for (const fixture of [first, second]) {
    fixture.geometry.dispose(); for (const material of fixture.materials) material.dispose();
  }
}
const source = readFileSync(new URL('./battleAtmosphereRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from ['"].*maps\/index|from ['"].*quality|requestAnimationFrame\(|setTimeout\(|performance\.|Math\.random\(/);
console.log('battleAtmosphereRuntime self-test: all20 biomes, covered match rekey, exact restore, budget0 recovery, inert Garage/frame loop and teardown PASS');
