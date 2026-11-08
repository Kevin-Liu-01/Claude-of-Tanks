import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

// Round 267 rebuild: `cv90` is the modernised 40 mm Strf 9040 and `cv90_mk4_concept` a CV90 Mk IV hull with a modern
// two-man 50 mm turret. Both share the CV90 hull/armour/stern/running-gear construction in place (cv90.ts) with their
// own measured dimensions; turrets, guns and mission kit are each vehicle's own. Reference packets:
// ~/cot-lanes/ifv-modern-267-evidence/research/{cv90,cv90_mk4_concept}/.
const source = readFileSync(new URL('./cv90.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from ['"].*sweden\.ts['"]/,
  'CV90 family does not call the legacy Swedish builder pack');
assert.doesNotMatch(source, /Downloads|\.glb|\.obj|\.zip/,
  'comparison sources never enter the playable runtime path');
assert.doesNotMatch(source, /buildCv90Family|Cv90Config/,
  'the two requested vehicles are not variants of a configurable family builder');
assert.doesNotMatch(source, /from ['"].*(?:china|type99).*['"]|buildZTZ|buildType99/i,
  'CV90 turret identity never imports or calls a foreign-family builder');
assert.doesNotMatch(source, /height:\s*\[/,
  'CV90 hull and turret caps never use non-planar per-vertex height rings');
assert.doesNotMatch(source, /inset:\s*\[/,
  'CV90 hull and turret armor rings shrink monotonically as complete planes');
for (const functionName of [
  'buildCv90Hull', 'buildCv90RunningGear', 'buildCv90Turret',
  'buildCv90MkivHull', 'buildCv90MkivRunningGear', 'buildCv90MkivTurret',
  'cv90HullShell', 'cv90ArmourCourse', 'cv90Stern', 'cv90RunningGear',
]) {
  assert.match(source, new RegExp(`function ${functionName}\\(`),
    `${functionName} is authored in cv90.ts`);
}

const expected = Object.freeze({
  cv90: Object.freeze({
    name: 'CV90', tier: 4, caliber: 40, weight: 37, // 258: the shown tier
    dims: Object.freeze({ hullLengthM: 5.904, overallLengthM: 6.57, widthM: 3.258, heightM: 3.06 }),
    hullReceiptKey: 'cv90IndependentHullReceipt',
    turretReceiptKey: 'cv90IndependentTurretReceipt',
    designLineage: 'strf9040-modernised-267',
    hullConstruction: 'cv90-t-section-hull-long-glacis-v8',
    turretConstruction: 'strf9040-wedge-cheeks-raked-panels-v8',
    gunAssembly: 'buried-mask-tapered-cradle-40mm-v4',
    gunArchitecture: 'buried-mask-tapered-cradle-cover-finned-jacket-v4',
    frontArmorShell: 'wedge-cheeks-open-gun-channel',
    rwsName: 'cv90K2bStyleRws', rwsScale: 0.80,
    turretPivotZ: -0.432,
    trackWidth: 0.50, xc: 1.30, sideStations: 11, guided: false,
    // the loaded run leaves the ground under the rear road wheel's axle
    rearTrackDepartureZ: -1.76,
  }),
  cv90_mk4_concept: Object.freeze({
    name: 'CV90 Mk 4 Concept', tier: 7, caliber: 50, weight: 40, // 258: the shown tier
    dims: Object.freeze({ hullLengthM: 6.282, overallLengthM: 7.596, widthM: 3.636, heightM: 3.528 }),
    hullReceiptKey: 'cv90MkivIndependentHullReceipt',
    turretReceiptKey: 'cv90MkivIndependentTurretReceipt',
    designLineage: 'cv90-mkiv-hull-267',
    hullConstruction: 'cv90-mkiv-t-section-hull-tall-nose-v8',
    turretConstruction: 'cv90-mkiv-two-man-50mm-aps-v8',
    gunAssembly: 'buried-mask-closed-mantlet-50mm-v4',
    gunArchitecture: 'buried-mask-closed-mantlet-50mm-v4',
    frontArmorShell: 'raked-front-closed-mantlet-housing',
    rwsName: 'cv90MkivK2bStyleRws', rwsScale: 0.90,
    turretPivotZ: -0.396,
    trackWidth: 0.57, xc: 1.33, sideStations: 11, guided: true,
    rearTrackDepartureZ: -1.88,
  }),
});

const bounds = new Map();
for (const [id, target] of Object.entries(expected)) {
  const spec = getSpec(id);
  assert.ok(spec, `${id} is registered`);
  assert.equal(spec.name, target.name);
  assert.equal(tankTier(id), target.tier, `${id} is assigned to its requested tier`);
  assert.equal(spec.role, 'ifv');
  assert.equal(spec.nation, 'Sweden');
  assert.equal(spec.weightTons, target.weight);
  assert.equal(spec.gun.caliberMm, target.caliber);
  assert.deepEqual(spec.dims, target.dims);
  assert.equal(spec.armor.turretPivot[2], target.turretPivotZ,
    `${id} turret is seated slightly aft on its roof`);
  assert.equal(spec.gun.shells.some((shell) => shell.guided), target.guided,
    `${id} guided-weapon state matches its variant package`);

  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    const turret = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    assert.ok(hull && turret && gun, `${id} retains the canonical articulated rig`);
    const scaleReceipt = hull.userData.advancedIfvScaleReceipt;
    assert.equal(scaleReceipt?.vehicleScale, 0.9,
      `${id} is uniformly reduced by ten percent`);
    assert.equal(scaleReceipt?.specSpatialFrameScaled, true,
      `${id} gameplay/anatomy frame follows the compact visual`);
    assert.equal(scaleReceipt?.muzzleAnchorScaled, true,
      `${id} firing and effects origin follows the compact gun frame`);
    assert.equal(scaleReceipt?.bakedBucketGeometry, true,
      `${id} armor, skirts, fittings, and running gear share the compact frame`);
    assert.equal(turret.userData.advancedIfvScaleReceipt, scaleReceipt,
      `${id} hull and turret share one scale receipt`);

    const hullReceipt = hull.userData[target.hullReceiptKey];
    const turretReceipt = turret.userData[target.turretReceiptKey];
    assert.ok(hullReceipt && turretReceipt, `${id} exposes hull/turret receipts`);
    assert.equal(hullReceipt.firstPartyProceduralOnly, true);
    assert.equal(hullReceipt.externalGeometryLoaded, false);
    assert.equal(hullReceipt.sharedCv90Construction, 'cv90-hull-armour-stern-gear-v1',
      `${id} uses the shared CV90 hull construction in place`);
    assert.equal(hullReceipt.designLineage, target.designLineage);
    assert.equal(hullReceipt.hullConstruction, target.hullConstruction);
    assert.equal(hullReceipt.roadWheelsPerSide, 7);
    assert.equal(hullReceipt.canonicalTrackCourses, 1);
    assert.equal(hullReceipt.duplicateTrackMeshes, 0);
    assert.equal(hullReceipt.sideArmorStationsPerSide, target.sideStations);
    assert.equal(hullReceipt.sideArmorCourses, 2);
    assert.equal(hullReceipt.planarRoofCell, true);
    assert.equal(hullReceipt.upperGlacisConstruction, 'continuous-loft-glacis');
    assert.equal(hullReceipt.monotonicArmorInset, true);
    assert.equal(hullReceipt.concaveSurfaceCount, 0);
    assert.equal(hullReceipt.lowerHullFusion, 'continuous-raked-belly-to-nose-v3');
    assert.equal(hullReceipt.frontDrive, true, `${id} drives through front sprockets`);
    assert.equal(hullReceipt.rearTroopDoor, true);
    assert.equal(hullReceipt.rearTrackDepartureZM, target.rearTrackDepartureZ);
    assert.equal(turretReceipt.sharedStructuralBuilder, false);
    assert.equal(turretReceipt.identityFamily, 'cv90-native');
    assert.equal(turretReceipt.foreignFamilyGeometryReused, false);
    assert.equal(turretReceipt.turretConstruction, target.turretConstruction);
    assert.equal(turretReceipt.gunAssembly, target.gunAssembly);
    assert.equal(turretReceipt.planarRoofCrown, true);
    assert.equal(turretReceipt.monotonicArmorInset, true);
    assert.equal(turretReceipt.concaveSurfaceCount, 0);
    assert.equal(turretReceipt.integratedRearBustle, true);
    assert.equal(turretReceipt.frontArmorShell, target.frontArmorShell);
    assert.equal(turretReceipt.equipmentReseatedForShell, true);
    assert.equal(turretReceipt.remoteMachineGunTower,
      'k2b-style-complete-open-yoke-rws');
    assert.equal(gun.userData.cv90GunAssemblyReceipt.architecture, target.gunArchitecture);
    assert.equal(gun.userData.cv90GunAssemblyReceipt.movingWithGun, true);
    assert.equal(gun.userData.cv90GunAssemblyReceipt.surroundsMainBarrel, true);
    assert.equal(gun.userData.cv90GunAssemblyReceipt.rootJoinedToTurretFace, true);
    assert.equal(gun.userData.cv90GunAssemblyReceipt.mainGunCaliberMm, target.caliber);
    if (id === 'cv90') {
      assert.equal(turretReceipt.wedgeCheeksPerSide, 1);
      assert.equal(turretReceipt.allAroundOptics, true);
    } else {
      assert.equal(turretReceipt.apsRadarFaces, 4);
      assert.equal(turretReceipt.apsLaunchers, 2);
      assert.equal(turretReceipt.launcherTubes, 2);
      assert.equal(turretReceipt.panoramicCommanderSight, true);
      assert.equal(turretReceipt.sideEquipmentSeat, 'raised-pod-arm-v1');
      assert.equal(gun.userData.cv90GunAssemblyReceipt.closedNoseFace, true);
      assert.equal(gun.userData.cv90GunAssemblyReceipt.trunnionRecessM, 0.18 * 0.9);
      assert.ok(Math.abs(gun.position.z - 1.16 * 0.9) < 1e-6,
        `${id} complete cannon rig is recessed into the turret`);
    }
    assert.equal(gun.getObjectByName('rig_muzzle')?.position.z,
      id === 'cv90_mk4_concept' ? 3.76 * 0.9 : 3.12 * 0.9,
      `${id} publishes the correct compact muzzle station`);
    assert.ok(tank.root.getObjectByName('muzzleBoreShadowRim'),
      `${id} cannon has a recessed bore`);

    const gear = hull.userData.runningGearReceipts?.at(-1);
    assert.equal(hull.userData.runningGearUnitCount, 1,
      `${id} owns one canonical animated track course`);
    assert.equal(gear?.wheelZs.length, 7, `${id} has seven road wheels per side`);
    assert.equal(gear?.trackPatternId, 'compact-ifv');
    assert.equal(gear?.trackW, target.trackWidth);
    const groundRun = gear.loopPoints.filter(([, y]) => Math.abs(y - gear.botY) < 1e-6).map(([z]) => z);
    assert.ok(Math.abs(Math.min(...groundRun) - target.rearTrackDepartureZ) < 1e-6,
      `${id} flat run leaves at the rear road wheel`);
    // the drive sprocket stands high at the front: the course's front end is ahead of and above its rear end
    const courseFront = Math.max(...gear.loopPoints.map(([z]) => z));
    const courseRear = Math.min(...gear.loopPoints.map(([z]) => z));
    assert.ok(courseFront > Math.max(...gear.wheelZs) + 0.6 && -courseRear > -Math.min(...gear.wheelZs) + 0.6,
      `${id} track wraps a front sprocket and a rear idler beyond the road-wheel run`);
    assert.equal(gear?.xcRight, target.xc,
      `${id} track inner face is seated against its own belly section`);
    assert.equal(gear?.suspensionDynamic, true);
    assert.equal(gear?.suspensionPlacement, 'inboard-behind-road-wheel');
    assert.ok(tank.root.getObjectByName('hullRubber') === undefined,
      `${id} carries no detached full-length lower rubber strip`);

    const rws = tank.root.getObjectByName(target.rwsName);
    assert.ok(rws?.parent === turret, `${id} K2B-style RWS is directly turret-owned`);
    assert.equal(rws?.userData.fitting, 'openYokeRws');
    assert.equal(rws?.userData.designFamily, 'abramsx-open-yoke-v1');
    assert.equal(rws?.userData.stationVariant, 'korean-twin');
    assert.equal(rws?.userData.sizeStandard, 'k2b-compact-tower');
    assert.equal(rws?.userData.scale, target.rwsScale);
    assert.equal(rws?.userData.hasWeapon, true);
    assert.equal(rws?.userData.hasVisibleFeedBelt, true);
    assert.ok(rws?.getObjectByName('openYokeRwsMachineGun'),
      `${id} RWS includes its complete machine-gun assembly`);

    // The measured envelope (world frame, after the 0.9 scale): the hull's modular armour and the whole vehicle.
    const armour = new Box3();
    hull.traverse((o) => { if (o.isMesh && o.name === 'hullExternalArmor') armour.expandByObject(o); });
    const whole = new Box3().setFromObject(tank.root);
    const armourSize = armour.getSize(new Vector3()), size = whole.getSize(new Vector3());
    assert.ok(armourSize.x > 2.9 && armourSize.x < 3.4,
      `${id} modular armour spans a real CV90's width (${armourSize.x.toFixed(3)} m)`);
    assert.ok(size.z > 6.4 && size.y > 2.9, `${id} has a full-size connected IFV silhouette`);
    bounds.set(id, { armour: armourSize.clone(), size: size.clone() });
  } finally {
    tank.dispose();
  }
}

const cv90 = bounds.get('cv90');
const mkiv = bounds.get('cv90_mk4_concept');
assert.ok(mkiv.armour.x > cv90.armour.x && mkiv.armour.y > cv90.armour.y && mkiv.armour.z > cv90.armour.z
  && mkiv.size.y > cv90.size.y && mkiv.size.z > cv90.size.z,
'Mk IV is visibly larger than the 40 mm CV90 in every principal dimension');

console.log('CV90 and CV90 Mk IV (shared CV90 construction, own turrets) selftest passed');
