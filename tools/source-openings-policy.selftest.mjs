import {BARAK_SOURCE_CONFIGURATION} from './barak-source-openings.mjs';
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

// Actual corrected bow raster, kept distinct from the historical 20-cell failure.
const barakScan={"holeCells":79,"gridW":67,"gridH":153,"bounds":{"x0":-1.9813799629211424,"x1":1.9813799629211424,"z0":-4.221280212402344,"z1":4.905499982833862},"samples":[{"gx":24,"gy":12,"x":-0.5323110348146354,"z":4.159848006098878},{"gx":24,"gy":13,"x":-0.5323110348146354,"z":4.100195847960079},{"gx":24,"gy":14,"x":-0.5323110348146354,"z":4.0405436898212805},{"gx":24,"gy":15,"x":-0.5323110348146354,"z":3.9808915316824818},{"gx":24,"gy":16,"x":-0.5323110348146354,"z":3.921239373543683},{"gx":24,"gy":17,"x":-0.5323110348146354,"z":3.8615872154048843},{"gx":25,"gy":17,"x":-0.4731653642796758,"z":3.8615872154048843},{"gx":26,"gy":17,"x":-0.4140196937447165,"z":3.8615872154048843},{"gx":26,"gy":16,"x":-0.4140196937447165,"z":3.921239373543683},{"gx":26,"gy":15,"x":-0.4140196937447165,"z":3.9808915316824818},{"gx":26,"gy":14,"x":-0.4140196937447165,"z":4.0405436898212805},{"gx":26,"gy":13,"x":-0.4140196937447165,"z":4.100195847960079},{"gx":26,"gy":12,"x":-0.4140196937447165,"z":4.159848006098878},{"gx":27,"gy":12,"x":-0.3548740232097567,"z":4.159848006098878},{"gx":28,"gy":12,"x":-0.29572835267479736,"z":4.159848006098878},{"gx":28,"gy":13,"x":-0.29572835267479736,"z":4.100195847960079},{"gx":28,"gy":14,"x":-0.29572835267479736,"z":4.0405436898212805},{"gx":28,"gy":15,"x":-0.29572835267479736,"z":3.9808915316824818},{"gx":28,"gy":16,"x":-0.29572835267479736,"z":3.921239373543683},{"gx":28,"gy":17,"x":-0.29572835267479736,"z":3.8615872154048843},{"gx":29,"gy":17,"x":-0.2365826821398378,"z":3.8615872154048843},{"gx":30,"gy":17,"x":-0.17743701160487846,"z":3.8615872154048843},{"gx":30,"gy":16,"x":-0.17743701160487846,"z":3.921239373543683},{"gx":30,"gy":15,"x":-0.17743701160487846,"z":3.9808915316824818},{"gx":30,"gy":14,"x":-0.17743701160487846,"z":4.0405436898212805},{"gx":30,"gy":13,"x":-0.17743701160487846,"z":4.100195847960079},{"gx":30,"gy":12,"x":-0.17743701160487846,"z":4.159848006098878},{"gx":29,"gy":16,"x":-0.2365826821398378,"z":3.921239373543683},{"gx":29,"gy":15,"x":-0.2365826821398378,"z":3.9808915316824818},{"gx":29,"gy":14,"x":-0.2365826821398378,"z":4.0405436898212805},{"gx":29,"gy":13,"x":-0.2365826821398378,"z":4.100195847960079},{"gx":29,"gy":12,"x":-0.2365826821398378,"z":4.159848006098878},{"gx":27,"gy":13,"x":-0.3548740232097567,"z":4.100195847960079},{"gx":27,"gy":14,"x":-0.3548740232097567,"z":4.0405436898212805},{"gx":27,"gy":15,"x":-0.3548740232097567,"z":3.9808915316824818},{"gx":27,"gy":16,"x":-0.3548740232097567,"z":3.921239373543683},{"gx":27,"gy":17,"x":-0.3548740232097567,"z":3.8615872154048843},{"gx":25,"gy":16,"x":-0.4731653642796758,"z":3.921239373543683},{"gx":25,"gy":15,"x":-0.4731653642796758,"z":3.9808915316824818},{"gx":25,"gy":14,"x":-0.4731653642796758,"z":4.0405436898212805},{"gx":25,"gy":13,"x":-0.4731653642796758,"z":4.100195847960079},{"gx":25,"gy":12,"x":-0.4731653642796758,"z":4.159848006098878},{"gx":37,"gy":12,"x":0.2365826821398378,"z":4.159848006098878},{"gx":37,"gy":13,"x":0.2365826821398378,"z":4.100195847960079},{"gx":37,"gy":14,"x":0.2365826821398378,"z":4.0405436898212805},{"gx":37,"gy":15,"x":0.2365826821398378,"z":3.9808915316824818},{"gx":37,"gy":16,"x":0.2365826821398378,"z":3.921239373543683},{"gx":37,"gy":17,"x":0.2365826821398378,"z":3.8615872154048843},{"gx":36,"gy":17,"x":0.17743701160487868,"z":3.8615872154048843},{"gx":38,"gy":17,"x":0.29572835267479736,"z":3.8615872154048843},{"gx":39,"gy":17,"x":0.3548740232097565,"z":3.8615872154048843},{"gx":39,"gy":16,"x":0.3548740232097565,"z":3.921239373543683},{"gx":39,"gy":15,"x":0.3548740232097565,"z":3.9808915316824818},{"gx":39,"gy":14,"x":0.3548740232097565,"z":4.0405436898212805},{"gx":39,"gy":13,"x":0.3548740232097565,"z":4.100195847960079},{"gx":40,"gy":13,"x":0.4140196937447165,"z":4.100195847960079},{"gx":41,"gy":13,"x":0.47316536427967604,"z":4.100195847960079},{"gx":41,"gy":12,"x":0.47316536427967604,"z":4.159848006098878},{"gx":41,"gy":14,"x":0.47316536427967604,"z":4.0405436898212805},{"gx":41,"gy":15,"x":0.47316536427967604,"z":3.9808915316824818},{"gx":41,"gy":16,"x":0.47316536427967604,"z":3.921239373543683},{"gx":41,"gy":17,"x":0.47316536427967604,"z":3.8615872154048843},{"gx":42,"gy":17,"x":0.5323110348146352,"z":3.8615872154048843},{"gx":42,"gy":16,"x":0.5323110348146352,"z":3.921239373543683},{"gx":42,"gy":15,"x":0.5323110348146352,"z":3.9808915316824818},{"gx":42,"gy":14,"x":0.5323110348146352,"z":4.0405436898212805},{"gx":42,"gy":13,"x":0.5323110348146352,"z":4.100195847960079},{"gx":40,"gy":14,"x":0.4140196937447165,"z":4.0405436898212805},{"gx":40,"gy":15,"x":0.4140196937447165,"z":3.9808915316824818},{"gx":40,"gy":16,"x":0.4140196937447165,"z":3.921239373543683},{"gx":40,"gy":17,"x":0.4140196937447165,"z":3.8615872154048843},{"gx":36,"gy":16,"x":0.17743701160487868,"z":3.921239373543683},{"gx":38,"gy":16,"x":0.29572835267479736,"z":3.921239373543683},{"gx":36,"gy":15,"x":0.17743701160487868,"z":3.9808915316824818},{"gx":38,"gy":15,"x":0.29572835267479736,"z":3.9808915316824818},{"gx":36,"gy":14,"x":0.17743701160487868,"z":4.0405436898212805},{"gx":38,"gy":14,"x":0.29572835267479736,"z":4.0405436898212805},{"gx":36,"gy":13,"x":0.17743701160487868,"z":4.100195847960079},{"gx":38,"gy":13,"x":0.29572835267479736,"z":4.100195847960079}]};
const barakConfig=structuredClone(BARAK_SOURCE_CONFIGURATION);
const barakGuards=sourceOpeningWitnesses('merkava4_barak').map(w=>({key:w.key,passed:true,
 measurements:['source','native'].map(owner=>({owner,passed:true,mesh:w.expect==='air'?null:'measured-stock',
 point:w.expect==='air'?null:w.origin.map((v,i)=>i===w.axis?w.value:v)}))}));
const barak={id:'merkava4_barak',configuration:barakConfig,
 sourceReceipt:{id:'merkava4_barak',...barakConfig.source,verified:true},scan:barakScan,
 samples:barakScan.samples.map(sample=>({...sample,sourceAir:true,nativeAir:true})),guards:barakGuards};
assert.equal(sourceOpeningsVerdict(barak).passed,true,'all actual source-air cells with finite surrounding stock');
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
