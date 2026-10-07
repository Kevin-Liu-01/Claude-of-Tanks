// sceneWind.selftest — one wind per battlefield (2026-10-05, the skies lane; the combat FX lane's coherence bug: on Verdant
// the clouds drifted toward ~205° while the trees and the grass swayed toward ~37°).
//
// Every row of the table re-derived from its sources (the ocean block's authored wind, else the ground profile's grass
// wind, else the clouds' authored drift un-veered, else the legacy drift — the sun's azimuth + 90° — un-veered; the speed
// the ocean's, else 0.6 of the regime's wind aloft, else 4 m/s), and every map's cloud layer — derived as the battle
// derives it, the scene wind carried beside the cloudscape — drifting within 45° of its surface wind (the veer exactly).
import assert from 'node:assert/strict';
import { MAP_IDS } from './maps/mapIds.ts';
import { getMapConfig } from './maps/index.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';
import { SCENE_WIND, SCENE_WIND_VEER_DEG, sceneWindFor } from './sceneWind.ts';
import { CLOUDSCAPE_REGIMES } from '../engine/cloudscapes.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from '../engine/cloudPresets.ts';
import { DEFAULT_SKY_PRESET } from '../engine/sky.ts';
import { MARS_SKY_PRESET } from '../engine/marsAtmosphere.ts';

await loadCloudscapeLayers();
const norm = (d) => ((d % 360) + 360) % 360;
const apart = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
assert.ok(SCENE_WIND_VEER_DEG >= 20 && SCENE_WIND_VEER_DEG <= 30, 'the drift veers a few tens of degrees with height');
assert.deepEqual(Object.keys(SCENE_WIND).sort(), [...MAP_IDS].sort(), 'every map has its wind');
let opposed = 0;
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id);
  // ---- the row from its sources
  const ocean = cfg.ocean && Number.isFinite(cfg.ocean.windDirDeg) ? cfg.ocean : null;
  const grass = resolveGroundReduxProfile(id).grass;
  const cloudAuth = cfg.clouds && Number.isFinite(cfg.clouds.windDirDeg) ? cfg.clouds.windDirDeg : null;
  const legacy = norm((cfg.sky?.sunAzimuthDeg ?? DEFAULT_SKY_PRESET.sunAzimuthDeg) + 90);
  const dir = ocean ? norm(ocean.windDirDeg) : grass ? norm(Math.atan2(grass.windDir[1], grass.windDir[0]) * 180 / Math.PI)
    : cloudAuth !== null ? norm(cloudAuth - SCENE_WIND_VEER_DEG) : norm(legacy - SCENE_WIND_VEER_DEG);
  const regime = cfg.clouds?.regime && CLOUDSCAPE_REGIMES[cfg.clouds.regime];
  const aloft = Number.isFinite(cfg.clouds?.windSpeed) ? cfg.clouds.windSpeed : regime ? regime.windSpeed : null;
  const speed = ocean && Number.isFinite(ocean.windSpeed) ? ocean.windSpeed : aloft !== null ? aloft * 0.6 : 4;
  const row = SCENE_WIND[id];
  assert.ok(apart(row.dirDeg, dir) <= 0.51, `${id}: the surface wind ${row.dirDeg}° is its source's ${dir.toFixed(1)}° (re-derive the table)`);
  assert.ok(Math.abs(row.speed - speed) <= 0.051, `${id}: the speed ${row.speed} is its source's ${speed.toFixed(2)}`);
  // ---- the clouds' drift as the battle derives it (main.ts getAuthoredPreset: the cloudscape and the scene wind ride
  // with the sky block; the Mars mode's own sky)
  const wind = sceneWindFor(id);
  const sky = { ...DEFAULT_SKY_PRESET, ...(id === 'mars' ? MARS_SKY_PRESET : cfg.sky ?? {}), ...(id !== 'mars' && cfg.clouds ? { cloudscape: cfg.clouds } : {}), sceneWind: wind };
  const drift = norm(deriveCloudLayerPreset(sky).windDirRad * 180 / Math.PI);
  assert.ok(apart(drift, wind.surfaceDirDeg) <= 45, `${id}: the clouds drift toward ${drift.toFixed(0)}°, within 45° of the surface wind ${wind.surfaceDirDeg}°`);
  assert.ok(apart(drift, wind.surfaceDirDeg + SCENE_WIND_VEER_DEG) < 1e-6, `${id}: the surface wind veered by ${SCENE_WIND_VEER_DEG}°`);
  // (the old fallback: a drift derived from the sun opposed the vegetation on most maps)
  const before = norm(deriveCloudLayerPreset({ ...sky, sceneWind: null }).windDirRad * 180 / Math.PI);
  if (apart(before, wind.surfaceDirDeg) > 90) opposed++;
  // the unit vector agrees with the angle
  assert.ok(Math.abs(Math.hypot(wind.dirX, wind.dirZ) - 1) < 1e-9 && apart(norm(Math.atan2(wind.dirZ, wind.dirX) * 180 / Math.PI), wind.surfaceDirDeg) < 1e-6);
}
// the Mars sky does not change (the lane's rule): its authored drift is its scene wind's
{
  const sky = { ...DEFAULT_SKY_PRESET, ...MARS_SKY_PRESET };
  const was = norm(deriveCloudLayerPreset(sky).windDirRad * 180 / Math.PI);
  const now = norm(deriveCloudLayerPreset({ ...sky, sceneWind: sceneWindFor('mars') }).windDirRad * 180 / Math.PI);
  assert.ok(apart(was, now) < 1e-6, `Mars drifts as it did (${was.toFixed(1)}°)`);
}
assert.ok(opposed >= 12, `the old drift opposed (over 90°) the surface wind on many maps (${opposed})`);
console.log(`sceneWind.selftest: ${MAP_IDS.length} maps — each surface wind from its source, each cloud layer veered ${SCENE_WIND_VEER_DEG}° from it (the old drift opposed it on ${opposed}); Mars unchanged PASS`);
