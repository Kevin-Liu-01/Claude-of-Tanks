import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('t80u', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const hull = hullRig?.getObjectByName('hull');
  const turret = turretRig?.getObjectByName('turret');
  const turretExternalArmor = turretRig?.getObjectByName('turretExternalArmor');
  assert.ok(hullRig && turretRig && gunRig && hull?.isMesh && turret?.isMesh
    && turretExternalArmor?.isMesh,
    'T-80U keeps hull, turret, and gun geometry on articulated rigs');

  const glacis = hullRig.userData.t80uHullGlacisReceipt;
  assert.ok(glacis, 'T-80U exposes its lower-glacis attachment receipt');
  assert.equal(glacis.architecture, 'raised-overlapping-lower-glacis');
  assert.equal(glacis.lowerGlacisTopY, glacis.matingNoseBottomY,
    'lower glacis and steep nose share one attachment datum');
  assert.ok(glacis.overlapLengthM >= 0.35,
    'lower glacis overlaps the nose underside by at least 350 mm');
  assert.equal(glacis.attachmentGapM, 0,
    'lower glacis permits no daylight below the steep nose');

  const hullClosure = hullRig.userData.t80uHullClosureReceipt;
  assert.ok(hullClosure, 'T-80U exposes its under-glacis and fender closure receipt');
  assert.equal(hullClosure.centralSeamGapM, 0);
  assert.equal(hullClosure.bowWebGapM, 0);
  assert.equal(hullClosure.shoulderSeamGapM, 0);
  assert.equal(hullClosure.frontFenderRisers, 2,
    'both front skirts connect structurally to their fender caps');
  assert.equal(hullClosure.trackEnvelopeIntrusions, 0);
  assert.ok(hullClosure.minimumReturnTrackClearanceM >= 0.17);

  const rearFuel = hullRig.userData.t80uRearFuelReceipt;
  assert.ok(rearFuel, 'T-80U exposes its supported rear auxiliary-fuel receipt');
  assert.equal(rearFuel.fuelDrums, 2);
  assert.equal(rearFuel.axis, 'x', 'both rear fuel drums sit transversely');
  assert.ok(rearFuel.drumDiameterM >= 0.48 && rearFuel.drumLengthM >= 1.20,
    'rear fuel drums remain legible in rear and quarter views');
  assert.ok(rearFuel.exhaustShelfOverlapM >= 0.09,
    'rear fuel drums bear on the exhaust shelf rather than floating');

  const hullLift = hullRig.userData.t80uHullLiftReceipt;
  assert.ok(hullLift, 'T-80U exposes its fixed-running-gear hull-lift receipt');
  assert.equal(hullLift.architecture, 'lifted-hull-fixed-running-gear');
  assert.equal(hullLift.hullBodyLiftM, 0.18,
    'armored hull package receives the requested substantial 180 mm lift');
  assert.equal(hullLift.runningGearTranslated, false,
    'hull stance correction leaves the running gear in place');
  assert.equal(hullLift.roadWheelCenterY, 0.42);
  assert.equal(hullLift.loadedTrackY, 0.055);
  assert.equal(hullLift.liftedServiceLockers, 2);
  assert.equal(hullLift.rearUnditchingLog, true);
  assert.ok(hullLift.unditchingLogDiameterM >= 0.24
    && hullLift.unditchingLogLengthM >= 2.2,
  'rear unditching log is large enough to remain legible in the rear view');

  const position = hull.geometry.getAttribute('position');
  const normal = hull.geometry.getAttribute('normal');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let raisedLowerTopFaces = 0;
  let matingNoseUndersideFaces = 0;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    n.fromBufferAttribute(normal, index).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (Math.abs(centroid.y - glacis.lowerGlacisTopY) > 0.006
      || centroid.z < 2.95 || centroid.z > 3.33
      || Math.abs(centroid.x) > 1.15) continue;
    if (n.y > 0.98) raisedLowerTopFaces += 1;
    if (n.y < -0.98) matingNoseUndersideFaces += 1;
  }
  assert.ok(raisedLowerTopFaces >= 1,
    'raised lower-glacis top reaches the lifted mating plane');
  assert.ok(matingNoseUndersideFaces >= 1,
    'steep-nose underside remains on the same lifted mating plane');

  assert.equal(turretRig.userData.t80uTurretEraReceipt, undefined,
    'owner-rejected replacement turret/ERA architecture stays removed');

  const modernizedTurret = turretRig.userData.t80uT90StyleTurretReceipt;
  assert.ok(modernizedTurret,
    'T-80U exposes its cast-dome T-90-style protection and equipment receipt');
  assert.equal(modernizedTurret.architecture, 'cast-dome-t90-k5-package');
  assert.equal(modernizedTurret.replacementTurret, false,
    'modernized protection preserves the characteristic T-80U cast dome');
  assert.equal(modernizedTurret.frontCarrierSurfacesPerSide, 4,
    'each turret cheek carries two joined Kontakt-5 rows across two plan surfaces');
  assert.equal(modernizedTurret.frontEraTilesPerSide, 12,
    'every chevron carrier surface exposes three distinct Kontakt-5 tiles');
  assert.ok(modernizedTurret.flankEraModulesPerSide >= 5,
    'Kontakt-5 continues into at least five flank return modules per side');
  assert.ok(modernizedTurret.crownEraModulesPerSide >= 3,
    'low crown protection covers both roof shoulders without blocking hatches');
  assert.ok(modernizedTurret.eraSupportEmbedM >= 0.04,
    'ERA support shoes overlap their armor carriers instead of floating');
  assert.equal(modernizedTurret.plantedSightFoundation, true);
  assert.equal(modernizedTurret.plantedCommanderStation, true);
  assert.equal(modernizedTurret.plantedSmokeFoundations, true);
  assert.equal(modernizedTurret.rearEquipmentReseated, true);
  assert.equal(modernizedTurret.machineGunCount, 2,
    'T-80U roof carries two complete machine-gun stations');
  assert.deepEqual([...modernizedTurret.machineGunTypes], ['NSVT Utyos', 'PK-pattern GPMG']);
  assert.equal(modernizedTurret.gunFlankLightCount, 2,
    'paired armored lights flank the main-gun mask');
  assert.equal(modernizedTurret.rearSoftStowageBundles, 2);
  assert.equal(modernizedTurret.rearAmmoBoxes, 1);
  assert.equal(modernizedTurret.canonicalCastProfile, 'standard');
  assert.equal(modernizedTurret.canonicalCastReference, 't80/t80b/ua_t80u_kursk');
  assert.ok(Math.abs(modernizedTurret.frontChevronRaisedToUpperCheekM - 0.03) <= 1e-9,
    'lowered T-80U chevron remains seated on the cast upper cheek');
  assert.equal(modernizedTurret.frontChevronVerticalReseatM, 0.04,
    'T-80U records the requested 40 mm vertical-Y chevron reseat');
  assert.equal(modernizedTurret.frontChevronForwardM, 0.14,
    'T-80U frontal chevron restores its proven fore/aft Z-axis seat');
  assert.equal(modernizedTurret.frontEquipmentForwardM, 0.30,
    'paired front equipment assemblies are reseated ahead of the chevron');
  assert.ok(modernizedTurret.frontEquipmentFaceClearanceM >= 0.04,
    'front equipment faces remain visibly clear of the ERA tile faces');
  assert.equal(modernizedTurret.baseShellEquipmentRelativeTransformPreserved, true,
    'T-80U turret lowering retains every equipment seat relative to the shell');
  assert.equal(modernizedTurret.turretAssemblyLoweringM, 0.04,
    'T-80U complete rotating package sits 40 mm lower on the hull');
  assert.equal(modernizedTurret.turretArmorSeatDropM, 0.025,
    'external armor and attached equipment settle 25 mm into the cast surface');
  assert.equal(modernizedTurret.commanderCupolaReseatM, 0.22,
    'commander cupola no longer begins deep inside the cast roof');
  assert.equal(modernizedTurret.commanderWeaponReseatM, 0.22,
    'Utyos receiver follows the corrected commander-station seat');
  assert.equal(modernizedTurret.roofEquipmentClippedIntoTurret, false);
  assert.ok(Math.abs((modernizedTurret.previousCrownWorldY
    - modernizedTurret.canonicalCrownWorldY) - modernizedTurret.turretAssemblyLoweringM) <= 0.005,
  'standardized shell crown follows the complete 40 mm turret lowering');

  const machineGuns = [];
  tank.root.traverse((object) => {
    if (object.userData.fittingRoot && object.userData.fitting === 'pintleMG') {
      machineGuns.push(object);
    }
  });
  assert.equal(machineGuns.length, 2,
    'both machine guns exist as full shared fittings, not hand-authored rods');

  const mantlet = gunRig.userData.t80uMantletReceipt;
  assert.ok(mantlet, 'T-80U exposes its compact mantlet receipt');
  assert.equal(mantlet.architecture, 'compact-rounded-rocking-shield');
  assert.ok(mantlet.widthM >= 0.68 && mantlet.widthM <= 0.72,
    'mantlet spans the central K-5 valley without covering the cheek fields');
  assert.ok(mantlet.heightM <= 0.50,
    'mantlet remains compact against the low Soviet turret face');
  assert.ok(mantlet.rearEmbedM >= 0.08,
    'rocking shield enters the turret nose deeply enough to prevent daylight');
  assert.equal(mantlet.supportedUpperLip, true);
  assert.equal(mantlet.supportedLowerLip, true);
  assert.equal(mantlet.canvasBootRing, true);
  assert.equal(mantlet.gunOwned, true,
    'the complete mantlet pitches with the gun');
  assert.equal(mantlet.materialBucketMerged, true,
    'mantlet detail remains merged into existing material buckets');

  const cannon = gunRig.userData.t80uCannonScaleReceipt;
  assert.ok(cannon, 'T-80U exposes its canonical T-80 cannon-scale receipt');
  assert.equal(cannon.referenceProfile, 't80');
  assert.equal(cannon.weapon, '2A46M-1');
  assert.equal(cannon.tubeRadiusM, 0.128);
  assert.equal(cannon.sleeveRadiusM, 0.130);
  assert.equal(cannon.seamRadiusM, 0.132);
  assert.equal(cannon.muzzleZM, 5.67);
  assert.equal(cannon.boreRadiusM, cannon.tubeRadiusM);
  assert.equal(cannon.trueCircularTube, true);

  const gun = gunRig.getObjectByName('gun');
  assert.ok(gun?.isMesh, 'T-80U exposes merged cannon geometry');
  const gunPosition = gun.geometry.getAttribute('position');
  let cannonMaxZ = -Infinity;
  let muzzleRadiusM = 0;
  for (let index = 0; index < gunPosition.count; index += 1) {
    const x = gunPosition.getX(index);
    const y = gunPosition.getY(index);
    const z = gunPosition.getZ(index);
    cannonMaxZ = Math.max(cannonMaxZ, z);
    if (z >= 5.20) muzzleRadiusM = Math.max(muzzleRadiusM, Math.hypot(x, y + 0.054));
  }
  assert.ok(Math.abs(cannonMaxZ - cannon.muzzleZM) <= 1e-6,
    'T-80U cannon reaches the canonical T-80 muzzle station');
  assert.ok(Math.abs(muzzleRadiusM - cannon.tubeRadiusM) <= 1e-6,
    'T-80U muzzle segment carries the full canonical T-80 tube radius');

  tank.root.updateMatrixWorld(true);
  const gunAxisWorld = gunRig.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(gunRig.position.y - 0.30) < 1e-6,
    'complete T-80U gun package compensates for the standardized ring origin');
  assert.ok(Math.abs(turretRig.position.y - 1.50) < 1e-6,
    'turret rig lowers the complete rotating package onto the hull shoulder');
  assert.ok(Math.abs(gunAxisWorld.y - 1.80) < 1e-6,
    'T-80U gun axis follows the complete 40 mm turret lowering');

  const runningGear = hullRig.userData.runningGearReceipts?.[0];
  assert.ok(runningGear, 'T-80U exposes its native running-gear receipt');
  assert.equal(runningGear.wheelY, 0.42,
    'road-wheel centers stay fixed against the loaded tread run');
  assert.equal(runningGear.botY, 0.055,
    'loaded tread run stays planted on the established ground datum');
  assert.equal(runningGear.topY, 0.94,
    'return course is raised under the side skirts');
  const centralReturnPoints = runningGear.loopPoints
    .filter(([z, y]) => Math.abs(z) <= 1.8 && y > 0.5);
  assert.ok(Math.min(...centralReturnPoints.map(([, y]) => y)) >= 1.074,
    'raised return course stays continuously above 1.074 m across the wheel bay');
  assert.deepEqual(runningGear.sprocket, { z: -2.89, y: 0.90, r: 0.21 },
    'rear tread wrap remains concentric with the calibrated sprocket');
  assert.deepEqual(runningGear.idler, { z: 2.98, y: 0.84, r: 0.21 },
    'front tread wrap remains concentric with the calibrated idler');

  turret.geometry.computeBoundingBox();
  assert.ok(turret.geometry.boundingBox.max.x <= 1.67
    && turret.geometry.boundingBox.min.x >= -1.67,
  'restored turret stays inside its former calibrated width');
  turretExternalArmor.geometry.computeBoundingBox();
  assert.ok(turretExternalArmor.geometry.boundingBox.max.z >= 1.60,
    'restored clamshell reaches forward around the compact mantlet valley');

  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(turret.parent, turretRig, `turret armor remains turret-owned through yaw ${yaw}`);
    assert.equal(gunRig.parent, turretRig, `gun remains turret-owned through yaw ${yaw}`);
  }
} finally {
  tank.dispose();
}

console.log('t80UTurretGlacis.selftest: raised bow joint, dense cast-dome K-5 turret, and compact rounded mantlet verified');
