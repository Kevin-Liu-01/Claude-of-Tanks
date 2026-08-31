import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

const tank = createTank('kf51', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
await Promise.resolve();

try {
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const turret = tank.root.getObjectByName('turret');
  const turretDetail = tank.root.getObjectByName('turretDetail');
  assert.ok(hullRig && turretRig && gunRig && turret && turretDetail,
    'KF51 retains canonical hull, turret, gun, and detail geometry');

  const chevron = turretRig.userData.kf51FrontChevronReceipt;
  assert.equal(chevron?.profile, 'kf51-panther-closed-chevron-r3',
    'KF51 publishes the rebuilt closed-chevron front architecture');
  assert.equal(chevron.cheekVolumes, 2, 'KF51 front has one closed cheek volume per side');
  assert.equal(chevron.roofBridgeVolumes, 2,
    'KF51 front cheeks close smoothly into the turret roof');
  assert.equal(chevron.surfacePanelCount, 6,
    'KF51 front keeps six broad chevron panels instead of a noisy shelf stack');
  assert.equal(chevron.multispectralLightCassettes, 2,
    'KF51 front carries two recessed multispectral light cassettes');
  assert.equal(chevron.closedRearFaces, true, 'KF51 chevron volumes remain watertight at the turret');
  assert.equal(chevron.upperLowerHeightMatched, true,
    'KF51 upper cheek and lower return publish an equal-height contract');
  assert.equal(chevron.verticalRearPlane, true,
    'KF51 cheek modules publish the requested vertical-backed side profile');
  assert.equal(chevron.rearPlaneZ, 1.10,
    'KF51 cheek roots align to the turret-front wall instead of overextending');
  assert.equal(chevron.coreFrontPlaneZ, chevron.rearPlaneZ,
    'KF51 ring fill terminates behind the cheek roots');
  assert.equal(chevron.foreRoofStepAlignedToRearPlane, true,
    'KF51 fore roof step no longer protrudes through the upper cheek');
  for (const side of chevron.sides) {
    for (const station of side.stations) {
      assert.ok(Math.abs(station.upperRiseM - station.lowerDropM) < 1e-9,
        `KF51 ${side.side} cheek station ${station.x} has equal upper and lower height`);
      assert.ok(Math.abs(station.upperRearZ - station.lowerRearZ) < 1e-9,
        `KF51 ${side.side} cheek station ${station.x} has a vertical rear edge`);
      assert.equal(station.upperRearZ, chevron.rearPlaneZ,
        `KF51 ${side.side} cheek station ${station.x} meets the shared rear plane`);
      assert.ok(station.ridgeZ > station.upperRearZ,
        `KF51 ${side.side} cheek station ${station.x} projects as |>`);
    }
  }
  assert.ok(chevron.maximumRidgeProjectionM <= 2.48,
    'KF51 chevron ridge remains retracted onto the turret-front envelope');

  const firstTurretHit = (origin, direction) => new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
    0,
    10,
  ).intersectObject(turretRig, true).find((hit) => hit.object.name === 'turret');
  const lowerCheekHit = firstTurretHit([0.8, 1.9, 5], [0, 0, -1]);
  assert.ok(lowerCheekHit && lowerCheekHit.point.z < 2.05,
    'KF51 lower cheek hides the retired 2.30 m-world core face');
  const upperCheekHit = firstTurretHit([1.1, 5, 1.85], [0, -1, 0]);
  assert.ok(upperCheekHit && upperCheekHit.point.y < 2.38,
    'KF51 upper cheek hides the retired 2.45 m-world roof shelf');

  const housing = gunRig.userData.kf51AngularGunHousingReceipt;
  assert.equal(housing?.profile, 'kf51-panther-angular-mantlet-r3',
    'KF51 publishes the enlarged angular moving-gun housing');
  assert.equal(housing.mainHousing, 'closed-tapered-six-plane-wedge',
    'KF51 gun housing is a faceted closed wedge rather than a round roll');
  assert.ok(housing.rearWidthM >= 0.78 && housing.rearHeightM >= 0.59,
    'KF51 angular housing has the requested visual mass at the turret throat');
  assert.equal(housing.forwardClampSides, 6, 'KF51 forward clamp remains visibly faceted');
  assert.equal(housing.roundVisibleTrunnionRetired, true,
    'KF51 no longer exposes the undersized circular trunnion');
  assert.deepEqual(housing.visualGunPivotLocal, [0, 0.38, 0.90],
    'KF51 visible gun is centered lower in the turret opening');
  assert.equal(housing.centeredLowerByM, 0.08,
    'KF51 publishes the complete gun-rig lowering distance');
  const gunWorld = gunRig.getWorldPosition(new THREE.Vector3());
  const authoritativeGunWorld = new THREE.Vector3(
    TANK_SPECS.kf51.armor.turretPivot[0] + TANK_SPECS.kf51.armor.gunPivot[0],
    TANK_SPECS.kf51.armor.turretPivot[1] + TANK_SPECS.kf51.armor.gunPivot[1],
    TANK_SPECS.kf51.armor.turretPivot[2] + TANK_SPECS.kf51.armor.gunPivot[2],
  );
  assert.ok(gunWorld.distanceTo(authoritativeGunWorld) < 1e-9,
    'KF51 visible and authoritative gun pivots coincide in the neutral pose');

  const roofStations = [];
  turretRig.traverse((node) => {
    if (node.userData?.fittingRoot && node.userData.fitting === 'openYokeRws') roofStations.push(node);
  });
  assert.equal(roofStations.length, 1, 'KF51 carries one full open-yoke turret-roof station');
  assert.equal(roofStations[0].userData.stationVariant, 'kf51-panther',
    'KF51 rear station uses its Panther-specific equipment package');
  assert.equal(roofStations[0].userData.lightCount, 5,
    'KF51 rear station carries its five-aperture work-light suite');

  const wheelFinish = hullRig.userData.kf51RoadWheelFinishReceipt;
  assert.deepEqual(wheelFinish, {
    profile: 'kf51-forged-radial-eight-r1',
    stationCountPerSide: 7,
    structuralRibsPerWheel: 8,
    serviceBoltsPerWheel: 10,
    dynamicLayerCount: 6,
    suspensionBound: true,
    duplicateWheelCourse: false,
  }, 'KF51 road wheels publish one suspension-bound forged-face package');
  const dynamicWheelLayers = [];
  hullRig.traverse((node) => {
    if (node.userData?.dynamicWheelFace) dynamicWheelLayers.push(node);
  });
  assert.equal(dynamicWheelLayers.length, wheelFinish.dynamicLayerCount,
    'KF51 wheel face rings, ribs, hubs, and bolts all use canonical gear instances');
  assert.equal(hullRig.userData.runningGearUnitCount, 1,
    'KF51 wheel refinement does not add a duplicate running-gear course');

  // The upper-glacis surface must now be the merged camouflaged hull mesh,
  // rather than an unnamed, solid-tone comparison shell sitting above it.
  const topHullHit = (x, z) => new THREE.Raycaster(
    new THREE.Vector3(x, 4, z),
    new THREE.Vector3(0, -1, 0),
    0,
    10,
  ).intersectObject(hullRig, true)
    .find((hit) => hit.object.isMesh && hit.point.y < 1.7);
  for (const [x, z, label] of [
    [0, 3.0, 'main upper glacis'],
    [0, 2.4, 'former full-width front moat'],
    [1.6, 0, 'former wide turret-side moat'],
  ]) {
    assert.equal(topHullHit(x, z)?.object.name, 'hull',
      `KF51 ${label} exposes the palette-aware camouflaged armor mesh`);
  }

  // These exact side rays used to hit the two long turretDetail rails at
  // x=1.5025/1.4425. Structural returns now live in the camo turret bucket.
  for (const z of [0.95, -0.565]) {
    const detailHits = new THREE.Raycaster(
      new THREE.Vector3(3, 1.8835, z),
      new THREE.Vector3(-1, 0, 0),
      0,
      10,
    ).intersectObject(turretDetail, false);
    assert.equal(detailHits.length, 0,
      `KF51 turret-side armor return at z=${z} is no longer grey detail geometry`);
  }

  assert.deepEqual(hullRig.userData.kf51Finish, {
    kf51HullTurretSeatBridge: 14,
    kf51GlacisShoulderBridge: 4,
    kf51DeckPaletteHardware: 3,
    kf51TurretLowerCollar: 2,
    kf51TrackShoulderL: 2,
    kf51TrackShoulderR: 2,
    kf51TurretMidwallBaseArmor: 1,
    kf51LowerGlacisCamo: 1,
  }, 'KF51 structural finish receipt records every palette-aware shell');

  const frontArmorHit = (x, y) => new THREE.Raycaster(
    new THREE.Vector3(x, y, 4),
    new THREE.Vector3(0, 0, -1),
    0,
    10,
  ).intersectObject(hullRig, true).find((hit) => hit.object.name === 'hull');
  const lowerGlacis = frontArmorHit(0, 0.75);
  assert.ok(lowerGlacis?.point.z > 3.4 && lowerGlacis.object.material?.map,
    'KF51 lower glacis is colored by the merged camouflage armor');
  for (const x of [-1.45, 1.45]) {
    const shoulder = frontArmorHit(x, 1.0);
    assert.ok(shoulder?.point.z > 3.64 && shoulder.object.material?.map,
      `KF51 ${x < 0 ? 'left' : 'right'} track shoulder joins the front mudguard in camo`);
  }

  const sideArmorHit = (y, z) => new THREE.Raycaster(
    new THREE.Vector3(4, y, z),
    new THREE.Vector3(-1, 0, 0),
    0,
    10,
  ).intersectObject(tank.root, true)
    .find((hit) => hit.object.name === 'turret');
  assert.ok(sideArmorHit(1.84, 0)?.object.material?.map,
    'KF51 lower turret collar closes the former black hull gap in camouflage');
  assert.ok(sideArmorHit(1.96, 0)?.object.material?.map,
    'KF51 cheek base is palette-aware armor instead of a shadow rail');

  const mudguards = [];
  tank.root.traverse((object) => {
    if (object.isMesh && object.material?.name === 'cot:kf51-mudguard') mudguards.push(object);
  });
  assert.equal(mudguards.length, 4, 'KF51 keeps four palette-painted corner mudguards');
  for (const mudguard of mudguards) {
    assert.ok(mudguard.material.color.getHex() > 0x202020,
      'KF51 mudguards are no longer pure-black cards');
  }
} finally {
  tank.dispose();
}

console.log('kf51FrontFinish.selftest: chevrons, gun housing, roof station, forged wheels, and camo finish pass');
