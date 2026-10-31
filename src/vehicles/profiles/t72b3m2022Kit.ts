// The T-72B3M obr. 2022 (`t72b3m_2022`): the 2022 production and field package on the complete T-72B3M source build
// (t72b3mX.ts). 2026-10-30 (lane t72b3m-2022-266; the owner: "also completley redesign the t72b3 (2022)"): it was the
// T-72B3M hull under a transplanted T-90SM turret; it is now a T-72B3M with the fittings its 2022-24 deliveries carry.
// Equipment only: the cast turret's Relikt, the gun, the commander's Kord station and the running gear stay the 2016's.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];
type Plan=readonly(readonly[number,number])[];
const {box,cylX,cylY}=KIT;

// Turret frame. The canopy deck stands at y 1.16, 5 cm over the tallest roof fitting it spans (the gunner's sight head,
// 1.10) and under the commander's Kord at any traverse (its barrel 1.45-1.50, 1.24 at 10 degrees down at 1.2 m).
const CANOPY_Y=1.16;
// The plan (x, z): centred over the roof from the brow to the bustle's end, following the turret's plan, with an opening
// round the commander's hatch and Kord station (x -1.45..-0.28, z -0.88..0.52) so it keeps its own air.
const CANOPY:Plan=[[1.30,.70],[1.55,0],[1.55,-.75],[1.25,-1.20],[.90,-1.95],[-.90,-1.95],[-1.25,-1.20],[-1.55,-.75],
  [-1.55,0],[-1.30,.70]];
const HATCH:Plan=[[-1.45,.52],[-.28,.52],[-.28,-.88],[-1.45,-.88]];
// Posts on the cast dome, the side boxes and the bustle box (their roofs measured at y .44-.72).
const POSTS:Plan=[[1.15,.55],[1.40,-.40],[1.20,-1.00],[.70,-1.65],[-.75,-1.62],[-1.20,-1.00],[-.32,-.90],[-.28,.52],[-1.22,.60]];
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
// The spans of `outer` less those of `hole`, on one line.
function minus(outer:[number,number][],hole:[number,number][]):[number,number][]{
  let out=outer;
  for(const [h0,h1]of hole)out=out.flatMap(([a,b]):[number,number][]=>b<=h0||a>=h1?[[a,b]]:[...(a<h0?[[a,h0] as [number,number]]:[]),...(b>h1?[[h1,b] as [number,number]]:[])]);
  return out;
}

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
  for(const plan of [CANOPY,HATCH])for(let i=0;i<plan.length;i++){
    const [ax,az]=plan[i],[bx,bz]=plan[(i+1)%plan.length];
    bar([ax,CANOPY_Y,az],[bx,CANOPY_Y,bz],.024);
  }
  for(let z=-1.95;z<.70;z+=.15)for(const [a,b]of minus(spans(CANOPY,1,z),spans(HATCH,1,z)))bar([a,CANOPY_Y+.012,z],[b,CANOPY_Y+.012,z],.009);
  for(let x=-1.45;x<1.50;x+=.29)for(const [a,b]of minus(spans(CANOPY,0,x),spans(HATCH,0,x)))bar([x,CANOPY_Y-.012,a],[x,CANOPY_Y-.012,b],.012);
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

// Turret frame. The boxed Relikt cheeks: four flat-topped containers a side in a V from the mantlet's flanks (x .70,
// z 1.57) back to the side boxes (x 1.69, z .42), 46 cm deep, their tops falling from the roofline (y .68) to a short outer
// face (y .34): the forward-swept arrowhead of the B3M's front. They replace the 2016 build's nine shingled cells (buildT72B3MX cheekEra: false).
function cheekContainers(P:TankBuilderPort):void{
  const N=4,D=.46,yb=.08,yt=.68,yf=.34,Y=new THREE.Vector3(0,1,0);
  for(const side of [-1,1]){
    const a=new THREE.Vector3(side*.70,0,1.57),b=new THREE.Vector3(side*1.69,0,.42),len=a.distanceTo(b);
    const u=b.clone().sub(a).normalize(),n=new THREE.Vector3(-u.z,0,u.x);
    if(n.z<0)n.negate();
    const basis=new THREE.Matrix4().makeBasis(n,Y,n.clone().cross(Y)),L=len/N-.012;
    for(let i=0;i<N;i++){
      const c=a.clone().addScaledVector(u,len*(i+.5)/N).addScaledVector(n,-D/2);
      const ring:readonly(readonly[number,number])[]=[[-D/2,yb],[D/2,yb],[D/2,yf],[-D/2,yt]];
      const g=markEraHitFaces(sectionSolid([{z:-L/2,ring},{z:L/2,ring}]),[1,0,0]).applyMatrix4(basis);
      P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('turret',g,c.x,0,c.z));
    }
  }
}

// The OPVT snorkel canister stowed across the bustle box's top, on two saddles with straps (the Army-2022 tank's own).
function snorkel(P:TankBuilderPort):void{
  const x=.05,z=-1.70,r=.17,{meshes,dispose}=stock(P,SEATS);
  try{
    const top=hit(meshes,new THREE.Vector3(x,1.10,z),new THREE.Vector3(0,-1,0),'the snorkel saddle',P.spec.id).y;
    P.addEquipment('turretDetail',cylX(r,1.40,24),x,top+r+.04,z);
    for(const dx of [-.71,.71])P.addEquipment('turretDark',cylX(r+.012,.03,24),x+dx,top+r+.04,z);
    for(const dx of [-.42,.42]){
      P.addEquipment('turretDark',box(.06,.06,.30),x+dx,top+.03,z);
      P.addEquipment('turretDark',cylX(r+.008,.035,24),x+dx,top+r+.04,z);
    }
  }finally{dispose();}
}

// Hull frame. The raised Relikt block rows of the glacis package, laid in chevrons on the 2016 build's glacis cover (top
// y 1.4934 at z 2.00 falling .382 a metre, .04 thick): ERA furniture of the same glacis clusters, so they go with them.
function glacisChevrons(P:TankBuilderPort):void{
  for(const side of [-1,1])P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
    for(const z of [2.16,2.47,2.78,3.08])for(const x of [.30,.74]){
      const y=1.4934-(z-2)*.382+.04+.022;
      P.addExternalArmor('hull',markEraFurniture(box(.40,.044,.25)),side*x,y,z,.365,side*.26,0);
    }
  });
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

// The stern slat of the 2022 deliveries (Army-2022 display tank, rear): a bar cage across the whole stern standing behind
// the six rear leaves (back face z -3.672), top 1.72 (no higher than the leaves, under the gun laid aft), with the two
// tow cables coiled on it.
function sternSlat(P:TankBuilderPort):void{
  const bar=(a:Point,b:Point,r:number)=>P.addEquipment('hullOpenLattice',beamBetween(a,b,r,8));
  const Z=-3.80,low=.98,high=1.72,half=1.46;
  const {meshes,dispose}=stock(P,['hull','hullDetail']);
  try{
    for(const x of [-1.00,-.38,.38,1.00])for(const y of [low+.10,high-.12]){
      const seat=hit(meshes,new THREE.Vector3(x,y,-4.6),new THREE.Vector3(0,0,1),'a stern slat arm',P.spec.id);
      P.addEquipment('hullDark',box(.10,.07,.03),x,y,seat.z-.012);
      bar([x,y,seat.z],[x,y,Z],.018);
    }
  }finally{dispose();}
  for(const y of [low,high])bar([-half,y,Z],[half,y,Z],.020);
  for(const x of [-half,half])bar([x,low,Z],[x,high,Z],.020);
  const n=Math.round(2*half/.10);
  for(let i=1;i<n;i++)P.addEquipment('hullOpenLattice',box(.045,high-low,.010),-half+2*half*i/n,(low+high)/2,Z);
  // two tow cables, each coiled in a flat loop on the slat face
  for(const side of [-1,1]){
    const pts:THREE.Vector3[]=[];
    for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;pts.push(new THREE.Vector3(side*.72+.55*Math.cos(a),1.30+.24*Math.sin(a),Z-.045));}
    P.addEquipment('hullDark',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),96,.016,8,true));
    P.addEquipment('hullDark',box(.05,.10,.04),side*.72,1.55,Z-.03);
  }
}

export function addT72B3M2022Kit(P:TankBuilderPort):void{
  sternSlat(P);
  cheekContainers(P);glacisChevrons(P);snorkel(P);canopy(P);jammer(P);radioMast(P);engineBaySlat(P);
}
