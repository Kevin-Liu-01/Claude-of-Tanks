// Native rendered evidence for the exact Alpine/Reservoir authored additions.
// This is a visual receipt; quantitative continuity lives in the road tests.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions,verifyNativeBrowserLaunch} from './native-browser-launch.mjs';
import {AUTHORED_EXIT_FIXTURE} from './road-authored-exit-fixture.mjs';
import {settleMapTextures} from './map-environment-acquisition.mjs';
import {settleResidencyTerrain} from './world-residency-acquisition.mjs';

const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const base=option('url'),out=option('out');
if(!base||!out)throw Error('Required --url and --out=fresh-directory');
const dir=resolve(out);await mkdir(dir,{recursive:false});
const lock=createCaptureLock(),report={rows:[],errors:[]};let browser,refresh;
try{
 await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();
 browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:'new',protocolTimeout:240000,
  args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']}));
 report.nativeLaunch=verifyNativeBrowserLaunch(browser);
 const page=await browser.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(new URL('/?debug=1&nosplash=1&tier=desktop&gfxreset=1',base).href,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.__GAME_READY&&window.__DEBUG&&window.__SHOTS,{timeout:180000});
 for(const [map,roads] of Object.entries(AUTHORED_EXIT_FIXTURE)){
  await page.evaluate(name=>window.__SHOTS.set(`battlefield_${name}`),map);
  const readiness=await page.evaluate(settleMapTextures,{mapId:map});
  for(const road of roads)for(const end of [0,1]){
   const added=end?road.suffix:[...road.prefix].reverse();if(!added.length)continue;
   const anchor=end?road.original.at(-1):road.original[0],finish=added.at(-1);
   const dx=finish[0]-anchor[0],dz=finish[1]-anchor[1],length=Math.hypot(dx,dz);
   for(const view of ['approach','overhead']){
    const pose=await page.evaluate(({anchor,finish,dx,dz,length,view})=>{
     const D=window.__DEBUG,hf=D.world.heightField,h=(x,z)=>hf.getHeightAt(x,z);
     const x=(anchor[0]+finish[0])/2,z=(anchor[1]+finish[1])/2;
     const position=view==='overhead'
      ?[x+dz/length*length*.35,h(x,z)+Math.max(35,length*.9),z-dx/length*length*.35]
      :[anchor[0]-dx/length*14+dz/length*12,h(anchor[0],anchor[1])+7,anchor[1]-dz/length*14-dx/length*12];
     D.camera.position.fromArray(position);D.camera.fov=view==='overhead'?48:60;
     D.camera.lookAt(x,h(x,z),z);D.camera.updateProjectionMatrix();D.camera.updateMatrixWorld(true);
     D.post.pinDynScale(1);D.world.update(0,D.camera.position);D.lighting.updateFrustums();D.lighting.update(true);
     return {position,quaternion:D.camera.quaternion.toArray(),fov:D.camera.fov,anchor,finish};
    },{anchor,finish,dx,dz,length,view});
    const prepared=await page.evaluate(settleResidencyTerrain);
    await page.waitForFunction(()=>{const D=window.__DEBUG;D.world.update(0,D.camera.position);const s=D.world.getGrassWorkState();return !s.pendingVisible&&!s.carpet.pending;},{timeout:30000,polling:'raf'});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const terrain=await page.evaluate(settleResidencyTerrain,prepared);
    const file=`${map}-road${road.path}-end${end}-${view}.png`;
    await page.screenshot({path:resolve(dir,file)});
    report.rows.push({map,road:road.path,end,view,file,pose,terrain,readiness});
   }
  }
 }
}catch(error){report.errors.push(String(error));process.exitCode=1;}
finally{if(browser)await browser.close();if(refresh)clearInterval(refresh);lock.release();await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2));}
if(report.errors.length)throw Error(report.errors.join('\n'));
