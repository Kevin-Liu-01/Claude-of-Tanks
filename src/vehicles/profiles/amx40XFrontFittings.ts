// First-party folded metal and lamp primitives. Source scalar stations are
// authoring measurements only; no imported mesh topology enters this builder.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {blindTube} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylZ}=KIT;
function add(P:TankBuilderPort,g:THREE.BufferGeometry,x=0,y=0,z=0,slot='hullDetail'):void {
  P.addEquipment(slot,g,x,y,z);
}
function frontFold(P:TankBuilderPort,side:number):void {
  // Stations describe the bent apron, not a hanging vertical rectangle.
  // The outer end rolls forward less than the inner end, retaining the
  // transverse twist measured on the6–8mm source sheet.
  const rows=[
    [1.0583,1.033,3.414,3.389],
    [1.1000,1.026,3.4136,3.3801],
    [1.1500,1.019,3.3994,3.3662],
    [1.2000,1.006,3.3775,3.3530],
    [1.2500,.995,3.3325,3.3223],
    [1.2775,.989,3.2850,3.2784],
    [1.3000,.982,3.2244,3.2240],
  ];
  const sections=rows.map(([y,inner,zInner,zOuter])=>({z:y,ring:[
    [side*inner,-zInner],[side*1.596,-zOuter],[side*1.596,-zOuter+.007],[side*inner,-zInner+.007],
  ] as Array<readonly[number,number]>}));
  if(side<0)for(const row of sections)row.ring.reverse();
  const shape=sectionSolid(sections).rotateX(-Math.PI/2);
  // A one-millimetre overlap at the root joins the roof course. The front
  // remains a sheet with genuine air between apron and idler.
  P.addMudguard('amx40-x-front-fold','hullRubber',shape);
  add(P,box(.613,.012,.072),side*1.287,1.295,3.199);
}
function lampGuard(P:TankBuilderPort,side:number):void {
  const left=side<0,cx=left?-1.299:1.3076,base=left?1.296:1.2995;
  const rear=left?3.134:3.138,front=left?3.2178:3.2237;
  add(P,box(.506,.008,.245),side*1.297,base,3.102);
  // Separate bent roofs above the round headlamp and rectangular marker;
  // the lamp mouth and the inter-lamp space are not a filled armor block.
  const roof=sectionSolid([
    {z:3.016,ring:[[cx-.102,1.378],[cx+.102,1.378],[cx+.102,1.388],[cx-.102,1.388]]},
    {z:rear,ring:[[cx-.102,1.488],[cx+.102,1.488],[cx+.102,1.498],[cx-.102,1.498]]},
    {z:front,ring:[[cx-.102,1.488],[cx+.102,1.488],[cx+.102,1.498],[cx-.102,1.498]]},
  ]);
  add(P,roof);
  for(const x of [side*1.209,side*1.551])add(P,box(.009,.135,front-rear+.10),x,base+.065,(rear+front)/2-.050);
  const mx=left?-1.464:1.4707,markerRoof=left?1.438:1.4263;
  add(P,box(.137,.009,.142),mx,markerRoof,front-.071);
  add(P,box(.18,.132,.012),cx,1.388,3.124);
}
function lamps(P:TankBuilderPort,side:number):void {
  const left=side<0,cx=left?-1.2988:1.3076,cy=left?1.399:1.3951;
  const z0=left?3.0772:3.085,front=left?3.2139:3.2217;
  add(P,blindTube(.0879,.0701,front-z0,.013,32),cx,cy,(front+z0)/2,'hullDark');
  add(P,cylZ(.0679,.003,32),cx,cy,front-.007,'hullGlass');
  const mx=left?-1.4629:1.4697,my=left?1.36285:1.358,mz=left?3.177:3.1846;
  add(P,box(.151,.115,.067),mx,my,mz,'hullDark');
  add(P,box(.117,.083,.003),mx,my,mz+.034,'hullGlass');
}
function mountingWeb(x:number):THREE.BufferGeometry {
  // Six 29.8mm longitudinal webs, with a real transverse pin bore. Their
  // front follows three measured bend planes, not a thick fascia block.
  const front=(y:number):number=>y<.74?(1.141074+.828202*y)/.560430:
    y<.914?(2.075055+.594063*y)/.804419:(3.307974-.067542*y)/.997716;
  const ys=[.6133,.66,.70,.74,.80,.87,.914,1.04];
  const shape=new THREE.Shape();
  shape.moveTo(-2.806,.591);
  for(const y of ys)shape.lineTo(-front(y),y);
  shape.lineTo(-3.188,1.04);
  shape.lineTo(-3.164,.924);
  shape.closePath();
  const hole=new THREE.Path();hole.absellipse(-3.0987,.7681,.0186,.0186,0,Math.PI*2,true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape,{depth:.0298,bevelEnabled:false,curveSegments:16,steps:1})
    .rotateY(Math.PI/2).translate(x-.0149,0,0);
}
function mountingCrossbar(P:TankBuilderPort):void {
  // Bent 12mm channel: narrow bottom flange and sloping upright. The space
  // behind the upright and between its six webs remains open.
  const shape=new THREE.Shape();
  for(const [i,[z,y]]of [[3.1866,1.041],[3.255,1.032],[3.257,1.044],
    [3.214,1.05],[3.237,1.188],[3.225,1.190],[3.202,1.052],[3.188,1.053]].entries()) {
    if(i===0)shape.moveTo(-z,y);else shape.lineTo(-z,y);
  }
  shape.closePath();
  add(P,new THREE.ExtrudeGeometry(shape,{depth:1.8798,bevelEnabled:false,steps:1})
    .rotateY(Math.PI/2).translate(-.9399,0,0));
  for(const x of [-.7781,-.3384,-.1722,.1722,.3384,.7781])add(P,mountingWeb(x));
}
export function addAmx40FrontFittings(P:TankBuilderPort):void {
  for(const side of [-1,1]){frontFold(P,side);lampGuard(P,side);lamps(P,side);}
  mountingCrossbar(P);
}
