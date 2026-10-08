// Production Garage DOM regression, with isolated saved records. No WebGL/performance claims.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const arg=(key,fallback)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/service-record'));await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5362,hmr:false},logLevel:'error'});
let browser;const results=[];
try{
 await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
 for(const [name,width,height,locale='en-US']of [['desktop',1440,1000],['portrait',390,844],['narrow',320,568],['landscape',667,375],['tiny',568,256],['zh',667,375,'zh-CN']]){
  if(arg('case','')&&arg('case','')!==name)continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{
   const at=Date.UTC(2026,9,5,10);
   const medals=Object.fromEntries(['chain_of_thought','few_shot','first_blood','ace_gunner','steel_wall','long_shot','flag_runner','gunship_ace'].map((id,i)=>[id,{count:i+1,first:at-86400000,last:at}]));
   localStorage.setItem('cot.service.v1',JSON.stringify({version:1,medals,stats:{battles:120,wins:78,kills:420,damage:456780,bestChain:5,bestStreak:8,bestKills:9,longestKillM:1340},achievements:{chain_thinker:{tier:2,at}},unseen:['medal:chain_of_thought'],history:[{id:'test-battle',at,vehicleId:'m1a2',mapId:'verdant',mode:'standard',result:'victory',durationS:320,kills:4,damage:8240,shots:10,hits:8,bestChain:3,medals:['chain_of_thought','ace_gunner'],achievements:[],trace:[{t:30,specId:'t90m',distM:820,cause:'shot'},{t:38,specId:'leo2a5',distM:340,cause:'ammorack'}]}]}));
   localStorage.setItem('cot.profile.v2',JSON.stringify({version:2,matches:120,wins:78,losses:40,draws:2,kills:420,damage:456780,bestDamage:14230}));
  });
  await page.goto(`${url}/tools/fixtures/mobile-surfaces.html?locale=${locale}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__MOBILE_SURFACES);
  async function open(){
   if(await page.locator('.cot-record-trigger').isVisible())await page.locator('.cot-record-trigger').click();
   else {await page.locator('.cot-mobile-nav-trigger').click();await page.locator('[data-mobile-nav="record"]').click();}
   await page.waitForSelector('.cot-service-record.is-open');
  }
  await open();
  async function bounds(selector){
   const r=await page.locator(selector).first().boundingBox();assert.ok(r&&r.x>=-.5&&r.y>=-.5&&r.x+r.width<=width+.5&&r.y+r.height<=height+.5,`${name}: ${selector} fits`);
  }
  for(const tab of ['overview','medals','achievements','history']){
   await page.locator(`[data-record-tab="${tab}"]`).click();
   await bounds('.cot-service-record .cot-modal');await bounds('.cot-record-body');await bounds('.cot-service-record .cot-modal__close');
   assert.equal(await page.locator('.cot-record-body').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,`${name}/${tab}: no horizontal overflow`);
   await page.screenshot({path:resolve(out,`${name}-${tab}.png`)});
  }
  await page.locator('.cot-record-battle-what b').click();assert.equal(await page.locator('.cot-record-trace').isVisible(),true);
  await page.locator('[data-record-tab="medals"]').click();
  const medals=page.locator('.cot-record-medal [data-medal-tip]');assert.equal(await medals.count(),22);
  for(const index of [0,4,21]){
   const medal=medals.nth(index);await medal.scrollIntoViewIfNeeded();await medal.click();
   await page.waitForSelector('.cot-rich-tooltip:popover-open');await bounds('.cot-rich-tooltip');
   assert.ok((await page.locator('.tooltip-requirement p').textContent()).length>3);
   assert.ok(await medal.getAttribute('aria-describedby'));
   if(index===0)await page.screenshot({path:resolve(out,`${name}-tooltip.png`)});
   await page.keyboard.press('Escape');assert.equal(await page.locator('.cot-rich-tooltip').isVisible(),false,'Escape dismisses tooltip first');
   assert.equal(await page.locator('.cot-service-record').isVisible(),true);
  }
  // Focus alone reveals requirements; dismissal must not also close the record.
  await medals.first().scrollIntoViewIfNeeded();await medals.first().focus();await page.waitForSelector('.cot-rich-tooltip:popover-open');await page.keyboard.press('Escape');
  await page.locator('[data-record-tab="medals"]').press('ArrowRight');
  assert.equal(await page.locator('[data-record-tab="achievements"]').getAttribute('aria-selected'),'true',`${name}: keyboard tab selection, active=${await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,300))}`);
  await page.locator('.cot-service-record .cot-modal__close').focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('.cot-service-record').evaluate(n=>n.contains(document.activeElement)),true,'focus stays inside');
  await page.keyboard.press('Escape');await page.waitForSelector('.cot-service-record.is-open',{state:'hidden'});
  assert.equal(await page.locator('.cot-set.open').count(),0,'Escape does not open Settings behind record');
  assert.deepEqual(errors,[],`${name}: browser errors`);results.push({name,tabs:4,medals:22,passed:true});await context.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log(results);
}finally{await browser?.close();await server.close();}
