import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { ESCORT_RULES } from './gunshipEscort.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { arrangeModeRoster } from '../mp/host/modeRoster.ts';
import { createMatchPlacement } from './matchPlacement.ts';
import { objectiveMarkers } from '../ui/minimapObjectives.ts';
const tank=(id,team='alpha',bot=true)=>({id,team,bot,state:{pos:{x:0,y:0,z:team==='alpha'?-150:150},yaw:0,speed:0},combat:{hp:2000,maxHp:2000,destroyed:false,ammo:[20],ammoCapacity:[20]}});
const fixture=()=>[tank('pilot','alpha',false),...Array.from({length:4},(_,i)=>tank('escort-'+i)),tank('hostile','bravo')];
const make=entities=>createMatchModeController({mode:'ac130',entities,revive(){throw Error('escort must not respawn');}});
{
 const entities=fixture(),mode=make(entities),escort=mode.state.escort;
 assert.equal(mode.usesElimination,false);assert.equal(escort.total,4);assert.equal(escort.required,2);
 assert.equal(entities[1].combat.maxHp,700);assert.equal(entities[0].combat.maxHp,2000);assert.equal(entities[5].combat.maxHp,2000);
 assert.equal(entities[1].modeSpeedMultiplier,ESCORT_RULES.speedScale);
 assert.equal(mode.botObjective(entities[1]).mission,'carrier');assert.equal(mode.botObjective(entities[5]).mission,'raid');
 assert.equal(mode.botObjective(entities[5]).z,-150,'enemies pursue ground troops, not the aircraft');
 entities[1].state.pos.x=escort.x;entities[1].state.pos.z=escort.z;
 assert.equal(mode.step(1/60,1),null);assert.equal(escort.rescued,1);assert.equal(entities[1].modeActive,false);assert.equal(entities[1].combat.destroyed,false,'extraction does not fake destruction');
 assert.equal(mode.serialize('pilot').escort.rescued,1);
 const checkpoint=mode.captureCheckpoint(1),restored=make(fixture());restored.restoreCheckpoint(checkpoint);
 assert.equal(restored.state.escort.rescued,1,'extraction survives host checkpoints');
 entities[2].state.pos.x=escort.x;entities[2].state.pos.z=escort.z;
 assert.equal(mode.step(1/60,2).reason,'escort_extracted');
 assert.ok(objectiveMarkers(mode.serialize()).some(m=>m.kind==='zone'&&m.label==='E'),'exit is marked for map and world');
}
{
 const entities=fixture(),mode=make(entities);
 for(const e of entities.slice(1,4))e.combat.destroyed=true;
 assert.deepEqual(mode.step(1/60,1),{result:'bravo',reason:'escort_lost'});
 assert.deepEqual(make(fixture()).step(1/60,480),{result:'bravo',reason:'escort_time_expired'});
 const other=fixture(),clear=make(other);other.at(-1).combat.destroyed=true;
 assert.equal(clear.step(1/60,1),null,'kills alone do not extract the convoy');
}
{
 const seats=[{playerId:'a',team:'alpha',specId:'m1a2'},{playerId:'b',team:'bravo',specId:'m1a2'}],bots=[];
 arrangeModeRoster('ac130',null,seats,bots);assert.ok(seats.every(s=>s.team==='alpha'));
 assert.equal(bots.filter(b=>b.team==='alpha').length,4,'human pilots never replace the ground escort');
 assert.equal(matchRulesetFor('ac130').allies,4);
 const field={size:1024,getHeightAt:()=>0,getNormalAt:()=>({y:1}),getWaterMaskAt:()=>0};
 const wall={min:[-20,0,-20],max:[20,10,20],crushable:false};
 const placement=createMatchPlacement({mode:'ac130',heightField:field,obstacles:[wall],anchors:{alpha:{x:0,z:-180,yaw:0},bravo:{x:0,z:180,yaw:Math.PI}}});
 assert.ok(Math.abs(placement.middle.x)>49||Math.abs(placement.middle.z)>49,'extraction moves out of solid geometry');
}
console.log('gunshipEscort: fragile ground allies, navigation missions, spatial rescue, casualties, timeout, checkpoints, multiplayer slots and safe extraction pass');
