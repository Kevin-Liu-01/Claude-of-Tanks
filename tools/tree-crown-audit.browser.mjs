import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage,beginSoloBattle,applyGroundPose} from './map-probe-runtime.mjs';
import {TREE_SPECIES} from '../src/world/treeSpecies.ts';
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1];
const speciesList=arg('species')?.split(',')??TREE_SPECIES;
assert.ok(speciesList.every(s=>TREE_SPECIES.includes(s)));
const out=resolve(arg('out')??'.qa-dev/tree-crowns');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let refresh;const rows=[];
try{
 await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);
 await withMapProbeSession({root:process.cwd(),cacheDir:resolve('.qa-dev/tree-vite-cache')},async({browser,port})=>{
  const page=await browser.newPage();await page.setViewport({width:1000,height:900});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/tools/tree-crown-audit.html`);await page.waitForFunction(()=>window.audit);
  for(const species of speciesList)for(let variant=0;variant<3;variant++){
   for(const before of [true,false]){
    const row=await page.evaluate(({species,variant,before})=>window.audit.set(species,variant,.65,before),{species,variant,before});rows.push({...row,before});
    await page.screenshot({path:resolve(out,`${species}-${variant}-${before?'before':'after'}.png`)});
   }
  }
  for(const species of speciesList){
   await page.evaluate(species=>window.audit.set(species,0,.65,false,true),species);
   await page.screenshot({path:resolve(out,`${species}-far.png`)});
  }
  for(const species of ['pine','birch'].filter(s=>speciesList.includes(s))){
   await page.evaluate(species=>window.audit.set(species,1,.65,false,false,.8),species);
   await page.screenshot({path:resolve(out,`${species}-snow.png`)});
  }
  assert.deepEqual(errors,[]);await page.close();
  if(process.argv.includes('--models-only')){writeFileSync(resolve(out,'report.json'),JSON.stringify({rows,errors},null,2));return;}
  // Actual battlefield meshes and shaders, including instancing and wind.
  const game=await openGamePage(browser,{port,viewport:{width:1440,height:900}});
  await game.page.evaluate(()=>localStorage.setItem('cot.battle.times.v2',JSON.stringify(['day'])));
  await beginSoloBattle(game.page,{specId:'m1a2',mapId:'verdant'});
  const pose=await game.page.evaluate(()=>{
   const D=window.__DEBUG, meshes=[];D.scene.traverse(o=>{if(o.isInstancedMesh&&o.geometry.userData.crownAttachments?.length)meshes.push(o);});
   const m=meshes.find(o=>o.count>0);if(!m)throw new Error('No connected battle tree instances');
   const matrix=m.instanceMatrix.array;const x=matrix[12]+m.matrixWorld.elements[12],y=matrix[13]+m.matrixWorld.elements[13],z=matrix[14]+m.matrixWorld.elements[14];
   return{x,y,z,meshes:meshes.length};
  });
  await applyGroundPose(game.page,{cam:[pose.x+10,3,pose.z+12],at:[pose.x,4,pose.z]},{settleMs:300});
  await game.page.screenshot({path:resolve(out,'verdant-live.png')});
  for(const seconds of [4,11]){
   await game.page.evaluate(seconds=>window.__DEBUG.fastForward(seconds),seconds);
   await game.page.screenshot({path:resolve(out,`verdant-wind-${seconds}.png`)});
  }
  assert.deepEqual(game.errors,[]);await game.page.close();
  writeFileSync(resolve(out,'report.json'),JSON.stringify({rows,pose,errors},null,2));
 });
}finally{clearInterval(refresh);lock.release();}
