import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// 2026-09-30 (884384729 controls integration, 4c34b3e8b owner's remote roof weapons): all four source weapons are
// remote stations on the turret. T-90M/SM wrap the exact fitting in their station's pitch group; the T-90A and
// Vladimir NSVTs (sourceMachineGun with a station datum) mark the station root itself as the exact fitting and carry
// the merged receiver/tube group under its pitch group, with the real bracket stock as yaw support.
const SOURCE_AXES = [
  ['t90a_x', 't90aRemoteNSVT', .632, 2.656, 1.527],
  ['t90a_vladimir_x', 'vladimirRemoteNSVT', -.6125, 2.7254, 1.83385],
  ['t90m_x', 'modernMRws', -.154, 2.763, -.132],
  ['t90sm_x', 'modernSmRws', .584, 3.035, -.533],
];
for (const quality of ['high', 'low']) for (const [id, stationName, x, y, muzzleZ] of SOURCE_AXES) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
  const disposals = [];
  try {
    tank.root.updateMatrixWorld(true);
    const station = tank.root.getObjectByName(stationName);
    assert.ok(station?.userData.remoteControlled && station.parent?.name === 'rig_turret',
      `${id}: remote weapon station on the turret`);
    const pitch = station.children.find(child => child.name === 'auxiliaryWeaponPitch');
    const weapon = pitch?.children.find(child => child.userData.barrelAxisLocal);
    const exact = tank.root.getObjectByName('fitting_pintleMG_exact');
    const fitting = exact ?? station;
    assert.ok(fitting?.userData.fittingRoot && fitting.userData.fittingExact, `${id}: actual exact weapon fitting`);
    if (exact) assert.equal(exact, weapon, `${id}: the exact fitting is the pitching weapon`);
    else assert.ok(weapon, `${id}: the exact station carries the pitching weapon`);
    assert.deepEqual(weapon.userData.barrelAxisLocal, [0, 0, 1]);
    assert.equal(weapon.userData.barrelElevationRad, 0);
    let weaponMeshes = 0, triangles = 0;
    weapon.traverse(node => {
      if (!node.isMesh) return;
      weaponMeshes++;
      triangles += node.geometry.attributes.position.count/3;
      assert.equal(node.userData.fitting, 'pintleMG');
      assert.equal(node.userData.combatHitboxRole, 'equipment');
      assert.equal(node.visible, true);
    });
    fitting.traverse(node => {
      if (!node.isMesh) return;
      assert.equal(node.userData.combatHitboxRole, 'equipment', `${id}/${node.name}: station stock is equipment`);
      assert.equal(node.visible, true);
      const counter = { calls: 0 };
      node.geometry.addEventListener('dispose', () => counter.calls++);
      disposals.push(counter);
    });
    assert.equal(weaponMeshes, 2, `${id}: merged receiver, tube and real support parts; no marker-only census`);
    assert.ok(triangles > 100);
    const hit = new THREE.Raycaster(new THREE.Vector3(x, y, 2.2), new THREE.Vector3(0, 0, -1))
      .intersectObject(fitting, true)[0];
    assert.ok(Math.abs(hit?.point.z-muzzleZ) < .001, `${id}: source tube endpoint remains seated on its actual axis`);
  } finally { tank.dispose(); }
  assert.ok(disposals.every(counter => counter.calls === 1), `${id}: each exact fitting geometry is disposed exactly once`);
}
console.log('sourceMachineGun: four visible exact weapons, source axes, real rig ownership and disposal pass high/low');
