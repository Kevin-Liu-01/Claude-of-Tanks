// Committed DOM regression using production report, record, roster and feed owners.
// Run under tools/capture-command.mjs; no simulation or WebGL is required.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const playwrightModule=process.argv.find(a=>a.startsWith('--playwright-module='))?.slice(20)||'playwright';
const { chromium }=await import(playwrightModule);
const out=resolve('.qa-dev/battle-reports');await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try {
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 for(const [name,width,height,touch] of [['desktop',1440,900,false],['portrait',390,844,true],['landscape',667,375,true],['tiny-landscape',568,256,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/fixtures/battle-hud-layout.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
  await page.evaluate(()=>{
   const {bus,hud,frame}=window.__HUD_LAYOUT;
   hud.setMode('hidden');hud.setMode('battle');hud.update(frame);
   bus.emit('tank:destroyed',{id:'tank-8',killerId:'tank-0',cause:'ammorack'});
   bus.emit('tank:destroyed',{id:'tank-1',killerId:'tank-9',cause:'ram'});
   hud.update(frame);
  });
  assert.equal(await page.locator('.cot-ear.l .kills:not([hidden])').first().textContent(),'1');
  assert.equal(await page.locator('.cot-ear.r .kills:not([hidden])').first().textContent(),'1');
  assert.match(await page.locator('[data-kill-cause=ammorack]').textContent(),/AMMO RACK/);
  await page.evaluate(()=>{document.body.style.background='url("/media/home/p2_46_verdant_meadow_duel.webp") center/cover no-repeat #233039';});
  await page.screenshot({path:resolve(out,`${name}-killfeed.png`)});
  await page.evaluate(async()=>{
   const {hud}=window.__HUD_LAYOUT;hud.setMode('hidden');
   const [{createEndScreen},{createBus},{installServiceRecord},{installBattleRecords},{createServiceRecordDialog}]=await Promise.all([
    import('/src/ui/endScreen.ts'),import('/src/game/stateCore.ts'),import('/src/game/serviceRecord.ts'),import('/src/game/profile.ts'),import('/src/ui/serviceRecordDialog.ts')]);
   await import('/src/ui/serviceRecord.css');
   const bus=createBus();installBattleRecords(bus);let clock=10;
   installServiceRecord(bus,{playerId:()=> 'me',playerTeam:()=> 'player',teamOf:id=>id==='me'?'player':'enemy',gameMode:()=> 'standard',clockS:()=>clock,playerHpFraction:()=>1,playerMaxHp:()=>2600,playerNation:()=> 'USA',playerAerialKind:()=>null,respawns:()=>false});
   bus.emit('ui:battleStart',{specId:'m1a2',mapId:'winter'});
   for(let i=0;i<3;i++){clock=20+i*4;bus.emit('shell:fired',{shooterId:'me',shellId:i,caliberMm:120});bus.emit('shell:hit',{attackerId:'me',targetId:`e${i}`,shellId:i,damage:1800,kind:'pen',destroyed:true});bus.emit('tank:destroyed',{id:`e${i}`,killerId:'me',specId:'t90m',cause:i===2?'ammorack':'shot'});}
   bus.emit('battle:ended',{result:'victory',mapId:'winter',durationS:180,gameMode:'standard',roster:[]});
   const host=document.createElement('div');document.body.append(host);
   const screen=createEndScreen(createBus(),host);
   const ally=Array.from({length:15},(_,i)=>({id:`a${i}`,name:`Allied Commander ${i+1}`,specId:i%2?'leo2a5':'m1a2',dmg:2315-i*110,kills:i%4,deaths:i%2,dead:i>8,isPlayer:i===0}));
   const enemies=Array.from({length:15},(_,i)=>({id:`e${i}`,name:`Enemy Commander ${i+1}`,specId:'t90m',dmg:1600-i*90,kills:i%3,dead:true}));
   const sum={playerVehicle:'M1A2 Abrams',playerSpecId:'m1a2',map:'Glacier Pass',mapId:'winter',timeS:180,stats:{dealt:2315,received:740,blocked:1240,fired:20,hits:14,pens:9,assist:870,modulesDestroyed:4,spotted:6},kills:[{id:'e1',name:'T-90M',specId:'t90m',dmg:1800}],allies:ally,enemies,awards:{medals:['first_blood','detonator'],achievements:[]},finalBlow:{cause:'ammorack',attacker:'M1A2 Abrams',target:'T-90M',shell:'M829A3',attackerIsPlayer:true,targetIsPlayer:false}};
   const record=createServiceRecordDialog({vehicle:id=>id==='m1a2'?'M1A2 Abrams':'T-90M',map:()=> 'Glacier Pass',modeIcon:()=> 'modeStandard'},()=>{});
   window.__REPORTS={screen,sum,record};screen.show('victory',sum);
  });
  for(const result of ['victory','defeat','draw']) {
   await page.evaluate(r=>window.__REPORTS.screen.show(r,window.__REPORTS.sum),result);
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(900);
   const bounds=await page.locator('.cot-es.show').evaluate(el=>{const r=el.getBoundingClientRect();const report=el.querySelector('.es-report'),actions=el.querySelector('.es-actions');return {width:r.width,height:r.height,scroll:report.scrollWidth,client:report.clientWidth,actions:actions.getBoundingClientRect().bottom};});
   assert.ok(bounds.scroll<=bounds.client+1,`${name}/${result}: no horizontal report overflow`);
   assert.ok(bounds.actions<=height+1,`${name}/${result}: actions remain reachable`);
   assert.match(await page.locator('.cot-es.show').getAttribute('style'),/maps\/winter.webp/);
   assert.equal(await page.locator('.es-stat-secondary .es-mini').count(),6);
   await page.locator('[data-report-view=teams]').click();assert.equal(await page.locator('.es-tr').count(),30);
   if(result==='victory')await page.screenshot({path:resolve(out,`${name}-teams.png`)});
   await page.locator('[data-report-view=personal]').click();
   await page.screenshot({path:resolve(out,`${name}-${result}.png`)});
  }
  await page.evaluate(()=>{window.__REPORTS.screen.hide();window.__REPORTS.record.open(document.body);});
  await page.locator('[data-record-tab=history]').click();
  assert.match(await page.locator('[data-record-tab=history]').textContent(),/Battle Log/);
  await page.locator('.cot-record-battle summary').click();
  assert.equal(await page.locator('.cot-record-trace li').count(),3);
  assert.equal(await page.locator('.cot-record-battle-metrics .cot-record-metric').count(),4);
  await page.screenshot({path:resolve(out,`${name}-record.png`)});
  await page.locator('[data-record-tab=medals]').click();
  await page.locator('.cot-record-medal-inspect').first().focus();
  await page.waitForTimeout(400);
  await page.screenshot({path:resolve(out,`${name}-medals.png`)});
  assert.deepEqual(errors,[],`${name}: no page errors`);
  await context.close();
 }
 console.log(`battle-reports: roster/feed + victory/defeat/draw + Battle Log at four viewports PASS; ${out}`);
} finally {await browser?.close();await server.close();}
