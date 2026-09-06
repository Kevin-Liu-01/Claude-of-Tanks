// SM's high narrow side casing and low outer sheet are distinct physical
// solids. Scalar widths/heights were independently probed in the local oracle.
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Point=readonly[number,number];
function sideSection(z:number,ring:readonly Point[],side:number):SolidSection{
  return {z,ring:side>0?ring:ring.map(([x,y])=>[-x,y] as const).reverse()};
}

function lowerSheet(P:TankBuilderPort,side:number):void{
  const rows=[[-3.63,1.354,1.263,1.255],[-3.55,1.7485,1.3003,1.279],
    [-3.45,1.7586,1.3287,1.285],[-3.35,1.7688,1.3292,1.279],
    [-3.30,1.808,1.3295,1.2639],[-1.05,1.808,1.327,1.264],
    [.95,1.808,1.325,1.27],[2.70,1.808,1.29,1.255],[3.22,1.808,1.30,1.27]];
  P.add('hull',sectionSolid(rows.map(([z,outer,innerY,outerY])=>{
    const knee=Math.min(1.665,outer-.025),thickness=.017;
    const ring:readonly Point[]=[[1.035,innerY-thickness],[knee,innerY-thickness-.007],
      [outer,outerY-thickness],[outer,outerY],[knee,innerY-.007],[1.035,innerY]];
    return sideSection(z,ring,side);
  })));
}

function raisedCase(P:TankBuilderPort,side:number):void{
  const start=side>0?-3.2459:-3.33;
  const rows=[[start,1.430,.055],[start+.006,1.446,.055],[start+.016,1.473,.103],
    [-3.20,1.494,.165],[-2.70,1.5185,.190],[-1.33,1.5341,.207],
    [-.87,1.5322,.205],[.50,1.5046,.178],[.95,1.4896,.164],
    [1.88,1.4372,.130],[2.70,1.3878,.080],[3.22,1.35,.060]];
  P.add('hull',sectionSolid(rows.map(([z,top,depth])=>{
    const outer=z<.95?1.67945:1.67945-(z-.95)*.0033;
    const low=top-depth,knee=Math.min(1.632,outer-.037);
    const corner=Math.min(knee+.020,outer-.016);
    const shoulder=Math.max(low+.005,top-.057);
    const ring:readonly Point[]=[[1.04,low],[outer,low],[outer,Math.min(top-.01,low+.017)],
      [corner,shoulder],[knee,top-.003],[1.30,top],[1.04,top]];
    return sideSection(z,ring,side);
  })));
}

export function addT90SMFenderShoulders(P:TankBuilderPort):void{
  for(const side of [-1,1]){lowerSheet(P,side);raisedCase(P,side);}
}
