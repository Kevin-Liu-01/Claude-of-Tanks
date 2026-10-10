import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { missionAttachmentFor, missionCradleVolumes, DRONE_DOCK_HEIGHT_M, type MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { createDroneModelKit, poseDroneRotor } from '../fx/droneModel.ts';
import { createCaptureFlag, type CaptureFlag } from '../fx/captureFlag.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
interface MissionVisual { root: THREE.Group; drone: THREE.Group; kind: 'drone' | 'flag'; flag?: CaptureFlag; dispose(): void }
const mounts=new WeakMap<THREE.Object3D,MissionVisual>();
function createMount(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,kind:'drone'|'flag'='drone'):MissionVisual {
  const seat=missionAttachmentFor(spec),root=new THREE.Group(),drone=new THREE.Group();
  root.name='Reusable mission payload rail';root.userData.excludeModeEnergy=true;root.position.set(seat.x,seat.y,seat.z);
  const parent=seat.frame==='turret'?tankRoot.getObjectByName('rig_turret'):tankRoot;
  if(!parent)throw new Error('Turret mission attachment requires the turret rig');
  // Armor datums are metres, including legacy rigs with a compressed parent.
  root.position.divide(parent.scale);root.scale.set(1/parent.scale.x,1/parent.scale.y,1/parent.scale.z);
  const material=new THREE.MeshStandardMaterial({color:0x424b40,roughness:.72,metalness:.45});
  const parts:THREE.BufferGeometry[]=[];
  const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{
    parts.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  };
  // Shared finite stock guarantees that the audited cradle is what renders.
  for(const part of missionCradleVolumes(seat)){
    if(part.brace){
      const {start,end,thickness}=part.brace,a=new THREE.Vector3(...start),b=new THREE.Vector3(...end);
      const direction=b.clone().sub(a),rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      const middle=a.add(b).multiplyScalar(.5);
      parts.push(new THREE.BoxGeometry(thickness,direction.length(),thickness).applyQuaternion(rotation).translate(middle.x,middle.y,middle.z));
    }else{
      const {min,max}=part;box(max[0]!-min[0]!,max[1]!-min[1]!,max[2]!-min[2]!,
        (max[0]!+min[0]!)/2,(max[1]!+min[1]!)/2,(max[2]!+min[2]!)/2);
    }
  }
  const railGeometry=mergeGeometries(parts);for(const part of parts)part.dispose();
  root.add(new THREE.Mesh(railGeometry,material));
  const kit=kind==='drone'?createDroneModelKit(spec.nation):null;
  const flag=kind==='flag'?createCaptureFlag():undefined;
  if(flag){flag.root.position.y=.06;root.add(flag.root);}
  let propGeometry:THREE.BufferGeometry|undefined;
  if(kit){
    drone.name='Docked FPV mission payload';drone.userData.variant=kit.name;drone.position.set(seat.payloadOffset?.[0]??0,DRONE_DOCK_HEIGHT_M,seat.payloadOffset?.[1]??0);
    drone.add(new THREE.Mesh(kit.body,kit.bodyMaterial),new THREE.Mesh(kit.equipment,kit.equipmentMaterial),new THREE.Mesh(kit.lens,kit.lensMaterial));
    const propPose=new THREE.Object3D(),propParts:THREE.BufferGeometry[]=[];
    for(let i=0;i<4;i++){poseDroneRotor(propPose,i,0);propParts.push(kit.rotor.clone().applyMatrix4(propPose.matrix));}
    propGeometry=mergeGeometries(propParts)!;for(const part of propParts)part.dispose();
    drone.add(new THREE.Mesh(propGeometry,kit.bodyMaterial));
    root.add(drone);
  }
  parent.add(root);
  let disposed=false;
  const result={root,drone,kind,flag,dispose(){if(disposed)return;disposed=true;root.removeFromParent();railGeometry.dispose();propGeometry?.dispose();material.dispose();kit?.dispose();flag?.dispose();mounts.delete(tankRoot);tankRoot.removeEventListener('removed',result.dispose);}};
  tankRoot.addEventListener('removed',result.dispose);return result;
}
/** Mode equipment is attached to the turret owner (or fixed casemate hull), so suspension and concealment apply. */
export function syncMissionAttachment(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,view:Pick<AerialView,'kind'|'active'|'cooldownS'>|undefined,destroyed:boolean):void {
  let mount=mounts.get(tankRoot);
  if(view?.kind!=='drone'){if(mount)mount.root.visible=false;return;}
  if(mount?.kind==='flag'){mount.dispose();mount=undefined;}
  if(!mount){mount=createMount(tankRoot,spec);mounts.set(tankRoot,mount);}
  mount.root.visible=!destroyed;
  mount.drone.visible=!view.active&&view.cooldownS<=0;
}

export function syncFlagAttachment(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,timeS:number):void {
  let mount=mounts.get(tankRoot);
  if(mount?.kind==='drone'){mount.dispose();mount=undefined;}
  if(!mount){mount=createMount(tankRoot,spec,'flag');mounts.set(tankRoot,mount);}
  mount.root.visible=true;mount.flag?.update(timeS);
}
export function clearMissionAttachment(tankRoot:THREE.Object3D):void { mounts.get(tankRoot)?.dispose(); }

/** Shared live dock frame for the airborne handoff; no repeated scene search. */
export function missionAttachmentVisualFrame(tankRoot:THREE.Object3D):THREE.Object3D|undefined {return mounts.get(tankRoot)?.drone;}
