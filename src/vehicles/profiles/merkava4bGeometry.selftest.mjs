import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('merkava4b', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const near = (value, target, epsilon = 1e-5) => Math.abs(value - target) <= epsilon;
const turret = tank.root.getObjectByName('rig_turret');
const hull = tank.root.getObjectByName('rig_hull');
const gun = tank.root.getObjectByName('rig_gun');

const roofSeatReceipt = turret?.userData.merkava4bRoofSeatReceipt;
assert.ok(roofSeatReceipt, 'Merkava 4B exposes its roof-equipment seating receipt');
assert.equal(roofSeatReceipt.revision, 'modular-shell-roof-r1');
assert.equal(roofSeatReceipt.datumSource, 'profile-shell',
  'roof equipment follows the rendered modular shell rather than the rejected oracle');
assert.equal(roofSeatReceipt.allSeatsUseRenderedShellDatum, true);
assert.ok(near(roofSeatReceipt.commanderRoofM, 2.54),
  'commander fittings sit on the local modular roof');
assert.ok(near(roofSeatReceipt.loaderRoofM, 2.5218181818181815),
  'loader fittings sit on the local modular roof');
assert.ok(near(roofSeatReceipt.sightRoofM, 2.55),
  'panoramic sight shoe sits on the local modular roof');
assert.ok(roofSeatReceipt.rearCaseRoofsM.every((value, index) => near(value,
  [2.496363636363636, 2.4872727272727273, 2.5027272727272725][index])),
  'each rear case samples its own sloped roof station');
assert.ok(roofSeatReceipt.maximumFormerStandOffM >= 0.16,
  'receipt records the removed oracle-to-shell stand-off');

const gunSeatReceipt = gun?.userData.merkava4bGunSeatReceipt;
assert.ok(gunSeatReceipt, 'Merkava 4B exposes its articulated gun-seat receipt');
assert.equal(gunSeatReceipt.revision, 'closed-throat-r1');
assert.ok(near(gunSeatReceipt.turretThroatHalfWidthM, 0.65));
assert.ok(near(gunSeatReceipt.socketHalfWidthM, 0.64));
assert.ok(near(gunSeatReceipt.shoulderHalfWidthM, 0.63));
assert.ok(near(gunSeatReceipt.socketSideClearanceM, 0.01),
  'gun socket closes each former 19 cm turret-side opening to 1 cm');
assert.ok(near(gunSeatReceipt.shoulderSideClearanceM, 0.02),
  'mask shoulder remains within 2 cm of the turret throat');
assert.ok(near(gunSeatReceipt.mouthHalfWidthM, 0.29),
  'forward gun mouth retains its compact dimensions');
assert.equal(gunSeatReceipt.taperBeginsBeyondTurretThroat, true);

const eraReceipt = turret?.userData.merkava4bEraReceipt;
assert.ok(eraReceipt, 'Merkava 4B exposes its conformal ERA seating receipt');
assert.equal(eraReceipt.revision, 'conformal-side-panel-r2');
assert.equal(eraReceipt.supportSurface, 'merkava4b-flank-panels');
assert.equal(eraReceipt.allCassettesUsePanelFrames, true);
assert.equal(eraReceipt.totalCassettes, 20, 'two rows of five cassettes cover each flank panel');
assert.equal(eraReceipt.seats.length, 20, 'every cassette has an audited surface seat');
assert.equal(eraReceipt.maxSurfaceGapM, 0, 'ERA permits no visible gap from the panel skin');
assert.ok(near(eraReceipt.contactEmbedM, 0.014), 'ERA inner faces overlap the panel by 14 mm');
assert.deepEqual(eraReceipt.visualTurretPivot, [0, 1.78, -0.55],
  'ERA uses the visual Mk 4B turret pivot');
assert.deepEqual(eraReceipt.combatTurretPivot, [0, 1.62, -0.35],
  'combat-data pivot remains explicit instead of silently offsetting ERA');

for (const seat of eraReceipt.seats) {
  const center = new THREE.Vector3(...seat.center);
  const surface = new THREE.Vector3(...seat.surface);
  const normal = new THREE.Vector3(...seat.normal);
  assert.ok(near(normal.length(), 1), 'cassette surface normal stays normalized');
  assert.ok(center.x * normal.x > 0,
    'left and right cassette normals point outward from the turret centerline');
  assert.ok(near(center.clone().sub(surface).dot(normal), seat.centerProudM),
    'cassette center follows the ruled cheek surface along its own normal');
  assert.ok(near(seat.cassetteDepthM / 2 - seat.centerProudM, seat.innerFaceOverlapM),
    'cassette inner face is embedded rather than floating above the panel');
  assert.ok(seat.panelCourseIndex === 0 || seat.panelCourseIndex === 1,
    'forward ERA rows stay attached to the two forward panel courses');
  assert.ok(seat.worldZ >= 0.28 && seat.worldZ <= 1.34,
    'ERA station remains inside the audited forward panel span');
}

const eraLayers = [];
turret.traverse((object) => {
  const dimensions = object.geometry?.parameters;
  if (object.isInstancedMesh && object.count === 20
    && near(dimensions?.width ?? 0, 0.28)
    && near(dimensions?.height ?? 0, 0.13)
    && near(dimensions?.depth ?? 0, 0.07)) eraLayers.push(object);
});
assert.equal(eraLayers.length, 1, 'all twenty flank-panel cassettes share one instanced ERA layer');

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const normal = new THREE.Vector3();
let leftCount = 0;
let rightCount = 0;
for (let instance = 0; instance < eraLayers[0].count; instance++) {
  eraLayers[0].getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  normal.set(0, 0, 1).transformDirection(matrix);
  if (position.x < 0) leftCount++; else rightCount++;
  assert.ok(position.x * normal.x > 0,
    `rendered ERA cassette ${instance} faces away from the centerline`);
}
assert.equal(leftCount, 10, 'ten rendered cassettes cover the left cheek');
assert.equal(rightCount, 10, 'ten rendered cassettes cover the right cheek');

const flankPanelReceipt = turret?.userData.merkava4bFlankPanelReceipt;
assert.ok(flankPanelReceipt, 'Merkava 4B exposes its turret-side panel seating receipt');
assert.equal(flankPanelReceipt.revision, 'conformal-full-side-course-r2');
assert.equal(flankPanelReceipt.panelCount, 10, 'all five courses on both sides are audited');
assert.equal(flankPanelReceipt.seats.length, 10);
assert.equal(flankPanelReceipt.segmentCount, 56,
  'the swept panel run is subdivided finely enough to follow casting facets');
assert.equal(flankPanelReceipt.maxSurfaceGapM, 0,
  'the panel courses permit no stand-off from the structural side');
assert.ok(near(flankPanelReceipt.contactEmbedM, 0.012),
  'each panel overlaps the casting by twelve millimetres');
assert.ok(near(flankPanelReceipt.extensionBackerDepthM, 0.18));
assert.equal(flankPanelReceipt.allCoursesUseStructuralSurfaceFrames, true);
assert.equal(flankPanelReceipt.furnitureUsesPanelFrames, true);
assert.deepEqual(flankPanelReceipt.seats.filter(seat => seat.side === -1)
  .map(seat => seat.courseIndex), [0, 1, 2, 3, 4]);
assert.deepEqual(flankPanelReceipt.seats.filter(seat => seat.side === 1)
  .map(seat => seat.courseIndex), [0, 1, 2, 3, 4]);
for (const seat of flankPanelReceipt.seats) {
  assert.equal(seat.stations.length, seat.segmentCount + 1);
  assert.ok(seat.stations.every((station, index) => index === 0
    || station.worldZ < seat.stations[index - 1].worldZ),
  'panel stations advance continuously from the bow toward the bustle');
  for (const [stationIndex, station] of seat.stations.entries()) {
    for (const band of ['bottom', 'top']) {
      const panelNormal = new THREE.Vector3(...station[`${band}NormalLocal`]);
      const surface = new THREE.Vector3(...station[`${band}SurfaceLocal`]);
      const inner = new THREE.Vector3(...station[`${band}InnerLocal`]);
      const outer = new THREE.Vector3(...station[`${band}OuterLocal`]);
      assert.ok(near(panelNormal.length(), 1), 'panel surface normal stays normalized');
      assert.ok(panelNormal.x * seat.side > 0,
        'panel surface normal faces away from the turret centerline');
      assert.ok(near(surface.clone().sub(inner).dot(panelNormal), seat.innerFaceOverlapM),
        `panel ${seat.side}/${seat.courseIndex} station ${stationIndex} ${band} remains embedded`);
      assert.ok(near(outer.clone().sub(inner).dot(panelNormal), seat.thicknessM),
        `panel ${seat.side}/${seat.courseIndex} station ${stationIndex} ${band} keeps its armor depth`);
    }
  }
}
assert.ok(flankPanelReceipt.seats.some(seat => seat.backedSegments > 0),
  'courses extending past a casting facet receive a structural backing course');
assert.ok(flankPanelReceipt.seats.some(seat => seat.courseIndex === 4 && seat.backedSegments > 0),
  'the long bustle-side course is tied back into the turret structure');

const panelEquipmentReceipt = turret?.userData.merkava4bPanelEquipmentReceipt;
assert.ok(panelEquipmentReceipt, 'Merkava 4B exposes panel-equipment seating receipts');
assert.equal(panelEquipmentReceipt.revision, 'panel-frame-equipment-r1');
assert.equal(panelEquipmentReceipt.smokeBanks, 2);
assert.equal(panelEquipmentReceipt.allShoesUsePanelFrames, true);
for (const seat of panelEquipmentReceipt.seats) {
  const surfaceNormal = new THREE.Vector3(...seat.surfaceNormalLocal);
  assert.ok(near(surfaceNormal.length(), 1));
  assert.ok(surfaceNormal.x * seat.side > 0,
    'smoke-bank shoe normal faces outward from its supporting side panel');
  assert.ok(Number.isInteger(seat.courseIndex));
  assert.ok(Number.isInteger(seat.jointCourseIndex));
  assert.ok(Number.isInteger(seat.keeperCourseIndex));
}

const chassisReceipt = hull?.userData.merkava4bChassisReceipt;
assert.ok(chassisReceipt, 'Merkava 4B exposes its shortened-bow running-gear receipt');
assert.equal(chassisReceipt.revision, 'connected-short-bow-raised-sprocket-course-r4');
assert.ok(near(chassisReceipt.hullNoseZ, 3.18), 'upper hull nose is 15 cm shorter');
assert.ok(near(chassisReceipt.lowerGlacisToeZ, 3.16),
  'lower-glacis toe remains structurally joined to the shortened upper bow');
assert.ok(near(chassisReceipt.previousLowerGlacisToeZ, 2.56),
  'receipt records the recessed toe that caused the visible regression');
assert.ok(near(chassisReceipt.lowerGlacisKneeZ, 3.04),
  'the knee moves forward so the connected lower plate remains short');
assert.ok(near(chassisReceipt.previousLowerGlacisKneeZ, 2.44));
assert.ok(near(chassisReceipt.upperLowerGlacisJoinM, 0.02),
  'upper and lower glacis stations overlap by the original two-centimetre joint');
assert.ok(near(chassisReceipt.lowerGlacisPlanLengthM, 0.12),
  'the lower glacis remains a compact twelve-centimetre plan run');
assert.ok(near(chassisReceipt.recessedToeCorrectionM, 0.60),
  'the recessed lower face advances sixty centimetres to reconnect');
assert.ok(near(chassisReceipt.glacisFurnitureToeZ, 3.12),
  'glacis furniture remains seated on the shortened bow');
assert.ok(near(chassisReceipt.trackRearShiftM, 0.20),
  'road wheels, return rollers, idlers, and track course move 20 cm rearward');
assert.ok(near(chassisReceipt.sprocketZ, 2.90), 'front sprocket keeps its original station');
assert.ok(near(chassisReceipt.sprocketY, 0.896875), 'front sprocket rises 20 cm');
assert.ok(near(chassisReceipt.previousSprocketY, 0.696875));
assert.ok(near(chassisReceipt.sprocketRaiseM, 0.20));
assert.ok(near(chassisReceipt.idlerZ, -3.25), 'rear idler follows the shifted course');

const tireLayer = tank.root.getObjectByName('gearRoadWheelTires');
assert.ok(tireLayer?.isInstancedMesh, 'road wheels remain on the suspension-driven layer');
const wheelStations = new Set();
for (let instance = 0; instance < tireLayer.count; instance++) {
  tireLayer.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  wheelStations.add(Number(position.z.toFixed(6)));
}
assert.deepEqual([...wheelStations].sort((a, b) => b - a),
  chassisReceipt.roadWheelZs.map(value => Number(value.toFixed(6))).sort((a, b) => b - a),
  'all six suspension stations use the rear-shifted course');

const endWheelCenters = [];
hull.traverse((object) => {
  if (object.name === 'gearEndWheelBody') {
    endWheelCenters.push([
      Number(object.position.y.toFixed(6)),
      Number(object.position.z.toFixed(6)),
    ]);
  }
});
assert.deepEqual([...new Map(endWheelCenters.map(center => [center.join(':'), center])).values()]
  .sort((a, b) => b[1] - a[1]), [[0.896875, 2.9], [0.845625, -3.25]],
  'front sprocket rises without moving fore/aft while the rear idler remains unchanged');

tank.dispose?.();
console.log('merkava4bGeometry.selftest: seated roof, closed gun throat, flush ERA/panels, and connected shortened chassis passed');
