// The T-90 obr. 1992 (`t90_1992`): its own fittings on the T-90 source build (t90AwX.ts, cast turret). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The first production T-90 still carried the T-72B's night and field kit: the commander's IR searchlight, the IR
// driving lamp, rubber mud flaps at the rear fender ends, a rubber fringe under the side screens, welded ZIP boxes on the
// rear fenders and stowage bins in the turret's rear corners. Every part is seated on the source stock it hangs from
// (the raycasts below fail loudly if that stock moves). 2026-10-31: the cast turret carries the first production T-90's
// chunky welded Kontakt-5 packs over its K-5 V (t90Mark1992Turret.ts): a blind A/B against the pre-rebuild build
// preferred its "bulky, blocky ERA-covered turret"; the front mud flaps are gone (that A/B: "oversized curved bow
// mudguard plates flaring forward and drooping over the tracks").
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addT90Mark1992CheekPacks} from './t90Mark1992Turret.ts';
type V3=readonly[number,number,number];
const YAW=T90_AW_X_SOURCE_DATUMS.turretPivot;
const {box,cylX,cylZ,torus}=KIT;

function top(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
/** First hit of a ray on the named hull stock (builder frame). */
function hit(P:TankBuilderPort,buckets:string[],from:V3,dir:V3,what:string):THREE.Vector3{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ray=new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...dir).normalize());
  let best:THREE.Intersection|undefined;
  P.forEachBucketPart(buckets,g=>{const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();const h=ray.intersectObject(m)[0];if(h&&(!best||h.distance<best.distance))best=h;});
  mat.dispose();
  if(!best)throw new Error(`${P.spec.id}: the 1992 kit's ${what} found no stock from ${from.join(',')}`);
  return best.point;
}

// OU-3GA2M: the commander's IR searchlight the first T-90s kept from the T-72B, hung on the inboard trunnion boss of the
// cupola's NSVT cradle (t90AwXAAReceiver.ts pivotBody: boss face x -0.230, axis y 2.579, z 0.052) so it elevates with it.
function commanderSearchlight(P:TankBuilderPort):void{
  const face=-.230,y=2.57913,z=.05237,r=.105,len=.21,x=face+.014+r,front=z+len/2;
  top(P,'turretDetail',cylZ(r,len,24),x,y,z);
  top(P,'turretDark',torus(r-.004,.011,24,8).rotateX(Math.PI/2),x,y,front);
  top(P,'turretGlass',markVehicleNightLens(cylZ(r-.012,.006,24),'headlight',{tint:'red'}),x,y,front-.001);
  top(P,'turretDetail',cylZ(.072,.036,20,.082),x,y,z-len/2-.017);
  top(P,'turretDark',cylZ(.014,.03,10),x,y-.02,z-len/2-.045);
  // clamp band, side plate on the boss face and the pin through both
  top(P,'turretDark',torus(r+.002,.008,24,6).rotateX(Math.PI/2),x,y,z);
  top(P,'turretDetail',box(.014,.15,.12),face+.007,y,z);
  top(P,'turretDetail',cylX(.020,.03,12),face+.009,y,z);
  // carry handle over the drum
  const hy=y+r-.004,hz=[z-.06,z+.06];
  for(const zz of hz)top(P,'turretDark',beamBetween([x,hy,zz],[x,hy+.045,zz],.007,8),0,0,0);
  top(P,'turretDark',beamBetween([x,hy+.045,hz[0]],[x,hy+.045,hz[1]],.007,8),0,0,0);
}

// T-72B-pattern stowage bins in the turret's rear corners beside the bustle box, clear of the cases on the flanks: welded
// sheet boxes with a lapped lid, a rear hinge and two hasps, butted to the rear wall on two gussets; the left one
// also rides the cases' transverse carrier tube (t90AwXDetails.ts, top y 1.707 at z -1.240).
function turretBin(P:TankBuilderPort,side:number):void{
  const w=.34,h=.27,back=-1.50,low=1.705,xc=side*(.745+w/2);
  // the wall it butts: the casting, or the flank case's raking rear face where that stands further aft
  const wallZ=(x:number,y:number)=>hit(P,['turret','turretDetail'],[x-YAW[0],y-YAW[1],back-1-YAW[2]],[0,0,1],'turret bin wall').z+YAW[2];
  let front=9;
  for(let dx=-w/2+.003;dx<w/2;dx+=.0167)for(const dy of [.035,.11,.18,.26])front=Math.min(front,wallZ(xc+dx,low+dy));
  front+=.002;
  const d=front-back,zc=(front+back)/2,y=low+h/2;
  top(P,'turretDetail',box(w,h,d),xc,y,zc);
  top(P,'turretDetail',box(w+.016,.018,d+.016),xc,low+h+.006,zc);
  top(P,'turretDetail',box(w+.006,.014,d+.006),xc,low+h*.42,zc);
  top(P,'turretDark',cylX(.011,w*.84,10),xc,low+h+.002,back-.006);
  for(const dx of [-.10,.10]){
    top(P,'turretDark',box(.036,.065,.012),xc+dx,low+h-.035,back-.006);
    top(P,'turretDark',box(.044,.014,.026),xc+dx,low+h+.004,back-.012);
  }
  // gussets from the wall to the bin floor, each run to the wall where it stands
  for(const dx of [-w/2+.05,w/2-.05]){
    const wz=wallZ(xc+dx,low-.03),len=Math.max(.06,wz-front+.10)+.004;
    top(P,'turretDetail',box(.012,.07,len),xc+dx,low-.035+.001,wz+.002-len/2);
  }
}

// FG-125: the driver's IR lamp inboard of the left headlight (the TVN-5 night sight's illuminator on the T-72B and the first
// T-90), on a stem to the glacis casting under the ERA; the headlight's inner guard bar and a new one box the pair.
function irDrivingLamp(P:TankBuilderPort):void{
  const x=.58,y=1.108,z=2.858,r=.066;
  const floor=hit(P,['hull'],[x,1.6,z],[0,-1,0],'IR lamp glacis').y;
  P.addEquipment('hullDetail',cylZ(r,.11,24),x,y,z);
  P.addEquipment('hullGlass',markVehicleNightLens(cylZ(r-.008,.006,24),'headlight',{tint:'red'}),x,y,z+.053);
  P.addEquipment('hullDetail',box(.05,y-r-floor+.012,.05),x,(y-r+floor)/2-.002,z-.01);
  P.addEquipment('hullDetail',beamBetween([x-.10,1.015,2.874],[x-.10,1.245,2.73],.009));
}

// Rear rubber mud flaps on the rear fender ends behind the sprockets, as the service tanks ran them. 2026-10-31 (a blind
// A/B against the pre-rebuild build: "oversized curved bow mudguard plates flaring forward and drooping over the
// tracks"): the front flaps that hung off the bow guards are gone, so the guards' outline reads tight.
function mudFlaps(P:TankBuilderPort):void{
  const x0=1.18,x1=1.78,w=x1-x0,cx=(x0+x1)/2;
  for(const side of [-1,1]){
    const rz=hit(P,['hull'],[side*cx,1.212,-5],[0,0,1],'rear flap').z;
    flap(P,side*cx,w,1.218,.80,rz,-1);
  }
}
function flap(P:TankBuilderPort,x:number,w:number,yTop:number,yLow:number,faceZ:number,dir:number):void{
  const t=.014,h=yTop-yLow,z=faceZ+dir*(t/2-.001);
  P.addEquipment('hullDark',box(w,h,t),x,yLow+h/2,z);
  // steel clamp strip and its bolts over the rubber
  const bz=z+dir*(t/2+.006);
  P.addEquipment('hullDetail',box(w-.02,.045,.012),x,yTop-.024,bz);
  for(const dx of [-.24,-.08,.08,.24])P.addEquipment('hullDark',cylZ(.010,.010,8),x+dx,yTop-.024,bz+dir*.010);
}

// ZIP (spare-parts) boxes on both rear fenders, behind the turret's sweep: welded sheet boxes with a lapped lid, a hinge
// along the inboard edge, two hasp latches outboard and angle feet bolted to the fender (T-72B fender stowage).
function zipBox(P:TankBuilderPort,x:number,z:number,w:number,d:number,h:number):void{
  const side=Math.sign(x);
  let base=9;
  for(const dx of [-.4,0,.4])for(const dz of [-.4,0,.4])
    base=Math.min(base,hit(P,['hull','hullDetail'],[x+dx*w,2.4,z+dz*d],[0,-1,0],'ZIP box seat').y);
  base-=.002;
  P.addEquipment('hullDetail',box(w,h,d),x,base+h/2,z);
  P.addEquipment('hullDetail',box(w+.018,.020,d+.018),x,base+h+.008,z);
  P.addEquipment('hullDetail',box(w+.006,.016,d+.006),x,base+h*.45,z);
  P.addEquipment('hullDark',cylZ(.012,d*.86,10),x-side*(w/2+.006),base+h+.004,z);
  for(const dz of [-.26,.26]){
    P.addEquipment('hullDark',box(.014,.07,.04),x+side*(w/2+.007),base+h-.03,z+dz*d);
    P.addEquipment('hullDark',box(.024,.016,.05),x+side*(w/2+.010),base+h+.006,z+dz*d);
  }
  for(const dz of [-1,1])P.addEquipment('hullDetail',box(w+.05,.022,.035),x,base+.011,z+dz*(d/2-.012));
}

// A rubber fringe bolted along the side screens' lower hem behind the Kontakt-5 cassettes, in seven strips a side (the
// early T-90's rubber-fabric screens ran lower than the later steel-framed skirts), outboard of the track and wheels.
function skirtFringe(P:TankBuilderPort,side:number):void{
  const n=7,segW=.54,gap=.014,z0=-2.97,t=.012,drop=.16,lap=.045,steps=5;
  const station=(z:number)=>{
    let low=9;
    for(let x=1.752;x<1.832;x+=.006){
      try{low=Math.min(low,hit(P,['hullFixedPaintedBodywork'],[side*x,.3,z],[0,1,0],'skirt hem').y);}catch{/* this x misses the hem's 18 mm sole here */}
    }
    if(low>8)throw new Error(`${P.spec.id}: the 1992 kit's skirt fringe found no hem at z ${z}`);
    const out=Math.abs(hit(P,['hullFixedPaintedBodywork'],[side*2.4,low+.02,z],[-side,0,0],'skirt face').x);
    return {z,low,out};
  };
  const sheet=(rows:readonly{z:number,low:number,out:number}[],dx0:number,dx1:number,dy0:number,dy1:number)=>sectionSolid(rows.map(({z,low,out})=>{
    const a=side*(out+dx0),b=side*(out+dx1),x0=Math.min(a,b),x1=Math.max(a,b);
    return {z,ring:[[x0,low+dy0],[x1,low+dy0],[x1,low+dy1],[x0,low+dy1]] as const};
  }));
  for(let i=0;i<n;i++){
    const a=z0+i*(segW+gap),rows=Array.from({length:steps+1},(_,k)=>station(a+segW*k/steps));
    P.addEquipment('hullDark',sheet(rows,-.001,t,-drop,lap));
    P.addEquipment('hullDetail',sheet(rows,t-.001,t+.007,.006,.040));
    for(const k of [1,steps-1]){
      const {z,low,out}=rows[k];
      P.addEquipment('hullDark',cylX(.009,.010,8),side*(out+t+.010),low+.023,z);
    }
  }
}

export function addT90Mark1992Kit(P:TankBuilderPort):void{
  commanderSearchlight(P);
  irDrivingLamp(P);
  mudFlaps(P);
  zipBox(P,1.29,-2.53,.54,.70,.28);
  zipBox(P,-1.39,-2.45,.46,.62,.28);
  for(const side of [-1,1]){skirtFringe(P,side);turretBin(P,side);}
  addT90Mark1992CheekPacks(P);
}
