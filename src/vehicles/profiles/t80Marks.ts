// The T-80 (1976), T-80B (1978) and T-80BV (1985): lane t80-family-274 (the owner, 2026-11-20: "lets redesign the t80, t80b,
// t80bv, and their ukrainian counterparts to be like our t90 fixes - we have old models with certain design styles that make
// them unique, modern versions of the base versions of the tanks, and need to make unique versions of them now!").
// As the T-90 marks build on their source-X twins (docs/references/tanks/t90-family.md), the three early marks build on
// the T-80U X hull, running gear and turbine deck (profiles/t80uX.ts; the owner on the Object 292, 2026-11-04: "dont use the
// old t80 hull only use modern new hulls like the nnew t80 x hulll"): the T-80B's hull is the T-80U's, less the U's rubber
// bow mat and its Kontakt-5. On it each mark carries the cast turret the T-80U replaced, lower and rounder than the U's
// (the one casting the three share, the T-80 and T-80B castings differ only inside), and its own era kit:
// - T-80 (1976): a bare casting and glacis; the TPD-2-49 sight on the left of the roof and its rangefinder housing across
//   the right front; the L-2 Luna on the gun's left with the TPN-1-49-23 night sight outboard of it; no smoke grenade
//   launchers; three stowage boxes on the casting's left flank; narrow painted steel side screens and bare steel fender ends.
// - T-80B (1978): the 1A33 fire control's 1G42 sight head (left) and the 9K112 Kobra's guidance box (right front, the
//   system's one outside sign); the 902A Tucha's tubes on the cheeks, five left and four right; the L-4 Luna on the gun's
//   right; the DVE-BS mast; two stowage boxes on the left flank; full-length black rubber skirts and wide rubber nose flaps.
// - T-80BV (1985): the T-80B with Kontakt-1: double-stacked wedge arrays on the cheeks (eight columns left, five right), a
//   grid on the roof's right front, the glacis field tapering from eleven containers under the splash board to four at the
//   nose and a row along the top of each skirt's front two-thirds; its 902A banks moved back to the flanks; the late
//   service's tall shield round the commander's NSVT and the two 200 L drums on the T-80U X stern cradles.
// All three carry the unditching log, the snorkel tube on the casting's rear and the self-entrenching blade under the bow.
// Photographs and sources: ~/cot-lanes/t80-family-274-evidence/photos (IDENTITY.md). First-party procedural geometry:
// Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {castSections,beamBetween,blindTube,type CastStation,type Point3} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {libraryRoofMg} from './libraryRoofMg.ts';
import {machinedRing} from '../machineGunGeometry.ts';
import {addT90CradleDrums} from './t90CradleDrums.ts';
import {stowagePart} from './stowagePart.ts';
import {buildT80UXHullBase,buildT80UXGun,T80U_X_YAW,T80U_X_TRUNNION} from './t80uX.ts';
import {T80U_X_RING_RAISE_M} from '../t80uXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export type T80Mark='t80'|'t80b'|'t80bv';
const YAW:Point3=T80U_X_YAW,GUN:Point3=T80U_X_TRUNNION;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=24)=>KIT.cylY(r,r,h,n);
const BASE=YAW[1];

/** The early cast turret, authored like the T-80U X casting (hull frame, on the yaw datum; the turret rides the U's raised
 * race): [z, left half-width (+x, the gunner's side), right half-width (-x, the commander's), crown, base, shoulder]. A
 * low wall to the shoulder and a broad dome over it, rounder in plan than the U's and 2.4 cm lower at the crown; its nose
 * narrows to the embrasure either side of the gun. The gunner's side bulges 3 cm more (the casting's left cheek). */
const CAST:readonly CastStation[]=[
  [-1.30,.06,.06,1.78,BASE,1.70],[-1.20,.60,.58,1.92,BASE,1.73],[-.98,.93,.91,2.02,BASE,1.75],
  [-.68,1.14,1.12,2.09,BASE,1.765],[-.34,1.26,1.24,2.135,BASE,1.775],[0,1.31,1.29,2.148,BASE,1.78],
  [.30,1.31,1.28,2.145,BASE,1.78],[.60,1.24,1.21,2.12,BASE,1.775],[.88,1.09,1.05,2.065,BASE,1.765],
  [1.12,.87,.84,1.99,BASE,1.75],[1.32,.58,.56,1.905,BASE,1.735],[1.45,.30,.29,1.835,BASE,1.725],
];
const CAST_Z0=CAST[0][0],CAST_Z1=CAST[CAST.length-1][0];
function station(z:number):CastStation{
  const c=Math.min(CAST_Z1,Math.max(CAST_Z0,z));
  for(let i=1;i<CAST.length;i++){
    const a=CAST[i-1],b=CAST[i];
    if(c<=b[0]){const t=(c-a[0])/(b[0]-a[0]);return a.map((v,k)=>v+(b[k]-v)*t) as unknown as CastStation;}
  }
  return CAST[CAST.length-1];
}
/** The casting's half-width at (z, y) on the side of x (castSections' ring: a wall to the shoulder, then the dome). */
function halfWidth(z:number,y:number,x:number):number{
  if(z<CAST_Z0||z>CAST_Z1)return 0;
  const [,l,r,t,,s]=station(z),w=x>=0?l:r;
  if(y<=s)return w;
  if(y>=t)return 0;
  const sin=((y-s)/(t-s))**(1/.56);
  return w*Math.cos(Math.asin(Math.min(1,sin)));
}
/** The casting's top over (x, z). */
function roof(x:number,z:number):number{
  const [,l,r,t,,s]=station(z),w=x>=0?l:r,c=Math.min(1,Math.abs(x)/w);
  return s+(t-s)*Math.sin(Math.acos(c))**.56;
}
const PLAN_CZ=.10;
/** Where a ray from the casting's plan centre at bearing phi (0 = the gun's line, + toward +x) leaves the casting at height y. */
function exitAt(phi:number,y:number):number{
  const dx=Math.sin(phi),dz=Math.cos(phi);let lo=0,hi=2;
  for(let k=0;k<40;k++){const m=(lo+hi)/2,x=m*dx,z=PLAN_CZ+m*dz;if(Math.abs(x)<halfWidth(z,y,x))lo=m;else hi=m;}
  return lo;
}

function onTurret(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}
function sight(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,ry=0):void{
  P.addModuleVisual('optics',bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],0,ry,0);
}

// ---------------------------------------------------------------------------------------------------------- hull fit --

const GLACIS:readonly(readonly[number,number])[]=[[1.84,1.487],[2.10,1.387],[2.40,1.252],[2.70,1.150],[3.015,1.010]];
function glacisAt(z:number):{y:number;tilt:number}{
  for(let i=1;i<GLACIS.length;i++){
    const [z0,y0]=GLACIS[i-1],[z1,y1]=GLACIS[i];
    if(z<=z1||i===GLACIS.length-1)return {y:y0+(y1-y0)*(z-z0)/(z1-z0),tilt:Math.atan2(y0-y1,z1-z0)};
  }
  return {y:GLACIS[0][1],tilt:0};
}
const LAMP_X=.8475,LAMP_Z=2.62;
/** The glacis' V splash board: its apex on the centreline, its arms sweeping back to the plate's sides. */
const V_APEX=2.16,V_SWEEP=.24,V_HALF=1.0;
const vBack=(x:number)=>V_SWEEP*Math.min(1,Math.abs(x)/V_HALF);

/** The glacis' fixed fit: the splash board under the turret's front, the two headlights in their hoop guards, the tow hooks
 * at the plate's foot and the tow cables run up past the lamps. Hull frame. */
function glacisFit(P:TankBuilderPort):void{
  // the V splash board: two boards from the plate's sides at z 1.92 to its apex on the centreline at 2.16
  for(const s of [-1,1]){
    const z0=V_APEX,z1=V_APEX-V_SWEEP,len=Math.hypot(V_HALF,z0-z1),zm=(z0+z1)/2,{y,tilt}=glacisAt(zm),yaw=s*Math.atan2(V_HALF,-(z0-z1));
    P.addEquipment('hullDetail',box(.10,.024,len),s*V_HALF/2,y+.012,zm,tilt,yaw,0);
    P.addEquipment('hullDetail',box(.016,.08,len),s*V_HALF/2,y+.05,zm,tilt,yaw,0);
  }
  for(const s of [-1,1]){
    const g=glacisAt(LAMP_Z),lx=s*LAMP_X;
    P.addEquipment('hullDetail',box(.20,.05,.16),lx,g.y+.02,LAMP_Z-.02,g.tilt,0,0);
    P.addEquipment('hullDetail',cylZ(.084,.09,16),lx,g.y+.085,LAMP_Z-.035);
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.0735,.074,24),'headlight'),lx,g.y+.085,LAMP_Z);
    for(const dx of [-.075,.075])P.addEquipment('hullDetail',box(.018,.12,.018),lx+dx,g.y+.07,LAMP_Z+.052);
    P.addEquipment('hullDetail',torus(.075,.009,14,5).rotateX(Math.PI/2).scale(1,.9,1),lx,g.y+.13,LAMP_Z+.052);
    const h=glacisAt(2.90);
    P.addEquipment('hullDetail',box(.17,.07,.15),s*.70,h.y+.02,2.90,h.tilt,0,0);
    P.addEquipment('hullDark',torus(.055,.016,12,6).rotateZ(Math.PI/2),s*.70,h.y+.085,2.945,h.tilt,0,0);
    const path=([[.70,2.86],[.62,2.62],[.60,2.40],[.72,2.18],[.95,1.95]] as const).map(([x,z])=>[s*x,glacisAt(z).y+.022,z] as [number,number,number]);
    KIT.towCable(P,path,.019);
  }
}

/** The self-entrenching blade folded against the lower front plate (the X hull core's plate rises from y .548 at z 2.40 to
 * .916 at its nose, 3.015): a plate 35 mm proud of it across the hull's width, its foot curled forward, five ribs on its
 * face and the two hinge lugs at its top. Hull frame. */
function dozerBlade(P:TankBuilderPort):void{
  const a=[2.48,.596] as const,b=[2.98,.895] as const,len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const d=[(b[0]-a[0])/len,(b[1]-a[1])/len] as const,n=[d[1],-d[0]] as const,off=.035;   // n: out and down, (z, y)
  const th=Math.atan2(d[0],d[1]);   // turns the box's +y onto the plate's run
  const c=[(a[0]+b[0])/2+n[0]*off,(a[1]+b[1])/2+n[1]*off] as const;
  P.add('hull',box(1.96,len,.03),0,c[1],c[0],th,0,0);
  P.add('hull',box(1.96,.10,.03),0,a[1]+n[1]*(off+.03)-.03,a[0]+n[0]*(off+.03)+.02,th+.9,0,0);   // the curled foot
  for(const x of [-.84,-.42,0,.42,.84])P.addEquipment('hullDetail',box(.03,len-.06,.035),x,c[1]+n[1]*.03,c[0]+n[0]*.03,th,0,0);
  for(const s of [-1,1]){
    P.addEquipment('hullDetail',box(.12,.10,.10),s*.62,b[1]-.02,b[0]-.02);
    P.addEquipment('hullDark',cylX(.032,.16,10),s*.62,b[1]-.01,b[0]+.02);
  }
}

/** The stern: the unditching log on its chains across the lower rear plate and the rubber mud flaps at the fender tails; the
 * BV's late service adds two 200 L drums on the T-80U X cradles (the X build carries them empty). Hull frame. */
function stern(P:TankBuilderPort,m:T80Mark):void{
  // the drums lie tangent on the sloping upper rear plate (z -3.13, y 1.547 to z -3.36, y 1.347), 4 mm into it, over the cradles
  if(m==='t80bv')addT90CradleDrums(P,1.664,-3.433,[[-1.542,-1.179],[1.179,1.542]]);
  // (the X hull tapers to a .533 half-width at its stern face, so a log wider than ±.70 would close the pocket between the
  // taper and the fender tails into a plan hole: the log spans the stern face and its chains)
  P.addEquipment('hullDetail',stowagePart(cylX(.135,1.40,14)),0,1.06,-3.49);
  for(const x of [-.50,0,.50]){
    P.addEquipment('hullDark',stowagePart(torus(.142,.012,16,5).rotateY(Math.PI/2)),x,1.06,-3.49);
    P.addEquipment('hullDark',stowagePart(beamBetween([x,1.19,-3.45],[x,1.30,-3.33],.010)),0,0,0);
  }
  if(m!=='t80')for(const s of [-1,1])P.addMudguard('t80-mark-stern-flap','hullRubber',box(.62,.36,.012),s*1.40,1.00,-3.37,.10,0,0);
}

/** The side screens under the T-80U X fender lip ([z, top, foot] of its apron; the face leans out from x 1.685 at the lip to
 * 1.80 at the foot): the T-80's narrow painted steel screen, a 30 cm band in five plates with a rolled lower edge, wheels
 * bare beneath; the B marks' full-depth black rubber skirts, seven overlapping sheets a side. And the fender noses: the
 * T-80's bare steel ends with a short steel splash plate, the B marks' wide rubber flaps flaring forward over the tracks. */
const APRON:readonly(readonly[number,number,number])[]=[[-2.882,1.414,.886],[-2.45,1.458,.815],[-1.22,1.504,.782],[1.75,1.449,.762],[2.886,1.418,.782]];
function apronAt(z:number):{top:number;foot:number}{
  for(let i=1;i<APRON.length;i++){
    const a=APRON[i-1],b=APRON[i];
    if(z<=b[0]||i===APRON.length-1){const t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));return {top:a[1]+(b[1]-a[1])*t,foot:a[2]+(b[2]-a[2])*t};}
  }
  return {top:APRON[0][1],foot:APRON[0][2]};
}
const SCREEN_X0=1.685,SCREEN_X1=1.80;
function screenX(z:number,y:number):number{const {top,foot}=apronAt(z);return SCREEN_X0+(SCREEN_X1-SCREEN_X0)*(top-y)/(top-foot);}
function sidePanel(P:TankBuilderPort,label:string,bucket:string,side:number,z0:number,z1:number,depth:(z:number)=>number,out=0):void{
  const ring=(z:number):[number,number][]=>{
    const {top}=apronAt(z),bottom=top-depth(z),xi=screenX(z,top)+out,xo=screenX(z,bottom)+out,t=.010;
    const r:[number,number][]=[[xo,bottom],[xo+t,bottom],[xi+t,top],[xi,top]];
    return side<0?r.map(([x,y])=>[-x,y] as [number,number]).reverse():r;
  };
  const zs=[z0,...APRON.map(r=>r[0]).filter(z=>z>z0+.02&&z<z1-.02),z1];
  P.addMudguard(label,bucket,sectionSolid(zs.map(z=>({z,ring:ring(z)}))));
}
function sideScreens(P:TankBuilderPort,m:T80Mark):void{
  const Z0=-2.86,Z1=2.88;
  for(const s of [-1,1]){
    if(m==='t80'){
      const n=5,len=(Z1-Z0)/n;
      for(let i=0;i<n;i++)sidePanel(P,'t80-steel-screen','hull',s,Z0+i*len+.006,Z0+(i+1)*len-.006,()=>.30);
      for(let i=0;i<n;i++){const z=Z0+(i+.5)*len,y=apronAt(z).top-.30;P.addEquipment('hullDetail',box(.03,.03,len-.04),s*(screenX(z,y)+.012),y+.012,z);}
      P.add('hull',box(.62,.24,.014),s*1.38,1.06,3.37,-.12,0,0);
      continue;
    }
    const n=7,len=(Z1-Z0)/n;
    for(let i=0;i<n;i++)sidePanel(P,'t80b-rubber-skirt','hullRubber',s,Z0+i*len-(i%2?.03:0),Z0+(i+1)*len+(i%2?.03:0),(z)=>apronAt(z).top-apronAt(z).foot,i%2?.012:0);
    for(let i=0;i<n;i++){const z=Z0+i*len,y=apronAt(z).top-.05;P.addEquipment('hullDetail',cylX(.014,.016,8),s*(screenX(z,y)+.02),y,z+.10);}
    // the nose flap: clamped on the fender's top, round its nose and flaring forward and down in front of the track
    // (the T-80U X fender's nose falls from y 1.226 at z 3.20 to .939 at 3.36: the flap lies on it 1 cm proud, then hangs
    // from its edge and flares forward over the track)
    const nose=Math.atan2(3.36-3.20,1.226-.939),nl=Math.hypot(.16,.287);
    P.addMudguard('t80b-nose-flap','hullRubber',box(.80,nl,.012),s*1.38,(1.226+.939)/2+.008*Math.sin(nose),3.28+.008*Math.cos(nose),-nose,0,0);
    P.addMudguard('t80b-nose-flap','hullRubber',box(.80,.30,.012),s*1.38,.80,3.385,.15,0,0);
    P.addEquipment('hullDetail',box(.82,.025,.03),s*1.38,1.236,3.195,-nose,0,0);
  }
}

// ---------------------------------------------------------------------------------------------------------- turret --

/** The casting, the gun's cast embrasure collar and the ring race (the T-80U X's machined race, raised as its casting is). */
function casting(P:TankBuilderPort):void{
  P.add('turret',castSections(CAST,YAW));
  P.add('turret',cylY(.994,.044,40),0,-.006,0);
  // the embrasure: a cast lip round the gun's slot either side of the mantlet
  for(const s of [-1,1])onTurret(P,'turret',box(.20,.30,.16),s*.31,1.79,1.40,0,-s*.25,0);
  // lifting eyes on the cheeks and the casting's rear
  for(const [x,z] of [[.86,.70],[-.84,.70],[.46,-1.08],[-.45,-1.08]] as const)KIT.liftEye(P,'turretDetail',x-YAW[0],roof(x,z)-YAW[1]-.01,z-YAW[2],0);
}

/** The commander's cupola (right) with its TKN-3 sight and the NSVT on its ring, the gunner's hatch (left), periscopes and
 * the ventilator dome. */
function roofStations(P:TankBuilderPort,m:T80Mark):void{
  const cx=-.60,cz=-.20,cy=roof(cx,cz)-.035;
  P.addCupola('turret',cylY(.36,.10,28),cx-YAW[0],cy+.05-YAW[1],cz-YAW[2]);
  P.addCupola('turret',cylY(.30,.06,28),cx-YAW[0],cy+.13-YAW[1],cz-.03-YAW[2]);
  onTurret(P,'turretDetail',cylY(.33,.03,28),cx,cy+.115,cz);
  sight(P,'turretDetail',box(.20,.16,.15),cx,cy+.20,cz+.22);
  sight(P,'turretGlass',box(.16,.06,.01),cx,cy+.22,cz+.30);
  for(const a of [-1.1,-.4,1.6,2.4])onTurret(P,'turretDetail',box(.09,.06,.06),cx+.31*Math.sin(a),cy+.13,cz+.31*Math.cos(a),0,a,0);
  // the NSVT on the cupola's ring, ahead of the hatch
  libraryRoofMg(P,{station:'t80MarkCommanderNsvtStation',cls:'nsvt',seat:[cx-.02-YAW[0],cy+.16-YAW[1],cz+.12-YAW[2]]});
  const gx=.46,gz=-.40,gy=roof(gx,gz)-.03;
  P.addCupola('turret',cylY(.33,.08,28),gx-YAW[0],gy+.04-YAW[1],gz-YAW[2]);
  onTurret(P,'turretDetail',cylY(.30,.03,28),gx,gy+.095,gz-.02);
  onTurret(P,'turretDetail',box(.08,.05,.10),gx+.28,gy+.10,gz-.06);
  onTurret(P,'turretDetail',box(.12,.07,.10),gx-.05,gy+.11,gz+.30);
  // the ventilator dome behind the gun
  onTurret(P,'turretDetail',KIT.cylY(.12,.15,.08,20),.05,roof(.05,-.70)+.02,-.70);
  if(m==='t80bv'){
    // the late service's tall shield round the NSVT: a front plate with its vision slot and two cheeks, on the cupola ring
    const fy=cy+.42;
    onTurret(P,'turretDetail',box(.60,.52,.022),cx,fy,cz+.40,-.08,0,0);
    onTurret(P,'turretDark',box(.20,.06,.025),cx,fy+.08,cz+.40,-.08,0,0);
    for(const s of [-1,1])onTurret(P,'turretDetail',box(.022,.46,.34),cx+s*.30,fy-.02,cz+.24,0,s*.25,0);
    onTurret(P,'turretDetail',box(.62,.04,.06),cx,cy+.17,cz+.38);
  }
  if(m==='t80')return;
  // DVE-BS crosswind sensor mast at the roof's centre behind the hatches (the 1A33 fire control's), folded up
  const wx=-.05,wz=-.62,wy=roof(wx,wz)-.02;
  onTurret(P,'turretDetail',cylY(.05,.05,12),wx,wy+.02,wz);
  onTurret(P,'turretDetail',cylY(.016,.52,8),wx,wy+.30,wz);
  onTurret(P,'turretDetail',KIT.cylY(.05,.03,.10,12),wx,wy+.60,wz);
}

/** The sights ahead of the hatches. T-80: the TPD-2-49's low head with its shutters on the left and the long, low
 * rangefinder housing across the right front ahead of the commander's cupola. B marks: the 1G42's tall box with its two
 * armoured doors on the left and the Kobra's guidance box on the right front (the 9K112's one outside sign). */
function frontSights(P:TankBuilderPort,m:T80Mark):void{
  const x=.58,z=.36,y=roof(x,z)-.03;
  if(m==='t80'){
    sight(P,'turretDetail',box(.26,.14,.30),x,y+.07,z);
    sight(P,'turretDetail',box(.28,.03,.32),x,y+.15,z);
    for(const s of [-1,1])sight(P,'turretDetail',box(.10,.07,.02),x+s*.065,y+.10,z+.155);
    sight(P,'turretGlass',box(.18,.05,.01),x,y+.10,z+.152);
    const rz=.42,rx=-.55,ry=roof(rx,rz)-.03;
    onTurret(P,'turretDetail',box(.74,.13,.22),rx,ry+.065,rz,0,.10,0);
    onTurret(P,'turretDetail',box(.76,.025,.24),rx,ry+.14,rz,0,.10,0);
    for(const s of [-1,1])onTurret(P,'turretDark',cylZ(.045,.02,14),rx+s*.33,ry+.07,rz+.12);
    return;
  }
  sight(P,'turretDetail',box(.34,.26,.40),x,y+.13,z);
  sight(P,'turretDetail',box(.36,.03,.42),x,y+.275,z);
  sight(P,'turretGlass',box(.24,.09,.01),x,y+.18,z+.201);
  for(const s of [-1,1])sight(P,'turretDetail',box(.13,.12,.025),x+s*.07,y+.18,z+.215,s*.35);
  const kx=-.56,kz=.42,ky=roof(kx,kz)-.03;
  onTurret(P,'turretDetail',box(.30,.22,.30),kx,ky+.11,kz);
  onTurret(P,'turretDetail',box(.32,.025,.32),kx,ky+.235,kz);
  onTurret(P,'turretDark',box(.20,.10,.01),kx,ky+.13,kz+.152);
}

/** The IR searchlight linked to the gun: the T-80's L-2 on its left with the TPN-1-49-23 night sight's head outboard of it on
 * the roof; the B marks' L-4 on its right. */
function lunaSearchlight(P:TankBuilderPort,m:T80Mark):void{
  const s=m==='t80'?1:-1,r=m==='t80'?.17:.19,x=s*.50,y=.06,z=.16;
  P.addGunExtra(cylZ(r,.28,24),x,y,z);
  P.addGunExtraDark(torus(r-.005,.014,24,6),x,y,z+.14);
  P.addGunExtra(markVehicleNightLens(cylZ(r-.02,.01,24),'headlight',{tint:'red'}),x,y,z+.142);
  P.addGunExtra(box(.30,.06,.12),x-s*.20,y-.04,z-.02);
  P.addGunExtraDark(box(.06,.20,.06),x-s*.06,y-.16,z-.02);
  if(m!=='t80')return;
  const nx=.95,nz=.70,ny=roof(nx,nz)-.03;
  sight(P,'turretDetail',box(.16,.16,.20),nx,ny+.08,nz);
  sight(P,'turretGlass',box(.11,.05,.01),nx,ny+.10,nz+.101);
}

/** The 902A Tucha's 81 mm tubes, each on a cast shoe, fanned forward and up: on the B's cheeks, five left and four right; on
 * the BV's flanks behind its Kontakt-1 arrays, four a side. */
function smokeBanks(P:TankBuilderPort,m:T80Mark):void{
  for(const s of [-1,1]){
    const n=m==='t80bv'?4:s>0?5:4,a0=m==='t80bv'?1.42:.66,step=m==='t80bv'?.13:.13,y=m==='t80bv'?1.80:1.86;
    for(let i=0;i<n;i++){
      const phi=s*(a0+i*step),rho=exitAt(phi,y)+.04,x=rho*Math.sin(phi),z=PLAN_CZ+rho*Math.cos(phi);
      onTurret(P,'turretDetail',box(.10,.06,.14),x,y-.06,z,0,phi,0);
      onTurret(P,'turretDark',markSmokeTube(blindTube(.044,.033,.26,.17,20),[0,0,1],true),x,y,z,-.52,phi*.55,0);
    }
  }
}

/** The casting's rear and left flank: the snorkel tube on its brackets across the rear; the stowage boxes on the left flank,
 * three on the T-80, two on the B marks (aft of the BV's flank smoke banks). */
function turretRear(P:TankBuilderPort,m:T80Mark):void{
  onTurret(P,'turretDetail',cylX(.165,1.80,24),0,1.83,-1.42);
  for(const s of [-1,1]){
    onTurret(P,'turretDark',torus(.168,.011,24,6).rotateY(Math.PI/2),s*.45,1.83,-1.42);
    onTurret(P,'turretDetail',beamBetween([s*.45,1.74,-1.12],[s*.45,1.79,-1.34],.018),0,0,0);
  }
  // the stowage boxes on the left flank: three on the T-80, two (numbered) on the B marks
  const n=m==='t80'?3:2;
  for(let k=0;k<n;k++){
    const z=(m==='t80bv'?-.40:.28)-k*.36,y=1.70,x=halfWidth(z,y,1)+.11;
    onTurret(P,'turretDetail',box(.22,.30,.32),x,y,z,0,.10-k*.10,0);
    onTurret(P,'turretDetail',box(.24,.02,.34),x,y+.16,z,0,.10-k*.10,0);
    onTurret(P,'turretDark',box(.02,.10,.06),x+.11,y+.10,z,0,.10-k*.10,0);
  }
}

// ------------------------------------------------------------------------------------------------------ Kontakt-1 --

/** One 4S20 container (252 x 132 x 69 mm in its steel box) seated on a surface at p whose outward normal turns phi in plan
 * and leans back by tilt, its hit face outward; its mounting shoe goes into the surface behind it. */
const K1_COUNT=new WeakMap<TankBuilderPort,Record<string,number>>();
function k1(P:TankBuilderPort,cluster:string,owner:'hull'|'turret',p:readonly[number,number,number],phi:number,tilt:number,roll=0):void{
  const counts=K1_COUNT.get(P)??{};counts[cluster]=(counts[cluster]??0)+1;K1_COUNT.set(P,counts);
  const T=.075,g=box(.26,.14,T).rotateZ(roll).rotateX(-tilt).rotateY(phi);
  const n=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(1,0,0),-tilt).applyAxisAngle(new THREE.Vector3(0,1,0),phi);
  const c=new THREE.Vector3(...p).addScaledVector(n,T/2-.012);
  const lid=box(.22,.10,.01).rotateZ(roll).rotateX(-tilt).rotateY(phi);
  const cl=c.clone().addScaledVector(n,T/2+.002);
  const shoe=box(.20,.10,.06).rotateZ(roll).rotateX(-tilt).rotateY(phi),cs=new THREE.Vector3(...p).addScaledVector(n,-.02);
  const at=(v:THREE.Vector3)=>owner==='turret'?[v.x-YAW[0],v.y-YAW[1],v.z-YAW[2]] as const:[v.x,v.y,v.z] as const;
  P.addEquipment(owner==='turret'?'turretDetail':'hullDetail',markEraFurniture(shoe),...at(cs));
  P.destructibleCluster(cluster,()=>{
    P.addExternalArmor(owner,markEraHitFaces(g,[n.x,n.y,n.z]),...at(c));
    P.addExternalArmor(owner,markEraFurniture(lid),...at(cl));
  });
}

/** The BV's turret Kontakt-1: on each cheek a wedge array of containers standing on a carrier frame, each column two
 * containers deep, pitched forward like louvres and turned toward the gun's line so the array reads as a saw-toothed wedge
 * (eight columns on the left cheek, five on the right); and a grid of four by four lying on the roof's right front. */
function turretK1(P:TankBuilderPort):void{
  for(const s of [-1,1]){
    const cluster=`turret_era_${s>0?'R':'L'}`,n=s>0?8:5;
    for(let i=0;i<n;i++){
      const a=.34+i*.125,phi=s*a,y=1.78,rho=exitAt(phi,y);
      const yaw=phi-s*.55;
      // the pair stands in a V: the lower container leans back onto the casting, the upper one forward over it
      for(const [off,dy,tilt] of [[.05,-.07,.55],[.11,.09,-.20]] as const){
        const p=[(rho+off)*Math.sin(phi),y+dy,PLAN_CZ+(rho+off)*Math.cos(phi)] as const;
        k1(P,cluster,'turret',p,yaw,tilt,Math.PI/2);
      }
      // the carrier frame from the casting to the containers
      onTurret(P,'turretDark',box(.06,.30,.10),(rho+.01)*Math.sin(phi),y,PLAN_CZ+(rho+.01)*Math.cos(phi),0,phi,0);
    }
  }
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const x=-.30-c*.15,z=1.04-r*.27,y=roof(x,z),slope=(roof(x,z+.05)-roof(x,z-.05))/.10;
    k1(P,'turret_era_L','turret',[x,y,z],0,Math.PI/2+Math.atan(slope),Math.PI/2);
  }
}

/** The BV's glacis field: five chevron courses under the V splash board, tapering from eleven containers to four at the nose, each
 * container's long side down the slope, clear of the lamps and the tow hooks; and one row along the top of each skirt's
 * front two-thirds. Hull frame. */
function hullK1(P:TankBuilderPort):void{
  const counts=[11,10,8,6,4];
  counts.forEach((n,row)=>{
    for(let c=0;c<n;c++){
      const x=(c-(n-1)/2)*.152,z=V_APEX+.10+row*.18-vBack(x),{y,tilt}=glacisAt(z);
      if(Math.hypot(Math.abs(x)-LAMP_X,z-LAMP_Z)<.17)continue;
      if(Math.hypot(Math.abs(x)-.70,z-2.90)<.14)continue;
      k1(P,`glacis_era_${x>=0?'R':'L'}`,'hull',[x,y,z],0,Math.PI/2-tilt,Math.PI/2);
    }
  });
  for(const s of [-1,1])for(let k=0;k<10;k++){
    const z=2.66-k*.37,{top}=apronAt(z),y=top-.10,x=s*(screenX(z,y)+.012),lean=Math.atan2(SCREEN_X1-SCREEN_X0,top-apronAt(z).foot);
    k1(P,`skirt_era_${s>0?'R':'L'}`,'hull',[x,y,z],s*Math.PI/2,-lean);
  }
}

// ------------------------------------------------------------------------------------------------------------ build --

export function buildT80Mark(P:TankBuilderPort,m:T80Mark):void{
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(YAW[0],YAW[1]+T80U_X_RING_RAISE_M,YAW[2]);
  P.addEquipment('hullDetail',machinedRing(.90,1.01,YAW[1]+T80U_X_RING_RAISE_M-.030-1.522,.004,P.q?32:20),YAW[0],1.522,YAW[2]);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  buildT80UXHullBase(P,{apron:false,skirts:false});
  glacisFit(P);dozerBlade(P);stern(P,m);sideScreens(P,m);
  if(m==='t80bv')hullK1(P);
  casting(P);roofStations(P,m);frontSights(P,m);turretRear(P,m);
  if(m!=='t80')smokeBanks(P,m);
  if(m==='t80bv')turretK1(P);
  buildT80UXGun(P);lunaSearchlight(P,m);
  P.hullG.userData.familyRebuild={donor:'t80u',revision:1,mark:m};
  P.turretG.userData.t80MarkReceipt=Object.freeze({
    casting:'t80-early-cast-r1',mark:m,
    sights:m==='t80'?['tpd-2-49','rangefinder-housing','tpn-1-49-23']:['1g42','kobra-guidance'],
    lunaSide:m==='t80'?'left':'right',
    smokeTubes:m==='t80'?0:m==='t80b'?9:8,
    flankBoxes:m==='t80'?3:2,
    sideScreens:m==='t80'?'steel-screen':'rubber-skirt',
    sternDrums:m==='t80bv',
    commanderShield:m==='t80bv',
    kontakt1:Object.freeze({...(K1_COUNT.get(P)??{})}),
  });
  for(const s of [-1,1])P.decal('turret','number',P.spec.visual.number||'',.24,[s*(halfWidth(-.48,1.73,s)+.006),.18,-.55],s*Math.PI/2);
  P.topY=roof(-.60,-.20)+.30-YAW[1];
}

export const T80_MARK_PROFILES={
  t80:{build:(P:TankBuilderPort)=>buildT80Mark(P,'t80')},
  t80b:{build:(P:TankBuilderPort)=>buildT80Mark(P,'t80b')},
  t80bv:{build:(P:TankBuilderPort)=>buildT80Mark(P,'t80bv')},
} as const;
