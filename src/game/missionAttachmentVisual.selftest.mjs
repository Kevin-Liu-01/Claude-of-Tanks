import assert from 'node:assert/strict';
import { Group, Vector3, Euler, Mesh, BoxGeometry, MeshBasicMaterial, InstancedMesh, Matrix4, Ray } from 'three';
import { syncMissionAttachment, clearMissionAttachment, DRONE_ARRIVAL, droneArrivalHeight } from './missionAttachmentVisual.ts';
import { poseDroneRotor } from '../fx/droneModel.ts';
import { Object3D, Quaternion } from 'three';
import { missionAttachmentFor, missionAttachmentTurretPivot, missionCradleVolumes, DRONE_DOCK_HEIGHT_M } from '../sim/missionAttachment.ts';
import {createTank} from '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import {initializeAerial,stepAerial} from '../sim/aerialCombat.ts';
import {matchRulesetFor} from '../sim/matchRuleset.ts';
import {PLAYER_ACTION_BITS} from '../sim/playerActions.ts';
import { collectMissionStock,nativeMissionCollision,nativeSupportedSeat,nativeRoofHeight } from '../../tools/mission-attachment-geometry.mjs';
for(const id of ['m1a2','kf41_lynx_x','strv103'])for(const scale of [1,.8]){
 const spec=TANK_SPECS[id],seat=missionAttachmentFor(spec),root=new Group(),turret=new Group();
 root.position.set(10,2,20);root.rotation.set(-.12,.6,-.08,'YXZ');
 turret.name='rig_turret';turret.position.set(...missionAttachmentTurretPivot(spec));turret.scale.setScalar(scale);root.add(turret);
 const view={kind:'drone',active:false,cooldownS:0};
 syncMissionAttachment(root,spec,view,false);
 const rail=root.getObjectByName('Reusable mission payload rail'),drone=root.getObjectByName('Docked FPV mission payload');
 assert.equal(rail.parent,seat.frame==='turret'?turret:root);
 for(const yaw of [0,Math.PI/2,-2.1]){
  turret.rotation.y=yaw;root.updateMatrixWorld(true);
  const expected=new Vector3(seat.x+(seat.payloadOffset?.[0]??0),seat.y+DRONE_DOCK_HEIGHT_M,seat.z+(seat.payloadOffset?.[1]??0));
  if(seat.frame==='turret')expected.applyEuler(new Euler(0,yaw,0)).add(new Vector3(...missionAttachmentTurretPivot(spec)));
  expected.applyEuler(root.rotation).add(root.position);
  assert.ok(drone.getWorldPosition(new Vector3()).distanceTo(expected)<1e-8,`${id}: visual follows launch datum at ${yaw}, parent scale ${scale}`);
 }
 const disposal=new Map();
 rail.traverse(o=>{if(!o.isMesh)return;for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])]){if(disposal.has(resource))continue;disposal.set(resource,0);resource.addEventListener('dispose',()=>disposal.set(resource,disposal.get(resource)+1));}});
 const platform=rail.getObjectByName('Mission dock cradle');platform.geometry.computeBoundingBox();
 assert.ok(platform.geometry.boundingBox.max.y<.07,'low open cradle has no giant pedestal');
 // Every welded member, saddle, latch, cable and foot lies inside the audited finite cradle stock.
 const volumes=missionCradleVolumes(seat),p=[new Vector3(),new Vector3(),new Vector3()],pos=platform.geometry.attributes.position;
 for(let i=0;i<pos.count;i+=3){for(let k=0;k<3;k++)p[k].fromBufferAttribute(pos,i+k);
  assert.ok(volumes.some(v=>p.every(q=>[0,1,2].every(a=>q.getComponent(a)>=v.min[a]-1e-6&&q.getComponent(a)<=v.max[a]+1e-6))),id+': rendered cradle triangle inside certified stock');}
 assert.ok(rail.getObjectByName('Mission dock cradle (far)'),'distant docks draw the audited stock itself');
 view.active=true;syncMissionAttachment(root,spec,view,false);assert.equal(drone.visible,false);
 // A wreck keeps its dock, charred with the hull; the payload is gone.
 view.active=false;syncMissionAttachment(root,spec,view,true);assert.equal(rail.visible,true);assert.equal(drone.visible,false);
 assert.ok(platform.material.color.getHex()<0x404040,'burnt-out carrier chars its dock');
 syncMissionAttachment(root,spec,view,false);assert.equal(drone.visible,true);assert.equal(platform.material.color.getHex(),0xffffff,'a revived carrier restores the painted dock');
 root.dispatchEvent({type:'removed'});assert.equal(rail.parent,null);
 clearMissionAttachment(root);root.dispatchEvent({type:'removed'});
 assert.ok([...disposal.values()].every(count=>count===1),'every unique dock/airframe GPU resource disposed exactly once');
}
console.log('missionAttachmentVisual: turret/casemate ownership, rotation, scaled parents, launch alignment, certified cradle stock, charred wreck and disposal passed');

// Resupply landing: on the not-ready -> ready edge the next airframe settles down the dock's launch column (vertical, never
// sideways into the carrier's kit), brakes into a short hover, touches down and spools its props to the parked pose.
{
 for(let u=0;u<1;u+=.01){const a=droneArrivalHeight(u),b=droneArrivalHeight(u+.01);assert.ok(b<=a+1e-12&&b>=0,'the descent never climbs or digs in');}
 assert.equal(droneArrivalHeight(0),DRONE_ARRIVAL.heightM);assert.equal(droneArrivalHeight(1),0,'touchdown exactly on the pads');
 const slope=(u,h=1e-5)=>(droneArrivalHeight(u+h)-droneArrivalHeight(u-h))/(2*h);
 assert.ok(Math.abs(slope(.75))<1e-3&&Math.abs(slope(1-1e-4))<1e-2,'braking hover and touchdown arrive without a velocity jump');
 const spec=TANK_SPECS.m1a2,root=new Group(),turret=new Group();turret.name='rig_turret';turret.position.set(...missionAttachmentTurretPivot(spec));root.add(turret);
 const view={kind:'drone',active:false,cooldownS:0},dt=1/60;
 syncMissionAttachment(root,spec,view,false,dt);
 const drone=root.getObjectByName('Docked FPV mission payload'),detail=root.getObjectByName('Docked FPV airframe detail'),datum=drone.position.clone();
 assert.equal(root.getObjectByName('Docked FPV arrival'),undefined,'a carrier first seen ready shows its parked airframe, no landing');
 view.cooldownS=3;syncMissionAttachment(root,spec,view,false,dt);assert.equal(drone.visible,false,'empty cradle while the payload is away');
 view.cooldownS=0;syncMissionAttachment(root,spec,view,false,dt);
 const arrival=root.getObjectByName('Docked FPV arrival');
 assert.ok(arrival?.visible&&!detail.visible,'the ready edge starts the landing in place of the parked airframe');
 assert.equal(arrival.position.y,DRONE_ARRIVAL.heightM,'the landing begins up the launch column');
 let last=Infinity,frames=0,spoolFrames=0,lastSpin=null;
 const blades=arrival.children.filter(o=>o.geometry&&o.material?.name?.endsWith('propellers')),discs=arrival.children.filter(o=>o.material?.name?.endsWith('rotor blur'));
 assert.equal(blades.length,4);assert.equal(discs.length,4);
 while(arrival.visible){
  assert.ok(arrival.position.y<=last+1e-12&&arrival.position.y>=0,'monotone descent');last=arrival.position.y;
  assert.equal(arrival.position.x,0);assert.equal(arrival.position.z,0,'straight down the certified column');
  assert.ok(drone.position.equals(datum),'the launch datum never moves');
  const atSpeed=discs.every(d=>d.visible)&&blades.every(b=>!b.visible),spooling=blades.every(b=>b.visible)&&discs.every(d=>!d.visible);
  assert.ok(atSpeed!==spooling,'rotors either at speed (discs) or spooling down (blades), never both');
  if(spooling){assert.equal(arrival.position.y,0,'blades show only after touchdown');spoolFrames++;lastSpin=blades.map(b=>b.matrix.clone());}
  else assert.ok(spoolFrames===0,'no return to speed after touchdown');
  syncMissionAttachment(root,spec,view,false,dt);frames++;
  assert.ok(frames<400,'the landing ends');
 }
 assert.ok(Math.abs(frames*dt-(DRONE_ARRIVAL.descentS+DRONE_ARRIVAL.spoolS))<2*dt,'descent and spool-down take their authored time');
 assert.ok(spoolFrames>30&&detail.visible,'the parked airframe returns after the spool-down');
 const parked=new Object3D(),q=new Quaternion(),qp=new Quaternion();
 for(let i=0;i<4;i++){poseDroneRotor(parked,i,0);lastSpin[i].decompose(new Vector3(),q,new Vector3());parked.matrix.decompose(new Vector3(),qp,new Vector3());
  assert.ok(q.angleTo(qp)<2e-3,'props stop at the parked angle: no pop when the parked airframe takes over');}
 // A launch in the middle of a landing hands straight to the flight from the datum; the next ready edge lands again.
 view.cooldownS=2;syncMissionAttachment(root,spec,view,false,dt);view.cooldownS=0;syncMissionAttachment(root,spec,view,false,dt);
 for(let i=0;i<20;i++)syncMissionAttachment(root,spec,view,false,dt);
 assert.ok(arrival.visible&&arrival.position.y>0,'second landing under way');
 view.active=true;syncMissionAttachment(root,spec,view,false,dt);assert.equal(drone.visible,false,'launch takes over at once');
 assert.equal(arrival.visible,false,'the landing ends when the flight takes the airframe');
 view.active=false;view.cooldownS=5;syncMissionAttachment(root,spec,view,false,dt);assert.equal(drone.visible,false,'empty cradle through the next cooldown');
 view.cooldownS=0;syncMissionAttachment(root,spec,view,false,dt);
 assert.ok(arrival.visible&&arrival.position.y===DRONE_ARRIVAL.heightM,'the next resupply lands from the top again');
 for(let i=0;i<200;i++)syncMissionAttachment(root,spec,view,false,dt);
 assert.ok(!arrival.visible&&detail.visible,'ready frames after a landing never restart it');
 // A destroyed carrier and its revival: the payload is gone with the wreck and lands again on the revived hull.
 syncMissionAttachment(root,spec,view,true,dt);assert.equal(drone.visible,false);
 syncMissionAttachment(root,spec,view,false,dt);assert.ok(arrival.visible,'resupply lands on the revived carrier');
 clearMissionAttachment(root);
}
console.log('missionAttachmentVisual: resupply landing down the certified column, braking hover, touchdown, spool-down to the parked pose, launch hand-off and revival passed');

// Use real factory rigs, not a rig synthesized from the same armor pivot as the
// authority. Legacy armor reference pivots differ from the visible owner.
for(const id of ['m1a2','t90m','amx56','strv103','leo2a7v']){
 const spec=TANK_SPECS[id],tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4000});
 tank.root.position.set(10,2,20);tank.root.rotation.set(-.12,.6,-.08,'YXZ');
 const turret=tank.root.getObjectByName('rig_turret');
 for(const turretYaw of [0,Math.PI/2,-2.1]){
  if(turret)turret.rotation.y=turretYaw;
  syncMissionAttachment(tank.root,spec,{kind:'drone',active:false,cooldownS:0},false);tank.root.updateMatrixWorld(true);
  const parked=tank.root.getObjectByName('Docked FPV mission payload').getWorldPosition(new Vector3());
  const entity={id,team:'alpha',spec,state:{pos:tank.root.position.clone(),yaw:.6,turretYaw,visualPitch:.12,visualRoll:-.08,speed:0},combat:{destroyed:false},input:{auxiliaryBits:PLAYER_ACTION_BITS.DRONE,throttle:0,steer:0,fire:false,brake:false,aimPoint:new Vector3()}};
  initializeAerial(entity,matchRulesetFor('drone'));let shell;
  stepAerial(entity,0,1/60,()=>1,s=>{shell=s;});
  assert.ok(shell&&shell.pos.distanceTo(parked)<1e-8,`${id}: actual native dock and authoritative launch match at yaw ${turretYaw}`);
 }
 clearMissionAttachment(tank.root);tank.dispose();
}
console.log('missionAttachmentVisual: actual factory pivots match authoritative launches');

// Audit negative controls use actual native triangles, not armor proxies or a
// second call to the placement policy. Support insertion is finite and owned.
const fixtureRoot=new Group(),fixtureTurret=new Group();fixtureTurret.name='rig_turret';fixtureRoot.add(fixtureTurret);
const fixtureMaterial=new MeshBasicMaterial();
const fixtureBox=(name,w,h,d,x,y,z,parent=fixtureRoot)=>{
 const mesh=new Mesh(new BoxGeometry(w,h,d),fixtureMaterial);mesh.name=name;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
};
fixtureBox('hull',3,.2,3,0,0,0);
const fixtureSeat={frame:'hull',x:0,y:.145,z:0,width:.34,depth:.32,footX:.108,footZ:.09,supportY:[.1,.1,.1,.1]};
const audit=seat=>{fixtureRoot.updateMatrixWorld(true);return nativeMissionCollision(collectMissionStock({root:fixtureRoot},'hull'),seat);};
fixtureRoot.updateMatrixWorld(true);
const supportStock=collectMissionStock({root:fixtureRoot},'hull'),supportRay=new Ray(new Vector3(),new Vector3(0,-1,0)),supportHit=new Vector3();
for(let x=-1.75;x<=1.75;x+=.125)for(let z=-1.75;z<=1.75;z+=.125){
 supportRay.origin.set(x,30,z);let exhaustive=-Infinity;
 for(const row of supportStock.support)if(supportRay.intersectTriangle(row.tri.a,row.tri.b,row.tri.c,false,supportHit))exhaustive=Math.max(exhaustive,supportHit.y);
 assert.equal(nativeRoofHeight(supportStock,x,z),exhaustive,'spatial roof index preserves exhaustive finite support, including bin boundaries and empty space');
}
assert.ok(nativeSupportedSeat(collectMissionStock({root:fixtureRoot},'hull'),fixtureSeat),'four real roof contacts accepted');
assert.equal(audit(fixtureSeat),null,'open cradle and supported drone clear the native roof');
assert.ok(audit({...fixtureSeat,y:fixtureSeat.y-.3}),'payload buried in actual roof rejected');
const rotorObstruction=fixtureBox('equipment',.06,.06,.06,.216,.34,.216);
assert.equal(audit(fixtureSeat)?.mesh,'equipment','real rotor/motor obstacle rejected');rotorObstruction.removeFromParent();rotorObstruction.geometry.dispose();
const visibleFill=fixtureBox('hullInteriorFill',.06,.06,.06,.216,.34,.216);
assert.equal(audit(fixtureSeat)?.mesh,'hullInteriorFill','visible fill protruding into drone air is not waived');visibleFill.removeFromParent();visibleFill.geometry.dispose();
const instanced=new InstancedMesh(new BoxGeometry(.06,.06,.06),fixtureMaterial,2);instanced.name='instancedEquipment';
instanced.setMatrixAt(0,new Matrix4().makeTranslation(2,2,2));instanced.setMatrixAt(1,new Matrix4().makeTranslation(.216,.34,.216));fixtureRoot.add(instanced);
assert.equal(audit(fixtureSeat)?.mesh,'instancedEquipment','native instance transform is included');instanced.removeFromParent();instanced.geometry.dispose();
const enclosing=fixtureBox('enclosedStock',2,2,2,0,.3,0);
assert.equal(audit(fixtureSeat)?.kind,'contained','entirely enclosed volume rejected without triangle crossing');enclosing.removeFromParent();enclosing.geometry.dispose();
const sweeping=fixtureBox('turningEquipment',.025,.03,.025,.65,.34,0,fixtureTurret);
assert.equal(audit({...fixtureSeat,z:-.65})?.kind,'opposite-owner yaw sweep','clear rest pose still rejects equipment sweeping into dock');
fixtureRoot.traverse(o=>{if(o.isMesh)o.geometry.dispose();});fixtureMaterial.dispose();
console.log('missionAttachmentVisual: real native support, surface/contained obstruction and continuous opposite-owner yaw negative controls passed');
