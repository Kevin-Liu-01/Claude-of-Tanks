// Production HUD regression. Execute via capture-command.mjs shared lease.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const modulePath=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const {chromium}=await import(modulePath);
const server=await createServer({server:{host:'127.0.0.1',port:5378,hmr:false},logLevel:'error'});
const out=resolve('.qa-dev/weapon-readout');await mkdir(out,{recursive:true});
let browser;
try {
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 for(const [name,width,height,touch=false] of [['desktop',1440,900],['short',844,390],['phone',390,844],['touch',667,375,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/battle-hud-layout.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__HUD_LAYOUT,null,{timeout:30000}); // the fixture's HUD may finish installing after network idle
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
   const fits=await page.locator('.cot-si-card').evaluate(card=>{
    const b=card.getBoundingClientRect();return [...card.querySelectorAll('.cot-si-diag .box')].every(n=>{
     const r=n.getBoundingClientRect();return r.bottom<=b.bottom+1&&r.top>=b.top-1;
    });
   });assert.ok(fits,`${name}: schematic fits reserved summary space`);
   await page.screenshot({path:resolve(out,`${name}.png`)});
  }else assert.equal(await page.locator('.cot-si-card').count(),0,'touch does not build desktop cards');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('weapon-readout: real HUD primary preservation, MG history, missile splash and responsive layout PASS');
}finally{await browser?.close();await server.close();}
