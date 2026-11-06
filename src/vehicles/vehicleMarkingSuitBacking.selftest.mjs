// A marking painted on its vehicle's suit (vehicleMarkingPaintsOnSuit: the owner's 2026-10-23 "Paint it on the drape")
// is backed by the suit's net within the same 5 cm the armour gets (Main's 268 ruling, vehicleMarkingsAudit
// markingSupportHit), and by nothing farther. On the M1A1 FEP: the shipped build passes the audit; with the net's
// backing tag removed its turret star has nothing within reach (the flank cover lies 34-40 mm off the wall), so the suit
// is what carries it; with the net and the turret armour both moved 6 cm behind the paint, the star fails again.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { vehicleMarkingPaintsOnSuit } from './vehicleMarkings.ts';
import { createVehicleMarkingsAudit } from './vehicleMarkingsAudit.test-support.mjs';

const ID = 'm1a1_abrams_fep';
const BACKING = /m1a1_abrams_fep\/vehicleMarking_\w+: armor is physically present directly behind paint/;
const build = () => createTank(ID, null, { proceduralOnly: true, geometryReceipt: true });
const check = (tank) => createVehicleMarkingsAudit().check(ID, tank);

assert.equal(vehicleMarkingPaintsOnSuit(ID), true, `${ID}: its markings are painted on the suit`);

// the shipped build
let tank = build();
check(tank);
tank.dispose();

// the suit's net no longer backs the paint: the turret star has no backing within 5 cm
tank = build();
const turret = tank.root.getObjectByName('rig_turret');
const nets = [];
turret.traverse((object) => { if (object.userData?.backsMarkingPaint === true) nets.push(object); });
assert.ok(nets.length > 0, `${ID}: the turret carries the suit net that backs its paint`);
for (const net of nets) net.userData.backsMarkingPaint = false;
assert.throws(() => check(tank), BACKING, `${ID}: without the suit, its star has no backing within reach`);
tank.dispose();

// the net and the armour 6 cm behind the paint: past the 5 cm reach, so the star fails
tank = build();
const star = tank.root.getObjectByName('vehicleMarking_insignia');
assert.ok(star, `${ID}: the turret star exists`);
tank.root.updateWorldMatrix(true, true);
const behind = new THREE.Vector3(0, 0, -0.06).applyQuaternion(star.getWorldQuaternion(new THREE.Quaternion()));
const backing = [];
tank.root.getObjectByName('rig_turret').traverse((object) => {
  if (object.isMesh && (object.userData?.backsMarkingPaint === true
    || object.name === 'turret' || object.name === 'turretPermanentMarkingSurface')) backing.push(object);
});
for (const mesh of backing) {
  const world = mesh.getWorldPosition(new THREE.Vector3()).add(behind);
  mesh.position.copy(mesh.parent.worldToLocal(world));
}
assert.throws(() => check(tank), BACKING, `${ID}: a suit-painted star 6 cm off its suit and armour fails`);
tank.dispose();

console.log(`vehicleMarkingSuitBacking.selftest: ${ID}'s star passes on its suit (${nets.length} net mesh(es)), fails without it, and fails 6 cm off the suit and the armour`);
