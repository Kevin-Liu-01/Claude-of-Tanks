// Original scalar-authored central rear stowage. Source island35940 has a
// rising aft floor, separate raised center lid and a genuinely notched front.
import * as THREE from 'three';
import {sectionSolid} from './sectionSolid.ts';
import {KIT} from './kit.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Course=readonly[number,number,number,number];
const ROOT=T90_AW_X_SOURCE_DATUMS.turretPivot,CENTER=-.0007;
function add(P:TankBuilderPort,g:THREE.BufferGeometry):void{
  P.addEquipment('turretDetail',g,-ROOT[0],-ROOT[1],-ROOT[2]);
}
function courses(P:TankBuilderPort,rows:readonly Course[],inner:number|((z:number)=>number),side:number):void{
  const sections=rows.map(([z,outer,low,high])=>{
    const edge=typeof inner==='number'?inner:inner(z);
    const a=side===0?CENTER-outer:CENTER+side*edge,b=CENTER+(side===0?1:side)*outer;
    return{z,ring:[[Math.min(a,b),low],[Math.max(a,b),low],[Math.max(a,b),high],[Math.min(a,b),high]] as const};
  });add(P,sectionSolid(sections));
}
function sideRoof(z:number):number{return 2.158-.01185*(-1.32-z);}
function notch(z:number):number{return z<=-1.18?.34933:.34933+(z+1.18)*1.4642;}
function floor(z:number):number{
  if(z<=-1.46733)return 2.03618+(z+1.53283)*(1.89358-2.03618)/.0655;
  if(z<=-1.38923)return 1.89358+(z+1.46733)*(1.72758-1.89358)/.0781;
  return 1.71828-(z+1.37263)*.046243;
}
function rearBody(P:TankBuilderPort):void{
  const center:Course[]=[[-1.53283,.36145,2.03618,2.14848],[-1.53083,.36145,floor(-1.53083),2.17878],
    [-1.46733,.36145,1.89358,2.17878],[-1.38923,.36145,1.72758,2.17878],
    [-1.37263,.36145,1.71828,2.17878],[-1.28083,.36145,floor(-1.28083),2.17878],
    [-1.26083,.36145,floor(-1.26083),2.159],[-1.24033,.36145,1.72248,2.15238]];
  // The 0.5mm hidden forward lap closes the rounded source rear-casting
  // datum at -1.2408 without extending the visible roof or filling its notch.
  courses(P,center,0,0);
  for(const side of[-1,1]){
    const rows:Course[]=[[-1.53283,.590,2.03618,2.14848],[-1.52683,.604,floor(-1.52683),sideRoof(-1.52683)],
      [-1.46733,.7085,1.89358,sideRoof(-1.46733)],[-1.38923,.7085,1.72758,sideRoof(-1.38923)],
      [-1.37263,.7085,1.71828,sideRoof(-1.37263)],[-1.25153,.7085,1.71268,sideRoof(-1.25153)],
      [-1.18,.7085,1.715,sideRoof(-1.18)],[-1.12,.7085,1.7154,2.161],
      [-1.10583,.7085,1.7175,2.16118],[-1.09623,.701,1.72438,1.72728]];
    courses(P,rows,notch,side);
  }
}
function outerRims(P:TankBuilderPort):void{
  for(const side of[-1,1]){
    courses(P,[[-1.480,.710,2.052,2.1505],[-1.461,.7220,1.880,2.1981],
      [-1.37263,.7220,1.71828,2.1993],[-1.25,.7220,1.71268,2.20065],
      [-1.12,.7210,1.7154,2.2022],[-1.10583,.7210,1.7175,2.20238],
      [-1.09623,.701,1.72438,1.72728]],.6940,side);
  }
}
function raisedWingCourses(P:TankBuilderPort):void{
  for(const side of[-1,1]){
    const sections=[-1.466,-1.40,-1.34,-1.30,-1.26,-1.24,-1.18,-1.10583].map(z=>{
      const knee=Math.max(.480,.5045+.55*(-1.30-z)),inner=knee-.012,outer=.716,
        high=sideRoof(z)+.0415,low=sideRoof(z)-.001;
      const ring=[[inner,low],[outer,low],[outer,high],[knee,high],[inner,high-.012]].map(([x,y])=>[CENTER+side*x,y] as const);
      if(side<0)ring.reverse();return{z,ring};
    });add(P,sectionSolid(sections));
  }
}
function lidFittings(P:TankBuilderPort):void{
  for(const [x,w] of [[.4385,.2092],[-.43295,.1956]]){
    add(P,KIT.box(w,.1094,.0094).translate(x,2.09868,-1.53693));
    add(P,KIT.box(w,.0084,.070).translate(x,2.15748,-1.498));
  }
  for(const [x,z] of [[.4967,-1.19933],[-.4996,-1.19833]]){
    const side=x>0?1:-1;
    add(P,KIT.box(.010,.046,.040).translate(x-side*.044,2.17978,z));
    add(P,KIT.box(.076,.0155,.040).translate(x+side*.014,2.20913,z));
    add(P,KIT.box(.027,.025,.040).translate(x-side*.017,2.20438,z));
  }
  add(P,KIT.box(.036,.018,.055).translate(-.0012,2.18738,-1.505));
  add(P,KIT.box(.012,.048,.020).translate(-.0012,2.16,-1.54));
}
export function addT90AWRearStowage(P:TankBuilderPort):void{
  rearBody(P);outerRims(P);raisedWingCourses(P);lidFittings(P);
}
