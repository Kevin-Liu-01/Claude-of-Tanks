import assert from 'node:assert/strict';
import { collectSurfacePickTargets } from '../../gallery/surfaceMarkup.ts';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;

const ROOF_WEAPONS = Object.freeze({
  t90sm: 't90smRemoteNsvt',
  t90a_vladimir: 't90aVladimirRemoteKord',
  t90a_burlak: 't90aBurlakCommanderNsvt',
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
      `${id}: roof weapon assembly opts into Studio surface markup`);

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
        `${id}: ${mesh.name} is explicitly marked as a Studio surface`);
      assert.ok(pickTargets.has(mesh),
        `${id}: ${mesh.name} is present in the live Studio raycast target set`);
    }
  } finally {
    tank.dispose();
  }
}

for (const id of ['t90', 't90a', 't90a_burlak', 't90sm', 't90ms']) {
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
        assert.ok(pickTargets.has(node), `${id}: spare-track primitive is Studio-selectable`);
        assert.equal(node.userData.surfaceMarkupSelectable, true,
          `${id}: spare-track primitive carries explicit markup semantics`);
      });
    }
  } finally {
    tank.dispose();
  }
}

{
  const tank = createTank('t90ms', null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const tower = turret?.getObjectByName('t90msTagilWeaponTower');
    assert.ok(tower, 't90ms: exposes one coherent named Tagil weapon-tower assembly');
    const pickTargets = new Set(collectSurfacePickTargets(tank.root));
    const names = new Set();
    tower?.traverse((node) => {
      if (!node.isMesh) return;
      names.add(node.name);
      assert.equal(node.userData.combatHitboxRole, 'equipment',
        `t90ms: ${node.name} remains external equipment rather than turret armor`);
      assert.ok(pickTargets.has(node), `t90ms: ${node.name} is Studio-selectable`);
    });
    assert.ok(names.has('t90msTagilTowerAlignedArmoredHead'),
      't90ms: selected armored head rises from the exact marked support interface');
    assert.ok(names.has('t90msTagilTowerThermalWindow'),
      't90ms: tower includes its thermal optic');
    assert.ok(names.has('t90msTagilTowerDayWindow'),
      't90ms: tower includes its day optic');
    assert.ok(names.has('t90msTagilTowerWorkLight'),
      't90ms: tower includes a protected work light');
    assert.ok(names.has('t90msTagilTowerAmmoBox'),
      't90ms: tower includes its ammunition box');
    assert.equal([...names].filter((name) => name.startsWith('t90msTagilTowerFeedLink')).length, 7,
      't90ms: tower exposes seven selectable ammunition-feed links');
  } finally {
    tank.dispose();
  }
}

console.log('t90RoofStudioSelectability.selftest: roof weapons, spare tracks, and Tagil tower are seated and Studio-selectable');
