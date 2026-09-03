import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

const spec = getSpec('type89_light_tiger');
assert.ok(spec, 'Type 89 Light Tiger is registered');
assert.equal(spec.name, 'Type 89 Light Tiger');
assert.equal(tankTier(spec.id), 10, 'Light Tiger is Tier X');
assert.equal(spec.role, 'ifv');
assert.equal(spec.weightTons, 38.5);
assert.deepEqual(spec.dims, {
  hullLengthM: 6.8,
  overallLengthM: 7.45,
  widthM: 3.7,
  heightM: 3.4,
});
assert.equal(spec.gun.caliberMm, 35);
assert.ok(spec.gun.shells.some((round) => round.guided && /Jyu-MAT Kai/.test(round.name)),
  'Light Tiger has its own Jyu-MAT Kai guided channel');
assert.ok(spec.armor.crew.every((crew) => !crew.turretLocal && crew.max[1] < 1.93),
  'all three crew stations remain below the roof in the protected hull cell');

const source = readFileSync(new URL('./type89LightTiger.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /AFV_FAMILY_PROFILES|buildType89\s*\(/,
  'new Light Tiger builder does not call or import the legacy Type 89 implementation');
assert.doesNotMatch(source, /from ['"]\.\.\/modern3\.ts['"]/,
  'new Light Tiger profile has no dependency on the old canonical builder pack');
assert.match(source, /flat gun mask and compact rocking mantlet/i,
  'Light Tiger carries the requested flat frontal mask and compact moving mantlet');
assert.doesNotMatch(source, /height:\s*\[/,
  'Light Tiger never builds a non-planar roof or turret cap from per-vertex heights');
assert.doesNotMatch(source, /inset:\s*\[/,
  'Light Tiger armor rings shrink monotonically as complete planes');

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
  assert.ok(hull && turret && gun, 'Light Tiger retains the canonical articulated rig');
  assert.deepEqual(hull.userData.type89LightTigerReceipt, {
    independentFromLegacyType89: true,
    referenceUsage: 'measurement-and-silhouette-only',
    hullConstruction: 'planar-roof-light-tiger-glacis-shell-v6',
    turretConstruction: 'flat-front-deep-bustle-equipment-citadel-v6',
    roadWheelsPerSide: 6,
    canonicalTrackCourses: 1,
    duplicateTrackMeshes: 0,
    suspensionPlacement: 'inboard-behind-road-wheel',
    sideArmorCassettesPerSide: 9,
    sideArmorLayers: 3,
    frontSkirtTransition: 'continuous-glacis-to-skirt-shoulder-v4',
    frontCapPanelsRemoved: true,
    rearTrackDepartureZM: -2.17,
    nativeTrackPattern: 'japanese-modular',
    baseGunAssembly: 'flat-mask-kde35-mantlet-v8',
    jyuMatLaunchTubes: 4,
    panoramicOpticStages: 2,
    planarRoofCell: true,
    upperGlacisConstruction: 'separate-planar-wedge',
    monotonicArmorInset: true,
    concaveSurfaceCount: 0,
    fenderBridge: 'single-planar-glacis-skirt-shoulder-v3',
    rearTroopRamp: true,
  });
  assert.deepEqual(turret.userData.type89LightTigerTurretReceipt, {
    unmanned: true,
    gun: 'KDE-35 Light Tiger',
    launcher: 'Type-01 Jyu-MAT Kai',
    launcherTubes: 4,
    stabilizedPanoramicSight: true,
    allAroundCameraCount: 4,
    hardKillAps: true,
    remoteSecondaryWeapon: '12.7mm Light Tiger compact RWS',
    mantletConstruction: 'flat-mask-compact-rocking-block',
    pairedRoofOpticBoxes: true,
    pairedRoofOpticHeightScale: 2 / 3,
    launcherPodInnerXM: 1.16,
    launcherPodOuterXM: 1.62,
    primaryBustleRearZM: -2.06,
    deepStructuralBustle: true,
    planarRoofCrown: true,
    monotonicArmorInset: true,
    concaveSurfaceCount: 0,
  });
  const roofOptics = tank.root.getObjectByName('type89K2bStyleRoofOptics');
  assert.equal(roofOptics?.parent, turret,
    'Light Tiger K2B-style panoramic station remains turret-owned');
  assert.equal(roofOptics?.userData.hasWeapon, false,
    'Light Tiger roof optics station contains no secondary weapon');
  assert.equal(roofOptics?.getObjectByName('openYokeRwsMachineGun'), undefined,
    'Light Tiger roof optics station contains no hidden barrel or receiver mesh');
  let roofWeaponMesh = false;
  roofOptics?.traverse((node) => {
    if (node.userData.appearanceRole === 'machineGun') roofWeaponMesh = true;
  });
  assert.equal(roofWeaponMesh, false,
    'Light Tiger panoramic station has no descendant tagged as machine-gun geometry');
  assert.deepEqual(turret.userData.type89RoofOpticsReceipt, {
    designFamily: 'abramsx-open-yoke-v1',
    variant: 'korean-twin',
    mountLocal: [-0.36, 0.76, -0.56],
    scale: 0.88,
    sizeStandard: 'k2b-compact-tower',
    towerRiseM: 0.12,
    hasWeapon: false,
    sensorMount: 'roof',
    integratedSensorHead: true,
    turretOwned: true,
  });
  const roofRws = tank.root.getObjectByName('type89LightTigerCompactRoofRws');
  assert.equal(roofRws?.parent, turret,
    'Light Tiger compact machine-gun station remains turret-owned');
  assert.equal(roofRws?.userData.hasWeapon, true,
    'Light Tiger compact station retains its independent machine gun');
  assert.equal(roofRws?.userData.hasIntegratedSensorHead, false,
    'Light Tiger machine-gun station cannot duplicate or intersect the panoramic optics');
  assert.deepEqual(turret.userData.type89RoofRwsReceipt, {
    designFamily: 'abramsx-open-yoke-v1',
    variant: 'light-tiger-compact',
    mountLocal: [0.42, 0.76, -0.94],
    scale: 0.66,
    sizeStandard: 'light-tiger-compact-rws',
    towerRiseM: 0.09,
    caliberMm: 12.7,
    visibleFeedBelt: true,
    integratedSensorHead: false,
    turretOwned: true,
  });
  assert.equal(new Box3().setFromObject(roofOptics).intersectsBox(
    new Box3().setFromObject(roofRws)), false,
  'Light Tiger panoramic and machine-gun towers have physically separate envelopes');
  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.equal(gear?.wheelZs.length, 6, 'six road wheels are authored per side');
  assert.equal(Math.abs(gear?.xcLeft), 1.42,
    'Light Tiger left running gear is reseated closer to the hull centerline');
  assert.equal(Math.abs(gear?.xcRight), 1.42,
    'Light Tiger right running gear is reseated closer to the hull centerline');
  assert.equal(gear?.trackW, 0.46, 'Light Tiger native course clears the hull while filling the attached skirt envelope');
  assert.equal(gear?.trackPatternId, 'japanese-modular',
    'Light Tiger retains its unique staggered-rib Japanese shoe construction');
  assert.equal(hull.userData.type89LightTigerReceipt.rearTrackDepartureZM, -2.17,
    'rear track departure wraps the aft road wheel instead of joining behind it');
  assert.ok(gear?.loopPoints.some(([z, y]) => Math.abs(z + 2.17) < 1e-9
    && Math.abs(y - 0.05) < 1e-9),
  'rear track course physically departs its lower run at the authored aft-wheel seat');
  assert.ok(gear?.loopPoints.some(([z]) => z > 3.28) && gear?.loopPoints.some(([z]) => z < -3.22),
    'Light Tiger track course reaches both full-length hull shoulders');
  assert.equal(gear?.suspensionDynamic, true, 'road wheels retain dynamic inboard suspension arms');
  assert.equal(hull.userData.runningGearUnitCount, 1,
    'Light Tiger owns one canonical animated running-gear course');
  assert.equal(tank.root.getObjectByName('gearTrackPads')?.userData.trackShoeDetailMode,
    'family-integrated', 'Light Tiger uses the canonical detailed shoe course');
  const turretShell = turret.getObjectByName('turret');
  assert.ok(turretShell, 'Light Tiger primary turret shell is present');
  const turretShellBounds = new Box3().setFromObject(turretShell);
  assert.ok(turretShellBounds.min.z - turret.position.z < -2.03,
    'primary turret shell forms a deep structural rear bustle');
  const turretEquipment = turret.getObjectByName('turretEquipment');
  assert.ok(turretEquipment, 'Light Tiger turret equipment shell is present');
  const turretEquipmentBounds = new Box3().setFromObject(turretEquipment);
  assert.ok(turretEquipmentBounds.max.x > 1.61 && turretEquipmentBounds.min.x < -1.61,
    'paired launcher boxes project clearly beyond both turret side planes');
  assert.ok(gun.getObjectByName('gunMount'),
    'Light Tiger carries a camouflaged open gun cradle');
  assert.ok(gun.getObjectByName('gunMountDark'),
    'Light Tiger retains its dark trunnion inside the painted cradle');
  assert.deepEqual(gun.userData.type89GunMantletReceipt, {
    architecture: 'flat-mask-compact-rocking-mantlet-v1',
    movingWithGun: true,
    verticalOffsetM: 0,
    scaleFromInitialCompactEnvelope: 0.48,
    lengthM: 0.56,
    diagonalSidePortsPerSide: 0,
    topBottomSkins: false,
    sideSkinPanelsPerSide: 1,
    openFrontRear: false,
    surroundsMainBarrel: true,
    surroundsCoax: true,
  }, 'Light Tiger uses a compact flat mask and rocking mantlet around the KDE-35');
  assert.ok(gun.getObjectByName('rig_muzzle')?.position.z > 3.05,
    'Light Tiger carries the enlarged long KDE-35 assembly');
  assert.ok(tank.root.getObjectByName('muzzleBoreShadowRim'),
    'KDE-35 carries an explicitly authored annular muzzle rim');
  assert.ok(tank.root.getObjectByName('muzzleBoreShadowDisc'),
    'KDE-35 carries an explicitly authored recessed bore disc');
} finally {
  tank.dispose();
}

console.log('type89LightTiger selftest passed');
