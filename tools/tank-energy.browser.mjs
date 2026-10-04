// Real vehicle materials, native GPU timing when available, and visual receipts.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/tank-energy');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;
try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);console.log('tank-energy: acquired native browser slot');
 await withMapProbeSession({root:process.cwd()},async({browser,baseUrl})=>{
  const page=await browser.newPage(),errors=[];await page.setViewport({width:1280,height:800});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${baseUrl}/tools/fixtures/tank-energy.html`);
  await page.exposeFunction('energyCapture',name=>page.screenshot({path:resolve(out,`${name}.png`)}));
  const reports=await page.evaluate(async baseline=>{
   const T=await import('/node_modules/three/build/three.module.js');
   const factory=await import('/src/vehicles/fleetFactory.ts');await factory.ensureTankBuilder('m1a2');
   const current=await import('/src/game/juggernautVisual.ts');
   const versions=baseline?[['before',await import(baseline)],['after',current]]:[['after',current]];
   const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
   const scene=new T.Scene();scene.background=new T.Color(0x18242e);scene.add(new T.HemisphereLight(0xdceeff,0x605341,3));
   const light=new T.DirectionalLight(0xffe5be,3);light.position.set(20,30,10);scene.add(light);
   const camera=new T.PerspectiveCamera(38,1280/800,.1,400);
   const visual=factory.createTank('m1a2',{}, {quality:'ai',decor:false});
   const roots=Array.from({length:14},()=>visual.root.clone(true));
   const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
   const nextFrame=()=>new Promise(r=>requestAnimationFrame(r));const results=[];
   async function timedRender(){
    if(!timer){const start=performance.now();renderer.render(scene,camera);gl.finish();return performance.now()-start;}
    const q=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,q);renderer.render(scene,camera);gl.endQuery(timer.TIME_ELAPSED_EXT);
    for(let wait=0;wait<120;wait++){
     await nextFrame();
     if(gl.getParameter(timer.GPU_DISJOINT_EXT)){gl.deleteQuery(q);return null;}
     if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);return ms;}
    }
    gl.deleteQuery(q);return null;
   }
   for(const count of [1,14]){
    for(let i=0;i<count;i++){roots[i].position.set(count===1?0:(i%7-3)*9,0,count===1?0:Math.floor(i/7)*12-6);scene.add(roots[i]);}
    camera.position.set(count===1?11:40,count===1?8:45,count===1?15:60);camera.lookAt(0,1,0);
    for(const [version,energy] of versions)for(const styleName of ['juggernaut','infected'])for(const hit of [false,true]){
     const style=energy.TANK_ENERGY[styleName];
     for(let i=0;i<count;i++)energy.syncTankEnergyVisual(roots[i],{},1.01,100,100,0,false,style);
     await renderer.compileAsync(scene,camera);
     for(let warm=0;warm<6;warm++)renderer.render(scene,camera);
     const samples=[];
     for(let frame=0;frame<24;frame++){
      for(let i=0;i<count;i++){
       if(hit)for(let k=0;k<6;k++)energy.pulseJuggernautImpact(roots[i],[roots[i].position.x+(k%3-1),1,roots[i].position.z+k%2]);
       energy.syncTankEnergyVisual(roots[i],{},1.01,100,100,.18,false,style);
      }
      const ms=await timedRender();if(ms!==null)samples.push(ms);
     }
     samples.sort((a,b)=>a-b);
     results.push({version,count,style:styleName,hit,timing:timer?'GPU query ms':'render + flush ms',samples:samples.length,medianMs:samples[Math.floor(samples.length/2)],drawCalls:renderer.info.render.calls});
     await window.energyCapture(`${version}-${count}-${styleName}-${hit?'hits':'idle'}`);
     for(let i=0;i<count;i++)energy.clearJuggernautVisual(roots[i]);
    }
    for(const root of roots)root.removeFromParent();
   }
   renderer.dispose();visual.dispose?.();return results;
  },process.env.COT_ENERGY_BASELINE||null);
  writeFileSync(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
  assert.deepEqual(errors,[]);assert.ok(reports.every(r=>r.samples>=12),'timings need enough non-disjoint samples');
  await page.evaluate(async()=>{
   const {uiIconSVG}=await import('/src/ui/uiIcons.ts');
   document.body.innerHTML=['modeTurbo','modeMars'].map(id=>`<div style="display:inline-flex;margin:40px;padding:24px;color:#ffc46b;align-items:center;gap:28px">${[16,24,48,96].map(size=>uiIconSVG(id,size)).join('')}</div>`).join('');
  });
  await page.screenshot({path:resolve(out,'mode-icons.png')});
  console.log(JSON.stringify(reports));await page.close();
 });
}finally{clearInterval(heartbeat);await lock.release();}
