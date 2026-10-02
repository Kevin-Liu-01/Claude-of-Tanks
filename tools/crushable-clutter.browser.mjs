// Native map geometry/collision lifecycle. No synthetic prop builders or UI stubs.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage,beginSoloBattle,applyGroundPose} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/clutter');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let refresh;
try{
  await lock.acquire();refresh=setInterval(()=>lock.refresh(),30000);
  await withMapProbeSession({root:process.cwd(),cacheDir:resolve('.qa-dev/clutter-vite-cache')},async({browser,port})=>{
    const {page,errors}=await openGamePage(browser,{port,viewport:{width:1200,height:800}});
    await beginSoloBattle(page,{specId:'m551_sheridan',mapId:'urban'});
    const reports=[];
    for(const kind of ['rubble','hedgehog','small-rock']){
      const pose=await page.evaluate(kind=>{
        const D=window.__DEBUG,w=D.world;
        w.resetDestructibles();
        const rec=w.destructibles.find(r=>r.kind===kind&&Math.abs(r.x)<350&&Math.abs(r.z)<350);
        if(!rec?.clutter)throw Error(`no native ${kind}`);
        window.clutterTest={rec,positions:rec.clutter.spans.map(s=>s.position.array.slice()),normals:rec.clutter.spans.map(s=>s.normal.array.slice()),instances:rec.clutter.instances.map(i=>i.mesh.instanceMatrix.array.slice())};
        return {x:rec.x,y:rec.y,z:rec.z};
      },kind);
      await applyGroundPose(page,{cam:[pose.x+7,5,pose.z+9],at:[pose.x,.4,pose.z]},{settleMs:200});
      await page.screenshot({path:resolve(out,`${kind}-intact.png`)});
      const report=await page.evaluate(()=>{
        const {rec,positions,instances}=window.clutterTest,w=window.__DEBUG.world;
        let nodes=0;w.group.traverse(()=>nodes++);
        if(!w.crushObstacle(rec.ob,0,1,1,'ram'))throw Error('native destruction rejected');
        const changed=rec.clutter.spans.some((s,i)=>s.position.array.some((v,j)=>v!==positions[i][j]))||rec.clutter.instances.some((s,i)=>s.mesh.instanceMatrix.array.some((v,j)=>v!==instances[i][j]));
        if(!changed)throw Error('collision broke but geometry did not');
        if(!rec.clutter.obstacles.every(o=>o.crushed)||!rec.clutter.colliders.every(o=>o.dead))throw Error('compound collision remained');
        let afterNodes=0;w.group.traverse(()=>afterNodes++);
        if(nodes!==afterNodes)throw Error('crush added new scene objects');
        return {kind:rec.kind,propIdx:rec.ob.propIdx,beams:rec.clutter.obstacles.length,vertices:rec.clutter.spans.reduce((n,s)=>n+s.homePosition.length/3,0),instances:rec.clutter.instances.length,nodes};
      });
      await new Promise(r=>setTimeout(r,200));
      await page.screenshot({path:resolve(out,`${kind}-crushed.png`)});
      await page.evaluate(()=>{
        const {rec,positions,normals,instances}=window.clutterTest,w=window.__DEBUG.world;
        w.resetDestructibles();
        const same=(a,b)=>a.every((v,j)=>Object.is(v,b[j]));
        if(rec.state!==0||rec.clutter.obstacles.some(o=>o.crushed)||rec.clutter.colliders.some(o=>o.dead||o.crushed))throw Error('reset left collision destroyed');
        rec.clutter.spans.forEach((s,i)=>{if(!same(s.position.array,positions[i])||!same(s.normal.array,normals[i]))throw Error('reset geometry mismatch');});
        rec.clutter.instances.forEach((s,i)=>{if(!same(s.mesh.instanceMatrix.array,instances[i]))throw Error('reset instance mismatch');});
      });
      reports.push(report);
    }
    assert.deepEqual(errors,[],'no browser runtime errors');
    writeFileSync(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
    console.log('Native clutter destruction/reset passed',JSON.stringify(reports));
  });
}finally{clearInterval(refresh);lock.release();}
