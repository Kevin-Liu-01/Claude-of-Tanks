// Release 262 (owner 2026-10-27: "based on proper historical referrences so they will no longer look so chungus"): the
// Type 59 is the PLA's licensed T-54A rebuilt from the published dimensions and museum photographs
// (profiles/type59.ts, docs/references/tanks/type59.md §262). The r3 refit (the widened obr-1975 chassis at a 0.855 rig
// scale, skirt and turret cassettes, the oversized searchlight) is retired; its receipt is replaced by this one.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const near = (value, expected, epsilon = 1e-6) => Math.abs(value - expected) <= epsilon;

const tank = createTank('type59', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

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

try {
  tank.root.updateMatrixWorld(true);
  const spec = getSpec('type59');
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.ok(hull && turret && gun, 'Type 59 keeps independent hull, turret and gun rigs');
  assert.deepEqual([spec.dims.hullLengthM, spec.dims.overallLengthM, spec.dims.widthM, spec.dims.heightM],
    [6.04, 9.00, 3.27, 2.40], 'spec carries the published Type 59 / T-54A dimensions');
  for (const rig of [hull, turret]) {
    assert.ok(near(rig.scale.x, 1) && near(rig.scale.y, 1) && near(rig.scale.z, 1),
      `${rig.name} is authored at full size (the 0.855 refit scale is retired)`);
  }

  const hullReceipt = hull.userData.type59HistoricalReceipt;
  const turretReceipt = turret.userData.type59HistoricalReceipt;
  assert.equal(hullReceipt?.revision, 'type59-historical-r262', 'hull publishes the historical rebuild');
  assert.equal(turretReceipt?.revision, 'type59-historical-r262', 'turret publishes the historical rebuild');
  assert.equal(hullReceipt.legacyRefitRetired, true);

  // Running gear: five wheels a side with the T-54 gap, 580 mm track on a 2.64 m gauge, no return rollers.
  const gear = hull.userData.runningGearReceipts?.[0];
  assert.equal(hull.userData.nativeRoadWheelStations, 5, 'five road-wheel stations a side');
  assert.deepEqual(gear?.wheelZs, [1.48, 0.43, -0.36, -1.15, -1.94], 'road wheels at the photographed stations');
  const gaps = gear.wheelZs.slice(1).map((z, i) => gear.wheelZs[i] - z);
  assert.ok(gaps[0] > 1.25 * Math.max(...gaps.slice(1)), `the first gap is the T-54's wide one (${gaps.map((g) => g.toFixed(2))})`);
  assert.ok(near(gear?.xcLeft, 1.32) && near(gear?.xcRight, 1.32), 'track centres on the 2.64 m gauge');
  assert.ok(gear?.sprocket.z < -2.5 && gear?.idler.z > 2.0, 'rear drive sprocket, front idler');
  assert.equal(hullReceipt.returnRollers, 0, 'the upper run rides on the road wheels');
  assert.ok(near(hullReceipt.trackWidthM, 0.58) && near(hullReceipt.trackGaugeM, 2.64));
  assert.ok(near(hullReceipt.roadWheelDiameterM, 0.78));

  // Envelope: width over the fenders, hull roof, body length, turret proportions.
  const hullBox = bounds(hull, turret);
  const width = hullBox.max.x - hullBox.min.x;
  assert.ok(width >= 3.24 && width <= 3.32, `hull width ${width.toFixed(3)} m is the published 3.27 m`);
  assert.ok(near(turret.position.y, 1.45) && near(turret.position.z, 0), 'turret ring on the 1.45 m roof over road wheel 3');
  const casting = tank.root.getObjectByName('turret');
  assert.ok(casting?.parent === turret, 'the cast dome is the turret bucket');
  const domeBox = new THREE.Box3().setFromBufferAttribute(casting.geometry.getAttribute('position'));
  const domeWidth = domeBox.max.x - domeBox.min.x, domeHeight = domeBox.max.y;
  assert.ok(domeWidth >= 2.10 && domeWidth <= 2.24, `the cast dome is ${domeWidth.toFixed(3)} m wide (~2.15 m), not the refit's 2.76`);
  assert.ok(domeHeight <= 0.80, `the dome stands ${domeHeight.toFixed(3)} m over the roof (low, ~0.74 m)`);
  const under = (o, re) => { for (let q = o; q; q = q.parent) if (re.test(q.name)) return true; return false; };
  const turretBox = bounds(turret, gun, (o) => !under(o, /whip|antenna|RoofDShK|RadioWhip/i));
  assert.ok(turretBox.max.y <= 2.52, `the cupola crown stands ${turretBox.max.y.toFixed(3)} m (published 2.40 m without the AA gun)`);

  // Layout: the commander's cupola on the vehicle's left (+X here), the loader's DShK on its right.
  const cupola = tank.root.getObjectByName('turretCupola');
  assert.ok(cupola, 'the commander has a cupola');
  const cupolaBox = new THREE.Box3().setFromBufferAttribute(cupola.geometry.getAttribute('position'));
  assert.ok((cupolaBox.min.x + cupolaBox.max.x) / 2 > 0.2, 'the commander sits on the left');
  const loaderMG = turret.getObjectByName('type59RoofDShK');
  assert.ok(loaderMG?.parent === turret, 'loader DShK yaws with the turret');
  assert.ok(loaderMG.position.x < -0.2, 'the loader and his DShK sit on the right');
  assert.equal(loaderMG.userData.cupolaSeat, 'loader');
  assert.ok(loaderMG.userData.remoteControlled && loaderMG.getObjectByName('auxiliaryWeaponPitch'), 'loader DShK is a working station');
  assert.ok(turret.getObjectByName('type59CommanderCupolaMG') === undefined, 'no commander cupola gun');
  assert.deepEqual([turretReceipt.commanderCupolaSide, turretReceipt.loaderHatchSide, turretReceipt.searchlightSide],
    ['left', 'right', 'right']);
  assert.equal(hullReceipt.exhaustSide, 'left');

  // Gun: the evacuator runs flush to the muzzle; the searchlight is a modest lamp on the gun's right, gun-linked.
  assert.equal(turretReceipt.evacuatorAtMuzzle, true);
  assert.equal(turretReceipt.muzzleCounterweight, false);
  assert.ok(near(turretReceipt.evacuatorLengthM, 0.87));
  const lamp = tank.root.getObjectByName('gunMountLamp');
  assert.ok(lamp?.parent === gun, 'the searchlight rides the gun mount');
  const lampBox = new THREE.Box3().setFromBufferAttribute(lamp.geometry.getAttribute('position'));
  assert.ok((lampBox.min.x + lampBox.max.x) / 2 < -0.2, 'the searchlight sits right of the gun');
  assert.ok(lampBox.max.y - lampBox.min.y < 0.45, 'the searchlight is a 0.31 m lamp, not the refit\'s 0.41 m drum');
  const gunBox = bounds(gun);
  assert.ok(near(gunBox.max.z, 0 + 0.62 + 5.15, 0.02), `the muzzle stands 2.87 m past the nose (${gunBox.max.z.toFixed(3)})`);
  assert.ok(near(gun.position.y + turret.position.y, 1.81), 'the bore leaves the dome at mid-height (1.81 m, the side photo)');

  const dshkPosition = loaderMG.position.clone();
  turret.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  assert.ok(loaderMG.position.equals(dshkPosition), 'DShK preserves its turret-local seat through yaw');
} finally {
  tank.dispose();
}

console.log('type59Overhaul.selftest: the historical Type 59 (T-54A pattern) dimensions, layout and gun passed');
