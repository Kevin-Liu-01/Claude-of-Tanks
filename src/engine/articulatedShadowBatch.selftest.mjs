import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installArticulatedShadowBatch } from './articulatedShadowBatch.ts';
import { markShadowOnly, SHADOW_ONLY_LAYER } from './renderLayers.ts';

// Real pinned Three.js batching/culling, with no renderer, canvas, GPU or clock.
// This establishes CPU ownership and exact authored data, not native draw savings.
const NO_RAYCAST = () => {};

function triangle(indexed = false, width = 0.5) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -width, -0.5, 0, width, -0.5, 0, 0, 0.5, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ], 3));
  if (indexed) geometry.setIndex([0, 1, 2]);
  return geometry;
}

function fixture(count = 3, indexed = false) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const depthMaterial = new THREE.MeshDepthMaterial();
  const owners = [], sources = [];
  for (let index = 0; index < count; index++) {
    const owner = new THREE.Group();
    owner.position.set((index - 1) * 4, 0, -10);
    const source = markShadowOnly(new THREE.Mesh(triangle(indexed, 0.25 + index * 0.125), material));
    source.name = `authored-${index}`;
    source.userData.authoredShadowProxy = true;
    source.customDepthMaterial = depthMaterial;
    source.castShadow = true;
    source.receiveShadow = false;
    source.raycast = NO_RAYCAST;
    owner.add(source);
    root.add(owner);
    owners.push(owner); sources.push(source);
  }
  scene.updateMatrixWorld(true);
  return { scene, root, owners, sources, material, depthMaterial };
}

function snapshot(source) {
  const attributes = Object.fromEntries(Object.entries(source.geometry.attributes).map(([name, attr]) =>
    [name, { attribute: attr, array: attr.array, values: Array.from(attr.array), version: attr.version }]));
  return {
    source, parent: source.parent, geometry: source.geometry, material: source.material,
    customDepthMaterial: source.customDepthMaterial, visible: source.visible,
    castShadow: source.castShadow, receiveShadow: source.receiveShadow,
    layers: source.layers.mask, raycast: source.raycast, attributes,
    index: source.geometry.index, indexValues: source.geometry.index ? Array.from(source.geometry.index.array) : null,
    groups: structuredClone(source.geometry.groups), drawRange: { ...source.geometry.drawRange },
    boundingBox: source.geometry.boundingBox, boundingSphere: source.geometry.boundingSphere,
  };
}

function unchanged(receipt, castShadow = receipt.castShadow) {
  const source = receipt.source;
  for (const name of ['parent', 'geometry', 'material', 'customDepthMaterial', 'visible', 'receiveShadow', 'raycast']) {
    assert.equal(source[name], receipt[name], `${source.name}: ${name} ownership is unchanged`);
  }
  assert.equal(source.castShadow, castShadow, `${source.name}: expected casting state`);
  assert.equal(source.layers.mask, receipt.layers, 'source routing is unchanged');
  assert.equal(source.geometry.index, receipt.index, 'source index identity is retained');
  if (receipt.indexValues) assert.deepEqual(Array.from(source.geometry.index.array), receipt.indexValues);
  assert.deepEqual(source.geometry.groups, receipt.groups);
  assert.deepEqual(source.geometry.drawRange, receipt.drawRange);
  assert.equal(source.geometry.boundingBox, receipt.boundingBox, 'borrowed bounds remain untouched');
  assert.equal(source.geometry.boundingSphere, receipt.boundingSphere, 'borrowed sphere remains untouched');
  assert.deepEqual(Object.keys(source.geometry.attributes), Object.keys(receipt.attributes));
  for (const [name, attr] of Object.entries(receipt.attributes)) {
    assert.equal(source.geometry.attributes[name], attr.attribute);
    assert.equal(source.geometry.attributes[name].array, attr.array);
    assert.equal(source.geometry.attributes[name].version, attr.version);
    assert.deepEqual(Array.from(attr.array), attr.values, `${name}: input bytes never change`);
  }
}

function sameMatrix(actual, expected, label) {
  for (let index = 0; index < 16; index++) {
    assert.ok(Math.abs(actual.elements[index] - expected.elements[index]) < 2e-6,
      `${label}: element ${index}: ${actual.elements[index]} vs ${expected.elements[index]}`);
  }
}

function cameraAt(x = 0, halfWidth = 1) {
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, 2, -2, 0.1, 50);
  camera.position.set(x, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function shadow(batch, shadowCamera, presentationCamera = cameraAt(100), renderer = {},
  depthMaterial = batch.customDepthMaterial) {
  // Pinned BatchedMesh.onBeforeShadow delegates to onBeforeRender using the
  // LIGHT camera. Its real CPU culling must run once for every cascade.
  presentationCamera.layers.enable(SHADOW_ONLY_LAYER);
  batch.onBeforeShadow(renderer, batch, presentationCamera, shadowCamera,
    batch.geometry, depthMaterial, null);
}

function verifyPackedGeometry(batch, sources) {
  sources.forEach((source, instanceId) => {
    const range = batch.getGeometryRangeAt(batch.getGeometryIdAt(instanceId));
    assert.equal(range.vertexCount, source.geometry.attributes.position.count);
    for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
      const packed = batch.geometry.getAttribute(name);
      assert.equal(packed.itemSize, attribute.itemSize);
      assert.equal(packed.normalized, attribute.normalized);
      const begin = range.vertexStart * attribute.itemSize;
      assert.deepEqual(Array.from(packed.array.slice(begin, begin + attribute.array.length)),
        Array.from(attribute.array), `${source.name}: packed ${name} preserves authored values`);
    }
    if (source.geometry.index) {
      const packed = batch.geometry.index.array.slice(range.indexStart, range.indexStart + range.indexCount);
      assert.deepEqual(Array.from(packed, value => value - range.vertexStart),
        Array.from(source.geometry.index.array), 'indices preserve exact winding and triangle order');
    } else {
      assert.equal(batch.geometry.index, null, 'non-indexed inputs remain non-indexed');
      assert.equal(range.count, source.geometry.attributes.position.count);
    }
  });
}

function disposeFixture(f) {
  for (const source of f.sources) source.geometry.dispose();
  f.material.dispose(); f.depthMaterial.dispose();
}

// Both supported population sizes and index layouts preserve inputs and routing.
for (const count of [2, 3]) for (const indexed of [false, true]) {
  const f = fixture(count, indexed);
  f.sources[1].visible = false;
  const before = f.sources.map(snapshot);
  const sourceArray = Object.freeze([...f.sources]);
  const batch = installArticulatedShadowBatch(f.root, sourceArray);
  assert.ok(batch instanceof THREE.BatchedMesh, 'uses real pinned BatchedMesh');
  assert.equal(batch.parent, f.root);
  assert.equal(batch.castShadow, true);
  assert.equal(batch.frustumCulled, false, 'aggregate bounds must never drop articulated casters');
  assert.equal(batch.perObjectFrustumCulled, true, 'each shadow camera retains per-proxy culling');
  assert.equal(batch.material, f.material);
  assert.equal(batch.customDepthMaterial, f.depthMaterial);
  assert.equal(batch.layers.mask, 1 << SHADOW_ONLY_LAYER);
  assert.equal(batch.layers.test(cameraAt().layers), false, 'presentation camera excludes the batch');
  assert.equal(f.root.children.length, count + 1, 'only the batch is appended');
  before.forEach(receipt => unchanged(receipt, false));
  shadow(batch, cameraAt(0, 20));
  assert.equal(batch.getVisibleAt(1), false, 'source.visible remains authoritative');
  verifyPackedGeometry(batch, f.sources);
  const hits = [];
  batch.raycast(new THREE.Raycaster(new THREE.Vector3(-4, 0, 0), new THREE.Vector3(0, 0, -1)), hits);
  assert.deepEqual(hits, [], 'authored shadow-only geometry cannot acquire raycast hits');
  batch.dispose();
  before.forEach(receipt => unchanged(receipt));
  assert.deepEqual(f.root.children, [...f.owners, batch], 'dispose preserves traversal-stable child order');
  assert.equal(batch.visible, false, 'disposed batch remains inert in the retained hierarchy');
  assert.equal(batch.castShadow, false);
  disposeFixture(f);
}

// Camera-dependent native batch lists must be rebuilt for all four cascades.
{
  const f = fixture();
  const batch = installArticulatedShadowBatch(f.root, f.sources);
  const cameras = [cameraAt(-4), cameraAt(0), cameraAt(4), cameraAt(0, 10)];
  const expectedCounts = [1, 1, 1, 3];
  const seen = [];
  const pinnedBeforeRender = THREE.BatchedMesh.prototype.onBeforeRender;
  batch.onBeforeRender = function (...args) {
    seen.push(args[2]);
    return pinnedBeforeRender.apply(this, args);
  };
  let writes = 0;
  const setMatrixAt = batch.setMatrixAt;
  batch.setMatrixAt = function (...args) { writes++; return setMatrixAt.apply(this, args); };
  cameras.forEach((camera, index) => {
    shadow(batch, camera);
    assert.equal(batch._multiDrawCount, expectedCounts[index], `cascade ${index}: actual pinned culling`);
  });
  assert.deepEqual(seen, cameras, 'the pinned base hook receives all four distinct shadow cameras');
  const afterInitialSync = writes;
  cameras.forEach(camera => shadow(batch, camera));
  assert.equal(writes, afterInitialSync, 'unchanged articulation never rewrites matrix texture');

  f.owners[1].position.y = 0.25;
  f.scene.updateMatrixWorld(true);
  shadow(batch, cameras[3]);
  assert.equal(writes - afterInitialSync, 1, 'only the changed owner writes its instance matrix');
  const afterChange = writes;
  cameras.forEach(camera => shadow(batch, camera));
  assert.equal(writes, afterChange, 'the other cascades reuse the updated pose');
  batch.dispose(); disposeFixture(f);
}

// Nested articulated rotations, manual matrices, and a transformed root remain
// expressed in the batch frame, not a cached bind pose or decomposed approximation.
{
  const f = fixture();
  const joint = new THREE.Group();
  f.owners[1].add(joint);
  joint.add(f.sources[1]);
  f.root.position.set(7, 2, -3);
  f.root.rotation.set(0.1, 0.4, -0.15);
  f.root.scale.set(1.25, 1.25, 1.25);
  joint.rotation.y = 0.7;
  f.sources[2].matrixAutoUpdate = false;
  f.sources[2].matrix.makeTranslation(0, 0.3, -0.2);
  f.scene.updateMatrixWorld(true);
  const batch = installArticulatedShadowBatch(f.root, f.sources);
  const instance = new THREE.Matrix4(), renderedWorld = new THREE.Matrix4();
  function assertWorldPoses() {
    shadow(batch, cameraAt(0, 100));
    f.sources.forEach((source, index) => {
      batch.getMatrixAt(index, instance);
      renderedWorld.multiplyMatrices(batch.matrixWorld, instance);
      sameMatrix(renderedWorld, source.matrixWorld, `proxy ${index}: exact current world pose`);
    });
  }
  assertWorldPoses();
  joint.rotation.x = -0.45;
  joint.position.z = -0.4;
  f.sources[2].matrix.makeRotationZ(0.2).setPosition(0, 0.6, -0.8);
  f.scene.updateMatrixWorld(true);
  assertWorldPoses();
  batch.dispose(); disposeFixture(f);
}

// Live ancestry visibility and removal are mirrored without changing sources.
{
  const f = fixture();
  const batch = installArticulatedShadowBatch(f.root, f.sources);
  const broad = cameraAt(0, 30);
  f.owners[1].visible = false;
  shadow(batch, broad);
  assert.equal(batch.getVisibleAt(1), false);
  assert.equal(f.sources[1].visible, true, 'do not overwrite source-local visibility');
  assert.equal(batch._multiDrawCount, 2);
  f.owners[1].visible = true;
  shadow(batch, broad);
  assert.equal(batch.getVisibleAt(1), true);
  f.root.visible = false;
  shadow(batch, broad);
  assert.equal(batch._multiDrawCount, 0, 'hidden root excludes every source');
  f.root.visible = true;
  f.sources[2].removeFromParent();
  shadow(batch, broad);
  assert.equal(batch.getVisibleAt(2), false, 'detached source cannot cast through its old batch');
  f.owners[2].add(f.sources[2]);
  shadow(batch, broad);
  assert.equal(batch.getVisibleAt(2), true, 'reattached original source resumes casting');
  f.root.removeFromParent();
  assert.equal(batch.parent, f.root, 'phase detachment retains the reusable batch');
  f.scene.add(f.root);
  f.scene.updateMatrixWorld(true);
  shadow(batch, broad);
  assert.equal(batch._multiDrawCount, 3, 'phase remount preserves every caster');
  batch.dispose(); disposeFixture(f);
}

// Admission rejects an entire incompatible set before mutating any source.
const rejectionCases = [
  ['duplicate source', f => { f.sources[1] = f.sources[0]; }],
  ['outside root', f => { f.sources[1].removeFromParent(); }],
  ['not casting', f => { f.sources[1].castShadow = false; }],
  ['non-frustum-culled source', f => { f.sources[1].frustumCulled = false; }],
  ['not authored', f => { delete f.sources[1].userData.authoredShadowProxy; }],
  ['presentation layer', f => { f.sources[1].layers.enable(0); }],
  ['different material', f => { f.sources[1].material = f.material.clone(); }],
  ['material array', f => { f.sources[1].material = [f.material]; }],
  ['different depth material', f => { f.sources[1].customDepthMaterial = f.depthMaterial.clone(); }],
  ['geometry groups', f => { f.sources[1].geometry.addGroup(0, 3, 0); }],
  ['partial draw range', f => { f.sources[1].geometry.setDrawRange(0, 2); }],
  ['offset draw range', f => { f.sources[1].geometry.setDrawRange(1, 2); }],
  ['attribute mismatch', f => { f.sources[1].geometry.deleteAttribute('normal'); }],
  ['indexed mismatch', f => { f.sources[1].geometry.setIndex([0, 1, 2]); }],
  ['morph targets', f => { f.sources[1].geometry.morphAttributes.position = [f.sources[1].geometry.attributes.position.clone()]; }],
  ...['onBeforeShadow', 'onAfterShadow'].map(name =>
    [`custom ${name}`, f => { f.sources[1][name] = () => {}; }]),
  ['instanced source', f => { f.sources[1].isInstancedMesh = true; }],
  ['batched source', f => { f.sources[1].isBatchedMesh = true; }],
  ['skinned source', f => { f.sources[1].isSkinnedMesh = true; }],
];
for (const [label, mutate] of rejectionCases) {
  const f = fixture();
  const originalSources = [...f.sources];
  mutate(f);
  const before = f.sources.map(snapshot), children = [...f.root.children];
  assert.equal(installArticulatedShadowBatch(f.root, Object.freeze([...f.sources])), null, label);
  assert.deepEqual(f.root.children, children, `${label}: no partial batch attached`);
  before.forEach(receipt => unchanged(receipt));
  // Test-created replacements are ours; admission must not dispose them.
  for (const source of new Set(f.sources)) {
    if (source.material !== f.material && !Array.isArray(source.material)) source.material.dispose();
    if (source.customDepthMaterial !== f.depthMaterial) source.customDepthMaterial?.dispose();
  }
  f.sources = originalSources;
  disposeFixture(f);
}
for (const count of [0, 1]) {
  const f = fixture(count);
  assert.equal(installArticulatedShadowBatch(f.root, f.sources), null, 'no batch for fewer than two proxies');
  assert.equal(f.root.children.length, count);
  disposeFixture(f);
}

// A mid-construction native failure is atomic and releases partial batch data.
{
  const f = fixture();
  const before = f.sources.map(snapshot), children = [...f.root.children];
  const nativeAdd = THREE.BatchedMesh.prototype.addGeometry;
  let additions = 0, sourceReleases = 0;
  const released = new Map();
  f.sources.forEach(source => source.geometry.addEventListener('dispose', () => sourceReleases++));
  f.material.addEventListener('dispose', () => sourceReleases++);
  f.depthMaterial.addEventListener('dispose', () => sourceReleases++);
  THREE.BatchedMesh.prototype.addGeometry = function (...args) {
    additions++;
    if (additions === 1) {
      for (const resource of [this.geometry, this._matricesTexture, this._indirectTexture]) {
        released.set(resource, 0);
        resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
      }
    }
    if (additions === 2) throw new Error('intentional second addGeometry failure');
    return nativeAdd.apply(this, args);
  };
  try {
    assert.throws(() => installArticulatedShadowBatch(f.root, f.sources),
      /intentional second addGeometry failure/, 'native construction failures propagate after rollback');
  } finally {
    THREE.BatchedMesh.prototype.addGeometry = nativeAdd;
  }
  assert.equal(additions, 2, 'the failure happens after one real geometry copy');
  assert.equal(released.size, 3, 'real partial batch resources were observed');
  for (const count of released.values()) assert.equal(count, 1, 'partial batch resource released exactly once');
  assert.equal(sourceReleases, 0, 'failure cannot release borrowed inputs');
  assert.deepEqual(f.root.children, children);
  before.forEach(receipt => unchanged(receipt));
  disposeFixture(f);
}

// Disposal is identity-safe, idempotent, and releases only batch-owned resources.
// Factory disposal traverses the root: changing its children in dispose() would
// skip the following child (or index past the shortened array) and leak it.
{
  const f = fixture();
  const batch = installArticulatedShadowBatch(f.root, f.sources);
  const owned = [batch.geometry, batch._matricesTexture, batch._indirectTexture];
  if (batch._colorsTexture) owned.push(batch._colorsTexture);
  const released = new Map(owned.map(resource => [resource, 0]));
  owned.forEach(resource => resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1)));
  let borrowedReleased = 0;
  [...f.sources.map(source => source.geometry), f.material, f.depthMaterial].forEach(resource =>
    resource.addEventListener('dispose', () => borrowedReleased++));
  const unrelated = new THREE.Mesh(triangle(), f.material);
  unrelated.castShadow = false;
  f.root.add(unrelated);
  const visited = [];
  assert.doesNotThrow(() => f.root.traverse(object => {
    visited.push(object);
    if (object === batch) batch.dispose();
  }), 'batch disposal is safe inside the native root.traverse');
  assert.ok(visited.includes(unrelated), 'the mesh following the batch is still visited');
  assert.equal(batch.parent, f.root, 'dispose cannot detach during owner traversal');
  assert.equal(batch.visible, false);
  assert.equal(batch.castShadow, false);
  assert.equal(borrowedReleased, 0, 'source geometry/material/depth identities stay alive');
  assert.ok(f.sources.every(source => source.castShadow), 'owned originals resume native casting');
  assert.equal(unrelated.castShadow, false, 'disposal never sweeps unrelated meshes');
  assert.equal(unrelated.parent, f.root);
  for (const count of released.values()) assert.equal(count, 1);
  f.sources[0].castShadow = false;
  assert.doesNotThrow(() => batch.dispose());
  assert.equal(f.sources[0].castShadow, false, 'repeat dispose cannot reclaim released casting ownership');
  for (const count of released.values()) assert.equal(count, 1, 'owned resource disposed exactly once');
  assert.equal(borrowedReleased, 0);
  unrelated.geometry.dispose();
  disposeFixture(f);
}

// Relative reflections cannot enter the batch at construction, while a shared
// root reflection is the original common world winding and remains supported.
for (const reflected of ['source', 'owner']) {
  const f = fixture();
  (reflected === 'source' ? f.sources[1] : f.owners[1]).scale.x = -1;
  f.scene.updateMatrixWorld(true);
  const before = f.sources.map(snapshot), children = [...f.root.children];
  assert.equal(installArticulatedShadowBatch(f.root, f.sources), null,
    `${reflected}: reject an initial relative reflection atomically`);
  assert.deepEqual(f.root.children, children);
  before.forEach(receipt => unchanged(receipt));
  disposeFixture(f);
}
{
  const f = fixture();
  f.root.scale.x = -1;
  f.scene.updateMatrixWorld(true);
  const batch = installArticulatedShadowBatch(f.root, f.sources);
  assert.ok(batch instanceof THREE.BatchedMesh, 'shared world reflection permits positive batch-local poses');
  // Match WebGLRenderer's matrix propagation after appending the new batch.
  f.scene.updateMatrixWorld(true);
  let directDraws = 0;
  const renderer = { renderBufferDirect() { directDraws++; } };
  shadow(batch, cameraAt(0, 10), undefined, renderer);
  assert.equal(directDraws, 0, 'a root reflection never needs per-source fallback');
  assert.equal(batch._multiDrawCount, 3);
  const instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  f.sources.forEach((source, index) => {
    batch.getMatrixAt(index, instance);
    assert.ok(instance.determinant() > 0, 'instance winding remains supported');
    world.multiplyMatrices(batch.matrixWorld, instance);
    sameMatrix(world, source.matrixWorld, 'root-reflected batch keeps exact world winding');
  });
  batch.dispose(); disposeFixture(f);
}

// A later relative reflection uses the native original-mesh draw only for the
// affected source. The normal batch still prepares every current cascade list.
{
  const f = fixture();
  const batch = installArticulatedShadowBatch(f.root, f.sources);
  f.scene.updateMatrixWorld(true);
  const broad = cameraAt(0, 10), presentation = cameraAt(100);
  shadow(batch, broad);
  const mirror = f.sources[1];
  const packedRange = batch.getGeometryRangeAt(batch.getGeometryIdAt(1));
  const expectedGroup = { start: packedRange.start, count: packedRange.count, materialIndex: 0 };
  const before = f.sources.map(snapshot);
  let matrixWrites = 0;
  const setMatrixAt = batch.setMatrixAt;
  batch.setMatrixAt = function (...args) { matrixWrites++; return setMatrixAt.apply(this, args); };
  const suppliedDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const directCalls = [];
  const renderer = {
    renderBufferDirect(...args) { directCalls.push({ receiver: this, args }); },
    render() { assert.fail('fallback must not recursively render the scene'); },
  };
  mirror.scale.x = -1;
  f.scene.updateMatrixWorld(true);
  const cameras = [cameraAt(0, 10), cameraAt(1, 10), cameraAt(-1, 10), cameraAt(2, 10)];
  const expectedModelView = new THREE.Matrix4();
  cameras.forEach((camera, index) => {
    shadow(batch, camera, presentation, renderer, suppliedDepth);
    assert.equal(directCalls.length, index + 1, 'one reflected-source native draw per eligible cascade');
    const call = directCalls[index];
    assert.equal(call.receiver, renderer, 'renderBufferDirect retains its renderer receiver');
    assert.deepEqual(call.args, [camera, null, batch.geometry, suppliedDepth, mirror, expectedGroup],
      'fallback uses the uploaded exact packed range, current depth material and original object winding');
    if (index > 0) assert.equal(call.args[5], directCalls[0].args[5],
      'all cascades reuse the cold-precomputed geometry group');
    expectedModelView.multiplyMatrices(camera.matrixWorldInverse, mirror.matrixWorld);
    sameMatrix(mirror.modelViewMatrix, expectedModelView, 'native fallback current cascade model-view');
    assert.equal(batch.getVisibleAt(1), false, 'reflected source is absent from the normal batch');
    assert.equal(batch._multiDrawCount, 2, 'the other original casters remain batched');
    before.forEach(receipt => unchanged(receipt, false));
  });
  assert.equal(matrixWrites, 0, 'never upload an unsupported reflected instance matrix');

  // No mirrored-source draw outside the actual shadow-camera frustum.
  shadow(batch, cameraAt(20), presentation, renderer, suppliedDepth);
  assert.equal(directCalls.length, 4, 'presentation camera does not decide shadow visibility');
  assert.equal(batch._multiDrawCount, 0);
  f.owners[1].visible = false;
  shadow(batch, broad, presentation, renderer, suppliedDepth);
  assert.equal(directCalls.length, 4, 'hidden ancestry blocks mirrored fallback');
  f.owners[1].visible = true;
  mirror.visible = false;
  shadow(batch, broad, presentation, renderer, suppliedDepth);
  assert.equal(directCalls.length, 4, 'source-local visibility blocks mirrored fallback');
  mirror.visible = true;

  const nativeError = new Error('intentional native fallback failure');
  const throwingRenderer = { renderBufferDirect() { throw nativeError; } };
  assert.throws(() => shadow(batch, broad, presentation, throwingRenderer, suppliedDepth),
    error => error === nativeError, 'native fallback errors propagate without a retry render');
  assert.ok(f.sources.every(source => source.castShadow === false), 'fallback errors cannot change caster ownership');
  assert.ok(f.sources.every(source => source.visible), 'fallback errors cannot change source visibility');

  // Returning to the original positive pose restores the cached batch entry
  // without a matrix upload, and stops direct draws on all four cascades.
  mirror.scale.x = 1;
  f.scene.updateMatrixWorld(true);
  cameras.forEach(camera => {
    shadow(batch, camera, presentation, renderer, suppliedDepth);
    assert.equal(batch.getVisibleAt(1), true);
    assert.equal(batch._multiDrawCount, 3);
  });
  assert.equal(directCalls.length, 4);
  assert.equal(matrixWrites, 0, 'positive flip-back reuses its unchanged cached pose');
  mirror.position.y = 0.125;
  f.scene.updateMatrixWorld(true);
  shadow(batch, broad, presentation, renderer, suppliedDepth);
  assert.equal(matrixWrites, 1, 'new positive articulation updates exactly the affected entry');
  shadow(batch, broad, presentation, renderer, suppliedDepth);
  assert.equal(matrixWrites, 1, 'unchanged post-fallback pose stays cached');
  before.forEach(receipt => unchanged(receipt, false));
  batch.dispose(); suppliedDepth.dispose(); disposeFixture(f);
}

console.log('articulatedShadowBatch.selftest: authored data, articulated poses, four-cascade culling, mirrored native fallback, atomic admission and disposal passed');
