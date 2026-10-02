import assert from 'node:assert/strict';
import {Vector3} from 'three';
import '../vehicles/fleetFactory.ts';
import {getSpec} from '../vehicles/specs.ts';
import {createTankState, SIM_DT} from '../sim/movement.ts';
import {createAI, mulberry32} from './ai.ts';
const baseline=process.argv.includes('--baseline');
const hf={getHeightAt:()=>0,getNormalAt:()=>({x:0,y:1,z:0}),getGroundType:()=> 'firm'};
function tank(id,team,x,z,isPlayer=false){const spec=getSpec('m1a2');return {id,specId:spec.id,spec,team,isPlayer,state:createTankState(spec,new Vector3(x,0,z),0),combat:{hp:1000,maxHp:1000,destroyed:false,reload:{t:0,totalS:6,kind:'ready'},shellSlot:0,modules:{},crew:{},fire:{burning:false},magazine:null},input:{throttle:0,steer:0,brake:false,fire:false,aimPoint:new Vector3(),shellSlot:0,actionBits:0}};}
function scenario(size,difficulty,marked=true){
 const foes=Array.from({length:size},(_,i)=>tank('red-'+i,'enemy',(i-(size-1)/2)*24,0));
 const friends=Array.from({length:size-1},(_,i)=>tank('blue-'+i,'player',(i-(size-2)/2)*24,85));
 const player=tank('human','player',0,230,marked);friends.push(player);
 let spotted=true;
 for(let i=0;i<foes.length;i++)foes[i].aiCtl=createAI(foes[i],{difficulty,rng:mulberry32(i+77),deps:{heightField:hf,raycast:()=>null,getEnemies:()=>friends,getAllies:()=>foes,getObstacles:()=>[],spotting:{isSpotted:(id,_team)=>id!==player.id||spotted}}});
 let time=0;const tick=(seconds)=>{for(let n=0;n<seconds/SIM_DT;n++){time+=SIM_DT;for(const f of foes)f.aiCtl.update(SIM_DT,time);}};
 const targets=()=>foes.map(f=>f.aiCtl.targetId);tick(2);
 const initial=targets();
 // All hear two shots from a farther opponent while already in a local fight.
 for(let shot=0;shot<2;shot++){for(let i=0;i<foes.length;i++)(foes[i].aiCtl.notifyEnemyFired??foes[i].aiCtl.notifyPlayerFired)(player,i);tick(.5);}
 const afterShots=targets();
 for(const f of foes)f.aiCtl.notifyUnderFire(player,{selfHit:false,damaging:true});tick(.5);
 const afterTeamHit=targets();
 return {foes,friends,player,tick,targets,initial,afterShots,afterTeamHit,setSpotted:v=>{spotted=v;}};
}
const observations=[];
for(const size of [3,7,15,21])for(const difficulty of ['normal','hard']){
 const s=scenario(size,difficulty),neutral=scenario(size,difficulty,false);
 const count=a=>a.filter(id=>id==='human').length;
 observations.push({size,difficulty,initial:count(s.initial),afterShots:count(s.afterShots),afterTeamHit:count(s.afterTeamHit)});
 if(!baseline){
  assert.deepEqual(s.initial,neutral.initial,'target selection ignores the player flag');
  assert.deepEqual(s.afterShots,neutral.afterShots,'gunfire reactions ignore the player flag');
  assert.deepEqual(s.afterTeamHit,neutral.afterTeamHit,'team damage reactions ignore the player flag');
  assert(count(s.afterShots)<=Math.max(1,Math.ceil(size*.15)),`${size}v${size}: distant gunfire must not steal local engagements`);
  assert(count(s.afterTeamHit)<=Math.max(1,Math.ceil(size*.15)),`${size}v${size}: team-hit report must not steal local engagements`);
  // A sole visible survivor remains a legitimate target for everyone.
  for(const f of s.friends)if(f!==s.player)f.combat.destroyed=true;s.tick(1);
  assert.equal(count(s.targets()),size,'all bots can fight the sole remaining opponent');
 }
}
if(!baseline){
 const s=scenario(7,'normal');
 const defender=s.foes[0];s.player.state.pos.set(defender.state.pos.x,0,50);
 defender.aiCtl.notifyUnderFire(s.player,{selfHit:true,damaging:true});s.tick(.5);
 assert.equal(defender.aiCtl.targetId,s.player.id,'direct nearby attacker receives retaliation');
 const oldTarget=defender.aiCtl.targetId;
 s.friends[0].state.pos.set(defender.state.pos.x,0,15);s.tick(.5);
 assert.notEqual(defender.aiCtl.targetId,oldTarget,'a much closer new threat breaks target tunneling');
 const hidden=scenario(7,'hard');hidden.setSpotted(false);
 for(const f of hidden.foes){f.aiCtl.notifyEnemyFired(hidden.player);f.aiCtl.notifyUnderFire(hidden.player,{selfHit:true,damaging:true});}
 hidden.tick(1);
 assert(!hidden.targets().includes(hidden.player.id),'unspotted gunfire and hits never grant a target');
}
console.log(JSON.stringify(observations,null,2));
if(!baseline)console.log('ai.targeting: identity parity, current-fight continuity, team alerts and sole-survivor engagement passed');
