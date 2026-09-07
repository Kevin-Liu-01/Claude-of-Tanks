// Original transverse tub construction from independent underside ray scalars.
// The source's shallow center keel, depressed rear side bays and steep lower
// side chamfers cannot be represented by the old flat-bottom eight-corner tub.
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type * as THREE from 'three';

type HullRow=readonly [z:number,half:number,roof:number,keel:number];
type FloorRow=readonly [z:number,center:number,mid:number,wing:number,side:number,outer:number];
// Sample positions are |X|=0,.50,.66,.90,1.00. The final upturned lower edge
// is an original structural interpolation to the retained upper side wall.
const FLOORS:readonly FloorRow[]=[
  [-3.43,1.308,1.308,1.308,1.308,1.310],
  [-3.25,.986,.986,.986,.986,.986],
  [-3.10,.713,.790,.750,.751,.752],
  [-3.03,.720,.720,.658,.643,.646],
  [-2.90,.603,.603,.551,.535,.544],
  [-2.77,.536,.536,.5025,.502,.509],
  [-2.746,.532,.532,.4935,.493,.503],
  [-2.55,.561,.561,.536,.530,.551],
  [-2.30,.603,.597,.595,.604,.794],
  [-2.15,.604,.605,.607,.642,.820],
  [-1.15,.5802,.6005,.6073,.647,.814],
  [0,.5805,.6003,.6064,.645,.807],
  [1.05,.5783,.5937,.5985,.6474,.8005],
  [1.25,.5282,.5521,.5598,.660,.7985],
  [1.40,.5804,.5940,.5985,.647,.803],
  [1.88,.5441,.5909,.5978,.6446,.8029],
  [2.64,.5309,.5909,.5971,.6279,.8531],
  [2.90,.5507,.5870,.5875,.618,.777],
  [3.05,.5911,.5913,.5916,.605,.7723],
  [3.43,.881,.881,.881,.881,.883],
];

function at<Row extends readonly number[]>(rows:readonly Row[],z:number):number[] {
  const index=rows.findIndex(row=>row[0]>=z);
  if(index<=0)return [...rows[Math.max(0,index)]];
  const a=rows[index-1],b=rows[index],t=(z-a[0])/(b[0]-a[0]);
  return a.map((value,i)=>value+(b[i]-value)*t);
}

function tubSection(row:readonly number[]):SolidSection {
  const [z,half,roof]=row,floor=at(FLOORS,z);
  const lower=[0,.50,.66,.90,1.00].map((x,i)=>[x,Math.min(roof-.003,floor[i+1])] as const);
  const edgeRise=z> -3.1&&z< -2.4?.25:.055;
  const edgeY=Math.min(roof-.002,floor[5]+edgeRise);
  const low=lower.slice(1).reverse().map(([x,y])=>[-x,y] as const);
  const bevel=Math.min(.018,(roof-edgeY)/3);
  return {z,ring:[[-half,edgeY],...low,...lower,[half,edgeY],
    [half,roof-bevel],[half-.018,roof],[-half+.018,roof],[-half,roof-bevel]]};
}

export function smHullTub(rows:readonly HullRow[]):THREE.BufferGeometry {
  const zs=[...new Set([...rows.map(row=>row[0]),...FLOORS.map(row=>row[0])])].sort((a,b)=>a-b);
  return sectionSolid(zs.map(z=>tubSection(at(rows,z))));
}
