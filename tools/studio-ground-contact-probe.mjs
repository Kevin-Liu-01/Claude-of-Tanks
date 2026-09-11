// Native contact diagnostic for the exact winter duel with a suspected hover.
// Samples rendered road-wheel/track vertices against the active heightfield;
// neither source geometry nor physical support is inferred from a shadow.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withIsolatedCaptureBrowser} from './isolated-capture-browser.mjs';
import {nativeBrowserLaunchOptions,verifyNativeBrowserLaunch} from './native-browser-launch.mjs';
import {DUEL_SCENARIOS} from './studio-example-scenarios.mjs';
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'.qa-dev/studio-ground-contact');
mkdirSync(out,{recursive:false});const report={rows:[],errors:[]};
const job=DUEL_SCENARIOS[2],lock=createCaptureLock();let refresh;
try {
  await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();
  await withIsolatedCaptureBrowser({root:process.cwd(),logLevel:'error',
    server:{port:0,host:'127.0.0.1',hmr:false,watch:null}},nativeBrowserLaunchOptions({headless:'new',
      args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']}),async({server,browser})=>{
    report.nativeLaunch=verifyNativeBrowserLaunch(browser);
    const page=await browser.newPage();await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    page.on('pageerror',error=>report.errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?studio=1&map=${job.map}&debug=1`,{waitUntil:'networkidle0',timeout:180000});
    await page.waitForFunction(()=>window.__STUDIO?.active && window.__GAME_READY && window.__DEBUG?.scene,{timeout:180000});
    await page.evaluate(async job=>{
      const S=window.__STUDIO,facing=Math.atan2(job.stage.bravo[0]-job.stage.alpha[0],job.stage.bravo[1]-job.stage.alpha[1])*180/Math.PI;
      await S.load({map:job.map,seed:job.seed,actors:[
        {id:job.alpha,name:'alpha',pos:job.stage.alpha,facingDeg:facing,camo:job.camo},
        {id:job.bravo,name:'bravo',pos:job.stage.bravo,facingDeg:facing+180,camo:job.camo}],fxTime:0,timeScale:0});
      S.directDuel({variant:job.variant});
    },job);
    for(const timeMs of [0,4000,9000,9500,9700,13500,3000,13500]) {
      const row=await page.evaluate(async timeMs=>{
        const S=window.__STUDIO,D=window.__DEBUG;S.seek(timeMs);
        S.capture({width:1920,height:1080});
        const {Raycaster,Vector3}=await import('/node_modules/three/build/three.module.js');
        const terrain=D.world.group.getObjectByName('terrain');
        if(!terrain)throw Error('missing rendered terrain');terrain.updateMatrixWorld(true);
        const ray=new Raycaster(),down=new Vector3(0,-1,0),hits=[];
        const actors=[];
        for(const actor of S.listActors()){
          const root=D.scene.getObjectByName(`tank_${actor.id}`);
          if(!root)throw Error(`missing ${actor.id} root`);root.updateMatrixWorld(true);
          const p=root.position.clone(),matrix=root.matrix.clone(),world=root.matrix.clone();let hash=2166136261;
          const parts=[];
          root.traverseVisible(mesh=>{
            if(!mesh.isMesh||!/^gear(?:RoadWheel|TrackPads|TrackBand)/.test(mesh.name))return;
            let min=Infinity,fastMin=Infinity,count=0;const contactPoints=[];const a=mesh.geometry.getAttribute('position');
            const matrices=mesh.isInstancedMesh?mesh.count:1;
            for(let i=0;i<matrices;i++){
              if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);world.multiplyMatrices(mesh.matrixWorld,matrix);}
              else world.copy(mesh.matrixWorld);
              for(const v of world.elements){hash=Math.imul(hash^Math.round(v*1e6),16777619)>>>0;}
              let lowest=null;
              for(let vertex=0;vertex<a.count;vertex++){
                p.fromBufferAttribute(a,vertex).applyMatrix4(world);
                min=Math.min(min,p.y-D.world.heightField.getHeightAt(p.x,p.z));
                fastMin=Math.min(fastMin,p.y-(D.world.heightField.getHeightAtFast?.(p.x,p.z)??D.world.heightField.getHeightAt(p.x,p.z)));
                if(!lowest||p.y<lowest[1])lowest=p.toArray();
                count++;
              }
              if(lowest&&/TrackPads/.test(mesh.name))contactPoints.push(lowest);
            }
            const loaded=contactPoints.filter(point=>point[1]-D.world.heightField.getHeightAt(point[0],point[2])<.15).map(point=>{
              ray.set(new Vector3(point[0],point[1]+10,point[2]),down);hits.length=0;
              ray.intersectObject(terrain,true,hits);
              const hit=hits.find(hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;});
              return {point,analyticGap:point[1]-D.world.heightField.getHeightAt(point[0],point[2]),
                renderedGap:hit?point[1]-hit.point.y:null};
            });
            parts.push({name:mesh.name,minGapM:min,minFastGapM:fastMin,samples:count,loaded});
          });
          actors.push({id:actor.id,state:actor.state,position:root.position.toArray(),rotation:root.rotation.toArray(),
            groundAtRoot:D.world.heightField.getHeightAt(root.position.x,root.position.z),matrixHash:hash,parts});
        }
        return {timeMs,actors};
      },timeMs);
      report.rows.push(row);console.log(JSON.stringify(row));
      if(timeMs===13500){const shot=await page.evaluate(()=>window.__STUDIO.capture({width:1920,height:1080}));
        writeFileSync(resolve(out,`winter-${report.rows.length}.png`),Buffer.from(shot.dataURL.split(',')[1],'base64'));}
    }
  });
}catch(error){report.errors.push(String(error));process.exitCode=1;}
finally{if(refresh)clearInterval(refresh);lock.release();writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));}
if(report.errors.length)throw Error(report.errors.join('\n'));
