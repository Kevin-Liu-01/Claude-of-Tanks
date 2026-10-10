import * as THREE from 'three';
import {AERIAL_RULES} from '../sim/matchRuleset.ts';
import {droneLaunchHeight,droneFreeFlightBlend} from '../sim/droneLaunch.ts';
import { createDroneAttitude, updateDroneAttitude, droneWobblePitch, droneWobbleRoll, type DroneAttitude } from './droneMotion.ts';
import { createDroneModelKit, droneNation, poseDroneRotor } from './droneModel.ts';
/** Bounded pools; a quadcopter banks modestly under motion, never points its body vertically. */
export function createDronePresentation(parent: THREE.Group) {
  const variants=new Map<string,ReturnType<typeof buildPool>>();
  function buildPool(nation:string){
    const kit=createDroneModelKit(nation);
    const bodies=new THREE.InstancedMesh(kit.body,kit.bodyMaterial,42);
    const equipment=new THREE.InstancedMesh(kit.equipment,kit.equipmentMaterial,42);
    const lenses=new THREE.InstancedMesh(kit.lens,kit.lensMaterial,42);
    const rotors=new THREE.InstancedMesh(kit.rotor,kit.bodyMaterial,168);
    const pools=[bodies,equipment,lenses,rotors];
    for(const pool of pools){pool.count=0;pool.visible=false;pool.frustumCulled=false;parent.add(pool);}
    bodies.name='FPV '+kit.name+' airframes';rotors.name='FPV spinning propellers';
    return {bodies,equipment,lenses,rotors,pools,count:0};
  }
  const pose=new THREE.Object3D(),prop=new THREE.Object3D(),matrix=new THREE.Matrix4();
  pose.rotation.order='YXZ';let count=0,time=0,dt=1/60,frame=0;
  const attitudes=new Map<string|number,DroneAttitude>();
  const launchFrames=new Map<string|number,{orientation:THREE.Quaternion;offset:THREE.Vector3}>();
  const upAxis=new THREE.Vector3(0,1,0),lift=new THREE.Vector3();
  const dockOrientation=new THREE.Quaternion(),flightOrientation=new THREE.Quaternion();
  return {
    begin(timeS:number){count=0;dt=Math.min(.1,Math.max(0,timeS-time));time=timeS;frame++;for(const pool of variants.values())pool.count=0;},
    write(position:THREE.Vector3,velocity:THREE.Vector3,id:string|number,heading?:number,ageS=1,nation?:string,launchFrame?:THREE.Object3D){
      if(count>=42)return;
      const key=droneNation(nation);let pool=variants.get(key);if(!pool){pool=buildPool(key);variants.set(key,pool);}
      const {bodies,equipment,lenses,rotors}=pool,index=pool.count++;
      const horizontal=Math.hypot(velocity.x,velocity.z);
      let state=attitudes.get(id);if(!state){state=createDroneAttitude();attitudes.set(id,state);}
      const phase=typeof id==='number'?id*.71:id.length*.71;
      const yaw=heading ?? (horizontal>.05?Math.atan2(velocity.x,velocity.z):state.heading);
      updateDroneAttitude(state,velocity,yaw,time,dt,phase);state.seen=frame;
      state.rotorSpin+=dt*130*Math.min(1,ageS/.6);
      const launchS=AERIAL_RULES.drone.launchS;
      const free=droneFreeFlightBlend(ageS);
      pose.position.copy(position);pose.position.y+=state.bob*free;
      pose.rotation.set(state.pitch+droneWobblePitch(time,phase),state.yaw,state.roll+droneWobbleRoll(time,phase));
      if(free<1){
        let remembered=launchFrames.get(id);if(!remembered){remembered={orientation:new THREE.Quaternion(),offset:new THREE.Vector3()};launchFrames.set(id,remembered);}
        if(launchFrame&&ageS<launchS){
          launchFrame.getWorldQuaternion(dockOrientation);remembered.orientation.copy(dockOrientation);
          launchFrame.getWorldPosition(pose.position);lift.set(0,droneLaunchHeight(ageS),0).applyQuaternion(dockOrientation);pose.position.add(lift);
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
      bodies.setMatrixAt(index,pose.matrix);equipment.setMatrixAt(index,pose.matrix);lenses.setMatrixAt(index,pose.matrix);
      for(let n=0;n<4;n++){
        poseDroneRotor(prop,n,state.rotorSpin);matrix.multiplyMatrices(pose.matrix,prop.matrix);rotors.setMatrixAt(index*4+n,matrix);
      }
      count++;
    },
    end(){for(const v of variants.values()){v.bodies.count=v.equipment.count=v.lenses.count=v.count;v.rotors.count=v.count*4;for(const pool of v.pools){pool.visible=v.count>0;pool.instanceMatrix.needsUpdate=true;}}for(const [id,state] of attitudes)if(state.seen!==frame){attitudes.delete(id);launchFrames.delete(id);}},
    reset(){for(const v of variants.values())for(const pool of v.pools){pool.count=0;pool.visible=false;}attitudes.clear();launchFrames.clear();},
  };
}
