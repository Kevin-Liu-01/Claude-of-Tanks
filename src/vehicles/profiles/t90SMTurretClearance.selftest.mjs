import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('t90sm', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const turretRig = tank.root.getObjectByName('rig_turret');
  const turret = turretRig?.getObjectByName('turret');
  assert.ok(turretRig && turret?.isMesh,
    'T-90SM keeps its structural turret geometry under rig_turret');

  const position = turret.geometry.attributes.position;
  const vertices = [];
  for (let index = 0; index < position.count; index += 1) {
    vertices.push(new THREE.Vector3().fromBufferAttribute(position, index));
  }
  const near = (value, target, epsilon = 1e-3) => Math.abs(value - target) < epsilon;
  const hasVertex = ([x, y, z]) => vertices.some(vertex => near(vertex.x, x)
    && near(vertex.y, y) && near(vertex.z, z));

  const lowerRingAnchors = [
    [-1.565, 0.080, 1.18],
    [1.565, 0.080, 1.18],
    [-1.42, 0.080, 0.14],
    [1.42, 0.080, 0.14],
  ];
  for (const anchor of lowerRingAnchors) {
    assert.ok(hasVertex(anchor),
      `mirrored cheek lower ring remains raised at ${anchor.join(',')}`);
  }

  const formerDeckAnchors = [
    [-1.565, -0.005, 1.18],
    [1.565, -0.005, 1.18],
    [-1.42, 0.000, 0.14],
    [1.42, 0.000, 0.14],
  ];
  for (const anchor of formerDeckAnchors) {
    assert.equal(hasVertex(anchor), false,
      `marked cheek lower ring must not remain on the hull deck at ${anchor.join(',')}`);
  }

  for (const yaw of [0, Math.PI / 2]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    for (const anchor of lowerRingAnchors) {
      const world = turret.localToWorld(new THREE.Vector3(...anchor));
      assert.ok(world.y >= 1.475,
        `cheek lower ring clears the hull deck through yaw ${yaw}: ${world.y}`);
    }
  }
} finally {
  tank.dispose();
}

console.log('t90SMTurretClearance.selftest: mirrored cheek assemblies clear the hull through yaw');
