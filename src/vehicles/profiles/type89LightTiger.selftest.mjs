import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    hullConstruction: 'connected-faceted-light-tiger-shell-v1',
    turretConstruction: 'independent-low-profile-kde35-loft-v1',
    roadWheelsPerSide: 6,
    canonicalTrackCourses: 1,
    duplicateTrackMeshes: 0,
    suspensionPlacement: 'inboard-behind-road-wheel',
    sideArmorCassettesPerSide: 8,
    jyuMatLaunchTubes: 4,
    panoramicOpticStages: 2,
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
    remoteSecondaryWeapon: '5.56mm RWS',
  });
  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.equal(gear?.wheelZs.length, 6, 'six road wheels are authored per side');
  assert.equal(gear?.trackW, 0.48, 'Light Tiger track width matches the heavy modular fit');
  assert.equal(gear?.suspensionDynamic, true, 'road wheels retain dynamic inboard suspension arms');
  assert.equal(hull.userData.runningGearUnitCount, 1,
    'Light Tiger owns one canonical animated running-gear course');
  assert.equal(tank.root.getObjectByName('gearTrackPads')?.userData.trackShoeDetailMode,
    'family-integrated', 'Light Tiger uses the canonical detailed shoe course');
  assert.ok(tank.root.getObjectByName('muzzleBoreShadowRim'),
    'KDE-35 carries an explicitly authored annular muzzle rim');
  assert.ok(tank.root.getObjectByName('muzzleBoreShadowDisc'),
    'KDE-35 carries an explicitly authored recessed bore disc');
} finally {
  tank.dispose();
}

console.log('type89LightTiger selftest passed');
