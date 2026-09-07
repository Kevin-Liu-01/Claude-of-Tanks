import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildAmx30X } from './amx30X.ts';
import { addAmx30XAftReturn } from './amx30XAftReturn.ts';

const close = (a, b, label, eps = 5e-6) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= eps, `${label}: ${a}, expected ${b}`);
const cast = (objects, origin, direction, far = 4) => new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObjects(objects, false)[0];
// Held-out complete canonical Object_66 measurements. Source SHA-256:
// 55f4ec8837caa90c4ad976fdfd974bd9761497b27d963e3af84f040b9126bae5.
// These fixed witnesses include the actual continuity-cell point, not its
// rounded display label; no source mesh is needed by this runtime test.
const TOP = [
  [.9272321138211659, -3.226646555662154, 1.1208732466549582, [.01421402637647, .87915741147029, -.47631943830903]],
  [.94, -3.22, 1.1242678612596153],
  [1.2, -3.10, 1.1867248260077201, [.00005599502945, .858861200603, -.512208390173]],
  [1.2, -3.20, 1.1309000545758803],
  [1.5, -3.20, 1.1270671799407799],
  [-1.2, -3.10, 1.1859983682581423],
  [-1.2, -3.20, 1.1246781557367775, [-.000060427375, .852484659039, -.522752238113]],
  [-1.5, -3.20, 1.1246568905887917],
  [-.95, -3.27, 1.0531505721664],
  [-1.5, -3.27, 1.0030507123536345, [-.083403536274, .309761792742, -.947149133925]],
];
const BOTTOM = [
  [1.2, -3.10, 1.1595107799343716, [-.041580181589, -.864850462656, .500304672917]],
  [-1.2, -3.10, 1.1593804965900805, [.041490268331, -.862144279917, .504961184884]],
  [1.2, -3.27, 1.0377936827937564], [.95, -3.27, 1.0575884263303803],
  [1.5, -3.27, 1.0255160690806353], [.95, -3.10, 1.1735393474943585],
  [1.5, -3.10, 1.1450874142599754], [.95, -2.90, 1.230599555888809],
  [1.5, -2.90, 1.2053091291813425], [-1.2, -3.27, .9788494192896829],
  [-1.5, -3.27, .9431958796851235], [1.2, -3.35, .9787540466804572],
  [.95, -3.34, .9796662527599206], [1.5, -3.35, .9697069345582341],
  [-1.2, -3.29, .951472616625481], [-.95, -3.31, .9729491332336988],
  [-1.5, -3.26, .9380685102470073],
];
function surfaces(objects, rows, up) {
  for (const [x, z, y, normal] of rows) {
    const hit = cast(objects, [x, up ? .80 : 1.45, z], [0, up ? 1 : -1, 0], .70);
    close(hit?.point.y, y, `${up ? 'underside' : 'crown'} at ${x}/${z}`);
    if (normal) close(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).distanceTo(new THREE.Vector3(...normal)), 0, 'actual source plane normal', 2e-5);
  }
}
function air(objects) {
  for (const [o, d, far] of [
    [[1.2, 1.27, -3.2], [0, -1, 0], .10], [[-1.2, 1.27, -3.2], [0, -1, 0], .10],
    [[1.2, 1.155, -3.1], [0, 1, 0], .003], [[-1.2, 1.155, -3.1], [0, 1, 0], .003],
    [[1.2, 1.4, -3.375], [0, -1, 0], .60], [[-1.5, 1.4, -3.3], [0, -1, 0], .60],
  ]) assert.equal(cast(objects, o, d, far), undefined, `complete-source real air ${o}`);
  close(cast(objects, [1.5, 1.4, -3.3], [0, -1, 0])?.point.y, 1.044423074458011, 'different right terminal remains solid');
}
function hashGeometry(h, g) {
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array; h.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  if (g.index) { const a = g.index.array; h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
}
const BEFORE = {
  high: '92884447477fe05db22c8f592303976ed6e47e29ead4315fc62a6d67e90c3850',
  low: '5a0c52e7405efca965f4f377091b9a89da25a015a7ebb8cdb5bca180e97905cc',
};
for (const quality of ['high', 'low']) {
  const helper = [], guards = [], h = createHash('sha256'); let targets = 0;
  for (const side of [-1, 1]) addAmx30XAftReturn({ addMudguard: (label, bucket, g) => {
    assert.equal(label, 'amx30-x-aft-return'); assert.equal(bucket, 'hull');
    helper.push(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
  } }, side);
  const triangles = helper.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
  assert.ok(triangles > 0 && triangles < 1500, `bounded closed-stock geometry: ${triangles}`);
  surfaces(helper, TOP, false); surfaces(helper, BOTTOM, true); air(helper);
  registerProfiledBuilders({ amx30_x: p => buildAmx30X(new Proxy(p, { get(o, key) {
    if (['add', 'addEquipment', 'addCupola', 'addMudguard'].includes(key)) return (...args) => {
      const guard = key === 'addMudguard', gi = guard ? 2 : 1;
      if (guard && ['amx30-x-side-fender', 'amx30-x-aft-flap', 'amx30-x-aft-return'].includes(args[0])) {
        targets++;
        if (args[0] === 'amx30-x-side-fender') guards.push(new THREE.Mesh(args[2].clone(), new THREE.MeshBasicMaterial()));
      } else {
        h.update(key).update(JSON.stringify(args.slice(0, gi))).update(JSON.stringify(args.slice(gi + 1))); hashGeometry(h, args[gi]);
      }
      return o[key](...args);
    };
    return Reflect.get(o, key);
  } })) });
  const tank = createTank('amx30_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  try {
    assert.equal(targets, 4, 'only the two exact side-fender and two aft-return primitives differ');
    assert.equal(h.digest('hex'), BEFORE[quality], 'all other primitive buffers, transforms and ownership byte-identical to pre-edit');
    tank.root.updateMatrixWorld(true);
    const meshes = []; tank.root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking && !m.name.includes('ShadowProxy')) meshes.push(m); });
    surfaces(meshes, TOP, false); air(meshes);
    for (const side of [-1, 1]) {
      for (const z of [-2.70, -1.90, 0, 2.30]) {
        const expected = 1.238 + (z + 3.30) / 5.78 * .012;
        close(cast(guards, [side * 1.2, 1.5, z], [0, -1, 0])?.point.y, expected, 'retained forward fender plane', 2e-7);
        close(cast(guards, [side * 1.2, 1, z], [0, 1, 0])?.point.y, expected - .040, 'retained forward fender underside', 2e-7);
      }
      const z = -2.853, x = side * 1.2;
      const bottom = cast(helper, [x, 1.1, z], [0, 1, 0]).point.y;
      const oldTop = cast(guards, [x, 1.4, z], [0, -1, 0]).point.y;
      assert.ok(oldTop - bottom > .008, 'positive closed-stock overlap at the 8 mm longitudinal receiving lap');
    }
    for (const yaw of [-.8, .8]) {
      tank.root.getObjectByName('rig_turret').rotation.y = yaw; tank.root.updateMatrixWorld(true);
      surfaces(meshes, TOP.slice(0, 5), false); air(meshes);
    }
    let disposed = 0;
    for (const m of meshes) m.geometry.addEventListener('dispose', () => disposed++);
    tank.dispose(); assert.ok(disposed > 0, 'ordinary tank disposal releases geometry');
  } finally {
    registerProfiledBuilders({ amx30_x: buildAmx30X });
    for (const m of [...helper, ...guards]) { m.geometry.dispose(); m.material.dispose(); }
  }
}
console.log('amx30XAftReturn: high/low source crown/underside planes, asymmetric true air, positive receiving lap, unchanged forward fenders and exact non-target primitives pass');
