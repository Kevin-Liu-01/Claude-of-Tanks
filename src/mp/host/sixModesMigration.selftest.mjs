import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { captureEntityExtras, encodeMigrationKeyframe, decodeMigrationKeyframe, applyResumeState } from './migrationState.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
const seats=[{seat:0,playerId:'pilot',name:'Pilot',team:'alpha',specId:'m1a2'},{seat:1,playerId:'enemy',name:'Enemy',team:'bravo',specId:'m1a2'},{seat:2,playerId:'friend',name:'Friend',team:'alpha',specId:'m1a2'}];
await ensureAuthorityFleet(seats.map(seat=>seat.specId)); // the host is specs only: load the roster's combat anatomy first
const world=()=>({mapId:'verdant',heightField:{getHeightAt:()=>0,getGroundType:()=> 'hard',getNormalAt:()=>new Vector3(0,1,0)},getObstacles:()=>[]});
for(const mode of ['gun_game','infected','drone','ac130','juggernaut']){
 const make=resume=>createMatchActor({roomId:'mode-migration',mapId:'verdant',mode,seed:33,seats,bots:mode==='ac130'?Array.from({length:4},(_,i)=>({playerId:'ground-'+i,name:'Escort '+i,team:'alpha',specId:'m1a2'})):[],ruleset:matchRulesetFor(mode),world:world(),countdownS:0,autoStart:false,now:()=>0,schedule:()=>()=>{},resume});
 const first=make(null),sim=first.authority;sim.onMatchReady();
 const pilot=sim.entityById.get('pilot'),enemy=sim.entityById.get('enemy');
 const input={throttle:0,steer:0,fire:false,brake:false,aimYaw:0,aimPitch:0,shellSlot:0,actionBits:0};const inputs=new Map([['pilot',input]]);
 if(mode==='gun_game')for(let i=0;i<2;i++){
  enemy.combat.destroyed=true;sim.modeController.recordDestruction(enemy.id,pilot.id);
  for(let n=0;n<250;n++)sim.step({dt:1/60,inputs});
 }
 if(mode==='infected'){pilot.combat.destroyed=true;sim.step({dt:1/60,inputs});}
 if(mode==='drone'){input.actionBits=PLAYER_ACTION_BITS.DRONE;sim.step({dt:1/60,inputs});input.actionBits=0;for(let n=0;n<100;n++)sim.step({dt:1/60,inputs});}
 if(mode==='ac130'||mode==='juggernaut')for(let n=0;n<120;n++)sim.step({dt:1/60,inputs});
 if(mode==='ac130'){const e=sim.modeController.state.escort;sim.entityById.get('ground-0').state.pos.set(e.x,e.y,e.z);sim.step({dt:1/60,inputs});assert.equal(e.rescued,1);}
 const tick=Math.round(sim.timeS*60),battleTimeMs=Math.round(sim.timeS*1000),era=createEraIndexer();
 const snapshot=sim.snapshot({tick,serverTimeMs:battleTimeMs,viewerId:'migration',ackInputSeq:null});
 const keyframe={tick,battleTimeMs,phase:'playing',modeCheckpoint:sim.captureModeCheckpoint(),entities:captureEntityExtras(first),frame:{tick,serverTimeMs:battleTimeMs,ackedInputTick:0xffffffff,ackedFireSeq:0,ackedActionSeq:0,inputMarginTicks:127,meta:captureMeta({...snapshot.meta,battleTimeMs},false),destroyed:[],entities:sim.entities.map(e=>captureEntityRow(e,first.wireIdOf(e.id),era,tick)),shells:[],viewer:null,modeStateJson:null}};
 const saved=decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe));
 const second=make({tick,battleTimeMs});applyResumeState(second,saved);const restored=second.authority.entityById.get('pilot');
 assert.equal(restored.team,pilot.team,`${mode}: faction survives host change`);
 assert.equal(restored.spec.gun.shells[0].name,pilot.spec.gun.shells[0].name,`${mode}: weapon survives host change`);
 assert.deepEqual(second.authority.modeController.state.score,sim.modeController.state.score,`${mode}: scores survive`);
 if(mode==='infected')assert.equal(restored.team,'bravo');
 if(mode==='ac130'){assert.equal(second.authority.modeController.state.escort.rescued,1);assert.equal(second.authority.entityById.get('ground-0').modeActive,false);assert.equal(second.authority.entityById.get('ground-1').combat.maxHp,sim.entityById.get('ground-1').combat.maxHp,'escort HP scaling must not compound during migration');}
 if(mode==='gun_game')assert.equal(restored.spec.gun.caliberMm,105);
 if(pilot.aerial){assert.deepEqual(restored.aerial,pilot.aerial);second.authority.onMatchReady();second.authority.step({dt:1/60,inputs});assert.equal(restored.aerial.active,true,`${mode}: flight continues`);assert.ok(Math.hypot(restored.aerial.x-pilot.aerial.x,restored.aerial.y-pilot.aerial.y,restored.aerial.z-pilot.aerial.z)<2,`${mode}: no orbit or flight reset`);}
 first.stop();second.stop();
}
console.log('sixModesMigration: weapon progression, infection, scores, FPV flight and gunship orbit survive a serialized host handoff');
