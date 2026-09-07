import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';

const close = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const ray = (meshes, origin, direction, far = 8) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];

function untouchedCourse(root) {
  // Captured before the measured wheel/suspension replacement. Includes all
  // band, shoe, end-wheel and return-roller attributes and moving matrices.
  const hash = createHash('sha256');
  root.traverse(mesh => {
    if (!mesh.geometry || !/gearTrack|gearEndWheel|gearReturnRoller/.test(mesh.name)) return;
    hash.update(mesh.name);
    for (const name of Object.keys(mesh.geometry.attributes).sort()) {
      const a = mesh.geometry.attributes[name].array;
      hash.update(name).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    for (const a of [mesh.geometry.index?.array, mesh.instanceMatrix?.array]) {
      if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    hash.update(JSON.stringify(mesh.matrixWorld.elements));
  });
  return hash.digest('hex');
}

function matrices(mesh) {
  return Array.from({ length: mesh.count }, (_, i) => {
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return matrix;
  });
}

function wheelCuts(meshes) {
  // Held-out actual wheel_l_06 radial source rays, not values read from the
  // authored profiles. The small tolerance covers the original faceted rings.
  for (const side of [-1, 1]) {
    for (const [radius, outer, inner] of [[.15, 1.38073338, 1.30304211],
      [.28, 1.43624051, 1.27865444], [.30, 1.44324732, 1.27490263],
      [.38, 1.53661559, 1.18358222]]) {
      const y = .474396 + radius, z = -2.174642;
      close(Math.abs(ray(meshes, [side * 3, y, z], [-side, 0, 0])?.point.x),
        outer, .002, 'source recessed outer bowl and separate contact rim');
      close(Math.abs(ray(meshes, [0, y, z], [side, 0, 0])?.point.x),
        inner, .002, 'source inboard pressed bowl, not a broad generic disc');
    }
    for (const radius of [.30, .38]) for (const direction of [-1, 1]) {
      assert.equal(ray(meshes, [side * 1.36, .474396 + radius, -2.174642],
        [direction, 0, 0], .006), undefined, 'actual air between two separate wheel halves');
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 10 + i * Math.PI / 5;
      const hit = ray(meshes, [side * 3, .474396 + Math.cos(a) * .18,
        -2.174642 + Math.sin(a) * .18], [-side, 0, 0]);
      close(Math.abs(hit?.point.x), 1.4256, .00003, 'ten local source flange heads');
    }
  }
}

function suspension(root, gear) {
  const bosses = root.getObjectByName('gearSuspensionJointBosses');
  const arm = root.getObjectByName('gearSuspensionLinks');
  const wheelZs = [-2.174642, -1.254642, -.289679, .630321, 1.700374, 2.620374];
  const originalBosses = matrices(bosses), initialArm = matrices(arm);
  assert.equal(originalBosses.length, 24, 'two native joints for each of twelve moving arms');
  for (const [index, matrix] of originalBosses.entries()) {
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    const wheelIndex = Math.floor(index / 4), anchor = index % 2 === 0;
    const expectedZ = wheelZs[wheelIndex] + (anchor ? (wheelIndex % 2 ? -1 : 1) * .367175 : 0);
    close(p.z, expectedZ, .000001, 'paired source fore/aft anchor, not the shared pair midpoint');
    close(p.y, .474396, .000001, 'nominal source Horstmann anchor and axle are horizontal');
    close(Math.abs(p.x), anchor ? .990477 : 1.046706, .000001, 'source axial joint station');
  }
  for (const side of [-1, 1]) {
    close(Math.abs(ray([bosses], [0, .4744, -1.80777], [side, 0, 0])?.point.x),
      .877871, .00002, 'source anchor inboard cap');
    close(Math.abs(ray([bosses], [side * 2, .4744, -2.174642], [-side, 0, 0])?.point.x),
      1.164101, .00002, 'source axle cap reaches the real wheel bearing');
    assert.equal(ray([arm, bosses], [side * .774, 0, -2.174642], [0, 1, 0], 1.4),
      undefined, 'no invented inboard suspension solid below the hull');
  }
  const dishes = [root.getObjectByName('gearMk10WheelDishL'), root.getObjectByName('gearMk10WheelDishR')];
  const before = dishes.map(m => matrices(m));
  const layout = structuredClone(gear.roadWheelLayout);
  gear.update(.17, -.29, .07); root.updateMatrixWorld(true);
  for (const [sideIndex, dish] of dishes.entries()) {
    const after = matrices(dish);
    assert.ok(after.some((m, i) => !m.equals(before[sideIndex][i])), 'native dish really spins with its wheel');
    for (const [i, matrix] of after.entries()) {
      const p = new THREE.Vector3().setFromMatrixPosition(matrix);
      close(p.z, wheelZs[i], .000001, 'source axle longitudinal station remains fixed while spinning');
      close(p.y, .474396, .000001, 'source axle height remains fixed while spinning');
    }
  }
  assert.deepEqual(gear.roadWheelLayout, layout, 'wheel articulation never moves the belt or source axle recipe');
  gear.resetPose(); root.updateMatrixWorld(true);
  assert.deepEqual(matrices(bosses).map(m => m.elements), originalBosses.map(m => m.elements),
    'source horizontal pivots reset exactly on both sides');
  assert.deepEqual(matrices(arm).map(m => m.elements), initialArm.map(m => m.elements),
    'source moving links reset exactly');
}

for (const [quality, expected] of [
  ['high', '3ab26b4855beab1b9b80e8445be24aa4dcc772dc5b4d44c3aff47eb3831ae87c'],
  ['low', 'c3c67cecb2a2afda82645caff39bd6f5800f35bf367ff000e0aee0523cd312cf'],
]) {
  let gear;
  const original = KIT.buildRunningGear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  let tank;
  try { tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false }); }
  finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true);
    assert.equal(untouchedCourse(tank.root), expected, 'all existing track/end/roller geometry is byte-identical');
    const meshes = [];
    tank.root.traverse(m => { if (m.isMesh && /gearMk10WheelDish|gearRoadWheelDiscs/.test(m.name)) meshes.push(m); });
    wheelCuts(meshes);
    suspension(tank.root, gear);
  } finally { tank.dispose(); }
}
console.log('chieftain10XWheels.selftest: high/low source bowls, real inter-wheel air, horizontal paired anchors, motion/reset and unchanged complete course passed');
