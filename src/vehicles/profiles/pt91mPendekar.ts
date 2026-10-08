import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {buildT72BUXCore,T72BU_X_DATUMS} from './t72buX.ts';
import {KIT} from './kit.ts';
import {sampleArmorRay} from './armorFaceSampling.ts';
import {beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';

const YAW=new THREE.Vector3(...T72BU_X_DATUMS.turretPivot);
const {box,cylZ,cylX}=KIT;
const cylY=(r:number,h:number,n=20)=>KIT.cylY(r,r,h,n);
type Seat={owner:'hull'|'turret';center:number[];normal:number[];corners:number[][];surface:number[][]};
function emittedShell(P:TankBuilderPort,owner:'hull'|'turret'):THREE.BufferGeometry{
 const parts:THREE.BufferGeometry[]=[];
 P.forEachBucketPart([owner],g=>parts.push(g.index?g.toNonIndexed():g.clone()));
 const shell=mergeGeometries(parts);for(const part of parts)part.dispose();
 if(!shell)throw new Error('Pendekar requires its complete T-72BU '+owner);return shell;
}
function equipment(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
 P.addEquipment(bucket,g,x-YAW.x,y-YAW.y,z-YAW.z);
}
/** Four finite feet seat every rectangular cassette on actual donor stock.
 * Flat ERAWA boxes remain distinct from the donor's removed chevron kit. */
function cassette(P:TankBuilderPort,shell:THREE.BufferGeometry,owner:'hull'|'turret',origin:THREE.Vector3,direction:THREE.Vector3,
 width:number,height:number,label:string,receipts:Seat[]):boolean{
 const hit=sampleArmorRay(shell,origin,direction);if(!hit)return false;
 const n=hit.normal.clone();if(n.dot(direction)>0)n.negate();
 const u=new THREE.Vector3(0,1,0).cross(n);if(u.lengthSq()<1e-5)u.set(1,0,0);u.normalize();
 const v=new THREE.Vector3().crossVectors(n,u).normalize(),corners:THREE.Vector3[]=[],surfaces:THREE.Vector3[]=[];
 for(const a of[-1,1])for(const b of[-1,1]){
  const foot=hit.point.clone().addScaledVector(u,a*(width/2-.026)).addScaledVector(v,b*(height/2-.022));
  const support=sampleArmorRay(shell,foot.clone().addScaledVector(n,.4),n.clone().negate());
  if(!support||support.point.distanceTo(foot)>.15)return false;
  corners.push(foot);surfaces.push(support.point);
 }
 const outward=Math.max(...surfaces.map(p=>p.clone().sub(hit.point).dot(n)))+.012;
 const back=hit.point.clone().addScaledVector(n,outward),depth=.055;
 const rotation=new THREE.Matrix4().makeBasis(u,v,n),center=back.clone().addScaledVector(n,depth/2);
 const solid=markEraHitFaces(box(width,height,depth),[0,0,1]).applyMatrix4(rotation).translate(center.x,center.y,center.z);
 P.destructibleCluster(label,()=>P.addExternalArmor(owner,solid));
 const seated=corners.map((p,i)=>{
  const tip=p.clone().addScaledVector(n,outward+.006),root=surfaces[i]!.clone().addScaledVector(n,-.006);
  P.addEquipment(owner+'Detail',beamBetween(root.toArray(),tip.toArray(),.012,6));return tip.toArray();
 });
 receipts.push({owner,center:center.toArray(),normal:n.toArray(),corners:seated,surface:surfaces.map(p=>p.toArray())});return true;
}
function armor(P:TankBuilderPort,hull:THREE.BufferGeometry,turret:THREE.BufferGeometry):void{
 const receipts:Seat[]=[];
 for(const side of[-1,1]){
  for(const angle of[25,38,51,64,77])for(const y of[1.57,1.765,1.96]){
   const a=side*angle*Math.PI/180,n=new THREE.Vector3(Math.sin(a),0,Math.cos(a));
   const origin=n.clone().multiplyScalar(3).add(new THREE.Vector3(0,y,.248)).sub(YAW);
   cassette(P,turret,'turret',origin,n.negate(),.245,.17,`turret_era_${side<0?'L':'R'}`,receipts);
  }
  // Keep the complete tile width inboard of the donor's x=.916 fender crown.
  // Straddling that raised transition lifts the outer cell into the cannon's
  // depressed 30°/330° traverse path even though its feet touch real stock.
  for(const x of[.12,.35,.58,.81])for(const z of[1.96,2.28,2.60,2.91])
   cassette(P,hull,'hull',new THREE.Vector3(side*x,3,z),new THREE.Vector3(0,-1,0),.20,.27,`glacis_era_${side<0?'L':'R'}`,receipts);
  // ERAWA skirt cassettes sit outboard of the retained thin donor leaves;
  // brackets bridge to those leaves without filling the track corridor.
  for(const z of[.76,1.50,2.24]){
   const y=1.105-(z>1.7?(z-1.7)*.055:0),x=side*1.796;
   for(const dz of[-.25,.25])P.addEquipment('hullDetail',box(.065,.035,.075),side*1.768,y+.13,z+dz);
   P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
    for(const dz of[-.165,.165])P.addExternalArmor('hull',markEraHitFaces(box(.06,.41,.315),[side,0,0]),x,y,z+dz);
   });
  }
 }
 P.turretG.userData.pt91mEraSeats=receipts;
}
function roof(P:TankBuilderPort,shell:THREE.BufferGeometry):void{
 const roofY=(x:number,z:number)=>{
  const hit=sampleArmorRay(shell,new THREE.Vector3(x-YAW.x,4,z-YAW.z),new THREE.Vector3(0,-1,0));
  if(!hit)throw new Error('Pendekar fitting has no T-72BU roof');return hit.point.y+YAW.y;
 };
 const cupolaSeats:{center:number[];radius:number;bottom:number;top:number}[]=[];
 for(const [x,z,r]of[[-.58,-.05,.31],[.55,-.28,.28]]){
  const y=roofY(x,z);
  // A flat, shallow cylinder seats only its centre on this cast dome. Sink the
  // complete collar below every native rim point, while keeping the hatch datum.
  const bottom=Math.min(...Array.from({length:28},(_,i)=>roofY(x+r*Math.cos(i*Math.PI/14),z+r*Math.sin(i*Math.PI/14))))-.012;
  const top=y+.110;
  P.addCupola('turret',cylY(r,top-bottom,28),x-YAW.x,(top+bottom)/2-YAW.y,z-YAW.z);
  cupolaSeats.push({center:[x-YAW.x,z-YAW.z],radius:r,bottom:bottom-YAW.y,top:top-YAW.y});
  equipment(P,'turretDetail',cylY(r*.94,.026,28),x,y+.122,z);
  for(let i=0;i<6;i++){
   const a=i*Math.PI/3,cx=x+Math.cos(a)*r*.93,cz=z+Math.sin(a)*r*.93;
   equipment(P,'turretDetail',box(.09,.06,.075).rotateY(-a),cx,y+.097,cz);
   equipment(P,'turretGlass',box(.064,.025,.078).rotateY(-a),cx,y+.100,cz);
  }
  equipment(P,'turretDetail',box(.10,.035,.05),x,y+.150,z+.12);
 }
 P.turretG.userData.pt91mCupolaSeats=cupolaSeats;
 // Distinct boxed fire-control sight with hood, recessed lens and separate
 // protective cheeks. Its bottom is sunk into the measured donor roof.
 const sx=.52,sz=.63,sy=roofY(sx,sz);
 equipment(P,'turretDetail',box(.36,.08,.34),sx,sy+.02,sz);
 for(const dx of[-.16,.16])equipment(P,'turretDetail',box(.04,.25,.35),sx+dx,sy+.15,sz);
 equipment(P,'turretDetail',box(.36,.035,.35),sx,sy+.29,sz);
 equipment(P,'turretDark',box(.30,.23,.025),sx,sy+.15,sz-.15);
 equipment(P,'turretDark',box(.31,.18,.036),sx,sy+.15,sz+.086);
 P.addModuleVisual('optics','turretGlass',box(.25,.145,.022),sx-YAW.x,sy+.15-YAW.y,sz+.105-YAW.z);
 equipment(P,'turretDetail',box(.14,.12,.11),sx+.25,sy+.08,sz-.03);
 // Panorama and weather instruments sit on independent permanent pedestals.
 const px=-.72,pz=-.65,py=roofY(px,pz);
 equipment(P,'turretDetail',cylY(.12,.16),px,py+.06,pz);
 equipment(P,'turretDetail',box(.20,.18,.22),px,py+.22,pz);
 equipment(P,'turretGlass',box(.155,.095,.025),px,py+.22,pz+.12);
 const mx=-.24,mz=-.90,my=roofY(mx,mz);
 equipment(P,'turretDetail',box(.12,.075,.13),mx,my+.025,mz);
 equipment(P,'turretDark',cylY(.014,.72,10),mx,my+.40,mz);
 equipment(P,'turretDetail',box(.10,.08,.10),mx,my+.80,mz);
 equipment(P,'turretDark',cylX(.009,.27,8),mx,my+.835,mz);
 for(const side of[-1,1]){
  const x=side*.55,z=-.78,y=roofY(x,z);
  equipment(P,'turretDetail',cylY(.05,.10,12),x,y+.03,z);
  equipment(P,'turretDark',cylY(.004,.75,8),x,y+.43,z);
  equipment(P,'turretDetail',box(.12,.12,.12),side*1.00,roofY(side*1.00,-.2)+.035,-.2);
  equipment(P,'turretGlass',box(.08,.065,.025).rotateY(side*.7),side*1.02,roofY(side*1.00,-.2)+.06,-.135);
 }
 const gunY=roofY(-.58,-.05)+.38;
 equipment(P,'turretDetail',cylY(.065,.27),-.58,gunY-.16,-.05);
 const mg=sourceMachineGun(P,T72BU_X_DATUMS.turretPivot);
 mg.add('turretDark',box(.13,.115,.42),-.58,gunY,.17);
 mg.add('turretDark',cylZ(.025,.62,16),-.58,gunY,.65);
 mg.add('turretDetail',box(.22,.20,.25),-.78,gunY-.025,.09);
 mg.add('turretDark',box(.065,.055,.12),-.6575,gunY-.015,.14);
 mg.add('turretDark',box(.12,.03,.08),-.58,gunY+.071,.23);
 mg.add('turretDark',cylZ(.035,.10,12),-.58,gunY,1.01);
 mg.finish().name='pt91mCommandMG';
 P.turretG.userData.pt91mRoofEquipmentReceipt={revision:'t72bu-pendekar-roof-r1',cupolas:2,periscopeBlocks:12,mainSight:'boxed-recessed',panorama:true,metMast:true};
 P.topY=Math.max(my+.844,gunY+.10)-YAW.y;
}
function rearBasketAndSmoke(P:TankBuilderPort):void{
 for(const side of[-1,1]){
  const x=side*.68;
  equipment(P,'turretDetail',beamBetween([x,1.83,-.76],[x,1.77,-1.47],.021),0,0,0);
  for(const z of[-1.06,-1.50])equipment(P,'turretDetail',beamBetween([x,1.71,z],[x,2.02,z],.018),0,0,0);
  for(const y of[1.72,2.02])equipment(P,'turretDetail',beamBetween([x,y,-1.02],[x,y,-1.54],.018),0,0,0);
  equipment(P,'turretDetail',beamBetween([side*1.02,1.79,-.25],[side*1.34,1.85,-.12],.024),0,0,0);
  // A connected rear ladder cradles both smoke courses at their closed ends.
  // The original single diagonal arm did not touch the upper/outboard tubes.
  const back=new THREE.Vector3(0,0,-.108).applyAxisAngle(new THREE.Vector3(1,0,0),-.35).applyAxisAngle(new THREE.Vector3(0,1,0),side*.7);
  const rail=(row:number,x:number)=>new THREE.Vector3(side*x,1.96-row*.135,-.10-row*.06).add(back);
  for(const row of[0,1])equipment(P,'turretDetail',beamBetween(rail(row,1.18).toArray(),rail(row,1.39).toArray(),.022),0,0,0);
  equipment(P,'turretDetail',beamBetween(rail(0,1.285).toArray(),rail(1,1.285).toArray(),.020),0,0,0);
  equipment(P,'turretDetail',beamBetween([side*1.34,1.85,-.12],rail(1,1.285).toArray(),.022),0,0,0);
  for(let row=0;row<2;row++)for(let i=0;i<3;i++){
   const x=side*(1.18+i*.105),y=1.96-row*.135,z=-.10-row*.06;
   equipment(P,'turretDark',markSmokeTube(blindTube(.042,.028,.24,.12,12),[0,0,1],true).rotateX(-.35).rotateY(side*.7),x,y,z);
  }
 }
 for(const y of[1.72,2.02])equipment(P,'turretDetail',beamBetween([-.70,y,-1.52],[.70,y,-1.52],.018),0,0,0);
 for(const x of[-.48,-.24,0,.24,.48])equipment(P,'turretDetail',beamBetween([x,1.72,-1.04],[x,1.72,-1.52],.012),0,0,0);
 // Stowed kit occupies only the basket floor; the upper bays stay open.
 equipment(P,'turretCloth',cylX(.10,.54,16),-.31,1.83,-1.31);
 equipment(P,'turretCloth',box(.31,.19,.27),.34,1.822,-1.31);
}
export function buildPT91MPendekar(P:TankBuilderPort):void{
 buildT72BUXCore(P);
 const hull=emittedShell(P,'hull'),turret=emittedShell(P,'turret');
 try{armor(P,hull,turret);roof(P,turret);rearBasketAndSmoke(P);}finally{hull.dispose();turret.dispose();}
 P.hullG.userData.pt91mDonor={id:'t72bu_x',revision:'pendekar-bu-r1',core:'hull/turret/fenders/running-gear/main-gun'};
}
