import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

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
]) {
  assert.match(source, new RegExp(`function ${functionName}\\(`),
    `${functionName} is independently authored`);
}

const expected = Object.freeze({
  cv90: Object.freeze({
    name: 'CV90', tier: 9, caliber: 40, weight: 37,
    dims: Object.freeze({ hullLengthM: 6.56, overallLengthM: 7.3, widthM: 3.62, heightM: 3.4 }),
    hullReceiptKey: 'cv90IndependentHullReceipt',
    turretReceiptKey: 'cv90IndependentTurretReceipt',
    designLineage: 'independent-tier9-cv9040-v2',
    hullConstruction: 'cv9040-fused-belly-glacis-monocoque-v5',
    turretConstruction: 'cv9040-integrated-arrow-wedge-crew-citadel-v6',
    gunAssembly: 'rooted-hollow-40mm-diagonal-truss-cradle-v3',
    gunArchitecture: 'rooted-hollow-trapezoid-40mm-diagonal-truss-v3',
    frontArmorShell: 'single-monotonic-arrow-shell',
    rwsName: 'cv90K2bStyleRws', rwsScale: 0.80,
    turretPivotZ: -0.48,
    trackWidth: 0.50, sideStations: 9, rearExtension: 0.15, guided: false,
    rearTrackDepartureZ: -2.48,
  }),
  cv90_mkiv: Object.freeze({
    name: 'CV90 Mk IV', tier: 10, caliber: 50, weight: 40,
    dims: Object.freeze({ hullLengthM: 6.98, overallLengthM: 8.44, widthM: 4.04, heightM: 3.92 }),
    hullReceiptKey: 'cv90MkivIndependentHullReceipt',
    turretReceiptKey: 'cv90MkivIndependentTurretReceipt',
    designLineage: 'independent-tier10-cv90-mkiv-v2',
    hullConstruction: 'cv90-mkiv-fused-belly-glacis-side-cell-v5',
    turretConstruction: 'cv90-mkiv-integrated-steep-arrow-mission-module-v6',
    gunAssembly: 'massive-faceted-50mm-trunnion-shroud-v1',
    gunArchitecture: 'faceted-closed-50mm-trunnion-shroud-v2',
    frontArmorShell: 'single-extreme-slope-arrow-shell',
    rwsName: 'cv90MkivK2bStyleRws', rwsScale: 0.90,
    turretPivotZ: -0.44,
    trackWidth: 0.57, sideStations: 9, rearExtension: 0.08, guided: true,
    rearTrackDepartureZ: -2.56,
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
    `${id} turret is seated slightly aft on its independently authored roof`);
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

    const hullReceipt = hull.userData[target.hullReceiptKey];
    const turretReceipt = turret.userData[target.turretReceiptKey];
    assert.ok(hullReceipt && turretReceipt, `${id} exposes independent hull/turret receipts`);
    assert.equal(hullReceipt.sharedStructuralBuilder, false);
    assert.equal(hullReceipt.designLineage, target.designLineage);
    assert.equal(hullReceipt.hullConstruction, target.hullConstruction);
    assert.equal(hullReceipt.roadWheelsPerSide, 7);
    assert.equal(hullReceipt.canonicalTrackCourses, 1);
    assert.equal(hullReceipt.duplicateTrackMeshes, 0);
    assert.equal(hullReceipt.sideArmorStationsPerSide, target.sideStations);
    assert.equal(hullReceipt.planarRoofCell, true);
    assert.equal(hullReceipt.upperGlacisConstruction, 'overlapped-planar-wedge');
    assert.equal(hullReceipt.monotonicArmorInset, true);
    assert.equal(hullReceipt.concaveSurfaceCount, 0);
    assert.equal(hullReceipt.lowerHullFusion, 'belly-to-upper-cell-overlap-v1');
    assert.equal(hullReceipt.bowShoulderJoin, 'single-cell-glacis-to-skirt-v1');
    assert.equal(hullReceipt.rearSkirtClosure, 'tapered-armored-rear-corner-v1');
    assert.equal(hullReceipt.lowerRubberStripRemoved, true);
    assert.equal(hullReceipt.rearTrackDeparture, 'rear-wheel-tangent-forward-v1');
    assert.equal(hullReceipt.rearTrackDepartureZM, target.rearTrackDepartureZ);
    assert.equal(hullReceipt.auxiliaryFuelDrums, id === 'cv90_mkiv' ? 2 : undefined);
    assert.equal(hullReceipt.fenderBridge, 'continuous-glacis-shoulder-skirt-seat-v2');
    assert.equal(hullReceipt.tracksExtendedForRearHull, false);
    assert.equal(hullReceipt.rearHullExtensionM, target.rearExtension);
    assert.equal(hullReceipt.rearTroopRamp, true);
    assert.equal(turretReceipt.sharedStructuralBuilder, false);
    assert.equal(turretReceipt.identityFamily, 'cv90-native');
    assert.equal(turretReceipt.foreignFamilyGeometryReused, false);
    assert.equal(turretReceipt.turretConstruction, target.turretConstruction);
    assert.equal(turretReceipt.gunAssembly, target.gunAssembly);
    assert.equal(turretReceipt.planarRoofCrown, true);
    assert.equal(turretReceipt.monotonicArmorInset, true);
    assert.equal(turretReceipt.concaveSurfaceCount, 0);
    assert.equal(turretReceipt.integratedRearBustle, true);
    assert.equal(turretReceipt.structuralChevronCoursesPerSide, 2);
    assert.equal(turretReceipt.frontArmorShell, target.frontArmorShell);
    assert.equal(turretReceipt.equipmentReseatedForShell, true);
    assert.equal(turretReceipt.remoteMachineGunTower,
      'k2b-style-complete-open-yoke-rws');
    assert.equal(gun.userData.cv90GunAssemblyReceipt.architecture, target.gunArchitecture);
    assert.equal(gun.userData.cv90GunAssemblyReceipt.movingWithGun, true);
    assert.equal(gun.userData.cv90GunAssemblyReceipt.surroundsMainBarrel, true);
    if (id === 'cv90') {
      assert.equal(gun.userData.cv90GunAssemblyReceipt.rootJoinedToTurretFace, true);
      assert.equal(gun.userData.cv90GunAssemblyReceipt.sideOnlyOpenings, true);
      assert.equal(gun.userData.cv90GunAssemblyReceipt.diagonalSidePortsPerSide, 3);
    } else {
      assert.equal(turretReceipt.sideEquipmentSeat, 'rolled-plinth-on-armor-normal-v1');
      assert.equal(gun.userData.cv90GunAssemblyReceipt.trunnionRecessM, 0.18);
      assert.ok(Math.abs(gun.position.z - 1.16) < 1e-6,
        `${id} complete cannon rig is recessed into the turret`);
    }
    assert.equal(gun.getObjectByName('rig_muzzle')?.position.z,
      id === 'cv90_mkiv' ? 3.76 : 3.12, `${id} publishes the correct muzzle station`);
    assert.ok(tank.root.getObjectByName('muzzleBoreShadowRim'),
      `${id} cannon has a recessed bore`);

    const gear = hull.userData.runningGearReceipts?.at(-1);
    assert.equal(hull.userData.runningGearUnitCount, 1,
      `${id} owns one canonical animated track course`);
    assert.equal(gear?.wheelZs.length, 7, `${id} has seven road wheels per side`);
    assert.equal(gear?.trackPatternId, 'compact-ifv');
    assert.equal(gear?.trackW, target.trackWidth);
    const rearGroundDepartureZ = Math.min(...gear.loopPoints
      .filter(([, y]) => Math.abs(y - gear.botY) < 1e-6)
      .map(([z]) => z));
    assert.ok(Math.abs(rearGroundDepartureZ - target.rearTrackDepartureZ) < 1e-6,
      `${id} flat run leaves at the authored rear-wheel tangent`);
    assert.equal(gear?.xcRight, id === 'cv90_mkiv' ? 1.50 : 1.41,
      `${id} track inner face is seated against its own belly section`);
    assert.equal(gear?.suspensionDynamic, true);
    assert.equal(gear?.suspensionPlacement, 'inboard-behind-road-wheel');
    assert.equal(tank.root.getObjectByName('hullRubber'), undefined,
      `${id} no longer carries a detached full-length lower rubber strip`);

    const rws = tank.root.getObjectByName(target.rwsName);
    assert.equal(rws?.parent, turret, `${id} K2B-style RWS is directly turret-owned`);
    assert.equal(rws?.userData.fitting, 'openYokeRws');
    assert.equal(rws?.userData.designFamily, 'abramsx-open-yoke-v1');
    assert.equal(rws?.userData.stationVariant, 'korean-twin');
    assert.equal(rws?.userData.sizeStandard, 'k2b-compact-tower');
    assert.equal(rws?.userData.scale, target.rwsScale);
    assert.equal(rws?.userData.hasWeapon, true);
    assert.equal(rws?.userData.hasVisibleFeedBelt, true);
    assert.ok(rws?.getObjectByName('openYokeRwsMachineGun'),
      `${id} RWS includes its complete machine-gun assembly`);

    const box = new Box3().setFromObject(tank.root);
    const size = box.getSize(new Vector3());
    assert.ok(size.x > 3.4 && size.z > 7.0, `${id} has a full-size connected IFV silhouette`);
    bounds.set(id, size.clone());
  } finally {
    tank.dispose();
  }
}

const cv90Size = bounds.get('cv90');
const mkivSize = bounds.get('cv90_mkiv');
assert.ok(mkivSize.x > cv90Size.x && mkivSize.y > cv90Size.y && mkivSize.z > cv90Size.z,
  'Mk IV is visibly larger than the Tier IX CV90 in every principal dimension');

console.log('independent CV90 vehicles selftest passed');
