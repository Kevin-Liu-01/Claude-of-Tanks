import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLBindingStates } from 'three/src/renderers/webgl/WebGLBindingStates.js';
import { createGarageWorkshopTransfer } from './garageWorkshopTransfer.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';

const attribute = (array, itemSize, normalized = false) => ({ array, itemSize, normalized });

function instanceMatrices(count) {
  const array = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) new THREE.Matrix4().makeTranslation(i, i / 2, -i).toArray(array, i * 16);
  return attribute(array, 16);
}

function wireGeometry(vertexCount, indexed = false) {
  return {
    attributes: {
      position: attribute(new Float32Array(vertexCount * 3).fill(0.25), 3),
      normal: attribute(new Float32Array(vertexCount * 3).fill(0.5), 3),
    },
    index: indexed ? attribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1) : null,
    groups: [], drawRange: { start: 0, count: Infinity },
    boundingBox: [-1, -1, -1, 1, 1, 1], boundingSphere: [0, 0, 0, 2],
  };
}

function wireNode(kind, name, overrides = {}) {
  return {
    kind, name, position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [1, 1, 1],
    visible: true, matrixAutoUpdate: false, renderOrder: 0, userData: {},
    geometry: null, materials: [], count: 0, instanceMatrix: null, instanceColor: null,
    parentIndex: -1, lodDistance: null, lodHysteresis: null, ...overrides,
  };
}

function fixture() {
  const first = wireNode('instanced', 'transferred-running-gear', {
    parentIndex: 0, geometry: 0, materials: [0], count: 14,
    instanceMatrix: instanceMatrices(14),
    instanceColor: attribute(Float32Array.from({ length: 42 }, (_, i) => i / 42), 3, true),
  });
  const second = wireNode('instanced', 'transferred-indexed-gear', {
    parentIndex: 0, geometry: 1, materials: [0], count: 2,
    instanceMatrix: instanceMatrices(2),
  });
  return {
    geometries: [wireGeometry(888), wireGeometry(4, true)],
    nodes: [wireNode('group', 'worker-exhibit'), first, second,
      wireNode('mesh', 'unclassified-part', { parentIndex: 0, geometry: 0, materials: [1] })],
    materials: [
      { name: 'factory-paint', role: 'armorPaint', color: 0x445544, roughness: 0.8,
        metalness: 0.1, opacity: 1, transparent: false, side: THREE.FrontSide, depthWrite: true },
      { name: 'unknown-finish', role: '', color: 0x778899, roughness: 0.7,
        metalness: 0.2, opacity: 1, transparent: false, side: THREE.DoubleSide, depthWrite: true },
    ],
    payload: { attributeBytes: 22_612, omittedAttributeBytes: 0, omittedAttributeCount: 0 },
  };
}

// The production public transfer receives the same begin/geometries/nodes/
// complete message shape as the real module worker. No private code extraction
// or replacement of Three's attribute/binding implementation is involved.
const workers = [];
class FixtureWorker {
  constructor(url, options) {
    assert.ok(url.pathname.endsWith('/garageWorkshopGeometryWorker.ts'));
    assert.deepEqual(options, { type: 'module', name: 'cot-garage-workshop-geometry' });
    this.requests = [];
    this.fixtures = [];
    this.terminations = 0;
    workers.push(this);
  }
  postMessage(request) {
    this.requests.push(request);
    const wire = fixture();
    this.fixtures.push(wire);
    queueMicrotask(() => {
      const emit = (data) => this.onmessage({ data: { ok: true, requestId: request.requestId, ...data } });
      emit({ kind: 'begin', specId: request.specId, buildMs: 12, materials: wire.materials,
        geometryCount: wire.geometries.length, nodeCount: wire.nodes.length, payload: wire.payload });
      // Distinct chunks exercise accumulation as well as final completeness.
      for (const geometry of wire.geometries) emit({ kind: 'geometries', geometries: [geometry] });
      for (const node of wire.nodes) emit({ kind: 'nodes', nodes: [node] });
      emit({ kind: 'complete' });
    });
  }
  terminate() { this.terminations++; }
}

function inspectNativeBindings(mesh) {
  const bindings = new Map();
  const divisors = new Map();
  let arrayBuffer;
  const gl = {
    MAX_VERTEX_ATTRIBS: 0x8869, ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893,
    FLOAT: 0x1406, INT: 0x1404, UNSIGNED_INT: 0x1405,
    getParameter: () => 16,
    createVertexArray: () => ({}), bindVertexArray() {}, deleteVertexArray() {},
    enableVertexAttribArray() {}, disableVertexAttribArray() {},
    vertexAttribDivisor: (location, divisor) => divisors.set(location, divisor),
    bindBuffer(target, buffer) { if (target === this.ARRAY_BUFFER) arrayBuffer = buffer; },
    vertexAttribPointer(location, size, type, normalized, stride, offset) {
      bindings.set(location, { size, type, normalized, stride, offset, array: arrayBuffer });
    },
  };
  const attributes = {
    get: attr => ({ buffer: attr.array, type: gl.FLOAT, bytesPerElement: attr.array.BYTES_PER_ELEMENT }),
    update() {},
  };
  const programAttributes = {
    position: { location: 0, locationSize: 1 }, normal: { location: 1, locationSize: 1 },
    instanceMatrix: { location: 2, locationSize: 4 },
  };
  if (mesh.instanceColor) programAttributes.instanceColor = { location: 6, locationSize: 1 };
  const state = WebGLBindingStates(gl, attributes);
  try {
    state.setup(mesh, mesh.material, { id: 1, getAttributes: () => programAttributes },
      mesh.geometry, mesh.geometry.index);
  } finally { state.dispose(); }
  return { bindings, divisor: location => divisors.get(location) ?? 0 };
}

function verifyTransferredAttributes(visual, wire) {
  const [first, second, ordinary] = visual.root.children;
  assert.equal(first.geometry, ordinary.geometry, 'shared wire geometry stays shared within its visual');
  assert.equal(first.material, second.material, 'native palette identity remains shared');
  for (const [mesh, node] of [[first, wire.nodes[1]], [second, wire.nodes[2]]]) {
    assert.ok(mesh instanceof THREE.InstancedMesh);
    assert.equal(mesh.count, node.count);
    assert.ok(mesh.instanceMatrix instanceof THREE.InstancedBufferAttribute);
    assert.equal(mesh.instanceMatrix.isInstancedBufferAttribute, true);
    assert.equal(mesh.instanceMatrix.meshPerAttribute, 1);
    assert.equal(mesh.instanceMatrix.count, node.count);
    assert.equal(mesh.instanceMatrix.itemSize, 16);
    assert.equal(mesh.instanceMatrix.normalized, false);
    assert.equal(mesh.instanceMatrix.array, node.instanceMatrix.array, 'transfer adds no matrix copy');
    assert.deepEqual(mesh.instanceMatrix.array, instanceMatrices(node.count).array,
      'every authored instance transform survives reconstruction');
    assert.deepEqual(mesh.position.toArray(), node.position);
    for (const [name, source] of Object.entries(wire.geometries[node.geometry].attributes)) {
      const attr = mesh.geometry.getAttribute(name);
      assert.equal(attr.array, source.array, `${name} retains transferred array ownership`);
      assert.equal(attr.isInstancedBufferAttribute, undefined, `${name} remains per-vertex`);
      assert.equal(attr.itemSize, source.itemSize);
      assert.equal(attr.normalized, source.normalized);
    }
    const native = inspectNativeBindings(mesh);
    assert.equal(native.divisor(0), 0);
    assert.equal(native.divisor(1), 0);
    for (let column = 0; column < 4; column++) {
      const location = column + 2;
      assert.equal(native.divisor(location), 1, 'installed Three advances every matrix column per instance');
      const binding = native.bindings.get(location);
      assert.equal(binding.array, node.instanceMatrix.array);
      assert.equal(binding.stride, 64);
      assert.equal(binding.offset, column * 16);
      const lastRequiredByte = binding.offset + (mesh.count - 1) * binding.stride + binding.size * 4;
      assert.ok(lastRequiredByte <= binding.array.byteLength, 'last instance fits the exact transferred storage');
    }
  }
  assert.equal(first.instanceColor.array, wire.nodes[1].instanceColor.array, 'transfer adds no color copy');
  assert.equal(first.instanceColor.itemSize, 3);
  assert.equal(first.instanceColor.count, first.count);
  assert.equal(first.instanceColor.normalized, true);
  assert.deepEqual(first.instanceColor.array, Float32Array.from({ length: 42 }, (_, i) => i / 42));
  assert.equal(first.instanceColor.meshPerAttribute, 1);
  assert.equal(inspectNativeBindings(first).divisor(6), 1, 'installed Three advances color per instance');
  assert.equal(second.instanceColor, null, 'an absent color must not allocate an attribute');
  assert.equal(second.geometry.index.array, wire.geometries[1].index.array);
  assert.equal(first.geometry.getAttribute('position').count, 888);
  assert.equal(first.instanceMatrix.array.byteLength, 14 * 64);
  assert.equal(visual.root.userData.workshopTransferPayload, wire.payload);
  const geometryBytes = wire.geometries.reduce((sum, geometry) => sum
    + Object.values(geometry.attributes).reduce((bytes, attr) => bytes + attr.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0), 0);
  const instanceBytes = wire.nodes.reduce((sum, node) => sum
    + (node.instanceMatrix?.array.byteLength ?? 0) + (node.instanceColor?.array.byteLength ?? 0), 0);
  assert.equal(geometryBytes + instanceBytes, wire.payload.attributeBytes,
    'fixture uses the actual native worker backing-byte accounting');

  // Reproduce the previous reconstruction error against real Three binding
  // code. A TypeScript cast cannot supply this missing runtime divisor.
  const broken = new THREE.InstancedMesh(first.geometry, first.material, first.count);
  broken.instanceMatrix = new THREE.BufferAttribute(first.instanceMatrix.array, 16);
  const negative = inspectNativeBindings(broken);
  assert.equal(negative.divisor(2), 0);
  const binding = negative.bindings.get(2);
  const requiredAsVertices = (888 - 1) * binding.stride + binding.size * 4;
  assert.ok(requiredAsVertices > binding.array.byteLength,
    'old divisor 0 consumes beyond the 14-matrix buffer for the observed 888-vertex draw');
}

function disposalCounts(visual) {
  const geometry = new Map(), material = new Map();
  for (const mesh of visual.root.children) {
    for (const [resource, map] of [[mesh.geometry, geometry], [mesh.material, material]]) {
      if (map.has(resource)) continue;
      map.set(resource, 0);
      resource.addEventListener('dispose', () => map.set(resource, map.get(resource) + 1));
    }
  }
  return { geometry, material };
}

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let transfer;
const visuals = [];
try {
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FixtureWorker });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout } });
  transfer = createGarageWorkshopTransfer({});
  // Construct successively: the second visual must reuse the completed first
  // visual's worker and palette lease, not merely join a concurrent request.
  visuals.push(await transfer.createVisual('m1a2', 4200));
  visuals.push(await transfer.createVisual('m1a2', 4201));
  assert.equal(workers.length, 1, 'one native module worker is reused');
  assert.deepEqual(workers[0].requests.map(({ requestId, specId, camoSeed, spec }) =>
    [requestId, specId, camoSeed, spec === TANK_SPECS.m1a2]),
  [[1, 'm1a2', 4200, true], [2, 'm1a2', 4201, true]]);
  visuals.forEach((visual, index) => verifyTransferredAttributes(visual, workers[0].fixtures[index]));
  const [first, second] = visuals;
  const sharedMaterial = first.root.children[0].material;
  assert.equal(sharedMaterial, second.root.children[0].material, 'matching finishes retain one palette lease');
  assert.notEqual(first.root.children[0].geometry, second.root.children[0].geometry,
    'separate transfers retain independent geometry ownership');
  const firstDisposal = disposalCounts(first), secondDisposal = disposalCounts(second);
  const parent = new THREE.Group();
  parent.add(first.root, second.root);
  first.dispose(); first.dispose();
  assert.equal(first.root.parent, null);
  assert.ok([...firstDisposal.geometry.values()].every(count => count === 1),
    'every transferred geometry is disposed once even when multiple meshes share it');
  assert.equal(firstDisposal.material.get(sharedMaterial), 0, 'live second visual protects shared palette');
  assert.equal(firstDisposal.material.get(first.root.children[2].material), 1,
    'per-visual fallback material is disposed exactly once');
  assert.ok([...secondDisposal.geometry.values()].every(count => count === 0));
  second.dispose(); second.dispose();
  assert.ok([...secondDisposal.geometry.values()].every(count => count === 1));
  assert.equal(firstDisposal.material.get(sharedMaterial), 1);
  assert.equal(secondDisposal.material.get(sharedMaterial), 1, 'last lease disposes shared material once');
  transfer.dispose(); transfer = null;
  assert.equal(workers[0].terminations, 1);
  assert.equal(firstDisposal.material.get(sharedMaterial), 1, 'worker teardown does not redispose released palette');
} finally {
  for (const visual of visuals) visual.dispose();
  transfer?.dispose();
  if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
  else delete globalThis.Worker;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
}

console.log('garageWorkshopTransfer.selftest: public worker roundtrip, exact arrays/counts, native Three divisors and shared disposal pass');
