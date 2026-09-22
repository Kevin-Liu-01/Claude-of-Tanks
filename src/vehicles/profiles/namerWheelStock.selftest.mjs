import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { sourceOpeningRayProbe } from '../../../tools/source-opening-rays.mjs';

// Independent source wheel18 first-hit calipers, canonical SHA
// 72afdec001c1013a7a847a176adf12f0d00d1863f29874797448fdb66d174870.
// Current axle/course is deliberately preserved. These physical face stations
// reject a cap-filled tire or dish even when its overall radius is correct.
const stations = [
  // 2026-09-22 wheel audit: hub cap seated at X1.513730 (was the source 1.522377, 3.1 cm proud of the tire; fleet seat 2.5 cm)
  [0, 1.513730], [.04, 1.513730], [.10, 1.454791],
  [.12, 1.376765], [.18, 1.376765], [.24, 1.376765],
  [.28, 1.376765], [.30, 1.490957], [.32, 1.490957],
];
const restZ = [-2.226, -1.491, -.464, .434, 1.359, 2.105].map(z => z * .976);
function wheelCenters(root) {
  root.updateMatrixWorld(true);
  const mesh = root.getObjectByName('gearRoadWheelTires');
  assert.equal(mesh.count, 12, 'all twelve native road-wheel stations');
  return Array.from({ length: mesh.count }, (_, i) => {
    const matrix = new T.Matrix4(); mesh.getMatrixAt(i, matrix);
    matrix.premultiply(mesh.matrixWorld);
    return new T.Vector3().setFromMatrixPosition(matrix);
  });
}
function faces(root, centers) {
  const probe = sourceOpeningRayProbe(root);
  try {
    for (const p of centers) {
      const side = Math.sign(p.x);
      for (const [r, x] of stations) {
        const hit = probe.cast([side * 3, p.y, p.z + r], [-side, 0, 0], 6);
        assert.ok(hit && Math.abs(Math.abs(hit.point.x) - x) < .001,
          `source outer face R${r}: ${hit?.point.x}`);
      }
      assert.equal(probe.cast([side * 1.47, p.y, p.z + .18], [-side, 0, 0], .075),
        undefined, 'real air in front of the recessed web');
    }
  } finally { probe.dispose(); }
}
function finiteJoins(root, center) {
  const original = new Map(), neutral = new T.MeshBasicMaterial({ side: T.DoubleSide });
  root.traverse(o => { if (o.isMesh) { original.set(o, o.material); o.material = neutral; } });
  try {
    const direction = new T.Vector3(-1, 0, 0);
    const ray = new T.Raycaster(new T.Vector3(3, center.y, center.z + .304 * .976), direction, 0, 6);
    const steel = root.getObjectByName('gearRoadWheelDetailNamerSteel1');
    const tires = [root.getObjectByName('gearRoadWheelTires'),
      root.getObjectByName('gearRoadWheelDetailNamerTire1')];
    const a = ray.intersectObject(steel).map(h => h.point.x);
    const b = ray.intersectObjects(tires).map(h => h.point.x);
    assert.ok(a.length >= 2 && b.length >= 2, 'finite steel and rubber entry/exit faces');
    assert.ok(Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) > .05,
      'the steel rim and tire have a finite receiving overlap');
  } finally {
    for (const [o, m] of original) o.material = m;
    neutral.dispose();
  }
}
function negativeControls(root, centers) {
  const p = centers.find(p => p.x > 0), side = root.getObjectByName('gearRoadWheelDetailNamerSteel1');
  side.visible = false;
  assert.throws(() => faces(root, [p]), /source outer face/, 'deleted hub/web is detected');
  side.visible = true;
  side.position.x = .03;
  assert.throws(() => faces(root, [p]), /source outer face/, 'unseated face is detected');
  side.position.x = 0;
  const cap = new T.Mesh(new T.CylinderGeometry(.25, .25, .008, 24).rotateZ(Math.PI / 2),
    new T.MeshBasicMaterial());
  cap.position.set(1.50, p.y, p.z); root.add(cap);
  assert.throws(() => faces(root, [p]), /source outer face/, 'flat covering cap is detected');
  root.remove(cap); cap.geometry.dispose(); cap.material.dispose();
  faces(root, centers);
}
await ensureInteriorFills(['namer_ifv']);
for (const quality of ['high', 'low']) {
  const tank = createTank('namer_ifv', null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
  try {
    const centers = wheelCenters(tank.root);
    for (const p of centers) {
      assert.ok(Math.abs(Math.abs(p.x) - 1.3718) < 1e-6 && Math.abs(p.y - .416944) < 1e-6,
        'retained actual loaded axle frame');
      assert.ok(restZ.some(z => Math.abs(z - p.z) < 1e-6), 'retained axle station');
    }
    faces(tank.root, centers);
    finiteJoins(tank.root, centers.find(p => p.x > 0));
    negativeControls(tank.root, centers);
    console.log(`Namer ${quality}: 108 source-face hits, 12 air guards, finite tire/rim seat and 3 physical negatives PASS`);
  } finally { tank.dispose(); }
}
