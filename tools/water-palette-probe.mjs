// Same-scene native material experiment. It certifies resource parity and
// stable controls, not art acceptance, timing, or changed production code.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions,verifyNativeBrowserLaunch} from './native-browser-launch.mjs';
import {settleMapTextures,captureTimingBackend} from './map-environment-acquisition.mjs';
import {settleResidencyTerrain} from './world-residency-acquisition.mjs';
import {selectBattleWeather} from '../src/engine/battleWeatherPolicy.ts';
const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const url=option('url'),map=option('map'),poses=option('poses'),out=option('out');
const tier=option('tier')??'desktop',night=process.argv.includes('--night');
if(!['desktop','mobile'].includes(tier))throw Error('Expected desktop or emulated mobile tier');
if(!url||!map||!poses||!out)throw Error('Required --url --map --poses --out=fresh-directory');
const candidate={color:Number(option('color')),opacity:Number(option('opacity')),roughness:Number(option('roughness'))};
if(!Number.isInteger(candidate.color)||candidate.color<0||candidate.color>0xffffff
 ||![candidate.opacity,candidate.roughness].every(v=>Number.isFinite(v)&&v>0&&v<1))throw Error('Invalid material values');
const views=JSON.parse(await readFile(poses,'utf8')).filter(v=>!v.unresolved);
const dir=resolve(out);await mkdir(dir,{recursive:false});
const lock=createCaptureLock(),report={map,tier,night,candidate,views:[],errors:[]};let browser,refresh;
try{
 await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();
 browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:'new',protocolTimeout:240000,
  args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']}));
 report.nativeLaunch=verifyNativeBrowserLaunch(browser);
 const page=await browser.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(new URL(`/?debug=1&nosplash=1&tier=${tier}&gfxreset=1`,url).href,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.__GAME_READY&&window.__DEBUG&&window.__SHOTS,{timeout:180000});
 report.backend=await page.evaluate(captureTimingBackend);
 if(report.backend.contextLost||/swiftshader|llvmpipe|software/i.test(report.backend.renderer))
  throw Error('Material experiment requires a live hardware WebGL context');
 if(night){
  await page.evaluate(async mapId=>{
   const D=window.__DEBUG;D.shotMode=false;D.game.battleCount=0;
   await D.beginSoloBattle({specId:'m1a1',mapId,randomRoster:false});
   if(D.game.phase!=='battle'||!D.game.player)throw Error('Night water probe failed to enter battle');
  },map);
  await page.waitForFunction(()=>{const D=window.__DEBUG;return D.game.phase==='battle'
   &&D.game.player?.visual&&D.game.preBattleS<=0&&D.game.tanks.every(t=>t.visual);},{timeout:180000});
  // The day/night hash is biome-independent; the actual map preparation
  // retains its own authored biome, which is recorded and verified below.
  let seed=1;while(selectBattleWeather(seed,'temperate').timeOfDay!=='night')seed++;
  report.atmosphere=await page.evaluate(async ({seed,mapId})=>{
   const D=window.__DEBUG;D.shotMode=true;D.post.setAdaptiveSuspended(true);
   await D.battleAtmosphere.prepare(seed,mapId);await D.nightLighting.prepare();
   const weather=D.battleAtmosphere.current?.weather;
   if(weather?.timeOfDay!=='night'||D.world.mapId!==mapId)throw Error('Night/map preparation mismatch');
   return {weather,mapId:D.world.mapId,phase:D.game.phase,preset:D.quality.resolvePresetName()};
  },{seed,mapId:map});
 }else await page.evaluate(name=>window.__SHOTS.set(`battlefield_${name}`),map);
 report.preset=await page.evaluate(()=>window.__DEBUG.quality.resolvePresetName());
 report.readiness=await page.evaluate(settleMapTextures,{mapId:map});
 for(const view of views){
  await page.evaluate(view=>{
   const D=window.__DEBUG;D.camera.position.fromArray(view.position);D.camera.fov=view.fov;
   D.camera.lookAt(...view.target);D.camera.updateProjectionMatrix();D.camera.updateMatrixWorld(true);
   D.world.setWindTime(1);D.world.update(0,D.camera.position);D.post.pinDynScale(1);
   D.lighting.updateFrustums();D.lighting.update(true);
  },view);
  await page.evaluate(settleResidencyTerrain);
  await page.waitForFunction(()=>{const D=window.__DEBUG;D.world.update(0,D.camera.position);const s=D.world.getGrassWorkState();return !s.pendingVisible&&!s.carpet.pending;},{timeout:30000,polling:'raf'});
  const pair=await page.evaluate(({map,candidate})=>{
   const D=window.__DEBUG,m=D.world.group.getObjectByName(`shallow_water_${map}`)?.material;
   if(!m||Array.isArray(m))throw Error('Expected actual single water material');
   const original={color:m.color.getHex(),opacity:m.opacity,roughness:m.roughness};
   const gl=D.renderer.getContext(),images={};
   const resource=()=>({gpu:{...D.renderer.info.memory},programs:D.renderer.info.programs.length});
   const render=name=>{
    D.post.render(0);const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    if(gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null)throw Error('Expected output framebuffer');
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
    images[name]=D.renderer.domElement.toDataURL('image/png');return data;
   };
   const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i++)n+=a[i]!==b[i]?1:0;return n;};
   for(let i=0;i<8;i++)D.post.render(0);
   const before=resource(),a=render('before'),control=render('control');
   try{
    m.color.setHex(candidate.color);m.opacity=candidate.opacity;m.roughness=candidate.roughness;
    const b=render('candidate'),after=resource();
    return {original,before,after,controlDiffBytes:diff(a,control),changedBytes:diff(a,b),images,glError:gl.getError()};
   }finally{m.color.setHex(original.color);m.opacity=original.opacity;m.roughness=original.roughness;}
  },{map,candidate});
  for(const [name,data]of Object.entries(pair.images))await writeFile(resolve(dir,`shore-${view.body}-${name}.png`),Buffer.from(data.split(',')[1],'base64'));
  delete pair.images;report.views.push({view,...pair});
  if(pair.controlDiffBytes||pair.glError||JSON.stringify(pair.before)!==JSON.stringify(pair.after)||!pair.changedBytes)
   throw Error(`Unstable or resource-changing material pair ${view.body}`);
 }
 report.passed=report.errors.length===0&&report.views.length===views.length&&views.length>0;
}catch(error){report.errors.push(String(error.stack??error));process.exitCode=1;}
finally{if(browser)await browser.close();if(refresh)clearInterval(refresh);lock.release();await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2));}
if(report.errors.length)throw Error(report.errors.join('\n'));
