// Real death handoff, native pointer capture, release, recapture and keyboard cycle.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage,beginSoloBattle} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/spectator-cursor');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let refresh;
try{
 await lock.acquire();refresh=setInterval(()=>lock.refresh(),30000);
 await withMapProbeSession({root:process.cwd(),cacheDir:resolve('.qa-dev/clutter-vite-cache')},async({browser,port})=>{
  const {page,errors}=await openGamePage(browser,{port,viewport:{width:1280,height:800}});
  await beginSoloBattle(page,{specId:'m1a2',mapId:'verdant'});
  await page.mouse.click(640,400);
  await page.waitForFunction(()=>!!document.pointerLockElement);
  await page.evaluate(()=>{window.__DEBUG.game.player.combat.hp=0;window.__DEBUG.game.player.combat.destroyed=true;});
  await page.waitForFunction(()=>window.__DEBUG.killcam.spectate.active,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('.cot-spec .cursor-hint').hidden);
  assert.ok(await page.evaluate(()=>!!document.pointerLockElement),'death and spectator handoff retain capture');
  assert.equal(await page.$eval('.cot-spec .cursor-hint',el=>el.textContent),'Press Esc to release cursor');
  const before=await page.evaluate(()=>window.__DEBUG.killcam.spectate.targetId);
  await page.keyboard.press('KeyD');
  await page.waitForFunction(id=>window.__DEBUG.killcam.spectate.targetId!==id,{},before);
  await page.screenshot({path:resolve(out,'captured.png')});
  // CDP keyboard delivery does not invoke Chrome's privileged Escape default.
  // Dispatch the key, then exercise the native browser release API it owns.
  await page.keyboard.press('Escape');
  await page.evaluate(()=>document.exitPointerLock());
  await page.waitForFunction(()=>!document.pointerLockElement&&document.querySelector('.cot-spec .cursor-hint').hidden);
  assert.equal(await page.evaluate(()=>window.__DEBUG.settings.isOpen()),false,'Esc release does not open a live-player settings overlay');
  await page.mouse.click(640,400);
  await page.waitForFunction(()=>!!document.pointerLockElement&&!document.querySelector('.cot-spec .cursor-hint').hidden);
  await page.setViewport({width:568,height:320});
  await new Promise(r=>setTimeout(r,400));
  const bounds=await page.$eval('.cot-spec .cursor-hint',el=>{const a=el.getBoundingClientRect(),b=el.closest('.cot-spec').getBoundingClientRect();return{visible:!el.hidden,inside:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom,onScreen:a.left>=0&&a.right<=innerWidth&&a.top>=0&&a.bottom<=innerHeight,belowScore:b.top>=document.querySelector('.cot-top').getBoundingClientRect().bottom};});
  assert.deepEqual(bounds,{visible:true,inside:true,onScreen:true,belowScore:true});
  await page.screenshot({path:resolve(out,'compact.png')});
  await page.evaluate(()=>document.exitPointerLock());
  await page.waitForFunction(()=>document.querySelector('.cot-spec .cursor-hint').hidden);
  await page.click('.cot-spec .cycle.prev');
  assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false,'spectator UI buttons do not recapture');
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,deathCapture:true,release:true,recapture:true,keyboardCycle:true,compact:bounds,errors},null,2));
  console.log('Spectator capture, hint, native release, canvas recapture, target cycling and compact layout passed');
 });
}finally{clearInterval(refresh);lock.release();}
