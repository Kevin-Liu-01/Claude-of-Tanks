import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField, makeMaskTexture, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { historicalPaletteConfig } from './shorelineHistoryTestOracle.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? String(item) : item);
const pilots = ['coastal', 'saltwind'];
// Immutable full-output receipts from clean2c9d47d55; its src/world Git tree
// is identical to this candidate's requested parent c97e20fd2. The external
// frozen-mask-receipt records all60 individual mask hashes and source hashes.
// No external worktree or Git history is needed to execute this committed gate.
const FROZEN = {
  other28: { desktop: '8a736042aace42ae3ae8392269e61f2bd767092fe883bf8f4951ad1a7a885a2d', mobile: '769d9ff90c901a177bf621437509bd3834be6f5a8b97453b4996a2a10efed473' },
  pilotMasks: {
    coastal: { 512: 'bb9240a06aa476e52d3b3076d0d6593831e3f17dd7b705597061432cf63658db', 256: 'fc52e42dc005b16377c6a97d25c5692e3cdb0fe09e5c0a26fd58c6302e392a8f' },
    saltwind: { 512: 'f7bc39468c8e06f07a6d876f30d5f509313756aee895260df11dfec0590cd779', 256: '9ef3a3753953ca4308331126c7c2915a7e8b5e08f1a2771614db2258058209ae' },
  },
  configs: '1e2782ff93df30c67766053893fbef56fdd676912b43a0e386aad102eaa820f1',
};
const beforeConfigs = stringify(MAP_IDS.map(getMapConfig));

// Authenticated Autumn blobs at 1beb0c780 / published 17d999a92:
// f05d9e1bd16f4b1ccde15756189c5fc7ee2e3dc5 -> 4aacb9c5f4ab059da2662cde186bcaede19a99f2.
// Only vegetation.palettes changed. This independent static fixture preserves
// native Node TypeScript-stripped function spacing; its strings are never run.
// Substitute it ONLY in the historical config digest, never in mask inputs.
const historicalAutumnPalettes = {
  oak: {
    texTone: '(h        , s        , l        ) => [clamp01(0.055 + (h - 0.22) * 0.25), clamp01(s * 1.02 + 0.10), clamp01(l * 1.02)]',
    cardHue: 0.058, cardSat: 0.52, cardL0: 0.3,
    canopy: { hue: 0.06, sat: 0.42, l0: 0.27, l1: 0.39 },
    jitterHue: 0.85,
  },
  birch: {
    texTone: '(h        , s        , l        ) => [0.105, clamp01(s * 0.55 + 0.22), clamp01(l * 0.92 + 0.10)]',
    cardHue: 0.105, cardSat: 0.55, cardL0: 0.42,
    canopy: { hue: 0.11, sat: 0.5, l0: 0.36, l1: 0.52 },
    jitterHue: 0.6,
  },
};
assert.equal(hash(stringify(historicalAutumnPalettes)),
  '31bdbf450402c2c0e54f8cbb8c45a14619c35bddb9d56acd10e2ef7d3e06973e',
  'authenticated predecessor Autumn palette serialization remains exact');
function verifyCurrentAutumnPalette(config) {
  assert.equal(hash(stringify(config.vegetation?.palettes ?? null)),
    'abb772abb6b3f67077b2a86d2cd7930a121b796fd6a6b2af9678f5dacdeb53b3',
    'current Autumn palette remains the exact published seasonal selection');
}
function historicalAutumnPaletteInput(config) {
  if (config.id !== 'autumn') return config;
  return { ...config, vegetation: { ...config.vegetation, palettes: historicalAutumnPalettes } };
}

function originalConfig(cfg) {
  if (pilots.includes(cfg.id)) {
    const { villageWear: _mode, workedGround: _patches, ...terrain } = cfg.terrain;
    return { ...cfg, terrain };
  }
  // Published prop-only inputs postdate this immutable terrain receipt:
  // 0823acd74 (Ironworks palette), 3bfd72f90 (two crop identities). Their
  // exact current values are independently guarded below. Preserve the old
  // digest and EVERY other field instead of refreshing it to today's output.
  if (cfg.id === 'foundry') {
    const { sourcedPalette: _laterPalette, ...props } = cfg.props;
    return { ...cfg, props };
  }
  if (cfg.id === 'autumn' || cfg.id === 'delta') {
    const { cropForm: _laterCrop, ...props } = cfg.props;
    return { ...cfg, props };
  }
  return cfg;
}
function checkScope(resolve) {
  verifyCurrentAutumnPalette(resolve('autumn'));
  assert.equal(resolve('foundry').props.sourcedPalette, 'ironworks');
  assert.equal(resolve('autumn').props.cropForm, 'harvest');
  assert.equal(resolve('delta').props.cropForm, 'wet-upright');
  assert.deepEqual(MAP_IDS.filter(id => resolve(id).terrain.villageWear !== undefined), pilots);
  for (const id of pilots) {
    assert.equal(resolve(id).terrain.villageWear, 'activity-patches');
    assert.equal(resolve(id).terrain.workedGround.length, 4);
  }
  assert.equal(hash(stringify(MAP_IDS.map(id => historicalAutumnPaletteInput(originalConfig(resolve(id)))))), FROZEN.configs,
    'only the two visual terrain properties differ from the exact parent inputs');
}

function bake(cfg, seed) {
  const field = createHeightField(seed, cfg), splat = cfg.splat ?? {};
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
function protectedChannels(before, after) {
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i += 4) {
    for (let c = 0; c < 3; c++) assert.equal(after[i + c], before[i + c], 'road/rut/water channel is exact');
    if (before[i] || before[i + 2]) assert.equal(after[i + 3], before[i + 3], 'protected road/water alpha is exact too');
  }
}
function extent(patch) {
  const xs = patch.boundary.map(p => p[0]), zs = patch.boundary.map(p => p[1]), reach = patch.feather + 3;
  return [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
}
function activityCoverage(before, after, size, patches) {
  const bounds = patches.map(extent), texel = 1024 / size;
  let oldArea = 0, newArea = 0, erased = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] || before[i + 2]) continue;
    if (before[i + 3]) oldArea += texel ** 2;
    if (before[i + 3] && !after[i + 3]) erased += texel ** 2;
    if (!after[i + 3]) continue;
    newArea += texel ** 2;
    const col = i / 4 % size, row = Math.floor(i / 4 / size);
    const x = (col + .5) * texel - 512, z = (row + .5) * texel - 512;
    assert.ok(bounds.some(b => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]),
      'remaining off-road wear stays inside authored activity support');
  }
  assert.ok(newArea > 1500 && newArea < oldArea * .45, 'real activity soil remains while most blanket village wear is removed');
  assert.ok(erased > oldArea * .5, 'clearings replace the generic village rectangle');
  return { oldArea, newArea, erased };
}

// Actual seed1337 scene-manifest stall centers, not points generated by the
// new polygons. Current road crossings resolve to(163.766,95.656)/(-190,-36).
const activityPoints = {
  coastal: [[154.163, 82.882], [153.264, 103.976], [155, -62], [97, -64]],
  saltwind: [[-199.496, -42.573], [-184.043, -47.939], [-190, -80], [-130, -90], [-264.885, -21.707]],
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
}
function compareTexture(before, after) {
  assert.equal(after.image.data.byteLength, before.image.data.byteLength);
  assert.equal(after.image.width, before.image.width); assert.equal(after.image.height, before.image.height);
  for (const key of ['format','type','colorSpace','flipY','wrapS','wrapT','minFilter','magFilter','generateMipmaps','anisotropy']) {
    assert.equal(after[key], before[key], `same existing mask resource policy: ${key}`);
  }
}
function checkPilot(id, seed) {
  const cfg = getMapConfig(id), original = bake(originalConfig(cfg), seed), current = bake(cfg, seed);
  try {
    compareTexture(original.texture, current.texture);
    assert.equal(current.draws, original.draws, 'identical caller RNG draw count');
    assert.deepEqual(current.rngTail, original.rngTail, 'identical caller RNG tail');
    protectedChannels(original.pixels, current.pixels);
    const coverage = activityCoverage(original.pixels, current.pixels, current.size, cfg.terrain.workedGround);
    checkActivityPoints(id, current.pixels, current.size);
    compareFields(original.field, current.field);
    if (seed === 1337) {
      assert.equal(hash(original.pixels), FROZEN.pilotMasks[id][current.size], 'original coverage reproduces the authenticated parent mask');
      const repeated = bake(cfg, seed);
      try { assert.deepEqual(repeated.pixels, current.pixels, 'same input produces byte-exact activity coverage'); }
      finally { repeated.texture.dispose(); }
      assert.throws(() => activityCoverage(original.pixels, original.pixels, current.size, cfg.terrain.workedGround),
        'restoring the rejected blanket rectangle must fail');
      assert.throws(() => activityCoverage(original.pixels, new Uint8Array(current.pixels.length), current.size, cfg.terrain.workedGround),
        'removing all activity soil must fail');
      const shifted = cfg.terrain.workedGround.map(p => ({ ...p, boundary: p.boundary.map(([x,z]) => [x + 350,z]) }));
      assert.throws(() => activityCoverage(original.pixels, current.pixels, current.size, shifted), 'unrelated relocated polygons fail the geographic check');
      const corrupt = current.pixels.slice(); corrupt[0] ^= 1;
      assert.throws(() => protectedChannels(original.pixels, corrupt), /road\/rut\/water channel/);
    }
    return { id, seed, size: current.size, bytes: current.pixels.byteLength, ...coverage, hash: hash(current.pixels) };
  } finally { original.texture.dispose(); current.texture.dispose(); }
}

function checkOtherMaps(tier) {
  const results = [];
  for (const id of MAP_IDS) {
    if (pilots.includes(id)) continue;
    const built = bake(getMapConfig(id), 1337);
    assert.equal(built.size, tier === 'desktop' ? 512 : 256, 'actual tier-scaled raster, not a relabeled desktop bake');
    results.push([id, hash(built.pixels)]); built.texture.dispose();
  }
  assert.equal(hash(JSON.stringify(results)), FROZEN.other28[tier], `all28 ${tier} full RGBA outputs retain the authenticated parent receipt`);
}

checkScope(getMapConfig);
const autumn = getMapConfig('autumn');
const changedAutumnPalettes = { ...autumn.vegetation.palettes,
  oak: { ...autumn.vegetation.palettes.oak, cardSat: 0.9 } };
assert.equal(stringify(historicalAutumnPaletteInput({ ...autumn,
  vegetation: { ...autumn.vegetation, palettes: changedAutumnPalettes } })),
stringify(historicalAutumnPaletteInput(autumn)),
'negative control proves historical projection alone would conceal current Autumn palette corruption');
for (const palettes of [undefined, changedAutumnPalettes, {
  ...autumn.vegetation.palettes,
  oak: { ...autumn.vegetation.palettes.oak, texTone: () => [0, 0, 0] },
}]) assert.throws(() => checkScope(id => id === 'autumn'
  ? { ...autumn, vegetation: { ...autumn.vegetation, palettes } } : getMapConfig(id)),
/current Autumn palette/, 'missing, numeric and functional palette changes remain independently guarded');
for (const changed of [
  { ...autumn, vegetation: { ...autumn.vegetation, grassTexTone: () => [0, 0, 0] } },
  { ...autumn, terrain: { ...autumn.terrain, hillScale: -1 } },
]) assert.throws(() => checkScope(id => id === 'autumn' ? changed : getMapConfig(id)),
/only the two visual terrain properties/, 'unrelated Autumn siblings remain inside the immutable config digest');
for (const [id, key] of [['foundry', 'sourcedPalette'], ['autumn', 'cropForm'], ['delta', 'cropForm']]) {
  assert.throws(() => checkScope(current => current === id
    ? { ...getMapConfig(current), props: { ...getMapConfig(current).props, [key]: 'invalid' } } : getMapConfig(current)),
  'historical projection must not hide a changed current prop input');
}
assert.throws(() => checkScope(id => id === 'desert'
  ? { ...getMapConfig(id), terrain: { ...getMapConfig(id).terrain, villageWear: 'activity-patches' } } : getMapConfig(id)));
const coastal = getMapConfig('coastal');
const mutated = { ...coastal, terrain: { ...coastal.terrain, villageWear: undefined } };
assert.equal(stringify(historicalPaletteConfig(mutated)), stringify(historicalPaletteConfig(coastal)),
  'historical projection intentionally hides the new setting; current scope must guard it independently');
assert.throws(() => checkScope(id => id === 'coastal' ? mutated : getMapConfig(id)));
const savedWindow = globalThis.window, receipts = [];
try {
  for (const tier of ['desktop','mobile']) {
    globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem: () => null } };
    if (tier === 'mobile') assert.equal(resolveDeviceTier(), 'mobile');
    assert.equal(getDeviceTier(), tier);
    checkOtherMaps(tier);
    for (const id of pilots) for (const seed of [1337,2025,7719]) receipts.push(checkPilot(id,seed));
  }
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
assert.equal(stringify(MAP_IDS.map(getMapConfig)), beforeConfigs, 'no live config mutation');
console.log(JSON.stringify({ test: 'villageWear', scope: 'full CPU masks; no native art/performance acceptance', receipts }));
