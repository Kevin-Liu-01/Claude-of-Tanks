// Original folded channels and stepped backing plates for the asymmetric
// 3+2+1 left bank. Coordinates below are independent source scalar stations.
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Plane=readonly[number,number,number,number,number,number];
type Row=readonly[number,number,number,number];
type CarrierRow=readonly[number,number,number,number,number];
const FACES:readonly(readonly Plane[])[]=[
  [[-.685261,.296698,.665122,-1.328344,2.247559,-.393411],
    [-.533993,.336306,.775725,-1.240300,2.257889,-.323978],
    [-.453814,.343410,.822267,-1.143846,2.261625,-.265861]],
  [[-.451936,.241994,.858599,-1.335281,2.196505,-.195824],
    [-.310739,.253942,.915945,-1.229257,2.200594,-.150945]],
  [[-.309767,.252106,.916781,-1.345336,2.115713,-.017030]],
];
const PLATES:readonly(readonly Row[])[]=[
  [[-1.368,2.2284,2.2375,0],[-1.326,2.2016,2.2924,0],[-1.28,2.2050,2.2983,0],
    [-1.239,2.2080,2.3003,1],[-1.19,2.2116,2.3026,1],[-1.143,2.2151,2.3035,2],
    [-1.078,2.2199,2.3047,2],[-1.068,2.2874,2.3013,2]],
  [[-1.387,2.1440,2.1684,0],[-1.334,2.1421,2.2456,0],[-1.28,2.1437,2.2474,0],
    [-1.228,2.1450,2.2477,1],[-1.178,2.1462,2.2479,1],[-1.17,2.2240,2.2440,1]],
  [[-1.399,2.0675,2.0853,0],[-1.36,2.0625,2.1655,0],[-1.344,2.0629,2.1656,0],
    [-1.32,2.0635,2.1659,0],[-1.290,2.0642,2.1662,0],[-1.283,2.1468,2.1616,0]],
];
const CARRIERS:readonly(readonly CarrierRow[])[]=[
  [[-1.378,2.2274,2.2409,-.4460,-.4404],[-1.326,2.1970,2.2876,-.4885,-.3930],
    [-1.239,2.2026,2.2920,-.4580,-.3360],[-1.143,2.2088,2.2969,-.4243,-.2730],
    [-1.10,2.2115,2.2991,-.4070,-.2447],[-1.075,2.2132,2.3004,-.3923,-.2283],[-1.016,2.2683,2.2767,-.3576,-.3502]],
  [[-1.397,2.1969,2.2089,-.4123,-.3964],[-1.334,2.1370,2.2402,-.4509,-.2048],
    [-1.28,2.1382,2.2411,-.4291,-.1829],[-1.228,2.1394,2.2420,-.4081,-.1619],
    [-1.18,2.1405,2.2429,-.3888,-.1425],[-1.15,2.1412,2.2435,-.3767,-.1303],
    [-1.10,2.1860,2.2415,-.3496,-.1442],[-1.063,2.1880,2.1993,-.3267,-.3170]],
  [[-1.448,2.0549,2.0739,-.0704,-.0652],[-1.38,2.0469,2.1640,-.1121,-.0369],[-1.344,2.0458,2.1648,-.1052,-.0219],
    [-1.28,2.0440,2.1662,-.0929,.0047],[-1.16,2.0424,2.1688,-.0658,.0528],[-1.08,2.1397,2.1525,-.0372,-.0288]],
];
const CARRIER_FACES:readonly Plane[]=[
  [-.534978,.320281,.781805,-1.318964,2.242261,-.406178],
  [-.369,.255,.894,-1.326638,2.190741,-.216136],
  [-.376790,.255484,.890369,-1.338246,2.110731,-.034548],
];

function frontZ(p:Plane,x:number,y:number):number {
  return p[5]-(p[0]*(x-p[3])+p[1]*(y-p[4]))/p[2];
}
function addSolid(P:TankBuilderPort,sections:SolidSection[],part:string):void {
  const geometry=sectionSolid(sections).rotateY(Math.PI/2);
  geometry.userData.leftSmokeMount=part;
  P.addEquipment('turretDetail',geometry,-.008,-1.532,-.359);
}
function backingPlate(P:TankBuilderPort,index:number):void {
  const depth=[.014,.021,.027][index];
  const sections=PLATES[index].map(([x,low,high,face]):SolidSection=>{
    const p=FACES[index][face],frontLow=frontZ(p,x,low),frontHigh=frontZ(p,x,high);
    return {z:x,ring:[[-frontLow,low],[-frontLow+depth,low],[-frontHigh+depth,high],[-frontHigh,high]]};
  });
  addSolid(P,sections,`backing-${index}`);
}
function foldedCarrier(P:TankBuilderPort,index:number):void {
  const sections=CARRIERS[index].map(([x,low,high,rear,limit]):SolidSection=>{
    const p=CARRIER_FACES[index],frontLow=Math.min(limit,frontZ(p,x,low));
    const frontHigh=Math.max(rear+.003,Math.min(limit,frontZ(p,x,high)));
    const rearTop=Math.max(low+(high-low)*.3,high-.20*(frontHigh-rear));
    const thickness=Math.min(.008,(frontHigh-rear)*.35,(high-low)*.25);
    return {z:x,ring:[[-frontLow,low],[-frontLow+thickness,low],
      [-frontHigh+thickness,high-thickness],[-rear,rearTop-thickness],
      [-rear,rearTop],[-frontHigh,high]]};
  });
  addSolid(P,sections,`carrier-${index}`);
}
function lowerTie(P:TankBuilderPort,index:number):void {
  // Source lower coupling strips (8789/8853) bridge the front plate to its
  // folded carrier below the stock center, leaving the center stand-off air.
  const sections=PLATES[index].map(([x,low,high,face]):SolidSection=>{
    const y=Math.min(high-.009,low+(index===0?.004:.045));
    const front=frontZ(FACES[index][face],x,y)-.004;
    const rear=Math.min(front-.012,frontZ(CARRIER_FACES[index],x,y)-.006);
    return {z:x,ring:[[-front,y],[-rear,y],[-rear,y+.008],[-front,y+.008]]};
  });
  addSolid(P,sections,`lower-tie-${index}`);
}
export function addT90SMLeftSmokeMounts(P:TankBuilderPort):void {
  for(let row=0;row<3;row++){foldedCarrier(P,row);backingPlate(P,row);}
  lowerTie(P,0);lowerTie(P,1);
}
