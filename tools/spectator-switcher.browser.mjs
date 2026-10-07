// DOM-only production HUD: responsive geometry and real spectator actions, no GPU/timing claims.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {mapProbeServerOptions} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/spectator-switcher');mkdirSync(out,{recursive:true});
let server,browser;
try{
 server=await createServer(mapProbeServerOptions(process.cwd(),resolve('.qa-dev/spectator-vite')));
 await server.listen();const port=server.httpServer.address().port;
 browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu','--disable-webgl']});
 for(const [width,height,touch] of [[1920,1080,false],[1280,720,false],[844,390,false],[844,390,true],[568,320,true],[480,240,true],[390,844,true],[320,568,true]]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width,height,isMobile:touch,hasTouch:touch});
  await page.goto(`http://127.0.0.1:${port}/tools/fixtures/battle-hud-layout.html`);
  await page.waitForFunction(()=>!!window.__HUD_LAYOUT,{timeout:60000});
  await page.evaluate(()=>{
   const {hud,bus,state}=window.__HUD_LAYOUT;state('spectator');
   hud.stageSpectateBar({name:'OldNikolai',vehicle:'T-72B3',specId:'t72b3_x',count:3,index:1});
   window.__spectatorCycles=[];bus.on('spectate:cycle',p=>window.__spectatorCycles.push(p.direction));
  });
  await page.waitForFunction(()=>{const img=document.querySelector('.cot-spec .portrait img');return img?.complete&&img.naturalWidth>0;});
  await new Promise(r=>setTimeout(r,400));
  const check=await page.evaluate(()=>{
   const bar=document.querySelector('.cot-spec'),bounds=bar.getBoundingClientRect();const issues=[];
   if(bounds.x<0||bounds.y<0||bounds.right>innerWidth+1||bounds.bottom>innerHeight+1)issues.push('bar outside viewport');
   for(const el of bar.querySelectorAll('button')){
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    if(r.width<44||r.height<44)issues.push('small control');
    if(!hit||!el.contains(hit))issues.push('control obstructed');
   }
   const map=document.querySelector('.cot-minimap');
   if(map?.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})){
    const r=map.getBoundingClientRect();if(Math.min(r.right,bounds.right)>Math.max(r.left,bounds.left)+1&&Math.min(r.bottom,bounds.bottom)>Math.max(r.top,bounds.top)+1)issues.push('minimap overlap');
   }
   return {issues,height:bounds.height};
  });
  await page.screenshot({path:resolve(out,`${width}x${height}-${touch?'touch':'mouse'}.png`)});
  assert.deepEqual(check.issues,[],`${width}x${height}/${touch}`);
  await page.click('.cot-spec .next');await page.click('.cot-spec .prev');
  assert.deepEqual(await page.evaluate(()=>window.__spectatorCycles),[1,-1]);
  await page.evaluate(()=>window.__HUD_LAYOUT.hud.stageSpectateBar({name:'AnExtremelyLongCommanderNameForTruncation',vehicle:'M1A2 Abrams SEP v3 with a long designation',specId:'m1a2_sepv3_x',count:42,index:42}));
  assert.equal(await page.$eval('.cot-spec .idx',el=>el.textContent),'42 / 42');
  assert.equal(await page.$eval('.cot-spec .idx',el=>el.scrollWidth<=el.clientWidth),true,'large count fits between controls');
  await page.evaluate(()=>window.__HUD_LAYOUT.hud.stageSpectateBar({count:1,index:1}));
  assert.equal(await page.$$eval('.cot-spec .cycle',buttons=>buttons.every(b=>b.disabled)),true);
  assert.deepEqual(errors,[]);await page.close();
  console.log(`spectator: ${width}x${height} ${touch?'touch':'mouse'} layout, navigation and single-ally state passed (${check.height}px high)`);
 }
}finally{await browser?.close();await server?.close();}
