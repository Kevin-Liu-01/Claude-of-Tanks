#!/usr/bin/env node
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCaptureLock } from '../capture-lock.mjs';
import { MAP_IDS } from '../../src/world/maps/catalog.ts';
import { waterScene, frameScene, MAP_SUN_MODES } from './recipes.mjs';
import { productionPreset } from '../../src/game/studioProduction.ts';
import { STUDIO_TIMES } from '../../src/game/studioLight.ts';
import { digest, sourceDigest, verifyFile, contactSheet, writeReviewPage, promoCard, saveReviewCapture } from './pipeline.mjs';

const help = `npm run media:capture -- --task=all|maps|shore|landscape|settlements|video --maps=id,id --times=${STUDIO_TIMES.join(',')} --formats=landscape,portrait,square --out=shots/production-current --resume=true\nOptional: --scene=scene.json OR --preset=steel-pursuit|desert-crossfire|coast-recon --fps=24|30|60 --frames=240 --width=1920 --start-ms=0\nMaps task: --sun=${MAP_SUN_MODES.join('|')} sets the sun's bearing against each overview camera (back = backlit). --port=5378 serves the capture on another port.`;
if (process.argv.includes('--help')) { console.log(help); process.exit(0); }
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match || !['task','maps','out','times','width','fps','frames','resume','scene','formats','preset','start-ms','sun','port'].includes(match[1])) throw Error(help);
  return [match[1], match[2]];
}));
const task = args.task ?? 'all';
const customScene = args.scene ? JSON.parse(readFileSync(resolve(args.scene), 'utf8')) : null;
const preset = args.preset ? productionPreset(args.preset) : null;
if (preset && (customScene || task !== 'video')) throw Error('Production presets require video task and no scene override');
const maps = args.maps?.split(',') ?? (task === 'video' ? [preset?.map ?? customScene?.map ?? 'reservoir'] : [...MAP_IDS]);
const times = args.times?.split(',') ?? ['day'];
const filmTimes = args.times?.split(',') ?? (preset ? [preset.timeOfDay] : ['day','sunset','night']);
const formats = args.formats?.split(',') ?? ['landscape'];
const out = resolve(args.out ?? 'shots/production-current');
const fps = Number(args.fps ?? 30), width = Number(args.width ?? 1920), frames = Number(args.frames ?? 6 * fps);
const startMs = Number(args['start-ms'] ?? 0);
const sun = args.sun ?? 'map', port = Number(args.port ?? 5378);
if (!MAP_SUN_MODES.includes(sun) || (sun !== 'map' && !['maps','all'].includes(task))) throw Error(`--sun=${MAP_SUN_MODES.join('|')} applies to the map overviews; a film carries its scene's light block`);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid --port');
if (!Number.isFinite(startMs) || startMs < 0 || startMs + (frames - 1) * 1000 / fps > (preset?.durationMs ?? 20000)) throw Error('Capture range exceeds the production timeline');
const validList = (list, allowed) => list.length && new Set(list).size === list.length && list.every(id => allowed.includes(id));
if (!['all','maps','shore','landscape','settlements','video'].includes(task) || !validList(maps, MAP_IDS) || !validList(times,STUDIO_TIMES)
    || !filmTimes.every(time => STUDIO_TIMES.includes(time))
    || !validList(formats,['landscape','portrait','square'])) throw Error('Invalid or duplicate capture selection');
if (![24,30,60].includes(fps) || !Number.isInteger(width) || width < 640 || width > 3840 || width % 32
    || !Number.isInteger(frames) || frames < 1 || frames > 20 * fps) throw Error('Invalid dimensions, frame rate or frame count');
if (customScene && (task !== 'video' || maps.length !== 1 || maps[0] !== customScene.map)) throw Error('A custom scene requires --task=video and its own map');
if (task === 'video' && !customScene && (maps.length !== 1 || maps[0] !== (preset?.map ?? 'reservoir'))) throw Error('Select the production preset map or supply --scene');
mkdirSync(out, { recursive:true });
const receiptFile = join(out, `${task}-receipt.json`);
const fingerprint = sourceDigest();
const config = { task, maps, times, filmTimes, formats, fps, width, frames, scene:customScene, preset: preset?.id ?? null, startMs, ...(sun !== 'map' ? { sun } : {}) };
let receipt;
if (args.resume === 'true' && existsSync(receiptFile)) {
  receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  if (receipt.sourceDigest !== fingerprint || JSON.stringify(receipt.config) !== JSON.stringify(config)) throw Error('Sources or capture settings changed; use a new output directory');
  for (const row of receipt.maps.filter(row => row.complete)) for (const file of [...row.stills,...row.shore,...row.videos,...row.posters]) verifyFile(file);
  receipt.maps = receipt.maps.filter(row => row.complete);
  receipt.errors = []; delete receipt.finished;
} else {
  if (existsSync(receiptFile)) throw Error('Output already exists; choose a new directory or --resume=true');
  receipt = { version:2, sourceDigest:fingerprint, revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    started:new Date().toISOString(), config, maps:[], errors:[] };
}
const save = () => writeFileSync(receiptFile, JSON.stringify(receipt,null,2) + '\n');
function savePng(path, cap) {
  const bytes = Buffer.from(cap.dataURL.split(',')[1], 'base64');
  if (bytes.readUInt32BE(16) !== cap.width || bytes.readUInt32BE(20) !== cap.height) throw Error('Capture dimensions mismatch');
  mkdirSync(dirname(path), {recursive:true}); writeFileSync(path, bytes);
  return { path, width:cap.width, height:cap.height, bytes:bytes.length, sha256:digest(bytes) };
}
const settle = page => page.evaluate(() => new Promise(resolve => {
  let n=0; const tick=()=>++n<4 ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick);
}));
// Paused Studio cameras do not drive ordinary world streaming. Warm the exact
// camera's terrain before judging its shoreline or saving a production still.
const prepareView = (page,camera) => page.evaluate(async camera => {
  if (camera) window.__STUDIO.setCamera(camera);
  const D=window.__DEBUG;
  for(let jobs=0;jobs<192;jobs++) {
    if(!D.world.warmTerrainLookahead(D.camera.position,1)) break;
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  D.world.update(0,D.camera.position);
},camera);
const capture = (page,width,height) => page.evaluate(size => {
  const result=window.__STUDIO.capture(size), errors=window.__GL_DIAG?.errors??[];
  if(errors.length)throw Error(errors.slice(0,2).join('\n'));
  return result;
}, {width,height});
const dimensions = format => format === 'portrait' ? [width*9/16,width] : format === 'square' ? [width,width] : [width,width*9/16];
async function films(page, row) {
  for (const time of filmTimes) for (const format of [...new Set([...formats,'landscape','portrait','square'])]) {
    const scene = preset ? await page.evaluate(async ({id,format,time}) => {
      const {createProductionScene}=await import('/src/game/studioProduction.ts');
      return {...createProductionScene({presetId:id,format},(x,z)=>window.__DEBUG.world.heightField.getHeightAt(x,z)),timeOfDay:time};
    },{id:preset.id,format,time}) : frameScene({ ...(customScene ?? waterScene(time)), timeOfDay:time },format);
    const filmRequested=formats.includes(format), posterFrame=Math.floor(frames/2);
    const stem = `${row.map}-${time}${format === 'landscape' ? '' : `-${format}`}`;
    const dir = join(out,'films',stem), [w,h] = dimensions(format);
    mkdirSync(dir,{recursive:true});
    // Keep the live and encoded sizes equal so each movie frame retains its
    // temporal history; larger posters still restore this viewport afterward.
    await page.setViewport({width:w,height:h,deviceScaleFactor:1});
    await page.evaluate(scene => window.__STUDIO.load(scene),{...scene,fxTime:startMs+(filmRequested?0:posterFrame/fps*1000)}); await prepareView(page); await settle(page);
    writeFileSync(join(dir,'scene.json'), JSON.stringify(scene,null,2)+'\n');
    const samples=[];
    for (let frame=0; frame<(filmRequested?frames:1); frame++) {
      // Target the absolute frame clock: rounding each 1/fps increment drifts.
      if (frame) await page.evaluate(target=>window.__STUDIO.advanceFrame(target-window.__STUDIO.fxTimeMs),startMs+frame*1000/fps);
      const actualMs=await page.evaluate(()=>window.__STUDIO.fxTimeMs);
      if(Math.abs(actualMs-(startMs+frame*1000/fps))>.51 && filmRequested) throw Error('Captured timeline drifted from the output frame clock');
      const file=filmRequested ? savePng(join(dir,`frame-${String(frame).padStart(5,'0')}.png`),await capture(page,w,h)) : null;
      if (file && (frame % fps === 0 || frame === frames-1)) samples.push({...file,fxTimeMs:actualMs,label:`${time} · ${format} · ${(actualMs/1000).toFixed(2)}s`});
      if (!filmRequested || frame === posterFrame) {
        const posterFormats = [format];
        for (const posterFormat of posterFormats) {
          const [pw,ph] = posterFormat === 'portrait' ? [1080,1920] : posterFormat === 'square' ? [1920,1920] : [3840,2160];
          const poster=savePng(join(out,'posters',`${row.map}-${time}-${posterFormat}.png`),await capture(page,pw,ph));
          Object.assign(poster,{scene,format:posterFormat,timeOfDay:time,frame:posterFrame,fxTimeMs:startMs+posterFrame/fps*1000, label:`${row.map} · ${time} · ${posterFormat}`});
          row.posters.push(poster);
          const promo=await promoCard(poster,join(out,'promo',`${row.map}-${time}-${posterFormat}.png`),time);
          row.posters.push({...promo,scene,format:posterFormat,timeOfDay:time,branded:true,label:`Promo · ${time} · ${posterFormat}`});
        }
      }
      if (frame % 30 === 0) console.log(`[media] ${stem}: ${frame}/${frames} frames`);
    }
    if (!filmRequested) {save();continue;}
    const video=join(out,'films',`${stem}.mp4`);
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',join(dir,'frame-%05d.png'),'-frames:v',String(frames),'-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',video]);
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=width,height,nb_frames,r_frame_rate:format=duration','-of','json',video],{encoding:'utf8'}));
    if (Number(probe.streams[0].nb_frames)!==frames || probe.streams[0].width!==w || probe.streams[0].height!==h) throw Error('Encoded video dimensions/frame count mismatch');
    row.videos.push({path:video,scene,format,timeOfDay:time,fps,frames,startMs,probe,samples,label:`${row.map} · ${time} · ${format}`,sha256:digest(readFileSync(video))});
    await contactSheet(samples,join(dir,'motion-sheet.jpg'),`${row.map.toUpperCase()} / ${time.toUpperCase()} / ${fps} FPS`);
    save();
    // Retain the verified film and review frames; a nine-format run otherwise
    // accumulates gigabytes of redundant PNGs after successful encoding.
    const retained=new Set(samples.map(sample=>sample.path));
    for(let frame=0;frame<frames;frame++) {
      const path=join(dir,`frame-${String(frame).padStart(5,'0')}.png`);
      if(!retained.has(path))unlinkSync(path);
    }
  }
}
const lock=createCaptureLock(); let server,browser;
await lock.acquire(45*60*1000);
let interrupted=false;
const stop=()=>{interrupted=true;void browser?.close().catch(()=>{});};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
const lease=setInterval(()=>lock.refresh?.(),30000);lease.unref();
try {
  server=await createServer({root:process.cwd(),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/*']}}}); await server.listen();
  // Our signal handler owns shutdown and the receipt/lock finally block.
  // Puppeteer's default SIGTERM handler exits before that cleanup can run.
  browser=await puppeteer.launch({headless:true,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,protocolTimeout:300000,args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']});
  for (const map of maps) {
    if(interrupted)break;
    if (receipt.maps.some(row=>row.map===map&&row.complete)) { console.log(`[media] preserved ${map}`); continue; }
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('favicon')) errors.push(message.text());});
    await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
    const row={map,stills:[],shore:[],videos:[],posters:[]}; receipt.maps.push(row); save();
    try {
      await page.goto(`http://127.0.0.1:${port}/?studio=1&nosplash=1&tier=desktop&map=${map}&diag`,{waitUntil:'domcontentloaded',timeout:180000});
      await page.waitForFunction(()=>window.__STUDIO?.active&&window.__GAME_READY,{timeout:180000});
      await page.evaluate(async()=>{
        const {awaitMapCaptureReadiness}=await import('/src/dev/mapCaptureReadiness.ts');
        await awaitMapCaptureReadiness(window.__DEBUG.world,()=>window.__DEBUG.world);
        window.__STUDIO.pause(); window.__DEBUG.post.pinDynScale(1);
        window.__DEBUG.post.resetPerfTrims(); window.__DEBUG.post.setAdaptiveSuspended(true);
      });
      row.renderer=await page.evaluate(()=>{const r=window.__DEBUG.renderer,gl=r.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),maxTextureSize:r.capabilities.maxTextureSize};});
      if (task==='maps'||task==='all'||task==='landscape'||task==='settlements') for (const time of times) {
        const scene=await page.evaluate(async ({time,sun})=>{const {mapScene}=await import('/tools/media-production/recipes.mjs');return mapScene(window.__DEBUG.world,time,sun);},{time,sun});
        await page.evaluate(scene=>window.__STUDIO.load(scene),scene); await prepareView(page); await settle(page);
        const name=map==='verdant'?'battlefield':`battlefield_${map}`,suffix=(time==='day'?'':`-${time}`)+(sun==='map'?'':`-${sun}`);
        const file=savePng(join(out,'maps',`${name}${suffix}.png`),await capture(page,3840,2160));
        Object.assign(file,{scene,timeOfDay:time,label:`${map} · ${time}`}); row.stills.push(file);
        writeFileSync(join(out,'maps',`${name}${suffix}.json`),JSON.stringify(scene,null,2)+'\n');
        console.log(`[media] ${map} ${time}: native 3840×2160`); save();
      }
      if (task==='settlements') {
        const views=await page.evaluate(async()=>{
          const {settlementSurvey}=await import('/tools/media-production/recipes.mjs');
          return settlementSurvey(window.__DEBUG.world);
        });
        for(const view of views) {
          await prepareView(page,view.camera);await settle(page);
          const file=savePng(join(out,'settlements',`${map}-${view.id}.png`),await capture(page,1920,1080));
          Object.assign(file,{label:`${map} · ${view.id}`,camera:view.camera});row.stills.push(file);
        }
        row.layout=await page.evaluate(()=>{
          const w=window.__DEBUG.world;
          return {roads:w.heightField._layout.roads,village:w.heightField._layout.village,
            buildings:w.getMinimapFeatures().buildings};
        });
        save();
      }
      if (task==='landscape'||task==='all') {
        row.landscape = await page.evaluate(async()=>{
          const {landscapeSurvey}=await import('/tools/media-production/recipes.mjs');
          return landscapeSurvey(window.__DEBUG.world);
        });
        for (const view of row.landscape.views) {
          await prepareView(page,view.camera); await settle(page);
          const file=await saveReviewCapture(join(out,'landscape',map,`${view.id}.webp`),await capture(page,1280,720));
          Object.assign(file,{label:`${map} · ${view.id}`,camera:view.camera}); row.stills.push(file);
        }
        for(let i=1;i<row.stills.length;i+=6) await contactSheet(row.stills.slice(i,i+6),join(out,'landscape',map,`sheet-${1+(i-1)/6}.jpg`),`${map} · landscape review ${1+(i-1)/6}`);
        console.log(`[media] ${map}: ${row.landscape.views.length} boundary and landscape views`); save();
      }
      if (task==='shore'||task==='all') {
        const plan=await page.evaluate(async()=>{const {shorelineSurvey}=await import('/tools/media-production/recipes.mjs');return shorelineSurvey(window.__DEBUG.world);}); row.survey=plan;
        await page.evaluate(map=>window.__STUDIO.load({map,timeOfDay:'day',actors:[],fxTime:2000,timeScale:0}),map);
        for (const view of plan.views) {
          await prepareView(page,view.camera); await settle(page);
          const file=await saveReviewCapture(join(out,'shore',map,`${view.id}.webp`),await capture(page,1280,720));
          file.label=`${view.id} · ${view.kind} · ${view.target[0].toFixed(0)}, ${view.target[2].toFixed(0)}`; row.shore.push(file);
        }
        for(let i=0;i<row.shore.length;i+=12) await contactSheet(row.shore.slice(i,i+12),join(out,'shore',map,`sheet-${1+i/12}.jpg`),`${map} · shoreline review ${1+i/12}`);
        console.log(`[media] ${map}: ${plan.samples} waterline points / ${row.shore.length} views / ${plan.views.filter(v=>v.kind==='extension').length} beyond border`); save();
      }
      if (task==='video'||task==='all'&&map==='reservoir') await films(page,row);
      errors.push(...await page.evaluate(()=>window.__GL_DIAG?.errors??[]));
      if (errors.length) throw Error(errors.slice(0,4).join('\n'));
      row.complete=true; save();
    } catch(error) {
      row.error=String(error.stack??error); receipt.errors.push({map,error:row.error}); save(); console.error(`[media] ${map} FAILED: ${error.message}`);
    } finally { if(!page.isClosed())await page.close().catch(error=>{if(!interrupted)throw error;}); }
  }
  const stills=receipt.maps.flatMap(row=>row.stills);
  for(let i=0;i<stills.length;i+=12) await contactSheet(stills.slice(i,i+12),join(out,`map-sheet-${1+i/12}.jpg`),'CLAUDE OF TANKS / MAP PRODUCTION');
} finally {
  await browser?.close(); await server?.close(); clearInterval(lease); lock.release();
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  if(interrupted)receipt.errors.push({error:'Capture interrupted; this batch is incomplete'});
  if(sourceDigest()!==fingerprint) receipt.errors.push({error:'Rendering inputs changed during capture; discard this batch'});
  receipt.finished=new Date().toISOString(); save(); writeReviewPage(out,receipt);
}
if(receipt.errors.length) process.exitCode=1;
console.log(`[media] review ${join(out,'review.html')}`);
