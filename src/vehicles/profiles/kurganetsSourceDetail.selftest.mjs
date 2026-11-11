import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { VEHICLE_SIZE_FACTORS } from '../vehicleSizePolicy.ts';

await ensureInteriorFills(['kurganets25']);
// Owner-directed whole-vehicle size (2026-10-02, main 245aa4e4e): the factory bakes the source-frame build into the
// installed hull frame at this factor. Rays map source-frame probes in and their hits back out, so every caliper
// below stays a source-frame number (its tolerance then binds the installed stock `f` times tighter).
const f = VEHICLE_SIZE_FACTORS.kurganets25 ?? 1;
for (const quality of ['high', 'low']) {
  const tank = createTank('kurganets25', null,
    { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    const meshes = [];
    tank.root.traverseVisible(mesh => { if (mesh.isMesh) meshes.push(mesh); });
    const scale = hull.getWorldScale(new THREE.Vector3()).x;
    const ray = (position, direction, far) => new THREE.Raycaster(
      hull.localToWorld(new THREE.Vector3(...position).multiplyScalar(f)),
      new THREE.Vector3(...direction).transformDirection(hull.matrixWorld), 0, far * scale * f,
    ).intersectObjects(meshes, false).map(hit => ({
      name: hit.object.name, point: hull.worldToLocal(hit.point.clone()).divideScalar(f),
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
    // Re-pinned 2026-11-09 (272, restoring this receipt after the 2026-10-07 merge emptied it) with the rebuilds' own
    // reasons in src/vehicles/profiles/kurganetsX.ts: the deck blocks under the fans are gone (owner markup 2026-10-14);
    // each rod drops onto the uneven deck (owner float sweep 2026-10-19, snap reach 0.15 m); each cluster stands 0.15 m
    // outboard with its pattern kept (f76d19a0bc, release 240: clear of the turret floor's sweep). So the source centres
    // keep their z, their axes and the 0.4043 m length, x moves 0.15 m outboard, and y is the seated height measured on
    // the HIGH build (the rod's top less its 0.062 m radius); the rear no longer stands on a receiver at y 2.39.
    const fans = [
      [[-1.15758 - .15, 2.25229, -.02386], [-.64605, 0, .76330]],
      [[-1.35007 - .15, 2.26506, -.36095], [-.98559, 0, .16914]],
      [[-1.15448 - .15, 2.28911, -.90125], [-.63911, 0, -.76911]],
      [[1.16720 + .15, 2.25229, -.02393], [.64621, 0, .76316]],
      [[1.35966 + .15, 2.26506, -.36095], [.98560, 0, .16907]],
      [[1.16411 + .15, 2.28912, -.90137], [.63885, 0, -.76933]],
    ];
    for (const [center, direction] of fans) {
      const axis = new THREE.Vector3(...direction).normalize();
      const start = new THREE.Vector3(...center).addScaledVector(axis, .35);
      const expected = new THREE.Vector3(...center).addScaledVector(axis, .20215);
      const hit = ray(start.toArray(), axis.clone().negate().toArray(), .25)[0];
      assert.equal(hit?.name, 'hullDetail', 'the horizontal fan must expose its terminal stock');
      assert.ok(hit.point.distanceTo(expected) < .001, 'tube end must use the measured horizontal axis and length');
      // Each rod rests on the hull deck: somewhere under its footprint the deck is within 3 mm of the rod's underside
      // (measured 0.5 to 2.2 mm on 41 x 5 samples, HIGH and LOW).
      const across = new THREE.Vector3(-axis.z, 0, axis.x);
      let gap = Infinity;
      for (let i = 0; i <= 40; i++) for (const lateral of [-.05, -.025, 0, .025, .05]) {
        const point = new THREE.Vector3(...center).addScaledVector(axis, -.20215 + i * .4043 / 40).addScaledVector(across, lateral);
        const underside = center[1] - Math.sqrt(.062 * .062 - lateral * lateral);
        const below = ray([point.x, underside - .0005, point.z], [0, -1, 0], .3)[0];
        if (below?.name === 'hull') gap = Math.min(gap, underside - below.point.y);
      }
      assert.ok(gap < .003, `each tube rests on the hull deck (smallest gap ${(gap * 1000).toFixed(2)} mm, ${quality}, x ${center[0]})`);
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
