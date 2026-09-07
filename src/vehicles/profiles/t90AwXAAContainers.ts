// Source-measured AW roof containers: true local stock dimensions, not a
// second rotation of their world-space bounds. No reference topology.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const PIVOT=T90_AW_X_SOURCE_DATUMS.turretPivot;
type Course=readonly[number,number,number];
function part(P:TankBuilderPort,g:THREE.BufferGeometry,yaw=0):void{
  P.addEquipment('turretDetail',g.rotateY(yaw),-PIVOT[0],-PIVOT[1],-PIVOT[2]);
}
function stock(P:TankBuilderPort,x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,yaw=0):void{
  part(P,KIT.box(x1-x0,y1-y0,z1-z0).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),yaw);
}
function profiled(P:TankBuilderPort,x0:number,x1:number,rows:readonly Course[],yaw:number):void{
  part(P,sectionSolid(rows.map(([z,low,high])=>({z,ring:[[x0,low],[x1,low],[x1,high],[x0,high]] as const}))),yaw);
}
function narrowCanister(P:TankBuilderPort):void{
  const yaw=.78522,x0=-.68077,x1=-.55353;
  // Original bent upper edge: long bevel, short crown relief and forward
  // overhang. The full-height body ends before the source-open return.
  profiled(P,x0,x1,[[-.9089,2.52058,2.74078],[-.89,2.52061,2.84110],
    [-.885,2.52062,2.85119],[-.88,2.52063,2.85443],[-.8728,2.52064,2.85698],
    [-.5915,2.52108,2.85698]],yaw);
  profiled(P,x0,x1,[[-.592,2.79848,2.85698],[-.5852,2.79922,2.85698],
    [-.568,2.79880,2.85491],[-.555,2.79849,2.84325],[-.5493,2.82478,2.82498]],yaw);
  // Separate narrow side returns preserve the open central interval below
  // the overhang. Their unequal lengths are present in the source.
  stock(P,-.68077,-.67759,2.52108,2.82478,-.592,-.5493,yaw);
  stock(P,-.55998,-.55353,2.52108,2.68118,-.592,-.49104,yaw);
}
function thinSideCover(P:TankBuilderPort):void{
  const yaw=.78573;
  stock(P,-.53759,-.534757,2.57668,2.84038,-.97866,-.55213,yaw);
  stock(P,-.53759,-.534757,2.59428,2.82278,-1.04534,-.9782,yaw);
  // Shallow perimeter returns, not a filled .35m square box. The hidden
  // half-millimetre root overlap closes rounded source export tolerances.
  for(const [low,high] of [[2.59428,2.60798],[2.80908,2.82278]])
    stock(P,-.55395,-.5371,low,high,-.98785,-.56585,yaw);
  for(const [z0,z1] of [[-.98785,-.91502],[-.61238,-.56585]])
    stock(P,-.54083,-.5371,2.60798,2.80908,z0,z1,yaw);
}
function forwardCanister(P:TankBuilderPort):void{
  const yaw=-.41816;
  // Source principal side planes are 154mm apart and run at the opposite
  // yaw to the former placeholder. Both upper and lower courses crossfall.
  const shear=new THREE.Matrix4().set(1,0,0,0,-.01084,1,0,-.01084,0,0,1,0,0,0,0,1);
  part(P,KIT.box(.466,.2315,.154).translate(-.861,2.64713,.5665).applyMatrix4(shear),yaw);
  part(P,KIT.box(.4754,.04460,.1650).translate(-.8598,2.78508,.5666).applyMatrix4(shear),yaw);
  // Actual receiving channel under the forward canister intersects the
  // existing rear canister, rather than a new tall pedestal through roof air.
  const channel=KIT.box(.2587,.0054,.1685).translate(-.75635,2.52958,.56631);
  part(P,channel,yaw);
  part(P,beamBetween([-.8481,2.55,.1119],[-.682,2.55,.1564],.017));
  part(P,beamBetween([-.773,2.501,.000],[ -.742,2.666,.032],.009));
}
export function addT90AWAAContainers(P:TankBuilderPort):void{
  narrowCanister(P);thinSideCover(P);forwardCanister(P);
}
