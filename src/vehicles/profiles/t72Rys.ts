import {buildT80UX} from './t80uX.ts';
import {KIT} from './kit.ts';
import {attachedCage,cheekEraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export function buildT72Rys(P:TankBuilderPort):void {
  buildT80UX(P);
  for(const side of [-1,1]){
    for(let i=0;i<3;i++)cheekEraCassette(P,`turret_era_${side<0?'L':'R'}`,
      [side*(.69+i*.27),.35,1.38-i*.22],[.25,.13,.38]);
    P.addEquipment('turretDetail',KIT.box(.24,.24,.58),side*1.23,.30,-.54);
    P.addEquipment('turretDetail',KIT.box(.27,.027,.61),side*1.23,.431,-.54);
  }
  supportedSensor(P,[.32,.91,-.51],.60);
  attachedCage(P,'turret',[0,.26,-2.01],2.02,.45,.43);
  strappedPack(P,'turret',[0,.36,-1.75],[1.03,.23,.32]);
  P.hullG.userData.familyRebuild={donor:'t80u_x',revision:1,variant:'polish-rys-concept'};
}
