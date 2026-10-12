import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { missionAttachmentFor, missionCradleVolumes, DRONE_DOCK_HEIGHT_M, type MissionAttachment, type MissionCarrierSpec } from '../sim/missionAttachment.ts';
import { acquireDroneModelKit, droneMaterialHooks, droneNation, poseDroneRotor, DRONE_DOCK_PAINT, DRONE_LITE_DISTANCE_M, type DroneKitLease, type DroneModelKit } from '../fx/droneModel.ts';
import { createMissionCradleGeometry, createMissionHoldDownGeometry, missionHoldDownPivots, missionHoldDownMatrix } from './missionCradleGeometry.ts';
import { DRONE_ARRIVAL, droneArrivalAttitude, droneArrivalHeight, droneSpinDownAngle, droneSpinDownFadeStep, droneSpinDownPhase } from '../fx/droneArrival.ts';
import { createCaptureFlag, type CaptureFlag } from '../fx/captureFlag.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
interface MissionVisual {
  root: THREE.Group; drone: THREE.Group; kind: 'drone' | 'flag'; flag?: CaptureFlag; cradles: THREE.Mesh[];
  detail?: THREE.LOD; lease?: DroneKitLease; arrival?: Arrival; arriveT: number; ready: boolean | null;
  /** The airframe on the cradle flew home (it is the ready one at the cooldown's end). */
  returned: boolean;
  /** The quick-release skid clamps (one instance each) and how far they stand open (0 holding, 1 clear). */
  holdDowns?: THREE.InstancedMesh; holdPivots?: ReturnType<typeof missionHoldDownPivots>; hold: number; holdPosed: number;
  dispose(): void;
}
/**
 * An airframe lands on the cradle: a resupplied one on the empty cradle when the payload is ready again, or the one that
 * flew home (fx/dronePresentation.ts hands it over at the landing's first pose). The law is fx/droneArrival.ts. A
 * resupply starts on the not-ready to ready edge (a remote client sees only that flag); an airframe that came home sits
 * on the cradle through the rest of the cooldown and is the ready one, with no second landing. A launch in the middle
 * hands straight to the flight from the dock datum.
 */
interface Arrival { group: THREE.Group; rotors: THREE.Mesh[]; blurs: THREE.Mesh[]; kit: DroneModelKit }
function createArrival(kit: DroneModelKit): Arrival {
  const group = new THREE.Group(), rotors: THREE.Mesh[] = [], blurs: THREE.Mesh[] = [];
  group.name = 'Docked FPV arrival'; group.rotation.order = 'YXZ'; group.visible = false;
  for (const part of kit.parts) group.add(new THREE.Mesh(part.geometry, part.material));
  for (let i = 0; i < 4; i++) {
    // One disc per rotor: the full disc in the air, then the kit's fading discs in turn as the blades slow beneath.
    const rotor = new THREE.Mesh(kit.rotor, kit.rotorMaterial), blur = new THREE.Mesh(kit.rotorBlur, kit.blurMaterial);
    rotor.name = 'FPV arrival blades'; blur.name = 'FPV arrival disc';
    rotor.matrixAutoUpdate = blur.matrixAutoUpdate = false; blur.renderOrder = 2;
    rotors.push(rotor); blurs.push(blur); group.add(rotor, blur);
  }
  // Shade like the parked airframe it hands over to, so a dock in shadow never brightens for the landing.
  // Shadows follow the sun from every solid part; the translucent discs cast none.
  for (const mesh of group.children as THREE.Mesh[]) { mesh.receiveShadow = true; mesh.castShadow = !blurs.includes(mesh); }
  return { group, rotors, blurs, kit };
}
const attitude = { pitch: 0, yaw: 0, roll: 0 };
function poseArrival(arrival: Arrival, t: number): void {
  const { descentS, spoolS } = DRONE_ARRIVAL, group = arrival.group;
  if (t < descentS) {
    const u = t / descentS;
    group.position.set(0, droneArrivalHeight(u), 0);
    droneArrivalAttitude(u, attitude);
    group.rotation.set(attitude.pitch, attitude.yaw, attitude.roll);
    for (let i = 0; i < 4; i++) {
      const blur = arrival.blurs[i]!;
      arrival.rotors[i]!.visible = false; blur.visible = true; blur.geometry = arrival.kit.rotorBlur;
      poseDroneRotor(blur, i, t * 9 + i);
    }
    return;
  }
  // On the pads: the discs hold until the skids are down, fade as the blades show, and the blades slow to the parked
  // angle (droneArrival.ts: about a second and a half).
  const s = t - descentS, phase = droneSpinDownPhase(s);
  const spin = droneSpinDownAngle((s - DRONE_ARRIVAL.discS) / (spoolS - DRONE_ARRIVAL.discS));
  const steps = arrival.kit.rotorBlurSteps, disc = phase === 'discs' ? arrival.kit.rotorBlur : phase === 'blend' ? steps[droneSpinDownFadeStep(s, steps.length)]! : null;
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const blur = arrival.blurs[i]!, rotor = arrival.rotors[i]!;
    blur.visible = !!disc; rotor.visible = phase !== 'discs';
    if (disc) { blur.geometry = disc; poseDroneRotor(blur, i, t * 9 + i); }
    if (rotor.visible) poseDroneRotor(rotor, i, spin);
  }
}
/** The quick-release clamps share one head geometry across every dock. */
let holdDownShared:{geometry:THREE.BufferGeometry;users:number}|null=null;
function acquireHoldDown():{geometry:THREE.BufferGeometry;release():void} {
  if(!holdDownShared)holdDownShared={geometry:createMissionHoldDownGeometry(),users:0};
  const owned=holdDownShared;owned.users++;let released=false;
  return {geometry:owned.geometry,release(){if(released)return;released=true;if(--owned.users>0)return;if(holdDownShared===owned)holdDownShared=null;owned.geometry.dispose();}};
}
/** Seconds for a clamp arm to flip between holding the skid and standing clear (round 4b: long enough to read in
 * 0.1 s stills; a launch's clamps are clear before the 0.6 s lift). */
const HOLD_SWING_S = .45;
const holdMatrix = new THREE.Matrix4();
function poseHoldDowns(mount:MissionVisual):void {
  if(!mount.holdDowns||!mount.holdPivots||mount.holdPosed===mount.hold)return;
  mount.holdPivots.forEach((p,i)=>mount.holdDowns!.setMatrixAt(i,missionHoldDownMatrix(p,mount.hold,holdMatrix)));
  mount.holdDowns.instanceMatrix.needsUpdate=true;mount.holdPosed=mount.hold;
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
  for(const mesh of group.children as THREE.Mesh[]){mesh.receiveShadow=true;mesh.castShadow=true;}
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
  // The near dock casts with the sun (the distant stock does not: the shadow pass only pays for docks in view).
  near.castShadow=true;
  const cradle=new THREE.LOD();cradle.name='Mission dock cradle detail';cradle.addLevel(near,0);cradle.addLevel(far,DRONE_LITE_DISTANCE_M);
  root.add(cradle);
  // Quick-release skid clamps: their heads swing clear before a lift-off and close again after a landing's spin-down.
  let holdShared:{geometry:THREE.BufferGeometry;release():void}|undefined,holdDowns:THREE.InstancedMesh|undefined;
  if(kind==='drone'){
    holdShared=acquireHoldDown();
    holdDowns=new THREE.InstancedMesh(holdShared.geometry,materials.clean,4);
    holdDowns.name='Mission dock hold-down clamps';holdDowns.frustumCulled=false;holdDowns.castShadow=holdDowns.receiveShadow=true;
    near.add(holdDowns);
  }
  const leases:DroneKitLease[]=[];
  let mountDetail:THREE.LOD|undefined,mountLease:DroneKitLease|undefined;
  const flag=kind==='flag'?createCaptureFlag():undefined;
  if(flag){flag.root.position.y=.06;root.add(flag.root);}
  if(kind==='drone'){
    const full=acquireDroneModelKit(spec.nation),lite=acquireDroneModelKit(spec.nation,'lite');leases.push(full,lite);
    drone.name='Docked FPV mission payload';drone.userData.variant=full.kit.name;drone.position.set(seat.payloadOffset?.[0]??0,DRONE_DOCK_HEIGHT_M,seat.payloadOffset?.[1]??0);
    const detail=new THREE.LOD();detail.name='Docked FPV airframe detail';
    const parkedLite=parkedAirframe(lite);for(const mesh of parkedLite.children as THREE.Mesh[])mesh.castShadow=false;
    detail.addLevel(parkedAirframe(full),0);detail.addLevel(parkedLite,DRONE_LITE_DISTANCE_M);
    drone.add(detail);root.add(drone);
    mountDetail=detail;mountLease=full;
  }
  parent.add(root);
  let disposed=false;
  const result:MissionVisual={root,drone,kind,flag,cradles:holdDowns?[near,far,holdDowns]:[near,far],detail:mountDetail,lease:mountLease,arriveT:-1,ready:null,returned:false,
    holdDowns,holdPivots:holdDowns?missionHoldDownPivots(seat):undefined,hold:0,holdPosed:-1,
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();nearShared.release();farShared.release();holdDowns?.dispose();holdShared?.release();releaseCradleMaterials();for(const lease of leases)lease.release();flag?.dispose();mounts.delete(tankRoot);tankRoot.removeEventListener('removed',result.dispose);}};
  poseHoldDowns(result);
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
  const gone=destroyed||view.active;
  // The airframe flying home asks at the landing's first pose; the landing takes over and acknowledges, and the flying
  // copy stops drawing (dronePresentation) — one drawer every frame, no gap.
  let started=false;
  if(mount.drone.userData.returnRequest===true){
    mount.drone.userData.returnRequest=false;
    if(!gone&&mount.lease){mount.returned=true;mount.arriveT=0;started=true;mount.drone.userData.returnAck=true;}
  }
  if(gone)mount.returned=false;
  const ready=!gone&&view.cooldownS<=0,present=ready||mount.returned;
  mount.drone.visible=present;
  if(ready&&mount.ready===false){
    if(mount.returned)mount.returned=false;
    else if(mount.lease){mount.arriveT=0;started=true;}
  }
  if(!present)mount.arriveT=-1;
  else if(mount.arriveT>=0&&!started)mount.arriveT+=Math.max(0,dt);
  mount.ready=ready;
  const landing=mount.arriveT>=0&&mount.arriveT<DRONE_ARRIVAL.descentS+DRONE_ARRIVAL.spoolS;
  if(!landing)mount.arriveT=-1;
  if(landing&&!mount.arrival&&mount.lease){mount.arrival=createArrival(mount.lease.kit);mount.drone.add(mount.arrival.group);}
  if(mount.arrival){mount.arrival.group.visible=landing;if(landing)poseArrival(mount.arrival,mount.arriveT);}
  if(mount.detail)mount.detail.visible=!landing;
  // The clamps hold a parked airframe and stand clear for a lift-off, an empty cradle and a landing; with presentation
  // time they swing, without it (a still dock) they simply show where they belong.
  const clear=present&&!landing?0:1;
  mount.hold=dt>0?(clear>mount.hold?Math.min(clear,mount.hold+dt/HOLD_SWING_S):Math.max(clear,mount.hold-dt/HOLD_SWING_S)):clear;
  poseHoldDowns(mount);
}
/** Diagnostics and tests: how far a carrier's skid clamps stand open (0 holding, 1 clear), or null without a dock. */
export function missionHoldDownOpen(tankRoot:THREE.Object3D):number|null { return mounts.get(tankRoot)?.holdDowns ? mounts.get(tankRoot)!.hold : null; }

export function syncFlagAttachment(tankRoot:THREE.Object3D,spec:MissionCarrierSpec,timeS:number):void {
  let mount=mounts.get(tankRoot);
  if(mount?.kind==='drone'){mount.dispose();mount=undefined;}
  if(!mount){mount=createMount(tankRoot,spec,'flag');mounts.set(tankRoot,mount);}
  mount.root.visible=true;mount.flag?.update(timeS);
}
export function clearMissionAttachment(tankRoot:THREE.Object3D):void { mounts.get(tankRoot)?.dispose(); }

/** Shared live dock frame for the airborne handoff; no repeated scene search. */
export function missionAttachmentVisualFrame(tankRoot:THREE.Object3D):THREE.Object3D|undefined {return mounts.get(tankRoot)?.drone;}
