import * as THREE from 'three';
interface Aircraft { root: THREE.Group; rotors: THREE.Mesh[] }
const aircraft = new WeakMap<THREE.Object3D, Aircraft>();
/** An orbiting four-engine gunship replaces the tank exterior in aerial mode. */
export function syncGunshipVisual(tankRoot: THREE.Object3D, position: THREE.Vector3, yaw: number, dt: number, visible: boolean): void {
  let model=aircraft.get(tankRoot);
  if(!model){
    const root=new THREE.Group();root.name='AC-130 gunship';const rotors:THREE.Mesh[]=[];
    const gray=new THREE.MeshStandardMaterial({color:0x596469,metalness:.35,roughness:.55});
    const black=new THREE.MeshStandardMaterial({color:0x171e22,metalness:.25,roughness:.4});
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat=gray)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);root.add(m);return m;};
    const hull=new THREE.Mesh(new THREE.CapsuleGeometry(1.6,23,6,12),gray);hull.rotation.x=Math.PI/2;root.add(hull);
    box(39,.4,4.4,0,.6,1);box(13,.3,3,0,1,-11);box(.3,5,4,0,2.4,-10);
    box(2.5,1,3,0,.6,10,black);
    for(const x of [-13,-7,7,13]){
      const nacelle=new THREE.Mesh(new THREE.CapsuleGeometry(.65,3,4,8),gray);nacelle.rotation.x=Math.PI/2;nacelle.position.set(x,0,2.4);root.add(nacelle);
      const prop=box(.2,5,.1,x,0,4.7,black);rotors.push(prop);
    }
    for(const z of [-4,0,4])box(3,.25,.25,-2.5,-.1,z,black);
    model={root,rotors};aircraft.set(tankRoot,model);
    const release = () => {
      root.removeFromParent();
      root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      gray.dispose(); black.dispose(); aircraft.delete(tankRoot);
      tankRoot.removeEventListener('removed', release);
    };
    tankRoot.addEventListener('removed', release);
  }
  if(tankRoot.parent&&model.root.parent!==tankRoot.parent)tankRoot.parent.add(model.root);
  model.root.visible=visible;model.root.position.copy(position);model.root.rotation.set(0,yaw,.09);
  for(const rotor of model.rotors)rotor.rotation.z+=dt*45;
  tankRoot.visible=false;
}
export function hideGunshipVisual(tankRoot: THREE.Object3D): void { const model=aircraft.get(tankRoot);if(model)model.root.visible=false; }
