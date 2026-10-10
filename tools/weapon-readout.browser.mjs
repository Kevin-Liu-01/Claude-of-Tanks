// Production HUD regression. Execute via capture-command.mjs shared lease.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const modulePath=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const {chromium}=await import(modulePath);
// Page load under machine load: COT_NAV_TIMEOUT_MS / COT_READY_TIMEOUT_MS raise the fixture's navigation and HUD-ready
// waits (30 s each by default) and COT_NAV_RETRIES retries a load that timed out.
const NAV_TIMEOUT_MS=Number(process.env.COT_NAV_TIMEOUT_MS)||30000, READY_TIMEOUT_MS=Number(process.env.COT_READY_TIMEOUT_MS)||30000;
const NAV_RETRIES=Math.max(0,Math.floor(Number(process.env.COT_NAV_RETRIES)||0));
const server=await createServer({server:{host:'127.0.0.1',port:5378,hmr:false},logLevel:'error'});
const out=resolve('.qa-dev/weapon-readout');await mkdir(out,{recursive:true});
let browser;
try {
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 for(const [name,width,height,touch=false] of [['desktop',1440,900],['short',844,390],['phone',390,844],['touch',667,375,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture=`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/battle-hud-layout.html`;
  for(let attempt=0;;attempt++){
   try{
    await page.goto(fixture,{waitUntil:'networkidle',timeout:NAV_TIMEOUT_MS});
    await page.waitForFunction(()=>!!window.__HUD_LAYOUT,null,{timeout:READY_TIMEOUT_MS}); // the fixture's HUD may finish installing after network idle
    break;
   }catch(error){
    if(attempt>=NAV_RETRIES||!/timeout/i.test(String(error?.message??error)))throw error;
    console.warn(`[weapon-readout] ${name}: fixture load timed out (attempt ${attempt+1} of ${NAV_RETRIES+1}); retrying`);
   }
  }
  await page.clock.install();await page.evaluate(()=>window.__HUD_LAYOUT.state('reports'));await page.clock.runFor(100);
  await page.evaluate(()=>{
   const f=window.__HUD_LAYOUT, primary=document.querySelector('.cot-si-card');window.__PRIMARY=primary;
   for(let i=0;i<90;i++)f.bus.emit('shell:hit',{attackerId:f.frame.player.id,targetId:f.tanks[8].id,
    targetName:'Target',shellId:500+i,caliberMm:12.7,shellName:'M2',shellType:'AP',kind:i%3?'nonpen':'pen',damage:i%3?0:1});
  });
  if(!touch){
   assert.ok(await page.evaluate(()=>window.__PRIMARY===document.querySelector('.cot-si-card')),`${name}: MG leaves main card intact`);
   assert.match(await page.locator('.cot-si-card .cot-si-mg-burst').textContent(),/90 hits/);
   await page.evaluate(()=>window.__HUD_LAYOUT.bus.emit('ui:shotLog',{}));
   assert.equal(await page.locator('.cot-si-log .cot-si-lrow').count(),12,'six primary plus six received entries survive');
   assert.equal(await page.locator('.cot-si-log .cot-si-mg-burst').count(),1);
   await page.evaluate(()=>window.__HUD_LAYOUT.bus.emit('ui:shotLog',{}));
  }
  await page.evaluate(()=>{
   const f=window.__HUD_LAYOUT;
   const missile={attackerId:f.frame.player.id,targetId:f.tanks[8].id,targetSpecId:'leo2a5',targetName:'Target',shellId:999,
    caliberMm:150,guided:true,shellType:'HEAT',shellName:'Guided missile',kind:'pen',damage:400,dmgRoll:450,
    penRollMm:700,effectiveMm:300,flightDistM:240,localPos:[0,1,2],localDir:[0,0,-1]};
   f.bus.emit('shell:hit',missile);
   f.bus.emit('shell:hit',{...missile,targetId:'blast-1',kind:'he_splash',damage:90});
   f.bus.emit('shell:hit',{...missile,targetId:'blast-2',kind:'he_splash',damage:60});
  });
  await page.clock.runFor(100);
  if(!touch){
   assert.equal(await page.locator('.cot-si-card').getAttribute('data-damage'),'400');
   assert.match(await page.locator('.cot-si-kicker').textContent(),/Missile impact/);
   assert.match(await page.locator('.cot-si-missile-blast').textContent(),/2 vehicles.*150 damage/);
   // A phone's summary hides its schematic (responsiveSurfaces.css, battleHudLayout.css); a hidden box measures
   // 0,0,0,0, which no card contains, so only rendered boxes are measured and the phone asserts the hiding itself.
   const layout=await page.locator('.cot-si-card').evaluate(card=>{
    const b=card.getBoundingClientRect(),boxes=[...card.querySelectorAll('.cot-si-diag .box')].filter(n=>n.getClientRects().length);
    return {shown:boxes.length,fits:boxes.every(n=>{const r=n.getBoundingClientRect();return r.bottom<=b.bottom+1&&r.top>=b.top-1;})};
   });
   if(name==='phone')assert.equal(layout.shown,0,'phone: the summary hides its schematic');
   else assert.ok(layout.shown===2&&layout.fits,`${name}: schematic fits reserved summary space`);
   await page.screenshot({path:resolve(out,`${name}.png`)});
  }else assert.equal(await page.locator('.cot-si-card').count(),0,'touch does not build desktop cards');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('weapon-readout: real HUD primary preservation, MG history, missile splash and responsive layout PASS');
}finally{await browser?.close();await server.close();}
