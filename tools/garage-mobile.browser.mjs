#!/usr/bin/env node
// Full production Garage owners/catalogs: real taps, clipping, keyboard focus,
// drawers and rotation. No renderer or simulated multiplayer transport claims.
import { launchGuardedBrowser } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {createCaptureLock} from './capture-lock.mjs';
const arg=(key,fallback)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/garage-mobile'));await mkdir(out,{recursive:true});
const lease=createCaptureLock();await lease.acquire();const refresh=setInterval(()=>lease.refresh(),30000);
let server,browser;const reports=[],errors=[];
try{
 server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
 const url=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await launchGuardedBrowser(chromium, {headless:true,channel:'chrome',args:['--disable-gpu']});
 for(const [name,width,height,locale='en-US'] of [
 ['phone',390,844],['narrow-phone',320,568],['landscape',844,390],['small-landscape',667,375],
 ['tiny-landscape',568,320],['short-landscape',568,256],['minimum-landscape',480,240],['chinese-landscape',568,256,'zh-CN'],
 ]){
  if(arg('case','')&&!arg('case','').split(',').includes(name))continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(5000);let step='boot';
  page.on('pageerror',e=>errors.push(`${name}/${step}: ${e.message}`));
  const record=(label,issues=[])=>reports.push({name,label,width:page.viewportSize().width,height:page.viewportSize().height,issues});
  const box=async(selector)=>{
   const el=page.locator(selector).first();await el.waitFor({state:'visible'});
   // A shared modal un-hides on one frame and opens (rises from translateY(12px) at opacity 0) on the next: measure the
   // opened panel two frames on, not the invisible pre-open frame (the r5 '.cot-record-dialog outside viewport' race).
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const issues=await el.evaluate(el=>{const r=el.getBoundingClientRect();return r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5?['outside viewport']:[];});record(step+': '+selector,issues);
  };
  const reach=async(target)=>{
   const el=typeof target==='string'?page.locator(target).first():target;await el.scrollIntoViewIfNeeded();
   const check=await el.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);const issues=[];
    if(r.width<43.5||r.height<43.5)issues.push(`touch target ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
    if(r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)issues.push('outside viewport');
    if(!hit||!(hit===el||el.contains(hit)))issues.push('center blocked or clipped');
    if(!(el.getAttribute('aria-label')||[...(el.labels||[])].map(l=>l.textContent).join(' ')||el.textContent||'').trim())issues.push('missing accessible name');
    return {label:el.getAttribute('aria-label')||el.textContent,issues};});record(`${step}: ${check.label}`,check.issues);if(check.issues.length)await page.screenshot({path:resolve(out,`${name}-${step}-clipped.png`)});return el;
  };
  const tap=async target=>(await reach(target)).tap();
  const closeModal=async()=>{await box('.cot-modal-root.is-open .cot-modal');await tap('.cot-modal-root.is-open .cot-modal__close');};
  // the folded figures' more button opens the dossier (the 245 redesign); the band holds the slots, the paint and the acts
  const details=async()=>tap('.cot-overview-more');
  try{
   await page.goto(`${url}/tools/fixtures/mobile-surfaces.html?full=1&locale=${locale}`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>!!window.__MOBILE_SURFACES);
   step='garage';for(const selector of ['.cot-battle','.cot-battle-mode','.cot-multiplayer-entry','.cot-gear','.cot-mobile-nav-trigger','.cot-overview-more','.cot-lt-loadout .eqslot','.cot-lt-paint-all','[data-lt-anatomy]','[data-lt-test-drive]'])await reach(selector);
   for(const chip of await page.locator('.cot-country-chip').all()){await tap(chip);await reach(page.locator('.cot-card:visible').last());}
   await tap(page.locator('.cot-country-chip').first());
   await page.screenshot({path:resolve(out,`${name}-garage.png`)});
   step='navigation';await tap('.cot-mobile-nav-trigger');
   for(const item of await page.locator('.cot-mobile-nav-menu button').all())await reach(item);
   await tap('[data-mobile-nav="environment"]');await box('.cot-c-menu__pop:popover-open');await tap(page.locator('.cot-c-menu__pop:popover-open .cot-c-picker__opt').last());
   await tap('.cot-mobile-nav-trigger');await tap('[data-mobile-nav="record"]');await box('.cot-record-dialog');await tap('.cot-modal-root.is-open .cot-modal__close');
   // the battlefields: the battle card opens the Deploy screen, whose field holds the battlefield picker
   step='maps';await tap('.cot-battle-mode');await tap('[data-deploy-field]');await box('[data-deploy-field-pop]');
   await page.locator('[data-deploy-bf] .cot-c-picker__opt').first().waitFor();assert.ok(await page.locator('[data-deploy-bf] .cot-c-picker__opt').count()>25);
   await reach(page.locator('[data-deploy-bf] .cot-c-picker__opt').last());
   await page.locator('[data-deploy-bf] .cot-c-picker__grid').evaluate(el=>el.scrollTop=0);await page.screenshot({path:resolve(out,`${name}-maps.png`)});
   await tap('[data-deploy-field]');await tap('[data-battle-close]');
   step='appearance';await tap('.cot-lt-paint-all');await box('.cot-leftcol');
   await tap('.cot-drawer-actions .cot-info-trigger');await closeModal();
   // the camo picker (INTERACTION-REDESIGN B): each kind chip filters the swatches and a second tap lets it go
   for(const chip of await page.locator('.cot-camo-picker [data-chip^="tag:"]').all()){await tap(chip);await tap(chip);}
   await reach(page.locator('.cot-camo-picker .cot-c-picker__opt').last());
   await page.locator('.cot-camos').evaluate(el=>el.scrollTop=0);await page.screenshot({path:resolve(out,`${name}-camo.png`)});
   await tap('.cot-camo-picker .cot-c-picker__opt[data-id="custom"]');await box('.cot-modal-root.is-open .cot-modal');
   for(const button of await page.locator('.cot-modal-root.is-open button:not([disabled])').all())await reach(button);
   for(const input of await page.locator('.cot-custom-color input,.cot-custom-repeat input,.cot-custom-check').all())await reach(input);
   await tap('.cot-custom-brushes [data-value=round]');await tap('.cot-custom-draw');
   await tap('.cot-modal-root.is-open .cot-modal__footer .cot-c-btn--primary');
   assert.ok(await page.evaluate(()=>window.__MOBILE_SURFACES.customPaint.get(window.__MOBILE_SURFACES.garage.getSelected())?.strokes.length>0),'touch drawing applies to the selected tank');
   await page.screenshot({path:resolve(out,`${name}-custom-camo.png`)});await closeModal();await tap('.cot-drawer-close');
   step='dossier';await details();await box('.cot-garage .stats');
   for(const section of await page.locator('.stats>.cot-stat-section').all())assert.ok(await section.isVisible(),'every dossier section is available');
   assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.cot-technical-tab')].filter((tab)=>tab.getClientRects().length).length),0,'the sheet leaves the drawing choice to the viewer');
   await tap('[data-technical-expand]');
   assert.ok((await page.locator('.cot-technical-viewer-figure img').boundingBox()).height>=80,'expanded diagram remains readable on short screens');
   for(const tab of await page.locator('.cot-technical-viewer-tab').all()){await tap(tab);assert.equal(await tab.getAttribute('aria-selected'),'true');}
   await closeModal();
   assert.equal(await page.locator('.cot-garage').getAttribute('data-garage-panel'),'equipment','expanded schematic returns to the dossier');
   assert.ok(await page.locator('.stats .cot-info-trigger:visible').count()>=9,'all dossier chapters are available');
   for(const info of await page.locator('.stats .cot-info-trigger:visible').all()){await tap(info);await closeModal();}
   for(const link of await page.locator('.stats [data-gallery-layer]').all())await reach(link);
   for(const row of await page.locator('.cot-performance-grid .srow').all())assert.ok(await row.isVisible(),'every performance metric remains visible');
   await page.locator('.stats').evaluate(el=>el.scrollTop=0);await page.screenshot({path:resolve(out,`${name}-dossier.png`)});
   await tap('.cot-dossier-close');
   step='equipment';await tap('.cot-lt-loadout .eqslot');await box('.cot-eqpick');
   assert.equal(await page.locator('.cot-eqpick .cot-c-picker__opt[aria-selected="true"]').evaluate(el=>el===document.activeElement),true,'picker focuses the slot\'s own item');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('.cot-eqpick').evaluate(el=>el.contains(document.activeElement)),true,'picker traps backwards Tab');
   for(const category of ['fire','recon','mobility','survival']){
    const chip=page.locator(`.cot-eqpick [data-chip="tag:${category}"]`);if(!await chip.count())continue;
    await tap(chip);await reach(page.locator('.cot-eqpick .cot-c-picker__opt').last());await tap(chip);
   }
   await page.screenshot({path:resolve(out,`${name}-equipment.png`)});
   await page.setViewportSize({width:height,height:width});await page.waitForTimeout(100);await box('.cot-eqpick');await reach('.cot-eqpick .ph .x');
   await page.setViewportSize({width,height});await page.waitForTimeout(100);await tap(page.locator('.cot-eqpick .cot-c-picker__opt:not([aria-disabled="true"]):not([data-id="empty"])').last());
   assert.equal(await page.locator('.cot-eqpick').isVisible(),false);assert.equal(await page.locator('.eqslot[data-slot="0"]').evaluate(el=>el===document.activeElement),true,'equipment selection restores slot focus');
   await tap('.cot-lt-loadout .eqslot');await page.keyboard.press('Escape');
   assert.equal(await page.locator('.cot-eqpick').isVisible(),false,'Escape closes the picker');
   assert.equal(await page.locator('.cot-garage').getAttribute('data-garage-panel'),null,'Escape closes only the picker');
   step='room-garage';
   for(const mode of ['private','lan']){
    await page.evaluate(mode=>window.__MOBILE_SURFACES.garage.setRoomStatus({mode,roomCode:'ABC123',ready:false,canSetReady:true,readyCount:27,total:28}),mode);
    for(const control of ['.cot-room-ready','.cot-room-reminder','.cot-lt-paint-all','.cot-lt-loadout .eqslot'])await reach(control);
    await details();await box('.stats');await tap('.cot-dossier-close');
   }
   await page.evaluate(()=>window.__MOBILE_SURFACES.garage.setRoomStatus(null));
   step='rotation';await page.setViewportSize({width:height,height:width});await page.waitForTimeout(100);await details();await box('.cot-garage .stats');await tap('.cot-dossier-close');
   record('page width',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1?['horizontal page overflow']:[]));
  }catch(e){errors.push(`${name}/${step}: ${e.stack}`);await page.screenshot({path:resolve(out,`${name}-${step}-FAIL.png`)});}
  await context.close();
 }
}finally{await browser?.close();await server?.close();clearInterval(refresh);lease.release();await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));}
const failed=reports.filter(r=>r.issues.length);console.log(`${reports.length} checks; ${failed.length} layout/accessibility failures; ${errors.length} errors.`);
for(const r of failed)console.error(r.name,r.label,r.issues);for(const e of errors)console.error(e);
if(failed.length||errors.length)process.exitCode=1;
