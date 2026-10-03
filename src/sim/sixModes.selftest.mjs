import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor, applyRulesetToCombat, GUN_GAME_WEAPONS, AERIAL_RULES } from './matchRuleset.ts';
import { createCombatState, hullDamageTaken, tickModuleRepairs, resolveShellHit } from './damage.ts';
import { resolveHullImpact } from './impact.ts';
import { getSpec } from '../vehicles/specs.ts';
import { setModeWeapon } from './modeLoadout.ts';
import { initializeAerial, stepAerial } from './aerialCombat.ts';
import { createShell, stepShell } from './ballistics.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
function tank(id,team='alpha') {
 const spec=getSpec('m1a2');return {id,team,spec,bot:false,state:{pos:new Vector3(0,0,team==='alpha'?-100:100),yaw:0,speed:0},combat:createCombatState(spec),input:{shellSlot:0,throttle:0,steer:0,brake:false,fire:false,aimPoint:new Vector3(0,10,200),auxiliaryBits:0}};
}
function mode(id,entities,arrangement=null){return createMatchModeController({mode:id,entities,ruleset:matchRulesetFor(id,null,arrangement),setWeaponStage:setModeWeapon,revive(e,p){e.state.pos.set(p.x,0,p.z);e.combat=createCombatState(e.spec);}});}
{
 const a=tank('boss'),b=tank('hunter','bravo');const hp=a.combat.hp;const m=mode('juggernaut',[a,b]);
 assert.equal(a.combat.hp,hp*8);assert.equal(a.combat.equipMults.reload,.5);
 b.combat.destroyed=true;m.step(.1,1);m.step(.1,8);assert.equal(b.combat.destroyed,false,'hunters respawn');
 a.combat.destroyed=true;assert.equal(m.step(.1,9).result,'bravo','boss death wins immediately');m.step(.1,30);assert.equal(a.combat.destroyed,true,'boss never respawns');
 const hunterRules=matchRulesetFor('juggernaut',null,{juggernautRole:'hunter'});assert.equal(hunterRules.enemies,1);assert.equal(hunterRules.juggernaut.team,'bravo');
}
{
 const a=tank('survivor'),b=tank('survivor2'),c=tank('infected','bravo');const m=mode('infected',[a,b,c]);
 a.combat.destroyed=true;m.step(.1,1);assert.equal(a.team,'bravo');m.step(.1,6);assert.equal(a.combat.destroyed,false);assert.equal(a.modeSpeedMultiplier,1.4);
 assert.equal(m.serialize('survivor').perspectiveTeam,'bravo');assert.equal(m.state.infection.survivors,1);
 b.combat.destroyed=true;assert.equal(m.step(.1,7).result,'bravo');
 const survive=mode('infected',[tank('live'),tank('i','bravo')]);assert.equal(survive.step(.1,420).result,'alpha');
}
{
 const a=tank('winner'),b=tank('target','bravo');const source=a.spec;const m=mode('gun_game',[a,b]);
 assert.equal(source.gun.shells[0].name,getSpec('m1a2').gun.shells[0].name,'catalog unchanged');
 for(let kill=1;kill<=10;kill++){
  b.combat.destroyed=true;m.recordDestruction(b.id,a.id);m.recordDestruction(b.id,a.id);
  assert.equal(m.state.score.alpha,kill,'one reward per life');
  if(kill<10){const now=kill*10;m.step(.1,now);m.step(.1,now+5);assert.equal(b.combat.destroyed,false);}
 }
 assert.equal(m.step(.1,200).result,'alpha');assert.equal(a.spec.gun.shells[0].name,GUN_GAME_WEAPONS[4].name);
}
{
 const e=tank('real');const rules=matchRulesetFor('realistic');applyRulesetToCombat(e.combat,e.spec.gun.shells,rules);
 assert.equal(hullDamageTaken(e.combat,1e9),0);const hp=e.combat.hp;
 const impact=resolveHullImpact({combat:e.combat,physics:rules.physics,kind:'fall',massTons:65,closingMps:30,faceForward:0,sideSign:0,attitudeFactor:1,rng:()=>.99});
 assert.equal(e.combat.hp,hp);assert.equal(impact.damage,0);assert.ok(impact.modulesHit.length,'fall still damages actual modules');
 e.combat.modules.trackL.hp=0;e.combat.modules.trackL.state='red';tickModuleRepairs(e.combat,100);assert.equal(e.combat.modules.trackL.state,'red');
 assert.equal(mode('realistic',[e,tank('enemy','bravo')]).usesElimination,true);
}
{
 const e=tank('pilot');initializeAerial(e,matchRulesetFor('drone'));const shells=[];let id=1;
 e.input.auxiliaryBits=PLAYER_ACTION_BITS.DRONE;
 stepAerial(e,1,1/60,()=>id++,s=>shells.push(s));assert.equal(shells.length,1);assert.equal(e.aerial.launching,true);assert.equal(e.input.fire,false);
 for(let i=1;i<480;i++){e.input.throttle=1;e.input.brake=false;stepAerial(e,1+i/60,1/60,()=>id++,s=>shells.push(s));stepShell(shells[0],1/60);}
 assert.equal(shells[0].dead,false,'FPV survives the ordinary six-second shell cutoff');assert.equal(e.aerial.launching,false);
 assert.ok(e.aerial.y>0);assert.equal(e.state.pos.y,0,'parked tank stays on ground');
 e.input.throttle=0;e.input.steer=0;e.input.brake=false;const hoverY=shells[0].pos.y;
 for(let i=0;i<30;i++){stepAerial(e,9+i/60,1/60,()=>id++,s=>shells.push(s));stepShell(shells[0],1/60);}
 assert.ok(Math.abs(shells[0].pos.y-hoverY)<.3,'braking settles vertical inertia without inventing climb');
 const settled=shells[0].vel.length();assert.ok(settled<5,'released controls brake instead of coasting indefinitely');
 shells[0].dead=true;stepAerial(e,10,1/60,()=>id++,s=>shells.push(s));assert.equal(e.aerial.active,false);assert.equal(e.aerial.cooldownS,AERIAL_RULES.drone.cooldownS);
 e.input.auxiliaryBits=PLAYER_ACTION_BITS.DRONE;stepAerial(e,11,1/60,()=>id++,s=>shells.push(s));assert.equal(shells.length,1,'cooldown rejects launch');
 e.input.auxiliaryBits=PLAYER_ACTION_BITS.DRONE;stepAerial(e,40,1/60,()=>id++,s=>shells.push(s));assert.equal(shells.length,2);
 e.combat.destroyed=true;stepAerial(e,41,1/60,()=>id++,s=>shells.push(s));assert.equal(shells[1].dead,true);assert.equal(e.aerial.active,false);
}
{
 const e=tank('gunship');initializeAerial(e,matchRulesetFor('ac130'));assert.equal(e.state.pos.y,AERIAL_RULES.gunship.altitudeM,'aircraft is airborne before the first step');setModeWeapon(e,'gunship');stepAerial(e,5,1/60,()=>0,()=>{});
 assert.equal(e.spec.gun.shells.length,3);assert.equal(e.spec.gun.shells[1].caliberMm,152);assert.equal(e.spec.gun.shells[2].guided,true);
 assert.equal(e.state.pos.y,AERIAL_RULES.gunship.altitudeM);assert.ok(Math.abs(Math.hypot(e.state.pos.x,e.state.pos.z)-AERIAL_RULES.gunship.radiusM)<1e-6);
 const hostile=tank('ground','bravo');initializeAerial(hostile,matchRulesetFor('ac130'));assert.equal(hostile.aerial,undefined);
}
console.log('sixModes: boss roles, infection, progression, realistic impacts, drone lifecycle and gunship weapons passed');

{
 const e=tank('crew-only');applyRulesetToCombat(e.combat,e.spec.gun.shells,matchRulesetFor('realistic'));
 e.state.pos.set(0,0,0);e.state.turretYaw=0;e.state.gunPitch=0;
 for(const key of Object.keys(e.combat.crew))e.combat.crew[key]=false;
 e.combat.crew.gunner=true;
 const shell=createShell({...GUN_GAME_WEAPONS[2],pen100Mm:5000,pen1000Mm:5000},'attacker',false,new Vector3(0,1,3),new Vector3(0,0,-1),100);
 const plate={name:'fixture front',verts:[[-1,0,2],[1,0,2],[1,2,2],[-1,2,2]],physicalMm:10,keMm:10,ceMm:10,kind:'main',era:null,moduleLink:null};
 const before=e.combat.hp;
 const event=resolveShellHit(shell,e,[{t:.4,kind:'plate',plate,point:new Vector3(0,1,2),normal:new Vector3(0,0,1),impactAngleDeg:0},{t:.45,kind:'crew',crew:'gunner',point:new Vector3(0,1,1.5)}],()=>.1);
 assert.ok(event.crewHit.includes('gunner'),'penetration incapacitates the last crew member');
 assert.ok(before>0);assert.equal(event.damage,0,'crew destruction does not depend on hull HP attrition');
 assert.equal(e.combat.destroyed,true,'loss of all crew destroys a realistic-mode tank');
}
