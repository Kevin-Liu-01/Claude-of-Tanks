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
function originalGearAttributes(geometry){
  // Shared lamp materials add a disabled channel to some M1A2 gear. Keep
  // the four historical physical hashes; inherited gear must remain unlit.
  const mask=geometry.getAttribute('nightEmissionMask');
  if(mask){
    assert.ok(mask.array instanceof Uint8Array,'night mask is byte-sized');
    assert.equal(mask.itemSize,1);assert.equal(mask.normalized,false);
    assert.equal(mask.count,geometry.getAttribute('position').count,'one mask value per original vertex');
    assert.ok(mask.array.every(value=>value===0),'inherited gear masks must never emit light');
  }
  return Object.keys(geometry.attributes).filter(key=>key!=='nightEmissionMask');
}
function fingerprint(root,accept=()=>true){
  const h=createHash('sha256'),buffer=a=>h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  root.traverse(o=>{if(!o.name.startsWith('gear')||!o.geometry||!accept(o))return;
    h.update(o.name);for(const k of originalGearAttributes(o.geometry).sort()){h.update(k);buffer(o.geometry.attributes[k].array);}
    if(o.geometry.index)buffer(o.geometry.index.array);if(o.instanceMatrix)buffer(o.instanceMatrix.array);
  });return h.digest('hex');
}
{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));geometry.setIndex([0,1,2]);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),1);mesh.name='gearFixture';
  const measure=()=>fingerprint(mesh),original=measure();
  geometry.setAttribute('nightEmissionMask',new THREE.Uint8BufferAttribute([0,0,0],1));
  assert.equal(measure(),original,'validated unlit metadata preserves original gear bytes');
  for(const invalid of [new THREE.Float32BufferAttribute([0,0,0],1),new THREE.Uint8BufferAttribute([0,0,0],3),
    new THREE.Uint8BufferAttribute([0,0],1),new THREE.Uint8BufferAttribute([0,0,0],1,true),
    new THREE.Uint8BufferAttribute([0,1,0],1),new THREE.Uint8BufferAttribute([0,2,0],1),new THREE.Uint8BufferAttribute([0,3,0],1)]){
    geometry.setAttribute('nightEmissionMask',invalid);assert.throws(measure);
  }
  geometry.setAttribute('nightEmissionMask',new THREE.Uint8BufferAttribute([0,0,0],1));
  geometry.setAttribute('unrecognizedSemanticChannel',new THREE.Uint8BufferAttribute([0,0,0],1));
  assert.notEqual(measure(),original,'unknown attributes remain hashed');geometry.deleteAttribute('unrecognizedSemanticChannel');
  for(const attribute of [geometry.attributes.position,geometry.attributes.normal,geometry.attributes.uv,geometry.index,mesh.instanceMatrix]){
    const old=attribute.array[0];attribute.array[0]=old+1;
    assert.notEqual(measure(),original,'position/normal/UV/index/instance mutations remain guarded');attribute.array[0]=old;
  }
  mesh.name='gearChanged';assert.notEqual(measure(),original,'gear identity remains guarded');mesh.name='gearFixture';
  assert.equal(measure(),original);geometry.dispose();mesh.material.dispose();
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
  leo2a5:['08efd1106a79835d3b0ad6c4ffe8a502faea5212ee785c1f84b790d331d8846f','011e249a2d5f6d555a8b8fada08e53c7a92cc7aed15035782bb6110c7b057f6c'],
};
for(const[id,hashes]of Object.entries(ORIGINALS))for(const[index,quality]of['high','low'].entries()){
  const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false});
  try{assert.equal(fingerprint(tank.root),hashes[index],`${id}/${quality} original gear remains byte-identical`);}finally{tank.dispose();}
}
console.log('returnRollerOutset: high/low actual native axes, load/spin independence, zero/default and four original gear hashes PASS');
