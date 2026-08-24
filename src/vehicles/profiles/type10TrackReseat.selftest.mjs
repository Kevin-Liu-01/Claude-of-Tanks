import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const EPSILON = 1e-6;
const WRAP_CLEARANCE_M = 0.045;
const SHOE_GAP_M = 0.012;
const EXPECTED_GROUND_SURFACE_Y = 0.006;
const EXPECTED_SHOE_CENTER_Y = -0.006;
const EXPECTED_WRAP_TOP_Y = {
  idler: 0.88 + 0.231 + WRAP_CLEARANCE_M,
  sprocket: 1.155 + 0.22 + WRAP_CLEARANCE_M,
};

const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`);
};

for (const id of ['type10', 'type10b']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  await Promise.resolve();

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    const pads = hull?.getObjectByName('gearTrackPads');
    const bands = ['gearTrackBandL', 'gearTrackBandR']
      .map((name) => hull?.getObjectByName(name));

    assert.ok(receipt && pads?.isInstancedMesh && bands.every(Boolean),
      `${id}: exposes one measured shoe course and both casting bands`);
    assert.equal(receipt.trackTh, 0.09,
      `${id}: uses the inward-grown 90 mm casting belt`);
    near(receipt.botY - receipt.trackTh / 2, EXPECTED_GROUND_SURFACE_Y,
      `${id}: belt reseat preserves the certified lower surface`);
    near(receipt.botY - (receipt.trackTh / 2 + SHOE_GAP_M), EXPECTED_SHOE_CENTER_Y,
      `${id}: tread shoes stay on the existing ground plane`);

    const nominalWheelBottom = receipt.wheelY - receipt.wheelR;
    const bandInnerSurface = receipt.botY + receipt.trackTh / 2;
    assert.ok(bandInnerSurface - nominalWheelBottom >= 0.018,
      `${id}: road-wheel rims remain seated inside the lower belt`);

    const expectedFrontContact = receipt.wheelZs[0] + receipt.wheelR / 2;
    const expectedRearContact = receipt.wheelZs.at(-1) - receipt.wheelR / 2;
    const groundRun = receipt.loopPoints
      .filter(([, y]) => Math.abs(y - receipt.botY) <= EPSILON)
      .map(([z]) => z);
    assert.ok(groundRun.some((z) => Math.abs(z - expectedFrontContact) <= EPSILON),
      `${id}: loaded run supports the front road-wheel outer quadrant`);
    assert.ok(groundRun.some((z) => Math.abs(z - expectedRearContact) <= EPSILON),
      `${id}: loaded run supports the rear road-wheel outer quadrant`);

    for (const [label, end] of [['idler', receipt.idler], ['sprocket', receipt.sprocket]]) {
      const wrapTop = Math.max(...receipt.loopPoints
        .filter(([z]) => Math.abs(z - end.z) <= EPSILON)
        .map(([, y]) => y));
      near(wrapTop, EXPECTED_WRAP_TOP_Y[label],
        `${id}: ${label} belt follows the recessed engagement ring`);
      assert.ok(wrapTop < end.y + end.r,
        `${id}: ${label} course stays inside the sealed hull bay`);
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    let loadedShoeCount = 0;
    for (let i = 0; i < receipt.shoeCountPerSide; i++) {
      pads.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      if (Math.abs(position.y - EXPECTED_SHOE_CENTER_Y) <= EPSILON) loadedShoeCount++;
    }
    assert.ok(loadedShoeCount >= 30,
      `${id}: one continuous loaded shoe run remains fully populated`);
    assert.equal(pads.count, receipt.shoeCountPerSide * 2,
      `${id}: both sides share one instanced tread draw call`);
  } finally {
    tank.dispose();
  }
}

console.log('type10TrackReseat.selftest: Type 10 family wheels, bands, and shoes share one seated course');
