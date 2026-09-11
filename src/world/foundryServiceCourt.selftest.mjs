import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { createHeightField, makeMaskTexture, mulberry32, selectTerrainLandformMask } from './terrain.ts';
import { historicalRoadHeightField } from './roadHistoryTestOracle.mjs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getDeviceTier, resolveDeviceTier } from '../engine/quality.ts';
import { historicalFoundryServiceInput } from './shorelineHistoryTestOracle.mjs';
import { createVegetation } from './vegetation.ts';
import { appendStructureCollisionBand } from './structureCollision.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

// Complete current producer, not a fabricated six-object scene. Raster bindings
// below are deliberately inert: this certifies geometry/placement/ownership,
// not native pixels, support between sampled points, frame cost or heap bytes.
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hash = value => createHash('sha256').update(value).digest('hex');
function geometryHash(g) {
  const digest = createHash('sha256');
  for (const [name, a] of Object.entries(g.attributes)) digest.update(name).update(bytes(a.array));
  if (g.index) digest.update(bytes(g.index.array));
  return digest.digest('hex');
}
function budget(parts) {
  return { parts: parts.length, vertices: parts.reduce((n,g) => n+g.attributes.position.count,0),
    indices: parts.reduce((n,g) => n+(g.index?.count??0),0),
    bytes: parts.reduce((n,g) => n+Object.values(g.attributes).reduce((s,a) => s+a.array.byteLength,0)+(g.index?.array.byteLength??0),0) };
}
const partsOf = donor => Object.values(donor.buckets).flat();
const poseMatrix = p => new THREE.Matrix4().makeRotationY(p.yaw).setPosition(p.x,p.y,p.z);
const cloneData = value => structuredClone(value);
const EXPECTED_SITES=[[2,'containerRow',163,-106,0],[3,'gantry',71.5,-96,0],[4,'stack',133,-110,0],
  [5,'shed',117,-123,-90],[7,'factory',117,-105,-90],[9,'warehouse',94,-70,180]];
const EXPECTED_PATCHES=[
  {boundary:[[83,-116],[92,-129],[115,-128],[127,-115],[122,-98],[109,-90],[90,-93],[82,-104]],feather:5,strength:1},
  {boundary:[[94,-126],[105,-126],[108,-143],[110,-160],[99,-162],[95,-146]],feather:4,strength:1},
  {boundary:[[116,-96],[136,-98],[158,-111],[175,-110],[176,-100],[155,-100],[136,-88],[118,-87]],feather:4,strength:1},
];
// The additive court mask at f84f predates the localization/town-strength
// change. Keep that original append-only test, not a new alpha golden.
// villageWear independently checks actual current masks and both new inputs.
function preLocalizationConfig(config) {
  const {villageWear:_laterCoverage,...terrain}=config.terrain;
  const {townWear:_laterStrength,...splat}=config.splat;
  return {...config,terrain,splat};
}
function checkConfig(config) {
  assert.deepEqual(config.props.foundryServiceCourt.sites.map(s=>[s.planIndex,s.kind,s.x,s.z,s.yawDeg]),EXPECTED_SITES);
  assert.deepEqual(config.terrain.workedGround,EXPECTED_PATCHES);
  const court=preLocalizationConfig(config);
  const {workedGround:_patches,...terrain}=court.terrain;
  const {foundryServiceCourt:_court,...props}=court.props;
  const prior={...court,terrain,props};
  assert.deepEqual(historicalFoundryServiceInput(config),prior,'history projection removes only independently guarded court/material fields');
  const altered={...config,terrain:{...config.terrain,hillScale:-123},props:{...config.props,sourcedPalette:'negative-control'}};
  assert.equal(historicalFoundryServiceInput(altered).terrain.hillScale,-123);
  assert.equal(historicalFoundryServiceInput(altered).props.sourcedPalette,'negative-control');
  return prior;
}
function maskTexture(config,field) {
  const splat=config.splat??{};
  return makeMaskTexture(new SimplexNoise({random:mulberry32(3010)}),field._layout,
    selectTerrainLandformMask(splat,field._mesaW),field._waterWetnessAt,splat.shoreDirt?(splat.seaRamp?.[0]??.4):null);
}
function patchBounds(patch,x,z) {
  const xs=patch.boundary.map(p=>p[0]),zs=patch.boundary.map(p=>p[1]),reach=patch.feather+3;
  return x>=Math.min(...xs)-reach&&x<=Math.max(...xs)+reach&&z>=Math.min(...zs)-reach&&z<=Math.max(...zs)+reach;
}
function checkMaskPixels(before,after,patches) {
  const a=before.image.data,b=after.image.data,size=after.image.width,hits=patches.map(()=>0);
  assert.equal(a.byteLength,b.byteLength);assert.equal(b.byteLength,size*size*4);
  let changed=0;
  for(let at=0;at<a.length;at+=4){
    assert.equal(b[at],a[at],'road channel exact');assert.equal(b[at+1],a[at+1],'rut channel exact');
    assert.equal(b[at+2],a[at+2],'water channel exact');
    assert.ok(b[at+3]>=a[at+3],'wear cannot erase existing alpha');
    if(b[at+3]===a[at+3])continue;
    assert.equal(a[at],0);assert.equal(a[at+2],0,'no wet/road pixel changed');
    const pixel=at/4,x=(pixel%size+.5)*1024/size-512,z=(Math.floor(pixel/size)+.5)*1024/size-512;
    let inside=false;
    patches.forEach((p,i)=>{if(patchBounds(p,x,z)){hits[i]++;inside=true;}});
    assert.ok(inside,'changed alpha stays inside authored patch reach');changed++;
  }
  assert.ok(changed>0,'court produces real wear');assert.ok(hits.every(n=>n>0),'all three patches have real effect');
  return {size,bytes:b.byteLength,changed,hits,before:hash(a),after:hash(b)};
}
function verifyMasks(config) {
  const prior=checkConfig(config),a=createHeightField(1337,prior),b=createHeightField(1337,config),rng=mulberry32(0x1731);
  for(let i=0;i<2048;i++){
    const x=(rng()-.5)*1024,z=(rng()-.5)*1024;
    assert.equal(b.getHeightAt(x,z),a.getHeightAt(x,z),'analytic height unchanged');
    assert.deepEqual(b.getNormalAt(x,z).toArray(),a.getNormalAt(x,z).toArray(),'terrain normals unchanged');
    assert.equal(b._roadDist(x,z),a._roadDist(x,z));assert.equal(b.getWaterMaskAt(x,z),a.getWaterMaskAt(x,z));
  }
  const oldWindow=globalThis.window,rows=[];
  try {for(const tier of ['desktop','mobile']){
    globalThis.window={location:{search:`?tier=${tier}`},localStorage:{getItem:()=>null}};
    if(tier==='mobile')assert.equal(resolveDeviceTier(),'mobile');
    assert.equal(getDeviceTier(),tier);
    const before=maskTexture(prior,a),after=maskTexture(config,b);
    try{
      assert.equal(after.image.width,tier==='desktop'?512:256,'actual tier-selected mask');
      for(const key of ['type','format','colorSpace','wrapS','wrapT','minFilter','magFilter','generateMipmaps'])assert.equal(after[key],before[key]);
      rows.push(checkMaskPixels(before,after,EXPECTED_PATCHES));
      assert.throws(()=>checkMaskPixels(before,before,EXPECTED_PATCHES),/real wear/,'dropped patch application fails');
      const shifted=EXPECTED_PATCHES.map(p=>({...p,boundary:p.boundary.map(([x,z])=>[x+300,z])}));
      assert.throws(()=>checkMaskPixels(before,after,shifted),/authored patch reach/,'unrelated region fails');
    }finally{before.dispose();after.dispose();}
  }}finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
  return rows;
}
function donorState(donors) {
  return donors.map(d => ({ geometry: partsOf(d).map(geometryHash), records: cloneData(d.records),
    feature: cloneData(d.feature), placement: cloneData(d.placement), source: cloneData(d.source) }));
}

function installCanvasFixture() {
  globalThis.ImageData = class { constructor(data,width,height) { Object.assign(this,{data,width,height}); } };
  globalThis.Image = class { width=8; height=8; set src(_value) { queueMicrotask(() => this.onload?.()); } };
  globalThis.document = { createElement() {
    const canvas={width:0,height:0};
    const context=new Proxy({canvas,
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
      getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(128),width:w,height:h}),
      createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
    },{get:(target,key)=>target[key]??(()=>{})});
    canvas.getContext=()=>context;return canvas;
  }};
  globalThis.fetch=async url=>new Response(readFileSync(url));
}

const source=readFileSync(new URL('./props.ts',import.meta.url),'utf8');
assert.match(source,/mapId === 'foundry' && P\.foundryServiceCourt \? \[\] : null/,'other maps never capture donors');
assert.match(source,/foundryDonors\.length = 0;\s+reconformFoundryFoundations = null;/,'release construction-only references');
function replaceOnce(text,anchor,replacement) {
  assert.equal(text.split(anchor).length,2,`one actual hook: ${anchor}`);
  return text.replace(anchor,replacement);
}
let state, enabled=false;
const propsUrl=new URL('./props.ts',import.meta.url).href;
const helperUrl=new URL('./foundryServiceCourt.ts',import.meta.url).href;
const hook=registerHooks({load(url,context,next){
  const result=next(url,context);
  if(url===helperUrl) return {...result,source:replaceOnce(String(result.source),
    'export function composeFoundryServiceCourt(', 'function actualCompose(')+`
    export function composeFoundryServiceCourt(...args: Parameters<typeof actualCompose>) {
      return globalThis.__courtCompose(args,actualCompose);
    }
    export { actualCompose };
  `};
  if(url!==propsUrl)return result;
  let text=replaceOnce(String(result.source),'export function mulberry32(a: number): Rng',
    'function producerMulberry32(a: number): Rng');
  const plannedBlock='    if (fit.spread > P.maxSpread) return false;\n    jitterBuildingUvs(tmp);\n    const obstacleStart = obstacles.length, colliderStart = colliders.length;';
  text=replaceOnce(text,plannedBlock,plannedBlock.replace('    const obstacleStart =',
    '    globalThis.__courtPlanned(bi,structureId,px,pz,rot,fit,info,tmp);\n    const obstacleStart ='));
  text=replaceOnce(text,'    const receipt = composeFoundryServiceCourt(',
    '    globalThis.__courtBuckets = buckets;\n    const receipt = composeFoundryServiceCourt(');
  text=replaceOnce(text,'        reconformFoundryFoundations = () => {',
    '        globalThis.__courtFoundations(contactGeometry,windows);\n        reconformFoundryFoundations = () => {');
  text=replaceOnce(text,'            replacement.dispose();',
    '            globalThis.__courtReplacement(replacement); replacement.dispose();');
  text=replaceOnce(text,'      const mesh = new THREE.Mesh(merged, mats[key]);',
    '      const mesh = new THREE.Mesh(merged, mats[key]); globalThis.__courtMerged(mesh);');
  return {...result,source:text+`
    export function mulberry32(seed: number): Rng {
      const next=producerMulberry32(seed), row={seed,count:0,next};
      globalThis.__courtRng.push(row);return ()=>{row.count++;return next();};
    }
  `};
}});
globalThis.__courtPlanned=(planIndex,kind,x,z,yaw,fit,info,tmp)=>{
  const parts=Object.values(tmp).flat();
  state.plans.push({planIndex,kind,source:{x,y:fit.y+.05,z,yaw},info:{...info},budget:budget(parts)});
  state.planGeometry.push(parts.map(geometryHash));
};
globalThis.__courtFoundations=(geometry,windows)=>{
  state.foundation={geometry,windows,original:geometry.clone(),disposals:0};
};
globalThis.__courtReplacement=geometry=>geometry.addEventListener('dispose',()=>state.foundation.disposals++);
globalThis.__courtMerged=mesh=>state.mergedMeshes.add(mesh);

function expectedFoundation(original,offset,pose,feature,field) {
  const values=new Float32Array(55*3),r=Math.max(feature.w,feature.d)*1.2;
  values.set([pose.x,field.getHeightAt(pose.x,pose.z)+.05,pose.z]);
  for(let ring=1;ring<=3;ring++)for(let k=0;k<18;k++){
    const angle=k/18*Math.PI*2,rad=r*[0,.4,.7,1][ring];
    const x=pose.x+Math.cos(angle)*rad,z=pose.z+Math.sin(angle)*rad;
    values.set([x,field.getHeightAt(x,z)+(ring===3?.04:.05),z],(1+(ring-1)*18+k)*3);
  }
  const indices=[];
  for(let i=0;i<original.index.count;i+=3){
    const a=original.index.getX(i);
    if(a>=offset&&a<offset+55)indices.push(a-offset,original.index.getX(i+1)-offset,original.index.getX(i+2)-offset);
  }
  assert.equal(indices.length,270,'existing55-vertex/90-triangle disc window');
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(values,3));g.setIndex(indices);g.computeVertexNormals();
  return g;
}
function verifyFoundations(field) {
  const {geometry,windows,original,disposals}=state.foundation;
  assert.equal(windows.length,6);assert.equal(disposals,enabled?6:0,'six construction temporaries disposed, none retained');
  const expected={position:original.attributes.position.array.slice(),normal:original.attributes.normal.array.slice()};
  windows.forEach(({feature,offset},i)=>{
    const planIndex=[2,3,4,5,7,9][i];assert.equal(offset,planIndex*55,'only original donor decal window');
    const pose=state.plans[planIndex].source;
    assert.equal(original.attributes.position.getX(offset),Math.fround(pose.x));
    assert.equal(original.attributes.position.getZ(offset),Math.fround(pose.z));
    if(!enabled)return;
    const target=state.receipt.donors[i].target,replacement=expectedFoundation(original,offset,target,feature,field);
    for(const name of ['position','normal'])expected[name].set(replacement.attributes[name].array,offset*3);
    replacement.dispose();
  });
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    assert.deepEqual(attribute.array,expected[name]??original.attributes[name].array,
      `${name}: only six exact reconformed position/normal windows`);
  }
  assert.deepEqual(geometry.index.array,original.index.array,'decal topology/index unchanged');
  if(enabled)assert.notDeepEqual(geometry.attributes.position.array,original.attributes.position.array,'stale donor decals are detected');
  state.foundationGeometry=geometry;
  original.dispose();delete state.foundation;
}

function requireAtomic(compose,args,status) {
  const before=donorState(args[3]),result=compose(...args);
  assert.equal(result.status,status);assert.deepEqual(donorState(args[3]),before,'rejection cannot partially alter any donor');
}
function negativeControls(args,compose) {
  const [map,config,field,donors,blockers,vegetation]=args;
  requireAtomic(compose,[map,config,field,donors.slice(1),blockers,vegetation],'unavailable');
  requireAtomic(compose,[map,config,field,donors,blockers,null],'unavailable');
  const duplicate={...config,sites:config.sites.map((s,i)=>i===5?config.sites[0]:s)};
  requireAtomic(compose,[map,duplicate,field,donors,blockers,vegetation],'blocked');
  const rail={...config,sites:config.sites.map(s=>s.kind==='gantry'?{...s,x:67}:s)};
  requireAtomic(compose,[map,rail,field,donors,blockers,vegetation],'blocked');
  for(const replacement of [{getHeightAt:()=>NaN},{getWaterMaskAt:()=>1}]) {
    requireAtomic(compose,[map,config,{...field,...replacement},donors,blockers,vegetation],'blocked');
  }
  const site=config.sites[5],occupied={min:[site.x-40,-100,site.z-40],max:[site.x+40,100,site.z+40],kind:'test blocker'};
  requireAtomic(compose,[map,config,field,donors,[...blockers,occupied],vegetation],'blocked');
  requireAtomic(compose,[map,config,field,donors,blockers,{...vegetation,treeObstacles:[...vegetation.treeObstacles,occupied]}],'blocked');
  requireAtomic(compose,[map,config,field,donors,blockers,{...vegetation,concealers:[...vegetation.concealers,{x:site.x,z:site.z,r:40}]}],'blocked');
  const spawnField={...field,_layout:{...field._layout,spawns:{...field._layout.spawns,player:{x:site.x,z:site.z}}}};
  requireAtomic(compose,[map,config,spawnField,donors,blockers,vegetation],'blocked');
  const roadField={...field,_layout:{...field._layout,roads:[...field._layout.roads,[[site.x-40,site.z],[site.x+40,site.z]]]}};
  requireAtomic(compose,[map,config,roadField,donors,blockers,vegetation],'blocked');
  // Falsify the atomicity observer itself: mutation before an invalid plan is
  // still rejected even though the real helper correctly reports failure.
  const old=donors[0].feature.x;
  try { assert.throws(()=>requireAtomic((...a)=>{a[3][0].feature.x++;return compose(...a);},
    [map,duplicate,field,donors,blockers,vegetation],'blocked'),/partially alter/); }
  finally { donors[0].feature.x=old; }
}

function matchingSupport(parts,used,row,epsilon) {
  const matches=parts.filter(g=>{
    if(used.has(g))return false;g.computeBoundingBox();const b=g.boundingBox;
    return b.min.toArray().every((v,i)=>Math.abs(v-row.min[i])<epsilon)
      && b.max.toArray().every((v,i)=>Math.abs(v-row.max[i])<epsilon);
  });
  assert.equal(matches.length,1,'support receipt names an actual complete transformed primitive');
  return matches[0];
}
function sampleSupport(field,row) {
  let min=Infinity,max=-Infinity;
  const nx=Math.max(1,Math.ceil(row.max[0]-row.min[0])),nz=Math.max(1,Math.ceil(row.max[2]-row.min[2]));
  for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
    const x=row.min[0]+(row.max[0]-row.min[0])*ix/nx,z=row.min[2]+(row.max[2]-row.min[2])*iz/nz;
    const h=field.getHeightAt(x,z);assert.ok(Number.isFinite(h));assert.equal(field.getWaterMaskAt(x,z),0);
    min=Math.min(min,h);max=Math.max(max,h);
  }
  return {min,max};
}
function verifySupport(donor,receipt,field) {
  const parts=partsOf(donor),thresholds=parts.filter(g=>g.userData.structureSupport?.part==='entry-threshold');
  const roles={containerRow:{container:6},gantry:{foot:2},stack:{plinth:1},shed:{platform:1},
    factory:{plinth:1,threshold:thresholds.length},warehouse:{plinth:1,dock:1,threshold:thresholds.length}};
  const counts={};for(const row of receipt.support.supports)counts[row.role]=(counts[row.role]??0)+1;
  assert.deepEqual(counts,roles[donor.kind],'actual foundation/foot/threshold census, not complete collision-band height');
  if(['factory','warehouse'].includes(donor.kind))assert.ok(thresholds.length>0);
  const used=new Set(),epsilon=2e-4; // two Float32 world transforms, not an art/contact tolerance
  for(const row of receipt.support.supports){
    used.add(matchingSupport(parts,used,row,epsilon));
    const {min,max}=sampleSupport(field,row);
    assert.ok(row.min[1]-min<=-.03+epsilon,'whole sampled foot bottom embedded, not floating');
    if(row.role==='container')assert.ok(max-row.min[1]<=.12+epsilon,'container is not buried using its2.6m wall height');
    else assert.ok(row.max[1]-max>=.03-epsilon,'actual support/entry top remains exposed');
  }
  for(const g of thresholds)assert.ok(used.has(g),'every actual entry threshold checked');
}
function verifyMoved(donor,original,receipt,field) {
  const transform=poseMatrix(receipt.target).multiply(poseMatrix(donor.source).invert());
  partsOf(donor).forEach((g,i)=>{
    const expected=original[i].clone().applyMatrix4(transform);
    try {assert.equal(geometryHash(g),geometryHash(expected),'exact rigid transform of original attributes');}
    finally {expected.dispose();}
  });
  const expected=[];
  for(const band of [donor.profile.contact,...donor.profile.shell]) {
    appendStructureCollisionBand(expected,band,receipt.target.x,receipt.target.y,receipt.target.z,receipt.target.yaw).kind='structure';
  }
  assert.deepEqual(donor.records,expected,'all collision bands follow the visible world pose');
  assert.deepEqual([donor.feature.x,donor.feature.z,donor.feature.rot],
    [receipt.target.x,receipt.target.z,receipt.target.yaw]);
  assert.deepEqual([donor.placement.x,donor.placement.z],[receipt.target.x,receipt.target.z]);
  verifySupport(donor,receipt,field);
}
globalThis.__courtCompose=(args,compose)=>{
  const donors=args[3];assert.equal(donors.length,6,'six actual accepted donor records');
  assert.deepEqual(donors.map(d=>[d.planIndex,d.kind]),[[2,'containerRow'],[3,'gantry'],[4,'stack'],[5,'shed'],[7,'factory'],[9,'warehouse']]);
  const all=Object.values(globalThis.__courtBuckets).flat(),targets=new Set(donors.flatMap(partsOf));
  const original=donors.map(d=>partsOf(d).map(g=>g.clone()));
  const hashes=new Map(all.map(g=>[g,geometryHash(g)])),beforeBudget=budget(all);
  const arrays=all.map(g=>[...Object.values(g.attributes).map(a=>a.array),g.index?.array]);
  const recordState=args[4].map(r=>JSON.stringify(r)),targetRecords=new Set(donors.flatMap(d=>d.records));
  try {
    if(enabled)negativeControls(args,compose);
    const callArgs=enabled?args:['not-foundry',...args.slice(1)];
    const started=performance.now(),result=compose(...callArgs);
    state.constructionMs=performance.now()-started; // one actual call, outside clone/control work; no timing gate
    if(enabled){assert.equal(result.status,'placed',result.reason);donors.forEach((d,i)=>verifyMoved(d,original[i],result.donors[i],args[2]));}
    else assert.equal(result,null);
    assert.deepEqual(budget(all),beforeBudget,'no geometry storage/topology increase');
    all.forEach((g,i)=>{
      const current=[...Object.values(g.attributes).map(a=>a.array),g.index?.array];
      current.forEach((a,j)=>assert.equal(a,arrays[i][j],'existing backing arrays reused'));
      if(!enabled||!targets.has(g))assert.equal(geometryHash(g),hashes.get(g),'non-donor geometry unchanged');
    });
    args[4].forEach((r,i)=>{if(!enabled||!targetRecords.has(r))assert.equal(JSON.stringify(r),recordState[i],'non-donor collision unchanged');});
    state.receipt=cloneData(result);state.totalBudget=beforeBudget;state.donorBudget=budget([...targets]);
    state.beforeComposition=all.map(g=>hashes.get(g));
    return result;
  } finally {original.flat().forEach(g=>g.dispose());}
};

function materialTextures(material) {
  const textures=[];
  for(const [key,t] of Object.entries(material)){
    if(t?.isTexture)textures.push([key,t.image?.width,t.image?.height,t.colorSpace,t.wrapS,t.wrapT,
      t.minFilter,t.magFilter,t.anisotropy,t.generateMipmaps]);
  }
  return textures;
}
function sceneInventory(group) {
  const rows=[];
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    rows.push({name:mesh.name,decal:mesh.userData.terrainDecalKind??'',count:mesh.count??null,
      budget:budget([mesh.geometry]),instances:mesh.instanceMatrix?hash(bytes(mesh.instanceMatrix.array)):null,
      protectedGeometry:state.mergedMeshes.has(mesh)||mesh.geometry===state.foundationGeometry?null:geometryHash(mesh.geometry),
      instanceColors:mesh.instanceColor?hash(bytes(mesh.instanceColor.array)):null,
      materials:materials.map(m=>({type:m.type,key:m.customProgramCacheKey(),color:m.color?.getHex(),
        roughness:m.roughness,metalness:m.metalness,side:m.side,transparent:m.transparent,opacity:m.opacity,
        alphaTest:m.alphaTest,depthWrite:m.depthWrite,vertexColors:m.vertexColors,
        textures:materialTextures(m)}))});
  });return rows;
}

let currentProps,currentVegetation;
try {
  installCanvasFixture();
  const [{createProps,preloadPropModels},{actualCompose},{ensureTankBuilder},{resolveWreckRoster}]=await Promise.all([
    import(propsUrl),import(helperUrl),import('../vehicles/fleetFactory.ts'),import('./wreckRoster.ts'),
  ]);
  const config=getMapConfig('foundry');
  checkConfig(config);
  assert.equal(config.terrain.hardstands,undefined,'no rejected terrain hardstand is resurrected');
  for(const mapId of MAP_IDS.filter(id=>id!=='foundry')){
    assert.equal(getMapConfig(mapId).props?.foundryServiceCourt,undefined);
    const unread=new Proxy({},{get(){throw new Error('opt-out input accessed');}});
    assert.equal(actualCompose(mapId,unread,unread,unread,unread,unread),null);
  }
  const unread=new Proxy({},{get(){throw new Error('disabled field accessed');}});
  assert.equal(actualCompose('foundry',undefined,unread,unread,unread,unread),null);
  // Independent immutable prop archive and fleet-builder preparation. Both
  // finish before either producer starts its captured deterministic RNG.
  await Promise.all([preloadPropModels(),
    ...resolveWreckRoster(config.props.tankWrecks.era,config.props.tankWrecks.ids).map(id=>ensureTankBuilder(id)),
  ]);
  let results;
  for(const historical of [true,false]) {
  results=[];
  for(const active of [false,true]){
    assert.equal(getDeviceTier(),'desktop','full producers precede the final mobile mask check');
    enabled=active;state={plans:[],planGeometry:[],mergedMeshes:new Set()};globalThis.__courtRng=[];
    const field=(historical ? historicalRoadHeightField : createHeightField)(1337,config);
    currentVegetation=createVegetation(field,{setupShadowMaterial(){}},2001,config);
    currentProps=createProps(field,{anisotropy:4,setupShadowMaterial(){}},2002,config,currentVegetation);
    await currentProps.sourcedTexturesReady;
    verifyFoundations(field);
    assert.equal(state.plans.length,42);
    // Immutable observed d46da09ea complete-producer receipt, terrain1337 /
    // vegetation2001 / props2002. Includes every original pose/dimension/budget,
    // NOT a whole-source lock. No runtime Git or external receipt dependency.
    if (historical) assert.equal(hash(JSON.stringify(state.plans)),'2803d222b811ca729d136bf7c3f58f2ceb0fd9328d7f3ba6ecb5049f89d03ec4',
      'all42 planned-building admissions, original poses/dimensions/storage preserved');
    state.rng=globalThis.__courtRng.map(r=>({seed:r.seed,count:r.count,tail:[r.next(),r.next()]}));
    state.inventory=sceneInventory(currentProps.group);
    delete state.foundationGeometry;delete state.mergedMeshes;
    state.disposal=disposeObject3DResources(currentProps.group);currentProps=null;
    currentVegetation.dispose();disposeObject3DResources(currentVegetation.group);currentVegetation=null;
    results.push(state);
  }
  for(const property of ['plans','planGeometry','beforeComposition','rng','totalBudget','donorBudget','inventory','disposal']) {
    assert.deepEqual(results[1][property],results[0][property],`${property}: exact enabled/opt-out full producer contract`);
  }
  }
  const masks=verifyMasks(preLocalizationConfig(config));
  console.log(JSON.stringify({test:'foundryServiceCourt',plans:42,donors:6,budget:results[1].donorBudget,masks,
    constructionMs:results[1].constructionMs,
    owners:results[1].disposal,placement:results[1].receipt,
    maskScope:'historical pre-localization additive court; actual current coverage owned by villageWear',
    scope:'headless geometry/placement, not native art or performance'}));
} finally {
  if(currentProps)disposeObject3DResources(currentProps.group);
  if(currentVegetation){currentVegetation.dispose();disposeObject3DResources(currentVegetation.group);}
  hook.deregister();
  state?.foundation?.original.dispose();
  for(const key of ['__courtPlanned','__courtCompose','__courtRng','__courtBuckets','__courtFoundations','__courtReplacement','__courtMerged'])delete globalThis[key];
}
