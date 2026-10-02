import {buildT62Obr1975Chassis} from './russia.ts';
import {buildT72B1987XTurret} from './t72b1987X.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {KIT} from './kit.ts';
import {attachedCage,eraCassette,glacisEraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box}=KIT;
export function buildT62MV1Modern(P:TankBuilderPort):void {
  buildT62Obr1975Chassis(P);
  buildT72B1987XTurret(P);
  P.turretG.position.set(0,1.4804,.676);
  // The complete 1987 turret retains its Kontakt bank and gun articulation.
  for(const side of [-1,1]){
    for(let i=0;i<5;i++){
      const z=-1.85+i*.85;
      P.addEquipment('hullDetail',box(.13,.05,.70),side*1.65,1.35,z);
      eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*1.67,1.11,z],[.10,.43,.73],[0,0,side*.03]);
    }
    for(let i=0;i<4;i++)glacisEraCassette(P,`glacis_era_${side<0?'L':'R'}`,
      side*(.18+i*.30),2.39,[.27,.08,.41]);
  }
  supportedSensor(P,[-.43,1.04,.01],.675);
  attachedCage(P,'turret',[0,.23,-2.14],1.86,.42,.40);
  for(const side of [-1,1])P.addEquipment('turretDetail',beamBetween([side*.6696,.083,-1.74],[side*.30,.25,-1.62],.028));
  strappedPack(P,'turret',[0,.34,-1.92],[.96,.22,.28]);
  P.hullG.userData.familyRebuild={donor:'t62mv1',turret:'t72b_1987_x',revision:2,features:['kontakt-cheeks','glacis-era','side-era','thermal','rear-cage']};
}
