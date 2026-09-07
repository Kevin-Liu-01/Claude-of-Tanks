// Addition-scoped auxiliary collision data. Original fleet behavior and all
// source-bound ERA fields are deliberately outside these replacement helpers.
import type {FleetTankSpec} from './specContracts.ts';
import {applySourceXOtherAuxArmor} from './sourceXOtherAuxArmor.ts';
import {applySourceXWesternAuxArmor} from './sourceXWesternAuxArmor.ts';
import {applySourceXSovietAuxArmor} from './sourceXSovietAuxArmor.ts';

export function applySourceXAuxArmor(spec:FleetTankSpec,id:string):void {
  applySourceXOtherAuxArmor(spec,id);
  applySourceXWesternAuxArmor(spec,id);
  applySourceXSovietAuxArmor(spec,id);
}
