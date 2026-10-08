import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Box3,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {createTank} from '../vehicles/tankFactory.ts';
import {installCanvasFixture} from '../vehicles/canvasFixture.test-support.mjs';
import {getSpec} from '../vehicles/specs.ts';
import {ensureInteriorFills} from '../vehicles/interiorFills.ts';
import {createTankState} from '../sim/movement.ts';
import {casemateGunYaw,casemateGunYawLimit} from '../vehicles/casemateGunPose.ts';
import {collectMissionStock,nativeSupportedSeat,nativeMissionCollision,nativeMissionTakeoffCollision} from '../../tools/mission-attachment-geometry.mjs';
import {limitedGunYawStock} from '../../tools/mission-attachment-yaw-sweep.mjs';
import {missionCradleVolumes,missionAttachmentMotionClear,missionAttachmentSignature,DRONE_DOCK_CRADLE} from '../sim/missionAttachment.ts';

const restoreCanvas = installCanvasFixture();

function geometryHash(tank){const hash=crypto.createHash('sha256');tank.root.traverse(o=>{if(o.geometry?.attributes.position){const p=o.geometry.attributes.position.array;hash.update(new Uint8Array(p.buffer,p.byteOffset,p.byteLength));}});return hash.digest('hex');}
function oldStabilizedAngles(state){
 const extraPitch=state._susp.p*2.2-state._flinch.p,extraRoll=state._susp.r*1.9+state._swayEst*2.4+state._flinch.r;
 if(Math.abs(extraPitch)+Math.abs(extraRoll)<=1e-6)return {yaw:state.turretYaw,pitch:-state.gunPitch};
 const c=Math.cos(state.gunPitch),direction=new Vector3(Math.sin(state.turretYaw)*c,Math.sin(state.gunPitch),Math.cos(state.turretYaw)*c);
 direction.applyQuaternion(new Quaternion().setFromEuler(new Euler(-state.visualPitch,state.yaw,state.visualRoll,'YXZ')));
 direction.applyQuaternion(new Quaternion().setFromEuler(new Euler(-state.visualPitch-extraPitch,state.yaw,state.visualRoll+extraRoll,'YXZ')).invert()).normalize();
 return {yaw:Math.atan2(direction.x,direction.z),pitch:-Math.atan2(direction.y,Math.hypot(direction.x,direction.z))};
}
const cases=[
 [0,0,0,0,0], [.065,.055,.035,.03,-.05],[-.065,-.055,-.035,-.05,.03],
 [0,0,0,2.9,1.3],[.4,-.7,.035,-1.2,2.4],
];
let clipped=0,poses=0;
for(const id of ['jpz_e100_x','strv103','strv103a','udes03','m1a2','leclerc','bmpt_t90']) {
 const spec=getSpec(id),tank=createTank(id,null,{proceduralOnly:true,quality:'low',camoSeed:4242}),state=createTankState(spec,new Vector3(1,2,3),.3);
 const beforeGeometry=geometryHash(tank),turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
 const arc=casemateGunYawLimit(spec),yaws=Number.isFinite(arc)?[-arc,0,arc]:[-2.4,.7,2.8];
 for(const yaw of yaws)for(const pitch of[-.1,.25])for(const [sp,sr,sway,fp,fr]of cases){
  state.turretYaw=yaw;state.gunPitch=pitch;state.visualPitch=.47;state.visualRoll=-.52;
  state._susp.p=sp;state._susp.r=sr;state._swayEst=sway;state._flinch.p=fp;state._flinch.r=fr;
  const previous=JSON.stringify(state),old=oldStabilizedAngles(state);tank.syncFromState(state,0);
  assert.equal(JSON.stringify(state),previous,id+': presentation must not mutate authoritative aiming or body state');
  assert.equal(gun.rotation.x,old.pitch,id+': main elevation and stabilization unchanged');
  if(spec.armor.turretless){assert.ok(Math.abs(turret.rotation.y)<=arc+1e-14,id+': actual fixed trunnion stays in mechanical bearing');if(Math.abs(old.yaw)>arc+1e-6)clipped++;}
  else assert.equal(turret.rotation.y,old.yaw,id+': unrestricted turret pose remains bit-identical to previous solve');
  poses++;
 }
 assert.equal(geometryHash(tank),beforeGeometry,id+': no visible stock buffers are modified by articulation');tank.dispose();
}
assert.ok(clipped>20,'negative control: the old stabilizer would turn fixed bearings through their casemate');
assert.equal(casemateGunYaw({armor:{turretless:true},hydropneumaticAim:{}},.9),0,'hydraulic fixed guns have no hidden swivel');
assert.equal(casemateGunYawLimit({armor:{turretless:true}}),11*Math.PI/180,'same default mechanical arc as movement');
console.log(`missionAttachmentMechanical: ${poses} native poses; ${clipped} prior casing escape witnesses rejected; normal turret/authority parity`);

const signatureSpec=getSpec('jpz_e100_x'),signatureCases={
 arc12:missionAttachmentSignature({...signatureSpec,gunArcDeg:12,hydropneumaticAim:undefined}),
 arc30:missionAttachmentSignature({...signatureSpec,gunArcDeg:30,hydropneumaticAim:undefined}),
 hydraulic:missionAttachmentSignature({...signatureSpec,gunArcDeg:12,hydropneumaticAim:{}}),
};
assert.equal(new Set(Object.values(signatureCases)).size,3,'changing bearing capability must invalidate the native seat receipt');
assert.equal(signatureCases.arc12,missionAttachmentSignature({...signatureSpec,gunArcDeg:12,hydropneumaticAim:undefined}),'identical bearing capability keeps a stable receipt');
assert.equal(casemateGunYaw({armor:{turretless:true}},99),11*Math.PI/180,'omitted bearing retains the canonical movement limit');
assert.equal(casemateGunYaw({armor:{turretless:true},gunArcDeg:12},-99),-12*Math.PI/180,'negative bearing stop stays canonical');
assert.equal(casemateGunYaw({armor:{turretless:false},gunArcDeg:12,hydropneumaticAim:{}},2.9),2.9,'normal turret remains unrestricted even when unrelated spec fields exist');
console.log('missionAttachmentMechanical: freshness negatives '+JSON.stringify(signatureCases));


// Independently sampled native-style stock witnesses must remain inside the
// continuous finite yaw envelope, including the interval interiors and pivot.
const pivot=new Vector3(.13,2.338,.20),source={name:'gun',owner:'turret',bounds:new Box3(new Vector3(-.25,1.8,-.1),new Vector3(.29,3.4,7.05))};
const limit=12*Math.PI/180,stock=limitedGunYawStock(source,pivot,limit),point=new Vector3();let contained=0;
for(let yaw=-limit;yaw<=limit+1e-12;yaw+=limit/71)for(const x of[source.bounds.min.x,source.bounds.max.x])for(const y of[source.bounds.min.y,source.bounds.max.y])for(const z of[source.bounds.min.z,source.bounds.max.z]){
 point.set(x,y,z).sub(pivot).applyMatrix4(new Matrix4().makeRotationY(yaw)).add(pivot);assert.ok(stock.some(r=>r.bounds.containsPoint(point)),'continuous yaw stock contains between-step witness');contained++;
}
assert.ok(!stock.some(r=>r.bounds.containsPoint(new Vector3(0,3.2,-3.6))),'rear roof is outside actual limited gun motion, not filled by an invented full turret annulus');
assert.throws(()=>limitedGunYawStock(source,pivot,Infinity),'normal turret must never be silently converted to a finite arc');
console.log(`missionAttachmentMechanical: ${contained} independent finite-traverse witnesses contained`);

const seat={frame:'turret',x:.07,y:1.3280000162124634,z:.09,...DRONE_DOCK_CRADLE,supportY:Array(4).fill(1.0080000162124634),payloadOffset:[-.24,-.24],braced:true};
const braces=missionCradleVolumes(seat).filter(v=>v.brace);assert.equal(braces.length,4,'both axes have diagonal structural bracing');
assert.equal(missionCradleVolumes({...seat,braced:undefined}).filter(v=>v.brace).length,0,'ordinary mounts keep exactly their previous geometry');
for(const part of braces){const {start,end,thickness}=part.brace,a=new Vector3(...start),b=new Vector3(...end),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),b.clone().sub(a).normalize()),length=a.distanceTo(b),middle=a.add(b).multiplyScalar(.5),box=new Box3(new Vector3(...part.min),new Vector3(...part.max));
 for(const x of[-thickness/2,thickness/2])for(const y of[-length/2,length/2])for(const z of[-thickness/2,thickness/2])assert.ok(box.containsPoint(new Vector3(x,y,z).applyQuaternion(q).add(middle)),'actual rendered diagonal lies within audited finite stock');
}
await ensureInteriorFills(['bmpt_t90']);const spec=getSpec('bmpt_t90');
for(const quality of['high','low'])for(const seed of[4000,4242,8191]){
 const tank=createTank('bmpt_t90',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:seed});tank.root.updateMatrixWorld(true);const stock=collectMissionStock(tank,'turret',-Infinity,false,spec),actual=nativeSupportedSeat(stock,seat,.32);
 assert.ok(actual&&actual.supportY.every((y,i)=>Math.abs(y-seat.supportY[i])<1e-6),'four measured roof feet retained');
 assert.ok(missionAttachmentMotionClear(spec,seat),'complete braced receiver remains clear of auxiliary weapons');
 assert.equal(nativeMissionCollision(stock,seat),null,quality+seed+': actual stand including braces is clear');
 assert.equal(nativeMissionTakeoffCollision(stock,seat),null,quality+seed+': unobstructed full takeoff');
 assert.ok(nativeMissionCollision(stock,{...seat,y:seat.y-.30}),'buried platform negative control');tank.dispose();
}
console.log('missionAttachmentMechanical: braced BMPT stand passes six filled native support/main-gun/takeoff cases');

// The rear casemate roof stays available only because the real final visual
// bearing is now mechanically limited. The full pitch/recoil envelope is kept.
await ensureInteriorFills(['jpz_e100_x']);
const jagdSpec=getSpec('jpz_e100_x'),jagdSeat={frame:'hull',x:-.8,y:3.226012887954712,z:-3.65,...DRONE_DOCK_CRADLE,supportY:Array(4).fill(3.161012887954712)};
for(const quality of['high','low'])for(const seed of[4000,4242,8191]){
 const tank=createTank('jpz_e100_x',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:seed});tank.root.updateMatrixWorld(true);
 const stock=collectMissionStock(tank,'hull',-Infinity,false,jagdSpec),actual=nativeSupportedSeat(stock,jagdSeat,.065);
 assert.ok(actual&&actual.supportY.every((y,i)=>Math.abs(y-jagdSeat.supportY[i])<1e-6),'Jagdpanzer native receiving roof supports every foot');
 assert.ok(missionAttachmentMotionClear(jagdSpec,jagdSeat),'Jagdpanzer auxiliary weapons remain clear');
 assert.equal(nativeMissionCollision(stock,jagdSeat),null,quality+seed+': limited traverse still includes full stabilized pitch and recoil');
 assert.equal(nativeMissionTakeoffCollision(stock,jagdSeat),null,quality+seed+': unobstructed Jagdpanzer lift column');
 assert.ok(nativeMissionCollision(stock,{...jagdSeat,y:jagdSeat.y-.25}),'buried casemate platform negative control');
 tank.dispose();
}
console.log('missionAttachmentMechanical: Jagdpanzer rear roof passes six filled native support/main-gun/takeoff cases');

restoreCanvas();
