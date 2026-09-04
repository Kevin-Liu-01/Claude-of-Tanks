import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const tank = createTank('t72m1_jaguar', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const twardy = createTank('pt91_twardy', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const spec = getSpec('t72m1_jaguar');
const hull = tank.root.getObjectByName('rig_hull');
const turret = tank.root.getObjectByName('rig_turret');
const gun = tank.root.getObjectByName('rig_gun');
const twardyHull = twardy.root.getObjectByName('rig_hull');
const twardyGun = twardy.root.getObjectByName('rig_gun');

assert.equal(hull.userData.t72FamilyFoundation, 'measured-current-t72-family',
  'Jaguar keeps its measured Polish envelope while using current T-72 family grammar');
assert.equal(hull.userData.nativeRoadWheelStations, 6,
  'Jaguar keeps the native six-station T-72 suspension');
assert.deepEqual(hull.userData.nativeWheelPatterns, ['pressed-six'],
  'Jaguar keeps one current pressed-wheel pattern');
assert.equal(turret.userData.polishModernization, 't72m1-jaguar-erawa-refit',
  'Jaguar owns its Polish modernization overlay');
assert.equal(spec.visual.scheme, 'nato',
  'Jaguar uses a flowing Polish three-colour woodland pattern');
assert.equal(spec.visual.base, '#46533a',
  'Jaguar body color is olive green rather than the former blue-gray tone');
assert.deepEqual(spec.visual.patches, ['#5a4534', '#1c211c'],
  'Jaguar carries distinct earth-brown and charcoal disruption bands');

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
  'pt91a-raised-stance-and-end-wheel-course-r4',
  'Jaguar records the PT-91A-height end-wheel running-gear revision');
assert.equal(runningGear.botY, 0.10,
  'Jaguar loaded track run is raised 75 mm from the PT-91A datum');
assert.equal(runningGear.wheelY, twardyHull.userData.runningGearReceipts[0].wheelY,
  'Jaguar and PT-91A share the same road-wheel center height');
assert.equal(runningGear.topY, twardyHull.userData.runningGearReceipts[0].topY,
  'Jaguar and PT-91A share the same upper track-run height');
assert.ok(tank.presentationTrackFloorYM >= twardy.presentationTrackFloorYM + 0.07,
  'Jaguar rendered shoe course rises at least 70 mm above the PT-91A datum');
assert.equal(hull.userData.jaguarRunningGearReceipt?.pt91aWheelCenterMatched, true,
  'Jaguar publishes the PT-91A wheel-center stance match');
assert.ok(hull.userData.jaguarRunningGearReceipt?.hullDeckLiftM >= 0.04,
  'Jaguar hull deck rises materially above the former low silhouette');
const jaguarHullBounds = new THREE.Box3().setFromObject(hull);
const twardyHullBounds = new THREE.Box3().setFromObject(twardyHull);
assert.ok(jaguarHullBounds.max.y >= twardyHullBounds.max.y - 0.14,
  'Jaguar structural hull roof stays within 140 mm of the taller PT-91A package');
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
assert.equal(spec.armor.gunPivot[1], 0.27,
  'Jaguar cannon root rises another centimetre inside the casting');
assert.ok(gun.getWorldPosition(new THREE.Vector3()).y >=
  twardyGun.getWorldPosition(new THREE.Vector3()).y - 0.03,
  'Jaguar cannon axis sits within 30 mm of the PT-91A datum');
const glacis = hull.userData.jaguarGlacisReceipt;
assert.equal(glacis?.revision, 'single-plane-glacis-erawa-r3');
assert.equal(glacis?.joinedUpperAndLowerGlacis, true,
  'upper and lower glacis terminate in one closed bow');
assert.equal(glacis?.bowClosure?.rearZ, 3.58,
  'bow closure starts inside the upper/lower glacis join');
assert.equal(glacis?.bowClosure?.frontZ, 3.66,
  'bow closure overlaps the complete outer nose station');
assert.ok(glacis?.bowClosure?.upperY > glacis?.bowClosure?.lowerY,
  'bow closure has a positive structural height');
assert.equal(glacis?.shoulderBridge?.frontZ, 3.60,
  'glacis shoulder bridge overlaps the bow closure');
assert.ok(glacis?.shoulderBridge?.rearHalfWidthM >= 1.28,
  'glacis shoulder bridge reaches both full-width fender roots');
assert.equal(glacis?.erawaCassettes, 22,
  'all 22 upper-glacis ERAWA cassettes remain in the conformal course');
assert.equal(glacis?.erawaCenterSurfaceGapM, 0,
  'upper-glacis ERAWA centers lie exactly on the solved plate plane');
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
assert.ok(turretModernization?.machineGunScale >= 0.58,
  'Jaguar roof machine gun remains legible without exceeding its height envelope');
assert.equal(turretModernization?.roofMachineGun, true,
  'Jaguar WKM-B is explicitly mounted on the turret roof');
assert.ok(wkm.position.y >= 0.58,
  'Jaguar WKM-B receiver remains seated in its compact turret-roof pintle');
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
assert.equal(hullModernization?.fuelBarrelMount, 'twin-transverse-rear-cradles-r3',
  'Jaguar fuel barrels are retained by the dedicated rear cradle revision');
assert.ok(hullModernization?.fuelBarrelRearZ <= -3.20,
  'Jaguar fuel barrels reach the rear silhouette instead of hiding on the deck');

const bounds = new THREE.Box3().setFromObject(tank.root);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(size.z > 9.35 && size.z < 9.60,
  `Jaguar overall length stays source-scaled (got ${size.z.toFixed(3)} m)`);
assert.ok(size.x > 3.55 && size.x < 3.75,
  `Jaguar hull/ERAWA width stays in the T-72 envelope (got ${size.x.toFixed(3)} m)`);

tank.dispose();
twardy.dispose();
console.log('t72JaguarRedesign.selftest: PT-91A stance, joined glacis, seated ERAWA and rear kit verified');
