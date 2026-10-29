// Release 262 (the owner 2026-10-27: "redesign and clean up the merkava mk 1b, 2b, 2d, baz, mk 3c, and mk 4b, completely
// new with all oldness removed and we will need their gun assemblies back and beautiful"; then, of the supplied Mk 1B,
// 2B, 2D, 3C, 3D and 4B source models: "need to match the geometry of these"): the six marks the Merkava family builder
// draws (profiles/merkava.ts over merkavaFamilyMarks.ts and the source fit, merkavaFamilySource.ts). Each mark, at HIGH
// and LOW detail:
//  - runs six road wheels a side at the source's wheel stations, its dished faces riding them under travel, and the
//    source's return rollers;
//  - draws its gun to the source's muzzle (the M64 105 mm on the Mk 1 and Mk 2, the MG25x 120 mm on the Mk 3 and Mk 4),
//    its barrel a sleeved tube with its evacuator, its mantlet and coaxial port riding rig_gun and elevating with it, the
//    12.7 mm over the gun where the source mounts one, the barrel itself recoiling (rig_recoil);
//  - registers the spec's two removable turret packages over the source's add-on turret armour; stripping both leaves the
//    cast shell (the permanent backing) whole, and a reset restores them;
//  - carries its bustle basket's measured floor with the fleet's chests and cans on it inside its rails, the basket's
//    volume reserved from the decor;
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
import { MERKAVA_SOURCE } from './merkavaFamilySource.ts';

const GUN = Object.freeze({
  merkava1b: 'M64', merkava2b: 'M64', merkava2d: 'M64', merkava3c: 'MG25x', merkava3_baz: 'MG25x', merkava4b: 'MG25x',
});
assert.deepEqual(Object.keys(MERKAVA_MARKS).sort(), Object.keys(GUN).sort(), 'the family draws exactly the six marks');

const world = (object, local) => object.localToWorld(local.clone());
const sorted = (values) => [...values].sort((a, b) => a - b);
for (const id of Object.keys(GUN)) {
  for (const quality of ['high', 'low']) {
    const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
    const at = `${id} (${quality})`;
    try {
      const root = visual.root, hull = root.getObjectByName('rig_hull'), turret = root.getObjectByName('rig_turret');
      const gun = root.getObjectByName('rig_gun'), recoil = root.getObjectByName('rig_recoil');
      assert.ok(hull && turret && gun && recoil, `${at}: hull, turret, gun and recoil rigs`);
      const receipt = hull.userData.merkavaFamilyReceipt;
      assert.equal(receipt?.revision, 'merkava-family-262-r5', `${at}: the family receipt`);
      assert.equal(receipt.mark, id);
      const mark = MERKAVA_MARKS[id], source = MERKAVA_SOURCE[id].record;

      // running gear at the source's stations
      root.updateMatrixWorld(true);
      const tires = root.getObjectByName('gearRoadWheelTires');
      assert.ok(tires?.isInstancedMesh, `${at}: road wheels are instanced`);
      assert.equal(tires.count, 12, `${at}: six road wheels a side`);
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), zs = new Set();
      for (let i = 0; i < tires.count; i++) { tires.getMatrixAt(i, m); zs.add(Math.round(p.setFromMatrixPosition(m).z * 1000) / 1000); }
      assert.deepEqual(sorted(zs), sorted(source.gear.wheelZs.map((z) => Math.round(z * 1000) / 1000)),
        `${at}: the road wheels stand at the source's stations`);
      const rollers = root.getObjectByName('gearReturnRollerTires') ?? root.getObjectByName('gearReturnRollerRotors');
      assert.equal(rollers?.count, mark.gear.rollers.length * 2, `${at}: the source's return rollers on both sides`);
      const faces = [];
      root.traverse((o) => { if (o.userData.dynamicWheelFace) faces.push(o); });
      assert.ok(faces.length >= 3, `${at}: the dished wheel faces are suspension-driven layers`);
      const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
      visual.setGroundSampler((x, z) => Math.sin(z * 1.7) * 0.11 + x * 0.015);
      for (let frame = 0; frame < 24; frame++) visual.syncFromState(state, 1 / 60);
      const a = new THREE.Matrix4(), b = new THREE.Matrix4(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
      for (const layer of faces) {
        for (let i = 0; i < tires.count; i++) {
          tires.getMatrixAt(i, a); layer.getMatrixAt(i, b);
          pa.setFromMatrixPosition(a); pb.setFromMatrixPosition(b);
          assert.ok(Math.abs(pa.y - pb.y) < 1e-6 && Math.abs(pa.z - pb.z) < 1e-6, `${at}: ${layer.name} rides wheel ${i}`);
        }
      }

      // the gun to the source's muzzle (turret and gun at rest)
      turret.rotation.y = 0; gun.rotation.x = 0;
      root.updateMatrixWorld(true);
      const muzzle = root.getObjectByName('rig_muzzle');
      assert.ok(muzzle, `${at}: muzzle anchor`);
      const muzzleZ = world(muzzle, new THREE.Vector3()).z - world(hull, new THREE.Vector3()).z;
      const sourceMuzzle = source.barrel[source.barrel.length - 1][0];
      assert.ok(Math.abs(muzzleZ - sourceMuzzle) < 0.01, `${at}: the muzzle at the source's z ${sourceMuzzle} (${muzzleZ.toFixed(3)})`);
      const gunMesh = recoil.getObjectByName('gun');
      assert.ok(gunMesh?.isMesh, `${at}: the barrel recoils (rig_recoil)`);
      const g = receipt.gun, radii = mark.gun.barrel.map(([, r]) => r), muzzleR = radii[radii.length - 2];
      assert.equal(g.model, GUN[id], `${at}: the ${GUN[id]} gun`);
      assert.ok(g.outerRadiusM > muzzleR * 1.5, `${at}: the evacuator stands proud of the tube (${g.outerRadiusM} vs ${muzzleR})`);
      assert.ok(g.muzzleZM > 3.0, `${at}: a full-length barrel ahead of the trunnion (${g.muzzleZM.toFixed(2)} m)`);
      assert.ok(g.barrelStations >= 12, `${at}: the barrel follows the source's measured profile (${g.barrelStations} stations)`);
      // (the specs of all six still fire the Mk 4 donor's 120 mm rounds; the Mk 1B, 2B and 2D's 105 mm M64 ammunition is
      // an owner decision reported with release 262, so the spec's calibre is not held here)

      // the gun housing rides rig_gun and elevates with it
      for (const name of ['gunMount', 'gunMountDark']) {
        let owner = root.getObjectByName(name)?.parent;
        while (owner && owner !== gun) owner = owner.parent;
        assert.ok(owner === gun, `${at}: ${name} is owned by rig_gun`);
      }
      const mount = root.getObjectByName('gunMount');
      mount.geometry.computeBoundingBox();
      // the mount's corner farthest from the trunnion (the Mk 1 and Mk 2's gun mask sits at the trunnion, in the nose slot)
      const { min, max } = mount.geometry.boundingBox;
      const probe = new THREE.Vector3(Math.abs(min.x) > max.x ? min.x : max.x, Math.abs(min.y) > max.y ? min.y : max.y,
        Math.abs(min.z) > max.z ? min.z : max.z);
      const level = world(mount, probe);
      gun.rotation.x = -THREE.MathUtils.degToRad(20);
      root.updateMatrixWorld(true);
      assert.ok(level.distanceTo(world(mount, probe)) > 0.05, `${at}: the mantlet follows a 20-degree elevation`);
      gun.rotation.x = 0;
      root.updateMatrixWorld(true);
      assert.equal(g.overGun, mark.gun.overGun?.m2 ? 'm2' : 'none', `${at}: the over-gun mount as measured`);
      assert.equal(Boolean(root.getObjectByName('merkavaOverGunM2')), g.overGun === 'm2',
        `${at}: the 12.7 mm over the gun where the source mounts it`);

      // removable turret packages over the cast shell
      const names = root.userData.eraClusterNames ?? [];
      const sectors = ['R', 'L'].map((s) => `merkava_${tankSeedId(id)}_turret_era_${s}`);
      for (const s of sectors) assert.ok(names.includes(s), `${at}: registers its add-on turret package ${s}`);
      const shell = turret.getObjectByName('turret');
      assert.ok(shell?.isMesh, `${at}: the cast shell`);
      shell.geometry.computeBoundingBox();
      const shellBox = shell.geometry.boundingBox.clone(), shellVerts = shell.geometry.attributes.position.count;
      for (const s of sectors) assert.equal(visual.stripEra(s), true, `${at}: ${s} strips`);
      shell.geometry.computeBoundingBox();
      assert.equal(shell.geometry.attributes.position.count, shellVerts, `${at}: the shell stays whole under spent packages`);
      assert.ok(shell.geometry.boundingBox.equals(shellBox), `${at}: the shell's extent is unchanged by spent packages`);
      assert.equal(visual.resetEra(), true, `${at}: the packages reset`);

      // the bustle basket (the owner 2026-10-29: "fix the bustles and replace the stuff in them with our actual
      // decorations"): its measured floor, the fleet's chests and cans on it inside its rails, the decor kept out of it
      assert.ok(mark.basket?.plates.length, `${at}: the basket's measured floor`);
      assert.ok(mark.load.length >= 4 && mark.load.some((piece) => piece[0] === 'chest'),
        `${at}: the basket carries chests and cans (${mark.load.length} pieces)`);
      const bars = mark.basket.bars, xs = bars.flatMap((b) => [b[0], b[3]]), bz = bars.flatMap((b) => [b[2], b[5]]);
      for (const [kind, x, , z] of mark.load) {
        assert.ok(x > Math.min(...xs) && x < Math.max(...xs) && z > Math.min(...bz) && z < Math.max(...bz),
          `${at}: the ${kind} at ${x.toFixed(2)}, ${z.toFixed(2)} stands inside the basket's rails`);
      }
      assert.ok((turret.userData.decorReservedBoxes ?? []).length, `${at}: the basket's volume is reserved from the decor`);
    } finally {
      visual.dispose?.();
    }
  }
}
console.log('merkavaFamily.selftest: six marks at HIGH and LOW — wheels at the source stations, guns to the source muzzle '
  + 'on rig_gun, removable turret packages over a permanent shell, the field stowage in the basket PASS');
