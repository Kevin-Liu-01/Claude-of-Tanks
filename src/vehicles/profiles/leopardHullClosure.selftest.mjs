import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const expectedHalfWidths = new Map([
  ['leo2a4', 0.92],
  ['leo2a4_otco', 0.92],
  ['leo2a4m', 0.88],
  ['leo2a6', 0.88],
  ['leo2a6m', 0.88],
  ['leo2a6_ua', 0.88],
]);

const upperGlacisFillIds = new Set(['leo2a4m', 'leo2a6', 'leo2a6m', 'leo2a6_ua']);

for (const [id, expectedHalfW] of expectedHalfWidths) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const closure = hullRig?.userData.leopardUnderGlacisClosure;
    assert.ok(hullRig && closure, `${id}: under-glacis closure receipt exists`);
    assert.equal(closure.halfW, expectedHalfW,
      `${id}: closure uses the family track-safe half-width`);
    assert.ok(closure.laneHalfWidth == null || closure.halfW < closure.laneHalfWidth,
      `${id}: closure remains inside the animated track lanes`);
    assert.ok(closure.bellyRunRearZ <= closure.tubFrontZ,
      `${id}: belly return overlaps the lower tub without a rear gap`);
    assert.ok(closure.bellyRunFrontZ >= closure.lowerPlateRearZ,
      `${id}: belly return overlaps the receding lower-front plate`);
    assert.ok(closure.lowerPlateFrontTopY > closure.beltY,
      `${id}: lower-front plate captures the glacis belt foot`);
    assert.ok(closure.lowerPlateRearTopY >= closure.bellyY - 0.011,
      `${id}: lower-front plate lands on the belly plane`);
    assert.ok(closure.lowerPlateFrontZ > closure.lowerPlateRearZ,
      `${id}: lower-front plate rises toward the bow`);
    if (upperGlacisFillIds.has(id)) {
      assert.equal(closure.upperFillEnabled, true,
        `${id}: upper-glacis cavity infill is enabled`);
      assert.ok(closure.upperFillSegments >= 4,
        `${id}: infill follows every upper-glacis station segment`);
      assert.ok(closure.upperFillFrontSupportY < closure.upperFillRearSupportY,
        `${id}: infill support plane descends continuously toward the nose`);
      assert.ok(closure.upperFillOverlapM > 0,
        `${id}: infill overlaps the armor underside instead of leaving a seam`);
      assert.ok(closure.upperFillHalfW <= expectedHalfW + 1e-6,
        `${id}: deep infill stays inside the inter-track hull corridor`);

      const hull = hullRig.getObjectByName('hull');
      assert.ok(hull, `${id}: merged structural hull exists`);
      tank.root.updateMatrixWorld(true);
      for (const [localZ, localY] of [[2.20, 1.37], [2.50, 1.32], [2.88, 1.23]]) {
        const origin = hullRig.localToWorld(new THREE.Vector3(1.70, localY, localZ));
        const direction = new THREE.Vector3(-1, 0, 0).transformDirection(hullRig.matrixWorld);
        const ray = new THREE.Raycaster(origin, direction, 0, 1.1);
        const hits = ray.intersectObject(hull, false);
        assert.ok(hits.length > 0,
          `${id}: hull is closed beneath the upper glacis at z=${localZ.toFixed(2)}`);
        const localHit = hullRig.worldToLocal(hits[0].point.clone());
        assert.ok(localHit.x <= expectedHalfW + 0.04 && localHit.x >= expectedHalfW - 0.08,
          `${id}: lateral sightline closes on the inter-track infill at z=${localZ.toFixed(2)}`);
      }
    }
  } finally {
    tank.dispose();
  }
}

console.log('leopardHullClosure.selftest: requested Leopard bow undersides are continuous and track-safe');
