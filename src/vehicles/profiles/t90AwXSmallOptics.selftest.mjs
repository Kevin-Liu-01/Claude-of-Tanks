import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildT90AWX } from './t90AwX.ts';
import { addT90AWSmallOptics } from './t90AwXSmallOptics.ts';
import { T90_AW_X_SOURCE_DATUMS } from '../t90AwXArmor.ts';

const ray = (meshes, p, d, far = 8) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];
const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} versus source ${expected}`);
const physical = root => { const list = []; root.traverse(m => {
  if (m.isMesh && !m.userData.vehicleMarking && !m.userData.shadowOnly && !m.name.startsWith('procShadow_')) list.push(m);
}); return list; };

function buffers(hash, g) {
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array;
    hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  if (g.index) { const a = g.index.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
}

function build(quality, omit) {
  let count = 0;
  const hash = createHash('sha256');
  registerProfiledBuilders({ t90_x: p => buildT90AWX(new Proxy(p, { get(target, key) {
    if (['add', 'addEquipment', 'addExternalArmor', 'addCupola'].includes(key)) return (bucket, g, ...args) => {
      if (g.userData.t90AwSmallOptic) {
        assert.equal(key, 'addEquipment', 'entire optic is permanently owned equipment, never an expendable ERA cover');
        assert.ok(bucket === 'turretDetail' || bucket === 'turretGlass'); count++;
        if (omit) { g.dispose(); return; }
      } else { hash.update(String(key)).update(bucket).update(JSON.stringify(args)); buffers(hash, g); }
      return target[key](bucket, g, ...args);
    };
    return Reflect.get(target, key);
  } })) });
  try {
    const tank = createTank('t90_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true); return { tank, count, hash: hash.digest('hex') };
  } finally { registerProfiledBuilders({ t90_x: buildT90AWX }); }
}

function fixture() {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  group.position.fromArray(T90_AW_X_SOURCE_DATUMS.turretPivot);
  addT90AWSmallOptics({ addEquipment(bucket, geometry, x, y, z) {
    const m = new THREE.Mesh(geometry, material); m.name = geometry.userData.t90AwSmallOptic;
    m.position.set(x, y, z); m.userData.bucket = bucket; group.add(m);
  } }); group.updateMatrixWorld(true);
  return { group, parts: group.children, dispose() {
    group.children.forEach(m => m.geometry.dispose()); material.dispose();
  } };
}

function sourceRays(all) {
  // Independent complete-source held-outs; coordinates are canonical world,
  // not candidate measurements. The source glass is a separate actual owner.
  for (const [x, y] of [[.399050021172, 2.33], [.479050021172, 2.345], [.440050021172, 2.338]]) {
    const h = ray(all, [x, y, .08], [0, 0, -1], .15);
    near(h?.point.z, .018270015717, .000002, 'source glass plane inside 19.300 mm hood recess');
    assert.equal(h.object.name, 'turretGlass', 'first surface is real glazing, not dark paint on a solid housing');
    assert.ok(h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(new THREE.Vector3(0, 0, 1)) > .999999);
    assert.equal(ray(all, [x, y, .0370], [0, 0, -1], .018), undefined,
      'source fore-glass volume is genuinely empty');
  }
  for (const [x, z, y, normal] of [
    [.399050021172, .006950025558, 2.368890571105, [0, .999955341272, -.009450685794]],
    [.479050021172, -.023049974442, 2.360090467120, [0, .668457857997, -.743750019887]],
  ]) {
    const h = ray(all, [x, 2.40, z], [0, -1, 0]);
    near(h?.point.y, y, .000002, 'actual source sloped/level hood crown');
    assert.ok(h.face.normal.clone().transformDirection(h.object.matrixWorld)
      .dot(new THREE.Vector3(...normal)) > .999999, 'source crown normal retained');
  }
  const under = ray(all, [.439050021172, 2.35, .031950025558], [0, 1, 0], .03);
  near(under?.point.y, 2.365780115128, .000002, 'measured hood underside, not a filled rectangular cap');
  near(ray(all, [.379050021172, 2.335, .08], [0, 0, -1], .15)?.point.z,
    .018270015717, .000002, 'real narrow left window jamb');
}

function unchangedMeshes(root) {
  const hash = createHash('sha256');
  for (const m of physical(root)) {
    // Every primitive in these two changed merged buckets is independently
    // hashed in build(). All other complete mesh/instance buffers stay exact.
    if (m.name === 'turretDetail' || m.name === 'turretGlass') continue;
    hash.update(m.name).update(JSON.stringify(m.matrixWorld.elements)); buffers(hash, m.geometry);
    if (m.instanceMatrix) { const a = m.instanceMatrix.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  }
  return hash.digest('hex');
}

const own = fixture();
try {
  for (const quality of ['high', 'low']) {
    const before = build(quality, true), after = build(quality, false);
    try {
      assert.equal(after.count, 18, 'helper is wired exactly once into the actual vehicle');
      assert.equal(before.count, after.count);
      assert.equal(before.hash, after.hash, 'all non-target primitive positions/normals/UVs/indices and ownership unchanged');
      assert.equal(unchangedMeshes(before.tank.root), unchangedMeshes(after.tank.root),
        'all old gear, gun, turret armor, hull, ERA and instance transforms remain exact');
      const all = physical(after.tank.root); sourceRays(all);
      const base = own.parts.filter(m => m.name === 'roundedBase');
      const lower = ray(base, [.439050021172, 2.1, -.003049974442], [0, 1, 0])?.point.y;
      near(lower, 2.153879880905, .000002, 'source base lower boundary, no extra pedestal');
      const permanent = physical(before.tank.root).filter(m => m.name === 'turret');
      const roof = ray(permanent, [.439050021172, 2.4, -.003049974442], [0, -1, 0])?.point.y;
      assert.ok(roof > lower && roof < 2.311079978943, 'source base physically enters permanent casting');
      near(ray(base, [.439050021172, 2.4, -.003049974442], [0, -1, 0])?.point.y,
        2.311079978943, .000002, 'actual source support cap receives housing floor');
      const detail = all.find(m => m.name === 'turretDetail'), glass = all.find(m => m.name === 'turretGlass');
      const originalMatrices = [detail, glass].map(m => m.matrixWorld.clone());
      const turret = after.tank.root.getObjectByName('rig_turret'), gun = after.tank.root.getObjectByName('rig_gun');
      turret.rotation.y = .63; gun.rotation.x = -.19; after.tank.root.updateMatrixWorld(true);
      assert.ok(!detail.matrixWorld.equals(originalMatrices[0]) && !glass.matrixWorld.equals(originalMatrices[1]),
        'both housing and glazing follow turret yaw');
      const yawMatrices = [detail, glass].map(m => m.matrixWorld.clone());
      gun.rotation.x = .21; after.tank.root.updateMatrixWorld(true);
      assert.ok([detail, glass].every((m, i) => m.matrixWorld.equals(yawMatrices[i])), 'gun pitch cannot drag fixed roof optics');
      turret.rotation.y = 0; gun.rotation.x = 0; after.tank.root.updateMatrixWorld(true); sourceRays(all);
      let disposed = 0;
      for (const m of [detail, glass]) m.geometry.addEventListener('dispose', () => disposed++);
      after.tank.dispose(); after.tank = null; assert.equal(disposed, 2, 'both merged optic material buffers dispose');
    } finally { before.tank.dispose(); after.tank?.dispose(); }
  }
} finally { own.dispose(); registerProfiledBuilders({ t90_x: buildT90AWX }); }
console.log('t90AwXSmallOptics: high/low source crown/glass/jamb/under-hood air, actual base contact, exact non-target preservation, yaw/pitch and disposal pass');
