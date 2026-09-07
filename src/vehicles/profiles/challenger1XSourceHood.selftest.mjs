import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildChallenger1X } from './challenger1X.ts';
import { addChallenger1SourceHood } from './challenger1XSourceHood.ts';
import { CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
const close = (a, b, label, eps = 3e-6) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= eps, `${label}: ${a}, expected ${b}`);
const ray = (objects, o, d, far = 4) => new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d), 0, far).intersectObjects(objects, false)[0];
const meshes = root => { const a = []; root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking && !m.name.includes('ShadowProxy') && m.material?.colorWrite !== false) a.push(m); }); return a; };
// Complete supplied canonical source, independently measured before authoring:
// 90a18f59e64509211fa15e4298fba40443766b8dbd9e6cfb1e7858ecad8f4e64.
const SURFACES = [
  [.6834460703627521, 2.022104030751699, 1.8280367672647526, 1.8258623978919022,
    [-.212083937622, .857086678849, -.469492096145], [.216597523981, -.855152996096, .470955269503]],
  [.7972790597528854, 1.9082710413615658, 1.7951425881329528, 1.7931370621764515,
    [-.250761647405, .836196735575, -.487743391143], [.249680118392, -.837282232720, .486434272282]],
  [.5696130809726188, 2.022104030751699, 1.8002481384501023, 1.7974169148097154,
    [-.009579554318, .876475782279, -.481350636457], [.009785332643, -.875369977065, .483354580530]],
];
function checkSurfaces(objects) {
  for (const [x, z, top, bottom, nt, nb] of SURFACES) {
    for (const [originY, direction, expected, normal] of [[2.3, -1, top, nt], [1.71018380918, 1, bottom, nb]]) {
      const h = ray(objects, [x, originY, z], [0, direction, 0]);
      close(h?.point.y, expected, 'actual thin source sheet');
      close(h.face.normal.clone().transformDirection(h.object.matrixWorld).distanceTo(new THREE.Vector3(...normal)), 0, 'source sheet normal', 1e-5);
    }
  }
}
function checkAir(objects) {
  for (const [o, d, far] of [
    [[.683446070363, 1.71018380918, 2.02210403075], [0, 1, 0], .10],
    [[.797279059753, 1.71018380918, 1.90827104136], [0, 1, 0], .075],
    [[.683446070363, 1.778483602814, 1.90827104136], [0, 0, -1], .10],
    [[1.13, 1.82, 1.90], [0, 0, -1], .30],
    [[1.24, 1.87, 1.82], [0, 0, -1], .30],
  ]) assert.equal(ray(objects, o, d, far), undefined, `complete source real air at ${o}`);
}
function checkReturns(objects) {
  // Held out from the authored stations: the independently lofted rounded
  // return approximates the source within 6 mm, not exact scanned topology.
  for (const [x, y, front, back] of [
    [1.025, 1.66, 2.048675528151158, 2.0451157875310164],
    [1.13, 1.82, 1.9548203292002557, 1.9508716853126495],
    [1.24, 1.87, 1.8750310283143583, 1.8711290838451864],
  ]) {
    const outer = ray(objects, [x, y, front + .08], [0, 0, -1], .12);
    const inner = ray(objects, [x, y, back - .08], [0, 0, 1], .12);
    close(outer?.point.z, front, 'source held-out outer return', .006);
    close(inner?.point.z, back, 'source held-out inner return', .006);
    close(outer.point.z - inner.point.z, front - back, 'thin folded stock, not filled case', .001);
  }
  // Original octagonal edging approximates the irregular source chamfers.
  close(ray(objects, [.5248, 2.05, 1.9], [0, -1, 0])?.point.y, 1.9541714381371489, 'source inboard cap crown', .002);
  close(ray(objects, [.5248, 1.85, 1.9], [0, 1, 0])?.point.y, 1.9304913092459688, 'source inboard cap underside', .002);
  close(ray(objects, [.72, 2.05, 2.124], [0, -1, 0])?.point.y, 1.9178771580913694, 'source diagonal cap crown', .003);
}
function updateHash(h, g) {
  for (const key of Object.keys(g.attributes).sort()) { const a = g.attributes[key].array; h.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  if (g.index) { const a = g.index.array; h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
}
function crosses(a, others) {
  const p = a.geometry.attributes.position, ix = a.geometry.index, count = ix?.count ?? p.count;
  for (let i = 0; i < count; i += 3) for (let j = 0; j < 3; j++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + j) : i + j).applyMatrix4(a.matrixWorld);
    const w = new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + (j + 1) % 3) : i + (j + 1) % 3).applyMatrix4(a.matrixWorld);
    const delta = w.sub(v), length = delta.length(); if (length < 2e-6) continue;
    const hit = new THREE.Raycaster(v, delta.multiplyScalar(1 / length), 1e-6, length - 1e-6).intersectObjects(others, false)[0];
    if (hit) return true;
  }
  return false;
}
function contacts(parts, base) {
  const connected = new Set(), edges = parts.map(() => new Set());
  for (let i = 0; i < parts.length; i++) {
    if (crosses(parts[i], base)) connected.add(i);
    for (let j = 0; j < i; j++) if (crosses(parts[i], [parts[j]]) || crosses(parts[j], [parts[i]])) { edges[i].add(j); edges[j].add(i); }
  }
  let change = true;
  while (change) { change = false; for (const i of connected) for (const j of edges[i]) if (!connected.has(j)) { connected.add(j); change = true; } }
  assert.deepEqual(parts.filter((_, i) => !connected.has(i)).map(p => p.name), [], 'every hood part has an actual surface-crossing attachment path to permanent geometry');
}
for (const quality of ['high', 'low']) {
  const h = createHash('sha256'); let newCount = 0;
  registerProfiledBuilders({ challenger1_x: p => buildChallenger1X(new Proxy(p, { get(o, key) {
    if (['add', 'addEquipment', 'addCupola', 'addMudguard'].includes(key)) return (...args) => {
      const gi = key === 'addMudguard' ? 2 : 1;
      if (args[gi].userData.challenger1SourceHood) newCount++;
      else { h.update(key).update(JSON.stringify(args.slice(0, gi))).update(JSON.stringify(args.slice(gi + 1))); updateHash(h, args[gi]); }
      return o[key](...args);
    }; return Reflect.get(o, key);
  } })) });
  const actual = createTank('challenger1_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  // Only the new, specifically tagged equipment is omitted from this process-
  // local counterfactual; all real core, rig, gear and old equipment remains.
  registerProfiledBuilders({ challenger1_x: p => buildChallenger1X(new Proxy(p, { get(o, key) {
    if (key === 'addEquipment') return (...args) => {
      if (args[1].userData.challenger1SourceHood) { args[1].dispose(); return; }
      return o[key](...args);
    }; return Reflect.get(o, key);
  } })) });
  const before = createTank('challenger1_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  const parts = [], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  addChallenger1SourceHood({ addEquipment: (bucket, g) => {
    assert.equal(bucket, 'turretDetail', 'hood remains permanent turret equipment, not armor or ERA');
    const m = new THREE.Mesh(g, material); m.name = g.userData.challenger1SourceHood; m.position.set(...D.turretPivot); m.updateMatrixWorld(true); parts.push(m);
  } });
  try {
    assert.equal(newCount, 9); assert.equal(parts.length, 9);
    assert.equal(h.digest('hex'), 'e456a8f4009c749032ffbf23adb3f2d5b0a299e2308e0475c4479f7ece7747c8', 'every pre-existing authored primitive buffer, placement and ownership is immutable');
    actual.root.updateMatrixWorld(true); before.root.updateMatrixWorld(true);
    const all = meshes(actual.root), base = meshes(before.root);
    checkSurfaces(all); checkReturns(all); checkAir(all); checkAir(base);
    for (const [x, z] of SURFACES) assert.equal(ray(base, [x, 1.71018380918, z], [0, 1, 0]), undefined, 'counterfactual really omits the previously absent hood');
    contacts(parts, base);
    for (const m of parts) {
      const pos = m.geometry.attributes.position; assert.ok(pos.count > 0 && pos.count < 6000);
      assert.equal(m.geometry.attributes.uv.count, pos.count);
      for (const v of pos.array) assert.ok(Number.isFinite(v));
    }
    const turret = actual.root.getObjectByName('rig_turret'), gun = actual.root.getObjectByName('rig_gun');
    for (const yaw of [-.6, .7]) {
      turret.rotation.y = yaw; gun.rotation.x = -.15; actual.root.updateMatrixWorld(true);
      const [x, z, top] = SURFACES[0], local = new THREE.Vector3(x - D.turretPivot[0], top - D.turretPivot[1], z - D.turretPivot[2]);
      const world = turret.localToWorld(local), up = new THREE.Vector3(0, 1, 0).transformDirection(turret.matrixWorld);
      const hit = ray(all, world.clone().addScaledVector(up, .08).toArray(), up.clone().negate().toArray(), .16);
      close(hit?.point.distanceTo(world), 0, 'hood follows turret yaw independently of gun pitch');
    }
  } finally {
    actual.dispose(); before.dispose(); for (const m of parts) m.geometry.dispose(); material.dispose();
    registerProfiledBuilders({ challenger1_x: buildChallenger1X });
  }
}
console.log('challenger1XSourceHood: high/low source surfaces and real air, positive geometric attachment graph, immutable old primitive buffers and moving equipment ownership pass');
