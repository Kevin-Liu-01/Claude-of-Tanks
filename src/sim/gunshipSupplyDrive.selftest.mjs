import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {ensureAuthorityFleet} from '../vehicles/authorityFleet.ts';
import {createAuthoritativeMatch} from './authoritativeMatch.ts';
await ensureAuthorityFleet(['m1a2']);
const world={mapId:'verdant',heightField:{size:1024,getHeightAt:()=>0,getGroundType:()=> 'hard',getNormalAt:()=>new Vector3(0,1,0),getWaterMaskAt:()=>0},getObstacles:()=>[]};
for(const kind of ['heal','ammo']){
 const match=createAuthoritativeMatch({gameMode:'ac130',countdownS:0,mapId:'verdant',seed:23,worldCollision:world,
 players:[{id:'pilot',specId:'m1a2',team:'alpha',spawn:{x:-30,z:-200,yaw:0}},{id:'escort',specId:'m1a2',team:'alpha',bot:true,spawn:{x:0,z:-200,yaw:0}},{id:'hostile',specId:'m1a2',team:'bravo',spawn:{x:350,z:300,yaw:0}}]});
 match.onMatchReady();const escort=match.entityById.get('escort'),pilot=match.entityById.get('pilot');
 if(kind==='heal')escort.combat.hp=escort.combat.maxHp*.5;else escort.combat.ammo.fill(0);
 const before=escort.combat.hp;pilot.input.aimPoint.set(65,0,-190);
 assert.equal(match.modeController.requestSupply('pilot',kind,0),true);
 const cache=match.modeController.state.pickups[0];let nearest=Infinity;
 for(let tick=0;tick<60*60&&cache.active;tick++){
  match.step({dt:1/60,inputs:new Map()});nearest=Math.min(nearest,Math.hypot(escort.state.pos.x-cache.x,escort.state.pos.z-cache.z));
 }
 assert.equal(cache.active,false,`${kind}: real bot must collect before expiry, nearest ${nearest.toFixed(1)} m`);
 assert.ok(nearest<7,'collection requires the real vehicle to reach the crate');
 if(kind==='heal')assert.ok(escort.combat.hp>before);else assert.ok(escort.combat.ammo.some(n=>n>0));
 console.log(`gunshipSupplyDrive: ${kind} collected by a moving authority bot (${nearest.toFixed(1)} m)`);
}
