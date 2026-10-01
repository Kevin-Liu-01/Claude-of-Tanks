// Committed public-page regression: source organization must preserve live URLs.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const {chromium}=await import(arg('playwright-module','playwright'));
const out=resolve(arg('out','.qa-dev/manual-browser'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const errors=[],checked=[];
const reference=JSON.parse(await readFile(new URL('../src/docs/reference.generated.json',import.meta.url),'utf8'));
const topics=[['vehicles',reference.vehicles.length],['worlds',reference.maps.length],['simulation',reference.modes.length]];
try{
 for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:390,height:844}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  for(const locale of ['', '/cn'])for(const [topic,count] of topics){
   const path=`${locale}/docs/${topic}`;
   const response=await page.goto(`${arg('url','http://127.0.0.1:5204')}${path}#reference`,{waitUntil:'networkidle'});
   assert.equal(response.status(),200,path);
   await page.waitForSelector('.manual-record');
   assert.equal(await page.locator('.manual-record').count(),count);
   assert.equal(await page.evaluate(()=>document.documentElement.lang),locale?'zh-CN':'en-US');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path}: no page overflow`);
   const search=page.locator('.manual-search input');
   if(topic==='vehicles'){
    await search.fill('Sheridan');assert.equal(await page.locator('.manual-record:visible').count(),1);
    await page.locator('.manual-record:visible summary').click();
    assert.match(await page.locator('.manual-record:visible').innerText(),/480 m/);
   }else if(topic==='worlds'){
    await search.fill('Earthrise');assert.equal(await page.locator('.manual-record:visible').count(),1);
    await page.locator('.manual-record:visible summary').click();
    assert.equal(await page.locator('.manual-record:visible a').getAttribute('href'),'/maps/moon.webp');
   }
   await search.fill('no-such-item-9382');assert.equal(await page.locator('.manual-record:visible').count(),0);
   await search.fill('');assert.equal(await page.locator('.manual-record:visible').count(),count);
   await page.screenshot({path:resolve(out,`${locale?'cn':'en'}-${topic}-${viewport.width}.png`)});
   checked.push({path,viewport,count});
  }
  for(const path of ['/home','/docs','/cn/home','/cn/docs','/home.html','/gallery.html','/docs-vehicles.html']){
   const response=await page.goto(`${arg('url','http://127.0.0.1:5204')}${path}`,{waitUntil:'networkidle'});
   assert.equal(response.status(),200,path);checked.push({path,viewport});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify({checked,errors},null,2));}
console.log(`Manual browser: ${checked.length} route/layout checks PASS`);
