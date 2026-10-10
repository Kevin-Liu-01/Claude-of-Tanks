import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { createSpottingSystem } from './spotting.ts';
import { initializeAerial, stepAerial } from './aerialCombat.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { missionAttachmentFor, missionAttachmentFootHeight, missionAttachmentClear, missionAttachmentMotionClear, missionAttachmentSignature, missionAttachmentTurretPivot, missionCradleVolumes, DRONE_DOCK_HEIGHT_M } from './missionAttachment.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { Vector3, Euler, Matrix4, Quaternion, Box3 } from 'three';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { missionAirframeVolumes } from './missionAttachment.ts';
import '../vehicles/tankFactory.ts';
import { MISSION_ATTACHMENT_SEATS } from './missionAttachmentSeats.generated.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
// A renderer may add running-gear bookkeeping after authority registration;
// it must never move the drone's shared launch point. Real roof/datum changes
// must invalidate the record so the native audit is rerun.
const signatureFixture=structuredClone(TANK_SPECS.m1a2),baseSignature=missionAttachmentSignature(signatureFixture);
signatureFixture.armor.trackShapes=[{min:[-9,-9,-9],max:[9,9,9]}];
assert.equal(missionAttachmentSignature(signatureFixture),baseSignature,'renderer track bookkeeping cannot invalidate a launch datum');
signatureFixture.armor.turretPivot[1]+=.02;
assert.notEqual(missionAttachmentSignature(signatureFixture),baseSignature,'changed turret pivot invalidates native support');
const roofFixture=structuredClone(TANK_SPECS.m1a2);
roofFixture.armor.turretPlates[0].verts[0][1]+=.02;
assert.notEqual(missionAttachmentSignature(roofFixture),baseSignature,'changed roof stock invalidates native support');
// Load the authority's spec-only facade in a fresh process. Registration order
// cannot quietly select a fallback origin instead of the browser's native seat.
const authorityScript=`const {ensureAuthorityFleet}=await import('./src/vehicles/authorityFleet.ts');await ensureAuthorityFleet();const {TANK_SPECS}=await import('./src/vehicles/specs.ts');const {missionAttachmentSignature,missionAttachmentFor}=await import('./src/sim/missionAttachment.ts');console.log(JSON.stringify(Object.fromEntries(Object.entries(TANK_SPECS).map(([id,s])=>[id,{signature:missionAttachmentSignature(s),seat:missionAttachmentFor(s)}]))));`;
const authority=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',authorityScript],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',maxBuffer:2_000_000}));
let count=0;
for(const spec of Object.values(TANK_SPECS)){
 const record=MISSION_ATTACHMENT_SEATS[spec.id];assert.ok(record,spec.id+': native seat record required');
 assert.equal(authority[spec.id].signature,record.signature,spec.id+': authority and renderer agree on geometry signature');
 assert.deepEqual(authority[spec.id].seat,record,spec.id+': authority uses the identical certified seat');
 assert.equal(record.signature,missionAttachmentSignature(spec),spec.id+': stale native seat; regenerate after geometry changes');
 const seat=missionAttachmentFor(spec);assert.equal(seat,record,spec.id+': authority uses certified native datum');assert.ok(Number.isFinite(seat.y),spec.id);
 if(spec.armor.turretless)assert.equal(seat.frame,'hull',spec.id);
 if(spec.id==='m1a2')assert.equal(seat.frame,'turret');
 assert.ok(missionAttachmentMotionClear(spec,seat),spec.id+': native-certified finite payload and cradle clear complete roof-gun sweep');
 // Buried-payload rejection is verified against actual filled render stock by
 // the native generator and visual fixture. Armor reference proxies can sit
 // below a vehicle's real roof, so they cannot certify native-seat contact.
 // A foot sits at most the cradle rise plus the .10 m support spread below the dock: .125 m for a standard cradle,
 // .35 m for an authored braced stand (tools/mission-attachment-seat-trials.mjs; the BMPT's is certified with its
 // diagonal braces by missionAttachmentMechanical.selftest).
 const maxFootGap=(seat.braced?.35:.125)+.101;
 for(const dx of[-seat.footX,seat.footX])for(const dz of[-seat.footZ,seat.footZ]){const height=missionAttachmentFootHeight(spec,seat,(dx<0?0:2)+(dz<0?0:1));assert.ok(Number.isFinite(height)&&seat.y-height>=.044&&seat.y-height<=maxFootGap,`${spec.id}: every foot seats on its owner`);}
 for(const turretYaw of [0,Math.PI/2,-2.1]){
 const e={id:spec.id,team:'alpha',spec,state:{pos:new Vector3(10,0,20),yaw:.6,turretYaw,visualPitch:.12,visualRoll:-.08,speed:0},combat:{destroyed:false},input:{auxiliaryBits:PLAYER_ACTION_BITS.DRONE,throttle:0,steer:0,fire:false,brake:false,aimPoint:new Vector3()}};
 initializeAerial(e,matchRulesetFor('drone'));let shell;
 stepAerial(e,0,1/60,()=>1,s=>{shell=s;});
 assert.ok(shell);const expected=new Vector3(seat.x+(seat.payloadOffset?.[0]??0),seat.y+DRONE_DOCK_HEIGHT_M,seat.z+(seat.payloadOffset?.[1]??0));
 if(seat.frame==='turret')expected.applyEuler(new Euler(0,turretYaw,0)).add(new Vector3(...missionAttachmentTurretPivot(spec)));
 expected.applyEuler(new Euler(-.12,.6,-.08,'YXZ')).add(e.state.pos);
 assert.ok(shell.pos.distanceTo(expected)<1e-8,`${spec.id}: launch matches turned turret and tilted hull`);
 assert.equal(e.aerial.yaw,.6+(seat.frame==='turret'?turretYaw:0));
 assert.equal(shell.vel.length(),0,'motors spool up from rest');}
 count++;
}
// Independently replay the runtime's actual scaled/quaternion mount transform.
// Checking swept stock vertices against a chosen position cannot be replaced by
// an assertion that simply re-calls the placement predicate.
let weaponPoses=0;
for(const spec of Object.values(TANK_SPECS)){
 const seat=missionAttachmentFor(spec);
 const docks=[...missionAirframeVolumes(seat,true),...missionCradleVolumes(seat)].map(v=>new Box3(new Vector3(...v.min),new Vector3(...v.max)).translate(new Vector3(seat.x,seat.y,seat.z)));
 for(const gun of auxiliaryCapabilities(spec)?.guns??[]){
  assert.ok(gun.collisionParts?.length,spec.id+': controlled gun has finite stock');
  const policy=auxiliaryWeaponProfile(gun.caliberMm,spec.id);
  for(const turretYaw of [0,.61,1.9,-2.7]){
   const turretFrame=new Matrix4().makeRotationY(turretYaw).setPosition(...missionAttachmentTurretPivot(spec));
   const seatFrame=seat.frame==='turret'?turretFrame:new Matrix4();
   for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/12)for(const pitch of [-policy.depressionRad,0,policy.elevationRad]){
    const mount=new Matrix4().compose(new Vector3(...gun.position),new Quaternion(...gun.rotation).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw)),new Vector3(...gun.scale));
    const transform=new Matrix4().copy(seatFrame).invert().multiply(gun.owner==='turret'?turretFrame:new Matrix4()).multiply(mount)
     .multiply(new Matrix4().makeTranslation(...gun.pivot)).multiply(new Matrix4().makeRotationX(-pitch));
    for(const part of gun.collisionParts){
     // OBB.applyMatrix4 only adds the matrix translation to the centre; it never rotates it. Build the box about the
     // origin and carry its centre in the matrix, or an off-centre barrel is mirrored when the mount turns.
     const box=new Box3(new Vector3(...part.min),new Vector3(...part.max)),center=box.getCenter(new Vector3());
     const actual=new OBB(new Vector3(),box.getSize(new Vector3()).multiplyScalar(.5)).applyMatrix4(transform.clone().multiply(new Matrix4().makeTranslation(center.x,center.y,center.z)));
     assert.ok(docks.every(dock=>!actual.intersectsBox3(dock)),`${spec.id}: roof weapon stock clears drone at turret ${turretYaw}, roof yaw ${yaw}, elevation ${pitch}`);
    }
    weaponPoses++;
   }
  }
 }
}
// Adversarial fixture: a low gun can cross a roof seat between its cardinal yaw
// poses. A complete swept-volume policy must reject that otherwise supported seat.
const armed=TANK_SPECS.m1a2,gun=auxiliaryCapabilities(armed).guns[0];
{
 // The replay places each part where its turned mount carries it (the 2026-10-08 OBB-centre defect mirrored a
 // rear-facing barrel forward through T-72B3M's dock): the turned centre is exact and a dock on it is hit.
 const part=gun.collisionParts[0],box=new Box3(new Vector3(...part.min),new Vector3(...part.max)),center=box.getCenter(new Vector3());
 const transform=new Matrix4().compose(new Vector3(...gun.position),new Quaternion(...gun.rotation).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI*.9)),new Vector3(...gun.scale)).multiply(new Matrix4().makeTranslation(...gun.pivot));
 const placed=new OBB(new Vector3(),box.getSize(new Vector3()).multiplyScalar(.5)).applyMatrix4(transform.clone().multiply(new Matrix4().makeTranslation(center.x,center.y,center.z)));
 const truth=center.clone().applyMatrix4(transform);
 assert.ok(center.length()>.05&&placed.center.distanceTo(truth)<1e-9,'replayed roof-weapon stock sits where its turned mount carries it');
 assert.ok(placed.intersectsBox3(new Box3().setFromCenterAndSize(truth,new Vector3(.02,.02,.02))),'replay hits a dock placed on the turned barrel');
}
const unsafe={...missionAttachmentFor(armed),frame:gun.owner,x:gun.position[0],z:gun.position[2]+.5,y:gun.position[1]+gun.pivot[1]*gun.scale[1]-.10};
assert.equal(missionAttachmentClear(armed,unsafe),false,'gun sweep rejects a deliberately obstructing supported-height seat');
console.log(`droneRecon: ${weaponPoses} independent roof-weapon poses clear dock volumes`);
const spec={id:'fixture',dims:{heightM:2.6},role:'medium'};
const owner={id:'owner',team:'alpha',spec,state:{pos:{x:0,y:0,z:0}},combat:{destroyed:false},aerial:{kind:'drone',active:true,launching:false,x:0,y:20,z:570}};
const target={id:'target',team:'bravo',spec,state:{pos:{x:0,y:0,z:600}},combat:{destroyed:false}};
let blocked=false,smoke=false,origin;
const spotting=createSpottingSystem({getTanks:()=>[owner,target],teams:['alpha','bravo'],raycast:(o,d,dist)=>{origin={...o};return blocked?{dist:dist/2}:null;},opticalBlocked:()=>smoke});
assert.equal(spotting.testSpot(owner,target,0),true,'drone reveals target outside carrier view range');
assert.equal(origin.y,20,'LOS originates at drone');
blocked=true;assert.equal(spotting.testSpot(owner,target,0),false,'nearby drone cannot spot through a building');
blocked=false;smoke=true;assert.equal(spotting.testSpot(owner,target,0),false,'thermal presentation does not defeat smoke');
smoke=false;owner.aerial.z=100;assert.equal(spotting.testSpot(owner,target,0),false,'drone view is range-limited');
owner.aerial.z=570;owner.aerial.launching=true;assert.equal(spotting.testSpot(owner,target,0),false,'dock/takeoff does not add a recon observer');
owner.aerial.launching=false;owner.combat.destroyed=true;assert.equal(spotting.testSpot(owner,target,0),false,'destroyed carrier loses recon');
console.log(`droneRecon: ${count} supported fleet mounts, launch alignment, recon cover/smoke/range/death passed`);
