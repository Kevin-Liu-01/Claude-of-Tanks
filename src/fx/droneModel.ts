import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result=mergeGeometries(parts);for(const part of parts)part.dispose();return result;
}
/** Same airframe on its launch rail and in flight: battery, motor cans, landing feet,
 * forward camera and underslung explosive payload remain recognizable at takeoff. */
export function createDroneModelKit() {
  const parts:THREE.BufferGeometry[]=[new THREE.BoxGeometry(.34,.13,.5).translate(0,.04,0)];
  for(const sign of [-1,1])parts.push(new THREE.BoxGeometry(1.4,.045,.07).rotateY(sign*Math.PI/4));
  for(const x of [-.48,.48])for(const z of [-.48,.48]) {
    parts.push(new THREE.CylinderGeometry(.065,.065,.13,10).translate(x,.06,z));
    parts.push(new THREE.BoxGeometry(.035,.18,.04).translate(x,-.08,z));
  }
  const body=merge(parts);
  const equipment=merge([
    new THREE.BoxGeometry(.24,.12,.32).translate(0,.16,-.03),
    new THREE.CapsuleGeometry(.075,.34,4,10).rotateX(Math.PI/2).translate(0,-.12,0),
    new THREE.BoxGeometry(.16,.12,.14).translate(0,.015,.3),
    new THREE.CylinderGeometry(.009,.009,.25,5).rotateX(-.25).translate(0,.23,-.2),
  ]);
  const lens=new THREE.CylinderGeometry(.05,.05,.025,12).rotateX(Math.PI/2).translate(0,.025,.38);
  const rotor=new THREE.BoxGeometry(.55,.012,.045);
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0x20292c,roughness:.48,metalness:.6});
  const equipmentMaterial=new THREE.MeshStandardMaterial({color:0x73795a,roughness:.75,metalness:.2});
  const lensMaterial=new THREE.MeshStandardMaterial({color:0x69b6c4,emissive:0x143b49,roughness:.12,metalness:.7});
  return {body,equipment,lens,rotor,bodyMaterial,equipmentMaterial,lensMaterial,
    dispose(){body.dispose();equipment.dispose();lens.dispose();rotor.dispose();bodyMaterial.dispose();equipmentMaterial.dispose();lensMaterial.dispose();}};
}
export function poseDroneRotor(prop:THREE.Object3D,index:number,spin:number):void {
  prop.position.set(index<2?-.48:.48,.14,index%2?.48:-.48);
  prop.rotation.y=spin*(index%2?1:-1)+index*.8;prop.updateMatrix();
}
