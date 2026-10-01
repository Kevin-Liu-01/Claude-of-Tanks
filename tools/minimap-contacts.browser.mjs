#!/usr/bin/env node
// Production HUD canvas regression, with the real battlefield raster; no WebGL.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/minimap-markers'));
await mkdir(out,{recursive:true});
const lock=createCaptureLock();await lock.acquire();
const heartbeat=setInterval(()=>lock.refresh(),30000);
let browser;
const errors=[],reports=[];
try{
  browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
  for(const [name,width,height] of [['desktop',1440,900],['portrait',390,844],['landscape',844,390]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:name!=='desktop',deviceScaleFactor:2});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${arg('url','http://127.0.0.1:5204')}/tools/fixtures/battle-hud-layout.html`,{waitUntil:'networkidle'});
    const result=await page.evaluate(async()=>{
      const {hud,bus,frame,tanks}=window.__HUD_LAYOUT;
      const player=tanks[0],enemy=tanks[7];
      hud.setMode('hidden');hud.setMode('battle');
      frame.tanks=[player,enemy];
      player.state.pos.set(-250,0,-250);enemy.state.pos.set(140,0,100);enemy.state.yaw=.7;
      let seen=false;frame.spotting={isSpotted:()=>seen};
      frame.matchModeState={id:'zone_control',perspectiveTeam:'alpha',respawns:true,
        spawns:[{team:'alpha',x:-380,z:-380},{team:'bravo',x:380,z:380}],zones:[],score:{alpha:0,bravo:0}};
      await hud.buildMinimapFromAsset({size:1024,getHeightAt:()=>0},'/minimaps/verdant.webp');
      const canvas=document.querySelector('.cot-minimap canvas'),ctx=canvas.getContext('2d');
      const paint=()=>{frame.timeS+=1;hud.setMode('battle');hud.update(frame);};
      const pixels=(x,z)=>{
        const sx=Math.round((.5-x/1024)*canvas.width),sy=Math.round((.5-z/1024)*canvas.height);
        return Array.from(ctx.getImageData(sx-16,sy-16,32,32).data).join(',');
      };
      paint();const oldEmpty=pixels(140,100),newEmpty=pixels(-140,100);
      const ally=tanks[1],allyEmpty=pixels(-140,-100);
      ally.state.pos.set(-140,0,-100);ally.modeActive=false;frame.tanks.push(ally);paint();
      const checks=[pixels(-140,-100)===allyEmpty];
      ally.modeActive=true;paint();checks.push(pixels(-140,-100)!==allyEmpty);
      ally.modeActive=false;paint();checks.push(pixels(-140,-100)===allyEmpty);
      for(let life=0;life<3;life++){
        enemy.state.pos.set(140,0,100);seen=true;paint();const live=pixels(140,100);
        seen=false;enemy.state.pos.set(-140,0,100);enemy.state.yaw=2;paint();const ghost=pixels(140,100);
        checks.push(live!==oldEmpty,ghost!==oldEmpty,ghost!==live,pixels(-140,100)===newEmpty);
        enemy.combat.destroyed=true;paint();
        enemy.combat.destroyed=false;paint();
        checks.push(pixels(140,100)===oldEmpty,pixels(-140,100)===newEmpty);
        // Event-only handoff: no intermediate destroyed render frame.
        seen=true;paint();seen=false;bus.emit('mode:respawn',{id:enemy.id});paint();
        checks.push(pixels(-140,100)===newEmpty);
      }
      enemy.state.pos.set(140,0,100);seen=true;paint();
      seen=false;enemy.modeActive=false;paint();enemy.modeActive=true;paint();
      checks.push(pixels(140,100)===oldEmpty);
      // Keep one faded contact and both spawns visible for screenshot review.
      seen=true;paint();seen=false;paint();
      const {drawSpawnGlyph,sideColor,sideFill}=await import('/src/ui/objectiveGlyphs.ts');
      const samples=document.createElement('canvas');samples.id='spawn-glyph-review';samples.width=320;samples.height=160;
      samples.style.cssText='position:fixed;top:35%;left:8px;width:320px;height:160px;background:#1d2c35;z-index:1000';
      const sampleCtx=samples.getContext('2d');
      for(const [i,side] of ['own','enemy'].entries()){
        drawSpawnGlyph(sampleCtx,80+160*i,62,44,sideColor(side),sideFill(side));
        drawSpawnGlyph(sampleCtx,60+160*i,132,10,sideColor(side),sideFill(side));
        drawSpawnGlyph(sampleCtx,100+160*i,132,8.5,sideColor(side),sideFill(side));
      }
      document.body.append(samples);
      return {checks,canvasWidth:canvas.width};
    });
    assert.ok(result.checks.every(Boolean),`${name}: live/last-known/dead/respawn/reserve pixels ${JSON.stringify(result.checks)}`);
    await page.screenshot({path:resolve(out,`${name}.png`)});
    if(name==='desktop')await page.locator('#spawn-glyph-review').screenshot({path:resolve(out,'spawn-symbols.png')});
    reports.push({name,...result});await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
  console.log(`minimap-contacts.browser: ${reports.length} viewport cases; repeated respawns, hidden positions and reserve waves passed`);
}finally{await browser?.close();clearInterval(heartbeat);lock.release();}
