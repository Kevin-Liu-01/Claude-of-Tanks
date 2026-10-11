// Native rendered regression of the actual dock/flight airframe kit, under the shared GPU queue.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withMapProbeSession,openGamePage} from './map-probe-runtime.mjs';
const out=resolve('.qa-dev/drone-details');mkdirSync(out,{recursive:true});
const lock=createCaptureLock();let heartbeat;
try{
 await lock.acquire();heartbeat=setInterval(()=>lock.refresh(),30000);
 console.log('drone-details: acquired native capture slot');
 await withMapProbeSession({root:process.cwd(),launch:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},async({browser,port})=>{
  const {page,errors}=await openGamePage(browser,{port,viewport:{width:900,height:650,deviceScaleFactor:1}});
  await page.evaluate(async()=>{
   const THREE=await import('/node_modules/three/build/three.module.js');
   const {createDroneModelKit,poseDroneRotor}=await import('/src/fx/droneModel.ts');
   const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:999999;width:900px;height:650px';document.body.append(canvas);
   const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setSize(900,650);renderer.setPixelRatio(1);renderer.setClearColor(0x172128);renderer.outputColorSpace=THREE.SRGBColorSpace;
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,900/650,.01,30);camera.position.set(1.65,1.4,2.15);camera.lookAt(0,.05,0);
   scene.add(new THREE.HemisphereLight(0xe4edff,0x403322,3));const sun=new THREE.DirectionalLight(0xffefda,4);sun.position.set(2,4,1);scene.add(sun);
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:0x344248,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.22;scene.add(ground);
   let owner=null,kit=null;
   window.__droneReview={show(nation){if(owner)scene.remove(owner);kit?.dispose();kit=createDroneModelKit(nation);owner=new THREE.Group();for(const part of kit.parts)owner.add(new THREE.Mesh(part.geometry,part.material));for(let i=0;i<4;i++){const rotor=new THREE.Mesh(kit.rotor,kit.rotorMaterial);poseDroneRotor(rotor,i,.42);owner.add(rotor);}scene.add(owner);renderer.render(scene,camera);return{variant:kit.name,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},dispose(){kit?.dispose();renderer.dispose();canvas.remove();}};
  });
  for(const nation of ['USA','Russia','Germany','Japan','Italy','China','UK','Sweden','Israel','Poland','France','South Korea','Ukraine']){
   const result=await page.evaluate(nation=>window.__droneReview.show(nation),nation);
   assert.ok(result.calls<=9,'materials remain merged');assert.ok(result.triangles>1600,'detailed airframe submitted');
   await page.screenshot({path:resolve(out,nation.replaceAll(' ','-')+'.png')});console.log('drone-details:',nation,result.variant);
  }
  assert.deepEqual(errors,[]);await page.evaluate(()=>window.__droneReview.dispose());await page.close();
 });
}finally{clearInterval(heartbeat);lock.release();}
