import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { BASKET_PLAN_SCALE, addChieftain10XBasket } from './chieftain10XBasket.ts';
import { TURRET_SEAT_COLLAR_NAME, buildTurretSeatRaceGeometry, seatTurretOverDeck } from '../turretSeatRace.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';
import { near } from '../../../tools/receipt-kit.test-support.mjs';

// Fixed, complete-source turret witnesses, not isolated candidate targets.
// Canonical SHA256 252e45ee57928c6256252fa7dcdba8c42bfc2c2c86a6d4548ea68291b45c6f85.
const pivot = new THREE.Vector3(0, 1.512956, .595241);
const witnesses = [
  [[-3, 1.1, .31], [1, 0, 0], 0, -.681769521590],
  [[-3, 1.25, .43], [1, 0, 0], 0, -.681769655057],
  [[3, 1.1, .9], [-1, 0, 0], 0, .686381248705],
  [[3, 1.3, 1.0], [-1, 0, 0], 0, .617324669091],
  [[-3, 1.42, .55], [1, 0, 0], 0, -1.090342066816],
  [[-3, 1.50, .20], [1, 0, 0], 0, -1.011369319159],
  [[-3, 1.50, -.25], [1, 0, 0], 0, -.664722615869],
  [[-3, 1.1, .85], [1, 0, 0], 0, -.808309606500],
  [[-3, 1.3, .63], [1, 0, 0], 0, -.866986738336],
  [[-3, 1.3, .70], [1, 0, 0], 0, -.870178170274],
  [[-3, 1.3, .78], [1, 0, 0], 0, -.873271242066],
  [[0, 1.05, 1.2], [0, -1, 0], 1, .794757790882],
  [[.1, .95, .6], [0, -1, 0], 1, .912637622915],
];
const ray = (meshes, origin, direction, far = 7) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];

function bufferHash(hash, geometry) {
  for (const name of Object.keys(geometry.attributes).sort()) {
    const a = geometry.attributes[name].array;
    hash.update(name).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const a = geometry.index?.array;
  if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
}

function build(quality, legacy = false) {
  const original = KIT.buildRunningGear, submissions = createHash('sha256');
  const names = [];
  KIT.buildRunningGear = (p, cfg) => {
    const originalAdd = p.add;
    let inserted = false;
    p.add = (bucket, geometry, ...transform) => {
      const name = geometry.userData.chieftain10BasketPiece;
      if (name) {
        assert.equal(bucket, 'turretDetail', 'basket pieces are permanent turret equipment, not expendable armor');
        names.push(name);
        if (legacy) {
          geometry.dispose();
          if (!inserted) originalAdd('turret', KIT.cylY(.785085, .785085, .27771, 32),
            0, .9007115 - pivot.y, 0);
          inserted = true;
          return;
        }
      } else {
        submissions.update(bucket).update(JSON.stringify(transform));
        bufferHash(submissions, geometry);
      }
      originalAdd(bucket, geometry, ...transform);
    };
    return original(p, cfg);
  };
  try {
    const tank = createTank('chieftain_mk10', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    return { tank, names, submissions: submissions.digest('hex') };
  } finally { KIT.buildRunningGear = original; }
}

function otherBuffers(root) {
  const hash = createHash('sha256');
  root.traverse(m => {
    if (!m.isMesh || m.name.startsWith('procShadow_') || m.userData.vehicleMarking) return;
    // These two merged buckets are independently covered above at every
    // original primitive submission, excluding ONLY the named replacement.
    if (['turret', 'turretDetail'].includes(m.name)) return;
    // 252's ring collar (turretSeatRace.ts addSeatCollar, ce10d80591) is drawn from the turret's own lowest surface at the
    // race (its top 4 mm into it), so the legacy stand-in's underside moves it: turret-derived, not hull/gear/gun/roof
    if (m.name === TURRET_SEAT_COLLAR_NAME) return;
    hash.update(m.name).update(JSON.stringify(m.matrixWorld.elements));
    bufferHash(hash, m.geometry);
    if (m.instanceMatrix) {
      const a = m.instanceMatrix.array;
      hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return hash.digest('hex');
}

// The basket is drawn to this hull's ring (chieftain10XBasket.ts, main-reds-259): the source basket scaled in plan about
// the turret's axis by BASKET_PLAN_SCALE, heights kept, its right support raised into the seated bearing. `fit` carries a
// source point (or a held-out source value on its axis) to the drawn basket; the identity reads the source itself.
const source = { point: p => p, value: (axis, v) => v };
const fit = {
  point: ([x, y, z]) => [pivot.x + BASKET_PLAN_SCALE * (x - pivot.x), y, pivot.z + BASKET_PLAN_SCALE * (z - pivot.z)],
  value: (axis, v) => axis === 1 ? v : axis === 0 ? pivot.x + BASKET_PLAN_SCALE * (v - pivot.x) : pivot.z + BASKET_PLAN_SCALE * (v - pivot.z),
};

function surfaces(meshes, yawAngle = 0, map = source) {
  const rotation = new THREE.Matrix4().makeRotationY(yawAngle);
  const point = p => new THREE.Vector3(...map.point(p)).sub(pivot).applyMatrix4(rotation).add(pivot);
  const direction = d => new THREE.Vector3(...d).transformDirection(rotation);
  for (const [origin, dir, axis, expected] of witnesses) {
    const hit = ray(meshes, point(origin).toArray(), direction(dir).toArray());
    const neutral = hit?.point.clone().sub(pivot).applyMatrix4(rotation.clone().invert()).add(pivot);
    near(neutral?.getComponent(axis), map.value(axis, expected), .000015, 'held-out complete-source folded surface');
  }
  // The small irregular ten-sided linkage is authored as a closed 40 mm
  // bent rod; its local fillets are explicitly approximate, not a plane fit.
  for (const [origin, expected] of [[[3, 1.1, -.12], .104968277728],
    [[3, 1.15, -.115], .104822563873], [[3, 1.38, .10], .637900349522]]) {
    const hit = ray(meshes, point(origin).toArray(), direction([-1, 0, 0]).toArray());
    const neutral = hit?.point.clone().sub(pivot).applyMatrix4(rotation.clone().invert()).add(pivot);
    near(neutral?.x, map.value(0, expected), .0035, 'source narrow hanging linkage remains material with bounded fillet simplification');
  }
  const hit = ray(meshes, point([3, 1.3, 1]).toArray(), direction([-1, 0, 0]).toArray());
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    .transformDirection(rotation.clone().invert());
  assert.ok(normal.dot(new THREE.Vector3(.82286457, 0, .56823754)) > .999999,
    'actual source oblique support normal is retained, not a bounding box');
  for (const [origin, dir, far] of [
    [[.4, .81, .3], [0, -1, 0], .12],
    [[-3, .9, .1], [1, 0, 0], 6],
    [[-3, 1.1, -.35], [1, 0, 0], 6],
  ]) assert.equal(ray(meshes, point(origin).toArray(), direction(dir).toArray(), far), undefined,
    'independent source floor aperture / transverse basket window remains actual air');
}

// The drawn basket stands inside this hull's race (its widest point inside the race's inner edge, so clear of the race and
// the collar on it), and the turret seat moves none of it.
function fitsTheRing(drawn) {
  const receipt = combatAnatomyCalibration('chieftain_mk10').turretRing, cx = receipt.seat[0], cz = receipt.seat[2];
  const race = buildTurretSeatRaceGeometry(receipt, true), p = race.getAttribute('position');
  let raceIn = Infinity, widest = 0;
  for (let i = 0; i < p.count; i++) raceIn = Math.min(raceIn, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz));
  race.dispose();
  for (const m of drawn) {
    const q = m.geometry.getAttribute('position');
    for (let i = 0; i < q.count; i++) widest = Math.max(widest, Math.hypot(q.getX(i) - cx, q.getZ(i) - cz));
  }
  assert.ok(widest < raceIn - .015, `the basket stands inside the race's inner edge (${widest.toFixed(4)} vs ${raceIn.toFixed(4)})`);
  const hullG = new THREE.Group(), turretG = new THREE.Group(), disposables = [];
  hullG.add(turretG); turretG.position.copy(pivot);
  const copies = drawn.map(m => { const c = new THREE.Mesh(m.geometry.clone(), material); c.position.copy(pivot).negate(); turretG.add(c); return c; });
  hullG.updateMatrixWorld(true);
  try {
    assert.equal(seatTurretOverDeck({ specId: 'chieftain_mk10', hullG, turretG, gunG: null, disposables }), 0,
      'the turret seat moves no basket corner');
    copies.forEach((c, i) => assert.deepEqual(c.geometry.getAttribute('position').array, drawn[i].geometry.getAttribute('position').array));
  } finally { for (const g of disposables) g.dispose(); for (const c of copies) c.geometry.dispose(); }
}

function support(parts, structural, map = fit) {
  const named = name => parts.filter(p => p.name === name), at = p => map.point(p);
  near(ray(named('floor'), at([-.55, 1, .45]), [0, -1, 0])?.point.y
    - ray(named('leftSteppedPedestal'), at([-.55, .7, .45]), [0, 1, 0])?.point.y,
  .001, .000001, 'left source pedestal overlaps the actual pierced floor');
  near(ray(named('leftSteppedPedestal'), at([-.52, 1.4, .38]), [0, -1, 0])?.point.y
    - ray(named('concealedSeatJoint'), at([-.52, 1.3, .38]), [0, 1, 0])?.point.y,
  .001, .000001, 'concealed 23 mm construction joint reaches source pedestal');
  near(ray(named('concealedSeatJoint'), at([-.52, 1.4, .38]), [0, -1, 0])?.point.y
    - ray(named('leftUpperTrayFloor'), at([-.52, 1.3, .38]), [0, 1, 0])?.point.y,
  .001001, .000001, 'the same small joint overlaps thin upper tray');
  // 240's seat lifted the turret's underside over the support (its fan from the ring's middle reaches past the rim) from
  // the source's bearing to 1.578-1.622: the support's top reaches 29 mm or more into it over the whole of its top
  const right = named('rightObliqueSupport');
  right[0].geometry.computeBoundingBox();
  const box = right[0].geometry.boundingBox;
  let cells = 0;
  for (let x = box.min.x; x <= box.max.x; x += .02) for (let z = box.min.z; z <= box.max.z; z += .02) {
    const top = ray(right, [x, 1.9, z], [0, -1, 0], 1);
    if (!top) continue;
    const bearing = ray(structural, [x, 1.4, z], [0, 1, 0], .6);
    assert.ok(bearing && top.point.y - bearing.point.y > .029, `right support hangs from actual permanent bearing at ${x.toFixed(2)}, ${z.toFixed(2)}`);
    cells++;
  }
  assert.ok(cells > 80, `the support's top is read across its plan (${cells} cells)`);
  assert.equal(ray(right, at([.65, .796, .9]), [0, 1, 0], .010), undefined,
    'source gap under the hanging right support is not filled by an invented root');
}

const material = new THREE.MeshBasicMaterial();
const basket = (asSource) => {
  const out = [];
  addChieftain10XBasket({ addEquipment(bucket, geometry) {
    assert.equal(bucket, 'turretDetail');
    const m = new THREE.Mesh(geometry, material); m.name = geometry.userData.chieftain10BasketPiece;
    m.updateMatrixWorld(true); out.push(m);
  } }, pivot.toArray(), asSource);
  return out;
};
const parts = basket(true), drawn = basket(false);
try {
  surfaces(parts);
  surfaces(drawn, 0, fit);
  fitsTheRing(drawn);
  for (const quality of ['high', 'low']) {
    const before = build(quality, true), after = build(quality);
    try {
      assert.equal(after.submissions, before.submissions, 'all non-target submitted geometry and transforms unchanged');
      assert.equal(otherBuffers(after.tank.root), otherBuffers(before.tank.root),
        'complete hull/gear/gun/roof and other physical buffers remain identical');
      assert.deepEqual(after.names, before.names);
      assert.ok(after.names.includes('floor') && after.names.includes('rightObliqueSupport'));
      const yaw = after.tank.root.getObjectByName('rig_turret'), meshes = [];
      yaw.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking && !m.name.startsWith('procShadow_')) meshes.push(m); });
      surfaces(meshes, 0, fit);
      support(drawn, meshes.filter(m => m.name === 'turret'));
      const detail = meshes.find(m => m.name === 'turretDetail');
      const fixed = detail.matrixWorld.clone();
      after.tank.root.getObjectByName('rig_gun').rotation.x = -.2;
      after.tank.root.updateMatrixWorld(true);
      assert.ok(detail.matrixWorld.equals(fixed), 'basket never follows gun pitch');
      yaw.rotation.y = .63; after.tank.root.updateMatrixWorld(true); surfaces(meshes, .63, fit);
      yaw.rotation.y = 0; after.tank.root.getObjectByName('rig_gun').rotation.x = 0;
      after.tank.root.updateMatrixWorld(true); surfaces(meshes, 0, fit);
      const resources = new Set(meshes.map(m => m.geometry)), disposed = new Set();
      for (const g of resources) g.addEventListener('dispose', () => disposed.add(g));
      after.tank.dispose(); after.tank = null;
      assert.equal(disposed.size, resources.size, 'all merged turret resources dispose');
    } finally { before.tank.dispose(); after.tank?.dispose(); }
  }
} finally { for (const p of [...parts, ...drawn]) p.geometry.dispose(); material.dispose(); }
console.log('chieftain10XBasket: high/low complete-source folds/pedestals/apertures, fitted inside the race (the seat moves none of it), support in its bearing, attachment, yaw/pitch ownership, exact non-target preservation and disposal pass');
