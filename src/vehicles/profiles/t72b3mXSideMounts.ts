// First-party closed stock from scalar source sections. The source's open
// channel between deck and side armor is intentional; there is no broad shelf.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type ReturnRow=readonly[z:number,inner:number,outer:number,bottom:number,top:number];
const LEFT_RETURN:readonly ReturnRow[]=[
  [-3.1499,1.7664,1.7855,1.34984,1.3904],[-3.10,1.7664,1.7902,1.35019,1.4336],
  [-3.02,1.7663,1.7940,1.35075,1.505],[-2.90,1.7663,1.7943,1.35158,1.5190],
  [-2.50,1.7660,1.7951,1.35533,1.5319],[-2.30,1.7659,1.7930,1.35723,1.5347],
  [-2.02,1.7657,1.7868,1.3599,1.5387],[-1.50,1.7654,1.7865,1.3645,1.53222],
  [.36,1.7643,1.7854,1.38105,1.53326],[.93,1.7639,1.7928,1.3861,1.5244],
  [1.60,1.7625,1.7855,1.3920,1.5119],[1.85,1.7624,1.7904,1.3940,1.4995],
  [2.35,1.7609,1.7828,1.3987,1.4645],[2.4041,1.7597,1.7808,1.39923,1.4608],
];
const RIGHT_RETURN:readonly ReturnRow[]=[
  [-3.12036,1.7652,1.7865,1.34984,1.39035],[-3.10,1.7652,1.7874,1.34998,1.4079],
  [-3.00,1.7653,1.7933,1.35068,1.4984],[-2.90,1.7653,1.79355,1.35138,1.5031],
  [-2.50,1.7656,1.79455,1.35413,1.5219],[-2.25764,1.7657,1.79515,1.35579,1.5333],
];

function mirroredRing(side:number,ring:readonly SectionPoint[]):SectionPoint[] {
  const result=ring.map(([x,y])=>[side*x,y] as const);
  return side<0?result.reverse():result;
}

function returnStock(P:TankBuilderPort,side:number,rows:readonly ReturnRow[],name:string):void {
  // The concealed inner3mm joins the unchanged deck; external source boundary
  // stays fixed. It is stock behind the narrow folded edge, not channel fill.
  const g=sectionSolid(rows.map(([z,i,o,b,t])=>({z,ring:mirroredRing(side,
    [[i-.003,b],[o,b],[o,t-.0004],[i-.003,t]])})));
  P.addEquipment('hullDetail',g);g.name=name;
}

function receivingEdges(P:TankBuilderPort,side:number):void {
  returnStock(P,side,side<0?LEFT_RETURN:RIGHT_RETURN,'t72b3mSourceOuterReturn');
  // Actual Object6 case outer walls and narrow deck edge. The right exhaust
  // interruption is retained; boxes above them and the native course stay put.
  const rows:readonly ReturnRow[]=[[-3.15,1.750,1.765,1.3184,1.402],
    [-1.43,1.751,1.766,1.3240,1.410],[-.50,1.752,1.7662,1.3270,1.41974],
    [1.0,1.753,1.7671,1.3370,1.43256],[2.35,1.754,1.7679,1.3593,1.44428],
    [2.923,1.754,1.7682,1.369,1.440]];
  if(side<0)returnStock(P,side,rows,'t72b3mSourceDeckEdge');
  else {
    returnStock(P,side,[rows[0],[-2.215,1.750,1.765,1.321,1.40457]],'t72b3mSourceDeckEdge');
    returnStock(P,side,rows.slice(1),'t72b3mSourceDeckEdge');
  }
  const spans:readonly(readonly[number,number,number,number])[]=side<0?
    [[-3.14,-2.30,1.34,1.532],[-2.25,-1.44,1.34,1.539],[-1.40,.36,1.345,1.533],
      [.38,1.695,1.353,1.519],[1.732,2.702,1.314,1.485]]:
    [[-3.142,-2.295,1.340,1.524],[-1.275,.376,1.3475,1.52125],
      [.381,1.695,1.3528,1.51913],[1.732,2.702,1.3137,1.48469]];
  for(const [a,b,low,top]of spans)P.addEquipment('hullDetail',KIT.box(.012,top-low,b-a),side*1.749,(low+top)/2,(a+b)/2);
}

const UPPER_Z=[-3.13632,-2.58136,-2.52904,-2.2460,-1.37103,-.81168,-.76675,-.20740,-.16112,
  .39824,.44104,1.00039,1.04750,1.60686,1.65377,2.21312,2.26040,2.74039] as const;

function upperLinks(P:TankBuilderPort,side:number):void {
  for(const z of UPPER_Z){
    const front=z>2.24,y=front?1.405785:1.45793;
    const inner=side>0?1.813628+.00061*z:1.818966-.00061*z,outer=inner+.157423;
    const station=z+(side<0?.002216:0);
    P.addEquipment('hullDetail',beamBetween([side*inner,y+.0008,station],
      [side*outer,y-.0008,station],.01422,6));
  }
  // Only the source's open rail fields between the major cassettes: five
  // narrow horizontal strips, never a solid plate behind their genuine air.
  for(const [a,b]of [[-2.559,-2.217],[-1.730,-1.389]]){
    for(const y of [1.32556,1.36966,1.41375,1.45785])
      P.addEquipment('hullDetail',KIT.box(.0118,.01327,b-a+.010),side>0?1.9629:-1.9669,y,(a+b)/2);
    P.addEquipment('hullDetail',KIT.box(.0213,.0310,b-a+.010),side>0?1.9556:-1.9637,1.51643,(a+b)/2);
  }
}

function foldedWeb(side:number,inner:number,z:number,rise:number):THREE.BufferGeometry {
  // The source bent strap is unthickened in places. A3mm concealed back makes
  // an original closed sheet while preserving the measured outer fold.
  const top:SectionPoint[]=[[inner,1.3783+rise],[inner+.0153,1.394187+rise],
    [inner+.058,1.3885+rise],[inner+.15815,z>2.3&&z<2.9?1.340062:1.338981+rise]];
  const ring=[...top.map(([x,y])=>[x,y-.003] as const),...top.slice().reverse()];
  return sectionSolid([z-.019442,z+.019442].map(s=>({z:s,ring:mirroredRing(side,ring)})));
}

function innerLug(side:number,inner:number,z:number,rise:number,width=.05579):THREE.BufferGeometry {
  const ring:SectionPoint[]=[[inner,1.340688+rise],[inner+width-.02079,1.3419+rise],
    [inner+width,1.3539+rise],[inner+width,1.3768+rise],
    [inner+width-.02079,1.3888+rise],[inner,1.390015+rise]];
  return sectionSolid([z-.067467,z+.067467].map(s=>({z:s,ring:mirroredRing(side,ring)})));
}

function outerEars(P:TankBuilderPort,side:number,x:number,z:number,rise=0):void {
  const ring:SectionPoint[]=[[x-.03043,1.314],[x-.024,1.298],[x-.012,1.29135],
    [x+.012,1.29135],[x+.0239,1.314],[x+.02403,1.346],[x+.019,1.362],
    [x+.008,1.374],[x-.003,1.377756],[x-.015,1.370],[x-.026,1.354],[x-.0304,1.340]];
  for(const dz of [-.02934,.02934])P.addEquipment('hullDetail',sectionSolid(
    [z+dz-.00453,z+dz+.00453].map(s=>({z:s,ring:mirroredRing(side,ring)}))),0,rise,0);
  P.addEquipment('hullDetail',KIT.cylZ(.01361,.06775,16),side*x,1.35630+rise,z);
}

function lowerJaw(side:number,inner:number,z:number):THREE.BufferGeometry {
  // Object6 lower clamp: a shallow inner lip and dropped, rounded outer jaw.
  // Independent sections show real air below the lip, not a filled80mm box.
  const x=inner+.07853,top=(u:number)=>1.349118-(u-x)*.13263;
  const stations=Array.from({length:17},(_,i)=>(i/16*2-1)*.06223);
  return sectionSolid(stations.map(dz=>{
    const outer=x+.0480+.032613*Math.sqrt(1-(Math.abs(dz)/.062268)**(1/.30));
    const ring:SectionPoint[]=[[x,top(x)-.012],[x+.042,1.325],
      [x+.048,1.285652],[outer,1.285652],[outer,top(outer)],[x,top(x)]];
    return {z:z+dz,ring:mirroredRing(side,ring)};
  }));
}

function lowerFrame(side:number,z:number) {
    const front=z>2.9,rise=front?.009465:z>2.3?.003645:0;
    const base=side>0?1.76887+.00061*z:1.76898-.00061*z;
    const inner=base+(front?.00445:z>2.3?.00525:0);
    const station=z+(side<0?.002255:0);
    const lug=front?(side>0?1.748223:1.744657):base-.00451;
    return {inner,station,lug,rise,lugRise:front?.013237:rise,
      lugWidth:front?.059936:.05579,jawRise:front?.013497:z>2.3?.001081:0,
      earRise:front?.013497:0};
}

function lowerLinks(P:TankBuilderPort,side:number):void {
  // Independent stations from Object6 bent straps, not evenly spaced beams.
  for(const z of [-1.23279,-.51285,.20650,.90944,1.64549,2.35716,2.99425]){
    const {inner,station,lug,rise,lugRise,lugWidth,jawRise,earRise}=lowerFrame(side,z);
    P.addEquipment('hullDetail',foldedWeb(side,inner,station,rise));
    P.addEquipment('hullDetail',innerLug(side,lug,station,lugRise,lugWidth));
    P.addEquipment('hullDetail',lowerJaw(side,inner,station),0,jawRise,0);
    outerEars(P,side,inner+.17111,station,earRise);
  }
}

export function addT72B3MSideMounts(P:TankBuilderPort):void {
  for(const side of [-1,1]){receivingEdges(P,side);upperLinks(P,side);lowerLinks(P,side);}
}
