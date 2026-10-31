// The T-72B3M obr. 2022 (`t72b3m_2022`): the 2022 production and field package on the complete T-72B3M source build
// (t72b3mX.ts). 2026-10-30 (lane t72b3m-2022-266; the owner: "also completley redesign the t72b3 (2022)"): it was the
// T-72B3M hull under a transplanted T-90SM turret; it is now a T-72B3M with the fittings its 2022-24 deliveries carry.
// Equipment only: the cast turret's Relikt, the gun, the commander's Kord station and the running gear stay the 2016's.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];
type Plan=readonly(readonly[number,number])[];
const {box,cylY}=KIT;

// Turret frame. The canopy deck stands at y 1.16, 5 cm over the tallest roof fitting it spans (the gunner's sight head,
// 1.10) and under the commander's Kord at any traverse (its barrel 1.45-1.50, 1.24 at 10 degrees down at 1.2 m).
const CANOPY_Y=1.16;
// The plan (x, z): the bustle, the side boxes and the right half of the roof, open over the front-left quarter so the
// commander's hatch and Kord station (x -1.25..-0.35, z -0.85..0.5) keep their own air.
const CANOPY:Plan=[[1.30,.40],[1.55,-.05],[1.55,-.75],[1.25,-1.20],[.90,-1.95],[-.90,-1.95],[-1.25,-1.20],[-1.55,-.90],
  [-.30,-.90],[-.30,.40]];
// Posts on the cast dome, the side boxes and the bustle box (their roofs measured at y .54-.72).
const POSTS:Plan=[[1.15,.30],[1.40,-.40],[1.20,-1.00],[.70,-1.65],[-.75,-1.62],[-1.20,-1.00],[-1.40,-.80],[-.40,-.85],[-.35,.30]];
const SEATS=['turret','turretDetail','turretEquipment','turretDark'] as const;

function stock(P:TankBuilderPort,buckets:readonly string[]):{meshes:THREE.Mesh[];dispose:()=>void}{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes:THREE.Mesh[]=[];
  P.forEachBucketPart([...buckets],g=>{if(g.userData.eraHitFaceVertexStarts)return;const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();meshes.push(m);});
  return {meshes,dispose:()=>mat.dispose()};
}
function hit(meshes:THREE.Mesh[],from:THREE.Vector3,dir:THREE.Vector3,what:string,id:string):THREE.Vector3{
  const h=new THREE.Raycaster(from,dir).intersectObjects(meshes)[0];
  if(!h)throw new Error(`${id}: 2022 kit has no seat for ${what} at ${from.toArray().map(v=>v.toFixed(2))}`);
  return h.point;
}
// The spans of a line z = const (or x = const) inside the plan polygon.
function spans(plan:Plan,axis:0|1,at:number):[number,number][]{
  const cuts:number[]=[];
  for(let i=0;i<plan.length;i++){
    const a=plan[i],b=plan[(i+1)%plan.length],u=a[axis],v=b[axis];
    if((u<=at&&v>at)||(v<=at&&u>at))cuts.push(a[1-axis]+(b[1-axis]-a[1-axis])*(at-u)/(v-u));
  }
  cuts.sort((p,q)=>p-q);
  const out:[number,number][]=[];
  for(let i=0;i+1<cuts.length;i+=2)out.push([cuts[i],cuts[i+1]]);
  return out;
}

// The factory anti-drone canopy of the 2022-23 deliveries: a welded tube frame on eight posts with a bar grid over the
// bustle and the roof, the T-72B3M's own "visor".
function canopy(P:TankBuilderPort):void{
  const bar=(a:Point,b:Point,r:number)=>P.addEquipment('turretOpenLattice',beamBetween(a,b,r,8));
  const {meshes,dispose}=stock(P,SEATS);
  try{
    for(const [x,z]of POSTS){
      const foot=hit(meshes,new THREE.Vector3(x,CANOPY_Y-.05,z),new THREE.Vector3(0,-1,0),'a canopy post',P.spec.id);
      P.addEquipment('turretDetail',box(.10,.024,.10),x,foot.y+.008,z);
      bar([x,foot.y+.01,z],[x,CANOPY_Y,z],.022);
    }
  }finally{dispose();}
  for(let i=0;i<CANOPY.length;i++){
    const [ax,az]=CANOPY[i],[bx,bz]=CANOPY[(i+1)%CANOPY.length];
    bar([ax,CANOPY_Y,az],[bx,CANOPY_Y,bz],.024);
  }
  for(let z=-1.95;z<.40;z+=.15)for(const [a,b]of spans(CANOPY,1,z))bar([a,CANOPY_Y+.012,z],[b,CANOPY_Y+.012,z],.009);
  for(let x=-1.35;x<1.40;x+=.30)for(const [a,b]of spans(CANOPY,0,x))bar([x,CANOPY_Y-.012,a],[x,CANOPY_Y-.012,b],.012);
}

// A Volnorez-type anti-drone jammer on the canopy's rear: a box on two rails with four stub antennas (2023-24 fit).
function jammer(P:TankBuilderPort):void{
  const x=.35,z=-1.45,y=CANOPY_Y+.024;
  for(const dx of [-.16,.16])P.addEquipment('turretDark',box(.04,.03,.42),x+dx,y+.015,z);
  P.addEquipment('turretDetail',box(.44,.20,.34),x,y+.13,z);
  P.addEquipment('turretDark',box(.40,.02,.30),x,y+.24,z);
  for(const [dx,dz]of [[-.17,-.12],[.17,-.12],[-.17,.12],[.17,.12]]){
    P.addEquipment('turretDark',cylY(.022,.026,.05,10),x+dx,y+.275,z+dz);
    P.addEquipment('turretDetail',cylY(.010,.014,.34,8),x+dx,y+.47,z+dz);
  }
  P.addEquipment('turretDark',beamBetween([x-.22,y+.10,z+.10],[x-.36,y-.01,z+.40],.012,6));
}

// Hull frame. Field slat over the engine bay on both sides, standing off the three rear Relikt cassettes (outer face
// x 1.976) on welded arms; top 1.30 keeps the main gun's full depression over the rear quarters clear.
function engineBaySlat(P:TankBuilderPort):void{
  const bar=(a:Point,b:Point,r:number)=>P.addEquipment('hullOpenLattice',beamBetween(a,b,r,8));
  const X=2.075,low=.84,high=1.30,z0=-3.10,z1=-1.42;
  const {meshes,dispose}=stock(P,['hull','hullExternalArmor','hullDetail']);
  try{
    for(const side of [-1,1]){
      for(const z of [z0+.08,(z0+z1)/2,z1-.08])for(const y of [low+.10,high-.10]){
        const seat=hit(meshes,new THREE.Vector3(side*2.6,y,z),new THREE.Vector3(-side,0,0),'a slat arm',P.spec.id);
        P.addEquipment('hullDark',box(.03,.08,.10),seat.x+side*.012,y,z);
        bar([seat.x,y,z],[side*X,y,z],.018);
        bar([side*X,low,z],[side*X,high,z],.020);
      }
      for(const y of [low,high])bar([side*X,y,z0],[side*X,y,z1],.020);
      const n=Math.round((z1-z0)/.11);
      for(let i=1;i<n;i++){const z=z0+(z1-z0)*i/n;P.addEquipment('hullOpenLattice',box(.010,high-low,.045),side*X,(low+high)/2,z);}
    }
  }finally{dispose();}
}

// Rubber mud flaps hung from the rounded front guards' tips (y .915 at z 3.835), the road-march fitting of the fleet.
function bowFlaps(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const x=side*1.48;
    P.addEquipment('hullRubber',box(.56,.36,.014),x,.915-.17,3.83);
    P.addEquipment('hullDark',box(.58,.04,.03),x,.905,3.83);
  }
}

// A rear whip on its own base for the added radio, on the bustle's right rear clear of the canopy rails.
function radioMast(P:TankBuilderPort):void{
  const x=1.05,z=-1.45,{meshes,dispose}=stock(P,SEATS);
  try{
    const foot=hit(meshes,new THREE.Vector3(x,CANOPY_Y-.05,z),new THREE.Vector3(0,-1,0),'the radio mast',P.spec.id);
    P.addEquipment('turretDark',cylY(.05,.06,.08,12),x,foot.y+.04,z);
    P.addEquipment('turretDetail',cylY(.008,.016,1.30,6),x,foot.y+.73,z);
  }finally{dispose();}
}

export function addT72B3M2022Kit(P:TankBuilderPort):void{
  canopy(P);jammer(P);radioMast(P);engineBaySlat(P);bowFlaps(P);
}
