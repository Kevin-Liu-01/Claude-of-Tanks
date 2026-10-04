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

function halfWidthAtZ(mesh, targetZ) {
  const positions = mesh.geometry.attributes.position;
  let half = -1;
  for (let index = 0; index < positions.count; index++) {
    if (Math.abs(positions.getZ(index) - targetZ) < 1e-4) half = Math.max(half, Math.abs(positions.getX(index)));
  }
  return half;
}

function channelWallVertices(mesh, halfWidth, minZ) {
  const positions = mesh.geometry.attributes.position;
  const sides = new Set();
  for (let index = 0; index < positions.count; index++) {
    if (positions.getZ(index) > minZ && Math.abs(Math.abs(positions.getX(index)) - halfWidth) < 1e-6) {
      sides.add(Math.sign(positions.getX(index)));
    }
  }
  return sides.size;
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
// Main's owner-directed mantlet fit (2026-10-02, 245aa4e4e) replaced the VT4A1,
// ZTZ-99A2 and ZTZ-99A gun roots with an articulated cover in a 0.80 m channel
// (chineseGunOpening.ts; chineseMantletFit.selftest owns its clearances). The
// same taper holds there: the cover is broad where it leaves the turret
// (0.377 m half-width, inside the 0.40 m channel) and narrow at its nose.
for (const audit of [
  { id: 'vt4a1', fitted: true },
  { id: 'type99a', rearZ: 0.13, rearR: 0.2444, frontZ: 0.81, frontR: 0.1456 },
  { id: 'ztz99a2_prototype', fitted: true },
  { id: 'ztz99a2', fitted: true },
  { id: 'ztz85_iii', rearZ: 0.13, rearR: 0.23, frontZ: 0.51, frontR: 0.17 },
]) {
  const tank = createTank(audit.id, null, { proceduralOnly: true, geometryReceipt: true });
  const gunMount = tank.root.getObjectByName('gunMount');
  assert(gunMount?.geometry, `${audit.id}: merged gun mount exists`);
  if (audit.fitted) {
    const fit = tank.root.getObjectByName('rig_gun')?.userData.chineseMantletFit;
    assert.deepEqual(fit && [fit.channelHalfWidthM, fit.shieldHalfWidthM, fit.articulated], [0.40, 0.377, true],
      `${audit.id}: articulated cover fitted inside the 0.80 m channel`);
    const fittedCover = () => {
      const turretSide = halfWidthAtZ(gunMount, 0.12), nose = halfWidthAtZ(gunMount, fit.noseM);
      assert(Math.abs(turretSide - fit.shieldHalfWidthM) < 1e-4,
        `${audit.id}: turret-side cover half-width is ${fit.shieldHalfWidthM} m (${turretSide})`);
      assert(Math.abs(nose - 0.215) < 1e-4, `${audit.id}: cover nose half-width is 0.215 m (${nose})`);
      assert(turretSide < fit.channelHalfWidthM && nose < turretSide,
        `${audit.id}: cover narrows from turret to barrel inside the channel`);
    };
    fittedCover();
    // Seeded defect: a cover 10% wider than fitted must fail.
    gunMount.geometry.scale(1.1, 1, 1);
    assert.throws(fittedCover, assert.AssertionError, `${audit.id}: an over-wide cover is rejected`);
    tank.dispose();
    continue;
  }
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
// The VT4A1 and ZTZ-99A2 carriers now stop at the capped walls of the 0.80 m
// gun channel (main 245aa4e4e), so their first inboard stations (x 0.22) are
// gone by design. Their corners are the next station (upper x 0.62, lower
// x 0.78), and both carriers must reach the channel walls.
for (const audit of [
  {
    id: 'vt4a1', receipt: 'vtFamilyTurretReceipt',
    permanentPoints: [[-0.62, 0.73475, 0.14], [0.78, 0.1028, 0.68]], channel: { halfWidth: 0.40, minZ: 0.62 },
  },
  {
    id: 'type99a', receipt: 'vtFamilyTurretReceipt',
    permanentPoints: [[-0.2112, 0.6724, 0.6124], [0.2112, 0.0328, 0.9132]],
  },
  {
    id: 'ztz99a2', receipt: 'ztz99a2ProductionReceipt',
    permanentPoints: [[-0.62, 0.81, 0.18], [0.78, -0.02, 0.70]], channel: { halfWidth: 0.40, minZ: 0.62 },
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
  if (audit.channel) {
    assert.equal(channelWallVertices(turret, audit.channel.halfWidth, audit.channel.minZ), 2,
      `${audit.id}: both permanent carriers close against the gun-channel walls`);
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
