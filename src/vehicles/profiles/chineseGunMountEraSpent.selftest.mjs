import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

function signature(mesh) {
  const positions = mesh.geometry.attributes.position.array;
  let hash = 2166136261;
  for (const value of positions) {
    hash ^= Math.round(value * 10000);
    hash = Math.imul(hash, 16777619);
  }
  return `${positions.length}:${hash >>> 0}`;
}

function radiiAtZ(mesh, targetZ) {
  const positions = mesh.geometry.attributes.position;
  const radii = [];
  for (let index = 0; index < positions.count; index++) {
    if (Math.abs(positions.getZ(index) - targetZ) > 1e-4) continue;
    const radius = Math.hypot(positions.getX(index), positions.getY(index));
    if (radius > 0.05) radii.push(radius);
  }
  return radii;
}

function includesRadius(radii, expected) {
  return radii.some((radius) => Math.abs(radius - expected) < 1e-4);
}

function hasVertex(mesh, expected) {
  const positions = mesh.geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    if (Math.abs(positions.getX(index) - expected[0]) < 1e-4
        && Math.abs(positions.getY(index) - expected[1]) < 1e-4
        && Math.abs(positions.getZ(index) - expected[2]) < 1e-4) return true;
  }
  return false;
}

function collapsedVertices(mesh) {
  const positions = mesh.geometry.attributes.position;
  let count = 0;
  for (let index = 0; index < positions.count; index++) {
    if (positions.getY(index) < -900) count++;
  }
  return count;
}

// CylinderGeometry's first radius becomes the +Z/front cap after cylZ's
// rotation. Each modern Chinese gun-root frustum must therefore be narrower
// at its forward plane and broader where it enters the turret.
for (const audit of [
  { id: 'vt4a1', rearZ: 0.13, rearR: 0.235, frontZ: 0.81, frontR: 0.14 },
  { id: 'type99a', rearZ: 0.13, rearR: 0.2444, frontZ: 0.81, frontR: 0.1456 },
  { id: 'ztz99a2_prototype', rearZ: 0.38, rearR: 0.20, frontZ: 0.72, frontR: 0.165 },
  { id: 'ztz99a2', rearZ: 0.38, rearR: 0.19, frontZ: 0.70, frontR: 0.16 },
  { id: 'ztz85_iii', rearZ: 0.13, rearR: 0.23, frontZ: 0.51, frontR: 0.17 },
]) {
  const tank = createTank(audit.id, null, { proceduralOnly: true, geometryReceipt: true });
  const gunMount = tank.root.getObjectByName('gunMount');
  assert(gunMount?.geometry, `${audit.id}: merged gun mount exists`);
  const rearRadii = radiiAtZ(gunMount, audit.rearZ);
  const frontRadii = radiiAtZ(gunMount, audit.frontZ);
  assert(includesRadius(rearRadii, audit.rearR),
    `${audit.id}: turret-side gun-root radius is ${audit.rearR} m`);
  assert(includesRadius(frontRadii, audit.frontR),
    `${audit.id}: forward gun-root radius is ${audit.frontR} m`);
  assert(audit.rearR > audit.frontR,
    `${audit.id}: gun-root frustum narrows from turret to barrel`);
  tank.dispose();
}

// These points are structural corners on the closed left/right chevron
// carriers. They must remain in the primary turret mesh when every bound ERA
// sector is depleted; only the raised surface-panel vertices may collapse.
for (const audit of [
  {
    id: 'vt4a1', receipt: 'vtFamilyTurretReceipt',
    permanentPoints: [[-0.22, 0.7424, 0.46], [0.22, 0.1028, 0.78]],
  },
  {
    id: 'type99a', receipt: 'vtFamilyTurretReceipt',
    permanentPoints: [[-0.2112, 0.6724, 0.6124], [0.2112, 0.0328, 0.9132]],
  },
  {
    id: 'ztz99a2', receipt: 'ztz99a2ProductionReceipt',
    permanentPoints: [[-0.22, 0.83, 0.58], [0.22, -0.04, 0.86]],
  },
]) {
  const tank = createTank(audit.id, null, { proceduralOnly: true, geometryReceipt: true });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const turret = tank.root.getObjectByName('turret');
  const faceEra = tank.root.getObjectByName('turretExternalArmor');
  assert(turretRig && turret?.geometry && faceEra?.geometry,
    `${audit.id}: permanent turret and raised chevron ERA exist`);
  assert.equal(turretRig.userData[audit.receipt]?.permanentChevronCarriers, 2,
    `${audit.id}: receipt records both permanent chevron carriers`);
  assert.equal(turretRig.userData[audit.receipt]?.spentStateRetainsClosedFront, true,
    `${audit.id}: receipt records the complete spent-state front`);
  assert.equal(turretRig.userData[audit.receipt]?.permanentArmoredBustle, true,
    `${audit.id}: ERA depletion cannot remove the armored bustle structure`);
  for (const point of audit.permanentPoints) {
    assert(hasVertex(turret, point),
      `${audit.id}: primary turret contains permanent chevron corner ${point.join(',')}`);
  }

  const primaryBefore = signature(turret);
  const collapsedBefore = collapsedVertices(faceEra);
  const eraNames = tank.root.userData.eraClusterNames;
  assert(Array.isArray(eraNames) && eraNames.length > 0,
    `${audit.id}: gameplay ERA is bound to visual sectors`);
  for (const plateName of eraNames) tank.stripEra(plateName);
  assert(collapsedVertices(faceEra) > collapsedBefore,
    `${audit.id}: ERA depletion removes raised face-panel vertices`);
  assert.equal(signature(turret), primaryBefore,
    `${audit.id}: ERA depletion cannot remove structural turret geometry`);
  for (const point of audit.permanentPoints) {
    assert(hasVertex(turret, point),
      `${audit.id}: spent state retains chevron corner ${point.join(',')}`);
  }
  assert.equal(tank.resetEra(), true, `${audit.id}: ERA visuals reset for a new round`);
  assert.equal(collapsedVertices(faceEra), collapsedBefore,
    `${audit.id}: reset restores every raised chevron face panel`);
  tank.dispose();
}

console.log('chineseGunMountEraSpent.selftest: gun-root tapers and permanent spent-state chevron carriers verified');
