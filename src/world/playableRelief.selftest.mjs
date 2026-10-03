import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {MAP_IDS,getMapConfig} from './maps/index.ts';
import {sampleLandformHeight} from './terrain.ts';
import {preparePlayableRelief,samplePlayableRelief} from './playableRelief.ts';

// 2026-10-01 (frozen pins retired): the old receipt compared the CURRENT terrain program with the 6c3aaaf31 program
// (git show), replayed predecessor map modules and a pre-pilot Badlands module, and pinned "bitwise legacy heights" on
// every other battlefield. Those were change detectors of history. The relief law is now proven live, on today's
// terrain program: every map that opts into playable relief is built twice, with its relief descriptors and with them
// stripped, and the relief may only move bounded ground away from roads, water, lakes and deployment pads.
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const terrainURL=new URL('./terrain.ts',import.meta.url).href,observedURL=`${terrainURL}?relief-observed`;
const anchor='  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);';
let source=readFileSync(new URL('./terrain.ts',import.meta.url),'utf8');
assert.equal(source.split(anchor).length,2,'Exact real height-field support checkpoint');
source=source.replace(anchor,anchor+'\n  __supports = {road:gRoadElev,dist:gRoadDist,corridor:gCorridor,pads:padYs,lakes:lakeLevels,liquidSurfaces,liquidLakeBanks};');
source+='\nlet __supports; export function constructObserved(seed,cfg){const field=createHeightField(seed,cfg);return {field,supports:__supports};}\n';
const observedSource=stripTypeScriptTypes(source);
const hooks=registerHooks({load(url,context,next){return url===observedURL?{format:'module',source:observedSource,shortCircuit:true}:next(url,context);}});
let observed;
try{observed=await import(observedURL);}finally{hooks.deregister();}
const seeds=[1337,7719],receipts=[];
const stripRelief=form=>{const {relief,_relief,...old}=form;return old;};
const supportHashes=s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v?hash(v):null]));
const pilots=MAP_IDS.filter(id=>(getMapConfig(id).terrain.landforms??[]).some(form=>form.relief));
// 2026-10-03 (the Glacier Pass redesign, docs/MAP-LAYOUT-BRIEF.md): Glacier Pass, the last battlefield with playable
// relief, now shapes its ground with landform geology, so no battlefield authors relief. The law is still proven live
// on real terrain: the A/B below runs on a fixture battlefield, Glacier Pass carrying its former five glacial relief
// bars (as they stood before the redesign), whenever no battlefield opts in.
const RELIEF_FIXTURE_LANDFORMS=[
  {kind:'ridge',x:-286,z:22,length:390,width:86,height:10.8,yawDeg:7,corridorScale:0.78,
    relief:{kind:'glacial',startX:-408,startZ:-278,endX:-244,endZ:284,leftWidthM:86,rightWidthM:38,bendM:-24,branchSide:1,notchAtFraction:0.55}},
  {kind:'ridge',x:282,z:28,length:370,width:84,height:10.2,yawDeg:-8,corridorScale:0.78,
    relief:{kind:'glacial',startX:174,startZ:-340,endX:366,endZ:248,leftWidthM:44,rightWidthM:118,bendM:38,branchSide:-1,notchAtFraction:0.64}},
  {kind:'ridge',x:-64,z:292,length:230,width:70,height:7.0,yawDeg:80,
    relief:{kind:'glacial',startX:-224,startZ:306,endX:196,endZ:238,leftWidthM:62,rightWidthM:34,bendM:-22,branchSide:1,notchAtFraction:0.36}},
  {kind:'knoll',x:154,z:-254,rx:86,rz:64,height:6.4,yawDeg:22,
    relief:{kind:'glacial',startX:-84,startZ:-286,endX:232,endZ:-344,leftWidthM:30,rightWidthM:72,bendM:28,branchSide:-1,notchAtFraction:0.62}},
  {kind:'basin',x:-166,z:-218,rx:96,rz:70,height:-3.0,yawDeg:-16,
    relief:{kind:'glacial',startX:-178,startZ:-280,endX:-82,endZ:214,leftWidthM:64,rightWidthM:42,bendM:-22,branchSide:1,notchAtFraction:0.35}},
];
const fixtureBase=getMapConfig('alpine');
const pilotConfigs=pilots.length?pilots.map(id=>[id,getMapConfig(id)])
  :[['alpine-relief-fixture',{...fixtureBase,terrain:{...fixtureBase.terrain,landforms:RELIEF_FIXTURE_LANDFORMS}}]];
assert.ok(pilotConfigs.length>0,'the live A/B below exercises real data');


function point(form,along,acrossM){
  const lateral=acrossM+form.bendM*4*along*(1-along);
  return [form.startX+form.axisX*along*form.lengthM-form.axisZ*lateral,
    form.startZ+form.axisZ*along*form.lengthM+form.axisX*lateral];
}
const reference={kind:'spur',startX:-160,startZ:-130,endX:170,endZ:210,leftWidthM:100,rightWidthM:45,bendM:30,branchSide:1,notchAtFraction:0.5};
for(const replacement of [{kind:'ellipse'},{leftWidthM:0},{rightWidthM:-1},{bendM:Infinity},{startX:NaN},
  {endX:-160,endZ:-130},{branchSide:0},{notchAtFraction:0},{startZ:-513}]){
  assert.throws(()=>preparePlayableRelief({...reference,...replacement}),/Playable relief|Unknown playable/);
}
for(const kind of ['spur','glacial','terrace']){
  const form=preparePlayableRelief({...reference,kind});let asymmetry=0,maxSlope=0;
  for(let u=0;u<=40;u++)for(let v=-50;v<=50;v++){
    const [x,z]=point(form,u/40,v*2),weight=samplePlayableRelief(form,x,z);
    assert.ok(Number.isFinite(weight)&&weight>=0&&weight<=1,'Finite capped scalar amplitude');
    const negative=sampleLandformHeight({kind:'basin',x:0,z:0,height:-7,_relief:form},x,z);
    assert.equal(negative,-7*weight,'Negative basin amplitude uses the same shape');
    const mirrored=point(form,u/40,-v*2);asymmetry=Math.max(asymmetry,Math.abs(weight-samplePlayableRelief(form,...mirrored)));
    const sx=(samplePlayableRelief(form,x+.01,z)-samplePlayableRelief(form,x-.01,z))/.02;
    const sz=(samplePlayableRelief(form,x,z+.01)-samplePlayableRelief(form,x,z-.01))/.02;
    maxSlope=Math.max(maxSlope,Math.hypot(sx,sz));
  }
  assert.ok(asymmetry>.15,'Profile is not a symmetric dome/ridge');assert.ok(maxSlope<.2,'Bounded scalar slope');
  for(const u of [0,1])for(const v of [-30,0,30]){
    const p=point(form,u,v);assert.ok(Math.abs(samplePlayableRelief(form,...p))<1e-12);
    for(const d of [-.00001,.00001])assert.ok(Math.abs(samplePlayableRelief(form,...point(form,u+d,v)))<1e-7,'Zero-slope end support');
  }
  for(const v of [-form.leftWidthM,form.rightWidthM])for(const u of [.2,.5,.8]){
    const p=point(form,u,v);assert.ok(Math.abs(samplePlayableRelief(form,...p))<1e-12);
    for(const d of [-.0001,.0001])assert.ok(Math.abs(samplePlayableRelief(form,...point(form,u,v+d)))<1e-8,'Zero-slope lateral foot');
  }
  if(kind==='glacial')assert.ok(samplePlayableRelief(form,...point(form,.3,0))-samplePlayableRelief(form,...point(form,.5,0))>.3,'Actual broken saddle');
  if(kind==='spur'){
    const p=point(form,.75,form.rightWidthM*.85),unbranchedSide=preparePlayableRelief({...reference,branchSide:-1});
    assert.ok(samplePlayableRelief(form,...p)>.04,'Secondary interfluve reaches beyond the tapering primary spur');
    assert.equal(samplePlayableRelief(unbranchedSide,...p),0,'Branch-side negative control removes that secondary shoulder');
  }
  if(kind==='terrace'){
    assert.equal(samplePlayableRelief(form,...point(form,.5,-40)),samplePlayableRelief(form,...point(form,.5,-55)),'Broad lower tread');
    assert.ok(samplePlayableRelief(form,...point(form,.5,0))>.9,'Retained upper plateau');
  }
  receipts.push({profile:kind,asymmetry,maxScalarSlope:maxSlope});
}

for(const [id,cfg] of pilotConfigs){
  const flat={...cfg,terrain:{...cfg.terrain,landforms:cfg.terrain.landforms.map(stripRelief)}};
  const layout=observed.createLayout(cfg),flatLayout=observed.createLayout(flat);
  assert.ok(layout.terrain.landforms.every(f=>f._relief),`${id}: every landform of a relief map carries a prepared profile`);
  assert.ok(flatLayout.terrain.landforms.every(f=>!f._relief),`${id}: the stripped control has no relief`);
  assert.deepEqual(layout.terrain.landforms.map(stripRelief),flatLayout.terrain.landforms.map(stripRelief),'Old axes/trigonometry never mutated');
  for(const seed of seeds){
    // 2026-09-17 field trenches: the relief law is compared on untrenched fields (fieldTrenches:false); the carve has its own receipt.
    const a=observed.constructObserved(seed,{...cfg,fieldTrenches:false}),b=observed.constructObserved(seed,{...flat,fieldTrenches:false});
    assert.deepEqual(supportHashes(a.supports),supportHashes(b.supports),`${id}/${seed}: exact road/junction/corridor/lake/pad/liquid targets`);
    let changed=0,maxDelta=0,fastPoints=0;
    for(let z=-480;z<=480;z+=40)for(let x=-480;x<=480;x+=40){
      const h=a.field.getHeightAt(x,z),old=b.field.getHeightAt(x,z);
      assert.ok(Number.isFinite(h));
      maxDelta=Math.max(maxDelta,Math.abs(h-old));if(Math.abs(h-old)>.1)changed++;
      if(Math.abs(h-old)>.1&&x%80===0&&z%80===0){
        assert.ok(Math.abs(a.field.getHeightAtFast(x,z)-Math.fround(h))<1e-7,'Existing exact-grid cache uses final relief');fastPoints++;
      }
      assert.equal(a.field._roadDist(x,z),b.field._roadDist(x,z));
      assert.equal(a.field.getWaterMaskAt(x,z),b.field.getWaterMaskAt(x,z),'Wet footprint unchanged');
    }
    assert.ok(changed>20&&fastPoints>0,`${id}: authored relief reaches meaningful final ground`);
    const budget=cfg.terrain.landforms.reduce((sum,f)=>sum+Math.abs(f.height),0);
    assert.ok(maxDelta<=budget,'No hidden amplitude beyond existing per-form caps');
    for(const spawn of [layout.spawns.player,...layout.spawns.enemies])for(const dx of [-8,0,8])for(const dz of [-8,0,8]){
      assert.equal(a.field.getHeightAt(spawn.x+dx,spawn.z+dz),b.field.getHeightAt(spawn.x+dx,spawn.z+dz),'Protected deployment support exact');
    }
    for(const lake of layout.lakes)assert.ok(Math.abs(a.field.getHeightAt(lake.x,lake.z)-b.field.getHeightAt(lake.x,lake.z))<1e-10,'Frozen lake core retains its exact initialized target');
    receipts.push({id,seed,changedSamples:changed,maxDelta,fastPoints,profileCount:layout.terrain.landforms.filter(f=>f._relief).length});
  }
}
console.log(JSON.stringify({passed:true,receipts,limits:'CPU shape/support/cache proof only. Actual objective access, native collision/props/vegetation, authoritative height/collision data and minimap regeneration remain required before publication.'},null,2));
