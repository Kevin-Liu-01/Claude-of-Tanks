import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TANK_SPECS } from '../specs.ts';
import { createTank } from '../tankFactory.ts';
import { measureTurretBarrelCircularity } from '../turretBarrelCircularity.ts';

const EPSILON = 1e-6;
const near = (actual, expected, message, epsilon = EPSILON) => {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`);
};
const partCenter = (part) => part.min.map((value, axis) => (value + part.max[axis]) * 0.5);
const findPartAt = (parts, bucket, expectedCenter, message, epsilon = 2e-4) => {
  const part = parts.find((candidate) => candidate.bucket === bucket
    && partCenter(candidate).every((value, axis) => Math.abs(value - expectedCenter[axis]) <= epsilon));
  assert.ok(part, message);
  return part;
};
const overlapM = (a, b, axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
const assertOverlaps = (a, b, message, epsilon = 1e-5) => {
  for (const axis of [0, 1, 2]) {
    assert.ok(overlapM(a, b, axis) > epsilon,
      `${message} on ${['x', 'y', 'z'][axis]} (${overlapM(a, b, axis).toFixed(6)} m)`);
  }
};
const meshPartInParent = (mesh) => {
  mesh.geometry.computeBoundingBox();
  mesh.updateMatrix();
  const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
  return { min: bounds.min.toArray(), max: bounds.max.toArray() };
};

const tank = createTank('t90a', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  assert.equal(TANK_SPECS.t90a.visual.number, '112',
    'RU-112 resolves to the base T-90A profile');

  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const barrel = tank.root.getObjectByName('gun');
  const barrelDark = tank.root.getObjectByName('gunDark');
  const gunMount = gun?.getObjectByName('gunMount');
  const gunMountDark = gun?.getObjectByName('gunMountDark');
  assert.ok(turret && gun && barrel?.geometry && barrelDark?.geometry
    && gunMount?.geometry && gunMountDark?.geometry,
  'T-90A keeps its articulated turret, cannon, and complete recoil housing geometry');
  assert.equal(gun.parent, turret, 'cannon remains owned by the moved turret');
  assert.ok(gunMount.parent === gun,
    'cast mantlet and recoil housing rise with the articulated cannon');
  assert.ok(gunMountDark.parent?.parent === gun,
    'housing seams and apertures rise with the articulated cannon');

  const receipt = turret.userData.t90aSeatReceipt;
  assert.ok(receipt, 'T-90A exposes its turret, Shtora, and cannon adjustment receipt');
  near(turret.position.z, -0.06, 'turret yaw seat moves rearward to the accepted station');
  near(receipt.turretRearwardShiftM, 0.18, 'turret moves rearward by 180 mm');
  near(receipt.shtoraEyeZ, 1.86, 'Shtora housings stay ahead of the advanced cheek ERA');
  near(receipt.shtoraLocalForwardShiftM, 0.06, 'Shtora advances 60 mm from its original local datum');
  near(receipt.shtoraSupportFrontZ, 1.82, 'Shtora support shoes follow the advanced emitters');
  near(receipt.shtoraHousingRearZ, 1.7148, 'Shtora housing rear stays buried in its tapered pedestal');
  near(receipt.shtoraHousingFrontZ, 2.0052, 'complete Shtora housings project beyond the chevron faces');
  near(receipt.shtoraLensFrontZ, 2.0316, 'red lenses remain the frontmost optical surface');
  assert.ok(receipt.shtoraChevronDepthClearanceM >= 0.045,
    'Shtora housing faces clear the advanced ERA by a visible margin');
  assert.ok(receipt.shtoraSupportBodyOverlapM >= 0.10,
    'advanced Shtora bodies remain physically embedded in their support shoes');
  near(receipt.gunRadiusScale, 1.08, 'cannon cross-section grows by eight percent');
  near(receipt.gunAssemblyRaiseM, 0.08,
    'complete cannon and recoil housing rise together by 80 mm');
  near(receipt.gunAxisY, 0.245,
    'raised cannon trunnion is published in turret-local space');
  assert.equal(receipt.cupolaCount, 2, 'RU-112 carries two complete roof cupolas');
  assert.deepEqual(receipt.leftCupola, [-0.35, -0.48], 'left cupola occupies the left roof station');
  assert.deepEqual(receipt.rightCupola, [0.52, -0.42], 'right cupola occupies the right roof station');
  assert.equal(receipt.rightCupolaLightCount, 2, 'right cupola carries two forward lights');
  assert.equal(receipt.leftCupolaMannedMg, 'nsvt', 'left cupola carries the manually served NSVT');
  near(receipt.nsvtRaiseM, 0.08, 'complete NSVT station is raised by 80 mm');
  near(receipt.roofHousingPedestalOverlapM, 0.12,
    'marked roof housing has a positive pedestal overlap');
  near(receipt.aftSensorPedestalOverlapM, 0.015,
    'marked aft sensor has a positive pedestal overlap');
  near(receipt.rightBustleBridgeOverlapM, 0.03,
    'marked asymmetric bustle has a positive bridge overlap');
  assert.deepEqual([gun.position.x, gun.position.z], [0, 0.825],
    'complete cannon trunnion retains its accepted horizontal seat');
  near(gun.position.y, 0.245,
    'complete cannon trunnion occupies the raised turret-local seat');

  barrel.geometry.computeBoundingBox();
  barrelDark.geometry.computeBoundingBox();
  const familyGun = gun.userData.t90FamilyGunReceipt;
  assert.ok(familyGun, 'T-90A publishes its T-90M-derived cannon receipt');
  assert.equal(familyGun.referenceFamily, 't90m-2a46m5-thermal-jacket-r1');
  near(familyGun.sleeveRadiusM, 0.108, 'cannon uses the T-90M thermal sleeve radius');
  near(familyGun.forwardRadiusM, 0.102, 'forward tube uses the T-90M jacket radius');
  near(familyGun.boreRadiusM, 0.062, 'muzzle bore follows the T-90M proportion');
  near(familyGun.muzzleZ, 4.92, 'cannon reaches the T-90M-family muzzle station');
  near(familyGun.assemblyRaiseM, 0.08, 'family receipt records the complete assembly lift');
  assert.ok(barrel.geometry.boundingBox.max.y >= 0.124,
    'visible cannon includes the substantial T-90M muzzle collar');
  assert.ok(barrelDark.geometry.boundingBox.max.y >= 0.129,
    'cannon collars remain substantial around the jacketed tube');
  near(barrel.geometry.boundingBox.max.z, 4.92, 'cannon length reaches the updated muzzle station', 2e-6);
  const barrelCircularity = measureTurretBarrelCircularity(tank);
  assert.equal(barrelCircularity.pass, true, 'T-90A cannon cross-sections remain circular');
  assert.ok(barrelCircularity.worst?.aspectRatio <= 1.03,
    `T-90A faceting stays round (${barrelCircularity.worst?.aspectRatio})`);

  const parts = tank.root.userData.combatGeometryParts;
  const foundationCrown = findPartAt(parts, 'turret', [0, 0.55, -0.025],
    'welded foundation crown remains available as the roof load path');
  const roofPedestal = findPartAt(parts, 'turret', [-0.78, 0.57, -0.03],
    'marked ESSA roof housing receives its widened pedestal');
  const roofHousing = findPartAt(parts, 'turret', [-0.88, 0.725, -0.06],
    'marked ESSA roof housing remains present');
  assertOverlaps(foundationCrown, roofPedestal,
    'ESSA pedestal overlaps the welded foundation crown');
  assertOverlaps(roofPedestal, roofHousing,
    'ESSA pedestal overlaps the marked roof housing');

  const foundationShelf = findPartAt(parts, 'turret', [0, 0.3125, -0.95],
    'welded foundation shelf remains available as the aft load path');
  const aftSensorPedestal = findPartAt(parts, 'turret', [-0.93, 0.62, -1.26],
    'marked aft sensor receives its structural shoe');
  const aftSensor = findPartAt(parts, 'turretDark', [-0.93, 0.805, -1.33],
    'marked aft sensor post remains present');
  assertOverlaps(foundationShelf, aftSensorPedestal,
    'aft sensor shoe overlaps the welded foundation shelf');
  assertOverlaps(aftSensorPedestal, aftSensor,
    'aft sensor shoe overlaps the marked sensor post');

  const centralBustle = findPartAt(parts, 'turret', [0, 0.2375, -1.62],
    'central bustle foundation remains present');
  const bustleBridge = findPartAt(parts, 'turret', [1.05, 0.0375, -1.859],
    'marked right bustle receives its inboard bridge');
  const bustleShoulder = findPartAt(parts, 'turret', [1.325, 0.115, -1.624],
    'marked right bustle shoulder remains present');
  const forwardBin = findPartAt(parts, 'turret', [1.48, 0.14, -1.50],
    'forward asymmetric bustle bin remains present');
  const rearBin = findPartAt(parts, 'turret', [1.48, 0.14, -1.82],
    'rear asymmetric bustle bin remains present');
  assertOverlaps(centralBustle, bustleBridge,
    'right bustle bridge overlaps the central bustle');
  assertOverlaps(bustleBridge, bustleShoulder,
    'right bustle bridge overlaps the outboard shoulder');
  assertOverlaps(bustleShoulder, forwardBin,
    'outboard shoulder overlaps the forward asymmetric bin');
  assertOverlaps(bustleShoulder, rearBin,
    'outboard shoulder overlaps the rear asymmetric bin');

  const cupolaParts = parts.filter((part) => part.bucket === 'turretCupola');
  const hatchParts = parts.filter((part) => part.bucket === 'turretHatch');
  assert.equal(cupolaParts.length, 4,
    'each roof station has a structural cupola base and upper rim');
  assert.equal(hatchParts.length, 2,
    'each cupola is closed by its own structural hatch lid');

  const rightLampLenses = parts.filter((part) => {
    if (part.bucket !== 'turretGlass') return false;
    const width = part.max[0] - part.min[0];
    const depth = part.max[2] - part.min[2];
    const centerX = (part.min[0] + part.max[0]) * 0.5;
    return Math.abs(width - 0.084) < 2e-3
      && Math.abs(depth - 0.012) < 2e-5
      && centerX > 0.3;
  });
  assert.equal(rightLampLenses.length, 2,
    'two recessed lenses physically occupy the right cupola lamp housings');

  const exactMg = turret.children.find((child) => child.userData?.fittingRoot
    && child.userData.fitting === 'pintleMG'
    && child.getObjectByName('t90a_nsvt_barrel'));
  assert.ok(exactMg, 'the T-90A-specific NSVT is published as one exact fitting');
  assert.equal(exactMg.userData.fittingExact, true,
    'the exact NSVT is recognized without replacing it with generic geometry');
  assert.equal(exactMg.parent, turret, 'the complete NSVT assembly is turret-owned');
  assert.equal(exactMg.children.filter((child) => child.isMesh).length, 9,
    'the exact NSVT retains its nine connected visible members');
  const raisedBarrel = meshPartInParent(exactMg.getObjectByName('t90a_nsvt_barrel'));
  near(raisedBarrel.max[0] - raisedBarrel.min[0], 0.058,
    'the exact fitting retains the full-length NSVT barrel diameter', 2e-4);
  near(raisedBarrel.max[2] - raisedBarrel.min[2], 0.64,
    'the exact fitting retains the full-length forward NSVT barrel');
  near((raisedBarrel.min[1] + raisedBarrel.max[1]) * 0.5, 0.955,
    'the full-length NSVT barrel follows the raised weapon station');
  const raisedPintle = meshPartInParent(exactMg.getObjectByName('t90a_nsvt_pintle'));
  const raisedCradle = meshPartInParent(exactMg.getObjectByName('t90a_nsvt_cradle'));
  const raisedReceiver = meshPartInParent(exactMg.getObjectByName('t90a_nsvt_receiver'));
  const leftHatch = findPartAt(parts, 'turretHatch', [-0.35, 0.718, -0.48],
    'left structural hatch remains beneath the NSVT station');
  assert.ok(overlapM(leftHatch, raisedPintle, 1) > 0,
    'elongated NSVT pintle remains buried in the left hatch station');
  assertOverlaps(raisedPintle, raisedCradle,
    'elongated NSVT pintle overlaps the raised cradle');
  assertOverlaps(raisedCradle, raisedReceiver,
    'raised cradle overlaps the NSVT receiver');

  const shtoraBodies = parts.filter((part) => {
    if (part.bucket !== 'turretDark') return false;
    const width = part.max[0] - part.min[0];
    const height = part.max[1] - part.min[1];
    const depth = part.max[2] - part.min[2];
    const centerZ = (part.min[2] + part.max[2]) * 0.5;
    return Math.abs(width - 0.24 * 1.32) < 2e-5
      && Math.abs(height - 0.27 * 1.32) < 2e-5
      && Math.abs(depth - 0.22 * 1.32) < 2e-5
      && Math.abs(centerZ - receipt.shtoraEyeZ) < 2e-5;
  });
  assert.equal(shtoraBodies.length, 2,
    'both complete Shtora emitter bodies occupy the advanced seat');
  const chevron = turret.userData.t90AChevronEraReceipt;
  assert.ok(chevron, 'T-90A publishes its advanced chevron receipt');
  near(chevron.forwardM, 0.24,
    'chevron carriers advance 240 mm from the base cheek datum');
  for (const body of shtoraBodies) {
    assert.ok(body.max[2] - chevron.frontmostTileZM >= 0.045,
      'actual Shtora housing geometry stands visibly ahead of the frontmost ERA tile');
  }

  for (const yawDeg of [0, 45, -90, 180]) {
    turret.rotation.y = THREE.MathUtils.degToRad(yawDeg);
    tank.root.updateMatrixWorld(true);
    assert.equal(gun.parent, turret,
      `cannon follows the rearward turret through yaw ${yawDeg}`);
  }
} finally {
  tank.dispose();
}

const burlak = createTank('t90a_burlak', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const burlakTurret = burlak.root.getObjectByName('rig_turret');
  near(burlakTurret.position.z, 0.12,
    'Burlak preserves its independently accepted turret seat');
  assert.equal(burlakTurret.userData.t90aSeatReceipt, undefined,
    'RU-112 adjustment receipt does not leak into Burlak');
  assert.equal(burlak.root.userData.combatGeometryParts.some((part) =>
    part.bucket === 'turretCupola' || part.bucket === 'turretHatch'), false,
  'RU-112 structural roof buckets do not leak through Burlak rebuild');
} finally {
  burlak.dispose();
}

const terminator = createTank('bmpt_t90', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  assert.equal(terminator.root.userData.combatGeometryParts.some((part) =>
    part.bucket === 'turretCupola' || part.bucket === 'turretHatch'), false,
  'RU-112 structural roof buckets do not leak into the BMPT replacement station');
} finally {
  terminator.dispose();
}

console.log('t90ATurretSeat.selftest: RU-112 turret, Shtora eyes, and round enlarged cannon verified');
