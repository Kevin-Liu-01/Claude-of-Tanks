// Round 68 (2026-09-24): the volumetric cloud layer, pinned without a GPU. The noise bakes (cloudNoise.ts) are
// deterministic — their bytes are digested here at the shipped sizes and at small sizes — and tile; the weather's
// coverage field is equalised so a map's coverage admits exactly that fraction of the field; every map's derived
// layer (cloudPresets.ts over its authored sky block) is pinned as the identity table of the round, with the
// shadow policy (cumulus regimes under a day sun only); the 4 × 4 Bayer slot cycle covers every cell once; the
// trace shader's haze law mirrors the aerial pass's constants in post.ts; the hook in post.ts, the `?clouds=off`
// gate in sky.ts and the cascade attach in main.ts are present exactly once.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CLOUD_DETAIL_SIZE, CLOUD_NOISE_SEED, CLOUD_SHAPE_SIZE, CLOUD_WEATHER_SIZE,
  bakeCloudDetailVolume, bakeCloudShapeVolume, bakeCloudWeatherMap,
} from './cloudNoise.ts';
import { CLOUD_LAYER_RULES, cloudLayerKey, deriveCloudLayerPreset } from './cloudPresets.ts';
import {
  CLOUD_AERIAL, CLOUD_BAYER_4, CLOUD_HISTORY_SCALE, CLOUD_REBUILD_SLOTS, CLOUD_SLOT_ORDER, CLOUD_TRACE_DIVISOR,
} from './volumetricClouds.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// ---- the noise bakes: deterministic bytes at the shipped sizes and at small sizes, tileable, well distributed
assert.deepEqual([CLOUD_SHAPE_SIZE, CLOUD_DETAIL_SIZE, CLOUD_WEATHER_SIZE, CLOUD_NOISE_SEED], [64, 32, 256, 2068], 'the shipped sizes and seed');
assert.equal(digest(bakeCloudShapeVolume(8)), '1f3ecfdabf968b313ef1bbf4583ed7d0cd8e716204434c14226ad0e63fdeec76', 'shape 8³ bytes');
assert.equal(digest(bakeCloudDetailVolume(8)), 'f09eaa66c1e1f8261d2f6c5068ce8d6e648d8ca1a8fbd1f7f897acd72f82bfba', 'detail 8³ bytes');
assert.equal(digest(bakeCloudWeatherMap(16)), '21afad503ca74df9248bde2d48d961eb3039067581777f9a8ac70ce34c1b119c', 'weather 16² bytes');
const shape = bakeCloudShapeVolume();
const detail = bakeCloudDetailVolume();
const weather = bakeCloudWeatherMap();
assert.equal(shape.length, 64 * 64 * 64 * 4);
assert.equal(detail.length, 32 * 32 * 32 * 4);
assert.equal(weather.length, 256 * 256 * 4);
assert.equal(digest(shape), 'ed892103446410c7b4a52d45b06f9bbcf3d812774eb6f94233c0063edc46ce49', 'shape 64³ bytes (2026-09-24)');
assert.equal(digest(detail), 'e215d7c534e2946014ce0e1cffdf4a3459951b06bbd134049fc98347622804a8', 'detail 32³ bytes (2026-09-24)');
assert.equal(digest(weather), 'd5180ee3e0f300451f33f8bddfbbd8aaf12257e3041088d7224c93e4dc7fb8df', 'weather 256² bytes (2026-09-24, the cell-carried cumuliform field, clustered, and the stratiform field)');
assert.equal(digest(bakeCloudShapeVolume(64, CLOUD_NOISE_SEED)), digest(shape), 'the default seed is the shipped seed');
assert.notEqual(digest(bakeCloudShapeVolume(8, 7)), digest(bakeCloudShapeVolume(8, 8)), 'the seed changes the volume');

function channelMean(bytes, channel) {
  let sum = 0;
  for (let i = channel; i < bytes.length; i += 4) sum += bytes[i];
  return sum / (bytes.length / 4) / 255;
}
// the shape's Perlin–Worley sits below its billow channels, the billows and the detail around one half
const shapeMeans = [0, 1, 2, 3].map((c) => channelMean(shape, c));
assert.ok(shapeMeans[0] > 0.3 && shapeMeans[0] < 0.55, `shape R mean ${shapeMeans[0]}`);
for (const c of [1, 2, 3]) assert.ok(shapeMeans[c] > 0.4 && shapeMeans[c] < 0.56, `shape billow ${c} mean ${shapeMeans[c]}`);
for (const c of [0, 1, 2]) { const m = channelMean(detail, c); assert.ok(m > 0.4 && m < 0.56, `detail ${c} mean ${m}`); }
assert.equal(channelMean(detail, 3), 1, 'the detail alpha is unused (1)');
// tileable: the step across the wrap of a volume edge is no larger than the step between neighbours
function seamRatio(bytes, N, channel) {
  let seam = 0, neighbour = 0, count = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) {
    const row = (z * N + y) * N;
    seam += Math.abs(bytes[row * 4 + channel] - bytes[(row + N - 1) * 4 + channel]);
    neighbour += Math.abs(bytes[row * 4 + channel] - bytes[(row + 1) * 4 + channel]);
    count++;
  }
  return seam / Math.max(neighbour, 1);
}
for (const c of [0, 1]) assert.ok(seamRatio(shape, 64, c) < 1.25, `shape channel ${c} tiles across x (ratio ${seamRatio(shape, 64, c)})`);
assert.ok(seamRatio(detail, 32, 0) < 1.25, 'detail tiles across x');
// both coverage fields are equalised: every sixteenth of their range holds a sixteenth of the texels
for (const [channel, name] of [[0, 'cumuliform'], [2, 'stratiform']]) {
  const bins = new Array(16).fill(0);
  const texels = weather.length / 4;
  for (let i = channel; i < weather.length; i += 4) bins[weather[i] >> 4]++;
  for (let b = 1; b < 15; b++) assert.ok(Math.abs(bins[b] / texels - 1 / 16) < 0.003, `weather ${name} coverage bin ${b}: ${bins[b] / texels}`);
}
{
  // the cumulus cell profile is sparse (most of the field holds no column centre) but present, and the
  // cumuliform field follows the cells where they are strongest (a low coverage admits cell cores, not haze)
  const cellMean = channelMean(weather, 1);
  assert.ok(cellMean > 0.05 && cellMean < 0.3, `weather cell profile mean ${cellMean}`);
  let coreTexels = 0, coreAdmitted = 0;
  for (let i = 0; i < weather.length; i += 4) if (weather[i + 1] > 230) { coreTexels++; if (weather[i] > 255 * (1 - 0.24)) coreAdmitted++; }
  assert.ok(coreTexels > 100 && coreAdmitted / coreTexels > 0.9, `cell cores admitted at coverage 0.24: ${coreAdmitted}/${coreTexels}`);
}

// ---- the per-map layer: the identity table of the round, derived from each map's authored sky block
const overcastFive = ['railyard', 'winter', 'whiteout', 'foundry', 'monsoon'];
const table = {};
for (const id of MAP_IDS) {
  const sky = { ...DEFAULT_SKY_PRESET, ...(getMapConfig(id).sky ?? {}) };
  const p = deriveCloudLayerPreset(sky);
  table[id] = { regime: p.regime, coverage: +p.coverage.toFixed(3), baseM: p.baseM, thicknessM: Math.round(p.thicknessM), shadow: p.shadow };
  assert.ok(p.coverage >= CLOUD_LAYER_RULES.coverageMin && p.coverage <= CLOUD_LAYER_RULES.coverageMax);
  assert.ok(p.baseM > 0 && p.thicknessM > 0 && p.density > 0);
  assert.ok(p.shadowThreshold >= 0 && p.shadowThreshold <= 1);
  assert.equal(+p.shadowThreshold.toFixed(3), +Math.min(1, 1 - p.coverage + CLOUD_LAYER_RULES.shadowCoreBand).toFixed(3), `${id}: the shadow footprint is the cloud's dense core`);
  assert.ok(p.tint.every((c) => c > 0 && c <= 1), `${id} tint in (0, 1]`);
  if (overcastFive.includes(id) && id !== 'monsoon') {
    assert.equal(p.regime, 'overcast', `${id} is an overcast preset (the round-65 open note)`);
    assert.ok(p.coverage >= CLOUD_LAYER_RULES.overcastCoverageFloor, `${id} takes the stratus ceiling`);
    assert.equal(p.shadow, false, `${id}: a diffuse-lit deck casts no crisp cloud shadow`);
    assert.equal(p.clearRadiusM, 0);
    assert.equal(p.fieldMix, 1, `${id}: an overcast cuts the broad stratiform field`);
  }
  if (p.regime === 'scattered') assert.equal(p.fieldMix, 0, `${id}: scattered cumulus cut the cell field`);
  if (id === 'monsoon') {
    // the storm keeps its tropical blue sky (the owner's approved base): towers off toward the horizon, casting
    assert.deepEqual([p.regime, p.coverage, p.clearRadiusM, p.towers, p.shadow, p.fieldMix], ['storm', CLOUD_LAYER_RULES.stormCoverage, CLOUD_LAYER_RULES.stormClearRadiusM, 1, true, 0.85]);
  } else assert.equal(p.clearRadiusM, 0, `${id}: only a storm clears the sky over the camera`);
  if (['verdant', 'delta', 'alpine', 'reservoir', 'urban', 'frontier', 'orchard', 'longleaf', 'airfield'].includes(id)) {
    // the owner's good maps: small sparse puffs high over the thin baked veil, the sky mostly open
    assert.ok(p.coverage >= 0.15 && p.coverage <= 0.3, `${id} coverage ${p.coverage} in 0.15–0.3`);
    assert.ok(p.baseM >= 1200 && p.baseM <= 1800, `${id} base ${p.baseM} in 1200–1800`);
    assert.ok(p.regime === 'scattered' || p.regime === 'broken');
  }
}
assert.deepEqual(table, {
  verdant: { regime: 'scattered', coverage: 0.22, baseM: 1400, thicknessM: 327, shadow: true },
  desert: { regime: 'scattered', coverage: 0.159, baseM: 1200, thicknessM: 320, shadow: true },
  winter: { regime: 'overcast', coverage: 0.94, baseM: 320, thicknessM: 320, shadow: false },
  urban: { regime: 'scattered', coverage: 0.178, baseM: 1400, thicknessM: 320, shadow: true },
  coastal: { regime: 'scattered', coverage: 0.178, baseM: 1400, thicknessM: 320, shadow: true },
  autumn: { regime: 'scattered', coverage: 0.151, baseM: 1400, thicknessM: 320, shadow: true },
  steppe: { regime: 'scattered', coverage: 0.101, baseM: 1400, thicknessM: 320, shadow: true },
  railyard: { regime: 'overcast', coverage: 0.94, baseM: 300, thicknessM: 320, shadow: false },
  frontier: { regime: 'scattered', coverage: 0.22, baseM: 1400, thicknessM: 327, shadow: true },
  fjord: { regime: 'scattered', coverage: 0.264, baseM: 1400, thicknessM: 349, shadow: true },
  delta: { regime: 'scattered', coverage: 0.267, baseM: 1400, thicknessM: 396, shadow: true },
  badlands: { regime: 'scattered', coverage: 0.118, baseM: 1400, thicknessM: 320, shadow: true },
  monsoon: { regime: 'storm', coverage: 0.28, baseM: 1400, thicknessM: 1600, shadow: true },
  alpine: { regime: 'scattered', coverage: 0.255, baseM: 1400, thicknessM: 344, shadow: true },
  caldera: { regime: 'overcast', coverage: 0.94, baseM: 360, thicknessM: 320, shadow: false },
  foundry: { regime: 'overcast', coverage: 0.94, baseM: 340, thicknessM: 320, shadow: false },
  ruinspires: { regime: 'overcast', coverage: 0.94, baseM: 360, thicknessM: 320, shadow: false },
  blackglass: { regime: 'overcast', coverage: 0.94, baseM: 330, thicknessM: 320, shadow: false },
  titan_gorge: { regime: 'scattered', coverage: 0.17, baseM: 1200, thicknessM: 320, shadow: true },
  skybridge: { regime: 'overcast', coverage: 0.94, baseM: 380, thicknessM: 320, shadow: false },
  polders: { regime: 'scattered', coverage: 0.249, baseM: 420, thicknessM: 342, shadow: true },
  copper_mesa: { regime: 'scattered', coverage: 0.165, baseM: 1200, thicknessM: 320, shadow: true },
  airfield: { regime: 'scattered', coverage: 0.178, baseM: 1400, thicknessM: 320, shadow: true },
  oasis: { regime: 'scattered', coverage: 0.159, baseM: 1200, thicknessM: 320, shadow: true },
  whiteout: { regime: 'overcast', coverage: 0.94, baseM: 300, thicknessM: 320, shadow: false },
  orchard: { regime: 'scattered', coverage: 0.206, baseM: 1400, thicknessM: 320, shadow: true },
  longleaf: { regime: 'scattered', coverage: 0.234, baseM: 1400, thicknessM: 334, shadow: true },
  mangrove: { regime: 'scattered', coverage: 0.234, baseM: 1400, thicknessM: 356, shadow: true },
  saltwind: { regime: 'scattered', coverage: 0.181, baseM: 1400, thicknessM: 320, shadow: true },
  reservoir: { regime: 'scattered', coverage: 0.22, baseM: 1400, thicknessM: 327, shadow: true },
  mars: { regime: 'scattered', coverage: 0.05, baseM: 1200, thicknessM: 320, shadow: false },
}, 'the derived layer of every map (round 68 identity table)');
// the shadow policy: a night sky (the runtime's night preset dims the dome to .08) casts none; an authored override wins
{
  const verdant = { ...DEFAULT_SKY_PRESET, ...(getMapConfig('verdant').sky ?? {}) };
  assert.equal(deriveCloudLayerPreset(verdant).shadow, true);
  assert.equal(deriveCloudLayerPreset({ ...verdant, skyIntensity: 0.08 }).shadow, false, 'no moon-cast cloud shadows');
  assert.equal(deriveCloudLayerPreset({ ...verdant, cloudShadowAmp: 0.1 }).shadow, false, 'a faint authored patchiness keeps the aerial term');
  const authored = deriveCloudLayerPreset({ ...verdant, cloudLayer: { coverage: 0.7, regime: 'broken', baseM: 900 } });
  assert.equal(deriveCloudLayerPreset({ ...verdant, cloudAltM: 420 }).baseM, 420, 'an authored low deck keeps its altitude');
  assert.equal(deriveCloudLayerPreset({ ...verdant, cloudAltM: 900 }).baseM, 1200, 'a mid authored deck lifts to the cumulus floor');
  assert.deepEqual([authored.coverage, authored.regime, authored.baseM], [0.7, 'broken', 900], 'sky.cloudLayer overrides field by field');
  assert.notEqual(cloudLayerKey(authored), cloudLayerKey(deriveCloudLayerPreset(verdant)), 'the key follows every field');
  assert.equal(cloudLayerKey(deriveCloudLayerPreset(verdant)), cloudLayerKey(deriveCloudLayerPreset({ ...verdant })), 'the key is stable');
  const co = (v) => deriveCloudLayerPreset({ ...verdant, cloudOpacity: v }).coverage;
  assert.ok(co(0.3) < co(0.6) && co(0.6) < co(1.0) && co(1.0) < co(1.2), 'coverage rises with the authored deck opacity');
  assert.equal(+co(1.0).toFixed(3), 0.22, 'the legacy fair-weather deck maps onto 0.22 of the cell field');
}

// ---- the slot cycle: sixteen distinct Bayer cells, the resolve's closed form agrees with the table
assert.equal(new Set(CLOUD_SLOT_ORDER.map(([x, y]) => `${x},${y}`)).size, 16, 'every cell of the 4 × 4 block is traced once per cycle');
const bayer2 = (x, y) => x * 2 + y * 3 - x * y * 4;
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
  assert.equal(4 * bayer2(x % 2, y % 2) + bayer2(Math.floor(x / 2), Math.floor(y / 2)), CLOUD_BAYER_4[y][x], `bayer rank ${x},${y}`);
  assert.deepEqual(CLOUD_SLOT_ORDER[CLOUD_BAYER_4[y][x]], [x, y]);
}
assert.deepEqual([CLOUD_HISTORY_SCALE, CLOUD_TRACE_DIVISOR, CLOUD_REBUILD_SLOTS], [0.5, 4, 4], 'half-res history, 1/16 traced a frame, four slots a frame after a cut');

// ---- the haze law mirrors the aerial pass, the hook and the gates are in place
const postSource = here('./post.ts');
const skySource = here('./sky.ts');
const mainSource = here('../main.ts');
const layerSource = here('./volumetricClouds.ts');
const postConst = (name) => Number(postSource.match(new RegExp(`const ${name} = ([\\d.]+);`))?.[1]);
assert.equal(CLOUD_AERIAL.density, postConst('AERIAL_DENSITY'));
assert.equal(CLOUD_AERIAL.hazeDensity, postConst('AERIAL_HAZE_DENSITY'));
assert.equal(CLOUD_AERIAL.extCeiling, postConst('AERIAL_EXT_CEILING'));
assert.equal(CLOUD_AERIAL.scatterCeiling, postConst('AERIAL_SCATTER_CEILING'));
assert.equal(CLOUD_AERIAL.desat, postConst('AERIAL_DESAT'));
// the target is the sky-view LUT itself, uncapped: the pass's caps (AERIAL_HAZE_LUM_CAP, HORIZON_LUM_CAP) are for lit
// ground against haze; a capped target left every far deck darker than its sky (winter / whiteout skylines)
assert.ok(!('hazeLumCap' in CLOUD_AERIAL) && !('horizonCap' in CLOUD_AERIAL), 'no luminance cap on the cloud haze target');
assert.doesNotMatch(layerSource, /hazeLumCap|horizonCap/, 'the trace applies no cap to its sky target');
assert.equal(CLOUD_AERIAL.heightRef, postConst('AERIAL_HEIGHT_REF'));
assert.equal(CLOUD_AERIAL.heightScale, postConst('AERIAL_HEIGHT_SCALE'));
assert.equal(CLOUD_AERIAL.heightScatterK, postConst('AERIAL_HEIGHT_SCATTER_K'));
assert.equal(CLOUD_AERIAL.heightExtK, postConst('AERIAL_HEIGHT_EXT_K'));
assert.deepEqual([...CLOUD_AERIAL.cool], JSON.parse(postSource.match(/const AERIAL_COOL = (\[[^\]]+\]);/)[1]));
const renderFrame = postSource.slice(postSource.indexOf('  function renderFrame('), postSource.indexOf('\n  // Live preset switching'));
assert.equal(renderFrame.match(/volumetricClouds\?\.beforeSceneRender\(/g)?.length, 1, 'one hook inside the frame transaction');
assert.equal(postSource.match(/beforeSceneRender\(/g)?.length, 1, 'no other post path marches the clouds');
assert.ok(renderFrame.indexOf('beforeSceneRender(') < renderFrame.indexOf('const jittered = taa.enabled;'), 'the march reads the unjittered camera');
assert.match(skySource, /get\('clouds'\) === 'off'/, 'the ?clouds=off fallback keeps the baked decks');
assert.match(skySource, /scene\.userData\.volumetricClouds = volumetricClouds;/);
assert.match(mainSource, /sky\.attachShadowCascades\(lighting\.csm\);/, 'the cascades carry the cloud shadows');
assert.ok(layerSource.includes('${ATMOSPHERE_SKY_GLSL}') && layerSource.includes('atmoSkyVisible( skyDir )'), 'the trace hazes toward the sky-view LUT');
assert.ok(layerSource.includes('markShadowOnly(gobo)'), 'the gobos live on the shadow-only layer');
assert.match(layerSource, /blendSrc: THREE\.OneFactor, blendDst: THREE\.OneMinusSrcAlphaFactor/, 'premultiplied composite over the dome');
assert.match(layerSource, /uniform sampler3D tShape;[\s\S]*uniform sampler3D tDetail;/, 'the volumes are 3D textures');
assert.ok(layerSource.includes("name: 'VolumetricCloudTrace'") && layerSource.includes("name: 'VolumetricCloudResolve'") && layerSource.includes("name: 'VolumetricCloudDome'"));
console.log('volumetricClouds.selftest: noise digests, tiling and equalisation, the 31-map layer table, the shadow policy, the slot cycle, the haze mirror and the hooks pinned');
