import * as THREE from 'three';
import {AERIAL_RULES} from '../sim/matchRuleset.ts';
import {droneLaunchHeight,droneFreeFlightBlend,DRONE_SPOOL_S} from '../sim/droneLaunch.ts';
import { createDroneAttitude, updateDroneAttitude, droneWobblePitch, droneWobbleRoll, type DroneAttitude } from './droneMotion.ts';
import { acquireDroneModelKit, droneNation, poseDroneRotor, DRONE_LITE_DISTANCE_M, type DroneKitLease } from './droneModel.ts';

const CAPACITY = 42;
/**
 * The pilot's lens rides inside its own airframe, so that one drone is skipped near the camera while the pilot's aerial
 * camera follows it (2 m covers the one fixed step the camera's view lags the airframe). Every other camera (a film, the
 * killcam, spectators, a teammate beside the carrier) draws every drone, however close (2026-10-10: a film camera 1.99 m
 * from the dock lost the airframe for a frame as it passed camera height).
 */
export function droneHiddenFromCamera(position:THREE.Vector3,shooterId:string|number|null|undefined,flightActive:boolean,camera:THREE.Camera):boolean {
  return flightActive&&shooterId!=null&&camera.userData.aerialPilotId===shooterId&&position.distanceToSquared(camera.position)<=4;
}
/** The blades read individually only while they spool; at speed each rotor is a translucent disc. */
const BLUR_AFTER_SPOOL = .62;

interface DetailPool {
 lease:DroneKitLease;
 parts:THREE.InstancedMesh[];
 rotors:THREE.InstancedMesh;
 blurs:THREE.InstancedMesh;
 meshes:THREE.InstancedMesh[];
 count:number; bladeCount:number; blurCount:number;
}
/** Bounded pools; a quadcopter banks modestly under motion, never points its body vertically. Airframe builds are the
 * shared per-nation kits (lit-material registration rides with them). */
export function createDronePresentation(parent: THREE.Group) {
  const variants=new Map<string,{full:DetailPool;lite:DetailPool|null;nation:string}>();
  function buildDetail(nation:string,detail:'full'|'lite'):DetailPool {
    const lease=acquireDroneModelKit(nation,detail),kit=lease.kit;
    const parts=kit.parts.map(part=>new THREE.InstancedMesh(part.geometry,part.material,CAPACITY));
    const rotors=new THREE.InstancedMesh(kit.rotor,kit.rotorMaterial,CAPACITY*4);
    const blurs=new THREE.InstancedMesh(kit.rotorBlur,kit.blurMaterial,CAPACITY*4);
    blurs.renderOrder=2;
    const meshes=[...parts,rotors,blurs];
    // Shaded like the docked airframe (one program per material), so a launch from a shaded dock never brightens.
    for(const mesh of meshes){mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.receiveShadow=true;parent.add(mesh);}
    parts[0]!.name=`FPV ${kit.name} airframes${detail==='lite'?' (lite)':''}`;rotors.name='FPV spinning propellers';blurs.name='FPV rotor discs';
    return {lease,parts,rotors,blurs,meshes,count:0,bladeCount:0,blurCount:0};
  }
  function variant(nation:string){
    const key=droneNation(nation);let entry=variants.get(key);
    if(!entry){entry={full:buildDetail(key,'full'),lite:null,nation:key};variants.set(key,entry);}
    return entry;
  }
  const pose=new THREE.Object3D(),prop=new THREE.Object3D(),matrix=new THREE.Matrix4();
  pose.rotation.order='YXZ';let count=0,time=0,dt=1/60,frame=0;
  const camera=new THREE.Vector3();let hasCamera=false;
  const attitudes=new Map<string|number,DroneAttitude>();
  const launchFrames=new Map<string|number,{orientation:THREE.Quaternion;offset:THREE.Vector3}>();
  const upAxis=new THREE.Vector3(0,1,0),lift=new THREE.Vector3(),dockUp=new THREE.Vector3();
  const dockOrientation=new THREE.Quaternion(),flightOrientation=new THREE.Quaternion();
  return {
    begin(timeS:number,cameraPosition?:THREE.Vector3){
      count=0;dt=Math.min(.1,Math.max(0,timeS-time));time=timeS;frame++;
      hasCamera=!!cameraPosition;if(cameraPosition)camera.copy(cameraPosition);
      for(const v of variants.values())for(const pool of [v.full,v.lite])if(pool){pool.count=0;pool.bladeCount=0;pool.blurCount=0;}
    },
    write(position:THREE.Vector3,velocity:THREE.Vector3,id:string|number,heading?:number,ageS=1,nation?:string,launchFrame?:THREE.Object3D){
      if(count>=CAPACITY)return;
      const entry=variant(nation??'USA');
      const far=hasCamera&&position.distanceToSquared(camera)>DRONE_LITE_DISTANCE_M*DRONE_LITE_DISTANCE_M;
      if(far&&!entry.lite)entry.lite=buildDetail(entry.nation,'lite');
      const pool=far?entry.lite!:entry.full,index=pool.count++;
      const horizontal=Math.hypot(velocity.x,velocity.z);
      let state=attitudes.get(id);if(!state){state=createDroneAttitude();attitudes.set(id,state);}
      const phase=typeof id==='number'?id*.71:id.length*.71;
      const yaw=heading ?? (horizontal>.05?Math.atan2(velocity.x,velocity.z):state.heading);
      updateDroneAttitude(state,velocity,yaw,time,dt,phase);state.seen=frame;
      // Motors spool from rest on the cradle: the blades accelerate visibly, then blur into discs.
      const spool=Math.min(1,ageS/BLUR_AFTER_SPOOL);
      state.rotorSpin+=dt*(6+44*spool*spool);
      const launchS=AERIAL_RULES.drone.launchS;
      const free=droneFreeFlightBlend(ageS);
      pose.position.copy(position);pose.position.y+=state.bob*free;
      pose.rotation.set(state.pitch+droneWobblePitch(time,phase)*free,state.yaw,state.roll+droneWobbleRoll(time,phase)*free);
      if(free<1){
        let remembered=launchFrames.get(id);if(!remembered){remembered={orientation:new THREE.Quaternion(),offset:new THREE.Vector3()};launchFrames.set(id,remembered);}
        if(launchFrame&&ageS<launchS){
          launchFrame.getWorldQuaternion(dockOrientation);remembered.orientation.copy(dockOrientation);
          launchFrame.getWorldPosition(pose.position);
          // Never draw the climb above where the authority stopped it (a deck or bough over the dock).
          dockUp.set(0,1,0).applyQuaternion(dockOrientation);
          const authorityLift=lift.copy(position).sub(pose.position).dot(dockUp);
          lift.set(0,Math.min(droneLaunchHeight(ageS),Math.max(0,authorityLift)+.05),0).applyQuaternion(dockOrientation);pose.position.add(lift);
          remembered.offset.copy(pose.position).sub(position);
        }
        else if(ageS<launchS)remembered.orientation.setFromAxisAngle(upAxis,yaw);
        // Render interpolation can put the live carrier slightly behind the
        // fixed-step authority. Fade that presentation-only offset after the
        // aircraft is clear instead of snapping at the end of spool-up.
        else pose.position.addScaledVector(remembered.offset,1-free);
        flightOrientation.copy(pose.quaternion);pose.quaternion.copy(remembered.orientation).slerp(flightOrientation,free);
      }
      pose.updateMatrix();
      for(const part of pool.parts)part.setMatrixAt(index,pose.matrix);
      const blur=spool>=1&&ageS>=Math.max(BLUR_AFTER_SPOOL,DRONE_SPOOL_S*.9);
      const target=blur?pool.blurs:pool.rotors,base=blur?pool.blurCount:pool.bladeCount;
      for(let n=0;n<4;n++){
        // A disc turns slowly so its faint blade passages shimmer; spooling blades show their real direction.
        poseDroneRotor(prop,n,blur?time*9+n:state.rotorSpin);matrix.multiplyMatrices(pose.matrix,prop.matrix);target.setMatrixAt(base+n,matrix);
      }
      if(blur)pool.blurCount+=4;else pool.bladeCount+=4;
      count++;
    },
    end(){
      for(const v of variants.values())for(const pool of [v.full,v.lite]){
        if(!pool)continue;
        for(const part of pool.parts)part.count=pool.count;
        pool.rotors.count=pool.bladeCount;pool.blurs.count=pool.blurCount;
        for(const mesh of pool.meshes){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;}
      }
      for(const [id,state] of attitudes)if(state.seen!==frame){attitudes.delete(id);launchFrames.delete(id);}
    },
    reset(){for(const v of variants.values())for(const pool of [v.full,v.lite])if(pool)for(const mesh of pool.meshes){mesh.count=0;mesh.visible=false;}attitudes.clear();launchFrames.clear();},
    dispose(){
      for(const v of variants.values())for(const pool of [v.full,v.lite]){
        if(!pool)continue;
        for(const mesh of pool.meshes){mesh.removeFromParent();mesh.dispose();}
        pool.lease.release();
      }
      variants.clear();attitudes.clear();launchFrames.clear();
    },
  };
}
