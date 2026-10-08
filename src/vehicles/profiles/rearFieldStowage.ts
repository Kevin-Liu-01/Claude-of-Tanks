// Hull-owned field stowage on measured stern brackets. The centre exhaust
// corridor and the full turret sweep stay above/between the racks.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Port=Pick<TankBuilderPort,'hullG'|'forEachBucketPart'|'addEquipment'> & {spec:{id:string}};
type Point=readonly[number,number,number];

function rearSeat(P:Port,x:number,y:number):THREE.Vector3{
 const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 const ray=new THREE.Raycaster(new THREE.Vector3(x,y,-12),new THREE.Vector3(0,0,1));
 let result:THREE.Intersection|undefined;
 P.forEachBucketPart(['hull'],g=>{const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();const h=ray.intersectObject(m)[0];if(h&&(!result||h.distance<result.distance))result=h;});
 mat.dispose();if(!result)throw new Error(`${P.spec.id}: rear stowage requires a stern receiver at ${x},${y}`);
 return result.point;
}
function can(P:Port,x:number,y:number,z:number):void{
 const {box,cylY}=KIT;
 P.addEquipment('hullFittingPaint',box(.29,.43,.21),x,y,z);
 for(const dy of[-.10,.10])P.addEquipment('hullFittingPaint',box(.254,.025,.019),x,y+dy,z-.113);
 P.addEquipment('hullDark',box(.035,.444,.228),x,y,z);
 for(const dx of[-.062,.062])P.addEquipment('hullFittingPaint',box(.024,.062,.034),x+dx,y+.238,z);
 P.addEquipment('hullFittingPaint',box(.147,.023,.034),x,y+.268,z);
 P.addEquipment('hullDark',cylY(.023,.029,.02,12),x+.105,y+.221,z);
}
export function addRearFieldStowage(P:Port,withDrums=false):void{
 const {box,cylX}=KIT;
 const anchors=[-.73,.73].map(x=>rearSeat(P,x,.96));
 // Existing Chinese drum pairs leave a narrow central utility-can bay.
 const drums=P.hullG.userData.chineseConceptFuelDrums;
 const z=drums?drums.centers[0][2]:Math.min(...anchors.map(p=>p.z))-.30;
 const canXs=withDrums?[0]:[-1.13,-.77,.77,1.13];
 const base=withDrums?.54:.69;
 const rod=(a:Point,b:Point,r=.025)=>P.addEquipment('hullDetail',beamBetween(a,b,r,10));
 for(const root of anchors){
  rod(root.clone().add(new THREE.Vector3(0,0,.028)).toArray(),[root.x,base,z]);
  rod([root.x,base,z],[root.x,.44,z]);
 }
 P.addEquipment('hullDetail',box(2.64,.038,.32),0,base,z);
 if(!withDrums)for(const x of[-1.3,1.3])rod([x,base,z-.14],[x,1.06,z-.14],.016);
 if(!withDrums)rod([-1.3,.79,z-.145],[1.3,.79,z-.145],.018);
 if(withDrums)P.addEquipment('hullDetail',box(.32,.17,.23),0,.625,z);
 for(const x of canXs)can(P,x,.923,z);
 // One closed wooden log: steel straps are rectangular tangential stock,
 // never duplicate circular caps layered onto the log ends.
 P.addEquipment('hullWood',cylX(.082,2.49,16),0,.465,z);
 for(const x of[-.79,.79]){
  P.addEquipment('hullDark',box(.040,.18,.025),x,.465,z-.077);
  rod([x,.40,z+.075],[x,base,z+.075],.018);
 }
 if(!withDrums)for(const side of[-1,1]){
  P.addEquipment('hullCloth',box(.39,.18,.24),side*.45,.79,z+.02);
  P.addEquipment('hullDark',box(.025,.194,.254),side*.45,.79,z+.02);
 }
 P.hullG.userData.rearFieldStowage={anchors:anchors.map(p=>p.toArray()),z,canXs,top:1.203,logY:.465};
}
