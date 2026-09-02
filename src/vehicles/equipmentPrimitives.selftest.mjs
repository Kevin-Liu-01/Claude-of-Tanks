import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FITTINGS, MUDGUARDS } from './profiles/kit.ts';

const mats = Object.fromEntries([
  'dark', 'detail', 'canvasCloth', 'wood', 'spareTrack', 'glass', 'hull',
  'barrel', 'rubber',
].map((slot) => [slot, new THREE.MeshStandardMaterial({ color: 0x777777 })]));

const rack = FITTINGS.stowageRack({
  mats,
  w: 1.6,
  d: 0.52,
  h: 0.36,
  rails: 3,
  posts: 8,
  fill: 0.8,
  seed: 17,
});
assert.equal(rack.userData.designFamily, 'cot-open-lattice-bustle-v2');
assert.equal(rack.userData.openLattice, true);
assert.equal(rack.userData.solidProxyPanels, 0);
assert.ok(rack.userData.floorCrossMembers >= 3);
assert.ok(rack.userData.floorStringers >= 3);
assert.equal(rack.userData.mountingFeet, 2);
assert.ok(rack.userData.softBundleCount >= 2);
assert.deepEqual(rack.userData.fabricProfiles, ['rolled-tarp', 'duffel', 'ruck-with-flap']);
assert.deepEqual(rack.userData.rackEnvelope, { widthM: 1.6, depthM: 0.52, heightM: 0.36 });
let rackMeshes = 0;
rack.traverse((object) => {
  if (!object.isMesh) return;
  rackMeshes++;
  assert.equal(object.userData.combatHitboxRole, 'equipment');
});
assert.ok(rackMeshes >= 2, 'open rack keeps separate material families after merge');

const cans = FITTINGS.jerryCans({ mats, count: 3, seed: 11 });
assert.equal(cans.userData.designFamily, 'cot-jerry-can-rack-v2');
assert.equal(cans.userData.canCount, 3);
assert.equal(cans.userData.stampedFaces, 6);
assert.equal(cans.userData.bridgeHandles, 9);
assert.equal(cans.userData.threadedSpouts, 3);
assert.equal(cans.userData.retainingCradle, true);

const shieldedMg = FITTINGS.americanM2({ mats, shield: 'armored', seed: 19 });
assert.equal(shieldedMg.userData.shieldVariant, 'armored');
assert.equal(shieldedMg.userData.foldedShieldEdges, 3);
assert.equal(shieldedMg.userData.shieldVisionPorts, 2);
assert.equal(shieldedMg.userData.hasConnectedFeed, true);

const makeBuilder = () => {
  const hullG = new THREE.Group();
  const guards = [];
  const supports = [];
  return {
    hullG,
    guards,
    supports,
    add(slot, geometry, ...transform) { supports.push({ slot, geometry, transform }); },
    addMudguard(label, slot, geometry, ...transform) {
      guards.push({ label, slot, geometry, transform });
    },
  };
};

const builder = makeBuilder();
MUDGUARDS.add(builder, {
  label: 'test-rubber-guard',
  x: 1.5,
  y: 0.9,
  z: 1.2,
  thickness: 0.038,
  length: 1.4,
  height: 0.48,
  material: 'rubber',
  crown: 0.035,
  frontCut: 0.11,
  rearCut: 0.06,
  rake: 0.04,
});
MUDGUARDS.add(builder, {
  label: 'test-painted-guard',
  x: -1.5,
  y: 1.1,
  z: -0.8,
  thickness: 0.055,
  length: 1.1,
  height: 0.36,
  material: 'painted-steel',
  profile: [[-0.5, 0.5], [0, 0.58], [0.5, 0.42], [0.44, -0.5], [-0.5, -0.38]],
});

assert.equal(builder.guards.length, 2);
assert.equal(builder.guards[0].slot, 'hullRubber');
assert.equal(builder.guards[1].slot, 'hull');
assert.equal(builder.supports.length, 2);
assert.ok(builder.supports.every((entry) => entry.slot === 'hullDetail'),
  'shared mudguard supports always use painted fitting material');
for (const guard of builder.guards) {
  guard.geometry.computeBoundingBox();
  const size = guard.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x > 0.01 && size.y > 0.2 && size.z > 0.8,
    `${guard.label}: closed shaped guard owns a three-dimensional envelope`);
  assert.equal(guard.geometry.userData.designFamily, 'cot-shaped-mudguard-v1');
  assert.equal(guard.geometry.userData.closedProfile, true);
}
assert.equal(builder.hullG.userData.sharedMudguards.length, 2);
assert.ok(builder.hullG.userData.sharedMudguards.every((receipt) => receipt.attachedSupport));

rack.traverse((object) => {
  if (object.isMesh) object.geometry.dispose();
});
for (const fitting of [cans, shieldedMg]) fitting.traverse((object) => {
  if (object.isMesh) object.geometry.dispose();
});
for (const material of Object.values(mats)) material.dispose();
for (const row of [...builder.guards, ...builder.supports]) row.geometry.dispose();

console.log('equipmentPrimitives.selftest: open bustle lattice and shaped mudguard contracts passed');
