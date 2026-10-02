// Live Garage and battle smoke integration; run at nice 19 under its own lease.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions} from './native-browser-launch.mjs';
const out=resolve('.qa-dev/smoke-live');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let server,browser,refresh;
const report={pass:false,garage:[],battle:null,errors:[]};
try{
 await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);
 server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5218,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});await server.listen();
 browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:true,args:['--use-gl=angle','--enable-webgl','--no-sandbox'],protocolTimeout:240000}));
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:5218/?qa=1&nosplash=1',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.__GAME_READY&&window.__DEBUG?.pedestalOnStage,{timeout:240000});
 await page.waitForSelector('#cot-boot',{hidden:true,timeout:60000});
 for(const id of ['kf41_lynx_x','kf51_x','ariete_c1_x','kf41_lynx_x','t14_x','ariete_c2_x','griffin_viper','t90a_burlak','challenger2','stb1','leo1a5','t14']){
  // Use the Garage's actual selection transaction and cached pedestal, with its engine context.
  await page.evaluate(id=>window.__DEBUG.selectGarageTank(id),id);
  await page.waitForFunction(id=>{const d=window.__DEBUG;return d.selectedSpecId===id&&d.pedestalVisual?.specId===id&&d.pedestalOnStage;},{timeout:120000},id);
  const sample=await page.evaluate(()=>{
   const d=window.__DEBUG,root=d.pedestalVisual.root,frames=[];root.updateMatrixWorld(true);
   root.traverse(o=>{if(o.userData.smokeSockets?.length)frames.push({name:o.name,count:o.userData.smokeSockets.length,visible:o.visible});});
   return{id:d.selectedSpecId,uuid:root.uuid,frames,version:document.querySelector('meta[name="application-version"]')?.content,quality:d.quality.resolvePresetName(),batchSaved:root.userData.staticBatchSavedDraws};
  });
  assert.ok(sample.frames.reduce((n,f)=>n+f.count,0)>=8,`${id}: functional tubes survive live Garage batching`);
  report.garage.push(sample);await page.screenshot({path:resolve(out,`garage-${id}.png`)});
 }
 assert.equal(report.garage[0].uuid,report.garage[3].uuid,'cached return retains the working visual');
 console.log('Live Garage smoke banks and cached return passed');
 await page.evaluate(()=>window.__DEBUG.startBattle('kf41_lynx_x','verdant',{randomRoster:false}));
 await page.waitForFunction(()=>{const d=window.__DEBUG;return d.game.phase==='battle'&&!d.rig.cinematicActive&&!(d.game.preBattleS>0);},{timeout:240000});
 await page.waitForFunction(()=>[...document.querySelectorAll('button.cot-auxiliary')].some(b=>!b.hidden&&!b.disabled&&b.querySelector('.sl')?.textContent==='Smoke'),{timeout:60000});
 await page.evaluate(()=>[...document.querySelectorAll('button.cot-auxiliary')].find(b=>!b.hidden&&b.querySelector('.sl')?.textContent==='Smoke').click());
 await page.waitForFunction(()=>window.__DEBUG.game.player?.combat?.auxiliary?.smoke?.canisters?.length>0,{timeout:30000});
 report.battle=await page.evaluate(()=>{const p=window.__DEBUG.game.player,a=p.combat.auxiliary;return{id:p.spec.id,charges:a.smokeCharges,canisters:a.smoke.canisters,source:a.smoke.source};});
 assert.equal(report.battle.id,'kf41_lynx_x');assert.equal(report.battle.charges,2);assert.equal(report.battle.canisters.length,12);
 await page.screenshot({path:resolve(out,'battle-launch.png')});
 await new Promise(r=>setTimeout(r,4000));await page.screenshot({path:resolve(out,'battle-screen.png')});
 assert.deepEqual(report.errors,[]);report.pass=true;console.log('KF41 live Smoke control launched all 12 canisters');
}finally{
 writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
 clearInterval(refresh);await browser?.close();await server?.close();lock.release();
}
