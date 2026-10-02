// Owner-directed family rebuilds on the detailed T-72 foundations (2026-09-30).
import {KIT} from './kit.ts';
import {buildT72B3MXHull} from './t72b3mX.ts';
import {buildT72B3X} from './t72b3X.ts';
import {buildT90SMXTurret} from './t90X.ts';
import {addDonbasFieldCover} from './donbasFieldCover.ts';
import {buildT72BUX} from './t72buX.ts';
import {attachedCage,eraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylY}=KIT;

function addB3M2022HullProtection(P:TankBuilderPort):void {
  // Deep segmented Relikt side cassettes, with a second soft-case belt beneath.
  // They overlap the donor's mounting sheet, outside the articulated tracks.
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const z=-1.82+i*.77;
    eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*1.97,1.09,z], [.12,.47,.72],[0,0,-side*.04]);
    P.addEquipment('hullDetail',box(.14,.05,.59),side*1.97,1.35,z);
    strappedPack(P,'hull',[side*1.99,.728,z],[.11,.22,.69]);
  }
}
export function buildT72B3M2022Hull(P:TankBuilderPort):void {
  buildT72B3MXHull(P);addB3M2022HullProtection(P);
}
export function addB3M2022Protection(P:TankBuilderPort):void {
  addB3M2022HullProtection(P);
  // Smaller cheek infill leaves the mantlet and optical sight apertures clear.
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const x=side*(.60+i*.28),z=1.48-i*.20;
    eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,
      [x,1.90-P.turretG.position.y,z-P.turretG.position.z],[.245,.11,.25],[.47,side*(.2+i*.17),0]);
  }
  // The new thermal channel, separate command aerial and externally carried
  // field kit retain the modernization functions of the superseded model.
  supportedSensor(P,[.25,.91,-.54],.71);
  P.addEquipment('turretDetail',cylY(.06,.075,.11,12),.20,.76,-.92);
  P.addEquipment('turretDark',cylY(.009,.015,.78,10),.20,1.19,-.92);
  attachedCage(P,'turret',[0,.29,-2.02],2.14,.48,.48);
  strappedPack(P,'turret',[-.44,.41,-1.74],[.62,.24,.35]);
  strappedPack(P,'turret',[.42,.40,-1.74],[.60,.22,.35]);
  P.hullG.userData.familyRebuild={donor:'t72b3m_x',revision:1,features:['relikt-side','lower-soft-cases','cheek-infill','thermal-channel','rear-cage','field-kit']};
}
export function buildT72B3M2022(P:TankBuilderPort):void {
  buildT72B3M2022Hull(P);
  buildT90SMXTurret(P);
  P.turretG.position.set(.008,1.545,.114315);
  P.hullG.userData.familyRebuild={donor:'t72b3m_x',turret:'t90sm_x',revision:2,
    features:['welded-sm-turret','modular-cheeks','panoramic-sight','remote-weapon','bustle-stowage','relikt-side','lower-soft-cases']};
}
export function buildT72BU1989(P:TankBuilderPort):void {
  buildT72BUX(P);
  // Early-development receiver and rear service box distinguish the 1989 fit
  // while sharing the corrected casting and complete Kontakt chevrons.
  P.addEquipment('turretDetail',box(.29,.15,.24),.24,.72,-.67);
  P.addModuleVisual('optics','turretGlass',box(.20,.065,.012),.24,.73,-.543);
  strappedPack(P,'turret',[.16,.57,-1.60],[.58,.22,.32]);
  P.hullG.userData.familyRebuild={donor:'t72bu_x',revision:1};
}
export function buildT64Modern(P:TankBuilderPort,ukrainian=false):void {
  buildT72B3X(P);
  const sector=(s:number)=>`turret_era_${s<0?'L':'R'}`;
  // The requested B3 chassis/casting forms the structural base. National
  // modernization changes the cassette cadence and rear equipment layout.
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const a=.36+i*.24,x=side*(.64+i*.22),z=1.49-i*.22;
    for(let row=0;row<(ukrainian?2:1);row++)eraCassette(P,'turret',sector(side),
      [x,.37+row*.11,z-P.turretG.position.z],
      [ukrainian?.185:.26,.085,ukrainian?.20:.34],[.43,side*a,0]);
  }
  for(const side of [-1,1])for(let i=0;i<5;i++){
    const z=-1.9+i*.90;
    eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*1.80,1.12,z],[.095,.40,.78],[0,0,side*.03]);
    P.addEquipment('hullDetail',box(.15,.04,.72),side*1.76,1.34,z);
  }
  supportedSensor(P,[.40,.88,-.49],.66);
  attachedCage(P,'turret',[0,.31,-1.89],1.82,.46,.42);
  strappedPack(P,'turret',[ukrainian?-.38:.38,.39,-1.64],[.55,.24,.32]);
  if(ukrainian){
    // Two independent service bins and paired whips; no national markings
    // are borrowed from the donor's decal geometry.
    for(const side of [-1,1]){
      P.addEquipment('turretDetail',box(.28,.18,.30),side*.74,.41,-1.39);
      P.addEquipment('turretDark',cylY(.009,.013,.62,10),side*.74,.80,-1.39);
    }
  }
  if(ukrainian)addDonbasFieldCover(P);
  P.hullG.userData.familyRebuild={donor:'t72b3_x',revision:ukrainian?2:1,variant:ukrainian?'donbas':'bv1'};
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
  attachedCage(P,'turret',[0,.32,-2.04],1.98,.49,.50);
  strappedPack(P,'turret',[0,.38,-1.77],[1.15,.22,.35]);
  P.hullG.userData.familyRebuild={donor:'t72b3_x',revision:1,variant:'jaguar'};
}
