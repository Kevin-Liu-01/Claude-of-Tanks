import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

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
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();

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

const obsoleteEraLayers = [];
const externalArmorLayers = [];
turret.traverse((object) => {
  const dimensions = object.geometry?.parameters;
  if (object.isInstancedMesh && object.count === 20
    && near(dimensions?.width ?? 0, 0.28)
    && near(dimensions?.height ?? 0, 0.13)
    && near(dimensions?.depth ?? 0, 0.07)) obsoleteEraLayers.push(object);
  if (object.isMesh && object.name === 'turretExternalArmor') externalArmorLayers.push(object);
});
assert.equal(obsoleteEraLayers.length, 0,
  'ERA no longer repeats one complete camouflage island on an instanced tile');
assert.equal(externalArmorLayers.length, 1,
  'all twenty two-layer cassettes merge into one turret external-armor draw bucket');
const finishReceipt = turret.userData.merkavaEraFinishReceipt;
assert.equal(finishReceipt.baseTiles, 20, 'twenty flank-panel charge bodies are authored');
assert.equal(finishReceipt.coverTiles, 20, 'every charge body receives one inset cover');
assert.equal(finishReceipt.cassetteLayers, 2, 'Mk 4B ERA has a body and service cover');
assert.equal(finishReceipt.camoProjection, 'vehicle-scale-box-uv',
  'camouflage projects across the complete ERA field');

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
assert.ok(chassisReceipt, 'Merkava 4B exposes its projected-bow and rear-exit receipt');
assert.equal(chassisReceipt.revision, 'projected-closed-bow-rear-exit-clearance-r5');
assert.ok(near(chassisReceipt.hullNoseZ, 3.42), 'upper hull prow projects 24 cm farther forward');
assert.ok(near(chassisReceipt.previousHullNoseZ, 3.18));
assert.ok(near(chassisReceipt.bowProjectionM, 0.24));
assert.ok(near(chassisReceipt.lowerGlacisToeZ, 3.40),
  'lower-glacis toe remains structurally joined to the projected upper bow');
assert.ok(near(chassisReceipt.previousLowerGlacisToeZ, 3.16));
assert.ok(near(chassisReceipt.lowerGlacisKneeZ, 3.05),
  'the knee leaves a visible lower-glacis plan run behind the projected toe');
assert.ok(near(chassisReceipt.previousLowerGlacisKneeZ, 3.04));
assert.ok(near(chassisReceipt.upperLowerGlacisJoinM, 0.02),
  'upper and lower glacis stations overlap by the original two-centimetre joint');
assert.ok(near(chassisReceipt.lowerGlacisPlanLengthM, 0.35),
  'the lower glacis projects as a 35 cm plan run');
assert.ok(near(chassisReceipt.glacisFurnitureToeZ, 3.36),
  'glacis furniture advances with the projected bow');
assert.ok(near(chassisReceipt.previousGlacisFurnitureToeZ, 3.12));
assert.ok(near(chassisReceipt.lowerHullRearZ, -2.95));
assert.ok(near(chassisReceipt.previousLowerHullRearZ, -3.70));
assert.ok(near(chassisReceipt.lowerHullForwardShiftM, 0.75),
  'concealed lower hull and rear wedge advance 75 cm away from the rear exit');
assert.ok(near(chassisReceipt.rearExitDoorPlaneZ, -3.20));
assert.ok(near(chassisReceipt.rearExitClearanceM, 0.25),
  'lower hull terminates 25 cm forward of the clamshell-door plane');
assert.ok(near(chassisReceipt.trackRearShiftM, 0.20),
  'road wheels and return rollers retain their 20 cm rearward cadence shift');
assert.ok(near(chassisReceipt.sprocketZ, 2.90), 'front sprocket keeps its original station');
assert.ok(near(chassisReceipt.sprocketY, 0.896875), 'front sprocket rises 20 cm');
assert.ok(near(chassisReceipt.previousSprocketY, 0.696875));
assert.ok(near(chassisReceipt.sprocketRaiseM, 0.20));
assert.ok(near(chassisReceipt.previousIdlerZ, -3.25));
assert.ok(near(chassisReceipt.idlerZ, -3.10), 'rear idler moves 15 cm forward');
assert.ok(near(chassisReceipt.idlerForwardM, 0.15));

const glacisClosureReceipt = hull?.userData.merkava4bGlacisClosureReceipt;
assert.ok(glacisClosureReceipt, 'Merkava 4B closes the upper/lower glacis cavity');
assert.equal(glacisClosureReceipt.revision, 'upper-lower-glacis-web-r1');
assert.ok(near(glacisClosureReceipt.rearStationZM, 2.10));
assert.ok(near(glacisClosureReceipt.frontStationZM, 3.30));
assert.equal(glacisClosureReceipt.buriedEdgeOverlap, true);

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
  .sort((a, b) => b[1] - a[1]), [[0.896875, 2.9], [0.845625, -3.1]],
  'front sprocket keeps its station while the rear idler moves forward inside the track loop');

tank.dispose?.();
console.log('merkava4bGeometry.selftest: seated roof, closed gun throat, flush ERA/panels, projected closed bow, and clear rear exit passed');
