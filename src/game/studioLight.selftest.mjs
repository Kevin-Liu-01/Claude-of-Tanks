// studioLight.selftest.mjs — Scene Studio times of day and sun override (media r5, 2026-10-01).
// Pure plan contract (studioLight.ts) and the world relight runtime's save/apply/restore (studioLightRuntime.ts)
// against fakes; the rendered look is reviewed on contact sheets (docs/STUDIO.md "Light").
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BATTLE_TIMES } from '../engine/battleWeatherPolicy.ts';
import {
  STUDIO_TIMES, STUDIO_TIME_BANDS, STUDIO_SPACE_MAPS, STUDIO_DUSK_KEY_ELEVATION_DEG, isStudioTime, normalizeStudioLight,
  planStudioLight, studioElevationBand, studioSunDirection, studioTimeFor, studioTimesFor,
} from './studioLight.ts';
import { createStudioLightRuntime, studioAuthoredSky } from './studioLightRuntime.ts';
import { getVehicleReadabilityScale, setVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';
import { MARS_SKY_PRESET } from '../engine/marsAtmosphere.ts';
import { DEFAULT_SKY_PRESET } from '../engine/sky.ts';
import { deriveCloudLayerPreset } from '../engine/cloudPresets.ts';
import { HORIZON_SEGMENTS, horizonSkyTint } from '../world/maps/horizon.ts';
import { bakeHorizonRelief, createHorizonReliefField, resolveHorizonRelief } from '../world/horizonRelief.ts';

// --- the time list: a superset of the battle times, battles untouched -------------------------------------
assert.deepEqual([...STUDIO_TIMES], ['dawn', 'morning', 'day', 'golden', 'sunset', 'dusk', 'night']);
assert.deepEqual([...BATTLE_TIMES], ['day', 'sunset', 'night'], 'battle times are unchanged');
for (const time of BATTLE_TIMES) assert.ok(STUDIO_TIMES.includes(time), `${time}: every battle time is a Studio time`);
assert.ok(Object.isFrozen(STUDIO_TIMES) && Object.isFrozen(STUDIO_TIME_BANDS));
assert.equal(isStudioTime('golden'), true);
assert.equal(isStudioTime('noon'), false);
assert.equal(isStudioTime(undefined), false);
for (const time of STUDIO_TIMES) {
  const band = STUDIO_TIME_BANDS[time];
  assert.ok(band.min < band.max, `${time}: band`);
  if (band.default !== null) assert.ok(band.default >= band.min && band.default <= band.max, `${time}: default inside band`);
}
assert.ok(STUDIO_TIME_BANDS.dusk.max < 0, 'dusk is a set sun');
assert.ok(STUDIO_TIME_BANDS.dawn.default >= 3 && STUDIO_TIME_BANDS.dawn.default <= 5, 'dawn ~3-5 degrees');
assert.ok(STUDIO_TIME_BANDS.morning.default >= 15 && STUDIO_TIME_BANDS.morning.default <= 20, 'morning ~15-20 degrees');
assert.ok(STUDIO_TIME_BANDS.golden.default >= 10 && STUDIO_TIME_BANDS.golden.default <= 14, 'golden ~10-14 degrees');

// --- the light block -------------------------------------------------------------------------------------
assert.equal(normalizeStudioLight(undefined), null);
assert.equal(normalizeStudioLight(null), null);
assert.equal(normalizeStudioLight({}), null);
assert.equal(normalizeStudioLight({ sunAzimuthDeg: null }), null, 'a null field is absent');
assert.deepEqual(normalizeStudioLight({ sunAzimuthDeg: -30 }), { sunAzimuthDeg: 330 });
assert.deepEqual(normalizeStudioLight({ sunAzimuthDeg: 725.004 }), { sunAzimuthDeg: 5 });
assert.deepEqual(normalizeStudioLight({ sunAzimuthDeg: 359.999 }), { sunAzimuthDeg: 0 }, 'wraps after rounding');
assert.deepEqual(normalizeStudioLight({ sunElevationDeg: 12.3456 }), { sunElevationDeg: 12.35 });
assert.deepEqual(normalizeStudioLight({ sunElevationDeg: 140 }), { sunElevationDeg: 90 });
assert.throws(() => normalizeStudioLight({ sunAzimuthDeg: Number.NaN }), /finite/);
assert.throws(() => normalizeStudioLight({ sunAzimuthDeg: '90' }), /finite number/);
assert.throws(() => normalizeStudioLight({ sunAzimuth: 90 }), /Unknown Studio light field/);
assert.throws(() => normalizeStudioLight([90]), /object/);
assert.equal(normalizeStudioLight({ headlights: true }), null, 'headlights on is the default and is not stored');
assert.deepEqual(normalizeStudioLight({ headlights: false, sunAzimuthDeg: 10 }), { sunAzimuthDeg: 10, headlights: false });
assert.throws(() => normalizeStudioLight({ headlights: 'off' }), /boolean/);
assert.throws(() => normalizeStudioLight(5), /object/);

// --- sun direction convention (sky.ts setFromSphericalCoords(1, 90° - el, az)) ---------------------------
for (const [el, az] of [[32, 115], [4, 0], [-4, 270], [60, 200]]) {
  const v = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
  const d = studioSunDirection(el, az);
  assert.ok(Math.abs(v.x - d[0]) < 1e-12 && Math.abs(v.y - d[1]) < 1e-12 && Math.abs(v.z - d[2]) < 1e-12, `${el}/${az}: convention`);
}

// --- plans -----------------------------------------------------------------------------------------------
const authored = Object.freeze({
  sunElevationDeg: 32, sunAzimuthDeg: 115, turbidity: 4, rayleigh: 1.2, mieCoefficient: 0.006, mieDirectionalG: 0.82,
  fogDensity: 0.00074, fogTintHex: 0x7e97b8, fogMix: 0.55, envIntensity: 0.2, cloudOpacity: 1, cloudOpacity2: 0.6,
  cloudTintHex: 0xffffff, sunIntensity: 4.5, sunColorHex: 0xfff1dc, hemiIntensity: 0.32,
  cloudscape: { regime: 'fair-weather' },
});
const clouds = { offset: [0.25, 0.75], windDirRad: 3.66 };
const day = planStudioLight('verdant', authored, 'day', null, clouds);
assert.deepEqual(day.sky, authored, 'the authored day is exact');
assert.equal(day.keyDirection, null);
assert.equal(day.readability, 1);
assert.equal(day.horizon.dim, 1);
assert.equal(day.time, 'day');
assert.deepEqual([day.sunAzimuthDeg, day.sunElevationDeg], [115, 32]);
assert.deepEqual(planStudioLight('verdant', authored, 'day', { sunAzimuthDeg: 115, sunElevationDeg: 32 }, clouds).sky, authored,
  'an override equal to the authored sun is the authored day');
const movedDay = planStudioLight('verdant', authored, 'day', { sunAzimuthDeg: 300 }, clouds);
assert.equal(movedDay.sky.sunAzimuthDeg, 300);
assert.equal(movedDay.sky.sunElevationDeg, 32, 'an azimuth-only override keeps the authored elevation');
assert.deepEqual(movedDay.sky.cloudLayer, { offset: [0.25, 0.75], windDirRad: 3.66 }, 'the cloud field stays put while the sun moves');
for (const key of Object.keys(authored)) {
  if (key === 'sunAzimuthDeg') continue;
  assert.deepEqual(movedDay.sky[key], authored[key], `moved day keeps ${key}`);
}
assert.equal(planStudioLight('verdant', authored, 'day', { sunElevationDeg: 2 }, clouds).sunElevationDeg, 10, 'day band floor');
assert.equal(planStudioLight('verdant', authored, 'day', { sunElevationDeg: 89 }, clouds).sunElevationDeg, 80, 'day band ceiling');

const plans = {};
for (const time of STUDIO_TIMES) {
  const plan = planStudioLight('verdant', authored, time, null, clouds);
  plans[time] = plan;
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.sky), `${time}: frozen`);
  assert.deepEqual(planStudioLight('verdant', authored, time, null, clouds), plan, `${time}: deterministic`);
  assert.equal(plan.time, time);
  const band = STUDIO_TIME_BANDS[time];
  assert.ok(plan.sunElevationDeg >= band.min && plan.sunElevationDeg <= band.max, `${time}: elevation inside its band`);
  assert.equal(plan.sky.sunElevationDeg, plan.sunElevationDeg);
  assert.equal(plan.sky.sunAzimuthDeg, 115, `${time}: the authored bearing by default`);
  if (time === 'day') continue;
  assert.deepEqual(plan.sky.cloudLayer.offset, [0.25, 0.75], `${time}: pinned cloud offset`);
  assert.equal(plan.sky.cloudLayer.windDirRad, 3.66, `${time}: pinned wind`);
  assert.ok(plan.sky.sunIntensity > 0 && plan.sky.hemiIntensity > 0 && plan.sky.skyIntensity > 0, `${time}: lit`);
  assert.ok(plan.readability > 0 && plan.readability <= 1 && plan.horizon.dim > 0 && plan.horizon.dim <= 1, `${time}: bounded`);
  // overrides clamp into the band and the bearing follows the override
  const low = planStudioLight('verdant', authored, time, { sunAzimuthDeg: 250, sunElevationDeg: -90 }, clouds);
  const high = planStudioLight('verdant', authored, time, { sunElevationDeg: 90 }, clouds);
  assert.equal(low.sunElevationDeg, band.min, `${time}: clamped to the band floor`);
  assert.equal(high.sunElevationDeg, band.max, `${time}: clamped to the band ceiling`);
  assert.equal(low.sky.sunAzimuthDeg, 250, `${time}: bearing override`);
}
// distinct looks: elevation, key colour and key intensity differ between every pair of times
for (let i = 0; i < STUDIO_TIMES.length; i++) {
  for (let j = i + 1; j < STUDIO_TIMES.length; j++) {
    const a = plans[STUDIO_TIMES[i]], b = plans[STUDIO_TIMES[j]];
    assert.ok(a.sunElevationDeg !== b.sunElevationDeg || a.sky.sunColorHex !== b.sky.sunColorHex
      || a.sky.sunIntensity !== b.sky.sunIntensity, `${STUDIO_TIMES[i]} / ${STUDIO_TIMES[j]}: distinct`);
    assert.notEqual(a.sky.sunColorHex === b.sky.sunColorHex && a.sky.skyIntensity === b.sky.skyIntensity, true,
      `${STUDIO_TIMES[i]} / ${STUDIO_TIMES[j]}: distinct key or dome`);
  }
}
// the order of the light through the day: dawn and sunset low and warm, night a dim cool moon
assert.ok(plans.dawn.sky.sunIntensity < plans.morning.sky.sunIntensity && plans.golden.sky.sunIntensity < plans.day.sky.sunIntensity);
assert.ok(plans.sunset.sky.sunIntensity < plans.golden.sky.sunIntensity && plans.dusk.sky.sunIntensity < plans.sunset.sky.sunIntensity);
assert.ok(plans.night.sky.skyIntensity <= 0.08 && plans.night.readability < plans.dusk.readability);
const warm = (hex) => ((hex >> 16) & 255) - (hex & 255);
assert.ok(warm(plans.golden.sky.sunColorHex) > warm(plans.morning.sky.sunColorHex), 'golden is warmer than morning');
assert.ok(warm(plans.sunset.sky.sunColorHex) > warm(plans.golden.sky.sunColorHex), 'sunset is warmer than golden');
assert.ok(warm(plans.night.sky.sunColorHex) < 0, 'moonlight is cool');
// dusk: the key stands over the set sun's bearing, 5 degrees up; the dome's sun is below the horizon
const dusk = planStudioLight('verdant', authored, 'dusk', { sunAzimuthDeg: 200 }, clouds);
assert.ok(dusk.sky.sunElevationDeg < 0);
const expectedKey = studioSunDirection(STUDIO_DUSK_KEY_ELEVATION_DEG, 200);
assert.deepEqual(dusk.keyDirection, expectedKey);
assert.equal(dusk.sky.cloudLayer.shadow, false, 'a set sun casts no cloud shadows');
for (const time of STUDIO_TIMES) if (time !== 'dusk') assert.equal(plans[time].keyDirection, null, `${time}: key follows the sky's sun`);
// relative recipes keep an overcast map overcast (its weak authored key) while the moon is an absolute key
const overcast = { ...authored, sunIntensity: 1.35, hemiIntensity: 0.74 };
assert.ok(planStudioLight('winter', overcast, 'golden', null).sky.sunIntensity < plans.golden.sky.sunIntensity);
assert.equal(planStudioLight('winter', overcast, 'night', null).sky.sunIntensity, plans.night.sky.sunIntensity);

// --- space maps keep their authored light ---------------------------------------------------------------------
assert.deepEqual([...STUDIO_SPACE_MAPS], ['mars', 'moon']);
for (const mapId of STUDIO_SPACE_MAPS) {
  assert.deepEqual([...studioTimesFor(mapId)], ['day']);
  for (const time of STUDIO_TIMES) {
    assert.equal(studioTimeFor(mapId, time), 'day');
    const plan = planStudioLight(mapId, authored, time, null);
    assert.equal(plan.time, 'day');
    assert.equal(plan.space, true);
    assert.deepEqual(plan.sky, authored, `${mapId} ${time}: authored space light`);
  }
  const moved = planStudioLight(mapId, authored, 'night', { sunAzimuthDeg: 10, sunElevationDeg: 2 });
  assert.equal(moved.sunElevationDeg, 8, `${mapId}: the space band floor`);
  assert.equal(moved.sky.sunAzimuthDeg, 10);
  assert.deepEqual(studioElevationBand(mapId, 'dusk'), { min: 8, max: 60 });
}
assert.deepEqual([...studioTimesFor('verdant')], [...STUDIO_TIMES]);
assert.equal(studioTimeFor('verdant', 'dusk'), 'dusk');

// --- authored sky as the battle atmosphere starts from it ------------------------------------------------------
assert.deepEqual(studioAuthoredSky({ mapId: 'mars', group: null, config: { sky: { sunIntensity: 9 } } }), { ...MARS_SKY_PRESET });
assert.deepEqual(studioAuthoredSky({ mapId: 'verdant', group: null, config: { sky: { fogMix: 0.5 }, clouds: { regime: 'x' } } }),
  { fogMix: 0.5, cloudscape: { regime: 'x' } });
assert.deepEqual(studioAuthoredSky({ mapId: 'moon', group: null, config: { sky: { earth: 1 } } }), { earth: 1 });

// --- the runtime: exact save / apply / restore over a fake battlefield ----------------------------------------
function fakeWorld(mapId = 'verdant') {
  const group = new THREE.Group();
  const ring = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.61, 1.61, 1.61) });
  ring.userData.horizonSunDir = { value: new THREE.Vector3(0.4, 0.5, 0.2) };
  ring.userData.horizonVista = { uniforms: {
    uVAmbient: { value: 0.5 }, uVSunGain: { value: 1.3 },
    uVSkyTint: { value: new THREE.Vector3(0.9, 1, 1.1) }, uVFogTint: { value: new THREE.Vector3(0.2, 0.3, 0.4) },
  }, skyTint: horizonSkyTint };
  const far = new THREE.MeshBasicMaterial({ color: 0xffffff });
  far.userData.horizonFarShading = {
    uFSun: { value: new THREE.Vector3(0, 1, 0) }, uFGains: { value: new THREE.Vector2(0.5, 1.3) },
    uFRock: { value: new THREE.Color(0.3, 0.3, 0.3) }, uFSnow: { value: new THREE.Color(0.9, 0.9, 0.95) },
    uFFog: { value: new THREE.Color(0.5, 0.6, 0.7) },
  };
  const shared = new THREE.MeshBasicMaterial({ color: 0x336699 }); // a horizon alias also used by a prop: untouched
  const terrain = new THREE.MeshStandardMaterial();
  terrain.userData.sunDirUniform = { value: new THREE.Vector3(0.1, 0.9, 0.1) };
  const geometry = new THREE.BoxGeometry();
  const add = (name, material) => { const mesh = new THREE.Mesh(geometry, material); mesh.name = name; group.add(mesh); };
  add('horizon-ring', ring); add('horizon-far-range', far); add('horizon-treeline', shared); add('prop', shared); add('terrain', terrain);
  const snapshot = () => JSON.stringify([ring.color, ring.userData.horizonSunDir.value, ring.userData.horizonVista.uniforms,
    far.color, far.userData.horizonFarShading, shared.color, terrain.userData.sunDirUniform]);
  return { world: { mapId, group, config: { sky: { ...authored } } }, ring, far, shared, terrain, snapshot };
}
const scene = new THREE.Scene();
scene.userData.sunDirWorld = new THREE.Vector3(0.3, 0.5, -0.2).normalize();
let historyResets = 0, taaResets = 0;
scene.userData.volumetricClouds = { resetHistory: () => historyResets++ };
const applied = [];
let active = fakeWorld();
const pristine = active.snapshot();
// main.ts's wiring: the battle sky's cloud derivation
const cloudIdentity = (authored) => {
  const layer = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...authored });
  return { offset: [layer.offset[0], layer.offset[1]], windDirRad: layer.windDirRad };
};
const runtime = createStudioLightRuntime({
  scene, cloudIdentity, getWorld: () => active.world,
  applySky: (preset, key) => applied.push({ preset, key: key ? key.toArray() : null }),
  resetTemporalHistory: () => taaResets++,
});
setVehicleReadabilityScale(1);
runtime.apply('day', null);
assert.equal(applied.length, 0, 'the authored day the battle owner installed needs no second bake');
assert.equal(active.snapshot(), pristine);
runtime.apply('golden', null);
assert.equal(applied.length, 1);
assert.equal(applied[0].preset.sunElevationDeg, STUDIO_TIME_BANDS.golden.default);
assert.equal(applied[0].key, null);
assert.notEqual(active.snapshot(), pristine, 'the baked horizon is relit');
assert.ok(Math.abs(active.ring.color.r - 1.61 * runtime.plan.horizon.dim) < 1e-6, 'the ring takes the time dim');
assert.equal(active.shared.color.getHex(), 0x336699, 'a material shared with a non-horizon mesh is never dimmed');
assert.ok(active.ring.userData.horizonSunDir.value.distanceTo(scene.userData.sunDirWorld) < 1e-9, 'the ring takes the sky sun');
assert.ok(active.terrain.userData.sunDirUniform.value.distanceTo(scene.userData.sunDirWorld) < 1e-9, 'the wall sky light turns');
assert.equal(getVehicleReadabilityScale(), runtime.plan.readability);
assert.equal(historyResets, 1); assert.equal(taaResets, 1);
runtime.apply('golden', null);
assert.equal(applied.length, 1, 'an unchanged plan applies nothing');
assert.equal(historyResets, 1);
runtime.apply('dusk', { sunAzimuthDeg: 200 });
assert.equal(applied.length, 2);
assert.deepEqual(applied[1].key, [...expectedKey], 'dusk hands the decoupled key to the composition root');
assert.ok(active.ring.userData.horizonSunDir.value.distanceTo(new THREE.Vector3(...expectedKey)) < 1e-9, 'the ring takes the key at dusk');
const goldenDim = plans.golden.horizon.dim, duskDim = plans.dusk.horizon.dim;
assert.ok(Math.abs(active.ring.color.r - 1.61 * duskDim) < 1e-6, `re-grades from the saved colour (not ${goldenDim} x ${duskDim})`);
runtime.apply('day', null);
assert.equal(applied.length, 3, 'returning to the authored day re-installs it');
assert.deepEqual(applied[2].preset, authored);
assert.equal(active.snapshot(), pristine, 'the authored day restores every baked value exactly');
assert.equal(getVehicleReadabilityScale(), 1);
// a world switch restores the previous battlefield
runtime.apply('night', null);
const first = active;
active = fakeWorld('desert');
const secondPristine = active.snapshot();
runtime.apply('night', null);
assert.equal(first.snapshot(), pristine, 'the cached previous battlefield gets its baked light back');
assert.notEqual(active.snapshot(), secondPristine);
runtime.restore();
assert.equal(active.snapshot(), secondPristine, 'Studio exit restores the battlefield it relit');
assert.equal(getVehicleReadabilityScale(), 1, 'Studio exit restores readability');
assert.equal(runtime.plan, null);
// --- the ring's cast-shadow re-bake: a synthetic ridge ring with its relief field and atlas --------------------
{
  const n = HORIZON_SEGMENTS, rows = 8, stride = n + 1;
  const positions = new Float32Array(stride * rows * 3), uvs = new Float32Array(stride * rows * 2);
  for (let row = 0; row < rows; row++) {
    const r = 420 + row * 150;
    for (let k = 0; k <= n; k++) {
      const a = (k % n) / n * Math.PI * 2, i = row * stride + k;
      // a ridge at the third row: a tall face that shadows the rows behind it under a low sun
      const h = row === 2 ? 180 + 40 * Math.sin(a * 7) : row > 2 ? 30 : 10;
      positions.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3);
      uvs.set([k / n * 10, h / 220], i * 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const W = 256, Hh = 32;
  const data = new Uint8Array(W * Hh * 4);
  for (let i = 0; i < data.length; i += 4) data.set([128, 128, 200, 255], i); // fully sunlit as built
  const atlas = new THREE.DataTexture(data, W, Hh);
  const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.61, 1.61, 1.61) }));
  ring.name = 'horizon-ring';
  ring.material.userData.horizonSunDir = { value: new THREE.Vector3(...studioSunDirection(32, 115)) };
  ring.material.userData.horizonVista = { uniforms: { uVRelief: { value: atlas }, uVReliefAmp: { value: 1 },
    uVAmbient: { value: 0.5 }, uVSunGain: { value: 1.3 }, uVSkyTint: { value: new THREE.Vector3(1, 1, 1) }, uVFogTint: { value: new THREE.Vector3() } },
    skyTint: horizonSkyTint };
  Object.defineProperty(ring.userData, 'horizonReliefSource', {
    value: { field: createHorizonReliefField(7, resolveHorizonRelief('alpine')), maxHeight: 220, columns: HORIZON_SEGMENTS, bake: bakeHorizonRelief },
    enumerable: false });
  const group = new THREE.Group(); group.add(ring);
  const world = { mapId: 'alpine', group, config: { sky: { ...authored } } };
  const ringScene = new THREE.Scene();
  ringScene.userData.sunDirWorld = new THREE.Vector3(...studioSunDirection(32, 115));
  const ringRuntime = createStudioLightRuntime({ scene: ringScene, cloudIdentity, getWorld: () => world,
    applySky: (preset, key) => { const dir = key ?? new THREE.Vector3(...studioSunDirection(preset.sunElevationDeg, preset.sunAzimuthDeg)); ringScene.userData.sunDirWorld.copy(dir); } });
  const before = data.slice();
  ringRuntime.apply('golden', { sunAzimuthDeg: 300 });
  let shadowed = 0, rgbChanged = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) shadowed++;
    if (data[i] !== before[i] || data[i + 1] !== before[i + 1] || data[i + 2] !== before[i + 2]) rgbChanged++;
  }
  assert.ok(shadowed > 0, 'a low, moved sun lays the ridge shadow over the rows behind it');
  assert.equal(rgbChanged, 0, 'only the sun-visibility channel is re-baked');
  assert.ok(atlas.version > 0, 'the atlas re-uploads');
  ringRuntime.apply('day', null);
  assert.deepEqual(data, before, 'the authored day restores the built atlas byte for byte');
  ringRuntime.apply('dawn', null);
  assert.notDeepEqual(data, before, 'a dawn sun at the authored bearing still re-bakes (a lower sun, longer shadows)');
  ringRuntime.restore();
  assert.deepEqual(data, before, 'Studio exit restores the atlas');
}
// 2026-10-06 (the skies lane; the media session's review of PR #9's merge: all six night takes read as daylight under a
// starry sky): under the grounded light model the camera adapts to the light (lightModel.ts exposureFor) and a moonlit
// field displayed at about a third of noon — the battle night's level. The night recipe's camera offset (cameraEV) holds the
// Studio night darker on every terrestrial map: the moonlit grey card (the horizontal light × the exposure) at most a
// quarter of the Studio day's, the moon still the key (its absolute 0.9) with a moonlit shadow (the key's share of the
// light 0.2–0.45, never the clear day's 0.8+), the map's own lighting block kept and the offset added to its EV
{
  const core = await import('../engine/lightModelCore.ts');
  const { skyPresetToAtmosphere } = await import('../engine/atmosphere.ts');
  const { getMapConfig, MAP_IDS } = await import('../world/maps/index.ts');
  await core.loadGroundedLightModel();
  const resolve = (sky) => {
    const preset = { ...DEFAULT_SKY_PRESET, ...sky }, atmo = skyPresetToAtmosphere(preset);
    const irr = [0.05, 0.08, 0.14].map((v) => v * (preset.skyIntensity ?? 1));
    const m = core.resolveLightModel(preset, atmo, { irradianceRaw: irr }, core.authoredSunOf(preset));
    const keyH = m.sunIntensity * core.luminance(m.sunColor) * Math.max(0, atmo.sunDir[1]);
    return { m, card: m.illuminance * m.exposure, keyShare: keyH / m.illuminance };
  };
  let maps = 0, darkest = 0;
  for (const mapId of MAP_IDS) {
    if (STUDIO_SPACE_MAPS.includes(mapId)) continue;
    const authored = getMapConfig(mapId).sky;
    const day = resolve(planStudioLight(mapId, authored, 'day', null).sky);
    const plan = planStudioLight(mapId, authored, 'night', null), night = resolve(plan.sky);
    assert.equal(night.m.mode, 'physical', `${mapId}: the grounded rig lights the Studio night`);
    assert.ok(Math.abs(night.m.night - 1) < 1e-9, `${mapId}: full night`);
    assert.ok(Math.abs(night.m.sunIntensity - 0.9) < 1e-9, `${mapId}: the moon is the key (${night.m.sunIntensity})`);
    const share = night.card / day.card;
    assert.ok(share <= 0.25, `${mapId}: the moonlit card ${(100 * share).toFixed(1)} % of the Studio day's (at most a quarter)`);
    assert.ok(night.keyShare >= 0.2 && night.keyShare <= 0.45, `${mapId}: a moonlit shadow (the key's share ${night.keyShare.toFixed(2)})`);
    const own = authored.lighting ?? {};
    for (const [k, v] of Object.entries(own)) if (k !== 'exposureEV') assert.deepEqual(plan.sky.lighting[k], v, `${mapId}: lighting.${k} kept`);
    assert.ok(Math.abs(plan.sky.lighting.exposureEV - ((own.exposureEV ?? 0) - 1.25)) < 1e-9, `${mapId}: the night's camera offset on the map's own EV`);
    darkest = Math.max(darkest, share); maps++;
  }
  assert.ok(maps >= 30, `the terrestrial maps (${maps})`);
  // the day keeps the authored light exactly: no camera offset
  assert.equal(planStudioLight('verdant', getMapConfig('verdant').sky, 'day', null).sky.lighting, getMapConfig('verdant').sky.lighting);
}

console.log(`studioLight.selftest: ${STUDIO_TIMES.length} times, bands, light block, distinct relative recipes, space-map rule, exact relight restore and ring shadow re-bake pass`);
