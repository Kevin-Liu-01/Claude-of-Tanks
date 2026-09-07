import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {KIT} from './tankFactoryCore.ts';
import {createTank} from './tankFactory.ts';

const BASE={wheelR:.4,wheelW:.3,wheelZs:[-1,0,1],wheelY:.5,xc:1.3,
  sprocket:{z:-2,y:.7,r:.3},idler:{z:2,y:.7,r:.3},trackW:.5,topY:1,
  rollers:[{z:-.8,y:.9,r:.085},{z:.8,y:.9,r:.085}]};
function fixture(options={},high=true){
  const material=new THREE.MeshStandardMaterial();
  const mats=Object.fromEntries(['hull','wheels','wheelsRecessed','rubber','detail','dark','shadow',
    'trackLink','spareTrack','burnt','trackL','trackR'].map(k=>[k,material]));
  mats.trackTexL=new THREE.Texture();mats.trackTexR=new THREE.Texture();
  const port={spec:{id:'t90sm'},disposables:[],mats,hullG:new THREE.Group(),geometryReceipt:true,q:high,batchStatic:false,add(){}};
  try{
    const gear=KIT.buildRunningGear(port,{...BASE,...options});gear.update(0,0);
    return{gear,root:port.hullG,receipt:port.hullG.userData.runningGearReceipts[0],dispose};
  }catch(e){dispose();throw e;}
  function dispose(){
    const resources=new Set([...port.disposables,material,mats.trackTexL,mats.trackTexR]);
    port.hullG.traverse(o=>{if(o.geometry)resources.add(o.geometry);});
    for(const r of resources)r.dispose();
  }
}
function fingerprint(root,accept=()=>true){
  const h=createHash('sha256'),buffer=a=>h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  root.traverse(o=>{if(!o.name.startsWith('gear')||!o.geometry||!accept(o))return;
    h.update(o.name);for(const k of Object.keys(o.geometry.attributes).sort()){h.update(k);buffer(o.geometry.attributes[k].array);}
    if(o.geometry.index)buffer(o.geometry.index.array);if(o.instanceMatrix)buffer(o.instanceMatrix.array);
  });return h.digest('hex');
}
function centers(mesh){
  const matrix=new THREE.Matrix4(),rows=[];
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);rows.push(new THREE.Vector3().setFromMatrixPosition(matrix));}
  return rows;
}
function near(a,b,label){assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} vs ${b}`);}
function axes(model,inset,outset){
  for(const name of['gearReturnRollerTires','gearReturnRollerDiscs']){
    const points=centers(model.root.getObjectByName(name));assert.equal(points.length,4);
    for(const q of points){near(Math.abs(q.x),BASE.xc-inset+outset,`${name} real axle`);
      near(q.y,.9,'roller height unchanged');assert.ok(Math.abs(Math.abs(q.z)-.8)<1e-6,'roller station unchanged');}
  }
}
const nonRoller=o=>!o.name.startsWith('gearReturnRoller');
for(const high of[true,false]){
  const base=fixture({},high),zero=fixture({returnRollerOutsetM:0},high);
  const shifted=fixture({returnRollerOutsetM:.085594},high),both=fixture({returnRollerInsetM:.02,returnRollerOutsetM:.085594},high);
  try{
    assert.equal(fingerprint(base.root),fingerprint(zero.root),'undefined and explicit zero are byte-identical');
    assert.equal(Object.hasOwn(base.receipt,'returnRollerOutsetM'),false,'no legacy receipt field');
    assert.equal(shifted.receipt.returnRollerOutsetM,.085594);
    assert.equal(fingerprint(base.root,nonRoller),fingerprint(shifted.root,nonRoller),'every non-roller buffer and pose unchanged');
    axes(shifted,0,.085594);axes(both,.02,.085594);
    const state={pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0};
    for(const v of[base,shifted]){
      v.gear.update(.37,-.23);v.gear.conform(state,(_x,z)=>Math.abs(z)<.6?-.05:.04,0,0,1/60);v.gear.update(.37,-.23,1/60);
    }
    axes(shifted,0,.085594);
    assert.equal(fingerprint(base.root,nonRoller),fingerprint(shifted.root,nonRoller),'load/spin do not propagate roller outset into other gear');
  }finally{base.dispose();zero.dispose();shifted.dispose();both.dispose();}
}
for(const value of[NaN,Infinity,-.001,.5001,'bad'])assert.throws(()=>fixture({returnRollerOutsetM:value}),/return-roller outset/);
const boundary=fixture({returnRollerOutsetM:.5});try{axes(boundary,0,.5);}finally{boundary.dispose();}

// Immutable buffers recorded before optional source wheel/axle APIs. These
// are original vehicles, not new builders or self-derived expected hashes.
const ORIGINALS={
  m1a2:['cbb19f45efdbab97356bd7fc5f87235b6948e0696427ed845cdebdee1e55be99','3868961745dac2ffef364704dd0f12eb5e78ceb379bece156a61dcc6be602016'],
  leo2a5:['b79db24450e465bd0d110ea05938d3b7c83dcdc23ed4a4f427f7af40e98e55b1','06ee2e4b13dd3efbe94eb3bc7d0a518eda520a6142c8170932ea909a09b01c79'],
};
for(const[id,hashes]of Object.entries(ORIGINALS))for(const[index,quality]of['high','low'].entries()){
  const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false});
  try{assert.equal(fingerprint(tank.root),hashes[index],`${id}/${quality} original gear remains byte-identical`);}finally{tank.dispose();}
}
console.log('returnRollerOutset: high/low actual native axes, load/spin independence, zero/default and four original gear hashes PASS');
