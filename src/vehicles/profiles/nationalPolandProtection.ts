// Removable Polish slat screens fastened to permanent armor, not ERA lids.
// All panels are open structures; the shared ghillie system supplies scrim.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sampleArmorRay} from './armorFaceSampling.ts';
import {POLISH_PROTECTION_LAYOUTS,NATIONAL_POLAND_GHILLIE_CONFIGS} from '../nationalPolandProtectionConfig.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box}=KIT;

function armorSeat(stock:readonly THREE.BufferGeometry[],origin:THREE.Vector3,direction:THREE.Vector3):{point:THREE.Vector3;normal:THREE.Vector3} {
  let seat:{point:THREE.Vector3;normal:THREE.Vector3}|undefined,distance=Infinity;
  for(const g of stock){const hit=sampleArmorRay(g,origin,direction);if(hit){const d=hit.point.distanceToSquared(origin);
    if(d<distance){seat=hit;distance=d;}}}
  if(!seat)throw new Error(`Polish screen has no permanent support at ${origin.toArray()}`);
  if(seat.normal.dot(direction)>0)seat.normal.negate();
  seat.point.addScaledVector(seat.normal,-.015);
  return seat;
}

function part(P:TankBuilderPort,owner:'hull'|'turret',g:THREE.BufferGeometry,tag:string):void {
  g.userData.polishProtection=tag;
  // Open rods must not seed the voxel body closure across cage air gaps.
  P.addEquipment(`${owner}${tag==='mount-shoe'?'Detail':'OpenLattice'}`,g);
}

/** Three horizontal slats, posts and long stand-off arms make each screen a
 * physically supported assembly. Every arm ends 15 mm inside permanent steel. */
function sideScreen(P:TankBuilderPort,owner:'hull'|'turret',stock:readonly THREE.BufferGeometry[],
  side:number,x:number,z0:number,z1:number,bottom:number,top:number,style:number):void {
  const middle=(bottom+top)/2;
  for(const z of [z0,z1]){
    const from=new THREE.Vector3(side*x,middle,z),direction=new THREE.Vector3(-side,0,0);
    const {point:seat,normal}=armorSeat(stock,from,direction);
    part(P,owner,beamBetween(seat.toArray(),from.toArray(),.022,6),'side-mount');
    const shoe=box(.045,.12,.13).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),normal));
    shoe.userData.polishSupport={center:seat.toArray(),normal:normal.toArray()};
    part(P,owner,shoe.translate(seat.x,seat.y,seat.z),'mount-shoe');
    part(P,owner,box(.034,top-bottom+.034,.034).translate(side*x,middle,z),'screen-frame');
  }
  for(const y of [bottom,middle,top])
    part(P,owner,box(.031,.029,z1-z0+.034).translate(side*x,y,(z0+z1)/2),'screen-frame');
  const count=Math.ceil((z1-z0)/(style===2?.18:.16));
  for(let i=1;i<count;i++)part(P,owner,box(.018,top-bottom,.018).translate(side*x,middle,z0+i*(z1-z0)/count),'screen-slat');
  // The diagonal is a folded reinforcement strip, not a solid cage fill.
  if(style===1||style===3)part(P,owner,beamBetween([side*x,bottom,z0],[side*x,top,z1],.010,4),'screen-brace');
}

export function addPolishProtection(P:TankBuilderPort,model:number,turretStock:readonly THREE.BufferGeometry[]):void {
  const d=POLISH_PROTECTION_LAYOUTS[model];if(!d)throw new Error(`Unknown Polish protection model ${model}`);
  const hullStock:THREE.BufferGeometry[]=[];
  P.forEachBucketPart(['hullExternalArmor'],g=>{
    if(g.userData.eraHitFaceVertexStarts===undefined)hullStock.push(g);
  });
  for(const side of [-1,1]){
    for(const [z0,z1]of d.hullPanels)sideScreen(P,'hull',hullStock,side,d.hullX,z0,z1,d.hullBottom,d.hullTop,model);
    for(const [z0,z1]of d.turretPanels)sideScreen(P,'turret',turretStock,side,d.turretX,z0,z1,d.turretBottom,d.turretTop,model);
  }
  const y=(d.rearBottom+d.rearTop)/2;
  // Four longitudinal carrier arms reach the existing rear bridge at its
  // true face. They support both the lower and upper rear rails.
  for(const x of [-.43,.43])for(const sy of [d.rearBottom+.04,d.rearTop-.04]){
    const origin=new THREE.Vector3(x,d.rearSeatY,d.rearZ),direction=new THREE.Vector3(0,0,1);
    const {point:seat}=armorSeat(turretStock,origin,direction);
    part(P,'turret',beamBetween(seat.toArray(),[x,sy,d.rearZ],.021,6),'rear-mount');
  }
  for(const sy of [d.rearBottom,y,d.rearTop])
    part(P,'turret',box(d.rearHalf*2+.034,.031,.031).translate(0,sy,d.rearZ),'rear-frame');
  const posts=Math.ceil(d.rearHalf*2/.16);
  for(let i=0;i<=posts;i++)part(P,'turret',box(.019,d.rearTop-d.rearBottom,.024)
    .translate(-d.rearHalf+i*d.rearHalf*2/posts,y,d.rearZ),'rear-slat');
  // The return faces remain transparent, join the rear frame to its load
  // rails and visibly wrap the protected bustle instead of floating behind it.
  for(const side of [-1,1]){
    for(const sy of [d.rearBottom,d.rearTop])part(P,'turret',beamBetween(
      [side*d.rearHalf,sy,d.rearZ],[side*.43,d.rearSeatY,d.rearSeatZ],.018,6),'rear-return');
  }
  addVehicleGhillieSuit(P,NATIONAL_POLAND_GHILLIE_CONFIGS[d.id]);
}
