import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {withIsolatedCaptureBrowser} from './isolated-capture-browser.mjs';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions,verifyNativeBrowserLaunch} from './native-browser-launch.mjs';
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
const sources=['src/vehicles/battleGeometrySharing.ts','src/vehicles/tankFactoryCore.ts','tools/battle-geometry-sharing.browser.fixture.mjs','tools/battle-geometry-sharing.browser.selftest.mjs'];
const fingerprint=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const initial=fingerprint(),lock=createCaptureLock();await lock.acquire(45*60*1000);const refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();process.once('exit',()=>lock.release());
try{
 const result=await withIsolatedCaptureBrowser({root:process.cwd(),logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},plugins:[{name:'geometry-sharing-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/__geometry_sharing')return next();res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="icon" href="data:,"></head><body></body></html>');});}}]},nativeBrowserLaunchOptions({headless:'new',timeout:30000,protocolTimeout:180000,args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']}),async({server,browser})=>{
  verifyNativeBrowserLaunch(browser);const errors=[],page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(`http://127.0.0.1:${server.config.server.port}/__geometry_sharing`);
  const result=await page.evaluate(async()=>{const module=await import('/tools/battle-geometry-sharing.browser.fixture.mjs');return module.runBattleGeometrySharingFixture();});
  return {...result,errors,browser:await browser.version()};
 });
 assert.deepEqual(fingerprint(),initial,'measured source remained frozen');
 if(out){mkdirSync(resolve(out),{recursive:true});writeFileSync(resolve(out,'native.png'),Buffer.from(result.png.split(',')[1],'base64'));}
 delete result.png;result.sources=initial;if(out)writeFileSync(resolve(out,'report.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));assert.deepEqual(result.errors,[]);assert.equal(result.ok,true);assert.ok(result.geometriesAfter<result.geometriesBefore);assert.ok(result.gpuAfter<result.gpuBefore);assert.deepEqual(result.afterDisposal,{geometries:0,leases:0,attributeBytes:0});
}finally{clearInterval(refresh);lock.release();}
