/** Renderer-free integration of the production props runtime, not a copied break policy.
 * Construction supplies actual kit meshes and small deterministic placement records;
 * the unmodified post-build closure owns hashing, mutation, animation and reset.
 * No browser/canvas/GPU performance claim is made by this test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileFunction } from 'node:vm';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';
import * as seam from './destructibles.ts';
import * as loose from './loosePropPhysics.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('  const D_CELL = 8;');
const end = source.indexOf('\n  return { group, obstacles, colliders,', start);
assert.ok(start > 0 && end > start, 'production post-build runtime boundaries exist');
const runtimeSource = stripTypeScriptTypes(`function fixture() {${source.slice(start, end)}
return { crushDestructible, resetDestructibles, updateProps, crushAnims, pendingBlasts };
}`);
const runtimeBody = runtimeSource.slice(runtimeSource.indexOf('{') + 1, runtimeSource.lastIndexOf('}'));

function seeded(seed) {
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5 | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function makeRecord(kind, index, x, z, pools, rng) {
  const meta = DESTRUCTIBLE_TYPES[kind];
  let pool = pools.get(kind);
  if (!pool) {
    pool = { meta, mats4: [], records: [], nBroken: 0 };
    pools.set(kind, pool);
  }
  const record = {
    kind, cls: meta.cls, x, y: 0, z, yaw: 0, sc: 1, r: meta.r, h: meta.h,
    slot: pool.mats4.length, state: 0, ob: null,
  };
  if (meta.contact === 'ob') {
    record.ob = {
      min: [x - meta.r, 0, z - meta.r], max: [x + meta.r, meta.h, z + meta.r],
      propIdx: index, kind, crushable: true, crushed: false,
    };
    if (meta.collider) record.col = { ...record.ob, dead: false };
  } else record.loopRef = { x, y: 0, z, r: meta.r, h: meta.h, recIdx: index, toppled: false };
  if (meta.cls === 'physics') {
    record.body = loose.createLoosePropBody({ x, baseY: 0, z, radius: meta.bodyR,
      height: meta.h, mass: meta.mass, restitution: meta.bounce, spinBias: rng() - 0.5 });
    record.looseListed = false;
  }
  pool.mats4.push(new THREE.Matrix4().makeTranslation(x, 0, z));
  pool.records.push(record);
  return record;
}

function finalizePools(pools, rng) {
  const material = new THREE.MeshBasicMaterial();
  for (const pool of pools.values()) {
    pool.imI = new THREE.InstancedMesh(pool.meta.build(rng), material, pool.mats4.length);
    pool.mats4.forEach((matrix, index) => pool.imI.setMatrixAt(index, matrix));
    pool.imB = pool.meta.broken
      ? new THREE.InstancedMesh(pool.meta.broken(rng), material, pool.mats4.length) : null;
    if (pool.imB) { pool.imB.count = 0; pool.imB.visible = false; }
  }
  return material;
}

function fixture(specs = [['crate', 0, 0], ['wallstone', 0, 0], ['barrel', 0, 0]]) {
  const rng = seeded(7719), pools = new Map();
  const records = specs.map(([kind, x, z], i) => makeRecord(kind, i, x, z, pools, rng));
  const material = finalizePools(pools, rng);
  const obstacles = records.flatMap((r) => r.ob ? [r.ob] : []);
  const bodies = records.filter((r) => r.body);
  bodies.forEach((r, i) => { r.looseIndex = i; });
  const group = new THREE.Group();
  new THREE.Scene().add(group);
  const events = [];
  seam.setDestroyedEventSink((event) => events.push(event));
  const context = {
    THREE, ...seam, ...loose, setToppleAxis, settledToppleAngle,
    destructibles: records, dPools: pools, obstacles, looseRecords: bodies, activeLoose: [],
    heightField: { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }) },
    group, mapId: 'authority-fixture', seed: 7719, drng: rng, mulberry32: seeded,
    utilityNetwork: null, poleIM: null, crushables: records.flatMap((r) => r.loopRef ? [r.loopRef] : []),
    // Poles are absent. The tested runtime still executes every destruction/
    // loose-body/reset function; only unrelated earlier pole LOD is inert.
    updatePoleLod() {},
    _quat: new THREE.Quaternion(), _upAxis: new THREE.Vector3(0, 1, 0),
    _mat4: new THREE.Matrix4(), _posv: new THREE.Vector3(), _zeroScale: new THREE.Vector3(),
  };
  const runtime = compileFunction(runtimeBody, Object.keys(context),
    { filename: 'props.ts:production-destructible-runtime' })(...Object.values(context));
  function dispose() {
    for (const pool of pools.values()) {
      pool.imI.geometry.dispose(); pool.imI.dispose();
      if (pool.imB) { pool.imB.geometry.dispose(); pool.imB.dispose(); }
    }
    material.dispose(); group.removeFromParent(); seam.setDestroyedEventSink(null);
  }
  return { ...runtime, records, pools, events, dispose };
}

function assertCoverIntact(f, label) {
  for (const record of f.records.filter((r) => r.ob || r.col)) {
    assert.equal(record.state, 0, `${label}: ${record.kind} needs authority before breaking`);
    if (record.ob) assert.equal(record.ob.crushed, false, `${label}: movement still blocks`);
    if (record.col) assert.equal(record.col.dead, false, `${label}: shells still block`);
    const matrix = new THREE.Matrix4();
    const pool = f.pools.get(record.kind);
    pool.imI.getMatrixAt(record.slot, matrix);
    assert.deepEqual(matrix.elements, pool.mats4[record.slot].elements, `${label}: intact upload retained`);
  }
}

for (const [label, callback] of [
  ['sweep', () => seam.notifyShellSweep(-3, 0.1, 0, 3, 0.1, 0)],
  ['AP impact', () => seam.notifyShellImpact(0, 0.1, 0, { r: 1, he: false })],
  ['HE impact', () => seam.notifyShellImpact(0, 0.1, 0, { r: 4.6, he: true })],
]) {
  const f = fixture();
  try {
    callback();
    assertCoverIntact(f, label);
    assert.equal(f.records[2].state, 1, `${label}: non-colliding barrel still breaks`);
    assert.deepEqual(f.events.map((event) => event.kind), ['barrel']);
    callback();
    assert.equal(f.events.length, 1, `${label}: repeated visual traffic is idempotent`);
  } finally { f.dispose(); }
}

// Independently exercise shell-only ownership too. Production normally links
// both records for walls; neither field alone may grant cosmetic permission.
const shellOnly = fixture([['wallstone', 0, 0], ['barrel', 0, 0]]);
try {
  shellOnly.records[0].ob = null;
  seam.notifyShellSweep(-3, 0.1, 0, 3, 0.1, 0);
  seam.notifyShellImpact(0, 0.1, 0, { r: 4.6, he: true });
  assertCoverIntact(shellOnly, 'shell-only record');
  assert.equal(shellOnly.records[1].state, 1);
} finally { shellOnly.dispose(); }

// Exercise the two actual authority callers, using the same world->props seam.
// The dedicated suite separately proves server hit resolution/revision emission.
function sourceFunction(path, name, next) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  const from = text.indexOf(`function ${name}(`), to = text.indexOf(next, from);
  assert.ok(from >= 0 && to > from, `${name}: actual caller exists`);
  return stripTypeScriptTypes(text.slice(from, to));
}
const soloCaller = sourceFunction('../game/state.ts', 'crushWorldPropFromShell',
  'const MAX_SHELL_PASS_THROUGH_HITS_PER_STEP');
const netCaller = sourceFunction('../net/browserBattleBridge.ts', 'emitWorldPropDestroyed',
  'function emitLocalPlayerEvent(');

function exerciseAuthority(mode, f) {
  const world = {
    getObstacles: () => f.records.filter((r) => r.ob).map((r) => r.ob),
    crushObstacle: (ob, dx, dz, speed, cause) => f.crushDestructible(ob.propIdx, dx, dz, speed, cause),
  };
  const bus = { emit() {} };
  if (mode === 'solo') {
    const call = compileFunction(`${soloCaller};return crushWorldPropFromShell;`, ['_seg'])({ x: 1, z: 0 });
    for (const record of f.records.filter((r) => r.ob)) {
      call(world, bus, { spec: { velocityMps: 900 } }, { record: record.col || record.ob });
    }
  } else {
    const call = compileFunction(`${netCaller};return emitWorldPropDestroyed;`, ['worldCollision', 'bus'])(world, bus);
    for (let index = 0; index < world.getObstacles().length; index++) {
      call({ obstacleIndex: index, directionX: 1, directionZ: 0, speedMps: 900, cause: 'shell' });
    }
  }
}

for (const mode of ['solo', 'authoritative event']) {
  const f = fixture();
  const buffers = [...f.pools.values()].flatMap((pool) => [pool.imI, pool.imB])
    .filter(Boolean).map((mesh) => [mesh, mesh.geometry, mesh.instanceMatrix.array, mesh.material]);
  try {
    for (let rematch = 0; rematch < 3; rematch++) {
      seam.notifyShellImpact(0, 0, 0, { r: 4.6, he: true });
      assertCoverIntact(f, mode);
      exerciseAuthority(mode, f);
      assert.ok(f.records.every((r) => r.state === 1), `${mode}: direct hit destroys every selected record`);
      assert.ok(f.records.filter((r) => r.ob).every((r) => r.ob.crushed));
      assert.ok(f.records.filter((r) => r.col).every((r) => r.col.dead));
      const eventCount = f.events.length;
      exerciseAuthority(mode, f);
      assert.equal(f.events.length, eventCount, `${mode}: duplicate authority is idempotent`);
      f.updateProps(1 / 60);
      f.resetDestructibles();
      assertCoverIntact(f, `${mode} reset`);
      assert.ok(f.records.every((r) => !r.state && !r.loopRef?.toppled));
      for (const pool of f.pools.values()) {
        assert.equal(pool.nBroken, 0); assert.equal(pool.imB?.count, 0);
        assert.equal(pool.imB?.visible, false);
      }
    }
    for (const [mesh, geometry, buffer, material] of buffers) {
      assert.equal(mesh.geometry, geometry, 'no replacement geometry across destruction/rematches');
      assert.equal(mesh.instanceMatrix.array, buffer, 'fixed instance capacity across rematches');
      assert.equal(mesh.material, material, 'existing shared material reused across rematches');
    }
  } finally { f.dispose(); }
}

// Explosive decoration can chain and kick loose bodies, but not breach nearby
// collidable cover. It uses the real deferred max-two-blasts update path.
const cascade = fixture([['drumred', 0, 0], ['drumred', 3, 0], ['wallstone', 3, 0], ['bucket', 3, 0]]);
try {
  seam.notifyShellSweep(-1, 0.2, 0, 1, 0.2, 0);
  assert.equal(cascade.pendingBlasts.length, 1);
  cascade.updateProps(1 / 60);
  assert.equal(cascade.records[1].state, 1, 'deferred cosmetic drum chain preserved');
  assert.equal(cascade.records[3].body.active, true, 'cosmetic loose debris still receives blast impulse');
  assertCoverIntact(cascade, 'deferred drum blast');
  cascade.resetDestructibles();
  assert.equal(cascade.pendingBlasts.length, 0);
  assert.equal(cascade.crushAnims.length, 0);
  assert.equal(cascade.records[3].body.active, false);
  assert.equal(cascade.records[3].x, 3);
  assertCoverIntact(cascade, 'cascade reset');
} finally { cascade.dispose(); }

for (const [mode, cap] of [['sweep', 3], ['impact', 6]]) {
  const f = fixture(Array.from({ length: 9 }, () => ['barrel', 0, 0]));
  try {
    if (mode === 'sweep') seam.notifyShellSweep(-1, 0.2, 0, 1, 0.2, 0);
    else seam.notifyShellImpact(0, 0.2, 0, { r: 4.6, he: true });
    assert.equal(f.records.filter((r) => r.state).length, cap, `${mode}: original per-call cap preserved`);
  } finally { f.dispose(); }
}

console.log('destructibleAuthority.selftest: cosmetic/authority boundary, actual solo/network callers, fixed pools, deferred blasts and rematch reset passed');
