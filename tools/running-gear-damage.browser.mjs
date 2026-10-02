// Real battle presentation: dynamic debris, damage repair and terrain-fitted objectives.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage,beginSoloBattle,applyGroundPose} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/running-gear-damage');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let refresh;
try{
 await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);
 await withMapProbeSession({root:process.cwd(),cacheDir:resolve('.qa-dev/gear-vite-cache')},async({browser,port})=>{
  const {page,errors}=await openGamePage(browser,{port,viewport:{width:1440,height:900}});
  await beginSoloBattle(page,{specId:'m1a2',mapId:'verdant',gameMode:'zone_control'});
  const origin=await page.evaluate(()=>{
   const D=window.__DEBUG,p=D.game.player;
   for(const tank of D.game.tanks)if(tank!==p)tank.modeActive=false;
   return{x:p.state.pos.x,y:p.state.pos.y,z:p.state.pos.z};
  });
  await applyGroundPose(page,{cam:[origin.x-9,5,origin.z+10],at:[origin.x,.55,origin.z]},{settleMs:250});
  await page.screenshot({path:resolve(out,'intact.png')});
  await page.evaluate(()=>{
   const p=window.__DEBUG.game.player;
   for(const name of ['trackL','trackR']){const m=p.combat.modules[name];m.hp=0;m.state='red';m.repairT=-1000;}
  });
  await new Promise(r=>setTimeout(r,400));
  await page.screenshot({path:resolve(out,'falling.png')});
  await new Promise(r=>setTimeout(r,7500));
  await page.screenshot({path:resolve(out,'settled.png')});
  const before=await page.evaluate(()=>{
   const D=window.__DEBUG,p=D.game.player,V=D.camera.position.constructor;
   p.visual.root.updateMatrixWorld(true);
   const parts=[];p.visual.root.traverse(o=>{if(o.name==='gearThrownLinks'&&o.parent.visible){
    const m=o.matrix.clone();o.getMatrixAt(0,m);const v=new V().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);parts.push(v.toArray());
   }});return parts;
  });
  assert.equal(before.length,2,'each track has its own detached bank');
  await page.evaluate(()=>{window.__DEBUG.game.player.state.pos.x+=14;});
  await new Promise(r=>setTimeout(r,500));
  const after=await page.evaluate(()=>{
   const D=window.__DEBUG,p=D.game.player,V=D.camera.position.constructor;
   p.visual.root.updateMatrixWorld(true);
   const parts=[];let minimumClearance=Infinity;
   p.visual.root.traverse(o=>{if(o.name==='gearThrownLinks'&&o.parent.visible){
    const m=o.matrix.clone();o.getMatrixAt(0,m);parts.push(new V().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).toArray());
    const pos=o.geometry.attributes.position;
    for(let i=0;i<o.count;i++){
     o.getMatrixAt(i,m);
     for(let j=0;j<pos.count;j++){
      const v=new V().fromBufferAttribute(pos,j).applyMatrix4(m).applyMatrix4(o.matrixWorld);
      minimumClearance=Math.min(minimumClearance,v.y-D.world.heightField.getContactHeightAt(v.x,v.z));
     }
    }
   }});return{parts,minimumClearance};
  });
  for(let i=0;i<2;i++)assert(Math.hypot(...after.parts[i].map((v,j)=>v-before[i][j]))<.12,'settled track does not follow tank');
  assert(after.minimumClearance>-.035,'track iron stays on the rendered surface');
  await page.screenshot({path:resolve(out,'left-behind.png')});
  await page.evaluate(()=>{const p=window.__DEBUG.game.player;for(const name of ['trackL','trackR']){const m=p.combat.modules[name];m.hp=m.maxHp;m.state='ok';m.repairT=0;}});
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await page.evaluate(()=>{let visible=0;window.__DEBUG.game.player.visual.root.traverse(o=>{if(o.name==='detachedRunningGear'&&o.visible)visible++;});return visible;}),0,'repair restores track assembly and retires its debris');
  const zone=await page.evaluate(()=>{
   const D=window.__DEBUG,z=D.game.matchModeState.zones[0];
   return{x:z.x,y:z.y,z:z.z};
  });
  await applyGroundPose(page,{cam:[zone.x+39,15,zone.z+29],at:[zone.x,0,zone.z]},{settleMs:500});
  await page.screenshot({path:resolve(out,'capture-area.png')});
  const objective=await page.evaluate(()=>{
   const D=window.__DEBUG,V=D.camera.position.constructor,marker=D.scene.getObjectByName('capture-zone-1');
   if(!marker)throw Error('live capture marker missing');marker.updateWorldMatrix(true,true);
   let worst=0,samples=0;
   for(const index of [0,2,3]){const mesh=marker.children[index],p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){const v=new V().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),h=D.world.heightField.getContactHeightAt(v.x,v.z);
     worst=Math.max(worst,Math.abs(v.y-h-(index===3?.095:.065)));samples++;}}
   return{worst,samples};
  });
  assert(objective.worst<.01,'all objective vertices fit the actual live map triangles');
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,before,after,objective,errors},null,2));
  console.log('Live track flight, ground contact, moving-tank independence, repair and capture-area surface fit passed');
 });
}finally{clearInterval(refresh);lock.release();}
