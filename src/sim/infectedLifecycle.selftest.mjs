import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {ensureAuthorityFleet} from '../vehicles/authorityFleet.ts';
import {getSpec} from '../vehicles/specs.ts';
import {createCombatState} from './damage.ts';
import {createMatchModeController} from './matchModes.ts';
import {matchRulesetFor} from './matchRuleset.ts';
await ensureAuthorityFleet(['m1a2']);
const spec=getSpec('m1a2'),rules=matchRulesetFor('infected');
for(const size of [4,14,30,42])for(const solo of [false,true]){
 const names=solo?['player','enemy']:['alpha','bravo'];
 const entities=Array.from({length:size},(_,i)=>({id:`tank-${i}`,team:names[i<3?1:0],spec,bot:i!==3,
  state:{pos:new Vector3(i*12,0,i<3?100:-100),yaw:0,speed:0},combat:createCombatState(spec)}));
 const mode=createMatchModeController({mode:'infected',entities,ruleset:rules,revive(e,p){
  e.combat=createCombatState(spec);e.state.pos.set(p.x,0,p.z);
 }});
 let time=0;
 // Repeated infected deaths must never end the round or compound their bonuses.
 for(let life=0;life<4;life++){
  entities[0].combat.destroyed=true;
  assert.equal(mode.step(1/60,++time),null);
  time+=3;assert.equal(mode.step(1/60,time),null);
  assert.equal(entities[0].combat.destroyed,false);
  assert.equal(entities[0].combat.maxHp,Math.round(spec.hp*1.25));
  assert.equal(entities[0].combat.equipMults.reload,.7);
 }
 for(let i=3;i<size;i++){
  const e=entities[i];assert.equal(e.combat.maxHp,Math.round(spec.hp*.3));
  e.combat.destroyed=true;const outcome=mode.step(1/60,++time);
  assert.equal(e.team,names[1]);
  assert.equal(mode.state.infection.survivors,size-i-1);
  assert.equal(mode.state.infection.infected,i+1);
  assert.equal(mode.serialize(e.id).perspectiveTeam,'bravo');
  if(i===size-1){assert.equal(outcome.result,'bravo');assert.equal(outcome.reason,'outbreak_complete');break;}
  assert.equal(outcome,null);time+=3;mode.step(1/60,time);
  assert.equal(e.combat.destroyed,false);
  assert.equal(e.combat.maxHp,Math.round(spec.hp*1.25));assert.equal(e.combat.hp,e.combat.maxHp);
  assert.equal(e.combat.equipMults.reload,.7);assert.equal(e.modeSpeedMultiplier,1.4);
  assert.equal(e.state.pos.z,100,'converted tanks join the infected spawn');
 }
}
console.log('infectedLifecycle: solo/network team names, 4/14/30/42 tanks, repeat respawns, conversion stats and complete outbreak passed');
