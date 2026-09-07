import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { SOURCE_X_IDS, SOURCE_X_DONORS, synchronizeSourceXCombatMetadata } from './sourceXFleetSpecs.ts';

const donorArmor = new Map(SOURCE_X_IDS.map(id => [id,
  structuredClone(getSpec(SOURCE_X_DONORS[id]).armor)]));
const frames = SOURCE_X_IDS.map(id => {
  const armor = getSpec(id).armor;
  return structuredClone([armor.turretPivot, armor.gunPivot, armor.gunBarrel]);
});
// A later combat balance synchronization must not restore donor visual pivots.
synchronizeSourceXCombatMetadata();
synchronizeSourceXCombatMetadata();
for (const [i, id] of SOURCE_X_IDS.entries()) {
  const armor = getSpec(id).armor;
  assert.deepEqual([armor.turretPivot, armor.gunPivot, armor.gunBarrel], frames[i]);
  assert.deepEqual(getSpec(SOURCE_X_DONORS[id]).armor, donorArmor.get(id), 'donors are untouched');
}

function assertFrame(tank, spec, turret, gun) {
  const close = (a, b, label) => assert.ok(a.distanceTo(b) < 1e-8, label);
  close(turret.position, new THREE.Vector3(...spec.armor.turretPivot), 'visible yaw matches combat yaw');
  close(gun.position, new THREE.Vector3(...spec.armor.gunPivot), 'visible trunnion matches combat trunnion');
  const rotation = new THREE.Quaternion();
  for (const yaw of [-2.3, 0, 1.7]) for (const pitch of [-spec.gunDepressionDeg, 0, spec.gunElevationDeg]) {
    turret.rotation.y = yaw;
    gun.rotation.x = -pitch * Math.PI / 180;
    tank.root.updateMatrixWorld(true);
    const expected = new THREE.Vector3(0, 0, spec.armor.gunBarrel.lengthM)
      .applyQuaternion(rotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), gun.rotation.x))
      .add(new THREE.Vector3(...spec.armor.gunPivot))
      .applyQuaternion(rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
      .add(new THREE.Vector3(...spec.armor.turretPivot));
    tank.root.localToWorld(expected);
    close(tank.gunMuzzleWorld(new THREE.Vector3()), expected, 'rendered muzzle follows canonical combat frame');
  }
  turret.rotation.y = 0;
  gun.rotation.x = 0;
}

function gap(a, b) {
  return Math.hypot(...['x', 'y', 'z'].map(axis => Math.max(0,
    a.min[axis] - b.max[axis], b.min[axis] - a.max[axis])));
}

// Focused form of the unchanged full-fleet gunArticulation contract. This
// diagnoses all new IDs at both LODs before the slower complete release suite.
const failures = [];
for (const id of SOURCE_X_IDS) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false, camoSeed: 4242 });
  try {
    const spec = getSpec(id), root = tank.root;
    const turret = root.getObjectByName('rig_turret');
    const gun = root.getObjectByName('rig_gun');
    assertFrame(tank, spec, turret, gun);
    const recoil = root.getObjectByName('rig_recoil');
    const mount = gun?.getObjectByName('gunMount');
    assert.equal(gun?.parent, turret, 'gun pitches under turret');
    assert.equal(recoil?.parent, gun, 'barrel recoils under gun');
    assert.ok(mount?.isMesh && mount.geometry.attributes.position.count > 0,
      'real visible pitching gunMount mesh required');
    const geometry = mount.geometry;
    for (const pitch of [-spec.gunDepressionDeg, 0, spec.gunElevationDeg]) {
      gun.rotation.x = -pitch * Math.PI / 180;
      root.updateMatrixWorld(true);
      const a = new THREE.Box3().setFromObject(mount, true);
      const b = new THREE.Box3().setFromObject(recoil, true);
      const c = new THREE.Box3().setFromObject(turret.getObjectByName('turret'), true);
      assert.ok(gap(a, b) <= .10, `barrel attachment gap ${gap(a, b)} at ${pitch}deg`);
      assert.ok(gap(a, c) <= .125, `turret attachment gap ${gap(a, c)} at ${pitch}deg`);
      assert.equal(mount.geometry, geometry, 'pitch does not reconstruct geometry');
    }
  } catch (error) { failures.push(`${id}/${quality}: ${error.message}`); }
  finally { tank.dispose(); }
}
assert.deepEqual(failures, [], failures.join('\n'));
console.log('sourceXArticulation: 13 new tanks × high/low detail keep real pitching mounts seated throughout legal elevation');
