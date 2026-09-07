import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addChieftain10XEngineDeck } from './chieftain10XEngineDeck.ts';

const close = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const ray = (meshes, origin, direction, far = 8) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];

function sourceWitnesses(meshes, hull) {
  // Source ex_armor_body_01/03 planar cover and 02/l_08/r_08 rim rays.
  // These include held-out coordinates, not the authored frame corners.
  for (const [x, z, top] of [[.5, -.8, 1.724197657], [.9, -.6, 1.726378413],
    [-.5, -.8, 1.725901555], [.915, -.8, 1.729602603],
    [.915, -1.4, 1.723069516], [-.915, -1.2, 1.722566094],
    [-.915, -1.6, 1.720732439]]) {
    close(ray(meshes, [x, 1.775, z], [0, -1, 0])?.point.y, top, .00001,
      'source forward cover or frame crown');
  }
  // Origin lies below the separate mesh/net overlay but above the folded
  // metal. Both the sloping top and independently measured underside remain.
  for (const [z, top, bottom] of [[-1.2, 1.70651577, 1.69411387],
    [-1.6, 1.69418190, 1.67877410]]) {
    close(ray(meshes, [.5, 1.718, z], [0, -1, 0])?.point.y, top, .0003,
      'source folded louver top below the separate grille');
    close(ray(meshes, [.5, 1.66, z], [0, 1, 0])?.point.y, bottom, .001,
      'source louver underside, not a black box');
  }
  for (const side of [-1, 1]) {
    assert.equal(ray(meshes, [side * .30, 1.67, -.8], [0, 1, 0], .08), undefined,
      'source diagonal turret-clearance notch remains genuine whole-model air');
    close(ray(hull, [side, 1.77, -1.0], [0, -1, 0])?.point.y, 1.704502092, .00003,
      'source outward-falling permanent shoulder supports the new frames');
  }
}

function capturedParts() {
  const parts = [], material = new THREE.MeshBasicMaterial();
  const add = (bucket, geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = bucket; mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.updateMatrixWorld(true); parts.push(mesh);
  };
  addChieftain10XEngineDeck({ add, addEquipment: add });
  return { parts, dispose() { for (const p of parts) p.geometry.dispose(); material.dispose(); } };
}

const isolated = capturedParts();
try {
  const hull = isolated.parts.filter(p => p.name === 'hull');
  sourceWitnesses(isolated.parts, hull);
  // Hinge pins and their true localized ears are present at source stations;
  // unsupported decorative tubes at guessed intermediate positions are not.
  for (const side of [-1, 1]) for (const z of [-.969884, -1.121702, -1.377482, -1.44184, -1.70664]) {
    assert.ok(ray(isolated.parts, [side * .9344, 1.77, z], [0, -1, 0], .07),
      'source small hinge pin exists');
    const contact = ray(isolated.parts, [side * .9188, 1.77, z], [0, -1, 0], .07);
    assert.ok(contact, 'actual pin-to-raised-ear contact is material, not a floating bbox');
  }
} finally { isolated.dispose(); }

for (const quality of ['high', 'low']) {
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking) all.push(m); });
    const hull = all.filter(m => m.name === 'hull');
    sourceWitnesses(all, hull);
    const yaw = tank.root.getObjectByName('rig_turret');
    const paint = all.filter(m => m.name === 'hullDetail' || m.name === 'hullDark');
    const original = paint.map(m => m.matrixWorld.clone());
    yaw.rotation.y = .63; tank.root.updateMatrixWorld(true);
    assert.ok(paint.every((m, i) => m.matrixWorld.equals(original[i])),
      'all engine covers remain permanent hull equipment under turret yaw');
    // The shoulder's concealed lower closure overlaps the already-closed
    // carrier; neither an invented pedestal nor a raised whole hull is used.
    const lower = ray(hull, [1.1, 1.45, -.8], [0, 1, 0], .10);
    close(lower?.point.y, 1.50, .000001, 'explicit concealed carrier overlap datum');
  } finally { tank.dispose(); }
}
console.log('chieftain10XEngineDeck: high/low source plate/rim/louver planes, true bearing notch, supported frames and permanent hull ownership pass');
