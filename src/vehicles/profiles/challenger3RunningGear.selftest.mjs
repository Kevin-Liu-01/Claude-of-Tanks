import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const IDS = ['challenger_3', 'challenger_3x'];
const EXPECTED_WHEEL_ZS = [2.75, 1.84, 0.93, 0.02, -0.89, -1.80];
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

function shoeClearance(trackPads, receipt, wheelZ, includesShoe) {
  trackPads.geometry.computeBoundingBox();
  const bounds = trackPads.geometry.boundingBox;
  const matrix = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const shoeCenter = new THREE.Vector3();
  const wheelInShoe = new THREE.Vector3();
  let minimum = Infinity;

  // The first half of the instances is one complete track lane. Measuring
  // the wheel circle against each oriented shoe's conservative Y/Z bounds
  // catches the diagonal overlap visible from the side without confusing it
  // with the intended tire contact on the flat loaded run.
  for (let index = 0; index < trackPads.count / 2; index += 1) {
    trackPads.getMatrixAt(index, matrix);
    shoeCenter.setFromMatrixPosition(matrix);
    if (!includesShoe(matrix, shoeCenter)) continue;

    inverse.copy(matrix).invert();
    wheelInShoe.set(-receipt.xcLeft, receipt.wheelY, wheelZ).applyMatrix4(inverse);
    const dy = Math.max(
      bounds.min.y - wheelInShoe.y,
      0,
      wheelInShoe.y - bounds.max.y,
    );
    const dz = Math.max(
      bounds.min.z - wheelInShoe.z,
      0,
      wheelInShoe.z - bounds.max.z,
    );
    minimum = Math.min(minimum, Math.hypot(dy, dz) - receipt.wheelR);
  }
  return minimum;
}

function rampShoeClearance(trackPads, receipt, wheelZ, end) {
  const flatRun = receipt.loopPoints.filter(([, y]) => Math.abs(y - receipt.botY) <= EPSILON);
  const contactZ = end === 'rear'
    ? Math.min(...flatRun.map(([z]) => z))
    : Math.max(...flatRun.map(([z]) => z));
  return shoeClearance(trackPads, receipt, wheelZ, (matrix, center) => {
    const isRamp = Math.abs(matrix.elements[6]) > 0.15;
    const beyondContact = end === 'rear' ? center.z < contactZ : center.z > contactZ;
    return isRamp && beyondContact;
  });
}

function upperShoeClearance(trackPads, receipt, wheelZ) {
  return shoeClearance(trackPads, receipt, wheelZ, (_matrix, center) => (
    center.y > receipt.wheelY
  ));
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

    const rearRampClearance = rampShoeClearance(
      trackPads, receipt, EXPECTED_WHEEL_ZS.at(-1), 'rear');
    const frontRampClearance = rampShoeClearance(
      trackPads, receipt, EXPECTED_WHEEL_ZS[0], 'front');
    assert.ok(rearRampClearance >= 0.03 - EPSILON,
      `${id}: rear road wheel clears the rising linked-shoe course`);
    assert.ok(frontRampClearance >= 0.015 - EPSILON,
      `${id}: forward shift preserves clearance at the front linked-shoe course`);

    const loadedTrackInnerY = receipt.botY + receipt.trackTh / 2;
    const tireBottomY = receipt.wheelY - receipt.wheelR;
    const loadedClearance = tireBottomY - loadedTrackInnerY;
    assert.ok(loadedClearance >= -EPSILON && loadedClearance <= 0.015 + EPSILON,
      `${id}: tire bottoms rest on the loaded track inner face without passing through it`);

    const upperCourseClearance = Math.min(...EXPECTED_WHEEL_ZS.map((wheelZ) => (
      upperShoeClearance(trackPads, receipt, wheelZ)
    )));
    assert.ok(upperCourseClearance >= 0.05 - EPSILON,
      `${id}: every wheel crown clears the complete return shoe geometry`);

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
