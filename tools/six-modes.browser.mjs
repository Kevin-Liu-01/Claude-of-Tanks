// Committed native-browser regression: real Garage, battle entry, flight input and compact HUD.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession, openGamePage, beginSoloBattle } from './map-probe-runtime.mjs';
const remote=process.env.COT_MODE_VERIFY_URL;
const out=resolve(process.env.COT_MODE_LIST==='realistic'?'.qa-dev/scope-views':remote?'.qa-dev/six-modes-live':'.qa-dev/six-modes');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;
const reports=[];
const battleModes=process.env.COT_MODE_LIST?process.env.COT_MODE_LIST.split(','):process.env.COT_AERIAL_ONLY?['drone','ac130']:['drone','ac130','juggernaut','infected','realistic','gun_game'];

try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);
 console.log('six-modes: acquired native capture slot');
 await withMapProbeSession({root:process.cwd(),launch:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},async({browser,port})=>{
  const profiles=[{width:1280,height:800},{width:568,height:320,deviceScaleFactor:1,isMobile:true,hasTouch:true},{width:480,height:270,deviceScaleFactor:1,isMobile:true,hasTouch:true}];
  for(const initialViewport of profiles) {
  const mobile=!!initialViewport.isMobile;
  if(process.env.COT_TINY_ONLY&&initialViewport.width!==480)continue;
  if(process.env.COT_AERIAL_TOUCH_ONLY&&!mobile)continue;
  if(process.env.COT_DESKTOP_ONLY&&mobile)continue;
  const suffix=mobile?(initialViewport.width<500?'touch-small':'touch'):'desktop';
  const {page,errors}=remote?await openPublishedPage(browser,remote,initialViewport):await openGamePage(browser,{port,viewport:initialViewport});
  page.on('console',message=>{if(message.type()==='error'){console.error('browser:',message.text().slice(0,500));if(/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(message.text()))errors.push(message.text());}});
  await page.click('.cot-battle-mode');
  for(const mode of ['juggernaut','infected','realistic','gun_game','drone','ac130']){
   const choice=await page.waitForSelector(`.cot-battle-menu [data-game-mode="${mode}"]`,{visible:true});
   await choice.scrollIntoView();
   if(mobile)await choice.tap();else await choice.click();
   assert.equal(await choice.evaluate(el=>el.getAttribute('aria-pressed')),'true',`${mode} selected through the garage control`);
  }
  await page.screenshot({path:resolve(out,`garage-modes-${suffix}.png`)});
  await page.click('[data-battle-close]');
  for(const mode of battleModes){
   if(!remote)await page.evaluate(async mode=>{const {writeTeamArrangement}=await import('/src/game/teamArrangement.ts');writeTeamArrangement(mode,mode==='ac130'?{allies:4,enemies:8}:{allies:1,enemies:2});},mode);
   console.log('six-modes: entering',mode,suffix);
   await beginSoloBattle(page,{specId:'m1a2',mapId:'verdant',gameMode:mode});
   assert.equal(await page.evaluate(()=>window.__DEBUG.game.gameMode),mode);
   if(mode==='drone'){
    assert.equal(await page.evaluate(()=>!!window.__DEBUG.game.player.visual.root.getObjectByName('Docked FPV mission payload')?.visible),true,'drone starts on the carrier');
    assert.equal(await page.evaluate(()=>window.__DEBUG.game.player.visual.root.getObjectByName('Reusable mission payload rail').parent.name),'rig_turret','mission rail belongs to the turret');
    await page.screenshot({path:resolve(out,`drone-docked-${suffix}.png`)});
    if(mobile)await page.tap('.cot-drone-control');
    else {await page.mouse.click(640,400);await page.keyboard.press('KeyV');}
    await page.waitForFunction(()=>window.__DEBUG.game.player.aerial?.active,{timeout:10000});
    await new Promise(r=>setTimeout(r,700));
    assert.equal(await page.evaluate(()=>window.__DEBUG.camera.userData.thermalFlight),false,'launch camera stays in color');
    await page.screenshot({path:resolve(out,`drone-launch-${suffix}.png`)});
    await page.waitForFunction(()=>!window.__DEBUG.game.player.aerial.launching,{timeout:10000});
    await page.waitForFunction(()=>window.__DEBUG.camera.userData.thermalFlight===true,{timeout:5000});
    const before=await page.evaluate(()=>{const v=window.__DEBUG.game.player.aerial;return{x:v.x,y:v.y,z:v.z};});
    if(mobile){
     const box=await page.$eval('.cot-touch .joy',el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,dy:r.height*.35};});
     await page.touchscreen.touchStart(box.x,box.y);await page.touchscreen.touchMove(box.x,box.y-box.dy);
     await new Promise(r=>setTimeout(r,1200));await page.touchscreen.touchEnd();
    }else {await page.keyboard.down('KeyW');await new Promise(r=>setTimeout(r,1200));await page.keyboard.up('KeyW');}
    const after=await page.evaluate(()=>{const v=window.__DEBUG.game.player.aerial;return{x:v.x,y:v.y,z:v.z};});
    assert.ok(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z)>3,'pilot movement flies the drone');
    await page.screenshot({path:resolve(out,`drone-flight-${suffix}.png`)});
    assert.equal(await page.$eval('.cot-drive',el=>getComputedStyle(el).display),'none','no tank speedometer during FPV flight');
    assert.equal(await page.$eval('.cot-dp',el=>getComputedStyle(el).display),'none','no tank damage panel during FPV flight');
    const consoleBounds=await page.$eval('.flight-console',el=>{const r=el.getBoundingClientRect();return{top:r.top,left:r.left,right:r.right,bottom:r.bottom};});
    assert.ok(consoleBounds.top>initialViewport.height/2+12,'flight console stays below the sight');
    await checkSensors(page,mode,suffix,mobile);
    if(mobile)await page.tap('.cot-drone-return');else await page.keyboard.press('KeyV');await page.waitForFunction(()=>!window.__DEBUG.game.player.aerial.active);
    assert.equal(await page.$eval('.cot-drone-signal-loss',e=>e.hidden),false,'return has a signal-loss transition');
    await page.screenshot({path:resolve(out,`drone-static-${suffix}.png`)});
    await page.waitForFunction(()=>document.querySelector('.cot-drone-signal-loss').hidden);
    reports.push({mode,mobile,before,after,returned:true});
   }else if(mode==='ac130'){
    const escort=await page.evaluate(()=>({...window.__DEBUG.game.matchModeController.state.escort}));
    assert.ok(escort.total>=2&&escort.required>=1,'gunship has a vulnerable ground escort');
    assert.match(await page.$eval('.cot-mode-status',el=>el.textContent),/PROTECT THE CONVOY/);
    await page.waitForFunction(()=>{const e=window.__DEBUG.game.matchModeController.state.escort;return e.progress>.01||e.rescued>0;},{timeout:30000});
    const buttons=await page.$$eval('.flight-supply',els=>els.map(el=>{const r=el.getBoundingClientRect();return{w:r.width,h:r.height};}));
    assert.ok(buttons.every(b=>b.w>=44&&b.h>=44),'supply controls remain accessible');
    assert.equal(await page.$eval('.flight-telemetry',e=>getComputedStyle(e).display!=='none'),true,'gunship range and zoom stay visible');
    assert.equal(await page.$eval('.flight-heading',e=>{const children=[...e.children].filter(c=>c.getBoundingClientRect().width>0);return children.every((c,i)=>!i||children[i-1].getBoundingClientRect().right<=c.getBoundingClientRect().left+1);}),true,'sensor, range and supplies do not overlap');
    if(mobile)await page.tap('[data-supply="ammo"]');else await page.keyboard.press('KeyJ');
    await page.waitForFunction(()=>window.__DEBUG.game.matchModeController.state.pickups.some(p=>p.airDrop));
    assert.equal(await page.$eval('[data-supply="ammo"]',e=>e.disabled),true,'supply cooldown appears');
    const before=await page.evaluate(()=>({...window.__DEBUG.game.player.aerial}));
    await new Promise(r=>setTimeout(r,1200));
    const after=await page.evaluate(()=>({...window.__DEBUG.game.player.aerial}));
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>1,'aircraft orbits during play');
    assert.equal(await page.evaluate(()=>window.__DEBUG.game.player.spec.gun.shells[1].caliberMm),152);
    assert.ok(after.y>=230,'gunship starts and stays airborne');
    assert.equal(await page.evaluate(()=>window.__DEBUG.post.composer.passes.find(p=>p.isOutputGradePass).uniforms.uThermal.value),1,'gunship uses real thermal postprocessing');
    assert.match(await page.$eval('.flight-weapons',el=>el.textContent),/30 mm cannon.*152 mm HE.*Guided missile/s);
    const howitzer=await page.$('.flight-weapon:nth-child(2)');if(mobile)await howitzer.tap();else await howitzer.click();
    await page.waitForFunction(()=>window.__DEBUG.game.player.combat.shellSlot===1);
    reports.push({mode,mobile,before,after});
   }else reports.push({mode,mobile,state:await page.evaluate(()=>window.__DEBUG.game.matchModeState)});
   if(mode==='ac130'){
    await checkSensors(page,mode,suffix,mobile);
    const bounds=await page.$eval('.flight-console',el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
    assert.ok(bounds.x>=0&&bounds.y>initialViewport.height/2+12&&bounds.right<=initialViewport.width&&bounds.bottom<=initialViewport.height,'flight controls fit below sight');
    assert.equal(await page.$eval('.cot-drive',el=>getComputedStyle(el).display),'none','no tank speedometer in gunship');
    if(mobile){
     const controlsClear=await page.evaluate(()=>{
      const panel=document.querySelector('.flight-console').getBoundingClientRect();
      return ['.cot-touch .scope','.cot-touch .fire:not(.alt)'].every(selector=>{
       const button=document.querySelector(selector).getBoundingClientRect();
       return button.right<=panel.left||button.left>=panel.right||button.bottom<=panel.top||button.top>=panel.bottom;
      });
     });
     assert.ok(controlsClear,'aircraft zoom and fire buttons stay outside weapon cards');
    }
   }
   if(mode==='realistic'){
    if(mobile)await page.tap('.cot-touch .scope');else {await page.mouse.click(initialViewport.width/2,initialViewport.height/2);await page.keyboard.press('ShiftLeft');}
    await page.waitForSelector('.cot-scope-vision',{visible:true});
    assert.equal(await page.$eval('.cot-scope-vision',e=>{const a=e.getBoundingClientRect();return ['.cot-mode-status','.cot-touch .fire:not(.alt)','.cot-touch .scope','.cot-touch .autoaim'].every(selector=>{const other=document.querySelector(selector);if(!other||getComputedStyle(other).display==='none')return true;const b=other.getBoundingClientRect();return !b.width||a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;});}),true,'scope sensor clears objective and touch controls');
    for(const [view,code] of [['daylight',0],['infrared',1],['thermal',2],['night',3]]){
     await page.waitForFunction(code=>window.__DEBUG.post.composer.passes.find(p=>p.isOutputGradePass).uniforms.uThermal.value===code,{},code);
     await page.screenshot({path:resolve(out,`tank-scope-${view}-${suffix}.png`)});
     if(mobile)await page.tap('.cot-scope-vision');else await page.keyboard.press('KeyI');
    }
   }
   if(mode==='gun_game')assert.equal(await page.$$eval('.cot-shell:not([hidden])',els=>els.length),1,'Gun Game exposes only the current weapon');
   if(mode==='juggernaut')assert.ok(await page.evaluate(()=>{
    const root=window.__DEBUG.game.player.visual.root;let surfaces=0;
    root.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Juggernaut surface highlight'))surfaces++;});
    return surfaces>0&&!root.getObjectByName('Juggernaut energy shield');
   }),'boss highlight follows real vehicle surfaces without a bubble');
   if(mode==='juggernaut'&&!remote){
    await page.screenshot({path:resolve(out,`juggernaut-waves-a-${suffix}.png`)});
    await new Promise(r=>setTimeout(r,450));
    await page.screenshot({path:resolve(out,`juggernaut-waves-b-${suffix}.png`)});
    for(const side of [-1,1]){
     const contact=await page.evaluate(async side=>{
      const T=await import('/node_modules/three/build/three.module.js');const {player}=window.__DEBUG.game,root=player.visual.root;
      root.updateWorldMatrix(true,true);
      const start=root.localToWorld(new T.Vector3(side*.95,7,-1.8));
      const ray=new T.Raycaster(start,new T.Vector3(0,-1,0));
      const hit=ray.intersectObject(root,true).find(h=>{
       const m=h.object.material;if(!m||Array.isArray(m)||!m.colorWrite||m.transparent)return false;
       for(let p=h.object;p;p=p.parent)if(!p.visible)return false;
       return true;
      });
      if(!hit)return null;
      let frame='hull';for(let p=hit.object;p&&p!==root;p=p.parent){if(p.name==='rig_gun'){frame='gun';break;}if(p.name==='rig_turret')frame='turret';}
      window.__DEBUG.bus.emit('shell:hit',{targetId:player.id,kind:'ricochet',damage:0,caliberMm:120,pos:hit.point.toArray(),normal:[0,1,0],impactFrame:frame});
      return hit.point.toArray();
     },side);
     assert.ok(contact,'probe hits actual visible tank skin');
     await new Promise(r=>setTimeout(r,120));
     await page.screenshot({path:resolve(out,`juggernaut-hit-${side}-${suffix}.png`)});
     await new Promise(r=>setTimeout(r,1400));
    }
   }
   if(mode==='juggernaut')assert.match(await page.$eval('.cot-mode-status',el=>el.textContent),/SURVIVE/,'the boss receives its own survival objective');
   await page.screenshot({path:resolve(out,`${mode}-${suffix}.png`)});
   await page.evaluate(()=>document.exitPointerLock());
   await page.setViewport({...initialViewport,width:568,height:320,deviceScaleFactor:1});
   await new Promise(r=>setTimeout(r,400));
   await page.screenshot({path:resolve(out,`${mode}-landscape-${suffix}.png`)});
   const objective=await page.$eval('.cot-mode-status',el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};}).catch(()=>null);
   if(objective)assert.ok(objective.left>=-1&&objective.right<=569&&objective.bottom<=320,`${mode} objective fits landscape`);
   await page.evaluate(()=>window.__DEBUG.leaveBattleToGarage());
   await page.waitForFunction(()=>window.__DEBUG.game.phase==='garage',{timeout:180000});
   await page.setViewport(initialViewport);
  }
  assert.deepEqual(errors,[],'no page errors');
  await page.close();
  }
  writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,reports},null,2));
  console.log('six-modes: all mode entries, FPV controls, orbit and compact screenshots passed');
 });
}finally{clearInterval(heartbeat);lock.release();}

async function openPublishedPage(browser,url,viewport){
 const page=await browser.newPage(),errors=[];
 await page.setViewport({...viewport,deviceScaleFactor:1});page.on('pageerror',error=>errors.push(String(error.message)));
 await page.goto(url+'/?nosplash=1&tier=desktop&gfxreset=1',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction('window.__GAME_READY === true',{timeout:300000});
 return {page,errors};
}

async function checkSensors(page,mode,suffix,mobile){
 for(const [label,code] of [['Infrared',1],['Thermal',2],['Night vision',3],['Daylight',0]]){
  await page.waitForFunction((code)=>window.__DEBUG.post.composer.passes.find(p=>p.isOutputGradePass).uniforms.uThermal.value===code,{timeout:5000},code);
  console.log('six-modes: sensor',mode,suffix,label);
  assert.match(await page.$eval('.flight-view-switch',el=>el.textContent),new RegExp(label));
  const spacing=await page.$eval('.flight-console',el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{padding:parseFloat(s.paddingLeft),top:r.top,height:r.height};});
  assert.ok(spacing.padding>=6,'flight panel retains padding against HUD reset');
  const button=await page.$eval('.flight-view-switch',el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height};});
  assert.ok(button.width>=44&&button.height>=44,'sensor control has a touch-sized target');
  await page.screenshot({path:resolve(out,`${mode}-sensor-${code}-${suffix}.png`)});
  if(mobile)await page.tap('.flight-view-switch');else await page.keyboard.press('KeyI');
 }
 await page.waitForFunction(()=>window.__DEBUG.post.composer.passes.find(p=>p.isOutputGradePass).uniforms.uThermal.value===1);
}
