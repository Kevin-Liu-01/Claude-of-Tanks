// clouds-269 (the owner, 2026-11-04: "many clouds i see are in perfect lines or grrid which is noot like real cloud
// patterns. fix … just make clouds more natural and also less prism-y"): the cloud field's three repeats and its prism,
// pinned without a GPU.
//   1. Rows: the wind frame's cumulus field (cloudNoise.ts bakeCloudWeatherStreets R) holds no rows — the share of its
//      variance carried by its across-wind profile (a ruled roll's signature) stays small, and its correlation along and
//      across the wind past a cloud's size shows no peak. A negative control (round 71's seven ruled rolls) fails both.
//   2. The shape volume's lattice: the medium reads it off the world's axes and through a smooth warp (cloudShaders.ts).
//   3. The prism: a convective lane's dome (cloudShaders.ts cl2Shell, twinned here) narrows its footprint from low on the
//      slab, where round 6's shell law kept the footprint whole to above half its height; every deck keeps that law.
//   4. The phones' baked deck (sky.ts CLOUD_FRAG): a second copy chosen region by region, so a tile and its neighbour a
//      period away mostly come from different copies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bakeCloudWeatherStreets, CLOUD_WEATHER_SIZE } from './cloudNoise.ts';
import { CLOUD_DOME_CROWN, cloudStackOf, packCloudStack } from './cloudLayers.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { CLOUD2_PERIODS } from './cloudShaders.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';

await loadCloudscapeLayers();
const shaders = readFileSync(new URL('./cloudShaders.ts', import.meta.url), 'utf8');
const skySrc = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- 1. rows
const N = CLOUD_WEATHER_SIZE;
/** The field's row score and its correlation peak past `minM` (the field thresholded at its top `cover`). */
function rowsOf(field, cover, metresPerTexel, minM) {
  const sorted = Float32Array.from(field).sort();
  const cut = sorted[Math.floor(sorted.length * (1 - cover))];
  const m = Float32Array.from(field, (v) => (v > cut ? 1 : 0));
  const mean = m.reduce((a, b) => a + b, 0) / m.length;
  let total = 0;
  for (const v of m) total += (v - mean) ** 2;
  // the across-wind profile: each row's mean along the wind (a ruled roll is one bright row)
  let across = 0;
  for (let y = 0; y < N; y++) {
    let s = 0;
    for (let x = 0; x < N; x++) s += m[y * N + x];
    across += N * (s / N - mean) ** 2;
  }
  const acf = (dx, dy) => {
    let s = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s += (m[y * N + x] - mean) * (m[((y + dy) % N) * N + ((x + dx) % N)] - mean);
    return s / total;
  };
  let peak = -1;
  for (let L = Math.ceil(minM / metresPerTexel); L < N / 2; L += 2) peak = Math.max(peak, acf(L, 0), acf(0, L));
  return { rows: across / total, peak };
}
const streets = bakeCloudWeatherStreets(N);
const red = Float32Array.from({ length: N * N }, (_, i) => streets[i * 4]);
const texelM = CLOUD2_PERIODS.streets / N;
const field = rowsOf(red, 0.4, texelM, 1500);
// the negative control: round 71's rolls (seven Gaussian ridges a tile, a chain of lumps on each) on the same lattice
const rolls = new Float32Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const v = ((y + 0.5) / N) * 7, d = v - Math.round(v);
  const lumps = Math.max(0, Math.cos((((x + 0.5) / N) * 13 + Math.round(v) * 0.37) * Math.PI * 2));
  rolls[y * N + x] = Math.exp(-(d * d) / (2 * 0.18 * 0.18)) * (0.15 + 0.85 * lumps);
}
const control = rowsOf(rolls, 0.4, 12000 / N, 1500);
assert.ok(control.rows > 0.3 && control.peak > 0.3, `the control's ruled rolls read as rows (${control.rows.toFixed(3)}, peak ${control.peak.toFixed(3)})`);
assert.ok(field.rows < 0.08, `the cumulus field holds no rows across the wind (${field.rows.toFixed(3)} of its variance)`);
assert.ok(field.peak < 0.12, `nor a repeat along or across it past 1.5 km (correlation peak ${field.peak.toFixed(3)})`);
assert.ok(CLOUD2_PERIODS.streets >= 18000, 'the field\'s tile stands past the views it fills');

// ---- 2. the shape volume's lattice
const mediaSrc = shaders.slice(shaders.indexOf('vec4 cl2Media('), shaders.indexOf('float cl2Extinction('));
for (const line of [
  'vec2 warp = textureLod( tTurb, sp.xz / ( CL2_TURB * 8.0 ) + vec2( 0.31, 0.67 ), 0.0 ).rg * 2.0 - 1.0;',
  'sp.xz = mat2( 0.8, 0.6, -0.6, 0.8 ) * sp.xz + warp * ( 0.3 * uShapePeriod );',
]) assert.ok(mediaSrc.includes(line), `the shape lookup leaves the world's axes: ${line}`);
assert.ok(mediaSrc.indexOf('sp.xz = mat2(') < mediaSrc.indexOf('textureLod( tShape'), 'before the shape fetch');

// ---- 3. the prism
const shellSrc = shaders.slice(shaders.indexOf('vec4 cl2Shell('), shaders.indexOf('vec4 cl2Media('));
for (const line of [
  'vec4 e = clamp( ( weather - ( 1.0 - uLayerCover ) ) / max( uLayerCover, vec4( 0.02 ) ), 0.0, 1.0 );',
  'vec4 crown = pow( max( e, vec4( 1e-4 ) ), max( uLayerDome, vec4( 0.05 ) ) );',
  'vec4 rim = 0.14 * ( 1.0 - e ) * ( 1.0 - e );',
  'vec4 dome = smoothstep( rim, rim + 0.1, hf ) * ( 1.0 - smoothstep( crown * 0.55, crown, hf ) );',
  'vec4 dd = clamp( ( weather - ( 1.0 - uLayerCover ) ) / max( uLayerCover * uLayerFilter, vec4( 0.02 ) ), 0.0, 1.0 ) * dome;',
  'd = mix( d, dd, step( vec4( 1e-4 ), uLayerDome ) );',
]) assert.ok(shellSrc.includes(line), `the dome twin mirrors: ${line}`);
/** The shell's density (one lane) at a height fraction over weather w: round 6's law, or the dome when `dome` > 0. */
function shellTwin(lane, hf, w) {
  const hs = smooth(0, 0.06, hf) * (1 - Math.pow(hf, 1 / Math.max(lane.bias, 0.05)));
  const admitted = lane.cover * hs;
  let d = clamp((w - (1 - admitted)) / Math.max(admitted * lane.filter, 0.02), 0, 1);
  if (lane.dome > 0) {
    const e = clamp((w - (1 - lane.cover)) / Math.max(lane.cover, 0.02), 0, 1);
    const crown = Math.pow(Math.max(e, 1e-4), lane.dome), rim = 0.14 * (1 - e) * (1 - e);
    const dome = smooth(rim, rim + 0.1, hf) * (1 - smooth(crown * 0.55, crown, hf));
    d = clamp((w - (1 - lane.cover)) / Math.max(lane.cover * lane.filter, 0.02), 0, 1) * dome;
  }
  return d * lane.core;
}
/**
 * A cloud's mass at each height: the shell's mean over an even ramp of weather (edge to peak). The shape volume carves a
 * point into cloud where its noise clears what the shell leaves (cl2Media), so the cloud's breadth at a height follows
 * this mean.
 */
function mass(lane, hf) {
  let m = 0;
  for (let i = 0; i < 400; i++) m += shellTwin(lane, hf, 1 - lane.cover + lane.cover * (i + 0.5) / 400);
  return m / 400;
}
const verdant = getMapConfig('verdant');
const cumulus = cloudStackOf(deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...verdant.sky, cloudscape: verdant.clouds })).lanes[0];
assert.equal(cumulus.dome, CLOUD_DOME_CROWN - 0.2 * 0.15, 'Verdant\'s cumulus takes the dome (its towers 0.15)');
const profileOf = (lane) => {
  const at = (h) => mass(lane, h), widest = Math.max(...[0.1, 0.15, 0.2, 0.25, 0.3].map(at));
  return { half: at(0.5) / widest, high: at(0.75) / widest, top: at(0.95) / widest, base: at(0.03) / widest };
};
const dome = profileOf(cumulus);
const old = profileOf({ ...cumulus, dome: 0 });
// (2026-11-04, Verdant: round 6's mass at 0.5 / 0.75 / 0.95 of the slab and its base 0.81 / 0.50 / 0.12 and 0.50 — a body
// carried to a flat lid over a plate; the dome's 0.84 / 0.23 / 0.003 and 0.09)
assert.ok(old.top > 0.08 && old.base > 0.4, `round 6's law: a flat lid at the slab's top (${old.top.toFixed(2)}) over a plate (${old.base.toFixed(2)})`);
assert.ok(dome.high < 0.3 && dome.high < 0.6 * old.high, `the dome rounds its upper body (${dome.high.toFixed(2)} at three quarters, round 6 ${old.high.toFixed(2)})`);
assert.ok(dome.top < 0.02, `and closes under the slab's top: no flat lid (${dome.top.toFixed(3)})`);
assert.ok(dome.base < 0.2, `its base softens toward the rim (${dome.base.toFixed(2)})`);

// every map: a convective main lane domes, a deck keeps the shell law
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  if (!config || (config.sky?.cloudOpacity ?? DEFAULT_SKY_PRESET.cloudOpacity ?? 0) <= 0.01) continue;
  const stack = cloudStackOf(deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null }));
  for (const lane of stack.lanes) {
    const deck = lane.flat >= 0.45 && lane.cells > 0;
    if (deck) assert.equal(lane.dome, 0, `${id}: a deck keeps the shell law`);
    else assert.ok(lane.dome > 0.2 && lane.dome <= CLOUD_DOME_CROWN, `${id}: its cumulus domes (${lane.dome})`);
  }
  const u = {};
  for (const k of ['uLayerBase', 'uLayerTop', 'uLayerCover', 'uLayerDensity', 'uLayerShape', 'uLayerDetail', 'uLayerBias', 'uLayerFilter',
    'uLayerExp', 'uLayerStreets', 'uLayerCells', 'uLayerWisp', 'uLayerFlat', 'uLayerHang', 'uLayerAnvil', 'uLayerCore', 'uLayerLumps',
    'uLayerDome', 'uProfA', 'uProfB', 'uProfC', 'uProfD']) u[k] = { value: { v: [], set(...a) { this.v = a; } } };
  u.uLayerChannels = { value: { elements: new Array(16).fill(0) } };
  u.uHeightRange = { value: { set() {} } };
  packCloudStack(stack, u);
  assert.equal(u.uLayerDome.value.v[0], stack.lanes[0].dome, `${id}: the dome packed into lane 0`);
}

// ---- 4. the phones' deck
for (const line of [
  'float n = sin( dot( p, vec2( 0.00135, 0.00055 ) ) + 1.3 ) + sin( dot( p, vec2( -0.00063, 0.0012 ) ) + 4.1 )',
  '+ 0.6 * sin( dot( p, vec2( 0.00215, -0.00165 ) ) + 0.4 );',
  'float sel = smoothstep( -0.2, 0.2, n );',
  'vec4 b = deckAt( mat2( 0.8678, 0.4969, -0.4969, 0.8678 ) * p * 1.37 + vec2( 913.0, 2711.0 ) );',
]) assert.ok(skySrc.includes(line), `the deck's selector twin mirrors: ${line}`);
const sel = (x, z) => smooth(-0.2, 0.2, Math.sin(x * 0.00135 + z * 0.00055 + 1.3) + Math.sin(-x * 0.00063 + z * 0.0012 + 4.1) + 0.6 * Math.sin(x * 0.00215 - z * 0.00165 + 0.4));
let b = 0, swapped = 0, total = 0;
for (let x = -15000; x < 15000; x += 150) for (let z = -15000; z < 15000; z += 150) {
  const s = sel(x, z);
  b += s; total++;
  // a tile and its neighbour a period (3.2 km) away along either axis of the bake
  if (Math.abs(s - sel(x + 3200, z)) > 0.5 || Math.abs(s - sel(x, z + 3200)) > 0.5) swapped++;
}
assert.ok(b / total > 0.3 && b / total < 0.7, `both copies of the deck show (${(b / total).toFixed(2)} the second's)`);
assert.ok(swapped / total > 0.4, `a tile's neighbour a period away is mostly the other copy (${(swapped / total).toFixed(2)})`);
console.log(`cloudField: rows ${field.rows.toFixed(3)} (control ${control.rows.toFixed(3)}), peak ${field.peak.toFixed(3)} (control ${control.peak.toFixed(3)}); `
  + `mass at 0.5 / 0.75 of the slab: dome ${dome.half.toFixed(2)} / ${dome.high.toFixed(2)}, round 6 ${old.half.toFixed(2)} / ${old.high.toFixed(2)}; `
  + `deck copies swap within a period at ${(100 * swapped / total).toFixed(0)} %`);
