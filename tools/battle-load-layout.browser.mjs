#!/usr/bin/env node
// Render the production loading component; no duplicated CSS or roster layout.
// Run against Vite: node tools/battle-load-layout.browser.mjs --url=http://127.0.0.1:5204
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const arg = (name,fallback) => process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3) || fallback;
const { chromium } = await import(arg('playwright-module','playwright'));
const out = resolve(arg('out','.qa-dev/battle-load-layout'));
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const reports=[];
const errors=[];
function measure() {
  const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  return {
    cap:rect(document.querySelector('.cap')), area:rect(document.querySelector('.teams')), foot:rect(document.querySelector('.foot')),
    teams:[...document.querySelectorAll('.team')].map(el=>({
      ...rect(el), rows:[...el.querySelectorAll('.row')].map(rect),
      viewport:rect(el.querySelector('.rows')), scrollHeight:el.querySelector('.rows').scrollHeight,
    })),
  };
}
try {
  for (const [name,width,height,touch] of [
    ['desktop',1440,900,false],['laptop',1280,720,false],['tablet',820,1180,true],
    ['narrow-phone',320,568,true],['short-landscape',568,256,true],['phone',390,844,true],['landscape',844,390,true],['small-landscape',667,375,true],
    ['tiny-landscape',568,320,true],['browser-landscape',844,300,true],['wide-landscape',932,430,true],
  ]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
    // Delay silhouettes until every roster has been measured, reproducing asset arrival.
    let release; const assets=new Promise(resolve=>{release=resolve;});
    await page.route('**/icons/**',async route=>{await assets;await route.continue();});
    await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/battle-load-layout.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.__LOAD_LAYOUT);
    const sizes=new Map();
    for (const [allies,enemies] of [[0,0],[1,1],[2,2],[7,7],[14,14],[2,14],[14,3],[1,41],[41,1],[21,21],[64,64],[7,7]]) {
      await page.evaluate(([a,e])=>window.__LOAD_LAYOUT.roster(a,e),[allies,enemies]);
      const m=await page.evaluate(measure);
      for (const [i,count] of [allies,enemies].entries()) {
        const team=m.teams[i];
        assert.equal(team.rows.length,count,`${name}: exact roster, no stale or blank rows`);
        assert.ok(Math.abs(team.y+team.height/2-(m.area.y+m.area.height/2))<1,`${name}: center team ${i}`);
        assert.ok(team.y>=m.cap.bottom-1 && team.bottom<=m.foot.y+1,`${name}: team must not overlap header/footer`);
        assert.ok(team.x>=0 && team.right<=width,`${name}: team stays on screen`);
        for(const row of team.rows) assert.ok(row.height>=15 && row.height<=72,`${name} ${allies}v${enemies}: bounded readable row height (${row.height})`);
        if(count && count<=14 && height>=720) assert.ok(team.scrollHeight<=team.viewport.height+1,`${name}: all 14 rows visible on tall screens`);
      }
      if(allies===enemies && allies) sizes.set(allies,m.teams[0].rows[0].height);
      // Both lists remain scrollable, independent of the header and footer.
      for(const list of await page.locator('.team .rows').all()) {
        assert.equal(await list.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none',`${name}: no roster scrollbar`);
        await list.evaluate(el=>el.scrollTop=el.scrollHeight);
        const reachable=await list.evaluate(el=>!el.lastElementChild||el.lastElementChild.getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom+1);
        assert.ok(reachable,`${name}: final loading roster entry is reachable`);
        await list.evaluate(el=>el.scrollTop=0);
      }
      if(allies===41||enemies===41)await page.screenshot({path:resolve(out,`${name}-${allies}v${enemies}.png`)});
      reports.push({name,allies,enemies,...m});
    }
    assert.ok(sizes.get(7)>=Math.min(64,sizes.get(14)*1.7,Math.max(15,(await page.locator('.teams').evaluate(el=>el.clientHeight)-30)/7-3))-1,`${name}: seven rows must expand into the available space`);
    assert.ok(sizes.get(2)>=sizes.get(7)-1,`${name}: smaller rosters retain larger rows`);
    const before=await page.evaluate(measure);
    release(); await page.waitForLoadState('networkidle');
    assert.deepEqual(await page.evaluate(measure),before,`${name}: late silhouettes must not shift layout`);
    await page.evaluate(()=>{window.__LOAD_LAYOUT.screen.progress(1,'Ready');window.__LOAD_LAYOUT.screen.countdown(3);});
    const ready=await page.evaluate(measure);
    assert.deepEqual(ready.teams,before.teams,`${name}: progress/countdown must not move rosters`);
    await page.screenshot({path:resolve(out,`${name}-7v7.png`)});
    await context.close();
  }
  assert.deepEqual(errors,[],'browser errors');
  await writeFile(resolve(out,'report.json'),JSON.stringify(reports,null,2));
  console.log(`PASS: ${reports.length} roster layouts; density, independent centering, bounds, late silhouettes and countdown stability.`);
} finally { await browser.close(); }
