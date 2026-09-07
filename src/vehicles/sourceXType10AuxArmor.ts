// Authoritative outer skirt faces derived from the first-party analytic sheet
// dimensions, not the foreign mesh. Bounded facets retain panel gaps and the
// original piecewise floor/top. Focused held-outs bound transverse error.
import type {ArmorPlate} from './specHelpers.ts';
import {auxiliaryQuad,type AuxPoint} from './sourceXAuxArmorPrimitives.ts';
const SPANS=[[-2.4732,-1.4735],[-1.4782,-.2190],[-.2167,1.0250],
  [1.0285,2.2909648],[2.2940,3.1363]] as const;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ramp=(z:number,a:number,b:number)=>clamp((z-a)/(b-a));
const tent=(z:number,c:number,r:number)=>Math.max(0,1-Math.abs(z-c)/r);
function sheetX(panel:number,z:number,t:number):number {
  const low=1-t,belly=4*t*low;
  if(panel===0)return 1.5741+.0192*tent(z,-1.75,.48)*low**2
    +.06943*(1-ramp(z,-2.4732,-2.355))*low**1.14-.0110*ramp(z,-1.70,-1.4735)*belly;
  if(panel===1)return 1.5752+.0230*(1-ramp(z,-1.36,-.43))*low**2
    +.0827472*ramp(z,-.350,-.2190)*low**1.25-.0045*belly;
  if(panel===2)return 1.5752+(.0600-.0517*clamp((z+.063)/.886))*low**1.50
    -.0185*(1-ramp(z,-.2167,-.063))*low+.0250*ramp(z,.83,1.0250)*low**1.65+.0020*belly;
  if(panel===3)return 1.5746+(.0030+.0167*ramp(z,1.22,2.12))*low**2
    +.0452*(1-ramp(z,1.0285,1.22))*low**1.25
    +.100348685*ramp(z,2.105,2.2909648)*low**1.35-.0060*belly;
  return 1.5745+.0133*low**2+.05673*(1-ramp(z,2.294,2.48))*low**1.65
    +.0200*ramp(z,2.92,3.1363)*low**1.55+.0030*belly;
}
function floor(panel:number,z:number):number {
  const base=.390227+.0100435*z;
  if(panel===0)return Math.max(base,-.5886852-.438727*z);
  if(panel===4)return Math.max(base,.4254067+.554724*(z-2.9));
  return base;
}
function stations(panel:number):number[] {
  const [a,b]=SPANS[panel],indices=new Set<number>([0,48]);
  for(let i=0;i<=48;i+=3)indices.add(i);
  const bends=[[-2.355,-2.23,-1.75,-1.70],[-1.36,-.43,-.35],[-.063,.823,.83],
    [1.22,2.105,2.12],[2.48,2.92]][panel];
  for(const bend of bends){
    const at=(bend-a)/(b-a)*48;
    for(const i of [Math.floor(at),Math.ceil(at)])if(i>0&&i<48)indices.add(i);
  }
  // The three steep terminal curls need their native longitudinal rows;
  // shallow spans retain the bounded coarser collision representation.
  for(let i=1;i<48;i++){
    const z=a+(b-a)*i/48;
    if(panel===0&&z< -2.355||panel===1&&z> -.350||panel===3&&z>2.105)indices.add(i);
  }
  // Keep the native piecewise floor exactly, including the two stations
  // surrounding an analytic bend that falls between regular authoring rows.
  for(let i=1;i<48;i++){
    const z=a+(b-a)*i/48,h=(b-a)/48;
    if(Math.abs(floor(panel,z-h)+floor(panel,z+h)-2*floor(panel,z))>1e-8)indices.add(i);
  }
  return [...indices].sort((x,y)=>x-y).map(i=>a+(b-a)*i/48);
}
export function type10AuxiliarySkirts(template:ArmorPlate,side:number):ArmorPlate[] {
  const out:ArmorPlate[]=[];
  for(let p=0;p<SPANS.length;p++){
    const zs=stations(p),group=`type10_x_skirt_${side}_${p}`;
    const point=(z:number,t:number):AuxPoint=>[side*sheetX(p,z,t),
      floor(p,z)+(.783621+.0100435*z-floor(p,z))*t,z];
    for(let i=0;i<zs.length-1;i++)for(let band=0;band<4;band++){
      const a=band/4,b=(band+1)/4;
      const points=[point(zs[i],a),point(zs[i],b),point(zs[i+1],b),point(zs[i+1],a)];
      // The reflected native ring is reversed before triangulation, so its
      // ruled-cell diagonal is reflected too, rather than only its normal.
      if(side<0)points.reverse();
      out.push(...auxiliaryQuad(template,group,i*4+band,points,side));
    }
  }
  return out;
}
