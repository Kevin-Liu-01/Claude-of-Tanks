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
const upperShoulderFillIds = new Set(['leo2a6m', 'leo2a6_ua']);

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
      const hasShoulderFill = upperShoulderFillIds.has(id);
      assert.equal(closure.upperShoulderFillEnabled, hasShoulderFill,
        `${id}: upper-glacis shoulder closure matches its vehicle profile`);
      if (hasShoulderFill) {
        assert.ok(closure.upperShoulderFillSegments >= 6,
          `${id}: both shoulders follow the marked upper-glacis station segments`);
        assert.ok(closure.upperShoulderCoreOverlapM > 0,
          `${id}: shoulder closure overlaps the central structural backer`);
        assert.ok(closure.upperShoulderFloorY >= 1.30,
          `${id}: shoulder floor stays above the animated track sweep`);
        assert.ok(closure.upperShoulderMinDepthM > 0,
          `${id}: shoulder closure terminates with positive structural depth`);
        assert.ok(closure.upperShoulderOuterHalfWMax > 1.50,
          `${id}: shoulder closure reaches the full-width glacis underside`);

        for (const side of [-1, 1]) {
          for (const localZ of [2.20, 2.50, 2.88, 3.08]) {
            const origin = hullRig.localToWorld(new THREE.Vector3(side * 1.31, 0.95, localZ));
            const direction = new THREE.Vector3(0, 1, 0).transformDirection(hullRig.matrixWorld);
            const ray = new THREE.Raycaster(origin, direction, 0, 0.17);
            assert.equal(ray.intersectObject(hullRig.getObjectByName('hull'), false).length, 0,
              `${id}: ${side < 0 ? 'left' : 'right'} shoulder clears the track crown at z=${localZ.toFixed(2)}`);
          }
        }
      }

      const hull = hullRig.getObjectByName('hull');
      assert.ok(hull, `${id}: merged structural hull exists`);
      tank.root.updateMatrixWorld(true);
      for (const [localZ, localY] of [[2.20, 1.37], [2.50, 1.32], [2.88, 1.23]]) {
        const probeY = hasShoulderFill
          ? Math.max(localY, closure.upperShoulderFloorY + 0.01)
          : localY;
        for (const side of [-1, 1]) {
          const origin = hullRig.localToWorld(new THREE.Vector3(side * 1.70, probeY, localZ));
          const direction = new THREE.Vector3(-side, 0, 0).transformDirection(hullRig.matrixWorld);
          const ray = new THREE.Raycaster(origin, direction, 0, 1.1);
          const hits = ray.intersectObject(hull, false);
          assert.ok(hits.length > 0,
            `${id}: ${side < 0 ? 'left' : 'right'} hull is closed beneath the upper glacis at z=${localZ.toFixed(2)}`);
          const localHit = hullRig.worldToLocal(hits[0].point.clone());
          const hitHalfW = Math.abs(localHit.x);
          if (hasShoulderFill) {
            assert.ok(hitHalfW >= expectedHalfW + 0.08
              && hitHalfW <= closure.upperShoulderOuterHalfWMax + 0.04,
            `${id}: lateral sightline closes on the canted shoulder at z=${localZ.toFixed(2)}`);
          } else {
            assert.ok(hitHalfW <= expectedHalfW + 0.04 && hitHalfW >= expectedHalfW - 0.08,
              `${id}: lateral sightline closes on the inter-track infill at z=${localZ.toFixed(2)}`);
          }
        }
      }
    }
  } finally {
    tank.dispose();
  }
}

console.log('leopardHullClosure.selftest: requested Leopard bow undersides are continuous and track-safe');
