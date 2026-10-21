// garage r9 (criterion 16) near-facility receipt: within 25 m of the turntable the Garages that rebuilt their facility's
// primitives as kit geometry keep at most a fifth of the instanced boxes and cylinders larger than 0.25 m that they drew
// before (the audit tree 16aeab482's census, pinned below), within their triangle and draw budgets, with no part left
// unsupported.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';

// near (<= 25 m of the turntable) facility primitive instances over 0.25 m before the rebuild, and each pack's triangle target
const BEFORE = {
  badlands_recovery_yard: { near: 431, triangles: 68000 },
  alpine_service_cavern: { near: 608, triangles: 70000 },
  winter_repair_bunker: { near: 418, triangles: 68000 },
  monsoon_field_bay: { near: 590, triangles: 68000 },
};
const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), size = new THREE.Vector3();
const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
for (const [id, before] of Object.entries(BEFORE)) {
  const variant = GARAGE_VARIANTS.find((candidate) => candidate.id === id);
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  scene.updateMatrixWorld(true);
  let near = 0;
  scene.traverse((object) => {
    if (!object.isInstancedMesh || !/^garage_facility_/.test(object.name)) return;
    object.geometry.computeBoundingBox();
    object.geometry.boundingBox.getSize(size);
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      world.multiplyMatrices(object.matrixWorld, matrix).decompose(position, quaternion, scale);
      const extent = Math.max(Math.abs(scale.x) * size.x, Math.abs(scale.y) * size.y, Math.abs(scale.z) * size.z);
      if (extent > 0.25 && Math.hypot(position.x, position.z) <= 25) near += 1;
    }
  });
  assert.ok(near <= before.near * 0.2, `${id}: ${near} near facility primitives, at most ${Math.floor(before.near * 0.2)} (80 % under ${before.near})`);
  assert.ok(stats.triangles <= before.triangles, `${id}: ${stats.triangles} triangles (target ${before.triangles})`);
  assert.ok(stats.drawCalls <= 24, `${id}: ${stats.drawCalls} draws`);
  assert.equal(stats.unsupportedParts ?? 0, 0, `${id}: no unsupported parts`);
}
controller.dispose();
console.log('garageFacilityNear.selftest: the near facility rebuilt as kit geometry in Redrock, Glacier, Frosthollow and Monsoon');
