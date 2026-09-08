import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import * as THREE from "three";

export function assertWholeReuseContract(createInvocationEraWholeReuse) {
const frame = () => ({ authoredU: new THREE.Vector3(1, 0, 0), authoredNormal: new THREE.Vector3(0, 1, 0) });
const a = new THREE.BoxGeometry(1, 2, 3), b = new THREE.BoxGeometry(2, 3, 4);
const parts = [a, b], basis = frame(), memo = createInvocationEraWholeReuse();
let calculations = 0, disposals = 0;
for (const part of parts) part.addEventListener('dispose', () => disposals++);
const calculate = () => {
  calculations++;
  return parts.map(part => Array.from({ length: part.getAttribute('position').count }, (_, i) => {
    const p = part.getAttribute('position');
    return [p.getX(i), p.getY(i), p.getZ(i)];
  }));
};
const result = memo.fit(parts, 1, basis, calculate), saved = structuredClone(result);
assert.equal(calculations, 1);
result[0][0][0] = 987;
result[1].pop();
assert.deepEqual(memo.fit(parts, 1, frame(), calculate), saved, 'equivalent full frames reuse private nested copies');
assert.equal(calculations, 1);
const borrowed = memo.fit(parts, 1, basis, calculate);
borrowed.push([[44, 55, 66]]);
borrowed[0][0].splice(0);
assert.deepEqual(memo.fit(parts, 1, basis, calculate), saved, 'later callers cannot poison owned cached results');

// Direct unversioned writes, identity/order changes, normalized and interleaved
// access all use the same logical getX/Y/Z contract as Vector3.fromBufferAttribute.
const position = a.getAttribute('position');
position.array[0] += 0.125;
assert.deepEqual(memo.fit(parts, 1, basis, calculate), calculate());
assert.equal(memo.stats().misses, 2, 'needsUpdate is not a correctness dependency');
parts.reverse(); memo.fit(parts, 1, basis, calculate);
assert.equal(memo.stats().misses, 3, 'ordered geometry identities are not collapsed');
parts[0] = a; memo.fit(parts, 1, basis, calculate);
assert.equal(memo.stats().misses, 4, 'same coordinates do not collapse part identities');
parts.pop(); memo.fit(parts, 1, basis, calculate);
assert.equal(memo.stats().misses, 5, 'part count is guarded');
a.setAttribute('position', position.clone()); memo.fit(parts, 1, basis, calculate);
assert.equal(memo.stats().misses, 6, 'replaced attributes are conservatively recomputed');
const interleaved = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(
  new Float32Array([7, 1, 2, 3, 8, 4, 5, 6]), 4), 3, 1);
a.setAttribute('position', interleaved); memo.fit(parts, 1, basis, calculate);
interleaved.data.array[2] += 1e-4;
assert.deepEqual(memo.fit(parts, 1, basis, calculate), calculate());
const normalized = new THREE.BufferAttribute(new Int16Array([100, 200, 300]), 3, true);
a.setAttribute('position', normalized); memo.fit(parts, 1, basis, calculate);
normalized.normalized = false;
assert.deepEqual(memo.fit(parts, 1, basis, calculate), calculate());
a.deleteAttribute('position');
let emptyCalls = 0;
const empty = () => { emptyCalls++; return []; };
assert.deepEqual(memo.fit(parts, 1, basis, empty), []);
assert.deepEqual(memo.fit(parts, 1, basis, empty), []);
assert.equal(emptyCalls, 1);
a.setAttribute('position', new THREE.BufferAttribute(new Float64Array([0, 0, 0]), 3));
memo.fit(parts, 1, basis, calculate);
a.attributes.position.array[0] = -0;
const beforeZero = memo.stats().misses; memo.fit(parts, 1, basis, calculate);
assert.equal(memo.stats().misses, beforeZero + 1, 'coordinate signed zero is preserved');
for (const side of [0, -0, -1]) memo.fit(parts, side, basis, calculate);
const beforeFrame = memo.stats().misses;
for (const vector of ['authoredU', 'authoredNormal']) {
  for (const axis of ['x', 'y', 'z']) {
    const changed = frame(); changed[vector][axis] += 1e-8;
    memo.fit(parts, 1, changed, calculate);
  }
}
assert.equal(memo.stats().misses, beforeFrame + 6, 'all six frame values remain in the key');
basis.authoredU.y = -0; memo.fit(parts, 1, basis, calculate);
assert.equal(memo.stats().misses, beforeFrame + 7, 'borrowed frame mutation and signed zero are guarded');

// Authored/mixed inputs are always evaluated by the untouched native path.
a.userData.eraHitFaceVertexStarts = [];
const beforeBypass = calculations;
memo.fit(parts, 1, basis, calculate); memo.fit(parts, 1, basis, calculate);
assert.equal(calculations, beforeBypass + 2);
assert.equal(memo.stats().bypasses, 2);
delete a.userData.eraHitFaceVertexStarts;
const failureFrame = frame(); failureFrame.authoredU.x = 0.125;
assert.throws(() => memo.fit(parts, 1, failureFrame, () => { throw new Error('fit failed'); }), /fit failed/);
assert.deepEqual(memo.fit(parts, 1, failureFrame, calculate), calculate(), 'failed results never enter the memo');
a.dispose();
assert.deepEqual(memo.fit(parts, 1, basis, calculate), calculate(), 'borrowed disposal does not transfer geometry ownership');
memo.close(); memo.close();
assert.equal(disposals, 1, 'close must not dispose any borrowed resource or shared template');
assert.deepEqual(memo.stats(), { hits: memo.stats().hits, misses: memo.stats().misses, bypasses: 2,
  retainedPartLists: 0, retainedFrames: 0, closed: true });
assert.throws(() => memo.fit(parts, 1, basis, calculate), /closed/);
const next = createInvocationEraWholeReuse();
next.fit(parts, 1, basis, calculate);
assert.equal(next.stats().misses, 1, 'each construction begins without a previous tank cache');
next.close(); b.dispose();
}

function attributeDigest(attribute) {
  if (!attribute) return null;
  const array = attribute.array ?? attribute.data.array;
  return { type: attribute.constructor.name, arrayType: array.constructor.name,
    itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized,
    usage: attribute.usage, gpuType: attribute.gpuType, offset: attribute.offset,
    stride: attribute.data?.stride,
    sha: createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') };
}

export function digest(root) {
  const nodes = [], rows = [], materialIds = new Map(), materials = [], uuids = new Map();
  const semantic = value => {
    if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      if (!uuids.has(value)) uuids.set(value, uuids.size);
      return `uuid:${uuids.get(value)}`;
    }
    if (Array.isArray(value)) return value.map(semantic);
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, semantic(value[key])]));
    return value;
  };
  root.updateMatrixWorld(true); root.traverse(node => nodes.push(node));
  const nodeIds = new Map(nodes.map((node, index) => [node, index]));
  for (const node of nodes) {
    const ids = (node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []).map(material => {
      if (!materialIds.has(material)) {
        materialIds.set(material, materials.length); materials.push(semantic(material.toJSON()));
      }
      return materialIds.get(material);
    });
    const geometry = node.geometry;
    rows.push({ name: node.name, type: node.type, parent: nodeIds.get(node.parent) ?? null,
      matrix: node.matrix.elements, world: node.matrixWorld.elements,
      visible: node.visible, layers: node.layers.mask, renderOrder: node.renderOrder,
      castShadow: node.castShadow, receiveShadow: node.receiveShadow, frustumCulled: node.frustumCulled,
      // These authored fitting metadata fields contain no timing or runtime references.
      fittingMetadata: node.userData.fittingSlot ? semantic(node.userData) : null,
      materials: ids, count: node.count, instanceMatrix: attributeDigest(node.instanceMatrix),
      instanceColor: attributeDigest(node.instanceColor),
      levels: node.levels?.map(level => [level.distance, level.hysteresis, nodeIds.get(level.object)]),
      geometry: geometry ? { type: geometry.type, groups: geometry.groups, drawRange: geometry.drawRange,
        attributes: Object.fromEntries(Object.keys(geometry.attributes).sort().map(key => [key, attributeDigest(geometry.attributes[key])])),
        morph: Object.fromEntries(Object.keys(geometry.morphAttributes).sort().map(key => [key, geometry.morphAttributes[key].map(attributeDigest)])),
        morphTargetsRelative: geometry.morphTargetsRelative, index: attributeDigest(geometry.index) } : null });
  }
  return { nodes: nodes.length, meshes: nodes.filter(node => node.isMesh).length,
    materials: materials.length, sha: createHash('sha256').update(JSON.stringify({ rows, materials })).digest('hex') };
}
