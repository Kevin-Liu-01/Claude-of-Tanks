import * as THREE from 'three';
import { auxiliaryCapabilities, SMOKE_DURATION_S, type AuxiliaryState, type SmokeScreen } from '../sim/auxiliarySystems.ts';
import {smokeVolume, type SmokeVolume} from '../sim/smokeScreen.ts';
import { smokeSocketsFor } from '../vehicles/vehicleAuxiliaryGeometry.ts';

export interface AuxiliaryVisualEntity {
  id: string;
  team?: string;
  spec?: {id: string} | null;
  visual?: {root?: THREE.Object3D | null} | null;
  combat?: {destroyed?: boolean; auxiliary?: AuxiliaryState} | null;
  networkVisible?: boolean;
}
interface Ports {
  entities(): Iterable<AuxiliaryVisualEntity>;
  visible?(entity:AuxiliaryVisualEntity):boolean;
  time(): number;
  report(id:string,position:THREE.Vector3,caliber:number):void;
  flash(position: THREE.Vector3, direction: THREE.Vector3, caliber: number): void;
  smoke(position: THREE.Vector3, scale: number, density?:number, life?:number, wind?:boolean): void;
  ground(x:number,z:number): number;
}
interface Actor {
  root: THREE.Object3D;
  gun: THREE.Object3D | null;
  weapon: THREE.Object3D | null;
  rest: THREE.Quaternion;
  restWeapon: THREE.Vector3;
  muzzle: THREE.Vector3;
  shots: number;
  smokeBorn: number;
  recoil: number;
}
/** One fixed pool, one draw for ejected brass and launched smoke canisters. */
export function createAuxiliaryPresentation(parent: THREE.Group, ports: Ports) {
  const casings=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.014,.085,6),new THREE.MeshStandardMaterial({color:0xbfa35f,metalness:.7,roughness:.38}),96);
  casings.name='auxiliaryEjectedCases';casings.count=0;casings.frustumCulled=false;parent.add(casings);
  const pool=Array.from({length:96},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:9,grenade:false}));
  const actors=new Map<string,Actor>();let cursor=0,lastTime=-1,lastPuff=-1;
  let networkScreens: readonly SmokeScreen[] | null=null;
  const position=new THREE.Vector3(),direction=new THREE.Vector3(),q=new THREE.Quaternion(),turn=new THREE.Quaternion();
  const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0),rotation=new THREE.Euler();
  const color=new THREE.Color();
  const volume:SmokeVolume={x:0,y:0,z:0,radius:0,height:0,density:0};
  const target=new THREE.Vector3();
  function eject(p:THREE.Vector3,d:THREE.Vector3,grenade=false){
    const item=pool[cursor++%pool.length]!;item.p.copy(p);item.age=0;item.grenade=grenade;
    if(grenade)item.v.copy(d);
    else item.v.set(d.z*2.4,1.7,-d.x*2.4);
  }
  function prepare(entity:AuxiliaryVisualEntity,root:THREE.Object3D):Actor{
    const kit=auxiliaryCapabilities(entity.spec), mount=kit?.guns[0];
    const gun=mount ? root.getObjectByName(mount.name)??null : null;
    const actor:Actor={root,gun,weapon:gun?.getObjectByName('auxiliaryWeaponPitch')??null,rest:gun?.quaternion.clone()??new THREE.Quaternion(),
      restWeapon:new THREE.Vector3(),muzzle:new THREE.Vector3(...(mount?.muzzle as [number,number,number]??[0,.35,1.22])),shots:entity.combat?.auxiliary?.shots??0,smokeBorn:-1,recoil:0};
    if(actor.weapon)actor.restWeapon.copy(actor.weapon.position);actors.set(entity.id,actor);return actor;
  }
  function animateRoofWeapon(entity:AuxiliaryVisualEntity,actor:Actor,state:AuxiliaryState,visible:boolean,dt:number){
    if(actor.gun){
      actor.gun.quaternion.copy(actor.rest).multiply(turn.setFromAxisAngle(yAxis,state.gunYaw));
      actor.recoil=Math.max(0,actor.recoil-dt*4);
      if(actor.weapon){actor.weapon.rotation.x=-state.gunPitch;actor.weapon.position.z=actor.restWeapon.z-actor.recoil*.025;}
      if(visible&&state.shots!==actor.shots){
        actor.gun.updateWorldMatrix(true,true);
        position.copy(actor.muzzle);
        // The muzzle rotates around the weapon's authored trunnion, not the floor of the pedestal.
        if(actor.weapon){position.sub(actor.restWeapon);actor.weapon.localToWorld(position);}
        else actor.gun.localToWorld(position);
        direction.set(0,0,1).applyQuaternion((actor.weapon??actor.gun).getWorldQuaternion(q));
        const caliber=auxiliaryCapabilities(entity.spec)?.guns[0]?.caliberMm??12.7;
        ports.flash(position,direction,caliber);ports.report(entity.id,position,caliber);
        position.addScaledVector(direction,-Math.max(.3,actor.muzzle.z-.2));eject(position,direction);actor.recoil=1;
      }
    }
  }
  function actorFrame(entity:AuxiliaryVisualEntity,dt:number){
    const root=entity.visual?.root;if(!root)return;
    const actor=actors.get(entity.id)?.root===root?actors.get(entity.id)!:prepare(entity,root);
    const state=entity.combat?.auxiliary;
    if(!state){
      if(actor.gun)actor.gun.quaternion.copy(actor.rest);
      if(actor.weapon){actor.weapon.rotation.x=0;actor.weapon.position.copy(actor.restWeapon);}
      actor.shots=0;actor.recoil=0;actor.smokeBorn=-1;
      return;
    }
    const visible=(ports.visible?.(entity)??true)&&entity.networkVisible!==false&&root.visible&&!!root.parent&&!entity.combat?.destroyed;
    animateRoofWeapon(entity,actor,state,visible,dt);
    actor.shots=state.shots;
    if(visible&&state.smoke&&state.smoke.born!==actor.smokeBorn){
      if(ports.time()-state.smoke.born<.6){
        root.updateWorldMatrix(true,true);
        let tubeIndex=0;
        const screen=state.smoke;
        root.traverse(o=>{for(const socket of smokeSocketsFor(o)){
          position.fromArray(socket.position).applyMatrix4(o.matrixWorld);direction.fromArray(socket.direction).transformDirection(o.matrixWorld);
          smokeVolume(screen,screen.born+1.05,(tubeIndex++%5)-2,volume,ports.ground);
          target.set(volume.x,Math.max(volume.y-.8,ports.ground(volume.x,volume.z)+.8),volume.z);
          direction.subVectors(target,position).multiplyScalar(1/1.05);direction.y+=.5*9.81*1.05;
          eject(position,direction,true);ports.smoke(position,.12,.3,.65);
        }});
      }
      actor.smokeBorn=state.smoke.born;
    }
  }
  function puff(screen:SmokeScreen,time:number){
    const age=time-screen.born;if(age<.85||age>SMOKE_DURATION_S-.3)return;
    for(let bank=-2;bank<=2;bank++){
      smokeVolume(screen,time,bank,volume,ports.ground);
      if(volume.density<.015)continue;
      // Different-height rolling lobes overlap the shared sight-blocking volume.
      const phase=age*1.7+bank*2.4+screen.born;
      position.set(volume.x+Math.sin(phase)*.65,volume.y+Math.sin(phase*.7)*.5,volume.z+Math.cos(phase)*.65);
      ports.smoke(position,volume.radius/5.6,volume.density,Math.min(4.8,SMOKE_DURATION_S-age),true);
    }
  }

  function updateCasings(dt:number){
      let count=0;
      for(const item of pool){
        item.age+=dt;if(item.age>2.5)continue;
        item.v.y-=9.81*dt;item.p.addScaledVector(item.v,dt);
        const ground=ports.ground(item.p.x,item.p.z)+.025;
        if(item.p.y<ground){item.p.y=ground;item.v.multiplyScalar(.35);item.v.y=Math.abs(item.v.y);}
        q.setFromEuler(rotation.set(item.age*12,item.age*7,item.age*9));scale.setScalar(item.grenade?2.2:1);
        matrix.compose(item.p,q,scale);casings.setMatrixAt(count,matrix);casings.setColorAt(count,color.setHex(item.grenade?0x4b5450:0xbfa35f));count++;
      }
      casings.count=count;casings.instanceMatrix.needsUpdate=true;if(casings.instanceColor)casings.instanceColor.needsUpdate=true;
  }

  return {
    setNetworkScreens(screens:readonly SmokeScreen[]){networkScreens=screens;},
    update(){
      const now=ports.time();if(now===lastTime)return;const dt=lastTime<0?0:Math.min(.1,Math.max(0,now-lastTime));lastTime=now;
      for(const entity of ports.entities())actorFrame(entity,dt);
      if(now-lastPuff>.4){
        lastPuff=now;
        if(networkScreens)for(const screen of networkScreens)puff(screen,now);
        else for(const entity of ports.entities()){const s=entity.combat?.auxiliary?.smoke;if(s)puff(s,now);}
      }
      updateCasings(dt);
    },
    reset(){
      for(const a of actors.values()){if(a.gun)a.gun.quaternion.copy(a.rest);if(a.weapon){a.weapon.rotation.x=0;a.weapon.position.copy(a.restWeapon);}}
      actors.clear();networkScreens=null;lastTime=-1;lastPuff=-1;for(const item of pool)item.age=9;casings.count=0;
    },
  };
}
