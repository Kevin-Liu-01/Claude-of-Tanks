import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const IDS = ['challenger_3', 'challenger_3x'];
const EXPECTED_WHEEL_ZS = [2.55, 1.64, 0.73, -0.18, -1.09, -2.00];
const EPSILON = 1e-6;

function uniqueInstanceAxis(mesh, axis) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const values = new Set();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    values.add(Number(position[axis].toFixed(4)));
  }
  return [...values].sort((a, b) => b - a);
}

for (const id of IDS) {
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
    const wheelDiscs = hull?.getObjectByName('gearRoadWheelDiscs');
    const wheelInsets = hull?.getObjectByName('gearRoadWheelInsets');
    const trackPads = hull?.getObjectByName('gearTrackPads');

    assert.ok(receipt && roadWheels?.isInstancedMesh && wheelDiscs?.isInstancedMesh
      && wheelInsets?.isInstancedMesh && trackPads?.isInstancedMesh,
      `${id}: exposes the shared animated wheel and track layers`);
    assert.deepEqual(receipt.wheelZs, EXPECTED_WHEEL_ZS,
      `${id}: retains the reviewed six-station Hydrogas cadence`);
    assert.deepEqual(uniqueInstanceAxis(roadWheels, 'z'), EXPECTED_WHEEL_ZS,
      `${id}: rendered road wheels use the reviewed stations`);
    assert.deepEqual(uniqueInstanceAxis(roadWheels, 'y'), [0.56],
      `${id}: every road wheel is reseated at the corrected axle height`);
    assert.equal(roadWheels.count, 12, `${id}: retains six road wheels per side`);

    const loadedTrackInnerY = receipt.botY + receipt.trackTh / 2;
    const tireBottomY = receipt.wheelY - receipt.wheelR;
    const loadedClearance = tireBottomY - loadedTrackInnerY;
    assert.ok(loadedClearance >= -EPSILON && loadedClearance <= 0.015 + EPSILON,
      `${id}: tire bottoms rest on the loaded track inner face without passing through it`);

    const tireCrownY = receipt.wheelY + receipt.wheelR;
    const upperCourseBottomY = Math.min(...receipt.loopPoints
      .filter(([z, y]) => z >= EXPECTED_WHEEL_ZS.at(-1) && z <= EXPECTED_WHEEL_ZS[0]
        && y > tireCrownY)
      .map(([, y]) => y - receipt.trackTh / 2));
    assert.ok(upperCourseBottomY - tireCrownY >= 0.12 - EPSILON,
      `${id}: wheel crowns remain clear of the return track course`);

    const wheelLayers = [roadWheels, wheelDiscs, wheelInsets];
    for (const layer of wheelLayers) layer.geometry.computeBoundingBox();
    trackPads.geometry.computeBoundingBox();
    const wheelHalfDepth = Math.max(...wheelLayers.flatMap((layer) => [
      Math.abs(layer.geometry.boundingBox.min.x),
      Math.abs(layer.geometry.boundingBox.max.x),
    ]));
    const shoeHalfWidth = Math.max(
      Math.abs(trackPads.geometry.boundingBox.min.x),
      Math.abs(trackPads.geometry.boundingBox.max.x),
    );
    assert.ok(shoeHalfWidth - wheelHalfDepth >= 0.04 - EPSILON,
      `${id}: wheel faces remain seated inboard of the track shoes`);
  } finally {
    tank.dispose();
  }
}

console.log('challenger3RunningGear.selftest: road wheels sit inside both loaded and return track runs');
