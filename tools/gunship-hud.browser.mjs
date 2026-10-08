// Render the production HUD and touch controls; verify gunship commands and layout.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession } from './map-probe-runtime.mjs';

const out=resolve('.qa-dev/gunship-hud');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;
const reports=[],failures=[];
const cases=[[1280,800,false,'en-US'],[800,600,false,'en-US'],[568,320,true,'en-US'],[480,270,true,'en-US'],[320,568,true,'en-US'],[390,844,true,'en-US'],[568,320,true,'zh-CN']];
try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);
 console.log('gunship-hud: acquired browser slot');
 await withMapProbeSession({root:process.cwd()},async({browser,baseUrl})=>{
  for(const [width,height,touch,locale] of cases){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.setViewport({width,height,isMobile:touch,hasTouch:touch});
   await page.goto(`${baseUrl}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle0'});
   await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
   await page.evaluate(async()=>{
    await import('/src/ui/aerialHud.css');
    const {PerspectiveCamera}=await import('/node_modules/three/build/three.module.js');
    const {setModeWeapon}=await import('/src/sim/modeLoadout.ts');
    const {createCombatState}=await import('/src/sim/damage.ts');
    const f=window.__HUD_LAYOUT;
    f.frame.camera=new PerspectiveCamera(27.5,innerWidth/innerHeight,.1,2000);
    f.frame.camera.position.set(0,240,-50);f.frame.camera.lookAt(0,0,50);f.frame.camera.userData.thermalFlight=true;
    f.frame.matchModeState={id:'ac130',escort:{alive:4,rescued:1,required:2,progress:.4},support:{ammoReadyInS:0,healReadyInS:12}};
    f.frame.player.combat=createCombatState(f.frame.player.spec);f.frame.player.input={shellSlot:0};
    setModeWeapon(f.frame.player,'gunship');
    f.frame.player.aerial={kind:'gunship',active:true,x:150,y:240,z:150,yaw:0,pitch:-1,batteryS:0,cooldownS:0};
    f.frame.aim.distM=287;f.frame.auxiliaryKeyLabels={aerialVision:'O',supplyAmmo:'J',supplyHeal:'K'};
    window.__gunshipActions=[];
    for(const event of ['ui:supplyAmmo','ui:supplyHeal','ui:shellSelect'])f.bus.on(event,payload=>window.__gunshipActions.push({event,...payload}));
    f.hud.update(f.frame);await document.fonts.ready;
   });
   for(let slot=0;slot<3;slot++){
    await page.evaluate(async slot=>{
     const f=window.__HUD_LAYOUT,c=f.frame.player.combat;
     c.shellSlot=slot;c.reload=c.reloadChannels[slot];c.reload.t=slot===1?1.7:0;
     const {setAerialVision}=await import('/src/engine/aerialVision.ts');setAerialVision(['infrared','thermal','night'][slot]);
     f.hud.update(f.frame);
    },slot);
    if(!touch&&slot===2)await page.evaluate(()=>window.__HUD_LAYOUT.bus.emit('ui:minimapZoom',{}));
    await new Promise(resolve=>setTimeout(resolve,180));
    const report=await page.evaluate(()=>{
     const root=document.querySelector('.cot-flight-hud'),issues=[];
     const rect=el=>{const r=el.getBoundingClientRect();return{name:el.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
     const visible=el=>el.checkVisibility({checkVisibilityCSS:true});
     const controls=[...root.querySelectorAll('button')].filter(visible),rects=controls.map(rect);
     const obstacles=[...document.querySelectorAll('.cot-touch .fire:not(.alt),.cot-touch .scope,.cot-minimap,.cot-mode-status,.cot-top,.cot-touch .mobile-chrome,.flight-sight,.gunship-solution-label')].filter(visible).map(rect);
     const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
     for(const [i,a] of rects.entries()){
      if(a.x<0||a.y<0||a.right>innerWidth+.5||a.bottom>innerHeight+.5)issues.push(`offscreen ${a.name}`);
      if(a.width<44||a.height<44)issues.push(`small target ${a.name}`);
      for(const b of [...rects.slice(i+1),...obstacles])if(overlaps(a,b))issues.push(`${a.name} overlaps ${b.name}`);
      if(!controls[i].getAttribute('aria-label'))issues.push(`missing label ${a.name}`);
      if(getComputedStyle(controls[i],'::before').clipPath==='none')issues.push(`rectangular control ${a.name}`);
     }
     for(const el of root.querySelectorAll('.flight-feed,.flight-weapon-copy,.flight-supply'))if(visible(el)&&el.scrollWidth>el.clientWidth+1)issues.push(`clipped ${el.className}`);
     if(getComputedStyle(root.querySelector('.flight-console')).backgroundImage!=='none')issues.push('old console background remains');
     return{issues,rects,obstacles,kind:root.dataset.kind,weapon:root.dataset.weapon,view:root.dataset.view,selected:root.querySelectorAll('.flight-weapon[aria-pressed=true]').length,progress:root.querySelector('.flight-weapon[aria-pressed=true]').style.getPropertyValue('--weapon-ready')};
    });
    const name=`${width}-${height}-${locale}-${slot}`;reports.push({name,...report});failures.push(...report.issues.map(issue=>`${name}: ${issue}`));
    assert.equal(report.kind,'gunship');assert.equal(report.weapon,String(slot));assert.equal(report.selected,1);
    if(slot===1)assert.ok(Number(report.progress)>0&&Number(report.progress)<1,'selected reload indicator follows the real channel');
    await page.screenshot({path:resolve(out,`${name}.png`)});
   }
   // Ready and disabled support actions, direct weapon selection, keyboard sensor cycling.
   await page.click('.flight-supply[data-supply=heal]');await page.click('.flight-supply[data-supply=ammo]');
   await page.click('.flight-weapon:nth-child(1)');
   await page.focus('.flight-view-switch');await page.keyboard.press('Enter');
   await page.evaluate(()=>{const f=window.__HUD_LAYOUT;f.hud.update(f.frame);});
   assert.equal(await page.$eval('.cot-flight-hud',el=>el.dataset.view),'daylight');
   assert.deepEqual(await page.evaluate(()=>window.__gunshipActions),[{event:'ui:supplyAmmo'},{event:'ui:shellSelect',slot:0}]);
   await page.evaluate(()=>{const f=window.__HUD_LAYOUT;f.frame.matchModeState.support.healReadyInS=0;f.hud.update(f.frame);});
   await page.focus('.flight-supply[data-supply=heal]');await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>window.__gunshipActions.at(-1).event),'ui:supplyHeal');
   // Leaving flight removes its aiming solution and blocks stale hidden commands.
   await page.evaluate(()=>{const f=window.__HUD_LAYOUT;f.frame.player.aerial.active=false;f.hud.update(f.frame);document.querySelector('.flight-weapon').click();document.querySelector('.flight-supply').click();});
   assert.equal(await page.evaluate(()=>window.__gunshipActions.length),3);
   assert.equal(await page.$eval('.gunship-solution',el=>el.checkVisibility()),false);
   failures.push(...errors.map(error=>`${width}x${height}: ${error}`));await page.close();
  }
 });
 writeFileSync(resolve(out,'report.json'),JSON.stringify({reports,failures},null,2));
 assert.deepEqual(failures,[]);
 console.log('gunship-hud: seven viewport/locale cases, three weapons, reload, sensors, supplies, keyboard controls and flight exit passed');
}finally{clearInterval(heartbeat);await lock.release();}
