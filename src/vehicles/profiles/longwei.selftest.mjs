// ZTZ-99 Longwei, the game's own ZTZ-99-lineage concept (release 262, owner 2026-10-28: the first-party concept route,
// docs/references/concepts/ztz99-longwei-20261028.json). Its native profile fixture: the drawn §262 hull and turret of
// docs/references/tanks/ztz99_longwei.md, at both qualities.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { boundsWithoutCamouflage } from '../camouflageBounds.test-support.mjs';

const ID = 'ztz99_longwei';
await ensureInteriorFills([ID]);

const near = (actual, expected, label, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(3)} m, drawn ${expected} m`);
const box = (object) => new THREE.Box3().setFromObject(object);

let highEnvelope = null;
for (const quality of ['high', 'low']) {
  const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const named = (name) => {
      const object = tank.root.getObjectByName(name);
      assert.ok(object, `${quality}: ${name} exists`);
      return object;
    };

    // hull: the armour shell 7.12 m from the stern plate to the nose over ±1.70 sponsons; the stern rack to −3.96 (7.58 m
    // overall), the fenders and skirt band to ±1.856 and the skirt course to ±1.866 (3.73 m). Release 264 (envelope
    // honesty): the rack is equipment, the fenders painted bodywork and the skirts spaced armour, none the hull's armour.
    const hull = box(named('hull'));
    near(hull.min.z, -3.500, `${quality} stern plate`);
    near(hull.max.z, 3.616, `${quality} nose`);
    near(hull.max.x, 1.700, `${quality} hull half width`);
    near(-hull.min.x, 1.700, `${quality} hull half width (right)`);
    near(box(named('hullEquipment')).min.z, -3.960, `${quality} stern rack`);
    near(box(named('hullFixedPaintedBodywork')).max.x, 1.856, `${quality} fender half width`);
    near(box(named('hullExternalArmor')).max.x, 1.866, `${quality} skirt course half width`);

    // turret: 3.14 m over the side modules (±1.57), the roof at 2.35 m, the rear wall at local −2.60 on the 0.64 ring
    const turret = box(named('turret'));
    near(turret.max.x, 1.570, `${quality} turret half width`);
    near(-turret.min.x, 1.570, `${quality} turret half width (right)`);
    near(turret.max.y, 2.350, `${quality} turret roof`);
    near(turret.min.z, -1.960, `${quality} turret rear wall`);
    // the 0.62 m basket ends at world −2.57, 1.39 m short of the stern
    near(box(named('fitting_stowageRack')).min.z, -2.571, `${quality} basket`);
    // the commander sits right of the gun (−X) with the QJC-88
    assert.ok(box(named('fitting_browningDerived_qjc88')).max.x < 0.05, `${quality}: QJC-88 on the commander's side`);
    // the pinned 6.454 m gun on the pinned trunnion
    near(box(named('rig_gun')).max.z, 7.849, `${quality} muzzle`);

    // the roof is closed behind the hatches
    const turretMesh = named('turret');
    for (const z of [-1.2, -1.6]) for (const x of [-0.9, -0.3, 0.3, 0.9]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0))
        .intersectObject(turretMesh, false)[0];
      assert.ok(hit && hit.point.y > 2.2, `${quality}: turret roof closed at x ${x}, z ${z}`);
    }

    // one design at both qualities: the complete envelope is the same
    const envelope = boundsWithoutCamouflage(tank.root);
    const values = [...envelope.min.toArray(), ...envelope.max.toArray()];
    if (highEnvelope) values.forEach((value, axis) => near(value, highEnvelope[axis], `${quality} envelope[${axis}]`, 0.002));
    else highEnvelope = values;
  } finally {
    tank.dispose();
  }
}
console.log('longwei: the §262 hull, turret, basket, commander station and gun at both qualities PASS');
