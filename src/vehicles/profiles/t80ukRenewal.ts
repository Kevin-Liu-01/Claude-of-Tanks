import {buildT80UX} from './t80uX.ts';
import {KIT} from './kit.ts';
import {attachedCage,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylY}=KIT;
export function buildT80UK(P:TankBuilderPort):void {
  buildT80UX(P);
  // Command fit on the complete T-80U casting and turbine chassis.
  supportedSensor(P,[.27,.77,-.44],.55);
  for(const side of [-1,1]){
    P.addEquipment('turretDetail',box(.22,.14,.30),side*.67,.46,-1.04);
    P.addEquipment('turretDark',cylY(.01,.015,.96,12),side*.67,1.00,-1.04);
  }
  // Rear auxiliary-power case is bolted to the turbine deck beside the grille.
  P.addEquipment('hullDetail',box(.56,.23,.54),-1.15,1.70,-2.45);
  for(let i=0;i<6;i++)P.addEquipment('hullDark',box(.39,.012,.024),-1.15,1.823,-2.63+i*.07);
  attachedCage(P,'turret',[0,.22,-1.98],1.72,.38,.36);
  strappedPack(P,'turret',[0,.32,-1.77],[.90,.18,.29]);
  P.hullG.userData.familyRebuild={donor:'t80u_x',revision:1,variant:'command'};
}
