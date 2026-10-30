// kf51EvoGunFace.selftest.mjs — the KF51 EVO's gun face is its gun slot (266; FAIRNESS-265 §8, a modelling error routed
// since 263: the turret front read 2,455 mm effective at the balance range and no round passed). Its turret carries two
// forward wedge cheeks either side of a gun slot whose front is a vertical face at z 1.09-1.10; each convex slice
// bridged the cheeks' 74-degree noses across the slot, and the template's mantlet was a spaced plate riding the gun
// behind that face. gen-combat-anatomy.mjs cuts its turret slices at the cheeks' inner walls (TURRET_LATERAL_CUTS) and
// kf51Specs.ts lays a main mantlet on the slot face (`drawn`, measured on the build). Held here, through the authority's
// trace (sim/armor.ts traceTank), with level rounds from dead ahead (turret yaw 0):
// - across the slot (|x| <= 0.40, y 0.05-0.75) the round meets the slot face itself (z within 2 cm of 1.10, <= 2 degrees)
//   and reads the mantlet;
// - beside it the cheeks read the turret front as before (to the wedges' apex, y 0.45), never the mantlet;
// - the mantlet stays where it was measured (the envelope calibration leaves a drawn plate in place).
// Negative control: with the template's spaced mantlet back, the slot reads another plate.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './tankFactory.ts';
import { getSpec } from './specs.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pose = tankPoseFromState({ pos: V(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
const armor = getSpec('kf51_evo').armor;
const pivot = armor.turretPivot;
/** The first plate a level round at turret-frame (x, y) meets on the turret, with where and at what angle. */
const first = (x, y) => {
  const hit = traceTank(V(x + pivot[0], y + pivot[1], 14), V(x + pivot[0], y + pivot[1], -14), pose, armor)
    .find((h) => h.kind === 'plate');
  return hit && hit.impactFrame === 'turret' ? { name: hit.plate.name, z: hit.impactLocalZ, angle: hit.impactAngleDeg } : null;
};

const mantlet = armor.turretPlates.find((plate) => plate.name === 'mantlet');
assert.ok(mantlet && (mantlet.kind || 'main') === 'main' && mantlet.drawn, 'kf51_evo: the mantlet is a main plate measured on the build');
const zs = mantlet.verts.map((v) => v[2]), xs = mantlet.verts.map((v) => v[0]);
assert.ok(Math.min(...zs) > 1.08 && Math.max(...zs) < 1.11 && Math.abs(Math.max(...xs) - 0.43) < 1e-6, 'kf51_evo: the mantlet lies on the gun slot (calibration left it)');

const slot = [], cheeks = [];
for (let y = 0.05; y <= 0.75 + 1e-9; y += 0.1) {
  for (let x = -0.4; x <= 0.4 + 1e-9; x += 0.1) slot.push([x, y, first(x, y)]);
  for (const x of [-1.1, -0.8, -0.55, 0.55, 0.8, 1.1]) cheeks.push([x, y, first(x, y)]);
}
for (const [x, y, hit] of slot) {
  const at = `kf51_evo: a level round at (${x.toFixed(1)}, ${y.toFixed(2)})`;
  assert.ok(hit, `${at} meets the turret`);
  assert.ok(Math.abs(hit.z - 1.1) < 0.02 && hit.angle <= 2, `${at} meets the slot face (z ${hit.z.toFixed(3)}, ${hit.angle.toFixed(1)} deg)`);
  assert.equal(hit.name, 'mantlet', `${at} reads the mantlet`);
}
for (const [x, y, hit] of cheeks) {
  if (!hit) continue;
  assert.notEqual(hit.name, 'mantlet', `kf51_evo: the cheek at (${x}, ${y.toFixed(2)}) never reads the mantlet`);
}
for (const [x, y, hit] of cheeks) {
  // below the wedges' apex (y 0.45) the cheeks are the turret front; above it the outer cheeks turn into the roof
  if (y <= 0.45 + 1e-9) assert.equal(hit?.name, 'turret_front', `kf51_evo: the cheek at (${x}, ${y.toFixed(2)}) reads the turret front`);
}

// negative control: the template's spaced mantlet riding the gun (communityArmor) leaves the slot to another plate
const index = armor.turretPlates.indexOf(mantlet);
const collision = armor.collisionShells.turret;
const saved = collision.map((cell) => cell.faces.map((face) => [face, face.plate, face.gunSplit]));
try {
  for (const cell of saved) for (const [face] of cell) if (face.plate === mantlet || face.gunSplit) {
    face.plate = armor.turretPlates.find((plate) => plate.name === 'turret_front');
    delete face.gunSplit;
  }
  armor.turretPlates[index] = { ...mantlet, kind: 'spaced', drawn: false };
  assert.ok(slot.some(([x, y]) => first(x, y)?.name !== 'mantlet'), 'the control: with the spaced mantlet the slot reads another plate');
} finally {
  armor.turretPlates[index] = mantlet;
  for (const cell of saved) for (const [face, plate, split] of cell) { face.plate = plate; if (split) face.gunSplit = split; }
}
console.log(`kf51EvoGunFace.selftest: ${slot.length} level rounds across the gun slot meet its face at z 1.09-1.10 and read the`
  + ` mantlet; the cheeks keep the turret front to the wedges' apex (${cheeks.filter(([, , h]) => h?.name === 'turret_front').length} of ${cheeks.length} cheek rounds);`
  + ' the control with the spaced mantlet is found');
