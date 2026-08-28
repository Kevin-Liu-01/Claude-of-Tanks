import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShell, guideShellToward } from '../../sim/ballistics.ts';
import { specialActionGuidesShell } from '../../sim/specialActions.ts';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.js';
import { tankTier } from '../tier.ts';

const spec = getSpec('m551_sheridan');
assert.ok(spec, 'M551 Sheridan is registered');
assert.equal(tankTier(spec.id), 10, 'Sheridan is a Tier X vehicle');
assert.equal(spec.role, 'light');
assert.equal(spec.gun.caliberMm, 152);
assert.equal(spec.gun.primaryGuided, true);
assert.equal(spec.gun.shells.length, 1, 'Sheridan is a dedicated missile-only tank');
assert.equal(spec.gun.shells[0].guided, true);
assert.match(spec.gun.shells[0].name, /MGM-51C Shillelagh/i);
assert.ok(spec.armor.modules.some((module) => module.module === 'missileRack'),
  'damageable combat anatomy includes the missile stowage');

const missile = createShell(
  spec.gun.shells[0], spec.id, true,
  new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 60,
);
const initialSpeed = missile.vel.length();
assert.equal(specialActionGuidesShell({ spec }, missile), true,
  'the primary Shillelagh remains continuously guided without a secondary-weapon mode');
assert.equal(guideShellToward(missile, new THREE.Vector3(18, 2, 80), 1 / 60), true);
assert.ok(missile.vel.x > 0, 'Shillelagh steers toward the sight-owned target');
assert.ok(Math.abs(missile.vel.length() - initialSpeed) < 1e-9,
  'guided steering preserves authored missile speed');

const tank = createTank(spec.id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const hull = tank.root.getObjectByName('rig_hull');
  assert.deepEqual(hull?.userData.sheridanReceipt, {
    roadWheelsPerSide: 5,
    missileOnly: true,
    layeredEraSectors: 5,
    roofMachineGuns: 2,
    rearFuelDrums: 2,
    fuelDrumSupportRails: 3,
    rearFuelCenterZ: -3.12,
    backgroundTrackPanels: 0,
    endWheelScale: 1.25,
    roadWheelFaceProfile: 'stepped-noncoplanar-v2',
    commanderAmmoBoxClosed: true,
    turretRoofClosed: true,
    mantletProfile: 'faceted-chevron-flat-backed-m81',
    mantletSideChevron: true,
    mantletStraightRidge: true,
    mantletRidgeWidth: 1.03,
    hullCreaseDeg: 16,
    turretCreaseDeg: 13,
  });

  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.equal(gear?.wheelZs.length, 5, 'five road wheels are authored per side');
  assert.equal(gear?.shoeCountPerSide, 89, 'track links fully close the enlarged end-wheel course');
  assert.equal(gear?.sprocket.r, 0.305, 'rear sprocket is exactly 25% larger');
  assert.equal(gear?.idler.r, 0.2375, 'front idler is exactly 25% larger');
  assert.ok(gear?.shoePadCoverageRatio >= 0.90, 'track shoes retain full-width pad coverage');
  assert.equal(gear?.suspensionDynamic, true, 'road wheels retain dynamic swing arms');
  assert.ok(gear?.loopPoints.length >= 60, 'dense terminal arcs reseat the track around both end wheels');
  const turnDeg = (before, at, after) => {
    const incoming = [at[0] - before[0], at[1] - before[1]];
    const outgoing = [after[0] - at[0], after[1] - at[1]];
    const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1])
      / (Math.hypot(...incoming) * Math.hypot(...outgoing));
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  };
  assert.ok(turnDeg(gear.loopPoints.at(-1), gear.loopPoints[0], gear.loopPoints[1]) < 10,
    'rear wrap closes through a smooth tangent instead of a pointed vertex');

  assert.ok(tank.root.getObjectByName('sheridanCommanderM2AmmoBox'),
    'the commander M2 rack contains a closed ammunition box');
  for (const name of [
    'gearRoadWheelPressedRims', 'gearRoadWheelDishWells',
    'gearRoadWheelHubDrums', 'gearRoadWheelHubCaps',
  ]) {
    assert.ok(tank.root.getObjectByName(name), `${name} is suspension-bound wheel geometry`);
  }
  const rim = tank.root.getObjectByName('gearRoadWheelPressedRims');
  rim.geometry.computeBoundingBox();
  const rimSize = new THREE.Vector3();
  rim.geometry.boundingBox.getSize(rimSize);
  assert.ok(rimSize.x < rimSize.y * 0.12 && rimSize.x < rimSize.z * 0.12,
    'road-wheel rings lie in the YZ wheel-face plane, not perpendicular to the discs');

  const gunMount = tank.root.getObjectByName('gunMount');
  const gunPosition = gunMount.geometry.getAttribute('position');
  const hasGunVertex = (x, y, z, tolerance = 1e-5) => {
    for (let index = 0; index < gunPosition.count; index++) {
      if (Math.abs(gunPosition.getX(index) - x) <= tolerance
        && Math.abs(gunPosition.getY(index) - y) <= tolerance
        && Math.abs(gunPosition.getZ(index) - z) <= tolerance) return true;
    }
    return false;
  };
  assert.ok(hasGunVertex(-0.5112, 0.0186, 0.86)
    && hasGunVertex(0.5188, 0.0186, 0.86),
  'M81 upper and lower skins meet across one straight forward ridge');
  assert.equal(hasGunVertex(0.0038, 0.2836, 0.86), false,
    'M81 ridge has no separated upper ledge or intervening front band');
  assert.ok(hasGunVertex(-0.5112, -0.2464, 0.18)
    && hasGunVertex(0.5188, 0.2836, 0.18),
  'M81 mantlet keeps a broad planar rear attachment face');

  const era = tank.root.userData.eraFinishReceipt;
  assert.equal(era?.camoProjection, 'vehicle-scale-box-uv');
  assert.equal(era?.bodyAndCoverUseVehiclePaint, true);
  assert.equal(era?.layeredCassettes, 38);
  assert.deepEqual(new Set(era?.gameplaySectors), new Set([
    'sheridan_glacis_era',
    'sheridan_skirt_era_L', 'sheridan_skirt_era_R',
    'sheridan_turret_era_L', 'sheridan_turret_era_R',
  ]));

  const fittings = [];
  tank.root.traverse((object) => {
    if (object.userData?.fittingRoot) fittings.push(object.userData.fitting);
  });
  assert.equal(fittings.filter((kind) => kind === 'pintleMG').length, 2,
    'both roof stations have a seated machine gun');
} finally {
  tank.dispose();
}

console.log('sheridan.selftest: Tier X missile channel, five-wheel track course, layered ERA and dual MG verified');
