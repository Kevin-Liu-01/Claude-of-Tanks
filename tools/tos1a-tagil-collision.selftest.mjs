import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {enableCombatAnatomyMeasurementMode} from '../src/vehicles/combatAnatomyMeasurementMode.ts';
import {assertTos1aTagilTurretCells} from '../src/vehicles/tos1aTagilAnatomy.test-support.mjs';
import {COMBAT_ANATOMY_CALIBRATIONS} from '../src/vehicles/combatAnatomyCalibrations.ts';
enableCombatAnatomyMeasurementMode();
const {createTank}=await import('../src/vehicles/tankFactory.ts');
const {TANK_SPECS}=await import('../src/vehicles/specs.ts');
const {registerProfiledBuilders}=await import('../src/vehicles/tankFactoryCore.ts');
const {buildTos1aTagil}=await import('../src/vehicles/profiles/tos1aTagil.ts');
const {captureTos1aTagilCollision,tos1aTagilStockCells}=await import('./tos1a-tagil-collision.mjs');
const {finalizeCombatAnatomy}=await import('../src/vehicles/combatAnatomy.ts');
const {createTankState}=await import('../src/sim/movement.ts');
const {traceTank,tankPoseFromState}=await import('../src/sim/armor.ts');
const V=p=>new T.Vector3(...p),sha=x=>createHash('sha256').update(x).digest('hex');
function snapshot(root){
  const h=createHash('sha256');root.updateMatrixWorld(true);
  root.traverse(o=>{
    h.update(JSON.stringify([o.name,o.type,o.visible,o.matrix.toArray(),o.matrixWorld.toArray()]));
    if(o.geometry){
      for(const name of Object.keys(o.geometry.attributes).sort()){
        const a=o.geometry.attributes[name];h.update(name).update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
      }
      if(o.geometry.index){const a=o.geometry.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
      h.update(JSON.stringify([o.geometry.groups,o.geometry.drawRange]));
    }
    for(const name of ['instanceMatrix','instanceColor'])if(o[name]){
      const a=o[name].array;h.update(name).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
    if(o.material)h.update(JSON.stringify((Array.isArray(o.material)?o.material:[o.material]).map(m=>[m.name,m.color?.getHex(),m.roughness,m.metalness,m.side])));
  });return h.digest('hex');
}
function interval(cell,from,to){
  let enter=0,leave=1;
  for(const face of cell.faces){
    const[a,b,c]=face.map(i=>V(cell.vertices[i])),n=b.sub(a).cross(c.sub(a)).normalize();
    assert(n.dot(V(cell.interiorPoint).sub(a))<1e-7,'actual cell is convex and outward oriented');
    const first=n.dot(from.clone().sub(a)),last=n.dot(to.clone().sub(a));
    if(first>1e-8&&last>1e-8)return null;
    if(first>0&&last<=0)enter=Math.max(enter,first/(first-last));
    if(first<=0&&last>0)leave=Math.min(leave,first/(first-last));
    if(enter>leave+1e-10)return null;
  }return[enter,leave];
}
const occupied=(cells,a,b)=>cells.some(c=>interval(c,V(a),V(b)));
function stockAndAir(cells){
  assert(occupied(cells,[1.5,.3,0],[1.5,0,0]),'actual platform stock receives hits');
  assert(occupied(cells,[0,.15,1.12],[0,-.05,1.12]),'actual yaw bearing receives hits');
  for(const x of [-1.6,1.6])assert(!occupied(cells,[x,0,1.05],[x,0,1.15]),'no invented corner between round bearing and plinth');
  for(const side of [-1,1])assert(!occupied(cells,[side*1.4,.04,.79],[side*1.4,.04,.81]),'air below plinth outside the circular bearing is not convex-filled');
  assert(!occupied(cells,[-1.4,.4,-1.3],[1.4,.4,-1.3]),'space among towers is not a primary shell');
}
function merged(intervals){
  const out=[];for(const span of intervals.sort((a,b)=>a[0]-b[0])){
    const last=out.at(-1);if(last&&span[0]<=last[1]+1e-9)last[1]=Math.max(last[1],span[1]);else out.push([...span]);
  }return out;
}
function exactStockRays(stocks,cells){
  const mat=new T.MeshBasicMaterial({side:T.DoubleSide});let rays=0;
  try{for(const stock of stocks){
    const own=cells.filter(c=>c.sourceStock===stock.name),mesh=new T.Mesh(stock.geometry,mat),box=stock.geometry.boundingBox;
    mesh.updateMatrixWorld(true);const min=box.min.toArray(),max=box.max.toArray();
    for(let axis=0;axis<3;axis++)for(let a=0;a<7;a++)for(let b=0;b<5;b++){
      const cross=[0,1,2].filter(i=>i!==axis),from=min.map((v,i)=>(v+max[i])/2);from[axis]=min[axis]-.1;
      from[cross[0]]=min[cross[0]]+(max[cross[0]]-min[cross[0]])*(a+.371)/7;
      from[cross[1]]=min[cross[1]]+(max[cross[1]]-min[cross[1]])*(b+.613)/5;
      const to=[...from];to[axis]=max[axis]+.1;const origin=V(from),target=V(to),length=target.distanceTo(origin);
      const hits=new T.Raycaster(origin,target.clone().sub(origin).normalize(),0,length).intersectObject(mesh)
        .map(h=>h.distance).filter((v,i,all)=>!i||v-all[i-1]>1e-8);
      assert.equal(hits.length%2,0,'actual source primitive has paired closed-stock crossings');
      const native=[];for(let i=0;i<hits.length;i+=2)native.push([hits[i]/length,hits[i+1]/length]);
      const actual=merged(own.map(c=>interval(c,origin,target)).filter(Boolean));assert.equal(actual.length,native.length);
      for(let i=0;i<actual.length;i++)for(let j=0;j<2;j++)assert(Math.abs(actual[i][j]-native[i][j])*length<2e-7,'cell interval is actual stock, not an aggregate envelope');rays++;
    }
  }}finally{mat.dispose();}return rays;
}
function broadHull(cells){
  const hull=new ConvexHull().setFromPoints(cells.flatMap(c=>c.vertices.map(V))),vertices=[],faces=[];
  for(const face of hull.faces){let edge=face.edge;const ids=[];do{ids.push(vertices.length);vertices.push(edge.head().point.toArray());edge=edge.next;}while(edge!==face.edge);faces.push(ids);}
  const center=vertices.reduce((p,v)=>p.add(V(v)),new T.Vector3()).divideScalar(vertices.length).toArray();
  return{vertices,faces,interiorPoint:center};
}
function calibrated(spec,captured){
  const copy=JSON.parse(JSON.stringify(spec)),points=copy.armor.hullPlates.filter(p=>(p.kind||'main')==='main').flatMap(p=>p.verts);
  const bounds=new T.Box3().setFromPoints(points.map(V));
  const gun=captured.tank.root.userData.combatGeometryParts.filter(p=>p.module==='gun');
  assert.equal(gun.length,1);assert.equal(gun[0].bucket,'turretDetail');assert.equal(gun[0].parent,'turretG');
  assert(Math.abs(gun[0].min[0]-.77)<1e-6&&Math.abs(gun[0].max[1]-.36)<1e-6,'receipt measures the real fixed traverse actuator');
  const calibration={hull:{min:bounds.min.toArray(),max:bounds.max.toArray()},turret:captured.primaryBounds,
    turretCollision:captured.turretCollision,tracks:{},moduleShapes:[{module:'gun',turretLocal:true,parts:gun.map(p=>({min:p.min,max:p.max}))}]};
  finalizeCombatAnatomy(copy,calibration);assertTos1aTagilTurretCells(calibration,copy.armor.collisionShells);
  const module=copy.armor.modules.find(p=>p.module==='gun');assert.deepEqual(module.min,gun[0].min);assert.deepEqual(module.max,gun[0].max);
  return copy;
}
function finalizedNegatives(calibration,shell){
  for(const mutation of [
    c=>c.turret.pop(),
    c=>c.turret.push(structuredClone(c.turret[0])),
    c=>{c.turret[0].sourceStock='optic-case';},
    c=>{c.turret[1].vertices[0][0]+=.04;},
    c=>{c.turret[0].faces[0].constant-=.1;},
    c=>{c.turret[2].faces.pop();},
  ]){
    const broken=structuredClone(shell);mutation(broken);
    assert.throws(()=>assertTos1aTagilTurretCells(calibration,broken),assert.AssertionError,'missing, extra, moved, relabeled or opened stock must fail');
  }
}
function posedDamage(tank,spec){
  const state=createTankState(spec,new T.Vector3(),0),turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');let poses=0;
  for(const pitch of [-5,0,45])for(const yaw of [-90,0,90]){
    state.gunPitch=pitch*Math.PI/180;state.turretYaw=yaw*Math.PI/180;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
    const hits=(frame,a,b)=>traceTank(frame.localToWorld(V(a)),frame.localToWorld(V(b)),tankPoseFromState(state),spec.armor).filter(h=>h.kind==='plate');
    assert(hits(turret,[1.5,.3,0],[1.5,0,0]).some(h=>h.plate.kind==='main'),'runtime damages actual primary platform');
    for(const side of [-1,1])assert(hits(turret,[side*1.63,.85,-1.07],[side*1.63,.85,-1.31]).some(h=>h.plate.name.startsWith('cradle_tower')&&h.plate.moduleLink==='gun'),'finite tower faces damage their supported mechanism');
    assert.equal(hits(turret,[-1.4,.4,-1.3],[1.4,.4,-1.3]).length,0,'no tower-to-tower rectangle');
    assert.equal(hits(gun,[-1.1,-.9,.6],[1.1,-.9,.6]).length,0,'true air beneath pitched launcher');
    for(const [x,y] of [[1.48,0],[-1.48,0],[0,.57],[0,-.57]])assert(hits(gun,[x,y,-1.1],[x,y,-.9]).some(h=>h.plate.name==='launcher_back'),'off-center actual rear stock remains damageable');
    for(const [x,y] of [[1.55,.60],[-1.55,-.60],[1.58,0],[0,.64]])assert.equal(hits(gun,[x,y,-1.04],[x,y,-.96]).length,0,'no damage rectangle beyond the actual35mm chamfered rear sheet');
    if(pitch===45)assert(hits(gun,[-1.55,-.60,-1.1],[-1.55,-.60,-.9]).some(h=>h.plate.name==='cradle_foot_-1_4'),'longer outside-contour continuation correctly reaches the real port foot');poses++;
  }return poses;
}
const results=[];
for(const quality of ['high','low']){
  const options={quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242};
  registerProfiledBuilders({tos1a_tagil:p=>buildTos1aTagil(new Proxy(p,{get(target,method){
    if(method!=='addModuleVisual')return Reflect.get(target,method);
    return(module,bucket,geometry,...args)=>module==='gun'?target.addEquipment(bucket,geometry,...args):target.addModuleVisual(module,bucket,geometry,...args);
  }}))});
  const before=createTank('tos1a_tagil',null,options),beforeHash=snapshot(before.root);before.dispose();
  registerProfiledBuilders({tos1a_tagil:buildTos1aTagil});
  const captured=captureTos1aTagilCollision(()=>createTank('tos1a_tagil',null,options));
  try{
    const after=snapshot(captured.tank.root);assert.equal(after,beforeHash,'gun metadata and offline capture preserve every native buffer/material/transform');
    assert.deepEqual(captured.stocks.map(s=>s.name),['yaw-bearing','load-platform']);
    stockAndAir(captured.turretCollision);const rays=exactStockRays(captured.stocks,captured.turretCollision);
    assert.throws(()=>stockAndAir([broadHull(captured.turretCollision)]),assert.AssertionError,'convex merging the two stocks fills genuine air');
    assert.throws(()=>stockAndAir(captured.turretCollision.filter(c=>c.sourceStock!=='load-platform')),assert.AssertionError,'missing primary platform fails');
    assert.throws(()=>stockAndAir(captured.turretCollision.filter(c=>c.sourceStock!=='yaw-bearing')),assert.AssertionError,'missing yaw bearing fails');
    assert.throws(()=>tos1aTagilStockCells({name:'optic-case',geometry:new T.BoxGeometry()}),/unexpected primary stock/);
    const spec=calibrated(TANK_SPECS.tos1a_tagil,captured),poses=posedDamage(captured.tank,spec);
    finalizedNegatives({turretCollision:captured.turretCollision},spec.armor.collisionShells);
    if(quality==='high'){
      const actual=COMBAT_ANATOMY_CALIBRATIONS.tos1a_tagil;
      assert.deepEqual(actual.turretCollision,captured.turretCollision,'actual generated calibration matches freshly emitted primary stock');
      const published=JSON.parse(JSON.stringify(TANK_SPECS.tos1a_tagil));
      finalizeCombatAnatomy(published,actual);
      assertTos1aTagilTurretCells(actual,published.armor.collisionShells);
      posedDamage(captured.tank,published);
    }
    results.push({quality,sceneSha256:after,stocks:2,cells:captured.turretCollision.length,stockRays:rays,poses,primaryBounds:captured.primaryBounds,cellHash:sha(JSON.stringify(captured.turretCollision))});
  }finally{captured.dispose();}
}
console.log('tos1a-tagil-collision PASS: exact primary stock, real air, seated gun module and unchanged native geometry',JSON.stringify(results));
