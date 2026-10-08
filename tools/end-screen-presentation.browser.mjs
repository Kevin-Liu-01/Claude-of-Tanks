import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const arg=(key,fallback)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve('.qa-dev/debrief');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5363,hmr:false},logLevel:'error'});let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
 for(const [name,width,height,locale='en-US']of [['desktop',1440,1000],['portrait',390,844],['narrow',320,568],['landscape',667,375],['tiny',568,256],['zh',667,375,'zh-CN']]){
  if(arg('case','')&&arg('case','')!==name)continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/end-screen.html?locale=${locale}`,{waitUntil:'networkidle'});
  const bounds=async(selector)=>{const r=await page.locator(selector).first().boundingBox();assert.ok(r&&r.x>=-.5&&r.y>=-.5&&r.x+r.width<=width+.5&&r.y+r.height<=height+.5,`${name}: ${selector} fits ${JSON.stringify(r)}`);};
  for(const result of ['victory','defeat','draw']){
   await page.evaluate(result=>window.__DEBRIEF.show(result),result);
   await page.waitForFunction(()=>document.querySelector('[data-stat=accuracy] .v')?.textContent==='85');
   await page.screenshot({path:resolve(out,`${name}-debug.png`)});await bounds('.es-actions');await bounds('.es-view-tabs');await bounds('.es-report');
   assert.equal(await page.locator('.es-report').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,`${name}/${result}: no sideways scroll sizes=${await page.locator('.es-report').evaluate(n=>[n.clientWidth,n.scrollWidth,n.getBoundingClientRect().width].join(','))}: ${JSON.stringify(await page.locator('.es-report').evaluate(n=>[...n.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>n.getBoundingClientRect().right+1).map(e=>[e.className,e.getBoundingClientRect().width]).slice(0,12)))}`);
   assert.equal(await page.locator('.es-awards .aw').count(),5);
   assert.equal(await page.locator('.es-debrief.teams').isVisible(),false);
   await page.screenshot({path:resolve(out,`${name}-${result}.png`)});
   const medal=page.locator('[data-medal-tip]').first();await medal.scrollIntoViewIfNeeded();await medal.click();
   await page.waitForSelector('.cot-rich-tooltip:popover-open');await bounds('.cot-rich-tooltip');await page.keyboard.press('Escape');
   await page.locator('.es-combat-details summary').click();assert.equal(await page.locator('.es-stat-secondary').isVisible(),true);
   await page.locator('[data-report-view="teams"]').click();assert.equal(await page.locator('.es-tr').count(),42);
   await page.locator('.es-tr').last().scrollIntoViewIfNeeded();assert.equal(await page.locator('.es-tr').last().isVisible(),true);
   await page.screenshot({path:resolve(out,`${name}-${result}-teams.png`)});
  }
  await page.evaluate(()=>window.__DEBRIEF.show('victory',true));await bounds('.es-actions');assert.equal(await page.locator('.es-rematch').isVisible(),true);await page.locator('.es-rematch .cot-es-btn').last().scrollIntoViewIfNeeded();await bounds('.es-rematch .cot-es-btn:last-child');
  assert.equal(await page.locator('.es-rematch .cot-es-btn').count(),2);
  await page.evaluate(()=>window.__DEBRIEF.show('defeat',false,false));assert.equal(await page.locator('.es-awards').count(),0);
  assert.deepEqual(errors,[]);results.push({name,results:3,roster:42,passed:true});await context.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log(results);
}finally{await browser?.close();await server.close();}
