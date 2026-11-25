import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { MARDER1A3_HULL, MARDER1A3_TURRET_RING } from './marder1a3.ts';
import { betweenBuilds } from '../../../tools/build-loop-yield.mjs';

// 274 (owner 2026-11-20: "update the marder 1a3's turret and hull. redesign it too"): the Marder 1A3 stands on its own
// hull and two-man turret (profiles/marder1a3.ts), not the Bradley donor. The build holds the published envelope
// (6.88 m hull, 3.38 m over the appliqué, under the 3.02 m sight crown), its six-wheel front-drive running gear, the ring
// on the roof crown, the MILAN tip at its tube mouth and the 20 mm muzzle inside the bow.
const id = 'marder1a3', spec = getSpec(id), H = MARDER1A3_HULL;
assert.deepEqual(spec.armor.turretPivot, [MARDER1A3_TURRET_RING.x, MARDER1A3_TURRET_RING.y, MARDER1A3_TURRET_RING.z],
  'the spec turret pivot is the hull ring');
assert.ok(spec.gun.shells.some((s) => s.guided), 'the spec carries the MILAN');

for (const quality of ['high', 'low']) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  const tank = createTank(id, null, { proceduralOnly: true, quality, camoSeed: 4242, geometryReceipt: true,
    batchStatic: false, decor: false });
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const hullRig = root.getObjectByName('rig_hull'), turretRig = root.getObjectByName('rig_turret');
    assert.equal(hullRig.userData.marder1a3HullReceipt?.revision, 'marder1a3-hull-r1', `${quality}: own hull receipt`);
    assert.equal(hullRig.userData.bradleyHullCoreReceipt, undefined, `${quality}: no Bradley hull core`);
    assert.equal(hullRig.userData.bradleySideArmorReceipt, undefined, `${quality}: no Bradley side armour`);

    // the envelope without the whips
    const body = new Box3(), size = new Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      for (let p = o; p; p = p.parent) if (/antenna|whip/i.test(p.name)) return;
      body.union(new Box3().setFromObject(o));
    });
    body.getSize(size);
    assert.ok(size.x > 3.34 && size.x < 3.42, `${quality}: width over the appliqué ${size.x.toFixed(3)} (published 3.38)`);
    assert.ok(size.z > 6.80 && size.z < 6.96, `${quality}: length ${size.z.toFixed(3)} (published 6.88)`);
    assert.ok(body.max.y > 2.85 && body.max.y < 3.02, `${quality}: crown ${body.max.y.toFixed(3)} under the 3.02 sight`);

    // running gear: six road wheels a side, the sprocket at the front
    const gear = hullRig.userData.runningGearReceipts?.[0];
    assert.ok(gear, `${quality}: running-gear receipt`);
    assert.equal(root.getObjectByName('gearRoadWheelTires')?.count, 12, `${quality}: six road wheels a side`);
    assert.ok(gear.trackW === 0.45 && Math.abs(gear.xcLeft - 1.30) < 1e-9, `${quality}: 0.45 m track at ±1.30`);
    assert.ok(gear.xcLeft - gear.trackW / 2 > H.tubHalfW, `${quality}: the tub stays inboard of the track lane`);
    assert.ok(H.sideX > gear.xcLeft + gear.trackW / 2 - 0.05 && H.sponsonY > gear.topY,
      `${quality}: the sponson covers the track's top run`);

    // the ring on the roof crown and the gun inside the bow
    assert.ok(Math.abs(turretRig.position.y - H.roofY) < 1e-9 && turretRig.position.x === 0, `${quality}: ring on the roof`);
    const muzzle = new Vector3();
    root.getObjectByName('rig_muzzle').getWorldPosition(muzzle);
    assert.ok(muzzle.z > 1.4 && muzzle.z < H.bowZ, `${quality}: the 20 mm muzzle ${muzzle.z.toFixed(3)} stays inside the bow`);
    const tip = root.getObjectByName('rig_launcher_tip_0'), t = new Vector3();
    assert.ok(tip, `${quality}: the MILAN launcher tip exists`);
    tip.getWorldPosition(t);
    assert.ok(Math.abs(t.x - 0.62) < 0.01 && Math.abs(t.y - 2.624) < 0.01 && Math.abs(t.z - 1.02) < 0.01,
      `${quality}: the MILAN tip on the left front, at its tube mouth (${t.toArray().map((n) => n.toFixed(3))})`);
  } finally {
    tank.dispose();
  }
}
console.log('marder1a3.selftest: own hull and turret, published envelope, six-wheel gear, ring, MILAN and muzzle');
