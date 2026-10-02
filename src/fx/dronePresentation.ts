import * as THREE from 'three';
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
  pose.rotation.order='YXZ';let count=0,spin=0;
  return {
    begin(timeS:number){count=0;spin=timeS*130;},
    write(position:THREE.Vector3,velocity:THREE.Vector3){
      if(count>=42)return;
      const horizontal=Math.hypot(velocity.x,velocity.z);
      pose.position.copy(position);
      pose.rotation.set(Math.min(.3,horizontal*.008),horizontal>.02?Math.atan2(velocity.x,velocity.z):0,0);
      pose.updateMatrix();
      bodies.setMatrixAt(count,pose.matrix);equipment.setMatrixAt(count,pose.matrix);lenses.setMatrixAt(count,pose.matrix);
      for(let n=0;n<4;n++){
        poseDroneRotor(prop,n,spin);matrix.multiplyMatrices(pose.matrix,prop.matrix);rotors.setMatrixAt(count*4+n,matrix);
      }
      count++;
    },
    end(){bodies.count=equipment.count=lenses.count=count;rotors.count=count*4;for(const pool of pools)pool.instanceMatrix.needsUpdate=true;},
    reset(){for(const pool of pools)pool.count=0;},
  };
}
