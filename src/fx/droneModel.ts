import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRONE_AIRFRAME_SCALE } from '../sim/missionAttachment.ts';

/** Fictional service variants, not claims about real national drone inventories. */
export const DRONE_DESIGNS = {
 USA:{name:'Kestrel',color:0xa29372,accent:0xced3bd,frame:'x'},
 Russia:{name:'Korshun',color:0x546144,accent:0xd9b16b,frame:'h'},
 USSR:{name:'Korshun',color:0x546144,accent:0xd9b16b,frame:'h'},
 Germany:{name:'Falke',color:0x555d50,accent:0xcdba8c,frame:'duct'},
 Britain:{name:'Merlin',color:0x5f694e,accent:0xd9c790,frame:'h'},
 France:{name:'Crecerelle',color:0x646c5c,accent:0x93afc4,frame:'x'},
 China:{name:'Feng',color:0x838e7c,accent:0xd7c3a4,frame:'duct'},
 Japan:{name:'Hayabusa',color:0xa1ac9b,accent:0xddded0,frame:'fold'},
 Sweden:{name:'Falk',color:0x4e6258,accent:0xb9c6ac,frame:'fold'},
 Israel:{name:'Nesher',color:0xa89a78,accent:0xd8c9a5,frame:'h'},
 Poland:{name:'Sokol',color:0x536553,accent:0xd7bcbc,frame:'x'},
 Italy:{name:'Nibbio',color:0x767451,accent:0xc4cba7,frame:'fold'},
 Korea:{name:'Mae',color:0x607467,accent:0xc6d7bd,frame:'duct'},
 Ukraine:{name:'Sokil',color:0x716d46,accent:0xc0b465,frame:'h'},
} as const;
export type DroneNation=keyof typeof DRONE_DESIGNS;
export function droneNation(nation?:string):DroneNation {
 if(nation==='USSR/Russia')return 'Russia';if(nation==='UK')return 'Britain';if(nation==='South Korea')return 'Korea';
 return nation && nation in DRONE_DESIGNS?nation as DroneNation:'USA';
}
function merge(parts:THREE.BufferGeometry[]):THREE.BufferGeometry {
 const result=mergeGeometries(parts);for(const part of parts)part.dispose();return result;
}
/** One merged mesh per material: carbon chassis, service fairing and optical glass.
 * Motor bells, guards, wiring, payload straps, camera gimbal and landing skids
 * share the exact airframe between its parked and airborne presentations. */
export function createDroneModelKit(nation?:string) {
 const design=DRONE_DESIGNS[droneNation(nation)];
 const parts:THREE.BufferGeometry[]=[],fairing:THREE.BufferGeometry[]=[],glass:THREE.BufferGeometry[]=[];
 const box=(a:THREE.BufferGeometry[],w:number,h:number,d:number,x:number,y:number,z:number)=>a.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
 const rod=(a:THREE.BufferGeometry[],r:number,start:THREE.Vector3,end:THREE.Vector3)=>{
  const g=new THREE.CylinderGeometry(r,r,start.distanceTo(end),6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize()));
  g.translate((start.x+end.x)/2,(start.y+end.y)/2,(start.z+end.z)/2);a.push(g);
 };
 // Twin carbon plates enclose the controller; chamfered shoulders, vents and
 // fasteners make a compact airframe rather than a box carried by four rods.
 const spine=new THREE.CylinderGeometry(.19,.23,.07,8).rotateY(Math.PI/8).scale(1,1,1.35).translate(0,.025,0);parts.push(spine);
 box(parts,.28,.025,.4,0,.16,0);
 box(fairing,.25,.09,design.frame==='h'?.55:.4,0,.12,-.05);
 for(const x of [-.12,.12])for(const z of [-.17,.17])parts.push(new THREE.CylinderGeometry(.013,.013,.15,6).translate(x,.095,z));
 const addMotor=(x:number,z:number):void=>{
  const attachZ=design.frame==='h'?z:Math.sign(z)*.08;
  rod(parts,.026,new THREE.Vector3(Math.sign(x)*.12,.035,attachZ),new THREE.Vector3(x,.035,z));
  rod(fairing,.008,new THREE.Vector3(Math.sign(x)*.13,.067,Math.sign(z)*.08),new THREE.Vector3(x,.067,z));
  parts.push(new THREE.CylinderGeometry(.065,.069,.13,12).translate(x,.06,z));
  fairing.push(new THREE.CylinderGeometry(.054,.054,.02,12).translate(x,.128,z));
  for(let i=0;i<6;i++){const angle=i*Math.PI/3;box(parts,.009,.045,.012,x+Math.cos(angle)*.057,.076,z+Math.sin(angle)*.057);}
  // Motor pods stay above the landing skids; no four long hanging legs.
  parts.push(new THREE.CylinderGeometry(.04,.055,.035,10).translate(x,-.012,z));
  if(design.frame==='duct'){
   parts.push(new THREE.TorusGeometry(.295,.018,5,24).rotateX(Math.PI/2).translate(x,.125,z));
   for(let n=0;n<3;n++){const angle=n*Math.PI*2/3;rod(parts,.009,new THREE.Vector3(x+Math.cos(angle)*.05,.11,z+Math.sin(angle)*.05),new THREE.Vector3(x+Math.cos(angle)*.295,.11,z+Math.sin(angle)*.295));}
  }
  else if(design.frame==='fold')parts.push(new THREE.CylinderGeometry(.052,.052,.055,10).translate(x*.5,.04,z*.5));
  box(fairing,.07,.02,.035,x,.13,z+.07);
 }
 for(const x of [-.48,.48])for(const z of [-.48,.48])addMotor(x,z);
 if(design.frame==='h')for(const x of [-.14,.14])box(parts,.045,.045,1.05,x,.035,0);
 const addLandingGear=():void=>{for(const x of [-.24,.24]){
  rod(parts,.018,new THREE.Vector3(x,-.2,-.27),new THREE.Vector3(x,-.2,.31));
  for(const z of [-.2,.2])rod(parts,.014,new THREE.Vector3(x,-.2,z),new THREE.Vector3(x*.5,.02,z));
 }
 };addLandingGear();
 // Segmented battery jacket, retaining straps and underslung impact payload.
 box(fairing,.2,.075,.28,0,.2075,-.04);
 for(const z of [-.12,.07]){box(parts,.218,.012,.032,0,.25,z);for(const x of[-.106,.106])box(parts,.012,.079,.032,x,.21,z);}
 fairing.push(new THREE.CapsuleGeometry(.067,.3,4,10).rotateX(Math.PI/2).translate(0,-.105,.015));
 for(const z of [-.1,.14])parts.push(new THREE.TorusGeometry(.072,.008,5,10).translate(0,-.105,z));
 box(parts,.16,.14,.035,0,.005,.28);
 fairing.push(new THREE.SphereGeometry(.072,12,8).translate(0,.01,.32));
 glass.push(new THREE.CylinderGeometry(.046,.046,.02,16).rotateX(Math.PI/2).translate(0,.01,.383));
 glass.push(new THREE.CylinderGeometry(.017,.017,.022,10).rotateX(Math.PI/2).translate(.1,.055,.292));
 for(const x of [-.075,.075]){
  rod(parts,.008,new THREE.Vector3(x,.19,-.21),new THREE.Vector3(x*1.9,.34,-.3));
  fairing.push(new THREE.SphereGeometry(.019,6,4).translate(x*1.9,.34,-.3));
 }
 for(let i=0;i<5;i++)box(parts,.12,.005,.009,0,.177,-.14+i*.042);
 // Exposed controller fins, recessed plugs and four plate bolts.
 for(const [x,z]of [[-.125,-.16],[-.125,.16],[.125,-.16],[.125,.16]])parts.push(new THREE.CylinderGeometry(.014,.014,.014,6).translate(x,.18,z));
 for(const x of [-.075,.075])box(fairing,.045,.034,.018,x,.10,-.282);
 const body=merge(parts),equipment=merge(fairing),lens=merge(glass);
 for(const geometry of [body,equipment,lens])geometry.scale(DRONE_AIRFRAME_SCALE,DRONE_AIRFRAME_SCALE,DRONE_AIRFRAME_SCALE);
 const bladeParts:THREE.BufferGeometry[]=[new THREE.CylinderGeometry(.02,.02,.026,8)];
 for(let n=0;n<3;n++)bladeParts.push(new THREE.BoxGeometry(.26,.012,.037).translate(.13,0,0).rotateY(n*Math.PI*2/3));
 const rotor=merge(bladeParts).scale(DRONE_AIRFRAME_SCALE,DRONE_AIRFRAME_SCALE,DRONE_AIRFRAME_SCALE);
 const bodyMaterial=new THREE.MeshStandardMaterial({color:0x252d30,roughness:.48,metalness:.6});
 const equipmentMaterial=new THREE.MeshStandardMaterial({color:design.color,roughness:.62,metalness:.3});
 const lensMaterial=new THREE.MeshStandardMaterial({color:0x6da5b8,emissive:0x11303c,roughness:.12,metalness:.7});
 return {body,equipment,lens,rotor,bodyMaterial,equipmentMaterial,lensMaterial,name:design.name,
 dispose(){body.dispose();equipment.dispose();lens.dispose();rotor.dispose();bodyMaterial.dispose();equipmentMaterial.dispose();lensMaterial.dispose();}};
}
export function poseDroneRotor(prop:THREE.Object3D,index:number,spin:number):void {
 prop.position.set(index<2?-.48:.48,.14,index%2?.48:-.48).multiplyScalar(DRONE_AIRFRAME_SCALE);
 prop.rotation.y=spin*(index%2?1:-1)+index*.8;prop.updateMatrix();
}
