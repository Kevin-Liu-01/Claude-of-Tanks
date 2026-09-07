import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {enableCombatAnatomyMeasurementMode} from '../src/vehicles/combatAnatomyMeasurementMode.ts';
enableCombatAnatomyMeasurementMode();
const {createTank}=await import('../src/vehicles/tankFactory.ts');
const {captureChieftain10Collision,chieftain10StockCells}=await import('./chieftain10-collision.mjs');
const {sectionSolid}=await import('../src/vehicles/profiles/sectionSolid.ts');
const point=p=>new THREE.Vector3(...p);
const PIVOT=point([0,1.512956,.595241]);

function snapshot(root) {
  const h=createHash('sha256');root.updateMatrixWorld(true);
  root.traverse(o=>{
    h.update(JSON.stringify([o.name,o.type,o.visible,o.matrix.toArray(),o.matrixWorld.toArray()]));
    if(o.geometry){
      for(const name of Object.keys(o.geometry.attributes).sort()){
        const a=o.geometry.attributes[name];h.update(name);
        h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
      }
      if(o.geometry.index){const a=o.geometry.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
      h.update(JSON.stringify([o.geometry.groups,o.geometry.drawRange]));
    }
    for(const name of ['instanceMatrix','instanceColor'])if(o[name]){
      const a=o[name].array;h.update(name).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
  });return h.digest('hex');
}
function interval(cell,from,to) {
  let enter=0,leave=1;
  for(const face of cell.faces){
    const[a,b,c]=face.map(i=>point(cell.vertices[i]));
    const n=b.sub(a).cross(c.sub(a)).normalize();
    assert.ok(n.dot(point(cell.interiorPoint).sub(a))<1e-7,'explicit interior point stays inside every convex face');
    const first=n.dot(from.clone().sub(a)),last=n.dot(to.clone().sub(a));
    if(first>1e-8&&last>1e-8)return null;
    if(first>0&&last<=0)enter=Math.max(enter,first/(first-last));
    if(first<=0&&last>0)leave=Math.min(leave,first/(first-last));
    if(enter>leave+1e-10)return null;
  }
  return[enter,leave];
}
const occupied=(cells,from,to)=>cells.some(c=>interval(c,from,to));
function sourceAir(cells) {
  // The central X0/Y2.1 witness is independently open in the COMPLETE
  // source. Adjacent/lower probes assert only permanent-turret clearance:
  // the separate pitched gun can legitimately occupy part of that region.
  for(const x of [-.1,0,.1])for(const y of [1.99,2.05,2.1])assert.equal(occupied(cells,
    point([x,y,3]).sub(PIVOT),point([x,y,1.82]).sub(PIVOT)),false,
  'the permanent turret stocks do not bridge the gun-root channel');
  assert.equal(occupied(cells,point([.4,.81,.3]).sub(PIVOT),point([.4,.69,.3]).sub(PIVOT)),false,
    'equipment basket air is not added to structural collision');
  assert.ok(occupied(cells,point([0,2.1,1.80]).sub(PIVOT),point([0,2.1,1.78]).sub(PIVOT)),
    'actual fixed rear stock at source Z1.796146 remains protected');
}
function stillbrewContacts(stocks,cells) {
  let count=0;
  for(const stock of stocks.filter(s=>['port','starboard','spine'].includes(s.name))){
    const p=stock.geometry.attributes.position,index=stock.geometry.index;
    for(let i=0;i<(index?.count??p.count);i+=3){
      const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k));
      const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
      if(normal.z<.3)continue;
      const center=vertices.reduce((sum,v)=>sum.add(v),new THREE.Vector3()).multiplyScalar(1/3);
      assert.ok(occupied(cells,center.clone().addScaledVector(normal,.02),center.clone().addScaledVector(normal,-.02)),
        `${stock.name}/${i}: actual 40mm front-face contact is retained`);
      count++;
    }
  }
  assert.equal(count,58,'the same complete three-stock front-facing triangle census');
  return count;
}
function mergeIntervals(intervals) {
  const out=[];
  for(const span of intervals.sort((a,b)=>a[0]-b[0])){
    const previous=out.at(-1);
    if(previous&&span[0]<=previous[1]+1e-9)previous[1]=Math.max(previous[1],span[1]);
    else out.push([...span]);
  }
  return out;
}
function stockEquivalence(stocks,cells) {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let rays=0;
  try {
    for(const stock of stocks){
      const own=cells.filter(c=>c.sourceStock===stock.name),mesh=new THREE.Mesh(stock.geometry,material);
      mesh.updateMatrixWorld(true);stock.geometry.computeBoundingBox();
      const box=stock.geometry.boundingBox,min=box.min.toArray(),max=box.max.toArray();
      for(let axis=0;axis<3;axis++)for(let a=0;a<7;a++)for(let b=0;b<5;b++){
        const cross=[0,1,2].filter(i=>i!==axis),from=min.map((v,i)=>(v+max[i])/2);
        from[axis]=min[axis]-.1;
        from[cross[0]]=min[cross[0]]+(max[cross[0]]-min[cross[0]])*(a+.371)/7;
        from[cross[1]]=min[cross[1]]+(max[cross[1]]-min[cross[1]])*(b+.613)/5;
        const to=[...from];to[axis]=max[axis]+.1;
        const origin=point(from),target=point(to),length=target.distanceTo(origin);
        const ray=new THREE.Raycaster(origin,target.clone().sub(origin).normalize(),0,length);
        const hits=ray.intersectObject(mesh).map(h=>h.distance).filter((v,i,all)=>!i||v-all[i-1]>1e-8);
        assert.equal(hits.length%2,0,`${stock.name}: original closed stock has paired crossings`);
        const native=[];for(let i=0;i<hits.length;i+=2)native.push([hits[i]/length,hits[i+1]/length]);
        const actual=mergeIntervals(own.map(c=>interval(c,origin,target)).filter(Boolean));
        assert.equal(actual.length,native.length,`${stock.name}: per-stock occupied/air interval count`);
        for(let i=0;i<actual.length;i++)for(let j=0;j<2;j++)assert.ok(Math.abs(actual[i][j]-native[i][j])*length<2e-7,
          `${stock.name}: exact authored surface, not only aggregate volume, is retained`);
        rays++;
      }
    }
  }finally{material.dispose();}
  return rays;
}
function syntheticConcavity() {
  for(const[name,ring,air]of [
    ['star-L',[[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]],[1.5,1.5]],
    ['non-star-U',[[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3]],[1.5,2]],
  ]){
    const geometry=sectionSolid([{z:0,ring},{z:1,ring}]);
    try {
      const cells=chieftain10StockCells({name,geometry});
      assert.ok(occupied(cells,point([.5,.5,-.1]),point([.5,.5,1.1])));
      assert.equal(occupied(cells,point([...air,-.1]),point([...air,1.1])),false,
        `${name}: exact partition/coalescence cannot fill the original concavity`);
      assert.ok(cells.length>1,'a genuinely concave stock is not replaced by one hull');
      const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
      const signed=cells.reduce((sum,cell)=>sum+cell.faces.reduce((n,face)=>{
        const[a,b,c]=face.map(i=>point(cell.vertices[i]).sub(point(cell.interiorPoint)));
        return n+a.dot(b.cross(c))/6;
      },0),0);
      assert.ok(Math.abs(signed-area)<1e-10,`${name}: signed occupied volume is unchanged`);
    }finally{geometry.dispose();}
  }
}

syntheticConcavity();
let previousCells;
for(const quality of ['high','low']){
  const options={quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242};
  const before=createTank('chieftain_mk10_x',null,options);let beforeHash;
  try {beforeHash=snapshot(before.root);}finally{before.dispose();}
  const captured=captureChieftain10Collision(()=>createTank('chieftain_mk10_x',null,options));
  try {
    assert.equal(snapshot(captured.tank.root),beforeHash,'offline capture changes no actual visible/hidden buffer, transform or instance');
    const cells=captured.turretCollision;
    console.log(JSON.stringify({quality,constructedCells:cells.length,faces:cells.reduce((n,c)=>n+c.faces.length,0),
      uniqueMillimeterVertices:new Set(cells.flatMap(c=>c.vertices.map(p=>p.map(v=>Math.round(v*1000)).join(',')))).size,
      byStock:captured.stocks.map(s=>({stock:s.name,cells:cells.filter(c=>c.sourceStock===s.name).length}))}));
    assert.ok(cells.length>5,'closed turret stock is present, not an empty-collision workaround');
    sourceAir(cells);const contacts=stillbrewContacts(captured.stocks,cells);
    const stockRays=stockEquivalence(captured.stocks,cells);
    if(previousCells)assert.equal(JSON.stringify(cells),previousCells,'collision has no quality-dependent simplification');
    previousCells=JSON.stringify(cells);
    console.log(JSON.stringify({quality,sceneSha256:beforeHash,stocks:captured.stocks.length,
      cells:cells.length,faces:cells.reduce((n,c)=>n+c.faces.length,0),actualFrontContacts:contacts,stockRays,air:true}));
  }finally{captured.dispose();}
}
console.log('chieftain10-collision: exact stock union,58 front contacts,source air and untouched high/low scene PASS');
