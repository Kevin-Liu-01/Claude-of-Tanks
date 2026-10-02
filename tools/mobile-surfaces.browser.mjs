#!/usr/bin/env node
// Real Garage/Settings/room owners. Landscape touch, browser-height pressure,
// and rotation; no renderer, duplicated CSS, force-clicks or live room creation.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/mobile-surfaces'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const reports=[],errors=[];
try {
for(const [name,width,height,locale='en-US'] of [
  ['small-phone',320,568],['phone',390,844],['short-landscape',568,256],['small-landscape',667,375],['landscape',844,390],['wide-landscape',932,430],
  ['tiny-landscape',568,320],['browser-landscape',844,300],['chinese-landscape',667,375,'zh-CN'],
]) {
  if(arg('case','')&&!arg('case','').split(',').includes(name))continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/mobile-surfaces.html?locale=${locale}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__MOBILE_SURFACES);
  const tap=async selector=>page.locator(selector).tap();
  async function check(label,selectors){
    const issues=await page.evaluate(selectors=>{
      const issues=[];
      for(const selector of selectors){
        const el=document.querySelector(selector);
        if(!el?.checkVisibility({checkVisibilityCSS:true})) {issues.push(`${selector}: not visible`);continue;}
        const r=el.getBoundingClientRect();
        if(r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)issues.push(`${selector}: outside viewport`);
        if(r.width<1||r.height<1)issues.push(`${selector}: collapsed`);
      }
      if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page spills horizontally');
      return issues;
    },selectors);
    reports.push({name,label,width:page.viewportSize().width,height:page.viewportSize().height,issues});
    if(issues.length)await page.screenshot({path:resolve(out,`${name}-${label}-FAIL.png`)});
  }
  async function closeDrawer(){
    await page.locator('.cot-dossier-close:visible,.cot-drawer-close:visible').first().tap();
  }
  async function reachable(selector){
    const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();
    const result=await el.evaluate(el=>{
      const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.height>=32 && r.width>=32 && !!hit && (el===hit||el.contains(hit));
    });
    assert.ok(result,`${name}: ${selector} reachable by touch`);
  }
  await check('garage',['.cot-battle-control','.cot-nav','.cot-garage-tools','.cot-garage .stats','.cot-carousel']);
  await tap('.cot-battle-mode');
  for(const mode of ['standard','capture_the_flag','zone_control','turbo_ball','endless_horde','frontline_assault','mars']){
    await tap(mode==='standard'?'.cot-battle-regular':`.cot-battle-choice[data-game-mode="${mode}"]`);
    await check(`setup-${mode}`,['.cot-battle-menu','.cot-battle-menu-head','.cot-battle-menu-foot']);
    for(const field of await page.locator('.cot-battle-details .cot-custom-select-trigger').all()){
      if(!await field.isVisible())continue;
      await field.tap();
      await check(`dropdown-${mode}`,['.cot-custom-select-list:popover-open']);
      await page.locator('.cot-custom-select-list:popover-open button:not([disabled])').last().tap();
    }
    await reachable('[data-battle-launch]');
  }
  await tap('[data-battle-close]');
  for(const panel of ['maps','appearance','equipment']){
    await tap(`button[data-garage-panel="${panel}"]`);
    await check(panel,[panel==='equipment'?'.cot-garage .stats':'.cot-leftcol']);
    if(panel==='maps'){
      const inspect=page.locator('.cot-map-card').filter({has:page.locator('.cot-map-select[aria-label="Verdant Fields"]')}).locator('.cot-map-inspect');
      assert.equal(await inspect.isDisabled(),true,'unselected map cannot be enlarged');
      await tap('.cot-map-select[aria-label="Verdant Fields"]');
      assert.equal(await page.locator('.cot-modal-root.is-open').count(),0,'first tap only selects the map');
      assert.equal(await inspect.isEnabled(),true,'selected map can now be enlarged');
      await tap('button[data-garage-panel="maps"]');
      await tap('.cot-map-select[aria-label="Verdant Fields"]');
      await page.locator('.cot-modal-root.is-open .cot-modal').waitFor({state:'visible'});
      await check('map-preview',['.cot-modal-root.is-open .cot-modal']);
      await page.locator('.cot-modal-root.is-open .cot-modal__close').tap();
    }
    if(panel==='appearance')await reachable('.cot-camos .cot-camo-card:not([hidden]):last-of-type');
    if(panel==='equipment')await reachable('.eqslot');
    await page.screenshot({path:resolve(out,`${name}-${panel}.png`)});
    await closeDrawer();
  }
  await page.evaluate(()=>window.__MOBILE_SURFACES.settings.open());
  for(const tab of ['gameplay','sound','graphics','language']){
    await tap(`[data-tab="${tab}"]`);
    await check(`settings-${tab}`,['.cot-set-panel','.cot-set-hdr','.cot-set-tabs','.cot-set-body','.cot-set-ftr']);
    await page.locator('.cot-set-body').evaluate(el=>el.scrollTop=el.scrollHeight);
    await reachable('.cot-set-close');
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  await check('settings-rotated',['.cot-set-panel','.cot-set-body','.cot-set-ftr']);
  await page.setViewportSize({width,height});await page.waitForTimeout(150);
  await check('settings-returned',['.cot-set-panel','.cot-set-body','.cot-set-ftr']);
  await tap('.cot-set-close');
  for(const mode of ['private','lan']){
    await page.evaluate(mode=>window.__MOBILE_SURFACES.menu.show(mode),mode);
    await reachable('[data-field="code"]');
    await check(`multiplayer-${mode}`,['.cot-play']);
    await page.evaluate(mode=>window.__MOBILE_SURFACES.menu.showRoomFailure('room_unreachable',mode),mode);
    await reachable('[data-room-failure="garage"]');
    await page.screenshot({path:resolve(out,`${name}-${mode}-failure.png`)});
    await page.evaluate(()=>window.__MOBILE_SURFACES.menu.hide());
  }
  await context.close();
}
} catch(e){errors.push(e.stack);} finally {
  await browser.close();
  await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
}
const failed=reports.filter(r=>r.issues.length);
console.log(`${reports.length} surface checks; ${failed.length} layout failures; ${errors.length} errors.`);
for(const r of failed)console.error(r.name,r.label,r.issues);
for(const e of errors)console.error(e);
if(failed.length||errors.length)process.exitCode=1;
