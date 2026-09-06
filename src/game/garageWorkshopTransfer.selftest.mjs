import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarageWorkshopTransfer } from './garageWorkshopTransfer.ts';

const priorWindow = globalThis.window;
const priorWorker = globalThis.Worker;
const matrix = new Float32Array(32);
new THREE.Matrix4().makeTranslation(1, 2, 3).toArray(matrix, 0);
new THREE.Matrix4().makeTranslation(4, 5, 6).toArray(matrix, 16);
const color = new Uint8Array([255, 0, 0, 0, 255, 0]);
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const attribute = (array, itemSize, normalized = false) => ({ array, itemSize, normalized });
const node = (overrides = {}) => ({
  kind: 'group', name: 'fixture', parentIndex: -1,
  position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1],
  visible: true, matrixAutoUpdate: true, renderOrder: 0, userData: {},
  geometry: null, materials: [], count: 0, instanceMatrix: null, instanceColor: null,
  lodDistance: null, lodHysteresis: null, ...overrides,
});

class FixtureWorker {
  postMessage({ requestId, specId }) {
    const reply = (kind, payload) => this.onmessage({ data: { ok: true, requestId, kind, ...payload } });
    queueMicrotask(() => {
      reply('begin', {
        specId, buildMs: 1, geometryCount: 1, nodeCount: 3,
        payload: { attributeBytes: 170, omittedAttributeBytes: 0, omittedAttributeCount: 0 },
        materials: [{ name: 'wheel', role: 'wheelPaint', color: 0xffffff,
          opacity: 1, transparent: false, side: THREE.FrontSide, depthWrite: true }],
      });
      reply('geometries', { geometries: [{
        attributes: { position: attribute(positions, 3) }, index: null, groups: [],
        drawRange: { start: 0, count: 3 }, boundingBox: [0, 0, 0, 1, 1, 0],
        boundingSphere: [0.5, 0.5, 0, 1],
      }] });
      reply('nodes', { nodes: [node(), node({
        kind: 'instanced', name: 'gearRoadWheelDiscs', parentIndex: 0,
        geometry: 0, materials: [0], count: 2,
        instanceMatrix: attribute(matrix, 16), instanceColor: attribute(color, 3, true),
      }), node({ kind: 'mesh', name: 'ordinary', parentIndex: 0, geometry: 0, materials: [0] })] });
      reply('complete', {});
    });
  }
  terminate() {}
}

globalThis.window = { setTimeout };
globalThis.Worker = FixtureWorker;
const transfer = createGarageWorkshopTransfer({});
try {
  const visual = await transfer.createVisual('m1a2', 1);
  const mesh = visual.root.getObjectByName('gearRoadWheelDiscs');
  assert.ok(mesh instanceof THREE.InstancedMesh);
  for (const [name, expectedArray] of [['instanceMatrix', matrix], ['instanceColor', color]]) {
    const restored = mesh[name];
    assert.ok(restored instanceof THREE.InstancedBufferAttribute,
      `${name} must retain its runtime instanced type, not only a TypeScript cast`);
    assert.equal(restored.isInstancedBufferAttribute, true);
    assert.equal(restored.meshPerAttribute, 1, `${name} advances once per instance, not once per vertex`);
    assert.equal(restored.count, mesh.count);
    assert.equal(restored.array, expectedArray, 'transfer reuses the exact received typed array');
  }
  assert.equal(mesh.instanceColor.normalized, true, 'wire normalization survives instanced reconstruction');
  const restoredMatrix = new THREE.Matrix4();
  mesh.getMatrixAt(1, restoredMatrix);
  assert.deepEqual(restoredMatrix.elements, new THREE.Matrix4().makeTranslation(4, 5, 6).elements);
  const position = visual.root.getObjectByName('ordinary').geometry.getAttribute('position');
  assert.equal(position.isInstancedBufferAttribute, undefined, 'ordinary vertex inputs remain per vertex');
  assert.equal(position.array, positions);
  const clone = mesh.clone();
  assert.equal(clone.instanceMatrix.isInstancedBufferAttribute, true, 'retained/cloned gear keeps instancing');
  clone.dispose();
  visual.dispose();
} finally {
  transfer.dispose();
  if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
  if (priorWorker === undefined) delete globalThis.Worker; else globalThis.Worker = priorWorker;
}

console.log('garageWorkshopTransfer.selftest: streamed worker matrices/colors retain instancing, normalization, data, and vertex-input separation');
