import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { isTrackShoeMesh } from '../../../tools/track-clip-classification.mjs';
import { CHIEFTAIN5_X_DATUMS } from './chieftain5X.ts';
import { addChieftain5XSourceClosure, chieftain5SourceClothRoll } from './chieftain5XSourceClosure.ts';
import { addChieftain5XSourceHull } from './chieftain5XSourceHull.ts';
import { addChieftain5XSourceHullEquipment } from './chieftain5XSourceHullEquipment.ts';
import { addChieftain5XSourceTurretEquipment } from './chieftain5XSourceTurretEquipment.ts';

// Fixed original-source witnesses, not camera bins or candidate-derived targets.
// Canonical SHA2a781a79…268e79 retains all eleven owners. Only concealed case
// and inner-web roots are continued into the permanent native receiving skin.
const near = (a, b, e, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= e,
  `${label}: ${a}, source ${b} ±${e}`);
const hit = (objects, p, d, far = 5) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d).normalize(), 0, far).intersectObjects(objects, false)[0];
function collect(build) {
  const pieces = [], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const add = (bucket, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(g, material); m.name = bucket;
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.updateMatrixWorld(true); pieces.push(m);
  };
  build({ add, addEquipment: add, addExternalArmor: add, addHatch: add,
    addMudguard: (_name, ...args) => add(...args) });
  return { pieces, dispose() { for (const m of pieces) m.geometry.dispose(); material.dispose(); } };
}
function contact(a, b, point, direction, label) {
  for (const objects of [a, b]) for (const sign of [-1, 1]) {
    const h = hit(objects, point, direction.map(v => v * sign), .5);
    assert.ok(h && h.distance > .0005, `${label}: positive material on both sides of the shared point`);
  }
}
function receivingContacts() {
  const closure = collect(addChieftain5XSourceClosure);
  const hull = collect(P => { addChieftain5XSourceHull(P); addChieftain5XSourceHullEquipment(P); });
  const turret = collect(P => addChieftain5XSourceTurretEquipment(P, [0, 0, 0]));
  const roll = new THREE.Mesh(chieftain5SourceClothRoll(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  roll.updateMatrixWorld(true);
  try {
    const casePieces = closure.pieces.filter(m => m.geometry.userData.chieftain5SourceClosure === 'aftCase');
    const web = closure.pieces.filter(m => m.geometry.userData.chieftain5SourceClosure === 'innerFenderReturn');
    contact(casePieces, hull.pieces, [.45, 1.30, -3.512], [0, 0, 1], 'aft case receiving overlap');
    contact(web, hull.pieces, [.977, 1.290, 3.00], [0, 1, 0], 'web outer fender overlap');
    contact(web, hull.pieces, [.925, 1.00, 2.70], [0, 1, 0], 'web concealed bow-root overlap');
    // Use the independently authored case, not the roll itself, as the receiver.
    const cases = turret.pieces.filter(m => Math.abs(m.position.x - 1.4538355) < 1e-8);
    assert.equal(cases.length, 1);
    contact([roll], cases, [1.60, 2.10, -1.0], [1, 0, 0], 'roll overlaps supported inboard case');
  } finally { closure.dispose(); hull.dispose(); turret.dispose(); roll.geometry.dispose(); roll.material.dispose(); }
}
function fixedHull(all) {
  near(hit(all, [.45, 1.30, -4], [0, 0, 1])?.point.z, -3.6587893963, .000002, 'actual aft case face');
  for (const x of [.28, .65]) assert.equal(hit(all, [x, 1.30, -3.8], [0, 0, 1], .25), undefined,
    'real air beside the bounded case is not a widened rear slab');
  for (const [x, z, y] of [[.96, 3, 1.2291989976], [.95, 3.04, 1.1688796693]]) {
    const h = hit(all, [x, 2, z], [0, -1, 0]);
    near(h?.point.y, y, .000003, 'source inward fender plane, including held-out station');
    assert.ok(h.face.normal.dot(new THREE.Vector3(-.982645575405, .183001336760, .030301549147)) > .999999,
      'source plane orientation remains physical, not only its height');
  }
  near(hit(all, [.96, .95, 3], [0, 1, 0])?.point.y, .963293655686, .000003, 'real lower web face');
  assert.equal(hit(all, [.95, 1.175, 3.04], [0, 1, 0], .4), undefined, 'air above inclined web remains open');
}
function movingRoll(tank, all) {
  const p = CHIEFTAIN5_X_DATUMS.chieftain5_x.turretPivot;
  const frame = tank.root.getObjectByName('rig_turret').matrixWorld.clone()
    .multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
  const cast = (point, direction, far) => hit(all, new THREE.Vector3(...point).applyMatrix4(frame).toArray(),
    new THREE.Vector3(...direction).transformDirection(frame).toArray(), far);
  for (const [z, x] of [[-1.4, 1.6864364393], [-1, 1.7639660467], [-.8, 1.7802630373]]) {
    const h = cast([2, 2.1, z], [-1, 0, 0]);
    assert.equal(h?.object.name, 'turretDetail');
    near(h?.distance, 2 - x, .009, 'held-out cloth side: measured obliquity with simplified cloth relief');
  }
  assert.equal(cast([1.9, 1.85, -1.4], [-1, 0, 0], .30), undefined, 'actual air below the tapered bag');
}
function webAndShoes(tank) {
  const bands = [], shoes = [];
  tank.root.traverse(m => {
    if (m.isMesh && m.geometry.attributes.position.usage === THREE.DynamicDrawUsage) bands.push(m);
    if (isTrackShoeMesh(m)) shoes.push(m);
  });
  assert.equal(bands.length, 2); assert.equal(shoes.length, 2);
  for (const b of bands) {
    near(new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).x, .432923913, .000002,
      'source continuous web width, separate from full shoe envelope');
  }
  for (const side of [-1, 1]) {
    assert.ok(hit(bands, [side * 1.10, 1.30, 0], [0, -1, 0], .3), 'solid carrier inside measured source web');
    assert.equal(hit(bands, [side * 1.03, 1.30, 0], [0, -1, 0], .3), undefined,
      'source connector-side air is not filled by a full-width continuous carrier');
  }
  for (const m of shoes) {
    m.computeBoundingBox();
    m.geometry.computeBoundingBox();
    const box = new THREE.Box3().setFromObject(m), size = m.geometry.boundingBox.getSize(new THREE.Vector3());
    near(size.x, .5912144, .00001, 'broad physical shoe pads remain unchanged');
    near(box.max.x, 1.5903454, .00001, 'full outer shoe envelope is not narrowed with the web');
    near(box.min.x, -1.5903454, .00001, 'both shoe lanes retain their original outer envelope');
    assert.ok(box.min.y >= -.00001, 'unmodified rigid shoe course remains grounded');
  }
}
receivingContacts();
for (const quality of ['high', 'low']) {
  let gear; const original = KIT.buildRunningGear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  let tank;
  try { tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false }); }
  finally { KIT.buildRunningGear = original; }
  try {
    const all = [];
    tank.root.traverse(m => { if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m); });
    for (const yaw of [0, -.61, .73]) {
      tank.root.getObjectByName('rig_turret').rotation.y = yaw;
      gear.update(.13, -.17, 0); tank.root.updateMatrixWorld(true);
      fixedHull(all); movingRoll(tank, all); webAndShoes(tank);
    }
  } finally { tank.dispose(); }
}
console.log('chieftain5XSourceClosure.selftest: high/low source case/web/cloth, positive receiving contacts, actual air, narrow carrier and unchanged broad shoes pass');
