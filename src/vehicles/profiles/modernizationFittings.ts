// Reusable physical modernization fittings. All points are owner-local metres.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylY,cylX}=KIT;
type Point=readonly [number,number,number];

/** Open grille on two load-bearing brackets; never fills the cage's air. */
export function attachedCage(P:TankBuilderPort,owner:'hull'|'turret',
  center:Point,width:number,height:number,depth:number):void {
  const [x,y,z]=center,slot=`${owner}Detail`;
  for(const sx of [-1,1]){
    P.addEquipment(slot,beamBetween([x+sx*width*.36,y-height*.35,z+depth],
      [x+sx*width*.36,y-height*.35,z],.018));
    P.addEquipment(slot,box(.028,height,.028),x+sx*width/2,y,z);
  }
  for(const dy of [-height/2,height/2])P.addEquipment(slot,box(width,.028,.028),x,y+dy,z);
  const count=Math.ceil(width/.15);
  for(let i=1;i<count;i++)P.addEquipment(slot,box(.012,height,.014),x-width/2+i*width/count,y,z);
  for(const sx of [-1,1])for(const dy of [-height/2,height/2])
    P.addEquipment(slot,box(.028,.028,depth),x+sx*width/2,y+dy,z+depth/2);
}

/** Each cassette is separately bound to an existing gameplay ERA sector. */
export function eraCassette(P:TankBuilderPort,owner:'hull'|'turret',sector:string,
  center:Point,size:Point,rotation:Point=[0,0,0]):void {
  const [w,h,d]=size;
  // Side-skirt cassettes face outwards on X; glacis and cheek leaves use
  // their rotated upper face. The lid follows that same receiving surface.
  const side = w < h && w < d;
  const sign = center[0] < 0 ? -1 : 1;
  const normal: Point = side ? [sign,0,0] : [0,1,0];
  P.destructibleCluster(sector,()=>{
    P.addExternalArmor(owner,markEraHitFaces(box(w,h,d),normal),...center,...rotation);
    const lid=markEraFurniture(side ? box(.012,h*.94,d*.94) : box(w*.94,.012,d*.94));
    lid.translate(side ? sign*(w/2+.004) : 0,side ? 0 : h/2+.004,0);
    lid.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)));
    P.addExternalArmor(owner,lid,...center);
  });
}

export function supportedSensor(P:TankBuilderPort,center:Point,baseY:number):void {
  const [x,y,z]=center;
  P.addEquipment('turretDetail',cylY(.09,.115,y-baseY,16),x,(y+baseY)/2,z);
  P.addEquipment('turretDetail',box(.28,.19,.24),x,y+.07,z);
  P.addModuleVisual('optics','turretGlass',box(.17,.09,.012),x,y+.075,z+.126);
  P.addEquipment('turretDetail',box(.31,.023,.28),x,y+.176,z);
  for(const dx of [-.10,.10])P.addEquipment('turretDark',cylX(.018,.015,8),x+dx,y+.07,z);
}

export function strappedPack(P:TankBuilderPort,owner:'hull'|'turret',center:Point,size:Point):void {
  const [w,h,d]=size,[x,y,z]=center,slot=`${owner}Cloth`;
  P.addEquipment(slot,box(w,h,d),x,y,z);
  for(const dx of [-w*.3,w*.3])P.addEquipment(`${owner}Dark`,box(.023,h+.006,d+.012),x+dx,y,z);
}

/** Project a cassette onto its actual body shell and align its receiving face
 * with the hit normal. Geometry is measured in the owning rig's local frame. */
function surfaceEraCassette(P:TankBuilderPort,owner:'hull'|'turret',sector:string,
  origin:THREE.Vector3,direction:THREE.Vector3,size:Point):void {
  const ray=new THREE.Raycaster(origin,direction,0,8);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let nearest:THREE.Intersection|undefined;
  P.forEachBucketPart([owner],geometry=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(mesh)[0];
    if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
  });
  material.dispose();
  if(!nearest?.face)throw new Error(`${P.spec.id}: no ${owner} wall for ERA seat`);
  const normal=nearest.face.normal.clone();if(normal.dot(direction)>0)normal.negate();
  const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
  const p=nearest.point.clone().addScaledVector(normal,size[1]/2-.006);
  eraCassette(P,owner,sector,p.toArray(),size,[rotation.x,rotation.y,rotation.z]);
}

/** Seat a cheek cassette on the real casting, preserving the mantlet throat. */
export function cheekEraCassette(P:TankBuilderPort,sector:string,seed:Point,size:Point):void {
  const direction=new THREE.Vector3(seed[0],0,seed[2]).normalize();
  const origin=direction.clone().multiplyScalar(4);origin.y=seed[1];
  surfaceEraCassette(P,'turret',sector,origin,direction.negate(),size);
}

export function glacisEraCassette(P:TankBuilderPort,sector:string,x:number,z:number,size:Point):void {
  surfaceEraCassette(P,'hull',sector,new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),size);
}
