// Native Garage regression: selected modes, tank swaps, idle animation, and clean battle return.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession, openGamePage, beginSoloBattle } from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/garage-mode-preview');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;const timings=[];
async function selectMode(page,mode){
 await page.click('.cot-battle-mode');
 const selector=mode==='standard'?'.cot-battle-menu [data-mode="solo"]':`.cot-battle-menu [data-game-mode="${mode}"]`;
 const choice=await page.waitForSelector(selector,{visible:true});
 await choice.scrollIntoView();await choice.click();await page.click('[data-battle-close]');
}
function previewState(){
 const root=window.__DEBUG.pedestalVisual?.root;if(!root)return null;
 let shield=0,carrier=0,infected=0;root.traverse(o=>{if(o.isMesh&&[].concat(o.material).some(m=>m.name==='Juggernaut surface highlight'))shield++;if(o.isMesh&&[].concat(o.material).some(m=>m.name==='Flag carrier surface highlight'))carrier++;if(o.isMesh&&[].concat(o.material).some(m=>m.name==='Infected surface highlight'))infected++;});
 const materials=new Set();root.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(/surface highlight/.test(m.name))materials.add(m.uuid);});
 return {programs:window.__DEBUG.renderer?.info.programs?.length??null,pending:window.__DEBUG.garageModePreviewPending,materials:[...materials].sort(),shield,carrier,infected,drone:!!root.getObjectByName('Docked FPV mission payload'),flag:!!root.getObjectByName('Capture flag assembly')};
}
try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);
 console.log('garage-mode-preview: acquired native capture slot');
 await withMapProbeSession({root:process.cwd(),launch:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},async({browser,port})=>{
  for(const viewport of [{width:1280,height:800},{width:568,height:320,isMobile:true,hasTouch:true}]){
   const mobile=!!viewport.isMobile,suffix=mobile?'landscape':'desktop';
   const {page,errors}=await openGamePage(browser,{port,viewport});
   page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text());});
   for(const id of mobile?['m1a2']:['m1a2_sepv3_x','kf41_lynx_x','strv103']){
    await page.evaluate(id=>window.__DEBUG.selectGarageTank(id),id);
    await page.waitForFunction(id=>window.__DEBUG.pedestalVisual?.specId===id,{timeout:180000},id);
    let priorEnergy=null;
    let visit=0;
    for(const mode of ['juggernaut','capture_the_flag','infected','drone','standard','juggernaut','standard','infected']){
     const resident=visit++>=5;
     const started=performance.now();
     await page.evaluate(()=>{window.__auraFrames=[];window.__auraMeasuring=true;let last=performance.now();const sample=now=>{if(!window.__auraMeasuring)return;window.__auraFrames.push(now-last);last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);});
     await selectMode(page,mode);
     await page.waitForFunction((fn,mode)=>{
      const state=(0,eval)(`(${fn})`)();
      return state&&!state.pending&&!!state.shield===(mode==='juggernaut')&&state.drone===(mode==='drone')&&state.flag===(mode==='capture_the_flag')&&!!state.carrier===(mode==='capture_the_flag')&&!!state.infected===(mode==='infected');
     },{timeout:30000},previewState.toString(),mode);
     const ready=await page.evaluate(previewState);
     const frameGaps=await page.evaluate(()=>{window.__auraMeasuring=false;return window.__auraFrames;});
     timings.push({id,mode,resident,viewport:suffix,readyMs:Math.round(performance.now()-started),programs:ready.programs,maxFrameMs:Math.round(Math.max(0,...frameGaps))});
     if(mode==='juggernaut'&&!resident)priorEnergy=ready.materials;
     if(resident&&mode!=='standard')assert.deepEqual(ready.materials,priorEnergy,'ordinary-mode round trips retain compiled aura materials');
     if(mode==='capture_the_flag'||mode==='infected')assert.deepEqual(ready.materials,priorEnergy,'aura modes reuse compiled materials');
     await new Promise(r=>setTimeout(r,80));
     await page.screenshot({path:resolve(out,`${id}-${mode}-${resident?'resident-':''}${suffix}.png`)});
    }
   }
   // Rapid menu choices must converge on the final selection without late effects.
   await page.click('.cot-battle-mode');
   await page.evaluate(()=>{for(const mode of ['juggernaut','drone','capture_the_flag','infected'])document.querySelector(`[data-game-mode="${mode}"]`).click();});
   await page.click('[data-battle-close]');
   await page.waitForFunction(fn=>{const s=(0,eval)(`(${fn})`)();return s&&!s.pending&&s.infected>0&&!s.flag&&!s.drone;},{timeout:30000},previewState.toString());
   if(!mobile){
    await selectMode(page,'juggernaut');
    await page.evaluate(async()=>{const {writeTeamArrangement}=await import('/src/game/teamArrangement.ts');writeTeamArrangement('juggernaut',{allies:1,enemies:2});});
    await beginSoloBattle(page,{specId:'m1a2_sepv3_x',mapId:'verdant',gameMode:'juggernaut'});
    const battleTime=await page.evaluate(()=>window.__DEBUG.game.timeS);
    await page.waitForFunction(start=>window.__DEBUG.game.timeS>start+1,{timeout:30000},battleTime);
    assert.deepEqual(errors,[],'SEP v3 Juggernaut advances without render exceptions');
    await page.evaluate(()=>window.__DEBUG.leaveBattleToGarage());
    await page.waitForFunction(()=>window.__DEBUG.game.phase==='garage'&&window.__GARAGE_ENTRY?.presentationUnready===false,{timeout:180000});
    await page.waitForFunction(fn=>{const s=(0,eval)(`(${fn})`)();return s&&!s.pending&&s.shield>0;},{timeout:30000},previewState.toString());
    const returned=await page.evaluate(previewState);
    await page.evaluate(()=>new Promise(resolve=>{let frames=0;function sample(){if(++frames===60)resolve();else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
    assert.deepEqual((await page.evaluate(previewState)).materials,returned.materials,'battle return retains Garage aura materials across frames');
    await page.screenshot({path:resolve(out,'juggernaut-return-desktop.png')});
    await selectMode(page,'standard');
    await page.waitForFunction(fn=>(0,eval)(`(${fn})`)()?.shield===0,{timeout:30000},previewState.toString());
   }
   assert.deepEqual(errors,[],'no browser or shader errors');await page.close();
  }
 });
 writeFileSync(resolve(out,'timings.json'),JSON.stringify(timings,null,2));
 console.log('garage-mode-preview: desktop, phone landscape, tank swaps, mode removal and selected Juggernaut return passed');
}finally{clearInterval(heartbeat);await lock.release();}
