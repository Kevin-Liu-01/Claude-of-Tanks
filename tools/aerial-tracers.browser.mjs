// Native GPU regression: fire real AC-130 weapons, retain an observed mid-flight
// presentation frame for inspection, then restore live flight and verify cleanup.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage,beginSoloBattle} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/aerial-tracers');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;const results=[];
try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);console.log('aerial-tracers: acquired GPU slot');
 await withMapProbeSession({root:process.cwd(),launch:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},async({browser,port})=>{
  for(const viewport of [{width:1280,height:800},{width:480,height:270,isMobile:true,hasTouch:true}]){
   const {page,errors}=await openGamePage(browser,{port,viewport});
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.evaluate(async()=>{const {writeTeamArrangement}=await import('/src/game/teamArrangement.ts');writeTeamArrangement('ac130',{allies:4,enemies:4});});
   await beginSoloBattle(page,{specId:'m1a2',mapId:'verdant',gameMode:'ac130'});
   for(const slot of [0,1,2]){
    await page.evaluate(slot=>{
     const D=window.__DEBUG,fx=D.fx,original=fx.update;
     window.__tracerSample=null;window.__restoreTracers=()=>{fx.update=original;};
     let held=null;
     fx.update=function(dt,shells,camera,resolve){
      if(!held){
       const shell=shells.find(s=>s.shooterId===D.game.player.id&&!s.dead&&s.spec.reloadGroup===['gunship-cannon','gunship-howitzer','gunship-missile'][slot]&&s.distM>100);
       if(shell){held=[{...shell,pos:shell.pos.clone(),prevPos:shell.prevPos?.clone(),vel:shell.vel.clone()}];}
      }
      original.call(fx,held?0:dt,held??shells,camera,resolve);
      if(held){
       const g=fx.group.getObjectByName('Ballistic tracer ribbons and heads').geometry;
       let heads=0,maxWidth=0,maxLength=0;
       for(let i=0;i<g.instanceCount;i++){
        if(g.attributes.aTint.getX(i)===2)heads++;
        else {const a=g.attributes.aA,b=g.attributes.aB;maxWidth=Math.max(maxWidth,a.getW(i));maxLength=Math.max(maxLength,Math.hypot(a.getX(i)-b.getX(i),a.getY(i)-b.getY(i),a.getZ(i)-b.getZ(i)));}
       }
       window.__tracerSample={slot,heads,maxWidth,maxLength,distM:held[0].distM,instances:g.instanceCount};
      }
     };
    },slot);
    const button=await page.$(`.flight-weapon:nth-child(${slot+1})`);
    if(viewport.hasTouch)await button.tap();else await button.click();
    await page.waitForFunction(slot=>window.__DEBUG.game.player.combat.shellSlot===slot,{},slot);
    if(viewport.hasTouch){const p=await page.$eval('.cot-touch .fire:not(.alt)',el=>{const b=el.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});await page.touchscreen.touchStart(p.x,p.y);}
    else{await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down();}
    await page.waitForFunction(()=>window.__tracerSample?.heads>0,{timeout:15000});
    if(viewport.hasTouch)await page.touchscreen.touchEnd();else await page.mouse.up();
    const sample=await page.evaluate(()=>window.__tracerSample);
    assert.equal(sample.heads,1);assert.ok(sample.maxWidth>.2);assert.ok(sample.maxLength<=32.01);assert.ok(sample.maxLength>2);
    await page.screenshot({path:resolve(out,`${viewport.width}-${slot}.png`)});
    results.push({width:viewport.width,...sample});console.log('aerial-tracers:',JSON.stringify(results.at(-1)));
    await page.evaluate(()=>window.__restoreTracers());
    await new Promise(r=>setTimeout(r,1400));
   }
   await page.evaluate(()=>{document.exitPointerLock();window.__DEBUG.fx.resetAll();});
   assert.equal(await page.evaluate(()=>window.__DEBUG.fx.group.getObjectByName('Ballistic tracer ribbons and heads').geometry.instanceCount),0,'reset removes heads and ribbons');
   assert.deepEqual(errors,[],'no shader or page errors');await page.close();
  }
 });
 writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,results},null,2));
 console.log('aerial-tracers: all weapons, end-on heads, desktop/mobile and reset passed');
}finally{clearInterval(heartbeat);lock.release();}
