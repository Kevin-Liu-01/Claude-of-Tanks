import assert from 'node:assert/strict';
import { collectSurfacePickTargets } from '../../gallery/surfaceMarkup.ts';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;

const ROOF_WEAPONS = Object.freeze({
  t90_1992: 't90Ru417AutomatedKord',
  t90a_2004: 't90aRemoteNsvt',
  t90sm_2013: 't90smRemoteNsvt',
  // 2026-10-30 (lane t90-family-266): obr. 2006 is the shared T-90A build; the MS, AM and AM II carry the AM-type
  // turret's station.
  t90a_2006: 't90aRemoteNsvt',
  t90a_burlak_proto: 't90aBurlakCommanderNsvt',
  t90ms_2011: 't90smRemoteNsvt',
  t90am: 't90smRemoteNsvt',
  t90m_proryv: 't90smRemoteNsvt',
});

for (const [id, weaponName] of Object.entries(ROOF_WEAPONS)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const weapon = turret?.getObjectByName(weaponName);
    assert.ok(weapon, `${id}: exposes the screenshot-identified roof weapon by name`);
    assert.equal(weapon?.userData.fittingRoot, true,
      `${id}: roof weapon remains one semantic fitting assembly`);
    assert.equal(weapon?.userData.surfaceMarkupSelectable, true,
      `${id}: roof weapon assembly opts into Gallery surface markup`);

    const pickTargets = new Set(collectSurfacePickTargets(tank.root));
    const weaponMeshes = [];
    weapon?.traverse((node) => {
      if (node.isMesh && node.visible) weaponMeshes.push(node);
    });
    assert.ok(weaponMeshes.length >= 2,
      `${id}: roof weapon retains separately selectable painted and gunmetal surfaces`);
    for (const mesh of weaponMeshes) {
      assert.ok(mesh.name && mesh.name !== 'Mesh',
        `${id}: every roof weapon primitive has a stable semantic name`);
      assert.equal(mesh.userData.surfaceMarkupSelectable, true,
        `${id}: ${mesh.name} is explicitly marked as a Gallery surface`);
      assert.ok(pickTargets.has(mesh),
        `${id}: ${mesh.name} is present in the live Gallery raycast target set`);
    }
  } finally {
    tank.dispose();
  }
}

for (const id of ['t90_1992', 't90a_2004', 't90a_burlak_proto', 't90sm_2013', 't90ms_2011']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const tracks = [];
    tank.root.traverse((node) => {
      if (node.userData?.fittingRoot && node.userData?.fitting === 'spareTrackLinks') tracks.push(node);
    });
    assert.ok(tracks.length > 0, `${id}: exposes at least one spare-track fitting run`);

    const pickTargets = new Set(collectSurfacePickTargets(tank.root));
    for (const trackRun of tracks) {
      const receipt = trackRun.userData.horizontalPlateSeatReceipt;
      assert.ok(receipt, `${id}: spare-track run publishes its plate-seat receipt`);
      assert.ok(Math.abs(receipt.seatedBottomY - (receipt.planeY - receipt.embedM)) <= EPSILON,
        `${id}: spare-track underside is seated into its supporting plate`);
      trackRun.traverse((node) => {
        if (!node.isMesh || !node.visible) return;
        assert.ok(pickTargets.has(node), `${id}: spare-track primitive is Gallery-selectable`);
        assert.equal(node.userData.surfaceMarkupSelectable, true,
          `${id}: spare-track primitive carries explicit markup semantics`);
      });
    }
  } finally {
    tank.dispose();
  }
}

// 2026-10-30 (lane t90-family-266): the T-90MS's private Tagil tower retired with its Shtora-turret rebuild; the MS
// carries the AM-type turret's station, checked with the other roof weapons above.

console.log('t90RoofStudioSelectability.selftest: roof weapons and spare tracks are seated and Gallery-selectable');
