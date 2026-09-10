import assert from 'node:assert/strict';
import {carrierWidthAt,splitCarrierSections,validateCarrierSections} from './trackCarrierSections.ts';
import {KIT} from './tankFactoryCore.ts';
const stations=[{z:-2.4,widthM:.42},{z:-2.3,widthM:.486738}];
validateCarrierSections(stations,.486738);
assert.equal(carrierWidthAt(-3,stations),.42);
assert.equal(carrierWidthAt(-1.78,stations),.486738);
assert.ok(Math.abs(carrierWidthAt(-2.35,stations)-.453369)<1e-12);
const points=[[-3,1],[3,1],[3,0],[-3,0]];
splitCarrierSections(points,stations);
assert.equal(points.length,8);
assert.deepEqual(points,[[-3,1],[-2.4,1],[-2.3,1],[3,1],[3,0],[-2.3,0],[-2.4,0],[-3,0]]);
const g=KIT.trackBandGeo(points,.486738,.09,.64,stations);
try {
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++) {
    if(p.getZ(i)<-2.42)assert.ok(Math.abs(p.getX(i))<=.210001,'Real end stock clears the tooth lane');
    if(p.getZ(i)>-2.2)assert.ok(Math.abs(Math.abs(p.getX(i))-.243369)<1e-6,'Real support stock stays full-width');
  }
  // Every native triangle edge is paired after spatial welding, including
  // the tapered lateral walls; narrowing must not simply delete side faces.
  const edges=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e6)).join(',');
  for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++) {
    const a=key(i+j),b=key(i+(j+1)%3),k=[a,b].sort().join('/');
    const row=edges.get(k)??[0,0];row[0]++;row[1]+=a<b?1:-1;edges.set(k,row);
  }
  for(const row of edges.values())assert.deepEqual(row,[2,0]);
}finally{g.dispose();}
for(const bad of [[],[{z:0,widthM:.4}],stations.toReversed(),[{z:0,widthM:.5},{z:1,widthM:.4}],
  [{z:NaN,widthM:.4},{z:1,widthM:.4}],[{z:0,widthM:0},{z:1,widthM:.4}]])
  assert.throws(()=>validateCarrierSections(bad,.486738));
console.log('trackCarrierSections: finite tapered stock, full roller support, closed edges and six negative controls PASS');
