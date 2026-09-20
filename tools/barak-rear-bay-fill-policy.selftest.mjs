import assert from'node:assert/strict';
import * as T from'three';
import {BARAK_SOURCE_CONFIGURATION} from'./barak-source-openings.mjs';
import {barakBayIntersectsCell,verifyBarakBayIdentity,verifyBarakBayNativeStock,createBarakBayFillPolicy}from'./barak-rear-bay-fill-policy.mjs';
import {createTank} from'../src/vehicles/tankFactory.ts';
import {ensureInteriorFills} from'../src/vehicles/interiorFills.ts';

verifyBarakBayIdentity(BARAK_SOURCE_CONFIGURATION,BARAK_SOURCE_CONFIGURATION.source.sha256);
assert.throws(()=>verifyBarakBayIdentity(BARAK_SOURCE_CONFIGURATION,'0'.repeat(64)),/canonical source changed/);
for(const key of['axes','translation','scale']){
 const config=structuredClone(BARAK_SOURCE_CONFIGURATION);config.registration[key]=key==='scale'?1:[0,0,0];
 assert.throws(()=>verifyBarakBayIdentity(config,config.source.sha256),/configuration\/registration changed/);
}
for(const id of['merkava4_x','merkava4_trophy','namer_ifv','constructor','__proto__'])assert.equal(createBarakBayFillPolicy(id,null),null);
const cell=(x,y,z,size=.01)=>barakBayIntersectsCell([x,y,z],[x+size,y+size,z+size]);
for(const p of[[0,.9,-2.54],[0,.9,-2],[.5,.9,-1],[0,1.3,-1.3]])assert.ok(cell(...p),'source-backed finite bay air behind the closed leaf');
for(const p of[[0,.9,-2.58],[0,.45,-2],[0,1.52,-2],[.94,.9,-2],[0,.9,-.65],[0,.9,-2.7],[.268,.595,-2.57],[0,1.40,-.95]])assert.ok(!cell(...p),'door/finite stock/corner/outside stays eligible for ordinary fill');
assert.throws(()=>barakBayIntersectsCell([0,0,0],[0,1,1]),/finite positive/);
assert.throws(()=>barakBayIntersectsCell([NaN,0,0],[1,1,1]),/finite positive/);
await ensureInteriorFills(['merkava4_barak']);
const rows=[];
for(const quality of['high','low']){
 const tank=createTank('merkava4_barak',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
 try{
  tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0)}});
  const witnesses=verifyBarakBayNativeStock(tank.root);assert.equal(witnesses.length,18);
  const blocker=new T.Mesh(new T.BoxGeometry(.54,.76,.06),new T.MeshBasicMaterial());blocker.position.set(0,.99,-2.68);tank.root.add(blocker);
  assert.throws(()=>verifyBarakBayNativeStock(tank.root),/first-hit mismatch/,'a slab in front of the actual door cannot activate policy');
  tank.root.remove(blocker);blocker.geometry.dispose();blocker.material.dispose();
  tank.root.position.z=.025;assert.throws(()=>verifyBarakBayNativeStock(tank.root),/first-hit mismatch/,'moved registration rejected');tank.root.position.z=0;
  const hull=tank.root.getObjectByName('hull'),original=hull.geometry,p=original.attributes.position;
  const indices=[];for(let i=0;i<p.count;i+=3){
   const floor=[i,i+1,i+2].every(j=>Math.abs(p.getY(j)-.513444)<1e-5);
   if(!floor)indices.push(i,i+1,i+2);
  }
  assert.ok(indices.length<p.count,'negative actually deletes measured floor triangles');
  const broken=original.clone();broken.setIndex(indices);hull.geometry=broken;
  assert.throws(()=>verifyBarakBayNativeStock(tank.root),/floor/,'deleted structural floor cannot activate source air contract');
  hull.geometry=original;broken.dispose();
  rows.push({quality,witnesses});
 }finally{tank.dispose();}
}
console.log('barak-rear-bay-fill-policy PASS',JSON.stringify(rows));
