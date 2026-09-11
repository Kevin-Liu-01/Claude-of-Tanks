import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { alignFjordNorthernRoadGrades, alignCopperNorthernRoadGrades, minimumRoadSegmentRadius,
  roadBorderCorridorStart, stampRoadBorderCorridors, usesBoundedRoadShoulders } from './maps/roadBorderCorridor.ts';
import { createLayout, createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';

const boundedMaps = ['alpine', 'reservoir', 'monsoon', 'blackglass', 'titan_gorge', 'skybridge', 'badlands'];
const borderURL = new URL('./maps/roadBorderCorridor.ts', import.meta.url);
const borderSource = readFileSync(borderURL, 'utf8');
const capStatement = "const stampLimit = mapId === 'skybridge' ? 68 : 64;";
assert.equal(borderSource.split(capStatement).length, 2, 'one actual construction-only cap policy');
const oldURL = `${borderURL.href}?selftest=old64mStamp`;
const profileStatement = 'const coreWidth = fullWidth ? 0 : 6;';
assert.equal(borderSource.split(profileStatement).length, 2, 'one actual Skybridge profile policy');
const oldProfileURL = `${borderURL.href}?selftest=old6mCore`;
const terrainURL = new URL('./terrain.ts', import.meta.url);
const oldTerrainURL = `${terrainURL.href}?selftest=old6mCore`;
const terrainSource = readFileSync(terrainURL, 'utf8');
assert.equal(terrainSource.split("'./maps/roadBorderCorridor.ts'").length, 2);
const hooks = registerHooks({ load(url, context, next) {
  if (url === oldURL) return { format: 'module-typescript', shortCircuit: true,
    source: borderSource.replace(capStatement, 'const stampLimit = 64;') };
  if (url === oldProfileURL) return { format: 'module-typescript', shortCircuit: true,
    source: borderSource.replace(profileStatement, 'const coreWidth = 6;') };
  if (url === oldTerrainURL) return { format: 'module-typescript', shortCircuit: true,
    source: terrainSource.replace("'./maps/roadBorderCorridor.ts'", JSON.stringify(oldProfileURL)) };
  return next(url, context);
} });
let old64Stamp, oldProfileStamp, oldCreateHeightField;
try {
  old64Stamp = (await import(oldURL)).stampRoadBorderCorridors;
  oldProfileStamp = (await import(oldProfileURL)).stampRoadBorderCorridors;
  oldCreateHeightField = (await import(oldTerrainURL)).createHeightField;
}
finally { hooks.deregister(); }
const paths = [[[0, -450], [0, 450]]];
const roads = [[[0, -512], ...paths[0], [0, 512]]];
const original = new Float32Array(257 * 257).fill(.125);
const corridor = original.slice(), twin = original.slice();
assert.equal(stampRoadBorderCorridors(undefined, roads, paths, 0, 42, corridor, 257, 1024), null);
assert.deepEqual(corridor, original, 'unowned layouts remain exact');
assert.equal(stampRoadBorderCorridors('frontier', paths, paths, 0, 42, corridor, 257, 1024), null);
assert.deepEqual(corridor, original, 'no added boundary means no stamp');
assert.equal(stampRoadBorderCorridors('frontier', roads, paths, 0, 42, corridor, 257, 1024), 430);
stampRoadBorderCorridors('frontier', roads, paths, 0, 42, twin, 257, 1024);
assert.deepEqual(corridor, twin, 'construction stamp is deterministic');
let changed = 0;
for (let iz = 0; iz < 257; iz++) for (let ix = 0; ix < 257; ix++) {
  const x = ix * 4 - 512, z = iz * 4 - 512, at = iz * 257 + ix;
  assert.ok(corridor[at] >= original[at] && corridor[at] <= 1);
  if (Math.max(Math.abs(x), Math.abs(z)) <= 434 || Math.abs(x) >= 106.8) {
    assert.equal(corridor[at], original[at], 'non-support grid vertices remain exact');
  }
  if (corridor[at] !== original[at]) changed++;
}
assert.ok(changed > 0 && changed < original.length * .05);
assert.equal(corridor[128], 1, 'the centre of the boundary opening reaches full corridor weight');
stampRoadBorderCorridors('frontier', roads, paths, 0, 42, corridor, 257, 1024);
assert.deepEqual(corridor, twin, 'max-composition is idempotent, not accumulative erosion');
for (const id of boundedMaps) {
  const narrow = new Float32Array(257 * 257);
  const cap = id === 'skybridge' ? 68 : 64;
  assert.equal(stampRoadBorderCorridors(id, roads, paths, 0, 52, narrow, 257, 1024),
    id === 'alpine' || id === 'reservoir' ? 418 : 430);
  for (let iz = 0; iz < 257; iz++) for (let ix = 0; ix < 257; ix++) {
    if (Math.abs(ix * 4 - 512) >= cap) assert.equal(narrow[iz * 257 + ix], 0,
      `${id}: construction stamp retains its explicitly owned ${cap}m half-strip`);
  }
  assert.ok(narrow[143] > 0, `${id}: the60m edge has a smooth, nonzero construction taper`);
  assert.equal(narrow[144] > 0, id === 'skybridge', 'only Skybridge owns the extra existing4m grid cell');
  if (id === 'skybridge') for (let x = 0; x <= 68; x += 4) {
    // At the boundary the radial/longitudinal admissions are fully open.
    const t = x / 68, expected = Math.fround(1 - t * t * (3 - 2 * t));
    assert.equal(narrow[128 + x / 4], expected, 'the full owned width carries the cubic, without a hidden flat core');
  }
}
let unchangedStampMaps = 0;
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id), layout = createLayout(cfg), spec = layout.terrain.roads;
  if (spec === 'country' || !spec.paths) { unchangedStampMaps++; continue; }
  const before = new Float32Array(257 * 257).fill(.125), after = before.slice();
  const oldProfile = before.slice();
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  assert.equal(stampRoadBorderCorridors(id, layout.roads, spec.paths, offset, cfg.terrain.rimH, after, 257, 1024),
    old64Stamp(id, layout.roads, spec.paths, offset, cfg.terrain.rimH, before, 257, 1024));
  oldProfileStamp(id, layout.roads, spec.paths, offset, cfg.terrain.rimH, oldProfile, 257, 1024);
  if (id === 'skybridge') {
    assert.notDeepEqual(after, before, 'old64m stamp is a discriminating Skybridge negative');
    assert.notDeepEqual(after, oldProfile, 'old6m core is a discriminating profile negative');
    for (let i = 0; i < after.length; i++) assert.ok(after[i] <= oldProfile[i], 'profile never expands the stamp');
  } else {
    assert.deepEqual(after, before, `${id}: complete construction grid remains byte-exact`);
    assert.deepEqual(after, oldProfile, `${id}: no other-map profile change`); unchangedStampMaps++;
  }
}
assert.equal(unchangedStampMaps, 29);
const skyConfig = getMapConfig('skybridge');
const oldSky = oldCreateHeightField(1337, skyConfig), newSky = createHeightField(1337, skyConfig);
assert.deepEqual(newSky._layout, oldSky._layout, 'profile does not change road/layout/station ownership');
assert.deepEqual(Object.keys(newSky), Object.keys(oldSky), 'no retained owner or grid field');
const peak = { x: -9.53341377998585, z: 496.9256020052129, nx: .9150246374414618, nz: -.4033979584419353 };
function peakSlope(field) {
  return Math.abs(field.getHeightAt(peak.x + peak.nx, peak.z + peak.nz)
    - field.getHeightAt(peak.x - peak.nx, peak.z - peak.nz)) / 2;
}
const oldPeak = peakSlope(oldSky), newPeak = peakSlope(newSky);
assert.equal(oldPeak, 2.008386024307697, 'actual predecessor reproduces the retained48m failure');
assert.ok(oldPeak > 2, 'old constant core fails the unchanged bank gate');
assert.ok(newPeak <= 2, 'fixed retained peak must pass; whole-bank gates remain separate');
assert.equal(minimumRoadSegmentRadius([300, -100], [100, -300]), 200, 'inward x=-z crossing owns the minimum');
assert.equal(minimumRoadSegmentRadius([100, -300], [300, -100]), 200, 'reversing the route preserves the bound');
assert.equal(minimumRoadSegmentRadius([100, 300], [300, 100]), 200, 'x=z crossing is also checked');
assert.equal(minimumRoadSegmentRadius([-100, -100], [100, 100]), 0, 'a centre crossing is not bounded by endpoints');
assert.equal(minimumRoadSegmentRadius([25, -30], [25, 30]), 25, 'axis-parallel plateaus are bounded');
assert.equal(minimumRoadSegmentRadius([15, 20], [15, 20]), 20, 'degenerate segments remain finite');
assert.equal(roadBorderCorridorStart('alpine',
  [[[400, 350], [400, 400], [100, 100], [100, 512]]],
  [[[400, 350], [400, 400]]], 0, 1024), 68, 'the actual bent added polyline, not its endpoint chord, owns admission');
const bounds = {};
for (const [id, expected, historical] of [['fjord', 430, false], ['alpine', 378, true],
  ['reservoir', 311.8490566037736, true], ['alpine', 448, false], ['reservoir', 448, false]]) {
  const cfg = historical ? originalExitConfig(getMapConfig(id)) : getMapConfig(id);
  const layout = createLayout(cfg), grid = new Float32Array(257 * 257);
  const start = roadBorderCorridorStart(id, layout.roads, cfg.terrain.roads.paths, 0, 1024);
  assert.ok(Math.abs(start - expected) < 1e-10, `${id} uses the reviewed geometric opening`);
  assert.equal(stampRoadBorderCorridors(id, layout.roads, cfg.terrain.roads.paths, 0,
    cfg.terrain.rimH, grid, 257, 1024), start);
  for (let iz = 0; iz < 257; iz++) for (let ix = 0; ix < 257; ix++) {
    if (Math.max(Math.abs(ix * 4 - 512), Math.abs(iz * 4 - 512)) <= start + 4) {
      assert.equal(grid[iz * 257 + ix], 0, `${id} retains the inner-square cell guard`);
    }
  }
  if (historical && id === 'alpine') assert.ok(grid[((440 + 512) / 4) * 257 + (216 + 512) / 4] > .9);
  if (historical && id === 'reservoir') assert.ok(grid[((-404 + 512) / 4) * 257 + (260 + 512) / 4] > .9);
  bounds[`${id}${historical ? '-historical' : ''}`] = start;
}
const fjordRoads = createLayout(getMapConfig('fjord')).roads;
const positions = JSON.stringify(fjordRoads);
const elevations = fjordRoads.map((nodes, route) => nodes.map(p => route * 12 + p[1] * .03));
const priorElevations = elevations.map(row => [...row]);
alignFjordNorthernRoadGrades('alpine', fjordRoads, elevations);
assert.deepEqual(elevations, priorElevations, 'other maps retain their construction grades');
alignFjordNorthernRoadGrades('fjord', fjordRoads, elevations);
assert.equal(JSON.stringify(fjordRoads), positions, 'station coordinates are immutable');
const level = (priorElevations[1].at(-1) + priorElevations[2].at(-1)) * .5;
const gradeA = (priorElevations[1].at(-1) - priorElevations[1].at(-2))
  / (fjordRoads[1].at(-1)[1] - fjordRoads[1].at(-2)[1]);
const gradeB = (priorElevations[2].at(-1) - priorElevations[2].at(-2))
  / (fjordRoads[2].at(-1)[1] - fjordRoads[2].at(-2)[1]);
const grade = (gradeA + gradeB) * .5;
let alignedNodes = 0;
for (let route = 0; route < fjordRoads.length; route++) {
  for (let index = 0; index < fjordRoads[route].length; index++) {
    const z = fjordRoads[route][index][1], h = elevations[route][index];
    if (route < 1 || route > 2 || z <= 398) assert.equal(h, priorElevations[route][index]);
    else if (z >= 430) {
      assert.equal(h, level + (z - 512) * grade, 'overlapping roads use the exact same plane');
      alignedNodes++;
    }
    else assert.ok(h >= Math.min(priorElevations[route][index], level + (z - 512) * grade)
      && h <= Math.max(priorElevations[route][index], level + (z - 512) * grade));
  }
}
assert.ok(alignedNodes >= 6, 'the common plane covers approach segments, not only endpoints');

// Exact predecessor arithmetic, from the pre-Copper border module SHA256
// 990fa67afa9952f21fc18220a60a985b964fea7fafe1de1d73848bac8551b390.
// Literal fixture: no Git-history dependency or whole-file golden assertion.
function legacyFjordPlane(roads, elevations) {
  const a = roads[1], b = roads[2], ea = elevations[1], eb = elevations[2];
  const ai = a.length - 1, bi = b.length - 1;
  const gradeA = (ea[ai] - ea[ai - 1]) / (a[ai][1] - a[ai - 1][1]);
  const gradeB = (eb[bi] - eb[bi - 1]) / (b[bi][1] - b[bi - 1][1]);
  const grade = Math.max(-.12, Math.min(.12, (gradeA + gradeB) * .5));
  const level = (ea[ai] + eb[bi]) * .5;
  for (let route = 1; route <= 2; route++) {
    const nodes = roads[route], row = elevations[route];
    for (let index = 0; index < nodes.length; index++) {
      const z = nodes[index][1];
      if (z <= 398) continue;
      const target = level + (z - 512) * grade;
      const t = Math.max(0, Math.min(1, (z - 398) / 32));
      row[index] = z >= 430 ? target : row[index] + (target - row[index]) * (t * t * (3 - 2 * t));
    }
  }
}
for (const slope of [-.4, -.03, 0, .03, .4]) {
  const actual = fjordRoads.map((nodes, route) => nodes.map(p => route * 12 + p[1] * slope));
  const expected = actual.map(row => [...row]);
  legacyFjordPlane(fjordRoads, expected);
  alignFjordNorthernRoadGrades('fjord', fjordRoads, actual);
  assert.deepEqual(actual, expected, 'Fjord keeps exact predecessor arithmetic, including both grade clamps');
}
const copperRoads = createLayout(getMapConfig('copper_mesa')).roads;
const copperXY = JSON.stringify(copperRoads);
const copperBefore = copperRoads.map((nodes, route) => nodes.map(p => route * 12 + p[1] * .03));
for (const id of [undefined, ...MAP_IDS.filter(id => id !== 'copper_mesa')]) {
  const rows = copperBefore.map(row => [...row]);
  alignCopperNorthernRoadGrades(id, copperRoads, rows);
  assert.deepEqual(rows, copperBefore, `${id}: Copper alignment does not touch another map`);
}
function gradeAtZ(road, row, z) {
  for (let i = road.length - 1; i > 0; i--) {
    if (z >= road[i - 1][1] && z <= road[i][1]) {
      const t = (z - road[i - 1][1]) / (road[i][1] - road[i - 1][1]);
      return row[i - 1] + (row[i] - row[i - 1]) * t;
    }
  }
  throw new Error('missing northern road station');
}
function assertCopperPlane(rows) {
  const reference = copperBefore.map(row => [...row]);
  legacyFjordPlane(copperRoads, reference);
  assert.deepEqual(rows, reference, 'only roads1/2 north of398 share the existing bounded plane/tie-in');
  for (const z of [470, 487, 488.71299978048773, 500, 512]) {
    assert.ok(Math.abs(gradeAtZ(copperRoads[1], rows[1], z)
      - gradeAtZ(copperRoads[2], rows[2], z)) < 1e-12,
    'both approaches agree at a common z, including the measured owner-switch latitude');
  }
}
const copperElevations = copperBefore.map(row => [...row]);
alignCopperNorthernRoadGrades('copper_mesa', copperRoads, copperElevations);
assertCopperPlane(copperElevations);
assert.equal(JSON.stringify(copperRoads), copperXY, 'all authored XY and sampled station ordinals stay exact');
for (const mutation of ['incomplete', 'wrongAnchor', 'wrongExit']) {
  const broken = copperRoads.map(road => road.map(p => [...p]));
  if (mutation === 'incomplete') broken[1].pop();
  if (mutation === 'wrongAnchor') broken[1].find(p => p[0] === -72 && p[1] === 462)[0]++;
  if (mutation === 'wrongExit') broken[2].at(-1)[0]++;
  const rows = copperBefore.map(row => [...row]);
  assert.throws(() => alignCopperNorthernRoadGrades('copper_mesa', broken, rows), /ownership changed/);
  assert.deepEqual(rows, copperBefore, 'bad ownership fails before changing any elevation');
}
const planeSource = borderSource.slice(borderSource.indexOf('function alignNorthernRoadPlane('),
  borderSource.indexOf('/** Explicit policy only;'));
assert.ok(planeSource.includes('if (z <= 398) continue;'), 'actual bounded plane is loaded for mutation');
const terminalOnly = new Function('smooth', `${stripTypeScriptTypes(planeSource.replace(
  'if (z <= 398) continue;', 'if (z < 512) continue;'))}; return alignNorthernRoadPlane;`)(() => 0);
const brokenPlane = copperBefore.map(row => [...row]);
terminalOnly(copperRoads, brokenPlane);
assert.throws(() => assertCopperPlane(brokenPlane), /bounded plane/,
  'aligning only endpoints leaves the actual northern approach ownership discontinuity');
for (const id of [...MAP_IDS, undefined, 'unknown']) {
  assert.equal(usesBoundedRoadShoulders(id), boundedMaps.includes(id), `${id}: explicit six-map admission only`);
}

// Execute the actual constraint body with explicit lake/pad fixtures. The
// sampler records admission/counts only; this is not a timing benchmark.
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const supportAt = terrainSource.indexOf('    const roadCorridorWeight =');
const supportSource = terrainSource.slice(supportAt, terrainSource.indexOf(';', supportAt) + 1);
const distanceWeightSource = terrainSource.slice(terrainSource.indexOf('function roadCorridorDistanceWeight('),
  terrainSource.indexOf('function roadRimWeight('));
assert.ok(distanceWeightSource.includes('function roadCorridorDistanceWeight('), 'actual extracted distance policy is present');
const supportWeight = new Function('boundedRoadCorridor', 'cw', 'rd', 'smoothstep',
  `${stripTypeScriptTypes(distanceWeightSource)}
  ${supportSource}\n return roadCorridorWeight;`);
for (const [distance, expected] of [[0, 1], [18, 1], [41, .5], [64, 0], [100, 0]]) {
  for (const id of boundedMaps) assert.equal(supportWeight(usesBoundedRoadShoulders(id), 1, distance, smoothstep), expected);
  assert.equal(supportWeight(usesBoundedRoadShoulders('fjord'), 1, distance, smoothstep), 1,
    'unbounded outer-border controls retain R3 support');
}
for (const edge of [18, 64]) {
  assert.ok(Math.abs(supportWeight(true, 1, edge - .001, smoothstep)
    - supportWeight(true, 1, edge + .001, smoothstep)) < 2e-9, 'both support joins are smooth');
}
const constraintSource = terrainSource.slice(terrainSource.indexOf('  function applyHeightConstraints('),
  terrainSource.indexOf('  function heightAt(', terrainSource.indexOf('  function applyHeightConstraints(')));
const constraintFactory = new Function('fixture', `
  const { GN, gRoadDist, gRoadElev, sampleHeightGridCell, composeLakeHeight,
    _LAKES, lakeLevels, liquidLakeBanks, continuousLakeAprons, lakeHeightResult,
    padPts, padYs, smoothstep, waterRampStart, waterRampEnd, noi } = fixture;
  ${stripTypeScriptTypes(constraintSource)}
  return applyHeightConstraints;
`);
function runConstraint({ distance = 30, weight = .75, marsh = 0, lake = null, pad = false, roadsOn = true } = {}) {
  const rd = [distance], elev = [10], reads = { distance: 0, elevation: 0 };
  const fixture = { GN: 1, gRoadDist: rd, gRoadElev: elev,
    sampleHeightGridCell: arr => { reads[arr === rd ? 'distance' : 'elevation']++; return arr[0]; },
    composeLakeHeight: (_lakes, _levels, _banks, _authored, _x, _z, height, _settlement, out) => {
      out.height = lake ?? height; out.wetness = 0;
    },
    _LAKES: [], lakeLevels: [], liquidLakeBanks: null, continuousLakeAprons: false, lakeHeightResult: {},
    padPts: pad ? [{ x: 0, z: 0 }] : [], padYs: [22],
    smoothstep,
    waterRampStart: .2, waterRampEnd: .8, noi: { noise: () => 0 } };
  const height = constraintFactory(fixture)(0, 0, 40, marsh, 0, true, true, roadsOn, 0, 0, 0, weight,
    roadsOn ? distance : Infinity);
  return { height, ...reads };
}
assert.deepEqual(runConstraint(), { height: 17.5, distance: 0, elevation: 1 }, 'constraints reuse the caller-supplied distance');
assert.deepEqual(runConstraint({ distance: 2 }), { height: 10, distance: 0, elevation: 1 }, 'ordinary road reuses its elevation sample');
assert.deepEqual(runConstraint({ lake: -8 }), { height: -8, distance: 0, elevation: 1 }, 'frozen/liquid lake composition wins over added grading');
assert.deepEqual(runConstraint({ pad: true }), { height: 22, distance: 0, elevation: 1 }, 'dry pad support wins over added grading');
assert.deepEqual(runConstraint({ marsh: 1 }), { height: 40, distance: 0, elevation: 0 }, 'composed marsh core never samples/uses extended grade');
assert.deepEqual(runConstraint({ weight: 0 }), { height: 40, distance: 0, elevation: 0 });
assert.deepEqual(runConstraint({ roadsOn: false }), { height: 40, distance: 0, elevation: 0 });
assert.deepEqual(runConstraint({ distance: 64, weight: supportWeight(true, 1, 64, smoothstep) }),
  { height: 40, distance: 0, elevation: 0 }, 'deployment CW outside the road shoulder does not read the road plane');
for (const weight of [0, .25, .75, 1]) {
  assert.equal(runConstraint({ weight, lake: -8 }).height, -8, 'lake priority through the full admission ramp');
  assert.equal(runConstraint({ weight, pad: true }).height, 22, 'dry-pad priority through the full admission ramp');
  assert.equal(runConstraint({ weight, marsh: 1 }).height, 40, 'marsh priority through the full admission ramp');
}
console.log(JSON.stringify({ test: 'roadBorderCorridor', changedVertices: changed,
  alignedNodes, bounds, unchangedStampMaps, retainedSkyPeak: { old: oldPeak, current: newPeak },
  constraintCases: 20, extraElevationInterpolationsPerSupportedShoulder: 1,
  scope: 'construction-only weight bounds/determinism; geometry and cost require separate evidence' }));
