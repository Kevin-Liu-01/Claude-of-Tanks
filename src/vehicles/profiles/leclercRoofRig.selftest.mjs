import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const near = (a, b, epsilon = 1e-4) => Math.abs(a - b) <= epsilon;
const hasVertexAtX = (mesh, x, epsilon = 1e-4) => {
  const values = mesh.geometry.attributes.position.array;
  for (let i = 0; i < values.length; i += 3) {
    if (near(values[i], x, epsilon)) return true;
  }
  return false;
};
const hasLongSideRailFace = (mesh, x, epsilon = 1e-4) => {
  const values = mesh.geometry.attributes.position.array;
  for (let i = 0; i + 8 < values.length; i += 9) {
    if (!near(values[i], x, epsilon)
      || !near(values[i + 3], x, epsilon)
      || !near(values[i + 6], x, epsilon)) continue;
    const z0 = values[i + 2];
    const z1 = values[i + 5];
    const z2 = values[i + 8];
    if (Math.max(z0, z1, z2) - Math.min(z0, z1, z2) >= 5.7) return true;
  }
  return false;
};
const localRayHits = (mesh, origin, direction, far = 4) => {
  mesh.updateWorldMatrix(true, false);
  const worldOrigin = mesh.localToWorld(new THREE.Vector3(...origin));
  const worldDirection = new THREE.Vector3(...direction).transformDirection(mesh.matrixWorld);
  return new THREE.Raycaster(worldOrigin, worldDirection, 0, far)
    .intersectObject(mesh, false)
    .map((hit) => mesh.worldToLocal(hit.point.clone()));
};
const expectedTurretPositionCounts = {
  leclerc: 12192,
  leclerc_xlr: 12324,
  amx56: 15060,
};
const removedMarkedSurfacePatches = ['surface-2', 'surface-3', 'surface-4',
  'surface-5', 'surface-6', 'surface-8', 'surface-9', 'surface-15', 'surface-19'];

for (const id of ['leclerc', 'leclerc_xlr', 'amx56']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  await Promise.resolve();

  try {
    tank.root.updateMatrixWorld(true);
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    const hull = hullRig?.getObjectByName('hull');
    const hullDark = hullRig?.getObjectByName('hullDark');
    const turret = turretRig?.getObjectByName('turret');
    assert.ok(hullRig && turretRig && hull && hullDark && turret,
      `${id} retains canonical hull and turret meshes`);

    assert.deepEqual(hullRig.userData.leclercRigFinish, {
      removedLowerSkirtRails: 2,
      hullFixedSideApplique: 2,
    }, `${id} records the deleted skirt rails and hull-fixed applique`);
    assert.deepEqual(turretRig.userData.leclercRoofFinish, {
      highRoofSupportBridges: 2,
      anf1RoofContactY: 0.610,
      anf1BarrelBridge: true,
    }, `${id} records both roof returns and the connected ANF1`);
    assert.deepEqual(turretRig.userData.leclercTurretClosure, {
      centerBrowBridgeBounds: { x: [-0.43, 0.43], y: [0.17, 0.528], z: [1.36, 2.04] },
      forwardRoofBulkheads: 2,
      aftSideWingCores: 2,
      gunnerSightWellPreserved: true,
      removedMarkedSurfacePatches,
    }, `${id} records the shared structural shell beneath its outer turret panels`);
    assert.equal(turret.geometry.attributes.position.count, expectedTurretPositionCounts[id],
      `${id} removes exactly the 36 marked triangles without deleting adjoining turret geometry`);

    const centerHits = localRayHits(turret, [0.25, 0, 1.70], [0, 1, 0], 0.8);
    assert.ok(centerHits.some((point) => near(point.y, 0.17, 0.002)),
      `${id} center brow panel has solid armor immediately beneath it`);
    for (const side of [-1, 1]) {
      const riserHits = localRayHits(turret, [side * 0.72, 0, 1.02], [0, 1, 0], 0.8);
      assert.ok(riserHits.some((point) => near(point.y, 0.20, 0.002)),
        `${id} ${side < 0 ? 'left' : 'right'} forward roof riser closes into the turret core`);
      const wingHits = localRayHits(turret, [side * 1.55, 0.45, -0.66], [-side, 0, 0], 1.0);
      assert.ok(wingHits.some((point) => near(point.x, side * 1.40, 0.002)),
        `${id} ${side < 0 ? 'left' : 'right'} aft roof wing has a full-depth side core`);
    }

    assert.ok(hasVertexAtX(hull, -1.644) && hasVertexAtX(hull, 1.644),
      `${id} side applique is merged into hull-owned armor`);
    assert.ok(!hasVertexAtX(turret, -1.644) && !hasVertexAtX(turret, 1.644),
      `${id} side applique is absent from the traversing turret`);
    assert.ok(!hasLongSideRailFace(hullDark, -1.698)
      && !hasLongSideRailFace(hullDark, 1.698),
      `${id} omits both marked full-length lower side rails`);

    // Probe the new aft returns below the marked roof-cap edges. Before this
    // repair these rays passed through air beneath the two high caps.
    for (const x of [-0.67, 0.67]) {
      const hits = new THREE.Raycaster(
        new THREE.Vector3(x, 2.246, -1.0),
        new THREE.Vector3(0, 0, 1),
        0,
        1,
      ).intersectObject(turret, false);
      assert.ok(hits.some((hit) => near(hit.point.z, -0.70, 0.015)),
        `${id} high-roof cap at x=${x} has a structural return into the autoloader roof`);
    }

    const anf1 = turretRig.getObjectByName('leclercRoofAnf1');
    assert.ok(anf1?.userData.barrelBridge,
      `${id} ANF1 barrel has a receiver-to-barrel bridge`);
    assert.ok(near(anf1.position.y, 0.610) && near(anf1.userData.roofContactY, 0.610),
      `${id} ANF1 pintle foot is seated on the mid roof`);

    if (id === 'leclerc_xlr' || id === 'amx56') {
      assert.deepEqual(turretRig.userData.leclercVariantRoofStations, {
        leftPadCenterX: -0.67,
        rightPadCenterX: 0.67,
        padCenterZ: -0.33,
        roofY: 0.752,
        rightHatchBottomY: 0.752,
      }, `${id} centers both occupied roof stations on the raised pads`);
      const roofCupolas = turretRig.getObjectByName('turretCupola');
      roofCupolas?.geometry.computeBoundingBox();
      const cupolaBounds = roofCupolas?.geometry.boundingBox;
      assert.ok(cupolaBounds && cupolaBounds.min.x < -0.88 && cupolaBounds.max.x > 0.86
        && near((cupolaBounds.min.z + cupolaBounds.max.z) / 2, -0.33, 0.002),
      `${id} physically places both hatch rings around the marked pad centers`);
    }

    if (id === 'leclerc_xlr') {
      assert.deepEqual(turretRig.userData.leclercXlrRoofAssembly, {
        padCenterX: -0.67,
        padCenterZ: -0.33,
        roofY: 0.752,
        shoeBottomY: 0.752,
        shoeTopY: 0.807,
        bodyBottomY: 0.807,
        bodyTopY: 0.987,
        weaponFootY: 0.987,
        weaponRootZ: -0.17,
        shieldRearZ: -0.0372,
        periscopeBottomY: 0.752,
      }, 'Leclerc XLR RWS, weapon, shield, and periscope expose continuous roof contacts');
      const rwsGun = turretRig.getObjectByName('leclercXlrRoofRwsGun');
      assert.ok(rwsGun && near(rwsGun.position.x, -0.67)
        && near(rwsGun.position.y, 0.987) && near(rwsGun.position.z, -0.17),
      'Leclerc XLR weapon is centered over the left pad and advanced into its shield');
      assert.ok(near(rwsGun.userData.mountContactY, 0.987),
        'Leclerc XLR weapon foot records its RWS body-crown contact');
    }

    if (id === 'amx56') {
      assert.deepEqual(turretRig.userData.amx56RoofAssembly, {
        gunnerSightRoofY: 0.610,
        gunnerSightBottomY: 0.610,
        rwsRoofY: 0.752,
        rwsBaseBottomY: 0.752,
        rwsBodyTopY: 1.012,
        rwsWeaponFootY: 1.012,
        rwsPadCenterX: -0.67,
        rwsPadCenterZ: -0.33,
        rwsShieldRearZ: -0.071,
        rwsBodyFrontZ: -0.060,
        rightHatchCenterX: 0.67,
        rightHatchCenterZ: -0.33,
        rightHatchBottomY: 0.752,
        periscopeRoofY: 0.648,
        periscopeBottomY: 0.648,
      }, 'AMX 56 roof sight, RWS, shield, weapon, and periscope expose zero-gap contacts');
      const rwsGun = turretRig.getObjectByName('amx56RoofRwsGun');
      assert.ok(rwsGun && near(rwsGun.position.x, -0.67)
        && near(rwsGun.position.y, 1.012) && near(rwsGun.position.z, -0.23),
      'AMX 56 heavy weapon is centered on the marked pad and meets the RWS body crown');
      assert.ok(near(rwsGun.userData.mountContactY, 1.012),
        'AMX 56 heavy weapon records its structural mount contact');
    }
  } finally {
    tank.dispose();
  }
}

console.log('leclercRoofRig.selftest: fixed applique, removed skirt rails, supported roof, and seated weapon assemblies verified');
