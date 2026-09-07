// Original closed parametric surround. Only source scalar planes and aperture
// dimensions are used; the supplied GLB and its topology remain local-only.
import * as THREE from 'three';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const YZ=1.1366241623942464,X=1.1366241623942464;
const YO=1.24758034095187,ZO=.25532557439914;
const CENTER_X=.333,HALF_X=.0615,CENTER_Y=.6363,HALF_Y=.0565;
const upperZ=(y:number)=>(1.48583350-y)/.47606013;

function profile(x:number,opening:boolean):SectionPoint[] {
  const ring:[number,number][]=[[-1.369,.341],[ -1.93076833,.56667168]];
  if(opening) {
    const radius=Math.max(.0001,HALF_Y*Math.sqrt(Math.max(0,1-((x-CENTER_X)/HALF_X)**2)));
    const lower=CENTER_Y-radius,upper=CENTER_Y+radius;
    const back=(y:number)=>1.476915-.010044*y;
    ring.push([-upperZ(lower),lower],[-back(lower),lower],
      [-back(upper),upper],[-upperZ(upper),upper]);
  }
  ring.push([-1.55114343,.747396],[-1.369,.767249]);
  return ring.reverse();
}

function surroundGeometry(left:number,right:number,opening:boolean):THREE.BufferGeometry {
  const count=opening?24:1;
  const g=sectionSolid(Array.from({length:count+1},(_,i)=>{
    const x=opening?CENTER_X-HALF_X*Math.cos(i/count*Math.PI):left+(right-left)*i/count;
    return{z:x,ring:profile(x,opening)};
  }));
  g.rotateY(Math.PI/2);g.scale(X,YZ,YZ);g.translate(0,YO,ZO);
  return g;
}

export function addType10CoaxSurround(P:TankBuilderPort,pivot:readonly[number,number,number]):void {
  const add=(slot:string,g:THREE.BufferGeometry,x=0,y=0,z=0)=>
    P.addEquipment(slot,g,x-pivot[0],y-pivot[1],z-pivot[2]);
  add('turret',surroundGeometry(.1565,CENTER_X-HALF_X,false));
  add('turret',surroundGeometry(CENTER_X-HALF_X,CENTER_X+HALF_X,true));
  add('turret',surroundGeometry(CENTER_X+HALF_X,.4320,false));
  // Complete-source backing and the genuinely recessed coaxial weapon stay
  // visible inside the opening; it is not a through-hole into an empty shell.
  const backer=KIT.cylZ(.0471*YZ,.047145*YZ,32);backer.scale(X/YZ,1,1);
  add('turretDark',backer,
    .332851*X,.634051*YZ+YO,1.4916125*YZ+ZO);
  add('turretDark',KIT.cylZ(.0258*YZ,.18434*YZ,20),
    .332851*X,.63457*YZ+YO,1.606592*YZ+ZO);
}
