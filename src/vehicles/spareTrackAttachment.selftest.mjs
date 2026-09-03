import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { FITTINGS } from './profiles/kit.ts';
import { KIT } from './tankFactoryCore.ts';

const BASE_OFFSET_M = 0.041;
const MAX_SEAT_GAP_M = 0.015;
const CARRIER_FAMILY = 'cot-spare-track-carrier-v2';

const fittingMaterials = {
  hull: new THREE.MeshBasicMaterial(), detail: new THREE.MeshBasicMaterial(),
  dark: new THREE.MeshBasicMaterial(), spareTrack: new THREE.MeshBasicMaterial(),
};
const fitting = FITTINGS.spareTrackLinks({
  mats: fittingMaterials,
  links: 4,
  width: 0.5,
  pitch: 0.165,
  seed: 1,
});
assert.equal(fitting.userData.designFamily, CARRIER_FAMILY,
  'semantic spare-link fitting publishes the continuous-carrier design family');
assert.equal(fitting.userData.mountAxisLocal.join(','), '0,1,0',
  'semantic spare-link fitting publishes its armor-facing mount axis');
assert.equal(fitting.userData.mountBaseOffsetM, BASE_OFFSET_M,
  'semantic spare-link fitting publishes the carrier base offset');
assert.equal(fitting.userData.hasContinuousCarrier, true,
  'semantic spare-link fitting cannot be a loose stair-step stack');
assert.equal(fitting.userData.carrierRailCount, 2,
  'semantic spare-link fitting has two continuous carrier rails');
assert.equal(fitting.userData.carrierFootCount, 4,
  'semantic spare-link fitting has four welded armor feet');
fitting.traverse((object) => object.geometry?.dispose());
for (const material of Object.values(fittingMaterials)) material.dispose();

// Legacy profile builders merge their strips into material buckets. Exercise
// the shared primitive before merge so a later cleanup cannot silently remove
// the rails/feet and return the old floating-link silhouette.
const legacyParts = [];
KIT.spareTrackStrip({
  add() {},
  addEquipment(bucket, geometry, ...transform) {
    legacyParts.push({ bucket, geometry, transform });
  },
}, 'hull', 0, 1, 2, 3, 0.3, 0);
assert.equal(legacyParts.length, 12,
  'three-link legacy strip contains six link parts plus two rails and four feet');
assert.equal(legacyParts.filter(({ bucket }) => bucket === 'hullDetail').length, 6,
  'legacy strip publishes six carrier/support parts in the detail finish');
assert.equal(legacyParts.filter(({ bucket }) => bucket === 'hullTrack').length, 6,
  'legacy strip retains six worn-track link parts');
for (const part of legacyParts) part.geometry.dispose();

const HIGH_RISK_OWNERS = [
  'tiger1',
  'chieftain_mk10',
  'leo2a4',
  'leo2a4_otco',
  'amx30',
  'upior',
  'fv510',
  'fv510_milan',
  'pl01_105',
  'm3a3_bradley',
  'mbt70',
];

const mountAxis = new THREE.Vector3();
const origin = new THREE.Vector3();
const base = new THREE.Vector3();
const start = new THREE.Vector3();
const inward = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();
let checkedSeats = 0;

function supportGap(root, fittingRoot) {
  const fittingMeshes = new Set();
  fittingRoot.traverse((object) => {
    if (object.isMesh) fittingMeshes.add(object);
  });
  const hostMeshes = [];
  root.traverse((object) => {
    if (!object.isMesh || fittingMeshes.has(object) || object.userData.runningGear
        || object.userData.vehicleMarking || /ghillie|decal/i.test(object.name)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.side = THREE.DoubleSide;
    hostMeshes.push(object);
  });

  fittingRoot.getWorldPosition(origin);
  fittingRoot.getWorldQuaternion(quaternion);
  mountAxis.set(0, 1, 0).applyQuaternion(quaternion).normalize();
  base.set(0, -BASE_OFFSET_M, 0).applyMatrix4(fittingRoot.matrixWorld);
  start.copy(origin).addScaledVector(mountAxis, 0.5);
  raycaster.set(start, inward.copy(mountAxis).negate());
  raycaster.near = 0;
  raycaster.far = 1.2;
  const hit = raycaster.intersectObjects(hostMeshes, false)[0];
  return {
    hit,
    gapM: hit ? hit.distance - start.distanceTo(base) : Infinity,
  };
}

for (const id of HIGH_RISK_OWNERS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    geometryReceipt: true,
    materialMode: 'geometry-only',
  });
  try {
    visual.root.updateMatrixWorld(true);
    const fittings = [];
    visual.root.traverse((object) => {
      if (object.userData.designFamily === CARRIER_FAMILY) fittings.push(object);
    });
    assert.ok(fittings.length > 0, `${id}: audited spare-track fitting exists`);
    for (const trackFitting of fittings) {
      assert.equal(trackFitting.userData.hasContinuousCarrier, true,
        `${id}/${trackFitting.name}: fitting retains a continuous carrier`);
      const seat = supportGap(visual.root, trackFitting);
      assert.ok(seat.hit,
        `${id}/${trackFitting.name}: carrier has a tank surface behind it`);
      assert.ok(seat.gapM <= MAX_SEAT_GAP_M,
        `${id}/${trackFitting.name}: carrier floats ${seat.gapM.toFixed(4)} m from its support`);
      checkedSeats += 1;
    }
  } finally {
    visual.dispose();
  }
}

assert.equal(checkedSeats, 14,
  'all fourteen formerly high-risk semantic spare-track seats are audited');

console.log(`spareTrackAttachment.selftest: ${checkedSeats} high-risk seats plus both carrier systems passed`);
