import assert from 'node:assert/strict';
import { Group, Vector3, Euler, Mesh, BoxGeometry, MeshBasicMaterial, InstancedMesh, Matrix4, Ray } from 'three';
import { syncMissionAttachment, clearMissionAttachment, missionHoldDownOpen } from './missionAttachmentVisual.ts';
import { DRONE_ARRIVAL, droneArrivalHeight, droneArrivalAttitude } from '../fx/droneArrival.ts';
import { poseDroneRotor } from '../fx/droneModel.ts';
import { Object3D, Quaternion } from 'three';
import { missionAttachmentFor, missionAttachmentTurretPivot, missionCradleVolumes, missionAirframeVolumes, DRONE_DOCK_HEIGHT_M } from '../sim/missionAttachment.ts';
import { missionHoldDownPivots, missionHoldDownMatrix, MISSION_HOLD_DOWN_Y } from './missionCradleGeometry.ts';
const MISSION_ARM_UP = MISSION_HOLD_DOWN_Y + .025;
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
 assert.ok(platform.geometry.boundingBox.max.y<.075,'low open cradle has no giant pedestal (the clamp hinges are its highest point)');
 // Every plate, leg, channel, clamp, cable and foot lies inside the audited finite stock: the cradle's own, or (the skid
 // channels' lips, the clamp posts' tops and their swinging heads) the parked airframe's gear stock, which the native
 // audit certifies with it.
 const volumes=[...missionCradleVolumes(seat),...missionAirframeVolumes(seat)],p=[new Vector3(),new Vector3(),new Vector3()];
 const inStock=(geometry,matrix,label)=>{const pos=geometry.attributes.position;
  for(let i=0;i<pos.count;i+=3){for(let k=0;k<3;k++){p[k].fromBufferAttribute(pos,i+k);if(matrix)p[k].applyMatrix4(matrix);}
   assert.ok(volumes.some(v=>p.every(q=>[0,1,2].every(a=>q.getComponent(a)>=v.min[a]-1e-6&&q.getComponent(a)<=v.max[a]+1e-6))),id+': '+label+' triangle inside certified stock '+p.map(q=>q.toArray().map(n=>n.toFixed(4))));}};
 inStock(platform.geometry,null,'rendered cradle');
 const clamps=rail.getObjectByName('Mission dock hold-down clamps'),clampMatrix=new Matrix4();
 assert.ok(clamps&&clamps.count===4&&clamps.parent===platform,'four quick-release clamps ride with the near dock');
 assert.ok(platform.castShadow&&clamps.castShadow&&drone.getObjectByName('Docked FPV airframe detail').levels[0].object.children.every(m=>m.castShadow),'the near dock, its clamps and the parked airframe cast with the sun');
 assert.equal(missionHoldDownOpen(root),0,'a parked airframe is held down');
 for(let k=0;k<4;k++){clamps.getMatrixAt(k,clampMatrix);inStock(clamps.geometry,clampMatrix,'holding clamp');}
 // The whole flip, every tenth of the way, stays in certified stock; the arm ends standing up, clear of its skid.
 for(const pivot of missionHoldDownPivots(seat))for(let f=0;f<=10;f++)inStock(clamps.geometry,missionHoldDownMatrix(pivot,f/10,clampMatrix),'swinging clamp');
 {const tip=new Vector3(-.038,-.0095,0).applyMatrix4(missionHoldDownMatrix(missionHoldDownPivots(seat)[3],1,clampMatrix));
  assert.ok(tip.y>MISSION_ARM_UP,'an open arm stands up above its hinge, clear of the skid');}
 assert.ok(rail.getObjectByName('Mission dock cradle (far)'),'distant docks draw the audited stock itself');
 view.active=true;syncMissionAttachment(root,spec,view,false);assert.equal(drone.visible,false);
 assert.equal(missionHoldDownOpen(root),1,'the clamps stand clear for a lift-off');
 for(let k=0;k<4;k++){clamps.getMatrixAt(k,clampMatrix);inStock(clamps.geometry,clampMatrix,'open clamp');}
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
 // Round 5: braking down the column from the hand-over speed into a dip below the hover point, the catch, a hover with
 // corrections, the set-down to a gentle contact. It rises only in the catch and the hover (centimetres), never digs in.
 const A=DRONE_ARRIVAL,riseU0=A.brakeEndS/A.descentS,riseU1=A.setDownAtS/A.descentS;
 for(let u=0;u<1;u+=.01){const a=droneArrivalHeight(u),b=droneArrivalHeight(u+.01),catching=u>=riseU0-1e-9&&u<=riseU1+1e-9;
  assert.ok(b>=0&&(b<=a+1e-12||(catching&&b-a<.012)),'the descent never climbs (beyond the catch and the hover\'s corrections) or digs in');}
 assert.equal(droneArrivalHeight(0),A.heightM);assert.equal(droneArrivalHeight(1),0,'touchdown exactly on the pads');
 const slope=(u,h=1e-5)=>(droneArrivalHeight(u+h)-droneArrivalHeight(u-h))/(2*h);
 // the landing starts at the flight home's own descent speed (no stop at the hand-over) and touches at a walking pace
 assert.ok(Math.abs(slope(1e-4)/A.descentS+A.handoffSpeed)<.05,'the landing starts at the hand-over speed');
 assert.ok(Math.abs(slope(riseU0)/A.descentS)<.02&&Math.abs(slope(A.catchEndS/A.descentS)/A.descentS)<.02&&Math.abs(slope(riseU1)/A.descentS)<.05,'braking, the catch and the set-down join without a velocity jump');
 assert.ok(Math.abs(slope(1-1e-4)/A.descentS+A.contactSpeed)<.05,'the skids touch at the contact speed');
 const dip=droneArrivalHeight(A.brakeEndS/A.descentS);assert.ok(Math.abs(dip-(A.hoverM-A.dipM))<1e-9&&droneArrivalHeight(A.catchEndS/A.descentS)>dip+.07,'brakes a little late: a dip below the hover point and a catch');
 // the hover's corrections show (centimetres in height, degrees in attitude) and the airframe is level on the pads
 let hoverSpan=0,maxTilt=0;const att={pitch:0,yaw:0,roll:0};
 for(let t=A.catchEndS;t<A.setDownAtS;t+=.01){const h=droneArrivalHeight(t/A.descentS);hoverSpan=Math.max(hoverSpan,Math.abs(h-A.hoverM));droneArrivalAttitude(t/A.descentS,att);maxTilt=Math.max(maxTilt,Math.abs(att.pitch),Math.abs(att.roll));}
 assert.ok(hoverSpan>.012&&hoverSpan<.04&&maxTilt>.045&&maxTilt<.12,`visible hover corrections (${(hoverSpan*100).toFixed(1)} cm, ${(maxTilt*57.3).toFixed(1)} deg)`);
 droneArrivalAttitude(1,att);assert.ok(Math.abs(att.pitch)<1e-9&&Math.abs(att.roll)<1e-9&&Math.abs(att.yaw)<1e-9,'level and aligned on the pads');
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
 const blades=arrival.children.filter(o=>o.name==='FPV arrival blades'),discs=arrival.children.filter(o=>o.name==='FPV arrival disc');
 assert.equal(blades.length,4);assert.equal(discs.length,4);
 // Round 4b: the full disc in the air; after touchdown the discs fade in steps (each strictly fainter) over the slowing
 // blades, so 0.1 s stills read a spin-down rather than discs-then-stopped.
 const fullDisc=discs[0].geometry,maxAlpha=g=>{const c=g.attributes.color;let m=0;for(let i=0;i<c.count;i++)m=Math.max(m,c.getW(i));return m;};
 const order={discs:0,blend:1,blades:2};let reached=-1,blendFrames=0;const stepsSeen=[];
 while(arrival.visible){
  assert.ok(arrival.position.y>=0&&(arrival.position.y<=last+1e-12||arrival.position.y-last<.012),'descends, with only the hover\'s centimetre corrections');last=arrival.position.y;
  assert.equal(arrival.position.x,0);assert.equal(arrival.position.z,0,'straight down the certified column');
  assert.ok(drone.position.equals(datum),'the launch datum never moves');
  // discs until the skids touch; then discs fading over the showing blades; then the blades alone, never back
  const all=(list,on)=>list.every(m=>m.visible===on),sameDisc=discs.every(m=>m.geometry===discs[0].geometry);
  const phase=all(discs,true)&&all(blades,false)&&discs[0].geometry===fullDisc?'discs':all(discs,true)&&all(blades,true)&&sameDisc&&discs[0].geometry!==fullDisc?'blend':all(discs,false)&&all(blades,true)?'blades':null;
  assert.ok(phase,'one rotor phase at a time: discs, discs fading over blades, or blades');
  if(phase==='blend'){const g=discs[0].geometry;if(stepsSeen.at(-1)!==g){assert.ok(!stepsSeen.includes(g),'the fading discs never repeat a step');if(stepsSeen.length)assert.ok(maxAlpha(g)<maxAlpha(stepsSeen.at(-1))-.05,'each fading step is fainter');stepsSeen.push(g);}}
  assert.ok(order[phase]>=reached,'the spin-down never returns to an earlier phase');reached=order[phase];
  if(phase!=='discs')assert.equal(arrival.position.y,0,'blades show only after touchdown');
  if(phase==='blend')blendFrames++;
  if(phase!=='discs'){spoolFrames++;lastSpin=blades.map(b=>b.matrix.clone());}
  syncMissionAttachment(root,spec,view,false,dt);frames++;
  assert.ok(frames<400,'the landing ends');
 }
 assert.ok(Math.abs(frames*dt-(DRONE_ARRIVAL.descentS+DRONE_ARRIVAL.spoolS+DRONE_ARRIVAL.pauseS))<2*dt,'descent, spool-down and the pause before the clamps take their authored time');
 assert.ok(spoolFrames>30&&detail.visible,'the parked airframe returns after the spool-down');
 assert.ok(blendFrames>=Math.floor(DRONE_ARRIVAL.blendS/dt)-1,'the discs fade over the showing blades for their authored time');
 assert.equal(stepsSeen.length,5,'five fading discs, one after another');
 assert.ok(maxAlpha(stepsSeen[0])<maxAlpha(fullDisc),'the first fading disc is fainter than the flying disc');
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
 for(let i=0,n=Math.ceil((DRONE_ARRIVAL.descentS+DRONE_ARRIVAL.spoolS+DRONE_ARRIVAL.pauseS)/dt)+20;i<n;i++)syncMissionAttachment(root,spec,view,false,dt);
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
