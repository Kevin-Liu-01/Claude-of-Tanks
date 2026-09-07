// Real GPU regression for the source-only ruler. Supplementary to the
// Node regression; registered in npm test's post phase. No private inputs needed.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {createServer} from 'vite';
import {createCaptureLock} from './capture-lock.mjs';
const lock=createCaptureLock();
let server,browser;
await lock.acquire(45*60*1000);
const refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();
try {
  server=await createServer({root:process.cwd(),logLevel:'error',server:{port:0,hmr:false,watch:null},
    plugins:[{name:'dimension-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{
      if(req.url!=='/__dimension_fixture')return next();
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');
    });}}]});
  await server.listen();
  browser=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--enable-webgl','--no-sandbox']});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const address=server.httpServer.address();
  await page.goto(`http://localhost:${address.port}/__dimension_fixture`);
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {sourceDimensionCamera,sourceDimensionRows}=await import('/tools/source-dimension-frame.mjs');
    const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(256,256);
    const target=new T.WebGLRenderTarget(256,256,{depthBuffer:true});
    const source=new T.Group(),material=new T.MeshBasicMaterial({color:0xffffff});
    for(const [size,pos]of [[[4,2,8],[0,1,0]],[[2.5,1,3],[0,2.5,-.5]],
      [[.16,.16,6],[0,2.5,3]],[[.035,2.5,.035],[1,4,-1.5]]]) {
      const mesh=new T.Mesh(new T.BoxGeometry(...size),material);mesh.position.set(...pos);source.add(mesh);
    }
    const scene=new T.Scene();scene.background=new T.Color(0);scene.add(source);
    source.updateMatrixWorld(true);
    const sourceBox=new T.Box3().setFromObject(source),snapshot=JSON.stringify(sourceBox);
    const directions=[new T.Vector3(1,0,0),new T.Vector3(0,1,0)];
    const cameraRecord=c=>JSON.stringify([c.projectionMatrix.toArray(),c.matrixWorld.toArray()]);
    const pixels=c=>{
      renderer.setRenderTarget(target);renderer.render(scene,c);
      const data=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,data);return data;
    };
    const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const cases=[];
    for(const direction of directions) {
      const baseline=sourceDimensionCamera(sourceBox,direction),basePixels=pixels(baseline),baseCamera=cameraRecord(baseline);
      for(const [scale,translation]of [[.5,[11,-3,8]],[1,[0,0,0]],[1.04,[0,0,0]],[4,[-8,5,-4]]]) {
        const candidate=source.clone(true);candidate.scale.setScalar(scale);candidate.position.set(...translation);candidate.updateMatrixWorld(true);
        const candidateBox=new T.Box3().setFromObject(candidate);
        const camera=sourceDimensionCamera(sourceBox,direction),sourcePixels=pixels(camera);
        const unionCamera=sourceDimensionCamera(sourceBox.clone().union(candidateBox),direction);
        cases.push({scale,translation,cameraStable:cameraRecord(camera)===baseCamera,
          sourcePixelsStable:same(sourcePixels,basePixels),unionChanged:!same(pixels(unionCamera),basePixels)});
      }
    }
    // The full-envelope guard must reject excess even when the filtered
    // raster measurement is indistinguishable (e.g. clipped thin antenna).
    const measurements={heightM:3,hullLengthM:8,overallLengthM:10,widthM:4};
    const self=sourceDimensionRows(measurements,measurements,sourceBox,sourceBox);
    const enlarged=sourceBox.clone();enlarged.max.x+=.4;
    const clipped=sourceDimensionRows(measurements,measurements,sourceBox,enlarged);
    const missing=sourceBox.clone();missing.max.y-=.5;
    const missingThinTop=sourceDimensionRows(measurements,measurements,sourceBox,missing);
    const sourceUnchanged=JSON.stringify(sourceBox)===snapshot;
    target.dispose();renderer.dispose();
    source.traverse(o=>o.geometry?.dispose());material.dispose();
    return{cases,self,clipped,missingThinTop,sourceUnchanged};
  });
  assert.deepEqual(errors,[]);
  assert.equal(result.sourceUnchanged,true);
  assert.equal(result.cases.length,8);
  for(const row of result.cases) {
    assert.equal(row.cameraStable,true,JSON.stringify(row));
    assert.equal(row.sourcePixelsStable,true,JSON.stringify(row));
    if(row.scale!==1)assert.equal(row.unionChanged,true,'negative control must expose the old candidate-dependent sampling');
  }
  assert.ok(result.self.every(r=>r.pct===0),'source against itself has exactly zero dimension error');
  assert.ok(result.clipped.find(r=>r.name==='physicalWidthM').pct>9.99);
  assert.ok(result.missingThinTop.find(r=>r.name==='physicalHeightM').pct>3);
  console.log('source-dimension-frame GPU:8 actual raster/camera invariance cases, union-frame negative controls, source self-match and full-envelope guards PASS');
} finally {
  await browser?.close();await server?.close();clearInterval(refresh);lock.release();
}
