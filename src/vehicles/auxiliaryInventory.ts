import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
export interface AuxiliaryMount {
  owner: 'hull' | 'turret';
  position: readonly [number, number, number];
}
export interface AuxiliaryInventory {
  turretPivot?: readonly [number, number, number];
  smoke: readonly (AuxiliaryMount & { direction: readonly [number, number, number] })[];
  /** `yawArc` (VH.02): the station's traverse limits, mount-local radians [min, max] (unwrapped, containing 0), where
   * its barrel would otherwise sweep through stock beside it (another station, an antenna); absent = full circle.
   * `depressionByYaw`: [yaw, deepest clear depression] samples (radians, ascending yaw) where the roof under the barrel
   * allows less than the weapon's depression; between two samples the smaller holds, outside them the weapon's. */
  guns: readonly (AuxiliaryMount & { name: string; caliberMm: number; collisionParts?: readonly { min: readonly number[]; max: readonly number[] }[]; muzzle: readonly number[]; pivot: readonly number[]; rotation: readonly number[]; scale: readonly number[]; yawArc?: readonly [number, number]; depressionByYaw?: readonly (readonly [number, number])[] })[];
  lights: boolean;
}

export function auxiliaryCapabilities(spec: {id?:string}|null|undefined){return AUXILIARY_INVENTORY[spec?.id??''];}
