import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {KIT} from './tankFactoryCore.ts';

// Authenticated against published 5b3224204: twelve exact default native
// assemblies and 96 motion snapshots. The original core was independently
// loaded for recovery qualification; this immutable fingerprint is not a
// refreshed source-shape or current-vs-current golden.
const DEFAULT_FINGERPRINT='f8e4efed91c2ed9063b3ae21b9220782d4a4509d410610b46f7f16dac2860b56';
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const hash=value=>createHash('sha256').update(value).digest('hex');
function geom(g){const h=createHash('sha256');for(const name of Object.keys(g.attributes).sort()){
 const a=g.attributes[name];h.update(name+':'+a.itemSize+':'+a.normalized).update(bytes(a.array));
}if(g.index)h.update(bytes(g.index.array));h.update(JSON.stringify([g.groups,g.drawRange]));return h.digest('hex');}
const CFG={wheelR:.4,wheelW:.3,wheelZs:[-1,0,1],wheelY:.5,xc:1.3,
 sprocket:{z:-2,y:.7,r:.3},idler:{z:2,y:.7,r:.3},trackW:.5,topY:1,
 rollerR:.095,returnRollerWidthM:.16,returnRollerInsetM:.18,
 rollers:[{z:-.8,y:.86,r:.095},{z:.8,y:.86,r:.095}]};
function fixture(kit,id,high,batchStatic,options={}){
 const mat=new T.MeshStandardMaterial({color:0x526942});
 const mats=Object.fromEntries(['hull','detail','dark','shadow','trackLink','spareTrack','burnt','trackL','trackR','wheels','rubber'].map(k=>[k,mat]));
 Object.assign(mats,{trackTexL:new T.Texture(),trackTexR:new T.Texture()});
 const P={spec:{id},disposables:[],mats,hullG:new T.Group(),geometryReceipt:true,q:high,batchStatic,add(){}};
 P.hullG.name='rig_hull';let gear;
 function dispose(){P.hullG.traverse(o=>{if(o.isInstancedMesh||o.isBatchedMesh)o.dispose();});
  for(const r of new Set([...P.disposables,mat,mats.trackTexL,mats.trackTexR]))r.dispose();}
 try{gear=kit.buildRunningGear(P,{...CFG,...options});gear.update(0,0);return{P,gear,dispose};}
 catch(e){dispose();throw e;}
}
function snapshot(c){c.P.hullG.updateMatrixWorld(true);const rows=[];c.P.hullG.traverse(o=>{
 if(!o.geometry)return;const m=o.material;rows.push({name:o.name,parent:o.parent?.name,geometry:geom(o.geometry),
 matrix:o.matrix.toArray(),instances:o.instanceMatrix?hash(bytes(o.instanceMatrix.array)):null,
 batch:o.isBatchedMesh?Array.from({length:o.instanceCount},(_,i)=>{const x=new T.Matrix4();o.getMatrixAt(i,x);return[o.getGeometryIdAt(i),x.toArray()];}):null,
 count:o.count,visible:o.visible,role:o.userData.appearanceRole,material:Array.isArray(m)?m.map(v=>v.color?.getHex()):m.color?.getHex()});
 });return{rows,receipt:c.P.hullG.userData.runningGearReceipts};}
let defaults=0,poses=0,negativeControls=0;
const baselineRows=[];
for(const id of['m1a2','t90sm','tiger1'])for(const high of[true,false])for(const batch of[false,true]){
 const b=fixture(KIT,id,high,batch);
 try{for(let phase=0;phase<8;phase++){
  for(const c of[b]){c.gear.conform({pos:new T.Vector3(),yaw:.2,visualPitch:0,visualRoll:0},(_x,z)=>.02*Math.sin(z),0,0,1/60);
   c.gear.update(.073*phase,-.117*phase,1/60);}
  const old=snapshot(b);
  baselineRows.push([id,high,batch,phase,hash(JSON.stringify(old))]);poses++;
 }defaults++;}finally{b.dispose();}
}
for(const high of[true,false])for(const batch of[false,true]){
 const road={tire:KIT.cylX(.4,.2,12),disc:KIT.cylX(.2,.25,12),dark:null};
 const idler={body:KIT.cylX(.3,.21,12),dark:KIT.cylX(.12,.28,8)};
 const stock={body:new T.BoxGeometry(.08,.12,.14).translate(.11,0,0),dark:new T.BoxGeometry(.06,.07,.09).translate(.09,0,0)};
 const roller={tire:KIT.cylX(.095,.25,12),disc:KIT.cylX(.07,.345,8)};
 const supplied=[...Object.values(road),...Object.values(idler),...Object.values(stock),...Object.values(roller)].filter(Boolean);
 const disposeCount=new Map(supplied.map(g=>[g,0]));for(const g of supplied)g.addEventListener('dispose',()=>disposeCount.set(g,disposeCount.get(g)+1));
 const calls=[],shoes=[];
 const c=fixture(KIT,'m1a2',high,batch,{roadWheelGeometry:road,idlerGeometry:idler,sprocketStockGeometry:stock,
  returnRollerStockGeometry:roller,returnRollerHullHalfWidthM:.9,
  trackOutsoleDimensions:{padHeight:.08,grouserHeight:.08},
  trackShoeBuilder:p=>{calls.push(p);const g=new T.BoxGeometry(p.trackW,.08,p.pitch*.8);shoes.push(g);return g;}});
 try{assert.deepEqual(calls.map(p=>[p.far,p.high]),[[false,high],[true,high]]);
  assert.equal(c.P.hullG.getObjectByName('gearRoadWheelTires').geometry,road.tire);
  assert.equal(c.P.hullG.getObjectByName('gearRoadWheelDiscs').geometry,road.disc);
  assert.equal(c.P.disposables.filter(g=>g===road.tire).length,1);
  assert.ok(shoes.every(g=>c.P.disposables.includes(g)));
  const spindles=[];c.P.hullG.traverse(o=>{if(o.name==='gearReturnRollerSpindles')spindles.push(o);});
  assert.equal(spindles.length,2);assert.ok(spindles.every(o=>o.count===2&&o.material===c.P.mats.wheels));
  c.gear.update(.2,-.3,1/60);c.P.hullG.updateMatrixWorld(true);
  c.P.hullG.traverse(o=>{if(o.name==='gearEndWheelBody'&&o.isBatchedMesh){
    for(let i=0;i<o.instanceCount;i++){const m=new T.Matrix4();o.getMatrixAt(i,m);assert.ok(m.determinant()>0);}
    assert.notEqual(o.getGeometryIdAt(0),o.getGeometryIdAt(1),'Left source stock gets a winding-corrected physical mirror');
   }});
 }finally{c.dispose();}
 for(const g of supplied)assert.equal(disposeCount.get(g),1,'Transferred input stock disposed exactly once');
}
for(const options of[{roadWheelGeometry:{}},{idlerGeometry:{}},{sprocketStockGeometry:{}},
 {returnRollerStockGeometry:{}},{trackShoeBuilder:42},{trackOutsoleDimensions:{padHeight:.06,grouserHeight:.02}}]){
 assert.throws(()=>fixture(KIT,'m1a2',false,false,options));negativeControls++;
}
assert.equal(hash(JSON.stringify(baselineRows)),DEFAULT_FINGERPRINT,'Published default geometry, materials, ownership and motion remain exact');
console.log(JSON.stringify({pass:true,baseline:'5b3224204',defaultCases:defaults,defaultPoses:poses,
 defaultFingerprint:hash(JSON.stringify(baselineRows)),overrideCases:4,negativeControls}));

