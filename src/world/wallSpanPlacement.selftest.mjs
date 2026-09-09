import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { DoubleSide, Euler, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { fitWallSpan, wallIslandEdges } from './wallSpanPlacement.ts';
import { DESTRUCTIBLE_TYPES, WALL_SEG } from './maps/inhabitKit.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { rayCollisionRecord, setObbShape } from './collision.ts';
import { box, jitterUV } from './propGeometry.ts';
import { prepareWorldStructureNightFixture, setWorldNightFixtureActive } from './worldNightFixtureInstances.ts';
import { applyStructureCollisionBand, deriveRuntimeStructureCollisionProfile,
  deriveRuntimeStructureCollisionWithSolids, deriveRuntimeStructureContactBand } from './structureCollision.ts';
import { attachGroundCoverSolidProfile, createGroundCoverSolidProfile,
  GROUND_COVER_PLACEMENT_BYTES } from './groundCoverClearance.ts';

const material = new MeshBasicMaterial({ side: DoubleSide });
const point = new Vector3(), normal = new Vector3();
const ray = new Raycaster();
let seams = 0, vertices = 0, legacyMisses = 0;
function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function makeRecord(span, sc) {
  const yaw = Math.atan2(span.x1 - span.x0, span.z1 - span.z0);
  const x = (span.x0 + span.x1) / 2, z = (span.z0 + span.z1) / 2;
  const ob = setObbShape({ min: [0, 0, 0], max: [0, 1.15 * sc, 0], kind: 'wallstone' }, x, z, .3 * sc, 1.54 * sc, yaw);
  return { x, y: 0, z, yaw, sc, h: 1.15 * sc, ob, col: structuredClone(ob), groundSupport: null };
}
function wall(geometry, field, span, sc, corrected = true) {
  const record = makeRecord(span, sc), matrix = new Matrix4();
  if (corrected) fitWallSpan(matrix, geometry, field, span, record, WALL_SEG);
  else {
    const ya = field.getHeightAt(span.x0, span.z0), yb = field.getHeightAt(span.x1, span.z1);
    const pitch = Math.atan2(yb - ya, WALL_SEG) * .85;
    matrix.compose(new Vector3(record.x, Math.min(ya, yb) - .13, record.z),
      new Quaternion().setFromEuler(new Euler(pitch, record.yaw, 0, 'YXZ')), new Vector3(sc, sc, sc));
  }
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); mesh.updateMatrixWorld(true);
  return { record, mesh, span };
}
function auditWall({ record, mesh }, geometry, field) {
  const attr = geometry.attributes.position, shape = record.ob.shape2;
  let minY = Infinity, maxY = -Infinity, minGround = Infinity, maxGround = -Infinity;
  let halfWidth = 0, halfLength = 0;
  for (let i = 0; i < attr.count; i++) {
    point.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrix);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    const dx = point.x - shape.cx, dz = point.z - shape.cz;
    assert.ok(Math.abs(dx * Math.cos(shape.yaw) - dz * Math.sin(shape.yaw)) <= shape.hw + 1e-8, 'thin plan-view cover contains actual width');
    assert.ok(Math.abs(dx * Math.sin(shape.yaw) + dz * Math.cos(shape.yaw)) <= shape.hl + 1e-8, 'plan-view cover contains pitched endpoints');
    const rx = point.x - record.x, rz = point.z - record.z;
    halfWidth = Math.max(halfWidth, Math.abs(rx * Math.cos(record.yaw) - rz * Math.sin(record.yaw)));
    halfLength = Math.max(halfLength, Math.abs(rx * Math.sin(record.yaw) + rz * Math.cos(record.yaw)));
    const ground = field.getHeightAt(point.x, point.z);
    minGround = Math.min(minGround, ground); maxGround = Math.max(maxGround, ground);
    if (attr.getY(i) <= .025) {
      assert.ok(point.y <= ground - .025 + 1e-7, 'ground-bearing masonry cannot float');
    }
    vertices++;
  }
  for (let i = -4; i <= 4; i++) for (let j = -1; j <= 1; j++) {
    const right = j * halfWidth, forward = i * halfLength / 4;
    const x = record.x + right * Math.cos(record.yaw) + forward * Math.sin(record.yaw);
    const z = record.z - right * Math.sin(record.yaw) + forward * Math.cos(record.yaw);
    const ground = field.getHeightAt(x, z);
    minGround = Math.min(minGround, ground); maxGround = Math.max(maxGround, ground);
  }
  assert.ok(Math.abs(record.ob.min[1] - minY) < 1e-8);
  assert.ok(Math.abs(record.ob.max[1] - maxY) < 1e-8, 'high end of sloped wall stays ballistic cover');
  assert.deepEqual(record.col, { ...record.ob }, 'shell and hull collision agree');
  assert.equal(record.y, minY);
  assert.equal(record.h, maxY - minY);
  assert.ok(Math.abs(record.groundSupport.min - minGround) < 1e-8);
  assert.ok(Math.abs(record.groundSupport.max - maxGround) < 1e-8);
  assert.ok(Math.abs(record.groundSupport.spread - (maxGround - minGround)) < 1e-8, 'wall receipt measures actual footprint support, not just center');
  assert.ok(shape.hw <= .45 * record.sc, 'masonry never turns into a broad route blocker');
}
function seamMisses(pair, field) {
  const { x1: x, z1: z } = pair[0].span, yaw = pair[0].record.yaw;
  const direction = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  let missed = 0;
  for (const offset of [-.02, 0, .02]) for (const height of [.2, .45, .7]) {
    const px = x + Math.sin(yaw) * offset, pz = z + Math.cos(yaw) * offset;
    ray.set(new Vector3(px - direction.x * 2, field.getHeightAt(px, pz) + height, pz - direction.z * 2), direction);
    ray.far = 4;
    const hits = ray.intersectObjects(pair.map(w => w.mesh), false);
    if (!hits.length) missed++;
    else if (pair[0].record.groundSupport) assert.ok(pair.some(w => rayCollisionRecord(ray.ray.origin, direction, w.record.col, 4, normal) >= 0), 'visible seam cover must have a corresponding collision hit');
  }
  return missed;
}
function checkRun(field, run, geometry, rng, label, filter = () => true) {
  const [x0, z0, x1, z1] = run, length = Math.hypot(x1 - x0, z1 - z0);
  const tx = (x1 - x0) / length, tz = (z1 - z0) / length;
  const count = Math.max(1, Math.round(length / WALL_SEG));
  const exclusions = Uint8Array.from({ length: count }, (_, k) =>
    filter((k * WALL_SEG + Math.min((k + 1) * WALL_SEG, length)) / 2) ? 0 : 1);
  const edges = wallIslandEdges(length, exclusions, WALL_SEG);
  let previous = null;
  for (let k = 0; k < count; k++) {
    const a = edges[k], b = edges[k + 1];
    if (exclusions[k]) { previous = null; continue; }
    const span = { x0: x0 + tx * a, z0: z0 + tz * a, x1: x0 + tx * b, z1: z0 + tz * b };
    const current = wall(geometry, field, span, .94 + rng() * .279);
    auditWall(current, geometry, field);
    if (previous) {
      const misses = seamMisses([previous, current], field);
      assert.equal(misses, 0, `${label} segment ${k}: actual masonry triangles retain continuous .2/.45/.7m cover across the shared endpoint`);
      seams++;
    }
    previous = current;
  }
}
for (const seed of [1, 177, 991]) {
  const geometry = DESTRUCTIBLE_TYPES.wallstone.build(seeded(seed));
  const originalPositions = geometry.attributes.position.array.slice();
  for (const yaw of [0, Math.PI / 2, Math.PI, -.71]) for (const grade of [-.3, 0, .3]) {
    const tx = Math.sin(yaw), tz = Math.cos(yaw);
    const field = { getHeightAt: (x, z) => (x * tx + z * tz) * grade + 3 };
    checkRun(field, [0, 0, tx * 18, tz * 18], geometry, seeded(seed), `plane ${yaw}/${grade}`);
    if (grade) {
      const spans = [0, 3].map(a => ({ x0: tx * a, z0: tz * a, x1: tx * (a + 3), z1: tz * (a + 3) }));
      legacyMisses += seamMisses(spans.map(s => wall(geometry, field, s, 1, false)), field);
    }
  }
  assert.deepEqual(geometry.attributes.position.array, originalPositions, 'no geometry, vertices or primitives added/rewritten');
  geometry.dispose();
}
assert.ok(legacyMisses > 0, 'regression test reproduces the old reversed-pitch seam holes');
for (const seed of [1337, 2049, 7719]) {
  const config = getMapConfig('reservoir'), field = createHeightField(seed, config);
  const geometry = DESTRUCTIBLE_TYPES.wallstone.build(seeded(seed));
  for (const run of config.props.wallRuns) {
    const [x0, z0, x1, z1, gap] = run, length = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / length, tz = (z1 - z0) / length;
    const gapLength = length / Math.round(length / 6);
    checkRun(field, run, geometry, seeded(seed), `Reservoir ${seed}/${x0},${z0}`, center => {
      const x = x0 + tx * center, z = z0 + tz * center;
      return !(gap >= 0 && center >= gap * gapLength && center < (gap + 1) * gapLength)
        && field._roadDist(x, z) >= 5.5 && !field._noVeg(x, z) && Math.max(Math.abs(x), Math.abs(z)) <= 478;
    });
  }
  geometry.dispose();
}
// Exercise the maintained run builder and pool finalizer, including the real
// RNG stream, gap/road exclusions, support receipts and collision refitting.
const source = await readFile(new URL('./props.ts', import.meta.url), 'utf8');
function sourceFunction(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `maintained ${start.trim()} is exercised`);
  return stripTypeScriptTypes(source.slice(a, b));
}
const runSource = sourceFunction('  function addWallRun(', '  const wallRuns:');
assert.ok(runSource.includes('wallIslandEdges(along, exclusions, WALL_SEG)'), 'production fits each retained island');
const legacyRunSource = runSource.replace('wallIslandEdges(along, exclusions, WALL_SEG)', 'legacyWallEdges(along, exclusions, WALL_SEG)');
const legacyWallEdges = (length, exclusions, moduleLength) =>
  Float64Array.from({ length: exclusions.length + 1 }, (_, index) => Math.min(index * moduleLength, length));
const rubbleSource = sourceFunction('  function roughenChunk<', '  function addRubblePile(');
const prepareSource = sourceFunction('  function* prepareDestructiblePoolGeometry(', '  function* finalizeDestructiblePool(');
const finalSource = sourceFunction('  function* finalizeDestructiblePool(', '  function* finalizeDestructiblePools(');
const cleanupSource = sourceFunction('  wallSpans.clear();', '  // spatial hash');
assert.ok(source.indexOf('  yield* finalizeDestructiblePools();') < source.indexOf('  wallSpans.clear();'),
  'construction spans are released only after every pool has consumed them');
const refitSource = sourceFunction('  function refitDestructibleColliders(', '  function tintDestructibleInstances(');
const breakAnimationSource = sourceFunction('  function animateBrokenRecord(', '  /**\n   * Break/topple/toss');
const breakRecordSource = sourceFunction('  function breakRecord(', '  /** main.ts crushables-loop contract');
const restoreSource = sourceFunction('  function restoreDestructibleRecord(', '  function restoreToppledPoles(');
function collisionFixture(contact) {
  return new Function('deriveRuntimeStructureContactBand', 'applyStructureCollisionBand',
    'DESTRUCTIBLE_BUILDING_TYPES', 'deriveRuntimeStructureCollisionWithSolids', 'createGroundCoverSolidProfile',
    'attachGroundCoverSolidProfile', 'GROUND_COVER_PLACEMENT_BYTES',
    `const groundCoverDetails = { families:0, solidCount:0, profileBytes:0, placements:0,
      placementBytes:0, unsupportedTransforms:0, buildMs:0 };
      ${refitSource}; return { refit:refitDestructibleColliders, seal:sealGroundCoverPlacements, groundCoverDetails };`)(
    contact, applyStructureCollisionBand, DESTRUCTIBLE_BUILDING_TYPES,
    deriveRuntimeStructureCollisionWithSolids, createGroundCoverSolidProfile, attachGroundCoverSolidProfile,
    GROUND_COVER_PLACEMENT_BYTES);
}
const { refit, seal, groundCoverDetails } = collisionFixture(deriveRuntimeStructureContactBand);
// Independent pre-change contact computation: the optimized contact-only path
// must match the full profile that uninterrupted pool finalization used.
const legacyRefit = collisionFixture(input => deriveRuntimeStructureCollisionProfile(input).contact).refit;
function poolFinalizer(fixture, field, drng, overrides = {}) {
  const bindings = { THREE, mats: { stone: material }, drng,
    refitDestructibleColliders: refit, sealGroundCoverPlacements: seal, fitWallSpan,
    heightField: field, wallSpans: fixture.spans, WALL_SEG,
    tintDestructibleInstances: () => {}, destructibleCastsShadow: () => false,
    DESTRUCTIBLE_BUILDING_TYPES, prepareWorldStructureNightFixture, group: new THREE.Group(), ...overrides };
  const functions = new Function('bindings', `const {
    THREE, mats, drng, refitDestructibleColliders, sealGroundCoverPlacements, fitWallSpan,
    heightField, wallSpans, WALL_SEG, tintDestructibleInstances, destructibleCastsShadow,
    DESTRUCTIBLE_BUILDING_TYPES, prepareWorldStructureNightFixture, group
  } = bindings; ${prepareSource}; ${finalSource};
  return { prepare: prepareDestructiblePoolGeometry, finalize: finalizeDestructiblePool };`)(bindings);
  return { ...functions, group: bindings.group };
}
function assertGeometryEqual(actual, expected, label) {
  assert.deepEqual(Object.keys(actual.attributes), Object.keys(expected.attributes), `${label}: attribute names/order`);
  for (const key of Object.keys(expected.attributes)) {
    for (const property of ['itemSize', 'normalized', 'usage']) {
      assert.equal(actual.attributes[key][property], expected.attributes[key][property], `${label}: ${key}.${property}`);
    }
    assert.deepEqual(actual.attributes[key].array, expected.attributes[key].array, `${label}: exact ${key} bytes`);
  }
  assert.deepEqual(actual.index?.array, expected.index?.array, `${label}: exact triangle indices`);
  assert.deepEqual(actual.groups, expected.groups, `${label}: material groups`);
  assert.deepEqual(actual.drawRange, expected.drawRange, `${label}: draw range`);
}
let sourceSlots = 0, maxCoverIncrease = -Infinity, sumCoverIncrease = 0, maxRelief = 0;
let maxCapAboveMidpoint = -Infinity, sumCapAboveMidpoint = 0, worstCoverSite;
let lifecycleCycles = 0, poolCheckpoints = 0, cancelledPools = 0;
function checkSourceLifecycle(pool) {
  assert.ok(pool.records.every(record => record.cls === 'break' && !record.body),
    'this extracted lifecycle fixture covers static wall break/reset, not loose/topple/toss branches');
  assert.ok(!pool.meta.instanceTintStrength, 'wall lifecycle does not enter building-only tint generation');
  const lifecycle = new Function('THREE', 'dPools', 'destructibles', 'setWorldNightFixtureActive',
    `const _quat = new THREE.Quaternion(), _upAxis = new THREE.Vector3(0,1,0),
      _mat4 = new THREE.Matrix4(), _posv = new THREE.Vector3(), _zeroScale = new THREE.Vector3(1e-4,1e-4,1e-4);
      const events = [], fx = [], pendingBlasts = [];
      let fxBudget = 1;
      const emitDestroyed = event => events.push(event), emitBreakFx = (...args) => fx.push(args);
      ${breakAnimationSource}; ${breakRecordSource}; ${restoreSource};
      return { breakRecord, restoreDestructibleRecord, resetBrokenPools, events, fx };`)(
    THREE, new Map([['wallstone', pool]]), pool.records, setWorldNightFixtureActive);
  const intact = pool.imI.instanceMatrix.array.slice(), placements = pool.mats4.map(m => m.elements.slice());
  const record = pool.records[0], ob = record.ob, col = record.col;
  const bounds = [ob.min.slice(), ob.max.slice(), col.min.slice(), col.max.slice()];
  assert.equal(lifecycle.breakRecord(0,1,0,4,'ram'), true);
  assert.equal(lifecycle.breakRecord(0,1,0,4,'ram'), false, 'a broken wall cannot duplicate its debris slot');
  assert.equal(record.state,1); assert.equal(ob.crushed,true); assert.equal(col.dead,true);
  assert.equal(pool.nBroken,1); assert.equal(pool.imB.count,1); assert.equal(pool.imB.visible,true);
  const broken = new Matrix4(); pool.imB.getMatrixAt(0,broken);
  assert.deepEqual(broken.elements, Array.from(new Float32Array(placements[0])), 'broken wall reuses its fitted placement');
  assert.equal(lifecycle.events.length,1); assert.equal(lifecycle.fx.length,1);
  lifecycle.restoreDestructibleRecord(record); lifecycle.resetBrokenPools();
  lifecycle.restoreDestructibleRecord(record); lifecycle.resetBrokenPools();
  assert.equal(record.state,0); assert.equal(ob.crushed,false); assert.equal(col.dead,false);
  assert.equal(record.ob,ob); assert.equal(record.col,col, 'rematch retains registered collider identities');
  assert.deepEqual([ob.min,ob.max,col.min,col.max],bounds, 'destruction/reset cannot replace fitted cover bounds');
  assert.deepEqual(pool.imI.instanceMatrix.array,intact, 'rematch restores every exact fitted instance matrix');
  assert.deepEqual(pool.mats4.map(m=>m.elements),placements, 'stored placements never compound or revert');
  assert.equal(pool.nBroken,0); assert.equal(pool.imB.count,0); assert.equal(pool.imB.visible,false);
  lifecycleCycles++;
}
function sourceRunFixture(code, runs, field, seed, style = 'fieldstone') {
  const spans = new Map(), records = [], matrices = [];
  const retainedSlots = [];
  const buckets = { stone: [], plaster: [] };
  let draws = 0;
  const next = seeded(seed), rng = () => { draws++; return next(); };
  const add = (kind, x, y, z, yaw, sc, tiltX, tiltZ) => {
    const record = { ...makeRecord({ x0: x - Math.sin(yaw) * 1.5, z0: z - Math.cos(yaw) * 1.5,
      x1: x + Math.sin(yaw) * 1.5, z1: z + Math.cos(yaw) * 1.5 }, sc),
    kind, cls: 'break', x, y: Math.min(y, field.getHeightAt(x, z) - .025), z, yaw, sc, slot: records.length, state: 0 };
    matrices.push(new Matrix4().compose(new Vector3(x, record.y, z),
      new Quaternion().setFromEuler(new Euler(tiltX, yaw, tiltZ, 'YXZ')), new Vector3(sc, sc, sc)));
    records.push(record); return record;
  };
  const run = new Function('P', 'heightField', 'WALL_SEG', 'rng', 'buckets', 'box', 'jitterUV', 'addDestructible', 'noVeg', 'wallSpans', 'wallIslandEdges', 'legacyWallEdges',
    `const _rubbleOff = new Float32Array(24); ${rubbleSource}; ${code}; return addWallRun;`)(
    { wallStyle: style }, field, WALL_SEG, rng, buckets, box, jitterUV, add, field._noVeg, spans, wallIslandEdges, legacyWallEdges);
  runs.forEach((args, runIndex) => {
    const [x0, z0, x1, z1] = args, start = records.length;
    const length = Math.hypot(x1 - x0, z1 - z0);
    run(...args);
    for (const record of records.slice(start)) {
      const distance = ((record.x - x0) * (x1 - x0) + (record.z - z0) * (z1 - z0)) / length;
      // Rounding the original anchors is stable: the total exterior remainder
      // is less than half a kit length and no island crosses an excluded slot.
      retainedSlots.push(`${runIndex}:${Math.round(distance / WALL_SEG - .5)}`);
    }
  });
  return { spans, records, matrices, buckets, get draws() { return draws; }, retainedSlots };
}
function endpointMisses(fixture, geometry, field, endpoints) {
  const meshes = fixture.records.map(record => {
    const matrix = fixture.matrices[record.slot];
    fitWallSpan(matrix, geometry, field, fixture.spans.get(record), record, WALL_SEG);
    const mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); mesh.updateMatrixWorld(true);
    return mesh;
  });
  let misses = 0;
  for (const [x, z] of endpoints) for (const height of [.2, .45, .7]) {
    const yaw = fixture.records[0].yaw;
    const direction = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    ray.set(new Vector3(x - direction.x * 2, field.getHeightAt(x, z) + height, z - direction.z * 2), direction);
    ray.far = 4;
    if (!ray.intersectObjects(meshes, false).length) misses++;
    else assert.ok(fixture.records.some(record => rayCollisionRecord(ray.ray.origin, direction, record.col, 4, normal) >= 0),
      'actual endpoint masonry has matching cover collision');
  }
  return misses;
}
function disposeFixture(fixture) {
  for (const geometry of Object.values(fixture.buckets).flat()) geometry.dispose();
}
function unchangedSlots(fixture, previous) {
  assert.deepEqual(fixture.retainedSlots, previous.retainedSlots, 'same indexed gaps and road/noVeg skips');
  assert.equal(fixture.draws, previous.draws, 'endpoint fit does not perturb placement RNG');
  assert.deepEqual(fixture.records.map(r => [r.kind, r.sc, r.yaw]), previous.records.map(r => [r.kind, r.sc, r.yaw]),
    'retained slots keep their seeded width/height variation');
  for (const key of Object.keys(fixture.buckets)) {
    assert.deepEqual(fixture.buckets[key].map(g => g.attributes.position.count),
      previous.buckets[key].map(g => g.attributes.position.count), 'same post/breach primitive and material buckets');
    fixture.buckets[key].forEach((geometry, index) => assert.deepEqual(geometry.attributes.position.array,
      previous.buckets[key][index].attributes.position.array, 'post and breach geometry stays at its exact original boundary'));
  }
}
// A retained terminal module must reach the closing post even when a run is
// not divisible by the stock kit length. This runs the actual source builder,
// then ray-tests its actual kit triangles; an endpoint-number assertion alone
// could pass while the rendered stone still stops short.
const flatField = { getHeightAt: () => 3, _roadDist: () => Infinity, _noVeg: () => false };
const endpointGeometry = DESTRUCTIBLE_TYPES.wallstone.build(seeded(2049));
const endpointRun = [-48, -10, 10, -10]; // the authored 58m Reservoir extent
const endpointFixture = sourceRunFixture(runSource, [endpointRun], flatField, 2049);
assert.equal(endpointMisses(endpointFixture, endpointGeometry, flatField, [[-48, -10], [10, -10]]), 0,
  'actual source masonry reaches both authored endpoints of the 58m run');
const legacyEndpointFixture = sourceRunFixture(legacyRunSource, [endpointRun], flatField, 2049);
const legacyEndpointMisses = endpointMisses(legacyEndpointFixture, endpointGeometry, flatField, [[-48, -10], [10, -10]]);
assert.equal(legacyEndpointMisses, 3, 'original 3m spacing genuinely misses all three terminal triangle rays');
unchangedSlots(endpointFixture, legacyEndpointFixture);
disposeFixture(endpointFixture); disposeFixture(legacyEndpointFixture);
let endpointRays = 6;
for (const yaw of [0, Math.PI / 2, Math.PI, -.71]) for (const length of [58, 62, 68, 4]) {
  const x = Math.sin(yaw) * length, z = Math.cos(yaw) * length;
  const field = { ...flatField, getHeightAt: (px, pz) => (px * Math.sin(yaw) + pz * Math.cos(yaw)) * .2 + 3 };
  const fixture = sourceRunFixture(runSource, [[0, 0, x, z]], field, 2049);
  assert.equal(endpointMisses(fixture, endpointGeometry, field, [[0, 0], [x, z]]), 0,
    `rotated sloped ${length}m run reaches both authored posts`);
  endpointRays += 6;
  disposeFixture(fixture);
}
// Thresholds intentionally fall between old and redistributed centers, so
// this detects an accidental resampling of skip rules at the new positions.
const thresholdField = { ...flatField,
  _roadDist: (x) => x > -11 && x < -10 ? 0 : Infinity,
  _noVeg: (x) => x > -2 && x < -1,
};
const thresholdRuns = [[-48, -10, 10, -10, 2]];
const thresholdFixture = sourceRunFixture(runSource, thresholdRuns, thresholdField, 2049);
const oldThresholdFixture = sourceRunFixture(legacyRunSource, thresholdRuns, thresholdField, 2049);
unchangedSlots(thresholdFixture, oldThresholdFixture);
for (const skipped of ['0:4', '0:5', '0:12', '0:15']) {
  assert.ok(!thresholdFixture.retainedSlots.includes(skipped), `indexed gap/road/noVeg exclusion ${skipped} remains absent`);
}
disposeFixture(thresholdFixture); disposeFixture(oldThresholdFixture); endpointGeometry.dispose();

for (const seed of [1337, 2049, 7719]) {
  const config = getMapConfig('reservoir'), field = createHeightField(seed, config);
  const fixture = sourceRunFixture(runSource, config.props.wallRuns, field, seed);
  const previous = sourceRunFixture(legacyRunSource, config.props.wallRuns, field, seed);
  unchangedSlots(fixture, previous); disposeFixture(previous);
  const { spans, records, matrices, buckets, draws } = fixture;
  assert.equal(spans.size, records.length, 'every intact authored span retains one independent slot');
  const authoredSlots = records.length, oldMatrices = matrices.map(m => m.clone()), drawCount = draws;
  const group = new THREE.Group();
  let kitDraws = 0;
  const kitNext = seeded(seed), kitRng = () => { kitDraws++; return kitNext(); };
  const pool = { meta: DESTRUCTIBLE_TYPES.wallstone, records, mats4: matrices, nBroken: 0 };
  const reference = sourceRunFixture(runSource, config.props.wallRuns, field, seed);
  let expectedDraws = 0;
  const expectedNext = seeded(seed), expectedRng = () => { expectedDraws++; return expectedNext(); };
  const expectedIntact = DESTRUCTIBLE_TYPES.wallstone.build(expectedRng);
  const referencePool = { records: reference.records, mats4: reference.matrices };
  legacyRefit(expectedIntact, referencePool, 'wallstone');
  // Original uninterrupted order: build, refit all contact colliders, fit all
  // complete spans, then construct the broken kit from the same RNG stream.
  for (const record of reference.records) {
    fitWallSpan(reference.matrices[record.slot], expectedIntact, field,
      reference.spans.get(record), record, WALL_SEG);
  }
  const expectedBroken = DESTRUCTIBLE_TYPES.wallstone.broken(expectedRng);
  const { finalize } = poolFinalizer(fixture, field, kitRng, { group });
  let completedFits = 0;
  for (const checkpoint of finalize('wallstone', pool)) {
    completedFits += 8; poolCheckpoints++;
    assert.deepEqual(checkpoint, { fine: true, progress: false, stage: 'wall-fit-wallstone' });
    assert.equal(group.children.length, 0, 'no partial intact or broken mesh is published at a fit checkpoint');
    assert.equal(pool.imI, undefined); assert.equal(pool.imB, undefined);
    for (let index = 0; index < completedFits; index++) {
      assert.deepEqual(matrices[index].elements, reference.matrices[index].elements,
        'each completed fit is already exact before the next batch starts');
      assert.deepEqual(records[index], reference.records[index], 'complete collider/support receipt at each checkpoint');
    }
    assert.ok(records.slice(completedFits).every(record => record.groundSupport === null),
      'the checkpoint does not begin a later wall fit');
  }
  assert.equal(completedFits / 8, Math.floor((records.length - 1) / 8), 'one checkpoint per eight completed fits');
  assert.equal(records.length, authoredSlots);
  assert.equal(pool.imI.count, authoredSlots);
  assert.equal(group.children.length, 2, 'one intact and one existing broken pool, no added draw families');
  assert.equal(pool.imB.count, 0);
  assert.equal(pool.imI.material, material);
  assert.equal(pool.imB.material, material, 'no extra material or shader variant');
  assert.equal(fixture.draws, drawCount, 'fitting consumes no placement RNG');
  assertGeometryEqual(pool.imI.geometry, expectedIntact, 'unchanged intact geometry');
  assertGeometryEqual(pool.imB.geometry, expectedBroken, 'unchanged broken geometry');
  assert.deepEqual(matrices.map(matrix => matrix.elements), reference.matrices.map(matrix => matrix.elements),
    'cooperative fitting preserves all original double-precision placements');
  assert.deepEqual(records, reference.records, 'cooperative fitting preserves complete collider and support records');
  assert.deepEqual(pool.imI.instanceMatrix.array, new Float32Array(reference.matrices.flatMap(matrix => matrix.elements)),
    'published instance matrices preserve the original float32 transform stream');
  assert.equal(kitDraws, expectedDraws, 'same intact and broken builder RNG consumption');
  assert.equal(kitRng(), expectedRng(), 'the next seeded draw is unchanged after finalization');
  assert.ok(kitDraws > 0);
  for (const record of records) {
    const mesh = new Mesh(pool.imI.geometry, material);
    mesh.matrixAutoUpdate = false;
    pool.imI.getMatrixAt(record.slot, mesh.matrix); mesh.updateMatrixWorld(true);
    // Stored instance matrices are float32; validate receipts against the
    // exact CPU matrix that produced both them and the rendered transform.
    mesh.matrix.copy(matrices[record.slot]); mesh.updateMatrixWorld(true);
    auditWall({ record, mesh }, pool.imI.geometry, field);
    assert.ok(record.y <= record.groundSupport.min + .001, 'actual environment-audit grounding predicate passes');
    let oldTop = -Infinity;
    for (let i = 0; i < pool.imI.geometry.attributes.position.count; i++) {
      point.fromBufferAttribute(pool.imI.geometry.attributes.position, i).applyMatrix4(oldMatrices[record.slot]);
      oldTop = Math.max(oldTop, point.y);
    }
    const delta = record.ob.max[1] - oldTop;
    if (delta > maxCoverIncrease) worstCoverSite = { seed, x: record.x, z: record.z,
      oldTop, newTop: record.ob.max[1], support: record.groundSupport };
    maxCoverIncrease = Math.max(maxCoverIncrease, delta); sumCoverIncrease += delta;
    const capAboveMidpoint = record.groundSupport.max - field.getHeightAt(record.x, record.z);
    maxCapAboveMidpoint = Math.max(maxCapAboveMidpoint, capAboveMidpoint);
    sumCapAboveMidpoint += capAboveMidpoint;
    maxRelief = Math.max(maxRelief, record.groundSupport.spread);
    sourceSlots++;
  }
  new Function('wallSpans', cleanupSource)(spans);
  assert.equal(spans.size, 0, 'no span-to-record placement graph survives construction');
  checkSourceLifecycle(pool);
  disposeFixture(reference);
  for (const geometry of [...Object.values(buckets).flat(), pool.imI.geometry, pool.imB.geometry, expectedIntact, expectedBroken]) geometry.dispose();
}

function trackedFinalization(overrides = {}) {
  const field = { ...flatField, getHeightAt: (x, z) => 3 + x * .1 + z * .2 };
  const fixture = sourceRunFixture(runSource, [[0, 0, 0, 51]], field, 991);
  assert.equal(fixture.records.length, 17, 'small real-kit fixture spans both eight-fit checkpoints');
  const geometries = [];
  const track = (geometry, kind) => {
    const receipt = { geometry, kind, disposals: 0 };
    geometry.addEventListener('dispose', () => { receipt.disposals++; });
    geometries.push(receipt); return geometry;
  };
  const meta = { ...DESTRUCTIBLE_TYPES.wallstone,
    build: rng => track(DESTRUCTIBLE_TYPES.wallstone.build(rng), 'intact'),
    broken: rng => track(DESTRUCTIBLE_TYPES.wallstone.broken(rng), 'broken') };
  const pool = { meta, records: fixture.records, mats4: fixture.matrices, nBroken: 0 };
  const owner = poolFinalizer(fixture, field, seeded(991), overrides);
  return { fixture, pool, owner, geometries };
}
function assertUnpublished(test) {
  assert.equal(test.owner.group.children.length, 0, 'untransferred geometry never publishes partial meshes');
  assert.equal(test.pool.imI, undefined); assert.equal(test.pool.imB, undefined);
  assert.equal(test.geometries.filter(item => item.kind === 'broken').length, 0,
    'no broken builder runs before every intact fit completes');
}
function assertClosed(test, iterator) {
  assert.deepEqual(iterator.return(), { done: true, value: undefined });
  assert.deepEqual(iterator.next(), { done: true, value: undefined });
  assertUnpublished(test);
  assert.equal(test.geometries.length, 1, 'one invocation-owned intact kit only');
  assert.equal(test.geometries[0].disposals, 1, 'IteratorClose/error releases intact geometry exactly once');
  disposeFixture(test.fixture);
}
for (const method of ['prepare', 'finalize']) {
  const unstarted = trackedFinalization();
  const unopened = unstarted.owner[method]('wallstone', unstarted.pool);
  unopened.return();
  assert.deepEqual(unopened.next(), { done: true, value: undefined });
  assert.equal(unstarted.geometries.length, 0, 'closing before first next never enters either builder');
  assertUnpublished(unstarted); disposeFixture(unstarted.fixture);
  for (const boundary of [1, 2]) {
    const test = trackedFinalization();
    const iterator = test.owner[method]('wallstone', test.pool);
    for (let index = 0; index < boundary; index++) {
      assert.deepEqual(iterator.next(), { done: false,
        value: { fine: true, progress: false, stage: 'wall-fit-wallstone' } });
      assertUnpublished(test);
      assert.equal(test.geometries[0].disposals, 0, 'geometry remains owned while suspended');
      assert.equal(test.fixture.records.filter(record => record.groundSupport !== null).length, (index + 1) * 8,
        'suspension occurs only between complete fits');
    }
    assertClosed(test, iterator); cancelledPools++;
  }
}
for (const method of ['prepare', 'finalize']) for (const phase of ['refit', 'fit']) {
  const failure = new Error(`original ${method} ${phase} failure`);
  let fitCount = 0;
  const test = trackedFinalization({
    refitDestructibleColliders: (...args) => {
      if (phase === 'refit') throw failure;
      return refit(...args);
    },
    fitWallSpan: (...args) => {
      fitWallSpan(...args);
      if (++fitCount === 9) throw failure;
    },
  });
  const iterator = test.owner[method]('wallstone', test.pool);
  if (phase === 'fit') {
    assert.equal(iterator.next().done, false, 'fit failure occurs after a real suspended batch');
    assertUnpublished(test);
  }
  assert.throws(() => iterator.next(), error => error === failure, 'original refit/fit error escapes unchanged');
  assertClosed(test, iterator);
}
// Successful preparation transfers geometry to its caller; closing that done
// iterator must not reclaim it. Successful finalization transfers both kits to
// the group, so only the normal world resource owner disposes them.
for (const method of ['prepare', 'finalize']) {
  const test = trackedFinalization(), iterator = test.owner[method]('wallstone', test.pool);
  let step = iterator.next();
  while (!step.done) { assertUnpublished(test); step = iterator.next(); }
  iterator.return(); iterator.return();
  assert.equal(test.geometries.length, method === 'prepare' ? 1 : 2, 'builders execute exactly once on success');
  assert.ok(test.geometries.every(item => item.disposals === 0), 'successful transfer does not dispose live geometry');
  if (method === 'prepare') {
    assertUnpublished(test);
    assert.equal(step.value.geoI, test.geometries[0].geometry);
    assert.equal(step.value.groundCoverDetail, null, 'walls do not allocate building-only solid profiles');
  } else {
    assert.equal(test.owner.group.children.length, 2);
    assert.equal(test.pool.imI.geometry, test.geometries[0].geometry);
    assert.equal(test.pool.imB.geometry, test.geometries[1].geometry);
  }
  for (const item of test.geometries) item.geometry.dispose();
  iterator.return();
  assert.ok(test.geometries.every(item => item.disposals === 1), 'normal owner cleanup releases each transferred kit once');
  disposeFixture(test.fixture);
}
assert.deepEqual(groundCoverDetails, { families:0, solidCount:0, profileBytes:0, placements:0,
  placementBytes:0, unsupportedTransforms:0, buildMs:0 }, 'walls retain the cheap collider path, without building-only solid profiles');
material.dispose();
console.log(JSON.stringify({ seams, vertices, legacyMisses, sourceSlots, endpointRays, legacyEndpointMisses, lifecycleCycles,
  poolCheckpoints, cancelledPools,
  maxCoverIncrease, meanCoverIncrease: sumCoverIncrease / sourceSlots, maxRelief,
  maxCapAboveMidpoint, meanCapAboveMidpoint: sumCapAboveMidpoint / sourceSlots, worstCoverSite }));
console.log('wallSpanPlacement: actual kit seams, ground support, source run/finalization, collision and unchanged instance/material budgets passed');
