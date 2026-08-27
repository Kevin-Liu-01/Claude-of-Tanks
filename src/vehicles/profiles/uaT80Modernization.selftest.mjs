import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const variants = [
  ['ua_t80bv', 't80bv-ua-t90-style', 'uaT80ModernKord_bv'],
  ['ua_t80u_kursk', 't80u-kursk-t90-style', 'uaT80ModernKord_kursk'],
];

for (const [id, receipt, weaponName] of variants) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const turretRig = tank.root.getObjectByName('rig_turret');
    const shell = turretRig?.getObjectByName('turret');
    const externalArmor = turretRig?.getObjectByName('turretExternalArmor');
    const equipment = turretRig?.getObjectByName('turretEquipment');
    const rws = turretRig?.getObjectByName(weaponName);
    const frontERA = turretRig?.userData.uaT80FrontERAReceipt;

    assert.ok(turretRig && shell?.isMesh && externalArmor?.isMesh && equipment?.isMesh,
      `${id}: modern turret retains structural and equipment ownership`);
    assert.equal(turretRig.userData.uaT80ModernizationSuite, receipt,
      `${id}: modernization suite is explicitly receipted`);
    assert.ok(rws?.isGroup && rws.parent === turretRig,
      `${id}: Kord RWS yaws with the turret`);
    assert.deepEqual(frontERA, {
      family: 'ua-t80-faceted-t90-front-r2',
      paintedArmorOnly: true,
      cheekCassettes: 20,
      mantletCassettes: 2,
      shoulderReturnCassettes: 6,
    }, `${id}: frontal T-90-style ERA has the complete receipted cassette set`);
    assert.equal(turretRig.getObjectByName('turretTrack'), undefined,
      `${id}: obsolete spare-track-steel frontal blocks are removed`);

    shell.geometry.computeBoundingBox();
    externalArmor.geometry.computeBoundingBox();
    equipment.geometry.computeBoundingBox();
    assert.ok(externalArmor.geometry.boundingBox.max.z >= 1.70,
      `${id}: faceted carrier and ERA stand proud of the cast dome`);
    assert.ok(externalArmor.material?.map,
      `${id}: faceted ERA uses continuous vehicle-scale camouflage`);
    assert.ok(shell.geometry.boundingBox.min.z <= -1.77,
      `${id}: welded bustle overlaps the cast turret core`);
    assert.ok(equipment.geometry.boundingBox.min.z <= -1.98,
      `${id}: three-sided service basket populates the rear silhouette`);
    assert.ok(equipment.geometry.getAttribute('position').count >= 4500,
      `${id}: roof, optics, stowage and basket retain modern equipment density`);

    // All new hardware must keep turret ownership through articulation.
    for (const yaw of [0, Math.PI / 2]) {
      turretRig.rotation.y = yaw;
      tank.root.updateMatrixWorld(true);
      const rwsWorld = rws.getWorldPosition(new THREE.Vector3());
      const pivotWorld = turretRig.getWorldPosition(new THREE.Vector3());
      assert.ok(rwsWorld.distanceTo(pivotWorld) < 2.25,
        `${id}: RWS remains attached through yaw ${yaw}`);
    }

    if (id === 'ua_t80u_kursk') {
      assert.equal(turretRig.userData.uaRearTubeAxis, 'x',
        'ua_t80u_kursk: rear snorkel is transverse, not fore-aft');
    }
  } finally {
    tank.dispose();
  }
}

console.log('uaT80Modernization.selftest: T-90-style turret suites and transverse Kursk snorkel verified');
