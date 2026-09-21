import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {enableCombatAnatomyMeasurementMode} from '../src/vehicles/combatAnatomyMeasurementMode.ts';
import {COMBAT_ANATOMY_CALIBRATIONS} from '../src/vehicles/combatAnatomyCalibrations.ts';
enableCombatAnatomyMeasurementMode();
const {createTank}=await import('../src/vehicles/tankFactory.ts');
const {TANK_SPECS}=await import('../src/vehicles/specs.ts');
const {captureArieteC2Collision,arieteC2StockCells}=await import('./ariete-c2-collision.mjs');
const {convexStockCell}=await import('./chieftain10-collision.mjs');
const {finalizeCombatAnatomy}=await import('../src/vehicles/combatAnatomy.ts');
const {traceTank,tankPoseFromState}=await import('../src/sim/armor.ts');
const V=p=>new T.Vector3(...p);
const digest=x=>createHash('sha256').update(x).digest('hex');
function snapshot(root){
  const h=createHash('sha256');root.updateMatrixWorld(true);
  root.traverse(o=>{
    h.update(JSON.stringify([o.name,o.type,o.visible,o.matrix.toArray(),o.matrixWorld.toArray()]));
    for(const[name,a]of Object.entries(o.geometry?.attributes??{}))h.update(name).update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
    for(const a of [o.geometry?.index,o.instanceMatrix,o.instanceColor])if(a)h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
    if(o.material)h.update(JSON.stringify((Array.isArray(o.material)?o.material:[o.material]).map(m=>[m.name,m.color?.getHex(),m.roughness,m.metalness,m.side])));
  });return h.digest('hex');
}
function interval(cell,from,to){
  let enter=0,leave=1;
  for(const face of cell.faces){
    const[a,b,c]=face.map(i=>V(cell.vertices[i])),n=b.sub(a).cross(c.sub(a)).normalize();
    assert(n.dot(V(cell.interiorPoint).sub(a))<1e-7,'closed convex cell has outward normals');
    const first=n.dot(from.clone().sub(a)),last=n.dot(to.clone().sub(a));
    if(first>1e-8&&last>1e-8)return null;
    if(first>0&&last<=0)enter=Math.max(enter,first/(first-last));
    if(first<=0&&last>0)leave=Math.min(leave,first/(first-last));
    if(enter>leave+1e-10)return null;
  }return[enter,leave];
}
function merged(intervals){
  const out=[];for(const span of intervals.sort((a,b)=>a[0]-b[0])){
    const last=out.at(-1);if(last&&span[0]<=last[1]+1e-9)last[1]=Math.max(last[1],span[1]);else out.push([...span]);
  }return out;
}
function meshIntervals(mesh,origin,target){
  const length=origin.distanceTo(target),hits=new T.Raycaster(origin,target.clone().sub(origin).normalize(),0,length)
    .intersectObject(mesh).map(h=>h.distance).filter((v,i,a)=>!i||v-a[i-1]>1e-8);
  assert.equal(hits.length%2,0,'actual emitted stock has paired intersections');
  return Array.from({length:hits.length/2},(_,i)=>[hits[i*2]/length,hits[i*2+1]/length]);
}
function stockRays(stocks,cells){
  const material=new T.MeshBasicMaterial({side:T.DoubleSide});let count=0;
  try{for(const stock of stocks){
    const own=cells.filter(c=>c.sourceStock===stock.name);assert(own.length,'missing closed primary stock');
    const mesh=new T.Mesh(stock.geometry,material);mesh.updateMatrixWorld(true);
    const box=stock.geometry.boundingBox,min=box.min.toArray(),max=box.max.toArray();
    for(let axis=0;axis<3;axis++)for(let a=0;a<7;a++)for(let b=0;b<5;b++){
      const cross=[0,1,2].filter(i=>i!==axis),from=min.map((v,i)=>(v+max[i])/2);from[axis]=min[axis]-.1;
      from[cross[0]]=min[cross[0]]+(max[cross[0]]-min[cross[0]])*(a+.371)/7;
      from[cross[1]]=min[cross[1]]+(max[cross[1]]-min[cross[1]])*(b+.613)/5;
      const to=[...from];to[axis]=max[axis]+.1;const origin=V(from),target=V(to),length=origin.distanceTo(target);
      const expected=meshIntervals(mesh,origin,target),actual=merged(own.map(c=>interval(c,origin,target)).filter(Boolean));
      assert.equal(actual.length,expected.length,`${stock.name}: occupied intervals`);
      for(let i=0;i<actual.length;i++)for(let j=0;j<2;j++)assert(Math.abs(actual[i][j]-expected[i][j])*length<5e-7,`${stock.name}: finite stock interval matches actual mesh`);
      count++;
    }
  }}finally{material.dispose();}return count;
}
const occupied=(cells,a,b)=>cells.some(c=>interval(c,V(a),V(b)));
function realAir(cells){
  for(const side of [-1,1]){
    assert(!occupied(cells,[side*.955,1.12,3.18],[side*.982,1.12,3.18]),'wider-shoe end-wrap relief stays real air');
    assert(!occupied(cells,[side*1.668,1.19,-1.40],[side*1.683,1.19,-1.40]),'narrow carrier keeps inner shoe corridor open');
    assert(occupied(cells,[side*.90,1.12,3.18],[side*.96,1.12,3.18]),'retreated tub still has a finite receiving wall');
    assert(occupied(cells,[side*1.69,1.19,-1.40],[side*1.72,1.19,-1.40]),'real outer carrier is still present');
  }
  assert(!occupied(cells,[0,1.40,.367392],[0,1.48,.367392]),'bearing well is not a convex cap');
  assert(occupied(cells,[.80,1.37,.367392],[.80,1.45,.367392]),'closed bearing annulus still receives hits');
}
function runtimeRays(captured){
  const spec=JSON.parse(JSON.stringify(TANK_SPECS.ariete_c2_x));
  const calibration={...COMBAT_ANATOMY_CALIBRATIONS.ariete_c2_x,hullCollision:captured.hullCollision};
  finalizeCombatAnatomy(spec,calibration);let count=0;
  const material=new T.MeshBasicMaterial({side:T.DoubleSide});
  const meshes=captured.stocks.map(s=>new T.Mesh(s.geometry,material));meshes.forEach(m=>m.updateMatrixWorld(true));
  try{for(const yaw of [0,.73,-1.2])for(const side of [-1,1])for(const[a,b]of [
    [[side*1.8,1.12,3.18],[side*.90,1.12,3.18]],
    [[side*1.75,1.19,-1.4],[side*1.66,1.19,-1.4]],
  ]){
    const from=V(a),to=V(b),native=new T.Raycaster(from,to.clone().sub(from).normalize(),0,from.distanceTo(to)).intersectObjects(meshes);
    assert(native.length,'measured receiving surface remains');
    const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),origin=from.clone().applyQuaternion(rotation),target=to.clone().applyQuaternion(rotation);
    const pose=tankPoseFromState({pos:new T.Vector3(),yaw,visualPitch:0,visualRoll:0,turretYaw:.4,gunPitch:0});
    const hits=traceTank(origin,target,pose,spec.armor).filter(h=>h.kind==='plate'&&h.plate.kind==='main');
    assert(hits.length,'runtime sees the actual receiver');
    assert(hits[0].point.distanceTo(native[0].point.clone().applyQuaternion(rotation))<1e-6,'actual armor first hit follows retreated native wall');count++;
  }}finally{material.dispose();}return count;
}
const results=[];
for(const quality of ['high','low']){
  const options={quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242};
  const before=createTank('ariete_c2_x',null,options),beforeHash=snapshot(before.root);before.dispose();
  const captured=captureArieteC2Collision(()=>createTank('ariete_c2_x',null,options));
  try{
    assert.equal(snapshot(captured.tank.root),beforeHash,'offline stock capture preserves scene geometry/material/rig exactly');
    const cells=captured.hullCollision;realAir(cells);const rays=stockRays(captured.stocks,cells),runtime=runtimeRays(captured);
    if(!process.argv.includes('--producer-only'))assert.deepEqual(
      COMBAT_ANATOMY_CALIBRATIONS.ariete_c2_x.hullCollision,cells,
      'published calibration must contain this actual complete primary-stock union');
    const broad=convexStockCell(cells.flatMap(c=>c.vertices),'wrong-whole-hull');
    assert.throws(()=>realAir([broad]),assert.AssertionError,'whole-hull convexification must fail real air');
    for(const stock of captured.stocks)assert.throws(()=>stockRays([stock],cells.filter(c=>c.sourceStock!==stock.name)),assert.AssertionError,'missing named primary stock fails');
    const moved=cells.map(c=>({...c,vertices:c.vertices.map(v=>[v[0]+.05,v[1],v[2]]),interiorPoint:[c.interiorPoint[0]+.05,...c.interiorPoint.slice(1)]}));
    assert.throws(()=>stockRays(captured.stocks,moved),assert.AssertionError,'shifted stock cannot retain a valid finite receipt');
    assert.throws(()=>arieteC2StockCells({name:'unknown',geometry:new T.BoxGeometry()}),/unexpected primary stock/);
    results.push({quality,sceneSha256:beforeHash,stocks:captured.stocks.length,cells:cells.length,faces:cells.reduce((n,c)=>n+c.faces.length,0),stockRays:rays,runtimeRays:runtime,cellSha256:digest(JSON.stringify(cells)),byStock:captured.stocks.map(s=>({name:s.name,cells:cells.filter(c=>c.sourceStock===s.name).length}))});
  }finally{captured.dispose();}
}
assert.equal(results[0].cellSha256,results[1].cellSha256,'primary damage stock is quality-independent');
console.log('ariete-c2-collision PASS',JSON.stringify(results));
