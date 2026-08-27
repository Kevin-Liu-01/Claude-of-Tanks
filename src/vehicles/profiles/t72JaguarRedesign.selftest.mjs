import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const tank = createTank('t72m1_jaguar', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const spec = getSpec('t72m1_jaguar');
const hull = tank.root.getObjectByName('rig_hull');
const turret = tank.root.getObjectByName('rig_turret');
const gun = tank.root.getObjectByName('rig_gun');

assert.equal(hull.userData.t72FamilyFoundation, 'measured-current-t72-family',
  'Jaguar keeps its measured Polish envelope while using current T-72 family grammar');
assert.equal(hull.userData.nativeRoadWheelStations, 6,
  'Jaguar keeps the native six-station T-72 suspension');
assert.deepEqual(hull.userData.nativeWheelPatterns, ['pressed-six'],
  'Jaguar keeps one current pressed-wheel pattern');
assert.equal(turret.userData.polishModernization, 't72m1-jaguar-erawa-refit',
  'Jaguar owns its Polish modernization overlay');

const bandNames = [];
tank.root.traverse((node) => {
  if (node.name === 'gearTrackBandL' || node.name === 'gearTrackBandR') bandNames.push(node.name);
});
assert.deepEqual(bandNames.sort(), ['gearTrackBandL', 'gearTrackBandR'],
  'Jaguar has exactly one linked track course on each side');
const [runningGear] = hull.userData.runningGearReceipts || [];
assert.ok(runningGear, 'Jaguar publishes its linked running-gear receipt');
assert.equal(runningGear.idler.z, 2.83,
  'front idler reaches forward beneath the bow instead of crowding the sixth road wheel');
assert.ok(runningGear.idler.z - runningGear.wheelZs.at(-1) >= 0.73,
  'front idler has a natural full-wheel center spacing from the last road wheel');
assert.ok(Math.max(...runningGear.loopPoints.map(([z]) => z)) > 3.16,
  'linked track course wraps around the relocated front idler');
assert.equal(hull.userData.jaguarRunningGearReceipt?.revision,
  'forward-idler-linked-course-r1',
  'Jaguar records the forward-idler running-gear revision');
assert.equal(hull.userData.jaguarRunningGearReceipt?.frontContactZ, 2.53,
  'loaded track run extends forward to meet the relocated idler naturally');
assert.equal(hull.userData.jaguarRunningGearReceipt?.bowSlotClearedForWrap, true,
  'bow slot floors are trimmed clear of the longer idler wrap');
assert.equal(tank.root.getObjectByName('hullTrack'), undefined,
  'Jaguar ERAWA inherits hull camouflage rather than generic gray track steel');
assert.equal(tank.root.getObjectByName('turretTrack'), undefined,
  'Jaguar cheek ERAWA inherits turret camouflage rather than Russian Kontakt material');

assert.deepEqual(turret.position.toArray(), spec.armor.turretPivot,
  'rendered turret ring matches the combat/anatomy datum');
assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
  'rendered gun root matches the combat/anatomy datum');
const wkm = tank.root.getObjectByName('jaguar_wkm_b');
assert.ok(wkm && wkm.parent === turret,
  'Polish WKM-B is attached to the traversing turret');
const turretModernization = turret.userData.jaguarModernizationReceipt;
const hullModernization = hull.userData.jaguarModernizationReceipt;
assert.ok(turretModernization?.eraTiles >= 17,
  'Jaguar carries a complete cheek, roof, side-bin and rear ERAWA package');
assert.ok(turretModernization?.turretEquipmentPieces >= 22,
  'Jaguar turret carries substantial seated service and observation equipment');
assert.equal(turretModernization?.panoramicSight, true,
  'Jaguar commander receives a compact panoramic sight');
assert.equal(turretModernization?.sideBaskets, 2,
  'Jaguar has bilateral turret-side stowage baskets');
assert.ok(hullModernization?.hullEquipmentPieces >= 32,
  'Jaguar hull carries fender lockers, rolls, spare links and rear fittings');
assert.equal(hullModernization?.fenderLockers, 6,
  'Jaguar has three lidded fender lockers on each side');

const bounds = new THREE.Box3().setFromObject(tank.root);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(size.z > 9.35 && size.z < 9.60,
  `Jaguar overall length stays source-scaled (got ${size.z.toFixed(3)} m)`);
assert.ok(size.x > 3.55 && size.x < 3.75,
  `Jaguar hull/ERAWA width stays in the T-72 envelope (got ${size.x.toFixed(3)} m)`);

tank.dispose();
console.log('t72JaguarRedesign.selftest: measured T-72 foundation and Polish ERAWA refit verified');
