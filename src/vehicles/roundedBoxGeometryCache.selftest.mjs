import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createRoundedBoxGeometryCache, cachedRoundedBoxGeometry } from './roundedBoxGeometryCache.ts';

const nativeIds=['m1a2','challenger2','leclerc','leo2_revolution'];
const factoryUrl=new URL('./factoryGeometry.ts',import.meta.url);

function same(a,b,{bounds=true}={}){
  assert.equal(a.constructor,b.constructor);assert.notEqual(a,b);
  assert.equal(a.type,b.type);assert.deepEqual(a.parameters,b.parameters);
  assert.deepEqual(a.groups,b.groups);assert.deepEqual(a.drawRange,b.drawRange);
  assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
  for(const key of Object.keys(a.attributes)){
    assert.notEqual(a.attributes[key].array,b.attributes[key].array);
    assert.deepEqual(a.attributes[key].array,b.attributes[key].array);
  }
  assert.deepEqual(a.index?.array,b.index?.array);
  if(bounds){a.computeBoundingBox();b.computeBoundingBox();assert.deepEqual(a.boundingBox,b.boundingBox);}
}

// Separate child processes prevent module/cache state from leaking between
// the actual native control and candidate. Only the two scoped factory lines
// are inverted for the control; no profile, decoration or material is filtered.
function originalFactory(source){
  const edits=[
    ["import { cachedRoundedBoxGeometry } from './roundedBoxGeometryCache.ts';",
      "import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';"],
    ['  return cachedRoundedBoxGeometry(', '  return new RoundedBoxGeometry('],
  ];
  for(const[from,to]of edits){assert.equal(source.split(from).length,2,'exact two-line factory control');source=source.replace(from,to);}
  return source;
}

function attributeDigest(attribute){
  if(!attribute)return null;
  const a=attribute.array??attribute.data.array;
  return {type:attribute.constructor.name,itemSize:attribute.itemSize,normalized:attribute.normalized,
    usage:attribute.usage,gpuType:attribute.gpuType,offset:attribute.offset,stride:attribute.data?.stride,
    array:a.constructor.name,sha:createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex')};
}

function nativeDigest(root){
  const rows=[],materialIds=new Map(),materials=[],uuids=new Map();
  function semantic(value){
    if(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)){
      if(!uuids.has(value))uuids.set(value,uuids.size);return `uuid:${uuids.get(value)}`;
    }
    if(Array.isArray(value))return value.map(semantic);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,semantic(value[key])]));
    return value;
  }
  root.updateMatrixWorld(true);
  const nodes=[];root.traverse(node=>nodes.push(node));
  const nodeIds=new Map(nodes.map((node,index)=>[node,index]));
  for(const node of nodes){
    const materialList=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
    const ids=materialList.map(material=>{
      if(!materialIds.has(material)){
        materialIds.set(material,materials.length);
        materials.push(semantic(material.toJSON()));
      }
      return materialIds.get(material);
    });
    const geometry=node.geometry;
    rows.push({name:node.name,type:node.type,parent:nodeIds.get(node.parent)??null,
      visible:node.visible,layers:node.layers.mask,renderOrder:node.renderOrder,
      frustumCulled:node.frustumCulled,castShadow:node.castShadow,receiveShadow:node.receiveShadow,
      matrix:node.matrix.elements,matrixWorld:node.matrixWorld.elements,materials:ids,
      levels:node.levels?.map(level=>[level.distance,level.hysteresis,nodeIds.get(level.object)]),
      count:node.count,instanceMatrix:attributeDigest(node.instanceMatrix),instanceColor:attributeDigest(node.instanceColor),
      geometry:geometry?{type:geometry.type,name:geometry.name,groups:geometry.groups,drawRange:geometry.drawRange,
        attributes:Object.fromEntries(Object.keys(geometry.attributes).sort().map(key=>[key,attributeDigest(geometry.attributes[key])])),
        morph:Object.fromEntries(Object.keys(geometry.morphAttributes).sort().map(key=>[key,geometry.morphAttributes[key].map(attributeDigest)])),
        morphTargetsRelative:geometry.morphTargetsRelative,index:attributeDigest(geometry.index)}:null});
  }
  return {nodes:rows.length,meshes:nodes.filter(node=>node.isMesh).length,materials:materials.length,
    sha:createHash('sha256').update(JSON.stringify({rows,materials})).digest('hex')};
}

async function nativeChild(reference){
  let hook,controlLoads=0;
  if(reference)hook=registerHooks({load(url,context,next){
    if(url!==factoryUrl.href)return next(url,context);
    controlLoads++;
    return {format:'module',source:stripTypeScriptTypes(originalFactory(fs.readFileSync(factoryUrl,'utf8'))),shortCircuit:true};
  }});
  const {createTank}=await import('./tankFactory.ts');
  const results=[];
  // Second pass revisits every model after other builds/disposal. No source
  // mesh path, selected-node subset or skipped decoration/instance buffer.
  for(let pass=0;pass<2;pass++)for(const id of nativeIds)for(const quality of ['high','low']){
    const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
    try{results.push({pass,id,quality,...nativeDigest(tank.root)});}finally{tank.dispose();}
  }
  if(reference)assert.equal(controlLoads,1,'actual factory path is replaced exactly once');
  hook?.deregister();console.log('ROUNDED_BOX_NATIVE '+JSON.stringify(results));
}

if(process.argv.includes('--native-child')){
  await nativeChild(process.argv.includes('--reference'));
}else{
  const cache=createRoundedBoxGeometryCache(),recipes=[];
  for(const width of [.06,.08,.12,.5,.500001,1.8]){
    const dims=[width,width*1.2,width*2],min=Math.min(...dims);
    recipes.push([...dims,min>.5?2:1,Math.min(.024,min*.24)]);
  }
  for(const recipe of recipes){
    const reference=new RoundedBoxGeometry(...recipe),a=cache.geometry(...recipe),b=cache.geometry(...recipe);
    same(a,reference);same(b,reference);assert.notEqual(a.attributes.position.array,b.attributes.position.array);
    a.translate(10,20,30);a.attributes.uv.setXY(0,99,99);a.parameters.width=999;
    a.userData.ownedReceipt={owner:'one tank only'};assert.deepEqual(b.userData,{});
    a.dispose();const c=cache.geometry(...recipe);same(c,reference);same(b,reference);
    assert.deepEqual(c.userData,{},'metadata must never alias the template');
    reference.dispose();b.dispose();c.dispose();
  }
  assert.equal(cache.stats().entries,recipes.length);assert.equal(cache.stats().hits,recipes.length*2);
  cache.clear();assert.equal(cache.stats().entries,0);assert.equal(cache.stats().bytes,0);
  const bounded=createRoundedBoxGeometryCache(2,40000);
  for(let i=0;i<20;i++){
    bounded.geometry(.10+i*.001,.2,.3,1,.024).dispose();
    const stats=bounded.stats();assert.ok(stats.entries<=2);assert.ok(stats.bytes<=40000);
  }
  const prior=bounded.stats().misses;bounded.geometry(.10,.2,.3,1,.024).dispose();
  assert.equal(bounded.stats().misses,prior+1,'oldest template evicted');bounded.clear();
  for(const width of [.1,.2,.1,.3])bounded.geometry(width,.2,.3,1,.024).dispose();
  const recent=bounded.stats().hits;bounded.geometry(.1,.2,.3,1,.024).dispose();
  assert.equal(bounded.stats().hits,recent+1,'recent hit promotes before eviction');bounded.clear();
  const tiny=createRoundedBoxGeometryCache(1,1),oversize=tiny.geometry(.1,.2,.3,1,.024);
  assert.equal(tiny.stats().entries,0,'oversize remains caller-owned');oversize.dispose();
  for(const limits of [[0,10],[1,0],[-1,10],[1,NaN]])assert.throws(()=>createRoundedBoxGeometryCache(...limits),/limits/);

  const stats=cache.stats();
  const exceptional=[[0,.2,.3,1,.024],[-0,.2,.3,1,.024],[-.1,.2,.3,1,.024],
    [NaN,.2,.3,1,.024],[.1,.2,.3,0,.024],[.1,.2,.3,1,NaN]];
  for(const recipe of exceptional){
    const a=cache.geometry(...recipe),b=new RoundedBoxGeometry(...recipe);
    same(a,b,{bounds:recipe.every(Number.isFinite)});a.dispose();b.dispose();
  }
  assert.deepEqual(cache.stats(),stats,'exceptional recipes do not enter or hit the cache');
  const {box}=await import('./factoryGeometry.ts');
  const dimensions=[[.0599,.7,1.2],[.06,.7,1.2],[.5,.7,1.2],[.500001,.7,1.2],
    [0,.7,1.2],[-0,.7,1.2],[-.1,.7,1.2],[NaN,.7,1.2]];
  for(const dims of dimensions){
    const min=Math.min(...dims),a=box(...dims),b=min<.06?new THREE.BoxGeometry(...dims):
      new RoundedBoxGeometry(...dims,min>.5?2:1,Math.min(.024,min*.24));
    same(a,b,{bounds:dims.every(Number.isFinite)});a.dispose();b.dispose();
  }
  const singletonRecipe=[.72,.8,1.2,2,.024];
  const first=cachedRoundedBoxGeometry(...singletonRecipe),second=box(...singletonRecipe.slice(0,3));
  first.attributes.position.setX(0,999);first.userData.owner='mutated';first.dispose();
  const third=box(...singletonRecipe.slice(0,3)),reference=new RoundedBoxGeometry(...singletonRecipe);
  same(second,reference);same(third,reference);assert.deepEqual(third.userData,{});
  second.dispose();third.dispose();reference.dispose();

  function run(reference){
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--native-child',...(reference?['--reference']:[])],
      {encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    assert.ifError(child.error);assert.equal(child.status,0,child.stderr||child.stdout);
    const line=child.stdout.split('\n').find(row=>row.startsWith('ROUNDED_BOX_NATIVE '));assert.ok(line,'completed native receipt');
    return JSON.parse(line.slice('ROUNDED_BOX_NATIVE '.length));
  }
  const nativeBefore=run(true),nativeAfter=run(false);
  assert.deepEqual(nativeAfter,nativeBefore,'all native geometry attributes, instances, hierarchy, LOD, transforms and serialized materials match original');
  assert.equal(nativeAfter.length,nativeIds.length*2*2);
  for(const row of nativeAfter.filter(row=>row.pass===1)){
    const first=nativeAfter.find(prior=>prior.pass===0&&prior.id===row.id&&prior.quality===row.quality);
    assert.deepEqual({...row,pass:0},first,'warm revisit/disposal does not corrupt another model');
  }
  const repeats=400,plainStart=performance.now();
  for(let i=0;i<repeats;i++)new RoundedBoxGeometry(...singletonRecipe).dispose();
  const plainMs=performance.now()-plainStart,cachedStart=performance.now();
  for(let i=0;i<repeats;i++)cache.geometry(...singletonRecipe).dispose();
  const cachedMs=performance.now()-cachedStart;cache.clear();
  console.log(JSON.stringify({test:'rounded box template cache',status:'PASS',byteExactRecipes:recipes.length,
    exceptionalRecipes:exceptional.length,factoryThresholdCases:dimensions.length,independentBuffersAndDisposal:true,
    nativeBuilds:nativeBefore.length+nativeAfter.length,nativeIds,nativeResults:nativeAfter,
    bounded:true,repeats,plainMs,cachedMs,timingScope:'Diagnostic CPU constructor microbenchmark only; no browser latency claim'}));
}
