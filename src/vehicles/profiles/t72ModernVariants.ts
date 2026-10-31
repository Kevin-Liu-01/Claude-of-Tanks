// Owner-directed family rebuilds on the detailed T-72 foundations (2026-09-30).
import {KIT} from './kit.ts';
import {buildT72B3MX} from './t72b3mX.ts';
import {addT72B3M2022Kit} from './t72b3m2022Kit.ts';
import {buildT72B3X} from './t72b3X.ts';
import {buildT72BUX} from './t72buX.ts';
import {attachedCage,eraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box}=KIT;

export function buildT72B3M2022(P:TankBuilderPort):void {
  buildT72B3MX(P,{cheekEra:false});addT72B3M2022Kit(P);
  P.hullG.userData.familyRebuild={donor:'t72b3m_2016',revision:3,features:['t72b3m-cast-turret','boxed-relikt-cheeks','anti-drone-canopy','engine-bay-slat','stern-slat']};
}
export function buildT72BU1989(P:TankBuilderPort):void {
  buildT72BUX(P);
  // Early-development receiver and rear service box distinguish the 1989 fit
  // while sharing the corrected casting and complete Kontakt chevrons.
  P.addEquipment('turretDetail',box(.29,.15,.24),.24,.72,-.67);
  P.addModuleVisual('optics','turretGlass',box(.20,.065,.012),.24,.73,-.543);
  strappedPack(P,'turret',[.16,.57,-1.60],[.58,.22,.32]);
  P.hullG.userData.familyRebuild={donor:'t72bu',revision:1};
}
export function buildJaguarModern(P:TankBuilderPort):void {
  buildT72B3X(P);
  // Polish upgrade: attached cheek receivers, panoramic sight, larger rear
  // electronics rack and enclosed stowage give the B3 foundation its own fit.
  for(const side of [-1,1]){
    for(let i=0;i<3;i++)eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,
      [side*(.67+i*.27),.34,1.50-i*.24],[.26,.14,.37],[.44,side*(.30+i*.22),0]);
    P.addEquipment('turretDetail',box(.26,.24,.56),side*1.20,.31,-.47,0,side*.15);
    P.addEquipment('turretDetail',box(.29,.028,.58),side*1.20,.445,-.47,0,side*.15);
  }
  supportedSensor(P,[.43,.99,-.34],.69);
  // 2026-10-19 (owner float sweep): the cage stood 0.19 m behind the turret and the pack 14 mm off the rear case; the
  // cage's top rails run on into the side cases and the pack sits against the case
  attachedCage(P,'turret',[0,.32,-2.04],1.98,.49,.70);
  strappedPack(P,'turret',[0,.38,-1.754],[1.15,.22,.35]);
  P.hullG.userData.familyRebuild={donor:'t72b3',revision:1,variant:'jaguar'};
}
