import {BARAK_SOURCE_CONFIGURATION,BARAK_OPENING_CELLS} from './barak-source-openings.mjs';
import {latticeCellScan} from './contig-grid.mjs';
import assert from 'node:assert/strict';
import {sourceOpeningsVerdict,approvedOpeningRegion,AFT_SOURCE_SLOTS} from './source-openings-policy.mjs';
import {sourceOpeningWitnesses} from './source-opening-witnesses.mjs';
const id='aft10',source={path:'source.glb',sha256:'a'.repeat(64)},configuration={id,source},sourceReceipt={id,...source,verified:true};
const sample={x:-.46435,z:-3.55565,gx:1,gy:2,sourceAir:true,nativeAir:true};
const valid={id,configuration,sourceReceipt,scan:{holeCells:1,gridW:4,gridH:4,bounds:{x0:sample.x-.015,x1:sample.x+.025,z0:sample.z-.015,z1:sample.z+.025},samples:[{...sample}]},samples:[{...sample}],guards:sourceOpeningWitnesses(id).map(w=>{const point=w.expect==='air'?null:w.origin.map((v,i)=>i===w.axis?w.value:v);return {key:w.key,passed:true,measurements:['source','native'].map(owner=>({owner,passed:true,point,mesh:point?'fixture':null}))};})};
assert.equal(sourceOpeningsVerdict(valid).passed,true);
for(const key of ['sourceAir','nativeAir'])assert.equal(sourceOpeningsVerdict({...valid,samples:[{...sample,[key]:false}]}).passed,false,'occupied source or native air cannot pass');
for(const change of [{x:0},{z:0},{gx:13},{sourceAir:undefined}])assert.equal(sourceOpeningsVerdict({...valid,samples:[{...sample,...change}]}).passed,false);
for(const change of [{id:'warrior_tes_h'},{sha256:'b'.repeat(64)},{path:'other.glb'},{verified:false}])assert.equal(sourceOpeningsVerdict({...valid,sourceReceipt:{...sourceReceipt,...change}}).passed,false);
for(const change of [{samples:[]},{guards:[]},{guards:[{passed:false}]},{scan:{holeCells:0,samples:[]}},{scan:{holeCells:NaN}}])assert.equal(sourceOpeningsVerdict({...valid,...change}).passed,false);
assert.equal(sourceOpeningsVerdict({id:'unknown',scan:{holeCells:1}}).passed,false,'unregistered holes retain zero requirement');
assert.equal(sourceOpeningsVerdict({id:'unknown',scan:{holeCells:0}}).passed,true);
assert.equal(sourceOpeningsVerdict({...valid,scan:{holeCells:0,samples:[]},samples:[],guards:[{passed:false}]}).passed,false,'filling real air cannot pass even with zero raster holes');
assert.equal(sourceOpeningsVerdict({...valid,guards:valid.guards.slice(1)}).passed,false,'every required finite witness must be present');
assert.equal(sourceOpeningsVerdict({...valid,guards:valid.guards.map(g=>({...g,key:'duplicate'}))}).passed,false,'duplicate witness keys cannot substitute for missing coverage');
assert.equal(sourceOpeningsVerdict({...valid,scan:{...valid.scan,holeCells:2,samples:[sample,sample]},samples:[sample,sample]}).passed,false,'duplicate raster positions cannot replace missing cells');
const stockIndex=valid.guards.findIndex(g=>g.measurements[0].point);
for(const point of [undefined,null,[NaN,1.975,0],[0,100,0],[50,1.975,50]]){
 const altered=structuredClone(valid);altered.guards[stockIndex].measurements[1].point=point;
 assert.equal(sourceOpeningsVerdict(altered).passed,false,'passed flags cannot replace finite source-bound ray evidence');
}
const absentAir=structuredClone(valid);delete absentAir.guards[0].measurements[0].point;
assert.equal(sourceOpeningsVerdict(absentAir).passed,false,'air needs an explicit no-hit result');
assert.equal(AFT_SOURCE_SLOTS.length,16);
for(const slot of AFT_SOURCE_SLOTS){
 assert.equal(approvedOpeningRegion(id,slot.x,slot.z),true);
 assert.equal(approvedOpeningRegion(id,slot.x+slot.width/2+.001,slot.z),false,'finite surrounding plate is outside the approved air');
}
assert.equal(approvedOpeningRegion('warrior_tes_h',1.8,0),true);
for(const [x,z]of[[0,0],[1.8,3],[2,0]])assert.equal(approvedOpeningRegion('warrior_tes_h',x,z),false,'hull, ends and outer armor stay unexempted');
console.log('source-openings-policy: exact raster/source binding, bounded exterior air, required stock and negative controls pass');

// Actual corrected bow raster, kept distinct from the historical 20-cell failure.
// The corrected bow raster as the page reads it: exactly the pinned hull-frame lattice cells (tools/contig-grid.mjs),
// framed by the plan AABB the pre-227 pin was measured on (its page frame minus the two-cell margin).
const BARAK_PINNED_AABB={minX:-1.8613799629211424,maxX:1.8613799629211424,minZ:-4.101280212402344,maxZ:4.785499982833862};
const barakScan=latticeCellScan(BARAK_OPENING_CELLS,{aabb:BARAK_PINNED_AABB});
const barakConfig=structuredClone(BARAK_SOURCE_CONFIGURATION);
const barakGuards=sourceOpeningWitnesses('merkava4_barak').map(w=>({key:w.key,passed:true,
 measurements:['source','native'].map(owner=>({owner,passed:true,mesh:w.expect==='air'?null:'measured-stock',
 point:w.expect==='air'?null:w.origin.map((v,i)=>i===w.axis?w.value:v)}))}));
const barak={id:'merkava4_barak',configuration:barakConfig,
 sourceReceipt:{id:'merkava4_barak',...barakConfig.source,verified:true},scan:barakScan,
 samples:barakScan.samples.map(sample=>({...sample,sourceAir:true,nativeAir:true})),guards:barakGuards};
assert.equal(sourceOpeningsVerdict(barak).passed,true,'all actual source-air cells with finite surrounding stock');
// The 226 class: an add-on that only moves the AABB re-framed the pre-227 pin out of validity (on main 16aeab482 the
// bow end sits 2 cm further forward). The lattice pin holds at every reach on both axes.
for(const axis of ['maxX','maxZ'])for(const reach of [.004,.017,.02,.031,.046,.097]){
 const grown=latticeCellScan(BARAK_OPENING_CELLS,{aabb:{...BARAK_PINNED_AABB,[axis]:BARAK_PINNED_AABB[axis]+reach}});
 assert.equal(sourceOpeningsVerdict({...barak,scan:grown,samples:grown.samples.map(s=>({...s,sourceAir:true,nativeAir:true}))}).passed,true,
  `an add-on ${reach} m past ${axis} keeps the approved bow opening`);
}
for(const field of ['sourceAir','nativeAir']){
 const bad=structuredClone(barak);bad.samples[0][field]=false;
 assert.equal(sourceOpeningsVerdict(bad).passed,false,'source-filled or native-filled sample cannot pass');
}
for(const mutate of [
 b=>{b.configuration.source.sha256='0'.repeat(64);b.sourceReceipt.sha256='0'.repeat(64)},
 b=>{b.configuration.originalSha256='0'.repeat(64)},
 b=>{b.configuration.registration.scale=1},
 b=>{b.configuration.registration.translation[1]+=.01},
 b=>{b.scan.bounds.z1+=.001},
 b=>{b.scan.gridW++},
 b=>{for(const s of [...b.scan.samples,...b.samples])s.z-=.06;b.scan.bounds.z0-=.06;b.scan.bounds.z1-=.06},
 b=>{b.scan.holeCells--;b.scan.samples.pop();b.samples.pop()},
 b=>{b.scan.holeCells++;b.scan.samples.push({...b.scan.samples[0],gx:23});b.samples.push({...b.samples[0],gx:23})},
 b=>{b.guards=b.guards.slice(1)},
 b=>{b.guards[0].measurements[1].point[1]-=.405},
 b=>{b.guards[0].measurements[1].point=null},
 b=>{b.guards.find(g=>g.key==='right-mount-corner').measurements[1].point[0]+=.01},
 b=>{b.guards.find(g=>g.key==='right-strap-aperture').measurements[1].point=[.6,.825,3.95]},
]){const bad=structuredClone(barak);mutate(bad);assert.equal(sourceOpeningsVerdict(bad).passed,false,'changed source, recipe, raster or receiving stock is not approved');}
assert.equal(approvedOpeningRegion('merkava4_barak',.6,3.888),false,'real source strap is not part of an air rectangle');
assert.equal(approvedOpeningRegion('merkava4_barak',0,3.2),false,'primary hull cannot become approved exterior air');
