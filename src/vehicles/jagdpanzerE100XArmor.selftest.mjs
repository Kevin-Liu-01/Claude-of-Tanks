import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { donorSpec } from './donorSpecs.ts'; // 2026-09-24: retired donor records resolve through the unregistered templates (owner: no hidden tanks)
import { SECOND_WAVE_X_DONORS, synchronizeSecondWaveXCombatMetadata } from './sourceXSecondWaveSpecs.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';

// Round 32 (2026-09-21): goldens re-based — each side's end wraps now pivot about its own outer road wheels on staggered rigs (t90ms_x, tos1a_tagil, cv90105_tml_x, cv90_mkiv_x, ztz100_x) and the Jagdpanzer E100 X reuses the dished wheel primitive.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const donorRows = () => [...new Set(Object.values(SECOND_WAVE_X_DONORS))].sort()
  .map(id => [id, donorSpec(TANK_SPECS, id)]); // 2026-09-24: retired donors come back verbatim from donorSpecs.ts
// Captured before this metadata correction. No source meshes or generated
// armor vertices are embedded in the regression.
// Repinned 2026-09-15: the owner roster pass renamed donor display names (AMX-30B -> AMX-30,
// AMX-40 -> AMX-40 Prototype, C1 Ariete -> Serie 1, Challenger 1 Mk 3 -> Mk 2 ...); no armor row moved.
// 2026-09-24 (round 46c, owner: no hidden tanks): the jpz_e100 / t72b3 / t72b_1987 donor records retired; their rows now
// come from the donorSpecs.ts templates, which carry the authored spec without the registry's generated anatomy enrichment
// (bodyContactPoints, collisionShells, crew layout metadata) — the hash moves for that reason alone. All 192 playable specs
// are byte-identical between shared main and this tree (.qa-dev spec dump, 0 differing).
// 2026-09-25 FSP-03: donor-spec digest re-pinned once — the regenerated combat anatomy of the roller hulls moved the
// registry's generated enrichment (contact points / shells) on the T-72/T-90 donor rows; the authored specs are unchanged.
const donorHash = 'f1d2943a695eee71ce1237c8ff808404b3c4c3752ea6dfeaff2976eed7b995f7';
function historicalDonors(rows = donorRows()) {
  const restored = structuredClone(rows);
  const ariete = restored.find(([id]) => id === 'ariete_c1')[1];
  // The 2026-09-21 owner renames are the only permitted donor deltas. Authenticate
  // the complete current label before reversing it for the original digest.
  assert.equal(ariete.name, 'C1 Ariete Prototype (Serie 1)');
  assert.deepEqual(ariete.label, {
    id: 'ariete_c1', displayName: 'C1 Ariete Prototype (Serie 1)', shortName: 'C1 Prototype S1',
    searchAliases: ['C1 Ariete Prototype (Serie 1)', 'C1 Prototype S1', 'ariete_c1', 'ariete c1'],
  });
  ariete.name = 'C1 Ariete (Serie 1)';
  ariete.label = {
    id: 'ariete_c1', displayName: 'C1 Ariete (Serie 1)', shortName: 'Ariete C1 S1',
    searchAliases: ['C1 Ariete (Serie 1)', 'Ariete C1 S1', 'ariete_c1', 'ariete c1'],
  };
  const swedish = restored.find(([id]) => id === 'strv122')[1];
  assert.equal(swedish.name, 'Stridsvagn 121');
  assert.deepEqual(swedish.label, {
    id: 'strv122', displayName: 'Stridsvagn 121', shortName: 'Strv 121',
    searchAliases: ['Stridsvagn 121', 'Strv 121', 'strv122', 'Swedish Leopard 2', 'Strv 122A', 'Stridsvagn 122A'],
  });
  swedish.name = 'Stridsvagn 122A';
  swedish.label = {
    id: 'strv122', displayName: 'Stridsvagn 122A', shortName: 'Strv 122A',
    searchAliases: ['Stridsvagn 122A', 'Strv 122A', 'Strv 122', 'strv122', 'Swedish Leopard 2'],
  };
  return restored;
}
const hullHash = '60571a41bc152a5aae624f029db842df453b49d8b826dc153db541aa0834f833';
const hullCellsHash = 'e546ccd22261d60cd24fd5eae85fc268d12a432437f0becce61bc67219cf3ce7';
const moduleCrewHash = 'd5651996036b6549b60468dc22d78670b0a4780980458fa09bd26cfe60d7a55f';
// 2026-09-22 (owner: "the point of adding holes instead of carving them into the barrel is that we
// save on triangles"): the fleet fallback mouth became a flat ring + disc (terminal-surface-fit-r3),
// which moves both fingerprints; the armor and module geometry they guard is otherwise unchanged.
// Superseded: jpz_e100_x da7ace42/ff39b2bd, jpz_e100 85585980/a39385a7.
// 2026-09-22 (evening, same owner rule): the X tube is closed at its source tip — the 170 mm bore
// (radius .085 down to the blind floor at 5.705, 1.3419 m) that sat entirely behind the fallback
// disc is gone, moving the jpz_e100_x fingerprint again. Superseded: jpz_e100_x a7efaea0/91c58501.
// 2026-09-22 LOW road-wheel tier (roadWheelGeometry.ts WheelDetail): the dished period wheel draws no bolt ring at LOW,
// so both LOW geometry digests moved; the HIGH digests are byte-identical to the closed-tube values. Repinned from the
// combined round-40 build (closed tube + LOW wheel tier together).
const geometryHashes = {
  jpz_e100_x: { high: '7d7517c4', low: '70519134' },
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

assert.equal(hash(historicalDonors()), donorHash,
  'all 22 original donor specs unchanged apart from the authenticated C1/Strv display renames');
const wrongLabel = structuredClone(donorRows());
wrongLabel.find(([id]) => id === 'ariete_c1')[1].label.shortName = 'unapproved';
assert.throws(() => historicalDonors(wrongLabel), assert.AssertionError);
const wrongArmor = structuredClone(donorRows());
wrongArmor.find(([id]) => id === 'ariete_c1')[1].armor.hullPlates[0].physicalMm += 1;
assert.notEqual(hash(historicalDonors(wrongArmor)), donorHash,
  'the display-only reversal cannot conceal a donor armor mutation');
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
  try {
    assert.equal(geometryFingerprint(tank.root), geometryHashes.jpz_e100_x[quality], 'actual X model geometry unchanged');
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
  } finally { tank.dispose(); }
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
