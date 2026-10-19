import * as THREE from 'three';
interface Aircraft { root: THREE.Group; rotors: THREE.Mesh[]; dispose(): void }
const aircraft = new WeakMap<THREE.Object3D, Aircraft>();
/** (ac130-fx-228) The airframe's lit materials join the battle's cascade setup (engineCtx.setupShadowMaterial), as every
 *  lit material in the scene must; the FX runtime installs the hooks when it is built (effects.ts, as it does the
 *  drones'), before any battle frame can show the airframe. */
interface GunshipMaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }
let materialHooks: GunshipMaterialHooks | null = null;
export function configureGunshipMaterials(hooks: GunshipMaterialHooks | null): void { materialHooks = hooks; }

/** An orbiting four-engine gunship replaces the tank exterior in aerial mode. (ac130-fx-228) `pilotLens`: the pilot's own
 *  camera, given for the player's gunship. The gimbal lens rides the orbit centre, inside the airframe, so the airframe
 *  draws whenever that camera is elsewhere (the killcam, the ending's replay and orbit, an external camera). */
export function syncGunshipVisual(tankRoot: THREE.Object3D, position: THREE.Vector3, yaw: number, dt: number, visible: boolean,
  pilotLens: THREE.Vector3 | false | null = null): void {
  if (pilotLens) visible = pilotLens.distanceToSquared(position) > 900;
  let model=aircraft.get(tankRoot);
  if(!model){
    const root=new THREE.Group();root.name='AC-130 gunship';const rotors:THREE.Mesh[]=[];
    const gray=new THREE.MeshStandardMaterial({color:0x596469,metalness:.35,roughness:.55});
    const black=new THREE.MeshStandardMaterial({color:0x171e22,metalness:.25,roughness:.4});
    const hooks=materialHooks;
    if(hooks){hooks.setup(gray);hooks.setup(black);}
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat=gray)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);root.add(m);return m;};
    const hull=new THREE.Mesh(new THREE.CapsuleGeometry(1.6,23,6,12),gray);hull.rotation.x=Math.PI/2;root.add(hull);
    box(39,.4,4.4,0,.6,1);box(13,.3,3,0,1,-11);box(.3,5,4,0,2.4,-10);
    box(2.5,1,3,0,.6,10,black);
    for(const x of [-13,-7,7,13]){
      const nacelle=new THREE.Mesh(new THREE.CapsuleGeometry(.65,3,4,8),gray);nacelle.rotation.x=Math.PI/2;nacelle.position.set(x,0,2.4);root.add(nacelle);
      const prop=box(.2,5,.1,x,0,4.7,black);rotors.push(prop);
    }
    for(const z of [-4,0,4])box(3,.25,.25,-2.5,-.1,z,black);

    const release = () => {
      root.removeFromParent();
      root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      if(hooks){hooks.release(gray);hooks.release(black);}
      gray.dispose(); black.dispose(); aircraft.delete(tankRoot);
      tankRoot.removeEventListener('removed', release);
    };
    model={root,rotors,dispose:release};aircraft.set(tankRoot,model);
    tankRoot.addEventListener('removed', release);
  }
  if(tankRoot.parent&&model.root.parent!==tankRoot.parent)tankRoot.parent.add(model.root);
  model.root.visible=visible;model.root.position.copy(position);model.root.rotation.set(0,yaw,.09);
  for(const rotor of model.rotors)rotor.rotation.z+=dt*45;
  tankRoot.visible=false;
}
export function hideGunshipVisual(tankRoot: THREE.Object3D): void { const model=aircraft.get(tankRoot);if(model)model.root.visible=false; }

/** Aircraft-only battle carrier. It never constructs a tank or its textures. */
export function createGunshipBattleVisual(specId: string) {
  const root = new THREE.Group();
  root.name = 'AC-130 flight anchor';
  root.userData.aircraftOnly = true;
  const worldPosition = (out: THREE.Vector3) => root.getWorldPosition(out);
  return {
    specId, root,
    setVisible(visible: boolean) { root.visible = visible; if (!visible) hideGunshipVisual(root); },
    syncFromState(state: { pos: THREE.Vector3; yaw: number }) {
      root.position.copy(state.pos); root.rotation.set(0, state.yaw, 0);
    },
    turretTopWorld: worldPosition, gunPivotWorld: worldPosition, gunMuzzleWorld: worldPosition,
    gunDirWorld(out: THREE.Vector3) { return out.set(0, 0, 1).applyQuaternion(root.quaternion); },
    dispose() { aircraft.get(root)?.dispose(); root.removeFromParent(); },
  };
}
