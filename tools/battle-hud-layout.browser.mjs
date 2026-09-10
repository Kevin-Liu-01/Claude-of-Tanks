#!/usr/bin/env node
// Committed rendered regression; accepts an existing dev server and Playwright.
// node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5189 --out=/tmp/hud-check
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const arg = (name, fallback) => process.argv.find(v=>v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const { chromium } = await import(arg('playwright-module','playwright'));
const out = resolve(arg('out','outputs/battle-hud-layout'));
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome'});
const cases = [
  ['desktop',1920,1080,false],['laptop',1366,768,false],['laptop-short',1280,720,false],
  ['small-desktop',1024,600,false],['tablet-mouse',820,1180,false],['narrow-mouse',540,720,false],
  ['phone-mouse',390,844,false],['tablet',1024,768,true],['tablet-portrait',768,1024,true],
  ['phone',390,844,true],['small-phone',360,640,true],['landscape',844,390,true],
  ['small-landscape',667,375,true],['short-mouse',844,390,false],
  ['chinese-laptop',1280,720,false,'zh-CN'],['chinese-phone',390,844,true,'zh-CN'],
];
const states = ['idle','countdown','reports','log','chat','combined','spectator','settings','sniper','large-map','ammo-expanded','special','ended'];
const reports=[];const errors=[];
function measure(state){
  // Kept inside the serialized page callback so browser execution needs no
  // Node-side closure. Preserve selector/DOM order for overlap diagnostics.
  function collectVisibleRects(selectors){
    const rects=[];
    for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
      if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
      const r=el.getBoundingClientRect();
      if(r.width<1||r.height<1)continue;
      rects.push({name:el.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom});
    }
    return rects;
  }
  const selectors = state==='settings' ? ['.cot-set-hdr','.cot-set-tabs','.cot-set-body','.cot-set-ftr'] :
    state==='ended' ? ['.es-hero','.es-report','.es-actions'] :
    ['.cot-ear.l','.cot-ear.r','.cot-top','.cot-net','.cot-drive','.cot-dp','.cot-minimap',
     '.cot-si-toasthost','.cot-si-log.open','.cot-si-cardhost:not(:empty)',
     '.cot-room-chat:not([hidden])','.cot-spec.show','.cot-prebattle',
     '.cot-shell','.cot-con','.cot-special','.cot-touch.on .joy','.cot-touch.on .round',
     '.cot-touch.on .mobile-chrome'];
  const rects=collectVisibleRects(selectors);
  const failures=[];
  for(let i=0;i<rects.length;i++){
    const a=rects[i];
    if(a.x<-.5||a.y<-.5||a.right>innerWidth+.5||a.bottom>innerHeight+.5)failures.push(`offscreen: ${a.name}`);
    for(const b of rects.slice(i+1)){
      if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)
        failures.push(`${a.name} overlaps ${b.name}`);
    }
  }
  if(!rects.length) failures.push('no visible UI checked');
  const ammoTransitions=failures.length?[...document.querySelectorAll('.cot-shell')].map(el=>({
    className:el.className,ariaHidden:el.getAttribute('aria-hidden'),
    opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform,
    drawerOpen:el.parentElement.classList.contains('touch-open'),
    animations:el.getAnimations().map(animation=>({
      playState:animation.playState,currentTime:animation.currentTime,
      timing:animation.effect?.getComputedTiming(),
    })),
  })):undefined;
  return {failures,rects,body:document.body.dataset,ammoTransitions};
}
try {
  for (const [name,width,height,touch,locale='en-US'] of cases) {
    if(arg('case','')&&!arg('case','').split(',').includes(name))continue;
    const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,
      deviceScaleFactor:1,reducedMotion:arg('motion','reduce')});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
    await page.goto(`${arg('url','http://127.0.0.1:5189')}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
    // Exercise the real DOMTokenList/MutationObserver path. Removing a class
    // which is already absent still produces mutation records in browsers.
    // The HUD does this every battle update; it must not measure layout again.
    await page.waitForTimeout(180);
    const idleLayoutReads=await page.evaluate(async()=>{
      const root=document.querySelector('.cot-hud');
      const special=document.querySelector('.cot-special');
      const original=root.getClientRects;
      let reads=0;
      root.getClientRects=function(){reads++;return original.call(this);};
      try {
        for(let i=0;i<24;i++){
          special.classList.remove('pending');
          await new Promise(requestAnimationFrame);
        }
        await new Promise(requestAnimationFrame);
        return reads;
      } finally { root.getClientRects=original; }
    });
    if(idleLayoutReads>1)errors.push(`${name}: unchanged HUD caused ${idleLayoutReads} layout measurements`);
    async function check(state){
      const result=await page.evaluate(measure,state);
      if(state==='combined'||state==='spectator'||result.failures.length)
        await page.screenshot({path:resolve(out,`${name}-${state}.png`)});
      reports.push({name,...page.viewportSize(),touch,locale,state,...result});
      if(result.failures.length)console.log(`${name}/${state}: ${result.failures.join('; ')}`);
    }
    for(const state of states){
      await page.evaluate(state=>window.__HUD_LAYOUT.state(state),state);
      // ResizeObserver + its scheduled layout pass, and spectator's enter state.
      await page.waitForTimeout(state==='ended'?1600:500);
      if(state==='ammo-expanded'&&touch){
        await page.locator('.cot-shell.sel').click();
        await page.waitForTimeout(180);
        if(await page.locator('.cot-shell[aria-hidden="true"]').count())errors.push(`${name}: ammo drawer failed to expand`);
      }
      await check(state);
      if(state==='settings'){
        // Backward Tab at the first control must stay in Settings, not the HUD.
        await page.locator('.cot-set-close').focus();
        await page.keyboard.press('Shift+Tab');
        if(!await page.evaluate(()=>document.querySelector('.cot-settings').contains(document.activeElement)))
          errors.push(`${name}: Tab escaped Settings`);
        for(const tab of ['controls','sound','graphics','language']){
          const button=page.locator(`.cot-set-tab[data-tab="${tab}"]`);
          // Touch deliberately has no physical-keyboard binding tab.
          if(!await button.isVisible())continue;
          await button.click();
          await check('settings');
        }
      }
    }
    // Same open panels must survive a live resize and a larger minimap.
    await page.evaluate(()=>{window.__HUD_LAYOUT.state('combined');window.__HUD_LAYOUT.bus.emit('ui:minimapZoom',{});});
    await page.setViewportSize({width:height,height:width});
    await page.waitForTimeout(180);
    await check('resized-combined');
    await page.setViewportSize({width,height});
    await page.waitForTimeout(180);
    await check('returned-combined');
    // Production's killcam phase class must also veil non-HUD siblings.
    const veilLeaks=await page.evaluate(()=>{
      document.body.classList.add('cot-kc-live');
      const leaks=[...document.querySelectorAll('.cot-room-chat,.cot-touch,.cot-touch-aim')]
        .filter(el=>el.checkVisibility({checkVisibilityCSS:true})).map(el=>el.className);
      document.body.classList.remove('cot-kc-live');
      return leaks;
    });
    if(veilLeaks.length)errors.push(`${name}: cinematic veil leaked ${veilLeaks.join(', ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
}
const failed=reports.filter(r=>r.failures.length);
console.log(`${reports.length} state/viewport checks; ${failed.length} failed; ${errors.length} browser errors. ${out}`);
if(failed.length||errors.length){console.log(errors);process.exitCode=1;}
