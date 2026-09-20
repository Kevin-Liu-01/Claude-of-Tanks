import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, TANK_SPECS } from './specs.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { SURFACE_MARKING_STYLE as STYLE, vehicleMarkingIncludesPermanentHullArmor } from './vehicleMarkings.ts';
import { createTankState } from '../sim/movement.ts';

const ids = ['ztz100_prototype', 'object695_x'];
const results = [];
assert.deepEqual(ALL_TANK_IDS.filter(vehicleMarkingIncludesPermanentHullArmor), ['object695_x'],
  'unrelated vehicles retain their original permanent-surface eligibility');
assert.equal(vehicleMarkingIncludesPermanentHullArmor('unknown'), false);
assert.equal(vehicleMarkingIncludesPermanentHullArmor(null), false);
const physical = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function visible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

function marksOf(root) {
  const marks = [];
  root.traverse(object => {
    if (object.userData.vehicleMarking && visible(object)
        && ['insignia', 'designation'].includes(object.userData.markingKind)) marks.push(object);
  });
  return marks;
}

function checkPaint(root, id, fullSceneVisibility = true) {
  const owner = id === 'object695_x' ? 'hull' : 'turret';
  const receiver = owner === 'hull' ? 'hullExternalArmor' : 'turret';
  const marks = marksOf(root), surfaces = [];
  assert.deepEqual(marks.map(mark => mark.userData.markingKind).sort(), ['designation', 'insignia']);
  root.traverseVisible(object => {
    if (object.isMesh && !object.userData.vehicleMarking && !object.userData.shadowOnly) surfaces.push(object);
  });
  for (const mark of marks) {
    assert.equal(mark.parent.name, `rig_${owner}`, 'paint belongs to its actual receiving armor owner');
    assert.equal(mark.userData.surfaceOwner, owner);
    assert.equal(mark.userData.surfaceMesh, receiver);
    assert.equal(mark.userData.surfaceSupported, true);
    assert.equal(mark.userData.visibilityClearSamples, STYLE.visibilitySampleCount);
    assert.ok(Number.isFinite(mark.userData.maximumSurfaceErrorM));
    assert.ok(mark.userData.maximumSurfaceErrorM <= STYLE.visibilityToleranceM);
    assert.ok(mark.scale.x >= STYLE.minimumReadableSizeM);
    const quaternion = mark.getWorldQuaternion(new THREE.Quaternion());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const tangent = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const bitangent = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const center = mark.getWorldPosition(new THREE.Vector3());
    for (const u of [-.28, 0, .28]) for (const v of [-.28, 0, .28]) {
      const point = center.clone().addScaledVector(tangent, u * mark.scale.x)
        .addScaledVector(bitangent, v * mark.scale.x);
      // Full neutral viewing rays detect occlusion. At a rotated azimuth,
      // fixed hull fittings may legitimately hide turret paint; short rays
      // still require every sample to remain seated on its actual armor.
      const reach = fullSceneVisibility ? 8 : .03;
      const ray = new THREE.Raycaster(point.clone().addScaledVector(normal, reach),
        normal.clone().negate(), 0, reach + STYLE.surfaceLiftM + STYLE.visibilityToleranceM);
      const hit = ray.intersectObjects(surfaces, false).find(row => visible(row.object));
      assert.ok(hit, 'every ink footprint sample has actual receiving stock');
      assert.equal(hit.object.name, receiver, 'whole-scene first hit is permanent authored armor, not fill or a rack');
      const offset = hit.distance - reach - STYLE.surfaceLiftM;
      assert.ok(offset >= -STYLE.visibilityOcclusionToleranceM && offset <= STYLE.visibilityToleranceM,
        `actual marking support/visibility: ${offset}`);
    }
  }
  const [a, b] = marks;
  const required = (a.scale.x + b.scale.x) * .55 + STYLE.minimumSeparationM;
  assert.ok(a.position.distanceTo(b.position) >= required, 'distinct insignia and number do not overlap');
  return marks;
}

await ensureInteriorFills(ids);
try {
  for (const id of ids) for (const quality of ['high', 'low']) {
    // Geometry receipts deliberately run the authoritative solver. Defer
    // batching so each marking retains its semantic mesh and owner for rays.
    const tank = createTank(id, null, { quality, proceduralOnly: true,
      geometryReceipt: true, deferStaticBatch: true });
    const materials = new Map();
    try {
      tank.root.traverse(object => {
        if (object.isLOD) { object.autoUpdate = false; object.levels.forEach((level, i) => { level.object.visible = i === 0; }); }
        if (object.isMesh) { materials.set(object, object.material); object.material = physical; }
      });
      assert.equal(tank.root.userData.markingSeatPath, 'surface-solver');
      const spec = TANK_SPECS[id], state = createTankState(spec, new THREE.Vector3(), 0);
      let poses = 0;
      for (const yaw of [-90, 0, 90]) for (const pitch of [-spec.gunDepressionDeg, 0, spec.gunElevationDeg]) {
        state.turretYaw = yaw * Math.PI / 180; state.gunPitch = pitch * Math.PI / 180;
        tank.syncFromState(state, 1); tank.root.updateMatrixWorld(true);
        checkPaint(tank.root, id, yaw === 0); poses++;
      }
      state.turretYaw = 0; state.gunPitch = 0;
      tank.syncFromState(state, 1); tank.root.updateMatrixWorld(true);
      const marks = checkPaint(tank.root, id), first = marks[0];
      const oldPosition = first.position.clone(), normal = new THREE.Vector3(0, 0, 1).applyQuaternion(first.quaternion);
      first.position.addScaledVector(normal, .12); tank.root.updateMatrixWorld(true);
      assert.throws(() => checkPaint(tank.root, id), assert.AssertionError, 'floating paint fails real support rays');
      first.position.copy(oldPosition); first.visible = false;
      assert.throws(() => checkPaint(tank.root, id), assert.AssertionError, 'missing insignia cannot pass');
      first.visible = true;
      const owner = first.parent;
      tank.root.getObjectByName(owner.name === 'rig_hull' ? 'rig_turret' : 'rig_hull').attach(first); tank.root.updateMatrixWorld(true);
      assert.throws(() => checkPaint(tank.root, id), assert.AssertionError, 'wrong articulation owner fails');
      owner.attach(first); tank.root.updateMatrixWorld(true); checkPaint(tank.root, id);
      const armor = tank.root.getObjectByName(id === 'object695_x' ? 'hullExternalArmor' : 'turret');
      armor.visible = false;
      assert.throws(() => checkPaint(tank.root, id), assert.AssertionError, 'air without its actual receiving armor fails');
      armor.visible = true; checkPaint(tank.root, id);
      results.push({ id, quality, poses, fullSceneVisibilityPoses: 3, negatives: 4, marks: marks.map(mark => ({
        kind: mark.userData.markingKind, position: mark.position.toArray(), size: mark.scale.x,
        clear: mark.userData.visibilityClearSamples, maximumSurfaceErrorM: mark.userData.maximumSurfaceErrorM,
      })) });
    } finally {
      for (const [mesh, material] of materials) mesh.material = material;
      tank.dispose();
    }
  }
} finally { physical.dispose(); }
console.log('missileConceptMarkings: HIGH/LOW full-scene paint support, visibility, separation, yaw/pitch and negatives PASS', JSON.stringify(results));
