import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
export interface AuxiliaryMount {
  owner: 'hull' | 'turret';
  position: readonly [number, number, number];
}
export interface AuxiliaryInventory {
  smoke: readonly (AuxiliaryMount & { direction: readonly [number, number, number] })[];
  guns: readonly (AuxiliaryMount & { name: string; caliberMm: number; muzzle: readonly number[]; pivot: readonly number[]; rotation: readonly number[]; scale: readonly number[] })[];
  lights: boolean;
}

export function auxiliaryCapabilities(spec: {id?:string}|null|undefined){return AUXILIARY_INVENTORY[spec?.id??''];}
