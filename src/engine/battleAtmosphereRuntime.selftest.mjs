import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { createBattleAtmosphereRuntime, BATTLE_WEATHER_BIOMES } from './battleAtmosphereRuntime.ts';
import { getVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';

assert.deepEqual(Object.keys(BATTLE_WEATHER_BIOMES).sort(), [...MAP_IDS].sort(), 'every catalog map is covered without loading full configs');
assert.equal(Object.isFrozen(BATTLE_WEATHER_BIOMES), true);
assert.equal(BATTLE_WEATHER_BIOMES.winter, 'cold'); assert.equal(BATTLE_WEATHER_BIOMES.alpine, 'cold');
assert.equal(BATTLE_WEATHER_BIOMES.desert, 'arid'); assert.equal(BATTLE_WEATHER_BIOMES.monsoon, 'tropical');
assert.equal(BATTLE_WEATHER_BIOMES.whiteout, 'cold'); assert.equal(BATTLE_WEATHER_BIOMES.mangrove, 'tropical');
assert.equal(BATTLE_WEATHER_BIOMES.polders, 'coastal'); assert.equal(BATTLE_WEATHER_BIOMES.copper_mesa, 'temperate'); // 2026-10-05: Queenstown under Mount Lyell (mr3) — the wet West Coast, not a desert
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
  runtime.prepare(5, 'winter');
  const night = applied.at(-1);
  assert.equal(runtime.weather.condition, 'clear'); assert.equal(runtime.weather.timeOfDay, 'night');
  assert.equal(getVehicleReadabilityScale(), .34, 'night retains readable plates below the daylight floor (2026-09-14: lifted from .24 with the brighter moon)');
  assert.equal(night.skyIntensity, .08); assert.equal(night.sunElevationDeg, 24);
  assert.equal(night.sunIntensity, .60); assert.equal(night.sunColorHex, 0xafc3ec);
  assert.equal(night.hemiIntensity, .60); assert.equal(night.fillIntensity, .30); assert.equal(night.envIntensity, 1.0);
  assert.equal(night.cloudTintHex, 0x3a4d68); assert.equal(night.fogTintHex, 0x3a4b62);
  assert.equal(night.fogMix, .66); assert.equal(night.postExposure, .95);
  assert.equal(night.cloudOpacity, base.cloudOpacity); assert.equal(night.cloudOpacity2, base.cloudOpacity2);
  assert.equal(night.fogDensity, base.fogDensity, 'night retains authored fog density');
  assert.equal(scene.children.length, 0, 'old snow seed allocates no particles or lights');
  const beforeRematch = applied.length;
  runtime.prepare(5, 'winter', false);
  assert.equal(runtime.weather.timeOfDay, 'day', 'night opt-out rekeys the same match seed');
  assert.deepEqual(applied.at(-1), base, 'opt-out restores exact authored daylight');
  assert.equal(getVehicleReadabilityScale(), 1);
  runtime.prepare(5, 'winter', true);
  assert.equal(runtime.weather.timeOfDay, 'night', 're-enabling restores the existing seeded selection');
  runtime.prepare(13, 'winter');
  assert.equal(applied.length, beforeRematch + 3, 'preference and seed changes each reapply atmosphere');
  assert.equal(runtime.weather.timeOfDay, 'day');
  assert.equal(getVehicleReadabilityScale(), 1, 'day rematch restores exact authored readability');
  assert.deepEqual(applied.at(-1), base, 'day rematch restores the exact authored preset');
  runtime.prepare(16, 'winter');
  assert.equal(runtime.weather.condition, 'clear', 'old fog seed cannot amplify map fog');
  assert.equal(applied.at(-1).fogDensity, base.fogDensity);
  runtime.prepare(5, 'winter', ['sunset']);
  assert.equal(runtime.weather.timeOfDay, 'sunset');
  assert.equal(applied.at(-1).sunElevationDeg, 7);
  assert.equal(applied.at(-1).sunColorHex, 0xffbf80);
  assert.equal(applied.at(-1).fogDensity, base.fogDensity);
  assert.equal(getVehicleReadabilityScale(), 1);
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
  runtime.prepare(5, 'winter');
  assert.equal(getVehicleReadabilityScale(), .34);
  assert.equal(scene.children.length, 0);
  for (const mapId of MAP_IDS) {
    runtime.reset();
    runtime.prepare(5, mapId);
    assert.equal(runtime.weather.timeOfDay, mapId === 'mars' || mapId === 'moon' ? 'day' : 'night', `${mapId}: fixed space key or terrestrial night selection`);
    runtime.prepare(5, mapId, false);
    assert.equal(runtime.weather.timeOfDay, 'day', `${mapId}: disabled nights stay daytime`);
    assert.deepEqual(applied.at(-1), mapId === 'mars' ? MARS_SKY_PRESET : base);
    assert.equal(runtime.weather.condition, 'clear', `${mapId}: no weather`);
    assert.equal(runtime.weather.precipitationIntensity, 0, `${mapId}: no precipitation`);
    assert.equal(scene.children.length, 0, `${mapId}: no weather resources`);
    runtime.reset();
    assert.deepEqual(applied.at(-1), base, `${mapId}: Garage restores authored presentation`);
    runtime.prepare(13, mapId);
    assert.equal(runtime.weather.timeOfDay, 'day', `${mapId}: day rematch`);
    assert.deepEqual(applied.at(-1), mapId === 'mars' ? MARS_SKY_PRESET : base, `${mapId}: authored day or shared space preset`);
  }
} finally { runtime.dispose(); }
const afterDispose = applied.length;
assert.equal(getVehicleReadabilityScale(), 1, 'dispose restores Garage readability');
runtime.dispose(); runtime.reset();
assert.equal(applied.length, afterDispose);
assert.equal(scene.children.length, 0);
assert.throws(() => runtime.prepare(1337, 'monsoon'), /disposed/);

// 2026-10-01 (the grounded light model): the applied light's own readability share multiplies the weather's
let lightShare = 0.5;
const lit = createBattleAtmosphereRuntime({ getAuthoredPreset: () => base, applyPreset() {}, getLightReadability: () => lightShare });
lit.prepare(13, 'winter');
assert.equal(lit.weather.timeOfDay, 'day'); assert.equal(getVehicleReadabilityScale(), 0.5, 'day: the light\'s share');
lit.prepare(5, 'winter');
assert.equal(lit.weather.timeOfDay, 'night'); near(getVehicleReadabilityScale(), .34 * 0.5, 'night: the moonlit floor × the light\'s share');
lit.reset(); assert.equal(getVehicleReadabilityScale(), 1, 'the Garage restores full readability');
lightShare = Number.NaN; lit.prepare(13, 'winter'); assert.equal(getVehicleReadabilityScale(), 1, 'a broken share leaves the authored readability');
lit.reset(); lightShare = 7; lit.prepare(13, 'winter'); assert.equal(getVehicleReadabilityScale(), 1, 'the share is bounded');
lit.dispose();
function near(a, b, what) { assert.ok(Math.abs(a - b) < 1e-12, `${what}: ${a} vs ${b}`); }

// Actual material colors: alias de-duplication, name/type exclusion, same-ID
// rebuilt worlds, rematches and exact restoration all execute production owner.
function horizonFixture() {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const shared = new THREE.MeshBasicMaterial({ color: 0x779966 });
  const detail = new THREE.MeshBasicMaterial({ color: 0xefe9dd });
  const untouched = new THREE.MeshBasicMaterial({ color: 0xccaa77 });
  const mixed = new THREE.MeshBasicMaterial({ color: 0x55aabb });
  const standard = new THREE.MeshStandardMaterial({ color: 0x9f6633 });
  for (const [name, material] of [['horizon-ring', shared], ['horizon-treeline', [shared]],
    ['horizon-detail', [shared]], ['horizon-detail', detail],
    ['ordinary-prop', untouched], ['horizon-ring', standard],
    ['horizon-detail', standard], ['horizon-treeline', mixed],
    ['horizon-detail', [mixed]], ['unrelated-shared-prop', mixed]]) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; root.add(mesh);
  }
  const materials = [shared, detail, untouched, mixed, standard];
  const snapshots = materials.map(material => [material, material.color, material.color.clone(), material.version]);
  return { root, shared, detail, geometry, materials, snapshots, children: [...root.children] };
}
const first = horizonFixture(), second = horizonFixture();
let worldRoot = first.root;
const horizonRuntime = createBattleAtmosphereRuntime({
  getAuthoredPreset: () => base,
  getWorldRoot: () => worldRoot, applyPreset() {},
});
function colorsRestored(fixture) {
  assert.deepEqual(fixture.root.children, fixture.children, 'tinting cannot add or replace scene owners');
  for (const [material, identity, color, version] of fixture.snapshots) {
    assert.strictEqual(material.color, identity); assert.deepEqual(material.color, color);
    assert.equal(material.version, version, 'no new shader/needsUpdate');
  }
}
try {
  horizonRuntime.prepare(13, 'winter');
  colorsRestored(first);
  horizonRuntime.prepare(5, 'winter');
  horizonRuntime.prepare(5, 'winter', false);
  colorsRestored(first);
  horizonRuntime.prepare(5, 'winter', true);
  for (const [material, identity, initial, version] of first.snapshots.slice(0, 2)) {
    assert.strictEqual(material.color, identity);
    assert.deepEqual(material.color.toArray(), [initial.r * .20, initial.g * .20, initial.b * .20],
      'old named meshes and new horizon-detail dim together; shared material gets exactly one multiplier');
    assert.equal(material.version, version, 'night detail tint does not recompile its material');
  }
  for (const [material, identity, color, version] of first.snapshots.slice(2)) {
    assert.strictEqual(material.color, identity); assert.deepEqual(material.color, color);
    assert.equal(material.version, version, 'unnamed/standard/mixed-use materials untouched');
  }
  const dimmed = first.shared.color.clone();
  const detailDimmed = first.detail.color.clone();
  horizonRuntime.prepare(5, 'winter');
  assert.deepEqual(first.shared.color, dimmed, 'same match never compounds tint');
  assert.deepEqual(first.detail.color, detailDimmed, 'same match never compounds new detail tint');
  horizonRuntime.prepare(21, 'winter');
  assert.deepEqual(first.shared.color, dimmed, 'new night restores before collecting again');
  assert.deepEqual(first.detail.color, detailDimmed, 'night rematch restores new detail before collecting again');
  worldRoot = second.root;
  horizonRuntime.prepare(21, 'winter');
  colorsRestored(first);
  assert.deepEqual(second.shared.color, dimmed, 'same map/seed but rebuilt root is re-keyed');
  assert.deepEqual(second.detail.color, detailDimmed, 'rebuilt biome-detail material is re-keyed');
  horizonRuntime.prepare(13, 'winter');
  colorsRestored(second);
  horizonRuntime.prepare(5, 'winter'); horizonRuntime.reset();
  colorsRestored(second);
  horizonRuntime.reset();
  colorsRestored(second);
  horizonRuntime.prepare(5, 'winter');
  worldRoot = null;
  horizonRuntime.reset();
  colorsRestored(second);
  assert.equal(horizonRuntime.weather, null, 'Garage return restores the saved detached battlefield');
  worldRoot = second.root;
  horizonRuntime.prepare(5, 'winter'); horizonRuntime.dispose();
  colorsRestored(second);
} finally {
  horizonRuntime.dispose();
  for (const fixture of [first, second]) {
    fixture.geometry.dispose(); for (const material of fixture.materials) material.dispose();
  }
}
// 2026-10-08 (the nightsky lane; the owner: "on sunsets and nights, the far skybox is still like glowing"): every far
// panorama under the root re-bakes under the light just applied (horizonPanorama.ts relight), inside this covered prepare
// and on the owner's renderer; a relit shell carries the night itself and keeps its colour, a shell that could not relight
// keeps the fifth-dim, and without a renderer nothing is asked.
{
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const calls = [], applied = [], noted = [];
  const shell = (ok, tag) => {
    const ring = new THREE.Object3D(), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.name = 'horizon-ring'; mesh.name = 'horizon-far-range'; mesh.userData.horizonPanorama = true;
    ring.userData.horizonPanorama = { mesh, relight: (r) => { calls.push([tag, r, applied.length]); return ok; },
      noteDaySky: () => { noted.push([tag, applied.length]); return true; } };
    ring.add(mesh); root.add(ring);
    return mesh;
  };
  const relitShell = shell(true, 'relit'), staleShell = shell(false, 'stale');
  const renderer = { tag: 'the renderer' };
  const owner = createBattleAtmosphereRuntime({ getAuthoredPreset: () => base, getWorldRoot: () => root,
    applyPreset: (p) => applied.push(p), getRenderer: () => renderer });
  try {
    owner.prepare(5, 'winter', ['night']);
    assert.deepEqual(noted, [['relit', 0], ['stale', 0]], 'each far panorama notes the day sky before the night is applied');
    assert.deepEqual(calls.map((c) => c[0]).sort(), ['relit', 'stale'], 'every far panorama under the root is asked to relight');
    assert.ok(calls.every((c) => c[1] === renderer && c[2] === applied.length && applied.length > 0),
      'on the owner\'s renderer, after the preset is applied');
    assert.deepEqual(relitShell.material.color.toArray(), [1, 1, 1], 'a relit shell carries the night itself: no dim');
    assert.deepEqual(staleShell.material.color.toArray(), [0.2, 0.2, 0.2], 'a shell that could not relight keeps the fifth');
    owner.prepare(5, 'winter', ['sunset']);
    assert.equal(calls.length, 4, 'a new time relights again');
    assert.deepEqual(staleShell.material.color.toArray(), [1, 1, 1], 'and sunset restores the dim it took');
  } finally { owner.dispose(); }
  const bare = createBattleAtmosphereRuntime({ getAuthoredPreset: () => base, getWorldRoot: () => root, applyPreset() {} });
  try {
    calls.length = 0;
    bare.prepare(7, 'winter', ['night']);
    assert.equal(calls.length, 0, 'no renderer: no relight');
    assert.deepEqual(relitShell.material.color.toArray(), [0.2, 0.2, 0.2], 'and the fifth-dim stands for every shell');
  } finally { bare.dispose(); }
  assert.deepEqual(relitShell.material.color.toArray(), [1, 1, 1], 'the Garage return restores it');
  geometry.dispose();
}
// Every playable map gets the exact Olympus atmosphere in Mars mode, including
// a legacy server with no weather seed. Same-map mode switches invalidate the
// prepared key and return to the untouched authored preset on reset.
let gameMode = 'mars';
const spaceApplied = [];
const space = createBattleAtmosphereRuntime({ getGameMode: () => gameMode,
  getAuthoredPreset: () => base, applyPreset: p => spaceApplied.push(p) });
for (const mapId of MAP_IDS) for (const seed of [undefined, 3, 13]) {
  gameMode = 'mars';
  space.prepare(seed, mapId);
  assert.deepEqual(spaceApplied.at(-1), mapId === 'moon' ? base : MARS_SKY_PRESET, `${mapId}: lunar authored sky survives Gravity mode; other maps use the galaxy preset`);
  const count = spaceApplied.length;
  space.prepare(seed, mapId);
  assert.equal(spaceApplied.length, count, 'same mode/map/seed does not rebake the environment');
  gameMode = 'standard';
  space.prepare(seed, mapId);
  if (mapId !== 'mars') assert.equal(spaceApplied.at(-1).galaxy, undefined, 'same-map mode change releases galaxy');
  space.reset();
  assert.deepEqual(spaceApplied.at(-1), base, 'Garage restores original sky after Mars');
}
space.dispose();
const source = readFileSync(new URL('./battleAtmosphereRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from ['"].*maps\/index|from ['"].*quality|requestAnimationFrame\(|setTimeout\(|performance\.|Math\.random\(/);
assert.doesNotMatch(source, /from ['"].*(?:battlePrecipitation|battleVehicleLighting)|new THREE\./,
  'clear-only owner must not acquire a precipitation/lamp pool or create GPU resources');
console.log(`battleAtmosphereRuntime self-test: all ${MAP_IDS.length} biomes, covered match rekey, authored clouds/fog, readable night, no frame owner and exact restore PASS`);
