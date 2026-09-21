import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ARIETE_OPENING_INPUTS,ARIETE_OPENING_RASTERS,arieteOpeningConfiguration,
  arieteOpeningSourceReceipt,arieteOpeningWitnesses} from './ariete-source-openings.mjs';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
import {sourceOpeningRayProbe} from './source-opening-rays.mjs';

// Real finite geometry supplies fixture measurements; these are regression
// fixtures, not the source/native qualification receipts.
function measurement(witness,owner,mutation='') {
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial();
  const addStock=witness.expect==='stock' && mutation!=='remove';
  if(addStock || mutation==='fill') {
    const point=addStock ? witness.origin.map((v,i)=>i===witness.axis?witness.value:v)
      : witness.origin.map((v,i)=>v+witness.direction[i]*witness.far*.5);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.0002,.0002,.0002),material);
    mesh.name='finite-fixture-stock';mesh.position.fromArray(point);root.add(mesh);
  }
  const probe=sourceOpeningRayProbe(root),hit=probe.cast(witness.origin,witness.direction,witness.far);
  const point=hit?.point.toArray()??null;
  const passed=witness.expect==='air'?!hit:Boolean(point&&Math.abs(point[witness.axis]-witness.value)<=witness.tolerance);
  const result={owner,passed,point,mesh:hit?.object.name??null};
  probe.dispose();root.traverse(o=>o.geometry?.dispose());material.dispose();return result;
}
function fixture(id,quality) {
  const raster=ARIETE_OPENING_RASTERS[id][quality];
  const samples=raster.cells.map(([gx,gy])=>({gx,gy,
    x:raster.bounds.x0+(gx+.5)*(raster.bounds.x1-raster.bounds.x0)/raster.gridW,
    z:raster.bounds.z1-(gy+.5)*(raster.bounds.z1-raster.bounds.z0)/raster.gridH}));
  return {id,quality,configuration:arieteOpeningConfiguration(id),
    sourceReceipt:arieteOpeningSourceReceipt(id,ARIETE_OPENING_INPUTS),
    scan:{...structuredClone(raster),holeCells:samples.length,cellM:.06,samples},
    samples:samples.map(s=>({...s,sourceAir:true,nativeAir:true})),
    guards:arieteOpeningWitnesses(id,quality).map(w=>({key:w.key,passed:true,
      measurements:['source','native'].map(owner=>measurement(w,owner))}))};
}
const fails=(input,mutate,label)=>{const bad=structuredClone(input);mutate(bad);
  assert.equal(sourceOpeningsVerdict(bad).passed,false,label);};
for(const id of Object.keys(ARIETE_OPENING_RASTERS)) for(const quality of ['high','low']) {
  const valid=fixture(id,quality),positive=sourceOpeningsVerdict(valid);
  assert.equal(positive.passed,true,`${id}/${quality}: complete finite stock and actual cells`);
  assert.equal(positive.rawHoleCells,valid.scan.holeCells);assert.equal(positive.unexpectedCells,0);
  for(const key of Object.keys(ARIETE_OPENING_INPUTS))fails(valid,b=>{b.sourceReceipt.inputs[key]='0'.repeat(64)},'changed source/recipe/certificate');
  for(const mutate of [
    b=>{b.configuration.source.sha256='0'.repeat(64);b.sourceReceipt.sha256='0'.repeat(64)},
    b=>{b.configuration.registration.ownerRequestedEnlargement=1},
    b=>{b.configuration.registration.originalSha256='0'.repeat(64)},
    b=>{b.configuration.source.path='other.glb';b.sourceReceipt.path='other.glb'},
    b=>{b.sourceReceipt.id='other'},
    b=>{b.configuration.registration.scale=1},
    b=>{b.configuration.registration.translation[2]+=.1},
    b=>{b.configuration.roofMachineGuns=0},
    b=>{b.sourceReceipt.scope='whole-vehicle'},
    b=>{b.sourceReceipt.verified=false},
    b=>{b.quality='unknown'},
    b=>{b.scan.bounds.z0+=.001},
    b=>{b.scan.gridH++},
    b=>{b.scan.holeCells=0;b.scan.samples=[];b.samples=[]},
    b=>{b.scan.samples[1]={...b.scan.samples[0]};b.samples[1]={...b.samples[0]}},
    b=>{
      const sample={...b.scan.samples[0],gx:0,
        x:b.scan.bounds.x0+.5*(b.scan.bounds.x1-b.scan.bounds.x0)/b.scan.gridW};
      b.scan.holeCells++;b.scan.samples.push(sample);
      b.samples.push({...sample,sourceAir:true,nativeAir:true});
    },
    b=>{b.samples[0].sourceAir=false},b=>{b.samples[0].nativeAir=false},
    b=>{b.samples[0].x+=.001},b=>{b.scan.samples[0].z=NaN},
    b=>{b.guards.pop()},b=>{b.guards[1].key=b.guards[0].key},
  ])fails(valid,mutate,'changed source/registration/raster/manifest cannot pass');
  const witnesses=arieteOpeningWitnesses(id,quality);
  for(const [i,w]of witnesses.entries())for(const owner of ['source','native']) {
    fails(valid,b=>{
      const m=measurement(w,owner,w.expect==='stock'?'remove':'fill');
      // Even forged passed flags cannot replace the measured point/air result.
      m.passed=true;b.guards[i].measurements[owner==='source'?0:1]=m;
    },`${id}/${quality}/${w.key}: missing stock or filled real air fails`);
    if(w.expect==='stock')fails(valid,b=>{b.guards[i].measurements[owner==='source'?0:1].point[w.axis]+=w.tolerance*2},'source depth tolerance unchanged');
  }
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:0}}).passed,false,'registered rear needs finite stock and air even with zero reported holes');
}
assert.equal(sourceOpeningsVerdict({id:'unregistered',scan:{holeCells:1}}).passed,false);
assert.equal(sourceOpeningsVerdict({id:'unregistered',scan:{holeCells:0}}).passed,true);
console.log('ariete-source-openings: paired quality rasters, exact authority, finite stock/air and mutations PASS');
