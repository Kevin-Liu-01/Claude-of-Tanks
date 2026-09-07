import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { alignLiquidLakeLevels, buildLiquidLakeBanks, buildLiquidMarshSurfaces, LIQUID_MARSH_STRIDE, MAX_LIQUID_RIVER_SLOPE } from './liquidMarshSurface.ts';
import { shorelineDistance, shorelineRadiusAt, sampleShorelineMask } from './shoreline.ts';
import { createHeightField, createLayout } from './terrain.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { buildLiquidMarshIndex, liquidMarshIndexBucket, sampleIndexedMarshWetness, LIQUID_INDEX_CELLS } from './liquidMarshIndex.ts';

// Exercise both sides of the signed bit-31 boundary and all map edges. The
// index is conservative only: every exact bank hit must remain a candidate.
const indexedMarshes = Array.from({ length: 65 }, (_, at) => ({
  x: (at % 9) * 124 - 496, z: Math.floor(at / 9) * 136 - 480, r: 37,
}));
const indexedSurfaces = new Float64Array(indexedMarshes.length * 4);
for (let at = 0; at < indexedMarshes.length; at++) indexedSurfaces[at * 4 + 3] = 1.5;
const broadPhase = buildLiquidMarshIndex(indexedMarshes, indexedSurfaces, 1024);
assert.equal(broadPhase.byteLength, LIQUID_INDEX_CELLS ** 2 * 3 * 4,
  'the broad phase retains just one packed bit per station/cell');
assert.equal(buildLiquidMarshIndex(indexedMarshes.slice(0, 8), indexedSurfaces, 1024), null,
  'small water layouts do not allocate an index');
for (let z = -512; z <= 512; z += 16) for (let x = -512; x <= 512; x += 16) {
  const cell = Math.min(15, ((z + 512) / 64) | 0) * 16 + Math.min(15, ((x + 512) / 64) | 0);
  assert.equal(liquidMarshIndexBucket(x, z, 1024, 3), cell * 3);
  assert.equal(sampleIndexedMarshWetness(indexedMarshes, broadPhase, cell * 3, 3, x, z),
    sampleShorelineMask(indexedMarshes, [], x, z), 'indexed wetness is bit-identical to the complete contour union');
  for (let at = 0; at < indexedMarshes.length; at++) {
    const marsh = indexedMarshes[at];
    if (Math.hypot(x - marsh.x, z - marsh.z) >= marsh.r * 1.5) continue;
    assert.ok(broadPhase[cell * 3 + (at >>> 5)] & (1 << (at & 31)),
      `broad phase dropped station ${at} at ${x},${z}`);
  }
}

const river = Array.from({ length: 7 }, (_, index) => ({ x: index * 30 - 90, z: 90, r: 24, dip: 0.8 }));
const raw = (x, z) => x * 0.06 + z * 0.002 + Math.sin(x * 0.1) * 2;
const planes = buildLiquidMarshSurfaces(river, raw);
assert.equal(planes.byteLength, river.length * 4 * 8, 'only four doubles per marsh survive construction');
assert.deepEqual(planes, buildLiquidMarshSurfaces(river, raw), 'surface generation is deterministic');
for (let index = 0; index < river.length; index++) {
  const offset = index * LIQUID_MARSH_STRIDE;
  assert.deepEqual(Array.from(planes.slice(offset, offset + 3)), Array.from(planes.slice(0, 3)),
    'every overlapping station shares exactly one plane, without join steps');
  assert.ok(Math.hypot(planes[offset + 1], planes[offset + 2]) <= MAX_LIQUID_RIVER_SLOPE + 1e-12);
  assert.ok(planes[offset + 3] >= 1.32, 'bank grading never gets narrower than the original lake blend');
}
const basin = buildLiquidMarshSurfaces([{ x: 40, z: -80, r: 30, dip: 1 }], raw);
assert.equal(basin[1], 0); assert.equal(basin[2], 0, 'isolated liquid basins are horizontal');
const smallLakes = [{ x: 0, z: 0, r: 18, level: -3 }, { x: 22, z: 0, r: 18, level: -3 }];
const autoLakes = [{ x: 0, z: 0, r: 24 }, { x: 30, z: 0, r: 24 }, { x: 180, z: 0, r: 24, level: 4 }];
const autoLevels = new Float64Array([-2, -5, 4]);
alignLiquidLakeLevels(autoLakes, autoLevels);
assert.deepEqual(Array.from(autoLevels), [-5, -5, 4],
  'connected auto sheets share their lowest outlet without changing an isolated authored reach');
alignLiquidLakeLevels(autoLakes, autoLevels);
assert.deepEqual(Array.from(autoLevels), [-5, -5, 4], 'liquid level resolution is idempotent');
const anchoredLevels = new Float64Array([-2, -5]);
alignLiquidLakeLevels([{ ...autoLakes[0], level: -2 }, autoLakes[1]], anchoredLevels);
assert.deepEqual(Array.from(anchoredLevels), [-2, -2], 'an explicit lake anchors connected auto sheets');
assert.throws(() => alignLiquidLakeLevels([{ ...autoLakes[0], level: -2 }, { ...autoLakes[1], level: -5 }],
  new Float64Array([-2, -5])), /one authored waterline/, 'contradictory overlapping authored levels are not silently averaged');
assert.throws(() => alignLiquidLakeLevels(autoLakes, new Float64Array([NaN, -5, 4])), /finite/,
  'corrupted auto levels cannot propagate into a connected sheet');
let authoredLevelChecks = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  if (!config.splat?.seaLake || config.terrain?.frozenMarshes) continue;
  const lakes = createLayout(config).lakes;
  const levels = Float64Array.from(lakes, (lake, at) => lake.level ?? (-10 - at));
  alignLiquidLakeLevels(lakes, levels);
  for (let at = 0; at < lakes.length; at++) if (lakes[at].level !== undefined) {
    assert.equal(levels[at], lakes[at].level, `${id}: authored independent waterlines remain unchanged`);
    authoredLevelChecks++;
  }
}
assert.ok(authoredLevelChecks > 40, 'all registered authored liquid reaches enter the component audit');
const lakeBanks = buildLiquidLakeBanks(smallLakes, () => 9);
assert.equal(lakeBanks.byteLength, smallLakes.length * 8, 'liquid lakes retain one bank-width scalar only');
assert.ok(lakeBanks.every(band => band > 1.32), 'small deep cells widen their grade instead of making quarry walls');
assert.deepEqual(lakeBanks, buildLiquidLakeBanks(smallLakes, () => 9), 'liquid lake bank construction is deterministic');
const narrowProfile = { x: 0, z: 0, r: 40, level: 0,
  radii: [1, 0.8, 0.6, 0.5, 0.4, 0.5, 0.6, 0.8, 1, 0.8, 0.6, 0.5, 0.4, 0.5, 0.6, 0.8] };
assert.equal(buildLiquidLakeBanks([narrowProfile], () => 9)[0],
  0.94 + (9 * 2 / 0.45) / (40 * 0.4), 'authored narrow coves get sufficient bank grading');
assert.equal(buildLiquidLakeBanks([{ x: 0, z: 0, r: 40, level: 0 }], () => 9)[0],
  0.94 + (9 * 2 / 0.45) / (40 * 0.8), 'legacy bank arithmetic keeps its original 80% radius floor');
const pinned = buildLiquidMarshSurfaces(river, raw, [{ x: -104, z: 90, r: 32, level: -3 }]);
for (let index = 0; index < river.length; index++) {
  assert.deepEqual(Array.from(pinned.slice(index * 4, index * 4 + 3)), [-3, 0, 0],
    'lake-connected arms use the canonical lake level');
}

const baseConfig = {
  terrain: {
    hillScale: 0.7, microScale: 0.8, rimH: 18,
    marshes: [{ x: 128, z: 168, r: 48, dip: 0.8 }], lakes: [], clearMarshVeg: true,
    roads: { paths: [[[-480, -180], [480, -180]]] },
    village: { x0: -64, x1: 64, z0: -64, z1: 64, cx: 0, cz: 0, feather: 30, flatten: 0.7 },
  },
  spawns: { player: { x: -180, z: -300 }, enemies: [{ x: 180, z: 300 }] },
};
for (const seed of [1337, 2049]) {
  const bog = createHeightField(seed, baseConfig);
  const dry = createHeightField(seed, { ...baseConfig, splat: { seaLake: false } });
  const frozenConfig = { ...baseConfig, terrain: { ...baseConfig.terrain, frozenMarshes: true,
    lakes: [{ x: 64, z: 80, r: 46, level: -2 }, { x: 90, z: 80, r: 46, depth: 3.5 }] } };
  const frozen = createHeightField(seed, frozenConfig);
  const frozenSea = createHeightField(seed, { ...frozenConfig, splat: { seaLake: true } });
  for (let x = -80; x <= 200; x += 20) for (let z = -40; z <= 240; z += 20) {
    assert.equal(bog.getHeightAt(x, z), dry.getHeightAt(x, z), 'non-liquid bog heights are unchanged');
    assert.equal(frozen.getHeightAt(x, z), frozenSea.getHeightAt(x, z), 'frozen terrain ignores liquid policy');
    assert.equal(frozenSea.getWaterMaskAt(x, z), 0);
  }
  const water = createHeightField(seed, { ...baseConfig, splat: { seaLake: true, seaRamp: [0.10, 0.45] } });
  const level = water.getHeightAt(128, 168);
  for (let angle = 0; angle < 12; angle++) {
    const a = angle * Math.PI / 6;
    assert.ok(Math.abs(water.getHeightAt(128 + Math.cos(a) * 20, 168 + Math.sin(a) * 20) - level) < 1e-9);
  }
  for (const spawn of [baseConfig.spawns.player, ...baseConfig.spawns.enemies]) {
    assert.equal(water.getHeightAt(spawn.x, spawn.z), bog.getHeightAt(spawn.x, spawn.z));
    assert.equal(water.getWaterMaskAt(spawn.x, spawn.z), 0);
  }
}

const mangroveRoadWater = createHeightField(1337, getMapConfig('mangrove'));
for (const [x, z] of [[83.66666666666667, -181], [73.5, -178]]) {
  assert.equal(mangroveRoadWater.getWaterMaskAt(x, z), 1, 'road-apron regression points are fully liquid');
  assert.ok(Math.abs(mangroveRoadWater.getHeightAt(x, z) + 2.3) < 1e-10,
    'the late road ditch cannot depress a fully flat lake by either 0.096mm or 5mm');
}
const roadLakeConfig = {
  ...baseConfig,
  terrain: { ...baseConfig.terrain, marshes: [], lakes: [{ x: 128, z: -180, r: 60, level: -2.3 }] },
  splat: { seaLake: true, seaRamp: [0.12, 0.48] },
};
const roadLake = createHeightField(1337, roadLakeConfig);
const dryRoadLake = createHeightField(1337, { ...roadLakeConfig, splat: { ...roadLakeConfig.splat, seaLake: false } });
const frozenRoadLakeConfig = { ...roadLakeConfig, terrain: { ...roadLakeConfig.terrain, frozenMarshes: true } };
const frozenRoadLake = createHeightField(1337, frozenRoadLakeConfig);
const frozenDryRoadLake = createHeightField(1337, { ...frozenRoadLakeConfig, splat: { seaLake: false } });
for (const x of [110, 128, 146]) for (const offset of [0, 4, 7, 11.5, 14, 16, 18, 22, 26]) {
  const z = -180 + offset;
  assert.equal(frozenRoadLake.getHeightAt(x, z), frozenDryRoadLake.getHeightAt(x, z),
    'frozen/non-liquid road and apron arithmetic stays bit-identical');
  if (offset <= 14) {
    assert.equal(roadLake.getWaterMaskAt(x, z), 0, 'protected road shoulders are still dry');
    assert.equal(roadLake.getHeightAt(x, z), dryRoadLake.getHeightAt(x, z),
      'dry road shoulders retain their original berm/ditch heights');
  } else if (roadLake.getWaterMaskAt(x, z) === 1) {
    assert.ok(Math.abs(roadLake.getHeightAt(x, z) + 2.3) < 1e-10,
      'lake-road transitions reach the exact waterline as soon as the canonical mask reaches one');
  }
}
const lakePadConfig = { ...roadLakeConfig,
  spawns: { ...roadLakeConfig.spawns, player: { x: 128, z: -164 } } };
const lakePad = createHeightField(1337, lakePadConfig);
const dryLakePad = createHeightField(1337, { ...lakePadConfig, splat: { seaLake: false } });
for (const x of [124, 128, 132]) for (const z of [-168, -164, -160]) {
  assert.equal(lakePad.getWaterMaskAt(x, z), 0, 'spawn protection overrides adjacent liquid road coverage');
  assert.equal(lakePad.getHeightAt(x, z), dryLakePad.getHeightAt(x, z),
    'protected spawn support retains the original dry apron detail');
}

// Skybridge used to fit these intersecting automatic sheets independently.
// Check both open cores and their shared middle, beyond protected roads/pads.
for (const seed of [1337, 2049]) {
  const config = getMapConfig('skybridge');
  const field = createHeightField(seed, config);
  const dry = createHeightField(seed, { ...config, splat: { ...config.splat, seaLake: false } });
  let low = Infinity, high = -Infinity, coreSamples = 0, joinSamples = 0;
  for (let z = 40; z <= 166; z += 6) for (let x = -64; x <= 60; x += 6) {
    if (field.getWaterMaskAt(x, z) < 1 || field._roadDist(x, z) < 18) continue;
    const y = field.getHeightAt(x, z);
    low = Math.min(low, y); high = Math.max(high, y); coreSamples++;
    if (field._layout.lakes.every(lake => shorelineDistance(lake, x, z) < 0.85)) joinSamples++;
  }
  assert.ok(coreSamples > 80 && joinSamples > 0, 'Skybridge exercises both wet cores and their actual overlapping join');
  assert.ok(high - low < 1e-8, `Skybridge auto sheets are one horizontal surface, not a ${high - low}m step`);
  for (const spawn of [field._layout.spawns.player, ...field._layout.spawns.enemies]) {
    assert.equal(field.getHeightAt(spawn.x, spawn.z), dry.getHeightAt(spawn.x, spawn.z),
      'auto lake resolution preserves original spawn support');
  }
  for (const road of field._layout.roads) for (const [x, z] of road) {
    assert.ok(Math.abs(field.getHeightAt(x, z) - dry.getHeightAt(x, z)) < 1e-8,
      'auto lake resolution preserves authored road center heights within roundoff');
    assert.equal(field.getWaterMaskAt(x, z), 0, 'Skybridge road centers remain dry');
  }
}

let checkedWater = 0, worstBankGrade = 0, worstBankSite = '';
const receipts = [];
for (const name of ['delta', 'monsoon', 'autumn', 'polders', 'mangrove']) {
  const config = (await import(`./maps/${name}.ts`)).default;
  for (const seed of [1337, 2049]) {
  const field = createHeightField(seed, config);
  const pads = [field._layout.spawns.player, ...field._layout.spawns.enemies];
  for (const [kind, discs] of [['marshes', field._layout.marshes], ['lakes', field._layout.lakes]]) {
  let coreCount = 0, bankCount = 0, maxBank = 0;
  for (const marsh of discs) {
    for (let at = 0; at < 12; at++) {
      const angle = at * Math.PI / 6;
      const radius = shorelineRadiusAt(marsh, angle);
      for (const band of [0, 0.35, 0.65, 0.94, 1.10, 1.25]) {
        const x = marsh.x + Math.cos(angle) * radius * band;
        const z = marsh.z + Math.sin(angle) * radius * band;
        if (field._roadDist(x, z) < 20 || pads.some(p => Math.hypot(x - p.x, z - p.z) < 28)) continue;
        const h = field.getHeightAt(x, z);
        assert.ok(Number.isFinite(h), `${name}: no nonfinite shore spikes`);
        const sx = (field.getHeightAt(x + 0.25, z) - field.getHeightAt(x - 0.25, z)) * 2;
        const sz = (field.getHeightAt(x, z + 0.25) - field.getHeightAt(x, z - 0.25)) * 2;
        const slope = Math.hypot(sx, sz);
        if (field.getWaterMaskAt(x, z) > 0.98) {
          assert.ok(slope <= 0.01001, `${name}: water slopes ${slope} exceed the 1% hydraulic grade`);
          checkedWater++;
          coreCount++;
          assert.equal(field._noVeg(x, z), true, `${name}: open water excludes foliage`);
        } else if (band >= 0.94) {
          bankCount++; maxBank = Math.max(maxBank, slope);
          if (slope > worstBankGrade) {
            worstBankGrade = slope; worstBankSite = `${name}/${seed}/${kind} ${x},${z} band=${band}`;
          }
        }
      }
    }
  }
  if (discs.length) {
    assert.ok(coreCount > 0 && bankCount > 0, `${name}/${seed}/${kind}: each present surface kind must exercise cores AND banks`);
    receipts.push({ name, seed, kind, coreCount, bankCount, maxBank: +maxBank.toFixed(3) });
  }
  }
  if (name === 'polders' || name === 'mangrove') {
    assert.ok(field._layout.lakes.length > 0, `${name}: authored drainage lakes must be included in the policy audit`);
  }
  }
}
assert.ok(checkedWater > 300, 'real river/pond cores are exercised, not just synthetic geometry');
assert.ok(worstBankGrade < 0.75, `graded near shores exceed 75% slope (${worstBankGrade}; ${worstBankSite})`);
const source = await readFile(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(source, /makeMaskTexture\(maskNoi, layout, rockMask, waterWetnessAt,/,
  'the existing texture bake and live water query share the protected wetness callback');
console.log(`liquidMarshSurface.selftest: ${checkedWater} real water samples; worst near-bank grade ${worstBankGrade.toFixed(3)}`);
console.log(JSON.stringify(receipts));
