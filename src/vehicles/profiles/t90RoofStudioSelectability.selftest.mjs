import assert from 'node:assert/strict';
import { collectSurfacePickTargets } from '../../gallery/surfaceMarkup.ts';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;

// 2026-10-30 (lane t90-family-266): the earlier T-90 marks build from their source-X twins (their own receipts hold
// their roof weapons); the Burlak prototype keeps its own turret and station.
const ROOF_WEAPONS = Object.freeze({
  t90a_burlak_proto: 't90aBurlakCommanderNsvt',
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

// 2026-10-30 (lane t90-family-266): the forward-deck spare-track runs and the T-90MS's Tagil tower retired with the
// earlier builds; the spare-track ledger (docs/geometry-gate/spare-track.json) holds every run's placement.

console.log('t90RoofStudioSelectability.selftest: the Burlak prototype roof weapon is seated and Gallery-selectable');
