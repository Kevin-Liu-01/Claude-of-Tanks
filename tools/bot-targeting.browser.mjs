// Observe real map battles and retain target decisions alongside screenshots.
// Accelerates only fixed-step time; maps, movement, spotting and combat stay live.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage,beginSoloBattle,applyGroundPose} from './map-probe-runtime.mjs';
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'.qa-dev/bot-targeting');mkdirSync(out,{recursive:true});
const cases=[{size:3,map:'verdant'},{size:7,map:'desert'},{size:15,map:'verdant'},{size:15,map:'winter'},{size:21,map:'cliffbridge'}];
const reports=[];const lock=createCaptureLock();let refresh;
try{
 await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);
 await withMapProbeSession({root:process.cwd(),cacheDir:resolve('.qa-dev/targeting-vite-cache')},async({browser,port})=>{
  for(const scenario of cases){
   const {page,errors}=await openGamePage(browser,{port,viewport:{width:1440,height:900}});
   await page.evaluate(({size})=>{localStorage.setItem('cot.game.teams.v1',JSON.stringify({standard:{allies:size-1,enemies:size}}));localStorage.setItem('cot.game.brain.v1',JSON.stringify({opponent:'classic',allies:false}));localStorage.setItem('cot.battle.times.v2',JSON.stringify(['day']));},scenario);
   await beginSoloBattle(page,{specId:'m1a2',mapId:scenario.map});
   await page.evaluate(()=>{
    const D=window.__DEBUG,g=D.game;
    window.__botObservation={shots:[],hits:[],samples:[],roster:g.tanks.map(t=>({id:t.id,team:t.team,spec:t.specId,isPlayer:!!t.isPlayer}))};
    D.bus.on('shell:fired',e=>{const t=g.tankById.get(e.shooterId);window.__botObservation.shots.push({t:g.timeS,id:e.shooterId,team:t?.team,isPlayer:!!t?.isPlayer,target:t?.aiCtl?.targetId??null});});
    D.bus.on('shell:hit',e=>window.__botObservation.hits.push({t:g.timeS,attacker:e.attackerId,target:e.targetId,damage:e.damage}));
   });
   for(let step=0;step<30;step++){
    const state=await page.evaluate((step)=>{
     const D=window.__DEBUG,g=D.game,p=g.player;
     if(g.phase!=='battle')return{ended:true};
     // Drive out with the formation, then repeatedly fire the real loaded gun.
     p.input.throttle=step<7?.65:0;p.input.brake=false;
     D.flags.forceFire=step>=7&&!p.combat.destroyed;
     if(step>=7)D.aimAtNearest();D.fastForward(3);
     const sample={t:g.timeS,playerAlive:!p.combat.destroyed,player:p.state.pos.toArray(),bots:[]};
     for(const b of g.tanks){if(!b.aiCtl||b.combat.destroyed)continue;
      const d=b.aiCtl.debugInfo(),target=g.tankById.get(d.targetId),alternatives=[];
      for(const e of g.tanks){if(e.team===b.team||e.combat.destroyed||e===p)continue;
       if(!g.spotting.isSpotted(e.id,b.team))continue;
       const origin=b.state.pos.clone();origin.y+=b.spec.dims.heightM*.85;
       const dir=e.state.pos.clone();dir.y+=e.spec.dims.heightM*.85;dir.sub(origin);const dist=dir.length();dir.normalize();
       const hit=D.world.raycast(origin,dir,dist);if(!hit||hit.dist>dist-2)alternatives.push({id:e.id,distance:b.state.pos.distanceTo(e.state.pos)});
      }
      sample.bots.push({id:b.id,team:b.team,target:d.targetId,mode:d.state??b.aiCtl.state,playerDistance:b.state.pos.distanceTo(p.state.pos),targetDistance:target?b.state.pos.distanceTo(target.state.pos):null,alternatives});
     }
     window.__botObservation.samples.push(sample);return{ended:g.phase!=='battle'};
    },step);
    if([9,19,29].includes(step)){
     const center=await page.evaluate(()=>{const D=window.__DEBUG;const live=D.game.tanks.filter(t=>!t.combat.destroyed);return{x:live.reduce((s,t)=>s+t.state.pos.x,0)/live.length,z:live.reduce((s,t)=>s+t.state.pos.z,0)/live.length};});
     await applyGroundPose(page,{cam:[center.x-65,95,center.z-65],at:[center.x,0,center.z]},{settleMs:100});
     await page.screenshot({path:resolve(out,`${scenario.size}v${scenario.size}-${scenario.map}-${step+1}.png`)});
    }
    if(state.ended)break;
   }
   const report=await page.evaluate(()=>window.__botObservation);report.scenario=scenario;report.errors=errors;
   report.summary={playerShots:report.shots.filter(s=>s.isPlayer).length,enemyShots:report.shots.filter(s=>s.team==='enemy').length,alliedBotShots:report.shots.filter(s=>s.team==='player'&&!s.isPlayer).length,maxPlayerTargets:Math.max(0,...report.samples.filter(s=>s.playerAlive).map(s=>s.bots.filter(b=>b.team==='enemy'&&b.target===report.roster.find(t=>t.isPlayer).id).length))};
   reports.push(report);writeFileSync(resolve(out,'report.json'),JSON.stringify(reports,null,2));
   console.log(JSON.stringify({scenario,...report.summary,errors}));
   assert.equal(report.roster.filter(t=>t.team==='enemy').length,scenario.size);
   assert.equal(report.roster.filter(t=>t.team==='player').length,scenario.size);
   assert.deepEqual(errors,[]);await page.close();
  }
 });
}finally{clearInterval(refresh);lock.release();}
