import assert from 'node:assert/strict';
import {Vector3,Quaternion,Group,Mesh,BoxGeometry,MeshBasicMaterial,InstancedMesh,Matrix4,Euler} from 'three';
import {createTank} from '../vehicles/tankFactory.ts';
import {TANK_SPECS} from '../vehicles/specs.ts';
import {ensureInteriorFills} from '../vehicles/interiorFills.ts';
import {createTankState} from '../sim/movement.ts';
import {missionAttachmentPose} from '../sim/missionAttachmentPose.ts';
import {syncMissionAttachment,clearMissionAttachment,missionAttachmentVisualFrame} from './missionAttachmentVisual.ts';
import {collectMissionStock,nativeMissionCollision,nativeMissionTakeoffCollision,nativeSupportedSeat,nativeRoofHeight} from '../../tools/mission-attachment-geometry.mjs';
import {collectMainGunSweep} from '../../tools/mission-attachment-gun-sweep.mjs';
import {initializeAerial,stepAerial} from '../sim/aerialCombat.ts';
import {matchRulesetFor,AERIAL_RULES} from '../sim/matchRuleset.ts';
import {PLAYER_ACTION_BITS} from '../sim/playerActions.ts';
import {createDronePresentation} from '../fx/dronePresentation.ts';
import {droneLaunchHeight} from '../sim/droneLaunch.ts';
// Saved physical failure positions must remain rejected after the generated
// table moves. These are not fetched from the same policy being tested.
const oldSeats={
 abramsx:[.5484,1.4272579645,3.53785],leo2a7v:[.54075,1.44973331666,3.569],
 cn_t72b3m_modern:[0,1.40031006305,2.374],m551a1_tts:[-.003,1.25949999582,2.745],
 t90a_vladimir_x:[0,1.1784657171,3.1686],
};
for(const[id,[x,y,z]]of Object.entries(oldSeats)){
 await ensureInteriorFills([id]);const spec=TANK_SPECS[id],tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4000});tank.root.updateMatrixWorld(true);
 const seat={frame:'hull',x,y,z,width:.34,depth:.32,footX:.108,footZ:.09,supportY:Array(4).fill(y-.045)};
 const stock=collectMissionStock(tank,'hull',-Infinity,false,spec);
 assert.ok(nativeMissionCollision(stock,seat),id+': old dock intersects full cannon motion');
 if(['cn_t72b3m_modern','m551a1_tts','t90a_vladimir_x'].includes(id))assert.ok(nativeMissionTakeoffCollision(stock,seat),id+': old seat lacks a clear takeoff corridor');
 tank.dispose();
}
console.log('missionAttachmentMotion: five saved main-gun failures and three takeoff failures rejected');
// Independent dense stock witnesses between authored sweep angles, through
// recoil, nonuniform native parent scales, and transformed native instances.
const root=new Group(),turret=new Group(),gun=new Group(),recoil=new Group();turret.name='rig_turret';gun.name='rig_gun';recoil.name='rig_recoil';root.add(turret);turret.add(gun);gun.add(recoil);turret.position.set(.1,1.3,-.2);turret.scale.set(.8,.9,1.1);gun.position.set(.08,.4,.7);gun.scale.set(.95,1.08,.87);
const material=new MeshBasicMaterial(),tube=new Mesh(new BoxGeometry(.14,.16,2.7),material);tube.position.z=1.1;recoil.add(tube);
const instances=new InstancedMesh(new BoxGeometry(.1,.08,.5),material,2);instances.setMatrixAt(0,new Matrix4().makeTranslation(.18,.12,.9));instances.setMatrixAt(1,new Matrix4().makeTranslation(-.2,-.1,1.5));recoil.add(instances);root.updateMatrixWorld(true);
gun.rotation.y=.13;gun.rotation.z=-.08;root.updateMatrixWorld(true);
const spec={gunDepressionDeg:11,gunElevationDeg:28,gun:{caliberMm:120}},rows=collectMainGunSweep({root},spec,new Matrix4(),o=>o.isMesh);
const point=new Vector3(),matrix=new Matrix4();let samples=0;
for(let pitch=-90;pitch<=90.8;pitch+=.79)for(const stroke of[0,.023,.067,.13]){
 gun.rotation.x=-pitch*Math.PI/180;recoil.position.z=-stroke;root.updateMatrixWorld(true);
 for(const mesh of[tube,instances])for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
  matrix.copy(mesh.matrixWorld);if(mesh.isInstancedMesh){const local=new Matrix4();mesh.getMatrixAt(i,local);matrix.multiply(local);}
  const p=mesh.geometry.attributes.position;for(let v=0;v<p.count;v++){point.fromBufferAttribute(p,v).applyMatrix4(matrix);assert.ok(rows.some(r=>r.bounds.containsPoint(point)),'full finite pitch/recoil stock contains native witness between samples');samples++;}
 }
}
// A seated drone above a neutral tube but inside its elevated path is rejected;
// removing all gun stock is the explicit policy-negative control.
assert.ok(rows.length>100);assert.equal([].some(r=>r.bounds.containsPoint(point)),false);
console.log('missionAttachmentMotion: '+samples+' independent continuous-sweep vertex witnesses enclosed');
root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});material.dispose();
// Permanent armor may support a dock, but replaceable equipment cannot.
// Exercise the exact finite Kunlun region and foot insertion with independently
// authored solid steel; changing the ID, mesh role or patch must reject it.
// The fixture carriers have the shape collectMissionStock reads (an id and a
// turreted armor record, as in mission-attachment-support.selftest.mjs): the
// casemate traverse limit reads spec.armor before any dock is measured.
{
 const root=new Group(),turret=new Group();turret.name='rig_turret';root.add(turret);
 const steel=new Mesh(new BoxGeometry(.50,.06,.70),new MeshBasicMaterial());
 steel.name='turretExternalArmor';steel.position.set(-1.39,.70,-.45);turret.add(steel);root.updateMatrixWorld(true);
 const spec={id:'cn_t72b3m_modern',armor:{turretless:false}},candidate={frame:'turret',x:-1.40,z:-.45,width:.34,depth:.32,footX:.108,footZ:.09};
 const stock=collectMissionStock({root},'turret',-Infinity,false,spec),seat=nativeSupportedSeat(stock,candidate);
 assert.ok(seat,'four feet seat on the known welded housing');
 assert.ok(Math.abs(seat.supportY[0]-.73)<1e-7);assert.equal(nativeMissionCollision(stock,seat),null,'only the finite foot insertion is allowed');
 assert.equal(nativeRoofHeight(stock,-1.59,-.45),-Infinity,'full pad footprint must fit inside the structural support region');
 assert.equal(nativeSupportedSeat(collectMissionStock({root},'turret',-Infinity,false,{id:'unrelated',armor:{turretless:false}}),candidate),null,'unrelated external armor is not automatically support');
 steel.name='turretDetail';root.updateMatrixWorld(true);
 assert.equal(nativeSupportedSeat(collectMissionStock({root},'turret',-Infinity,false,spec),candidate),null,'a service crate cannot masquerade as structural armor');
 steel.geometry.dispose();steel.material.dispose();
}
console.log('missionAttachmentMotion: permanent welded support, finite feet and equipment/region negative controls passed');
for(const id of['m1a2','abramsx','leo2a7v']){
 const spec=TANK_SPECS[id],tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4000}),state=createTankState(spec,new Vector3(4,1,9),.3);
 syncMissionAttachment(tank.root,spec,{kind:'drone',active:false,cooldownS:0},false);
 const parked=tank.root.getObjectByName('Docked FPV mission payload'),position=new Vector3(),orientation=new Quaternion();
 for(const yaw of[0,.7,-1.8])for(const rocking of[false,true]){
  state.turretYaw=yaw;state.gunPitch=.1;state.visualPitch=.03;state.visualRoll=-.02;
  state._susp.p=rocking?.025:0;state._susp.r=rocking?-.032:0;state._swayEst=rocking?.035:0;state._flinch.p=rocking?.008:0;state._flinch.r=rocking?-.009:0;
  tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);missionAttachmentPose(spec,state,position,orientation);
  assert.ok(position.distanceTo(parked.getWorldPosition(new Vector3()))<.00011,id+': deterministic position matches live stabilized/rocking native dock');
  assert.ok(orientation.angleTo(parked.getWorldQuaternion(new Quaternion()))<1e-7,id+': launch axes match live dock');
 }
 const entity={id,team:'alpha',spec,state,combat:{destroyed:false},input:{auxiliaryBits:PLAYER_ACTION_BITS.DRONE,throttle:0,steer:0,fire:false,brake:false,aimPoint:new Vector3(0,20,50)}};
 initializeAerial(entity,matchRulesetFor('drone'));let shell;stepAerial(entity,0,1/60,()=>5,s=>{shell=s;});assert.ok(shell.pos.distanceTo(position)<1e-8);
 const world=new Group(),presentation=createDronePresentation(world),frame=missionAttachmentVisualFrame(tank.root);
 for(let tick=0;tick<144;tick++){
  const age=tick/60;state.pos.x+=.01;state.turretYaw+=.001;state._susp.p=.02*Math.sin(age*3);
  tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);stepAerial(entity,age,1/60,()=>5,()=>{});shell.pos.addScaledVector(shell.vel,1/60);
  missionAttachmentPose(spec,state,position,orientation);const relative=shell.pos.clone().sub(position).applyQuaternion(orientation.clone().invert());
  assert.ok(Math.hypot(relative.x,relative.z)<1e-8,id+': moving-carrier launch stays inside its certified vertical corridor');
  presentation.begin(20+age);presentation.write(shell.pos,shell.vel,5,entity.aerial.yaw,age,spec.nation,frame);presentation.end();
  const body=world.children[0],actual=new Matrix4();body.getMatrixAt(0,actual);const actualPosition=new Vector3(),actualOrientation=new Quaternion();actual.decompose(actualPosition,actualOrientation,new Vector3());
  assert.ok(actualPosition.distanceTo(shell.pos)<.00011,'no bob displaces payload during launch');assert.ok(actualOrientation.angleTo(orientation)<1e-3,'airborne kit retains the real dock orientation until clear');
 }
 clearMissionAttachment(tank.root);tank.dispose();
}
console.log('missionAttachmentMotion: live suspension/stabilization origin, orientation and moving-carrier takeoff passed');
// A delayed render pose may differ from the fixed-step owner. Both ends of the
// launch must be continuous, while the offset must disappear in free flight.
{
 const world=new Group(),presentation=createDronePresentation(world),dock=new Group();
 dock.position.set(.24,1.8,-.12);dock.rotation.set(.08,.4,-.06);dock.updateMatrixWorld(true);
 const q=dock.getWorldQuaternion(new Quaternion()),velocity=new Vector3(),bias=new Vector3(.24,0,-.12),position=new Vector3(),actual=new Matrix4();
 const read=()=>{world.children[0].getMatrixAt(0,actual);return new Vector3().setFromMatrixPosition(actual);};
 const pose=(age)=>{
  position.copy(dock.position).add(new Vector3(0,droneLaunchHeight(age),0).applyQuaternion(q)).sub(bias);
  presentation.begin(40+age);presentation.write(position,velocity,'delayed',.4,age,'USA',dock);presentation.end();return read();
 };
 const before=pose(AERIAL_RULES.drone.launchS-1e-6),after=pose(AERIAL_RULES.drone.launchS);
 assert.ok(before.distanceTo(after)<1e-5,'no position snap when the delayed dock hands off to authoritative free flight');
 const free=pose(AERIAL_RULES.drone.launchS+.4);
 assert.ok(Math.hypot(free.x-position.x,free.z-position.z)<1e-5,'launch offset is retired, never accumulated into flight authority');
 presentation.reset();
}
console.log('missionAttachmentMotion: delayed live-frame launch/free-flight handoff stays continuous');
