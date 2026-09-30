#!/usr/bin/env node
// Actual shared component + mode owner; verifies state writes and keyboard/popover behavior.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/custom-select'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];let checked=0;
try {
  for(const [name,width,height,touch] of [['desktop',1280,800,false],['phone',390,844,true],['landscape',844,390,true]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/custom-select.html`,{waitUntil:'networkidle'});
    for(const mode of ['standard','capture_the_flag','zone_control','turbo_ball','endless_horde','frontline_assault','mars']) {
      await page.evaluate(mode=>window.__SELECT_TEST.arrangement.render(mode),mode);
      const keys=await page.locator('[data-mode-field]').evaluateAll(selects=>selects.filter(s=>!s.parentElement.hidden).map(s=>s.dataset.modeField));
      for(const key of keys) {
        const native=page.locator(`[data-mode-field="${key}"]`);
        assert.equal(await native.isVisible(),false,'native select is hidden');
        const trigger=page.locator(`[data-mode-field="${key}"] + .cot-custom-select-trigger`);
        const target=await native.evaluate(s=>s.options[s.options.length-1].value);
        await trigger.click();
        const list=page.locator('.cot-custom-select-list:popover-open');
        assert.equal(await list.count(),1,'one custom menu at a time');
        const rect=await list.boundingBox();
        assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=width+1 && rect.y+rect.height<=height+1,`${name} ${mode} ${key}: popup in viewport`);
        await list.locator(`[data-value="${target}"]`).click();
        assert.equal(await native.inputValue(),target);
        if(key==='enemyNation') assert.equal(await trigger.locator('.cot-flag').count(),1,'nation retains official flag');
        assert.equal(await page.evaluate(([mode,key])=>String(window.__SELECT_TEST.readTeamArrangement(mode)[key]),[mode,key]),target,'owner persists the selected setting');
        assert.equal(await list.count(),0,'selection dismisses menu');
        checked++;
      }
    }
    for(const id of ['gravity','caches']) {
      const trigger=page.locator(`#${id} + .cot-custom-select-trigger`);
      await trigger.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
      assert.equal(await page.locator(`#${id}`).evaluate(s=>s.selectedIndex),await page.locator(`#${id}`).evaluate(s=>s.options.length-1));
    }
    await page.evaluate(()=>{
      const {dynamic,controller}=window.__SELECT_TEST;
      dynamic.replaceChildren(new Option('Alpha','a'),new Option('Blocked','b'),new Option('Charlie','c'));
      dynamic.options[1].disabled=true;dynamic.value='a';controller.refresh();
    });
    const trigger=page.locator('#dynamic + .cot-custom-select-trigger');
    await trigger.focus();await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.value),'c','arrows skip disabled choice');
    await page.evaluate(()=>window.__SELECT_TEST.controller.refresh());
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.value),'c','same-state refresh preserves option focus');
    await page.keyboard.press('Enter');assert.equal(await page.locator('#dynamic').inputValue(),'c');
    assert.equal(await page.evaluate(()=>window.__SELECT_TEST.changes()),1,'one canonical change event');
    await trigger.click();await page.keyboard.press('a');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dynamic').inputValue(),'a','typeahead selects matching option');
    await trigger.click();await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    assert.equal(await trigger.evaluate(el=>document.activeElement===el),true,'Escape restores focus');
    await trigger.click();await page.locator('#outside').click();assert.equal(await page.locator(':popover-open').count(),0,'outside dismisses');
    await trigger.click();await page.evaluate(()=>{window.__SELECT_TEST.dynamic.disabled=true;window.__SELECT_TEST.controller.refresh();});
    assert.equal(await trigger.isDisabled(),true,'locked host field is disabled');
    assert.equal(await page.locator(':popover-open').count(),0,'locking field closes popup');
    await page.evaluate(()=>window.__SELECT_TEST.arrangement.render('mars'));
    await page.locator('#gravity + .cot-custom-select-trigger').click();
    await page.screenshot({path:resolve(out,`${name}.png`)});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${checked} persisted mode choices across desktop/phone/landscape; popup bounds, keyboard, flags control, refresh, disabled fields and dismissal.`);
} finally {await browser.close();}
