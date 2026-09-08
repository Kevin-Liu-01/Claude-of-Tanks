import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ClampToEdgeWrapping, LinearMipmapLinearFilter, NoColorSpace } from 'three';
import { stampShoreDirtMask } from './shoreDirtMask.ts';
import { createHeightField, makeMaskTexture, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { planRiverLanding } from './maps/riverLandings.ts';

// Captured BEFORE adding the shore pass, from normal production imports:
// createHeightField(1337) -> makeMaskTexture(noise seed3010), desktop512.
// These are immutable full RGBA controls, not a second copy of the new helper.
const ORIGINAL = {
  verdant: '98c2b40339eb887868ed95b826cc828ad600e9e2639282984a9570d711a21d02',
  desert: '065ed1a1c9ef2e4fbe0ba2cafa3115d717bd0a5c0a2f741f2edc4e8bb2f4bb7d',
  winter: '3835d073c99b38594acf66bd15ecae58479122ec9f892854cc37ed771aa2972b',
  urban: '32f8689f8eb21873d6b0f89349fe2805c476e934e140815515741ea45d0eaa72',
  coastal: 'bb9240a06aa476e52d3b3076d0d6593831e3f17dd7b705597061432cf63658db',
  autumn: '5ef6a685fa62d87de081b5e71024e771a38fde4d6a403c8033bd2ca5c67da7fd',
  steppe: '02cccd4fb80741b3055a2b3dc65baa2aea37cc3b2ae7a231167d896bd3688a37',
  railyard: 'dab943ee202bb49503c3582803804904c42bedba4bfe5b69df3024464a4ef77d',
  frontier: '99ab5d4bf6ff084a658348e622d10540cf3eb11f15e6c0d910a0e047d50a8e3c',
  fjord: '6555483e9c6b693b29307e82b923d2f26e3a4d0177aefe7c26c5e7b8134fb973',
  delta: '85b74af8f43dda5d4150be9b0e1672799f4b516b9145727ac990205535a47818',
  badlands: '2114a2b786d6c388a40fa6e1ea675e685a3f9222b16bfc1774d9958f71261f38',
  monsoon: 'ea9aaf3b3b7e39bfdcc73f68a6112137ff6e39c6e6a5d72708cd6367e5519118',
  alpine: '6af1e1df28ac3b3e3bd2b025ba1cc9d17da0ea8b4052a164940a6ffdc3aa7ce4',
  caldera: '3e8b3a423c374ac8589252be35766741b660bdb1def632da8dacae3499962f41',
  foundry: 'fc4f0faa9adb3e1a0c3b8eacb3a79d9716925f128f989f73cdcac13569d13f54',
  ruinspires: '5a567d02679868082c1b30dd62fc54062dd95132f30a72e2ff15dbfc873caa87',
  blackglass: '230b74c4cb3e4effd164c8ba71bf0f3cfb673089896ce1fb88346bcbe0e87265',
  titan_gorge: 'fd5d6d7ade8d26e046ebfad3d57badc69fd0c3855739c715aadcdbeab9883f4b',
  skybridge: '61841918b4e6106b14150d85e526d3c034ecb90b22834fa19d6ed97301f72dcc',
  polders: '5bd72c0d36d445fa7eceb8422f7ab3d4c469be21437673d57c4c1dcc87f627f2',
  copper_mesa: '1acbbb0fc5591845668e4edf104c98648d3f5931d0dfd874333c9aae49e685f8',
  airfield: '59115f66aca0f81e9d6671f300571a66aeb4064545610b0e0324fb61b701d7f1',
  oasis: '6427b922d377475a6a63408a3fb818c854b2cd3694e4386e95e3a04725ee311b',
  whiteout: 'd8e2fea48fe2290ea64cc30e67d65999dd7edadd36c1e6cd1a409ca1a0dd5c99',
  orchard: '1805ab06bae8e05559ae6338bbe4f1e5e54bfd77af2f6a8cc6b72d7c120d66ff',
  longleaf: '6a9160c1524c81c58d138e94963e6c3dc16773cf3c1febfc423db087ff839ca0',
  mangrove: '67c7cb5a06f127fc0663613a7ca61c91f75576a1f6ce85ce1e43cf12c2c42826',
  saltwind: 'f7bc39468c8e06f07a6d876f30d5f509313756aee895260df11dfec0590cd779',
  reservoir: '949dbe854e6c28fc28155f947ddd464f3aa28edf6194408cc06bc6c0509cabe1',
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
  for (const anchor of cfg.props.riverLandings) {
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
function checkMangrove(seed, size) {
  const cfg = getMapConfig('mangrove');
  const controlCfg = { ...cfg, splat: { ...cfg.splat, shoreDirt: false } };
  const field = createHeightField(seed, cfg), control = createHeightField(seed, controlCfg);
  const old = bake(control, controlCfg), current = bake(field, cfg);
  try {
    checkTexture(current, size); checkTexture(old, size);
    verifyPreserved(bytes(old), bytes(current));
    if (seed === 1337 && size === 512) assert.equal(hash(bytes(old)), ORIGINAL.mangrove);
    checkProtected(field, control, current, old, cfg);
    const dryAreaM2 = checkRealMaskOracle(bytes(old), bytes(current), size);
    console.log(JSON.stringify({ seed, size, dryAreaM2, addedConstructionMedianMs: +benchmark(bytes(old), size).toFixed(3) }));
  } finally { old.dispose(); current.dispose(); }
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
  assert.ok(!cfg.splat?.shoreDirt, `${id}: bank pass is opt-in only`);
  // Independent authored harvest wear has its own immutable Longleaf control.
  // Keep this pre-bank baseline byte-exact with both later opt-in stamps off.
  const control = cfg.terrain?.workedGround
    ? { ...cfg, terrain: { ...cfg.terrain, workedGround: [] } } : cfg;
  const texture = bake(createHeightField(1337, control), control);
  try { assert.equal(hash(bytes(texture)), ORIGINAL[id], `${id}: full original RGBA byte control`); }
  finally { texture.dispose(); }
}
for (const seed of [1337, 2049, 4093]) checkMangrove(seed, 512);
const savedWindow = globalThis.window;
try {
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  resolveDeviceTier();
  for (const seed of [1337, 2049, 4093]) checkMangrove(seed, 256);
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.equal(hash(source.slice(source.indexOf('const SPLAT_COMMON_FRAG'), source.indexOf('function* createSplatMaterialSteps'))),
  'd470ffa221c1ed9617c7794f0734932fb904beb1e204e1af6a10d1f415e14713', 'complete splat shader is byte-identical');
assert.match(source, /S\.shoreDirt \? \(S\.seaRamp\?\.\[0\] \?\? 0\.40\) : null/);
assert.match(source, /stampShoreDirtMask\(px, dist, s, MAP_SIZE, shoreDirtStart\)/, 'production passes the original road scratch, not a new buffer');
console.log('shoreDirtMask.selftest: 29 immutable map controls, six real Mangrove masks, RGB/physics/roads/landings and metric budget checks passed');
