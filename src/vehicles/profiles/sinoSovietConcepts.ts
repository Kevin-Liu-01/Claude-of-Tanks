import {addRearFieldStowage} from './rearFieldStowage.ts';
// Owner-requested Chinese concept family: Russian running gear and hulls with
// Type 96B-derived welded turrets. These are game designs, not historical models.
import {KIT} from './kit.ts';
import {boxSections} from './measuredPrimitives.ts';
import {buildT72B3XHull} from './t72b3X.ts';
import {buildT80UXHull} from './t80uX.ts';
import {buildT72B3MXHull} from './t72b3mX.ts';
import {buildType96Turret} from './type96bX.ts';
import {EASTERN_SOURCE_STUDIES} from '../easternSourceStudyData.ts';
import {attachedCage,cheekEraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylY}=KIT;
type Variant='long'|'feng'|'lei';
function build(P:TankBuilderPort,variant:Variant):void {
  const frame=EASTERN_SOURCE_STUDIES.type96b_x.frame;
  if(variant==='feng')buildT80UXHull(P);
  else if(variant==='lei')buildT72B3MXHull(P);
  else buildT72B3XHull(P);
  // The turret stays in its authored local frame. Translate its whole ring
  // onto the donor deck, including the main-gun pivot and all fittings.
  const y=variant==='long'?1.475:variant==='feng'?1.565:1.545;
  const z=variant==='feng'?.07187:variant==='lei'?.114315:.065591;
  P.turretG.position.set(...frame.turret);
  P.gunG.position.set(frame.gun[0]-frame.turret[0],frame.gun[1]-frame.turret[1],frame.gun[2]-frame.turret[2]);
  buildType96Turret(P);
  P.turretG.position.set(frame.turret[0],y,z);
  P.add('turret',cylY(1.05,1.08,.09,40),0,.02,0);
  if(variant==='long'){
    // Low wedge cheeks and a compact bustle: close to the T-72 silhouette.
    for(const side of [-1,1])for(let i=0;i<3;i++)cheekEraCassette(P,`turret_era_${side<0?'L':'R'}`,
      [side*(.67+i*.25),.32,1.38-i*.23],[.23,.11,.36]);
    attachedCage(P,'turret',[0,.27,-1.93],1.80,.42,.40);
    strappedPack(P,'turret',[0,.36,-1.69],[.94,.20,.28]);
  }else if(variant==='feng'){
    // Wider, sharply clipped bolted shoulders suit the turbine hull. A
    // separate rear observation mast leaves the original sights unobscured.
    for(const side of [-1,1]){
      const cheek=boxSections([[.14,.29,.48,.04],[.84,.34,.40,.02],[1.47,.13,.16,.02]]).translate(side*1.12,0,0);
      P.addExternalArmor('turret',cheek);
      for(let i=0;i<3;i++)P.addEquipment('turretDetail',box(.04,.035,.27),side*1.29,.48,.23+i*.30);
      P.addEquipment('turretDetail',box(.28,.28,.56),side*1.27,.21,-.53);
    }
    supportedSensor(P,[.30,.98,-.77],.65);
    attachedCage(P,'turret',[0,.24,-2.07],2.12,.48,.44);
  }else{
    // Extended equipment bustle, paired warning receivers, roof protection
    // leaves and large side cassette banks mark the heavier command variant.
    P.add('turret',boxSections([[-2.26,1.05,.50,.07],[-1.98,1.28,.57,.04],[-1.02,1.14,.57,.06]]));
    for(const side of [-1,1]){
      for(let i=0;i<4;i++)cheekEraCassette(P,`turret_era_${side<0?'L':'R'}`,
        [side*(.62+i*.24),.35,1.47-i*.25],[.22,.16,.43]);
      P.addEquipment('turretDetail',box(.29,.16,.25),side*1.20,.60,-1.54);
      P.addEquipment('turretGlass',box(.15,.06,.012),side*1.20,.61,-1.407);
      strappedPack(P,'turret',[side*.69,.67,-1.68],[.46,.17,.68]);
    }
    attachedCage(P,'turret',[0,.26,-2.56],2.35,.48,.32);
    supportedSensor(P,[-.22,.94,-1.13],.55);
  }
  if(variant==='feng')addRearFieldStowage(P);
  P.topY=3.016-frame.turret[1];
  P.hullG.userData.familyRebuild={donor:variant==='long'?'t72b3_x':variant==='feng'?'t80u_x':'t72b3m_x',turret:'type96b_x',variant,revision:1};
}
export const SINO_SOVIET_CONCEPT_PROFILES={
  type96_72_long:{build:(P:TankBuilderPort)=>build(P,'long')},
  type96_80_feng:{build:(P:TankBuilderPort)=>build(P,'feng')},
  type96_72m_lei:{build:(P:TankBuilderPort)=>build(P,'lei')},
} as const;
