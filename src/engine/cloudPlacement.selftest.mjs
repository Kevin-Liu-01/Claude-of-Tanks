// clouds-269 (the owner, 2026-11-04: "many clouds i see are in perfect lines or grrid which is noot like real cloud
// patterns"; Main's gate, DECISIONS 2026-11-04, amended: the critics judge what is in view, this receipt covers every
// preset, the skies too empty to judge among them): every map's cumulus as the medium places it is aperiodic.
//
// For every shipped map whose main lane is convective, the weather the medium reads for it (cloudShaders.ts cl2Weather:
// the lane's channels of the local weather, mixed with the wind frame's cumulus field at the lane's street share and
// stretch, its own offsets) is sampled over a 24 km window in the wind frame and cut at the lane's cover (the clouds'
// footprints at their widest). Two measures, on that mask less its 2.5 km neighbourhood (the groups and clearings out):
//   rows   the share of the mask's variance its across-wind profile carries (a ruled roll is a bright row of the profile);
//   period the strongest climb of its autocorrelation back to a secondary peak, along or across the wind, past 1.2 km (a
//          lattice or a row spacing is such a peak; clustering only decays).
// Every map stays under both bounds; the negative control, the same map over round 71's field (seven ruled rolls a 12 km
// tile with a chain of lumps on each, reproduced here from origin/main 2cd74ad446 cloudNoise.ts streetRolls), fails one.
import assert from 'node:assert/strict';
import { bakeCloudLocalWeather, bakeCloudWeatherStreets, CLOUD_LOCAL_SIZE, CLOUD_NOISE_SEED, CLOUD_WEATHER_SIZE } from './cloudNoise.ts';
import { cloudStackOf } from './cloudLayers.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { CLOUD2_PERIODS } from './cloudShaders.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';

await loadCloudscapeLayers();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- round 71's street field (the control), as origin/main baked it: R only
function hash3(x, y, z, seed) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  h = Math.imul(h ^ (h >>> 7), 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function perlin2(N, cells, seed, out, amp, cellsY = cells) {
  const g = new Float32Array(cells * cellsY * 2);
  for (let y = 0; y < cellsY; y++) for (let x = 0; x < cells; x++) {
    const a = hash3(x, y, 0, seed) * 6.283185307179586;
    g[(y * cells + x) * 2] = Math.cos(a); g[(y * cells + x) * 2 + 1] = Math.sin(a);
  }
  const s = cells / N, sy = cellsY / N;
  const dot = (xi, yi, dx, dy) => g[(yi * cells + xi) * 2] * dx + g[(yi * cells + xi) * 2 + 1] * dy;
  for (let y = 0; y < N; y++) {
    const py = (y + 0.5) * sy, cy = Math.floor(py), fy = py - cy, uy = fade(fy), y0 = cy % cellsY, y1 = (cy + 1) % cellsY;
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * s, cx = Math.floor(px), fx = px - cx, ux = fade(fx), x0 = cx % cells, x1 = (cx + 1) % cells;
      const n00 = dot(x0, y0, fx, fy), n10 = dot(x1, y0, fx - 1, fy), n01 = dot(x0, y1, fx, fy - 1), n11 = dot(x1, y1, fx - 1, fy - 1);
      const nx0 = n00 + ux * (n10 - n00), nx1 = n01 + ux * (n11 - n01);
      out[y * N + x] += amp * (nx0 + uy * (nx1 - nx0));
    }
  }
}
function streetRolls71(N, rows, seed, out) {
  const wobble = new Float32Array(N * N);
  perlin2(N, 2, seed, wobble, 0.55, 4); perlin2(N, 4, seed + 1, wobble, 0.25, 8);
  const amp = new Float32Array(N * N);
  perlin2(N, 2, seed + 2, amp, 0.6, 3); perlin2(N, 4, seed + 3, amp, 0.3, 6);
  const widthN = new Float32Array(N * N);
  perlin2(N, 3, seed + 5, widthN, 0.7, 5); perlin2(N, 6, seed + 6, widthN, 0.3, 10);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const v = (y + 0.5) / N * rows + wobble[i] * 0.8;
    const row = Math.round(v);
    const wr = ((row % rows) + rows) % rows;
    const d = v - row;
    const strength = 0.7 + 0.3 * hash3(wr, 0, 7, seed + 4);
    const width = 0.13 + 0.12 * clamp01(0.5 + widthN[i]);
    const ridge = Math.exp(-(d * d) / (2 * width * width));
    const lumps = 9 + Math.floor(hash3(wr, 0, 15, seed + 12) * 10);
    const u = (x + 0.5) / N * lumps + hash3(wr, 1, 9, seed + 8) * lumps;
    const k0 = Math.floor(u);
    let best = 0;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const wk = ((k % lumps) + lumps) % lumps;
      if (hash3(wk, wr, 13, seed + 11) < 0.2) continue;
      const centre = k + 0.5 + (hash3(wk, wr, 11, seed + 9) - 0.5) * 1.0;
      const radius = 0.25 + 0.45 * hash3(wk, wr, 12, seed + 10);
      const dx = (u - centre) / radius;
      const lump = Math.max(0, 1 - dx * dx);
      if (lump > best) best = lump;
    }
    out[i] = ridge * (0.15 + 0.85 * best) * strength * clamp01(0.55 + amp[i] * 0.9);
  }
}
function streets71(N = CLOUD_WEATHER_SIZE, seed = CLOUD_NOISE_SEED) {
  const count = N * N, rolls = new Float32Array(count), lumps = new Float32Array(count), fine = new Float32Array(count);
  streetRolls71(N, 7, seed + 141, rolls);
  perlin2(N, 16, seed + 151, lumps, 0.6, 24); perlin2(N, 32, seed + 152, lumps, 0.4, 48);
  perlin2(N, 24, seed + 161, fine, 0.6); perlin2(N, 48, seed + 162, fine, 0.4);
  const v = Float32Array.from({ length: count }, (_, i) => rolls[i] * (1 - 0.2 * clamp01(0.5 - lumps[i] * 0.9)) + fine[i] * 0.04);
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
  const out = new Uint8Array(count * 4);
  order.forEach((i, rank) => { out[i * 4] = Math.round(clamp01((rank + 0.5) / count) * 255); });
  return { field: out, periodM: 12000 };
}

// ---- the medium's weather for a lane (cloudShaders.ts cl2Weather), sampled in the wind frame
const local = bakeCloudLocalWeather(CLOUD_LOCAL_SIZE);
const ours = { field: bakeCloudWeatherStreets(CLOUD_WEATHER_SIZE), periodM: CLOUD2_PERIODS.streets };
const control = streets71();
function tex(buf, n, u, v, c) {
  const x = u * n - 0.5, y = v * n - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (i, j) => buf[((((j % n) + n) % n) * n + (((i % n) + n) % n)) * 4 + c] / 255;
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}
const G = 240, SPAN = 36000, LAG_M = SPAN / G;
function footprint(preset, lane, streetField, stretched) {
  const wd = [Math.cos(preset.windDirRad), Math.sin(preset.windDirRad)];
  const off = [preset.offset[0] * 12000, preset.offset[1] * 12000];
  const stretch = stretched ? 1 + 0.35 * Math.max(lane.streets - 0.4, 0) : 1;
  const w = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    // a point at (along, across) in the wind frame, back in world xz
    const a = (i + 0.5) * LAG_M, c = (j + 0.5) * LAG_M, x = a * wd[0] - c * wd[1], z = a * wd[1] + c * wd[0];
    let v = 0;
    for (let k = 0; k < 4; k++) if (lane.channels[k]) v += lane.channels[k] * tex(local, CLOUD_LOCAL_SIZE, (x + off[0] * 4) / CLOUD2_PERIODS.local, (z + off[1] * 4) / CLOUD2_PERIODS.local, k);
    if (lane.streets > 0) {
      const qa = (a + off[0] * 0.73) / stretch, qc = c + off[1] * 0.37;
      v += (tex(streetField.field, CLOUD_WEATHER_SIZE, qa / streetField.periodM, qc / streetField.periodM, 0) - v) * lane.streets;
    }
    const bands = clamp01((tex(local, CLOUD_LOCAL_SIZE, (x + off[0] * 4) / CLOUD2_PERIODS.local, (z + off[1] * 4) / CLOUD2_PERIODS.local, 2) - 0.3) / 0.4);
    v *= 1 + (bands * bands * (3 - 2 * bands) - 1) * lane.envelope;
    w[j * G + i] = clamp01(v);
  }
  return Float32Array.from(w, (v) => (v > 1 - lane.cover ? 1 : 0));
}
/** A separable box blur of radius r texels, three passes (about a Gaussian of r texels). */
function blur(src, r) {
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const x = i + k; if (x >= 0 && x < G) { s += a[j * G + x]; n++; } }
      b[j * G + i] = s / n;
    }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const y = j + k; if (y >= 0 && y < G) { s += b[y * G + i]; n++; } }
      a[j * G + i] = s / n;
    }
  }
  return a;
}
/**
 * On the footprints less their 2.5 km neighbourhood (groups and clearings taken out, a cloud's own scale and a row's
 * spacing kept): rows, the across-wind profile's share of the variance; period, the autocorrelation's strongest climb
 * back to a peak along or across the wind (1.2-12 km).
 */
function measure(m) {
  const share = m.reduce((s, v) => s + v, 0) / m.length;
  const low = blur(m, Math.round(2500 / LAG_M / 1.7));
  const hp = Float32Array.from(m, (v, i) => v - low[i]);
  const mean = hp.reduce((s, v) => s + v, 0) / hp.length;
  let total = 0, across = 0;
  for (const v of hp) total += (v - mean) ** 2;
  for (let j = 0; j < G; j++) {
    let s = 0;
    for (let i = 0; i < G; i++) s += hp[j * G + i];
    across += G * (s / G - mean) ** 2;
  }
  const acf = (dx, dy) => {
    let s = 0;
    for (let j = 0; j < G - dy; j++) for (let i = 0; i < G - dx; i++) s += (hp[j * G + i] - mean) * (hp[(j + dy) * G + i + dx] - mean);
    return s / total * (G * G) / ((G - dx) * (G - dy));
  };
  let period = 0;
  for (const axis of [0, 1]) {
    const vals = [];
    for (let L = 1; L * LAG_M <= 12000; L++) vals.push([L * LAG_M, axis ? acf(0, L) : acf(L, 0)]);
    for (let k = 1; k < vals.length - 1; k++) {
      const [lag, v] = vals[k];
      if (lag < 1200 || v < vals[k - 1][1] || v < vals[k + 1][1]) continue;
      const lo = Math.min(...vals.filter(([l]) => l >= 600 && l <= lag).map(([, x]) => x));
      period = Math.max(period, v - lo);
    }
  }
  return { rows: total > 0 ? across / total : 0, period, share };
}

// (2026-11-04, the 31 cumulus maps at their street shares (cloudLayers.ts cloudStreetShare): rows 0.014-0.041 against
// 0.063-0.328 on round 71's rolls at round 71's share, every map that carried them; the autocorrelation's climb 0.079-0.160
// — the local weather's own jittered cells, one to a cell, unchanged since round 71 — against 0.105-0.579. Rows decide;
// the climb's bound catches a lattice. 2026-11-05, the shares by cover too (cloudLaneStreetShare, the full skies at about
// half the lobes): rows at most 0.041, the climb at most 0.149.)
const ROWS_MAX = 0.05, PERIOD_MAX = 0.2;
const report = [];
let controlsFailed = 0, convective = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  if (!config) continue;
  const sky = id === 'mars' ? MARS_SKY_PRESET : { ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null };
  if ((sky.cloudOpacity ?? 0) <= 0.01) continue;
  const preset = deriveCloudLayerPreset(sky);
  const lane = cloudStackOf(preset).lanes[0];
  if (!lane || lane.dome <= 0) continue; // a deck: no cumulus to place
  convective++;
  const now = measure(footprint(preset, lane, ours, true));
  report.push({ id, regime: preset.regime, streets: +lane.streets.toFixed(2), rows: +now.rows.toFixed(3), period: +now.period.toFixed(3), share: +now.share.toFixed(2) });
  assert.ok(now.rows < ROWS_MAX, `${id} (${preset.regime}): no rows across the wind (${now.rows.toFixed(3)} of the footprints' variance)`);
  assert.ok(now.period < PERIOD_MAX, `${id} (${preset.regime}): no lattice or row spacing (autocorrelation climb ${now.period.toFixed(3)})`);
  // the control: round 71's field at round 71's share of it (the regime's whole street knob)
  // (cloudLayers.ts cloudStackOf on origin/main: the knob times the lane's convective share, 1 − its deck)
  const deck = Math.max(clamp01(preset.stratiform), clamp01(preset.cells) * 0.9);
  const oldLane = { ...lane, streets: clamp01(preset.streets) * (1 - deck) };
  if (oldLane.streets > 0.2) {
    const old = measure(footprint(preset, oldLane, control, false));
    const failed = old.rows >= ROWS_MAX || old.period >= PERIOD_MAX;
    report[report.length - 1].control = { rows: +old.rows.toFixed(3), period: +old.period.toFixed(3), failed };
    if (failed) controlsFailed++;
  }
}
assert.ok(convective >= 25, `every cumulus map placed (${convective})`);
const withControl = report.filter((r) => r.control).length;
assert.ok(withControl >= 25 && controlsFailed === withControl, `round 71's ruled rolls fail the receipt on every map that carried them (${controlsFailed} of ${withControl})`);
console.log(`cloudPlacement: ${convective} cumulus maps aperiodic (rows < ${ROWS_MAX}, period < ${PERIOD_MAX}); worst rows `
  + `${Math.max(...report.map((r) => r.rows)).toFixed(3)}, worst period ${Math.max(...report.map((r) => r.period)).toFixed(3)}; `
  + `round 71's field fails on ${controlsFailed} of ${withControl}`);
if (process.env.COT_CLOUD_PLACEMENT_REPORT) console.log(JSON.stringify(report, null, 1));
