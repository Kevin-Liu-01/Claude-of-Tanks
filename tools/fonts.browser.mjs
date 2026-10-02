// Real first-paint HTML and UI fonts under delayed/failed delivery and warm cache.
// Only game simulation boot is stubbed; fonts, CSS and sign painting are production code.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions} from './native-browser-launch.mjs';

const out=resolve('.qa-dev/fonts');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let server,browser,refresh;
let delivery='normal',pending=[],requests=[];
const reports=[];
async function renderedFonts(page,selector){
  const session=await page.createCDPSession();
  try{
    await session.send('DOM.enable');await session.send('CSS.enable');
    const {root}=await session.send('DOM.getDocument');
    const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector});
    return (await session.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
  }finally{await session.detach();}
}
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try{
  await lock.acquire();refresh=setInterval(()=>lock.refresh(),30000);
  server=await createServer({logLevel:'error',plugins:[{name:'font-delivery-test',configureServer(vite){
    vite.middlewares.use((req,res,next)=>{
      const path=req.url?.split('?')[0];
      if(path==='/src/main.ts'){res.setHeader('Content-Type','text/javascript');res.end('');return;}
      if(!path?.startsWith('/fonts/')){next();return;}
      requests.push(path);
      const send=()=>{
        if(delivery==='failed'){res.statusCode=503;res.end('temporary font failure');return;}
        res.setHeader('Content-Type','font/woff2');res.setHeader('Cache-Control','public, max-age=3600');
        res.end(readFileSync(resolve('public',path.slice(1))));
      };
      if(delivery==='delayed')pending.push(send);else send();
    });
  }}],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
  await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:true,args:['--no-sandbox']}));
  for(const [name,width,height] of [['desktop',1440,900],['phone-landscape',568,320]]){
    const context=await browser.createBrowserContext(),page=await context.newPage();
    await page.setViewport({width,height});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    delivery='delayed';requests=[];pending=[];
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await frames(page);
    // Exceed optional's brief display period while the page remains readable.
    await new Promise(r=>setTimeout(r,350));
    const fallback=await renderedFonts(page,'.cot-boot-word .l1');
    assert.ok(fallback.length&&fallback.every(f=>!f.isCustomFont),'fallback paints while fonts are delayed');
    await page.screenshot({path:resolve(out,`${name}-fallback.png`)});
    await page.evaluate(async()=>{
      const {ensureFonts}=await import('/src/ui/fonts.ts');for(let i=0;i<20;i++)ensureFonts();
      const {makeSignTexture,mulberry32}=await import('/src/ui/garageStage.ts');
      window.fontTestSign=makeSignTexture(mulberry32(42),'BAY 01');
      window.fontTestSignBefore=window.fontTestSign.toDataURL();
    });
    assert.equal(await page.evaluate(()=>[...document.fonts].filter(f=>f.family.includes('ABC Monument')).length),3);
    delivery='normal';for(const release of pending)release();pending=[];
    await page.waitForFunction(()=>document.fonts.check("500 16px 'ABC Monument Grotesk'")&&document.fonts.check("700 16px 'ABC Monument Grotesk'"));
    await frames(page);
    const brand=await renderedFonts(page,'.cot-boot-word .l1');
    assert.ok(brand.some(f=>f.isCustomFont&&f.glyphCount>0),'late brand font is actually painted');
    const sign=await page.evaluate(async()=>{
      const {makeSignTexture,mulberry32}=await import('/src/ui/garageStage.ts');
      const after=window.fontTestSign.toDataURL();return{changed:after!==window.fontTestSignBefore,correct:after===makeSignTexture(mulberry32(42),'BAY 01').toDataURL()};
    });
    assert.deepEqual(sign,{changed:true,correct:true});
    await page.screenshot({path:resolve(out,`${name}-loaded.png`)});
    assert.equal(requests.length,2,'only Medium and Bold transfer, once each');
    const coldRequests=requests.length;
    await page.reload({waitUntil:'load'});await frames(page);
    assert.equal(requests.length,coldRequests,'warm reload reuses both cached font files');
    assert.ok((await renderedFonts(page,'.cot-boot-word .l1')).some(f=>f.isCustomFont));
    reports.push({name,brand,sign,fontRequests:coldRequests,warmAdditionalRequests:requests.length-coldRequests});
    await context.close();
  }
  // A genuinely unavailable font must not make text invisible or block the page.
  delivery='failed';requests=[];
  const context=await browser.createBrowserContext(),page=await context.newPage();
  await page.goto(base,{waitUntil:'load'});await frames(page);
  const fallback=await renderedFonts(page,'.cot-boot-word .l1');
  assert.ok(fallback.length&&fallback.every(f=>!f.isCustomFont));
  delivery='normal';await page.reload({waitUntil:'load'});await frames(page);
  assert.ok((await renderedFonts(page,'.cot-boot-word .l1')).some(f=>f.isCustomFont),'failed response does not poison the next visit');
  reports.push({name:'failed-download',readableFallback:true,nextVisitRecovered:true});
  await context.close();
  console.log('fonts browser: delayed desktop/mobile paint, canvas repaint, cached reload and failed-download recovery PASS');
}finally{
  for(const release of pending)release();
  writeFileSync(resolve(out,'report.json'),JSON.stringify(reports,null,2));
  clearInterval(refresh);await browser?.close();await server?.close();lock.release();
}
