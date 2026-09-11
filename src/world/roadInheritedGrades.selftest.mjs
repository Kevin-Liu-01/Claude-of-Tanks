import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { ROAD_ENDPOINT_INTENTS, completeRoadEndpoints, usesInheritedRoadGrades,
  remapInheritedRoadElevations, alignAddedRoadJunctionGrades } from './maps/roadEndpoints.ts';
import { buildRoadStationOrigins, authoredRoadStationIndex } from './maps/roadStations.ts';

const selected = ['blackglass', 'titan_gorge', 'skybridge'];
for (const id of [...MAP_IDS, undefined, 'fixture']) {
  assert.equal(usesInheritedRoadGrades(id), selected.includes(id), `${id}: explicit inherited-grade ownership`);
  if (!usesInheritedRoadGrades(id)) continue;
  const roads = getMapConfig(id).terrain.roads;
  assert.notEqual(roads, 'country');
  assert.ok(roads.paths?.length, `${id}: the reviewed original rows are authored paths`);
  assert.equal(roads.grid, undefined, `${id}: inherited completion must not lose grid originalCounts`);
}

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('terrain.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const names = ['smoothRoadElevations', 'findRoadJunction', 'blendRoadJunctions'];
const definitions = names.map(name => {
  assert.ok(functions.has(name), `execute actual ${name}`);
  return functions.get(name);
}).join('\n');
const makeBake = new Function('roads', `const _junctionScratch = [0, 0, 1e9];
  ${stripTypeScriptTypes(definitions)} return { ${names.join(',')} };`);
const copy = rows => rows.map(row => row.slice());

// Endpoints must retain their original boundary condition: smoothing the
// completed row first would feed its artificial tail back into old stations.
const oldRoad = Array.from({ length: 7 }, (_, i) => [0, -90 + i * 30]);
const extended = [[0, -120], ...oldRoad, [0, 120]];
const oldValues = [[7, -12, 50, -3, 29, 4, 18]];
const bake = makeBake([oldRoad]);
const expected = copy(oldValues);
bake.smoothRoadElevations(expected);
const remapped = copy(expected);
remapInheritedRoadElevations([oldRoad], [extended], remapped);
assert.deepEqual(remapped[0].slice(1, -1), expected[0], 'every original station survives exactly');
assert.equal(remapped[0][1], 7, 'old first endpoint remains fixed');
assert.equal(remapped[0].at(-2), 18, 'old last endpoint is not a dressing-neighbor lookup');
const wrongTailBake = [[-1000, ...oldValues[0], 1000]];
bake.smoothRoadElevations(wrongTailBake);
assert.notDeepEqual(wrongTailBake[0].slice(1, -1), expected[0], 'completed-first smoothing negative is discriminating');

// An inserted earlier zero-distance crossing must not steal the original
// nearest-node tie or its k=-3..3 neighborhood. Original pair order is used.
const junctionRoads = [Array.from({ length: 9 }, (_, i) => [(i - 4) * 50, 0]),
  Array.from({ length: 9 }, (_, i) => [0, (i - 4) * 50])];
const junctionCompleted = junctionRoads.map(row => [[500, 500], ...row]);
const junctionBake = makeBake(junctionCompleted);
assert.deepEqual([...junctionBake.findRoadJunction(0, 1, junctionRoads)], [4, 4, 0]);
assert.deepEqual([...junctionBake.findRoadJunction(0, 1)], [0, 0, 0], 'completed lookup would select the new crossing');
const junctionValues = junctionRoads.map((row, r) => row.map((_, i) => r * 40 + i * i));
const oldJunctionBake = copy(junctionValues);
junctionBake.blendRoadJunctions(oldJunctionBake, junctionRoads);
const junctionPlane = (junctionValues[0][4] + junctionValues[1][4]) * .5;
const junctionOracle = junctionValues.map(row => row.map((value, i) => {
  const k = i - 4;
  return Math.abs(k) > 3 ? value : value + (junctionPlane - value) * ((1 - Math.abs(k) / 4) * .85);
}));
assert.deepEqual(oldJunctionBake, junctionOracle, 'actual original crossing and entire blend neighborhood');
const wrongJunctionBake = junctionValues.map(row => [999, ...row]);
junctionBake.blendRoadJunctions(wrongJunctionBake);
assert.notDeepEqual(wrongJunctionBake.map(row => row.slice(1)), oldJunctionBake,
  'new-junction ownership must fail original grade equivalence');

// Retain the FULL original row through smoothing, including neighbors later
// trimmed away. Intersections are new owners, never replacements for old IDs.
const crossingSource = [-100, 0, 100].map(x => [[x, -400], [x, 0], [x, 400]]);
crossingSource.push([-150, -125, -75, 0, 75, 125, 150].map(x => [x, 0]));
const beforeSource = JSON.stringify(crossingSource);
const crossing = completeRoadEndpoints('frontier', crossingSource);
const layout = { roads: crossing, roadStations: buildRoadStationOrigins(crossingSource, crossing) };
assert.deepEqual(layout.roadStations[3], { count: 7, first: 2, last: 4, offset: -1 });
const trimValues = [[10, 20, 30], [35, 40, 45], [50, 60, 70], [90, -20, 15, 0, 30, 80, -40]];
const trimBake = makeBake(crossingSource), fullBake = copy(trimValues);
trimBake.smoothRoadElevations(fullBake);
trimBake.blendRoadJunctions(fullBake, crossingSource);
const seated = copy(fullBake);
remapInheritedRoadElevations(crossingSource, crossing, seated);
for (const original of [2, 3, 4]) {
  const at = authoredRoadStationIndex(layout, 3, original, 0, 0);
  assert.equal(crossing[3][at], crossingSource[3][original]);
  assert.equal(seated[3][at], fullBake[3][original], 'trimmed-neighbor contribution is preserved');
}
for (const original of [0, 1, 5, 6]) assert.equal(authoredRoadStationIndex(layout, 3, original, 0, 0), -1);
assert.equal(seated[3][0], fullBake[3][1] + (fullBake[3][2] - fullBake[3][1]) * .5);
assert.equal(seated[3].at(-1), fullBake[3][4] + (fullBake[3][5] - fullBake[3][4]) * .5);
const wrongTrim = [trimValues[3].slice(2, 5)];
trimBake.smoothRoadElevations(wrongTrim);
const fullSmoothed = [trimValues[3].slice()];
trimBake.smoothRoadElevations(fullSmoothed);
assert.notDeepEqual(wrongTrim[0], fullSmoothed[0].slice(2, 5), 'trim-first smoothing loses real neighbors');
const beforeSeating = copy(seated);
alignAddedRoadJunctionGrades('frontier', crossingSource, crossing, seated);
assert.equal(seated[3][0], seated[0][crossing[0].indexOf(crossingSource[0][1])]);
assert.equal(seated[3].at(-1), seated[2][crossing[2].indexOf(crossingSource[2][1])]);
assert.deepEqual(seated.slice(0, 3), beforeSeating.slice(0, 3), 'spines are not regraded to their new crossbar');
assert.deepEqual(seated[3].slice(1, -1), beforeSeating[3].slice(1, -1), 'only inserted endpoints are seated');
assert.equal(JSON.stringify(crossingSource), beforeSource, 'completion and grade helpers leave source rows immutable');
const exactSource = [...crossingSource.slice(0, 3), [[-100, 0], [-50, 0], [50, 0], [100, 0]]];
const exactCompleted = completeRoadEndpoints('frontier', exactSource);
const exactValues = exactCompleted.map((row, r) => row.map((_, i) => r * 10 + i));
const exactBefore = copy(exactValues);
alignAddedRoadJunctionGrades('frontier', exactSource, exactCompleted, exactValues);
assert.deepEqual(exactValues, exactBefore, 'original endpoints at an exact junction are not new owners');

// Private, test-only taps execute the complete production constructor. The
// same-ID control disables only endpoint intent, retaining map-specific terrain.
// Compare raw values too: completed nearest-road grids already exist at this
// stage and must not contaminate pre-road authoring before corridor stamping.
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length - 1, 1, `unique construction landmark: ${before}`);
  return text.replace(before, after);
}
let tapped = `${source}\nlet __gradeTap = (_row: any): void => {};\nexport function setGradeTap(tap: typeof __gradeTap): void { __gradeTap = tap; }\n`;
const raw = 'const nodeElev = authoringRoads.map((nodes) => nodes.map(([nx, nz]) => heightAt(nx, nz, false, false)));';
const tap = stage => `__gradeTap({ stage: '${stage}', roads: authoringRoads, completed: roads, nodeElev,
  borderCorridorStart, inherited: inheritedRoads !== null, distance: gRoadDist });`;
tapped = replaceOnce(tapped, raw, `${raw}\n${tap('raw')}`);
tapped = replaceOnce(tapped, 'blendRoadJunctions(nodeElev, authoringRoads);',
  `blendRoadJunctions(nodeElev, authoringRoads);\n${tap('junction')}`);
tapped = replaceOnce(tapped, 'alignFjordNorthernRoadGrades(cfg?.id, roads, nodeElev);',
  `${tap('final')}\nalignFjordNorthernRoadGrades(cfg?.id, roads, nodeElev);`);
tapped = replaceOnce(tapped, 'inheritedRoads = null;',
  "inheritedRoads = null;\n__gradeTap({ stage: 'released', released: inheritedRoads === null });");
const terrainURL = new URL('./terrain.ts?selftest=inherited-road-grades', import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  if (url === terrainURL) return { format: 'module-typescript', source: tapped, shortCircuit: true };
  return next(url, context);
} });
let terrain;
try { terrain = await import(terrainURL); } finally { hooks.deregister(); }
function construct(id, completed) {
  const stages = [];
  terrain.setGradeTap(row => {
    if (row.stage === 'released') { stages.push({ ...row }); return; }
    stages.push({ stage: row.stage, roads: row.roads, completed: row.completed, values: copy(row.nodeElev),
      borderStart: row.borderCorridorStart, inherited: row.inherited,
      distanceHash: createHash('sha256').update(Buffer.from(row.distance.buffer,
        row.distance.byteOffset, row.distance.byteLength)).digest('hex') });
  });
  const intent = ROAD_ENDPOINT_INTENTS[id];
  try {
    if (!completed) delete ROAD_ENDPOINT_INTENTS[id];
    const field = terrain.createHeightField(1337, getMapConfig(id));
    assert.deepEqual(stages.map(row => row.stage), ['raw', 'junction', 'final', 'released']);
    assert.equal(stages[3].released, true, 'construction alias is cleared, not returned as a second field');
    return { stages: stages.slice(0, 3), keys: Object.keys(field).sort(), layoutKeys: Object.keys(field._layout).sort() };
  } finally {
    ROAD_ENDPOINT_INTENTS[id] = intent;
    terrain.setGradeTap(() => {});
  }
}
const receipts = [];
for (const id of selected) {
  const control = construct(id, false), candidate = construct(id, true);
  const [oldRaw, oldJunction] = control.stages, [newRaw, newJunction, final] = candidate.stages;
  assert.notEqual(newRaw.distanceHash, oldRaw.distanceHash, `${id}: real completed distance grids differ`);
  assert.deepEqual(newRaw.roads, oldRaw.roads, `${id}: full original authoring rows, including removed tails`);
  assert.deepEqual(newRaw.values, oldRaw.values, `${id}: exact raw inputs despite completed distance/segment grids`);
  assert.deepEqual(newJunction.values, oldJunction.values, `${id}: exact original smoothing and junction order`);
  assert.equal(newRaw.borderStart, null, `${id}: no road stamp before raw authoring`);
  assert.equal(newJunction.borderStart, null, `${id}: no road stamp before original junction bake`);
  assert.equal(newRaw.inherited, true);
  assert.equal(oldRaw.inherited, false);
  assert.notEqual(final.borderStart, null, `${id}: completion is not bypassed to satisfy the test`);
  let retained = 0, removed = 0;
  for (let r = 0; r < newRaw.roads.length; r++) for (let i = 0; i < newRaw.roads[r].length; i++) {
    const at = final.completed[r].indexOf(newRaw.roads[r][i]);
    if (at < 0) { removed++; continue; }
    retained++;
    assert.equal(final.values[r][at], oldJunction.values[r][i], `${id}: original station ${r}/${i} stays exact`);
  }
  assert.ok(retained > 0);
  if (id !== 'blackglass') assert.ok(removed > 0, `${id}: real trimmed-neighbor control is exercised`);
  assert.deepEqual(candidate.keys.filter(key => key !== '_createRoadPlacementSampler'),
    control.keys.filter(key => key !== '_createRoadPlacementSampler'),
    'only the separately tested construction-only admission factory extends field ownership');
  assert.deepEqual(candidate.layoutKeys.filter(key => key !== 'roadStations'), control.layoutKeys,
    'only existing station metadata may be returned, not original polylines');
  receipts.push({ id, retained, removed, rawExact: true, originalBakeExact: true });
}
console.log('roadInheritedGrades selftest: PASS', JSON.stringify(receipts));
