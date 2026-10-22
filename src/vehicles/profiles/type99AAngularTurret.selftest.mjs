import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { boundsWithoutCamouflage } from '../camouflageBounds.test-support.mjs';

function geometrySignature(mesh) {
  const positions = mesh.geometry.attributes.position.array;
  let hash = 2166136261;
  for (let index = 0; index < positions.length; index++) {
    hash ^= Math.round(positions[index] * 10000);
    hash = Math.imul(hash, 16777619);
  }
  return `${positions.length}:${hash >>> 0}`;
}

function inspect(id) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const hull = tank.root.getObjectByName('hull');
  const turret = tank.root.getObjectByName('turret');
  const chevrons = tank.root.getObjectByName('turretExternalArmor');
  assert(hullRig && turretRig && gunRig && hull && turret,
    `${id}: hull, turret and gun rigs exist`);

  const armoredTurretBounds = new Box3().setFromObject(turret);
  if (chevrons) armoredTurretBounds.union(new Box3().setFromObject(chevrons));

  return {
    tank,
    hullRig,
    turretRig,
    gunRig,
    hull,
    turret,
    chevrons,
    // camouflage excluded on the coordinator's ruling (2026-10-11): a real vehicle's geometry never includes its nets
    // and garnish; do not re-add it (camouflageBounds.test-support.mjs)
    hullBounds: boundsWithoutCamouflage(hullRig),
    armoredTurretBounds,
    hullSignature: geometrySignature(hull),
    turretSignature: geometrySignature(turret),
  };
}

function type99aEngineDeckHeight(worldZ) {
  if (worldZ >= -1.21) return 1.50;
  if (worldZ <= -1.48) return 1.78;
  return 1.50 + ((-1.21 - worldZ) / 0.27) * 0.28;
}

function minimumRearDeckClearance(object) {
  let minimum = Infinity;
  const point = new Vector3();
  object.traverse((child) => {
    const position = child.geometry?.attributes?.position;
    if (!child.isMesh || !position) return;
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      if (Math.abs(point.x) > 1.70 || point.z >= -1.21) continue;
      minimum = Math.min(minimum, point.y - type99aEngineDeckHeight(point.z));
    }
  });
  return minimum;
}

const ztz99_longwei = inspect('ztz99_longwei');
const ztz99a2Prototype = inspect('ztz99a');
const ztz99a2 = inspect('ztz99a2');
const vt4a1 = inspect('vt4a1');

// The Longwei (release 233) keeps the certified Type 99A hull and running gear under its own terraced turret; the
// VT-derived chevron turret it carried through release 232 is retired (profiles/longwei.ts).
const longweiReceipt = ztz99_longwei.turretRig.userData.longweiTurretReceipt;
assert.equal(ztz99_longwei.hullRig.userData.runningGearReceipts[0].trackW, 0.629,
  'Longwei: certified native running gear is retained');
assert.deepEqual(ztz99_longwei.turretRig.position.toArray(), [0, 1.57, 0.64],
  'Longwei: the turret pivot (a gameplay datum) is unchanged');
assert.deepEqual(ztz99_longwei.gunRig.position.toArray(), [0, 0.3198, 0.74],
  'Longwei: the trunnion (a gameplay datum) is unchanged');
assert.equal(longweiReceipt?.architecture, 'longwei-terraced-r233', 'Longwei: the terraced turret is built');
assert.equal(longweiReceipt?.legacyVtDerivativeRetired, true, 'Longwei: the VT-derived turret is gone');
assert.equal(ztz99_longwei.turretRig.userData.type99aVtDerivativeReceipt, undefined,
  'Longwei: no VT-derivative receipt survives');
assert(longweiReceipt.mantletHalfWidthM < longweiReceipt.throatHalfWidthM,
  'Longwei: the box mantlet clears its throat walls');
for (const name of ['turret', 'turretDark', 'turretExternalArmor']) {
  const object = ztz99_longwei.tank.root.getObjectByName(name);
  assert(object && minimumRearDeckClearance(object) >= 0.02,
    `Longwei: ${name} rear vertices clear the ramp and engine deck by at least 0.02 m`);
}
assert.notEqual(ztz99_longwei.turretSignature, vt4a1.turretSignature,
  'Longwei: its turret is not the VT-4A1 mesh');
assert.notEqual(ztz99_longwei.turretSignature, ztz99a2.turretSignature,
  'Longwei: its turret is not the ZTZ-99A2 mesh');

// VT-4A1 and ZTZ-99A2 intentionally share one exact hull builder.
assert.equal(vt4a1.hullSignature, ztz99a2.hullSignature,
  'VT-4A1: primary hull geometry is an exact ZTZ-99A2 clone');
assert.deepEqual(vt4a1.hullBounds.min.toArray(), ztz99a2.hullBounds.min.toArray(),
  'VT-4A1: hull minimum envelope matches ZTZ-99A2 exactly');
assert.deepEqual(vt4a1.hullBounds.max.toArray(), ztz99a2.hullBounds.max.toArray(),
  'VT-4A1: hull maximum envelope matches ZTZ-99A2 exactly');
assert.deepEqual(vt4a1.hullRig.userData.runningGearReceipts,
  ztz99a2.hullRig.userData.runningGearReceipts,
  'VT-4A1: tracks, wheel stations and running gear match ZTZ-99A2');
assert.equal(vt4a1.hullRig.userData.vt4a1GeometryReceipt?.exactHullCloneOf, 'ztz99a2',
  'VT-4A1: geometry receipt declares the shared A2 chassis');
assert.equal(vt4a1.hullRig.userData.vt4a1GeometryReceipt?.sourceGeometryImported, false,
  'VT-4A1: comparison GLB is never imported as playable geometry');

// The VT turret remains independent: its chevrons form the complete front
// while the canonical A2 now owns a separate production-arrow architecture.
assert.notEqual(vt4a1.turretSignature, ztz99a2.turretSignature,
  'VT-4A1: new turret does not reuse ZTZ-99A2 turret geometry');
assert.deepEqual(vt4a1.turretRig.position.toArray(), [0, 1.56, 0.40],
  'VT-4A1: turret moves another 0.08 m forward to the centered ring station');
assert.deepEqual(vt4a1.gunRig.position.toArray(), [0, 0.3198, 0.75],
  'VT-4A1: gun remains centered in the slightly taller throat');
assert.notEqual(vt4a1.turretRig.userData.vtFamilyTurretReceipt?.architecture,
  ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.architecture,
  'VT-4A1 and production ZTZ-99A2 retain independent turret architectures');
assert(vt4a1.chevrons, 'VT-4A1: raised chevron ERA faces exist');
assert(vt4a1.chevrons.geometry.attributes.position.count >= 180,
  'VT-4A1: both chevron carriers retain complete raised ERA face courses');
const chevronBounds = new Box3().setFromObject(vt4a1.turret);
const gunWorld = vt4a1.gunRig.getWorldPosition(new Vector3());
assert(chevronBounds.max.x >= 1.67 && chevronBounds.min.x <= -1.67,
  'VT-4A1: permanent chevrons terminate inside both full-width turret shoulders');
assert(chevronBounds.max.z >= gunWorld.z + 0.60,
  'VT-4A1: permanent chevrons close the gun-throat/front-shell junction');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.integratedChevronFront, true,
  'VT-4A1: turret receipt records the merged chevron front');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.turretHeightScale, 0.82,
  'VT-4A1: primary turret shell is raised slightly from its old 0.75 scale');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.legacyFrontalWedgeRemoved, true,
  'VT-4A1: legacy protruding frontal shell is absent');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.chevronsArePrimaryFront, true,
  'VT-4A1: chevrons are the primary front rather than applique');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.permanentChevronCarriers, 2,
  'VT-4A1: both closed structural chevron carriers remain part of the turret');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.detonatingChevronFacePanels, 8,
  'VT-4A1: only eight raised face cassettes are assigned to ERA depletion');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.spentStateRetainsClosedFront, true,
  'VT-4A1: ERA depletion retains a complete armored front');
assert(vt4a1.turretRig.userData.vt4a1TurretReceipt.primaryShellHeightM
    > vt4a1.turretRig.userData.vt4a1TurretReceipt.previousPrimaryShellHeightM,
  'VT-4A1: primary shell is measurably taller than the previous revision');
assert(vt4a1.turretRig.userData.vt4a1TurretReceipt?.armoredBustleRearZM <= -2.68,
  'VT-4A1: integral armored bustle reaches the requested deep rear station');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.giantIntegratedBustle, true,
  'VT-4A1: receipt records the giant integrated bustle');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.chevronProfile,
  'leopard-2a6-derived',
  'VT-4A1: front uses the Leopard 2A6 cheek architecture');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.upperSlopeDeg, 19,
  'VT-4A1: dominant upper cheek keeps the Leopard 2A6 19-degree section');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.sharedPhysicalRidge, true,
  'VT-4A1: upper and lower cheek faces meet at one physical ridge');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.surfacePanelsPerSide, 4,
  'VT-4A1: each cheek carries four broad Leopard-style face cassettes');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.compoundShoulderTerminal, true,
  'VT-4A1: roof, ridge and wall terminate on the compound turret shoulder');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.chevronLiftM, 0.07,
  'VT-4A1: complete chevron line rises 0.07 m into the turret shoulder datum');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.mirroredChevronSideJoins, true,
  'VT-4A1: chevron-to-turret closure is authored symmetrically');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.chevronSideJoinGapM, 0,
  'VT-4A1: terminal caps close both visible turret-side seams');
assert(
  vt4a1.turretRig.userData.vt4a1TurretReceipt.upperRootSetbackM
    > vt4a1.turretRig.userData.vt4a1TurretReceipt.lowerReturnMaxSetbackM,
  'VT-4A1: upper wedge dominates the side section instead of forming a diamond',
);

assert.equal(ztz99a2Prototype.turretRig.userData.ztz99a2TurretIntegrationReceipt?.selectedArmorAttached, true,
  'ZTZ-99A2 Prototype: preserved side armor and seam pieces remain attached');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.integratedChevronFront, true,
  'ZTZ-99A2: canonical production turret carries an integrated chevron front');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.chevronProfile,
  'vt4a1-leopard-2a6-derived',
  'ZTZ-99A2: prominent front uses the VT-4A1 Leopard-style chevron grammar');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.surfacePanelsPerSide, 4,
  'ZTZ-99A2: each closed cheek has four raised face cassettes');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.fullHeightFrontCoverage, true,
  'ZTZ-99A2: chevrons cover the complete roof-to-chin frontal height');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.bustleExtensionM, 0.50,
  'ZTZ-99A2: production bustle extension is exact');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.bustleUndersideRiseM, 0.42,
  'ZTZ-99A2: production bustle underside rise is exact');
assert.notEqual(ztz99a2.turretSignature, ztz99a2Prototype.turretSignature,
  'ZTZ-99A2: production turret is geometrically distinct from the preserved prototype');

ztz99_longwei.tank.dispose();
ztz99a2Prototype.tank.dispose();
ztz99a2.tank.dispose();
vt4a1.tank.dispose();
console.log('type99AAngularTurret.selftest: forward/taller VT-4A1, the A2 family and the Longwei\'s own terraced turret verified');
