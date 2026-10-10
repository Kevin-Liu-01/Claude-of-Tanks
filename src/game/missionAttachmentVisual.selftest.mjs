import assert from 'node:assert/strict';
import { Group, Vector3, Euler, Mesh, BoxGeometry, MeshBasicMaterial, InstancedMesh, Matrix4, Ray } from 'three';
import { syncMissionAttachment, clearMissionAttachment } from './missionAttachmentVisual.ts';
import { missionAttachmentFor, missionAttachmentTurretPivot, DRONE_DOCK_HEIGHT_M } from '../sim/missionAttachment.ts';
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
 const platform=rail.children.find(o=>o.isMesh);platform.geometry.computeBoundingBox();
 assert.ok(platform.geometry.boundingBox.max.y<.07,'low open cradle has no giant pedestal');
 view.active=true;syncMissionAttachment(root,spec,view,false);assert.equal(drone.visible,false);
 syncMissionAttachment(root,spec,view,true);assert.equal(rail.visible,false);
 root.dispatchEvent({type:'removed'});assert.equal(rail.parent,null);
 clearMissionAttachment(root);root.dispatchEvent({type:'removed'});
 assert.ok([...disposal.values()].every(count=>count===1),'every unique dock/airframe GPU resource disposed exactly once');
}
console.log('missionAttachmentVisual: turret/casemate ownership, rotation, scaled parents, launch alignment and disposal passed');

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
