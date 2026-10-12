import * as THREE from 'three';
import {AERIAL_RULES} from '../sim/matchRuleset.ts';
import {droneLaunchHeight,droneFreeFlightBlend,DRONE_SPOOL_S} from '../sim/droneLaunch.ts';
import { createDroneAttitude, updateDroneAttitude, droneWobblePitch, droneWobbleRoll, droneHoverDrift, droneClimbCharacter, type DroneAttitude } from './droneMotion.ts';
import { acquireDroneModelKit, droneNation, poseDroneRotor, DRONE_LITE_DISTANCE_M, type DroneKitLease } from './droneModel.ts';
import { DRONE_ARRIVAL, DRONE_RETURN, droneArrivalAttitude } from './droneArrival.ts';
import { avoidDroneObstacles, type AerialWorldQuery } from '../sim/aerialCombat.ts';

const CAPACITY = 42;
/**
 * The pilot's lens rides inside its own airframe, so that one drone is skipped near the camera while the pilot's aerial
 * camera follows it (2 m covers the one fixed step the camera's view lags the airframe). Every other camera (a film, the
 * killcam, spectators, a teammate beside the carrier) draws every drone, however close (2026-10-10: a film camera 1.99 m
 * from the dock lost the airframe for a frame as it passed camera height).
 */
export function droneHiddenFromCamera(position:THREE.Vector3,shooterId:string|number|null|undefined,flightActive:boolean,camera:THREE.Camera):boolean {
  return flightActive&&shooterId!=null&&camera.userData.aerialPilotId===shooterId&&position.distanceToSquared(camera.position)<=4;
}
/** The blades read individually only while they spool; at speed each rotor is a translucent disc. From `FAINT_DISC_S`
 * a faint disc shows over the quickening blades, so the spool-up reads blades, then blades under a disc, then a disc —
 * all on the cradle (round 4b: the disc is full just before the 0.6 s lift, DRONE_SPOOL_S). */
const BLUR_AFTER_SPOOL = .5, FAINT_DISC_S = .2;

interface DetailPool {
 lease:DroneKitLease;
 parts:THREE.InstancedMesh[];
 rotors:THREE.InstancedMesh;
 blurs:THREE.InstancedMesh;
 faint:THREE.InstancedMesh;
 meshes:THREE.InstancedMesh[];
 count:number; bladeCount:number; blurCount:number; faintCount:number;
}
/** A drone's carrier as the presentation sees it: the live dock frame (the cradle's airframe datum), and whether the
 * carrier is gone or flying again (either ends a flight home). */
export interface DroneCarrierView { frame?: THREE.Object3D; destroyed: boolean; flying: boolean }
export interface DronePresentationOptions {
  /** The battle world's raycast, the one the shells and the authorities sweep: a flight home avoids what it hits. */
  world?(): Pick<AerialWorldQuery,'raycast'> | null | undefined;
  resolveCarrier?(ownerId: string | number): DroneCarrierView | null;
  /** Diagnostics: each flight home's start and end, with the reason it ended (or never began). */
  onReturnEvent?(id: string | number, event: 'start' | 'end' | 'skip', reason: string): void;
}
type ReturnPhase = 'grace' | 'transit' | 'descent' | 'handoff';
interface ReturnFlight {
  id: string | number; ownerId: string | number; nation: string; phase: ReturnPhase;
  pos: THREE.Vector3; vel: THREE.Vector3; state: DroneAttitude; seed: number;
  t: number; phaseT: number; cruiseY: number; speed: number; descentFrom: number;
}
interface Track { pos: THREE.Vector3; vel: THREE.Vector3; ownerId?: string | number; nation: string; ageS: number }

/** Bounded pools; a quadcopter banks modestly under motion, never points its body vertically. Airframe builds are the
 * shared per-nation kits (lit-material registration rides with them). A flight that ends in the air (recall, battery,
 * signal: no impact) flies home and lands on its dock; presentation only, gameplay timing unchanged. */
export function createDronePresentation(parent: THREE.Group, options: DronePresentationOptions = {}) {
  const variants=new Map<string,{full:DetailPool;lite:DetailPool|null;nation:string}>();
  function buildDetail(nation:string,detail:'full'|'lite'):DetailPool {
    const lease=acquireDroneModelKit(nation,detail),kit=lease.kit;
    const parts=kit.parts.map(part=>new THREE.InstancedMesh(part.geometry,part.material,CAPACITY));
    const rotors=new THREE.InstancedMesh(kit.rotor,kit.rotorMaterial,CAPACITY*4);
    const blurs=new THREE.InstancedMesh(kit.rotorBlur,kit.blurMaterial,CAPACITY*4);
    const faint=new THREE.InstancedMesh(kit.rotorBlurFaint,kit.blurMaterial,CAPACITY*4);
    blurs.renderOrder=faint.renderOrder=2;
    const meshes=[...parts,rotors,blurs,faint];
    // Shaded like the docked airframe (one program per material), so a launch from a shaded dock never brightens.
    for(const mesh of meshes){mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.receiveShadow=true;parent.add(mesh);}
    // Near airframes cast with the sun (solid parts and spooling blades; never the translucent discs or the lite pool).
    for(const mesh of [...parts,rotors])mesh.castShadow=detail==='full';
    parts[0]!.name=`FPV ${kit.name} airframes${detail==='lite'?' (lite)':''}`;rotors.name='FPV spinning propellers';blurs.name='FPV rotor discs';faint.name='FPV fading rotor discs';
    return {lease,parts,rotors,blurs,faint,meshes,count:0,bladeCount:0,blurCount:0,faintCount:0};
  }
  function variant(nation:string){
    const key=droneNation(nation);let entry=variants.get(key);
    if(!entry){entry={full:buildDetail(key,'full'),lite:null,nation:key};variants.set(key,entry);}
    return entry;
  }
  const pose=new THREE.Object3D(),prop=new THREE.Object3D(),matrix=new THREE.Matrix4();
  pose.rotation.order='YXZ';let count=0,time=0,dt=1/60,frame=0;
  const camera=new THREE.Vector3();let hasCamera=false;
  const attitudes=new Map<string|number,DroneAttitude>();
  const launchFrames=new Map<string|number,{orientation:THREE.Quaternion;offset:THREE.Vector3;blocked:boolean}>();
  const climb={pitch:0,roll:0,lift:0},drift={x:0,z:0},climbEuler=new THREE.Euler(0,0,0,'YXZ'),climbQuat=new THREE.Quaternion();
  const launchOrientation=new THREE.Quaternion(),upRay=new THREE.Vector3(0,1,0);
  const upAxis=new THREE.Vector3(0,1,0),lift=new THREE.Vector3(),dockUp=new THREE.Vector3();
  const dockOrientation=new THREE.Quaternion(),flightOrientation=new THREE.Quaternion();
  const tracks=new Map<string|number,Track>(),returns=new Map<string|number,ReturnFlight>(),impacted=new Map<string|number,number>();
  const dockAt=new THREE.Vector3(),drawAt=new THREE.Vector3(),handoffAt=new THREE.Vector3(),toward=new THREE.Vector3(),desired=new THREE.Vector3();
  const handoffQuat=new THREE.Quaternion(),arrivalEuler=new THREE.Euler(0,0,0,'YXZ'),arrivalQuat=new THREE.Quaternion();
  const arrivalPose={pitch:0,yaw:0,roll:0},rayDir=new THREE.Vector3();
  /** One airframe into the pools: `blades` draws spooling blades, otherwise rotor discs. */
  function drawAirframe(nation:string,matrixWorld:THREE.Matrix4,spin:number,blades:boolean):void {
    if(count>=CAPACITY)return;
    const entry=variant(nation);
    const far=hasCamera&&drawAt.setFromMatrixPosition(matrixWorld).distanceToSquared(camera)>DRONE_LITE_DISTANCE_M*DRONE_LITE_DISTANCE_M;
    if(far&&!entry.lite)entry.lite=buildDetail(entry.nation,'lite');
    const pool=far?entry.lite!:entry.full,index=pool.count++;
    for(const part of pool.parts)part.setMatrixAt(index,matrixWorld);
    const target=blades?pool.rotors:pool.blurs,base=blades?pool.bladeCount:pool.blurCount;
    for(let n=0;n<4;n++){poseDroneRotor(prop,n,blades?spin:time*9+n);matrix.multiplyMatrices(matrixWorld,prop.matrix);target.setMatrixAt(base+n,matrix);}
    if(blades)pool.bladeCount+=4;else pool.blurCount+=4;
    count++;
  }
  /** The landing's first pose on the carrier's dock, in the world: the hand-over point of a flight home. */
  function handoffPose(frame:THREE.Object3D):void {
    frame.updateWorldMatrix(true,false);
    handoffAt.set(0,DRONE_ARRIVAL.heightM,0).applyMatrix4(frame.matrixWorld);
    droneArrivalAttitude(0,arrivalPose);
    arrivalQuat.setFromEuler(arrivalEuler.set(arrivalPose.pitch,arrivalPose.yaw,arrivalPose.roll,'YXZ'));
    frame.getWorldQuaternion(handoffQuat).multiply(arrivalQuat);
  }
  function startReturn(id:string|number,track:Track):void {
    if(track.ownerId==null||track.ageS<AERIAL_RULES.drone.launchS){options.onReturnEvent?.(id,'skip',track.ownerId==null?'no owner':'never flew free');return;}
    options.onReturnEvent?.(id,'start',`owner ${track.ownerId}`);
    const state=attitudes.get(id)??createDroneAttitude();
    returns.set(id,{id,ownerId:track.ownerId,nation:track.nation,phase:'grace',pos:track.pos.clone(),vel:track.vel.clone(),state,
      seed:typeof id==='number'?id*.71:id.length*.71,t:0,phaseT:0,cruiseY:track.pos.y,speed:DRONE_RETURN.minSpeed,descentFrom:0});
  }
  /** Advance one flight home by this frame's presentation dt and draw it; false when it ended (handed over or abandoned). */
  function stepReturn(r:ReturnFlight):boolean {
    const ended=(reason:string)=>{options.onReturnEvent?.(r.id,'end',`${reason} (${r.phase}, ${r.t.toFixed(2)} s)`);return false;};
    const carrier=options.resolveCarrier?.(r.ownerId),frame=carrier?.frame;
    if(!carrier)return ended('no carrier');
    if(!frame)return ended('no dock frame');
    if(carrier.destroyed)return ended('carrier destroyed');
    if(carrier.flying)return ended('carrier flying again');
    if(frame.parent?.visible===false)return ended('dock hidden');
    if(r.phase==='handoff'&&frame.userData.returnAck===true){frame.userData.returnAck=false;return ended('handed over');}
    r.t+=dt;r.phaseT+=dt;
    if(r.t>DRONE_RETURN.maxS+DRONE_RETURN.graceS)return ended('time bound');
    const world=options.world?.()??null;
    handoffPose(frame);
    frame.getWorldPosition(dockAt);
    if(r.phase==='grace'){
      r.vel.multiplyScalar(Math.exp(-dt*6));r.pos.addScaledVector(r.vel,dt);
      if(r.phaseT>=DRONE_RETURN.graceS){
        r.phase='transit';r.phaseT=0;r.cruiseY=dockAt.y+DRONE_RETURN.cruiseAboveDockM;
        const distance=Math.hypot(dockAt.x-r.pos.x,dockAt.z-r.pos.z);
        r.speed=Math.min(DRONE_RETURN.maxSpeed,Math.max(DRONE_RETURN.minSpeed,distance/DRONE_RETURN.targetS));
      }
    }else if(r.phase==='transit'){
      toward.set(handoffAt.x-r.pos.x,0,handoffAt.z-r.pos.z);
      const distance=toward.length();
      if(distance<=DRONE_RETURN.columnM&&Math.abs(r.pos.y-r.cruiseY)<2){
        // Straight down the column to the dock: abandoned if anything lies across it (a bough, a bridge over the carrier).
        rayDir.copy(handoffAt).sub(r.pos);const drop=rayDir.length();
        if(world&&drop>1e-3&&world.raycast(r.pos,rayDir.multiplyScalar(1/drop),drop))return ended('column blocked');
        r.phase='descent';r.phaseT=0;r.descentFrom=Math.max(.5,r.pos.y-handoffAt.y);
      }else{
        // Home at cruise height over a moving carrier: climbs or glides to it on the way, lifted over what lies ahead.
        r.cruiseY=dockAt.y+DRONE_RETURN.cruiseAboveDockM;
        const ground=Math.min(r.speed,distance*1.4+.5);
        desired.copy(toward).multiplyScalar(distance>1e-6?ground/distance:0);
        desired.y=Math.max(-5,Math.min(8,(r.cruiseY-r.pos.y)*.8));
        if(world)avoidDroneObstacles(world,String(r.ownerId),r.pos,desired);
        r.vel.lerp(desired,1-Math.exp(-dt*2.5));r.pos.addScaledVector(r.vel,dt);
      }
    }
    if(r.phase==='descent'){
      // The carrier may move: the column is tracked; the last metres ease into the landing's first pose.
      // round 5: down the column at no less than the landing's hand-over speed, so the landing continues the descent
      // instead of a stop at the hand-over (droneArrival.ts handoffSpeed)
      desired.set((handoffAt.x-r.pos.x)*4,-Math.min(6,Math.max(DRONE_ARRIVAL.handoffSpeed,(r.pos.y-handoffAt.y)*1.6)),(handoffAt.z-r.pos.z)*4);
      r.vel.lerp(desired,1-Math.exp(-dt*6));r.pos.addScaledVector(r.vel,dt);
      if(r.pos.y<=handoffAt.y+.04){
        r.pos.copy(handoffAt);r.vel.set(0,0,0);r.phase='handoff';r.phaseT=0;
        frame.userData.returnRequest=true;frame.userData.returnAck=false;
      }
    }
    if(r.phase==='handoff'){
      if(r.phaseT>.5)return ended('hand-over not taken');
      r.pos.copy(handoffAt);
      pose.position.copy(handoffAt);pose.quaternion.copy(handoffQuat);pose.scale.set(1,1,1);pose.updateMatrix();
      drawAirframe(r.nation,pose.matrix,0,false);return true;
    }
    const horizontal=Math.hypot(r.vel.x,r.vel.z);
    const heading=horizontal>1?Math.atan2(r.vel.x,r.vel.z):r.state.heading;
    updateDroneAttitude(r.state,r.vel,heading,time,dt,r.seed);
    pose.rotation.set(r.state.pitch+droneWobblePitch(time,r.seed),r.state.yaw,r.state.roll+droneWobbleRoll(time,r.seed));
    pose.position.copy(r.pos);pose.position.y+=r.state.bob;
    if(r.phase==='descent'){
      // Over the last 1.5 m the attitude, heading and hover bob fold exactly into the hand-over pose.
      const k=Math.min(1,Math.max(0,1-(r.pos.y-handoffAt.y)/Math.min(1.5,r.descentFrom)));
      const ease=k*k*(3-2*k);
      flightOrientation.copy(pose.quaternion);pose.quaternion.copy(flightOrientation).slerp(handoffQuat,ease);
      pose.position.y-=r.state.bob*ease;
    }
    pose.scale.set(1,1,1);pose.updateMatrix();
    drawAirframe(r.nation,pose.matrix,0,false);
    return true;
  }
  return {
    /** An impact for this shell (a tank hit, a world hit): its airframe exploded, so it never flies home. */
    markImpact(id:string|number){
      impacted.set(id,frame);
      const r=returns.get(id);if(r&&r.phase==='grace')returns.delete(id);
    },
    begin(timeS:number,cameraPosition?:THREE.Vector3){
      count=0;dt=Math.min(.1,Math.max(0,timeS-time));time=timeS;frame++;
      hasCamera=!!cameraPosition;if(cameraPosition)camera.copy(cameraPosition);
      for(const v of variants.values())for(const pool of [v.full,v.lite])if(pool){pool.count=0;pool.bladeCount=0;pool.blurCount=0;pool.faintCount=0;}
    },
    /** Every live drone shell, every frame (a missed one reads as a flight that ended). `hidden` keeps an airframe
     * tracked without drawing it (the pilot's own, around its FPV lens). */
    write(position:THREE.Vector3,velocity:THREE.Vector3,id:string|number,heading?:number,ageS=1,nation?:string,launchFrame?:THREE.Object3D,ownerId?:string|number,hidden=false){
      let track=tracks.get(id);if(!track){track={pos:new THREE.Vector3(),vel:new THREE.Vector3(),nation:droneNation(nation??'USA'),ageS:0};tracks.set(id,track);}
      track.pos.copy(position);track.vel.copy(velocity);track.ownerId=ownerId;track.nation=droneNation(nation??'USA');track.ageS=ageS;
      returns.delete(id);
      if(hidden){let state=attitudes.get(id);if(!state){state=createDroneAttitude();attitudes.set(id,state);}state.seen=frame;return;}
      if(count>=CAPACITY)return;
      const entry=variant(nation??'USA');
      const far=hasCamera&&position.distanceToSquared(camera)>DRONE_LITE_DISTANCE_M*DRONE_LITE_DISTANCE_M;
      if(far&&!entry.lite)entry.lite=buildDetail(entry.nation,'lite');
      const pool=far?entry.lite!:entry.full,index=pool.count++;
      const horizontal=Math.hypot(velocity.x,velocity.z);
      let state=attitudes.get(id);if(!state){state=createDroneAttitude();attitudes.set(id,state);}
      const phase=typeof id==='number'?id*.71:id.length*.71;
      const yaw=heading ?? (horizontal>.05?Math.atan2(velocity.x,velocity.z):state.heading);
      updateDroneAttitude(state,velocity,yaw,time,dt,phase);state.seen=frame;
      // Motors spool from rest on the cradle: the blades accelerate visibly, then blur into discs.
      const spool=Math.min(1,ageS/BLUR_AFTER_SPOOL);
      state.rotorSpin+=dt*(6+44*spool*spool);
      const launchS=AERIAL_RULES.drone.launchS;
      const free=droneFreeFlightBlend(ageS);
      pose.position.copy(position);pose.position.y+=state.bob*free;
      // Station-keeping: a centimetre of wander caught again, once the airframe flies free.
      droneHoverDrift(time,phase,drift);pose.position.x+=drift.x*free;pose.position.z+=drift.z*free;
      pose.rotation.set(state.pitch+droneWobblePitch(time,phase)*free,state.yaw,state.roll+droneWobbleRoll(time,phase)*free);
      if(free<1){
        let remembered=launchFrames.get(id);if(!remembered){remembered={orientation:new THREE.Quaternion(),offset:new THREE.Vector3(),blocked:false};launchFrames.set(id,remembered);}
        if(launchFrame&&ageS<launchS){
          launchFrame.getWorldQuaternion(dockOrientation);remembered.orientation.copy(dockOrientation);
          launchFrame.getWorldPosition(pose.position);
          // Never draw the climb above where the authority stopped it (a deck or bough over the dock).
          dockUp.set(0,1,0).applyQuaternion(dockOrientation);
          const authorityLift=lift.copy(position).sub(pose.position).dot(dockUp),climbHeight=droneLaunchHeight(ageS);
          if(authorityLift<climbHeight-.05)remembered.blocked=true;
          lift.set(0,Math.min(climbHeight,Math.max(0,authorityLift)+.05),0).applyQuaternion(dockOrientation);pose.position.add(lift);
          remembered.offset.copy(pose.position).sub(position);
        }
        else if(ageS<launchS)remembered.orientation.setFromAxisAngle(upAxis,yaw);
        // Render interpolation can put the live carrier slightly behind the
        // fixed-step authority. Fade that presentation-only offset after the
        // aircraft is clear instead of snapping at the end of spool-up.
        else pose.position.addScaledVector(remembered.offset,1-free);
        // The climb's character: trim corrections and a nose-down lean toward forward flight (in the dock's frame,
        // folded into the flight attitude as the airframe flies free), and a short overshoot of the launch height that
        // settles in quick corrections, drawn only where the authority's climb was clear and nothing lies just above.
        const climbU=Math.min(1,Math.max(0,(ageS-DRONE_SPOOL_S)/(launchS-DRONE_SPOOL_S)));
        droneClimbCharacter(ageS,launchS,climbU,remembered.blocked?0:droneLaunchHeight(ageS),phase,climb);
        climbQuat.setFromEuler(climbEuler.set(climb.pitch,0,climb.roll,'YXZ'));
        launchOrientation.copy(remembered.orientation).multiply(climbQuat);
        flightOrientation.copy(pose.quaternion);pose.quaternion.copy(launchOrientation).slerp(flightOrientation,free);
        if(climb.lift!==0&&!remembered.blocked){
          let overshoot=climb.lift*(1-free);
          const world=overshoot>0?options.world?.():null;
          const hit=world?world.raycast(pose.position,upRay,overshoot+.3):null;
          if(hit)overshoot=Math.max(0,Math.min(overshoot,hit.dist-.3));
          pose.position.y+=overshoot;
        }
      }
      pose.updateMatrix();
      for(const part of pool.parts)part.setMatrixAt(index,pose.matrix);
      const blur=spool>=1&&ageS>=Math.max(BLUR_AFTER_SPOOL,DRONE_SPOOL_S*.9),fading=!blur&&ageS>=FAINT_DISC_S;
      const target=blur?pool.blurs:pool.rotors,base=blur?pool.blurCount:pool.bladeCount;
      for(let n=0;n<4;n++){
        // A disc turns slowly so its faint blade passages shimmer; spooling blades show their real direction.
        poseDroneRotor(prop,n,blur?time*9+n:state.rotorSpin);matrix.multiplyMatrices(pose.matrix,prop.matrix);target.setMatrixAt(base+n,matrix);
        if(fading){poseDroneRotor(prop,n,time*9+n);matrix.multiplyMatrices(pose.matrix,prop.matrix);pool.faint.setMatrixAt(pool.faintCount+n,matrix);}
      }
      if(blur)pool.blurCount+=4;else pool.bladeCount+=4;
      if(fading)pool.faintCount+=4;
      count++;
    },
    end(){
      // Flights that ended in the air this frame begin their flight home (unless an impact claimed them); every flight
      // home advances and draws into the same pools before they are committed.
      for(const [id,state] of attitudes)if(state.seen!==frame){
        const track=tracks.get(id);
        if(!track)options.onReturnEvent?.(id,'skip','no track');
        else if(impacted.has(id))options.onReturnEvent?.(id,'skip','impact');
        else if(options.resolveCarrier)startReturn(id,track);
        attitudes.delete(id);launchFrames.delete(id);tracks.delete(id);
      }
      for(const [id,r] of returns)if(!stepReturn(r))returns.delete(id);
      for(const [id,at] of impacted)if(frame-at>120)impacted.delete(id);
      for(const v of variants.values())for(const pool of [v.full,v.lite]){
        if(!pool)continue;
        for(const part of pool.parts)part.count=pool.count;
        pool.rotors.count=pool.bladeCount;pool.blurs.count=pool.blurCount;pool.faint.count=pool.faintCount;
        for(const mesh of pool.meshes){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;}
      }
    },
    reset(){for(const v of variants.values())for(const pool of [v.full,v.lite])if(pool)for(const mesh of pool.meshes){mesh.count=0;mesh.visible=false;}attitudes.clear();launchFrames.clear();tracks.clear();returns.clear();impacted.clear();},
    /** Diagnostics and tests: the flights home in progress. */
    returning():ReadonlyMap<string|number,{readonly phase:ReturnPhase;readonly pos:THREE.Vector3;readonly t:number}>{return returns;},
    dispose(){
      for(const v of variants.values())for(const pool of [v.full,v.lite]){
        if(!pool)continue;
        for(const mesh of pool.meshes){mesh.removeFromParent();mesh.dispose();}
        pool.lease.release();
      }
      variants.clear();attitudes.clear();launchFrames.clear();tracks.clear();returns.clear();impacted.clear();
    },
  };
}
