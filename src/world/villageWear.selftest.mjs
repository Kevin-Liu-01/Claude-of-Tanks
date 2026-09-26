import { historicalRoadHeightField } from './roadHistoryTestOracle.mjs';
import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';
import assert from 'node:assert/strict';
import { historicalMapPassDressingInput } from './mapPassDressing.test-support.mjs';
import { createHash } from 'node:crypto';
import { createHeightField, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { historicalMaskTexture as makeMaskTexture } from './roadRutHistoryTestOracle.mjs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { historicalPaletteConfig, historicalFoundryServiceInput, historicalBadlandsInput, historicalVistaGroundInput,
  historicalPlayableReliefInput } from './shorelineHistoryTestOracle.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? String(item) : item);
const pilots = ['coastal', 'saltwind'];
const activityMaps = ['coastal', 'foundry', 'saltwind'];
const foundryPatches = [
  { boundary: [[83,-116],[92,-129],[115,-128],[127,-115],[122,-98],[109,-90],[90,-93],[82,-104]], feather: 5, strength: 1 },
  { boundary: [[94,-126],[105,-126],[108,-143],[110,-160],[99,-162],[95,-146]], feather: 4, strength: 1 },
  { boundary: [[116,-96],[136,-98],[158,-111],[175,-110],[176,-100],[155,-100],[136,-88],[118,-87]], feather: 4, strength: 1 },
];
// Immutable full-output receipts from clean2c9d47d55; its src/world Git tree
// is identical to this candidate's requested parent c97e20fd2. The external
// frozen-mask-receipt records all60 individual mask hashes and source hashes.
// No external worktree or Git history is needed to execute this committed gate.
// road pass 2026-09-12: the mask G byte is now the road centreline distance
// field (terrain.ts paintRoadMask), so every full-RGBA golden below was
// re-pinned to the new bytes. R/B/A are produced by unchanged code; the
// channel-masked comparison against the previous painter is recorded in
// docs/history/research/map-pass-20260912.md (road pass section).
const FROZEN = {
  other28: { desktop: '42c9ec441aa9f609785ab579feb9220881153599bbac516b9e688150c68b95ad', mobile: 'd3f4010522c393c39f16870e60f6c1ee2956cc866ba9424c6a706d4e86d4b840' }, // 2026-09-24: Amberford authors the bridge crossing (round 61)
  pilotMasks: {
    coastal: { 512: '592e20a91d2388f1d96fd76e2b19d177cd83b095067b7a6fbdc448952d1bc4c9', 256: '11b9577888db144a3e0e029924d63d2bb0d616abc4baa940c71ba811262ae14c' },
    saltwind: { 512: 'f871a2739399ec256542bb9d5fbcc3ecfab144878b54883eb9e68a23a16091b2', 256: 'a031dfca24aece0ffd738fb6933b05124bb629d4fdccd9a98ea64b01c3f1a9d1' }, // 2026-09-24: Saltwind strand 20 m (round 52, owner decision 20)
  },
  // 2026-09-13 lighting: alpine/fjord/caldera/monsoon/delta/blackglass/foundry/mangrove sky presets
  // moved toward the 1049e4e key/fill ratio (graphics commit 471c7b709); repinned from the current build.
  // round 37 (2026-09-22): the desert sky's Rayleigh rose 0.55 → 0.85 (Oasis inherits it) — the desert / oasis config
  // digests move; every other map and every non-sky input is unchanged (repinned from the current build)
  // round 40 (2026-09-22): coastal.ts's sea aperture dropped its authored grey (edgeWater.ts gives it the map's water colour) and
  // saltwind.ts authored its bay as one contour; the frozen config digest moved for those two maps only
  configs: '297129d5e20e5d3f4ca48d4c7fc1e889a345ed980aa57d5e100744ea22334bee', // 2026-09-25 (round 70): whiteout.ts authors sourcedTint, a snowpack fallback law and postExposure 0.83 — the owner-approved snow re-grade (was 8698d0c7…: round 66, the eleven sea-sheet maps author an `ocean` block; 46963b38…: round 57, steppe.ts terrain block authors railSpurs; 7d872ab3…: round 55, fjord.ts horizon block authors outcrops: 1; 07c47806…: Frosthollow / Amberford / Tarkhan player pads moved, round-48 pacing landing)
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
  const palettes=config.vegetation?.palettes;
  // Published 99ea0b24f adds only these two atlas selections to Autumn blob
  // 4aacb9c5f -> 537e8c57d. Guard them separately, preserving every original
  // color/function field and the immutable seasonal palette fingerprint.
  assert.equal(palettes?.birch?.birchLeaves,true,'current Autumn palette keeps the published birch leaf atlas');
  assert.equal(palettes?.aspen?.birchLeaves,true,'current Autumn palette keeps the published aspen leaf atlas');
  const {birchLeaves:_birchAtlas,...birch}=palettes.birch;
  const {birchLeaves:_aspenAtlas,...aspen}=palettes.aspen;
  assert.equal(hash(stringify({...palettes,birch,aspen})),
    'abb772abb6b3f67077b2a86d2cd7930a121b796fd6a6b2af9678f5dacdeb53b3',
    'current Autumn palette remains the exact published seasonal selection');
}
function historicalAutumnPaletteInput(config) {
  if (config.id !== 'autumn') return config;
  return { ...config, vegetation: { ...config.vegetation, palettes: historicalAutumnPalettes } };
}

function historicalAlpineHorizonInput(cfg) {
  if (cfg.id !== 'alpine') return cfg;
  // 2026-09-11 restored the 1049e4e Alpine horizon bands (treeline 0.64 ->
  // 0.80, snowline 0.42 -> 0.72). Horizon bands never feed terrain wear; the
  // live values are guarded in checkScope and only these two leaves are
  // projected back for the immutable parent receipt.
  return { ...cfg, horizon: { ...cfg.horizon, treeline: 0.64, snowline: 0.42 } };
}
function originalConfig(cfg) {
  // 2026-09-12 map pass: dressing/haze leaves never feed terrain wear.
  cfg = historicalMapPassDressingInput(cfg, assert);
  // round 29 (2026-09-20): the vista ground kind never feeds terrain wear either
  cfg = historicalVistaGroundInput(cfg);
  if (cfg.id === 'badlands') return historicalBadlandsInput(cfg);
  if (cfg.id === 'alpine') return historicalAlpineHorizonInput(historicalPlayableReliefInput(cfg));
  if (cfg.id === 'frontier') return historicalPlayableReliefInput(cfg);
  if (pilots.includes(cfg.id)) {
    const { villageWear: _mode, workedGround: _patches, ...terrain } = cfg.terrain;
    return { ...cfg, terrain };
  }
  // Published prop-only inputs postdate this immutable terrain receipt:
  // 0823acd74 (Ironworks palette), 3bfd72f90 (two crop identities). Their
  // exact current values are independently guarded below. Preserve the old
  // digest and EVERY other field instead of refreshing it to today's output.
  if (cfg.id === 'foundry') {
    const prior = historicalFoundryServiceInput(cfg);
    const { sourcedPalette: _laterPalette, ...props } = prior.props;
    return { ...prior, props };
  }
  if (cfg.id === 'autumn' || cfg.id === 'delta') {
    const { cropForm: _laterCrop, ...props } = cfg.props;
    return { ...cfg, props };
  }
  return cfg;
}
function checkScope(resolve) {
  assert.equal(resolve('alpine').horizon.treeline, 0.80, 'current Alpine treeline band is the restored 1049e4e value');
  assert.equal(resolve('alpine').horizon.snowline, 0.72, 'current Alpine snowline band is the restored 1049e4e value');
  verifyCurrentAutumnPalette(resolve('autumn'));
  assert.equal(resolve('foundry').props.sourcedPalette, 'ironworks');
  assert.equal(resolve('autumn').props.cropForm, 'harvest');
  assert.equal(resolve('delta').props.cropForm, 'wet-upright');
  assert.deepEqual(MAP_IDS.filter(id => resolve(id).terrain.villageWear !== undefined), activityMaps);
  for (const id of pilots) {
    assert.equal(resolve(id).terrain.villageWear, 'activity-patches');
    assert.equal(resolve(id).terrain.workedGround.length, 4);
  }
  const foundry = resolve('foundry');
  assert.equal(foundry.terrain.villageWear, 'activity-patches', 'Foundry drops the broad village apron');
  assert.equal(foundry.splat.townWear, 1.6, 'Foundry authored soil keeps its bounded material strength');
  assert.deepEqual(foundry.terrain.workedGround, foundryPatches, 'the three accepted Foundry footprints remain exact');
  // Mars mode (2026-09-18): Olympus Basin postdates the frozen parent inputs — the catalog receipts guard it
  assert.equal(hash(stringify(MAP_IDS.filter(id => id !== 'mars').map(id => historicalAutumnPaletteInput(originalConfig(originalExitConfig(resolve(id))))))), FROZEN.configs,
    'only the two visual terrain properties differ from the exact parent inputs');
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

// Actual seed1337 scene-manifest stall centers, not points generated by the
// new polygons. Current road crossings resolve to(163.766,95.656)/(-190,-36).
const activityPoints = {
  coastal: [[154.163, 82.882], [153.264, 103.976], [155, -62], [97, -64]],
  saltwind: [[-199.496, -42.573], [-184.043, -47.939], [-190, -80], [-130, -90], [-264.885, -21.707]],
  // Inside the accepted loading court, southern approach and container lane.
  foundry: [[101, -110], [102, -146], [160, -104]],
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
  // Foundry compares against its accepted f84f court, INCLUDING all three
  // polygons. Only the two new material inputs are removed from this control.
  const { villageWear: _mode, ...terrain } = cfg.terrain;
  const { townWear: _strength, ...splat } = cfg.splat;
  const baseline = id === 'foundry' ? { ...cfg, terrain, splat } : originalConfig(cfg);
  const original = bake(baseline, seed), current = bake(cfg, seed);
  try {
    compareTexture(original.texture, current.texture);
    assert.equal(current.draws, original.draws, 'identical caller RNG draw count');
    assert.deepEqual(current.rngTail, original.rngTail, 'identical caller RNG tail');
    protectedChannels(original.pixels, current.pixels);
    const coverage = activityCoverage(original.pixels, current.pixels, current.size, cfg.terrain.workedGround);
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
      if (pilots.includes(id)) {
        // The archived mask predates authored road grading. Keep its exact
        // constructor/config while all behavioral comparisons above stay live.
        const historical = bake(originalExitConfig(baseline), seed, historicalRoadHeightField);
        try { assert.equal(hash(historical.pixels), FROZEN.pilotMasks[id][current.size],
          'original coverage reproduces the authenticated parent mask'); }
        finally { historical.texture.dispose(); }
      }
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
    // Mars mode (2026-09-18): Olympus Basin postdates the all28 parent receipt
    if (pilots.includes(id) || id === 'mars') continue;
    const built = bake(historicalBadlandsInput(historicalFoundryServiceInput(originalExitConfig(getMapConfig(id)))), 1337, historicalRoadHeightField);
    assert.equal(built.size, tier === 'desktop' ? 512 : 256, 'actual tier-scaled raster, not a relabeled desktop bake');
    results.push([id, hash(built.pixels)]); built.texture.dispose();
  }
  assert.equal(hash(JSON.stringify(results)), FROZEN.other28[tier], `all28 ${tier} full RGBA outputs retain the authenticated parent receipt`);
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
for (const id of ['frontier', 'alpine']) {
  const canonical = getMapConfig(id);
  for (const [fields, failure] of [[{ relief: undefined }, /current playable relief/],
    [{ width: -1 }, /only the two visual terrain properties/]]) {
    const changed = { ...canonical, terrain: { ...canonical.terrain,
      landforms: canonical.terrain.landforms.map((form, index) => index === 0 ? { ...form, ...fields } : form) } };
    assert.throws(() => checkScope(key => key === id ? changed : getMapConfig(key)), failure,
      'live relief and original anchor fields have independent guards');
  }
}
const badlands = getMapConfig('badlands');
assert.throws(() => checkScope(id => id === 'badlands'
  ? { ...badlands, terrain: { ...badlands.terrain, hillScale: -1 } } : getMapConfig(id)),
  /current Badlands authoring/, 'historical input cannot hide a changed current canyon');
assert.throws(() => checkScope(id => id === 'badlands'
  ? { ...badlands, props: { ...badlands.props, wallRuns: badlands.props.wallRuns.map((row, index) =>
    index === 0 ? [...row.slice(0, 4), row[4] + 1] : row) } } : getMapConfig(id)),
  /only the two visual terrain properties/, 'unprojected wall policy still fails the original config digest');
const autumn = getMapConfig('autumn');
for(const species of ['birch','aspen'])for(const birchLeaves of [undefined,false,'enabled']){
  const changed={...autumn,vegetation:{...autumn.vegetation,palettes:{...autumn.vegetation.palettes,
    [species]:{...autumn.vegetation.palettes[species],birchLeaves}}}};
  assert.throws(()=>checkScope(id=>id==='autumn'?changed:getMapConfig(id)),/current Autumn palette/,
    'historical color projection cannot hide missing or corrupt current atlas selections');
}
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
const foundry = getMapConfig('foundry');
for (const changed of [
  { ...foundry, terrain: { ...foundry.terrain, villageWear: undefined } },
  { ...foundry, splat: { ...foundry.splat, townWear: 1 } },
  { ...foundry, splat: { ...foundry.splat, townWear: 3 } },
  { ...foundry, terrain: { ...foundry.terrain, workedGround: [] } },
]) {
  assert.deepEqual(historicalFoundryServiceInput(changed), historicalFoundryServiceInput(foundry),
    'historical projection alone intentionally cannot certify current Foundry coverage');
  assert.throws(() => checkScope(id => id === 'foundry' ? changed : getMapConfig(id)),
    'actual Foundry scope independently rejects absent/oversized wear and missing polygons');
}
const savedWindow = globalThis.window, receipts = [];
try {
  for (const tier of ['desktop','mobile']) {
    globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem: () => null } };
    if (tier === 'mobile') assert.equal(resolveDeviceTier(), 'mobile');
    assert.equal(getDeviceTier(), tier);
    checkOtherMaps(tier);
    receipts.push(checkCurrentBadlands(tier));
    for (const id of activityMaps) for (const seed of [1337,2025,7719]) receipts.push(checkPilot(id,seed));
  }
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
}
assert.equal(stringify(MAP_IDS.map(getMapConfig)), beforeConfigs, 'no live config mutation');
console.log(JSON.stringify({ test: 'villageWear', scope: 'full CPU masks; no native art/performance acceptance', receipts }));
