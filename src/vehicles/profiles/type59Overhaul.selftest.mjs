// Release 262 (owner 2026-10-27: "based on proper historical referrences so they will no longer look so chungus", then
// "make the type 59 be based on a type 55 which we should add to russia. match the geometries well"): the Type 59 and the
// new T-55A share the T-54/T-55 family construction measured from the owner's T-55A (profiles/t54Family.ts,
// docs/references/tanks/t55a.md, type59.md §262). The r3 refit (the widened obr-1975 chassis at a 0.855 rig scale, skirt
// and turret cassettes, the oversized searchlight) is retired; its receipt is replaced by this one.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const near = (value, expected, epsilon = 1e-6) => Math.abs(value - expected) <= epsilon;

/** World bounds of every mesh under `root` (instanced meshes per instance), optionally skipping a subtree. */
function bounds(root, skip = null, filter = () => true) {
  const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), mi = new THREE.Matrix4();
  const inside = (o) => { for (let q = o; q; q = q.parent) if (q === skip) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || (skip && inside(o)) || !filter(o)) return;
    const pos = o.geometry.getAttribute('position');
    const count = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < count; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m.multiplyMatrices(o.matrixWorld, mi); } else m.copy(o.matrixWorld);
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    }
  });
  return box;
}

for (const id of ['type59', 't55a']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const spec = getSpec(id);
    const hull = tank.root.getObjectByName('rig_hull');
    const turret = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    assert.ok(hull && turret && gun, `${id} keeps independent hull, turret and gun rigs`);
    assert.deepEqual([spec.dims.hullLengthM, spec.dims.overallLengthM, spec.dims.widthM],
      [6.04, 9.00, 3.27], `${id}: spec carries the published T-54/T-55 dimensions`);
    for (const rig of [hull, turret]) {
      assert.ok(near(rig.scale.x, 1) && near(rig.scale.y, 1) && near(rig.scale.z, 1), `${id}: ${rig.name} is authored at full size`);
    }
    const hullReceipt = hull.userData.t54FamilyReceipt, turretReceipt = turret.userData.t54FamilyReceipt;
    assert.equal(hullReceipt?.variant, id, `${id}: the hull is the T-54/T-55 family construction`);
    assert.equal(turretReceipt?.variant, id, `${id}: the turret is the T-54/T-55 family construction`);
    assert.equal(hullReceipt.oracleScale, 1.15, `${id}: datums measured from the owner's T-55A at one uniform scale`);

    // Running gear: five 0.81 m wheels a side with the wide first gap, a 0.60 m course on a 2.65 m gauge, no rollers.
    const gear = hull.userData.runningGearReceipts?.[0];
    assert.equal(hull.userData.nativeRoadWheelStations, 5, `${id}: five road-wheel stations a side`);
    assert.deepEqual(gear?.wheelZs, [1.82, 0.68, -0.16, -1.00, -1.84], `${id}: road wheels at the oracle's stations`);
    const gaps = gear.wheelZs.slice(1).map((z, i) => gear.wheelZs[i] - z);
    assert.ok(gaps[0] > 1.25 * Math.max(...gaps.slice(1)), `${id}: the first gap is the T-54's wide one (${gaps.map((g) => g.toFixed(2))})`);
    assert.ok(near(gear?.xcLeft, 1.323) && near(gear?.xcRight, 1.323), `${id}: track centres on the 2.65 m gauge`);
    assert.ok(gear?.sprocket.z < -2.4 && gear?.idler.z > 2.4, `${id}: rear drive sprocket, front idler`);
    assert.equal(hullReceipt.returnRollers, 0);
    assert.ok(near(hullReceipt.roadWheelDiameterM, 0.81));

    // Envelope: width over the fenders, roof, turret proportions.
    const hullBox = bounds(hull, turret);
    const width = hullBox.max.x - hullBox.min.x;
    assert.ok(width >= 3.24 && width <= 3.32, `${id}: hull width ${width.toFixed(3)} m is the published 3.27 m`);
    assert.ok(near(turret.position.y, 1.42) && near(turret.position.z, -0.08), `${id}: turret ring on the 1.42 m roof`);
    const casting = tank.root.getObjectByName('turret');
    assert.ok(casting?.parent === turret, `${id}: the cast dome is the turret bucket`);
    const domeBox = new THREE.Box3().setFromBufferAttribute(casting.geometry.getAttribute('position'));
    const domeWidth = domeBox.max.x - domeBox.min.x;
    assert.ok(domeWidth >= 2.45 && domeWidth <= 2.62, `${id}: the cast dome is ${domeWidth.toFixed(3)} m wide (the oracle's 2.54), not the refit's 2.76`);
    assert.ok(near(turretReceipt.dome.heightM, 0.78) && domeBox.max.y <= 0.86,
      `${id}: the dome rises 0.78 m (its casting bucket, with the T-54A ventilator, tops at ${domeBox.max.y.toFixed(3)} m)`);
    const under = (o, re) => { for (let q = o; q; q = q.parent) if (re.test(q.name)) return true; return false; };
    const turretBox = bounds(turret, gun, (o) => !under(o, /whip|antenna|RoofDShK|RadioWhip/i));
    assert.ok(turretBox.max.y <= 2.56, `${id}: the cupola crown stands ${turretBox.max.y.toFixed(3)} m (the oracle's 2.40-2.53)`);

    // Layout: the commander's cupola on the vehicle's left (+X here), the loader on its right.
    const cupola = tank.root.getObjectByName('turretCupola');
    const cupolaBox = new THREE.Box3().setFromBufferAttribute(cupola.geometry.getAttribute('position'));
    assert.ok((cupolaBox.min.x + cupolaBox.max.x) / 2 > 0.2, `${id}: the commander sits on the left`);
    assert.deepEqual([turretReceipt.commanderCupolaSide, turretReceipt.loaderHatchSide, turretReceipt.searchlightSide],
      ['left', 'right', 'right']);
    assert.equal(hullReceipt.exhaustSide, 'left');
    assert.equal(turretReceipt.ventilatorDome, id === 'type59', `${id}: only the T-54A pattern carries the ventilator dome`);
    const loaderMG = turret.getObjectByName('type59RoofDShK');
    if (id === 'type59') {
      assert.ok(loaderMG?.parent === turret && loaderMG.position.x < -0.2, 'type59: the loader and his DShK sit on the right');
      assert.ok(loaderMG.userData.remoteControlled && loaderMG.getObjectByName('auxiliaryWeaponPitch'), 'type59: the DShK is a working station');
      const dshkPosition = loaderMG.position.clone();
      turret.rotation.y = Math.PI / 2;
      tank.root.updateMatrixWorld(true);
      assert.ok(loaderMG.position.equals(dshkPosition), 'type59: the DShK keeps its turret-local seat through yaw');
      turret.rotation.y = 0;
      tank.root.updateMatrixWorld(true);
    } else {
      assert.equal(loaderMG, undefined, 't55a: the 1963 T-55A (the oracle) carries no roof gun');
      assert.deepEqual([...turretReceipt.roofMachineGuns], []);
    }

    // Gun: the evacuator runs to the muzzle; the searchlight rides the gun mount, right of and above the bore.
    assert.equal(turretReceipt.evacuatorAtMuzzle, true);
    assert.equal(turretReceipt.muzzleCounterweight, false);
    const lamp = tank.root.getObjectByName('gunMountLamp');
    assert.ok(lamp?.parent === gun, `${id}: the searchlight rides the gun mount`);
    const lampBox = new THREE.Box3().setFromBufferAttribute(lamp.geometry.getAttribute('position'));
    assert.ok((lampBox.min.x + lampBox.max.x) / 2 < -0.2, `${id}: the searchlight sits right of the gun`);
    const gunBox = bounds(gun);
    assert.ok(near(gunBox.max.z, 5.42, 0.02), `${id}: the muzzle at the oracle's 5.42 m (${gunBox.max.z.toFixed(3)})`);
    assert.ok(near(gun.position.y + turret.position.y, 1.74), `${id}: bore axis at 1.74 m (the oracle; [GS-59spec] 1.738)`);
  } finally {
    tank.dispose();
  }
}

console.log('type59Overhaul.selftest: the Type 59 and the T-55A on the T-54/T-55 family construction (dimensions, layout, gun) passed');
