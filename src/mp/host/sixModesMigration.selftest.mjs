import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { captureEntityExtras, encodeMigrationKeyframe, decodeMigrationKeyframe, applyResumeState } from './migrationState.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
const seats=[{seat:0,playerId:'pilot',name:'Pilot',team:'alpha',specId:'m1a1_abrams_hc'},{seat:1,playerId:'enemy',name:'Enemy',team:'bravo',specId:'m1a1_abrams_hc'},{seat:2,playerId:'friend',name:'Friend',team:'alpha',specId:'m1a1_abrams_hc'}];
await ensureAuthorityFleet(seats.map(seat=>seat.specId)); // the host is specs only: load the roster's combat anatomy first
const world=()=>({mapId:'verdant',heightField:{getHeightAt:()=>0,getGroundType:()=> 'hard',getNormalAt:()=>new Vector3(0,1,0)},getObstacles:()=>[]});
for(const mode of ['gun_game','infected','drone','ac130','juggernaut']){
 const make=resume=>createMatchActor({roomId:'mode-migration',mapId:'verdant',mode,seed:33,seats,bots:mode==='ac130'?Array.from({length:4},(_,i)=>({playerId:'ground-'+i,name:'Escort '+i,team:'alpha',specId:'m1a1_abrams_hc'})):[],ruleset:matchRulesetFor(mode),world:world(),countdownS:0,autoStart:false,now:()=>0,schedule:()=>()=>{},resume});
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
 if(mode==='ac130'){assert.equal(sim.modeController.requestSupply('pilot','ammo',sim.timeS),true);}
 const tick=Math.round(sim.timeS*60),battleTimeMs=Math.round(sim.timeS*1000),era=createEraIndexer();
 const snapshot=sim.snapshot({tick,serverTimeMs:battleTimeMs,viewerId:'migration',ackInputSeq:null});
 const keyframe={tick,battleTimeMs,phase:'playing',modeCheckpoint:sim.captureModeCheckpoint(),entities:captureEntityExtras(first),frame:{tick,serverTimeMs:battleTimeMs,ackedInputTick:0xffffffff,ackedFireSeq:0,ackedActionSeq:0,inputMarginTicks:127,meta:captureMeta({...snapshot.meta,battleTimeMs},false),destroyed:[],entities:sim.entities.map(e=>captureEntityRow(e,first.wireIdOf(e.id),era,tick)),shells:[],viewer:null,modeStateJson:null}};
 const saved=decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe));
 const second=make({tick,battleTimeMs});applyResumeState(second,saved);const restored=second.authority.entityById.get('pilot');
 if(mode==='ac130'){assert.ok(second.authority.modeController.state.pickups.some(p=>p.airDrop),'parachuting supply survives encrypted migration');assert.equal(second.authority.modeController.requestSupply('pilot','ammo',sim.timeS),false,'shared drop cooldown survives migration');}
 assert.equal(restored.team,pilot.team,`${mode}: faction survives host change`);
 assert.equal(restored.spec.gun.shells[0].name,pilot.spec.gun.shells[0].name,`${mode}: weapon survives host change`);
 assert.deepEqual(second.authority.modeController.state.score,sim.modeController.state.score,`${mode}: scores survive`);
 if(mode==='infected')assert.equal(restored.team,'bravo');
 if(mode==='ac130'){assert.equal(second.authority.modeController.state.escort.rescued,1);assert.equal(second.authority.entityById.get('ground-0').modeActive,false);assert.equal(second.authority.entityById.get('ground-1').combat.maxHp,sim.entityById.get('ground-1').combat.maxHp,'escort HP scaling must not compound during migration');}
 if(mode==='gun_game')assert.equal(restored.spec.gun.caliberMm,105);
 if(pilot.aerial){assert.deepEqual(restored.aerial,pilot.aerial);second.authority.onMatchReady();second.authority.step({dt:1/60,inputs});assert.equal(restored.aerial.active,true,`${mode}: flight continues`);assert.ok(Math.hypot(restored.aerial.x-pilot.aerial.x,restored.aerial.y-pilot.aerial.y,restored.aerial.z-pilot.aerial.z)<2,`${mode}: no orbit or flight reset`);}
 first.stop();second.stop();
}
// (272, improve-271 plan 010) ONE clock after a migration: the newest frame's battle time (resume.battleTimeMs, the
// HUD's clock), which runs up to ROOM_MATCH_KEYFRAME_INTERVAL_MS (2 s) ahead of the sealed keyframe's mode clock
// (its checkpoint's elapsedS). A migrated timed match ends at the HUD's 0:00 with the mode's own verdict, never the
// generic time_limit two seconds early; Standard (no checkpoint) still ends by time_limit at the same battle time; an
// explicit battleLimitS of exactly 900 s is a limit, not "absent".
const LEAD_MS=2000,LEFT_MS=3000; // the keyframe trails the newest frame by LEAD_MS; LEFT_MS of the clock remain
const endAfterResume=(mode,{ruleset=matchRulesetFor(mode),battleLimitS,setup=()=>{}}={})=>{
 const limitMs=(battleLimitS??ruleset.timeLimitS)*1000,frameMs=limitMs-LEFT_MS,keyMs=frameMs-LEAD_MS;
 const make=resume=>createMatchActor({roomId:'clock-migration',mapId:'verdant',mode,seed:33,seats,bots:[],ruleset,world:world(),countdownS:0,autoStart:false,now:()=>0,schedule:()=>()=>{},resume,...(battleLimitS!=null?{battleLimitS}:{})});
 const first=make(null),sim=first.authority;sim.onMatchReady();
 const input={throttle:0,steer:0,fire:false,brake:false,aimYaw:0,aimPitch:0,shellSlot:0,actionBits:0};const inputs=new Map([['pilot',input]]);
 setup(sim,inputs);
 const checkpoint=sim.captureModeCheckpoint();
 if(checkpoint)checkpoint.mode.elapsedS=keyMs/1000; // the keyframe sealed LEAD_MS before the newest frame
 const tick=Math.round(sim.timeS*60),era=createEraIndexer();
 const snapshot=sim.snapshot({tick,serverTimeMs:keyMs,viewerId:'migration',ackInputSeq:null});
 const keyframe={tick,battleTimeMs:keyMs,phase:'playing',modeCheckpoint:checkpoint,entities:captureEntityExtras(first),frame:{tick,serverTimeMs:keyMs,ackedInputTick:0xffffffff,ackedFireSeq:0,ackedActionSeq:0,inputMarginTicks:127,meta:captureMeta({...snapshot.meta,battleTimeMs:keyMs},false),destroyed:[],entities:sim.entities.map(e=>captureEntityRow(e,first.wireIdOf(e.id),era,tick)),shells:[],viewer:null,modeStateJson:null}};
 const second=make({tick:tick+Math.round(LEAD_MS*60/1000),battleTimeMs:frameMs});applyResumeState(second,decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe)));
 const auth=second.authority;auth.onMatchReady();
 for(let n=0;n<(LEFT_MS+LEAD_MS+1000)*60/1000&&!auth.result;n++)auth.step({dt:1/60,inputs});
 const hudMs=auth.resultTimeS==null?null:Math.round(auth.resultTimeS*1000)+second.resumedBattleTimeMs;
 first.stop();second.stop();
 return {reason:auth.resultReason,result:auth.result,hudMs,limitMs};
};
const atZero=({hudMs,limitMs},label)=>assert.ok(hudMs!=null&&hudMs>=limitMs&&hudMs<=limitMs+20,`${label}: the verdict falls at the HUD's 0:00 (${hudMs} ms for a ${limitMs} ms clock)`);
{
 const end=endAfterResume('infected',{setup:(sim,inputs)=>{sim.entityById.get('pilot').combat.destroyed=true;sim.step({dt:1/60,inputs});}});
 assert.equal(end.reason,'survivors_extracted',`infected: a migrated match ends by the mode's verdict, not ${end.reason}`);
 assert.equal(end.result,'alpha');atZero(end,'infected');
}
{
 const end=endAfterResume('juggernaut');
 assert.equal(end.reason,'juggernaut_survived',`juggernaut: a migrated match ends by the mode's verdict, not ${end.reason}`);atZero(end,'juggernaut');
}
{
 const end=endAfterResume('standard');
 assert.equal(end.reason,'time_limit','standard: a migrated match still ends by time_limit');atZero(end,'standard');
}
{
 // a ruleset clock of 600 s and an explicit 900 s limit: the explicit one decides (it used to read as "not given")
 const end=endAfterResume('standard',{ruleset:{...matchRulesetFor('standard'),timeLimitS:600},battleLimitS:900});
 assert.equal(end.reason,'time_limit');atZero(end,'explicit battleLimitS 900');
}
console.log('sixModesMigration: weapon progression, infection, scores, FPV flight and gunship orbit survive a serialized host handoff; a migrated timed match ends at the HUD\'s 0:00 by its own verdict');
