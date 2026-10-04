import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { measurePresentationFloor, measureRestContact } from './restPoseContact.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

// Batch-static builds (the game's battle and garage builds) pack every sprocket and idler into two BatchedMeshes
// (running-gear course 1 in tankFactoryCore). A BatchedMesh is also isMesh, and its shared buffer is origin-local.
// Until 2026-10-03 the rest scan read that buffer through the batch's matrix alone. Every end wheel landed at the hull
// origin, a wheel radius under the gear line, so composeContactGeom took its 12 cm cap (bottomYM gear - 0.12) on every
// browser build: tanks rode 12-14 cm high with every road wheel hanging. Node and headless builds take course 2
// (plain meshes), so no receipt saw it. This receipt builds course 1 in Node (BatchedMesh needs no WebGL).

// 1. The scan replays each batch instance through its own matrix. A 0.6 m wheel drum batched twice at axle height
// 0.40 m rests at 0.10 m, not at the -0.30 m the bare buffer shows.
{
  const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).rotateZ(Math.PI / 2);
  const batch = new THREE.BatchedMesh(2, drum.getAttribute('position').count, drum.index.count, new THREE.MeshBasicMaterial());
  const id = batch.addGeometry(drum);
  for (const x of [-1.4, 1.4]) batch.setMatrixAt(batch.addInstance(id), new THREE.Matrix4().makeTranslation(x, 0.40, 0));
  const root = new THREE.Group();
  root.add(batch);
  const scan = measureRestContact(root);
  assert.ok(Math.abs(scan.absMinYM - 0.10) < 1e-6 && Math.abs(scan.bottomYM - 0.10) < 1e-6,
    `batched drums rest at their axles (absMin ${scan.absMinYM}, bottom ${scan.bottomYM})`);
  assert.ok(Math.abs(measurePresentationFloor(root) - 0.10) < 1e-6, 'the presentation floor reads the batch per instance');
  // Control: the same buffer read as a plain mesh puts the drums at the origin.
  const plain = new THREE.Group();
  plain.add(new THREE.Mesh(batch.geometry, batch.material));
  assert.ok(Math.abs(measureRestContact(plain).absMinYM + 0.30) < 1e-6, 'the bare batch buffer is origin-local');
  // A hidden instance is not stock.
  batch.setVisibleAt(0, false);
  batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1.4, 0.55, 0));
  assert.ok(Math.abs(measureRestContact(root).absMinYM - 0.25) < 1e-6, 'hidden batch instances are skipped');
  batch.dispose();
  drum.dispose();
}

// 2. Fleet hulls on both courses. Course 1 must read exactly what course 2 reads: the same contact floor, hull-pan line
// and presentation seat. These hulls (the T-90M at both qualities) must rest on their gear line.
const restoreCanvas = installCanvasFixture();
const contact = (id, batchStatic, quality) => {
  const tank = createTank(id, null, { proceduralOnly: true, quality, camoSeed: 4242, batchStatic });
  try {
    const batches = [];
    tank.root.traverse((o) => { if (o.isBatchedMesh && /^gearEndWheel(Body|Hardware)$/.test(o.name)) batches.push(o.name); });
    return { contact: { ...tank.root.userData.contactGeom }, seatY: tank.seatOnFloor(0), batches };
  } finally {
    tank.dispose();
  }
};
for (const [id, quality] of [['t90m', 'high'], ['t90m', 'low'], ['t90a', 'high'], ['bmpt_t90', 'high'], ['m1a2', 'high'],
  ['m1a2_sepv2', 'high'], ['leo2a4', 'high']]) {
  const batched = contact(id, true, quality), plain = contact(id, false, quality);
  assert.deepEqual(batched.batches.sort(), ['gearEndWheelBody', 'gearEndWheelHardware'], `${id}: course 1 batches its end wheels`);
  assert.equal(plain.batches.length, 0, `${id}: course 2 draws plain end-wheel meshes`);
  const { bottomYM, gearBottomYM, panYM } = batched.contact;
  assert.ok(Math.abs(bottomYM - plain.contact.bottomYM) < 1e-3,
    `${id} ${quality}: batch-static floor ${bottomYM} equals the plain build's ${plain.contact.bottomYM}`);
  assert.ok(Math.abs(panYM - plain.contact.panYM) < 1e-3, `${id} ${quality}: same hull-pan line on both courses`);
  assert.ok(Math.abs(batched.seatY - plain.seatY) < 1e-3,
    `${id} ${quality}: same presentation seat on both courses (${batched.seatY} vs ${plain.seatY})`);
  assert.ok(Math.abs(bottomYM - gearBottomYM) < 0.01,
    `${id} ${quality}: batch-static hull rests on its gear line (bottom ${bottomYM}, gear ${gearBottomYM})`);
}
restoreCanvas();
console.log('restPoseBatchedGear: batch-static end wheels read per instance; T-90M (high/low), T-90A, BMPT T-90, M1A2, M1A2 SEPv2 and Leopard 2A4 rest on their gear line with the plain build\'s floor, pan and seat PASS');
