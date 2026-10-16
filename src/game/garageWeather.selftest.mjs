// garageWeather.selftest.mjs — the Garage's fair weather over the overcast battlefields' yards (2026-10-15, the SKY lane;
// the garage critic re-judge: Cinder, Ironworks and Frosthollow "no clouds", "a white mound on a white sky").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { GARAGE_WEATHER, withGarageWeather } from './garageWeather.ts';
import { GARAGE_SKY_PRESETS, getGarageSkyPreset } from './garageSkyPresets.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from '../engine/cloudPresets.ts';
import { resolveOvercast } from '../engine/lightModelCore.ts';
import { CLOUDSCAPE_REGIMES } from '../engine/cloudscapes.ts';
import { getMapConfig } from '../world/maps/index.ts';

const DECLARED = ['winter', 'railyard', 'foundry'];
assert.deepEqual(Object.keys(GARAGE_WEATHER).sort(), [...DECLARED].sort(), 'Frosthollow, Cinder Junction and Ironworks alone');

// the weather only: the decks, the cloudscape and the layer it resolves to; never the sun (the Garage's elevation and
// azimuth trim is the garage lane's, garageSkyPresets.ts), the scattering, the fog, the light or the grade
const WEATHER_KEYS = new Set(['cloudOpacity2', 'cloudAltM', 'cloudHazeK', 'cloudUvM', 'cloudShadowAmp', 'cloudTintHex', 'cloudscape', 'cloudLayer']);
for (const [id, w] of Object.entries(GARAGE_WEATHER)) {
  for (const key of Object.keys(w)) assert.ok(WEATHER_KEYS.has(key), `${id}: ${key} is not weather`);
  assert.equal(w.cloudscape.regime, 'fair-weather-cumulus', `${id}: Verdant's cloud, the owner's reference`);
  assert.ok(CLOUDSCAPE_REGIMES[w.cloudscape.regime], `${id}: a known regime`);
  assert.notEqual(w.cloudscape.regime, 'broken-stratocumulus');
  assert.ok(w.cloudscape.coverage >= 0.3 && w.cloudscape.coverage <= 0.5, `${id}: scattered cumulus, not a deck`);
  if (id === 'railyard') {
    const pick = (c) => ['regime', 'coverage', 'baseM', 'thicknessM', 'towers', 'streets', 'cirrus'].map((k) => c[k]);
    assert.deepEqual(pick(w.cloudscape), pick(getMapConfig('railyard').clouds), 'Cinder Junction: the yard draws the battlefield\'s own cumulus');
    assert.equal(w.cloudTintHex, getMapConfig('railyard').sky.cloudTintHex, 'and its sky block\'s tint');
  }
  assert.equal(w.cloudLayer.regime, w.cloudscape.regime);
  assert.equal(w.cloudLayer.coverage, w.cloudscape.coverage);
  assert.equal(w.cloudTintHex, w.cloudscape.tintHex);
  assert.ok(Object.isFrozen(w) && Object.isFrozen(w.cloudscape) && Object.isFrozen(w.cloudLayer));
}

// every other destination is its battlefield's sky, the same object
for (const id of Object.keys(GARAGE_SKY_PRESETS)) {
  if (DECLARED.includes(id)) continue;
  assert.equal(withGarageWeather(id, getGarageSkyPreset(id)), getGarageSkyPreset(id), `${id} untouched`);
}
assert.equal(withGarageWeather('unknown', getGarageSkyPreset('unknown')), getGarageSkyPreset('unknown'));

// the suns the Garage may stand these yards under: the battlefield's own and the Garage trim's range (28-38 degrees,
// the three-quarter back lights at azimuth 163 and 283)
const SUNS = [{}, { sunElevationDeg: 28, sunAzimuthDeg: 163 }, { sunElevationDeg: 38, sunAzimuthDeg: 283 }];
const round = (v) => (typeof v === 'number' ? +v.toFixed(5) : Array.isArray(v) ? v.map(round) : v);
const norm = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)]));
const garageSkies = [];
for (const id of DECLARED) {
  for (const sun of SUNS) {
    const sky = { ...withGarageWeather(id, getGarageSkyPreset(id)), ...sun };
    assert.equal(withGarageWeather(id, getGarageSkyPreset(id)), withGarageWeather(id, getGarageSkyPreset(id)), 'one frozen copy');
    // the deck derivation of the same sky is no longer the closed overcast sheet, and the light model's sun is a clear one
    const deck = deriveCloudLayerPreset({ ...sky, cloudscape: null, cloudLayer: null });
    assert.notEqual(deck.regime, 'overcast', `${id}: no stratus sheet`);
    assert.equal(resolveOvercast(sky), 0, `${id}: the sun lights the yard (the cumulus regime casts shadows)`);
    const before = getGarageSkyPreset(id);
    // (the battlefield's own sky block is the overcast for Frosthollow and Ironworks; Cinder Junction's battlefield is the
    // same hazy summer cumulus its yard draws: the coordinator's ruling, 2026-10-16)
    if (id !== 'railyard') assert.ok(resolveOvercast({ ...before, ...sun }) > 0.5, `${id}: (the battlefield's own sky is the overcast)`);
    // what the Garage draws before the cloudscape resolver is ever loaded
    garageSkies.push({ id, sun, sky, drawn: norm(deriveCloudLayerPreset(sky)) });
  }
}
// the battle resolver, loaded: the written-out layer is exactly the cloudscape's resolution on each sky and sun
await loadCloudscapeLayers();
for (const { id, sun, sky, drawn } of garageSkies) {
  const resolved = norm(deriveCloudLayerPreset({ ...sky, cloudLayer: null }));
  if (!isDeepStrictEqual(resolved, drawn)) {
    const deck = norm(deriveCloudLayerPreset({ ...sky, cloudscape: null, cloudLayer: null }));
    const want = Object.fromEntries(Object.keys(resolved).filter((k) => JSON.stringify(resolved[k]) !== JSON.stringify(deck[k])).map((k) => [k, resolved[k]]));
    assert.fail(`${id} at ${JSON.stringify(sun)}: the written-out layer no longer matches the battle resolver; cloudLayer should read ${JSON.stringify(want)}`);
  }
  // and once the resolver is loaded (a Garage visit after a battle) the Garage draws the same
  assert.deepEqual(norm(deriveCloudLayerPreset(sky)), drawn, `${id}: the same cumulus with or without the resolver`);
}

// both Garage sky reads take the weather (the presentation preset and the Garage sky config)
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.equal(main.split('withGarageWeather(variant.mapId, getGarageSkyPreset(variant.mapId))').length - 1, 2, 'both Garage sky reads');
assert.equal(main.split('getGarageSkyPreset(variant.mapId)').length - 1, 2, 'no Garage sky read without the weather');
console.log(`garageWeather.selftest: ${DECLARED.join(', ')} under fair-weather cumulus (the battle resolver's own, at ${SUNS.length} suns each), the light model's sun clear, every other destination untouched`);
