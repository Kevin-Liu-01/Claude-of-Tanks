import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { ClampToEdgeWrapping, LinearMipmapLinearFilter, NoColorSpace } from 'three';
import { stampShoreDirtMask } from './shoreDirtMask.ts';
import { createHeightField, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { historicalMaskTexture as makeMaskTexture } from './roadRutHistoryTestOracle.mjs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { planRiverLanding } from './maps/riverLandings.ts';
import { historicalShorelineConfig, historicalReservoirConfig, historicalBadlandsInput } from './shorelineHistoryTestOracle.mjs';
import { assertTerrainMaskShaderContract } from './terrainMaskShaderTestOracle.mjs';

import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';

// Copper Mesa's quarry is selected by id inside the actual heightfield. Do
// not erase it to recover old roads. This private import substitutes only
// endpoint completion; ordinary terrain imports and all quarry logic survive.
const copperTerrainUrl = new URL('./terrain.ts?selftest=shore-original-copper-roads', import.meta.url).href;
const endpointsUrl = new URL('./maps/roadEndpoints.ts', import.meta.url).href;
const originalEndpointsUrl = `data:text/javascript,${encodeURIComponent(
  `export * from ${JSON.stringify(endpointsUrl)};
   export function completeRoadEndpoints(_id, roads) { return roads; }`)}`;
const originalBorderUrl = `data:text/javascript,${encodeURIComponent(
  `export * from ${JSON.stringify(new URL('./maps/roadBorderCorridor.ts', import.meta.url).href)};
   export function alignCopperNorthernRoadGrades() {}`)}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === copperTerrainUrl && specifier === './maps/roadEndpoints.ts') {
    return { url: originalEndpointsUrl, shortCircuit: true };
  }
  if (context.parentURL === copperTerrainUrl && specifier === './maps/roadBorderCorridor.ts') {
    return { url: originalBorderUrl, shortCircuit: true };
  }
  return next(specifier, context);
} });
let originalCopperHeightField;
try { ({ createHeightField: originalCopperHeightField } = await import(copperTerrainUrl)); }
finally { hooks.deregister(); }

// Explicit last sampled stations in the original32m grid loop. Coastal's
// authored hi262 was sampled only through256; it must not acquire the new
// terminal262 merely because completion is disabled. Other grids end at512.
const ORIGINAL_GRID_LAST = {
  urban: { xs: 512, zs: 512 }, coastal: { xs: 512, zs: 256 },
  railyard: { xs: 512, zs: 512 }, foundry: { xs: 512, zs: 512 },
  ruinspires: { xs: 512, zs: 512 },
};
function originalRoadField(cfg) {
  let control = cfg.id === 'alpine' ? originalExitConfig(cfg) : cfg;
  const grid = control.terrain.roads?.grid;
  if (grid) {
    const last = ORIGINAL_GRID_LAST[cfg.id];
    assert.ok(last, `${cfg.id}: historical grid requires explicit last stations`);
    const oldAxis = axis => grid[axis].map(entry => {
      const row = typeof entry === 'number' ? { at: entry } : entry;
      assert.equal(row.lo ?? -512, -512, 'historical grid starts at-512');
      assert.equal(row.hi ?? 512, cfg.id === 'coastal' && axis === 'zs' ? 262 : 512,
        'current authored bounds remain independently explicit');
      return { ...row, hi: last[axis] };
    });
    control = { ...control, terrain: { ...control.terrain, roads: { ...control.terrain.roads,
      grid: { ...grid, xs: oldAxis('xs'), zs: oldAxis('zs') } } } };
  }
  return cfg.id === 'copper_mesa' ? originalCopperHeightField(1337, control)
    : createHeightField(1337, { ...control, id: undefined });
}

// Captured BEFORE adding the shore pass, from normal production imports:
// createHeightField(1337) -> makeMaskTexture(noise seed3010), desktop512.
// These are immutable full RGBA controls, not a second copy of the new helper.
// road pass 2026-09-12: the mask G byte is now the road centreline distance
// field (terrain.ts paintRoadMask), so every full-RGBA golden below was
// re-pinned to the new bytes. R/B/A are produced by unchanged code; the
// channel-masked comparison against the previous painter is recorded in
// docs/research/map-pass-20260912.md (road pass section).
const ORIGINAL = {
  verdant: '3235ff56f2be109633eb3ad158e180c0e4f3a2cf4bb13c77cdc5ece4265a7293',
  desert: '9e6191d3ca532db0f5c58ffc86aa2e0da2460c6779ac86db0214f659b94208c1',
  winter: '6574bffd1741c2adb8d607aa0cc198ae224f5293c81a7bfd6a670c6b0c71f4b7', // 2026-09-23: Frosthollow redesign (owner ruling) — new pond chain / roads
  urban: '7431bfb3ca249b8dff2b2022d654885873c69e732e4cd2b4e103e0700722efa8',
  coastal: '592e20a91d2388f1d96fd76e2b19d177cd83b095067b7a6fbdc448952d1bc4c9',
  autumn: '7cd21056fa06807f3cb7f19f662389b1db48b416907fbe3c93a517de513b7373',
  steppe: '9cc012f13bf23c5218bab47e4fdc5937bb61a91e0e9ea9d19e5e6109166a8875',
  railyard: '60cb1c0dbc01a732dff4b897e94572dbb24b9928720d7a68e58893940916896d',
  frontier: '5d86908440f744973fed63679a66741188912f532b0dcda3fa59a2c06b482247',
  fjord: '84cf41b4b8340154b027e3bf062c05782e20bd9b4ec052f28ae86a62689e24ad',
  delta: 'da0742d0e4e66613d8b0e99965ff00bc21a8e6d13d8e638baef1fb61b1dfb5ef',
  badlands: 'd4423fa2c84421cb418f3e368158eaf27ae1dfa98da788dd8d6662556279cc3d',
  monsoon: 'dd9ca278ae49175974e9e2098dd5ff0f2d56b498a8ea805ced8c6b206651ddcb',
  alpine: '2ad1864aeb938980f156e7c6557f34492ea660a4b8ade93269b248e76db65b57',
  caldera: '7c93501edef3e6b59dc06e84fd2edccc6d7ff6c326eeb1d51bd6495f6f5092c2',
  foundry: '18dda33915db1badaab18f6f7bf4bbb2cacc30682c66649318ec057c9c13c78e',
  ruinspires: 'b905641ccca89131a9ebf525603cde8045978aadfb6a5d894aa7d02a00022db6',
  blackglass: '3e82e4f1834bfafd3d818b345891f0a2da97bbbe1d899e47215259c8580b8ef0',
  titan_gorge: '9c3761889c33218fa78258b934f6f79570206c2cdb452667a226334ebd0b903b',
  skybridge: 'f56449b84de370980180ff372f713ccbeb51954ddd0db5464a4e9ec2d2644e3e',
  polders: 'fbf89f52cc5b15f56f8b23c593ebd9a9f52924f4f12a926f6b614833af9c50a4',
  copper_mesa: 'e310e4754b8e96b4ae728fda1b6d343d12aea3d986f095d95a5671c45ad99014',
  airfield: 'c5027e71cdd600c072279c85e90e0fffb6255d8faa8f0030f56c4e1588828203',
  oasis: '79934a72f7b2e1c5a9e83af63b262bf9a2a35a95fcf1e943b7f6e2c95e4c4a17',
  whiteout: 'cb18b8d9cc2c711b2f53602665f1d14a9581e464f5b4fefab64fe2d9e01802b3',
  orchard: '50ac061fe6ebabaa6c45139d8a90624b0f53c70636f1d857eac9f298dc4b5a9b',
  longleaf: '35eb308242df93c194fe2fa2764054e5880f581893de7eecf451b5b92670e699',
  mangrove: '9bcef3866a3c254b53208d69e8ba9a0db0665f07053dce6ba832fc35e7d8153c',
  // round 40 (2026-09-22): Saltwind's bay is one authored hooked contour open to the west edge (saltwind.ts lakes); mask re-pinned
  saltwind: 'c080e5b0e13655ef3e4346fc8a9b7d5f56432802ae93b970599b796c8de1256e',
  reservoir: 'ce8e361f5beb374d60e58d96bdec2611f2249b18f55877142f34e2919ece69ca',
  mars: '0a3814c2ad165409f488cb8d8883e7005b874b21a6b4cd03a18db42b130a1fdb', // 2026-09-19 Olympus Basin (no water: dry-mask digest)
};
const hash = data => createHash('sha256').update(data).digest('hex');
const bytes = texture => texture.image.data;
function coverage(distance) {
  const t = Math.max(0, Math.min(1, (distance - 3) / 7));
  return Math.round((1 - t * t * (3 - 2 * t)) * 255);
}
function verifyPreserved(before, after) {
  for (let at = 0; at < before.length; at += 4) {
    assert.equal(after[at], before[at], 'road bytes unchanged');
    assert.equal(after[at + 1], before[at + 1], 'rut bytes unchanged');
    assert.equal(after[at + 2], before[at + 2], 'canonical water bytes unchanged');
    assert.ok(after[at + 3] >= before[at + 3], 'original village soil never reduced');
    if (before[at]) assert.equal(after[at + 3], before[at + 3], 'road soil unchanged too');
  }
}
function checkMetric(step) {
  const size = 32, seeds = [[0, 0], [21, 13], [31, 31]];
  const px = new Uint8ClampedArray(size * size * 4);
  const distance = new Float32Array(size * size).fill(7);
  const pixelBuffer = px.buffer, scratchBuffer = distance.buffer;
  for (const [x, z] of seeds) px[(z * size + x) * 4 + 2] = 31;
  px[4 + 2] = 30; // Below .12: cannot become a seed through floor rounding.
  for (let x = 0; x < size; x++) { px[(16 * size + x) * 4] = 1; px[(16 * size + x) * 4 + 3] = 17; }
  const original = px.slice();
  stampShoreDirtMask(px, distance, size, size * step, .12);
  assert.equal(px.buffer, pixelBuffer); assert.equal(distance.buffer, scratchBuffer);
  verifyPreserved(original, px);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const at = z * size + x;
    const exact = Math.min(...seeds.map(([sx, sz]) => Math.hypot(x - sx, z - sz) * step));
    assert.ok(distance[at] >= exact - 0.00003, 'chamfer cannot shorten true metric distance or wrap rows');
    assert.ok(distance[at] <= exact * 1.0824 + 0.00003, 'bounded diagonal overestimate, including both map corners');
    if (z !== 16) assert.ok(Math.abs(px[at * 4 + 3] - coverage(distance[at])) <= 1, '3m full / 10m fade survives Uint8 rounding');
  }
  assert.equal(distance[1], step, 'subthreshold wetness does not seed the transform');
  const corrupt = px.slice(); corrupt[2] ^= 1;
  assert.throws(() => verifyPreserved(original, corrupt), /canonical water/);
}
function checkContinuousBorder(step, angle) {
  const size = 24, px = new Uint8ClampedArray(size * size * 4);
  const dist = new Float32Array(size * size), c = Math.cos(angle), s = Math.sin(angle);
  const signed = (x, z) => ((x + .5 - size / 2) * c + (z + .5 - size / 2) * s) * step;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (signed(x, z) <= 0) px[(z * size + x) * 4 + 2] = 255;
  }
  stampShoreDirtMask(px, dist, size, size * step, .12);
  for (let z = 4; z < size - 4; z++) for (let x = 4; x < size - 4; x++) {
    const d = Math.max(0, signed(x, z));
    if (d > 14) continue;
    assert.ok(dist[z * size + x] >= d - .00003);
    assert.ok(dist[z * size + x] <= (d + step * Math.SQRT2) * 1.0824 + .00003,
      'analytic border discrepancy bounded by pixel footprint plus documented chamfer error');
  }
}
function checkEmptyAndInvalid() {
  const px = new Uint8ClampedArray(64), dist = new Float32Array(16);
  px[3] = 84; const before = px.slice();
  stampShoreDirtMask(px, dist, 4, 16, .12);
  assert.deepEqual(px, before, 'no water means no shore dirt');
  assert.ok(dist.every(value => value === Infinity));
  assert.throws(() => stampShoreDirtMask(px, dist, 4, 16, 0), /positive normalized/);
  assert.throws(() => stampShoreDirtMask(px, dist, 4, NaN, .12), /finite metres/);
  assert.throws(() => stampShoreDirtMask(px, new Float32Array(15), 4, 16, .12), /sized mask/);
  assert.throws(() => stampShoreDirtMask(px, new Float32Array(px.buffer), 4, 16, .12), /separate/);
}
function bake(field, cfg, enabled = cfg.splat?.shoreDirt) {
  return makeMaskTexture(new SimplexNoise({ random: mulberry32(3010) }), field._layout,
    selectTerrainLandformMask(cfg.splat, field._mesaW), field._waterWetnessAt || null,
    enabled ? cfg.splat.seaRamp[0] : null);
}
function checkTexture(texture, size) {
  assert.equal(texture.image.width, size); assert.equal(texture.image.height, size);
  assert.equal(bytes(texture).byteLength, size * size * 4);
  assert.equal(texture.colorSpace, NoColorSpace); assert.equal(texture.premultiplyAlpha, false);
  assert.equal(texture.flipY, false); assert.equal(texture.wrapS, ClampToEdgeWrapping);
  assert.equal(texture.wrapT, ClampToEdgeWrapping); assert.equal(texture.minFilter, LinearMipmapLinearFilter);
  assert.equal(texture.generateMipmaps, true);
}
function fieldValues(field, x, z) {
  return [field.getHeightAt(x, z), ...field.getNormalAt(x, z).toArray(), field.getWaterMaskAt(x, z),
    field.getGroundType(x, z), field._roadDist(x, z), field._noVeg(x, z)];
}
function checkProtected(field, control, texture, original, cfg) {
  const size = texture.image.width;
  const pixel = (x, z) => (Math.floor((z + 512) / 1024 * size) * size + Math.floor((x + 512) / 1024 * size)) * 4;
  for (const spawn of [field._layout.spawns.player, ...field._layout.spawns.enemies]) {
    for (const dx of [-4, 0, 4]) for (const dz of [-4, 0, 4]) {
      const x = spawn.x + dx, z = spawn.z + dz, at = pixel(x, z);
      assert.deepEqual(fieldValues(field, x, z), fieldValues(control, x, z));
      assert.equal(field.getWaterMaskAt(x, z), 0, 'spawn core stays dry');
      assert.equal(bytes(texture)[at + 3], bytes(original)[at + 3], 'spawn soil unchanged');
    }
  }
  for (const road of field._layout.roads) for (const [x, z] of road) {
    assert.deepEqual(fieldValues(field, x, z), fieldValues(control, x, z));
    assert.equal(field.getWaterMaskAt(x, z), 0, 'causeway/road centre stays dry');
  }
  for (const beat of cfg.props.tacticalBeats) {
    assert.deepEqual(fieldValues(field, beat.x, beat.z), fieldValues(control, beat.x, beat.z), 'landmark support/physics unchanged');
  }
  for (const anchor of cfg.props.riverLandings ?? []) {
    const landing = planRiverLanding(field, field._layout.lakes, anchor);
    assert.ok(landing, 'all three real landings remain available');
    assert.deepEqual(landing, planRiverLanding(control, control._layout.lakes, anchor), 'working-bank support remains exact');
  }
}
function exactSeedDistance(before, size, x, z) {
  const step = 1024 / size, radius = Math.ceil(10 / step);
  let exact = Infinity;
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= size || zz >= size) continue;
    if (before[(zz * size + xx) * 4 + 2] >= 31) exact = Math.min(exact, Math.hypot(dx, dz) * step);
  }
  return exact;
}
function checkRealMaskOracle(before, after, size) {
  const step = 1024 / size;
  let changedDry = 0, checked = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i + 2] !== 0 || after[i + 3] <= before[i + 3] + 32) continue;
    changedDry++;
    if (changedDry % 19 !== 0) continue;
    const x = (i / 4) % size, z = Math.floor(i / 4 / size);
    const exact = exactSeedDistance(before, size, x, z);
    assert.ok(exact < 10, 'every changed dry-bank pixel has actual protected water within10m');
    const lo = Math.max(before[i + 3], coverage(exact * 1.0824));
    const hi = Math.max(before[i + 3], coverage(exact));
    assert.ok(after[i + 3] >= lo - 1 && after[i + 3] <= hi + 1, 'real channel border agrees with exact nearest-seed oracle');
    checked++;
  }
  assert.ok(changedDry * step * step > 2000 && checked > 10, 'materially wider earthy fringe, not just already-submerged pixels');
  return changedDry * step * step;
}
function benchmark(before, size) {
  const trials = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const pixels = new Uint8ClampedArray(before), scratch = new Float32Array(size * size);
    const start = performance.now(); stampShoreDirtMask(pixels, scratch, size, 1024, .12);
    trials.push(performance.now() - start);
  }
  return trials.sort((a, b) => a - b)[1];
}
function checkShoreMap(id, seed, size) {
  const cfg = getMapConfig(id);
  if (id === 'mangrove') assert.equal(cfg.props.riverLandings.length, 3,
    'generalizing the bank check cannot silently skip any original Mangrove landing');
  const controlCfg = { ...cfg, splat: { ...cfg.splat, shoreDirt: false } };
  const field = createHeightField(seed, cfg), control = createHeightField(seed, controlCfg);
  const old = bake(control, controlCfg), current = bake(field, cfg);
  try {
    checkTexture(current, size); checkTexture(old, size);
    verifyPreserved(bytes(old), bytes(current));
    if (id === 'mangrove' && seed === 1337 && size === 512) {
      const historical = bake(originalRoadField(controlCfg), controlCfg);
      try { assert.equal(hash(bytes(historical)), ORIGINAL.mangrove, 'immutable pre-completion Mangrove RGBA'); }
      finally { historical.dispose(); }
    }
    checkProtected(field, control, current, old, cfg);
    const dryAreaM2 = checkRealMaskOracle(bytes(old), bytes(current), size);
    assert.throws(() => checkRealMaskOracle(bytes(old), bytes(old), size), /materially wider/,
      'omitting the bank pass must fail the same real-mask coverage oracle');
    console.log(JSON.stringify({ id, seed, size, dryAreaM2, addedConstructionMedianMs: +benchmark(bytes(old), size).toFixed(3) }));
  } finally { old.dispose(); current.dispose(); }
}

function historicalOasis(cfg) {
  return historicalShorelineConfig(cfg);
}

function verifyOasisChannels(before, after) {
  let waterChanges = 0;
  for (let i = 0; i < before.length; i++) {
    if (i % 4 !== 2) assert.equal(after[i], before[i], 'Oasis road/rut/village-soil bytes stay exact');
    else if (before[i] !== after[i]) waterChanges++;
  }
  assert.equal(waterChanges, 2663, 'only the authored Oasis water footprint changes');
}

function checkOasis() {
  const cfg = getMapConfig('oasis'), historical = historicalOasis(cfg);
  const original = bake(originalRoadField(historical), historical);
  const current = bake(originalRoadField(cfg), cfg);
  try {
    checkTexture(current, 512);
    assert.equal(hash(bytes(original)), ORIGINAL.oasis, 'preserve the original three-cell RGBA oracle');
    assert.equal(hash(bytes(current)), 'eb79944edf401cc18052d161578f887aa65ff700f682d76ff161f94d477633fb',
      'reviewed authored asymmetric Oasis contour, not a replacement historical baseline');
    verifyOasisChannels(bytes(original), bytes(current));
    const roadMutation = bytes(current).slice(); roadMutation[0] ^= 1;
    assert.throws(() => verifyOasisChannels(bytes(original), roadMutation), /road\/rut\/village-soil/);
    const waterMutation = bytes(current).slice(); waterMutation[2] ^= 1;
    assert.throws(() => verifyOasisChannels(bytes(original), waterMutation), /water footprint/);
  } finally { original.dispose(); current.dispose(); }
  // The immutable contour hashes above predate completed roads. Exercise the
  // real current road network separately, retaining the same water-only
  // coverage count and protected-channel assertions, not a refreshed golden.
  const liveOriginal = bake(createHeightField(1337, historical), historical);
  const liveCurrent = bake(createHeightField(1337, cfg), cfg);
  try { verifyOasisChannels(bytes(liveOriginal), bytes(liveCurrent)); }
  finally { liveOriginal.dispose(); liveCurrent.dispose(); }
}

function checkCurrentUnrequestedShore(id, size) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  assert.equal(cfg.splat.shoreDirt, undefined, `${id}: no current bank-soil opt-in`);
  const current = bake(field, cfg), disabled = bake(field, cfg, false);
  try {
    checkTexture(current, size); checkTexture(disabled, size);
    assert.deepEqual(bytes(current), bytes(disabled), `${id}: current terrain receives no unrequested bank soil`);
    if (size === 512) assert.notEqual(hash(bytes(current)), ORIGINAL[id],
      `${id}: current authored roads remain distinct from historical input`);
  } finally { current.dispose(); disabled.dispose(); }
}

if (process.argv.includes('--oasis-only')) {
  checkOasis();
  console.log('shoreDirtMask.selftest: Oasis historical RGBA, current water-only footprint and mutation guards passed');
  process.exit(0);
}

checkEmptyAndInvalid();
for (const step of [2, 4]) {
  checkMetric(step);
  for (let angle = 0; angle < 180; angle += 15) checkContinuousBorder(step, angle * Math.PI / 180);
}
assert.deepEqual(Object.keys(ORIGINAL).sort(), [...MAP_IDS].sort());
for (const id of MAP_IDS) {
  if (id === 'mangrove') continue;
  const cfg = getMapConfig(id);
  assert.equal(!!cfg.splat?.shoreDirt, id === 'polders', `${id}: only the published Polders opt-in joins Mangrove`);
  // Harvest/activity wear has its own current controls. Keep this pre-bank
  // baseline byte-exact with later stamps off and original village paint on.
  let control = cfg.terrain?.workedGround
    ? { ...cfg, terrain: { ...cfg.terrain, workedGround: [], villageWear: undefined } } : cfg;
  // The later Oasis contour intentionally changes water only; keep its exact
  // old input behind the immutable pre-shore-pass hash and test current below.
  if (id === 'oasis') control = historicalOasis(control);
  // 37271a90b / 56924f7bf changed Polders drainage, pads, field patch and
  // opt-in bank soil. Preserve its original input/golden, not a new digest.
  if (id === 'polders') control = historicalShorelineConfig(control);
  // The original Reservoir mask predates c8476fa77's intentionally moved
  // roads/assembly apron. The exact old input still reproduces ORIGINAL.
  if (id === 'reservoir') control = historicalReservoirConfig(control);
  if (id === 'badlands') control = historicalBadlandsInput(control);
  const texture = bake(originalRoadField(control), control);
  try { assert.equal(hash(bytes(texture)), ORIGINAL[id], `${id}: full original RGBA byte control`); }
  finally { texture.dispose(); }
}
// Keep current Reservoir covered too: without an opt-in, the shore pass must
// be byte-inert even on its new hardstand/road layout. Historical and current
// layouts must not accidentally collapse back into the same fixture.
for (const id of ['reservoir', 'badlands']) checkCurrentUnrequestedShore(id, 512);
checkOasis();
for (const id of ['mangrove', 'polders']) for (const seed of [1337, 2049, 4093]) checkShoreMap(id, seed, 512);
const savedWindow = globalThis.window;
try {
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  resolveDeviceTier();
  checkCurrentUnrequestedShore('badlands', 256);
  for (const id of ['mangrove', 'polders']) for (const seed of [1337, 2049, 4093]) checkShoreMap(id, seed, 256);
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
// Historical full shader: d470ffa221c1ed9617c7794f0734932fb904beb1e204e1af6a10d1f415e14713.
// Later world-chart/shore/worn-blend changes have separate current behavior
// gates. Keep the immutable RGBA receipts above and test their actual consumer.
assertTerrainMaskShaderContract(source);
assert.match(source, /S\.shoreDirt \? \(S\.seaRamp\?\.\[0\] \?\? 0\.40\) : null/);
assert.match(source, /stampShoreDirtMask\(px, dist, s, MAP_SIZE, shoreDirtStart\)/, 'production passes the original road scratch, not a new buffer');
console.log('shoreDirtMask.selftest: 29 immutable historical map controls, twelve current Mangrove/Polders masks, RGB/physics/roads/landings and metric budget checks passed');
