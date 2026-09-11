import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildChallenger3XRearTurretClosure } from './challenger3XRearTurret.ts';
import { createTank } from '../tankFactory.ts';

const closure = buildChallenger3XRearTurretClosure();
const positions = closure.getAttribute('position');
const edges = new Map();
let volume = 0;
const selected = new THREE.Vector3(-0.17098, 0.19884, -3.11715);
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const n = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
for (let i = 0; i < positions.count; i += 3) {
  a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
  n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
  assert(n.length() > 1e-6, 'each closure triangle has physical area');
  assert(n.dot(selected.clone().sub(a)) < 1e-6,
    'the owner-selected inward face lies inside the repaired solid');
  volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const from = u.toArray().join(','), to = v.toArray().join(',');
    const key = [from, to].sort().join('|');
    const edge = edges.get(key) || { count: 0, winding: 0 };
    edge.count++; edge.winding += from < to ? 1 : -1; edges.set(key, edge);
  }
}
for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, winding: 0 },
  'every edge belongs to two oppositely wound faces: no open back or reversed face');
assert(Math.abs(volume - 0.37352) < 1e-6, 'closure is a positive solid inside the original shell');
closure.dispose();

for (const quality of ['high', 'low']) {
  const visual = createTank('challenger_3x', null, {
    proceduralOnly: true, quality: 'high', geometryQuality: quality, camoSeed: 4242, geometryReceipt: true,
  });
  try {
    const turret = visual.root.getObjectByName('turret');
    const rig = visual.root.getObjectByName('rig_turret');
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      rig.rotation.y = yaw;
      visual.root.updateMatrixWorld(true);
      for (const [x, y] of [[0, 0.30], [-0.5, 0.4], [0.5, 0.4]]) {
        const origin = turret.localToWorld(new THREE.Vector3(x, y, -4));
        const direction = new THREE.Vector3(0, 0, 1).transformDirection(turret.matrixWorld);
        const hit = new THREE.Raycaster(origin, direction).intersectObject(turret, false)[0];
        assert(hit, `${quality}/${yaw}: the actual FrontSide turret closes the rear`);
        const local = turret.worldToLocal(hit.point.clone());
        assert(local.z < -3.29 && local.z >= -3.35,
          `${quality}/${yaw}: rear rays hit the outside wall, not the caved-in interior (${local.z})`);
      }
    }
  } finally { visual.dispose(); }
}
console.log('challenger3XRearTurret: closed outward solid, owner patch enclosed, high/low rear surfaces at 0/90/180 yaw PASS');
