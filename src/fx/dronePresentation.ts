import * as THREE from 'three';
import { createDroneAttitude, updateDroneAttitude, droneWobblePitch, droneWobbleRoll, type DroneAttitude } from './droneMotion.ts';
import { createDroneModelKit, poseDroneRotor } from './droneModel.ts';
/** Bounded pools; a quadcopter banks modestly under motion, never points its body vertically. */
export function createDronePresentation(parent: THREE.Group) {
  const kit=createDroneModelKit();
  const bodies=new THREE.InstancedMesh(kit.body,kit.bodyMaterial,42);
  const equipment=new THREE.InstancedMesh(kit.equipment,kit.equipmentMaterial,42);
  const lenses=new THREE.InstancedMesh(kit.lens,kit.lensMaterial,42);
  const rotors=new THREE.InstancedMesh(kit.rotor,kit.bodyMaterial,168);
  const pools=[bodies,equipment,lenses,rotors];
  for(const pool of pools){pool.count=0;pool.frustumCulled=false;parent.add(pool);}
  bodies.name='FPV drone airframes';rotors.name='FPV spinning propellers';
  const pose=new THREE.Object3D(),prop=new THREE.Object3D(),matrix=new THREE.Matrix4();
  pose.rotation.order='YXZ';let count=0,time=0,dt=1/60,frame=0;
  const attitudes=new Map<string|number,DroneAttitude>();
  return {
    begin(timeS:number){count=0;dt=Math.min(.1,Math.max(0,timeS-time));time=timeS;frame++;},
    write(position:THREE.Vector3,velocity:THREE.Vector3,id:string|number,heading?:number,ageS=1){
      if(count>=42)return;
      const horizontal=Math.hypot(velocity.x,velocity.z);
      let state=attitudes.get(id);if(!state){state=createDroneAttitude();attitudes.set(id,state);}
      const phase=typeof id==='number'?id*.71:id.length*.71;
      const yaw=heading ?? (horizontal>.05?Math.atan2(velocity.x,velocity.z):state.heading);
      updateDroneAttitude(state,velocity,yaw,time,dt,phase);state.seen=frame;
      state.rotorSpin+=dt*130*Math.min(1,ageS/.6);
      pose.position.copy(position);pose.position.y+=state.bob;
      pose.rotation.set(state.pitch+droneWobblePitch(time,phase),state.yaw,state.roll+droneWobbleRoll(time,phase));
      pose.updateMatrix();
      bodies.setMatrixAt(count,pose.matrix);equipment.setMatrixAt(count,pose.matrix);lenses.setMatrixAt(count,pose.matrix);
      for(let n=0;n<4;n++){
        poseDroneRotor(prop,n,state.rotorSpin);matrix.multiplyMatrices(pose.matrix,prop.matrix);rotors.setMatrixAt(count*4+n,matrix);
      }
      count++;
    },
    end(){bodies.count=equipment.count=lenses.count=count;rotors.count=count*4;for(const pool of pools)pool.instanceMatrix.needsUpdate=true;for(const [id,state] of attitudes)if(state.seen!==frame)attitudes.delete(id);},
    reset(){for(const pool of pools)pool.count=0;attitudes.clear();},
  };
}
