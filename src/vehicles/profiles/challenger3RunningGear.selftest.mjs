import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { KIT } from '../tankFactoryCore.ts';
import { rollerSuspensionFixtures } from '../returnRollerPhysicsTest.mjs';

const IDS = ['challenger_3', 'challenger_3x'];
const EXPECTED_WHEEL_ZS = [2.65, 1.74, 0.83, -0.08, -0.99, -1.90];
const EPSILON = 1e-6;

function terminalClearance(receipt, wheelZ, terminal) {
  return Math.hypot(
    wheelZ - terminal.z,
    receipt.wheelY - terminal.y,
  ) - receipt.wheelR - terminal.r;
}

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

function roadWheelCenters(roadWheels, side) {
  const matrix = new THREE.Matrix4();
  const center = new THREE.Vector3();
  const result = [];
  for (let index = 0; index < roadWheels.count; index += 1) {
    roadWheels.getMatrixAt(index, matrix);
    center.setFromMatrixPosition(matrix);
    if (Math.sign(center.x) === side) result.push(center.clone());
  }
  return result;
}

function minimumLoadedCarrierClearance(band, wheels, receipt) {
  const positions = band.geometry.getAttribute('position');
  const radius = receipt.wheelR + receipt.trackTh / 2 + 0.001;
  let minimum = Infinity;
  for (let cell = 0; cell < receipt.loopPoints.length; cell += 1) {
    const base = cell * 24;
    const y0 = (positions.getY(base + 2) + positions.getY(base + 6)) / 2;
    const z0 = (positions.getZ(base + 2) + positions.getZ(base + 6)) / 2;
    const y1 = (positions.getY(base) + positions.getY(base + 8)) / 2;
    const z1 = (positions.getZ(base) + positions.getZ(base + 8)) / 2;
    for (const wheel of wheels) {
      if (y0 >= wheel.y && y1 >= wheel.y) continue;
      for (let step = 0; step <= 128; step += 1) {
        const t = step / 128;
        const z = z0 + (z1 - z0) * t;
        const dz = z - wheel.z;
        if (Math.abs(dz) >= radius) continue;
        const y = y0 + (y1 - y0) * t;
        const underside = wheel.y - Math.sqrt(radius * radius - dz * dz);
        minimum = Math.min(minimum, underside - y);
      }
    }
  }
  return minimum;
}

for (const id of IDS) {
  const originalBuildRunningGear = KIT.buildRunningGear;
  let runningGear;
  KIT.buildRunningGear = (port, cfg) => {
    const gear = originalBuildRunningGear(port, cfg);
    runningGear = { port, cfg, gear };
    return gear;
  };
  let tank;
  try {
    tank = createTank(id, null, {
      proceduralOnly: true,
      quality: 'high',
      camoSeed: 4242,
      geometryReceipt: true,
      batchStatic: false,
    });
  } finally {
    KIT.buildRunningGear = originalBuildRunningGear;
  }

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
    assert.equal(receipt.fitLoadedRun, true,
      `${id}: loaded track spans remain fitted to the live Hydrogas rims`);
    assert.deepEqual(uniqueInstanceAxis(roadWheels, 'z'), EXPECTED_WHEEL_ZS,
      `${id}: rendered road wheels use the reviewed stations`);
    assert.deepEqual(uniqueInstanceAxis(roadWheels, 'y'), [0.51],
      `${id}: every road wheel is reseated at the corrected axle height (2026-09-14: 0.40 m paired wheels, axle 50 mm lower)`);
    assert.equal(roadWheels.count, 12, `${id}: retains six road wheels per side`);
    // 2026-09-14 owner: paired hollow road wheels replace the open eight-rib discs. The nation
    // pattern (UK pressed-eight) is recorded, no shared face layers are stacked on the custom
    // stock, and the paired construction fills the fitted 0.47 m axial width.
    const patternReceipt = hull.userData.wheelPatternReceipts?.[0];
    assert.equal(patternReceipt?.id, 'pressed-eight', `${id}: UK nation wheel pattern, no per-tank override`);
    assert.equal(patternReceipt?.faceProfile, undefined, `${id}: custom paired stock carries no shared face motif`);
    assert.equal(patternReceipt?.wheelFaceLayers, 0, `${id}: no dressing layers float beside the paired wheel`);
    roadWheels.geometry.computeBoundingBox();
    assert.ok(Math.abs(roadWheels.geometry.boundingBox.max.x - 0.22) < 0.006
      && Math.abs(roadWheels.geometry.boundingBox.min.x + 0.22) < 0.006,
      `${id}: paired road wheel spans the fitted 0.44 m axial width`);

    assert.ok(terminalClearance(receipt, EXPECTED_WHEEL_ZS[0], receipt.idler) >= 0.01,
      `${id}: leading road wheel remains visibly separate from the front idler`);
    assert.ok(terminalClearance(receipt, EXPECTED_WHEEL_ZS.at(-1), receipt.sprocket) >= 0.08,
      `${id}: trailing road wheel remains separate from the rear final drive`);

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

    for (const { name, sample } of rollerSuspensionFixtures(runningGear)) {
      runningGear.gear.resetPose();
      for (let tick = 0; tick < 180; tick += 1) {
        runningGear.gear.conform({
          pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0,
        }, sample, 0, 0, 1 / 60);
      }
      runningGear.gear.update(0, 0, 1 / 60);
      const leftClearance = minimumLoadedCarrierClearance(
        hull.getObjectByName('gearTrackBandL'), roadWheelCenters(roadWheels, -1), receipt);
      const rightClearance = minimumLoadedCarrierClearance(
        hull.getObjectByName('gearTrackBandR'), roadWheelCenters(roadWheels, 1), receipt);
      assert.ok(Number.isFinite(leftClearance) && Number.isFinite(rightClearance)
        && Math.min(leftClearance, rightClearance) >= -2e-5,
        `${id}: ${name} loaded carrier stays below every moving road-wheel rim`);
    }
    runningGear.gear.resetPose();
  } finally {
    tank.dispose();
  }
}

console.log('challenger3RunningGear.selftest: road wheels sit inside both loaded and return track runs');
