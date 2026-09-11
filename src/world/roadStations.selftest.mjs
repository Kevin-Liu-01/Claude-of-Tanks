import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createLayout } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { ROAD_ENDPOINT_INTENTS, completeRoadEndpoints } from './maps/roadEndpoints.ts';
import { buildRoadStationOrigins, authoredRoadStationCount, authoredRoadStationIndex } from './maps/roadStations.ts';
import { planUtilityPoleStation } from './propPlacement.ts';
import { FENCE_SEG } from './maps/inhabitKit.ts';
import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('props.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const names = ['placeFenceRun', 'scatterDestructibles', 'fenceRun', 'placeRoadFenceLines',
  'placeRoadCarts', 'placeSandbagEmplacements', 'placeUtilityPoles', 'placeTownLampposts', 'placeStreetLamps',
  'isRoadsideSpotClear', 'findRoadsideSpot', 'tryPlaceRoadWreck', 'placeRoadWrecks'];
const definitions = names.map(name => {
  assert.ok(functions.has(name), `execute the actual production ${name}`);
  return functions.get(name);
}).join('\n');
const factory = new Function('deps', `
  const { L, heightField, rng, drng, wrng, mulberry32, addDestructible, P,
    authoredRoadStationCount, authoredRoadStationIndex, FENCE_SEG, planUtilityPoleStation,
    utilityPolePlacements, addUtilityPole, wreckRecords, fenceRuns, fixtureSeed, fixtureRoadFence,
    buckets, box, distToOtherRoads } = deps;
  const roads = L.roads, roadsL = roads, roadFence = fixtureRoadFence;
  const noVeg = heightField._noVeg, v = L.village, placedB = [], seed = fixtureSeed;
  const frng = mulberry32(seed + 606);
  const junction = { x: 0, z: 0 };
  const SOURCED = { sandbags: true }, wreckCount = 5, bakedTris = 0;
  let placedW = 0;
  function* placeWreck(...args) { wreckRecords.push(args); return true; }
  function* placePairedWreck() {}
  const wreckSpotIsClear = () => true;
  ${stripTypeScriptTypes(definitions)}
  const emitFence = placeFenceRun;
  placeFenceRun = (...args) => { fenceRuns.push(args); emitFence(...args); };
  return { ${names.join(',')}, nextStreetRoll: () => frng() };
`);

function trackedRng(seed, log, name) {
  return () => {
    log[name] = (log[name] || 0) + 1;
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
const original = [Array.from({ length: 31 }, (_, i) => [Math.sin(i * .3) * 12, -300 + i * 20]),
  Array.from({ length: 31 }, (_, i) => [-300 + i * 20, 35 + Math.sin(i * .2) * 10])];
const extended = original.map((line, ri) => [
  ...[3, 2, 1].map(n => ri ? [-300 - 20 * n, line[0][1]] : [line[0][0], -300 - 20 * n]),
  ...line,
  ...[1, 2, 3].map(n => ri ? [300 + 20 * n, line.at(-1)[1]] : [line.at(-1)[0], 300 + 20 * n]),
]);
function layout(roads, origins) {
  return { roads, ...(origins ? { roadStations: origins } : {}),
    village: { x0: -480, x1: 480, z0: -480, z1: 480 },
    spawns: { player: { x: 9000, z: 9000 }, enemies: [] } };
}
const originalLayout = layout(original);
const completedLayout = layout(extended, buildRoadStationOrigins(original, extended));
assert.deepEqual(completedLayout.roadStations, [0, 1].map(() => ({ count: 31, first: 0, last: 30, offset: 3 })));
assert.equal(buildRoadStationOrigins(original, original), undefined, 'unchanged roads retain no metadata');
assert.throws(() => buildRoadStationOrigins([original[0]], [[original[0][0], original[0][2]]]), /Noncontiguous/);
for (let road = 0; road < 2; road++) for (let i = 0; i < 30; i++) {
  const at = authoredRoadStationIndex(completedLayout, road, i);
  assert.equal(at, i + 3);
  assert.equal(extended[road][at], original[road][i], 'exact original point ownership, not coordinate snapping');
}

const crossingSource = [-100, 0, 100].map(x => [[x, -400], [x, 0], [x, 400]]);
crossingSource.push([-150, -125, -75, 0, 75, 125, 150].map(x => [x, 0]));
const frozen = JSON.stringify(crossingSource);
const crossingRoads = completeRoadEndpoints('frontier', crossingSource);
const crossing = layout(crossingRoads, buildRoadStationOrigins(crossingSource, crossingRoads));
assert.equal(JSON.stringify(crossingSource), frozen, 'completion and metadata leave source arrays unchanged');
assert.deepEqual(crossing.roadStations[3], { count: 7, first: 2, last: 4, offset: -1 });
assert.deepEqual(crossingRoads[3][0], [-100, 0]);
assert.deepEqual(crossingRoads[3].at(-1), [100, 0]);
assert.equal(authoredRoadStationIndex(crossing, 3, 1), -1, 'trimmed approach is not replaced by intersection');
assert.equal(authoredRoadStationIndex(crossing, 3, 2), 1);
assert.equal(authoredRoadStationIndex(crossing, 3, 4), -1, 'a new intersection cannot supply an original successor');
const exactJoinSource = [...crossingSource.slice(0, 3), [[-100, 0], [-50, 0], [50, 0], [100, 0]]];
const exactJoinRoads = completeRoadEndpoints('frontier', exactJoinSource);
const exactJoinOrigins = buildRoadStationOrigins(exactJoinSource, exactJoinRoads);
assert.equal(exactJoinOrigins[3], null, 'an exact authored junction keeps original station identity, not a false trimmed marker');
assert.equal(exactJoinRoads[3][0], exactJoinSource[3][0]);
const short = layout([[[0, 1], [0, 2]]], buildRoadStationOrigins([[[0, 0], [0, 3]]], [[[0, 1], [0, 2]]]));
assert.equal(authoredRoadStationIndex(short, 0, 0), -1, 'no original survivors means no inherited stations');

function fixture(L, roadDistance = () => 20, options = {}) {
  const draws = {}, records = [], poles = [], utilityPolePlacements = [], wreckRecords = [], fenceRuns = [], fallenLamps = [];
  const heightField = { _layout: L, _roadDist: roadDistance, _noVeg: options.noVeg ?? (() => false),
    getHeightAt: (x, z) => .01 * x - .015 * z, getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
    getGroundType: () => 'medium' };
  const seed = options.seed ?? 2002;
  const rng = trackedRng(seed, draws, 'rng'), drng = trackedRng(seed + 9001, draws, 'drng');
  const wrng = trackedRng(seed + 2400, draws, 'wrng');
  const methods = factory({ L, heightField, rng, drng, wrng, fixtureSeed: seed,
    fixtureRoadFence: options.props ? options.props.inhabit?.roadFence ?? 'fenceplank' : 'fencewattle',
    mulberry32: seed => trackedRng(seed, draws, `seed${seed}`),
    addDestructible: (...args) => records.push(args),
    P: options.props ?? { fences: true, carts: true, inhabit: { carts: 6 }, sandbagLines: 9, telegraph: true, lampposts: true },
    authoredRoadStationCount, authoredRoadStationIndex, FENCE_SEG, planUtilityPoleStation,
    utilityPolePlacements, addUtilityPole: (post, station) => poles.push({ post, station }), wreckRecords, fenceRuns,
    distToOtherRoads: options.otherRoadDistance ?? (() => 20), buckets: { dark: fallenLamps },
    box: (...dimensions) => Object.defineProperties({ dimensions }, {
      rotateY: { value(yaw) { this.yaw = yaw; } },
      translate: { value(...position) { this.position = position; } },
    }),
  });
  return { methods, records, poles, utilityPolePlacements, wreckRecords, fenceRuns, fallenLamps, draws, heightField, rng, drng, wrng };
}
const stages = ['placeRoadFenceLines', 'placeRoadCarts', 'placeSandbagEmplacements',
  'placeUtilityPoles', 'placeTownLampposts', 'placeStreetLamps', 'placeRoadWrecks'];
for (const stage of stages) {
  const before = fixture(originalLayout), after = fixture(completedLayout), naked = fixture(layout(extended));
  for (const item of [before, after, naked]) {
    const result = item.methods[stage]();
    if (result?.next) [...result];
  }
  for (const key of ['records', 'poles', 'utilityPolePlacements', 'wreckRecords', 'fenceRuns', 'fallenLamps', 'draws']) {
    assert.deepEqual(after[key], before[key], `${stage}: original stations/variation/draw cardinality under identical admission`);
  }
  assert.deepEqual([after.rng(), after.drng()], [before.rng(), before.drng()], `${stage}: exact next shared rolls`);
  assert.equal(after.methods.nextStreetRoll(), before.methods.nextStreetRoll(), `${stage}: exact next furniture/litter roll`);
  const emitted = stage === 'placeUtilityPoles' ? 'poles' : stage === 'placeRoadWrecks' ? 'wreckRecords' : 'records';
  assert.notDeepEqual(naked[emitted], before[emitted], `${stage}: dropping origin metadata is an effective negative control`);
}

const trimmedRoads = [[[0, -10], ...original[0].slice(15, 26), [0, 210]],
  [[-10, 35], ...original[1].slice(15), [340, 35]]];
const trimmed = layout(trimmedRoads, buildRoadStationOrigins(original, trimmedRoads));
const trimmedCarts = fixture(trimmed);
trimmedCarts.methods.placeRoadCarts();
assert.deepEqual(trimmedCarts.records.map(row => [row[1], row[3]]), [19, 24, 29]
  .map(i => [original[1][i][0] + 8.5, original[1][i][1] + 6.5]), 'only surviving original cart stations emit; no replacement at inserted ends');
const trimmedFences = fixture(trimmed);
trimmedFences.methods.placeRoadFenceLines();
const expectedRuns = [0, 1].flatMap(road => [20, 21, 22].map(i => {
  const [ax, az] = original[road][i], [bx, bz] = original[road][i + 1];
  const length = Math.hypot(bx - ax, bz - az);
  const ox = -(bz - az) / length * 7.6, oz = (bx - ax) / length * 7.6;
  return ['fencewattle', ax + ox, az + oz, bx + ox, bz + oz, .3];
}));
assert.deepEqual(trimmedFences.fenceRuns, expectedRuns, 'actual fence runs omit trimmed stations and retain original endpoint tangents');
const trimmedSandbags = fixture(trimmed);
trimmedSandbags.methods.placeSandbagEmplacements();
const bags = trimmedSandbags.records.filter(row => row[0].startsWith('sandbag'));
const expectedBags = [15, 18, 21, 24].map(i => {
  const [ax, az] = original[0][i], [bx, bz] = original[0][i + 1];
  const length = Math.hypot(bx - ax, bz - az), side = i % 2 ? 1 : -1;
  return [ax - (bz - az) / length * 8.6 * side, az + (bx - ax) / length * 8.6 * side];
});
assert.deepEqual(bags.slice(0, -2).map(row => [row[1], row[3]]), expectedBags,
  'actual sandbag stations retain original parity after both terminal trims');
const trimmedLamps = fixture(trimmed);
trimmedLamps.methods.placeStreetLamps();
const lampPositions = trimmedLamps.records.map(row => [row[1], row[3]])
  .concat(trimmedLamps.fallenLamps.map(row => [row.position[0], row.position[2]]));
const expectedLampPositions = [0, 1].flatMap(road => Array.from({ length: road ? 15 : 10 }, (_, n) => {
  const i = n + 15, [ax, az] = original[road][i], [bx, bz] = original[road][i + 1];
  const length = Math.hypot(bx - ax, bz - az), side = i % 2 ? 1 : -1;
  return [ax - (bz - az) / length * side * 5.9, az + (bx - ax) / length * side * 5.9];
}));
const byPosition = (a, b) => a[0] - b[0] || a[1] - b[1];
assert.deepEqual(lampPositions.sort(byPosition), expectedLampPositions.sort(byPosition),
  'standing and fallen lamps emit only original surviving segments, with original pavement parity');
const blockedCarts = fixture(completedLayout, () => 0);
blockedCarts.methods.placeRoadCarts();
assert.equal(blockedCarts.records.length, 0, 'station origin never bypasses current physical road clearance');
for (const options of [{ otherRoadDistance: () => 0 }, { noVeg: () => true }]) {
  const blockedLamps = fixture(completedLayout, () => 20, options);
  blockedLamps.methods.placeStreetLamps();
  assert.equal(blockedLamps.records.length + blockedLamps.fallenLamps.length, 0,
    'street station translation never bypasses current crossing/noVeg clearance');
  assert.deepEqual(blockedLamps.draws, {}, 'blocked lamps do not consume the furniture/litter stream');
}

function roadside(L, rolls, tries = 1) {
  const item = fixture(L); let draws = 0;
  const context = { rng: () => { draws++; return rolls[(draws - 1) % rolls.length]; }, roads: L.roads,
    heightField: item.heightField, noVegetation: item.heightField._noVeg, spawns: L.spawns, placedBuildings: [] };
  return { value: item.methods.findRoadsideSpot(context, 5, 13, tries), draws };
}
assert.deepEqual(roadside(completedLayout, [.6, .35, .2, .4]), roadside(originalLayout, [.6, .35, .2, .4]),
  'random roadside selection retains original count, ordinal, tangent, side, offset and four draws');
assert.deepEqual(roadside(trimmed, [.6, 0, .2, .4]), { value: null, draws: 4 },
  'a trimmed random proposal consumes all four original proposal draws without snapping');

let mapped = 0, omitted = 0, metadataRecords = 0;
const metadata = [];
for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId), intent = ROAD_ENDPOINT_INTENTS[mapId];
  const completed = createLayout(config);
  let baselineConfig = config;
  if (mapId === 'coastal') {
    const t = config.terrain, grid = t.roads.grid;
    baselineConfig = { ...config, terrain: { ...t, roads: { ...t.roads,
      grid: { ...grid, zs: grid.zs.map(row => typeof row === 'number' ? row : { ...row, hi: 256 }) } } } };
  }
  delete ROAD_ENDPOINT_INTENTS[mapId];
  let before;
  try { before = createLayout(baselineConfig); } finally { ROAD_ENDPOINT_INTENTS[mapId] = intent; }
  if (mapId === 'blackglass') {
    assert.equal(config.props.streetRows, true, 'the missed lamp consumer is enabled on real Blackglass');
    assert.equal(completed.roadStations[0].offset, 3, 'real Blackglass odd prepend would invert raw-index lamp parity');
    const originalLamps = fixture(before), completedLamps = fixture(completed);
    const rawIndexLamps = fixture({ ...completed, roadStations: undefined });
    for (const item of [originalLamps, completedLamps, rawIndexLamps]) item.methods.placeStreetLamps();
    assert.ok(originalLamps.records.length && originalLamps.fallenLamps.length,
      'the actual Blackglass layout exercises standing and fallen owners');
    for (const key of ['records', 'fallenLamps', 'draws']) assert.deepEqual(completedLamps[key], originalLamps[key],
      `Blackglass street lamps: original side, tangent and draws under identical admission (${key})`);
    assert.equal(completedLamps.methods.nextStreetRoll(), originalLamps.methods.nextStreetRoll(),
      'Blackglass next litter roll remains exact with identical lamp admission');
    assert.notDeepEqual(rawIndexLamps.records, originalLamps.records, 'actual-layout odd-prepend regression is detected');
  }
  if (mapId === 'delta' || mapId === 'fjord') {
    for (const stage of ['placeRoadFenceLines', 'placeRoadCarts', 'placeSandbagEmplacements']) {
      const oldFixture = fixture(before), currentFixture = fixture(completed);
      oldFixture.methods[stage](); currentFixture.methods[stage]();
      assert.deepEqual(currentFixture.records, oldFixture.records, `${mapId}/${stage}: actual original stations and tangent/parity`);
      assert.deepEqual(currentFixture.draws, oldFixture.draws, `${mapId}/${stage}: exact draws with identical admission`);
    }
  }
  const count = completed.roadStations?.filter(Boolean).length ?? 0;
  metadataRecords += count;
  metadata.push({ mapId, arrayEntries: completed.roadStations?.length ?? 0, records: count, integerFields: count * 4 });
  for (let road = 0; road < before.roads.length; road++) {
    assert.equal(authoredRoadStationCount(completed, road), before.roads[road].length, `${mapId}: original selection range`);
    for (let i = 0; i < before.roads[road].length - 1; i++) {
      const at = authoredRoadStationIndex(completed, road, i);
      if (at < 0) { omitted++; continue; }
      assert.deepEqual(completed.roads[road].slice(at, at + 2), before.roads[road].slice(i, i + 2), `${mapId}/${road}/${i}: exact original segment/tangent`);
      mapped++;
    }
  }
}
const hashes = Object.fromEntries(['terrain.ts', 'props.ts', 'maps/roadEndpoints.ts', 'maps/roadStations.ts']
  .map(file => [file, createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex')]));
console.log(JSON.stringify({ test: 'roadStations', maps: MAP_IDS.length, mapped, omitted, metadataRecords, hashes, metadata,
  retainedScalarFields: metadataRecords * 4, newTypedBackingBytes: 0, newCoordinateArrays: 0, nativeRecapture: false,
  scope: 'actual station consumers; RNG parity only under identical admission, no full-props or vegetation parity claim' }));

const authoredOutput = process.argv.find(arg => arg.startsWith('--authored-exit-out='))?.slice(20);
if (authoredOutput) {
  const records = [];
  for (const mapId of ['alpine', 'reservoir']) for (const seed of [1337, 2025]) {
    const config = getMapConfig(mapId);
    for (const stage of stages) {
      if (stage === 'placeStreetLamps' && !config.props.streetRows) continue;
      const run = cfg => {
        const item = fixture(createLayout(cfg), () => 20, { seed, props: cfg.props });
        const result = item.methods[stage]();
        if (result?.next) [...result];
        return { records: item.records, poles: item.poles, utilityPolePlacements: item.utilityPolePlacements,
          wreckRecords: item.wreckRecords, fenceRuns: item.fenceRuns, fallenLamps: item.fallenLamps, draws: { ...item.draws },
          next: [item.rng(), item.drng(), item.wrng()] };
      };
      const before = run(originalExitConfig(config)), after = run(config);
      records.push({ mapId, seed, stage, before, after,
        equal: JSON.stringify(before) === JSON.stringify(after) });
    }
  }
  writeFileSync(authoredOutput, JSON.stringify({ hashes, records,
    scope: 'Actual extracted production station consumers with actual map props and declared seeds, each stage starts fresh. Synthetic identical admission: distance20, plane height, flat normals, dry ground, no blockers, successful wreck placement with fixed5 cap. Raw ordered owner arguments and per-stage RNG counts/tails only; NOT full-scene placement, shared-stream or resource parity.' }, null, 2) + '\n', { flag: 'wx' });
}
