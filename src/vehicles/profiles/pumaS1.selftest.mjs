import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    hullConstruction: 'connected-faceted-s1-shell-v2',
    turretConstruction: 'independent-unmanned-rct30-loft-v1',
    roadWheelsPerSide: 6,
    canonicalTrackCourses: 1,
    duplicateTrackMeshes: 0,
    suspensionPlacement: 'inboard-behind-road-wheel',
    sideArmorCassettesPerSide: 9,
    sideArmorLayers: 3,
    frontSkirtTransition: 'upper-glacis-connected-wedge-v1',
    nativeTrackPattern: 'compact-ifv',
    baseGunAssembly: 'preserved-mk30-cradle-v1',
    mellsLaunchTubes: 2,
    panoramicOpticStages: 2,
    crewLocation: 'protected-hull-cell',
    rearTroopRamp: true,
  });
  assert.deepEqual(turret.userData.pumaS1TurretReceipt, {
    unmanned: true,
    gun: 'MK30-2/ABM',
    launcher: 'MELLS-Spike-LR2',
    stabilizedPanoramicSight: true,
    allAroundCameraCount: 4,
    remoteSecondaryWeapon: 'MG4-class',
  });
  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.equal(gear?.wheelZs.length, 6, 'six road wheels are authored per side');
  assert.equal(gear?.trackW, 0.56, 'S1 native course is slightly widened under the new skirts');
  assert.equal(gear?.trackPatternId, 'compact-ifv',
    'S1 uses its unique fine-rib heavy IFV shoe construction');
  assert.equal(gear?.suspensionDynamic, true, 'S1 road wheels retain dynamic suspension arms');
  assert.equal(hull.userData.runningGearUnitCount, 1,
    'S1 owns one canonical animated running-gear course');
  assert.equal(tank.root.getObjectByName('gearTrackPads')?.userData.trackShoeDetailMode,
    'family-integrated', 'S1 uses the canonical detailed shoe course');
  assert.ok(tank.root.getObjectByName('muzzleBoreShadowFallbackRim'),
    'MK30 carries a real recessed muzzle bore');
} finally {
  tank.dispose();
}

console.log('pumaS1 selftest passed');
