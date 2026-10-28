// ZTZ-85-III (release 263, owner 2026-10-28: "yeah going to need a totally new ztz 85 III"): the native fixture of the
// ground-up rebuild in profiles/ztz85iii.ts against the published Type 85 record (docs/references/tanks/ztz85_iii.md
// §263), at both qualities: the 6.325 m hull and its 3.37 m fenders, six road wheels, the compact welded turret (no longer
// the 4.55 m slab of releases 248-262), the cupola's 2.29 m crown, the 10.37 m gun forward and the crew stations' sides.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

const ID = 'ztz85_iii';
await ensureInteriorFills([ID]);

const near = (actual, expected, label, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(3)} m, drawn ${expected} m`);
const box = (object) => new THREE.Box3().setFromObject(object);

for (const quality of ['high', 'low']) {
  const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const named = (name) => {
      const object = tank.root.getObjectByName(name);
      assert.ok(object, `${quality}: ${name} exists`);
      return object;
    };
    const hullRig = named('rig_hull'), turretRig = named('rig_turret'), gunRig = named('rig_gun');
    const hullReceipt = hullRig.userData.ztz85iiiReceipt, turretReceipt = turretRig.userData.ztz85iiiReceipt;
    assert.ok(hullReceipt && turretReceipt, `${quality}: the rebuild's receipts ride the hull and turret rigs`);

    // hull: the published 6.325 m from the stern plate to the beak, 3.37 m over the fenders (the 85-III prototype ran
    // without skirts), six road wheels a side
    near(hullReceipt.hullBodyM.noseZ - hullReceipt.hullBodyM.rearZ, 6.325, `${quality} hull length`, 0.006);
    near(box(named('hull')).max.x * 2, 3.37, `${quality} width over the fenders`, 0.01);
    assert.equal(hullReceipt.skirtPanels, 0, `${quality}: the upper run and return rollers in the open`);
    assert.equal(hullReceipt.roadWheelStations, 6, `${quality}: six road wheels a side`);
    assert.equal(hullReceipt.returnRollers, 3, `${quality}: three return rollers`);
    near(hullReceipt.roadWheelDiameterM, 0.70, `${quality} road wheel`, 0.001);

    // turret: the compact welded hexagon, 2.44 m wide and 2.62 m long, its roof at 2.13 m behind the long front slope
    const turret = box(named('turret'));
    near(turret.max.x - turret.min.x, 2.44, `${quality} turret width`, 0.02);
    assert.ok(turret.max.z - turret.min.z < 2.75, `${quality}: turret ${(turret.max.z - turret.min.z).toFixed(2)} m long, not the old 4.55 m slab`);
    // the roof plate itself (the bucket also carries the cupola and sight boxes): straight down behind the hatches
    const roofHit = new THREE.Raycaster(new THREE.Vector3(0.20, 4, -0.85), new THREE.Vector3(0, -1, 0))
      .intersectObject(named('turret'), false)[0];
    assert.ok(roofHit, `${quality}: the turret roof is closed behind the hatches`);
    near(roofHit.point.y, 2.13, `${quality} turret roof`, 0.02);
    // the cupola's crown is the published 2.29 m height (the 12.7 mm gun and the whips stand above it)
    const hatches = box(named('turretHatch'));
    assert.ok(hatches.max.y <= 2.30 && hatches.max.y >= 2.10, `${quality}: cupola crown ${hatches.max.y.toFixed(3)} m`);

    // the 125 mm muzzle 10.37 m from the stern plate
    near(box(gunRig).max.z - hullReceipt.hullBodyM.rearZ, 10.37, `${quality} gun forward`, 0.02);

    // the commander and his 12.7 mm gun on the right (-X); the gunner and his sight box on the left (+X)
    const mg = tank.root.getObjectByName('fitting_browningDerived_qjc88');
    assert.ok(mg && box(mg).max.x < 0, `${quality}: the 12.7 mm gun rides the commander's cupola on the right`);
    assert.equal(turretReceipt.gunnerSide, 'left');

    // reactive bricks on the glacis and both front faces
    const glacisEra = box(named('hullExternalArmor'));
    assert.ok(glacisEra.min.z > 2.0 && glacisEra.max.x > 1.2, `${quality}: the glacis bricks span the plate`);
    const turretEra = box(named('turretExternalArmor'));
    assert.ok(turretEra.max.x > 1.0 && turretEra.min.x < -1.0, `${quality}: bricks on both front faces`);
  } finally {
    tank.dispose();
  }
}
console.log('ztz85iii.selftest: the published hull, six wheels, the compact welded turret, the cupola crown, the gun and the ERA at both qualities');
