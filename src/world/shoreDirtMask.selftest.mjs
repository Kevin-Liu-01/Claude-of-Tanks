import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ClampToEdgeWrapping, LinearMipmapLinearFilter, NoColorSpace } from 'three';
import { stampShoreDirtMask } from './shoreDirtMask.ts';
import { createHeightField, makeMaskTexture, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { planRiverLanding } from './maps/riverLandings.ts';
import { assertTerrainMaskShaderContract } from './terrainMaskShaderTestOracle.mjs';

// 2026-10-01 (frozen pins retired): the 31 full-RGBA "original" mask digests (baked on historical road, shoreline,
// Reservoir, Badlands and Oasis inputs through a historical terrain module), the Oasis contour digests and its
// water-only change count were change detectors of past outputs. What stays is live: the transform's metric and
// border math, the bank pass on the opted-in maps against the same terrain with the pass disabled (protected roads,
// spawns, landmarks, landings and the exact nearest-seed oracle), and the pass byte-inert on every other battlefield.
// 2026-10-03 (maps lane B, gauntlet wave 28): Amberford's river takes the earthy bank too ("a jagged band with a pale
// cyan rim": mud and gravel along its waterline)
const SHORE_DIRT_MAPS = ['autumn', 'polders', 'mangrove']; // registry order
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
  // (a road on a bridge deck crosses over the river's own water: Amberford's coach road at its stone bridge)
  const onDeck = (x, z) => (field.bridgeDecks ?? []).some((deck) => {
    const dx = x - deck.x, dz = z - deck.z;
    return Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength && Math.abs(dx * deck.uz - dz * deck.ux) <= 18;
  });
  for (const road of field._layout.roads) for (const [x, z] of road) {
    assert.deepEqual(fieldValues(field, x, z), fieldValues(control, x, z));
    if (!onDeck(x, z)) assert.equal(field.getWaterMaskAt(x, z), 0, 'causeway/road centre stays dry');
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
function exactSeedDistance(before, size, x, z, threshold) {
  const step = 1024 / size, radius = Math.ceil(10 / step);
  let exact = Infinity;
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= size || zz >= size) continue;
    if (before[(zz * size + xx) * 4 + 2] >= threshold) exact = Math.min(exact, Math.hypot(dx, dz) * step);
  }
  return exact;
}
// threshold: the stamp's seed byte, ceil(waterStart * 255) — 31 for the 0.12 water onset, 26 for Amberford's 0.10
function checkRealMaskOracle(before, after, size, threshold) {
  const step = 1024 / size;
  let changedDry = 0, checked = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i + 2] !== 0 || after[i + 3] <= before[i + 3] + 32) continue;
    changedDry++;
    if (changedDry % 19 !== 0) continue;
    const x = (i / 4) % size, z = Math.floor(i / 4 / size);
    const exact = exactSeedDistance(before, size, x, z, threshold);
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
    checkProtected(field, control, current, old, cfg);
    const threshold = Math.ceil(cfg.splat.seaRamp[0] * 255);
    const dryAreaM2 = checkRealMaskOracle(bytes(old), bytes(current), size, threshold);
    assert.throws(() => checkRealMaskOracle(bytes(old), bytes(old), size, threshold), /materially wider/,
      'omitting the bank pass must fail the same real-mask coverage oracle');
    console.log(JSON.stringify({ id, seed, size, dryAreaM2, addedConstructionMedianMs: +benchmark(bytes(old), size).toFixed(3) }));
  } finally { old.dispose(); current.dispose(); }
}

function checkCurrentUnrequestedShore(id, size) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  assert.equal(cfg.splat?.shoreDirt, undefined, `${id}: no current bank-soil opt-in`);
  const current = bake(field, cfg), disabled = bake(field, cfg, false);
  try {
    checkTexture(current, size); checkTexture(disabled, size);
    assert.deepEqual(bytes(current), bytes(disabled), `${id}: current terrain receives no unrequested bank soil`);
  } finally { current.dispose(); disabled.dispose(); }
}

checkEmptyAndInvalid();
for (const step of [2, 4]) {
  checkMetric(step);
  for (let angle = 0; angle < 180; angle += 15) checkContinuousBorder(step, angle * Math.PI / 180);
}
assert.deepEqual(MAP_IDS.filter(id => getMapConfig(id).splat?.shoreDirt), SHORE_DIRT_MAPS,
  'bank soil stays opt-in: only the published Amberford, Mangrove and Polders opt in');
const unrequestedMaps = MAP_IDS.filter(id => !SHORE_DIRT_MAPS.includes(id));
for (const id of unrequestedMaps) checkCurrentUnrequestedShore(id, 512);
for (const id of SHORE_DIRT_MAPS) for (const seed of [1337, 2049, 4093]) checkShoreMap(id, seed, 512);
const savedWindow = globalThis.window;
try {
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  resolveDeviceTier();
  checkCurrentUnrequestedShore('badlands', 256);
  for (const id of SHORE_DIRT_MAPS) for (const seed of [1337, 2049, 4093]) checkShoreMap(id, seed, 256);
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assertTerrainMaskShaderContract(source);
assert.match(source, /S\.shoreDirt \? \(S\.seaRamp\?\.\[0\] \?\? 0\.40\) : null/);
assert.match(source, /stampShoreDirtMask\(px, dist, s, MAP_SIZE, shoreDirtStart\)/, 'production passes the original road scratch, not a new buffer');
console.log(`shoreDirtMask.selftest: ${unrequestedMaps.length} battlefields byte-inert without an opt-in, eighteen current Amberford/Mangrove/Polders masks, RGB/physics/roads/landings and metric budget checks passed`);
