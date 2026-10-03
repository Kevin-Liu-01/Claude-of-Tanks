import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { missionAttachmentFor, missionSurfaceAt, DRONE_DOCK_HEIGHT_M, type MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { createDroneModelKit, poseDroneRotor } from '../fx/droneModel.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
interface MissionVisual { root: THREE.Group; drone: THREE.Group; dispose(): void }
const mounts=new WeakMap<THREE.Object3D,MissionVisual>();
function createMount(tankRoot:THREE.Object3D,spec:MissionCarrierSpec):MissionVisual {
  const seat=missionAttachmentFor(spec),root=new THREE.Group(),drone=new THREE.Group();
  root.name='Reusable mission payload rail';root.position.set(seat.x,seat.y,seat.z);
  const parent=seat.frame==='turret'?tankRoot.getObjectByName('rig_turret'):tankRoot;
  if(!parent)throw new Error('Turret mission attachment requires the turret rig');
  // Armor datums are metres, including legacy rigs with a compressed parent.
  root.position.divide(parent.scale);root.scale.set(1/parent.scale.x,1/parent.scale.y,1/parent.scale.z);
  const material=new THREE.MeshStandardMaterial({color:0x424b40,roughness:.72,metalness:.45});
  const parts:THREE.BufferGeometry[]=[];
  const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{
    parts.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  };
  box(seat.width,.055,seat.depth,0,0,0);
  for(const x of [-seat.footX,seat.footX]) {
    box(.045,.055,.95,x,.055,0);
    for(const z of [-seat.footZ,seat.footZ]){
      const surface=missionSurfaceAt(spec,seat.x+x,seat.z+z);
      const foot=Math.max(.06,seat.y-surface);
      box(.1,foot,.13,x,-foot/2,z);
    }
  }
  const railGeometry=mergeGeometries(parts);for(const part of parts)part.dispose();
  root.add(new THREE.Mesh(railGeometry,material));
  const kit=createDroneModelKit(spec.nation);
  drone.name='Docked FPV mission payload';drone.userData.variant=kit.name;drone.position.y=DRONE_DOCK_HEIGHT_M;
  drone.add(new THREE.Mesh(kit.body,kit.bodyMaterial),new THREE.Mesh(kit.equipment,kit.equipmentMaterial),new THREE.Mesh(kit.lens,kit.lensMaterial));
  const propPose=new THREE.Object3D(),propParts:THREE.BufferGeometry[]=[];
  for(let i=0;i<4;i++){poseDroneRotor(propPose,i,0);propParts.push(kit.rotor.clone().applyMatrix4(propPose.matrix));}
  const propGeometry=mergeGeometries(propParts);for(const part of propParts)part.dispose();
  drone.add(new THREE.Mesh(propGeometry,kit.bodyMaterial));
  root.add(drone);parent.add(root);
  const result={root,drone,dispose(){root.removeFromParent();railGeometry.dispose();propGeometry.dispose();material.dispose();kit.dispose();mounts.delete(tankRoot);tankRoot.removeEventListener('removed',result.dispose);}};
  tankRoot.addEventListener('removed',result.dispose);return result;
}
/** Mode equipment is attached to the turret owner (or fixed casemate hull), so suspension and concealment apply. */
export function syncMissionAttachment(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,view:AerialView|undefined,destroyed:boolean):void {
  let mount=mounts.get(tankRoot);
  if(view?.kind!=='drone'){if(mount)mount.root.visible=false;return;}
  if(!mount){mount=createMount(tankRoot,spec);mounts.set(tankRoot,mount);}
  mount.root.visible=!destroyed;
  mount.drone.visible=!view.active&&view.cooldownS<=0;
}
