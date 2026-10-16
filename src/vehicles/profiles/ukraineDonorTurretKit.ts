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
import {sectionSolid} from './sectionSolid.ts';
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
  /** Whether a placed box (centre, size, rotation) crosses nothing: its edges and diagonals ray-tested. */
  boxClear(center:V3,size:V3,rotation:V3=[0,0,0],buckets:readonly string[]=SOLID):boolean {
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),c=new THREE.Vector3(...center);
    const k=(i:number):V3=>new THREE.Vector3((i&1?.5:-.5)*size[0],(i&2?.5:-.5)*size[1],(i&4?.5:-.5)*size[2]).applyQuaternion(q).add(c).toArray() as V3;
    const pairs=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7],[0,7],[1,6],[2,5],[3,4],[0,3],[4,7],[0,5],[2,7],[0,6],[1,7]];
    return pairs.every(([a,b])=>this.clear(k(a),k(b),0,buckets,.002));
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
        const y=steel.point.y,lift=.012+radius*Math.sqrt(1-steel.n.y*steel.n.y)/steel.n.y;
        if(upTo>y+lift+.01&&!this.clear([px,y+lift,pz],[px,upTo,pz],radius))continue;
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

/** The highest fixed surface under a square footprint (centre, corners, edge midpoints): a level plinth's seat. */
function levelSeat(P:TankBuilderPort,S:TurretStock,x:number,z:number,half:number):number {
  let y=-Infinity;
  for(const dx of [-half,0,half])for(const dz of [-half,0,half]){const h=S.top(x+dx,z+dz,FIXED,false);if(h)y=Math.max(y,h.point.y);}
  if(!Number.isFinite(y))throw new Error(`${P.spec.id}: no level seat at ${x},${z}`);
  return y;
}

/** A command panorama on a pedestal standing on a plate laid on the surface found under it. */
function panorama(P:TankBuilderPort,S:TurretStock,x:number,z:number,rise:number):void {
  const seat=S.pad(x,z,0,{search:.10,radius:.03,buckets:FIXED});
  if(!seat)throw new Error(`${P.spec.id}: no panorama seat near ${x},${z}`);
  const n=S.top(seat[0],seat[2],FIXED,false)?.n??UP,base=levelSeat(P,S,seat[0],seat[2],.10);
  footPlate(P,new THREE.Vector3(...seat),n,[.24,.02,.24]);
  supportedSensor(P,[seat[0],base+rise,seat[2]],base+.004);
}

/** The drone-dock landings (turret frame: centre x, top y, centre z, width x, depth z): flat steel plates whose top
 * faces are the mission dock's welded support (tools/mission-attachment-geometry.mjs WELDED_SUPPORT_PATCHES), outside
 * the remote station's sweep, clear of the roof cage and with nothing over them. */
export const UKRAINE_DOCK_LANDINGS={
  t72b3m_hetman:[.80,.80,-1.42,.40,.36],
  t72b3m_hetman_ii:[.70,.28,-2.36,.40,.34],
  t72b3_sich:[.40,.74,-1.50,.34,.32],
} as const;
function dockLanding(P:TankBuilderPort,S:TurretStock,id:UkraineDonorId):void {
  const [x,top,z,w,d]=UKRAINE_DOCK_LANDINGS[id],t=.016;
  S.refresh();
  // A post in each quadrant onto the steel found under it: the valid seat farthest out in that quadrant.
  const posts:{px:number;pz:number;hit:THREE.Intersection&{n:THREE.Vector3}}[]=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    let best:{px:number;pz:number;hit:THREE.Intersection&{n:THREE.Vector3};r:number}|null=null;
    for(let i=1;i<=5;i++)for(let j=1;j<=5;j++){
      const px=x+sx*w*.46*i/5,pz=z+sz*d*.46*j/5,hit=S.top(px,pz,[...FIXED,'turretDark'],false);
      if(!hit||hit.point.y>top-t||top-t-hit.point.y>.30)continue;
      if(top-t-hit.point.y>.012&&!S.clear([px,hit.point.y+.012,pz],[px,top-t-.004,pz],.022,SOLID))continue;
      const r=Math.hypot(px-x,pz-z);if(!best||r>best.r)best={px,pz,hit,r};
    }
    if(!best)throw new Error(`${P.spec.id}: dock landing quadrant ${sx},${sz} has no seat`);
    posts.push(best);
  }
  P.addExternalArmor('turret',box(w,t,d),x,top-t/2,z);
  for(const {px,pz,hit}of posts){
    const h=top-t-hit.point.y;
    P.addEquipment('turretDetail',box(.04,h+.006,.04),px,hit.point.y+h/2-.003,pz);
    if(h>.02)footPlate(P,hit.point,hit.n,[.08,.016,.08]);
  }
  S.refresh();
  P.turretG.userData.ukrainianDockLanding=[x,top,z];
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
  const seat=S.pad(x,z,0,{search:.06,radius:.03,buckets:FIXED});
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
interface CageWingLayout { side:number; inner:number; outer:number; z0:number; z1:number; y:number; legX:readonly[number,number]; legZ:readonly[number,number];
  /** Per-row outer leg distances where a row's outer leg stands inboard of the first row's (each joined to its brace by a stub). */
  outerAt?:readonly[number,number] }
function roofCageWings(P:TankBuilderPort,S:TurretStock,wings:readonly CageWingLayout[]):void {
  const record:{feet:V3[];corners:V3[]}[]=[];
  const bar=(a:V3,b:V3,r=.013)=>{const g=beamBetween(a,b,r,8);g.userData.fieldRoofCage=true;P.addEquipment('turretOpenLattice',g);};
  for(const w of wings){
    const {side,inner,outer,z0,z1,y}=w,feet:V3[]=[];
    for(const [k,lx]of w.legX.entries())for(const [j,z]of w.legZ.entries()){
      const x=side*(k&&w.outerAt?w.outerAt[j]:lx),p=S.pad(x,z,y,{radius:.024,search:0,buckets:FIXED});
      if(!p)throw new Error(`${P.spec.id}: roof cage has no pad at ${x},${z}`);
      feet.push(p);
    }
    for(const [x,base,z]of feet){
      const n=S.top(x,z,FIXED,false)?.n??UP;
      footPlate(P,new THREE.Vector3(x,base,z),n,[.10,.024,.11]);
      bar([x,base+.01,z],[x,y,z],.021);
    }
    const corners:V3[]=[[side*inner,y,z0],[side*outer,y,z0],[side*outer,y,z1],[side*inner,y,z1]];
    for(let i=0;i<4;i++)bar(corners[i],corners[(i+1)%4],.019);
    const rows=Math.ceil((z1-z0)/.145);
    for(let i=1;i<rows;i++){const z=z0+(z1-z0)*i/rows;bar([side*inner,y,z],[side*outer,y,z],.008);}
    for(let i=1;i<4;i++){const x=side*(inner+(outer-inner)*i/4);bar([x,y,z0],[x,y,z1],.008);}
    // ghillieSuit.ts rebuilds a brace at every leg row from the outermost leg; a row whose outer leg stands inboard
    // carries a stub out to that brace's foot.
    const braceX=Math.max(...feet.map(f=>Math.abs(f[0])));
    for(const z of w.legZ){
      bar([side*braceX,y-.12,z],[side*outer,y,z],.012);
      const own=Math.max(...feet.filter(f=>f[2]===z).map(f=>Math.abs(f[0])));
      if(braceX-own>.01)bar([side*own,y-.12,z],[side*braceX,y-.12,z],.012);
    }
    for(const z of [z0+.22,z1-.22])P.addEquipment('turretDark',cylZ(.026,.09,12),side*inner,y,z);
    record.push({feet,corners});
  }
  P.turretG.userData.fieldRoofCage=record;
}

/** A whip antenna on its base drum, standing on a steel pad. */
function antenna(P:TankBuilderPort,S:TurretStock,x:number,z:number,height:number):void {
  const p=S.pad(x,z,0,{search:.10,buckets:FIXED});
  if(!p)throw new Error(`${P.spec.id}: no antenna seat at ${x},${z}`);
  // A plate on the surface, its high edge carrying the base drum level.
  const n=S.top(p[0],p[2],FIXED,false)?.n??UP,rise=.075*Math.sqrt(1-n.y*n.y)/n.y;
  footPlate(P,new THREE.Vector3(...p),n,[.15,.02,.15]);
  const base=p[1]+.014+rise;
  P.addEquipment('turretDetail',cylY(.055,.070,.060,12),p[0],base+.026,p[2]);
  P.addEquipment('turretDark',cylY(.007,.014,height,10),p[0],base+.05+height/2,p[2]);
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
  for(const [fx,fy,fz]of feet)P.addEquipment('turretDetail',box(.045,y-fy+.004,.040),fx,(y+fy)/2-.002,fz,0,yaw,0);
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
    P.addEquipment('turretDetail',box(.034,height-skin+.004,.034),x,(skin+height)/2-.002,z);
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
    const hit=S.cast(from,dir,['turret'],1.2);if(!hit||hit.distance<.08)continue;
    const end=hit.point.clone().addScaledVector(hit.n,-.004);
    if(!S.clear(from.toArray(),hit.point.clone().addScaledVector(hit.n,.03).toArray(),.016,SOLID,.03))continue;
    const plate=box(.09,.028,.09).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,hit.n));
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
function landingOpening(id:UkraineDonorId):[number,number][] {
  const [x,,z,w,d]=UKRAINE_DOCK_LANDINGS[id],hx=w/2+.08,hz=d/2+.08;
  return [[x-hx,z-hz],[x+hx,z-hz],[x+hx,z+hz],[x-hx,z+hz]];
}
function turretSuit(id:UkraineDonorId,n:TurretNet):GhillieConfig {
  const base=NATIONAL_UKRAINE_GHILLIE[id];
  const opening=([x,z]:readonly[number,number]):[number,number][]=>[[x-.26,z-.26],[x+.26,z-.26],[x+.26,z+.26],[x-.26,z+.26]];
  return {...base,turret:{
    // The roof net opens round the marks and over the drone dock's landing (its 12 m lift column stays clear).
    top:[{yFromArmour:true,clipToArmour:true,autoOpeningsM:.07,rimScale:.5,x0:-n.x,x1:n.x,z0:n.rear,z1:n.front,nx:38,
      nz:Math.round((n.front-n.rear)/.1),yAt:()=>n.roof,garnishRiseM:.16,seed:151,holes:[...n.marks.map(opening),landingOpening(id)]}],
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
    nationalRoofSensor(P,0,-.80,levelSeat(P,S,0,-.80,.17),l);
    panorama(P,S,-.98,-1.02,.20);
  }
  // Radio and antenna-control cases on the rear boxes, aerials on the rear corner boxes outside the station's sweep.
  for(const i of [5,7]){
    const b=b3mCase(i),c=b.c.clone().addScaledVector(b.u,-.04);
    utilityCase(P,S,c.x,c.z,.24,.13,.26,Math.atan2(b.u.x,b.u.z));
  }
  // The drone dock's landing over the gunner-side rear boxes, behind the cage wing.
  dockLanding(P,S,'t72b3m_hetman');
  // Short field whips (the national kits' height rule: the listed height is the body and its roof weapon).
  for(const [i,h]of [[6,.85],[8,.70]] as const){
    const c=b3mCase(i).c;
    if(Math.hypot(c.x-sweep.x,c.z-sweep.z)<sweep.r)throw new Error(`${P.spec.id}: aerial inside the station sweep`);
    antenna(P,S,c.x,c.z,h);
  }
  cableRun(P,S,[[-.86,.80,-1.10],[-.76,.78,-1.32],[-.52,.80,-1.56]],.011);
}

// ---------------------------------------------------------------------------------------------------------------
// T-72B3M Hetman II: the long command modernization on the T-72B3M (2016) turret

/** A flank of the B3M's bustle boxes as a plane: outward normal u, forward run f, and the outermost box face. */
interface Flank { side:number; u:THREE.Vector3; f:THREE.Vector3; face:number; at(d:number,fa:number,y:number):THREE.Vector3 }
function b3mFlank(side:number):Flank {
  const ids=side<0?[0,1,2,3,4]:[10,11,12,13],u=b3mCase(ids[0]).u.clone();
  const f=new THREE.Vector3(-u.z,0,u.x);if(f.z<0)f.negate();
  const face=Math.max(...ids.map(i=>{const b=b3mCase(i);return b.c.clone().addScaledVector(b.u,.193).dot(u);}));
  return {side,u,f,face,at:(d,fa,y)=>u.clone().multiplyScalar(d).addScaledVector(f,fa).setY(y)};
}

/** Squared armour cabinets over a flank's bustle boxes: bolted sections of outer wall and lid, the lid carried on
 * brackets to the casting, ERA on the wall in two courses and on the lid; the outer wall stands 12 mm off the boxes. */
function flankCabinet(P:TankBuilderPort,S:TurretStock,side:number,f0:number,f1:number,sections:number,legs:readonly(readonly[number,number])[]):Flank {
  const F=b3mFlank(side),d0=F.face+.012,wall=.04,dOut=d0+wall,dIn=1.17,bottom=.12,top=.78,lid=.03;
  const yaw=Math.atan2(F.u.x,F.u.z),len=(f1-f0)/sections;
  for(let k=0;k<sections;k++){
    const a=f0+k*len+.005,b=f0+(k+1)*len-.005,m=(a+b)/2;
    P.addExternalArmor('turret',box(b-a,top-bottom,wall),...F.at(d0+wall/2,m,(top+bottom)/2).toArray(),0,yaw,0);
    P.addExternalArmor('turret',box(b-a,lid,dOut-dIn),...F.at((dIn+dOut)/2,m,top+lid/2).toArray(),0,yaw,0);
    // Two brackets under the lid, each down onto the casting inboard of the boxes, or (where the casting has
    // narrowed away behind the boxes) a short post onto the box roof under it.
    for(const fb of [a+.07,b-.07]){
      let placed=false;
      for(const [d,buckets]of [[dIn+.02,STEEL],[dIn+.13,FIXED]] as const){
        const p=F.at(d,fb,top),hit=S.cast(p.clone().setY(top-.004),new THREE.Vector3(0,-1,0),buckets,1);
        if(!hit||hit.point.y<.08||!S.clear([p.x,top-.006,p.z],[p.x,hit.point.y+.01,p.z],.016,SOLID))continue;
        P.addEquipment('turretDetail',box(.035,top-hit.point.y,.05),p.x,(top+hit.point.y)/2,p.z,0,yaw,0);
        footPlate(P,hit.point,hit.n,[.08,.018,.08]);placed=true;break;
      }
      if(!placed)throw new Error(`${P.spec.id}: cabinet bracket has no seat at f ${fb}`);
    }
    for(const fb of [a+.03,b-.03])P.addEquipment('turretDark',cylX(.014,.012,10),...F.at(dOut+.004,fb,top-.03).toArray(),0,yaw+Math.PI/2,0);
  }
  // End flanges close the cabinet beyond the first and last boxes.
  for(const fe of [f0-.018,f1+.018])P.addExternalArmor('turret',box(.03,top-bottom+lid,.10),...F.at(dOut-.05,fe,(top+lid+bottom)/2).toArray(),0,yaw,0);
  S.refresh();
  // Wall ERA: two courses of cassettes per section, seated by ray on the wall.
  for(let k=0;k<sections;k++){
    const cols=2,cw=(len-.03)/cols-.012;
    for(let c=0;c<cols;c++)for(const y of [.29,.61]){
      const fa=f0+k*len+.015+cw/2+c*(cw+.012);
      seatedEra(P,S,F.at(dOut+.6,fa,y),F.u.clone().negate(),F.f,[cw,.085,.29]);
    }
  }
  // Lid ERA: one course of flat cassettes, clear of the cage legs that stand on the lid.
  for(let k=0;k<sections;k++)for(const c of [0,1]){
    const fa=f0+k*len+len*(c?.73:.27),p=F.at((dIn+dOut)/2+.02,fa,top+.4);
    if(legs.some(([x,z])=>Math.hypot(x-p.x,z-p.z)<.24))continue;
    seatedEra(P,S,p,new THREE.Vector3(0,-1,0),F.f,[.20,.065,.34]);
  }
  return F;
}

/** Hetman II's open command basket: a floor and slat walls hung behind the rear boxes from a front beam bolted into
 * both cabinets, with goose-neck stays over the rear boxes into the casting. */
const HETMAN_II_BEAM:Path=[[-1.22,-1.45],[-1.02,-1.82],[-.55,-2.02],[0,-2.08],[.55,-2.02],[.98,-1.82],[1.14,-1.60]];
const HETMAN_II_BASKET:Path=[[-1.30,-1.47],[-1.30,-2.28],[-1.00,-2.62],[1.00,-2.62],[1.28,-2.28],[1.26,-1.63]];
function commandBasket(P:TankBuilderPort,S:TurretStock):void {
  const floor=.24,top=.66,F=HETMAN_II_BEAM,O=HETMAN_II_BASKET;
  const beam=(a:V3,b:V3,r=.022)=>P.addEquipment('turretDetail',beamBetween(a,b,r,10));
  for(let i=1;i<F.length;i++)beam([F[i-1][0],floor,F[i-1][1]],[F[i][0],floor,F[i][1]],.026);
  // The beam's ends are bolted into the cabinets' rear flanges: a bolting pad on each flange's rear face (found by ray
  // forward along the flank) and a short stub from the beam's end to it.
  for(const [i,side]of [[0,-1],[F.length-1,1]] as const){
    const [x,z]=F[i],fl=b3mFlank(side),from=new THREE.Vector3(x,floor,z);
    const hit=S.cast(from.clone().addScaledVector(fl.f,-.05),fl.f,['turretExternalArmor'],.40);
    if(!hit)throw new Error(`${P.spec.id}: basket beam has no cabinet flange ahead of ${x},${z}`);
    const plate=box(.10,.024,.10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,hit.n));
    plate.userData.ukrainianProtection={role:'support-pad',owner:'turret',contact:hit.point.toArray(),normal:hit.n.toArray()};
    P.addEquipment('turretDetail',plate,...hit.point.clone().addScaledVector(hit.n,.008).toArray());
    beam([x,floor,z],hit.point.clone().addScaledVector(hit.n,.015).toArray() as unknown as V3,.024);
    P.addEquipment('turretDetail',box(.07,.07,.07),x,floor,z);
  }
  // Floor: stringers from the beam to the outer frame, slats across them.
  const stringers:[V3,V3][]=[];
  const outerAt=(x:number,z:number):[number,number]=>{
    let best:[number,number]=[O[0][0],O[0][1]],bd=Infinity;
    for(let i=1;i<O.length;i++){const [ax,az]=O[i-1],[bx,bz]=O[i],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
      const px=ax+dx*t,pz=az+dz*t,dd=Math.hypot(px-x,pz-z);if(dd<bd){bd=dd;best=[px,pz];}}
    return best;
  };
  for(const [x,z]of F){const [ox,oz]=outerAt(x*1.35,z*1.3);stringers.push([[x,floor,z],[ox,floor,oz]]);beam([x,floor,z],[ox,floor,oz],.018);}
  for(let i=1;i<stringers.length;i++)for(const t of [.33,.66]){
    const a=stringers[i-1],b=stringers[i];
    const pa:V3=[a[0][0]+(a[1][0]-a[0][0])*t,floor+.012,a[0][2]+(a[1][2]-a[0][2])*t];
    const pb:V3=[b[0][0]+(b[1][0]-b[0][0])*t,floor+.012,b[0][2]+(b[1][2]-b[0][2])*t];
    P.addEquipment('turretDark',beamBetween(pa,pb,.010,6));
  }
  // Slat walls (the deeper screens) along the outer frame.
  for(let i=1;i<O.length;i++){
    const [ax,az]=O[i-1],[bx,bz]=O[i],len=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(bx-ax,bz-az);
    for(const y of [floor,(floor+top)/2,top])screenRod(P,[ax,y,az],[bx,y,bz],y===top?.018:.014);
    const count=Math.max(1,Math.round(len/.095));
    for(let k=1;k<count;k++){const t=k/count;screenRod(P,[ax+(bx-ax)*t,floor+.012,az+(bz-az)*t],[ax+(bx-ax)*t,top-.012,az+(bz-az)*t],.008);}
    for(let k=0;k<3&&len>.3;k++){const t=(k+.5)/3;screenTie(P,[ax+(bx-ax)*t,top-.038,az+(bz-az)*t],[.022,.120,.074],yaw+Math.PI/2);}
  }
  for(const [x,z]of O)screenRod(P,[x,floor,z],[x,top,z],.018);
  // The outer frame's front corners meet the cabinets' rear flanges.
  for(const [i,j]of [[0,0],[O.length-1,F.length-1]] as const)beam([O[i][0],floor,O[i][1]],[F[j][0],floor,F[j][1]],.020);
  // Goose-neck stays: up from the beam behind the rear boxes, over their roofs, and clamped down on the roofs' high
  // inner ends (the casting's rear roof under them is all Relikt).
  for(const i of [2,3,4]){
    const [x,z]=F[i],postTop=.84,target=S.pad(x*.80,z*.80,postTop,{search:.12,radius:.022,buckets:FIXED});
    if(!target)throw new Error(`${P.spec.id}: basket stay has no pad near ${x*.8},${z*.8}`);
    const over:V3=[target[0],postTop,target[2]];
    if(!S.clear([x,floor+.03,z],[x,postTop,z],.020)||!S.clear([x,postTop,z],over,.020))throw new Error(`${P.spec.id}: basket stay ${i} is blocked`);
    beam([x,floor,z],[x,postTop,z],.022);beam([x,postTop,z],over,.022);beam(over,[target[0],target[1]+.01,target[2]],.022);
    footPlate(P,new THREE.Vector3(...target),S.top(target[0],target[2],FIXED,false)?.n??UP,[.11,.024,.11]);
  }
  // The rear cable drum on two arms from the rear frame.
  for(const x of [-.19,.19])beam([x,.46,-2.62],[x,.46,-2.84],.02);
  P.addEquipment('turretDark',cylX(.088,.31,20),0,.46,-2.83);
  for(const x of [-.17,.17])P.addEquipment('turretDetail',cylX(.115,.024,18),x,.46,-2.83);
  for(const z of [-2.62,-2.40])beam([-.19,.46,z],[.19,.46,z],.016);
  // Stowage on the basket floor.
  strappedPack(P,'turret',[-.78,floor+.088,-2.32],[.34,.15,.36]);
  // The drone dock's landing bolted on two joists across the floor's gunner-side bay, beam to rear frame.
  {
    const [lx,,lz,lw]=UKRAINE_DOCK_LANDINGS.t72b3m_hetman_ii;
    for(const jx of [lx-lw*.36,lx+lw*.36]){
      const front=pathAt(F,0,jx),rear=pathAt(O,0,jx);
      beam([jx,floor,front],[jx,floor,rear],.020);void lz;
    }
  }
  S.refresh();dockLanding(P,S,'t72b3m_hetman_ii');
  P.addEquipment('turretDetail',box(.52,.17,.30),0,floor+.097,-2.40);
  P.addEquipment('turretDetail',box(.535,.02,.315),0,floor+.19,-2.40);
  for(const dx of [-.15,.15])P.addEquipment('turretDark',box(.032,.05,.014),dx,floor+.15,-2.25);
}

const hetmanIINet=():GhillieConfig=>turretSuit('t72b3m_hetman_ii',{roof:.80,x:1.95,front:1.75,rear:-2.60,marks:turretMarks('t72b3m_hetman_ii'),
  sides:[{side:-1,z0:-2.26,z1:-1.49,bottom:.24,top:.66,out:()=>1.30},{side:1,z0:-2.26,z1:-1.65,bottom:.24,top:.66,out:()=>1.27}],
  rearFace:{zAt:(x:number)=>pathAt(HETMAN_II_BASKET,0,x),x0:-.98,x1:.98,y0:.305,y1:.63}});

function hetmanII(P:TankBuilderPort,S:TurretStock):void {
  const l=NATIONAL_ROOF_LOADOUTS.t72b3m_hetman_ii,sweep=stationSweep(P);
  // Lid stations kept clear of lid ERA: the cage legs, then per flank the lamp, the sensor head and the panorama.
  const fit={l:{lamp:.74,eye:.44,pan:-.62},r:{lamp:.22,eye:-.08,pan:-.80}};
  const station=(side:number,dBack:number,fa:number):[number,number]=>{const p=b3mFlank(side).at(b3mFlank(side).face-dBack,fa,0);return [p.x,p.z];};
  const reservedL:[number,number][]=[[-1.17,.06],[-1.17,-.86],[-1.42,.06],[-1.42,-.86],station(-1,.12,fit.l.lamp),station(-1,.16,fit.l.eye),station(-1,.20,fit.l.pan)];
  const reservedR:[number,number][]=[[.98,-.32],[.98,-.90],[1.40,-.32],[1.40,-.90],station(1,.12,fit.r.lamp),station(1,.16,fit.r.eye),station(1,.20,fit.r.pan)];
  const L=flankCabinet(P,S,-1,-.84,.86,3,reservedL),R=flankCabinet(P,S,1,-1.00,.33,2,reservedR);
  S.refresh();
  roofCageWings(P,S,[
    {side:-1,inner:1.10,outer:1.92,z0:-1.06,z1:.26,y:1.16,legX:[1.17,1.42],legZ:[.06,-.86]},
    {side:1,inner:.95,outer:1.80,z0:-1.26,z1:-.16,y:1.16,legX:[.98,1.40],legZ:[-.32,-.90]},
  ]);
  S.refresh();
  commandBasket(P,S);
  S.refresh();
  // Slit lamps and the twin sensor heads on the cabinets' forward lids.
  for(const [F,f]of [[L,fit.l],[R,fit.r]] as const){
    const lamp=F.at(F.face-.12,f.lamp,0),eye=F.at(F.face-.16,f.eye,0);
    lampOnHousing(P,S,lamp.x,lamp.z,l.lamp,.04);
    const seat=S.pad(eye.x,eye.z,0,{search:.08,radius:.03});
    if(!seat)throw new Error(`${P.spec.id}: no sensor seat`);
    nationalEye(P,seat[0],seat[2],seat[1],l);
  }
  // The scanner on the roof ventilator housing; two panoramas on the rear lids of the cabinets.
  {
    nationalRoofSensor(P,0,-.80,levelSeat(P,S,0,-.80,.17),l);
    for(const [F,fa]of [[L,fit.l.pan],[R,fit.r.pan]] as const){const p=F.at(F.face-.20,fa,0);panorama(P,S,p.x,p.z,.17);}
  }
  // Aerials on the basket's rear corners, a harness from the left panorama back along the basket.
  for(const [x,z,h]of [[-1.00,-2.62,.90],[1.00,-2.62,.75]] as const){
    if(Math.hypot(x-sweep.x,z-sweep.z)<sweep.r)throw new Error(`${P.spec.id}: aerial inside the station sweep`);
    P.addEquipment('turretDetail',box(.10,.05,.10),x,.685,z);
    P.addEquipment('turretDetail',cylY(.050,.062,.055,12),x,.737,z);
    P.addEquipment('turretDark',cylY(.007,.014,h,10),x,.765+h/2,z);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// T-72B3 Sich: the field modernization on the T-72B3 turret

/** The T-72B3 turret's side stowage cases (t72b3XEquipment.ts sideCase): each is a straight case yawed 33.3 degrees
 * whose outer wall stands vertical (u = 1.73557 m in the case frame) above a lower inward chamfer. In this turret's
 * frame: the wall's rear and front ends, its outward normal and run, and its heights. */
const B3_RING:V3=[.0000002374,1.457100315,.065591405];
interface B3Case { rear:THREE.Vector3; front:THREE.Vector3; n:THREE.Vector3; run:THREE.Vector3; floor:number; chamferTop:number; top:number; lid:number }
function b3Case(side:number):B3Case {
  const a=Math.atan2(.54883,.835934),c=Math.cos(a),sn=side*Math.sin(a),shift=.172150015831;
  const at=(u:number,v:number)=>{const x=side*u,z=v;return new THREE.Vector3(x*c+z*sn+(side>0?-.0007:0)-B3_RING[0],0,-x*sn+z*c+shift-B3_RING[2]);};
  const rear=at(1.73557,-.59),front=at(1.73557,.327),run=front.clone().sub(rear).normalize();
  const n=new THREE.Vector3(run.z,0,-run.x);if(n.x*side<0)n.negate();
  return {rear,front,n,run,floor:1.6165-B3_RING[1],chamferTop:1.9417-B3_RING[1],top:2.0467-B3_RING[1],lid:2.0615-B3_RING[1]};
}

/** Kontakt-style brick housings clamped on a side case's outer wall: a steel back plate on the wall, hooked over the
 * lid and gripping under the case floor, carrying rows x cols of small cassettes seated on it by ray. */
function caseWallBricks(P:TankBuilderPort,S:TurretStock,side:number,v0:number,v1:number,segments:number,rows:number,cols:number):B3Case {
  const b=b3Case(side),yaw=Math.atan2(b.n.x,b.n.z),depth=.045,lip=.06;
  const top=b.lid+.026,bottom=b.floor-.022,len=(v1-v0)/segments;
  for(let k=0;k<segments;k++){
    const va=v0+k*len+.006,vb=v0+(k+1)*len-.006,m=(va+vb)/2;
    const probe=b.rear.clone().addScaledVector(b.run,m+.59).addScaledVector(b.n,.6).setY((b.chamferTop+b.top)/2);
    const face=S.cast(probe,b.n.clone().negate(),['turretDetail'],1);
    if(!face)throw new Error(`${P.spec.id}: side case wall not found`);
    const H=face.point.clone().setY(0);
    P.addExternalArmor('turret',box(vb-va,top-bottom,depth),...H.clone().addScaledVector(b.n,depth/2).setY((top+bottom)/2).toArray(),0,yaw,0);
    P.addExternalArmor('turret',box(vb-va,.022,lip+depth),...H.clone().addScaledVector(b.n,(depth-lip)/2).setY(b.lid+.013).toArray(),0,yaw,0);
    // The claw reaches in under the chamfer to the case floor's outer edge (lowOuter, 179 mm inside the wall).
    P.addExternalArmor('turret',box(vb-va,.018,.20+depth),...H.clone().addScaledVector(b.n,(depth-.20)/2).setY(b.floor-.012).toArray(),0,yaw,0);
  }
  S.refresh();
  const cw=(v1-v0-.02)/(segments*cols)-.014,rh=(top-bottom-.04)/rows-.014;
  for(let k=0;k<segments*cols;k++)for(let r=0;r<rows;r++){
    const v=v0+.01+cw/2+k*(cw+.014);
    const y=bottom+.02+rh/2+r*(rh+.014);
    seatedEra(P,S,b.rear.clone().addScaledVector(b.run,v+.59).addScaledVector(b.n,.7).setY(y),b.n.clone().negate(),b.run,[cw,.075,rh]);
  }
  return b;
}

/** A receiving housing built out from the curved cast flank (closed, chamfered, its inner face buried in the casting),
 * carrying a block of cassettes on its vertical outer face. */
function flankHousing(P:TankBuilderPort,S:TurretStock,side:number,z0:number,z1:number,outer:number,bottom:number,top:number,rows:number,cols:number):void {
  const ring=(z:number):{z:number;ring:[number,number][]}=>{
    const pts:[number,number][]=[[.92,bottom],[outer-.04,bottom],[outer,bottom+.04],[outer,top-.04],[outer-.04,top],[.92,top]];
    if(side<0){for(const p of pts)p[0]*=-1;pts.reverse();}
    return {z,ring:pts};
  };
  P.addExternalArmor('turret',sectionSolid([ring(z0),ring(z0+.03),ring(z1-.03),ring(z1)]));
  S.refresh();
  const cw=(z1-z0-.04)/cols-.014,rh=(top-bottom-.04)/rows-.014;
  for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
    const z=z0+.02+cw/2+c*(cw+.014),y=bottom+.02+rh/2+r*(rh+.014);
    seatedEra(P,S,new THREE.Vector3(side*3,y,z),new THREE.Vector3(-side,0,0),new THREE.Vector3(0,0,1),[cw,.075,rh]);
  }
}

/** Roof-edge cassettes laid straight on the cast shoulder (the casting's own slope), seated by ray toward the axis. */
function shoulderEra(P:TankBuilderPort,S:TurretStock,side:number,zs:readonly number[],y:number):void {
  for(const z of zs){
    const dir=new THREE.Vector3(-side*.82,-.57,0).normalize(),origin=new THREE.Vector3(side*1.05,y,z).addScaledVector(dir,-.6);
    seatedEra(P,S,origin,dir,new THREE.Vector3(0,0,1),[.22,.07,.16]);
  }
}

/** Shovel and pry bar on clips along a side case's lid. */
function lidTools(P:TankBuilderPort,S:TurretStock,side:number):void {
  const b=b3Case(side),yaw=Math.atan2(b.run.x,b.run.z);
  for(const [inset,len,r]of [[.15,.50,.016],[.25,.52,.013]] as const){
    const a=b.rear.clone().addScaledVector(b.run,.04).addScaledVector(b.n,-inset),e=a.clone().addScaledVector(b.run,len);
    const y=b.lid+.034;
    P.addEquipment('turretDetail',beamBetween([a.x,y,a.z],[e.x,y,e.z],r,8));
    for(const t of [.15,.85]){
      const p=a.clone().lerp(e,t);
      P.addEquipment('turretDark',box(.07,.05,.035),p.x,b.lid+.024,p.z,0,yaw,0);
    }
    if(inset<.2){
      const blade=a.clone().addScaledVector(b.run,-.0);
      P.addEquipment('turretDetail',box(.17,.014,.20),blade.x,y,blade.z,0,yaw,0);
    }
  }
}

const SICH_SCREEN:Path=[[-1.36,-1.24],[-1.12,-1.56],[-.72,-1.84],[.78,-1.84],[1.16,-1.56],[1.38,-1.24]];
const sichNet=():GhillieConfig=>screenNet('t72b3_sich',SICH_SCREEN,{bottom:.14,top:.72,roof:.74,x:1.90,front:1.70,
  sideRuns:[{side:-1,z0:-1.56,z1:-1.24},{side:1,z0:-1.56,z1:-1.24}],back:[-1.10,1.14]});

function sich(P:TankBuilderPort,S:TurretStock):void {
  const l=NATIONAL_ROOF_LOADOUTS.t72b3_sich,sweep=stationSweep(P);
  // Kontakt-style brick banks clamped on both side cases' walls, and a receiving housing built out from the bare cast
  // flank between the commander-side cheek bank and its case.
  caseWallBricks(P,S,-1,-.56,.30,2,3,2);
  caseWallBricks(P,S,1,-.56,.30,2,3,2);
  flankHousing(P,S,-1,-.34,-.05,1.55,.06,.44,2,2);
  S.refresh();
  roofCageWings(P,S,[
    {side:-1,inner:1.06,outer:1.84,z0:-1.00,z1:.12,y:1.08,legX:[1.25,1.48],legZ:[-.10,-.62]},
    {side:1,inner:.99,outer:1.80,z0:-1.34,z1:-.62,y:1.08,legX:[1.17,1.30],legZ:[-.84,-1.20],outerAt:[1.30,1.17]},
  ]);
  S.refresh();
  bustleScreen(P,S,{path:SICH_SCREEN,bottom:.14,top:.72,armY:.13,arms:[0,1,2,3,4,5],ties:3});
  S.refresh();
  // Slit lamps on both side cases' forward lids, raised over the cheek bank and the smoke bank; the flat sensor head on
  // the gunner-side lid; the spine on the roof ventilator housing.
  lampOnHousing(P,S,-1.46,-.42,l.lamp,.20);
  lampOnHousing(P,S,1.46,-.42,l.lamp,.20);
  {
    const seat=S.pad(1.05,-1.02,0,{search:.06,radius:.03,buckets:FIXED});if(!seat)throw new Error(`${P.spec.id}: no sensor seat`);
    nationalEye(P,seat[0],seat[2],seat[1],l);
    nationalRoofSensor(P,.066,-.82,levelSeat(P,S,.066,-.82,.17),l);
  }
  lidTools(P,S,-1);
  // A utility can and the tarpaulin roll on the rear case's lid; the drone dock's landing beside them.
  utilityCase(P,S,-.40,-1.53,.15,.19,.17);
  {
    const top=S.top(-.08,-1.53,FIXED,false);if(!top)throw new Error(`${P.spec.id}: no tarp seat`);
    P.addEquipment('turretCloth',cylX(.082,.40,18),-.08,top.point.y+.082,-1.53);
    for(const x of [-.21,.05])P.addEquipment('turretDark',box(.030,.175,.181),x,top.point.y+.082,-1.53);
  }
  dockLanding(P,S,'t72b3_sich');
  cableRun(P,S,[[-1.20,.70,-.78],[-1.08,.70,-1.05],[-.80,.74,-1.28]],.012);
  // Aerials outside the station's sweep on the screen's two rear corner posts.
  for(const [i,h]of [[2,.70],[3,.85]] as const){
    const [x,z]=SICH_SCREEN[i];
    if(Math.hypot(x-sweep.x,z-sweep.z)<sweep.r)throw new Error(`${P.spec.id}: aerial inside the station sweep`);
    P.addEquipment('turretDetail',box(.10,.05,.10),x,.745,z);
    P.addEquipment('turretDetail',cylY(.048,.060,.05,12),x,.795,z);
    P.addEquipment('turretDark',cylY(.007,.013,h,10),x,.82+h/2,z);
  }
}

// ---------------------------------------------------------------------------------------------------------------

function turretUpArmour(P:TankBuilderPort,id:UkraineDonorId):void {
  const S=new TurretStock(P);
  try {
    if(id==='t72b3m_hetman')hetman(P,S);
    else if(id==='t72b3m_hetman_ii')hetmanII(P,S);
    else sich(P,S);
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

/** The suit a donor-turret concept wears: the national hull half and this kit's turret half (undefined otherwise). */
export function ukraineDonorSuit(id:string):GhillieConfig|undefined {
  return id==='t72b3m_hetman'?hetmanNet():id==='t72b3m_hetman_ii'?hetmanIINet():id==='t72b3_sich'?sichNet():undefined;
}

function fitUkraineDonorTurret(P:TankBuilderPort,id:UkraineDonorId):void {
  turretUpArmour(P,id);
  // The hull screens stay as the national protection lays them; the turret's own screens are this kit's (above).
  addNationalUkraineProtection(P,id,{turretScreens:false});
  addVehicleGhillieSuit(P,ukraineDonorSuit(id)!);
}
void markSmokeTube;void blindTube;void cylX;void torus;
