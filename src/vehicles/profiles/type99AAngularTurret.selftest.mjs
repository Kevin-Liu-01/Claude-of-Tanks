import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';

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
    hullBounds: new Box3().setFromObject(hullRig),
    armoredTurretBounds,
    hullSignature: geometrySignature(hull),
    turretSignature: geometrySignature(turret),
  };
}

const type99a = inspect('type99a');
const ztz99a2 = inspect('ztz99a2');
const vt4a1 = inspect('vt4a1');

// Type 99A keeps the certified native hull and running gear while replacing
// the entire old rotating assembly with an independently scaled derivative
// of the VT chevron architecture.
assert.equal(type99a.hullRig.userData.runningGearReceipts[0].trackW, 0.629,
  'Type 99A: certified native running gear is retained');
assert.deepEqual(type99a.turretRig.position.toArray(), [0, 1.48, 0.22],
  'Type 99A: VT-derived turret is seated at its authored ring datum');
assert.deepEqual(type99a.gunRig.position.toArray(), [0, 0.4368, 0.74],
  'Type 99A: gun is re-seated inside the new chevron throat');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.derivativeOf, 'vt4a1',
  'Type 99A: receipt declares the VT-4A1 design relationship');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.legacyType99aTurretRemoved, true,
  'Type 99A: old rotating assembly is absent');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretEquipmentReseated, true,
  'Type 99A: all roof and side equipment is re-seated');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretHeightScale, 1.12,
  'Type 99A: VT-derived shell is raised to the Type 99A combat-station envelope');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.continuousCommanderSightStack, true,
  'Type 99A: commander sight is continuously seated from roof to optic head');
assert.notEqual(type99a.turretSignature, vt4a1.turretSignature,
  'Type 99A: derivative is not a duplicate VT-4A1 mesh');
assert.equal(type99a.turretRig.userData.vtFamilyTurretReceipt?.architecture,
  vt4a1.turretRig.userData.vtFamilyTurretReceipt?.architecture,
  'Type 99A and VT-4A1 share one authored chevron architecture');

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

// The VT turret remains independent, but is now deliberately lower than the
// A2 while its chevrons form the complete front and its armored bustle carries
// the shell substantially farther aft.
assert.notEqual(vt4a1.turretSignature, ztz99a2.turretSignature,
  'VT-4A1: new turret does not reuse ZTZ-99A2 turret geometry');
assert.deepEqual(vt4a1.turretRig.position.toArray(), [0, 1.56, 0.32],
  'VT-4A1: turret moves 0.47 m forward to the centered ring station');
assert.deepEqual(vt4a1.gunRig.position.toArray(), [0, 0.3198, 0.75],
  'VT-4A1: gun remains centered in the slightly taller throat');
const a2TurretSize = ztz99a2.armoredTurretBounds.getSize(new Vector3());
const vtTurretSize = vt4a1.armoredTurretBounds.getSize(new Vector3());
assert(vtTurretSize.y < a2TurretSize.y,
  'VT-4A1: complete armored turret is lower than ZTZ-99A2');
assert(vt4a1.chevrons, 'VT-4A1: integrated chevron front exists');
assert(vt4a1.chevrons.geometry.attributes.position.count >= 180,
  'VT-4A1: chevron front uses closed multi-station geometry on both sides');
const chevronBounds = new Box3().setFromObject(vt4a1.chevrons);
const gunWorld = vt4a1.gunRig.getWorldPosition(new Vector3());
assert(chevronBounds.max.x >= 1.67 && chevronBounds.min.x <= -1.67,
  'VT-4A1: chevrons terminate inside both full-width turret shoulders');
assert(chevronBounds.max.z >= gunWorld.z + 0.60,
  'VT-4A1: chevrons close the gun-throat/front-shell junction');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.integratedChevronFront, true,
  'VT-4A1: turret receipt records the merged chevron front');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.turretHeightScale, 0.82,
  'VT-4A1: primary turret shell is raised slightly from its old 0.75 scale');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.legacyFrontalWedgeRemoved, true,
  'VT-4A1: legacy protruding frontal shell is absent');
assert.equal(vt4a1.turretRig.userData.vt4a1TurretReceipt?.chevronsArePrimaryFront, true,
  'VT-4A1: chevrons are the primary front rather than applique');
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
assert(
  vt4a1.turretRig.userData.vt4a1TurretReceipt.upperRootSetbackM
    > vt4a1.turretRig.userData.vt4a1TurretReceipt.lowerReturnMaxSetbackM,
  'VT-4A1: upper wedge dominates the side section instead of forming a diamond',
);

assert.equal(ztz99a2.turretRig.userData.ztz99a2TurretIntegrationReceipt?.selectedArmorAttached, true,
  'ZTZ-99A2: selected side armor and seam pieces are attached');
assert(ztz99a2.turretRig.userData.ztz99a2TurretIntegrationReceipt.serviceModuleInnerFaceXM
    < ztz99a2.turretRig.userData.ztz99a2TurretIntegrationReceipt.compactedShoulderOuterXM,
  'ZTZ-99A2: side modules overlap the compacted turret shoulder');
assert.equal(ztz99a2.turretRig.userData.ztz99a2TurretIntegrationReceipt?.mirroredServiceModules, true,
  'ZTZ-99A2: attachment repair is symmetric');

type99a.tank.dispose();
ztz99a2.tank.dispose();
vt4a1.tank.dispose();
console.log('type99AAngularTurret.selftest: forward/taller VT-4A1 and independent VT-derived Type 99A turret, equipment and deep bustle verified');
