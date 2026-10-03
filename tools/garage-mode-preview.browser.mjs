// Native Garage regression: selected modes, tank swaps, idle animation, and clean battle return.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession, openGamePage, beginSoloBattle } from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/garage-mode-preview');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;
async function selectMode(page,mode){
 await page.click('.cot-battle-mode');
 const selector=mode==='standard'?'.cot-battle-menu [data-mode="solo"]':`.cot-battle-menu [data-game-mode="${mode}"]`;
 const choice=await page.waitForSelector(selector,{visible:true});
 await choice.scrollIntoView();await choice.click();await page.click('[data-battle-close]');
}
function previewState(){
 const root=window.__DEBUG.pedestalVisual?.root;if(!root)return null;
 let shield=0;root.traverse(o=>{if(o.isMesh&&[].concat(o.material).some(m=>m.name==='Juggernaut surface highlight'))shield++;});
 return {shield,drone:!!root.getObjectByName('Docked FPV mission payload'),flag:!!root.getObjectByName('Capture flag assembly')};
}
try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);
 console.log('garage-mode-preview: acquired native capture slot');
 await withMapProbeSession({root:process.cwd(),launch:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},async({browser,port})=>{
  for(const viewport of [{width:1280,height:800},{width:568,height:320,isMobile:true,hasTouch:true}]){
   const mobile=!!viewport.isMobile,suffix=mobile?'landscape':'desktop';
   const {page,errors}=await openGamePage(browser,{port,viewport});
   page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text());});
   for(const id of mobile?['m1a2']:['m1a2','kf41_lynx_x','strv103']){
    await page.evaluate(id=>window.__DEBUG.selectGarageTank(id),id);
    await page.waitForFunction(id=>window.__DEBUG.pedestalVisual?.specId===id,{timeout:180000},id);
    for(const mode of ['juggernaut','drone','capture_the_flag','standard']){
     await selectMode(page,mode);
     await page.waitForFunction((fn,mode)=>{
      const state=(0,eval)(`(${fn})`)();
      return state&&!!state.shield===(mode==='juggernaut')&&state.drone===(mode==='drone')&&state.flag===(mode==='capture_the_flag');
     },{timeout:30000},previewState.toString(),mode);
     await new Promise(r=>setTimeout(r,400));
     await page.screenshot({path:resolve(out,`${id}-${mode}-${suffix}.png`)});
    }
   }
   if(!mobile){
    await selectMode(page,'juggernaut');
    await page.evaluate(async()=>{const {writeTeamArrangement}=await import('/src/game/teamArrangement.ts');writeTeamArrangement('juggernaut',{allies:1,enemies:2});});
    await beginSoloBattle(page,{specId:'m1a2',mapId:'verdant',gameMode:'juggernaut'});
    await page.evaluate(()=>window.__DEBUG.leaveBattleToGarage());
    await page.waitForFunction(()=>window.__DEBUG.game.phase==='garage'&&window.__GARAGE_ENTRY?.presentationUnready===false,{timeout:180000});
    await page.waitForFunction(fn=>(0,eval)(`(${fn})`)()?.shield>0,{timeout:30000},previewState.toString());
    await page.screenshot({path:resolve(out,'juggernaut-return-desktop.png')});
    await selectMode(page,'standard');
    await page.waitForFunction(fn=>(0,eval)(`(${fn})`)()?.shield===0,{timeout:30000},previewState.toString());
   }
   assert.deepEqual(errors,[],'no browser or shader errors');await page.close();
  }
 });
 console.log('garage-mode-preview: desktop, phone landscape, tank swaps, mode removal and selected Juggernaut return passed');
}finally{clearInterval(heartbeat);await lock.release();}
