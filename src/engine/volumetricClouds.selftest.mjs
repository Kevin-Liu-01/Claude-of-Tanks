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
// Clouds 2.0 (2026-10-06): the layered medium (cloudLayers.ts / cloudShaders.ts; cloudLayers.selftest.mjs pins the
// stacks), the GPU-baked noise volumes (cloudVolumeNoise.ts), the local weather (equalised, tileable, cloud fields with
// clearings), the Beer shadow map's toroidal cascades and its lookup, the parabolic shells' ray band, the quality tiers,
// the depth-reprojected resolve with its variance clip; the round-71 sky beyond the medium (haze law, scene depth, rain,
// fog bank, cirrus) as before.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CLOUD_BLUE_SIZE, CLOUD_LOCAL_SIZE, CLOUD_NOISE_SEED, CLOUD_WEATHER_SIZE,
  bakeCloudBlueNoise, bakeCloudLocalWeather, bakeCloudNoise, bakeCloudWeatherMap, bakeCloudWeatherStreets,
} from './cloudNoise.ts';
import { CLOUD_LAYER_RULES, cloudLayerKey, deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { CLOUDSCAPE_REGIMES, CLOUDSCAPE_REGIME_NAMES, isCloudscapeRegime } from './cloudscapes.ts';
import { CLOUD_CONTRAILS_ON } from './cloudscapeLayer.ts';
import { CLOUD_CONTRAIL_MAX } from './cloudWeatherLayers.ts';
// the count a map authors (what the layer derives with the contrail switch on)
const authoredContrails = (id) => Math.round(Math.min(1, Math.max(0, getMapConfig(id)?.clouds?.contrails ?? 0)) * CLOUD_CONTRAIL_MAX);
import {
  VolumetricCloudLayer, cloudCameraCut, CLOUD_AERIAL, CLOUD_BAYER_4, CLOUD_BSM_CASCADES, CLOUD_BSM_SLICES, CLOUD_DECK_SUN_LOBE, CLOUD_DOME_RADIUS_M, CLOUD_HISTORY_SCALE,
  CLOUD_NOISE_KINDS, CLOUD_REBUILD_SLOTS, CLOUD_SLOT_ORDER, CLOUD_TIERS, CLOUD_TRACE_DIVISOR,
} from './volumetricClouds.ts';
import { CLOUD2_EARTH_R, CLOUD2_PERIODS } from './cloudShaders.ts';
import { CLOUD_SHAPE_TEXELS, CLOUD_DETAIL_TEXELS, CLOUD_TURBULENCE_TEXELS, CLOUD_LATTICE_NOISE_GLSL } from './cloudVolumeNoise.ts';
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
    atmosphere:{active:true},noise:{weather:{},streets:{},blue:{},local:{}}});
  let traces=0;
  const camera={};
  layer.beforeSceneRender=(renderer,view,dt,w,h)=>{
    assert.equal(renderer,layer.renderer);assert.equal(view,camera);assert.equal(dt,0);
    assert.equal(w,3840);assert.equal(h,2160);traces++;
    if(layer.rebuild<16)layer.rebuild=Math.min(16,layer.rebuild+CLOUD_REBUILD_SLOTS);
    else layer.since++;
  };
  assert.equal(layer.settleForCapture(camera),true);
  assert.equal(traces,67);assert.equal(layer.captureFramesRemaining,0);
  assert.equal(layer.settleForCapture(camera),false,'settled movie frames do no extra traces');
  layer.rebuild=0;layer.since=0;layer.frozen=true;
  assert.equal(layer.settleForCapture(camera),false,'capture respects an intentionally frozen layer');
}

// ---- the noise bakes: deterministic bytes at the shipped sizes and at small sizes, tileable, well distributed
assert.deepEqual([CLOUD_WEATHER_SIZE, CLOUD_BLUE_SIZE, CLOUD_LOCAL_SIZE, CLOUD_NOISE_SEED], [256, 32, 512, 2068], 'the shipped sizes and seed');
// 2026-10-01 (frozen pins retired): the contract is determinism (two bakes agree byte for byte), the shipped sizes, the
// seed dependence and the distribution checks below.
for (const [label, bake] of [['weather 16²', () => bakeCloudWeatherMap(16)], ['streets 16²', () => bakeCloudWeatherStreets(16)],
  ['blue 8²', () => bakeCloudBlueNoise(8)], ['local 32²', () => bakeCloudLocalWeather(32)]]) {
  assert.equal(digest(bake()), digest(bake()), `${label} bytes are deterministic`);
}
const weather = bakeCloudWeatherMap();
const streets = bakeCloudWeatherStreets();
const blue = bakeCloudBlueNoise();
const local = bakeCloudLocalWeather();
// The sheets need a complete mip chain, while the blue-noise sampling must retain its authored level-zero distribution.
{
  const layer = new VolumetricCloudLayer({}, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1));
  layer.setNoise({ weather, streets, blue, local });
  for (const field of ['weather', 'streets', 'local']) {
    assert.equal(layer.noise[field].generateMipmaps, true);
    assert.equal(layer.noise[field].minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(layer.noise[field].magFilter, THREE.LinearFilter);
  }
  assert.equal(layer.noise.blue.generateMipmaps, false);
  assert.equal(layer.noise.blue.minFilter, THREE.NearestFilter);
  assert.equal(layer.noise.blue.magFilter, THREE.NearestFilter);
  layer.dispose();
}
assert.equal(weather.length, 256 * 256 * 4);
assert.equal(streets.length, 256 * 256 * 4);
assert.equal(blue.length, 32 * 32 * 4);
assert.equal(local.length, 512 * 512 * 4);
assert.equal(digest(bakeCloudLocalWeather(32, CLOUD_NOISE_SEED)), digest(bakeCloudLocalWeather(32)), 'the default seed is the shipped seed');
assert.notEqual(digest(bakeCloudLocalWeather(32, 7)), digest(bakeCloudLocalWeather(32, 8)), 'the seed changes the field');
{
  const all = bakeCloudNoise();
  assert.deepEqual(Object.keys(all).sort(), [...CLOUD_NOISE_KINDS].sort(), 'bakeCloudNoise returns every kind the layer uploads');
  assert.deepEqual([...CLOUD_NOISE_KINDS], ['blue', 'weather', 'streets', 'local'], 'the worker posts smallest first (the volumes bake on the GPU)');
  assert.equal(digest(all.streets), digest(streets));
  assert.equal(digest(all.blue), digest(blue));
  assert.equal(digest(all.local), digest(local));
}

function channelMean(bytes, channel) {
  let sum = 0;
  for (let i = channel; i < bytes.length; i += 4) sum += bytes[i];
  return sum / (bytes.length / 4) / 255;
}
// ---- the GPU volumes (cloudVolumeNoise.ts): their sizes, a tileable lattice (every lattice index wraps before it is
// hashed, every hash integer-only) and the GLSL ES rule that the modulus of a negative int is undefined (the wrap adds
// the period before its second modulus)
assert.deepEqual([CLOUD_SHAPE_TEXELS, CLOUD_DETAIL_TEXELS, CLOUD_TURBULENCE_TEXELS], [128, 32, 128]);
assert.match(CLOUD_LATTICE_NOISE_GLSL, /ivec3 cotWrap\( ivec3 c, int n \) \{ return \( \( c % n \) \+ n \) % n; \}/, 'the lattice wraps into 0..n-1 whatever its sign');
for (const call of ['cotGrad( c, n, seed )', 'ivec3 w = cotWrap( c + o, n );']) assert.ok(CLOUD_LATTICE_NOISE_GLSL.includes(call), `the lattice is wrapped before it is hashed (${call})`);
assert.doesNotMatch(CLOUD_LATTICE_NOISE_GLSL, /fract\( sin/, 'no float-sine hash (platform-dependent): an integer hash');
// the local weather: equalised channels, tileable, the cumuliform channel's cloud fields and clearings
for (const c of [0, 1, 2, 3]) {
  const bins = new Array(16).fill(0);
  for (let i = c; i < local.length; i += 4) bins[local[i] >> 4]++;
  for (let b = 1; b < 15; b++) assert.ok(Math.abs(bins[b] / (local.length / 4) - 1 / 16) < 0.004, `local channel ${c} bin ${b}: ${(bins[b] / (local.length / 4)).toFixed(4)}`);
}
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
for (const c of [0, 1, 2, 3]) assert.ok(seamRatio2(local, 512, c) < 1.6, `local channel ${c} tiles (ratio ${seamRatio2(local, 512, c).toFixed(2)})`);
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
  titan_gorge: { regime: 'dense-overcast', coverage: 1, baseM: 450, thicknessM: 500, shadow: false, streets: 0, cirrus: 0, farBand: 0.6, contrails: 0, rain: 0.25, virga: 0.55, fogBank: 0 },
  skybridge: { regime: 'fair-weather-cumulus', coverage: 0.42, baseM: 700, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.5, contrails: 0, rain: 0.2, virga: 0.5, fogBank: 0 },
  polders: { regime: 'broken-stratocumulus', coverage: 0.68, baseM: 600, thicknessM: 500, shadow: true, streets: 0.4, cirrus: 0.1, farBand: 0.5, contrails: 3, rain: 0.2, virga: 0.2, fogBank: 0.35 },
  copper_mesa: { regime: 'cumulus-humilis', coverage: 0.2, baseM: 1900, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.4, farBand: 0.15, contrails: 0, rain: 0.3, virga: 0.85, fogBank: 0 },
  airfield: { regime: 'fair-weather-cumulus', coverage: 0.38, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.35, cirrus: 0.12, farBand: 0.25, contrails: 6, rain: 0, virga: 0, fogBank: 0 },
  oasis: { regime: 'cumulus-humilis', coverage: 0.17, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.4, farBand: 0.15, contrails: 0, rain: 0.3, virga: 0.85, fogBank: 0 },
  // (2026-10-07, the clouds lane after wave 222: the deck "too high for low Arctic stratus" — its base at 180 m)
  whiteout: { regime: 'low-stratus', coverage: 1, baseM: 180, thicknessM: 300, shadow: false, streets: 0, cirrus: 0, farBand: 0.5, contrails: 0, rain: 0, virga: 0, fogBank: 0 },
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
  assert.ok(whiteout.stratiform >= CLOUD_LAYER_RULES.sheetStratiform && whiteout.baseM === 180 && whiteout.fieldMix >= 0.8 && whiteout.scud === 0, 'whiteout: a closed ceiling, no rags at the camera');
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
  assert.deepEqual([titan.lumps, titan.cells, titan.deckLight], [0.7, 0.7, 1], 'titan: base lumps on its cellular deck');
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
// the quality tiers: the low tiers march fewer, coarser steps over a shorter reach with fewer octaves; the mobile tier
// never creates the layer (the baked decks)
{
  const order = ['low', 'medium', 'high', 'ultra'];
  assert.deepEqual(Object.keys(CLOUD_TIERS), order);
  for (let i = 1; i < order.length; i++) {
    const a = CLOUD_TIERS[order[i - 1]], b = CLOUD_TIERS[order[i]];
    assert.ok(b.steps >= a.steps && b.octaves >= a.octaves && b.sunSteps >= a.sunSteps, `${order[i]} marches at least as finely as ${order[i - 1]}`);
    assert.ok(b.stepMin <= a.stepMin && b.growth <= a.growth && b.marchMax >= a.marchMax && b.detailRange >= a.detailRange, `${order[i]} strides no coarser`);
  }
  for (const t of Object.values(CLOUD_TIERS)) assert.ok(t.octaves === 4 || t.octaves === 8, 'four or eight octaves (two vec4s)');
  assert.ok(CLOUD_TIERS.high.marchMax >= 30000, 'the high tier marches the curved shells far enough to meet the haze');
}
// the local weather's cumuliform channel at a 30 % cover: cloud fields and clearings, not an even pepper
{
  const N = 512, B = 8;
  let empty = 0, full = 0, blocks = 0;
  for (let by = 0; by < N; by += B) for (let bx = 0; bx < N; bx += B) {
    let on = 0;
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) if (local[(y * N + x) * 4] >= 255 * 0.7) on++;
    blocks++; if (on === 0) empty++; if (on === B * B) full++;
  }
  assert.ok(empty / blocks > 0.25, `clearings: ${(100 * empty / blocks).toFixed(0)} % of the 750 m blocks admit nothing`);
  assert.ok(full / blocks > 0.02, `masses: ${(100 * full / blocks).toFixed(1)} % of the 750 m blocks are admitted whole`);
}

// ---- the haze law mirrors the aerial pass, the hook and the gates are in place
const postSource = here('./post.ts');
const skySource = here('./sky.ts');
const mainSource = here('../main.ts');
const layerSource = here('./volumetricClouds.ts');
const shadersSource = here('./cloudShaders.ts');
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
  const trace = shadersSource.slice(shadersSource.indexOf('export function cloud2TraceFragment'), shadersSource.indexOf('export const CLOUD2_RESOLVE_FRAGMENT'));
  const sky = layerSource.slice(layerSource.indexOf('const CLOUD_SKY_WEATHER_GLSL'), layerSource.indexOf('const COPY_FRAGMENT'));
  for (const u of ['tSceneDepth', 'uSceneDepthOn', 'uSceneNearFar', 'uDepthRight', 'uDepthUp', 'uDepthFwd', 'uDepthTan']) {
    assert.match(trace, new RegExp(`uniform [a-zA-Z0-9]+ ${u};`), `${u} is declared`);
    assert.match(layerSource, new RegExp(`${u}: \\{ value: `), `${u} has a uniform object`);
  }
  assert.ok(trace.indexOf('float cloudSceneT( vec3 dir )') < trace.indexOf('${weatherGlsl}'), 'the helper stands ahead of the layers');
  assert.match(trace, /if \( uSceneDepthOn < 0\.5 \) return 1e9;/, 'off: no limit');
  assert.match(trace, /if \( depth >= 0\.999999 \) return 1e9;/, 'the sky (cleared depth): no limit');
  assert.match(trace, /float sceneT = cloudSceneT\( dir \);\s*float tMax = min\( uMarchMax, sceneT \);/, 'the medium ends at the surface');
  assert.match(trace, /vec2 b = cl2Band\( uCamPos, dir, lo, uLayerTop\[ i \] \);\s*b\.y = min\( b\.y, tMax \);/, 'every lane\'s run ends there');
  // the runs: a sorting network on the starts, then the overlaps merged — a twin of the GLSL over random runs
  {
    const net = /cl2Order\( r0, r1 \); cl2Order\( r2, r3 \); cl2Order\( r0, r2 \); cl2Order\( r1, r3 \); cl2Order\( r1, r2 \);/;
    assert.match(trace, net, 'the five compare-swaps');
    assert.match(trace, /for \( int m = 0; m < 3; m\+\+ \) \{\s*if \( r1\.x <= r0\.y \) \{ r0\.y = max\( r0\.y, r1\.y \); r1 = r2; r2 = r3; r3 = vec2\( 1e9 \); \}\s*else if \( r2\.x <= r1\.y \) \{ r1\.y = max\( r1\.y, r2\.y \); r2 = r3; r3 = vec2\( 1e9 \); \}\s*else if \( r3\.x <= r2\.y \) \{ r2\.y = max\( r2\.y, r3\.y \); r3 = vec2\( 1e9 \); \}\s*\}/, 'three merge passes');
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let n = 0; n < 4000; n++) {
      const r = [0, 1, 2, 3].map(() => {
        if (rnd() < 0.3) return [1e9, 1e9];
        const a = rnd() * 30000;
        return [a, Math.min(a + 50 + rnd() * 8000, 36000)];
      });
      const want = r.filter((x) => x[0] < 1e9);
      const order = (i, j) => { if (r[j][0] < r[i][0]) { const c = r[i]; r[i] = r[j]; r[j] = c; } };
      order(0, 1); order(2, 3); order(0, 2); order(1, 3); order(1, 2);
      for (let m = 0; m < 3; m++) {
        if (r[1][0] <= r[0][1]) { r[0] = [r[0][0], Math.max(r[0][1], r[1][1])]; r[1] = r[2]; r[2] = r[3]; r[3] = [1e9, 1e9]; }
        else if (r[2][0] <= r[1][1]) { r[1] = [r[1][0], Math.max(r[1][1], r[2][1])]; r[2] = r[3]; r[3] = [1e9, 1e9]; }
        else if (r[3][0] <= r[2][1]) { r[2] = [r[2][0], Math.max(r[2][1], r[3][1])]; r[3] = [1e9, 1e9]; }
      }
      const got = r.filter((x) => x[0] < 1e9);
      for (let i = 1; i < got.length; i++) assert.ok(got[i][0] > got[i - 1][1], 'disjoint, in order along the ray');
      // the union is unchanged: every input run inside one output run, every output run's ends an input run's
      for (const x of want) assert.ok(got.some((g) => g[0] <= x[0] && x[1] <= g[1]), 'every lane\'s run is marched');
      for (const g of got) assert.ok(want.some((x) => x[0] === g[0]) && want.some((x) => x[1] === g[1]), 'and nothing past them');
    }
  }
  assert.match(sky, /float tB = min\( min\( tTop, \$\{f\(CLOUD_FOGBANK_RANGE_M\[1\]\)\} \), sceneT \);/, 'the sea fog bank ends at the surface');
  assert.match(sky, /tEnd = min\( min\( tEnd, \$\{f\(CLOUD_RAIN_RANGE_M\[1\]\)\} \), sceneT \);/, 'the rain ends at the surface');
  assert.match(sky, /if \( tc <= 0\.0 \|\| tc >= sceneT \) return none;/, 'the cirrus behind a surface is hidden');
  // the JS: the previous camera's frame, off for a camera in or over the lowest lane, until the scene has drawn, after a resize
  assert.match(layerSource, /const depthOn = !!depthTex && this\.sceneDepthReady && this\.hasPrev && C\.pos\.y <= low;/);
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
  assert.match(trace, /return t < uDomeRadius \? 1e9 : t;/, 'a surface inside the dome: the whole sky traced');
  assert.match(layerSource, /uDomeRadius: \{ value: CLOUD_DOME_RADIUS_M \}/);
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
assert.ok(layerSource.includes('cloud2TraceFragment(defs, ATMOSPHERE_SKY_GLSL, weather)') && layerSource.includes('atmoSkyVisible( skyDir )'), 'the trace hazes toward the sky-view LUT');
for (const gone of ['markShadowOnly', 'setShadowCasterCascades', 'customDepthMaterial', 'GOBO_FRAGMENT', 'uShadowCellOrigin', 'bindCloudShadowCascade']) {
  assert.ok(!layerSource.includes(gone), `no shadow-map gobo left (${gone})`);
}
// ---- Clouds 2.0: the Beer shadow map's cascades — toroidal and world-anchored: a texel holds world cell c mod N, the
// window's corner the camera's cell less half the map, the lookup fract(xz / side) the same texel as the march wrote
{
  assert.equal(CLOUD_BSM_CASCADES.length, 2, 'a near cascade (the ground, the battlefield\'s clouds) and a far one');
  assert.ok(CLOUD_BSM_CASCADES[0].span / CLOUD_BSM_CASCADES[0].texels <= 25, 'the near cascade a ground-shadow texel (<= 25 m)');
  assert.ok(CLOUD_BSM_CASCADES[1].span >= CLOUD_TIERS.medium.marchMax, 'the far cascade lights the march out to the medium tier\'s reach');
  for (const c of CLOUD_BSM_CASCADES) assert.equal(c.texels % c.bands, 0, 'whole bands');
  assert.ok(CLOUD_BSM_SLICES >= 24 && CLOUD_BSM_SLICES <= 96, 'the map\'s slices within its loop');
  // the twin of the march's addressing and the lookup's
  const mod = (a, n) => a - n * Math.floor(a / n);
  for (const [N, texel, camX] of [[512, 12000 / 512, 3.7], [512, 12000 / 512, -18000.2], [256, 64000 / 256, 51234]]) {
    const w0 = Math.floor(camX / texel) - N / 2;
    const seen = new Set();
    for (let i = 0; i < N; i++) {
      const cell = w0 + mod(i - w0, N);
      assert.ok(cell >= w0 && cell < w0 + N, 'every texel holds a cell of the window');
      seen.add(cell);
      const x = (cell + 0.5) * texel;
      assert.equal(Math.floor(mod(x / (N * texel), 1) * N), i, 'the lookup reads the texel the march wrote');
    }
    assert.equal(seen.size, N, 'the window\'s cells each once');
  }
  const bsm = shadersSource.slice(shadersSource.indexOf('export const CLOUD2_BSM_FRAGMENT'), shadersSource.indexOf('export const CLOUD2_SHADE_FRAGMENT'));
  assert.match(bsm, /ivec2 cell = uWinCell \+ ivec2\( mod\( vec2\( ij - uWinCell \), float\( uTexels \) \) \);/, 'the march\'s cell by the float mod (a negative int % is undefined in GLSL ES)');
  assert.ok(!/%/.test(bsm.replace(/\/\/.*$/gm, '')), 'no int modulus in the map\'s march');
  // the lookup: the four texels around the point (wrapped by the window's side), each its own optical depth, blended as
  // transmittances from the least of them — the twin: a texel's centre reads that texel alone, a uniform interior is
  // exact, a lit flank beside a column through the top stays lit (the front depth's own bilinear mean put it deep inside)
  assert.match(shadersSource, /vec2 st = fract\( xz \/ win\.z \) \* n - 0\.5;/, 'the lookup wraps by the window\'s side');
  assert.match(shadersSource, /return m - log\( max\( dot\( w, exp\( m - od \) \), 1e-6 \) \);/, 'blended as transmittances');
  assert.match(shadersSource, /return min\( s\.b \+ s\.a, s\.g \* max\( 0\.0, toTop - offset - s\.r \) \);/, 'a texel\'s depth: the front\'s run capped by the column');
  {
    const texelOd = (s, toTop, offset) => Math.min(s[2] + s[3], s[1] * Math.max(0, toTop - offset - s[0]));
    const read = (map, n, side, x, z, toTop, offset) => {
      const sx = mod(x / side, 1) * n - 0.5, sz = mod(z / side, 1) * n - 0.5;
      const ix = Math.floor(sx), iz = Math.floor(sz), fx = sx - ix, fz = sz - iz;
      const at = (i, j) => texelOd(map(mod(i, n), mod(j, n)), toTop, offset);
      const od = [at(ix, iz), at(ix + 1, iz), at(ix, iz + 1), at(ix + 1, iz + 1)];
      const w = [(1 - fx) * (1 - fz), fx * (1 - fz), (1 - fx) * fz, fx * fz];
      const m = Math.min(...od);
      return m - Math.log(Math.max(od.reduce((a, o, k) => a + w[k] * Math.exp(m - o), 0), 1e-6));
    };
    const n = 64, side = 64 * 78;
    // a uniform deck: every texel the same column — the depth exact wherever the point falls
    const deck = () => [100, 0.04, 30, 2];
    for (const x of [7.1, 1234.5, -999.9]) assert.ok(Math.abs(read(deck, n, side, x, 300, 900, 0) - Math.min(32, 0.04 * 800)) < 1e-9, 'a uniform column exact');
    // a tower's flank: the texels left of column 20 meet the tower through its side, 3 km down their rays (under the
    // point), the rest through its top 50 m down; a point on the flank between the two (2.42 km down its ray) is lit,
    // where the front depth's own bilinear mean (1.5 km) put it 900 m inside the tower
    const tower = (i) => (i < 20 ? [3000, 0.05, 200, 5] : [50, 0.05, 200, 5]);
    const flankX = 20 * (side / n);
    const odFlank = read((i) => tower(i), n, side, flankX, (5 + 0.5) * (side / n), 2500, 80);
    assert.ok(odFlank < 1.5, `a lit flank stays lit (${odFlank.toFixed(2)})`);
    const meanFrontOd = texelOd([0.5 * 3000 + 0.5 * 50, 0.05, 200, 5], 2500, 80);
    assert.ok(meanFrontOd > 40, `the front depth's mean darkened it (${meanFrontOd.toFixed(1)})`);
    // a texel's centre reads that texel alone
    const cx = (33 + 0.5) * (side / n);
    assert.ok(Math.abs(read((i) => tower(i), n, side, cx, (5 + 0.5) * (side / n), 2500, 80) - texelOd(tower(33), 2500, 80)) < 1e-9, 'a texel\'s centre reads that texel');
  }
  // the shade the lit materials read: the near cascade's column depth as a continuous share, the column's own beam in g
  assert.match(shadersSource, /share = uShadeLaw\.x \* \( 1\.0 - exp\( -od \/ max\( uShadeLaw\.y, 1e-3 \) \) \);\s*beam = exp\( -od \);/);
  assert.match(layerSource, /this\.scene\.userData\.cloudSunMean = this\.sunMean;/, 'the sun mean published for the light model (the skies lane\'s hook)');
}
// ---- the parabolic shells: the twin of the trace's band (cl2Band) — a ray under the band rises through its base and
// leaves through its top, a ray inside leaves through either face, a ray over it dips in through its top
{
  const R = CLOUD2_EARTH_R;
  const height = (p) => p[1] + (p[0] * p[0] + p[2] * p[2]) / (2 * R);
  const roots = (o, d, H) => {
    const a = (d[0] * d[0] + d[2] * d[2]) * (0.5 / R), b = d[1] + (o[0] * d[0] + o[2] * d[2]) / R, c = height(o) - H;
    if (a < 1e-12) { if (Math.abs(b) < 1e-9) return null; const t = -c / b; return [t, t]; }
    const disc = b * b - 4 * a * c; if (disc < 0) return null;
    const sq = Math.sqrt(disc), q = -0.5 * (b + (b >= 0 ? sq : -sq)), r0 = q / a, r1 = c / q;
    return [Math.min(r0, r1), Math.max(r0, r1)];
  };
  const band = (o, d, lo, hi) => {
    const h0 = height(o), L = roots(o, d, lo), H = roots(o, d, hi);
    if (h0 < lo) { if (!L || L[1] <= 0) return null; return [L[1], H && H[1] > L[1] ? H[1] : 1e9]; }
    if (h0 <= hi) return [0, Math.min(H && H[1] > 0 ? H[1] : 1e9, L && L[0] > 0 ? L[0] : 1e9)];
    if (!H || H[0] <= 0) return null;
    return [H[0], L && L[0] > H[0] ? L[0] : H[1]];
  };
  const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  {
    const o = [120, 30, -80], d = unit([Math.cos(0.17), Math.tan(0.17), 0.3]);
    const [t0, t1] = band(o, d, 1400, 2300);
    assert.ok(Math.abs(height(along(o, d, t0)) - 1400) < 0.5 && Math.abs(height(along(o, d, t1)) - 2300) < 0.5, 'base then top');
  }
  {
    const [t0] = band([0, 2, 0], [1, 0, 0], 1400, 2300);
    assert.ok(t0 > 120000 && t0 < 150000, `the horizon ray reaches the base at ${(t0 / 1000).toFixed(0)} km (the Earth drops away)`);
  }
  {
    const d1 = unit([1, -0.3, 0]), inside = band([0, 1800, 0], d1, 1400, 2300);
    assert.ok(inside[0] === 0 && Math.abs(height(along([0, 1800, 0], d1, inside[1])) - 1400) < 0.5, 'inside: out through the base');
    const d2 = unit([1, -0.4, 0.2]), over = band([0, 3000, 0], d2, 1400, 2300);
    assert.ok(Math.abs(height(along([0, 3000, 0], d2, over[0])) - 2300) < 0.5 && Math.abs(height(along([0, 3000, 0], d2, over[1])) - 1400) < 0.5, 'over: in at the top, out at the base');
    // (the parabola turns up again thousands of kilometres out, where a sphere's ray would have met the ground: far past
    // any march, so a downward ray from under the band draws nothing)
    const down = band([0, 30, 0], unit([1, -0.2, 0]), 1400, 2300);
    assert.ok(!down || down[0] > CLOUD_TIERS.ultra.marchMax * 10, 'a ray at the ground looking down meets no cloud within reach');
  }
  assert.match(shadersSource, /float cl2Height\( vec3 p \) \{ return p\.y \+ dot\( p\.xz, p\.xz \) \* \( 0\.5 \/ CL2_EARTH_R \); \}/, 'the GLSL\'s height is the twin\'s');
  assert.ok(CLOUD2_PERIODS.shape >= 2 * 1400, 'the shape volume\'s period spans several clouds (no stamped billows)');
}
assert.match(layerSource, /blendSrc: THREE\.OneFactor, blendDst: THREE\.OneMinusSrcAlphaFactor/, 'premultiplied composite over the dome');
assert.match(shadersSource, /uniform sampler3D tShape;\s*uniform sampler3D tDetail;/, 'the volumes are 3D textures');
for (const term of ['phaseDual( cosT, 0.0625 )', 'exp( -od * vec4( 1.0, 0.5, 0.25, 0.125 ) )', 'uPhase.w * powderFade * exp( -sigma * uPowderExp )', 'texelFetch( tBlue', 'cl2BsmDepth( p, run )',
  'cl2Band( uCamPos, dir, lo, uLayerTop[ i ] )', 'uLayerAnvil', 'cl2SunTransmittance( cl2Height( uCamPos + dir * ( 0.5 * ( r0.x + r0.y ) ) ) )', 'L += T * ( S - S * Tstep ) / sigma;',
  'if ( lit == 0 || ( ( lit & 1 ) == 0 && T > 0.15 ) )']) {
  assert.ok(shadersSource.includes(term), `the trace carries ${term}`);
}
for (const term of ['uCirrus', 'halo', 'seaFogBank(', 'slabRain(', 'contrailDepth(']) assert.ok(layerSource.includes(term), `the sky beyond the medium carries ${term}`);
// 2026-10-07 (overcast with structure): a deck's base lit by its own cell's column — the diffusion and the sky through it
// take the vertical depth over the point in its cell (by the lane's flatness), the ground's return at a deck's base is the
// light the deck passes down (cloudGroundLight), not the map's ambient scale over the open sky's blue irradiance
for (const term of ['vec2 cell = cl2Cell( p.xz, wLod );\n\t\t\tvec4 shell = cl2Shell( h, w, cell, hf );',
  'float tauV = od * max( sunUp, 0.2 );', 'float deckK = dot( wgt, uLayerFlat ) * uDeckTune.x;', 'tauV = mix( tauV, tauUp, deckK );',
  'radiance += eTop * ( diffuse * ( 1.0 - exp( -od * 0.3 ) ) / ( 1.0 + 0.1125 * tauV ) / CL_PI );', 'float skyThrough = 1.0 / ( 1.0 + 0.1125 * tauV );',
  'mix( uAmbientScale, 1.0, flatK * uDeckTune.y )']) {
  assert.ok(shadersSource.includes(term), `the trace carries ${term}`);
}
// the cell's column the trace reads is cl2Shell's own (the same k, the same top)
assert.ok(shadersSource.includes('vec4 k = mix( vec4( 1.0 ), vec4( cell.x ) * mix( vec4( 1.0 ), vec4( 0.55 + 0.45 * cell.y ), uLayerLumps ), uLayerCells );')
  && shadersSource.includes('vec4 kc = mix( vec4( 1.0 ), vec4( cell.x ) * mix( vec4( 1.0 ), vec4( 0.55 + 0.45 * cell.y ), uLayerLumps ), uLayerCells );')
  && shadersSource.includes('vec4 top = uLayerBase + thick * ( 0.1 + 0.9 * k );')
  && shadersSource.includes('vec4 topC = uLayerBase + ( uLayerTop - uLayerBase ) * ( 0.1 + 0.9 * kc );'), 'the trace\'s cell column is the shell\'s');
assert.match(layerSource, /const reach = cloudGroundLight\(open, this\.deckTau, /, 'the ground under the clouds takes the light the cover passes');
assert.match(layerSource, /lightTune\('CLOUD_DECK_GROUND', 1\)\)\) \* this\.deckClosing;/, 'only under a closing deck (a broken deck keeps its grey bases)');
// round 5 (2026-10-07): a closing deck's base takes its ground return as a multiple by the lane's flatness (a broken deck,
// flat to half, keeps its grey base); round 5's mottle dropped (no dead cost: it barely showed on the GPU)
assert.ok(shadersSource.includes('* mix( 1.0, uDeckTune.z, smoothstep( 0.6, 1.0, flatK ) );'), 'the trace carries the closing deck\'s ground return');
assert.ok(!/cl2Noise|mottle \*/.test(shadersSource), 'no mottle term left in the medium or the trace');
// 2026-10-06 (the first GPU pair: the v2 page's atmosphere fell to its Preetham fallback on the hardware): the sun mean's
// readback holds no pack buffer across a task — three's readRenderTargetPixelsAsync keeps its buffer bound over its
// await, and any other read in that window (the atmosphere's summary) fails
assert.ok(!/\.readRenderTargetPixelsAsync\(/.test(layerSource), 'no three async readback (its pack buffer outlives the call)');
assert.match(layerSource, /read = beginRgba8Readback\(gl, CLOUD_SUN_MEAN_TEXELS, CLOUD_SUN_MEAN_TEXELS, pixels\); \} finally \{ renderer\.setRenderTarget\(prev\); \}/, 'the house readback, the target restored at once');
assert.ok(layerSource.includes('name: `VolumetricCloudTrace-${tier}`') && layerSource.includes("name: 'VolumetricCloudResolve'") && layerSource.includes("name: 'VolumetricCloudDome'")
  && layerSource.includes("name: 'VolumetricCloudBeerShadow'") && layerSource.includes("name: 'VolumetricCloudShade'"));
console.log('volumetricClouds.selftest: deterministic weather (four bakes), tiling, equalisation and street anisotropy, the GPU volumes\' lattice, the 31-map cloudscape table, the regime rows, the shadow policy, the slot cycle, the tiers, the Beer shadow map\'s addressing, the shells\' band, the haze mirror and the hooks pinned');

// 2026-10-04 (the gauntlet's wave 62 on Titan Gorge: the sun "a flat, hard-edged white disc pasted on a featureless
// grey-white sky"): a ray the march ends under the 0.03 cut is opaque, its in-scatter renormalised for the remainder —
// the 3 % the cut left let the sun's disc (tens of thousands of times the sky) burn through a closed deck or a core.
assert.match(shadersSource, /if \( T < 0\.02 \) break;[\s\S]*?if \( T < 0\.03 && uOpaqueCut > 0\.0 \) \{ L \/= max\( 1\.0 - T, 0\.5 \); T = 0\.0; \}\s*if \( wAcc > 1e-4 \) \{/,
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
assert.match(shadersSource, /float lobe = 1\.0 \+ uDeckLobe \* \( mix\( phaseHG\( cosT, 0\.6 \), phaseHG\( cosT, -0\.225 \), 0\.3 \) \* 4\.0 \* CL_PI - 1\.0 \);\s*vec3 eTop = sunE \* sunUp \* lobe \+ uSkyIrradiance \* CL_PI;/,
  'the lobe on the sun\'s diffused share only, the sky\'s untouched');
// (round 6, wave 222: an overcast with no brighter patch toward the sun — the lobe at 0.45)
assert.match(layerSource, /export const CLOUD_DECK_SUN_LOBE = 0\.45;/);
assert.match(layerSource, /t\.uDeckLobe\.value = lightTune\('CLOUD_DECK_SUN_LOBE', CLOUD_DECK_SUN_LOBE\);/);
{
  // the lobe's mean over the sphere is 1 (phaseDual integrates to one): the deck's mean light is unchanged
  const hg = (c, g) => (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * c, 1.5));
  // the deck lobe's dual Henyey–Greenstein (g 0.6 over a back lobe of −0.225, 70 / 30)
  const dual = (c, g) => hg(c, g) * 0.7 + hg(c, -0.375 * g) * 0.3;
  let mean = 0, least = Infinity; const n = 20000;
  for (let i = 0; i < n; i++) {
    const c = -1 + 2 * (i + 0.5) / n, lobe = 1 + CLOUD_DECK_SUN_LOBE * (dual(c, 0.6) * 4 * Math.PI - 1);
    mean += lobe / n; least = Math.min(least, lobe);
  }
  assert.ok(Math.abs(mean - 1) < 1e-3, `the lobe's mean over the sky ${mean.toFixed(4)}`);
  assert.ok(least > 0.5, `away from the sun the deck keeps most of its light (${least.toFixed(3)})`);
  assert.ok(1 + CLOUD_DECK_SUN_LOBE * (dual(1, 0.6) * 4 * Math.PI - 1) > 2, 'toward the sun the diffused sun more than doubles');
}
console.log('volumetricClouds.selftest: the cut ray opaque (no disc through a closed deck), the forward lobe of a deck PASS');
