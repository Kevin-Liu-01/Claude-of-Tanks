import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Two fixed pools draw up to 42 physical quadcopters, including their spinning propellers. */
export function createDronePresentation(parent: THREE.Group) {
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(.5,.22,.65)];
  for(const sign of [-1,1]) parts.push(new THREE.BoxGeometry(1.6,.06,.08).rotateY(sign*Math.PI/4));
  for(const x of [-.55,.55])for(const z of [-.55,.55])parts.push(new THREE.CylinderGeometry(.08,.08,.2,8).translate(x,.08,z));
  const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();
  const material=new THREE.MeshStandardMaterial({color:0x293237,roughness:.45,metalness:.5});
  const bodies=new THREE.InstancedMesh(geometry,material,42);
  const rotors=new THREE.InstancedMesh(new THREE.BoxGeometry(.65,.025,.07),material,168);
  bodies.name='FPV drone airframes';rotors.name='FPV spinning propellers';bodies.frustumCulled=false;rotors.frustumCulled=false;
  bodies.count=rotors.count=0;parent.add(bodies,rotors);
  const pose=new THREE.Object3D(),prop=new THREE.Object3D(),target=new THREE.Vector3(),matrix=new THREE.Matrix4();
  let count=0,spin=0;
  return {
    begin(timeS:number){count=0;spin=timeS*100;},
    write(position:THREE.Vector3,velocity:THREE.Vector3){
      if(count>=42)return;
      pose.position.copy(position);target.copy(position).add(velocity);if(velocity.lengthSq()>.001)pose.lookAt(target);pose.updateMatrix();
      bodies.setMatrixAt(count,pose.matrix);
      for(let n=0;n<4;n++){
        prop.position.set(n<2?-.55:.55,.15,n%2? .55:-.55);prop.rotation.y=spin*(n%2?1:-1);prop.updateMatrix();matrix.multiplyMatrices(pose.matrix,prop.matrix);rotors.setMatrixAt(count*4+n,matrix);
      }
      count++;
    },
    end(){bodies.count=count;rotors.count=count*4;bodies.instanceMatrix.needsUpdate=true;rotors.instanceMatrix.needsUpdate=true;},
    reset(){bodies.count=rotors.count=0;},
  };
}
