import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT,registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildT14X} from './t14X.ts';
import {auditTankWheelQuality} from '../wheelQuality.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {auditVisibleReturnRollerContact} from '../returnRollerContactTest.mjs';
import {matrix,finiteClearance,continuousShoeClearance,moving} from '../returnRollerPhysicsTest.mjs';

// Exact published 6aa3bb6bf inputs: immutable preservation witness, not a
// freshly blessed candidate snapshot. Four rollers/side is an inferred T14
// layout; this test certifies physical construction, never primary history.
const ORIGINAL={wheelR:.3385,wheelW:.5455,wheelY:.4166,xc:1.343,
 wheelZs:[-2.1577,-1.3711,-.5740,.2150,1.0117,1.8668,2.7725],
 trackW:.550,trackTh:.068,topY:1.085,botY:.072,
 trackShoeDimensions:{padHeight:.018,grouserHeight:.008,webHeight:.012,
 hornHeight:.036,pinRadius:.012,pinCentreY:0},
 sprocket:{z:-2.9680,y:.8107,r:.3075,trackR:.19},
 idler:{z:3.5280,y:.8503,r:.2753,trackR:.185},
 style:'rubber',arms:true,paintedEnds:true,coveredTop:true};
const stats={builds:0,poses:0,negativeControls:0,rows:[]};
// Finite-stock and continuous near/far proof reuses the maintained four-
// Leopard regression's method; no metadata-only roller/support assertion.
const hash=g=>{const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 const a=g.attributes[key];h.update(key);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
 }if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');};
function capture(id,build,quality,old){
 let port,cfg,gear;const emissions=[],original=KIT.buildRunningGear;
 KIT.buildRunningGear=(p,input)=>{
  const {rollers,rollerR,returnRollerWidthM,returnRollerInsetM,returnRollerGeometry,loopPoints,...retained}=input;
  assert.deepEqual(retained,ORIGINAL,'Every pre-existing gear input remains exact');
  if(old)returnRollerGeometry.dispose(); // Inverse control never transfers this unused rotor to KIT.
  cfg=old?retained:input;return gear=original(p,cfg);
 };
 registerProfiledBuilders({[id]:P=>{port=P;build(new Proxy(P,{get(target,key){
  if(!['add','addEquipment','addMudguard'].includes(key))return Reflect.get(target,key);
  return(...args)=>{
   const at=key==='addMudguard'?1:0,g=args[at+1],transform=args.slice(at+2);
   const geometry=KIT.xform(g.clone(),...transform);emissions.push([key,at?args[0]:null,args[at],hash(geometry)]);geometry.dispose();
   return target[key](...args);
  };
 }}));
 if(old){const mounts=P.hullG.getObjectByName('gearReturnRollerSpindles');assert.equal(mounts.count,8);mounts.removeFromParent();mounts.dispose();}
 }});
 try{
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  tank.root.updateMatrixWorld(true);stats.builds++;
  return{tank,port,cfg,gear,emissions,receipt:port.hullG.userData.runningGearReceipts[0],dispose(){tank.dispose();}};
 }finally{KIT.buildRunningGear=original;registerProfiledBuilders({[id]:build});}
}
function body(root){const out=[];root.traverse(o=>{
 if(!o.geometry||! /^(hull|turret|gun)/.test(o.name))return;
 out.push([o.name,hash(o.geometry),o.material.name,o.matrix.elements,o.parent?.name]);
});return out;}
function rollerBounds(c){
 const tire=c.port.hullG.getObjectByName('gearReturnRollerRotors');
 assert.equal(tire.count,8);assert.deepEqual(tire.material,[c.port.mats.rubber,c.port.mats.wheels]);
 assert.equal(tire.visible,true);assert.equal(tire.userData.appearanceRole,undefined,'Composite preserves its distinct material roles');
 assert.equal(c.port.hullG.getObjectByName('gearReturnRollerTires'),undefined);
 assert.equal(c.port.hullG.getObjectByName('gearReturnRollerDiscs'),undefined);
 const bounds=[];
 for(let i=0;i<8;i++){
  const m=matrix(tire,i,c.port.hullG),center=new T.Vector3().setFromMatrixPosition(m),box=new T.Box3();let radius=0;
  for(const mesh of[tire]){const p=mesh.geometry.attributes.position,own=matrix(mesh,i,c.port.hullG);
   for(let j=0;j<p.count;j++){const v=new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(own);box.expandByPoint(v);radius=Math.max(radius,Math.hypot(v.y-center.y,v.z-center.z));}}
  assert.ok(Math.abs(radius-.09)<2e-7,'Actual emitted radius, not entry.r metadata');
  assert.ok(Math.abs(box.max.x-box.min.x-.16)<2e-7);
  assert.ok(Math.abs(Math.abs(center.x)-(c.cfg.xc-.17))<2e-7);
  bounds.push({center,minX:box.min.x,maxX:box.max.x,r:radius});
 }
 assert.equal(bounds.filter(b=>b.center.x<0).length,4);assert.equal(bounds.filter(b=>b.center.x>0).length,4);
 return bounds;
}
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function mounts(c,bounds){
 const skin=new T.Mesh(c.port.hullG.getObjectByName('hull').geometry,material);
 const mesh=c.port.hullG.getObjectByName('gearReturnRollerSpindles');
 assert.equal(mesh.count,8);assert.equal(mesh.geometry.parameters.radiusTop,.026);
 assert.equal(mesh.geometry.parameters.radialSegments,c.port.q?8:4);assert.equal(mesh.geometry.parameters.openEnded,false);
 assert.equal(mesh.material,c.port.mats.wheels);assert.equal(mesh.userData.runningGear,true);
 assert.equal(mesh.parent,c.port.hullG,'Mounts share the roller assembly owner, not a disposable detail LOD');
 for(const [i,b]of bounds.entries()){
  const g=mesh.geometry.clone().applyMatrix4(matrix(mesh,i,c.port.hullG));g.computeBoundingBox();const box=g.boundingBox,side=Math.sign(b.center.x);g.dispose();
  assert.ok(box.min.x<b.center.x&&box.max.x>b.center.x,'Spindle crosses finite hub interior');
  for(const [dy,dz]of[[0,0],[.008,0],[-.008,0],[0,.008],[0,-.008]]){
   const ray=new T.Raycaster(new T.Vector3(side*1.06,b.center.y+dy,b.center.z+dz),new T.Vector3(-side,0,0));
   const hit=ray.intersectObject(skin,false).find(h=>Math.abs(h.point.x)<1.025);
   assert.ok(hit,'Finite old hull receiving face exists');
   assert.ok(side>0?hit.point.x-box.min.x>.035:box.max.x-hit.point.x>.035,'More than 35 mm spindle/hull lap');
  }
 }
}

for(const quality of['high','low']){
 const old=capture('t14_x',buildT14X,quality,true),current=capture('t14_x',buildT14X,quality,false);
 try{
  assert.equal(old.port.hullG.getObjectByName('gearReturnRollerTires'),undefined);
  assert.equal(old.port.hullG.getObjectByName('gearReturnRollerRotors'),undefined);
  assert.deepEqual(current.emissions,old.emissions,'Every old hull/turret/fitting emission remains byte-identical');
  assert.deepEqual(body(current.tank.root),body(old.tank.root),'Actual original structural buffers, materials and owner frames remain exact');
  for(const name of['rig_hull','rig_turret','rig_gun'])assert.deepEqual(current.tank.root.getObjectByName(name).matrixWorld.elements,old.tank.root.getObjectByName(name).matrixWorld.elements);
  for(const key of['wheelZs','wheelR','wheelY','sprocket','idler','botY','trackW','trackTh'])assert.deepEqual(current.receipt[key],old.receipt[key]);
  for(const name of['gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets','gearSuspensionLinks','gearSuspensionJointBosses']){
   const a=current.port.hullG.getObjectByName(name),b=old.port.hullG.getObjectByName(name);
   assert.equal(hash(a.geometry),hash(b.geometry));assert.deepEqual(a.instanceMatrix.array,b.instanceMatrix.array);
  }
  const lower=c=>c.receipt.loopPoints.slice(c.receipt.loopPoints.findIndex(([z])=>z>c.cfg.idler.z+1e-7));
  assert.deepEqual(lower(current),lower(old),'Loaded course and lower end-wheel arcs stay exact');
  for(let i=0;i<current.receipt.loopPoints.length;i++){
   const a=current.receipt.loopPoints[i],b=current.receipt.loopPoints[(i+1)%current.receipt.loopPoints.length];
   assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-7,'No zero-length carrier cell');
  }
  assert.deepEqual(auditTankWheelQuality(current.tank.root).issues,[]);
  const bounds=rollerBounds(current);mounts(current,bounds);
  for(const bound of bounds){
   const band=current.port.hullG.getObjectByName(bound.center.x<0?'gearTrackBandL':'gearTrackBandR');
   const gap=finiteClearance(band,matrix(band,0,current.port.hullG),[bound]);
   assert.ok(gap>=-2e-6&&gap<.0001,'Every real roller, not only one pair, contacts its finite carrier');
  }
  for(const [i,z]of[-1.7644,-.1795,.61335,2.31965].entries()){
   assert.ok(Math.abs(bounds[i*2].center.z-z)<1e-6,'Bilateral physical roller follows inferred source-wheel gap');
  }
  const continuous=continuousShoeClearance(current,bounds),movingResult=moving(current,bounds),clearance=movingResult.minimum;
  assert.deepEqual(movingResult.strokes.map(row=>row.name),['flat','compression','droop','wave']);
  for(const row of movingResult.strokes.filter(row=>row.targetM!==null)){
   assert.ok(Math.abs(row.minimumM-row.targetM)<1e-5&&Math.abs(row.maximumM-row.targetM)<1e-5,
    `${quality}/${row.name}: every real road axle must reach its configured suspension fixture`);
  }
  stats.poses+=movingResult.poses;
  assert.ok(Number.isFinite(clearance)&&clearance<.0001,'Finite roller meets real carrier/web, not a hidden floating marker');
  assert.ok(clearance>=-2e-6,`${quality}: actual near/far band/shoes penetrate rollers by ${-clearance} m`);
  const tire=current.port.hullG.getObjectByName('gearReturnRollerRotors');
  current.gear.resetPose();current.tank.root.updateMatrixWorld(true);
  const rest=tire.instanceMatrix.array.slice();
  current.gear.update(.037,-.053,1/60);current.tank.root.updateMatrixWorld(true);
  assert.notDeepEqual(tire.instanceMatrix.array,rest,'Native rollers actually spin with independent left/right track scroll');
  const spun=rollerBounds(current);
  for(let i=0;i<bounds.length;i++)assert.ok(spun[i].center.distanceTo(bounds[i].center)<1e-6,'Spinning rollers remain on fixed hull axes');
  const bad=bounds.map(b=>({...b,center:b.center.clone().add(new T.Vector3(0,.07,0))}));
  current.gear.resetPose();current.tank.root.updateMatrixWorld(true);
  const band=current.port.hullG.getObjectByName('gearTrackBandL');
  assert.ok(finiteClearance(band,matrix(band,0,current.port.hullG),bad)<-.025,'Raised dummy negative control intersects real track stock');stats.negativeControls++;
  const triangles=name=>{const mesh=current.port.hullG.getObjectByName(name);return(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;};
  const perRollerTriangles=triangles('gearReturnRollerRotors')+triangles('gearReturnRollerSpindles');
  const budget=quality==='high'?160:80;
  assert.equal(perRollerTriangles,budget,'Complete closed rotor plus finite spindle meets unchanged cost budget');
  stats.rows.push({id:'t14_x',quality,rollerInstances:8,minimumRoadWheelClearanceLowerBoundM:movingResult.roadMinimum,minimumTrackClearanceM:clearance,continuousShoeClearanceM:continuous,perRollerTriangles,budget,performance:perRollerTriangles<=budget?'PASS':'FAIL'});
  stats.rows.at(-1).measuredSuspensionStrokes=movingResult.strokes;
  console.log(JSON.stringify(stats.rows.at(-1)));
 }finally{old.dispose();current.dispose();}
 let battle,battleGear;const buildBattleGear=KIT.buildRunningGear;
 KIT.buildRunningGear=(P,cfg)=>battleGear=buildBattleGear(P,cfg);
 try{battle=createTank('t14_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true,camoSeed:4242});stats.builds++;}
 finally{KIT.buildRunningGear=buildBattleGear;}
 const disposal=['gearReturnRollerRotors','gearReturnRollerSpindles'].map(name=>{
  const mesh=battle.root.getObjectByName(name),count={name,geometry:0,instances:0};
  mesh.geometry.addEventListener('dispose',()=>count.geometry++);mesh.addEventListener('dispose',()=>count.instances++);
  return count;
 });
 try{
  if(quality==='high')assert.ok(battle.root.userData.battleDetailGroupCount>0);
  const state=createTankState(getSpec('t14_x'),new T.Vector3(),0);
  for(const distance of[150,300,15])for(const yaw of[0,Math.PI/2,Math.PI]){
   state.turretYaw=yaw;
   battle.syncFromState(state,1/60,distance);
   for(const name of['gearReturnRollerRotors','gearReturnRollerSpindles']){
    const mesh=battle.root.getObjectByName(name);assert.ok(mesh);
    let owner=mesh;while(owner){assert.equal(owner.visible,true,`${name} remains structurally visible at ${distance}m`);owner=owner.parent;}
   }
  }
  state.turretYaw=0;
  const contacts=auditVisibleReturnRollerContact(battle,battleGear,state,{radiusM:.09});
  stats.rows.at(-1).visibleSupport=contacts.map(row=>({distance:row.distance,phases:row.phases,
   maximumGapM:row.maximumVisibleSupportGapM,shoeOnlyMaximumGapM:row.shoeOnlyMaximumGapM,owner:row.worst?.owner}));
  for(const row of contacts){
   assert.equal(row.contact,'PASS',`t14_x/${quality}: actual visible stock gap ${row.maximumVisibleSupportGapM} m exceeds 6 mm at ${row.distance} m`);
   assert.ok(row.eligibility.filter(e=>e.name.startsWith('gearTrackBand')).every(e=>e.drawable&&e.effectiveElements>0&&e.instanceCount===1),
    'Supporting bands retain nonzero real draw ranges at every native shoe LOD');
   if(row.distance<150)assert.ok(row.shoeOnlyMaximumGapM>.006,'Shoe-only negative evidence cannot substitute for the visible supporting band');
  }
 }finally{battle.dispose();}
 for(const count of disposal){
  assert.equal(count.geometry,1,count.name+': owned geometry disposed exactly once');
  assert.equal(count.instances,1,count.name+': owned instance buffer disposed exactly once');
 }
 if(quality==='low'){
  // Same actual native station/course construction with the old eight-sided
  // rotor must still fail the unchanged support limit. No green rebaseline.
  let legacy,legacyGear;const nativeBuild=KIT.buildRunningGear;
  KIT.buildRunningGear=(P,input)=>{
   const {returnRollerGeometry,...cfg}=input;returnRollerGeometry.dispose();
   return legacyGear=nativeBuild(P,cfg);
  };
  try{legacy=createTank('t14_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true,camoSeed:4242});stats.builds++;}
  finally{KIT.buildRunningGear=nativeBuild;}
  try{
   const state=createTankState(getSpec('t14_x'),new T.Vector3(),0);
   const rows=auditVisibleReturnRollerContact(legacy,legacyGear,state,{radiusM:.09});
   for(const row of rows)assert.equal(row.contact,'FAIL','Actual legacy LOW crown remains a failing visible-support control');
   stats.rows.at(-1).legacyLowSupportGapM=rows.map(row=>row.maximumVisibleSupportGapM);
   stats.negativeControls++;
  }finally{legacy.dispose();}
 }
 const control=createTank('t14',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});stats.builds++;
 try{
  const rollers=control.root.getObjectByName('gearReturnRollerTires');assert.equal(rollers.count,8,'Original T14 control remains untouched; not historical count proof');
  const actual=[];for(let i=0;i<rollers.count;i++){const m=new T.Matrix4();rollers.getMatrixAt(i,m);actual.push(new T.Vector3().setFromMatrixPosition(m).toArray());}
  assert.deepEqual(actual,[2.2,.75,-.75,-2.2].flatMap(z=>[[-1.34,1.12,z],[1.34,1.12,z]]).map(p=>p.map(Math.fround)));
 }finally{control.dispose();}
}
material.dispose();
console.log('t14XReturnRollers focused geometry/contact/cost (not full release certification): '+JSON.stringify(stats));
