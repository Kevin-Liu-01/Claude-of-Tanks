import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { encodeAimIntent } from './aimIntent.ts';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { arrangeModeRoster } from '../mp/host/modeRoster.ts';
import { AERIAL_RULES } from './matchRuleset.ts';
const modes=['juggernaut','infected','realistic','gun_game','drone','ac130'];
for(const mode of modes){
 const match=createAuthoritativeMatch({gameMode:mode,countdownS:0,mapId:'verdant',seed:23,
  players:[{id:'pilot',specId:'m1a2',team:'alpha',spawn:{x:0,z:-50,yaw:0}}, {id:'hostile',specId:'m1a2',team:'bravo',spawn:{x:0,z:80,yaw:Math.PI}}]});
 match.onMatchReady();
 const pilot=match.entityById.get('pilot');const inputs=new Map([['pilot',{throttle:0,steer:0,brake:false,fire:false,aimYaw:0,aimPitch:-.7,shellSlot:0,actionBits:mode==='drone'?PLAYER_ACTION_BITS.DRONE:0}]]);
 match.step({dt:1/60,inputs});inputs.get('pilot').actionBits=0;
 const snap=match.snapshot({tick:1,serverTimeMs:17,viewerId:'pilot',ackInputSeq:1});
 assert.equal(snap.meta.modeState.id,mode);
 if(mode==='realistic'){assert.equal(pilot.combat.modeModuleOnlyDamage,true);assert.equal(snap.entities.length,2,'realistic has no fog-of-war hiding');}
 if(mode==='juggernaut')assert.ok(pilot.combat.maxHp>10000);
 if(mode==='infected'){
  pilot.combat.destroyed=true;match.step({dt:1/60,inputs});assert.equal(pilot.team,'bravo');
  const infected=match.snapshot({tick:2,serverTimeMs:33,viewerId:'pilot',ackInputSeq:2});assert.equal(infected.meta.modeState.perspectiveTeam,'bravo');
 }
 if(mode==='gun_game')assert.equal(pilot.spec.gun.caliberMm,30);
 if(mode==='drone'){
  assert.equal(snap.meta.modeState.missionPayloads.find(row=>row.id==='pilot').ready,false,'network dock empties on launch');
  assert.equal(pilot.aerial.active,true,'network action launches FPV');assert.ok(snap.meta.modeState.aerial.launching);
  inputs.get('pilot').throttle=1;
  for(let i=0;i<120;i++)match.step({dt:1/60,inputs});
  assert.ok(pilot.aerial.y>pilot.state.pos.y+3,'drone leaves parked tank');
 }
 if(mode==='ac130'){
  assert.ok(pilot.state.pos.y>=AERIAL_RULES.gunship.altitudeM);assert.equal(pilot.spec.gun.shells[1].caliberMm,152);
  inputs.get('pilot').fire=true;match.step({dt:1/60,inputs});
  const fired=match.eventsForViewer('pilot').filter(e=>e.type==='shell_fired');assert.ok(fired.length,'gunship fires an actual authoritative projectile');
  assert.ok(fired[0].y>=AERIAL_RULES.gunship.altitudeM,'aircraft muzzle never follows a ground tank barrel');
 }
}
for(const mode of ['juggernaut','infected','ac130']){
 const seats=[{playerId:'host',team:'alpha',specId:'m1a2'},{playerId:'guest',team:'bravo',specId:'m1a2'}],bots=[];
 arrangeModeRoster(mode,null,seats,bots);
 assert.ok(bots.length);assert.ok(seats.length+bots.length<=42);
 if(mode==='juggernaut')assert.equal([...seats,...bots].filter(e=>e.team==='alpha').length,1);
 else assert.ok(seats.every(seat=>seat.team==='alpha'));
 if(mode==='infected'){assert.equal(bots.filter(bot=>bot.team==='bravo').length,1);assert.equal(bots.filter(bot=>bot.team==='alpha').length,11,'fill the entire survivor roster');}
}
console.log('sixModesAuthority: all six modes spawn and step; multiplayer flight, visibility, roles and infection passed');

// Fly the actual authority projectile into the roof of an enemy, rather than merely toggling a view.
{
 const flat={getHeightAt:()=>0,getGroundType:()=> 'hard',getNormalAt:()=>new Vector3(0,1,0)};
 const match=createAuthoritativeMatch({gameMode:'drone',countdownS:0,mapId:'verdant',seed:23,
  worldCollision:{mapId:'verdant',heightField:flat,getObstacles:()=>[]},
  players:[{id:'pilot',specId:'m1a2',team:'alpha',spawn:{x:0,z:0,yaw:0}},{id:'target',specId:'m1a2',team:'bravo',spawn:{x:0,z:70,yaw:0}}]});
 match.onMatchReady();const pilot=match.entityById.get('pilot'),target=match.entityById.get('target');
 const input={throttle:1,steer:0,brake:false,fire:false,aimYaw:0,aimPitch:0,shellSlot:0,actionBits:PLAYER_ACTION_BITS.DRONE};
 const inputs=new Map([['pilot',input]]);const hits=[];
 for(let tick=0;tick<600;tick++){
  if(pilot.aerial?.active)Object.assign(input,encodeAimIntent(pilot.aerial,{x:target.state.pos.x,y:target.state.pos.y+1.5,z:target.state.pos.z}));
  match.step({dt:1/60,inputs});input.actionBits=0;
  hits.push(...match.eventsForViewer('pilot').filter(e=>e.type==='shell_hit'));
  if(tick>90&&!pilot.aerial.active)break;
 }
 assert.ok(hits.length,'FPV collision produces a real shell impact');
 assert.ok(target.combat.hp<target.combat.maxHp||target.combat.destroyed,'FPV explosion damages the enemy');
 assert.equal(pilot.aerial.active,false,'impact exits flight');
 assert.ok(Math.hypot(pilot.state.pos.x,pilot.state.pos.z)<2,'flight inputs do not drive the parked tank');
 console.log('sixModesAuthority: direct FPV flight hits and damages an enemy through authority');
}
