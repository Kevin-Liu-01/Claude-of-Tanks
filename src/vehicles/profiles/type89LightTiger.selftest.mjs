import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { censusEquipment } from '../../../tools/source-equipment-policy.mjs';

// 267 rebuild (ifv-kf51-modern-267): the Raijū is a modernised Type 89 FV measured from the real vehicle, with bolted
// glacis, side and cheek modules, twin launcher pods, a gunner's and a panoramic commander's sight, laser warners, a
// light remote weapon station and the commander's pintle M2.
const spec = getSpec('raiju_ifv');
assert.ok(spec, 'Type 89 Light Tiger is registered');
assert.equal(spec.name, 'Raijū IFV');
assert.equal(tankTier(spec.id), 10, 'Light Tiger is Tier X');
assert.equal(spec.role, 'ifv');
assert.equal(spec.weightTons, 38.5);
assert.deepEqual(spec.dims, {
  hullLengthM: 6.12,
  overallLengthM: 6.705,
  widthM: 3.33,
  heightM: 3.06,
});
assert.equal(spec.gun.caliberMm, 35);
assert.ok(spec.gun.shells.some((round) => round.guided && /Jyu-MAT Kai/.test(round.name) && round.launcherTubes === 4),
  'Light Tiger has its own four-cell Jyu-MAT Kai guided channel');
assert.ok(spec.armor.crew.every((crew) => !crew.turretLocal && crew.max[1] < 1.93 * 0.9),
  'all three crew stations remain below the roof in the protected hull cell');

const source = readFileSync(new URL('./type89LightTiger.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /AFV_FAMILY_PROFILES|buildType89\s*\(|buildType89X/,
  'Light Tiger builder does not call or import the legacy Type 89 or the Type 89 X implementation');
assert.doesNotMatch(source, /from ['"]\.\.\/modern3\.ts['"]|from ['"]\.\/type89SourceX\.ts['"]/,
  'Light Tiger profile has no dependency on the old canonical builder pack or the replica');
assert.match(source, /flat gun mask and compact rocking mantlet/i,
  'Light Tiger carries the requested flat frontal mask and compact moving mantlet');
assert.doesNotMatch(source, /height:\s*\[/,
  'Light Tiger never builds a non-planar roof or turret cap from per-vertex heights');

const S = 0.9;
for (const quality of ['high', 'low']) {
  const tank = createTank(spec.id, null, { proceduralOnly: true, quality, camoSeed: 4242, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    const turret = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    assert.ok(hull && turret && gun, 'Light Tiger retains the canonical articulated rig');
    assert.deepEqual(hull.userData.advancedIfvScaleReceipt, {
      designFamily: 'cot-type89-light-tiger-compact-r1',
      vehicleScale: S,
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
    }, 'Light Tiger publishes one complete 90% render/gameplay scale receipt');
    assert.equal(turret.userData.advancedIfvScaleReceipt, hull.userData.advancedIfvScaleReceipt,
      'Light Tiger hull and turret share the same scale frame');

    // Measured Type 89 frame at 90 %: a 6.8 m hull (6.12 m) with the gun 0.4 m past the nose, the 1.93 m roof and the
    // modules bringing the width to the spec's 3.33 m.
    // the structural hull bucket: the 6.56 m shell between the stern (z -3.26) and the nose edge, the headlight boxes
    // flush with the nose wedge (z 3.34), the module hanger rails just outside the 1.56 m sides
    const shell = new Box3().setFromObject(hull.getObjectByName('hull'));
    assert.ok(Math.abs(shell.max.z - 3.34 * S) < 0.01 && Math.abs(shell.min.z + 3.26 * S) < 0.01,
      `${quality}: hull runs the measured 6.56 m shell plus the nose headlight boxes`);
    assert.ok(Math.abs(shell.max.y - 1.93 * S) < 0.01, `${quality}: flat roof at the 1.93 m turret seat`);
    assert.ok(Math.abs(shell.max.x - 1.593 * S) < 0.01, `${quality}: module rails on the measured 1.56 m upper sides`);
    const outer = new Box3().setFromObject(hull.getObjectByName('hullExternalArmor'));
    assert.ok(outer.max.x > 1.71 * S && outer.max.x < 1.76 * S && outer.min.x < -1.71 * S,
      `${quality}: bolted side modules stand 135 mm outside the hull sides`);

    if (quality === 'high') {
      assert.deepEqual(hull.userData.type89LightTigerReceipt, {
        independentFromLegacyType89: true,
        referenceUsage: 'measurement-and-silhouette-only',
        hullConstruction: 'measured-type89-wedge-bow-modular-r267',
        roadWheelsPerSide: 6,
        returnRollersPerSide: 3,
        sprocket: 'front-raised',
        canonicalTrackCourses: 1,
        nativeTrackPattern: 'japanese-modular',
        upperGlacisDeg: 12,
        glacisArmourModules: 3,
        sideArmourModulesPerSide: 5,
        rearDoors: 2,
        firingPortsPerSide: 3,
      });
      assert.deepEqual(turret.userData.type89LightTigerTurretReceipt, {
        gun: 'KDE-35 Light Tiger',
        launcher: 'Type-01 Jyu-MAT Kai',
        launcherPods: 2,
        launcherTubes: 4,
        gunnerSight: true,
        panoramicCommanderSight: true,
        laserWarners: 4,
        smokeTubesPerSide: 4,
        roofMachineGuns: 2,
        cheekModules: 2,
        turretConstruction: 'steep-sided-slot-mantlet-modular-r267',
      });
    }

    // Two roof machine guns: the light remote station and the commander's crew-served pintle M2, both on the turret.
    const census = censusEquipment(tank.root);
    assert.equal(census.roofMg, 2, `${quality}: exactly the spec's two roof machine guns`);
    const rws = tank.root.getObjectByName('type89LightTigerCompactRoofRws');
    assert.ok(rws?.parent === turret && rws.userData.hasWeapon === true && rws.userData.caliberMm === 7.62,
      'the light remote weapon station is turret-owned and armed');
    const pintle = tank.root.getObjectByName('raijuCommanderPintleM2');
    assert.ok(pintle?.parent === turret && pintle.userData.crewServed === true,
      "the commander's pintle M2 is a crew-served turret weapon");
    assert.equal(new Box3().setFromObject(rws).intersectsBox(new Box3().setFromObject(pintle)), false,
      'the two roof weapons have separate envelopes');

    const gear = hull.userData.runningGearReceipts?.at(-1);
    assert.deepEqual(gear?.wheelZs, [1.89, 1.10, 0.32, -0.47, -1.26, -2.05],
      'six road wheels on the measured Type 89 stations (0.788 m pitch)');
    assert.equal(Math.abs(gear?.xcLeft), 1.34, 'left course on the measured Type 89 track centre');
    assert.equal(Math.abs(gear?.xcRight), 1.34, 'right course on the measured Type 89 track centre');
    assert.equal(gear?.trackW, 0.45, 'Type 89 track width');
    assert.equal(gear?.trackPatternId, 'japanese-modular', 'Light Tiger keeps its Japanese shoe construction');
    assert.equal(gear?.suspensionDynamic, true, 'road wheels retain dynamic inboard suspension arms');
    assert.equal(hull.userData.runningGearUnitCount, 1, 'Light Tiger owns one canonical animated running-gear course');

    // Turret: a short bustle, the slot-mounted mantlet and the launcher pods outboard of both walls.
    const turretShell = new Box3().setFromObject(turret.getObjectByName('turret'));
    assert.ok(Math.abs(turretShell.max.y - turret.position.y - 0.65 * S) < 0.01, `${quality}: turret roof 0.65 m over the ring`);
    assert.ok(turretShell.min.z - turret.position.z < -1.6 * S, `${quality}: the turret carries its bustle`);
    const turretEquipment = new Box3().setFromObject(turret.getObjectByName('turretEquipment'));
    assert.ok(turretEquipment.max.x > 1.38 * S && turretEquipment.min.x < -1.38 * S,
      `${quality}: twin launcher pods stand clear of both turret walls`);
    assert.ok(gun.getObjectByName('gunMount'), 'Light Tiger carries a camouflaged rocking mantlet');
    assert.ok(gun.getObjectByName('gunMountDark'), 'Light Tiger carries the mantlet hardware and coax');
    assert.deepEqual(gun.userData.type89GunMantletReceipt, {
      architecture: 'slot-mounted-flat-mask-rocking-mantlet-v2',
      movingWithGun: true,
      verticalOffsetM: 0,
      lengthM: 0.60,
      slotHalfWidthM: 0.37,
      slotBackWallZM: 0.88,
      surroundsMainBarrel: true,
      surroundsCoax: true,
    }, 'Light Tiger uses a compact flat mask and rocking mantlet in its gun slot');
    assert.ok(Math.abs(gun.getObjectByName('rig_muzzle')?.position.z - 3.10 * S) < 1e-6,
      'Light Tiger muzzle and firing-effects station follows the compact KDE-35 frame');
    assert.ok(tank.root.getObjectByName('muzzleBoreShadowRim'), 'KDE-35 carries an explicitly authored annular muzzle rim');
    assert.ok(tank.root.getObjectByName('muzzleBoreShadowDisc'), 'KDE-35 carries an explicitly authored recessed bore disc');
  } finally {
    tank.dispose();
  }
}

console.log('type89LightTiger selftest passed');
