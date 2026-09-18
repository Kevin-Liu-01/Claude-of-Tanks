import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;
const WRAP_CLEARANCE_M = 0.028 / 2 + 0.002; // plain-rim wrap on the 28 mm fleet band (trackWrapClearanceM, 2026-09-17)
const SHOE_GAP_M = 0.012;
const EXPECTED_GROUND_SURFACE_Y = 0.006;
// 2026-09-17 ground datum: the loaded shoes centre one shoe gap under the fleet band's outer face, soles on y = 0
const expectedShoeCenterY = (receipt) => receipt.botY - receipt.trackTh / 2 - SHOE_GAP_M;
const END_WHEEL_FACE_CLEARANCE_M = 0.045;
const EXPECTED_IDLER_WHEEL_RADIUS = 0.33 / 0.975;
const EXPECTED_IDLER_COURSE_RADIUS = 0.33;
const EXPECTED_WRAP_TOP_Y = {
  // 2026-09-17: the idler carries trackFace 'datum', so the 28 mm band's inner face sits on the 0.975 r tread bore
  // and the belt centreline is half a band above it (was the legacy 0.045 allowance).
  idler: 0.82 + EXPECTED_IDLER_COURSE_RADIUS + 0.028 / 2,
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
    batchStatic: false,
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
    assert.equal(receipt.trackTh, 0.028,
      `${id}: uses the fleet-standard 28 mm casting belt (2026-09-17; the 90 mm authored belt is clamped)`);
    assert.ok(receipt.botY - receipt.trackTh / 2 > 0.02 && receipt.botY - receipt.trackTh / 2 < 0.07,
      `${id}: belt bottom rides one shoe stack above the y = 0 ground datum (2026-09-17)`);
    assert.ok(receipt.botY - (receipt.trackTh / 2 + SHOE_GAP_M) > 0 && receipt.botY - (receipt.trackTh / 2 + SHOE_GAP_M) < 0.05,
      `${id}: tread shoes ride between the belt and the y = 0 ground datum (2026-09-17)`);

    const nominalWheelBottom = receipt.wheelY - receipt.wheelR;
    const bandInnerSurface = receipt.botY + receipt.trackTh / 2;
    assert.ok(Math.abs(bandInnerSurface - nominalWheelBottom) < 1e-9,
      `${id}: road-wheel feet rest on the belt's upper face (ground-datum seat, 2026-09-17)`);

    // 2026-09-14 tangent wrap: the flat run ends under the outer axles and the band wraps each
    // outer wheel, so the quadrant beyond the axle is carried by the wrap arc, not the flat run.
    const expectedFrontContact = receipt.wheelZs[0];
    const expectedRearContact = receipt.wheelZs.at(-1);
    const groundRun = receipt.loopPoints
      .filter(([, y]) => Math.abs(y - receipt.botY) <= EPSILON)
      .map(([z]) => z);
    assert.ok(groundRun.some((z) => Math.abs(z - expectedFrontContact) <= EPSILON),
      `${id}: loaded run reaches the front road-wheel axle`);
    assert.ok(groundRun.some((z) => Math.abs(z - expectedRearContact) <= EPSILON),
      `${id}: loaded run reaches the rear road-wheel axle`);

    for (const [label, end] of [['idler', receipt.idler], ['sprocket', receipt.sprocket]]) {
      const wrapTop = Math.max(...receipt.loopPoints
        .filter(([z]) => Math.abs(z - end.z) <= EPSILON)
        .map(([, y]) => y));
      near(wrapTop, EXPECTED_WRAP_TOP_Y[label],
        `${id}: ${label} belt wraps the rendered terminal wheel`);
      if (label === 'idler') {
        near(end.r, EXPECTED_IDLER_WHEEL_RADIUS,
          `${id}: idler retains its normal visible diameter`);
        near(wrapTop - receipt.trackTh / 2, end.y + end.r * 0.975,
          `${id}: idler contact rim meets the tread bore exactly`);
      } else {
        assert.ok(wrapTop >= end.y + end.r + WRAP_CLEARANCE_M - EPSILON,
          `${id}: ${label} wheel cannot pierce through the tread silhouette`);
      }
    }
    assert.ok(receipt.idler.r >= receipt.wheelR * 0.85,
      `${id}: front idler retains a normal road-wheel-scale diameter`);
    const idlerTopApproach = receipt.loopPoints.filter(([z, y]) =>
      z >= receipt.idler.z - 0.38 - EPSILON
      && z <= receipt.idler.z + EPSILON
      && y >= EXPECTED_WRAP_TOP_Y.idler - 0.03);
    assert.ok(idlerTopApproach.length >= 3
      && idlerTopApproach.every(([, y]) => Math.abs(y - EXPECTED_WRAP_TOP_Y.idler) <= EPSILON),
      `${id}: upper tread run meets the idler tangentially without a visible kink`);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    let loadedShoeCount = 0;
    for (let i = 0; i < receipt.shoeCountPerSide; i++) {
      pads.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      if (Math.abs(position.y - expectedShoeCenterY(receipt)) <= 1e-4) loadedShoeCount++;
    }
    assert.ok(loadedShoeCount >= 30,
      `${id}: one continuous loaded shoe run remains fully populated`);
    assert.equal(pads.count, receipt.shoeCountPerSide * 2,
      `${id}: both sides share one instanced tread draw call`);

    pads.geometry.computeBoundingBox();
    const shoeHalfWidth = Math.max(
      Math.abs(pads.geometry.boundingBox.min.x),
      Math.abs(pads.geometry.boundingBox.max.x),
    );
    const shoeOutboardPlane = Math.max(receipt.xcLeft, receipt.xcRight) + shoeHalfWidth;
    const endWheelParts = hull.children.filter((object) =>
      object.name === 'gearEndWheelBody' || object.name === 'gearEndWheelHardware');
    assert.equal(endWheelParts.length, 8,
      `${id}: exposes body and hardware for both terminal wheels on both sides`);
    for (const part of endWheelParts) {
      part.geometry.computeBoundingBox();
      const localHalfWidth = Math.max(
        Math.abs(part.geometry.boundingBox.min.x),
        Math.abs(part.geometry.boundingBox.max.x),
      );
      const outboardReach = Math.abs(part.position.x) + localHalfWidth;
      assert.ok(outboardReach <= shoeOutboardPlane - END_WHEEL_FACE_CLEARANCE_M,
        `${id}: ${part.name} at z=${part.position.z} stays behind the tread face`);
    }

    const faceDress = hull.getObjectByName('hullTrack');
    const facePositions = faceDress?.geometry?.getAttribute('position');
    assert.ok(facePositions, `${id}: exposes merged end-wheel face dress geometry`);
    let faceDressOutboardReach = 0;
    for (let i = 0; i < facePositions.count; i++) {
      const y = facePositions.getY(i);
      const z = facePositions.getZ(i);
      const nearTerminalFace = [receipt.idler, receipt.sprocket]
        .some((end) => Math.hypot(y - end.y, z - end.z) <= 0.19);
      if (nearTerminalFace) {
        faceDressOutboardReach = Math.max(faceDressOutboardReach,
          Math.abs(facePositions.getX(i)));
      }
    }
    assert.ok(faceDressOutboardReach > 0
      && faceDressOutboardReach <= shoeOutboardPlane - END_WHEEL_FACE_CLEARANCE_M,
      `${id}: decorative terminal-wheel rings stay behind the tread face`);
  } finally {
    tank.dispose();
  }
}

console.log('type10TrackReseat.selftest: Type 10 family wheels, bands, and shoes share one seated course');
