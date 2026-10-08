/** Deterministic native docking frame. Mirrors the chassis presentation and
 * two-plane stabilizer; contains no renderer, fleet-builder or clock access. */
import {Euler,Quaternion,Vector3} from 'three';
import {missionAttachmentFor,missionAttachmentTurretPivot,DRONE_DOCK_HEIGHT_M,type MissionCarrierSpec} from './missionAttachment.ts';
export interface MissionCarrierPose {
 pos:Vector3;yaw:number;turretYaw?:number;gunPitch?:number;visualPitch?:number;visualRoll?:number;
 _susp?:{p:number;r:number};_swayEst?:number;_flinch?:{p:number;r:number};
}
const euler=new Euler(0,0,0,'YXZ'),canonical=new Quaternion(),chassis=new Quaternion(),turn=new Quaternion(),direction=new Vector3();
const yAxis=new Vector3(0,1,0);
/** Position is the airframe origin, orientation the actual dock axes. Scratch
 * is module-owned: fixed-step owners already advance entities sequentially. */
export function missionAttachmentPose(spec:MissionCarrierSpec,state:MissionCarrierPose,position:Vector3,orientation:Quaternion):void {
 const seat=missionAttachmentFor(spec),pitch=state.visualPitch??0,roll=state.visualRoll??0;
 const extraPitch=(state._susp?.p??0)*2.2-(state._flinch?.p??0);
 const extraRoll=(state._susp?.r??0)*1.9+(state._swayEst??0)*2.4+(state._flinch?.r??0);
 chassis.setFromEuler(euler.set(-pitch-extraPitch,state.yaw,roll+extraRoll));
 position.set(seat.x+(seat.payloadOffset?.[0]??0),seat.y+DRONE_DOCK_HEIGHT_M,seat.z+(seat.payloadOffset?.[1]??0));orientation.copy(chassis);
 if(seat.frame==='turret'){
  let yaw=state.turretYaw??0;
  if(Math.abs(extraPitch)+Math.abs(extraRoll)>1e-6){
   const elevation=state.gunPitch??0,c=Math.cos(elevation);
   direction.set(Math.sin(yaw)*c,Math.sin(elevation),Math.cos(yaw)*c);
   canonical.setFromEuler(euler.set(-pitch,state.yaw,roll));
   direction.applyQuaternion(canonical);canonical.copy(chassis).invert();direction.applyQuaternion(canonical);
   yaw=Math.atan2(direction.x,direction.z);
  }
  turn.setFromAxisAngle(yAxis,yaw);position.applyQuaternion(turn);
  const pivot=missionAttachmentTurretPivot(spec);position.x+=pivot[0];position.y+=pivot[1];position.z+=pivot[2];
  orientation.multiply(turn);
 }
 position.applyQuaternion(chassis).add(state.pos);
}
