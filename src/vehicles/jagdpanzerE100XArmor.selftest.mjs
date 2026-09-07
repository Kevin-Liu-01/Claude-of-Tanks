import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { SECOND_WAVE_X_DONORS, synchronizeSecondWaveXCombatMetadata } from './sourceXSecondWaveSpecs.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const donorRows = () => [...new Set(Object.values(SECOND_WAVE_X_DONORS))].sort()
  .map(id => [id, TANK_SPECS[id]]);
// Captured before this metadata correction. No source meshes or generated
// armor vertices are embedded in the regression.
const donorHash = '5a4f40320368135501f960241752d4f77122a3f6ae0251d90ec5bdb2c26e8b6e';
const hullHash = '60571a41bc152a5aae624f029db842df453b49d8b826dc153db541aa0834f833';
const hullCellsHash = 'e546ccd22261d60cd24fd5eae85fc268d12a432437f0becce61bc67219cf3ce7';
const moduleCrewHash = 'f59555c2d9c5e31a1a17417807ff155df63dbd089589b2bce30b6b6088c0aec5';
const geometryHashes = {
  jpz_e100_x: { high: 'f0a66567', low: 'a15c8662' },
  jpz_e100: { high: '6f2fb18f', low: '440e17b8' },
};
const pose = (turretYaw = 0, gunPitch = 0) => tankPoseFromState({
  pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw, gunPitch,
});
const trace = (armor, from, to, p = pose()) => traceTank(
  new THREE.Vector3(...from), new THREE.Vector3(...to), p, armor,
);
const capFaces = armor => armor.hullPlates.filter(plate => plate.name === 'mantlet');
const close = (actual, expected, tolerance, label) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${label}: ${actual} versus ${expected}`,
);

function checkArmor(armor) {
  assert.equal(armor.turretPlates.length, 0, 'no second floating casemate or inherited gun-follow rectangle');
  assert.equal(hash(armor.hullPlates.filter(plate => plate.name !== 'mantlet')), hullHash,
    'all original calibrated hull plates remain byte-identical');
  assert.equal(hash(armor.collisionShells.hull), hullCellsHash, 'all eleven actual hull collision cells remain identical');
  assert.equal(armor.collisionShells.hull.length, 11);
  assert.equal(armor.collisionShells.turret.length, 0, 'fixed casemate must not gain a rotating collision shell');
  assert.equal(hash([armor.modules, armor.crew]), moduleCrewHash, 'all module and crew shapes remain identical');
  assert.deepEqual(armor.gunBarrel, { lengthM: 6.846872139999999, radiusM: .11 });
  assert.equal(capFaces(armor).length, 1, 'one complete native cap, not a stack of coincident triangles');
  for (const plate of capFaces(armor)) {
    assert.equal(plate.convexPolygon, true);
    assert.equal(plate.verts.length, 48, 'complete native cap outline, not an oversized rectangular proxy');
    assert.equal(plate.kind, 'spaced');
    assert.equal(plate.gunFollow, true, 'hull array does not change actual gun-frame ownership');
    assert.deepEqual([plate.physicalMm, plate.keMm, plate.ceMm], [420, 420, 420],
      'retain donor mantlet protection balance');
  }
  for (const y of [4.5, 5.5, 6.3]) for (const turretYaw of [-.1, 0, .1]) {
    assert.equal(trace(armor, [-10, y, 0], [10, y, 0], pose(turretYaw)).length, 0,
      `old floating side plate at ${y}m must be actual empty gameplay air`);
  }
  assert.equal(trace(armor, [0, 7, .25308058286427826], [0, 3.8, .25308058286427826]).length, 0,
    'the old 6.408950120356564m donor roof must be unhittable');
  assert.equal(trace(armor, [0, 5, 5], [0, 5, 2]).length, 0, 'old floating gun-follow mantlet is also removed');
  const side = trace(armor, [-5, 2.7, -2.5], [5, 2.7, -2.5]).find(hit => hit.kind === 'plate');
  assert.equal(side?.plate.name, 'hull_side_upper_L', 'actual fixed casemate still receives armor hits');
  close(side.point.x, -1.3038625728372928, 1e-9, 'unchanged calibrated casemate side');
  for (const yaw of [-.1, .1]) {
    const turned = trace(armor, [-5, 2.7, -2.5], [5, 2.7, -2.5], pose(yaw)).find(hit => hit.kind === 'plate');
    assert.deepEqual(turned.point.toArray(), side.point.toArray(), 'gun traverse cannot rotate fixed casemate armor');
  }
  assert.ok(trace(armor, [-1, 2.33805, 5], [1, 2.33805, 5])
    .some(hit => hit.kind === 'module' && hit.module === 'gun'), 'unchanged physical barrel remains hittable');
}

assert.equal(hash(donorRows()), donorHash, 'all 22 original donor specs unchanged');
checkArmor(TANK_SPECS.jpz_e100_x.armor);
const armor = TANK_SPECS.jpz_e100_x.armor;

// Counterfactual: resurrecting the historical roof must reproduce the miss
// assertion's failure; the negative test is not hidden by bounding clipping.
const mutant = structuredClone(armor);
mutant.turretPlates.push({ ...capFaces(armor)[0], convexPolygon: false, gunFollow: false, kind: 'main',
  verts: [[-1, 4.070900120356564, -1], [-1, 4.070900120356564, 1],
    [1, 4.070900120356564, 1], [1, 4.070900120356564, -1]],
});
assert.ok(trace(mutant, [0, 7, 0], [0, 3.8, 0]).some(hit => hit.kind === 'plate'),
  'counterfactual old-height roof remains detectable by the real trace path');

for (const quality of ['high', 'low']) {
  const options = { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 };
  const tank = createTank('jpz_e100_x', null, options);
  const donor = createTank('jpz_e100', null, options);
  try {
    assert.equal(geometryFingerprint(tank.root), geometryHashes.jpz_e100_x[quality], 'actual X model geometry unchanged');
    assert.equal(geometryFingerprint(donor.root), geometryHashes.jpz_e100[quality], 'old JPz model geometry unchanged');
    const mount = tank.root.getObjectByName('gunMount');
    const yaw = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    const position = mount.geometry.getAttribute('position');
    const index = mount.geometry.index;
    const capTriangles = [];
    const vertex = slot => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(slot) : slot);
    for (let start = 0; start < (index?.count ?? position.count); start += 3) {
      const points = [vertex(start), vertex(start + 1), vertex(start + 2)];
      if (points.every(point => Math.abs(point.z - 1.35465) < 2e-6)) {
        const triangle = new THREE.Triangle(...points);
        if (triangle.getArea() > 1e-10) capTriangles.push(triangle);
      }
    }
    assert.equal(capTriangles.length, 48, 'actual emitted cap, not a synthetic broad bucket witness');
    for (const plate of capFaces(armor)) for (const point of plate.verts) {
      const v = new THREE.Vector3(...point);
      const distance = Math.min(...capTriangles.map(triangle =>
        triangle.closestPointToPoint(v, new THREE.Vector3()).distanceTo(v)));
      assert.ok(distance < 2e-6, 'every authored gameplay corner lies on an actual native cap triangle');
    }
    for (const [turretYaw, gunPitch] of [[0, 0], [-.1, .08], [.1, -.12]]) {
      yaw.rotation.y = turretYaw;
      gun.rotation.x = -gunPitch;
      tank.root.updateMatrixWorld(true);
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(mount.matrixWorld);
      for (const triangle of capTriangles) {
        const center = triangle.getMidpoint(new THREE.Vector3()).applyMatrix4(mount.matrixWorld);
        const from = center.clone().addScaledVector(normal, .025);
        const to = center.clone().addScaledVector(normal, -.005);
        const hits = traceTank(from, to, pose(turretYaw, gunPitch), armor).filter(hit => hit.plate?.name === 'mantlet');
        assert.equal(hits.length, 1, 'one real cap thickness at each triangle interior');
        assert.ok(hits[0].point.distanceTo(center) < 2e-6, 'gun-follow trace stays seated after yaw and pitch');
        const visible = new THREE.Raycaster(from, normal.clone().negate(), 0, .03).intersectObject(mount, false)[0];
        assert.ok(visible && visible.point.distanceTo(center) < 2e-6, 'actual moving casting backs each gameplay face');
      }
      // One continuous plate cannot charge twice along a tessellation seam.
      const center = new THREE.Vector3(0, -.00295, 1.35465).applyMatrix4(mount.matrixWorld);
      const from = center.clone().addScaledVector(normal, .025), to = center.clone().addScaledVector(normal, -.005);
      assert.equal(traceTank(from, to, pose(turretYaw, gunPitch), armor)
        .filter(hit => hit.plate?.name === 'mantlet').length, 1, 'cap center represents one 420mm layer, not 48');
      const edge = new THREE.Vector3(.24664, -.00295, 1.35465).applyMatrix4(mount.matrixWorld);
      assert.equal(traceTank(edge.clone().addScaledVector(normal, .025), edge.clone().addScaledVector(normal, -.005),
        pose(turretYaw, gunPitch), armor).filter(hit => hit.plate?.name === 'mantlet').length, 1,
      'a native outer corner also represents exactly one thickness');
      const outside = new THREE.Vector3(.25664, -.00295, 1.35465).applyMatrix4(mount.matrixWorld);
      assert.equal(traceTank(outside.clone().addScaledVector(normal, .025), outside.clone().addScaledVector(normal, -.005),
        pose(turretYaw, gunPitch), armor).filter(hit => hit.plate?.name === 'mantlet').length, 0,
      'outside the measured circular cap remains air');
    }
  } finally { tank.dispose(); donor.dispose(); }
}
// Startup synchronization calls the same scoped normalization before the
// fleet's final anatomy pass. Exercise its authored plate/frame output here;
// re-finalizing every already-calibrated donor is not this API's contract.
const capBefore = hash(capFaces(armor));
// Native createTank installs trackShapes on its own spec. That pre-existing
// runtime behavior is not a synchronization mutation; pin this exact state.
const donorsBeforeSync = hash(donorRows());
synchronizeSecondWaveXCombatMetadata();
assert.equal(hash(capFaces(TANK_SPECS.jpz_e100_x.armor)), capBefore,
  'combat synchronization reapplies the exact authored cap');
assert.equal(TANK_SPECS.jpz_e100_x.armor.turretPlates.length, 0);
assert.equal(hash(donorRows()), donorsBeforeSync, 'synchronization cannot mutate original donors');
console.log('jagdpanzerE100XArmor: no ghost armor; fixed casemate/barrel preserved; one native 48-edge 420mm moving cap; high/low geometry and all original donor specs unchanged');
