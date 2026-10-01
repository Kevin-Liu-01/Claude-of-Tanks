#!/usr/bin/env node
// Committed DOM regression: production help/modal owners, no game renderer or GPU capture.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/field-guide'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const reports=[],errors=[];
try{
 for(const [name,width,height,locale] of [['desktop',1440,1000,'en-US'],['portrait',390,844,'en-US'],['landscape',844,390,'en-US'],['short-landscape',568,320,'en-US'],['chinese',667,375,'zh-CN']]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  await page.goto(`${arg('url','http://localhost:5204')}/tools/fixtures/field-guide.html?locale=${locale}`,{waitUntil:'networkidle'});
  const chapters=await page.locator('[data-chapter]').evaluateAll(nodes=>nodes.map(n=>n.dataset.chapter));
  for(const id of chapters){
   await page.locator(`[data-chapter="${id}"]`).click();
   const guide=page.locator(`.is-open .cot-guide[data-guide="${id}"]`);await guide.waitFor();
   const photo=guide.locator('.cot-guide__photo>img');await photo.evaluate(img=>img.decode());
   assert.equal(await photo.evaluate(img=>img.naturalWidth),1600,`${name} ${id}: real capture loaded`);
   assert.equal(await guide.locator('.cot-guide__photo').evaluate(el=>{
    const image=el.querySelector('img').getBoundingClientRect(),r=el.getBoundingClientRect();return Math.abs(image.width/image.height-16/9)<.01&&Math.abs(r.width-image.width)<1;
   }),true,`${name} ${id}: full image, no crop`);
   const pins=guide.locator('.cot-guide__pin');
   assert.equal(await pins.evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.width>=40&&r.height>=40&&r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1;})),true,`${name} ${id}: bounded touch targets`);
   for(let step=0;step<3;step++){
    await pins.nth(step).click();await photo.evaluate(img=>img.decode());assert.equal(await pins.nth(step).getAttribute('aria-pressed'),'true');
    assert.equal(await guide.locator(':scope > .cot-guide__steps button').nth(step).getAttribute('aria-pressed'),'true');
    if(id==='smoke')assert.ok((await photo.getAttribute('src')).endsWith(step===0?'smoke-launch.webp':'smoke.webp'));
   }
   await guide.locator(':scope > .cot-guide__steps button').nth(0).focus();await page.keyboard.press('Enter');
   assert.equal(await pins.nth(0).getAttribute('aria-pressed'),'true',`${id}: keyboard selection`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name} ${id}: no page overflow`);
   assert.equal(await guide.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${name} ${id}: no guide overflow`);
   if(name==='desktop'&&['maps','camo','crew','smoke'].includes(id)){
    if(id==='smoke')await pins.nth(1).click();
    await guide.locator('.cot-guide__photograph').scrollIntoViewIfNeeded();
    await page.screenshot({path:resolve(out,`${name}-${id}.png`)});
   }
   if(['portrait','short-landscape','chinese'].includes(name)&&id==='camo'){
    await pins.first().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${name}-${id}.png`)});
   }
   await page.keyboard.press('Escape');
   assert.equal(await page.locator(`[data-chapter="${id}"]`).evaluate(el=>document.activeElement===el),true,'focus returns to help trigger');
   reports.push({name,id,passed:true});
  }
  // Live vehicle selection remains independent of the teaching example.
  for(const [id,label] of [['m1a2_x','M1A2 Abrams'],['m551_sheridan','M551 Sheridan']]){
   await page.evaluate(([id,name])=>__GUIDE_QA.setVehicle(id,name),[id,label]);
   await page.locator('[data-chapter="crew"]').click();await page.locator('.is-open .cot-guide__technical summary').click();
   const image=page.locator('.is-open img[data-vehicle-id]');await image.evaluate(img=>img.decode());
   assert.equal(await image.getAttribute('data-vehicle-id'),id);assert.ok((await image.getAttribute('src')).includes(id));
   await page.keyboard.press('Escape');
  }
  if(name==='landscape'){
   await page.locator('[data-chapter="maps"]').click();await page.setViewportSize({width:390,height:844});
   await page.locator('.is-open .cot-guide__pin').nth(2).click();assert.equal(await page.locator('.is-open .cot-guide__pin').nth(2).getAttribute('aria-pressed'),'true');
  }
  await page.keyboard.press('Escape');
  if(name==='desktop'){
   // Exercise the actual Garage Smoke entry, not only the standalone chapter fixture.
   await page.goto(`${arg('url','http://localhost:5204')}/tools/fixtures/mobile-surfaces.html`,{waitUntil:'networkidle'});
   await page.locator('.cot-system-control').filter({hasText:'Smoke'}).click();
   await page.locator('.is-open .cot-guide[data-guide="smoke"]').waitFor();
   await page.keyboard.press('Escape');
   // A failed photograph must never leave teaching arrows floating on a blank scene.
   await page.route('**/field-guide/camo.webp',route=>route.abort());
   await page.goto(`${arg('url','http://localhost:5204')}/tools/fixtures/field-guide.html`,{waitUntil:'networkidle'});
   await page.locator('[data-chapter="camo"]').click();
   await page.locator('.is-open .cot-guide__image-error').waitFor({state:'visible'});
   assert.equal(await page.locator('.is-open .cot-guide__photo').isVisible(),false);
   await page.locator('.is-open .cot-guide > .cot-guide__steps button').nth(2).click();
   assert.ok(await page.locator('.is-open .cot-guide__detail p').textContent());
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));console.log(`field-guide.browser: ${reports.length} chapter/viewport checks; keys, smoke sequence, selected-tank diagrams and rotation passed`);
}finally{await browser.close();}
