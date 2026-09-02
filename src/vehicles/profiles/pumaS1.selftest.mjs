import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

const spec = getSpec('spz_puma_s1');
assert.ok(spec, 'SPz Puma S1 is registered');
assert.equal(spec.name, 'Schützenpanzer Puma S1');
assert.equal(tankTier(spec.id), 10, 'Puma S1 is Tier X');
assert.equal(spec.role, 'ifv');
assert.equal(spec.weightTons, 43);
assert.deepEqual(spec.dims, {
  hullLengthM: 7.6,
  overallLengthM: 7.6,
  widthM: 3.9,
  heightM: 3.6,
});
assert.equal(spec.gun.caliberMm, 30);
assert.ok(spec.gun.shells.some((round) => round.guided && /Spike LR2 MELLS/.test(round.name)),
  'Puma S1 has its independent MELLS guided channel');
assert.ok(spec.armor.crew.every((crew) => !crew.turretLocal && crew.max[1] < 1.93),
  'all three Puma S1 crew stations remain below the roof in the protected hull cell');

const source = readFileSync(new URL('./pumaS1.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /buildPuma(?:Oracle)?\s*\(/,
  'new Puma S1 builder does not call either legacy Puma implementation');
assert.doesNotMatch(source, /from ['"]\.\.\/modern3\.ts['"]/,
  'new Puma S1 profile has no dependency on the old canonical builder pack');
assert.doesNotMatch(source, /mantlet/i,
  'Puma S1 keeps its base gun cradle without introducing a separate mantlet');
assert.doesNotMatch(source, /height:\s*\[/,
  'Puma S1 never builds a non-planar roof or turret cap from per-vertex heights');
assert.doesNotMatch(source, /inset:\s*\[/,
  'Puma S1 armor rings shrink monotonically as complete planes');

const tank = createTank(spec.id, null, {
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
  assert.ok(hull && turret && gun, 'Puma S1 retains the canonical articulated rig');
  assert.deepEqual(hull.userData.pumaS1Receipt, {
    independentFromLegacyPuma: true,
    hullConstruction: 'planar-roof-puma-glacis-monocoque-v5',
    turretConstruction: 'planar-faceted-rct30-citadel-v4',
    roadWheelsPerSide: 6,
    canonicalTrackCourses: 1,
    duplicateTrackMeshes: 0,
    suspensionPlacement: 'inboard-behind-road-wheel',
    sideArmorCassettesPerSide: 10,
    sideArmorLayers: 3,
    frontSkirtTransition: 'lower-glacis-downfold-v2',
    nativeTrackPattern: 'compact-ifv',
    baseGunAssembly: 'compact-slash-port-mk30-cradle-v7',
    mellsLaunchTubes: 2,
    panoramicOpticStages: 2,
    crewLocation: 'protected-hull-cell',
    planarRoofCell: true,
    upperGlacisConstruction: 'separate-planar-wedge',
    monotonicArmorInset: true,
    concaveSurfaceCount: 0,
    fenderBridge: 'continuous-hull-skirt-seat',
    rearTroopRamp: true,
  });
  assert.deepEqual(turret.userData.pumaS1TurretReceipt, {
    unmanned: true,
    gun: 'MK30-2/ABM',
    launcher: 'MELLS-Spike-LR2',
    stabilizedPanoramicSight: true,
    allAroundCameraCount: 4,
    remoteSecondaryWeapon: '12.7mm Puma S1 compact RWS',
    planarRoofCrown: true,
    monotonicArmorInset: true,
    concaveSurfaceCount: 0,
  });
  const roofOptics = tank.root.getObjectByName('pumaS1K2bStyleRoofOptics');
  assert.equal(roofOptics?.parent, turret,
    'Puma S1 K2B-style panoramic station remains turret-owned');
  assert.equal(roofOptics?.userData.hasWeapon, false,
    'Puma roof optics station contains no secondary weapon');
  assert.equal(roofOptics?.getObjectByName('openYokeRwsMachineGun'), undefined,
    'Puma roof optics station contains no hidden barrel or receiver mesh');
  let roofWeaponMesh = false;
  roofOptics?.traverse((node) => {
    if (node.userData.appearanceRole === 'machineGun') roofWeaponMesh = true;
  });
  assert.equal(roofWeaponMesh, false,
    'Puma panoramic station has no descendant tagged as machine-gun geometry');
  assert.deepEqual(turret.userData.pumaS1RoofOpticsReceipt, {
    designFamily: 'abramsx-open-yoke-v1',
    variant: 'korean-twin',
    mountLocal: [-0.36, 0.74, -0.52],
    scale: 0.88,
    sizeStandard: 'k2b-compact-tower',
    towerRiseM: 0.12,
    hasWeapon: false,
    sensorMount: 'roof',
    integratedSensorHead: true,
    turretOwned: true,
  });
  const roofRws = tank.root.getObjectByName('pumaS1CompactRoofRws');
  assert.equal(roofRws?.parent, turret,
    'Puma S1 compact machine-gun station remains turret-owned');
  assert.equal(roofRws?.userData.hasWeapon, true,
    'Puma S1 compact station retains its independent machine gun');
  assert.equal(roofRws?.userData.hasIntegratedSensorHead, false,
    'Puma machine-gun station cannot duplicate or intersect the panoramic optics');
  assert.deepEqual(turret.userData.pumaS1RoofRwsReceipt, {
    designFamily: 'abramsx-open-yoke-v1',
    variant: 'puma-s1-compact',
    mountLocal: [0.42, 0.74, -0.90],
    scale: 0.68,
    sizeStandard: 'puma-s1-compact-rws',
    towerRiseM: 0.08,
    caliberMm: 12.7,
    visibleFeedBelt: true,
    integratedSensorHead: false,
    turretOwned: true,
  });
  assert.equal(new Box3().setFromObject(roofOptics).intersectsBox(
    new Box3().setFromObject(roofRws)), false,
  'Puma panoramic and machine-gun towers have physically separate envelopes');
  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.equal(gear?.wheelZs.length, 6, 'six road wheels are authored per side');
  assert.equal(gear?.trackW, 0.56, 'S1 native course is slightly widened under the new skirts');
  assert.equal(gear?.trackPatternId, 'compact-ifv',
    'S1 uses its unique fine-rib heavy IFV shoe construction');
  assert.ok(gear?.loopPoints.some(([z]) => z > 3.48) && gear?.loopPoints.some(([z]) => z < -3.42),
    'S1 track course reaches both full-length hull shoulders');
  assert.equal(gear?.suspensionDynamic, true, 'S1 road wheels retain dynamic suspension arms');
  assert.equal(hull.userData.runningGearUnitCount, 1,
    'S1 owns one canonical animated running-gear course');
  assert.equal(tank.root.getObjectByName('gearTrackPads')?.userData.trackShoeDetailMode,
    'family-integrated', 'S1 uses the canonical detailed shoe course');
  assert.ok(gun.getObjectByName('gunMount'),
    'Puma S1 carries a camouflaged open gun cradle');
  assert.ok(gun.getObjectByName('gunMountDark'),
    'Puma S1 retains its dark trunnion inside the painted cradle');
  assert.deepEqual(gun.userData.pumaS1OpenGunCradleReceipt, {
    architecture: 'hollow-trapezoid-slash-port-cradle-v3',
    movingWithGun: true,
    verticalOffsetM: -0.13,
    scaleFromInitialCompactEnvelope: 0.70,
    lengthM: 1.232,
    diagonalSidePortsPerSide: 4,
    topBottomSkins: true,
    sideSkinPanelsPerSide: 7,
    openFrontRear: true,
    surroundsMainBarrel: true,
    surroundsCoax: true,
  }, 'Puma S1 uses a compact hollow trapezoid cradle with four raked side ports');
  assert.ok(gun.getObjectByName('rig_muzzle')?.position.z > 2.80,
    'Puma S1 carries the enlarged long MK30 assembly');
  assert.ok(tank.root.getObjectByName('muzzleBoreShadowFallbackRim'),
    'MK30 carries a real recessed muzzle bore');
} finally {
  tank.dispose();
}

console.log('pumaS1 selftest passed');
