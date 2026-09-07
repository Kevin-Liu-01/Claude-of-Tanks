// Original folded sheet/cassette construction from source scalar planes and
// overall part dimensions. No source vertices, indices or materials are used.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import {T90MS_X_SOURCE_DATUMS} from '../t90msXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const PIVOT=T90MS_X_SOURCE_DATUMS.turretPivot;
function add(P:TankBuilderPort,g:THREE.BufferGeometry,x=0,y=0,z=0):void {
  P.addEquipment('turretDetail',g,x-PIVOT[0],y-PIVOT[1],z-PIVOT[2]);
}
function cassette(P:TankBuilderPort,x:number,y:number,z:number,w:number,h:number,d:number,yaw:number):void {
  const side=Math.sign(x),bottom=-h/2,roof=h/2;
  // The near-vertical impact face ends below the chamfered upper return.
  const ring:readonly(readonly[number,number])[]=[[-w/2,bottom],
    [w/2,bottom+.002],[w/2-.005,roof-.061],[-w/2,roof]];
  const contour=ring.map(([u,v])=>[side*u,v] as const);
  if(side<0)contour.reverse();
  const shape=sectionSolid([-d/2,d/2].map(z=>({z,ring:contour})));
  markEraHitFaces(shape,[side,0,0]);shape.rotateY(yaw);
  P.destructibleCluster(`side_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('turret',shape,x-PIVOT[0],y-PIVOT[1],z-PIVOT[2]));
  // The permanent 9 mm backing and narrow mounting arms remain when ERA
  // is spent; the volume between the backing and casting is not filled.
  const normal=new THREE.Vector3(side,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const seat=new THREE.Vector3(x,y,z).addScaledVector(normal,-w/2-.002);
  add(P,KIT.box(.009,h-.014,d-.032).rotateY(yaw),seat.x,seat.y,seat.z);
  for(const dz of [-d*.31,d*.31]) {
    const end=new THREE.Vector3(0,-.10,dz).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(seat);
    add(P,beamBetween([end.x*.77,1.67,end.z],[end.x,end.y,end.z],.017));
  }
}
type Row=readonly[number,number,number];
function foldedForeCarrier(P:TankBuilderPort,side:number):void {
  const left=side<0;
  const rows:readonly Row[]=left?[[-.681,1.677,2.056],[-.44,1.729,2.013],[-.30,1.740,1.917],
    [0,1.767,1.940],[.31,1.797,1.978],[.654,1.814,1.821]]:
    [[-.040,1.721,2.005],[.19,1.741,1.965],[.41,1.760,1.962],[.65,1.799,1.850],[.696,1.807,1.818]];
  // Canonical plane equations converted from independent source face
  // measurements, with different port/starboard rake rather than mirroring.
  const outer=(y:number,z:number)=>left?-(1.61569+.31105*z-.01713*(y-1.89)):
    1.61197+.23929*z-.01997*(y-1.89);
  add(P,sectionSolid(rows.map(([z,low,high])=>({z,ring:(side>0?[
    [outer(low,z)-side*.014,low],[outer(low,z),low],
    [outer(high,z),high],[outer(high,z)-side*.014,high],
  ]:[
    [outer(low,z),low],[outer(low,z)-side*.014,low],
    [outer(high,z)-side*.014,high],[outer(high,z),high],
  ]) as Array<readonly[number,number]>}))));
  // A folded lower flange spans back into the casting. This is a thin
  // bearing sheet, not the former 40 cm solid placeholder box.
  add(P,sectionSolid(rows.map(([z,low])=>{
    const inner=side*(1.035+Math.max(0,z+.3)*.20),edge=outer(low,z);
    const ring:Array<readonly[number,number]>=[[inner,1.64],[edge,low],[edge,low+.012],[inner,1.652]];
    if(side<0)ring.reverse();
    return{z,ring};
  })));
}
function rearLeftCase(P:TankBuilderPort):void {
  const yaw=-.174922;
  add(P,KIT.box(.37229,.43390,.84234).rotateY(yaw),-.91915,1.87044,-1.89996);
  add(P,KIT.box(.38587,.0249,.88609).rotateY(yaw),-.90058,2.09794,-1.89701);
  // Two small real lid straps, not a continuous solid bustle extension.
  for(const x of [-.97240,-.82250])add(P,KIT.box(.073,.006,.661).rotateY(yaw),x,2.11309,-1.911);
  for(const z of [-2.15,-1.64])add(P,beamBetween([-.66,1.73,z],[-.98,1.69,z],.021));
  // The short folded junction ahead of the case is separate from the
  // adjacent ERA cassette. Its outer skin is only eight millimetres thick.
  add(P,sectionSolid([[-1.51281,1.847,2.0035],[-1.38781,1.847,2.0035]].map(([z,low,high])=>{
    const outer=(y:number)=>-1.182693-.31187*(z+1.4)+.033075*(y-1.89);
    return{z,ring:[[outer(low),low],[outer(low)+.008,low],
      [outer(high)+.008,high],[outer(high),high]] as Array<readonly[number,number]>};
  })));
  add(P,KIT.box(.265,.008,.160).rotateY(-.30),-1.001,2.0615,-1.423);
}
function sideBearingRoofs(P:TankBuilderPort):void {
  // Two distinct source8mm folded bearing sheets above the side cassettes.
  // The asymmetric lengths leave the fore smoke-carrier air open. Their
  // dimensions and shallow crossfall come from source plane sections;
  // these are thin permanent roofs, not filled boxes behind spent ERA.
  for(const row of [
    [1.0242,-1.09601,.3049,1.0195,.30275,2.0630,-.007],
    [-1.0886,-.94901,.2821,.7690,-.29985,2.0632,.008],
  ]) {
    const [x,z,w,d,yaw,y,roll]=row;
    add(P,KIT.box(w,.008,d).rotateZ(roll).rotateY(yaw),x,y-.004,z);
  }
}
export function addT90MSSideAssembly(P:TankBuilderPort):void {
  cassette(P,1.44818,1.89597,-.38536,.09272,.343,.74393,.302750);
  cassette(P,1.19051,1.89677,-1.21026,.09293,.34590,.99106,.302697);
  cassette(P,-1.25573,1.89343,-1.02083,.09202,.34570,.74246,-.299854);
  foldedForeCarrier(P,-1);foldedForeCarrier(P,1);rearLeftCase(P);sideBearingRoofs(P);
  // Independently measured existing long roof fitting remains unchanged.
  add(P,KIT.box(.4214,.12,1.7153).rotateY(.02),-1.01095,2.09624,-.28696);
}
