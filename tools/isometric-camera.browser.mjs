#!/usr/bin/env node
// Real settings and battle renderer, with desktop + short-phone rotation coverage.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {acquireCaptureLock,refreshCaptureLock,releaseCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions} from './native-browser-launch.mjs';
const out=resolve('.qa-dev/isometric');mkdirSync(out,{recursive:true});
let server,browser,lease;const errors=[],views=[];
await acquireCaptureLock(60000);lease=setInterval(refreshCaptureLock,60000);
try {
 server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5207,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});await server.listen();
 browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:true,args:['--use-gl=angle','--enable-webgl','--no-sandbox'],protocolTimeout:240000}));
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1280,height:800,hasTouch:false,isMobile:false});
 await page.goto('http://127.0.0.1:5207/?nosplash=1&tier=desktop',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction('window.__GAME_READY && window.__DEBUG',{timeout:240000});
 console.log('Garage ready');
 await page.evaluate(()=>__DEBUG.settings.open());
 await page.click('[data-tab="gameplay"]');
 const selector='button[aria-label="Isometric view: ON"]';
 const button=await page.waitForSelector(selector);await button.scrollIntoView();await button.click();
 assert.equal(await button.evaluate(el=>el.getAttribute('aria-pressed')),'true');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cot.settings.v1')).isometricView),true);
 await page.screenshot({path:resolve(out,'settings.png')});
 await page.evaluate(()=>__DEBUG.settings.close({noRelock:true}));
 await page.evaluate(()=>__DEBUG.startBattle('m1a2','verdant'));
 await page.waitForFunction('window.__DEBUG.game.phase === "battle" && !window.__DEBUG.rig.cinematicActive && window.__DEBUG.camera.fov === 38',{timeout:180000});
 console.log('Isometric battle ready');
 await page.mouse.click(640,400);
 await page.waitForFunction('__DEBUG.input.isLocked()');
 const before=await page.evaluate(()=>__DEBUG.rig.aimPoint.toArray());
 await page.mouse.move(710,370,{steps:8});
 await new Promise(r=>setTimeout(r,250));
 const after=await page.evaluate(()=>__DEBUG.rig.aimPoint.toArray());
 assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>1,'native mouse moves overhead aim');
 await page.keyboard.down('KeyW');await new Promise(r=>setTimeout(r,800));await page.keyboard.up('KeyW');
 let touch=false;
 for(const [width,height] of [[1280,800],[568,256],[320,568],[844,390]]) {
  const nextTouch=width<1000;
  await page.setViewport({width,height,hasTouch:nextTouch,isMobile:false});
  if(nextTouch!==touch){
   await page.waitForFunction('window.__GAME_READY && window.__DEBUG',{timeout:240000});
   await page.evaluate(()=>__DEBUG.startBattle('m1a2','verdant'));
   await page.waitForFunction('__DEBUG.game.phase === "battle" && __DEBUG.camera.fov === 38',{timeout:180000});
   touch=nextTouch;
  }
  await new Promise(r=>setTimeout(r,1200));
  const view=await page.evaluate(()=>{
   const d=__DEBUG,p=d.game.player,c=d.camera,center=p.visual.root.position.clone();
   center.y+=p.spec.dims.heightM*.6;c.updateMatrixWorld(true);center.project(c);
   return {fov:c.fov,mode:d.rig.mode,center:[center.x,center.y],clearance:c.position.y-p.state.pos.y,finite:d.rig.aimPoint.toArray().every(Number.isFinite)};
  });
  assert.equal(view.fov,38);assert.equal(view.mode,'ARCADE');assert.ok(view.finite);
  assert.ok(Math.abs(view.center[0])<.08 && Math.abs(view.center[1])<.08,JSON.stringify(view));
  assert.ok(view.clearance>20);
  views.push({width,height,...view});
  await page.screenshot({path:resolve(out,`battle-${width}x${height}.png`)});
 }
 await page.evaluate(()=>__DEBUG.rig.enterSniper());
 await page.waitForFunction('__DEBUG.rig.mode === "SNIPER" && __DEBUG.camera.userData.scoped');
 await page.evaluate(()=>__DEBUG.rig.exitSniper(true));
 await page.waitForFunction('__DEBUG.camera.fov === 38');
 await page.evaluate(()=>__DEBUG.input.setSetting('isometricView',false));
 await page.waitForFunction('__DEBUG.camera.fov === 60');
 await page.evaluate(()=>__DEBUG.input.setSetting('isometricView',true));
 await page.waitForFunction('__DEBUG.camera.fov === 38');
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,views,errors},null,2));
 console.log('Isometric settings, persistence, live battle, four viewports, sniper return and live toggle passed');
} finally {clearInterval(lease);await browser?.close();await server?.close();releaseCaptureLock();}
