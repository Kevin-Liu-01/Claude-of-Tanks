import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { addT90AWSideMounts } from './t90AwXSideMounts.ts';

const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a} vs ${b}`);
const ray = (meshes, o, d, far = 12) => new THREE.Raycaster(new THREE.Vector3(...o),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];
const physical = root => {
  const meshes = [];
  root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking && !/shadow/i.test(m.name)) meshes.push(m); });
  return meshes;
};
function buffers(hash, geometry) {
  for (const key of Object.keys(geometry.attributes).sort()) {
    const a = geometry.attributes[key].array;
    hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const a = geometry.index?.array;
  if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
}
function build(quality, previous = false) {
  const original = KIT.buildRunningGear, hash = createHash('sha256');
  let added = 0;
  KIT.buildRunningGear = (p, cfg) => {
    const originalAdd = p.add;
    p.add = (bucket, geometry, ...transform) => {
      if (geometry.userData.t90AwSideMount) {
        assert.equal(bucket, 'hullDetail', 'permanent hull equipment, never structural or ERA');
        added++;
        if (previous) { geometry.dispose(); return; }
      } else { hash.update(bucket).update(JSON.stringify(transform)); buffers(hash, geometry); }
      originalAdd(bucket, geometry, ...transform);
    };
    return original(p, cfg);
  };
  try {
    const tank = createTank('t90_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    return { tank, added, hash: hash.digest('hex') };
  } finally { KIT.buildRunningGear = original; }
}
function unchanged(root) {
  const hash = createHash('sha256');
  for (const m of physical(root)) {
    // The one changed merged bucket is separately checked at every primitive
    // submission. No cassette, skirt, core hull, turret or gear is excluded.
    if (m.name === 'hullDetail') continue;
    hash.update(m.name).update(JSON.stringify(m.matrixWorld.elements)); buffers(hash, m.geometry);
    if (m.instanceMatrix) {
      const a = m.instanceMatrix.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  }
  return hash.digest('hex');
}

function sourceSurfaces(meshes) {
  // Complete canonical source, owner vehicle#t-90--t-90_7_2, independent
  // fixed-world rays. These are actual folded carrier / pin surfaces, not
  // the printed coarse-grid coordinates or a source-normalized candidate.
  for (const [x, z, y, normal] of [
    [1.82, 2.26, 1.215036384109, [-.275650222864, .961258006279, 0]],
    [-1.82, 2.26, 1.214491552494, [.275650222864, .961258006279, 0]],
    [1.818231518759, 1.613039807414, 1.331609275084, [.447219063386, .894424457036, 0]],
    [-1.820131476416, 1.613039807414, 1.331609275084, [-.447219063386, .894424457036, 0]],
    [1.75, 2.3, 1.326936051578, [.380656228479, .924716624551, 0]],
    [1.81, 1.622, 1.341799974442, [0, 1, 0]],
  ]) {
    const h = ray(meshes, [x, 8, z], [0, -1, 0]);
    near(h?.point.y, y, .000002, 'held-out source fold / receiving face');
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    assert.ok(n.dot(new THREE.Vector3(...normal)) > .999999, 'source face normal, not a bbox cap');
  }
  for (const side of [-1, 1]) {
    const x = v => side > 0 ? v : -.0018999576568603516 - v;
    for (const [o, d, far] of [
      [[x(1.82), 1.28, 2.27], [0, -1, 0], .05],
      [[x(1.70), 1.26, 2.34], [0, 0, -1], .10],
      [[x(1.82), 8, 2.1], [0, -1, 0], 12],
      [[x(1.80), 1.31, 1.60], [0, -1, 0], .08],
    ]) assert.equal(ray(meshes, o, d, far), undefined, 'complete-source adjacent air remains open');
  }
}

const material = new THREE.MeshBasicMaterial(), parts = [];
addT90AWSideMounts({ addEquipment(bucket, geometry) {
  assert.equal(bucket, 'hullDetail');
  const m = new THREE.Mesh(geometry, material); m.name = geometry.userData.t90AwSideMount;
  m.updateMatrixWorld(true); parts.push(m);
} });
try {
  for (const quality of ['high', 'low']) {
    const before = build(quality, true), after = build(quality);
    try {
      assert.equal(after.hash, before.hash, 'all non-target primitive submissions are byte-identical');
      assert.equal(unchanged(after.tank.root), unchanged(before.tank.root),
        'all existing cassette / skirt / hull / turret / gear buffers and world transforms unchanged');
      assert.equal(after.added, 28, 'six compact three-piece carriers plus two five-piece receivers');
      const all = physical(after.tank.root), old = physical(before.tank.root);
      sourceSurfaces(all);
      for (const side of [-1, 1]) {
        const x = v => side > 0 ? v : -.0018999576568603516 - v;
        for (const z of [1.50, 1.74, 2.30]) {
          const skin = ray(old.filter(m => m.name === 'hullRubber'), [x(1.75), 1.35, z], [0, -1, 0], .2);
          const baseTop = ray(parts.filter(m => m.name === 'carrierBase'), [x(1.75), 1.35, z], [0, -1, 0], .2);
          assert.ok(skin && baseTop && baseTop.point.y > skin.point.y && skin.point.y > 1.1875,
            'each measured carrier really intersects the unchanged fixed skirt');
        }
        for (const z of [1.551]) {
          const existing = old.filter(m => m.name === 'hullDetail');
          const low = ray(existing, [x(1.81), 1.1, z], [0, 1, 0], .3);
          const high = ray(existing, [x(1.81), 1.5, z], [0, -1, 0], .4);
          assert.ok(low?.point.y < 1.3057 && high?.point.y > 1.336,
            'receiving assembly aft stock overlaps the existing attached hinge leaf');
        }
        const intervals = parts.filter(m => m.name.startsWith('receiving')).map(m => {
          const low = ray([m], [x(1.81645), 1.3213, 1.4], [0, 0, 1], .4);
          const high = ray([m], [x(1.81645), 1.3213, 1.8], [0, 0, -1], .4);
          return low && high ? [low.point.z, high.point.z] : null;
        }).filter(Boolean).sort((a, b) => a[0] - b[0]);
        assert.equal(intervals.length, 5, 'every source receiving segment contains the same actual pin centerline');
        for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i - 1][1] > intervals[i][0],
          'shaft, collar and both stock ends form one physically overlapping assembly, not isolated pieces');
      }
      const detail = all.find(m => m.name === 'hullDetail'), matrix = detail.matrixWorld.clone();
      after.tank.root.getObjectByName('rig_turret').rotation.y = .63;
      after.tank.root.getObjectByName('rig_gun').rotation.x = -.2;
      after.tank.root.updateMatrixWorld(true);
      assert.ok(detail.matrixWorld.equals(matrix), 'all mounts remain hull-owned under turret/gun articulation');
      sourceSurfaces(all);
      let disposed = false; detail.geometry.addEventListener('dispose', () => { disposed = true; });
      after.tank.dispose(); after.tank = null; assert.ok(disposed, 'merged first-party hardware disposes');
    } finally { before.tank.dispose(); after.tank?.dispose(); }
  }
} finally { for (const p of parts) p.geometry.dispose(); material.dispose(); }
console.log('t90AwXSideMounts: high/low fixed-source folds/pin normals and air, actual support, permanent ownership, exact cassette/gear preservation and disposal pass');
