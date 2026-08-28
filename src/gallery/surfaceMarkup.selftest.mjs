import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coplanarPatch, faceCount, ownershipOf } from './surfaceMarkup.ts';

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0, 1, 0, 0, 1, 1, 0,
  0, 0, 0, 1, 1, 0, 0, 1, 0,
  1, 0, 0, 1, 0, 1, 1, 1, 0,
], 3));

assert.equal(faceCount(geometry), 3, 'triangle count follows the position buffer');
assert.deepEqual(coplanarPatch(geometry, 0, 5), [0, 1], 'connected coplanar triangles form one patch');
assert.deepEqual(coplanarPatch(geometry, 2, 5), [2], 'a perpendicular triangle remains outside the patch');

const hull = new THREE.Group();
hull.name = 'rig_hull';
const turret = new THREE.Group();
turret.name = 'rig_turret';
const gun = new THREE.Group();
gun.name = 'rig_gun';
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
hull.add(turret);
turret.add(gun);
gun.add(mesh);
assert.equal(ownershipOf(mesh), 'gun', 'nearest articulation owner wins');

geometry.dispose();
mesh.geometry.dispose();
mesh.material.dispose();

console.log('surfaceMarkup.selftest: patch grouping and rig ownership passed');
