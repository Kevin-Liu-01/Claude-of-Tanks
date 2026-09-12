import { historicalRoadTerrainSource } from './roadHistoryTestOracle.mjs';
import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getMapConfig,MAP_IDS} from './maps/index.ts';
import {createLayout,sampleLandformHeight} from './terrain.ts';
import {preparePlayableRelief,samplePlayableRelief} from './playableRelief.ts';
import {historicalMapPassDressingInput} from './mapPassDressing.test-support.mjs';

const base='6c3aaaf31567b0f6703c0b83c4e67ef04db7390b',root=fileURLToPath(new URL('../../',import.meta.url));
const oldSource=p=>execFileSync('git',['show',`${base}:${p}`],{cwd:root,encoding:'utf8'});
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const terrainURL=new URL('./terrain.ts',import.meta.url).href,ports=new Map();
const anchor='  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);';
for(const side of ['current','baseline']){
  let source=side==='current'?historicalRoadTerrainSource:oldSource('src/world/terrain.ts');
  assert.equal(source.split(anchor).length,2,'Exact real height-field support checkpoint');
  source=source.replace(anchor,anchor+'\n  __supports = {road:gRoadElev,dist:gRoadDist,corridor:gCorridor,pads:padYs,lakes:lakeLevels,liquidSurfaces,liquidLakeBanks};');
  source+='\nlet __supports; export function constructObserved(seed,cfg){const field=createHeightField(seed,cfg);return {field,supports:__supports};}\n';
  ports.set(`${terrainURL}?relief-${side}`,stripTypeScriptTypes(source));
}
registerHooks({load(url,context,next){return ports.has(url)?{format:'module',source:ports.get(url),shortCircuit:true}:next(url,context);}});
const current=await import(`${terrainURL}?relief-current`),baseline=await import(`${terrainURL}?relief-baseline`);
const selected=new Map([['frontier','frontier'],['alpine','alpine']]);
const seeds=[1337,7719],receipts=[];
assert.equal(readFileSync(new URL('./maps/titanGorge.ts',import.meta.url),'utf8'),oldSource('src/world/maps/titanGorge.ts'),
  'Held Titan authoring is byte-exact baseline; its heights also pass the 28-map legacy loop below');
assert.equal(MAP_IDS.length-selected.size,28,'Exactly two playable-relief pilots');
const stripRelief=form=>{const {relief,_relief,...old}=form;return old;};
const supportHashes=s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v?hash(v):null]));

// This remains the historical Frontier/Alpine acceptance oracle. The shared
// authenticated road fixture removes later approaches only; terrainStreaming
// and roadContinuity independently exercise all live completed-road surfaces. Badlands'
// later canyon layout is tested against actual current config separately in
// badlandsRelief.selftest.mjs; it is not part of this older two-map pilot.
const badlandsBase='d948cb5733ebb41ba471458a6b410e2bbb3568cc';
const badlandsSource=execFileSync('git',['show',`${badlandsBase}:src/world/maps/badlands.ts`],{cwd:root,encoding:'utf8'});
assert.equal(createHash('sha256').update(badlandsSource).digest('hex'),
  'eae9a03e75913e7c1b6ba87fae136115e5a568675d4998923da47492cd7ddada','Exact full pre-Badlands-pilot module');
const badlandsURL=new URL('./maps/badlands.ts?relief-historical',import.meta.url).href;
ports.set(badlandsURL,stripTypeScriptTypes(badlandsSource));
const historicalBadlands=(await import(badlandsURL)).default;

// Literal predecessor map modules certify that no authoring fields besides the
// selected forms' opt-in descriptors changed; functions retain their own source.
for(const [id,file]of selected){
  const url=new URL(`./maps/${file}.ts`,import.meta.url).href+'?relief-original';
  ports.set(url,stripTypeScriptTypes(oldSource(`src/world/maps/${file}.ts`)));
  const old=(await import(url)).default,cfg=historicalMapPassDressingInput(originalExitConfig(getMapConfig(id)),assert);
  const normalized={...cfg,terrain:{...cfg.terrain,landforms:cfg.terrain.landforms.map(stripRelief)}};
  if(id==='alpine'){
    // 2026-09-11 restored the 1049e4e Alpine horizon bands (owner direction).
    // Horizon bands never feed relief; guard the live values, then project
    // only these two leaves back so every other authoring field stays exact.
    assert.equal(cfg.horizon.treeline,0.80,'alpine: restored 1049e4e treeline band');
    assert.equal(cfg.horizon.snowline,0.72,'alpine: restored 1049e4e snowline band');
    assert.equal(old.horizon.treeline,0.64);assert.equal(old.horizon.snowline,0.42);
    normalized.horizon={...cfg.horizon,treeline:0.64,snowline:0.42};
  }
  const stringify=value=>JSON.stringify(value,(_k,v)=>typeof v==='function'?v.toString():v);
  assert.equal(stringify(normalized),stringify(old),`${id}: all non-relief authoring retained`);
}

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

for(const id of MAP_IDS){
  const cfg=id==='badlands'?historicalBadlands:originalExitConfig(getMapConfig(id)),layout=current.createLayout(cfg);
  if(!selected.has(id))assert.ok(layout.terrain.landforms.every(f=>!f.relief&&!f._relief));
  else{
    assert.equal(layout.terrain.landforms.length,5);
    assert.equal(layout.terrain.landforms.filter(f=>f._relief).length,5);
    const oldLayout=baseline.createLayout(cfg);
    assert.deepEqual(layout.terrain.landforms.map(stripRelief),oldLayout.terrain.landforms.map(stripRelief),'Old axes/trigonometry never mutated');
  }
  for(const seed of seeds){
    const a=current.constructObserved(seed,cfg),b=baseline.constructObserved(seed,cfg);
    assert.deepEqual(supportHashes(a.supports),supportHashes(b.supports),`${id}/${seed}: exact road/junction/corridor/lake/pad/liquid targets`);
    const currentValues=[],oldValues=[];let changed=0,maxDelta=0,fastPoints=0;
    for(let z=-480;z<=480;z+=40)for(let x=-480;x<=480;x+=40){
      const h=a.field.getHeightAt(x,z),old=b.field.getHeightAt(x,z);
      assert.ok(Number.isFinite(h));currentValues.push(h);oldValues.push(old);
      maxDelta=Math.max(maxDelta,Math.abs(h-old));if(Math.abs(h-old)>.1)changed++;
      if(!selected.has(id)){
        assert.deepEqual(a.field.getNormalAt(x,z).toArray(),b.field.getNormalAt(x,z).toArray(),`${id}: unchanged normal`);
      }else if(Math.abs(h-old)>.1&&x%80===0&&z%80===0){
        assert.ok(Math.abs(a.field.getHeightAtFast(x,z)-Math.fround(h))<1e-7,'Existing exact-grid cache uses final relief');fastPoints++;
      }
      assert.equal(a.field._roadDist(x,z),b.field._roadDist(x,z));
      assert.equal(a.field.getWaterMaskAt(x,z),b.field.getWaterMaskAt(x,z),'Wet footprint unchanged');
    }
    if(!selected.has(id)){
      assert.equal(hash(new Float64Array(currentValues)),hash(new Float64Array(oldValues)),`${id}/${seed}: bitwise legacy heights`);
      assert.equal(a.field.minY,b.field.minY);assert.equal(a.field.maxY,b.field.maxY);
    }else{
      assert.ok(changed>20&&fastPoints>0,`${id}: authored relief reaches meaningful final ground`);
      const budget=cfg.terrain.landforms.reduce((sum,f)=>sum+Math.abs(f.height),0);
      assert.ok(maxDelta<=budget,'No hidden amplitude beyond existing per-form caps');
      for(const spawn of [layout.spawns.player,...layout.spawns.enemies])for(const dx of [-8,0,8])for(const dz of [-8,0,8]){
        assert.equal(a.field.getHeightAt(spawn.x+dx,spawn.z+dz),b.field.getHeightAt(spawn.x+dx,spawn.z+dz),'Protected deployment support exact');
      }
      for(const lake of layout.lakes)assert.ok(Math.abs(a.field.getHeightAt(lake.x,lake.z)-b.field.getHeightAt(lake.x,lake.z))<1e-10,'Frozen lake core retains its exact initialized target');
    }
    receipts.push({id,seed,changedSamples:changed,maxDelta,fastPoints,profileCount:layout.terrain.landforms.filter(f=>f._relief).length});
  }
}
console.log(JSON.stringify({passed:true,receipts,historicalBadlandsBase:badlandsBase,limits:'CPU shape/support/cache proof only. Badlands uses its authenticated pre-pilot config here; badlandsRelief.selftest exercises its actual current config. Actual objective access, native collision/props/vegetation, authoritative height/collision data and minimap regeneration remain required before publication.'},null,2));
