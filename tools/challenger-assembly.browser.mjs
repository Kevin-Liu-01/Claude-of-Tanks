// Actual Garage engine, batching and cache-return coverage for the complete RWS.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {createCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions} from './native-browser-launch.mjs';

const out=resolve('.qa-dev/challenger-assembly'); mkdirSync(out,{recursive:true});
const lock=createCaptureLock(); let server,browser,refresh;
const report={pass:false,garage:[],errors:[]};
try {
  await lock.acquire(10800000); refresh=setInterval(()=>lock.refresh(),30000);
  server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}});
  await server.listen(); const port=server.httpServer.address().port;
  browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:true,args:['--use-gl=angle','--enable-webgl','--no-sandbox'],protocolTimeout:240000}));
  const page=await browser.newPage(); page.on('pageerror',e=>report.errors.push(e.message));
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${port}/?qa=1&nosplash=1`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__GAME_READY&&window.__DEBUG?.pedestalOnStage,{timeout:240000});
  await page.waitForSelector('#cot-boot',{hidden:true,timeout:60000});
  for (const [index,id] of ['challenger_3','challenger_3x','challenger_3'].entries()) {
    await page.evaluate(id=>window.__DEBUG.selectGarageTank(id),id);
    await page.waitForFunction(id=>{const d=window.__DEBUG;return d.selectedSpecId===id&&d.pedestalVisual?.specId===id&&d.pedestalOnStage;},{timeout:120000},id);
    await page.screenshot({path:resolve(out,`${index}-${id}-garage.png`)});
    const sample=await page.evaluate(()=>{
      const d=window.__DEBUG,root=d.pedestalVisual.root;
      const name='fitting_browningDerived_m2',station=root.getObjectByName(name),pitch=station?.getObjectByName('auxiliaryWeaponPitch');
      const parts=[];station?.traverse(o=>{if(o.isMesh&&o.name.startsWith(name+'_'))parts.push({name:o.name,parent:o.parent.name,vertices:o.geometry.attributes.position.count});});
      const support=root.getObjectByName(name+'_pitch_turretEquipment');
      const color=support?.geometry.attributes.color,original=color?.array.slice();
      d.pedestalVisual.setWeaponModuleState('roofGun','red');
      const damageVisible=!!color&&color.array.some((v,i)=>v<original[i]);
      d.pedestalVisual.setWeaponModuleState('roofGun','ok');
      const repaired=!!color&&color.array.every((v,i)=>v===original[i]);
      return {id:d.selectedSpecId,uuid:root.uuid,parts,hasPitch:!!pitch,damageVisible,repaired,version:document.querySelector('meta[name="application-version"]')?.content,quality:d.quality.resolvePresetName()};
    });
    assert.ok(sample.hasPitch);
    assert.ok(sample.damageVisible&&sample.repaired,'live stock shows damage and exact repair');
    assert.ok(sample.parts.some(p=>p.name.endsWith('yaw_turretGlass')&&p.parent==='fitting_browningDerived_m2'));
    assert.ok(sample.parts.some(p=>p.name.endsWith('pitch_turretEquipment')&&p.parent==='auxiliaryWeaponPitch'));
    for (const [pose,yaw,elevation] of [['rest',0,0],['traverse',1.2,-.35],['damaged',1.2,-.35]]) {
      const png=await page.evaluate(({pose,yaw,elevation})=>{
        const d=window.__DEBUG,root=d.pedestalVisual.root;
        const station=root.getObjectByName('fitting_browningDerived_m2'),pitch=station.getObjectByName('auxiliaryWeaponPitch');
        const previousYaw=station.rotation.y,previousPitch=pitch.rotation.x;
        d.pedestalVisual.setWeaponModuleState('roofGun',pose==='damaged'?'red':'ok');
        station.rotation.y=yaw;pitch.rotation.x=elevation;root.updateMatrixWorld(true);
        const camera=d.camera.clone(),V=camera.position.constructor;
        const target=station.localToWorld(new V(0,.22,.15));
        camera.position.copy(target).add(new V(2.2,1.35,2.5));camera.fov=35;
        camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
        d.renderer.render(d.scene,camera);
        const image=d.renderer.domElement.toDataURL('image/png');
        d.pedestalVisual.setWeaponModuleState('roofGun','ok');
        station.rotation.y=previousYaw;pitch.rotation.x=previousPitch;root.updateMatrixWorld(true);
        return image;
      },{pose,yaw,elevation});
      writeFileSync(resolve(out,`${index}-${id}-${pose}.png`),Buffer.from(png.split(',')[1],'base64'));
    }
    report.garage.push(sample);
  }
  assert.equal(report.garage[0].uuid,report.garage[2].uuid,'cached return retains complete RWS');
  assert.deepEqual(report.errors,[]); report.pass=true;
  console.log('PASS Challenger 3/Prototype live Garage, articulated stock, and cached return');
} finally {
  writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
  clearInterval(refresh);await browser?.close();await server?.close();lock.release();
}
