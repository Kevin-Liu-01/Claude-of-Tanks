// DOM-only regression: real production HUD + settings. Run under capture-command queue.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const playwrightModule=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const {chromium}=await import(playwrightModule);
const out=resolve('.qa-dev/hud-editor');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5358},logLevel:'error'});
let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
 const results=[];
 for(const [name,width,height,touch] of [['desktop',1440,900,false],['portrait',390,844,true],['landscape',667,375,true],['tiny-landscape',568,256,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/fixtures/battle-hud-layout.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
  await page.evaluate(()=>window.__HUD_LAYOUT.settings.open());
  await page.locator('.cot-set-tab[data-tab="gameplay"]').click();
  await page.locator('.cot-set-hud-editor').click();
  await page.waitForSelector('.cot-hud-editor.is-open[data-preview-ready=true]');
  const preview=page.frameLocator('.hud-edit-scene');
  assert.equal(await preview.locator('.cot-top').count(),1,`${name}: real score frame`);
  assert.equal(await preview.locator('.cot-shells').count(),1,`${name}: real ammo frame`);
  assert.equal(await page.locator('.hud-edit-sample').count(),0,`${name}: no generic placeholders`);
  const defaults=await page.evaluate(()=>{
    const doc=document.querySelector('.hud-edit-scene').contentDocument;
    return ['score','map','report','allies','enemies'].map(id=>{
      const selectors={score:'.cot-top',map:'.cot-minimap',report:'.cot-si-cardhost',allies:'.cot-ear.l',enemies:'.cot-ear.r'};
      const source=doc.querySelector(selectors[id]).getBoundingClientRect();
      const handle=document.querySelector(`.hud-edit-part[data-part="${id}"]`);
      return {id,expected:[source.left+source.width/2,source.top+source.height/2],actual:handle?[parseFloat(handle.style.left),parseFloat(handle.style.top)]:null};
    });
  });
  for(const part of defaults){assert.ok(part.actual,`${name}: ${part.id} has a real preview`);assert.ok(part.actual.every((v,i)=>Math.abs(v-part.expected[i])<1),`${name}: ${part.id} matches production default`);}
  const map=page.locator('.hud-edit-part[data-part="map"]');await map.focus();
  const before=await map.boundingBox();await page.keyboard.press('Shift+ArrowLeft');
  const after=await map.boundingBox();assert.ok(after.x<before.x,`${name}: keyboard moves panel`);
  await page.locator('.hud-edit-list button[data-part="score"]').click();
  const score=page.locator('.hud-edit-part[data-part="score"]');const box=await score.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-25,box.y+box.height/2+20,{steps:4});await page.mouse.up();
  const moved=await score.boundingBox();assert.ok(moved.y>box.y,`${name}: pointer moves score`);
  await page.waitForSelector('.cot-hud-editor[data-preview-ready=true]');
  await page.locator('.hud-edit-list button[data-part="enemies"]').click();
  await page.getByRole('button',{name:'Hide element',exact:true}).click();
  assert.equal(await page.locator('.hud-edit-part[data-part="enemies"]').isVisible(),false);
  await page.waitForSelector('.cot-hud-editor[data-preview-ready=true]');
  await page.locator('.hud-edit-list button[data-part="enemies"]').click();
  await page.getByRole('button',{name:'Show element',exact:true}).click();
  assert.equal(await page.locator('.hud-edit-part[data-part="enemies"]').isVisible(),true);
  const bounds=await page.evaluate(()=>[...document.querySelectorAll('.cot-hud-editor .cot-modal__header,.hud-edit-preview,.hud-edit-inspector,.hud-edit-save,.hud-edit-cancel')].map(n=>{const r=n.getBoundingClientRect();return {name:n.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const b of bounds)assert.ok(b.x>=0&&b.y>=0&&b.right<=width+1&&b.bottom<=height+1,`${name}: offscreen ${JSON.stringify(b)}`);
  await page.screenshot({path:resolve(out,`${name}.png`)});
  // Switching profiles keeps separate drafts and recreates production viewport rules.
  const activeName=touch?(width>height?'Phone landscape':'Phone portrait'):'Desktop';
  const otherName=activeName==='Desktop'?'Phone portrait':'Desktop';
  await page.getByRole('button',{name:otherName,exact:true}).click();
  await page.waitForSelector('.cot-hud-editor[data-preview-ready=true]');
  assert.equal(await page.locator('.hud-edit-scene').count(),1,`${name}: one isolated preview`);
  await page.getByRole('button',{name:activeName,exact:true}).click();
  await page.waitForSelector('.cot-hud-editor[data-preview-ready=true]');
  const retained=await page.locator('.hud-edit-part[data-part="map"]').boundingBox();
  assert.ok(Math.abs(retained.x-after.x)<1,`${name}: profile draft survives switching`);

  await page.getByRole('button',{name:'Save layout',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cot-minimap')?.hasAttribute('data-hud-positioned'));
  const saved=await page.evaluate(()=>localStorage.getItem('cot.hud-layout.v1'));assert.ok(saved.includes('"map"'));
  // Cancel leaves saved state unchanged.
  await page.evaluate(async()=>{const {openHudEditor}=await import('/src/ui/hudEditor.ts');openHudEditor(document.body);});
  await page.getByRole('button',{name:'Reset layout',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('cot.hud-layout.v1')),saved);
  // Minimal view retains the actual aiming canvas and vision control, hiding chrome.
  await page.evaluate(()=>{document.body.classList.add('cot-battle-ui-hidden');const scope=document.querySelector('.cot-scope-vision');if(scope)scope.hidden=false;});
  assert.equal(await page.locator('.cot-ret').isVisible(),true);
  assert.equal(await page.locator('.cot-top').isVisible(),false);
  assert.equal(await page.locator('.cot-minimap').isVisible(),false);
  assert.equal(await page.locator('.cot-scope-vision').isVisible(),true);
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.cot-minimap')?.hasAttribute('data-hud-positioned'));
  await page.evaluate(()=>window.__HUD_LAYOUT.settings.open());
  await page.locator('.cot-set-tab[data-tab="gameplay"]').click();await page.locator('.cot-set-hud-editor').click();
  await page.waitForSelector('.cot-hud-editor[data-preview-ready=true]');
  await page.locator('.hud-edit-list button[data-part="enemies"]').click();await page.getByRole('button',{name:'Hide element',exact:true}).click();
  await page.getByRole('button',{name:'Save layout',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cot-ear.r')?.hasAttribute('data-hud-hidden'));
  await page.locator('.cot-set-hud-editor').click();
  await page.getByRole('button',{name:'Reset layout',exact:true}).click();await page.getByRole('button',{name:'Save layout',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.cot-ear.r')?.hasAttribute('data-hud-hidden')&&!document.querySelector('.cot-minimap')?.hasAttribute('data-hud-positioned'));
  await page.locator('.cot-set-hud-editor').click();
  await page.waitForSelector('.cot-hud-editor.is-open[data-preview-ready=true]');await page.locator('.cot-hud-editor .cot-modal__close').focus();await page.keyboard.press('Escape');
  await page.waitForSelector('.cot-hud-editor',{state:'detached'});
  assert.equal(await page.locator('.cot-set-hud-editor').isVisible(),true,`${name}: Escape returns to Settings`);
  assert.deepEqual(errors,[],`${name}: browser errors`);results.push({name,passed:true});await context.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log(results);
}finally{await browser?.close();await server.close();}
