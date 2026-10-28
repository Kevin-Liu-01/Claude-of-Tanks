import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// 262 (owner, 2026-10-27, with his STB-1 model: "both the type 74 and stb should be based from this"): the STB-1 and the
// production Type 74 share the Type 74 family's cast turret measured on that model (profiles/type74Family.ts): one
// 18-station plan refined to 36, ten measured rings refined to 19, a 0.714 m shell (the model at its own proportions)
// with a flat crown and an undercut bustle. Each publishes its own roof kit; the shells match, the kits differ.
const CASES = {
  stb1: {
    variant: 'prototype',
    roofEquipment: { cupolas: 1, hatches: 1, machineGuns: 1, opticHeads: 2, searchlights: 1, flankBoxes: 2, roofVents: 2 },
    width: [2.62, 2.70],
    depth: [3.40, 3.56],
    height: [0.77, 0.86],
  },
  type74: {
    variant: 'production',
    roofEquipment: { cupolas: 1, hatches: 1, machineGuns: 1, opticHeads: 2, searchlights: 1 },
    width: [2.62, 2.70],
    depth: [3.40, 3.56],
    height: [0.80, 0.89],
  },
};

const receipts = new Map();

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  tank.root.updateMatrixWorld(true);

  const hull = tank.root.getObjectByName('hull');
  const turret = tank.root.getObjectByName('turret');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunMount = tank.root.getObjectByName('gunMount');
  assert.ok(hull && turret && turretRig && gunMount, `${id}: articulated armor and mantlet remain complete`);

  const receipt = turretRig.userData.japaneseCastTurretReceipt;
  assert.deepEqual(receipt, {
    family: 'type74-family-owner-model-cast',
    variant: expected.variant,
    authoredStations: 18,
    planStations: 36,
    verticalRings: 19,
    flatCrown: true,
    circularLathe: false,
    creaseAngleDeg: 50,
    shellHeightM: 0.714,
    roofEquipment: expected.roofEquipment,
  }, `${id}: publishes the Type 74 family's cast turret construction receipt`);
  receipts.set(id, receipt);

  const hullBounds = new THREE.Box3().setFromObject(hull);
  const turretBounds = new THREE.Box3().setFromObject(turret);
  const mountBounds = new THREE.Box3().setFromObject(gunMount);
  const turretSize = turretBounds.getSize(new THREE.Vector3());
  assert.ok(turretSize.x >= expected.width[0] && turretSize.x <= expected.width[1],
    `${id}: the cast belt's width stays the model's (${turretSize.x.toFixed(3)} m)`);
  assert.ok(turretSize.z >= expected.depth[0] && turretSize.z <= expected.depth[1],
    `${id}: the shell's length, nose cut for the mask to the bustle, stays the model's (${turretSize.z.toFixed(3)} m)`);
  assert.ok(turretSize.y >= expected.height[0] && turretSize.y <= expected.height[1],
    `${id}: the cast turret and its roof stay in their height class (${turretSize.y.toFixed(3)} m)`);
  // the seat (turretSeatRace.ts) stands the shell's foot a 3 cm seam over the deck round its race: no more, no buried foot
  const ringAt = turretRig.getWorldPosition(new THREE.Vector3());
  const deckRay = new THREE.Raycaster(new THREE.Vector3(ringAt.x, hullBounds.max.y + 0.5, ringAt.z), new THREE.Vector3(0, -1, 0));
  const deckY = deckRay.intersectObject(hull, false)[0]?.point.y;
  assert.ok(Number.isFinite(deckY), `${id}: the hull's deck lies under the turret ring`);
  // (float32 positions: a foot ring set on the deck reads within 0.01 mm of it, either side)
  const seam = turretBounds.min.y - deckY;
  assert.ok(seam >= -1e-5 && seam <= 0.035,
    `${id}: the turret's foot ring stands its seam over the deck instead of floating (${(seam * 1000).toFixed(1)} mm)`);
  assert.ok(mountBounds.min.z < turretBounds.max.z && mountBounds.max.z > turretBounds.max.z,
    `${id}: the mask stays seated in its channel while projecting forward of the cheeks`);

  const normal = turret.geometry.getAttribute('normal');
  assert.ok(normal?.count > 0, `${id}: cast shell retains generated surface normals`);
  const obliqueNormals = new Set();
  for (let index = 0; index < normal.count; index++) {
    const x = normal.getX(index);
    const y = normal.getY(index);
    const z = normal.getZ(index);
    if (Math.abs(x) < 0.12 || Math.abs(y) < 0.08 || Math.abs(z) < 0.08) continue;
    obliqueNormals.add(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
  }
  assert.ok(obliqueNormals.size >= 16,
    `${id}: the shell's rolled shoulders and crown survive geometry merging`);

  tank.dispose();
}

const { roofEquipment: a, variant: va, ...shellA } = receipts.get('stb1');
const { roofEquipment: b, variant: vb, ...shellB } = receipts.get('type74');
assert.deepEqual(shellA, shellB, 'the STB-1 and the Type 74 share one cast shell');
assert.notDeepEqual(a, b, 'the STB-1 and the Type 74 carry different roof kits');
assert.notEqual(va, vb, 'the STB-1 is the prototype variant and the Type 74 the production one');

console.log('japaneseCastTurrets.selftest: the STB-1 and the Type 74 share the family cast turret, each with its own roof kit');
