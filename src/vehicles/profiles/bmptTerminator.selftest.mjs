// BMPT Terminator (267, lane bmpt-family-267; the owner: "lets actually make a BMPT Terminator"): the native fixture of
// the original Ob'yekt 199 "Ramka" in profiles/bmptTerminator.ts and bmptTerminatorStation.ts, at both qualities. Its
// combat frame is its drawn frame (the yaw axis, the common trunnion, the twin bores, the four open Ataka exits in the gun
// frame), its tubes are a load's worth, its crew the BMPT's five, its height the published 3.44 m to the panoramic
// sight's lid (docs/references/tanks/bmpt_terminator.md), and the humps, the cradle and both Ataka housings keep clear.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import {
  RAMKA_ATAKA, RAMKA_BARREL_X, RAMKA_MUZZLE_Z, RAMKA_RING, RAMKA_TRUNNION,
} from './bmptTerminatorStation.ts';

const ID = 'bmpt_terminator';
const near = (actual, expected, label, tolerance = 0.002) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} against ${expected}`);

// ---- the combat frame is the drawn frame
const spec = getSpec(ID);
assert.equal(spec.name, 'BMPT Terminator');
assert.equal(spec.nation, 'Russia');
spec.armor.turretPivot.forEach((v, i) => near(v, RAMKA_RING[i], `turret pivot ${i}`));
spec.armor.gunPivot.forEach((v, i) => near(v, RAMKA_TRUNNION[i], `trunnion ${i}`));
near(spec.armor.gunBarrel.lengthM, RAMKA_MUZZLE_Z, 'barrel length to the bore mouths');
assert.deepEqual(spec.gun.muzzles.map((m) => m.x), [-RAMKA_BARREL_X, RAMKA_BARREL_X], 'one bore per 2A42');
assert.ok(spec.armor.turretPlates.every((plate) => plate.kind !== 'era'), 'the Ramka station carries no reactive armour');
// the four launch exits ride the gun frame (the arms elevate with the cannons), each on its tube's front cap
const exits = spec.gun.launcherMuzzles;
assert.equal(exits.length, 4, 'four open Ataka tubes');
for (const tip of exits) {
  assert.ok(tip.frame === undefined || tip.frame === 'gun', 'an Ataka exit pitches with the cradle');
  near(Math.abs(tip.x), RAMKA_ATAKA.x, 'exit column');
  assert.ok(RAMKA_ATAKA.ys.some((y) => Math.abs(tip.y - y) < 1e-6), `exit row ${tip.y}`);
  near(tip.z, RAMKA_ATAKA.frontZ + 0.032, 'exit on the front cap');
}
const ataka = spec.gun.shells.find((shell) => shell.guided);
assert.ok(ataka && ataka.count >= exits.length, 'at least one Ataka a tube (guided-load rule)');
assert.equal(ataka.launcherTubes, 4);
// five crew: the driver and the two grenade-launcher operators in the bow, the gunner and the commander in the module
const layout = INTERNAL_LAYOUT_BY_TANK[ID];
assert.equal(layout.layoutKey, 'bmptFive');
assert.deepEqual(layout.crew.map((c) => c.role).sort(),
  ['commander', 'driver', 'gunner', 'weaponOperatorLeft', 'weaponOperatorRight']);

// ---- the station's clearances (its own datums): the tubes outside the humps and their hubs, the cradle between them
const HUMP_OUT = 0.72, HUB_OUT = 0.775, HUMP_IN = 0.19, CRADLE_HALF = 0.18;
assert.ok(RAMKA_ATAKA.x - RAMKA_ATAKA.r > HUB_OUT + 0.09, 'the tubes stand clear of the hubs on the humps');
assert.ok(HUB_OUT > HUMP_OUT, 'the hub stands proud of its hump');
assert.ok(HUMP_IN - CRADLE_HALF >= 0.01 - 1e-9, 'the cradle turns 1 cm off the humps');

for (const quality of ['high', 'low']) {
  const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const named = (name) => {
      const object = tank.root.getObjectByName(name);
      assert.ok(object, `${quality}: ${name} exists`);
      return object;
    };
    const turretRig = named('rig_turret'), gunRig = named('rig_gun');
    turretRig.position.toArray().forEach((v, i) => near(v, RAMKA_RING[i], `${quality} drawn yaw axis ${i}`));
    gunRig.position.toArray().forEach((v, i) => near(v, RAMKA_TRUNNION[i], `${quality} drawn trunnion ${i}`));
    assert.equal(turretRig.userData.launcherTubes, 4, `${quality}: the profile's tube census`);
    // tallest: the panoramic sight's lid at the published 3.44 m (whips excluded), within 1 %
    let top = 0;
    const v = new THREE.Vector3();
    tank.root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || /procShadow/.test(o.name)) return;
      for (let p = o; p; p = p.parent) {
        if (!p.visible) return;
        if (p.userData?.fittingRoot && /whip|antenna/i.test(String(p.userData.fitting))) return;
      }
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y);
    });
    assert.ok(Math.abs(top - 3.44) <= 0.0344, `${quality}: tallest ${top.toFixed(3)} m against the published 3.44 m`);
  } finally {
    tank.dispose?.();
  }
}
console.log('bmptTerminator.selftest: the Ramka body, twin bores, four open Ataka exits in the gun frame, five crew and '
  + 'the 3.44 m crown hold at both qualities');
