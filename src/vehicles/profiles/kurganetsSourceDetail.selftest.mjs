import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['kurganets25_x']);
for (const quality of ['high', 'low']) {
  const tank = createTank('kurganets25_x', null,
    { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    const meshes = [];
    tank.root.traverseVisible(mesh => { if (mesh.isMesh) meshes.push(mesh); });
    const scale = hull.getWorldScale(new THREE.Vector3()).x;
    const ray = (position, direction, far) => new THREE.Raycaster(
      hull.localToWorld(new THREE.Vector3(...position)),
      new THREE.Vector3(...direction).transformDirection(hull.matrixWorld), 0, far * scale,
    ).intersectObjects(meshes, false).map(hit => ({
      name: hit.object.name, point: hull.worldToLocal(hit.point.clone()),
    }));
    // Source Object_23 full-scene witnesses distinguish outboard folded banks
    // from the old false center grille and the mudguard-derived stern plane.
    for (const x of [-1.10, 1.10]) for (const y of [1.57, 1.65, 1.70, 1.83, 1.93, 2.08]) {
      const hit = ray([x, y, -4], [0, 0, 1], .5)[0];
      assert.equal(hit?.name, 'hullDetail', 'the actual folded blade must remain exposed');
      assert.ok(hit.point.z < -3.57 && hit.point.z > -3.65,
        'both banks must project from the measured rear receiver');
    }
    const gap = ray([1.1, 1.775, -4], [0, 0, 1], .5)[0];
    assert.equal(gap?.name, 'hullDark', 'the space between the two vent banks must remain recessed');
    assert.ok(Math.abs(gap.point.z + 3.5625) < .001);
    const center = ray([0, 1.34, -4], [0, 0, 1], .6)[0];
    assert.ok(center && Math.abs(center.point.z + 3.582185) < .001,
      'the approved assembled rear skin must not carry the fabricated projecting grille');
    const receiver = ray([0, 2.2, -4], [0, 0, 1], .6)[0];
    assert.ok(receiver && Math.abs(receiver.point.z + 3.5586) < .001,
      'the hull receiver must not extend to the rear mudguard station');

    // Independent front/outer/rear source tube calipers on both sides. Rays
    // hit the CLOSED terminal caps in the complete native scene, not a proxy.
    const fans = [
      [[-1.15758, 2.38651, -.02386], [-.64605, 0, .76330]],
      [[-1.35007, 2.38651, -.36095], [-.98559, 0, .16914]],
      [[-1.15448, 2.38651, -.90125], [-.63911, 0, -.76911]],
      [[1.16720, 2.37517, -.02393], [.64621, 0, .76316]],
      [[1.35966, 2.37517, -.36095], [.98560, 0, .16907]],
      [[1.16411, 2.37517, -.90137], [.63885, 0, -.76933]],
    ];
    for (const [center, direction] of fans) {
      const axis = new THREE.Vector3(...direction).normalize();
      const start = new THREE.Vector3(...center).addScaledVector(axis, .35);
      const expected = new THREE.Vector3(...center).addScaledVector(axis, .20215);
      const hit = ray(start.toArray(), axis.clone().negate().toArray(), .25)[0];
      assert.equal(hit?.name, 'hullDetail', 'the horizontal fan must expose its terminal stock');
      assert.ok(hit.point.distanceTo(expected) < .001, 'tube end must use the measured horizontal axis and length');
      const back = new THREE.Vector3(...center).addScaledVector(axis, -.215);
      const support = ray([back.x, 2.6, back.z], [0, -1, 0], .4)[0];
      assert.ok(support && support.name === 'hullDetail' && Math.abs(support.point.y - 2.39) < .001,
        'each tube rear must overlap its actual deck receiver');
    }
    // Independent Object23 stepped-drum rays: the 29.3 mm annular groove
    // cannot pass as a flat disc, while the center and outer lip remain shut.
    for (const [r, expectedY] of [[0, 2.2815], [.10, 2.2815], [.23, 2.2522], [.25, 2.2815]]) {
      const hit = ray([1.328185 + r, 2.6, .44935], [0, -1, 0], .6)[0];
      assert.equal(hit?.name, 'hullDetail');
      assert.ok(Math.abs(hit.point.y - expectedY) < .001, 'drum needs source height, closed center and recessed annular groove');
    }
    // Sparse source lateral first hits test curvature rather than the former
    // AABB box. LOW is allowed its analytic 16-section chord approximation.
    for (const [z, leftX, rightX] of [
      [-1.10, -.661463, -.445170], [-1.00, -.758059, -.348243],
      [-.900, -.781057, -.326031], [-.800, -.754171, -.352314],
      [-.750, -.737095, -.369495],
    ]) {
      for (const [startX, direction, expectedX] of [[-1.2, 1, leftX], [0, -1, rightX]]) {
        const hit = ray([startX, 3.1, z], [direction, 0, 0], 1)[0];
        assert.equal(hit?.name, 'turretDetail');
        assert.ok(Math.abs(hit.point.x - expectedX) < .005,
          `rounded optical housing needs measured plan curvature (${quality}, ${z}, ${hit.point.x}, ${expectedX})`);
      }
    }
    for (const [z, expectedY] of [[-1.05, 3.31175], [-.8, 3.283732], [-.75, 3.261376]]) {
      const hit = ray([-.553545, 3.6, z], [0, -1, 0], .6)[0];
      assert.ok(hit && Math.abs(hit.point.y - expectedY) < .002, `optical case crown must slope toward its closed front (${quality}, ${z}, ${hit?.point.y}, ${expectedY})`);
    }
    const cover = ray([-.553545, 3.14405, -.5], [0, 0, -1], .35)[0];
    assert.ok(cover && Math.abs(cover.point.z + .71473) < .001,
      'front cover must remain actual first-hit stock ahead of source internal receivers');
    tank.root.getObjectByName('rig_turret').rotation.y = .65;
    tank.root.updateMatrixWorld(true);
    const fixed = ray([1.1, 2.08, -4], [0, 0, 1], .5)[0];
    assert.ok(fixed && fixed.point.z < -3.57, 'stern vents remain hull-owned during turret yaw');
  } finally { tank.dispose(); }
}
console.log('kurganetsSourceDetail: loaded HIGH/LOW stern receivers, outboard vents and horizontal fan stock pass');
