import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

if (typeof global.gc !== 'function') {
  const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], {
    stdio: 'inherit', timeout: 30_000,
  });
  assert.equal(child.error, undefined, 'native GC test must finish within its finite timeout');
  assert.equal(child.status, 0, 'native GC child must pass');
  process.exit(0);
}

// Execute the actual private culling block, without constructing a renderer or
// exposing production test APIs. Three's real meshes/attributes exercise the
// same snapshot, compaction and restoration functions used by shadow draws.
const source = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
const start = source.indexOf('const SHADOW_CULL_MIN_TRIS =');
const end = source.indexOf('// --- r6 SHADOW-CASTER RESCUE', start);
assert.ok(start >= 0 && end > start, 'the complete production culling block must be present');
const actual = stripTypeScriptTypes(source.slice(start, end), { mode: 'strip' });
const cull = new Function('THREE', `${actual}\nreturn {
  build: buildCullRec, before: shadowCullBefore, after: shadowCullAfter,
  claims: _geomClaims, states: _cullState,
};`)(THREE);

function makeGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.setAttribute('instanceWeight', new THREE.InstancedBufferAttribute(new Float32Array([11, 22, 33]), 1));
  return geometry;
}

function makeMesh(geometry) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 3);
  for (let i = 0; i < 3; i++) {
    mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation([100, 0, 200][i], 0, 0));
    mesh.setColorAt(i, new THREE.Color(0.1 + i * 0.2, 0.2, 0.3));
  }
  mesh.updateMatrixWorld(true);
  return mesh;
}

const nextTask = () => new Promise(resolve => setImmediate(resolve));
async function requireCollected(refs, label) {
  for (let attempt = 0; attempt < 16; attempt++) {
    // WeakRef keeps a dereferenced target alive for the current task. Both the
    // construction task and any failed observation must end before collecting.
    await nextTask();
    global.gc();
    await nextTask();
    if (refs.every(ref => ref.deref() === undefined)) return;
  }
  assert.fail(`${label}: object remains retained while its library geometry is alive`);
}

function claimDiscardedWorld(geometry) {
  const world = new THREE.Group();
  world.name = 'world-discarded';
  const props = new THREE.Group();
  const mesh = makeMesh(geometry);
  props.add(mesh);
  world.add(new THREE.Group(), new THREE.Group(), props);
  assert.ok(cull.build(mesh), 'a single owner can build its cull snapshot');
  const claim = cull.claims.get(geometry);
  assert.ok(claim instanceof WeakRef);
  assert.equal(claim.deref(), mesh);
  assert.ok(cull.build(mesh), 'the same owner can rebuild after invalidation');
  assert.equal(cull.claims.get(geometry), claim, 'same-owner rebuilding reuses its weak claim');
  return { claim, refs: [new WeakRef(mesh), new WeakRef(props), new WeakRef(world)] };
}

{
  const geometry = makeGeometry();
  const library = new Map([['cached-pole', geometry]]);
  const { claim, refs } = claimDiscardedWorld(geometry);
  await requireCollected(refs, 'discarded mesh, parent and whole world');
  assert.equal(library.get('cached-pole'), geometry, 'the shared geometry itself stays strongly alive');
  assert.equal(claim.deref(), undefined, 'the expired claim does not retain its old owner');
  const replacement = makeMesh(geometry);
  assert.ok(cull.build(replacement), 'an expired sole owner can be reclaimed safely');
  assert.notEqual(cull.claims.get(geometry), claim, 'reclamation replaces only an expired weak claim');
  assert.equal(cull.claims.get(geometry).deref(), replacement);
  assert.deepEqual([...geometry.getAttribute('instanceWeight').array], [11, 22, 33]);
}

const shadowCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
shadowCamera.position.set(0, 0, 20);
shadowCamera.lookAt(0, 0, 0);
shadowCamera.updateMatrixWorld(true);

function proveSharedSafety(geometry) {
  const first = makeMesh(geometry), second = makeMesh(geometry), third = makeMesh(geometry);
  const originalMatrix = [...first.instanceMatrix.array];
  const originalColor = [...first.instanceColor.array];
  const originalWeight = [...geometry.getAttribute('instanceWeight').array];
  assert.ok(cull.build(first));
  cull.before(first, shadowCamera);
  assert.equal(first.count, 1, 'the real shadow path compacts an unshared owner');
  assert.equal(geometry.getAttribute('instanceWeight').array[0], 22,
    'geometry-level instanced attributes follow the compacted matrix slot');
  cull.after(first);
  assert.equal(first.count, 3);
  assert.deepEqual([...first.instanceMatrix.array], originalMatrix);
  assert.deepEqual([...first.instanceColor.array], originalColor);
  assert.deepEqual([...geometry.getAttribute('instanceWeight').array], originalWeight,
    'owner bytes are restored before another mesh can use the geometry');

  assert.equal(cull.build(second), null, 'a second live owner invalidates sharing');
  assert.equal(cull.states.get(first), null, 'the first owner is invalidated too');
  assert.equal(cull.states.get(second), null);
  assert.equal(cull.claims.get(geometry), null, 'the shared sentinel owns no mesh');
  assert.equal(cull.build(third), null, 'a third owner cannot reclaim known-shared geometry');
  assert.equal(cull.states.get(third), null);
  for (const mesh of [first, second, third]) {
    for (let frame = 0; frame < 8; frame++) {
      cull.before(mesh, shadowCamera);
      cull.after(mesh);
    }
    assert.equal(mesh.count, 3);
    assert.deepEqual([...mesh.instanceMatrix.array], originalMatrix);
    assert.deepEqual([...mesh.instanceColor.array], originalColor);
  }
  assert.deepEqual([...geometry.getAttribute('instanceWeight').array], originalWeight,
    'shared attributes remain byte-identical across every later shadow draw');
  return [new WeakRef(first), new WeakRef(second), new WeakRef(third)];
}

{
  const geometry = makeGeometry();
  const refs = proveSharedSafety(geometry);
  await requireCollected(refs, 'all owners of shared geometry');
  assert.equal(cull.claims.get(geometry), null, 'sharing remains recorded after every owner collects');
  const later = makeMesh(geometry);
  assert.equal(cull.build(later), null, 'later worlds cannot restart shared-attribute compaction');
  assert.equal(later.count, 3);
  assert.deepEqual([...geometry.getAttribute('instanceWeight').array], [11, 22, 33]);
}

console.log('shadowGeometryClaims.selftest: real cross-task GC, claim reuse/reclamation and shared-attribute safety passed');
