// Committed native-browser regression: real Garage, battle entry, flight input and compact HUD.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession, openGamePage, beginSoloBattle } from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/six-modes');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;
const reports=[];

try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);
 console.log('six-modes: acquired native capture slot');
 await withMapProbeSession({root:process.cwd(),launch:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},async({browser,port})=>{
  for(const mobile of [false,true]) {
  const initialViewport=mobile?{width:568,height:320,deviceScaleFactor:1,isMobile:true,hasTouch:true}:{width:1280,height:800};
  const suffix=mobile?'touch':'desktop';
  const {page,errors}=await openGamePage(browser,{port,viewport:initialViewport});
  page.on('console',message=>{if(message.type()==='error')console.error('browser:',message.text().slice(0,500));});
  await page.click('.cot-battle-mode');
  for(const mode of ['juggernaut','infected','realistic','gun_game','drone','ac130']){
   const choice=await page.waitForSelector(`.cot-battle-menu [data-game-mode="${mode}"]`,{visible:true});
   await choice.scrollIntoView();
   if(mobile)await choice.tap();else await choice.click();
   assert.equal(await choice.evaluate(el=>el.getAttribute('aria-pressed')),'true',`${mode} selected through the garage control`);
  }
  await page.screenshot({path:resolve(out,`garage-modes-${suffix}.png`)});
  await page.click('[data-battle-close]');
  for(const mode of ['drone','ac130','juggernaut','infected','realistic','gun_game']){
   await page.evaluate(async mode=>{const {writeTeamArrangement}=await import('/src/game/teamArrangement.ts');writeTeamArrangement(mode,{allies:1,enemies:2});},mode);
   console.log('six-modes: entering',mode,suffix);
   await beginSoloBattle(page,{specId:'m1a2',mapId:'verdant',gameMode:mode});
   assert.equal(await page.evaluate(()=>window.__DEBUG.game.gameMode),mode);
   if(mode==='drone'){
    if(mobile)await page.tap('.cot-drone-control');
    else {await page.mouse.click(640,400);await page.keyboard.press('KeyV');}
    await page.waitForFunction(()=>window.__DEBUG.game.player.aerial?.active,{timeout:10000});
    await page.waitForFunction(()=>!window.__DEBUG.game.player.aerial.launching,{timeout:10000});
    const before=await page.evaluate(()=>{const v=window.__DEBUG.game.player.aerial;return{x:v.x,y:v.y,z:v.z};});
    if(mobile){
     const box=await page.$eval('.cot-touch .joy',el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,dy:r.height*.35};});
     await page.touchscreen.touchStart(box.x,box.y);await page.touchscreen.touchMove(box.x,box.y-box.dy);
     await new Promise(r=>setTimeout(r,1200));await page.touchscreen.touchEnd();
    }else {await page.keyboard.down('KeyW');await new Promise(r=>setTimeout(r,1200));await page.keyboard.up('KeyW');}
    const after=await page.evaluate(()=>{const v=window.__DEBUG.game.player.aerial;return{x:v.x,y:v.y,z:v.z};});
    assert.ok(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z)>3,'pilot movement flies the drone');
    await page.screenshot({path:resolve(out,`drone-flight-${suffix}.png`)});
    if(mobile)await page.tap('.cot-drone-control');else await page.keyboard.press('KeyV');await page.waitForFunction(()=>!window.__DEBUG.game.player.aerial.active);
    reports.push({mode,mobile,before,after,returned:true});
   }else if(mode==='ac130'){
    const before=await page.evaluate(()=>({...window.__DEBUG.game.player.aerial}));
    await new Promise(r=>setTimeout(r,1200));
    const after=await page.evaluate(()=>({...window.__DEBUG.game.player.aerial}));
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>1,'aircraft orbits during play');
    assert.equal(await page.evaluate(()=>window.__DEBUG.game.player.spec.gun.shells[1].caliberMm),152);
    reports.push({mode,mobile,before,after});
   }else reports.push({mode,mobile,state:await page.evaluate(()=>window.__DEBUG.game.matchModeState)});
   if(mode==='gun_game')assert.equal(await page.$$eval('.cot-shell:not([hidden])',els=>els.length),1,'Gun Game exposes only the current weapon');
   if(mode==='juggernaut')assert.match(await page.$eval('.cot-mode-status',el=>el.textContent),/SURVIVE/,'the boss receives its own survival objective');
   await page.screenshot({path:resolve(out,`${mode}-${suffix}.png`)});
   await page.evaluate(()=>document.exitPointerLock());
   await page.setViewport({...initialViewport,width:568,height:320,deviceScaleFactor:1});
   await new Promise(r=>setTimeout(r,400));
   await page.screenshot({path:resolve(out,`${mode}-landscape-${suffix}.png`)});
   const objective=await page.$eval('.cot-mode-status',el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};}).catch(()=>null);
   if(objective)assert.ok(objective.left>=-1&&objective.right<=569&&objective.bottom<=320,`${mode} objective fits landscape`);
   await page.evaluate(()=>window.__DEBUG.leaveBattleToGarage());
   await page.waitForFunction(()=>window.__DEBUG.game.phase==='garage',{timeout:180000});
   await page.setViewport(initialViewport);
  }
  assert.deepEqual(errors,[],'no page errors');
  await page.close();
  }
  writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,reports},null,2));
  console.log('six-modes: all mode entries, FPV controls, orbit and compact screenshots passed');
 });
}finally{clearInterval(heartbeat);lock.release();}
