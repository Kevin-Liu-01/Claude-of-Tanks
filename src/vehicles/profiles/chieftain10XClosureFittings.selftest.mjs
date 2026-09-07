import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addChieftain10XUpperFittings } from './chieftain10XUpperFittings.ts';
import { addChieftain10XBowLights } from './chieftain10XBowLights.ts';
import { addChieftain10XRearSupport } from './chieftain10XRearSupport.ts';
import { addChieftain10XRearEquipment } from './chieftain10XRearEquipment.ts';
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a} versus source ${b}`);
const ray = (objects, origin, direction, far = 8) => new THREE.Raycaster(new THREE.Vector3(...origin),
  new THREE.Vector3(...direction), 0, far).intersectObjects(objects, false)[0];
const coordinate = (objects, origin, direction, axis, expected, tolerance, label) => {
  const hit = ray(objects, origin, direction);
  near(hit?.point.getComponent(axis), expected, tolerance, label);
  return hit;
};

function sourceHullWitnesses(all) {
  // Complete frozen source SHA252e45ee…85, root_7015 and root_7016.
  // These are physical first-hit rays, independent of raster camera bins.
  for (const [x, z] of [[0, -3.48], [.5, -3.4], [-.4, -3.35]]) {
    coordinate(all, [x, 0, z], [0, 1, 0], 1, 1.1033196449, .000002, 'separate rear-box floor');
  }
  const shallow = coordinate(all, [.25, 0, -3.1], [0, 1, 0], 1, .6396378439, .000002,
    'source shallow aft-belly plane');
  assert.ok(shallow.face.normal.distanceTo(new THREE.Vector3(0, -.8829746637, -.4694206464)) < .00001);
  const steep = coordinate(all, [.25, 0, -3.15], [0, 1, 0], 1, .7846254554, .000002,
    'source inclined rear closure');
  assert.ok(steep.face.normal.distanceTo(new THREE.Vector3(0, -.104557388, -.994518855)) < .00001);
  for (const side of [-1, 1]) assert.equal(ray(all, [side * .82, .85, -3.48], [0, 1, 0], .30), undefined,
    'actual under/alongside-box air cannot be replaced by the former broad wedge');
  assert.equal(ray(all, [0, 1.72, -3.4], [0, 0, -1], .10), undefined,
    'source raised rear lid retains its real under-cover air');
  for (const [x, y] of [[.125, 1.69948278934], [-.125, 1.69941851473]]) {
    coordinate(all, [x, 2, -3.6], [0, -1, 0], 1, y, .000002, 'unequal localized rear cap crown');
  }
  coordinate(all, [.145, 2, -3.63], [0, -1, 0], 1, 1.66319052949, .000002,
    'actual narrow rear leaf, not a whole-width roof extension');
  assert.equal(ray(all, [0, 1.6, -3.62], [0, 0, 1], .05), undefined,
    'source central air between the paired rear leaves');
  for (const [x, z] of [[1.25, -3.57148647308], [-1.25, -3.57156586647],
    [-.65, -3.63833302389]]) coordinate(all, [x, 1.31, -3.7], [0, 0, 1], 2, z, .000002,
    'source receiving case/clasp replaces unsupported guessed rear cube');
  coordinate(all, [.45, 1.30, -3.8], [0, 0, 1], 2, -3.68543672562, .000002,
    'separate source raised starboard rear cover');
  for (const x of [-.666, -.31]) assert.equal(ray(all, [x, 1.36, -3.59], [1, 0, 0], .02), undefined,
    'actual port clasp window remains open between thin returns');
}

function sourceBowWitnesses(all) {
  for (const side of [-1, 1]) {
    for (const [x, y] of [[.81, 1.338], [.535, 1.354]]) coordinate(all,
      [side * x, y, 4], [0, 0, -1], 2, 3.40348792076, .000003, 'actual four opaque lamp fronts');
    coordinate(all, [side * .76, 3, 3.38], [0, -1, 0], 1, 1.43315041065, .0001,
      'source faceted lamp stock crown');
    coordinate(all, [side * .78, 3, 3.38], [0, -1, 0], 1, 1.4322072588, .0001,
      'source held-out lamp shoulder');
    coordinate(all, [side * .585, 1.46, 3.419835], [0, -1, 0], 1, 1.45119109759, .00004,
      'measured guard crossbar crown');
    coordinate(all, [side * .50, 1.46, 3.4198], [0, -1, 0], 1, 1.44437998303, .003,
      'separately bent guard corner, not a tall box');
    for (const [x, y] of [[.72, 1.38], [.64, 1.39]]) assert.equal(ray(all,
      [side * x, y, 3.45], [0, 0, -1], .04), undefined, 'source approach windows in front guard are actual air');
  }
}

function sourceUpperWitnesses(all, frame) {
  const hit = (p, d, far = 8) => new THREE.Raycaster(new THREE.Vector3(...p).applyMatrix4(frame),
    new THREE.Vector3(...d).transformDirection(frame), 0, far).intersectObjects(all, false)[0];
  const localY = p => hit(p, [0, -1, 0])?.point.clone().applyMatrix4(frame.clone().invert()).y;
  near(localY([-.114809429, 3, -.049434754]), 2.64718665432, .00001, 'source open-channel floor');
  near(localY([-.1515, 3, -.0652]), 2.74644332514, .0001, 'source thin channel side crown');
  near(localY([-1.56, 3, -.09]), 2.29662014945, .000002, 'local left housing latch, not widened housing');
  assert.equal(hit([-.114809429, 2.70, -.049434754], [0, -1, 0], .03), undefined,
    'real channel air above its inclined floor survives yaw');
  near(localY([-.35805, 4, .70]), 2.80820, .0002, 'unchanged complete roof weapon retains its actual barrel');
}

function capture(helper, ...args) {
  const parts = [], material = new THREE.MeshBasicMaterial();
  const add = (bucket, geometry, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = bucket;
    mesh.position.set(x, y, z); mesh.updateMatrixWorld(true); parts.push(mesh);
  };
  helper({ addEquipment: add }, ...args);
  return { parts, dispose() { for (const p of parts) p.geometry.dispose(); material.dispose(); } };
}

for (const quality of ['high', 'low']) {
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  const upper = capture(addChieftain10XUpperFittings, [0, 0, 0]);
  const bow = capture(addChieftain10XBowLights);
  const rear = capture(addChieftain10XRearSupport);
  const rearEquipment = capture(addChieftain10XRearEquipment);
  try {
    tank.root.updateMatrixWorld(true);
    const all = []; tank.root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking
      && !m.name.startsWith('procShadow_')) all.push(m); });
    const hull = all.filter(m => m.name === 'hull');
    sourceHullWitnesses(all); sourceBowWitnesses(all);
    const feet = upper.parts.filter(m => m.geometry.userData.chieftain10UpperFitting === 'channelFoot');
    assert.equal(feet.length, 2);
    for (const [u, v] of [[-.125, -.167], [-.125, .15]]) {
      const x = .918475434821 * u - .395478034321 * v,
        z = .395478034321 * u + .918475434821 * v;
      const bottom = ray(feet, [x, 2.60, z], [0, 1, 0])?.point.y;
      const bearing = ray(all, [x, 2.621, z], [0, -1, 0])?.point.y;
      assert.ok(Number.isFinite(bottom) && Number.isFinite(bearing) && bearing >= bottom,
        'channel end feet positively overlap the permanent circular bearing');
    }
    const stocks = bow.parts.filter(m => m.geometry.userData.chieftain10BowLight === 'lampStock');
    const uprights = bow.parts.filter(m => m.geometry.userData.chieftain10BowLight === 'lampUpright');
    assert.equal(stocks.length, 4); assert.equal(uprights.length, 4);
    for (const side of [-1, 1]) for (const x of [.584961, .760321]) {
      const base = ray(uprights, [side * x, 1.2, 3.357], [0, 1, 0])?.point.y;
      const roof = ray(hull, [side * x, 1.3, 3.357], [0, -1, 0])?.point.y;
      assert.ok(roof > base, 'all lamp uprights overlap actual permanent bow skin');
      const crown = ray(uprights, [side * x, 1.35, 3.357], [0, -1, 0])?.point.y;
      const stockBottom = ray(stocks, [side * x, 1.29, 3.357], [0, 1, 0])?.point.y;
      assert.ok(crown > stockBottom, 'all four shaped lamp stocks contact their own upright');
    }
    const toes = rear.parts.filter(m => m.geometry.userData.chieftain10RearSupport === 'toe');
    for (const side of [-1, 1]) {
      const toeFront = ray(toes, [side * .123, 1.62, -3.53], [0, 0, -1])?.point.z;
      const boxRear = ray(hull, [side * .123, 1.62, -3.7], [0, 0, 1])?.point.z;
      assert.ok(toeFront > boxRear, 'measured flared rear-support toe positively overlaps the rear box');
    }
    const walls = rearEquipment.parts.filter(m => m.geometry.userData.chieftain10RearEquipment === 'sideCaseReceivingWall');
    for (const side of [-1, 1]) {
      const bottom = ray(walls, [side * 1.25, 1.20, -3.26087], [0, 1, 0])?.point.y;
      const deck = ray(hull, [side * 1.25, 1.26, -3.26087], [0, -1, 0])?.point.y;
      assert.ok(deck > bottom, 'both source-sized side cases seat through their thin receiving walls on the actual fender');
    }
    const rig = tank.root.getObjectByName('rig_turret'), inverse = rig.matrixWorld.clone().invert();
    const hullState = hull.map(m => m.matrixWorld.clone()), buffers = all.map(m => m.geometry);
    for (const yaw of [0, -.63, .79]) {
      rig.rotation.y = yaw; tank.root.updateMatrixWorld(true);
      sourceUpperWitnesses(all, rig.matrixWorld.clone().multiply(inverse));
      assert.ok(hull.every((m, i) => m.matrixWorld.equals(hullState[i])), 'rear closure and bow gear remain hull owned');
      assert.ok(all.every((m, i) => m.geometry === buffers[i]), 'yaw does not recreate any geometry');
    }
  } finally { tank.dispose(); upper.dispose(); bow.dispose(); rear.dispose(); rearEquipment.dispose(); }
}
console.log('chieftain10XClosureFittings: high/low fixed-source rear planes, channel/latch, four lamps, real air, support and yaw ownership pass');
