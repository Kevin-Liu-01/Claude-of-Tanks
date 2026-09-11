import * as T from 'three';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {shareBattleGeometry,battleGeometrySharingStats} from '../src/vehicles/battleGeometrySharing.ts';

export function runBattleGeometrySharingFixture(){
 const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.setPixelRatio(1);
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 document.body.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#899aa0');scene.add(new T.HemisphereLight(0xdce9ff,0x68513a,2.2));
 const light=new T.DirectionalLight(0xffeedb,3);light.position.set(-8,16,9);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-14;light.shadow.camera.right=14;light.shadow.camera.top=14;light.shadow.camera.bottom=-14;light.shadow.camera.far=50;scene.add(light);
 const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshStandardMaterial({color:0x7c8066,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.05;ground.receiveShadow=true;scene.add(ground);
 const camera=new T.PerspectiveCamera(36,640/480,.1,100);camera.position.set(15,8,20);camera.lookAt(0,1,0);
 const target=new T.WebGLRenderTarget(640,480,{depthBuffer:true});
 const options={quality:'high',proceduralOnly:true,camoSeed:4242,batchStatic:false};
 const one=createTank('type90',null,options),two=createTank('type90a',null,options);one.root.position.x=-3.5;two.root.position.x=3.5;scene.add(one.root,two.root);
 const geometrySet=()=>{const set=new Set();for(const v of [one,two])v.root.traverse(o=>{if(o.isMesh)set.add(o.geometry);});return set;};
 const render=()=>{scene.updateMatrixWorld(true);renderer.setRenderTarget(target);renderer.render(scene,camera);const bytes=new Uint8Array(640*480*4);renderer.readRenderTargetPixels(target,0,0,640,480,bytes);return bytes;};
 const same=(a,b)=>a.every((v,i)=>v===b[i]);
 let releaseOne,releaseTwo,oneDisposed=false,twoDisposed=false;
 const disposeOne=()=>{if(!oneDisposed){one.dispose();oneDisposed=true;}};
 const disposeTwo=()=>{if(!twoDisposed){two.dispose();twoDisposed=true;}};
 try{
  const poses=[[15,8,20],[-15,5,20],[15,5,-20],[-15,8,-20]],before=[];
  for(const pose of poses){camera.position.set(...pose);camera.lookAt(0,1,0);before.push(render());}
  one.root.visible=false;const alone=render();one.root.visible=true;
  const originals=geometrySet(),gpuBefore=renderer.info.memory.geometries,start=performance.now();
  releaseOne=shareBattleGeometry(one.root);releaseTwo=shareBattleGeometry(two.root);
  const sharingMs=performance.now()-start,shared=geometrySet();
  // Explicit GPU eviction of old color owners after their replacement. CPU
  // construction owners stay intact and are restored before normal disposal.
  for(const geometry of originals)if(!shared.has(geometry))geometry.dispose();
  const cases=[];
  for(let i=0;i<poses.length;i++){camera.position.set(...poses[i]);camera.lookAt(0,1,0);const after=render();cases.push({pose:poses[i],exactRgba:same(before[i],after),nonBackgroundPixels:after.reduce((n,v,j)=>n+(j%4===0&&v!==after[0]?1:0),0)});}
  const gpuAfter=renderer.info.memory.geometries,activeStats=battleGeometrySharingStats();
  releaseOne();disposeOne();const afterDisposal=render();
  const siblingAfterDisposal=same(alone,afterDisposal);
  two.root.position.x+=1;const rejectsMovedStock=!same(afterDisposal,render());two.root.position.x-=1;
  renderer.setRenderTarget(null);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');
  releaseTwo();disposeTwo();
  return {ok:cases.every(row=>row.exactRgba&&row.nonBackgroundPixels>1000)&&siblingAfterDisposal&&rejectsMovedStock,
   cases,siblingAfterDisposal,rejectsMovedStock,geometriesBefore:originals.size,geometriesAfter:shared.size,gpuBefore,gpuAfter,sharingMs,activeStats,afterDisposal:battleGeometrySharingStats(),png,
   scope:'native composed color/PCF pixels and real sibling disposal; observed resource counts, not clean timing qualification'};
 } finally {releaseOne?.();releaseTwo?.();disposeOne();disposeTwo();ground.geometry.dispose();ground.material.dispose();light.shadow.map?.dispose();target.dispose();renderer.dispose();renderer.domElement.remove();}
}
