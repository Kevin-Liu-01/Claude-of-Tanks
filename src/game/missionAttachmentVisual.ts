import * as THREE from 'three';
import { missionAttachmentFor, hullSurfaceAt, DRONE_DOCK_HEIGHT_M, type MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { createDroneModelKit, poseDroneRotor } from '../fx/droneModel.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
interface MissionVisual { root: THREE.Group; drone: THREE.Group; dispose(): void }
const mounts=new WeakMap<THREE.Object3D,MissionVisual>();
function createMount(tankRoot:THREE.Object3D,spec:MissionCarrierSpec):MissionVisual {
  const seat=missionAttachmentFor(spec),root=new THREE.Group(),drone=new THREE.Group();
  root.name='Reusable mission payload rail';root.position.set(seat.x,seat.y,seat.z);
  const material=new THREE.MeshStandardMaterial({color:0x424b40,roughness:.72,metalness:.45});
  const parts:THREE.Mesh[]=[];
  const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{
    const part=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);part.position.set(x,y,z);root.add(part);parts.push(part);
  };
  box(seat.width,.055,seat.depth,0,0,0);
  for(const x of [-.32,.32]) {
    box(.045,.055,.95,x,.055,0);
    for(const z of [-.4,.4]){
      const surface=hullSurfaceAt(spec,seat.x+x,seat.z+z);
      const foot=Math.max(.06,seat.y-surface);
      box(.1,foot,.13,x,-foot/2,z);
    }
  }
  const kit=createDroneModelKit();
  drone.name='Docked FPV mission payload';drone.position.y=DRONE_DOCK_HEIGHT_M;
  drone.add(new THREE.Mesh(kit.body,kit.bodyMaterial),new THREE.Mesh(kit.equipment,kit.equipmentMaterial),new THREE.Mesh(kit.lens,kit.lensMaterial));
  for(let i=0;i<4;i++){const prop=new THREE.Mesh(kit.rotor,kit.bodyMaterial);poseDroneRotor(prop,i,0);drone.add(prop);}
  root.add(drone);tankRoot.add(root);
  const result={root,drone,dispose(){root.removeFromParent();for(const part of parts)part.geometry.dispose();material.dispose();kit.dispose();mounts.delete(tankRoot);tankRoot.removeEventListener('removed',result.dispose);}};
  tankRoot.addEventListener('removed',result.dispose);return result;
}
/** Mode equipment is attached to the existing hull owner, so suspension and concealment apply. */
export function syncMissionAttachment(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,view:AerialView|undefined,destroyed:boolean):void {
  let mount=mounts.get(tankRoot);
  if(view?.kind!=='drone'){if(mount)mount.root.visible=false;return;}
  if(!mount){mount=createMount(tankRoot,spec);mounts.set(tankRoot,mount);}
  mount.root.visible=!destroyed;
  mount.drone.visible=!view.active&&view.cooldownS<=0;
}
