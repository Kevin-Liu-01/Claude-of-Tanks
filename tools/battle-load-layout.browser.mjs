#!/usr/bin/env node
// Render the production loading component; no duplicated CSS or roster layout.
// Run against Vite: node tools/battle-load-layout.browser.mjs --url=http://127.0.0.1:5204
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datumProblems } from './datum-census.mjs';
const arg = (name,fallback) => process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3) || fallback;
const { chromium } = await import(arg('playwright-module','playwright'));
const out = resolve(arg('out','.qa-dev/battle-load-layout'));
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const reports=[];
const errors=[];
function measure() {
  // (a side's row height token as its layout resolves it, read off a probe the side holds for a moment)
  const token = (el,name) => {const probe=document.createElement('div');probe.style.height=`var(${name})`;el.appendChild(probe);const h=probe.getBoundingClientRect().height;probe.remove();return h;};
  const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  return {
    cap:rect(document.querySelector('.cap')), area:rect(document.querySelector('.teams')), foot:rect(document.querySelector('.foot')),
    teams:[...document.querySelectorAll('.team')].map(el=>({
      ...rect(el), cards:el.classList.contains('cards')&&getComputedStyle(el.querySelector('.rows')).gridTemplateColumns.split(' ').length>1,
      rows:[...el.querySelectorAll('.row')].map(rect), open:el.querySelectorAll('.row.slot').length, full:token(el,'--bl-row-height'), least:token(el,'--bl-row-min'),
      // (a named card whose tank layer has not landed and whose silhouette is hidden: live 256's blank enemy plates)
      bare:[...el.querySelectorAll('.row.card:not(.slot)')].filter(card=>!card.classList.contains('hc-loaded')&&getComputedStyle(card.querySelector('.sil')??card).display==='none').length,
      viewport:rect(el.querySelector('.rows')), scrollHeight:el.querySelector('.rows').scrollHeight,
    })),
  };
}
/** Every row of a side at its form's one height (none squeezed or cut), and a card a seventh of its side (never one card
 *  stretched across it, live 255). */
function assertWholeRows(team,area,at) {
  const heights=team.rows.map(row=>row.height);
  assert.ok(Math.max(...heights)-Math.min(...heights)<0.5,`${at}: one row height (${Math.min(...heights)} to ${Math.max(...heights)})`);
  if(team.cards) for(const row of team.rows) assert.ok(row.width<=team.width/7+1,`${at}: a card a seventh of its side (${row.width} of ${team.width})`);
  // (a side shorter than its band keeps its rows at full height: a heading estimated short squeezed every side that fit,
  // seven at 1440 to 28 px rows, one beside a long side to 16 px under a scroll cue, live 255)
  if(team.height<area.height-1) assert.ok(Math.min(...heights)>=team.full-0.5,`${at}: a side with room at full height (${Math.min(...heights)} of ${team.full})`);
  // (a list scrolls only once its rows have given way to their least height)
  if(team.scrollHeight>team.viewport.height+2) assert.ok(Math.max(...heights)<=team.least+0.5,`${at}: a list scrolls only at its least rows (${Math.max(...heights)} over ${team.least})`);
}
/** The first painted frame's layout: a roster's rows, then the scroll marks its lists' observer sets before that paint. */
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
try {
  for (const [name,width,height,touch] of [
    // (the wide windows' hero cards, live 255's at about 2000 px: one card a seventh of its side, a partial side's open cards)
    ['wide',1920,1080,false],['ultra',2560,1440,false],
    ['desktop',1440,900,false],['laptop',1280,720,false],['tablet',820,1180,true],
    ['narrow-phone',320,568,true],['short-landscape',568,256,true],['phone',390,844,true],['landscape',844,390,true],['small-landscape',667,375,true],
    ['tiny-landscape',568,320,true],['browser-landscape',844,300,true],['wide-landscape',932,430,true],
  ]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
    // Delay silhouettes until every roster has been measured, reproducing asset arrival.
    let release; const assets=new Promise(resolve=>{release=resolve;});
    // (the served silhouettes and hero layers only: a glob on any /icons/ path held src/ui/icons/*.ts, a module the page
    // imports; the hero manifest passes, so the cards decorate while their layers are still held)
    await page.route(url=>url.pathname.startsWith('/icons/')&&!url.pathname.endsWith('.json'),async route=>{await assets;await route.continue();});
    await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/battle-load-layout.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.__LOAD_LAYOUT);
    const sizes=new Map();
    // (a side no roster names keeps its open seats: seven, the default split, on the first entry; its last count after)
    let seats=[7,7];
    for (const [allies,enemies] of [[0,0],[1,1],[2,2],[7,7],[14,14],[2,14],[14,3],[1,41],[41,1],[21,21],[64,64],[7,7]]) {
      await page.evaluate(([a,e])=>window.__LOAD_LAYOUT.roster(a,e),[allies,enemies]);
      await settle(page);
      const m=await page.evaluate(measure);
      seats=[allies||seats[0],enemies||seats[1]];
      for (const [i,count] of [allies,enemies].entries()) {
        const team=m.teams[i];
        // (never an empty side: live 255's host path drew the enemies as an empty bar)
        assert.equal(team.rows.length,count||seats[i],`${name} ${allies}v${enemies}: the named rows, a side named none its open seats`);
        assert.ok(team.rows.length>0,`${name} ${allies}v${enemies}: no side is empty`);
        assertWholeRows(team,m.area,`${name} ${allies}v${enemies} team ${i}`);
        assert.equal(team.bare,0,`${name} ${allies}v${enemies} team ${i}: a card keeps its silhouette until its layers land`);
        assert.ok(Math.abs(team.y+team.height/2-(m.area.y+m.area.height/2))<1,`${name}: center team ${i}`);
        assert.ok(team.y>=m.cap.bottom-1 && team.bottom<=m.foot.y+1,`${name}: team must not overlap header/footer`);
        assert.ok(team.x>=0 && team.right<=width,`${name}: team stays on screen`);
        // (a side of seven or fewer on a wide window is a row of hero cards, the direction's 10-battle-load, 118 to 156 px
        // with the window; no row past its form's height, none under its least, a short window's 14 px)
        for(const row of team.rows) assert.ok(row.height>=Math.max(14,team.least)-0.5 && row.height<=Math.min(team.full+0.5,team.cards?160:72),`${name} ${allies}v${enemies}: bounded readable row height (${row.height})`);
        if(count && count<=14 && height>=720) assert.ok(team.scrollHeight<=team.viewport.height+1,`${name}: all 14 rows visible on tall screens`);
      }
      // (one form for both sides: an uneven room at 1920 set one side's hero cards beside the other's sheet)
      assert.equal(m.teams[0].cards,m.teams[1].cards,`${name} ${allies}v${enemies}: both sides in one form`);
      // (a roster that fits its band; a longer one gives its rows' height way, to their least, before it scrolls)
      if(allies===enemies && allies && m.teams[0].height<m.area.height-1) sizes.set(allies,[m.teams[0].rows[0].height,m.teams[0].cards]);
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
    // every roster that fits, in the same form, keeps the same row height: the cards as seven's, the rows as one's
    for (const [count,[rowHeight,cards]] of sizes) {
      const reference=[...sizes.values()].find(([,form])=>form===cards)[0];
      assert.ok(Math.abs(rowHeight-reference)<0.1,`${name}: ${count} players must keep the same row height as its form's`);
    }
    // A roster that fills seat by seat (live 255's host path: the player first, the bots later) holds every seat from its
    // first frame and fills them in place: the same sides, rows and boxes at every step, no row squeezed or stretched.
    let filling=null;
    for (const [allies,enemies,s] of [[1,0,7],[4,3,7],[7,7,7],[1,0,14],[9,2,14],[14,14,14]]) {
      await page.evaluate(([a,e,n])=>window.__LOAD_LAYOUT.roster(a,e,n),[allies,enemies,s]);
      await settle(page);
      const m=await page.evaluate(measure);
      for (const [i,count] of [allies,enemies].entries()) {
        const team=m.teams[i];
        assert.equal(team.rows.length,s,`${name} ${allies}v${enemies} of ${s}: every seat a row, known or open`);
        assert.equal(team.open,s-count,`${name} ${allies}v${enemies} of ${s}: the unnamed seats open`);
        assertWholeRows(team,m.area,`${name} ${allies}v${enemies} of ${s} team ${i}`);
      }
      const boxes=m.teams.map(team=>[team.x,team.y,team.width,team.height,team.rows.map(row=>[row.x,row.y,row.width,row.height])]);
      if(filling&&filling.seats===s) assert.deepEqual(boxes,filling.boxes,`${name} ${allies}v${enemies} of ${s}: seats fill in place`);
      filling={seats:s,boxes};
    }
    await page.evaluate(()=>window.__LOAD_LAYOUT.roster(7,7));
    // (the cards decorated, their layers still held: each keeps its silhouette, never an empty plate)
    if((await page.evaluate(measure)).teams[0].cards) {
      await page.waitForFunction(()=>document.querySelectorAll('.team.foe .row.card.cot-hc').length===7,{timeout:30000});
      for(const [i,team] of (await page.evaluate(measure)).teams.entries()) assert.equal(team.bare,0,`${name}: side ${i}'s decorated cards keep their silhouettes until their layers land`);
    }
    const before=await page.evaluate(measure);
    release(); await page.waitForLoadState('networkidle');
    assert.deepEqual(await page.evaluate(measure),before,`${name}: late silhouettes must not shift layout`);
    await page.evaluate(()=>{window.__LOAD_LAYOUT.screen.progress(1,'Ready');window.__LOAD_LAYOUT.screen.countdown(3);});
    const ready=await page.evaluate(measure);
    assert.deepEqual(ready.teams,before.teams,`${name}: progress/countdown must not move rosters`);
    // one datum, one place (UI-LOCKDOWN part C, tools/datum-census.mjs)
    assert.deepEqual(await datumProblems(page),[],`${name}: one place a datum`);
    await page.screenshot({path:resolve(out,`${name}-7v7.png`)});
    await context.close();
  }
  assert.deepEqual(errors,[],'browser errors');
  await writeFile(resolve(out,'report.json'),JSON.stringify(reports,null,2));
  console.log(`PASS: ${reports.length} roster layouts; constant row heights, independent centering, bounds, late silhouettes and countdown stability, no empty side, one form for both sides, whole rows at full height where they fit, no bare card while its layers load and seats filling in place.`);
} finally { await browser.close(); }
