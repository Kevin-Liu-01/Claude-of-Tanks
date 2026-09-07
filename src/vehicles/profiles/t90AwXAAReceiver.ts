// First-party folded stock, stepped pivot body and open return guard. Only
// scalar dimensions/planes from the local AW reference; no imported topology.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Pair=readonly[number,number];
const PIVOT=T90_AW_X_SOURCE_DATUMS.turretPivot;
function sideProfile(x0:number,x1:number,outline:readonly Pair[]):THREE.BufferGeometry{
  // Use -Z,Y as the planar basis; the proper Y rotation maps its extrusion
  // onto +X without mirroring the authored winding.
  const ring=outline.map(([z,y])=>[-z,y] as const).reverse();
  return sectionSolid([{z:x0,ring},{z:x1,ring}]).rotateY(Math.PI/2);
}
function equipment(P:TankBuilderPort,g:THREE.BufferGeometry):void{
  P.addEquipment('turretDetail',g,-PIVOT[0],-PIVOT[1],-PIVOT[2]);
}
function pivotBody(P:TankBuilderPort):void{
  // The thick left cheek has two raised lobes and a genuine relieved upper
  // step. The much narrower right bosses must not inherit this full height.
  const lower:Pair[]=[[-.04643,2.58448],[-.030,2.560],[-.005,2.537],
    [.025,2.508],[.048,2.492],[.075,2.483],[.11,2.481],[.145,2.486],
    [.177,2.492],[.209,2.520],[.240,2.571],[.27247,2.62558]];
  const upper:Pair[]=[[.25187,2.696],[.231,2.716],[.211,2.728],[.177,2.73788],
    [.144,2.73788],[.08787,2.669],[.07867,2.668],[.056,2.67828],[.04537,2.67628]];
  equipment(P,sideProfile(-.4934,-.41915,[...lower,...upper]));
  equipment(P,KIT.cylX(.0858,.0106,24).translate(-.41405,2.57888,.05237));
  equipment(P,KIT.cylX(.06125,.1330,12).translate(-.34245,2.57913,.05237));
  equipment(P,KIT.cylX(.04735,.0460,16).translate(-.25310,2.57913,.05237));
  // Separate upper receiver return over the forward boss, not a tall box
  // across the right-hand circular pivot's open quadrants.
  equipment(P,sideProfile(-.4193,-.3550,[[.08787,2.641],[.112,2.576],
    [.15277,2.57968],[.211,2.57968],[.240,2.592],[.240,2.687],
    [.211,2.712],[.192,2.72608],[.15277,2.72608]]));
}
function channel(P:TankBuilderPort):void{
  // The supplied source contains the empty mounting stock, not a complete
  // secondary weapon. Do not give this bracket a recognized-MG marker.
  const add=(slot:'turretDetail'|'turretDark',g:THREE.BufferGeometry,x=0,y=0,z=0):void=>{
    P.addEquipment(slot,g,x-PIVOT[0],y-PIVOT[1],z-PIVOT[2]);
  };
  const stock=(slot:'turretDetail'|'turretDark',x0:number,x1:number,y0:number,y1:number,z0:number,z1:number):void=>{
    add(slot,KIT.box(x1-x0,y1-y0,z1-z0),(x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
  };
  // Unequal-height side rails and interrupted 7.8mm lower web. Three actual
  // floor openings remain air, including the oblique central cross strap.
  stock('turretDark',-.63185,-.61815,2.62848,2.65968,.06607,.56947);
  stock('turretDark',-.54835,-.53415,2.62848,2.65968,.06607,.60417);
  stock('turretDark',-.61815,-.54835,2.62848,2.63628,.06607,.24317);
  stock('turretDark',-.61815,-.54835,2.62848,2.63628,.45667,.47817);
  const diagonal=KIT.box(.077,.0078,.0254).translate(-.58325,2.63238,.360);
  diagonal.applyMatrix4(new THREE.Matrix4().set(1,0,0,0,0,1,0,0,.64,0,1,.64*.58325,0,0,0,1));
  add('turretDark',diagonal);
  stock('turretDark',-.61815,-.54835,2.62848,2.63628,.54947,.60417);
  stock('turretDark',-.63185,-.61085,2.62848,2.68018,.56947,.60417);
  stock('turretDark',-.54835,-.53415,2.62848,2.68018,.56947,.60417);
  // Paired rounded mounting ears on the original stock, not a central
  // fictitious barrel. The physical channel remains aligned along +Z.
  for(const [x0,x1]of [[-.65725,-.63815],[-.53415,-.51555]]){
    stock('turretDetail',x0-.0034,x1,2.62848,2.65968,.16867,.23297);
    add('turretDetail',sideProfile(x0,x1,[[.16867,2.65968],[.23297,2.65968],
      [.22867,2.69098],[.217,2.705],[.20082,2.70758],[.185,2.705],[.17297,2.69098]]));
  }
  // Actual transverse retaining pins connect the empty stock to the
  // unchanged fork arms. 0.1mm hidden axial engagement avoids a zero-area
  // contact at the rounded source export seam.
  add('turretDetail',KIT.cylX(.02635,.0065,20),-.65995,2.67533,.20082);
  add('turretDetail',KIT.cylX(.02635,.0070,20),-.51215,2.67533,.20082);
}
function curvedGuard(P:TankBuilderPort):void{
  // Narrow side returns, short curved rear bridge, and inclined front leaf.
  // There is deliberately no surface spanning the large central opening.
  const rear:Pair[]=[[.23257,2.76518],[.25607,2.69878],[.26127,2.69778],
    [.24637,2.74268],[.23787,2.76418],[.24487,2.79158],[.26087,2.81008],
    [.25537,2.81208],[.23917,2.79248]];
  equipment(P,sideProfile(-.52145,-.31175,rear));
  equipment(P,sideProfile(-.52145,-.51605,[[.24637,2.70128],[.52877,2.62848],
    [.52387,2.67048],[.24637,2.74268]]));
  equipment(P,sideProfile(-.31715,-.31175,[[.25607,2.69878],[.52877,2.62848],
    [.52387,2.67048],[.325,2.722],[.296,2.8035],[.26087,2.81008]]));
  equipment(P,sideProfile(-.52145,-.31175,[[.52337,2.63038],[.52877,2.62848],
    [.52387,2.67048],[.51877,2.67138]]));
}
function foldedClips(P:TankBuilderPort):void{
  const rear=.06177,front=.09197,y=(z:number)=>(2.2796697596+.5424439164*z)/.8400920173;
  equipment(P,sideProfile(-.48265,-.35865,[[rear,y(rear)-.0084],[front,y(front)-.0084],
    [front,y(front)],[rear,y(rear)]]));
  for(const [x0,x1,low,zEnd]of [[-.50385,-.49635,2.64698,.16137],[-.34495,-.33735,2.71248,.11847]]){
    equipment(P,sideProfile(x0,x1,[[.07347,2.73588],[zEnd-.0303,low],
      [zEnd,low+.0205],[.10367,2.75538]]));
  }
  // The two short bend shoulders connect the cross member into the ears.
  for(const [x0,x1]of [[-.5015,-.4819],[-.3594,-.3395]])
    equipment(P,sideProfile(x0,x1,[[.067,2.7359],[.1037,2.7554],[.0962,2.7672],[.062,2.7535]]));
  equipment(P,sideProfile(-.42725,-.38305,[[.07827,2.69978],[.09857,2.69198],
    [.09857,2.703],[.08677,2.71148],[.08007,2.70758]]));
  // Small rolled clip around the upper receiver; its exposed face uses the
  // measured crossfall, not a bounding box enclosing the empty curl.
  const yTop=(x:number,z:number)=>(1.946314732-.413468449*x-.502638367*z)/.759209137;
  const ring=(z:number)=>[[-.39935,yTop(-.39935,z)-.009],[-.37865,yTop(-.37865,z)-.009],
    [-.37865,yTop(-.37865,z)],[-.39935,yTop(-.39935,z)]] as const;
  equipment(P,sectionSolid([{z:.09857,ring:ring(.09857)},{z:.14077,ring:ring(.14077)}]));
}
function hangingChute(P:TankBuilderPort):void{
  // The separate receiving bag/chute has a closed low fold and an open
  // mouth. These restrained section dimensions simplify only the small
  // flexible creases, never by filling the central passage with a box.
  const rows:readonly(readonly[number,number,number,number,number])[]=[
    [2.385,-.469,-.368,.337,.475],[2.400,-.481,-.347,.319,.493],
    [2.440,-.503,-.328,.292,.512],[2.500,-.510,-.322,.277,.525],
    [2.570,-.516,-.315,.268,.531],[2.635,-.524,-.308,.254,.533],
  ];
  const rings=rows.map(([y,l,r,back,front])=>({y,outer:[[l,back],[r,back],[r,front],[l,front]] as const,
    inner:[[l+.006,back+.006],[r-.006,back+.006],[r-.006,front-.006],[l+.006,front-.006]] as const}));
  for(let side=0;side<4;side++){
    const j=(side+1)%4;
    const sections=rings.map(row=>({z:row.y,ring:[row.outer[j],row.outer[side],row.inner[side],row.inner[j]]
      .map(([x,z])=>[x,-z] as const)}));
    const g=sectionSolid(sections).rotateX(-Math.PI/2);
    // Last section's rear lip rises to the actual guard receiving seam;
    // forward rim remains low, retaining the sloping source mouth.
    const a=g.getAttribute('position');for(let k=0;k<a.count;k++)if(a.getY(k)>2.634)
      a.setY(k,2.630+( .533-a.getZ(k))*.307);
    a.needsUpdate=true;g.computeVertexNormals();equipment(P,g);
  }
  equipment(P,KIT.box(.102,.006,.139).translate(-.4185,2.386,.406));
}
export function addT90AWAAReceiver(P:TankBuilderPort):void{
  pivotBody(P);channel(P);curvedGuard(P);foldedClips(P);hangingChute(P);
}
