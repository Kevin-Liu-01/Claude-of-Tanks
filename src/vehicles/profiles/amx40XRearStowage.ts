// Independent closed sheet/can primitives from source scalar planes. The
// left rear carrier is open furniture, not a solid rectangular armor block.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const YAW=[-.03904,1.56289,.16819] as const;
const {box,cylY}=KIT;
function put(P:TankBuilderPort,g:THREE.BufferGeometry,x=0,y=0,z=0):void {
  P.addEquipment('turretDetail',g,x-YAW[0],y-YAW[1],z-YAW[2]);
}

function canBody(P:TankBuilderPort,x:number):void {
  const rows=[[-2.2478,.0368,1.8854,2.1034],[-2.2283,.0503,1.8854,2.110],
    [-2.1814,.0494,1.8840,2.1354],[-2.1052,.0491,1.8816,2.1330],
    [-2.0701,.0488,1.8805,2.1661],[-2.0427,.0488,1.8795,2.1741],
    [-2.033,.0348,1.8792,2.1741],[-2.02321,.0359,1.8790,2.16449]];
  put(P,sectionSolid(rows.map(([z,w,b,t])=>({z,ring:[[-w,b],[w,b],[w,t],[-w,t]]}))),x);
  put(P,cylY(.02735,.02735,.0182,16),x,2.12799,-2.21076);
  // Three narrow handles bridge genuine air above the sloped can crown.
  for(const dx of[-.033,0,.033]) {
    put(P,box(.014,.010,.0992),x+dx,2.1675,-2.12);
    for(const z of[-2.1745,-2.0655])put(P,box(.014,.034,.010),x+dx,2.1515,z);
  }
}

function leftCarrier(P:TankBuilderPort):void {
  // Forward flange and two source root straps. The 1mm concealed root
  // overlap joins the unchanged cast rear face at Z -1.8748.
  for(const x of[-1.35984,-.67694])put(P,box(.044,.349,.0039),x,1.989,-1.89036);
  put(P,box(.6836,.0054,.0039),-1.01804,2.16179,-1.89036);
  for(const [y,h]of[[1.85619,.0432],[2.13224,.0537]])
    put(P,box(.710,h,.0176),-1.018,y,-1.8826);
  const side=[[1.79369,-1.89231],[1.79369,-2.10521],[1.89029,-2.25371],
    [2.16399,-2.03101],[2.16399,-1.89231]] as [number,number][];
  for(const x of[-1.33884,-.699]) {
    const g=sectionSolid([{z:x-.001,ring:side},{z:x+.001,ring:side}]).rotateY(Math.PI/2);
    // After rotation ring X is Y-world and ring Y is Z-world.
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){const y=-p.getZ(i),z=p.getY(i);p.setY(i,y);p.setZ(i,z);}
    g.computeVertexNormals();put(P,g);
  }
  put(P,box(.6396,.0059,.1348),-1.01924,2.16444,-1.95971);
  put(P,box(.6372,.0107,.0039),-1.01924,2.16934,-1.98026);
  // Source folded transverse lower braces, not a filled tray floor.
  put(P,box(.6353,.034,.008),-1.01929,1.875,-2.0056);
  put(P,box(.6363,.020,.0137),-1.01879,1.812,-2.07886);
  for(const x of[-1.28609,-1.07619,-.97384,-.85864,-.75414])canBody(P,x);
}

function rightCase(P:TankBuilderPort):void {
  const rows=[[-2.33381,1.81359,2.30559,1.01856,.85456,-.33374],
    [-2.31811,1.81239,2.32019,1.02025,.85618,-.33382],
    [-1.89821,1.78014,2.32019,1.06588,.89945,-.33606],
    [-1.88451,1.77909,2.30559,1.06736,.90086,-.33614]];
  put(P,sectionSolid(rows.map(([z,b,t,r,shoulder,l],i)=>{
    const bevel=i===0||i===3?0:.0146;
    return{z,ring:[[l,b],[r,b],[shoulder,t-bevel],[shoulder-.0195,t],
      [l+.0146,t],[l,t-bevel]]};
  })));
  // Separate raised outer skin, source Object_12:2036. Its inclined panel
  // remains off the main case; only the folded end returns bridge the gap.
  const wall=(y:number,z:number)=>(1.7936979468-.31396*y+.1037*z)/.943756;
  put(P,sectionSolid([-2.323,-1.89231].map(z=>({z,ring:[
    [wall(1.8158,z)-.0035,1.8158],[wall(1.8158,z),1.8158],
    [wall(2.299,z),2.299],[wall(2.299,z)-.0035,2.299],
  ]}))));
  for(const z of[-2.322,-1.893])put(P,sectionSolid([z-.001,z+.001].map(at=>({z:at,ring:[
    [wall(1.8158,at)-.030,1.8158],[wall(1.8158,at),1.8158],
    [wall(2.299,at),2.299],[wall(2.299,at)-.030,2.299],
  ]}))));
}

export function addAmx40RearStowage(P:TankBuilderPort):void {
  leftCarrier(P);rightCase(P);
}
