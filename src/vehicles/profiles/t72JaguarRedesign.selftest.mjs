import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

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
assert.ok(runningGear.sprocket.z <= -2.41,
  'rear sprocket moves aft instead of crowding the first road wheel');
assert.ok(Math.min(...runningGear.loopPoints.map(([z]) => z)) < -2.72,
  'linked track course wraps naturally around the relocated rear sprocket');
assert.equal(hull.userData.jaguarRunningGearReceipt?.revision,
  'longer-end-wheel-course-r2',
  'Jaguar records the longer end-wheel running-gear revision');
assert.equal(hull.userData.jaguarRunningGearReceipt?.frontContactZ, 2.53,
  'loaded track run extends forward to meet the relocated idler naturally');
assert.equal(hull.userData.jaguarRunningGearReceipt?.bowSlotClearedForWrap, true,
  'bow slot floors are trimmed clear of the longer idler wrap');
assert.equal(hull.userData.jaguarRunningGearReceipt?.rearContactZ, -2.14,
  'loaded track run reaches the relocated rear sprocket naturally');
assert.equal(hull.userData.jaguarRunningGearReceipt?.rearPlateClearedForWrap, true,
  'rear track wrap remains clear of the hull plate');
assert.equal(tank.root.getObjectByName('hullTrack'), undefined,
  'Jaguar ERAWA inherits hull camouflage rather than generic gray track steel');
assert.equal(tank.root.getObjectByName('turretTrack'), undefined,
  'Jaguar cheek ERAWA inherits turret camouflage rather than Russian Kontakt material');

assert.deepEqual(turret.position.toArray(), spec.armor.turretPivot,
  'rendered turret ring matches the combat/anatomy datum');
assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
  'rendered gun root matches the combat/anatomy datum');
assert.equal(spec.armor.gunPivot[1], 0.26,
  'Jaguar cannon root rises two centimetres inside the casting');
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
assert.ok(turretModernization?.bustleRearZ <= -1.90,
  'Jaguar receives a materially larger connected rear bustle');
assert.equal(turretModernization?.bustleConnectedToCastRear, true,
  'Jaguar bustle overlaps the cast rear instead of floating behind it');
assert.equal(turretModernization?.machineGunClass, 'm2',
  'Jaguar receives a visible heavy roof machine gun');
assert.ok(turretModernization?.machineGunScale >= 0.52,
  'Jaguar roof machine gun remains legible without exceeding its height envelope');
const surfaceEquipment = turret.userData.jaguarSurfaceEquipmentReceipt;
assert.equal(surfaceEquipment?.revision, 'surface-seated-systems-r2');
assert.ok(surfaceEquipment?.equipmentSeats >= 2,
  'Jaguar side baskets publish surface-seating receipts');
assert.ok(surfaceEquipment?.maximumSurfaceGapM <= -0.018,
  'Jaguar side equipment overlaps its armor shoes instead of floating');
assert.equal(surfaceEquipment?.asteriaArmorShoe, true,
  'Asteria sight is carried on a visible armor shoe');
assert.equal(surfaceEquipment?.searchlightArmorShoe, true,
  'cheek searchlight is carried on a visible armor shoe');
assert.ok(hullModernization?.hullEquipmentPieces >= 32,
  'Jaguar hull carries fender lockers, rolls, spare links and rear fittings');
assert.equal(hullModernization?.fenderLockers, 6,
  'Jaguar has three lidded fender lockers on each side');
assert.equal(hullModernization?.fuelBarrels, 2,
  'Jaguar carries two large transverse rear fuel barrels');
assert.ok(hullModernization?.fuelBarrelDiameterM >= 0.47,
  'Jaguar rear fuel barrels have a substantial visible diameter');

const bounds = new THREE.Box3().setFromObject(tank.root);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(size.z > 9.35 && size.z < 9.60,
  `Jaguar overall length stays source-scaled (got ${size.z.toFixed(3)} m)`);
assert.ok(size.x > 3.55 && size.x < 3.75,
  `Jaguar hull/ERAWA width stays in the T-72 envelope (got ${size.x.toFixed(3)} m)`);

tank.dispose();
console.log('t72JaguarRedesign.selftest: measured T-72 foundation and Polish ERAWA refit verified');
