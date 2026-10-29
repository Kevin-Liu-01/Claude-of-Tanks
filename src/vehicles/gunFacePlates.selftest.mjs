// gunFacePlates.selftest.mjs — the face in front of the gun reads the mantlet (262, Main's ruling on the hit model's
// fidelity). combatAnatomy.ts gave each calibrated turret face the plate nearestPlate scored best, and on 87 vehicles the
// face over the mantlet read another plate: wrap-around cheeks (the Challenger 1 Mk 2's 600 mm cheek over its 450 mm
// mantlet slot, so the balance range's rounds never met its mantlet while its Mk 3 rebuild's took 60 hits) or a low
// turret's thin roof (the T-90AM). gunFacePlate now owns those faces. This receipt holds every production vehicle to
// it: no forward turret face over a mantlet or gun-notch plate (normal z >= 0.2; centre within the plate's x range, its
// height +-0.1 m and 0.35 m of its depth) reads another plate; the two named cases read their mantlet face to face and
// through the authoritative trace (src/sim/armor.ts traceTank). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';

const GUN_FACE_PLATE = /mantlet|gun_notch/i;
const bounds = (plate) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of plate.verts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  return { min, max };
};
const over = (center, { min, max }) => center[0] >= min[0] && center[0] <= max[0]
  && center[1] >= min[1] - 0.1 && center[1] <= max[1] + 0.1 && center[2] >= min[2] - 0.35 && center[2] <= max[2] + 0.35;

/** The forward turret faces over each mantlet or gun-notch plate, and those among them that read another plate. */
function gunFaces(id) {
  const armor = getSpec(id).armor;
  const plates = (armor.turretPlates ?? []).filter((p) => (p.kind || 'main') === 'main' && GUN_FACE_PLATE.test(p.name) && p.verts?.length >= 3);
  const faces = [], wrong = [];
  for (const plate of plates) {
    const box = bounds(plate);
    for (const cell of armor.collisionShells?.turret ?? []) for (const face of cell.faces) {
      if (face.normal[2] < 0.2 || !over(face.center, box)) continue;
      faces.push({ face, plate });
      if (!plates.includes(face.plate)) wrong.push(`${face.plate?.name} over ${plate.name} at (${face.center.map((n) => n.toFixed(2)).join(', ')})`);
    }
  }
  return { plates, faces, wrong };
}

let vehicles = 0, faceCount = 0;
const failures = [];
for (const id of PRODUCTION_TANK_IDS) {
  const { plates, faces, wrong } = gunFaces(id);
  if (!plates.length || !getSpec(id).armor.collisionShells?.turret?.length) continue;
  vehicles++;
  faceCount += faces.length;
  if (wrong.length) failures.push(`${id}: ${wrong.slice(0, 3).join('; ')}`);
}
assert.deepEqual(failures, [], 'no forward turret face over a mantlet or gun-notch plate reads another plate');
assert.ok(vehicles > 150, `the census covers the fleet's turreted vehicles (${vehicles})`);

// the named cases: the face in front of the gun reads the mantlet, and a level round at it meets the mantlet first
const V = (x, y, z) => new THREE.Vector3(x, y, z);
for (const [id, mantlet] of [['challenger1_mk2', 'mantlet_slot'], ['t90am', 'mantlet']]) {
  const { faces } = gunFaces(id);
  assert.ok(faces.length > 0, `${id}: forward faces lie over its ${mantlet}`);
  assert.ok(faces.every(({ face }) => face.plate.name === mantlet), `${id}: every face over its ${mantlet} reads it`);
  const spec = getSpec(id);
  const pivot = spec.armor.turretPivot;
  const { face } = faces.reduce((a, b) => (Math.abs(b.face.center[0]) < Math.abs(a.face.center[0]) ? b : a));
  const pose = tankPoseFromState({ pos: V(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
  // the face centre in hull space (turret yaw 0: the turret frame is the pivot's offset), then a level ray through it
  const [x, y] = [face.center[0] + pivot[0], face.center[1] + pivot[1]];
  const first = traceTank(V(x, y, 12), V(x, y, -12), pose, spec.armor).find((h) => h.kind === 'plate');
  assert.equal(first?.plate?.name, mantlet, `${id}: a level round at its gun face meets the ${mantlet} (${first?.plate?.name})`);
}
console.log(`gunFacePlates.selftest: ${faceCount} forward turret faces over the mantlets of ${vehicles} vehicles read their mantlet; `
  + 'the Challenger 1 Mk 2 and the T-90AM meet theirs face to face and through traceTank');
