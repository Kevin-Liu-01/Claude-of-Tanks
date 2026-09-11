import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createLayout, createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { ROAD_ENDPOINT_INTENTS, completeRoadEndpoints, roadIntersection, roadNetworkComponentCount, alignHardstandRoadPortals } from './maps/roadEndpoints.ts';
import { gradeRoadPortalShoulders, roadPortalInnerSquare } from './fixtures/legacyRoadPortalShoulders.ts';
import { alignFjordNorthernRoadGrades, roadBorderCorridorStart } from './maps/roadBorderCorridor.ts';

// The historical no-completion constructor must also omit the later grade
// alignment owned by those added Fjord termini. All other production code,
// including the real corridor stamp and map-ID policies, remains in the control.
const terrainURL = new URL('./terrain.ts', import.meta.url);
const referenceURL = `${terrainURL.href}?withoutRoadCompletion`;
const borderURL = new URL('./maps/roadBorderCorridor.ts?withoutRoadCompletion', import.meta.url).href;
const terrainSource = readFileSync(terrainURL, 'utf8');
const borderImport = "from './maps/roadBorderCorridor.ts'";
assert.equal(terrainSource.split(borderImport).length, 2, 'one actual border-module import is injected');
const referenceHooks = registerHooks({ load(url, context, next) {
  if (url === referenceURL) return { format: 'module-typescript', shortCircuit: true,
    source: terrainSource.replace(borderImport, "from './maps/roadBorderCorridor.ts?withoutRoadCompletion'") };
  if (url === borderURL) return { format: 'module', shortCircuit: true,
    source: "export * from './roadBorderCorridor.ts'; export function alignFjordNorthernRoadGrades() {} export function alignCopperNorthernRoadGrades() {}" };
  return next(url, context);
} });
let referenceHeightField;
try { referenceHeightField = (await import(referenceURL)).createHeightField; }
finally { referenceHooks.deregister(); }

function distance(point, road) {
  let best = Infinity;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  return best;
}
function connected(a, b) {
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    if (roadIntersection(a[i - 1], a[i], b[j - 1], b[j]) !== null) return true;
  }
  return false;
}
function portalEnvelope(mapId, config, x, z) {
  const spec = config.terrain.roads;
  if (spec === 'country' || !spec.paths) return false;
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  const width = Math.max(32, 6 + Math.abs(config.terrain.rimH) * 2.4);
  return spec.paths.some((path, index) => [0, 1].some(end => {
    if (ROAD_ENDPOINT_INTENTS[mapId][index + offset][end] !== 'boundary') return false;
    const a = end ? path.at(-1) : path[0], b = end ? path.at(-2) : path[1];
    const dx = a[0] - b[0], dz = a[1] - b[1], length = Math.hypot(dx, dz);
    return ((x - a[0]) * dx + (z - a[1]) * dz) / length > -32
      && Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / length < width;
  }));
}
export function assertRoadNetwork(mapId, roads) {
  const intents = ROAD_ENDPOINT_INTENTS[mapId];
  assert.equal(roads.length, intents.length, `${mapId}: every route has two explicit endpoint owners`);
  roads.forEach((road, index) => {
    for (let i = 1; i < road.length; i++) {
      const length = Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]);
      // Legacy country/grid samples are32m along an axis, with a small
      // cross-axis curve; authored/added straight segments are <=32m long.
      assert.ok(length > 1e-7 && length <= 34, `${mapId}/${index}: finite nondegenerate bounded sampling`);
    }
    intents[index].forEach((intent, end) => {
      const p = end ? road.at(-1) : road[0];
      if (intent === 'boundary') assert.ok(Math.abs(Math.max(...p.map(Math.abs)) - 512) < 1e-7, `${mapId}/${index}/${end}: portal reaches terrain edge`);
      else if (intent === 'loop') assert.deepEqual(road[0], road.at(-1), 'closed loop has no naked terminal');
      else if (intent === 'shore') {
        assert.equal(mapId, 'coastal', 'no undocumented yard/shore terminal exemption');
        assert.equal(p[0], 262, 'shore road reaches exact authored strand limit, not the previous256m sample');
      } else assert.ok(distance(p, roads[intent.junction]) < 1e-6, `${mapId}/${index}/${end}: endpoint touches named spine${intent.junction}`);
    });
  });
  const visited = new Set([0]), pending = [0];
  while (pending.length) {
    const i = pending.pop();
    for (let j = 0; j < roads.length; j++) if (!visited.has(j) && connected(roads[i], roads[j])) {
      visited.add(j); pending.push(j);
    }
  }
  assert.equal(visited.size, roads.length, `${mapId}: every road is in one segment-intersection component`);
}

assert.equal(roadIntersection([-10, 0], [10, 0], [0, -10], [0, 10]), .5, 'interior crossings do not need shared sampled vertices');
assert.equal(roadIntersection([0, 0], [10, 0], [4, 0], [20, 0]), .4, 'collinear overlap joins');
assert.equal(roadIntersection([0, 0], [10, 0], [10, 0], [10, 10]), 1, 'endpoint contact joins');
assert.equal(roadIntersection([0, 0], [10, 0], [0, 1], [10, 1]), null, 'parallel close roads are not connected');
assert.equal(roadIntersection([0, 0], [10, 0], [11, 0], [20, 0]), null, 'collinear gap is not connected');
assert.equal(roadNetworkComponentCount([[[-10, 0], [10, 0]], [[0, -10], [0, 10]]]), 1);
assert.equal(roadNetworkComponentCount([[[0, 0], [10, 0]], [[0, 1], [10, 1]]]), 2, 'spanning both deployment regions does not prove connectivity');
const partialGrid = createLayout({ terrain: { roads: { grid: {
  xs: [{ at: 10, lo: -13, hi: 42 }], zs: [{ at: -3, lo: -22, hi: 59 }], jitter: 0,
} } } }).roads;
assert.deepEqual(partialGrid, [[[10, -13], [10, 19], [10, 42]], [[-22, -3], [10, -3], [42, -3], [59, -3]]]);
const syntheticPaths = [[[0, -400], [0, -300]]], syntheticRoads = [[[0, -512], ...syntheticPaths[0], [0, 512]]];
const supportWidth = 6 + 32 * 2.4;
const supportHeight = x => gradeRoadPortalShoulders('frontier', syntheticRoads, syntheticPaths, 0, x, -500, 100, 32, () => 0);
assert.equal(supportHeight(supportWidth), 100, 'bounded support cannot alter terrain outside its domain');
assert.ok(Math.abs(supportHeight(supportWidth - .001) - supportHeight(supportWidth + .001)) < 1e-6,
  'even a100m cut returns continuously to untouched terrain at support edge');
const apronGrid = { size: 3, mapSize: 1024,
  route: new Int16Array([0, 0, 0, 1, 1, 0, 0, 0, 0]),
  segment: new Int16Array([0, 1, 0, 0, 1, 0, 1, 0, 1]),
  elevation: Float32Array.from({ length: 9 }, (_, i) => 20 + i),
  sample: x => 11 + .03 * (x + 424),
};
const apronOriginal = apronGrid.elevation.slice();
const apronRoad = [[[-512, -72], [-424, -72], [-364, -72]]], apronPath = [[[-424, -72], [-364, -72]]];
alignHardstandRoadPortals('reservoir', apronRoad, apronPath, 0, apronGrid, () => false);
assert.deepEqual(apronGrid.elevation, apronOriginal, 'unowned apron is an exact no-op');
alignHardstandRoadPortals('reservoir', apronRoad, apronPath, 0, apronGrid, () => true);
for (let i = 0; i < apronOriginal.length; i++) {
  const expected = apronGrid.route[i] === 0 && apronGrid.segment[i] === 0
    ? Math.fround(apronGrid.sample((i % 3) * 512 - 512)) : apronOriginal[i];
  assert.equal(apronGrid.elevation[i], expected, 'only added route/segment cells continue the stamped apron plane');
}

const changed = [], safety = [], physicalFailures = [];
function physicalCheck(ok, mapId, check, actual, limit, message, location = null) {
  if (!ok) physicalFailures.push({ mapId, check, actual, limit, message, location });
}
let originalNodeCount = 0, completedNodeCount = 0;
function withoutCompletion(mapId, build) {
  // Disable only this new endpoint policy for the negative control. Keeping
  // the map ID is essential: Copper Mesa has an ID-keyed quarry plane.
  const intent = ROAD_ENDPOINT_INTENTS[mapId];
  delete ROAD_ENDPOINT_INTENTS[mapId];
  try { return build(); }
  finally { ROAD_ENDPOINT_INTENTS[mapId] = intent; }
}
function originalConfig(config) {
  if (config.id !== 'coastal') return config;
  // The old32m sampler's last node was256 rather than authored hi262.
  // Reproduce that actual old endpoint for terrain/water/cost controls too.
  const roads = config.terrain.roads, grid = roads.grid;
  return { ...config, terrain: { ...config.terrain, roads: { ...roads,
    grid: { ...grid, zs: grid.zs.map(row => typeof row === 'number' ? row : { ...row, hi: 256 }) },
  } } };
}
function portalBoundaryJump(mapId, config, roads, field) {
  const spec = config.terrain.roads;
  if (spec === 'country' || !spec.paths) return 0;
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  const width = Math.max(32, 6 + Math.abs(config.terrain.rimH) * 2.4);
  let jump = 0;
  spec.paths.forEach((path, index) => [0, 1].forEach(end => {
    if (ROAD_ENDPOINT_INTENTS[mapId][index + offset][end] !== 'boundary') return;
    const road = roads[index + offset], a = end ? path.at(-1) : path[0], b = end ? road.at(-1) : road[0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) return;
    const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
    for (let along = -30; along <= length; along += 4) for (const side of [-1, 1]) {
      const x = a[0] + ux * along + uz * width * side, z = a[1] + uz * along - ux * width * side;
      if (Math.max(Math.abs(x), Math.abs(z)) >= 511.99) continue;
      const inside = field.getHeightAt(x - uz * side * .001, z + ux * side * .001);
      const outside = field.getHeightAt(x + uz * side * .001, z - ux * side * .001);
      jump = Math.max(jump, Math.abs(outside - inside));
    }
  }));
  return jump;
}
function assertInteriorExclusion(mapId, config, roads, field) {
  const spec = config.terrain.roads;
  if (spec === 'country' || !spec.paths) return;
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  const half = roadPortalInnerSquare(mapId, roads, spec.paths, offset, config.terrain.rimH);
  if (!Number.isFinite(half)) return;
  for (let i = -16; i <= 16; i++) for (const sign of [-1, 1]) for (const axis of [0, 1]) {
    const p = [half * i / 16, sign * (half - .001)];
    if (axis) p.reverse();
    const excluded = gradeRoadPortalShoulders(mapId, roads, spec.paths, offset, ...p, 10000,
      config.terrain.rimH, () => 0);
    physicalCheck(Object.is(excluded, 10000), mapId, 'interiorExclusion', excluded, '===10000',
      `${mapId}: full helper proves interior exclusion is conservative`, p);
    const inner = [...p], outer = [...p], crossAxis = axis ? 0 : 1;
    outer[crossAxis] += sign * .002;
    const jump = Math.abs(field.getHeightAt(...inner) - field.getHeightAt(...outer));
    physicalCheck(jump < .03, mapId, 'interiorSeam', jump, '<.03',
      `${mapId}: scalar exclusion threshold is continuous`, p);
  }
}
function assertCurrentCorridorSeam(mapId, config, roads, field) {
  const spec = config.terrain.roads;
  if (spec === 'country' || !spec.paths) return;
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  const start = roadBorderCorridorStart(mapId, roads, spec.paths, offset, 1024);
  if (start === null) return;
  // The legacy inner-square oracle above remains a historical control. The
  // current sampled corridor instead admits its blend at this actual radius.
  // Probe both that start and the end of its32m admission on the real field.
  for (const radius of [start, start + 32]) {
    for (let i = -32; i <= 32; i++) for (const sign of [-1, 1]) for (const axis of [0, 1]) {
      const inner = [radius * i / 32, sign * (radius - .001)];
      const outer = [inner[0], sign * (radius + .001)];
      if (axis) { inner.reverse(); outer.reverse(); }
      const jump = Math.abs(field.getHeightAt(...inner) - field.getHeightAt(...outer));
      physicalCheck(jump < .03, mapId, 'currentCorridorSeam', jump, '<.03',
        'current radial admission is continuous across2mm', inner);
    }
  }
}
for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId), control = originalConfig(config);
  const source = withoutCompletion(mapId, () => createLayout(control).roads);
  const frozen = JSON.stringify(source), roads = createLayout(config).roads;
  originalNodeCount += source.flat().length;
  completedNodeCount += roads.flat().length;
  assertRoadNetwork(mapId, roads);
  const endpointSource = withoutCompletion(mapId, () => createLayout(config).roads);
  const endpointSnapshot = JSON.stringify(endpointSource);
  assert.deepEqual(completeRoadEndpoints(mapId, endpointSource), roads, 'production completion repeatable');
  assert.equal(JSON.stringify(endpointSource), endpointSnapshot, 'the actual passed completion input stays immutable');
  assert.equal(JSON.stringify(source), frozen, 'authored source polylines stay immutable');
  if (JSON.stringify(roads) === frozen && mapId !== 'coastal') {
    safety.push({ mapId, physicalSampled: false, reason: 'unchanged layout: original test sampling exemption retained' });
    continue;
  }
  changed.push(mapId);
  if (mapId === 'fjord') assert.throws(() => alignFjordNorthernRoadGrades(mapId, source,
    source.map(road => road.map(() => 0))), /Fjord northern grade ownership changed/,
  'the actual production alignment still rejects incomplete historical termini');
  const field = withoutCompletion(mapId, () => referenceHeightField(1337, control)), after = createHeightField(1337, config);
  if (after._createRoadPlacementSampler) assert.equal(typeof after._createRoadPlacementSampler, 'function');
  assert.deepEqual(Object.keys(after).filter(key => key !== '_createRoadPlacementSampler'),
    Object.keys(field).filter(key => key !== '_createRoadPlacementSampler'),
    'only the separately tested construction-only admission factory extends field ownership');
  assertInteriorExclusion(mapId, config, roads, after);
  assertCurrentCorridorSeam(mapId, config, roads, after);
  const supportBoundaryJump = portalBoundaryJump(mapId, config, roads, after);
  physicalCheck(supportBoundaryJump < .03, mapId, 'supportBoundaryJump', supportBoundaryJump, '<.03',
    `${mapId}: width±.001m probes reject a hard cut/fill support seam (${supportBoundaryJump}m)`);
  if (mapId === 'reservoir') {
    // Independent review's exact failure: a7.339288m step across2mm at the
    // southwest pass's97.2m support edge,184m beyond its original terminal.
    const x = 263.0225257983338, z = -506.4927449882259, length = Math.hypot(66, 40);
    const jump = Math.abs(after.getHeightAt(x + 40 / length * .001, z - 66 / length * .001)
      - after.getHeightAt(x - 40 / length * .001, z + 66 / length * .001));
    physicalCheck(jump < .03, mapId, 'reservoirRegressionSeam', jump, '<.03',
      'retained southwest pass regression stays continuous', [x, z]);
  }
  let addedSamples = 0, wetSamples = 0, wetShoulders = 0, worstGrade = 0;
  let finalGrade = 0, finalSideGrade = 0, shoulderGrade = 0, nearShoulderGrade = 0, maximumCut = 0;
  for (const road of roads) for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(length / 4);
    for (let j = 0; j < steps; j++) {
      const t = (j + .5) / steps, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (source.some(line => distance([x, z], line) < 1e-5)) continue;
      addedSamples++;
      if (field.getWaterMaskAt(x, z) > .2) wetSamples++;
      maximumCut = Math.max(maximumCut, Math.abs(after.getHeightAt(x, z) - field.getHeightAt(x, z)));
      // Grade is measured before a new road can flatten away the evidence.
      const dx = (b[0] - a[0]) / length * 2, dz = (b[1] - a[1]) / length * 2;
      worstGrade = Math.max(worstGrade, Math.abs(field.getHeightAt(x + dx, z + dz) - field.getHeightAt(x - dx, z - dz)) / 4);
      finalGrade = Math.max(finalGrade, Math.abs(after.getHeightAt(x + dx, z + dz) - after.getHeightAt(x - dx, z - dz)) / 4);
      finalSideGrade = Math.max(finalSideGrade, Math.abs(after.getHeightAt(x + dz, z - dx) - after.getHeightAt(x - dz, z + dx)) / 4);
      for (const side of [-1, 1]) for (const offset of [4, 6, 8, 10, 12, 14, 18, 24, 32, 48, 64, 96, 128, 160, 192]) {
        const px = x + dz * offset * side / 2, pz = z - dx * offset * side / 2;
        if (Math.max(Math.abs(px), Math.abs(pz)) > 510) continue;
        if (offset <= 18 && field.getWaterMaskAt(px, pz) > .2) wetShoulders++;
        const slope = Math.abs(after.getHeightAt(px + dz / 2, pz - dx / 2) - after.getHeightAt(px - dz / 2, pz + dx / 2)) / 2;
        shoulderGrade = Math.max(shoulderGrade, slope);
        if (offset <= 18) nearShoulderGrade = Math.max(nearShoulderGrade, slope);
      }
    }
  }
  let changedCells = 0, changedInteriorAwayFromRoads = 0, outsideEnvelope = 0, changedLiquidCells = 0, cells = 0;
  for (let z = -508; z <= 508; z += 8) for (let x = -508; x <= 508; x += 8) {
    cells++;
    if (Math.abs(after.getHeightAt(x, z) - field.getHeightAt(x, z)) <= 1e-4) continue;
    changedCells++;
    if (field.getWaterMaskAt(x, z) > .8) changedLiquidCells++;
    if (Math.max(Math.abs(x), Math.abs(z)) < 430 && field._roadDist(x, z) > 26 && after._roadDist(x, z) > 26) {
      const pads = [config.spawns.player, ...config.spawns.enemies];
      if (pads.every(p => Math.hypot(x - p.x, z - p.z) > 26)) {
        changedInteriorAwayFromRoads++;
        if (!portalEnvelope(mapId, config, x, z)) outsideEnvelope++;
      }
    }
  }
  safety.push({ mapId, physicalSampled: true, addedSamples, wetSamples, wetShoulders, worstGrade, finalGrade, finalSideGrade,
    shoulderGrade, nearShoulderGrade, maximumCut, changedCells, cells, changedInteriorAwayFromRoads,
    outsideEnvelope, changedLiquidCells, supportBoundaryJump });
  physicalCheck(Object.is(wetSamples, 0), mapId, 'wetSamples', wetSamples, '===0',
    `${mapId}: endpoint extension cannot pave previously wet ground`);
  physicalCheck(Object.is(wetShoulders, 0), mapId, 'wetShoulders', wetShoulders, '===0',
    `${mapId}: original water stays beyond the18m road exclusion margin`);
  physicalCheck(finalGrade <= .35, mapId, 'finalGrade', finalGrade, '<=.35',
    `${mapId}: completed carriageway grade remains <=35%`);
  physicalCheck(finalSideGrade <= .25, mapId, 'finalSideGrade', finalSideGrade, '<=.25',
    `${mapId}: completed carriageway crossfall remains <=25%`);
  physicalCheck(nearShoulderGrade <= 1.4, mapId, 'nearShoulderGrade', nearShoulderGrade, '<=1.4',
    `${mapId}: immediate shoulders cannot become vertical slot walls`);
  physicalCheck(shoulderGrade <= 2, mapId, 'shoulderGrade', shoulderGrade, '<=2',
    `${mapId}: wider cross-sections retain bounded banks and authored relief`);
  physicalCheck(Object.is(outsideEnvelope, 0), mapId, 'outsideEnvelope', outsideEnvelope, '===0',
    `${mapId}: existing interior terrain outside roads/pads/declared passes stays exact`);
  physicalCheck(Object.is(changedLiquidCells, 0), mapId, 'changedLiquidCells', changedLiquidCells, '===0',
    `${mapId}: no cut/fill changes existing liquid surface height`);
  physicalCheck(changedCells / cells < .14, mapId, 'changedFootprint', changedCells / cells, '<.14',
    `${mapId}: total changed grading footprint stays below14% on the8m grid`);
}
for (const mapId of ['fjord', 'delta', 'reservoir']) {
  const config = getMapConfig(mapId), a = createHeightField(2025, config), b = createHeightField(2025, config);
  for (const road of createLayout(config).roads) for (const [x, z] of road) {
    assert.equal(a.getHeightAt(x, z), b.getHeightAt(x, z), `${mapId}: alternate seed reconstructs exactly`);
    assert.equal(a.getWaterMaskAt(x, z), b.getWaterMaskAt(x, z));
  }
}
assert.ok(completedNodeCount <= originalNodeCount * 1.07, 'all30 shared road polyline nodes grow by less than7%');
console.log(JSON.stringify({ test: 'roadContinuity', maps: MAP_IDS.length, originalNodeCount, completedNodeCount,
  changed, safety, physicalFailures }));
assert.deepEqual(physicalFailures, [], 'all map physical gates retain their original limits');
