// Independent scalar-authored AW T-90 equipment and removable side cassettes.
import * as THREE from 'three';
import { addShtoraEyes } from './shtora.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const YAW=T90_AW_X_SOURCE_DATUMS.turretPivot;
function sensorPart(P:TankBuilderPort,g:THREE.BufferGeometry):void{
  P.addEquipment('turretDetail',g,-YAW[0],-YAW[1],-YAW[2]);
}
function sensorRound(P:TankBuilderPort,rows:readonly(readonly[number,number])[],segments:number):void{
  const profile=[[0,rows[0][1]],...rows,[0,rows.at(-1)![1]]];
  sensorPart(P,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments).translate(.32815,0,-.81063));
}
function sensorHousing(P:TankBuilderPort,rows:readonly(readonly[number,number,number,number])[]):void{
  const g=sectionSolid(rows.map(([y,w,d,c])=>({z:y,ring:[[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],
    [w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c]] as const}))).rotateX(-Math.PI/2).translate(.32815,0,-.81063);
  sensorPart(P,g);
}
export function addT90AWMeteo(P:TankBuilderPort):void{
  // Source lower ten-sided stem is genuinely attached to the casting.
  sensorRound(P,[[.0303,2.12358],[.0303,2.47608]],10);
  sensorRound(P,[[.0361,2.47608],[.047,2.53278],[.047,2.58448]],12);
  sensorHousing(P,[[2.58448,.0938,.1851,.012],[2.59918,.0889,.1846,.012]]);
  // A one-millimetre original sheet separation is closed only at the central
  // bearing; the broad ledge is not extended up into its surrounding air.
  sensorRound(P,[[.025,2.59818],[.025,2.60118]],12);
  sensorHousing(P,[[2.60018,.093,.1866,.008],[2.65478,.093,.1866,.008]]);
  sensorHousing(P,[[2.65478,.0852,.1099,.005],[2.79548,.0852,.1099,.005],
    [2.82088,.0732,.0971,.005],[2.83648,.0732,.0732,.009]]);
  sensorRound(P,[[.0366,2.83648],[.0366,2.88238]],16);
  sensorRound(P,[[.04225,2.88238],[.04225,2.91068],[.019,2.96148],[.019,2.99178]],12);
  sensorHousing(P,[[2.98978,.0502,.1157,.012],[3.02008,.0502,.1157,.012],[3.04938,.0502,.0879,.012]]);
}

function sideCassette(P:TankBuilderPort,side:number,outer:number,inner:number,rim:number,low:number,z:number):void{
  const high=low+.5024,backLow=low+.0512,backHigh=high-.0455;
  P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
    P.addExternalArmor('hull',markEraHitFaces(KIT.box(outer-rim,.5024,.6352),[side,0,0]),side*(outer+rim)/2,(low+high)/2,z);
    P.addExternalArmor('hull',markEraFurniture(KIT.box(rim-inner,backHigh-backLow,.5401)),side*(rim+inner)/2,(backLow+backHigh)/2,z+.00145);
  });
  // Source narrow hinge leaves at each cassette end, not a solid backing slab.
  for(const dz of [-.27,.27]){
    P.addEquipment('hullDetail',KIT.box(.0781,.1651,.0137),side*1.8262,high-.16596,z+dz);
    P.addEquipment('hullDetail',KIT.box(.099,.018,.036),side*1.7815,high-.10031,z+dz);
  }
}
export function addT90AWSideEra(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const shift=side<0?0:-.0019;
    sideCassette(P,side,1.90889+shift,1.83349+shift,1.87009+shift,.92771,1.28103);
    sideCassette(P,side,1.90764+shift,1.83364+shift,1.86874+shift,.88095,1.95968);
    sideCassette(P,side,1.90670+shift,1.83130+shift,1.86780+shift,.82746,2.63516);
  }
}

export function addT90AWProjectors(P:TankBuilderPort):void{
  addShtoraEyes({ mats: P.mats, turretG: P.turretG,
    add: (slot, geometry, x, y, z) => P.addEquipment(slot, geometry, x, y, z),
  }, { x: .8772, y: 1.77158, z: 1.55, scale: 1.35, round: true, kit: true,
    offset: [-YAW[0] - .0012, -YAW[1], -YAW[2]] });
  // Source rear mounting plates retain their seats and meet the new chassis.
  for (const x of [.876, -.8784]) {
    sensorPart(P,KIT.box(.352,.241,.028).translate(x,1.769,1.376));
    sensorPart(P,KIT.box(.19,.12,.25).translate(x,1.70,1.385));
  }
}

export function addT90AWRearCases(P:TankBuilderPort):void{
  const right=[[1.0943,1.63428],[1.4508,1.63428],[1.681925,1.8817],[1.681925,2.05748],[1.09635,2.05748]] as const;
  const left=[[-1.3552,1.64248],[-1.132,1.64248],[-1.132,2.05848],[-1.5238,2.05848],[-1.5238,1.9219]] as const;
  for(const[ring,z0,z1,yaw]of [[right,-.5553,.2764,.43814],[left,-.3384,.3465,-.617994]] as const){
    sensorPart(P,sectionSolid([{z:z0,ring},{z:z1,ring}]).rotateY(yaw));
  }
  sensorPart(P,KIT.box(.55801,.008,.808892).translate(1.389752,2.06173,-.139428).rotateY(.43814));
  sensorPart(P,KIT.box(.358626,.016,.65259).translate(-1.328951,2.05548,.003455).rotateY(-.617994));
  raisedLid(P,1.31055,-.67953,.263,.520,.43814,[-.00232900933,.99998508862,-.00493945813],-2.08745177115);
  raisedLid(P,-1.1362,-.76133,.220,.515,-.617994,[.00330494113,.99998380662,-.00463291030],-2.08547021955);
  // Separate source transverse tubular carrier below the cases. Source
  // cross-sections over its broad span are circular (~39.55mm radius), not a
  // low solid rear case wall. Local end fittings are a fine approximation.
  sensorPart(P,KIT.cylX(.03955,1.9394,24).translate(.20805,1.6671,-1.24028));
  sensorPart(P,KIT.torus(.052,.009,24,8).rotateZ(Math.PI/2).translate(.81,1.66718,-1.23938));
}
function raisedLid(P:TankBuilderPort,x:number,z:number,w:number,d:number,yaw:number,n:readonly[number,number,number],offset:number):void{
  const g=KIT.box(w,.026,d).rotateY(yaw).translate(x,0,z);
  const matrix=new THREE.Matrix4().set(1,0,0,0,-n[0]/n[1],1,-n[2]/n[1],-offset/n[1]-.013,0,0,1,0,0,0,0,1);
  sensorPart(P,g.applyMatrix4(matrix));
}
