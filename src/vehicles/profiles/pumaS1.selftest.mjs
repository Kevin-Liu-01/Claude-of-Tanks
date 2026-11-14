import {assertHollowMuzzle} from '../../../tools/physical-muzzle.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

const spec = getSpec('spz_wotan');
assert.ok(spec, 'SPz Puma S1 is registered');
assert.equal(spec.name, 'SPz Wotan');
assert.equal(tankTier(spec.id), 6, 'Puma S1 matches at its shown Tier VI (258)');
assert.equal(spec.role, 'ifv');
assert.equal(spec.weightTons, 43);
assert.deepEqual(spec.dims, {
  hullLengthM: 6.84,
  overallLengthM: 6.84,
  widthM: 3.51,
  heightM: 3.24,
});
assert.equal(spec.gun.caliberMm, 30);
// (the 230 combat-rig table writes the measured pivot to the millimetre, -0.126 for -0.14 x 0.9: read within a micron)
for (const [axis, value] of [-0.14 * 0.9, 0.42 * 0.9, 1.33 * 0.9].entries()) {
  assert.ok(Math.abs(spec.armor.gunPivot[axis] - value) < 1e-6,
    'Puma S1 cannon sits close to the turret centerline while preserving its asymmetric RCT30 face');
}
assert.ok(spec.gun.shells.some((round) => round.guided && /Spike LR2 MELLS/.test(round.name)),
  'Puma S1 has its independent MELLS guided channel');
// (235 crew-fit seats the heads to 1.8415 under the measured 1.872 hull roof; 1.93 x 0.9 was the authored estimate)
const hullRoofY = combatAnatomyCalibration(spec.id).hull.bodyRoofY;
assert.ok(spec.armor.crew.every((crew) => !crew.turretLocal && crew.max[1] < hullRoofY),
  'all three Puma S1 crew stations remain below the roof in the protected hull cell');

const source = readFileSync(new URL('./pumaS1.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /buildPuma(?:Oracle)?\s*\(/,
  'new Puma S1 builder does not call either legacy Puma implementation');
assert.doesNotMatch(source, /from ['"]\.\.\/modern3\.ts['"]/,
  'new Puma S1 profile has no dependency on the old canonical builder pack');
assert.doesNotMatch(source, /mantlet/i,
  'Puma S1 keeps its armoured gun housing without introducing a separate mantlet');
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
  assert.deepEqual(hull.userData.advancedIfvScaleReceipt, {
    designFamily: 'cot-spz-puma-s1-compact-r1',
    vehicleScale: 0.9,
    specSpatialFrameScaled: true,
    bakedBucketGeometry: true,
    directAssembliesScaled: true,
    ownerScalesPreserved: true,
    turretPivotFromScaledSpec: true,
    gunPivotFromScaledSpec: true,
    muzzleAnchorScaled: true,
    contactGeometryScaled: true,
    trackHitboxesScaled: true,
    roadWheelLayoutScaled: true,
  }, 'Puma S1 publishes one complete 90% render/gameplay scale receipt');
  assert.equal(turret.userData.advancedIfvScaleReceipt,
    hull.userData.advancedIfvScaleReceipt,
    'Puma hull and turret share the same scale frame');
  assert.ok(Math.abs(gun.getObjectByName('rig_muzzle')?.position.z - 2.85 * 0.9) < 1e-6,
    'Puma muzzle and firing-effects station follows the compact gun frame');
  // 2026-10-10 (the netting lane, the owner's order of 2026-10-09: "a ton more netting and camo leaves" on the SPz
  // Wotan): the field net's skirt drapes hang outside the vehicle; its own width is measured without them
  const bareBox = new Box3();
  tank.root.updateMatrixWorld(true);
  tank.root.traverse((o) => { if (o.isMesh && !/_ghillie_/.test(o.name)) bareBox.expandByObject(o); });
  const compactBounds = bareBox.getSize(new Vector3());
  // 267 (ifv-modern-267): the rebuild on the measured S1, in the 90 % frame: the width across the flank sensor heads (the
  // 2026-09-25 design's 3.715 m within its 3 % concept band) and the height to the turret whip's tip
  assert.ok(Math.abs(compactBounds.x - 4.0920 * 0.9) < 0.01,
    `Puma outer width across the flank sensor heads in the compact frame (${compactBounds.x})`);
  assert.ok(Math.abs(compactBounds.y - 3.7390 * 0.9) < 0.01,
    `Puma full equipment height (the turret whip's tip) in the compact frame (${compactBounds.y})`);
  assert.deepEqual(hull.userData.pumaS1Receipt, {
    independentFromLegacyPuma: true,
    hullConstruction: 'puma-s1-measured-troop-cell-v8',
    roofY: 1.95,
    glacisBreakZ: 1.40,
    glacisFallPerM: 0.255,
    lowerGlacis: 'section-solid-28deg',
    rearRampRakePerM: 0.4557,
    roadWheelsPerSide: 6,
    canonicalTrackCourses: 1,
    trackCenterlineM: 1.31,
    sideArmorUpperModulesPerSide: 12,
    sideArmorLowerModulesPerSide: 6,
    sideArmorOuterFaceM: 1.905,
    sideArmorFootY: 0.70,
    skirtArchitecture: 'two-row-bevelled-cassettes-v1',
    rightSideCoolingLouvre: true,
    slatQuarters: 2,
    cornerCameras: 4,
    rearStowageBins: 2,
    crewLocation: 'protected-hull-cell',
    rearTroopRamp: true,
  });
  assert.deepEqual(turret.userData.pumaS1TurretReceipt, {
    unmanned: true,
    gun: 'MK30-2/ABM',
    launcher: 'MELLS-Spike-LR2',
    stabilizedPanoramicSight: true,
    gunnerSight: 'left-cheek',
    turretBodyM: [1.64, 0.755, 2.80],
    ringOffsetSide: 'vehicle-left',
    remoteSecondaryWeapon: null,
    smokeStacks: 2,
    hardKillProtection: true,
  });
  // Critic panel 2026-10-15 on the owner markup: the sight column carries the PERI RTWL head (no open-yoke station), and
  // the Puma S1 carries no roof weapon (VH.14; its compact 12.7 mm remote station is gone)
  assert.ok(tank.root.getObjectByName('pumaS1K2bStyleRoofOptics') === undefined, 'no open-yoke optics station');
  assert.ok(tank.root.getObjectByName('pumaS1CompactRoofRws') === undefined, 'no roof weapon station');
  assert.deepEqual(turret.userData.pumaS1RoofOpticsReceipt, {
    sight: 'PERI RTWL commander panoramic periscope',
    mountLocal: [0.30, 0.82, -0.06],
    headSizeM: [0.38, 0.30, 0.38],
    windows: 3,
    hasWeapon: false,
    turretOwned: true,
  });
  assert.deepEqual(turret.userData.wotanProtectionReceipt, { hardKillRadarFaces: 4, hardKillLaunchers: 2,
    softKillWarners: 4, jammer: 1 }, 'the Wotan carries its own hard-kill set beside the S1 soft-kill warners');
  assert.equal(turret.userData.pumaS1RoofRwsReceipt, undefined, 'no roof weapon receipt');
  let roofWeapons = 0;
  tank.root.traverse((node) => { if (node.userData.fittingRoot && ['pintleMG', 'openYokeRws', 'weaponStationMount'].includes(node.userData.fitting)) roofWeapons++; });
  assert.equal(roofWeapons, 0, 'the Puma S1 draws no roof weapon');
  // (the Wotan's twin cells stand on the right flank at the published launch exits, fleetLauncherMuzzles.ts)
  assert.deepEqual(turret.userData.pumaS1MellsLauncherReceipt, {
    architecture: 'twin-square-armored-cells-v2',
    launchCells: 2,
    circularLaunchTubes: 0,
    mountSide: 'vehicle-right',
    turretOwned: true,
  }, 'Puma S1 MELLS launcher uses two square armored cells and no circular tubes');
  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.deepEqual(gear?.wheelZs, [1.79, 1.01, 0.25, -0.68, -1.43, -2.17], 'six road wheels at the measured S1 stations');
  assert.equal(gear?.xcLeft, 1.31, 'left Puma track lane at the measured S1 lane');
  assert.equal(gear?.xcRight, 1.31, 'right Puma track lane at the measured S1 lane');
  assert.equal(gear?.trackW, 0.52, 'S1 native course width');
  assert.deepEqual([gear?.sprocket.z, gear?.sprocket.y, gear?.idler.z, gear?.idler.y], [2.65, 0.96, -2.81, 0.835],
    'raised front sprocket and rear tension idler at the S1 stations');
  assert.equal(gear?.trackPatternId, 'compact-ifv',
    'S1 uses its unique fine-rib heavy IFV shoe construction');
  const rearRoadWheelZ = Math.min(...gear.wheelZs);
  const lowerCourse = gear.loopPoints.filter(([, y]) => Math.abs(y - gear.botY) < 1e-6);
  const rearGroundJointZ = Math.min(...lowerCourse.map(([z]) => z));
  assert.ok(Math.abs(rearRoadWheelZ - rearGroundJointZ) < 1e-6,
    `Puma loaded course begins rising under the aft axle and wraps the wheel (2026-09-14 tangent wrap; ${rearGroundJointZ})`);
  assert.ok(gear?.loopPoints.some(([z]) => z > 2.95) && gear?.loopPoints.some(([z]) => z < -3.05),
    'S1 track course wraps the front sprocket and the rear idler');
  assert.equal(gear?.suspensionDynamic, true, 'S1 road wheels retain dynamic suspension arms');
  assert.equal(hull.userData.runningGearUnitCount, 1,
    'S1 owns one canonical animated running-gear course');
  assert.equal(tank.root.getObjectByName('gearTrackPads')?.userData.trackShoeDetailMode,
    'family-integrated', 'S1 uses the canonical detailed shoe course');
  assert.ok(gun.getObjectByName('gunMount'),
    'Puma S1 carries a camouflaged armoured gun housing');
  assert.ok(gun.getObjectByName('gunMountDark'),
    'Puma S1 carries its housing ribs and cradle perforations dark');
  assert.deepEqual(gun.userData.pumaS1GunHousingReceipt, {
    architecture: 'tapered-armoured-housing-perforated-cradle-v1',
    movingWithGun: true,
    housingLengthM: 1.44,
    perforatedCradleHolesPerSide: 9,
    coaxSide: 'left',
  }, 'Puma S1 MK30-2 sits in its tapered armoured housing with the perforated barrel cradle ahead');
  assertHollowMuzzle(tank.root);
} finally {
  tank.dispose();
}

console.log('pumaS1 selftest passed');
