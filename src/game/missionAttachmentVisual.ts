import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { missionAttachmentFor, missionCradleVolumes, DRONE_DOCK_HEIGHT_M, type MissionAttachment, type MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { acquireDroneModelKit, droneMaterialHooks, droneNation, poseDroneRotor, DRONE_DOCK_PAINT, DRONE_LITE_DISTANCE_M, type DroneKitLease, type DroneModelKit } from '../fx/droneModel.ts';
import { createMissionCradleGeometry } from './missionCradleGeometry.ts';
import { createCaptureFlag, type CaptureFlag } from '../fx/captureFlag.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
interface MissionVisual {
  root: THREE.Group; drone: THREE.Group; kind: 'drone' | 'flag'; flag?: CaptureFlag; cradles: THREE.Mesh[];
  detail?: THREE.LOD; lease?: DroneKitLease; arrival?: Arrival; arriveT: number; ready: boolean | null; dispose(): void;
}
/**
 * A resupplied airframe lands on the empty cradle when the payload is ready again: it settles down the dock's certified
 * launch column (vertical, so it can never meet the carrier's own kit) from 2.4 m with its rotors at speed, brakes into a
 * short hover a hand's width above the pads, touches down on its skids, and spools its props down to the exact angle the
 * parked airframe holds them. Presentation only: it starts on the not-ready to ready edge (a remote client sees only that
 * flag), and a launch in the middle of it hands straight to the flight from the dock datum.
 */
export const DRONE_ARRIVAL = Object.freeze({ descentS: 1.5, spoolS: .7, heightM: 2.4, hoverM: .25 });
interface Arrival { group: THREE.Group; rotors: THREE.Mesh[]; blurs: THREE.Mesh[] }
function createArrival(kit: DroneModelKit): Arrival {
  const group = new THREE.Group(), rotors: THREE.Mesh[] = [], blurs: THREE.Mesh[] = [];
  group.name = 'Docked FPV arrival'; group.rotation.order = 'YXZ'; group.visible = false;
  for (const part of kit.parts) group.add(new THREE.Mesh(part.geometry, part.material));
  for (let i = 0; i < 4; i++) {
    const rotor = new THREE.Mesh(kit.rotor, kit.rotorMaterial), blur = new THREE.Mesh(kit.rotorBlur, kit.blurMaterial);
    rotor.matrixAutoUpdate = blur.matrixAutoUpdate = false; blur.renderOrder = 2;
    rotors.push(rotor); blurs.push(blur); group.add(rotor, blur);
  }
  // Shade like the parked airframe it hands over to, so a dock in shadow never brightens for the landing.
  for (const mesh of group.children as THREE.Mesh[]) mesh.receiveShadow = true;
  return { group, rotors, blurs };
}
/** Height above the pads at a descent fraction: down to a brief braking hover, then a smooth touchdown (C1 throughout). */
export function droneArrivalHeight(u: number): number {
  const { heightM, hoverM } = DRONE_ARRIVAL, x = Math.min(1, Math.max(0, u));
  if (x < .75) return hoverM + (heightM - hoverM) * (1 - x / .75) ** 2;
  const v = (x - .75) / .25;
  return hoverM * (1 - v * v * (3 - 2 * v));
}
// Three full turns of a three-blade prop end where the parked pose holds it.
const SPOOL_DOWN_RAD = 6 * Math.PI;
function poseArrival(arrival: Arrival, t: number): void {
  const { descentS, spoolS } = DRONE_ARRIVAL, group = arrival.group;
  if (t < descentS) {
    const u = t / descentS, settle = 1 - u;
    group.position.set(0, droneArrivalHeight(u), 0);
    // Yawing into the cradle's line and trimming small attitude errors as it comes down.
    group.rotation.set(.035 * Math.sin(u * 11) * settle, .32 * settle * settle, .045 * Math.sin(u * 8 + 1) * settle);
    for (let i = 0; i < 4; i++) {
      arrival.rotors[i]!.visible = false; arrival.blurs[i]!.visible = true; poseDroneRotor(arrival.blurs[i]!, i, t * 9 + i);
    }
    return;
  }
  const s = Math.min(1, (t - descentS) / spoolS), spin = SPOOL_DOWN_RAD * (1 - (1 - s) ** 3);
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    arrival.rotors[i]!.visible = true; arrival.blurs[i]!.visible = false; poseDroneRotor(arrival.rotors[i]!, i, spin);
  }
}
const mounts=new WeakMap<THREE.Object3D,MissionVisual>();

/** Refcounted build cache: one geometry per seat and paint, shared by every carrier that uses it. */
interface Shared<T> { value:T; users:number }
const cradleCache=new Map<MissionAttachment,Map<string,Shared<THREE.BufferGeometry>>>();
function acquireCradle(seat:MissionAttachment,key:string,build:()=>THREE.BufferGeometry):{geometry:THREE.BufferGeometry;release():void} {
  let bySeat=cradleCache.get(seat);if(!bySeat){bySeat=new Map();cradleCache.set(seat,bySeat);}
  let entry=bySeat.get(key);if(!entry){entry={value:build(),users:0};bySeat.set(key,entry);}
  entry.users++;const owned=entry,map=bySeat;let released=false;
  return {geometry:owned.value,release(){if(released)return;released=true;if(--owned.users>0)return;map.delete(key);if(!map.size)cradleCache.delete(seat);owned.value.dispose();}};
}
// Painted steel (welded tube, rubber pads and zinc hardware ride in vertex colours) and its burnt-out state.
let cradleMaterials:{clean:THREE.MeshStandardMaterial;charred:THREE.MeshStandardMaterial;users:number;release?(material:THREE.Material):unknown}|null=null;
function acquireCradleMaterials(){
  if(!cradleMaterials){
    const clean=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.66,metalness:.28});
    const charred=new THREE.MeshStandardMaterial({color:0x2c2724,vertexColors:true,roughness:.94,metalness:.06});
    clean.name='Mission dock painted steel';charred.name='Mission dock charred steel';
    const hooks=droneMaterialHooks();hooks.setup?.(clean);hooks.setup?.(charred);
    cradleMaterials={clean,charred,users:0,release:hooks.release};
  }
  cradleMaterials.users++;return cradleMaterials;
}
function releaseCradleMaterials():void {
  if(!cradleMaterials||--cradleMaterials.users>0)return;
  const {clean,charred,release}=cradleMaterials;cradleMaterials=null;
  release?.(clean);release?.(charred);clean.dispose();charred.dispose();
}
/** A distant tank's dock: the audited stock itself, one painted box per finite member. */
function farCradleGeometry(seat:MissionAttachment,paint:number):THREE.BufferGeometry {
  const color=new THREE.Color(paint),parts:THREE.BufferGeometry[]=[];
  for(const part of missionCradleVolumes(seat)){
    let geometry:THREE.BufferGeometry;
    if(part.brace){
      const {start,end,thickness}=part.brace,a=new THREE.Vector3(...start),b=new THREE.Vector3(...end);
      const direction=b.clone().sub(a),rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      const middle=a.add(b).multiplyScalar(.5);
      geometry=new THREE.BoxGeometry(thickness,direction.length(),thickness).applyQuaternion(rotation).translate(middle.x,middle.y,middle.z);
    }else{
      const {min,max}=part;
      geometry=new THREE.BoxGeometry(max[0]!-min[0]!,max[1]!-min[1]!,max[2]!-min[2]!).translate((max[0]!+min[0]!)/2,(max[1]!+min[1]!)/2,(max[2]!+min[2]!)/2);
    }
    const flat=geometry.toNonIndexed();geometry.dispose();flat.deleteAttribute('uv');
    const colors=new Float32Array(flat.getAttribute('position').count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
    flat.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(flat);
  }
  const merged=mergeGeometries(parts)!;for(const part of parts)part.dispose();return merged;
}
/** Parked propellers fold into the composite mesh; a mirrored (counter-rotating) prop keeps its outward winding. */
function parkedGeometry(kit:DroneModelKit):THREE.BufferGeometry {
  const propPose=new THREE.Object3D(),propParts:THREE.BufferGeometry[]=[kit.body.clone()];
  for(let i=0;i<4;i++){
    poseDroneRotor(propPose,i,0);
    const prop=kit.rotor.clone().applyMatrix4(propPose.matrix);
    if(propPose.matrix.determinant()<0)flipWinding(prop);
    propParts.push(prop);
  }
  const geometry=mergeGeometries(propParts)!;for(const part of propParts)part.dispose();return geometry;
}
function flipWinding(geometry:THREE.BufferGeometry):void {
  for(const attribute of Object.values(geometry.attributes) as THREE.BufferAttribute[]){
    const size=attribute.itemSize,array=attribute.array as Float32Array;
    for(let t=0;t<attribute.count;t+=3)for(let k=0;k<size;k++){
      const a=(t+1)*size+k,b=(t+2)*size+k,swap=array[a]!;array[a]=array[b]!;array[b]=swap;
    }
  }
}
function parkedAirframe(lease:DroneKitLease):THREE.Group {
  const kit=lease.kit,group=new THREE.Group(),parked=lease.shared('parked',parkedGeometry);
  group.add(new THREE.Mesh(parked,kit.bodyMaterial));
  for(const part of kit.parts.slice(1))group.add(new THREE.Mesh(part.geometry,part.material));
  for(const mesh of group.children as THREE.Mesh[])mesh.receiveShadow=true;
  return group;
}
function createMount(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,kind:'drone'|'flag'='drone'):MissionVisual {
  const seat=missionAttachmentFor(spec),root=new THREE.Group(),drone=new THREE.Group();
  root.name='Reusable mission payload rail';root.userData.excludeModeEnergy=true;root.position.set(seat.x,seat.y,seat.z);
  const parent=seat.frame==='turret'?tankRoot.getObjectByName('rig_turret'):tankRoot;
  if(!parent)throw new Error('Turret mission attachment requires the turret rig');
  // Armor datums are metres, including legacy rigs with a compressed parent.
  root.position.divide(parent.scale);root.scale.set(1/parent.scale.x,1/parent.scale.y,1/parent.scale.z);
  const paint=DRONE_DOCK_PAINT[droneNation(spec.nation)],materials=acquireCradleMaterials();
  // Shared finite stock guarantees that the audited cradle is what renders, near or far.
  const nearShared=acquireCradle(seat,`near:${paint}`,()=>createMissionCradleGeometry(seat,paint));
  const farShared=acquireCradle(seat,`far:${paint}`,()=>farCradleGeometry(seat,paint));
  const near=new THREE.Mesh(nearShared.geometry,materials.clean),far=new THREE.Mesh(farShared.geometry,materials.clean);
  near.name='Mission dock cradle';far.name='Mission dock cradle (far)';
  for(const mesh of [near,far])mesh.receiveShadow=true;
  const cradle=new THREE.LOD();cradle.name='Mission dock cradle detail';cradle.addLevel(near,0);cradle.addLevel(far,DRONE_LITE_DISTANCE_M);
  root.add(cradle);
  const leases:DroneKitLease[]=[];
  let mountDetail:THREE.LOD|undefined,mountLease:DroneKitLease|undefined;
  const flag=kind==='flag'?createCaptureFlag():undefined;
  if(flag){flag.root.position.y=.06;root.add(flag.root);}
  if(kind==='drone'){
    const full=acquireDroneModelKit(spec.nation),lite=acquireDroneModelKit(spec.nation,'lite');leases.push(full,lite);
    drone.name='Docked FPV mission payload';drone.userData.variant=full.kit.name;drone.position.set(seat.payloadOffset?.[0]??0,DRONE_DOCK_HEIGHT_M,seat.payloadOffset?.[1]??0);
    const detail=new THREE.LOD();detail.name='Docked FPV airframe detail';
    detail.addLevel(parkedAirframe(full),0);detail.addLevel(parkedAirframe(lite),DRONE_LITE_DISTANCE_M);
    drone.add(detail);root.add(drone);
    mountDetail=detail;mountLease=full;
  }
  parent.add(root);
  let disposed=false;
  const result:MissionVisual={root,drone,kind,flag,cradles:[near,far],detail:mountDetail,lease:mountLease,arriveT:-1,ready:null,dispose(){if(disposed)return;disposed=true;root.removeFromParent();nearShared.release();farShared.release();releaseCradleMaterials();for(const lease of leases)lease.release();flag?.dispose();mounts.delete(tankRoot);tankRoot.removeEventListener('removed',result.dispose);}};
  tankRoot.addEventListener('removed',result.dispose);return result;
}
/** Mode equipment is attached to the turret owner (or fixed casemate hull), so suspension and concealment apply.
 * A burnt-out carrier keeps its dock, charred with the hull; its payload went with the vehicle. `dt` (seconds of
 * presentation time) runs the resupply landing; without it the cradle simply shows the ready airframe. */
export function syncMissionAttachment(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,view:Pick<AerialView,'kind'|'active'|'cooldownS'>|undefined,destroyed:boolean,dt=0):void {
  let mount=mounts.get(tankRoot);
  if(view?.kind!=='drone'){if(mount)mount.root.visible=false;return;}
  if(mount?.kind==='flag'){mount.dispose();mount=undefined;}
  if(!mount){mount=createMount(tankRoot,spec);mounts.set(tankRoot,mount);}
  mount.root.visible=true;
  const material=destroyed?cradleMaterials?.charred:cradleMaterials?.clean;
  if(material)for(const cradle of mount.cradles)cradle.material=material;
  const ready=!destroyed&&!view.active&&view.cooldownS<=0;
  mount.drone.visible=ready;
  if(ready&&mount.ready===false&&mount.lease)mount.arriveT=0;
  else if(!ready)mount.arriveT=-1;
  else if(mount.arriveT>=0)mount.arriveT+=Math.max(0,dt);
  mount.ready=ready;
  const landing=mount.arriveT>=0&&mount.arriveT<DRONE_ARRIVAL.descentS+DRONE_ARRIVAL.spoolS;
  if(!landing)mount.arriveT=-1;
  if(landing&&!mount.arrival&&mount.lease){mount.arrival=createArrival(mount.lease.kit);mount.drone.add(mount.arrival.group);}
  if(mount.arrival){mount.arrival.group.visible=landing;if(landing)poseArrival(mount.arrival,mount.arriveT);}
  if(mount.detail)mount.detail.visible=!landing;
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
