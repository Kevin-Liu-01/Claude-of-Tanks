// The T-90MS obr. 2011 (`t90ms_2011`): its own fittings on the T-90MS Tagil source build without its Shtora eyes (t90msX.ts). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The kit is the REA-2011 show prototype's fit: laser-warning heads in the empty front housings, a closed bustle bin
// set with the wading snorkel stowed on it, rubber flaps under the stern screens and at the bow, caged headlights.
import type * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {beamBetween,type Point3} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import {T90MS_X_SOURCE_DATUMS} from '../t90msXArmor.ts';

const PIVOT=T90MS_X_SOURCE_DATUMS.turretPivot;
const {box,cylX,cylY,cylZ,sph}=KIT;
/** Turret stock authored in the source build's hull frame, moved into the turret rig frame. */
function onTurret(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-PIVOT[0],y-PIVOT[1],z-PIVOT[2]);
}
const bar=(P:TankBuilderPort,a:Point3,b:Point3,r=.008):void=>P.addEquipment('hullDetail',beamBetween(a,b,r,8));

function warningHeads(P:TankBuilderPort):void{
  // Laser-warning receiver heads fill the two front housings the Shtora eyes left blank (the 2011 tank carried no
  // Shtora, only the warning receivers): a twin-aperture head on each housing face (z 1.8526) and a sensor dome on its crown.
  for(const side of [-1,1]){
    const x=side*.6735;
    onTurret(P,'turretDetail',box(.27,.15,.018),x,2.072,1.8606);
    for(const dx of [-.065,.065]){
      onTurret(P,'turretDark',cylZ(.040,.034,16),x+dx,2.072,1.8846);
      onTurret(P,'turretGlass',cylZ(.029,.006,16),x+dx,2.072,1.9036);
    }
    onTurret(P,'turretDetail',cylY(.05,.06,.03,16),x,2.2174,1.70);
    onTurret(P,'turretGlass',sph(.046,12,Math.PI/2),x,2.2304,1.70);
  }
}

function bustleBins(P:TankBuilderPort):void{
  // Closed sheet-metal bins fill the rear bustle basket (the source build's open rails), as on the show tank: a floor
  // tray from the bustle's rear plate (z -2.544) to the bottom rail (y 1.839), three lidded bins between its two
  // dividers, standing 130 mm over the top rail so the bustle reads as a closed box from the side and rear.
  onTurret(P,'turretDetail',box(1.70,.018,.352),.003,1.827,-2.72);
  for(const[l,r]of [[-.842,-.260],[-.233,.215],[.240,.842]]){
    const w=r-l,x=(l+r)/2;
    onTurret(P,'turretDetail',box(w,.40,.340),x,2.036,-2.715);
    onTurret(P,'turretDetail',box(w+.004,.014,.352),x,2.243,-2.715);
    for(const y of [1.93,2.15])onTurret(P,'turretDetail',box(w-.08,.02,.008),x,y,-2.888);
    for(const dx of [-w*.3,w*.3]){
      onTurret(P,'turretDark',box(.036,.055,.010),x+dx,2.20,-2.888);
      onTurret(P,'turretDark',cylX(.011,.09,8),x+dx,2.25,-2.548);
    }
  }
}

function wadingSnorkel(P:TankBuilderPort):void{
  // The OPVT deep-wading snorkel tube, stowed across the bin lids (top y 2.25) on two saddles and straps (the T-72/T-90
  // line carries it on the turret rear); its joint flange and rolled ends stand proud of the tube.
  const y=2.355,z=-2.715;
  onTurret(P,'turretDetail',cylX(.095,1.30,16),0,y,z);
  for(const x of [-.638,.638])onTurret(P,'turretDetail',cylX(.099,.024,16),x,y,z);
  onTurret(P,'turretDetail',cylX(.104,.022,16),.05,y,z);
  for(const x of [-.42,.42]){
    onTurret(P,'turretDetail',box(.08,.014,.17),x,2.256,z);
    onTurret(P,'turretDark',cylX(.0975,.03,16),x,y,z);
  }
}

function sternFlaps(P:TankBuilderPort):void{
  // Segmented rubber flaps carry the side curtain's hem (y .437) back to the stern under the slat screens: four
  // segments hung 30 mm up behind the screens' inner hanging sheet, whose lower edge climbs from y .52 (z -1.005) to
  // 1.01 (z -3.04); they hang inboard of it and outboard of the track (x 1.68).
  const hem=.44,edge=(z:number)=>.5205-(z+1.00495)*.2414;
  for(const side of [-1,1]){
    const face=side>0?1.7657:1.77635,l=Math.min(side*face,side*(face-.016)),r=Math.max(side*face,side*(face-.016));
    for(let i=0;i<4;i++){
      const z1=-1.012-i*.508,z0=z1-.498;
      P.addEquipment('hullRubber',sectionSolid([z0,z1].map(z=>({z,ring:[[l,hem],[r,hem],[r,edge(z)+.03],[l,edge(z)+.03]] as Array<readonly[number,number]>}))));
    }
  }
}

function bowFlaps(P:TankBuilderPort):void{
  // Rubber mud flaps hung from the front fender tips (underside y .793 at z 3.668), as the T-72/T-90 line's front
  // fenders carry, under a steel clamp strip; they hang ahead of the idler's track wrap (z 3.44).
  for(const side of [-1,1]){
    P.addEquipment('hullRubber',box(.74,.26,.016),side*1.374,.67,3.668);
    P.addEquipment('hullDark',box(.76,.036,.022),side*1.374,.79,3.668);
  }
}

function headlightGuards(P:TankBuilderPort):void{
  // Bent-bar guards caged in front of the headlights (lens face z 2.913): a front grille standing on the glacis sheet
  // (y 1.034 at z 2.945), tied back to the source build's two side bars above the lamp.
  const zf=2.945,armY=1.19,armZ=2.874-(armY-1.015)*.6261;
  for(const side of [-1,1]){
    const x=side*.774;
    for(const dx of [-.0856,.0856]){
      bar(P,[x+dx,1.034,zf],[x+dx,armY,zf]);
      bar(P,[x+dx*1.087,armY,armZ],[x+dx,armY,zf]);
    }
    for(const y of [1.075,1.11,1.145,armY])bar(P,[x-.0856,y,zf],[x+.0856,y,zf],.006);
  }
}

export function addT90MarkMS2011Kit(P:TankBuilderPort):void{
  warningHeads(P);bustleBins(P);wadingSnorkel(P);sternFlaps(P);bowFlaps(P);headlightGuards(P);
}
