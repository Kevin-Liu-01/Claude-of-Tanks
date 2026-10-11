import * as THREE from 'three';
import { getAerialVision, aerialVisionCode } from './aerialVision.ts';
import { droneWobblePitch, droneWobbleRoll } from '../fx/droneMotion.ts';
import { AERIAL_RULES } from '../sim/matchRuleset.ts';
import type { AerialView } from '../sim/aerialCombat.ts';

/** The gunship gimbal tracks a ground point while its aircraft continues to orbit.
 * Drone flight uses an independent pilot aim direction, with a smooth launch handoff. */
export function createAerialCamera(camera: THREE.PerspectiveCamera) {
  let owner: object | null = null, previousKind = '', yaw = 0, pitch = -.8, zoom = 1, launchBlend=0;
  const target=new THREE.Vector3(),focus=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3(),offset=new THREE.Vector3();
  function aimGunship(view:AerialView,input:{wheel:number;shiftPressed?:boolean},dx:number,dy:number):void {
        zoom=THREE.MathUtils.clamp(zoom*Math.pow(1.2,input.wheel),1,6);
        if(input.shiftPressed)zoom=zoom>=5.9?1:Math.min(6,zoom*2);
        // Pan on the map plane in screen coordinates; orbit never drags the target away.
        forward.copy(focus).sub(camera.position);forward.y=0;forward.normalize();
        right.set(-forward.z,0,forward.x);
        const metersPerPixel=2*(view.y-focus.y)*Math.tan(THREE.MathUtils.degToRad(55/zoom)/2)/600;
        focus.addScaledVector(right,dx*metersPerPixel).addScaledVector(forward,-dy*metersPerPixel);
        focus.x=THREE.MathUtils.clamp(focus.x,-650,650);focus.z=THREE.MathUtils.clamp(focus.z,-650,650);
        target.copy(focus);
  }
  function aimDrone(view:AerialView,dx:number,dy:number,dt:number):void {
        yaw-=dx*.0022;pitch=THREE.MathUtils.clamp(pitch-dy*.0022,-1.35,1.1);
        if(view.launching){launchBlend=1;yaw=view.yaw;}
        else launchBlend=Math.max(0,launchBlend-dt*1.8);
        offset.set(-Math.sin(view.yaw)*4,1.4,-Math.cos(view.yaw)*4).multiplyScalar(launchBlend);
        camera.position.add(offset);
        target.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(1000).add(camera.position);
        if(launchBlend>0)target.lerp(forward.set(view.x,view.y,view.z).sub(camera.position).normalize().multiplyScalar(1000).add(camera.position),launchBlend);
  }
  return {
    get zoom(){return zoom;},
    update(entity: { id?: string; aerial?: AerialView; input?: { aimPoint?: THREE.Vector3 | null }; visual?: { root: THREE.Object3D } | null }, input: { mouseDX: number; mouseDY: number; wheel: number; shiftPressed?: boolean; cursorAim?: boolean; cursorX?: number; cursorY?: number }, dt: number): boolean {
      const view=entity.aerial;
      if(!view?.active){
        camera.userData.thermalFlight=false;camera.userData.aerialPilotId=null;
        if(previousKind){camera.fov=60;camera.updateProjectionMatrix();previousKind='';owner=null;}
        return false;
      }
      if(owner!==entity||previousKind!==view.kind){
        owner=entity;previousKind=view.kind;yaw=view.yaw;pitch=-.12;zoom=1;launchBlend=view.launching?1:0;
        focus.set(0,view.kind==='gunship'?view.y-AERIAL_RULES.gunship.altitudeM:0,0);
      }
      // consumeMouseDelta supplies world-yaw X (already negated), while
      // the gimbal and FPV helpers below take screen-right-positive motion.
      // Absolute cursor coordinates are already in screen space.
      const dx=-input.mouseDX+(input.cursorAim?(input.cursorX??0)*dt*350:0);
      const dy=input.mouseDY-(input.cursorAim?(input.cursorY??0)*dt*250:0);
      camera.position.set(view.x,view.y+.12,view.z);
      if(view.kind==='gunship') aimGunship(view,input,dx,dy);
      else aimDrone(view,dx,dy,dt);
      const fov=view.kind==='gunship'?55/zoom:85;
      if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
      camera.lookAt(target);
      const fpv=view.kind==='drone'&&!view.launching&&launchBlend<=0;
      // The fx pass skips only this pilot's own airframe near this camera (its lens rides inside it); see dronePresentation.
      camera.userData.aerialPilotId=view.kind==='drone'?entity.id??null:null;
      camera.userData.thermalFlight=view.kind==='gunship'||fpv;
      camera.userData.flightVision=aerialVisionCode(getAerialVision());
      if(fpv){
        // Lens follows the airframe's corrections without the full exterior bank.
        const time=AERIAL_RULES.drone.batteryS-view.batteryS;
        camera.rotateX(droneWobblePitch(time,0)*.32);
        camera.rotateZ(droneWobbleRoll(time,0)*.45);
      }
      entity.input?.aimPoint?.copy(target);return true;
    },
  };
}
