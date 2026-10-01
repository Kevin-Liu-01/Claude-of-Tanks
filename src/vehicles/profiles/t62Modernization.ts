import {buildT62Obr1975} from './russia.ts';
import {KIT} from './kit.ts';
import {attachedCage,eraCassette,cheekEraCassette,glacisEraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box}=KIT;
export function buildT62MV1Modern(P:TankBuilderPort):void {
  buildT62Obr1975(P);
  // Retain the 1975 five-wheel chassis and organic casting; contact-mounted
  // reactive panels follow the cheeks instead of substituting a newer dome.
  for(const side of [-1,1]){
    for(let i=0;i<5;i++){
      const a=.36+i*.235;
      for(let row=0;row<2;row++){
        const y=.28+row*.19,r=1.43-row*.09;
        cheekEraCassette(P,`turret_era_${side<0?'L':'R'}`,
          [side*Math.sin(a)*r,y,Math.cos(a)*r],[.22,.10,.29]);
      }
    }
    for(let i=0;i<5;i++){
      const z=-1.85+i*.85;
      P.addEquipment('hullDetail',box(.13,.05,.70),side*1.65,1.35,z);
      eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*1.67,1.11,z],[.10,.43,.73],[0,0,side*.03]);
    }
    for(let i=0;i<4;i++)glacisEraCassette(P,`glacis_era_${side<0?'L':'R'}`,
      side*(.18+i*.30),2.39,[.27,.08,.41]);
  }
  supportedSensor(P,[-.43,1.04,.01],.85);
  attachedCage(P,'turret',[0,.23,-2.14],1.86,.42,.40);
  strappedPack(P,'turret',[0,.34,-1.92],[.96,.22,.28]);
  P.hullG.userData.familyRebuild={donor:'t62mv1',revision:1,features:['kontakt-cheeks','glacis-era','side-era','thermal','rear-cage']};
}
