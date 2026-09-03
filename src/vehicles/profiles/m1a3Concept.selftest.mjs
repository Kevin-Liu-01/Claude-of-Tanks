import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import { tankTier } from '../tier.ts';

const spec = getSpec('m1a3');
assert.equal(spec.name, 'M1A3 Abrams');
assert.equal(spec.label.shortName, 'M1A3 Abrams');
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

const turretShell = tank.root.getObjectByName('turret');
assert.ok(turretShell?.isMesh, 'M1A3 structural turret shell is independently inspectable');
const turretPositions = turretShell.geometry.attributes.position;
const turretVertexY = (x, z) => {
  const ys = [];
  for (let i = 0; i < turretPositions.count; i++) {
    if (Math.abs(turretPositions.getX(i) - x) < 1e-4
      && Math.abs(turretPositions.getZ(i) - z) < 1e-4) {
      ys.push(turretPositions.getY(i));
    }
  }
  assert.ok(ys.length > 0, `M1A3 turret vertex exists at x=${x}, z=${z}`);
  return Math.max(...ys);
};
const roofRampY = (z) => 0.68 + (0.76 - 0.68) * ((z - 1.08) / (-0.54 - 1.08));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-4,
  `${label}: expected ${expected.toFixed(4)}, got ${actual.toFixed(4)}`);
assert.ok(Math.abs(turretVertexY(-1.42, 1.08) - 0.68) < 1e-4,
  'left shoulder retains the broad front-plane roof seam');
assert.ok(Math.abs(turretVertexY(1.42, 1.08) - 0.68) < 1e-4,
  'right shoulder retains the broad front-plane roof seam');
near(turretVertexY(-0.36, 1.74), 0.50,
  'left cheek preserves the low mantlet brow');
near(turretVertexY(0.36, 1.74), 0.50,
  'right cheek preserves the low mantlet brow');
near(turretVertexY(-0.3672, 1.66), 0.47,
  'center throat preserves the low mantlet brow');
near(turretVertexY(-0.36, 1.03), roofRampY(1.03),
  'left cheek rear edge rises into the existing roof plane');
near(turretVertexY(0.36, 1.03), roofRampY(1.03),
  'right cheek rear edge rises into the existing roof plane');
near(turretVertexY(1.42, 0.38), roofRampY(0.38),
  'outer cheek rear edge rises into the existing roof plane');
near(turretVertexY(0.3672, 0.72), roofRampY(0.72),
  'center throat rear edge rises into the existing roof plane');

const cheekRoofCorners = (side) => [
  [side * 0.36, 0.50, 1.74],
  [side * 1.42, 0.68, 1.08],
  [side * 1.42, roofRampY(0.38), 0.38],
  [side * 0.36, roofRampY(1.03), 1.03],
];
const vertexMatches = (position, expected) => expected.some(([x, y, z]) =>
  Math.abs(position[0] - x) < 1e-4
  && Math.abs(position[1] - y) < 1e-4
  && Math.abs(position[2] - z) < 1e-4);
const cheekRoofTriangles = (side) => {
  const expected = cheekRoofCorners(side);
  const triangles = [];
  for (let face = 0; face < turretPositions.count / 3; face++) {
    const vertices = [0, 1, 2].map((offset) => {
      const index = face * 3 + offset;
      return [turretPositions.getX(index), turretPositions.getY(index), turretPositions.getZ(index)];
    });
    if (vertices.every((vertex) => vertexMatches(vertex, expected))) triangles.push(vertices);
  }
  assert.equal(triangles.length, 2, `${side < 0 ? 'left' : 'right'} cheek roof has one two-triangle facet`);
  return triangles;
};
const triangleNormal = ([a, b, c]) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal);
  return normal.map((value) => value / length);
};
const facetAngleDeg = (triangles) => {
  const [a, b] = triangles.map(triangleNormal);
  const dot = Math.max(-1, Math.min(1, a.reduce((sum, value, index) => sum + value * b[index], 0)));
  return Math.acos(dot) * 180 / Math.PI;
};
const leftCheekFacetAngle = facetAngleDeg(cheekRoofTriangles(-1));
const rightCheekFacetAngle = facetAngleDeg(cheekRoofTriangles(1));
assert.ok(rightCheekFacetAngle < 14,
  `right cheek roof remains one Gallery surface (${rightCheekFacetAngle.toFixed(2)} degrees)`);
near(rightCheekFacetAngle, leftCheekFacetAngle,
  'right cheek roof mirrors the joined left cheek surface');

const expectedMantletRoofRamp = {
  cheekFrontY: 0.50,
  throatFrontY: 0.47,
  cheekInnerRearY: roofRampY(1.03),
  cheekOuterRearY: roofRampY(0.38),
  throatRearY: roofRampY(0.72),
};

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
  mantletRoofRamp: expectedMantletRoofRamp,
  cheekRoofSurface: 'joined-mirrored-facet',
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
