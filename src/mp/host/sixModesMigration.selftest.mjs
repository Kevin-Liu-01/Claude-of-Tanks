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
// the objective modes (improve-271 plan 009): score, flags, zones, the ball and Gravity Mode's caches survive the handoff
const objectiveState=c=>{const s=c.serialize(null);return {score:s.score,flags:s.flags,zones:s.zones.map(({id,control,owner,contested})=>({id,control,owner,contested})),ball:s.ball,pickups:s.pickups};};
for(const mode of ['capture_the_flag','zone_control','turbo_ball','mars']){
 const make=resume=>createMatchActor({roomId:'objective-migration',mapId:'verdant',mode,seed:33,seats,bots:[],ruleset:matchRulesetFor(mode),world:world(),countdownS:0,autoStart:false,now:()=>0,schedule:()=>()=>{},resume});
 const first=make(null),sim=first.authority;sim.onMatchReady();
 const pilot=sim.entityById.get('pilot'),ctl=sim.modeController;
 const input={throttle:0,steer:0,fire:false,brake:false,aimYaw:0,aimPitch:0,shellSlot:0,actionBits:0};const inputs=new Map([['pilot',input]]);
 const stand=(x,z,n)=>{for(let i=0;i<n;i++){pilot.state.pos.x=x;pilot.state.pos.z=z;pilot.state.speed=0;sim.step({dt:1/60,inputs});}};
 if(mode==='capture_the_flag'){
  const [own,enemyFlag]=ctl.state.flags;
  stand(enemyFlag.x,enemyFlag.z,2);assert.equal(enemyFlag.status,'carried','the pilot takes the flag');
  stand(own.baseX,own.baseZ,2);assert.equal(ctl.state.score.alpha,1,'a capture is scored');
  stand(enemyFlag.x,enemyFlag.z,2);assert.equal(enemyFlag.carrierId,'pilot','the flag is carried again at the capture');
 }
 if(mode==='zone_control'||mode==='mars'){const zone=ctl.state.zones[0];stand(zone.x,zone.z,mode==='mars'?800:600);assert.ok(zone.control>0&&ctl.state.score.alpha>0,`${mode}: a zone held and scoring`);}
 if(mode==='mars')assert.ok(ctl.state.pickups.some(p=>p.active),'mars: a cache is on the ground');
 if(mode==='turbo_ball'){const ball=ctl.state.ball;pilot.state.yaw=0;stand(ball.x,ball.z-3,1);for(let n=0;n<30;n++)sim.step({dt:1/60,inputs});assert.ok(Math.hypot(ctl.state.ball.x-ball.x,ctl.state.ball.z-ball.z)>0||ctl.state.ball.lastTouchId,'the ball is away from the kick-off');assert.equal(ctl.state.ball.lastTouchId,'pilot');}
 const before=JSON.parse(JSON.stringify(objectiveState(ctl)));
 const tick=Math.round(sim.timeS*60),battleTimeMs=Math.round(sim.timeS*1000),era=createEraIndexer();
 const snapshot=sim.snapshot({tick,serverTimeMs:battleTimeMs,viewerId:'migration',ackInputSeq:null});
 const modeCheckpoint=sim.captureModeCheckpoint();assert.ok(modeCheckpoint,`${mode}: a checkpoint is taken`);
 const keyframe={tick,battleTimeMs,phase:'playing',modeCheckpoint,entities:captureEntityExtras(first),frame:{tick,serverTimeMs:battleTimeMs,ackedInputTick:0xffffffff,ackedFireSeq:0,ackedActionSeq:0,inputMarginTicks:127,meta:captureMeta({...snapshot.meta,battleTimeMs},false),destroyed:[],entities:sim.entities.map(e=>captureEntityRow(e,first.wireIdOf(e.id),era,tick)),shells:[],viewer:null,modeStateJson:null}};
 const saved=decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe));
 const second=make({tick,battleTimeMs});applyResumeState(second,saved);
 assert.deepEqual(objectiveState(second.authority.modeController),before,`${mode}: score, flags, zones, ball and caches survive the host change`);
 if(mode==='capture_the_flag'){const carrier=second.authority.entityById.get('pilot');assert.equal(carrier.modeSpeedMultiplier,pilot.modeSpeedMultiplier,'the carrier keeps the carrier speed (flagPitch.carrierSpeedScale)');}
 // a checkpoint an older host sealed (no objective fields) restores and leaves the objectives fresh
 const legacy=make({tick,battleTimeMs}),fresh=JSON.parse(JSON.stringify(objectiveState(make(null).authority.modeController)));
 const {flags:_f,zones:_z,ball:_b,caches:_c,...oldMode}=saved.modeCheckpoint.mode;
 legacy.authority.restoreModeCheckpoint({...saved.modeCheckpoint,mode:oldMode});
 const legacyState=objectiveState(legacy.authority.modeController);
 assert.deepEqual({flags:legacyState.flags,zones:legacyState.zones,ball:legacyState.ball},{flags:fresh.flags,zones:fresh.zones,ball:fresh.ball},`${mode}: an older checkpoint restores with fresh objectives`);
 first.stop();second.stop();legacy.stop();
}
console.log('sixModesMigration: weapon progression, infection, scores, FPV flight, gunship orbit and the objective modes (score, flags, zones, ball, caches) survive a serialized host handoff');
