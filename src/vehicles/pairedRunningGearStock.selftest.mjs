import assert from 'node:assert/strict';
import * as T from 'three';
import {pairedRunningGearStock} from './pairedRunningGearStock.ts';

function closed(g) {
  const p=g.attributes.position,ix=g.index,edges=new Map();let volume=0;
  assert.equal(g.attributes.uv.count,p.count);
  for(const attr of Object.values(g.attributes))assert.ok(Array.from(attr.array).every(Number.isFinite));
  const key=v=>v.toArray().map(x=>Math.round(x*1e7)).join(',');
  for(let i=0;i<(ix?.count??p.count);i+=3) {
    const [a,b,c]=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k));
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length()>1e-10,'Non-degenerate stock');
    volume+=a.dot(b.clone().cross(c))/6;
    const keys=[a,b,c].map(key);
    for(let j=0;j<3;j++) {
      const u=keys[j],v=keys[(j+1)%3],id=u<v?u+'/'+v:v+'/'+u;
      const row=edges.get(id)??{count:0,balance:0};row.count++;row.balance+=u<v?1:-1;edges.set(id,row);
    }
  }
  for(const row of edges.values()){assert.equal(row.count,2,'Closed finite edge');assert.equal(row.balance,0,'Consistent winding');}
  assert.ok(volume>0,'Outward material, not inside-out geometry');
}
const options={radiusM:.33617,axialWidthM:.358099,guideGapM:.1,high:true};
// Observe actual indexed-to-flat conversions, not a self-reported receipt.
// Both caller-owned indexed stock and temporary flat copies must be released;
// the three returned buffers remain live until the native owner disposes them.
for(const high of [true,false]) {
  const original=T.BufferGeometry.prototype.toNonIndexed,originalDispose=T.BufferGeometry.prototype.dispose;
  const inputs=[],copies=[],disposed=new Map();
  let stock;
  T.BufferGeometry.prototype.toNonIndexed=function(...args) {
    const row={geometry:this,disposed:0};this.addEventListener('dispose',()=>row.disposed++);inputs.push(row);
    const geometry=original.apply(this,args),copy={geometry,disposed:0};
    geometry.addEventListener('dispose',()=>copy.disposed++);copies.push(copy);return geometry;
  };
  T.BufferGeometry.prototype.dispose=function(...args) {
    disposed.set(this,(disposed.get(this)??0)+1);return originalDispose.apply(this,args);
  };
  try {stock=pairedRunningGearStock({...options,high});}
  finally {T.BufferGeometry.prototype.toNonIndexed=original;T.BufferGeometry.prototype.dispose=originalDispose;}
  assert.equal(inputs.length,6,'Six actual turned primitives entered merging');
  assert.equal(disposed.size,high?36:12,'Six indexed originals/copies plus HIGH fasteners are released');
  for(const count of disposed.values())assert.equal(count,1,'No intermediate is released twice');
  for(const row of [...inputs,...copies])assert.equal(row.disposed,1,'Every temporary buffer disposed exactly once');
  for(const geometry of Object.values(stock).filter(Boolean)) {
    assert.ok(!inputs.some(row=>row.geometry===geometry)&&!copies.some(row=>row.geometry===geometry));
    geometry.dispose();
  }
}
let builds=0,negativeControls=0;
for(const high of [true,false])for(const steel of [true,false])for(const radiusM of [.33617,.303707]) {
  const stock=pairedRunningGearStock({...options,high,steel,radiusM});
  const material=new T.MeshBasicMaterial(),meshes=Object.values(stock).filter(Boolean).map(g=>new T.Mesh(g,material));
  try {
    assert.equal(stock.tire===null,steel);
    for(const mesh of meshes){closed(mesh.geometry);mesh.updateMatrixWorld(true);}
    for(const side of [-1,1]) {
      const ray=new T.Raycaster(new T.Vector3(side*.10,1,0),new T.Vector3(0,-1,0),0,1);
      assert.ok(ray.intersectObjects(meshes,false).length,'Both physical tread halves exist');
    }
    const channel=new T.Raycaster(new T.Vector3(0,.28,.15),new T.Vector3(0,0,-1),0,.30);
    assert.equal(channel.intersectObjects(meshes,false).length,0,'Deep central guide channel is actual air');
    const axle=new T.Raycaster(new T.Vector3(0,.20,0),new T.Vector3(0,-1,0),0,.20);
    assert.ok(axle.intersectObjects(meshes,false).length,'Closed hub connects the two independently closed halves');
    const broken=stock.disc.clone();
    const indices=broken.index?.array??Array.from({length:broken.attributes.position.count},(_,i)=>i);
    broken.setIndex(Array.from(indices).slice(3));assert.throws(()=>closed(broken));broken.dispose();negativeControls++;
    builds++;
  }finally{for(const mesh of meshes)mesh.geometry.dispose();material.dispose();}
}
for(const bad of [{radiusM:NaN},{axialWidthM:0},{guideGapM:1},{high:1},{steel:'yes'}]) {
  assert.throws(()=>pairedRunningGearStock({...options,...bad}),/Invalid paired/);negativeControls++;
}
console.log('pairedRunningGearStock:',JSON.stringify({builds,negativeControls,closedStock:true,realGuideChannel:true}));
