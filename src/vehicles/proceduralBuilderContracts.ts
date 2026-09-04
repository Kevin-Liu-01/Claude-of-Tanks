import type { BufferGeometry, Group, Object3D } from 'three';

export type Vec3Tuple = [number, number, number];
export type VehicleAssemblyOwner = 'hull' | 'turret';

export type TransformObjectPort = Object3D;
export type AssemblyGroupPort = Group;

/** Shared structural port for authored procedural profile adapters. It
 * describes assembly ownership and transform operations without coupling the
 * profiles to the large legacy TankBuilder implementation. */
export interface ProceduralBuilderPort {
  readonly hullG: AssemblyGroupPort;
  readonly turretG: AssemblyGroupPort;
  readonly mats: object;
  topY?: number;
  add(slot: string, geometry: BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: BufferGeometry, ...transform: number[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    yaw: number,
  ): void;
}
