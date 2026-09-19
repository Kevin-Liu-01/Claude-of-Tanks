import assert from 'node:assert/strict';
import {sourceOpeningsVerdict,approvedOpeningRegion,AFT_SOURCE_SLOTS} from './source-openings-policy.mjs';
import {sourceOpeningWitnesses} from './source-opening-witnesses.mjs';
const id='aft10_x',source={path:'source.glb',sha256:'a'.repeat(64)},configuration={id,source},sourceReceipt={id,...source,verified:true};
const sample={x:-.46435,z:-3.55565,gx:1,gy:2,sourceAir:true,nativeAir:true};
const valid={id,configuration,sourceReceipt,scan:{holeCells:1,gridW:4,gridH:4,bounds:{x0:sample.x-.015,x1:sample.x+.025,z0:sample.z-.015,z1:sample.z+.025},samples:[{...sample}]},samples:[{...sample}],guards:sourceOpeningWitnesses(id).map(w=>{const point=w.expect==='air'?null:w.origin.map((v,i)=>i===w.axis?w.value:v);return {key:w.key,passed:true,measurements:['source','native'].map(owner=>({owner,passed:true,point,mesh:point?'fixture':null}))};})};
assert.equal(sourceOpeningsVerdict(valid).passed,true);
for(const key of ['sourceAir','nativeAir'])assert.equal(sourceOpeningsVerdict({...valid,samples:[{...sample,[key]:false}]}).passed,false,'occupied source or native air cannot pass');
for(const change of [{x:0},{z:0},{gx:13},{sourceAir:undefined}])assert.equal(sourceOpeningsVerdict({...valid,samples:[{...sample,...change}]}).passed,false);
for(const change of [{id:'fv510_milan_x'},{sha256:'b'.repeat(64)},{path:'other.glb'},{verified:false}])assert.equal(sourceOpeningsVerdict({...valid,sourceReceipt:{...sourceReceipt,...change}}).passed,false);
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
assert.equal(approvedOpeningRegion('fv510_milan_x',1.8,0),true);
for(const [x,z]of[[0,0],[1.8,3],[2,0]])assert.equal(approvedOpeningRegion('fv510_milan_x',x,z),false,'hull, ends and outer armor stay unexempted');
console.log('source-openings-policy: exact raster/source binding, bounded exterior air, required stock and negative controls pass');
