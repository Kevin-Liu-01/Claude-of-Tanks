import assert from 'node:assert/strict';
import { createSpottingSystem } from './spotting.ts';
import { initializeAerial, stepAerial } from './aerialCombat.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { missionAttachmentFor, hullSurfaceAt, DRONE_DOCK_HEIGHT_M } from './missionAttachment.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
let count=0;
for(const spec of Object.values(TANK_SPECS)){
 const seat=missionAttachmentFor(spec);assert.ok(Number.isFinite(seat.y),spec.id);
 for(const dx of[-.32,.32])for(const dz of[-.4,.4]){const height=hullSurfaceAt(spec,seat.x+dx,seat.z+dz);assert.ok(Number.isFinite(height)&&seat.y-height>=.119,`${spec.id}: every foot seats on its hull`);}
 const e={id:spec.id,team:'alpha',spec,state:{pos:new Vector3(10,0,20),yaw:.6,speed:0},combat:{destroyed:false},input:{auxiliaryBits:PLAYER_ACTION_BITS.DRONE,throttle:0,steer:0,fire:false,brake:false,aimPoint:new Vector3()}};
 initializeAerial(e,matchRulesetFor('drone'));let shell;
 stepAerial(e,0,1/60,()=>1,s=>{shell=s;});
 assert.ok(shell);assert.equal(shell.pos.y,seat.y+DRONE_DOCK_HEIGHT_M);
 assert.ok(Math.abs(shell.pos.x-(10+seat.x*Math.cos(.6)+seat.z*Math.sin(.6)))<1e-8);
 assert.equal(shell.vel.length(),0,'motors spool up from rest');count++;
}
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
