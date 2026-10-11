// Round 68 (2026-09-24): the volumetric cloud layer, pinned without a GPU. The noise bakes (cloudNoise.ts) are
// deterministic — their bytes are digested here at the shipped sizes and at small sizes — and tile; the weather's
// coverage fields are equalised so a map's coverage admits exactly that fraction of the field; every map's derived
// layer (cloudPresets.ts over its authored sky block) is pinned as the identity table of the round, with the
// shadow policy (cumulus regimes under a day sun only); the 4 × 4 Bayer slot cycle covers every cell once; the
// trace shader's haze law mirrors the aerial pass's constants in post.ts; the hook in post.ts, the `?clouds=off`
// gate in sky.ts are present exactly once; the clouds' shadows reach the lit materials by the one shade map
// (2026-10-03: the cascade gobos are gone — cloudShadeMap.selftest.mjs pins the path).
// Round 71 (2026-09-25): the cloudscape pass — the multi-scale weather (a vigour channel), the street / anvil /
// cirrus companion field in the wind frame, the curl volume and the blue-noise tile; every map's `clouds` block
// resolves through its regime row (cloudscapes.ts) into the pinned 31-map cloudscape table; the layer is the default from round 71c (owner approval on the review sheet).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CLOUD_BLUE_SIZE, CLOUD_CURL_SIZE, CLOUD_DETAIL_SIZE, CLOUD_NOISE_SEED, CLOUD_SHAPE_SIZE, CLOUD_WEATHER_SIZE,
  bakeCloudBlueNoise, bakeCloudCurlVolume, bakeCloudDetailVolume, bakeCloudNoise, bakeCloudShapeVolume, bakeCloudWeatherMap, bakeCloudWeatherStreets,
} from './cloudNoise.ts';
import { CLOUD_LAYER_RULES, cloudLayerKey, deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { CLOUDSCAPE_REGIMES, CLOUDSCAPE_REGIME_NAMES, isCloudscapeRegime } from './cloudscapes.ts';
import { CLOUD_CONTRAILS_ON } from './cloudscapeLayer.ts';
import { CLOUD_CONTRAIL_MAX } from './cloudWeatherLayers.ts';
// the count a map authors (what the layer derives with the contrail switch on)
const authoredContrails = (id) => Math.round(Math.min(1, Math.max(0, getMapConfig(id)?.clouds?.contrails ?? 0)) * CLOUD_CONTRAIL_MAX);
import {
  VolumetricCloudLayer, cloudCameraCut, CLOUD_AERIAL, CLOUD_BAYER_4, CLOUD_HISTORY_SCALE, CLOUD_NOISE_KINDS, CLOUD_REBUILD_SLOTS, CLOUD_CAPTURE_SETTLE_FRAMES, CLOUD_SLOT_ORDER, CLOUD_STEP_SCALE_BY_PRESET, CLOUD_TRACE_DIVISOR, CLOUD_LOW_DECK_BASE_M, cloudDeckMarch,
} from './volumetricClouds.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';

await loadCloudscapeLayers(); // a map's cloudscape resolves behind the battle entry (2026-10-02, the boot weight)

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// Full-strength firing at the game's normal and sniper FOVs keeps detailed
// history through both the punch and its decay. Real cuts still invalidate it.
for (const base of [60, 30, 15, 7.5, 3.75, 2.4]) {
  const tan = deg => Math.tan(deg * Math.PI / 360);
  let previous = tan(base);
  for (let frame = 0; frame < 60; frame++) {
    const kick = Math.exp(-frame / 60 / .08);
    const current = tan(base * (1 + .075 * kick));
    assert.equal(cloudCameraCut(.03, .055, previous, current), false,
      `recoil frame ${frame} at ${base} degrees must reproject, not rebuild`);
    previous = current;
  }
  assert.equal(cloudCameraCut(0, 0, tan(base), tan(base / 2)), true, 'scope jump rebuilds');
  assert.equal(cloudCameraCut(0, 0, tan(base / 2), tan(base)), true, 'scope exit rebuilds');
}
assert.equal(cloudCameraCut(7, 0, 1, 1), true, 'teleport rebuilds');
assert.equal(cloudCameraCut(0, .36, 1, 1), true, 'large camera turn rebuilds');

// A capture rebuilds missing slots and converges their noisy first samples.
// The real method may touch only its own cloud targets and must keep time fixed.
{
  const layer=Object.create(VolumetricCloudLayer.prototype);
  Object.assign(layer,{targetWidth:3840,targetHeight:2160,preset:{},frozen:false,rebuild:4,since:0,renderer:{},
    atmosphere:{active:true},noise:{shape:{},detail:{},curl:{},weather:{},streets:{},blue:{}}});
  let traces=0;
  const camera={};
  layer.beforeSceneRender=(renderer,view,dt,w,h)=>{
    assert.equal(renderer,layer.renderer);assert.equal(view,camera);assert.equal(dt,0);
    assert.equal(w,3840);assert.equal(h,2160);traces++;
    if(layer.rebuild<16)layer.rebuild=Math.min(16,layer.rebuild+CLOUD_REBUILD_SLOTS);
    else layer.since++;
  };
  assert.equal(layer.settleForCapture(camera),true);
  assert.equal(traces,3+CLOUD_CAPTURE_SETTLE_FRAMES);assert.ok(CLOUD_CAPTURE_SETTLE_FRAMES>=256,'a still settles to near the live steady state');assert.equal(layer.captureFramesRemaining,0);
  assert.equal(layer.settleForCapture(camera),false,'settled movie frames do no extra traces');
  layer.rebuild=0;layer.since=0;layer.frozen=true;
  assert.equal(layer.settleForCapture(camera),false,'capture respects an intentionally frozen layer');
}

// ---- the noise bakes: deterministic bytes at the shipped sizes and at small sizes, tileable, well distributed
assert.deepEqual([CLOUD_SHAPE_SIZE, CLOUD_DETAIL_SIZE, CLOUD_WEATHER_SIZE, CLOUD_CURL_SIZE, CLOUD_BLUE_SIZE, CLOUD_NOISE_SEED], [64, 32, 256, 32, 32, 2068], 'the shipped sizes and seed');
// 2026-10-01 (frozen pins retired): the sha256 pins of every bake at small and shipped sizes were change detectors of
// the cloud noise; the worker and the main thread run the same pure bakes, so the contract is determinism (two bakes
// agree byte for byte), the shipped sizes, the seed dependence and the distribution checks below.
for (const [label, bake] of [['shape 8³', () => bakeCloudShapeVolume(8)], ['detail 8³', () => bakeCloudDetailVolume(8)],
  ['weather 16²', () => bakeCloudWeatherMap(16)], ['streets 16²', () => bakeCloudWeatherStreets(16)],
  ['curl 8³', () => bakeCloudCurlVolume(8)], ['blue 8²', () => bakeCloudBlueNoise(8)]]) {
  assert.equal(digest(bake()), digest(bake()), `${label} bytes are deterministic`);
}
const shape = bakeCloudShapeVolume();
const detail = bakeCloudDetailVolume();
const weather = bakeCloudWeatherMap();
const streets = bakeCloudWeatherStreets();
const curl = bakeCloudCurlVolume();
const blue = bakeCloudBlueNoise();
// The sheets need a complete mip chain, while the volume/shadow field and
// blue-noise sampling must retain their authored level-zero distribution.
{
  const layer = new VolumetricCloudLayer({}, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1));
  layer.setNoise({ weather, streets, blue });
  for (const field of ['weather', 'streets']) {
    assert.equal(layer.noise[field].generateMipmaps, true);
    assert.equal(layer.noise[field].minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(layer.noise[field].magFilter, THREE.LinearFilter);
  }
  assert.equal(layer.noise.blue.generateMipmaps, false);
  assert.equal(layer.noise.blue.minFilter, THREE.NearestFilter);
  assert.equal(layer.noise.blue.magFilter, THREE.NearestFilter);
  layer.dispose();
}
assert.equal(shape.length, 64 * 64 * 64 * 4);
assert.equal(detail.length, 32 * 32 * 32 * 4);
assert.equal(weather.length, 256 * 256 * 4);
assert.equal(streets.length, 256 * 256 * 4);
assert.equal(curl.length, 32 * 32 * 32 * 4);
assert.equal(blue.length, 32 * 32 * 4);
assert.equal(digest(bakeCloudShapeVolume(64, CLOUD_NOISE_SEED)), digest(shape), 'the default seed is the shipped seed');
assert.notEqual(digest(bakeCloudShapeVolume(8, 7)), digest(bakeCloudShapeVolume(8, 8)), 'the seed changes the volume');
{
  const all = bakeCloudNoise();
  assert.deepEqual(Object.keys(all).sort(), [...CLOUD_NOISE_KINDS].sort(), 'bakeCloudNoise returns every kind the layer uploads');
  assert.deepEqual([...CLOUD_NOISE_KINDS], ['blue', 'weather', 'streets', 'curl', 'detail', 'shape'], 'the worker posts smallest first');
  assert.equal(digest(all.streets), digest(streets));
  assert.equal(digest(all.blue), digest(blue));
}

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
// the curl volume is centred (a divergence-free field has no mean flow) and spans its range
for (const c of [0, 1, 2]) { const m = channelMean(curl, c); assert.ok(m > 0.45 && m < 0.55, `curl ${c} mean ${m}`); }
assert.equal(channelMean(curl, 3), 1);
{
  let lo = 255, hi = 0;
  for (let i = 0; i < curl.length; i += 4) { lo = Math.min(lo, curl[i]); hi = Math.max(hi, curl[i]); }
  assert.ok(lo <= 20 && hi >= 235, `curl spans its byte range (${lo}..${hi})`);
}
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
assert.ok(seamRatio(curl, 32, 0) < 1.3, 'curl tiles across x');
// the weather's two-dimensional seams, both axes
function seamRatio2(bytes, N, channel) {
  let seam = 0, neighbour = 0;
  for (let y = 0; y < N; y++) {
    seam += Math.abs(bytes[(y * N) * 4 + channel] - bytes[(y * N + N - 1) * 4 + channel]);
    neighbour += Math.abs(bytes[(y * N) * 4 + channel] - bytes[(y * N + 1) * 4 + channel]);
    seam += Math.abs(bytes[y * 4 + channel] - bytes[((N - 1) * N + y) * 4 + channel]);
    neighbour += Math.abs(bytes[y * 4 + channel] - bytes[(N + y) * 4 + channel]);
  }
  return seam / Math.max(neighbour, 1);
}
for (const [name, bytes] of [['weather', weather], ['streets', streets]]) for (const c of [0, 1, 2, 3]) {
  assert.ok(seamRatio2(bytes, 256, c) < 1.6, `${name} channel ${c} tiles (ratio ${seamRatio2(bytes, 256, c).toFixed(2)})`);
}
// the equalised fields: every sixteenth of their range holds a sixteenth of the texels
function assertEqualised(bytes, channel, name) {
  const bins = new Array(16).fill(0);
  const texels = bytes.length / 4;
  for (let i = channel; i < bytes.length; i += 4) bins[bytes[i] >> 4]++;
  for (let b = 1; b < 15; b++) assert.ok(Math.abs(bins[b] / texels - 1 / 16) < 0.003, `${name} bin ${b}: ${bins[b] / texels}`);
}
assertEqualised(weather, 0, 'weather cumuliform coverage');
assertEqualised(weather, 1, 'weather vigour');
assertEqualised(weather, 2, 'weather stratiform coverage');
assertEqualised(streets, 0, 'street coverage');
assertEqualised(streets, 1, 'anvil field');
assertEqualised(streets, 2, 'cirrus streaks');
{
  // the street field is anisotropic: its rows run along x, so the correlation along x outlasts the one along y
  const N = 256;
  const corr = (bytes, channel, dx, dy) => {
    let sum = 0, n = 0;
    for (let y = 0; y < N; y += 3) for (let x = 0; x < N; x += 3) {
      const a = bytes[(y * N + x) * 4 + channel] - 127.5, b = bytes[(((y + dy) % N) * N + (x + dx) % N) * 4 + channel] - 127.5;
      sum += a * b; n++;
    }
    return sum / n;
  };
  const alongX = corr(streets, 0, 12, 0), acrossY = corr(streets, 0, 0, 12);
  assert.ok(alongX > acrossY * 1.5, `streets run along x (corr along ${alongX.toFixed(0)} vs across ${acrossY.toFixed(0)})`);
  const cAlong = corr(streets, 2, 24, 0), cAcross = corr(streets, 2, 0, 24);
  assert.ok(cAlong > cAcross * 2, `cirrus streaks run along x (${cAlong.toFixed(0)} vs ${cAcross.toFixed(0)})`);
  const wAlong = corr(weather, 0, 12, 0), wAcross = corr(weather, 0, 0, 12);
  assert.ok(Math.abs(wAlong - wAcross) < Math.max(wAlong, wAcross) * 0.5, `the isotropic field has no street axis (${wAlong.toFixed(0)} vs ${wAcross.toFixed(0)})`);
  // the multi-scale cumuliform field carries structure at the synoptic scale: the coverage admitted at 0.3
  // clusters into a few connected regions of the 256² tile rather than a uniform pepper of cells
  const admitted = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) admitted[i] = weather[i * 4] >= 255 * 0.7 ? 1 : 0;
  const seen = new Uint8Array(N * N);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < N * N; s++) {
    if (!admitted[s] || seen[s]) continue;
    let size = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); size++;
      const x = i % N, y = (i - x) / N;
      for (const [nx, ny] of [[(x + 1) % N, y], [(x + N - 1) % N, y], [x, (y + 1) % N], [x, (y + N - 1) % N]]) {
        const j = ny * N + nx;
        if (admitted[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  const area = sizes.reduce((a, b) => a + b, 0);
  assert.ok(sizes[0] / area > 0.25, `the largest connected region holds a quarter of the admitted area (${(sizes[0] / area).toFixed(2)} of ${sizes.length} regions)`);
  assert.ok(sizes.length > 8, `and there are still separate cells (${sizes.length} regions)`);
}
{
  // blue noise: the ranks are a permutation (every value once at 8², spread at 32²) and no two neighbours are close in rank
  const b8 = bakeCloudBlueNoise(8);
  const ranks = new Set(); for (let i = 0; i < b8.length; i += 4) ranks.add(b8[i]);
  assert.equal(ranks.size, 64, 'an 8² tile holds 64 distinct ranks');
  const N = 32;
  let close = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = blue[(y * N + x) * 4], r = blue[(y * N + (x + 1) % N) * 4], d = blue[(((y + 1) % N) * N + x) * 4];
    if (Math.abs(v - r) < 16 || Math.abs(v - d) < 16) close++;
  }
  assert.ok(close / (N * N) < 0.2, `few neighbouring texels within a sixteenth of the range (${(close / (N * N)).toFixed(3)})`);
}

// ---- the per-map layer: the identity table of the round, derived from each map's authored sky block and cloudscape
const skyOf = (id) => {
  const config = getMapConfig(id);
  const sky = { ...DEFAULT_SKY_PRESET, ...(id === 'mars' ? MARS_SKY_PRESET : config.sky ?? {}) };
  if (config.clouds) sky.cloudscape = config.clouds;
  return sky;
};
const table = {};
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  if (id === 'moon') { assert.equal(config.sky.cloudOpacity, 0); assert.equal(config.sky.cloudOpacity2, 0); continue; }
  if (id !== 'mars') assert.ok(config.clouds && isCloudscapeRegime(config.clouds.regime), `${id} authors a cloudscape regime`);
  else assert.ok(!config.clouds && MARS_SKY_PRESET.cloudscape?.regime === 'thin-ice-clouds', 'Mars carries its cloudscape on the shared preset (the ruleset applies it directly)');
  const p = deriveCloudLayerPreset(skyOf(id));
  table[id] = { regime: p.regime, coverage: +p.coverage.toFixed(3), baseM: p.baseM, thicknessM: Math.round(p.thicknessM), shadow: p.shadow, streets: p.streets, cirrus: p.cirrus, farBand: p.farBand,
    // 2026-10-01: the weather beyond the slab (cloudWeatherLayers.ts) — contrails, rain, virga, the fog bank
    // (2026-10-03: contrails are off on every map — cloudscapeLayer.ts CLOUD_CONTRAILS_ON; the table keeps the authored
    // counts, which come back with the switch)
    contrails: CLOUD_CONTRAILS_ON ? p.contrails : (p.contrails === 0 ? authoredContrails(id) : -1), rain: p.rain, virga: p.virga, fogBank: p.fogBank };
  assert.ok(p.coverage >= 0 && p.coverage <= CLOUD_LAYER_RULES.coverageMax);
  assert.ok(p.baseM > 0 && p.thicknessM > 0 && p.density > 0);
  assert.ok(p.shadowThreshold >= 0 && p.shadowThreshold <= 1);
  assert.equal(+p.shadowThreshold.toFixed(3), +Math.min(1, 1 - p.coverage + CLOUD_LAYER_RULES.shadowCoreBand).toFixed(3), `${id}: the shadow footprint is the visible cloud's (2026-10-05: no core band)`);
  assert.ok(p.tint.every((c) => c > 0 && c <= 1), `${id} tint in (0, 1]`);
  assert.ok(p.typeRange[0] <= p.typeRange[1] && p.typeRange[0] >= 0 && p.typeRange[1] <= 1, `${id} type range`);
  assert.ok(p.cirrusAltM > p.baseM + p.thicknessM, `${id}: the cirrus sheet sits above the slab`);
  assert.ok(p.farBandAltM <= CLOUD_LAYER_RULES.farBandMaxAltM && p.farBandAltM > 0);
  if (p.stratiform >= CLOUD_LAYER_RULES.sheetStratiform) assert.equal(p.shadow, false, `${id}: a diffuse-lit sheet casts no crisp cloud shadow`);
  if (p.shearM > 0) assert.ok(p.shearM <= p.thicknessM * 2, `${id}: the lean is bounded by the slab`);
}
assert.deepEqual(table, {
  verdant: { regime: 'fair-weather-cumulus', coverage: 0.36, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.45, cirrus: 0.12, farBand: 0.25, contrails: 2, rain: 0, virga: 0, fogBank: 0 },
  desert: { regime: 'cumulus-humilis', coverage: 0.14, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.5, farBand: 0.15, contrails: 2, rain: 0.3, virga: 0.85, fogBank: 0 },
  winter: { regime: 'stratocumulus-deck', coverage: 0.86, baseM: 700, thicknessM: 420, shadow: false, streets: 0.2, cirrus: 0, farBand: 0.6, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  urban: { regime: 'altocumulus', coverage: 0.55, baseM: 2800, thicknessM: 380, shadow: false, streets: 0.1, cirrus: 0.3, farBand: 0.35, contrails: 4, rain: 0, virga: 0, fogBank: 0 },
  coastal: { regime: 'sea-streets', coverage: 0.32, baseM: 1100, thicknessM: 600, shadow: true, streets: 0.75, cirrus: 0.08, farBand: 0.65, contrails: 0, rain: 0, virga: 0, fogBank: 0.45 },
  autumn: { regime: 'fair-weather-cumulus', coverage: 0.26, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.25, contrails: 2, rain: 0, virga: 0, fogBank: 0 },
  steppe: { regime: 'cloud-streets', coverage: 0.34, baseM: 1400, thicknessM: 660, shadow: true, streets: 0.9, cirrus: 0.2, farBand: 0.35, contrails: 0, rain: 0.2, virga: 0, fogBank: 0 },
  railyard: { regime: 'industrial-stratocumulus', coverage: 0.92, baseM: 800, thicknessM: 460, shadow: false, streets: 0.15, cirrus: 0, farBand: 0.55, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  frontier: { regime: 'cloud-streets', coverage: 0.4, baseM: 1400, thicknessM: 660, shadow: true, streets: 0.85, cirrus: 0.15, farBand: 0.35, contrails: 2, rain: 0, virga: 0, fogBank: 0 },
  fjord: { regime: 'broken-stratocumulus', coverage: 0.62, baseM: 900, thicknessM: 500, shadow: true, streets: 0.3, cirrus: 0.1, farBand: 0.6, contrails: 0, rain: 0.3, virga: 0.15, fogBank: 0.4 },
  delta: { regime: 'towering-cumulus', coverage: 0.38, baseM: 1200, thicknessM: 1500, shadow: true, streets: 0.15, cirrus: 0.1, farBand: 0.3, contrails: 0, rain: 0.45, virga: 0.1, fogBank: 0 },
  badlands: { regime: 'cumulus-humilis', coverage: 0.18, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.35, farBand: 0.15, contrails: 0, rain: 0.3, virga: 0.9, fogBank: 0 },
  monsoon: { regime: 'cumulonimbus-front', coverage: 0.4, baseM: 1000, thicknessM: 3000, shadow: true, streets: 0.1, cirrus: 0.25, farBand: 0.4, contrails: 0, rain: 0.85, virga: 0, fogBank: 0 },
  alpine: { regime: 'towering-cumulus', coverage: 0.26, baseM: 1900, thicknessM: 900, shadow: true, streets: 0, cirrus: 0.3, farBand: 0.5, contrails: 0, rain: 0.15, virga: 0.1, fogBank: 0 },
  caldera: { regime: 'cumulus-humilis', coverage: 0.22, baseM: 1500, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.45, farBand: 0.15, contrails: 0, rain: 0.3, virga: 0.85, fogBank: 0 },
  foundry: { regime: 'industrial-stratocumulus', coverage: 0.88, baseM: 850, thicknessM: 520, shadow: false, streets: 0.15, cirrus: 0, farBand: 0.55, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  ruinspires: { regime: 'fair-weather-cumulus', coverage: 0.42, baseM: 1100, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.25, contrails: 0, rain: 0.25, virga: 0.6, fogBank: 0 },
  blackglass: { regime: 'ash-veil', coverage: 0.55, baseM: 800, thicknessM: 450, shadow: false, streets: 0.2, cirrus: 0.5, farBand: 0.4, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  // (2026-10-04: a dense overcast is closed — Titan Gorge's deck opened a blue hole at 0.96 under a light model at overcast 1)
  // (2026-10-05, the map-revival lane's Titan round 2: Monument Valley under fair-weather cumulus, the deck opened)
  titan_gorge: { regime: 'fair-weather-cumulus', coverage: 0.34, baseM: 1200, thicknessM: 820, shadow: true, streets: 0.35, cirrus: 0.12, farBand: 0.25, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  skybridge: { regime: 'fair-weather-cumulus', coverage: 0.42, baseM: 700, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.5, contrails: 0, rain: 0.2, virga: 0.5, fogBank: 0 },
  polders: { regime: 'broken-stratocumulus', coverage: 0.68, baseM: 600, thicknessM: 500, shadow: true, streets: 0.4, cirrus: 0.1, farBand: 0.5, contrails: 3, rain: 0.2, virga: 0.2, fogBank: 0.35 },
  // (2026-10-05, the map-revival lane: Copper Mesa is Queenstown under the west coast's broken stratocumulus)
  copper_mesa: { regime: 'broken-stratocumulus', coverage: 0.62, baseM: 900, thicknessM: 500, shadow: true, streets: 0.3, cirrus: 0.1, farBand: 0.5, contrails: 0, rain: 0.2, virga: 0.2, fogBank: 0 },
  airfield: { regime: 'fair-weather-cumulus', coverage: 0.38, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.35, cirrus: 0.12, farBand: 0.25, contrails: 6, rain: 0, virga: 0, fogBank: 0 },
  oasis: { regime: 'cumulus-humilis', coverage: 0.17, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.4, farBand: 0.15, contrails: 0, rain: 0.3, virga: 0.85, fogBank: 0 },
  whiteout: { regime: 'low-stratus', coverage: 1, baseM: 300, thicknessM: 300, shadow: false, streets: 0, cirrus: 0, farBand: 0.5, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  orchard: { regime: 'fair-weather-cumulus', coverage: 0.28, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.4, cirrus: 0.12, farBand: 0.25, contrails: 2, rain: 0, virga: 0, fogBank: 0 },
  longleaf: { regime: 'fair-weather-cumulus', coverage: 0.32, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.5, cirrus: 0.12, farBand: 0.25, contrails: 0, rain: 0.3, virga: 0, fogBank: 0 },
  mangrove: { regime: 'towering-cumulus', coverage: 0.34, baseM: 1200, thicknessM: 1500, shadow: true, streets: 0.15, cirrus: 0.1, farBand: 0.3, contrails: 0, rain: 0.45, virga: 0.1, fogBank: 0 },
  saltwind: { regime: 'sea-streets', coverage: 0.3, baseM: 1100, thicknessM: 600, shadow: true, streets: 0.75, cirrus: 0.08, farBand: 0.55, contrails: 0, rain: 0, virga: 0, fogBank: 0.35 },
  reservoir: { regime: 'fair-weather-cumulus', coverage: 0.26, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.25, contrails: 2, rain: 0, virga: 0, fogBank: 0 },
  mars: { regime: 'thin-ice-clouds', coverage: 0.06, baseM: 2500, thicknessM: 400, shadow: false, streets: 0.2, cirrus: 0.45, farBand: 0, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
  cliffbridge: { regime: 'fair-weather-cumulus', coverage: 0.28, baseM: 1200, thicknessM: 820, shadow: true, streets: 0.35, cirrus: 0.25, farBand: 0.25, contrails: 2, rain: 0, virga: 0, fogBank: 0 },
}, 'the cloudscape of every map (round 71 identity table; round 76: foundry and railyard on the industrial stratocumulus, urban on the altocumulus; 2026-10-01: the layered sky — contrails, rain and virga, fog banks)');
{
  // the regime rows are complete and sane; every regime name resolves
  assert.equal(CLOUDSCAPE_REGIME_NAMES.length, 20, 'eighteen round-71 regimes and the two of round 76 (industrial-stratocumulus, altocumulus)');
  for (const name of CLOUDSCAPE_REGIME_NAMES) {
    const row = CLOUDSCAPE_REGIMES[name];
    assert.ok(row.coverage >= 0 && row.coverage <= 0.97 && row.thicknessM > 0 && row.density > 0, `${name} row`);
    assert.ok(row.type[0] <= row.type[1], `${name} type range`);
    for (const k of ['towers', 'anvil', 'wispiness', 'shear', 'streets', 'cirrus', 'stratiform', 'fieldMix', 'farBand', 'scud', 'cells', 'deckLight', 'undulatus', 'interior']) assert.ok(row[k] >= 0 && row[k] <= 2, `${name}.${k}`);
    assert.ok(row.cellM >= 100, `${name}.cellM`);
  }
  assert.ok(!isCloudscapeRegime('puffs'));
  // round 76 (the deck pass): the deck knobs are gated in the trace (mix( S, Sd, uDeckLight ), cloudCellK's early
  // return, exact 1.0 factors at zero), so the regimes the integrator rated — every cumuliform row and whiteout's
  // low stratus — keep the round-71 numbers byte for byte; the deck rows carry cells and the transmitted lighting
  for (const name of ['fair-weather-cumulus', 'cloud-streets', 'sea-streets', 'towering-cumulus', 'cumulonimbus-front', 'storm-front', 'cumulus-humilis', 'lenticular', 'low-stratus', 'high-cirrus', 'thin-ice-clouds']) {
    const row = CLOUDSCAPE_REGIMES[name];
    assert.deepEqual([row.cells, row.deckLight, row.undulatus, row.interior], [0, 0, 0, 0], `${name}: the round-71 layer untouched by the deck pass`);
  }
  for (const name of ['stratocumulus-deck', 'industrial-stratocumulus', 'dense-overcast', 'overcast-stratus', 'hazy-altostratus', 'ice-fog-stratus']) {
    const row = CLOUDSCAPE_REGIMES[name];
    assert.ok(row.cells > 0 && row.deckLight === 1 && row.undulatus > 0, `${name}: a cellular deck lit by what its columns transmit`);
  }
  assert.ok(CLOUDSCAPE_REGIMES['broken-stratocumulus'].deckLight === 1 && CLOUDSCAPE_REGIMES['broken-stratocumulus'].interior > 0, 'a broken stratocumulus takes the deck lighting whole (the blend paid both lighting paths: polders 1.7 ms) and the interior octave');
  assert.ok(CLOUDSCAPE_REGIMES.altocumulus.cellM < 700 && CLOUDSCAPE_REGIMES.altocumulus.baseM >= 2500 && CLOUDSCAPE_REGIMES.altocumulus.stratiform < 0.5, 'altocumulus: small elements high, cumuliform enough to keep lit borders');
  // the monsoon front keeps the sky over the camera open (round 68's ruling) with scud and anvils; the
  // white-out ceiling is a sheet at its authored altitude; the winter deck is a lumpy stratocumulus
  const monsoon = deriveCloudLayerPreset(skyOf('monsoon'));
  assert.deepEqual([monsoon.clearRadiusM, monsoon.anvil, monsoon.scud > 0, monsoon.towers, monsoon.typeRange, monsoon.fieldMix], [2500, 1, true, 1, [0.65, 1], 0.9], 'the front: wide masses of the broad field, clustered towers, anvils, scud, the sky over the camera open');
  const whiteout = deriveCloudLayerPreset(skyOf('whiteout'));
  assert.ok(whiteout.stratiform >= CLOUD_LAYER_RULES.sheetStratiform && whiteout.baseM === 300 && whiteout.fieldMix >= 0.8 && whiteout.scud === 0, 'whiteout: a closed ceiling, no rags at the camera');
  const winter = deriveCloudLayerPreset(skyOf('winter'));
  assert.ok(winter.stratiform < CLOUD_LAYER_RULES.sheetStratiform && winter.typeRange[1] <= 0.45 && winter.coverage >= 0.8, 'winter: a lumpy closed deck, not a flat sheet');
  // round 76: the deck identities — winter's cells and transmitted lighting, foundry's and railyard's industrial
  // stratocumulus low under a smoggy horizon with a warm / dirty base tint, urban's altocumulus; whiteout keeps
  // round 71's ceiling exactly (the integrator rated it)
  // (2026-10-03, the gauntlet's wave 27: kilometre-scale relief — fp14's dk3, broad cells and strong rolls, on Frosthollow
  // and Railyard exactly as shot)
  assert.deepEqual([winter.cells, winter.deckLight, winter.cellM, winter.ambientScale, winter.undulatus], [1, 1, 2400, 2, 0.7], 'winter: a cellular deck lit through, broad cells and rolls');
  // (2026-10-04, the skies lane's deck structure: Whiteout's stratus lit as a deck — one lighting path — with soft cells,
  // base lumps and the detail's erosion, its base lifted by the snow; Titan's lumps)
  assert.deepEqual([whiteout.cells, whiteout.deckLight, whiteout.lumps, whiteout.deckDetail, whiteout.ambientScale, whiteout.undulatus, whiteout.interior],
    [0.5, 1, 0.6, 0.5, 3, 0, 0], 'whiteout: a structured deck on the deck path alone');
  const titan = deriveCloudLayerPreset(skyOf('titan_gorge'));
  // (2026-10-05, the map-revival lane's Titan round 2: Monument Valley's sky is the fair-weather cumulus regime — no deck,
  // so no base lumps and no cells)
  assert.deepEqual([titan.lumps, titan.cells, titan.deckLight], [0, 0, 0], 'titan: fair-weather cumulus, no deck structure');
  const foundry = deriveCloudLayerPreset(skyOf('foundry'));
  assert.ok(foundry.regime === 'industrial-stratocumulus' && foundry.baseM === 850 && foundry.cells === 0.9 && foundry.deckLight === 1 && foundry.cirrus === 0, 'foundry: a low cellular industrial deck, no cirrus over it');
  assert.ok(foundry.tint[0] > foundry.tint[2] && foundry.tint[0] > 0.75, 'foundry: the smog rides on the deck\'s base as a warm-grey albedo');
  const railyard = deriveCloudLayerPreset(skyOf('railyard'));
  // (2026-10-03, the gauntlet's wave 27: fp14's dk3 — broad cells and strong rolls, cells 1, cellM 2400, undulatus 0.7)
  assert.ok(railyard.regime === 'industrial-stratocumulus' && railyard.coverage === 0.92 && railyard.cells === 1 && railyard.cellM === 2400 && railyard.density === 0.16 && railyard.sunGain === 0.7 && railyard.undulatus === 0.7, 'railyard: a closed dirty deck with broad cells and strong undulatus rolls');
  assert.ok(railyard.tint.every((c) => c < foundry.tint[1]) && railyard.tint[0] - railyard.tint[2] < foundry.tint[0] - foundry.tint[2], 'railyard: a dirtier, less warm base than foundry\'s');
  const urban = deriveCloudLayerPreset(skyOf('urban'));
  assert.ok(urban.regime === 'altocumulus' && urban.cellM === 340 && urban.interior === 0.4 && urban.deckLight === 1, 'urban: an altocumulus layer of small elements');
  assert.notEqual(cloudLayerKey(winter), cloudLayerKey({ ...winter, cells: 0 }), 'the key follows the deck knobs');
  // the sea maps' wind comes from their authored ocean, the streets follow it
  const coastal = deriveCloudLayerPreset(skyOf('coastal'));
  assert.equal(+(coastal.windDirRad * 180 / Math.PI).toFixed(3), 190);
  assert.equal(+(coastal.cirrusAngleRad - coastal.windDirRad).toFixed(5), +CLOUD_LAYER_RULES.cirrusVeerRad.toFixed(5), 'the cirrus veers off the wind by the rule');
  // the towering regimes lean downwind by a share of their thickness; a lenticular cap is stationary and smooth
  const delta = deriveCloudLayerPreset(skyOf('delta'));
  assert.equal(delta.shearM, 0.3 * 1500);
  const alpine = deriveCloudLayerPreset(skyOf('alpine'));
  assert.deepEqual([alpine.windSpeed, alpine.shearM, alpine.towers, alpine.anvil, alpine.fieldMix], [4, 90, 0.3, 0, 0.92], 'alpine: slow mountain cumulus in big masses (the broad field, few small cells), bulging tops, no anvils');
  const lenticular = deriveCloudLayerPreset({ ...skyOf('alpine'), cloudscape: { regime: 'lenticular' } });
  assert.deepEqual([lenticular.windSpeed, lenticular.shearM, lenticular.wispiness, lenticular.fieldMix], [0, 0, 0, 1], 'a lenticular cap is stationary, smooth and cut from the broad field');
}
// the shadow policy: a night sky (the runtime's night preset dims the dome to .08) casts none; an authored override wins;
// a map without a cloudscape (the Garage's copies) keeps the round-68 derivation
{
  const verdantSky = { ...DEFAULT_SKY_PRESET, ...(getMapConfig('verdant').sky ?? {}) };
  const legacy = deriveCloudLayerPreset(verdantSky);
  assert.deepEqual([legacy.regime, +legacy.coverage.toFixed(3), legacy.baseM, Math.round(legacy.thicknessM), legacy.shadow, legacy.streets, legacy.cirrus],
    ['scattered', 0.22, 1400, 327, true, 0, 0], 'a sky block alone derives the round-68 fair-weather layer');
  const verdant = skyOf('verdant');
  assert.equal(deriveCloudLayerPreset(verdant).shadow, true);
  assert.equal(deriveCloudLayerPreset({ ...verdant, skyIntensity: 0.08 }).shadow, false, 'no moon-cast cloud shadows');
  assert.equal(deriveCloudLayerPreset({ ...verdant, cloudscape: { ...verdant.cloudscape, shadow: false } }).shadow, false, 'the cloudscape can decline shadows');
  const authored = deriveCloudLayerPreset({ ...verdant, cloudLayer: { coverage: 0.7, regime: 'broken', baseM: 900 } });
  assert.deepEqual([authored.coverage, authored.regime, authored.baseM], [0.7, 'broken', 900], 'sky.cloudLayer overrides field by field over the cloudscape');
  assert.notEqual(cloudLayerKey(authored), cloudLayerKey(deriveCloudLayerPreset(verdant)), 'the key follows every field');
  assert.equal(cloudLayerKey(deriveCloudLayerPreset(verdant)), cloudLayerKey(deriveCloudLayerPreset({ ...verdant })), 'the key is stable');
  const knobs = deriveCloudLayerPreset({ ...verdant, cloudscape: { regime: 'fair-weather-cumulus', cirrus: 0.5, wispiness: 0.9, shear: 0.5, windDirDeg: 90, tintHex: 0x808080 } });
  assert.deepEqual([knobs.cirrus, knobs.wispiness, knobs.shearM, +knobs.windDirRad.toFixed(4)], [0.5, 0.9, 410, +(Math.PI / 2).toFixed(4)], 'the knobs override the row');
  assert.ok(knobs.tint[0] < 0.6 && knobs.tint[0] === knobs.tint[1], 'an authored tint is perceptually halved');
  assert.notEqual(cloudLayerKey(knobs), cloudLayerKey(deriveCloudLayerPreset(verdant)));
  const noRegime = deriveCloudLayerPreset({ ...verdantSky, cloudscape: { cirrus: 0.4 } });
  assert.deepEqual([noRegime.regime, +noRegime.coverage.toFixed(3), noRegime.cirrus], ['scattered', 0.22, 0.4], 'knobs without a regime refine the legacy layer');
  const co = (v) => deriveCloudLayerPreset({ ...verdantSky, cloudOpacity: v }).coverage;
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
assert.deepEqual(CLOUD_STEP_SCALE_BY_PRESET, { low: 1.8, medium: 1.3, high: 1, ultra: 1 }, 'the low preset marches coarser; high and ultra at the full stride');

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
// 2026-10-02: the pass's haze layer (a camera high over the ground looks through less of it) on the clouds too, from the
// datum the pass computes for the frame (the ground under the camera), and the square's ceilings a third lower
assert.equal(CLOUD_AERIAL.layerH, postConst('AERIAL_LAYER_H'));
assert.ok(layerSource.includes('float layer = cloudHazeLayer( dist, dir );') && layerSource.includes('* ${f(CLOUD_AERIAL.hazeDensity)} * layer;'), 'the layer factor scales both haze curves');
assert.ok(postSource.includes('beforeSceneRender(renderer, camera, dt, sceneTarget.width, sceneTarget.height, aerial.uniforms.uHazeDatum.value, sceneTarget.depthTexture)'), 'the pass hands the clouds its datum and the scene depth');
// ---- 2026-10-03 (the mountains lane: "seaFogBank() integrates out to 30 km regardless of scene depth"): every layer the
// trace sums ends at the scene's surface — the previous frame's resolved depth read through the camera that drew it
{
  const trace = layerSource.slice(layerSource.indexOf('const TRACE_FRAGMENT'), layerSource.indexOf('const RESOLVE_FRAGMENT'));
  for (const u of ['tSceneDepth', 'uSceneDepthOn', 'uSceneNearFar', 'uDepthRight', 'uDepthUp', 'uDepthFwd', 'uDepthTan']) {
    assert.match(trace, new RegExp(`uniform [a-zA-Z0-9]+ ${u};`), `${u} is declared`);
    assert.match(layerSource, new RegExp(`${u}: \\{ value: `), `${u} has a uniform object`);
  }
  assert.ok(trace.indexOf('float cloudSceneT( vec3 dir )') < trace.indexOf('vec4 slabRain('), 'the helper stands ahead of the layers');
  assert.match(trace, /if \( uSceneDepthOn < 0\.5 \) return 1e9;/, 'off: no limit');
  assert.match(trace, /if \( depth >= 0\.999999 \) return 1e9;/, 'the sky (cleared depth): no limit');
  assert.match(trace, /float sceneT = cloudSceneT\( dir \);\s*t1 = min\( t1, sceneT \);/, 'the slab ends at the surface');
  assert.match(trace, /float tB = min\( min\( tTop, \$\{f\(CLOUD_FOGBANK_RANGE_M\[1\]\)\} \), sceneT \);/, 'the sea fog bank ends at the surface');
  assert.match(trace, /tEnd = min\( min\( tEnd, \$\{f\(CLOUD_RAIN_RANGE_M\[1\]\)\} \), sceneT \);/, 'the rain ends at the surface');
  assert.match(trace, /if \( tb <= 0\.0 \|\| horiz <= fbStart \|\| tb >= sceneT \) return none;/, 'a far band behind a surface is hidden');
  assert.match(trace, /if \( tc <= 0\.0 \|\| tc >= sceneT \) return none;/, 'the cirrus behind a surface is hidden');
  // the JS: the previous camera's frame, off for a camera in or over the slab, until the scene has drawn, after a resize
  assert.match(layerSource, /const depthOn = !!depthTex && this\.sceneDepthReady && this\.hasPrev && C\.pos\.y <= \(t\.uSlabLow\.value as number\);/);
  assert.match(layerSource, /\(t\.uDepthFwd\.value as THREE\.Vector3\)\.copy\(P\.fwd\);/, 'the camera that drew the depth (the previous frame\'s)');
  assert.ok(layerSource.indexOf('(t.uSceneNearFar.value as THREE.Vector2).copy(this.depthPlanes);') < layerSource.indexOf('this.depthPlanes.set(camera.near, camera.far);'), 'its planes, before this frame\'s replace them');
  assert.match(layerSource, /this\.resize\(width, height\); this\.sceneDepthReady = false;/, 'a resize drops the stale depth');
  assert.match(layerSource, /\/\/ the scene draws next with this camera: its depth is the next frame's cloudSceneT\s*this\.sceneDepthReady = true;/);
  // the twin of the GLSL's projection and linear depth: a surface 3.8 km out along a ray 20° right of the view, seen by
  // a camera with near 0.5 / far 4000, comes back at 3.8 km
  const near = 0.5, far = 4000, tanX = Math.tan(Math.PI / 4) * 16 / 9, tanY = Math.tan(Math.PI / 6);
  const dir = [Math.sin(0.35), 0.01, -Math.cos(0.35)]; const n = Math.hypot(...dir); dir.forEach((v, i) => { dir[i] = v / n; });
  const fz = -dir[2], viewZ = -3800 * fz;
  const depth = (far / (far - near)) * (1 + near / viewZ); // three's perspective depth (OpenGL convention), viewZ < 0
  const uv = [0.5 + 0.5 * dir[0] / (fz * tanX), 0.5 + 0.5 * dir[1] / (fz * tanY)];
  assert.ok(uv[0] > 0 && uv[0] < 1 && uv[1] > 0 && uv[1] < 1, 'inside the frame');
  const back = -((near * far) / ((far - near) * depth - far)) / fz;
  assert.ok(Math.abs(back - 3800) < 1e-6, `the linear depth round-trips (${back})`);
  assert.match(trace, /float viewZ = \( uSceneNearFar\.x \* uSceneNearFar\.y \) \/ \( \( uSceneNearFar\.y - uSceneNearFar\.x \) \* depth - uSceneNearFar\.y \);\s*float t = -viewZ \/ fz;/, 'the same linearisation as the aerial pass');
  // only a surface past the dome limits the layers: inside it the dome's depth test hides them, and a history traced
  // whole behind a near ridge has nothing missing when a camera turn reveals it
  assert.match(trace, /return t < \$\{f\(CLOUD_DOME_RADIUS_M\)\} \? 1e9 : t;/, 'a surface inside the dome: the whole sky traced');
}
assert.ok(CLOUD_AERIAL.extCeiling <= 0.45 && CLOUD_AERIAL.scatterCeiling <= 0.4, 'the square keeps most of a far range\'s colour');
// round 71: the far ramp moved out so a deck stays readable at the horizon
assert.ok(CLOUD_AERIAL.farStartM >= 5000 && CLOUD_AERIAL.farEndM >= 20000 && CLOUD_AERIAL.farScatterCeiling <= 0.85, 'the far scatter ramp keeps a far deck readable');
const renderFrame = postSource.slice(postSource.indexOf('  function renderFrame('), postSource.indexOf('\n  // Live preset switching'));
assert.equal(renderFrame.match(/volumetricClouds\?\.beforeSceneRender\(/g)?.length, 1, 'one hook inside the frame transaction');
assert.equal(postSource.match(/beforeSceneRender\(/g)?.length, 1, 'no other post path marches the clouds');
assert.ok(renderFrame.indexOf('beforeSceneRender(') < renderFrame.indexOf('const jittered = taa.enabled;'), 'the march reads the unjittered camera');
assert.match(skySource, /get\('clouds'\)/, 'the ?clouds switch is read from the URL');
assert.match(skySource, /if \(requested === 'baked'\) return false;\s+return true;/,
  'the volumetric layer is the default (owner 2026-09-25 on the round-71 sheet: "wow our clouds look amazing"); ?clouds=baked is the explicit opt-out');
assert.match(skySource, /requested === 'off'\) return false/, 'the ?clouds=off fallback keeps the baked decks');
assert.match(skySource, /scene\.userData\.volumetricClouds = volumetricClouds;/);
assert.match(skySource, /CLOUD_NOISE_KINDS\.every\(\(kind\) => cloudNoiseUpload\[kind\]\)/, 'the worker handshake waits for every kind');
// 2026-10-03: no cascade gobos — the dithered shade under the PCF taps was the gauntlet's stipple, arcs and weave
assert.ok(!mainSource.includes('attachShadowCascades') && !skySource.includes('attachShadowCascades'), 'nothing attaches the cascades to the clouds');
assert.match(mainSource, /cloudscape: config\.clouds/, 'the map\'s clouds block rides with its sky block into the rig');
assert.ok(layerSource.includes('${ATMOSPHERE_SKY_GLSL}') && layerSource.includes('atmoSkyVisible( skyDir )'), 'the trace hazes toward the sky-view LUT');
for (const gone of ['markShadowOnly', 'setShadowCasterCascades', 'customDepthMaterial', 'GOBO_FRAGMENT', 'uShadowCellOrigin', 'bindCloudShadowCascade']) {
  assert.ok(!layerSource.includes(gone), `no shadow-map gobo left (${gone})`);
}
// round 78: the low-deck march law — a stratus deck under 400 m takes the cellular decks' 10 km cap and far strides
// (whiteout's 300 m ceiling marched twenty kilometres of sheet at the centre-far view); the cellular decks are
// unchanged, every cumuliform regime and high sheet stays on the full march
assert.equal(CLOUD_LOW_DECK_BASE_M, 400);
assert.ok(layerSource.includes('if ( uDeckMarch > 0.0 ) t1 = min( t1, ${f(CLOUD_DECK_MARCH_MAX_M)} );'), 'the cap reads uDeckMarch');
assert.ok(layerSource.includes('uThick > 2000.0 || uDeckMarch > 0.0 ? 1.0 : 0.4'), 'the far strides read uDeckMarch');
assert.ok(!layerSource.includes('if ( uCells > 0.0 ) t1 = min('), 'the old cells-only cap is gone');
assert.ok(layerSource.includes('t.uDeckMarch.value = cloudDeckMarch(preset);'), 'the uniform follows the preset');
assert.deepEqual([cloudDeckMarch({ cells: 0, stratiform: 0.8, baseM: 300 }), cloudDeckMarch({ cells: 0, stratiform: 0.8, baseM: 400 }), cloudDeckMarch({ cells: 0.5, stratiform: 0, baseM: 2800 }), cloudDeckMarch({ cells: 0, stratiform: 0.3, baseM: 300 }), cloudDeckMarch({ cells: 0, stratiform: 0.08, baseM: 1400 })], [1, 0, 1, 0, 0], 'the deck march law');
{
  const deckMarchMaps = [];
  for (const id of MAP_IDS) {
    const preset = deriveCloudLayerPreset(skyOf(id));
    const cells = preset.cells > 0;
    assert.equal(cloudDeckMarch(preset), cells || (preset.stratiform >= 0.5 && preset.baseM < CLOUD_LOW_DECK_BASE_M) ? 1 : 0, id);
    if (cloudDeckMarch(preset) && !cells) deckMarchMaps.push(id);
  }
  // (2026-10-04: whiteout's deck is cellular now too — the law still marches it on the deck cap, through its cells)
  assert.deepEqual(deckMarchMaps, [], 'every deck under 400 m is cellular (whiteout since 2026-10-04): the low-deck law is the backstop');
}
assert.match(layerSource, /t\.uStepScale\.value = CLOUD_STEP_SCALE_BY_PRESET\[resolvePresetName\(\)\]/, 'the stride scale follows the quality preset every frame');
assert.match(layerSource, /blendSrc: THREE\.OneFactor, blendDst: THREE\.OneMinusSrcAlphaFactor/, 'premultiplied composite over the dome');
assert.match(layerSource, /uniform sampler3D tShape;[\s\S]*uniform sampler3D tDetail;[\s\S]*uniform sampler3D tCurl;/, 'the volumes are 3D textures');
for (const term of ['phaseDual( cosT, 0.8 )', 'exp( -tau * 0.25 )', 'float powder = mix( 1.0, 1.0 - exp( -sig * 60.0 ), powderK )', 'texelFetch( tBlue', 'cloudCoverageAt(', 'uAnvil', 'uShearM', 'uWispiness', 'uCirrus', 'uFarBand', 'uScud', 'halo']) {
  assert.ok(layerSource.includes(term), `the trace carries ${term}`);
}
assert.ok(layerSource.includes("name: 'VolumetricCloudTrace'") && layerSource.includes("name: 'VolumetricCloudResolve'") && layerSource.includes("name: 'VolumetricCloudDome'") && layerSource.includes("name: 'VolumetricCloudFarShade'"));
console.log('volumetricClouds.selftest: deterministic noise (six bakes), tiling, equalisation and street anisotropy, the 31-map cloudscape table, the regime rows, the shadow policy, the slot cycle, the haze mirror and the hooks pinned');

// The shade map keeps the gobos' soft edge band (a continuous opacity over the cut, never a binary stamp).
// (2026-10-05: the band's half-width a QA knob, 0.04 by default — CLOUD_SHADOW_SOFT — over the visible outline)
assert.match(layerSource,/smoothstep\( uThreshold \+ uShadeLook\.y - uShadeLook\.z, uThreshold \+ uShadeLook\.y \+ uShadeLook\.z, cloudField/,'cloud edges have a continuous opacity band');

// 2026-10-04 (the gauntlet's wave 62 on Titan Gorge: the sun "a flat, hard-edged white disc pasted on a featureless
// grey-white sky"): a ray the march ends under the 0.03 cut is opaque, its in-scatter renormalised for the remainder —
// the 3 % the cut left let the sun's disc (tens of thousands of times the sky) burn through a closed deck or a core.
assert.match(layerSource, /if \( t > t1 \|\| T < 0\.03 \) break;[\s\S]*?if \( T < 0\.03 && uOpaqueCut > 0\.0 \) \{ L \/= max\( 1\.0 - T, 0\.5 \); T = 0\.0; \}\s*if \( wAcc > 1e-4 \) \{/,
  'the cut ray opaque, before the haze reads its cover');
assert.match(layerSource, /uOpaqueCut: \{ value: 1 \},/);
assert.match(layerSource, /t\.uOpaqueCut\.value = lightTune\('CLOUD_OPAQUE_CUT', 1\);/, 'on by default (QA knob)');
{
  // the renormalisation keeps a uniform mass's radiance: a ray cut at T over a mass of radiance S carries S (1 − T);
  // over (1 − T) it is S again, and nothing of the background (the disc) comes through
  for (const T of [0.001, 0.01, 0.0299]) {
    const S = 0.8, L = S * (1 - T);
    assert.ok(Math.abs(L / Math.max(1 - T, 0.5) - S) < 1e-12, `cut at T ${T}: the mass's radiance whole`);
  }
}
// and the sun's light diffused through a deck keeps a broad forward lobe (its mean over the sky unchanged): a readable
// sun direction under a closed deck without a disc
assert.match(layerSource, /float deckLobe = 1\.0 \+ uDeckLobe \* \( phaseDual\( cosT, 0\.6 \) \* 4\.0 \* CL_PI - 1\.0 \);\s*vec3 Etop = sunTop \* \$\{f\(CLOUD_DECK_SUN_SHARE\)\} \/ CL_PI \* deckLobe \+ uSkyIrradiance;/,
  'the lobe on the sun\'s diffused share only, the sky\'s untouched');
assert.match(layerSource, /export const CLOUD_DECK_SUN_LOBE = 0\.2;/);
assert.match(layerSource, /t\.uDeckLobe\.value = lightTune\('CLOUD_DECK_SUN_LOBE', CLOUD_DECK_SUN_LOBE\);/);
{
  // the lobe's mean over the sphere is 1 (phaseDual integrates to one): the deck's mean light is unchanged
  const hg = (c, g) => (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * c, 1.5));
  const dual = (c, g) => hg(c, g) * 0.7 + hg(c, -0.375 * g) * 0.3;
  let mean = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const c = -1 + 2 * (i + 0.5) / n; mean += (1 + 0.2 * (dual(c, 0.6) * 4 * Math.PI - 1)) / n; }
  assert.ok(Math.abs(mean - 1) < 1e-3, `the lobe's mean over the sky ${mean.toFixed(4)}`);
  assert.ok(1 + 0.2 * (dual(1, 0.6) * 4 * Math.PI - 1) > 2, 'toward the sun the diffused sun more than doubles');
}
// 2026-10-09: a capture's clouds are a function of its scene time alone. Two layers whose live pages ran different
// histories (the drift, the billows' boil, the contrails' upper drift, the shade map's refresh age, a storm's lightning)
// hold the same cloud state after setCaptureTime(t, true), so two renders of one scene draw the same clouds and cloud
// shadows (the media lane's engine reviews r10 and r11 drew S35's field in cloud shadow once and in sun once).
{
  const preset = deriveCloudLayerPreset(skyOf('verdant'));
  const make = () => { const l = new VolumetricCloudLayer({}, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1)); l.setPreset(preset); return l; };
  const a = make(), b = make();
  b.weatherShift.set(1234, -567); b.noiseShift.set(89, 4321, -12); b.cirrusShift.set(2222, 3); b.upperDrift.set(-9876, 543);
  Object.assign(b, { farShadeValid: true, farShadeAge: 5, flashSeed: 7, flashClock: 2.5, flashNext: 11, flashAge: 0.1, flashStrokes: 2, flashPeak: 0.8, historyIndex: 1, frame: 13 });
  const state = (l) => JSON.stringify([l.weatherShift, l.noiseShift, l.cirrusShift, l.upperDrift, l.farShadeValid, l.flashSeed, l.flashClock,
    l.flashNext, l.flashAge, l.flashStrokes, l.flashPeak, l.historyIndex, l.frame, l.traces]);
  for (const t of [0, 1.234, 4.7]) {
    a.setCaptureTime(t, true);
    b.setCaptureTime(t, true);
    assert.equal(state(b), state(a), `the clouds at ${t} s are the scene's, whatever the page drew before`);
    // a later sample of the take (no restart): the drift follows the time and the shade map is cut again
    a.setCaptureTime(t + 0.033);
    b.setCaptureTime(t + 0.033);
    assert.equal(state(b), state(a), `and at ${t + 0.033} s`);
    assert.equal(b.farShadeValid, false, 'a capture sample re-cuts the shade map at its own drift');
  }
  a.setCaptureTime(0, true);
  const boil0 = a.noiseShift.y, trail0 = a.upperDrift.x;
  a.setCaptureTime(6, true);
  assert.ok(Math.abs(a.noiseShift.y - boil0) > 1, 'the billows turn over with scene time');
  assert.ok(Math.abs(a.upperDrift.x - trail0) > 1 || Math.abs(Math.cos(preset.cirrusAngleRad)) < 1e-6, 'the contrails drift with scene time');
  a.dispose();
  b.dispose();
}
console.log('volumetricClouds.selftest: the cut ray opaque (no disc through a closed deck), the forward lobe of a deck PASS');
