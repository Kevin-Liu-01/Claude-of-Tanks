// Independent sloped gun-base shell, authored from scalar planes, section
// widths and trim stations. No source topology or loader enters this module.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {T90MS_X_SOURCE_DATUMS} from '../t90msXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Plane=readonly[number,number,number,number];
const GUN=T90MS_X_SOURCE_DATUMS.trunnion;
const LEFT:readonly Plane[]=[[-.1299907586,.9438935764,.3035907097,-2.3706149984],
  [-.1441981298,.9335530136,.3281549485,-2.3896574701],[-.1717316978,.9411010126,.2912681034,-2.3488012520]];
const RIGHT:readonly Plane[]=[[.1726281085,.9397082626,.2952082611,-2.3524628597],
  [.1967573544,.9240391045,.3277777858,-2.3734422550],[.2559354027,.9268643989,.2746260289,-2.3008473614]];
const height=(p:Plane,x:number,z:number)=>(-p[3]-p[0]*x-p[2]*z)/p[1];
function lowerWing(left:boolean,x:number,z:number):number{
  if(!left)return height(z<1.775?[.2145062824,-.8625595669,.4582336176,.7132163714]:
    [.2020097675,-.8773932862,.4351701681,.7822282530],x,z);
  if(z>=1.77893)return height([-.2378204825,-.8535147917,.4636312312,.6780708931],x,z);
  if(x<-.33414)return height([-.3941380267,-.8077902523,.4383265041,.5781896384],x,z);
  if(x<-.26554&&z>=1.68473)return height([-.2339546907,-.8367453734,.4950983567,.5924657680],x,z);
  if(x<-.26554)return 1.7887121-(x+.3)*.4498566;
  return height([-.1895068251,-.8849703929,.4253405305,.8086703930],x,z);
}
function foreWing(P:TankBuilderPort,left:boolean):void{
  const planes=left?LEFT:RIGHT,inner=left?-.09824:.09806;
  const g=sectionSolid([1.6322,1.65,1.68473,1.75,1.77893,1.85,1.91403].map(z=>{
    const outer=left?-.38254+Math.max(0,z-1.77703)/.1414*(.38254-.1218):
      .28576-Math.max(0,z-1.78363)/.1348*(.28576-.1205);
    const l=Math.min(outer,inner),r=Math.max(outer,inner),xs=[l,l+(r-l)/3,l+(r-l)*2/3,r];
    const p=z<1.64?planes[1]:planes[2];
    const low=xs.map(x=>[x,Math.min(height(p,x,z)-.003,lowerWing(left,x,z))] as const);
    const upper=[...xs].reverse().map(x=>[x,height(p,x,z)] as const);
    return{z,ring:[...low,...upper]};
  }));add(P,g);
}
function add(P:TankBuilderPort,g:THREE.BufferGeometry):void{
  P.add('gunMount',g.translate(-GUN[0],-GUN[1],-GUN[2]));
}
function panel(P:TankBuilderPort,xs:readonly number[],start:(x:number)=>number,end:(x:number)=>number,
  roof:(x:number,z:number)=>number,thickness:number):void{
  const g=sectionSolid(xs.map(x=>{
    const a=start(x),b=end(x),ya=roof(x,a),yb=roof(x,b);
    return{z:x,ring:[[-b,yb-thickness],[-a,ya-thickness],[-a,ya],[-b,yb]] as Array<readonly[number,number]>};
  })).rotateY(Math.PI/2);add(P,g);
}
function halfRoof(P:TankBuilderPort,left:boolean):void{
  const planes=left?LEFT:RIGHT,xs=left?[-.38254,-.1218,-.00234]:[-.00234,.1205,.28576];
  const start=(x:number)=>Math.max(1.03143,(-planes[0][3]-planes[0][0]*x-planes[0][1]*2.12721)/planes[0][2]);
  panel(P,xs,()=>1.02533,start,(_x,z)=>2.11451+(z-1.03073)*.0030082,.033);
  panel(P,xs,x=>start(x)-.002,()=>1.4505,(x,z)=>height(planes[0],x,z),.031);
  panel(P,xs,()=>1.4495,()=>1.5646,(x,z)=>height(planes[1],x,z),.020);
  const sideXs=left?[-.38254,-.1218,-.09824]:[.09806,.1205,.28576];
  panel(P,sideXs,()=>1.5645,()=>1.6323,(x,z)=>height(planes[1],x,z),.020);
  foreWing(P,left);
  const centreXs=left?[-.09824,-.00234]:[-.00234,.09806];
  const centrePlane:Plane=[.1413326625,.9492237995,.2810680646,-2.3451748035];
  panel(P,centreXs,()=>1.5645,()=>1.68353,(x,z)=>height(centrePlane,x,z),.020);
}
function sideReturn(P:TankBuilderPort,left:boolean):void{
  const outer=left?-.38174:.28496,inner=outer+(left?.016:-.019),planes=left?LEFT:RIGHT;
  const stations:readonly(readonly[number,number])[]=[[1.02533,2.00931],[1.05,1.99977],[1.2,1.94204],
    [1.3972,1.8661],[1.39943,1.647],[1.45,1.671],[1.55,1.705],[1.65,1.753],[1.75,1.836],[1.77703,1.874]];
  add(P,sectionSolid(stations.map(([z,low])=>{
    const p=z<1.45?planes[0]:z<1.64?planes[1]:planes[2];
    const high=z<1.03143?2.11451:Math.min(2.12721,height(p,outer,z));
    const l=Math.min(outer,inner),r=Math.max(outer,inner);
    return{z,ring:[[l,Math.min(low,high-.002)],[r,Math.min(low,high-.002)],[r,high],[l,high]] as Array<readonly[number,number]>};
  })));
}
function topFittings(P:TankBuilderPort):void{
  // Distinct source upper channel and its two mounting feet. The low fore
  // sight retains the original aperture below the raised upper leaf.
  add(P,KIT.box(.0984,.0359,.3043).translate(.02136,2.10566,1.42808));
  add(P,KIT.box(.0984,.0627,.0247).translate(.02136,2.05636,1.47788));
  for(const x of [-.03894,.08156])add(P,KIT.box(.0224,.0445,.0247).translate(x,2.02916,1.47338));
  add(P,KIT.box(.1409,.0101,.0154).translate(.02151,2.01996,1.48043));
  add(P,KIT.box(.0821,.0442,.0574).translate(.02241,2.09511,1.24773));
}
export function addT90MSGunBase(P:TankBuilderPort):void{
  halfRoof(P,true);halfRoof(P,false);sideReturn(P,true);sideReturn(P,false);topFittings(P);
}
