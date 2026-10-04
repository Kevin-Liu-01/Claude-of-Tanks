import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createMatchModeController} from './matchModes.ts';
import {ensureAuthorityFleet} from '../vehicles/authorityFleet.ts';
import {getSpec} from '../vehicles/specs.ts';
import {createCombatState,resolveShellHit,resolveHeBurst,shellBlastRadiusM} from './damage.ts';
import {createShell} from './ballistics.ts';
import {matchRulesetFor,applyRulesetToCombat,GUNSHIP_WEAPONS} from './matchRuleset.ts';
import {createSpottingSystem} from './spotting.ts';
import {tankPoseFromState,blastTargets} from './armor.ts';
import {applyJuggernautScale} from './juggernautScale.ts';
await ensureAuthorityFleet(['m1a2']);
const spec=getSpec('m1a2');
const tank=(id,team='alpha',bot=false)=>({id,team,bot,spec,state:{pos:new Vector3(0,0,-100),yaw:0,turretYaw:0,visualPitch:0,visualRoll:0,gunPitch:0,speed:0},combat:createCombatState(spec),input:{aimPoint:new Vector3(15,0,-100)}});
{
 const pilot=tank('pilot');pilot.aerial={kind:'gunship',active:true,y:240};
 const ally=tank('ally','alpha',true),other=tank('other','alpha',true),enemy=tank('enemy','bravo',true);
 other.state.pos.x=80;enemy.state.pos.z=150;
 const entities=[pilot,ally,other,enemy],mode=createMatchModeController({mode:'ac130',entities,revive(){}});
 assert.equal(ally.combat.maxHp,Math.round(spec.hp*.9));
 ally.combat.ammo.fill(0);other.combat.ammo.fill(0);
 assert.equal(mode.requestSupply('enemy','ammo',0),false);
 assert.equal(mode.requestSupply('pilot','ammo',0),true);assert.equal(mode.requestSupply('pilot','ammo',1),false);
 // The drop names its gunship, so only that crew calls it away (2026-10-04).
 const crew=tank('crew');crew.aerial={kind:'gunship',active:true,y:240};
 const dropped=[];const named=createMatchModeController({mode:'ac130',entities:[crew,tank('wing','alpha',true),tank('foe','bravo',true)],revive(){},emit(type,payload){if(type==='mode_pickup_spawned')dropped.push(payload);}});
 assert.equal(named.requestSupply('crew','heal',0),true);
 assert.equal(dropped.length,1);assert.equal(dropped[0].by,'crew');assert.equal(dropped[0].airDrop,true);assert.equal(dropped[0].kind,'heal');
 let pickup=mode.state.pickups[0];assert.equal(pickup.y,240);
 assert.equal(mode.botObjective(ally).mission,'recover');assert.equal(mode.botObjective(ally).radiusM,3);
 assert.equal(mode.botObjective(other).mission,'carrier','one nearby ally collects each cache');
 ally.state.pos.set(pickup.x,0,pickup.z);mode.step(1/60,3);
 assert.equal(pickup.active,true,'cannot collect a falling cache');assert.ok(pickup.y>100);
 const saved=mode.captureCheckpoint(3);assert.equal(saved.support.pickups.length,1);
 mode.step(1/60,6);assert.equal(pickup.active,false);assert.ok(ally.combat.ammo.some(n=>n>0));
 mode.restoreCheckpoint(saved);assert.equal(mode.state.pickups[0].active,true);assert.equal(mode.requestSupply('pilot','ammo',10),false,'cooldown persists');
 mode.step(1/60,23);assert.equal(mode.requestSupply('pilot','ammo',23),true);
 ally.combat.hp=1;assert.equal(mode.requestSupply('pilot','heal',23),true);mode.step(1/60,29);assert.ok(ally.combat.hp>1,'landed medical supplies heal actual hull');
 mode.step(1/60,100);assert.equal(mode.state.pickups.some(p=>p.active),false,'expired supplies leave the field');
}
{
 const entity=tank('boss'),normalWidth=spec.dims.widthM;
 const before=blastTargets(tankPoseFromState(entity.state),spec.armor).map(b=>b.point.clone().sub(entity.state.pos));
 applyJuggernautScale(entity);applyJuggernautScale(entity);
 assert.equal(entity.spec.dims.widthM,normalWidth*1.12);assert.equal(spec.dims.widthM,normalWidth);
 const after=blastTargets(tankPoseFromState(entity.state),entity.spec.armor);
 for(let i=0;i<after.length;i++)assert.ok(after[i].point.clone().sub(entity.state.pos).distanceTo(before[i].multiplyScalar(1.12))<1e-7,'armor, crew and modules follow the visual scale');
}
{
 const a=tank('s'),b=tank('i','bravo');createMatchModeController({mode:'infected',entities:[a,b],revive(){}});
 assert.equal(a.combat.maxHp,Math.round(spec.hp*.3));assert.equal(b.combat.maxHp,Math.round(spec.hp*1.25));
 assert.equal(matchRulesetFor('infected').enemies,4);assert.equal(matchRulesetFor('infected',null,{enemies:1}).enemies,3);
}
{
 const a=tank('observer'),b=tank('hidden','bravo');b.state.pos.z=600;
 const spotting=createSpottingSystem({getTanks:()=>[a,b],teams:['alpha','bravo'],alwaysVisible:matchRulesetFor('realistic').alwaysVisible});
 assert.equal(spotting.testSpot(a,b,0),false);assert.equal(spotting.isSpotted(b.id,'alpha',a),false);
 a.aerial={kind:'gunship',active:true};b.state.pos.copy(a.state.pos);
 const air=createSpottingSystem({getTanks:()=>[a,b],teams:['alpha','bravo'],alwaysVisible:true});
 assert.equal(air.testSpot(b,a,0),false);assert.equal(air.isSpotted(a.id,'bravo',b),false);assert.equal(air.isSpotted(b.id,'alpha',a),true);
}
{
 const target=tank('module');target.state.pos.set(0,0,0);applyRulesetToCombat(target.combat,spec.gun.shells,matchRulesetFor('realistic'));
 const shellSpec={...spec.gun.shells[0],pen100Mm:5000,pen1000Mm:5000,moduleDmg:1000};
 const plate={name:'front',verts:[[-2,0,2],[2,0,2],[2,2,2],[-2,2,2]],physicalMm:10,keMm:10,ceMm:10,kind:'main',era:null,moduleLink:null};
 const hit={t:.1,kind:'plate',plate,point:new Vector3(0,1,2),normal:new Vector3(0,0,1),impactAngleDeg:0};
 const shot=createShell(shellSpec,'enemy',false,new Vector3(0,1,3),new Vector3(0,0,-1),1);
 const event=resolveShellHit(shot,target,[hit,{t:.3,kind:'module',module:'ammoRack',point:new Vector3(0,1,0)}],()=>.99);
 assert.equal(target.combat.destroyed,true,'a major penetration incapacitates crew even with high saving throws');assert.ok(event.modulesHit.some(m=>m.newState==='red'),'penetration fragments disable authored compartments');
 const blocked=tank('blocked');blocked.state.pos.set(0,0,0);applyRulesetToCombat(blocked.combat,spec.gun.shells,matchRulesetFor('realistic'));
 resolveShellHit(createShell({...shellSpec,pen100Mm:1,pen1000Mm:1},'enemy',false,new Vector3(0,1,3),new Vector3(0,0,-1),2),blocked,[{...hit,plate:{...plate,physicalMm:1000,keMm:1000,ceMm:1000}}],()=>.5);
 assert.equal(blocked.combat.destroyed,false);assert.ok(Object.values(blocked.combat.crew).every(Boolean),'nonpenetration does not invent internal fragments');
}
for(const weapon of GUNSHIP_WEAPONS.slice(1)){
 assert.ok(shellBlastRadiusM(weapon)>=18);
 const target=tank('blast');target.state.pos.set(0,0,0);
 const shell=createShell(weapon,'pilot',true,new Vector3(12,1,1),new Vector3(0,-1,0),4);
 const hits=resolveHeBurst(shell,new Vector3(12,1,0),[target],null,null,()=>.5);
 assert.ok(hits.some(h=>h.damage>0),'gunship explosive near misses damage ground targets beyond ordinary HE radius');
}
console.log('modeAdditions: supply descent/AI/cooldown/migration, 90% escort HP, scaled compartments, infection, spotting and lethal penetrations/explosive area damage passed');
