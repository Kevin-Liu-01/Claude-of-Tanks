import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const EXPECTED_ROAD_WHEEL_ZS = [2.48, 1.55, 0.62, -0.31, -1.24, -2.17];
const EXPECTED_RETURN_ROLLER_ZS = [1.61, 0.20, -1.21];
// 2026-09-14 tangent wrap: the flat run ends under the rear axle (-2.17) and the band wraps the wheel
const EXPECTED_REAR_CONTACT_Z = -2.17;
const EPSILON = 1e-6;

const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`);
};

function uniqueInstanceZs(mesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const zs = new Set();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    zs.add(Number(position.z.toFixed(4)));
  }
  return [...zs].sort((a, b) => b - a);
}

for (const quality of ['high', 'low', 'ai']) for (const id of ['k2', 'k2b']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality,
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const production = createTank('k2_x', null, {
    proceduralOnly: true, quality, camoSeed: 4242, geometryReceipt: true,
  });
  await Promise.resolve();

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    const roadWheels = hull?.getObjectByName('gearRoadWheelTires');
    const returnRollers = hull?.getObjectByName('gearReturnRollerTires');
    const trackPads = hull?.getObjectByName('gearTrackPads');

    assert.ok(receipt && roadWheels?.isInstancedMesh
      && returnRollers?.isInstancedMesh && trackPads?.isInstancedMesh,
    `${id}: exposes the canonical running-gear receipt and animated layers`);
    near(receipt.wheelR, .3225, `${id}/${quality}: production K2 road-wheel radius`);
    for (const name of ['gearRoadWheelTires', 'gearRoadWheelDiscs', 'gearRoadWheelInsets']) {
      const actual = hull.getObjectByName(name);
      const target = production.root.getObjectByName(name);
      assert.ok(actual?.isInstancedMesh && target?.isInstancedMesh, `${name}: real moving wheel stock`);
      assert.deepEqual(actual.geometry.index?.array, target.geometry.index?.array, `${name}: K2 topology`);
      for (const key of Object.keys(target.geometry.attributes)) {
        assert.deepEqual(actual.geometry.attributes[key]?.array, target.geometry.attributes[key].array,
          `${id}/${quality}/${name}/${key}: complete K2 wheel geometry, not a pattern label`);
      }
    }
    const matrix = new THREE.Matrix4();
    roadWheels.getMatrixAt(0, matrix);
    const axleY = matrix.elements[13];
    near(axleY - receipt.wheelR, receipt.botY + receipt.trackTh / 2,
      `${id}/${quality}: replacement tire rests on the loaded track`);
    assert.deepEqual(receipt.wheelZs, EXPECTED_ROAD_WHEEL_ZS,
      `${id}: six road wheels share the forward-compressed K2 station plan`);
    assert.deepEqual(uniqueInstanceZs(roadWheels), EXPECTED_ROAD_WHEEL_ZS,
      `${id}: visible road wheels match the station receipt on both sides`);
    assert.deepEqual(uniqueInstanceZs(returnRollers), EXPECTED_RETURN_ROLLER_ZS,
      `${id}: return rollers follow the compressed road-wheel span`);
    assert.equal(roadWheels.count, 12, `${id}: keeps six road wheels per side`);
    assert.equal(receipt.suspensionLinkCount, 12,
      `${id}: every moved road wheel remains suspension-driven`);

    for (let i = 1; i < receipt.wheelZs.length; i++) {
      near(receipt.wheelZs[i - 1] - receipt.wheelZs[i], 0.93,
        `${id}: road-wheel pitch ${i}`);
    }
    near(receipt.wheelZs[0], 2.48, `${id}: front road-wheel station stays fixed`);
    near(receipt.wheelZs.at(-1), -2.17,
      `${id}: rear road-wheel station moves 0.30 m forward`);
    assert.deepEqual(receipt.sprocket, { z: -3.08, y: 1.10, r: 0.25 },
      `${id}: rear sprocket stays in its certified position`);
    assert.deepEqual(receipt.idler, { z: 3.10, y: 0.72, r: 0.24 },
      `${id}: front idler stays in its certified position`);

    const groundRun = receipt.loopPoints.filter(([, y]) => Math.abs(y - receipt.botY) <= EPSILON);
    assert.ok(groundRun.some(([z]) => Math.abs(z - 2.48) <= EPSILON),
      `${id}: flat run reaches the front road-wheel axle`);
    assert.ok(groundRun.some(([z]) => Math.abs(z - EXPECTED_REAR_CONTACT_Z) <= EPSILON),
      `${id}: rear track departure is reseated around the moved rear wheel`);
    assert.ok(Math.abs(EXPECTED_REAR_CONTACT_Z - receipt.wheelZs.at(-1)) <= EPSILON,
      `${id}: the loaded run leaves the ground under the rear axle and wraps the wheel`);
  } finally {
    tank.dispose();
    production.dispose();
  }
}

console.log('k2RunningGearSeat: HIGH/LOW/AI XK2 and K2B use actual K2 wheels and retain seated track courses');
