import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SURFACE_MARKING_STYLE, VEHICLE_MARKING_ANCHORS, vehicleMarkingAnchor,
  vehicleMarkingRecord,
} from './vehicleMarkings.js';

const nations = ['USA', 'Germany', 'USSR', 'Russia', 'UK', 'France', 'China', 'Israel', 'Italy', 'Japan', 'Poland', 'South Korea', 'Sweden', 'Ukraine'];
const records = nations.map((nation, index) => vehicleMarkingRecord({
  id: `tank_${index}`,
  nation,
  visual: { number: String(100 + index) },
}));

assert.equal(new Set(records.map((record) => record.countryCode)).size, 13, 'USSR and Russia share one country filter while other nations remain distinct');
assert.equal(new Set(records.map((record) => record.markingCode)).size, records.length, 'marking codes remain vehicle-specific');
for (const record of records) {
  assert.match(record.designation, /^[A-Z]+-[A-Z0-9 -]+$/, `${record.countryLabel}: designation`);
  assert(record.insignia, `${record.countryLabel}: insignia`);
  assert(record.filterLabel.length <= 3, `${record.countryLabel}: compact country filter label`);
}
assert.equal(SURFACE_MARKING_STYLE.surfaceLiftM, 0.006, 'paint and impact marks share the 6 mm surface layer');
assert.deepEqual(vehicleMarkingRecord({ id: 'stable', nation: 'USA', visual: {} }), vehicleMarkingRecord({ id: 'stable', nation: 'USA', visual: {} }), 'fallback tactical numbers are deterministic');

// Importing the factory registers every first-party expansion before the
// coverage check. The anchor manifest is intentionally per-ID; there is no
// class-wide width/pivot fallback that can leave paint floating beside a
// reshaped hull or turret.
const { createTank } = await import('./tankFactory.js');
const { ALL_TANK_IDS } = await import('./specs.js');
assert.deepEqual(
  Object.keys(VEHICLE_MARKING_ANCHORS).sort(),
  [...ALL_TANK_IDS].sort(),
  'every selectable first-party tank has one explicit surface anchor profile',
);

const armorNames = {
  hull: new Set(['hull', 'hullTrackGuardL', 'hullTrackGuardR']),
  turret: new Set(['turret']),
};

function markingSupportHit(mark, owner) {
  owner.updateWorldMatrix(true, true);
  const position = mark.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(mark.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const origin = position.clone().addScaledVector(normal, 0.018);
  const ray = new THREE.Raycaster(origin, normal.clone().multiplyScalar(-1), 0, 0.05);
  const candidates = [];
  owner.traverse((object) => {
    if (object.isMesh && !object.isInstancedMesh && armorNames[mark.userData.surfaceOwner].has(object.name)) {
      candidates.push(object);
    }
  });
  return ray.intersectObjects(candidates, false)[0] || null;
}

for (const id of ALL_TANK_IDS) {
  const profile = vehicleMarkingAnchor(id);
  assert(profile, `${id}: explicit anchor profile`);
  assert(['hull', 'turret'].includes(profile.owner), `${id}: valid articulation owner`);
  assert(['left', 'right'].includes(profile.side), `${id}: valid painted side`);
  assert(profile.longitudinal > 0 && profile.longitudinal < 1, `${id}: longitudinal station`);
  assert(profile.vertical > 0 && profile.vertical < 1, `${id}: vertical station`);

  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const owners = {
    hull: tank.root.getObjectByName('rig_hull'),
    turret: tank.root.getObjectByName('rig_turret'),
  };
  const marks = [];
  tank.root.traverse((object) => {
    if (object.userData?.vehicleMarking
        && (object.userData.markingKind === 'insignia'
          || object.userData.markingKind === 'designation')) marks.push(object);
  });
  assert(marks.some((mark) => mark.userData.markingKind === 'insignia'), `${id}: national insignia exists`);
  assert(marks.some((mark) => mark.userData.markingKind === 'designation'), `${id}: tactical designation exists`);
  for (const mark of marks) {
    const owner = owners[mark.userData.surfaceOwner];
    assert(owner, `${id}/${mark.name}: owner rig exists`);
    assert.equal(mark.userData.surfaceSupported, true, `${id}/${mark.name}: surface seat solved`);
    assert.equal(mark.userData.supportGapM, SURFACE_MARKING_STYLE.surfaceLiftM, `${id}/${mark.name}: shared paint lift`);
    assert(markingSupportHit(mark, owner), `${id}/${mark.name}: armor is physically present directly behind paint`);
  }

  // One yaw step proves the metadata agrees with the actual parent tree:
  // turret paint must move with the ring; hull paint must not.
  tank.root.updateMatrixWorld(true);
  const before = marks.map((mark) => mark.getWorldPosition(new THREE.Vector3()));
  owners.turret.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  marks.forEach((mark, index) => {
    const after = mark.getWorldPosition(new THREE.Vector3());
    if (mark.userData.surfaceOwner === 'hull') {
      assert(after.distanceTo(before[index]) < 1e-7, `${id}/${mark.name}: hull marking stays fixed at yaw90`);
    } else {
      assert(after.distanceTo(before[index]) > 0.02, `${id}/${mark.name}: turret marking follows yaw90`);
    }
  });
  tank.dispose();
}

console.log(`vehicleMarkings.selftest: ${ALL_TANK_IDS.length} per-tank surface anchors, physical seats, and yaw ownership pass`);
