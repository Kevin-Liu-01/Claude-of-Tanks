import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const ABRAMS_FAMILY_IDS = [
  'm1a2',
  'm1a1',
  'm1a1ha',
  'm1a2_tusk',
  'm1a2_sepv2',
  'm1a2_sepv3',
  'ua_m1a1',
  // MBT-70 intentionally composes the certified skirtless M1A1 hull.
  'mbt70',
];
const EXPECTED_WHEEL_ZS = [2.19, 1.46, 0.73, 0, -0.73, -1.46, -2.19];
const EXPECTED_CONTACT_ZS = [2.32, -2.31];
const EPSILON = 1e-6;
const ABRAMS_RETURN_ROLLER_CASES = [
  ['m1a2', 2],
  ['m1a1', 2],
  ['m1a1ha', 2],
  ['m1a2_tusk', 2],
  ['m1a2_sepv2', 2],
  ['m1a2_sepv3', 2],
  ['ua_m1a1', 2],
  ['m1a2_legacy', 2],
  ['abramsx', 2],
  ['mbt70', 3],
];

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

function uniqueInstanceYs(mesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const ys = new Set();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    ys.add(Number(position.y.toFixed(4)));
  }
  return [...ys].sort((a, b) => b - a);
}

for (const id of ABRAMS_FAMILY_IDS) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    const roadWheels = hull?.getObjectByName('gearRoadWheelTires');
    const trackPads = hull?.getObjectByName('gearTrackPads');

    assert.ok(receipt && roadWheels?.isInstancedMesh && trackPads?.isInstancedMesh,
      `${id}: exposes the canonical animated wheel and track layers`);
    assert.deepEqual(receipt.wheelZs, EXPECTED_WHEEL_ZS,
      `${id}: uses the regular seven-station Abrams wheel plan`);
    assert.deepEqual(uniqueInstanceZs(roadWheels), EXPECTED_WHEEL_ZS,
      `${id}: visible wheel instances match the running-gear receipt`);
    assert.equal(roadWheels.count, 14, `${id}: keeps seven road wheels per side`);
    assert.equal(receipt.wheelR, 0.31, `${id}: uses the non-overlapping road-wheel radius`);
    assert.ok(Math.abs(receipt.wheelY - receipt.wheelR - 0.11) <= EPSILON,
      `${id}: road-wheel bottoms retain the previous loaded datum`);

    for (let i = 1; i < receipt.wheelZs.length; i++) {
      const centerDistance = receipt.wheelZs[i - 1] - receipt.wheelZs[i];
      assert.ok(centerDistance - receipt.wheelR * 2 >= 0.10 - EPSILON,
        `${id}: stations ${i - 1}/${i} have at least 100 mm tire clearance`);
    }
    assert.ok(receipt.idler.z - receipt.wheelZs[0]
      > receipt.idler.r + receipt.wheelR,
    `${id}: front road wheel clears the idler`);
    assert.ok(receipt.wheelZs.at(-1) - receipt.sprocket.z
      > receipt.sprocket.r + receipt.wheelR,
    `${id}: rear road wheel clears the drive sprocket`);

    const groundRunZs = receipt.loopPoints
      .filter(([, y]) => Math.abs(y - receipt.botY) <= EPSILON)
      .map(([z]) => z);
    assert.ok(groundRunZs.some((z) => Math.abs(z - EXPECTED_CONTACT_ZS[0]) <= EPSILON)
      && groundRunZs.some((z) => Math.abs(z - EXPECTED_CONTACT_ZS[1]) <= EPSILON),
    `${id}: track contact patch remains pinned after reseating the wheels`);
    assert.ok(Math.max(...receipt.loopPoints.map(([z]) => z)) > receipt.idler.z,
      `${id}: track still wraps the front idler`);
    assert.ok(Math.min(...receipt.loopPoints.map(([z]) => z)) < receipt.sprocket.z,
      `${id}: track still wraps the rear drive sprocket`);
  } finally {
    tank.dispose();
  }
}

for (const [id, stationsPerSide] of ABRAMS_RETURN_ROLLER_CASES) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.[0];
    const tires = hull?.getObjectByName('gearReturnRollerTires');
    const discs = hull?.getObjectByName('gearReturnRollerDiscs');

    assert.ok(receipt && tires?.isInstancedMesh && discs?.isInstancedMesh,
      `${id}: exposes return rollers through the canonical running-gear rig`);
    assert.equal(tires.count, stationsPerSide * 2,
      `${id}: has the intended number of return rollers on both sides`);
    assert.equal(discs.count, tires.count, `${id}: every return roller retains a painted hub`);

    const rollerZs = uniqueInstanceZs(tires);
    assert.equal(rollerZs.length, stationsPerSide,
      `${id}: has the intended longitudinal support stations`);
    for (const z of rollerZs) {
      assert.ok(receipt.loopPoints.some(([pointZ, pointY]) => Math.abs(pointZ - z) <= 1e-4
        && Math.abs(pointY - receipt.topY) <= EPSILON),
      `${id}: upper track rests on the return roller at z=${z}`);
    }

    // The legacy AIM hull has an intentionally oversized overlapping wheel
    // train under a closed skirt. All other Abrams presentations must keep
    // the roller axle visibly above the road-wheel crown instead of merging
    // the two rows as the rejected first placement did.
    if (id !== 'm1a2_legacy') {
      const [rollerY] = uniqueInstanceYs(tires);
      const roadWheelCrownY = receipt.wheelY + receipt.wheelR;
      assert.ok(rollerY - roadWheelCrownY >= 0.05 - EPSILON,
        `${id}: return-roller axle clears the road-wheel crown by at least 50 mm`);
      assert.ok(receipt.topY - roadWheelCrownY >= 0.19 - EPSILON,
        `${id}: upper track has a distinct elevated return course`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('abramsRoadWheelSpacing.selftest: M1-family wheels clear and elevated return rollers support the tracks');
