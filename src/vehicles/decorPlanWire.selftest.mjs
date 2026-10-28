// decorPlanWire.selftest.mjs — stage 2b pass 1 (UI-LOCKDOWN E, 2026-10-25): a decoration planned over a replica of the
// tank across a realm boundary (structured clone, the arrays handed over both ways, as the decor worker posts them)
// attaches byte-identically to the decoration planned in-line, at HIGH and LOW; the tank graph wire rebuilds three.js
// values, node references and LOD levels; a planner that throws leaves the tank to the in-line pass. The fleet-wide proof
// (every tank, both tiers, stepped and interleaved, and the worker realm) runs beside the stage receipts:
// ~/cot-launch-state/streams/frontend-e/decor2b.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './tankFactory.ts';
import { createTankSteps } from './tankFactoryCore.ts';
import { decorPlanFrom, decorPlanRequest, decorPlanTransfer, planDecorRequest } from './decorPlanWire.ts';
import { tankGraphFrom, tankGraphTransfer, tankGraphWire } from './tankGraphWire.ts';
import { digestTankRoot, ledgerBuildOptions } from '../../tools/fleet-geometry-digest.mjs';

// the graph wire: values, references, levels
{
  const root = new THREE.Group();
  root.name = 'root';
  const hull = new THREE.Group();
  hull.name = 'hull';
  hull.position.set(1, 2, 3);
  hull.matrixAutoUpdate = false;
  hull.updateMatrix();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, colorWrite: false }));
  mesh.name = 'plate';
  const lod = new THREE.LOD();
  const near = new THREE.Object3D();
  lod.addLevel(near, 0);
  lod.addLevel(new THREE.Object3D(), 40, 0.1);
  hull.add(mesh, lod);
  root.add(hull);
  root.userData = { spareTrack: [{ site: 'rear', frame: 'hull' }], box: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 2, 3)),
    owner: mesh, list: new Map([['a', new THREE.Vector3(1, 1, 1)]]), hook: () => 1 };
  mesh.geometry.userData = { pair: new THREE.Vector2(4, 5) };
  root.updateMatrixWorld(true);
  const { wire, refs } = tankGraphWire(root, [hull]);
  assert.deepEqual(refs, [1]);
  assert.deepEqual(wire.lossy, ['root.userData.hook'], 'a function stays behind and is named');
  const nodes = tankGraphFrom(structuredClone(wire, { transfer: tankGraphTransfer(wire) }));
  const [r, h] = nodes;
  const m = h.children[0], l = h.children[1];
  assert.equal(h.matrixAutoUpdate, false);
  assert.deepEqual(h.matrix.elements, hull.matrix.elements);
  assert.deepEqual(m.matrixWorld.elements, mesh.matrixWorld.elements);
  assert.equal(m.material.side, THREE.DoubleSide);
  assert.equal(m.material.colorWrite, false);
  assert.ok(l instanceof THREE.LOD && l.levels.length === 2 && l.levels[0].object === l.children[0] && l.levels[1].distance === 40);
  assert.ok(r.userData.box instanceof THREE.Box3 && r.userData.box.max.z === 3);
  assert.ok(r.userData.owner === m, 'a node reference resolves to the replica node');
  assert.ok(r.userData.list.get('a') instanceof THREE.Vector3);
  assert.ok(m.geometry.userData.pair instanceof THREE.Vector2 && m.geometry.userData.pair.y === 5);
  assert.equal(r.userData.hook, undefined);
}

// a decoration across a realm attaches exactly as the in-line one
const acrossRealm = (args) => {
  const { request, transfer } = decorPlanRequest(args);
  const reply = planDecorRequest(structuredClone(request, { transfer }));
  return reply && decorPlanFrom(structuredClone(reply, { transfer: decorPlanTransfer(reply) }), args);
};
const build = (id, options) => {
  const steps = createTankSteps(id, null, options);
  let result = steps.next();
  while (!result.done) {
    assert.equal(result.value, undefined, 'a synchronous planner yields no wait');
    result = steps.next();
  }
  return result.value;
};
for (const id of ['leo2a5', 'merkava1b']) {
  for (const quality of ['high', 'low']) {
    const options = { ...ledgerBuildOptions(quality), decor: true };
    const inline = build(id, options);
    const planned = build(id, { ...options, decorPlanner: acrossRealm });
    try {
      assert.equal(planned.root.userData.decorPlanned, true, `${id}/${quality}: the planner's plan was attached`);
      assert.ok(planned.root.userData.__decorSummary?.pieces?.length > 0, `${id}/${quality}: the decoration has pieces`);
      assert.deepEqual(planned.root.userData.__decorSummary, inline.root.userData.__decorSummary, `${id}/${quality}: same summary`);
      assert.deepEqual(planned.root.userData.spareTrack, inline.root.userData.spareTrack, `${id}/${quality}: same spare-track receipts`);
      assert.equal(digestTankRoot(planned.root).digest, digestTankRoot(inline.root).digest, `${id}/${quality}: same geometry`);
    } finally {
      inline.dispose();
      planned.dispose();
    }
  }
}

// a planner that fails leaves the tank to the in-line pass
{
  const options = { ...ledgerBuildOptions('low'), decor: true };
  const inline = build('merkava1b', options);
  const fallback = build('merkava1b', { ...options, decorPlanner: () => { throw new Error('no worker'); } });
  try {
    assert.equal(fallback.root.userData.decorPlanned, false);
    assert.equal(digestTankRoot(fallback.root).digest, digestTankRoot(inline.root).digest);
  } finally {
    inline.dispose();
    fallback.dispose();
  }
}

console.log('decorPlanWire.selftest: the graph wire keeps values, references and levels; a decoration planned across a realm '
  + 'attaches byte-identically at HIGH and LOW; a failed planner falls back to the in-line pass');
