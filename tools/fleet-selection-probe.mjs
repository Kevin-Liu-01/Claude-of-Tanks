// Real country/card input through both product selectors. Owns the capture
// queue. Timings end after UI/model convergence and two animation callbacks;
// they are browser readiness measurements, not physical display latency.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions,verifyNativeBrowserLaunch} from './native-browser-launch.mjs';
import '../src/vehicles/tankFactory.ts';
import {getSpec} from '../src/vehicles/specs.ts';
import {flagIconCode} from '../src/ui/flagCodes.ts';

const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const base=option('url'),out=option('out');
if(!base||!out)throw Error('Required --url=http://served-build --out=fresh-directory');
const doc=await readFile(new URL('../docs/tank-generation/fleet-style-performance-priority.md',import.meta.url),'utf8');
const targetTable=doc.slice(doc.indexOf('| First source-study wave'),doc.indexOf('Separate controls:'));
const ids=option('ids')?.split(',') || [...targetTable.matchAll(/`([a-z0-9_]+)`/g)].map(match=>match[1]);
if(!option('ids'))ids.push('leo2_revolution_proto','abramsx','m1a2','leclerc');
if(ids.length<2||new Set(ids).size!==ids.length)throw Error('At least two distinct IDs required');
ids.forEach(getSpec);
const directory=resolve(out);await mkdir(directory,{recursive:false});
const lock=createCaptureLock();let browser,refresh;
const report={protocol:'trusted-fleet-selection-readiness-v1',startedAt:new Date().toISOString(),
  url:base,ids,viewport:{width:1440,height:900,deviceScaleFactor:1},
  metric:'trusted pointerdown through matching visible selection, then two animation callbacks; Garage also requires a completed post frame',
  rows:[],errors:[],requestFailures:[],optionalAnalyticsFailures:[],buildHashes:{}};
try {
  await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();
  browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:'new',protocolTimeout:180000,
    args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']}));
  report.nativeLaunch=verifyNativeBrowserLaunch(browser);
  for(const mode of ['garage','gallery']) {
    const page=await browser.newPage();await page.setViewport(report.viewport);
    page.on('pageerror',error=>report.errors.push({mode,error:String(error)}));
    page.on('requestfailed',request=>{
      const row={mode,url:request.url(),error:request.failure()?.errorText};
      // The local preview has no Vercel Insights endpoint. Preserve that
      // optional telemetry failure separately from required product assets.
      const optional=new URL(request.url()).pathname==='/_vercel/insights/script.js';
      (optional?report.optionalAnalyticsFailures:report.requestFailures).push(row);
    });
    const url=new URL(mode==='gallery'?'/gallery':'/',base);
    for(const [key,value] of [['debug','1'],['nosplash','1'],['tier','desktop'],['gfxreset','1']])url.searchParams.set(key,value);
    const response=await page.goto(url.href,{waitUntil:'networkidle0',timeout:180000});
    report.buildHashes[mode]=createHash('sha256').update(await response.buffer()).digest('hex');
    await page.waitForFunction(mode=>mode==='garage'
      ? window.__GAME_READY&&window.__DEBUG?.pedestalVisual?.root?.visible
      : window.__TANK_GALLERY_READY===true,{timeout:180000},mode);
    const schedule=[...ids.map(id=>({id,visit:'first-pass'})),
      ...ids.slice(0,6).map(id=>({id,visit:'revisit-after-fleet'})),
      ...[ids[0],ids[1],ids[0],ids[1]].map(id=>({id,visit:'warm-alternation'}))];
    for(const item of schedule) {
      report.attempt={mode,...item};
      const before=await page.evaluate(mode=>mode==='garage'?{
        selected:window.__DEBUG.selectedSpecId,cache:window.__DEBUG.pedestalCacheIds,
        country:document.querySelector('.cot-country-chip.active,.cot-country-chip.sel,[data-country][aria-pressed="true"]')?.dataset.country,
      }:{selected:window.__TANK_GALLERY.getState().selectedId},mode);
      if(before.selected===item.id){report.rows.push({mode,...item,before,skipped:'already selected'});continue;}
      await page.evaluate(({mode,id})=>{
        const D=window.__DEBUG,serial=D?.post?.lastCompletedFrame?.serial||0;
        const state={id,start:null,trusted:false,readyMs:null,serialBefore:serial,pointerTarget:null,clickTarget:null};
        window.__FLEET_SELECTION_SAMPLE=state;
        document.addEventListener('click',event=>{state.clickTarget={specId:event.target.closest('[data-spec-id]')?.dataset.specId,
          galleryId:event.target.closest('[data-id]')?.dataset.id,country:event.target.closest('[data-country]')?.dataset.country};},{once:true,capture:true});
        const onPointer=event=>{
          if(state.start!==null)return;
          if(!event.target.closest(mode==='garage'?'.cot-card,.cot-country-chip':'.vehicle-card'))return;
          state.start=performance.now();state.trusted=event.isTrusted;
          state.pointerTarget={specId:event.target.closest('[data-spec-id]')?.dataset.specId,
            galleryId:event.target.closest('[data-id]')?.dataset.id,country:event.target.closest('[data-country]')?.dataset.country};
          document.removeEventListener('pointerdown',onPointer,true);
          const check=()=>{
            const debug=window.__DEBUG,visual=debug?.pedestalVisual;
            const converged=mode==='garage'
              ? debug.selectedSpecId===id&&visual?.specId===id&&visual.root.visible&&visual.root.parent
                && document.querySelector('.cot-card.sel')?.dataset.specId===id
                && debug.post.lastCompletedFrame?.serial>serial
              : window.__TANK_GALLERY.getState().selectedId===id
                && document.querySelector('#loadingState')?.classList.contains('hidden')
                && document.querySelector('.vehicle-card.active')?.dataset.id===id;
            if(converged)requestAnimationFrame(()=>requestAnimationFrame(()=>{state.readyMs=performance.now()-state.start;}));
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        };
        document.addEventListener('pointerdown',onPointer,true);
      },{mode,id:item.id});
      if(mode==='garage') {
        const country=flagIconCode(getSpec(item.id).nation);
        // The country button selects its remembered tank. The target card is
        // then clicked if needed, exactly as in the ordinary product flow.
        const cardVisible=await page.evaluate(id=>!!document.querySelector(`.cot-card[data-spec-id="${id}"]`)?.getClientRects().length,item.id);
        if(!cardVisible)await page.click(`.cot-country-chip[data-country="${country}"]`);
      }
      const selector=mode==='garage'?`.cot-card[data-spec-id="${item.id}"]`:`.vehicle-card[data-id="${item.id}"]`;
      await page.waitForSelector(selector,{visible:true,timeout:60000});
      const element=await page.$(selector);await element.scrollIntoView();await element.click();await element.dispose();
      try{await page.waitForFunction(()=>window.__FLEET_SELECTION_SAMPLE?.readyMs!==null,{timeout:120000,polling:'raf'});}
      catch(error){
        report.attempt.diagnostic=await page.evaluate(selector=>{
          const D=window.__DEBUG,v=D?.pedestalVisual,card=document.querySelector(selector),r=card?.getBoundingClientRect();
          const hit=r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;
          return {sample:window.__FLEET_SELECTION_SAMPLE,selected:D?.selectedSpecId,visual:{id:v?.specId,visible:v?.root?.visible,parent:v?.root?.parent?.name},
            serial:D?.post?.lastCompletedFrame?.serial,selectedCard:document.querySelector('.cot-card.sel')?.dataset.specId,
            hit:hit?{tag:hit.tagName,className:hit.className,specId:hit.closest('[data-spec-id]')?.dataset.specId}:null};
        },selector);throw error;
      }
      const result=await page.evaluate(()=>window.__FLEET_SELECTION_SAMPLE);
      if(!result.trusted||!(result.readyMs>=0))throw Error(`${mode}/${item.id}: missing trusted input timing`);
      report.rows.push({mode,...item,before,...result});
      await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));
      console.log(`[fleet-selection] ${mode}/${item.visit}/${item.id}: ${result.readyMs.toFixed(1)} ms`);
    }
    await page.screenshot({path:resolve(directory,`${mode}-final.png`)});await page.close();
  }
} catch(error) {report.errors.push(String(error));process.exitCode=1;}
finally {
  if(browser)await browser.close();if(refresh)clearInterval(refresh);lock.release();
  report.finishedAt=new Date().toISOString();
  report.passed=report.errors.length===0&&report.requestFailures.length===0
    &&['garage','gallery'].every(mode=>ids.every(id=>report.rows.some(row=>row.mode===mode&&row.id===id&&row.visit==='first-pass'&&(row.trusted||row.skipped==='already selected'))));
  await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));
}
if(!report.passed)throw Error(`Fleet selection failed; see ${directory}/report.json`);
