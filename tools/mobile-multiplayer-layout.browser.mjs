#!/usr/bin/env node
// Production lobby/status owners with deterministic state. Transport proof is mp-p2p-e2e --mobile.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/mobile-multiplayer'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const reports=[],errors=[];let currentPage=null,currentLabel="";
const modes=['standard','capture_the_flag','zone_control','turbo_ball','endless_horde','frontline_assault','mars'];
try {
for(const [name,width,height,locale='en-US'] of [
 ['phone',390,844],['narrow-phone',320,568],['landscape',844,390],['small-landscape',667,375],['tiny-landscape',568,320],['short-landscape',568,256],['chinese-landscape',667,375,'zh-CN'],
]) {
 if(arg('case','')&&!arg('case','').split(',').includes(name))continue;
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(6000);
 page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
 const reach=async(selector)=>{
  const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();
  assert.ok(await el.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=44&&r.height>=44&&r.x>=0&&r.right<=innerWidth+.5&&r.y>=0&&r.bottom<=innerHeight+.5&&!!hit&&(el===hit||el.contains(hit));}),`${name}: ${selector} is a reachable 44px touch target`);
  assert.ok((await el.getAttribute('aria-label'))||(await el.textContent()).trim(),`${name}: ${selector} has a name`);
 };
 const record=async(label,selectors)=>{
  const issues=await page.evaluate(selectors=>{
   const issues=[],rects=[];
   for(const selector of selectors){const el=document.querySelector(selector);if(!el?.checkVisibility({checkVisibilityCSS:true}))continue;const r=el.getBoundingClientRect();
    if(r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)issues.push(`${selector} outside viewport`);
    rects.push({selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom});
   }
   for(let i=0;i<rects.length;i++)for(const b of rects.slice(i+1)){const a=rects[i];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)issues.push(`${a.selector} overlaps ${b.selector}`);}
   return issues;
  },selectors);
  reports.push({name,label,issues});
  if(issues.length)await page.screenshot({path:resolve(out,`${name}-${label}-FAIL.png`)});
 };
 await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/mobile-surfaces.html?locale=${locale}`,{waitUntil:'networkidle'});
 for(const transport of ['private','lan'])for(const mode of modes)for(const seat of ['host','client','spectator']){
  currentLabel=`${name}-${transport}-${mode}-${seat}`;
  await page.evaluate(args=>window.__MOBILE_SURFACES.room(...args),[transport,mode,seat]);
  assert.equal(await page.locator('.lobby .players .player').count(),seat==='spectator'?29:28);
  await reach('[data-action="leave"]');
  if(seat==='host'){await reach('[data-action="start"]');assert.equal(await page.locator('[data-action="start"]').isEnabled(),true);}
  else assert.equal(await page.locator('[data-action="start"]').isVisible(),false);
  if(seat==='spectator')assert.equal(await page.locator('[data-action="ready"]').isEnabled(),false);
  else {await reach('[data-action="ready"]');await page.locator('[data-action="ready"]').tap();assert.equal(await page.locator('[data-action="ready"]').getAttribute('aria-pressed'),'false',currentLabel);}
  for(const trigger of await page.locator('.lobby .menu-select-trigger:not(:disabled)').all()){
   await trigger.scrollIntoViewIfNeeded();await trigger.tap();
   await record(`${transport}-${mode}-${seat}-options`,['.menu-select.open .menu-select-list']);
   const option=page.locator('.menu-select.open .menu-select-list button').last();
   await option.scrollIntoViewIfNeeded();await option.tap();
  }
  const spill=await page.locator('.cot-play .panel').evaluate(el=>el.scrollWidth>el.clientWidth+1);
  reports.push({name,label:`${transport}-${mode}-${seat}`,issues:spill?['lobby spills horizontally']:[]});
  await page.locator('[data-action="leave"]').tap();
 }
 await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
 for(const mode of modes)for(const condition of ['healthy','reconnecting']){
  await page.evaluate(({mode,condition})=>{window.__HUD_LAYOUT.state(`mode-${mode}`);window.__HUD_LAYOUT.multiplayer(condition);},{mode,condition});
  await page.waitForTimeout(80);
  await record(`${mode}-${condition}`,['.cot-net','.cot-mp-strip','.cot-mp-banner:not([hidden]):not(.battle)','.cot-top','.cot-mode-status.show','.cot-sixth.on','.cot-touch.on .mobile-chrome','.cot-touch.on .fire','.cot-touch.on .joy','.cot-vehicle-controls']);
  await reach('.cot-mp-strip');await page.locator('.cot-mp-strip').tap();
  await record(`${mode}-${condition}-panel`,['.cot-mp-panel']);
  await reach('.cot-mp-panel .cot-mp-leave');
  await page.locator('.cot-mp-panel .cot-mp-leave').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cot-mp-strip').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.cot-mp-strip').evaluate(el=>el===document.activeElement),true);
 }
 await page.setViewportSize({width:height>width?568:320,height:height>width?256:568});
 await page.waitForTimeout(100);await reach('.cot-mp-strip');
 await page.locator('.cot-mp-strip').tap();await reach('.cot-mp-panel .cot-mp-leave');
 await page.screenshot({path:resolve(out,`${name}-rotated-panel.png`)});
 await page.locator('.cot-mp-panel .cot-mp-leave').tap();assert.equal(await page.evaluate(()=>window.__HUD_LEFT),true);
 reports.push({name,label:'rotate-and-leave',issues:[]});
 console.log(`${name}: lobby and battle checks finished`);
 await context.close();
}
} catch(e){errors.push(`${currentLabel}: ${e.stack}`);if(currentPage){await currentPage.screenshot({path:resolve(out,'error.png')});errors.push(await currentPage.evaluate(()=>JSON.stringify({commands:window.__MOBILE_SURFACES?.roomCommands.slice(-12),lobby:document.querySelector('.lobby')?.textContent,ready:document.querySelector('[data-action=ready]')?.outerHTML})));}}finally{await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));}
const failed=reports.filter(r=>r.issues.length);console.log(`${reports.length} multiplayer checks; ${failed.length} layout failures; ${errors.length} errors.`);
for(const r of failed)console.error(r.name,r.label,r.issues);for(const e of errors)console.error(e);
if(failed.length||errors.length)process.exitCode=1;
