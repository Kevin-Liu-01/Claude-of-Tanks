// Real HUD integration; deterministic module states, no WebGL/performance claims.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {createCaptureLock} from './capture-lock.mjs';
const modulePath=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const {chromium}=await import(modulePath);
const out=resolve('.qa-dev/vehicle-status');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5368,hmr:false},logLevel:'error'});
let browser;const results=[];const capture=createCaptureLock();
function boxes(){return [...document.querySelectorAll('.cot-status-box:not([hidden])')].map(b=>({id:b.dataset.status,label:b.getAttribute('aria-label'),progress:b.style.getPropertyValue('--repair-fill'),tone:b.dataset.tone,...b.getBoundingClientRect().toJSON()}));}
try{
 await capture.acquire(60000);
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 for(const [name,width,height,touch=false,locale='en-US']of [
 ['desktop',1440,900],['short',844,390],['portrait-mouse',540,720],['phone',390,844,true],
 ['landscape',667,375,true],['tiny',568,256,true],['zh',1366,768,false,'zh-CN']]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>{
   const f=window.__HUD_LAYOUT;f.state('reports');f.roster(14,14);
   const c=f.frame.player.combat;c.modules.trackL.state='red';c.modules.trackL.repairT=5;
   f.frame.spotting.player={inBush:true,spotted:false};f.hud.update(f.frame);
  });
  await page.waitForTimeout(150);
  let visible=await page.evaluate(boxes);assert.equal(visible[0].id,'tracks');assert.equal(visible[0].progress,'0.5');
  await page.evaluate(()=>{const f=window.__HUD_LAYOUT;const c=f.frame.player.combat;c.modules.trackL.repairT=8;f.hud.update(f.frame);});
  assert.equal((await page.evaluate(boxes))[0].progress,'0.8');
  await page.evaluate(()=>{
   const f=window.__HUD_LAYOUT,c=f.frame.player.combat;c.fire.burning=true;
   for(const id of ['engine','gun','missileRack','roofGun','optics','ammoRack'])c.modules[id]={state:'red',repairT:3,hp:0,maxHp:100};
   c.crew.driver=false;f.hud.update(f.frame);
  });
  await page.waitForTimeout(150);visible=await page.evaluate(boxes);
  assert.ok(visible.length>=2&&visible.length<=4);assert.equal(visible[0].id,'fire');assert.equal(visible.at(-1).id,'more');
  const geometry=await page.evaluate(()=>{
   const read=s=>{const n=document.querySelector(s);return n?.checkVisibility({checkVisibilityCSS:true})?n.getBoundingClientRect().toJSON():null;};
   return {strip:read('.cot-vehicle-status'),panel:read('.cot-dp'),obstacles:['.cot-room-chat','.cot-si-toasthost','.cot-kill-lane.l','.cot-vehicle-controls','.cot-touch.on .joy','.cot-drive','.cot-touch.on .mobile-chrome'].map(read).filter(Boolean)};
  });
  for(const b of visible){assert.ok(b.left>=0&&b.right<=width+.5&&b.top>=0&&b.bottom<=height+.5,`${name}: out of viewport`);
   for(const o of geometry.obstacles)assert.ok(Math.min(b.right,o.right)-Math.max(b.left,o.left)<=.5||Math.min(b.bottom,o.bottom)-Math.max(b.top,o.top)<=.5,`${name}: overlaps ${JSON.stringify({b,o})}`);
  }
  assert.ok(geometry.strip.bottom<=geometry.panel.top-3,`${name}: sits above HP`);
  const mutations=await page.evaluate(async()=>{
   let count=0;const observer=new MutationObserver(records=>count+=records.length);
   observer.observe(document.querySelector('.cot-vehicle-status'),{attributes:true,childList:true,subtree:true,characterData:true});
   const f=window.__HUD_LAYOUT;for(let i=0;i<120;i++)f.hud.update(f.frame);
   await Promise.resolve();observer.disconnect();return count;
  });
  assert.equal(mutations,0,'unchanged status does not rewrite the DOM every frame');
  await page.locator('.cot-status-box[data-status=more]').click();
  const tip=page.locator('.cot-rich-tooltip:not([hidden])');await tip.waitFor({state:'visible'});
  assert.ok((await tip.textContent()).length>60,'overflow details are reachable');
  const tipRect=await tip.boundingBox();assert.ok(tipRect.x>=0&&tipRect.x+tipRect.width<=width+.5);
  await page.keyboard.press('Escape');
  await page.screenshot({path:resolve(out,name+'.png')});
  // Yellow modules remain visible without a repair fill; healthy/dead/garage clear them.
  await page.evaluate(()=>{const f=window.__HUD_LAYOUT,c=f.frame.player.combat;c.fire.burning=false;for(const m of Object.values(c.modules))m.state='ok';c.crew.driver=true;c.modules.trackL.state='yellow';f.hud.update(f.frame);});
  visible=await page.evaluate(boxes);assert.equal(visible[0].tone,'warning');assert.equal(visible[0].progress,'0');
  await page.evaluate(()=>{const f=window.__HUD_LAYOUT;f.frame.player.combat.destroyed=true;f.hud.update(f.frame);});
  assert.equal(await page.locator('.cot-vehicle-status').isVisible(),false);
  await page.evaluate(()=>window.__HUD_LAYOUT.hud.setMode('hidden'));
  assert.equal(await page.locator('.cot-vehicle-status').isVisible(),false);
  assert.deepEqual(errors,[]);results.push({name,passed:true});await context.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));
 console.log(`vehicle status: ${results.length} viewport/locale cases PASS; repair, priority, overflow, tooltips, clearance and lifecycle`);
}finally{await browser?.close();await server.close();capture.release();}
