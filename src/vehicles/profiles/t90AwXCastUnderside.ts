// Source-specific lower casting and recessed bearing, authored from scalar
// section/plane measurements. The main stock is not a bearing-height slab.
import * as THREE from 'three';
import {sectionSolid,type SectionPoint,type SolidSection} from './sectionSolid.ts';
import type {CastStation} from './measuredPrimitives.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const PIVOT=T90_AW_X_SOURCE_DATUMS.turretPivot;
// Upper stations are unchanged from the accepted source-section casting.
const STATIONS:readonly CastStation[]=[
  [-1.2408,.02,.02,1.74,1.64,1.67],[-1.2,.2422,.2393,2.03097,1.65321,1.79],
  [-1,.5939,.5917,2.13694,1.55453,1.88],[-.8,.8211,.8183,2.18385,1.40808,1.87],
  [-.6,.9876,.9880,2.23083,1.40808,1.84],[-.4,1.1150,1.1131,2.27398,1.40808,1.82],
  [-.2,1.2116,1.2219,2.27398,1.40808,1.77],[0,1.3109,1.3173,2.27398,1.40808,1.72],
  [.2,1.3829,1.3817,2.23361,1.40808,1.695],[.4,1.4057,1.40365,2.18879,1.40808,1.68],
  [.6,1.3809,1.3744,2.16066,1.40808,1.665],[.8,1.3064,1.3043,2.10394,1.40808,1.64],
  [1,1.1985,1.1964,2.04946,1.40808,1.625],[1.2,1.0364,1.0396,1.99417,1.52948,1.68],
  [1.4,.6689,.6585,1.78358,1.52948,1.63],[1.4301,.12,.12,1.62,1.54,1.57],
];
// [central stock floor, transverse knee floor, knee/width, bevel-end/width,
// outer underside]. These describe the physical chin, not sampled contours.
type Chin=readonly[number,number,number,number,number];
const CHINS:readonly Chin[]=[
  [1.64,1.64,.88,.99,1.6556],[1.65321,1.65321,.88,.99,1.7243408],
  [1.5592,1.55453,.867,.96,1.6770],[1.5572,1.5493,.943,.968,1.6780],
  [1.5544,1.5448,.972,.980,1.6780],[1.5488,1.5393,.982,.990,1.6780],
  [1.5410,1.5331,.991,.996,1.6780],[1.5350,1.52785,.996,.999,1.5300],
  [1.52948,1.52935,.996,.999,1.5320],[1.52948,1.52948,.972,.999,1.5780],
  [1.52948,1.52948,.9385,.999,1.6065],[1.52948,1.52948,.9078,.999,1.6160],
  [1.52948,1.52948,.8748,.999,1.6200],[1.5314,1.52948,.7924,.999,1.6195],
  [1.52948,1.52948,.88,.99,1.5817504],[1.54,1.54,.88,.99,1.5556],
];

function castSection(row:CastStation,chin:Chin):SolidSection{
  const[z,l,r,t,,shoulder]=row,[middle,bottom,knee,bevel,outer]=chin;
  const ring:SectionPoint[]=[[-l*knee,bottom],[0,middle],[r*knee,bottom],
    [r*bevel,outer],[r,outer],[r,shoulder]];
  for(let i=1;i<12;i++){
    const angle=i*Math.PI/12,x=Math.cos(angle),width=x>=0?r:l;
    ring.push([x*width,shoulder+(t-shoulder)*Math.sin(angle)**.56]);
  }
  ring.push([-l,shoulder],[-l,outer],[-l*bevel,outer]);
  return{z:z-PIVOT[2],ring:ring.map(([x,y])=>[x-PIVOT[0],y-PIVOT[1]] as const)};
}

function ellipse(rx:number,rz:number,cz:number,count:number,phase:number):THREE.Vector2[]{
  return Array.from({length:count},(_,i)=>{
    const angle=phase+i*2*Math.PI/count;
    // Shape XY is rotated to world XZ; the extrusion becomes world +Y.
    return new THREE.Vector2(-.00094997882843+rx*Math.cos(angle),-(cz+rz*Math.sin(angle)));
  });
}

function extrude(shape:THREE.Shape,bottom:number,top:number):THREE.BufferGeometry{
  return new THREE.ExtrudeGeometry(shape,{depth:top-bottom,bevelEnabled:false,steps:1})
    .rotateX(-Math.PI/2).translate(-PIVOT[0],bottom-PIVOT[1],-PIVOT[2]);
}

function bearing(P:TankBuilderPort):void{
  // The source's 32-sided outer bearing and phase-offset 16-sided inner
  // aperture are distinct. Their approximately 0.7 mm export anisotropy is
  // retained through independently fitted radii, not copied vertex arrays.
  const inner=ellipse(.82276,.82206,.11587,16,Math.PI/32);
  const ring=new THREE.Shape(ellipse(.92630,.92530,.11617,32,0));
  ring.holes.push(new THREE.Path([...inner].reverse()));
  P.add('turret',extrude(ring,1.408079981804,1.570));
  // Actual recessed bearing floor; its overlap into the main stock is hidden.
  P.add('turret',extrude(new THREE.Shape(inner),1.516780018806,1.570));
}

export function addT90AWCastUnderside(P:TankBuilderPort):void{
  P.add('turret',sectionSolid(STATIONS.map((row,i)=>castSection(row,CHINS[i]))));
  bearing(P);
}
