// Real Garage controls, custom dropdown, persistence, and short-screen access.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {mapProbeServerOptions} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/allied-nation');mkdirSync(out,{recursive:true});
// DOM-only fixture: no WebGL, GPU capture, or frame-time measurements.
let server,browser;
try{
 server=await createServer(mapProbeServerOptions(process.cwd(),resolve('.qa-dev/allied-nation-vite')));
 await server.listen();const port=server.httpServer.address().port;
 browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu','--disable-webgl','--disable-dev-shm-usage']});
  for(const [width,height] of [[1280,800],[568,320],[480,240]]){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.setViewport({width,height,isMobile:width<600,hasTouch:width<600});
   await page.goto(`http://127.0.0.1:${port}/tools/fixtures/mobile-surfaces.html?full=1`);
   await page.waitForFunction(()=>!!window.__MOBILE_SURFACES,{timeout:60000});
   await page.evaluate(()=>localStorage.removeItem('cot.game.teams.v1'));
   await page.click('.cot-battle-mode');
   const trigger=await page.waitForSelector('[data-mode-field="alliedNation"] + button',{visible:true});
   await trigger.scrollIntoView();await trigger.click();
   const option=await page.waitForSelector('.cot-custom-select-list:popover-open [data-value="player"]',{visible:true});
   const bounds=await option.boundingBox();
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,'option fits viewport');
   if(width<600)assert.ok(bounds.height>=44,'touch target');
   await option.click();
   assert.equal(await page.$eval('[data-mode-field="alliedNation"]',el=>el.value),'player');
   const preset=await page.$('.cot-battle-menu [data-sides="14v14"]');await preset.scrollIntoView();await preset.click();
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cot.game.teams.v1')).standard.alliedNation),'player');
   await page.reload();await page.waitForFunction(()=>!!window.__MOBILE_SURFACES,{timeout:60000});
   await page.click('.cot-battle-mode');
   assert.equal(await page.$eval('[data-mode-field="alliedNation"]',el=>el.value),'player','saved after reload');
   const saved=await page.$('[data-mode-field="alliedNation"] + button');await saved.scrollIntoView();
   await page.screenshot({path:resolve(out,`${width}x${height}.png`)});
   await saved.click();await page.click('.cot-custom-select-list:popover-open [data-value=""]');
   assert.equal(await page.$eval('[data-mode-field="alliedNation"]',el=>el.value),'','mixed can be restored');
   assert.deepEqual(errors,[]);await page.close();
   console.log(`allied-nation: ${width}x${height} custom selection, persistence, team-size change, reset passed`);
  }
}finally{await browser?.close();await server?.close();}
