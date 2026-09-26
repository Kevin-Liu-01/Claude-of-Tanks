// Round 68 (2026-09-24): the volumetric cloud layer, pinned without a GPU. The noise bakes (cloudNoise.ts) are
// deterministic — their bytes are digested here at the shipped sizes and at small sizes — and tile; the weather's
// coverage fields are equalised so a map's coverage admits exactly that fraction of the field; every map's derived
// layer (cloudPresets.ts over its authored sky block) is pinned as the identity table of the round, with the
// shadow policy (cumulus regimes under a day sun only); the 4 × 4 Bayer slot cycle covers every cell once; the
// trace shader's haze law mirrors the aerial pass's constants in post.ts; the hook in post.ts, the `?clouds=off`
// gate in sky.ts and the cascade attach in main.ts are present exactly once.
// Round 71 (2026-09-25): the cloudscape pass — the multi-scale weather (a vigour channel), the street / anvil /
// cirrus companion field in the wind frame, the curl volume and the blue-noise tile; every map's `clouds` block
// resolves through its regime row (cloudscapes.ts) into the pinned 31-map cloudscape table; the layer stays opt-in.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CLOUD_BLUE_SIZE, CLOUD_CURL_SIZE, CLOUD_DETAIL_SIZE, CLOUD_NOISE_SEED, CLOUD_SHAPE_SIZE, CLOUD_WEATHER_SIZE,
  bakeCloudBlueNoise, bakeCloudCurlVolume, bakeCloudDetailVolume, bakeCloudNoise, bakeCloudShapeVolume, bakeCloudWeatherMap, bakeCloudWeatherStreets,
} from './cloudNoise.ts';
import { CLOUD_LAYER_RULES, cloudLayerKey, deriveCloudLayerPreset } from './cloudPresets.ts';
import { CLOUDSCAPE_REGIMES, CLOUDSCAPE_REGIME_NAMES, isCloudscapeRegime } from './cloudscapes.ts';
import {
  CLOUD_AERIAL, CLOUD_BAYER_4, CLOUD_HISTORY_SCALE, CLOUD_NOISE_KINDS, CLOUD_REBUILD_SLOTS, CLOUD_SLOT_ORDER, CLOUD_STEP_SCALE_BY_PRESET, CLOUD_TRACE_DIVISOR,
} from './volumetricClouds.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// ---- the noise bakes: deterministic bytes at the shipped sizes and at small sizes, tileable, well distributed
assert.deepEqual([CLOUD_SHAPE_SIZE, CLOUD_DETAIL_SIZE, CLOUD_WEATHER_SIZE, CLOUD_CURL_SIZE, CLOUD_BLUE_SIZE, CLOUD_NOISE_SEED], [64, 32, 256, 32, 32, 2068], 'the shipped sizes and seed');
assert.equal(digest(bakeCloudShapeVolume(8)), '1f3ecfdabf968b313ef1bbf4583ed7d0cd8e716204434c14226ad0e63fdeec76', 'shape 8³ bytes');
assert.equal(digest(bakeCloudDetailVolume(8)), 'f09eaa66c1e1f8261d2f6c5068ce8d6e648d8ca1a8fbd1f7f897acd72f82bfba', 'detail 8³ bytes');
assert.equal(digest(bakeCloudWeatherMap(16)), 'ea7dcf6a8712ccabbbed3e558c0db6e8bf93a6efe08b881f215a364a359a93d5', 'weather 16² bytes (round 71c: plateau cells)');
assert.equal(digest(bakeCloudWeatherStreets(16)), '763105085bfafcb2d003e71fbfcbdd8cf82a6b970a6a7875ecda97a64f841cac', 'streets 16² bytes (round 71c: chains of lumps on the rolls)');
assert.equal(digest(bakeCloudCurlVolume(8)), 'f8b276f0ddf5aa7cad6242419cc0d32e5e5026e9a0d09eb045a51dabc62b882f', 'curl 8³ bytes (round 71)');
assert.equal(digest(bakeCloudBlueNoise(8)), 'a9c6e9a2f163c54d3016ed87a083691079639edec3e9385ad3fb8f74be5481a3', 'blue 8² bytes (round 71)');
const shape = bakeCloudShapeVolume();
const detail = bakeCloudDetailVolume();
const weather = bakeCloudWeatherMap();
const streets = bakeCloudWeatherStreets();
const curl = bakeCloudCurlVolume();
const blue = bakeCloudBlueNoise();
assert.equal(shape.length, 64 * 64 * 64 * 4);
assert.equal(detail.length, 32 * 32 * 32 * 4);
assert.equal(weather.length, 256 * 256 * 4);
assert.equal(streets.length, 256 * 256 * 4);
assert.equal(curl.length, 32 * 32 * 32 * 4);
assert.equal(blue.length, 32 * 32 * 4);
assert.equal(digest(shape), 'ed892103446410c7b4a52d45b06f9bbcf3d812774eb6f94233c0063edc46ce49', 'shape 64³ bytes (2026-09-24, unchanged by round 71)');
assert.equal(digest(detail), 'e215d7c534e2946014ce0e1cffdf4a3459951b06bbd134049fc98347622804a8', 'detail 32³ bytes (2026-09-24, unchanged by round 71)');
assert.equal(digest(weather), '6bdc423ff4a553d7d32b716e86d6602e8955152454d672b26989f31188ba9861', 'weather 256² bytes (2026-09-25, 71c: plateau cells of 540–960 m soft-unioned into masses, the vigour channel, the stratiform field)');
assert.equal(digest(streets), '5ccabc1ff96d8c5d92aa734cad44d2a070c221cbf72d1eb4f4c3bedd0b96ba29', 'streets 256² bytes (2026-09-25, 71c: chains of rounded lumps on rolls of varying width, the anvil field, cirrus streaks and fibres)');
assert.equal(digest(curl), '2e0be330c6f0e076e5e237ad40721bb2f312c2d5be5f5413dc4d57d7578c763c', 'curl 32³ bytes (2026-09-25)');
assert.equal(digest(blue), '5aba12bc64a97cb08a62c3106374d2a9f451d31580767d2fc97e0e3fd13907cc', 'blue 32² bytes (2026-09-25, void-and-cluster)');
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
  if (id !== 'mars') assert.ok(config.clouds && isCloudscapeRegime(config.clouds.regime), `${id} authors a cloudscape regime`);
  else assert.ok(!config.clouds && MARS_SKY_PRESET.cloudscape?.regime === 'thin-ice-clouds', 'Mars carries its cloudscape on the shared preset (the ruleset applies it directly)');
  const p = deriveCloudLayerPreset(skyOf(id));
  table[id] = { regime: p.regime, coverage: +p.coverage.toFixed(3), baseM: p.baseM, thicknessM: Math.round(p.thicknessM), shadow: p.shadow, streets: p.streets, cirrus: p.cirrus, farBand: p.farBand };
  assert.ok(p.coverage >= 0 && p.coverage <= CLOUD_LAYER_RULES.coverageMax);
  assert.ok(p.baseM > 0 && p.thicknessM > 0 && p.density > 0);
  assert.ok(p.shadowThreshold >= 0 && p.shadowThreshold <= 1);
  assert.equal(+p.shadowThreshold.toFixed(3), +Math.min(1, 1 - p.coverage + CLOUD_LAYER_RULES.shadowCoreBand).toFixed(3), `${id}: the shadow footprint is the cloud's dense core`);
  assert.ok(p.tint.every((c) => c > 0 && c <= 1), `${id} tint in (0, 1]`);
  assert.ok(p.typeRange[0] <= p.typeRange[1] && p.typeRange[0] >= 0 && p.typeRange[1] <= 1, `${id} type range`);
  assert.ok(p.cirrusAltM > p.baseM + p.thicknessM, `${id}: the cirrus sheet sits above the slab`);
  assert.ok(p.farBandAltM <= CLOUD_LAYER_RULES.farBandMaxAltM && p.farBandAltM > 0);
  if (p.stratiform >= CLOUD_LAYER_RULES.sheetStratiform) assert.equal(p.shadow, false, `${id}: a diffuse-lit sheet casts no crisp cloud shadow`);
  if (p.shearM > 0) assert.ok(p.shearM <= p.thicknessM * 2, `${id}: the lean is bounded by the slab`);
}
assert.deepEqual(table, {
  verdant: { regime: 'fair-weather-cumulus', coverage: 0.36, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.45, cirrus: 0.12, farBand: 0.25 },
  desert: { regime: 'cumulus-humilis', coverage: 0.14, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.5, farBand: 0.15 },
  winter: { regime: 'stratocumulus-deck', coverage: 0.86, baseM: 700, thicknessM: 420, shadow: false, streets: 0.2, cirrus: 0, farBand: 0.6 },
  urban: { regime: 'hazy-altostratus', coverage: 0.45, baseM: 2800, thicknessM: 500, shadow: false, streets: 0.1, cirrus: 0.35, farBand: 0.35 },
  coastal: { regime: 'sea-streets', coverage: 0.32, baseM: 1100, thicknessM: 600, shadow: true, streets: 0.75, cirrus: 0.08, farBand: 0.65 },
  autumn: { regime: 'fair-weather-cumulus', coverage: 0.26, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.25 },
  steppe: { regime: 'cloud-streets', coverage: 0.34, baseM: 1400, thicknessM: 660, shadow: true, streets: 0.9, cirrus: 0.2, farBand: 0.35 },
  railyard: { regime: 'hazy-altostratus', coverage: 0.78, baseM: 2200, thicknessM: 500, shadow: false, streets: 0.1, cirrus: 0.3, farBand: 0.35 },
  frontier: { regime: 'cloud-streets', coverage: 0.4, baseM: 1400, thicknessM: 660, shadow: true, streets: 0.85, cirrus: 0.15, farBand: 0.35 },
  fjord: { regime: 'broken-stratocumulus', coverage: 0.62, baseM: 900, thicknessM: 500, shadow: true, streets: 0.3, cirrus: 0.1, farBand: 0.6 },
  delta: { regime: 'towering-cumulus', coverage: 0.38, baseM: 1200, thicknessM: 1500, shadow: true, streets: 0.15, cirrus: 0.1, farBand: 0.3 },
  badlands: { regime: 'cumulus-humilis', coverage: 0.18, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.35, farBand: 0.15 },
  monsoon: { regime: 'cumulonimbus-front', coverage: 0.4, baseM: 1000, thicknessM: 3000, shadow: true, streets: 0.1, cirrus: 0.25, farBand: 0.4 },
  alpine: { regime: 'towering-cumulus', coverage: 0.26, baseM: 1900, thicknessM: 900, shadow: true, streets: 0, cirrus: 0.3, farBand: 0.5 },
  caldera: { regime: 'cumulus-humilis', coverage: 0.22, baseM: 1500, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.45, farBand: 0.15 },
  foundry: { regime: 'hazy-altostratus', coverage: 0.72, baseM: 2600, thicknessM: 500, shadow: false, streets: 0.1, cirrus: 0.3, farBand: 0.35 },
  ruinspires: { regime: 'fair-weather-cumulus', coverage: 0.42, baseM: 1100, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.25 },
  blackglass: { regime: 'ash-veil', coverage: 0.55, baseM: 800, thicknessM: 450, shadow: false, streets: 0.2, cirrus: 0.5, farBand: 0.4 },
  titan_gorge: { regime: 'dense-overcast', coverage: 0.96, baseM: 450, thicknessM: 500, shadow: false, streets: 0, cirrus: 0, farBand: 0.6 },
  skybridge: { regime: 'fair-weather-cumulus', coverage: 0.42, baseM: 700, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.5 },
  polders: { regime: 'broken-stratocumulus', coverage: 0.66, baseM: 420, thicknessM: 500, shadow: true, streets: 0.4, cirrus: 0.1, farBand: 0.5 },
  copper_mesa: { regime: 'cumulus-humilis', coverage: 0.2, baseM: 1900, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.4, farBand: 0.15 },
  airfield: { regime: 'fair-weather-cumulus', coverage: 0.38, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.35, cirrus: 0.12, farBand: 0.25 },
  oasis: { regime: 'cumulus-humilis', coverage: 0.17, baseM: 1700, thicknessM: 380, shadow: true, streets: 0.3, cirrus: 0.4, farBand: 0.15 },
  whiteout: { regime: 'low-stratus', coverage: 0.97, baseM: 300, thicknessM: 300, shadow: false, streets: 0, cirrus: 0, farBand: 0.5 },
  orchard: { regime: 'fair-weather-cumulus', coverage: 0.28, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.4, cirrus: 0.12, farBand: 0.25 },
  longleaf: { regime: 'fair-weather-cumulus', coverage: 0.32, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.5, cirrus: 0.12, farBand: 0.25 },
  mangrove: { regime: 'towering-cumulus', coverage: 0.34, baseM: 1200, thicknessM: 1500, shadow: true, streets: 0.15, cirrus: 0.1, farBand: 0.3 },
  saltwind: { regime: 'sea-streets', coverage: 0.3, baseM: 1100, thicknessM: 600, shadow: true, streets: 0.75, cirrus: 0.08, farBand: 0.55 },
  reservoir: { regime: 'fair-weather-cumulus', coverage: 0.26, baseM: 1400, thicknessM: 820, shadow: true, streets: 0.3, cirrus: 0.12, farBand: 0.25 },
  mars: { regime: 'thin-ice-clouds', coverage: 0.06, baseM: 2500, thicknessM: 400, shadow: false, streets: 0.2, cirrus: 0.45, farBand: 0 },
}, 'the cloudscape of every map (round 71 identity table)');
{
  // the regime rows are complete and sane; every regime name resolves
  assert.equal(CLOUDSCAPE_REGIME_NAMES.length, 18);
  for (const name of CLOUDSCAPE_REGIME_NAMES) {
    const row = CLOUDSCAPE_REGIMES[name];
    assert.ok(row.coverage >= 0 && row.coverage <= 0.97 && row.thicknessM > 0 && row.density > 0, `${name} row`);
    assert.ok(row.type[0] <= row.type[1], `${name} type range`);
    for (const k of ['towers', 'anvil', 'wispiness', 'shear', 'streets', 'cirrus', 'stratiform', 'fieldMix', 'farBand', 'scud']) assert.ok(row[k] >= 0 && row[k] <= 2, `${name}.${k}`);
  }
  assert.ok(!isCloudscapeRegime('puffs'));
  // the monsoon front keeps the sky over the camera open (round 68's ruling) with scud and anvils; the
  // white-out ceiling is a sheet at its authored altitude; the winter deck is a lumpy stratocumulus
  const monsoon = deriveCloudLayerPreset(skyOf('monsoon'));
  assert.deepEqual([monsoon.clearRadiusM, monsoon.anvil, monsoon.scud > 0, monsoon.towers, monsoon.typeRange, monsoon.fieldMix], [2500, 1, true, 1, [0.65, 1], 0.9], 'the front: wide masses of the broad field, clustered towers, anvils, scud, the sky over the camera open');
  const whiteout = deriveCloudLayerPreset(skyOf('whiteout'));
  assert.ok(whiteout.stratiform >= CLOUD_LAYER_RULES.sheetStratiform && whiteout.baseM === 300 && whiteout.fieldMix >= 0.8 && whiteout.scud === 0, 'whiteout: a closed ceiling, no rags at the camera');
  const winter = deriveCloudLayerPreset(skyOf('winter'));
  assert.ok(winter.stratiform < CLOUD_LAYER_RULES.sheetStratiform && winter.typeRange[1] <= 0.45 && winter.coverage >= 0.8, 'winter: a lumpy closed deck, not a flat sheet');
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
// round 71: the far ramp moved out so a deck stays readable at the horizon
assert.ok(CLOUD_AERIAL.farStartM >= 5000 && CLOUD_AERIAL.farEndM >= 20000 && CLOUD_AERIAL.farScatterCeiling <= 0.85, 'the far scatter ramp keeps a far deck readable');
const renderFrame = postSource.slice(postSource.indexOf('  function renderFrame('), postSource.indexOf('\n  // Live preset switching'));
assert.equal(renderFrame.match(/volumetricClouds\?\.beforeSceneRender\(/g)?.length, 1, 'one hook inside the frame transaction');
assert.equal(postSource.match(/beforeSceneRender\(/g)?.length, 1, 'no other post path marches the clouds');
assert.ok(renderFrame.indexOf('beforeSceneRender(') < renderFrame.indexOf('const jittered = taa.enabled;'), 'the march reads the unjittered camera');
assert.match(skySource, /get\('clouds'\)/, 'the ?clouds switch is read from the URL');
assert.match(skySource, /requested === 'volumetric' \|\| requested === 'on'/,
  'the volumetric layer is opt-in (owner 2026-09-25: the baked decks and the skies before it were fine; round 71 keeps it opt-in until the owner approves the cloudscapes)');
assert.match(skySource, /requested === 'off'\) return false/, 'the ?clouds=off fallback keeps the baked decks');
assert.match(skySource, /scene\.userData\.volumetricClouds = volumetricClouds;/);
assert.match(skySource, /CLOUD_NOISE_KINDS\.every\(\(kind\) => cloudNoiseUpload\[kind\]\)/, 'the worker handshake waits for every kind');
assert.match(mainSource, /sky\.attachShadowCascades\(lighting\.csm\);/, 'the cascades carry the cloud shadows');
assert.match(mainSource, /cloudscape: config\.clouds/, 'the map\'s clouds block rides with its sky block into the rig');
assert.ok(layerSource.includes('${ATMOSPHERE_SKY_GLSL}') && layerSource.includes('atmoSkyVisible( skyDir )'), 'the trace hazes toward the sky-view LUT');
assert.ok(layerSource.includes('markShadowOnly(gobo)'), 'the gobos live on the shadow-only layer');
assert.ok(layerSource.includes('gobo.customDepthMaterial = this.goboMaterial'), 'the gobos discard by the same two weather fields the trace reads');
assert.match(layerSource, /t\.uStepScale\.value = CLOUD_STEP_SCALE_BY_PRESET\[resolvePresetName\(\)\]/, 'the stride scale follows the quality preset every frame');
assert.match(layerSource, /blendSrc: THREE\.OneFactor, blendDst: THREE\.OneMinusSrcAlphaFactor/, 'premultiplied composite over the dome');
assert.match(layerSource, /uniform sampler3D tShape;[\s\S]*uniform sampler3D tDetail;[\s\S]*uniform sampler3D tCurl;/, 'the volumes are 3D textures');
for (const term of ['phaseDual( cosT, 0.8 )', 'exp( -tau * 0.25 )', 'float powder = mix( 1.0, 1.0 - exp( -sig * 60.0 ), powderK )', 'texelFetch( tBlue', 'cloudCoverageAt(', 'uAnvil', 'uShearM', 'uWispiness', 'uCirrus', 'uFarBand', 'uScud', 'halo']) {
  assert.ok(layerSource.includes(term), `the trace carries ${term}`);
}
assert.ok(layerSource.includes("name: 'VolumetricCloudTrace'") && layerSource.includes("name: 'VolumetricCloudResolve'") && layerSource.includes("name: 'VolumetricCloudDome'") && layerSource.includes("name: 'VolumetricCloudGobo'"));
console.log('volumetricClouds.selftest: noise digests (six bakes), tiling, equalisation and street anisotropy, the 31-map cloudscape table, the regime rows, the shadow policy, the slot cycle, the haze mirror and the hooks pinned');
