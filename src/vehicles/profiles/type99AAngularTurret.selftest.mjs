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

const type99a = inspect('type99a');
const ztz99a2Prototype = inspect('ztz99a2_prototype');
const ztz99a2 = inspect('ztz99a2');
const vt4a1 = inspect('vt4a1');

// Type 99A keeps the certified native hull and running gear while replacing
// the entire old rotating assembly with an independently scaled derivative
// of the VT chevron architecture.
assert.equal(type99a.hullRig.userData.runningGearReceipts[0].trackW, 0.629,
  'Type 99A: certified native running gear is retained');
assert.deepEqual(type99a.turretRig.position.toArray(), [0, 1.57, 0.64],
  'Type 99A: complete VT-derived rotating assembly moves forward and slightly upward');
assert.deepEqual(type99a.gunRig.position.toArray(), [0, 0.3198, 0.74],
  'Type 99A: gun is re-seated inside the new chevron throat');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.derivativeOf, 'vt4a1',
  'Type 99A: receipt declares the VT-4A1 design relationship');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.legacyType99aTurretRemoved, true,
  'Type 99A: old rotating assembly is absent');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretEquipmentReseated, true,
  'Type 99A: all roof and side equipment is re-seated');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretHeightScale, 0.82,
  'Type 99A: VT-derived shell matches the VT-4A1 vertical envelope');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.matchedVt4a1TurretHeight, true,
  'Type 99A: receipt records the requested VT-4A1 height normalization');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.continuousCommanderSightStack, true,
  'Type 99A: commander sight is continuously seated from roof to optic head');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.frontShellLengthScale, 0.90,
  'Type 99A: selected forward shell course is exactly 10% shorter');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.chevronInnerAdvanceM, 0.18,
  'Type 99A: chevron throat advances substantially beyond the shortened shell');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.chevronOuterAdvanceM, 0.04,
  'Type 99A: chevron advance tapers into the sidewall rather than detaching at the shoulder');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.chevronSideJoinGapM, 0,
  'Type 99A: mirrored chevron terminal caps close the former turret-side gap');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretMovedForwardM, 0.42,
  'Type 99A: receipt records the complete 0.42 m forward turret move');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretRaisedM, 0.09,
  'Type 99A: complete rotating assembly rises 0.09 m');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.rearExtensionM, 0.50,
  'Type 99A: integral bustle extends 0.50 m aft of its former stations');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.rearUndersideLiftM, 0.42,
  'Type 99A: rear underside climbs 0.42 m to clear the engine deck');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.slopedBustleUnderside, true,
  'Type 99A: receipt records the structural sloped bustle underside');
assert(type99a.turretRig.userData.type99aVtDerivativeReceipt?.minimumRearDeckClearanceM >= 0.02,
  'Type 99A: extended bustle retains positive rear-deck clearance');
for (const name of ['turret', 'turretDark', 'turretExternalArmor']) {
  const object = type99a.tank.root.getObjectByName(name);
  assert(object && minimumRearDeckClearance(object) >= 0.02,
    `Type 99A: ${name} rear vertices clear the ramp and engine deck by at least 0.02 m`);
}
assert.equal(type99a.hullRig.userData.rearFuelDrumReceipt?.fuelDrums, 2,
  'Type 99A: rear service rack carries exactly two auxiliary fuel drums');
assert.equal(type99a.hullRig.userData.rearFuelDrumReceipt?.drumDiameterM, 0.50,
  'Type 99A: rear drums have the requested large 0.50 m diameter');
assert.equal(type99a.hullRig.userData.rearFuelDrumReceipt?.drumLengthM, 1.12,
  'Type 99A: twin transverse drums span the rear service wall');
assert.equal(type99a.hullRig.userData.rearFuelDrumReceipt?.supportedAndSeated, true,
  'Type 99A: drum rack overlaps the transom and carries both barrels');
assert.notEqual(type99a.turretSignature, vt4a1.turretSignature,
  'Type 99A: derivative is not a duplicate VT-4A1 mesh');
assert.equal(type99a.turretRig.userData.vtFamilyTurretReceipt?.architecture,
  vt4a1.turretRig.userData.vtFamilyTurretReceipt?.architecture,
  'Type 99A and VT-4A1 share one authored chevron architecture');
assert.equal(type99a.turretRig.userData.type99aVtDerivativeReceipt?.turretHeightScale,
  vt4a1.turretRig.userData.vt4a1TurretReceipt?.turretHeightScale,
  'Type 99A and VT-4A1 use the same primary turret height scale');
const type99aPrimaryTurretSize = new Box3().setFromObject(type99a.turret).getSize(new Vector3());
const vt4a1PrimaryTurretSize = new Box3().setFromObject(vt4a1.turret).getSize(new Vector3());
assert(Math.abs(type99aPrimaryTurretSize.y - vt4a1PrimaryTurretSize.y) < 1e-8,
  'Type 99A and VT-4A1 primary turret meshes have the same measured height');

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
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.bustleExtensionM, 0.50,
  'ZTZ-99A2: production bustle extension is exact');
assert.equal(ztz99a2.turretRig.userData.ztz99a2ProductionReceipt?.bustleUndersideRiseM, 0.42,
  'ZTZ-99A2: production bustle underside rise is exact');
assert.notEqual(ztz99a2.turretSignature, ztz99a2Prototype.turretSignature,
  'ZTZ-99A2: production turret is geometrically distinct from the preserved prototype');

type99a.tank.dispose();
ztz99a2Prototype.tank.dispose();
ztz99a2.tank.dispose();
vt4a1.tank.dispose();
console.log('type99AAngularTurret.selftest: forward/taller VT-4A1 and independent VT-derived Type 99A turret, equipment and deep bustle verified');
