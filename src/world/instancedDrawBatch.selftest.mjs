// world-pools-272 (2026-11-12): instanced pools that share a material draw as one batch (src/world/instancedDrawBatch.ts).
// A construction receipt, no GPU:
//   - pools of one material and layout join one BatchedMesh; a pool alone in its material, transparent, hidden, carrying an
//     instanced attribute of its own (a night fixture's) or transformed keeps its own draw, with the reason;
//   - the members move to the shadow-only layer (they cast as before) and the batch draws in their layers, casting nothing;
//   - the batch holds every member slot's matrix and colour, and follows the members' writes (a crushed prop's matrix, a
//     tint) when their streams' versions move, its count (a hidden tail) and its visibility;
//   - a member whose geometry is swapped leaves the batch and draws itself again;
//   - the same-page switch restores every member's own draw and hides the batch, and back;
//   - a hook written for instancing reads the batching frame in the batched program, and only there.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHADOW_ONLY_LAYER } from '../engine/renderLayers.ts';
import { batchInstancedPools, batchMaterialProgram, batchShaderSource, setInstancedDrawBatching } from './instancedDrawBatch.ts';

const parent = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0x886644 });
const stone = new THREE.MeshStandardMaterial({ color: 0x777777 });
const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });

function pool(name, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, m.makeTranslation(i * 3, 0, name.length));
    mesh.setColorAt(i, new THREE.Color(0.5 + i * 0.01, 0.4, 0.3));
  }
  parent.add(mesh);
  return mesh;
}
const crate = pool('destructible-crate', new THREE.BoxGeometry(1, 1, 1), wood, 4);
const fence = pool('destructible-fenceplank', new THREE.BoxGeometry(2, 1, 0.1), wood, 6);
const drum = pool('destructible-drum', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), wood, 3);
const wall = pool('destructible-wallstone', new THREE.BoxGeometry(2, 1, 0.5), stone, 5);
const pane = pool('destructible-pane', new THREE.PlaneGeometry(1, 1).toNonIndexed(), glass, 2);
const lamp = pool('destructible-lamp', new THREE.BoxGeometry(0.2, 3, 0.2), wood, 2);
lamp.geometry.setAttribute('aFixtureActive', new THREE.InstancedBufferAttribute(new Uint8Array(2).fill(1), 1));
const hidden = pool('destructible-hidden', new THREE.BoxGeometry(1, 1, 1), wood, 2);
hidden.visible = false;

const batching = batchInstancedPools(parent, [crate, fence, drum, wall, pane, lamp, hidden], 'destructible-batch');
assert.equal(batching.batches.length, 1, 'the three wood pools of one layout share one batch');
const batch = batching.batches[0];
assert.deepEqual(batch.members.map(m => m.name), ['destructible-crate', 'destructible-fenceplank', 'destructible-drum']);
assert.equal(batching.drawsBefore, 3); assert.equal(batching.drawsAfter, 1);
const why = Object.fromEntries(batching.skipped.map(s => [s.name, s.why]));
assert.equal(why['destructible-wallstone'], 'alone in its material');
assert.equal(why['destructible-pane'], 'transparent');
assert.equal(why['destructible-lamp'], 'instanced aFixtureActive');
assert.equal(why['destructible-hidden'], 'hidden');

const mesh = batch.mesh;
assert.ok(mesh.isBatchedMesh && mesh.parent === parent && mesh.material === wood);
assert.equal(mesh.castShadow, false, 'the members cast; the batch draws the color passes only');
assert.equal(mesh.receiveShadow, true);
assert.equal(mesh.sortObjects, true); assert.equal(typeof mesh.customSort, "function"); assert.equal(mesh.perObjectFrustumCulled, true);
for (const m of batch.members) {
  assert.equal(m.layers.mask, 1 << SHADOW_ONLY_LAYER, `${m.name}: on the shadow-only layer`);
  assert.equal(m.castShadow, true);
}
assert.equal(mesh.layers.mask, 1, 'the batch draws in the members\' own layers');
for (const m of [wall, pane, lamp]) assert.equal(m.layers.mask, 1, `${m.name}: keeps its own draw`);

// every slot mirrored
const a = new THREE.Matrix4(), b = new THREE.Matrix4(), ca = new THREE.Color(), cb = new THREE.Color();
function assertMirrored(label) {
  let slot = 0;
  for (const m of batch.members) {
    for (let i = 0; i < m.instanceMatrix.count; i++, slot++) {
      m.getMatrixAt(i, a); mesh.getMatrixAt(slot, b);
      assert.ok(a.equals(b), `${label}: ${m.name}[${i}] matrix`);
      m.getColorAt(i, ca); mesh.getColorAt(slot, cb);
      assert.ok(Math.abs(ca.r - cb.r) < 1e-6 && Math.abs(ca.g - cb.g) < 1e-6 && Math.abs(ca.b - cb.b) < 1e-6, `${label}: ${m.name}[${i}] colour`);
      assert.equal(mesh.getVisibleAt(slot), m.visible && i < m.count, `${label}: ${m.name}[${i}] visibility`);
    }
  }
}
assertMirrored('built');
// a member's write reaches the batch at its next sync once the stream's version moves, and not before
fence.setMatrixAt(2, new THREE.Matrix4().makeScale(0, 0, 0));
batch.sync();
mesh.getMatrixAt(4 + 2, b);
assert.ok(!b.equals(new THREE.Matrix4().makeScale(0, 0, 0)), 'an unflagged write is not mirrored (the GPU would not see it either)');
fence.instanceMatrix.needsUpdate = true;
drum.setColorAt(1, new THREE.Color(0.1, 0.9, 0.2)); drum.instanceColor.needsUpdate = true;
batch.sync();
assertMirrored('after a crush and a tint');
// the count and the visibility
crate.count = 2;
batch.sync();
assertMirrored('a shorter live prefix');
crate.count = 4; drum.visible = false;
batch.sync();
assertMirrored('a hidden member');
drum.visible = true;
batch.sync();
assertMirrored('shown again');
// the render hook syncs before the draw
fence.setMatrixAt(0, new THREE.Matrix4().makeTranslation(9, 9, 9)); fence.instanceMatrix.needsUpdate = true;
const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
mesh.onBeforeRender({}, null, camera, mesh.geometry, mesh.material, null);
assertMirrored('the draw syncs first');

// the draw order: the members in the order three's painter sort gave the pools (their depth, then their id), each
// member's instances in slot order. The fence pool sits nearest a camera looking down -z from far +z, then the drum, the crate.
{
  const list = [];
  for (let i = 0; i < 13; i++) list.push({ start: i * 6, count: 6, z: 0, index: i });
  const eye = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  eye.position.set(0, 0, 400); eye.lookAt(0, 0, 0); eye.updateMatrixWorld(); eye.updateProjectionMatrix();
  // (the fence's instances as built: the crush and the move above shifted its sphere)
  for (const i of [0, 2]) fence.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 3, 0, fence.name.length));
  fence.instanceMatrix.needsUpdate = true;
  for (const m of batch.members) { m.boundingSphere = null; m.updateMatrixWorld(); }
  crate.position.z = -50; crate.updateMatrix(); crate.updateMatrixWorld();
  mesh.customSort.call(mesh, list, eye);
  // crate at z = -50 is farthest, drum (name length 17) beyond fence (23): fence, drum, crate
  assert.deepEqual(list.map(x => x.index), [4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 1, 2, 3], 'nearest member first, each in slot order');
  crate.position.z = 0; crate.updateMatrix(); crate.updateMatrixWorld(); crate.boundingSphere = null;
  assert.equal(mesh.sortObjects, true);
}

// the same-page switch
assert.equal(setInstancedDrawBatching(false), 1);
assert.equal(mesh.visible, false);
for (const m of batch.members) assert.equal(m.layers.mask, 1, `${m.name}: draws itself with the batching off`);
fence.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-5, 0, 0)); fence.instanceMatrix.needsUpdate = true;
assert.equal(setInstancedDrawBatching(true), 1);
assert.equal(mesh.visible, true);
for (const m of batch.members) assert.equal(m.layers.mask, 1 << SHADOW_ONLY_LAYER);
assertMirrored('switched back on (the writes made while off reached the batch)');

// a swapped geometry leaves the batch
drum.geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8);
batch.sync();
assert.equal(drum.layers.mask, 1, 'the swapped member draws itself again');
for (let i = 0; i < 3; i++) assert.equal(mesh.getVisibleAt(10 + i), false, 'its slots in the batch are hidden');

// the program: instancing hooks read the batching frame, only in the batched program, fetched at the top of main (the
// clutter tint reads the instance after color_vertex, before three's batching_vertex declares batchingMatrix)
const hook = `#include <common>
attribute float aClutterLod;
void main() {
#include <color_vertex>
  #ifdef USE_INSTANCING
  vec4 tintAt = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif
#include <batching_vertex>
#include <worldpos_vertex>
  vec4 gw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw;
  #endif
  #if defined( USE_INSTANCING ) && defined( FOO )
  float s = instanceMatrix[3].x;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vec3 c = instanceColor;
  #endif
}`;
const batched = batchShaderSource(hook);
const mainAt = batched.indexOf('void main() {');
const fetchAt = batched.indexOf('mat4 cotBatchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );');
assert.ok(mainAt >= 0 && fetchAt > mainAt && fetchAt < batched.indexOf('#include <color_vertex>'), 'the instance frame is fetched first in main');
assert.match(batched, /vec3 cotBatchingColor = getBatchingColor\( getIndirectIndex\( gl_DrawID \) \)\.xyz;/);
assert.match(batched, /#if defined\( USE_INSTANCING \) \|\| defined\( USE_BATCHING \)\n {2}vec4 tintAt = cotBatchingMatrix \* vec4/);
assert.match(batched, /#if defined\( USE_INSTANCING \) \|\| defined\( USE_BATCHING \)\n {2}gw = cotBatchingMatrix \* gw;/);
assert.match(batched, /#if \( defined\( USE_INSTANCING \) \|\| defined\( USE_BATCHING \) \) && defined\( FOO \)/);
assert.match(batched, /float s = cotBatchingMatrix\[3\]\.x;/);
assert.match(batched, /#if defined\( USE_INSTANCING_COLOR \) \|\| defined\( USE_BATCHING \)\n {2}vec3 c = cotBatchingColor;/);
assert.ok(!/\binstance(Matrix|Color)\b/.test(batched), 'no instancing name is left');
assert.ok(batched.startsWith('#include <common>\nattribute float aClutterLod;\nvoid main() {'), 'the preamble is untouched');
assert.ok(batched.includes('#include <batching_vertex>') && batched.includes('#include <worldpos_vertex>'), 'three\'s chunks untouched');
assert.equal(batchShaderSource(batched), batched, 'idempotent');
const plain = 'void main() {\n#include <begin_vertex>\n}';
assert.equal(batchShaderSource(plain), plain, 'a program with no instancing text is left alone');
const inlined = 'void main() {\nmvPosition = batchingMatrix * mvPosition;\n#ifdef USE_INSTANCING\nmvPosition = instanceMatrix * mvPosition;\n#endif\n}';
assert.equal(batchShaderSource(inlined), inlined, 'a hook that inlined three\'s matrix batching branch is left alone');
// an inlined color_vertex (vehicleSurface.ts: the instance colour masked to the paint) draws the batch through its own
// instancing branch, and its batching branch no longer multiplies a second time; the fold beside it reads the instance
const livery = `void main() {
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, surf.z);
#endif
#ifdef USE_BATCHING_COLOR
  vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif
#include <begin_vertex>
  #ifdef USE_INSTANCING
  at = instanceMatrix * at;
  #endif
}`;
const liveried = batchShaderSource(livery);
assert.match(liveried, /#if defined\( USE_INSTANCING_COLOR \) \|\| defined\( USE_BATCHING \)\n {2}vColor\.rgb \*= mix\(vec3\(1\.0\), cotBatchingColor\.rgb, surf\.z\);/);
assert.match(liveried, /#if 0 \/\/ \(world-pools-272: the instancing colour branch above draws the batch\)\n {2}vColor \*= getBatchingColor/);
assert.match(liveried, /at = cotBatchingMatrix \* at;/);
const material = new THREE.MeshStandardMaterial();
material.onBeforeCompile = (shader) => { shader.vertexShader = hook; };
batchMaterialProgram(material); batchMaterialProgram(material);
const instanced = { vertexShader: '', batching: false }, batchedShader = { vertexShader: '', batching: true };
material.onBeforeCompile(instanced, null); material.onBeforeCompile(batchedShader, null);
assert.equal(instanced.vertexShader, hook, 'the instanced program is the hook\'s own');
assert.equal(batchedShader.vertexShader, batched, 'the batched program reads the batching frame (installed once)');

batching.dispose();
assert.equal(mesh.parent === null, true, 'the batch left its parent');
for (const m of [crate, fence]) assert.equal(m.layers.mask, 1, `${m.name}: its own draw after the batch is gone`);
console.log('instancedDrawBatch selftest PASS — 3 wood pools in 1 batch; 4 kept their draws (alone, transparent, fixture, hidden)');
