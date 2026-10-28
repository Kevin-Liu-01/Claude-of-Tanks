import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import { tankTier } from '../tier.ts';
import {shellPart,auditShellParts} from '../../../tools/base-shell-audit-math.mjs';

const spec = getSpec('m1a3');
// 2026-10-28 (m1e3-264, owner): the id stays m1a3; the vehicle is shown as the M1E3
assert.equal(spec.name, 'M1E3 Abrams');
assert.equal(spec.label.shortName, 'M1E3 Abrams');
assert.ok(spec.label.searchAliases.includes('M1A3 Abrams'), 'the old name still finds it');
assert.equal(spec.variantOf, 'm1a1_abrams_hc');
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
  intraClipS: 2.5,
  fullReloadS: 21,
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

const baseStock=[];
const tank = createTank('m1a3', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
  partCensus(bucket,g,source){
    if(source!=='add'||!['hull','turret'].includes(bucket))return;
    const part=shellPart(g,{bucket,ordinal:baseStock.length});
    if(Math.max(...part.size.toArray())>=.75&&part.area>=.35)baseStock.push(part);
  },
});
for(const pair of auditShellParts(baseStock).mirroredPairs){
  assert.ok(pair.maxM<.005,`M1E3 primary mirrored surface mismatch ${pair.maxM}m`);
}
const baseline = createTank('m1a1_abrams_hc', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const hullRig = tank.root.getObjectByName('rig_hull');
const turretRig = tank.root.getObjectByName('rig_turret');
const gunRig = tank.root.getObjectByName('rig_gun');
assert.ok(hullRig && turretRig && gunRig, 'M1E3 retains articulated hull/turret/gun ownership');
assert.ok(gunRig.parent === turretRig, 'the gun articulates with the turret');
assert.equal(turretRig.position.z, 0.55, 'the short uncrewed turret sits over the second road wheel');
assert.ok(tank.root.getObjectByName('m1a3RemoteWeaponTower'), 'the roof weapon station is independently identifiable');

// The demonstrator is clean: no field net, no slat or turret cage.
const names = [];
tank.root.traverse((part) => names.push(part.name));
assert.ok(!names.some((name) => /_ghillie_/.test(name)), 'no field net on the M1E3');
assert.ok(!names.includes('turretOpenLattice'), 'no turret field cage on the M1E3');

// Arrowhead cheeks: the leading edge low on the face (y 0.10) at the gun, a chin under it, the throat left open.
const turretShell = tank.root.getObjectByName('turret');
assert.ok(turretShell?.isMesh, 'M1E3 structural turret shell is independently inspectable');
const turretPositions = turretShell.geometry.attributes.position;
const hasVertex = (x, y, z) => {
  for (let i = 0; i < turretPositions.count; i++) {
    if (Math.abs(turretPositions.getX(i) - x) < 1e-4 && Math.abs(turretPositions.getY(i) - y) < 1e-4
      && Math.abs(turretPositions.getZ(i) - z) < 1e-4) return true;
  }
  return false;
};
for (const side of [-1, 1]) {
  assert.ok(hasVertex(side * 0.37, 0.10, 1.50), `${side < 0 ? 'right' : 'left'} cheek leading edge at the gun`);
  assert.ok(hasVertex(side * 0.37, -0.04, 1.40), `${side < 0 ? 'right' : 'left'} cheek chin undercut below the edge`);
}

const receipt = turretRig.userData.m1e3DesignReceipt;
assert.deepEqual(receipt, {
  family: 'm1e3-demonstrator',
  hull: 'm1-tejas-loft',
  turret: 'uncrewed-m1-cheek-with-autoloader-bustle',
  mainGunCaliberMm: 120,
  gunLengthM: 4.40,
  hullCrewHatches: 2,
  skirtPanelsPerSide: 6,
  roadWheelsPerSide: 7,
  rws: 'r400-class-with-launcher-pod',
  turretRingZ: 0.55,
  turretLengthM: 3.14,
}, 'the visible M1E3 feature receipt remains complete');
assert.ok(hullRig.userData.m1e3DesignReceipt === receipt, 'hull and turret publish one receipt');

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
const m1e3Geometry = geometryStats(tank.root);
const m1a2Geometry = geometryStats(baseline.root);
assert.ok(m1e3Geometry.meshes >= 45 && m1e3Geometry.vertices >= 50000,
  'M1E3 ships a detailed procedural model');
assert.notDeepEqual(m1e3Geometry, m1a2Geometry,
  'M1E3 geometry is a new build rather than an M1A2 material skin');
assert.equal(spec.community, undefined, 'M1E3 has no external model dependency');
assert.equal(spec.publicVisualFallback, undefined, 'M1E3 publishes its own generated assets');

tank.dispose();
baseline.dispose();
console.log('m1a3Concept.selftest: M1E3 hybrid autoloaded combat identity and its demonstrator build pass');
