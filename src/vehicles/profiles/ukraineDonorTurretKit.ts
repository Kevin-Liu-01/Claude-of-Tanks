// Owner 2026-10-15 (VEH-21): the T-72B3M Hetman, the Hetman II and the T-72B3 Sich carry the T-72B3M (2016) and
// T-72B3 turrets themselves (nationalDonorTurret.ts), up-armoured with the Ukrainian field fit: the modern remote
// autocannon on the commander's cupola, added ERA, open cages and nets with leaves, lamps, sensors and stowage.
//   "make the t72 b3m hetman and t72 b3 sich use turrets properly based off the t72 b3m 2016, t72 b3, exceept obviously
//    up armored annnd using modern autocannon and cages and the leaves and lights and ERa and other emplacements"
// The hulls keep their Ukrainian packages unchanged (nationalUkraine.ts ukrainianDonorHull, hetmanII.ts). Everything
// here is fitted to the donor turret as its builder emits it: every housing, foot, pad and arm is found by a ray on the
// donor's own steel (or on a housing laid earlier), never on removable ERA, and every tall fitting stands outside the
// remote station's barrel sweep.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween,blindTube} from './measuredPrimitives.ts';
import {eraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import {nationalLamp,nationalEye,nationalRoofSensor} from './nationalRoofSystems.ts';
import {ukrainianDonorHull} from './nationalUkraine.ts';
import {hetmanIIHullPackage} from './hetmanII.ts';
import {addNationalUkraineProtection,NATIONAL_UKRAINE_GHILLIE} from './nationalUkraineProtection.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {addVehicleGhillieSuit,type GhillieConfig} from '../ghillieSuit.ts';
import {NATIONAL_ROOF_LOADOUTS,type NationalRoofLoadout} from '../nationalRoofConfig.ts';
import {vehicleMarkingSeats} from '../vehicleMarkingSeatRegistry.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylX,cylY,cylZ,torus}=KIT;
type UkraineDonorId='t72b3m_hetman'|'t72b3_sich'|'t72b3m_hetman_ii';
type V3=readonly[number,number,number];
const UP=new THREE.Vector3(0,1,0);

// ---------------------------------------------------------------------------------------------------------------
// Seating against the donor turret

/** Structural steel: the donor casting and the permanent housings this kit lays (never removable ERA). */
const STEEL=['turret','turretExternalArmor'] as const;
/** Fixed steel fittings that may carry a light load (the donor's stowage boxes, cupolas, hatches, sight hoods). */
const FIXED=['turret','turretExternalArmor','turretDetail','turretCupola','turretHatch','turretEquipment'] as const;
/** Everything on the turret a new fitting may not pass through, ERA included. */
const SOLID=[...FIXED,'turretDark','turretGlass','turretCloth','turretFittingPaint','turretOpenLattice'] as const;

class TurretStock {
  private material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  private cache=new Map<string,THREE.Mesh[]>();
  private ray=new THREE.Raycaster();
  private P:TankBuilderPort;
  constructor(P:TankBuilderPort){this.P=P;}
  /** Forget the cached meshes after new stock is laid. */
  refresh():void { this.cache.clear(); }
  dispose():void { this.material.dispose(); this.cache.clear(); }
  meshes(buckets:readonly string[],era=false):THREE.Mesh[] {
    const key=buckets.join(',')+(era?'+era':'');
    let list=this.cache.get(key);
    if(!list){
      list=[];
      this.P.forEachBucketPart([...buckets],g=>{
        if(!era&&Object.hasOwn(g.userData,'eraHitFaceVertexStarts'))return;
        const m=new THREE.Mesh(g,this.material);m.updateMatrixWorld(true);list!.push(m);
      });
      this.cache.set(key,list);
    }
    return list;
  }
  /** Nearest hit along a ray, with the face normal turned to face the ray's origin. */
  cast(origin:THREE.Vector3,dir:THREE.Vector3,buckets:readonly string[]=STEEL,far=8,era=false):THREE.Intersection&{n:THREE.Vector3}|null {
    this.ray.set(origin,dir.clone().normalize());this.ray.near=0;this.ray.far=far;
    const hit=this.ray.intersectObjects(this.meshes(buckets,era),false)[0];
    if(!hit?.face)return null;
    const n=hit.face.normal.clone();if(n.dot(this.ray.ray.direction)>0)n.negate();
    return Object.assign(hit,{n});
  }
  /** The first surface straight down from above a plan point (the bucket of the topmost thing there). */
  top(x:number,z:number,buckets:readonly string[]=SOLID,era=true):THREE.Intersection&{n:THREE.Vector3}|null {
    return this.cast(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),buckets,8,era);
  }
  /** Whether a straight bar of this radius between two points passes through nothing (ERA included). */
  clear(a:V3,b:V3,radius:number,buckets:readonly string[]=SOLID,trim=0):boolean {
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=d.length();d.normalize();
    const side=Math.abs(d.y)>.9?new THREE.Vector3(1,0,0):UP;
    const p=new THREE.Vector3().crossVectors(d,side).normalize(),q=new THREE.Vector3().crossVectors(d,p).normalize();
    for(const [s,t]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]] as const){
      const o=A.clone().addScaledVector(p,s*radius).addScaledVector(q,t*radius).addScaledVector(d,trim);
      this.ray.set(o,d);this.ray.near=0;this.ray.far=len-2*trim;
      if(this.ray.intersectObjects(this.meshes(buckets,true),false).length)return false;
    }
    return true;
  }
  /** A level-enough pad on steel near a plan point whose column up to `upTo` is open (spiral search). */
  pad(x:number,z:number,upTo:number,opts:{radius?:number;search?:number;buckets?:readonly string[];minNormalY?:number}={}):V3|null {
    const radius=opts.radius??.04,search=opts.search??.18,buckets=opts.buckets??STEEL,minNy=opts.minNormalY??.55;
    for(let ring=0;ring<=search+1e-9;ring+=.03){
      const count=ring?Math.max(6,Math.round(ring*60)):1;
      for(let k=0;k<count;k++){
        const a=k*Math.PI*2/count,px=x+Math.cos(a)*ring,pz=z+Math.sin(a)*ring;
        const first=this.top(px,pz);if(!first)continue;
        const steel=this.top(px,pz,buckets,false);
        if(!steel||Math.abs(steel.point.y-first.point.y)>1e-4||steel.n.y<minNy)continue;
        const y=steel.point.y;
        if(upTo>y+.02&&!this.clear([px,y+.012,pz],[px,upTo,pz],radius))continue;
        return [px,y,pz];
      }
    }
    return null;
  }
}

/** Rotation whose local X, Y and Z follow the given right-handed axes. */
function basisEuler(x:THREE.Vector3,y:THREE.Vector3):V3 {
  const z=new THREE.Vector3().crossVectors(x,y).normalize();
  const e=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x.clone().normalize(),y.clone().normalize(),z));
  return [e.x,e.y,e.z];
}

/** A short bolted foot plate where a bar meets steel, laid on the surface it found. */
function footPlate(P:TankBuilderPort,at:THREE.Vector3,normal:THREE.Vector3,size:V3=[.10,.022,.09]):void {
  const g=box(...size).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,normal));
  P.addEquipment('turretDetail',g,...at.clone().addScaledVector(normal,size[1]/2-.004).toArray());
}

/** One ERA cassette laid face-down on the stock a ray finds (ERA sector by side: x<0 is turret_era_L). */
function seatedEra(P:TankBuilderPort,S:TurretStock,origin:THREE.Vector3,dir:THREE.Vector3,across:THREE.Vector3,size:V3):void {
  const hit=S.cast(origin,dir,STEEL);
  if(!hit)throw new Error(`${P.spec.id}: ERA cassette has no permanent seat at ${origin.toArray()}`);
  const n=hit.n,x=across.clone().addScaledVector(n,-across.dot(n)).normalize();
  const center=hit.point.clone().addScaledVector(n,size[1]/2-.004);
  eraCassette(P,'turret',`turret_era_${center.x<0?'L':'R'}`,center.toArray(),size,basisEuler(x,n));
}

// ---------------------------------------------------------------------------------------------------------------
// The T-72B3M (2016) turret's own bustle stowage boxes (t72b3mX.ts bustle: source x, z, yaw, y), turret frame here.

const B3M_RING:V3=[.0000072471277,1.52948397398,.1143146502203];
const B3M_CASE_TABLE:readonly V3[]=[
  [-1.57548,.18880,-1.96081],[-1.47929,-.12408,-1.96081],[-1.34719,-.43498,-1.96081],
  [-1.21581,-.72725,-1.96081],[-1.06794,-1.01019,-1.96081],
  [-.75405,-1.35976,-2.35861],[-.42147,-1.56789,-2.79812],[-.05395,-1.63409,-3.12707],
  [.31475,-1.58214,2.84249],[.64009,-1.43069,2.55228],
  [.92650,-1.13733,1.96203],[1.14576,-.88737,1.96203],
  [1.26361,-.60051,1.96203],[1.38204,-.31420,1.96203],
];
interface BustleCase { c:THREE.Vector3; u:THREE.Vector3; t:THREE.Vector3; bottom:number; topAt(s:number):number; floorAt(s:number):number }
/** Box i: centre, outward axis u (its 386 mm length), across axis t, floor, and roof height at axial offset s. */
function b3mCase(i:number):BustleCase {
  const [x,z,yaw]=B3M_CASE_TABLE[i],y=(i>=5&&i<=9?1.96952:1.93334)-B3M_RING[1];
  const u=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),t=new THREE.Vector3(u.z,0,-u.x);
  return {c:new THREE.Vector3(x-B3M_RING[0],y,z-B3M_RING[2]),u,t,bottom:y-.263,
    topAt:s=>y+(s<=-.176?.2957:s>=.18?.166-(s-.18)*1.5:.290+(s+.176)*(.166-.290)/.356),
    floorAt:s=>y+(s<=-.176?-.263-(s+.193)*1.93:s>=.18?-.265+(s-.18)*.23:-.2957+(s+.176)*(.0307/.356))};
}

// ---------------------------------------------------------------------------------------------------------------
// Shared Ukrainian fittings

/** Module-housing Nizh cassettes hung on the outer end of one of the B3M's bustle boxes: a permanent steel back
 * housing hooked over the box roof and strapped back to the casting, carrying a stack of cassettes. */
function bustleCaseModule(P:TankBuilderPort,S:TurretStock,i:number,rows:number):{front:THREE.Vector3;topY:number;out:THREE.Vector3}|null {
  const b=b3mCase(i),probeY=b.c.y-.06;
  const face=S.cast(b.c.clone().addScaledVector(b.u,.8).setY(probeY),b.u.clone().negate(),['turretDetail'],1.2);
  if(!face)return null;
  const H=face.point.clone().setY(0),depth=.045,lip=.07;
  const lipBottom=b.topAt(.193-lip)+.002,top=lipBottom+.026,clawTop=b.floorAt(.193-lip)-.003,bottom=clawTop-.016;
  const yaw=Math.atan2(b.u.x,b.u.z);
  // The back housing stands on the box end, its top flush with the hook lip that rests on the box roof.
  P.addExternalArmor('turret',box(.335,top-bottom,depth),...H.clone().addScaledVector(b.u,depth/2).setY((top+bottom)/2).toArray(),0,yaw,0);
  P.addExternalArmor('turret',box(.335,top-lipBottom,lip+depth),...H.clone().addScaledVector(b.u,(depth-lip)/2).setY((top+lipBottom)/2).toArray(),0,yaw,0);
  // A claw under the box floor closes the clamp: the housing grips the box end between its hook lip and this claw.
  P.addExternalArmor('turret',box(.335,clawTop-bottom,lip+depth),...H.clone().addScaledVector(b.u,(depth-lip)/2).setY((clawTop+bottom)/2).toArray(),0,yaw,0);
  for(const s of [-.12,0,.12])P.addEquipment('turretDark',cylZ(.016,.012,10),...H.clone().addScaledVector(b.u,depth+.004).addScaledVector(b.t,s).setY(top-.014).toArray(),0,yaw,0);
  S.refresh();
  // Cassettes seated on the housing's outer face by ray, stacked bottom to top with a real seam between them.
  const height=(top-bottom-.03)/rows-.012;
  for(let r=0;r<rows;r++){
    const y=bottom+.015+height/2+r*(height+.012);
    seatedEra(P,S,H.clone().addScaledVector(b.u,.6).setY(y),b.u.clone().negate(),b.t,[.30,.085,height]);
  }
  return {front:H.clone().addScaledVector(b.t,b.t.z>0?.168:-.168),topY:top,out:b.u.clone()};
}

/** A guarded lamp or a sensor head on a bracket standing on a housing top. */
function lampOnHousing(P:TankBuilderPort,S:TurretStock,x:number,z:number,shape:NationalRoofLoadout['lamp'],rise=0):void {
  const seat=S.pad(x,z,0,{search:.06,radius:.03});
  if(!seat)throw new Error(`${P.spec.id}: no lamp seat at ${x},${z}`);
  let base=seat[1];
  if(rise>0){
    P.addEquipment('turretDetail',box(.10,rise+.01,.10),seat[0],base+rise/2,seat[2]);
    base+=rise;
  }
  nationalLamp(P,seat[0],seat[2],base,shape);
}

/** The anti-drone roof cage wings, laid by fieldRoofCage.ts's rule (the rule ghillieSuit.ts rebuilds a wing by): legs
 * on a 2 x 2 grid of pads found on this turret's own steel, the frame, a row every 14.5 cm, three stringers, a brace
 * from each outer leg up to the outer tube, and the hinge barrels on the inner tube. */
interface CageWingLayout { side:number; inner:number; outer:number; z0:number; z1:number; y:number; legX:readonly[number,number]; legZ:readonly[number,number] }
function roofCageWings(P:TankBuilderPort,S:TurretStock,wings:readonly CageWingLayout[]):void {
  const record:{feet:V3[];corners:V3[]}[]=[];
  const bar=(a:V3,b:V3,r=.013)=>{const g=beamBetween(a,b,r,8);g.userData.fieldRoofCage=true;P.addEquipment('turretOpenLattice',g);};
  for(const w of wings){
    const {side,inner,outer,z0,z1,y}=w,feet:V3[]=[];
    for(const lx of w.legX)for(const z of w.legZ){
      const x=side*lx,p=S.pad(x,z,y,{radius:.024,search:0,buckets:FIXED});
      if(!p)throw new Error(`${P.spec.id}: roof cage has no pad at ${x},${z}`);
      feet.push(p);
    }
    for(const [x,base,z]of feet){
      P.addEquipment('turretDetail',box(.10,.024,.11),x,base+.006,z);
      bar([x,base+.01,z],[x,y,z],.021);
    }
    const corners:V3[]=[[side*inner,y,z0],[side*outer,y,z0],[side*outer,y,z1],[side*inner,y,z1]];
    for(let i=0;i<4;i++)bar(corners[i],corners[(i+1)%4],.019);
    const rows=Math.ceil((z1-z0)/.145);
    for(let i=1;i<rows;i++){const z=z0+(z1-z0)*i/rows;bar([side*inner,y,z],[side*outer,y,z],.008);}
    for(let i=1;i<4;i++){const x=side*(inner+(outer-inner)*i/4);bar([x,y,z0],[x,y,z1],.008);}
    const braceX=Math.max(...w.legX);
    for(const z of w.legZ)bar([side*braceX,y-.12,z],[side*outer,y,z],.012);
    for(const z of [z0+.22,z1-.22])P.addEquipment('turretDark',cylZ(.026,.09,12),side*inner,y,z);
    record.push({feet,corners});
  }
  P.turretG.userData.fieldRoofCage=record;
}

/** A whip antenna on its base drum, standing on a steel pad. */
function antenna(P:TankBuilderPort,S:TurretStock,x:number,z:number,height:number):void {
  const p=S.pad(x,z,0,{search:.10,buckets:FIXED});
  if(!p)throw new Error(`${P.spec.id}: no antenna seat at ${x},${z}`);
  P.addEquipment('turretDetail',cylY(.055,.070,.060,12),p[0],p[1]+.026,p[2]);
  P.addEquipment('turretDark',cylY(.007,.014,height,10),p[0],p[1]+.05+height/2,p[2]);
}

function utilityCase(P:TankBuilderPort,S:TurretStock,x:number,z:number,w:number,h:number,d:number,yaw=0):number {
  // Four feet follow the steel under the tray, so the case is a real installation, not a floating box.
  const c=Math.cos(yaw),s=Math.sin(yaw),feet:V3[]=[];
  for(const dx of [-w*.36,w*.36])for(const dz of [-d*.36,d*.36]){
    const fx=x+dx*c+dz*s,fz=z-dx*s+dz*c,hit=S.top(fx,fz,FIXED,false);
    if(!hit)throw new Error(`${P.spec.id}: utility case foot has no seat at ${fx},${fz}`);
    feet.push([fx,hit.point.y,fz]);
  }
  const y=Math.max(...feet.map(f=>f[1]))+.026;
  for(const [fx,fy,fz]of feet)P.addEquipment('turretDetail',box(.045,y-fy+.012,.055),fx,(y+fy)/2-.006,fz,0,yaw,0);
  P.addEquipment('turretDetail',box(w+.035,.026,d+.035),x,y+.006,z,0,yaw,0);
  const base=y+.019;
  P.addEquipment('turretDetail',box(w,h,d),x,base+h/2-.004,z,0,yaw,0);
  P.addEquipment('turretDetail',box(w+.012,.020,d+.012),x,base+h,z,0,yaw,0);
  for(const dx of [-w*.30,w*.30])P.addEquipment('turretDark',box(.032,.046,.013),x+dx*c+(d/2+.005)*s,base+h-.024,z-dx*s+(d/2+.005)*c,0,yaw,0);
  return base+h+.010;
}

/** Cable harness on short stand-offs, each stand-off on the steel under it. */
function cableRun(P:TankBuilderPort,S:TurretStock,points:readonly V3[],radius=.011):void {
  const seated:V3[]=points.map(([x,y,z])=>{
    const skin=S.top(x,z,FIXED,false)?.point.y??y,height=Math.max(y,skin+radius+.014);
    P.addEquipment('turretDetail',box(.040,height-skin+.012,.046),x,(skin+height)/2-.006,z);
    P.addEquipment('turretDetail',box(.060,.022,.034),x,height+.002,z);
    return [x,height,z];
  });
  for(let i=1;i<seated.length;i++)P.addEquipment('turretDark',beamBetween(seated[i-1],seated[i],radius,8));
}

// ---------------------------------------------------------------------------------------------------------------
// Slat screen round the bustle: a framed lattice standing off the donor's rear boxes on arms that run under the boxes
// into the casting. The same roles as the hull screens (nationalUkraineProtection.ts) mark every pad, rod and tie.

function screenRod(P:TankBuilderPort,a:V3,b:V3,r=.014):void {
  const g=beamBetween(a,b,r,8);g.userData.ukrainianProtection={role:'open-cage-rod',owner:'turret'};
  P.addEquipment('turretOpenLattice',g);
}
function screenTie(P:TankBuilderPort,center:V3,size:V3,yaw:number):void {
  const g=box(...size);g.userData.ukrainianProtection={role:'net-lashing',owner:'turret'};
  P.addEquipment('turretCloth',g,...center,0,yaw,0);
}
/** A support arm from a screen post inward to the casting (or a kit housing), its pad on the steel it reaches. */
function screenArm(P:TankBuilderPort,S:TurretStock,post:V3,armY:number):boolean {
  const inward=new THREE.Vector3(-post[0],0,-post[2]).normalize();
  for(const y of [armY,armY-.010,armY-.020,armY-.030,armY-.040])for(const turn of [0,.05,-.05,.10,-.10,.16,-.16,.22,-.22,.30,-.30]){
    const from=new THREE.Vector3(post[0],y,post[2]);
    const dir=inward.clone().applyAxisAngle(UP,turn);
    const hit=S.cast(from,dir,STEEL,1.2);if(!hit||hit.distance<.08)continue;
    const end=hit.point.clone().addScaledVector(hit.n,-.012);
    if(!S.clear(from.toArray(),hit.point.clone().addScaledVector(hit.n,.03).toArray(),.016,SOLID,.03))continue;
    const plate=box(.115,.032,.115).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,hit.n));
    plate.userData.ukrainianProtection={role:'support-pad',owner:'turret',contact:hit.point.toArray(),normal:hit.n.toArray()};
    P.addEquipment('turretDetail',plate,...hit.point.clone().addScaledVector(hit.n,.006).toArray());
    const g=beamBetween(end.toArray(),from.toArray(),.015,8);g.userData.ukrainianProtection={role:'open-cage-rod',owner:'turret'};
    P.addEquipment('turretOpenLattice',g);
    return true;
  }
  return false;
}

interface ScreenLayout { path:readonly(readonly[number,number])[]; bottom:number; top:number; armY:number; arms:readonly number[]; ties:number }
/** A slat screen along a plan polyline (turret frame) from `bottom` to `top`, with arms at the listed path vertices. */
function bustleScreen(P:TankBuilderPort,S:TurretStock,L:ScreenLayout):void {
  const {path,bottom,top}=L;
  for(let i=1;i<path.length;i++){
    const [ax,az]=path[i-1],[bx,bz]=path[i],len=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(bx-ax,bz-az);
    for(const y of [bottom,(bottom+top)/2,top])screenRod(P,[ax,y,az],[bx,y,bz],y===(bottom+top)/2?.010:.018);
    const count=Math.max(1,Math.round(len/.095));
    for(let k=1;k<count;k++){const t=k/count,x=ax+(bx-ax)*t,z=az+(bz-az)*t;screenRod(P,[x,bottom+.012,z],[x,top-.012,z],.008);}
    for(let k=0;k<L.ties&&len>.3;k++){const t=(k+.5)/L.ties,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      screenTie(P,[x,top-.038,z],[.022,.120,.074],yaw+Math.PI/2);}
  }
  for(const [x,z]of path)screenRod(P,[x,bottom,z],[x,top,z],.017);
  for(const i of L.arms)if(!screenArm(P,S,[path[i][0],0,path[i][1]],L.armY))throw new Error(`${P.spec.id}: bustle screen post ${i} has no clear arm`);
}

// ---------------------------------------------------------------------------------------------------------------
// The field net and leaves on the donor turret (the turret half of NATIONAL_UKRAINE_GHILLIE, re-measured here)

interface TurretNet { roof:number; x:number; rear:number; front:number; sides:readonly{side:number;z0:number;z1:number;bottom:number;top:number;out(z:number):number}[];
  rearFace?:{zAt(x:number):number;x0:number;x1:number;y0:number;y1:number}; marks:readonly(readonly[number,number])[] }
function turretSuit(id:UkraineDonorId,n:TurretNet):GhillieConfig {
  const base=NATIONAL_UKRAINE_GHILLIE[id];
  const opening=([x,z]:readonly[number,number]):[number,number][]=>[[x-.26,z-.26],[x+.26,z-.26],[x+.26,z+.26],[x-.26,z+.26]];
  return {...base,turret:{
    top:[{yFromArmour:true,clipToArmour:true,autoOpeningsM:.07,rimScale:.5,x0:-n.x,x1:n.x,z0:n.rear,z1:n.front,nx:38,
      nz:Math.round((n.front-n.rear)/.1),yAt:()=>n.roof,garnishRiseM:.16,seed:151,holes:n.marks.map(opening)}],
    side:n.sides.map((s,i)=>({side:s.side,z0:s.z0,z1:s.z1,nz:Math.max(6,Math.round((s.z1-s.z0)/.07)),ny:7,seed:71+s.side+i*13,
      topAt:()=>s.top-.026,bottomAt:(z:number)=>s.bottom+.068+.017*Math.sin(z*5.2),
      outAt:(z:number,t:number)=>s.out(z)+.028+(1-t)*.015})),
    face:n.rearFace?[{z:n.rearFace.zAt(0),zAt:(x:number)=>n.rearFace!.zAt(x)-.030,x0:n.rearFace.x0,x1:n.rearFace.x1,
      y0:n.rearFace.y0,y1:n.rearFace.y1,nx:29,ny:7,seed:91,seatGapM:.027,seat:'ukrainian-bustle-screen'}]:[],
  }};
}

/** The marking seats on the turret roof (the generated marking receipt), opened in the roof net. */
function turretMarks(id:UkraineDonorId):[number,number][] {
  const marks:[number,number][]=[];
  for(const seat of vehicleMarkingSeats(id)??[]){
    const pos=seat.pos;
    if(seat.parent==='turret'&&Array.isArray(pos)&&pos.length===3)marks.push([Number(pos[0]),Number(pos[2])]);
  }
  return marks;
}

type Path=readonly(readonly[number,number])[];
/** A plan polyline's other coordinate at a value of x (axis 0) or z (axis 1), interpolated along its monotone run. */
function pathAt(path:Path,axis:0|1,v:number):number {
  const o=1-axis;
  for(let i=1;i<path.length;i++){
    const a=path[i-1][axis],b=path[i][axis];
    if((v-a)*(v-b)<=0&&a!==b)return path[i-1][o]+(path[i][o]-path[i-1][o])*(v-a)/(b-a);
  }
  let best=path[0];for(const p of path)if(Math.abs(p[axis]-v)<Math.abs(best[axis]-v))best=p;
  return best[o];
}

/** The turret net for a bustle screen path: side drapes on its lateral runs, a rear drape across its back. */
function screenNet(id:UkraineDonorId,path:Path,L:{bottom:number;top:number;roof:number;x:number;front:number;
  sideRuns:readonly{side:number;z0:number;z1:number}[];back:readonly[number,number]}):GhillieConfig {
  return turretSuit(id,{roof:L.roof,x:L.x,front:L.front,rear:Math.min(...path.map(p=>p[1]))+.02,marks:turretMarks(id),
    sides:L.sideRuns.map(r=>({...r,bottom:L.bottom,top:L.top,out:(z:number)=>Math.abs(pathAt(path,1,z))})),
    rearFace:{zAt:(x:number)=>pathAt(path,0,x),x0:L.back[0],x1:L.back[1],y0:L.bottom+.065,y1:L.top-.030}});
}

// ---------------------------------------------------------------------------------------------------------------
// T-72B3M Hetman: the command modernization on the T-72B3M (2016) turret

/** Station sweep keep-out: plan radius about the station inside which nothing may stand taller than `belowY`. */
function stationSweep(P:TankBuilderPort):{x:number;z:number;r:number} {
  const seat=P.turretG.userData.nationalDonorStation?.seat as V3|undefined,l=NATIONAL_ROOF_LOADOUTS[P.spec.id];
  if(!seat)throw new Error(`${P.spec.id}: donor station seat missing`);
  return {x:seat[0],z:seat[2],r:l.muzzleZ+.10};
}

const HETMAN_SCREEN:Path=[[-1.40,-1.15],[-1.25,-1.45],[-.90,-1.80],[-.45,-2.03],[.15,-2.08],[.62,-1.95],[1.00,-1.70],[1.22,-1.44]];
const hetmanNet=():GhillieConfig=>screenNet('t72b3m_hetman',HETMAN_SCREEN,{bottom:.16,top:.64,roof:.78,x:1.90,front:1.75,
  sideRuns:[{side:-1,z0:-1.45,z1:-1.15},{side:1,z0:-1.70,z1:-1.44}],back:[-1.25,1.00]});

function hetman(P:TankBuilderPort,S:TurretStock):void {
  const l=NATIONAL_ROOF_LOADOUTS.t72b3m_hetman,sweep=stationSweep(P);
  // Nizh module housings on the outer ends of the four forward bustle boxes on the commander's side and three on the
  // gunner's side, two cassettes high: the armour band continues the Relikt cheek fan along both flanks.
  const left=[0,1,2,3].map(i=>bustleCaseModule(P,S,i,2)),right=[13,12,11].map(i=>bustleCaseModule(P,S,i,2));
  if(left.some(m=>!m)||right.some(m=>!m))throw new Error(`${P.spec.id}: a bustle box face is missing`);
  // Anti-drone roof cage wings: outer legs on the bustle box roofs, inner legs on the casting clear of the hatches,
  // the sights, the roof ERA and the station's yaw stock.
  roofCageWings(P,S,[
    {side:-1,inner:1.10,outer:1.86,z0:-1.00,z1:.24,y:1.10,legX:[1.17,1.48],legZ:[.06,-.82]},
    {side:1,inner:.95,outer:1.72,z0:-1.22,z1:-.18,y:1.10,legX:[.98,1.30],legZ:[-.36,-1.04]},
  ]);
  S.refresh();
  // Slat screen round the bustle: from behind the last housing on each flank round the rear boxes.
  bustleScreen(P,S,{path:HETMAN_SCREEN,bottom:.16,top:.64,armY:.125,arms:[0,2,3,4,5,7],ties:3});
  S.refresh();
  // Paired guarded lamps on the forward housings, raised on posts to see over the cheek fan and the smoke bank.
  lampOnHousing(P,S,-1.80,.05,l.lamp,.10);
  lampOnHousing(P,S,1.56,-.52,l.lamp,.16);
  // The loadout's sensor head on the gunner-side middle housing.
  {
    const seat=S.pad(1.47,-.77,0,{search:.06,radius:.03});
    if(!seat)throw new Error(`${P.spec.id}: no sensor seat`);
    nationalEye(P,seat[0],seat[2],seat[1],l);
  }
  // Radome on the roof ventilator housing behind the hatches; the command panorama on the left rear shoulder.
  {
    const top=S.top(0,-.80,FIXED,false);if(!top)throw new Error(`${P.spec.id}: no radome seat`);
    nationalRoofSensor(P,0,-.80,top.point.y,l);
    const seat=S.pad(-.98,-1.02,0,{search:.10,buckets:FIXED});if(!seat)throw new Error(`${P.spec.id}: no panorama seat`);
    supportedSensor(P,[seat[0],seat[1]+.20,seat[2]],seat[1]-.006);
  }
  // Radio and antenna-control cases on the rear boxes, aerials on the rear corner boxes outside the station's sweep.
  for(const i of [7,9]){
    const b=b3mCase(i),c=b.c.clone().addScaledVector(b.u,-.04);
    utilityCase(P,S,c.x,c.z,.24,.13,.26,Math.atan2(b.u.x,b.u.z));
  }
  for(const [i,h]of [[6,2.4],[8,1.9]] as const){
    const c=b3mCase(i).c;
    if(Math.hypot(c.x-sweep.x,c.z-sweep.z)<sweep.r)throw new Error(`${P.spec.id}: aerial inside the station sweep`);
    antenna(P,S,c.x,c.z,h);
  }
  cableRun(P,S,[[-.98,.80,-1.02],[-.80,.78,-1.30],[-.52,.80,-1.56]],.011);
}

// ---------------------------------------------------------------------------------------------------------------

function turretUpArmour(P:TankBuilderPort,id:UkraineDonorId):void {
  const S=new TurretStock(P);
  try {
    if(id==='t72b3m_hetman')hetman(P,S);
  } finally { S.dispose(); }
}

/** Hetman and Sich: their unchanged Ukrainian hull package, then the turret fit. */
export function buildUkraineDonorKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
  ukrainianDonorHull(P,c);
  fitUkraineDonorTurret(P,c.id as UkraineDonorId);
}

/** Hetman II: its own heavy hull package, then the turret fit. */
export function buildHetmanIIDonorKit(P:TankBuilderPort):void {
  hetmanIIHullPackage(P);
  fitUkraineDonorTurret(P,'t72b3m_hetman_ii');
}

function fitUkraineDonorTurret(P:TankBuilderPort,id:UkraineDonorId):void {
  turretUpArmour(P,id);
  // The hull screens stay as the national protection lays them; the turret's own screens are this kit's (above).
  addNationalUkraineProtection(P,id,{turretScreens:false});
  addVehicleGhillieSuit(P,id==='t72b3m_hetman'?hetmanNet():{...NATIONAL_UKRAINE_GHILLIE[id],turret:undefined});
}
void markSmokeTube;void blindTube;void cylX;void torus;
