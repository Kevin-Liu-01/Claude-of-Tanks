// Production HUD geometry regression. No WebGL or frame-rate claims.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const modulePath=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const {chromium}=await import(modulePath);
const out=resolve('.qa-dev/penetration-dock');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5367,hmr:false},logLevel:'error'});
let browser;const results=[];
function measure(){
 const card=document.querySelector('.cot-si-card');
 if(!card?.checkVisibility({checkVisibilityCSS:true}))return null;
 const rect=node=>node.getBoundingClientRect().toJSON();
 return {card:rect(card),host:rect(card.parentElement),map:rect(document.querySelector('.cot-minimap')),viewportHeight:innerHeight,obstacles:[...document.querySelectorAll('.cot-sixth.on,.cot-alert.show,.cot-kill-lane,.cot-ear,.cot-flight-hud:not([hidden]) button')].filter(n=>n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(n=>({name:n.className,...rect(n)}))};
}
function unchanged(before,after,label){
 assert.ok(after,`${label}: report disappeared`);
 for(const box of after.obstacles)assert.ok(Math.min(box.right,after.card.right)-Math.max(box.left,after.card.left)<=.5||Math.min(box.bottom,after.card.bottom)-Math.max(box.top,after.card.top)<=.5,`${label}: report overlaps ${box.name} ${JSON.stringify({before,after})}`);
 for(const key of ['x','y','width','height'])assert.ok(Math.abs(before.card[key]-after.card[key])<.6,`${label}: ${key} shifted ${before.card[key]} → ${after.card[key]}`);
 assert.ok(Math.abs(after.card.bottom-after.host.bottom)<.6,`${label}: card must sit at its dock's bottom`);
 if(after.map.top>after.viewportHeight/2)assert.ok(after.map.top-after.card.bottom>=11.5,`${label}: minimap clearance ${after.map.top-after.card.bottom}`);
 else assert.ok(Math.min(after.map.right,after.card.right)<=Math.max(after.map.left,after.card.left)||after.card.top>=after.map.bottom+11.5,`${label}: top-mounted map overlaps report`);
}
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 for(const [name,width,height,touch=false,locale='en-US']of [
  ['desktop',1440,900],['laptop',1366,768],['small',1024,600],['short',844,390],['portrait-mouse',820,1180],
  ['compact-mouse',540,720],['narrow-mouse',390,844],['touch',667,375,true],['tiny-touch',568,256,true],['zh',1366,768,false,'zh-CN']]){
  const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
  if(only&&only!==name)continue;
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
  await page.clock.install();
  for(const count of [1,7,14,21,41])for(const mapSize of [160,220,300]){
   await page.evaluate(({count,mapSize})=>{
    const f=window.__HUD_LAYOUT;f.state('reports');f.roster(count,count);
    for(let i=0;i<3&&document.querySelector('.cot-minimap').style.width!==`${mapSize}px`;i++)f.bus.emit('ui:minimapZoom',{});
    if(count===21)f.multiplayer('healthy');
    if(count===41)f.multiplayer('reconnecting');
    f.bus.emit('player:spotted',{timeS:f.frame.timeS-4});f.hud.update(f.frame);
   },{count,mapSize});
   await page.clock.runFor(100);
   const before=await page.evaluate(measure);const label=`${name}/${count}/${mapSize}px-map`;
   if(!before){assert.ok(touch,`${label}: missing report`);results.push({label,hidden:true});continue;}
   await page.evaluate(()=>{
    const f=window.__HUD_LAYOUT;
    for(let i=0;i<12;i++)f.bus.emit('tank:destroyed',{id:f.tanks[1].id,killerId:f.tanks[8].id,cause:'fire'});
   });
   await page.clock.runFor(100);
   unchanged(before,await page.evaluate(measure),label+'/arrivals');
   await page.keyboard.down('Tab');await page.clock.runFor(100);
   unchanged(before,await page.evaluate(measure),label+'/tab');
   await page.keyboard.up('Tab');await page.clock.runFor(100);
   // Keep the report fresh while the production kill-notice timers expire.
   await page.clock.fastForward(4900);
   await page.evaluate(()=>window.__HUD_LAYOUT.hit());await page.clock.runFor(100);
   const fresh=await page.evaluate(measure);
   await page.clock.fastForward(1600);await page.clock.runFor(100);
   unchanged(fresh,await page.evaluate(measure),label+'/expiry');
   assert.equal(await page.locator('.cot-kill-lane.r .cot-kf').count(),0,`${label}: real notice expiry`);
   if(count===7&&mapSize===220)await page.screenshot({path:resolve(out,name+'.png')});
   results.push({label,gap:before.map.top-before.card.bottom,passed:true});
   
  }
  if(!touch&&width>=768)for(const kind of ['drone','gunship']){
   await page.evaluate(async kind=>{
    await import('/src/ui/aerialHud.css');
    const {PerspectiveCamera}=await import('/node_modules/three/build/three.module.js');
    const {setModeWeapon}=await import('/src/sim/modeLoadout.ts');
    const f=window.__HUD_LAYOUT;f.state('reports');f.roster(7,7);
    f.frame.camera=new PerspectiveCamera(55,innerWidth/innerHeight,.1,2000);
    f.frame.camera.position.set(0,240,-50);f.frame.camera.lookAt(0,0,50);f.frame.camera.userData.thermalFlight=true;
    f.frame.matchModeState={id:kind==='gunship'?'ac130':'drone',escort:{alive:4,rescued:1,required:2,progress:.4},support:{ammoReadyInS:0,healReadyInS:12}};
    if(kind==='gunship'){f.frame.player.input={shellSlot:0};setModeWeapon(f.frame.player,'gunship');}
    f.frame.player.aerial={kind,active:true,launching:false,x:150,y:240,z:150,yaw:0,pitch:-1,batteryS:28,cooldownS:0};
    f.hud.update(f.frame);f.hit();
   },kind);
   await page.clock.runFor(150);
   const before=await page.evaluate(measure);
   unchanged(before,before,`${name}/${kind}`);
   results.push({label:`${name}/${kind}`,passed:true});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));
 console.log(`penetration dock: ${results.length} viewport/roster/map cases PASS; arrival, Tab and expiry invariance`);
}finally{await browser?.close();await server.close();}
