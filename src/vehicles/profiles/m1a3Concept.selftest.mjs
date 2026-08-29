import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import { tankTier } from '../tier.ts';

const spec = getSpec('m1a3');
assert.equal(spec.name, 'M1A3 Abrams');
assert.equal(spec.variantOf, 'm1a2');
assert.equal(spec.era, 'next-generation');
assert.equal(tankTier('m1a3'), 10);

assert.deepEqual(spec.hybridDrive, {
  architecture: 'series-parallel',
  motorPowerKw: 1340,
  silentWatch: true,
  regenerativeBraking: true,
  electricPivotAssist: true,
}, 'M1A3 has a battlefield-tuned hybrid-electric drive identity');
assert.equal(spec.protectionSuite.integratedNxra, true);
assert.equal(spec.protectionSuite.hardKillAps, true);
assert.equal(spec.protectionSuite.softKillAps, true);
assert.equal(spec.networkSuite.openArchitecture, true);
assert.equal(spec.networkSuite.cooperativeTargeting, true);
assert.equal(spec.networkSuite.sensorFusion, true);
assert.equal(spec.networkSuite.unmannedAerialSystemLink, true);

assert.equal(spec.gun.caliberMm, 130);
assert.deepEqual(spec.gun.autoloader, {
  magazineSize: 4,
  intraClipS: 2.25,
  fullReloadS: 17.5,
});
const guidedRounds = spec.gun.shells.filter((round) => round.guided);
assert.equal(guidedRounds.length, 1, 'one selectable gun-launched guided munition');
assert.match(guidedRounds[0].name, /hypersonic|gatgm/i);
assert.ok(guidedRounds[0].velocityMps >= 1900, 'guided round has hypersonic-class game velocity');
assert.ok(guidedRounds[0].guidanceTurnRateRadS > 0, 'guided round can maneuver');

const moduleIds = new Set(spec.armor.modules.map((module) => module.module));
for (const id of [
  'engine', 'transmission', 'turretRing', 'radio', 'optics', 'gun',
  'ammoRack', 'autoloader', 'missileRack', 'trackL', 'trackR',
]) assert.ok(moduleIds.has(id), `M1A3 has damageable ${id}`);
assert.ok(spec.armor.hullPlates.some((plate) => /integrated/i.test(plate.name)),
  'integrated hull protection is represented by armor plates');
assert.ok(spec.armor.hullPlates.some((plate) => /modular[_ ]skirt/i.test(plate.name)),
  'modular side skirts are represented by armor plates');
assert.ok(spec.armor.hullPlates.some((plate) => /slat[_ ]cage/i.test(plate.name)),
  'aft cages are represented by spaced armor plates');

const layout = INTERNAL_LAYOUT_BY_TANK.m1a3;
assert.equal(layout.confidence, 'owner-directed');
assert.deepEqual(layout.crew.map(({ role, frame }) => [role, frame]), [
  ['commander', 'hull'],
  ['driver', 'hull'],
  ['gunner', 'hull'],
]);
assert.equal(layout.systems.engine.form, 'hybridElectricPowerpack');
assert.equal(layout.systems.autoloader.form, 'fourRoundBustleConveyor');
assert.equal(layout.systems.missileRack.form, 'gunLaunchedHypersonicRounds');

const tank = createTank('m1a3', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const baseline = createTank('m1a2', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const hullRig = tank.root.getObjectByName('rig_hull');
const turretRig = tank.root.getObjectByName('rig_turret');
const gunRig = tank.root.getObjectByName('rig_gun');
assert.ok(hullRig && turretRig && gunRig, 'M1A3 retains articulated hull/turret/gun ownership');
assert.equal(gunRig.parent, turretRig, '130 mm gun articulates with the turret');
assert.equal(turretRig.position.z, 0.15,
  'the complete M1A3 turret assembly is seated 300 mm farther forward');
assert.ok(tank.root.getObjectByName('m1a3RemoteWeaponTower'),
  'AbramsX-inspired roof weapon tower is independently identifiable');

const receipt = turretRig.userData.m1a3DesignReceipt;
assert.deepEqual(receipt, {
  family: 'first-party-m1a3-concept',
  hull: 'new-faceted-hybrid-abrams',
  turret: 'low-unmanned-style-isolated-bustle',
  mainGunCaliberMm: 130,
  magazineRounds: 4,
  crewCapsuleStations: 3,
  hybridDrive: true,
  modularSkirtPanelsPerSide: 11,
  hullCageRailsPerSide: 4,
  turretCageRailsPerSide: 3,
  hardKillLauncherCount: 4,
  radarFaceCount: 4,
  roofSensorTowers: 3,
  networkMasts: 4,
  rws: true,
  rwsTowerStyle: 'abramsx-inspired-open-yoke',
  turretForwardShiftM: 0.30,
  turretRingZ: 0.15,
}, 'the visible M1A3 feature receipt remains complete');

function geometryStats(root) {
  let meshes = 0;
  let vertices = 0;
  root.traverse((part) => {
    const positions = part.geometry?.attributes?.position;
    if (!positions) return;
    meshes += 1;
    vertices += positions.count;
  });
  return { meshes, vertices };
}
const m1a3Geometry = geometryStats(tank.root);
const m1a2Geometry = geometryStats(baseline.root);
assert.ok(m1a3Geometry.meshes >= 45 && m1a3Geometry.vertices >= 50000,
  'M1A3 ships a detailed procedural model');
assert.notDeepEqual(m1a3Geometry, m1a2Geometry,
  'M1A3 geometry is a new build rather than an M1A2 material skin');
assert.equal(spec.community, undefined, 'M1A3 has no external model dependency');
assert.equal(spec.publicVisualFallback, undefined, 'M1A3 publishes its own generated assets');

tank.dispose();
baseline.dispose();
console.log('m1a3Concept.selftest: hybrid autoloaded combat identity and unique procedural geometry pass');
