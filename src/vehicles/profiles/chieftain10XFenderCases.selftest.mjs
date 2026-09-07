import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addChieftain10XFenderCases } from './chieftain10XFenderCases.ts';

const ray = (meshes, p, d, far = 8) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];
const near = (a, b, e, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= e,
  `${label}: ${a} versus fixed source ${b}`);

function fixtureParts() {
  const material = new THREE.MeshBasicMaterial(), parts = [];
  const add = (bucket, geometry) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = bucket;
    mesh.updateMatrixWorld(true); parts.push(mesh);
  };
  addChieftain10XFenderCases({ add, addEquipment: add });
  return { parts, dispose() { parts.forEach(p => p.geometry.dispose()); material.dispose(); } };
}

function casePlanes(all) {
  // Independent complete-source first hits from frozen canonical source,
  // ex_armor_body_[lr]_01/02/03. No screen coordinates or authored outputs.
  for (const side of [-1, 1]) {
    for (const [x, z, y, tolerance] of [[1.60, -1.80, 1.6838002179, .0002],
      [1.64, -1.80, 1.6837172670, .0002], [1.66, -1.00, 1.6718416160, .0002],
      [1.53, -2.90, 1.6735926110, .0002], [1.10, 2.20, 1.5606824705, .00002],
      [1.10, 2.65, 1.5148068555, .00002], [1.62, 2.65, 1.4800470992, .00002],
      [1.67, 2.20, 1.5307222883, .00002]]) {
      near(ray(all, [side * x, 1.80, z], [0, -1, 0])?.point.y, y, tolerance,
        'long folded rear / two-plane forward case crown');
    }
    const mids = side > 0 ? [[1.55, 1.40, 1.5865822214], [1.60, .75, 1.5954680643],
      [1.30, 1.80, 1.5932370934]] : [[1.55, 1.40, 1.5853321952], [1.30, 1.80, 1.5927029474]];
    for (const [x, z, y] of mids) near(ray(all, [side * x, 1.70, z], [0, -1, 0])?.point.y,
      y, .00002, 'independently unequal left/right middle roof planes');
  }
}

function channel(all) {
  // Root_7008's actual fender is visible through the channel, not a painted
  // dark surface on the former main carrier roof 238 mm above it. Every ray
  // below was independently verified against ALL opaque source owners.
  for (const side of [-1, 1]) {
    for (const [x, z, floor] of [[1.425, .90, 1.3082100204], [1.40, 1.00, 1.3095204301],
      [1.32, 1.20, 1.3121295421], [1.23, 1.40, 1.3147224765],
      [1.14, 1.60, 1.3173083186], [1.05, 1.80, 1.3199117613]]) {
      assert.equal(ray(all, [side * x, 1.60, z], [0, -1, 0], .25), undefined,
        'source diagonal channel is actual air, including beside the permanent hull');
      near(ray(all, [side * x, 1.60, z], [0, -1, 0])?.point.y, floor, .00008,
        'unchanged real fender floor remains visible through the cutout');
    }
    // Held-out stock witnesses on the adjoining steep joining plane prevent
    // a broad straight trim from erasing the genuine rounded bearing shoulder.
    for (const [y, z, x] of [[1.46, 1.20, 1.3026652958], [1.485, 1.23, 1.2862243500],
      [1.49, 1.28, 1.2624369828]]) {
      const h = ray(all, [side * 1.34, y, z], [-side, 0, 0]);
      near(Math.abs(h?.point.x), x, .00001, 'source permanent shoulder stock beside the channel');
      assert.ok(h.face.normal.distanceTo(new THREE.Vector3(side * .9028559487,
        .0889939162, .4206319279)) < .00001, 'actual joining-facet orientation, not vertical false backing');
    }
  }
}

function contacts(parts, all) {
  const named = name => parts.filter(p => p.geometry.userData.chieftain10FenderCase === name);
  assert.equal(named('rearFoldedCase').length, 2);
  assert.equal(named('middleDiagonalCase').length, 2);
  assert.equal(named('frontCrossfallCase').length, 2);
  for (const side of [-1, 1]) {
    const bottom = ray(named('rearFoldedCase'), [side * 1.53, 1.20, -2.90], [0, 1, 0])?.point.y;
    near(bottom, 1.4881063000, .000002, 'measured folded rear-case underside');
    const seat = ray(named('rearReceivingShoulder'), [side * 1.53, 1.55, -2.90], [0, -1, 0])?.point.y;
    assert.ok(seat > bottom && seat - bottom < .001, 'actual inclined rear shoulder receives the case');
    for (const [caseName, stripName, x, z] of [['middleDiagonalCase', 'middleReceivingStrip', 1.60, .73],
      ['middleDiagonalCase', 'middleReceivingStrip', 1.30, 1.82],
      ['frontCrossfallCase', 'frontReceivingStrip', 1.30, 2.16],
      ['frontCrossfallCase', 'frontReceivingStrip', 1.30, 2.65]]) {
      const base = ray(named(caseName), [side * x, 1.25, z], [0, 1, 0])?.point.y;
      const top = ray(named(stripName), [side * x, 1.40, z], [0, -1, 0])?.point.y;
      assert.ok(top >= base, `${stripName} positively meets its own case`);
      const foot = ray(named(stripName), [side * x, 1.25, z], [0, 1, 0])?.point.y;
      const hull = all.filter(p => p.name === 'hull');
      const receiving = ray(hull, [side * x, 1.80, z], [0, -1, 0])?.point.y;
      assert.ok(receiving > foot, `${stripName} meets actual permanent fender stock`);
    }
  }
  // This pre-existing source side-housing aperture is outside the case work.
  // Never add a skirt-wide fill to silence the separate continuity warning.
  assert.equal(ray(parts, [1.86, 3, -.20], [0, -1, 0]), undefined);
}

for (const quality of ['high', 'low']) {
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false }), fixtures = fixtureParts();
  try {
    tank.root.updateMatrixWorld(true);
    const all = []; tank.root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking
      && !m.name.startsWith('procShadow_')) all.push(m); });
    casePlanes(all); channel(all); contacts(fixtures.parts, all);
    const hull = all.filter(m => !m.parent || m.name === 'hull' || m.name.startsWith('hull'));
    const before = hull.map(m => m.matrixWorld.clone()), buffers = all.map(m => m.geometry);
    for (const yaw of [-.74, .69, 0]) {
      tank.root.getObjectByName('rig_turret').rotation.y = yaw; tank.root.updateMatrixWorld(true);
      assert.ok(hull.every((m, i) => m.matrixWorld.equals(before[i])), 'all six cases and receiving stock remain hull-owned');
      assert.ok(all.every((m, i) => m.geometry === buffers[i]), 'yaw never rebuilds case or hull buffers');
    }
  } finally { tank.dispose(); fixtures.dispose(); }
}
console.log('chieftain10XFenderCases: high/low six source cases, exact folded planes, true channel air/stock, receiving contact and yaw ownership pass');
