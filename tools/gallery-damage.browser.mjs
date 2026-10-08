// Committed regression of the live public Gallery. Run under capture-command.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const modulePath=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const {chromium}=await import(modulePath);
const out=resolve('.qa-dev/gallery-damage');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5358},logLevel:'error'});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/gallery?id=t90m&layer=armor`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__TANK_GALLERY?.ready&&window.__TANK_GALLERY.getState().selectedId==='t90m',null,{timeout:180000});
 await page.locator('.damage-workbench').scrollIntoViewIfNeeded();
 const before=await page.evaluate(()=>window.__TANK_GALLERY.getState());
 const era=before.damage.parts.find(p=>p.kind==='era');assert.ok(era,'T-90M exposes real ERA bindings');
 await page.locator(`[data-damage-target="${era.key}"]`).click();
 await page.locator('[data-damage-action=detonate]').click();
 assert.ok((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.removed.includes(era.key.slice(6)));
 await page.screenshot({path:resolve(out,'desktop-era.png')});
 await page.locator('[data-damage-action=repair]').click();
 assert.equal((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.removed.length,0);
 await page.locator('[data-damage-action="kind:module"]').click();
 await page.locator('[data-damage-target="module:trackL"]').click();
 await page.locator('[data-damage-action=disable]').click();
 await page.locator('[data-damage-action=hitboxes]').click();
 assert.equal((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.parts.find(p=>p.key==='module:trackL').state,'red');
 await page.screenshot({path:resolve(out,'desktop-track-hitboxes.png')});
 await page.locator('[data-damage-action=reset]').click();
 await page.locator('[data-damage-action=wreck]').click();
 assert.equal((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.destroyed,true);
 await page.locator('[data-damage-action=reset]').click();
 assert.ok((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.parts.every(p=>p.state==='ok'));
 const receipts=[];
 for(const [name,width,height] of [['phone',390,844],['small-phone',320,568],['landscape',667,375],['short-landscape',568,256]]) {
  await page.setViewportSize({width,height});
  await page.locator('.damage-workbench').scrollIntoViewIfNeeded();
  const layout=await page.locator('.damage-workbench').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,buttons:[...el.querySelectorAll('button')].map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width}))}));
  assert.ok(layout.scroll<=layout.client+1,`${name}: no horizontal overflow`);
  assert.ok(layout.buttons.every(b=>b.height>=43&&b.width>=43),`${name}: touch targets`);
  await page.locator('[data-damage-action="kind:crew"]').click();
  await page.locator('.damage-targets button').first().click();
  await page.locator('[data-damage-action=disable]').click();
  assert.ok((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.parts.some(p=>p.kind==='crew'&&p.state==='red'));
  await page.locator('[data-damage-action=reset]').click();
  await page.screenshot({path:resolve(out,`${name}-workbench.png`)});
  receipts.push({name,layout});
 }
 await page.evaluate(()=>window.__TANK_GALLERY.loadTank('kf41_lynx_x'));
 assert.ok((await page.evaluate(()=>window.__TANK_GALLERY.getState())).damage.parts.every(p=>p.state==='ok'),'switching tanks clears damage');
 await page.locator('[data-damage-action="kind:module"]').click();
 const rack=page.locator('[data-damage-target="module:missileRack"]');
 if(await rack.count()){await rack.click();await page.locator('[data-damage-action=disable]').click();}
 assert.deepEqual(errors,[],'no browser runtime errors');
 await writeFile(resolve(out,'results.json'),JSON.stringify(receipts,null,2));
 console.log(`Gallery damage controls, repair/reset, tank switching and four mobile sizes PASS: ${out}`);
}finally{await browser?.close();await server.close();}
