// Narrow mesh vocabulary shared by the tank factory core and the geometry
// receipts split out of it in round 46 (docs/CLEANUP-2026-09-22.md §4.4).
import * as THREE from 'three';

export type VehicleMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
export type VehicleInstancedMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
export function isVehicleMesh(object: THREE.Object3D): object is VehicleMesh {
  return 'isMesh' in object && object.isMesh === true;
}

export function isVehicleInstancedMesh(object: THREE.Object3D): object is VehicleInstancedMesh {
  return 'isInstancedMesh' in object && object.isInstancedMesh === true;
}

/** A BatchedMesh is also isMesh, but its shared buffer is origin-local: each instance draws one geometry range
 * through its own matrix, so it must never be read as a plain mesh. */
export function isVehicleBatchedMesh(object: THREE.Object3D): object is THREE.BatchedMesh {
  return 'isBatchedMesh' in object && object.isBatchedMesh === true;
}
