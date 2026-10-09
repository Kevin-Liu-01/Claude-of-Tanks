import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FITTINGS, KIT, MUDGUARDS } from './profiles/kit.ts';

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
assert.equal(cans.userData.requestedCanCount, 3);
assert.equal(cans.userData.canCount, 4, 'odd requests round up to a complete pair');
assert.equal(cans.userData.paired, true);
assert.equal(cans.userData.pairCount, 2);
assert.equal(cans.userData.stampedFaces, 8);
assert.equal(cans.userData.bridgeHandles, 12);
assert.equal(cans.userData.threadedSpouts, 4);
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
assert.ok(builder.supports.every((entry) => entry.slot === 'hull'),
  'shared mudguard supports use the same textured camouflage system as exterior sheet steel');
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
assert.deepEqual(builder.hullG.userData.sharedMudguards.map(({ x, y, z }) => [x, y, z]),
  [[1.5, 0.9, 1.2], [-1.5, 1.1, -0.8]],
  'mudguard receipts preserve authored placement for fleet audits');

const coreGrid = KIT.openRackGrid(1.4, 0.48, 0.018, 5, 9);
assert.equal(coreGrid.userData.designFamily, 'cot-open-rack-grid-v1');
assert.equal(coreGrid.userData.openLattice, true);
assert.equal(coreGrid.userData.solidProxyPanels, 0);
assert.deepEqual(coreGrid.userData.rackEnvelope,
  { widthM: 1.4, depthM: 0.48, thicknessM: 0.018 });

const equipmentRows = [];
const primitiveBuilder = {
  q: true,
  add() {
    assert.fail('shared cargo primitives must use addEquipment, never structural add');
  },
  addEquipment(bucket, geometry, ...transform) {
    geometry.userData.combatHitboxRole = 'equipment';
    equipmentRows.push({ bucket, geometry, transform });
  },
};
KIT.stowage(primitiveBuilder, 'turretCloth', () => 0.75,
  [[0, 0, 0, 0.62, 0.34, 0.44]]);
KIT.jerryCan(primitiveBuilder, 'turretCloth', 0, 0, 0, 0.15);
KIT.tarpRoll(primitiveBuilder, 'turretCloth', 0, 0, 0, 0.8, 0.1, true, 12);
KIT.ammoCan(primitiveBuilder, 'turretDark', 0, 0, 0, -0.2);
assert.ok(equipmentRows.length >= 30, 'deepened cargo kit emits modeled hardware, not four marker solids');
assert.ok(equipmentRows.every((row) => row.geometry.userData.combatHitboxRole === 'equipment'));
const primitiveFamilies = new Set(equipmentRows.map((row) => row.geometry.userData.designFamily));
for (const family of [
  'cot-soft-stowage-v2', 'cot-field-jerry-can-v2',
  'cot-rolled-fabric-v2', 'cot-ammo-can-v2',
]) assert.ok(primitiveFamilies.has(family), `${family} receipt is present`);
const jerryBody = equipmentRows.find((row) =>
  row.geometry.userData.designFamily === 'cot-field-jerry-can-v2').geometry;
assert.equal(jerryBody.userData.stampedRibs, 4);
assert.equal(jerryBody.userData.bridgeHandles, 3);
assert.equal(jerryBody.userData.threadedSpout, true);
const ammoBody = equipmentRows.find((row) =>
  row.geometry.userData.designFamily === 'cot-ammo-can-v2').geometry;
assert.equal(ammoBody.userData.latches, 2);
assert.equal(ammoBody.userData.hinges, 2);
assert.equal(ammoBody.userData.carryHandle, true);

rack.traverse((object) => {
  if (object.isMesh) object.geometry.dispose();
});
for (const fitting of [cans, shieldedMg]) fitting.traverse((object) => {
  if (object.isMesh) object.geometry.dispose();
});
for (const material of Object.values(mats)) material.dispose();
for (const row of [...builder.guards, ...builder.supports]) row.geometry.dispose();
coreGrid.dispose();
for (const row of equipmentRows) row.geometry.dispose();

console.log('equipmentPrimitives.selftest: bustle, cargo, and shaped mudguard contracts passed');
