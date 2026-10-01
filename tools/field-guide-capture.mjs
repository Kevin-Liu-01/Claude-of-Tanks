#!/usr/bin/env node
// Refresh the instructional manual photographs, not public promotional selections.
// nice -n 19 node tools/field-guide-capture.mjs [--only=crew,modules] [--out=public/field-guide]
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FIELD_GUIDE_SCENES} from './field-guide-scenes.mjs';
import {acquireCaptureLock,refreshCaptureLock,releaseCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions,verifyNativeBrowserLaunch} from './native-browser-launch.mjs';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const only=arg('only','').split(',').filter(Boolean);
if(only.some(id=>!FIELD_GUIDE_SCENES.some(job=>job.id===id)))throw new Error('Unknown field guide');
const jobs=FIELD_GUIDE_SCENES.filter(job=>!only.length||only.includes(job.id));
const out=resolve(arg('out','public/field-guide'));mkdirSync(out,{recursive:true});
const manifestPath=resolve(out,'manifest.json');
const previous=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{shots:[]};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const recipeSha256=sha(readFileSync(new URL('./field-guide-scenes.mjs',import.meta.url)));
let server,browser,lease;const errors=[];
await acquireCaptureLock(3600000);lease=setInterval(refreshCaptureLock,60000);
async function cleanup(){clearInterval(lease);await browser?.close();await server?.close();releaseCaptureLock();}
process.once('SIGINT',()=>cleanup().then(()=>process.exit(130)));
process.once('SIGTERM',()=>cleanup().then(()=>process.exit(143)));
try{
  server=await createServer({root:process.cwd(),logLevel:'error',server:{port:5206,strictPort:false,hmr:false,watch:{ignored:['**/*']}}});await server.listen();
  browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:true,args:['--use-gl=angle','--enable-webgl','--no-sandbox']}));
  const launch=verifyNativeBrowserLaunch(browser),page=await browser.newPage();
  await page.setViewport({width:1600,height:900,deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://localhost:${server.config.server.port}/?studio=1&map=verdant&nogate=1&debug=1`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction('window.__GAME_READY && window.__STUDIO?.active',{timeout:240000});
  const renderer=await page.evaluate(()=>{const gl=__DEBUG.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  if(/swiftshader|llvmpipe|software/i.test(renderer))throw new Error(`Hardware capture required: ${renderer}`);
  const manifest={version:1,width:1600,height:900,shots:previous.shots.filter(shot=>!jobs.some(job=>job.id===shot.id))};
  for(const job of jobs){
    console.log(`[field-guide] ${job.id}`);
    const receipt=await page.evaluate(async job=>{const {stageFieldGuide}=await import('/tools/field-guide-scenes.mjs');return stageFieldGuide(job);},job);
    if(!receipt?.textures?.applied)throw new Error(`Missing capture receipt: ${job.id}`);
    const result=await page.evaluate(()=>__STUDIO.capture({width:1600,height:900,type:'image/webp',quality:.88}));
    const bytes=Buffer.from(result.dataURL.split(',')[1],'base64');
    writeFileSync(resolve(out,`${job.id}.webp`),bytes);
    manifest.shots.push({id:job.id,file:`${job.id}.webp`,sha256:sha(bytes),sourceCommit,recipeSha256,renderer,launch,...receipt});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  manifest.shots.sort((a,b)=>a.id.localeCompare(b.id));
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(`[field-guide] ${jobs.length} photographs saved to ${out}`);
}finally{await cleanup();}
