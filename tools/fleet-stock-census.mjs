import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCaptureLock} from './capture-lock.mjs';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {KIT} from '../src/vehicles/tankFactoryCore.ts';
const lease=createCaptureLock();await lease.acquire(45*60*1000);process.once('exit',()=>lease.release());
const refresh=setInterval(()=>lease.refresh(),30000);refresh.unref();
const doc=readFileSync('docs/tank-generation/fleet-style-performance-priority.md','utf8');
const table=doc.slice(doc.indexOf('| First source-study wave'),doc.indexOf('Separate controls:'));
const ids=[...table.matchAll(/`([a-z0-9_]+)`/g)].map(m=>m[1]);
assert.equal(ids.length,59);assert.equal(new Set(ids).size,59);
ids.push('leo2_revolution_proto','abramsx','m1a2','leclerc');
const selected=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
if(selected)ids.splice(0,ids.length,...selected);
const registered=JSON.parse(readFileSync('public/icons/tank-assets.json')).tanks;
for(const id of ids)assert.ok(registered[id],`missing registered target ${id}`);
const paths=execFileSync('git',['ls-files','src/vehicles'],{encoding:'utf8'}).trim().split('\n');
for(const p of execFileSync('git',['ls-files','--others','--exclude-standard','src/vehicles'],{encoding:'utf8'}).trim().split('\n').filter(Boolean))paths.push(p);
const inputHash=()=>{const h=createHash('sha256');for(const p of paths.sort()){h.update(p);h.update(readFileSync(p));}return h.digest('hex');};
const before=inputHash();
console.log(JSON.stringify({kind:'manifest',base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputHash:before,ids,
  method:'geometry-receipt materials, native unbatched geometry, 10m LOD, instance-expanded scene triangles; NOT GPU or browser-switch timing'}));
for(const id of ids)for(const quality of ['high','low']) {
  const original=KIT.buildRunningGear;let cfg;
  KIT.buildRunningGear=(p,c)=>{cfg=c;return original(p,c);};
  let tank;const start=performance.now();
  try{tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,deferStaticBatch:true,camoSeed:4242});}
  finally{KIT.buildRunningGear=original;}
  const constructionMs=performance.now()-start;
  try{
    const camera=new T.PerspectiveCamera();camera.position.set(0,3,-10);camera.updateMatrixWorld();
    tank.root.updateMatrixWorld(true);tank.root.traverse(o=>{if(o.isLOD)o.update(camera);});
    const rows=[];tank.root.traverseVisible(o=>{
      if(!o.isMesh)return;assert.ok(!o.isBatchedMesh,`${id}: unsupported batching in native census`);
      const count=Math.min(o.geometry.index?.count??o.geometry.attributes.position.count,o.geometry.drawRange.count);
      rows.push({name:o.name,instances:o.isInstancedMesh?o.count:1,triangles:count/3*(o.isInstancedMesh?o.count:1),
        role:o.userData.appearanceRole??null});
    });
    const shoes=[];
    tank.root.traverse(o=>{
      if(!o.isInstancedMesh||!/^gearTrackPads/.test(o.name))return;
      o.geometry.computeBoundingBox();const box=o.geometry.boundingBox;
      const material=new T.MeshBasicMaterial({side:T.DoubleSide}),sample=new T.Mesh(o.geometry,material);
      sample.updateMatrixWorld(true);const sections=[];
      for(const x of [-.3,.3].map(f=>f*(cfg?.trackW??.65))) {
        const top=new T.Raycaster(new T.Vector3(x,2,0),new T.Vector3(0,-1,0),0,4).intersectObject(sample,false)[0];
        const bottom=new T.Raycaster(new T.Vector3(x,-2,0),new T.Vector3(0,1,0),0,4).intersectObject(sample,false)[0];
        sections.push({x,topY:top?.point.y??null,bottomY:bottom?.point.y??null,
          spanM:top&&bottom?top.point.y-bottom.point.y:null});
      }
      material.dispose();shoes.push({name:o.name,vertices:o.geometry.attributes.position.count,
        instances:o.count,localBounds:{min:box.min.toArray(),max:box.max.toArray()},
        centerOffsetM:o.userData.trackShoeCenterOffsetM,
        // An outer envelope and measured cross sections, not a claim that
        // every point inside the envelope is load-bearing solid stock.
        outerEnvelopeFromCarrierInnerM:(cfg?.trackTh??.09)/2+o.userData.trackShoeCenterOffsetM+box.max.y,
        crossSections:sections});
    });
    console.log(JSON.stringify({kind:'tank',shoes,id,quality,constructionMs,triangles:rows.reduce((s,r)=>s+r.triangles,0),
      gearTriangles:rows.filter(r=>r.name.startsWith('gear')).reduce((s,r)=>s+r.triangles,0),
      trackTh:cfg?.trackTh??.09,shoeRadialScale:cfg?.shoeRadialScale??1,
      rollerStations:cfg?.rollers??[],wheelR:cfg?.wheelR,trackW:cfg?.trackW,
      primitiveOverrides:{roadWheel:!!cfg?.roadWheelGeometry,roller:!!cfg?.returnRollerGeometry,shoe:!!cfg?.trackShoeBuilder},
      rollerStock:rows.filter(r=>/returnroller/i.test(r.name)),top:rows.sort((a,b)=>b.triangles-a.triangles).slice(0,8)}));
  }finally{tank.dispose();}
}
assert.equal(inputHash(),before,'runtime inputs stayed frozen');
console.log(JSON.stringify({kind:'complete',builds:ids.length*2,inputHash:before}));

clearInterval(refresh);lease.release();
