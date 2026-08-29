export type Vec3Tuple = [number, number, number];
export type VehicleAssemblyOwner = 'hull' | 'turret';

export interface TransformObjectPort {
  readonly position: { set(x: number, y: number, z: number): unknown };
  readonly rotation: { set(x: number, y: number, z: number): unknown };
}

export interface AssemblyGroupPort {
  add(object: TransformObjectPort): unknown;
}

/** Shared structural port for authored procedural profile adapters. It
 * describes assembly ownership and transform operations without coupling the
 * profiles to the large legacy TankBuilder implementation. */
export interface ProceduralBuilderPort {
  readonly hullG: AssemblyGroupPort;
  readonly turretG: AssemblyGroupPort;
  readonly mats: unknown;
  topY?: number;
  add(slot: string, geometry: unknown, ...transform: number[]): unknown;
  addGunExtra(geometry: unknown, ...transform: number[]): unknown;
  addGunExtraDark(geometry: unknown, ...transform: number[]): unknown;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    yaw: number,
  ): unknown;
}
