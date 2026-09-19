import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';

// AW's supplied manned-turret configuration is explicitly 50 mm, not the 35 mm
// real-world option. The measured outer brake and firing plane are unchanged.
const id = 'cv90_mkiv_x', mouth = 2.80621, boreRadius = .025, depth = .065;
const front = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
const ray = new THREE.Raycaster();
function near(actual, expected, epsilon, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    `${label}: ${actual} versus ${expected}`);
}
function cast(root, frame, origin, direction, far = 2) {
  ray.set(frame.localToWorld(new THREE.Vector3(...origin)),
    new THREE.Vector3(...direction).transformDirection(frame.matrixWorld));
  ray.near = 0; ray.far = far;
  return ray.intersectObject(root, true).find(hit => {
    for (let node = hit.object; node; node = node.parent) {
      if (!node.visible || node.userData.shadowOnly) return false;
    }
    return true;
  });
}
function checkBore(root, frame) {
  for (let i = 0; i < 12; i++) {
    const a = (i + .173) * Math.PI / 6, x = Math.cos(a), y = Math.sin(a);
    // 22.5 mm radial points hit the old 35 mm rim, so this specifically
    // checks newly required physical air rather than only the center shadow.
    const hit = cast(root, frame, [x * .0225, y * .0225, mouth + .01], [0, 0, -1]);
    assert.ok(hit, 'physical recessed backstop remains');
    near(frame.worldToLocal(hit.point.clone()).z, mouth - depth, .001, 'open 50 mm aperture');
    const rim = cast(root, frame, [x * .038, y * .038, mouth + .01], [0, 0, -1]);
    assert.ok(rim, 'real annular outer stock remains');
    near(frame.worldToLocal(rim.point.clone()).z, mouth, .001, 'source mouth plane');
    for (const f of [.2, .5, .8]) {
      const wall = cast(root, frame, [0, 0, mouth - depth * f], [x, y, 0], .07);
      assert.ok(wall, 'inward-facing physical throat wall');
      const p = frame.worldToLocal(wall.point.clone());
      near(Math.hypot(p.x, p.y), boreRadius, .0007, '50 mm throat including LOW polygon chord');
    }
  }
  // The source's flared brake has actual lateral openings ahead of the tube.
  assert.equal(cast(root, frame, [.20, 0, 2.64], [-1, 0, 0], .40), undefined,
    'the measured vent chamber stays open across its full width');
}
function selectedTriangles(root) {
  let count = 0;
  root.traverseVisible(o => {
    if (!o.isMesh || o.userData.shadowOnly) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(m => m.colorWrite === false || m.visible === false)) return;
    count += Math.min(o.geometry.index?.count ?? o.geometry.attributes.position.count,
      o.geometry.drawRange.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  return count;
}
await ensureInteriorFills([id]); assert.ok(hasInteriorFills(id));
const results = [], spec = getSpec(id);
assert.equal(spec.gun.caliberMm, 50, 'publisher-specific 50 mm configuration');
for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality, camoSeed: 4242,
    geometryReceipt: true, batchStatic: false });
  const originals = new Map();
  try {
    tank.root.traverse(o => {
      if (o.isLOD) { o.autoUpdate = false; o.levels.forEach((level, i) => level.object.visible = i === 0); }
      if (o.isMesh && !o.userData.shadowOnly) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        if (materials.some(m => m.colorWrite === false || m.visible === false)) o.visible = false;
      }
    });
    const triangles = selectedTriangles(tank.root);
    tank.root.traverse(o => { if (o.isMesh) { originals.set(o, o.material); o.material = front; } });
    const recoil = tank.root.getObjectByName('rig_recoil'), state = createTankState(spec, new THREE.Vector3(), 0);
    assert.ok(recoil); let poses = 0;
    for (const pitch of [-spec.gunDepressionDeg, 0, spec.gunElevationDeg]) {
      state.gunPitch = pitch * Math.PI / 180; state.turretYaw = .63;
      tank.syncFromState(state, 1); tank.root.updateMatrixWorld(true); checkBore(tank.root, recoil); poses++;
      tank.recoilKick(0, 1); tank.syncFromState(state, .12); tank.root.updateMatrixWorld(true);
      checkBore(tank.root, recoil); poses++;
    }
    for (const geometry of [new THREE.CircleGeometry(.025, 28), new THREE.RingGeometry(.0175, .025, 28)]) {
      const wrong = new THREE.Mesh(geometry, front); wrong.position.z = mouth; recoil.add(wrong);
      tank.root.updateMatrixWorld(true);
      try { assert.throws(() => checkBore(tank.root, recoil), assert.AssertionError,
        'painted cap or obsolete 35 mm aperture must fail actual full-scene rays'); }
      finally { recoil.remove(wrong); geometry.dispose(); }
    }
    const physical = tank.root.userData.physicalMuzzleBoreVerification;
    near(physical.measuredOuterRadiusM, .0505, .00001, 'source outer radius preserved');
    near(physical.measuredProjectionM, .0996, .00001, 'source projecting tab preserved');
    assert.ok(triangles < 80000); results.push({ quality, filled: true, poses, triangles, physical });
  } finally { for (const [mesh, material] of originals) mesh.material = material; tank.dispose(); }
}
front.dispose();
assert.ok(results[1].triangles <= results[0].triangles * .75);
console.log('CV90 Mk IV 50 mm actual filled bore, stock, vent air, legal pitches/recoil and negative controls PASS', JSON.stringify(results));
