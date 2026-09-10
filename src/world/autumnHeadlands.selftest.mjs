import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createHeightField } from './terrain.ts';
import { sampleDiscGround } from './propPlacement.ts';

// Actual module/stage ports, not a whole-world build. The scatter stream starts
// at this explicit stage checkpoint; its donors are not a native-world census.
// Real Canvas, row geometry, record construction, collision refit and broken/
// reset matrices execute. No WebGL, rendered contact or performance claim.
const url = new URL('./props.ts', import.meta.url).href;
const source = readFileSync(new URL(url), 'utf8');
const tree = ts.createSourceFile('props.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function one(predicate, label) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(tree); assert.equal(found.length, 1, `one actual ${label}`); return found[0].getText(tree);
}
const declaration = name => one(n => ts.isFunctionDeclaration(n) && n.name?.text === name, name);
const variable = name => one(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === name, name);
const composition = one(n => ts.isIfStatement(n) && n.expression.getText(tree) === 'autumnCropRows && autumnFieldContext', 'composition/release');
const callAt = source.indexOf(composition);
assert.ok(callAt > source.indexOf('  composeAuthoredFisheryWharf();') && callAt < source.indexOf('  yield* mergeMaterialBuckets();'),
  'compose once after seeded dressing, before geometry merge/pool publication');
assert.match(composition, /autumnCropRows\.length = 0;\s+autumnFieldContext = null;/);

// Literal 29217600af0e2615549529cb93dc0f3384ef0265 predecessor stage sequence.
// Retain the original three ordered scatter calls and unobserved row builder;
// no runtime Git requirement or refreshed whole-file/hash oracle.
const predecessorFields = `() => {
  const fieldContext = { rng: drng, village: v, heightField, noVegetation: noVeg,
    spawns: [L.spawns.player, ...L.spawns.enemies], addDestructible };
  const baleCount = inh.bales ?? 0, stookCount = inh.stooks ?? 0, sledCount = inh.sleds ?? 0;
  if (baleCount > 0) scatterFieldProps(fieldContext, 'bale', baleCount);
  if (stookCount > 0) scatterFieldProps(fieldContext, 'stook', stookCount);
  if (sledCount > 0) scatterFieldProps(fieldContext, 'sled', sledCount);
}`;
const predecessorRows = `function appendCropRows(cropGeos, crng, cx, cz, pw, pd, dx, dz, px2, pz2) {
  const rowPitch = 2.5 + crng() * 0.5, nRows = Math.floor(pd / rowPitch);
  const rowH = 1.05 + crng() * 0.2, tintL = 0.9 + crng() * 0.25;
  for (let row = 0; row < nRows; row++) {
    const offset = (row - (nRows - 1) / 2) * rowPitch;
    const rx = cx + px2 * offset, rz = cz + pz2 * offset;
    const half = pw * (0.44 + crng() * 0.08);
    appendCropRowGeometry(cropGeos, crng, rx, rz, half, rowH, tintL, dx, dz);
  }
}`;
const nested = ['placeCropFields', 'paintWetCropLeaves', 'paintCropPanicle', 'biomeCropHeight',
  'biomeCropLean', 'paintCropStalk', 'finishStandingCrop', 'finishBrokenCrop', 'paintBiomeCrop',
  'createCropTexture', 'cropPlotAvoidsSpawns', 'cropPlotCornersAreLevel', 'appendCropRowGeometry',
  'tryPlaceCropPlot', 'refitDestructibleColliders', 'animateBrokenRecord', 'breakRecord',
  'restoreDestructibleRecord'].map(declaration).join('\n');
const finalizer = declaration('finalizeCropFields').replace('function finalizeCropFields(', 'function realFinalize(');
const sources = new Map();
const hook = registerHooks({ load(name, context, next) {
  if (!sources.has(name)) return next(name, context);
  return { format: 'module-typescript', source: sources.get(name), shortCircuit: true };
} });
let serial = 0;
async function fixtureModule(mode = 'current') {
  let text = source;
  if (mode === 'stale-matrix') {
    const anchor = 'matrix.setPosition(site.x, placement.y, site.z);';
    assert.equal(text.split(anchor).length, 2); text = text.replace(anchor, '/* deliberate stale canonical slot */');
  }
  if (mode === 'stale-obstacle') {
    const original = declaration('relocateAutumnHarvestRecord');
    const anchor = 'applyDestructibleObstacleShape(record.ob, pool.meta, record, extents);';
    assert.equal(original.split(anchor).length, 2);
    text = text.replace(original, original.replace(anchor, '/* deliberate stale obstacle footprint */'));
  }
  const fixtureUrl = `${url}?headland-test=${serial++}`;
  sources.set(fixtureUrl, `${text}\nconst headlandTestRng = mulberry32;
  export function headlandTestStage(config, heightField, document, seed = 2002) {
    const P = config.props, mapId = config.id, inh = P.inhabit || {}, aniso = 4;
    const L = heightField._layout, v = L.village, noVeg = heightField._noVeg;
    const group = new THREE.Group(), engineCtx = { setupShadowMaterial() {} }, placedB = [];
    const vegetation = { treeObstacles: [] };
    const _col = new THREE.Color(), traces = [], inputRows = [];
    function mulberry32(value) {
      const next = headlandTestRng(value), trace = { seed: value, draws: [], next };
      traces.push(trace); return () => { const result = next(); trace.draws.push(result); return result; };
    }
    const drng = mulberry32(seed + 9001), destructibles = [], dPools = new Map();
    const destructibleContext = { heightField, seed, localTypes: {}, pools: dPools,
      records: destructibles, looseRecords: [], obstacles: [], colliders: [], crushables: [],
      quaternion: new THREE.Quaternion(), euler: new THREE.Euler() };
    const addDestructible = (...args) => addDestructibleRecord(destructibleContext, ...args);
    const ${variable('autumnCropRows')};
    let ${variable('autumnFieldContext')}, ${variable('autumnFieldStart')}, ${variable('autumnFieldEnd')};
    const ${mode === 'predecessor' ? `placeFieldObjects = ${predecessorFields}` : variable('placeFieldObjects')};
    ${nested}
    ${mode === 'predecessor' ? predecessorRows : declaration('appendCropRows')}
    ${finalizer}
    function finalizeCropFields(texture, geometries) { inputRows.push(...geometries); realFinalize(texture, geometries); }
    const _zeroScale = new THREE.Vector3(1e-4, 1e-4, 1e-4), _structureTint = new THREE.Color();
    const pendingBlasts = [], groundCoverDetails = { buildMs: 0 }; let fxBudget = 0;
    // Genuine non-donor records flank the actual scatter range; the trailing
    // bale has the eligible kind but must not be recruited from another stage.
    addDestructible('crate', -405, heightField.getHeightAt(-405, -405) - .03, -405, .3, .91);
    placeFieldObjects();
    addDestructible('bale', 405, heightField.getHeightAt(405, 405) - .03, 405, 1.1, .94);
    placeCropFields();
    const rows = autumnCropRows?.slice() ?? null;
    return { ...destructibleContext, group, inputRows, rows, range: [autumnFieldStart, autumnFieldEnd],
      compose() { ${mode === 'predecessor' ? '' : composition} },
      released: () => [autumnCropRows?.length ?? null, autumnFieldContext],
      rng: () => traces.map(t => ({ seed: t.seed, draws: t.draws.slice(), tail: [t.next(), t.next()] })),
      refitDestructibleColliders, breakRecord, restoreDestructibleRecord,
      addDestructible, captureAutumnCropRow, appendCropRowGeometry, autumnHarvestRadius,
      autumnHeadlandSite, autumnHeadlandClearsRows, placedB, vegetation, fieldContext: autumnFieldContext };
  }`);
  try { return (await import(fixtureUrl)).headlandTestStage; }
  finally { sources.delete(fixtureUrl); }
}
const current = await fixtureModule(), predecessor = await fixtureModule('predecessor');
const documentPort = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
function flatField() {
  return { getHeightAt: () => 0, getNormalAt: () => ({ y: 1 }), getGroundType: () => 'hard',
    _noVeg: () => false, _roadDist: () => 100,
    _layout: { village: { x0: 460, x1: 480, z0: 460, z1: 480 },
      spawns: { player: { x: -460, z: -460 }, enemies: [] } } };
}
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function geometry(g) {
  const arrays = Object.fromEntries(Object.entries(g.attributes).map(([key, attr]) => [key, attr.array]));
  if (g.index) arrays.index = g.index.array;
  return Object.fromEntries(Object.entries(arrays).map(([key, a]) => [key,
    [a.constructor.name, a.length, a.byteLength, createHash('sha256').update(bytes(a)).digest('hex')]]));
}
function records(f) {
  return structuredClone(f.records);
}
function invariant(r) {
  const { x, y, z, ob, col, groundSupport, ...identity } = r; return identity;
}
function matrix(f, record) { return f.pools.get(record.kind).mats4[record.slot]; }
function assertMatrix(f, record) {
  const m = matrix(f, record), expected = new THREE.Matrix4().compose(
    new THREE.Vector3(record.x, record.y, record.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, record.yaw, 0, 'YXZ')),
    new THREE.Vector3(record.sc, record.sc, record.sc));
  assert.deepEqual(m.elements, expected.elements, 'canonical basis follows moved record exactly');
}
function assertSupport(field, record, meta) {
  const support = sampleDiscGround(field, record.x, record.z, (meta.groundR ?? meta.collisionR ?? meta.r) * record.sc, .025);
  assert.deepEqual(record.groundSupport, { mode: 'disc', ...support });
  assert.equal(record.y, Math.min(field.getHeightAt(record.x, record.z) - .03, support.y));
  assert.ok(support.spread <= .25);
  assert.equal(record.ob.min[1], record.y); assert.equal(record.ob.max[1], record.y + record.h);
  assert.equal(record.ob.shape2.cx, record.x, 'obstacle center follows moved record');
  assert.equal(record.ob.shape2.cz, record.z, 'obstacle center follows moved record');
}
function cropResources(f) {
  return f.group.children.map(o => {
    const m = o.material, t = m.map, c = t.image;
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return { name: o.name, geometry: geometry(o.geometry), material: [m.type, m.customProgramCacheKey(),
      m.alphaTest, m.alphaToCoverage, m.side, m.vertexColors, m.roughness, m.metalness, m.envMapIntensity],
      texture: [c.width, c.height, t.colorSpace, t.wrapS, t.wrapT, t.anisotropy,
        t.minFilter, t.magFilter, t.generateMipmaps, pixels.byteLength,
        createHash('sha256').update(bytes(pixels)).digest('hex')] };
  });
}
function poolInventory(f) {
  return [...f.pools].map(([kind, p]) => [kind, p.meta.mat, p.mats4.length, p.records.length,
    p.records.map(r => [r.slot, r.sc]), p.imI, p.imB, p.nBroken]);
}
function donorIndices(f) {
  const counts = { bale: 0, stook: 0 }, indices = new Set();
  for (let i = f.range[0]; i < f.range[1]; i++) {
    const kind = f.records[i].kind;
    assert.ok(kind in counts, 'the captured production range contains only bale/stook donors');
    if (counts[kind]++ < 12) indices.add(i);
  }
  return indices;
}
function assertEntrance(rows, record, radius) {
  for (const row of rows) {
    const along = (record.x - row.cx) * row.dx + (record.z - row.cz) * row.dz;
    const across = -(record.x - row.cx) * row.dz + (record.z - row.cz) * row.dx;
    const extents = [row.x0, row.z0, row.x1, row.z1];
    const lo = (extents[0] - row.cx) * row.dx + (extents[1] - row.cz) * row.dz;
    const hi = (extents[2] - row.cx) * row.dx + (extents[3] - row.cz) * row.dz;
    assert.ok(Math.abs(across) >= 4 + radius || along <= lo - 8 || along >= hi + 8,
      'complete donor footprint leaves the central eight-metre field entrance open');
  }
}
function assertRowObservation(f) {
  if (!f.rows) return;
  assert.equal(f.rows.length, f.inputRows.length, 'one receipt per actual emitted supported row');
  f.rows.forEach((row, i) => {
    const g = f.inputRows[i], p = g.attributes.position;
    const used = [...new Set(g.index.array)].map(at => [p.getX(at), p.getZ(at)]);
    used.sort((a, b) => (a[0] - b[0]) * row.dx + (a[1] - b[1]) * row.dz);
    assert.deepEqual([row.x0, row.z0], used[0]); assert.deepEqual([row.x1, row.z1], used.at(-1));
  });
}
function dispose(f) {
  for (const g of f.inputRows) g.dispose();
  f.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  for (const pool of f.pools.values()) for (const mesh of [pool.imI, pool.imB]) {
    if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}
function lifecycle(f, before, moved) {
  for (const [kind, pool] of f.pools) {
    const oldPool = before.pools.get(kind), rng = () => .4;
    const intact = pool.meta.build(rng), broken = pool.meta.broken(rng);
    const oldIntact = oldPool.meta.build(rng), oldBroken = oldPool.meta.broken(rng);
    assert.deepEqual(geometry(intact), geometry(oldIntact)); assert.deepEqual(geometry(broken), geometry(oldBroken));
    oldIntact.dispose(); oldBroken.dispose();
    f.refitDestructibleColliders(intact, pool, kind);
    pool.imI = new THREE.InstancedMesh(intact, new THREE.MeshBasicMaterial(), pool.mats4.length);
    pool.imB = new THREE.InstancedMesh(broken, new THREE.MeshBasicMaterial(), pool.mats4.length);
    assert.equal(pool.imI.instanceMatrix.array.byteLength, oldPool.mats4.length * 64);
    assert.equal(pool.imB.instanceMatrix.array.byteLength, oldPool.mats4.length * 64);
    pool.mats4.forEach((m, i) => pool.imI.setMatrixAt(i, m));
    for (const r of moved.filter(record => record.kind === kind)) {
      const p = intact.attributes.position;
      for (let i = 0; i < p.count; i++) assert.ok(Math.hypot(p.getX(i), p.getZ(i)) * r.sc
        <= f.autumnHarvestRadius(r) - .25 + 2e-7, 'independent packed intact vertices fit the clearance envelope');
      // The final contact band is derived from the real geometry, not merely
      // the metadata circle before finalization. Its translated projection
      // must match an independently built actual record at the new pose.
      const reference = before.addDestructible(r.kind, r.x, r.y, r.z, r.yaw, r.sc);
      before.refitDestructibleColliders(intact, oldPool, kind);
      const { propIdx: _actual, ...actualOb } = r.ob;
      const { propIdx: _reference, ...referenceOb } = reference.ob;
      assert.deepEqual(actualOb, referenceOb, 'actual final geometry contact agrees with relocated pose');
      const saved = matrix(f, r).elements.map(Math.fround), live = new THREE.Matrix4();
      assert.equal(f.breakRecord(f.records.indexOf(r), 1, 0), true);
      assert.equal(r.ob.crushed, true);
      pool.imB.getMatrixAt(pool.nBroken - 1, live); assert.deepEqual(live.elements, saved, 'actual broken transform');
      f.restoreDestructibleRecord(r); pool.imI.getMatrixAt(r.slot, live);
      assert.deepEqual(live.elements, saved, 'actual rematch transform');
      assert.equal(r.ob.crushed, false); assert.equal(r.state, 0);
    }
  }
}
function compare(config, field, build = current, withLifecycle = false) {
  const before = predecessor(config, field, documentPort), after = build(config, field, documentPort);
  try {
    const original = records(after), matrices = after.records.map(r => matrix(after, r));
    const recordRefs = after.records.slice(), obstacleRefs = after.records.map(r => r.ob), eligible = donorIndices(after);
    assert.deepEqual(original, records(before), 'actual original scatter records equal frozen predecessor sequence');
    assert.deepEqual(after.inputRows.map(geometry), before.inputRows.map(geometry));
    assert.deepEqual(cropResources(after), cropResources(before), 'actual crop mesh/material/atlas resources stay exact');
    assertRowObservation(after);
    after.compose(); before.compose();
    assert.deepEqual(poolInventory(after), poolInventory(before), 'all existing pool/material families and capacities stay exact');
    assert.deepEqual(after.rng(), before.rng(), 'all actual draw values/counts/tails remain exact through composition');
    const moved = [], obstacleOwners = new Set(after.obstacles);
    after.records.forEach((record, i) => {
      assert.equal(record, recordRefs[i]); assert.equal(record.ob, obstacleRefs[i]);
      assert.equal(after.pools.get(record.kind).records[record.slot], record);
      assert.ok(obstacleOwners.has(record.ob), 'record retains its original collision owner');
      assert.deepEqual(invariant(record), invariant(original[i])); assert.equal(matrix(after, record), matrices[i]);
      const changed = record.x !== original[i].x || record.z !== original[i].z;
      if (!changed) { assert.deepEqual(record, original[i]); return; }
      assert.equal(config.id, 'autumn'); assert.ok(eligible.has(i), 'only first twelve existing donors of each kind may move');
      assert.ok(['bale', 'stook'].includes(record.kind)); assertMatrix(after, record);
      assertSupport(field, record, after.pools.get(record.kind).meta);
      assertEntrance(after.rows, record, after.autumnHarvestRadius(record)); moved.push(record);
    });
    assert.ok(moved.length <= 24);
    if (config.id !== 'autumn') assert.deepEqual(after.released(), [null, null], 'other maps allocate no row list/context');
    else { assert.deepEqual(after.released(), [0, null]); assert.ok(moved.length > 0, 'real emitted rows receive genuine donors'); }
    if (withLifecycle) lifecycle(after, before, moved);
    console.log(JSON.stringify({ map: config.id, records: after.records.length, rows: after.inputRows.length, moved: moved.length }));
  } finally { dispose(before); dispose(after); }
}
for (const id of MAP_IDS) compare(getMapConfig(id), flatField(), current, id === 'autumn');
for (const seed of [1337, 2025]) compare(getMapConfig('autumn'), createHeightField(seed, getMapConfig('autumn')), current, true);
const staleMatrix = await fixtureModule('stale-matrix');
assert.throws(() => compare(getMapConfig('autumn'), flatField(), staleMatrix), /canonical basis/,
  'live omitted canonical-matrix write is rejected, not hidden by matching record coordinates');
const staleObstacle = await fixtureModule('stale-obstacle');
assert.throws(() => compare(getMapConfig('autumn'), flatField(), staleObstacle), /obstacle center/,
  'live omitted obstacle translation is rejected despite a correct render matrix');

function refusal(kind) {
  const field = flatField(), f = current(getMapConfig('autumn'), field, documentPort);
  const oldRecords = records(f), oldMatrices = f.records.map(r => matrix(f, r).elements.slice());
  if (kind === 'wet') field.getGroundType = () => 'soft';
  if (kind === 'steep') field.getHeightAt = (x, z) => x + z;
  if (kind === 'road') field._roadDist = () => 0;
  if (kind === 'spawn') f.fieldContext.spawns = [{ x: 0, z: 0 }, ...f.rows.flatMap(r =>
    [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z1 }])];
  if (kind === 'building') f.placedB.push({ x: 0, z: 0, rr: 1000 });
  if (kind === 'obstacle') f.obstacles.push({ min: [-1000, -100, -1000], max: [1000, 100, 1000] });
  if (kind === 'collider') f.colliders.push({ min: [-1000, -100, -1000], max: [1000, 100, 1000] });
  if (kind === 'tree') f.vegetation.treeObstacles.push({ min: [-1000, -100, -1000], max: [1000, 100, 1000] });
  const originalTrees = structuredClone(f.vegetation.treeObstacles);
  try {
    f.compose(); assert.deepEqual(records(f), oldRecords, `${kind}: unsafe donors retain their complete original record`);
    assert.deepEqual(f.records.map(r => matrix(f, r).elements), oldMatrices);
    assert.deepEqual(f.vegetation.treeObstacles, originalTrees, 'construction never mutates the tree owner');
  } finally { dispose(f); }
}
for (const reason of ['wet', 'steep', 'road', 'spawn', 'building', 'obstacle', 'collider', 'tree']) refusal(reason);
function clippedRow() {
  const field = flatField(), f = current(getMapConfig('autumn'), field, documentPort), geos = [];
  field._noVeg = x => Math.abs(x) > 6;
  try {
    f.appendCropRowGeometry(geos, () => .4, 0, 0, 20, 1.1, 1, 1, 0);
    assert.equal(geos.length, 1);
    const rows = []; f.captureAutumnCropRow(rows, geos[0], 0, 0, 1, 0, 1);
    assertRowObservation({ rows, inputRows: geos });
    assert.ok(rows[0].x0 > -6 && rows[0].x1 < 6, 'unsupported end vertices are not planted row endpoints');
    assert.throws(() => assertRowObservation({ inputRows: geos,
      rows: [{ ...rows[0], x0: geos[0].attributes.position.getX(0) }] }), /Expected values/,
    'independent indexed projection rejects the old full-position-buffer endpoint shortcut');
    assert.equal(f.autumnHeadlandClearsRows(rows, { x: 0, z: 0 }, 1), false, 'actual row center remains a protected entrance');
  } finally { geos.forEach(g => g.dispose()); dispose(f); }
}
clippedRow();
hook.deregister();
console.log('autumnHeadlands: PASS (stage/CPU contracts only; native art and regenerated world collision remain separate)');
