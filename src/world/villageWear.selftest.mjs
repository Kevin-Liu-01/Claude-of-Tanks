import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField, makeMaskTexture, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { createHardstandPaintCover } from './hardstandSurface.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? String(item) : item);
const pilots = ['coastal', 'saltwind'];
// map revival lane 2 (2026-10-05): Aegis Crossing takes the activity mode off the gorge its village rect spans
const activityMaps = ['coastal', 'foundry', 'saltwind', 'cliffbridge'];
// ground lane (the farmland, 2026-10-04): Verdant lays its village's ground out as plots (terrain.villageWear 'plots') —
// the terrain material's mask alone, no CPU twin, grading, collision or grass input reads it; the map-revival lane:
// Orchard Valley's walled yards and threshing floors (2026-10-05)
const plotMaps = ['verdant', 'orchard'];
// 2026-10-01 (frozen pins retired): the all28 parent mask digests (desktop/mobile, baked on historical road, shoreline,
// exit, Badlands and Foundry inputs), the archived pilot masks, the parent config digest and the literal Alpine/Autumn/
// Foundry config pins were change detectors of past outputs and authored data. Every comparison below is live: each
// activity map is baked against the same CURRENT config with only its activity-wear inputs removed.
const beforeConfigs = stringify(MAP_IDS.map(getMapConfig));
function wearDisabled(cfg) {
  // Pilots compare against the blanket village wear (no activity mode, no patches); Foundry compares against its
  // accepted court, INCLUDING all three polygons, with only the activity mode and the soil strength removed.
  if (cfg.id === 'foundry') {
    const { villageWear: _mode, ...terrain } = cfg.terrain;
    const { townWear: _strength, ...splat } = cfg.splat;
    return { ...cfg, terrain, splat };
  }
  const { villageWear: _mode, workedGround: _patches, ...terrain } = cfg.terrain;
  return { ...cfg, terrain };
}
function checkScope(resolve) {
  assert.deepEqual(MAP_IDS.filter(id => resolve(id).terrain.villageWear === 'activity-patches'), activityMaps,
    'activity wear stays opt-in: only the four activity maps replace the blanket village apron');
  assert.deepEqual(MAP_IDS.filter(id => ![undefined, 'activity-patches'].includes(resolve(id).terrain.villageWear)), plotMaps,
    'the village plots stay opt-in: the plot maps alone, and no third mode');
  for (const id of plotMaps) assert.equal(resolve(id).terrain.villageWear, 'plots', `${id}: the village in plots`);
  for (const id of activityMaps) {
    assert.equal(resolve(id).terrain.villageWear, 'activity-patches', `${id}: activity-patch wear mode`);
    assert.ok(resolve(id).terrain.workedGround?.length > 0, `${id}: authored activity footprints`);
  }
}

function bake(cfg, seed, constructor = createHeightField) {
  const field = constructor(seed, cfg), splat = cfg.splat ?? {};
  const raw = mulberry32(3010);
  let draws = 0;
  const random = () => { draws++; return raw(); };
  const texture = makeMaskTexture(new SimplexNoise({ random }), field._layout,
    selectTerrainLandformMask(splat, field._mesaW), field._waterWetnessAt,
    splat.shoreDirt ? (splat.seaRamp?.[0] ?? .4) : null);
  return { field, texture, pixels: texture.image.data, size: texture.image.width,
    draws, rngTail: [raw(),raw(),raw(),raw()] };
}
function at(size, x, z) {
  return (Math.floor((z + 512) * size / 1024) * size + Math.floor((x + 512) * size / 1024)) * 4;
}
// 2026-10-03 (the Ironworks redesign): a zone-control apron is stamped onto the road channel AFTER the wear pass
// (terrain.ts stampHardstandRoadMask), so an apron inside the village rectangle carries blanket wear in the comparison
// bake and none in activity mode, exactly as the dry ground it paves did. Its pixels are not protected road; every
// other road and water pixel keeps its exact alpha.
function protectedChannels(before, after, paved = () => false) {
  assert.equal(after.length, before.length);
  const size = Math.round(Math.sqrt(before.length / 4));
  for (let i = 0; i < before.length; i += 4) {
    for (let c = 0; c < 3; c++) assert.equal(after[i + c], before[i + c], 'road/rut/water channel is exact');
    if ((before[i] || before[i + 2]) && !paved(((i / 4) % size + .5) * 1024 / size - 512,
      (Math.floor(i / 4 / size) + .5) * 1024 / size - 512)) {
      assert.equal(after[i + 3], before[i + 3], 'protected road/water alpha is exact too');
    }
  }
}
function extent(patch) {
  const xs = patch.boundary.map(p => p[0]), zs = patch.boundary.map(p => p[1]), reach = patch.feather + 3;
  return [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
}
function activityCoverage(before, after, size, patches) {
  const bounds = patches.map(extent), texel = 1024 / size;
  let oldArea = 0, newArea = 0, erased = 0, alphaSum = 0, coreArea = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] || before[i + 2]) continue;
    if (before[i + 3]) oldArea += texel ** 2;
    if (before[i + 3] && !after[i + 3]) erased += texel ** 2;
    if (!after[i + 3]) continue;
    newArea += texel ** 2;
    alphaSum += after[i + 3] / 255 * texel ** 2;
    if (after[i + 3] >= 192) coreArea += texel ** 2;
    const col = i / 4 % size, row = Math.floor(i / 4 / size);
    const x = (col + .5) * texel - 512, z = (row + .5) * texel - 512;
    assert.ok(bounds.some(b => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]),
      'remaining off-road wear stays inside authored activity support');
  }
  assert.ok(newArea > 1500 && newArea < oldArea * .45, 'real activity soil remains while most blanket village wear is removed');
  assert.ok(erased > oldArea * .5, 'clearings replace the generic village rectangle');
  return { oldArea, newArea, erased, meanAlpha: alphaSum / newArea, coreArea };
}

// map revival lane 2 (2026-10-05, Aegis Crossing; gauntlet wave 108b): the activity mode there takes the blanket wear off
// the gorge the village rect spans (the ground reads a steep face under worn soil as an earthwork, so its walls were turf
// inside the rect), and the towns' and the gravel bed's worn ground comes back as three authored patches. The rule: no
// off-road wear on the gorge walls under the rect, the most of the blanket's area kept, every bit of it inside the patches.
function gorgeCoverage(before, after, size, patches) {
  const bounds = patches.map(extent), texel = 1024 / size;
  let oldArea = 0, newArea = 0, wallWear = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] || before[i + 2]) continue;
    if (before[i + 3]) oldArea += texel ** 2;
    if (!after[i + 3]) continue;
    newArea += texel ** 2;
    const col = i / 4 % size, row = Math.floor(i / 4 / size);
    const x = (col + .5) * texel - 512, z = (row + .5) * texel - 512;
    if (Math.abs(x) < 130 && Math.abs(z) > 58 && Math.abs(z) < 86) wallWear += texel ** 2;
    assert.ok(bounds.some(b => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]),
      'remaining off-road wear stays inside authored activity support');
  }
  assert.equal(wallWear, 0, 'the gorge walls under the village rect carry no worn soil');
  assert.ok(newArea > oldArea * .5, 'the towns and the gravel bed keep their worn ground');
  return { oldArea, newArea, wallWear };
}

// Retained seed1337 stall/landing centers plus explicitly authored turning
// courts and the redesigned market street. Removed loop/croft yards must not
// force obsolete bare soil back into the current layout.
const activityPoints = {
  coastal: [[154.163, 82.882], [153.264, 103.976], [155, -62], [262, -62], [266, 86]],
  saltwind: [[-199.496, -42.573], [-184.043, -47.939], [-140, -58], [-65, -54], [-264.885, -21.707]],
  // Inside the accepted loading court, southern approach and container lane.
  foundry: [[101, -110], [102, -146], [160, -104]],
  // the towns' ground beside each square and below them, both halves, and the gorge's gravel bed
  cliffbridge: [[-70, -205], [75, -150], [-85, -235], [-70, 205], [75, 150], [-60, 30], [80, -25]],
};
function checkActivityPoints(id, pixels, size) {
  for (const [x,z] of activityPoints[id]) assert.ok(pixels[at(size,x,z) + 3] > 30,
    `${id}: existing market/frontage ${x},${z} retains activity soil`);
}
function fieldPoint(field, x, z) {
  return [field.getHeightAt(x,z), ...field.getNormalAt(x,z).toArray(), field.getGroundType(x,z),
    field.getWaterMaskAt(x,z), field._roadDist(x,z), field._noVeg(x,z), field._villageMask(x,z)];
}
function compareFields(before, after) {
  for (let z = -480; z <= 480; z += 40) for (let x = -480; x <= 480; x += 40) {
    assert.deepEqual(fieldPoint(after,x,z), fieldPoint(before,x,z), 'grading, collision, traction and grass admission inputs remain exact');
  }
  assert.deepEqual(after._layout.spawns, before._layout.spawns, 'all deployment coordinates remain exact');
  for (const spawn of [before._layout.spawns.player, ...before._layout.spawns.enemies]) {
    for (const dx of [-24,0,24]) for (const dz of [-24,0,24]) {
      assert.deepEqual(fieldPoint(after,spawn.x+dx,spawn.z+dz), fieldPoint(before,spawn.x+dx,spawn.z+dz),
        'deployment height, slope, traction and exclusions remain exact');
    }
  }
}
function compareTexture(before, after) {
  assert.equal(after.image.data.byteLength, before.image.data.byteLength);
  assert.equal(after.image.width, before.image.width); assert.equal(after.image.height, before.image.height);
  for (const key of ['format','type','colorSpace','flipY','wrapS','wrapT','minFilter','magFilter','generateMipmaps','anisotropy']) {
    assert.equal(after[key], before[key], `same existing mask resource policy: ${key}`);
  }
}
function checkPilot(id, seed) {
  const cfg = getMapConfig(id);
  const original = bake(wearDisabled(cfg), seed), current = bake(cfg, seed);
  try {
    compareTexture(original.texture, current.texture);
    assert.equal(current.draws, original.draws, 'identical caller RNG draw count');
    assert.deepEqual(current.rngTail, original.rngTail, 'identical caller RNG tail');
    protectedChannels(original.pixels, current.pixels, createHardstandPaintCover(cfg.terrain.hardstands) ?? undefined);
    const coverageOf = id === 'cliffbridge' ? gorgeCoverage : activityCoverage;
    const coverage = coverageOf(original.pixels, current.pixels, current.size, cfg.terrain.workedGround);
    if (id === 'foundry') {
      assert.ok(coverage.newArea < 5000 && coverage.coreArea > 500,
        'Foundry retains substantial high-alpha soil inside a compact court, not a district apron');
      for (let z = -170; z <= -80; z += 2) for (let x = 78; x <= 180; x += 2) {
        assert.deepEqual(fieldPoint(current.field,x,z), fieldPoint(original.field,x,z),
          'dense court/access height, collision, road and grass-admission queries remain exact');
      }
    }
    checkActivityPoints(id, current.pixels, current.size);
    compareFields(original.field, current.field);
    if (seed === 1337) {
      const repeated = bake(cfg, seed);
      try { assert.deepEqual(repeated.pixels, current.pixels, 'same input produces byte-exact activity coverage'); }
      finally { repeated.texture.dispose(); }
      assert.throws(() => coverageOf(original.pixels, original.pixels, current.size, cfg.terrain.workedGround),
        'restoring the rejected blanket rectangle must fail');
      assert.throws(() => coverageOf(original.pixels, new Uint8Array(current.pixels.length), current.size, cfg.terrain.workedGround),
        'removing all activity soil must fail');
      const shifted = cfg.terrain.workedGround.map(p => ({ ...p, boundary: p.boundary.map(([x,z]) => [x + 350,z]) }));
      assert.throws(() => coverageOf(original.pixels, current.pixels, current.size, shifted), 'unrelated relocated polygons fail the geographic check');
      const corrupt = current.pixels.slice(); corrupt[0] ^= 1;
      assert.throws(() => protectedChannels(original.pixels, corrupt), /road\/rut\/water channel/);
    }
    return { id, seed, size: current.size, bytes: current.pixels.byteLength, ...coverage, hash: hash(current.pixels) };
  } finally { original.texture.dispose(); current.texture.dispose(); }
}

function checkCurrentBadlands(tier) {
  const cfg = getMapConfig('badlands');
  assert.equal(cfg.terrain.villageWear, undefined, 'current canyon retains original village-soil policy');
  assert.equal(cfg.terrain.workedGround, undefined, 'no unrequested canyon activity stamps');
  const current = bake(cfg, 1337);
  const disabled = bake({ ...cfg, terrain: { ...cfg.terrain, workedGround: [], villageWear: undefined } }, 1337);
  try {
    assert.equal(current.size, tier === 'desktop' ? 512 : 256);
    compareTexture(disabled.texture, current.texture);
    assert.deepEqual(current.pixels, disabled.pixels, 'current Badlands full RGBA is exact with activity wear disabled');
    assert.equal(current.draws, disabled.draws);
    assert.deepEqual(current.rngTail, disabled.rngTail);
    compareFields(disabled.field, current.field);
    return { id: 'badlands', size: current.size, bytes: current.pixels.byteLength, hash: hash(current.pixels) };
  } finally { current.texture.dispose(); disabled.texture.dispose(); }
}

checkScope(getMapConfig);
assert.throws(() => checkScope(id => id === 'desert'
  ? { ...getMapConfig(id), terrain: { ...getMapConfig(id).terrain, villageWear: 'activity-patches' } } : getMapConfig(id)),
  /opt-in/, 'a map outside the activity scope cannot silently opt in');
assert.throws(() => checkScope(id => id === 'desert'
  ? { ...getMapConfig(id), terrain: { ...getMapConfig(id).terrain, villageWear: 'plots' } } : getMapConfig(id)),
  /opt-in/, 'a map outside the plots scope cannot silently take them');
for (const id of activityMaps) {
  const config = getMapConfig(id);
  assert.throws(() => checkScope(key => key === id ? { ...config, terrain: { ...config.terrain, villageWear: undefined } }
    : getMapConfig(key)), /opt-in/, `${id}: dropping the activity mode fails the scope`);
}
const savedWindow = globalThis.window, receipts = [];
try {
  for (const tier of ['desktop','mobile']) {
    globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem: () => null } };
    if (tier === 'mobile') assert.equal(resolveDeviceTier(), 'mobile');
    assert.equal(getDeviceTier(), tier);
    receipts.push(checkCurrentBadlands(tier));
    for (const id of activityMaps) for (const seed of [1337,2025,7719]) receipts.push(checkPilot(id,seed));
  }
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
assert.equal(stringify(MAP_IDS.map(getMapConfig)), beforeConfigs, 'no live config mutation');
console.log(JSON.stringify({ test: 'villageWear', scope: 'full CPU masks; no native art/performance acceptance', receipts }));
