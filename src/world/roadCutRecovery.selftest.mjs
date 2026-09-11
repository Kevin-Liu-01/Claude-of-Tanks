import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { alignHardstandRoadPortals } from './maps/roadEndpoints.ts';

const terrainURL = new URL('./terrain.ts', import.meta.url);
const endpointURL = new URL('./maps/roadEndpoints.ts', import.meta.url);
const terrain = readFileSync(terrainURL, 'utf8'), endpoints = readFileSync(endpointURL, 'utf8');
function find(text, name, kind) {
  const ast = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  function visit(node) {
    if (kind(node) && node.name?.getText() === name) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(found.length, 1, `unique actual source owner ${name}`);
  return found[0];
}

// Small literal dffb01ab2 predecessor blocks. No unpushed Git-history or whole
// terrain golden dependency: unchanged production construction executes fully.
const oldWeight = `borderCorridorStart !== null && cw > 0
      ? smoothstep(borderCorridorStart, borderCorridorStart + 32, borderRadius) * cw * roadCorridorWeight : 0`;
const oldAlignment = `export function alignHardstandRoadPortals(mapId: string | undefined, roads: readonly (readonly RoadPoint[])[],
  paths: readonly (readonly RoadPoint[])[], pathOffset: number, grid: PortalGrid,
  onApron: (x: number, z: number) => boolean): void {
  const intents = ROAD_ENDPOINT_INTENTS[mapId as MapId];
  if (!intents) return;
  for (let i = 0; i < paths.length; i++) {
    const route = i + pathOffset, path = paths[i];
    for (let end = 0; end < 2; end++) {
      const anchor = end ? path[path.length - 1] : path[0];
      if (intents[route][end] !== 'boundary' || !onApron(anchor[0], anchor[1])) continue;
      alignApronExit(grid, roads[route], route, anchor, !end);
    }
  }
}`;
function replaceNode(source, node, replacement) {
  return source.slice(0, node.getStart()) + replacement + source.slice(node.end);
}
const weight = find(terrain, 'borderShoulderWeight', ts.isVariableDeclaration).initializer;
const alignment = find(endpoints, 'alignHardstandRoadPortals', ts.isFunctionDeclaration);
const oldTerrainURL = `${terrainURL.href}?roadRecoveryBefore`, oldEndpointURL = `${endpointURL.href}?roadRecoveryBefore`;
const hooks = registerHooks({ load(url, context, next) {
  if (url === oldTerrainURL) return { format: 'module-typescript', shortCircuit: true,
    source: replaceNode(terrain, weight, oldWeight).replace("from './maps/roadEndpoints.ts'", "from './maps/roadEndpoints.ts?roadRecoveryBefore'") };
  if (url === oldEndpointURL) return { format: 'module-typescript', shortCircuit: true,
    source: replaceNode(endpoints, alignment, oldAlignment) };
  return next(url, context);
} });
let before, oldAlign;
try {
  before = await import(oldTerrainURL);
  oldAlign = (await import(oldEndpointURL)).alignHardstandRoadPortals;
} finally { hooks.deregister(); }

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const weightHelper = find(terrain, 'roadShoulderWeight', ts.isFunctionDeclaration).getText();
const bindWeight = expression => new Function('cfg', 'roadsOn', 'borderCorridorStart', 'borderRadius',
  'cw', 'roadCorridorWeight', 'smoothstep', `${stripTypeScriptTypes(weightHelper)}\nreturn ${expression};`);
const actualMask = bindWeight(weight.getText()), oldMask = bindWeight(oldWeight);
const intersectMaps = ['alpine', 'blackglass', 'titan_gorge', 'skybridge', 'badlands'];
for (const id of [...MAP_IDS, undefined]) for (const roadsOn of [false, true]) {
  for (const radius of [430, 448, 448.01, 452, 462, 480, 512]) {
    for (const cw of [0, .001, .25, .5, .75, 1]) for (const rd of [0, 18, 30, 41, 60, 64, 96]) {
      const distanceMask = 1 - smoothstep(18, 64, rd), args = [{ id }, roadsOn, 448, radius, cw, distanceMask, smoothstep];
      const old = oldMask(...args), next = actualMask(...args);
      assert.ok(next >= 0 && next <= 1);
      assert.equal(next === 0, old === 0, 'exact physical zero-support set, including64m and448m boundaries');
      if (!intersectMaps.includes(id) || !roadsOn) assert.equal(next, old, 'pre-road/all other map weights remain exact');
      else assert.equal(next, Math.min(smoothstep(448, 480, radius), cw, distanceMask), 'intersection is not a compounded taper');
    }
  }
}
// The min switches owner continuously but is not C1. Verify continuity and
// one-sided Lipschitz1 in each mask input; do not promise a terrain slope bound.
for (const id of intersectMaps) for (const crossing of [.25, .5, .75]) {
  const sample = cw => actualMask({ id }, true, 448, 512, cw, crossing, smoothstep);
  const lo = sample(crossing - 1e-7), mid = sample(crossing), hi = sample(crossing + 1e-7);
  assert.ok(mid - lo <= 1.00000001e-7 && hi === mid);
}
for (const id of intersectMaps) {
  assert.equal(actualMask({ id }, true, null, 512, 1, 1, smoothstep), 0, 'no endpoint owner means no support');
  const args = [{ id }, true, 430, 462, .6, .8, smoothstep];
  assert.equal(actualMask(...args), .6);
  assert.notEqual(oldMask(...args), actualMask(...args), 'retired compounded taper is a live negative for each selected map');
}

function apronFixture(path, onApron, mapId = 'reservoir', align = alignHardstandRoadPortals) {
  const road = [[-512, -72], [-480, -72], [-452, -72], [-424, -72], [-364, -72]];
  const grid = { size: 3, mapSize: 1024, route: Int16Array.from([0, 0, 0, 0, 1, 0, 1, 0, 0]),
    segment: Int16Array.from([0, 1, 2, 3, 0, 4, 2, 3, 1]),
    elevation: Float32Array.from({ length: 9 }, (_, i) => i + 30), sample: x => 11 + .03 * (x + 424) };
  const original = grid.elevation.slice();
  align(mapId, [road], [path], 0, grid, onApron);
  return { original, grid };
}
const straightPath = [[-480, -72], [-424, -72], [-364, -72]], onApron = x => x >= -430;
const apron = apronFixture(straightPath, onApron);
const legacyPath = [[-424, -72], [-364, -72]];
assert.deepEqual(apronFixture(legacyPath, onApron).grid.elevation,
  apronFixture(legacyPath, onApron, 'reservoir', oldAlign).grid.elevation,
  'an existing endpoint-on-apron keeps the exact old aligned output');
assert.deepEqual(apronFixture(straightPath, onApron, 'reservoir', oldAlign).grid.elevation,
  apron.original, 'old endpoint-only selection reproduces the missing apron propagation');
for (let i = 0; i < apron.original.length; i++) {
  const owned = apron.grid.route[i] === 0 && apron.grid.segment[i] < 3;
  assert.equal(apron.grid.elevation[i], owned ? Math.fround(apron.grid.sample(i % 3 * 512 - 512)) : apron.original[i],
    'only outward cells owned by the actual apron route continue its plane');
}
for (const [path, mapId] of [
  [straightPath, 'airfield'],
  [[[-480, -72], [-460, -72], [-424, -60]], 'reservoir'],
  [[[-480, -72], [-450, -72], [-470, -72], [-424, -72]], 'reservoir'],
]) {
  const result = apronFixture(path, onApron, mapId);
  assert.deepEqual(result.grid.elevation, result.original, 'no other-map, cross-bend or reversed apron propagation');
}

function crossSlope(field, x, z, nx, nz, span = 2) {
  return Math.abs(field.getHeightAt(x + nx * span / 2, z + nz * span / 2)
    - field.getHeightAt(x - nx * span / 2, z - nz * span / 2)) / span;
}
const failures = [
  { id: 'alpine', seed: 1337, x: -142, z: -510, nx: 1, nz: 0, span: 2, limit: 2, old: 2.046130209195251 },
  { id: 'alpine', seed: 2025, x: -50, z: 510, nx: 1, nz: 0, span: 2, limit: 2, old: 2.2056770037931983 },
  { id: 'alpine', seed: 2025, x: -28, z: 472, nx: 1, nz: 0, span: 2, limit: 1.4, old: 1.5010676125114628 },
  { id: 'reservoir', seed: 1337, x: -446, z: -72, nx: 1, nz: 0, span: 4, limit: .35, old: .42576754093170166 },
  { id: 'reservoir', seed: 2025, x: -446, z: -72, nx: 1, nz: 0, span: 4, limit: .35, old: .40824294090270996 },
];
const records = [], errors = [];
for (const id of ['alpine', 'reservoir']) for (const seed of [1337, 2025]) {
  const config = getMapConfig(id), old = before.createHeightField(seed, config), next = createHeightField(seed, config);
  assert.deepEqual(next._layout.roads, old._layout.roads, 'no new road alignment changes');
  assert.deepEqual(next._layout.roadStations, old._layout.roadStations);
  assert.deepEqual(Object.keys(next), Object.keys(old), 'no returned owner fields');
  for (const fixture of failures.filter(row => row.id === id && row.seed === seed)) {
    const prior = crossSlope(old, fixture.x, fixture.z, fixture.nx, fixture.nz, fixture.span);
    const current = crossSlope(next, fixture.x, fixture.z, fixture.nx, fixture.nz, fixture.span);
    assert.equal(prior, fixture.old, 'literal predecessor reproduces the retained actual failure exactly');
    assert.ok(prior > fixture.limit, 'actual old-bug negative fails the unchanged physical gate');
    records.push({ ...fixture, prior, current });
    if (current > fixture.limit) errors.push(`${id}/${seed} fixed physical failure (${current} > ${fixture.limit})`);
  }
  for (const p of [config.spawns.player, ...config.spawns.enemies, ...(config.terrain.lakes ?? [])]) {
    assert.equal(next.getHeightAt(p.x, p.z), old.getHeightAt(p.x, p.z), 'actual pad and lake-centre height precedence remains exact');
  }
  if (id === 'alpine') {
    // x=-50 is32m from the adjacent north road(-18), not152m from an isolated
    // owner. Check both sides of that real neighboring outlet, no owner filter.
    const z = seed === 1337 ? -510 : 510, x = seed === 1337 ? -112 : -18;
    let maximum = 0;
    for (const side of [-1, 1]) for (let offset = 4; offset <= 64; offset += 2) {
      maximum = Math.max(maximum, crossSlope(next, x + side * offset, z, 1, 0));
    }
    if (maximum > 2) errors.push(`${id}/${seed} fixed neighboring-bank section exceeds2: ${maximum}`);
    records.push({ id, seed, neighboringBankMaximum: maximum });
  }
}
console.log(JSON.stringify({ test: 'roadCutRecovery', records, errors,
  scope: 'fixed retained failure sections, exact support zeros and apron ownership only; no dense footprint/native/performance approval' }));
assert.deepEqual(errors, [], 'fixed retained physical gates remain strict');
