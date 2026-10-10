// Production HUD/award DOM regression; no WebGL or frame-rate claims.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const modulePath=process.argv.find(a=>a.startsWith('--playwright-module='))?.split('=').slice(1).join('=')||'playwright';
const {chromium}=await import(modulePath);
const out=resolve('.qa-dev/objective-banner');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5364,hmr:false},logLevel:'error'});let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 for(const [name,width,height,locale='en-US']of [['desktop',1440,900],['portrait',390,844],['narrow',320,568],['landscape',667,375],['tiny',568,256],['small',480,270],['zh',667,375,'zh-CN']]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
  for(const mode of ['capture_the_flag','endless_horde','mars','standard']){
   await page.evaluate(mode=>{const h=window.__HUD_LAYOUT;h.bus.emit('battle:presented',{});h.state('mode-'+mode);h.bus.emit('service:medal',{id:'chain_of_thought'});h.bus.emit('mode:flag_captured',{team:'player'});},mode);
   await page.waitForSelector('.cot-medal-toast.show',{state:'attached'});await page.waitForTimeout(120);
   const state=await page.evaluate(()=>{
    const rect=s=>{const n=document.querySelector(s);return n&&n.getClientRects().length?n.getBoundingClientRect().toJSON():null;};
    const n=document.querySelector('.cot-medal-toast');
    return {banner:rect('.cot-medal-toasts'),card:rect('.cot-medal-toast'),objective:rect('.cot-mode-status.show'),score:rect('.cot-top'),notice:rect('.cot-sixth.on'),placement:document.querySelector('.cot-medal-toasts').dataset.placement,alert:rect('.cot-alert.show'),alertClip:getComputedStyle(document.querySelector('.cot-alert')).clipPath,obstacles:[...document.querySelectorAll('.cot-sixth.on,.cot-kill-lane,.cot-vehicle-controls,.cot-shells,.cot-dp,.cot-minimap,.cot-touch.on .round,.cot-touch.on .joy,.cot-cons')].filter(n=>n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(n=>({name:n.className,...n.getBoundingClientRect().toJSON()})),clip:getComputedStyle(n).clipPath,overflow:n.scrollWidth>n.clientWidth+1};
   });
   const {banner,card,objective,score,notice}=state;
   const bottom=(objective||score).bottom;
   assert.ok(state.alert.top-bottom>=15.5,`${name}/${mode}: objective alert gap ${state.alert.top-bottom}`);
   assert.match(state.alertClip,/polygon/);
   assert.equal(state.alertClip.split(',').length,6);
   if(state.placement==='deferred'){if(mode==='capture_the_flag')await page.screenshot({path:resolve(out,name+'.png')});results.push({name,mode,deferred:true});continue;}
   assert.ok(banner.top-bottom>=15.5,`${name}/${mode}: gap ${banner.top-bottom}`);
   assert.ok(card.x>=0&&card.right<=width&&card.bottom<=height,`${name}/${mode}: card fits ${JSON.stringify(card)}`);
   assert.equal(state.overflow,false,`${name}/${mode}: content fits hex padding`);
   assert.match(state.clip,/polygon/);assert.equal(state.clip.split(',').length,6,'six sides');
   for(const box of state.obstacles)assert.ok(Math.min(box.right,card.right)-Math.max(box.left,card.left)<=0 || Math.min(box.bottom,card.bottom)-Math.max(box.top,card.top)<=0,`${name}/${mode}: banner overlaps ${box.name} ${JSON.stringify(state)}`);
   if(mode==='capture_the_flag')await page.screenshot({path:resolve(out,name+'.png')});
   results.push({name,mode,gap:banner.top-bottom,passed:true});
  }
  // A deferred award survives longer than its usual lifetime, then gets its
  // full presentation when a resize frees space.
  await page.waitForTimeout(3500);
  if(await page.locator('.cot-medal-toasts').getAttribute('data-placement')==='deferred')assert.equal(await page.locator('.cot-medal-toast').count(),1);
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{const h=window.__HUD_LAYOUT;h.state('mode-capture_the_flag');h.bus.emit('service:medal',{id:'chain_of_thought'});});
  await page.waitForSelector('.cot-medal-toasts[data-placement=ready] .cot-medal-toast');
  // Rotation updates the gap without a new battle or banner.
  await page.setViewportSize({width:height,height:width});await page.waitForTimeout(150);
  assert.ok(await page.evaluate(()=>document.querySelector('.cot-medal-toasts').getBoundingClientRect().top-Math.max(document.querySelector('.cot-top').getBoundingClientRect().bottom,document.querySelector('.cot-mode-status.show')?.getBoundingClientRect().bottom||0)>=15.5));
  assert.deepEqual(errors,[]);await context.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log(`objective banners: ${results.length} mode/viewport cases plus rotation PASS`);
}finally{await browser?.close();await server.close();}
