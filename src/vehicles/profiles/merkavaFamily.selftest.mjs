// Release 262 (the owner 2026-10-27: "redesign and clean up the merkava mk 1b, 2b, 2d, baz, mk 3c, and mk 4b, completely
// new with all oldness removed and we will need their gun assemblies back and beautiful"): the six marks the Merkava
// family builder draws (profiles/merkava.ts over merkavaFamilyMarks.ts). Each mark:
//  - runs six road wheels a side on the suspension (their dished faces riding them under travel) and five return rollers;
//  - draws its gun to the published length gun forward (the muzzle that far ahead of the stern), its barrel a sleeved
//    tube with its evacuator, its mantlet, collar and over-gun machine gun riding rig_gun and elevating with it, the
//    barrel itself recoiling (rig_recoil);
//  - registers the spec's two removable turret packages where the mark carried add-on turret armour (the Mk 2B's screens,
//    the Mk 2D's Dor Dalet boxes, the Mk 3's and Mk 4's bolted modules), and none on the Mk 1B, which carried none
//    (docs/references/tanks/merkava1b.md);
//  - publishes the family receipt (merkavaFamilyReceipt).
// It replaces the old pile's fit receipts (merkava1bFit, merkava2Fit, merkava3Fit, merkavaGunCradle, merkavaRunningGear,
// merkavaEraFinish, merkava4bGeometry), which pinned the retired oracle-fit geometry.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import { MERKAVA_MARKS } from './merkavaFamilyMarks.ts';

// published hull length and length gun forward (docs/references/tanks/<id>.md)
const PUBLISHED = Object.freeze({
  merkava1b: [7.45, 8.63], merkava2b: [7.45, 8.63], merkava2d: [7.45, 8.63],
  merkava3c: [7.60, 9.04], merkava3_baz: [7.60, 9.04], merkava4b: [7.60, 9.04],
});
const PACKAGES = Object.freeze({
  merkava1b: false, merkava2b: true, merkava2d: true, merkava3c: true, merkava3_baz: true, merkava4b: true,
});
assert.deepEqual(Object.keys(MERKAVA_MARKS).sort(), Object.keys(PUBLISHED).sort(), 'the family draws exactly the six marks');

const world = (object, local) => object.localToWorld(local.clone());
for (const id of Object.keys(PUBLISHED)) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const root = visual.root, hull = root.getObjectByName('rig_hull'), turret = root.getObjectByName('rig_turret');
    const gun = root.getObjectByName('rig_gun'), recoil = root.getObjectByName('rig_recoil');
    assert.ok(hull && turret && gun && recoil, `${id}: hull, turret, gun and recoil rigs`);
    const receipt = hull.userData.merkavaFamilyReceipt;
    assert.equal(receipt?.revision, 'merkava-family-262-r1', `${id}: the family receipt`);
    assert.equal(receipt.mark, id);

    // running gear
    const tires = root.getObjectByName('gearRoadWheelTires');
    assert.ok(tires?.isInstancedMesh, `${id}: road wheels are instanced`);
    assert.equal(tires.count, 12, `${id}: six road wheels a side`);
    const rollers = root.getObjectByName('gearReturnRollerTires') ?? root.getObjectByName('gearReturnRollerRotors');
    assert.equal(rollers?.count, 10, `${id}: five return rollers a side`);
    const faces = [];
    root.traverse((o) => { if (o.userData.dynamicWheelFace) faces.push(o); });
    assert.ok(faces.length >= 3, `${id}: the dished wheel faces are suspension-driven layers`);
    const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
    visual.setGroundSampler((x, z) => Math.sin(z * 1.7) * 0.11 + x * 0.015);
    for (let frame = 0; frame < 24; frame++) visual.syncFromState(state, 1 / 60);
    const a = new THREE.Matrix4(), b = new THREE.Matrix4(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
    for (const layer of faces) {
      for (let i = 0; i < tires.count; i++) {
        tires.getMatrixAt(i, a); layer.getMatrixAt(i, b);
        pa.setFromMatrixPosition(a); pb.setFromMatrixPosition(b);
        assert.ok(Math.abs(pa.y - pb.y) < 1e-6 && Math.abs(pa.z - pb.z) < 1e-6, `${id}: ${layer.name} rides wheel ${i}`);
      }
    }

    // the gun to the published length gun forward: the muzzle that far ahead of the stern plate
    root.updateMatrixWorld(true);
    const [hullLength, overall] = PUBLISHED[id];
    const muzzle = root.getObjectByName('rig_muzzle');
    assert.ok(muzzle, `${id}: muzzle anchor`);
    const muzzleZ = world(muzzle, new THREE.Vector3()).z, stern = -hullLength / 2;
    assert.ok(Math.abs(muzzleZ - stern - overall) < 0.02,
      `${id}: the muzzle stands ${overall} m ahead of the stern (${(muzzleZ - stern).toFixed(3)} m)`);
    const gunMesh = recoil.getObjectByName('gun');
    assert.ok(gunMesh?.isMesh, `${id}: the barrel recoils (rig_recoil)`);
    const g = receipt.gun, mark = MERKAVA_MARKS[id];
    const radii = mark.gun.barrel.map(([, r]) => r), muzzleR = radii[radii.length - 2];
    assert.ok(g.outerRadiusM > muzzleR * 1.5, `${id}: the evacuator stands proud of the tube (${g.outerRadiusM} vs ${muzzleR})`);
    assert.ok(g.muzzleZM > 3.0, `${id}: a full-length barrel ahead of the trunnion (${g.muzzleZM.toFixed(2)} m)`);
    const caliber = { M64: 105, MG251: 120, MG253: 120 }[g.model];
    assert.equal(g.caliberMm, caliber, `${id}: ${g.model} is ${caliber} mm`);
    // (the specs of all six still fire the Mk 4 donor's 120 mm rounds; the Mk 1B, 2B and 2D's 105 mm M64 ammunition is
    // an owner decision reported with release 262, so the spec's calibre is not held here)

    // the gun housing rides rig_gun and elevates with it
    for (const name of ['gunMount', 'gunMountDark']) {
      const part = root.getObjectByName(name);
      let owner = part?.parent;
      while (owner && owner !== gun) owner = owner.parent;
      assert.ok(owner === gun, `${id}: ${name} is owned by rig_gun`);
    }
    const mount = root.getObjectByName('gunMount');
    mount.geometry.computeBoundingBox();
    const probe = mount.geometry.boundingBox.getCenter(new THREE.Vector3());
    probe.z = mount.geometry.boundingBox.max.z;
    const level = world(mount, probe);
    gun.rotation.x = -THREE.MathUtils.degToRad(20);
    root.updateMatrixWorld(true);
    assert.ok(level.distanceTo(world(mount, probe)) > 0.05, `${id}: the mantlet follows a 20-degree elevation`);
    gun.rotation.x = 0;
    assert.equal(Boolean(root.getObjectByName('merkavaOverGunM2')), mark.gun.overGunMachineGun,
      `${id}: the 12.7 mm over the gun where the mark carried it`);

    // removable turret packages
    const names = root.userData.eraClusterNames ?? [];
    const sectors = ['R', 'L'].map((s) => `merkava_${tankSeedId(id)}_turret_era_${s}`);
    if (PACKAGES[id]) {
      for (const s of sectors) assert.ok(names.includes(s), `${id}: registers its add-on turret package ${s}`);
    } else {
      for (const s of sectors) assert.ok(!names.includes(s), `${id}: draws no add-on turret armour (the Mk 1B carried none)`);
    }
  } finally {
    visual.dispose?.();
  }
}
console.log('merkavaFamily.selftest: six marks — six wheels and five rollers a side, guns to the published length on rig_gun, '
  + 'add-on turret packages where the marks carried them PASS');
